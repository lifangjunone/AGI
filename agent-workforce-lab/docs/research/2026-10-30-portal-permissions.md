# 双入口权限与归属验证

## 依据

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：本轮读取官方内容，采用最小权限、默认拒绝、每请求校验、对象关系授权和越权回归测试。
- [Notion AI Connectors](https://www.notion.com/help/notion-ai-connectors)：上一轮已核实权限映射和来源限制。只参考权限表达，不声称本系统已接入这些连接器。
- [Linear Inbox](https://linear.app/docs/inbox)：上一轮已核实选择记录进入详情；刷新不应把用户正在处理的对象替换成另一条记录。

## 已实现

| 边界 | 实现 |
|---|---|
| 员工端读取 | `/api/v2/workspace?portal=employee` 只返回本人专家、分身、学习、能力和考核结果；不返回团队任务正文 |
| 员工端写入 | 关联专家、培养分身、回答及确认学习均校验账号归属 |
| 运营读取 | `portal=operations` 仅 owner/admin/operator 可用 |
| 运营写入 | 考核、任务发布、认领、进展、邀请、提交、验收均有服务端角色门禁 |
| 历史数据 | 通过对象创建审计恢复归属；无证据时不默认授予编辑权限 |
| 重复确认 | 已确认学习不能再重复生成候选能力 |
| UI 刷新 | 普通数据刷新不卸载当前页面，保留选中学习记录；跨产品切换清空旧视图并重新查询 |

角色门禁不等于自主运行：当前进展和提交接口仍用于人工操作，后续运行引擎需要独立服务身份与授权范围。

## 验证证据

- `backend/test_studio_v2.py`：4 passed；同组织两账号隔离、猜 ID 越权、普通成员发布拒绝、运营全员读取、运营本人视图过滤。
- `tests/learning-inbox.cjs`：真实 UI 创建专家→分身→两条学习→选择第二条→回答→确认→筛选→运营交接，修复刷新导致选择跳转后通过。
- 生产构建通过。
- 尚需普通成员的浏览器权限视角、成员邀请与授权管理界面、读写权限审计和会话过期治理。不能据此宣称整体产品达到完成态。
