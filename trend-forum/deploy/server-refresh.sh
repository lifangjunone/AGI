#!/bin/bash
set -euo pipefail

APP_DIR="${TREND_FORUM_APP_DIR:-/data/app/trend-forum}"
AUTOMATION_DIR="$APP_DIR/automation"
SUPPORT_DIR="$APP_DIR/technology-exploration"
REPORT_DIR="$SUPPORT_DIR/reports"
LOCK_FILE="$AUTOMATION_DIR/refresh.lock"
TODAY="$(TZ=Asia/Shanghai date +%F)"
REPORT="$REPORT_DIR/$TODAY.json"

mkdir -p "$AUTOMATION_DIR/public/data" "$REPORT_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 上一轮采集仍在运行，本轮跳过。"
  exit 0
fi

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 开始服务器热点采集。"
export TECH_EXPLORER_SUPPORT_DIR="$SUPPORT_DIR"
/usr/bin/python3 "$AUTOMATION_DIR/technology_explorer.py" --collect

/usr/bin/python3 - "$REPORT" "$TODAY" <<'PY'
import datetime as dt
import json
import sys
from zoneinfo import ZoneInfo

path, expected_date = sys.argv[1:3]
with open(path, encoding="utf-8") as handle:
    report = json.load(handle)

generated = dt.datetime.fromisoformat(
    str(report.get("generated_at") or "").replace("Z", "+00:00")
).astimezone(ZoneInfo("Asia/Shanghai"))
if generated.date().isoformat() != expected_date:
    raise SystemExit("报告日期不属于今天，拒绝发布")
if not report.get("news_boards"):
    raise SystemExit("报告缺少有效榜单，拒绝发布")
PY

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 报告验证通过，生成站点数据。"
cd "$AUTOMATION_DIR"
PREVIOUS_TRENDS="$AUTOMATION_DIR/public/data/trends.previous.json"
if [[ -s "$AUTOMATION_DIR/public/data/trends.json" ]]; then
  cp "$AUTOMATION_DIR/public/data/trends.json" "$PREVIOUS_TRENDS"
fi
TREND_FORUM_REPORT_DIR="$REPORT_DIR" /usr/bin/node scripts/sync-technology-report.mjs
if [[ -s "$PREVIOUS_TRENDS" ]]; then
  /usr/bin/python3 scripts/merge-cached-trends.py \
    "$PREVIOUS_TRENDS" \
    "$AUTOMATION_DIR/public/data/trends.json"
fi
/usr/bin/node scripts/publish-daily.mjs

for target in "$APP_DIR/current/data" /var/www/trends/data; do
  install -d -m 0755 "$target"
  install -m 0644 public/data/trends.json "$target/trends.json.new"
  install -m 0644 public/data/posts.json "$target/posts.json.new"
  mv "$target/trends.json.new" "$target/trends.json"
  mv "$target/posts.json.new" "$target/posts.json"
done

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 服务器采集与发布完成。"
