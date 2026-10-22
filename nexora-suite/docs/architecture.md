# Architecture

## Product boundaries

Core, MaaS, Studio, and Control are independent deployment and data boundaries. They communicate only through versioned HTTP APIs and NATS events. Each service applies `tenant_id` to every business record and never performs cross-database queries.

## Main flow

1. A user signs in through Core and receives a signed access token.
2. MaaS uses Core's tenant and product entitlement claims while keeping its own model data and credentials.
3. Platform teams connect model providers, register models, and publish stable OpenAI-compatible route aliases.
4. Studio or another authorized AI application invokes those aliases without learning provider credentials.
5. A Studio agent is drafted, tested, evaluated, and published as an immutable version.
6. Studio submits the versioned Agent Manifest to Control's registration API.
7. Control stores the agent identity, applies lifecycle policy, and exposes it through the gateway.
8. MaaS and Control independently produce model and agent traces associated with tenant and caller.

## Security defaults

- Short-lived HMAC access tokens are included for local operation; production deployments should configure asymmetric OIDC signing and external KMS-backed secrets.
- API credentials are shown once and stored as hashes.
- MaaS provider credentials are encrypted at rest and never returned by list APIs.
- Administrative mutations append an audit event.
- Product APIs reject missing tenants and cross-tenant resource access.
- Secrets are injected through environment variables or Kubernetes Secrets.

## Extension seams

- Model providers sit behind MaaS's OpenAI-compatible route seam. Changing an upstream provider does not change calling agents.
- Agent runtimes implement the Agent Manifest invoke endpoint.
- External identity providers connect through OIDC; SAML is intended through an OIDC broker.
- Object storage, event bus, cache, and telemetry use replaceable infrastructure adapters.
