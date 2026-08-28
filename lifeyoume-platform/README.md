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
| `easysay.lifeyoume.icu` | Reserved independent product | 8788 |

The platform never imports product code or reads product databases. Products
join through `config/products.json`, private health endpoints, and future
versioned event APIs.

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

Each product declares:

- stable product ID;
- public HTTPS URL;
- private loopback health URL;
- lifecycle state;
- category and owner.

`reserved` products are shown as unavailable and are never health-checked or
linked as if deployed.
