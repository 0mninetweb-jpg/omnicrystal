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
  [string]$RuntimeTag = "mirofish-runtime",
  [int]$RuntimePort = 5001
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

function Invoke-GcloudChecked {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $tmpPrefix = Join-Path $env:TEMP ("gcloud-provision-" + [Guid]::NewGuid().ToString("N"))
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

    $output = @()
    if (Test-Path $stdout) {
      $output += Get-Content -Path $stdout
    }
    if (Test-Path $stderr) {
      $output += Get-Content -Path $stderr
    }

    if ($proc.ExitCode -ne 0) {
      throw (($output | Out-String).Trim())
    }

    return $output
  } finally {
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}

function Test-GcloudResource {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $tmpPrefix = Join-Path $env:TEMP ("gcloud-provision-test-" + [Guid]::NewGuid().ToString("N"))
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

$gcloud = Get-GcloudExecutable
$activeAccount = (& $gcloud auth list "--filter=status:ACTIVE" "--format=value(account)" 2>$null | Select-Object -First 1)
if (-not $activeAccount) {
  throw "Nessun account gcloud autenticato. Esegui 'cmd /c gcloud auth login' e riprova."
}

Write-Host "Imposto il progetto gcloud su $ProjectId..."
& $gcloud config set project $ProjectId | Out-Null

Write-Host "Abilito le API necessarie..."
Invoke-GcloudChecked services enable compute.googleapis.com vpcaccess.googleapis.com run.googleapis.com --project $ProjectId --quiet | Out-Null

$connectorExists = Test-GcloudResource compute networks vpc-access connectors describe $ConnectorName --region $Region --project $ProjectId

if (-not $connectorExists) {
  Write-Host "Creo il Serverless VPC Access connector $ConnectorName..."
  $connectorArgs = @(
    "compute", "networks", "vpc-access", "connectors", "create", $ConnectorName,
    "--region", $Region,
    "--network", $Network,
    "--range", $ConnectorRange
  )
  if (-not [string]::IsNullOrWhiteSpace($Subnetwork)) {
    $connectorArgs += @("--subnet", $Subnetwork)
  }
  Invoke-GcloudChecked @connectorArgs | Out-Null
} else {
  Write-Host "VPC connector $ConnectorName gia presente."
}

$firewallRuleName = "allow-mirofish-from-$($ConnectorName.ToLower())"
$firewallExists = Test-GcloudResource compute firewall-rules describe $firewallRuleName --project $ProjectId

if (-not $firewallExists) {
  Write-Host "Creo la firewall rule $firewallRuleName per la porta $RuntimePort..."
  Invoke-GcloudChecked compute firewall-rules create $firewallRuleName `
    --network $Network `
    --direction INGRESS `
    --action ALLOW `
    --rules "tcp:$RuntimePort" `
    --source-ranges $ConnectorRange `
    --target-tags $RuntimeTag `
    --project $ProjectId | Out-Null
} else {
  Write-Host "Firewall rule $firewallRuleName gia presente."
}

$instanceExists = Test-GcloudResource compute instances describe $InstanceName --zone $Zone --project $ProjectId

if (-not $instanceExists) {
  Write-Host "Creo la VM $InstanceName..."
  $instanceArgs = @(
    "compute", "instances", "create", $InstanceName,
    "--zone", $Zone,
    "--machine-type", $MachineType,
    "--boot-disk-type", "pd-ssd",
    "--boot-disk-size", "$DiskSizeGb",
    "--image-family", "ubuntu-2204-lts",
    "--image-project", "ubuntu-os-cloud",
    "--tags", $RuntimeTag,
    "--scopes", "cloud-platform",
    "--metadata", "enable-oslogin=TRUE"
  )
  if (-not [string]::IsNullOrWhiteSpace($Subnetwork)) {
    $instanceArgs += @("--subnet", $Subnetwork)
  } else {
    $instanceArgs += @("--network", $Network)
  }
  $instanceArgs += @("--project", $ProjectId)
  Invoke-GcloudChecked @instanceArgs | Out-Null
} else {
  Write-Host "VM $InstanceName gia presente."
}

$internalIp = (Invoke-GcloudChecked compute instances describe $InstanceName --zone $Zone --project $ProjectId --format "value(networkInterfaces[0].networkIP)" | Select-Object -First 1).Trim()
$externalIp = (Invoke-GcloudChecked compute instances describe $InstanceName --zone $Zone --project $ProjectId --format "value(networkInterfaces[0].accessConfigs[0].natIP)" | Select-Object -First 1).Trim()

Write-Host ""
Write-Host "Provisioning completato."
Write-Host "VM: $InstanceName"
Write-Host "Internal IP: $internalIp"
if (-not [string]::IsNullOrWhiteSpace($externalIp)) {
  Write-Host "External IP: $externalIp"
}
Write-Host "VPC connector: $ConnectorName"
Write-Host "Firewall rule: $firewallRuleName"
Write-Host ""
Write-Host "Next step:"
Write-Host "  1. copia infra/mirofish/setup-vm.sh e infra/mirofish/mirofish.service sulla VM"
Write-Host "  2. prepara /opt/mirofish/.env a partire da infra/mirofish/mirofish.vm.env.example"
Write-Host "  3. esegui setup-vm.sh come root"
