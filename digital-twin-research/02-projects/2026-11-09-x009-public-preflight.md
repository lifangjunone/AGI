# X-009 竞品闭环公开预核验

日期：2026-11-09
访问日期：2026-11-09
证据范围：厂商官方产品页、官方发布和官方 FAQ
结论强度：B 级能力声明，不代表客户实际启用或效果

## 核验问题

Poka、Augmentir、ProPlant 和 Kahuna 是否已经公开覆盖以下六步：

1. 从真实异常或作业记录导入事件。
2. 区分原始事实、专家结论、系统归纳和未知项。
3. 从事件生成带条件变化、干扰项或反例的情境。
4. 用解释、观察或受控演练验证能力。
5. 把结果回写到具体故障模式和人员覆盖。
6. 在事件、程序或证据变化时触发重新验证。

## 判定规则

- `明确声明`：官方资料直接描述该能力。
- `部分覆盖`：存在相邻能力，但没有证明本研究要求的完整行为。
- `未发现`：本轮官方资料中没有找到；不等于产品没有。

## 六步矩阵

| 产品 | 事件导入 | 推理边界 | 情境生成 | 能力验证 | 覆盖回写 | 重新验证 | 公开预判 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Poka | 明确声明：Forms、Issues、故障记录和运营数据 | 未发现：未见事实/专家/模型/未知四类证据边界 | 部分覆盖：Troubleshoots、SOP、视频和“Show me”审核，未见罕见异常反例场景 | 明确声明：技能、endorsement、“Show me”审核和训练追踪 | 明确声明：技能矩阵、人员资格和跨站点覆盖 | 部分覆盖：案例展示根因后更新程序、重新培训和创建技能，自动触发方式未公开 | 客户案例已形成直接反证，独立产品差异接近消失 |
| Augmentir | 明确声明：读取已执行作业、步骤、偏差、签核、资产和 CMMS 数据 | 部分覆盖：有审批门禁、审计轨迹、版本与回滚，未发现事实/专家/模型/未知四类标记 | 部分覆盖：可从 SOP 或描述生成程序、技能、培训和知识题，未发现异常推理场景与反例 | 明确声明：数字评估、自动/人工 endorsement、真实作业表现与熟练度 | 部分覆盖：技能矩阵、班次覆盖和任务分配，未证明故障模式级覆盖 | 部分覆盖：程序同步、技能到期和监控 Agent，未证明异常或程序变化自动触发专项复核 | 最接近四至五步，独立产品差异高度收窄 |
| ProPlant | 部分覆盖：专家访谈、邮件、文档和日常运营持续进入知识库，未展示工单事件主键 | 部分覆盖：回答带来源、培训需专家审核，未发现四类证据边界 | 部分覆盖：从捕获知识自动生成培训和多类型测验，未发现条件变化、干扰项和 teach-back | 部分覆盖：测验验证理解并跟踪 competency，未发现现场观察或受控演练 | 未发现：有 LMS 与合规跟踪，未展示故障模式覆盖矩阵 | 部分覆盖：文档监控和培训自动更新，未展示人员重新验证触发 | 捕获到测验链路已商品化，表现证据仍不清楚 |
| Kahuna | 部分覆盖：可接入运营系统和操作数据，未发现异常自动创建技能 | 未发现：重点是人工定义和验证技能，不是 AI 推理来源边界 | 未发现：支持可配置评估，未发现从事件自动生成情境 | 明确声明：主管/专家签核、同行评审、现场观察和经验识别 | 部分覆盖：团队矩阵、班次/角色覆盖和能力风险，未证明故障模式粒度 | 部分覆盖：到期提醒、实时状态和动态技能框架，未证明事件变化触发 | 能力验证与覆盖已成熟，事件生成是主要未知 |

## 逐产品证据

### Poka

官方产品与客户案例明确：

- 平台同时提供 Issues、Forms、数字作业指导、Troubleshoots、技能矩阵、现场审核和 CMMS/MES/LMS/QMS 集成。
- Domtar 用表单记录 paster 失败，识别操作角度根因，更新程序、重新培训并创建新技能，厂商称年化节省 18.6 万美元。
- Tetra Pak 把 Skills、Forms、SOP 和视频称为完整循环，并把技能缺口与人员/方法损失连接。

来源：

- [Poka Connected Worker Platform](https://www.poka.io/en/connected-worker-platform)
- [Domtar 客户案例](https://www.poka.io/en/customers-stories/how-domtar-digitized-manufacturing-training)
- [Tetra Pak 客户案例](https://www.poka.io/en/customers-stories/tetra-pak-eradicating-man-method-losses-in-production/)

仍未证明：事实/专家/模型/未知四类边界、罕见异常反例场景以及专家评分一致性。

### Augmentir

官方材料明确：

- Command Center 同时读取已执行作业、偏差、签核、程序版本、人员技能、认证、熟练度、表现及 ERP、MES、CMMS、LMS、QMS 数据。
- 可在一次对话中创建技能、培训、知识检查和监控 Agent，并在发布前要求人工批准。
- Skills Management 支持数字评估、自动或人工 endorsement、按真实工作表现识别技能缺口、技能矩阵和班次覆盖。
- Procedure Studio 支持 SOP 批量导入、SharePoint 同步、数据采集和签核。

来源：

- [Augie Command Center](https://www.augmentir.ai/product/augie-command-center)
- [Command Center 与 Procedure Studio 发布](https://www.augmentir.ai/news/augmentir-reinvents-industrial-software-natural-language-becomes-the-new-interface-for-frontline-operations)
- [Skills Management](https://www.augmentir.ai/connected-worker/skills-management)
- [Procedure Studio](https://www.augmentir.ai/product/augie-procedure-studio)

仍未证明：从一次罕见异常提取经专家确认的关键推理，生成带反例情境，并把表现回写到同一故障模式。

### ProPlant

官方材料明确：

- AI Agent 主动访谈专家，并从邮件、文档、对话和日常运营持续捕获知识。
- 捕获结果进入知识图谱和搜索，回答可引用企业资料。
- 自动生成培训与测验，专家审核后发布到 LMS。
- 文档变化会自动更新知识库，厂商宣称培训可随知识更新。

来源：

- [ProPlant 产品页](https://www.proplant.ai/)
- [ProPlant 产品演示材料](https://www.proplant.ai/presentation)

仍未证明：现场表现验证、故障模式覆盖、评分一致性和人员重新验证。

### Kahuna

官方材料明确：

- 可用结构化评估、主管或专家签核、同行评审、现场观察和经验识别验证能力。
- Skills Manager 提供灵活评估框架、团队矩阵、人员匹配、能力规划和实时分析。
- Insights 展示角色、班次、地点和团队的覆盖、缺口、认证与培训效果。
- 可通过 API 或文件接入 HR、LMS、ERP、调度和其他运营系统。

公开交互式 tour 的浏览器核验：

- 2026-11-09 可进入 Navattic 产品 tour，前几步展示 `Team Matrix` 和人员搜索/排序界面。
- 第 6/12 步进入 HubSpot 留资表单；未提交个人信息，因此后续功能未核验。
- 该 tour 只增强“团队能力矩阵真实存在”的 B 级产品证据，不能证明异常自动生成技能、情境评估或变化触发复核。

来源：

- [Kahuna FAQ](https://kahunaworkforce.com/frequently-asked-questions/)
- [Kahuna Skills Manager](https://kahunaworkforce.com/kahuna-skills-manager/)
- [Kahuna Insights](https://kahunaworkforce.com/kahuna-insights/)
- [Kahuna 公开产品 tour](https://kahunaworkforce.com/take-a-tour-of-kahuna-technical-skills-manager/)

仍未证明：由真实异常自动形成技能、推理场景和变化触发的专项重新验证。

## 产品含义

公开证据已否证“市场缺少经验捕获、培训、评估或覆盖矩阵”的宽泛描述。Poka 客户案例还否证了“市场缺少事件到程序、培训和新技能闭环”。当前只剩更窄的组合差异：

> 以真实异常和具体故障模式为主键，把经专家确认的推理证据、情境验证、现场表现和接班覆盖串成可审计链路。

即使这个差异存在，也不自动支持建设独立平台。更可能的产品形态依次是：

1. 叠加在 Poka、Augmentir、Kahuna 或 CMMS 上的连接器与验证编排。
2. 针对高损失设备族的实施方法和试点服务。
3. 只有客户证明现有平台无法配置完成时，才考虑独立软件。

## X-009 公开预判

- Poka：`直接反证`，实际演示优先级最高。
- Augmentir：`差异高度收窄`。
- ProPlant：`差异收窄`，重点核验现场表现和覆盖回写。
- Kahuna：`差异收窄`，重点核验异常事件是否能自动驱动技能更新。
- X-009 正式状态仍为 `未知`：没有实际操作、客户使用和配置成本证据。

若 Poka 或 Augmentir 在统一测试案例中无需定制开发即可完成六步，并有客户实际使用，当前独立产品方向应淘汰。
