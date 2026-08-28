# EasySay

面向中国成年人的移动端英语口语训练 PWA。核心流程是：

`输入 → 模仿 → 脱稿输出 → 反馈 → 重说 → 间隔复习`

## 运行

```bash
npm install
cp .env.example .env
npm run speech:setup
npm run dev
```

桌面开发时打开 `https://localhost:5173`。手机不要使用局域网 IP 和本地开发
证书，因为移动浏览器可能不会授予麦克风与 PWA 权限；使用下方的手机学习模式。

没有配置 `ARK_API_KEY` 时，应用会自动使用本地 24 周计划、角色扮演脚本和反馈规则，不影响完整流程演示。

## 产品学习闭环

首页“智能组练”会根据课程进度和历史薄弱项组织当次练习，并把训练结果继续写回学习记录：

- 句型骨架展示可替换槽位、完整示例、中文翻译和适用场景
- “句子透视”按主语、谓语、宾语和状语拆解句子
- 单词支持音标、词性、含义、重音提示和点按听音
- 整句支持自然语速与慢速播放，并提示弱读、连读等发音现象
- 根据最近练习中的优先问题推荐强化句，可直接切换后继续练习
- 练习过程展示 Combo 与 XP，结束后形成可继续复习的结算结果

非英语或词典未覆盖的单词会保留完整文本，并降级为“点按听音”，不会截断句子或阻塞练习。

## 手机学习

原生 iOS/Android App 工程已维护在 `ios/` 和 `android/`。手机和 Mac 使用同一
Wi-Fi，App 通过 6 位连接码访问 Mac 上的 ASR/TTS：

```bash
npm run native:start
```

原生工程同步与打开：

```bash
npm run native:ios
npm run native:android
```

完整安装步骤见 [`docs/NATIVE_APP.md`](docs/NATIVE_APP.md)。

浏览器局域网模式仍保留为调试备用，见
[`docs/MOBILE_LEARNING.md`](docs/MOBILE_LEARNING.md)。

使用 iPhone 个人热点或连接异常时，先运行：

```bash
npm run ios:doctor
npm run ios:install
```

热点连接排查记录见
[`debug-iphone-hotspot-connection.md`](debug-iphone-hotspot-connection.md)。

## Ark 配置

在 `.env` 中填写：

```bash
ARK_API_KEY=your_key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_REASONING_MODEL=doubao-seed-evolving
ARK_VISION_ENDPOINT=your_vision_endpoint
ARK_IMAGE_MODEL=doubao-seedream-5-0-pro-260628
```

API key 只由 `server/` 读取，不会进入前端 bundle 或 localStorage。

## 高级学习自进化

设置中的“赫尔墨斯认知进化引擎”可选接入 NousResearch Hermes Agent，根据
真实练习记录归纳薄弱点并重排未来课程。默认关闭，且只发送转写、评分与课程
结构，不发送录音：

```bash
npm run hermes:setup
hermes setup
npm run hermes:doctor
```

完整说明见 [`docs/HERMES_EVOLUTION.md`](docs/HERMES_EVOLUTION.md)。

### 本地 Qwen3.5 推理

Hermes 可切换为 Mac 本地的 `Qwen3.5-9B-MLX-8bit`，手机仅控制模型来源，
模型服务不会直接暴露到局域网：

```bash
npm run llm:setup
npm run llm:download
npm run native:start
npm run llm:doctor
```

完整说明见 [`docs/LOCAL_QWEN35.md`](docs/LOCAL_QWEN35.md)。

## 本地 ASR/TTS

Apple Silicon 默认使用：

- ASR: `mlx-community/Qwen3-ASR-1.7B-8bit`
- TTS: `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`

模型从 ModelScope 下载到 `.models/`，隔离环境位于 `.venv-speech/`，均不会提交 Git。
`npm run dev` 会同时启动 Web、Node API 和本地 MLX 语音服务。模型不可用时自动
降级到浏览器识别和系统朗读。

```bash
npm run speech:doctor
npm run speech:test
```

应用底部“模型”页面可以查看状态、修改默认配置、载入模型和试听。完整配置与
故障处理见 [`docs/LOCAL_SPEECH_MODELS.md`](docs/LOCAL_SPEECH_MODELS.md)。

## 验证

```bash
npm test
npm run typecheck
npm run build
```

生产构建包含 Web App Manifest、Service Worker 和离线应用壳。
