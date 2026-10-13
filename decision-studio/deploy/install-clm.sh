#!/usr/bin/env bash
set -euo pipefail

install_root=/opt/decision-studio
python3 -m venv "${install_root}/venv"
"${install_root}/venv/bin/pip" install --upgrade pip
"${install_root}/venv/bin/pip" install contrastive-lm vllm

echo "CLM dependencies installed in ${install_root}/venv."
echo "Copy the two systemd units, replace %i with the service user, then enable them."
