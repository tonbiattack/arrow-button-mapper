[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'Temp\opencode')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$destination = Join-Path $OutputDirectory "arrow-button-mapper-$($manifest.version).zip"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
if (Test-Path $destination) { throw "Package already exists: $destination" }

$files = @('manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.css', 'popup-localize.js', 'popup.js')
foreach ($directory in @('icons', '_locales')) {
    $files += Get-ChildItem (Join-Path $root $directory) -File -Recurse | ForEach-Object {
        $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    }
}

$zip = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $root $file), $file) | Out-Null
    }
}
finally { $zip.Dispose() }
Write-Output $destination
