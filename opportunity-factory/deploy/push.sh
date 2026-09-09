#!/bin/bash
set -euo pipefail

HOST="${DEPLOY_HOST:-101.200.39.84}"
USER="${DEPLOY_USER:-root}"
KEY="${DEPLOY_KEY:-}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/opportunity-factory-deploy.tgz"

if [[ -z "$KEY" || ! -f "$KEY" ]]; then
  echo "Set DEPLOY_KEY to the SSH private key authorized on $HOST." >&2
  exit 2
fi

tar -C "$PROJECT_DIR" -czf "$ARCHIVE" service deploy requirements-pay-skill.txt
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$ARCHIVE" "$USER@$HOST:/tmp/opportunity-factory-deploy.tgz"
ssh -i "$KEY" "$USER@$HOST" '
  set -e
  rm -rf /tmp/opportunity-factory-release
  mkdir -p /tmp/opportunity-factory-release
  tar -xzf /tmp/opportunity-factory-deploy.tgz -C /tmp/opportunity-factory-release
  bash /tmp/opportunity-factory-release/deploy/install-server.sh /tmp/opportunity-factory-release
'
rm -f "$ARCHIVE"
