param()

$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'stop.ps1')
& (Join-Path $PSScriptRoot 'start.ps1') `
    -SkipInfrastructure `
    -SkipFrontendInstall `
    -SkipCodeDependencyInstall
