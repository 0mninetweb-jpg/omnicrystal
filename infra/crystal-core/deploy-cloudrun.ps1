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
  & $gcloud @Args
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud command failed: gcloud $($Args -join ' ')"
  }
}

function New-EnvYamlFile {
  param(
    [string]$Path,
    [hashtable]$Entries
  )

  $lines = foreach ($key in $Entries.Keys) {
    $value = [string]$Entries[$key]
    if ([string]::IsNullOrWhiteSpace($value)) { continue }
    $escaped = $value.Replace('"', '\"')
    "${key}: `"$escaped`""
  }

  Set-Content -Path $Path -Value $lines -Encoding ascii
}

$gcloud = Get-GcloudExecutable
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$imageUri = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ImageName"

if ([string]::IsNullOrWhiteSpace($RunnerServiceAccountEmail)) {
  throw "RunnerServiceAccountEmail obbligatoria per Cloud Tasks -> Cloud Run."
}

Invoke-GcloudChecked config set project $ProjectId
Invoke-GcloudChecked services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com --project $ProjectId --quiet

$repoName = "cloud-run-source-deploy"
$repoExists = (& $gcloud artifacts repositories describe $repoName --location $Region --project $ProjectId --format "value(name)" 2>$null | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoExists)) {
  Invoke-GcloudChecked artifacts repositories create $repoName --repository-format docker --location $Region --project $ProjectId
}

$queueExists = (& $gcloud tasks queues describe $TaskQueueName --location $Region --project $ProjectId --format "value(name)" 2>$null | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($queueExists)) {
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
