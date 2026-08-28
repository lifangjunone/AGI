#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT_DIR/.venv-speech/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "Local speech is not installed. Run: npm run speech:setup"
  echo "EasySay will keep browser speech fallbacks available."
  trap 'exit 0' INT TERM
  while true; do sleep 3600; done
fi

cd "$ROOT_DIR"
exec "$PYTHON" -m speech.service
