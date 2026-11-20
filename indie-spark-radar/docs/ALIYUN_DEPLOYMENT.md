# 阿里云部署草案

本项目是 `/Users/bytedance/Desktop/agi` 下的子项目，部署时目标是阿里云入口机和共享 Nginx，不部署到 Tencent。

## 建议运行方式

示例路径：

```text
/data/app/indie-spark-radar/current
/etc/indie-spark-radar/indie-spark.env
```

示例环境变量：

```bash
HOST=127.0.0.1
PORT=45520
BASE_PATH=/indie-spark
MAAS_BASE_URL=https://maas.lifeyoume.icu/v1
MAAS_MODEL_ID=lym-chat-quality
MAAS_SERVICE_KEY=<server-side-secret>
MODEL_TIMEOUT_MS=45000
```

## systemd 示例

见 [`deploy/indie-spark-radar.service`](../deploy/indie-spark-radar.service)。上线前需要按实际路径复制到：

```text
/etc/systemd/system/indie-spark-radar.service
```

然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now indie-spark-radar.service
curl -fsS http://127.0.0.1:45520/indie-spark/health
```

## 共享 Nginx 接入原则

共享配置：

```text
/data/app/lifeyoume-platform/deploy/nginx-platform.conf
```

必须遵守工作区规则：

1. 修改前备份最新共享配置。
2. 盘点所有已有 `location` 路由。
3. 只追加或更新 `BEGIN/END indie-spark-radar` 范围内的块。
4. 不重建、不重启 `opportunity_factory_proxy` 容器。
5. 保持 bind-mounted 配置文件 inode。
6. 执行 `nginx -t` 后只用 `nginx -s reload`。
7. 修改后验证 `/indie-spark/` 和代表性既有入口：`/ai-team/`、`/flowframe/`、`/image/`、`/resume/`、`/vault/`、`/trends/`、`meyou.lifeyoume.icu`、`audit.lifeyoume.icu`。

## Nginx location 草案

不要用整文件覆盖方式安装，只能人工或脚本化地合并这个产品块：

```nginx
# BEGIN indie-spark-radar
location = /indie-spark {
    return 308 /indie-spark/;
}

location /indie-spark/ {
    proxy_pass http://127.0.0.1:45520;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
# END indie-spark-radar
```

## 验收命令草案

```bash
curl -fsS http://127.0.0.1:45520/indie-spark/health
curl -I https://lifeyoume.icu/indie-spark/
curl -fsS https://lifeyoume.icu/indie-spark/api/projects | head
```

如果任何既有产品变成 404，应立即恢复备份并判定部署失败。
