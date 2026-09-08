#!/bin/bash
set -euo pipefail
umask 077

APP_ROOT="/data/app/opportunity-factory"
SOURCE_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

command -v python3 >/dev/null
command -v systemctl >/dev/null
command -v docker >/dev/null

if ss -ltn | awk '{print $4}' | grep -Eq '(^|:)8787$'; then
  if ! systemctl is-active --quiet opportunity-factory; then
    echo "Port 8787 is occupied by an unrelated service; refusing to overwrite it." >&2
    exit 1
  fi
fi

id opportunity >/dev/null 2>&1 || useradd --system --home-dir "$APP_ROOT" --shell /usr/sbin/nologin opportunity
mkdir -p "$APP_ROOT/service/assets" "$APP_ROOT/runtime" "$APP_ROOT/deploy" "$APP_ROOT/private" "/data/app/backups"
chmod 0755 "$APP_ROOT" "$APP_ROOT/service" "$APP_ROOT/service/assets" "$APP_ROOT/deploy"
chmod 0700 "$APP_ROOT/runtime" "$APP_ROOT/private"
chmod 0700 "/data/app/backups"

if [[ -d "$APP_ROOT/service" && -n "$(find "$APP_ROOT/service" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  tar -C "$APP_ROOT" -czf "/data/app/backups/opportunity-factory-$STAMP.tgz" service .env 2>/dev/null || true
fi

install -m 0755 "$SOURCE_DIR/service/autonomous_factory.py" "$APP_ROOT/service/autonomous_factory.py"
install -m 0644 "$SOURCE_DIR/service/assets/favicon-64.png" "$APP_ROOT/service/assets/favicon-64.png"
install -m 0644 "$SOURCE_DIR/service/assets/apple-touch-icon.png" "$APP_ROOT/service/assets/apple-touch-icon.png"
install -m 0644 "$SOURCE_DIR/deploy/docker-proxy-compose.yml" "$APP_ROOT/deploy/docker-proxy-compose.yml"
install -m 0644 "$SOURCE_DIR/deploy/proxy.conf" "$APP_ROOT/deploy/proxy.conf"
install -m 0644 "$SOURCE_DIR/deploy/empty.conf" "$APP_ROOT/deploy/empty.conf"
install -m 0755 "$SOURCE_DIR/deploy/renew-certificate.sh" "$APP_ROOT/deploy/renew-certificate.sh"
if [[ ! -f "$APP_ROOT/.env" ]]; then
  ADMIN_PASSWORD="$(openssl rand -hex 24)"
  IP_HASH_SALT="$(openssl rand -hex 24)"
  sed \
    -e "s/replace-with-a-long-random-password/$ADMIN_PASSWORD/" \
    -e "s/replace-with-a-long-random-salt/$IP_HASH_SALT/" \
    "$SOURCE_DIR/deploy/opportunity-factory.env.example" > "$APP_ROOT/.env"
  chmod 0600 "$APP_ROOT/.env"
  printf 'Admin password: %s\n' "$ADMIN_PASSWORD" > "/root/opportunity-factory-credentials.txt"
  chmod 0600 "/root/opportunity-factory-credentials.txt"
fi

chown -R opportunity:opportunity "$APP_ROOT/runtime"
chown -R opportunity:opportunity "$APP_ROOT/private"
chown root:opportunity "$APP_ROOT/.env"
chmod 0640 "$APP_ROOT/.env"
install -m 0644 "$SOURCE_DIR/deploy/opportunity-factory.service" /etc/systemd/system/opportunity-factory.service

systemctl daemon-reload
systemctl enable opportunity-factory
systemctl restart opportunity-factory

for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:8787/healthz; then
    break
  fi
  if [[ "$attempt" -eq 15 ]]; then
    systemctl status opportunity-factory --no-pager
    exit 1
  fi
  sleep 1
done

if docker ps --format '{{.Names}}' | grep -qx english_learning_frontend; then
  (cd /data/app/english-learning && docker compose down)
fi
(cd "$APP_ROOT" && docker compose -f deploy/docker-proxy-compose.yml up -d)
"$APP_ROOT/deploy/renew-certificate.sh"
cat > /etc/cron.d/opportunity-factory-cert <<EOF
17 3 * * * root $APP_ROOT/deploy/renew-certificate.sh >> /var/log/opportunity-factory-cert.log 2>&1
EOF
chmod 0644 /etc/cron.d/opportunity-factory-cert

curl --fail --silent https://audit.lifeyoume.icu/healthz
echo
echo "Opportunity Factory installed with HTTPS at https://audit.lifeyoume.icu."
