param()

$ErrorActionPreference = 'Stop'

Initialize-LogDirectory
Stop-LocalServices

Write-Host ''
Write-Success '源码服务已停止'
