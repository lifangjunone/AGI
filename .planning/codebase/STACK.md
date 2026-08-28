# Technology Stack

Inventory date: 2026-08-28. The repository is a multi-application workspace; each
directory below is an independently buildable or deployable subproject.

## Workspace

- The root is a project collection, not an application. Its scope and launch
  instructions are documented in `README.md`.
- Primary languages found are TypeScript/TSX, JavaScript, Rust, Python, Swift,
  Objective-C, CSS, HTML, SQL, shell, XML, and Gradle/Android configuration.
- Generated and local artifacts are present (`node_modules/`, `dist/`, `build/`,
  `target/`, model environments, test results). They are not source/runtime
  dependencies and are excluded from this inventory.
- macOS is the dominant target. Desktop shells use Tauri 2 or Electron; mobile
  packaging is present in `english-speaking-coach/ios/` and `english-speaking-coach/android/`.

## LifeYouMe Platform

- `lifeyoume-platform/platform/app.py` is a dependency-free Python 3 service
  using `http.server`, `urllib`, JSON files, signed cookies, PBKDF2-HMAC-SHA256,
  and loopback health checks.
- It runs four service roles (`portal`, `ops`, `auth`, `billing`) on ports
  8800-8803. Runtime configuration is in
  `lifeyoume-platform/deploy/platform.env.example`; product registration is in
  `lifeyoume-platform/config/products.json`.
- Deployment is Linux `systemd` plus Nginx TLS reverse proxy:
  `lifeyoume-platform/deploy/lifeyoume-platform@.service` and
  `lifeyoume-platform/deploy/nginx-platform.conf`.
- No Python package manifest or database dependency is declared. State is
  registry/config based; product code and product databases remain isolated.

## Opportunity Compass

- `opportunity-factory/app/opportunity_engine.py` is a Python 3 local report
  generator using the standard library and JSON/HTML files.
- `opportunity-factory/service/autonomous_factory.py` is a Python 3 HTTP
  service using `ThreadingHTTPServer`, `urllib`, `sqlite3`, HMAC signatures,
  concurrent workers, and a local SQLite runtime database.
- The native desktop wrapper is Objective-C/Cocoa/WebKit in
  `opportunity-factory/native/NativeShell.m`; packaging is driven by
  `opportunity-factory/scripts/build.sh`.
- Server deployment uses `systemd`, Nginx, optional Docker proxy configuration,
  and Let's Encrypt scripts under `opportunity-factory/deploy/`.

## Technology Exploration

- `technology-intelligence/app/technology_explorer.py` is a large Python 3
  application with an embedded HTML/CSS/JavaScript UI and a local HTTP provider.
  It uses standard-library networking (`urllib`), XML parsing, JSON, regexes,
  local files, and subprocesses; there is no Python dependency manifest.
- The macOS wrapper is Objective-C/Cocoa/WebKit in
  `technology-intelligence/native/NativeShell.m`. App metadata and packaging
  assets are in `technology-intelligence/Info.plist`,
  `technology-intelligence/scripts/build.sh`, and
  `technology-intelligence/scripts/build_icns.py`.
- Persistent reports/configuration/jobs are stored under macOS Application
  Support paths, as described in `technology-intelligence/README.md`.

## OneOPC

- `delivery-control-center/src/*.js` is a CommonJS Node.js application running in Electron.
  Electron provides the main process, BrowserWindow, IPC, preload context
  bridge, shell integration, and desktop packaging.
- Runtime/development dependencies are `electron` 39, `electron-builder` 26,
  and `cytoscape` 3.33.1, declared in `delivery-control-center/package.json`.
- `delivery-control-center/src/vendor/cytoscape.min.js` is also vendored for graph rendering.
- Node's built-in `node:test`, `node:fs`, `node:child_process`, crypto, HTTP,
  and path APIs provide testing, persistence, process execution, and local
  service communication. There is no remote backend or database dependency.

## DeliveryPilot

- Frontend: React 19 + TypeScript 6, Vite 8, Zustand 5, Lucide React, Vitest 4,
  and oxlint. Declarations and scripts are in `delivery-pilot/package.json`.
- Desktop shell: Tauri 2 with Rust 2021. Rust dependencies include Axum,
  Tokio, Reqwest with rustls/JSON, rusqlite bundled SQLite, Serde,
  `quick-xml`, `pdf-extract`, `tower-http`, `uuid`, `walkdir`, `rfd`, and
  `sha2`, declared in `delivery-pilot/src-tauri/Cargo.toml`.
- Native automation sidecar: Swift 6 package targeting macOS 13 in
  `delivery-pilot/sidecars/macos-computer-use/Package.swift`. It uses macOS
  Accessibility APIs, CoreGraphics events, and system application controls.
- Build/bundle settings are in `delivery-pilot/vite.config.ts` and
  `delivery-pilot/src-tauri/tauri.conf.json`; the Swift app is bundled as a
  Tauri resource.

## EasySay

- Frontend/PWA: React 19 + TypeScript 5.8, Vite 7, Vite PWA plugin, Vitest,
  Zod, IDB, Lucide React, and Capacitor 8 packages in `english-speaking-coach/package.json`.
- Backend: Node.js TypeScript server using Express 5, CORS, Helmet,
  express-rate-limit, dotenv, `tsx`, and the OpenAI-compatible `openai` SDK.
  Entry point and server configuration are in `english-speaking-coach/server/index.ts`.
- Mobile: Capacitor iOS/Android projects under `english-speaking-coach/ios/` and
  `english-speaking-coach/android/`, with Swift Package Manager integration in
  `english-speaking-coach/ios/App/CapApp-SPM/Package.swift`.
- Local speech: Python service using FastAPI/Uvicorn, Pydantic, MLX Audio,
  Transformers, ModelScope, PyAV, SoundFile, and multipart parsing, declared in
  `english-speaking-coach/speech/requirements.txt`.
- Local storage is browser IndexedDB via `english-speaking-coach/src/lib/storage.ts`;
  local model/config files are under `english-speaking-coach/config/` and `.models/`.

## Foundation

- `english-foundation/src/` is a React 19 + TypeScript 5.8 Vite application
  using Lucide React and Vitest.
- `english-foundation/src-tauri/` is a Tauri 2 Rust 2021 shell with only
  Tauri, Serde, and Serde JSON dependencies in
  `english-foundation/src-tauri/Cargo.toml`.
- Tauri build/security/window configuration is in
  `english-foundation/src-tauri/tauri.conf.json`; the product is local-first
  and has no declared network or database service.

## FDE Fieldbook

- `fde-playbook/src/` is a browser-only React 19 + TypeScript 5.8 Vite app
  using Lucide React and Vitest. Manifests and build settings are in
  `fde-playbook/package.json` and `fde-playbook/vite.config.ts`.
- It has no backend, native shell, database, or runtime service. It references
  external fonts and a generated image endpoint from its CSS.

## Nexora

- `agent-workforce-console/src/` is a browser-only React 19 + TypeScript 5.8 Vite app using
  Lucide React and Vitest, configured by `agent-workforce-console/package.json` and
  `agent-workforce-console/vite.config.ts`.
- Its task graph and multi-agent behavior are implemented in local TypeScript
  (`agent-workforce-console/src/engine.ts` and `agent-workforce-console/src/data.ts`); no backend, database,
  native shell, or external SDK is declared.
