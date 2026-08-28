# 本地完整 POC 落地路线

## 1. 目标场景

用一个小型示例 Web 服务证明：

1. 放入一份需求文档。
2. 系统生成可审查规格和任务。
3. 编码代理在隔离目录完成变更和测试。
4. 系统创建 PR，CI 执行全部闸门。
5. 合并后构建并签名容器。
6. 自动部署到本地环境。
7. 注入故障时可根据指标自动回滚。
8. UI/API 能看到每一步真实日志和证据。

## 2. 本机前置条件

- macOS 或 Linux
- Git、GitHub CLI
- Docker Desktop 或兼容容器运行时
- Node.js 22+ 或 Python 3.12+（控制平面二选一）
- `kind`
- `kubectl`
- `helm`
- 一个可供编码代理使用的模型凭证

不要把模型 Token、GitHub Token 或云凭证提交到仓库。优先使用系统 Keychain、环境注入或 Secret Manager。

## 3. 分阶段实施

### Phase 0：仓库与契约

**工作：**

- 初始化 Git 仓库。
- 建立 `inputs/`、`work/`、`contracts/`、`control-plane/` 等目录。
- 定义 Requirement、Spec、Task、Evidence、DeliveryRun JSON Schema。
- 定义 24 步状态机和允许转换。
- 提供一个示例需求与示例服务。

**验收：**

- 非法对象无法进入状态库。
- 状态不能跳级。
- 原始输入哈希改变时能被检测。
- `work/` 和 Secrets 不进入 Git。

### Phase 1：需求到规格

**工作：**

- 文件监听/API 接收 Markdown 和 PDF。
- 原文件存入 `inputs/requirements/<id>/`。
- 解析并生成 `requirement.json`。
- 接入 OpenSpec，生成 proposal、design、tasks、spec delta。
- 实现歧义检测和 `NEEDS_CLARIFICATION`。

**验收：**

- 同一输入重复提交保持幂等。
- 关键字段缺失时停止，不进入编码。
- 每条验收条件拥有稳定追踪 ID。
- 规格与原始输入之间可追溯。

### Phase 2：任务和本地编码代理

**工作：**

- 从规格生成任务 DAG。
- 创建 Git worktree 和一次性 Docker 沙箱。
- 接入一个编码代理。
- 设置命令、路径、网络和预算限制。
- 保存工具调用、退出码和日志。

**验收：**

- 代理不能读取 `inputs/` 之外未授权目录。
- 代理不能读取主机 Secrets。
- 任务失败后保留工作区和证据以便复盘。
- 达到尝试/费用上限后停止。
- 代理只能提交任务分支。

### Phase 3：本地确定性验证

**工作：**

- 为示例服务定义统一 `make verify` 或 `just verify`。
- 串联 format、lint、typecheck、unit、integration、build。
- 加入 Secret 扫描、依赖扫描、SAST。
- 生成 JUnit、覆盖率和 SARIF。
- 实现“失败 -> 代理修复 -> 重跑”的有界循环。

**验收：**

- 每个闸门可独立复现。
- 测试失败和基础设施失败分类准确。
- 代理不能修改闸门定义来绕过失败。
- 新需求的验收条件能映射到测试证据。

### Phase 4：GitHub PR 与 CI

**工作：**

- 自动创建带追踪信息的 PR。
- 配置受保护分支、CODEOWNERS 和必需检查。
- GitHub Actions 重跑本地同一套验证命令。
- 生成预览环境 URL 和冒烟结果。
- 根据风险等级选择自动合并或人工审批。

**验收：**

- 本地结果不能替代 CI。
- PR 来自 fork 或不可信分支时无法读取发布 Secrets。
- 任一必需检查失败时无法合并。
- 所有 Actions 固定完整 SHA。

### Phase 5：制品与供应链

**工作：**

- 合并后构建 OCI 镜像并推送 GHCR 或本地 Registry。
- 使用 Syft 生成 SBOM。
- 使用 Trivy 扫描。
- 使用 Cosign/Sigstore 签名。
- 生成 GitHub Artifact Attestation/SLSA provenance。

**验收：**

- 后续部署只使用 digest。
- 可验证制品对应的仓库、提交和工作流。
- 未签名或高危漏洞超阈值的镜像不能部署。
- staging 和 production 不重新构建。

### Phase 6：本地 Kubernetes 与 GitOps

**工作：**

- 创建 `kind` 集群和本地 Registry。
- 安装 Argo CD。
- 新建独立环境配置仓库或目录。
- CI 只更新目标镜像 digest。
- Argo CD 自动同步并报告健康状态。

**验收：**

- 手工修改集群后可检测漂移并恢复。
- CI 无集群管理员凭证。
- Git 记录能解释当前环境运行版本。
- 错误配置无法通过策略检查。

### Phase 7：渐进发布与自动回滚

**工作：**

- 安装 Argo Rollouts。
- 配置蓝绿或金丝雀流量阶段。
- 部署 Prometheus、Grafana 和 OpenTelemetry Collector。
- 定义错误率、P95 延迟和业务成功率阈值。
- 提供可控故障版本。

**验收：**

- 健康版本自动晋升至 100%。
- 故障版本在阈值窗口内自动中止并回滚。
- 指标不可用时发布暂停。
- 发布、指标和回滚事件回写 OneOPC。

### Phase 8：闭环与控制台

**工作：**

- 展示每个 DeliveryRun 的实时状态。
- 展示原始日志流，不伪造“正在执行”。
- 将需求、PR、检查、制品、部署和 SLO 串成时间线。
- 计算 DORA 指标与代理辅助指标。
- 自动生成发布总结和失败复盘草稿。

**验收：**

- 页面刷新或服务重启不丢失运行状态。
- 用户可取消、重试、批准或拒绝允许的步骤。
- 每个“成功”状态都有可点击证据。
- 从生产版本能反查原始需求。

## 4. 推荐本地服务拓扑

第一阶段使用 Docker Compose：

| 服务 | 用途 |
|---|---|
| `api` | 接收需求、查询运行状态 |
| `orchestrator` | 状态机与任务调度 |
| `worker` | 规格、代理和验证任务 |
| `postgres` | 状态、事件和关系 |
| `minio` | 日志、报告和大对象 |
| `otel-collector` | 遥测采集 |
| `prometheus` | 指标 |
| `grafana` | 看板 |

GitOps 阶段再启动 `kind` 中的：

- Argo CD
- Argo Rollouts
- 示例应用
- Prometheus 目标或集群内监控组件

## 5. 最小纵向切片

第一条真正跑通的需求建议足够小：

> 为示例服务新增 `/health/details` 接口，返回版本、提交 SHA 和依赖状态；未授权用户不得看到敏感配置。

它能覆盖：

- API 功能和权限需求
- 单元、集成、契约和安全测试
- 容器构建和版本注入
- 部署健康检查
- 运行指标和故障回滚

完成这一条闭环后，再做 UI、多仓库、数据库迁移和多代理。

## 6. 一键演示目标

最终本地入口可以收敛为：

```bash
make bootstrap          # 安装/检查依赖并启动平台
make demo-requirement   # 提交示例需求
make watch RUN_ID=...   # 实时查看真实状态与日志
make inject-failure     # 演示金丝雀失败和自动回滚
make teardown           # 清理本地环境
```

这些命令是后续实现目标，目前调研阶段不应创建无法运行的占位脚本。

## 7. 完成定义

POC 只有同时满足以下条件才算完成：

- 单次输入可自动运行到本地“生产”。
- 关键阶段全部有机器可验证证据。
- 至少演示一次成功发布和一次自动回滚。
- 重启后可以恢复未完成任务。
- 模型、Git、CI、CD 的权限彼此隔离。
- 无法确定的需求会停下来提问，而不是猜测。
- 用户能实时看到实际执行状态和日志。
