# 多 Agent 协作项目研究与 Nexora 产品架构

更新时间：2026-08-28

## 研究范围

本轮优先使用官方文档、官方 GitHub 仓库与架构说明，覆盖协作工作区、编排框架、Agent 社会模拟和执行运行时四类代表项目。目标不是收集功能清单，而是寻找能降低自主任务失败率的机制。

## 能力矩阵

| 项目 | 主要优势 | Nexora 吸收的机制 |
| --- | --- | --- |
| [Raft](https://docs.raft.build/features/agents/) | Agent 是拥有名称、角色、记忆、频道和工作区的持久成员；支持任务认领、@提及、线程交接与 Agent 创建 Agent。 | 持久身份、显式协作动态、人类与 Agent 共用控制面。 |
| [Multica](https://github.com/multica-ai/multica) | Agent 出现在看板并主动报告进度或阻塞；覆盖排队、认领、执行、完成/失败生命周期；支持多种 CLI、本地 daemon、技能复用与自托管。 | 任务生命周期、统一运行时边界、能力沉淀和本地优先。 |
| [AI Town](https://github.com/a16z-infra/ai-town) | 后端原生支持共享全局状态、事务和模拟引擎；Agent 在事件循环中行动，耗时推理可异步执行。 | 事务化共享状态、确定性周期、事件输入与异步工作分离。 |
| [CrewAI](https://docs.crewai.com/en/concepts/flows) | Crews 负责角色协作，Flows 负责事件驱动、条件、分支、持久状态和精确控制；支持 guardrail 与结构化输出。 | 自治团队和确定性流程分层、门禁、状态显式化。 |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 面向长时有状态 Agent 的低层编排，强调 durable execution、检查点、记忆、流式输出和 human-in-the-loop。 | 可暂停/恢复执行、检查点思路、人类批准节点。 |
| [AG2 / AutoGen](https://github.com/ag2ai/ag2) | 多 Agent 对话模式、工具使用、模型可替换和人类介入；支持多种群组编排模式。 | 运行时与模型解耦、可替换协作策略。 |
| [MetaGPT](https://github.com/FoundationAgents/MetaGPT) | 通过产品经理、架构师、工程师等角色和 SOP，把自然语言需求转换为结构化软件产物。 | 角色化流水线、产物驱动交接、标准作业流程。 |
| [CAMEL](https://github.com/camel-ai/camel) | 角色扮演、多 Agent 社会、动态通信和大规模模拟能力。 | Agent 团队可扩展性、角色协议和协作实验。 |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 模型无关、可组合 SDK、隔离执行环境、浏览器与终端工具，以及本地到云端的扩展路径。 | 沙箱运行时边界、工具能力声明、执行层可替换。 |
| [AgentTeams](https://github.com/agentscope-ai/AgentTeams) | 不同 Agent 运行时共存，通过共享文件系统降低重复上下文和 Token 消耗。 | 异构运行时路由、共享产物优先于重复对话。 |

## 关键判断

### 1. 自主性不是减少按钮

可靠自治需要把目标、依赖、权限、证据、风险和停止条件全部显式化。只有对话历史而没有状态机，无法证明任务真正完成。

### 2. 任务图是控制面，消息是解释面

Agent 可以通过消息讨论和交接，但任务状态只能由受约束的状态转换更新。这样可以防止一句“已完成”绕过测试、产物或审批。

### 3. 共享记忆必须经过筛选

原始对话不应直接成为长期记忆。Nexora 只把通过门禁的产物经验写入共享记忆，并保留来源 Agent、周期、重要度和标签。

### 4. 评审必须具有独立性

执行者不能同时是最终评审者。高风险动作还需要人类批准，批准事件进入同一账本，避免事后无法还原责任。

### 5. 异构运行时比绑定单一模型更重要

规划、研究、实现、体验和审查适合不同模型与工具。控制面应管理任务和证据，运行时适配器负责连接 Claude Code、Codex、Gemini、OpenHands 或本地模型。

## Nexora 架构

```text
Goal Intake
    │
    ▼
Mission Compiler ──> typed task graph + policies + acceptance gates
    │
    ▼
Orchestrator ──────> dependency scheduler + agent routing + risk budget
    │
    ├──> Runtime adapters ──> CLI / API / sandbox / remote worker
    ├──> Event ledger ──────> immutable execution evidence
    ├──> Artifact store ────> files, tests, reports, receipts
    └──> Memory curator ────> verified reusable experience
    │
    ▼
Independent review ──> automatic guardrails ──> human approval when required
```

当前 MVP 已实现浏览器内的任务图、调度推进、事件账本投影视图、共享记忆和审批门禁。生产版需要增加服务端事件存储、运行时适配器、隔离沙箱、凭证代理、可恢复队列和真实评估器。

## 差异化方向

Nexora 的目标不是再做一个 Agent 聊天室，而是把以下四点放在同一控制面：

1. 结果可证明：完成状态必须有产物、门禁和事件证据。
2. 风险可控制：自治级别、风险预算和人工审批分开配置。
3. 协作可解释：任何认领、交接、评审和恢复都能追溯。
4. 能力会复利：只有验证过的经验进入共享记忆和技能库。
