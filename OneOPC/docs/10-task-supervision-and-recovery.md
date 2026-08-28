# OneOPC Task Supervision and Recovery

## Goal

OneOPC treats external Work and Code tools as managed executors rather than
one-shot launch targets. A process being alive is not accepted as proof that it
is still executing the current Delivery Run.

## Control Model

Each run owns a control directory:

```text
work/runs/{runId}/control/
├── task-contract.json
├── control-request.json
├── heartbeat-work.json
└── heartbeat-code.json
```

`task-contract.json` identifies the current checkpoint and recovery policy.
Executor heartbeats must contain:

```json
{
  "runId": "OP-...",
  "state": "running",
  "at": "2026-08-15T10:00:00.000Z",
  "checkpointSequence": 12
}
```

A process match only establishes `processState=online`. OneOPC reports
`taskState=running` only when a fresh heartbeat belongs to the same Run.

`control-request.json` is an atomic, durable instruction for the executor:

```json
{
  "runId": "OP-...",
  "action": "cancel",
  "checkpoint": {
    "stepId": "develop-verify-output",
    "sequence": 12
  },
  "status": "confirmed"
}
```

Executors must check the request before every external side effect. Cancelling
stops the current Run, not the tool application, and never deletes the
workspace or checkpoint.

## Recovery Rules

1. Scan managed runs every 10 seconds.
2. Mark a task stalled after 45 seconds without a valid task heartbeat.
3. If a managed application exits, preserve the current checkpoint and restart
   the application, with a maximum of three restarts.
4. For Trae Work and Trae Code, submit a Computer Use resume contract containing
   the Run ID, stage, checkpoint ID, sequence and heartbeat destination.
5. Never clear the workspace or restart from stage zero during recovery.
6. Limit current-step retries to five and persist every attempt as a Run event.
7. Do not treat unsupported tools as task-aware. They remain process-level
   control or observation until a dedicated adapter is installed.
8. Cancelled Runs are terminal to automatic scans and cannot restart or resume
   without an explicit undo.
9. Undo replaces the cancel request with a resume request before restoring the
   exact saved checkpoint.

## Background Lifecycle

- The Electron main process remains active when its last window closes on macOS.
- The packaged application registers for start at login and opens the control
  center so its background state is never mistaken for a failed launch.
- Closing the last window sends a one-time native notification explaining that
  task supervision and recovery remain active.
- Dock activation, a second instance, the native Show Control Center command
  and notification click all restore the same singleton window without
  restarting the supervisor.
- The native application menu keeps business navigation, requirement creation,
  health scan and tool rescan discoverable even when no window is visible.
- Normal bounds, display identity, maximized state and full-screen state are
  atomically persisted in `settings/window-state.json`.
- Negative-coordinate secondary displays are preserved. If a display is
  removed or the saved window falls below the minimum visible area, OneOPC
  centers the window on the primary work area and self-heals the state file.
- Renderer crashes reload the control center without restarting the main
  process or task supervisor. Automatic reload is limited to two attempts per
  60 seconds before a native recovery choice replaces the loop.
- A sandbox-preload heartbeat supplements Electron's unresponsive event. A
  confirmed sustained stall identifies the latest locally saved form draft
  before a forceful Renderer replacement.
- The latest 20 runtime-recovery events are atomically retained in
  `settings/runtime-recovery.json`; no requirement body is recorded.
- Requirement and digital-employee drafts use a separate allow-listed,
  atomically replaced `settings/input-drafts.json`. They survive Renderer and
  process restarts and are cleared after the matching action succeeds.
- Completed, failed and cancelled runs are not rewritten by periodic scans.

## Adapter Contract

Every future tool adapter must implement:

```text
detect installation
inspect process
launch or restart
attach or resume task from checkpoint
stop the current task without quitting the application
return verifiable stop evidence or an explicit unconfirmed result
verify current Run ownership
emit heartbeat
report recoverable and terminal failures
```

This contract is the boundary between generic process management and reliable
task-level control. A tool is not labeled task-aware until all task operations
have verifiable evidence.

## Technology Exploration Demo Handoff

OneOPC accepts `technology-demo-handoff/1.0` requests through
`--technology-handoff <request.json>`.

- The requirement document is archived and fingerprinted before execution.
- A normal supervised Run is created; the handoff does not bypass checkpoints.
- Run ID, workspace, stage, recovery count and preview URL are written back to
  the sibling `status.json` every five seconds.
- If OneOPC is already running, the Electron second-instance handler accepts
  the new request without requiring another window or manual import.
