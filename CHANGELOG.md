# Changelog

## 2026-09-10

### fix

- Rebuilt `short-video-studio/apps/miniapp/dist/` after a temporary WeChat DevTools editor buffer was accidentally written into `dist/project.config.json`; the generated file was revalidated as valid JSON with project `zhizhu-guagua` and AppID `wxa087f03ad52dd2bf`. No corrupted config was retained.
- Read the official WeChat mini-program rejection guidance for version `1.0.4`. The generation failure was reproducible with a four-character selling-point value (`1231`): the server correctly requires at least eight characters, while the mini-program only checked for two. The mini-program now applies the same minimum length before sending the request and shows the actionable validation message.
- Recorded the second rejection cause: the submitted package was identified as providing AI Q&A, face-swap video, and AI drawing deep-synthesis services, which are not available to the current individual主体. The current source does not expose those tools; the next submission must use the rebuilt `dist/` package and must not reuse the old package.

### verify

- `npm run build:weapp` completed successfully in `short-video-studio/apps/miniapp`.
- Production API verification confirmed the original failure response: `400 {"error":"核心卖点至少需要 8 个字符"}`.
- Production API verification with valid input returned `201` and a content preview successfully.

### feat

- Uploaded `short-video-studio/public/official-covers/001-normal-product-7-videos-hero.png` to the official WeChat account material library through the official media API; verified the returned WeChat image URL with HTTP 200. The article remains unsaved and unpublished.
- Created the first official-account article as a WeChat draft with the uploaded cover bound through `thumb_media_id`; verified the draft title, author, body, and cover reference through `draft/get`. No publication was triggered.
- Attempted to publish the verified draft through both the official API and the logged-in web console. The API returned `48001 api unauthorized`; the web console showed “未授权使用切换账号能力”. The article remains an unpublished draft.
- Rebuilt the LifeYouMe management backend as a fixed-viewport control plane with
  dedicated overview, account, product-policy, and audit views. Long tables now
  use scoped search, pagination, internal scrolling, and mobile record layouts
  instead of stacking every module into one continuously scrolling page.
- Added `https://lifeyoume.icu/admin/` as the LifeYouMe control-plane management backend. Operators can enable or disable end-user accounts, reset passwords with immediate session/token revocation, inspect recent management actions, and dynamically turn unified login on or off for each registered product.
- Replaced fixed Nginx SSO gates with database-backed product access policies. When login is disabled, a product homepage opens directly; when enabled, anonymous users are redirected to `auth.lifeyoume.icu`. Policy changes take effect immediately without reloading Nginx.
- Added LifeYouMe unified end-user identity to `lifeyoume-platform`: email registration/login, PBKDF2 password hashing, SQLite users, revocable cross-subdomain HttpOnly sessions, account/logout pages, authenticated user resolution, CSRF protection, login throttling, trusted-return validation, and product-scoped device authorization for Electron, Tauri, PWA, mini-program, and native clients.
- Connected the production entry pages for FRAME/60, 智助乖乖, 隐匣, and Opportunity Factory to the shared SSO gateway. Product APIs, Alipay notifications, Pay Skill endpoints, health checks, and public audit reports retain independent routing; authenticated upstream requests receive the stable LifeYouMe user ID.
- Moved Opportunity Factory's canonical production ownership to `audit.lifeyoume.icu` and documented the root portal, audit compatibility routes, operations/auth/billing boundaries, and unified identity contract across all 16 project READMEs.
- Replaced Novel Video Studio's create-time episode presets with a content-driven adaptation workflow: the system now analyzes full text, chapter boundaries, chapter lengths, and narrative density to produce a whole-book episode map before the user chooses a season number and contiguous episode range.
- Added the `season-review` production gate, dynamic season-selection API, whole-book episode catalog, source-range audit fields, season budget preview, and a 24-episode per-season operational limit without imposing a fixed whole-book episode count.

### verify

- Verified the redesigned backend at 1120x720 and 390x844: the document remains
  viewport-bound, product policy shows seven records per page, and mobile users
  can see policy state and its action without horizontal scrolling.
- Verified the management backend and unified identity with 16 platform tests, including account enable/disable behavior, password replacement, session revocation, policy persistence, audit recording, protected admin controls, and truthful product-detail links.
- Verified the production policy path by changing `privacy-vault` from login-required to anonymous access and back: the public response changed from `302` to `200` and returned to `302` immediately, without an Nginx reload. FRAME/60, audit entry, public reports, and payment callbacks retained their expected behavior.
- Verified unified identity with a temporary production account: registration issued the shared session, `/api/v1/me` resolved the same stable user, and the session opened `/vault/`, `/video/`, and `audit.lifeyoume.icu`; the test user and cascaded sessions were removed afterward.
- Verified unauthenticated product entry pages redirect to `auth.lifeyoume.icu`, while the portal, catalog, public audit reports, Alipay notification path, assistant configuration, and Pay Skill route remain reachable without an accidental SSO redirect.
- Verified the revised workflow with 40 passing tests, including chapter extraction, different plan sizes for different source lengths, no scripts or video before season selection, contiguous range selection, full-season script completion, budget approval, and sequential video submission.

### fix

- Preserved complete source coverage for long novels even when the planning model cannot return every episode in one response: deterministic chapter mapping fills all remaining entries while model output enriches available titles and summaries.
- Versioned Novel Video Studio's PWA shell to v19 so the removed create-time episode selector cannot remain cached in Web or mobile clients.

## 2026-09-09

### feat

- Rebuilt `lifeyoume.icu` as the LifeYouMe product showroom on the existing `lifeyoume-platform` base. The root now provides a real-product hero, six selected products, five product collections, a searchable/filterable 14-item catalog, standardized detail pages, and Catalog Schema v2 with truthful online, beta, preview, lab, and internal visibility states.
- Split the production root portal from the audit product at the Nginx virtual-host boundary: `lifeyoume.icu` now routes to platform port `8800`, `audit.lifeyoume.icu` remains on `8787`, legacy audit paths remain compatible, and `/video/`, `/vault/`, Pay Skill, operations, auth, and billing routes keep their independent owners.
- Replaced Novel Video Studio's short-output creation flow with a season production model: users choose 1, 3, 6, or 12 episodes; the system completes every episode outline and script before rendering; each episode is fixed at five minutes and split into ten ordered 30-second Seedance segments.
- Added production continuity and recovery for Novel Video Studio: each segment uses the prior segment's persisted last frame, episode openings can continue from the previous episode, FFmpeg assembles one episode before the next begins, season video spend requires explicit confirmation, and retries preserve completed work.
- Redesigned Novel Video Studio's recommendation catalog as a responsive cinematic selection shelf with 3–4 desktop columns, compact mobile cards, stronger typography, clearer adaptation signals, and production-oriented actions.
- Deployed Personal Privacy Vault to `https://lifeyoume.icu/vault/` from `/data/app/personal-privacy-vault/current`, using the existing HTTPS Nginx container with a read-only static mount and dedicated security headers while preserving the root portal and `/video/` routes.
- Added a Playwright-based WeChat official-account publisher for twice-daily structured article generation at 08:30 and 17:30, cover upload, persistent login, publish logging, slot-level deduplication, and macOS launchd scheduling. The first login or platform risk confirmation remains an explicit one-time prerequisite.
- Added Markdown-first official-account authoring with a WeChat-compatible styled HTML renderer, a structured first article, a 900x383 cover asset, and a default-disabled publish gate for preview-before-publish review.
- Added a hard three-image minimum for every official-account article, with scene, explanation, and actionable-list visuals included in the first Markdown article; publishing now fails closed when the requirement is not met.
- Fixed the first official-account article to include the LifeYouMe product directory and direct content-pack entry, and added unique-image validation so repeated body images block publishing.
- Upgraded the first official-account cover to a high-quality three-panel editorial visual with a result-led headline and deployed the asset to production.
- Added master-password rotation to the Personal Privacy Vault lock screen and unlocked toolbar. The user must verify the current password before the vault is re-encrypted with a new random salt and derived AES key; no password is written to source or configuration.
- Promoted Novel Video Studio to production-first behavior: fresh installs enter formal production with explicit credential and budget gates, while non-billable planning is available only through an intentional `PRODUCTION_MODE=planning` setting.
- Added `personal-privacy-vault` (“隐匣”), a serverless personal privacy archive with six record categories, custom masked fields, favorites, in-memory search, five-minute automatic locking, and encrypted `.pvault` backup/restore. The master password is never persisted; PBKDF2-SHA-256 derives an AES-256-GCM key and the complete vault payload is encrypted before IndexedDB storage.
- Added a direct "start real generation" upgrade path for Novel Video Studio planning previews, plus in-project MP4 playback and download after FFmpeg assembly.
- Added project-level 5/10/15/30/60-second output duration selection to Novel Video Studio. Seedance receives supported durations up to 30 seconds, while 60-second outputs use two continuous 30-second tasks followed by FFmpeg assembly.
- Replaced Model Operations Studio's long scrolling task history with filter-aware pagination: five rows on standard desktop heights, eight on tall screens, global row numbering, compact page navigation, and a single-screen desktop layout without the redundant recent-output strip.
- Added 5/10/30/60-second video generation presets to Model Operations Studio. Long durations use five-second continuation segments with last-frame handoff and FFmpeg assembly, while generated videos now play in an in-app modal backed by seekable HTTP Range responses.
- Added a curated Novel Video Studio recommendation catalog with 16 work-level verified public-domain Chinese and English classics, language/search filters, rights evidence, original-source links, and one-click project creation.
- Rebuilt the Model Operations Studio home screen around generation work: persisted text/video jobs, live ComfyUI workflow and sampling progress, queue filtering, elapsed time, cancellation, retry, restart recovery, recent output discovery, and direct artifact access now replace the previous host-metrics-first dashboard.
- Expanded `novel-video-studio` to 23 verified sources across Chinese web fiction, public-domain classics, overseas originals, and digital libraries; each source now records its official URL, free mode, registration, Web/download support, advertising, copyright boundary, automation policy, and 2026 availability.
- Added exact licensed-platform `求魔` candidates for Qidian (`2070910`) and QQ Reading, removed Hetushu after it failed the authorized-source review, and blocked `cn-qidianzww.com.cn`, `hetushu.com`, and `www.hetushu.com` from being re-added through configuration.
- Added a maintained free-reading comparison covering all accepted sources, official evidence, current reachability, download formats, exclusions, and recommendations for Chinese web fiction, ad-free reading, classics, and English fiction.
- Added project-level source rescanning so historical projects can apply the latest registry and rejection rules without silently rewriting their prior discovery records.
- Added a production-grade authorized-content ingestion path for commercial novels: TXT/Markdown import, explicit rights declaration, 12 MB validation, isolated full-text persistence, SHA-256 fingerprinting, a 2,000-character preview, and automatic pipeline resume.
- Enabled the approved Alipay mobile website payment capability in production: mobile orders now use `alipay.trade.wap.pay` / `QUICK_WAP_WAP_PAY`, with the existing page-payment fallback retained.
- Added resumable background video jobs: `/api/generate?async=1` returns a persisted job ID, `/api/generate/jobs/:id` exposes progress, and the Web/PWA client resumes polling after users leave the page.
- Production verification confirms the background-job endpoint is deployed, while video rendering remains gated by the missing production model configuration and currently returns an explicit `503` instead of accepting an unusable job.
- Replaced the unavailable legacy model endpoint with Ark Seedance 2.5 asynchronous task creation/polling and MP4 download; production readiness is now true and a real 5-second 16:9 task completed successfully.
- Added WeChat notification integration: miniapp subscription authorization/login binding, official-account OAuth binding, access-token caching, template payload rendering, and completion-triggered sends with explicit configuration-gated fallback.
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

- Verified the LifeYouMe product showroom with 10 passing platform tests, Python/JavaScript/shell syntax checks, Catalog Schema v2 and visual-asset validation, category filtering, detail CTA behavior, no console errors, and overflow-free 1120×720, 390×844, and public-browser layouts. Production checks confirm 200 responses for the portal, catalog, product details, product assets, `/video/`, `/vault/`, `audit.lifeyoume.icu`, and legacy audit routes.
- Verified Novel Video Studio's season workflow with 39 passing tests, including all-content-before-video ordering, one-at-a-time segment submission, within-episode and cross-episode last-frame handoff, budget approval, failed-segment reset, and restart recovery.
- Verified the redesigned recommendation catalog in the packaged Electron app at 1320×828 and an emulated 390×844 viewport: 16 cards rendered, no horizontal or button-text overflow, and no provider placeholder text exposed.
- Verified Personal Privacy Vault with four cryptography tests covering plaintext exclusion, correct-password round trips, wrong-password rejection, fresh-IV updates, and master-password rotation. The production build and dependency audit pass; the public HTTPS route serves HTML and hashed assets, provides Web Crypto and IndexedDB in a secure context, emits no browser console errors, and leaves the root portal and `/video/` healthy.
- Completed a real 5-second Seedance 2.5 run for `西游记`: remote task `cgt-20260909215437-nrn78`, H.264/AAC 1280×720 output, 5.024-second duration, local archival and HTTP Range delivery verified.
- Verified all five duration options, rejected unsupported values, and confirmed 60-second projects split into exactly two 30-second clips; Novel Video Studio now passes 33 automated tests.
- Verified the preflight budget gate prevents every Ark model call when billing is not authorized; Novel Video Studio now passes 31 automated tests.
- Verified pagination across 18 persisted tasks: page two renders rows 06-10, status filtering resets to page one, and 1120×720 plus 2048×1022 layouts keep the task controls and node status visible without desktop page scrolling.
- Verified an 81-frame five-second output at 5.063 seconds, a two-segment ten-second output at exactly 10.000 seconds, application-level video playback with a ready media element, and `206 Partial Content` seeking support.
- Verified the recommendation catalog and API with 30 passing Novel Video Studio tests; desktop and emulated 390×844 layouts expose all 16 works without horizontal overflow, including the complete three-action card controls and seven-destination mobile navigation.
- Verified the task center against real Wan2.2 runs: live progress advanced through prompt parsing, model loading, `3/20` sampling, tiled VAE decode and completion; a running task cancelled cleanly with an empty downstream ComfyUI queue, and a failed task retried to a valid WebM output.
- Rechecked 23 accepted official source domains on 2026-09-09, including redirects and bot protection; the source registry, rejection rules, fallback candidates, rescan endpoint, and platform APIs pass all 28 Novel Video Studio tests.
- Retried the formerly failed `求魔` project and verified two official exact candidates plus 26 source-level traces; source-registry persistence, upstream-block fallback, desktop/mobile trace views, and WCAG checks pass.
- Verified authorized-content file selection, preview and rights gating in the browser, plus full persistence and automatic pipeline continuation in tests; the Novel Video Studio suite now passes 27 tests.
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

- Versioned Novel Video Studio's frontend assets under PWA cache v18 so a newly deployed HTML shell cannot execute stale JavaScript or CSS from an older product flow.
- Hid unfinished generated-image responses behind designed title covers and added timed cover refresh, preventing white “image is generating” service placeholders from dominating Novel Video Studio's recommendation UI.
- Removed user-facing demo semantics from Novel Video Studio and added a dedicated production-configuration gate so missing Ark credentials cannot be mistaken for a successful production run.
- Fixed the packaged Novel Video Studio app remaining stuck at the render node when a demo preview should be promoted to live generation; retry now upgrades the project runtime, and a missing optional image model no longer blocks Seedance video submission.
- Fixed Novel Video Studio demo projects falsely reporting 30 completed videos and a completed assembly despite having no remote task IDs or MP4. Demo runs now stop as explicit previews with zero generated videos, while live runs enforce billing authorization and the estimated episode budget before any model call.
- Aligned the mini-program build dependency with Taro 4.1.9 by upgrading Webpack from 5.78.0 to 5.91.0.
- Aligned React Refresh with Taro 4.1.9 by upgrading it from 0.11.x to 0.14.x.
- Fixed the mini-program TabBar build by removing unsupported SVG icon paths; the native TabBar now uses the supported text-only configuration.
- Uploaded mini-program experience version `1.0.4` successfully through the official WeChat DevTools; review and production release remain separate steps.
- Attempted to submit experience version `1.0.4` for review; WeChat blocked submission because the mini-program account has not completed主体 verification.
- Re-authenticated the official-account console and confirmed AppID `wx37ed8960d67b51f7`; official template-message access and OAuth-domain configuration remain blocked by platform permissions/configuration.
- Updated the Taro mini-program developer-tool configurations from `touristappid` to the verified production AppID `wxa087f03ad52dd2bf`; no AppSecret was added to the repository.
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
