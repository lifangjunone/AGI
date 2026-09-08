# FRAME/60 Short Video Studio

FRAME/60 是一个本地优先的 AI 短视频生成工作台。输入画面描述，选择 `5s`、`10s`、`20s`、`30s` 或 `60s`，即可生成、预览和下载指定时长的 MP4。

## 当前能力

- 支持 5、10、20、30、60 秒，默认 5 秒。
- 支持 9:16、16:9 和 1:1。
- 对接兼容 Chat Completions 的视频模型接口。
- 解析 `data:video/mp4;base64,...` 模型响应。
- 使用 FFmpeg 裁剪或循环原始视频，交付精确目标时长。
- 提供生成进度、视频预览、下载和本地作品库。
- API Key 仅在 Node.js 服务端读取，不发送到浏览器。

## 启动

环境要求：

- Node.js 20 或更高版本
- `ffmpeg` 与 `ffprobe`
- 可访问已配置的视频模型服务

```bash
cd /Users/bytedance/Desktop/agi/short-video-studio
npm start
```

浏览器打开：

```text
http://127.0.0.1:4317
```

本机模型配置保存在 `.env.local`，该文件已加入 `.gitignore`。新环境可从 `.env.example` 创建配置：

```bash
cp .env.example .env.local
```

## 验证

```bash
npm test
```

测试覆盖输入约束、模型提示词、Base64 MP4 解析，以及 FFmpeg 精确时长处理。

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

产品调研与取舍见 [RESEARCH.md](RESEARCH.md)。
