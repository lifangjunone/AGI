---
spike: 001
name: avatar-platform-selection
type: comparison
validates: "Given the product constraints, when leading commercial and open-source avatar systems are evaluated and a representative WebGL asset is tested, then one highest-fidelity production direction can be selected with its costs made explicit"
verdict: VALIDATED
related: []
tags: [avatar, metahuman, unreal, threejs, digital-human]
---

# Spike 001: Avatar Platform Selection

## What This Validates

Given that close-up visual quality is the primary goal, determine which avatar
platform should replace the current monolithic GLB and face texture projection
pipeline. The decision must account for identity reconstruction, modular hair
and clothing, facial animation, Apple Silicon, privacy, integration cost, and
licensing.

Research and verification were performed on 2026-09-01.

## Decision

**Select Epic MetaHuman 5.7 as the only production avatar platform.**

This is a quality-first decision. MetaHuman has the strongest complete stack for
close-up skin, eyes, teeth, facial deformation, corrective animation, hair, and
wardrobe. The tradeoff is architectural: Unreal Engine becomes the 3D renderer.
Electron may remain as the learning UI and orchestration shell, but Three.js
must no longer be the production renderer for the primary digital employee.

MetaHuman is not a fully local photo-to-avatar pipeline on the current Mac.
MetaHuman Creator runs on macOS in 5.7, but Epic documents that MetaHuman
Identity creation and `Conform from Identity` are unavailable on Linux/macOS.
A Windows authoring worker is therefore required for photo-derived identities.
This limitation is accepted for the quality-first choice and must not be hidden.

## Evaluation Method

Scores use a 1-10 scale. Weighted total is out of 10.

| Criterion | Weight | Reason |
|---|---:|---|
| Close-up realism | 30% | The current failure is visible face and hair quality |
| Identity likeness | 15% | Selected or uploaded identity must survive in 3D |
| Hair and wardrobe system | 15% | Hairstyles and professional outfits must be independent |
| Facial/body animation | 10% | Conversation depends on expressions and natural motion |
| Apple Silicon viability | 10% | Primary development machine is M5 Pro |
| Privacy/private deployment | 10% | Uploaded photos should not require an opaque public API |
| Current-stack integration | 5% | Lower migration cost is useful but secondary to quality |
| License and cost | 5% | Must remain shippable and economically understandable |

## Scorecard

| Candidate | Realism | Likeness | Hair / wardrobe | Animation | Apple | Private | Integration | License | Weighted |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Epic MetaHuman 5.7** | 10 | 9 | 10 | 10 | 4 | 3 | 2 | 8 | **8.05** |
| Character Creator 5 + Headshot 3 | 9 | 10 | 9 | 9 | 1 | 8 | 5 | 5 | 7.85 |
| MetaPerson Enterprise | 7 | 7 | 8 | 7 | 7 | 8 | 10 | 5 | 7.30 |
| Didimo | 8 | 8 | 8 | 8 | 6 | 4 | 9 | 4 | 7.25 |
| FLAME + MICA/EMOCA/DECA | 5 | 8 | 2 | 8 | 8 | 10 | 4 | 7 | 6.15 |
| LHM / LHM++ | 7 | 7 | 3 | 6 | 1 | 9 | 2 | 9 | 5.75 |

The scorecard intentionally rewards visual quality more than compatibility.
Changing the weighting to favor the current Three.js implementation would pick
MetaPerson or Didimo, but it would not answer the user's request for the best
effect.

## Research

### Epic MetaHuman 5.7

Official evidence:

- MetaHuman 5.7 brings MetaHuman Creator to macOS and Linux and adds Python and
  Blueprint APIs for sculpting, conforming, wardrobe, rigging, textures, and
  assembly.
- The Groom system supports strand shaping, joint-driven animation, simulation,
  and Houdini-authored grooms.
- LOD0 guidance specifies about 24,000 head vertices, 669 blendshapes, and 713
  joints. Mac supports LOD0 but uses hair cards rather than strands.
- UE Cine assembly averages 1-2 GB per character. UE Optimized assembly is
  typically under 100 MB.
- MetaHuman licensing permits use with other engines, but using Unreal preserves
  the complete materials, RigLogic, groom, corrective, and LOD stack.
- A 5.7 platform limitation prevents creating MetaHuman Identity assets and
  using `Conform from Identity` on macOS/Linux. MetaHuman Animator support on
  these platforms is also still planned rather than complete.

Sources:

- https://dev.epicgames.com/documentation/metahuman/metahuman-5-7-release-notes
- https://dev.epicgames.com/documentation/metahuman/platform-support-and-lod-specifications-for-metahumans
- https://dev.epicgames.com/documentation/metahuman/assembly
- https://dev.epicgames.com/documentation/metahuman/from-video-footage
- https://www.metahuman.com/en-US/license
- https://forums.unrealengine.com/t/metahuman-5-7-preview-released/2658153

### Character Creator 5 + Headshot 3

Headshot 3 provides the strongest single-photo likeness workflow in the
comparison, with AI reconstruction, spline reshaping, sculpt morphs, lens
correction, de-lighting, normal generation, texture reprojection, and a mature
hair/clothing ecosystem. It is a credible quality competitor to MetaHuman.

It is not selected because the official system requirements are Windows 10/11,
DirectX 11, 8 GB VRAM, and substantial local storage. It cannot be authored on
the current M5 Pro without maintaining a separate Windows workstation. Its
runtime output is cross-engine, but the complete close-up result still needs a
technical-art export and shader setup.

Sources:

- https://www.reallusion.com/Character-Creator/download.html
- https://www.reallusion.com/character-creator/headshot/
- https://manual.reallusion.com/Headshot_Plugin/ENU/1.0/ID_SysReq.html

### Didimo

Didimo provides full-body or head-only FBX/glTF output from a selfie. Official
specifications list 18,984 full-body triangles, 138 head joints, 70 body and
clothing joints, 51 ARKit poses, 21 TTS poses, 11 hairstyles, clothing presets,
and Mixamo-compatible body animation. Its fitting service deforms reusable
custom hair and accessories against each identity.

This is a strong production integration option, but generation and fitting are
API-centered. It is not the visual winner, and private deployment terms are not
public enough to treat as a guaranteed offline route.

Sources:

- https://developer.didimo.co/docs/datasheet
- https://developer.didimo.co/docs/accessory-fitting-service
- https://developer.didimo.co/docs/cli

### MetaPerson Enterprise

MetaPerson supports modular hair/outfits, runtime creation, GLB export, LODs,
and broad client platforms. Its public Unity loader supports macOS and WebGL,
and the enterprise offering advertises local compute and custom topology,
blendshapes, hairstyles, and outfits.

The official sample asset was the only third-party candidate directly loaded in
the current Three.js application. It proved that a standardized head with
independent eyes, teeth, eyelashes, 66 facial morph targets, and 73 joints can
load without console errors. Its visual fidelity remains below MetaHuman and
the sample is head-only.

Sources:

- https://github.com/avatarsdk/metaperson-loader-unity
- https://github.com/avatarsdk/metaperson-unity-plugin
- https://avatarsdk.com/

### LHM / LHM++

LHM++ is an Apache-2.0 single/multi-image animatable human reconstruction model
and is useful research. The released stack is CUDA-oriented, while the original
LHM application documents at least 24 GB GPU memory for the 500M model. Its
Gaussian/SMPL-X style output is not a production modular head, groom, wardrobe,
and facial-rig system. It cannot be the main pipeline on Apple Silicon.

Sources:

- https://github.com/aigc3d/LHM
- https://github.com/aigc3d/LHM-plusplus

### FLAME Research Stack

FLAME, MICA, DECA, and EMOCA are valuable for parametric face shape and
expression estimation. They do not provide the complete photoreal skin, eyes,
teeth, hair, wardrobe, body deformation, and renderer needed for the product.
Choosing them would require building a character platform rather than adopting
one.

## Investigation Trail

1. Audited the current assets. The five bundled GLBs have different topology,
   UVs, indices, and skin weights, so hairstyle geometry cannot be safely moved
   between them.
2. Tested face-only UV projection and procedural hair. UV projection changed
   color but not hairstyle geometry; procedural hair looked like a helmet and
   tubes. Both directions were rejected.
3. Loaded the official MetaPerson female LOD1 GLB through the application's
   real import path. It loaded without console errors and exposed the expected
   facial morph targets. The stage framed it incorrectly because it assumes
   every imported asset is a full body.
4. Compared candidate platforms using official technical documentation instead
   of marketing screenshots alone.
5. Checked the host: Apple M5 Pro, arm64, 48 GB memory. Unreal Editor is not
   currently installed, so a local MetaHuman runtime benchmark was not
   fabricated.
6. Followed the highest-scoring candidate into its platform limits. MetaHuman
   Creator itself is available on macOS, but Identity conform is not; Mac also
   renders hair cards rather than the highest-end strand groom.

## Verification Evidence

- MetaPerson sample:
  `/tmp/metaperson-female-lod1.glb` (10 MB)
- Current application screenshot:
  `english-immersion-studio/test-results/spike-metaperson-head.png`
- Observed sample structure:
  - `AvatarHead`: 7,419 vertices and 66 morph targets
  - `AvatarEyelashes`: 6,300 vertices and 29 morph targets
  - independent eyeballs, corneas, upper teeth, and lower teeth
  - 73 joints
  - ARKit names plus visemes including `jawOpen`, bilateral blink/smile,
    `mouthFunnel`, `aa`, `ih`, `oh`, `ou`, `CH`, `DD`, `FF`, `PP`, `RR`,
    `SS`, and `TH`
- Host verification:
  - arm64 Apple M5 Pro
  - 18 CPU cores
  - 48 GB unified memory
  - no local Unreal Editor installation found

## Results

**Verdict: VALIDATED**

MetaHuman 5.7 is the selected production direction because it wins the
quality-weighted comparison and directly solves the current architecture's
weakest areas: standardized high-resolution heads, sophisticated facial
deformation, physically convincing eyes and skin, modular wardrobe, and
production hair.

This verdict does not validate M5-only photo reconstruction. That requirement
is incompatible with the selected highest-quality pipeline today. Photo-derived
identity authoring must run on a Windows node or be deferred; the application
must never claim that this step is local on macOS.

## Target Architecture

```text
Electron / React learning shell
  |-- dialogue, subtitles, grammar, recommendations, settings
  |-- local IPC/WebSocket contract
  `-- Unreal Engine 5.7 renderer process
        |-- MetaHuman character assets
        |-- RigLogic facial animation
        |-- Audio-driven lip sync and expression state
        |-- modular wardrobe and groom/card hairstyles
        `-- camera, lighting, scene, and body animation

Offline authoring pipeline
  |-- macOS: MetaHuman Creator for preset/synthetic identities
  |-- Windows worker: MetaHuman Identity conform for photo-derived identities
  `-- package UE Optimized High assets for desktop runtime
```

Use UE Optimized High for the desktop product and reserve UE Cine for visual
reference renders. Optimized High is the practical first target because the
official average footprint is under 100 MB versus 1-2 GB for UE Cine.

## Migration Sequence

1. Build one Unreal 5.7 vertical slice with one female MetaHuman, one modular
   professional outfit, two hairstyles, idle/body motion, lip sync, and blink.
2. Define a versioned IPC contract for dialogue text, audio, emotion, camera,
   outfit, hairstyle, and avatar identity.
3. Keep React/Electron as the control and learning layer while replacing only
   the Three.js stage with the Unreal renderer process.
4. Rebuild the 30 synthetic identities as MetaHuman assets sharing animation,
   wardrobe, and camera systems.
5. Add a Windows Identity authoring worker only after the synthetic catalog
   meets the close-up quality bar.
6. Retire the current UV-baked identity route from production after parity is
   reached; keep it only as an explicitly labeled offline fallback.

## Rejected Directions

- **Continue patching current GLBs:** cannot make hair geometry or head topology
  identity-specific and will keep producing preview/model mismatch.
- **MetaPerson or Didimo as the main renderer:** easier Three.js integration,
  but does not satisfy the explicit highest-quality priority.
- **Character Creator 5 as the main platform:** excellent likeness, but
  Windows-only authoring and a less integrated renderer/animation stack.
- **LHM++:** open source but CUDA-bound and structurally wrong for modular,
  repeatable conversational characters.
- **FLAME stack:** useful reconstruction components, not a complete production
  digital-human system.

## Exit Criteria For Implementation

The MetaHuman migration should proceed only when the first vertical slice
demonstrates all of the following on the M5 Pro:

- stable 30 FPS minimum at the intended desktop viewport;
- close-up skin, eyes, teeth, and hair clearly outperform the current model;
- two genuinely different hairstyle geometries;
- one-click outfit switching without changing identity;
- synchronized speech, blinking, expression, breathing, and arm motion;
- clean Electron-to-Unreal state transitions;
- packaged application size and memory measured rather than estimated.
