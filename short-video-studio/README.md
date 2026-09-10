# FRAME/60 / 智助乖乖

## 统一身份

Web 工作台使用 LifeYouMe SSO 网关；Electron、小程序、PWA 和移动客户端使用
设备授权获取产品作用域令牌。订单、作品和通知绑定稳定用户 ID，产品不保存统一
账号密码。`/admin/` 凭据只属于运维人员，不是第二套终端用户体系。接入契约见
[`lifeyoume-platform/docs/SSO.md`](../lifeyoume-platform/docs/SSO.md)。

FRAME/60 是一个本地优先的 AI 短视频生成工作台，并新增面向 C 端创作者的“智助乖乖”内容工作台。输入商品、文章或社群信息即可生成对应的可发布内容预览。

## 四端版本

四个入口版本都位于本项目的 [`apps/`](apps/) 目录，并共享生成服务、视频文件和作品记录。

| 版本 | 目录 | 启动命令 | 说明 |
| --- | --- | --- | --- |
| Web | `apps/web/` | `npm run web` | 本机浏览器工作台，入口为 `/web/` |
| 移动端 | `apps/mobile/` | `npm run mobile` | 移动 PWA，监听局域网地址并适配触控、安全区与竖屏 |
| 桌面端 | `apps/desktop/` | `npm run desktop` | Electron 原生窗口，自动启动独立本地服务 |
| 微信小程序 | `apps/miniapp/` | Taro 预览/构建 | 智助乖乖原生小程序工作台、记录和我的 |

## 当前能力

- 支持 5、10、20、30、60 秒，默认 5 秒。
- 支持 9:16、16:9 和 1:1。
- 对接兼容 Chat Completions 的视频模型接口。
- 解析 `data:video/mp4;base64,...` 模型响应。
- 使用 FFmpeg 裁剪或循环原始视频，并按所选比例居中裁切，交付精确时长与画幅。
- 提供生成进度、视频预览、下载和本地作品库。
- 提供商品内容包 MVP：桌面 App、手机端 PWA 和 Web 三端共享商品、客群、卖点、平台和风格输入，生成 10 个标题、3 条口播、3 套分镜、标签和 7 天发布计划。
- 内容包目前使用本地模板引擎生成预览，生产商品内容包价格为 `¥1.00`；支付宝网页收款代码已接入，后台可动态修改商品、文章和社群工具价格。
- 支付宝手机网站支付已审核通过并在生产环境启用；移动端新订单优先唤起支付宝 App，回跳和异步履约链路保持不变。
- API Key 仅在 Node.js 服务端读取，不发送到浏览器。
- 视频生成已改为后台任务：接口返回任务号，生成过程持久化状态，前端显示进度并在重新打开页面时恢复轮询；生成任务不会因用户离开页面而取消。
- 生产视频模型已切换为火山方舟 Seedance 2.5 异步任务接口：创建任务后轮询状态，成功下载 `content.video_url`，再由 FFmpeg 校验时长和画幅。
- 已接入微信通知发送层：小程序使用一次性订阅消息，公众号使用 OAuth + 模板消息；需要在服务器注入对应 AppID、Secret、模板 ID 和模板字段映射后才会真实发送。
- 小程序原生 TabBar 使用微信支持的文字模式，不依赖 SVG 图标，兼容开发者工具和真机模拟器。
- 当前已通过官方微信开发者工具上传体验版 `1.0.4`；上线全量用户前仍需在微信后台提交审核并发布。
- `1.0.4` 审核反馈包含两项必须整改的问题：生成按钮在输入过短的核心卖点时显示“生成失败”，以及审核包被识别为包含 AI 问答、AI 换脸视频、AI 绘画等深度合成服务。当前源码已补齐前端长度校验；重新提交前必须确认开发者工具使用的是最新 `dist/`，并移除旧包中的深度合成功能。个人主体不能申请相关服务类目，若确需保留深度合成能力需改用企业主体并按要求申请类目。
- 公众号 AppID 已确认，AppSecret 不写入仓库；模板消息权限和网页授权域名仍需在公众号后台完成。
- 新增公众号自动发布器：使用 Playwright 持久化登录态，每天北京时间 08:30、17:30 各生成并发布一篇结构化文章，自动填写编辑器和上传封面；首次运行需完成一次微信登录/扫码，运行说明见 [`docs/OFFICIAL-ACCOUNT-AUTOPUBLISH.md`](docs/OFFICIAL-ACCOUNT-AUTOPUBLISH.md)。
- 公众号文章现在以 Markdown 源文件维护，通过主题渲染器转换为微信兼容 HTML；首篇样稿位于 [`content/official-account/001-normal-product-7-videos.md`](content/official-account/001-normal-product-7-videos.md)，包含留白、章节标题、重点引用、列表和统一品牌色。发布器默认关闭，先预览再显式开启。
- 公众号正文设置硬门槛：每篇至少 3 张与文章内容相关的图片，图片不足时自动发布器拒绝继续。
- 正文图片还必须去重；文章结尾同时提供产品目录 `https://lifeyoume.icu/products` 和直接体验入口 `https://lifeyoume.icu/video/`。
- 首篇封面升级为三联场景编辑型视觉，包含结果型标题、真实拍摄画面和“先解决问题，再介绍商品”点击钩子。

## 启动

环境要求：

- Node.js 20 或更高版本
- `ffmpeg` 与 `ffprobe`
- 可访问已配置的视频模型服务

```bash
cd /Users/bytedance/Desktop/agi/short-video-studio
npm install
```

微信渠道接入说明见 [`docs/WECHAT-CHANNEL-INTEGRATION.md`](docs/WECHAT-CHANNEL-INTEGRATION.md)：公众号菜单、文章和小程序统一进入共享内容工作台，价格由 `/api/assistant/config` 统一下发；小程序虚拟支付仍需完成微信侧资质与 OfferID/ProductID/AppKey 配置。

Web 版：

```bash
npm run web
# http://127.0.0.1:4317/web/
```

公网验证入口：

```text
https://lifeyoume.icu/video/
```

生产通知地址：

```text
https://lifeyoume.icu/video/api/alipay/notify
```

后台管理地址：

```text
https://lifeyoume.icu/video/admin/
```

后台账号通过服务端环境文件 `/data/app/short-video-studio/.admin.env` 注入：

```text
ADMIN_USERNAME=你的后台账号
ADMIN_PASSWORD=你的后台密码
```

该文件必须只允许服务用户读取，不提交 Git；后台修改后的价格写入 `data/admin/settings.json`，新订单实时使用最新配置。

该公网入口已部署独立 Node 服务和 Nginx 路由；桌面端使用支付宝网页支付，生产移动端优先使用已审核通过的支付宝手机网站支付，支付成功后回跳页会直接展示已购买的完整内容包。

内容包页面采用完整页面滚动，压缩首屏标题和表单间距，确保表单头部、底部按钮和右侧预览区不会被截断；移动端保留单列自然滚动。
页面保留鼠标滚轮、触控板和触摸滑动能力，但隐藏浏览器原生滚动条，减少视觉干扰。
样式链接带版本参数，避免公网浏览器继续使用旧缓存。
桌面端首屏采用固定工作台布局，输入字段、预览区和核心操作在一个视口内完成；手机端因屏幕尺寸保留自然滚动。
桌面端已进一步压缩标题、字段间距和按钮高度，确保表单底部说明文字也完整可见。
窄屏端在生成前隐藏空预览区，首屏直接展示完整输入表单；生成后再显示结果内容。
响应式覆盖规则已统一放在样式文件末尾，避免被共享视频工作台样式覆盖。
内容包页已重构为创作工作台：紧凑的产品头信息、明确的 STEP 01/02、左侧输入区、右侧预览区和可解释的空状态。
新增 Web 入口 `/zhizhu/` 和共享接口 `/api/assistant/generate`，提供商品内容包、公众号文章助手、朋友圈与社群助手三种本地模板预览；支付按钮当前保持验证版禁用态，待微信虚拟支付配置到位后接入。

移动端：

```bash
npm run mobile
# 使用终端输出的局域网 /mobile/ 地址在手机访问
```

局域网 HTTP 地址可用于手机联调。PWA 安装和离线外壳依赖浏览器安全上下文，正式部署时需使用 HTTPS。

桌面端：

```bash
npm run desktop:config
npm run desktop
```

`desktop:config` 将模型配置和 FFmpeg 路径以 `0600` 权限写入 `~/Library/Application Support/FRAME 60/.env.local`。桌面作品保存在同目录的 `data/` 下，不写入应用包。

生成 macOS arm64 应用目录：

```bash
npm run desktop:pack
```

产物位于 `dist/mac-arm64/FRAME 60.app`。本地目录包默认不签名；正式分发前需配置 Apple Developer 签名和公证。

本机模型配置保存在 `.env.local`，该文件已加入 `.gitignore`。新环境可从 `.env.example` 创建配置：

```bash
cp .env.example .env.local
```

## 验证

```bash
npm test
```

测试覆盖三个平台入口、`/zhizhu/` 工作台、三类助手生成与输入校验、移动端 Manifest、内容包生成、模型提示词、Base64 MP4 解析，以及五档时长和三种画幅的 FFmpeg 处理。

## 数据目录

```text
data/
├── jobs/       # 生成记录元数据
└── videos/     # 最终 MP4
```

两个目录的运行内容均不提交到 Git。

## 已知限制

- 当前模型接入只支持文本生成视频，不支持首帧、尾帧或参考图。
- 当模型原片短于目标时长，首版通过循环补齐，可能看到重复镜头。
- 模型请求为同步长连接；生成期间不要关闭服务进程。
- 商品内容包仍处于需求验证阶段；后台、生产支付宝收银台和支付后内容交付链路已实现，当前仍需完成一次真实支付确认收入到账。

三端的内容包、作品库和支付订单接口共用服务端实现；桌面端跳转支付宝时交由系统浏览器打开，手机端和 Web 端使用浏览器收银台。

产品调研与取舍见 [RESEARCH.md](RESEARCH.md)。
