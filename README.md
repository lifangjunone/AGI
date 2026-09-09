# LifeYouMe Product Workspace

这是一个由多个本地优先 AI 产品、交付工具和学习产品组成的产品工作区。每个子项目都可以独立安装、运行、测试和发布；根目录只负责项目导航、协作关系和统一命名。

Opportunity Factory 正从 GitHub 审计实验转向“政企 AI POC 验收与投标应答审计”Pay Skill；旧网站保留用于历史数据，不再作为主要商业方向。

当前生产状态：支付宝应用 `2021006197631772` 已上线，服务 `API_4BAB0CE91B3743BE` 已激活，卖家 ID 已配置，Pay Skill 在 `8788` 运行并由 `audit.lifeyoume.icu/api/pay-skills/` 暴露。已通过不付款的输入校验检查；真实付款和陌生用户收入仍待验证。

## 项目目录

| 目录 | 产品 | 定位 | 技术形态 |
| --- | --- | --- | --- |
| [`lifeyoume-platform/`](lifeyoume-platform/README.md) | LifeYouMe Platform | 产品门户、运营控制、身份/支付边界和私有健康检查 | Python、systemd、Nginx |
| [`technology-intelligence/`](technology-intelligence/README.md) | Technology Intelligence | 技术信号聚合、主题学习、需求匹配和 Demo 交接 | Python、Objective-C、WebKit |
| [`opportunity-factory/`](opportunity-factory/README.md) | Opportunity Factory | 将政企 AI 招标与 POC 材料转为可追踪的验收矩阵，通过 Pay Skill 按次自动收款与交付 | Python、SkillHub、支付宝 A2M、Objective-C |
| [`delivery-control-center/`](delivery-control-center/README.md) | Delivery Control Center | 从需求输入到研发、测试、部署和交付收据的桌面控制中心 | Electron、Node.js |
| [`delivery-pilot/`](delivery-pilot/README.md) | DeliveryPilot | Tauri 研发交付驾驶舱，负责执行、恢复、验收和质量门禁 | Tauri 2、React、Rust、Swift、SQLite |
| [`english-speaking-coach/`](english-speaking-coach/README.md) | English Speaking Coach | 面向成年人的英语口语训练和本地语音学习产品 | React、TypeScript、Capacitor、Python MLX |
| [`english-immersion-studio/`](english-immersion-studio/README.md) | English Immersion Studio | 通过成年 3D 数字员工、30 个本地纹理身份预设、离线照片烘焙、薄弱项推荐及语言分析构建沉浸式英语环境；生产级角色已选型 MetaHuman 5.7 | Electron、React、Three.js、MediaPipe、Neural TTS |
| [`avatar-generator-service/`](avatar-generator-service/README.md) | Local Avatar Generator | 在 Apple Silicon 上重绘可动画 GLB 材质，并保留骨骼、权重和面部 Morph Targets | Swift、MLX、Node.js |
| [`english-foundation/`](english-foundation/README.md) | English Foundation | 面向初学者的词汇、句子、语法和错项复习桌面产品 | Tauri 2、React、TypeScript、Rust |
| [`fde-playbook/`](fde-playbook/README.md) | FDE Playbook | FDE 岗位认知、交付方法、能力地图和制造业实战 | React、TypeScript、Vite |
| [`agent-workforce-console/`](agent-workforce-console/README.md) | Agent Workforce Console | 多 Agent 任务图、协作、评审和人工门禁控制台 | React、TypeScript、Vite |
| [`hover-translator/`](hover-translator/README.md) | Hover Translator | macOS 全局划词、悬停取词和英译中桌面工具 | Electron、React、Swift、Apple Vision |
| [`short-video-studio/`](short-video-studio/README.md) | FRAME/60 / 智助乖乖 | 生成 5–60 秒精确时长的 AI 短视频，并提供商品、公众号、朋友圈三类内容助手 Web 工作台和 Taro 小程序 | Node.js、FFmpeg、PWA、Electron、Taro |
| [`novel-video-studio/`](novel-video-studio/README.md) | 长卷制片厂 | 从 23 个已核验来源发现作品，并提供 16 部作品级公版热门推荐，经版权门禁后生成 15 分钟分集，支持三端、历史任务与持久化排队 | Node.js、Electron、PWA、火山方舟、FFmpeg |
| [`model-operations-studio/`](model-operations-studio/README.md) | Model Operations Studio | 本地优先的模型注册、部署、监控、配置与推理控制面 | Electron、React、Node.js、ComfyUI、llama.cpp |

## 产品协作链路

```text
Technology Intelligence
  ├─ 技术信号与需求匹配 ──> Opportunity Factory
  ├─ Demo handoff ──> Delivery Control Center
  └─ Demo handoff ──> DeliveryPilot

LifeYouMe Platform
  └─ 产品注册、域名路由、运营状态和共享服务边界

English Speaking Coach / English Immersion Studio / English Foundation / FDE Playbook / Agent Workforce Console
  └─ 独立运行的学习、培训和 Agent 协作产品
```

## 快速开始

每个项目拥有独立依赖和验证命令。进入项目目录后，以该项目 README 为准。

```bash
cd technology-intelligence && ./scripts/build.sh
cd ../opportunity-factory && ./scripts/build.sh
cd ../delivery-control-center && npm install && npm start
cd ../delivery-pilot && npm install && npm run dev
cd ../english-speaking-coach && npm install && npm run dev
cd ../english-immersion-studio && npm install && npm run dev
cd ../avatar-generator-service && npm run download:weights && npm start
cd ../english-foundation && npm install && npm run tauri dev
cd ../fde-playbook && npm install && npm run dev
cd ../agent-workforce-console && npm install && npm run dev
cd ../hover-translator && npm install && npm run dev
cd ../short-video-studio && npm install && npm run web
cd ../novel-video-studio && npm start
cd ../model-operations-studio && npm install && npm run dev
```

平台服务运行：

```bash
cd lifeyoume-platform
python3 -m unittest discover -s tests
SERVICE_ROLE=portal python3 platform/app.py
```

## 命名与兼容性

- 目录名统一采用小写 kebab-case，便于脚本、CI 和跨平台路径处理。
- 产品展示名与目录名保持一致，品牌内部标识可以暂时保留兼容别名。
- `EasySay`、`OneOPC`、`Nexora` 等旧产品标识可能仍出现在 App ID、本机数据目录、协议字段或历史交付物中，不应在没有迁移方案时直接修改。
- `technology-intelligence` 与 `opportunity-factory` 之间通过 macOS Application Support 文件和版本化 handoff 协作。

## 仓库约定

- 子项目独立维护 README、依赖声明、构建脚本和测试命令。
- 不提交 `node_modules/`、`dist/`、`build/`、`target/`、本地模型、`.env`、私钥和证书。
- 生成的交付物、运行数据和测试证据必须与源码边界分离。
- 新增子项目时，必须同时补充本 README 和子项目 README。
- 功能开发完成后，必须在本 README 的“新增功能说明”中维护对应项目的真实能力说明。
- MetaHuman 源角色和组装资产不得提交到公开仓库；备份、重建和验收流程见 [`english-immersion-studio/docs/METAHUMAN_ASSET_REBUILD.md`](english-immersion-studio/docs/METAHUMAN_ASSET_REBUILD.md)。
- 版本级变更记录维护在 [`CHANGELOG.md`](CHANGELOG.md)，新增功能使用 `feat`，问题修复使用 `fix`，文档或工程说明使用 `docs`。

## GitHub 定时同步

macOS 每 3600 秒检查一次仓库。任务会提交工作区变更并推送到当前分支，不创建空提交；远端领先、疑似密钥或单文件超过 95 MB 时会安全停止或跳过风险文件。发现跳过项时会立即发送 macOS 系统通知，并将完整路径和原因写入 `~/Library/Logs/LifeYouMe/agi-github-sync-skipped.txt`。

`launchd` 可能被 macOS Desktop 目录 TCC 权限拦截，表现为 `Operation not permitted`。当前推荐使用由已授权终端会话启动的后台循环：

```bash
./scripts/start-auto-sync-loop.sh
./scripts/install-auto-sync.sh
./scripts/auto-sync-github.sh --dry-run
```

LaunchAgent 任务标识为 `com.lifeyoume.agi-github-sync`；后台循环 PID 位于 `~/Library/Application Support/LifeYouMe/agi-github-sync-loop.pid`。日志位于 `~/Library/Logs/LifeYouMe/`。自动提交只表示阶段性代码快照，不代表功能已经通过验收。

## 代码索引

仓库级代码地图位于 [`.planning/codebase/`](.planning/codebase/)，包含结构、架构、技术栈、集成、测试约定和风险记录。

## 新增功能说明

- `novel-video-studio`：新增“推荐小说”目录，首批提供 16 部作品级公版核验的中英文热门经典，支持语言/关键词筛选、版权依据、原文来源和一键创建制片项目。
- `novel-video-studio`：演示任务不再伪装为真实成片，统一显示“演示预览 / 0 个视频已生成”；真实模式在任何模型调用前校验计费授权和单集预算。
- `english-immersion-studio`：新增沉浸式英语桌面训练产品，覆盖固定/推荐场景、CEFR 难度、语言分析、字幕模式、VRM/GLB 角色、MediaPipe 本地头像烘焙、Microsoft 神经语音和 MetaHuman 5.7 生产级数字人接入。
- `english-immersion-studio`：补充 [MetaHuman 资产重建说明](english-immersion-studio/docs/METAHUMAN_ASSET_REBUILD.md)，明确公共仓库边界、私有备份、角色重建和视觉验收要求。
- `avatar-generator-service`：新增 Apple Silicon 本地头像材质生成服务，基于 Hunyuan3D-Swift/MLX Paint 生成 GLB PBR 材质，并保留骨骼、权重和面部 Morph Targets。
- `metahuman-renderer`：新增 Unreal Engine 5.7 MetaHuman 渲染工程，用于承载 Pixel Streaming、角色状态桥接、摄像机、发型、服装和面部动画运行契约。
- `hover-translator`：新增 macOS 全局英语翻译工具，支持悬停取词、框选句子、双击单词、Apple Vision OCR、音标词性和离线词典回退。
- `opportunity-factory`：新增 ¥9.90 微信首单闭环，包含私有收款码、唯一付款备注、付款申报、后台核账确认、报告解锁和人民币收入记账；静态码不被伪装为自动支付接口。
- `opportunity-factory`：生产运行台同时兼容 `/admin` 与 `/admin/`，使用网页登录和安全会话 Cookie，避免原生 Basic Auth 在部分浏览器中显示空白或错误页。
- `opportunity-factory`：将商机罗盘左侧七阶段导航升级为动态扩散网络，并新增洞察、验证、成交、复利业务增长飞轮。
- `opportunity-factory`：将“历史报告”升级为应用内时间线，可直接回看最近 30 期商机及完整执行详情，不再跳转本地文件夹。
- `opportunity-factory`：网站新增与桌面端一致的“增长罗盘”favicon 和 Apple Touch 图标，替换浏览器默认地球图标。
- `opportunity-factory`：修复支付宝 discovery 并发调用 `alipay-cli` 导致本地凭据状态竞争、间歇返回 `Not logged in` 的问题；签约、服务和应用查询现按串行顺序执行。
- `opportunity-factory`：支付宝生产签约已提交，AI 按量付费服务 `API_4BAB0CE91B3743BE` 已为 `ACTIVE`，应用 `2021006197631772` 已为 `ON_LINE`；生产服务器已部署 Pay Skill 代码、代理路由及受限密钥文件，当前仅等待卖家 ID 注入后启动真实生产支付服务。
- `short-video-studio`：FRAME/60 扩展为同目录三端产品，包含可安装移动 PWA、Electron 桌面应用和 Web 工作台；三端共享模型代理、作品库及 FFmpeg 精确时长与画幅交付。
- `short-video-studio`：新增“商品短视频内容包”C 端验证入口，桌面 App、手机端 PWA、Web 共用生成与订单服务；支持免费标题预览、本地模板生成 10 个标题/3 条口播/3 套分镜/7 天计划；完整包定价 ¥9.90，已接入支付宝网页收款下单、回跳、异步通知、查询、退款、退款查询和关单代码，并部署到 `https://lifeyoume.icu/video/`。生产签约和真实付款仍待验证。
- `short-video-studio` 内容包页已修正滚动体验：撤销会截断表单的卡片内部滚动，改为完整页面滚动并压缩首屏标题与表单间距，确保输入和预览内容完整可访问。
- `short-video-studio` 页面继续支持滚轮和触摸滚动，同时隐藏原生滚动条视觉。
- `short-video-studio` 为样式资源增加版本参数，避免公网缓存导致旧滚动条样式残留。
- `short-video-studio` 重构桌面端内容包首屏为固定工作台，输入、预览和解锁操作无需页面滚动即可完成。
- `short-video-studio` 进一步压缩桌面端首屏垂直间距，补齐表单底部说明文字和卡片边界。
- `short-video-studio` 修复窄屏端首屏堆叠问题：生成前隐藏空预览区，让移动端直接完成输入和预览操作。
- `short-video-studio` 修复响应式 CSS 顺序问题，统一收口内容包布局覆盖规则。
- `short-video-studio` 内容包页完成 UI 重构，参考 Runway/CapCut/Canva 的任务工作区模式，强化步骤层级、空状态和主操作。
- `short-video-studio` 新增“智助乖乖”共享 Web 工作台 `/zhizhu/`，接入商品内容包、公众号文章助手、朋友圈与社群助手三类本地模板预览；当前支付按钮保持验证版禁用态，等待小程序虚拟支付和小程序源码接入。
- `short-video-studio` 新增 `apps/miniapp/` Taro 小程序，和 Web、Mobile、Desktop 入口并列，包含工作台、生成记录、我的三 Tab，并通过 HTTPS 复用共享生成接口；开发者工具配置已绑定真实 AppID `wxa087f03ad52dd2bf`，AppSecret 仅通过生产服务器受限环境注入。
- `short-video-studio` 新增 `/video/admin/` 后台管理，使用账号密码和 HttpOnly 会话保护，可动态修改三类内容工具价格，并查看支付宝订单状态；生产账号通过服务器受限环境文件注入。
- `short-video-studio` 支付回跳已补齐履约：支付宝异步通知或交易查询确认成功后，订单幂等标记为已履约，回跳页直接展示已购买的完整商品内容包。
- `short-video-studio` 移动端支付改为支付宝手机网站支付接口，优先唤起支付宝 App；支付结果页增加异步状态轮询和返回商品页面入口，后台仍提供退出登录。
- 真实移动端测试发现支付宝应用尚未授权 `alipay.trade.wap.pay`，已增加生产安全回退：默认使用已可用的网页支付接口，待支付宝开通权限后再通过 `ALIPAY_MOBILE_WAP_ENABLED=true` 启用 App 直达。
- 支付宝手机网站支付现已审核通过，生产服务已启用 `alipay.trade.wap.pay`；移动端新订单已验证使用 `QUICK_WAP_WAP_PAY`，并保留未授权或异常时的网页支付回退。
- `short-video-studio` 视频生成已改为可恢复的后台任务：用户支付/提交后不需要停留等待，页面显示任务进度，关闭后再次进入会继续查询任务状态。
- 当前生产视频接口仍要求配置视频模型服务；未配置时返回明确 `503`，不会创建假任务或误报生成成功。
- 生产环境已配置火山方舟 Seedance 2.5（`doubao-seedance-2-5-260628`），真实 5 秒 16:9 任务已完成并返回可访问 MP4。
- 已完成小程序订阅消息与公众号模板消息的服务端接入和任务完成触发；微信凭证、模板 ID 与用户授权仍需按平台要求配置，未配置时系统明确跳过通知。
- `short-video-studio` 已开始打通“智助乖乖”公众号和小程序入口：共享配置接口统一下发价格与渠道链接，小程序提供公众号文章助手 WebView 入口，公众号菜单可按工具参数直达共享工作台。
- `short-video-studio` 已完成小程序管理员扫码验证并更新 Taro `project.config.json` / `project.tt.json`；小程序订阅模板已配置，真实用户授权和完成消息发送仍需在真机小程序中验收。
- `short-video-studio` 小程序构建依赖已对齐 Taro 4.1.9 要求的 Webpack 5.91.0，准备导入微信开发者工具上传新版本。
- `short-video-studio` 小程序构建依赖进一步对齐 Taro 4.1.9 要求的 React Refresh 0.14.x，避免开发者工具构建时产生 peer 依赖冲突。
- `short-video-studio` 修复微信开发者工具不支持 SVG TabBar 图标的问题，改为兼容真机的文字 TabBar 配置。
- `short-video-studio` 已通过官方微信开发者工具上传小程序体验版 `1.0.4`；代码上传成功，尚未提交审核或正式发布。
- 已尝试在微信公众平台提交体验版 `1.0.4` 审核；平台因小程序主体尚未完成微信认证而拦截，当前仍处于体验版状态。
- `novel-video-studio`：新增“长卷制片厂”自动生产控制台及 Web、可安装手机 PWA、Electron 桌面 App 三端入口；默认从项目工作台创建、筛选和打开小说项目，进入具体项目后再管理来源、六节点、资产与分集。小说检索支持 360 国内全网、9 个可配置站点和逐源审计；商业作品支持导入已授权 TXT/Markdown 全文、内容指纹与预览，任务规划使用 `glm-5-2-260617`，视频生成使用 Seedance 2.5。
- `model-operations-studio`：新增任务中心优先的跨平台本地 MaaS 控制面，支持自适应分页任务队列、ComfyUI WebSocket 实时阶段/采样进度、取消、失败重试和重启恢复；视频可选择 5/10/30/60 秒，长视频采用 5 秒分段续接与自动合并，产物直接在应用内播放。

## 远端仓库

```text
https://github.com/lifangjunone/AGI.git
```
