#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
BOOTSTRAP_PORT="${MOBILE_BOOTSTRAP_PORT:-8786}"

for target_port in "$PORT" "$BOOTSTRAP_PORT" 8790; do
  if lsof -nP -iTCP:"$target_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $target_port is already in use."
    echo "Stop the current EasySay server before starting mobile mode."
    exit 1
  fi
done

LAN_IP="${EASYSAY_LAN_IP:-}"
if [[ -z "$LAN_IP" ]]; then
  DEFAULT_INTERFACE="$(
    route -n get default 2>/dev/null |
      awk '/interface:/{print $2; exit}'
  )"
  if [[ -n "$DEFAULT_INTERFACE" ]]; then
    LAN_IP="$(ipconfig getifaddr "$DEFAULT_INTERFACE" 2>/dev/null || true)"
  fi
fi
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect the Wi-Fi IP address."
  echo "Set it explicitly: EASYSAY_LAN_IP=192.168.x.x npm run mobile:start"
  exit 1
fi
export EASYSAY_LAN_IP="$LAN_IP"

if [[ -z "${EASYSAY_ACCESS_CODE:-}" ]]; then
  EASYSAY_ACCESS_CODE="$(
    node -e 'console.log(String(require("crypto").randomInt(0, 1_000_000)).padStart(6, "0"))'
  )"
fi
export EASYSAY_ACCESS_CODE

cd "$ROOT_DIR"
mkdir -p .local

echo "[1/3] Creating local HTTPS certificates..."
bash scripts/generate-mobile-certificates.sh

echo "[2/3] Building the installable PWA..."
npm run build

echo
echo "=================================================="
echo " 手机设置页: http://$LAN_IP:$BOOTSTRAP_PORT"
echo " EasySay 地址: https://$LAN_IP:$PORT"
echo " EasySay 手机访问码: $EASYSAY_ACCESS_CODE"
echo "=================================================="
echo "手机和电脑必须连接同一个 Wi-Fi。"
echo "先打开设置页安装证书，再打开 EasySay 并输入访问码。"
echo

echo "[3/3] Starting EasySay and the local speech models..."

export NODE_ENV=production
export HOST=0.0.0.0
export TLS_CERT_PATH="$ROOT_DIR/.cert/easysay-mobile-cert.pem"
export TLS_KEY_PATH="$ROOT_DIR/.cert/easysay-mobile-key.pem"
export EASYSAY_CA_CERT_PATH="$ROOT_DIR/.cert/easysay-local-ca.crt"

exec caffeinate -dimsu \
  npx concurrently -k -s first \
    "npm:speech:start" \
    "npm:mobile:server" \
    "npm:mobile:bootstrap"
