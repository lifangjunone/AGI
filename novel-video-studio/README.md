# 长卷制片厂 / Novel Video Studio

输入小说名后，自动完成合法内容源检索、影视化改编、角色/武器/场景设定、镜头视频生成和 15 分钟分集装配的本地生产控制台。

## 当前能力

- 同时执行 360 国内全网、已配置小说站点、Project Gutenberg、Open Library、Google Books，以及可选 Brave Search；每次检索记录实际查询地址、状态、命中数、耗时与错误。
- 默认配置 23 个已核验来源，覆盖中文网文、公版名著、海外原创和数字图书馆；每项记录免费模式、注册要求、下载格式、广告、版权边界和当前可用性。
- 提供“推荐小说”目录，首批收录 16 部作品级公版核验的中英文热门经典；支持语言/关键词筛选、版权依据与原文跳转，并可一键创建制片项目。
- 自动读取公版正文；商业作品可导入已获授权的 TXT/Markdown 全文，系统持久化原文件、SHA-256、字数和预览后自动继续流水线。
- 只找到作品信息或普通网页时停在版权门禁，不绕过 WAF、登录、付费机制或抓取未授权正文。
- 生成故事圣经、角色连续性 ID、武器道具、地点设定和第一集脚本。
- 每集默认严格拆为 `30 × 30 秒 = 15 分钟`，并保留每个镜头的状态和远端任务 ID。
- 对接火山方舟 Chat Completions、Seedream 图片生成和 Seedance 异步视频生成 API。
- 自动轮询视频任务，在方舟 24 小时临时 URL 失效前下载镜头，再使用 FFmpeg 装配 MP4。
- 本地 JSON 持久化生产状态；服务重启后仍可继续轮询渲染中的任务。
- 设有生产/演示模式、付费调用总开关、日预算展示和并发上限。
- 同时提供 Web、可安装手机 PWA 和 Electron 桌面 App；三端共享生产 API 与数据结构。
- 默认入口为项目工作台，支持创建、搜索、状态筛选和打开多个小说项目；进入具体项目后才显示生产流水线、小说源库、角色资产与分集队列。
- 支持资产类型筛选与大图详情、生产日志、失败任务重试、视觉结果刷新和生产清单下载。
- 全局任务中心提供完整执行历史、状态筛选、关键词搜索、项目切换、队列位次、预计等待和分批加载。
- 两级并发调度默认同时运行 2 个小说项目、每项目 4 个镜头；超限任务持久化排队并在重启后自动恢复。
- 小说检索完成后进入来源确认门禁，可按作品名、作者、年份、语言、来源、匹配度和版权状态核对版本；确认前不会处理正文。
- 固定六节点均可点击查看结构化输入、完整产物摘要、起止时间和错误，历史任务同样支持回看。

默认是 `demo` 模式：可以体验来源、剧本、资产和镜头规划，不会调用生成模型，也不会产生 MP4。界面会明确显示“演示预览 / 0 个视频已生成”，不会再把模拟镜头标记为真实完成。

## 启动

环境要求：Node.js 20+、FFmpeg、FFprobe。

安装依赖并创建本地配置：

```bash
cd /Users/bytedance/Desktop/agi/novel-video-studio
npm install
cp .env.example .env.local
```

Web：

```bash
npm run web
# http://127.0.0.1:4321/web/
```

手机 App（PWA）：

```bash
npm run mobile
# 终端会输出手机可访问的局域网 /mobile/ 地址
```

手机浏览器可将其添加到主屏幕；正式部署需要 HTTPS 才能稳定使用安装和离线外壳。

macOS 桌面 App：

```bash
npm run desktop:config
npm run desktop
```

桌面配置与数据保存在 `~/Library/Application Support/长卷制片厂/`，不会写入应用包。生成 arm64 应用目录：

```bash
npm run desktop:pack
```

产物位于 `dist/mac-arm64/长卷制片厂.app`。本地包默认未签名，正式分发前需完成 Apple Developer 签名与公证。

## 方舟生产配置

在 `.env.local` 中配置：

```bash
ARK_API_KEY=your-rotated-key
ARK_PLANNING_MODEL=glm-5-2-260617
ARK_IMAGE_MODEL=your-seedream-model-id
ARK_VIDEO_MODEL=doubao-seedance-2-5-260628
PRODUCTION_MODE=live
ALLOW_BILLABLE_GENERATION=false
ALLOW_BUDGET_OVERRUN=false
MAX_PROJECT_CONCURRENCY=2
MAX_VIDEO_CONCURRENCY=4
VIDEO_COST_PER_SECOND_CNY=1.512
```

任务规划默认调用方舟 Chat Completions 的 `glm-5-2-260617`；视频镜头默认调用 Seedance 2.5 的 `doubao-seedance-2-5-260628`。旧配置项 `ARK_TEXT_MODEL` 仍可作为规划模型的兼容回退。

真实生产必须同时满足 API Key、`PRODUCTION_MODE=live` 和计费授权。预算门禁会在任何生成模型调用前执行；当单集预估费用超过 `DAILY_BUDGET_CNY` 时，即使已设置 `ALLOW_BILLABLE_GENERATION=true` 也不会提交任务，除非再次显式设置 `ALLOW_BUDGET_OVERRUN=true`。

按 2026-09-09 方舟 720P 文生视频参考价约 `¥1.512/秒` 估算，15 分钟整集约 `¥1,360.80`，不包含文本、图片、失败重试等额外费用。实际费用以方舟账单为准。

API Key 仅由 Node.js 服务读取，不会发送到浏览器。`.env.local` 已被 Git 忽略。聊天中出现过的 Key 应先在方舟控制台轮换，不建议继续使用。

## 小说来源配置

默认来源位于 `config/novel-sources.json`。应用内“小说源库 → 配置来源”可维护来源名称、域名、启停状态和版权策略，修改结果保存在数据目录的 `search-sources.json`；也可通过 `NOVEL_SOURCE_CONFIG` 指定其他配置文件。设置 `DOMESTIC_WEB_SEARCH=false` 可关闭国内全网检索。完整核验表见 [`docs/FREE_NOVEL_SOURCES.md`](docs/FREE_NOVEL_SOURCES.md)。

推荐目录位于 `config/public-domain-recommendations.json`。当前 16 部作品只采用中文维基文库、Project Gutenberg 和 Standard Ebooks 等受信任来源的作品级公版依据；“策展热度”基于长期文化影响、读者认知和影视改编价值，不代表任何平台的实时榜单。实际使用仍需遵守来源条款并确认作品在使用地区的公版状态。

商业小说站点和未知网页只参与书名、作者、版本及原始地址核验，统一进入版权门禁，不会自动下载正文。公版来源也必须完成单书和使用地区核验。`求魔`已内置以下正版精确候选：

- 起点中文网：`https://www.qidian.com/book/2070910/`
- QQ 阅读：`https://book.qq.com/book-detail/481326`

`cn-qidianzww.com.cn` 已识别为非起点官方域名；它和未通过正版来源核验的 `hetushu.com` 均在服务端拒绝名单中，不能通过配置界面重新加入。

## 产能解释

`DAILY_OUTPUT_HOURS=72` 表示每日目标交付 72 小时成片，即：

- 288 集 / 日
- 30 个镜头 / 集
- 8,640 个 30 秒视频任务 / 日

这是容量规划目标，不是单机性能承诺。实际产能取决于 Seedance 模型支持的单次时长、账户 RPM/并发、审核通过率、下载带宽和预算。生产部署应使用任务队列与多 Worker，并依据实际配额调整 `MAX_VIDEO_CONCURRENCY`。

## 数据目录

```text
data/
├── state.json              # 项目与任务状态
├── search-sources.json     # 用户维护的小说检索源
├── imports/<project-id>/   # 用户导入的已授权小说正文
├── assets/<project-id>/    # 已落盘概念图
├── clips/<project-id>/     # 已落盘镜头
├── output/<project-id>/    # 15 分钟成片
└── exports/<project-id>/   # 生产清单
```

## API

- `GET /api/status`：模式、模型、FFmpeg 与产能配置
- `GET /api/projects`：项目列表
- `GET /api/recommendations`：读取作品级公版热门推荐目录
- `GET /api/search-sources`：读取已配置小说检索源
- `PUT /api/search-sources`：校验并保存小说检索源
- `POST /api/projects`：创建全自动任务，正文为 `{ "novelName": "西游记" }`
- `GET /api/projects/:id`：生产状态
- `POST /api/projects/:id/rescan`：按最新版来源注册表重新执行发现节点
- `POST /api/projects/:id/source`：确认具体作品版本并继续
- `POST /api/projects/:id/content`：导入已授权正文并继续流水线
- `POST /api/projects/:id/retry`：重试暂停或失败任务
- `POST /api/projects/:id/export`：导出生产清单

## 验证

```bash
npm test
```

当前 31 项自动化测试覆盖三端入口、公版推荐目录与 API、演示/真实生成边界、预算门禁、PWA、桌面安全配置、输入约束、任务重试、清单下载和媒体 Range 请求。完整交互测试记录见 [`dogfood-output/report.md`](dogfood-output/report.md)。

任务状态机和并发策略见 [`docs/TASK_CENTER.md`](docs/TASK_CENTER.md)。
来源确认与节点数据契约见 [`docs/PIPELINE_NODES.md`](docs/PIPELINE_NODES.md)。

方舟视频接口参考：

- 创建任务：<https://www.volcengine.com/docs/82379/1520757?lang=zh>
- 查询任务：<https://www.volcengine.com/docs/82379/1521309?lang=zh>
- 图片生成：<https://www.volcengine.com/docs/82379/1541523?lang=zh>
