"""
LipSync + Face server — runs Audio2Lipsync and Text2Face together.

Returns a merged 61-channel ARKit animation:
    - mouth / jaw / cheek / tongue channels  -> LipSync (audio-driven)
    - brows / eyes / head rotation           -> Text2Face (prompt-driven)

Response shape mirrors the standalone LipSync server, so Unreal Blueprints
that consume GET /latest or GET /result/{id} keep working unchanged.

Requires a local clone of the Text2Face repo (for its model architecture):
    https://github.com/aaryansachdeva/unreal-text2face

Start:
    python server_lipsync_face.py \\
        --lipsync-ckpt   /path/to/audio2lipsync/checkpoints/best.pt \\
        --lipsync-stats  /path/to/audio2lipsync/python/stats \\
        --t2f-src        /path/to/unreal-text2face/python/src \\
        --t2f-ckpt       /path/to/unreal-text2face/checkpoints/best.pt \\
        --t2f-stats      /path/to/unreal-text2face/python/stats \\
        --port           8765

API:
    POST /upload          multipart form; fields: audio (file), prompt (str, optional)
    POST /generate        JSON body; see GenerateBody schema below
    GET  /result/{id}     cached job
    GET  /latest          most recent cached job
    GET  /health          server status
    GET  /                web portal (upload + prompt + tuning sliders)
"""
from __future__ import annotations

import argparse
import base64
import io
import shutil
import subprocess
import sys
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

# =============================================================================
# Local imports (LipSync lives in the same dir as this file)
# =============================================================================

from constants import (
    ARKIT_CHANNELS, AUDIO_SR, FACE_FPS, MOUTH_INDICES, N_BLENDSHAPES,
    SECONDARY_MOUTH_INDICES,
)
from model import LipSyncModel


# =============================================================================
# Text2Face import (different src dir, loaded dynamically to avoid name clash
# with our local `model.py` / `constants.py`)
# =============================================================================

def _load_module(name: str, path: str):
    """Load a Python module from an explicit file path under a given name."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_T2F_MODULE = None   # will hold the dynamically-loaded Text2Face model module


# =============================================================================
# Device selection (CUDA → MPS → CPU)
# =============================================================================

def pick_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return torch.device("mps")
    return torch.device("cpu")


_device: Optional[torch.device] = None


# =============================================================================
# LipSync model state
# =============================================================================

_ls_model: Optional[LipSyncModel] = None
_ls_mean: Optional[np.ndarray] = None
_ls_std: Optional[np.ndarray] = None
_ls_params_m: float = 0.0


def load_lipsync(ckpt_path: str, stats_dir: str) -> None:
    global _ls_model, _ls_mean, _ls_std, _ls_params_m
    print(f"[lipsync] loading {ckpt_path}")
    payload = torch.load(ckpt_path, map_location=_device, weights_only=False)
    saved = payload.get("args", {})

    is_v1 = ("trainable_ema" not in payload and "encoder_name" not in saved)
    default_encoder = "wav2vec2_base" if is_v1 else "hubert_large"

    _ls_model = LipSyncModel(
        n_channels=N_BLENDSHAPES,
        encoder_name=payload.get("encoder_name", saved.get("encoder_name", default_encoder)),
        hidden=saved.get("hidden", 512),
        n_layers=saved.get("n_layers", 8),
        n_heads=saved.get("n_heads", 8),
        ff_dim=saved.get("ff_dim", 2048),
        dropout=saved.get("dropout", 0.2),
    ).to(_device)

    if "trainable_ema" in payload:
        _ls_model.load_trainable_state_dict(payload["trainable_ema"])
    elif "ema_model" in payload:
        _ls_model.load_state_dict(payload["ema_model"])
    elif "model" in payload:
        _ls_model.load_state_dict(payload["model"])
    else:
        raise RuntimeError("LipSync checkpoint has no recognised weights key")
    _ls_model.eval()

    _ls_mean = np.load(Path(stats_dir) / "mean.npy").astype(np.float32)
    _ls_std = np.load(Path(stats_dir) / "std.npy").astype(np.float32)

    _ls_params_m = sum(p.numel() for p in _ls_model.parameters()) / 1e6
    print(f"[lipsync] ready — {_ls_params_m:.2f}M params")

    # Warmup
    with torch.no_grad():
        _ = _ls_model(torch.zeros(1, AUDIO_SR, device=_device), FACE_FPS)
    print("[lipsync] warmed up")


# =============================================================================
# Text2Face model state
# =============================================================================

_t2f_model = None
_t2f_mean: Optional[np.ndarray] = None
_t2f_std: Optional[np.ndarray] = None
_t2f_max_frames: int = 240
_t2f_params_m: float = 0.0


def load_text2face(ckpt_path: str, stats_dir: str) -> None:
    global _t2f_model, _t2f_mean, _t2f_std, _t2f_max_frames, _t2f_params_m
    assert _T2F_MODULE is not None, "T2F module not loaded — call _load_module first"
    TextToFace = _T2F_MODULE.TextToFace

    print(f"[t2f] loading {ckpt_path}")
    payload = torch.load(ckpt_path, map_location=_device, weights_only=False)
    saved = payload.get("args", {})
    _t2f_max_frames = int(saved.get("max_frames", 240))

    _t2f_model = TextToFace(
        max_frames=_t2f_max_frames,
        latent_dim=saved.get("latent_dim", 768),
        n_layers=saved.get("n_layers", 6),
        n_heads=saved.get("n_heads", 12),
        ff_dim=saved.get("ff_dim", 2048),
        dropout=saved.get("dropout", 0.25),
    ).to(_device)

    if "ema_model" in payload:
        _t2f_model.load_state_dict(payload["ema_model"])
    else:
        _t2f_model.load_state_dict(payload["model"])
    _t2f_model.eval()

    _t2f_mean = np.load(Path(stats_dir) / "mean.npy").astype(np.float32)
    _t2f_std = np.load(Path(stats_dir) / "std.npy").astype(np.float32)

    _t2f_params_m = sum(p.numel() for p in _t2f_model.parameters()) / 1e6
    print(f"[t2f] ready — {_t2f_params_m:.2f}M params, max_frames={_t2f_max_frames}")

    # Warmup
    with torch.no_grad():
        _ = _t2f_model(["warmup"], n_frames=8)
    print("[t2f] warmed up")


# =============================================================================
# Audio helpers (copied from the standalone LipSync server)
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


def decode_via_ffmpeg(data: bytes, suffix: str = "") -> tuple[np.ndarray, bytes]:
    tmpdir = Path(tempfile.mkdtemp(prefix="combined_upload_"))
    try:
        in_path = tmpdir / f"input{suffix or '.bin'}"
        out_path = tmpdir / "converted.wav"
        in_path.write_bytes(data)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(in_path),
             "-ac", "1", "-ar", str(AUDIO_SR), "-vn", "-f", "wav", str(out_path)],
            check=True,
        )
        wav_bytes = out_path.read_bytes()
        wav, sr = sf.read(out_path, dtype="float32", always_2d=False)
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        return wav.astype(np.float32), wav_bytes
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _audio_to_wav_base64(audio: np.ndarray, sr: int = AUDIO_SR) -> str:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# =============================================================================
# LipSync inference (simplified from the standalone server — chunked + stitched)
# =============================================================================

_MOUTH_KEEP = set(MOUTH_INDICES + SECONDARY_MOUTH_INDICES)
CHUNK_FRAMES = 180
OVERLAP_FRAMES = 30
MAX_CHUNK_BATCH = 16


def _lipsync_forward_chunked(audio: np.ndarray, n_total_frames: int) -> np.ndarray:
    assert _ls_model is not None and _ls_mean is not None and _ls_std is not None

    if n_total_frames <= CHUNK_FRAMES:
        audio_t = torch.from_numpy(audio).unsqueeze(0).to(_device)
        with torch.no_grad():
            out = _ls_model(audio_t, n_total_frames)
        return out[0].cpu().numpy() * _ls_std + _ls_mean

    stride = CHUNK_FRAMES - OVERLAP_FRAMES
    starts = list(range(0, max(1, n_total_frames - OVERLAP_FRAMES), stride))
    if starts[-1] + CHUNK_FRAMES < n_total_frames:
        starts.append(n_total_frames - CHUNK_FRAMES)

    samples_per_chunk = int(CHUNK_FRAMES / FACE_FPS * AUDIO_SR)
    chunk_tensors = []
    for s in starts:
        a0 = int(s / FACE_FPS * AUDIO_SR)
        chunk_a = audio[a0:a0 + samples_per_chunk]
        if len(chunk_a) < samples_per_chunk:
            chunk_a = np.pad(chunk_a, (0, samples_per_chunk - len(chunk_a)))
        chunk_tensors.append(chunk_a.astype(np.float32))

    chunk_outputs = []
    for i in range(0, len(chunk_tensors), MAX_CHUNK_BATCH):
        batch = torch.from_numpy(np.stack(chunk_tensors[i:i + MAX_CHUNK_BATCH])).to(_device)
        with torch.no_grad():
            out_b = _ls_model(batch, CHUNK_FRAMES)
        chunk_outputs.append(out_b.cpu().numpy())
    out_batch = np.concatenate(chunk_outputs, axis=0) * _ls_std + _ls_mean

    result = np.zeros((n_total_frames, N_BLENDSHAPES), dtype=np.float32)
    weights = np.zeros(n_total_frames, dtype=np.float32)
    for i, s in enumerate(starts):
        end = min(s + CHUNK_FRAMES, n_total_frames)
        chunk_len = end - s
        chunk = out_batch[i, :chunk_len]

        w = np.ones(chunk_len, dtype=np.float32)
        if i > 0:
            ramp = min(OVERLAP_FRAMES, chunk_len)
            w[:ramp] = np.linspace(0.0, 1.0, ramp, dtype=np.float32)
        if i < len(starts) - 1:
            ramp = min(OVERLAP_FRAMES, chunk_len)
            w[-ramp:] = np.minimum(w[-ramp:],
                                   np.linspace(1.0, 0.0, ramp, dtype=np.float32))

        result[s:end] += chunk * w[:, None]
        weights[s:end] += w

    result /= np.maximum(weights[:, None], 1e-8)
    return result


def run_lipsync(audio: np.ndarray, fps: int, gain: float = 1.5,
                smooth_window: int = 3, cfg_scale: float = 1.0) -> np.ndarray:
    """Returns a [T, 52] float32 array, mouth/jaw channels populated, others zero."""
    n_frames = int(round(len(audio) / AUDIO_SR * fps))
    if n_frames < 2:
        raise ValueError("audio too short")

    bs = _lipsync_forward_chunked(audio, n_frames)
    # Classifier-free guidance: contrast audio-driven prediction with
    # silent-audio baseline to amplify the audio signal. cfg_scale=1.0 is a no-op.
    if cfg_scale != 1.0:
        silent = np.zeros_like(audio)
        bs_uncond = _lipsync_forward_chunked(silent, n_frames)
        bs = bs_uncond + cfg_scale * (bs - bs_uncond)
    bs = np.clip(bs, 0.0, 1.0)

    # Zero non-mouth channels — the T2F layer owns them
    for ch in range(N_BLENDSHAPES):
        if ch not in _MOUTH_KEEP:
            bs[:, ch] = 0.0

    # Centered amplification on kept channels
    if gain != 1.0:
        for ch in _MOUTH_KEEP:
            rest = float(_ls_mean[ch])
            bs[:, ch] = rest + gain * (bs[:, ch] - rest)
        bs = np.clip(bs, 0.0, 1.0)

    if smooth_window > 1 and bs.shape[0] > smooth_window:
        bs = uniform_filter1d(bs, size=smooth_window, axis=0, mode="nearest")
        bs = np.clip(bs, 0.0, 1.0)

    # Fades are applied at the combined stage (user-controlled ms) instead
    # of here, so the two models don't double-fade.
    return bs


# =============================================================================
# Text2Face inference
#
# The model has a learned positional embedding of length `max_frames` (240
# by default, = 4s at 60fps), so a single forward pass can't produce more
# than that. For longer outputs we chunk: generate overlapping 240-frame
# segments with the same prompt and crossfade the overlap regions. Same
# pattern LipSync already uses internally.
# =============================================================================

T2F_OVERLAP_FRAMES = 60  # 1-second crossfade between chunks at 60fps


def _t2f_once(prompt: str, n_frames: int,
              guidance: float, smooth_window: int) -> np.ndarray:
    """One forward pass. `n_frames` must be <= _t2f_max_frames."""
    assert _t2f_model is not None and _t2f_mean is not None and _t2f_std is not None
    assert n_frames <= _t2f_max_frames

    with torch.no_grad():
        cond = _t2f_model([prompt], n_frames=n_frames)
        if guidance != 1.0:
            uncond = _t2f_model([""], n_frames=n_frames)
            out_norm = uncond + guidance * (cond - uncond)
        else:
            out_norm = cond
    arkit = out_norm[0].cpu().numpy() * _t2f_std + _t2f_mean
    arkit[:, :52] = np.clip(arkit[:, :52], 0.0, 1.0)

    if smooth_window > 1 and arkit.shape[0] > smooth_window:
        arkit = uniform_filter1d(arkit, size=smooth_window, axis=0, mode="nearest")
        arkit[:, :52] = np.clip(arkit[:, :52], 0.0, 1.0)
    return arkit


def run_text2face(prompt: str, n_frames: int, fps: int,
                  guidance: float = 1.5, smooth_window: int = 5) -> np.ndarray:
    """Returns a [n_frames, 61] float32 array. Handles arbitrarily long
    durations by chunking + crossfading."""
    if n_frames <= _t2f_max_frames:
        # Per-chunk fades are handled at the combined stage (user-controlled ms)
        return _t2f_once(prompt, n_frames, guidance, smooth_window)

    # Multi-chunk path
    chunk = _t2f_max_frames
    overlap = min(T2F_OVERLAP_FRAMES, chunk // 2)
    stride = chunk - overlap

    starts: list[int] = [0]
    while starts[-1] + chunk < n_frames:
        starts.append(starts[-1] + stride)
    # Make sure the last chunk ends exactly at n_frames. Truncate if needed.
    last_end = starts[-1] + chunk
    if last_end < n_frames:
        # Extend final chunk by stride, will be truncated below
        starts.append(n_frames - chunk)

    # Generate each chunk
    chunk_outputs: list[tuple[int, np.ndarray]] = []
    for s in starts:
        this_len = min(chunk, n_frames - s)
        out = _t2f_once(prompt, this_len, guidance, smooth_window)
        chunk_outputs.append((s, out))

    # Stitch with linear crossfade on the overlaps
    result = np.zeros((n_frames, 61), dtype=np.float32)
    weights = np.zeros(n_frames, dtype=np.float32)
    for i, (s, arkit) in enumerate(chunk_outputs):
        L = arkit.shape[0]
        end = s + L
        w = np.ones(L, dtype=np.float32)

        # Fade in from previous chunk (except for the first)
        if i > 0:
            r = min(overlap, L)
            w[:r] = np.linspace(0.0, 1.0, r, dtype=np.float32)

        # Fade out to next chunk (except for the last)
        if i < len(chunk_outputs) - 1:
            r = min(overlap, L)
            w[-r:] = np.minimum(w[-r:],
                                np.linspace(1.0, 0.0, r, dtype=np.float32))

        result[s:end] += arkit * w[:, None]
        weights[s:end] += w

    result /= np.maximum(weights[:, None], 1e-8)
    # Global fade is applied at the combined stage
    return result


# =============================================================================
# Combine LipSync + Text2Face into a single ARKit output
# =============================================================================
#
# The mouth is split into two groups so emotion and articulation can both
# register on the lips at the same time. Without this split, a happy speaker
# would lose their smile the moment they opened their mouth to talk, because
# LipSync would overwrite MouthSmile* with its (usually ~zero) predictions.
#
# LIPSYNC_PHONETIC:  pure articulation. LipSync replaces T2F here — these are
#     jaw/lip positions dictated by phonemes and have no emotional meaning.
# EXPRESSIVE_MOUTH:  mouth shape that also carries emotion (smile/frown/
#     dimple/stretch/cheek puff, etc.). Additive blend — LipSync's value +
#     T2F's value, clipped to [0, 1]. In practice LipSync outputs near-zero
#     on most of these, so T2F's emotion comes through; on the ones LipSync
#     does drive (e.g. MouthUpperUp for an "A" vowel, MouthLowerDown for
#     open vowels), both signals layer.
# Everything else: T2F owns (eyes, brows, nose, head rotation).

LIPSYNC_PHONETIC = {
    14, 15, 16, 17,  # JawForward, JawRight, JawLeft, JawOpen
    18,              # MouthClose (bilabial closure for M/B/P)
    19,              # MouthFunnel (rounded vowels)
    20,              # MouthPucker (tight lips W/OO)
    31, 32,          # MouthRollLower/Upper (F/V lip roll)
    33, 34,          # MouthShrugLower/Upper
    35, 36,          # MouthPressLeft/Right
    51,              # TongueOut
}

EXPRESSIVE_MOUTH = {
    21, 22,          # MouthRight, MouthLeft (asymmetric expression)
    23, 24,          # MouthSmileLeft/Right
    25, 26,          # MouthFrownLeft/Right
    27, 28,          # MouthDimpleLeft/Right
    29, 30,          # MouthStretchLeft/Right
    37, 38,          # MouthLowerDownLeft/Right (open-vowel + frown-lip)
    39, 40,          # MouthUpperUpLeft/Right (open-vowel + sneer)
    46,              # CheekPuff
    47, 48,          # CheekSquintLeft/Right
}


def combine(lipsync_bs52: np.ndarray, t2f_arkit61: np.ndarray,
            mouth_blend: str = "split") -> np.ndarray:
    """Merge the two models into one [T, 61] ARKit output.

    mouth_blend:
        "split"   (default) — phonetic channels owned by LipSync, expressive
                  mouth channels additive-blend LipSync + T2F.
        "replace" — legacy behaviour: LipSync replaces T2F on every mouth
                  channel. Use if you want emotion ONLY on upper face.
        "additive" — LipSync + T2F on ALL mouth channels, clipped. Loosest
                  merge, may over-exaggerate some shapes.
    """
    T = lipsync_bs52.shape[0]
    assert t2f_arkit61.shape[0] == T, "lipsync and t2f must have same frame count"

    combined = t2f_arkit61.copy()

    if mouth_blend == "replace":
        for ch in _MOUTH_KEEP:
            combined[:, ch] = lipsync_bs52[:, ch]
        return combined

    if mouth_blend == "additive":
        for ch in _MOUTH_KEEP:
            combined[:, ch] = np.clip(
                lipsync_bs52[:, ch] + t2f_arkit61[:, ch], 0.0, 1.0)
        return combined

    # Default: "split"
    for ch in LIPSYNC_PHONETIC:
        combined[:, ch] = lipsync_bs52[:, ch]
    for ch in EXPRESSIVE_MOUTH:
        combined[:, ch] = np.clip(
            lipsync_bs52[:, ch] + t2f_arkit61[:, ch], 0.0, 1.0)
    return combined


# =============================================================================
# Public inference pipeline
# =============================================================================

def _apply_fade(arr: np.ndarray, fps: int,
                fade_in_ms: int, fade_out_ms: int) -> np.ndarray:
    """Ramp values toward zero (neutral) at the start and end of the clip.

    fade_in_ms:  how long it takes for the face to come UP from rest at the start.
    fade_out_ms: how long it takes for the face to settle BACK to rest at the end.

    Both are expressed in milliseconds and converted to frames based on fps.
    A value of 0 disables that side.
    """
    T = arr.shape[0]
    if T == 0:
        return arr

    fade_in = max(0, int(round(fade_in_ms * fps / 1000.0)))
    fade_out = max(0, int(round(fade_out_ms * fps / 1000.0)))

    for f in range(min(fade_in, T)):
        arr[f] *= (f + 1) / fade_in
    for f in range(min(fade_out, T)):
        arr[-1 - f] *= (f + 1) / fade_out

    return arr


def run_combined(audio: np.ndarray, prompt: str, fps: int,
                 lipsync_gain: float = 1.5,
                 lipsync_smooth: int = 3,
                 lipsync_cfg_scale: float = 1.0,
                 t2f_guidance: float = 1.5,
                 t2f_smooth: int = 5,
                 mouth_blend: str = "split",
                 fade_in_ms: int = 150,
                 fade_out_ms: int = 400) -> dict:
    t0 = time.perf_counter()

    bs52 = run_lipsync(audio, fps, gain=lipsync_gain,
                       smooth_window=lipsync_smooth, cfg_scale=lipsync_cfg_scale)
    n_frames = bs52.shape[0]

    if prompt and prompt.strip() and _t2f_model is not None:
        t2f = run_text2face(prompt, n_frames, fps,
                            guidance=t2f_guidance, smooth_window=t2f_smooth)
    else:
        # No prompt → Text2Face layer is just zeros on every channel
        t2f = np.zeros((n_frames, 61), dtype=np.float32)

    arkit_full = combine(bs52, t2f, mouth_blend=mouth_blend)
    _apply_fade(arkit_full, fps, fade_in_ms, fade_out_ms)

    arkit_raw = {ARKIT_CHANNELS[i]: arkit_full[:, i].tolist() for i in range(61)}
    gen_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "duration": n_frames / fps,
        "fps": fps,
        "n_frames": int(n_frames),
        "generation_ms": round(gen_ms, 2),
        "prompt": prompt,
        "arkit_raw": arkit_raw,
    }


# =============================================================================
# Job cache
# =============================================================================

_MAX_CACHE = 128
_job_cache: "OrderedDict[str, dict]" = OrderedDict()
_latest_result: Optional[dict] = None
_latest_source: str = "(none)"


def _store_job(result: dict) -> str:
    jid = uuid.uuid4().hex
    _job_cache[jid] = result
    _job_cache.move_to_end(jid)
    while len(_job_cache) > _MAX_CACHE:
        _job_cache.popitem(last=False)
    return jid


# =============================================================================
# FastAPI app
# =============================================================================

app = FastAPI(title="LipSync + Face server", version="0.1.0")


class GenerateBody(BaseModel):
    audio_base64: Optional[str] = Field(None)
    audio_path: Optional[str] = Field(None)
    prompt: str = Field("", description="Text direction for Text2Face (upper face + head rotation)")
    fps: int = Field(FACE_FPS, ge=1, le=120)
    lipsync_gain: float = Field(1.5, ge=0.1, le=5.0)
    lipsync_smooth: int = Field(3, ge=1, le=15)
    lipsync_cfg_scale: float = Field(1.0, ge=0.5, le=5.0)
    t2f_guidance: float = Field(1.5, ge=0.5, le=5.0)
    t2f_smooth: int = Field(5, ge=1, le=15)
    mouth_blend: str = Field(
        "split",
        description="How to merge mouth channels: 'split' (phonetic from "
                    "LipSync, expressive additive), 'replace' (all mouth "
                    "from LipSync only), 'additive' (full mouth additive).",
    )
    fade_in_ms: int = Field(150, ge=0, le=2000,
        description="Fade from neutral at the start (ms). 0 = no fade.")
    fade_out_ms: int = Field(400, ge=0, le=2000,
        description="Fade back to neutral at the end (ms). 0 = snap.")


@app.get("/health")
def health():
    return {
        "status": "ready" if (_ls_model is not None and _t2f_model is not None) else "loading",
        "device": str(_device) if _device is not None else None,
        "lipsync_params_m": round(_ls_params_m, 2),
        "t2f_params_m": round(_t2f_params_m, 2),
    }


@app.post("/generate")
def generate(body: GenerateBody):
    global _latest_result

    if _ls_model is None:
        raise HTTPException(503, "lipsync model not loaded")

    if body.audio_base64:
        try:
            audio = load_audio_bytes(base64.b64decode(body.audio_base64))
        except Exception as e:
            raise HTTPException(400, f"bad audio_base64: {e}")
    elif body.audio_path:
        try:
            wav, sr = sf.read(body.audio_path, dtype="float32", always_2d=False)
            audio = _to_mono_16k(wav, sr)
        except Exception as e:
            raise HTTPException(400, f"bad audio_path: {e}")
    else:
        raise HTTPException(400, "need audio_base64 or audio_path")

    try:
        result = run_combined(
            audio, body.prompt, body.fps,
            lipsync_gain=body.lipsync_gain,
            lipsync_smooth=body.lipsync_smooth,
            lipsync_cfg_scale=body.lipsync_cfg_scale,
            t2f_guidance=body.t2f_guidance,
            t2f_smooth=body.t2f_smooth,
            mouth_blend=body.mouth_blend,
            fade_in_ms=body.fade_in_ms,
            fade_out_ms=body.fade_out_ms,
        )
    except Exception as e:
        raise HTTPException(500, f"inference failed: {e}")

    result["audio_base64"] = _audio_to_wav_base64(audio)
    result["id"] = _store_job(result)

    _latest_result = result
    print(f"[server] id={result['id'][:8]} {result['n_frames']}f "
          f"prompt='{body.prompt[:40]}' ({result['generation_ms']}ms)", flush=True)
    return result


@app.post("/upload")
async def upload(
    audio: UploadFile = File(...),
    prompt: str = Form(""),
    fps: int = Form(FACE_FPS),
    lipsync_gain: float = Form(1.5),
    lipsync_smooth: int = Form(3),
    lipsync_cfg_scale: float = Form(1.0),
    t2f_guidance: float = Form(1.5),
    t2f_smooth: int = Form(5),
    mouth_blend: str = Form("split"),
    fade_in_ms: int = Form(150),
    fade_out_ms: int = Form(400),
):
    global _latest_result, _latest_source

    if _ls_model is None:
        raise HTTPException(503, "lipsync model not loaded")

    try:
        raw = await audio.read()
    except Exception as e:
        raise HTTPException(400, f"upload read failed: {e}")
    if not raw:
        raise HTTPException(400, "empty upload")

    suffix = Path(audio.filename or "").suffix.lower()
    try:
        wav, wav_bytes = decode_via_ffmpeg(raw, suffix)
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, f"ffmpeg decode failed: {e}")
    except Exception as e:
        raise HTTPException(400, f"decode failed: {e}")

    if wav.size < int(AUDIO_SR * 0.1):
        raise HTTPException(400, "audio too short (<100ms)")

    try:
        result = run_combined(
            wav, prompt, fps,
            lipsync_gain=lipsync_gain, lipsync_smooth=lipsync_smooth,
            lipsync_cfg_scale=lipsync_cfg_scale,
            t2f_guidance=t2f_guidance, t2f_smooth=t2f_smooth,
            mouth_blend=mouth_blend,
            fade_in_ms=fade_in_ms, fade_out_ms=fade_out_ms,
        )
    except Exception as e:
        raise HTTPException(500, f"inference failed: {e}")

    result["audio_base64"] = base64.b64encode(wav_bytes).decode("ascii")
    result["id"] = _store_job(result)

    _latest_result = result
    _latest_source = audio.filename or "(unnamed)"
    print(f"[server] id={result['id'][:8]} '{_latest_source}' "
          f"prompt='{prompt[:40]}' {result['n_frames']}f "
          f"({result['generation_ms']}ms)", flush=True)

    return JSONResponse({
        "source_name": _latest_source,
        **result,
    })


@app.get("/latest")
def latest():
    if _latest_result is None:
        raise HTTPException(404, "no result cached yet")
    return {"source_name": _latest_source, **_latest_result}


@app.get("/result/{job_id}")
def get_result(job_id: str):
    job = _job_cache.get(job_id)
    if job is None:
        raise HTTPException(404, f"job id '{job_id}' not found or expired")
    _job_cache.move_to_end(job_id)
    return job


# =============================================================================
# Web portal (minimal — inline HTML with a prompt textbox)
# =============================================================================

PORTAL_HTML = """
<!doctype html>
<html><head>
<meta charset="utf-8" /><title>LipSync + Face</title>
<style>
  body { background: #0a0a0f; color: #e6e6ea; font-family: system-ui, sans-serif;
         max-width: 720px; margin: 40px auto; padding: 0 20px; }
  h1 { font-weight: 600; letter-spacing: .01em; }
  .panel { background: #14141b; border: 1px solid #262633; border-radius: 8px;
           padding: 20px; margin: 18px 0; }
  label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
          color: #888; margin-bottom: 6px; }
  input[type=text], input[type=file] { width: 100%; padding: 10px; background: #1c1c25;
    color: #e6e6ea; border: 1px solid #2a2a35; border-radius: 6px; font: inherit; }
  button { background: #2dd4bf; color: #0a0a0f; border: 0; padding: 10px 18px;
           border-radius: 6px; font: 600 14px system-ui; cursor: pointer; margin-top: 12px; }
  button:disabled { opacity: .5; cursor: wait; }
  .status { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px;
            padding: 10px 14px; border: 1px solid #2a2a35; border-radius: 6px;
            background: #14141b; margin-top: 12px; }
  .ok { border-color: #2dd4bf; }
  .err { border-color: #ff5555; color: #ff8e8a; }
  .jobid { background: #1c1c25; padding: 8px 10px; border-radius: 6px;
           font-family: monospace; font-size: 13px; cursor: pointer; margin-top: 8px;
           word-break: break-all; border: 1px solid transparent; }
  .jobid:hover { border-color: #2dd4bf; }
  .jobid.copied { border-color: #2dd4bf; color: #2dd4bf; }
  .hint { color: #888; font-size: 12px; margin-top: 4px; }
</style>
</head><body>
<h1>LipSync + Face</h1>
<p class="hint">Audio drives the mouth. Text drives brows / eyes / head rotation. Leave prompt blank for lipsync-only.</p>

<div class="panel">
  <label>Prompt (Text2Face direction)</label>
  <input type="text" id="prompt" placeholder="e.g. A person looks suspicious" />
  <div class="hint">Empty = no upper-face expression.</div>
</div>

<div class="panel">
  <label>Audio file (WAV / MP3 / WebM / M4A)</label>
  <input type="file" id="file" accept="audio/*" />
  <button id="go">Generate</button>
  <div id="status" class="status" style="display:none"></div>
  <div id="jobid" class="jobid" style="display:none" title="click to copy"></div>
</div>

<script>
const $ = id => document.getElementById(id);
function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status ' + (kind || '');
  el.style.display = 'block';
}

$('go').addEventListener('click', async () => {
  const file = $('file').files[0];
  if (!file) { setStatus('pick an audio file first', 'err'); return; }
  $('go').disabled = true;
  setStatus('running inference…', 'wait');
  const fd = new FormData();
  fd.append('audio', file);
  fd.append('prompt', $('prompt').value);
  try {
    const t0 = performance.now();
    const resp = await fetch('/upload', { method: 'POST', body: fd });
    if (!resp.ok) throw new Error(resp.status + ' ' + await resp.text());
    const r = await resp.json();
    const ms = (performance.now() - t0).toFixed(0);
    setStatus(`cached ${r.n_frames} frames (${r.duration.toFixed(2)}s) in ${ms}ms`, 'ok');
    if (r.id) {
      const jb = $('jobid');
      jb.textContent = r.id;
      jb.style.display = 'block';
    }
  } catch (err) {
    setStatus('error: ' + err.message, 'err');
  } finally {
    $('go').disabled = false;
  }
});

$('jobid').addEventListener('click', async () => {
  const el = $('jobid');
  const id = el.textContent.trim();
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    const prev = el.textContent;
    el.classList.add('copied');
    el.textContent = 'copied!';
    setTimeout(() => { el.classList.remove('copied'); el.textContent = prev; }, 900);
  } catch {}
});
</script>
</body></html>
"""


@app.get("/", response_class=HTMLResponse)
def portal():
    """Serve the full combined portal (waveform + curve graph + blend selector)."""
    portal_path = Path(__file__).parent / "static" / "index_lipsync_face.html"
    if portal_path.exists():
        return HTMLResponse(portal_path.read_text(encoding="utf-8"))
    # Fallback to the minimal inline portal if the static file is missing
    return HTMLResponse(PORTAL_HTML)


# =============================================================================
# CLI
# =============================================================================

def main():
    global _device, _T2F_MODULE

    p = argparse.ArgumentParser()
    p.add_argument("--lipsync-ckpt",   required=True, help="LipSync checkpoint .pt")
    p.add_argument("--lipsync-stats",  required=True, help="LipSync stats dir (mean.npy, std.npy)")
    p.add_argument("--t2f-src",        required=True, help="Text2Face python src dir (contains model.py)")
    p.add_argument("--t2f-ckpt",       required=True, help="Text2Face checkpoint .pt")
    p.add_argument("--t2f-stats",      required=True, help="Text2Face stats dir")
    p.add_argument("--host",           default="127.0.0.1")
    p.add_argument("--port",           type=int, default=8765)
    args = p.parse_args()

    _device = pick_device()
    print(f"[server] device: {_device}")

    # Load T2F's model.py under a distinct module name to avoid clashing with
    # our local `model.py` (which is LipSync's). We need T2F's src on sys.path
    # too because T2F's model.py imports transformers etc. (no local deps,
    # but being on path keeps imports tidy).
    t2f_src = str(Path(args.t2f_src).resolve())
    if t2f_src not in sys.path:
        sys.path.append(t2f_src)
    _T2F_MODULE = _load_module("t2f_model", str(Path(t2f_src) / "model.py"))
    print(f"[server] loaded t2f model module from {t2f_src}/model.py")

    load_lipsync(args.lipsync_ckpt, args.lipsync_stats)
    load_text2face(args.t2f_ckpt, args.t2f_stats)

    print(f"[server] web portal:  http://{args.host}:{args.port}/")
    print(f"[server] health:      http://{args.host}:{args.port}/health")
    print(f"[server] latest:      http://{args.host}:{args.port}/latest")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
