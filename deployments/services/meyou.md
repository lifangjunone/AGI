# MeYou 部署

最后核验：2026-10-29（Asia/Shanghai）

## 公网入口

- 首页：`https://meyou.lifeyoume.icu/`
- 管理后台：`https://meyou.lifeyoume.icu/admin`
- 健康检查：`https://meyou.lifeyoume.icu/health`

阿里云 Nginx 继续负责 TLS、统一账号校验和管理员访问保护。

## 腾讯云部署

部署目录：

`/data/app/meyou-agent-network`

生产编排：

`/data/app/meyou-agent-network/compose.production.yml`

服务：

| Compose 服务 | 镜像或版本 | 数据 |
| --- | --- | --- |
| API | `meyou-agent-network-api:maas-ui-light-candidate-20261030` | PostgreSQL、Redis、LifeYouMe MaaS |
| Worker | `meyou-agent-network-worker:migrated-20261029` | PostgreSQL、Redis |
| PostgreSQL | PostgreSQL 16 Alpine | Docker Volume |
| Redis | Redis 7 Alpine | Docker Volume，AOF |

API 只绑定腾讯云 `127.0.0.1:43180`。

持久隧道：

`meyou-aliyun-tunnel.service`

它在阿里云创建 `127.0.0.1:43180`，因此共享 Nginx 无需修改。

API 和 Worker 使用不同的固定镜像是有意设计：迁移时生产中的两个容器实际来自
不同镜像。未经版本收敛验证，不得把两者同时改成同一个 `latest`。

## 数据迁移记录

- PostgreSQL 最终 dump 在两台机器间 SHA-256 一致。
- 恢复后 public schema 共 40 张表。
- Redis 使用停写后的 AOF/RDB 冷迁移，切换时 247 个键。
- Worker 启动后能继续处理 discovery 和 plaza 后台任务。

## 阿里云回滚副本

旧 API、Worker、PostgreSQL、Redis 容器均已停止并设置 `restart=no`。旧卷和
`final-cutover.dump` 暂时保留。

禁止在腾讯云仍为权威实例时启动阿里云旧 Worker 或数据库，否则会产生重复任务
或双主写入。

## 验证

```bash
ssh tencent 'cd /data/app/meyou-agent-network && sudo docker compose -f compose.production.yml ps'
ssh tencent 'systemctl is-active meyou-aliyun-tunnel.service'
ssh aliyun 'ss -lntp | grep "127.0.0.1:43180"'
curl -fsS https://meyou.lifeyoume.icu/health
```

未登录访问 `/admin` 和管理员 API 应通过统一账号规则重定向，不应直接暴露。

## MaaS 接入状态（2026-10-30 已切换）

- MeYou API 已切换到 MaaS 模式，逻辑模型为 `lym-chat-quality`，超时
  120,000 ms；不再从旧模型配置表解析供应商地址、上游模型 ID 或供应商 Key。
- MeYou 使用独立 MaaS 应用 Key，仅服务端 root-only 文件
  `private/maas.env` 持有；MaaS 应用仅授权 `lym-chat-quality`。Worker 不加载该文件，
  仍通过原 `/internal/jobs/*` 路由委托 API 调用模型。
- API 同时加入 `meyou-agent-network_default` 和外部
  `lifeyoume-maas_default` 网络，通过 `http://maas:43280/v1` 访问 MaaS；
  MaaS 宿主端口仍只监听 `127.0.0.1`，未增加公网暴露。
- 生产 API 容器内授权预检返回 `model_authorized`；真实供应商 JSON 影子验证
  thinking 关闭/开启均为 `contract_verified`，切换后延迟分别为 866 ms 和 709 ms。
- Worker 固定镜像、数据库和 Redis 未重建；正确/错误 Worker Token 分别返回
  业务参数 400/隐藏 404，近期 Worker 日志无 discovery/plaza 调用失败。
- `/admin` 已使用独立浅色 MaaS 入口；生产浏览器桌面、375px 手机和横屏验证
  逻辑模型、凭据不可见、旧编辑/reveal 隐藏、链接及无横向溢出全部通过。
- 旧管理修改/测试/启停/reveal 在 MaaS 模式返回 409；旧同步接口返回 410。
- 回滚材料位于 `/data/app/meyou-agent-network/backups/20261030143000`；
  MaaS 数据备份为
  `/data/app/lifeyoume-maas/backups/maas-data-before-meyou-20261030143000.tar.gz`。
- 共享 Nginx 未修改；MeYou、MaaS 及 Image、FlowFrame、AI Team、Resume、
  Vault、Trends、Audit 代表入口均返回 200，两条反向隧道 active。

## MaaS 接入历史核验（2026-10-30 切换前）

- API、PostgreSQL、Redis healthy，Worker running；镜像仍为上述固定版本。
- API 当前仍为 legacy 模式，无 MeYou 专用 MaaS 服务 Key，也无编译后的
  MaaS 配置模块；模型超时仍为 1,800,000 ms。
- MaaS 接入代码与只读预检尚为本地实现，不能宣称 MeYou 已切换。
- Worker 通过 `/internal/jobs/*` 委托 API 调用模型，不直接访问供应商；
  发布需验证 Worker→API 兼容性，不应增加重复模型客户端。
- 从现有 Worker 容器 GET API `/health` 返回 200，Worker Token 已配置，
  请求超时 1,860,000 ms；仅验证内网可达，不代表任务鉴权或推理成功。
- 接入前需独立应用授权/Key、API 新版本、120,000 ms 以内超时和真实供应商
  JSON/thinking 验证。参见 `lifeyoume-maas/docs/MEYOU-MIGRATION.md`。
- 本次未重启容器、修改生产配置、授权或共享 Nginx。

### 2026-10-30 迁移验收工具进展（仅本地）

- 再次只读核验线上仍为legacy、无MaaS Key/配置模块、超时1800000ms；
  API/数据库/Redis健康，Worker运行，两个固定镜像未变。
- 新增显式确认的合成JSON影子测试：thinking开/关，最多两次推理，
  首次失败即停止，不访问业务数据库或执行任务，仅输出安全结果码和延迟。
- 与正式调用共用model transport，拒绝重定向、限制8MiB响应并校验非空文本。
- MeYou API本地172项测试、类型检查通过；影子工具走通隔离MaaS HTTP
  测试供应商链路；不带确认参数的CLI返回not_confirmed且零请求。
- 尚未提供真实MeYou Key、执行生产影子测试或正式切换；不得据此宣称整合完成。

### 2026-10-30 管理读取隔离与发布范围核验（仅本地）

- 修复MaaS模式下GET模型配置仍读取/解密旧数据库配置的问题：直接返回当前
  逻辑模型、网关及不可查看凭据标签，no-store，配置缺失503，不回退旧配置。
- 回归匿名401、旧修改/测试/启停/reveal全部409且零数据库访问；
  全API173项测试通过，追加路由测试24项及类型检查通过。
- 线上固定镜像仅含编译文件、无MaaS模式分支；Worker兼容路由为
  discovery/discovery-due/plaza/plaza-continuous。本地server/Admin同时包含
  无关未发布业务改动，不可将全量本地构建作为接入专用发布。
- 本轮只读核验编译文件摘要，没有生产写入、容器重启或凭据变更。

### 2026-10-30 生产基线候选包（未上线）

- 候选镜像：`meyou-agent-network-api:maas-candidate-20261030`，
  image ID `7c9ecc9b2bbe9133624782fe59c0b4a0e0f25ce7bbf2f8f925f5942d08e863b1`。
- 构建文件保存于
  `/data/app/meyou-agent-network/releases/maas-candidate-20261030`；
  基于API固定生产镜像，仅覆盖server/model与六个MaaS辅助模块。
- 其余API文件、Web、Worker、共享模块逐目录摘要与生产基线一致；
  没有加入本地无关业务改动。Web仍为旧版，候选不是完整UI整合版本。
- 无生产环境变量/数据库网络的隔离容器验证管理读取、旧操作409、
  同步410、配置缺失503、四个原Worker路由保留及未授权404。
- 候选正式model client及两个thinking影子变体走通容器内合成HTTP供应商；
  不等同真实MaaS/供应商或Worker任务执行验证。
- 生产Compose未改、原API/Worker未重启，仍为legacy固定版本。

### 2026-10-30 Admin MaaS模式交互验证（仅本地）

- 模型配置查询按模式隔离缓存，模式切换清理输入Key和reveal状态；
  MaaS模式不显示旧供应商开关/编辑/reveal或供应商脱敏值。
- 显示逻辑模型ID、仅服务端持有的应用凭据、模型列表/应用管理入口，
  明确配置MaaS模式不等于推理已验证；读取失败不展示旧配置。
- Admin四项组件测试及Web类型检查通过；隔离浏览器验证失败重试、
  链接目标和桌面/375px/横屏无溢出，截图已检查。
- 截图：`/tmp/meyou-maas-admin-ui/`；本地Vite测试使用mock管理员接口。
- 未合入生产基线候选镜像，未发布，生产仍为legacy。

### 2026-10-30 独立Admin入口候选（未上线）

- 新候选镜像：`meyou-agent-network-api:maas-ui-candidate-20261030`，
  image ID `93c223cc959d7f47e0a9b50181af2749ce7adec967624e7820f77abacbc89b48`。
- 构建输入保存于
  `/data/app/meyou-agent-network/releases/maas-ui-candidate-20261030`。
- Admin独立入口只用于/admin、/admin/、/admin/login；原首页及业务页面
  资源目录摘要与生产基线一致，新增admin-entry.html和admin-assets。
- 隔离候选容器验证精确入口/查询参数/原首页、管理API及模型合成HTTP；
  生产构建浏览器验证失败重试、隐藏旧操作、链接和三种视口通过。
- Admin四项组件测试和独立Web构建通过；最新全API类型检查被并发新增的
  admin-identity.test.ts类型断言错误阻断，未修改该无关文件。
- 没有发布生产、配置Key或执行真实影子调用。

### 2026-10-30 浅色Admin候选（随后上线）

- 新候选镜像：`meyou-agent-network-api:maas-ui-light-candidate-20261030`，
  image ID `bcf5a52d3363ce7883867e45e546441bf0bee5d8b7f647e31ce0e040d76f3b60`。
- 构建输入保存于
  `/data/app/meyou-agent-network/releases/maas-ui-light-candidate-20261030`；
  在独立Admin入口候选基础上，将管理界面调整为白色侧栏、浅灰内容区和靛蓝交互色。
- 生产构建在桌面、375px手机和横屏视口通过失败重试、旧操作隐藏、
  链接目标及无横向溢出回归；截图已人工检查。
- 无生产环境变量和数据库网络的隔离容器验证Admin精确入口、管理API、
  四个原Worker路由、正式模型客户端与两个thinking影子变体。
- 排除八个MaaS后端模块及新增Admin资源后，原API、原业务Web、Worker和
  shared目录文件摘要均与固定生产镜像一致。
- 该候选随后通过专用 MeYou 服务 Key、真实供应商影子验证和 Worker 兼容验收，
  已作为当前 API 镜像上线；生产结果以本页“已切换”状态为准。
