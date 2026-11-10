# X-008 数据契约与启动门禁

状态：等待 X-006
目的：拿到真实数据后能直接开始最小验证，同时阻止用合成数据冒充业务成立。

## 启动门禁

只有以下条件全部满足才开始业务原型：

1. X-006 达到“通过”，或达到“有条件继续”且唯一缺口不是问题优先级。
2. 至少一家企业书面或明确记录授权使用脱敏数据进行限定范围验证。
3. 获得一个设备族的 20 至 50 个已关闭异常工单或同等质量事件。
4. 确认 2 名专家和 3 名接班人可参与评分与前后测试。
5. 定义数据保留期限、访问人员、删除方式和禁止用途。
6. 预先记录试点基线、通过标准和停止条件。

任一条件不满足时，只允许做软件冒烟测试，不得声称完成 S3 方案验证。

## 最小输入包

| 数据 | 最小数量 | 必须字段 | 可选字段 |
| --- | ---: | --- | --- |
| 已关闭异常工单 | 20-50 | 时间、资产、症状、动作、结果、处理人角色 | 停机分钟、部件、附件、成本 |
| 专家复盘 | 10 个事件 | 证据、判断、条件、反例、禁止项、未知项 | 语音、图片、引用手册 |
| 程序/手册 | 目标设备相关 | 标题、版本、有效日期、适用资产 | 页码、变更记录 |
| 接班人测试 | 3 人 | 匿名人员 ID、角色、经验年限、每题回答 | 置信度、用时 |
| 专家评分 | 2 人 | 评分者 ID、评分、理由、分歧处理 | 观察记录 |

禁止采集与实验无关的姓名、联系方式、绩效评价、医疗信息或完整生产秘密。

## 规范化对象

### Incident

- `incident_id`
- `asset_family`
- `failure_mode`
- `observed_signals`
- `timeline`
- `actions_taken`
- `outcome`
- `source_refs`
- `occurred_at`

### ReasoningUnit

- `reasoning_id`
- `incident_id`
- `evidence_considered`
- `expert_conclusion`
- `decision_rule`
- `applicability_conditions`
- `counterexamples`
- `prohibited_actions`
- `unknowns`
- `expert_approved_at`
- `version`

### Scenario

- `scenario_id`
- `reasoning_id`
- `presented_evidence`
- `withheld_evidence`
- `distractors`
- `expected_reasoning_steps`
- `safety_boundary`
- `scoring_rubric_version`

### Assessment

- `assessment_id`
- `scenario_id`
- `participant_id`
- `response`
- `confidence`
- `duration_seconds`
- `expert_scores`
- `score_disagreement`
- `observed_performance_ref`
- `completed_at`

### Coverage

- `asset_family`
- `failure_mode`
- `participant_id`
- `evidence_type`
- `status`
- `verified_at`
- `expires_at`
- `verifier_id`

## 证据来源类型

每条事实和判断必须标注其来源：

- `source_record`：原始工单、手册、传感器或附件。
- `expert_statement`：专家明确表达。
- `system_inference`：系统归纳，待专家确认。
- `unknown`：当前没有足够证据。

系统推断在专家确认前不得进入标准答案或覆盖证明。

## 评分一致性门槛

- 两名专家先独立评分，再讨论分歧。
- 场景是否通过不能只看最终答案，必须检查关键推理步骤和禁止项。
- 若同一场景专家评分差异超过量表的 20%，先修订规则，不计入效果结果。
- 至少 8/10 个场景达到可接受一致性，才认为“掌握”可被稳定定义。

## 软件冒烟测试与业务验证分离

| 用途 | 可用数据 | 可以得出的结论 |
| --- | --- | --- |
| 数据导入、解析、权限、界面测试 | 合成或公开数据 | 软件链路可运行 |
| 场景质量与专家一致性 | 授权真实事件和真实专家 | 场景是否可评分 |
| 接班能力改善 | 真实接班人前后测试和受控观察 | 方案是否产生能力变化 |
| 商业价值 | 试点负责人、业务基线和采购信号 | 是否值得继续采购 |

## X-008 输出

必须交付：

1. 10 个经专家确认的 ReasoningUnit。
2. 10 个带来源、反例和安全边界的 Scenario。
3. 专家与接班人的盲测或统一顺序测试结果。
4. 专家评分一致性记录。
5. 故障模式覆盖矩阵。
6. 未知项、失败场景和不可自动化边界清单。
7. 对照孵化简报五项标准的通过/失败判定。
