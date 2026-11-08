# Generates WebCollector toolbar/app icons as PNGs using .NET drawing.
# Re-run any time:  powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

foreach ($size in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # diagonal gradient background (brand indigo -> violet)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $c1 = [System.Drawing.Color]::FromArgb(255, 92, 84, 238)   # #5C54EE
  $c2 = [System.Drawing.Color]::FromArgb(255, 124, 58, 237)  # #7C3AED
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45
  $g.FillRectangle($brush, $rect)

  # white "W" centered
  $fontSize = [float]($size * 0.62)
  $font = New-Object System.Drawing.Font ('Segoe UI', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $sf = New-Object System.Drawing.SizeF $size, $size
  $g.DrawString('W', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, -1, $sf.Width, $sf.Height), $format)

  $out = Join-Path $root ("icons\icon$size.png")
  New-Item -ItemType Directory -Force -Path (Join-Path $root 'icons') | Out-Null
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $font.Dispose()
  Write-Host "wrote $out"
}

# 32x32 favicon for the dashboard tab (same art, larger W)
$bmp = New-Object System.Drawing.Bitmap 32, 32
# (already generated above as icon32.png; reuse it)
Copy-Item (Join-Path $root 'icons\icon32.png') (Join-Path $root 'dashboard\icon32.png') -Force
Write-Host 'dashboard favicon ready'
