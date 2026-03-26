param(
  [string]$LocalApiBase = "https://api-paaqyfwena-ew.a.run.app",
  [string]$RemoteServiceUrl = "https://crystal-core-paaqyfwena-ew.a.run.app",
  [string]$OutputMarkdownPath = "docs/parity-report-2026-03-24.md",
  [string]$OutputJsonPath = "docs/parity-report-2026-03-24.json"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Get-GcloudExecutable {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $exe = Get-Command gcloud.exe -ErrorAction SilentlyContinue
  if ($exe) { return $exe.Source }
  $fallback = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($fallback -and $fallback.Source -notlike "*.ps1") { return $fallback.Source }
  throw "gcloud non trovato."
}

function Get-RemoteToken {
  param([string]$Audience)
  $gcloud = Get-GcloudExecutable
  try {
    $token = (& $gcloud auth print-identity-token "--audiences=$Audience" 2>$null | Select-Object -First 1).Trim()
  } catch {
    $token = ""
  }
  if (-not $token) {
    try {
      $token = (& $gcloud auth print-identity-token 2>$null | Select-Object -First 1).Trim()
    } catch {
      $token = ""
    }
  }
  if (-not $token) {
    $token = (& $gcloud auth print-access-token 2>$null | Select-Object -First 1).Trim()
  }
  if (-not $token) {
    throw "Impossibile ottenere un token per il servizio remoto."
  }
  return $token
}

function Invoke-JsonPost {
  param(
    [string]$Uri,
    [hashtable]$Body,
    [hashtable]$Headers = @{}
  )
  return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 12)
}

function Invoke-JsonGet {
  param(
    [string]$Uri,
    [hashtable]$Headers = @{}
  )
  return Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers
}

function Invoke-LocalJsonWithRetry {
  param(
    [string]$Uri,
    [hashtable]$Body,
    [hashtable]$Headers = @{}
  )
  $delays = @(0, 3, 6)
  $lastError = $null
  $failures = @()
  for ($attempt = 0; $attempt -lt $delays.Length; $attempt++) {
    if ($delays[$attempt] -gt 0) {
      Start-Sleep -Seconds $delays[$attempt]
    }
    try {
      $response = Invoke-JsonPost -Uri $Uri -Body $Body -Headers $Headers
      return @{
        ok = $true
        response = $response
        failures = $failures
      }
    } catch {
      $lastError = $_.Exception
      $message = if ($lastError) { $lastError.Message } else { "unknown error" }
      $failures += "attempt $($attempt + 1): $message"
    }
  }
  return @{
    ok = $false
    response = $null
    failures = $failures
    error = if ($lastError) { $lastError.Message } else { "unknown error" }
  }
}

function Wait-ForRemoteRun {
  param(
    [string]$RunId,
    [hashtable]$Headers,
    [string]$BaseUrl
  )
  $history = @()
  for ($poll = 1; $poll -le 30; $poll++) {
    $state = Invoke-JsonGet -Uri "$BaseUrl/v1/runs/$RunId" -Headers $Headers
    $status = Get-RunStatus -State $state
    $history += @{
      poll = $poll
      status = $status
      stage = $state.run.current_stage
      transport = $state.run.runtime_transport
      error = $state.run.error_message
    }
    if (@("completed", "failed", "canceled") -contains $status) {
      return @{
        terminal = $true
        timed_out = $false
        state = $state
        history = $history
      }
    }
    Start-Sleep -Seconds 4
  }
  $finalState = Invoke-JsonGet -Uri "$BaseUrl/v1/runs/$RunId" -Headers $Headers
  $finalStatus = Get-RunStatus -State $finalState
  return @{
    terminal = @("completed", "failed", "canceled") -contains $finalStatus
    timed_out = @("completed", "failed", "canceled") -notcontains $finalStatus
    state = $finalState
    history = $history
  }
}

function Get-QueryPlan {
  param($Response)
  if ($null -eq $Response) { return $null }
  if ($Response.PSObject.Properties.Name -contains "query_plan" -and $null -ne $Response.query_plan) {
    return $Response.query_plan
  }
  return $Response
}

function Get-RunStatus {
  param($State)
  if ($null -eq $State) { return "" }
  if ($State.PSObject.Properties.Name -contains "status" -and [string]$State.status) {
    return [string]$State.status
  }
  if ($State.PSObject.Properties.Name -contains "run" -and $null -ne $State.run -and $State.run.PSObject.Properties.Name -contains "status") {
    return [string]$State.run.status
  }
  return ""
}

function Get-BinaryWinner($card) {
  if ($null -eq $card -or $null -eq $card.binary_contract) { return "" }
  return [string]$card.binary_contract.winning_side
}

function Get-BinaryBand($card) {
  if ($null -eq $card -or $null -eq $card.binary_contract) { return "" }
  return [string]$card.binary_contract.band
}

function Get-BinaryProbability($card) {
  if ($null -eq $card -or $null -eq $card.binary_contract) { return $null }
  $value = $card.binary_contract.winning_probability
  if ($value -is [double] -or $value -is [decimal] -or $value -is [int]) {
    return [double]$value
  }
  $parsed = 0.0
  if ([double]::TryParse([string]$value, [ref]$parsed)) {
    return [double]$parsed
  }
  return $null
}

function Get-Median {
  param([double[]]$Values)
  if (-not $Values -or $Values.Count -eq 0) { return $null }
  $sorted = $Values | Sort-Object
  $count = $sorted.Count
  $mid = [math]::Floor($count / 2)
  if ($count % 2 -eq 0) {
    return [math]::Round((($sorted[$mid - 1] + $sorted[$mid]) / 2), 4)
  }
  return [math]::Round($sorted[$mid], 4)
}

function Convert-ResultRowToMarkdown {
  param($Row)
  return "| $($Row.query) | $($Row.local_status) | $($Row.remote_status) | $($Row.local_domain) | $($Row.remote_domain) | $($Row.local_winner) | $($Row.remote_winner) | $($Row.local_band) | $($Row.remote_band) | $($Row.probability_delta) |"
}

$queries = @(
  @{
    query = "Cosa passerà al referendum costituzionale di marzo in Italia? sì o no"
    expects_binary = $true
  },
  @{
    query = "Inter vs Juventus"
    expects_binary = $true
  },
  @{
    query = "Bitcoin next 30 days"
    expects_binary = $false
  },
  @{
    query = "La mia startup sopravviverà 12 mesi?"
    expects_binary = $true
  },
  @{
    query = "Dovrei aspettare prima di affittare a Roma?"
    expects_binary = $true
  }
)

$remoteToken = Get-RemoteToken -Audience $RemoteServiceUrl.TrimEnd("/")
$remoteHeaders = @{
  Authorization = "Bearer $remoteToken"
  "Content-Type" = "application/json"
}

$reportRows = @()
$local502Count = 0
$remoteCompletedStreak = 0
$maxRemoteCompletedStreak = 0
$binaryComparableProbabilityDeltas = @()
$binaryComparableCount = 0
$binaryWinnerMismatches = 0
$binaryMissingContracts = 0
$blockers = @()

foreach ($item in $queries) {
  $query = $item.query

  $localCompileResult = Invoke-LocalJsonWithRetry -Uri "$LocalApiBase/public/compile-query" -Body @{ query = $query }
  if (-not $localCompileResult.ok) {
    $localFailuresText = ($localCompileResult.failures -join "; ")
    if ($localFailuresText -match "502") { $local502Count += 1 }
    $reportRows += [pscustomobject]@{
      query = $query
      local_status = "failed"
      remote_status = "not_run"
      local_domain = ""
      remote_domain = ""
      local_call = ""
      remote_call = ""
      local_winner = ""
      remote_winner = ""
      local_band = ""
      remote_band = ""
      probability_delta = ""
      local_transport = ""
      remote_transport = ""
      local_failures = $localFailuresText
      remote_failures = ""
      local_card_state = ""
      remote_card_state = ""
      expects_binary = $item.expects_binary
      timeout = $false
    }
    $blockers += "local compile failed: $query"
    continue
  }

  $localPredictResult = Invoke-LocalJsonWithRetry -Uri "$LocalApiBase/public/predict" -Headers @{ "X-Crystal-Guest-Key" = "parity-local-0" } -Body @{
    query = $query
    queryPlan = (Get-QueryPlan -Response $localCompileResult.response)
  }
  $localFailuresText = ($localCompileResult.failures + $localPredictResult.failures) -join "; "
  if ($localFailuresText -match "502") { $local502Count += 1 }
  $localCard = if ($localPredictResult.ok) { $localPredictResult.response } else { $null }

  $remoteCompile = Invoke-JsonPost -Uri "$RemoteServiceUrl/v1/compile" -Headers $remoteHeaders -Body @{ query = $query }
  $runId = "parity_" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
  $remoteRun = Invoke-JsonPost -Uri "$RemoteServiceUrl/v1/runs" -Headers $remoteHeaders -Body @{
    runId = $runId
    queryText = $query
    queryPlan = (Get-QueryPlan -Response $remoteCompile)
    visibility = "private"
    engine = "extended"
    plan = "free"
    waitMs = 2000
    runtimeTransport = "remote"
    rolloutBucket = "parity:0"
  }
  $remoteWait = Wait-ForRemoteRun -RunId $runId -Headers $remoteHeaders -BaseUrl $RemoteServiceUrl
  $remoteState = $remoteWait.state
  $remoteCard = $remoteState.card
  $remoteStateStatus = Get-RunStatus -State $remoteState
  if ($remoteStateStatus -eq "completed") {
    $remoteCompletedStreak += 1
    if ($remoteCompletedStreak -gt $maxRemoteCompletedStreak) {
      $maxRemoteCompletedStreak = $remoteCompletedStreak
    }
  } else {
    $remoteCompletedStreak = 0
  }

  $localWinner = Get-BinaryWinner $localCard
  $remoteWinner = Get-BinaryWinner $remoteCard
  $localBand = Get-BinaryBand $localCard
  $remoteBand = Get-BinaryBand $remoteCard
  $localProbability = Get-BinaryProbability $localCard
  $remoteProbability = Get-BinaryProbability $remoteCard
  $probabilityDelta = if ($null -ne $localProbability -and $null -ne $remoteProbability) { [math]::Round([math]::Abs($localProbability - $remoteProbability), 4) } else { $null }

  if ($item.expects_binary) {
    if (-not $localCard.binary_contract -or -not $remoteCard.binary_contract) {
      $binaryMissingContracts += 1
    } else {
      $binaryComparableCount += 1
      $binaryComparableProbabilityDeltas += [double]$probabilityDelta
      if ($localWinner -ne $remoteWinner) {
        $binaryWinnerMismatches += 1
      }
    }
  }

  $reportRows += [pscustomobject]@{
    query = $query
    local_status = if ($localCard) { "completed" } else { "failed" }
    remote_status = $remoteStateStatus
    local_domain = if ($localCard) { [string]$localCard.domain } else { "" }
    remote_domain = if ($remoteCard) { [string]$remoteCard.domain } else { "" }
    local_call = if ($localCard) { [string]$localCard.primary_call } else { "" }
    remote_call = if ($remoteCard) { [string]$remoteCard.primary_call } else { "" }
    local_winner = $localWinner
    remote_winner = $remoteWinner
    local_band = $localBand
    remote_band = $remoteBand
    probability_delta = if ($null -eq $probabilityDelta) { "" } else { $probabilityDelta }
    local_transport = if ($localCard) { [string]$localCard.runtime_transport } else { "" }
    remote_transport = if ($remoteState.run) { [string]$remoteState.run.runtime_transport } else { "" }
    local_failures = $localFailuresText
    remote_failures = ($remoteWait.history | Where-Object { $_.error } | ForEach-Object { $_.error }) -join "; "
    local_card_state = if ($localCard) { [string]$localCard.card_state } else { "" }
    remote_card_state = if ($remoteCard) { [string]$remoteCard.card_state } else { "" }
    expects_binary = $item.expects_binary
    timeout = [bool]$remoteWait.timed_out
  }

  if (-not $localCard) {
    $blockers += "local predict failed: $query"
  }
  if ($remoteWait.timed_out) {
    $blockers += "remote timeout: $query"
  }
  if ($remoteStateStatus -eq "failed") {
    $blockers += "remote failed: $query"
  }
}

$winnerMismatchRate = if ($binaryComparableCount -gt 0) { [math]::Round(($binaryWinnerMismatches / $binaryComparableCount), 4) } else { $null }
$medianProbabilityDelta = Get-Median -Values $binaryComparableProbabilityDeltas
$missingBinaryContractRate = if (($queries | Where-Object { $_.expects_binary }).Count -gt 0) {
  [math]::Round(($binaryMissingContracts / ($queries | Where-Object { $_.expects_binary }).Count), 4)
} else {
  $null
}
$hasBinaryParity = ($binaryComparableCount -gt 0)
$zeroMismatch = ($hasBinaryParity -and $winnerMismatchRate -eq 0)
$deltaOk = ($hasBinaryParity -and $null -ne $medianProbabilityDelta -and $medianProbabilityDelta -lt 0.08)
$missingOk = ($missingBinaryContractRate -eq 0)
$remoteStreakOk = ($maxRemoteCompletedStreak -ge 3)
$api502Ok = ($local502Count -eq 0)

if (-not $hasBinaryParity) {
  $blockers += "binary parity unavailable on benchmark"
} elseif (-not $zeroMismatch) {
  $blockers += "binary winner mismatch present"
}
if (-not $hasBinaryParity -or $null -eq $medianProbabilityDelta) {
  $blockers += "median probability delta unavailable"
} elseif (-not $deltaOk) {
  $blockers += "median probability delta >= 0.08"
}
if (-not $missingOk) { $blockers += "missing binary contract on binary benchmark" }
if (-not $remoteStreakOk) { $blockers += "fewer than 3 consecutive remote completions" }
if (-not $api502Ok) { $blockers += "repeated 502 on direct API path" }

$blockers = $blockers | Select-Object -Unique
$verdict = if ($blockers.Count -eq 0) { "10% ready" } else { "hold at 0/0" }

$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  local_api_base = $LocalApiBase
  remote_service_url = $RemoteServiceUrl
  queries = $reportRows
  summary = [ordered]@{
    remote_max_completed_streak = $maxRemoteCompletedStreak
    binary_comparable_count = $binaryComparableCount
    binary_winner_mismatch_rate = $winnerMismatchRate
    median_probability_delta = $medianProbabilityDelta
    missing_binary_contract_rate = $missingBinaryContractRate
    direct_api_502_count = $local502Count
    verdict = $verdict
    blockers = @($blockers)
  }
}

$winnerMismatchText = if ($null -eq $winnerMismatchRate) { "n/a" } else { $winnerMismatchRate }
$medianProbabilityText = if ($null -eq $medianProbabilityDelta) { "n/a" } else { $medianProbabilityDelta }
$missingBinaryText = if ($null -eq $missingBinaryContractRate) { "n/a" } else { $missingBinaryContractRate }

$markdown = @(
  "# Direct API Parity Report - 2026-03-24",
  "",
  "## Summary",
  ('- Local API base: `{0}`' -f $LocalApiBase),
  ('- Remote service: `{0}`' -f $RemoteServiceUrl),
  ('- Remote max completed streak: `{0}`' -f $maxRemoteCompletedStreak),
  ('- Binary comparable pairs: `{0}`' -f $binaryComparableCount),
  ('- Winner mismatch rate: `{0}`' -f $winnerMismatchText),
  ('- Median probability delta: `{0}`' -f $medianProbabilityText),
  ('- Missing binary contract rate: `{0}`' -f $missingBinaryText),
  ('- Direct API 502 count: `{0}`' -f $local502Count),
  ('- Verdict: **{0}**' -f $verdict),
  "",
  "## Benchmark",
  "| Query | Local | Remote | Local domain | Remote domain | Local winner | Remote winner | Local band | Remote band | Delta |",
  "|---|---|---|---|---|---|---|---|---|---|"
)

foreach ($row in $reportRows) {
  $markdown += Convert-ResultRowToMarkdown -Row $row
}

$markdown += ""
$markdown += "## Blockers"
if ($blockers.Count -eq 0) {
  $markdown += "- None."
} else {
  foreach ($blocker in $blockers) {
    $markdown += "- $blocker"
  }
}

$jsonDir = Split-Path -Parent $OutputJsonPath
if ($jsonDir -and -not (Test-Path $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir | Out-Null
}
$markdownDir = Split-Path -Parent $OutputMarkdownPath
if ($markdownDir -and -not (Test-Path $markdownDir)) {
  New-Item -ItemType Directory -Path $markdownDir | Out-Null
}

$report | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputJsonPath -Encoding utf8
$markdown -join "`r`n" | Set-Content -Path $OutputMarkdownPath -Encoding utf8

Write-Host "Parity report written to $OutputMarkdownPath"
Write-Host "Parity JSON written to $OutputJsonPath"
Write-Host "Verdict: $verdict"
