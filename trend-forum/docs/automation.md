# Technology Exploration × Horizon 每 6 小时自动发布

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

生产完全运行在阿里云，不依赖本地 Mac。服务器使用：

- `trend-forum-refresh.timer`：每天 `00:00 / 06:00 / 12:00 / 18:00`
- `trend-forum-refresh.service`：完成采集、报告校验、数据转换和原子发布
- service 最长运行 90 分钟，文件锁阻止两轮并发写入
- 日志：`/var/log/trend-forum-refresh.log`
- 错误日志：`/var/log/trend-forum-refresh.error.log`

服务器目录：

```text
/data/app/trend-forum/automation
/data/app/trend-forum/technology-exploration
/data/app/trend-forum/horizon
/data/app/trend-forum/horizon-venv
/data/app/trend-forum/horizon-state
/etc/trend-forum/horizon.env
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
  -> Horizon 评分、去重和增强
  -> public/data/insights.json
  -> public/data/posts.json
  -> /var/www/trends/
  -> https://lifeyoume.icu/trends/
```

Horizon 固定在提交：

`cdd95f8e881673057e3e201717836da4b8e2e0e7`

每轮使用最近 12 小时窗口，最多送入 60 条候选、保留 12 条精选，少于 4 条时
不覆盖上一轮有效精选。公开详情保留最近 7 天、最多 28 个时间槽。

## 失败降级

- Technology Exploration 成功而 Horizon 失败：仍发布最新榜单，保留旧精选并
  标记 `stale`。
- 单个 RSS 或 GDELT 失败：继续处理其他成功来源，并在运行元数据记录状态。
- Horizon 少于 4 条或输出校验失败：不覆盖上一轮有效精选。
- 全部采集失败：服务失败，不覆盖线上 JSON。
- MaaS 会先执行一次小型推理预检；上游不可用、欠费或限流时快速降级，避免对
  全部候选重复失败。

查看本轮状态：

```bash
systemctl status trend-forum-refresh.service
journalctl -u trend-forum-refresh.service
tail -100 /var/log/trend-forum-refresh.log
tail -100 /var/log/trend-forum-refresh.error.log
curl -fsS https://lifeyoume.icu/trends/data/insights.json
```

`/etc/trend-forum/horizon.env` 仅保存独立 MaaS 应用
`trend-forum-horizon` 的服务 Key，权限必须保持 `0600`，不得写入仓库或日志。
