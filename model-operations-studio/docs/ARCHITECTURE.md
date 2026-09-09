# Architecture

```text
React operations console
        |
        | localhost JSON API
        v
Node control plane
  |-- model registry and checksums
  |-- deployment/process supervisor
  |-- host telemetry and event log
  |-- workload admission and memory policy
  |
  +-- llama.cpp adapter -> OpenAI-compatible text endpoint
  |
  +-- ComfyUI adapter -> queued video workflow endpoint
```

## Design Choices

- **Local first:** all services bind to loopback by default; no account or cloud dependency is required.
- **Runtime adapters:** text and media runtimes keep their native APIs while the control plane normalizes lifecycle and health.
- **Pinned registry:** model URLs, byte sizes, hashes, licenses, hardware support and defaults are versioned together.
- **Resource admission:** only one accelerator-heavy model is active by default on unified-memory Macs.
- **Reproducible jobs:** generation parameters and benchmark evidence are structured JSON rather than terminal-only output.
- **Portable shell:** React, Node and Electron run on macOS, Windows and Linux; runtime-specific installers remain isolated.

## Industry References

The design takes the local development and packaging ergonomics of BentoML, the versioned registry concept of MLflow, and the declarative lifecycle/health model of KServe. Kubernetes, canary traffic splitting, RBAC and multi-node scheduling are intentionally deferred until there is more than one execution node.

Future adapters can implement the same contract for:

- Docker/Podman hosts
- remote SSH workers
- KServe `InferenceService`
- BentoML services
- NVIDIA vLLM or SGLang runtimes
- Apple MLX servers
