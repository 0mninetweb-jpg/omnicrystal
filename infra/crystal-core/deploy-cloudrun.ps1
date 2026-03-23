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
  [int]$MinInstances = 1,
  [int]$MaxInstances = 5,
  [int]$Concurrency = 4
)

$ErrorActionPreference = "Stop"

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

$gcloud = Get-GcloudExecutable
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$imageUri = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ImageName"

if ([string]::IsNullOrWhiteSpace($RunnerServiceAccountEmail)) {
  throw "RunnerServiceAccountEmail obbligatoria per Cloud Tasks -> Cloud Run."
}

Invoke-GcloudChecked config set project $ProjectId
Invoke-GcloudChecked services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com --project $ProjectId --quiet

$repoName = "cloud-run-source-deploy"
& $gcloud artifacts repositories describe $repoName --location $Region --project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-GcloudChecked artifacts repositories create $repoName --repository-format docker --location $Region --project $ProjectId
}

& $gcloud tasks queues describe $TaskQueueName --location $Region --project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-GcloudChecked tasks queues create $TaskQueueName --location $Region --project $ProjectId
}

Invoke-GcloudChecked builds submit $repoRoot --tag $imageUri --file "$repoRoot\crystal-core\Dockerfile" --project $ProjectId

$envVars = @(
  "MIROFISH_BASE_URL=$MirofishBaseUrl"
  "MIROFISH_API_KEY=$MirofishApiKey"
  "CRYSTAL_CORE_TASK_QUEUE=$TaskQueueName"
  "CRYSTAL_CORE_TASK_LOCATION=$Region"
  "CRYSTAL_CORE_RUNNER_SERVICE_ACCOUNT_EMAIL=$RunnerServiceAccountEmail"
  "CRYSTAL_CORE_REGION=$Region"
) -join ","

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
  --set-env-vars $envVars `
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

$serviceUrl = (& $gcloud run services describe $ServiceName --region $Region --project $ProjectId --format "value(status.url)" | Select-Object -First 1).Trim()

$serviceEnvVars = @(
  "MIROFISH_BASE_URL=$MirofishBaseUrl"
  "MIROFISH_API_KEY=$MirofishApiKey"
  "CRYSTAL_CORE_TASK_QUEUE=$TaskQueueName"
  "CRYSTAL_CORE_TASK_LOCATION=$Region"
  "CRYSTAL_CORE_RUNNER_SERVICE_ACCOUNT_EMAIL=$RunnerServiceAccountEmail"
  "CRYSTAL_CORE_REGION=$Region"
  "CRYSTAL_CORE_SERVICE_URL=$serviceUrl"
  "CRYSTAL_CORE_EXECUTOR_AUDIENCE=$serviceUrl"
) -join ","

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
  --set-env-vars $serviceEnvVars `
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

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
  --set-env-vars "CRYSTAL_CORE_REGION=$Region,CRYSTAL_CORE_SERVICE_URL=$serviceUrl,CRYSTAL_CORE_EXECUTOR_AUDIENCE=$serviceUrl" `
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
