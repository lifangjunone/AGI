# 步骤 06 前置调研：数字员工如何考试与沙箱验证

> 本文只做业界调研与方案判断，不直接进入功能设计。

## 一、调研问题

数字员工学习了真实员工的经验后，怎样证明它不仅“记住了内容”，而是真的能在新问题中：

- 找到适用经验；
- 识别适用条件与风险边界；
- 调用正确工具完成工作；
- 遇到证据不足时停下或求助；
- 不通过修改评测规则、伪造结果等方式“骗过考试”；
- 通过后只获得与能力和风险相匹配的工作权限。

## 二、调研完整性标准

“穷尽业界”无法按互联网全部页面来证明，本项目采用**证据饱和**作为停止标准：

1. 覆盖论文、官方产品、主流开源框架、企业实践、社区问题五类渠道；
2. 关键结论至少有两个独立来源交叉支持；
3. 同时记录官方能力、真实限制与反向证据；
4. 不把 README 宣传、排行榜或单篇论文直接当成生产结论；
5. 连续两轮检索没有发现新的关键机制，才进入方案设计；
6. 对无法访问的平台明确标注，不伪称已覆盖。

## 三、五轮调研

### 第 1 轮：建立候选池

覆盖通用 Agent 评测、知识工作、浏览器、操作系统、编码和工具调用等方向。

发现的主要路线：

- [Inspect AI](https://inspect.aisi.org.uk/)：任务、Agent、工具、评分器和沙箱组成的通用评测框架。
- [AgentBench](https://github.com/THUDM/AgentBench)：在操作系统、数据库、知识图谱、网页等多环境测试 Agent。
- [OSWorld](https://github.com/xlang-ai/OSWorld)：让 Agent 在隔离的真实桌面环境完成开放任务。
- [BrowserGym](https://github.com/ServiceNow/BrowserGym)：统一运行浏览器任务和收集执行轨迹。
- [WorkArena](https://github.com/ServiceNow/WorkArena)：以 ServiceNow 模拟真实知识工作任务，而非知识问答。
- [τ²-bench](https://github.com/sierra-research/tau2-bench)：测试工具、Agent 与用户在真实业务规则下的多轮协作。
- [MLE-bench](https://github.com/openai/mle-bench)：用真实机器学习工程任务和可执行结果评估 Agent。
- [Cua Bench](https://github.com/trycua/cua)：创建计算机操作任务、运行 Agent、验证结果并导出轨迹。

**本轮结论：**“考试”不应是选择题，而应是数字员工在可还原环境中完成一项新工作。

### 第 2 轮：研究怎样出题

对比 WorkArena、OSWorld、AgentBench、MLE-bench 和传统工作样本测评后，题目应包含：

- 初始环境；
- 用户目标；
- 可用工具和权限；
- 必须遵守的业务规则；
- 可观察的成功状态；
- 明确禁止的行为；
- 未知信息和应当求助的节点。

考试题不能原样复制学习材料。应从真实历史任务中抽取任务骨架，再替换服务、指标、版本、故障组合和干扰项，形成未见案例。

**本轮结论：**题目测的是经验迁移和边界判断，不是记忆复述。

### 第 3 轮：研究怎样判分

主要参考：

- [Anthropic：Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Agent-as-a-Judge](https://github.com/metauto-ai/agent-as-a-judge)
- [LangSmith Evaluation](https://docs.smith.langchain.com/evaluation)
- [Braintrust Evals](https://www.braintrust.dev/docs/guides/evals)
- [Arize Phoenix Evaluation](https://docs.arize.com/phoenix/evaluation/llm-evals)

共同结论：

1. **最终环境状态优先。** Agent 说“完成了”不代表真的完成，必须检查系统实际状态。
2. **过程轨迹必须保留。** 仅看结果会漏掉越权、危险操作、跳过验证和碰巧成功。
3. **程序校验优先于模型裁判。** 能用指标、数据库、文件差异、测试结果或规则校验的，不交给 LLM 主观判断。
4. **模型裁判只补语义判断。** 例如排查计划是否合理、解释是否引用证据；不能单独决定通过。
5. **高风险和争议项才人工复核。** 不要求专家逐题批改。

反向证据：

- [LLM-as-a-Judge 可靠性研究](https://arxiv.org/abs/2408.13006)指出裁判结果会受到提示模板和模型偏差影响。
- [Agent-as-a-Judge](https://arxiv.org/abs/2410.10934)显示逐步取证优于只看最终答案，但其公开验证主要集中在软件开发任务，不能直接证明适用于 Oncall。
- 社区案例指出模型裁判可能给“从未打开文件的 Agent”高分：[Hacker News 讨论](https://news.ycombinator.com/item?id=44334142)。

**本轮结论：**采用“确定性结果校验为主、轨迹规则校验为辅、模型裁判补充、异常人工复核”的混合判分。

### 第 4 轮：研究稳定性与防作弊

主要问题：

- 同一个 Agent 多次运行结果会波动；
- 测试环境和评测器自身也可能有错误；
- Agent 可能修改测试文件、绕过验证或利用规则漏洞；
- 公布的题目可能被模型训练数据污染。

社区证据：

- [τ²-bench 评分差异问题](https://github.com/sierra-research/tau2-bench/issues/51)
- [τ²-bench 运行噪声讨论](https://github.com/sierra-research/tau2-bench/issues/540)
- [OSWorld 成功率计算异常](https://github.com/xlang-ai/OSWorld/issues/279)
- [WorkArena 校验器错误](https://github.com/ServiceNow/WorkArena/issues/23)
- [WorkArena UI 状态导致无法测试](https://github.com/ServiceNow/WorkArena/issues/74)

防作弊与稳定性策略：

- 冻结考试镜像和评测器版本；
- 考生只拥有完成任务所需的最小权限；
- 评测器位于考生不可修改的独立环境；
- 同时检测目标状态、禁止动作和关键步骤；
- 使用隐藏测试和动态生成参数；
- 同一能力运行多次，记录成功率而非一次定生死；
- 保存完整轨迹、环境版本和评分器版本，保证可复现；
- 评测器先通过参考解和故障注入测试。

**本轮结论：**一次成功只能证明“这次完成”，不能证明稳定能力。

### 第 5 轮：研究通过考试后怎样放权

行业评测框架普遍能给分，但“通过后直接接生产任务”仍缺少完整解决方案。结合 NIST 风险管理、生产在线评测和 Agent 安全实践，能力与权限必须分开。

建议采用逐级准入：

```text
学习完成
  ↓
知识边界测试
  ↓
只读沙箱任务
  ↓
可回滚的模拟操作
  ↓
影子执行：给建议但不生效
  ↓
低风险真实任务，关键动作审批
  ↓
在明确范围内有限自主执行
```

升级依据：

- 多个未见任务连续通过；
- 能识别证据不足并主动停下；
- 无越权、无禁止动作；
- 线上影子结果与真实处理结果一致；
- 一段时间内没有严重反例。

降级依据：

- 同类问题复发；
- 任务被回滚；
- 环境或版本变化；
- 出现越权或错误归因；
- 所依赖经验卡片被降级、撤回或失效。

**本轮结论：**考试只授予能力印记，不直接授予线上操作权；执行权由风险、环境、授权和近期表现共同决定。

## 四、方案对比

| 方案 | 优点 | 主要问题 | 是否采用 |
|---|---|---|---|
| 知识问答考试 | 快、便宜 | 只能测记忆，无法证明会工作 | 不作为核心 |
| 专家逐题评审 | 判断细致 | 人工成本高，无法规模化 | 只处理异常 |
| 仅 LLM 裁判 | 可自动化 | 有偏差、可被漂亮表述误导 | 仅补充语义判断 |
| 仅检查最终结果 | 客观直接 | 可能漏掉越权和碰巧成功 | 不单独使用 |
| 结果校验 + 轨迹审计 | 同时检查做成与做法 | 需要建设任务环境和校验器 | 核心方案 |
| 直接用生产任务考试 | 真实性高 | 风险不可接受 | 不采用 |
| 沙箱 → 影子 → 有限放权 | 兼顾真实性与安全 | 建设成本较高 | 推荐 |

## 五、当前最优方向

步骤 06 应建设的不是“考试中心”，而是**数字员工试岗场**：

1. 从真实历史工作中生成未见任务；
2. 在隔离沙箱中复现必要系统和数据；
3. 数字员工使用与实际工作相同的经验卡片和工具；
4. 以工作结果为主判分，同时审计全过程；
5. 同一能力经过多题、多次运行，形成可靠性证据；
6. 通过后获得对应等级的“能力印记”；
7. 先进入影子工作，再逐步获得有限真实权限；
8. 后续真实工作结果持续触发升级或降级。

## 六、对 Oncall 压测案例的直接启发

首批考试不应问“什么是 HPA”或“429 是什么”，而应给出一个新压测现场：

- CPU、内存仍有余量，但 Pod 扩容受阻；
- 同时出现 429 和超时；
- Trace 开关可用；
- 部分关键信息缺失；
- 所有变更只能提交计划，不允许直接操作线上。

系统检查数字员工是否：

- 先定位 Pod 调度限制，而不是只看资源利用率；
- 不把 429 默认归因模型限流；
- 把关闭 Trace 当作隔离变量，而不是最终修复；
- 对 AIGW 经验检查版本与调用路径；
- 明确缺失证据并提出下一步；
- 没有越权执行生产变更。

## 七、暂不进入设计前还需确认的问题

只剩一个产品选择需要讨论：

> 首批“试岗场”是优先做**文字化的 Oncall 仿真环境**，还是直接建设带监控、日志、变更和工单界面的**可操作压测沙箱**？

前者上线快但展示力弱；后者更像真正产品，也更能证明数字员工会工作，但建设成本更高。

## 八、关键来源

### 官方与开源

- Inspect AI：https://inspect.aisi.org.uk/
- AgentBench：https://github.com/THUDM/AgentBench
- OSWorld：https://github.com/xlang-ai/OSWorld
- BrowserGym：https://github.com/ServiceNow/BrowserGym
- WorkArena：https://github.com/ServiceNow/WorkArena
- τ²-bench：https://github.com/sierra-research/tau2-bench
- MLE-bench：https://github.com/openai/mle-bench
- Cua Bench：https://github.com/trycua/cua
- Agent-as-a-Judge：https://github.com/metauto-ai/agent-as-a-judge
- LangSmith Evaluation：https://docs.smith.langchain.com/evaluation
- Braintrust Evals：https://www.braintrust.dev/docs/guides/evals
- Arize Phoenix：https://docs.arize.com/phoenix/evaluation/llm-evals
- NIST AI RMF：https://www.nist.gov/itl/ai-risk-management-framework

### 论文与方法

- Agent-as-a-Judge：https://arxiv.org/abs/2410.10934
- LLM-as-a-Judge 系统可靠性研究：https://arxiv.org/abs/2408.13006
- OSWorld：https://arxiv.org/abs/2404.07972
- WorkArena：https://arxiv.org/abs/2403.07718
- WorkArena++：https://arxiv.org/abs/2407.05291
- MLE-bench：https://arxiv.org/abs/2410.07095

### 社区与反向证据

- OSWorld Issues：https://github.com/xlang-ai/OSWorld/issues
- WorkArena Issues：https://github.com/ServiceNow/WorkArena/issues
- τ²-bench Issues：https://github.com/sierra-research/tau2-bench/issues
- Inspect AI Issues：https://github.com/UKGovernmentBEIS/inspect_ai/issues
- Hacker News OSWorld 讨论：https://news.ycombinator.com/item?id=40113649

> Reddit 本轮访问受到平台限制，未把无法核实的帖子作为证据；X 的零散观点也未作为关键结论依据。
