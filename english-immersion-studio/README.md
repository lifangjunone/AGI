# English Immersion Studio

English Immersion Studio 是一个 Electron + Unreal Engine 5.7 的英语沉浸学习
桌面应用。产品目标是使用可动画的写实成年女性 MetaHuman，完成面试、餐厅、
酒店、闲聊、医疗和航班等真实英语练习。

## 当前真实状态

已经实现并在 macOS Electron 中运行验证：

- Electron 44、React 19、TypeScript、Vite 学习界面。
- 默认可用的 2D 肖像模式，不启动 Unreal、Pixel Streaming 或口型模型。
- 舞台内可随时切换 2D 肖像和 3D MetaHuman 模式。
- 26 个 21 岁以上虚构成年女性 2D 行业角色，包含医疗、航空、教育、
  时尚、文娱、服务和创意行业。
- 第二套 26 个亚洲审美成年女性角色，可在 Avatar 面板中切换。
- A1-C2 难度、五种字幕模式、句法、IPA、词性和上下文词义。
- Microsoft Neural TTS 的四种成年女性声线。
- Unreal Engine 5.7.4、MetaHuman、Pixel Streaming 2。
- Sophia、Amara、Vivian 三个独立 MetaHuman 运行资产。
- 三个角色的真实脸部切换；Sophia、Amara、Vivian 分别使用长直发、
  长刘海和 Bob 三种独立 Groom 轮廓。
- 第一和第三视角切换。
- 断线时非阻塞 UI、手动重连、Unreal 进程自动重启。
- 音频驱动口型：TTS 音频经本地 MPS/CUDA/CPU 模型生成 61 路 ARKit
  LiveLink 数据，再驱动当前 MetaHuman。

尚未完成，当前不会在 UI 中伪装为可用：

- 30 个角色以及与各自 3D 资产一致的 30 张头像。
- 护士、空乘、医生、模特、成人学院风、成熟职业等真实服装资产。
- 六个场景已恢复选择并连接真实 Unreal `sceneId`，但仍需完成逐场景双视角
  Pixel Streaming 画面验收。
- 每个角色独立的长发、服装和声音组合。
- Windows 打包和完整跨平台 UAT。

所有角色必须是明确的虚构成年女性。学院风、JK-inspired 等仅按成年时尚造型
制作，不制作或性化未成年人角色。

完整验收状态见 [`PRODUCT_ACCEPTANCE.md`](PRODUCT_ACCEPTANCE.md)，技术和迁移
说明见 [`TECHNOLOGY.md`](TECHNOLOGY.md)。

## 目录

```text
english-immersion-studio/
|-- electron/                         Electron 主进程和本地服务
|-- src/                              React 学习界面
|-- services/
|   |-- metahuman-renderer/           Unreal 5.7 MetaHuman 渲染器
|   `-- metahuman-lipsync-service/    MIT 音频到 ARKit 本地推理服务
`-- scripts/                          一键启动、构建和资产准备脚本
```

## 一键启动

先使用轻量 2D 版：

```bash
cd english-immersion-studio
npm run 2d
```

2D 模式只需要 Node.js 20.19+、22.12+ 或更新 LTS。角色、场景、对话、
字幕、学习分析和语音均可使用；不会启动 Unreal、Pixel Streaming 或本地
Audio2Lipsync 服务。

## 2D 角色图片生成

角色定义位于 `src/portrait-catalog.json`，原图保存在 `public/portraits/`，
用于舞台合成的透明前景保存在 `public/portrait-cutouts/`。
重新生成全部角色：

```bash
npm run portraits:generate
```

生成脚本使用 `.env.local` 中的 `ARK_API_KEY` 和 `ARK_IMAGE_MODEL`。
`.env.local` 已被 Git 忽略，禁止把真实密钥写入源码或提交到版本库。
图片生成完成后会运行本地人物分割，避免把摄影棚背景带入课程场景。

生成第二套亚洲审美角色：

```bash
npm run portraits:generate:asia
```

第二套图片分别保存在 `public/portraits-asia/` 和
`public/portrait-cutouts-asia/`，运行时无需再次调用图片 API。

需要测试 3D MetaHuman 时：

前置条件：

- Node.js 20.19+、22.12+ 或更新 LTS。
- Unreal Engine 5.7.x 和 MetaHuman Creator Core Data。
- Python 3.10-3.12。
- 首次安装依赖和模型时需要联网。

```bash
cd english-immersion-studio
npm run metahuman
```

首次运行会：

1. 准备 Pixel Streaming Infrastructure。
2. 创建隔离的 lip-sync Python 环境。
3. 下载并校验 MIT 模型。
4. 启动本地音频驱动服务、Unreal、Vite 和 Electron。

模型和依赖缓存完成后，口型推理在本机执行。单独准备口型环境：

```bash
npm run lipsync:setup
```

常用命令：

```bash
npm run typecheck
npm test
npm run build
npm run metahuman:build
npm run metahuman:package
```

自定义路径：

```bash
EIS_UNREAL_ENGINE_ROOT="/path/to/UE_5.7" npm run metahuman
EIS_UNREAL_EXECUTABLE="/path/to/renderer" npm run metahuman
EIS_LIPSYNC_URL="http://renderer-host:8765" npm run metahuman
```

Windows PowerShell 使用相同变量名：

```powershell
$env:EIS_UNREAL_ENGINE_ROOT="D:\Epic Games\UE_5.7"
npm run metahuman
```

## 口型架构

```text
Edge Neural TTS audio
  -> local Audio2Lipsync sidecar
  -> 61 ARKit channels at 60 fps
  -> Electron renderer bridge
  -> Unreal LiveLink subject FaceAnimation
  -> ABP_MH_LiveLink
  -> active MetaHuman face
```

上游代码和模型均为 MIT，固定来源和提交记录见
[`services/metahuman-lipsync-service/UPSTREAM.md`](services/metahuman-lipsync-service/UPSTREAM.md)。
模型不可用时 TTS 仍可播放，但应用不得把该状态标记为已同步口型。
