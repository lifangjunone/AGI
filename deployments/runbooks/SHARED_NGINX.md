# 共享 Nginx 安全规则

共享配置：

`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`

共享容器：

`opportunity_factory_proxy`

## 强制规则

1. 配置是多产品追加式基础设施，禁止整体替换、生成或截断。
2. 单个产品只能修改自己明确范围内的 `location`。
3. 修改前备份最新文件并盘点所有已有路由。
4. 检测并发修改；配置变化后必须基于最新版本合并。
5. 尽量保持无关字节、证书、server、location、upstream 和 include 不变。
6. 必须保持 bind-mounted 配置文件 inode。
7. 必须执行 `nginx -t`。
8. 只能用 `nginx -s reload`。
9. 禁止为单产品重启或重建 `opportunity_factory_proxy`。
10. 修改后验证目标产品及代表性已有产品。
11. 任一无关路由消失或变成 404，立即恢复备份并判定部署失败。

代表性回归至少覆盖：

- `/ai-team/`
- `/flowframe/`
- `/image/`
- `/resume/`
- `/vault/`
- `/trends/`
- `meyou.lifeyoume.icu`
- `audit.lifeyoume.icu`

本规则来自真实事故：其他产品部署曾覆盖共享配置，导致 `/image/` 和
`/flowframe/` 路由消失。
