param(
  [Parameter(Mandatory = $true)]
  [string]$AdapterBaseUrl,
  [string]$AdapterApiKey = "",
  [int]$MaxPollAttempts = 60,
  [int]$PollIntervalSec = 5
)

$ErrorActionPreference = "Stop"

$baseUrl = $AdapterBaseUrl.TrimEnd("/")
$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($AdapterApiKey)) {
  $headers["X-WorldSim-Key"] = $AdapterApiKey
}

Write-Host "Health check..."
$health = Invoke-RestMethod -Method Get -Uri "$baseUrl/health" -Headers $headers
$health | ConvertTo-Json -Depth 8

$jobId = "smoke-$([Guid]::NewGuid().ToString('N'))"
$payload = @{
  jobId = $jobId
  template = "public-discourse"
  query = "Will public sentiment shift after a major policy announcement in the next 30 days?"
  queryPlan = @{
    domain_id = "A.11.geopolitics.trade_tensions"
    horizons = @(@{ horizon_id = "30d" })
    filters = @{ confidence_preference = "rigorous" }
    entities = @(
      @{ label = "Government" }
      @{ label = "Media" }
      @{ label = "Public opinion" }
    )
  }
  userContext = @{
    location = "Rome"
    profession = "Founder"
    interests = @("geopolitics", "markets")
  }
  source = "smoke-test"
  sourceRef = "adapter-smoke"
  runtime = "mirofish-original"
  mode = "async"
  agentCount = 120
  depth = "lite"
  queue = "shared"
} | ConvertTo-Json -Depth 10

Write-Host "Creating job $jobId..."
$created = Invoke-RestMethod -Method Post -Uri "$baseUrl/worldsim/jobs" -Headers $headers -ContentType "application/json" -Body $payload
$created | ConvertTo-Json -Depth 8

$result = $null
for ($attempt = 1; $attempt -le $MaxPollAttempts; $attempt++) {
  Start-Sleep -Seconds $PollIntervalSec
  $result = Invoke-RestMethod -Method Get -Uri "$baseUrl/worldsim/jobs/$jobId/result" -Headers $headers
  Write-Host "Poll ${attempt}/${MaxPollAttempts} - status=$($result.status) progress=$($result.progress)"

  if ($result.status -in @("completed", "failed", "canceled")) {
    break
  }
}

if (-not $result) {
  throw "No result returned from the adapter."
}

$result | ConvertTo-Json -Depth 12

if ($result.status -ne "completed") {
  throw "WorldSim smoke test failed with status $($result.status)."
}

if (-not $result.digest) {
  throw "WorldSim smoke test completed but digest is missing."
}

Write-Host "Smoke test passed."
