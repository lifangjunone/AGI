# Debug Session: example-hover-dismiss
- **Status**: [OPEN]
- **Issue**: Example sentences have no Chinese translation, and translation popups do not close after the pointer leaves.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: `.dbg/trae-debug-log-example-hover-dismiss.ndjson`

## Reproduction Steps
1. Open a word result and inspect the example row.
2. Move the pointer away from the source word and popup.
3. Observe whether the popup closes.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Translation results never contain an example translation | High | Low | Confirmed |
| B | Example translation is attempted but silently fails | Low | Low | Rejected |
| C | Auto-dismiss intentionally ignores double-click and selection results | High | Low | Confirmed |
| D | Main process receives hoverLeave with mismatched trigger/config state | Medium | Low | Rejected for screenshot reproduction |
| E | Native helper does not emit hoverLeave | Medium | Medium | Confirmed for double-click |

## Log Evidence
- Line 1: `Harness` has an English example but `hasExampleTranslation=false`.
- Line 2: overlay trigger is `doubleClick` while auto-hide is enabled.
- No native leave or main-process leave-decision event followed after moving away.
- WindowServer still listed the 390x340 overlay on-screen.

## Pre-Fix Conclusion
The example translation is not implemented. Auto-dismiss only tracks hover
source regions and only hides overlays whose trigger equals `hover`; double-click
and selection results therefore remain visible after the pointer leaves.

## Post-Fix Evidence
- Line 1: `language` now reports `hasExampleTranslation=true`.
- Lines 3-5 and 9-11: real hover results were visible, native `hoverLeave` was
  emitted, and the main process decided `willHide=true`.
- Lines 12-15: policy evaluation returns true for `hover`, `doubleClick`, and
  `selection`, and false for `manual`.
- UI screenshot confirms the Chinese example appears directly below the
  English example without clipping.
- TypeScript, Swift compilation, and all 7 tests pass.

## Verification Conclusion
Pre-fix: example translation was absent and `doubleClick` was excluded from
auto-dismiss. Post-fix: example translation is populated, and all three
automatic trigger types participate in source-leave dismissal.

## Iteration 2
- User reports the popup now closes too quickly to reach the pronunciation
  button.
- Runtime evidence: a `doubleClick` overlay was shown at timestamp
  `1788767875359` and received `hoverLeave` at `1788767876096`, only 737ms
  later.
- Planned fix: delay dismissal by 1200ms, cancel the timer while the pointer is
  inside the popup, and restart it when the pointer leaves the popup.

## Post-Fix 2
- Auto-dismiss now uses a 1200ms timer instead of hiding immediately.
- Entering the overlay cancels the pending timer; leaving the overlay schedules
  a fresh timer.
- New translations and disabled auto-hide clear stale timers.
- Policy tests cover hover, double-click, selection, manual mode, and the
  1200ms delay.
- Swift, TypeScript, packaging, signature verification, and all 8 tests pass.
- Awaiting user interaction confirmation before removing instrumentation.

## Iteration 3
- User confirms that the popup can still disappear while the pointer is over
  it.
- Evidence: the successful `HiAgent` flow logged `overlay:pointer-enter`, but
  failed `templated`, `than`, and `Jensen` flows went directly from scheduled
  to timer-fired with no pointer-enter event.
- Root cause: renderer mouse-enter delivery is not reliable enough to own
  window lifetime.
- Planned fix: poll Electron's system cursor coordinates in the main process,
  compare them with the overlay window bounds, pause dismissal indefinitely
  while inside, and restart the full 1200ms grace period after leaving.

## Post-Fix 3 Build
- Renderer mouse-enter ownership has been removed.
- The main process now polls the system cursor every 100ms and compares it
  against the popup's actual screen bounds.
- Entering the popup pauses dismissal indefinitely; leaving it restarts the
  full 1200ms grace period.
- Swift compilation, TypeScript checking, all 9 Node tests, packaging, and
  deep code-signature verification pass.
- Awaiting runtime interaction evidence and user confirmation.

## Translation Outage
- The app and native OCR helper remained alive, and Vision OCR continued to
  process captures.
- A direct translation attempt reproduced the UI error
  `当前无法连接翻译服务`.
- Runtime evidence recorded an `AbortError` from
  `api.mymemory.translated.net` after the 6500ms timeout.
- MyMemory also returned HTTP 504 in a direct probe. Google and public
  LibreTranslate endpoints were blocked by anti-automation controls.
- A Bing provider probe returned the expected Chinese translation in 2.6s.
- Fix direction: use Bing as primary and retain MyMemory as failover.

## Translation Post-Fix
- Bing is now the primary provider and MyMemory remains the automatic
  fallback.
- Provider failover is covered by tests for primary success and primary
  failure followed by fallback success.
- All 11 Node tests and TypeScript checking pass.
- The rebuilt arm64 app passes deep code-signature verification.
- In the packaged app, the same sentence that previously showed
  `当前无法连接翻译服务` now renders `语言连接不同文化的人。`.
- The signed app is running from `dist/mac-arm64/Hover Translator.app`.
