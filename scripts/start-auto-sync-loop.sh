#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_SCRIPT="$ROOT/scripts/auto-sync-github.sh"
INTERVAL_SECONDS="${AUTO_SYNC_INTERVAL_SECONDS:-3600}"
STATE_DIR="${AUTO_SYNC_STATE_DIR:-$HOME/Library/Application Support/LifeYouMe}"
LOG_DIR="${AUTO_SYNC_LOG_DIR:-$HOME/Library/Logs/LifeYouMe}"
PID_FILE="$STATE_DIR/agi-github-sync-loop.pid"
LOG_FILE="$LOG_DIR/agi-github-sync-loop.log"

mkdir -p "$STATE_DIR" "$LOG_DIR"
chmod +x "$SYNC_SCRIPT"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    printf 'AGI GitHub sync loop is already running: pid %s\n' "$old_pid"
    printf 'Log: %s\n' "$LOG_FILE"
    exit 0
  fi
fi

nohup /bin/bash -c '
set -u
root="$1"
sync_script="$2"
interval="$3"

cd "$root" || exit 1

while true; do
  printf "[%s] starting scheduled sync\n" "$(date "+%Y-%m-%d %H:%M:%S")"
  if /bin/bash "$sync_script"; then
    status=0
  else
    status=$?
  fi
  printf "[%s] scheduled sync finished with status %s\n" "$(date "+%Y-%m-%d %H:%M:%S")" "$status"
  sleep "$interval"
done
' agi-github-sync-loop "$ROOT" "$SYNC_SCRIPT" "$INTERVAL_SECONDS" >>"$LOG_FILE" 2>&1 &

pid="$!"
printf '%s\n' "$pid" >"$PID_FILE"

printf 'Started AGI GitHub sync loop: pid %s\n' "$pid"
printf 'Interval: %s seconds\n' "$INTERVAL_SECONDS"
printf 'Log: %s\n' "$LOG_FILE"
