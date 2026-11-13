# 牛马嘴替部署记录

## 目标

- 子产品路径：`/niuma/`
- 腾讯云应用端口：`127.0.0.1:45410`
- 阿里云共享入口：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块名：`# BEGIN/END niuma-mouthpiece`
- MaaS 应用：`niuma-mouthpiece`
- 授权逻辑模型：`lym-chat-quality`
- 服务端环境文件：`/etc/niuma-mouthpiece/app.env`，root-only

## 共享 Nginx 安全流程

1. 在阿里云读取最新共享配置，记录 inode、mtime、SHA-256。
2. 备份最新配置到同目录。
3. 盘点修改前所有 `location` 路由。
4. 只追加或更新 `# BEGIN/END niuma-mouthpiece` 块。
5. 写回前再次确认源文件 SHA 未被并发修改；如已变化，停止并重新基于最新文件合并。
6. 保持 inode，不替换文件。
7. 执行 `docker exec opportunity_factory_proxy nginx -t`。
8. 只执行 `docker exec opportunity_factory_proxy nginx -s reload`。
9. 修改后重新盘点路由，确认无既有无关路由消失。
10. 验证目标产品和代表性既有入口：
    - `/niuma/`
    - `/ai-team/`
    - `/flowframe/`
    - `/image/`
    - `/resume/`
    - `/vault/`
    - `/trends/`
    - `meyou.lifeyoume.icu`
    - `audit.lifeyoume.icu`

## 建议 Nginx 产品块

```nginx
    # BEGIN niuma-mouthpiece
    location = /niuma {
        return 301 /niuma/;
    }

    location /niuma/ {
        proxy_pass http://127.0.0.1:45410;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /niuma;
    }
    # END niuma-mouthpiece
```

## 回滚

1. 删除 `# BEGIN/END niuma-mouthpiece` 块，或把备份内容复制回原文件（保持 inode）。
2. `docker exec opportunity_factory_proxy nginx -t`
3. `docker exec opportunity_factory_proxy nginx -s reload`
4. 停止并禁用腾讯云：
   - `niuma-mouthpiece-aliyun-tunnel.service`
   - `niuma-mouthpiece.service`

## 2026-11-12 MaaS 接入

- 新增 `POST /niuma/api/diagnose`。
- 前端优先调用后端 API，后端优先调用 LifeYouMe MaaS `lym-chat-quality`。
- MaaS 异常、超时或输出不合规时，自动降级到本地 `src/diagnosis.mjs` 规则。
- MaaS state 授权前备份到 `/data/app/lifeyoume-maas/backups/maas-data-niuma-authorize-*.json`。
- 生产 Key 写入 `/etc/niuma-mouthpiece/app.env`，不进入仓库、不输出到日志。
- 由于 MaaS 容器 rootfs 只读，授权时短暂停止 `lifeyoume-maas-maas-1`，用一次性容器挂载同一 data volume 运行 `deploy/provision-maas-key.mjs`，随后立即启动 MaaS 并验证 `/health/ready`。
