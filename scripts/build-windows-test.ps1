param(
    [Parameter(Mandatory = $true)][string]$NativeHost,
    [string]$GoCommand = 'go',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../build/windows-test')
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$hostPath = (Resolve-Path -LiteralPath $NativeHost).Path
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (!(Test-Path -LiteralPath (Join-Path $sourceRoot 'frontend/dist/index.html'))) {
    throw 'Frontend assets are missing. Build frontend/dist before packaging.'
}
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'wails.json') | ConvertFrom-Json).info.productVersion
New-Item -ItemType Directory -Force (Join-Path $outputRoot 'native') | Out-Null
Push-Location $sourceRoot
try {
    # Never rely solely on a launcher's LUNA_TEST_MODE environment: external
    # MCP clients launch this executable independently from the GUI process.
    & $GoCommand build -tags production -ldflags "-H windowsgui -X browser-mac/internal/buildinfo.Version=$version-monitor-test -X browser-mac/internal/buildinfo.TestMode=1" -o (Join-Path $outputRoot 'Luna.exe') .
    if ($LASTEXITCODE -ne 0) { throw 'Windows test build failed.' }
} finally { Pop-Location }
$destinationHost = Join-Path $outputRoot 'native/Luna.Windows.exe'
if ([IO.Path]::GetFullPath($hostPath) -ne [IO.Path]::GetFullPath($destinationHost)) {
    Copy-Item -LiteralPath $hostPath -Destination $destinationHost
}
Write-Output (Join-Path $outputRoot 'Luna.exe')
