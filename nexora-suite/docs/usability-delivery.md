# Usability reconstruction — delivery status

[English](usability-delivery.md) | [简体中文](usability-delivery.zh-CN.md)

This is a source-code delivery record, not a production certification.

## Implemented in this increment

- Core bootstrap passwords are salted bcrypt hashes. Existing hashes survive
  restart and cannot be overwritten by changing the bootstrap environment.
  Passwords and hashes are excluded from user API responses.
- Suspended/invited users and empty-password accounts cannot log in.
- Runtime console uses readable typography, Ant Design forms/dialogs,
  responsive navigation, English/Chinese text, URL-backed details and back navigation.
- Runtime task details retain bounded real events; cancellation is tenant-scoped
  and terminal. Interrupted tasks/deployments are labeled after restart.
- Declarative `nexora-runtime-v1` protocol-bridge packages register a generic
  transport at startup; no new vendor Go package is required.
- Connection tests validate the health response body and protocol, not HTTP 200 alone.
- Unsafe shared-host deployment/rollback is disabled. Versions distinguish
  catalog presence, artifact presence and verification.
- Write, shell and device-control requests fail closed at both control plane
  and worker until isolation and approvals are implemented.
- External execution is disabled until scoped service credentials are available;
  the platform never forwards a Core user bearer token to a configured external endpoint.
- Studio no longer fabricates evaluation scores. Control no longer fabricates
  Agent output, latency, token counts or cost for a nonexistent invocation.

## Not delivered

| Area | Status / required next implementation |
| --- | --- |
| Runtime persistence | Development JSON backend; PostgreSQL migration still required |
| Container/Kubernetes deployments | Not implemented; legacy deploy API returns 503 |
| Version supply | Discovery/bundled fallback only; signed-image build and compatibility pipeline pending |
| Approvals | No approval queue or decision protocol; high-risk execution is rejected |
| Runtime security | Read-only subprocess is not an enterprise sandbox; service identity and endpoint allowlists pending |
| Resource execution | MCP/Skill/plugin/RAG integration still incomplete |
| Task retention | Up to 1,000 events of at most 64 KiB per event; not a complete trace archive |
| Scale | Backend still uses in-memory indexes; million-object cursor/virtualization acceptance pending |
| Studio evaluation | Explicit 501 until an actual dataset runner is implemented |
| Control gateway | Source returns 501; CPU Control intentionally not restarted because registry state is in-memory |
| Core identity | Custom JWT login remains; not standards-complete OIDC/OAuth |
| Runtime RBAC | Fine-grained Core permission checks still required |
| Browser/remote acceptance | CPU deployed: 1366/1600/2048/375px, detail reload/back/Escape passed; one real AgentLoop stream completed with 213 recorded events |

## Deployment safety

No local product server was started. Core/Studio/Runtime API, Native Worker and
Runtime Web were deployed to CPU; MaaS and Control were left running.
All five web entrypoints returned 200 and all 12 Studio agents were preserved.
Backup: `/data00/home/lifangjun/nexora-suite/runtime/releases/usability-20261024-1005/backup`.
Shared Nginx was not modified.

Before deploying Core, back up its existing state. The bootstrap environment
password becomes a one-time initialization value; changing it no longer resets
an existing account. A password recovery/reset flow is still required.
