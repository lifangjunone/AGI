#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
UPLOAD="/tmp/model-radar-release-$STAMP"

cd "$ROOT"
npm test
npm run check
bash -n deploy/*.sh

ssh "$REMOTE" "install -d -m 0700 '$UPLOAD'"
tar \
  --exclude='docs/evidence' \
  --exclude='.DS_Store' \
  -czf - \
  package.json server.js lib public deploy README.md |
  ssh "$REMOTE" "tar -xzf - -C '$UPLOAD'"
ssh "$REMOTE" "chmod 0700 '$UPLOAD/deploy/'*.sh && '$UPLOAD/deploy/install-server.sh' '$UPLOAD'"

echo "Model Radar deployed to https://lifeyoume.icu/models/"
