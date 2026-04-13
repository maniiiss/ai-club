param()

$ErrorActionPreference = 'Stop'

$context = Get-ScriptContext

Initialize-LogDirectory
Stop-LocalServices

Assert-Command -Name 'docker' -Hint 'Docker Desktop'
$envFile = if (Test-Path $context.DefaultEnvFile) { $context.DefaultEnvFile } else { $null }

Invoke-Compose -ComposeFile $context.HybridComposeFile `
    -EnvFile $envFile `
    -Arguments @('stop', 'postgres', 'redis', 'minio', 'hindsight', 'hermes') `
    -Description '停止源码模式依赖容器'

Write-Host ''
Write-Success '源码模式项目已停止'
