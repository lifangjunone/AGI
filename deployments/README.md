# LifeYouMe 生产部署总览

最后核验：2026-11-02（Asia/Shanghai）

本目录是整个工作区共享的非敏感生产部署知识库。任何会话在部署、迁移、重启、
故障诊断或清理线上资源前，都必须先阅读本页和
[`SERVICE_INVENTORY.md`](SERVICE_INVENTORY.md)。

## 当前架构

```text
公网用户
  │
  ▼
阿里云入口机 101.200.39.84
  ├─ Nginx / TLS / 域名
  ├─ LifeYouMe Portal / Ops / Auth / Billing
  ├─ 统一账号与产品访问校验
  └─ 127.0.0.1 产品端口
             ▲
             │ 持久反向 SSH 隧道
             │
腾讯云应用机 82.157.55.220
  ├─ StaffDeck + SSO Bridge
  ├─ MeYou API + Worker
  ├─ MeYou PostgreSQL + Redis
  ├─ LifeYouMe MaaS Gateway + Console
  ├─ MapProof 图表发布验收台
  └─ 后续迁移的计算型服务
```

阿里云是唯一公网入口。迁到腾讯云的产品仍使用原域名、原 HTTPS 和原统一账号
系统；腾讯云应用端口只监听本机，不直接暴露公网。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [`SERVICE_INVENTORY.md`](SERVICE_INVENTORY.md) | 查看每个服务当前在哪台机器、端口、运行方式和迁移状态 |
| [`HOSTS.md`](HOSTS.md) | 两台服务器职责、连接别名、公共基础设施和禁止事项 |
| [`services/staffdeck.md`](services/staffdeck.md) | AI Team / StaffDeck 部署、数据、隧道和验证 |
| [`services/meyou.md`](services/meyou.md) | MeYou API、Worker、PostgreSQL、Redis 和回滚信息 |
| [`services/maas.md`](services/maas.md) | LifeYouMe MaaS 控制台、网关、隧道、TLS 和验证 |
| [`services/mapproof.md`](services/mapproof.md) | MapProof 容器、隧道、共享入口和回滚信息 |
| [`services/lifeyoume-platform.md`](services/lifeyoume-platform.md) | Portal、Ops、Auth、Billing、统一认证库和管理员凭据 |
| [`runbooks/CROSS_CLOUD_MIGRATION.md`](runbooks/CROSS_CLOUD_MIGRATION.md) | 跨云迁移标准步骤和回滚判断 |
| [`runbooks/REVERSE_SSH_TUNNELS.md`](runbooks/REVERSE_SSH_TUNNELS.md) | 隧道检查、重启和故障诊断 |
| [`runbooks/SHARED_NGINX.md`](runbooks/SHARED_NGINX.md) | 共享 Nginx 的强制安全规则 |

## 已迁移

| 产品 | 公网入口 | 实际运行位置 | 状态 |
| --- | --- | --- | --- |
| AI Team / StaffDeck | `https://lifeyoume.icu/ai-team/` | 腾讯云 | 已迁移并验证 |
| MeYou | `https://meyou.lifeyoume.icu/` | 腾讯云 | 已迁移并验证 |
| LifeYouMe MaaS | `https://maas.lifeyoume.icu/` | 腾讯云 | 已部署；DeepSeek Chat、CPU TTS 与应用模型授权在线 |
| MapProof | `https://lifeyoume.icu/mapproof/` | 腾讯云 | 已部署并验证；浏览器本地验图，不保存输入 |

## 仍保留在阿里云

- 共享 Nginx 与 TLS
- LifeYouMe Portal、Ops、统一认证和 Billing
- 各产品 `auth_request` 访问校验
- 未迁移的产品进程和静态资源
- 已迁移服务的临时回滚副本与数据卷

## 文档维护规则

每次生产变化后必须同步更新：

1. `SERVICE_INVENTORY.md` 中对应服务的状态。
2. `services/` 下对应产品文档。
3. 若端口、服务器职责或入口变化，再更新 `HOSTS.md` 和本页架构图。
4. 记录核验日期、健康检查和代表性回归结果。

严禁记录密码、Token、API Key、私钥、Cookie 或生产环境文件内容。
