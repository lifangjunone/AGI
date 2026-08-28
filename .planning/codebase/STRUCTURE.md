# Structure

**Repository:** `/Users/bytedance/Desktop/agi`  
**Mapped:** 2026-08-28  
**Purpose:** Directory map and ownership guide for the multi-product workspace

## Top-Level Layout

```text
.
├── README.md
├── lifeyoume-platform/
├── technology-intelligence/
├── opportunity-factory/
├── delivery-control-center/
├── delivery-pilot/
├── english-speaking-coach/
├── english-foundation/
├── fde-playbook/
├── agent-workforce-console/
└── .planning/codebase/
```

The root has no application source directory. `README.md` is the catalog,
quick-start index, product relationship map, and repository convention list.
Each named directory is an ownership boundary with its own README, dependency
manifest, build/test commands, and runtime assumptions.

## Product Directory Map

### `lifeyoume-platform/`

Shared control plane for independently deployed products.

```text
lifeyoume-platform/
├── config/products.json              # Product registry contract
├── platform/app.py                   # Role-based HTTP service
├── tests/test_platform.py            # Registry/auth/health tests
├── docs/ARCHITECTURE.md              # Service boundary design
└── deploy/                           # systemd, Nginx, env, push, certificates
```

`platform/app.py` serves portal, operations, auth, and billing roles based on
`SERVICE_ROLE`. `config/products.json` is the only product catalog input.
`deploy/` is operational infrastructure, not application business logic.

### `technology-intelligence/`

macOS desktop intelligence collector and requirement-matching producer.

```text
technology-intelligence/
├── app/technology_explorer.py        # Main Python application and provider
├── native/NativeShell.m              # Cocoa/WebKit shell
├── scripts/                          # Build, launch-agent, icons, scheduling
├── assets/                           # App icon resources
├── AgentPrompt.md                    # Agent prompt asset
├── DATA_SOURCE_SETUP.md              # Provider setup
├── PRODUCT-QUALITY.md
├── UI-REVIEW.md
└── README.md
```

Most logic is intentionally concentrated in `app/technology_explorer.py`,
including source adapters, normalization, scoring, local persistence,
requirement scanning, handoffs, and UI/provider behavior.

### `opportunity-factory/`

Commercial opportunity and open-source adoption audit product.

```text
opportunity-factory/
├── app/opportunity_engine.py         # Report ingestion and opportunity model
├── service/autonomous_factory.py    # HTTP/SQLite autonomous audit service
├── tests/                            # Python behavior tests
├── native/NativeShell.m              # macOS shell
├── scripts/                          # Build, daemon, and deployment helpers
├── deploy/                           # Server deployment assets
├── docs/                             # Product, payment, deployment research
├── assets/                           # Icons and visual assets
└── README.md
```

The `app/` side is the local opportunity client; `service/` is a separately
operable web service with its own database and public URL configuration. It
reads Technology Exploration reports but keeps opportunity and commercial
state in its own support/runtime locations.

### `delivery-control-center/`

Electron desktop delivery control center.

```text
delivery-control-center/
├── src/
│   ├── main.js                       # Electron main process
│   ├── preload.js                    # IPC capability boundary
│   ├── renderer.js                   # DOM renderer/state machine
│   ├── requirement-input.js          # Requirement import/normalization
│   ├── task-supervisor.js            # Runtime supervision/recovery
│   ├── delivery-coordinator.js       # Delivery stages/events
│   ├── digital-employees.js          # Employee/team model
│   ├── tech-intelligence.js          # Technology context
│   ├── technology-advisory.js       # Advisory sidecar calls
│   ├── codegraph-adapter.js          # Code graph integration
│   └── vendor/                       # Local vendored runtime assets
├── resources/                        # Bundled native resources/sidecars
├── inputs/requirements/              # Local requirement inputs
├── work/runs/                        # Delivery run persistence
├── settings/                         # Preferences, drafts, registries, recovery
├── deliveries/                       # Generated delivered applications
├── tests/                             # Node tests
├── docs/                              # Architecture/research/UI evidence
├── build/                             # App icons/build resources
└── package.json
```

The active product source is `src/`. `inputs/`, `work/`, `settings/`, and
`deliveries/` are runtime or generated data boundaries and should not be read as
shared libraries. The checked-in `delivery-control-center/deliveries/OP-20260814072043-869C/`
tree is an example output, including its own `system/` app, tests, and reports.

### `delivery-pilot/`

Tauri desktop delivery console with React, Rust, and Swift execution support.

```text
delivery-pilot/
├── src/                              # React UI
│   ├── App.tsx                       # UI coordinator
│   ├── domain/                       # Projection, workspace, types, policies
│   ├── stores/                       # Client state stores
│   ├── workforce/                    # Assignment and digital workforce UI
│   ├── technology/                   # Technology radar UI/types
│   └── shared/                       # Formatting helpers
├── src-tauri/
│   ├── src/lib.rs                    # Tauri commands and app composition
│   ├── src/delivery_runtime.rs       # Generated app launcher/health probe
│   ├── src/task_supervisor.rs        # Background monitoring/recovery
│   ├── src/execution_control.rs      # Tool/run/transcript control
│   ├── src/technology*.rs            # Technology source/advisory services
│   ├── migrations/001_initial.sql    # SQLite schema
│   ├── resources/                    # Bundled sidecar/resources
│   └── tauri.conf.json               # Native packaging/window policy
├── sidecars/macos-computer-use/      # Swift computer-use transports
├── docs/architecture/                # Contracts, schema, wireframes, test plan
├── prompts/                          # Requirement-analysis prompt versions
├── scripts/                          # Sidecar/build helpers
├── tests/                             # Browser/integration tests
└── package.json
```

`src/` is a presentation/application layer. `src-tauri/` owns privileged
filesystem, process, database, and native operations. `sidecars/` are
separately compiled native execution helpers. The large
`delivery-pilot/.workspace/` tree is generated project/version/sandbox data,
including copied external references and should remain operational evidence,
not a source module.

### `english-speaking-coach/`

Local-first language-learning application with browser/PWA, Capacitor mobile
targets, Express APIs, and local ML services.

```text
english-speaking-coach/
├── src/
│   ├── App.tsx                       # Product shell/navigation
│   ├── components/                   # Learning workflows
│   ├── data/                         # Curriculum and sentence analysis
│   ├── hooks/                        # Recording hooks
│   └── lib/                          # API, storage, speech, native bridge
├── server/
│   ├── index.ts                      # Express API
│   ├── ark.ts                        # Configured model/image provider
│   ├── hermes.ts / hermesConfig.ts  # Local tutor/evolution provider
│   ├── speech.ts                     # Speech API/router
│   └── mobile*.ts                    # Mobile auth/bootstrap
├── speech/service.py                 # Python ASR/TTS service
├── android/ and ios/                 # Capacitor native projects
├── config/                           # Model/provider configuration
├── scripts/                          # Setup, doctor, start, and install flows
├── e2e/                              # Playwright product flows
├── docs/                             # Native, mobile, model documentation
├── public/ and resources/            # Web/app assets
└── package.json
```

Client state is separate from server state. The client owns local progress and
audio persistence; the server owns generated plans, feedback, roleplay,
tutoring, evolution, authentication gates, and speech routing.

### `english-foundation/`

Local-first Tauri desktop learning application.

```text
english-foundation/
├── src/main.tsx                      # React bootstrap
├── src/App.tsx                       # Learning views
├── src/data.ts                       # Static course content
├── src/progress.ts                   # Progress state transitions
├── src/progress.test.ts              # Domain tests
├── src/styles.css                    # UI styling
├── src-tauri/src/lib.rs              # Tauri library shell
├── src-tauri/src/main.rs             # Native entry
├── src-tauri/tauri.conf.json         # Window/bundle configuration
└── package.json
```

Unlike EasySay, Foundation has no server or external API in the current
implementation. Its native layer is primarily packaging and desktop hosting.

### `fde-playbook/`

Static/interactive React field manual.

```text
fde-playbook/
├── src/main.tsx                      # Single React bootstrap and application
├── src/styles.css                    # Complete visual/responsive system
├── index.html
├── vite.config.ts
└── package.json
```

The application is intentionally compact: content, interaction state, source
links, and views are co-located in `src/main.tsx`; styling is in one stylesheet.

### `agent-workforce-console/`

Deterministic local multi-agent orchestration console.

```text
agent-workforce-console/
├── src/App.tsx                       # Console views and persistence wiring
├── src/engine.ts                     # Task graph state machine
├── src/types.ts                      # Mission/agent/task contracts
├── src/data.ts                       # Initial demonstration mission
├── src/engine.test.ts                # State machine tests
├── src/styles.css                    # UI system
├── docs/research.md                  # Design research
└── package.json
```

Nexora is a self-contained demonstration. External model, CLI, sandbox, and
remote runtime integrations are described as future boundaries in
`agent-workforce-console/README.md`, not implemented dependencies.

## Generated, Cached, and External Trees

The following directories are meaningful to development but are not maintained
application source:

- `*/node_modules/`, `*/dist/`, `*/target/`, and native derived-data trees are
  build/dependency outputs.
- `delivery-control-center/inputs/`, `delivery-control-center/work/`, `delivery-control-center/settings/`, and
  `delivery-control-center/deliveries/` are local runtime, evidence, or generated output.
- `delivery-pilot/.workspace/` contains generated project versions and nested
  `.sandbox/` external references.
- `english-speaking-coach/.models/`, `english-speaking-coach/.venv-*`, `.cert/`, and `.local/` contain local
  models, environments, certificates, and native build caches.
- `opportunity-factory/dist/` and `test-results/` contain packaged output and
  test evidence.
- `technology-intelligence/assets/` and native icon trees are packaging assets.

These directories explain repository size and operational behavior but should
not be treated as peer architectural modules.

## Naming and Ownership Conventions

- Product directory names are stable ownership boundaries.
- Frontend bootstraps use `src/main.tsx`; native shells use `src-tauri/`,
  `ios/`, `android/`, `native/`, or Electron `src/main.js` as appropriate.
- Domain logic is usually named `domain/`, `data/`, `engine`, `progress`, or
  a focused module near its consumer.
- UI styling is local to the product, commonly `styles.css`, `App.css`, or
  feature-specific CSS.
- Tests are colocated beside TypeScript domain modules or placed under a
  product-level `tests/`/`e2e/` directory.
- Documentation is product-owned under `docs/` and is not a root-level
  architecture package.

## Navigation Guide

For a new product feature, first identify the owning directory in the table
above, then trace from its entry point into its domain/store/API/native
boundary. For cross-product delivery work, start at
`technology-intelligence/app/technology_explorer.py`, inspect the handoff file
contract, then follow either `delivery-control-center/src/main.js` or
`delivery-pilot/src-tauri/src/lib.rs`. For public product status, start at
`lifeyoume-platform/config/products.json` and
`lifeyoume-platform/platform/app.py`.
