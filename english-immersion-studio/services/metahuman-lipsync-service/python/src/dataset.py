"""
PyTorch dataset for paired audio + face blendshape training.

Each sample is a fixed-length window of (audio, face):
    audio: [window_samples] float32 @ 16kHz
    face:  [window_frames, 52] float32, normalized by per-channel mean/std

v2 changes vs v1:
    - Windows are now indexed globally with a flat index, so random sampling
      naturally produces frame-proportional take sampling (a longer take gets
      more windows = more training exposure). v1 sampled takes uniformly,
      which oversampled the short takes.
    - Validation uses a fixed stride to keep the val set small and fast.
    - Train-time audio augmentations: noise, gain perturbation, time masking.
      None of them perturb phonetic timing, so they're safe for lipsync.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from torch.utils.data import Dataset

from constants import AUDIO_SR, FACE_FPS, N_BLENDSHAPES


def _load_wav(path: str) -> np.ndarray:
    """Load a WAV as mono float32 at AUDIO_SR. Resamples if needed."""
    wav, sr = sf.read(path, dtype="float32", always_2d=False)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    if sr != AUDIO_SR:
        t = torch.from_numpy(wav).unsqueeze(0)
        t = torchaudio.functional.resample(t, sr, AUDIO_SR)
        wav = t.squeeze(0).numpy()
    return wav.astype(np.float32)


class LipSyncDataset(Dataset):
    def __init__(
        self,
        manifest_path: str,
        stats_dir: str,
        window_frames: int = 180,        # 3s @ 60fps (v2: longer context)
        split: str = "train",
        val_ratio: float = 0.1,
        val_stride: int = 30,            # val windows every 0.5s
        audio_noise_snr_db: float | None = 25.0,
        gain_db_range: float = 6.0,
        time_mask_prob: float = 0.3,
        time_mask_max_frac: float = 0.15,
        silence_prob: float = 0.15,
    ):
        super().__init__()
        manifest_file = Path(manifest_path)
        manifest = json.loads(manifest_file.read_text())
        manifest_dir = manifest_file.parent

        self.window_frames = window_frames
        self.window_samples = int(window_frames / FACE_FPS * AUDIO_SR)
        self.split = split

        # Augmentations only applied to train split
        self.audio_noise_snr_db = audio_noise_snr_db if split == "train" else None
        self.gain_db_range = gain_db_range if split == "train" else 0.0
        self.time_mask_prob = time_mask_prob if split == "train" else 0.0
        self.time_mask_max_frac = time_mask_max_frac
        self.silence_prob = silence_prob if split == "train" else 0.0

        stats_dir = Path(stats_dir)
        self.mean = np.load(stats_dir / "mean.npy").astype(np.float32)  # [52]
        self.std = np.load(stats_dir / "std.npy").astype(np.float32)    # [52]

        # Pre-compute the target for silent training windows: a fully neutral
        # face (raw=0 for every channel) expressed in the model's normalized
        # space. This is more conservative than using the training mean, which
        # includes some open-mouth speech frames — raw-zero means "closed mouth,
        # resting jaw, eyes neutral." Mouth-weighted loss will then pull the
        # model hard toward this target whenever the input audio is silent.
        silence_raw = np.zeros(N_BLENDSHAPES, dtype=np.float32)
        silence_norm = (silence_raw - self.mean) / self.std  # [52]
        self.silence_face = torch.from_numpy(
            np.tile(silence_norm, (window_frames, 1)).astype(np.float32)
        )
        self.silence_audio = torch.zeros(self.window_samples, dtype=torch.float32)

        def _resolve(p: str) -> Path:
            pp = Path(p)
            return pp if pp.is_absolute() else (manifest_dir / pp)

        # ---- Load every take into RAM (audio is small — ~94MB total) ----
        self.takes: list[dict] = []
        for t in manifest["takes"]:
            face = np.load(_resolve(t["face_path"])).astype(np.float32)  # [N, 52]
            wav = _load_wav(str(_resolve(t["wav_path"])))                # [samples]

            # Trim/pad audio so it's exactly the length implied by face frames
            expected_samples = int(face.shape[0] / FACE_FPS * AUDIO_SR)
            if wav.shape[0] < expected_samples:
                wav = np.pad(wav, (0, expected_samples - wav.shape[0]))
            else:
                wav = wav[:expected_samples]

            # Per-take train/val split: last `val_ratio` of each take is val
            split_frame = int(face.shape[0] * (1.0 - val_ratio))
            split_sample = int(split_frame / FACE_FPS * AUDIO_SR)
            if split == "train":
                face_slice = face[:split_frame]
                wav_slice = wav[:split_sample]
            else:
                face_slice = face[split_frame:]
                wav_slice = wav[split_sample:]

            if face_slice.shape[0] >= window_frames:
                self.takes.append({
                    "name": t["name"],
                    "face": face_slice,
                    "wav": wav_slice,
                    "max_start": face_slice.shape[0] - window_frames,
                })

        # ---- Build window index ----
        if split == "train":
            # Flat global index: each take contributes (max_start + 1) start
            # positions. Uniform random sampling of this flat index is
            # equivalent to proportional-to-length sampling over takes.
            self.take_lengths = np.array(
                [t["max_start"] + 1 for t in self.takes], dtype=np.int64)
            self.cumulative = np.cumsum(self.take_lengths)
            self.total_windows = int(self.cumulative[-1]) if self.takes else 0
            self.val_windows = None
        else:
            # Val: deterministic stride'd windows for cheap, reproducible eval
            self.val_windows = []
            for ti, take in enumerate(self.takes):
                starts = range(0, take["max_start"] + 1, val_stride)
                for s in starts:
                    self.val_windows.append((ti, s))
            self.total_windows = len(self.val_windows)
            self.cumulative = None

        total_frames = sum(t["face"].shape[0] for t in self.takes)
        print(f"[{split}] {len(self.takes)} takes, {total_frames} frames, "
              f"{self.total_windows} windows")

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------
    def __len__(self) -> int:
        return self.total_windows

    def _locate(self, idx: int) -> tuple[dict, int]:
        """Return (take, start_frame) for a global window idx."""
        if self.split == "train":
            take_idx = int(np.searchsorted(self.cumulative, idx, side="right"))
            if take_idx >= len(self.takes):
                take_idx = len(self.takes) - 1
            prev = int(self.cumulative[take_idx - 1]) if take_idx > 0 else 0
            start = idx - prev
            return self.takes[take_idx], int(start)
        else:
            ti, start = self.val_windows[idx]
            return self.takes[ti], start

    def __getitem__(self, idx: int):
        # --- Silence augmentation: with probability silence_prob, replace
        # this window entirely with zero audio + closed-mouth target. Teaches
        # the model an explicit "silence -> neutral" mapping that the natural
        # silences in the training data don't anchor strongly enough. ---
        if self.silence_prob > 0 and random.random() < self.silence_prob:
            return self.silence_audio.clone(), self.silence_face.clone()

        take, start = self._locate(idx)
        face = take["face"][start : start + self.window_frames]  # [W, 52]
        a0 = int(start / FACE_FPS * AUDIO_SR)
        audio = take["wav"][a0 : a0 + self.window_samples]

        if audio.shape[0] < self.window_samples:
            audio = np.pad(audio, (0, self.window_samples - audio.shape[0]))

        face_norm = (face - self.mean) / self.std

        audio_t = torch.from_numpy(audio.astype(np.float32))
        face_t = torch.from_numpy(face_norm.astype(np.float32))

        # --- Train-time audio augmentations ---
        if self.split == "train":
            # Random gain perturbation ±gain_db_range dB
            if self.gain_db_range > 0:
                gain_db = random.uniform(-self.gain_db_range, self.gain_db_range)
                audio_t = audio_t * (10 ** (gain_db / 20.0))

            # Time masking — zero out a short random segment (SpecAugment-style)
            if self.time_mask_prob > 0 and random.random() < self.time_mask_prob:
                mask_max = int(self.window_samples * self.time_mask_max_frac)
                if mask_max > 0:
                    mlen = random.randint(1, mask_max)
                    mstart = random.randint(0, self.window_samples - mlen)
                    audio_t = audio_t.clone()
                    audio_t[mstart : mstart + mlen] = 0.0

            # Additive Gaussian noise at a target SNR
            if self.audio_noise_snr_db is not None:
                signal_power = (audio_t ** 2).mean().clamp_min(1e-10)
                snr = 10 ** (self.audio_noise_snr_db / 10.0)
                noise_power = signal_power / snr
                audio_t = audio_t + torch.randn_like(audio_t) * noise_power.sqrt()

        return audio_t, face_t
