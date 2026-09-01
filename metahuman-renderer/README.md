# English Immersion MetaHuman Renderer

Unreal Engine 5.7 rendering process for English Immersion Studio. This project
replaces the production Three.js avatar with MetaHuman skin, RigLogic facial
deformation, modular hair, and modular wardrobe assets.

## Required Installation

Install Unreal Engine 5.7 from Epic Games Launcher and enable these installation
options:

- MetaHuman Creator Core Data
- Starter Content
- Engine Source

The Core Data package is required because it contains MetaHuman presets, grooms,
texture models, and assembly dependencies. In the editor, enable:

- MetaHuman Creator
- MetaHuman Core Tech
- RigLogic
- Control Rig
- Hair Strands
- Pixel Streaming 2

Restart the editor after enabling plugins.

## Open The Project

macOS:

```bash
open -a "UnrealEditor" EnglishImmersionRenderer.uproject
```

Windows PowerShell:

```powershell
& "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" `
  "$PWD\EnglishImmersionRenderer.uproject"
```

## Required Scene

Create `/Game/EnglishImmersion/Maps/EnglishImmersion` and place:

1. One assembled **UE Optimized High** female MetaHuman.
2. A close-up Cine Camera tagged `Camera.first`.
3. A medium/full-body Cine Camera tagged `Camera.third`.
4. `EnglishImmersionDirector` is spawned automatically by the project game
   mode and connects to `ws://127.0.0.1:7790`.

The renderer consumes versioned `avatar.state` messages from Electron.

## Asset Tags

Tags are the runtime contract. IDs must exactly match the React application.

| Asset | Tag example | Behavior |
|---|---|---|
| MetaHuman root actor | `Avatar.j-fashion-01` | Switches identity |
| Hair/Groom component | `Hair.long-straight` | Switches real hair geometry |
| Wardrobe component | `Outfit.executive` | Switches clothing |
| Environment root actor | `Scene.interview` | Switches environment |
| Cine Camera actor | `Camera.first` | Switches viewpoint |

Supported hair IDs:

- `long-wave`
- `high-ponytail`
- `layered-wave`
- `sleek-long`
- `long-straight`
- `soft-bob`
- `layered-long`
- `low-ponytail`
- `polished-bob`
- `low-bun`
- `shoulder-wave`

Supported outfit IDs are `executive`, `doctor`, `nurse`, `cabin`, `hanfu`,
`teacher`, `academy`, `turtleneck`, `editorial`, and `anime`.

## Facial Animation Blueprint

Create a Blueprint subclass of `EnglishImmersionDirector` and bind
`OnAvatarStateChanged`:

- `speaking=true`: start the MetaHuman audio/lip-sync animation.
- `performance=inviting`: warm half-smile and direct eye contact.
- `performance=listening`: neutral mouth, attentive eyes, slight forward lean.
- `performance=thinking`: subtle brow raise and head tilt.
- `performance=explaining`: speech animation plus hand gesture montage.
- `performance=encouraging`: smile and affirmative nod.

Do not drive the MetaHuman face by replacing its base-color texture at runtime.
Identity must come from a MetaHuman Character/Identity asset so the head mesh,
skin textures, eyes, teeth, rig, and correctives remain coherent.

## Face Material Quality Gate

- Use the assembled MetaHuman face material instances unchanged as the base.
- Keep animated maps enabled at face LOD0/LOD1.
- Keep skin cache and subsurface scattering enabled.
- Use ACES exposure with a neutral key and fill light; do not bake directional
  shadows from the source portrait into albedo.
- Reject visible neck seams, duplicated eyebrows, projected hair, or texture
  discontinuity under neutral studio lighting.

## Hair Quality Gate

- Hair is an independent Groom or Hair Cards component, never painted onto the
  head texture.
- Windows quality target: strand groom at LOD0/LOD1.
- macOS quality target: authored hair cards, because Epic's platform table does
  not support strand rendering on Mac.
- Every selectable portrait must map to a tagged hair component with matching
  silhouette and color.
- Verify scalp coverage, hairline, ear intersections, shoulder collision, and
  first/third-person LOD transitions.

## Run With Electron

Start the packaged renderer with Pixel Streaming:

```powershell
$env:EIS_UNREAL_EXECUTABLE="C:\path\EnglishImmersionRenderer.exe"
cd ..\english-immersion-studio
npm run metahuman
```

`npm run metahuman` downloads and builds Epic's UE5.7 signalling
infrastructure into the user's home cache, starts it on ports `8080` and
`8888`, starts the Unreal executable, then starts Electron.

On macOS, use a native packaged Unreal window and the local WebSocket bridge
until Pixel Streaming has a verified VideoToolbox path. The official Pixel
Streaming runtime supports Windows/Linux servers; Safari/Chrome on macOS remain
valid clients for a Windows renderer.

## Current Asset Boundary

Source code and the Electron integration are present in this repository.
MetaHuman binary assets are intentionally not checked in because they must be
created or assembled using the installed Epic tooling and accepted license.
Until a real MetaHuman asset and map are added, the Electron application keeps
the old Three.js stage as an explicit development fallback.
