param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# 桌面端依赖 Tauri、bun sidecar 与前端开发服务器；在启动前集中校验，避免窗口打开后才出现难定位的环境错误。
# 兼容直接运行 impl：入口 start-gitpilot-desktop.ps1 会预设 $Utf8ScriptRoot；直接运行时回退到 $PSScriptRoot。
if (-not (Get-Variable -Name 'Utf8ScriptRoot' -Scope Script -ErrorAction SilentlyContinue)) {
    $script:Utf8ScriptRoot = $PSScriptRoot
}
$repositoryRoot = Split-Path -Parent $script:Utf8ScriptRoot
$desktopDirectory = Join-Path $repositoryRoot 'gitpilot-desktop'
$cliDirectory = Join-Path $repositoryRoot 'gitpilot-cli'
$sidecarBinary = Join-Path $desktopDirectory 'src-tauri\binaries\gitpilot-rpc-x86_64-pc-windows-msvc.exe'
$debugSidecarBinary = Join-Path $desktopDirectory 'src-tauri\target\debug\gitpilot-rpc-x86_64-pc-windows-msvc.exe'
$debugSidecarAlias = Join-Path $desktopDirectory 'src-tauri\target\debug\gitpilot-rpc.exe'
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
if (-not (Test-Path -LiteralPath $cliDirectory -PathType Container)) {
    throw "未找到 GitPilot CLI 目录：$cliDirectory"
}

foreach ($commandName in @('node', 'npm.cmd', 'bun', 'cargo')) {
    Assert-CommandAvailable -Name $commandName
}

# 显式使用 npm.cmd，避免部分 Node 安装附带的 npm.ps1 在被调用运算符间接执行时截断参数。
$npmCommand = (Get-Command 'npm.cmd' -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source

# sidecar 直接从 gitpilot-cli 源码打包，桌面端的 node_modules 检查无法覆盖 CLI 运行时依赖。
# 仅在发现 package.json 声明的运行时依赖缺失或版本偏离 lockfile 时补齐，版本一致时复用现有安装，避免每次启动恢复。
$cliPackageManifest = Get-Content -LiteralPath (Join-Path $cliDirectory 'package.json') -Raw | ConvertFrom-Json
$cliLockManifest = Get-Content -LiteralPath (Join-Path $cliDirectory 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$missingCliPackages = @(
    foreach ($packageName in $cliPackageManifest.dependencies.PSObject.Properties.Name) {
        $installedManifestPath = Join-Path $cliDirectory ("node_modules\{0}\package.json" -f $packageName)
        $lockPackagePath = "node_modules/$packageName"
        $lockPackage = $cliLockManifest.packages[$lockPackagePath]
        $installedPackage = if (Test-Path -LiteralPath $installedManifestPath -PathType Leaf) {
            Get-Content -LiteralPath $installedManifestPath -Raw | ConvertFrom-Json
        }

        if ($null -eq $installedPackage -or $null -eq $lockPackage -or $installedPackage.version -ne $lockPackage.version) {
            $packageName
        }
    }
)
if ($missingCliPackages.Count -gt 0) {
    Write-Host ("==> 补齐或更新 GitPilot CLI 运行时依赖：{0}" -f ($missingCliPackages -join ', '))
    Push-Location $cliDirectory
    try {
        # pi-rtk-optimizer 的 peer 版本范围暂未覆盖当前 pi-tui，pi-mcp-adapter 的兼容实现
        # 也暂未把当前 pi-ai 版本列入 peer 范围；锁文件可用时允许 peer 冲突继续安装。
        & $npmCommand ci --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) {
            throw "GitPilot CLI 依赖安装失败，退出码：$LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

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

        # 开发态 resolve_sidecar 优先读取 target/debug 下的副本。若上一次构建时应用仍在运行，
        # build.sh 会因文件锁无法同步该副本；仅检查 binaries 会让下次重启继续运行旧 RPC 逻辑。
        if (-not $sidecarNeedsRebuild) {
            $debugCopyIsStale = -not (Test-Path -LiteralPath $debugSidecarBinary -PathType Leaf) -or
                -not (Test-Path -LiteralPath $debugSidecarAlias -PathType Leaf)
            if (-not $debugCopyIsStale) {
                $debugCopyIsStale = (Get-Item -LiteralPath $debugSidecarBinary).LastWriteTime -lt $sidecarBinaryInfo.LastWriteTime -or
                    (Get-Item -LiteralPath $debugSidecarAlias).LastWriteTime -lt $sidecarBinaryInfo.LastWriteTime
            }
            $sidecarNeedsRebuild = $debugCopyIsStale
        }
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
