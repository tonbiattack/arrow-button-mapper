[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$IconSource,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string[]]$ScreenshotSources,

    [string]$OutputRoot,

    [ValidateRange(0, 48)]
    [int]$IconInset = 12,

    [ValidateRange(0, 1279)]
    [int]$UiCropX = 365,

    [ValidateRange(0, 799)]
    [int]$UiCropY = 16,

    [ValidateRange(1, 1280)]
    [int]$UiCropWidth = 550,

    [ValidateRange(1, 800)]
    [int]$UiCropHeight = 754
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Save-PngAtomically {
    param(
        [Parameter(Mandatory)] [System.Drawing.Image]$Image,
        [Parameter(Mandatory)] [string]$Destination
    )

    $directory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = Join-Path $directory ('.' + [System.IO.Path]::GetRandomFileName() + '.png')
    try {
        $Image.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
        Move-Item -LiteralPath $temporary -Destination $Destination -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Open-Bitmap {
    param([Parameter(Mandatory)] [string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Image source was not found: $Path"
    }

    $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Path).Path)
    if ($bitmap.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid) {
        $bitmap.Dispose()
        throw "Image source must be a PNG: $Path"
    }

    return $bitmap
}

if ($ScreenshotSources.Count -ne 3) {
    throw 'Specify exactly three screenshot sources.'
}

if (($UiCropX + $UiCropWidth) -gt 1280 -or ($UiCropY + $UiCropHeight) -gt 800) {
    throw 'The UI crop must fit within a 1280x800 source screenshot.'
}

$repositoryRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $repositoryRoot 'docs\chrome-web-store\assets'
}

$iconOutput = Join-Path $OutputRoot 'store-icon-128.png'
$screenshotsOutput = Join-Path $OutputRoot 'screenshots'

# A transparent edge from the extension source icon otherwise blends as a gray box on white.
$iconSourceBitmap = Open-Bitmap $IconSource
try {
    if ($iconSourceBitmap.Width -ne 128 -or $iconSourceBitmap.Height -ne 128) {
        throw "Icon source must be 128x128: $IconSource"
    }

    $normalizedIcon = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $normalizedGraphics = [System.Drawing.Graphics]::FromImage($normalizedIcon)
        try {
            $normalizedGraphics.Clear([System.Drawing.Color]::White)
            $normalizedGraphics.DrawImageUnscaled($iconSourceBitmap, 0, 0)
            for ($y = 0; $y -lt [Math]::Min(128, $iconSourceBitmap.Height); $y++) {
                for ($x = 0; $x -lt [Math]::Min(128, $iconSourceBitmap.Width); $x++) {
                    if ($iconSourceBitmap.GetPixel($x, $y).A -lt 200) {
                        $normalizedIcon.SetPixel($x, $y, [System.Drawing.Color]::White)
                    }
                }
            }
        }
        finally {
            $normalizedGraphics.Dispose()
        }

        $iconCanvas = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $iconGraphics = [System.Drawing.Graphics]::FromImage($iconCanvas)
            try {
                $iconGraphics.Clear([System.Drawing.Color]::White)
                $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $iconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $iconGraphics.DrawImage($normalizedIcon, [System.Drawing.Rectangle]::new($IconInset, $IconInset, 128 - (2 * $IconInset), 128 - (2 * $IconInset)))
            }
            finally {
                $iconGraphics.Dispose()
            }
            Save-PngAtomically -Image $iconCanvas -Destination $iconOutput
        }
        finally {
            $iconCanvas.Dispose()
        }
    }
    finally {
        $normalizedIcon.Dispose()
    }
}
finally {
    $iconSourceBitmap.Dispose()
}

$captions = @(
    @('設定を記憶', "クリックしたリンクやボタンを$([Environment]::NewLine)左右キーの操作として保存"),
    @('新しい操作を追加', "URL と対象要素を指定して$([Environment]::NewLine)左右キーへ割り当て"),
    @('登録済みの操作を編集', "保存した操作を$([Environment]::NewLine)いつでも確認・変更")
)

for ($index = 0; $index -lt $ScreenshotSources.Count; $index++) {
    $source = Open-Bitmap $ScreenshotSources[$index]
    try {
        if ($source.Width -ne 1280 -or $source.Height -ne 800) {
            throw "Screenshot source must be 1280x800: $($ScreenshotSources[$index])"
        }

        $canvas = [System.Drawing.Bitmap]::new(1280, 800, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($canvas)
            try {
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))

                $panelBounds = [System.Drawing.Rectangle]::new(0, 0, 520, 800)
                $panelBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($panelBounds, [System.Drawing.Color]::FromArgb(239, 246, 255), [System.Drawing.Color]::FromArgb(219, 234, 254), 45)
                $shapeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42, 37, 99, 235))
                $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(37, 99, 235), 4)
                $darkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(15, 23, 42))
                $blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(30, 64, 175))
                $mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(71, 85, 105))
                $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(30, 15, 23, 42))
                $brandFont = [System.Drawing.Font]::new('Yu Gothic UI', 21, [System.Drawing.FontStyle]::Bold)
                $titleFont = [System.Drawing.Font]::new('Yu Gothic UI', 30, [System.Drawing.FontStyle]::Bold)
                $bodyFont = [System.Drawing.Font]::new('Yu Gothic UI', 15)
                $smallFont = [System.Drawing.Font]::new('Yu Gothic UI', 12)
                try {
                    $graphics.FillRectangle($panelBrush, $panelBounds)
                    $graphics.FillEllipse($shapeBrush, -142, 610, 350, 350)
                    $graphics.FillEllipse($shapeBrush, 334, -92, 250, 250)
                    $graphics.DrawLine($linePen, 68, 128, 164, 128)

                    $flatIcon = Open-Bitmap $iconOutput
                    try {
                        $graphics.DrawImage($flatIcon, [System.Drawing.Rectangle]::new(68, 58, 54, 54))
                    }
                    finally {
                        $flatIcon.Dispose()
                    }

                    $graphics.DrawString('Arrow Button Mapper', $brandFont, $darkBrush, 136, 72)
                    $graphics.DrawString('← / → でページ操作', $smallFont, $blueBrush, 68, 162)
                    $graphics.DrawString($captions[$index][0], $titleFont, $darkBrush, [System.Drawing.RectangleF]::new(68, 205, 420, 90))
                    $graphics.DrawString($captions[$index][1], $bodyFont, $mutedBrush, [System.Drawing.RectangleF]::new(70, 304, 390, 110))
                    $graphics.DrawString('Chrome 拡張機能', $smallFont, $blueBrush, 70, 700)

                    $graphics.FillRectangle($shadowBrush, [System.Drawing.Rectangle]::new(602, 28, 560, 760))
                    $graphics.FillRectangle([System.Drawing.Brushes]::White, [System.Drawing.Rectangle]::new(594, 18, 560, 760))
                    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(599, 21, 550, 754), [System.Drawing.Rectangle]::new($UiCropX, $UiCropY, $UiCropWidth, $UiCropHeight), [System.Drawing.GraphicsUnit]::Pixel)
                }
                finally {
                    $panelBrush.Dispose(); $shapeBrush.Dispose(); $linePen.Dispose(); $darkBrush.Dispose(); $blueBrush.Dispose(); $mutedBrush.Dispose(); $shadowBrush.Dispose()
                    $brandFont.Dispose(); $titleFont.Dispose(); $bodyFont.Dispose(); $smallFont.Dispose()
                }
            }
            finally {
                $graphics.Dispose()
            }
            Save-PngAtomically -Image $canvas -Destination (Join-Path $screenshotsOutput "$($index + 1).png")
        }
        finally {
            $canvas.Dispose()
        }
    }
    finally {
        $source.Dispose()
    }
}

Write-Output "Created $iconOutput and three screenshots under $screenshotsOutput."
