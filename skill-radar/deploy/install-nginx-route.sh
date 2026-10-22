#!/bin/bash
set -euo pipefail

CONFIG="/data/app/lifeyoume-platform/deploy/nginx-platform.conf"
CONTAINER="opportunity_factory_proxy"
LOCK="/run/lock/skill-radar-nginx.lock"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/data/app/backups/nginx-platform-before-skill-radar-$STAMP.conf"
EXPECTED_SHA="${EXPECTED_NGINX_SHA256:-}"

exec 9>"$LOCK"
flock -x 9

[[ -f "$CONFIG" ]] || { echo "Shared Nginx config not found" >&2; exit 1; }
current_sha="$(sha256sum "$CONFIG" | awk '{print $1}')"
if [[ -n "$EXPECTED_SHA" && "$current_sha" != "$EXPECTED_SHA" ]]; then
  echo "Shared Nginx changed concurrently; expected $EXPECTED_SHA, found $current_sha" >&2
  exit 1
fi

install -d -m 0700 /data/app/backups
cp -a "$CONFIG" "$BACKUP"
before_locations="$(mktemp)"
after_locations="$(mktemp)"
trap 'rm -f "$before_locations" "$after_locations"' EXIT
grep -E '^[[:space:]]*location([[:space:]=~^]+)[^[:space:]{]+' "$CONFIG" | sed 's/[[:space:]]\\+/ /g' | sort -u > "$before_locations"

if grep -qE '^[[:space:]]*location = /skills[[:space:]]*\\{' "$CONFIG"; then
  echo "Skill Radar route already exists; no config mutation needed."
else
  CONFIG="$CONFIG" python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["CONFIG"])
text = path.read_text()
server_marker = "    server_name lifeyoume.icu www.lifeyoume.icu;"
server_start = text.index(server_marker)
insert_at = text.index("    location = /decision {", server_start)
block = """    location = /skills {
        return 301 /skills/;
    }

    location /skills/ {
        proxy_pass http://127.0.0.1:4398;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        add_header Cache-Control \"public, max-age=300\";
        add_header Content-Security-Policy \"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\" always;
        add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;
        add_header X-Content-Type-Options \"nosniff\" always;
        add_header X-Frame-Options \"DENY\" always;
        add_header Permissions-Policy \"camera=(), microphone=(), geolocation=(), payment=(), usb=()\" always;
    }

"""
updated = text[:insert_at] + block + text[insert_at:]
with path.open("r+", encoding="utf-8") as handle:
    handle.seek(0)
    handle.write(updated)
    handle.truncate()
PY
fi

grep -E '^[[:space:]]*location([[:space:]=~^]+)[^[:space:]{]+' "$CONFIG" | sed 's/[[:space:]]\\+/ /g' | sort -u > "$after_locations"
if missing="$(comm -23 "$before_locations" "$after_locations")" && [[ -n "$missing" ]]; then
  echo "Pre-existing routes disappeared; restoring backup:" >&2
  echo "$missing" >&2
  cp -a "$BACKUP" "$CONFIG"
  exit 1
fi

rollback() {
  cp --preserve=mode,ownership,timestamps "$BACKUP" "$CONFIG"
  docker exec "$CONTAINER" nginx -t >/dev/null
  docker exec "$CONTAINER" nginx -s reload
}

if ! docker exec "$CONTAINER" nginx -t; then
  rollback
  exit 1
fi
docker exec "$CONTAINER" nginx -s reload

for target in \
  "https://lifeyoume.icu/skills/" \
  "https://lifeyoume.icu/" \
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

echo "Skill Radar route installed. Backup: $BACKUP"
