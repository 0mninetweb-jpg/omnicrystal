param(
  [string]$ProjectId = "omnicrystal",
  [string]$Region = "europe-west1",
  [string]$Zone = "europe-west1-b",
  [string]$Network = "default",
  [string]$Subnetwork = "",
  [string]$InstanceName = "mirofish-runtime",
  [string]$MachineType = "e2-standard-8",
  [int]$DiskSizeGb = 150,
  [string]$ConnectorName = "crystal-worldsim-connector",
  [string]$ConnectorRange = "10.8.0.0/28",
  [string]$RuntimeTag = "mirofish-runtime",
  [int]$RuntimePort = 5001
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud non trovato. Installa Google Cloud SDK prima di eseguire questo script."
}

Write-Host "Imposto il progetto gcloud su $ProjectId..."
gcloud config set project $ProjectId | Out-Null

Write-Host "Abilito le API necessarie..."
gcloud services enable compute.googleapis.com vpcaccess.googleapis.com run.googleapis.com | Out-Null

$connectorExists = $true
try {
  gcloud compute networks vpc-access connectors describe $ConnectorName --region $Region | Out-Null
} catch {
  $connectorExists = $false
}

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
  & gcloud @connectorArgs | Out-Null
} else {
  Write-Host "VPC connector $ConnectorName gia presente."
}

$firewallRuleName = "allow-mirofish-from-$($ConnectorName.ToLower())"
$firewallExists = $true
try {
  gcloud compute firewall-rules describe $firewallRuleName | Out-Null
} catch {
  $firewallExists = $false
}

if (-not $firewallExists) {
  Write-Host "Creo la firewall rule $firewallRuleName per la porta $RuntimePort..."
  gcloud compute firewall-rules create $firewallRuleName `
    --network $Network `
    --direction INGRESS `
    --action ALLOW `
    --rules "tcp:$RuntimePort" `
    --source-ranges $ConnectorRange `
    --target-tags $RuntimeTag | Out-Null
} else {
  Write-Host "Firewall rule $firewallRuleName gia presente."
}

$instanceExists = $true
try {
  gcloud compute instances describe $InstanceName --zone $Zone | Out-Null
} catch {
  $instanceExists = $false
}

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
  & gcloud @instanceArgs | Out-Null
} else {
  Write-Host "VM $InstanceName gia presente."
}

$internalIp = gcloud compute instances describe $InstanceName --zone $Zone --format "value(networkInterfaces[0].networkIP)"
$externalIp = gcloud compute instances describe $InstanceName --zone $Zone --format "value(networkInterfaces[0].accessConfigs[0].natIP)"

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
