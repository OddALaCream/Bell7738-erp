$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))

$Source = Join-Path $Root "agent-skills"
$Codex = Join-Path $Root ".agents\skills"
$Claude = Join-Path $Root ".claude\skills"

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Canonical skills directory not found: $Source"
}

$Destinations = @($Codex, $Claude)

foreach ($Destination in $Destinations) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    Get-ChildItem -LiteralPath $Destination -Force |
        Remove-Item -Recurse -Force

    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

Write-Host "Agent skills synchronized successfully."
