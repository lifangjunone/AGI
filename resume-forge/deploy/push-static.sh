#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
RELEASE="/tmp/resume-forge-release"
TARGET="/data/app/resume-forge/current"
BACKUP="/data/app/backups/resume-forge-$(date -u +%Y%m%dT%H%M%SZ)"

cd "$ROOT"
npm run build:portal

ssh "$REMOTE" "rm -rf '$RELEASE' && install -d -m 0755 '$RELEASE'"
scp -r "$ROOT/dist/." "$REMOTE:$RELEASE/"
ssh "$REMOTE" "set -e
  if [ -d '$TARGET' ]; then
    install -d -m 0700 '$BACKUP'
    cp -a '$TARGET/.' '$BACKUP/'
  fi
  install -d -m 0755 '$TARGET'
  find '$TARGET' -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  cp -a '$RELEASE/.' '$TARGET/'
  find '$TARGET' -type d -exec chmod 0755 {} +
  find '$TARGET' -type f -exec chmod 0644 {} +
  rm -rf '$RELEASE'"

echo "ResumeForge deployed to $TARGET"
