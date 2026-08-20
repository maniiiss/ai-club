# GitPilot Desktop 一键发布打包脚本（Windows PowerShell）
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-oneclick.ps1 [版本号]
#   或直接双击 scripts\build-release-oneclick.cmd
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

Set-Location (Join-Path $PSScriptRoot '..')

# ---------- 1. 版本号 ----------
$SemverRegex = '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
$Version = $args[0]
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

# ---------- 5. 构建并签名 ----------
Write-Step "构建并签名（MSI + NSIS + updater ZIP + .sig）"
$signingPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
if (-not $signingPassword) { $signingPassword = Read-SecretText '请输入签名私钥口令（无口令直接回车）' }
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $signingPassword
npm.cmd run tauri -- build --bundles msi,nsis
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue

# ---------- 6. 整理六件套 ----------
Write-Step "整理发布产物流入 release-artifacts\$Version"
node scripts/package-release.mjs

$outDir = Join-Path (Get-Location) "release-artifacts\$Version"
# 只保留 updater ZIP 的 .sig（后台 SIGNATURE 格子对应 ZIP 签名），删除安装器自身的 .sig
Get-ChildItem (Join-Path $outDir 'signature') -Filter *.sig -File |
    Where-Object { $_.Name -notlike '*.zip.sig' } | Remove-Item

# ---------- 7. 输出 ----------
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