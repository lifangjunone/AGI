#!/bin/bash
set -euo pipefail
umask 077

SOURCE_DIR="${1:?source directory is required}"
DOMAIN="${2:?domain is required}"
APP_ROOT="/opt/opportunity-factory"
BACKUP_ROOT="/opt/backups/opportunity-factory"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Invalid domain." >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 nginx certbot python3-certbot-nginx curl openssl

id opportunity >/dev/null 2>&1 || \
  useradd --system --home-dir "$APP_ROOT" --shell /usr/sbin/nologin opportunity
mkdir -p "$APP_ROOT/service" "$APP_ROOT/runtime" "$BACKUP_ROOT"
chmod 0755 "$APP_ROOT" "$APP_ROOT/service"
chmod 0700 "$APP_ROOT/runtime" "$BACKUP_ROOT"

if [[ -f "$APP_ROOT/service/autonomous_factory.py" ]]; then
  tar -C "$APP_ROOT" -czf "$BACKUP_ROOT/release-$STAMP.tgz" \
    service .env 2>/dev/null || true
fi

install -m 0755 "$SOURCE_DIR/service/autonomous_factory.py" \
  "$APP_ROOT/service/autonomous_factory.py"
install -m 0755 "$SOURCE_DIR/service/poc_pay_skill.py" \
  "$APP_ROOT/service/poc_pay_skill.py"
python3 -m venv "$APP_ROOT/.venv-pay"
"$APP_ROOT/.venv-pay/bin/pip" install --disable-pip-version-check --quiet \
  -r "$SOURCE_DIR/requirements-pay-skill.txt"

if [[ ! -f "$APP_ROOT/.env" ]]; then
  ADMIN_PASSWORD="$(openssl rand -hex 24)"
  IP_HASH_SALT="$(openssl rand -hex 24)"
  sed \
    -e "s#OPPORTUNITY_FACTORY_HOME=.*#OPPORTUNITY_FACTORY_HOME=$APP_ROOT/runtime#" \
    -e "s#PUBLIC_URL=.*#PUBLIC_URL=https://$DOMAIN#" \
    -e "s/replace-with-a-long-random-password/$ADMIN_PASSWORD/" \
    -e "s/replace-with-a-long-random-salt/$IP_HASH_SALT/" \
    "$SOURCE_DIR/deploy/opportunity-factory.env.example" > "$APP_ROOT/.env"
  printf 'Admin password: %s\n' "$ADMIN_PASSWORD" \
    > /root/opportunity-factory-credentials.txt
  chmod 0600 /root/opportunity-factory-credentials.txt
fi

chown -R opportunity:opportunity "$APP_ROOT/runtime"
chown root:opportunity "$APP_ROOT/.env"
chmod 0640 "$APP_ROOT/.env"

cat > /etc/systemd/system/opportunity-factory.service <<EOF
[Unit]
Description=Opportunity Factory
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=opportunity
Group=opportunity
WorkingDirectory=$APP_ROOT
EnvironmentFile=$APP_ROOT/.env
ExecStart=/usr/bin/python3 $APP_ROOT/service/autonomous_factory.py serve
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_ROOT/runtime
CapabilityBoundingSet=
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/opportunity-factory <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 128k;
    location /api/pay-skills/ {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 120s;
    }
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
EOF
ln -sfn /etc/nginx/sites-available/opportunity-factory \
  /etc/nginx/sites-enabled/opportunity-factory
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now opportunity-factory
if grep -q '^AIPAY_APP_ID=' "$APP_ROOT/.env"; then
  cat > /etc/systemd/system/poc-pay-skill.service <<EOF
[Unit]
Description=Opportunity Factory Alipay A2M Pay Skill
After=network-online.target opportunity-factory.service
Wants=network-online.target

[Service]
Type=simple
User=opportunity
Group=opportunity
WorkingDirectory=$APP_ROOT
EnvironmentFile=$APP_ROOT/.env
ExecStart=$APP_ROOT/.venv-pay/bin/python $APP_ROOT/service/poc_pay_skill.py
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_ROOT/runtime
CapabilityBoundingSet=
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now poc-pay-skill
fi
nginx -t
systemctl enable --now nginx
curl --fail --silent http://127.0.0.1:8787/healthz

certbot --nginx --non-interactive --agree-tos \
  --register-unsafely-without-email \
  --redirect -d "$DOMAIN"

curl --fail --silent "https://$DOMAIN/healthz"
echo
echo "Installed at https://$DOMAIN"
echo "Edit secrets in $APP_ROOT/.env, then restart opportunity-factory."
