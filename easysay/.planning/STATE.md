# Project State

## Project Reference

See: `.planning/PROJECT.md`

**Core value:** 用户每天能立即完成真正需要开口、获得反馈并重说的个性化任务。
**Current focus:** Phase 4 local ASR/TTS verification complete

## Status

- Project initialized: 2026-08-13
- Current phase: 4 of 4
- Current status: Local speech implemented and verified

## Decisions

- Deliver as an installable mobile-first PWA.
- Use local-first persistence for the single-user v1.
- Route Ark calls through the Node API.
- Run Qwen3 ASR/TTS locally through Apple Silicon MLX adapters.
- Keep model weights and machine-local overrides outside Git.

## Verification

- TypeScript typecheck passed.
- Four curriculum tests passed.
- Production PWA build passed with manifest and service worker output.
- Browser walkthrough passed for onboarding, baseline fallback, daily task completion,
  24-week plan, role-play fallback, progress view, and local persistence.
- Ark live generation remains unverified until `ARK_API_KEY` is configured.
- ModelScope MLX weights downloaded locally and excluded from Git.
- ASR/TTS models loaded together on Apple M5 Pro unified memory.
- Real TTS generated 24 kHz PCM WAV; warm TTS latency measured at 2.7 seconds.
- TTS-to-ASR round trip returned the expected English sentence in 2.3 seconds.
- Local speech unit tests, TypeScript, Vitest, PWA build, API/config validation,
  and browser model-settings verification passed.
