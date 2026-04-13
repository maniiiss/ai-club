param(
    [string]$OutputRoot = 'dist\docker-package',
    [switch]$SkipImageExport
)

$ErrorActionPreference = 'Stop'

$context = Get-ScriptContext
Assert-Command -Name 'docker' -Hint 'Docker Desktop'
Ensure-FullDockerEnvFile

Import-DotEnv -Path $context.FullDockerEnvFile
$ports = Get-PortConfiguration

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$packageDir = Join-Path $context.RepoRoot (Join-Path $OutputRoot $timestamp)
$imagesTar = Join-Path $packageDir 'git-ai-club-images.tar'
$imagesListPath = Join-Path $packageDir 'images.txt'
$readmePath = Join-Path $packageDir 'README.txt'

Invoke-Compose -ComposeFile $context.FullDockerComposeFile `
    -EnvFile $context.FullDockerEnvFile `
    -Arguments @('build', '--pull') `
    -Description '构建全量 Docker 业务镜像'

Invoke-Compose -ComposeFile $context.FullDockerComposeFile `
    -EnvFile $context.FullDockerEnvFile `
    -Arguments @('pull', 'postgres', 'redis', 'minio', 'hindsight', 'hermes') `
    -Description '拉取全量 Docker 中间件镜像'

Write-Step "准备 Docker 打包目录：$packageDir"
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
Copy-Item $context.FullDockerComposeFile (Join-Path $packageDir 'docker-compose.yml') -Force
Copy-Item $context.FullDockerEnvExampleFile (Join-Path $packageDir '.env.example') -Force
Copy-Item $context.PostgresInitDir (Join-Path $packageDir 'postgres-init') -Recurse -Force

$images = Get-ComposeImages -ComposeFile $context.FullDockerComposeFile -EnvFile $context.FullDockerEnvFile
Write-Utf8NoBomFile -Path $imagesListPath -Content ((($images -join [Environment]::NewLine) + [Environment]::NewLine))

if (-not $SkipImageExport) {
    Write-Step "导出 Docker 镜像到 $imagesTar"
    docker save -o $imagesTar @images
    if ($LASTEXITCODE -ne 0) {
        throw '导出 Docker 镜像失败'
    }
} else {
    Write-WarnMessage '已跳过 Docker 镜像导出，仅生成 compose 与说明文件。'
}

$readmeContent = @"
AI Club Docker 打包说明
======================

1. 将 .env.example 复制为 .env，并按部署环境补齐变量。
2. 如果目录里包含镜像包，请先执行：
   docker load -i git-ai-club-images.tar
3. 启动命令：
   docker compose up -d
4. 停止命令：
   docker compose down

默认访问地址
- Frontend: http://localhost:$($ports.Frontend)
- Backend: http://localhost:$($ports.Backend)
- Code processing: http://localhost:$($ports.CodeProcessing)
- Hermes: http://localhost:$($ports.Hermes)
- Hindsight: http://localhost:$($ports.Hindsight)
- PostgreSQL: localhost:$($ports.Postgres)
- Redis: localhost:$($ports.Redis)
- MinIO: http://localhost:$($ports.Minio)

镜像清单
$($images | ForEach-Object { "- $_" } | Out-String)
"@
Write-Utf8NoBomFile -Path $readmePath -Content $readmeContent

Write-Host ''
Write-Success "Docker 打包完成：$packageDir"
