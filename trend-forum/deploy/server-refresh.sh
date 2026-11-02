#!/bin/bash
set -euo pipefail

APP_DIR="${TREND_FORUM_APP_DIR:-/data/app/trend-forum}"
AUTOMATION_DIR="$APP_DIR/automation"
SUPPORT_DIR="$APP_DIR/technology-exploration"
REPORT_DIR="$SUPPORT_DIR/reports"
HORIZON_DIR="${TREND_FORUM_HORIZON_DIR:-$APP_DIR/horizon}"
HORIZON_VENV="${TREND_FORUM_HORIZON_VENV:-$APP_DIR/horizon-venv}"
HORIZON_STATE="${TREND_FORUM_HORIZON_STATE:-$APP_DIR/horizon-state}"
HORIZON_COMMIT="cdd95f8e881673057e3e201717836da4b8e2e0e7"
LOCK_FILE="$AUTOMATION_DIR/refresh.lock"
TODAY="$(TZ=Asia/Shanghai date +%F)"
REPORT="$REPORT_DIR/$TODAY.json"

mkdir -p "$AUTOMATION_DIR/public/data" "$REPORT_DIR" "$HORIZON_STATE"
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

INSIGHTS="$AUTOMATION_DIR/public/data/insights.json"
if [[ ! -s "$INSIGHTS" && -s "$APP_DIR/current/data/insights.json" ]]; then
  cp "$APP_DIR/current/data/insights.json" "$INSIGHTS"
fi
if [[ ! -x "$HORIZON_VENV/bin/python" ]]; then
  echo "Horizon 虚拟环境不存在：$HORIZON_VENV" >&2
  /usr/bin/python3 scripts/horizon_bridge.py \
    --output "$INSIGHTS" \
    --mark-stale \
    --reason "Horizon virtual environment is unavailable"
elif [[ ! -d "$HORIZON_DIR/.git" ]] || \
  [[ "$(git -C "$HORIZON_DIR" rev-parse HEAD 2>/dev/null || true)" != "$HORIZON_COMMIT" ]]; then
  echo "Horizon 代码版本不符合固定提交：$HORIZON_COMMIT" >&2
  /usr/bin/python3 scripts/horizon_bridge.py \
    --output "$INSIGHTS" \
    --mark-stale \
    --reason "Horizon pinned version is unavailable"
else
  set +e
  "$HORIZON_VENV/bin/python" scripts/horizon_bridge.py \
    --report "$REPORT" \
    --output "$INSIGHTS" \
    --config "$AUTOMATION_DIR/config/horizon.json" \
    --horizon-path "$HORIZON_DIR" \
    --state-dir "$HORIZON_STATE"
  HORIZON_STATUS=$?
  set -e
  if [[ "$HORIZON_STATUS" -ne 0 ]]; then
    echo "Horizon 增强失败，保留上一轮精选并标记 stale。" >&2
    /usr/bin/python3 scripts/horizon_bridge.py \
      --output "$INSIGHTS" \
      --mark-stale \
      --reason "Horizon pipeline failed in the current refresh"
  fi
fi

/usr/bin/python3 - "$INSIGHTS" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
if payload.get("status") not in {"fresh", "stale"}:
    raise SystemExit("insights.json status invalid")
if not isinstance(payload.get("items"), list) or not isinstance(payload.get("editions"), list):
    raise SystemExit("insights.json structure invalid")
PY

/usr/bin/node scripts/publish-daily.mjs

for target in "$APP_DIR/current/data" /var/www/trends/data; do
  install -d -m 0755 "$target"
  install -m 0644 public/data/trends.json "$target/trends.json.new"
  install -m 0644 public/data/posts.json "$target/posts.json.new"
  install -m 0644 public/data/insights.json "$target/insights.json.new"
  mv "$target/trends.json.new" "$target/trends.json"
  mv "$target/posts.json.new" "$target/posts.json"
  mv "$target/insights.json.new" "$target/insights.json"
done

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 服务器采集与发布完成。"
