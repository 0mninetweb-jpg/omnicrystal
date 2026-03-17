param(
  [string]$ProjectId = "omnicrystal",
  [string]$Region = "europe-west1",
  [string]$ServiceName = "crystal-world-sim",
  [string]$ImageName = "crystal-world-sim",
  [string]$WorldSimApiKey = "",
  [string]$MirofishBackendUrl = "",
  [string]$VpcConnectorName = "",
  [string]$VpcEgress = "private-ranges-only",
  [string]$ServiceAccountEmail = "",
  [int]$HttpTimeoutSec = 180,
  [int]$PollIntervalSec = 5,
  [int]$StageTimeoutSec = 3600,
  [int]$MinInstances = 1,
  [int]$MaxInstances = 3,
  [switch]$DisableFallback,
  [switch]$NoCpuAlwaysOn
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud non trovato. Installa Google Cloud SDK prima di eseguire questo script."
}

if ([string]::IsNullOrWhiteSpace($WorldSimApiKey)) {
  $generated = [Guid]::NewGuid().ToString("N")
  $WorldSimApiKey = "crystal-world-sim-$generated"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$imageUri = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ImageName"

Write-Host "Imposto il progetto gcloud su $ProjectId..."
gcloud config set project $ProjectId | Out-Null

Write-Host "Abilito le API necessarie..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com vpcaccess.googleapis.com

Write-Host "Build dell'immagine Cloud Run..."
gcloud builds submit $scriptDir --tag $imageUri

if ([string]::IsNullOrWhiteSpace($MirofishBackendUrl)) {
  Write-Host "MIROFISH_BACKEND_URL non impostato: l'adapter andra in fallback mode." -ForegroundColor Yellow
}

$allowFallbackValue = if ($DisableFallback.IsPresent) { "false" } else { "true" }
$cpuFlag = if ($NoCpuAlwaysOn.IsPresent) { "--cpu-throttling" } else { "--no-cpu-throttling" }
$envVars = @(
  "WORLDSIM_API_KEY=$WorldSimApiKey"
  "MIROFISH_BACKEND_URL=$MirofishBackendUrl"
  "MIROFISH_HTTP_TIMEOUT_SEC=$HttpTimeoutSec"
  "MIROFISH_POLL_INTERVAL_SEC=$PollIntervalSec"
  "MIROFISH_STAGE_TIMEOUT_SEC=$StageTimeoutSec"
  "MIROFISH_JOB_DATA_DIR=.runtime/jobs"
  "MIROFISH_ALLOW_FALLBACK=$allowFallbackValue"
) -join ","

$deployArgs = @(
  "run", "deploy", $ServiceName,
  "--image", $imageUri,
  "--platform", "managed",
  "--region", $Region,
  "--allow-unauthenticated",
  "--port", "8081",
  "--cpu", "1",
  "--memory", "1Gi",
  "--timeout", "3600",
  "--min-instances", "$MinInstances",
  "--max-instances", "$MaxInstances",
  $cpuFlag,
  "--set-env-vars", $envVars
)

if (-not [string]::IsNullOrWhiteSpace($VpcConnectorName)) {
  $deployArgs += @("--vpc-connector", $VpcConnectorName, "--vpc-egress", $VpcEgress)
}

if (-not [string]::IsNullOrWhiteSpace($ServiceAccountEmail)) {
  $deployArgs += @("--service-account", $ServiceAccountEmail)
}

Write-Host "Deploy del servizio $ServiceName..."
& gcloud @deployArgs

$serviceUrl = gcloud run services describe $ServiceName --region $Region --format "value(status.url)"

Write-Host ""
Write-Host "Deploy completato."
Write-Host "Service URL: $serviceUrl"
Write-Host "WORLDSIM_API_KEY: $WorldSimApiKey"
Write-Host "MIROFISH_ALLOW_FALLBACK: $allowFallbackValue"
if (-not [string]::IsNullOrWhiteSpace($MirofishBackendUrl)) {
  Write-Host "MIROFISH_BACKEND_URL: $MirofishBackendUrl"
}
Write-Host ""
Write-Host "Prossimo passo: imposta questi valori anche per Firebase Functions:"
Write-Host "  MIROFISH_BASE_URL=$serviceUrl"
Write-Host "  MIROFISH_API_KEY=$WorldSimApiKey"
Write-Host "  WORLDSIM_BASE_URL=$serviceUrl"
Write-Host "  WORLDSIM_API_KEY=$WorldSimApiKey"
