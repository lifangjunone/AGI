# Kubernetes 部署

[English](kubernetes.md) | [简体中文](kubernetes.zh-CN.md)

Nexora 提供四种 Kubernetes 部署版本。所有版本都包含 Core，MaaS、Studio 和 Control 可以互相独立选购。

## 环境要求

- Kubernetes 1.28+
- Helm 3.14+
- ingress-nginx 等 Ingress Controller
- 默认 `StorageClass`，或显式配置 `nexora-infrastructure.storageClass`
- 集群可以拉取 Nexora 的 API 和 Web 镜像

## 选择版本

```bash
# Core + Studio
EDITION=studio

# Core + Control
EDITION=control

# Core + MaaS
EDITION=maas

# Core + MaaS + Studio + Control
EDITION=full

helm dependency update "deployments/helm/editions/$EDITION"
```

准备生产配置：

```yaml
# production-values.yaml
nexora-infrastructure:
  enabled: true
  storageClass: fast-ssd
  secrets:
    create: true
    jwtSecret: "替换为长随机密钥"
    postgresPassword: "替换为数据库密码"
  minio:
    accessKey: nexora-production
    secretKey: "替换为对象存储密码"

nexora-core:
  ingress:
    host: core.example.com
    tls: { enabled: true, secretName: core-example-tls }
  config:
    studioPublicURL: https://studio.example.com
    controlPublicURL: https://control.example.com

nexora-studio:
  ingress:
    host: studio.example.com
    tls: { enabled: true, secretName: studio-example-tls }

nexora-control:
  ingress:
    host: control.example.com
    tls: { enabled: true, secretName: control-example-tls }
```

未购买产品的配置可以删除。安装到独立 Namespace：

```bash
kubectl create namespace nexora

helm upgrade --install nexora \
  "deployments/helm/editions/$EDITION" \
  --namespace nexora \
  --values production-values.yaml \
  --wait \
  --timeout 10m
```

## 默认安装内容

私有化内置基础设施模式会安装：

- 已购买产品的 API 和 Web Deployment。
- ClusterIP Service 和基于域名的 Ingress。
- 健康探针和 API HPA。
- PostgreSQL/pgvector、Redis、NATS JetStream 和 MinIO StatefulSet。
- 所有有状态组件的 PVC。
- 共享 Kubernetes Secret 和数据库迁移 Job。

内置基础设施适用于验证和单集群私有化部署。需要数据库高可用的生产环境建议使用客户已有的托管基础设施。

## 使用客户现有基础设施

关闭内置基础设施：

```yaml
nexora-infrastructure:
  enabled: false
```

安装前创建共享 Secret：

```bash
kubectl -n nexora create secret generic nexora-platform-secrets \
  --from-literal=jwt-secret='替换为长随机密钥' \
  --from-literal=core-database-url='postgres://...' \
  --from-literal=studio-database-url='postgres://...' \
  --from-literal=control-database-url='postgres://...'
```

此模式下由客户发布流水线执行各产品 `migrations/` 目录中的 SQL。启用相应运行适配器后，也可以通过环境配置接入外部 Redis、NATS、S3/MinIO 和 OpenTelemetry。

## 验证部署

```bash
kubectl -n nexora get pods,svc,ingress,pvc
kubectl -n nexora rollout status deployment/nexora-core-api

# 按购买版本选择：
kubectl -n nexora rollout status deployment/nexora-studio-api
kubectl -n nexora rollout status deployment/nexora-control-api
```

配置域名解析后运行：

```bash
CORE_URL=https://core.example.com \
STUDIO_URL=https://studio.example.com \
CONTROL_URL=https://control.example.com \
./scripts/verify-edition.sh "$EDITION"
```

## 升级与回滚

```bash
helm upgrade nexora \
  "deployments/helm/editions/$EDITION" \
  -n nexora \
  -f production-values.yaml \
  --wait

helm history nexora -n nexora
helm rollback nexora <revision> -n nexora --wait
```

自动迁移必须保持增量且幂等。破坏性数据库变更应采用扩展、迁移、收缩流程，不得直接放入自动 Hook。

## 卸载

```bash
helm uninstall nexora -n nexora
```

Helm 会保留 StatefulSet PVC 供恢复使用。删除 PVC 会永久删除内置数据库、事件、缓存和对象数据，执行前必须确认。
