<#
.SYNOPSIS
Loads content\physics_grade12.json into the Chroma collection. One-time step,
or re-run after content changes. Requires the Chroma server
(start_chroma.ps1) to be running.
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$venvPy = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { $venvPy = 'python' }

Write-Host 'Indexing content/physics_grade12.json into Chroma...' -ForegroundColor Cyan
& $venvPy -m backend.index_content