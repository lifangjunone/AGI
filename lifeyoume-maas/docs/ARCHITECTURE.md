# LifeYouMe MaaS Architecture

## Product boundary

LifeYouMe MaaS owns provider credentials, logical models, deployments, routing,
application identities, usage metering and model-runtime health. Product
services retain their own users, agents, memories, tasks, subscriptions and
business audit trails.

```text
MeYou / Second Me / StaffDeck / C-end developer
                         |
                  MaaS application key
                         |
                         v
OpenAI-compatible gateway + authorization + metering
                         |
                  logical model route
                         |
             +-----------+-----------+
             |                       |
       cloud provider          self-hosted runtime
```

The gateway never returns an upstream provider credential to a caller.

## Current vertical slice

- Local image generation gateway `POST /v1/images/generations`, requiring an
  OpenAI-compatible image supplier and application authorization. Supports
  prompt up to 4000 characters, 1–4 outputs, URL/base64 raster responses and
  common size/quality/style parameters (supplier support varies). Caps response
  at 16 MiB; validates HTTPS links without fetching them, and checks raster
  signatures for base64. This is not full image decoding or a content safety
  scan. Only successful returned image count is metered; prompt/images/links
  are not persisted. Local workbench supports count/size/format, base64 preview
  and download, explicit-consent remote URL loading and cleanup on reset/model
  switch. Gateway/workbench/guide deployed together in release 20261030090000;
  no production image model configured, real supplier verification outstanding.

- OpenAI-compatible `POST /v1/chat/completions`. Local extension routes
  `multimodal` models for image understanding: 1–4 user images, HTTPS links or
  MIME/signature-checked inline PNG/JPEG/WebP, total inline base64 <=700000
  characters, <=64 messages and <=100000 text characters. Gateway does not
  fetch image URLs or persist image/text content; the supplier receives the
  images. No audio/video support. Chat responses capped at 8 MiB, redirects
  rejected, malformed JSON/choices and transport errors fail safely.
  Local unit and HTTP grant/revoke tests pass. Local workbench accepts 1–4
  HTTPS image links, detail level and a text question, validates links before
  sending and clears image links/Key on model change. Browser mock VLM flow
  verified; gateway/workbench/guide deployed in release 20261030100000.
  Real VLM verification remains outstanding; no production VLM is configured.
- Deployed `POST /v1/embeddings`: text/1–128 text batches, float
  vectors, optional dimensions, application authorization and token metering.
  Input text and vectors are not persisted. Response capped at 8 MiB; redirects
  rejected, output validated and whitelisted. Gateway, console workbench and
  guide deployed together in release 20261030072000. No production embedding
  model/provider is configured yet; real-provider inference remains unverified.
- OpenAI-compatible `POST /v1/audio/speech` backed by an isolated,
  CPU-limited sherpa-onnx VITS runtime on Tencent.
  Local extension also routes external OpenAI-compatible speech suppliers using
  their encrypted provider credential (never the internal runtime token),
  explicit supplier voice IDs and deployment timeouts. WAV only, 500 input
  characters, speed 0.5–2, 16 MiB response cap; redirects rejected and errors
  sanitized. Deployed in release 20261030080000; real-supplier inference unverified.
  Local speech workbench and guide now support supplier voice IDs, all enabled
  speech models and managed voice selection. Model changes cancel old requests
  and clear Key/audio. Gateway, guide and workbench are deployed together.
- `GET /v1/models`, scoped by application permissions.
- Provider credentials encrypted with AES-256-GCM.
- Application keys stored only as SHA-256 hashes.
- Logical model to deployment routing.
- Per-request application/deployment metering.
- Control-tower console and Playground.
- Routed `lym-tts-realtime` model with five configurable voices and bounded
  single-concurrency execution.

The JSON repository is intentional for the first single-node Tencent
deployment. `StateStore` is the persistence boundary; a PostgreSQL repository
can replace it without changing gateway contracts.

## Non-goals for v0.1

- Kubernetes or multi-node scheduling.
- Token streaming.
- Automatic provider failover.
- End-user billing or payment.
- Running large LLM/VLM workloads on the 3.6 GiB Tencent host.
- Treating a heavier GPU-oriented TTS model as suitable for the Tencent CPU
  host without a separate benchmark.
