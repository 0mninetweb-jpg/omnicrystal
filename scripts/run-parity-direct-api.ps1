param(
  [string]$LocalApiBase = "https://api-paaqyfwena-ew.a.run.app",
  [string]$RemoteServiceUrl = "https://crystal-core-paaqyfwena-ew.a.run.app",
  [string]$OutputMarkdownPath = "docs/parity-report-2026-03-24.md",
  [string]$OutputJsonPath = "docs/parity-report-2026-03-24.json",
  [string]$ProbeFixturePath = "scripts/fixtures/parity-benchmark-cases.json",
  [string]$SportsProbeOutputPath = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = Split-Path -Parent $PSScriptRoot

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

function Resolve-CanonicalRemoteServiceUrl {
  param([string]$FallbackUrl)
  $gcloud = Get-GcloudExecutable
  try {
    $resolved = (& $gcloud run services describe crystal-core --region europe-west1 --project omnicrystal --format "value(status.url)" 2>$null | Select-Object -First 1).Trim()
    if ($resolved) {
      return $resolved.TrimEnd("/")
    }
  } catch {
  }
  return $FallbackUrl.TrimEnd("/")
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

function Get-SportsGrounding($card) {
  if ($null -eq $card) { return $null }
  if ($card.PSObject.Properties.Name -contains "sports_grounding" -and $null -ne $card.sports_grounding) {
    return $card.sports_grounding
  }
  return $null
}

function Get-PublicationBasis($card) {
  if ($null -eq $card) { return $null }
  if ($card.PSObject.Properties.Name -contains "publication_basis" -and $null -ne $card.publication_basis) {
    return $card.publication_basis
  }
  return $null
}

function Get-SportsSemanticOverlay($card) {
  if ($null -eq $card) { return $null }
  if ($card.PSObject.Properties.Name -contains "sports_semantic_overlay" -and $null -ne $card.sports_semantic_overlay) {
    return $card.sports_semantic_overlay
  }
  return $null
}

function Get-SportsGrounded($card) {
  if ($null -eq $card) { return $false }
  $grounding = Get-SportsGrounding $card
  $publicationBasis = Get-PublicationBasis $card
  if ($card.PSObject.Properties.Name -contains "sports_grounded" -and [bool]$card.sports_grounded) {
    return $true
  }
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_grounded" -and [bool]$grounding.sports_grounded) {
    return $true
  }
  if ($null -ne $publicationBasis -and $publicationBasis.PSObject.Properties.Name -contains "sports_grounded" -and [bool]$publicationBasis.sports_grounded) {
    return $true
  }
  if ($null -ne $grounding) {
    $providerConfigured = $grounding.PSObject.Properties.Name -contains "provider_configured" -and [bool]$grounding.provider_configured
    $fixtureResolved = $grounding.PSObject.Properties.Name -contains "fixture_resolved" -and [bool]$grounding.fixture_resolved
    if ($providerConfigured -and $fixtureResolved) {
      return $true
    }
  }
  return $false
}

function Get-SportsParityReady($card) {
  $grounding = Get-SportsGrounding $card
  if ($null -eq $grounding) { return $false }
  return [bool]($grounding.provider_required -and $grounding.provider_configured -and $grounding.fixture_resolved -and $grounding.parity_ready)
}

function Get-SportsSemanticReady($card) {
  if ($null -eq $card) { return $false }
  if ($card.PSObject.Properties.Name -contains "sports_semantic_ready") {
    return [bool]$card.sports_semantic_ready
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "semantic_ready") {
    return [bool]$grounding.semantic_ready
  }
  return $false
}

function Get-SportsPublishGateReady($card) {
  if ($null -eq $card) { return $false }
  if ($card.PSObject.Properties.Name -contains "sports_publish_gate_ready") {
    return [bool]$card.sports_publish_gate_ready
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "publish_gate_ready") {
    return [bool]$grounding.publish_gate_ready
  }
  return $false
}

function Get-SportsOverlayBlockerReason($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sports_overlay_blocker_reason") {
    return [string]$card.sports_overlay_blocker_reason
  }
  $publicationBasis = Get-PublicationBasis $card
  if ($null -ne $publicationBasis -and $publicationBasis.PSObject.Properties.Name -contains "sports_overlay_blocker_reason") {
    return [string]$publicationBasis.sports_overlay_blocker_reason
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "overlay_blocker_reason") {
    return [string]$grounding.overlay_blocker_reason
  }
  $semanticOverlay = Get-SportsSemanticOverlay $card
  if ($null -ne $semanticOverlay -and $semanticOverlay.PSObject.Properties.Name -contains "blocker_reason") {
    return [string]$semanticOverlay.blocker_reason
  }
  return ""
}

function Get-SportsGroundingFlag($card, [string]$name) {
  $grounding = Get-SportsGrounding $card
  if ($null -eq $grounding) { return $false }
  if ($grounding.PSObject.Properties.Name -contains $name) {
    return [bool]$grounding.$name
  }
  return $false
}

function Get-SportsGroundingReason($card) {
  $grounding = Get-SportsGrounding $card
  if ($null -eq $grounding) { return "" }
  if ($grounding.PSObject.Properties.Name -contains "reason") {
    return [string]$grounding.reason
  }
  return ""
}

function Get-SportsMarketOverlay($card) {
  if ($null -eq $card) { return $null }
  if ($card.PSObject.Properties.Name -contains "sports_market_overlay" -and $null -ne $card.sports_market_overlay) {
    return $card.sports_market_overlay
  }
  return $null
}

function Get-SportsbookReadinessState($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sportsbook_readiness_state") {
    return [string]$card.sportsbook_readiness_state
  }
  $publicationBasis = Get-PublicationBasis $card
  if ($null -ne $publicationBasis -and $publicationBasis.PSObject.Properties.Name -contains "sportsbook_readiness_state") {
    return [string]$publicationBasis.sportsbook_readiness_state
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sportsbook_readiness_state") {
    return [string]$grounding.sportsbook_readiness_state
  }
  $overlay = Get-SportsMarketOverlay $card
  if ($null -ne $overlay -and $overlay.PSObject.Properties.Name -contains "sportsbook_readiness_state") {
    return [string]$overlay.sportsbook_readiness_state
  }
  return ""
}

function Get-SportsMarketOverlayAvailable($card) {
  $overlay = Get-SportsMarketOverlay $card
  if ($null -eq $overlay) {
    return -not [string]::IsNullOrWhiteSpace((Get-SportsMarketSourceClass $card))
  }
  if ($overlay.PSObject.Properties.Name -contains "available") {
    return [bool]$overlay.available
  }
  return -not [string]::IsNullOrWhiteSpace((Get-SportsMarketSourceClass $card))
}

function Get-CardState($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "card_state") {
    return [string]$card.card_state
  }
  return ""
}

function Get-SportsPickState($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sports_pick_state") {
    $value = [string]$card.sports_pick_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_pick_state") {
    $value = [string]$grounding.sports_pick_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $publicationBasis = Get-PublicationBasis $card
  if ($null -ne $publicationBasis -and $publicationBasis.PSObject.Properties.Name -contains "sports_pick_state") {
    $value = [string]$publicationBasis.sports_pick_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  if (Get-SportsGrounded $card) {
    return "grounded_lean"
  }
  return "hold"
}

function Get-FixtureWindowState($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "fixture_window_state") {
    $value = [string]$card.fixture_window_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "fixture_window_state") {
    $value = [string]$grounding.fixture_window_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $publicationBasis = Get-PublicationBasis $card
  if ($null -ne $publicationBasis -and $publicationBasis.PSObject.Properties.Name -contains "fixture_window_state") {
    $value = [string]$publicationBasis.fixture_window_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $semanticOverlay = Get-SportsSemanticOverlay $card
  if ($null -ne $semanticOverlay -and $semanticOverlay.PSObject.Properties.Name -contains "fixture_window_state") {
    $value = [string]$semanticOverlay.fixture_window_state
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  if (Get-SportsGrounded $card) { return "resolved" }
  return "unresolved"
}

function Get-FixtureWindowOpen($card) {
  if ($null -eq $card) { return $false }
  if ($card.PSObject.Properties.Name -contains "fixture_window_open") {
    if ([bool]$card.fixture_window_open) { return $true }
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "fixture_window_open") {
    if ([bool]$grounding.fixture_window_open) { return $true }
  }
  $publicationBasis = Get-PublicationBasis $card
  if ($null -ne $publicationBasis -and $publicationBasis.PSObject.Properties.Name -contains "fixture_window_open") {
    if ([bool]$publicationBasis.fixture_window_open) { return $true }
  }
  $semanticOverlay = Get-SportsSemanticOverlay $card
  if ($null -ne $semanticOverlay -and $semanticOverlay.PSObject.Properties.Name -contains "fixture_window_open") {
    if ([bool]$semanticOverlay.fixture_window_open) { return $true }
  }
  return $false
}

function Get-SportsFixtureKind($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sports_fixture_kind") {
    return [string]$card.sports_fixture_kind
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_fixture_kind") {
    return [string]$grounding.sports_fixture_kind
  }
  return ""
}

function Get-SportsFixtureCandidateScore($card) {
  if ($null -eq $card) { return $null }
  if ($card.PSObject.Properties.Name -contains "sports_fixture_candidate_score") {
    return [double]$card.sports_fixture_candidate_score
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_fixture_candidate_score") {
    return [double]$grounding.sports_fixture_candidate_score
  }
  return $null
}

function Get-SportsMarketSource($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sports_market_source") {
    $value = [string]$card.sports_market_source
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_market_source") {
    $value = [string]$grounding.sports_market_source
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  $overlay = Get-SportsMarketOverlay $card
  if ($null -ne $overlay -and $overlay.PSObject.Properties.Name -contains "sports_market_source") {
    $value = [string]$overlay.sports_market_source
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
  }
  return ""
}

function Get-SportsMarketSourceClass($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sports_market_source_class") {
    $value = [string]$card.sports_market_source_class
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "none") { return $value }
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_market_source_class") {
    $value = [string]$grounding.sports_market_source_class
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "none") { return $value }
  }
  $overlay = Get-SportsMarketOverlay $card
  if ($null -ne $overlay -and $overlay.PSObject.Properties.Name -contains "sports_market_source_class") {
    $value = [string]$overlay.sports_market_source_class
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "none") { return $value }
  }
  return "none"
}

function Get-SportsMarketQualityTier($card) {
  if ($null -eq $card) { return "" }
  if ($card.PSObject.Properties.Name -contains "sports_market_quality_tier") {
    $value = [string]$card.sports_market_quality_tier
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "none") { return $value }
  }
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "sports_market_quality_tier") {
    $value = [string]$grounding.sports_market_quality_tier
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "none") { return $value }
  }
  $overlay = Get-SportsMarketOverlay $card
  if ($null -ne $overlay -and $overlay.PSObject.Properties.Name -contains "sports_market_quality_tier") {
    $value = [string]$overlay.sports_market_quality_tier
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "none") { return $value }
  }
  return "none"
}

function Test-BinaryContractPresent($card) {
  if ($null -eq $card -or $null -eq $card.binary_contract) { return $false }
  return -not [string]::IsNullOrWhiteSpace([string]$card.binary_contract.question_side_a) -and
    -not [string]::IsNullOrWhiteSpace([string]$card.binary_contract.question_side_b) -and
    -not [string]::IsNullOrWhiteSpace([string]$card.binary_contract.winning_side)
}

function Test-SportsOperationalCard {
  param(
    $Card,
    [string]$Mode = "forecast"
  )

  if (-not (Get-SportsParityReady $Card)) { return $false }
  if (-not (Test-BinaryContractPresent $Card)) { return $false }

  $cardState = Get-CardState $Card
  if (@("limited", "published") -notcontains $cardState) { return $false }

  $pickState = Get-SportsPickState $Card
  if ([string]::IsNullOrWhiteSpace($pickState) -and $cardState -eq "limited") {
    $pickState = "grounded_lean"
  }
  $validPickState = @("grounded_lean", "publishable_controlled", "publishable_full")
  if ($validPickState -notcontains $pickState) { return $false }

  if ($Mode -eq "probability") {
    $sportsbookState = Get-SportsbookReadinessState $Card
    return @("probability_mode_preview", "probability_mode_live") -contains $sportsbookState
  }

  return $true
}

function Get-SportsSideA($card) {
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "question_side_a") {
    return [string]$grounding.question_side_a
  }
  if ($null -ne $card -and $null -ne $card.binary_contract) {
    return [string]$card.binary_contract.question_side_a
  }
  return ""
}

function Get-SportsSideB($card) {
  $grounding = Get-SportsGrounding $card
  if ($null -ne $grounding -and $grounding.PSObject.Properties.Name -contains "question_side_b") {
    return [string]$grounding.question_side_b
  }
  if ($null -ne $card -and $null -ne $card.binary_contract) {
    return [string]$card.binary_contract.question_side_b
  }
  return ""
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

$legacyParityQueries = @(
  @{
    query = "Cosa passerà al referendum costituzionale di marzo in Italia? sì o no"
    expects_binary = $true
  },
  @{
    query = "Inter Milan vs Roma 2026-04-05"
    expects_binary = $true
  },
  @{
    query = "Will Inter Milan beat Roma on 2026-04-05?"
    expects_binary = $true
  },
  @{
    query = "Inter vs Juventus"
    expects_binary = $false
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

$legacyParityQueriesNormalized = @(
  @{
    query = "Cosa passera al referendum costituzionale di marzo in Italia? si o no"
    expects_binary = $true
  },
  @{
    query = "Inter Milan vs Roma 2026-04-05"
    expects_binary = $true
  },
  @{
    query = "Will Inter Milan beat Roma on 2026-04-05?"
    expects_binary = $true
  },
  @{
    query = "Inter vs Juventus"
    expects_binary = $false
  },
  @{
    query = "Bitcoin next 30 days"
    expects_binary = $false
  },
  @{
    query = "La mia startup sopravvivera 12 mesi?"
    expects_binary = $true
  },
  @{
    query = "Dovrei aspettare prima di affittare a Roma?"
    expects_binary = $true
  }
)

$probeFixtureFullPath = Resolve-RepoPath $ProbeFixturePath
if (-not (Test-Path $probeFixtureFullPath)) {
  throw "Benchmark fixture file non trovato: $probeFixtureFullPath"
}

$fixtureConfig = Get-Content -Path $probeFixtureFullPath -Raw | ConvertFrom-Json
$queries = @($fixtureConfig.queries)
if ($queries.Count -eq 0) {
  throw "Il benchmark parity non contiene query."
}

$probeDate = Get-Date -Format "yyyy-MM-dd"
if ([string]::IsNullOrWhiteSpace($SportsProbeOutputPath)) {
  $SportsProbeOutputPath = "docs/sports-probe-$probeDate.json"
}
$sportsProbeOutputFullPath = Resolve-RepoPath $SportsProbeOutputPath

$sportsProbeIds = $fixtureConfig.sports_probes
$a29ProbeId = [string]$sportsProbeIds.a29
$b36ProbeId = [string]$sportsProbeIds.b36
$sportsHoldRegressionId = [string]$sportsProbeIds.hold_regression

$RemoteServiceUrl = Resolve-CanonicalRemoteServiceUrl -FallbackUrl $RemoteServiceUrl
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
$sportsProbeReady = $false
$sportsProbabilityProbeReady = $false
$blockers = @()

foreach ($item in $queries) {
  $queryId = [string]$item.id
  $query = $item.query

  $localCompileResult = Invoke-LocalJsonWithRetry -Uri "$LocalApiBase/public/compile-query" -Body @{ query = $query }
  if (-not $localCompileResult.ok) {
    $localFailuresText = ($localCompileResult.failures -join "; ")
    if ($localFailuresText -match "502") { $local502Count += 1 }
    $reportRows += [pscustomobject]@{
      query_id = $queryId
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

  $localGuestKey = "parity-local-" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
  $localPredictResult = Invoke-LocalJsonWithRetry -Uri "$LocalApiBase/public/predict" -Headers @{ "X-Crystal-Guest-Key" = $localGuestKey } -Body @{
    query = $query
    queryPlan = (Get-QueryPlan -Response $localCompileResult.response)
  }
  $localFailuresText = ($localCompileResult.failures + $localPredictResult.failures) -join "; "
  if ($localFailuresText -match "502") { $local502Count += 1 }
  $localCard = if ($localPredictResult.ok) { $localPredictResult.response } else { $null }

  $remoteCompile = Invoke-JsonPost -Uri "$RemoteServiceUrl/v1/compile" -Headers $remoteHeaders -Body @{ query = $query }
  $remoteQueryPlan = Get-QueryPlan -Response $remoteCompile
  $runId = "parity_" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
  $remoteRun = Invoke-JsonPost -Uri "$RemoteServiceUrl/v1/runs" -Headers $remoteHeaders -Body @{
    runId = $runId
    queryText = $query
    queryPlan = $remoteQueryPlan
    query_plan = $remoteQueryPlan
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
  $sportsProbe = @($a29ProbeId, $b36ProbeId, $sportsHoldRegressionId) -contains $queryId
  $a29Probe = ($queryId -eq $a29ProbeId)
  $b36Probe = ($queryId -eq $b36ProbeId)
  $localSportsReady = if ($sportsProbe) { Get-SportsParityReady $localCard } else { $false }
  $remoteSportsReady = if ($sportsProbe) { Get-SportsParityReady $remoteCard } else { $false }
  $localSportsGrounded = if ($sportsProbe) { Get-SportsGrounded $localCard } else { $false }
  $remoteSportsGrounded = if ($sportsProbe) { Get-SportsGrounded $remoteCard } else { $false }
  $localSportsSemanticReady = if ($sportsProbe) { Get-SportsSemanticReady $localCard } else { $false }
  $remoteSportsSemanticReady = if ($sportsProbe) { Get-SportsSemanticReady $remoteCard } else { $false }
  $localSportsPublishGateReady = if ($sportsProbe) { Get-SportsPublishGateReady $localCard } else { $false }
  $remoteSportsPublishGateReady = if ($sportsProbe) { Get-SportsPublishGateReady $remoteCard } else { $false }
  $localSideA = if ($sportsProbe) { Get-SportsSideA $localCard } else { "" }
  $remoteSideA = if ($sportsProbe) { Get-SportsSideA $remoteCard } else { "" }
  $localSideB = if ($sportsProbe) { Get-SportsSideB $localCard } else { "" }
  $remoteSideB = if ($sportsProbe) { Get-SportsSideB $remoteCard } else { "" }
  $localProviderConfigured = if ($sportsProbe) { Get-SportsGroundingFlag $localCard "provider_configured" } else { $false }
  $remoteProviderConfigured = if ($sportsProbe) { Get-SportsGroundingFlag $remoteCard "provider_configured" } else { $false }
  $localFixtureResolved = if ($sportsProbe) { Get-SportsGroundingFlag $localCard "fixture_resolved" } else { $false }
  $remoteFixtureResolved = if ($sportsProbe) { Get-SportsGroundingFlag $remoteCard "fixture_resolved" } else { $false }
  $localSportsReason = if ($sportsProbe) { Get-SportsGroundingReason $localCard } else { "" }
  $remoteSportsReason = if ($sportsProbe) { Get-SportsGroundingReason $remoteCard } else { "" }
  $localSportsOverlayBlockerReason = if ($sportsProbe) { Get-SportsOverlayBlockerReason $localCard } else { "" }
  $remoteSportsOverlayBlockerReason = if ($sportsProbe) { Get-SportsOverlayBlockerReason $remoteCard } else { "" }
  $localSportsMarketOverlayAvailable = if ($sportsProbe) { Get-SportsMarketOverlayAvailable $localCard } else { $false }
  $remoteSportsMarketOverlayAvailable = if ($sportsProbe) { Get-SportsMarketOverlayAvailable $remoteCard } else { $false }
  $localSportsbookReadinessState = if ($sportsProbe) { Get-SportsbookReadinessState $localCard } else { "" }
  $remoteSportsbookReadinessState = if ($sportsProbe) { Get-SportsbookReadinessState $remoteCard } else { "" }
  $localSportsPickState = if ($sportsProbe) { Get-SportsPickState $localCard } else { "" }
  $remoteSportsPickState = if ($sportsProbe) { Get-SportsPickState $remoteCard } else { "" }
  $localFixtureWindowState = if ($sportsProbe) { Get-FixtureWindowState $localCard } else { "" }
  $remoteFixtureWindowState = if ($sportsProbe) { Get-FixtureWindowState $remoteCard } else { "" }
  $localFixtureWindowOpen = if ($sportsProbe) { Get-FixtureWindowOpen $localCard } else { $false }
  $remoteFixtureWindowOpen = if ($sportsProbe) { Get-FixtureWindowOpen $remoteCard } else { $false }
  $localSportsFixtureKind = if ($sportsProbe) { Get-SportsFixtureKind $localCard } else { "" }
  $remoteSportsFixtureKind = if ($sportsProbe) { Get-SportsFixtureKind $remoteCard } else { "" }
  $localSportsFixtureCandidateScore = if ($sportsProbe) { Get-SportsFixtureCandidateScore $localCard } else { $null }
  $remoteSportsFixtureCandidateScore = if ($sportsProbe) { Get-SportsFixtureCandidateScore $remoteCard } else { $null }
  $localSportsMarketSource = if ($sportsProbe) { Get-SportsMarketSource $localCard } else { "" }
  $remoteSportsMarketSource = if ($sportsProbe) { Get-SportsMarketSource $remoteCard } else { "" }
  $localSportsMarketSourceClass = if ($sportsProbe) { Get-SportsMarketSourceClass $localCard } else { "" }
  $remoteSportsMarketSourceClass = if ($sportsProbe) { Get-SportsMarketSourceClass $remoteCard } else { "" }
  $localSportsMarketQualityTier = if ($sportsProbe) { Get-SportsMarketQualityTier $localCard } else { "" }
  $remoteSportsMarketQualityTier = if ($sportsProbe) { Get-SportsMarketQualityTier $remoteCard } else { "" }
  $localSportsOperational = if ($a29Probe) { Test-SportsOperationalCard -Card $localCard -Mode "forecast" } elseif ($b36Probe) { Test-SportsOperationalCard -Card $localCard -Mode "probability" } else { $false }
  $remoteSportsOperational = if ($a29Probe) { Test-SportsOperationalCard -Card $remoteCard -Mode "forecast" } elseif ($b36Probe) { Test-SportsOperationalCard -Card $remoteCard -Mode "probability" } else { $false }

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
    query_id = $queryId
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
    local_sports_grounded = $localSportsGrounded
    remote_sports_grounded = $remoteSportsGrounded
    local_sports_ready = $localSportsReady
    remote_sports_ready = $remoteSportsReady
    local_sports_semantic_ready = $localSportsSemanticReady
    remote_sports_semantic_ready = $remoteSportsSemanticReady
    local_sports_publish_gate_ready = $localSportsPublishGateReady
    remote_sports_publish_gate_ready = $remoteSportsPublishGateReady
    local_side_a = $localSideA
    remote_side_a = $remoteSideA
    local_side_b = $localSideB
    remote_side_b = $remoteSideB
    local_provider_configured = $localProviderConfigured
    remote_provider_configured = $remoteProviderConfigured
    local_fixture_resolved = $localFixtureResolved
    remote_fixture_resolved = $remoteFixtureResolved
    local_sports_reason = $localSportsReason
    remote_sports_reason = $remoteSportsReason
    local_sports_overlay_blocker_reason = $localSportsOverlayBlockerReason
    remote_sports_overlay_blocker_reason = $remoteSportsOverlayBlockerReason
    local_sports_market_overlay_available = $localSportsMarketOverlayAvailable
    remote_sports_market_overlay_available = $remoteSportsMarketOverlayAvailable
    local_sportsbook_readiness_state = $localSportsbookReadinessState
    remote_sportsbook_readiness_state = $remoteSportsbookReadinessState
    local_sports_pick_state = $localSportsPickState
    remote_sports_pick_state = $remoteSportsPickState
    local_fixture_window_state = $localFixtureWindowState
    remote_fixture_window_state = $remoteFixtureWindowState
    local_fixture_window_open = $localFixtureWindowOpen
    remote_fixture_window_open = $remoteFixtureWindowOpen
    local_sports_fixture_kind = $localSportsFixtureKind
    remote_sports_fixture_kind = $remoteSportsFixtureKind
    local_sports_fixture_candidate_score = $localSportsFixtureCandidateScore
    remote_sports_fixture_candidate_score = $remoteSportsFixtureCandidateScore
    local_sports_market_source = $localSportsMarketSource
    remote_sports_market_source = $remoteSportsMarketSource
    local_sports_market_source_class = $localSportsMarketSourceClass
    remote_sports_market_source_class = $remoteSportsMarketSourceClass
    local_sports_market_quality_tier = $localSportsMarketQualityTier
    remote_sports_market_quality_tier = $remoteSportsMarketQualityTier
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
  if ($sportsProbe) {
    if ($a29Probe -and $localSportsOperational -and $remoteSportsOperational) {
      $sportsProbeReady = $true
    }
    if ($b36Probe -and $localSportsOperational -and $remoteSportsOperational) {
      $sportsProbabilityProbeReady = $true
    }
    if (($a29Probe -or $b36Probe) -and -not $localSportsReady) {
      $blockers += "sports provider grounding unavailable on local_core: $query (configured=$localProviderConfigured, fixture_resolved=$localFixtureResolved, reason=$localSportsReason)"
    }
    if (($a29Probe -or $b36Probe) -and -not $remoteSportsReady) {
      $blockers += "sports provider grounding unavailable on remote: $query (configured=$remoteProviderConfigured, fixture_resolved=$remoteFixtureResolved, reason=$remoteSportsReason)"
    }
    if (($a29Probe -or $b36Probe) -and $localSportsGrounded -ne $remoteSportsGrounded) {
      $blockers += "sports grounded mismatch: $query"
    }
    if (($a29Probe -or $b36Probe) -and $localSportsReady -and $remoteSportsReady) {
      if ($localSideA -ne $remoteSideA -or $localSideB -ne $remoteSideB) {
        $blockers += "sports fixture side ordering mismatch: $query"
      }
      if ($localWinner -ne $remoteWinner) {
        $blockers += "sports winning side mismatch: $query"
      }
      if ($localBand -ne $remoteBand) {
        $blockers += "sports band mismatch: $query"
      }
      if ($localCard.card_state -ne $remoteCard.card_state) {
        $blockers += "sports card_state mismatch: $query"
      }
    }
  }
}

$binaryRows = @($reportRows | Where-Object { $_.expects_binary })
$binaryComparableRows = @($binaryRows | Where-Object {
  $_.local_status -eq "completed" -and
  $_.remote_status -eq "completed" -and
  [string]::IsNullOrWhiteSpace([string]$_.local_winner) -eq $false -and
  [string]::IsNullOrWhiteSpace([string]$_.remote_winner) -eq $false
})
$binaryComparableCount = $binaryComparableRows.Count
$binaryWinnerMismatches = @($binaryComparableRows | Where-Object { [string]$_.local_winner -ne [string]$_.remote_winner }).Count
$binaryComparableProbabilityDeltas = @(
  $binaryComparableRows |
    Where-Object { [string]::IsNullOrWhiteSpace([string]$_.probability_delta) -eq $false } |
    ForEach-Object { [double]$_.probability_delta }
)
$binaryMissingContracts = @($binaryRows | Where-Object {
  $_.local_status -ne "completed" -or
  $_.remote_status -ne "completed" -or
  [string]::IsNullOrWhiteSpace([string]$_.local_winner) -or
  [string]::IsNullOrWhiteSpace([string]$_.remote_winner)
}).Count

$winnerMismatchRate = if ($binaryComparableCount -gt 0) { [math]::Round(($binaryWinnerMismatches / $binaryComparableCount), 4) } else { $null }
$medianProbabilityDelta = Get-Median -Values $binaryComparableProbabilityDeltas
$missingBinaryContractRate = if ($binaryRows.Count -gt 0) {
  [math]::Round(($binaryMissingContracts / $binaryRows.Count), 4)
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
if (-not $sportsProbeReady) { $blockers += "A.29 sports probe is not live-ready on the dated fixture benchmark" }
if (-not $sportsProbabilityProbeReady) { $blockers += "B.3.6 sports probability probe is not live-ready on the dated fixture benchmark" }

$blockers = $blockers | Select-Object -Unique
$verdict = if ($blockers.Count -eq 0) { "10% ready" } else { "hold at 0/0" }
$sportsProbeRow = $reportRows | Where-Object { $_.query_id -eq $a29ProbeId } | Select-Object -First 1
$sportsProbabilityProbeRow = $reportRows | Where-Object { $_.query_id -eq $b36ProbeId } | Select-Object -First 1
$sportsHoldRegressionRow = $reportRows | Where-Object { $_.query_id -eq $sportsHoldRegressionId } | Select-Object -First 1
$sportsProbeSemanticReady = if ($sportsProbeRow) { [bool]($sportsProbeRow.local_sports_semantic_ready -and $sportsProbeRow.remote_sports_semantic_ready) } else { $false }
$sportsProbePublishGateReady = if ($sportsProbeRow) { [bool]($sportsProbeRow.local_sports_publish_gate_ready -and $sportsProbeRow.remote_sports_publish_gate_ready) } else { $false }
$sportsProbeMarketOverlayAvailable = if ($sportsProbeRow) { [bool]($sportsProbeRow.local_sports_market_overlay_available -and $sportsProbeRow.remote_sports_market_overlay_available) } else { $false }
$sportsProbeMarketSourceClass =
  if ($sportsProbeRow -and [string]$sportsProbeRow.local_sports_market_source_class -eq [string]$sportsProbeRow.remote_sports_market_source_class) {
    [string]$sportsProbeRow.local_sports_market_source_class
  } else {
    ""
  }
$sportsProbeFixtureKind =
  if ($sportsProbeRow -and [string]$sportsProbeRow.local_sports_fixture_kind -eq [string]$sportsProbeRow.remote_sports_fixture_kind) {
    [string]$sportsProbeRow.local_sports_fixture_kind
  } else {
    ""
  }
$sportsProbePickState = if ($sportsProbeRow -and [string]$sportsProbeRow.local_sports_pick_state -eq [string]$sportsProbeRow.remote_sports_pick_state) {
  [string]$sportsProbeRow.local_sports_pick_state
} else {
  ""
}
$sportsProbeSportsbookReadinessState =
  if ($sportsProbeRow -and [string]$sportsProbeRow.local_sportsbook_readiness_state -eq [string]$sportsProbeRow.remote_sportsbook_readiness_state) {
    [string]$sportsProbeRow.local_sportsbook_readiness_state
  } else {
    ""
  }
$sportsProbabilityProbePickState = if ($sportsProbabilityProbeRow -and [string]$sportsProbabilityProbeRow.local_sports_pick_state -eq [string]$sportsProbabilityProbeRow.remote_sports_pick_state) {
  [string]$sportsProbabilityProbeRow.local_sports_pick_state
} else {
  ""
}
$sportsBinaryRows = @($reportRows | Where-Object {
  (@($a29ProbeId, $b36ProbeId) -contains [string]$_.query_id) -and [bool]$_.expects_binary
})
$sportsBinaryComparableRows = @($sportsBinaryRows | Where-Object {
  $_.local_status -eq "completed" -and
  $_.remote_status -eq "completed" -and
  [string]::IsNullOrWhiteSpace([string]$_.local_winner) -eq $false -and
  [string]::IsNullOrWhiteSpace([string]$_.remote_winner) -eq $false
})
$sportsBinaryComparableCount = $sportsBinaryComparableRows.Count
$sportsBinaryWinnerMismatches = @($sportsBinaryComparableRows | Where-Object { [string]$_.local_winner -ne [string]$_.remote_winner }).Count
$sportsWinnerMismatchRate = if ($sportsBinaryComparableCount -gt 0) {
  [math]::Round(($sportsBinaryWinnerMismatches / $sportsBinaryComparableCount), 4)
} else {
  $null
}
$sportsBinaryMissingContracts = @($sportsBinaryRows | Where-Object {
  [string]::IsNullOrWhiteSpace([string]$_.local_winner) -or [string]::IsNullOrWhiteSpace([string]$_.remote_winner)
}).Count
$sportsMissingBinaryContractRate = if ($sportsBinaryRows.Count -gt 0) {
  [math]::Round(($sportsBinaryMissingContracts / $sportsBinaryRows.Count), 4)
} else {
  $null
}
$sportsHoldRegressionGreen =
  if ($sportsHoldRegressionRow) {
    $localHoldSafe = (@("limited", "blocked") -contains [string]$sportsHoldRegressionRow.local_card_state) -and -not [bool]$sportsHoldRegressionRow.local_fixture_window_open
    $remoteHoldSafe = (@("limited", "blocked") -contains [string]$sportsHoldRegressionRow.remote_card_state) -and -not [bool]$sportsHoldRegressionRow.remote_fixture_window_open
    ($sportsHoldRegressionRow.local_status -eq "completed") -and
    ($sportsHoldRegressionRow.remote_status -eq "completed") -and
    $localHoldSafe -and
    $remoteHoldSafe
  } else {
    $true
  }
$fixtureResolutionFailures = @($reportRows | Where-Object {
  (@($a29ProbeId, $b36ProbeId) -contains [string]$_.query_id) -and
  (-not [bool]$_.local_fixture_resolved -or -not [bool]$_.remote_fixture_resolved)
}).Count
$entityAlignmentFailures = @($reportRows | Where-Object {
  (@($a29ProbeId, $b36ProbeId, $sportsHoldRegressionId) -contains [string]$_.query_id) -and
  (
    [string]$_.local_sports_overlay_blocker_reason -match 'entity_alignment' -or
    [string]$_.remote_sports_overlay_blocker_reason -match 'entity_alignment'
  )
}).Count
$staleEvidenceFailures = @($reportRows | Where-Object {
  $queryId = [string]$_.query_id
  if (@($a29ProbeId, $b36ProbeId, $sportsHoldRegressionId) -notcontains $queryId) { return $false }

  $staleSignal =
    ([string]$_.local_sports_overlay_blocker_reason -match 'stale|fixture_window_not_live') -or
    ([string]$_.remote_sports_overlay_blocker_reason -match 'stale|fixture_window_not_live') -or
    ([string]$_.local_fixture_window_state -match 'past|scheduled_far|date_mismatch') -or
    ([string]$_.remote_fixture_window_state -match 'past|scheduled_far|date_mismatch')

  if (-not $staleSignal) { return $false }

  if ($queryId -eq $sportsHoldRegressionId) {
    return -not $sportsHoldRegressionGreen
  }

  $rowReady =
    [bool]$_.local_sports_ready -and
    [bool]$_.remote_sports_ready -and
    (@("grounded_lean", "publishable_controlled", "publishable_full") -contains [string]$_.local_sports_pick_state) -and
    (@("grounded_lean", "publishable_controlled", "publishable_full") -contains [string]$_.remote_sports_pick_state)

  return -not $rowReady
}).Count
$sportsLocalRemoteGreen =
  ($sportsProbeReady -and
   $sportsProbabilityProbeReady -and
   $sportsHoldRegressionGreen -and
   $sportsBinaryComparableCount -gt 0 -and
   $sportsWinnerMismatchRate -eq 0 -and
   ($null -ne $sportsMissingBinaryContractRate) -and
   $sportsMissingBinaryContractRate -eq 0)
$localRemoteGreen = ($sportsProbeReady -and $sportsProbabilityProbeReady -and $zeroMismatch -and $missingOk)

$report = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  local_api_base = $LocalApiBase
  remote_service_url = $RemoteServiceUrl
  queries = $reportRows
  summary = [ordered]@{
    remote_max_completed_streak = $maxRemoteCompletedStreak
    binary_comparable_count = $binaryComparableCount
    binary_winner_mismatch_rate = $winnerMismatchRate
    winner_mismatch_rate = $winnerMismatchRate
    median_probability_delta = $medianProbabilityDelta
    missing_binary_contract_rate = $missingBinaryContractRate
    direct_api_502_count = $local502Count
    sports_probe_ready = $sportsProbeReady
    sports_probe_semantic_ready = $sportsProbeSemanticReady
    sports_probe_publish_gate_ready = $sportsProbePublishGateReady
    sports_probe_market_overlay_available = $sportsProbeMarketOverlayAvailable
    sports_probe_market_source_class = $sportsProbeMarketSourceClass
    sports_probe_fixture_kind = $sportsProbeFixtureKind
    sports_probe_pick_state = $sportsProbePickState
    sports_probe_sportsbook_readiness_state = $sportsProbeSportsbookReadinessState
    sports_probability_probe_ready = $sportsProbabilityProbeReady
    sports_probability_probe_pick_state = $sportsProbabilityProbePickState
    sports_probability_probe_sportsbook_readiness_state =
      if ($sportsProbabilityProbeRow -and [string]$sportsProbabilityProbeRow.local_sportsbook_readiness_state -eq [string]$sportsProbabilityProbeRow.remote_sportsbook_readiness_state) {
        [string]$sportsProbabilityProbeRow.local_sportsbook_readiness_state
      } else {
        ""
      }
    sports_binary_comparable_count = $sportsBinaryComparableCount
    sports_winner_mismatch_rate = $sportsWinnerMismatchRate
    sports_missing_binary_contract_rate = $sportsMissingBinaryContractRate
    sports_hold_regression_green = $sportsHoldRegressionGreen
    sports_local_remote_green = $sportsLocalRemoteGreen
    local_remote_green = $localRemoteGreen
    fixture_resolution_failures = $fixtureResolutionFailures
    entity_alignment_failures = $entityAlignmentFailures
    stale_evidence_failures = $staleEvidenceFailures
    sharp_market_probe_count = @($reportRows | Where-Object { [string]$_.local_sports_market_source_class -eq "sharp" -and [string]$_.remote_sports_market_source_class -eq "sharp" }).Count
    verdict = $verdict
    blockers = @($blockers)
  }
}

$sportsProbeReport = [ordered]@{
  generated_at = (Get-Date).ToString("o")
  source_parity_report = (Resolve-RepoPath $OutputJsonPath)
  a29_probe = $sportsProbeRow
  b36_probe = $sportsProbabilityProbeRow
  hold_regression_probe = $sportsHoldRegressionRow
  summary = [ordered]@{
    a29_ready = $sportsProbeReady
    b36_ready = $sportsProbabilityProbeReady
    winner_mismatch_rate = $sportsWinnerMismatchRate
    missing_binary_contract_rate = $sportsMissingBinaryContractRate
    local_remote_green = $sportsLocalRemoteGreen
    fixture_resolution_failures = $fixtureResolutionFailures
    entity_alignment_failures = $entityAlignmentFailures
    stale_evidence_failures = $staleEvidenceFailures
    hold_regression_green = $sportsHoldRegressionGreen
    market_source_class = $sportsProbeMarketSourceClass
    fixture_kind = $sportsProbeFixtureKind
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
  ('- Sports probe ready: `{0}`' -f $sportsProbeReady),
  ('- Sports semantic ready: `{0}`' -f $report.summary.sports_probe_semantic_ready),
  ('- Sports publish gate ready: `{0}`' -f $report.summary.sports_probe_publish_gate_ready),
  ('- Sports market overlay available: `{0}`' -f $report.summary.sports_probe_market_overlay_available),
  ('- Sports market source class: `{0}`' -f $report.summary.sports_probe_market_source_class),
  ('- Sports fixture kind: `{0}`' -f $report.summary.sports_probe_fixture_kind),
  ('- Sports pick state: `{0}`' -f $report.summary.sports_probe_pick_state),
  ('- Sportsbook readiness state: `{0}`' -f $report.summary.sports_probe_sportsbook_readiness_state),
  ('- Sports probability probe ready: `{0}`' -f $report.summary.sports_probability_probe_ready),
  ('- Sports probability pick state: `{0}`' -f $report.summary.sports_probability_probe_pick_state),
  ('- Sports probability readiness state: `{0}`' -f $report.summary.sports_probability_probe_sportsbook_readiness_state),
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
$sportsProbeDir = Split-Path -Parent $sportsProbeOutputFullPath
if ($sportsProbeDir -and -not (Test-Path $sportsProbeDir)) {
  New-Item -ItemType Directory -Path $sportsProbeDir | Out-Null
}

$report | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputJsonPath -Encoding utf8
$markdown -join "`r`n" | Set-Content -Path $OutputMarkdownPath -Encoding utf8
$sportsProbeReport | ConvertTo-Json -Depth 12 | Set-Content -Path $sportsProbeOutputFullPath -Encoding utf8

Write-Host "Parity report written to $OutputMarkdownPath"
Write-Host "Parity JSON written to $OutputJsonPath"
Write-Host "Sports probe JSON written to $sportsProbeOutputFullPath"
Write-Host "Verdict: $verdict"
