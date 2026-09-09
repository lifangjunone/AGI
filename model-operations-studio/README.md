# Model Operations Studio

本地优先、跨平台的 MaaS 控制面，用于注册、下载、配置、启动、停止、监控和调用本地模型。当前纵向切片优先支持 Apple Silicon，并提供：

- Wan2.2-TI2V-5B FP16：通过 ComfyUI API 提供文生视频与可选参考图的图生视频能力。
- Qwen3.5-9B Q4_K_M：通过 `llama.cpp` 提供 OpenAI 兼容的文生文服务。
- 实时读取 CPU、内存压力、磁盘和运行时状态。
- 固定版本模型清单、精确文件大小、SHA-256 校验、断点续传和安装状态。
- 模型进程启动/停止、健康探测、日志和本地推理工作台。
- Electron 打包配置，目标为 macOS、Windows 和 Linux。

## 快速开始

```bash
cd /Users/bytedance/Desktop/agi/model-operations-studio
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:4320`。生产控制面运行在 `http://127.0.0.1:4319`。

```bash
npm run build
npm run server
npm run desktop
npm test
```

## 模型部署

在“模型仓库”点击“安装模型”。控制面会安装对应运行时、下载权重并校验 SHA-256。模型存放在 `runtime/`，该目录不提交 Git。

也可以通过 API 执行：

```bash
curl -X POST http://127.0.0.1:4319/api/models/qwen35-9b-q4/install
curl -X POST http://127.0.0.1:4319/api/models/qwen35-9b-q4/start
curl -X POST http://127.0.0.1:4319/api/models/wan22-ti2v-5b-fp16/install
curl -X POST http://127.0.0.1:4319/api/models/wan22-ti2v-5b-fp16/start
```

### Wan2.2 文件

| 文件 | 精确大小 | 放置目录 |
| --- | ---: | --- |
| `wan2.2_ti2v_5B_fp16.safetensors` | 9,999,658,848 B | `runtime/ComfyUI/models/diffusion_models/` |
| `umt5_xxl_fp16.safetensors` | 11,366,399,385 B | `runtime/ComfyUI/models/text_encoders/` |
| `wan2.2_vae.safetensors` | 1,409,400,960 B | `runtime/ComfyUI/models/vae/` |

下载地址和校验值维护在 [`data/model-catalog.json`](data/model-catalog.json)。不使用 FP8 文本编码器。

### M5 Pro 稳定配置

- `832x480`，49 帧，16 fps
- 20 steps，CFG 5
- `euler` sampler，`simple` scheduler
- FP16 主模型与 FP16 UMT5
- `VAEDecodeTiled`
- `PYTORCH_ENABLE_MPS_FALLBACK=1`
- `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0`

工作流位于 [`workflows/wan22-mps-api.json`](workflows/wan22-mps-api.json)。基准与自动降级：

```bash
npm run server
node scripts/benchmark-wan.mjs "雨后的上海街道，一辆复古电车缓慢驶过"
```

基准依次尝试 `832x480/49`、`832x480/33`、`640x368/33` 和 `512x288/25`，记录耗时、ComfyUI RSS 峰值、输出路径、黑帧和解码错误。结果写入 `runtime/outputs/`。

本机实测稳定结果：`832x480`、49 帧、16 fps、Euler、20 steps、CFG 5 的冷启动耗时 217.49 秒，热运行 154.57 秒；无黑帧、解码错误、渐进竖条或饱和度发散。512x288/9 帧图生视频 API 冒烟测试耗时 41.44 秒。完整记录见 [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md)。

## 平台边界

当前版本是单节点本地 MaaS，不伪装成 Kubernetes 集群。注册表、运行时适配器和 API 已按跨平台边界拆分；Windows/Linux 可使用同一 UI 和控制面，但 ComfyUI/llama.cpp 的安装命令需要按目标机器的 GPU 驱动补齐。生产多节点阶段可接 KServe、BentoML 或容器运行时。

## 安全

- 默认仅绑定 `127.0.0.1`。
- 服务端只执行模型清单中的固定命令，不接受任意 shell 参数。
- 权重不进入 Git，并在启用前校验 SHA-256。
- 模型许可证和来源随注册记录保留。
