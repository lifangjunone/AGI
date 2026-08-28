# OneOPC Product Quality Program

## Product Standard

OneOPC must behave like a native macOS delivery control center, not a collection
of web dashboards. Every screen must make the current state, primary action,
risk and next outcome understandable without requiring engineering knowledge.

## Whole-Product Baseline

Audit date: 2026-08-17

| Pillar | Baseline | First pass | Remaining gap |
|---|---:|---:|---|
| Copywriting | 3/4 | 3/4 | Remove remaining mixed-language operational copy |
| Visuals | 3/4 | 4/4 | Validate data-dense and failure states |
| Color | 3/4 | 3/4 | Increase secondary text contrast |
| Typography | 2/4 | 3/4 | Raise remaining 6-9px engineering labels |
| Spacing | 2/4 | 4/4 | Validate 1440x900 and long-content states |
| Experience Design | 3/4 | 4/4 | Complete destructive-action confirmation and onboarding |

Baseline: **16/24**
First-pass assessment: **21/24**

## First-Pass Remediation

- Management pages collapse the full execution fabric from 214px to 46px by
  default. It remains expandable and stays fully visible on Home and Workspace.
- Primary page content begins at 157px on 1080x700 instead of below 300px.
- Tool alternatives and employee actions have larger labels and hit targets.
- Global notifications expose success, information and failure semantics, remain
  visible long enough to read, support dismissal and announce through ARIA.
- Desktop keyboard operations support Command+1 through Command+5, Command+N
  and layered Escape dismissal.
- Technology Radar has a domain-specific live empty state and direct requirement
  import action instead of a large inert rectangle.
- Reduced-motion preferences disable nonessential avatar and radar animation.
- The signed macOS bundle uses a dedicated OneOPC Retina icon instead of the
  default Electron application icon.

## Second-Pass Remediation

- Employee deactivation, supervisor pause and checkpoint retry now use an
  in-product confirmation dialog with explicit impact and recovery language.
- Confirmation severity is contextual: destructive status changes use danger
  semantics while checkpoint recovery uses warning semantics.
- Employee deactivation and supervisor pause expose executable undo actions.
  Undo calls the actual persistence or supervisor API instead of only changing
  renderer state.
- Employee status, task control and employee form submission expose stable busy
  labels, `aria-busy` and duplicate-submission protection.
- Escape cancels the top confirmation layer without changing the underlying
  employee or task state.
- Runtime verification changed the built-in employee from active to inactive,
  then invoked Undo and confirmed that persisted state returned to active.

## Requirement Input Expansion

- The single New Requirement entry now supports direct text descriptions and
  existing requirement documents through a native segmented dialog.
- Project name is optional for text input. OneOPC derives a concise name from
  the first meaningful requirement sentence when omitted.
- Text requirements are normalized, archived as immutable Markdown, hashed with
  SHA-256 and passed through the same Run, version, team, supervision and
  technology-intelligence pipeline as file requirements.
- The developer evidence inspector identifies text-origin requirements as
  `文字描述 · 原始需求.md`.
- Command+Enter submits a valid text requirement; Escape closes the input layer.
- A real text requirement was created and verified across metadata, archived
  Markdown, SHA-256, run.json, task contract and technology evidence. The
  acceptance Run was removed afterward to keep production history clean.

## Third-Pass: Startup and Failure Resilience

- The macOS window is created before tool discovery and supervision bootstrap,
  so cold start presents an immediate branded recovery surface instead of
  waiting behind a blank or invisible window.
- Tools, technology settings, employee assets, supervisor health and project
  history recover in parallel. A failure in one module does not block the other
  modules or trap the application on its boot screen.
- Boot progress exposes five module states, a real percentage and an accessible
  `progressbar`. Reduced-motion preferences disable boot and scanner animation.
- A persistent health banner summarizes degraded capabilities in customer
  language. Raw IPC wrappers and stack details remain in the developer console.
- Home, History, Supervisor, Employees and Technology Radar distinguish unknown
  data from a legitimate zero state. Failed metrics render as `—`; cached data
  remains visible only with an explicit stale-state warning.
- Every degraded module supports scoped retry, while the health banner can retry
  all failed modules. Retry controls expose busy state and prevent duplicates.
- Technology settings stay disabled while unavailable and restore persisted
  values and editability only after a successful retry.
- Project refresh is serialized and aligned to the 10-second supervision
  heartbeat, eliminating overlapping reads and reducing idle disk I/O.
- Development builds support deterministic finite fault injection through
  `ONEOPC_FAULT_MODULES`, such as `runs:2` or `settings:once`. Packaged builds
  always ignore this mechanism.

## Fourth-Pass: Readability and Keyboard Completion

- All CSS font declarations now enforce a 10px minimum. Runtime inspection
  confirmed zero visible text nodes below 10px across Home, History,
  Supervisor, Employees, Radar and both Workspace views.
- Secondary text contrast increased globally while preserving the restrained
  dark control-center hierarchy.
- Tool alternatives remain fully readable at 1080px by removing redundant
  APP/CLI suffixes only in the narrow layout.
- Buttons, inputs, selects, text areas and custom focusable controls share a
  high-contrast two-layer `:focus-visible` treatment.
- Requirement, Employee and Action dialogs now expose title/description
  relationships, deterministic initial focus, Tab/Shift+Tab containment and
  focus restoration to the invoking control.
- Destructive confirmation always focuses Cancel first. Runtime verification
  confirmed Cancel focus and restoration to the original Refresh control.
- Requirement input tabs implement roving tabindex and Left/Right/Home/End
  navigation. Runtime verification confirmed panel state and ARIA state stay
  synchronized.
- Command+1 through Command+5 now move focus to the destination page heading,
  preventing focus from remaining inside a newly hidden page.
- Graph expansion focuses its close command and restores focus to the invoking
  control when dismissed.
- Workspace top-bar grid allocation was corrected so navigation, Run identity
  and view controls remain single-line at 1080px.

## Fifth-Pass: Density and Interaction Performance

- A deterministic development-only stress profile now generates 72 delivery
  versions across three long-name projects, 52 employees, 72 supervised tasks,
  72 technology signals and 320 events in the densest Run.
- Packaged builds ignore `ONEOPC_STRESS_PROFILE`; the profile only decorates
  read-only IPC results and never writes synthetic data to project storage.
- History renders eight projects per batch and creates no version DOM while a
  project is collapsed. Expanded projects render 12 versions per batch.
- Employees render 12 records, Tasks 10 records and Radar 15 signals per batch.
  Full counts remain visible in metrics while explicit controls disclose the
  number currently added and remaining.
- Offscreen history groups, employee records, task rows and radar signals use
  Chromium `content-visibility` with stable intrinsic dimensions.
- Ten-second refreshes use a deterministic data signature. Unchanged data only
  updates navigation counts and does not rebuild hidden or visible pages.
- Every top-level page and each project workspace keeps an independent scroll
  position. First entry starts at the top; returning restores the prior place.
- Render budgets are enforced in the Renderer and exposed through
  `window.__oneopcPerformance` for Electron acceptance. Long Tasks are retained
  in a bounded diagnostic history.
- Opening a Run now performs one budgeted workspace render instead of two.
- Render timing records failures as well as duration, exposing partial-render
  defects that would otherwise look like a successfully opened page.

## Sixth-Pass: Reversible Task Termination

- Supervisor cancellation now preserves the prior Run status, prior supervision
  state and a deep copy of the active checkpoint before entering a terminal
  state.
- Every cancel request is atomically persisted as
  `control/control-request.json`; the executor contract requires checking this
  file before each external side effect.
- Trae task cancellation focuses the application and attempts semantic Stop and
  Cancel controls. Only an Accessibility method is accepted as confirmed
  external evidence.
- If the current task is not active, termination is confirmed without closing
  the tool application. If Accessibility cannot confirm Stop, supervision still
  terminates but the UI explicitly reports external stop as pending.
- Cancelled Runs are terminal to the ten-second supervisor scan, so they are not
  restarted or resumed behind the user's back.
- Undo first atomically replaces the cancel request with a resume request. Only
  then does it restore the exact checkpoint and prior state, and submit task
  recovery when the prior task was active.
- Task cards expose a destructive Terminate command, a product confirmation
  layer, busy state, confirmed/pending evidence, a persistent Undo command and
  a Toast undo shortcut.
- Tool processes remain visible and online after task termination; cancelling a
  Run never masquerades as quitting the customer application.
- A development-only in-memory supervision sandbox validates actions without
  writing real Runs or operating Trae. Packaged builds cannot enable it.

## Seventh-Pass: Native macOS Window Lifecycle

- The first BrowserWindow stays hidden until `ready-to-show` and uses the
  product background color, preventing an unfinished or white frame from
  appearing during renderer startup.
- Normal bounds, owning display, maximized state and full-screen state are
  persisted atomically under the application settings directory. Quit waits
  for the latest state write instead of racing application teardown.
- Valid negative coordinates remain on secondary displays. Removed displays,
  corrupt state and windows below the minimum visible area recover to the
  primary work area while preserving a usable size.
- Display add, remove and metric-change events revalidate every open window.
  Recovered bounds are immediately persisted so an invalid position cannot
  recur on the next launch.
- Closing the final window leaves task supervision running. A one-time native
  notification explains the background state and can restore the control
  center without restarting the process.
- Dock activation, second-instance launch, notification click and the native
  Show Control Center command all use one `showMainWindow()` recovery path.
- The native macOS menu exposes requirement creation, five product destinations
  and supervision actions through a fixed Context Bridge command allowlist.
  Renderer commands reuse existing controls, busy states and error handling.
- The standard Electron full-screen role retains native behavior while
  enter/leave events rebuild the menu with localized Enter/Exit wording,
  keeping the visible command synchronized with the real window state.

## Eighth-Pass: Information Transparency and Scan Density

- A six-pillar review of all five top-level pages at 1080x700 identified
  ambiguity and scan density, rather than decoration, as the highest-value
  remaining customer-experience issue.
- Technology Radar now has explicit columns for project/status, preferred
  open-source solution and match score. Rows localize execution status and
  expose `满分 100` or `暂无评分` instead of presenting an unexplained number.
- Radar rows include a complete accessible name with project, status, selected
  solution and score. Missing candidates render an em dash and never
  masquerade as a measured zero score.
- The global execution footer and supervisor protocol use customer-readable
  Chinese states instead of `real execution`, `idle`, `none` and English
  checkpoint shorthand.
- Task metrics remain in one four-column scan line at 1080px, moving the active
  task card into the first viewport without reducing information.
- Digital employees remain in a two-column asset view at 1080px. The first
  viewport now presents four employee identities and animated portraits rather
  than stretching one record across the full page.
- Tool alternatives, execution-environment controls and text commands use a
  minimum 32px target, improving trackpad accuracy without expanding the
  surrounding control-center chrome.

## Ninth-Pass: 980x640 Compact Desktop

- The native minimum window now matches the explicit 980x640 product
  requirement instead of blocking customers at 1080x700.
- All five top-level pages preserve their information hierarchy at the compact
  size: Home exposes metrics and recent delivery, History shows three project
  groups, Tasks shows the first supervised task, Employees presents two full
  employee assets and Radar shows four technology signals in the first frame.
- Task metrics remain four columns and employee assets remain two columns at
  980px. The compact layout increases scan density without changing data or
  hiding customer decisions.
- A long technology recommendation exposed a 90px overflow in the executive
  workspace. Its flex text owner now permits shrinking while the visible title
  uses ellipsis and the score remains independently readable.
- Requirement input, employee creation and destructive confirmation dialogs
  fit inside 980x640 without internal overflow. Initial focus and the
  destructive-confirmation Cancel default remain intact.
- History filters and employee actions use 32px targets; employee form fields
  use at least 34px targets throughout the compact window.

## Tenth-Pass: Native Editing, Help and Product Identity

- A standard macOS Edit menu now exposes Undo, Redo, Cut, Copy, Paste,
  Paste-and-Match-Style, Delete and Select All through native Electron roles.
  Text editing remains owned by the focused platform control rather than a
  custom renderer implementation.
- The Help menu provides a concise four-step delivery guide, privacy and local
  data boundaries, and direct access to the application data directory.
- Native help can open the existing requirement workflow and returns focus to
  the project title field without duplicating renderer business logic.
- The privacy notice states which delivery assets remain local, when enabled
  technology sources are used, the verified external-link boundary and the
  distinction between closing a window and quitting supervision.
- The About panel now displays OneOPC product name, product version, local-first
  positioning, core capabilities and copyright. Electron's internal version is
  intentionally hidden.
- macOS About uses the signed application Bundle icon. Development Electron
  processes retain Electron's host icon by platform design and are not treated
  as release evidence.

## Eleventh-Pass: Unified Status Vocabulary

- A runtime audit found two functions named `supervisionStateText()`. Function
  hoisting caused the later workspace mapping to override the task-supervisor
  mapping, leaking raw `failed` state into customer-facing task cards.
- Supervision now has one authoritative mapping for queued, running,
  recovering, stalled, paused, completed, failed and cancelled states.
  Cancellation is consistently presented as `已终止`.
- Run, supervision, task evidence, process health, control capability,
  coordination, technology and recovery-reason mappings use explicit
  customer-readable fallbacks. Unknown backend values become a precise
  `待确认` state instead of appearing verbatim.
- Task cards replace `OFFLINE`, `unknown` and `seq` with `进程未运行`,
  localized stop evidence and `序号`. Stable technical identifiers such as PID
  and checkpoint IDs remain visible where they support diagnosis.
- Developer recovery codes such as `tool_process_offline` and
  `task_heartbeat_timeout` are translated into operational conclusions while
  detailed evidence remains available in the event inspector.
- Combined task/process evidence removes duplicate output such as
  `进程未运行 · 进程未运行` without discarding either layer when they differ.

## Twelfth-Pass: Control-Center Runtime Self-Healing

- BrowserWindow now handles renderer-process loss, main-frame load failure and
  sustained unresponsiveness instead of leaving a permanent frozen or blank
  control center.
- A crashed Renderer is hidden, reloaded after 250ms and shown only after the
  replacement page finishes loading. Window bounds and the independent task
  supervisor remain owned by the surviving main process.
- Automatic recovery is limited to two attempts in 60 seconds. A third failure
  stops the reload loop and presents a native choice between manually reloading
  the control center and closing the failed window while supervision continues.
- Electron's platform unresponsive signal is retained and supplemented by a
  sandbox-preload heartbeat every two seconds. Two main-process checks after a
  10-second stale threshold start an additional eight-second grace period,
  avoiding false alarms from short stalls.
- The unresponsive Sheet states that supervision is uninterrupted and identifies
  the latest locally saved draft as the recovery boundary. Manual reload
  forcefully replaces the frozen Renderer before loading the app again.
- Recovery commands are allow-listed and queued in preload until the renderer
  registers its listener, eliminating a measured `did-finish-load` startup
  race. Successful recovery produces a visible product Toast.
- Runtime evidence is atomically stored in `settings/runtime-recovery.json`,
  retains only the latest 20 events and records no requirement body or customer
  content.

## Thirteenth-Pass: Durable Input Drafts

- Text requirements and digital-employee forms save fixed, allow-listed fields
  after 350ms of inactivity without giving the sandboxed Renderer arbitrary
  file access.
- Drafts are serialized through the main process and atomically replaced at
  `settings/input-drafts.json`. Requirement bodies never enter the runtime
  recovery audit.
- Closing or cancelling a form flushes its latest values before dismissing the
  dialog. Reopening after a Renderer crash or full process restart restores the
  matching draft, character count and form context.
- Successful requirement import or employee creation clears only the matching
  draft, preventing stale content from appearing after a completed action.
- Both dialogs expose polite live save state, explicit local-storage wording
  and a visible failure state. The native privacy notice includes unsubmitted
  drafts in the local asset boundary.

## Fourteenth-Pass: First-Viewport Priority and Draft Control

- The local execution environment now defaults to a 46px health summary on Home
  as well as the four management pages. Customers can still expand the complete
  Work, Code and optional technology configuration without leaving the page.
- Requirement and employee forms reveal a compact trash command only when the
  current fields differ from their baseline. The icon has a native tooltip,
  accessible name and stable 34px target.
- Draft deletion uses the shared danger dialog with Cancel focused by default.
  Cancelling keeps all fields; confirming restores a blank requirement or the
  employee registry record before atomically clearing only that draft.
- The employee close action is labeled `稍后继续`, accurately reflecting that
  unsaved changes remain recoverable. Opening and closing an unchanged employee
  no longer creates a false draft.
- A fresh six-pillar signed-package audit scores 23/24. Typography remains 3/4
  because some auxiliary metadata intentionally stays at the confirmed 10px
  density floor.

## Fifteenth-Pass: Adaptive Interface Density

- The native Display menu adds Standard and Comfortable radio choices plus
  `Command+Shift+D`. Menu checks rebuild with full-screen state instead of
  drifting from the active preference.
- Preferences are normalized, atomically stored at
  `settings/ui-preferences.json` and restored before normal Renderer startup.
  Unknown or damaged values fail safely to Standard.
- Comfortable density raises selected auxiliary text from 10px to 11px and form
  input text to 12px. It never uses browser zoom, whole-page scaling or changed
  fixed-control geometry.
- The native menu and sandboxed Renderer share one main-process setter. Changes
  broadcast through the fixed command allow-list and produce a product Toast.
- The six-pillar UI audit now scores 24/24: high-volume users retain Standard
  density while customers needing stronger readability have a verified,
  persistent Comfortable mode.

## Sixteenth-Pass: Close-Time Draft Durability

- Every requirement or employee input event synchronously stages only its fixed
  allow-listed fields in main-process memory before the 350ms disk debounce.
  No synchronous filesystem I/O runs on the Renderer thread.
- Native window close and application quit both request a Renderer flush, then
  persist the captured main-process stage as the final authoritative value.
  This ordering prevents a destroying Renderer from overwriting the newest
  content with an empty payload.
- Flush acknowledgements are bound to the originating `webContents.id`; another
  window cannot complete the request. A 1.2-second timeout prevents a frozen
  Renderer from blocking window close indefinitely.
- `before-quit` waits for draft, window-state and UI-preference atomic write
  queues before allowing the second quit event. Normal macOS window close keeps
  the supervisor process alive after the same durability gate.
- Successful submission or explicit discard clears the staged value and disk
  draft together, so a later close cannot resurrect committed or deleted text.

## Seventeenth-Pass: Draft Integrity and Corruption Recovery

- Draft storage is upgraded from the legacy single-file schema to a v2 envelope
  containing a save timestamp and SHA-256 integrity digest over the complete
  allow-listed payload.
- `input-drafts.json` and `input-drafts.backup.json` are independently written
  through temporary files and atomic rename. The recovery copy is committed
  first, so an interrupted primary replacement still leaves the newest complete
  value available.
- Startup validates both copies, chooses the newest valid digest, quarantines
  malformed or mismatched files with a `.corrupt-*` suffix and reconstructs any
  missing or stale copy. Legacy v1 files migrate without losing content.
- Main-file recovery, backup reconstruction and unrecoverable dual corruption
  use distinct customer-facing messages. The notice is repeated when the draft
  form first opens, remains a polite live region and does not expose draft
  content in audit logs.
- When both copies fail validation, OneOPC never invents recovered content. It
  opens an empty form, surfaces an error and regenerates clean copies only after
  an explicit save or clear action.

## Eighteenth-Pass: Electron Content Boundary

- BrowserWindow now explicitly fixes `webSecurity`, context isolation, sandbox,
  disabled Node integration, disabled insecure content and disabled `webviewTag`
  rather than relying on Electron defaults.
- Main-process `will-navigate` and `will-redirect` handlers reject all in-window
  navigation. `setWindowOpenHandler` denies new windows and
  `will-attach-webview` denies embedded browser processes.
- The default Session rejects permission checks and requests, device access,
  screen capture and downloads. OneOPC's native menu fullscreen and main-process
  notifications remain independent of page permissions.
- CSP additionally denies frames, media, workers and manifests while retaining
  the existing no-network, no-object, no-base and no-form-action policy.
- Delivered localhost systems and verified GitHub/Hugging Face references still
  leave OneOPC only through the existing URL-whitelisted IPC and open in the
  customer's default browser.

## Nineteenth-Pass: Local Draft Privacy Lifecycle

- Corrupt draft quarantine files are recognized through an exact filename
  allow-list, retained for no more than seven days and capped at the four newest
  files. Unrelated customer files in the settings directory are never selected.
- When both requirement and employee drafts become empty, all recognized
  quarantine copies are destroyed immediately instead of waiting for startup
  retention cleanup. Keeping either draft preserves recovery evidence.
- Atomic-write temporary files for window state, UI preferences, runtime
  recovery and draft copies are removed after 24 hours. Active or unrelated
  files are excluded by strict filename matching.
- Housekeeping runs before settings are loaded and the privacy menu explains the
  same retention and immediate-destruction behavior to the customer.

## Twentieth-Pass: Home Operational Clarity

- A six-pillar audit of the signed Home, Supervisor, Employees, Radar and
  Requirement views at 980x640 plus Home at 1440x900 found no structural
  overflow. The remaining high-value gap was operational priority: two stalled
  tasks were visible only after entering Supervisor while wide Home left its
  lower viewport unused.
- Home now exposes a labeled Delivery Pulse with four stable categories:
  attention required, actively running, waiting for takeover and latest
  delivery. Each item shows a real count, the highest-priority project and a
  customer-readable state instead of another decorative metric.
- Attention, active and queued pulse items open Supervisor, expand the rendered
  batch when necessary, scroll the exact task into view and place keyboard focus
  on its title. Task positioning is immediate so a live supervision refresh
  cannot interrupt a long smooth-scroll animation; reduced-motion preference
  disables hover movement.
- Supervisor refresh captures the focused task title, task action or evidence
  control and its viewport position before replacing live task rows, then
  restores both. If a state transition removes an action, focus safely falls
  back to that task's title instead of the document body.
- Navigation, Home and Supervisor share one `taskNeedsAttention()` predicate, so
  their alert counts cannot drift through duplicated state rules.
- The latest-output placeholder is replaced by a delivery receipt sourced from
  the persisted deployment URL, version, deployment time, service status,
  acceptance event and quality-gate evidence.
- Wide Home shows four recent deliveries and all four pulse items before the
  status bar. At 980px the receipt and two-column pulse remain below the
  established first-viewport priorities without horizontal or item overflow.

## Verified Metrics

- Viewports: 980x640, 1080x700 and 1440x900
- Horizontal overflow: none on Home, Delivery, Supervisor, Employees or Radar
- Top-level execution-fabric height: 46px collapsed, 219px expanded at 980x640
- Regression tests: 160 passing
- Confirmation dialogs: verified at 1080x700 and 1440x900 with no overflow
- Cancel invariant: employee and task state remain unchanged
- Undo invariant: employee status returns from inactive to active through IPC
- Persistent `runs` failure: Home, Supervisor and Employees show unknown-state
  semantics with no false zero counts or layout overlap at 1080x700
- Finite `runs:2` failure: scoped retry restored the version count, removed all
  failure cards and dismissed the health banner
- Finite `settings:2` failure: controls remained disabled through the second
  failure, then restored `smart / computer_use` and re-enabled both selectors
- Visible runtime font floor: 10px on all top-level pages and both role views
- Keyboard modal invariant: initial focus, bidirectional focus loop and
  invoking-control restoration verified in Electron
- Workspace top bar: 1080px document/client width parity with all navigation
  controls fixed at 32px height and no wrapped labels
- Stress Home: 72 versions, 638 DOM nodes, 9.5ms maximum render, 0 long tasks
- Stress History: collapsed groups create 0 version rows; an expanded
  24-version project creates 12 rows before explicit continuation
- Stable refresh: after 11 seconds, render count, 834-node DOM and 240px scroll
  position remained unchanged
- Stress Employees: 52 records fully loaded, 1.7ms maximum batch render
- Stress Tasks: 72 records fully loaded, 2.6ms maximum batch render
- Stress Radar: 72 signals fully loaded, 0.7ms maximum batch render
- Stress Workspace: 320 events, 40 current-stage rows, 2.9ms complete render,
  0 render failures and 0 long tasks
- Page scroll isolation: Employees restored 500px after Tasks opened at 0px
- Stress layouts: 1080x700 and 1440x900 document/client width parity
- Packaged isolation: with `ONEOPC_STRESS_PROFILE=1`, signed build still loaded
  2 real projects / 9 real versions and exposed 0 `STRESS-*` records
- Cancel confirmation: dialog focused Cancel by default and explained tool,
  checkpoint and undo impact before mutation
- Confirmed cancel: state remained cancelled across an 11-second scan,
  `needsTaskResume=false`, checkpoint unchanged and external evidence recorded
- Pending cancel: attention count changed 8→9, UI exposed
  `accessibility_unconfirmed`, and no success claim was shown
- Undo cancel: state returned to running, checkpoint remained unchanged,
  attention count returned 9→8 and events recorded
  `cancel → undo_cancel → task_resumed`
- Cancellation layouts: 1080x700 and 1440x900 width parity, 0 long tasks
- Packaged cancellation isolation: stress and pending-stop variables produced
  0 synthetic task rows; completed tasks exposed 0 terminate commands
- Window restoration: normal, maximized and full-screen states survived window
  closure and process relaunch while retaining the last normal bounds
- Offscreen recovery: `x=9000`, `y=-9000`, unknown display state recovered to a
  fully visible 1180x760 window and atomically repaired the persisted state
- Background lifecycle: closing the final window kept the main process,
  supervisor and native menu alive; menu and second-instance actions restored
  the same control center
- Native menu routing: Technology Radar opened with its heading focused and New
  Requirement opened with the project-title field focused
- Full-screen menu: a restored full-screen window exposed `退出全屏幕`; returning
  through the macOS shortcut immediately restored `进入全屏幕`
- First-frame invariant: restored windows were hidden through renderer startup
  and shown only after `ready-to-show`
- Signed packaged layouts: 1080x700 and 1440x900 both matched document/client
  width, produced 0 horizontal overflow and 0 Long Tasks, and kept Home render
  time below 3.6ms
- Packaged test isolation: injected stress and startup-fault variables produced
  0 `STRESS-*` records, no health warning and the unchanged 9-version history
- Packaged background recovery: closing the only window left the signed main
  process alive; a second launch restored one 1440x900 window at its persisted
  position without creating a duplicate main process
- Signature: `codesign --verify --deep --strict` passed with an Apple
  Development identity, hardened runtime, Team ID and timestamp
- Eighth-pass task layout: four 258x79 metrics remained on one line at 1080x700;
  the first supervised task and all controls remained visible with 0 overflow
- Eighth-pass radar density: five data rows plus column headings fit the
  1080x700 viewport; 72-signal stress rendering completed in 0.4ms with 0 Long
  Tasks and complete accessible score descriptions
- Eighth-pass employee density: two 507px columns presented four employee cards
  in the 1080x700 viewport with 0 text overflow; the 52-employee stress render
  completed in 1ms with 0 Long Tasks
- Eighth-pass 1440 layouts: Tasks, Employees and Radar matched document/client
  width, produced 0 horizontal overflow and retained 0 Long Tasks
- Eighth-pass signed build: normal 1080x700 startup loaded 9 real versions and
  0 stress records; Radar rendered in 1.1ms with 0 Long Tasks, explicit
  `80 / 满分 100` scoring and `— / 暂无评分` for unmatched projects
- Ninth-pass compact pages: Home, History, Tasks, Employees and Radar matched
  980x640 document/client width with 0 horizontal overflow and 0 Long Tasks
- Ninth-pass workspace: executive overflow changed from 90px to 0 while all
  eight stage employees remained visible; executive and developer rendering
  stayed within the 60ms budget at 7.1ms maximum
- Ninth-pass dialogs: Requirement 720x552, Employee 620x466 and Action 480x233
  all remained inside the 980x640 viewport with 0 internal overflow
- Ninth-pass wide regression: all five pages and both workspace views retained
  0 horizontal overflow at 1440x900
- Ninth-pass signed build: the native window accepted 980x640, atomically saved
  the bounds on Command+Q and restored the same `[260,150] / 980x640` frame
  after a full packaged-process restart
- Tenth-pass native editing: Select All and Cut cleared the focused requirement
  field, Undo restored the original text, and native Paste inserted clipboard
  content while the live character count updated to 6
- Tenth-pass help: the native Sheet exposed `关闭` and `新建交付需求`; selecting
  the action closed the Sheet, reopened the existing 980x640 workflow, focused
  `requirementTitle` and produced 0 dialog overflow
- Tenth-pass privacy: the native Sheet exposed the complete local-data,
  external-source and background-lifecycle boundaries plus a direct data-folder
  action
- Tenth-pass signed build: the menu bar identified the app as `OneOPC`, About
  used the signed shield icon and showed only product version `0.1.0`; the
  980x640 main window exposed all native Edit items and the complete Help Sheet
- Tenth-pass packaged editing: Help opened the requirement workflow, native
  Select All and Paste inserted `正式包粘贴完成`, the live count changed to 7 and
  both dialog and page overflow remained 0
- Eleventh-pass task stress: 72 supervised Runs rendered `失败`, `监管中` and
  `已完成`; offline tools rendered `进程未运行`, checkpoints rendered `序号 0`
  and five raw-enum leak checks all returned false at 980x640
- Eleventh-pass cross-view: History exposed only localized Run states and the
  developer workspace exposed `失败` plus a single `进程未运行`; both retained
  0 horizontal overflow and 0 Long Tasks
- Eleventh-pass wide regression: Home, History, Tasks, Employees, Radar and the
  developer workspace all returned 0 raw-state leaks and 0 horizontal overflow
  at 1440x900; workspace rendering remained within budget at 5.2ms
- Eleventh-pass signed build: injected development stress flags still loaded
  only 9 real versions and 0 stress records; Home, History and Tasks returned
  0 raw-state leaks, 0 horizontal overflow and 0 Long Tasks at 980x640
- Twelfth-pass crash recovery: killing the Renderer with signal 9 preserved the
  main-process PID, replaced the Renderer in about 440ms, restored all 72 stress
  versions at 980x640 and displayed `控制中心已从运行异常中自动恢复`
- Twelfth-pass recovery limit: the third stable Renderer failure within 60
  seconds created no automatic replacement and displayed the native
  `控制中心连续恢复失败` Sheet while the main process remained alive
- Twelfth-pass hang recovery: a real 99% CPU Renderer loop was detected by the
  heartbeat fallback, identified the latest locally saved draft boundary and was
  forcefully replaced after the user selected Reload; window size, data and
  health state recovered with 0 horizontal overflow
- Twelfth-pass false-positive check: 15 seconds of healthy post-recovery
  heartbeat traffic created no Sheet and no additional runtime-recovery event
- Twelfth-pass signed build: killing the packaged Renderer preserved the main
  PID, restored 9 real versions and 0 stress records in about 400ms, displayed
  the recovery Toast and produced 0 overflow plus 0 Long Tasks at 980x640
- Twelfth-pass packaged wide regression: all five top-level pages and the
  developer workspace returned 0 overflow, healthy module state and 0 Long
  Tasks at 1440x900; workspace rendering peaked at 4.2ms
- Thirteenth-pass crash recovery: requirement title, 42-character description
  and live character count survived a real Renderer `SIGKILL`; the restored
  dialog reported `已恢复上次未提交的需求草稿` with 0 overflow and 0 Long Tasks
- Thirteenth-pass employee recovery: all six editable employee fields and the
  `builder` role survived a second Renderer `SIGKILL`; the restored dialog
  reported `已恢复上次未提交的员工草稿` with 0 page overflow and 0 Long Tasks
- Thirteenth-pass process restart: a requirement draft survived termination and
  relaunch of the complete Electron process, restored the title-field focus and
  returned 0 horizontal overflow plus 0 Long Tasks
- Thirteenth-pass signed build: the Apple Development signed package preserved
  main PID `46938`, replaced the killed Renderer with PID `47037`, restored a
  36-character requirement plus recovery Toast, and retained 9 real versions,
  healthy modules, 0 overflow and 0 Long Tasks at 980x640
- Thirteenth-pass data cleanup: the isolated validation profile ended with
  `requirement: null` and `employee: null`, proving test content was not retained
  after explicit draft clearing
- Fourteenth-pass first viewport: Home started with `compact-toolchain=true`,
  a 46px execution summary, Recent Deliveries at y=401 and 0 horizontal overflow
  at 980x640; explicit expansion restored the full 219px configuration surface
- Fourteenth-pass requirement discard: the trash command changed from hidden to
  visible only after input, the Sheet focused Cancel, cancellation retained all
  fields and confirmation restored empty fields, count 0 and title-field focus
- Fourteenth-pass employee discard: an unchanged `OPC-01` record exposed no
  trash command or draft; after editing, confirmation restored `领航`, removed
  the command and left the persisted employee registry untouched
- Fourteenth-pass draft cleanup: both isolated runtime tests ended with
  `requirement: null` and `employee: null`; all reviewed views retained 0
  horizontal overflow
- Fourteenth-pass layout matrix: Home, History, Tasks, Employees and Radar each
  retained a 46px execution summary, healthy module state and 0 horizontal
  overflow at both 980x640 and 1440x900
- Fourteenth-pass performance: 0 Long Tasks; Home peaked at 11.7ms against its
  24ms budget and all management pages stayed below 0.8ms against 40-50ms
  budgets
- Fourteenth-pass signed build: 9 real versions loaded at 980x640 with a 46px
  execution summary, healthy modules, 0 overflow and 0 Long Tasks; the discard
  Sheet focused Cancel, confirmation restored empty fields and the final formal
  data file retained `requirement: null` and `employee: null`
- Fourteenth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-18 05:13:10`
- Fifteenth-pass live switch: Standard rendered navigation and eyebrows at
  10px; Comfortable changed both to 11px immediately while retaining the 46px
  execution summary, 0 overflow and 0 Long Tasks
- Fifteenth-pass invalid-value check: `broken` normalized to Standard in both
  persisted state and Renderer before Comfortable was restored
- Fifteenth-pass process restart: Comfortable density restored from
  `ui-preferences.json` before the five-page matrix ran
- Fifteenth-pass layout matrix: Home, History, Tasks, Employees and Radar each
  retained 0 overflow, healthy modules and a 46px execution summary at both
  980x640 and 1440x900
- Fifteenth-pass performance: 0 Long Tasks; Comfortable Home peaked at 10.4ms
  against 24ms and every management page stayed at or below 1ms
- Fifteenth-pass native menu: macOS Accessibility returned
  `标准（显示更多内容）, 舒适（文字更易阅读）` with the Comfortable radio item checked
- Fifteenth-pass signed build: 9 real versions loaded at 980x640; Standard
  switched to Comfortable from 10px to 11px, the native Comfortable item gained
  its checkmark and a recreated window restored Comfortable before rendering
- Fifteenth-pass signed steady state: after excluding CDP attach and
  second-instance wake events, a 15-second observation covering the 10-second
  background refresh produced 0 Long Tasks, 0 overflow and healthy modules;
  Home rendering peaked at 6.7ms and workspace rendering at 10ms
- Fifteenth-pass final preference: the formal profile and live signed package
  were returned to Standard density before handoff
- Fifteenth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-18 10:43:28`
- Sixteenth-pass native close: with the 350ms debounce artificially extended to
  30 seconds, `Command+W` closed the window while leaving the main supervisor
  alive and atomically retained the exact title, full body and final `终`
- Sixteenth-pass close recovery: reopening the background process restored the
  exact draft and focused the requirement-title field
- Sixteenth-pass application quit: under the same 30-second debounce,
  `Command+Q` completed the final write and exited the main process in 0.357
  seconds; a fresh process restored the exact title, body, final `终` and focus
- Sixteenth-pass maximum input latency: 50 synchronous memory stages of a
  20,000-character requirement averaged 0.476ms, peaked at 6.1ms and performed
  no disk I/O
- Sixteenth-pass cleanup: the isolated validation profile ended with both draft
  scopes set to `null`
- Sixteenth-pass signed build: the Apple Development signed package loaded 9
  real versions with 0 overflow; under a 30-second debounce, native `Command+W`
  closed the window while main PID `71575` stayed alive and retained the exact
  title, body and final `终`
- Sixteenth-pass signed recovery: reopening the same background process restored
  the formal draft and title focus; validation then cleared both draft scopes
  and returned the live package to Home, Standard density and healthy modules
- Sixteenth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-19 18:20:33`
- Seventeenth-pass dual-write evidence: primary and recovery copies shared the
  same v2 timestamp and SHA-256; independent recomputation matched both stored
  digests and both retained the exact final `终`
- Seventeenth-pass truncated primary: the malformed 34-byte main file was
  quarantined, the recovery copy rebuilt a valid primary and the form restored
  the exact title, body, final `终` and title focus with 0 overflow
- Seventeenth-pass invalid recovery copy: a deliberate digest mismatch was
  quarantined and rebuilt from the primary; both regenerated files passed
  independent SHA-256 validation
- Seventeenth-pass dual corruption: both invalid files were quarantined, the
  form remained empty, an error Toast stayed visible with `role=status` and
  `aria-live=polite`, and the view retained 0 overflow plus 0 Long Tasks
- Seventeenth-pass cleanup: all test quarantine files were moved outside the
  project settings directory and the active primary/recovery files both contain
  valid empty v2 envelopes
- Seventeenth-pass signed migration: the formal profile's legacy single file
  migrated on startup to two independently valid v2 SHA-256 envelopes without
  changing either draft scope
- Seventeenth-pass signed corruption recovery: a deliberate formal-primary
  digest mismatch was quarantined; the signed package restored the exact title,
  full body and final `终`, kept the recovery Toast visible, focused the title,
  loaded 9 real versions and retained healthy modules, 0 overflow and 0 Long
  Tasks
- Seventeenth-pass signed cleanup: both formal files independently passed
  SHA-256 validation with null draft scopes, quarantine evidence was moved to
  `/tmp/oneopc-integrity-evidence/formal`, and the live package returned to
  Home with Standard density
- Seventeenth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-19 18:46:33`
- Eighteenth-pass live boundary attack: assigning an external `location.href`
  left the window at the original local `file://` URL; `window.open` returned
  `null` and CDP retained exactly one page target
- Eighteenth-pass permission evidence: geolocation and notifications reported
  `denied`; clipboard, camera and display capture returned `NotAllowedError`
- Eighteenth-pass embedded-content evidence: an external iframe resolved only to
  `chrome-error://chromewebdata/`; an injected webview remained a plain
  `HTMLElement` without `getWebContentsId`
- Eighteenth-pass egress evidence: external `fetch` failed, a synthetic download
  produced no file, and no extra browser target was created
- Eighteenth-pass runtime integrity: after all attempts OneOPC retained its
  original URL and title, healthy modules, 0 horizontal overflow and 0 Long
  Tasks
- Eighteenth-pass signed boundary: the formal package repeated the navigation,
  popup, network, iframe, webview, download, geolocation, notification,
  clipboard, camera and display-capture attacks with identical denials while
  retaining one target, 9 real versions and untouched null draft scopes
- Eighteenth-pass native fullscreen: `Control+Command+F` switched between
  1512x949 native fullscreen and 980x640 windowed mode while
  `document.fullscreenElement` stayed false; both modes retained 0 overflow,
  proving page-permission denial does not disable the macOS window command
- Eighteenth-pass signed final state: Home, Standard density, no dialogs, healthy
  modules, 980x640, 0 overflow and 0 Long Tasks
- Eighteenth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-19 19:03:21`
- Nineteenth-pass startup cap: five exact quarantine fixtures were reduced to
  the newest four, while an equally old non-allow-listed customer file remained
  untouched
- Nineteenth-pass temporary cleanup: an exact settings temporary file dated
  nine days earlier was removed at startup
- Nineteenth-pass draft boundary: clearing an already empty requirement draft
  while an employee draft existed preserved all four quarantine files; clearing
  the final employee draft immediately removed all four
- Nineteenth-pass integrity: after final clearing, both active draft copies held
  null scopes and independently passed SHA-256 recomputation
- Nineteenth-pass age boundary: after restart, a nine-day-old exact quarantine
  file was removed while the same-age non-allow-listed file remained untouched
- Nineteenth-pass regression: 155 tests, syntax checks and whitespace checks
  passed after the live lifecycle exercise
- Nineteenth-pass signed housekeeping: the formal profile removed five real
  `window-state` temporaries older than 24 hours, retained the four newer files,
  deleted a nine-day-old allow-listed quarantine fixture and preserved its
  same-age non-allow-listed control file
- Nineteenth-pass signed runtime: Home, Standard density, no dialogs, hidden
  health and boot layers, 980x640, 0 overflow and 0 Long Tasks
- Nineteenth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-19 19:19:37`
- Twentieth-pass stress Home: 72 versions produced 8 attention items, 48 active
  tasks, 0 waiting tasks and one latest delivery without changing real data
- Twentieth-pass task targeting: selecting the highest-priority alert opened
  Supervisor, scrolled `STRESS-001` to 58px from the viewport top and focused
  its task-title control; task rendering completed in 1.3ms
- Twentieth-pass refresh continuity: after focusing `STRESS-002`, a forced data
  signature change triggered a second complete Supervisor render; the same
  task-title retained focus at 58px with the render still inside budget
- Twentieth-pass 1440x900 geometry: four 288px pulse items fit in one row with
  no item or document overflow; the complete section remains above the native
  status bar
- Twentieth-pass 980x640 geometry: pulse items form two 461px columns with no
  horizontal or vertical item overflow, a 10px visible-text floor and no page
  overflow
- Twentieth-pass performance: Home rendering peaked at 2ms against a 24ms
  budget and both audited viewports produced 0 Long Tasks
- Twentieth-pass signed Home: nine real versions produced the authoritative
  `2 attention / 2 active / 4 queued / 1 delivered` pulse and a receipt with
  `http://127.0.0.1:4180`, V1, deployment time and `全流程验收完成`
- Twentieth-pass signed 1440x900: all four 288x120 pulse items remained 7px
  above the status bar with no item, receipt or document overflow; visible text
  stayed at or above 10px and Home rendering peaked at 2.4ms
- Twentieth-pass signed task continuity: the real
  `OP-20260817032405-061D` alert synchronously positioned at 58px and held
  keyboard focus; a forced full refresh preserved the same task, 58px position
  and `scrollTop=1917` with 0 Long Tasks
- Twentieth-pass signed 980x640: Home restored Standard density, no dialogs,
  hidden health and boot layers, 0 page overflow and 0 Long Tasks; pulse items
  formed two 461x120 columns with no internal overflow
- Twentieth-pass signature: deep strict verification passed for
  `com.oneopc.desktop` with Apple Development authority, Team ID `Y3X27XDH8C`,
  Hardened Runtime and timestamp `2026-08-19 23:23:41`

## Next Quality Waves

1. Add Apple notarization credentials and validate a Gatekeeper-distributed
   build on a clean macOS user account.
