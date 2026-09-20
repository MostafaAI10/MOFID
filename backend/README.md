# Mofid backend

Endpoint shapes here follow `/API_CONTRACT.md` at the repo root exactly.

## Setup (in order)

```bash
cd backend
pip install -r requirements.txt
bash scripts/build_llama.sh          # one-time: builds llama.cpp, downloads the model
```

## Running (three processes, in order)

```bash
bash scripts/start_chroma.sh &        # vector DB server (port 8001)
bash scripts/start_llama_server.sh &  # Karnak inference server (port 8081)
python -m backend.index_content       # (run from repo root) one-time, or re-run after content changes:
                                       # loads content/physics_grade12.json into Chroma
bash scripts/start_api.sh             # FastAPI backend (port 8082)
```

Each script reads `MOFID_*` environment variables for ports/paths (see
`config.py`) so this runs unchanged in Colab, on a laptop, or on the eventual
classroom box.

## Windows (PowerShell)

The `scripts/` directory also ships PowerShell equivalents. They use the same
`MOFID_*` variables and resolve paths against the repo root, so you can run
them from any working directory.

### One-time setup

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\setup.ps1
```

This creates `.venv`, installs `requirements.txt`, downloads the prebuilt
llama.cpp Windows binaries (CUDA build automatically if `nvidia-smi` is found,
CPU otherwise - no compiler needed), and downloads the Karnak GGUF into
`models/`. Re-run anytime with `-SkipVenv` / `-SkipLlama` / `-SkipModel` to
skip individual steps.

### Running (four steps, each in its own terminal)

```powershell
backend\scripts\start_chroma.ps1        # vector DB server (port 8001)
backend\scripts\start_llama_server.ps1  # Karnak inference server (port 8081)
backend\scripts\index_content.ps1       # one-time, or re-run after content changes
backend\scripts\start_api.ps1           # FastAPI backend (port 8082)
```

> GPU offload: the llama server script defaults to `-ngl 45` (the value used on
> the T4 prototype). On an 8 GB GPU such as the RTX 5050, set `$env:MOFID_NGL`
> to a smaller number (e.g. `28`) before starting to avoid an out-of-memory
> crash.
