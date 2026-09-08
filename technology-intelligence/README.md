# Technology Intelligence

产品类型：技术情报、主题学习与需求匹配工作台
原产品名：Technology Exploration Agent
运行形态：macOS 桌面应用 + 本地报告与 handoff 服务
下游项目：[`opportunity-factory/`](../opportunity-factory/)、[`delivery-control-center/`](../delivery-control-center/)、[`delivery-pilot/`](../delivery-pilot/)

一个每天整理 AI 前沿技术与产品 Top 10，并把技术信号转化为可验证需求和 Demo 任务的 macOS 桌面应用。

## 已接入

- 热点看板：参考 TopHub 的榜单卡片与分类导航，聚合国内、国际、科技、加密和财经内容
- Buzzing：Hacker News、国际新闻、Reddit、Product Hunt 等国外热点中文导读
- NewsNow：知乎、微博、B站、虎扑、V2EX、Product Hunt 多平台榜单
- 方程式新闻 BWEnews：Telegram 公开频道实时加密快讯与浏览量
- 6551 Daily News：通过公开 REST API 获取加密、AI、宏观新闻
- GitHub Trending：无需密钥
- Hugging Face Trending：无需密钥
- Hacker News：无需密钥
- arXiv：无需密钥
- 小红书、抖音、B站、微博、知乎实时热榜：无需密钥，使用 60s API；B站失败时自动切换公共接口
- YouTube：无密钥时解析当天公开视频搜索；配置官方 Key 或 TikHub 后使用对应 API
- X：无密钥时读取公开 AI 账号时间线，限流时回退近三日公开索引
- TikHub：可选，一把 Token 获取 YouTube、X 和国内平台的搜索、详情及互动数据
- YouTube：在应用“设置”中填写 YouTube Data API Key
- X：在应用“设置”中填写 X API Bearer Token
- 国内平台：运行 MediaCrawler 后，在“设置”中选择其 JSON/JSONL 导出目录
- 通知：macOS 本地通知；填写飞书机器人 Webhook，并在设置中打开“发送每日 Top 10 到飞书机器人”

应用首屏为“今日信号”：先过滤无意义标题、裸 URL、重复内容和明显错分类，再按平台内百分位统一热度，并将 DeepSeek、GLM、Qwen 等同主题内容聚为最多 5 条关键信号。

## 关注主题

“今日信号”顶部提供主题切换与“管理主题”入口：

- 默认关注：`AI 智能体`、`大模型与多模态`、`开源开发工具`、`RAG 与知识工程`
- 产品跟踪主题：`个人助理`、`Agent 平台`、`AI Coding`；旧配置会自动补齐缺少的产品主题
- 默认选择“全部主题”，将所有关注内容合并展示
- 点击任一主题可单独查看，今日热点、探索榜单、产品矩阵和技术雷达会同步切换
- 可新增、改名、取消关注，并为每个主题维护独立关键词；最多 10 个主题
- 保存后立即按全部关注主题重新采集
- Hacker News、arXiv、YouTube、X、TikHub、AiNews 和技术雷达统一使用关注配置
- 每条信号会记录命中的主题，每份日报会保存当天关注主题快照
- 英文关键词采用完整词或短语匹配，避免 `RAG` 误命中 `STRATEGY`

首次进入会显示简短操作引导；原生设置页也会指向首页的“管理主题”，避免两个入口产生冲突。

## 主动搜索

“主动搜索”用于按需检索当前想了解的技术或产品，不受每日关注主题限制：

- 支持“全部 / 技术 / 产品”范围切换
- 支持“近一周 / 近一个月 / 近 1 年 / 近 3 年 / 不限制”时间筛选，默认近一个月
- 同时检索产品矩阵、本机历史报告、Google News、GitHub、Hacker News 和 arXiv
- 外部来源并行查询；单个来源不可用时仍展示其他结果及来源状态
- 结果包含类型、来源、时间、摘要、证据和原始链接
- 最近 8 条搜索保存在本机，支持一键再次检索
- 使用 `Command + K` 可从任意工作区直接进入主动搜索

知识获取按渐进层级组织：

- “30 秒速读”先给出当天最该记住的 3 个结论
- 每张知识卡包含一句话结论、核心知识点、适用场景和下一步验证
- 来源证据默认折叠，需要核实时再展开，避免证据噪声打断阅读
- 可标记“已掌握”、查看今日学习进度，并切换为“只看未掌握”
- 学习状态保存在本机，刷新报告或重启应用后仍然保留

桌面端采用原生标题栏与渐进式主从工作台：原生工具栏负责“情报工作台 / 需求匹配”的顶层切换、设置、刷新和报告目录；“今日信号”默认以全宽网格总览当天内容，点击具体信号后再进入 Source List、信号列表和知识详情组成的三栏阅读模式，并可随时返回总览。“今日信号 / 探索榜单 / 技术雷达”统一从左侧资料库切换。窗口整体固定，列表与详情独立滚动，并会跟随鼠标所在显示器打开；支持键盘聚焦搜索、清晰焦点状态、明暗主题和窄窗口响应式布局。

## 项目需求与持续匹配

进入“需求匹配”可以创建长期项目需求。用户只需填写项目名称、业务领域、需求说明和关键能力，系统会：

- 每 5 分钟统一刷新已配置的数据源，并实时检索 GitHub 开源社区
- 将匹配的技术或开源项目自动关联到对应需求
- 用“需求 -> 持续扫描 -> 社区匹配 -> 落地方式”图形链路解释结果
- 展示需求覆盖、社区成熟度、许可证安全、采用建议和风险
- 给出“验证、连接、加固、上线”四步实现方案
- 保存当前结果和每次扫描历史，页面关闭后后台监控仍会继续
- 创建需求时选择 Demo 执行工具，默认使用 OneOPC，也可选择 DeliveryPilot
- 可在项目顶部、完整闭环图或任一候选方案中直接启动真实 Demo 交付
- delivery-control-center/DeliveryPilot 会回写真实阶段、进度、工作区、恢复状态和本机体验地址
- 可开启“匹配完成后自动生成 Demo”，从技术发现自动接续开发、测试、部署与验收

项目资产和交付事件分别独立保存在：

`~/Library/Application Support/Technology Exploration Agent/requirement-projects/`

`~/Library/Application Support/Technology Exploration Agent/demo-handoffs/`

原有平台热榜保留在“探索榜单”，AI 高相关内容保留在“技术雷达”。TopHub 用于探索页的信息架构参考；数据由各平台公开接口、NewsNow、Buzzing、BWEnews 和 6551 等来源提供。

## 产品情报矩阵

“产品矩阵”按厂商对齐六类产品：个人助理（桌面办公）、个人助理（手机端）、Agent 开发平台、Agent 纳管平台、知识引擎和 Code 工具。

- 当前覆盖 19 家国内外厂商，新增华为、京东、小米、美团、智谱和 DeepSeek
- 六个产品维度分别计算 `HOT 01`，并在顶部六维热榜和对应矩阵单元格同步突出展示
- 支持搜索公司或旗下产品，并勾选任意公司进行横向对比
- 支持全选、全不选和逐家公司取消；允许保持零家公司，选择结果保存在本机
- 国内重点跟踪：WorkBuddy、千问办公、豆包工作、Kimi Work、TRAE Work、阶跃桌面版
- Agent 开发平台重点跟踪：腾讯云 ADP、火山引擎 HiAgent、阿里云百炼、百度千帆，以及海外主流平台
- Agent 纳管平台重点跟踪：ADP Agent Portal、Agent ID Guard、AgentSphere、Microsoft Agent 365、Gemini Enterprise Agent Registry、Bedrock AgentCore、ServiceNow AI Control Tower 和 MuleSoft Agent Fabric
- 知识引擎重点跟踪：ima / 腾讯乐享、百炼 Agentic RAG、字节企业知识引擎、百度甄知 / 千帆知识库、NotebookLM / Cloud Search、SharePoint / Microsoft Graph、Amazon Q Business 等
- AI Coding 重点跟踪：Codex、TRAE、CodeBuddy、Qoder、Claude Code、GitHub Copilot 等
- 矩阵中的“今日动态”来自已有采集源实时匹配，支持主题、国内外、产品类型和关键词组合筛选

## 看板个性化

进入“探索榜单”后，点击顶部“自定义”可以打开“自定义看板”：

- 四种排版：自适应瀑布流、固定双列、单列阅读、紧凑三列
- 五种主题：跟随系统、明亮、深色、石墨、纸张
- 开启编辑后，可拖动标题栏调整卡片顺序
- 拖动卡片右下角，可改变占用列数，并在 5 条/10 条内容之间调整高度
- 每个平台可以单独选择默认、浅红、浅蓝、浅绿、浅黄或浅紫背景

所有偏好同时保存在 WebView 和本机配置中，刷新数据、跨日报或重启应用后仍会保留。

YouTube、X 和国内平台的凭证申请、采集命令及验收方法见
[`DATA_SOURCE_SETUP.md`](DATA_SOURCE_SETUP.md)。应用设置页也可以直接打开该指南。

## 使用

双击 `dist/Technology Exploration.app`。应用会先展示最近一次报告，然后后台刷新。

报告保存于：

`~/Library/Application Support/Technology Exploration Agent/reports/`

重新编译：

```bash
./scripts/build.sh
```

设置每天 09:00 自动打开：

```bash
./scripts/install_daily.sh 9 0
```

Agent 的完整提示词位于 `AgentPrompt.md`，可以独立用于其他 Agent 平台。

## 说明

国内五个平台的实时热榜默认无需配置。YouTube/X 可以只配置一个 TikHub Token，也可以继续使用各自官方 API。第三方 API 和 X API 可能产生费用。MediaCrawler 应遵守目标平台条款、访问频率和当地法律；本应用只读取它已经导出的本地 JSON/JSONL，不代替账号登录或绕过平台限制。
