param(
    [switch]$SkipInfrastructure,
    [switch]$SkipFrontendInstall,
    [switch]$SkipCodeDependencyInstall
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'utf8-loader.ps1')
$script:Utf8ScriptRoot = $PSScriptRoot

$commonScript = Get-Utf8ScriptBlock -Path (Join-Path $PSScriptRoot 'common.ps1')
. $commonScript
Invoke-Utf8Script -Path (Join-Path $PSScriptRoot 'start.impl.ps1') -Parameters @{
    SkipInfrastructure       = $SkipInfrastructure
    SkipFrontendInstall      = $SkipFrontendInstall
    SkipCodeDependencyInstall = $SkipCodeDependencyInstall
}
