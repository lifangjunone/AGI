# OneOPC vs Multica

基准版本：`multica-ai/multica@85a88b3`（2026-08-17）

隔离代码目录：`.sandbox/external-references/multica`

## 结论

Multica 是“人和 Agent 的协作工作台”，强项是 Issue、Agent、Squad、Inbox、
Autopilot 和跨机器 Daemon。OneOPC 是“需求到本地系统的自动交付控制面”，强项是
八阶段交付、真实桌面软件控制、检查点恢复、技术情报、CodeGraph 和最终本地部署。

不应把 OneOPC 改造成通用 Issue 管理器。应吸收 Multica 的 Agent 治理方法，并继续
保持“用户只给输入、只拿结果”的产品边界。

## 能力矩阵

| 能力 | Multica | OneOPC | 判断 |
| --- | --- | --- | --- |
| 唯一需求输入到可用系统 | 不提供固定交付闭环 | 已有八阶段闭环 | OneOPC 领先 |
| 多 Agent 角色 | Agent + Squad Leader 动态路由 | Work/Code 工具选择 | Multica 领先 |
| 桌面 GUI 工具控制 | 主要驱动 CLI | Computer Use 控制 Trae Work/Code | OneOPC 领先 |
| 任务恢复 | Session、Workdir、分类重试 | 应用重启、心跳、检查点续跑 | 各有优势 |
| 每次执行独立记录 | 独立 Task，不覆盖历史 | 原先以当前监管状态为主 | Multica 领先 |
| 执行日志 | 消息、工具调用、错误、时间 | Run Event 和证据制品 | Multica 更细 |
| Token 与成本 | 按 Run、Agent、Issue 汇总 | GUI 工具无法可靠获取 | Multica 领先 |
| 人工注意力 | Inbox、Review Gate | 原先散落在任务异常中 | Multica 领先 |
| 定时自动化 | Cron、Webhook、Runbook | Technology 定时扫描 | Multica 领先 |
| 技术参考与代码证据 | 通用 Skill/MCP | Technology Exploration + CodeGraph | OneOPC 领先 |
| 最终部署与直接体验 | 由 Agent 自行完成 | 本地 URL、健康检查、直接打开 | OneOPC 领先 |
| 隔离与安全 | 独立 Workdir，但默认无 OS 沙箱 | 输入/过程/图谱物理隔离 | OneOPC 更适合交付审计 |

## 已借鉴并落地

### 1. 自主交付小队

每个 Run 自动形成四个语义角色：

- 交付指挥官：需求理解、业务确认、方案和验收。
- 技术调研员：开源匹配、技术证据和 CodeGraph。
- 系统开发员：开发、交付和部署。
- 质量验证员：测试、门禁和验收验证。

角色按八阶段自动路由，并绑定真实检测到的工具。它不要求用户创建 Agent、Issue 或
Squad，保留 OneOPC 的单输入体验。

### 2. 不可覆盖执行账本

启动、重试、应用重启、检查点恢复、心跳停滞和恢复失败均追加为独立记录。新的尝试
不会覆盖旧尝试，能够回答“何时、由谁、从哪个检查点、因为什么再次执行”。

### 3. 例外型决策收件箱

只聚合系统无法安全自决的事项：

- 自动恢复失败或任务停滞。
- 工具离线且重启预算耗尽。
- 缺少任务级适配器。
- 候选项目被许可证策略阻断。

正常阶段交接、自动重启和成功重试不会打扰用户。这比通用协作 Inbox 更符合全自动
交付场景。

## 超越点

1. Multica 需要创建 Workspace、Agent、Squad 和 Issue；OneOPC 从需求文档自动形成
   小队和任务路由。
2. Multica 主要管理 CLI 子进程；OneOPC 同时管理 GUI 应用、Accessibility 控件、
   多显示器窗口和当前任务心跳。
3. Multica 的 Task 完成不等于产品交付完成；OneOPC 以本地服务健康、访问 URL 和
   业务验收为终点。
4. OneOPC 的技术选择有“需求 -> 仓库 -> 符号 -> 测试”的证据链，而不是只保留
   Agent 评论。
5. OneOPC 默认自行处理可恢复问题，仅把无法安全处理的例外交给人。

## 尚未复制的能力

以下能力有价值，但不应伪装成已实现：

- CLI Agent 的精确 Token 和成本统计。
- 多成员评论、@提及和移动端协作。
- 任意 Cron/Webhook Runbook。
- 工作区级角色权限和任务级 API Token。
- 真正并行的多个独立代码工作区。

后续优先级应为：真实并行工作区、失败成本统计、可复用交付 Skill。通用社交协作和
移动端不应优先于交付稳定性。

## 许可证边界

Multica 仓库不是标准 Apache-2.0 标识，许可证包含额外的托管、商业嵌入和品牌条件。
本次只借鉴公开产品模式和架构思想，没有复制其源码、样式或资产。
