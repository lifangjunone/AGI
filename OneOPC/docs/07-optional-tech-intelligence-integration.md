# OneOPC × Technology Exploration 可选技术情报增强方案

## 1. 目标与边界

目标：OneOPC 获取需求后，可选地调用 Technology Exploration，从热点、开源项目、模型、论文和历史交付中寻找可复用实现，缩短方案设计和 Demo 交付时间。

该能力必须满足：

- **非必须**：关闭、失败、超时或无结果时，主交付流程继续。
- **只提供建议**：技术情报不能直接改变业务需求、跳过测试或宣布方案通过。
- **证据优先**：热度只用于发现，采用决策必须依赖官方仓库、许可证、维护状态、安全和实际构建证据。
- **本地优先**：原始需求不上传给热点平台；对外查询只发送最小化的能力关键词。
- **可审计**：候选、淘汰理由、采用决定、固定版本和后续效果都写入 Delivery Run。

## 2. 两个项目当前能力

### Technology Exploration

现有优势：

- 聚合 GitHub Trending、Hugging Face、Hacker News、arXiv、YouTube、X 和国内平台。
- 最新报告已有 17 个成功来源、约 900 条候选和来源健康状态。
- 支持公开源、付费增强源和本地 MediaCrawler 的降级组合。
- 每日 JSON 报告包含标题、URL、来源、摘要、发布时间、互动证据和热度分。

现有缺口：

- 查询主题固定为 AI/Agent，不支持根据任意业务需求生成定向查询。
- 排名偏重热度、时效和关键词，不等于工程适配度。
- 缺少仓库许可证、Release、提交活跃、Issue 响应、依赖漏洞和供应链风险。
- 缺少 Clone、Build、Test、Demo 启动等可运行性验证。
- 当前是桌面应用与每日报告，没有稳定的查询 API/MCP 契约。

### OneOPC

现有优势：

- 原始需求归档、运行状态、事件证据、阶段视图、历史版本和本地输出入口。
- 已有 Work/Code 工具自动识别和适配位置。
- 状态模型适合把技术调研作为一组可审计事件和制品。

现有缺口：

- 方案设计目前主要依赖执行代理自身知识。
- 没有“候选发现 → 工程验证 → 采用决策”的标准过程。
- 没有记录技术选型对 Demo 速度和最终质量的真实贡献。

## 3. 推荐定位

新增独立组件 **Technology Intelligence Advisor（技术情报顾问）**。

```text
Technology Exploration
  ├── Daily Collector        现有多源每日采集
  ├── Intelligence Index     规范化实体、全文索引、历史信号
  ├── Targeted Search        按需求定向搜索 GitHub/官方来源
  ├── Repository Verifier    许可证、安全、维护与可运行性验证
  └── Query API / MCP        对 OneOPC 和编码代理提供稳定契约

OneOPC
  ├── Requirement Normalizer
  ├── Tech Intelligence Adapter ───────┐
  ├── Architecture Planner <───────────┤ reference bundle
  ├── Code Agent                       │
  └── Evidence Store <─────────────────┘ events / decisions / outcomes
```

Technology Exploration 继续拥有“采集与情报”；OneOPC 只拥有“何时调用、是否采用以及如何证明”。禁止 OneOPC 直接 import 当前 Python 单文件内部函数，避免两个桌面应用紧耦合。

## 4. 在交付流程中的位置

不新增强制阶段。技术情报在现有阶段中作为并行支线：

```text
需求理解
  ├── 结构化业务需求
  └── 生成最小化技术检索画像
           │
业务确认 ──┼── 可选技术情报检索（并行、非阻塞）
           │      ├── 本地历史报告快速召回
           │      ├── 定向外部检索
           │      └── Top N 工程验证
           v
方案设计
  ├── 无候选：从零设计
  ├── 仅参考：借鉴架构/API/交互
  ├── 试用：隔离 Spike 后决定
  └── 采用：固定仓库、Commit、License 和使用边界
```

主流程规则：

- `off`：记录 `tech_intelligence.skipped`，立即继续。
- `smart`：仅在预期收益高时运行，推荐默认。
- `always`：每次运行，但仍不成为通过闸门。
- 软超时后记录 `tech_intelligence.timed_out`，方案设计不等待。
- 只有用户显式配置为“技术情报必须成功”时才可成为闸门；默认 UI 不提供该模式。

## 5. 三段式检索与验证

### 5.1 需求画像

从标准化需求生成 `TechQueryProfile`，不发送原始文档：

- 业务能力：工单、审批、实时协作、搜索、图表等。
- 技术能力：OCR、RAG、语音、工作流引擎、地图等。
- 交付形态：Web、桌面、移动端、API、离线。
- 约束：语言、OS、本地部署、数据库、许可证、安全等级。
- Demo 目标：必须跑通的用户旅程和允许替代的部分。
- 排除项：禁止 SaaS、禁止 GPL、禁止外部数据上传等。

### 5.2 候选召回

使用不同召回通道，不能只搜热点：

1. **本地快速召回**：最近 7/30 天 Technology Exploration JSON。
2. **定向开源搜索**：GitHub 仓库、README、Topic、代码和 Release。
3. **模型与 Demo**：Hugging Face Models、Datasets、Spaces。
4. **技术证据**：官方文档、论文、作者发布、Product Hunt/HN 讨论。
5. **本地复用库**：OneOPC 历史交付中已验证的组件、模板和实现。

先采用关键词 + FTS5；数据量和跨语言需求上升后再增加本地 embedding 和 reranker。第一版不需要部署独立向量数据库。

### 5.3 工程验证

对排名前 3-5 的仓库执行：

- 解析 README、LICENSE、依赖清单、Release 和示例。
- 固定 Commit SHA，禁止只记录可移动的 `main`。
- 检查最近提交、Release、贡献者、Issue/PR 响应和是否归档。
- 使用 deps.dev/OSV 获取许可证、依赖和已知漏洞。
- 使用 OpenSSF Scorecard 获取维护和供应链实践信号。
- 在无凭证、网络受限的一次性沙箱中执行 Clone、Install、Build、Test。
- 如有 Quick Start，启动最小 Demo 并做 HTTP/UI 冒烟。
- 保存命令、退出码、日志摘要、截图和失败原因。

未经沙箱验证的候选最多为 `reference`，不能标记为 `adopt`。

## 6. 评分模型

热点分不能直接成为工程推荐分。

| 维度 | 权重 | 说明 |
|---|---:|---|
| 功能匹配 | 30 | 覆盖需求能力和关键用户旅程 |
| Demo 加速价值 | 20 | 可复用 UI/API/数据模型，预计节省时间 |
| 集成成本 | 15 | 语言、架构、依赖和部署兼容性，成本越低分越高 |
| 维护健康 | 10 | 提交、Release、Issue、贡献者和归档状态 |
| 安全与供应链 | 10 | 漏洞、Scorecard、固定依赖、发布可信度 |
| 许可证兼容 | 10 | SPDX、商业使用、传染性和 NOTICE 要求 |
| 热度与新鲜度 | 5 | 多源趋势和近期采用信号，仅作弱信号 |

硬淘汰条件：

- 未知或不兼容许可证。
- 已归档且无可接受替代维护者。
- 存在未缓解的 Critical 漏洞。
- 需要把敏感数据上传到禁止的外部服务。
- 最小 Demo 无法在预算内构建或启动。

输出决策：

- `adopt`：可直接作为固定依赖或基础实现。
- `trial`：先做隔离 Spike，验证后再采用。
- `reference`：只借鉴设计，不复制依赖。
- `reject`：记录明确淘汰原因。

## 7. 数据契约

### 请求

```json
{
  "schema_version": "1.0",
  "run_id": "OP-...",
  "mode": "smart",
  "deadline_ms": 90000,
  "profile": {
    "capabilities": ["work-order", "combined-filter", "status-workflow"],
    "delivery_targets": ["local-web"],
    "preferred_stack": ["node", "sqlite"],
    "constraints": {
      "offline_capable": true,
      "license_allow": ["MIT", "Apache-2.0", "BSD-3-Clause"],
      "license_deny": ["AGPL-3.0"],
      "external_data_upload": false
    },
    "demo_journeys": ["create-order", "filter-order", "transition-status"]
  }
}
```

### 响应

```json
{
  "schema_version": "1.0",
  "query_id": "tiq_...",
  "status": "completed",
  "source_coverage": [],
  "candidates": [
    {
      "canonical_id": "github.com/org/repo",
      "type": "repository",
      "decision": "trial",
      "score": 82,
      "matched_requirements": ["REQ-WO-003", "REQ-WO-008"],
      "fixed_revision": "commit-sha",
      "license": "Apache-2.0",
      "evidence": [],
      "verification": {
        "clone": "passed",
        "build": "passed",
        "tests": "unknown",
        "demo": "passed"
      },
      "risks": [],
      "estimated_demo_saving_hours": 6
    }
  ],
  "recommendation": {
    "strategy": "reference-and-build",
    "summary": "复用状态机设计，业务 UI 与数据模型自行实现"
  }
}
```

完整响应保存到：

```text
work/runs/<run-id>/tech-intelligence/
├── query-profile.json
├── candidates.json
├── verification/
├── reference-bundle.json
└── decision.json
```

## 8. 接口选择

按阶段演进：

1. **CLI Adapter（MVP）**
   - `technology-explorer query --input profile.json --output result.json`
   - OneOPC 使用子进程、超时和退出码调用。
   - 优点：本地、简单、无需常驻端口。

2. **Local HTTP API**
   - 支持并行查询、进度事件、缓存和独立升级。
   - 只监听 `127.0.0.1`，使用随机会话 Token。

3. **MCP Facade**
   - 给 Trae Code、Codex、Claude Code、Copilot 等代理提供：
     - `search_technology`
     - `get_candidate_evidence`
     - `compare_candidates`
     - `get_reference_bundle`
   - MCP 是代理工具接口，不作为 OneOPC 控制平面的唯一可靠接口。

## 9. 配置策略

### 全局设置

```text
技术参考增强
  模式：智能启用（推荐） / 始终启用 / 关闭
  检索深度：快速 / 标准 / 深度
  最大等待：30s / 90s / 5min
  许可证策略：宽松 / 商业友好 / 自定义
  允许验证运行未知开源代码：关闭（默认）
```

### `smart` 自动触发条件

满足任一条件时运行：

- 需求包含成熟通用能力：工作流、富文本、图表、OCR、RAG、地图等。
- 目标是快速 Demo 或交付时间紧。
- 方案代理对关键技术置信度低。
- Technology Exploration 本地缓存存在高相关候选。

以下情况自动跳过：

- 纯业务 CRUD 且黄金模板已经覆盖。
- 需求明确禁止第三方依赖。
- 高敏数据场景且没有离线候选。
- 预计检索收益低于调用和验证成本。

每个 Delivery Run 可临时切换模式，但不要求普通用户配置 API Key。Technology Exploration 已有的数据源按自身健康状态自动降级。

## 10. OneOPC UI

### 全局视图

在“方案设计”阶段下增加一张可折叠卡，而不是增加主阶段：

```text
技术参考（可选）
状态：已完成 / 已跳过 / 超时 / 不可用
发现 18 个 → 验证 3 个 → 建议采用 1 个
[查看候选] [查看采用影响]
```

### 详细视图

新增 `技术参考` 标签：

- 需求检索画像。
- 数据源状态和检索耗时。
- 候选漏斗：召回、过滤、验证、建议。
- 候选对比：匹配、许可证、安全、维护、构建、Demo。
- `adopt/trial/reference/reject` 决策及理由。
- 哪些设计、任务和代码引用了该候选。

### 完成页

交付报告增加：

- 使用了哪些开源项目和固定版本。
- 哪些内容仅参考、哪些作为依赖。
- 许可证与 NOTICE。
- 技术参考节省时间的估计与实际结果。

普通用户只看结论；开发者视角可展开所有证据。

## 11. 双向赋能闭环

### Technology Exploration → OneOPC

- 提供热点发现、候选仓库、官方来源和社区采用信号。
- 为方案代理减少盲搜和过时知识。
- 为 Demo 提供近期可运行的实现线索。

### OneOPC → Technology Exploration

OneOPC 回传本地、脱敏的效果信号：

- 候选被采用、参考或拒绝。
- Clone/Build/Test/Demo 成功率。
- 实际集成耗时和节省时间。
- 最终测试、漏洞和用户验收结果。
- 固定版本后是否发生升级或替换。

这些信号形成私有 `Implementation Evidence Registry`，用于个性化重排。禁止回传原始需求正文、源码、凭证和个人数据。

长期排名由三类信号组成：

```text
公共趋势信号 + 工程健康信号 + 本地真实采用结果
```

这比单纯的 GitHub Stars 或社交热度更接近“对当前用户能否快速做出可靠 Demo”。

## 12. 安全与治理

- 外部内容均视为不可信数据，不能成为系统提示或执行命令。
- 搜索摘要与 README 中的指令必须经过内容边界隔离。
- Clone 和构建默认不执行；启用后只能在一次性沙箱运行。
- 不把 OneOPC Token、生产凭证或用户目录挂载给候选代码。
- 许可证未知时失败关闭，不自动复制代码。
- 所有外部 URL、Commit、摘要和评分记录采集时间与来源。
- 采用的代码必须进入正常测试、安全扫描和交付证据链。

## 13. 分阶段落地

### Phase A：缓存顾问，1-2 天

- 从最新 Technology Exploration JSON 读取候选。
- 增加 `TechQueryProfile`、本地 FTS 查询和非阻塞 Adapter。
- OneOPC 展示“可选技术参考”卡和事件。
- 只输出 `reference`，不自动 Clone 或采用。

验收：关闭、无报告、报告损坏、超时均不影响主流程。

### Phase B：定向搜索与工程评分，3-5 天

- 抽离采集器为可复用 core。
- 增加 GitHub 定向仓库/代码查询。
- 增加许可证、Release、维护活跃、deps.dev/OSV、Scorecard。
- 输出候选对比和 `trial/reference/reject`。

验收：每个结论都有来源、时间和可复查证据。

### Phase C：沙箱 Spike 与参考包，5-8 天

- 对 Top 3 固定 Commit 并在隔离环境 Build/Test/Demo。
- 生成 `reference-bundle.json` 给方案与编码代理。
- 记录采用决策和 ADR。

验收：未经验证的仓库不能成为自动依赖。

### Phase D：效果学习与 MCP

- 建立 Implementation Evidence Registry。
- 基于历史交付效果个性化重排。
- 提供 MCP facade 给不同 Code 工具。
- 对候选版本漂移、漏洞和废弃状态持续提醒。

## 14. 推荐首版决策

首版采用：

- 默认模式 `smart`。
- 90 秒软超时。
- 优先读取最近 7 天本地报告，再定向查询 GitHub。
- 只允许 MIT、Apache-2.0、BSD-2/3-Clause 自动进入 `trial`。
- 不自动执行未知仓库代码。
- Top 5 对比，最多向方案代理提供 3 个候选。
- 技术情报失败不阻塞交付。
- 所有采用行为必须由方案代理生成 ADR，并由确定性测试证明。

不建议首版采用：

- 把每日 Top 10 直接注入编码提示。
- 仅按 Stars、热度或模型主观判断自动选型。
- 自动 Clone 并运行任意热门仓库。
- 让 Technology Exploration 直接修改 OneOPC 交付代码。
- 为此立即引入独立向量数据库或复杂多代理系统。

## 15. 业界依据

- GitHub Search 支持限定符和语义/混合检索，适合作为定向召回通道，但存在速率和范围限制。
- Sourcegraph Search Contexts 说明“先限定可信仓库集合，再搜索”比全局无边界检索更可控。
- Backstage Tech Radar 使用 Adopt/Trial/Assess/Hold 表达组织级技术建议，适合借鉴其“建议而非强制”的治理思路。
- deps.dev 提供包版本、许可证、依赖图和安全通告，适合候选工程复核。
- OpenSSF Scorecard 从源代码、构建、依赖、测试和维护等方面评估开源供应链实践。
- GitHub Copilot 的 Custom Agent + MCP 模式证明了“专门顾问、受限工具、独立上下文、事件回传”适合接入外部知识源。

参考：

- https://docs.github.com/en/rest/search/search
- https://sourcegraph.com/docs/code-search/working/search-contexts
- https://github.com/backstage/community-plugins/tree/main/workspaces/tech-radar
- https://docs.deps.dev/api/v3/
- https://securityscorecards.dev/
- https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents
