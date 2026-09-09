# Changelog

## 2026-09-09

### feat

- Added auditable domestic novel discovery to `novel-video-studio`: 360 web search, per-domain searches across nine configurable Chinese fiction sources, persisted query URLs/status/hit counts/timings, and an in-app source registry with validated domain-only additions.
- Added exact `求魔` candidates for Qidian (`2070910`), Hetushu (`book/37`), and QQ Reading; upstream WAF or search failures now fall back to configured candidates while preserving a degraded-run record.
- Enabled the approved Alipay mobile website payment capability in production: mobile orders now use `alipay.trade.wap.pay` / `QUICK_WAP_WAP_PAY`, with the existing page-payment fallback retained.
- Added resumable background video jobs: `/api/generate?async=1` returns a persisted job ID, `/api/generate/jobs/:id` exposes progress, and the Web/PWA client resumes polling after users leave the page.
- Production verification confirms the background-job endpoint is deployed, while video rendering remains gated by the missing production model configuration and currently returns an explicit `503` instead of accepting an unusable job.
- Connected the Zhizhu miniapp and official-account entry points to shared assistant configuration: dynamic prices, tool-specific official-account URLs, a miniapp WebView bridge to the article assistant, and live config loading from `/api/assistant/config`.
- Reworked `novel-video-studio` into a two-level multi-project workspace: the default project center supports creation, search, status filtering, visual progress cards, and explicit project entry; source, pipeline, asset, and episode tools are available only inside a selected project, while execution history remains in the global task center.
- Configured `novel-video-studio` task planning to use `glm-5-2-260617` through Ark Chat Completions and video rendering to use Seedance 2.5 (`doubao-seedance-2-5-260628`) by default, with legacy `ARK_TEXT_MODEL` compatibility and model IDs exposed in node/API telemetry.
- Added `model-operations-studio`, a cross-platform local MaaS control plane with model registry, checksum-verified downloads, process lifecycle management, health checks, host telemetry, logs, inference playgrounds, and Electron packaging for macOS, Windows, and Linux.
- Added reproducible Wan2.2-TI2V-5B FP16 and Qwen3.5-9B Q4_K_M deployment recipes, including an MPS-safe Euler/tiled-VAE workflow and a benchmark runner with memory, timing, black-frame, decode-error, and fallback reporting.
- Added an explicit novel-source confirmation gate to `novel-video-studio`: search results now expose title, author, year, language, provider, match score, rights status, and original source link, and no downstream processing starts until the user confirms a specific version.
- Added a fixed six-node production inspector for discovery, ingestion, adaptation, visual design, shot rendering, and assembly; every node persists and exposes its input, output, status, timing, and error details across current and historical projects.
- Added a password-protected `/admin/` operations console for `short-video-studio`: HttpOnly session login, dynamic prices for product/article/social tools, persisted server-side settings, and read-only Alipay order overview.
- Added a password-protected `/admin/` operations console for `short-video-studio`: HttpOnly session login, dynamic prices for product/article/social tools, persisted server-side settings, and read-only Alipay order overview.
- Added a persistent two-level scheduler to `novel-video-studio`: configurable concurrent novel projects, per-project video-shot slots, FIFO queue positions, wait estimates, restart recovery, and queue telemetry APIs.
- Added a cross-platform task center with complete history, status filters, title/source search, 50-row incremental rendering, queue progress, stage progress, timestamps, and historical-project detail restoration.

- Added `short-video-studio/apps/miniapp/`, colocated with the Web, Mobile, and Desktop entrypoints, as a Taro 4.1.9 WeChat mini-program for 智助乖乖 with native Workbench, Records, and Profile tabs, three assistant modes, local history, shared HTTPS generation, and a reserved official virtual-payment action.
- Added the `short-video-studio` `/zhizhu/` workspace for the C-end “智助乖乖” funnel, with product content, public-account article, and social/community assistant previews backed by a shared `/api/assistant/generate` endpoint.
- Expanded `novel-video-studio` into three shared-core editions: a Web control room, an installable mobile PWA with LAN access and offline shell, and a sandboxed Electron desktop app with Application Support storage.
- Added `novel-video-studio`, an automated novel-to-episode production control room with public-domain source discovery, rights gating, story/character/prop/location planning, Ark image and asynchronous video integrations, persistent shot queues, and FFmpeg assembly for 15-minute episodes.
- Added Alipay web payment integration to `short-video-studio`: server-side `pageExec` checkout form, persistent pending orders, signed notification verification, trade query, refund, refund query, close, and neutral return page.
- Added the C-end product content-pack MVP to `short-video-studio`: users can enter a product, audience, selling points, platform, tone, and offer to receive a free title preview plus locally generated titles, scripts, shot lists, hashtags, and a seven-day publishing plan.
- Unified the content-pack experience across the desktop Electron app, mobile PWA, and Web entrypoints, and fixed checkout order persistence to retain the submitted selling points.
- Deployed the Web content-pack entrypoint at `https://lifeyoume.icu/video/` with HTTPS Nginx routing and `https://lifeyoume.icu/video/api/alipay/notify` as the configured production notification URL.
- Fixed content-pack UI clipping introduced by the previous scroll optimization: restored complete page scrolling, reduced hero and form spacing, and kept mobile natural single-column scrolling.
- Hid the native page scrollbar while preserving wheel, trackpad, and touch scrolling.
- Added a stylesheet version query to force clients to load the scrollbar fix instead of stale cached CSS.
- Reworked the desktop content-pack first viewport into a compact fixed workspace so the core input-to-preview-to-unlock flow fits without page scrolling; mobile remains naturally scrollable.
- Tightened desktop typography, field spacing, and button sizing so the content-pack form footer is fully visible within the first viewport.
- Improved narrow-screen flow by hiding the empty preview before generation, keeping the complete input form and preview action in the first mobile viewport.
- Fixed CSS cascade order so the content-pack responsive layout overrides are applied after shared workbench styles.
- Redesigned the content-pack UI as a creator workspace inspired by common Runway/CapCut/Canva patterns: compact header, explicit steps, clearer empty preview state, and stronger primary action hierarchy.
- Configured seller ID `2088122111133366` for Alipay service `API_4BAB0CE91B3743BE`; the production Pay Skill now listens on port `8788`.

### verify

- Retried the formerly failed `求魔` project and verified three exact candidates plus 14 source-level traces; source-registry persistence, upstream-block fallback, desktop/mobile trace views, and WCAG checks pass, with the Novel Video Studio suite at 25 tests.
- Verified the project-center, create-modal, enter/return, navigation-gating, filtering, and deep-link flows at 1120×720 and 390×844; both layouts report zero WCAG 2 A/AA violations and the Novel Video Studio suite passes 22 tests.
- Verified the configured Ark request routes, model IDs, and 30-second Seedance task payload without issuing a billable production request; the Novel Video Studio suite now passes 21 automated tests.
- Verified Model Operations Studio with a production build, zero-warning lint, 3 passing tests, macOS arm64 Electron packaging, responsive screenshots, a Qwen3.5 response at 42.71 token/s, a Wan2.2 832x480/49-frame render in 217.49 seconds cold and 154.57 seconds warm with no black frames, decode errors, progressive banding, or saturation growth, and a 41.44-second image-to-video API smoke test.
- Verified the source-review pause/resume flow, explicit non-default candidate selection, all six persisted node artifacts, historical-node fallback, and responsive source controls; the Novel Video Studio suite now passes 19 automated tests.
- Verified production `/video/admin/`: unauthenticated API returns 401, login returns an HttpOnly session, price update persists, order overview loads, and browser verification reached the live Alipay cashier with a `¥9.90` order.
- Verified project concurrency with a real three-project submission against one slot (`1 running / 2 queued`), automatic queue advancement, restart recovery, mobile/desktop task-center layouts, filtering, search, and historical task restoration; 17 automated tests pass.

- Completed the mini-program file/configuration quality gate: all declared pages have three source files, all native TabBar icons exist, and TypeScript imports/types were manually checked. Skill preview startup was attempted but blocked by an expired TRAE preview credential (`TOKEN_EXPIRED`), not by a project compile error.
- Verified the Zhizhu workspace in a real browser: tool switching, form filling, local preview generation, and the disabled/not-integrated payment state; `short-video-studio` now has 10 passing Node tests.
- Completed a full interaction audit of Novel Video Studio across desktop and mobile, covering navigation, filters, asset details, logs, theme, refresh, validation, retry, source links, manifest export, PWA offline startup, accessibility, and media range delivery; 13 automated tests pass.
- Verified all three Novel Video Studio entrypoints, PWA metadata and cache worker, Electron renderer isolation, and shared API behavior with 8 passing automated tests.
- Verified `novel-video-studio` with 5 passing unit tests, an end-to-end 30-shot/900-second demo project, and responsive browser screenshots at 1120×720 and 390×844.
- Verified the checkout button opens the real Alipay sandbox cashier with the `¥9.90` product and price. The sandbox payment itself was not completed.
- Verified all three entrypoints expose the same content-pack form and unlock flow.
- Verified the public page (`200`), content-pack API (`201`), and production checkout form (`201`, `9.90`, payment HTML present) without submitting a payment.
- Verified the return page responds with a neutral payment-confirmation state. Production web-payment signing remains blocked by an authorization mismatch, and a public HTTPS `notify_url` is still required before production readiness.
- Verified the new `/api/content-pack` endpoint, browser form submission, preview rendering, and the checkout handoff into the Alipay sandbox cashier.
- Verified the public Pay Skill endpoint returns the expected pre-payment `400 INVALID_REQUEST` response for invalid input without creating an order or charging money.
- Verified a valid production-shaped request returns `402 Payment-Needed` with a signed payment challenge; no payment was submitted.

### fix

- Added a production-safe fallback for Alipay mobile checkout: when `alipay.trade.wap.pay` is not authorized (`insufficient-isv-permissions`), mobile orders use the working page-payment flow instead of sending customers to an Alipay error page.
- Switched mobile checkout to Alipay `alipay.trade.wap.pay` with `QUICK_WAP_WAP_PAY`, added return-page status polling and a clear return-to-product action; desktop checkout remains on `alipay.trade.page.pay`.
- Added idempotent paid-order fulfillment: Alipay return handling and async notifications now mark successful orders as fulfilled, and the payment return page directly renders the purchased content pack.
- Made scrollable node input/output inspectors keyboard-focusable with a visible focus state; final Electron and mobile WCAG 2 A/AA audits report zero violations.
- Fixed the production content-pack page to load the persisted admin price through `/api/status`; the header and unlock button now reflect the configured `¥0.90` instead of the former hardcoded `¥9.90`.
- Fixed inactive Novel Video Studio navigation controls by implementing source-library, continuity-asset, and episode-queue views, plus asset filtering/detail, manifest download, retry, and refresh actions.
- Fixed public-domain discovery false negatives by extending provider timeouts and retrying Gutenberg, cleared stale errors after successful retries, synchronized the title field with restored projects, and added a restricted server-side image refresh proxy.
- Added complete ARIA list, tab, tabpanel, current-page, and control-group semantics; the final desktop WCAG 2 A/AA audit reports zero violations, with only contrast checks on partially obscured scroll rows left inconclusive.
- Fixed production Pay Skill activation by removing the invalid systemd environment condition, correcting service-user permissions for the payment virtual environment and Alipay key directory, and restoring the Nginx route and certificate coverage for `audit.lifeyoume.icu`.

## 2026-09-08

### docs

- Added the MetaHuman asset rebuild guide with public repository boundaries, private backup guidance, SHA-256 checksums, rebuild commands, and acceptance gates.
- Updated the workspace README with MetaHuman rebuild documentation and GitHub auto-sync operational notes.

### fix

- Fixed intermittent Alipay discovery `Not logged in` failures by serializing read-only signing, service, and application CLI calls to avoid local credential/log state races.
- Changed GitHub auto-sync from a two-hour interval to a one-hour interval.
- Added a terminal-launched hourly sync loop to avoid macOS Desktop TCC failures from the LaunchAgent path.
- Allowed `.env.example` template files in auto-sync while continuing to block real `.env` files, private keys, certificates, suspected credential contents, and files larger than 95 MB.
- Fixed Opportunity Factory deployment so an already-running systemd service restarts onto the newly installed release.
- Fixed Opportunity Factory's production dashboard to accept both `/admin` and `/admin/`, replacing the browser-native Basic Auth prompt with a form login and secure session cookie while retaining Basic Auth for API clients.

### feat

- Submitted Alipay production signing, created active service `API_4BAB0CE91B3743BE` at `1.99 CNY` per call, brought application `2021006197631772` online, and deployed the Pay Skill service plus proxy route; the runtime now only awaits seller-ID injection before activation.
- Pivoted Opportunity Factory from GitHub adoption audits to a paid enterprise AI POC acceptance and bid-response audit Skill, with six traceable deliverables.
- Added an Alipay A2M pay-per-call service with signed 402 billing, SQLite order persistence, strict payment matching, idempotent fulfillment, and a verified sandbox flow.
- Expanded FRAME/60 into three shared-core editions under `short-video-studio/apps`: an installable mobile PWA with LAN access, an Electron desktop application, and a browser-based Web workspace.
- Added dedicated `/mobile/`, `/desktop/`, and `/web/` runtime entrypoints, mobile offline shell caching, install metadata, Electron lifecycle handling, and platform-aware UI treatment.
- Added `short-video-studio`, a local-first AI video workspace that generates 5, 10, 20, 30, or 60-second MP4 files, supports three aspect ratios, keeps model credentials server-side, and provides preview, download, and local history.
- Added FFmpeg duration normalization so model outputs are measured and trimmed or looped to the requested delivery length.
- Added branded Opportunity Factory favicon and Apple Touch assets based on the product's growth-compass identity.
- Replaced Opportunity Compass's Finder-based history action with an in-app, date-grouped archive that restores each historical opportunity's full execution detail.
- Redesigned Opportunity Compass's seven-stage sidebar as an animated outward-expanding business network and added a live insight-to-compounding growth flywheel.
- Added Opportunity Factory's ¥9.90 WeChat first-payment flow with private QR serving, unique payment notes, buyer payment claims, authenticated receipt confirmation, automatic report unlock, and CNY revenue accounting.
- Extended the commercial funnel to distinguish checkout opens, payment submissions, confirmed receipts, and today's confirmed WeChat payments.
- Added a five-minute macOS production-order notifier so new WeChat payment claims surface for receipt verification without exposing admin credentials.
- Added a one-command private WeChat QR installer that validates the local image, uploads it outside Git, updates production configuration, restarts the service, and verifies health.

## 2026-09-01

### feat

- Added `english-immersion-studio`, an Electron/React/Three.js desktop product for immersive English roleplay with digital employees, CEFR difficulty controls, language analysis, local avatar baking, neural voice playback, and MetaHuman runtime integration.
- Added `avatar-generator-service`, a local Apple Silicon avatar material generation service that repaints rigged GLB assets with Hunyuan3D-Swift/MLX Paint while preserving skeletons, skin weights, and facial morph targets.
- Added `metahuman-renderer`, an Unreal Engine 5.7 renderer project that defines the MetaHuman scene, Pixel Streaming, camera, wardrobe, hair, and avatar state contracts used by English Immersion Studio.

### docs

- Updated the workspace README with the new project catalog entries, quick-start commands, feature summary, changelog convention, and the `AGI` GitHub remote URL.
