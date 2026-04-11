param()

$ErrorActionPreference = 'Stop'

$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RepoRoot = Split-Path -Parent $script:ScriptDir
$script:LogDir = Join-Path $script:RepoRoot '.run-logs'

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Stop-ProcessTree([int]$ParentId) {
    # 递归杀掉所有子进程
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-ProcessTree -ParentId $_.ProcessId }
    Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue
}

function Stop-ServiceByPidFile([string]$Name) {
    $pidFile = Join-Path $script:LogDir "$Name.pid"
    if (-not (Test-Path $pidFile)) {
        Write-Host "[SKIP] No PID file for $Name"
        return
    }

    $pidText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if (-not $pidText) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        Write-Host "[SKIP] Empty PID file for $Name"
        return
    }

    $servicePid = 0
    if (-not [int]::TryParse($pidText, [ref]$servicePid)) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        Write-Host "[SKIP] Invalid PID file for $Name"
        return
    }

    $process = Get-Process -Id $servicePid -ErrorAction SilentlyContinue
    if ($null -ne $process) {
        Write-Step "Stopping $Name (PID $servicePid) and child processes"
        Stop-ProcessTree -ParentId $servicePid
        Write-Success "$Name stopped"
    } else {
        Write-Host "[SKIP] $Name process not found for PID $servicePid"
    }

    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $script:LogDir)) {
    New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
}

Stop-ServiceByPidFile -Name 'frontend'
Stop-ServiceByPidFile -Name 'backend'
Stop-ServiceByPidFile -Name 'code-processing'

Write-Host ''
Write-Success 'Project stop completed'