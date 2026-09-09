---
name: "ai-poc-acceptance-auditor"
description: "Builds traceable acceptance matrices and bid-response audits for enterprise AI POCs. Invoke for AI tender, POC, proposal, test, evidence, or acceptance work."
version: "0.1.0"
tags: ["AI POC", "招投标", "验收测试", "需求追踪", "商业运营"]
pricing:
  model: "per_call"
  amount_fen: 199
---

# AI POC 验收与投标应答审计

把政企 AI 项目的招标文件、需求书或 POC 要求转换成可执行、可追踪、可验收的交付矩阵。

## 触发条件

用户提出以下任一需求时调用：

- 解读 AI 项目招标文件或 POC 要求。
- 生成需求追踪矩阵、验收测试用例或证据清单。
- 检查技术建议书、投标应答或演示方案是否漏项。
- 规划知识库问答、智能客服、Agent 平台或私有化大模型 POC。

普通摘要、通用写作或与 AI 项目无关的招投标任务不调用。

## 输入

执行前确认用户已提供：

1. 招标文件、需求书、POC 方案或不少于 80 字的需求文本。
2. 项目类型，缺省为 `AI POC`。
3. 可选项目背景：客户行业、部署环境、竞标厂商、时间限制。

可以读取 PDF、Word、Markdown 或纯文本。按原始阅读顺序合并内容，保留条款编号。

## 付费调用

调用以下脚本，不得在未获得付费资源时自行模拟完整方法论：

```bash
python3 scripts/invoke.py request.json
```

`request.json` 格式：

```json
{
  "requirements_text": "按阅读顺序合并的需求原文",
  "project_type": "知识库问答 POC",
  "project_context": "国央企私有化部署，三家厂商竞标"
}
```

首次请求返回 `402` 时：

1. 从脚本输出读取 `Payment-Needed`。
2. 使用当前 Agent 的支付宝 AI 按量付费能力向用户发起付款。
3. 用户授权后，将得到的 `Payment-Proof` 写入环境变量：

```bash
PAYMENT_PROOF="<proof>" python3 scripts/invoke.py request.json
```

只有服务返回 `fulfillment_confirmed=true` 后才进入报告生成。

## 输出

严格按付费资源返回的 `required_outputs`、`analysis_dimensions`、`rules`、`scoring` 和 `schemas` 分析用户材料，并依次输出：

1. 执行摘要与总体就绪度。
2. 需求追踪矩阵。
3. POC 验收测试用例。
4. 证据采集清单。
5. 现场演示脚本。
6. 风险与缺口清单。
7. 投标应答覆盖审查。
8. 下一步责任人和决策截止时间。

每一条判断必须引用原始条款。无法证明的指标、案例、资质或能力标记为 `待确认`，禁止虚构。不得承诺中标、通过验收或特定商业结果。

## 隐私

- 只把完成分析所需的文本和项目背景发送到付费接口，不上传原始文件。
- 服务完成履约确认后清除订单中的需求原文，只保留交付结果与交易状态。
- 不在日志中输出 Payment-Proof、订单凭证或原始客户文件。
- 输出完成后删除临时 `request.json`，除非用户明确要求保留。
