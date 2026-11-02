# MapProof 图证部署

最后核验：2026-11-02（Asia/Shanghai）

## 公网入口

- 产品：`https://lifeyoume.icu/mapproof/`
- 腾讯云健康检查：`http://127.0.0.1:45210/health`
- 数据边界：分析完全在浏览器进行，服务端不保存 Mermaid 源码或报告。

## 腾讯云

- 部署根目录：`/data/app/mapproof`
- 当前 release：`/data/app/mapproof/releases/20261102T162000`
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

- MapProof 单元测试 `4/4` 通过。
- 本地及公网 `1440×1000`、`390×844` 浏览器回归通过，无横向溢出或控制台错误。
- 默认示例为 100 分“可发布”；问题示例为 60 分“暂缓发布”，并检出分支标签问题。
- 公网 MapProof、AI Team、FlowFrame、Image、Resume、Vault、Trends、MeYou、
  Audit 均为 HTTP 200。
- 腾讯云应用与隧道两个 systemd 单元均为 `active`。

## 回滚

1. 将共享 Nginx 备份内容复制回原文件（不能替换 inode）。
2. 执行容器内 `nginx -t`，只用 `nginx -s reload`。
3. 验证全部代表性产品入口。
4. 停止并禁用 `mapproof-aliyun-tunnel.service` 和 `mapproof.service`。

任何无关路由丢失、变为 404 或入口健康异常都应立即执行回滚。
