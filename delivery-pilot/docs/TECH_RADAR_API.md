# 技术雷达 API

DeliveryPilot 启动后，本机服务监听：

```text
http://127.0.0.1:43127/api/v1
```

服务仅绑定回环地址，不接受局域网或公网连接。OpenAPI 文档：

```text
GET /api/v1/openapi.json
```

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/domains` | 业务领域分类 |
| `POST` | `/match` | 按需求匹配并评分 GitHub 开源项目 |
| `POST` | `/solutions` | 生成单项目或多项目组合方案 |
| `POST` | `/architecture` | 生成技术选型和架构图数据 |
| `GET` | `/trends/domain?domain=enterprise&limit=10` | 查询领域热门技术 |
| `GET` | `/trends/global?limit=10` | 查询热点技术、话题和事件 |
| `GET` | `/sources` | 查询已配置的数据源，密钥不会返回 |
| `POST` | `/sources` | 新增或更新数据源 |
| `POST` | `/sources/test` | 测试数据源连接 |
| `DELETE` | `/sources/{id}` | 删除非内置数据源 |

## 调用示例

```bash
curl http://127.0.0.1:43127/api/v1/domains
```

```bash
curl -X POST http://127.0.0.1:43127/api/v1/match \
  -H 'Content-Type: application/json' \
  -d '{
    "requirement": "设备检修工单、审批流程和移动端",
    "domain": "enterprise",
    "limit": 8
  }'
```

```bash
curl -X POST http://127.0.0.1:43127/api/v1/solutions \
  -H 'Content-Type: application/json' \
  -d '{
    "requirement": "企业知识库与智能问答",
    "domain": "ai"
  }'
```

## 匹配分

满分 100，由四类可解释信号组成：

- 需求相关度：45 分
- 社区热度：25 分
- 近期活跃：15 分
- 工程健康度：15 分

`realtime=false` 表示实时数据源不可用，结果来自内置候选库。此时 stars、更新时间等实时指标不会伪造。

设置 `GITHUB_TOKEN` 环境变量可提升 GitHub API 调用额度。相同需求与领域的匹配结果缓存 5 分钟，桌面 UI 和外部 API 共享缓存。

## 可插拔数据源

默认启用内置 GitHub Search 与 Hacker News。应用预置但默认不启用：

```text
/Users/bytedance/Desktop/desk_apps/Technology_Exploration
```

启用后，DeliveryPilot 读取其最新 JSON 报告并参与技术匹配、领域热榜和热点聚合，不修改它自己的配置或密钥。

第三方 HTTP 数据源的 Base URL 需要实现：

```text
GET  /health
POST /match
GET  /trends/domain
GET  /trends/global
```

`/match` 和 `/trends/*` 的请求及响应与本 API 对应接口一致。配置 Bearer Token 后，DeliveryPilot 使用：

```text
Authorization: Bearer <token>
```

配置示例：

```bash
curl -X POST http://127.0.0.1:43127/api/v1/sources \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "company-radar",
    "name": "企业技术情报中心",
    "kind": "http",
    "enabled": true,
    "priority": 30,
    "capabilities": ["match", "domain_trends", "global_trends"],
    "location": "https://radar.example.com/api/v1",
    "apiKey": "replace-with-token"
  }'
```
