# 运营任务空间设计评审

## 本轮目标

员工端只承担分身培养；专门运营人员在独立入口发布任务、处理协作缺口、验收成果。本轮补独立原型 `design/review/learning-workspace/operations.html`，没有覆盖正式应用。

重点不是大地图或大标题，而是任务、成员职责、求助理由和成果连续可见。正常中文无衬线，标题 24–26px，支持移动内容纵向排列。

## 调研来源与实际边界

| 来源 | 本轮结果 | 设计采用 |
|---|---|---|
| [Linear Project updates](https://linear.app/docs/project-updates) | 200；状态、挑战、下一步及成员／里程碑变化在更新历史中可查 | 任务连续工作记录，不用随机百分比代替进展 |
| [Linear Board layout](https://linear.app/docs/board-layout) | 200；列表／看板视图、按状态或成员分组，卡片空间不足需查看详情 | 三种构图比较；成果单独打开，不塞入成员卡 |
| [Relevance Workforce 尝试地址](https://docs.relevanceai.com/docs/workforce) | 404 | 不作为能力或视觉证据 |
| [StaffDeck 中文 README](https://raw.githubusercontent.com/OpenBMB/StaffDeck/main/README.zh.md) | 200；公开描述身份、岗位边界、执行记录和人工介入 | 稳定身份、职责和工作记录；未安装，不声称复用执行引擎 |
| [CopilotKit README](https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/README.md) | 200；共享状态、工具 UI、human-in-the-loop、持久线程 | 状态同步与可操作过程；SDK 不是美术设计器，本轮未安装 |
| [Carbon status 旧地址](https://carbondesignsystem.com/patterns/status-indicators-pattern/) | 404 | 不引用不存在的正文 |

以上为六个来源查询，不是六轮独立深度研究，不宣称穷尽最优方案。

## 设计技能

`product-ui-director` 约束本轮停在隔离设计评审；`frontend-design` 用任务成员和贡献关系作为视觉重心；`ui-ux-pro-max` 使用进展与提交反馈指导。

设计系统查询 `task collaboration workspace` 返回 Product Demo + Features、Cinzel/Josefin luxury 字体，明显不适用于运营工作区，未采用或持久化该结果。沿用已展示的工作区设计语言；不因技能输出强行再引入 Hero、营销 CTA 或第三方字体。

## 可演示操作

- 同一任务从晓禾独立 → 言川加入双人协作 → 若宁作为第三执行者加入，建立关联原任务的任务组。
- 加入前展示缺口、候选职责、样例资格及资料范围。执行者不能自行通过验收。
- 工作记录保留原接单与加入事件；成果按成员列出贡献。
- 验收必须先查看成果，再填写意见；支持退回修订。通过后提交按钮禁用。
- 自定义发布保留标题、目标、期望成果，不套入预置压测任务，也不伪造员工接单。

原型的三种构图为任务与现场、成员分工板、工作时间线，仅用于比较，不声称三套完整产品导航已完成。考核按钮是范围说明，不是已实现考试。

## 渲染复查与验证

第一遍截图发现任务列表成员数未随组队变化更新，手机发布按钮和人数标签断行。修改：任务成员变化同步列表；标签与主按钮不拆字。第二遍重新截图验证。

可重复脚本 `operations-check.cjs` 覆盖三个布局 × 1440×900、1024×768、768×1024、375×812，检查横向溢出、1→2→3人数与任务组、原记录连续、逐成员成果、验收、发布内容保留及无脚本异常。截图位于同一设计目录。

仍然是手动推进的虚构样例，没有模型执行、真实考试、自动采集、真实奖励或后端持久化。它用于决定产品视觉与操作结构，不能证明总目标完成。正式改版等待用户选择，后续需以真实业务状态替换交互样例。
