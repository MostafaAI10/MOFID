#!/usr/bin/env bash
set -Eeuo pipefail

# Mofid all-in-one launcher. Does not install packages or download files.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if [[ -d "$ROOT/.venv/bin" ]]; then export PATH="$ROOT/.venv/bin:$PATH"; fi
PYTHON="${MOFID_PYTHON:-$ROOT/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then PYTHON="${MOFID_PYTHON:-python3}"; fi
CHROMA_PORT="${MOFID_CHROMA_PORT:-8001}"
LLAMA_PORT="${MOFID_LLAMA_PORT:-8081}"
API_PORT="${MOFID_API_PORT:-8082}"
MODEL_PATH="${MOFID_MODEL_PATH:-$ROOT/models/Karnak.Q3_K_M.gguf}"
LLM_MODE="${MOFID_LLM_MODE:-auto}"
LOG_DIR="$ROOT/work/logs"
mkdir -p "$LOG_DIR"

fail() { echo "[ERROR] $*" >&2; exit 1; }
command -v node >/dev/null 2>&1 || fail "Node.js is required to build the dashboard."
command -v npm >/dev/null 2>&1 || fail "npm is required to build the dashboard."
command -v "$PYTHON" >/dev/null 2>&1 || fail "Python was not found. Create .venv or set MOFID_PYTHON."
[[ -d "$ROOT/dashboard/node_modules" ]] || fail "dashboard/node_modules is missing. Run npm install only when you have package access."
HAS_LLM=1
[[ -f "$MODEL_PATH" ]] || HAS_LLM=0
[[ -d "$ROOT/backend/llama.cpp" ]] || HAS_LLM=0
if [[ "$LLM_MODE" == "live" && "$HAS_LLM" == "0" ]]; then
  fail "Live mode requested, but the Karnak model or llama.cpp files are missing."
fi
if [[ "$LLM_MODE" == "auto" && "$HAS_LLM" == "0" ]]; then LLM_MODE="retrieval"; fi

wait_for_port() {
  local port="$1" name="$2" attempt
  for attempt in $(seq 1 60); do
    if "$PYTHON" - "$port" <<'PY' >/dev/null 2>&1
import socket, sys
sock = socket.socket()
sock.settimeout(0.5)
try:
    sock.connect(("127.0.0.1", int(sys.argv[1])))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
    then return 0; fi
    sleep 1
  done
  fail "$name did not open port $port within 60 seconds."
}

cleanup() {
  [[ -n "${CHROMA_PID:-}" ]] && kill "$CHROMA_PID" 2>/dev/null || true
  [[ -n "${LLAMA_PID:-}" ]] && kill "$LLAMA_PID" 2>/dev/null || true
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "=== Building teacher dashboard ==="
(cd dashboard && npm run build)

echo "=== Starting Chroma on port $CHROMA_PORT ==="
MOFID_CHROMA_PORT="$CHROMA_PORT" bash backend/scripts/start_chroma.sh >"$LOG_DIR/chroma.log" 2>&1 & CHROMA_PID=$!
wait_for_port "$CHROMA_PORT" "Chroma"

echo "=== Indexing curriculum ==="
"$PYTHON" -m backend.index_content

if [[ "$LLM_MODE" == "retrieval" ]]; then
  echo "=== Karnak unavailable: using retrieval-only mode ==="
else
  echo "=== Starting llama.cpp on port $LLAMA_PORT ==="
  MOFID_LLAMA_PORT="$LLAMA_PORT" MOFID_MODEL_PATH="$MODEL_PATH" bash backend/scripts/start_llama_server.sh >"$LOG_DIR/llama.log" 2>&1 & LLAMA_PID=$!
  wait_for_port "$LLAMA_PORT" "llama.cpp"
fi

echo "=== Starting FastAPI on port $API_PORT ==="
MOFID_LLM_MODE="$LLM_MODE" MOFID_API_PORT="$API_PORT" MOFID_CHROMA_PORT="$CHROMA_PORT" MOFID_LLAMA_PORT="$LLAMA_PORT" "$PYTHON" -m uvicorn backend.app:app --host 0.0.0.0 --port "$API_PORT" >"$LOG_DIR/api.log" 2>&1 & API_PID=$!
wait_for_port "$API_PORT" "FastAPI"

echo
echo "Mofid is running:"
echo "  Student app:       http://localhost:$API_PORT/"
echo "  Teacher dashboard: http://localhost:$API_PORT/dashboard"
echo
echo "Press Ctrl+C to stop all services."
wait "$API_PID"
