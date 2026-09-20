<#
.SYNOPSIS
Launches the llama.cpp OpenAI-compatible server (Karnak) on MOFID_LLAMA_PORT
(default 8081). The backend's config.KARNAK_URL points here. Runs in the
foreground; keep this window open while the model is loading.

Run backend\scripts\download-llama.ps1 (or setup.ps1) first.

GPU offload tip: the default -ngl 45 assumes a big-VRAM GPU like a T4. With the
8 GB RTX 5050 you usually need fewer layers to avoid an out-of-memory crash,
e.g. start with:
    $env:MOFID_NGL = "28"
before running this script (or download a smaller quantization).
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$exe = Get-ChildItem -Path (Join-Path $repoRoot 'backend\llama.cpp') -Filter 'llama-server.exe' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } | Select-Object -First 1
if (-not $exe) {
    throw 'llama-server.exe not found under backend\llama.cpp. Run backend\scripts\setup.ps1 first.'
}

if ($env:MOFID_MODEL_PATH) {
    $model = $env:MOFID_MODEL_PATH
} else {
    $model = Join-Path $repoRoot 'models\Karnak-6B-v1.0.Q3_K_M.gguf'
}
if (-not (Test-Path $model)) {
    throw "Model not found at $model. Run backend\scripts\setup.ps1 first."
}
if ($env:MOFID_LLAMA_PORT) { $port = $env:MOFID_LLAMA_PORT } else { $port = '8081' }
if ($env:MOFID_NGL)        { $ngl  = $env:MOFID_NGL }        else { $ngl  = '45' }
if ($env:MOFID_THREADS)    { $threads = $env:MOFID_THREADS } else { $threads = '4' }

Write-Host "Starting llama-server on port $port (model: $model, -ngl $ngl, -t $threads)..."
Write-Host 'Wait for "server is listening" before asking questions.' -ForegroundColor Yellow
& $exe.FullName -m $model -ngl $ngl -c 4096 -t $threads --host 0.0.0.0 --port $port