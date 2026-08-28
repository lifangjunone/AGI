#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8785}"
ACCESS_CODE_FILE="$ROOT_DIR/.local/native-access-code"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use."
  exit 1
fi

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
  echo "Could not detect the Wi-Fi IP address."
  exit 1
fi

mkdir -p "$ROOT_DIR/.local"
if [[ -z "${EASYSAY_ACCESS_CODE:-}" && -f "$ACCESS_CODE_FILE" ]]; then
  EASYSAY_ACCESS_CODE="$(tr -dc '0-9' <"$ACCESS_CODE_FILE" | head -c 6)"
fi
if [[ -z "${EASYSAY_ACCESS_CODE:-}" ]]; then
  EASYSAY_ACCESS_CODE="$(
    node -e 'console.log(String(require("crypto").randomInt(0, 1_000_000)).padStart(6, "0"))'
  )"
  printf "%s\n" "$EASYSAY_ACCESS_CODE" >"$ACCESS_CODE_FILE"
  chmod 600 "$ACCESS_CODE_FILE"
fi
export EASYSAY_ACCESS_CODE

cd "$ROOT_DIR"
npm run build

echo
echo "=================================================="
echo " 原生 App 电脑地址: http://$LAN_IP:$PORT"
echo " 原生 App 连接码: $EASYSAY_ACCESS_CODE"
echo "=================================================="
echo "手机和电脑必须连接同一个 Wi-Fi。"
echo

export NODE_ENV=production
export HOST=0.0.0.0
export PORT

exec caffeinate -dimsu \
  npx concurrently -k -s first \
    "npm:speech:start" \
    "npm:llm:start" \
    "npm:native:server"
