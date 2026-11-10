# X-010：B2B 大客户交接替代方案审计

日期：2026-11-09
访问日期：2026-11-09
范围：CRM（Customer Relationship Management，客户关系管理）、Revenue Intelligence（收入智能）、Conversation Intelligence（对话智能）和 Customer Success Platform（客户成功平台）
证据边界：产品能力按官方文档 B 级记录；厂商页面中的效果数字不用于证明客户收益或付费意愿。

## 审计结论

**原“B2B 大客户交接分身”假设被否证，不应建设为独立产品。**

至少 11 个成熟产品已覆盖客户历史、会议摘要、关系角色、风险、成功计划和交接任务。Gong、ChurnZero、Planhat 和 Vitally 还直接覆盖负责人变更或销售到客户成功的交接：

- Gong 可在 CRM 负责人变化时自动生成并发送交接 Brief。
- ChurnZero 的 Baton、Liftoff、Transfer 分别覆盖销售到客户成功、实施到客户成功和 CSM 到 CSM。
- Planhat 把销售承诺、交付、使用和客户反馈保存在同一客户记录，并定义交接内容。
- Vitally 提供交接 Note、项目任务、里程碑和客户通知模板。

因此，历史汇总、交接摘要、关系图谱、行动计划和客户通知都不是产品空白。

唯一值得继续淘汰性验证的窄假设是：

> 对高价值或高责任客户，现有平台是否仍缺少“逐项承诺证据、承诺变更、交接完整性检查、接任人确认和客户签认”组成的可审计交接门禁。

这更像现有 CRM/客户成功平台的配置、连接器或治理服务，不应预设为新的数字分身 SaaS。

## 统一审计口径

| 代码 | 能力 | 达标证据 |
| --- | --- | --- |
| H | 历史归集 | CRM、通话、邮件、会议、支持或产品使用记录能按账户汇总 |
| C | 承诺与结果 | 能记录或抽取客户目标、承诺、决定、未结事项和交付状态 |
| R | 关系上下文 | 能表示决策者、影响者、关系强度、变更和参与缺口 |
| T | 交接触发 | 所有者或阶段变化可生成交接包、通知或标准任务 |
| A | 行动连续性 | 能保留下一步、负责人、到期日、风险和成功计划 |
| Q | 接任验收 | 接任人或经理必须确认理解、补齐缺口或通过门禁 |
| G | 治理审计 | 来源、版本、置信度、审批、客户签认或运行历史可追溯 |

标记规则：

- `是`：官方资料明确覆盖。
- `部分`：可配置实现或只覆盖其中一部分。
- `未见`：本轮官方资料未发现，不能解释为产品一定没有。

## 能力矩阵

| 产品 | H | C | R | T | A | Q | G | 关键反证 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Salesforce Sales Cloud / Momentum | 是 | 部分 | 部分 | 部分 | 是 | 未见 | 部分 | 自动捕获通话、邮件、短信和日程，形成持久账户记忆、Executive Brief 和下一步 |
| Microsoft Dynamics 365 Sales Copilot | 是 | 部分 | 是 | 部分 | 是 | 未见 | 部分 | 汇总多年时间线、决策里程碑、会议决定、行动项和关系缺口 |
| Gong AI Briefer | 是 | 是 | 部分 | 是 | 是 | 未见 | 部分 | CRM Owner 变化可自动触发账户交接 Brief；自定义问题可抽取目标、痛点和约定行动 |
| Salesloft / Clari | 是 | 部分 | 是 | 部分 | 是 | 未见 | 部分 | 对话、CRM、买方信号、机会风险和下一步已进入统一收入数据层 |
| Gainsight | 是 | 部分 | 是 | 部分 | 是 | 未见 | 部分 | Timeline、People Map、Success Plan、AI 客户摘要和会议行动项形成同一客户上下文 |
| ChurnZero | 是 | 是 | 是 | 是 | 是 | 部分 | 是 | 三类交接 Agent 输出承诺、差距、关系、置信度和前 2 周/90 天计划 |
| Totango | 是 | 部分 | 部分 | 部分 | 是 | 未见 | 是 | Account Profile 包含历史、联系人、任务、成功计划、目标和字段变更历史 |
| HubSpot Service Hub | 是 | 部分 | 部分 | 部分 | 是 | 未见 | 部分 | CRM、沟通历史、健康分、成功计划、工作流和客户交接模板可组合完成基础交接 |
| People.ai | 是 | 未见 | 是 | 部分 | 是 | 未见 | 部分 | Salesforce 内的账户计划、关系图和历史参与度已覆盖复杂客户关系接续 |
| Planhat | 是 | 是 | 是 | 是 | 是 | 部分 | 是 | 明确保存销售承诺、客户目标、角色和未决事项；支持阶段出口和 UAT 签认 |
| Vitally | 是 | 部分 | 是 | 是 | 是 | 部分 | 部分 | CSM Transition 项目模板包含 Note、任务、里程碑、关系图和客户通知 |

### 直接替代强度

1. **ChurnZero：最强直接替代。** Transfer 已生成 CSM 到 CSM 的完整交接，Baton 和 Liftoff 覆盖前后相邻阶段；还明确输出销售承诺交付差距、置信度和行动计划。
2. **Gong：最强自动触发替代。** 负责人变化可直接触发 Brief；数据来自通话、邮件、CRM、Gong 和网页，适合快速接手。
3. **Planhat：最强全生命周期替代。** 官方定义的交接内容正是承诺、目标、关系和未决事项，并将销售、交付、使用、支持放在同一记录。
4. **Vitally：最强流程模板替代。** 已把交接拆成任务、里程碑、内部 Note 和外部通知，企业可低成本配置。
5. **Salesforce、Microsoft、Gainsight：平台型替代。** 即使没有单一“交接按钮”，现有数据、AI 摘要、关系和工作流足以配置大部分流程。

## 仍未被公开证据完整证明的能力

### 1. 逐项承诺台账

公开资料多把承诺放进摘要或 Note，较少明确展示：

- 原始发言或合同条款。
- 承诺类型：合同义务、口头承诺、目标、期望或内部推断。
- 作出承诺的人、接受承诺的人、适用条件和截止日期。
- 后续修订、冲突、撤销和交付状态。

但 ChurnZero 已覆盖 sales promise delivery gap，Planhat 已明确保存合同外承诺，所以差异很窄。

### 2. 交接完整性门禁

本轮未发现产品要求“缺少关键字段或证据时禁止完成所有权转移”。现有平台普遍允许先转移账户，再补信息。

### 3. 接任人理解验证

本轮未发现系统用情境问题、复述或经理核验来证明接任人真正理解客户目标、敏感关系和未结承诺。任务完成不等于理解正确。

### 4. 客户共同确认

成功计划和实施签认可由客户共同参与，但未见普遍把“承诺清单与新负责人理解”作为客户可签认的交接记录。

## 为什么不能立刻把剩余缺口升级为产品

- ChurnZero 和 Planhat 已覆盖承诺及交接差距的大部分核心。
- Gong 自定义 Brief 可新增承诺问题，现有工作流工具可新增检查和审批。
- 接任人测验可能是低频管理流程，不一定产生独立预算。
- 客户未必愿意签认内部交接包，尤其是非合同口头内容。
- 销售离职造成的收入损失包含个人信任，流程证据不能复制关系忠诚。

## 淘汰与继续条件

### 直接淘汰

满足任一项即停止该方向：

- ChurnZero、Gong 或 Planhat 通过配置即可完成逐项承诺、所有权触发、接任确认和审计。
- 5 名真实负责人均只愿意在现有 CRM/客户成功平台中增加字段和流程。
- 客户不允许保存口头承诺原文或不愿共同确认。
- 漏承诺主要来自销售激励、合同治理或执行能力，而非交接信息缺失。

### 仅可继续

必须同时满足：

1. 取得至少 5 个真实人员变更事件，每个事件有可量化的遗漏、返工或收入风险。
2. 现有系统在事件发生时已被正确使用，问题仍然存在。
3. 至少 3 个买方愿意为独立的承诺保证或交接审计付费，而不是要求免费配置。
4. 能获得授权的通话、邮件、CRM、合同和交付证据。
5. 接任验收能预测后续遗漏，而不只是增加行政步骤。

验证协议见：[X-011 承诺保证与交接门禁](../05-experiments/X-011-commitment-assurance-validation.md)。

## 官方来源

- [Salesforce Revenue Orchestration](https://www.salesforce.com/ap/sales/revenue-orchestration/)
- [Microsoft Dynamics 365 Copilot account management](https://learn.microsoft.com/en-us/training/modules/describe-sales-account-management-dynamics-365/7-describe-copilot-sales-account-management)
- [Gong AI Briefer](https://help.gong.io/docs/understanding-ai-briefer)
- [Gong automated AI briefs](https://help.gong.io/docs/set-up-automated-ai-briefs)
- [Salesloft / Clari platform overview](https://www.salesloft.com/platform-overview)
- [Gainsight AI features](https://support.gainsight.com/Gainsight_AI/AI_in_Gainsight_Products/Customer_Success_(CS)/AI_Features_in_Customer_Success_(CS)_Product)
- [ChurnZero handoff agents](https://churnzero.com/features/cs-sales-implementation-agents/)
- [Totango account profiles](https://support.totango.com/hc/en-us/articles/205468375-Understand-account-profiles)
- [HubSpot customer success plans](https://blog.hubspot.com/service/customer-success-plan-templates)
- [People.ai Account Intelligence](https://people.ai/product/account-Intelligence/)
- [Planhat customer lifecycle and handovers](https://www.planhat.com/customer-success/lifecycle)
- [Vitally CSM transition template](https://www.vitally.io/inspiration/csm-transition-template)
