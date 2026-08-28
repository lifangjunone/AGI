# Coding Conventions

**Scope:** first-party projects under `/Users/bytedance/Desktop/agi`, inspected 2026-08-28. Generated output, dependency caches, `node_modules/`, `dist/`, `build/`, `.workspace/`, and `.sandbox/` snapshots are excluded from convention claims. The nested `delivery-control-center/.sandbox/external-references/multica/` tree is treated as a vendored reference project, not as a repository convention.

## Repository-Level Organization

- The root is a project collection, not an application. Business source lives in independent directories listed in `README.md`.
- Each product owns its dependency manifest, README, build scripts, and verification commands. Examples are `delivery-pilot/package.json`, `english-speaking-coach/package.json`, and `delivery-control-center/package.json`.
- Cross-project handoff is file- and event-oriented. DeliveryPilot and Technology Exploration use named JSON contracts under the macOS Application Support directory; do not introduce direct imports between products.
- Keep generated artifacts and local caches isolated. The root README explicitly excludes `node_modules/`, `dist/`, `target/`, `.workspace/`, `.sandbox/`, `.dbg/`, `.build/`, `.cert/`, models, `.env`, and private certificates.
- Existing project documentation is a source of operational contract: update the relevant project README and root project table when a project-level workflow changes.

## TypeScript and React

- The dominant frontend stack is React + TypeScript + Vite. Entry points are conventionally `src/main.tsx`; application composition is in `src/App.tsx`.
- Use functional components and hooks. Components are PascalCase (`Dashboard`, `SpeechSettings`); hooks are camelCase with a `use` prefix (`useSpeechRecorder`).
- Domain/data helpers use camelCase file and function names (`english-speaking-coach/src/data/sentenceAnalysis.ts`, `agent-workforce-console/src/engine.ts`). Tests sit next to the implementation as `*.test.ts` or `*.test.tsx`.
- Types are explicit and commonly colocated in `src/types.ts` or declared near the boundary that owns them. Prefer discriminated unions and string literal unions for state machines, as in `delivery-pilot/src/domain/types.ts` and `agent-workforce-console/src/types.ts`.
- Use immutable state updates. Zustand stores use `create` and `persist` in `delivery-pilot/src/stores/taskStore.ts`; local React state uses functional `setState` updates in `english-speaking-coach/src/App.tsx`.
- Derive view state with pure helpers instead of mutating domain state. Examples: `getStageProjection` in `delivery-pilot/src/domain/projection.ts` and `advanceMission` in `agent-workforce-console/src/engine.ts`.
- JSX formatting is not uniform across subprojects. `delivery-pilot` and `english-foundation` generally use single quotes and no semicolons; `easysay`, `fde-playbook`, and `nexora` generally use double quotes and semicolons. Preserve the local file’s style.
- CSS is colocated by product or feature: `delivery-pilot/src/App.css`, `delivery-pilot/src/workforce/DigitalWorkforce.css`, and product-wide files such as `english-speaking-coach/src/styles.css`.
- Accessibility is an established frontend concern: use semantic labels, `aria-label`, keyboard focus styles, and reduced-motion handling where the product already provides them. `fde-playbook/src/main.tsx` and `fde-playbook/src/styles.css` are representative.
- Use `lucide-react` for icons in the React products. Keep icon-only controls labelled with `aria-label` and/or `title`.

## State, Persistence, and Boundaries

- Browser-local persistence is explicit and schema-shaped. Examples include Zustand persistence in `delivery-pilot/src/stores/taskStore.ts` and localStorage serialization in `english-speaking-coach/src/lib/storage.ts`.
- State transitions should preserve prior events or records rather than silently replacing history. DeliveryPilot appends typed task events; Nexora prepends bounded event and memory histories.
- For desktop/native boundaries, frontend code calls Tauri commands through `@tauri-apps/api`; shell, filesystem, process, and Accessibility operations belong in `delivery-pilot/src-tauri/src/` or the Swift sidecar, not in React components.
- Validate trust boundaries before filesystem writes. `delivery-pilot/src-tauri/src/lib.rs` canonicalizes and checks paths; `delivery-control-center/src/main.js` uses explicit data roots, file-name allowlists, temporary files, and SHA-256 envelopes.
- Use atomic persistence for important JSON. OneOPC writes a temporary file and renames it; DeliveryPilot’s Rust code follows the same temporary-write pattern for handoff status.
- Keep external credentials server-side. EasySay reads provider configuration in `english-speaking-coach/server/`; its README explicitly prohibits putting `ARK_API_KEY` in the frontend bundle or localStorage.

## Naming and Data Contracts

- JavaScript/TypeScript identifiers use camelCase; React components, classes, and types use PascalCase; constants/policies are frequently `UPPER_SNAKE_CASE` or frozen objects.
- Python follows snake_case for functions and variables, PascalCase for dataclasses/classes, and uppercase module constants. See `opportunity-factory/app/opportunity_engine.py` and `lifeyoume-platform/platform/app.py`.
- Rust follows snake_case for functions/modules and PascalCase for types. Tauri command functions are small boundary functions returning serializable values.
- Swift follows standard Swift lowerCamelCase for members and UpperCamelCase for types; the sidecar package is defined in `delivery-pilot/sidecars/macos-computer-use/Package.swift`.
- Event and status strings are part of the data contract. Use existing names rather than ad hoc labels: DeliveryPilot uses names such as `stage.retry_requested`; OneOPC uses `supervisor.tool_offline`; Nexora uses typed event kinds.
- Keep user-facing Chinese copy at the UI boundary. Internal IDs, stage names, event types, and field names are usually English/camelCase, while labels and error messages are localized per product.

## Error Handling

- TypeScript APIs throw `Error` with a user-safe message at the boundary. `english-speaking-coach/src/lib/api.ts` catches provider failures and returns deterministic local fallbacks for learning flows.
- Server endpoints validate request bodies with Zod before invoking providers. `english-speaking-coach/server/index.ts` maps `ZodError` to HTTP 400 and unexpected failures to a generic HTTP 503 message while logging the original error.
- Do not expose provider, filesystem, or credential details to users. Return stable Chinese messages and log diagnostic details only on the server/native side.
- Native Rust commands use `Result<T, String>` and convert filesystem, JSON, path, and network failures into contextual strings. Preserve cause text where it is useful for logs.
- Python services catch expected parsing, URL, timeout, and OS failures narrowly and return explicit degraded states. `lifeyoume-platform/platform/app.py` returns `offline` for health-check failures; `technology-intelligence/app/technology_explorer.py` has broader fallback handling around unreliable public feeds.
- JavaScript background loops intentionally prevent process crashes with `.catch(() => {})`, but this should be paired with persisted state or an event/incident record. OneOPC’s `TaskSupervisor` records incidents, retry counts, checkpoints, and bounded ledgers.
- Use explicit fallback behavior where the product promises offline/local operation. EasySay falls back to local plans, feedback, roleplay, and speech; Foundation and Nexora are deterministic local apps.
- Avoid swallowing errors in new code unless the operation is optional, a fallback is documented, or the failure is represented in state. Existing code contains some broad catches in `technology-intelligence/app/technology_explorer.py`; treat that as legacy integration behavior rather than a preferred default.

## Subproject Notes

- `delivery-pilot/`: strict TypeScript compiler checks (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) plus `oxlint`; domain logic is separated from stores/UI.
- `english-speaking-coach/`: double-quoted TypeScript, semicolon style, server/client split, Zod schemas, local-first fallback paths, and security middleware (`helmet`, CORS, rate limiting).
- `english-foundation/`, `fde-playbook/`, and `agent-workforce-console/`: small Vite apps with colocated domain/data modules. Foundation tends toward single quotes/no semicolons; the other two use double quotes/semicolons.
- `delivery-control-center/`: CommonJS Electron main-process modules, built-in Node APIs, explicit security policies, immutable policy objects, and persistence/recovery helpers in separate modules.
- `lifeyoume-platform/`, `opportunity-factory/`, and `technology-intelligence/`: Python-first macOS/server utilities, dataclasses and stdlib modules, HTML generation at the application boundary, and shell deployment/build scripts.

## Verification Expectations

- Run the project’s own commands from its directory. There is no root-level build, lint, or test command.
- Before changing a project, inspect its README and package manifest, then preserve its local formatter, import ordering, quote style, and error vocabulary.
- For a behavior change, update the nearest colocated unit test and the project README when commands, data paths, or user-visible guarantees change.
