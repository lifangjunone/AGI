#!/bin/sh
set -eu

lock_file=/run/lock/lifeyoume-maas-cert.lock
exec 9>"$lock_file"
flock -n 9 || exit 0

docker run --rm \
  -v /data/app/opportunity-factory/letsencrypt:/etc/letsencrypt \
  -v /data/app/opportunity-factory/certbot/www:/var/www/certbot \
  certbot/certbot renew \
  --cert-name maas.lifeyoume.icu \
  --webroot -w /var/www/certbot \
  --non-interactive --quiet

install -o root -g root -m 644 \
  /data/app/opportunity-factory/letsencrypt/live/maas.lifeyoume.icu/fullchain.pem \
  /data/app/english-learning/certs/maas.lifeyoume.icu.pem
install -o root -g root -m 600 \
  /data/app/opportunity-factory/letsencrypt/live/maas.lifeyoume.icu/privkey.pem \
  /data/app/english-learning/certs/maas.lifeyoume.icu.key

docker exec opportunity_factory_proxy nginx -t
docker exec opportunity_factory_proxy nginx -s reload
