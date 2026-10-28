# LifeYouMe 模型雷达

每小时收集公开来源中的最新、最热 AI 模型，按厂商与模型类型展示，并生成统一热度榜。

## 运行

需要 Node.js 20 或更高版本，不需要安装第三方依赖。

```bash
npm start
```

打开 `http://localhost:4173`。可用 `PORT=8080 npm start` 修改端口。服务默认只监听 `127.0.0.1`。

## 数据更新

- 服务启动时立即采集一次。
- 进程内每隔 1 小时自动重新采集。
- 页面上的“立即刷新”会触发一次手动采集。
- 数据源：Hugging Face Trending、OpenRouter Models，均无需 API 密钥。
- 某个数据源失败时保留其他来源；所有来源失败时优先返回上一份缓存。

热度由趋势动量 55%、发布新鲜度 25%、社区采用 20% 组成。该排序用于发现模型，不等于能力评测。

## 接口

- `GET /api/models`：读取当前榜单；缓存未过期时不会请求上游。
- `POST /api/refresh`：立即刷新榜单。
- `GET /health`：健康检查。

## 验证

```bash
npm test
npm run check
```

## 生产地址

生产环境作为 LifeYouMe 子产品运行于：

```text
https://lifeyoume.icu/models/
```

`deploy/push-server.sh` 会发布独立版本、安装 systemd 服务，并调用安全的路由安装器。路由安装器只追加 `/models` 和 `/models/`，修改前备份、校验并盘点共享配置，保留 bind mount inode，使用 `nginx -s reload`，不会重启共享代理容器。
