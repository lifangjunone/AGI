# 考试规则的反例检查

## 发现与修复

原方法检查为“有三个匹配短语，或者答案超过 60 字”。因此只要包含证据／真人等关键词，再写足够长的无关内容，就能通过并获得接单资格。

已移除长度兜底，标记 `grading_mode=text_rules_v2`。完成的考试记录不能被重新提交覆盖；补考必须创建新记录，保留原失败结果。

这只是堵住已知规则漏洞，不是证明考试有效。文字短语匹配仍可能被投机、否定句或模板答案绕过；不能作为真实生产放权依据。真实考试与独立评分仍待建设。

## 本轮来源核查

六个公开查询均 200，不称六轮深度研究。

- [Anthropic Agent Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)：实际读取 grader 对期望输出与环境结果进行验证的段落；复杂 Agent 需要跨轮轨迹和环境结果，不是答案长度。
- [W3C PROV](https://www.w3.org/TR/prov-overview/)：实际读取来源连接产物、活动与主体，用来判断质量与可靠性。
- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：每次请求校验与拒绝默认参考。
- [ITBench](https://github.com/IBM/ITBench)：本次地址转到 itbench-hub；只核实仓库标题，未安装或核验基准适用性。
- [AIOpsLab](https://github.com/microsoft/AIOpsLab)：本次只核实仓库标题，未运行其环境。
- [OpenAI Evals](https://github.com/openai/evals)：本次只核实框架与基准仓库标题，未接入。

## 验证

`.venv/bin/python -m pytest backend/test_studio_v2.py -q`：10 passed，1 条 Starlette/httpx 弃用警告。

新增反例：超过 60 字的无关答案，包含通用证据和暂停词，但不含所学方法，考试失败；能力仍候选，不能认领；不能覆盖失败结果；证据接口保留原答案。正常现有规则主线继续通过。

未迁移历史已通过考试或宣称旧资格均有效；应在真实评分实现后进行重新验证。正式视觉方向、低人工学习、Semantica、新路径模型运行、独立评审仍未完成。
