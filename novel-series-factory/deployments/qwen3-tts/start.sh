#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
export TTS_DATA_DIR="${TTS_DATA_DIR:-$(pwd)/data}"
export TTS_CUSTOM_MODEL="${TTS_CUSTOM_MODEL:-/data00/home/lifangjun/models/qwen3-tts/Qwen3-TTS-12Hz-1.7B-CustomVoice}"
export TTS_CLONE_MODEL="${TTS_CLONE_MODEL:-/data00/home/lifangjun/models/qwen3-tts/Qwen3-TTS-12Hz-1.7B-Base}"
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}"
export PATH="/data00/home/lifangjun/.local/sox/usr/bin:${PATH}"
export LD_LIBRARY_PATH="/data00/home/lifangjun/.local/sox/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

exec .venv/bin/uvicorn app:app \
  --host "${TTS_HOST:-0.0.0.0}" \
  --port "${TTS_PORT:-7861}" \
  --workers 1
