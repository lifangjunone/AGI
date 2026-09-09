# LifeYouMe Unified Identity

`lifeyoume-platform` is the only account and credential authority for
LifeYouMe products. Product projects keep their own business data, but do not
create parallel end-user password stores.

## Production endpoints

| Endpoint | Purpose |
| --- | --- |
| `https://auth.lifeyoume.icu/login` | Browser login |
| `https://auth.lifeyoume.icu/register` | Account registration |
| `https://auth.lifeyoume.icu/account` | Account and global logout |
| `GET /api/v1/me` | Resolve the current browser or bearer session |
| `GET /api/v1/session/verify` | Nginx `auth_request` verification |
| `GET /api/v1/access/check` | Dynamic per-product login policy check |
| `POST /api/v1/device/start` | Start desktop/mobile device authorization |
| `POST /api/v1/device/token` | Poll and exchange an approved device code |
| `GET/POST /device` | Browser approval page |

## Browser products

Browser login creates an opaque `lym_sso_session` cookie with:

- `Domain=.lifeyoume.icu`;
- `Path=/`;
- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- a server-side revocable session row.

Nginx uses `/api/v1/session/verify` as an internal `auth_request` endpoint.
Only product entry pages are gated. Payment notifications, WeChat callbacks,
public reports, health checks, and static assets remain independently routed.

Products may call `GET https://auth.lifeyoume.icu/api/v1/me` when they need the
stable LifeYouMe user ID. Product databases should store that ID as an external
owner key and must not copy the user's password hash.

## Desktop, Tauri, PWA, and mini-program clients

Non-browser clients use a device authorization flow:

1. `POST /api/v1/device/start` with the registered product `client_id`.
2. Display the returned `user_code` and open `verification_uri_complete`.
3. The user signs in through the system browser and approves the device.
4. Poll `POST /api/v1/device/token` at the returned interval.
5. Store the opaque bearer token in the operating system credential store.
6. Resolve the account through `GET /api/v1/me` with `Authorization: Bearer`.

Desktop and mobile clients never collect the central account password. Access
tokens are scoped to the requesting product ID, expire after 30 days, and can
be revoked centrally.

## Data model

The SQLite identity database contains:

- users;
- revocable browser sessions;
- short-lived device authorization codes;
- product-scoped bearer access tokens.

The production database lives outside the application release directory at
`/var/lib/lifeyoume-platform/auth.db`. Passwords use PBKDF2-HMAC-SHA256 with
310,000 iterations and a per-user random salt.

## Product migration rule

Every product README must identify its integration mode:

- `Web SSO gateway` for public browser entrypoints;
- `Device authorization` for Electron, Tauri, native mobile, PWA, and
  mini-program clients;
- `Service identity only` for internal components without an end-user UI.

Existing product-specific administrator accounts remain operator credentials,
not end-user accounts. They must not be presented as a second customer login.

## Platform administration

The protected management backend is available at:

```text
https://lifeyoume.icu/admin/
```

It uses the platform operator credential rather than an end-user session.
Administrators can enable or disable users, reset user passwords, and toggle
whether each product requires SSO. Disabling an account or changing its
password revokes all browser sessions and product-scoped access tokens.

Login policy changes are stored in `product_auth_policies` and checked on each
product entry request. The default is `login_required = true`. All management
changes are recorded in `admin_audit`.
