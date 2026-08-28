#!/bin/bash
set -euo pipefail

APP="/data/app/opportunity-factory"
CERTS="/data/app/english-learning/certs"

mkdir -p "$APP/certbot/www" "$APP/letsencrypt"
docker run --rm \
  -v "$APP/letsencrypt:/etc/letsencrypt" \
  -v "$APP/certbot/www:/var/www/certbot" \
  certbot/certbot:latest certonly \
  --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring \
  -d lifeyoume.icu -d www.lifeyoume.icu

install -m 0644 "$APP/letsencrypt/live/lifeyoume.icu/fullchain.pem" "$CERTS/www.lifeyoume.icu.pem"
install -m 0600 "$APP/letsencrypt/live/lifeyoume.icu/privkey.pem" "$CERTS/www.lifeyoume.icu.key"
docker exec opportunity_factory_proxy nginx -t
docker exec opportunity_factory_proxy nginx -s reload
