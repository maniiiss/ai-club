$scriptRoot = if ($script:Utf8ScriptRoot) {
    $script:Utf8ScriptRoot
} else {
    $PSScriptRoot
}

$repoRoot = Split-Path -Parent $scriptRoot

$script:AiClubScriptContext = @{
    ScriptDir                = $scriptRoot
    RepoRoot                 = $repoRoot
    LogDir                   = Join-Path $repoRoot '.run-logs'
    FrontendDir              = Join-Path $repoRoot 'frontend'
    BackendDir               = Join-Path $repoRoot 'backend'
    CodeDir                  = Join-Path $repoRoot 'code-processing'
    CodeVenvDir              = Join-Path $repoRoot 'code-processing\.venv'
    CodeVenvPython           = Join-Path $repoRoot 'code-processing\.venv\Scripts\python.exe'
    DefaultEnvFile           = Join-Path $repoRoot '.env'
    DefaultEnvExampleFile    = Join-Path $repoRoot '.env.example'
    FullDockerEnvFile        = Join-Path $repoRoot '.env.server'
    FullDockerEnvExampleFile = Join-Path $repoRoot '.env.server.example'
    HybridComposeFile        = Join-Path $repoRoot 'docker-compose.yml'
    FullDockerComposeFile    = Join-Path $repoRoot 'docker-compose.server.yml'
    DockerDir                = Join-Path $repoRoot 'docker'
    PostgresInitDir          = Join-Path $repoRoot 'docker\postgres\init'
}

function Get-ScriptContext {
    return $script:AiClubScriptContext
}

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnMessage([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Initialize-LogDirectory {
    $context = Get-ScriptContext
    New-Item -ItemType Directory -Force -Path $context.LogDir | Out-Null
}

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "缺少命令 [$Name]，请先安装：$Hint"
    }
}

function Ensure-EnvFile([string]$TargetPath, [string]$TemplatePath, [string]$Description) {
    if (Test-Path $TargetPath) {
        return
    }

    if (-not (Test-Path $TemplatePath)) {
        throw "找不到 $Description 模板文件：$TemplatePath"
    }

    Write-Step "初始化 $Description 环境文件"
    Copy-Item $TemplatePath $TargetPath -Force
    Write-Success "已创建 $TargetPath"
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
    # 统一使用 UTF-8 无 BOM，避免脚本和环境文件被 Windows 默认编码污染。
    $utf8Encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8Encoding)
}

function Get-DotEnvValue([string]$Path, [string]$Name, [string]$DefaultValue) {
    if (-not (Test-Path $Path)) {
        return $DefaultValue
    }

    foreach ($rawLine in Get-Content -Path $Path) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            continue
        }

        $pair = $line -split '=', 2
        if ($pair.Count -ne 2) {
            continue
        }

        if ($pair[0] -eq $Name) {
            return $pair[1]
        }
    }

    return $DefaultValue
}

function Set-DotEnvValues([string]$Path, [hashtable]$Values) {
    $lines = New-Object 'System.Collections.Generic.List[string]'
    if (Test-Path $Path) {
        foreach ($line in Get-Content -Path $Path) {
            $lines.Add($line)
        }
    }

    foreach ($entry in $Values.GetEnumerator()) {
        $targetIndex = -1
        for ($index = 0; $index -lt $lines.Count; $index++) {
            if ($lines[$index] -match ('^{0}=' -f [Regex]::Escape($entry.Key))) {
                $targetIndex = $index
                break
            }
        }

        $lineValue = '{0}={1}' -f $entry.Key, $entry.Value
        if ($targetIndex -ge 0) {
            $lines[$targetIndex] = $lineValue
        } else {
            $lines.Add($lineValue)
        }
    }

    $content = [string]::Join([Environment]::NewLine, $lines)
    if ($lines.Count -gt 0) {
        $content += [Environment]::NewLine
    }
    Write-Utf8NoBomFile -Path $Path -Content $content
}

function Ensure-FullDockerEnvFile {
    $context = Get-ScriptContext
    if (-not (Test-Path $context.FullDockerEnvFile)) {
        if (Test-Path $context.DefaultEnvFile) {
            # 优先复用开发环境中的真实密钥和端口配置，再修正为容器内可访问的地址。
            Write-Step '根据 .env 初始化 .env.server'
            Copy-Item $context.DefaultEnvFile $context.FullDockerEnvFile -Force
        } else {
            Ensure-EnvFile -TargetPath $context.FullDockerEnvFile `
                -TemplatePath $context.FullDockerEnvExampleFile `
                -Description '.env.server'
        }
    }

    $backendPort = Get-DotEnvValue -Path $context.FullDockerEnvFile -Name 'BACKEND_PORT' -DefaultValue '8080'
    $normalizedValues = @{
        # BACKEND_PORT 是宿主机映射端口；全量 Docker 内部服务互访始终使用 backend 容器端口 8080。
        PLATFORM_BACKEND_INTERNAL_BASE_URL = 'http://backend:8080'
        PLATFORM_INTERNAL_ALLOW_LOCAL_BYPASS = 'false'
        VITE_API_BASE_URL = ''
        VITE_API_PORT = $backendPort
    }

    # 补齐全量 Docker 独有的数据目录配置，避免 .env.server 直接从 .env 复制后回落到
    # docker-compose.server.yml 里的 Linux 服务器默认路径，导致 Windows / Docker Desktop
    # 下挂载到 /data/... 时出现权限问题。
    $fullDockerDefaults = @{
        POSTGRES_DATA_DIR = './.data/postgres'
        REDIS_DATA_DIR = './.data/redis'
        MINIO_DATA_DIR = './.data/minio'
        HERMES_PORT = '18080'
        HERMES_DATA_DIR = './.data/hermes'
        HINDSIGHT_PORT = '18888'
        HINDSIGHT_CONSOLE_PORT = '19999'
        PLATFORM_SCAN_HOST_PATH = './.data/scans'
        WOODPECKER_PORT = '18000'
        WOODPECKER_DATA_DIR = './.data/woodpecker'
        WOODPECKER_AGENT_DATA_DIR = './.data/woodpecker-agent'
        PLATFORM_WOODPECKER_INTERNAL_BASE_URL = 'http://woodpecker-server:8000'
        PLATFORM_WOODPECKER_PUBLIC_BASE_URL = 'http://localhost:18000'
    }

    foreach ($entry in $fullDockerDefaults.GetEnumerator()) {
        $currentValue = Get-DotEnvValue -Path $context.FullDockerEnvFile -Name $entry.Key -DefaultValue ''
        if ([string]::IsNullOrWhiteSpace($currentValue)) {
            $normalizedValues[$entry.Key] = $entry.Value
        }
    }

    Set-DotEnvValues -Path $context.FullDockerEnvFile -Values $normalizedValues

    Write-Success "已准备全量 Docker 环境文件：$($context.FullDockerEnvFile)"
}

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) {
        return
    }

    Write-Step "加载环境变量：$(Split-Path -Leaf $Path)"
    foreach ($rawLine in Get-Content -Path $Path) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            continue
        }

        $pair = $line -split '=', 2
        if ($pair.Count -ne 2) {
            continue
        }

        [System.Environment]::SetEnvironmentVariable($pair[0], $pair[1])
        Set-Item -Path "Env:$($pair[0])" -Value $pair[1]
    }
}

function Get-EnvOrDefault([string]$Name, [string]$DefaultValue) {
    $value = [System.Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value
}

function Test-EnvFlagEnabled([string]$Name, [string]$DefaultValue = 'false') {
    $value = (Get-EnvOrDefault -Name $Name -DefaultValue $DefaultValue).Trim().ToLowerInvariant()
    return @('1', 'true', 'yes', 'on') -contains $value
}

function Test-WoodpeckerEnabled {
    return Test-EnvFlagEnabled -Name 'WOODPECKER_ENABLED' -DefaultValue 'true'
}

function Add-WoodpeckerProfileIfEnabled([string[]]$Arguments) {
    if (Test-WoodpeckerEnabled) {
        return @('--profile', 'woodpecker') + $Arguments
    }
    return $Arguments
}

function Get-PortConfiguration {
    return @{
        Backend        = [int](Get-EnvOrDefault -Name 'BACKEND_PORT' -DefaultValue '8080')
        Frontend       = [int](Get-EnvOrDefault -Name 'FRONTEND_PORT' -DefaultValue '5173')
        CodeProcessing = [int](Get-EnvOrDefault -Name 'CODE_PROCESSING_PORT' -DefaultValue '9000')
        Postgres       = [int](Get-EnvOrDefault -Name 'POSTGRES_PORT' -DefaultValue '5432')
        Redis          = [int](Get-EnvOrDefault -Name 'REDIS_PORT' -DefaultValue '6379')
        Minio          = [int](Get-EnvOrDefault -Name 'MINIO_PORT' -DefaultValue '19000')
        Hermes         = [int](Get-EnvOrDefault -Name 'HERMES_PORT' -DefaultValue '18080')
        Hindsight      = [int](Get-EnvOrDefault -Name 'HINDSIGHT_PORT' -DefaultValue '18888')
        Qdrant         = [int](Get-EnvOrDefault -Name 'QDRANT_PORT' -DefaultValue '16333')
        GitNexusUi     = [int](Get-EnvOrDefault -Name 'PLATFORM_GITNEXUS_UI_PUBLIC_PORT' -DefaultValue '5174')
        Woodpecker     = [int](Get-EnvOrDefault -Name 'WOODPECKER_PORT' -DefaultValue '18000')
    }
}

function Set-HybridDockerRuntimeEnvironment {
    # Hermes 容器访问宿主机源码服务时，Windows 默认应走 host.docker.internal。
    $configuredHost = Get-EnvOrDefault -Name 'CODE_PROCESSING_IP' -DefaultValue ''
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        $configuredHost = 'host.docker.internal'
        Set-Item -Path 'Env:CODE_PROCESSING_IP' -Value $configuredHost
    }
    return $configuredHost
}

function Test-PortListening([int]$Port) {
    try {
        $null = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Get-ListeningProcessIdByPort([int]$Port) {
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -First 1
        if ($null -eq $connection) {
            return $null
        }
        return [int]$connection.OwningProcess
    } catch {
        return $null
    }
}

function Test-ProcessMatchesPatterns([int]$ProcessId, [string[]]$Patterns) {
    if ($Patterns.Count -eq 0) {
        return $false
    }

    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $processInfo) {
        return $false
    }

    $targetText = @(
        $processInfo.Name
        $processInfo.ExecutablePath
        $processInfo.CommandLine
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Out-String

    foreach ($pattern in $Patterns) {
        if ([string]::IsNullOrWhiteSpace($pattern)) {
            continue
        }

        if ($targetText -notlike "*$pattern*") {
            return $false
        }
    }

    return $true
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds, [string]$ServiceName) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            Write-Success "$ServiceName 已监听端口 $Port"
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "$ServiceName 启动超时，端口 $Port 未就绪"
}

function Get-ServicePidFilePath([string]$Name) {
    $context = Get-ScriptContext
    return Join-Path $context.LogDir ($Name + '.pid')
}

function Get-ManagedServicePid([string]$Name) {
    $pidFile = Get-ServicePidFilePath -Name $Name
    if (-not (Test-Path $pidFile)) {
        return $null
    }

    $pidText = (Get-Content -Path $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($pidText)) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    $servicePid = 0
    if (-not [int]::TryParse($pidText.Trim(), [ref]$servicePid)) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    $process = Get-Process -Id $servicePid -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    return $servicePid
}

function Stop-ProcessTree([int]$ParentId) {
    # 递归清理子进程，避免只停掉 cmd 外壳而 Java / Node / Python 进程仍残留。
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-ProcessTree -ParentId $_.ProcessId }

    Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue
}

function Stop-ServiceByPidFile([string]$Name) {
    $pidFile = Get-ServicePidFilePath -Name $Name
    $servicePid = Get-ManagedServicePid -Name $Name
    if ($null -eq $servicePid) {
        Write-Host "[SKIP] 未发现 $Name 的托管进程"
        return
    }

    Write-Step "停止 $Name（PID $servicePid）"
    Stop-ProcessTree -ParentId $servicePid
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Success "$Name 已停止"
}

function Stop-LocalServices([string[]]$Names = @('frontend', 'backend', 'code-processing')) {
    foreach ($name in $Names) {
        Stop-ServiceByPidFile -Name $name
    }
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
        $output = & $PythonFilePath -c "import importlib.util; missing=[name for name in ('pip', 'setuptools', 'wheel') if importlib.util.find_spec(name) is None]; print(','.join(missing))" 2>&1
        $ProbeOutput.Value = ($output | Out-String).Trim()
        return ($LASTEXITCODE -eq 0) -and [string]::IsNullOrWhiteSpace($ProbeOutput.Value)
    } catch {
        $ProbeOutput.Value = $_.Exception.Message
        return $false
    }
}

function Test-PythonRuntimeDeps([string]$FilePath, [string[]]$Arguments) {
    try {
        $missingModules = & $FilePath @($Arguments) -c "import importlib.util; missing=[name for name in ('fastapi', 'uvicorn', 'pydantic', 'httpx') if importlib.util.find_spec(name) is None]; print(','.join(missing))" 2> $null
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
        return [string]::IsNullOrWhiteSpace(($missingModules | Out-String).Trim())
    } catch {
        return $false
    }
}

function Test-CodeVenvUsesSystemSitePackages {
    $context = Get-ScriptContext
    $pyVenvConfigPath = Join-Path $context.CodeVenvDir 'pyvenv.cfg'
    if (-not (Test-Path $pyVenvConfigPath)) {
        return $false
    }

    foreach ($line in Get-Content -Path $pyVenvConfigPath) {
        if ($line -match '^\s*include-system-site-packages\s*=\s*true\s*$') {
            return $true
        }
    }

    return $false
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

    throw '未找到可用的 Python，请安装 Python 3.10 或更高版本。'
}

function Ensure-CodeBuildTools {
    $context = Get-ScriptContext
    $probeOutput = ''
    if (Test-CodeBuildTools -PythonFilePath $context.CodeVenvPython -ProbeOutput ([ref]$probeOutput)) {
        return
    }

    Write-Step '安装 code-processing 构建工具（pip / setuptools / wheel）'
    & $context.CodeVenvPython -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        throw '初始化 code-processing 虚拟环境中的 pip 失败'
    }

    & $context.CodeVenvPython -m pip install --upgrade setuptools wheel
    if ($LASTEXITCODE -ne 0) {
        throw '安装 code-processing 构建工具失败'
    }

    $probeOutput = ''
    if (-not (Test-CodeBuildTools -PythonFilePath $context.CodeVenvPython -ProbeOutput ([ref]$probeOutput))) {
        if ([string]::IsNullOrWhiteSpace($probeOutput)) {
            throw 'code-processing 构建工具安装后仍不可用'
        }
        throw "code-processing 构建工具安装后仍不可用：$probeOutput"
    }
}

function Ensure-CodeVenv([hashtable]$Launcher, [switch]$InstallDependencies) {
    $context = Get-ScriptContext
    $launcherVersion = Get-PythonMinorVersion -FilePath $Launcher.FilePath -Arguments $Launcher.Arguments
    $venvOk = $false
    $runtimeDepsReady = $false
    $venvRebuilt = $false

    if (Test-Path $context.CodeVenvPython) {
        try {
            & $context.CodeVenvPython --version *> $null
            if ($LASTEXITCODE -eq 0) {
                $venvVersion = Get-PythonMinorVersion -FilePath $context.CodeVenvPython -Arguments @()
                $usesSystemSitePackages = Test-CodeVenvUsesSystemSitePackages
                if ($launcherVersion -and $venvVersion -eq $launcherVersion -and -not $usesSystemSitePackages) {
                    & $context.CodeVenvPython -c "import setuptools.build_meta" *> $null
                    $venvOk = ($LASTEXITCODE -eq 0)
                    if ($venvOk) {
                        $runtimeDepsReady = Test-PythonRuntimeDeps -FilePath $context.CodeVenvPython -Arguments @()
                    }
                }
            }
        } catch {
            $venvOk = $false
            $runtimeDepsReady = $false
        }
    }

    if (-not $venvOk) {
        # Python 小版本不一致时直接重建，避免 editable 安装和依赖解析出现隐性问题。
        Write-Step '创建或重建 code-processing 虚拟环境'
        if (Test-Path $context.CodeVenvDir) {
            Remove-Item -LiteralPath $context.CodeVenvDir -Recurse -Force
        }

        Push-Location $context.CodeDir
        try {
            & $Launcher.FilePath @($Launcher.Arguments) -m venv .venv
            if ($LASTEXITCODE -ne 0) {
                throw '创建 code-processing 虚拟环境失败'
            }
            $venvRebuilt = $true
        } finally {
            Pop-Location
        }
    }

    $shouldInstallDependencies = $InstallDependencies.IsPresent -or $venvRebuilt -or (-not $runtimeDepsReady)
    if (-not $shouldInstallDependencies) {
        return
    }

    Ensure-CodeBuildTools

    Write-Step '安装 code-processing 依赖'
    Push-Location $context.CodeDir
    try {
        & $context.CodeVenvPython -m pip install --no-build-isolation -e .
        if ($LASTEXITCODE -ne 0) {
            throw '安装 code-processing 依赖失败'
        }
    } finally {
        Pop-Location
    }
}

function Get-CommandLineSafe([string[]]$Arguments) {
    return ($Arguments | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '"', '\"') + '"'
        } else {
            $_
        }
    }) -join ' '
}

function Get-NpmCommandPath {
    $npmSource = (Get-Command npm).Source
    if ($npmSource -match '\.ps1$') {
        return [System.IO.Path]::ChangeExtension($npmSource, '.cmd')
    }
    return $npmSource
}

function Start-BackgroundService(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$Port,
    [string[]]$ExistingProcessPatterns = @(),
    [int]$TimeoutSeconds = 120
) {
    Initialize-LogDirectory
    $context = Get-ScriptContext
    $managedPid = Get-ManagedServicePid -Name $Name
    if (Test-PortListening -Port $Port) {
        if ($managedPid) {
            Write-Success "$Name 已经在端口 $Port 运行（PID $managedPid）"
            return
        }

        $listeningProcessId = Get-ListeningProcessIdByPort -Port $Port
        if ($listeningProcessId -and (Test-ProcessMatchesPatterns -ProcessId $listeningProcessId -Patterns $ExistingProcessPatterns)) {
            $pidFile = Join-Path $context.LogDir ($Name + '.pid')
            Write-Utf8NoBomFile -Path $pidFile -Content "$listeningProcessId"
            Write-Success "$Name 已经在端口 $Port 运行（识别到现有进程 PID $listeningProcessId）"
            return
        }

        throw "$Name 需要监听端口 $Port，但该端口已被其他进程占用，请先释放端口后重试。"
    }

    $stdout = Join-Path $context.LogDir ($Name + '.out.log')
    $stderr = Join-Path $context.LogDir ($Name + '.err.log')
    $pidFile = Join-Path $context.LogDir ($Name + '.pid')
    $cmdFile = Join-Path $context.LogDir ($Name + '.cmd')

    Remove-Item $stdout, $stderr, $pidFile, $cmdFile -Force -ErrorAction SilentlyContinue

    Write-Step "启动 $Name"
    $escapedArgs = Get-CommandLineSafe -Arguments $Arguments
    $cmdContent = @(
        '@echo off'
        "cd /d `"$WorkingDirectory`""
        "`"$FilePath`" $escapedArgs"
    ) -join "`r`n"
    Write-Utf8NoBomFile -Path $cmdFile -Content $cmdContent

    $env:PYTHON_BASIC_REPL = '1'
    $process = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c `"$cmdFile`" < NUL" `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru `
        -NoNewWindow

    Write-Utf8NoBomFile -Path $pidFile -Content "$($process.Id)"
    Wait-Port -Port $Port -TimeoutSeconds $TimeoutSeconds -ServiceName $Name
}

function Start-LocalApplicationServices(
    [hashtable]$PortConfiguration,
    [switch]$InstallFrontendDependencies,
    [switch]$InstallCodeDependencies
) {
    $context = Get-ScriptContext
    Initialize-LogDirectory

    Assert-Command -Name 'mvn' -Hint 'Apache Maven 3.9+'
    Assert-Command -Name 'npm' -Hint 'Node.js 和 npm'
    $launcher = Get-PythonLauncher

    $frontendNodeModulesDir = Join-Path $context.FrontendDir 'node_modules'
    $shouldInstallFrontend = $InstallFrontendDependencies.IsPresent -or (-not (Test-Path $frontendNodeModulesDir))
    if ($shouldInstallFrontend) {
        Write-Step '安装前端依赖'
        Push-Location $context.FrontendDir
        try {
            $npmCmd = Get-NpmCommandPath
            & $npmCmd 'install' '--legacy-peer-deps'
            if ($LASTEXITCODE -ne 0) {
                throw '安装前端依赖失败'
            }
        } finally {
            Pop-Location
        }
    }

    Ensure-CodeVenv -Launcher $launcher -InstallDependencies:$InstallCodeDependencies.IsPresent

    # 源码模式下由脚本统一注入端口，确保前端、后端和 code-processing 的地址保持一致。
    Set-Item -Path 'Env:SERVER_PORT' -Value "$($PortConfiguration.Backend)"
    Set-Item -Path 'Env:PLATFORM_BACKEND_INTERNAL_BASE_URL' -Value "http://localhost:$($PortConfiguration.Backend)"
    Set-Item -Path 'Env:PLATFORM_CODE_PROCESSING_BASE_URL' -Value "http://localhost:$($PortConfiguration.CodeProcessing)"
    Set-Item -Path 'Env:VITE_API_PORT' -Value "$($PortConfiguration.Backend)"

    $mvnCmd = (Get-Command mvn).Source
    $npmCmd = Get-NpmCommandPath

    Start-BackgroundService -Name 'code-processing' `
        -WorkingDirectory $context.CodeDir `
        -FilePath $context.CodeVenvPython `
        -Arguments @('-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', "$($PortConfiguration.CodeProcessing)") `
        -ExistingProcessPatterns @('uvicorn', 'app.main:app', "--port $($PortConfiguration.CodeProcessing)") `
        -Port $PortConfiguration.CodeProcessing

    Start-BackgroundService -Name 'backend' `
        -WorkingDirectory $context.BackendDir `
        -FilePath $mvnCmd `
        -Arguments @('-s', 'maven-settings-central.xml', 'spring-boot:run') `
        -ExistingProcessPatterns @('AiAgentPlatformApplication') `
        -Port $PortConfiguration.Backend

    Start-BackgroundService -Name 'frontend' `
        -WorkingDirectory $context.FrontendDir `
        -FilePath $npmCmd `
        -Arguments @('run', 'dev', '--', '--host', '0.0.0.0', '--port', "$($PortConfiguration.Frontend)", '--strictPort') `
        -ExistingProcessPatterns @($context.FrontendDir, 'vite', "--port $($PortConfiguration.Frontend)") `
        -Port $PortConfiguration.Frontend

    Write-Host ''
    Write-Success '源码服务启动完成'
    Write-Host "Frontend: http://localhost:$($PortConfiguration.Frontend)"
    Write-Host "Backend: http://localhost:$($PortConfiguration.Backend)"
    Write-Host "Code processing: http://localhost:$($PortConfiguration.CodeProcessing)"
    Write-Host "Logs: $($context.LogDir)"
}

function Get-ComposeLauncher {
    if ($script:ComposeLauncher) {
        return $script:ComposeLauncher
    }

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        try {
            & $docker.Source compose version *> $null
            if ($LASTEXITCODE -eq 0) {
                $script:ComposeLauncher = @{
                    FilePath = $docker.Source
                    PrefixArguments = @('compose')
                }
                return $script:ComposeLauncher
            }
        } catch {
            # 继续尝试旧版 docker-compose。
        }
    }

    $legacyCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
    if ($legacyCompose) {
        $script:ComposeLauncher = @{
            FilePath = $legacyCompose.Source
            PrefixArguments = @()
        }
        return $script:ComposeLauncher
    }

    throw '未找到 Docker Compose，请先安装 Docker Desktop 或 docker-compose。'
}

function Invoke-Compose(
    [string]$ComposeFile,
    [string]$EnvFile,
    [string[]]$Arguments,
    [string]$Description
) {
    $launcher = Get-ComposeLauncher
    $composeArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $composeArgs += '--env-file'
        $composeArgs += $EnvFile
    }
    if (-not [string]::IsNullOrWhiteSpace($ComposeFile)) {
        $composeArgs += '-f'
        $composeArgs += $ComposeFile
    }
    $composeArgs += $Arguments

    Write-Step $Description
    & $launcher.FilePath @($launcher.PrefixArguments + $composeArgs)
    if ($LASTEXITCODE -ne 0) {
        throw "$Description失败"
    }
}

function Invoke-ComposeCapture(
    [string]$ComposeFile,
    [string]$EnvFile,
    [string[]]$Arguments,
    [string]$Description
) {
    $launcher = Get-ComposeLauncher
    $composeArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $composeArgs += '--env-file'
        $composeArgs += $EnvFile
    }
    if (-not [string]::IsNullOrWhiteSpace($ComposeFile)) {
        $composeArgs += '-f'
        $composeArgs += $ComposeFile
    }
    $composeArgs += $Arguments

    Write-Step $Description
    $output = & $launcher.FilePath @($launcher.PrefixArguments + $composeArgs) 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$Description失败"
    }
    return @($output)
}

function Get-ComposeImages([string]$ComposeFile, [string]$EnvFile) {
    try {
        $resolvedImages = Invoke-ComposeCapture -ComposeFile $ComposeFile `
            -EnvFile $EnvFile `
            -Arguments (Add-WoodpeckerProfileIfEnabled -Arguments @('config', '--images')) `
            -Description '解析全量 Docker 镜像清单'

        $images = @(
            $resolvedImages |
                ForEach-Object { ($_ | Out-String).Trim() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                Select-Object -Unique
        )

        if ($images.Count -gt 0) {
            return $images
        }
    } catch {
        Write-WarnMessage "通过 docker compose 解析镜像清单失败，改用兜底列表：$($_.Exception.Message)"
    }

    return @(
        (Get-DotEnvValue -Path $EnvFile -Name 'BACKEND_IMAGE' -DefaultValue 'git-ai-club-backend:latest'),
        (Get-DotEnvValue -Path $EnvFile -Name 'FRONTEND_IMAGE' -DefaultValue 'git-ai-club-frontend:latest'),
        (Get-DotEnvValue -Path $EnvFile -Name 'CODE_PROCESSING_IMAGE' -DefaultValue 'git-ai-club-code-processing:latest'),
        (Get-DotEnvValue -Path $EnvFile -Name 'POSTGRES_IMAGE' -DefaultValue 'postgres:16'),
        (Get-DotEnvValue -Path $EnvFile -Name 'REDIS_IMAGE' -DefaultValue 'redis:7-alpine'),
        (Get-DotEnvValue -Path $EnvFile -Name 'MINIO_IMAGE' -DefaultValue 'minio/minio:RELEASE.2025-02-28T09-55-16Z'),
        (Get-DotEnvValue -Path $EnvFile -Name 'QDRANT_IMAGE' -DefaultValue 'qdrant/qdrant:v1.13.4'),
        (Get-DotEnvValue -Path $EnvFile -Name 'HERMES_IMAGE' -DefaultValue 'ghcr.io/nousresearch/hermes-agent:latest'),
        (Get-DotEnvValue -Path $EnvFile -Name 'HINDSIGHT_IMAGE' -DefaultValue 'ghcr.io/vectorize-io/hindsight:latest'),
        (Get-DotEnvValue -Path $EnvFile -Name 'GITNEXUS_WEB_IMAGE' -DefaultValue 'git-ai-club-gitnexus-web:latest'),
        (Get-DotEnvValue -Path $EnvFile -Name 'WOODPECKER_IMAGE' -DefaultValue 'woodpeckerci/woodpecker-server:v3'),
        (Get-DotEnvValue -Path $EnvFile -Name 'WOODPECKER_AGENT_IMAGE' -DefaultValue 'woodpeckerci/woodpecker-agent:v3')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
}
