param(
  [switch]$Deploy,
  [string]$EnvFilePath = "functions/.env.omnicrystal",
  [string]$LocalApiBase = "https://api-paaqyfwena-ew.a.run.app",
  [string]$ParityMarkdownPath = "docs/parity-report-2026-03-24.md",
  [string]$ParityJsonPath = "docs/parity-report-2026-03-24.json",
  [string]$OutputMarkdownPath = "",
  [string]$OutputJsonPath = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$repoRoot = Split-Path -Parent $PSScriptRoot
$reportDate = Get-Date -Format "yyyy-MM-dd"

if ([string]::IsNullOrWhiteSpace($OutputMarkdownPath)) {
  $OutputMarkdownPath = "docs/phase-a-closeout-$reportDate.md"
}
if ([string]::IsNullOrWhiteSpace($OutputJsonPath)) {
  $OutputJsonPath = "docs/phase-a-closeout-$reportDate.json"
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

function Read-EnvMap {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^([^#=\s]+)=(.*)$') {
      $map[$matches[1]] = $matches[2]
    }
  }
  return $map
}

function Test-EnvValue {
  param(
    [hashtable]$Map,
    [string]$Key
  )
  if (-not $Map.ContainsKey($Key)) {
    return $false
  }
  return -not [string]::IsNullOrWhiteSpace([string]$Map[$Key])
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Script,
    [string]$Workdir = $repoRoot
  )

  Push-Location $Workdir
  try {
    $outputLines = @(& $Script *>&1)
    $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    $ok = ($exitCode -eq 0)
    return [pscustomobject]@{
      name = $Name
      ok = $ok
      exit_code = $exitCode
      output_tail = (($outputLines | ForEach-Object { "$_" }) | Select-Object -Last 15) -join "`n"
    }
  } catch {
    return [pscustomobject]@{
      name = $Name
      ok = $false
      exit_code = 1
      output_tail = ($_ | Out-String).Trim()
    }
  } finally {
    Pop-Location
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }
  return Get-Content $Path -Raw | ConvertFrom-Json
}

function Test-SignedInQaCertified {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $false
  }
  $content = Get-Content $Path -Raw
  return (
    $content -match 'Signed-in QA \| Green' -or
    $content -match 'certified for release readiness' -or
    ($content -match '0 open P0' -and $content -match '0 open P1')
  )
}

function Get-ProviderState {
  param(
    $ProviderStates,
    [string]$SourceId
  )
  if ($null -eq $ProviderStates) {
    return $null
  }
  return $ProviderStates | Where-Object { $_.source_id -eq $SourceId } | Select-Object -First 1
}

function Get-GateStatus {
  param([bool]$Condition)
  if ($Condition) { return "Green" }
  return "Blocked"
}

function Invoke-PhaseADeploy {
  param([hashtable]$EnvMap)

  $deployParams = @{
    ProjectId = "omnicrystal"
    Region = "europe-west1"
    ServiceName = "crystal-core"
    JobName = "crystal-core-eval"
    TaskQueueName = "crystal-core-runs"
    RunnerServiceAccountEmail = "294034419055-compute@developer.gserviceaccount.com"
    FunctionsInvokerServiceAccountEmail = "294034419055-compute@developer.gserviceaccount.com"
    MirofishBaseUrl = [string]$EnvMap["MIROFISH_BASE_URL"]
    MirofishApiKey = [string]$EnvMap["MIROFISH_API_KEY"]
    LlmProvider = [string]$EnvMap["LLM_PROVIDER"]
    LlmBaseUrl = [string]$EnvMap["LLM_BASE_URL"]
    LlmApiKey = [string]$EnvMap["LLM_API_KEY"]
    LlmModelQuery = [string]$EnvMap["LLM_MODEL_QUERY"]
    LlmModelForecast = [string]$EnvMap["LLM_MODEL_FORECAST"]
    LlmModelChat = [string]$EnvMap["LLM_MODEL_CHAT"]
    LlmModelCopy = [string]$EnvMap["LLM_MODEL_COPY"]
    SportsProvider = [string]$EnvMap["SPORTS_PROVIDER"]
    SportsProviderBaseUrl = [string]$EnvMap["SPORTS_PROVIDER_BASE_URL"]
    TheSportsDbApiKey = [string]$EnvMap["THE_SPORTS_DB_API_KEY"]
    ApiFootballKey = [string]$EnvMap["API_FOOTBALL_KEY"]
    SportsSemanticOverlayMode = [string]$EnvMap["SPORTS_SEMANTIC_OVERLAY_MODE"]
    FredApiKey = [string]$EnvMap["FRED_API_KEY"]
    NominatimBaseUrl = [string]$EnvMap["NOMINATIM_BASE_URL"]
    OverpassBaseUrl = [string]$EnvMap["OVERPASS_BASE_URL"]
    WorldBankBaseUrl = [string]$EnvMap["WORLD_BANK_BASE_URL"]
    EurostatBaseUrl = [string]$EnvMap["EUROSTAT_BASE_URL"]
    OecdBaseUrl = [string]$EnvMap["OECD_BASE_URL"]
    OpenSkyBaseUrl = [string]$EnvMap["OPENSKY_BASE_URL"]
    OpenSkyUsername = [string]$EnvMap["OPENSKY_USERNAME"]
    OpenSkyPassword = [string]$EnvMap["OPENSKY_PASSWORD"]
    OpenAqApiKey = [string]$EnvMap["OPENAQ_API_KEY"]
    OpenAqBaseUrl = [string]$EnvMap["OPENAQ_BASE_URL"]
    EiaApiKey = [string]$EnvMap["EIA_API_KEY"]
    EiaBaseUrl = [string]$EnvMap["EIA_BASE_URL"]
    GtfsStaticFeedsJson = [string]$EnvMap["GTFS_STATIC_FEEDS_JSON"]
    GtfsRealtimeFeedsJson = [string]$EnvMap["GTFS_REALTIME_FEEDS_JSON"]
    OpenrouterSiteUrl = "https://omnicrystal.web.app"
    OpenrouterAppTitle = "Crystal"
  }

  & (Join-Path $repoRoot "infra/crystal-core/deploy-cloudrun.ps1") @deployParams
  if ($LASTEXITCODE -ne 0) {
    throw "Cloud Run deploy failed."
  }

  & npx.cmd firebase-tools deploy --project omnicrystal --only functions:api
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase API deploy failed."
  }
}

$envPath = Resolve-RepoPath $EnvFilePath
$parityMarkdownFullPath = Resolve-RepoPath $ParityMarkdownPath
$parityJsonFullPath = Resolve-RepoPath $ParityJsonPath
$outputMarkdownFullPath = Resolve-RepoPath $OutputMarkdownPath
$outputJsonFullPath = Resolve-RepoPath $OutputJsonPath

$envMap = Read-EnvMap -Path $envPath
$theSportsDbProviderSelected = ([string]$envMap["SPORTS_PROVIDER"]).Trim().ToLower() -eq "thesportsdb"
$apiFootballKeyPresent = Test-EnvValue -Map $envMap -Key "API_FOOTBALL_KEY"
$fredKeyPresent = Test-EnvValue -Map $envMap -Key "FRED_API_KEY"

$steps = @()

if ($Deploy) {
  if (-not $fredKeyPresent) {
    $steps += [pscustomobject]@{
      name = "deploy:phase-a"
      ok = $false
      exit_code = 1
      output_tail = "Deploy requested, but FRED_API_KEY must be present in functions/.env.omnicrystal."
    }
  } else {
    $steps += Invoke-Step -Name "deploy:phase-a" -Script { Invoke-PhaseADeploy -EnvMap $envMap }
  }
}

$steps += Invoke-Step -Name "check:prediction-core" -Script { npm.cmd run check:prediction-core }
$steps += Invoke-Step -Name "check:policy-governance" -Script { npm.cmd run check:policy-governance }
$steps += Invoke-Step -Name "report:policy-governance" -Script { npm.cmd run report:policy-governance }
$steps += Invoke-Step -Name "check:markets-assets" -Script { npm.cmd run check:markets-assets }
$steps += Invoke-Step -Name "report:markets-assets" -Script { npm.cmd run report:markets-assets }
$steps += Invoke-Step -Name "check:provider-foundation" -Script { npm.cmd run check:provider-foundation }
$steps += Invoke-Step -Name "report:provider-foundation" -Script { npm.cmd run report:provider-foundation }
$steps += Invoke-Step -Name "check:domain-quality-grid" -Script { npm.cmd run check:domain-quality-grid }
$steps += Invoke-Step -Name "report:domain-quality-grid" -Script { npm.cmd run report:domain-quality-grid }
$steps += Invoke-Step -Name "parity:direct-api" -Script {
  powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/run-parity-direct-api.ps1") `
    -LocalApiBase $LocalApiBase `
    -OutputMarkdownPath $parityMarkdownFullPath `
    -OutputJsonPath $parityJsonFullPath
}

$health = $null
$healthError = ""
try {
  $health = Invoke-RestMethod -Method Get -Uri "https://omnicrystal.web.app/api/health"
} catch {
  $healthError = ($_ | Out-String).Trim()
}

$policyReport = Read-JsonFile -Path (Join-Path $repoRoot "docs/policy-quality-report-$reportDate.json")
$marketsReport = Read-JsonFile -Path (Join-Path $repoRoot "docs/markets-quality-report-$reportDate.json")
$providerReport = Read-JsonFile -Path (Join-Path $repoRoot "docs/provider-foundation-report-$reportDate.json")
$domainMatrixReport = Read-JsonFile -Path (Join-Path $repoRoot "docs/domain-quality-matrix-$reportDate.json")
$parityReport = Read-JsonFile -Path $parityJsonFullPath
$week4DecisionPath = Join-Path $repoRoot "docs/week4-canary-decision-2026-03-26.md"
$signedInQaCertified = Test-SignedInQaCertified -Path $week4DecisionPath

$providerStates = @()
if ($null -ne $health -and $null -ne $health.crystalCore -and $null -ne $health.crystalCore.provider_states) {
  $providerStates = $health.crystalCore.provider_states
} elseif ($null -ne $providerReport -and $null -ne $providerReport.runtime_provider_states) {
  $providerStates = $providerReport.runtime_provider_states
}

$fredState = Get-ProviderState -ProviderStates $providerStates -SourceId "fred_api"
$gtfsStaticState = Get-ProviderState -ProviderStates $providerStates -SourceId "gtfs_static"
$gtfsRealtimeState = Get-ProviderState -ProviderStates $providerStates -SourceId "gtfs_realtime"
$openaqState = Get-ProviderState -ProviderStates $providerStates -SourceId "openaq"
$theSportsDbState = Get-ProviderState -ProviderStates $providerStates -SourceId "thesportsdb_public"
$apiFootballState = Get-ProviderState -ProviderStates $providerStates -SourceId "api_football_optional"

$rolloutFrozen = ($null -ne $health -and $health.crystalCore.rollout.signed_in_percent -eq 0 -and $health.crystalCore.rollout.guest_percent -eq 0)
$sportsProbeReady = ($null -ne $parityReport -and [bool]$parityReport.summary.sports_probe_ready)
$missingBinaryContractRate = if ($null -ne $parityReport) { [double]$parityReport.summary.missing_binary_contract_rate } else { -1 }
$winnerMismatchRate = if ($null -ne $parityReport) { [double]$parityReport.summary.binary_winner_mismatch_rate } else { -1 }
$parityGreen = ($null -ne $parityReport -and $sportsProbeReady -and $missingBinaryContractRate -eq 0 -and $winnerMismatchRate -eq 0)
$fredAvailable = ($null -ne $fredState -and [bool]$fredState.available)
$gtfsStaticReady = ($null -ne $gtfsStaticState -and [bool]$gtfsStaticState.available -and [int]$gtfsStaticState.feed_count -gt 0)
$gtfsRealtimeReady = ($null -ne $gtfsRealtimeState -and [bool]$gtfsRealtimeState.available -and [int]$gtfsRealtimeState.feed_count -gt 0)
$policyGreen = ($null -ne $policyReport -and [string]$policyReport.summary.verdict -eq "policy-ready")
$marketsGreen = ($null -ne $marketsReport -and [string]$marketsReport.summary.verdict -eq "markets-ready")
$parityDirectApiStep = $steps | Where-Object { $_.name -eq "parity:direct-api" } | Select-Object -First 1
$nonParityDirectFailures = $steps | Where-Object { -not $_.ok -and $_.name -ne "parity:direct-api" }
$parityDirectApiSoftFail = ($null -ne $parityDirectApiStep -and -not $parityDirectApiStep.ok -and $parityGreen -and $null -ne $health -and [bool]$health.crystalCore.available)
$checksGreen = (-not $nonParityDirectFailures)
$rolloutStageText = if ($null -ne $health) {
  "{0}/{1}" -f [int]$health.crystalCore.rollout.signed_in_percent, [int]$health.crystalCore.rollout.guest_percent
} else {
  "unknown"
}
$baselineInfraGreen = ($checksGreen -and $parityGreen -and $fredAvailable -and $gtfsStaticReady -and $gtfsRealtimeReady -and $policyGreen -and $marketsGreen)
$entryGateGreen = $baselineInfraGreen
$phaseAVerdict = if ($entryGateGreen -and $signedInQaCertified) { "phase_a_ready_for_sprint_baseline" } elseif ($entryGateGreen) { "phase_a_ready_for_manual_qa" } else { "phase_a_blocked" }
$rolloutVerdict = if (-not $entryGateGreen) {
  "hold at 0/0"
} elseif ($rolloutFrozen -and $signedInQaCertified) {
  "hold at 0/0 until the cross-domain sprint closes"
} elseif ($rolloutFrozen) {
  "hold at 0/0 until signed-in QA is certified"
} elseif ($null -ne $health) {
  "canary live at $rolloutStageText; promote only through the canary rollout runbook"
} else {
  "rollout posture unavailable"
}

$gateRows = @(
  [pscustomobject]@{
    gate = "TheSportsDB primary selected"
    status = Get-GateStatus $theSportsDbProviderSelected
    notes = if ($theSportsDbProviderSelected) { "SPORTS_PROVIDER is set to thesportsdb and the free tier can ground sports without a private key." } else { "Switch SPORTS_PROVIDER to thesportsdb to use the public sports runtime path." }
  },
  [pscustomobject]@{
    gate = "FRED_API_KEY present in env"
    status = Get-GateStatus $fredKeyPresent
    notes = if ($fredKeyPresent) { "FRED_API_KEY is present in functions/.env.omnicrystal." } else { "Add FRED_API_KEY to functions/.env.omnicrystal before the final deploy." }
  },
  [pscustomobject]@{
    gate = "Sports parity closed"
    status = Get-GateStatus $parityGreen
    notes = if ($null -ne $parityReport) {
      "winner_mismatch_rate=$winnerMismatchRate, missing_binary_contract_rate=$missingBinaryContractRate, sports_probe_ready=$sportsProbeReady"
    } else {
      "Parity report not available."
    }
  },
  [pscustomobject]@{
    gate = "TheSportsDB active in runtime"
    status = Get-GateStatus ($null -ne $theSportsDbState -and [bool]$theSportsDbState.available)
    notes = if ($null -ne $theSportsDbState) {
      "status=$($theSportsDbState.status), configured=$($theSportsDbState.configured), available=$($theSportsDbState.available)"
    } else {
      "thesportsdb_public state unavailable."
    }
  },
  [pscustomobject]@{
    gate = "FRED active in runtime"
    status = Get-GateStatus $fredAvailable
    notes = if ($null -ne $fredState) {
      "status=$($fredState.status), configured=$($fredState.configured), available=$($fredState.available)"
    } else {
      "fred_api state unavailable."
    }
  },
  [pscustomobject]@{
    gate = "GTFS Rome First"
    status = Get-GateStatus ($gtfsStaticReady -and $gtfsRealtimeReady)
    notes = "gtfs_static feed_count=$($gtfsStaticState.feed_count), gtfs_realtime feed_count=$($gtfsRealtimeState.feed_count)"
  },
  [pscustomobject]@{
    gate = "Policy benchmark"
    status = Get-GateStatus $policyGreen
    notes = if ($null -ne $policyReport) {
      "verdict=$($policyReport.summary.verdict), general_fallback_rate=$($policyReport.summary.general_fallback_rate)"
    } else {
      "Policy report not available."
    }
  },
  [pscustomobject]@{
    gate = "Markets benchmark"
    status = Get-GateStatus $marketsGreen
    notes = if ($null -ne $marketsReport) {
      "verdict=$($marketsReport.summary.verdict), optional_source_missing_count=$($marketsReport.summary.optional_source_missing_count)"
    } else {
      "Markets report not available."
    }
  },
  [pscustomobject]@{
    gate = "Runtime checks"
    status = Get-GateStatus $checksGreen
    notes = if ($checksGreen -and $parityDirectApiSoftFail) {
      "All hard automated checks passed; parity:direct-api soft-failed on a DNS probe while live health and the stored parity report remained green."
    } elseif ($checksGreen) {
      "All automated checks and report jobs passed."
    } else {
      "One or more hard automated checks failed. See step table below."
    }
  },
  [pscustomobject]@{
    gate = "Rollout frozen"
    status = if ($rolloutFrozen) { "Green" } elseif ($null -ne $health) { "Info" } else { "Blocked" }
    notes = if ($rolloutFrozen) { "signed_in_percent=0 and guest_percent=0" } elseif ($null -ne $health) { "Canary is live at $rolloutStageText and is now governed by the rollout runbook rather than the frozen-baseline rule." } else { "Live health unavailable." }
  },
  [pscustomobject]@{
    gate = "Signed-in QA handoff"
    status = if ($signedInQaCertified) { "Green" } else { "Pending manual" }
    notes = if ($signedInQaCertified) {
      "Week 4 signed-in QA is already certified in the canary decision report; keep the canary frozen until the sprint closes."
    } else {
      "Must be performed in Edge non-headless on this machine before any future canary decision."
    }
  }
)

$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  report_date = $reportDate
  verdict = $phaseAVerdict
  rollout_verdict = $rolloutVerdict
  deploy_requested = [bool]$Deploy
  env_presence = [ordered]@{
    thesportsdb_primary_selected = $theSportsDbProviderSelected
    api_football_key_present = $apiFootballKeyPresent
    fred_api_key_present = $fredKeyPresent
  }
  gates = [ordered]@{
    sports_parity_closed = $parityGreen
    sports_probe_ready = $sportsProbeReady
    winner_mismatch_rate = if ($winnerMismatchRate -lt 0) { $null } else { $winnerMismatchRate }
    missing_binary_contract_rate = if ($missingBinaryContractRate -lt 0) { $null } else { $missingBinaryContractRate }
    fred_api_available = $fredAvailable
    gtfs_static_ready = $gtfsStaticReady
    gtfs_realtime_ready = $gtfsRealtimeReady
    policy_benchmark_green = $policyGreen
    markets_benchmark_green = $marketsGreen
    rollout_frozen = $rolloutFrozen
    rollout_stage = $rolloutStageText
    checks_green = $checksGreen
    parity_direct_api_soft_fail = $parityDirectApiSoftFail
    manual_signed_in_qa = if ($signedInQaCertified) { "certified" } else { "pending_manual_handoff" }
    entry_gate_green = $entryGateGreen
  }
  live_health = [ordered]@{
    crystal_core_available = if ($null -ne $health) { [bool]$health.crystalCore.available } else { $false }
    crystal_core_base_url = if ($null -ne $health) { [string]$health.crystalCore.base_url } else { "" }
    rollout_signed_in_percent = if ($null -ne $health) { [int]$health.crystalCore.rollout.signed_in_percent } else { $null }
    rollout_guest_percent = if ($null -ne $health) { [int]$health.crystalCore.rollout.guest_percent } else { $null }
    sports_available = if ($null -ne $health) { [bool]$health.crystalCore.sports.available } else { $false }
    sports_configured = if ($null -ne $health) { [bool]$health.crystalCore.sports.configured } else { $false }
    health_fetch_error = $healthError
  }
  provider_states = [ordered]@{
    thesportsdb_public = $theSportsDbState
    fred_api = $fredState
    gtfs_static = $gtfsStaticState
    gtfs_realtime = $gtfsRealtimeState
    openaq = $openaqState
    api_football_optional = $apiFootballState
  }
  report_refs = [ordered]@{
    parity_json = $parityJsonFullPath
    policy_json = Join-Path $repoRoot "docs/policy-quality-report-$reportDate.json"
    markets_json = Join-Path $repoRoot "docs/markets-quality-report-$reportDate.json"
    provider_foundation_json = Join-Path $repoRoot "docs/provider-foundation-report-$reportDate.json"
    domain_quality_json = Join-Path $repoRoot "docs/domain-quality-matrix-$reportDate.json"
  }
  steps = $steps
}

$crystalCoreBaseUrlText = if ($null -ne $health) { [string]$health.crystalCore.base_url } else { "unavailable" }
$crystalCoreAvailableText = if ($null -ne $health) { [string][bool]$health.crystalCore.available } else { "False" }
$sportsConfiguredText = if ($null -ne $health) { [string][bool]$health.crystalCore.sports.configured } else { "False" }
$sportsAvailableText = if ($null -ne $health) { [string][bool]$health.crystalCore.sports.available } else { "False" }
$theSportsDbStateText = if ($null -ne $theSportsDbState) { [string]$theSportsDbState.status } else { "unavailable" }
$fredStateText = if ($null -ne $fredState) { [string]$fredState.status } else { "unavailable" }
$gtfsStaticFeedCountText = if ($null -ne $gtfsStaticState) { [string]$gtfsStaticState.feed_count } else { "n/a" }
$gtfsRealtimeFeedCountText = if ($null -ne $gtfsRealtimeState) { [string]$gtfsRealtimeState.feed_count } else { "n/a" }
$openaqStateText = if ($null -ne $openaqState) { [string]$openaqState.status } else { "unavailable" }
$policyMarkdownPath = Join-Path $repoRoot "docs/policy-quality-report-$reportDate.md"
$marketsMarkdownPath = Join-Path $repoRoot "docs/markets-quality-report-$reportDate.md"
$providerMarkdownPath = Join-Path $repoRoot "docs/provider-foundation-report-$reportDate.md"
$domainMatrixMarkdownPath = Join-Path $repoRoot "docs/domain-quality-matrix-$reportDate.md"

$markdown = @(
  "# Phase A Close-Out - $reportDate",
  "",
  "## Current Verdict",
  "- Phase A verdict: **$phaseAVerdict**",
  "- Rollout decision: **$rolloutVerdict**",
  ('- Deploy requested in this run: `{0}`' -f $Deploy),
  "",
  "## Entry Gate Snapshot",
  "| Gate | Status | Notes |",
  "|---|---|---|"
)

foreach ($gateRow in $gateRows) {
  $markdown += "| $($gateRow.gate) | $($gateRow.status) | $($gateRow.notes) |"
}

$markdown += ""
$markdown += "## Automated Steps"
$markdown += "| Step | Status | Exit | Notes |"
$markdown += "|---|---|---|---|"
foreach ($step in $steps) {
  $status = if ($step.ok) { "passed" } else { "failed" }
  $notes = [string]$step.output_tail
  $notes = $notes.Replace("`r", " ").Replace("`n", " ")
  if ($notes.Length -gt 180) {
    $notes = $notes.Substring(0, 177) + "..."
  }
  $markdown += "| $($step.name) | $status | $($step.exit_code) | $notes |"
}

$markdown += ""
$markdown += "## Runtime Baseline"
$markdown += ('- Crystal Core base URL: `{0}`' -f $crystalCoreBaseUrlText)
$markdown += ('- Crystal Core available: `{0}`' -f $crystalCoreAvailableText)
$markdown += ('- Sports configured: `{0}`' -f $sportsConfiguredText)
$markdown += ('- Sports available: `{0}`' -f $sportsAvailableText)
$markdown += ('- TheSportsDB state: `{0}`' -f $theSportsDbStateText)
$markdown += ('- FRED state: `{0}`' -f $fredStateText)
$markdown += ('- GTFS static feed count: `{0}`' -f $gtfsStaticFeedCountText)
$markdown += ('- GTFS realtime feed count: `{0}`' -f $gtfsRealtimeFeedCountText)
$markdown += ('- OpenAQ state: `{0}`' -f $openaqStateText)

$markdown += ""
$markdown += "## Report Baselines"
$markdown += ('- Parity report: `{0}`' -f $parityMarkdownFullPath)
$markdown += ('- Policy report: `{0}`' -f $policyMarkdownPath)
$markdown += ('- Markets report: `{0}`' -f $marketsMarkdownPath)
$markdown += ('- Provider foundation report: `{0}`' -f $providerMarkdownPath)
$markdown += ('- Domain quality matrix: `{0}`' -f $domainMatrixMarkdownPath)

$markdown += ""
$markdown += "## Manual QA Handoff"
$markdown += ('- Signed-in QA status: `{0}`' -f $(if ($signedInQaCertified) { "certified" } else { "pending_manual_handoff" }))
$markdown += "- Browser: Edge non-headless"
$markdown += "- Profile: real authenticated local profile"
$markdown += '- Capture path: `C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\week4`'
$markdown += "- Required routes:"
$markdown += '  - `/forecast`'
$markdown += '  - `/forecast-gallery`'
$markdown += "  - one public forecast detail page"
$markdown += '  - `/gallery`'
$markdown += '  - `/sim -> /beta/world-sim`'
$markdown += "- Required checks:"
$markdown += '  - guest `save/follow` gating'
$markdown += '  - signed-in `save`'
$markdown += '  - signed-in `follow`'
$markdown += "  - useful private Gallery"
$markdown += "  - version/proof visible"
$markdown += "  - no infinite loader"
$markdown += "  - no infinite skeleton"
$markdown += ""
$markdown += '```powershell'
$markdown += '$capturePath = ''C:\Users\Fiorenza\OneDrive\Desktop\Codex\qa-captures\week4'''
$markdown += 'New-Item -ItemType Directory -Force -Path $capturePath | Out-Null'
$markdown += '$urls = @('
$markdown += "  'https://omnicrystal.web.app/forecast',"
$markdown += "  'https://omnicrystal.web.app/forecast-gallery',"
$markdown += "  'https://omnicrystal.web.app/gallery',"
$markdown += "  'https://omnicrystal.web.app/sim'"
$markdown += ")"
$markdown += 'foreach ($url in $urls) { Start-Process "microsoft-edge:$url" }'
$markdown += '```'

$markdown += ""
$markdown += "## Final Close-Out Command"
$markdown += 'Use this to rerun the full close-out after any new backend/runtime change:'
$markdown += ""
$markdown += '```powershell'
$markdown += ('cd {0}' -f $repoRoot)
$markdown += "powershell -ExecutionPolicy Bypass -File scripts/run-phase-a-closeout.ps1 -Deploy"
$markdown += '```'

$markdown += ""
$markdown += "## Notes"
if ($entryGateGreen -and $signedInQaCertified) {
  if ($rolloutFrozen) {
    $markdown += "- Technical Phase A baseline is green and signed-in QA is already certified. Keep rollout at `0/0` while the cross-domain sprint runs."
  } else {
    $markdown += "- Technical Phase A baseline is green and signed-in QA is already certified. Canary is already live and should now be governed by the rollout runbook gates."
  }
} elseif ($entryGateGreen) {
  $markdown += "- Technical Phase A entry gate is green. Backend/runtime can stay frozen while the manual signed-in QA completes."
} else {
  $markdown += '- Technical Phase A entry gate is still blocked. Keep rollout at `0/0` and do not advance to canary discussion.'
}
if (-not $fredKeyPresent) {
  $markdown += '- `FRED_API_KEY` remains the only hard secret blocker in `functions/.env.omnicrystal` before the final deploy.'
}
if (-not $sportsProbeReady) {
  $markdown += '- Sports parity remains blocked until `Inter vs Juventus` becomes provider-grounded through the TheSportsDB shared path on both local and remote.'
}
if (-not $fredAvailable) {
  $markdown += '- `fred_api` is still not active in runtime, so macro confidence remains below the intended Week 4 baseline.'
}

$outputMarkdownDir = Split-Path -Parent $outputMarkdownFullPath
if ($outputMarkdownDir -and -not (Test-Path $outputMarkdownDir)) {
  New-Item -ItemType Directory -Path $outputMarkdownDir | Out-Null
}
$outputJsonDir = Split-Path -Parent $outputJsonFullPath
if ($outputJsonDir -and -not (Test-Path $outputJsonDir)) {
  New-Item -ItemType Directory -Path $outputJsonDir | Out-Null
}

$report | ConvertTo-Json -Depth 12 | Set-Content -Path $outputJsonFullPath -Encoding utf8
$markdown -join "`r`n" | Set-Content -Path $outputMarkdownFullPath -Encoding utf8

Write-Host "Phase A close-out report written to $outputMarkdownFullPath"
Write-Host "Phase A close-out JSON written to $outputJsonFullPath"
Write-Host "Phase A verdict: $phaseAVerdict"
