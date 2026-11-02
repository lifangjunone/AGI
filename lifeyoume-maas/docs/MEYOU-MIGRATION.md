# MeYou model-control migration

## Target state

MeYou calls:

```text
POST ${MAAS_BASE_URL}/chat/completions
Authorization: Bearer ${MEYOU_MAAS_SERVICE_KEY}
model: lym-chat-quality
```

MeYou no longer owns provider base URLs, upstream model IDs or provider API
keys. `/internal/model-config` must not distribute provider credentials to
Second Me after the cutover.

## Production state

MeYou now supports an explicit server-side configuration:

```text
MODEL_PROVIDER_MODE=maas
MAAS_BASE_URL=https://maas.lifeyoume.icu/v1
MEYOU_MAAS_MODEL_ID=lym-chat-quality
MEYOU_MAAS_SERVICE_KEY=<server Secret only>
MODEL_TIMEOUT_MS=120000
```

Production switched to this configuration on 2026-10-30. The default/`legacy`
mode remains the rollback path and retains database resolution. MaaS mode bypasses the
legacy credential store and fails closed on missing credentials or invalid
configuration; it does not silently fall back. JSON and thinking options remain
part of the request contract and require provider compatibility checks.

The admin UI offers a MaaS application link and explicitly states the current
mode. In MaaS mode, legacy save/test/reveal/status operations return 409 and are
hidden from the model workspace. The legacy configuration sync endpoint returns
410 even with a valid sync token; other products must have independent MaaS
application keys. It must not redistribute MeYou's application key.

The authenticated model-config GET also bypasses the legacy database in MaaS
mode: it returns the active logical alias, gateway URL and a non-revealing
server-credential label, with no-store headers. Missing MaaS configuration
returns 503 rather than reading/decrypting old supplier credentials. It does not
claim inference verification merely because environment configuration exists.

Release scope verification on 2026-10-30 found the production image contains
compiled files only and no `MODEL_PROVIDER_MODE` branch. Its Worker-compatible
job routes are discovery, discovery-due, plaza and plaza-continuous. The local
server/web files also contain unrelated unshipped business changes; do not
deploy a whole local build as a MaaS-only release. Preserve the fixed production
baseline and independently verify scoped server/Admin changes before cutover.

The isolated MeYou → MaaS HTTP → mock-provider integration test verifies JSON,
thinking/temperature forwarding, logical-to-upstream model routing, usage,
401/403/502 behavior and no legacy fallback. This is not a real-provider shadow
comparison.

The production API now uses the scoped light-Admin candidate image. Its
dedicated application key is stored only in MeYou's root-only API Secret file.
The API joins the MeYou application network and the existing private
`lifeyoume-maas_default` network, and resolves the gateway as
`http://maas:43280/v1`. Worker does not receive the MaaS key.

## Read-only preflight and execution topology

Worker dispatches discovery/plaza work to MeYou API `/internal/jobs/*`; only API
resolves the model and calls MaaS. API loads `private/api.env` plus API-only
`private/maas.env`; Worker loads only `private/api.env`. Do not introduce a
second provider client in Worker.
Keep `API_INTERNAL_URL` reachable from the Worker container and its request
timeout greater than the API model timeout. A successful `/health` probe alone
does not prove Worker token authentication or job execution.

The new API release includes a safe, non-inference preflight:

```bash
# Run inside the API container, inheriting its server-side environment.
node apps/api/dist/maas-preflight-cli.js
# Local development with environment already loaded:
npm run maas:preflight -w @meyou/api
```

This checks opt-in configuration and `GET ${MAAS_BASE_URL}/models` with the
MeYou application key. It rejects redirects, never logs raw errors/remote
bodies/credentials, and exits nonzero unless the target model is visible.
`model_authorized` means enabled and granted in the model list, not that its
Deployment/provider is healthy or JSON/thinking inference is compatible.
Every result explicitly includes `inferenceVerified: false`.
It does not create keys, change grants, touch the database or execute jobs.

The earlier 2026-10-30 read-only production verification found MeYou on the two
`migrated-20261029` fixed images, with `MODEL_PROVIDER_MODE` absent (legacy),
no MeYou MaaS key, no compiled MaaS configuration module and
`MODEL_TIMEOUT_MS=1800000`. The new preflight and migration code are local only.
That snapshot is historical: the API was subsequently published with the
scoped release, independent key and 120,000 ms timeout. The distinct fixed
Worker image was preserved.

## Production gates

### Synthetic inference gate

The shadow tool uses the same bounded, redirect-rejecting transport as MeYou
production model calls, without importing the business database or starting jobs:

```bash
npm run maas:shadow -w @meyou/api -- --confirm-inference
# Compiled, inside the API container with server-side configuration:
node apps/api/dist/maas-shadow-cli.js --confirm-inference
```

It requires explicit confirmation because it sends up to two potentially paid
synthetic inference requests, with JSON mode and thinking disabled/enabled.
It stops after the first failure. Only fixed result codes, latency and variant
are printed; no key, prompt output or raw supplier errors are returned.
`contract_verified` proves only these two synthetic JSON contracts, not workload
success rate, business job compatibility, reasoning behavior or a full shadow
comparison against legacy. MaaS usage may record the two calls; this tool does
not suppress metering or mutate application permissions.

The tool was first tested through an isolated MeYou → MaaS → mock supplier HTTP
chain. It was then run inside the final production API container with MeYou's
dedicated key. The read-only model authorization returned `model_authorized`;
both paid synthetic variants returned `contract_verified` with
`inferenceVerified:true` (thinking off 866 ms, thinking on 709 ms).

1. Configure the current provider credential and upstream model in MaaS.
2. Create a `meyou` service key and store it only in MeYou's server secret.
3. Run shadow requests without exposing their results or creating business side
   effects.
4. Compare success rate, structured JSON behavior and latency.
5. Switch MeYou with `MODEL_PROVIDER_MODE=maas`.
6. Create a separate `second-me` service key and migrate Second Me directly.
7. Redirect the model section of `https://meyou.lifeyoume.icu/admin` to the
   MaaS application page; keep MeYou business audit inside MeYou.
8. Freeze the legacy `model_configurations` table, then retire writes after the
   rollback window.

Rollback selects `MODEL_PROVIDER_MODE=legacy`. MaaS data is not deleted or
overwritten during rollback.

## Production-baseline candidate artifact (not deployed)

`meyou-agent-network-api:maas-candidate-20261030` is built from the fixed
production API image, not the dirty workspace build. Build inputs and isolated
verification script are retained on Tencent at
`/data/app/meyou-agent-network/releases/maas-candidate-20261030`.
Only server/model plus six MaaS helper modules differ; the other API files,
Web, Worker and shared modules match baseline directory hashes.

The candidate passed network-isolated admin/config/sync gates and synthetic
HTTP model/JSON/thinking checks. It still contains the original Web UI and has
no production MaaS key. Complete the scoped Admin UI changes, genuine supplier
shadow comparison and authenticated Worker job compatibility before rollout.
The production Compose and running image have not been switched.

The subsequent `maas-ui-candidate-20261030` image adds an independently built
Admin entry (`npm run build:admin -w @meyou/web`). Only exact admin/login paths
use this entry; original business Web assets remain unchanged. Its build inputs
are retained under the corresponding Tencent releases directory. Container
entry-routing tests and built-page browser checks passed, but genuine supplier,
dedicated credentials and Worker business execution gates remain unverified.

`maas-ui-light-candidate-20261030` was the retained candidate used for the
production cutover. It keeps the
same production-baseline scope and changes only the independent Admin bundle to
a white, light-gray and indigo visual system. Desktop, 375px mobile and
landscape browser regressions passed without horizontal overflow. The isolated
container passed exact Admin routing, MaaS read/write isolation, all four
existing Worker route contracts, and synthetic HTTP checks through the
production model client and both thinking shadow variants. Hash inventories
confirm that non-target API files, original business Web assets, Worker and
shared output still match the fixed production image. Before cutover it passed
the dedicated-key, genuine-supplier-shadow and authenticated Worker contract
gates. The production Admin then passed real API browser checks at desktop,
375px mobile and landscape sizes. The fixed Worker image was not changed.

## Cutover and rollback record

- Cutover image:
  `meyou-agent-network-api:maas-ui-light-candidate-20261030`
  (`sha256:bcf5a52d3363ce7883867e45e546441bf0bee5d8b7f647e31ce0e040d76f3b60`).
- Production Compose hash after cutover:
  `a3a2ec18b52a073c4782879734e0bf8470a9dc290c51e819e68a6b174b9d2b93`.
- MeYou configuration backup:
  `/data/app/meyou-agent-network/backups/20261030143000`.
- MaaS state backup:
  `/data/app/lifeyoume-maas/backups/maas-data-before-meyou-20261030143000.tar.gz`.
- Rollback restores the backed-up Compose/API environment and the
  `meyou-agent-network-api:migrated-20261029` API image. Do not change the
  Worker image, revoke/delete MaaS state, or start the retired Aliyun stack.
