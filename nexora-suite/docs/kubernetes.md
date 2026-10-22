# Kubernetes deployment

[English](kubernetes.md) | [简体中文](kubernetes.zh-CN.md)

Nexora provides four Kubernetes editions. Every edition includes Core; MaaS, Studio, and Control are independently optional.

## Prerequisites

- Kubernetes 1.28+
- Helm 3.14+
- An Ingress controller such as ingress-nginx
- A default `StorageClass`, or an explicit `nexora-infrastructure.storageClass`
- Six product images in a registry accessible to the cluster:
  - `nexora/nexora-core`
  - `nexora/nexora-core-web`
  - `nexora/nexora-studio`
  - `nexora/nexora-studio-web`
  - `nexora/nexora-control`
  - `nexora/nexora-control-web`

Only images used by the selected edition are required.

## Choose an edition

```bash
# Core + Studio
EDITION=studio

# Core + Control
EDITION=control

# Core + Studio + Control
EDITION=full
```

Build local chart dependencies:

```bash
helm dependency update "deployments/helm/editions/$EDITION"
```

Create a production values file:

```yaml
# production-values.yaml
nexora-infrastructure:
  enabled: true
  storageClass: fast-ssd
  secrets:
    create: true
    jwtSecret: "replace-with-a-long-random-secret"
    postgresPassword: "replace-with-a-database-password"
  minio:
    accessKey: nexora-production
    secretKey: "replace-with-an-object-storage-password"

nexora-core:
  image:
    repository: registry.example.com/nexora/core-api
    tag: "1.0.0"
  webImage:
    repository: registry.example.com/nexora/core-web
    tag: "1.0.0"
  ingress:
    host: core.example.com
    tls:
      enabled: true
      secretName: core-example-tls
  config:
    studioPublicURL: https://studio.example.com
    controlPublicURL: https://control.example.com

nexora-studio:
  image:
    repository: registry.example.com/nexora/studio-api
    tag: "1.0.0"
  webImage:
    repository: registry.example.com/nexora/studio-web
    tag: "1.0.0"
  ingress:
    host: studio.example.com
    tls:
      enabled: true
      secretName: studio-example-tls

nexora-control:
  image:
    repository: registry.example.com/nexora/control-api
    tag: "1.0.0"
  webImage:
    repository: registry.example.com/nexora/control-web
    tag: "1.0.0"
  ingress:
    host: control.example.com
    tls:
      enabled: true
      secretName: control-example-tls
```

Remove values for products not included in the selected edition. Install into a dedicated namespace:

```bash
kubectl create namespace nexora

helm upgrade --install nexora \
  "deployments/helm/editions/$EDITION" \
  --namespace nexora \
  --values production-values.yaml \
  --wait \
  --timeout 10m
```

## What is installed

The built-in private-cloud profile installs:

- API and Web Deployments for each purchased product.
- ClusterIP Services and host-based Ingress rules.
- Readiness/liveness probes and API HorizontalPodAutoscalers.
- PostgreSQL/pgvector, Redis, NATS JetStream, and MinIO StatefulSets.
- PersistentVolumeClaims for all stateful services.
- A shared Kubernetes Secret and a Helm migration Job.

The built-in infrastructure is suitable for evaluation and single-cluster private-cloud installations. Production environments requiring database high availability should use managed infrastructure.

## Use managed infrastructure

Disable the bundled infrastructure and create the expected secret before installation:

```yaml
nexora-infrastructure:
  enabled: false
```

```bash
kubectl -n nexora create secret generic nexora-platform-secrets \
  --from-literal=jwt-secret='replace-with-a-long-random-secret' \
  --from-literal=core-database-url='postgres://...' \
  --from-literal=studio-database-url='postgres://...' \
  --from-literal=control-database-url='postgres://...'
```

Database migrations must then be run by the customer's delivery pipeline from the SQL files in each product's `migrations/` directory. Redis, NATS, MinIO/S3, and OpenTelemetry endpoints can be injected as additional environment settings when their runtime adapters are enabled.

## Verify the deployment

```bash
kubectl -n nexora get pods,svc,ingress,pvc
kubectl -n nexora rollout status deployment/nexora-core-api

# Depending on the edition:
kubectl -n nexora rollout status deployment/nexora-studio-api
kubectl -n nexora rollout status deployment/nexora-control-api
```

For local DNS testing, map the configured hosts to the Ingress controller address. Then run:

```bash
CORE_URL=https://core.example.com \
STUDIO_URL=https://studio.example.com \
CONTROL_URL=https://control.example.com \
./scripts/verify-edition.sh "$EDITION"
```

## Upgrade and rollback

```bash
helm upgrade nexora \
  "deployments/helm/editions/$EDITION" \
  -n nexora \
  -f production-values.yaml \
  --wait

helm history nexora -n nexora
helm rollback nexora <revision> -n nexora --wait
```

Migration hooks are additive and idempotent. Destructive schema changes must use an explicit expand/migrate/contract rollout and must not be placed in an automatic hook.

## Uninstall

```bash
helm uninstall nexora -n nexora
```

Helm intentionally leaves StatefulSet PVCs available for recovery. Review them before deletion:

```bash
kubectl -n nexora get pvc
```

Deleting PVCs permanently removes bundled database, event, cache, and object data.
