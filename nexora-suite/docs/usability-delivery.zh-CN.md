# 产品可用性重构：交付状态

[English](usability-delivery.md) | [简体中文](usability-delivery.zh-CN.md)

本记录描述当前源码交付，不代表生产认证或远端验收通过。

## 本批已实现

- Core 密码使用带盐 bcrypt 哈希，重启保持已有密码，环境变量不再覆盖已有账号密码。
- 密码及哈希不进入用户 API 响应；暂停、受邀和空密码账号不能登录。
- Runtime 使用可读字号、Ant Design 表单与对话框、中英文和响应式导航；详情使用 URL，支持返回。
- 任务详情记录有界真实事件；取消按租户隔离，取消终态不被后续失败覆盖。
- 重启后将运行中任务与部署标为中断，不再无限显示运行中。
- 声明式 Nexora 协议包在启动时注册通用 Adapter，无需新增厂商 Go 包。
- 连接测试校验健康响应内容和协议，不仅检查 HTTP 200。
- 关闭不安全的共享宿主机升级与回滚；版本目录、制品存在与兼容验证分别展示。
- 在控制面与 Worker 拒绝写入、Shell 和设备操作，直到隔离及审批实现。
- 专用服务凭据实现前不执行外部 Runtime 任务，避免将 Core 用户令牌转发到外部地址。
- 删除 Studio 固定评分与 Control 假回答、假延迟、假 Token 和假成本。

## 尚未交付

| 领域 | 现状与下一步 |
| --- | --- |
| Runtime 数据 | 仍为开发 JSON 存储，待 PostgreSQL 迁移 |
| CPU/Kubernetes 部署 | 容器驱动未实现，旧部署接口返回 503 |
| 版本供应 | 仅发现与目录回退，待签名镜像与兼容测试流水线 |
| 审批 | 无审批队列与决策协议，高风险执行直接拒绝 |
| 安全边界 | 只读子进程不是企业沙箱；服务身份、端点白名单待实现 |
| 资源执行 | MCP、Skill、插件与 RAG 集成未完整实现 |
| 事件保留 | 每任务最多 1000 个事件、每事件最多 64 KiB，不是完整 Trace 归档 |
| 大规模列表 | 仍为内存索引，百万级游标与虚拟化验收未完成 |
| Studio 评测 | 无真实数据集执行器，明确返回 501 |
| Control 网关 | 源码返回 501；CPU Control 为保留内存注册数据尚未重启发布 |
| Core 身份 | 仍为自定义 JWT 登录，不是完整标准 OIDC/OAuth |
| Runtime 授权 | Core 细粒度权限校验待补全 |
| 远端与浏览器验收 | CPU 已发布；1366/1600/2048/375px、详情刷新/返回/Esc 均通过；真实 AgentLoop 完成并记录 213 条事件 |

## 发布注意

没有在用户本地启动产品服务。Core/Studio/Runtime API、Native Worker 与 Runtime Web
已发布到 CPU，MaaS 与 Control 未重启。五个页面入口返回正常，12 个 Studio Agent 保留。
备份目录：`/data00/home/lifangjun/nexora-suite/runtime/releases/usability-20261024-1005/backup`。
未修改共享 Nginx。

Core 发布前需备份状态文件。环境密码改为仅初始化使用，不再用于重置已有账号；
后续仍需实现密码找回与重置流程。
