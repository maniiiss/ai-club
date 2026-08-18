[CmdletBinding()]
param(
    [string]$ApiBaseUrl = $env:GITPILOT_DESKTOP_API_BASE_URL,
    [string]$SigningKeyPath = $env:GITPILOT_SIGNING_KEY_PATH,
    [switch]$GenerateSigningKey,
    [switch]$SkipBuild,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)

    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [string]$Command,
        [scriptblock]$Action
    )

    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

function Read-SecretText {
    param([string]$Prompt)

    $secureValue = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Get-UpdaterEndpoint {
    param([string]$Value)

    $trimmed = $Value.Trim().TrimEnd('/')
    if ($trimmed -match '/api/desktop-updates/\{\{target\}\}/\{\{arch\}\}/\{\{bundle_type\}\}/\{\{current_version\}\}$') {
        return $trimmed
    }

    return "$trimmed/api/desktop-updates/{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}"
}

function Get-VersionFromFiles {
    param([string]$DesktopRoot)

    $packageJson = Get-Content (Join-Path $DesktopRoot 'package.json') -Raw | ConvertFrom-Json
    $cargoText = Get-Content (Join-Path $DesktopRoot 'src-tauri\Cargo.toml') -Raw
    $tauriConfig = Get-Content (Join-Path $DesktopRoot 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
    $cargoVersion = [regex]::Match($cargoText, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value

    if ([string]::IsNullOrWhiteSpace($cargoVersion) -or
        $packageJson.version -ne $cargoVersion -or
        $packageJson.version -ne $tauriConfig.version) {
        throw "Version mismatch: package.json=$($packageJson.version), Cargo=$cargoVersion, tauri=$($tauriConfig.version). Sync all three versions first."
    }

    return [string]$packageJson.version
}

function Ensure-Sidecar {
    param([string]$SidecarFile)

    if (Test-Path $SidecarFile) {
        return
    }

    if (-not (Get-Command bash.exe -ErrorAction SilentlyContinue)) {
        throw "Sidecar was not found: $SidecarFile. Git Bash is required to build it automatically."
    }
    if (-not (Get-Command bun.exe -ErrorAction SilentlyContinue)) {
        throw 'bun.exe was not found. Install Bun 1.3 or newer, then rerun this script.'
    }

    Write-Step 'Sidecar is missing; building it with sidecar/build.sh'
    $sidecarBuildScript = Join-Path $desktopRoot 'sidecar\build.sh'
    Invoke-Checked 'bash sidecar/build.sh' { bash.exe $sidecarBuildScript }
    if (-not (Test-Path $SidecarFile)) {
        throw "The sidecar build completed without producing: $SidecarFile"
    }
}

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tauriRoot = Join-Path $desktopRoot 'src-tauri'
$tauriConfigPath = Join-Path $tauriRoot 'tauri.conf.json'
$sidecarPath = Join-Path $tauriRoot 'binaries\gitpilot-rpc-x86_64-pc-windows-msvc.exe'
$defaultKeyPath = Join-Path $env:USERPROFILE '.tauri\gitpilot.key'
$tempConfigPath = $null

try {
    Write-Step 'Checking build environment'
    Push-Location $desktopRoot

    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd was not found. Install Node.js 22 or newer first.'
    }
    if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
        throw 'cargo.exe was not found. Install the Rust MSVC toolchain first.'
    }
    Ensure-Sidecar $sidecarPath

    $version = Get-VersionFromFiles $desktopRoot
    $baseConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
    $configuredEndpoint = [string]$baseConfig.plugins.updater.endpoints[0]

    if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
        if ($configuredEndpoint -and $configuredEndpoint -notmatch 'platform\.example') {
            $ApiBaseUrl = $configuredEndpoint -replace '/api/desktop-updates/.*$', ''
        }
        else {
            $ApiBaseUrl = Read-Host 'Enter the release API base URL, for example https://release.example.com'
        }
    }
    if ([string]::IsNullOrWhiteSpace($ApiBaseUrl) -or $ApiBaseUrl -match 'platform\.example') {
        throw 'A real release API URL is required. Pass it with -ApiBaseUrl.'
    }
    $updaterEndpoint = Get-UpdaterEndpoint $ApiBaseUrl

    if ([string]::IsNullOrWhiteSpace($SigningKeyPath)) {
        $SigningKeyPath = $defaultKeyPath
    }
    $SigningKeyPath = [System.IO.Path]::GetFullPath($SigningKeyPath)
    $signingKeyDirectory = Split-Path $SigningKeyPath -Parent
    $publicKeyPath = "$SigningKeyPath.pub"

    if (-not (Test-Path $SigningKeyPath)) {
        Write-Host "Tauri signing key was not found: $SigningKeyPath" -ForegroundColor Yellow
        $answer = Read-Host 'Generate a new signing key now? Enter Y to continue; anything else exits'
        if ($answer -notmatch '^(Y|y)$' -and -not $GenerateSigningKey) {
            throw 'No signing key was generated. Updater ZIP and .sig files cannot be created.'
        }

        New-Item -ItemType Directory -Path $signingKeyDirectory -Force | Out-Null
        Write-Host 'Tauri will ask you to set a signing key password. Save it in a password manager.' -ForegroundColor Yellow
        Invoke-Checked 'npm run tauri -- signer generate' { npm.cmd run tauri -- signer generate -w $SigningKeyPath }
    }
    elseif ($GenerateSigningKey) {
        throw "The signing key already exists: $SigningKeyPath. Remove -GenerateSigningKey to avoid overwriting it."
    }

    if (-not (Test-Path $publicKeyPath)) {
        throw "Public key was not found: $publicKeyPath. Confirm that Tauri signer generate completed successfully."
    }
    $publicKey = (Get-Content $publicKeyPath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($publicKey)) {
        throw "Public key is empty: $publicKeyPath"
    }

    Write-Host "Version: $version" -ForegroundColor Green
    Write-Host "Updater endpoint: $updaterEndpoint" -ForegroundColor DarkGray
    Write-Host "Public key: $publicKeyPath" -ForegroundColor DarkGray
    Write-Host 'The private key is never copied to the release directory.' -ForegroundColor DarkGray

    if (-not $SkipBuild) {
        Write-Step 'Reading signing password and building MSI, NSIS, and updater artifacts'
        $signingPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
        if ([string]::IsNullOrWhiteSpace($signingPassword)) {
            $signingPassword = Read-SecretText 'Enter the Tauri signing key password (press Enter for no password)'
        }

        # Business intent: inject release settings through a temporary overlay without changing source config.
        $tempConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) "gitpilot-tauri-release-$([guid]::NewGuid().ToString('N')).json"
        $configOverlay = [ordered]@{
            plugins = [ordered]@{
                updater = [ordered]@{
                    pubkey = $publicKey
                    endpoints = @($updaterEndpoint)
                }
            }
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($tempConfigPath, ($configOverlay | ConvertTo-Json -Depth 10), $utf8NoBom)

        $env:TAURI_SIGNING_PRIVATE_KEY = $SigningKeyPath
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $signingPassword
        try {
            Invoke-Checked 'npm run tauri -- build' { npm.cmd run tauri -- build --config $tempConfigPath --bundles msi,nsis }
        }
        finally {
            Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
            Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
        }
    }
    else {
        Write-Host 'SkipBuild is enabled; existing Tauri artifacts will be packaged.' -ForegroundColor Yellow
    }

    Write-Step 'Packaging release upload artifacts'
    Invoke-Checked 'npm run release:artifacts' { npm.cmd run release:artifacts }

    $outputDirectory = Join-Path $desktopRoot "release-artifacts\$version"
    if (-not (Test-Path $outputDirectory)) {
        throw "Release directory was not generated: $outputDirectory"
    }
    $artifactCounts = @{
        msi = @(Get-ChildItem (Join-Path $outputDirectory 'msi') -Filter '*.msi' -File -ErrorAction SilentlyContinue).Count
        nsis = @(Get-ChildItem (Join-Path $outputDirectory 'nsis') -Filter '*.exe' -File -ErrorAction SilentlyContinue).Count
        updater = @(Get-ChildItem (Join-Path $outputDirectory 'updater') -Filter '*.zip' -File -ErrorAction SilentlyContinue).Count
        signature = @(Get-ChildItem (Join-Path $outputDirectory 'signature') -Filter '*.sig' -File -ErrorAction SilentlyContinue).Count
    }
    if ($artifactCounts.msi -lt 1 -or $artifactCounts.nsis -lt 1 -or
        $artifactCounts.updater -lt 2 -or $artifactCounts.signature -lt 2) {
        throw "The six-file release matrix is incomplete: MSI=$($artifactCounts.msi), NSIS=$($artifactCounts.nsis), updater ZIP=$($artifactCounts.updater), .sig=$($artifactCounts.signature)."
    }

    Write-Host "`nRelease artifacts are ready: $outputDirectory" -ForegroundColor Green
    Write-Host 'Upload these six files in the Desktop Releases admin page:' -ForegroundColor Green
    Write-Host '  1. MSI installer, MSI updater ZIP, MSI .sig'
    Write-Host '  2. NSIS installer, NSIS updater ZIP, NSIS .sig'
    Write-Host '  3. Enter release notes and publish'
    Write-Host 'WARNING: Never upload the .key private key file.' -ForegroundColor Yellow

    if (-not $NoOpen) {
        Start-Process explorer.exe -ArgumentList "`"$outputDirectory`""
    }
}
catch {
    Write-Host "`nRelease build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($tempConfigPath -and (Test-Path $tempConfigPath)) {
        Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
    }
    Pop-Location -ErrorAction SilentlyContinue
}

exit 0
