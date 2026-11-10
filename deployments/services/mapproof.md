# MapProof 图证部署

最后核验：2026-11-02（Asia/Shanghai）

## 公网入口

- 产品：`https://lifeyoume.icu/mapproof/`
- 腾讯云健康检查：`http://127.0.0.1:45210/health`
- 数据边界：分析完全在浏览器进行，服务端不保存 Mermaid 源码或报告。

## 腾讯云

- 部署根目录：`/data/app/mapproof`
- 当前 release：`/data/app/mapproof/releases/20261102T173358`
- 当前链接：`/data/app/mapproof/current`
- 镜像：`mapproof:20261102`
- 容器：`mapproof`
- 服务：`mapproof.service`
- 隧道：`mapproof-aliyun-tunnel.service`
- 监听：`127.0.0.1:45210`

容器使用只读根文件系统、非 root `node` 用户、`no-new-privileges` 和
`cap-drop ALL`；宿主机不安装 Node/npm。

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块：`# BEGIN/END mapproof`
- 阿里云监听：`127.0.0.1:45210`，由腾讯云反向 SSH 隧道提供。
- 发布前备份：
  `/data/app/lifeyoume-platform/deploy/nginx-platform.conf.backup-mapproof-20261102T161200`

共享配置发布前 SHA-256：
`ddd9c32c501610c43fa26e4babf399df490ce3da6ba3a90659c08033c7fd9721`。

发布后 SHA-256：
`132d7737865403dc3a5913129aba202c083ddb3e4f60a3d77feedfc968fa1f0c`。

发布前后 inode 均为 `1358688`；使用现网同一镜像完成候选 `nginx -t`，
写入后再次 `nginx -t`，只执行 `nginx -s reload`，未重启或重建共享容器。

## 验证

- MapProof 单元测试 `5/5` 通过。
- 本地及公网 `1440×1000`、`1024×768`、`390×844` 浏览器回归通过，无横向溢出或控制台错误。
- 默认示例为 84 分“需复核”；问题示例为 48 分“暂缓发布”，并检出分支标签、反馈环、枢纽过密和孤立节点问题。
- 公网 MapProof、AI Team、FlowFrame、Image、Resume、Vault、Trends、MeYou、
  Audit 均为 HTTP 200。
- 腾讯云应用与隧道两个 systemd 单元均为 `active`。

2026-11-02 反馈环评分修复：

- 默认跨云示例包含 `App → Review → Source → App` 反馈环，已从 100 分“可发布”
  修正为 84 分“需复核”；
- 关键路径只展示 `User → Edge → App → Review → Report`，反馈环单独展示；
- 问题示例为 48 分“暂缓发布”，仍检出分支条件、反馈环、枢纽过密和孤立节点；
- 放大桌面画布列，源码区保持等宽横向滚动，避免 Mermaid 箭头和标签被硬换行；
- 只重建并重启 `mapproof:20261102` / `mapproof.service`，未修改共享 Nginx，
  共享配置 SHA-256 仍为
  `132d7737865403dc3a5913129aba202c083ddb3e4f60a3d77feedfc968fa1f0c`，inode 仍为
  `1358688`；
- 5 项分析器测试、生产桌面/手机浏览器回归、控制台零错误、MapProof 和八个代表性
  既有入口 HTTP 200 均通过。

2026-11-02 UI/UX 工作台重构：

- 首屏从“大标题营销页”改为“打开即工作”的审稿台：紧凑任务摘要、源码/画布/质检单导航、
  更靠上的工作区和降级到下方的商业说明；
- 三栏比例调整为源码输入、主画布、质检单，右侧突出发布可信度、关键路径、反馈环和审稿意见；
- 移动端保留 44px 触控目标，源码输入使用 16px 字号，三视口均无横向页面溢出；
- release `20261102T173358` 已重建并重启 `mapproof:20261102` / `mapproof.service`，
  `mapproof.service` 与 `mapproof-aliyun-tunnel.service` 均为 `active`；
- 未修改共享 Nginx，配置 SHA-256 仍为
  `132d7737865403dc3a5913129aba202c083ddb3e4f60a3d77feedfc968fa1f0c`，inode 仍为
  `1358688`；
- 生产 `1440×1000`、`1024×768`、`390×844` 浏览器回归通过，默认 84/“需复核”，
  问题示例 48/“暂缓发布”，控制台零错误，MapProof 和八个代表性既有入口 HTTP 200。

## 回滚

1. 将共享 Nginx 备份内容复制回原文件（不能替换 inode）。
2. 执行容器内 `nginx -t`，只用 `nginx -s reload`。
3. 验证全部代表性产品入口。
4. 停止并禁用 `mapproof-aliyun-tunnel.service` 和 `mapproof.service`。

任何无关路由丢失、变为 404 或入口健康异常都应立即执行回滚。
