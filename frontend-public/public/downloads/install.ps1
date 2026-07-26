# GitPilot CLI one-click install (Windows PowerShell)
# Usage: powershell -ep Bypass -c "irm <BASE>/downloads/install.ps1 | iex"
#
# 业务意图：用户执行一条命令即可下载源码包、构建并注册 gitpilot 全局命令，无需手动 git clone。
# 输出消息用英文：PowerShell 5.x 默认按 ANSI 读取无 BOM 脚本，中文输出会乱码。
$ErrorActionPreference = 'Stop'

# 下载基础地址：优先环境变量 GITPILOT_DOWNLOAD_BASE，默认回退本地公众端（开发测试）。
# 生产部署：设置 $env:GITPILOT_DOWNLOAD_BASE 为公众端域名，或在此改为生产域名，
# 并与后端 PLATFORM_GITPILOT_CLI_DOWNLOAD_BASE_URL 保持一致。
$DOWNLOAD_BASE = if ($env:GITPILOT_DOWNLOAD_BASE) { $env:GITPILOT_DOWNLOAD_BASE.TrimEnd('/') } else { 'http://localhost:5175' }
$TARBALL_URL = "$DOWNLOAD_BASE/downloads/gitpilot-cli.tar.gz"
$INSTALL_DIR = Join-Path $env:USERPROFILE '.gitpilot\cli'
$TMP = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP "gitpilot-install-$(Get-Random)")

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

try {
    Write-Step 'Downloading GitPilot CLI source...'
    $tarball = Join-Path $TMP.FullName 'gitpilot-cli.tar.gz'
    try {
        Invoke-WebRequest -Uri $TARBALL_URL -OutFile $tarball -UseBasicParsing
    } catch {
        throw "Download failed: $TARBALL_URL (check network and DOWNLOAD_BASE)"
    }

    Write-Step 'Extracting to ~/.gitpilot/cli...'
    if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
    New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
    & tar.exe -xzf $tarball -C $INSTALL_DIR --strip-components=1
    if ($LASTEXITCODE -ne 0) { throw 'Extract failed (tar.exe unavailable? Windows 10+ has bsdtar)' }

    Write-Step 'Registering gitpilot command...'
    Push-Location $INSTALL_DIR
    try {
        # tarball 已含预构建的 dist + node_modules，只需 npm link 注册全局 gitpilot 命令，无需 install/build。
        & npm.cmd link
        if ($LASTEXITCODE -ne 0) { throw 'npm link failed (may need admin)' }
    } finally {
        Pop-Location
    }

    Write-Host ''
    Write-Host '[OK] GitPilot CLI installed' -ForegroundColor Green
    Write-Host "Installed to: $INSTALL_DIR"
    Write-Host 'Next: run "gitpilot" then /login to authorize.'
} finally {
    Remove-Item -Recurse -Force $TMP.FullName -ErrorAction SilentlyContinue
}
