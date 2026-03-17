param(
  [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

function Test-PortAvailable {
  param([int]$CandidatePort)

  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CandidatePort)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Resolve-LocalPort {
  param([int]$PreferredPort)

  if (Test-PortAvailable -CandidatePort $PreferredPort) {
    return $PreferredPort
  }

  for ($candidate = $PreferredPort + 1; $candidate -le $PreferredPort + 50; $candidate++) {
    if (Test-PortAvailable -CandidatePort $candidate) {
      return $candidate
    }
  }

  throw "Nessuna porta disponibile trovata vicino a $PreferredPort."
}

function Get-PythonCommand {
  if ($env:CRYSTAL_PYTHON_EXE -and (Test-Path $env:CRYSTAL_PYTHON_EXE)) {
    return @{
      Path = $env:CRYSTAL_PYTHON_EXE
      BaseArgs = @()
    }
  }

  $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    return @{
      Path = $pyLauncher.Source
      BaseArgs = @("-3.12")
    }
  }

  $pythonExe = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($pythonExe -and $pythonExe.Source -notlike "*WindowsApps*") {
    return @{
      Path = $pythonExe.Source
      BaseArgs = @()
    }
  }

  $commonPaths = @(
    "$env:LocalAppData\Programs\Python\Python312\python.exe",
    "$env:LocalAppData\Programs\Python\Python311\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe"
  )

  foreach ($candidate in $commonPaths) {
    if (Test-Path $candidate) {
      return @{
        Path = $candidate
        BaseArgs = @()
      }
    }
  }

  throw "python non trovato. Installa Python 3.11 o 3.12 e rilancia questo script."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDir = Join-Path $scriptDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\\python.exe"
$pipExe = Join-Path $venvDir "Scripts\\pip.exe"
$adapterKey = "local-worldsim-$([Guid]::NewGuid().ToString('N'))"
$pythonCommand = Get-PythonCommand
$selectedPort = Resolve-LocalPort -PreferredPort $Port

if (-not (Test-Path $pythonExe)) {
  Write-Host "Creo la virtualenv locale..."
  & $pythonCommand.Path @($pythonCommand.BaseArgs + @("-m", "venv", $venvDir))
}

Write-Host "Installo le dipendenze Python del sidecar..."
& $pythonExe -m pip install --upgrade pip | Out-Null
& $pythonExe -m pip install -r (Join-Path $scriptDir "requirements.txt") | Out-Null

Write-Host "Verifico la sintassi dell'adapter..."
& $pythonExe -m py_compile (Join-Path $scriptDir "app.py")

$process = $null
$previousPort = $env:PORT
$previousAdapterKey = $env:WORLDSIM_API_KEY
try {
  Write-Host "Avvio l'adapter locale su http://127.0.0.1:$selectedPort ..."
  $env:PORT = "$selectedPort"
  $env:WORLDSIM_API_KEY = $adapterKey
  $process = Start-Process -FilePath $pythonExe `
    -ArgumentList "app.py" `
    -WorkingDirectory $scriptDir `
    -PassThru `
    -WindowStyle Hidden

  $healthy = $false
  for ($attempt = 1; $attempt -le 20; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$selectedPort/health" -Headers @{ "X-WorldSim-Key" = $adapterKey } | Out-Null
      $healthy = $true
      break
    } catch {
    }
  }

  if (-not $healthy) {
    throw "L'adapter locale non ha risposto a /health."
  }

  & (Join-Path $scriptDir "..\\infra\\mirofish\\smoke-test.ps1") `
    -AdapterBaseUrl "http://127.0.0.1:$selectedPort" `
    -AdapterApiKey $adapterKey `
    -MaxPollAttempts 30 `
    -PollIntervalSec 2
} finally {
  if ($null -eq $previousPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $previousPort
  }

  if ($null -eq $previousAdapterKey) {
    Remove-Item Env:WORLDSIM_API_KEY -ErrorAction SilentlyContinue
  } else {
    $env:WORLDSIM_API_KEY = $previousAdapterKey
  }

  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
  }
}
