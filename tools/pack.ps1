# Packs WebCollector for the Chrome Web Store.
# Produces WebCollector-<version>.zip with production files only
# (dev harnesses, tools and generated blobs are excluded).
param([string]$OutDir = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ver = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version

$stage = Join-Path $env:TEMP ("wc-stage-" + $ver)
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

# Ship exactly: manifest, worker, icons, 3 libs, popup, dashboard, content overlay, supabase docs.
foreach ($d in @('lib', 'popup', 'dashboard', 'content', 'supabase', 'icons')) {
  Copy-Item (Join-Path $root $d) (Join-Path $stage $d) -Recurse
}
Copy-Item (Join-Path $root 'manifest.json') $stage
Copy-Item (Join-Path $root 'background.js') $stage

# Dev-only files never go to the store.
foreach ($f in @('dev.html', 'dev-worker.html')) {
  $p = Join-Path $stage ('dashboard\' + $f)
  if (Test-Path $p) { Remove-Item $p -Force }
}

$zip = Join-Path $OutDir ("LinkClipper-" + $ver + ".zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force

Write-Output ("PACKED: " + $zip)
Write-Output ("SIZE  : " + [math]::Round((Get-Item $zip).Length / 1KB, 1) + " KB")
Write-Output "--- contents ---"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$z.Entries | ForEach-Object { Write-Output $_.FullName }
$z.Dispose()
