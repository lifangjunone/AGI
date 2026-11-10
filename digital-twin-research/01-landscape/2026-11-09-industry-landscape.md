# 数字分身行业全景

调研日期：2026-11-09

## 核心结论

数字分身已经形成产业，但完整人格复制尚未实现。当前市场由四条路线组成：

| 路线 | 代表项目 | 成熟能力 | 主要缺口 |
| --- | --- | --- | --- |
| 认知与知识分身 | Second Me、Delphi、Personal AI | 个人资料、长期记忆、表达拟合 | 新情境判断和人格持续性 |
| 记忆与传承分身 | StoryFile、Sensay | 访谈、经验保存、证据问答 | 未记录经验无法可靠生成 |
| 形象与实时交互 | HeyGen、Tavus、D-ID | 外貌、声音、口型、实时对话 | 身体成熟，认知主要依赖通用模型 |
| 数字员工与执行 | 小冰、硅基智能 | 内容生产、客服、直播、任务执行 | 目标是岗位自动化，不是还原真人 |

## 开源判断

Second Me 是当前较完整的开源认知分身代表。其使用三层个人记忆结构：

- L0：原始资料。
- L1：自然语言事实、摘要和偏好。
- L2：Large Personal Model，中文为“大型个人模型”，即吸收个人资料后形成的参数化个人模型。

Mem0、Letta、Khoj 和 OpenDAN 提供记忆或个人 Agent 基础设施，但不能直接视为数字分身成品。

## 独立研究结论

CloneMem 基准显示，现有长期记忆系统在处理跨越一至三年的日记、邮件和社交记录时仍然困难：

- 抽象摘要方便搜索，但损失人格细节。
- 证据不足时，模型会使用通用叙事补全。
- 行为记录无法准确表达“本人尚未决定”。
- 发生过的活动不等于稳定偏好或承诺。

Twin-2K-500 的研究显示，数字分身能保留部分群体差异，但仍难以精确预测个人在新问题上的行为，并可能向刻板印象或总体平均值收缩。

## 市场判断

已经被证明的商业价值集中在：

1. 规模化重复表达：培训、营销、销售、客服和内容生产。
2. 专家时间复制：把公开内容转化为可交互问答。
3. 知识传承：退休、离职、轮岗和关键岗位交接。
4. 记忆保存：家庭、历史人物、博物馆和口述史。

尚未被充分证明的是：

1. 分身能替本人作出高风险决定。
2. 分身能长期保持与本人同步的人格。
3. 用户愿意持续为私人数字分身付费。
4. 高拟真外观能显著提升长期留存，而不是只提升首次体验。

## 关键来源

- Second Me：https://github.com/mindverse/Second-Me
- Second Me 论文：https://arxiv.org/abs/2503.08102
- CloneMem：https://arxiv.org/abs/2601.07023
- Twin-2K-500：https://daplab.cs.columbia.edu/benchmarks/twin-2k-500/
- Delphi：https://www.delphi.ai/about
- Personal AI：https://www.personal.ai/memory
- StoryFile：https://storyfile.com/
- Sensay：https://sensay.io/
- Tavus：https://docs.tavus.io/sections/replica/overview.md
- D-ID：https://www.d-id.com/ai-agents
- 小冰：https://www.xiaoice.com/article?articleid=kelongrenbanzang
