# Generates raster icons from the same link geometry as icons/mark.svg.
# Run: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

foreach ($size in 16, 32, 48, 128) {
  $scale = [float]($size * 4 / 64)
  $large = New-Object System.Drawing.Bitmap ($size * 4), ($size * 4)
  $g = [System.Drawing.Graphics]::FromImage($large)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.ScaleTransform($scale, $scale)

  $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tile.AddArc(0, 0, 30, 30, 180, 90)
  $tile.AddArc(34, 0, 30, 30, 270, 90)
  $tile.AddArc(34, 34, 30, 30, 0, 90)
  $tile.AddArc(0, 34, 30, 30, 90, 90)
  $tile.CloseFigure()
  $rect = New-Object System.Drawing.Rectangle 0, 0, 64, 64
  $c1 = [System.Drawing.ColorTranslator]::FromHtml('#7b6cff')
  $c2 = [System.Drawing.ColorTranslator]::FromHtml('#b46bff')
  $fill = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45
  $g.FillPath($fill, $tile)

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 5.5
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $top = New-Object System.Drawing.Drawing2D.GraphicsPath
  $top.AddBezier(25, 35, 29, 39, 35, 39, 39, 35)
  $top.AddLine(39, 35, 48, 26)
  $top.AddBezier(48, 26, 54, 20, 54, 13, 48, 8)
  $top.AddBezier(48, 8, 43, 3, 36, 4, 31, 9)
  $top.AddLine(31, 9, 26, 14)
  $bottom = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bottom.AddBezier(39, 29, 35, 25, 29, 25, 25, 29)
  $bottom.AddLine(25, 29, 16, 38)
  $bottom.AddBezier(16, 38, 10, 44, 10, 51, 16, 56)
  $bottom.AddBezier(16, 56, 21, 61, 28, 60, 33, 55)
  $bottom.AddLine(33, 55, 38, 50)
  $g.DrawPath($pen, $top)
  $g.DrawPath($pen, $bottom)

  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $small = [System.Drawing.Graphics]::FromImage($bmp)
  $small.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $small.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $small.DrawImage($large, 0, 0, $size, $size)
  $out = Join-Path $root ("icons\icon$size.png")
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $small.Dispose(); $bmp.Dispose(); $g.Dispose(); $large.Dispose()
  $tile.Dispose(); $fill.Dispose(); $pen.Dispose(); $top.Dispose(); $bottom.Dispose()
  Write-Host "wrote $out"
}
Copy-Item (Join-Path $root 'icons\icon32.png') (Join-Path $root 'dashboard\icon32.png') -Force
Write-Host 'dashboard favicon ready'
