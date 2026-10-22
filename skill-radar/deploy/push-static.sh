#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-aliyun}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
UPLOAD="/tmp/skill-radar-release-$STAMP"
APP="/data/app/skill-radar"

cd "$ROOT"
npm run collect
npm test

ssh "$REMOTE" "install -d -m 0700 '$UPLOAD'"
scp -r \
  "$ROOT/public" \
  "$ROOT/scripts" \
  "$ROOT/deploy" \
  "$ROOT/package.json" \
  "$REMOTE:$UPLOAD/"

ssh "$REMOTE" "set -euo pipefail
  id skillradar >/dev/null 2>&1 || useradd --system --home '$APP' --shell /usr/sbin/nologin skillradar
  install -d -o skillradar -g skillradar -m 0750 '$APP/releases'
  release='$APP/releases/$STAMP'
  mv '$UPLOAD' \"\$release\"
  chown -R skillradar:skillradar \"\$release\"
  ln -sfn \"\$release\" '$APP/current.next'
  mv -Tf '$APP/current.next' '$APP/current'
  install -d -o skillradar -g skillradar -m 0755 /var/www/skills
  rsync -a --delete \"\$release/public/\" /var/www/skills/
  chown -R skillradar:skillradar /var/www/skills
  find /var/www/skills -type d -exec chmod 0755 {} +
  find /var/www/skills -type f -exec chmod 0644 {} +
  test -s /var/www/skills/data/skills.json
  grep -q 'Skill Radar' /var/www/skills/index.html
  if systemctl list-unit-files skill-radar-web.service >/dev/null 2>&1; then
    systemctl restart skill-radar-web.service
    healthy=false
    for _ in \$(seq 1 20); do
      if curl --fail --silent http://127.0.0.1:4398/skills/ | grep -q 'Skill Radar'; then
        healthy=true
        break
      fi
      sleep 0.25
    done
    [[ \"\$healthy\" == true ]] || exit 1
  fi"

echo "Skill Radar files deployed without modifying shared Nginx."
