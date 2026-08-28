#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT_DIR/.venv-llm/bin/python"
MODEL_ID="${EASYSAY_LLM_MODEL_ID:-mlx-community/Qwen3.5-9B-MLX-8bit}"
MODEL_PATH="${EASYSAY_LLM_MODEL_PATH:-$ROOT_DIR/.models/Qwen3.5-9B-MLX-8bit}"

if [[ ! -x "$PYTHON" ]]; then
  "$ROOT_DIR/scripts/setup-local-llm.sh"
fi

mkdir -p "$MODEL_PATH"
echo "Downloading $MODEL_ID from ModelScope to $MODEL_PATH"
MODEL_ID="$MODEL_ID" MODEL_PATH="$MODEL_PATH" "$PYTHON" -c '
import os
from modelscope import snapshot_download

snapshot_download(
    model_id=os.environ["MODEL_ID"],
    local_dir=os.environ["MODEL_PATH"],
)
'

echo "Qwen3.5 local model download complete."
