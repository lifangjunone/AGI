# Architecture

**Repository:** `/Users/bytedance/Desktop/agi`  
**Mapped:** 2026-08-28  
**Scope:** Whole repository, excluding generated dependency/build trees from the architectural inventory

## Architectural Summary

This repository is a product workspace, not a single deployable system. The root
contains independently buildable applications and services. Each product owns
its source, dependencies, build configuration, tests, and runtime data policy.
There is no root package manager, shared source package, common database, or
central application bootstrap.

The architecture is therefore **federated by product** with a small set of
explicit integration contracts:

```text
Technology Exploration Agent
        │ local reports + requirement projects + demo handoffs
        ├──────────────> Opportunity Compass
        ├──────────────> OneOPC
        └──────────────> DeliveryPilot

LifeYouMe Platform
        │ product registry + loopback health checks + public links
        └──────────────> independently deployed products

Foundation / EasySay / Nexora / FDE Fieldbook
        └──────────────> standalone user-facing applications
```

The arrows represent filesystem, HTTP, or registry relationships; they are not
compile-time imports between root projects.

## Root Boundaries

The root `README.md` is the system catalog and explains the intended product
chain. The root `.gitignore` defines repository-wide exclusions, while each
project owns its operational details in its own README and manifests.

The meaningful top-level subprojects are:

| Subproject | Role | Relation to root |
| --- | --- | --- |
| `lifeyoume-platform/` | Product portal, operations, identity and billing service boundary | Shared control plane; discovers products through `config/products.json` |
| `technology-intelligence/` | macOS technology-signal collector and requirement matcher | Upstream intelligence producer; writes local reports and demo handoffs |
| `opportunity-factory/` | Opportunity scoring UI plus autonomous audit/factory service | Reads Technology Exploration reports; can expose the audit product |
| `delivery-control-center/` | Electron delivery control center | Consumes requirements and coordinates local tools, employees, runs, and delivery artifacts |
| `delivery-pilot/` | Tauri delivery console | Consumes Technology Exploration handoffs and runs delivery/runtime supervision |
| `english-speaking-coach/` | React/Express/Capacitor language-learning product | Standalone product with optional local/cloud AI and speech services |
| `english-foundation/` | Tauri desktop English fundamentals trainer | Standalone local-first desktop product |
| `fde-playbook/` | Vite/React educational field manual | Standalone static/interactive learning site |
| `agent-workforce-console/` | Vite/React deterministic multi-agent console | Standalone local demonstration of task-graph orchestration |

`delivery-control-center/deliveries/` contains a generated delivered application, not a second
root product. `delivery-pilot/.workspace/` contains generated project versions
and sandboxes, including external reference repositories; these are execution
inputs and evidence, not source dependencies of the main console.

## Entry Points

### Product and service entry points

- `lifeyoume-platform/platform/app.py` starts one of the platform roles selected
  by `SERVICE_ROLE` (`portal`, `ops`, `auth`, or `billing`).
- `technology-intelligence/app/technology_explorer.py` is the macOS application
  process, including collection, report generation, local HTTP/provider
  behavior, and requirement matching.
- `opportunity-factory/app/opportunity_engine.py` contains opportunity
  generation and scoring logic; `opportunity-factory/service/autonomous_factory.py`
  is the independent HTTP/SQLite factory service.
- `delivery-control-center/src/main.js` is the Electron main process. It creates windows,
  registers IPC handlers, manages local paths, launches or supervises tools,
  and coordinates delivery runs.
- `delivery-control-center/src/preload.js` is the renderer capability boundary. It exposes a
  narrow `window.oneopc` API backed by IPC.
- `delivery-pilot/src/main.tsx` mounts the React UI; `delivery-pilot/src-tauri/src/main.rs`
  delegates to the Tauri library in `delivery-pilot/src-tauri/src/lib.rs`.
- `english-speaking-coach/src/main.tsx` mounts the React client; `english-speaking-coach/server/index.ts`
  starts the Express API; `english-speaking-coach/speech/service.py` is the local speech
  service entry point.
- `english-foundation/src/main.tsx` mounts the UI; `english-foundation/src-tauri/src/main.rs`
  launches the Tauri shell.
- `fde-playbook/src/main.tsx` and `agent-workforce-console/src/main.tsx` are Vite/React
  browser entry points.

### Build and packaging entry points

Each frontend has a local `package.json`, `vite.config.ts`, TypeScript
configuration, and `index.html`. Native packaging is configured by
`delivery-pilot/src-tauri/tauri.conf.json`, `english-foundation/src-tauri/tauri.conf.json`,
`english-speaking-coach/capacitor.config.ts`, and `delivery-control-center/package.json`. Python/macOS packaging
is driven by `technology-intelligence/scripts/build.sh` and
`opportunity-factory/scripts/build.sh`.

## Layers and Dependency Direction

### Presentation layer

React views and components live under each product's `src/` tree. Examples are
`delivery-pilot/src/App.tsx`, `english-speaking-coach/src/components/`, `english-foundation/src/App.tsx`,
`fde-playbook/src/main.tsx`, and `agent-workforce-console/src/App.tsx`. Presentation code
usually owns local view state and delegates business operations to domain,
store, or API modules.

`delivery-control-center/src/renderer.js` is a browser-style renderer rather than React. It
maintains a centralized renderer state and updates HTML through DOM helpers.
`technology-intelligence/app/technology_explorer.py` and the platform render
HTML/templates directly from Python.

### Domain and application logic

- DeliveryPilot separates domain projections and policies into
  `delivery-pilot/src/domain/`, workforce decisions into
  `delivery-pilot/src/workforce/`, and client stores into
  `delivery-pilot/src/stores/`.
- Nexora puts its task-graph state machine in `agent-workforce-console/src/engine.ts` and
  domain contracts in `agent-workforce-console/src/types.ts`.
- Foundation puts learning state transitions in `english-foundation/src/progress.ts`.
- EasySay separates curriculum and sentence analysis in `english-speaking-coach/src/data/`,
  persistence in `english-speaking-coach/src/lib/storage.ts`, and API/native resolution in
  `english-speaking-coach/src/lib/api.ts` and `english-speaking-coach/src/lib/nativeConnection.ts`.
- OneOPC splits orchestration into focused main-process modules such as
  `delivery-control-center/src/task-supervisor.js`, `delivery-control-center/src/delivery-coordinator.js`,
  `delivery-control-center/src/digital-employees.js`, and `delivery-control-center/src/tech-intelligence.js`.

### Platform and integration layer

Native shells and servers form the boundary around UI/domain code:

- Tauri commands in `delivery-pilot/src-tauri/src/lib.rs` bridge React to
  Rust services, SQLite, child processes, and local handoffs.
- OneOPC IPC handlers in `delivery-control-center/src/main.js`, restricted by
  `delivery-control-center/src/preload.js`, bridge Chromium to filesystem, subprocesses, and
  native utilities.
- EasySay's `english-speaking-coach/server/index.ts` validates API input with Zod, applies
  CORS/security/rate limits, and delegates to model/speech routers.
- Platform services use `lifeyoume-platform/config/products.json` and private
  loopback health endpoints rather than importing product code.

## Core Data Flows

### Intelligence to delivery

1. `technology-intelligence/app/technology_explorer.py` collects public signals,
   normalizes them, scores them, and writes reports below the user's
   `Application Support/Technology Exploration Agent/reports/` directory.
2. It persists requirement projects and writes handoff records under
   `Application Support/Technology Exploration Agent/requirement-projects/` and
   `demo-handoffs/`.
3. `opportunity-factory/app/opportunity_engine.py` reads the reports read-only,
   derives opportunity candidates, and persists commercial validation state in
   its own support directory.
4. OneOPC can read requirements and technology context through its Electron
   main process. DeliveryPilot polls or receives `demo-handoff` events, verifies
   the requirement file and SHA-256 identity, and moves the request into a
   delivery run.

### Delivery execution

OneOPC stores source requirements, runs, settings, employee registry, and
recovery state under its data root. The main process detects local Work/Code
tools, assigns a project team, records stage events, and supervises execution.
The renderer receives snapshots and actions through the preload IPC surface.
Completed runs produce artifacts and may include a runnable system under
`delivery-control-center/deliveries/`.

DeliveryPilot follows a similar flow with stronger native separation:

```text
React UI
  -> Tauri invoke/listen
  -> Rust commands and services
  -> SQLite + filesystem + child processes
  -> generated workspace / sidecar / local HTTP runtime
  -> health and evidence snapshots
```

`delivery-pilot/src-tauri/src/delivery_runtime.rs` starts a generated Node
service only after checking `server.mjs`, `package.json`, and
`dist/index.html`, then probes `/health`.

### Learning product flows

Foundation is entirely local: static course data from
`english-foundation/src/data.ts` feeds React views; progress transitions in
`english-foundation/src/progress.ts` are persisted through browser
`localStorage`; speech uses WebView `speechSynthesis`.

EasySay has a local-first fallback architecture. The React client persists
profile, plan, progress, and records in `localStorage`, with audio blobs in
IndexedDB through `english-speaking-coach/src/lib/storage.ts`. API calls resolve either the
local/native route or configured server. The Express server delegates plan,
feedback, roleplay, tutoring, evolution, and speech work to
`english-speaking-coach/server/ark.ts`, `english-speaking-coach/server/hermes.ts`,
`english-speaking-coach/server/hermesConfig.ts`, and `english-speaking-coach/server/speech.ts`; failures
return deterministic/local fallback behavior in client modules.

## Shared Boundaries and Contracts

The repository's shared boundaries are deliberately coarse:

- **Product registry:** `lifeyoume-platform/config/products.json` stores stable
  product IDs, public URLs, loopback health URLs, lifecycle, category, and owner.
- **Health HTTP:** products expose private health endpoints that the platform
  checks; the platform does not read product databases.
- **Technology reports:** JSON files under the Technology Exploration support
  directory are consumed read-only by Opportunity Compass.
- **Demo handoff files:** `request.json` and `status.json` under
  `demo-handoffs/` form a file protocol between Technology Exploration,
  OneOPC, and DeliveryPilot.
- **Tauri command/event surface:** `delivery-pilot/src-tauri/src/lib.rs`
  defines the native API consumed by the React frontend.
- **Electron preload surface:** `delivery-control-center/src/preload.js` defines the only
  intended renderer-to-main capability path.
- **Generated delivery workspace:** a delivered application's own
  `package.json`, server, tests, and static output are an artifact contract,
  validated by DeliveryPilot before launch.

There is no shared TypeScript package across the root applications. Similar
concepts such as progress, tasks, technology, and delivery are independently
modeled per product.

## Architectural Characteristics

- **Deployment:** one process or native bundle per product; platform roles can
  run as separate systemd instances.
- **Persistence:** mostly local files, browser storage, SQLite, or per-product
  support directories; no repository-wide persistence layer.
- **Security:** native capability boundaries, path validation, hash checks,
  loopback health restrictions, API schemas, and local fallback behavior are
  implemented inside owning products.
- **Failure isolation:** product outages should not prevent other products from
  starting; platform status marks products unhealthy or reserved.
- **Evolution:** Technology Exploration is the upstream discovery plane,
  delivery-control-center/DeliveryPilot are alternative delivery execution surfaces, and the
  platform is the public/operations boundary.

## Architectural Risks

The federated layout limits coupling but also duplicates contracts and logic.
The file protocols between products are weakly typed across repositories and
depend on shared user-home paths. Generated sandboxes under
`delivery-pilot/.workspace/` and generated output under `delivery-control-center/deliveries/`
can be mistaken for maintained source unless tooling keeps them clearly
separate. The root has no orchestration manifest that can build or verify every
product consistently.
