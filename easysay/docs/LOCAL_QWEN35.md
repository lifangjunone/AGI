# EasySay Local Qwen3.5

EasySay can use `mlx-community/Qwen3.5-9B-MLX-8bit` as the inference
backend for the Hermes Cognitive Evolution Engine.

## Hardware profile

The default deployment targets Apple Silicon with unified memory. The model
weights use about 10.4 GB on disk. EasySay limits the runtime to one concurrent
request and a 96K 8-bit KV cache so it can run Hermes Agent's tool protocol
while coexisting with local ASR and TTS.

## Install

```bash
npm run llm:setup
npm run llm:download
```

The model is stored under:

```text
.models/Qwen3.5-9B-MLX-8bit
```

Model weights and the `.venv-llm` environment are ignored by Git.

## Run

The native EasySay service starts Qwen3.5 automatically:

```bash
npm run native:start
```

The model API is bound to the Mac loopback interface:

```text
http://127.0.0.1:8800/v1
```

It is not exposed directly to the LAN. The iPhone changes the inference mode
through EasySay's authenticated `8785` gateway, while Hermes calls Qwen3.5
inside the Mac.

## Verify

```bash
npm run llm:doctor
```

In the app, open:

```text
Settings > Hermes Cognitive Evolution Engine > Inference Model > Local MLX
```

Select `Local MLX`, then tap `Save and verify model`.

## Runtime defaults

- Model: `mlx-community/Qwen3.5-9B-MLX-8bit`
- Context cap: 96K tokens
- KV cache: 8-bit
- Concurrent requests: 1
- Maximum output: 2048 tokens
- Thinking mode: disabled by default
