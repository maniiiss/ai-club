[CmdletBinding()]
param(
    # 发布 API 基地址或完整 updater 清单地址；构建时会注入安装包，不写回源码配置。
    [Parameter(Mandatory = $true, HelpMessage = '请输入平台 API 地址，例如 https://release.example.com 或 http://localhost:8080')]
    [string]$ApiBaseUrl,
    [Parameter(Position = 0)]
    [string]$Version
)

# GitPilot Desktop 一键发布打包脚本（Windows PowerShell）
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-oneclick.ps1 [版本号] -ApiBaseUrl https://你的平台域名
#   内网/本机测试也支持：-ApiBaseUrl http://localhost:8080
#   或直接双击 scripts\build-release-oneclick.cmd，按提示填写 API 地址
# - 自动把版本同步到 package.json / src-tauri\Cargo.toml / src-tauri\tauri.conf.json
# - 自动确保 Tauri 签名密钥存在（不存在则生成），并把公钥同步进 tauri.conf.json
# - 构建 MSI + NSIS 安装器 + updater ZIP + .sig 签名，整理成后台上传六件套
# 产物：release-artifacts\<版本>\   （含 release-artifacts.json 与说明）
# 环境变量：TAURI_SIGNING_PRIVATE_KEY_PASSWORD 提供则跳过口令输入，
#           GITPILOT_SIGNING_KEY_PATH 可指定签名私钥路径（默认 ~\.tauri\gitpilot.key）
$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Read-SecretText {
    param([string]$Prompt)
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Write-Utf8NoBom { param([string]$Path, [string]$Content) [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false))) }
# 业务意图：把发布者填写的地址统一成 Tauri 动态清单地址，避免空 endpoint 被编译进安装包。
function Get-UpdaterEndpoint {
    param([string]$Value)

    $trimmed = $Value.Trim().TrimEnd('/')
    if ($trimmed -notmatch '^https?://[^\s]+$') {
        throw '错误：ApiBaseUrl 必须使用 http:// 或 https:// 地址。'
    }
    if ($trimmed -match '/api/desktop-updates/\{\{target\}\}/\{\{arch\}\}/\{\{bundle_type\}\}/\{\{current_version\}\}$') {
        return $trimmed
    }

    return "$trimmed/api/desktop-updates/{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}"
}

Set-Location (Join-Path $PSScriptRoot '..')

$UpdaterEndpoint = Get-UpdaterEndpoint $ApiBaseUrl
$AllowInsecureUpdater = $UpdaterEndpoint -match '^http://'

# ---------- 1. 版本号 ----------
$SemverRegex = '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
if (-not $Version) { $Version = $env:GITPILOT_RELEASE_VERSION }
if (-not $Version) {
    $currentVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $Version = Read-Host "请输入发布版本号（当前 $currentVersion）"
}
if ($Version -notmatch $SemverRegex) { throw "错误：版本号必须是 semver，例如 0.2.0" }

# ---------- 2. 同步三处版本 ----------
Write-Step "同步版本号到 package.json / Cargo.toml / tauri.conf.json：$Version"
$packageJson = Get-Content package.json -Raw
$packageJson = $packageJson -replace '"version"\s*:\s*"[^"]*"', ('"version": "' + $Version + '"')   # 仅替换第一个（即包版本）
Write-Utf8NoBom (Join-Path (Get-Location) 'package.json') $packageJson

$cargoToml = Get-Content src-tauri\Cargo.toml -Raw
$cargoToml = $cargoToml -replace '(?m)^version\s*=\s*"[^"]*"', ('version = "' + $Version + '"')
Write-Utf8NoBom (Join-Path (Get-Location) 'src-tauri\Cargo.toml') $cargoToml

$tauriConf = Get-Content src-tauri\tauri.conf.json -Raw
$tauriConf = $tauriConf -replace '"version"\s*:\s*"[^"]*"', ('"version": "' + $Version + '"')
Write-Utf8NoBom (Join-Path (Get-Location) 'src-tauri\tauri.conf.json') $tauriConf

# ---------- 3. 签名密钥 ----------
Write-Step "检查 Tauri 更新签名密钥"
$keyPath = if ($env:GITPILOT_SIGNING_KEY_PATH) { $env:GITPILOT_SIGNING_KEY_PATH } else { Join-Path $HOME '.tauri\gitpilot.key' }
$keyPath = [System.IO.Path]::GetFullPath($keyPath)
$pubPath = "$keyPath.pub"

if (-not (Test-Path $keyPath)) {
    Write-Host "未找到签名私钥，先生成：$keyPath" -ForegroundColor Yellow
    $pw1 = Read-SecretText '为私钥设置口令（务必记住，丢失将无法再签更新包）'
    $pw2 = Read-SecretText '再次输入口令确认'
    if ($pw1 -ne $pw2) { throw '两次口令不一致' }
    New-Item -ItemType Directory -Path (Split-Path $keyPath -Parent) -Force | Out-Null
    npm.cmd run tauri -- signer generate -w $keyPath -p $pw1
    Write-Host "已生成。私钥：$keyPath（请立即备份到安全位置）" -ForegroundColor Green
}
if (-not (Test-Path $pubPath)) { throw "缺少公钥文件: $pubPath" }
$pubkey = (Get-Content $pubPath -Raw).Trim()
if (-not $pubkey) { throw "公钥为空: $pubPath" }

# ---------- 4. 同步公钥进 tauri.conf.json ----------
$tauriConf = Get-Content src-tauri\tauri.conf.json -Raw
if (-not $tauriConf.Contains($pubkey)) {
    $tauriConf = $tauriConf -replace '"pubkey"\s*:\s*"[^"]*"', ('"pubkey": "' + $pubkey + '"')
    Write-Utf8NoBom (Join-Path (Get-Location) 'src-tauri\tauri.conf.json') $tauriConf
    Write-Host '已同步公钥到 tauri.conf.json' -ForegroundColor Gray
}

if ((Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).bundle.createUpdaterArtifacts -ne 'v1Compatible') {
    throw 'tauri.conf.json 的 createUpdaterArtifacts 需为 "v1Compatible" 才能产出 ZIP 签名'
}

# ---------- 5. 强制重建 sidecar ----------
Write-Step "强制重建 sidecar（gitpilot-rpc，跟随最新 CLI 源码）"
# 业务意图：sidecar 是打包时按 externalBin 原样打进安装包的，若沿用旧二进制，
# 会出现“新前端调旧 sidecar”的命令缺失问题（历史教训：0.1.2 曾缺 work_item_page）。
# 每次发布都强制用 sidecar/build.sh 从 gitpilot-cli 最新源码重编，避免旧 sidecar 混入发布包。
# 注：bun 通常是 npm 全局 shim（bun.cmd/bun.ps1，无 bun.exe），故按命令名 bun 而非 bun.exe 检查。
if (-not (Get-Command bun -ErrorAction SilentlyContinue) -and -not (Get-Command bun.exe -ErrorAction SilentlyContinue)) {
    throw '未找到 bun，需要 Bun 才能编译 sidecar。请先安装 Bun（https://bun.sh）后重试。'
}
bash.exe ./sidecar/build.sh
if ($LASTEXITCODE -ne 0) {
    throw "sidecar/build.sh 失败（exit code=$LASTEXITCODE），终止打包。"
}
Write-Host "sidecar 重建完成。" -ForegroundColor Green

# ---------- 6. 构建并签名 ----------
Write-Step "构建并签名（MSI + NSIS + updater ZIP + .sig）"
$signingPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# 业务意图：空口令密钥下，显式设置（即使为空串）即视为已提供密码；否则后台/CI 运行会卡在 Read-Host。
if ($null -eq $signingPassword) { $signingPassword = Read-SecretText '请输入签名私钥口令（无口令直接回车）' }
# 业务意图：Tauri 构建前先清空 bundle 产物目录，避免上次构建的旧版本安装包和 .sig 残留，
# 被 package-release.mjs 递归扫描后混进当前版本的发布产物（历史教训：0.1.2 曾混入 0.1.1 的签名）。
$bundleDir = Join-Path (Get-Location) 'src-tauri\target\release\bundle'
if (Test-Path -LiteralPath $bundleDir) {
    Write-Host "清空旧 bundle 产物：$bundleDir" -ForegroundColor DarkGray
    Remove-Item -LiteralPath $bundleDir -Recurse -Force
}
$tempConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) "gitpilot-tauri-release-$([guid]::NewGuid().ToString('N')).json"
$configOverlay = [ordered]@{
    plugins = [ordered]@{
        updater = [ordered]@{
            endpoints = @($UpdaterEndpoint)
            # 业务意图：内网/本机发布服务可能只有 HTTP；显式开启 Tauri 的兼容开关，
            # 否则正式版会在启动阶段因不安全 endpoint 直接退出。
            dangerousInsecureTransportProtocol = $AllowInsecureUpdater
        }
    }
}
Write-Utf8NoBom $tempConfigPath ($configOverlay | ConvertTo-Json -Depth 10)
Write-Host "Updater endpoint: $UpdaterEndpoint" -ForegroundColor DarkGray
if ($AllowInsecureUpdater) {
    Write-Host '警告：当前使用 HTTP updater，仅适合本机/内网测试；正式公网发布请改用 HTTPS。' -ForegroundColor Yellow
}
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $signingPassword
try {
    npm.cmd run tauri -- build --config $tempConfigPath --bundles msi,nsis
    # 业务意图：Windows PowerShell 下 $ErrorActionPreference='Stop' 不会捕获原生命令（npm）的非零退出码，
    # 若不显式检查，签名失败时脚本会继续往下跑，把旧签名当成当前版本签名打包（历史教训：0.1.2 无 .sig）。
    if ($LASTEXITCODE -ne 0) {
        throw "tauri build 失败（exit code=$LASTEXITCODE），未能生成签名，终止打包。请检查签名私钥与口令。"
    }
    # 业务意图：构建结束必须存在当前版本的 updater ZIP 签名，否则说明签名步骤未成功，直接终止。
    $expectedSig = Get-ChildItem -LiteralPath $bundleDir -Recurse -Filter "GitPilot_${Version}_*.zip.sig" -File -ErrorAction SilentlyContinue
    if (-not $expectedSig) {
        throw "未找到 $Version 的 updater .sig（GitPilot_${Version}_*.zip.sig），签名步骤未成功，终止打包。"
    }
    Write-Host "已生成 $($expectedSig.Count) 个 $Version 的 updater 签名。" -ForegroundColor Green
}
finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tempConfigPath) {
        Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
    }
}

# ---------- 7. 整理六件套 ----------
Write-Step "整理发布产物流入 release-artifacts\$Version"
node scripts/package-release.mjs

$outDir = Join-Path (Get-Location) "release-artifacts\$Version"
# 只保留 updater ZIP 的 .sig（后台 SIGNATURE 格子对应 ZIP 签名），删除安装器自身的 .sig
Get-ChildItem (Join-Path $outDir 'signature') -Filter *.sig -File |
    Where-Object { $_.Name -notlike '*.zip.sig' } | Remove-Item

# ---------- 8. 输出 ----------
$msiInstaller = (Get-ChildItem (Join-Path $outDir 'msi') -Filter *.msi | Select-Object -First 1).Name
$nsisInstaller = (Get-ChildItem (Join-Path $outDir 'nsis') -Filter *.exe | Select-Object -First 1).Name
$msiZip = (Get-ChildItem (Join-Path $outDir 'updater') -Filter *.msi.zip | Select-Object -First 1).Name
$nsisZip = (Get-ChildItem (Join-Path $outDir 'updater') -Filter *.nsis.zip | Select-Object -First 1).Name
Write-Host "`n打包完成：release-artifacts\$Version" -ForegroundColor Green
Write-Host "  [msi]  安装器=$msiInstaller"
Write-Host "  [msi]  updater=$msiZip"
Write-Host "  [msi]  签名   =$msiZip.sig"
Write-Host "  [nsis] 安装器=$nsisInstaller"
Write-Host "  [nsis] updater=$nsisZip"
Write-Host "  [nsis] 签名   =$nsisZip.sig"
Write-Host '共 6 个文件（含 updater ZIP 与其签名），在后台「桌面版本发布」按格子上传即可。' -ForegroundColor Green
Write-Host "签名私钥：$keyPath（务必备份）" -ForegroundColor Yellow
