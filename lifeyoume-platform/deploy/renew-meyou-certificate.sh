#!/bin/bash
set -euo pipefail

CERTS="/data/app/english-learning/certs"
LE="/data/app/opportunity-factory/letsencrypt"
WEBROOT="/data/app/opportunity-factory/certbot/www"
DOMAIN="meyou.lifeyoume.icu"

mkdir -p "$LE" "$WEBROOT" "$CERTS"

docker run --rm \
  -v "$LE:/etc/letsencrypt" \
  -v "$WEBROOT:/var/www/certbot" \
  certbot/certbot:latest certonly \
  --cert-name "$DOMAIN" \
  --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring \
  -d "$DOMAIN"

install -m 0644 \
  "$LE/live/$DOMAIN/fullchain.pem" \
  "$CERTS/$DOMAIN.pem"
install -m 0600 \
  "$LE/live/$DOMAIN/privkey.pem" \
  "$CERTS/$DOMAIN.key"

docker exec opportunity_factory_proxy nginx -t
docker exec opportunity_factory_proxy nginx -s reload
