param()

$ErrorActionPreference = 'Stop'

$script:Utf8ScriptRoot = $PSScriptRoot
. (Join-Path $PSScriptRoot 'utf8-loader.ps1')
Invoke-Utf8Script -Path (Join-Path $script:Utf8ScriptRoot 'start-gitpilot-desktop.impl.ps1')
