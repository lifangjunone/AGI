#!/bin/bash
set -euo pipefail

APP="/data/app/lifeyoume-platform"
CERTS="/data/app/english-learning/certs"
LE="/data/app/opportunity-factory/letsencrypt"
WEBROOT="/data/app/opportunity-factory/certbot/www"
DOMAINS=(
  lifeyoume.icu
  www.lifeyoume.icu
  ops.lifeyoume.icu
  auth.lifeyoume.icu
  billing.lifeyoume.icu
  audit.lifeyoume.icu
  easysay.lifeyoume.icu
)

mkdir -p "$LE" "$WEBROOT" "$CERTS"
domain_args=()
for domain in "${DOMAINS[@]}"; do
  domain_args+=("-d" "$domain")
done

docker run --rm \
  -v "$LE:/etc/letsencrypt" \
  -v "$WEBROOT:/var/www/certbot" \
  certbot/certbot:latest certonly \
  --cert-name platform.lifeyoume.icu \
  --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring \
  "${domain_args[@]}"

install -m 0644 \
  "$LE/live/platform.lifeyoume.icu/fullchain.pem" \
  "$CERTS/platform.lifeyoume.icu.pem"
install -m 0600 \
  "$LE/live/platform.lifeyoume.icu/privkey.pem" \
  "$CERTS/platform.lifeyoume.icu.key"

docker exec opportunity_factory_proxy nginx -t
docker exec opportunity_factory_proxy nginx -s reload
