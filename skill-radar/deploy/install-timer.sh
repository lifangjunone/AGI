#!/bin/bash
set -euo pipefail

SOURCE="${1:-/data/app/skill-radar/current}"
APP="/data/app/skill-radar"
WEB="/var/www/skills"

for required in \
  scripts/collect-skills.mjs \
  deploy/skill-radar-update.service \
  deploy/skill-radar-update.timer \
  deploy/skill-radar-web.service; do
  [[ -f "$SOURCE/$required" ]] || {
    echo "Missing $SOURCE/$required" >&2
    exit 1
  }
done

id skillradar >/dev/null 2>&1 ||
  useradd --system --home "$APP" --shell /usr/sbin/nologin skillradar

install -d -o skillradar -g skillradar -m 0750 "$APP/data" "$SOURCE/data" "$SOURCE/public/data"
chown -R skillradar:skillradar "$SOURCE/data" "$SOURCE/public/data"
install -o root -g root -m 0644 "$SOURCE/deploy/skill-radar-update.service" /etc/systemd/system/skill-radar-update.service
install -o root -g root -m 0644 "$SOURCE/deploy/skill-radar-update.timer" /etc/systemd/system/skill-radar-update.timer
install -o root -g root -m 0644 "$SOURCE/deploy/skill-radar-web.service" /etc/systemd/system/skill-radar-web.service

systemctl daemon-reload
systemctl enable --now skill-radar-web.service
systemctl enable --now skill-radar-update.timer
systemctl start skill-radar-update.service
systemctl is-active --quiet skill-radar-update.timer
systemctl is-failed --quiet skill-radar-update.service && exit 1 || true
echo "Skill Radar timer installed; next run:"
systemctl list-timers skill-radar-update.timer --no-pager
