param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$context = Get-ScriptContext
Assert-Command -Name 'docker' -Hint 'Docker Desktop'
Ensure-FullDockerEnvFile
Import-DotEnv -Path $context.FullDockerEnvFile
$ports = Get-PortConfiguration

$composeArguments = Add-WoodpeckerProfileIfEnabled -Arguments @('up', '-d')
if (-not $SkipBuild) {
    $composeArguments += '--build'
}
$composeArguments += '--remove-orphans'

Invoke-Compose -ComposeFile $context.FullDockerComposeFile `
    -EnvFile $context.FullDockerEnvFile `
    -Arguments $composeArguments `
    -Description '启动全量 Docker 项目'

Wait-Port -Port $ports.Postgres -TimeoutSeconds 180 -ServiceName 'PostgreSQL'
Wait-Port -Port $ports.Redis -TimeoutSeconds 180 -ServiceName 'Redis'
Wait-Port -Port $ports.Minio -TimeoutSeconds 180 -ServiceName 'MinIO'
Wait-Port -Port $ports.CodeProcessing -TimeoutSeconds 180 -ServiceName 'Code processing'
Wait-Port -Port $ports.Qdrant -TimeoutSeconds 180 -ServiceName 'Qdrant'
Wait-Port -Port $ports.Hindsight -TimeoutSeconds 180 -ServiceName 'Hindsight'
Wait-Port -Port $ports.Hermes -TimeoutSeconds 180 -ServiceName 'Hermes'
Wait-Port -Port $ports.GitNexusUi -TimeoutSeconds 180 -ServiceName 'GitNexus Web UI'
if (Test-WoodpeckerEnabled) {
    Wait-Port -Port $ports.Woodpecker -TimeoutSeconds 180 -ServiceName 'Woodpecker'
}
Wait-Port -Port $ports.Backend -TimeoutSeconds 180 -ServiceName 'Backend'
Wait-Port -Port $ports.Frontend -TimeoutSeconds 180 -ServiceName 'Frontend'

Write-Host ''
Write-Success '全量 Docker 项目启动完成'
Write-Host "Frontend: http://localhost:$($ports.Frontend)"
Write-Host "Backend: http://localhost:$($ports.Backend)"
Write-Host "Code processing: http://localhost:$($ports.CodeProcessing)"
Write-Host "Hermes: http://localhost:$($ports.Hermes)"
Write-Host "Qdrant: http://localhost:$($ports.Qdrant)"
Write-Host "Hindsight: http://localhost:$($ports.Hindsight)"
Write-Host "GitNexus Web UI: http://localhost:$($ports.GitNexusUi)"
if (Test-WoodpeckerEnabled) {
    Write-Host "Woodpecker: http://localhost:$($ports.Woodpecker)"
}
