# 产品领域模型与 API v1

> 输入：[产品蓝图](12-product-blueprint.md)
> 目标：把已经验证的 Oncall 方法变成可承载多个员工、多个案例和多项能力的产品底座。

## 2026-10-29：真实工作连接器

### SourceConnector

连接器保存 `connector_type`、`case_id`、外部引用、授权状态、同步游标、
最近成功时间和真实错误。飞书 Token、Cookie、密码与 API Key 由服务端
`bytedcli` 管理，不进入 `product_objects`，也不返回浏览器。

### ConnectorSyncRun

每次同步独立保存开始和结束时间、同步前后游标、新增/更新/无变化数量以及
失败原因。失败不删除或覆盖上一次成功来源；重复读取相同正文通过内容散列
判定为 `unchanged`，不创建重复 `case_source`。

```text
POST /api/product/connectors
POST /api/product/connectors/{connector_id}/test
POST /api/product/connectors/{connector_id}/sync
POST /api/product/connectors/{connector_id}/automation
GET  /api/product/workspace
```

当前适配器只调用核实过的只读命令：

```text
bytedcli --json lark docs fetch --as user --doc <url> --doc-format markdown
bytedcli --json lark-oncall ticket get --ticket-id <id> --with-messages
bytedcli --json lark im chat-messages-list --as user --chat-id <关联群> --page-all
```

命令参数按连接器类型做白名单校验，不开放任意 Shell 参数。

产品面向普通用户提供“飞书文档”和“一次 Oncall 处理过程”两种入口。后者
只要求 Oncall 流程链接和关联飞书群链接，不要求用户查找 flow ID、Chat ID、
Cookie 或 Token。由于当前 Oncall 页面没有向只读工具暴露流程到群的自动映射，
第一次需要用户从 Oncall 卡片打开关联群并复制群链接；建立映射后可持续同步。

Oncall 同步同时记录：

- 接口返回的消息总数；
- 有正文、可进入经验编译的消息数；
- 已删除或无正文而跳过的消息数；
- 最后一条消息 ID、消息位置与证据消息 ID。

因此产品不会用“可学习消息数”冒充“读取到的全部记录数”。

### 持续学习运行模型

首次成功同步后，用户可配置 15、30、60、180、360、720 或 1440 分钟的
检查周期。调度器读取持久化的 `next_sync_at`，不依赖浏览器定时器。

每次运行先在 SQLite 事务中写入同步记录并占用连接器租约：

```text
due → running + lease → success
                     ↘ failed → retry_at
                     ↘ interrupted → retry_at
```

- 当前租约未过期时，重复人工请求返回 409，不调用外部系统；
- 成功后清零连续失败次数，并按正常周期安排下次检查；
- 失败按 1、5、15、60、180、360 分钟退避；
- 上一次成功来源始终保留有效，不用失败正文覆盖；
- 进程启动时收口所有旧进程租约，中断运行标记为 `interrupted`；
- 迟到结果只有持有当前租约时才能写回。

当前调度器适用于本地单进程产品。多实例生产部署仍需数据库级任务领取或独立
队列协调，不能把当前实现描述成已经支持水平扩容。

## 1. 领域边界

```text
组织
├─ 真实员工
├─ 数字员工
├─ 工作案例
│  ├─ 来源
│  ├─ 工作事件
│  └─ 经验候选
├─ 试岗任务与运行
└─ 能力印记
```

任何业务对象都必须属于组织。账号只有通过成员关系才能读取组织数据。

## 2. 核心对象

| 对象 | 作用 | 关键约束 |
|---|---|---|
| Organization | 数据和权限边界 | 本地版也不使用全局共享工作区 |
| Membership | 账号与组织关系 | owner / admin / member / reviewer |
| HumanProfile | 真实员工能力来源 | 不等于数字员工，不映射 HR 绩效 |
| DigitalWorker | 长期成长的数字员工 | 版本、岗位目标、放权等级、状态 |
| WorkCase | 一次完整工作案例 | 可接多个来源，具有编译状态 |
| CaseSource | 群聊、文档、工单、变更等来源 | 访问、脱敏、同步状态独立保存 |
| WorkEvent | 时间线中的事实、推断、动作、结果 | 必须关联来源，区分当时可见与事后结论 |
| ExperienceCard | 可学习经验 | 结论、条件、边界、证据、可信等级、允许用途 |
| LearningAssignment | 数字员工学习某项经验 | 不直接授予资格 |
| ReplayCase | 从案例生成的试岗定义 | 题面、Inject、评分器和版本 |
| TrialRun | 一次真实试岗 | 保存完整轨迹、模型/工具版本和结果 |
| CapabilityMark | 有边界的能力资格 | 依赖案例、试岗、经验版本；可暂停、失效 |
| TaskAssessment | 数字员工对任务的资格判断 | 引擎校验能力、边界、风险、负载和任务版本 |
| ShadowRun | 数字员工在真实任务中的独立交付 | 与真人实际结果分开保存，记录证据和实际动作 |
| ResultComparison | 数字交付与真人结果的结构化对照 | 验收、证据、边界与完整性分别评分 |
| CapabilityEvidence | 一次真实工作的能力证据 | 对同一对照结果幂等，反向更新印记统计 |
| ReviewItem | 少量人工例外 | 只收冲突、高风险、低置信和放权决策 |

## 3. 状态机

### 工作案例

```text
collecting → ready_to_compile → compiling → compiled
       ↘ source_failed       ↘ needs_review
```

来源失败不应让整个案例消失；完整性不足时保留缺口。

### 数字员工能力

```text
candidate → learning → trial_ready → trialling
        → shadow → active
        → suspended / expired
```

`active` 也不代表无限权限，必须读取印记中的 `scope`、`forbidden_actions` 和 `delegation_level`。

### 人工审核

```text
open → accepted / corrected / restricted / deferred / dismissed
```

不能要求真人确认每条正常抽取结果。

## 4. API 分组

### 组织与身份

- `POST /api/product/bootstrap`
- `GET /api/product/workspace`
- `POST /api/product/people`
- `POST /api/product/workers`

### 学习中心

- `POST /api/product/cases`
- `POST /api/product/cases/{case_id}/sources`
- `POST /api/product/cases/{case_id}/compile`
- `GET /api/product/cases/{case_id}`

### 学习与试岗

- `POST /api/product/workers/{worker_id}/learn`
- `POST /api/product/replay-cases`
- `POST /api/product/replay-cases/{id}/runs`
- `GET /api/product/trial-runs/{id}`

### 能力与放权

- `GET /api/product/workers/{id}/capabilities`
- `POST /api/product/trial-runs/{id}/issue-mark`
- `POST /api/product/capability-marks/{id}/suspend`

### 任务、影子工作与校准

- `POST /api/product/tasks`
- `POST /api/product/tasks/{id}/assess`
- `POST /api/product/tasks/{id}/auto-claim`
- `POST /api/product/tasks/{id}/auto-team`
- `POST /api/product/tasks/{id}/invite`
- `POST /api/product/tasks/{id}/updates`
- `POST /api/product/tasks/{id}/auto-invite`
- `POST /api/product/tasks/{id}/deliverables`
- `POST /api/product/tasks/{id}/outcomes`

数字员工提交 `result` 时生成 `ShadowRun`。真人必须记录独立的
`actual_result`，系统才生成 `ResultComparison`。验收、返工和接管会
分别形成能力证据；同一次对照不能重复增加样本。

任务评估会先寻找能够独立覆盖全部能力的员工；没有单人覆盖时，再
计算覆盖全部能力的最小团队。方案显式保存每位员工负责的能力和对应
印记。两人直接协作，三人及以上自动建立关联原任务的任务组。确认时
引擎重新校验任务版本和成员资格，Agent 对话不能自行改变任务归属。

执行中求助不是让用户手工挑人。任务成员通过 `help_request` 提交
`missing_capabilities`，系统按有效能力印记、当前负载和在途成员生成
`HelperSuggestion`。用户确认建议后，`auto-invite` 会在事务内重新校验
任务版本、印记状态和能力覆盖；第三位成员加入时自动建立任务组，原任务
ID、历史记录和交付上下文保持不变。同一员工不能重复加入，同一建议不能
重复确认。

工作记录与正式成果严格分离。正式成果创建不可覆盖的 `Deliverable`
版本，保存作者、内容、证据引用、实际动作、修改说明和前一版本 ID。
每个版本提交后立即生成独立 `DeliverableReview`：

- 内容完整、引用可解析和能力边界安全是硬门禁；
- 引用必须匹配当前组织已经导入的来源、来源链接或工作事件；
- 评审未通过只能继续修订，不能进入接受验收；
- 退回后必须提交新版本并重新评审，旧评审不沿用；
- 真人验收显式绑定 `deliverable_id` 和版本；
- 来源撤回会把引用它的成果标为 `source_revoked`，即使任务此前已验收，
  也会把成果有效性标为需要复核。

真实任务只会把能力标为“升级候选”，不会自动放大权限：

```text
3 次真实验收 + 返工不超过 1 次 + 无真人接管
→ promotion_eligible
→ 独立放权评审
```

连续两次真人接管或真实动作触碰禁区时，能力印记自动暂停。

### 例外审核

- `GET /api/product/reviews`
- `POST /api/product/reviews/{id}/resolve`

### 组织成员与当前权限

- `POST /api/product/members`
- `GET /api/product/workspace` 返回当前账号的 `organization.role` 和成员列表。

| 操作 | 负责人 | 管理员 | 成员 |
| --- | --- | --- | --- |
| 查看组织工作区、发布任务 | 是 | 是 | 是 |
| 导入来源、创建和同步连接器 | 是 | 是 | 否 |
| 配置持续学习 | 是 | 是 | 否 |
| 添加或修改组织成员 | 是 | 否 | 否 |
| 撤回来源授权 | 是 | 否 | 否 |

服务端是权限事实来源；前端同时隐藏不适用的危险操作。成员直接请求受保护接口
仍返回 403，不能靠修改浏览器状态绕过。当前添加成员要求对方先注册；邀请邮件、
邀请码及评审、学习管理、数字员工管理和任务验收的细粒度权限尚未完成。

## 5. 版本依赖

能力印记不是一条孤立记录。它至少依赖：

```text
来源版本
→ 工作事件版本
→ 经验卡片版本
→ ReplayCase 版本
→ TrialRun
→ CapabilityMark
```

来源撤回或关键版本变化时，沿依赖链找到受影响对象：

- 后续检索不再使用正文；
- 经验卡片标记受影响；
- 未结束试岗中止；
- 已有印记进入 `suspended` 或 `review_required`；
- 历史审计记录保留。

## 6. 第一阶段代码验收

1. 注册账号后可创建独立组织；
2. 两个账号不能读取对方组织对象；
3. 可创建真实员工与数字员工；
4. 可创建任意工作案例和多个来源，不依赖 Oncall 写死字段；
5. 对象重启后仍存在；
6. 所有写操作记录审计事件；
7. 来源撤回能影响关联经验与能力；
8. 旧系统现有测试继续通过。
