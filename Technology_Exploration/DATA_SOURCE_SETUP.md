# 数据源接入指南

应用不会替你注册第三方账号，也不会把密钥上传到服务器。凭证只写入本机：

`~/Library/Application Support/Technology Exploration Agent/config.json`

## 0. 新闻热点聚合（无需配置）

应用默认接入以下公开来源：

- [今日热榜 TopHub](https://tophub.today)：作为多平台分类导航和 UI 信息架构参考。TopHub 页面可能对程序请求返回 503，因此榜单数据不依赖抓取其页面。
- [Buzzing](https://buzzing.cc)：获取 Hacker News、国际新闻、Reddit、Product Hunt 等内容的中文标题和原文链接。
- [NewsNow](https://newsnow.busiyi.world)：通过开源项目的 `/api/s` 接口获取知乎、微博、B站、虎扑、V2EX 和 Product Hunt。
- [方程式新闻 BWEnews](https://t.me/s/BWEnews)：读取 Telegram 公开频道中的加密快讯、发布时间和浏览量。
- [6551 Daily News](https://github.com/6551Team/daily-news)：调用其公开 `ai.6551.io/open/free_*` REST API，获取加密、AI 和宏观新闻。项目采用 MIT License。

公共站点可能出现限流或临时不可用。应用会让其他来源继续生成报告，并在右侧“采集状态”中真实显示失败来源。

## 1. 默认免费热榜（无需配置）

应用会直接读取别人已经维护好的 [60s API](https://github.com/vikiboss/60s)：

- 小红书：`/v2/rednote`
- 抖音：`/v2/douyin`
- Bilibili：`/v2/bili`，失败时回退 Bilibili 公共热门接口
- 微博：`/v2/weibo`
- 知乎：`/v2/zhihu`

这些接口适合获取“当前大家在讨论什么”，但不是任意关键词的全量内容搜索。公共实例可能临时失效，因此应用内置了备用实例和平台回退。

## 2. TikHub（一把 Key 覆盖所有目标平台，推荐）

TikHub 提供别人维护好的结构化社交数据 API，可覆盖 YouTube、X、小红书、抖音、Bilibili、微博、知乎等平台。它适合需要关键词搜索、内容详情、互动指标和评论的场景。

1. 打开 [TikHub 注册页面](https://user.tikhub.io/register)。
2. 注册后进入 Dashboard -> API Keys，创建 API Token。
3. 新账号有少量测试额度；后续按请求计费，调用前查看当前价格。
4. 在应用“设置”填写：
   - `TikHub API Token`
   - 中国大陆使用 `https://api.tikhub.dev`
5. 保存并刷新。配置 TikHub 后，YouTube 和 X 将优先走 TikHub，不再要求两个官方凭证。

当前接入的接口：

- YouTube 趋势：`/api/v1/youtube/web/get_trending_videos`
- X 搜索：`/api/v1/twitter/web/fetch_search_timeline`

TikHub 属于非官方只读数据服务。使用前需自行确认其条款、数据授权和业务合规要求。

未配置 TikHub 或官方 Key 时，应用仍会零配置获取：

- YouTube：解析当天上传的 AI 主题公开视频搜索结果，包含标题、频道、观看量和发布时间。
- X：读取权威 AI 账号的官方嵌入时间线；若遇到限流，回退 Google News 对 X 近三日公开内容的索引。索引回退没有点赞、转发等互动指标。

## 3. YouTube 官方 API（可选回退）

需要的数据：公开视频标题、简介、频道、发布时间、播放量、点赞数、评论数。

1. 登录 [Google Cloud Console](https://console.cloud.google.com/)。
2. 新建或选择一个项目。
3. 打开“API 和服务” -> “库”，搜索并启用 **YouTube Data API v3**。
4. 打开“API 和服务” -> “凭据” -> “创建凭据” -> “API 密钥”。
5. 编辑该密钥，在“API 限制”中只允许 **YouTube Data API v3**。
6. 打开本应用“设置”，把密钥填入 `YouTube Data API Key`，保存并刷新。
7. 报告顶部应显示 `YouTube · 已接入`，并出现 YouTube 标签。

本应用每天一次搜索约消耗 100 quota units，随后批量读取统计约消耗 1 unit。Google 项目默认配额通常为每天 10,000 units，实际额度以 Cloud Console 为准。

常见错误：

- `API key not valid`：密钥复制错误或已删除。
- `has not been used in project`：尚未启用 YouTube Data API v3。
- `quotaExceeded`：当天配额已用完，等待配额重置或申请提高额度。

## 4. X 官方 API（可选回退，可能付费）

需要的数据：近 72 小时公开帖子正文、发布时间、点赞、转发、回复、引用数。

1. 登录 [X Developer Console](https://console.x.com/)。
2. 接受开发者协议，创建 Project 和 App。
3. 在 Console 的 Billing/Credits 页面确认当前价格，购买少量 credits，并设置 spending limit。X 的计费规则会变化，操作前以控制台为准。
4. 进入 App 的 Keys and tokens，生成或查看 **Bearer Token**。
5. 确认项目可调用 `GET /2/tweets/search/recent`。
6. 打开本应用“设置”，把完整 Token 填入 `X Bearer Token`，保存并刷新。
7. 报告顶部应显示 `X · 已接入`，并出现 X 标签。

常见错误：

- `401 Unauthorized`：Bearer Token 无效、被重新生成或复制不完整。
- `403 Forbidden`：当前项目未购买 credits，或无 recent search 权限。
- `429 Too Many Requests`：达到当前访问频率限制，稍后重试。

不要把 Consumer Key、Consumer Secret 或 Access Token 填到此处；本应用需要的是 **Bearer Token**。

## 5. 国内平台深度采集（MediaCrawler，可选）

覆盖：小红书、抖音、快手、Bilibili、微博、百度贴吧、知乎。

1. 安装 Git 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。
2. 在单独目录执行：

```bash
git clone https://github.com/NanmiCoder/MediaCrawler.git
cd MediaCrawler
uv sync
```

3. 按 MediaCrawler 当前 README 完成浏览器登录。只采集你有权访问的公开内容，并控制频率。
4. 按平台运行关键词搜索，输出选择 `json` 或 `jsonl`。示例：

```bash
uv run main.py --platform xhs --lt qrcode --type search --save_data_option json
uv run main.py --platform bili --lt qrcode --type search --save_data_option json
uv run main.py --platform wb --lt qrcode --type search --save_data_option json
```

5. 打开本应用“设置”，将 `MediaCrawler JSON 导出目录` 指向 MediaCrawler 的 `data` 目录。
6. 保存并刷新。应用会读取最近 7 天的 `.json` 和 `.jsonl` 内容文件，跳过评论文件。

平台参数、登录方式和输出格式可能随 MediaCrawler 版本变化，以其仓库 README 为准。请遵守平台条款、robots 规则、访问频率限制和适用法律，不要绕过账号权限或风控。

## 6. 验收

保存配置后点击“刷新”，在报告顶部检查：

- `已接入`：请求成功；后面的数字是本轮候选数。
- `待配置`：还没有填写凭证或导出目录。
- `失败`：展开报告底部错误，按上面的常见错误处理。

即使某个平台失败，其他数据源仍会继续生成报告。
