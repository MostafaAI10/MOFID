#!/usr/bin/env bash
# Launches a standalone Chroma server that owns the on-disk vector DB directory.
# Both index_content.py and app.py connect to this as an HttpClient rather than
# each opening their own PersistentClient - see backend/rag.py for why that
# matters (the cross-process "Error finding id" issue from development).
set -euo pipefail

CHROMA_PATH="${MOFID_CHROMA_PATH:-./mofid_vectordb}"
PORT="${MOFID_CHROMA_PORT:-8001}"

chroma run --path "$CHROMA_PATH" --port "$PORT"
