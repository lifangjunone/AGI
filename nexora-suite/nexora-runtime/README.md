# Nexora Runtime · 星驰

[English](README.md) | [简体中文](README.zh-CN.md)

Nexora Runtime is the independent enterprise agent execution platform. It owns Runtime adapters, Runtime Profiles, health, scheduling, task state, execution budgets, and dynamic traces. Studio references a Runtime Profile; it does not connect to workers or vendor runtimes directly.

> Development implementation, not production-ready. Legacy shared-host
> deployment is disabled. Isolated image deployment, approvals, PostgreSQL,
> and resource execution integration are still pending. See the current
> [delivery status](../docs/usability-delivery.md).

The product contains three independently scalable processes:

- `api`: Runtime Control Plane and the versioned `nexora-runtime-v1` task seam.
- `adapters`: an independent Go module containing the adapter interface, registry, validation, health request, and streaming task request implementations.
- `worker`: the official Nexora Native Runtime gateway, written in Go.
- `web`: operations console for profiles, adapters, and task runs.

Third-party runtimes implement `POST /v1/tasks/stream` and return Server-Sent Events. Native Runtime uses the same protocol and is not a special execution path inside Studio.

## Native Agent Loop

The Native Worker uses the real
[oh-my-pi](https://github.com/can1357/oh-my-pi) Agent Loop as a process-isolated
engine and its official Go RPC SDK as the integration boundary. We deliberately
do not present a partial line-by-line Go rewrite as an equivalent engine:
oh-my-pi includes a large TypeScript loop, a Rust native core, tools, MCP,
skills, sessions, compaction, permissions, sub-agents, and provider
compatibility behavior.

The Go gateway owns the enterprise boundary:

- one temporary workspace and OMP configuration directory per task;
- model access through the Nexora MaaS OpenAI-compatible route;
- permission-profile-to-tool mapping, timeout, and maximum tool-step limits;
- process-group cleanup and SSE conversion for reasoning, text, tool execution,
  retry, compaction, completion, and errors.

The customer-facing product is always **Native AgentLoop**. Its execution
engine is an internal, replaceable implementation. Runtime discovers upstream
releases and falls back to a bundled catalog. Discovery is not compatibility
verification. The old host-wide symlink upgrade path is disabled; a verified,
isolated container/Kubernetes deployment driver is required before enabling
upgrades. Helm templates alone do not constitute a deployed image supply chain.
Third-party attribution remains available in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and administrator audit data.

## Declarative Runtime Packages

Runtime integrations are declared in `packages/*.json`. A package describes
the stable product name, protocol, capabilities, configuration schema, release
source, and deployment drivers. Runtimes implementing `nexora-runtime-v1`
require no platform code change. Standard protocol mappings use a shared
bridge; only proprietary protocols require a thin bridge.

## Adapter implementations

```text
adapters/
├── native/
├── hermes/
├── openclaw/
├── qwenpaw/
├── workbuddy/
├── trae/
├── deepseek/
├── codex/
├── claude/
├── custom/
└── registry/
```

`native` is backed by the separately deployed Nexora Native Worker. The other adapters currently implement a real `nexora-runtime-v1` protocol bridge: endpoint validation, health requests, credential references, and SSE task request construction. They connect to a vendor-side or customer-side bridge that exposes the Nexora protocol. They do not claim to embed every vendor's private SDK. Vendor-native SDK transports can be added behind the same `Adapter` interface without changing Studio or the Runtime Control Plane.
