param(
  [ValidateSet("baseline", "canary-10-0", "canary-10-10", "rollout-25-25", "rollout-50-50", "rollout-100-100", "hard-rollback")]
  [string]$Stage = "canary-10-0",
  [switch]$Apply,
  [string]$ProjectId = "crystal",
  [string]$OutputMarkdownPath = "",
  [string]$OutputJsonPath = "",
  [int]$CacheWaitSeconds = 35,
  [int]$WindowHours = 24,
  [int]$HealthySpotChecks = 0,
  [switch]$ManualSmokePassed,
  [switch]$GuestGatingPassed,
  [switch]$NoRawErrors,
  [switch]$NoP0,
  [switch]$NoP1Systemic
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$repoRoot = Split-Path -Parent $PSScriptRoot
$reportDate = Get-Date -Format "yyyy-MM-dd"
if ([string]::IsNullOrWhiteSpace($OutputMarkdownPath)) {
  $OutputMarkdownPath = "docs/canary-rollout-decision-$reportDate.md"
}
if ([string]::IsNullOrWhiteSpace($OutputJsonPath)) {
  $OutputJsonPath = "docs/canary-rollout-decision-$reportDate.json"
}

$stageTargets = @{
  "baseline"        = @{ signed_in = 0; guest = 0; kill_switch = $false; window_hours = 0; min_requests = 0; label = "Rollback to 0/0 baseline" }
  "canary-10-0"     = @{ signed_in = 10; guest = 0; kill_switch = $false; window_hours = 0; min_requests = 0; label = "Open signed-in canary at 10/0" }
  "canary-10-10"    = @{ signed_in = 10; guest = 10; kill_switch = $false; window_hours = 24; min_requests = 20; label = "Expand canary to 10/10" }
  "rollout-25-25"   = @{ signed_in = 25; guest = 25; kill_switch = $false; window_hours = 24; min_requests = 40; label = "Promote to 25/25" }
  "rollout-50-50"   = @{ signed_in = 50; guest = 50; kill_switch = $false; window_hours = 48; min_requests = 100; label = "Promote to 50/50" }
  "rollout-100-100" = @{ signed_in = 100; guest = 100; kill_switch = $false; window_hours = 72; min_requests = 250; label = "Promote to 100/100" }
  "hard-rollback"   = @{ signed_in = 0; guest = 0; kill_switch = $true; window_hours = 0; min_requests = 0; label = "Hard rollback with kill switch" }
}

function Get-RolloutStageName {
  param([object]$RolloutConfig)

  if ($null -eq $RolloutConfig) {
    return ""
  }

  $signedIn = [int]$RolloutConfig.signed_in_percent
  $guest = [int]$RolloutConfig.guest_percent
  $killSwitch = [bool]$RolloutConfig.kill_switch

  foreach ($entry in $stageTargets.GetEnumerator()) {
    if (
      [int]$entry.Value.signed_in -eq $signedIn -and
      [int]$entry.Value.guest -eq $guest -and
      [bool]$entry.Value.kill_switch -eq $killSwitch
    ) {
      return [string]$entry.Key
    }
  }

  return "custom"
}

function Get-PreviousStageName {
  param([string]$StageName)

  switch ($StageName) {
    "canary-10-0" { return "baseline" }
    "canary-10-10" { return "canary-10-0" }
    "rollout-25-25" { return "canary-10-10" }
    "rollout-50-50" { return "rollout-25-25" }
    "rollout-100-100" { return "rollout-50-50" }
    default { return "" }
  }
}

function Get-ElapsedHoursSinceIso {
  param([string]$IsoTimestamp)

  if ([string]::IsNullOrWhiteSpace($IsoTimestamp)) {
    return $null
  }

  try {
    $parsed = [datetimeoffset]::Parse($IsoTimestamp)
    return [Math]::Round(([datetimeoffset]::UtcNow - $parsed.ToUniversalTime()).TotalHours, 2)
  } catch {
    return $null
  }
}

function Resolve-RepoPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }
  return Join-Path $repoRoot $Path
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }
  return Get-Content $Path -Raw | ConvertFrom-Json
}

function Get-LatestReportPath {
  param([string]$Pattern)
  $match = Get-ChildItem (Join-Path $repoRoot "docs") -Filter $Pattern | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  return $match.FullName
}

function Invoke-NodeJson {
  param([string[]]$Arguments)
  $output = & node @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Node command failed: node $($Arguments -join ' ')"
  }
  return ($output -join "`n" | ConvertFrom-Json)
}

function Get-HealthSnapshot {
  try {
    return Invoke-NodeJson -Arguments @(
      (Join-Path $repoRoot "scripts/appwrite-health-snapshot.mjs"),
      "--project=$ProjectId"
    )
  } catch {
    return [pscustomobject]@{
      fetch_error = ($_ | Out-String).Trim()
    }
  }
}

function Test-Gate {
  param([bool]$Condition)
  if ($Condition) { return "Green" }
  return "Blocked"
}

function To-Bool($Value) {
  return [bool]$Value
}

function Get-SportsAvailable($HealthSnapshot) {
  if ($null -ne $HealthSnapshot.crystalCore.sports) {
    return [bool]$HealthSnapshot.crystalCore.sports.available
  }
  if ($null -ne $HealthSnapshot.crystalCore.catalog.sports) {
    return [bool]$HealthSnapshot.crystalCore.catalog.sports.available
  }
  return $false
}

function Get-SportsConfigured($HealthSnapshot) {
  if ($null -ne $HealthSnapshot.crystalCore.sports) {
    return [bool]$HealthSnapshot.crystalCore.sports.configured
  }
  if ($null -ne $HealthSnapshot.crystalCore.catalog.sports) {
    return [bool]$HealthSnapshot.crystalCore.catalog.sports.provider_configured
  }
  return $false
}

function New-GateResult {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Notes
  )
  return [pscustomobject]@{
    name = $Name
    passed = $Passed
    status = (Test-Gate $Passed)
    notes = $Notes
  }
}

$outputMarkdownFullPath = Resolve-RepoPath $OutputMarkdownPath
$outputJsonFullPath = Resolve-RepoPath $OutputJsonPath
$target = $stageTargets[$Stage]

$phaseCloseoutPath = Get-LatestReportPath -Pattern "phase-a-closeout-*.json"
$domainMatrixPath = Get-LatestReportPath -Pattern "domain-quality-matrix-*.json"
$parityPath = Get-LatestReportPath -Pattern "parity-report-*.json"
$providerFoundationPath = Get-LatestReportPath -Pattern "provider-foundation-report-*.json"

$phaseCloseout = Read-JsonFile -Path $phaseCloseoutPath
$domainMatrix = Read-JsonFile -Path $domainMatrixPath
$parityReport = Read-JsonFile -Path $parityPath
$providerFoundation = Read-JsonFile -Path $providerFoundationPath

$rolloutBefore = Invoke-NodeJson -Arguments @((Join-Path $repoRoot "scripts/runtime-rollout-config.mjs"), "--action", "get", "--projectId", $ProjectId)
$currentRolloutBefore = $rolloutBefore.crystal_core
$currentStageBefore = Get-RolloutStageName -RolloutConfig $currentRolloutBefore
$expectedPreviousStage = Get-PreviousStageName -StageName $Stage
$currentRolloutUpdatedAt = [string]$currentRolloutBefore.updated_at
$elapsedHoursSinceCurrentStage = Get-ElapsedHoursSinceIso -IsoTimestamp $currentRolloutUpdatedAt
$runMetrics = Invoke-NodeJson -Arguments @(
  (Join-Path $repoRoot "scripts/runtime-rollout-config.mjs"),
  "--action", "count-runs",
  "--projectId", $ProjectId,
  "--window-hours", [string]([Math]::Max($WindowHours, [int]$target.window_hours)),
  "--limit", "800"
)

$healthBefore = Get-HealthSnapshot

$phaseReady = ($phaseCloseout.verdict -eq "phase_a_ready_for_sprint_baseline")
$matrixReady = (
  [int]$domainMatrix.summary.publishable_canonical_domains -ge 43 -and
  [int]$domainMatrix.summary.provider_gap_domain_count -eq 0 -and
  [int]$domainMatrix.summary.silent_general_fallback_count -eq 0
)
$parityReady = (
  [string]$parityReport.summary.verdict -eq "10% ready" -and
  [double]$parityReport.summary.binary_winner_mismatch_rate -eq 0 -and
  [double]$parityReport.summary.missing_binary_contract_rate -eq 0 -and
  (To-Bool $parityReport.summary.sports_probe_ready)
)
$healthGreen = (
  -not [string]::IsNullOrWhiteSpace([string]$healthBefore.crystalCore.base_url) -and
  (To-Bool $healthBefore.crystalCore.available) -and
  [string]::IsNullOrWhiteSpace([string]$healthBefore.fetch_error)
)
$sportsGreen = (
  (Get-SportsAvailable $healthBefore) -and
  (Get-SportsConfigured $healthBefore)
)
$signedInQaReady = ([string]$phaseCloseout.gates.manual_signed_in_qa -eq "certified")

$requiredWindowHours = [int]$target.window_hours
$requiredRequests = [int]$target.min_requests
$remoteCompletedSignedIn = [int]$runMetrics.metrics.remote_completed_signed_in
$remoteCompletedGuest = [int]$runMetrics.metrics.remote_completed_guest
$remoteCompletedTotal = [int]$runMetrics.metrics.remote_completed_total
$stageMatchGate = (
  [string]::IsNullOrWhiteSpace($expectedPreviousStage) -or
  $currentStageBefore -eq $expectedPreviousStage -or
  $currentStageBefore -eq $Stage
)
$windowGate = (
  $requiredWindowHours -le 0 -or
  ($null -ne $elapsedHoursSinceCurrentStage -and $elapsedHoursSinceCurrentStage -ge $requiredWindowHours)
)
$signedInRequestGate = ($requiredRequests -le 0 -or $remoteCompletedSignedIn -ge $requiredRequests)
$totalRequestGate = ($requiredRequests -le 0 -or $remoteCompletedTotal -ge $requiredRequests)
$guestRequestGate = ($Stage -notin @("rollout-25-25") -or $remoteCompletedGuest -gt 0)
$spotCheckGate = ($requiredWindowHours -le 0 -or $HealthySpotChecks -ge 3)
$smokeGate = ($requiredWindowHours -le 0 -or $ManualSmokePassed.IsPresent)
$rawErrorGate = ($requiredWindowHours -le 0 -or $NoRawErrors.IsPresent)
$p0Gate = ($requiredWindowHours -le 0 -or $NoP0.IsPresent)
$guestGate = ($Stage -notin @("rollout-25-25") -or $GuestGatingPassed.IsPresent)
$p1Gate = ($Stage -notin @("rollout-50-50", "rollout-100-100") -or $NoP1Systemic.IsPresent)

$gates = @(
  (New-GateResult -Name "phase_a_closeout_green" -Passed $phaseReady -Notes "Latest close-out: $phaseCloseoutPath"),
  (New-GateResult -Name "domain_matrix_green" -Passed $matrixReady -Notes "Latest matrix: $domainMatrixPath"),
  (New-GateResult -Name "parity_green" -Passed $parityReady -Notes "Latest parity: $parityPath"),
  (New-GateResult -Name "health_green" -Passed $healthGreen -Notes "Live /api/health reachable and crystal core available."),
  (New-GateResult -Name "sports_parity_green" -Passed $sportsGreen -Notes "Sports catalog/provider still available in live health."),
  (New-GateResult -Name "signed_in_qa_certified" -Passed $signedInQaReady -Notes "QA gate from latest phase close-out."),
  (New-GateResult -Name "current_rollout_stage_ok" -Passed $stageMatchGate -Notes "Current rollout stage: $currentStageBefore; expected previous stage: $expectedPreviousStage."),
  (New-GateResult -Name "window_requirement_met" -Passed $windowGate -Notes "Elapsed since current rollout change: $elapsedHoursSinceCurrentStage h; required: $requiredWindowHours h."),
  (New-GateResult -Name "signed_in_request_threshold" -Passed $signedInRequestGate -Notes "Signed-in remote completed runs: $remoteCompletedSignedIn; required: $requiredRequests."),
  (New-GateResult -Name "total_request_threshold" -Passed $totalRequestGate -Notes "Total remote completed runs: $remoteCompletedTotal; required: $requiredRequests."),
  (New-GateResult -Name "guest_request_presence" -Passed $guestRequestGate -Notes "Guest remote completed runs in window: $remoteCompletedGuest."),
  (New-GateResult -Name "health_spot_checks" -Passed $spotCheckGate -Notes "Healthy spot checks supplied: $HealthySpotChecks."),
  (New-GateResult -Name "manual_smoke" -Passed $smokeGate -Notes "Manual smoke flag supplied: $($ManualSmokePassed.IsPresent)."),
  (New-GateResult -Name "no_raw_errors" -Passed $rawErrorGate -Notes "No raw user-facing errors flag supplied: $($NoRawErrors.IsPresent)."),
  (New-GateResult -Name "no_p0_ux" -Passed $p0Gate -Notes "No P0 flag supplied: $($NoP0.IsPresent)."),
  (New-GateResult -Name "guest_gating_ok" -Passed $guestGate -Notes "Guest gating flag supplied: $($GuestGatingPassed.IsPresent)."),
  (New-GateResult -Name "no_p1_systemic" -Passed $p1Gate -Notes "No P1 systemic flag supplied: $($NoP1Systemic.IsPresent).")
)

$stageGateNames = switch ($Stage) {
  "canary-10-0" {
    @("phase_a_closeout_green", "domain_matrix_green", "parity_green", "health_green", "sports_parity_green", "signed_in_qa_certified")
  }
  "canary-10-10" {
    @("phase_a_closeout_green", "domain_matrix_green", "parity_green", "health_green", "sports_parity_green", "signed_in_qa_certified", "current_rollout_stage_ok", "window_requirement_met", "signed_in_request_threshold", "health_spot_checks", "manual_smoke", "no_raw_errors", "no_p0_ux")
  }
  "rollout-25-25" {
    @("phase_a_closeout_green", "domain_matrix_green", "parity_green", "health_green", "sports_parity_green", "signed_in_qa_certified", "current_rollout_stage_ok", "window_requirement_met", "total_request_threshold", "guest_request_presence", "health_spot_checks", "manual_smoke", "no_raw_errors", "no_p0_ux", "guest_gating_ok")
  }
  "rollout-50-50" {
    @("phase_a_closeout_green", "domain_matrix_green", "parity_green", "health_green", "sports_parity_green", "signed_in_qa_certified", "current_rollout_stage_ok", "window_requirement_met", "total_request_threshold", "health_spot_checks", "manual_smoke", "no_raw_errors", "no_p0_ux", "no_p1_systemic")
  }
  "rollout-100-100" {
    @("phase_a_closeout_green", "domain_matrix_green", "parity_green", "health_green", "sports_parity_green", "signed_in_qa_certified", "current_rollout_stage_ok", "window_requirement_met", "total_request_threshold", "health_spot_checks", "manual_smoke", "no_raw_errors", "no_p0_ux", "no_p1_systemic")
  }
  default {
    @("phase_a_closeout_green", "health_green")
  }
}

$gatesRequired = $gates | Where-Object { $_.name -in $stageGateNames }
$stageReady = -not ($gatesRequired | Where-Object { -not $_.passed })

$rolloutApplyResult = $null
$healthAfter = $null
$actionTaken = "hold"
if ($Apply -and $stageReady) {
  $rolloutApplyResult = Invoke-NodeJson -Arguments @(
    (Join-Path $repoRoot "scripts/runtime-rollout-config.mjs"),
    "--action", "set-stage",
    "--projectId", $ProjectId,
    "--stage", $Stage
  )
  Start-Sleep -Seconds $CacheWaitSeconds
  $healthAfter = Get-HealthSnapshot
  $postApplied = (
    (To-Bool $healthAfter.crystalCore.available) -and
    [int]$healthAfter.crystalCore.rollout.signed_in_percent -eq [int]$target.signed_in -and
    [int]$healthAfter.crystalCore.rollout.guest_percent -eq [int]$target.guest -and
    (Get-SportsAvailable $healthAfter)
  )
  $actionTaken = if ($postApplied) { "promote" } else { "hold" }
} elseif ($Apply -and -not $stageReady) {
  $actionTaken = "hold"
} else {
  $actionTaken = if ($stageReady) { "promote_ready" } else { "hold" }
}

$nextStage = switch ($Stage) {
  "baseline" { "canary-10-0" }
  "canary-10-0" { "canary-10-10" }
  "canary-10-10" { "rollout-25-25" }
  "rollout-25-25" { "rollout-50-50" }
  "rollout-50-50" { "rollout-100-100" }
  default { "" }
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  stage = $Stage
  stage_label = $target.label
  requested_apply = $Apply.IsPresent
  action_taken = $actionTaken
  target_rollout = @{
    signed_in_percent = [int]$target.signed_in
    guest_percent = [int]$target.guest
    kill_switch = [bool]$target.kill_switch
  }
  current_rollout_before = $rolloutBefore.crystal_core
  current_rollout_after = if ($healthAfter) {
    @{
      signed_in_percent = [int]$healthAfter.crystalCore.rollout.signed_in_percent
      guest_percent = [int]$healthAfter.crystalCore.rollout.guest_percent
      kill_switch = [bool]$healthAfter.crystalCore.rollout.kill_switch
      transport = [string]$healthAfter.crystalCore.rollout.transport
      enabled = [bool]$healthAfter.crystalCore.rollout.enabled
      updated_at = [string]$healthAfter.crystalCore.rollout.updated_at
    }
  } else {
    $rolloutBefore.crystal_core
  }
  gates_required = $stageGateNames
  gates = $gates
  stage_ready = $stageReady
  evidence = @{
    phase_closeout_path = $phaseCloseoutPath
    domain_matrix_path = $domainMatrixPath
    parity_path = $parityPath
    provider_foundation_path = $providerFoundationPath
    current_rollout_stage = $currentStageBefore
    expected_previous_stage = $expectedPreviousStage
    current_rollout_updated_at = $currentRolloutUpdatedAt
    elapsed_hours_since_current_rollout = $elapsedHoursSinceCurrentStage
    remote_completed_total = $remoteCompletedTotal
    remote_completed_signed_in = $remoteCompletedSignedIn
    remote_completed_guest = $remoteCompletedGuest
    remote_pending_total = [int]$runMetrics.metrics.remote_pending_total
    remote_fallback_total = [int]$runMetrics.metrics.remote_fallback_total
    request_window_start = [string]$runMetrics.metrics.window_start
    requested_log_window_hours = $WindowHours
    window_hours = [Math]::Max($WindowHours, [int]$target.window_hours)
    healthy_spot_checks = $HealthySpotChecks
    manual_smoke_passed = $ManualSmokePassed.IsPresent
    guest_gating_passed = $GuestGatingPassed.IsPresent
    no_raw_errors = $NoRawErrors.IsPresent
    no_p0 = $NoP0.IsPresent
    no_p1_systemic = $NoP1Systemic.IsPresent
  }
  live_health_before = @{
    fetch_error = [string]$healthBefore.fetch_error
    crystal_core_available = [bool]$healthBefore.crystalCore.available
    base_url = [string]$healthBefore.crystalCore.base_url
    signed_in_percent = [int]$healthBefore.crystalCore.rollout.signed_in_percent
    guest_percent = [int]$healthBefore.crystalCore.rollout.guest_percent
    sports_available = (Get-SportsAvailable $healthBefore)
    sports_provider_configured = (Get-SportsConfigured $healthBefore)
  }
  live_health_after = if ($healthAfter) {
    @{
      fetch_error = [string]$healthAfter.fetch_error
      crystal_core_available = [bool]$healthAfter.crystalCore.available
      base_url = [string]$healthAfter.crystalCore.base_url
      signed_in_percent = [int]$healthAfter.crystalCore.rollout.signed_in_percent
      guest_percent = [int]$healthAfter.crystalCore.rollout.guest_percent
      sports_available = (Get-SportsAvailable $healthAfter)
      sports_provider_configured = (Get-SportsConfigured $healthAfter)
    }
  } else {
    $null
  }
  rollout_apply_result = $rolloutApplyResult
  next_stage = $nextStage
}

$outputJsonDir = Split-Path -Parent $outputJsonFullPath
if (-not (Test-Path $outputJsonDir)) {
  New-Item -ItemType Directory -Path $outputJsonDir -Force | Out-Null
}
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $outputJsonFullPath -Encoding utf8

$gateRows = $gatesRequired | ForEach-Object {
  "| $($_.name) | $($_.status) | $($_.notes) |"
}

$healthAfterBlock = if ($healthAfter) {
  @(
    "- Crystal Core available: ``$([bool]$healthAfter.crystalCore.available)``"
    "- Base URL: ``$([string]$healthAfter.crystalCore.base_url)``"
    "- Rollout signed-in percent: ``$([int]$healthAfter.crystalCore.rollout.signed_in_percent)``"
    "- Rollout guest percent: ``$([int]$healthAfter.crystalCore.rollout.guest_percent)``"
    "- Sports available: ``$(Get-SportsAvailable $healthAfter)``"
    "- Sports provider configured: ``$(Get-SportsConfigured $healthAfter)``"
    "- Health fetch error: ``$([string]$healthAfter.fetch_error)``"
  ) -join "`n"
} else {
  "- Not applied in this run."
}

$markdown = @"
# Canary Rollout Decision - $reportDate

## Current Verdict
- Requested stage: **$Stage**
- Target rollout: **$($target.signed_in)/$($target.guest)**
- Action taken: **$actionTaken**
- Requested apply: $($Apply.IsPresent)

## Gate Snapshot
| Gate | Status | Notes |
|---|---|---|
$($gateRows -join "`n")

## Evidence Snapshot
- Latest phase close-out: $phaseCloseoutPath
- Latest domain matrix: $domainMatrixPath
- Latest parity report: $parityPath
- Latest provider foundation report: $providerFoundationPath
- Remote completed runs in window: $remoteCompletedTotal
- Remote completed signed-in runs: $remoteCompletedSignedIn
- Remote completed guest runs: $remoteCompletedGuest
- Remote pending runs: $([int]$runMetrics.metrics.remote_pending_total)
- Remote fallback runs: $([int]$runMetrics.metrics.remote_fallback_total)
- Window start: $([string]$runMetrics.metrics.window_start)
- Healthy spot checks supplied: $HealthySpotChecks
- Manual smoke supplied: $($ManualSmokePassed.IsPresent)
- Guest gating supplied: $($GuestGatingPassed.IsPresent)
- No raw errors supplied: $($NoRawErrors.IsPresent)
- No P0 supplied: $($NoP0.IsPresent)
- No P1 systemic supplied: $($NoP1Systemic.IsPresent)

## Live Health Before
- Crystal Core available: $([bool]$healthBefore.crystalCore.available)
- Base URL: $([string]$healthBefore.crystalCore.base_url)
- Rollout signed-in percent: $([int]$healthBefore.crystalCore.rollout.signed_in_percent)
- Rollout guest percent: $([int]$healthBefore.crystalCore.rollout.guest_percent)
- Sports available: $(Get-SportsAvailable $healthBefore)
- Sports provider configured: $(Get-SportsConfigured $healthBefore)
- Health fetch error: $([string]$healthBefore.fetch_error)

## Live Health After
$healthAfterBlock

## Stage Recommendation
- Current stage target: **$($target.label)**
- Next stage after this one: **$nextStage**
- Rollout stays deterministic because the Firestore config preserves the existing `salt`.
- The old Week 4 canary doc remains historical; this decision report supersedes it operationally.
"@

Set-Content -Path $outputMarkdownFullPath -Value $markdown -Encoding utf8
Write-Host "Canary rollout markdown written to $outputMarkdownFullPath"
Write-Host "Canary rollout JSON written to $outputJsonFullPath"
Write-Host "Verdict: $actionTaken"
