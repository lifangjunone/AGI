#!/bin/bash
set -euo pipefail

SOURCE="${1:-/tmp/autonomous-income-engine-release}"
APP="/data/app/autonomous-income-engine"
PLATFORM_NGINX="/data/app/lifeyoume-platform/deploy/nginx-platform.conf"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$APP/releases/$STAMP"
BACKUP="/data/app/backups/autonomous-income-engine-$STAMP"
NGINX_BEFORE_SHA=""
NGINX_ROUTE_SNAPSHOT="$BACKUP/nginx-location-routes.before"

snapshot_nginx_routes() {
  # Keep a stable inventory of every exact and prefix location owned by all
  # products. Regex locations are also included verbatim. A deployment of this
  # project is not allowed to make any pre-existing route disappear.
  grep -E '^[[:space:]]*location([[:space:]=~^*]+)' "$1" |
    sed -E 's/[[:space:]]+/ /g; s/^ //; s/ \{$//' |
    sort -u
}

assert_shared_nginx_routes_preserved() {
  local before="$1"
  local after="$2"
  local missing="$BACKUP/nginx-location-routes.missing"
  comm -23 "$before" "$after" > "$missing"
  if [[ -s "$missing" ]]; then
    echo "Refusing deployment: shared Nginx routes would be removed:" >&2
    cat "$missing" >&2
    return 1
  fi
}

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
NGINX_BEFORE_SHA="$(sha256sum "$PLATFORM_NGINX" | awk '{print $1}')"
snapshot_nginx_routes "$PLATFORM_NGINX" > "$NGINX_ROUTE_SNAPSHOT"

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
rm -f "$APP/shared/private/wechat-contact.jpg"

if [[ ! -f "$APP/shared/runtime.env" ]]; then
  umask 077
  {
    printf 'PAYMENT_WEBHOOK_SECRET=%s\n' "pay_$(openssl rand -hex 32)"
    printf 'ADMIN_API_SECRET=%s\n' "admin_$(openssl rand -hex 32)"
    printf 'ADMIN_MOBILE_PASSWORD=%s\n' "mobile_$(openssl rand -hex 8)"
  } > "$APP/shared/runtime.env"
  chown income-engine:income-engine "$APP/shared/runtime.env"
fi

if ! grep -q '^ADMIN_MOBILE_PASSWORD=' "$APP/shared/runtime.env"; then
  printf 'ADMIN_MOBILE_PASSWORD=%s\n' "mobile_$(openssl rand -hex 8)" >> "$APP/shared/runtime.env"
fi
if ! grep -q '^WEB_PUSH_PUBLIC_KEY=' "$APP/shared/runtime.env"; then
  (
    cd "$RELEASE"
    node - <<'NODE' >> "$APP/shared/runtime.env"
const webPush = require("web-push");
const keys = webPush.generateVAPIDKeys();
console.log(`WEB_PUSH_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${keys.privateKey}`);
console.log("WEB_PUSH_SUBJECT=mailto:admin@lifeyoume.icu");
NODE
  )
fi
chown income-engine:income-engine "$APP/shared/runtime.env"
chmod 0600 "$APP/shared/runtime.env"

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
  current_nginx_sha="$(sha256sum "$PLATFORM_NGINX" | awk '{print $1}')"
  if [[ "$current_nginx_sha" != "$NGINX_BEFORE_SHA" ]]; then
    echo "Shared Nginx changed during deployment; refusing to overwrite concurrent changes." >&2
    exit 1
  fi
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
  # Keep the bind-mounted file inode stable so Nginx can load the update with
  # a graceful reload. Replacing the inode would require restarting the shared
  # proxy and would interrupt unrelated products.
  cp "$PLATFORM_NGINX.next" "$PLATFORM_NGINX"
  chown root:root "$PLATFORM_NGINX"
  chmod 0644 "$PLATFORM_NGINX"
  rm -f "$PLATFORM_NGINX.next"
fi

snapshot_nginx_routes "$PLATFORM_NGINX" > "$BACKUP/nginx-location-routes.after"
if ! assert_shared_nginx_routes_preserved "$NGINX_ROUTE_SNAPSHOT" "$BACKUP/nginx-location-routes.after"; then
  cp "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  exit 1
fi

if ! docker exec opportunity_factory_proxy nginx -t; then
  cp "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  exit 1
fi

if ! docker exec opportunity_factory_proxy nginx -s reload; then
  cp "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  docker exec opportunity_factory_proxy nginx -t
  docker exec opportunity_factory_proxy nginx -s reload || true
  exit 1
fi

PUBLIC_STATUS="$(curl --fail --silent --show-error https://lifeyoume.icu/image/api/status)"
PUBLIC_HOME="$(curl --fail --silent --show-error https://lifeyoume.icu/image/)"
PUBLIC_ROOT_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' https://lifeyoume.icu/)"
PUBLIC_FLOWFRAME_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' https://lifeyoume.icu/flowframe/)"
grep -q '"productId":"product-image-batch-studio"' <<<"$PUBLIC_STATUS"
grep -q '商品图批量成品机' <<<"$PUBLIC_HOME"
[[ "$PUBLIC_ROOT_STATUS" =~ ^(200|301|302)$ ]]
[[ "$PUBLIC_FLOWFRAME_STATUS" =~ ^(200|301|302)$ ]]

printf 'Deployed %s to https://lifeyoume.icu/image/\n' "$RELEASE"
