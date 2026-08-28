# OneOPC 参考架构

## 1. 架构定位

OneOPC 应是“交付控制平面”，而不是新的 IDE、Git 平台、CI 引擎或 Kubernetes 控制器。

它负责：

- 接收需求并创建一次交付运行。
- 管理状态机、策略、预算和审批。
- 调用规格工具、编码代理、CI/CD 和观测系统。
- 校验每一阶段的输入输出契约。
- 汇总真实日志、证据、状态和可追踪关系。

它不负责：

- 用模型判断测试是否真的通过。
- 绕过 Git、CI 或部署系统的原生保护。
- 把生产凭证交给编码代理。
- 复制一套已有工具已经可靠提供的能力。

## 2. 逻辑组件

```text
                     +----------------------+
需求文件 / Issue --->| Intake & Normalizer  |
                     +----------+-----------+
                                |
                     +----------v-----------+
                     | Spec & Risk Engine   |
                     +----------+-----------+
                                |
                +---------------v----------------+
                | OneOPC Orchestrator/State      |
                | policy, budget, approval, DAG  |
                +---+-------------+-----------+--+
                    |             |           |
          +---------v--+   +------v------+  +-v----------------+
          | Agent      |   | Git/CI      |  | Release/GitOps   |
          | Sandbox    |   | Adapter     |  | Adapter          |
          +---------+--+   +------+------+\ +--------+----------+
                    |             |        \         |
                    +-------------+---------\--------+
                                           v
                                 Evidence & Event Store
                                           |
                                 UI / API / Audit / Metrics
```

### 2.1 Intake & Normalizer

- 支持文件、URL、Issue、Webhook 和 API。
- 原始输入只读保存，记录 SHA-256、来源和时间。
- 解析器输出统一 JSON Schema。
- 对不可信内容标记来源边界，防止文档中的指令变成系统指令。

### 2.2 Spec & Risk Engine

- 生成规格、验收条件、未决问题和规格差异。
- 对规格做 schema、完整性和一致性校验。
- 计算风险等级并选择流水线模板。
- 生成需求到测试、观测的追踪矩阵。

### 2.3 Orchestrator

建议使用显式持久化状态机。第一版可自行实现；出现长时间等待、补偿事务和大量并发运行后，再考虑 Temporal。

职责：

- 幂等状态转换。
- 任务 DAG 和依赖调度。
- 超时、重试、取消和补偿。
- 人工审批等待。
- Token、时间、并发和费用预算。
- Webhook 去重与断点恢复。

### 2.4 Agent Sandbox

- 每次任务使用一次性容器和 Git worktree。
- 根文件系统尽可能只读，只挂载工作区。
- 网络默认拒绝，域名白名单放行。
- 无生产 Secrets；Git 使用短期、仓库范围 Token。
- CPU、内存、磁盘、进程、时间和输出大小受限。
- 所有工具调用形成结构化事件。

### 2.5 Git/CI Adapter

提供统一接口：

- 创建分支、提交和 PR。
- 获取检查、审查和合并状态。
- 触发或重跑工作流。
- 下载测试和扫描制品。
- 验证分支保护与提交身份。

最终通过状态只信任 Git 平台和 CI 的签名事件。

### 2.6 Release/GitOps Adapter

- 将制品 digest 提交到环境配置仓库。
- 查询 Argo CD 同步与健康状态。
- 创建 Argo Rollouts 发布并读取分析结果。
- 执行暂停、继续、回滚和事故升级。

CI 不直接对生产集群执行 `kubectl apply`。

### 2.7 Evidence & Event Store

使用追加写事件，不覆盖历史：

```json
{
  "event_id": "evt_...",
  "run_id": "run_...",
  "stage": "CI",
  "type": "check.completed",
  "actor": "github-actions",
  "occurred_at": "2026-08-14T10:00:00Z",
  "payload": {
    "check": "integration-tests",
    "conclusion": "success",
    "artifact_uri": "..."
  },
  "previous_hash": "...",
  "event_hash": "..."
}
```

大日志和报告进入对象存储，数据库只保存摘要、校验和与 URI。

## 3. 核心数据对象

| 对象 | 关键字段 |
|---|---|
| Project | repo、owners、stack、commands、risk policy、deploy targets |
| Requirement | source、hash、normalized content、status、open questions |
| Spec | version、requirements、acceptance criteria、NFR、delta |
| DeliveryRun | state、risk、budget、current stage、timestamps |
| Task | dependencies、sandbox policy、attempts、result |
| Evidence | producer、type、digest、URI、verification status |
| Artifact | digest、SBOM、signature、provenance、source commit |
| Deployment | environment、artifact digest、config commit、health |
| Approval | gate、approver identity、decision、reason、expiry |
| Incident | deployment、signals、rollback、impact、follow-ups |

## 4. 目录建议

项目落地后建议采用：

```text
delivery-control-center/
├── docs/                         # 调研和架构文档
├── inputs/                       # 原始输入，只读逻辑边界
│   └── requirements/
├── control-plane/                # API、状态机、策略、适配器
├── workers/                      # 规格、代理、验证执行器
├── contracts/                    # JSON Schema / OpenAPI / event schema
├── policies/                     # OPA/Conftest 规则
├── templates/                    # 项目和流水线黄金路径
├── deploy/                       # 本地 compose、kind、Helm
├── observability/                # OTel、Prometheus、Grafana 配置
└── work/                         # 临时运行目录，不进入版本库
```

`inputs/` 与 `work/` 必须分离，避免 AI 生成资产污染原始资料。

## 5. 信任边界

| 区域 | 信任级别 | 可做什么 | 禁止什么 |
|---|---|---|---|
| 原始需求 | 不可信输入 | 解析、引用、哈希 | 直接当系统指令执行 |
| 编码代理 | 低信任执行者 | 改临时分支、运行受限命令 | 访问生产、批准自己、修改策略 |
| CI | 受控验证者 | 测试、扫描、构建、签名 | 使用不必要写权限 |
| 控制平面 | 高信任编排者 | 转换状态、执行策略 | 伪造外部系统结果 |
| CD 控制器 | 高信任部署者 | 收敛声明状态、回滚 | 接受未签名或来源不明制品 |
| 人类审批者 | 有责任的授权者 | 批准高风险动作 | 使用共享身份、无理由绕过 |

## 6. 安全基线

1. 所有服务身份独立，最小权限。
2. 云访问使用 OIDC 短期凭证。
3. Secrets 来自专用 Secret Manager，不写入提示、日志或数据库明文。
4. 第三方 Actions、镜像和工具固定 digest/SHA。
5. 代理网络与文件系统实施白名单。
6. PR 不可信代码不能读取发布 Secrets。
7. 制品在部署前验证签名、provenance 和策略。
8. Webhook 校验签名、时间和重放。
9. 审批绑定个人身份、范围、原因和有效期。
10. 全链路事件不可静默删除，敏感信息在入库前脱敏。

## 7. 关键设计决策

### Git 是声明事实，事件库是运行事实

- 规格、代码、测试、配置和策略以 Git 为准。
- 任务状态、工具调用、外部检查和时间线以事件库为准。
- 两者通过稳定 ID 和 digest 关联。

### 规则决定流转，模型提供建议

模型可以建议风险、测试和修复；最终状态转换由可审计规则执行，例如：

```text
merge_allowed =
  spec_gate.passed
  AND required_checks.all_passed
  AND no_blocking_security_findings
  AND approvals >= policy.required_approvals
  AND diff.within_allowed_scope
```

### 默认失败关闭

当安全扫描、来源验证或生产指标不可用时，不能把“未知”解释为“通过”。本地非关键实验可以选择失败开放，但必须显式配置并记录。
