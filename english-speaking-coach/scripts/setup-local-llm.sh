#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT_DIR/.venv-llm"

cd "$ROOT_DIR"
if [[ ! -x "$VENV/bin/python" ]]; then
  uv venv --python 3.11 "$VENV"
fi

uv pip install --python "$VENV/bin/python" \
  "mlx-vlm==0.6.13" \
  "fastapi>=0.115,<1" \
  "uvicorn>=0.34,<1" \
  "huggingface-hub>=0.28,<2" \
  "modelscope>=1.25,<2"

echo "Local MLX runtime is ready."
