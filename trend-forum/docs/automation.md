# 每 6 小时自动同步、发布与公网部署

本项目的自动链路参考已有 `Technology Exploration / Technology Intelligence` 项目的数据产出。

## 手动执行

```bash
cd /Users/bytedance/Desktop/agi/trend-forum
npm run prepare:daily
```

这条命令等价于：

```bash
npm run sync:trends
npm run publish:daily
```

## 公网更新方式

如果 `Technology Exploration` 仍然运行在你的 Mac 上，推荐让本机每天执行完整部署：

```bash
cd /Users/bytedance/Desktop/agi/trend-forum
npm run deploy
```

这样每天会把新的 `trends.json`、`posts.json` 和静态页面一起上传到服务器 `/var/www/trends`，公网用户访问：

`https://lifeyoume.icu/trends/`

如果 `Technology Exploration` 后续也部署到服务器，可以改成服务器本地 cron 执行：

```bash
cd /data/app/trend-forum/current-source
npm run prepare:daily
cp -a public/data/. /var/www/trends/data/
```

这可以只更新 JSON 数据，不必每天重新发布整站。

## 当前生产环境：阿里云 systemd timer

生产环境已经迁移到阿里云，不依赖本地 Mac。服务器使用：

- `trend-forum-refresh.timer`：每天 `00:00 / 06:00 / 12:00 / 18:00`
- `trend-forum-refresh.service`：完成采集、报告校验、数据转换和原子发布
- 日志：`/var/log/trend-forum-refresh.log`
- 错误日志：`/var/log/trend-forum-refresh.error.log`

服务器目录：

```text
/data/app/trend-forum/automation
/data/app/trend-forum/technology-exploration
```

检查运行状态：

```bash
systemctl status trend-forum-refresh.timer
systemctl status trend-forum-refresh.service
```

手动触发：

```bash
systemctl start trend-forum-refresh.service
```

## 与 Technology Exploration 的关系

`Technology Exploration` 每 6 小时在阿里云生成一次报告；采集完成后立即更新网站数据。若某个来源本轮采集失败，保留该来源上一轮有效榜单，并在数据中标记为缓存。

这样可以形成：

```text
Technology Exploration 采集热点
  -> reports/YYYY-MM-DD.json
  -> Trend Forum 同步
  -> public/data/trends.json
  -> public/data/posts.json
  -> /var/www/trends/
  -> https://lifeyoume.icu/trends/
```
