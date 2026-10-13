#!/bin/bash
set -euo pipefail

SOURCE="${1:-/tmp/autonomous-income-engine-release}"
APP="/data/app/autonomous-income-engine"
PLATFORM_NGINX="/data/app/lifeyoume-platform/deploy/nginx-platform.conf"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$APP/releases/$STAMP"
BACKUP="/data/app/backups/autonomous-income-engine-$STAMP"

for required in package.json package-lock.json src/server.js assets/wechat-pay.jpg ops/autonomous-income-engine.service ops/nginx-image-location.conf; do
  if [[ ! -f "$SOURCE/$required" ]]; then
    echo "Release bundle is incomplete: $required" >&2
    exit 1
  fi
done

if ! id income-engine >/dev/null 2>&1; then
  useradd --system --home "$APP" --shell /usr/sbin/nologin income-engine
fi

install -d -m 0700 "$BACKUP"
if [[ -L "$APP/current" ]]; then
  readlink "$APP/current" > "$BACKUP/previous-release.txt"
fi
cp -a "$PLATFORM_NGINX" "$BACKUP/nginx-platform.conf"

install -d -o income-engine -g income-engine -m 0750 \
  "$APP/releases" \
  "$APP/shared" \
  "$APP/shared/data" \
  "$APP/shared/runtime" \
  "$APP/shared/dist" \
  "$APP/shared/public-site" \
  "$APP/shared/private"
cp -a "$SOURCE" "$RELEASE"
chown -R income-engine:income-engine "$RELEASE"

(
  cd "$RELEASE"
  npm ci --omit=dev --ignore-scripts
)

install -o income-engine -g income-engine -m 0600 \
  "$SOURCE/assets/wechat-pay.jpg" \
  "$APP/shared/private/wechat-pay.jpg"

if [[ ! -f "$APP/shared/runtime.env" ]]; then
  umask 077
  {
    printf 'PAYMENT_WEBHOOK_SECRET=%s\n' "pay_$(openssl rand -hex 32)"
    printf 'ADMIN_API_SECRET=%s\n' "admin_$(openssl rand -hex 32)"
  } > "$APP/shared/runtime.env"
  chown income-engine:income-engine "$APP/shared/runtime.env"
fi

ln -sfn "$RELEASE" "$APP/current.next"
mv -Tf "$APP/current.next" "$APP/current"

install -o root -g root -m 0644 \
  "$SOURCE/ops/autonomous-income-engine.service" \
  /etc/systemd/system/autonomous-income-engine.service
systemctl daemon-reload
systemctl enable autonomous-income-engine.service
systemctl restart autonomous-income-engine.service

healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:4188/api/status |
    grep -q '"productId":"product-image-batch-studio"'; then
    healthy=true
    break
  fi
  sleep 0.5
done
if [[ "$healthy" != true ]]; then
  systemctl status autonomous-income-engine.service --no-pager >&2 || true
  exit 1
fi

if ! grep -q 'location /image/' "$PLATFORM_NGINX"; then
  awk '
    FNR == NR { snippet = snippet $0 ORS; next }
    !inserted && index($0, "location ~ ^/(r|c|p|history") {
      printf "%s\n", snippet
      inserted = 1
    }
    { print }
    END {
      if (!inserted) exit 42
    }
  ' "$SOURCE/ops/nginx-image-location.conf" "$PLATFORM_NGINX" > "$PLATFORM_NGINX.next"
  install -o root -g root -m 0644 "$PLATFORM_NGINX.next" "$PLATFORM_NGINX"
  rm -f "$PLATFORM_NGINX.next"
fi

if ! docker exec opportunity_factory_proxy nginx -t; then
  install -o root -g root -m 0644 "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  exit 1
fi

# The config is a read-only bind mount. Replacing the host file creates a new
# inode, so an Nginx reload would keep reading the old mounted file.
docker restart opportunity_factory_proxy >/dev/null
proxy_healthy=false
for _ in $(seq 1 30); do
  if docker exec opportunity_factory_proxy nginx -t >/dev/null 2>&1; then
    proxy_healthy=true
    break
  fi
  sleep 1
done
if [[ "$proxy_healthy" != true ]]; then
  install -o root -g root -m 0644 "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  docker restart opportunity_factory_proxy >/dev/null || true
  exit 1
fi

PUBLIC_STATUS="$(curl --fail --silent --show-error https://lifeyoume.icu/image/api/status)"
PUBLIC_HOME="$(curl --fail --silent --show-error https://lifeyoume.icu/image/)"
grep -q '"productId":"product-image-batch-studio"' <<<"$PUBLIC_STATUS"
grep -q '商品图批量成品机' <<<"$PUBLIC_HOME"

printf 'Deployed %s to https://lifeyoume.icu/image/\n' "$RELEASE"
