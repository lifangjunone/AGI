# LifeYouMe Platform

产品类型：共享平台服务
运行形态：macOS/Linux 本地服务、systemd、Nginx
维护边界：只负责产品注册、门户、运营和共享服务边界，不直接导入产品业务代码。

Shared control plane for independently deployed products under `lifeyoume.icu`.

## Service boundaries

| Host | Role | Local port |
|---|---|---:|
| `lifeyoume.icu` | Product portal | 8800 |
| `ops.lifeyoume.icu` | Protected operations console | 8801 |
| `auth.lifeyoume.icu` | Identity service boundary | 8802 |
| `billing.lifeyoume.icu` | Billing service boundary | 8803 |
| `audit.lifeyoume.icu` | Independent audit product | 8787 |
| `lifeyoume.icu/video/` | FRAME/60 / 智助乖乖 | 4321 |
| `lifeyoume.icu/vault/` | Personal Privacy Vault | Nginx static |

The platform never imports product code or reads product databases. Products
join through `config/products.json`, private health endpoints, and future
versioned event APIs.

## Public portal

The portal now provides:

- `/` - editorial product showroom with real product imagery and selected products;
- `/products` - searchable, category-filtered catalog;
- `/products/<id>` - standardized product detail pages;
- `/api/v1/products` - public Catalog Schema v2 response without private health URLs;
- an operations-only view that also includes internal platform components.

The public catalog currently contains 14 products and lab projects across AI
creation, learning, AI engineering, privacy tools, and enterprise services.
Internal components remain registered for operations but are excluded from the
public portal.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, onboarding,
security rules, failure isolation, and compatibility behavior.

## Local verification

```bash
python3 -m unittest discover -s tests
bash -n deploy/*.sh
```

Run one service:

```bash
SERVICE_ROLE=portal python3 platform/app.py
```

The operations role additionally requires `SESSION_SECRET` and
`OPS_ADMIN_PASSWORD_HASH`.

## Production deployment

```bash
./deploy/push-server.sh
```

`install-server.sh` generates the first operations password on the server at:

```text
/root/lifeyoume-ops-initial-password.txt
```

Certificate issuance and proxy activation are separate steps so the existing
production site remains available until every new platform service is healthy.

## Product registration contract

Catalog Schema v2 declares:

- stable product ID;
- name, tagline, summary, audience, category and platforms;
- lifecycle, availability, visibility and featured placement;
- capability list, CTA copy, accent and optional real product visual;
- optional public HTTPS URL;
- optional private loopback health URL.

Only `live` products with a private health URL are actively checked. Static
products can be marked live without a fabricated health endpoint. Products
without a public URL receive a truthful unavailable action instead of a fake
online link.

## Production routing

`lifeyoume.icu` proxies the portal to `127.0.0.1:8800`.
`audit.lifeyoume.icu` remains isolated on `127.0.0.1:8787`, while historical
audit paths on the root domain continue to proxy to the audit service.
`/video/` and `/vault/` preserve their existing production routes.
