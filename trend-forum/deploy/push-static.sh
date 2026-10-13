#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
RELEASE="/tmp/trend-forum-release"
APP_TARGET="/data/app/trend-forum/current"
WEB_TARGET="/var/www/trends"
BACKUP="/data/app/backups/trend-forum-$(date -u +%Y%m%dT%H%M%SZ)"

cd "$ROOT"
npm run prepare:daily
npm run build:portal

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

echo "Trend Forum deployed to https://lifeyoume.icu/trends/"
