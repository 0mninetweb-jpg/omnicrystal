param(
  [string]$ProjectId = "omnicrystal-3b286",
  [string]$Region = "europe-west1",
  [string]$ServiceName = "crystal-world-sim",
  [string]$ImageName = "crystal-world-sim",
  [string]$WorldSimApiKey = ""
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
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

Write-Host "Build dell'immagine Cloud Run..."
gcloud builds submit $scriptDir --tag $imageUri

Write-Host "Deploy del servizio $ServiceName..."
gcloud run deploy $ServiceName `
  --image $imageUri `
  --platform managed `
  --region $Region `
  --allow-unauthenticated `
  --port 8081 `
  --set-env-vars "WORLDSIM_API_KEY=$WorldSimApiKey"

$serviceUrl = gcloud run services describe $ServiceName --region $Region --format "value(status.url)"

Write-Host ""
Write-Host "Deploy completato."
Write-Host "Service URL: $serviceUrl"
Write-Host "WORLDSIM_API_KEY: $WorldSimApiKey"
Write-Host ""
Write-Host "Prossimo passo: imposta questi valori anche per Firebase Functions:"
Write-Host "  WORLDSIM_BASE_URL=$serviceUrl"
Write-Host "  WORLDSIM_API_KEY=$WorldSimApiKey"
