#!/usr/bin/env bash
# Deploy only staged usability fixes. Preserve each process's current config.
set -euo pipefail
root=/data00/home/lifangjun/nexora-suite
stage="${1:?Provide the exact staged release directory}"
case "$stage" in "$root"/runtime/releases/usability-*) ;; *) echo "Invalid release directory"; exit 1;; esac
backup="$stage/backup"
mkdir -p "$backup"
chmod 700 "$stage" "$backup"
for name in core-api studio-api runtime-api native-runtime runtime-web; do
  pid=$(<"$root/runtime/run/$name.pid")
  kill -0 "$pid"
  cp "/proc/$pid/environ" "$backup/$name.env"
  chmod 600 "$backup/$name.env"
done
cp -a "$root/runtime/data" "$backup/data"
for item in nexora-core/api/nexora-core nexora-studio/api/nexora-studio nexora-runtime/api/nexora-runtime nexora-runtime/worker/nexora-native-runtime; do
  mkdir -p "$backup/$(dirname "$item")"
  cp -p "$root/$item" "$backup/$item"
done
for name in core-api studio-api runtime-api native-runtime runtime-web; do
  pid=$(<"$root/runtime/run/$name.pid")
  kill "$pid"
  for attempt in {1..30}; do
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep .2
  done
done
install -m 755 "$stage/core-api" "$root/nexora-core/api/nexora-core"
install -m 755 "$stage/studio-api" "$root/nexora-studio/api/nexora-studio"
install -m 755 "$stage/runtime-api" "$root/nexora-runtime/api/nexora-runtime"
install -m 755 "$stage/native-runtime" "$root/nexora-runtime/worker/nexora-native-runtime"
mv "$root/runtime/runtime-web" "$backup/runtime-web"
mv "$stage/web" "$root/runtime/runtime-web"
start() {
  local name="$1"
  shift
  local -a process_env
  mapfile -d '' -t process_env <"$backup/$name.env"
  nohup env -i "${process_env[@]}" "$@" >"$root/runtime/log/$name.log" 2>&1 </dev/null &
  echo "$!" >"$root/runtime/run/$name.pid"
}
start core-api "$root/nexora-core/api/nexora-core"
start studio-api "$root/nexora-studio/api/nexora-studio"
start runtime-api "$root/nexora-runtime/api/nexora-runtime"
start native-runtime "$root/nexora-runtime/worker/nexora-native-runtime"
start runtime-web node "$root/runtime/runtime-web/server.js"
for port in 8080 8081 8084 8094 3004; do
  path=/healthz
  if [ "$port" = 3004 ]; then path=/; fi
  verified=false
  for attempt in {1..20}; do
    if curl --max-time 2 -fsS "http://127.0.0.1:$port$path" >/dev/null; then verified=true; break; fi
    sleep .2
  done
  if [ "$verified" != true ]; then echo "Health check failed: $port. Backup: $backup"; exit 1; fi
done
echo "Release healthy. Backup: $backup"
