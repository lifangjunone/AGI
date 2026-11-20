# 状态照

最后核验：2026-11-18（Asia/Shanghai）

- 公网入口：`https://lifeyoume.icu/status-capsule/`
- 结果页：`/status-capsule/result.html`
- 健康检查：`/status-capsule/health`
- Tencent 根目录：`/data/app/status-capsule-photo`
- release：`releases/20261118-webp`
- 镜像：`status-capsule-photo:20261118-webp`（当前别名 `:current`）
- systemd：`status-capsule-photo.service`
- 隧道：`status-capsule-photo-aliyun-tunnel.service`
- Tencent 与 Aliyun 环回端口：`127.0.0.1:45620`

收藏卡展柜 UI，六种风格，上传后进入独立结果页。当前没有配置图像供应商，
生成接口仅返回结构化提示词，不能视为已经提供真实 AI 出图。没有启用付费模型。
服务端不保存原图；浏览器临时草稿可由用户清除。

共享 Nginx 仅新增 `BEGIN/END status-capsule-photo` 范围内的两个 location。
保留全部 108 个已有 location 和原配置字节，inode 保持 `1358688`。
备份：`/data/app/backups/status-capsule-photo/20261118T085627Z/nginx.conf`。
执行 `nginx -t` 后仅 reload，未重启共享容器。

验证：首页、结果页、健康检查 200；应用与隧道 active。
`/ai-team/`、`/flowframe/`、`/image/`、`/resume/`、`/vault/`、
`/trends/`、MeYou、Audit 均 200。

后续更新只切换本产品镜像并重启本产品服务，禁止覆盖共享 Nginx。

## 首次上线 502 修复

2026-11-18：首版资产传输不完整，且 PNG 保留 `600 root` 权限，容器的
node 用户读取图片触发 EACCES；静态 ReadStream 未处理 error 导致应用退出。
修复版完整包含六张图片，Docker 构建时统一 `a+rX` 权限，并处理流错误。
上线前以镜像实际 node 用户验证六张图片可读，公网六张图片完整读取均 200。
应用与隧道 `active`、`NRestarts=0`，既有六个主域产品入口回归 200。
此修复仅更新本产品镜像与服务，没有修改或重启共享 Nginx。

## 图片加载优化

2026-11-18：原始六张 PNG 合计约 21.5MB，首页现使用三张 480px WebP
展柜图与六张 240px 缩略图，共 232068 字节（约 232KB），减少约 99%。
结果页按需加载 800px WebP 参考图；原始 PNG 保留，不修改用户上传照片。
版本化 WebP 配置一年 immutable 浏览器缓存。

公网浏览器实测：桌面首次全部图片就绪约 0.35–0.61 秒；同一浏览器手机尺寸
缓存打开约 0.29 秒。这是当前测试网络的测量，不是固定 SLA。
实际图片请求全部为 WebP，没有原始 PNG；桌面/手机截图与无 JS 错误验证通过。
容器内 18 张衍生图均可读。应用/隧道 active、NRestarts=0。
既有六个主域产品入口回归 200。本次未修改共享 Nginx。
