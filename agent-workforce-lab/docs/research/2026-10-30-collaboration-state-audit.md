# 正式系统协作状态与贡献回流检查

## 问题与修改

当前正式入口是 `backend/app.py` 加载 `studio.py`。检查发现 `updates`、`invite` 未限制任务执行阶段：待验收或已完成任务可以再次被改成执行／阻塞，破坏验收连续性。

- 工作更新仅允许 `working`、`blocked`。
- 成员邀请仅允许已认领且处于执行阶段的任务。
- 待验收、完成、未认领任务不能通过上述接口重新开启。
- 多成员贡献新增成员姓名快照，连接能力、贡献描述、证据索引；不会把来源真人经历直接当成数字员工已验证能力。

仅修改本项目后端和测试，未替换待评审的正式 UI，也未部署。

## 本轮公开来源

六个来源查询均返回 200；不是六轮完整 deepresearch，不宣称穷尽最优方案。

| 来源 | 本次阅读与采用边界 |
|---|---|
| [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | 每次请求校验授权与关系；客户端按钮不是服务端保护。本次状态门禁属于业务规则，不能冒充 OWASP 指定实现 |
| [W3C PROV](https://www.w3.org/TR/prov-overview/) | 来源信息连接责任主体与产物；采用贡献可追溯，不声称实现 PROV 标准 |
| [Temporal Workflow Execution](https://docs.temporal.io/workflow-execution) | 执行有生命周期及事件历史；本次只检查状态一致性，未安装 Temporal |
| [Linear Project status](https://linear.app/docs/project-status) | 状态表达项目生命周期；不把其可配置状态直接搬成本系统规则 |
| [StaffDeck README](https://raw.githubusercontent.com/OpenBMB/StaffDeck/main/README.zh.md) | 岗位边界、执行观测、介入；仅公开机制参考，未运行验证 |
| [CopilotKit README](https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/README.md) | 共享状态、持久线程、证据支持的技能；未接入 SDK 或托管能力 |

## 验证

命令：`.venv/bin/python -m pytest backend/test_studio_v2.py -q`

结果：8 passed，1 条 Starlette/httpx 弃用警告。

新增测试覆盖：

- 未认领不能邀请；
- 待验收、已验收时不能更新工作或邀请；
- 两位经过现有规则考试的成员各关联一项贡献；
- 两项相关能力分别累计一次，无关能力仍为零；
- 成员姓名、任务成员和完成状态保留；
- 重新初始化存储后，两项贡献仍可查询。

这不是独立真实能力评测。现有试岗是规则文本评分；成员邀请仍未验证缺口、资格和负载，真实 Agent 自主工作及独立评审未完成。前端尚未显示新增姓名快照，正式 UI 仍等待方向选择。不能由 8 个测试推导整体产品级目标已完成。
