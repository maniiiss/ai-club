param(
    [switch]$SkipInfrastructure,
    [switch]$SkipFrontendInstall,
    [switch]$SkipCodeDependencyInstall
)

$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'start.ps1') `
    -SkipInfrastructure:$SkipInfrastructure `
    -SkipFrontendInstall:$SkipFrontendInstall `
    -SkipCodeDependencyInstall:$SkipCodeDependencyInstall
