#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEXORA_ROOT:-/data00/home/lifangjun/nexora-suite}"
RUN="$ROOT/runtime/run"
LOG="$ROOT/runtime/log"
SECRET_FILE="$ROOT/runtime/nexora.env"
ENGINE_ROOT="$ROOT/runtime/engines"
PUBLIC_HOST="${NEXORA_PUBLIC_HOST:-$(hostname -I | awk '{print $1}')}"

mkdir -p "$RUN" "$LOG" "$ENGINE_ROOT/native-agentloop/18.12.6"
if [ ! -e "$ENGINE_ROOT/native-agentloop/18.12.6/engine" ]; then
  ln "$ROOT/nexora-runtime/third_party/oh-my-pi/bin/omp" "$ENGINE_ROOT/native-agentloop/18.12.6/engine"
fi
if [ ! -L "$ENGINE_ROOT/native-agentloop/current" ]; then
  ln -s "18.12.6/engine" "$ENGINE_ROOT/native-agentloop/current"
fi
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

for service in core-api studio-api control-api maas-api runtime-api native-runtime core-web studio-web control-web maas-web runtime-web; do
  stop_one "$service"
done

start_one core-api env \
  ADDR=:8080 \
  NEXORA_PRODUCTS=studio,control,maas,runtime \
  NEXORA_DATA_FILE="$ROOT/runtime/data/core-state.json" \
  STUDIO_PUBLIC_URL="http://$PUBLIC_HOST:3001" \
  CONTROL_PUBLIC_URL="http://$PUBLIC_HOST:3002" \
  MAAS_PUBLIC_URL="http://$PUBLIC_HOST:3003" \
  RUNTIME_PUBLIC_URL="http://$PUBLIC_HOST:3004" \
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
  RUNTIME_URL=http://127.0.0.1:8084 \
  "$ROOT/nexora-studio/api/nexora-studio"

start_one maas-api env \
  ADDR=:8083 \
  NEXORA_JWT_SECRET="$NEXORA_JWT_SECRET" \
  NEXORA_DATA_FILE="$ROOT/runtime/data/maas-state.json" \
  "$ROOT/nexora-maas/api/nexora-maas"

start_one native-runtime env \
  ADDR=:8094 \
  MAAS_URL=http://127.0.0.1:8083 \
  OMP_BINARY="$ENGINE_ROOT/native-agentloop/current" \
  NATIVE_ENGINE_VERSION=18.12.6 \
  NATIVE_WORKSPACE_ROOT="$ROOT/runtime/native-workspaces" \
  NATIVE_TOOL_DIALECT=qwen3 \
  NATIVE_MODEL_CONTEXT_WINDOW=4096 \
  NATIVE_MODEL_MAX_TOKENS=2048 \
  "$ROOT/nexora-runtime/worker/nexora-native-runtime"

start_one runtime-api env \
  ADDR=:8084 \
  NEXORA_JWT_SECRET="$NEXORA_JWT_SECRET" \
  NEXORA_DATA_FILE="$ROOT/runtime/data/runtime-state.json" \
  NEXORA_RUNTIME_PACKAGES="$ROOT/nexora-runtime/packages" \
  NEXORA_ENGINE_ROOT="$ENGINE_ROOT" \
  NATIVE_ENGINE_VERSION=18.12.6 \
  NATIVE_WORKER_URL=http://127.0.0.1:8094 \
  "$ROOT/nexora-runtime/api/nexora-runtime"

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

start_one runtime-web env \
  HOSTNAME=0.0.0.0 PORT=3004 API_PROXY_TARGET=http://127.0.0.1:8084 \
  node "$ROOT/runtime/runtime-web/server.js"

echo "Nexora processes started."
