# Nexora contracts

The `contracts` directory is the public protocol layer shared by otherwise independent Nexora products. It is not a deployable product or a runtime service.

It exists so Core, Studio, Control, customer applications, and third-party agents agree on stable wire formats without importing one another's source code or reading one another's databases.

| Artifact | Purpose |
| --- | --- |
| `openapi.yaml` | Versioned HTTP API definitions for authentication, agent registration, publishing, and governed invocation. |
| `events.schema.json` | Common event envelope and supported cross-product event names. Consumers use `event_id` for idempotency. |
| `sdk/go` | Go client types and helpers generated or maintained against the public contract. |
| `sdk/typescript` | TypeScript client types and helpers for web, Node.js, and integration clients. |

Typical contract flows:

1. Studio publishes an immutable Agent Manifest understood by Control.
2. A customer-owned agent registers itself with Control using the same public shape.
3. Core places tenant, role, and product-entitlement claims in signed tokens consumed by MaaS, Studio, Runtime, and Control.
4. Studio discovers Runtime Profiles and submits Agent Loop tasks through Runtime; it never imports Runtime source or directly connects to vendor workers.
4. Control exposes a stable governed invocation interface regardless of where an agent was developed.

## Compatibility policy

- Additive optional fields are backward-compatible.
- Breaking HTTP changes require a new `/api/vN` prefix.
- Breaking event changes require a new `schema_version`.
- Producers must not remove fields still used by a supported consumer version.
- Consumers must ignore unknown additive fields and deduplicate events by `event_id`.
- Contract changes must be validated before the related product images are released.

The English contract is canonical. Localized documentation may explain it, but field names and wire values remain language-neutral.
