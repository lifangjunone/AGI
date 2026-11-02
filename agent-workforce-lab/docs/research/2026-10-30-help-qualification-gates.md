# 协作加入：缺口、资格与负载门禁

## 本轮修改

正式后端邀请成员时，不再仅校验员工存在和一句邀请理由。

- 执行成员先报告具体能力缺口。
- 候选员工必须有名称匹配该缺口的有效已验证能力。
- 候选员工承担其他执行中、阻塞或待验收任务时，不允许再加入。
- 加入后为所补缺口记录 `resolved_by` 与时间。
- 多个缺口中只补齐部分，任务保持阻塞。
- 原成员、原任务及三人成组规则保持连续。

这是运营确认、服务端校验的流程，尚非 Agent 自主判断。资格名称采用精确匹配，负载暂定同时一项未完成任务，是保守首版规则，不是已验证最佳调度策略。

## 调研边界

本轮重新检查下列六个来源可访问性，均为 200；具体机制正文沿用前一轮已读取记录。不是新完成六轮深度调研，不宣称穷尽业界。

- [OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：每次请求校验关系与权限。
- [W3C PROV](https://www.w3.org/TR/prov-overview/)：来源、行为与责任主体可追溯。
- [Temporal execution](https://docs.temporal.io/workflow-execution)：生命周期与状态一致性参考，未安装。
- [Linear status](https://linear.app/docs/project-status)：状态表达当前生命周期，不能用装饰标签掩盖未解决阻塞。
- [StaffDeck](https://raw.githubusercontent.com/OpenBMB/StaffDeck/main/README.zh.md)：岗位边界、能力与执行观测参考，未实际复用。
- [CopilotKit](https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/README.md)：共享状态机制参考，未集成。

缺口精确匹配和负载上限为本项目设计决定，不归因给上述项目。

## 验证

`.venv/bin/python -m pytest backend/test_studio_v2.py -q`：9 passed，1 条 Starlette/httpx 弃用警告。

新增与扩展测试：未认领／无缺口拒绝邀请；无匹配资格拒绝；忙碌拒绝；另一任务验收释放负载后可加入；部分缺口解决仍保持 blocked；主线中两位帮手先经过现有规则考试再加入，第三人建立任务组。

前端尚未提供合格候选过滤、负载和逐缺口解决状态。旧 `tests/studio-v2.cjs` 使用未考试帮手，已不符合新门禁，未运行、不声称整套浏览器测试通过。真实模型考试、检索授权细粒度、自动协作与产品视觉确认仍未完成。
