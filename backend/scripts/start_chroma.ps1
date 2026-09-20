<#
.SYNOPSIS
Launches the standalone Chroma vector DB server on MOFID_CHROMA_PORT (default
8001). Runs in the foreground; keep this terminal window open.

Run download/setup first: backend\scripts\setup.ps1
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$venvPy  = Join-Path $repoRoot '.venv\Scripts\python.exe'
$chroma  = Join-Path $repoRoot '.venv\Scripts\chroma.exe'
if (-not (Test-Path $chroma)) { $chroma = 'chroma' }

if ($env:MOFID_CHROMA_PATH) {
    $path = $env:MOFID_CHROMA_PATH
} else {
    $path = Join-Path $repoRoot 'mofid_vectordb'
}
if ($env:MOFID_CHROMA_PORT) { $port = $env:MOFID_CHROMA_PORT } else { $port = '8001' }

Write-Host "Starting Chroma on port $port (data: $path)..." -ForegroundColor Cyan
& $chroma run --path $path --host 127.0.0.1 --port $port