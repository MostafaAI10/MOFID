#!/usr/bin/env bash
# Launches llama.cpp's OpenAI-compatible server on MOFID_LLAMA_PORT (default 8081).
# The backend's config.KARNAK_URL points here. Run build_llama.sh first.
set -euo pipefail

MODEL_PATH="${MOFID_MODEL_PATH:-./models/Karnak.Q3_K_M.gguf}"
PORT="${MOFID_LLAMA_PORT:-8081}"

./llama.cpp/build/bin/llama-server \
    -m "$MODEL_PATH" \
    -ngl 45 -c 4096 -t 2 \
    --host 0.0.0.0 --port "$PORT"
