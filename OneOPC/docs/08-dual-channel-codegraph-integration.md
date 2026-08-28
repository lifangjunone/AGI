# Technology Exploration 双通道与 CodeGraph 图谱增强方案

## 1. 目标

OneOPC 的可选“技术参考”能力增加两种使用方式：

1. **Computer Use（默认）**
   - 面向领导和演示。
   - 自动打开 Technology Exploration。
   - 真实展示需求输入、分析深度、开始匹配、进度和候选结果。

2. **Provider API**
   - 面向研发、批处理和无人值守。
   - 通过本机结构化接口直接提交任务和读取结果。

当匹配到 GitHub 项目后，可选择使用
[`colbymchenry/codegraph`](https://github.com/colbymchenry/codegraph)
生成本地代码知识图谱，验证需求与项目真实代码结构的匹配程度，并在 OneOPC 中展示交互式“需求到代码”图谱。

技术参考仍是非必须支线。任何通道或 CodeGraph 失败，都不能阻断主交付流程。

## 2. 当前基础

### Technology Exploration 已具备

- 本机 Provider：`http://127.0.0.1:43128`
- `GET /v1/health`
- `GET /v1/capabilities`
- `POST /v1/advisories`
- 查询、事件和取消接口
- `provider_api`、`computer_use` 两种 Transport 声明
- `recommend`、`verify`、`code_graph` 三种深度
- 文件任务协议：

```text
~/Library/Application Support/Technology Exploration Agent/jobs/{jobId}/
├── request.json
├── progress.json
├── result.json
├── events.jsonl
└── cancel.json
```

- 原生“需求匹配”工作台。
- 稳定 Accessibility Identifier：

```text
technology.match.mode
technology.match.requirement
technology.match.domain
technology.match.depth
technology.match.start
technology.match.progress
technology.match.results
technology.match.completed
```

本机 Provider 健康检查已通过。

### CodeGraph 已具备

- 本机已安装 `codegraph 1.5.0`。
- MIT License。
- 本地 SQLite 索引，代码不上传。
- 支持多语言符号、依赖、调用、路由与影响范围分析。
- 提供 CLI JSON 输出和 MCP 接口。

### 可复用实现

`delivery-pilot` 已有实验性的：

- Technology Exploration 双通道路由。
- macOS Accessibility Sidecar。
- Provider 健康检查和降级。
- CodeGraph 隔离克隆、索引、查询和证据生成。

OneOPC 应迁移其稳定逻辑和协议，不应运行时依赖另一个桌面 App 的源码目录。

## 3. 核心架构

```text
OneOPC Delivery Run
        |
        v
RequirementProfile
        |
        v
TechnologyAdvisoryRouter
   |                         |
   | Computer Use            | Provider API
   v                         v
AX Automation         http://127.0.0.1:43128
   |                         |
   +------------+------------+
                |
                v
Technology Exploration Job
request / progress / events / result
                |
                v
Candidate Policy Gate
license / archived / relevance / repository URL
                |
                v
CodeGraph Adapter（可选）
clone → pin commit → index → query → graph evidence
                |
                v
OneOPC Graph Projection
领导图 / 技术图 / Demo 蓝图
```

### 关键边界

- Technology Exploration 拥有候选发现和初始评分。
- OneOPC 拥有任务路由、策略门禁、CodeGraph 验证、图谱展示和最终采用决策。
- CodeGraph 是静态代码证据引擎，不是数据源，也不直接决定是否采用。
- Cytoscape.js 是 OneOPC 的可视化层，不读取 CodeGraph 私有 SQLite Schema。

## 4. 双通道必须同构

Computer Use 与 Provider API 只是控制方式不同，业务语义必须完全一致。

共同使用：

- 同一个 `RequirementProfile`
- 同一个 `jobId`
- 同一个 `request.json`
- 同一个 Technology Exploration 匹配引擎
- 同一个 `result.json`
- 同一个评分模型版本
- 同一个 CodeGraph 后处理

禁止：

- Computer Use 通过截图 OCR 拼装最终结果。
- Provider API 使用另一套搜索或评分逻辑。
- 两种方式对同一请求生成不可比较的 Schema。

## 5. OneOPC 页面配置

在当前 `TECH REFERENCE` 区域升级为：

```text
技术参考                         [启用]

使用方式
┌─────────────────────────┐  ┌─────────────────────────┐
│ 可视化操作              │  │ Provider API            │
│ 默认 · 真实打开应用     │  │ 后台 · 稳定无人值守     │
└─────────────────────────┘  └─────────────────────────┘

分析深度
[快速建议] [工程验证] [代码图谱]
```

### 默认值

```json
{
  "enabled": true,
  "transport": "computer_use",
  "fallbackTransport": "provider_api",
  "depth": "recommend",
  "failurePolicy": "continue_without_reference"
}
```

为了保持“技术参考非必须”，全局可以关闭。用户开启后，默认通道必须是 Computer Use。

### 配置优先级

```text
单次 Delivery Run > 项目设置 > 全局默认
```

历史版本保存当时的配置，不随全局设置变化。

## 6. Computer Use 流程

### 执行

```text
1. OneOPC 生成脱敏 RequirementProfile。
2. 写入 Technology Exploration jobs/{jobId}/request.json。
3. 检查辅助功能权限和屏幕解锁状态。
4. 打开 com.local.technology-exploration。
5. AX 点击“需求匹配”。
6. 确认需求摘要、领域和深度已加载。
7. AX 点击“开始匹配”。
8. 监听 AX 进度，同时轮询 progress.json。
9. UI 展示候选表。
10. 校验 result.json 后导入 OneOPC。
```

### 领导可见性

OneOPC 显示一个“外部执行现场”区域：

```text
Technology Exploration · Computer Use
应用已打开 → 已加载需求 → 正在搜索 GitHub → 正在评分 → 已完成

[聚焦应用] [查看实时证据]
```

可选增加 1 FPS 的目标窗口缩略图，但必须：

- 明确请求 Screen Recording 权限。
- 只截取 Technology Exploration 窗口。
- 不把截图作为结果真值。
- 不持久化无关桌面内容。

第一版只提供“聚焦应用”和 AX 事件轨迹，避免引入额外屏幕录制权限。

### 成功条件

必须同时满足：

- AX 可识别关键控件。
- `progress.json.completed == true`
- `result.json.jobId == 当前 jobId`
- 结果通过 Schema 校验。

### 降级

```text
Computer Use
  ├─ 成功：actualTransport=computer_use
  ├─ 辅助功能缺失：显式降级 Provider API
  ├─ 屏幕锁定或应用不可访问：显式降级 Provider API
  ├─ AX 控件变化：显式降级 Provider API
  └─ Provider 也失败：跳过技术参考，主流程继续
```

禁止静默降级。全局视图必须显示：

```text
请求方式：Computer Use
实际方式：Provider API
原因：辅助功能权限不可用
```

## 7. Provider API 流程

### Provider Adapter

```text
health()
capabilities()
start(profile, options)
status(jobId)
events(jobId)
result(jobId)
cancel(jobId)
```

### 启动策略

1. 请求 `/v1/health`。
2. 未在线时后台启动 Technology Exploration App。
3. 等待 Provider 就绪。
4. `POST /v1/advisories`。
5. 轮询状态并增量导入事件。
6. 完成后复制任务制品到 OneOPC Run。

### 安全

- 只允许 `127.0.0.1:43128`。
- 不允许用户输入任意 Provider URL。
- 请求不包含原始需求文件。
- 只发送结构化摘要、能力、约束和需求编号。
- Provider 结果仍视为外部不可信数据，必须 Schema 校验。

## 8. 统一数据契约

### 请求

```json
{
  "schemaVersion": "1.0",
  "jobId": "oneopc-OP-...",
  "requirementProfile": {
    "businessDomain": "设备运维",
    "summary": "设备检修工单、审批流、状态流转和查询",
    "capabilities": [
      {"id": "REQ-WO-001", "name": "创建工单"},
      {"id": "REQ-WO-004", "name": "状态流转"}
    ],
    "constraints": {
      "forbiddenLicenses": ["AGPL-3.0"],
      "externalDataUpload": false,
      "demoTimeBudgetMinutes": 30
    }
  },
  "depth": "code_graph",
  "maxCandidates": 8
}
```

Technology Exploration 当前能力字段是字符串数组。实施时 Schema 1.1 可增加带 ID 的能力对象，同时兼容 1.0。

### OneOPC 归档

```text
work/runs/{runId}/tech-intelligence/
├── config.json
├── request.json
├── progress.json
├── events.jsonl
├── provider-result.json
├── transport-evidence.json
├── candidates.json
├── graph-progress.json
├── graph-evidence.json
└── demo-blueprint.json
```

## 9. CodeGraph 的正确角色

CodeGraph 不能回答“这个项目是否适合业务”的全部问题。它擅长回答：

- 与能力词相关的代码符号是否真实存在。
- 功能是否有完整入口、服务和数据调用链。
- 模块是否高度耦合。
- 二次开发可能影响哪些区域。
- 哪些文件和符号可作为 Demo 起点。

它不负责：

- License 判断。
- 漏洞和供应链风险。
- 社区维护健康。
- 仓库是否真的能安装运行。
- 产品交互是否满足业务。

因此必须组合：

```text
Technology Exploration：发现与趋势
GitHub/OSV/OpenSSF：工程健康与安全
CodeGraph：代码结构证据
沙箱验证：可构建与可运行
```

## 10. CodeGraph 执行门槛

只对 Top 1-3 GitHub 候选运行。

必须满足：

- URL 与 Clone URL 均为 `https://github.com/`。
- License 已识别且未被策略阻断。
- 仓库未归档。
- 候选初始匹配分达到阈值，例如 65。
- 仓库规模不超过本次资源预算。
- 用户选择“代码图谱”，或 Smart 策略判定值得验证。

## 11. CodeGraph 沙箱

```text
work/runs/{runId}/sandbox/codegraph/{owner-repo}/
├── repository/             # 浅克隆并固定 Commit
├── .codegraph/             # 本地索引
├── queries/
│   ├── status.json
│   ├── files.json
│   ├── capability-*.json
│   ├── callers-*.json
│   ├── callees-*.json
│   └── impact-*.json
└── graph-evidence.json
```

执行原则：

- 固定 CodeGraph 版本和二进制 SHA-256。
- `git clone --depth 1 --filter=blob:none`。
- 固定 Commit SHA。
- 第一阶段只做静态索引，不执行候选仓库代码。
- 不读取 CodeGraph 私有数据库结构。
- 通过 CLI JSON Adapter 隔离版本差异。

## 12. 从代码图转成需求图

CodeGraph 产生的是代码结构。OneOPC 需要额外构建“语义覆盖层”：

```text
Requirement
    |
  REQUIRES
    v
Capability
    |
 SATISFIED_BY
    v
Repository
    |
IMPLEMENTED_IN
    v
Route / Module / Symbol / DataEntity
    |
VERIFIED_BY / IMPACTS / BLOCKED_BY
    v
Test / RuntimeEvidence / Risk
```

节点类型：

- `Requirement`
- `Capability`
- `Repository`
- `Module`
- `Route`
- `Symbol`
- `DataEntity`
- `Test`
- `Risk`

每条需求覆盖边必须带：

```json
{
  "from": "REQ-WO-004",
  "to": "symbol:WorkOrderService.transition",
  "type": "IMPLEMENTED_IN",
  "confidence": 0.84,
  "evidence": {
    "repository": "org/repo",
    "commit": "sha",
    "command": "codegraph query ... --json",
    "file": "src/work-order/service.ts",
    "lineRange": [42, 88]
  }
}
```

## 13. 匹配评分升级

保留两个分数：

### 发现匹配分

来自需求关键词、仓库元数据、趋势和许可证：

```text
Discovery Fit = 0-100
```

### 代码验证分

来自 CodeGraph 与工程证据：

| 维度 | 权重 |
|---|---:|
| 需求能力代码覆盖 | 25 |
| 核心业务路径完整性 | 15 |
| 架构与扩展点适配 | 15 |
| Demo 入口可达性 | 10 |
| 集成改造影响范围 | 10 |
| 维护、安全和许可证 | 20 |
| 趋势信号 | 5 |

```text
Verified Fit = 0-100
```

图谱不能只“加分”，也必须能降分：

```text
发现匹配 82 → 代码验证 63

下降原因：
- 只有基础 CRUD，没有审批流调用链。
- 权限模块与核心业务强耦合。
- 状态流转没有自动化测试。
```

这比单纯展示 Stars 更有决策价值。

## 14. 图谱 UI

建议 OneOPC 使用 Cytoscape.js。其适合交互式节点/边、复合节点、路径高亮和多种布局，并采用 MIT License。[^cytoscape]

### 领导视角

目标不是展示整个仓库，而是展示 20-50 个“需求相关聚合节点”。

```text
┌──────────────┬────────────────────────────────────┬──────────────┐
│ 候选与指标   │ 需求 → 能力 → 模块 → 证据         │ 结论与风险   │
│              │                                    │              │
│ 候选 A 78    │ REQ-01 ─→ 工单 ─→ WorkOrder       │ 覆盖 7/9     │
│ 候选 B 61    │ REQ-04 ─→ 审批 ─╳ 缺失            │ 风险 2       │
│              │ REQ-06 ─→ 查询 ─→ SearchService   │ 节省 3.5h    │
└──────────────┴────────────────────────────────────┴──────────────┘
```

交互：

- 点击需求，高亮覆盖它的模块和证据。
- 在候选 A/B 间切换比较。
- 深度切换：`业务 / 架构 / 代码`。
- 播放“需求流入代码”的路径动画。
- 红色断点表示能力缺失或高风险。
- 顶部显示发现分到验证分的变化。

指标：

- 需求覆盖数。
- 完整业务路径数。
- 可复用模块数。
- 高风险断点。
- 预计 Demo 节省时间。

### 开发者视角

- 展开到文件、类、函数和路由。
- 查看 callers、callees、impact。
- 查看固定 Commit。
- 查看 CodeGraph 原始命令和 JSON 证据。
- 从节点定位到 GitHub 文件或本地沙箱。
- 导出 JSON、PNG、SVG。

### 防止“毛线球”

- 默认只查询与需求能力相关的子图。
- 每个能力最多保留 3-5 个高置信符号。
- 使用聚合模块节点隐藏低层细节。
- 点击后按需展开。
- 领导视角使用从左到右的层次布局。
- 技术视角才允许力导向和完整关系探索。

## 15. Demo 蓝图

图谱验证后生成：

```json
{
  "candidate": {
    "repository": "org/repo",
    "commit": "sha"
  },
  "reusableModules": [],
  "coveredRequirements": [],
  "missingRequirements": [],
  "entryRoutes": [],
  "coreCallPaths": [],
  "expectedChanges": [],
  "impactRadius": [],
  "risks": [],
  "estimatedSavingHours": 3.5
}
```

只有满足以下条件才能进入 Code 工具上下文：

- `licenseBlocked == false`
- CodeGraph 证据完整
- `Verified Fit` 达到阈值
- 用户点击“采用并生成 Demo”，或无人值守策略明确允许

否则只能作为阅读参考。

## 16. 历史版本

每个 OneOPC 版本必须固定：

- 请求方式与实际方式。
- Technology Exploration 结果快照。
- 候选仓库 Commit。
- CodeGraph 版本。
- 图谱节点和边。
- 发现分与验证分。
- 最终采用或拒绝决定。

重新打开 V1 时必须看到 V1 当时的图谱，不能自动切换到仓库最新代码。

## 17. 实施顺序

### Phase 1：OneOPC 双通道路由

- 增加使用方式页面和默认 Computer Use。
- 接入现有 Provider API。
- 迁移 AX Sidecar 的通用 `focus/snapshot/press/select/value` 能力。
- 两条通道使用同一个 Job 和 Result。
- 显示 requested/actual/fallback。

### Phase 2：Computer Use 产品化

- 通过 AX Identifier 操作原生需求匹配工作台。
- 增加辅助功能预检。
- 增加“聚焦 Technology Exploration”。
- 显示真实 AX 操作轨迹和结构化进度。
- 做 10 次连续稳定性测试。

### Phase 3：CodeGraph Adapter

- 固定并检测 CodeGraph 版本。
- 策略门禁、隔离克隆和固定 Commit。
- 查询能力、调用链和影响范围。
- 生成 `graph-evidence.json`。
- 不执行候选代码。

### Phase 4：交互式图谱

- 接入 Cytoscape.js。
- 领导/开发者双视图。
- 子图抽取、路径动画、风险断点和候选比较。
- 导出图像和证据。

### Phase 5：Demo 加速闭环

- 生成 Demo 蓝图。
- 把验证过的模块与入口交给 Code 工具。
- 记录实际节省时间和最终验收结果。
- 反向优化 Technology Exploration 排名。

## 18. 验收标准

- 页面可以选择 Computer Use 或 Provider API。
- 默认使用 Computer Use。
- Computer Use 真实打开并操作 Technology Exploration。
- 两通道对同一个 Job 产生同 Schema 结果。
- Computer Use 失败时明确显示降级原因。
- 技术参考整体失败不影响主交付。
- CodeGraph 只处理通过门禁的 GitHub 仓库。
- 图谱每条覆盖边都能追溯到 Commit、文件、符号和命令。
- 领导视角默认不超过 50 个聚合节点。
- 同时展示 Discovery Fit 与 Verified Fit。
- 历史版本保留当时图谱和证据。

## 19. 推荐决策

推荐立即实施 Phase 1 和 Phase 2，因为基础能力已经存在：

- Provider 服务在线。
- 原生 AX 控件已具备稳定 Identifier。
- macOS Sidecar 已有可复用实现。

CodeGraph 先实施“静态证据层”，不要立即运行候选仓库：

- 当前本机已有 1.5.0。
- 工具适合本地结构查询。
- 但其 README 自述基准不能替代 OneOPC 自己的准确性验证。
- 先对 3 个已知仓库建立金标用例，再决定 Verified Fit 阈值。

图谱展示使用 OneOPC 自己的 Cytoscape.js 投影，不嵌入 CodeGraph UI，也不读取其私有数据库。

[^cytoscape]: [Cytoscape.js 官方文档](https://js.cytoscape.org/)说明其支持交互式图、复合节点、图遍历、布局和图像导出。

## 20. 参考

- [CodeGraph](https://github.com/colbymchenry/codegraph)
- [CodeGraph MIT License](https://github.com/colbymchenry/codegraph/blob/main/LICENSE)
- [Cytoscape.js](https://js.cytoscape.org/)
- [Technology Exploration 融合基础方案](./07-optional-tech-intelligence-integration.md)
