#!/usr/bin/env bash
# Launches the Mofid FastAPI backend on MOFID_API_PORT (default 8082).
# Requires the Chroma server (start_chroma.sh) and the llama.cpp server
# (start_llama_server.sh) to already be running.
set -euo pipefail

PORT="${MOFID_API_PORT:-8082}"

uvicorn backend.app:app --host 0.0.0.0 --port "$PORT"
