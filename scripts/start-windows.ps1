param()

$ErrorActionPreference = 'Stop'

$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RepoRoot = Split-Path -Parent $script:ScriptDir
$script:LogDir = Join-Path $script:RepoRoot '.run-logs'
$script:FrontendDir = Join-Path $script:RepoRoot 'frontend'
$script:BackendDir = Join-Path $script:RepoRoot 'backend'
$script:CodeDir = Join-Path $script:RepoRoot 'code-processing'
$script:CodeVenvPython = Join-Path $script:CodeDir '.venv\Scripts\python.exe'
$script:DefaultCodeProcessingPort = 9000
$script:CodeProcessingPort = $script:DefaultCodeProcessingPort

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

function Invoke-Checked([scriptblock]$Command, [string]$Description) {
    Write-Step $Description
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed"
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

function Resolve-AvailablePort([int]$PreferredPort, [int]$MaxOffset = 20) {
    if (-not (Test-PortListening -Port $PreferredPort)) {
        return $PreferredPort
    }

    # 本机已有其他服务占用默认端口时，自动顺延到附近空闲端口，避免启动脚本产生“假成功”。
    for ($offset = 1; $offset -le $MaxOffset; $offset++) {
        $candidatePort = $PreferredPort + $offset
        if (-not (Test-PortListening -Port $candidatePort)) {
            return $candidatePort
        }
    }

    throw "No available port found near $PreferredPort"
}

function Get-PythonMinorVersion([string]$FilePath, [string[]]$Arguments) {
    try {
        $versionText = & $FilePath @($Arguments) -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" 2> $null
        if ($LASTEXITCODE -ne 0) {
            return $null
        }
        return ($versionText | Out-String).Trim()
    } catch {
        return $null
    }
}

function Test-CodeBuildTools([string]$PythonFilePath, [ref]$ProbeOutput) {
    try {
        # 统一探测 pip / setuptools / wheel 三个构建关键模块，并保留原始报错方便定位环境问题。
        $output = & $PythonFilePath -c "import pip; import setuptools.build_meta; import wheel; print('ok')" 2>&1
        $ProbeOutput.Value = ($output | Out-String).Trim()
        return ($LASTEXITCODE -eq 0)
    } catch {
        $ProbeOutput.Value = $_.Exception.Message
        return $false
    }
}

function Test-PythonRuntimeDeps([string]$FilePath, [string[]]$Arguments) {
    try {
        # 优先选择已经具备 FastAPI 运行依赖的解释器，避免在受限网络环境里重复下载。
        $missingModules = & $FilePath @($Arguments) -c "import importlib.util; missing=[name for name in ('fastapi', 'uvicorn', 'pydantic', 'httpx') if importlib.util.find_spec(name) is None]; print(','.join(missing))" 2> $null
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
        return [string]::IsNullOrWhiteSpace(($missingModules | Out-String).Trim())
    } catch {
        return $false
    }
}

function Get-PythonLauncher() {
    $candidates = @()
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        $candidates += @{
            FilePath = $python.Source
            Arguments = @()
        }
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        foreach ($candidateArgs in @(@('-3.10'), @('-3.11'), @('-3.12'), @('-3.13'), @('-3'))) {
            $candidates += @{
                FilePath = $py.Source
                Arguments = $candidateArgs
            }
        }
    }

    $bestCandidateWithDeps = $null
    $bestFallbackCandidate = $null
    $priority = 0
    foreach ($candidate in $candidates) {
        $minorVersion = Get-PythonMinorVersion -FilePath $candidate.FilePath -Arguments $candidate.Arguments
        if (-not $minorVersion) {
            $priority++
            continue
        }

        if ([version]$minorVersion -lt [version]'3.10') {
            $priority++
            continue
        }

        $resolvedCandidate = @{
            FilePath = $candidate.FilePath
            Arguments = $candidate.Arguments
            Priority = $priority
        }

        if (($null -eq $bestFallbackCandidate) -or ($priority -lt $bestFallbackCandidate.Priority)) {
            $bestFallbackCandidate = $resolvedCandidate
        }

        if (Test-PythonRuntimeDeps -FilePath $candidate.FilePath -Arguments $candidate.Arguments) {
            if (($null -eq $bestCandidateWithDeps) -or ($priority -lt $bestCandidateWithDeps.Priority)) {
                $bestCandidateWithDeps = $resolvedCandidate
            }
        }

        $priority++
    }

    if ($bestCandidateWithDeps) {
        return @{
            FilePath = $bestCandidateWithDeps.FilePath
            Arguments = @($bestCandidateWithDeps.Arguments)
        }
    }

    if ($bestFallbackCandidate) {
        return @{
            FilePath = $bestFallbackCandidate.FilePath
            Arguments = @($bestFallbackCandidate.Arguments)
        }
    }

    throw 'Python not found. Please install Python 3.10 or newer.'
}

function Ensure-CodeBuildTools() {
    # Python 3.12/3.13 创建的 venv 默认可能不再携带 setuptools，需要显式补齐构建工具链。
    $probeOutput = ''
    if (Test-CodeBuildTools -PythonFilePath $script:CodeVenvPython -ProbeOutput ([ref]$probeOutput)) {
        return
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

    $probeOutput = ''
    if (-not (Test-CodeBuildTools -PythonFilePath $script:CodeVenvPython -ProbeOutput ([ref]$probeOutput))) {
        if ([string]::IsNullOrWhiteSpace($probeOutput)) {
            throw 'code-processing build tools are unavailable after installation'
        }
        throw "code-processing build tools are unavailable after installation: $probeOutput"
    }
}

function Ensure-CodeVenv() {
    $launcher = Get-PythonLauncher
    $launcherVersion = Get-PythonMinorVersion -FilePath $launcher.FilePath -Arguments $launcher.Arguments
    $venvOk = $false

    if (Test-Path $script:CodeVenvPython) {
        try {
            & $script:CodeVenvPython --version *> $null
            if ($LASTEXITCODE -eq 0) {
                $venvVersion = Get-PythonMinorVersion -FilePath $script:CodeVenvPython -Arguments @()
                if ($launcherVersion -and $venvVersion -eq $launcherVersion) {
                    & $script:CodeVenvPython -c "import setuptools.build_meta" *> $null
                    $venvOk = ($LASTEXITCODE -eq 0)
                } else {
                    $venvOk = $false
                }
            } else {
                $venvOk = $false
            }
        } catch {
            $venvOk = $false
        }
    }

    if (-not $venvOk) {
        Write-Step 'Creating/rebuilding code-processing virtual environment'
        $venvDir = Join-Path $script:CodeDir '.venv'
        if (Test-Path $venvDir) {
            Remove-Item -LiteralPath $venvDir -Recurse -Force
        }
        Push-Location $script:CodeDir
        try {
            & $launcher.FilePath @($launcher.Arguments) -m venv .venv --system-site-packages
            if ($LASTEXITCODE -ne 0) {
                throw 'Failed to create Python virtual environment'
            }
        } finally {
            Pop-Location
        }
    }

    # Python 3.12+ 已移除 stdlib distutils，只能继续使用 setuptools 自带实现；
    # 仅在旧版本 Python 上启用兼容开关，避免 Python 3.13 下构建后端无法导入。
    $codePythonVersion = Get-PythonMinorVersion -FilePath $script:CodeVenvPython -Arguments @()
    $shouldUseStdlibDistutils = $codePythonVersion -and ([version]$codePythonVersion -lt [version]'3.12')
    $previousDistutilsMode = $env:SETUPTOOLS_USE_DISTUTILS
    if ($shouldUseStdlibDistutils) {
        $env:SETUPTOOLS_USE_DISTUTILS = 'stdlib'
    } else {
        Remove-Item Env:SETUPTOOLS_USE_DISTUTILS -ErrorAction SilentlyContinue
    }
    try {
        Ensure-CodeBuildTools

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
    } finally {
        if ($null -eq $previousDistutilsMode) {
            Remove-Item Env:SETUPTOOLS_USE_DISTUTILS -ErrorAction SilentlyContinue
        } else {
            $env:SETUPTOOLS_USE_DISTUTILS = $previousDistutilsMode
        }
    }
}

function Start-BackgroundService(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$Port,
    [int]$TimeoutSeconds = 90
) {
    if (Test-PortListening -Port $Port) {
        Write-Success "$Name is already running on port $Port"
        return
    }

    $stdout = Join-Path $script:LogDir "$Name.out.log"
    $stderr = Join-Path $script:LogDir "$Name.err.log"
    $pidFile = Join-Path $script:LogDir "$Name.pid"

    if (Test-Path $stdout) { Remove-Item $stdout -Force }
    if (Test-Path $stderr) { Remove-Item $stderr -Force }

    Write-Step "启动 $Name"

    # 写临时 .cmd 启动脚本，避免 Start-Process ArgumentList 参数转义问题
    $escapedArgs = ($Arguments | ForEach-Object { $_ }) -join ' '
    $batFile = Join-Path $script:LogDir "$Name.cmd"
    $batContent = "@echo off`r`ncd /d `"$WorkingDirectory`"`r`n`"$FilePath`" $escapedArgs"
    Set-Content -Path $batFile -Value $batContent -Encoding ascii

    # 设置 PYTHON_BASIC_REPL=1 禁用 Python 3.13 新 REPL
    $env:PYTHON_BASIC_REPL = '1'

    $process = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"$batFile`" < NUL" `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru `
        -NoNewWindow

    Set-Content -Path $pidFile -Value $process.Id -Encoding ascii
    Wait-Port -Port $Port -TimeoutSeconds $TimeoutSeconds -ServiceName $Name
}

New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null

Assert-Command -Name 'docker' -Hint 'Docker Desktop'
Assert-Command -Name 'mvn' -Hint 'Apache Maven 3.9+'
Assert-Command -Name 'npm' -Hint 'Node.js and npm'
$null = Get-PythonLauncher

Push-Location $script:RepoRoot
try {
    Invoke-Checked -Description 'Starting infrastructure containers (PostgreSQL / Redis / MinIO)' -Command {
        docker compose up -d postgres redis minio
    }

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

    Ensure-CodeVenv

    $script:CodeProcessingPort = Resolve-AvailablePort -PreferredPort $script:DefaultCodeProcessingPort
    if ($script:CodeProcessingPort -ne $script:DefaultCodeProcessingPort) {
        Write-Step "Port $($script:DefaultCodeProcessingPort) is already in use, switching code-processing to port $($script:CodeProcessingPort)"
    }

    # 后端通过环境变量读取代码处理服务地址，确保端口切换后联调地址保持一致。
    $env:PLATFORM_CODE_PROCESSING_BASE_URL = "http://localhost:$($script:CodeProcessingPort)"

    # 获取可执行文件路径
    # npm: Get-Command 可能返回 .ps1，需要强制用 .cmd 以便 cmd /c 调用
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
        -Port 8080

    Start-BackgroundService -Name 'frontend' `
        -WorkingDirectory $script:FrontendDir `
        -FilePath $npmCmd `
        -Arguments @('run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173', '--strictPort') `
        -Port 5173

    Write-Host ''
    Write-Success 'Project startup completed'
    Write-Host "Frontend: http://localhost:5173"
    Write-Host "Backend: http://localhost:8080"
    Write-Host "Code processing: http://localhost:$($script:CodeProcessingPort)/health"
    Write-Host "Logs: $script:LogDir"
} finally {
    Pop-Location
}
