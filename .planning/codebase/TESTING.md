# Testing and Verification

**Scope:** first-party projects under `/Users/bytedance/Desktop/agi`, inspected 2026-08-28. Test counts below exclude generated/dependency trees and nested `.sandbox` snapshots. There is no repository-wide test runner; verification is per subproject.

## Test Frameworks and Layout

| Subproject | Frameworks | Test location | Declared commands |
| --- | --- | --- | --- |
| `delivery-pilot/` | Vitest, Swift Package Manager tests; Rust has build/runtime code but no Rust test files found | `src/**/*.test.ts`, `sidecars/macos-computer-use/Tests/` | `npm run lint`, `npm run test`, `npm run build`, `swift build --package-path sidecars/macos-computer-use` |
| `english-speaking-coach/` | Vitest, Playwright, Python `unittest` | `src/**/*.test.{ts,tsx}`, `e2e/`, `speech/test_service.py` | `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `npm run speech:test` |
| `english-foundation/` | Vitest | `src/progress.test.ts` | `npm test`, `npm run build`, `npm run build:app` |
| `fde-playbook/` | No test files found | None | `npm run build` |
| `agent-workforce-console/` | Vitest | `src/engine.test.ts` | `npm test`, `npm run build` |
| `delivery-control-center/` | Node built-in `node:test`, Playwright in delivered system snapshot | `tests/*.test.js`, delivered system `tests/unit/` and `e2e/` | `npm run check`, `npm test`, `npm run pack` |
| `lifeyoume-platform/` | Python `unittest` | `tests/test_platform.py` | `python3 -m unittest discover -s tests`, `bash -n deploy/*.sh` |
| `opportunity-factory/` | Python `unittest`, Python compile checks, Objective-C syntax check | `tests/test_*.py` | `python3 -m unittest discover -s tests -v`, `python3 -m py_compile ...`, `clang -fobjc-arc -fsyntax-only ...` |
| `technology-intelligence/` | No repository test files found | None | `./scripts/build.sh`; manual app/report verification is documented |

## TypeScript Unit Tests

- Vitest imports are direct (`describe`, `it`, `expect`, and `vi` where needed). Tests are colocated with the module under test.
- `delivery-pilot/vite.config.ts` limits discovery to `src/**/*.test.ts`; this excludes TSX tests and native tests from the npm test command. The current frontend suite covers domain projections, automation, developer context, workspace naming, workforce state, and assignments.
- `english-speaking-coach/vite.config.ts` includes `src/**/*.test.{ts,tsx}`. Tests cover curriculum, sentence analysis/frames, dates, storage, native connection, and the main app. Provider-dependent operations are tested through deterministic fallback behavior rather than requiring a live provider.
- `english-foundation/src/progress.test.ts` tests pure state transitions with fixed dates and checks idempotency, streak continuity, reset behavior, and word-state movement.
- `agent-workforce-console/src/engine.test.ts` tests the deterministic mission state machine: paused no-op behavior, progress, dependency unlock, approval gates, and reset immutability.
- Tests generally use plain fixtures and `structuredClone`, fixed dates, and direct assertions. Mocking is light and targeted; `english-speaking-coach/src/lib/storage.test.ts` and `english-speaking-coach/src/lib/nativeConnection.test.ts` use Vitest mocks where browser/native boundaries require them.
- UI test coverage is stronger in `delivery-control-center/` than in the smaller Vite projects. OneOPC’s tests inspect rendered HTML or source-level security contracts for keyboard access, information clarity, lifecycle resilience, and desktop policies.

## End-to-End and Native Tests

- EasySay has four Playwright journeys in `english-speaking-coach/e2e/`: product learning loop, route practice, user-confirmed pass, and Hermes evolution. `english-speaking-coach/playwright.config.ts` runs one worker against a locally started Vite server at port 5174 with a mobile viewport and screenshots on failure.
- DeliveryPilot has a Swift test target in `delivery-pilot/sidecars/macos-computer-use/Package.swift`; the concrete geometry coverage is in `delivery-pilot/sidecars/macos-computer-use/Tests/DeliveryComputerUseV2Tests/DisplayGeometryTests.swift`.
- DeliveryPilot’s documented verification builds the Swift sidecar but does not expose a package-script test command for Swift tests. Run `swift test --package-path sidecars/macos-computer-use` when changing sidecar behavior.
- The delivered work-order system snapshot under `delivery-control-center/deliveries/OP-20260814072043-869C/system/` has Node unit, trace, and Playwright E2E commands. It is an output/version snapshot, not the main OneOPC source tree.
- No first-party end-to-end suite was found for Foundation, FDE Fieldbook, Nexora, LifeYouMe Platform, or Technology Exploration.

## JavaScript/Electron Verification

- `delivery-control-center/package.json` uses `node --check` over all critical CommonJS modules as a syntax gate before `npm test`.
- OneOPC tests use `node:test` and `node:assert/strict`, with deterministic fixtures and injected dependencies. `delivery-control-center/tests/task-supervisor.test.js` fixes time and injects process, persistence, launch, recovery, and cancellation functions.
- Electron security is tested as a contract in `delivery-control-center/tests/electron-content-boundary.test.js`: context isolation, disabled Node integration, sandboxing, navigation/new-window/webview rejection, permissions, downloads, CSP, and URL allowlists.
- OneOPC’s test suite also covers startup recovery, cancellation, draft integrity, toolchain discovery, delivery coordination, accessibility, UI density, status vocabulary, and performance-oriented layout rules. Many UI tests read local HTML/source or use the Electron runtime rather than a browser runner.
- `delivery-control-center/tests/` is broad but test scripts do not declare coverage thresholds or a coverage reporter. Treat passing tests as regression checks, not as proof of exhaustive coverage.

## Python Verification

- Python services use stdlib `unittest`, discoverable from each project’s `tests/` directory. Assertions emphasize contract validation, security boundaries, deterministic fixture generation, and filesystem output.
- `lifeyoume-platform/tests/test_platform.py` checks product registry schema and loopback health restrictions, PBKDF2 password verification, signed-session expiry/tamper rejection, reserved-product health behavior, and disabled billing defaults.
- `opportunity-factory/tests/test_opportunity_engine.py` checks opportunity count/shape, team scaling, rejection of weak matches, JSON/HTML persistence, and refresh metadata. `tests/test_autonomous_factory.py` covers the unattended factory separately.
- `english-speaking-coach/speech/test_service.py` uses `unittest`, NumPy, SoundFile, and fake model chunks to test config merging, committed defaults, audio resampling, and WAV synthesis without loading production models.
- `technology-intelligence/` has no automated test suite or compile command in its README. The closest verification is build execution and manual report/UI inspection; changes to feed parsing should add focused tests before being treated as regression-covered.
- `opportunity-factory` documents explicit `py_compile` checks for both the main engine and autonomous service. `lifeyoume-platform` documents shell syntax checks with `bash -n`.

## Build, Lint, and Type Gates

- React projects commonly use `tsc -b && vite build`; this is the production type/build gate for `delivery-pilot/`, `english-speaking-coach/`, `english-foundation/`, `fde-playbook/`, and `agent-workforce-console/`.
- `delivery-pilot/` additionally runs `oxlint` and has strict unused-code compiler options in `delivery-pilot/tsconfig.app.json`.
- `english-speaking-coach/` provides a separate `npm run typecheck` and validates client/server/native setup through doctor scripts such as `english-speaking-coach/scripts/doctor-speech-models.sh` and `english-speaking-coach/scripts/doctor-ios.sh`.
- `delivery-pilot/` has explicit sidecar and Tauri build scripts: `delivery-pilot/scripts/build-sidecar.sh` and `npm run build:app`. Rust dependency/build behavior is defined in `delivery-pilot/src-tauri/Cargo.toml`.
- `delivery-control-center/` uses `npm run check` for syntax, `npm test` for behavior, and Electron Builder packaging commands. No lint or typecheck command is declared.
- `lifeyoume-platform/`, `opportunity-factory/`, and `technology-intelligence/` rely on executable shell scripts for macOS/server packaging and deployment. Syntax checks are explicitly documented only for the first two.

## Verification Practices and Gaps

- README files are the authoritative execution guide. Run commands from the subproject directory because scripts, environment files, native toolchains, and ports are project-specific.
- Deterministic local fallback is part of the test contract for EasySay, Foundation, and Nexora; tests should not depend on cloud credentials or downloaded model files.
- Fixed clocks, temporary directories, fake providers, and injected process/filesystem adapters are preferred for reliability. Preserve these seams when adding tests.
- Native, network, process, and filesystem behavior is tested at contract boundaries rather than by requiring every real external dependency.
- There is no shared CI workflow at the workspace root, no root coverage policy, and no repository-wide formatting gate. A change touching multiple subprojects must run each affected project’s checks independently.
- `fde-playbook/` and `technology-intelligence/` currently have no automated tests. Their README verification is build/manual oriented, so regressions in interaction behavior or feed parsing can pass unnoticed.
- Rust production code in `delivery-pilot/src-tauri/src/` has no discovered Rust unit/integration test files; the current native confidence comes from TypeScript tests, sidecar Swift tests, builds, and manual Tauri verification.
- Test results and screenshots exist under product-local directories such as `opportunity-factory/test-results/`; treat them as evidence artifacts, not as runnable test definitions.
