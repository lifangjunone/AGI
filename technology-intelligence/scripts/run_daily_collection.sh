#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTOR="${TECH_EXPLORER_COLLECTOR:-$SCRIPT_DIR/technology_explorer.py}"
SUPPORT_DIR="/Users/bytedance/Library/Application Support/Technology Exploration Agent"
REPORT_DIR="$SUPPORT_DIR/reports"
STATE_DIR="$SUPPORT_DIR/automation"
LOCK_DIR="$STATE_DIR/daily-collection.lock"
TODAY="$(TZ=Asia/Shanghai date +%F)"
REPORT="$REPORT_DIR/$TODAY.json"

mkdir -p "$REPORT_DIR" "$STATE_DIR"

if [[ -f "$REPORT" ]]; then
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 今日报告已存在，跳过重复采集：$REPORT"
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 已有采集任务运行，本次跳过。"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 开始采集 Technology Exploration 日报。"
/usr/bin/python3 "$COLLECTOR" --collect

if [[ ! -s "$REPORT" ]]; then
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 采集命令已结束，但未生成今日报告：$REPORT" >&2
  exit 1
fi

/usr/bin/python3 - "$REPORT" "$TODAY" <<'PY'
import json
import sys

path, expected_date = sys.argv[1:3]
with open(path, encoding="utf-8") as handle:
    report = json.load(handle)

if not isinstance(report.get("news_boards"), list) or not report["news_boards"]:
    raise SystemExit("今日报告缺少 news_boards，拒绝交给下游发布")
if not str(report.get("generated_at", "")).startswith(expected_date):
    raise SystemExit("今日报告 generated_at 与当天日期不一致")
PY

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 今日采集完成：$REPORT"
