# 开源原型底座审计

日期：2026-11-09

## 结论

技术不是当前瓶颈。文档解析、语音转写、检索和基础 CMMS 均有成熟开源组件。真正缺失的是可验证的数据闭环和真实接班人测试。

## 组件

| 项目 | 用途 | 活跃度快照 | 许可证 | 采用判断 |
| --- | --- | --- | --- | --- |
| [Atlas CMMS](https://github.com/Grashjs/cmms) | 自托管工单、资产、停机和历史 | 862 Star，2026-11-08 有提交 | AGPL-3.0 / 商业双许可 | 只作集成测试或独立部署，不复制进闭源产品 |
| [ERPNext](https://github.com/frappe/erpnext) | ERP、资产、库存和维护流程 | 41,111 Star，2026-11-09 有提交 | GPL-3.0 | 通过 REST API 集成，不作为产品代码底座 |
| [OCA Field Service](https://github.com/OCA/field-service) | Odoo 现场服务与工单 | 205 Star，2026-11-06 有提交 | AGPL-3.0 | 只作连接器目标 |
| [Docling](https://github.com/docling-project/docling) | PDF、表格、扫描件结构化 | 70,315 Star，2026-11-09 有提交 | MIT | 适合原型文档入口 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 本地语音转写 | 26,604 Star，2026-11-06 有提交 | MIT | 适合现场复盘转写 |
| [pgvector](https://github.com/pgvector/pgvector) | PostgreSQL 向量检索 | 23,625 Star，2026-11-09 有提交 | PostgreSQL License | 首版优先，减少系统数量 |
| [Qdrant](https://github.com/qdrant/qdrant) | 独立向量数据库 | 35,479 Star，2026-11-08 有提交 | Apache-2.0 | 数据量或检索复杂度上升后再引入 |
| [RAGFlow](https://github.com/infiniflow/ragflow) | 文档解析、引用和多步检索 | 93,809 Star，2026-11-09 有提交 | Apache-2.0 | 功能完整但首版偏重，可用于对照组 |

Star 和提交日期仅代表社区与活跃度快照，不代表产品质量。

## 原型边界

首版不自建 CMMS，也不向现场给出自主诊断指令。

最小技术链路：

1. 从现有 CMMS 导入脱敏已关闭工单。
2. 用 Docling 解析附件，用 faster-whisper 转写专家复盘。
3. 在 PostgreSQL 中保存事件、证据、判断、适用条件和版本。
4. 用 pgvector 召回相似事件。
5. 生成情境题、反例和 teach-back 提示。
6. 保存接班人回答、专家评分和观察性验证证据。
7. 输出故障模式覆盖矩阵和单点专家风险。

## 数据约束

公开的预测维护数据集通常只有传感器、故障标签或寿命数据，不能证明隐性判断是否成功转移。合成工单可以测试软件流程，不能用于验证产品价值。

因此：

- 软件冒烟测试可以使用公开或合成数据。
- X-008 的业务结论必须来自授权的真实工单、真实专家和真实接班人。
- 未获得真实数据前，不应投入完整产品开发。

本文件只覆盖制造验证底座。X-012 的专家身份实验、商业平台替代和一次性实验壳边界见 [X-012 构建、配置与开源底座审计](2026-11-09-x012-build-vs-config-audit.md)。
