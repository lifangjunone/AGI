#!/bin/bash
set -euo pipefail

SOURCE="${1:-/tmp/story-studio-release}"
APP="/data/app/story-studio"
PLATFORM="/data/app/lifeyoume-platform"
PLATFORM_NGINX="$PLATFORM/deploy/nginx-platform.conf"
PLATFORM_PRODUCTS="$PLATFORM/config/products.json"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$APP/releases/$STAMP"
BACKUP="/data/app/backups/story-studio-$STAMP"
NGINX_BEFORE_SHA=""

for required in package.json package-lock.json server.mjs public/studio.html \
  deploy/story-studio.service deploy/nginx-story-studio-location.conf deploy/product.json; do
  [[ -f "$SOURCE/$required" ]] || { echo "Release bundle is incomplete: $required" >&2; exit 1; }
done

id story-studio >/dev/null 2>&1 ||
  useradd --system --home "$APP" --shell /usr/sbin/nologin story-studio

install -d -m 0700 "$BACKUP"
[[ -L "$APP/current" ]] && readlink "$APP/current" > "$BACKUP/previous-release.txt"
cp -a "$PLATFORM_NGINX" "$BACKUP/nginx-platform.conf"
cp -a "$PLATFORM_PRODUCTS" "$BACKUP/products.json"
NGINX_BEFORE_SHA="$(sha256sum "$PLATFORM_NGINX" | awk '{print $1}')"

install -d -o story-studio -g story-studio -m 0750 \
  "$APP/releases" "$APP/shared" "$APP/shared/data" "$APP/shared/config"
cp -a "$SOURCE" "$RELEASE"
chown -R story-studio:story-studio "$RELEASE"
(
  cd "$RELEASE"
  /opt/node20/bin/npm ci --omit=dev --include=optional --ignore-scripts
  # npm can keep the macOS-generated optional dependency selection from the
  # lock file. Make the native Linux Sharp runtime explicit for this host.
  /opt/node20/bin/npm install --no-save --omit=dev --include=optional \
    --os=linux --cpu=x64 sharp@0.35.5
  /opt/node20/bin/npm install --no-save --omit=dev \
    @img/sharp-linux-x64@0.35.5
  /opt/node20/bin/node -e 'import("sharp")'
)

if [[ ! -f "$APP/shared/runtime.env" ]]; then
  install -o story-studio -g story-studio -m 0600 \
    "$SOURCE/deploy/runtime.env.example" "$APP/shared/runtime.env"
fi
chmod 0600 "$APP/shared/runtime.env"
chown story-studio:story-studio "$APP/shared/runtime.env"
python3 - "$APP/shared/runtime.env" <<'PY'
import os
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as source:
    lines = source.read().splitlines()
output = []
replaced = False
for line in lines:
    if line.startswith("ALLOW_BILLABLE_GENERATION="):
        if not replaced:
            output.append("ALLOW_BILLABLE_GENERATION=false")
            replaced = True
        continue
    output.append(line)
if not replaced:
    output.append("ALLOW_BILLABLE_GENERATION=false")
temporary = f"{path}.next"
with open(temporary, "w", encoding="utf-8") as target:
    target.write("\n".join(output) + "\n")
os.chmod(temporary, 0o600)
os.replace(temporary, path)
PY
chown story-studio:story-studio "$APP/shared/runtime.env"

ln -sfn "$RELEASE" "$APP/current.next"
mv -Tf "$APP/current.next" "$APP/current"
install -o root -g root -m 0644 "$SOURCE/deploy/story-studio.service" \
  /etc/systemd/system/story-studio.service
systemctl daemon-reload
systemctl enable story-studio.service
systemctl restart story-studio.service

healthy=false
for _ in $(seq 1 40); do
  if curl --fail --silent http://127.0.0.1:4361/story-studio/api/health |
    grep -q '"service":"story-studio"'; then
    healthy=true
    break
  fi
  sleep 0.5
done
if [[ "$healthy" != true ]]; then
  systemctl status story-studio.service --no-pager >&2 || true
  exit 1
fi

if ! grep -q 'location /story-studio/' "$PLATFORM_NGINX"; then
  current_nginx_sha="$(sha256sum "$PLATFORM_NGINX" | awk '{print $1}')"
  if [[ "$current_nginx_sha" != "$NGINX_BEFORE_SHA" ]]; then
    echo "Shared Nginx changed during deployment; refusing to overwrite concurrent changes." >&2
    exit 1
  fi
  awk '
    FNR == NR { snippet = snippet $0 ORS; next }
    !inserted && index($0, "location = /video/") {
      printf "%s\n", snippet
      inserted = 1
    }
    { print }
    END { if (!inserted) exit 42 }
  ' "$SOURCE/deploy/nginx-story-studio-location.conf" "$PLATFORM_NGINX" \
    > "$PLATFORM_NGINX.next"
  # Preserve the bind-mounted inode so a graceful reload is sufficient and
  # unrelated products are never interrupted by a shared proxy restart.
  cp "$PLATFORM_NGINX.next" "$PLATFORM_NGINX"
  chown root:root "$PLATFORM_NGINX"
  chmod 0644 "$PLATFORM_NGINX"
  rm -f "$PLATFORM_NGINX.next"
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
         if item["id"] == "novel-video-studio"),
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

if ! docker exec opportunity_factory_proxy nginx -t; then
  cp "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  install -o root -g root -m 0644 "$BACKUP/products.json" "$PLATFORM_PRODUCTS"
  exit 1
fi
if ! docker exec opportunity_factory_proxy nginx -s reload; then
  cp "$BACKUP/nginx-platform.conf" "$PLATFORM_NGINX"
  install -o root -g root -m 0644 "$BACKUP/products.json" "$PLATFORM_PRODUCTS"
  docker exec opportunity_factory_proxy nginx -t
  docker exec opportunity_factory_proxy nginx -s reload || true
  exit 1
fi

printf 'Deployed %s to https://lifeyoume.icu/story-studio/\n' "$RELEASE"
