# Indie Five Runtime

最后核验：2026-11-13（Asia/Shanghai）

## 公网入口

- `https://lifeyoume.icu/typewriter/`
- `https://lifeyoume.icu/mind-blobs/`
- `https://lifeyoume.icu/emoji-motion/`
- `https://lifeyoume.icu/agent-avatar/`
- `https://lifeyoume.icu/feihua-map/`

这五个入口分别是从用户指定的五个个人小项目方向复刻出的自有子项目：

1. Typewriter → `typewriter-room`：复古网页打字机互动玩具；
2. Mind Blobs → `mind-blobs-garden`：靠亲密度获胜的非战斗 Blob 小游戏；
3. Emoji Motion → `emoji-motion-studio`：输入文案并生成 Emoji 微动效片段；
4. AdaptiveAgentAvatar → `adaptive-agent-avatar`：根据任务主题换装的 Agent 头像；
5. 肥话地图 → `feihua-map`：播客提及地点地图 Lite，支持从节目笔记抽取地点。

## 腾讯云部署

- 部署根目录：`/data/app/indie-five-runtime`
- 当前版本链接：`/data/app/indie-five-runtime/current`
- 服务：`indie-five-runtime.service`
- 隧道：`indie-five-runtime-aliyun-tunnel.service`
- 监听：`127.0.0.1:45540`
- 环境文件：`/etc/indie-five-runtime/app.env`，root-only
- MaaS：`MAAS_BASE_URL=http://127.0.0.1:43280/v1`，模型 `lym-chat-quality`

服务使用 Python 标准库承载五个静态子项目，并提供以下 MaaS API：

- `POST /emoji-motion/api/emoji-advice`
- `POST /agent-avatar/api/avatar-role`
- `POST /feihua-map/api/extract-places`

MaaS Key 通过 MaaS 在线管理 API 创建，Key 名为
`indie-five-runtime production`。由于 MaaS 当前没有在线创建新应用接口，生产
Key 暂挂在已有 `staffdeck` 应用下并授权 `lym-chat-quality`。

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块标记：`BEGIN/END indie-five-runtime`
- Aliyun 本地监听：`127.0.0.1:45540`，由 Tencent 反向 SSH 隧道提供
- 共享容器：`opportunity_factory_proxy`

本次只追加五个 scoped location，保持共享配置 inode，执行 `nginx -t` 后使用
`nginx -s reload`，未重启或重建共享代理容器。

## 验证

2026-11-13 上线验证：

- 本地 runtime 测试通过，Python 编译通过；
- Tencent `indie-five-runtime.service` active，`NRestarts=0`；
- Tencent `indie-five-runtime-aliyun-tunnel.service` active，`NRestarts=0`；
- Aliyun `127.0.0.1:45540` 由 sshd 监听；
- 五个公网页面均返回 200；
- `emoji-advice`、`avatar-role`、`extract-places` 三个公网 API 均返回
  `source=maas`；
- 代表性既有入口回归：
  `/ai-team/`、`/flowframe/`、`/image/`、`/resume/`、`/vault/`、
  `/trends/`、`meyou.lifeyoume.icu`、`audit.lifeyoume.icu` 均正常返回
  200 或按既有策略跳转登录页。

共享 Nginx 备份：

`/data/app/backups/indie-five-runtime/nginx-20261113T095643Z`
