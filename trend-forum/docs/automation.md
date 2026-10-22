# 每日自动同步、发布与公网部署

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

## 当前已启用的 macOS LaunchAgent

当前机器已经安装两条相互独立的后台任务：

- `09:00`：`com.local.technology-exploration-daily`
  - 后台执行 Technology Exploration 采集器。
  - 当天报告已存在时跳过，避免重复采集。
  - 日志：`~/Library/Logs/technology-exploration-daily.log`
- `09:10`：`com.local.trend-forum-daily`
  - 检查当天报告，验证日期和榜单内容后生成站点数据。
  - 如果报告尚未完成，每分钟重试一次，最晚等待至 `09:40`。
  - 验证失败时保留线上旧版本，不会用旧数据生成当天文章。
  - 只原子更新服务器上的 `trends.json` 和 `posts.json`，无需每日重建整站。
  - 日志：`~/Library/Logs/trend-forum-daily.log`

任务配置：

```text
~/Library/LaunchAgents/com.local.technology-exploration-daily.plist
~/Library/LaunchAgents/com.local.trend-forum-daily.plist
```

检查运行状态：

```bash
launchctl print gui/$(id -u)/com.local.technology-exploration-daily
launchctl print gui/$(id -u)/com.local.trend-forum-daily
```

手动触发：

```bash
launchctl kickstart -k gui/$(id -u)/com.local.technology-exploration-daily
launchctl kickstart -k gui/$(id -u)/com.local.trend-forum-daily
```

## 与 Technology Exploration 的关系

`Technology Exploration` 每天 09:00 生成日报；`Trend Forum` 从 09:10 开始检查并生成网站文章。

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
