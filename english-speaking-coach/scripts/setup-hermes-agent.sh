#!/usr/bin/env bash
set -euo pipefail

INSTALL_URL="${HERMES_INSTALL_URL:-https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh}"

if command -v hermes >/dev/null 2>&1; then
  echo "Hermes Agent is already installed: $(command -v hermes)"
  hermes --version || true
  echo "Run 'hermes setup' to change its model provider."
  exit 0
fi

echo "Installing NousResearch Hermes Agent with the official installer..."
curl -fsSL "$INSTALL_URL" |
  bash -s -- --skip-browser --skip-computer-use --skip-setup

echo
echo "Hermes Agent installed."
echo "Next: run 'hermes setup' to configure its inference provider."
