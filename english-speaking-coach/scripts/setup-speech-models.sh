#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv-speech"
MODEL_DIR="$ROOT_DIR/.models"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "EasySay's default speech runtime requires Apple Silicon macOS." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install it from https://docs.astral.sh/uv/." >&2
  exit 1
fi

echo "[1/3] Creating the isolated Python 3.12 environment..."
uv venv --python 3.12 "$VENV_DIR"

echo "[2/3] Installing the pinned MLX speech runtime..."
uv pip install \
  --python "$VENV_DIR/bin/python" \
  --prerelease=explicit \
  -r "$ROOT_DIR/speech/requirements.txt"

mkdir -p "$MODEL_DIR"

download_model() {
  local model_id="$1"
  local target_dir="$2"

  if [[ -f "$target_dir/config.json" ]] &&
    compgen -G "$target_dir/*.safetensors" >/dev/null; then
    echo "Model already present: $target_dir"
    return
  fi

  echo "Downloading $model_id..."
  "$VENV_DIR/bin/modelscope" download \
    --model "$model_id" \
    --local_dir "$target_dir"
}

echo "[3/3] Downloading ModelScope weights outside Git..."
download_model \
  "mlx-community/Qwen3-ASR-1.7B-8bit" \
  "$MODEL_DIR/Qwen3-ASR-1.7B-8bit"
download_model \
  "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit" \
  "$MODEL_DIR/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit"

echo
echo "Speech runtime is ready."
echo "Start it with: npm run speech:start"
