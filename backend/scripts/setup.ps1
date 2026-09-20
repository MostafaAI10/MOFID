<#
.SYNOPSIS
One-time Windows setup for the Mofid backend.

Creates a Python venv (.venv), installs backend requirements, downloads the
prebuilt llama.cpp Windows binaries, and downloads the Karnak GGUF weights.

Everything honors the same MOFID_* environment variables as backend/config.py.

.PARAMETER SkipVenv
Skip venv creation and pip install.
.PARAMETER SkipLlama
Skip downloading the llama.cpp binaries.
.PARAMETER SkipModel
Skip downloading the Karnak GGUF model file.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File backend\scripts\setup.ps1

.EXAMPLE
# Only fix the Python environment on a machine that already has llama + model:
powershell -ExecutionPolicy Bypass -File backend\scripts\setup.ps1 -SkipLlama -SkipModel
#>
param(
    [switch]$SkipVenv,
    [switch]$SkipLlama,
    [switch]$SkipModel
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backend  = Join-Path $repoRoot 'backend'
$venv     = Join-Path $repoRoot '.venv'
$venvPy   = Join-Path $venv 'Scripts\python.exe'

function Step([string]$Msg) { Write-Host "`n=== $Msg ===" -ForegroundColor Cyan }

if (-not $SkipVenv) {
    Step 'Creating Python virtual environment (.venv)'
    if (-not (Test-Path $venvPy)) {
        python -m venv $venv
        if ($LASTEXITCODE -ne 0) { throw 'Failed to create the virtual environment.' }
    }

    Step 'Installing backend requirements'
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r (Join-Path $backend 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }
}

if (-not $SkipLlama) {
    Step 'Downloading llama.cpp prebuilt binaries'
    & (Join-Path $PSScriptRoot 'download-llama.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'llama.cpp download failed.' }
}

if (-not $SkipModel) {
    Step 'Downloading Karnak GGUF model (multi-GB, one-time)'
    Push-Location $repoRoot
    try {
        & $venvPy -c "from huggingface_hub import hf_hub_download; print('Saved to:', hf_hub_download(repo_id='mradermacher/Karnak-6B-v1.0-GGUF', filename='Karnak-6B-v1.0.Q3_K_M.gguf', local_dir='./models'))"
        if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
    } finally {
        Pop-Location
    }
}

Write-Host "`nSetup complete. Next steps (each in its own terminal, from $repoRoot):" -ForegroundColor Green
Write-Host "  1. backend\scripts\start_chroma.ps1       # vector DB server (port 8001)"
Write-Host "  2. backend\scripts\start_llama_server.ps1 # Karnak inference (port 8081)"
Write-Host "  3. backend\scripts\index_content.ps1      # one-time, load content into Chroma"
Write-Host "  4. backend\scripts\start_api.ps1          # FastAPI backend (port 8082)"