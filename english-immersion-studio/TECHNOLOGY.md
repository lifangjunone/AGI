# English Immersion Studio 技术介绍与迁移指南

本文档描述项目的生产架构、关键技术、资产边界和跨电脑交付方式。目标是让
开发者能在新的 macOS 或 Windows 电脑上复现构建，也让最终用户能通过已打包
产物直接运行，而不依赖原开发电脑的绝对路径。

## 1. 系统架构

English Immersion Studio 由三个核心进程组成：

```text
Electron / React 学习界面
  |-- WebSocket ws://127.0.0.1:7790 --> Unreal 状态控制
  |-- HTTP http://127.0.0.1:8765 ----> 音频到 ARKit 推理
  `-- WebRTC / Pixel Streaming ------> Unreal 实时画面

Audio2Lipsync 本地服务
  `-- TTS 音频 -> 61 路 ARKit 曲线（60 fps）

Unreal Engine 5.7 Renderer
  |-- MetaHuman Character / RigLogic / ABP_MH_LiveLink
  |-- Groom / Hair Cards
  |-- Control Rig / Animation Blueprint
  `-- Pixel Streaming 2
```

- Electron 管理课程、场景、字幕、语音、学习记录和用户交互。
- Unreal Engine 管理 MetaHuman、皮肤、眼睛、头发、服装、灯光、相机和动画。
- `electron/renderer-bridge.cjs` 在本机 `7790` 端口发布版本化
  `avatar.state` 和 `speech.face` 消息。
- `EnglishImmersionDirector` 接收状态并切换角色、场景、发型、服装、表演状态
  和第一/第三人称相机。
- Windows/Linux 渲染节点通过 Pixel Streaming 2 将画面发送给 Electron；
  macOS 开发阶段也可以使用 Unreal 原生窗口。

## 2. 技术栈与版本

| 层 | 技术 | 当前用途 |
| --- | --- | --- |
| 桌面壳 | Electron 44 | macOS/Windows 桌面窗口和本地进程管理 |
| Web UI | React 19、TypeScript 5.8、Vite 7 | 学习界面和状态管理 |
| 生产数字人 | Unreal Engine 5.7.4 | 实时写实渲染 |
| 数字人 | MetaHuman Character 5.7、RigLogic | 面部 DNA、关节、Blend Shapes |
| 头发 | Hair Strands、Groom、Hair Cards | 模块化真实头发 |
| 动画 | Control Rig、Animation Blueprint | 面部、身体、呼吸和手势 |
| 音频口型 | Audio2Lipsync、HuBERT、PyTorch | TTS 音频到 61 路 ARKit 控制 |
| 面部传输 | Unreal LiveLink、ABP_MH_LiveLink | ARKit 曲线到当前 MetaHuman |
| 视频传输 | Pixel Streaming 2、WebRTC | Unreal 到 Electron 的低延迟画面 |
| 控制协议 | WebSocket、JSON v1 | Electron 到 Unreal 的状态同步 |
| 语音 | Microsoft Neural TTS、系统语音 | 英语角色语音与离线回退 |
| 旧版实验 | Three.js 0.180、three-vrm、MediaPipe | 不属于生产验收链路 |
| 测试 | Vitest、Node Test、Playwright | 单元、进程和 UI 验证 |

版本来源以
[`package.json`](package.json)、
[`services/metahuman-renderer/EnglishImmersionRenderer.uproject`](services/metahuman-renderer/EnglishImmersionRenderer.uproject)
和已安装的 UE `5.7.x` 为准。

## 3. 目录与资产

```text
english-immersion-studio/
|-- electron/                         Electron 主进程和本地服务
|-- src/                              React 学习界面
|-- services/
|   |-- metahuman-renderer/           Unreal 5.7 C++ 渲染器
|   `-- metahuman-lipsync-service/    MIT 音频驱动面部服务
`-- scripts/                          启动、构建和资产准备脚本
```

关键 MetaHuman 资产：

- `services/metahuman-renderer/Content/Characters/MetaHumans/Sophia.uasset`
  是可编辑角色源资产。
- `services/metahuman-renderer/Content/MetaHumans/Sophia/BP_Sophia.uasset`、
  `SophiaTuya/BP_SophiaTuya.uasset` 和 `Vivian/BP_Vivian.uasset`
  是当前三个运行时角色入口。
- `services/metahuman-renderer/Content/MetaHumans/Common/`
  是组装后角色共享的材质、Rig 和动画依赖。
- `services/metahuman-renderer/Scripts/setup_sophia.py`
  从 Epic Tuya 成年女性预设生成 Sophia，配置妆容、身材、长直发和服装。
- `services/metahuman-renderer/Scripts/update_character_hair.py`
  在不替换脸部身份的前提下更新现有 MetaHuman 的 Hair wardrobe。
- `services/metahuman-renderer/Scripts/build_sophia.py`
  下载 2K Texture Sources、创建完整关节与 Blend Shapes 绑定，并构建优化版角色。
- `services/metahuman-renderer/Scripts/setup_interview_scene.py`
  可重复创建面试地图、灯光、背景、第一/第三人称相机和运行时标签。
- `services/metahuman-renderer/Scripts/verify_interview_scene.py`
  自动检查角色、Groom、服装、场景、相机和灯光契约。

MetaHuman 生成资产包含大体积 `.uasset`，不能依赖普通 Git 传输。迁移时必须
选择以下一种方式：

1. 使用 Git LFS 管理 `*.uasset` 和 `*.umap`。
2. 在交付包中携带完整 `services/metahuman-renderer/Content/`。
3. 新电脑安装 MetaHuman Core Data 后重新运行两个 Python 脚本。

不能只复制 C++ 源码或 `.uproject`，否则新电脑缺少角色、皮肤、Groom 和 Rig
资产。

## 4. 开发环境要求

通用要求：

- Git。
- Node.js `20.19+`、`22.12+` 或更新 LTS。
- Python `3.10-3.12`，用于本地音频驱动口型服务。
- npm。
- 首次安装 npm、Pixel Streaming Infrastructure、Epic 纹理和自动绑定时联网。

Unreal 要求：

- Unreal Engine `5.7.x`，当前验证版本为 `5.7.4`。
- 安装选项必须包含 `MetaHuman Creator Core Data`。
- 引擎源码和调试符号不是运行或普通构建的必需项。
- 插件：MetaHuman Character、RigLogic、Control Rig、Hair Strands、
  Python Editor Script Plugin、Pixel Streaming 2。
- 生成 Texture Sources 和自动绑定时需要在浏览器完成一次 Epic 设备授权。

平台要求：

| 平台 | 要求 |
| --- | --- |
| macOS | Apple Silicon、macOS 14+、Xcode 与 Command Line Tools |
| Windows | Windows 11 x64、Visual Studio 2022、Desktop development with C++、Windows 11 SDK |

MetaHuman Identity 和照片身份制作在 Windows 执行。macOS 支持角色编辑、构建
和运行时渲染，但正式 macOS 版本优先使用 Hair Cards。

## 5. 新电脑从源码运行

### 5.1 克隆和安装前端

```bash
git clone <repository-url> agi
cd agi/english-immersion-studio
npm run bootstrap -- --check
```

`bootstrap` 会验证 Node.js、安装锁定依赖并运行类型检查和测试。普通开发回退
模式：

```bash
npm run bootstrap
```

### 5.2 安装和构建 Unreal

通过 Epic Games Launcher 安装 UE 5.7 和 MetaHuman Creator Core Data。
默认安装目录会被脚本自动探测；自定义目录使用：

```bash
# macOS
export EIS_UNREAL_ENGINE_ROOT="/path/to/UE_5.7"

# Windows PowerShell
$env:EIS_UNREAL_ENGINE_ROOT="D:\Epic Games\UE_5.7"
```

构建编辑器目标：

```bash
cd english-immersion-studio
npm run metahuman:build
```

如果仓库没有携带 `Content/`，按照
[`services/metahuman-renderer/README.md`](services/metahuman-renderer/README.md)
生成和组装 Sophia。

### 5.3 生成目标平台运行包

Unreal 包必须在目标系统构建：

```bash
npm run metahuman:package
```

Electron 安装包：

```bash
npm run dist
```

macOS 构建 macOS `.app`，Windows 构建 Windows `.exe`。项目不依赖把当前
电脑的 `/Users/...` 或盘符路径复制到新电脑。

## 6. 最终用户直接运行

直接运行交付包应包含：

```text
EnglishImmersionStudio/
|-- app/                         Electron 安装包或解压目录
`-- renderer/                    对应系统的 Unreal 打包产物
```

将 Unreal 产物保存在仓库默认
`services/metahuman-renderer/Build/<platform>/` 布局时，
启动脚本会自动发现它。放在其他位置时设置：

```bash
EIS_UNREAL_EXECUTABLE="/absolute/path/to/renderer" npm run metahuman
```

Windows PowerShell：

```powershell
$env:EIS_UNREAL_EXECUTABLE="D:\EnglishImmersionRenderer\EnglishImmersionRenderer.exe"
npm run metahuman
```

首次 `npm run metahuman` 会下载并构建 Epic Pixel Streaming Infrastructure，
创建隔离 Python 环境，并下载校验 MIT 口型模型。
需要完全离线部署时，应提前缓存：

- `node_modules/`
- `~/.english-immersion-studio/PixelStreamingInfrastructure-UE5.7/`
- `~/.english-immersion-studio/models/audio2lipsync/`
- `services/metahuman-lipsync-service/.venv/`
- 对应平台的 Electron 和 Unreal 已打包产物

神经语音需要网络；断网时应用回退到操作系统语音。MetaHuman 渲染、已有场景
和本地学习数据不依赖付费推理 API。

## 7. 环境变量和端口

| 名称 | 作用 |
| --- | --- |
| `EIS_UNREAL_ENGINE_ROOT` | UE 5.7 安装根目录 |
| `EIS_UNREAL_EXECUTABLE` | 已打包渲染器或 UnrealEditor 可执行文件 |
| `EIS_UNREAL_PROJECT` | 使用 UnrealEditor 时传入的 `.uproject` |
| `EIS_PIXEL_STREAMING_ROOT` | Pixel Streaming Infrastructure 本地缓存目录 |
| `EIS_PIXEL_STREAMING_URL` | Unreal 连接的 streamer WebSocket |
| `EIS_METAHUMAN_SIGNAL_URL` | Electron 使用的本地或远端信令地址 |
| `EIS_LIPSYNC_URL` | 已有音频驱动服务地址；默认 `http://127.0.0.1:8765` |
| `EIS_LIPSYNC_MODEL` | 本地 `best.pt` 模型路径 |
| `EIS_LIPSYNC_DEVICE` | `auto`、`mps`、`cuda` 或 `cpu` 推理后端 |
| `EIS_PYTHON` | Python 3.10-3.12 可执行文件 |
| `EIS_DISABLE_LIPSYNC` | 设为 `1` 时明确禁用口型服务 |

| 端口 | 用途 |
| --- | --- |
| `5173` | Vite 开发服务器 |
| `7790` | Electron 到 Unreal 状态桥 |
| `8080` | Pixel Streaming 玩家/HTTP 服务 |
| `8888` | Pixel Streaming streamer 连接 |
| `8765` | 本地音频到 ARKit 推理服务 |

所有默认服务只绑定本机回环地址。连接远端 GPU 渲染节点时，应使用 TLS、
访问控制和受信任网络，不应直接暴露这些本地端口到公网。

## 8. 验证清单

迁移到新电脑后依次执行：

```bash
cd english-immersion-studio
npm run bootstrap -- --check
npm run build
npm run metahuman:build
```

然后检查：

1. Unreal 能加载 `BP_Sophia`，且没有丢失材质。
2. 状态显示 Texture Sources 为最新。
3. 绑定状态为关节和混合形状。
4. 长直发是独立 Groom/Hair Cards，不是头部贴图。
5. 第一/第三人称相机能切换。
6. Electron 能收到 Pixel Streaming 视频。
7. `avatar.state` 能切换表演、发型、服装和场景。
8. 眨眼、口型、表情、呼吸和肩臂动作均通过实际播放验收。

## 9. 已验证与待验证

已在 macOS + UE 5.7.4 验证：

- C++ Editor target 编译。
- Sophia Tuya 成年女性基底。
- 2K MetaHuman 皮肤和眼睛材质。
- Sophia 的 `Hair_L_Straight`、Amara 的 `Hair_L_StraightBangs` 和
  Vivian 的 `Hair_M_BobStraight` 已在 Electron 中形成三种可辨认轮廓。
- 完整关节与 Blend Shapes 自动绑定。
- Optimized High MetaHuman 组装。
- 可重复生成的面试地图、三点灯光、中性背景和双相机。
- Electron WebSocket `avatar.state` 到 Unreal Director 的端到端控制。
- 第一/第三人称相机实时切换，且 Groom 内部 guides 不会被误显示。
- Epic 官方身体 idle、自然站姿和 facial idle 基础层。
- 三个运行时 MetaHuman 的真实点击切换。
- 六个场景选择均已恢复；Electron 标题与发送到 renderer bridge 的
  `sceneId` 已逐项匹配。
- MPS 本地音频模型在约 0.6 秒内生成 5.23 秒、314 帧 ARKit 数据。
- Electron `speech.face` 经 Bridge 和 LiveLink 实际驱动 Vivian 张口、露齿和闭唇。

仍需完成：

- 口型与音频的定量同步验收。
- 按 `performance` 切换倾听、思考、解释和鼓励手势。
- 其余 27 个身份、同源头像和职业/时尚服装资产。
- 六个 Unreal 场景的双视角 Pixel Streaming 画面验收。
- Windows 11 构建机上的打包和启动验收。
