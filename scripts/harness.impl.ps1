param(
    [ValidateSet('docs', 'backend', 'frontend', 'code-processing', 'all')]
    [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

$context = Get-ScriptContext

function Assert-LastExitCode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$CommandName 执行失败，退出码：$LASTEXITCODE"
    }
}

function Invoke-HarnessStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Step $Name
    & $Action
    Write-Success $Name
}

function Get-EncodingCheckTargets {
    switch ($Target) {
        'docs' {
            return @('AGENTS.md', 'README.md', 'docs', 'scripts')
        }
        'backend' {
            return @('backend')
        }
        'frontend' {
            return @('frontend')
        }
        'code-processing' {
            return @('code-processing')
        }
        default {
            return @()
        }
    }
}

function Invoke-EncodingCheck {
    Invoke-HarnessStep -Name '检查仓库编码与疑似乱码' -Action {
        Push-Location $context.RepoRoot
        try {
            $targets = Get-EncodingCheckTargets
            if ($targets.Count -gt 0) {
                python scripts/check_encoding.py @targets
            } else {
                python scripts/check_encoding.py
            }
            Assert-LastExitCode -CommandName 'python scripts/check_encoding.py'
        } finally {
            Pop-Location
        }
    }
}

function Write-ArchitectureDocReminder {
    Write-WarnMessage '如果本次改动涉及技术架构调整、跨模块边界变化或大型技术设计，请同步更新 docs/architecture.md 或新增 docs/*-architecture-vN.md / docs/*-technical-design-vN.md；模板见 docs/architecture-design-template.md。'
}

function Invoke-BackendTests {
    Invoke-HarnessStep -Name '运行后端 Maven 测试' -Action {
        Push-Location $context.BackendDir
        try {
            mvn -s maven-settings-central.xml test
            Assert-LastExitCode -CommandName 'mvn -s maven-settings-central.xml test'
        } finally {
            Pop-Location
        }
    }
}

function Invoke-FrontendBuild {
    Invoke-HarnessStep -Name '运行前端类型检查与构建' -Action {
        Push-Location $context.FrontendDir
        try {
            npm run build
            Assert-LastExitCode -CommandName 'npm run build'
        } finally {
            Pop-Location
        }
    }
}

function Invoke-CodeProcessingInstallCheck {
    Invoke-HarnessStep -Name '检查 code-processing Python 包可安装' -Action {
        Push-Location $context.CodeDir
        try {
            python -m pip install -e .
            Assert-LastExitCode -CommandName 'python -m pip install -e .'
        } finally {
            Pop-Location
        }
    }
}

# Harness 统一入口先跑编码检查，避免 UTF-8、LF 或中文乱码问题扩散到后续步骤。
Invoke-EncodingCheck
Write-ArchitectureDocReminder

if ($Target -in @('backend', 'all')) {
    Invoke-BackendTests
}

if ($Target -in @('frontend', 'all')) {
    Invoke-FrontendBuild
}

if ($Target -in @('code-processing', 'all')) {
    Invoke-CodeProcessingInstallCheck
}

Write-Success "Harness 验证完成：$Target"
