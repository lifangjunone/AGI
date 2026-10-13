# Qwen3-TTS deployment

The production TTS service uses Qwen3-TTS 1.7B on the `gpu` development host.

- `CustomVoice`: built-in Chinese and multilingual character voices with natural-language emotion instructions.
- `Base`: three-second zero-shot voice cloning from an authorized reference recording.
- Runtime: V100-compatible FP16, eager attention, one inference worker.
- API port: `7861`.

Endpoints:

- `GET /health`
- `GET /v1/voices`
- `POST /v1/audio/speech`
- `POST /v1/audio/clone`
- `GET /v1/audio/{id}`

The service intentionally serializes GPU inference. Application-level batching should queue requests rather than start multiple model processes on the same V100.

## Process supervision

Install `qwen3-tts.service` as a user-level systemd unit:

```bash
mkdir -p ~/.config/systemd/user
cp qwen3-tts.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now qwen3-tts.service
```

The service restarts inside the user's login session. An administrator must enable
linger for this account if it needs to start after a reboot before the first login.
