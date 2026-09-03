# Audio2Lipsync

Real-time audio-driven lipsync for Unreal Engine MetaHumans. Feed the model an audio clip and it generates frame-accurate mouth, jaw, and cheek motion, which is streamed to UE via LiveLink and played back in sync with the original audio on a MetaHuman face.

Designed to stack with [Text2Face](https://github.com/aaryansachdeva/unreal-text2face): Text2Face drives the upper face (brows, eyes, head rotation) additively, while Audio2Lipsync owns the mouth. Both publish to the same LiveLink subject and the MetaHuman's ABP_MH_LiveLink consumes everything through the standard ARKit pipeline.

## How It Works

```
Audio (WAV/MP3/Base64) ──> Python Server ──> HTTP ──> UE Component ──> LiveLink ──> MetaHuman Face
                               |
                      HuBERT / Wav2Vec2 encoder
                      + Transformer (~325M params)
                      + 52-channel ARKit mouth/jaw output
                      + audio echoed back for sync playback
```

1. **Python sidecar server** holds a trained LipSync model resident in GPU/MPS memory
2. **Web portal** (built into the server) lets you upload audio and copy a Job ID
3. **UE C++ component** pulls the result by Job ID and plays face + audio together
4. **LiveLink source** publishes the 61-channel ARKit data as a LiveLink subject
5. **MetaHuman's LiveLink AnimBP** maps ARKit → face rig automatically

## Features

- Audio input in any common format (WAV, MP3, M4A, WebM) — ffmpeg handles decoding
- 52 ARKit blendshapes with loss weighting that keeps mouth motion primary
- Returns both face curves AND the processed audio in one response (no sync drift)
- Job-ID cache so frontends can upload once and the game fetches by reference
- Real-time playback at 60fps
- CUDA, Apple Silicon (MPS), and CPU fallback
- Modular Blueprint nodes (Import Audio, Parse Face JSON, Play With Audio, etc.)
- Works with any MetaHuman character

## Project Structure

```
Audio2Lipsync/
  python/                        Python model + sidecar server
    src/
      model.py                   LipSync architecture (HuBERT-Large + Transformer)
      train.py                   Training loop (weighted L1, velocity loss, EMA)
      server.py                  FastAPI sidecar: standalone LipSync (audio -> mouth)
      server_lipsync_face.py     FastAPI sidecar: LipSync + Text2Face merged
      dataset.py                 Training data loader
      prepare_data.py            Convert iPhone LiveLink recordings -> training data
      constants.py               Channel names and loss weights
      static/
        index.html               Web portal for the standalone server
        index_lipsync_face.html  Web portal for the merged LipSync + Face server
    stats/                       Precomputed mean/std for normalization
    requirements.txt
  unreal/                        UE5 C++ module (drop into your project)
    Source/Audio2Lipsync/
      Public/
        AudioImporterLib.h       Blueprint library: decode WAV/MP3, PCM conversion
        FaceAnimationLib.h       Blueprint library: parse face JSON, channel sampling
        LiveLinkFaceComponent.h  ActorComponent: high/low level playback API
      Private/                   (cpp implementations)
      ThirdParty/dr_mp3.h        Header-only MP3 decoder
      Audio2Lipsync.Build.cs
  LICENSE                        MIT
  README.md
```

## Quick Start

### Prerequisites

- Unreal Engine 5.6+
- Python 3.10+ (CUDA-capable GPU recommended; Apple Silicon and CPU also supported)
- ffmpeg on PATH
- A MetaHuman character in your UE project
- MetaHuman + LiveLink plugins enabled

### 1. Get a trained model

Download `best.pt` from the Hugging Face release at [fotonlabs/unreal-audio2lipsync](https://huggingface.co/fotonlabs/unreal-audio2lipsync) and drop it into a local `checkpoints/` directory, OR train your own:

```bash
# Prepare training data from iPhone Live Link Face recordings
python src/prepare_data.py --data-dir /path/to/livelinkface/recordings \
    --out-dir /path/to/prepared

# Train
python src/train.py --data-dir /path/to/prepared --stats-dir stats
```

The best checkpoint is saved to `checkpoints/best.pt`.

### 2. Install dependencies and start the server

```bash
conda create -n audio2lipsync python=3.11 -y
conda activate audio2lipsync

# Install PyTorch for your platform
# CUDA 12.4:
pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
# macOS (Apple Silicon, uses MPS):
pip install torch torchaudio

pip install -r python/requirements.txt

python python/src/server.py --ckpt path/to/best.pt --stats-dir python/stats
```

Open http://127.0.0.1:8765/ — the web portal lets you upload an audio file and see the inference result.

### 3. Set up Unreal Engine

> Your UE project needs to be a C++ project (not Blueprint-only). If you made it as Blueprint-only, just add any C++ class via the editor once and it'll convert.

**3.1 — Enable the required plugins** via `Edit → Plugins` (or directly in your `.uproject`):

- `LiveLink`
- `AppleARKitFaceSupport`
- `MetaHuman`, `MetaHumanCharacter`, `MetaHumanRuntime`, `MetaHumanLiveLink`, `MetaHumanCoreTech`
- `VaRest` (for the Blueprint HTTP/JSON nodes — [install from Fab](https://fab.com/listings/94ab8a2c-f20f-44f4-b7d9-6d37dc57bb5a) or copy the plugin folder into your project's `Plugins/`)
- `JsonBlueprintUtilities`

`MetaHumanDepthProcessing` and `MetaHumanCalibrationProcessing` are **not needed** for lipsync playback — leave them disabled for faster compile times.

**3.2 — Add the C++ module to your project:**

1. Copy the contents of `unreal/Source/Audio2Lipsync/` into your project's `Source/<YourModule>/` directory (merge with existing `Public/`, `Private/`, `ThirdParty/` folders)
2. Add these dependencies to your `.Build.cs`:
   ```csharp
   PublicDependencyModuleNames.AddRange(new string[] {
       "Core", "CoreUObject", "Engine", "InputCore",
       "AudioMixer", "HTTP", "AudioCapture", "SignalProcessing",
       "LiveLinkInterface",
   });
   PrivateDependencyModuleNames.AddRange(new string[] { "Json" });
   PrivateIncludePaths.Add(Path.Combine(ModuleDirectory, "ThirdParty"));
   ```
3. **Rename the API macro** — do a find-replace of `AUDIO2LIPSYNC_API` → `<YOURMODULE>_API` across all 6 source files. On Windows with git-bash:
   ```bash
   cd Source/<YourModule>
   for f in Public/*.h Private/*.cpp; do
     sed -i 's/AUDIO2LIPSYNC_API/<YOURMODULE>_API/g' "$f"
   done
   ```
4. Right-click your `.uproject` → **Generate Visual Studio project files**
5. Build (in VS: `Development Editor`/`Win64` → Build; or just open the `.uproject` and let the editor compile)

Common first-build gotchas:
- **"internal heap limit reached" / PCH failure**: your MSVC toolchain is 14.38 (buggy). Create `Saved/UnrealBuildTool/BuildConfiguration.xml` with:
  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <Configuration xmlns="https://www.unrealengine.com/BuildConfiguration">
    <WindowsPlatform><CompilerVersion>14.44.35207</CompilerVersion></WindowsPlatform>
    <BuildConfiguration><bUseUBA>false</bUseUBA></BuildConfiguration>
    <ParallelExecutor><MaxProcessorCount>4</MaxProcessorCount></ParallelExecutor>
  </Configuration>
  ```
  Delete `Intermediate/` and `Binaries/`, then rebuild.

**3.3 — Verify the nodes loaded.** Open any Blueprint graph and right-click → search `Parse Face Anim JSON`, `LiveLinkFaceComponent`, `Import Audio From Base64`. If they all appear, the module compiled cleanly.

**3.4 — Configure the MetaHuman's face AnimBP:**

1. Drop any MetaHuman (Quixel Bridge) into your level
2. In the Content Browser, enable **Show Plugin Content** (gear icon in top-right)
3. Search for **`ABP_MH_LiveLink`** — usually at `/MetaHumanCharacter Plugin Content/Animation/ABP_MH_LiveLink`
4. **Duplicate** it into your project's Content folder (e.g. `/Game/Generated/ABP_Face_LiveLink`). Don't edit the plugin copy.
5. Open the duplicate:
   - Find the LiveLink subject variable (`LLinkFaceSubj` or similar) → set default value = **`FaceAnimation`**
   - Find the **`IsMHFDS`** variable → set to **false** (this disables the default face solver which would otherwise fight your data)
   - **Compile** and **Save**

**3.5 — Wire it up on your MetaHuman Blueprint:**

1. Open your MetaHuman BP
2. Select the **Face** component (SkeletalMeshComponent)
3. Details → Animation → **Anim Class** = your duplicate (`ABP_Face_LiveLink`)
4. **Add Component** → search **`LiveLinkFaceComponent`** → add it
5. Select the component → Details → **Subject Name** = `FaceAnimation` (must match the AnimBP variable exactly)
6. **Compile** and **Save**

### 4. Hook it up in Blueprint

In your MetaHuman BP's Event Graph, make two custom events.

**Custom Event: `PlayLatest`** (no input) — pulls the latest cached result from the server.

```
[Custom Event: PlayLatest]
   │
   ▼
[Construct Json Request (VaRest)]
   Verb = GET
   Content Type = Json
   → Request

[Bind Event to On Request Complete]
   Target = Request (from Construct's Return Value)
   Event = OnLipSyncResult

[Process URL]
   Target = Request
   Url    = "http://127.0.0.1:8765/latest"
```

**Custom Event: `OnLipSyncResult`** with one input pin `Request (VaRestRequestJSON)`:

```
[Custom Event: OnLipSyncResult]
   Input: Request
   │
   ▼
[Get Response Object (VaRest)]   → ResponseJson
[Get Response Content As String] → ResponseString
   │
   ▼
[Parse Face Anim JSON]
   Json String = ResponseString
   → FaceData, ReturnValue

[Branch: ReturnValue]  (drop dead-ends on False)
   │ True:
   ▼
[Get String Field (VaRest)]
   Object = ResponseJson
   Field Name = "audio_base64"
   → ServerAudioB64

[Import Audio From Base64]
   Base64 String = ServerAudioB64
   → SoundWave

[Play With Audio]
   Target = LiveLinkFaceComponent (drag from Components panel)
   Data   = FaceData
   Audio  = SoundWave
```

**Test trigger — Key 1:**
```
[Event BeginPlay] → [Enable Input]  (target = Get Player Controller [0], actor = self)

[Keyboard 1 Pressed] → [Call PlayLatest]
```

Compile + Save.

> **Alternative — Job-ID flow**: if your frontend knows the exact job ID it wants, swap the URL for `"http://127.0.0.1:8765/result/" + JobId`. Otherwise `/latest` is the ergonomic default for local testing.

### 5. Test end-to-end

1. Open `http://127.0.0.1:8765/` in your browser → drop any WAV/MP3 → wait for inference (~30s)
2. Start PIE in Unreal (Alt+P)
3. Click the viewport to focus input
4. Press **1** — MetaHuman should speak in sync with the audio
5. Upload a different audio file → press **1** again → new result plays

**Verify the LiveLink pipeline** (optional but handy): while PIE is running, open `Window → Virtual Production → Live Link`. You should see a source called **`Face Animation`** with subject **`FaceAnimation`**. When you press 1, the subject's property values should flash.

### 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing happens on Key 1 | Input not enabled on the MetaHuman BP — add `Enable Input` on BeginPlay. |
| Face doesn't move, no errors | Subject name mismatch between component and AnimBP. Both must be `FaceAnimation`. |
| Face moves but looks wrong | AnimBP is running the default face solve — set `IsMHFDS = false`. |
| Audio plays, face static | `Parse Face Anim JSON` returned false. Add a `Print String` to check. Usually a server response issue. |
| HTTP "Duplicated delimiter '://'" | You have an `Append` node adding a second `http://` prefix. Hardcode the URL directly on `Process URL`'s `Url` pin. |
| `ConnectionError` / `Could not resolve host` | Server isn't running, or the port is blocked. Check `http://127.0.0.1:8765/health` in a browser first. |
| 404 from `/result/{id}` | Job ID expired (LRU evicted at 128 entries) or server restarted. Upload fresh audio. |
| Works once, breaks on second PIE | You have an old build without the source-cleanup fix — rebuild after pulling the latest code (`EndPlay` must call `Client.RemoveSource`). |

## API

### Python Server

```
GET  /health              → server status
GET  /result/{job_id}     → retrieve a cached result (for clients that got an id from /upload)

POST /generate            → run inference on supplied audio
  body: {
    "audio_base64": "UklGR...",        // base64-encoded WAV/MP3
    "fps": 60,
    "gain": 1.5,                       // mouth amplification (1.0=off)
    "smooth_window": 3,                // temporal smoothing (1=off)
    "silence_gate": 0.0,               // RMS-based mouth gate (0-1)
    "cfg_scale": 1.0                   // classifier-free guidance (1.0=off)
  }
  response: {
    "id": "<hex uuid>",                // cache this; retrievable via /result/{id}
    "duration": 3.2,
    "fps": 60,
    "n_frames": 192,
    "generation_ms": 48.7,
    "arkit_raw": { "JawOpen": [...], "MouthSmileLeft": [...], ... },
    "audio_base64": "UklGR..."         // the processed 16kHz mono WAV
  }

POST /upload              → multipart form upload (audio file) with the same response shape
```

### Unreal Blueprint Nodes

**Audio library (`UAudioImporterLib`, 18 functions):**
- Base64: `DecodeBase64`, `EncodeBase64`
- Format detection: `DetectAudioFormat` (WAV/MP3/Unknown)
- Decode: `DecodeMP3`, `DecodeWAV`, `DecodePCM16` → float samples
- Create: `CreateSoundWave` (float samples → USoundWaveProcedural)
- Convenience: `ImportAudio`, `ImportAudioFromBase64` (auto-detect + decode + create)
- Convert: `FloatToPCM16`, `PCM16ToFloat`, `ResampleAudio`, `MixToMono`
- Encode: `EncodeAsWAV`
- Analysis: `GetPeakLevel`, `GetRMSEnvelope`

**Face library (`UFaceAnimationLib`, 10 functions):**
- Parse: `ParseFaceAnimJSON`
- Query: `IsFaceDataValid`, `GetChannelNames`, `GetFrameCount`, `GetDuration`
- Sample: `GetChannelCurve`, `SampleChannel`, `SampleAllChannels`
- Manipulate: `ScaleChannels`, `BlendAnimations`

**Playback component (`ULiveLinkFaceComponent`):**
- High-level: `PlayAnimation`, `PlayWithAudio`, `FetchAndPlay`
- Manual tick-driven: `InitSource`, `PushFrame`, `ClearSource`
- Controls: `Stop`, `IsPlaying`, `GetProgress`
- Event: `OnPlaybackFinished`

## Optional: LipSync + Face Server

A second FastAPI entrypoint, `server_lipsync_face.py`, runs **Audio2Lipsync and [Text2Face](https://github.com/aaryansachdeva/unreal-text2face) in a single process** and returns a merged 61-channel ARKit animation:

- **Mouth / jaw / cheek / tongue channels** — driven by LipSync (audio)
- **Brows / eyes / head rotation** — driven by Text2Face (text prompt)

The response shape matches the standalone server, so the same Unreal Blueprint wiring works unchanged. You get lipsync *plus* upper-face emotion without maintaining a second client.

### Setup

1. Clone the Text2Face repo next to Audio2Lipsync and download its checkpoint (see that repo's README):
   ```bash
   git clone https://github.com/aaryansachdeva/unreal-text2face.git
   ```
2. Install its Python deps into the same environment:
   ```bash
   pip install -r unreal-text2face/python/requirements.txt
   ```
3. Start the merged server:
   ```bash
   python python/src/server_lipsync_face.py \
       --lipsync-ckpt   path/to/audio2lipsync/checkpoints/best.pt \
       --lipsync-stats  python/stats \
       --t2f-src        path/to/unreal-text2face/python/src \
       --t2f-ckpt       path/to/unreal-text2face/checkpoints/best.pt \
       --t2f-stats      path/to/unreal-text2face/python/stats \
       --port           8765
   ```
4. Open http://127.0.0.1:8765/ — the portal has a prompt textbox, a mouth-blend selector, LipSync + Text2Face tuning sliders, and fade-in/fade-out controls.

### Mouth blend modes

The mouth carries both articulation (phonemes) and emotion (smile/frown). The combined server splits the ARKit mouth channels into two groups so both signals can coexist on the lips:

| Mode | Phonetic channels (jaw, close, funnel, pucker, roll, press, tongue) | Expressive channels (smile, frown, dimple, stretch, upper-up, lower-down, cheek) |
|---|---|---|
| `split` (default) | LipSync replaces Text2Face | Additive blend (LipSync + Text2Face, clipped) |
| `replace` | LipSync replaces Text2Face | LipSync replaces Text2Face |
| `additive` | Additive blend | Additive blend |

`split` is the recommended default: phonemes stay crisp, while a smile or a frown rides on top of the spoken audio. `replace` drops upper-face emotion onto the lower face only if you want strict lipsync-only mouth shapes.

### Fades

`fade_in_ms` and `fade_out_ms` ramp the full 61-channel output from / to neutral at the start and end of the clip, so the face doesn't snap to or from rest.

## Model Details

- **Encoder:** HuBERT-Large (frozen) — extracts phonetic features from 16kHz audio
- **Decoder:** 8-layer Transformer (d=512, 8 heads, FF=2048, dropout=0.2)
- **Output:** 52 ARKit blendshape coefficients per frame @ 60fps
- **Training objective:** Weighted masked L1 (mouth channels get 3× weight) + velocity loss
- **Training data:** iPhone Live Link Face recordings paired with their audio tracks (LIVE LINK FACE app, free on iOS)
- **Inference:** 180-frame (3s) chunks, cross-faded overlap-add for arbitrary length clips

## License

**Code and pre-trained weights:** MIT — see [LICENSE](LICENSE). Use commercially, modify, redistribute, no obligations beyond keeping the license notice.

You can also train your own model on your own iPhone Live Link Face recordings using `prepare_data.py` — the pipeline is the same.

## Related Projects

- [Text2Face](https://github.com/aaryansachdeva/unreal-text2face) — upper-face text-conditioned expression generation

## Acknowledgements

- Apple's ARKit blendshape standard
- HuBERT / Wav2Vec2 audio encoders from Facebook AI Research (via torchaudio)
- Epic's MetaHuman project and LiveLink Face iOS app
- dr_mp3.h — Mackron's public-domain MP3 decoder
