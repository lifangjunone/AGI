# Multica 源码对标与 DeliveryPilot 超越方案

## 审计基线

- 仓库：`github.com/multica-ai/multica`
- 固定提交：`85a88b373d195c0bfcbf8d50bde67cecb5b42cba`
- 审计范围：产品文档、Electron/Web、Go Server、Agent Runtime、Inbox、Autopilot、Execution Transcript、Usage、E2E
- 许可证结论：不是无附加条件的标准 SPDX 宽松许可证。仅借鉴产品机制和架构思想，不复制其源码、UI 或品牌资产。

## 功能差距矩阵

| 能力 | Multica | DeliveryPilot 审计前 | 本轮结果 |
| --- | --- | --- | --- |
| 原始需求到可运行交付 | 偏任务与 Agent 协作 | 完整闭环，且有测试和部署证据 | 保持领先 |
| GUI 软件真实操作 | 主要依赖 Agent CLI | Accessibility + Computer Use | 保持领先 |
| Provider API / CLI | 20+ CLI Runtime | Technology Provider + CodeGraph CLI | 纳入统一工具目录 |
| 执行日志 | 实时 Transcript、WebSocket、历史回填 | 每任务最近事件 | 升级为跨工具、统一序号的执行飞行记录 |
| 异常收件箱 | Inbox、去重、已读和归档 | 异常散落在任务卡片 | 升级为只收需要人决策的待办 |
| Runtime 能力发现 | 版本、模型、权限、能力门控 | 各集成分散判断 | 升级为 GUI/API/CLI 统一目录和实时可用性 |
| 失败分类与恢复 | 认证、限流、网络、上下文等分类；Session Resume | 退出、卡住、锁屏、控制器、心跳分类；检查点续跑 | DeliveryPilot 更适合桌面 GUI 故障，后续补 API 细分类 |
| 使用量和成本 | Token、模型、成本、时长、失败率 | 暂无统一成本模型 | 暂不伪造；仅在 Runtime 提供可信 usage 时接入 |
| Review Readiness | Skill 提示 Agent 总结范围、测试、回滚和风险，不是强制门禁 | 已有阶段确认、产物完整性、JUnit 和真实服务校验 | DeliveryPilot 的机器证据更强，下一阶段统一为 Policy Gate |
| Worktree 与仓库缓存 | Worktree 隔离、共享缓存、GC | 项目/版本物理隔离 | 当前更贴合端到端交付；后续可补仓库缓存 |
| Cron / Webhook Autopilot | 完整规则、幂等、失败自动暂停 | 后台巡检、技术项目每 5 分钟扫描 | 保持现有垂直自动化，暂不建设通用调度平台 |
| 多用户、组织、Squad、Issue | 完整协作平台 | 单机个人交付控制台 | 非当前目标，不照搬 |
| Slack/Lark/企微等入口 | 多渠道触发 | Technology Exploration 文件握手 | 价值明确，但优先级低于执行可靠性 |

## 本轮吸收的三项机制

### 1. 执行飞行记录

`ExecutionEvent` 将现有持久化监督事件转换为统一协议：

- 跨 Trae Work、Trae Code 汇总。
- 全局顺序号，支持按时间回放。
- 区分 lifecycle、progress、recovery、failure、decision、operator。
- 区分 info、success、warning、error、critical。
- 保留任务、工具、工作区和真实时间戳关联。

### 2. 待我处理

收件箱不展示所有错误，只展示自动化无法自行解决的事项：

- 自动恢复预算耗尽。
- 后续研发阶段接续失败。
- macOS 锁屏，需要用户解锁。
- 控制器超过 45 秒持续不可用。

中间恢复失败、短时离线和正常重试仍由后台处理，不制造通知噪声。可执行事项直接调用现有监督命令完成重试、重置预算或停止任务。

### 3. 统一执行工具目录

统一协议覆盖三类 Runtime，而不是只覆盖 Agent CLI：

- Desktop GUI：Trae Work、Trae Code。
- Hybrid：Technology Exploration 的 Provider API 与 Computer Use。
- CLI：CodeGraph。

目录展示真实连接方式、可用状态、活动任务和能力范围。状态来自进程、端口、二进制和监督任务，不由前端猜测。

## DeliveryPilot 的超越点

Multica 的优势是“管理多个 Agent 团队成员”；DeliveryPilot 的优势是“把一个真实业务需求稳定交付成可运行系统”。新的执行控制中心将两者的优点合并，但扩大了受控对象：

```text
需求文档
  -> Trae Work (GUI / Computer Use)
  -> Technology Exploration (Provider API / GUI)
  -> CodeGraph (CLI)
  -> Trae Code (GUI / Computer Use)
  -> 自动化测试、交付证据、真实运行地址
  -> 后台监督、检查点恢复、统一记录、人工决策
```

因此统一执行层不被限制在 Agent CLI，也能控制没有 SDK、只能操作桌面界面的客户软件。这是 Multica 当前架构没有覆盖的部分。

## 第二轮源码审计

### 值得吸收：不可变执行清单

Multica 在任务入队时固定 Plugin release、Skill 文件摘要、能力授权和 daemon feature，执行期间不再读取“当前最新配置”。这解决了两个问题：

- 历史任务可以准确解释当时执行了什么，而不是用今天的配置解释昨天的结果。
- 配置升级不会改变正在运行任务的行为。

DeliveryPilot 已隔离项目版本，但当前 `version.json` 主要描述项目身份，尚未固定完整执行环境。建议每个版本在启动时写入：

```text
.delivery-pilot/execution-manifest.json
  schemaVersion
  taskId / projectId / version
  sourceDocumentSha256
  automationMode
  tool bindings:
    Trae Work bundle/version/transport
    Technology Exploration capability/version/transport/projectId
    CodeGraph binary/version/repository commit
    Trae Code bundle/version/transport
  policy snapshot
  createdAt
  manifestSha256
```

清单一旦开始执行便只追加修订记录，不原地改写。执行飞行记录引用清单摘要，历史回放才能形成完整证据链。

### 值得吸收并扩大：失败率熔断

Multica 的 Autopilot 不只重试单次失败，还统计最近 7 天至少 50 次运行；失败率达到 90% 时自动暂停，并通知负责人。`skipped` 不计入成功或失败，避免离线预检跳过稀释真实失败率。

DeliveryPilot 当前的 4 次重试预算只保护单个任务，缺少跨任务判断。更适合本项目的实现不是暂停整个交付系统，而是按“工具 + 通道 + 故障类型”熔断：

- Computer Use 连续失败时，只熔断 GUI 通道并切换 Provider API。
- Provider API 连续失败时，保留主交付并暂停技术参考支线。
- Trae Work / Code 真实退出仍按检查点恢复，不与控制器故障混算。
- 熔断必须生成 `AttentionItem`，写明窗口、样本数、失败率、降级动作和恢复条件。
- 人工恢复后进入半开状态，先放行一次探测，成功再完全恢复。

这会比 Multica 的 Autopilot 级暂停更精细，因为 DeliveryPilot 可以隔离具体 GUI/API/CLI 通道，不阻断仍然健康的交付路径。

### 值得有条件吸收：安全的 Adapter 包

Multica 的 Plugin 包采用内容寻址摘要，并拒绝路径穿越、符号链接、二进制、可执行文件、安装脚本和构建钩子；能力由 manifest 显式声明和批准。

DeliveryPilot 后续的 Runtime Adapter SDK 应借鉴这个安全边界：

- Adapter 默认只允许声明式 JSON、提示词和文本映射。
- GUI 点击、文件读写、网络访问、进程启动分别申请能力。
- Adapter 目录与项目资产隔离。
- 固定摘要后再进入执行清单。
- 不允许 Adapter 自带 `postinstall` 或任意启动脚本。

### 暂不吸收

- `Squads`、Issue 协作和成员权限：服务多人 Agent 团队，不解决当前单机交付可靠性。
- 通用 Cron/Webhook 平台：现有 5 分钟技术扫描和后台监督已经覆盖明确业务场景。
- 完整 Token 成本看板：GUI 工具没有可信 Token 数据。未知必须显示未知，不能按零成本统计。
- 全面 Git Worktree：Multica 的脏工作区回放和失败保留设计优秀，但 DeliveryPilot 当前每个版本已物理隔离。仅在未来支持“接入已有 Git 仓库并并行改造”时启用。

## 修订后的优先级

1. 不可变 `Execution Manifest`：先解决历史可重放和运行中配置漂移。
2. 通道级熔断器：跨任务统计 GUI/API/CLI 失败，自动降级、半开恢复。
3. `Policy Gate`：把许可证、安全、测试、产物、真实部署和人工审批统一为机器可判定门禁。
4. Runtime Adapter SDK：允许新 GUI/API/CLI 工具安全注册，不再修改核心代码。
5. 可信 Usage：只采集 Runtime 实际返回的 Token、费用和时长，缺失值明确标记未知。
6. 通知出口：只把真正的 `AttentionItem` 推送到飞书等渠道，不转发全部执行日志。
