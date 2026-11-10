# X-012 专家响应与资格协议

日期：2026-11-09
状态：模板就绪；尚无真实回复或资格记录

## 状态机

候选只能按下列顺序推进：

`not_contacted -> sent -> response_received -> call_scheduled -> qualification_incomplete -> qualified_pending_agreement -> recruited`

允许的终止状态：

- `declined`
- `no_response`
- `ineligible`
- `terms_rejected`
- `withdrawn`

不得从 `interested`、`call_scheduled` 或 `qualification_incomplete` 直接计入 X-012 的专家数。

`recruited` 必须同时具备：

1. 十项资格门槛全部通过并有可追溯证据。
2. 姓名、内容、数据、撤回、收入和责任边界书面协议完成。
3. 匿名、真实支付、中立招募、统一价格、本人复核和负面结果条款未变。
4. 最坏复核容量与 24 小时目标时限已验证。
5. 未触发任何排除或停止条件。

## 回复分类

| 代码 | 分类 | 定义 | 计数 |
| --- | --- | --- | --- |
| RESP-I | `interested` | 明确愿意在锁定条款下进行资格电话 | 回应 +1；招募 +0 |
| RESP-Q | `asks_questions` | 询问流程、费用、授权或负担，但未接受锁定条款 | 回应 +1；招募 +0 |
| RESP-C | `asks_changes` | 要求修改匿名、支付、价格、招募、复核、结果披露或其他锁定条款 | 回应 +1；招募 +0 |
| RESP-D | `declines` | 明确拒绝参加或拒绝资格电话 | 拒绝 +1；招募 +0 |
| RESP-R | `referred` | 转交助理、经纪人、团队或另一位专家 | 回应 +1；招募 +0 |
| RESP-A | `auto_reply` | 自动回复、休假通知或系统确认 | 不计人工回应；招募 +0 |
| RESP-N | `no_response` | 成功送达后满 7 个自然日仍无人工回应 | 无回应 +1；招募 +0 |
| RESP-U | `undeliverable` | 地址无效、退信或渠道不可达 | 不计无回应；招募 +0 |

同一回复可有一个主分类和多个原因代码。`asks_changes` 不能被改写为 `interested`；只有候选书面接受原锁定条款后，才可另记一条新的 `interested` 事件。

## 条件变更代码

| 代码 | 条件变更 |
| --- | --- |
| CHG-01 | 不接受匿名身份组 |
| CHG-02 | 要求免费测试、意向问卷或模拟支付替代真实支付 |
| CHG-03 | 要求不同组使用不同价格、赠品或权益 |
| CHG-04 | 要求本人渠道发信、公开背书或自行选择参与者 |
| CHG-05 | 要求查看分配表、个人组别或中期转化 |
| CHG-06 | 要求由团队成员代替本人完成 C/D 复核 |
| CHG-07 | 不接受记录身份无效、匿名更优或负毛利结果 |
| CHG-08 | 要求扩大为平台采购、股权、长期开发或独家合作 |
| CHG-09 | 要求减少某一候选的负担而不统一修改三名专家方案 |
| CHG-10 | 其他会改变可识别因果对照的条件 |

收到 `CHG-01` 至 `CHG-10` 时，只能解释现有设计；不得在回复中承诺修改。若候选坚持，状态为 `terms_rejected`。

## 不合格与拒绝原因

| 代码 | 原因 |
| --- | --- |
| ELG-01 | 过去 12 个月不足 50 笔独立付费交易或无可核验证据 |
| ELG-02 | 不接受主样本排除其客户、课程、邮件和粉丝名单 |
| ELG-03 | 无法授权 30 个案例、20 份反馈和 50 个常见问答 |
| ELG-04 | 无法定义允许项、拒答项、转人工和纠错流程 |
| ELG-05 | 无法在 30 天内本人完成最多 40 次短复核 |
| ELG-06 | 不接受匿名组、盲法或统一 rubric |
| ELG-07 | 不接受真实退款、负面结果或身份无溢价结论 |
| ELG-08 | 无法签署姓名、内容、数据、撤回、收入和责任边界 |
| ELG-09 | 不接受中立招募，要求本人渠道或公开背书 |
| ELG-10 | 垂直边界、隐私、版权或安全风险无法控制 |
| ELG-11 | 过去 24 个月已用本人姓名、课程或方法品牌公开销售、捆绑或 beta 分发同垂直 AI clone/AI coach，导致既有报价与身份暴露污染 |
| DEC-01 | 当前无时间或容量 |
| DEC-02 | 无兴趣，但未指出具体条件 |
| DEC-03 | 品牌、声誉或匿名展示顾虑 |
| DEC-04 | 商业条款或收益预期不匹配 |
| DEC-05 | 已有排他合作或合同限制 |
| DEC-06 | 未提供原因 |

原因代码描述事实，不推断动机。拒绝匿名时同时记录 `CHG-01` 与适用的 `ELG-06`；单纯“暂时没时间”记录 `DEC-01`，不能推断为市场否证。

## 资格电话记录要求

30 分钟电话只核验事实，不进行产品销售。使用统一模板并记录：

- 会议时间、参与人和候选明确同意的记录方式。
- 每项门槛的原话、证据位置、核验状态和待办。
- 至少 5 份计时复核的分钟数、第 75 百分位分钟数，以及 40 次最坏负担的总小时数。
- 基于复核、专家持续分成、退款、支付费、中立获客和支持成本计算的成本底价。
- 匿名、负面结果、退款、中立商业招募、排除自有名单和盲法的明确回答。
- 数据类型、授权主体、保留期限、删除流程和禁止输入。
- 所有条件变更、拒绝或保留意见。

电话后 24 小时内只允许以下结论：

| 结论 | 使用条件 | X-012 计数 |
| --- | --- | ---: |
| `qualification_incomplete` | 任一证据待补或回答不明确 | 0 |
| `ineligible` | 任一硬门槛明确失败 | 0 |
| `qualified_pending_agreement` | 十项门槛证据通过，书面协议未完成 | 0 |
| `recruited` | 十项通过且书面协议完成 | 1 |

## Wave 1 结果表

| 候选 | 联系状态 | 回复分类 | 资格结论 | 拒绝/变更代码 | 是否计入 |
| --- | --- | --- | --- | --- | --- |
| W01 Jessica Brody | not_contacted | 无 | not_started | 无 | 否 |
| S01 Alex Lyon | not_contacted | 无 | not_started | 无 | 否 |
| P-OBS01 Steve Simon | withdrawn | 无 | ineligible_public_evidence | ELG-11 | 否 |
| P02 Karl Taylor | not_contacted | 无 | not_started_fallback | 无 | 否 |
| P-OBS02 Pye Jirsa | withdrawn | 无 | ineligible_public_evidence | ELG-11 | 否 |
| P05 David duChemin | not_contacted | 无 | not_started_replacement_lead | 无 | 否 |
| P06 Joe McNally | not_contacted | 无 | not_started_replacement_secondary | 无 | 否 |

Jessica 的公开桌面标签为
`public_capacity_unproven / team_delivery_risk`：Academy 有可交易订阅和
Jessica 参与的直播入口，但课程、直播、Office Hours、社群与支持由多种角色
共同交付，且现有条款未授予 AI 或商业再利用权。该标签不是直接回复，也不能
预先记为 `ELG-03`、`ELG-05`、`ELG-08` 或 `DEC-01`；只有交付者/权利隔离
矩阵、Jessica 本人 5 份计时校准以及 40 次/30 天/24 小时排期均完成后才能
解除。解除前不得为 Jessica 运行候选级渠道预筛。

Alex 的公开桌面标签为 `public_capacity_contradicted`：当前主销售页不提供直播
workshop，且本人称因没有时间而不接新一对一客户。该标签不是直接回复，也不能
预先记为 `ELG-05` 或 `DEC-01`；只有本人书面确认研究例外、完成 5 份计时校准
并证明 30 天最多 40 次本人签认后才能解除。解除前不得为 Alex 运行候选级渠道
预筛。

Steve 的公开 Render 部署已直接证明 Critique engine 使用 Anthropic 模型和
Steve 的教学、书籍、大量录制点评自动生成同垂直摄影反馈，且已经公开 beta
和销售。该候选按公开证据记录 `ELG-11`，转入 P-OBS01；这不是回复、拒绝或
外联结果，所有联系与支出计数仍为 0。

Karl 的公开桌面标签为
`public_capacity_unproven / team_delivery_risk / neutral_recognition_unproven`：
Visual Education 有本人直播 critique 和 Lifetime 本人 portfolio review，
但交付同时涉及 VE team/staff，不能证明 40 次独立异步签认。Karl 保持 P02
备选，不触发当前 `ELG-11`，但交易分母、图片权利矩阵、5 份计时校准和
40/40 中立关系层门禁完成前不得发送或投放。

Pye 的当前官方销售页和两个启用 checkout 均把 `AI Pye (Beta)` 作为付费
Mentorship 权益；页面明确称该 AI 使用本人完整 16 步课程、lesson 和 framework
训练并能像本人一样全天回答摄影业务问题。该候选按公开证据记录 `ELG-11`，
从 P03 转入 P-OBS02；这不是回复、拒绝或外联结果，所有联系与支出计数仍为 0。

David 的公开桌面标签为
`public_monthly_capacity_supported / public_24h_sla_unproven /
image_and_recording_rights_unproven / neutral_recognition_unproven`：
当前 349 美元、60 分钟本人 Zoom 可用于作品和 portfolio critique；公开日历
30 天最多支持 55 个不重叠 session，但 50 位/12 月交易分母、24 小时短签认、
实验意愿、图片与 session 录像权利均未证明。P05 只是摄影替补排序第一，
不是 Wave 1。

Joe 的公开桌面标签为
`public_capacity_unproven / public_24h_sla_unproven /
team_delivery_risk / image_recording_and_ai_rights_unproven /
neutral_recognition_unproven`：当前会员含 Joe 本人月度 critique，并可另购
75 分钟本人 remote mentorship；但其价格和 Google Calendar slot 只在会员
站内可见。公开 30 天窗口只确认 12 月 3–4 日 workshop 占用，不能证明
40 次容量或 24 小时 SLA；Annie、Lynn、special guests 和社区参与交付，
Mighty Networks 也禁止未经权利人许可用会员内容训练 AI。P06 不是 Wave 1，
须先通过交易、团队隔离、计时、排期、权利和 40/40 门禁。
