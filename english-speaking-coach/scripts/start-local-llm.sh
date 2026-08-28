#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT_DIR/.venv-llm/bin/python"
MODEL_PATH="${EASYSAY_LLM_MODEL_PATH:-$ROOT_DIR/.models/Qwen3.5-9B-MLX-8bit}"
HOST="${EASYSAY_LLM_HOST:-127.0.0.1}"
PORT="${EASYSAY_LLM_PORT:-8800}"

idle_forever() {
  trap 'exit 0' INT TERM
  while true; do sleep 3600; done
}

if [[ ! -x "$PYTHON" ]]; then
  echo "Local LLM runtime is not installed. Run: npm run llm:setup"
  idle_forever
fi

if [[ ! -f "$MODEL_PATH/config.json" ]]; then
  echo "Qwen3.5 is not downloaded. Run: npm run llm:download"
  idle_forever
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Local LLM is already listening on $HOST:$PORT"
  idle_forever
fi

cd "$ROOT_DIR"
exec "$PYTHON" -m mlx_vlm.server \
  --host "$HOST" \
  --port "$PORT" \
  --model "$MODEL_PATH" \
  --api-key local-easysay \
  --max-kv-size 98304 \
  --kv-bits 8 \
  --max-num-seqs 1 \
  --max-tokens 2048 \
  --log-level INFO
