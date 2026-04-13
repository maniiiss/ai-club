function Get-Utf8ScriptBlock {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    $utf8Encoding = New-Object System.Text.UTF8Encoding($false)
    $content = [System.IO.File]::ReadAllText($resolvedPath, $utf8Encoding)
    return [scriptblock]::Create($content)
}

function Import-Utf8Script {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $scriptBlock = Get-Utf8ScriptBlock -Path $Path
    . $scriptBlock
}

function Invoke-Utf8Script {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [hashtable]$Parameters = @{}
    )

    $scriptBlock = Get-Utf8ScriptBlock -Path $Path
    & $scriptBlock @Parameters
}
