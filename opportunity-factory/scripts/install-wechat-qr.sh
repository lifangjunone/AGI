#!/bin/bash
set -euo pipefail

IMAGE_PATH="${1:-}"
HOST="${DEPLOY_HOST:-aliyun}"
REMOTE_ROOT="/data/app/opportunity-factory"
REMOTE_IMAGE="$REMOTE_ROOT/private/wechat-pay.png"
UPLOAD_IMAGE="$(mktemp /tmp/opportunity-factory-wechat-pay.XXXXXX.png)"
trap 'rm -f "$UPLOAD_IMAGE"' EXIT

if [[ -z "$IMAGE_PATH" || ! -f "$IMAGE_PATH" ]]; then
  echo "Usage: $0 /absolute/path/to/wechat-pay.png" >&2
  exit 2
fi

case "${IMAGE_PATH##*.}" in
  png|PNG|jpg|JPG|jpeg|JPEG|webp|WEBP) ;;
  *)
    echo "The WeChat QR image must be PNG, JPEG, or WebP." >&2
    exit 2
    ;;
esac

if [[ "$(stat -f %z "$IMAGE_PATH")" -gt 2000000 ]]; then
  echo "The WeChat QR image must be smaller than 2 MB." >&2
  exit 2
fi

sips -g pixelWidth -g pixelHeight "$IMAGE_PATH" >/dev/null
sips -s format png "$IMAGE_PATH" --out "$UPLOAD_IMAGE" >/dev/null
chmod 0600 "$UPLOAD_IMAGE"
scp "$UPLOAD_IMAGE" "$HOST:/tmp/opportunity-factory-wechat-pay"
ssh "$HOST" '
  set -euo pipefail
  APP_ROOT=/data/app/opportunity-factory
  install -o opportunity -g opportunity -m 0600 \
    /tmp/opportunity-factory-wechat-pay \
    "$APP_ROOT/private/wechat-pay.png"
  rm -f /tmp/opportunity-factory-wechat-pay
  grep -v "^WECHAT_PAY_QR_PATH=" "$APP_ROOT/.env" \
    | grep -v "^WECHAT_OFFER_PRICE_CENTS=" > "$APP_ROOT/.env.next"
  printf "%s\n" \
    "WECHAT_PAY_QR_PATH=$APP_ROOT/private/wechat-pay.png" \
    "WECHAT_OFFER_PRICE_CENTS=990" >> "$APP_ROOT/.env.next"
  chown root:opportunity "$APP_ROOT/.env.next"
  chmod 0640 "$APP_ROOT/.env.next"
  mv "$APP_ROOT/.env.next" "$APP_ROOT/.env"
  systemctl restart opportunity-factory
  for attempt in {1..15}; do
    if curl --fail --silent http://127.0.0.1:8787/healthz; then
      exit 0
    fi
    sleep 1
  done
  systemctl status opportunity-factory --no-pager
  exit 1
'

echo
echo "WeChat checkout is enabled at https://audit.lifeyoume.icu"
