param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceUrl,
  [string]$Region = "europe-west1"
)

$ErrorActionPreference = "Stop"

function Get-GcloudExecutable {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $exe = Get-Command gcloud.exe -ErrorAction SilentlyContinue
  if ($exe) { return $exe.Source }
  $fallback = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($fallback -and $fallback.Source -notlike "*.ps1") { return $fallback.Source }
  throw "gcloud non trovato."
}

$gcloud = Get-GcloudExecutable
$audience = $ServiceUrl.TrimEnd("/")
$token = (& $gcloud auth print-identity-token "--audiences=$audience" | Select-Object -First 1).Trim()
if (-not $token) {
  throw "Impossibile ottenere identity token per il servizio Cloud Run."
}

$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}

$health = Invoke-RestMethod -Method Get -Uri "$audience/health" -Headers $headers
$compile = Invoke-RestMethod -Method Post -Uri "$audience/v1/compile" -Headers $headers -Body (@{ query = "Bitcoin next 30 days" } | ConvertTo-Json)
$runId = "smoke_" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
$run = Invoke-RestMethod -Method Post -Uri "$audience/v1/runs" -Headers $headers -Body (@{
  runId = $runId
  queryText = "Will Bitcoin rise over the next 30 days?"
  queryPlan = $compile.query_plan
  visibility = "private"
  engine = "extended"
  plan = "free"
  waitMs = 4000
  runtimeTransport = "remote"
  rolloutBucket = "smoke:0"
} | ConvertTo-Json -Depth 6)

Write-Host "Health OK:" ($health.ok -eq $true)
Write-Host "Compile domain:" $compile.query_plan.primary_domain_id
Write-Host "Run status:" $run.status
if ($run.card) {
  Write-Host "Card state:" $run.card.card_state
}
