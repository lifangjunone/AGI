# Debug Session: trae-progress-invisible
- **Status**: [OPEN]
- **Issue**: DeliveryPilot can send tasks to Trae Work and Trae Code, but the desktop UI does not expose real execution progress, recent output, completion, or failure.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-trae-progress-invisible.ndjson

## Reproduction Steps
1. Open `release/DeliveryPilot.app`.
2. Select a requirement document and workspace.
3. Start the task.
4. Observe that the app reports only that the external task was sent.
5. Try to determine whether Trae Work or Trae Code is running and how far it has progressed.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Expected Signal |
|----|------------|------------|--------|-----------------|
| A | The official `chat` CLI only dispatches work and returns no session progress | High | Low | Confirmed: CLI returned in 1212 ms with 0 stdout bytes |
| B | Real execution state is persisted in Trae local logs or databases | High | Medium | Confirmed: ai-agent WAL, renderer, main and toolhost logs changed after dispatch |
| C | Trae Code progress can be derived from workspace changes | High | Low | Partially confirmed: suitable for Code, but Work analysis produced no host workspace files |
| D | The UI has no polling/subscription path for external evidence | High | Low | Confirmed: only dispatch events exist; no external status command or polling effect |
| E | macOS Accessibility can provide a reliable fallback when Trae CLI does not route chat requests | High | Medium | Fix implemented; real Trae UI verification pending |

## Instrumentation Plan
- A: Record external CLI spawn and child exit status.
- B: Record Trae log directory latest modification time before/after dispatch.
- C: Record workspace file count and latest modification time.
- D: Record frontend launch lifecycle and state received from the command.

## Log Evidence
- `.dbg/trae-debug-log-trae-progress-invisible.ndjson:1`: official CLI returned in 1212 ms with no stdout.
- `.dbg/trae-debug-log-trae-progress-invisible.ndjson:3`: Trae Work produced no host workspace files.
- Trae Work `ai-agent` log: RPC session registered and VM operation reached `status=ready`, `stage=completed`, `stage_percentage=100`.
- Trae Code `toolhost.log`: the unique integration prompt was persisted, proving real dispatch.
- Both applications update encrypted `ModularData/ai-agent/database.db-wal`; direct database querying is not a stable integration surface.

## Verification Conclusion
Root cause: DeliveryPilot treats dispatch acknowledgement as its only external evidence. The official CLI is fire-and-forget and exposes neither a session identifier nor streamed output. Real activity exists in application logs and workspace changes, but no backend command collects it and no frontend component polls or renders it.

## Fix
- Added a read-only Tauri `external_status` probe.
- Polls every 2 seconds while an external run exists.
- Shows application online/offline state, elapsed time, evidence phase, latest activity, changed files, and expected artifact count.
- Added `.delivery-pilot/progress.json` self-reporting contract for Trae Code tasks.
- Trae Work completion remains a manual confirmation because its official CLI exposes no stable session result API.

## Post-Fix Verification
First user reproduction changed the symptom:
- Status polling is visible and both applications open.
- No visible chat task is created in either application.
- Post-fix log lines 1-4 and 44-47 show the CLI child spawning in 15-19 ms and returning to the UI in 37-45 ms.
- Source inspection confirms `chatCommandLineHandler` can return before dispatch when workspace trust is not granted.
- Source inspection also confirms multi-window routing cannot identify a target from `chat._`, and a new window may receive the IPC event before the workbench contribution subscribes.

Iteration fix:
- Open the dedicated application window/workspace first.
- Wait four seconds for the workbench chat contribution.
- Send exactly one `chat --reuse-window` request.
- Move the default Trae Code workspace below the already trusted `~/Desktop` tree.
- Do not treat generic application heartbeat logs as task progress.

Second user reproduction:
- User reported “仍只打开窗口”.
- The dedicated-window plus delayed CLI request still produced no visible chat task.
- This confirms the installed Trae multi-window CLI route is not a reliable submission contract.

Second iteration fix:
- Replaced the `chat --reuse-window` submission with a bundled Swift Accessibility helper.
- The helper requests Accessibility permission, focuses the exact Bundle ID, discovers a writable chat input, pastes the source file and prompt, presses the send control, and requires either an emptied input or visible stop control before returning success.
- `ExternalRun` is now created only after `sendConfirmed=true`; opening a window is no longer reported as task submission.
- Added visible submission states and steps plus a “重试发送” path after first-run permission approval.
- Unknown Trae Work progress is rendered as “监测中” instead of a fabricated percentage.
- On Accessibility selector failure, an AX node snapshot is sent to hypothesis E instrumentation.

Third user reproduction pending. Debug instrumentation and server remain active.

User supplied the required Trae Work UI sequence:
1. Open `Work`.
2. Click `New task`.
3. Select the task folder.
4. Confirm/select `GPT-5.5`.
5. Enter the task.
6. Click the purple send button.

Third iteration fix:
- Trae Work now follows the six-step sequence before reporting task submission.
- The selected task folder is the source requirement document's parent directory.
- AX label/action targeting is preferred; window-relative coordinates from the supplied UI are the fallback.
- Each completed step is returned to DeliveryPilot and rendered separately.
- The source file is read from the selected task folder instead of being pasted before task creation.

Fourth user reproduction pending. Debug instrumentation and server remain active.

Fourth reproduction evidence:
- Accessibility was enabled, but the stale macOS consent dialog covered DeliveryPilot and intercepted the first coordinate-based attempts.
- The Trae Work Electron AX tree contained cycles through `AXApplication`; menu/cycle traversal exhausted the node budget before Web UI controls were reached.
- After skipping menu subtrees and the root application cycle, the helper discovered 677 real nodes including:
  - `AXRadioButton Work`
  - `AXButton New task`
  - `AXTextArea @530,811 746x44`
  - microphone `AXButton @1212,883 32x32`
  - actual purple send control `AXGroup @1248,883 32x32`
- The prior selector clicked the microphone, so the prompt remained in the input.

Fourth iteration fix and runtime proof:
- Electron `AXManualAccessibility` and `AXEnhancedUserInterface` are enabled before window discovery.
- AX traversal skips menu subtrees and application-root cycles.
- The send selector anchors to the input and selects the rightmost 24-44 px control, correctly distinguishing the purple send control from the microphone.
- Manual end-to-end result returned `sendConfirmed=true`, `confirmation=input_cleared`, and all six user-specified steps.
- Post-submit AX evidence contains the exact requirement prompt, `打开设备检修工单需求 PDF`, and the expected absolute source path.

Packaged-app user confirmation pending. Debug instrumentation and server remain active.

Latest packaged-app verification:
- Stable helper permission is `granted`.
- Exactly one `TRAE SOLO CN` process remains running; DeliveryPilot no longer launches additional Work windows.
- Six consecutive AX snapshots over 60 seconds returned only 3 root nodes and no `AXWindow`.
- The simultaneous full-screen capture was entirely black.
- Conclusion: macOS is still locked and suppresses the application window AX tree. Real UI submission cannot be verified until the interactive session is unlocked; this is distinct from an Accessibility permission failure.

Unlocked reproduction evidence:
- DeliveryPilot selected the PDF and copied it to `.delivery-pilot/input/`.
- Submission stopped at step 3 without sending, and Trae Work remained on GPT-5.4.
- AX evidence showed multiple elements labelled `new task`: the intended top-left static label and higher-scored 24px history-item menu buttons.
- Root cause: the generic label scorer selected a history-item `new task` menu instead of the top-left New task entry, so folder selection ran on the old task page.
- Fix: constrain New task to a visible, top-left element and require the new-task composer (`Select a folder`) before proceeding.
