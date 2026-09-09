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
   +-- lifeyoume.icu/video/ --- content studio :4321
   `-- lifeyoume.icu/vault/ --- static privacy vault
```

The four platform roles run as separate systemd instances. Every product runs
as a separate process with its own deployment, configuration, health endpoint,
logs, and data store.

## Control plane

The operations service is the control plane. Its current production contract
contains:

- Catalog Schema v2 product registration;
- lifecycle visibility;
- public, lab, and internal catalog visibility;
- platform, audience, capability, CTA, and visual metadata;
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

1. Allocate a stable product ID and truthful public visibility.
2. Register audience, category, platforms, capabilities, CTA, and optional visual.
3. For an online product, allocate an isolated route or subdomain.
4. For a server product, expose a cheap loopback health endpoint.
5. Register the product in `config/products.json` with its real lifecycle.
6. Add its Nginx route only when a public runtime exists.
7. Verify process, HTTPS, links, responsive UI, logs, and rollback independently.
8. Change lifecycle to `live` only after public acceptance passes.

Allowed lifecycle values:

```text
preview -> beta -> live -> paused -> retired
```

`internal` is reserved for platform components. A live static product may omit
`health_url`; the portal then reports its declared availability without
fabricating a runtime check. Desktop and lab products may omit `public_url`.

## Security rules

- Only Nginx listens on public ports 80 and 443.
- Services listen on `127.0.0.1`.
- Configured product health URLs are restricted to loopback HTTP to prevent SSRF.
- The public catalog API omits health URLs, owners, and internal-only components.
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
