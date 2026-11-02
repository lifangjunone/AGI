# 逐能力贡献回流

## 核查来源

- [W3C PROV](https://www.w3.org/TR/prov-overview/)：实际读取定义，来源信息连接产物、活动和责任人，用于判断质量与可信度。
- [CopilotKit README](https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/README.md)：实际读取 evidence-backed Insights 与 reviewed Skills；不代表本项目接入其运行时。
- [StaffDeck](https://github.com/OpenBMB/StaffDeck)、[Relevance AI](https://docs.relevanceai.com/)、[Notion Connectors](https://www.notion.com/help/notion-ai-connectors)、[OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：参考轨迹、评审、来源权限。本轮公开页面核查，不称作穷尽业界或六轮完整深研。

## 修改

- 成果可声明多项能力贡献，每项连接任务成员的有效能力、贡献描述及成果证据编号。
- 引用不存在或空白证据、重复能力、非成员能力、失效能力时拒绝提交。
- 没有能力贡献也能验收成果，但不触发能力成长。
- 真人验收后建立任务＋能力唯一的贡献记录，保留成果版本、依据、验收账号与反馈。
- 重复验收不重复累计；无关能力不增长。
- 当前待验收版本未完成前不能再提交，已完成任务不能再提交。
- 来源失效的贡献记录不在证据页展示。
- 历史笼统计数不补造成逐能力证据；新增长以贡献账本为准。

## 验证与限制

`backend/test_studio_v2.py` 7 passed，覆盖无效引用、无关能力不增长、幂等、重启恢复。
前端构建通过；提交表单提供能力、描述、证据编号，证据弹窗显示验收回流。

前端当前一次表单只关联一项能力，后端支持多项。证据仍是人工提交文字，不是已验证工具轨迹。
仍需真实运行、独立评审、能力等级策略及多成员贡献编辑；整体目标未完成。
