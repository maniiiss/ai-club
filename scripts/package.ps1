param(
    [string]$OutputRoot = "dist\docker-package",
    [switch]$SkipImageExport
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageDir = Join-Path $projectRoot (Join-Path $OutputRoot $timestamp)
$imagesTar = Join-Path $packageDir "git-ai-club-images.tar"
$readmePath = Join-Path $packageDir "README.txt"

$images = @(
    "git-ai-club-backend:latest",
    "git-ai-club-frontend:latest",
    "git-ai-club-code-processing:latest"
)

Write-Host "[1/4] Building application images with docker compose..."
docker compose build

Write-Host "[2/4] Preparing package directory: $packageDir"
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
Copy-Item ".env.example" (Join-Path $packageDir ".env.example") -Force
Copy-Item "docker-compose.yml" (Join-Path $packageDir "docker-compose.yml") -Force
Copy-Item "docker\postgres\init" (Join-Path $packageDir "postgres-init") -Recurse -Force

if (-not $SkipImageExport) {
    Write-Host "[3/4] Exporting docker images to $imagesTar ..."
    docker save -o $imagesTar @images
} else {
    Write-Host "[3/4] Skipped docker image export."
}

Write-Host "[4/4] Writing package instructions..."
@"
git-ai-club docker package
==========================

1. Copy .env.example to .env and adjust values if needed.
2. If you exported images, load them with:
   docker load -i git-ai-club-images.tar
3. Start the stack with:
   docker compose up -d

Services
- Frontend: http://localhost:5173
- Backend:  http://localhost:8080
- Code processing: http://localhost:9000
- PostgreSQL: localhost:5432
"@ | Set-Content -Path $readmePath -Encoding UTF8

Write-Host "Package completed: $packageDir"
