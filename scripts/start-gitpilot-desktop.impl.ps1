param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# 桌面端依赖 Tauri、bun sidecar 与前端开发服务器；在启动前集中校验，避免窗口打开后才出现难定位的环境错误。
$repositoryRoot = Split-Path -Parent $script:Utf8ScriptRoot
$desktopDirectory = Join-Path $repositoryRoot 'gitpilot-desktop'
$sidecarBinary = Join-Path $desktopDirectory 'src-tauri\binaries\gitpilot-rpc-x86_64-pc-windows-msvc.exe'
$sidecarBuildScript = Join-Path $desktopDirectory 'sidecar\build.sh'
$sidecarSourceDirectory = Join-Path $repositoryRoot 'gitpilot-cli\src'

function Assert-CommandAvailable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "未找到 $Name。请安装对应的开发环境并重新打开 PowerShell 后再试。"
    }
}

function Get-GitBashPath {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe')
    )
    $gitBash = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
    if (-not $gitBash) {
        throw '未找到 Git Bash。请安装 Git for Windows 后重试；不使用 WSL bash 构建 sidecar。'
    }
    return $gitBash
}

if (-not (Test-Path -LiteralPath $desktopDirectory -PathType Container)) {
    throw "未找到 GitPilot 桌面端目录：$desktopDirectory"
}

foreach ($commandName in @('node', 'npm.cmd', 'bun', 'cargo')) {
    Assert-CommandAvailable -Name $commandName
}

# 显式使用 npm.cmd，避免部分 Node 安装附带的 npm.ps1 在被调用运算符间接执行时截断参数。
$npmCommand = (Get-Command 'npm.cmd' -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source

Push-Location $desktopDirectory
try {
    if (-not (Test-Path -LiteralPath 'node_modules' -PathType Container)) {
        Write-Host '==> 安装 GitPilot 桌面端前端依赖'
        & $npmCommand install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install 失败，退出码：$LASTEXITCODE"
        }
    }

    # sidecar 是从 gitpilot-cli 源码编译出的独立二进制；源码或构建脚本更新后必须重编译，
    # 否则桌面端会继续运行旧 RPC 协议和旧模型加载逻辑。
    $sidecarNeedsRebuild = -not (Test-Path -LiteralPath $sidecarBinary -PathType Leaf)
    if (-not $sidecarNeedsRebuild) {
        $sidecarBinaryInfo = Get-Item -LiteralPath $sidecarBinary
        $newestSidecarSource = Get-ChildItem -LiteralPath $sidecarSourceDirectory -Recurse -File -Include '*.ts', '*.tsx' |
            Sort-Object -Property LastWriteTime -Descending |
            Select-Object -First 1
        $sidecarNeedsRebuild = (Get-Item -LiteralPath $sidecarBuildScript).LastWriteTime -gt $sidecarBinaryInfo.LastWriteTime -or
            ($null -ne $newestSidecarSource -and $newestSidecarSource.LastWriteTime -gt $sidecarBinaryInfo.LastWriteTime)
    }

    if ($sidecarNeedsRebuild) {
        $gitBash = Get-GitBashPath
        Write-Host '==> 构建或更新 GitPilot RPC sidecar'
        & $gitBash 'sidecar/build.sh'
        if ($LASTEXITCODE -ne 0) {
            throw "sidecar 构建失败，退出码：$LASTEXITCODE"
        }
    }

    Write-Host '==> 启动 GitPilot 桌面应用（Tauri 开发模式）'
    & $npmCommand run tauri dev
    if ($LASTEXITCODE -ne 0) {
        throw "GitPilot 桌面应用已退出，退出码：$LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
