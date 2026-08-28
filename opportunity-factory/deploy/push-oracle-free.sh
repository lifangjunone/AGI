#!/bin/bash
set -euo pipefail

HOST="${ORACLE_HOST:?set ORACLE_HOST to the VM public IP}"
DOMAIN="${ORACLE_DOMAIN:?set ORACLE_DOMAIN to a DNS name pointing to the VM}"
USER="${ORACLE_USER:-ubuntu}"
KEY="${ORACLE_KEY:?set ORACLE_KEY to the VM SSH private key}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$(mktemp /tmp/opportunity-oracle.XXXXXX.tgz)"

trap 'rm -f "$ARCHIVE"' EXIT
if [[ ! -f "$KEY" ]]; then
  echo "SSH key does not exist: $KEY" >&2
  exit 2
fi

tar -C "$PROJECT_DIR" -czf "$ARCHIVE" \
  service/autonomous_factory.py \
  deploy/opportunity-factory.env.example \
  deploy/install-oracle-free.sh

scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  "$ARCHIVE" "$USER@$HOST:/tmp/opportunity-oracle.tgz"
ssh -i "$KEY" "$USER@$HOST" \
  "rm -rf /tmp/opportunity-oracle-release && \
   mkdir /tmp/opportunity-oracle-release && \
   tar -xzf /tmp/opportunity-oracle.tgz \
     -C /tmp/opportunity-oracle-release && \
   sudo bash \
     /tmp/opportunity-oracle-release/deploy/install-oracle-free.sh \
     /tmp/opportunity-oracle-release '$DOMAIN'"
