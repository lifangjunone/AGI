# Repository Concerns

**Review date:** 2026-08-28  
**Scope:** `/Users/bytedance/Desktop/agi`, excluding dependency internals and generated caches except where their presence is itself the concern.  
**Confidence:** `High` means directly observed in source/configuration; `Medium` means the risk depends on deployment or ownership assumptions.

## Highest-priority concerns

### 1. Production builds contain debug telemetry with hard-coded network destinations

- **Risk:** `High` / **Confidence:** `High`
- Product code sends request metadata, local addresses, workspace paths, error text, audio sizes, and accessibility failure snapshots to fixed `http://10.3.223.139:7777` or `http://172.20.10.3:7777` endpoints in `english-speaking-coach/src/lib/api.ts`, `english-speaking-coach/src/lib/nativeConnection.ts`, `english-speaking-coach/src/hooks/useSpeechRecorder.ts`, `english-speaking-coach/server/index.ts`, `english-speaking-coach/server/speech.ts`, and `english-speaking-coach/speech/service.py`.
- DeliveryPilot also sends source-document and workspace paths to `http://127.0.0.1:7777` in `delivery-pilot/src/stores/deliveryStore.ts` and accessibility diagnostics from `delivery-pilot/src-tauri/src/lib.rs`.
- These requests are not feature-gated, authenticated, environment-configured, or guaranteed to be absent from release bundles. Remove them or put them behind an explicit development-only logger with content-free payloads.

### 2. The repository has no authoritative root build, test, CI, or release gate

- **Risk:** `High` / **Confidence:** `High`
- The root `README.md` delegates all verification to independent project directories, while each manifest defines a different toolchain and command in `delivery-pilot/package.json`, `english-speaking-coach/package.json`, `english-foundation/package.json`, `fde-playbook/package.json`, `agent-workforce-console/package.json`, and `delivery-control-center/package.json`.
- No first-party CI workflow or root orchestration file is present. A change can break a cross-product handoff without any repository-level check detecting it.
- Add a supported-version matrix, per-project CI jobs, artifact/security scans, and an integration smoke test for the Technology Exploration -> delivery-control-center/DeliveryPilot handoff.

### 3. Tracked generated delivery data contradicts the repository hygiene contract

- **Risk:** `High` / **Confidence:** `High`
- `README.md` says delivery artifacts, dependency caches, `.workspace`, `.sandbox`, `.dbg`, and build output must not be committed, but the tracked tree contains the generated product under `delivery-control-center/deliveries/OP-20260814072043-869C/system/`, including `data/work-orders.json`, `reports/junit.xml`, a nested `package-lock.json`, and a complete test/e2e system.
- The repository also tracks a 4.8 MB presentation in `delivery-pilot/DeliveryPilot产品介绍-高级宣讲版.pptx` and hundreds of large historical screenshots under `delivery-control-center/docs/screenshots/product-audit/`.
- This increases clone size, stale-code ambiguity, and accidental data disclosure risk. Separate immutable evidence/releases from source or store them outside Git with explicit retention rules.

### 4. Multiple overlapping products have no stated ownership or retirement boundary

- **Risk:** `Medium` / **Confidence:** `Medium` (inference from structure and README claims)
- `delivery-control-center/` and `delivery-pilot/` both implement local AI-assisted delivery orchestration; `technology-intelligence/` and `opportunity-factory/` both implement discovery/matching/automation; `english-speaking-coach/` and `english-foundation/` are separate English-learning products; `fde-playbook/` and `agent-workforce-console/` are small standalone products.
- The root `README.md` presents all nine as active members of one chain, but no deprecation, shared-contract, or ownership document defines which is strategic, experimental, or abandoned.
- Future work is likely to duplicate fixes and interfaces. Add lifecycle/owner metadata and a compatibility contract for every cross-product handoff.

### 5. Fixed local ports and protocol addresses are already inconsistent

- **Risk:** `Medium` / **Confidence:** `High`
- `delivery-pilot/docs/TECH_RADAR_API.md` documents `127.0.0.1:43127`, matching `delivery-pilot/src-tauri/src/technology.rs`, while the advisory integration uses `127.0.0.1:43128` in `delivery-pilot/src-tauri/src/technology_advisory.rs`.
- The two ports may represent different services, but the documentation does not explain the distinction and uses the API port for all examples. This is a likely setup and handoff blocker.
- Define one source of truth for service discovery and generate documentation/examples from it.

### 6. EasySay’s LAN development surface is broadly exposed

- **Risk:** `High` / **Confidence:** `High`
- `english-speaking-coach/vite.config.ts` binds the dev server to `0.0.0.0`, sets `allowedHosts: true`, and proxies API calls over plain HTTP to `localhost:8787`.
- `english-speaking-coach/server/mobileBootstrap.ts` binds an unauthenticated setup server to `0.0.0.0` and serves the local CA certificate; mobile scripts explicitly set `HOST=0.0.0.0` in `english-speaking-coach/scripts/start-native-app-server.sh` and `english-speaking-coach/scripts/start-mobile.sh`.
- This is acceptable only as a tightly controlled development mode. Make exposure opt-in, bind loopback by default, require an explicit trusted LAN mode, and add startup warnings and network tests.

### 7. EasySay sends learner transcripts and profile data to external inference without a durable consent boundary

- **Risk:** `High` / **Confidence:** `High`
- `english-speaking-coach/src/lib/api.ts` sends `profile`, `transcript`, recent records, feedback, and course structure to `/api/feedback`, `/api/evolution/analyze`, `/api/tutor`, and `/api/roleplay`; the server forwards these to configured inference providers in `english-speaking-coach/server/index.ts` and `english-speaking-coach/server/hermesConfig.ts`.
- The README describes privacy and local-model options in `english-speaking-coach/README.md`, but the code does not show user-facing consent, retention, redaction, provider disclosure, or deletion handling for remote inference payloads.
- Treat transcripts as personal data: make remote processing explicit, minimize fields, document retention, and test that local mode never calls cloud endpoints.

### 8. EasySay stores recordings and learning history without retention or quota policy

- **Risk:** `Medium` / **Confidence:** `High`
- `english-speaking-coach/src/lib/storage.ts` stores the full serialized state in `localStorage` and every audio `Blob` in an IndexedDB object store, with no age/size limit or migration policy.
- `clearAllData()` is the only cleanup path. Long-running use can exhaust browser storage, and a shared browser profile can expose transcripts and recordings to another local user.
- Add bounded retention, storage accounting, schema validation/version migration, object-URL revocation, and a clear privacy/data-export/delete workflow.

### 9. Public Opportunity Factory reports are bearer resources with permissive cross-origin access

- **Risk:** `Medium` / **Confidence:** `High`
- `opportunity-factory/service/autonomous_factory.py` exposes report data using a URL token and returns `Access-Control-Allow-Origin: *` with public caching in the handlers around lines 3003-3023 and 3038-3056.
- Anyone obtaining a report URL can read the JSON payload, and any origin can embed/read it. This may be intended for public reports, but the code does not distinguish public summaries from paid/private report material at the response boundary.
- Use separate public and private representations, short-lived signed download URLs for paid artifacts, and explicit cache/CORS policy.

### 10. Opportunity Factory mutation endpoints lack CSRF protection and request throttling

- **Risk:** `Medium` / **Confidence:** `High`
- `opportunity-factory/service/autonomous_factory.py` accepts browser form POSTs for `/api/leads`, `/api/checkout`, `/api/github-audit`, `/api/github-compare`, and `/api/qualified-view` in the common `do_POST` path around lines 3567-3677.
- The code verifies payment-provider webhooks, but ordinary browser mutations have no CSRF token, same-origin check, per-client rate limit, or body/content validation beyond length and field cleaning. Abuse can create lead noise, expensive GitHub audits, or provider API spend.
- Add CSRF/origin defenses, endpoint-specific rate limits, idempotency keys, and bounded upstream concurrency.

### 11. LifeYouMe’s Nginx default route can expose the operations service for unknown hosts

- **Risk:** `High` / **Confidence:** `High`
- `lifeyoume-platform/deploy/nginx-platform.conf` maps unknown hosts to `127.0.0.1:8801` at lines 1-6, which is the operations service, and includes multiple unrelated hostnames in the HTTP server block.
- A host-header or DNS/configuration mistake can route traffic to the ops application instead of rejecting it. The Python service correctly refuses to start ops without credentials, but that does not eliminate the routing and probing exposure.
- Replace the default with an explicit reject server, split host configurations, and add deployment tests for unknown `Host` values.

### 12. Desktop release security is incomplete and platform-specific

- **Risk:** `High` / **Confidence:** `High`
- `delivery-pilot/src-tauri/tauri.conf.json` sets `"csp": null`, while its release script in `delivery-pilot/package.json` uses ad-hoc `codesign`; `english-foundation/README.md` explicitly says Apple signing/notarization is still required.
- `delivery-control-center/package.json` defines packaging but no signing, notarization, update, checksum, or provenance step. These are blockers for trustworthy distribution and can turn native sidecars into an unsigned trust prompt.
- Establish release profiles with CSP, entitlements, hardened runtime, signing/notarization, SBOM/dependency audit, artifact checksums, and a reproducible build record.

## Maintainability and correctness debt

### 13. Test coverage is uneven and does not cover native/network boundaries

- **Risk:** `Medium` / **Confidence:** `High`
- `fde-playbook/package.json` declares `npm test`, but the command currently exits with “No test files found”; its tracked source is only `fde-playbook/src/main.tsx` and `fde-playbook/src/styles.css`.
- The other frontend suites mainly test pure state helpers: `english-foundation/src/progress.test.ts`, `agent-workforce-console/src/engine.test.ts`, and the domain/store tests under `delivery-pilot/src/`. There are no repository-level tests for the full Tauri/Swift sidecar, cross-app handoff, deployed Nginx topology, or production payment flow.
- Make empty test suites fail in CI intentionally, then add contract tests for each IPC/HTTP/file protocol and one packaged-app smoke test per native product.

### 14. Dependency and toolchain drift is unmanaged across sibling apps

- **Risk:** `Medium` / **Confidence:** `High`
- Similar React/Vite projects independently pin different major/minor ranges in `delivery-pilot/package.json`, `english-speaking-coach/package.json`, `english-foundation/package.json`, `fde-playbook/package.json`, and `agent-workforce-console/package.json`; there is no root workspace or shared upgrade policy.
- This makes security patching and reproducible troubleshooting multiplicative, especially with multiple lockfiles and native wrappers.
- Adopt a documented support matrix, automated dependency updates with lockfile validation, and a standard Node/TypeScript/Vite test matrix.

### 15. Technology Exploration stores high-value credentials in an application config file without visible permission hardening

- **Risk:** `Medium` / **Confidence:** `Medium`
- `technology-intelligence/native/NativeShell.m` loads and writes ARK, TikHub, YouTube, X, and Feishu credentials through `config.json` fields around lines 749-795; the Python app also reads them from `~/Library/Application Support/Technology Exploration Agent/config.json` in `technology-intelligence/app/technology_explorer.py`.
- Secret fields are visually masked, but masking is not storage protection. The repository provides no keychain integration, file-permission enforcement, secret rotation, or redaction test.
- Store credentials in macOS Keychain, keep only non-secret configuration in JSON, and test that reports, logs, and IPC responses cannot expose tokens.

### 16. The repository has documentation and implementation drift at the product boundaries

- **Risk:** `Medium` / **Confidence:** `High`
- `delivery-pilot/docs/TECH_RADAR_API.md` documents a single API surface while the implementation has separate 43127 and 43128 services; `technology-intelligence/README.md` claims continuous Demo handoff and background monitoring, while the actual handoff is file polling in `delivery-pilot/src-tauri/src/lib.rs`.
- `README.md` gives independent quick starts but no environment/version prerequisites for Python, Rust, Swift, MLX, Xcode, certificates, or external accounts.
- Generate protocol docs from typed schemas or add contract tests that fail when examples and runtime addresses diverge; add a per-product prerequisites and release-status section.

## Verification snapshot

- Passed: `delivery-pilot` tests (22 tests), `easysay` tests (24), `english-foundation` tests (5), `nexora` tests (5), `OneOPC` tests (160), and `lifeyoume-platform` tests (6).
- Passed: frontend production builds for `delivery-pilot`, `easysay`, `english-foundation`, `fde-playbook`, and `nexora`.
- Failed/blocked: `fde-playbook` test command exits because no test files exist. Native packaging, iOS/Android builds, Python speech runtime, payment webhooks, deployed Nginx, and cross-product handoff were not exercised in this repository review.
