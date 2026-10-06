$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$skillRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $skillRoot 'scripts\compose-store-assets.ps1'
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("arrow-button-mapper-store-assets-test-" + [Guid]::NewGuid())
$inputRoot = Join-Path $temporaryRoot 'input'
$outputRoot = Join-Path $temporaryRoot 'output'

try {
    New-Item -ItemType Directory -Path $inputRoot -Force | Out-Null

    $iconPath = Join-Path $inputRoot 'icon.png'
    $icon = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $iconGraphics = [System.Drawing.Graphics]::FromImage($icon)
    $iconGraphics.Clear([System.Drawing.Color]::FromArgb(8, 22, 43))
    $iconGraphics.FillEllipse([System.Drawing.Brushes]::DeepSkyBlue, 28, 28, 72, 72)
    $iconGraphics.Dispose()
    $icon.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon.Dispose()

    $screenshotPaths = @()
    1..3 | ForEach-Object {
        $path = Join-Path $inputRoot "raw-$_.png"
        $image = [System.Drawing.Bitmap]::new(1280, 800, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $graphics = [System.Drawing.Graphics]::FromImage($image)
        $panelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(15, 23, 42))
        $graphics.Clear([System.Drawing.Color]::FromArgb(248, 249, 250))
        $graphics.FillRectangle($panelBrush, 365, 16, 550, 754)
        $graphics.FillRectangle([System.Drawing.Brushes]::DodgerBlue, 420, 120, 280, 70)
        $panelBrush.Dispose()
        $graphics.Dispose()
        $image.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        $image.Dispose()
        $screenshotPaths += $path
    }

    & $scriptPath -IconSource $iconPath -ScreenshotSources $screenshotPaths -OutputRoot $outputRoot

    $expected = @{
        'store-icon-128.png' = @(128, 128)
        'screenshots\1.png' = @(1280, 800)
        'screenshots\2.png' = @(1280, 800)
        'screenshots\3.png' = @(1280, 800)
    }

    foreach ($relativePath in $expected.Keys) {
        $path = Join-Path $outputRoot $relativePath
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Missing output: $relativePath"
        }

        $image = [System.Drawing.Bitmap]::new($path)
        if ($image.Width -ne $expected[$relativePath][0] -or $image.Height -ne $expected[$relativePath][1]) {
            throw "Unexpected dimensions for ${relativePath}: $($image.Width)x$($image.Height)"
        }

        if ($relativePath -eq 'store-icon-128.png') {
            $corner = $image.GetPixel(0, 0)
            if ($corner.A -ne 255 -or $corner.R -ne 255 -or $corner.G -ne 255 -or $corner.B -ne 255) {
                throw 'Store icon corner must be opaque white.'
            }
        }
        else {
            if ($image.PixelFormat -ne [System.Drawing.Imaging.PixelFormat]::Format24bppRgb) {
                throw "Screenshot must be 24-bit RGB: $relativePath"
            }
            $panelPixel = $image.GetPixel(80, 400)
            if ($panelPixel.R -eq 248 -and $panelPixel.G -eq 249 -and $panelPixel.B -eq 250) {
                throw "Screenshot panel was not composed: $relativePath"
            }
        }

        $image.Dispose()
    }

    $oversizedIconPath = Join-Path $inputRoot 'oversized-icon.png'
    $oversizedIcon = [System.Drawing.Bitmap]::new(129, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $oversizedIcon.Save($oversizedIconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $oversizedIcon.Dispose()

    $rejected = $false
    try {
        & $scriptPath -IconSource $oversizedIconPath -ScreenshotSources $screenshotPaths -OutputRoot (Join-Path $temporaryRoot 'invalid-icon-output')
    }
    catch {
        $rejected = $true
    }

    if (-not $rejected) {
        throw 'The composition script must reject an icon source that is not 128x128.'
    }

    $jpegIconPath = Join-Path $inputRoot 'icon.jpg'
    $jpegIcon = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $jpegIcon.Save($jpegIconPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $jpegIcon.Dispose()

    $rejected = $false
    try {
        & $scriptPath -IconSource $jpegIconPath -ScreenshotSources $screenshotPaths -OutputRoot (Join-Path $temporaryRoot 'jpeg-icon-output')
    }
    catch {
        $rejected = $true
    }

    if (-not $rejected) {
        throw 'The composition script must reject a non-PNG icon source.'
    }

    Write-Output 'Chrome Web Store asset composition verification passed.'
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
