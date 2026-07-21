param(
    [string]$PlatformUrl = 'http://localhost:8080',
    [switch]$SkipNpmLink,
    [switch]$LaunchCli
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$cliDir = Join-Path $repoRoot 'gitpilot-cli'
$coreDir = Join-Path $repoRoot 'packages\gitpilot-agent-core'
$cliEntry = Join-Path $cliDir 'dist\main.js'

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

Require-Command -Name 'node' -Hint 'Node.js 20 or newer'
Require-Command -Name 'npm' -Hint 'npm bundled with Node.js'

$normalizedPlatformUrl = $PlatformUrl.TrimEnd('/')
$parsedPlatformUri = $null
if (-not [Uri]::TryCreate($normalizedPlatformUrl, [UriKind]::Absolute, [ref]$parsedPlatformUri)) {
    throw "Invalid platform URL: $PlatformUrl"
}

# 业务意图：安装器只负责 CLI 本身，不隐式启动平台开发环境。
Write-Host '==> Installing Agent Core dependencies' -ForegroundColor Cyan
Invoke-Npm -WorkingDirectory $coreDir -Arguments @('install')

Write-Host '==> Installing and building GitPilot CLI' -ForegroundColor Cyan
Invoke-Npm -WorkingDirectory $cliDir -Arguments @('install')
Invoke-Npm -WorkingDirectory $cliDir -Arguments @('run', 'build')

if (-not $SkipNpmLink) {
    Write-Host '==> Registering the gitpilot command' -ForegroundColor Cyan
    Invoke-Npm -WorkingDirectory $cliDir -Arguments @('link')
}

Write-Host '==> Configuring the GitPilot CLI platform URL' -ForegroundColor Cyan
& node $cliEntry register $normalizedPlatformUrl
if ($LASTEXITCODE -ne 0) { throw 'GitPilot CLI platform URL configuration failed' }

Write-Host ''
Write-Host '[OK] GitPilot CLI installation and platform configuration completed' -ForegroundColor Green
Write-Host "Platform URL: $normalizedPlatformUrl"
Write-Host 'The platform is not started by this installer.'
Write-Host 'Next: run gitpilot login to complete device authorization; then run gitpilot models.'

if ($LaunchCli) {
    & node $cliEntry
}
