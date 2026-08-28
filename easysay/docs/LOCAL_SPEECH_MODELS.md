# EasySay 本地语音模型

## 默认模型

| 能力 | ModelScope 模型 | 本机体积 | 选择原因 |
|---|---|---:|---|
| ASR | `mlx-community/Qwen3-ASR-1.7B-8bit` | 约 2.47 GB | 源自官方 Qwen3-ASR-1.7B，覆盖多国英语口音；MLX 8-bit 适合 Apple Silicon |
| TTS | `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit` | 约 3.08 GB | 英文预置音色、风格控制、MLX 8-bit 本机推理 |

ModelScope 依据：

- [Qwen3-ASR-1.7B](https://modelscope.cn/models/Qwen/Qwen3-ASR-1.7B)
- [Qwen3-ASR-1.7B-8bit MLX](https://modelscope.cn/models/mlx-community/Qwen3-ASR-1.7B-8bit)
- [Qwen3-TTS-0.6B CustomVoice](https://modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice)
- [Qwen3-TTS-1.7B CustomVoice 8bit MLX](https://modelscope.cn/models/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit)

官方 Qwen3-ASR 模型卡说明 1.7B 版本达到开源领先水平，支持 30 种语言、22
种中文方言和多个国家/地区的英语口音。Qwen3-TTS CustomVoice 支持英文和预置
英语音色。EasySay 在 Apple Silicon 上选用对应 MLX 量化版本，避免 CUDA 和
vLLM 依赖。

## 安装

前置条件：

- Apple Silicon Mac
- `uv`
- 约 8 GB 可用磁盘空间

执行：

```bash
npm run speech:setup
```

脚本执行以下动作：

1. 使用 Python 3.12 创建 `.venv-speech/`。
2. 安装锁定的 `mlx-audio 0.3.1`、FastAPI、PyAV 等运行依赖。
3. 从 ModelScope 下载权重到 `.models/`。

`mlx-audio 0.3.1` 依赖 `transformers 5.0.0rc3`，依赖文件已将其显式锁定，
安装脚本使用 `--prerelease=explicit`，不会放开其他依赖的预发布版本。

## 启动与诊断

```bash
npm run dev
```

该命令同时启动：

- Vite PWA
- Express API
- `127.0.0.1:8790` 本地语音服务

单独启动和诊断：

```bash
npm run speech:start
npm run speech:doctor
npm run speech:test
```

模型默认按需载入。第一次转写或朗读会包含权重载入时间，后续调用复用内存中的
模型。ASR 和 TTS 通过单并发锁执行，避免 MLX 共享内存峰值和线程安全问题。

## 配置

提交到 Git 的默认配置：

```text
config/speech-models.json
```

配置页保存的本机覆盖：

```text
.local/speech-models.json
```

覆盖文件、模型权重、Python 环境和生成音频均已加入 `.gitignore`。配置优先级
为“本机覆盖 > 仓库默认值”。

默认值：

- 服务：`http://127.0.0.1:8790`
- ASR 语言：`English`
- 美音：`Aiden`
- 英音：`Ryan`
- 语速：`1.0`
- ASR 最大输出：`1024` tokens

应用底部“模型”页面支持：

- 查看服务、权重和内存载入状态
- 修改模型 ID、本地路径、语言和音色
- 保存并热应用配置
- 预热 ASR/TTS
- 真实生成 TTS 试听

## API

浏览器只访问 Express：

- `GET /api/speech/config`
- `PUT /api/speech/config`
- `POST /api/speech/models/load`
- `POST /api/speech/asr`
- `POST /api/speech/tts`

Express 再代理到仅监听回环地址的 FastAPI 服务。模型路径和录音不会发送到
ModelScope、Ark 或其他远端服务。

## 降级行为

- ASR 不可用：保留浏览器 Speech Recognition 结果；若浏览器也不支持，允许
  用户手工补充转写。
- TTS 不可用：自动使用浏览器 `speechSynthesis`。
- 模型加载失败：训练记录、录音保存和 Ark 教练流程仍可继续。

## 常见问题

### 配置页显示“未安装权重”

运行：

```bash
npm run speech:setup
npm run speech:doctor
```

安装脚本支持断点续传，不会重复下载已完成的权重。

### 第一次调用很慢

首次调用需要把模型载入统一内存。在配置页点击“载入模型”可提前预热。

### 修改模型后没有生效

点击“保存并应用”。服务在线时会清理旧模型并重新读取 `.local/` 配置；下次调用
按新配置载入。

### 浏览器麦克风不可用

移动浏览器必须通过 HTTPS 访问。桌面本机可使用 `https://localhost:5173`。
