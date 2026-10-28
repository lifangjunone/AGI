#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
RELEASE="/tmp/meyou-agent-network-release"

cd "$ROOT"
npm run build

ssh "$REMOTE" "rm -rf '$RELEASE' && install -d -m 0700 '$RELEASE'"
tar \
  --no-xattrs \
  --exclude=node_modules \
  --exclude='.env' \
  --exclude='private' \
  --exclude='.git' \
  -C "$ROOT" -czf - . | ssh "$REMOTE" "tar -xzf - -C '$RELEASE'"
ssh "$REMOTE" "chmod 0700 '$RELEASE/deploy/'*.sh && '$RELEASE/deploy/install-server.sh' '$RELEASE'"
