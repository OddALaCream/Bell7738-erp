$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$PackageManifest = Join-Path $Root "package.json"

if (-not (Test-Path -LiteralPath $PackageManifest -PathType Leaf)) {
    Write-Host "Project scaffold not created yet. Verification commands are not available."
    exit 0
}

$Checks = @(
    @{ Label = "Lint"; Command = "lint" },
    @{ Label = "Typecheck"; Command = "typecheck" },
    @{ Label = "Tests"; Command = "test" },
    @{ Label = "Build"; Command = "build" }
)

foreach ($Check in $Checks) {
    Write-Host ""
    Write-Host "==> $($Check.Label)"
    & pnpm $Check.Command

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "All checks passed."
