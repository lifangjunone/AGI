#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
RELEASE="/tmp/travel-frame-release"
APP_TARGET="/data/app/travel-frame/current"
WEB_TARGET="/var/www/travel-frame"
BACKUP="/data/app/backups/travel-frame-$(date -u +%Y%m%dT%H%M%SZ)"

cd "$ROOT"
TRAVEL_FRAME_BASE="/travel-frame/" npm run build

ssh "$REMOTE" "rm -rf '$RELEASE' && install -d -m 0755 '$RELEASE'"
scp -r "$ROOT/dist/." "$REMOTE:$RELEASE/"
ssh "$REMOTE" "set -e
  if [ -d '$APP_TARGET' ]; then
    install -d -m 0700 '$BACKUP'
    cp -a '$APP_TARGET/.' '$BACKUP/'
  fi
  install -d -m 0755 '$APP_TARGET' '$WEB_TARGET'
  find '$APP_TARGET' -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  find '$WEB_TARGET' -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  cp -a '$RELEASE/.' '$APP_TARGET/'
  cp -a '$RELEASE/.' '$WEB_TARGET/'
  find '$APP_TARGET' '$WEB_TARGET' -type d -exec chmod 0755 {} +
  find '$APP_TARGET' '$WEB_TARGET' -type f -exec chmod 0644 {} +
  rm -rf '$RELEASE'"

echo "TravelFrame deployed to $WEB_TARGET"
