# 调研来源

> 最后核对：2026-08-14。项目能力和版本会变化，实施前应重新核对官方文档与许可证。

优先记录官方文档和官方仓库；博客只用于案例参考，不作为安全或产品能力的唯一依据。

## 规格驱动开发

- GitHub Spec Kit  
  https://github.com/github/spec-kit  
  参考点：Constitution、Specify、Plan、Tasks、Implement 的规格驱动流程。

- OpenSpec  
  https://github.com/Fission-AI/OpenSpec  
  https://openspec.dev/  
  参考点：proposal、design、tasks、spec delta；规格与代码同仓。

- Backstage Software Templates  
  https://backstage.io/docs/features/software-templates/  
  参考点：黄金路径、脚手架、服务目录和所有权。

## 软件工程代理

- OpenHands  
  https://github.com/OpenHands/OpenHands  
  https://docs.openhands.dev/  
  参考点：本地软件代理、沙箱、终端、代码修改和扩展能力。

- SWE-agent  
  https://github.com/SWE-agent/SWE-agent  
  https://swe-agent.com/  
  参考点：GitHub Issue 到 patch 的软件工程代理及基准研究。

- AWS Sample: Autonomous Cloud Coding Agents  
  https://github.com/aws-samples/sample-autonomous-cloud-coding-agents  
  参考点：云端隔离编码代理、PR 和受保护部署环境的组合示例。

- MetaGPT  
  https://github.com/FoundationAgents/MetaGPT  
  参考点：多角色软件流程研究；不作为确定性交付平台依据。

## Git、CI/CD 与供应链

- GitHub Actions  
  https://docs.github.com/en/actions  

- GitHub deployment environments  
  https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments  
  参考点：环境保护、审批、分支限制和环境 Secrets。

- GitHub OpenID Connect  
  https://docs.github.com/en/actions/concepts/security/openid-connect  
  参考点：工作流与云平台交换短期凭证，避免长期云密钥。

- GitHub artifact attestations  
  https://docs.github.com/en/actions/concepts/security/artifact-attestations  
  参考点：制品来源、完整性、SBOM 和 SLSA 等级。

- SLSA  
  https://slsa.dev/spec/v1.0/  
  https://slsa.dev/get-started  
  参考点：构建来源证明和逐级供应链保证。

- Sigstore / Cosign  
  https://docs.sigstore.dev/  
  https://github.com/sigstore/cosign  
  参考点：制品签名和验证。

- Syft  
  https://github.com/anchore/syft  
  参考点：容器和文件系统 SBOM。

- Trivy  
  https://github.com/aquasecurity/trivy  
  参考点：依赖、镜像、文件系统和 IaC 扫描。

- CodeQL  
  https://codeql.github.com/docs/  
  参考点：代码安全分析。

## GitOps 与渐进交付

- Argo CD  
  https://argo-cd.readthedocs.io/en/stable/  
  https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/  
  参考点：Git 作为期望状态、自动同步、自愈和审计。

- Argo Rollouts  
  https://argoproj.github.io/argo-rollouts/  
  参考点：蓝绿、金丝雀、指标分析和自动晋升/中止。

- Flagger  
  https://docs.flagger.app/  
  参考点：基于指标和服务网格的渐进交付。

- OpenFeature  
  https://openfeature.dev/docs/  
  参考点：厂商中立的功能开关 API。

- Unleash  
  https://docs.getunleash.io/  
  参考点：功能开关和渐进曝光。

## 策略、安全与代理治理

- Open Policy Agent  
  https://www.openpolicyagent.org/docs/latest/  
  参考点：策略即代码。

- Conftest  
  https://www.conftest.dev/  
  参考点：使用 Rego 测试结构化配置。

- Kyverno  
  https://kyverno.io/docs/  
  参考点：Kubernetes 策略、验证和镜像验证。

- OWASP Top 10 for Agentic Applications  
  https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/  
  参考点：代理目标劫持、工具滥用、权限、供应链和级联失败风险。

- Microsoft Agent Governance Toolkit  
  https://github.com/microsoft/agent-governance-toolkit  
  参考点：MCP 工具调用前的策略控制与审计。

## 可观测性和交付度量

- OpenTelemetry  
  https://opentelemetry.io/docs/  
  参考点：日志、指标和追踪的统一采集标准。

- Prometheus  
  https://prometheus.io/docs/  

- Grafana  
  https://grafana.com/docs/grafana/latest/  

- DORA software delivery performance metrics  
  https://dora.dev/guides/dora-metrics-four-keys/  
  https://dora.dev/guides/dora-metrics/history/  
  参考点：当前五项指标为 change lead time、deployment frequency、failed deployment recovery time、change fail rate、deployment rework rate。

## 调研判断的证据边界

1. 项目 README 中的能力声明不等于生产可靠性证明。
2. Star 数、演示效果和基准分数不能替代本项目的端到端评估。
3. SaaS 产品可能具备更完整能力，但本调研优先选择可本地验证和可组合的开源组件。
4. “全自动”能力必须通过本项目的成功发布、故障注入、自动回滚和审计演示验证。
5. 所有版本、许可证、安全公告和 API 兼容性需要在实际引入时锁定并复核。
