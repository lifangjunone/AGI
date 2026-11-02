# 可解释的帮手候选查询

## 已实现

新增运营接口 `GET /api/v2/tasks/{task_id}/helpers`，只对已认领、执行中且授权未受影响的任务开放。

返回未解决缺口、候选姓名、可补能力、关联缺口 ID、其他活跃任务数量、是否可加入及理由。只返回与任务相关的资格结果，不返回其他员工私人来源正文。

候选查询与邀请校验使用同一个规则函数；邀请时重新计算，不能靠过期页面结果加入。现有成员不列为新候选。规则模式标注 `qualification_rules`，不是模型判断。

同时修复认领的负载旁路：已承担其他未完成任务的员工不能再独立认领新任务。负载上限为暂定的一项任务，不是业界最佳调度结论。

## 本轮公开核查

以下六个来源均返回 200。本次截取部分正文，具体机制核对结合前轮阅读；不称六轮 deepresearch，不宣称穷尽。

- [Temporal execution](https://docs.temporal.io/workflow-execution)：状态转换与事件历史参考；未接运行引擎。
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：明确单元／集成测试有价值但不代替完整安全测试。
- [W3C PROV](https://www.w3.org/TR/prov-overview/)：来源模型参考；本次尾段为文献，不新增能力结论。
- [Linear status](https://linear.app/docs/project-status)：状态表达生命周期，支持对象级观察。
- [StaffDeck README](https://raw.githubusercontent.com/OpenBMB/StaffDeck/main/README.zh.md)：本次路线图仍把多数字员工沟通／分工列为未完成项，不能把它说成已验证自主团队实现。
- [CopilotKit README](https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/README.md)：AG-UI 为用户交互层，不是任务资格调度方案。

## 验证与剩余

`.venv/bin/python -m pytest backend/test_studio_v2.py -q`：9 passed，1 条 Starlette/httpx 弃用警告。

扩展测试验证忙碌候选被排除、验收释放负载后可加入、解决部分缺口后仅返回剩余缺口、已有成员不再作为候选，以及独立认领不可绕过负载。

尚未接前端帮手选择器；没有真实模型自评、独立评审、语义技能匹配或自动调度。正式视觉方向仍待用户选择，整体产品级目标未完成。
