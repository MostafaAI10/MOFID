<#
.SYNOPSIS
Downloads prebuilt llama.cpp binaries for Windows into backend\llama.cpp\.
Uses the newest build release (tags like b####) that carries Windows binaries.
Prefers a CUDA build when an NVIDIA GPU is detected, otherwise a CPU build.

CUDA pick order matters for Blackwell (RTX 50-series): sm_120 needs a build
with CUDA 12.8+ or 13.x. We prefer a cuda-12.x build over cuda-13 because a
12.x llama.cpp build runs on any newer driver (via PTX JIT) whereas a 13.x
build requires a driver that ships with that minor 13.x version; the cu12.4
build is the reliable fallback for current Blackwell hardware.

.PARAMETER Tag
Pin to a specific build tag instead of the newest one (e.g. "b10955").

.EXAMPLE
powershell -ExecutionPolicy Bypass -File backend\scripts\download-llama.ps1
#>
param(
    [string]$Tag = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$destDir  = Join-Path $repoRoot 'backend\llama.cpp'

$existing = Get-ChildItem -Path $destDir -Filter 'llama-server.exe' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } | Select-Object -First 1
if ($existing) {
    Write-Host "llama-server.exe already present: $($existing.FullName)"
    exit 0
}

$gpu = [bool](Get-Command nvidia-smi -ErrorAction SilentlyContinue)
if ($gpu) {
    Write-Host 'NVIDIA GPU detected (nvidia-smi found) - preferring a CUDA build.'
} else {
    Write-Host 'No NVIDIA GPU detected - using the CPU-only build.'
}

$headers = @{
    'User-Agent' = 'mofid-setup'
    'Accept'     = 'application/vnd.github+json'
}

$release = $null
if ($Tag) {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggerganov/llama.cpp/releases/tags/$Tag" -Headers $headers
} else {
    $releases = Invoke-RestMethod -Uri 'https://api.github.com/repos/ggerganov/llama.cpp/releases?per_page=5' -Headers $headers
    $release = $releases | Where-Object { $_.assets.name -match 'bin-win' } | Select-Object -First 1
}
if (-not $release) {
    throw 'Could not find a llama.cpp release carrying Windows binaries.'
}

$assets = $release.assets.name
$candidates = @()
if ($gpu) {
    $candidates += $assets | Where-Object { $_ -match '^llama-.*bin-win-cuda-12\.(4|5|6|7|8|9).*x64\.zip$' }
}
if (-not $candidates -and $gpu) {
    $candidates += $assets | Where-Object { $_ -match '^llama-.*bin-win-cuda-13\..*x64\.zip$' }
}
if (-not $candidates) {
    $candidates += $assets | Where-Object { $_ -match '^llama-.*bin-win-cpu-x64\.zip$' }
}
if (-not $candidates) {
    throw "No suitable llama.cpp Windows asset found in release $($release.tag_name)."
}

$name = $candidates | Select-Object -First 1
$asset = $release.assets | Where-Object { $_.name -eq $name }

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$zip = Join-Path $destDir $asset.name
$url = $asset.browser_download_url

Write-Host "Downloading $($asset.name)  ($([math]::Round($asset.size / 1MB, 1)) MB) from $($release.tag_name)"
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curl) {
    & $curl.Source -L -C - --retry 6 --retry-delay 3 --retry-all-errors -o $zip $url
    if ($LASTEXITCODE -ne 0) { throw "curl download failed with exit code $LASTEXITCODE" }
} else {
    Invoke-WebRequest -Uri $url -OutFile $zip
}

Write-Host 'Extracting...'
Expand-Archive -Path $zip -DestinationPath $destDir -Force
Remove-Item $zip

$exe = Get-ChildItem -Path $destDir -Filter 'llama-server.exe' -Recurse |
    Sort-Object { $_.FullName.Length } | Select-Object -First 1
if (-not $exe) {
    throw "Extracted archive but llama-server.exe was not found under $destDir"
}
Write-Host "Done. llama-server at: $($exe.FullName)"