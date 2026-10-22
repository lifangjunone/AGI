#!/bin/sh
set -eu

APP=/data/app/meyou-agent-network
SOURCE=${1:-/tmp/meyou-agent-network-release}
BACKUP=/data/app/backups/meyou-agent-network-$(date -u +%Y%m%dT%H%M%SZ)

if [ ! -f "$SOURCE/compose.production.yml" ] || [ ! -f "$SOURCE/Dockerfile" ]; then
  echo "MeYou release bundle is incomplete" >&2
  exit 1
fi

install -d -m 0750 "$APP" "$APP/private" /data/app/backups
if [ -f "$APP/compose.production.yml" ]; then
  install -d -m 0700 "$BACKUP"
  cp -a "$APP/." "$BACKUP/"
  if docker compose -f "$APP/compose.production.yml" ps postgres >/dev/null 2>&1; then
    docker compose -f "$APP/compose.production.yml" exec -T postgres \
      pg_dump -U meyou -d meyou -Fc > "$BACKUP/meyou.pg_dump" || true
  fi
fi

find "$APP" -mindepth 1 -maxdepth 1 ! -name private -exec rm -rf {} +
cp -a "$SOURCE/." "$APP/"
install -d -m 0700 "$APP/private"

if [ ! -f "$APP/private/api.env" ]; then
  echo "Missing $APP/private/api.env; install secrets before deployment" >&2
  exit 1
fi
chmod 0600 "$APP/private/api.env"

cd "$APP"
if ! docker compose -f compose.production.yml up -d --build --remove-orphans; then
  echo "MeYou compose deployment failed" >&2
  exit 1
fi

healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:43180/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
if [ "$healthy" != true ]; then
  docker compose -f compose.production.yml logs --tail=120 api worker >&2
  echo "MeYou failed health check; backup is available at $BACKUP" >&2
  exit 1
fi

echo "MeYou deployed and healthy."
