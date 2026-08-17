param(
    [switch]$SkipInfrastructure,
    [switch]$SkipFrontendInstall,
    [switch]$SkipCodeDependencyInstall
)

$ErrorActionPreference = 'Stop'

$context = Get-ScriptContext
Ensure-EnvFile -TargetPath $context.DefaultEnvFile `
    -TemplatePath $context.DefaultEnvExampleFile `
    -Description '.env'
Import-DotEnv -Path $context.DefaultEnvFile
$ports = Get-PortConfiguration

if (-not $SkipInfrastructure) {
    Assert-Command -Name 'docker' -Hint 'Docker Desktop'
    Stop-ObsoleteHybridPiRuntimeContainer

    Set-HybridDockerRuntimeEnvironment | Out-Null
    # 源码模式的 Pi Runtime 必须由本地 pi-runtime/ Node 进程承载；这里只启动中间件容器。
    $infrastructureArguments = @('up', '-d', 'postgres', 'redis', 'rabbitmq', 'minio', 'qdrant', 'neo4j', 'hindsight', 'gitnexus-web')
    if (Test-WoodpeckerEnabled) {
        $infrastructureArguments += @('woodpecker-server', 'woodpecker-agent')
    }

    Invoke-Compose -ComposeFile $context.HybridComposeFile `
        -EnvFile $context.DefaultEnvFile `
        -Arguments (Add-WoodpeckerProfileIfEnabled -Arguments $infrastructureArguments) `
        -Description '启动源码模式依赖容器'

    Wait-Port -Port $ports.Postgres -TimeoutSeconds 120 -ServiceName 'PostgreSQL'
    Wait-Port -Port $ports.Redis -TimeoutSeconds 120 -ServiceName 'Redis'
    Wait-Port -Port $ports.RabbitMq -TimeoutSeconds 120 -ServiceName 'RabbitMQ'
    Wait-Port -Port $ports.Minio -TimeoutSeconds 120 -ServiceName 'MinIO'
    Wait-Port -Port $ports.Qdrant -TimeoutSeconds 120 -ServiceName 'Qdrant'
    Wait-Port -Port $ports.Neo4j -TimeoutSeconds 120 -ServiceName 'Neo4j'
    Wait-Port -Port $ports.Hindsight -TimeoutSeconds 120 -ServiceName 'Hindsight'
    Wait-Port -Port $ports.GitNexusUi -TimeoutSeconds 120 -ServiceName 'GitNexus Web UI'
    if (Test-WoodpeckerEnabled) {
        Wait-Port -Port $ports.Woodpecker -TimeoutSeconds 120 -ServiceName 'Woodpecker'
    }
    Write-Success '源码模式依赖容器已就绪，Pi Runtime 将由本地源码进程启动'
}

Start-LocalApplicationServices -PortConfiguration $ports `
    -InstallFrontendDependencies:(-not $SkipFrontendInstall) `
    -InstallCodeDependencies:(-not $SkipCodeDependencyInstall)
