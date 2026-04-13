param()

$ErrorActionPreference = 'Stop'

$context = Get-ScriptContext
Assert-Command -Name 'docker' -Hint 'Docker Desktop'
$envFile = if (Test-Path $context.FullDockerEnvFile) { $context.FullDockerEnvFile } else { $null }

Invoke-Compose -ComposeFile $context.FullDockerComposeFile `
    -EnvFile $envFile `
    -Arguments @('down', '--remove-orphans') `
    -Description '关闭全量 Docker 项目'

Write-Host ''
Write-Success '全量 Docker 项目已关闭'
