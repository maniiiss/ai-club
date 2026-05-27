param()

$ErrorActionPreference = 'Stop'

$context = Get-ScriptContext
Assert-Command -Name 'docker' -Hint 'Docker Desktop'
$envFile = if (Test-Path $context.FullDockerEnvFile) { $context.FullDockerEnvFile } else { $null }
$composeArguments = @('--profile', 'woodpecker', 'down', '--remove-orphans')

# 停止全量 Docker 时固定纳入 woodpecker profile，避免此前按 profile 启动过
# Woodpecker 容器后，本次关闭遗漏 woodpecker-server / woodpecker-agent。
Invoke-Compose -ComposeFile $context.FullDockerComposeFile `
    -EnvFile $envFile `
    -Arguments $composeArguments `
    -Description '关闭全量 Docker 项目'

Write-Host ''
Write-Success '全量 Docker 项目已关闭'
