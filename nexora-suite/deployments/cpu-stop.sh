#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEXORA_ROOT:-/data00/home/lifangjun/nexora-suite}"
RUN="$ROOT/runtime/run"

for service in core-api studio-api control-api maas-api runtime-api native-runtime core-web studio-web control-web maas-web runtime-web; do
  if [ -f "$RUN/$service.pid" ]; then
    pid="$(cat "$RUN/$service.pid")"
    kill "$pid" 2>/dev/null || true
    rm -f "$RUN/$service.pid"
  fi
done

echo "Nexora processes stopped."
