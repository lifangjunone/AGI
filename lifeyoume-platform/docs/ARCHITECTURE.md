# LifeYouMe Subdomain Platform Architecture

## Boundaries

```text
Internet
   |
   v
TLS / host routing / rate limits
   |
   +-- lifeyoume.icu ---------- portal :8800
   +-- ops.lifeyoume.icu ------ operations :8801
   +-- auth.lifeyoume.icu ----- identity :8802
   +-- billing.lifeyoume.icu -- billing :8803
   +-- audit.lifeyoume.icu ---- audit product :8787
   `-- easysay.lifeyoume.icu -- reserved :8788
```

The four platform roles run as separate systemd instances. Every product runs
as a separate process with its own deployment, configuration, health endpoint,
logs, and data store.

## Control plane

The operations service is the control plane. Its current production contract
contains:

- product registration;
- lifecycle visibility;
- private server-side health checks;
- runtime latency;
- authenticated operator access.

Future contracts must be added as versioned APIs:

- `POST /platform/v1/events` for product events;
- `GET /platform/v1/metrics` for product aggregates;
- `POST /platform/v1/releases` for deployment metadata;
- billing entitlements issued by `billing.lifeyoume.icu`;
- OIDC authorization issued by `auth.lifeyoume.icu`.

The operations service must never connect directly to a product database.

## Product onboarding

1. Allocate a stable product ID and subdomain.
2. Allocate an unused loopback port.
3. Deploy the product under its own Unix user and systemd service.
4. Expose a cheap `GET /healthz` or `GET /api/health` endpoint.
5. Register it in `config/products.json` as `reserved`.
6. Add its Nginx virtual host and certificate name.
7. Verify process, HTTPS, logs, and rollback independently.
8. Change lifecycle to `live` only after public acceptance passes.

Allowed lifecycle values:

```text
reserved -> live -> paused -> retired
```

## Security rules

- Only Nginx listens on public ports 80 and 443.
- Services listen on `127.0.0.1`.
- Product health URLs are restricted to loopback HTTP to prevent SSRF.
- Operations sessions are HMAC signed, short-lived, `HttpOnly`, `Secure`, and
  `SameSite=Strict`.
- Operator passwords use PBKDF2-HMAC-SHA256 with a per-password random salt.
- Payment providers remain disabled until signed merchant credentials exist.
- Reserved products are never presented as available.

## Failure isolation

- Restarting one product does not restart the platform or another product.
- A product outage changes only its runtime state in operations.
- A reserved or offline product cannot make the portal unavailable.
- Nginx configuration is validated before reload and backed up before changes.
- Product databases remain under product ownership and are not copied into the
  platform.

## Compatibility

The root domain now serves the product portal. Existing audit paths remain
proxied to the audit product so old report, comparison, badge, RSS, sitemap,
and payment callback links continue to work. New audit URLs and canonical
metadata use `https://audit.lifeyoume.icu`.
