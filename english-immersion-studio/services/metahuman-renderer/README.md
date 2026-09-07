# English Immersion MetaHuman Renderer

Unreal Engine 5.7 rendering process for English Immersion Studio. This project
replaces the production Three.js avatar with MetaHuman skin, RigLogic facial
deformation, modular hair, and modular wardrobe assets.

## Required Installation

Install Unreal Engine 5.7 from Epic Games Launcher and enable these installation
options:

- MetaHuman Creator Core Data
- Starter Content

Engine source and editor debug symbols are optional and are not required for
the renderer build.

The Core Data package is required because it contains MetaHuman presets, grooms,
texture models, and assembly dependencies. In the editor, enable:

- MetaHuman Character
- MetaHuman Core Tech
- RigLogic
- Control Rig
- Hair Strands
- Pixel Streaming 2

Restart the editor after enabling plugins.

## Generate Or Update A Character

`Scripts/setup_sophia.py` creates an editable character from an Epic adult
female preset. Its defaults are `SophiaAoi`, the `Aoi` preset, and the
`Hair_L_Straight` Groom; command-line arguments can override all three. The
script keeps the preset's native skin tone, applies makeup, and removes
inherited facial hair. Run
`Scripts/build_sophia.py` after setup to download 2K texture sources, create the
full joints-and-blend-shapes rig, and assemble the optimized runtime assets.
For an existing source identity, `Scripts/update_character_hair.py` changes
only the Hair wardrobe selection before the same optimized build step.

For example, the verified Amara runtime uses:

```bash
UnrealEditor EnglishImmersionRenderer.uproject \
  -ExecutePythonScript=Scripts/update_character_hair.py \
  -EISCharacterName=Sophia \
  -EISHair=Hair_L_StraightBangs

UnrealEditor EnglishImmersionRenderer.uproject \
  -ExecutePythonScript=Scripts/build_sophia.py \
  -EISCharacterName=Sophia \
  -EISSkipTextures \
  -EISSkipAutoRig
```

Run the assembly step with the normal graphics backend. Epic's TextureGraph
material bake crashes under `-nullrhi` on the verified macOS configuration.

On macOS, run Unreal from a mirror outside Desktop to avoid Desktop Folder TCC
prompts:

```bash
export EIS_UNREAL_ENGINE_ROOT="/Users/Shared/Epic Games/UE_5.7"
export EIS_UNREAL_MIRROR="/Users/Shared/EnglishImmersionRenderer"
export EIS_UNREAL_EDITOR="$EIS_UNREAL_ENGINE_ROOT/Engine/Binaries/Mac/UnrealEditor"

rsync -a --delete --exclude Binaries --exclude Intermediate --exclude Saved \
  ./ "$EIS_UNREAL_MIRROR/"

"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/setup_sophia.py" \
  -log

"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/build_sophia.py" \
  -log
```

The first online build opens Epic device authorization in the browser. Complete
that flow once; subsequent builds reuse the persistent authorization.

Create the reproducible interview map after SophiaTuya, Sophia, and Vivian have
all been assembled. Direct execution blocks until the current Editor process
exits; do not run scene setup and verification against the project concurrently.

```bash
"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/setup_interview_scene.py" \
  -log

"$EIS_UNREAL_EDITOR" \
  "$EIS_UNREAL_MIRROR/EnglishImmersionRenderer.uproject" \
  "-ExecutePythonScript=$EIS_UNREAL_MIRROR/Scripts/verify_interview_scene.py" \
  -log
```

The scene setup is idempotent. It recreates the map with Sophia, the first- and
third-person cameras, movable studio lights, a neutral backdrop, runtime tags,
and the default interview floor.

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
| MetaHuman root actor | `Avatar.amara-aera` | Switches identity |
| Hair/Groom component | `Hair.long-straight` | Switches real hair geometry |
| Wardrobe component | `Outfit.executive` | Switches clothing |
| Environment root actor | `Scene.interview` | Switches environment |
| Cine Camera actor | `Camera.first` | Switches viewpoint |

Supported hair IDs:

- `long-straight`
- `long-straight-bangs`
- `bob-straight`

The only currently verified outfit ID is `studio-basic`. Planned wardrobe IDs
remain hidden in Electron until corresponding assembled assets exist.

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

The local workspace currently contains editable MetaHuman source characters
and three optimized runtime Blueprints: SophiaTuya, Sophia/Aera, and Vivian.
Their verified hair assets are long straight, long straight with bangs, and
bob straight respectively. Generated assets under
`Content/Characters/MetaHumans/` and `Content/MetaHumans/` include files larger
than GitHub's normal 100 MB limit. Keep source-format licensed assets in
access-controlled private storage, or regenerate them from the scripts after
installing Epic's licensed Core Data. Git LFS does not make public source-asset
distribution permissible.

See [`../../docs/METAHUMAN_ASSET_REBUILD.md`](../../docs/METAHUMAN_ASSET_REBUILD.md)
for the asset boundary, checksums, rebuild commands, and acceptance gates.

When Unreal is unavailable, Electron shows a non-blocking reconnect state. It
does not substitute the old Three.js humanoid as if it were the production
MetaHuman.

The complete architecture and migration contract is documented in
[`../../TECHNOLOGY.md`](../../TECHNOLOGY.md).
