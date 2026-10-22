#!/bin/bash
set -euo pipefail

SOURCE="${1:-/tmp/flowframe-studio-release}"
APP="/data/app/flowframe-studio"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$APP/releases/$STAMP"
BACKUP="/data/app/backups/flowframe-studio-$STAMP"

for required in package.json package-lock.json server.mjs dist/index.html deploy/flowframe-studio.service; do
  [[ -f "$SOURCE/$required" ]] || {
    echo "Release bundle is incomplete: $required" >&2
    exit 1
  }
done

id flowframe >/dev/null 2>&1 ||
  useradd --system --home "$APP" --shell /usr/sbin/nologin flowframe

install -d -m 0700 "$BACKUP"
[[ -L "$APP/current" ]] && readlink "$APP/current" > "$BACKUP/previous-release.txt"

install -d -o flowframe -g flowframe -m 0750 "$APP/releases" "$APP/shared"
install -d -o flowframe -g flowframe -m 0700 "$APP/shared/data"
chown flowframe:flowframe "$APP/shared/data"
chmod 0700 "$APP/shared/data"
if [[ -f "$APP/shared/data/model-configs.json" ]]; then
  chown flowframe:flowframe "$APP/shared/data/model-configs.json"
  chmod 0600 "$APP/shared/data/model-configs.json"
fi
cp -a "$SOURCE" "$RELEASE"
chown -R flowframe:flowframe "$RELEASE"
(
  cd "$RELEASE"
  PATH=/opt/node20/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    /opt/node20/bin/npm ci --omit=dev --ignore-scripts
)

ln -sfn "$RELEASE" "$APP/current.next"
mv -Tf "$APP/current.next" "$APP/current"
install -o root -g root -m 0644 "$SOURCE/deploy/flowframe-studio.service" \
  /etc/systemd/system/flowframe-studio.service
systemctl daemon-reload
systemctl enable flowframe-studio.service
systemctl restart flowframe-studio.service

healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:4390/flowframe/ |
    grep -q "FlowFrame"; then
    healthy=true
    break
  fi
  sleep 0.5
done
if [[ "$healthy" != true ]]; then
  systemctl status flowframe-studio.service --no-pager >&2 || true
  if [[ -f "$BACKUP/previous-release.txt" ]]; then
    previous="$(cat "$BACKUP/previous-release.txt")"
    ln -sfn "$previous" "$APP/current.next"
    mv -Tf "$APP/current.next" "$APP/current"
    systemctl restart flowframe-studio.service
  fi
  exit 1
fi

printf "Deployed %s without modifying shared Nginx configuration\n" "$RELEASE"
