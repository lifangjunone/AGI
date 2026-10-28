# Nexora Runtime · 星驰

[English](README.md) | [简体中文](README.zh-CN.md)

Nexora Runtime 是独立的企业级 Agent 执行平台，负责 Runtime 适配器、Runtime Profile、健康检查、任务调度、任务状态、执行预算与动态轨迹。Studio 只引用 Runtime Profile，不直接连接 Worker 或厂商 Runtime。

> 当前是开发实现，不具备生产级完整闭环。共享宿主机升级已禁用；隔离镜像部署、
> 审批、PostgreSQL 与资源执行仍待交付。详见[交付状态](../docs/usability-delivery.zh-CN.md)。

产品包含三个可独立扩缩容的进程：

- `api`：Runtime Control Plane 和版本化 `nexora-runtime-v1` 任务接口。
- `adapters`：独立 Go Module，包含 Adapter 接口、注册表、配置校验、健康检查和流式任务请求实现。
- `worker`：Go 实现的 Nexora 官方 Native Runtime 网关。
- `web`：管理 Runtime Profile、适配器和任务运行的控制台。

第三方 Runtime 实现 `POST /v1/tasks/stream` 并返回 SSE。Native Runtime 使用完全相同的协议，不再是 Studio 内部的特殊执行路径。

## Native Agent Loop

Native Worker 使用真正的
[oh-my-pi](https://github.com/can1357/oh-my-pi) Agent Loop 作为进程隔离的执行内核，
通过其官方 Go RPC SDK 接入。我们没有把一个不完整的逐行 Go 改写冒充为等价内核：
oh-my-pi 包含大型 TypeScript Agent Loop、Rust Native Core、工具、MCP、Skill、
会话、上下文压缩、权限、子 Agent 和多模型兼容逻辑。

Go 网关负责企业级边界：

- 每个任务使用独立的临时工作区和 OMP 配置目录；
- 模型只通过 Nexora 星模的 OpenAI-compatible 路由访问；
- 将权限档位映射为工具白名单，并落实超时和最大工具步数；
- 清理子进程组，并将思考、正文、工具执行、重试、压缩、完成和错误转换为 SSE。

当前固定使用 oh-my-pi `18.12.6`，commit 为
`45c35e40c46166dc726ccc52f5d27f40f2449f99`。容器构建会校验 Linux
二进制的 SHA-256，许可证与版权声明见
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## Adapter 实现

```text
adapters/
├── native/
├── hermes/
├── openclaw/
├── qwenpaw/
├── workbuddy/
├── trae/
├── deepseek/
├── codex/
├── claude/
├── custom/
└── registry/
```

客户侧产品名称始终为 **Native AgentLoop**，底层执行引擎是内部可替换实现。目前支持上游目录发现及内置目录回退，但目录存在不等于兼容验证。旧共享指针升级已关闭；隔离镜像驱动及签名供应链交付前不开放升级。Helm 模板不等于实际部署与验收。第三方归属仍保留在 `THIRD-PARTY-NOTICES.md` 中。

Runtime 通过 `packages/*.json` 声明式接入执行环境。实现 `nexora-runtime-v1` 的 Runtime 无需修改平台代码；标准协议使用通用 Bridge，只有私有协议才需要很薄的 Bridge。
