# Runtime UAT - 2026-09-03

Environment:

- macOS 26.5.2 on Apple M5 Pro
- Unreal Engine 5.7.4 Editor game process
- Electron 44 with Pixel Streaming 2
- Local Audio2Lipsync sidecar on Apple MPS

## Standalone 2D mode

`npm run 2d` was started after the full Unreal stack was stopped. Process
inspection confirmed that no Unreal renderer, Pixel Streaming signalling
server, or Audio2Lipsync Python service was running.

The Electron workflow passed:

- 2D is the default display mode.
- The stage switches among the three verified identity portraits.
- Scenario selection, typed learner input, generated reply, subtitles, and
  study controls remain available.
- Edge neural TTS plays without requesting face-animation inference.
- Switching to 3D restores the Pixel Streaming, camera, outfit, and lip-sync
  controls; switching back disconnects the stream.

Evidence: [2d-default-mode.png](2d-default-mode.png) and
[2d-speaking-amara.png](2d-speaking-amara.png).

## 26-role adult portrait catalog

Seedream 5.0 Pro generated 26 distinct local 2K portraits. Each catalog entry
has a unique ID, profession, fictional name, and explicit age of 21 or older.
The Electron avatar panel exposes the complete catalog in 2D mode and keeps
the three verified MetaHumans isolated to 3D mode.

All 26 stage portraits were processed into RGBA PNG foregrounds. Electron
verification confirms that the selected character is composited over the
scenario image with the full head visible. The identity caption is positioned
in the left-side safe area and no longer covers the face.

Runtime evidence:

- [2d-26-role-catalog.png](2d-26-role-catalog.png)
- [2d-hosiery-role.png](2d-hosiery-role.png)
- [2d-portrait-catalog.jpg](2d-portrait-catalog.jpg)
- [2d-transparent-stage.png](2d-transparent-stage.png)
- [2d-transparent-sora.png](2d-transparent-sora.png)

The generation credential is stored only in the ignored local `.env.local`
file. The reproducible generator reads the credential at runtime and contains
no embedded key.

## Three-identity gate

Each identity was selected from the Electron Avatar panel without restarting
Electron or Unreal. For every selection, the active card ID, visible character
name, renderer `data-avatar-id`, renderer `data-hair-id`, and streamed video
were checked together.

| Identity | Runtime actor | Groom | Result | Evidence |
| --- | --- | --- | --- | --- |
| Sophia Laurent | SophiaTuya | Hair_L_Straight | pass | [sophia-electron.png](sophia-electron.png) |
| Amara Reed | Sophia | Hair_L_StraightBangs | pass | [amara-electron.png](amara-electron.png) |
| Vivian Voss | Vivian | Hair_M_BobStraight | pass | [vivian-electron.png](vivian-electron.png) |

The three identities have visibly different faces and three distinct hair
silhouettes. Each portrait was cropped from its corresponding streamed runtime
actor. The identity manifest test resolves each runtime-ready Blueprint, Groom,
Groom Binding, and portrait to a real workspace file.

## Lip-sync timing probe

A deterministic four-phrase sample, `Mama. Papa. Mama. Papa.`, was synthesized
with the `ava-sweet` Edge neural profile at speed `0.8`. The returned face
animation contained 262 frames over 4.368 seconds at 60 fps. During playback,
the Electron Pixel Streaming video was sampled around the mouth on every
display frame while audio time was read from the same `HTMLAudioElement`.

Three unambiguous high-jaw peaks aligned with visible mouth-darkness peaks at
approximately 33 ms, 17 ms, and 67 ms absolute offset. Whole-sequence
cross-correlation was weaker because idle head motion, compression, and the
two-dimensional pixel proxy also affect the sampled region.

This is useful quantitative evidence for the current local path, but it does
not complete the lip-sync gate. A phoneme-labelled test set and repeat runs for
all exposed identities are still required.

## Golden vertical slice

The current slice uses Sophia Laurent in the interview scene. The controls and
the streamed result were exercised in the Electron window through its CDP
endpoint while the Unreal game process, Pixel Streaming server, and local
lip-sync service were running.

| Slice requirement | Result | Runtime evidence |
| --- | --- | --- |
| One fixed character | pass | `sophia-tuya` remained active for all comparison runs |
| Interview scene | pass | Electron displayed the live Unreal interview actor set |
| First-person view | pass | `EIS_CAMERA_CHANGED view=first` |
| Third-person view | pass, quality review pending | `EIS_CAMERA_CHANGED view=third`; [golden-slice-third-person.png](golden-slice-third-person.png) |
| Neural lip sync | pass | 31 channels, 271 frames, 4.52 seconds at 60 fps; [golden-slice-neural.png](golden-slice-neural.png) |
| Timed viseme lip sync | pass | 12 channels, 300 frames, 5.00 seconds at 60 fps |
| Audio RMS lip sync | pass | 12 channels, 271 frames, 4.52 seconds at 60 fps; [golden-slice-audio-rms.png](golden-slice-audio-rms.png) |
| Two real outfits | blocked | Only Epic's default `WI_DefaultGarment` is installed; no second compatible garment mesh is present |

All three lip-sync modes generate ARKit curves and use the same
`FaceAnimation` LiveLink subject. The neural option is disabled automatically
when the local model health check fails. The outfit panel exposes only the
verified default garment, so the missing second outfit is not represented as
working UI.

## Automated checks

- TypeScript typecheck: pass.
- Vitest: 36 tests passed.
- Node/Electron scripts: 18 tests passed.
- Vite production build: pass.
- Unreal Editor target build: pass.
- MetaHuman source hair update: pass.
- Optimized High `BP_Sophia` rebuild with Metal RHI: pass.

The headless `-nullrhi` MetaHuman assembly attempt crashed in Epic's
TextureGraph material bake. Asset assembly on macOS must run with Metal RHI;
this limitation is not hidden by the build scripts or acceptance status.
