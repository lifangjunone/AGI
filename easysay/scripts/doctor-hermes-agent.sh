#!/usr/bin/env bash
set -euo pipefail

echo "EasySay Hermes evolution diagnostics"
echo

if ! command -v hermes >/dev/null 2>&1; then
  echo "[missing] Hermes CLI"
  echo "Run: npm run hermes:setup"
  exit 1
fi

echo "[ok] Hermes CLI: $(command -v hermes)"
hermes --version || true

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
if grep -Eq '^[[:space:]]*[A-Z0-9_]+(API_KEY|TOKEN)=[^[:space:]#]+' \
  "$HERMES_HOME/.env" 2>/dev/null ||
  [[ -s "$HERMES_HOME/auth.json" ]]; then
  echo "[ok] Inference provider configured"
  exit 0
fi

echo "[setup required] No Hermes inference credential found"
echo "Run: hermes setup"
exit 1
