#!/bin/bash
set -euo pipefail

APP="/data/app/lifeyoume-platform"
SOURCE="${1:-/tmp/lifeyoume-platform-release}"
BACKUP="/data/app/backups/lifeyoume-platform-$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$SOURCE/platform/app.py" || ! -f "$SOURCE/platform/auth_store.py" || ! -f "$SOURCE/config/products.json" ]]; then
  echo "Release bundle is incomplete: $SOURCE" >&2
  exit 1
fi

if id lifeyoume >/dev/null 2>&1; then
  :
else
  useradd --system --home "$APP" --shell /usr/sbin/nologin lifeyoume
fi

if [[ -d "$APP" ]]; then
  install -d -m 0700 "$BACKUP"
  cp -a "$APP/." "$BACKUP/"
fi

install -d -o lifeyoume -g lifeyoume -m 0750 "$APP"
install -d -o lifeyoume -g lifeyoume -m 0750 "$APP/platform" "$APP/platform/assets" "$APP/config" "$APP/deploy"
install -o lifeyoume -g lifeyoume -m 0644 "$SOURCE/platform/app.py" "$APP/platform/app.py"
install -o lifeyoume -g lifeyoume -m 0644 "$SOURCE/platform/auth_store.py" "$APP/platform/auth_store.py"
rm -rf "$APP/platform/assets"
cp -a "$SOURCE/platform/assets" "$APP/platform/assets"
chown -R lifeyoume:lifeyoume "$APP/platform/assets"
install -o lifeyoume -g lifeyoume -m 0644 "$SOURCE/config/products.json" "$APP/config/products.json"
install -o root -g root -m 0644 \
  "$SOURCE/deploy/lifeyoume-platform@.service" \
  /etc/systemd/system/lifeyoume-platform@.service

if [[ ! -f "$APP/.env" ]]; then
  admin_password="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  session_secret="$(openssl rand -hex 32)"
  admin_hash="$(OPS_PASSWORD="$admin_password" python3 -c \
    'import base64,hashlib,os,secrets; iterations=310000; salt=secrets.token_bytes(16); digest=hashlib.pbkdf2_hmac("sha256",os.environ["OPS_PASSWORD"].encode(),salt,iterations,dklen=32); print("pbkdf2_sha256$"+str(iterations)+"$"+base64.urlsafe_b64encode(salt).decode()+"$"+base64.urlsafe_b64encode(digest).decode())')"
  umask 077
  cat > "$APP/.env" <<EOF
HOST=127.0.0.1
PRODUCT_REGISTRY=$APP/config/products.json
SESSION_TTL_SECONDS=28800
SESSION_SECRET=$session_secret
OPS_ADMIN_USER=admin
OPS_ADMIN_PASSWORD_HASH=$admin_hash
PAYMENT_PROVIDER=
PAYMENT_CONFIGURED=false
EOF
  chown lifeyoume:lifeyoume "$APP/.env"
  printf '%s\n' "$admin_password" > /root/lifeyoume-ops-initial-password.txt
  chmod 0600 /root/lifeyoume-ops-initial-password.txt
fi

systemctl daemon-reload
for role in portal ops auth billing; do
  systemctl enable "lifeyoume-platform@$role.service"
  systemctl restart "lifeyoume-platform@$role.service"
done

for port in 8800 8801 8802 8803; do
  healthy=false
  for _ in $(seq 1 20); do
    if curl --fail --silent "http://127.0.0.1:$port/healthz" >/dev/null; then
      healthy=true
      break
    fi
    sleep 0.25
  done
  if [[ "$healthy" != true ]]; then
    echo "Platform service on port $port did not become healthy" >&2
    exit 1
  fi
done
