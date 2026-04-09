param(
  [string]$ProjectId = "omnicrystal",
  [string]$Region = "europe-west1",
  [string]$ServiceName = "crystal-core",
  [string]$JobName = "crystal-core-eval",
  [string]$ImageName = "crystal-core",
  [string]$TaskQueueName = "crystal-core-runs",
  [string]$RunnerServiceAccountEmail = "",
  [string]$FunctionsInvokerServiceAccountEmail = "",
  [string]$MirofishBaseUrl = "",
  [string]$MirofishApiKey = "",
  [string]$LlmProvider = "",
  [string]$LlmBaseUrl = "",
  [string]$LlmApiKey = "",
  [string]$LlmModelQuery = "",
  [string]$LlmModelForecast = "",
  [string]$LlmModelChat = "",
  [string]$LlmModelCopy = "",
  [string]$SportsProvider = "",
  [string]$SportsProviderBaseUrl = "",
  [string]$TheSportsDbApiKey = "",
  [string]$ApiFootballKey = "",
  [string]$SportsSemanticOverlayMode = "",
  [string]$SportsReleaseMode = "",
  [string]$FredApiKey = "",
  [string]$NominatimBaseUrl = "https://nominatim.openstreetmap.org",
  [string]$OverpassBaseUrl = "https://overpass-api.de/api/interpreter",
  [string]$WorldBankBaseUrl = "https://api.worldbank.org/v2",
  [string]$EurostatBaseUrl = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data",
  [string]$OecdBaseUrl = "https://stats.oecd.org/SDMX-JSON/data",
  [string]$OpenSkyBaseUrl = "https://opensky-network.org/api",
  [string]$OpenSkyUsername = "",
  [string]$OpenSkyPassword = "",
  [string]$OpenAqApiKey = "",
  [string]$OpenAqBaseUrl = "https://api.openaq.org/v3",
  [string]$EiaApiKey = "",
  [string]$EiaBaseUrl = "https://api.eia.gov/v2",
  [string]$GtfsStaticFeedsJson = "",
  [string]$GtfsRealtimeFeedsJson = "",
  [string]$OpenrouterSiteUrl = "https://omnicrystal.web.app",
  [string]$OpenrouterAppTitle = "Crystal",
  [int]$MinInstances = 1,
  [int]$MaxInstances = 5,
  [int]$Concurrency = 4
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
  throw "gcloud non trovato. Installa Google Cloud SDK prima di eseguire questo script."
}

function Invoke-GcloudChecked {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & $gcloud @Args 2>&1
    $exitCode = $LASTEXITCODE
    if ($output) {
      $output | ForEach-Object { Write-Host $_ }
    }
    if ($exitCode -ne 0) {
      throw "gcloud command failed: gcloud $($Args -join ' ')"
    }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Get-GcloudOptionalValue {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & $gcloud @Args 2>$null
    if ($LASTEXITCODE -ne 0) {
      return ""
    }
    return (($output | Select-Object -First 1) | Out-String).Trim()
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Invoke-GcloudBestEffort {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  try {
    Invoke-GcloudChecked @Args
    return $true
  } catch {
    Write-Warning ($_ | Out-String).Trim()
    return $false
  }
}

function Grant-ArtifactRegistryReader {
  param(
    [string]$Member,
    [string]$RepositoryName,
    [string]$Location,
    [string]$Project
  )

  if ([string]::IsNullOrWhiteSpace($Member)) {
    return
  }

  $repoBindingGranted = Invoke-GcloudBestEffort artifacts repositories add-iam-policy-binding $RepositoryName `
    --location $Location `
    --project $Project `
    --member $Member `
    --role "roles/artifactregistry.reader"

  if ($repoBindingGranted) {
    return
  }

  Write-Warning "Falling back to project-level Artifact Registry reader binding for $Member."
  Invoke-GcloudChecked projects add-iam-policy-binding $Project `
    --member $Member `
    --role "roles/artifactregistry.reader" `
    --condition=None
}

function New-EnvYamlFile {
  param(
    [string]$Path,
    [hashtable]$Entries
  )

  $lines = foreach ($key in $Entries.Keys) {
    $value = [string]$Entries[$key]
    $escaped = $value.Replace('"', '\"')
    "${key}: `"$escaped`""
  }

  Set-Content -Path $Path -Value $lines -Encoding ascii
}

$gcloud = Get-GcloudExecutable
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$imageUri = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ImageName"
$projectNumber = Get-GcloudOptionalValue projects describe $ProjectId --format "value(projectNumber)" --quiet

if ([string]::IsNullOrWhiteSpace($RunnerServiceAccountEmail)) {
  throw "RunnerServiceAccountEmail obbligatoria per Cloud Tasks -> Cloud Run."
}

Invoke-GcloudChecked config set project $ProjectId
Invoke-GcloudChecked services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com --project $ProjectId --quiet

$repoName = "cloud-run-source-deploy"
$repoExists = Get-GcloudOptionalValue artifacts repositories describe $repoName --location $Region --project $ProjectId --format "value(name)" --quiet
if ([string]::IsNullOrWhiteSpace($repoExists)) {
  Invoke-GcloudChecked artifacts repositories create $repoName --repository-format docker --location $Region --project $ProjectId
}

if (-not [string]::IsNullOrWhiteSpace($projectNumber)) {
  $cloudRunServiceAgent = "service-$projectNumber@serverless-robot-prod.iam.gserviceaccount.com"
  Grant-ArtifactRegistryReader `
    -Member "serviceAccount:$cloudRunServiceAgent" `
    -RepositoryName $repoName `
    -Location $Region `
    -Project $ProjectId
  if (-not [string]::IsNullOrWhiteSpace($RunnerServiceAccountEmail)) {
    Grant-ArtifactRegistryReader `
      -Member "serviceAccount:$RunnerServiceAccountEmail" `
      -RepositoryName $repoName `
      -Location $Region `
      -Project $ProjectId
  }
}

$queueExists = Get-GcloudOptionalValue tasks queues describe $TaskQueueName --location $Region --project $ProjectId --format "value(name)" --quiet
if ([string]::IsNullOrWhiteSpace($queueExists)) {
  Invoke-GcloudChecked tasks queues create $TaskQueueName --location $Region --project $ProjectId
}

$cloudBuildConfigPath = Join-Path $env:TEMP "crystal-core-cloudbuild.yaml"
@"
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-f', 'crystal-core/Dockerfile', '-t', '$imageUri', '.']
images:
- '$imageUri'
"@ | Set-Content -Path $cloudBuildConfigPath -Encoding ascii

Invoke-GcloudChecked builds submit $repoRoot --config $cloudBuildConfigPath --project $ProjectId

$serviceEnvEntries = @{
  "MIROFISH_BASE_URL" = $MirofishBaseUrl
  "MIROFISH_API_KEY" = $MirofishApiKey
  "CRYSTAL_CORE_TASK_QUEUE" = $TaskQueueName
  "CRYSTAL_CORE_TASK_LOCATION" = $Region
  "CRYSTAL_CORE_RUNNER_SERVICE_ACCOUNT_EMAIL" = $RunnerServiceAccountEmail
  "CRYSTAL_CORE_REGION" = $Region
  "LLM_PROVIDER" = $LlmProvider
  "LLM_BASE_URL" = $LlmBaseUrl
  "LLM_API_KEY" = $LlmApiKey
  "LLM_MODEL_QUERY" = $LlmModelQuery
  "LLM_MODEL_FORECAST" = $LlmModelForecast
  "LLM_MODEL_CHAT" = $LlmModelChat
  "LLM_MODEL_COPY" = $LlmModelCopy
  "SPORTS_PROVIDER" = $SportsProvider
  "SPORTS_PROVIDER_BASE_URL" = $SportsProviderBaseUrl
  "THE_SPORTS_DB_API_KEY" = $TheSportsDbApiKey
  "API_FOOTBALL_KEY" = $ApiFootballKey
  "SPORTS_SEMANTIC_OVERLAY_MODE" = $SportsSemanticOverlayMode
  "SPORTS_RELEASE_MODE" = $SportsReleaseMode
  "FRED_API_KEY" = $FredApiKey
  "NOMINATIM_BASE_URL" = $NominatimBaseUrl
  "OVERPASS_BASE_URL" = $OverpassBaseUrl
  "WORLD_BANK_BASE_URL" = $WorldBankBaseUrl
  "EUROSTAT_BASE_URL" = $EurostatBaseUrl
  "OECD_BASE_URL" = $OecdBaseUrl
  "OPENSKY_BASE_URL" = $OpenSkyBaseUrl
  "OPENSKY_USERNAME" = $OpenSkyUsername
  "OPENSKY_PASSWORD" = $OpenSkyPassword
  "OPENAQ_API_KEY" = $OpenAqApiKey
  "OPENAQ_BASE_URL" = $OpenAqBaseUrl
  "EIA_API_KEY" = $EiaApiKey
  "EIA_BASE_URL" = $EiaBaseUrl
  "GTFS_STATIC_FEEDS_JSON" = $GtfsStaticFeedsJson
  "GTFS_REALTIME_FEEDS_JSON" = $GtfsRealtimeFeedsJson
  "OPENROUTER_SITE_URL" = $OpenrouterSiteUrl
  "OPENROUTER_APP_TITLE" = $OpenrouterAppTitle
}

$serviceEnvFilePath = Join-Path $env:TEMP "crystal-core-service-env.yaml"
New-EnvYamlFile -Path $serviceEnvFilePath -Entries $serviceEnvEntries

Invoke-GcloudChecked run deploy $ServiceName `
  --image $imageUri `
  --platform managed `
  --region $Region `
  --no-allow-unauthenticated `
  --service-account $RunnerServiceAccountEmail `
  --port 8080 `
  --cpu 1 `
  --memory 1Gi `
  --timeout 900 `
  --concurrency $Concurrency `
  --min-instances $MinInstances `
  --max-instances $MaxInstances `
  --env-vars-file $serviceEnvFilePath `
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

$serviceUrl = (& $gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)" | Select-Object -First 1).Trim()

$serviceEnvEntries["CRYSTAL_CORE_SERVICE_URL"] = $serviceUrl
$serviceEnvEntries["CRYSTAL_CORE_EXECUTOR_AUDIENCE"] = $serviceUrl

$serviceEnvFileWithUrlPath = Join-Path $env:TEMP "crystal-core-service-env-with-url.yaml"
New-EnvYamlFile -Path $serviceEnvFileWithUrlPath -Entries $serviceEnvEntries

Invoke-GcloudChecked run deploy $ServiceName `
  --image $imageUri `
  --platform managed `
  --region $Region `
  --no-allow-unauthenticated `
  --service-account $RunnerServiceAccountEmail `
  --port 8080 `
  --cpu 1 `
  --memory 1Gi `
  --timeout 900 `
  --concurrency $Concurrency `
  --min-instances $MinInstances `
  --max-instances $MaxInstances `
  --env-vars-file $serviceEnvFileWithUrlPath `
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

$jobEnvEntries = @{
  "MIROFISH_BASE_URL" = $MirofishBaseUrl
  "MIROFISH_API_KEY" = $MirofishApiKey
  "CRYSTAL_CORE_REGION" = $Region
  "CRYSTAL_CORE_SERVICE_URL" = $serviceUrl
  "CRYSTAL_CORE_EXECUTOR_AUDIENCE" = $serviceUrl
  "LLM_PROVIDER" = $LlmProvider
  "LLM_BASE_URL" = $LlmBaseUrl
  "LLM_API_KEY" = $LlmApiKey
  "LLM_MODEL_QUERY" = $LlmModelQuery
  "LLM_MODEL_FORECAST" = $LlmModelForecast
  "LLM_MODEL_CHAT" = $LlmModelChat
  "LLM_MODEL_COPY" = $LlmModelCopy
  "SPORTS_PROVIDER" = $SportsProvider
  "SPORTS_PROVIDER_BASE_URL" = $SportsProviderBaseUrl
  "THE_SPORTS_DB_API_KEY" = $TheSportsDbApiKey
  "API_FOOTBALL_KEY" = $ApiFootballKey
  "SPORTS_SEMANTIC_OVERLAY_MODE" = $SportsSemanticOverlayMode
  "SPORTS_RELEASE_MODE" = $SportsReleaseMode
  "FRED_API_KEY" = $FredApiKey
  "NOMINATIM_BASE_URL" = $NominatimBaseUrl
  "OVERPASS_BASE_URL" = $OverpassBaseUrl
  "WORLD_BANK_BASE_URL" = $WorldBankBaseUrl
  "EUROSTAT_BASE_URL" = $EurostatBaseUrl
  "OECD_BASE_URL" = $OecdBaseUrl
  "OPENSKY_BASE_URL" = $OpenSkyBaseUrl
  "OPENSKY_USERNAME" = $OpenSkyUsername
  "OPENSKY_PASSWORD" = $OpenSkyPassword
  "OPENAQ_API_KEY" = $OpenAqApiKey
  "OPENAQ_BASE_URL" = $OpenAqBaseUrl
  "EIA_API_KEY" = $EiaApiKey
  "EIA_BASE_URL" = $EiaBaseUrl
  "GTFS_STATIC_FEEDS_JSON" = $GtfsStaticFeedsJson
  "GTFS_REALTIME_FEEDS_JSON" = $GtfsRealtimeFeedsJson
  "OPENROUTER_SITE_URL" = $OpenrouterSiteUrl
  "OPENROUTER_APP_TITLE" = $OpenrouterAppTitle
}

$jobEnvFilePath = Join-Path $env:TEMP "crystal-core-job-env.yaml"
New-EnvYamlFile -Path $jobEnvFilePath -Entries $jobEnvEntries

Invoke-GcloudChecked run jobs deploy $JobName `
  --image $imageUri `
  --region $Region `
  --service-account $RunnerServiceAccountEmail `
  --memory 1Gi `
  --cpu 1 `
  --tasks 1 `
  --max-retries 1 `
  --parallelism 1 `
  --command node `
  --args worker.js `
  --env-vars-file $jobEnvFilePath `
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

Invoke-GcloudChecked run services add-iam-policy-binding $ServiceName `
  --region $Region `
  --project $ProjectId `
  --member "serviceAccount:$RunnerServiceAccountEmail" `
  --role "roles/run.invoker"

if (-not [string]::IsNullOrWhiteSpace($FunctionsInvokerServiceAccountEmail)) {
  Invoke-GcloudChecked run services add-iam-policy-binding $ServiceName `
    --region $Region `
    --project $ProjectId `
    --member "serviceAccount:$FunctionsInvokerServiceAccountEmail" `
    --role "roles/run.invoker"
}

Write-Host ""
Write-Host "Deploy completato."
Write-Host "Service URL: $serviceUrl"
Write-Host "Project: $ProjectId"
Write-Host "Region: $Region"
Write-Host "Task Queue: $TaskQueueName"
Write-Host "Job Name: $JobName"
Write-Host ""
Write-Host "Configura poi Firebase Functions con:"
Write-Host "  CRYSTAL_CORE_BASE_URL=$serviceUrl"
Write-Host "  CRYSTAL_CORE_INVOKER_AUDIENCE=$serviceUrl"
Write-Host "  CRYSTAL_CORE_EVAL_JOB_NAME=$JobName"
Write-Host "  SPORTS_PROVIDER=$SportsProvider"
Write-Host "  SPORTS_PROVIDER_BASE_URL=$SportsProviderBaseUrl"
Write-Host "  THE_SPORTS_DB_API_KEY=$(if ($TheSportsDbApiKey) { '[set]' } else { '[default-or-empty]' })"
Write-Host "  SPORTS_SEMANTIC_OVERLAY_MODE=$(if ($SportsSemanticOverlayMode) { $SportsSemanticOverlayMode } else { '[default]' })"
Write-Host "  SPORTS_RELEASE_MODE=$(if ($SportsReleaseMode) { $SportsReleaseMode } else { '[default]' })"
