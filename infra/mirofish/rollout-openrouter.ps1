param(
  [string]$ProjectId = "omnicrystal",
  [string]$Region = "europe-west1",
  [string]$Zone = "europe-west1-b",
  [string]$Network = "default",
  [string]$Subnetwork = "",
  [string]$InstanceName = "mirofish-runtime",
  [string]$MachineType = "e2-standard-8",
  [int]$DiskSizeGb = 150,
  [string]$ConnectorName = "crystal-wsim-vpc",
  [string]$ConnectorRange = "10.8.0.0/28",
  [string]$ServiceName = "crystal-world-sim",
  [string]$ImageName = "crystal-world-sim",
  [string]$ServiceAccountEmail = "",
  [string]$OpenRouterSiteUrl = "https://omnicrystal.web.app",
  [string]$OpenRouterAppTitle = "Crystal",
  [string]$GraphModel = "openai/gpt-4.1-mini",
  [string]$SimModel = "openai/gpt-4.1-mini",
  [string]$ReportModel = "openai/gpt-4.1",
  [string]$SportsProvider = "api-football",
  [string]$SportsProviderBaseUrl = "https://v3.football.api-sports.io",
  [string]$SportsApiKey = "",
  [Parameter(Mandatory = $true)]
  [string]$OpenRouterApiKey,
  [Parameter(Mandatory = $true)]
  [string]$ZepApiKey,
  [string]$WorldSimApiKey = "",
  [string]$SecretKey = "",
  [switch]$SkipFirebase,
  [switch]$DisableFallbackAfterValidation
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

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

function Invoke-FirebaseCli {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $command = "npx firebase-tools $($Args -join ' ')"
  & cmd.exe /c $command
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase CLI command failed: firebase-tools $($Args -join ' ')"
  }
}

function Test-GcloudAuth {
  param([string]$Gcloud)

  try {
    $token = (& $Gcloud auth print-access-token 2>$null | Select-Object -First 1).Trim()
    return -not [string]::IsNullOrWhiteSpace($token)
  } catch {
    return $false
  }
}

function Test-FirebaseLogin {
  try {
    $output = (& cmd.exe /c "npx firebase-tools login:list" 2>$null)
    return ($output -join "`n") -match "Logged in as"
  } catch {
    return $false
  }
}

function Test-FirebaseSecret {
  param(
    [string]$Name
  )

  $tmpPrefix = Join-Path $env:TEMP ("crystal-secret-check-" + [Guid]::NewGuid().ToString("N"))
  $stdout = "$tmpPrefix.out"
  $stderr = "$tmpPrefix.err"

  try {
    $proc = Start-Process `
      -FilePath "cmd.exe" `
      -ArgumentList "/c", "npx firebase-tools functions:secrets:access $Name --project $ProjectId" `
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

function Invoke-RemoteCommand {
  param(
    [string]$Gcloud,
    [string]$Instance,
    [string]$ZoneName,
    [string]$Project,
    [string]$Command
  )

  & $Gcloud compute ssh $Instance --zone $ZoneName --project $Project --quiet --command $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Remote command failed on $Instance"
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$gcloud = Get-GcloudExecutable

if (-not (Test-GcloudAuth -Gcloud $gcloud)) {
  throw "gcloud non ha credenziali attive. Esegui 'cmd /c gcloud auth login tommasotonarelli03@gmail.com' e riprova."
}

if ([string]::IsNullOrWhiteSpace($WorldSimApiKey)) {
  $WorldSimApiKey = "crystal-world-sim-$([Guid]::NewGuid().ToString('N'))"
}

if ([string]::IsNullOrWhiteSpace($SecretKey)) {
  $SecretKey = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
}

Write-Step "Setting gcloud project to $ProjectId"
& $gcloud config set project $ProjectId | Out-Null

Write-Step "Provisioning VM, firewall, and VPC connector"
$provisionScript = Join-Path $scriptDir "provision-gcp.ps1"
& $provisionScript `
  -ProjectId $ProjectId `
  -Region $Region `
  -Zone $Zone `
  -Network $Network `
  -Subnetwork $Subnetwork `
  -InstanceName $InstanceName `
  -MachineType $MachineType `
  -DiskSizeGb $DiskSizeGb `
  -ConnectorName $ConnectorName `
  -ConnectorRange $ConnectorRange
if ($LASTEXITCODE -ne 0) {
  throw "Provisioning failed."
}

$internalIp = (& $gcloud compute instances describe $InstanceName --zone $Zone --project $ProjectId --format "value(networkInterfaces[0].networkIP)" | Select-Object -First 1).Trim()
if ([string]::IsNullOrWhiteSpace($internalIp)) {
  throw "Unable to resolve the VM internal IP."
}

$remoteDir = "/tmp/crystal-mirofish-rollout"
$tempEnvPath = Join-Path $env:TEMP ("mirofish-" + [Guid]::NewGuid().ToString("N") + ".env")

$envContent = @(
  "SECRET_KEY=$SecretKey"
  "FLASK_DEBUG=False"
  "FLASK_HOST=0.0.0.0"
  "FLASK_PORT=5001"
  ""
  "LLM_API_KEY=$OpenRouterApiKey"
  "LLM_BASE_URL=https://openrouter.ai/api/v1"
  "LLM_MODEL_NAME=$GraphModel"
  "OPENROUTER_SITE_URL=$OpenRouterSiteUrl"
  "OPENROUTER_APP_TITLE=$OpenRouterAppTitle"
  "MIROFISH_GRAPH_MODEL=$GraphModel"
  "MIROFISH_SIM_MODEL=$SimModel"
  "MIROFISH_REPORT_MODEL=$ReportModel"
  ""
  "ZEP_API_KEY=$ZepApiKey"
  ""
  "OASIS_DEFAULT_MAX_ROUNDS=144"
  "REPORT_AGENT_MAX_TOOL_CALLS=5"
  "REPORT_AGENT_MAX_REFLECTION_ROUNDS=2"
  "REPORT_AGENT_TEMPERATURE=0.4"
) -join "`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tempEnvPath, $envContent, $utf8NoBom)

try {
  Write-Step "Staging VM setup assets"
  Invoke-RemoteCommand -Gcloud $gcloud -Instance $InstanceName -ZoneName $Zone -Project $ProjectId -Command "mkdir -p $remoteDir"

  & $gcloud compute scp `
    --quiet `
    --zone $Zone `
    --project $ProjectId `
    (Join-Path $scriptDir "setup-vm.sh") `
    (Join-Path $scriptDir "mirofish.service") `
    (Join-Path $scriptDir "configure-openrouter-runtime.py") `
    "$tempEnvPath" `
    "${InstanceName}:$remoteDir/"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy rollout assets to the VM."
  }

  Write-Step "Installing the original MiroFish runtime on the VM"
  $remoteSetup = @(
    "set -euo pipefail",
    "sudo mkdir -p /opt/mirofish",
    "sudo mv $remoteDir/$(Split-Path $tempEnvPath -Leaf) /opt/mirofish/.env",
    "sudo chmod 600 /opt/mirofish/.env",
    "sudo bash $remoteDir/setup-vm.sh",
    "sudo systemctl --no-pager --full status mirofish.service || true",
    "for i in $(seq 1 24); do curl -fsS http://127.0.0.1:5001/api/graph/project/list >/tmp/mirofish-projects.json && break; sleep 5; done",
    "test -s /tmp/mirofish-projects.json",
    "echo 'VM_RUNTIME_OK'"
  ) -join " && "
  Invoke-RemoteCommand -Gcloud $gcloud -Instance $InstanceName -ZoneName $Zone -Project $ProjectId -Command $remoteSetup

  Write-Step "Deploying the Cloud Run WorldSim adapter"
  $deployCloudRunScript = Join-Path $repoRoot "world-sim\deploy-cloudrun.ps1"
  & $deployCloudRunScript `
    -ProjectId $ProjectId `
    -Region $Region `
    -ServiceName $ServiceName `
    -ImageName $ImageName `
    -WorldSimApiKey $WorldSimApiKey `
    -MirofishBackendUrl "http://$internalIp:5001" `
    -VpcConnectorName $ConnectorName `
    -ServiceAccountEmail $ServiceAccountEmail `
    -MirofishProvider "openrouter" `
    -MirofishDefaultModel $GraphModel `
    -MirofishGraphModel $GraphModel `
    -MirofishSimModel $SimModel `
    -MirofishReportModel $ReportModel
  if ($LASTEXITCODE -ne 0) {
    throw "Cloud Run adapter deploy failed."
  }

  $adapterUrl = (& $gcloud run services describe $ServiceName --project $ProjectId --region $Region --format "value(status.url)" | Select-Object -First 1).Trim()
  if ([string]::IsNullOrWhiteSpace($adapterUrl)) {
    throw "Unable to resolve the Cloud Run adapter URL."
  }

  Write-Step "Running the live adapter smoke test"
  $smokeTestScript = Join-Path $scriptDir "smoke-test.ps1"
  & $smokeTestScript -AdapterBaseUrl $adapterUrl -AdapterApiKey $WorldSimApiKey
  if ($LASTEXITCODE -ne 0) {
    throw "Adapter smoke test failed."
  }

  if (-not $SkipFirebase) {
    Write-Step "Checking Firebase deploy prerequisites"
    if (-not (Test-FirebaseLogin)) {
      throw "Firebase CLI non autenticato. Esegui 'cmd /c npx firebase-tools login --reauth' e riprova."
    }

    $requiredSecrets = @(
      "GEMINI_API_KEY",
      "NIXTLA_API_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET"
    )
    $missingSecrets = @($requiredSecrets | Where-Object { -not (Test-FirebaseSecret -Name $_) })
    if ($missingSecrets.Count -gt 0) {
      throw "Missing Firebase Function secrets: $($missingSecrets -join ', ')"
    }

    Write-Step "Deploying Firebase Functions, Firestore rules, and Hosting"
    $deployFirebaseScript = Join-Path $scriptDir "deploy-firebase.ps1"
    & $deployFirebaseScript `
      -ProjectId $ProjectId `
      -AdapterBaseUrl $adapterUrl `
      -WorldSimApiKey $WorldSimApiKey `
      -LlmProvider "openrouter" `
      -LlmBaseUrl "https://openrouter.ai/api/v1" `
      -LlmApiKey $OpenRouterApiKey `
      -LlmModelQuery $GraphModel `
      -LlmModelForecast $GraphModel `
      -LlmModelChat $GraphModel `
      -LlmModelCopy $GraphModel `
      -SportsProvider $SportsProvider `
      -SportsProviderBaseUrl $SportsProviderBaseUrl `
      -SportsApiKey $SportsApiKey
    if ($LASTEXITCODE -ne 0) {
      throw "Firebase deploy failed."
    }

    Write-Step "Validating the public /api/health endpoint"
    $publicHealth = Invoke-RestMethod -Method Get -Uri "$OpenRouterSiteUrl/api/health"
    $publicHealth | ConvertTo-Json -Depth 8
  }

  if ($DisableFallbackAfterValidation) {
    Write-Step "Redeploying Cloud Run with fallback OFF"
    & $deployCloudRunScript `
      -ProjectId $ProjectId `
      -Region $Region `
      -ServiceName $ServiceName `
      -ImageName $ImageName `
      -WorldSimApiKey $WorldSimApiKey `
      -MirofishBackendUrl "http://$internalIp:5001" `
      -VpcConnectorName $ConnectorName `
      -ServiceAccountEmail $ServiceAccountEmail `
      -MirofishProvider "openrouter" `
      -MirofishDefaultModel $GraphModel `
      -MirofishGraphModel $GraphModel `
      -MirofishSimModel $SimModel `
      -MirofishReportModel $ReportModel `
      -DisableFallback
    if ($LASTEXITCODE -ne 0) {
      throw "Fallback-off redeploy failed."
    }
  }

  Write-Host ""
  Write-Host "OpenRouter backend rollout completed." -ForegroundColor Green
  Write-Host "VM internal URL: http://$internalIp:5001"
  Write-Host "Adapter URL: $adapterUrl"
  Write-Host "Shared adapter key: $WorldSimApiKey"
  if (-not $DisableFallbackAfterValidation) {
    Write-Host "Fallback is still ON. After manual app validation, rerun this script with -DisableFallbackAfterValidation."
  }
} finally {
  Remove-Item $tempEnvPath -Force -ErrorAction SilentlyContinue
}
