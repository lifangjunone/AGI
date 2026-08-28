#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT_DIR/.venv-speech/bin/python"
ASR_DIR="$ROOT_DIR/.models/Qwen3-ASR-1.7B-8bit"
TTS_DIR="$ROOT_DIR/.models/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit"
FAILED=0

check() {
  local label="$1"
  local path="$2"
  if [[ -e "$path" ]]; then
    printf "ok   %s\\n" "$label"
  else
    printf "fail %s (%s)\\n" "$label" "$path"
    FAILED=1
  fi
}

echo "EasySay local speech diagnostics"
echo
check "Python environment" "$PYTHON"
check_model() {
  local label="$1"
  local model_dir="$2"
  if [[ -f "$model_dir/config.json" ]] &&
    compgen -G "$model_dir/*.safetensors" >/dev/null; then
    printf "ok   %s\\n" "$label"
  else
    printf "fail %s (%s)\\n" "$label" "$model_dir"
    FAILED=1
  fi
}

check_model "ASR model" "$ASR_DIR"
check_model "TTS model" "$TTS_DIR"

if [[ -x "$PYTHON" ]]; then
  if "$PYTHON" -c "import av, fastapi, mlx, mlx_audio, modelscope, soundfile" 2>/dev/null; then
    echo "ok   Python imports"
  else
    echo "fail Python imports"
    FAILED=1
  fi
fi

if curl --fail --silent --max-time 3 \
  "http://127.0.0.1:8790/health" >/tmp/easysay-speech-health.json 2>/dev/null; then
  echo "ok   Speech service http://127.0.0.1:8790"
  cat /tmp/easysay-speech-health.json
  echo
else
  echo "info Speech service is not running"
fi

exit "$FAILED"
