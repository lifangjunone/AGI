# Technology Exploration 双通道与 CodeGraph 图谱融合方案

## 1. 设计目标

在 DeliveryPilot 的可选“技术参考”能力中，同时支持两种 Technology Exploration 使用方式：

1. **Computer Use（默认）**：面向领导演示，真实打开并操作 Technology Exploration，过程可见。
2. **Provider API**：面向研发自动化，使用稳定的结构化接口。

当候选为 GitHub 开源项目时，可选使用
[`colbymchenry/codegraph`](https://github.com/colbymchenry/codegraph)
建立本地代码知识图谱，以更高维度验证项目与需求的匹配关系，并在 DeliveryPilot 中展示交互式图谱。

技术参考仍为非必须能力。关闭或失败时，原交付流程不受影响。

## 2. 核心原则

### 双通道，同一语义

Computer Use 和 Provider API 只是不同控制通道，不能产生两套业务逻辑。

二者必须使用相同：

- `RequirementProfile`
- 搜索与评分引擎
- 候选实体模型
- 结果 Manifest
- CodeGraph 验证器
- 证据与决策格式

### 可见控制，结构化取数

Computer Use 负责：

- 打开应用。
- 输入需求摘要。
- 选择数据源和分析深度。
- 点击开始。
- 观察采集、匹配、验证和完成状态。

结果不能依赖截图、OCR 或界面文本抓取。Technology Exploration 完成后必须写入结构化 JSON；DeliveryPilot 通过任务 ID 读取该文件。

### 图谱是证据，不是装饰

CodeGraph 图中每个节点和边都必须能追溯到：

- 需求编号。
- 仓库固定 Commit。
- 文件与符号。
- CodeGraph 查询命令和结果。
- 匹配解释。

## 3. 页面使用方式

在 DeliveryPilot 的“新建任务”和“技术参考设置”中增加：

```text
使用技术参考      [开关]

使用方式
[ 可视化操作（默认） ] [ Provider API ]

分析深度
[ 快速建议 ] [ 工程验证 ] [ 代码图谱 ]
```

### 可视化操作

副标题：

> 打开 Technology Exploration 展示真实分析过程，适合演示与决策查看。

要求：

- macOS 辅助功能权限。
- 已安装/配置 Technology Exploration。
- 屏幕解锁。

### Provider API

副标题：

> 使用结构化接口后台执行，适合无人值守、批量任务和系统集成。

要求：

- Provider 健康检查通过。
- 不要求应用窗口可见。

### 任务级覆盖

配置优先级：

```text
单次任务配置 > 项目配置 > 全局默认
```

全局默认：

```json
{
  "technologyReference": {
    "enabled": false,
    "transport": "computer_use",
    "depth": "recommend",
    "fallbackTransport": "provider_api",
    "failurePolicy": "continue_without_reference"
  }
}
```

技术参考默认关闭；用户开启后，默认使用 Computer Use。

## 4. Technology Exploration 必要改造

当前 Native Shell 的 WKWebView 内容不能被现有 Accessibility sidecar 完整读取；快照只能稳定识别“刷新、设置、报告目录”。因此需要新增原生、辅助功能可访问的工作台。

### 原生“需求匹配”工作台

顶部模式增加：

```text
热点看板 | AI 技术雷达 | 需求匹配
```

“需求匹配”页面至少提供：

- `NSTextField`：需求摘要。
- `NSPopUpButton`：业务领域。
- `NSPopUpButton`：快速建议 / 工程验证 / 代码图谱。
- `NSButton`：开始匹配。
- `NSProgressIndicator`：真实阶段进度。
- `NSTableView`：候选项目、匹配分和状态。
- `NSTextField`：结果摘要与输出路径。

所有控件设置稳定的 Accessibility Identifier：

```text
technology.match.requirement
technology.match.domain
technology.match.depth
technology.match.start
technology.match.progress
technology.match.results
technology.match.completed
```

### 文件握手协议

DeliveryPilot 先写入：

```text
~/Library/Application Support/Technology Exploration Agent/jobs/{jobId}/request.json
```

Technology Exploration 执行时持续写入：

```text
jobs/{jobId}/progress.json
jobs/{jobId}/result.json
jobs/{jobId}/events.jsonl
```

请求示例：

```json
{
  "schemaVersion": "1.0",
  "jobId": "uuid",
  "requirementProfile": {
    "businessDomain": "设备运维",
    "capabilities": ["工单创建", "审批流", "状态流转", "知识库"],
    "constraints": {
      "forbiddenLicenses": ["AGPL-3.0"],
      "demoTimeBudgetMinutes": 30
    }
  },
  "depth": "code_graph",
  "maxCandidates": 8,
  "requestedAt": "ISO-8601"
}
```

这保证 Computer Use 只负责触发和展示，结构化数据不会因 UI 变化丢失。

## 5. Computer Use 执行流程

```text
1. DeliveryPilot 写入 request.json
2. open -b com.local.technology-exploration
3. Accessibility 聚焦“需求匹配”
4. 输入需求摘要
5. 选择领域和分析深度
6. 点击“开始匹配”
7. 通过 AX 状态 + progress.json 双重观察
8. 界面显示候选与进度
9. result.json 完整且 completed=true
10. DeliveryPilot 导入结果
```

### 成功判定

必须同时满足：

- UI 显示任务已完成。
- `progress.json.completed == true`。
- `result.json.jobId` 与当前任务一致。
- 结果通过 JSON Schema 校验。

### 防脆弱设计

- 优先使用 Accessibility Identifier，不依赖坐标。
- 坐标只能作为明确记录的最后兜底。
- UI 改版时 Provider 契约和结果文件不变。
- Computer Use 超时后可自动切换 Provider API，但 UI 必须明确显示“已降级”。

## 6. Provider API

Technology Exploration 提供独立本机服务：

```text
GET  /v1/health
GET  /v1/capabilities
POST /v1/advisories
GET  /v1/advisories/{jobId}
GET  /v1/advisories/{jobId}/events
POST /v1/advisories/{jobId}/cancel
```

`POST /v1/advisories` 与 `request.json` 使用同一 Schema。

响应：

```json
{
  "jobId": "uuid",
  "state": "queued",
  "links": {
    "status": "/v1/advisories/uuid",
    "events": "/v1/advisories/uuid/events"
  }
}
```

Provider 只监听 `127.0.0.1`，第三方远程 Provider 继续通过 DeliveryPilot 的数据源适配器接入。

## 7. 双通道路由

DeliveryPilot 定义：

```text
TechnologyAdvisoryProvider
├── ComputerUseProvider
├── LocalHttpProvider
└── ThirdPartyProvider
```

统一方法：

```text
health()
capabilities()
start(requirementProfile, options)
status(jobId)
events(jobId)
result(jobId)
cancel(jobId)
```

降级顺序：

```text
Computer Use
  ├─ 成功 → 导入结果
  ├─ 应用不可用/屏幕锁定 → Provider API
  ├─ API 也不可用 → 读取最新允许时效内快照
  └─ 无可信结果 → 跳过技术参考，继续独立开发
```

默认不得静默降级。任务轨迹要显示实际使用的通道。

## 8. CodeGraph 的角色

CodeGraph 是**代码结构验证引擎**，不是数据源，也不是最终可视化 UI。

已确认能力：

- 本地 `.codegraph/codegraph.db`，代码不上传。
- 支持 20+ 语言以及多种 Web 路由框架。
- 提供符号、调用、导入、继承、路由和影响范围关系。
- CLI 支持 `query/files/callers/callees/impact/affected --json`。
- MCP 提供 `codegraph_explore`。
- MIT License。

约束：

- 项目较新，不能仅凭 Stars 认定成熟。
- 首次索引大型仓库可能耗时明显。
- `explore` 返回的是适合 Agent 的稠密上下文，不应直接当领导图谱。
- 不直接读取其 SQLite 私有 Schema，避免版本耦合。

## 9. CodeGraph 执行沙箱

只对通过第一轮筛选的 Top 1-3 GitHub 仓库执行。

```text
.sandbox/technology-poc/{candidateId}/
├── repository/          # 固定 Commit 的浅克隆
├── .codegraph/          # CodeGraph 本地索引
├── queries/             # 查询输入与 JSON 输出
├── runtime/             # 启动日志和健康检查
└── graph-evidence.json
```

执行：

```text
git clone --filter=blob:none
git checkout {commitSha}
codegraph init repository
codegraph status repository
codegraph files repository --json
codegraph query "{capability terms}" --json
codegraph callers "{symbol}" --json
codegraph callees "{symbol}" --json
codegraph impact "{symbol}" --depth 3 --json
```

禁止：

- 直接执行仓库安装脚本。
- 在未隔离环境运行未知代码。
- 将 `.codegraph` 混入最终产品源码或 Git。

## 10. 需求匹配图谱

### 图谱分层

```text
第一层：业务需求
REQ / BR / 角色 / 约束

第二层：方案能力
工单 / 审批 / 搜索 / 权限 / 通知

第三层：开源项目
候选仓库 / 组合组件 / 许可证 / 健康度

第四层：代码结构
模块 / 路由 / 服务 / 类 / 函数 / 数据模型

第五层：运行证据
启动命令 / 健康检查 / 测试 / 风险 / 影响范围
```

### 节点

```text
Requirement
Capability
Repository
Module
Route
Symbol
DataEntity
Test
Risk
```

### 边

```text
REQUIRES
SATISFIED_BY
IMPLEMENTED_IN
ROUTES_TO
CALLS
READS
WRITES
VERIFIED_BY
BLOCKED_BY
IMPACTS
```

### 证据模型

```json
{
  "edgeId": "edge-123",
  "from": "REQ-WO-001",
  "to": "symbol:WorkOrderService.create",
  "type": "IMPLEMENTED_IN",
  "confidence": 0.87,
  "evidence": [
    {
      "source": "codegraph",
      "command": "codegraph explore ...",
      "repository": "org/repo",
      "commit": "sha",
      "file": "src/work-orders/service.ts",
      "lineRange": [42, 88]
    }
  ]
}
```

## 11. 图谱如何影响匹配度

CodeGraph 不增加一个独立“炫酷分”。它为原有评分维度提供更强证据：

| 维度 | 权重 | CodeGraph 贡献 |
| --- | ---: | --- |
| 需求能力覆盖 | 25 | REQ → 模块/符号的可追溯覆盖 |
| 业务流程完整性 | 15 | 路由、服务、数据层调用链 |
| 架构与集成适配 | 15 | 模块边界、依赖方向、扩展点 |
| Demo 可实现性 | 15 | 入口、最短调用链、需修改范围 |
| 工程健康与安全 | 15 | 由 GitHub/OpenSSF/OSV 提供 |
| 文档与可运行性 | 10 | Quick Start、测试与健康检查 |
| 趋势信号 | 5 | Technology Exploration 提供 |

输出两个阶段分数：

- `discoveryFitScore`：未看代码前的需求匹配。
- `verifiedFitScore`：CodeGraph 和运行验证后的匹配。

同时展示变化：

```text
发现匹配 82 → 代码验证 68
下降原因：只有基础 CRUD，没有审批流实现；权限模块耦合较重。
```

## 12. 交互式图谱 UI

DeliveryPilot 自己渲染图谱，建议使用 Cytoscape.js；它适合节点/边交互、布局切换、聚焦路径和大图增量展示。

### 领导模式

默认只显示 20-50 个聚合节点：

- 左侧：需求能力。
- 中间：候选项目与核心模块。
- 右侧：实现证据、风险和 Demo 路径。

交互：

- 点击需求，高亮它被哪些代码能力覆盖。
- 滑动“业务 → 架构 → 代码”深度。
- 切换候选项目比较覆盖范围。
- 播放“需求流入代码”的动态路径。
- 红色断点表示缺失能力或高风险。

顶部指标：

```text
需求覆盖 7/9
核心流程 4 条
可复用模块 6 个
高风险断点 2 个
预计 Demo 节省 3.5 小时
```

### 技术模式

支持：

- 展开到文件、类和函数。
- 查看调用者、被调用者和影响范围。
- 查看 CodeGraph 原始命令与 JSON 证据。
- 固定 Commit 和文件行号。
- 导出 PNG/SVG/JSON。

### 视觉约束

- 默认不加载整个仓库图，防止“毛线球”。
- 基于需求路径做子图抽取。
- 节点颜色表达类型，边颜色表达证据状态。
- 动画只用于路径播放和验证进度，不持续扰动布局。

## 13. Demo 蓝图

图谱验证后生成：

```text
.delivery-pilot/technology-reference/demo-blueprint.json
```

包含：

- 采用的仓库和 Commit。
- 复用模块。
- 需求覆盖矩阵。
- 入口路由和核心调用链。
- 需要新增/替换的模块。
- 预计改动影响范围。
- 启动与健康检查方式。
- 不采用的部分及原因。

只有用户点击“采用并生成 Demo”，或满足无人值守 `auto_use_verified` 策略，该文件才进入 Trae Code 提示上下文。

## 14. UI 状态与轨迹

可选支线显示：

```text
技术参考（Computer Use）
打开应用 → 输入需求 → 聚合 914 条信号 → 候选 8
→ 工程验证 3 → 图谱完成 2 → 建议采用 1
```

每步提供：

- 当前实际应用与 PID。
- 数据源状态。
- AX 操作证据。
- Provider/文件结果。
- CodeGraph 索引统计。
- 图谱节点/边数。
- 耗时与降级原因。

## 15. 安全与治理

- CodeGraph 安装版本固定并校验 SHA-256。
- 候选仓库固定 Commit SHA。
- License、OpenSSF 和 OSV 在图谱前执行。
- 未知仓库代码只允许静态索引；运行验证进入受限沙箱。
- 原始需求不传给远程 Provider，只发送脱敏结构化摘要。
- 每次推荐保留数据源快照和评分模型版本。
- 历史项目继续使用当时的图谱，不随最新仓库变化。

## 16. 实施路线

### Phase 1：双通道同构

- Technology Exploration 增加需求匹配引擎和文件任务协议。
- 增加 Provider API。
- 增加原生 Accessibility 工作台。
- DeliveryPilot 增加使用方式选择，默认 Computer Use。

### Phase 2：可见 Computer Use 闭环

- Sidecar 增加 `technology_exploration` workflow。
- AX Identifier 定位、进度观察和完成校验。
- UI 展示真实操作轨迹与降级状态。

### Phase 3：CodeGraph 证据层

- 安装和版本管理 CodeGraph。
- 候选仓库隔离克隆与索引。
- 需求能力查询、调用链和影响范围抽取。
- 生成 `graph-evidence.json`。

### Phase 4：交互式领导图谱

- Cytoscape.js 需求子图。
- 领导/技术双视图。
- 路径动画、候选对比和风险断点。
- 导出图谱和 Demo 蓝图。

### Phase 5：反馈学习

- 记录采用/拒绝和 Demo 成功率。
- 从项目级经验形成组织级 Adopt / Trial / Assess / Hold。
- 建立按业务领域验证过的 Demo Golden Paths。

## 17. 验收标准

- 开启技术参考后默认显示 Computer Use。
- Computer Use 全程可见，并能从 AX 快照识别关键步骤。
- Provider API 与 Computer Use 对同一请求产生同 Schema 结果。
- Computer Use 失败可显式降级，不阻断主流程。
- 关闭技术参考时现有交付流程零变化。
- GitHub 候选只有通过策略后才运行 CodeGraph。
- 图谱每条需求覆盖边都有仓库、Commit、文件和符号证据。
- 图谱默认是需求相关子图，不是整个仓库毛线球。
- 同时展示发现匹配分和代码验证分及变化原因。
- 历史版本保留当时的图谱、决策和证据。
