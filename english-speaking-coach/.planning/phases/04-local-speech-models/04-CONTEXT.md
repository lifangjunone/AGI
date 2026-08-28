# Phase 4 Context: Local Speech Models

## Goal

Use locally deployed ModelScope speech models for English ASR and TTS on this
Apple M5 Pro Mac while preserving browser fallbacks.

## Decisions

- Default ASR: `mlx-community/Qwen3-ASR-1.7B-8bit`.
- Default TTS: `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`.
- Runtime: Python 3.12, `mlx-audio`, and a loopback-only FastAPI service.
- American voice: `Aiden`; British voice: `Ryan`.
- Model weights live under `.models/` and never enter Git.
- Machine overrides live under `.local/`; committed defaults live under `config/`.
- Node/Express remains the only browser-facing API and proxies to the local
  speech service.

## User Experience

- Recording continues to work immediately through `MediaRecorder`.
- After recording stops, local ASR replaces or fills the browser transcript.
- Local TTS is used for lesson and coach playback, then falls back to
  `speechSynthesis` if unavailable.
- A dedicated model settings page shows health, loaded models, editable
  defaults, save/apply actions, and a TTS test.

## Constraints

- Local machine: Apple M5 Pro, 48 GB memory, macOS 26.5.2.
- No CUDA or vLLM assumptions.
- No model weights, caches, virtual environments, generated audio, or local
  overrides may be committed.
- Existing learning workflows must remain usable while the model service is
  stopped.

## ModelScope Evidence

- Qwen3-ASR-1.7B official card states open-source leading accuracy, support for
  English accents, 30 languages, 22 Chinese dialects, streaming/offline modes,
  and robust recognition in difficult acoustic conditions.
- The MLX 8-bit conversion is about 2.47 GB and documents `mlx-audio` usage.
- Qwen3-TTS CustomVoice supports English, natural-language style control, and
  preset English voices. The MLX 8-bit conversion is about 3.08 GB.
