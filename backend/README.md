# Mofid backend

Real, runnable version of what `MOFID_Model_v02.ipynb` prototypes in Colab.
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
