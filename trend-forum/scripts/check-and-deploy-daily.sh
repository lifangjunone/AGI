#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="/Users/bytedance/Library/Application Support/Technology Exploration Agent/reports"
STATE_DIR="/Users/bytedance/Library/Application Support/Trend Forum"
LOCK_DIR="$STATE_DIR/daily-deploy.lock"
TODAY="$(TZ=Asia/Shanghai date +%F)"
REPORT="$REPORT_DIR/$TODAY.json"
MAX_ATTEMPTS="${TREND_FORUM_MAX_ATTEMPTS:-31}"
RETRY_SECONDS="${TREND_FORUM_RETRY_SECONDS:-60}"
NODE_BIN="${NODE_BIN:-$PROJECT_DIR/runtime/node}"
REMOTE="${REMOTE:-aliyun}"

mkdir -p "$STATE_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 已有 Trend Forum 发布任务运行，本次跳过。"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 开始检查今日 Technology Exploration 报告。"
attempt=1
while [[ ! -s "$REPORT" && "$attempt" -le "$MAX_ATTEMPTS" ]]; do
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 第 $attempt/$MAX_ATTEMPTS 次：今日报告尚未生成。"
  if [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
    sleep "$RETRY_SECONDS"
  fi
  attempt=$((attempt + 1))
done

if [[ ! -s "$REPORT" ]]; then
  echo "[$(TZ=Asia/Shanghai date '+%F %T')] 等待超时，保留线上旧版本：$REPORT" >&2
  exit 1
fi

/usr/bin/python3 - "$REPORT" "$TODAY" <<'PY'
import json
import sys

path, expected_date = sys.argv[1:3]
with open(path, encoding="utf-8") as handle:
    report = json.load(handle)

if not str(report.get("generated_at", "")).startswith(expected_date):
    raise SystemExit("报告 generated_at 与当天日期不一致，拒绝发布")
if not isinstance(report.get("news_boards"), list) or not report["news_boards"]:
    raise SystemExit("报告缺少有效榜单，拒绝发布")
PY

echo "[$(TZ=Asia/Shanghai date '+%F %T')] 已找到并验证今日报告，开始部署。"
cd "$PROJECT_DIR"
"$NODE_BIN" scripts/sync-technology-report.mjs
"$NODE_BIN" scripts/publish-daily.mjs

REMOTE_STAGE="/tmp/trend-forum-daily-$TODAY"
/usr/bin/ssh "$REMOTE" "rm -rf '$REMOTE_STAGE' && install -d -m 0755 '$REMOTE_STAGE'"
/usr/bin/scp public/data/trends.json public/data/posts.json "$REMOTE:$REMOTE_STAGE/"
/usr/bin/ssh "$REMOTE" "set -e
  test -s '$REMOTE_STAGE/trends.json'
  test -s '$REMOTE_STAGE/posts.json'
  install -d -m 0755 /data/app/trend-forum/current/data /var/www/trends/data
  install -m 0644 '$REMOTE_STAGE/trends.json' /data/app/trend-forum/current/data/trends.json.new
  install -m 0644 '$REMOTE_STAGE/posts.json' /data/app/trend-forum/current/data/posts.json.new
  install -m 0644 '$REMOTE_STAGE/trends.json' /var/www/trends/data/trends.json.new
  install -m 0644 '$REMOTE_STAGE/posts.json' /var/www/trends/data/posts.json.new
  mv /data/app/trend-forum/current/data/trends.json.new /data/app/trend-forum/current/data/trends.json
  mv /data/app/trend-forum/current/data/posts.json.new /data/app/trend-forum/current/data/posts.json
  mv /var/www/trends/data/trends.json.new /var/www/trends/data/trends.json
  mv /var/www/trends/data/posts.json.new /var/www/trends/data/posts.json
  rm -rf '$REMOTE_STAGE'"
echo "[$(TZ=Asia/Shanghai date '+%F %T')] Trend Forum 今日版本已发布。"
