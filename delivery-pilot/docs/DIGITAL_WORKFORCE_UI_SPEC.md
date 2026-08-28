# 数字员工与自主交付小队 UI / 数据契约

## 产品边界

数字员工是可复用的企业执行资产，属于顶级模块；自主交付小队是某个项目版本对数字员工的选择和职责快照，属于项目级模块。

数字员工不是装饰性角色。每名员工必须绑定：

- 负责的交付阶段。
- 实际执行工具或 Runtime。
- 输入、输出和交接责任。
- 能力边界与人工介入条件。

卡通人物只负责快速识别身份和状态。进度、工具、证据和失败必须来自真实任务事件，不以动画冒充执行。

## 与 Multica 的差异

Multica 默认只创建 Mika（Chief of Staff），没有固定专家团队。Squad 自动任务仍由队长 Agent 执行，其他成员主要承担组织和状态展示。

DeliveryPilot 默认创建五个与真实交付链路对应的数字员工：

| 员工 | 职责 | 实际执行工具 |
| --- | --- | --- |
| 小航 / 交付队长 | 拆解目标、协调交接、处理人工决策、确认最终交付 | DeliveryPilot Supervisor |
| 研析 / 需求分析师 | 读取原始需求、提取 REQ/BR/验收标准 | Trae Work |
| 探途 / 技术侦察员 | 技术热点、开源匹配、许可证与代码图谱证据 | Technology Exploration + CodeGraph |
| 构筑 / 研发工程师 | 规格、开发、修复、构建 | Trae Code |
| 守证 / 质量工程师 | 自动化测试、追踪覆盖、交付证据校验 | Trae Code + DeliveryPilot Evidence |

## 数据契约

### DigitalEmployee

```ts
type DigitalEmployee = {
  id: string
  name: string
  title: string
  department: string
  summary: string
  avatarUrl: string
  status: 'active' | 'off_duty'
  builtIn: boolean
  runtime: 'supervisor' | 'trae_work' | 'technology_exploration' | 'codegraph' | 'trae_code'
  stages: StageName[]
  capabilities: string[]
  instructions: string
  createdAt: string
  updatedAt: string
}
```

### DeliverySquadSnapshot

项目启动时写入任务和版本，不随员工库后续修改：

```ts
type DeliverySquadSnapshot = {
  id: string
  name: string
  memberIds: string[]
  leaderId: string
  members: DigitalEmployee[]
  createdAt: string
}
```

## 信息架构

### 顶级：数字员工

首页和任务页导航均提供“数字员工”入口，与“技术雷达”同级。

页面结构：

1. 顶部：员工总数、在岗数、覆盖工具数、新建数字员工。
2. 左侧/主区域：员工名册，使用专业卡通半身头像、姓名、岗位、Runtime、能力和状态。
3. 详情区域：职责阶段、交接要求、工具绑定、上岗/离岗。
4. 创建面板：身份、岗位、Runtime、阶段、能力、工作指令和头像风格。

内置员工不可删除，但可离岗；自定义员工可删除。至少保留一名交付队长。

### 项目创建：选择自主交付小队

新建项目表单增加紧凑的小队条目，不继续拉高首屏：

- 默认选中全部在岗内置员工。
- 展示重叠头像、成员数量和职责覆盖率。
- 点击“调整成员”打开覆盖层选择，不在主表单内展开。
- 缺少需求分析、研发或质量职责时明确警告，允许用户返回修正。

### 项目级：自主交付小队

任务页增加“交付小队”入口。

首屏展示动态协作台：

- 员工按实际责任顺序横向排列。
- 当前员工高亮并有克制的呼吸状态，不用无限娱乐动画。
- 交接发生时，连接线从上一员工流向下一员工。
- 每人显示真实状态：待命、工作中、等待交接、已交付、需协助。
- 当前对话气泡显示最新一条真实事件摘要。

下方工作轨迹按统一序号展示：

- 谁在什么时间接收了什么。
- 使用了哪个实际工具。
- 产出了什么证据。
- 交给了谁。
- 是否发生恢复、重试或人工决策。

## 视觉契约

- 角色头像：统一为现代 2.5D 卡通人物半身像，纯色工作室背景，人物差异来自服饰、道具和色彩。
- 页面基调：延续 DeliveryPilot 深色专业控制台，头像提供青绿、珊瑚、金色、蓝色、紫红等多色信号，避免单一蓝紫。
- 卡片圆角不超过 8px。
- 员工状态使用图标、文字和颜色共同表达。
- 动画只表达状态变化：呼吸、数据流和交接；遵守 `prefers-reduced-motion`。
- 不使用头像墙代替信息。每个头像必须同时出现岗位和 Runtime。
- 1440x900 首屏不出现横向滚动；1120x720 可完整操作。

## 真实状态映射

| 任务阶段 | 默认责任人 |
| --- | --- |
| document_intake / business_approval | 交付队长 |
| traework_analysis | 需求分析师 |
| technology_advisory / code_graph | 技术侦察员 |
| trae_spec / development / build_release | 研发工程师 |
| automated_test / final_delivery | 质量工程师 |

员工状态由任务阶段、任务事件、外部 Runtime 状态和 Supervisor 健康状态推导。没有任务时全部显示待命；工具异常时员工显示需协助，但员工动画本身不得改变任务状态。
