param()

$ErrorActionPreference = 'Stop'

$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RepoRoot = Split-Path -Parent $script:ScriptDir
$script:LogDir = Join-Path $script:RepoRoot '.run-logs'
$script:FrontendDir = Join-Path $script:RepoRoot 'frontend'
$script:BackendDir = Join-Path $script:RepoRoot 'backend'
$script:CodeDir = Join-Path $script:RepoRoot 'code-processing'
$script:CodeVenvDir = Join-Path $script:CodeDir '.venv'
$script:CodeVenvPython = Join-Path $script:CodeVenvDir 'Scripts\python.exe'
$script:DotEnvPath = Join-Path $script:RepoRoot '.env'
$script:CodeProcessingPort = 9000
$script:BackendPort = 8080
$script:FrontendPort = 5173
$script:HermesPort = 18080
$script:HindsightPort = 18888

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing command [$Name]. Please install: $Hint"
    }
}

function Get-EnvOrDefault([string]$Name, [string]$DefaultValue) {
    $value = [System.Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value
}

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) {
        return
    }

    Write-Step "Loading environment variables from $(Split-Path -Leaf $Path)"
    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }

        $pair = $line -split '=', 2
        if ($pair.Count -ne 2) {
            return
        }

        [System.Environment]::SetEnvironmentVariable($pair[0], $pair[1])
        Set-Item -Path "Env:$($pair[0])" -Value $pair[1]
    }
}

function Test-PortListening([int]$Port) {
    try {
        $null = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds, [string]$ServiceName) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            Write-Success "$ServiceName is listening on port $Port"
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "$ServiceName start timed out. Check logs in: $script:LogDir"
}

function Get-PythonLauncher() {
    $candidates = @()

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        $candidates += @{ FilePath = $python.Source; Arguments = @() }
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        foreach ($candidateArgs in @(@('-3.13'), @('-3.12'), @('-3.11'), @('-3.10'), @('-3'))) {
            $candidates += @{ FilePath = $py.Source; Arguments = $candidateArgs }
        }
    }

    foreach ($candidate in $candidates) {
        try {
            $versionText = & $candidate.FilePath @($candidate.Arguments) -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" 2> $null
            if ($LASTEXITCODE -ne 0) {
                continue
            }
            $minorVersion = ($versionText | Out-String).Trim()
            if ([version]$minorVersion -ge [version]'3.10') {
                return @{
                    FilePath = $candidate.FilePath
                    Arguments = @($candidate.Arguments)
                }
            }
        } catch {
            continue
        }
    }

    throw 'Python not found. Please install Python 3.10 or newer.'
}

function Ensure-CodeVenv($Launcher) {
    if (-not (Test-Path $script:CodeVenvPython)) {
        Write-Step 'Creating code-processing virtual environment'
        Push-Location $script:CodeDir
        try {
            & $Launcher.FilePath @($Launcher.Arguments) -m venv .venv --system-site-packages
            if ($LASTEXITCODE -ne 0) {
                throw 'Failed to create code-processing virtual environment'
            }
        } finally {
            Pop-Location
        }
    }

    Write-Step 'Installing code-processing build tools (pip / setuptools / wheel)'
    & $script:CodeVenvPython -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to bootstrap pip in code-processing virtual environment'
    }

    & $script:CodeVenvPython -m pip install --upgrade setuptools wheel
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to install code-processing build tools'
    }

    Write-Step 'Installing code-processing dependencies'
    Push-Location $script:CodeDir
    try {
        & $script:CodeVenvPython -m pip install --no-build-isolation -e .
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to install code-processing dependencies'
        }
    } finally {
        Pop-Location
    }
}

function Get-CommandLineSafe([string[]]$Arguments) {
    return ($Arguments | ForEach-Object {
        if ($_ -match '\s') {
            '"' + ($_ -replace '"', '\"') + '"'
        } else {
            $_
        }
    }) -join ' '
}

function Start-BackgroundService(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$Port,
    [int]$TimeoutSeconds = 120
) {
    if (Test-PortListening -Port $Port) {
        Write-Success "$Name is already running on port $Port"
        return
    }

    $stdout = Join-Path $script:LogDir "$Name.out.log"
    $stderr = Join-Path $script:LogDir "$Name.err.log"
    $pidFile = Join-Path $script:LogDir "$Name.pid"
    $cmdFile = Join-Path $script:LogDir "$Name.cmd"

    Remove-Item $stdout, $stderr, $pidFile, $cmdFile -Force -ErrorAction SilentlyContinue

    Write-Step "Starting $Name"
    $escapedArgs = Get-CommandLineSafe -Arguments $Arguments
    $cmdContent = @(
        '@echo off'
        "cd /d `"$WorkingDirectory`""
        "`"$FilePath`" $escapedArgs"
    ) -join "`r`n"
    Set-Content -Path $cmdFile -Value $cmdContent -Encoding ascii

    $env:PYTHON_BASIC_REPL = '1'
    $process = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c `"$cmdFile`" < NUL" `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru `
        -NoNewWindow

    Set-Content -Path $pidFile -Value $process.Id -Encoding ascii
    Wait-Port -Port $Port -TimeoutSeconds $TimeoutSeconds -ServiceName $Name
}

New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
Import-DotEnv -Path $script:DotEnvPath

$script:HermesPort = [int](Get-EnvOrDefault -Name 'HERMES_PORT' -DefaultValue '18080')
$script:HindsightPort = [int](Get-EnvOrDefault -Name 'HINDSIGHT_PORT' -DefaultValue '18888')

Assert-Command -Name 'docker' -Hint 'Docker Desktop'
Assert-Command -Name 'mvn' -Hint 'Apache Maven 3.9+'
Assert-Command -Name 'npm' -Hint 'Node.js and npm'
$launcher = Get-PythonLauncher

Push-Location $script:RepoRoot
try {
    Write-Step 'Starting infrastructure containers (PostgreSQL / Redis / MinIO / Hindsight / Hermes)'
    docker compose up -d postgres redis minio hindsight hermes
    if ($LASTEXITCODE -ne 0) {
        throw 'Starting infrastructure containers failed'
    }

    Wait-Port -Port $script:HindsightPort -TimeoutSeconds 120 -ServiceName 'Hindsight'
    Wait-Port -Port $script:HermesPort -TimeoutSeconds 120 -ServiceName 'Hermes'

    Write-Step 'Installing frontend dependencies'
    Push-Location $script:FrontendDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to install frontend dependencies'
        }
    } finally {
        Pop-Location
    }

    Ensure-CodeVenv -Launcher $launcher

    # 后端通过环境变量读取代码处理服务地址，保持与源码启动端口一致。
    $env:PLATFORM_CODE_PROCESSING_BASE_URL = "http://localhost:$($script:CodeProcessingPort)"

    $pythonExe = $script:CodeVenvPython
    $mvnCmd = (Get-Command mvn).Source
    $npmSource = (Get-Command npm).Source
    if ($npmSource -match '\.ps1$') {
        $npmCmd = [System.IO.Path]::ChangeExtension($npmSource, '.cmd')
    } else {
        $npmCmd = $npmSource
    }

    Start-BackgroundService -Name 'code-processing' `
        -WorkingDirectory $script:CodeDir `
        -FilePath $pythonExe `
        -Arguments @('-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', "$($script:CodeProcessingPort)") `
        -Port $script:CodeProcessingPort

    Start-BackgroundService -Name 'backend' `
        -WorkingDirectory $script:BackendDir `
        -FilePath $mvnCmd `
        -Arguments @('-s', 'maven-settings-central.xml', 'spring-boot:run') `
        -Port $script:BackendPort

    Start-BackgroundService -Name 'frontend' `
        -WorkingDirectory $script:FrontendDir `
        -FilePath $npmCmd `
        -Arguments @('run', 'dev', '--', '--host', '0.0.0.0', '--port', "$($script:FrontendPort)", '--strictPort') `
        -Port $script:FrontendPort

    Write-Host ''
    Write-Success 'Project startup completed'
    Write-Host "Frontend: http://localhost:$($script:FrontendPort)"
    Write-Host "Backend: http://localhost:$($script:BackendPort)"
    Write-Host "Code processing: http://localhost:$($script:CodeProcessingPort)"
    Write-Host "Hermes: http://localhost:$($script:HermesPort)"
    Write-Host "Hindsight: http://localhost:$($script:HindsightPort)"
    Write-Host "Logs: $script:LogDir"
} finally {
    Pop-Location
}
