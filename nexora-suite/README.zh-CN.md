# Nexora 星原 · 企业级智能体平台

[English](README.md) | [简体中文](README.zh-CN.md)

**开发智能体，统一纳管每一个智能体，并让它们运行在同一个可信底座之上。**

Nexora 星原是一套企业级 AI 产品体系，由五个定位清晰、可独立构建和部署的产品组成：统一企业底座、MaaS 模型服务平台、智能体开发平台、Agent Runtime 执行平台和智能体统一纳管平台。

## 产品愿景

AI Agent 正在成为企业的新型数字劳动力。企业需要的不只是一个 Agent 搭建工具，还需要可信的身份与权限底座、高效的 Agent 开发环境，以及能够持续治理所有 Agent 的统一控制平面。

Nexora 的愿景是让企业中的每一个 Agent 都能：

- **高效开发**：同时支持可视化编排和代码开发。
- **安全接入**：统一身份、租户、权限和凭据体系。
- **全程可见、可治理**：覆盖注册、发布、调用、观测和退役全生命周期。
- **开放兼容**：自研 Agent 与第三方平台 Agent 可以统一共存，避免平台锁定。

## Nexora 五大产品

| 产品 | 产品定位 | 主要用户 | 核心职责 |
| --- | --- | --- | --- |
| **Nexora Core · 星核** | 统一企业底座 | 平台管理员、安全团队、IT 团队 | 为上层产品提供统一身份、租户组织、权限、凭据、审计和国际化等公共能力。 |
| **Nexora MaaS · 星模** | 统一模型服务平台 | AI 平台团队、模型运营团队、开发者 | 统一接入模型供应商，管理模型目录、凭据、稳定路由、用量成本和 OpenAI-compatible 调用。 |
| **Nexora Studio · 星铸** | Agent 智能体开发平台 | Agent 开发者、AI 工程师、产品团队 | 提供可视化和代码双模式的 Agent 设计、调试、评测、版本管理与发布能力。 |
| **Nexora Runtime · 星驰** | Agent Runtime 与执行平台 | 平台工程师、Runtime 运维团队、AI 基础设施团队 | 统一接入 Native、第三方、自定义及设备 Runtime，调度 Agent Loop 任务并记录动态执行轨迹。 |
| **Nexora Control · 星域** | Agent 统一纳管平台 | Agent 管理员、安全团队、运维团队 | 在统一控制平面中注册、识别、治理、路由、观测和审计自研及外部 Agent。 |

### Nexora Core · 统一企业底座

Core 是整个 Nexora 产品体系的可信底座。它不是 Agent 开发工具，也不是 Agent Registry，而是为所有上层产品提供一致的企业公共能力：

- 统一登录、OIDC/OAuth、会话、服务账号和单点登录。
- 多租户、组织、工作空间、用户、用户组、RBAC 和资源级授权。
- API Key、密钥引用、通知中心、审计记录和语言偏好。
- 统一产品门户，让用户使用同一身份无感进入 MaaS、Studio 和 Control。

Core 可以独立部署，通过版本化 API 和 SDK 提供能力。MaaS、Studio 和 Control 只依赖 Core 的公开契约，不依赖 Core 源码，也不共享业务数据库。

### Nexora MaaS · 统一模型服务平台

MaaS 统一企业模型供给，但不是 Studio 内部模块：

- 接入 OpenAI、Claude、Gemini、DeepSeek 及自定义 OpenAI-compatible 服务。
- 加密保存供应商凭据，管理接口仅返回掩码。
- 维护租户隔离的模型目录、上下文窗口和 Token 计价。
- 发布稳定模型别名，上游供应商切换时业务应用无需改代码。
- 提供 OpenAI-compatible `/v1/chat/completions` 接口。
- 记录请求 ID、延迟、Token、估算成本和供应商错误。

MaaS 拥有独立 API、前端、数据库、迁移、镜像和 Helm Chart。即使不购买 Studio 与 Control，也可以仅与 Core 组合部署。

### Nexora Studio · Agent 智能体开发平台

Studio 帮助团队将 Agent 创意变成可测试、可评测、可发布的软件产品：

- 可视化工作流编排，以及 Go、Python、TypeScript 代码接入模式。
- Prompt、模型、工具、MCP、知识库、条件、循环、子 Agent 和人工节点。
- 面向 OpenAI、Claude、Gemini、DeepSeek 和自定义端点的 OpenAI-compatible 模型网关。
- 知识库与 RAG、交互式调试、Trace、数据集评测和评分。
- 不可变版本、环境配置、发布和回滚。

Agent 发布后，Studio 会生成标准 Agent Manifest，并将发布版本自动注册到 Control。Studio 负责开发生命周期，不承担企业全局运行治理。

### Nexora Control · Agent 统一纳管平台

Control 是企业所有 Agent 的统一控制平面。它既纳管 Studio 发布的 Agent，也纳管其他平台或团队开发的外部 Agent：

- 统一 Agent Registry，管理稳定身份、负责人、版本、能力、端点和健康状态。
- 为外部 Agent 提供注册 API 和 SDK，并自动同步 Studio 发布物。
- 覆盖审核、批准、发布、隔离、停用和退役的生命周期治理。
- Agent 凭据、访问策略、调用方控制、限流和统一调用网关。
- 运行 Trace、延迟、Token、成本、健康状态、风险、告警和审计证据。

外部 Agent 无需迁移到 Studio 开发，也可以接入 Control 进行统一治理和观测。

### Nexora Runtime · Agent 执行平台

Runtime 独立负责敏态 Agent 如何执行，不属于 Studio 或 Control 的内部模块：

- 管理租户隔离的 Runtime Profile、端点、凭据、健康、容量与部署位置。
- 适配 Nexora Native Runtime、Hermes Agent、OpenClaw、QwenPaw、WorkBuddy、TRAE、DeepSeek Agent、Codex、Claude Agent SDK 和客户自研 Runtime。
- 提供任务调度、超时、循环预算、权限档位、人工审批和任务历史。
- 流式返回动态计划、推理、行动、观察、审批、回答与完成事件。
- Native Runtime 作为可独立扩缩容的 Worker，使用与第三方 Runtime 相同的公开协议。

Studio 只引用 Runtime Profile 并通过版本化接口提交任务；Control 负责 Agent 身份与治理策略，不负责调度或执行 Agent Loop。

## 购买与部署版本

Core 是所有方案必选的公共底座，MaaS、Studio、Runtime 与 Control 是互相独立的可选产品。客户可以只购买和部署自己需要的能力：

| 商业版本 | 包含产品 | 适用客户 | 产品行为 |
| --- | --- | --- | --- |
| **Agent 开发版** | Core + Studio | 只需要开发和发布 Agent，不需要统一纳管的客户 | Studio 可完全独立运行；发布时生成不可变版本和 Manifest，不会尝试注册到 Control。 |
| **Agent 治理版** | Core + Control | 已经拥有自研或第三方 Agent，只需要统一纳管的客户 | Control 通过 API 和 SDK 纳管外部 Agent；Studio 不会部署，也不会显示在 Core 门户中。 |
| **模型服务版** | Core + MaaS | 只需要统一模型接入、路由、凭据、用量和成本，不需要 Agent 开发或纳管的客户 | MaaS 独立提供模型目录和 OpenAI-compatible 网关。 |
| **Runtime 执行版** | Core + Runtime | 只需要接入和运行客户已有 Runtime、不需要 Studio 的客户 | Runtime 独立管理 Profile、适配器、健康、任务调度和执行轨迹。 |
| **Agent 开发执行版** | Core + MaaS + Studio + Runtime | 需要开发 Workflow 与 Agent Loop，但不需要统一纳管的客户 | Studio 定义 Agent，Runtime 执行 Agent Loop，MaaS 提供模型。 |
| **完整 AI 平台版** | Core + MaaS + Studio + Runtime + Control | 同时需要模型供给、Agent 开发、执行和统一纳管的客户 | Studio 定义 Agent，Runtime 执行敏态任务，发布物进入 Control 治理。 |

产品权益由 Core 写入签名访问令牌，并由各产品 API 强制校验。Core 门户只展示客户已购买的产品；即使误部署了未授权产品，也无法获得其 API 使用权限。

## 四个产品如何协作

```text
                         Nexora Core · 统一企业底座
                     身份 · 租户 · 权限 · 密钥 · 审计
                                  │
                   ┌──────────────┴──────────────┐
                   │                             │
       Nexora Studio · Agent 开发       Nexora Control · Agent 纳管
       构建 · 调试 · 评测                注册 · 策略 · 网关
       版本 · 发布                       观测 · 审计 · 退役
                   │                             ▲
                   └──── Agent Manifest ─────────┘
                                                 ▲
                                                 │
                                          外部/第三方 Agent
```

五个产品均可独立构建、版本发布和部署，彼此不共享业务数据库，也不直接引用其他产品的源代码。跨产品协作只使用 [`contracts/`](contracts/) 下的版本化 OpenAPI、SDK 和事件协议。

## 多语言国际化

Nexora 默认按照国际化产品建设：

- 产品界面支持 `en-US` 和 `zh-CN`。
- 仓库文档和公共契约默认使用英语。
- README 提供 [英文默认版](README.md) 和[简体中文版](README.zh-CN.md)。
- 新增用户可见文案时，应同时更新两套语言资源，不应将文案直接写入业务逻辑。

## 技术架构概览

- **前端：** TypeScript、Next.js、React、Ant Design、React Flow。
- **后端：** Go，通过版本化 REST/OpenAPI 对外提供能力。
- **基础设施：** PostgreSQL/pgvector、Redis、NATS JetStream、MinIO、OpenTelemetry。
- **部署：** 本地使用 Docker Compose，生产环境使用四个独立 Helm Chart。
- **产品隔离：** 每个产品拥有独立 Go Module、前端依赖、迁移、镜像、Chart 和数据边界。

```text
nexora-suite/
├── nexora-core/       # 统一企业底座
├── nexora-maas/       # 统一模型服务平台
├── nexora-studio/     # Agent 智能体开发平台
├── nexora-runtime/    # Agent Runtime 与执行平台
├── nexora-control/    # Agent 统一纳管平台
├── contracts/         # 版本化 API、事件和 SDK
├── deployments/       # 套件级本地与 Kubernetes 部署资源
└── docs/              # 架构和运行文档
```

## 快速启动

环境要求：Docker 24+ 和 Docker Compose v2。

```bash
# Agent 开发版：Core + Studio
docker compose --env-file deployments/editions/studio.env \
  -f deployments/docker-compose.yml --profile studio up --build

# Agent 治理版：Core + Control
docker compose --env-file deployments/editions/control.env \
  -f deployments/docker-compose.yml --profile control up --build

# 模型服务版：Core + MaaS
docker compose --env-file deployments/editions/maas.env \
  -f deployments/docker-compose.yml --profile maas up --build

# Runtime 执行版：Core + Runtime
docker compose --env-file deployments/editions/runtime.env \
  -f deployments/docker-compose.yml --profile runtime up --build

# 完整 AI 平台版
docker compose --env-file deployments/editions/full.env \
  -f deployments/docker-compose.yml --profile maas --profile studio --profile runtime --profile control up --build
```

访问地址：

- Nexora Core：<http://localhost:3000>
- Nexora Studio：<http://localhost:3001>
- Nexora Control：<http://localhost:3002>
- Nexora MaaS：<http://localhost:3003>
- Nexora Runtime：<http://localhost:3004>

演示账号：

```text
邮箱：admin@nexora.local
密码：Nexora123!
```

服务就绪后运行对应版本的验收脚本：

```bash
./scripts/verify-edition.sh studio
./scripts/verify-edition.sh control
./scripts/verify-edition.sh maas
./scripts/verify-edition.sh full
```

Kubernetes 客户可以使用 [`deployments/helm/editions`](deployments/helm/editions) 下对应的组合 Chart。每个版本只安装客户购买的产品。

## 开发与验证

```bash
make test
make build
make compose-config
```

更多信息请参阅[架构说明](docs/architecture.md)、[API 契约](contracts/README.zh-CN.md)、[Kubernetes 部署](docs/kubernetes.zh-CN.md)，以及各产品 `deploy/helm` 目录下的独立 Helm Chart。

## 当前交付边界

当前仓库提供可运行的生产级工程骨架和已经验证的核心业务闭环。API 默认使用内存领域存储，便于本地直接运行；PostgreSQL Schema 和迁移已作为持久化契约提供。正式生产部署还应接入数据库 Repository、替换开发签名密钥、接入企业身份源或非对称 OIDC 签名、使用 KMS 托管密钥，并配置持久化事件消费者。

> 仓库内置账号、签名密钥和基础设施凭据仅供本地开发。部署到共享或生产环境之前，必须替换全部密钥。
