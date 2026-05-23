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

    $codeProcessingHost = Set-HybridDockerRuntimeEnvironment
    $infrastructureArguments = @('up', '-d', 'postgres', 'redis', 'minio', 'hindsight', 'gitnexus-web', 'hermes')
    if (Test-WoodpeckerEnabled) {
        $infrastructureArguments += @('woodpecker-server', 'woodpecker-agent')
    }

    Invoke-Compose -ComposeFile $context.HybridComposeFile `
        -EnvFile $context.DefaultEnvFile `
        -Arguments (Add-WoodpeckerProfileIfEnabled -Arguments $infrastructureArguments) `
        -Description '启动源码模式依赖容器'

    Wait-Port -Port $ports.Postgres -TimeoutSeconds 120 -ServiceName 'PostgreSQL'
    Wait-Port -Port $ports.Redis -TimeoutSeconds 120 -ServiceName 'Redis'
    Wait-Port -Port $ports.Minio -TimeoutSeconds 120 -ServiceName 'MinIO'
    Wait-Port -Port $ports.Hindsight -TimeoutSeconds 120 -ServiceName 'Hindsight'
    Wait-Port -Port $ports.GitNexusUi -TimeoutSeconds 120 -ServiceName 'GitNexus Web UI'
    Wait-Port -Port $ports.Hermes -TimeoutSeconds 120 -ServiceName 'Hermes'
    if (Test-WoodpeckerEnabled) {
        Wait-Port -Port $ports.Woodpecker -TimeoutSeconds 120 -ServiceName 'Woodpecker'
    }
    Write-Success "Hermes 将通过 $codeProcessingHost 访问宿主机 code-processing"
}

Start-LocalApplicationServices -PortConfiguration $ports `
    -InstallFrontendDependencies:(-not $SkipFrontendInstall) `
    -InstallCodeDependencies:(-not $SkipCodeDependencyInstall)
