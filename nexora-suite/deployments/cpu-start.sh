#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEXORA_ROOT:-/data00/home/lifangjun/nexora-suite}"
RUN="$ROOT/runtime/run"
LOG="$ROOT/runtime/log"
SECRET_FILE="$ROOT/runtime/nexora.env"
PUBLIC_HOST="${NEXORA_PUBLIC_HOST:-$(hostname -I | awk '{print $1}')}"

mkdir -p "$RUN" "$LOG"
if [ ! -f "$SECRET_FILE" ]; then
  umask 077
  printf 'NEXORA_JWT_SECRET=%s\n' "$(openssl rand -hex 32)" > "$SECRET_FILE"
  printf 'NEXORA_ADMIN_PASSWORD=%s\n' 'Nexora123!' >> "$SECRET_FILE"
fi
set -a
# shellcheck disable=SC1090
. "$SECRET_FILE"
set +a

stop_one() {
  local name="$1"
  if [ -f "$RUN/$name.pid" ]; then
    local pid
    pid="$(cat "$RUN/$name.pid")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
    fi
    rm -f "$RUN/$name.pid"
  fi
}

start_one() {
  local name="$1"
  shift
  nohup "$@" >"$LOG/$name.log" 2>&1 < /dev/null &
  echo "$!" > "$RUN/$name.pid"
}

for service in core-api studio-api control-api maas-api core-web studio-web control-web maas-web; do
  stop_one "$service"
done

start_one core-api env \
  ADDR=:8080 \
  NEXORA_PRODUCTS=studio,control,maas \
  NEXORA_DATA_FILE="$ROOT/runtime/data/core-state.json" \
  STUDIO_PUBLIC_URL="http://$PUBLIC_HOST:3001" \
  CONTROL_PUBLIC_URL="http://$PUBLIC_HOST:3002" \
  MAAS_PUBLIC_URL="http://$PUBLIC_HOST:3003" \
  NEXORA_JWT_SECRET="$NEXORA_JWT_SECRET" \
  NEXORA_ADMIN_PASSWORD="$NEXORA_ADMIN_PASSWORD" \
  "$ROOT/nexora-core/api/nexora-core"

start_one control-api env \
  ADDR=:8082 \
  NEXORA_JWT_SECRET="$NEXORA_JWT_SECRET" \
  "$ROOT/nexora-control/api/nexora-control"

start_one studio-api env \
  ADDR=:8081 \
  NEXORA_JWT_SECRET="$NEXORA_JWT_SECRET" \
  NEXORA_DATA_FILE="$ROOT/runtime/data/studio-state.json" \
  CONTROL_URL=http://127.0.0.1:8082 \
  "$ROOT/nexora-studio/api/nexora-studio"

start_one maas-api env \
  ADDR=:8083 \
  NEXORA_JWT_SECRET="$NEXORA_JWT_SECRET" \
  NEXORA_DATA_FILE="$ROOT/runtime/data/maas-state.json" \
  "$ROOT/nexora-maas/api/nexora-maas"

start_one core-web env \
  HOSTNAME=0.0.0.0 PORT=3000 API_PROXY_TARGET=http://127.0.0.1:8080 \
  node "$ROOT/runtime/core-web/server.js"

start_one studio-web env \
  HOSTNAME=0.0.0.0 PORT=3001 API_PROXY_TARGET=http://127.0.0.1:8081 \
  node "$ROOT/runtime/studio-web/server.js"

start_one control-web env \
  HOSTNAME=0.0.0.0 PORT=3002 API_PROXY_TARGET=http://127.0.0.1:8082 \
  node "$ROOT/runtime/control-web/server.js"

start_one maas-web env \
  HOSTNAME=0.0.0.0 PORT=3003 API_PROXY_TARGET=http://127.0.0.1:8083 \
  node "$ROOT/runtime/maas-web/server.js"

echo "Nexora processes started."
