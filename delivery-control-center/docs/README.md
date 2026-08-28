# OneOPC：从需求文档到上线的全自动化流程调研

> 调研日期：2026-08-14

## 目标

研究并设计一条可在本地验证、最终可迁移到生产环境的自动化软件交付流水线：

`需求文档 -> 可执行规格 -> 任务拆分 -> AI 编码 -> 自动测试 -> PR -> 构建制品 -> 部署 -> 观测 -> 自动回滚`

## 核心结论

当前没有一个成熟开源项目可以可靠覆盖“任意需求文档到生产上线”的全部环节。业界最佳实践是组合多个职责单一、可验证的系统：

| 层级 | 推荐能力 | 代表项目 |
|---|---|---|
| 需求与规格 | 把自然语言转成可审查、可追踪的规格 | GitHub Spec Kit、OpenSpec |
| 研发代理 | 在隔离环境内改代码、运行测试、提交 PR | OpenHands、SWE-agent |
| 工程入口 | 标准化项目模板、所有权和服务目录 | Backstage Software Templates |
| CI 与供应链 | 确定性测试、扫描、构建、签名和证明 | GitHub Actions、Sigstore、SLSA |
| CD 与环境 | GitOps、环境收敛、可审计部署 | Argo CD |
| 渐进交付 | 金丝雀、蓝绿、指标分析、自动回滚 | Argo Rollouts、Flagger |
| 运行治理 | SLO、日志、指标、追踪和事件闭环 | OpenTelemetry、Prometheus、Grafana |

最重要的设计原则：

1. **AI 负责生成候选变更，确定性工具负责判定能否前进。**
2. **规格、代码、测试、基础设施和发布策略全部版本化。**
3. **同一制品逐级晋升，禁止每个环境重新构建。**
4. **默认最小权限、隔离执行、短期凭证和完整审计。**
5. **高风险动作保留明确的人类授权点，而不是伪装成全自动。**
6. **上线不是终点，观测、回滚、复盘和需求反馈属于同一闭环。**

## 文档导航

- [01-industry-landscape.md](./01-industry-landscape.md)：开源项目与业界方案横向调研
- [02-end-to-end-workflow.md](./02-end-to-end-workflow.md)：从输入到上线再到反馈的 24 个步骤
- [03-reference-architecture.md](./03-reference-architecture.md)：OneOPC 推荐参考架构与数据模型
- [04-local-roadmap.md](./04-local-roadmap.md)：在一台本地机器上分阶段搭建完整 POC
- [05-gates-and-metrics.md](./05-gates-and-metrics.md)：自动化闸门、风险分级、SLO 与 DORA 指标
- [06-product-ui-research.md](./06-product-ui-research.md)：业界产品界面调研与双层可视化设计
- [07-optional-tech-intelligence-integration.md](./07-optional-tech-intelligence-integration.md)：与 Technology Exploration 融合的可选技术情报增强方案
- [08-dual-channel-codegraph-integration.md](./08-dual-channel-codegraph-integration.md)：Computer Use / Provider API 双通道与 CodeGraph 图谱增强方案
- [sources.md](./sources.md)：官方资料与项目来源

## “全自动”的准确含义

建议将自动化分为三个等级，而不是只用“自动/手动”：

| 等级 | 定义 | 典型环节 |
|---|---|---|
| A：全自动 | 规则明确、失败可阻断或回滚、无需人工判断 | 格式校验、测试、扫描、制品构建、开发环境部署 |
| B：条件自动 | 风险评分低且全部闸门通过时自动，否则升级人工 | PR 合并、预发布晋升、低风险生产发布 |
| C：人工授权 | 不可逆、高影响或合规动作必须由责任人批准 | 数据破坏性迁移、权限模型变更、高风险生产发布 |

目标不是消灭所有人工，而是让人工只处理“意图、风险和例外”，不再手工搬运流程。

## 建议的第一版技术栈

本地 POC 优先控制复杂度：

- 规格层：OpenSpec
- 编排层：一个轻量状态机服务
- 编码层：OpenHands 或当前可用的编码代理
- 代码托管：GitHub
- CI：GitHub Actions
- 本地运行：Docker Compose，随后迁移到 `kind`
- CD：Argo CD
- 渐进交付：Argo Rollouts
- 观测：OpenTelemetry + Prometheus + Grafana
- 策略：OPA/Conftest，进入 Kubernetes 后使用 Kyverno 或 Gatekeeper

不要在第一版同时引入 Backstage、Tekton、Temporal 和多代理框架。先证明单仓库、单服务、单需求能闭环，再扩展平台能力。
