# 部署说明

本服务部署在 Tencent 应用机，Aliyun 共享 Nginx 只做代理入口。

## Tencent

建议路径：

```text
/data/app/ai-visibility-clinic/current
/etc/ai-visibility-clinic/app.env
```

systemd：

- [`deploy/ai-visibility-clinic.service`](../deploy/ai-visibility-clinic.service)
- [`deploy/ai-visibility-clinic-aliyun-tunnel.service`](../deploy/ai-visibility-clinic-aliyun-tunnel.service)

端口：

```text
127.0.0.1:45530
```

## Aliyun 共享 Nginx

共享配置：

```text
/data/app/lifeyoume-platform/deploy/nginx-platform.conf
```

只允许追加或更新 `BEGIN/END ai-visibility-clinic` 范围内的 location 块。

草案：

```nginx
# BEGIN ai-visibility-clinic
location = /ai-visibility {
    return 301 /ai-visibility/;
}

location /ai-visibility/ {
    proxy_pass http://127.0.0.1:45530;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Prefix /ai-visibility;
    proxy_connect_timeout 5s;
    proxy_read_timeout 75s;
    client_max_body_size 128k;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
}
# END ai-visibility-clinic
```

部署时必须：

1. 备份最新共享 Nginx 配置。
2. 盘点已有 location。
3. 检测并发修改。
4. 保持 bind-mounted 配置文件 inode。
5. 执行 `nginx -t`。
6. 只用 `nginx -s reload`。
7. 回归 `/ai-team/`、`/flowframe/`、`/image/`、`/resume/`、`/vault/`、`/trends/`、`meyou.lifeyoume.icu`、`audit.lifeyoume.icu`。
