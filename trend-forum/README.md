# Trend Forum

一个“热点聚合 + Horizon 深度精选 + 每日自动发文”的公网网站产品。

产品形态参考知乎、小红书、微博、X、V2EX 等社区/内容平台：用户进入后可以看到每日自动生成的热点文章、社区式信息流、平台热榜、数据源状态和后续社区能力规划。

公网入口规划为：

`https://lifeyoume.icu/trends/`

## 当前版本已经实现

- 社区式热点首页：顶部定位、今日自动文章、关键信号、多平台热点信息流
- 热点数据来源：读取当前机器或服务器上 `Technology Exploration / Technology Intelligence` 项目生成的日报 JSON
- 每日自动发布脚本：把最新热点报告整理为一篇“每日热点”文章
- 平台榜单切换：展示知乎、微博、小红书、X、V2EX、Bilibili 等来源对应的榜单数据
- 数据源状态展示：保留原项目采集状态，便于判断哪些来源成功/失败
- LifeYouMe 接入：已按平台静态产品方式准备 `/trends/` 子路径构建与部署脚本
- Horizon 内容增强：固定提交 `cdd95f8e881673057e3e201717836da4b8e2e0e7`，
  对候选内容评分、跨来源去重并生成摘要、背景、影响和引用
- 站内详情：精选内容通过 `/trends/?story=<stable-id>` 直接访问和分享
- 失败降级：原始榜单照常更新，旧精选保留并明确标记 `stale`

## 项目结构

```text
trend-forum/
├── config/
│   └── sources.json                 # 数据源和发布配置
│   └── horizon.json                 # Horizon 来源、Profile 和 MaaS 配置
├── data/
│   ├── trends.json                  # 从 Technology Exploration 同步来的热点数据
│   └── posts.json                   # 自动生成的每日文章
│   └── insights.json                # 最近 7 天 Horizon 深度精选
├── docs/
│   └── automation.md                # macOS 定时发布说明
├── deploy/
│   └── push-static.sh               # 部署到 lifeyoume.icu/trends/
├── scripts/
│   ├── sync-technology-report.mjs   # 同步最新热点日报
│   ├── horizon_bridge.py            # Technology Exploration → Horizon 桥接
│   └── publish-daily.mjs            # 生成每日发布文章
├── src/
│   ├── main.jsx                     # React 页面
│   └── styles.css                   # 页面样式
├── index.html
└── package.json
```

## 数据来源

中文与社区榜单不重复采集，继续复用：

`../technology-intelligence`

它生成的日报默认保存在：

`~/Library/Application Support/Technology Exploration Agent/reports/`

同步脚本会自动读取该目录下日期最新的 `YYYY-MM-DD.json`，并生成网站可消费的数据：

`public/data/trends.json`

如果你想读取其他报告目录，可以这样指定：

```bash
TREND_FORUM_REPORT_DIR="/path/to/reports" npm run sync:trends
```

## 本地使用方式

安装依赖：

```bash
npm install
```

同步热点并生成每日文章：

```bash
npm run prepare:daily
```

启动开发服务器：

```bash
npm run dev
```

构建生产包：

```bash
npm run build
```

面向 LifeYouMe 根域名子路径构建：

```bash
npm run build:portal
```

## 公网部署

部署静态站点到服务器 `/var/www/trends`：

```bash
npm run deploy
```

该脚本会：

1. 同步最新 Technology Exploration 日报；
2. 生成当天每日文章；
3. 使用 `/trends/` 作为静态资源 base 构建；
4. 上传到默认远端 `aliyun`；
5. 发布到 `https://lifeyoume.icu/trends/` 对应目录。

如需指定远端：

```bash
REMOTE=your-server-alias npm run deploy
```

同时需要将 LifeYouMe 平台配置一起部署，因为本产品已经注册进：

`../lifeyoume-platform/config/products.json`

Nginx 路由已经追加到：

`../lifeyoume-platform/deploy/nginx-platform.conf`

平台部署：

```bash
cd ../lifeyoume-platform
./deploy/push-server.sh
```

## 每 6 小时自动发布流程

生产由阿里云在上海时区 `00:00 / 06:00 / 12:00 / 18:00` 执行：

```bash
cd /Users/bytedance/Desktop/agi/trend-forum
npm run prepare:daily
```

它会依次：

1. 从 Technology Exploration 最新日报同步热点数据到 `public/data/trends.json`
2. 合并上一轮失败来源，保留完整 22 个榜单
3. 合并技术 RSS 与 GDELT，最多选择 60 条候选
4. 调用 Horizon 评分、去重和增强，最多发布 12 条精选
5. 更新 `insights.json`，并基于最新精选更新当天同一篇 `posts.json`

服务器自动化、降级和排障见 [docs/automation.md](docs/automation.md)。

如果希望公网每天自动更新，有两种部署方式：

- 本机每天执行 `npm run deploy`：适合 Technology Exploration 仍运行在你的 Mac 上。
- 服务器每天执行 `npm run prepare:daily`：前提是服务器也能生成或同步 Technology Exploration 的日报目录。

## 当前边界与后续建议

- 接数据库：SQLite / Postgres，保存用户、帖子、评论、点赞和收藏
- 接登录：手机号、邮箱、OAuth 或统一账号
- 接后台：热点入库、人工审核、草稿箱、发布日历
- 接真实定时任务：cron、LaunchAgent、GitHub Actions 或服务器队列
- 接推荐系统：按话题、来源、互动热度和用户兴趣排序

首期因国内服务器网络条件默认关闭 Reddit、Telegram 与 Google News 的 Horizon
适配器；Technology Exploration 已有对应榜单仍通过缓存合并保留。
