# Product Acceptance

This document is the source of truth for product completion. A feature is only
`verified` when it has been exercised in the Electron application with the
real Unreal renderer. Source files, successful builds, protocol messages, and
logs are supporting evidence, not product acceptance by themselves.

## Status meanings

- `verified`: demonstrated in Electron with the real renderer.
- `partial`: real implementation exists, but the user-visible workflow or
  quality gate is incomplete.
- `not implemented`: no real product implementation exists.
- `hidden`: deliberately unavailable in the product until implemented.

## Current audit

| Requirement | Status | Authoritative evidence | Required exit gate |
| --- | --- | --- | --- |
| Lightweight 2D learning mode | verified | `npm run 2d` starts Electron without Unreal, Pixel Streaming, or Audio2Lipsync; character, scenario, dialogue, TTS, subtitles, and study controls remain available | Keep the standalone startup and interaction regression |
| Adult 2D identity catalog | verified | 26 distinct local 2K portraits, unique roles and IDs, explicit age 21+ metadata, Electron switching, and catalog tests | Retain local files and do not expose generated entries before image validation |
| Runtime MetaHumans | partial | SophiaTuya, Sophia/Aera, and Vivian Blueprints run in Electron | Visual gold-standard review passes for all exposed identities |
| 30 distinct adult female identities | not implemented | Three of thirty runtime Blueprints exist | 30 runtime Blueprints, 30 matching rendered portraits, and a 30-character switch test |
| Portrait matches 3D identity | partial | Three identity cards use captures from their exact runtime MetaHumans, including Amara's rebuilt bangs Groom | Complete the same capture pipeline for all 30 identities |
| Real character switching | verified | Electron clicks switch Sophia, Amara, and Vivian runtime actors, portraits, and synchronized identity labels | Keep regression coverage while expanding the manifest |
| Modular hair switching | partial | Electron renders three distinct verified assets: Sophia long straight, Amara long straight with bangs, and Vivian bob | Add selectable validated Groom choices across the complete identity catalog |
| Real outfit switching | not implemented | One assembled default garment is present | Each exposed outfit has a runtime component and visual switch evidence |
| Six real Unreal scenes | partial | Six selectors are exposed and Electron sends matching `interview`, `restaurant`, `hotel`, `small-talk`, `clinic`, and `airport` scene IDs to Unreal; all six tagged actor sets exist | Capture and approve distinct live Pixel Streaming frames for both camera modes in every scene |
| First-person camera | verified | Electron video and `Camera.first` runtime switch | Keep regression coverage |
| Third-person camera | partial | Runtime camera switch exists | Visual framing review passes with full upper body and no Groom artifacts |
| Natural idle and blink | partial | Epic body and face idle assets run on Sophia | Long-run visual review passes without T-pose or frozen face |
| TTS audio | verified | Edge neural TTS plays in Electron | Keep fallback and cache regression coverage |
| Runtime lip sync | partial | Electron verified three selectable LiveLink paths: 31-channel Audio2Lipsync, 12-channel timed visemes, and 12-channel audio RMS; a 4.368 s neural probe matched three clear jaw/mouth peaks within 17-67 ms | Record a controlled visual comparison and repeat a phoneme-labelled synchronization suite for all exposed identities |
| Pixel Streaming in Electron | partial | WebRTC video has reached `readyState=4` | Repeated startup, reconnect, and 30-minute stability tests pass |
| Renderer disconnect recovery | partial | Non-blocking reconnect UI and automatic Unreal process restart exist | Repeated recovery test passes without blocking the learning workflow |
| Mouse remains usable | verified | Unreal input mode does not permanently capture or hide the cursor | Keep regression coverage |
| A1-C2 and learning overlays | partial | UI and local analysis exist | Scenario-by-scenario interaction review passes |
| macOS one-command startup | partial | `npm run metahuman` starts the development stack | Clean-machine setup and packaged build pass |
| Windows portability | not implemented | Documented architecture only | Windows 11 build, package, startup, and renderer tests pass |

## Product gates

### Gate 1: Gold character

- Adult female face reads as realistic at conversational distance.
- Skin has visible detail without overexposure, waxiness, or seams.
- Hair is a real Groom or validated hair-card asset with no exposed guides.
- Head, shoulders, torso, and arms have natural idle motion.
- Camera, focus, lighting, and background meet a product screenshot review.
- TTS, lip sync, blink, and idle run together without replacing one another.

### Gate 2: Three-character pipeline

- Status: **verified for the current three runtime identities on macOS,
  2026-09-03**.
- Three faces are visibly different at a glance.
- Each character uses a distinct hair silhouette.
- Portraits are rendered from the same runtime assets used in Electron.
- Clicking a portrait changes the runtime actor, UI identity, and portrait.
- Switching is repeatable without restarting Electron or Unreal.

Evidence captured from the real Electron Pixel Streaming surface is stored in
[`docs/evidence/2026-09-03/UAT.md`](docs/evidence/2026-09-03/UAT.md). The
manifest test also resolves each runtime-ready Blueprint, Groom, Groom Binding,
and portrait to an existing workspace file.

### Gate 3: Thirty identities

- Thirty runtime identities exist in a machine-readable manifest.
- Every manifest entry resolves to a Blueprint, portrait, hair, and outfit.
- Automated validation rejects missing or duplicated asset references.
- A visual contact sheet and per-character screenshots are reviewed.

### Gate 4: Complete experience

- Six Unreal environments, real outfit switching, voices, subtitles, and study
  controls work together.
- First/third-person views are framed for the active scene and character.
- Pixel Streaming reconnects after renderer restart.
- macOS and Windows packages pass the same user-visible UAT checklist.

The Goal is complete only when all four gates pass.
