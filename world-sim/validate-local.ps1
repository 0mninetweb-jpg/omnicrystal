param(
  [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "python non trovato. Installa Python 3.11 o 3.12 e rilancia questo script."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDir = Join-Path $scriptDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\\python.exe"
$pipExe = Join-Path $venvDir "Scripts\\pip.exe"
$adapterKey = "local-worldsim-$([Guid]::NewGuid().ToString('N'))"

if (-not (Test-Path $pythonExe)) {
  Write-Host "Creo la virtualenv locale..."
  python -m venv $venvDir
}

Write-Host "Installo le dipendenze Python del sidecar..."
& $pipExe install --upgrade pip | Out-Null
& $pipExe install -r (Join-Path $scriptDir "requirements.txt") | Out-Null

Write-Host "Verifico la sintassi dell'adapter..."
& $pythonExe -m py_compile (Join-Path $scriptDir "app.py")

$process = $null
try {
  Write-Host "Avvio l'adapter locale su http://127.0.0.1:$Port ..."
  $cmdArgs = "/c set PORT=$Port&& set WORLDSIM_API_KEY=$adapterKey&& `"$pythonExe`" app.py"
  $process = Start-Process -FilePath "cmd.exe" `
    -ArgumentList $cmdArgs `
    -WorkingDirectory $scriptDir `
    -PassThru `
    -WindowStyle Hidden

  $healthy = $false
  for ($attempt = 1; $attempt -le 20; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -Headers @{ "X-WorldSim-Key" = $adapterKey } | Out-Null
      $healthy = $true
      break
    } catch {
    }
  }

  if (-not $healthy) {
    throw "L'adapter locale non ha risposto a /health."
  }

  & (Join-Path $scriptDir "..\\infra\\mirofish\\smoke-test.ps1") `
    -AdapterBaseUrl "http://127.0.0.1:$Port" `
    -AdapterApiKey $adapterKey `
    -MaxPollAttempts 30 `
    -PollIntervalSec 2
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
  }
}
