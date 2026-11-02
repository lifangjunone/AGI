# 能力依据：可核查，不靠等级暗示可信

## 公开参考

2026-10-30 核查六个公开页面，均返回 200；这是公开机制核查，不等于六轮完整 deep research 或实际安装体验。

- [Notion AI Connectors](https://www.notion.com/help/notion-ai-connectors)：来源引用、原有权限和断开后停止搜索。
- [StaffDeck](https://github.com/OpenBMB/StaffDeck)：README 描述来源检索、轨迹、真人接管与可追踪资产，未安装验证。
- [CopilotKit](https://github.com/CopilotKit/CopilotKit)：README 描述 evidence-backed Insights 和经过评审的 Skills，未接入本项目。
- [Relevance AI 文档](https://docs.relevanceai.com/)：知识、工具、工作组与人工批准区分。
- [Lindy Memory](https://www.lindy.ai/product/memory)：个人记忆可检查、可修改；不能据此认定已完成能力验证。
- [OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：每请求权限校验、对象关系约束。

## 代码复盘

当前“通过考试”仅由文字规则判定，不证明真实任务能力。
历史验收给成员的所有已验证能力累计次数，缺少逐能力贡献记录；不能把计数叫作该能力的独立交付证据。

## 本轮实现

- 员工成长档案和运营员工页可按能力打开证据。
- 展示来源原文、真人确认的方法与边界、考核题/作答/检查项。
- 把来源事实、真人确认和规则评分分开；显示规则评分的限制。
- 历史验收计数明确标记为不能独立证明技能，不伪造逐能力履历。
- 证据接口校验运营角色或本人分身归属。
- 来源撤回后停止返回原文、确认内容、能力方法和边界及关联考核正文。

## 验证

- `backend/test_studio_v2.py`：6 passed；证据来源关联、脱敏、撤回后不返回来源/确认/考核。
- `tests/learning-inbox.cjs`：通过 UI 打开能力证据、展开原文、375px 无整页溢出、Escape 关闭，并继续原学习流程。
- 截图：`design/review/workspace-inbox/capability-evidence-desktop.png` 与 `capability-evidence-mobile.png`。

## 未完成

逐条结论引用位置、来源版本、独立考核者、真实模型考试、逐能力贡献与验收回流仍缺少。
证据可见性改善不等于整个产品完成。
