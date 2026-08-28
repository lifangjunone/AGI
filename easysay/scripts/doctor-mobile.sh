#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
BOOTSTRAP_PORT="${MOBILE_BOOTSTRAP_PORT:-8786}"
CA_CERT="$ROOT_DIR/.cert/easysay-local-ca.crt"
FAILED=0

echo "EasySay mobile learning diagnostics"
echo

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
  echo "fail Wi-Fi IP address was not detected"
  exit 1
fi
echo "ok   Wi-Fi address: $LAN_IP"

if [[ -f "$CA_CERT" ]]; then
  echo "ok   EasySay local CA"
else
  echo "fail EasySay local CA is missing"
  FAILED=1
fi

if curl --silent --max-time 3 \
  "http://$LAN_IP:$BOOTSTRAP_PORT/" |
  grep -q "连接手机英语教练"; then
  echo "ok   Phone certificate setup page"
else
  echo "fail Phone certificate setup page is not running"
  FAILED=1
fi

if curl --silent --cacert "$CA_CERT" --max-time 3 \
  "https://$LAN_IP:$PORT/mobile-login" |
  grep -q "连接你的英语教练"; then
  echo "ok   Trusted HTTPS access-code login"
else
  echo "fail EasySay production service is not running"
  FAILED=1
fi

if curl --fail --silent --max-time 3 \
  "http://127.0.0.1:8790/health" >/dev/null 2>&1; then
  echo "ok   Local ASR/TTS service"
else
  echo "fail Local ASR/TTS service is not running"
  FAILED=1
fi

echo
echo "Phone setup: http://$LAN_IP:$BOOTSTRAP_PORT"
echo "EasySay URL: https://$LAN_IP:$PORT"

exit "$FAILED"
