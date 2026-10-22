# Nexora · Enterprise Agent Platform

[English](README.md) | [简体中文](README.zh-CN.md)

**Build agents. Govern every agent. Operate them on one trusted foundation.**

Nexora is an enterprise AI platform composed of four independently built and deployed products: a unified enterprise foundation, a model-as-a-service platform, an agent development platform, and a unified agent management and governance platform.

## Vision

AI agents are becoming a new class of enterprise digital workforce. Organizations need more than a builder: they need a trusted foundation for identity and access, an efficient environment for creating agents, and a control plane that continuously governs every agent regardless of where it was built.

Nexora's vision is to make every enterprise agent:

- **Easy to build** through visual orchestration and code-first development.
- **Safe to connect** through unified identity, tenancy, permissions, and credentials.
- **Visible and governable** throughout registration, release, invocation, and retirement.
- **Open by design** so internally built and third-party agents can coexist without platform lock-in.

## The four Nexora products

| Product | Positioning | Primary users | Core responsibility |
| --- | --- | --- | --- |
| **Nexora Core · 星核** | Unified enterprise foundation | Platform administrators, security teams, IT teams | Provides identity, tenant, organization, access-control, credential, audit, and localization capabilities to upper-layer products. |
| **Nexora MaaS · 星模** | Unified model service platform | AI platform teams, model operations teams, developers | Connects model providers and manages the catalog, credentials, stable routes, usage, cost, and OpenAI-compatible invocation. |
| **Nexora Studio · 星铸** | Agent development platform | Agent developers, AI engineers, product teams | Provides visual and code-first tools to design, debug, evaluate, version, and publish production agents. |
| **Nexora Control · 星域** | Unified agent management and governance platform | Agent administrators, security teams, operations teams | Registers, identifies, governs, routes, observes, and audits both Nexora-built and external agents from one control plane. |

### Nexora Core · Unified foundation

Core is the trusted foundation beneath the Nexora product family. It is not an agent builder or an agent registry. Its role is to provide consistent enterprise capabilities to all upper-layer products:

- Unified sign-in, OIDC/OAuth, sessions, service accounts, and single sign-on.
- Multi-tenancy, organizations, workspaces, users, groups, RBAC, and resource authorization.
- API keys, secret references, notification services, audit records, and locale preferences.
- A unified portal that lets users move between MaaS, Studio, and Control with the same identity.

Core is independently deployable and exposes versioned APIs and SDKs. MaaS, Studio, and Control depend on its public contracts, not its source code or business database.

### Nexora MaaS · Unified model service platform

MaaS centralizes enterprise model supply without becoming part of Studio:

- Connect OpenAI, Claude, Gemini, DeepSeek, and custom OpenAI-compatible providers.
- Encrypt provider credentials and return only masked hints to management clients.
- Maintain a tenant-isolated model catalog with context windows and token pricing.
- Publish stable model aliases so applications can change providers without code changes.
- Expose an OpenAI-compatible `/v1/chat/completions` interface.
- Record request IDs, latency, token usage, estimated cost, and provider failures.

MaaS is an independent product with its own API, web application, database, migration, images, and Helm chart. It can be purchased and deployed with Core even when Studio and Control are absent.

### Nexora Studio · Agent development platform

Studio is where teams turn agent ideas into testable and releasable software:

- Visual workflow orchestration plus Go, Python, and TypeScript integration patterns.
- Prompt, model, tool, MCP, knowledge, condition, loop, sub-agent, and human-in-the-loop nodes.
- An OpenAI-compatible model gateway designed for OpenAI, Claude, Gemini, DeepSeek, and custom endpoints.
- Knowledge and RAG workflows, interactive debugging, traces, dataset evaluation, and scoring.
- Immutable versions, environment configuration, release, and rollback.

Publishing an agent creates a standard Agent Manifest and registers the released version with Control. Studio owns the development lifecycle; it does not own enterprise-wide runtime governance.

### Nexora Control · Unified agent management platform

Control is the enterprise control plane for all agents, including agents published by Studio and agents built on third-party platforms:

- A unified Agent Registry with stable identities, ownership, versions, capabilities, endpoints, and health.
- Registration APIs and SDKs for external agents, plus automatic synchronization from Studio.
- Lifecycle governance from review and approval through quarantine, disabling, and retirement.
- Agent credentials, policy enforcement, caller controls, rate limits, and a governed invocation gateway.
- Runtime traces, latency, token usage, cost, health, risks, alerts, and audit evidence.

Control governs and observes agents without requiring them to be developed in Studio.

## Purchase and deployment editions

Core is the required common foundation. MaaS, Studio, and Control are independently optional products, so customers purchase and deploy only the capabilities they need:

| Edition | Included products | Intended customer | Product behavior |
| --- | --- | --- | --- |
| **Agent Development Edition** | Core + Studio | Customers that build and publish agents but do not need centralized agent governance | Studio works independently. Publishing produces immutable versions and manifests without attempting Control registration. |
| **Agent Governance Edition** | Core + Control | Customers that already have their own or third-party agents and only need unified registration, policy, gateway, observability, and audit | Control accepts external agents through its APIs and SDKs. Studio is not installed or shown in the Core portal. |
| **Model Service Edition** | Core + MaaS | Customers that need centralized model access, routing, credentials, usage, and cost without an agent builder or control plane | MaaS provides its model catalog and OpenAI-compatible gateway independently. |
| **Full AI Platform Edition** | Core + MaaS + Studio + Control | Customers that need model supply, agent development, and unified governance | Studio and enterprise applications consume MaaS routes while released agents enter Control governance. |

Product entitlements are issued by Core in the signed access token and enforced by product APIs. The Core portal only displays products enabled for that customer. Deploying an unlicensed product does not grant access to it.

## How the products work together

```text
                         Nexora Core · Unified foundation
                    Identity · Tenant · RBAC · Secrets · Audit
                                  │
                   ┌──────────────┴──────────────┐
                   │                             │
       Nexora Studio · Development      Nexora Control · Governance
       Build · Debug · Evaluate         Register · Policy · Gateway
       Version · Publish                Observe · Audit · Retire
                   │                             ▲
                   └──── Agent Manifest ─────────┘
                                                 ▲
                                                 │
                                      External / third-party agents
```

The four products are independently buildable, versioned, and deployable. They do not share business databases or import one another's source code. Cross-product communication uses versioned OpenAPI contracts, SDKs, and events under [`contracts/`](contracts/).

## Internationalization

Nexora is internationalization-ready by default:

- Product interfaces support `en-US` and `zh-CN`.
- English is the default language for repository documentation and public contracts.
- This README is available in [English](README.md) and [Simplified Chinese](README.zh-CN.md).
- New user-facing strings should be added to both locale catalogs instead of being embedded directly in product logic.

## Architecture at a glance

- **Frontend:** TypeScript, Next.js, React, Ant Design, React Flow.
- **Backend:** Go with versioned REST/OpenAPI interfaces.
- **Infrastructure:** PostgreSQL/pgvector, Redis, NATS JetStream, MinIO, OpenTelemetry.
- **Deployment:** Docker Compose for local operation and independent Helm charts for Kubernetes.
- **Isolation:** Separate Go modules, frontend dependencies, migrations, images, charts, and data boundaries for every product.

```text
nexora-suite/
├── nexora-core/       # Unified enterprise foundation
├── nexora-maas/       # Unified model service platform
├── nexora-studio/     # Agent development platform
├── nexora-control/    # Unified agent management platform
├── contracts/         # Versioned APIs, events, and SDKs
├── deployments/       # Suite-level local and Kubernetes resources
└── docs/              # Architecture and operating documentation
```

## Quick start

Requirements: Docker 24+ with Docker Compose v2.

```bash
# Agent Development Edition: Core + Studio
docker compose --env-file deployments/editions/studio.env \
  -f deployments/docker-compose.yml --profile studio up --build

# Agent Governance Edition: Core + Control
docker compose --env-file deployments/editions/control.env \
  -f deployments/docker-compose.yml --profile control up --build

# Model Service Edition: Core + MaaS
docker compose --env-file deployments/editions/maas.env \
  -f deployments/docker-compose.yml --profile maas up --build

# Full AI Platform Edition: Core + MaaS + Studio + Control
docker compose --env-file deployments/editions/full.env \
  -f deployments/docker-compose.yml --profile maas --profile studio --profile control up --build
```

Open:

- Nexora Core: <http://localhost:3000>
- Nexora Studio: <http://localhost:3001>
- Nexora Control: <http://localhost:3002>
- Nexora MaaS: <http://localhost:3003>

Demo account:

```text
Email:    admin@nexora.local
Password: Nexora123!
```

Run the matching acceptance flow after the services are ready:

```bash
./scripts/verify-edition.sh studio
./scripts/verify-edition.sh control
./scripts/verify-edition.sh maas
./scripts/verify-edition.sh full
```

Kubernetes customers can use the corresponding umbrella charts under [`deployments/helm/editions`](deployments/helm/editions). Each edition installs only its purchased products.

## Development and verification

```bash
make test
make build
make compose-config
```

See [Architecture](docs/architecture.md), [API contracts](contracts/README.md), [Kubernetes deployment](docs/kubernetes.md), and the independent Helm charts under each product's `deploy/helm` directory.

## Current delivery boundary

This repository provides a runnable production-oriented foundation and a verified core workflow. The APIs currently use in-memory domain repositories for immediate local operation; PostgreSQL schemas and migrations are included as the persistence contract. Production hardening should connect those repositories, replace development signing keys, enable an enterprise identity provider or asymmetric OIDC signing, and configure KMS-backed secrets and durable event consumers.

> The bundled account, signing secret, and infrastructure credentials are for local development only. Replace every secret before deploying to a shared or production environment.
