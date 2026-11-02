# 反向 SSH 隧道操作手册

## 设计

腾讯云应用只监听本机。腾讯云上的 systemd 隧道服务主动连接阿里云，并在阿里云
创建相同的 `127.0.0.1` 端口。阿里云 Nginx 因此无需知道腾讯云公网地址。

## 当前隧道

| systemd 服务 | 阿里云端口 |
| --- | --- |
| `lifeyoume-staffdeck-aliyun-tunnel.service` | 45173、45174 |
| `meyou-aliyun-tunnel.service` | 43180 |
| `lifeyoume-maas-aliyun-tunnel.service` | 43280 |

## 故障检查顺序

1. 腾讯云应用本机健康。
2. 腾讯云隧道服务为 active。
3. 阿里云对应端口由 `sshd` 监听。
4. 阿里云本机访问该端口成功。
5. 公网域名健康。

```bash
ssh tencent 'systemctl status meyou-aliyun-tunnel.service'
ssh aliyun 'ss -lntp | grep 43180'
ssh aliyun 'curl -fsS http://127.0.0.1:43180/health'
curl -fsS https://meyou.lifeyoume.icu/health
```

## 重启

只在腾讯云重启对应隧道：

```bash
ssh tencent 'sudo systemctl restart meyou-aliyun-tunnel.service'
```

不要为了隧道问题重启共享 Nginx 容器。若端口已被阿里云旧服务占用，先确认权威
实例和回滚计划，不得直接杀进程。

## StaffDeck 发布

`lifeyoume-staffdeck-aliyun-tunnel.service` 对主应用和 SSO 使用 `Requires=`。
停止主应用会连带停止隧道，之后只启动主应用不会自动恢复已经停止的隧道。

StaffDeck 整包发布必须使用：

`/data/app/lifeyoume-staffdeck/deploy/release_staffdeck.py`

先执行 `--check-only`。正式发布工具会使用 `restart` 主应用、显式启动 SSO 和
隧道，并依次验证腾讯本地、阿里云入口、公网目标产品和代表性其它产品。任一发布
后门禁失败时，工具恢复旧 AppDir。不要为 StaffDeck 发布重启共享 Nginx。
