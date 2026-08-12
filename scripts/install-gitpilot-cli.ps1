param(
    [string]$PlatformUrl = 'http://localhost:8080',
    [switch]$SkipNpmLink,
    [switch]$LaunchCli
)

$ErrorActionPreference = 'Stop'

# gitpilot-cli 是 pi-coding-agent 二开 fork，自带全部依赖（含 @earendil-works/*），
# 不再单独安装 gitpilot-agent-core。CLI 入口为 dist/cli.js。
$repoRoot = Split-Path -Parent $PSScriptRoot
$cliDir = Join-Path $repoRoot 'gitpilot-cli'
$cliEntry = Join-Path $cliDir 'dist\cli.js'

function Require-Command {
    param(
        [string]$Name,
        [string]$Hint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing command [$Name]. Please install: $Hint"
    }
}

function Invoke-Npm {
    param(
        [string]$WorkingDirectory,
        [string[]]$Arguments
    )

    Push-Location $WorkingDirectory
    try {
        $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
        if (-not $npm) { $npm = (Get-Command npm -ErrorAction Stop).Source }
        & $npm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "npm $($Arguments -join ' ') failed"
        }
    } finally {
        Pop-Location
    }
}

Require-Command -Name 'node' -Hint 'Node.js 22.19 or newer（pi-coding-agent 0.81.1 要求）'
Require-Command -Name 'npm' -Hint 'npm bundled with Node.js'

$normalizedPlatformUrl = $PlatformUrl.TrimEnd('/')
$parsedPlatformUri = $null
if (-not [Uri]::TryCreate($normalizedPlatformUrl, [UriKind]::Absolute, [ref]$parsedPlatformUri)) {
    throw "Invalid platform URL: $PlatformUrl"
}

# 业务意图：安装器只负责 CLI 本身，不隐式启动平台开发环境。
Write-Host '==> Installing and building GitPilot CLI' -ForegroundColor Cyan
Invoke-Npm -WorkingDirectory $cliDir -Arguments @('install')
Invoke-Npm -WorkingDirectory $cliDir -Arguments @('run', 'build')

if (-not $SkipNpmLink) {
    Write-Host '==> Registering the gitpilot command' -ForegroundColor Cyan
    Invoke-Npm -WorkingDirectory $cliDir -Arguments @('link')
}

# 平台地址持久化到 ~/.gitpilot/agent/platform.json（由 CLI 的平台 extension 读取）。
Write-Host '==> Configuring the GitPilot CLI platform URL' -ForegroundColor Cyan
& node -e "const fs=require('fs');const os=require('os');const p=require('path');const d=p.join(os.homedir(),'.gitpilot','agent');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(p.join(d,'platform.json'),JSON.stringify({platformUrl:'$normalizedPlatformUrl'},null,2)+'\n');console.log('platform URL saved: $normalizedPlatformUrl');"
if ($LASTEXITCODE -ne 0) { throw 'GitPilot CLI platform URL configuration failed' }

Write-Host ''
Write-Host '[OK] GitPilot CLI installation and platform configuration completed' -ForegroundColor Green
Write-Host "Platform URL: $normalizedPlatformUrl"
Write-Host 'The platform is not started by this installer.'
Write-Host 'Next: run "gitpilot" to start the interactive agent, then type "/gitpilot login" to complete device authorization.'

if ($LaunchCli) {
    & node $cliEntry
}
