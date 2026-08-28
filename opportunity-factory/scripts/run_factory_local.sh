#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUPPORT_DIR="$HOME/Library/Application Support/Opportunity Factory"
ENV_FILE="$SUPPORT_DIR/.env"

set -a
source "$ENV_FILE"
set +a
exec /usr/bin/python3 "$PROJECT_DIR/service/autonomous_factory.py" serve
