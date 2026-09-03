"""
LipSync server — drop-in replacement for the Text2Face server on port 8765.

Two clients talk to this server:

    1) The Unreal TextToFaceClient component, unchanged.
       It POSTs /generate with {"prompt": "...", "frames": N, "fps": 60}.
       We ignore the prompt and return the most recently cached lipsync
       result — so the existing UE button still works, it just plays
       whatever audio was last uploaded via the web portal.

    2) The web portal (GET /) served by this same process.
       The portal lets the user drop a WAV/MP3/WebM file or record from
       the mic, uploads it to /upload, which decodes via ffmpeg, runs
       inference, caches the result, and returns it for preview.

Start:
    python server.py --ckpt ../checkpoints/best.pt --stats-dir ../stats

Open in browser:
    http://127.0.0.1:8765/

Health check:
    curl http://127.0.0.1:8765/health

Response shape (same as Text2Face, so UE client parses unchanged):
    {
      "duration":      3.12,
      "fps":           60,
      "n_frames":      187,
      "generation_ms": 28.4,
      "arkit_raw":     { "JawOpen": [...], "MouthFunnel": [...], ... },
      "curves":        {}
    }

Only mouth/jaw channels carry real data; all other ARKit channels (brows,
eyes, head, eye rotation) are zero.
"""
from __future__ import annotations

import argparse
import base64
import io
import shutil
import subprocess
import tempfile
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
import torchaudio
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from scipy.ndimage import uniform_filter1d

from constants import (
    ARKIT_CHANNELS, AUDIO_SR, FACE_FPS, MOUTH_INDICES, N_BLENDSHAPES,
    SECONDARY_MOUTH_INDICES,
)
from model import LipSyncModel


# =============================================================================
# Request / response schemas
# =============================================================================

class LipSyncRequest(BaseModel):
    # --- Fresh-inference mode (web portal direct, or testing via curl) ---
    audio_base64: Optional[str] = Field(
        None, description="Base64-encoded WAV bytes")
    audio_path: Optional[str] = Field(
        None, description="Local path to an audio file (testing only)")

    # --- Legacy/UE mode: the Unreal TextToFaceClient posts with
    # {prompt, frames, fps}; we accept and ignore those and return the
    # most recently cached lipsync result. Lets UE work unchanged.
    prompt: Optional[str] = Field(
        None, description="[legacy] ignored, triggers cached playback")
    frames: Optional[int] = Field(
        None, description="[legacy] ignored, cached clip uses its own frame count")

    # --- Shared post-processing knobs ---
    fps: int = Field(
        FACE_FPS, ge=1, le=120, description="Output frame rate")
    smooth_window: int = Field(
        3, ge=1, le=15, description="Moving-average window (1=off)")
    gain: float = Field(
        1.5, ge=0.1, le=5.0,
        description="Centered amplification around each channel's rest pose. "
                    "1.0=off, 1.5=default (moderate boost), 2.0=strong, 3.0=dramatic.")
    silence_gate: float = Field(
        0.0, ge=0.0, le=1.0,
        description="RMS-based mouth gate strength. 0=off (trust the model), "
                    "1=aggressive (mouth closes hard during quiet audio). "
                    "0.5 is a reasonable safety net.")
    silence_threshold_db: float = Field(
        -40.0, ge=-80.0, le=-10.0,
        description="RMS level below which audio is considered silent, in dBFS")
    cfg_scale: float = Field(
        1.0, ge=0.5, le=5.0,
        description="Classifier-free guidance scale. 1.0=off (raw model output), "
                    "1.5=moderate boost, 2.0=confident. Amplifies the audio-driven "
                    "signal by contrasting with a silent-audio baseline.")


class LipSyncResponse(BaseModel):
    duration: float
    fps: int
    n_frames: int
    generation_ms: float
    arkit_raw: dict[str, list[float]]
    curves: dict[str, list[float]] = {}
    audio_base64: Optional[str] = None  # WAV bytes for synced playback in Unreal


class HealthResponse(BaseModel):
    status: str
    device: Optional[str] = None
    model_params_m: Optional[float] = None


# =============================================================================
# Model state — loaded once at startup
# =============================================================================

_model: Optional[LipSyncModel] = None
_mean: Optional[np.ndarray] = None
_std: Optional[np.ndarray] = None
_device: Optional[torch.device] = None
_params_m: float = 0.0

# Cached result of the most recent web-portal upload. When the UE
# client POSTs /generate with a prompt (no audio), we return this.
_latest_result: Optional[dict] = None
_latest_source_name: str = "(none)"

# Job-id keyed cache: frontend uploads audio, gets back a job_id, then the
# game pulls the result by id via GET /result/{id}. Bounded LRU so old
# jobs eventually drop out and RAM doesn't grow unbounded.
_MAX_CACHE_ENTRIES = 128
_job_cache: "OrderedDict[str, dict]" = OrderedDict()


def _store_job(result: dict) -> str:
    """Assign a job id, cache the result (LRU eviction), return the id."""
    job_id = uuid.uuid4().hex
    _job_cache[job_id] = result
    _job_cache.move_to_end(job_id)
    while len(_job_cache) > _MAX_CACHE_ENTRIES:
        _job_cache.popitem(last=False)
    return job_id


def resolve_device(requested: str) -> torch.device:
    if requested == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if torch.backends.mps.is_available() and torch.backends.mps.is_built():
            return torch.device("mps")
        return torch.device("cpu")
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available")
    if requested == "mps" and not (
        torch.backends.mps.is_available() and torch.backends.mps.is_built()
    ):
        raise RuntimeError("MPS was requested but is not available")
    return torch.device(requested)


def load_model(ckpt_path: str, stats_dir: str, device_name: str = "auto") -> None:
    global _model, _mean, _std, _device, _params_m

    _device = resolve_device(device_name)
    print(f"[server] device: {_device}")

    ckpt = Path(ckpt_path)
    if not ckpt.exists():
        raise FileNotFoundError(f"checkpoint not found: {ckpt}")
    print(f"[server] loading checkpoint: {ckpt}")
    payload = torch.load(ckpt, map_location=_device, weights_only=False)
    saved = payload.get("args", {})

    # Fallback encoder for v1 checkpoints (which didn't record encoder_name
    # and were always trained with wav2vec2_base). v2 checkpoints always
    # have encoder_name set explicitly.
    is_v1_checkpoint = ("trainable_ema" not in payload
                        and "encoder_name" not in payload
                        and "encoder_name" not in saved)
    default_encoder = "wav2vec2_base" if is_v1_checkpoint else "hubert_large"

    _model = LipSyncModel(
        n_channels=N_BLENDSHAPES,
        encoder_name=payload.get("encoder_name", saved.get("encoder_name", default_encoder)),
        hidden=saved.get("hidden", 512),
        n_layers=saved.get("n_layers", 8),
        n_heads=saved.get("n_heads", 8),
        ff_dim=saved.get("ff_dim", 2048),
        dropout=saved.get("dropout", 0.2),
    ).to(_device)

    # v2 trimmed checkpoint: only trainable weights saved, frozen encoder
    # is rebuilt from torchaudio inside LipSyncModel.__init__
    if "trainable_ema" in payload:
        _model.load_trainable_state_dict(payload["trainable_ema"])
        print("[server] loaded v2 trimmed EMA weights")
    elif "ema_model" in payload:
        # v1 legacy full checkpoint
        _model.load_state_dict(payload["ema_model"])
        print("[server] loaded v1 full EMA weights")
    elif "model" in payload:
        _model.load_state_dict(payload["model"])
        print("[server] loaded v1 model weights")
    else:
        raise RuntimeError("checkpoint has no recognized weights key")
    _model.eval()

    _mean = np.load(Path(stats_dir) / "mean.npy").astype(np.float32)
    _std = np.load(Path(stats_dir) / "std.npy").astype(np.float32)

    _params_m = sum(p.numel() for p in _model.parameters()) / 1e6
    print(f"[server] model: {_params_m:.2f}M params total")

    # GPU warmup — pay the kernel JIT cost before the first real request.
    with torch.no_grad():
        dummy = torch.zeros(1, AUDIO_SR, device=_device)  # 1s of silence
        _ = _model(dummy, FACE_FPS)
    print("[server] warmup complete, serving")


# =============================================================================
# Audio loading
# =============================================================================

def _to_mono_16k(wav: np.ndarray, sr: int) -> np.ndarray:
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    wav = wav.astype(np.float32, copy=False)
    if sr != AUDIO_SR:
        t = torch.from_numpy(wav).unsqueeze(0)
        t = torchaudio.functional.resample(t, sr, AUDIO_SR)
        wav = t.squeeze(0).numpy()
    return wav


def load_audio_bytes(data: bytes) -> np.ndarray:
    with io.BytesIO(data) as buf:
        wav, sr = sf.read(buf, dtype="float32", always_2d=False)
    return _to_mono_16k(wav, sr)


def load_audio_path(path: str) -> np.ndarray:
    wav, sr = sf.read(path, dtype="float32", always_2d=False)
    return _to_mono_16k(wav, sr)


def decode_via_ffmpeg(data: bytes, suffix: str = "") -> tuple[np.ndarray, bytes]:
    """
    Decode any audio container (WebM/Opus from MediaRecorder, MP3, M4A, OGG,
    or WAV) to mono 16kHz float32 via an ffmpeg subprocess.

    Returns (wav_numpy, wav_bytes) -- the numpy array for inference and the
    raw WAV file bytes for sending to Unreal without re-encoding.
    """
    tmpdir = Path(tempfile.mkdtemp(prefix="lipsync_upload_"))
    try:
        in_path = tmpdir / f"input{suffix or '.bin'}"
        out_path = tmpdir / "converted.wav"
        in_path.write_bytes(data)

        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(in_path),
            "-ac", "1", "-ar", str(AUDIO_SR), "-vn",
            "-f", "wav",
            str(out_path),
        ]
        subprocess.run(cmd, check=True)

        wav_bytes = out_path.read_bytes()
        wav, sr = sf.read(out_path, dtype="float32", always_2d=False)
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        return wav.astype(np.float32), wav_bytes
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# =============================================================================
# Inference
# =============================================================================

def _audio_to_wav_base64(audio: np.ndarray, sr: int = AUDIO_SR) -> str:
    """Encode mono float32 audio as a base64 WAV string for Unreal playback."""
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return base64.b64encode(buf.getvalue()).decode("ascii")


_KEEP = set(MOUTH_INDICES + SECONDARY_MOUTH_INDICES)

# The trained model only ever saw 180-frame (3s) windows during training —
# only positions 0..179 in the learned pos_embed received gradient updates,
# even though the tensor is sized for 1024. For inference on longer clips we
# run the model on 180-frame chunks and cross-fade the overlaps.
CHUNK_FRAMES = 180      # matches train.py --window-frames
OVERLAP_FRAMES = 30     # 0.5s crossfade between chunks
MAX_CHUNK_BATCH = 16    # cap the batched forward pass to bound VRAM


def _model_forward_chunked(audio: np.ndarray, n_total_frames: int) -> np.ndarray:
    """
    Run the model on potentially long audio. Returns DENORMALIZED blendshapes
    of shape [n_total_frames, 52]. For clips <= CHUNK_FRAMES this is a single
    forward pass; for longer clips the audio is split into overlapping
    CHUNK_FRAMES chunks, forwarded as a batch, and stitched via overlap-add.
    """
    assert _model is not None and _mean is not None and _std is not None

    # Short clip: one pass, no chunking.
    if n_total_frames <= CHUNK_FRAMES:
        audio_t = torch.from_numpy(audio).unsqueeze(0).to(_device)
        with torch.no_grad():
            out = _model(audio_t, n_total_frames)  # [1, N, 52] normalized
        return out[0].cpu().numpy() * _std + _mean

    # Long clip: split into overlapping chunks anchored to pos_embed position 0.
    stride = CHUNK_FRAMES - OVERLAP_FRAMES  # 150
    starts: list[int] = list(range(0, max(1, n_total_frames - OVERLAP_FRAMES), stride))
    if starts[-1] + CHUNK_FRAMES < n_total_frames:
        starts.append(n_total_frames - CHUNK_FRAMES)  # ensure we reach the end

    samples_per_chunk = int(CHUNK_FRAMES / FACE_FPS * AUDIO_SR)

    # Collect padded audio chunks so they can be stacked into a batch
    chunk_tensors: list[np.ndarray] = []
    for s in starts:
        a0 = int(s / FACE_FPS * AUDIO_SR)
        a1 = a0 + samples_per_chunk
        chunk_a = audio[a0:a1]
        if len(chunk_a) < samples_per_chunk:
            chunk_a = np.pad(chunk_a, (0, samples_per_chunk - len(chunk_a)))
        chunk_tensors.append(chunk_a.astype(np.float32))

    # Run the model on chunks in batches of MAX_CHUNK_BATCH to bound VRAM
    chunk_outputs: list[np.ndarray] = []
    for i in range(0, len(chunk_tensors), MAX_CHUNK_BATCH):
        batch_np = np.stack(chunk_tensors[i : i + MAX_CHUNK_BATCH])  # [B, samples]
        batch_t = torch.from_numpy(batch_np).to(_device)
        with torch.no_grad():
            out_b = _model(batch_t, CHUNK_FRAMES)  # [B, 180, 52] normalized
        chunk_outputs.append(out_b.cpu().numpy())
    out_batch = np.concatenate(chunk_outputs, axis=0) * _std + _mean  # denormalized

    # Overlap-add stitching with linear crossfade in the overlap regions
    result = np.zeros((n_total_frames, N_BLENDSHAPES), dtype=np.float32)
    weights = np.zeros(n_total_frames, dtype=np.float32)
    for i, s in enumerate(starts):
        end = min(s + CHUNK_FRAMES, n_total_frames)
        chunk_len = end - s
        chunk = out_batch[i, :chunk_len]                                 # [L, 52]

        w = np.ones(chunk_len, dtype=np.float32)
        if i > 0:
            ramp = min(OVERLAP_FRAMES, chunk_len)
            w[:ramp] = np.linspace(0.0, 1.0, ramp, dtype=np.float32)
        if i < len(starts) - 1:
            ramp = min(OVERLAP_FRAMES, chunk_len)
            # np.minimum so the head-ramp isn't overwritten for a short chunk
            w[-ramp:] = np.minimum(w[-ramp:],
                                    np.linspace(1.0, 0.0, ramp, dtype=np.float32))

        result[s:end] += chunk * w[:, None]
        weights[s:end] += w

    result /= np.maximum(weights[:, None], 1e-8)
    return result


def compute_silence_gate(
    audio: np.ndarray,
    n_face_frames: int,
    fps: int,
    threshold_db: float,
    strength: float,
) -> np.ndarray:
    """
    Compute a per-face-frame gate in [0, 1] based on the audio's RMS envelope.
    Returns a gate of length n_face_frames where 1.0 = keep mouth motion,
    0.0 = fully suppress. Smoothed over ~250ms so short word-gaps stay open.
    """
    if strength <= 0.0 or len(audio) == 0:
        return np.ones(n_face_frames, dtype=np.float32)

    # 1) Short-time RMS at face-frame rate
    samples_per_face_frame = max(1, AUDIO_SR // fps)
    n_audio_frames = len(audio) // samples_per_face_frame
    if n_audio_frames < 1:
        return np.ones(n_face_frames, dtype=np.float32)

    audio_trim = audio[: n_audio_frames * samples_per_face_frame]
    framed = audio_trim.reshape(n_audio_frames, samples_per_face_frame)
    rms = np.sqrt((framed ** 2).mean(axis=1) + 1e-12)  # [n_audio_frames]

    # 2) Smooth the envelope over ~250ms so short pauses don't close the mouth
    smooth_n = max(1, int(0.25 * fps))
    if smooth_n > 1 and len(rms) > smooth_n:
        rms = uniform_filter1d(rms, size=smooth_n, mode="nearest")

    # 3) Convert to gate: above threshold = 1, well below = 0, smooth in between
    threshold = 10 ** (threshold_db / 20.0)
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-8))
    # Sigmoid centered on threshold, ~10dB transition width
    gate_raw = 1.0 / (1.0 + np.exp(-(rms_db - threshold_db) / 4.0))

    # 4) Resample to exactly n_face_frames
    if len(gate_raw) != n_face_frames:
        x_src = np.linspace(0.0, 1.0, len(gate_raw), dtype=np.float32)
        x_dst = np.linspace(0.0, 1.0, n_face_frames, dtype=np.float32)
        gate_raw = np.interp(x_dst, x_src, gate_raw)

    # 5) Blend with strength: full gate at strength=1, no gate at strength=0
    gate = (1.0 - strength) + strength * gate_raw
    return gate.astype(np.float32)


def run_inference(audio: np.ndarray, fps: int, smooth_window: int, gain: float,
                  silence_gate: float = 0.0, silence_threshold_db: float = -40.0,
                  cfg_scale: float = 1.0) -> dict:
    assert _model is not None and _mean is not None and _std is not None

    t0 = time.perf_counter()

    n_frames = int(round(len(audio) / AUDIO_SR * fps))
    if n_frames < 2:
        raise ValueError("audio too short — need at least ~33ms")

    # Classifier-Free Guidance: amplify the audio-driven signal by contrasting
    # with a silent-audio prediction. Since the model was trained with silence
    # augmentation (silence_prob), it learned P(face|audio) AND P(face|silence).
    # CFG: output = uncond + cfg_scale * (cond - uncond)
    # At cfg_scale=1.0, this is just the raw prediction (no extra cost).
    bs = _model_forward_chunked(audio, n_frames)         # [T, 52] denormalized
    if cfg_scale != 1.0:
        silent = np.zeros_like(audio)
        bs_uncond = _model_forward_chunked(silent, n_frames)
        bs = bs_uncond + cfg_scale * (bs - bs_uncond)
    bs = np.clip(bs, 0.0, 1.0)

    # Zero out non-mouth channels so the lipsync layer doesn't conflict with
    # Text2Face on brows, eyes, etc.
    for ch in range(N_BLENDSHAPES):
        if ch not in _KEEP:
            bs[:, ch] = 0.0

    # Centered amplification: stretch mouth motion around each channel's
    # training mean. Unlike a raw multiply, this keeps the neutral/resting
    # pose unchanged while exaggerating movement away from it. At high
    # gain, silent moments even clip toward a harder-closed mouth.
    if gain != 1.0:
        for ch in _KEEP:
            rest = float(_mean[ch])
            bs[:, ch] = rest + gain * (bs[:, ch] - rest)
        bs = np.clip(bs, 0.0, 1.0)

    # Temporal smoothing (moving average)
    if smooth_window > 1 and bs.shape[0] > smooth_window:
        bs = uniform_filter1d(bs, size=smooth_window, axis=0, mode="nearest")
        bs = np.clip(bs, 0.0, 1.0)

    # Optional RMS-based silence gate: scale mouth channels down where the
    # audio is quiet for >250ms. Off by default; opt in via the request.
    if silence_gate > 0.0:
        gate = compute_silence_gate(
            audio, bs.shape[0], fps, silence_threshold_db, silence_gate)
        for ch in _KEEP:
            bs[:, ch] = bs[:, ch] * gate

    # Short fade in/out so the mouth opens from closed and closes at the end.
    FADE = 6  # ~0.1s
    for f in range(min(FADE, bs.shape[0])):
        bs[f] *= (f + 1) / FADE
    for f in range(min(FADE, bs.shape[0])):
        bs[-1 - f] *= (f + 1) / FADE

    # Build full 61-channel ARKit output. Head + eye rotation channels stay 0.
    arkit = np.zeros((bs.shape[0], 61), dtype=np.float32)
    arkit[:, :N_BLENDSHAPES] = bs

    arkit_raw = {ARKIT_CHANNELS[i]: arkit[:, i].tolist() for i in range(61)}

    gen_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "duration": bs.shape[0] / fps,
        "fps": fps,
        "n_frames": int(bs.shape[0]),
        "generation_ms": round(gen_ms, 2),
        "arkit_raw": arkit_raw,
        "curves": {},
    }


# =============================================================================
# FastAPI
# =============================================================================

app = FastAPI(title="LipSync sidecar", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ready" if _model is not None else "loading",
        device=str(_device) if _device is not None else None,
        model_params_m=round(_params_m, 2) if _model is not None else None,
    )


@app.post("/generate", response_model=LipSyncResponse)
def generate(req: LipSyncRequest):
    """
    Three modes:
      1. audio_base64 / audio_path → run fresh inference and return result
      2. prompt (UE legacy)        → return the most recently cached result
      3. neither                   → 400
    """
    global _latest_result

    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    # --- Mode 1: fresh audio payload ---
    if req.audio_base64 or req.audio_path:
        try:
            if req.audio_base64:
                audio = load_audio_bytes(base64.b64decode(req.audio_base64))
            else:
                audio = load_audio_path(req.audio_path)
        except Exception as e:
            raise HTTPException(400, f"bad audio input: {e}")

        try:
            result = run_inference(
                audio, req.fps, req.smooth_window, req.gain,
                silence_gate=req.silence_gate,
                silence_threshold_db=req.silence_threshold_db,
                cfg_scale=req.cfg_scale,
            )
        except Exception as e:
            raise HTTPException(500, f"inference failed: {e}")

        # Include the processed audio so Unreal can play it in sync
        result["audio_base64"] = _audio_to_wav_base64(audio)

        # Assign an id so clients can GET /result/{id} later
        result["id"] = _store_job(result)

        _latest_result = result  # update cache so UE can pull it next
        print(f"[server] fresh inference id={result['id'][:8]} "
              f"{result['n_frames']}f ({result['duration']:.2f}s, "
              f"{result['generation_ms']}ms)", flush=True)
        return result

    # --- Mode 2: legacy prompt from UE → return cached ---
    if req.prompt is not None:
        if _latest_result is None:
            raise HTTPException(
                409,
                "no audio cached yet — upload one via the web portal at "
                "http://127.0.0.1:8765/ first"
            )
        print(f"[server] replayed cached result for UE client "
              f"(prompt='{req.prompt[:40]}')", flush=True)
        return _latest_result

    raise HTTPException(
        400,
        "need one of: audio_base64, audio_path, or prompt (UE legacy mode)"
    )


@app.post("/upload")
async def upload(
    audio: UploadFile = File(...),
    gain: float = Form(1.5),
    smooth_window: int = Form(3),
    silence_gate: float = Form(0.0),
    silence_threshold_db: float = Form(-40.0),
    cfg_scale: float = Form(1.0),
    include_audio: bool = Form(True),
    mouth_only: bool = Form(False),
):
    """
    Receive an audio file (any common format) from the web portal,
    decode via ffmpeg, run inference, cache the result so UE can pull it.
    Returns the full inference response so the portal can visualize.
    """
    global _latest_result, _latest_source_name

    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    gain = max(0.1, min(5.0, float(gain)))
    smooth_window = max(1, min(15, int(smooth_window)))
    silence_gate = max(0.0, min(1.0, float(silence_gate)))
    silence_threshold_db = max(-80.0, min(-10.0, float(silence_threshold_db)))
    cfg_scale = max(0.5, min(5.0, float(cfg_scale)))

    try:
        raw = await audio.read()
    except Exception as e:
        raise HTTPException(400, f"could not read upload: {e}")

    if not raw:
        raise HTTPException(400, "empty upload")

    suffix = Path(audio.filename or "").suffix.lower()
    try:
        wav, wav_bytes = decode_via_ffmpeg(raw, suffix)
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, f"ffmpeg could not decode audio: {e}")
    except Exception as e:
        raise HTTPException(400, f"decode failed: {e}")

    if wav.size < int(AUDIO_SR * 0.1):
        raise HTTPException(400, "audio too short (<100ms after decoding)")

    try:
        result = run_inference(
            wav, fps=FACE_FPS,
            smooth_window=smooth_window, gain=gain,
            silence_gate=silence_gate, silence_threshold_db=silence_threshold_db,
            cfg_scale=cfg_scale,
        )
    except Exception as e:
        raise HTTPException(500, f"inference failed: {e}")

    if mouth_only:
        result["arkit_raw"] = {
            ARKIT_CHANNELS[index]: result["arkit_raw"][ARKIT_CHANNELS[index]]
            for index in sorted(_KEEP)
        }

    if include_audio:
        result["audio_base64"] = base64.b64encode(wav_bytes).decode("ascii")

    # Assign an id so clients can GET /result/{id} later
    result["id"] = _store_job(result)

    _latest_result = result
    _latest_source_name = audio.filename or "(unnamed upload)"
    print(f"[server] cached id={result['id'][:8]} '{_latest_source_name}': "
          f"{result['n_frames']}f ({result['duration']:.2f}s, "
          f"{result['generation_ms']}ms)", flush=True)

    return JSONResponse({
        "source_name": _latest_source_name,
        "gain": gain,
        "smooth_window": smooth_window,
        "cfg_scale": cfg_scale,
        **result,
    })


@app.get("/latest")
def latest():
    """Return the currently cached result, or 404 if none."""
    if _latest_result is None:
        raise HTTPException(404, "no audio cached yet")
    return {
        "source_name": _latest_source_name,
        **_latest_result,
    }


@app.get("/result/{job_id}")
def get_result(job_id: str):
    """
    Return a cached result by id (for the Unreal client after the frontend
    has uploaded audio + got an id).
    """
    job = _job_cache.get(job_id)
    if job is None:
        raise HTTPException(404, f"job id '{job_id}' not found or expired")
    _job_cache.move_to_end(job_id)  # refresh LRU
    return job


@app.get("/", response_class=HTMLResponse)
def portal():
    """Serve the web portal HTML."""
    portal_path = Path(__file__).parent / "static" / "index.html"
    if not portal_path.exists():
        return HTMLResponse(
            "<h1>LipSync server is running</h1>"
            "<p>But the web portal HTML wasn't found at "
            f"<code>{portal_path}</code>.</p>",
            status_code=200,
        )
    return HTMLResponse(portal_path.read_text(encoding="utf-8"))


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt",      default="../checkpoints/best.pt")
    parser.add_argument("--stats-dir", default="../stats")
    parser.add_argument("--host",      default="127.0.0.1")
    parser.add_argument("--port",      type=int, default=8765,
                        help="Default 8765 matches the Text2Face port so the "
                             "existing UE TextToFaceClient works unchanged.")
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "mps", "cuda"),
        default="auto",
        help="Inference backend. Auto prefers CUDA, then Apple MPS, then CPU.",
    )
    args = parser.parse_args()

    load_model(args.ckpt, args.stats_dir, args.device)
    print(f"[server] web portal:  http://{args.host}:{args.port}/")
    print(f"[server] health:      http://{args.host}:{args.port}/health")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
