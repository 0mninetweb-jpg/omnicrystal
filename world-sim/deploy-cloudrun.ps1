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
  [string]$MirofishProvider = "openrouter",
  [string]$MirofishDefaultModel = "openai/gpt-4.1-mini",
  [string]$MirofishGraphModel = "openai/gpt-4.1-mini",
  [string]$MirofishSimModel = "openai/gpt-4.1-mini",
  [string]$MirofishReportModel = "openai/gpt-4.1",
  [int]$HttpTimeoutSec = 180,
  [int]$PollIntervalSec = 5,
  [int]$StageTimeoutSec = 3600,
  [int]$MinInstances = 1,
  [int]$MaxInstances = 3,
  [switch]$DisableFallback,
  [switch]$NoCpuAlwaysOn
)

$ErrorActionPreference = "Stop"

function Get-GcloudExecutable {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $exe = Get-Command gcloud.exe -ErrorAction SilentlyContinue
  if ($exe) {
    return $exe.Source
  }

  $fallback = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($fallback -and $fallback.Source -notlike "*.ps1") {
    return $fallback.Source
  }

  throw "gcloud non trovato. Installa Google Cloud SDK prima di eseguire questo script."
}

function Test-GcloudCommand {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $tmpPrefix = Join-Path $env:TEMP ("gcloud-worldsim-test-" + [Guid]::NewGuid().ToString("N"))
  $stdout = "$tmpPrefix.out"
  $stderr = "$tmpPrefix.err"

  try {
    $proc = Start-Process `
      -FilePath $gcloud `
      -ArgumentList $Args `
      -NoNewWindow `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -Wait `
      -PassThru

    return $proc.ExitCode -eq 0
  } finally {
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-GcloudChecked {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $tmpPrefix = Join-Path $env:TEMP ("gcloud-worldsim-" + [Guid]::NewGuid().ToString("N"))
  $stdout = "$tmpPrefix.out"
  $stderr = "$tmpPrefix.err"

  try {
    $proc = Start-Process `
      -FilePath $gcloud `
      -ArgumentList $Args `
      -NoNewWindow `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -Wait `
      -PassThru

    if (Test-Path $stdout) {
      Get-Content -Path $stdout
    }
    if (Test-Path $stderr) {
      Get-Content -Path $stderr
    }

    if ($proc.ExitCode -ne 0) {
      throw "gcloud command failed: gcloud $($Args -join ' ')"
    }
  } finally {
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}

$gcloud = Get-GcloudExecutable
$activeAccount = (& $gcloud auth list "--filter=status:ACTIVE" "--format=value(account)" 2>$null | Select-Object -First 1)
if (-not $activeAccount) {
  throw "Nessun account gcloud autenticato. Esegui 'cmd /c gcloud auth login' e riprova."
}

if ([string]::IsNullOrWhiteSpace($WorldSimApiKey)) {
  $generated = [Guid]::NewGuid().ToString("N")
  $WorldSimApiKey = "crystal-world-sim-$generated"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$imageUri = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ImageName"

Write-Host "Imposto il progetto gcloud su $ProjectId..."
& $gcloud config set project $ProjectId | Out-Null

Write-Host "Abilito le API necessarie..."
Invoke-GcloudChecked services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com vpcaccess.googleapis.com --project $ProjectId --quiet

Write-Host "Build dell'immagine Cloud Run..."
$repoName = "cloud-run-source-deploy"
if (-not (Test-GcloudCommand artifacts repositories describe $repoName --location $Region --project $ProjectId)) {
  Write-Host "Creo il repository Artifact Registry $repoName..."
  Invoke-GcloudChecked artifacts repositories create $repoName --repository-format docker --location $Region --project $ProjectId
}

Invoke-GcloudChecked builds submit $scriptDir --tag $imageUri --project $ProjectId

if ([string]::IsNullOrWhiteSpace($MirofishBackendUrl)) {
  Write-Host "MIROFISH_BACKEND_URL non impostato: l'adapter andra in fallback mode." -ForegroundColor Yellow
}

$allowFallbackValue = if ($DisableFallback.IsPresent) { "false" } else { "true" }
$cpuFlag = if ($NoCpuAlwaysOn.IsPresent) { "--cpu-throttling" } else { "--no-cpu-throttling" }
$envVars = @(
  "WORLDSIM_API_KEY=$WorldSimApiKey"
  "MIROFISH_BACKEND_URL=$MirofishBackendUrl"
  "MIROFISH_PROVIDER=$MirofishProvider"
  "MIROFISH_DEFAULT_MODEL=$MirofishDefaultModel"
  "MIROFISH_GRAPH_MODEL=$MirofishGraphModel"
  "MIROFISH_SIM_MODEL=$MirofishSimModel"
  "MIROFISH_REPORT_MODEL=$MirofishReportModel"
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
Invoke-GcloudChecked @deployArgs

$serviceUrl = (& $gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)" | Select-Object -First 1).Trim()

Write-Host ""
Write-Host "Deploy completato."
Write-Host "Service URL: $serviceUrl"
Write-Host "WORLDSIM_API_KEY: $WorldSimApiKey"
Write-Host "MIROFISH_ALLOW_FALLBACK: $allowFallbackValue"
if (-not [string]::IsNullOrWhiteSpace($MirofishBackendUrl)) {
  Write-Host "MIROFISH_BACKEND_URL: $MirofishBackendUrl"
}
Write-Host "MIROFISH_PROVIDER: $MirofishProvider"
Write-Host "MIROFISH_MODELS: default=$MirofishDefaultModel, graph=$MirofishGraphModel, sim=$MirofishSimModel, report=$MirofishReportModel"
Write-Host ""
Write-Host "Prossimo passo: imposta questi valori anche per Firebase Functions:"
Write-Host "  MIROFISH_BASE_URL=$serviceUrl"
Write-Host "  MIROFISH_API_KEY=$WorldSimApiKey"
Write-Host "  WORLDSIM_BASE_URL=$serviceUrl"
Write-Host "  WORLDSIM_API_KEY=$WorldSimApiKey"
