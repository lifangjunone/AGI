#!/bin/bash
set -euo pipefail

SOURCE="${1:-/tmp/model-radar-release}"
APP="/data/app/model-radar"
PLATFORM="/data/app/lifeyoume-platform"
PLATFORM_NGINX="$PLATFORM/deploy/nginx-platform.conf"
PLATFORM_PRODUCTS="$PLATFORM/config/products.json"
CONTAINER="opportunity_factory_proxy"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$APP/releases/$STAMP"
BACKUP="/data/app/backups/model-radar-$STAMP"
LOCK="/run/lock/model-radar-deploy.lock"

exec 9>"$LOCK"
flock -x 9

for required in package.json server.js lib/model-service.js public/index.html \
  deploy/model-radar.service deploy/nginx-model-radar-location.conf deploy/product.json; do
  [[ -f "$SOURCE/$required" ]] || { echo "Release bundle is incomplete: $required" >&2; exit 1; }
done
[[ -x /opt/node20/bin/node ]] || { echo "/opt/node20/bin/node is required" >&2; exit 1; }
[[ -f "$PLATFORM_NGINX" && -f "$PLATFORM_PRODUCTS" ]] ||
  { echo "LifeYouMe platform files are missing" >&2; exit 1; }

id model-radar >/dev/null 2>&1 ||
  useradd --system --home "$APP" --shell /usr/sbin/nologin model-radar

install -d -m 0700 "$BACKUP"
cp -a "$PLATFORM_NGINX" "$BACKUP/nginx-platform.conf"
cp -a "$PLATFORM_PRODUCTS" "$BACKUP/products.json"
[[ -L "$APP/current" ]] && readlink "$APP/current" > "$BACKUP/previous-release.txt"

before_sha="$(sha256sum "$PLATFORM_NGINX" | awk '{print $1}')"
before_inode="$(stat -c %i "$PLATFORM_NGINX")"
before_locations="$(mktemp)"
after_locations="$(mktemp)"
trap 'rm -f "$before_locations" "$after_locations"' EXIT
grep -E '^[[:space:]]*location([[:space:]=~^]+)[^[:space:]{]+' "$PLATFORM_NGINX" |
  sed 's/[[:space:]]\+/ /g' | sort -u > "$before_locations"

install -d -o model-radar -g model-radar -m 0750 "$APP/releases"
install -d -o model-radar -g model-radar -m 0750 "$APP/data"
cp -a "$SOURCE" "$RELEASE"
chown -R model-radar:model-radar "$RELEASE"
ln -sfn "$RELEASE" "$APP/current.next"
mv -Tf "$APP/current.next" "$APP/current"

install -o root -g root -m 0644 "$SOURCE/deploy/model-radar.service" \
  /etc/systemd/system/model-radar.service
systemctl daemon-reload
systemctl enable model-radar.service
systemctl restart model-radar.service

healthy=false
for _ in $(seq 1 40); do
  if curl --fail --silent http://127.0.0.1:4417/health | grep -q '"ok":true'; then
    healthy=true
    break
  fi
  sleep 0.5
done
if [[ "$healthy" != true ]]; then
  systemctl status model-radar.service --no-pager >&2 || true
  exit 1
fi

if ! grep -qE '^[[:space:]]*location = /models[[:space:]]*\{' "$PLATFORM_NGINX"; then
  current_sha="$(sha256sum "$PLATFORM_NGINX" | awk '{print $1}')"
  if [[ "$current_sha" != "$before_sha" ]]; then
    echo "Shared Nginx changed concurrently; refusing stale mutation." >&2
    exit 1
  fi
  python3 - "$PLATFORM_NGINX" "$SOURCE/deploy/nginx-model-radar-location.conf" <<'PY'
import sys
from pathlib import Path

config_path, block_path = map(Path, sys.argv[1:])
text = config_path.read_text()
block = block_path.read_text()
server_marker = "    server_name lifeyoume.icu www.lifeyoume.icu;"
server_start = text.index(server_marker)
insert_at = text.index("    location = /skills {", server_start)
updated = text[:insert_at] + block + "\n" + text[insert_at:]
with config_path.open("r+", encoding="utf-8") as target:
    target.seek(0)
    target.write(updated)
    target.truncate()
PY
fi

after_inode="$(stat -c %i "$PLATFORM_NGINX")"
[[ "$after_inode" == "$before_inode" ]] || {
  echo "Shared Nginx inode changed; restoring backup." >&2
  cp --preserve=mode,ownership,timestamps "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  exit 1
}

grep -E '^[[:space:]]*location([[:space:]=~^]+)[^[:space:]{]+' "$PLATFORM_NGINX" |
  sed 's/[[:space:]]\+/ /g' | sort -u > "$after_locations"
missing="$(comm -23 "$before_locations" "$after_locations")"
if [[ -n "$missing" ]]; then
  echo "Pre-existing routes disappeared; restoring backup:" >&2
  echo "$missing" >&2
  cp --preserve=mode,ownership,timestamps "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  exit 1
fi

python3 - "$PLATFORM_PRODUCTS" "$SOURCE/deploy/product.json" <<'PY'
import json
import os
import sys
import tempfile

registry_path, product_path = sys.argv[1:]
with open(registry_path, encoding="utf-8") as source:
    registry = json.load(source)
with open(product_path, encoding="utf-8") as source:
    product = json.load(source)
products = registry["products"]
for index, existing in enumerate(products):
    if existing["id"] == product["id"]:
        products[index] = product
        break
else:
    insert_at = next(
        (index + 1 for index, item in enumerate(products)
         if item["id"] == "skill-radar"),
        len(products),
    )
    products.insert(insert_at, product)
directory = os.path.dirname(registry_path)
fd, temporary = tempfile.mkstemp(dir=directory, prefix="products.", suffix=".json")
try:
    with os.fdopen(fd, "w", encoding="utf-8") as target:
        json.dump(registry, target, ensure_ascii=False, indent=2)
        target.write("\n")
    os.chmod(temporary, 0o644)
    os.replace(temporary, registry_path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

rollback() {
  cp --preserve=mode,ownership,timestamps "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  install -o root -g root -m 0644 "$BACKUP/products.json" "$PLATFORM_PRODUCTS"
  docker exec "$CONTAINER" nginx -t >/dev/null
  docker exec "$CONTAINER" nginx -s reload
}

if ! docker exec "$CONTAINER" nginx -t; then
  rollback
  exit 1
fi
if ! docker exec "$CONTAINER" nginx -s reload; then
  rollback
  exit 1
fi

for target in \
  "https://lifeyoume.icu/models/" \
  "https://lifeyoume.icu/" \
  "https://lifeyoume.icu/skills/" \
  "https://lifeyoume.icu/trends/" \
  "https://lifeyoume.icu/image/" \
  "https://lifeyoume.icu/flowframe/"; do
  code="$(curl --silent --location --output /dev/null --write-out '%{http_code}' --max-time 20 "$target" || true)"
  if [[ "$code" == "000" || "$code" == "404" || "$code" -ge 500 ]]; then
    echo "Probe failed for $target with HTTP $code; restoring backup" >&2
    rollback
    exit 1
  fi
  echo "$code $target"
done

systemctl restart lifeyoume-platform@portal.service
portal_healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8800/healthz >/dev/null; then
    portal_healthy=true
    break
  fi
  sleep 0.5
done
[[ "$portal_healthy" == true ]] || { echo "Portal failed after catalog reload" >&2; exit 1; }

echo "Deployed Model Radar release: $RELEASE"
echo "Backup: $BACKUP"
