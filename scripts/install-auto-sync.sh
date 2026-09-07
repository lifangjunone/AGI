#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_SCRIPT="$ROOT/scripts/auto-sync-github.sh"
LABEL="com.lifeyoume.agi-github-sync"
DOMAIN="gui/$(id -u)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/LifeYouMe"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod +x "$SYNC_SCRIPT"

/usr/bin/plutil -create xml1 "$PLIST_PATH"
/usr/bin/plutil -insert Label -string "$LABEL" "$PLIST_PATH"
/usr/bin/plutil -insert ProgramArguments -json \
  "[\"/bin/bash\", \"$SYNC_SCRIPT\"]" "$PLIST_PATH"
/usr/bin/plutil -insert WorkingDirectory -string "$ROOT" "$PLIST_PATH"
/usr/bin/plutil -insert StartInterval -integer 7200 "$PLIST_PATH"
/usr/bin/plutil -insert ProcessType -string Background "$PLIST_PATH"
/usr/bin/plutil -insert LowPriorityIO -bool true "$PLIST_PATH"
/usr/bin/plutil -insert StandardOutPath -string \
  "$LOG_DIR/agi-github-sync.log" "$PLIST_PATH"
/usr/bin/plutil -insert StandardErrorPath -string \
  "$LOG_DIR/agi-github-sync.error.log" "$PLIST_PATH"

/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "$DOMAIN" "$PLIST_PATH"

printf 'Installed %s with a 7200-second interval.\n' "$LABEL"
printf 'Logs: %s/agi-github-sync.log\n' "$LOG_DIR"
