<#
.SYNOPSIS
Launches the Mofid FastAPI backend on MOFID_API_PORT (default 8082). Requires
the Chroma server (start_chroma.ps1) and the llama.cpp server
(start_llama_server.ps1) to already be running. Run from the repo root - the
script sets its own location so relative MOFID_* path defaults resolve the
same way as backend/config.py.
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$venvPy = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { $venvPy = 'python' }

if ($env:MOFID_API_PORT) { $port = $env:MOFID_API_PORT } else { $port = '8082' }

Write-Host "Starting FastAPI backend on port $port..." -ForegroundColor Cyan
& $venvPy -m uvicorn backend.app:app --host 0.0.0.0 --port $port