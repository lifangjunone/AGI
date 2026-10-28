# Nexora Contracts 跨产品契约

`contracts` 是 Nexora 五个独立产品之间共享的公开协议层，不是产品，也不是需要部署的运行服务。

它的作用是让 Core、Studio、Control、客户应用和第三方 Agent 使用稳定一致的通信格式，同时避免产品之间直接引用源码或跨库读取数据。

| 内容 | 用途 |
| --- | --- |
| `openapi.yaml` | 认证、Agent 注册、发布和受治理调用等版本化 HTTP API。 |
| `events.schema.json` | 跨产品事件的统一信封结构和事件类型；消费者使用 `event_id` 保证幂等。 |
| `sdk/go` | 面向 Go 接入方的客户端类型和调用封装。 |
| `sdk/typescript` | 面向 Web、Node.js 和集成客户端的 TypeScript 类型及调用封装。 |

典型场景包括：

1. Studio 发布 Control 能够识别的不可变 Agent Manifest。
2. 客户已有 Agent 使用同一公开格式注册到 Control。
3. Core 在签名令牌中携带租户、角色和产品权益，MaaS、Studio、Runtime 与 Control 据此鉴权。
4. Studio 通过 Runtime 发现 Runtime Profile 并提交 Agent Loop 任务，不引用 Runtime 源码，也不直接连接厂商 Worker。
4. 无论 Agent 在哪里开发，Control 都对外提供稳定一致的受治理调用接口。

## 兼容性规则

- 新增可选字段属于向后兼容变更。
- HTTP 破坏性变更必须升级 `/api/vN`。
- 事件破坏性变更必须升级 `schema_version`。
- 仍有受支持消费者使用的字段不得移除。
- 消费者应忽略未知的新增字段，并使用 `event_id` 去重。
- 产品镜像发布前必须验证对应契约变更。

英文契约是标准版本。中文文档用于解释，实际字段名和协议值保持语言无关。
