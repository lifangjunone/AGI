#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
RELEASE="/tmp/lifeyoume-platform-release"

ssh "$REMOTE" "rm -rf '$RELEASE' && install -d -m 0700 '$RELEASE/platform' '$RELEASE/config' '$RELEASE/deploy'"
scp "$ROOT/platform/app.py" "$REMOTE:$RELEASE/platform/app.py"
scp "$ROOT/config/products.json" "$REMOTE:$RELEASE/config/products.json"
scp "$ROOT/deploy/lifeyoume-platform@.service" "$REMOTE:$RELEASE/deploy/lifeyoume-platform@.service"
scp "$ROOT/deploy/install-server.sh" "$REMOTE:$RELEASE/deploy/install-server.sh"
scp "$ROOT/deploy/nginx-platform.conf" "$REMOTE:$RELEASE/deploy/nginx-platform.conf"
scp "$ROOT/deploy/renew-platform-certificate.sh" "$REMOTE:$RELEASE/deploy/renew-platform-certificate.sh"
ssh "$REMOTE" "chmod 0700 '$RELEASE/deploy/'*.sh && '$RELEASE/deploy/install-server.sh' '$RELEASE'"
