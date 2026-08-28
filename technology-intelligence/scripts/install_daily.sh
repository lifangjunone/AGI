#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_EXECUTABLE="$PROJECT_DIR/dist/Technology Exploration.app/Contents/MacOS/TechnologyExplorer"
AGENT_FILE="/Users/bytedance/Library/LaunchAgents/com.local.technology-exploration.plist"
HOUR="${1:-9}"
MINUTE="${2:-0}"

if [[ ! -x "$APP_EXECUTABLE" ]]; then
  echo "请先运行 scripts/build.sh"
  exit 1
fi

mkdir -p "/Users/bytedance/Library/LaunchAgents"
sed -e "s|__APP_EXECUTABLE__|$APP_EXECUTABLE|g" -e "s|__HOUR__|$HOUR|g" -e "s|__MINUTE__|$MINUTE|g" \
  "$PROJECT_DIR/scripts/launch-agent.plist.template" > "$AGENT_FILE"

launchctl bootout "gui/$(id -u)/com.local.technology-exploration" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT_FILE"
launchctl enable "gui/$(id -u)/com.local.technology-exploration"
echo "已设置每天 $(printf '%02d:%02d' "$HOUR" "$MINUTE") 自动打开"

