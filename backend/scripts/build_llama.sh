#!/usr/bin/env bash
# Builds llama.cpp with CUDA support and downloads the Karnak GGUF model.
# Run once per machine/container. Requires a CUDA-capable GPU (matches the
# notebook prototype's T4; adjust CMAKE_CUDA_ARCHITECTURES for other GPUs).
#
# NOTE: Karnak-6B-v1.0 is 6B parameters (built on Qwen3-4B-Instruct-2507),
# not 40B. Project docs describing "Karnak-40B" should be corrected to match
# the actual model being served - see mradermacher/Karnak-6B-v1.0-GGUF.
set -euo pipefail

apt-get update -qq
apt-get install -y -qq cmake build-essential

if [ ! -d llama.cpp ]; then
    git clone https://github.com/ggerganov/llama.cpp.git
fi

cd llama.cpp
rm -rf build
cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_ARCHITECTURES=75
cmake --build build -j"$(nproc)" --target llama-server llama-cli llama-bench
cd ..

pip install --quiet huggingface_hub
python3 - <<'PY'
from huggingface_hub import hf_hub_download

model_path = hf_hub_download(
    repo_id="mradermacher/Karnak-6B-v1.0-GGUF",
    filename="Karnak-6B-v1.0.Q3_K_M.gguf",
    local_dir="./models"
)
print("Model downloaded to:", model_path)
PY
