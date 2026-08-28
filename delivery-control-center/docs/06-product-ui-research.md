# OneOPC 产品界面调研与 UI 方向

> 调研日期：2026-08-14

## 1. 产品目标

OneOPC 的最终交互必须足够简单：

```text
用户输入：一份需求文档
系统输出：一个已经在本地部署、可以直接打开使用的系统
```

中间过程默认无人值守，但不能成为黑盒。界面提供两个可随时切换的层级：

- **全局视图**：回答“现在做到哪、是否正常、多久完成、最后产物在哪”。
- **详细视图**：回答“每一步真实做了什么、调用了什么工具、产生了哪些证据、为什么失败”。

## 2. 业界产品参考

### GitHub Copilot agents

可借鉴：

- 统一 sessions 列表展示跨仓库任务。
- 每个 session 展示实时状态、时长和 Token 使用。
- 下钻后查看 agent progress、工具调用和完整日志。
- commit 与 session 日志关联，形成审计链。
- 用户可以停止、归档和追加 steering 指令。

OneOPC 取其“统一会话管理 + 日志下钻”，但把对象从“编码 session”提升为完整 Delivery Run。

来源：

- https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents
- https://github.blog/changelog/2026-05-14-introducing-copilot-cli-agent-and-unified-sessions-view-in-github-copilot-for-jetbrains-ides/

### Devin

可借鉴：

- Ask/Plan 与 Agent 执行的阶段区别。
- 会话页同时承载计划、执行状态、代码、终端和浏览器。
- 长任务异步执行，用户不必停留在当前页面。
- 并行 session 可从统一入口管理。

OneOPC 不暴露 Ask/Agent 模式给普通用户。系统自动进行需求澄清，只有无法安全推断时才发起一次明确提问。

来源：

- https://docs.devinenterprise.com/get-started/first-run
- https://docs.devin.ai/desktop/changelog

### OpenHands Agent Canvas

可借鉴：

- 本地优先的 agent server backend。
- 一个控制中心接入 OpenHands、Claude Code、Codex、Gemini 等代理。
- 预制自动化模板和可查看的工具调用。
- 后端、MCP 和凭证连接健康状态可视化。

OneOPC 取其“多代理适配 + 本地运行 + 连接健康”，但主界面围绕交付结果而不是对话。

来源：

- https://docs.openhands.dev/openhands/usage/agent-canvas/first-time-setup
- https://github.com/OpenHands/OpenHands

### Harness

可借鉴：

- Pipeline stage flow 与 Gantt 时间线。
- 点击具体阶段查看日志和失败上下文。
- 状态、审批、安全问题和交付指标统一关联。
- 使用软件交付知识图谱连接服务、环境、制品和策略结果。

OneOPC 取其“统一交付视野 + 图到日志的下钻”，但降低企业平台的信息密度，让单个需求成为第一视觉中心。

来源：

- https://developer.harness.io/docs/platform/harness-aida/harness-mcp-server/
- https://www.harness.io/blog/harness-vs-code-extension

### Argo CD 与 Argo Rollouts

可借鉴：

- 应用健康、同步状态和资源树。
- Tree、Pods、Network、List 等不同部署视图。
- Rollout 阶段、流量比例和健康分析。

OneOPC 不复制完整 Kubernetes 运维 UI，只展示“部署是否真实完成、当前版本、URL、健康证据和回滚状态”；高级运维可跳转原系统。

来源：

- https://argo-cd.readthedocs.io/en/stable/operator-manual/ui-customization/
- https://github.com/argoproj-labs/rollout-extension/

## 3. OneOPC 信息架构

```text
OneOPC
├── 新建交付
│   └── 上传需求文档
├── 交付运行
│   ├── 全局视图
│   └── 详细视图
├── 已交付系统
│   ├── 打开本地系统
│   ├── 查看版本与健康
│   └── 停止/重新部署
└── 平台设置
    ├── 模型与代理
    ├── Git/CI/CD
    ├── 本地运行环境
    └── 权限与预算
```

普通用户的主路径只有：

1. 拖入需求文档。
2. 点击“开始全自动交付”。
3. 等待通知。
4. 点击“打开本地系统”。

## 4. 全局视图

### 必须展示

- 需求名称和原文件。
- 总状态：运行中、需澄清、已阻塞、已完成、已回滚。
- 总进度和预计剩余时间。
- 从需求到上线的阶段带。
- 当前正在执行的真实动作。
- 阻塞、风险和需要用户处理的事项。
- 最终输出：本地 URL、版本、健康状态、启动/停止。

### 不默认展示

- 大段 agent 对话。
- 原始终端输出。
- 每个测试用例。
- Kubernetes 资源细节。
- Token 级推理过程。

这些信息全部放入详细视图。

## 5. 详细视图

采用三栏结构：

- 左栏：所有阶段和子步骤，显示状态、耗时和重试。
- 中栏：按时间追加的真实事件流与日志。
- 右栏：当前步骤的输入、输出、证据、工具、成本和关联对象。

详细视图提供：

- 仅看失败
- 仅看关键事件
- 实时跟随日志
- 日志/证据/产物切换
- 下载证据包
- 复制诊断信息
- 在允许的状态执行暂停、重试、取消

## 6. 关键交互

### 视图切换

顶部使用明确的分段控件：

`全局视图 | 详细视图`

切换不改变当前 Delivery Run，也不丢失用户选中的阶段。

### 阶段下钻

在全局阶段带点击任意阶段：

1. 自动切换到详细视图。
2. 选中对应阶段。
3. 定位到最新或首个失败事件。

### 用户介入

正常情况下不显示对话框。只有以下状态弹出行动卡：

- 需求存在业务关键歧义。
- 缺少本地权限或凭证。
- 高风险动作按策略要求批准。
- 自动修复超过预算。

卡片只问一个可执行问题，回答后流程自动继续。

### 输出交付

完成状态的主按钮必须是：

`打开本地系统`

旁边提供：

- 复制地址
- 查看交付报告
- 停止系统
- 基于新需求继续迭代

## 7. 视觉语言

- 蓝色：当前执行和导航。
- 绿色：已通过、健康、已交付。
- 琥珀色：等待、风险、需要注意。
- 红色：失败、阻断、回滚。
- 紫色：AI/代理活动。
- 灰色：尚未开始和辅助信息。

全局视图以阶段和结果为中心；详细视图以时间、日志和证据为中心。二者共享同一状态模型，不能出现互相矛盾的进度。

## 8. 必须避免

- 用循环动画伪装系统正在工作。
- 只显示“AI 正在思考”而不显示实际工具或阶段。
- 进度条按时间估算而非按状态事件计算。
- 成功状态没有部署 URL 和健康证据。
- 失败只显示“出错了”，不提供阶段、错误分类和日志。
- 把聊天窗口做成产品主界面。
- 要求用户理解 Git、CI、容器或 Kubernetes 才能拿到结果。

## 9. 第一版 UI 页面

第一版只需要四个页面：

1. 首页/新建交付
2. Delivery Run 全局视图
3. Delivery Run 详细视图
4. 已交付系统详情

当前 UI 原型优先展示第 2、3 页的切换，因为这是 OneOPC 与普通编码代理产品的核心差异。
