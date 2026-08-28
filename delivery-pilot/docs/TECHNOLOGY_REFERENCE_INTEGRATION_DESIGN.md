# DeliveryPilot × Technology Exploration 技术参考融合方案

> 双通道使用方式、Computer Use 默认流程以及 CodeGraph 需求匹配图谱的扩展设计见
> [`DUAL_CHANNEL_CODEGRAPH_ADVISORY_DESIGN.md`](DUAL_CHANNEL_CODEGRAPH_ADVISORY_DESIGN.md)。

## 1. 目标

在需求分析完成后，按需利用 Technology Exploration 和其他技术数据源，为当前需求推荐可复用的开源实现、组件组合与架构参考，缩短 Demo 验证时间。

该能力必须满足：

- 默认不阻断原交付流程。
- 可按全局、项目和单次任务三级配置。
- 热度、需求匹配度、工程可信度分开呈现。
- 未验证的项目不能直接进入代码生成上下文。
- 数据源失败、超时或无结果时自动降级为独立开发。
- 原始需求、技术情报和研发过程资产物理隔离。

## 2. 当前能力与问题

### Technology Exploration

优势：

- 已聚合 GitHub Trending、Hugging Face、Hacker News、arXiv、Product Hunt、YouTube、X 和国内平台。
- 报告包含来源、时间、互动证据、热点分、原始链接及可选模型分析。
- 数据源独立失败，其他来源仍能继续生成报告。

不足：

- 当前核心是“每日热点”，不是面向任意业务需求的实现检索服务。
- 社交讨论、论文、模型和 GitHub 仓库混在同一候选空间。
- 报告条目可能在摘要中提到 GitHub 仓库，但没有提取为独立、可验证的仓库实体。
- 缺少许可证、安全、可启动性、技术栈和需求覆盖验证。

### DeliveryPilot 技术雷达

优势：

- 已有可插拔数据源、匹配、方案、趋势和架构 API。
- 已能读取 Technology Exploration 最新报告，且该来源默认关闭。

不足：

- 当前用需求文本关键词匹配日报标题与摘要。
- 当前方案生成简单选取前三名并分配固定角色，不能证明组件之间兼容。
- 工程健康度主要来自 Stars、Forks、Issues 和许可证是否存在，证据不足。
- 技术推荐尚未进入实际需求分析、方案设计和 Demo 验证流程。

## 3. 推荐流程

```text
需求输入
  ↓
需求分析
  ├─ traework-result.md
  └─ requirement-profile.json
  ↓
需求确认
  ↓
[可选] 技术参考
  1. 多源发现
  2. 仓库实体归一化
  3. 需求匹配与角色分类
  4. 许可证/安全/活跃度验证
  5. 可选沙箱启动与最小 PoC
  6. 形成实现方案与架构参考
  ↓
方案设计
  ├─ 独立开发
  ├─ 参考架构但不引入代码
  ├─ 复用单个开源项目
  └─ 组合多个兼容组件
  ↓
功能开发 → 质量验证 → 交付
```

“技术参考”在 UI 上显示为“可选增强”，不作为完成主流程的硬门禁。

## 4. 三种工作模式

| 模式 | 行为 | 是否影响代码 |
| --- | --- | --- |
| 关闭 | 完全跳过技术参考 | 否 |
| 智能建议（默认） | 检索、评分、生成方案和架构参考 | 否，除非用户明确采用 |
| 验证复用 | 对候选执行深度验证和最小 PoC | 通过策略后才可进入研发上下文 |

无人值守任务可配置采用策略：

- `reference_only`：只参考，不引入代码。
- `auto_use_verified`：仅自动采用验证通过且无高风险的候选。
- `independent_first`：默认独立开发，仅在复用收益明显时采用。

## 5. 结构化需求输入

Trae Work 除 Markdown 分析外，需要输出：

```json
{
  "businessDomain": "设备运维",
  "goals": ["缩短工单闭环时间"],
  "capabilities": ["工单创建", "审批流", "状态流转", "知识库"],
  "roles": ["检修人员", "审批人", "管理员"],
  "constraints": {
    "deployment": "本机 Demo",
    "preferredStack": [],
    "forbiddenLicenses": ["AGPL-3.0"],
    "dataSensitivity": "internal",
    "demoTimeBudgetMinutes": 30
  },
  "nonFunctionalRequirements": ["可追溯", "移动端适配"],
  "requirementIds": ["REQ-WO-001"]
}
```

文件位置：

```text
.delivery-pilot/requirement-profile.json
```

技术参考服务只读取该结构化摘要，不读取或上传原始需求文档。

## 6. 两条独立证据链

### 6.1 热点与趋势证据

由 Technology Exploration 提供：

- 最近 24/72 小时热度与增长速度。
- 多平台来源与交叉验证。
- 新发布、版本更新、社区讨论和学习价值。

该分数回答“现在是否值得关注”，不能直接回答“是否适合本项目”。

### 6.2 开源实现证据

由开源验证器提供：

- 需求能力覆盖。
- 技术栈与部署约束适配。
- README、Quick Start、Demo、测试和发布证据。
- License/SPDX 与企业策略。
- 最近提交、版本、贡献者和 Issue 响应。
- OpenSSF Scorecard、OSV 漏洞和供应链风险。
- 最小启动验证与 PoC 结果。

该分数回答“能否安全、快速地用于本次 Demo”。

## 7. 匹配与决策模型

不要把热度直接合并为一个黑盒总分。每个候选输出：

| 维度 | 权重 |
| --- | ---: |
| 功能需求覆盖 | 30 |
| Demo 交付速度 | 20 |
| 技术栈与集成适配 | 15 |
| 工程成熟度与维护性 | 10 |
| 许可证与供应链安全 | 15 |
| 文档、示例与可运行性 | 5 |
| 当前趋势信号 | 5 |

同时独立输出：

- `fitScore`：0-100，本项目适配度。
- `evidenceConfidence`：high / medium / low，证据完整度。
- `trendScore`：0-100，Technology Exploration 的趋势信号。
- `verdict`：直接复用 / 小范围试用 / 仅作参考 / 不建议。

硬规则：

- 未识别许可证：不能判定“直接复用”。
- 已归档或长期无人维护：最高只能“仅作参考”。
- 存在未处理高危漏洞：判定“不建议”。
- 没有 Quick Start 或无法启动：不能进入自动复用。
- 只有社交讨论、没有官方仓库：只作为趋势参考。

## 8. 方案生成

方案生成器先识别组件角色，再选择最小兼容集合，不能按分数简单取前三名。

角色示例：

- 业务应用骨架
- 工作流引擎
- 身份与权限
- 数据存储
- 搜索与知识库
- 可观测与交付

输出四种方案之一：

1. 独立开发：没有可信候选或引入成本高于收益。
2. 参考实现：借鉴领域模型、交互或架构，不复制代码。
3. 单项目复用：一个项目覆盖核心闭环。
4. 组合实现：多个组件职责明确，接口与许可证兼容。

每个方案必须包含：

- REQ → 开源能力覆盖矩阵。
- 采用/不采用理由。
- 固定版本或 Commit SHA。
- 适配层边界。
- Demo 启动命令与预计时间。
- 替换与退出策略。
- 架构节点和数据流。

## 9. Technology Exploration 的改造边界

Technology Exploration 保持独立应用，不并入 DeliveryPilot 仓库。

新增无界面 Provider API：

```text
GET  /v1/health
GET  /v1/capabilities
GET  /v1/snapshots/latest
POST /v1/search
POST /v1/entities/resolve
```

`POST /v1/search` 接收结构化需求和时间窗口，返回统一实体：

```json
{
  "entityType": "repository",
  "canonicalUrl": "https://github.com/org/repo",
  "title": "org/repo",
  "sourceSignals": [],
  "trendScore": 72,
  "summary": "...",
  "observedAt": "...",
  "provenance": []
}
```

内部建议使用 SQLite + FTS5 建立本地情报索引。第一阶段使用 BM25/关键词召回，模型只负责重排与解释；后续再将向量检索作为可选插件，避免一开始引入不必要复杂度。

## 10. DeliveryPilot 的改造边界

新增 `TechnologyAdvisoryService`，职责为：

1. 读取 `requirement-profile.json`。
2. 调用多个 Provider。
3. 归一化仓库、论文、模型、产品和讨论实体。
4. 对 Top N 仓库执行工程验证。
5. 形成候选、推荐方案和 Demo 蓝图。
6. 将被采用的结果以只读上下文传给 Trae Code。

独立 API：

```text
POST /api/v1/advisories/evaluate
GET  /api/v1/advisories/{taskId}
POST /api/v1/advisories/{taskId}/decision
GET  /api/v1/advisories/{taskId}/events
```

第三方 Provider 继续使用统一适配器，不允许业务编排直接依赖本地目录结构。

## 11. 产物与物理隔离

```text
版本目录/
├── .delivery-pilot/
│   ├── input/                         # 原始输入，仅原文
│   ├── requirement-profile.json
│   └── technology-reference/          # 研发过程资产
│       ├── manifest.json
│       ├── candidates.json
│       ├── recommendation.md
│       ├── demo-blueprint.json
│       ├── architecture.json
│       ├── decision.json
│       └── evidence/
└── .sandbox/
    └── technology-poc/                # 临时验证，不混入产品源码
```

只有 `decision.json` 中被明确采用的项目，才能进入 `.trae/specs/delivery/`。

## 12. UI 设计

### 新建任务

增加“技术参考”设置：

- 开关：使用技术参考。
- 模式：智能建议 / 验证复用。
- 来源：默认技术源、Technology Exploration、第三方源。
- 时间预算：快速 30 秒 / 标准 2 分钟 / 深度 5 分钟。

### 任务阶段

在“需求确认”和“方案设计”之间显示一条非阻塞支线：

```text
技术参考（可选）  发现 24 → 候选 6 → 已验证 3 → 建议采用 1
```

### 决策卡

每个候选展示：

- 匹配分、趋势分、证据可信度。
- 覆盖的 REQ。
- 许可证、安全和维护状态。
- Demo 预计节省时间。
- 查看来源、查看验证轨迹。

操作：

- 采用并生成 Demo。
- 仅参考架构。
- 忽略该项目。
- 独立开发。

## 13. 失败与降级

- Provider 不可用：记录失败来源，继续其他来源。
- Technology Exploration 报告过期：标记“历史快照”，不冒充实时。
- 没有匹配项目：选择独立开发，不算任务失败。
- 深度验证超时：返回已完成部分并标记低可信度。
- 候选启动失败：降级为参考实现，不进入代码上下文。
- 所有技术参考失败：原 DeliveryPilot 流程原样继续。

## 14. 两个项目的反馈闭环

DeliveryPilot 向 Technology Exploration 回传匿名结果，不回传客户原文：

- 候选被采用、拒绝或仅参考。
- PoC 是否启动成功。
- 实际节省时间。
- 许可证或安全拒绝原因。
- 最终覆盖的能力标签。

Technology Exploration 用这些反馈改进排序，使“热门”逐步转化为“对真实交付有用”。

## 15. 分期实施

### Phase 1：可选建议闭环

- 输出 `requirement-profile.json`。
- Technology Exploration 增加本地查询 API。
- 候选实体归一化与需求覆盖评分。
- 生成推荐报告，不影响代码生成。

### Phase 2：可信开源验证

- 接入 GitHub Repo 元数据、OpenSSF Scorecard 和 OSV。
- License 策略、维护状态和证据可信度。
- UI 决策卡和版本级决策记录。

### Phase 3：Demo 加速

- 隔离克隆候选。
- 自动识别 Quick Start。
- 沙箱安装、启动、健康检查和截图。
- 生成可执行 Demo 蓝图，选择后传给 Trae Code。

### Phase 4：学习型技术资产

- 记录采用与 PoC 结果。
- 建立组织级 Adopt / Trial / Assess / Hold 技术雷达。
- 按业务领域形成经过验证的 Demo Golden Paths。

## 16. 验收标准

- 关闭技术参考时，现有端到端交付结果和耗时不受影响。
- 任一数据源失败不会阻断任务。
- 每个推荐都能追溯到需求、来源和验证证据。
- 热点分与项目适配分分开显示。
- 未验证候选不会自动影响实现。
- 能解释为什么选择独立开发、单项目或组合方案。
- 历史版本保留当时的候选、决策和固定版本。
- 验证复用模式至少能对一个候选完成克隆、启动和健康检查。
