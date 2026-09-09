# FRAME/60 Short Video Studio

FRAME/60 是一个本地优先的 AI 短视频生成工作台，并新增面向 C 端创作者的“商品短视频内容包”预览入口。输入商品信息即可生成标题、口播、分镜和 7 天发布计划。

## 三端版本

三个版本都位于本项目的 [`apps/`](apps/) 目录，并共享生成服务、视频文件和作品记录。

| 版本 | 目录 | 启动命令 | 说明 |
| --- | --- | --- | --- |
| Web | `apps/web/` | `npm run web` | 本机浏览器工作台，入口为 `/web/` |
| 移动端 | `apps/mobile/` | `npm run mobile` | 移动 PWA，监听局域网地址并适配触控、安全区与竖屏 |
| 桌面端 | `apps/desktop/` | `npm run desktop` | Electron 原生窗口，自动启动独立本地服务 |

## 当前能力

- 支持 5、10、20、30、60 秒，默认 5 秒。
- 支持 9:16、16:9 和 1:1。
- 对接兼容 Chat Completions 的视频模型接口。
- 解析 `data:video/mp4;base64,...` 模型响应。
- 使用 FFmpeg 裁剪或循环原始视频，并按所选比例居中裁切，交付精确时长与画幅。
- 提供生成进度、视频预览、下载和本地作品库。
- 提供商品内容包 MVP：桌面 App、手机端 PWA 和 Web 三端共享商品、客群、卖点、平台和风格输入，生成 10 个标题、3 条口播、3 套分镜、标签和 7 天发布计划。
- 内容包目前使用本地模板引擎生成预览，完整包价格为 `¥9.90`；支付宝网页收款代码已接入，沙箱点击解锁会打开支付宝收银台。
- API Key 仅在 Node.js 服务端读取，不发送到浏览器。

## 启动

环境要求：

- Node.js 20 或更高版本
- `ffmpeg` 与 `ffprobe`
- 可访问已配置的视频模型服务

```bash
cd /Users/bytedance/Desktop/agi/short-video-studio
npm install
```

Web 版：

```bash
npm run web
# http://127.0.0.1:4317/web/
```

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

测试覆盖三个平台入口、移动端 Manifest、内容包生成、输入约束、模型提示词、Base64 MP4 解析，以及五档时长和三种画幅的 FFmpeg 处理。

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
- 商品内容包仍处于需求验证阶段；生产网页收款签约、生产 `notify_url` 和真实付款尚未完成，不能宣称已产生收入。

三端的内容包、作品库和支付订单接口共用服务端实现；桌面端跳转支付宝时交由系统浏览器打开，手机端和 Web 端使用浏览器收银台。

产品调研与取舍见 [RESEARCH.md](RESEARCH.md)。
