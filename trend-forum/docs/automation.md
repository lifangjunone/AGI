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

## macOS LaunchAgent 示例

如果希望每天 09:10 自动生成并部署公网文章，可以创建：

`~/Library/LaunchAgents/com.trend-forum.daily-publish.plist`

内容示例：

```xml
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
  <dict>
    <key>Label</key>
    <string>com.trend-forum.daily-publish</string>

    <key>WorkingDirectory</key>
    <string>/Users/bytedance/Desktop/agi/trend-forum</string>

    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/env</string>
      <string>npm</string>
      <string>run</string>
      <string>deploy</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>9</integer>
      <key>Minute</key>
      <integer>10</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/tmp/trend-forum-daily-publish.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/trend-forum-daily-publish.err</string>
  </dict>
</plist>
```

加载任务：

```bash
launchctl load ~/Library/LaunchAgents/com.trend-forum.daily-publish.plist
```

停止任务：

```bash
launchctl unload ~/Library/LaunchAgents/com.trend-forum.daily-publish.plist
```

## 与 Technology Exploration 的关系

建议先让 `Technology Exploration` 每天更早生成日报，例如 09:00；然后让 `Trend Forum` 在 09:10 同步日报并生成网站文章。

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
