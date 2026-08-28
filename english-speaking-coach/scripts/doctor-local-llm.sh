#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT_DIR/.venv-llm/bin/python"
MODEL_PATH="${EASYSAY_LLM_MODEL_PATH:-$ROOT_DIR/.models/Qwen3.5-9B-MLX-8bit}"
BASE_URL="${EASYSAY_LLM_BASE_URL:-http://127.0.0.1:8800/v1}"

echo "EasySay local Qwen3.5 diagnostics"
[[ -x "$PYTHON" ]] || { echo "[missing] .venv-llm"; exit 1; }
echo "[ok] MLX runtime"

"$PYTHON" -c \
  "import importlib.metadata as m; print('[ok] mlx', m.version('mlx'))"
[[ -f "$MODEL_PATH/config.json" ]] ||
  { echo "[missing] $MODEL_PATH"; exit 1; }
echo "[ok] model files: $(du -sh "$MODEL_PATH" | awk '{print $1}')"

curl -fsS --max-time 5 "$BASE_URL/models" \
  -H "Authorization: Bearer local-easysay" >/dev/null ||
  { echo "[offline] $BASE_URL"; exit 1; }
echo "[ok] OpenAI-compatible API: $BASE_URL"
