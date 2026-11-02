# 生产服务器职责

最后核验：2026-11-02（Asia/Shanghai）

## 阿里云入口机

- SSH：`ssh aliyun`
- 地址：`101.200.39.84`
- 角色：唯一公网入口
- 规格：约 1.6 GiB 内存、2 GiB Swap

保留职责：

- Nginx 80/443
- TLS 证书与续期
- `lifeyoume.icu` 及子域名路由
- Portal `127.0.0.1:8800`
- Ops `127.0.0.1:8801`
- Auth `127.0.0.1:8802`
- Billing `127.0.0.1:8803`
- 统一账号、产品访问校验
- 腾讯云反向隧道创建的本地监听端口

共享 Nginx 配置：

`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`

共享 Nginx 容器：

`opportunity_factory_proxy`

禁止为了单个产品重启或重建该容器。

## 腾讯云应用机

- SSH：`ssh tencent`
- 地址：`82.157.55.220`
- 角色：应用和数据负载
- 规格：约 3.6 GiB 内存、2 GiB Swap
- Docker Engine：29.1.3
- Docker Compose：2.40.3

当前承载：

- StaffDeck、SSO Bridge 和对应隧道
- MeYou API、Worker、PostgreSQL、Redis 和对应隧道
- LifeYouMe MaaS Gateway、Console 和对应隧道
- MapProof 只读容器和对应隧道

应用端口只绑定 `127.0.0.1`。数据库和 Redis 只存在于 Docker 内部网络。

## 跨云连接

腾讯云主动连接阿里云，使用 systemd 管理持久反向 SSH 隧道。这样阿里云 Nginx
仍代理本机环回地址，无需开放腾讯云产品端口或大范围修改共享 Nginx。

当前隧道端口：

| 产品 | 阿里云监听 | 腾讯云目标 |
| --- | --- | --- |
| StaffDeck | `127.0.0.1:45173` | `127.0.0.1:45173` |
| StaffDeck SSO | `127.0.0.1:45174` | `127.0.0.1:45174` |
| MeYou | `127.0.0.1:43180` | `127.0.0.1:43180` |
| LifeYouMe MaaS | `127.0.0.1:43280` | `127.0.0.1:43280` |
| MapProof | `127.0.0.1:45210` | `127.0.0.1:45210` |

私钥和生产环境文件仅保存在服务器受限路径，不进入仓库。
