# English Immersion Studio

English Immersion Studio 是一款面向成年学习者的桌面英语沉浸训练应用。它通过具有鲜明性格、声音和造型的数字员工，还原面试、点菜、酒店入住、日常闲聊、就医和飞行服务等真实交流环境。

## 产品能力

- 六类固定情景与 AI 自适应推荐场景并存；顶部场景菜单可快速切换全部固定及推荐内容。
- 学习画像会持续汇总流利度、准确度、表达力、词汇、回答长度和连接词使用情况，并自动生成、排序针对薄弱项的专属练习。
- 支持 A1、A2、B1、B2、C1、C2 六档 CEFR 难度，角色开场、追问复杂度和教练目标会随难度变化。
- 支持纯英文、无字幕、英上中下、中上英下和纯中文五种字幕模式。
- Study 学习面板实时分析当前角色台词的句型、时态和逻辑结构。
- 每个英文单词提供本句语境下的中文含义，并可独立开关 IPA 音标与词性；固定搭配会联动改写单词义项并高亮显示。
- 设置、场景选项、短语库、学习记录、角色、造型和声音入口均支持直接操作；短语可一键插入回答，声音选项可即时试听。
- 基于 `@pixiv/three-vrm` 的真实 VRM/GLB 三维模型渲染，可直接导入自有模型。
- VRM 数字员工拥有骨骼姿态、呼吸、视线追踪、眨眼、情绪表情、说话口型和头部/手臂动作。
- 内置许可明确的写实成年真人 3D 角色，覆盖教师、医生、护士、空乘、21+ 学院风、高领、汉服、商务和二次元造型方向；切换造型会加载对应的完整模型。
- Avatar Studio 当前提供 30 个本地 AI 虚构成年女性纹理身份预设：韩国舞台妆、日本成人时尚、成熟职业造型各 10 个。点击后由本机 MediaPipe 检测 478 个面部 landmark，执行三角形 UV 纹理烘焙和受限的 3D 头部轮廓拟合；这些预设并非 30 套独立头部与发型几何。
- 头像和上传自拍会写入原生 3D 头部材质并继续由 113 个面部 Morph Targets 驱动眨眼、微笑和口型；不使用二维贴片或覆盖在头部前方的平面。
- 四位数字员工，具备不同角色、性格与英语口音。
- 八套强调成年魅力与精致曲线的可切换造型，包括商务、医生、护士、空乘、汉服、教师、时尚丝袜晚装和二次元风格。
- Three.js 全屏景深舞台支持第一视角与第三视角实时切换，并通过镜头视差、呼吸起伏和身体重心变化建立临场感。
- 数字员工会随对话进入邀请、倾听、思考、解释和鼓励状态，并同步切换面部表情、眼神和手势。
- 角色台词、眼神状态和“耳边教练”提示都位于第一人称视野内，学习者直接面对角色完成表达。
- 支持键盘输入和浏览器语音识别；不支持语音识别的环境会提供演示回退。
- 桌面端使用 Microsoft 在线神经网络语音生成角色回应，内置甜美、元气甜妹、沉稳御姐和英伦御姐四种声线。
- 支持 96 kbps 神经语音、语速调节、自动播放和内存缓存；断网或网页预览时自动回退系统英语语音。
- 多轮情景对话、上下文回应、流利度/准确度/表达力即时评分。
- Electron 原生桌面窗口，同时可在浏览器中预览前端。

## 技术栈

- Electron
- Three.js
- React 19
- TypeScript
- Vite
- Vitest
- Web Speech API
- Microsoft Neural TTS

## 跨平台一键启动

### 前置条件

- macOS 14+（Apple Silicon）或 Windows 11 x64。
- Node.js 20.19+、22.12+ 或更新的 LTS 版本。
- 首次运行需要联网下载 npm 依赖；完成后当前 Electron/Three.js
  应用可离线启动。

在 macOS Terminal、Windows PowerShell 或 CMD 中执行同一条命令：

```bash
cd english-immersion-studio
npm run bootstrap
```

启动器会检查 Node.js 版本，在首次运行时执行 `npm ci`，随后启动 Vite
和 Electron。其他模式：

```bash
npm run bootstrap -- --web        # 只启动浏览器预览
npm run bootstrap -- --check      # 类型检查和测试
npm run bootstrap -- --build      # 生成前端生产构建
npm run bootstrap -- --no-install # 跳过依赖安装
```

直接使用原命令仍然有效：`npm run dev`、`npm run dev:web`、`npm test`。

### MetaHuman 运行方式

生产级数字人选用 MetaHuman 5.7。Unreal 工程位于
[`../metahuman-renderer/`](../metahuman-renderer/README.md)，Electron 已接入
Epic 官方 UE 5.7 Pixel Streaming 前端和本机状态桥接。安装并打包 Unreal
渲染器后，设置可执行文件并使用统一入口：

```bash
# macOS
export EIS_UNREAL_EXECUTABLE="/absolute/path/to/EnglishImmersionRenderer.app/Contents/MacOS/EnglishImmersionRenderer"
npm run metahuman
```

```powershell
# Windows PowerShell
$env:EIS_UNREAL_EXECUTABLE="C:\EnglishImmersionRenderer\EnglishImmersionRenderer.exe"
npm run metahuman
```

`npm run metahuman` 首次运行会将 Epic UE5.7 Pixel Streaming
Infrastructure 下载到用户目录并完成构建，随后启动信令服务、Unreal 和
Electron。也可以连接已有 Windows/Linux GPU 渲染节点：

```bash
EIS_METAHUMAN_SIGNAL_URL=wss://renderer.example.com npm run metahuman
```

构建 Unreal 工程：

```bash
npm run metahuman:build
npm run metahuman:package
```

若 Unreal Engine 安装在非默认目录，设置 `EIS_UNREAL_ENGINE_ROOT`。如果
`EIS_UNREAL_EXECUTABLE` 指向 `UnrealEditor`，同时设置
`EIS_UNREAL_PROJECT` 为 `.uproject` 绝对路径。启动器会统一管理相关进程。

### 虚拟化与迁移

| 组件 | macOS 宿主机 | Windows x64 宿主机/云 GPU VM | Docker |
|---|---|---|---|
| Electron/React 应用 | 支持 | 支持 | 不建议，桌面 GUI 无收益 |
| MetaHuman Creator 5.7 | 支持 | 支持 | 不支持 |
| MetaHuman Identity / `Conform from Identity` | 不支持 | 支持 | 普通容器不支持 |
| Unreal 实时渲染 | 支持，使用 hair cards | 支持，可使用高质量 strand groom | 仅限具备 NVIDIA GPU 直通和图形会话的专用环境 |
| 无界面 API/任务队列 | 支持 | 支持 | 推荐 |

需要照片身份重建时，使用 Windows 11 x64 实机或带 NVIDIA GPU 直通的云
虚拟机作为离线制作节点；产出的 Optimized High 角色资产再分别打包到
macOS 和 Windows。Docker 可承载任务队列、资产索引等无界面服务，但不能
替代 MetaHuman Identity 或桌面 Unreal 渲染器。

## 照片生成数字人

Avatar Studio 不提供二维贴脸回退。MediaPipe WASM 和 `face_landmarker.task` 均随应用本地打包；选择内置身份或上传照片后，浏览器进程直接完成 landmark 检测、逐三角形纹理映射、边缘融合和头部比例拟合，不需要环境变量、远端 API 或常驻生成服务。

该链路是现有离线原型，只改变脸部纹理、有限头型参数和发色，不能从照片重建独立头部或发型几何，因此不再作为生产级数字人方案。质量优先的生产方案已选定 Epic MetaHuman 5.7，完整选型、平台限制和迁移方案见 [`../.planning/spikes/001-avatar-platform-selection/README.md`](../.planning/spikes/001-avatar-platform-selection/README.md)。

相邻目录 [`../avatar-generator-service/`](../avatar-generator-service/README.md) 是独立的 Apple Silicon 整身材质工具。它使用 Hunyuan3D-Swift/MLX Paint 生成 PBR 材质，并将材质合并回原始 GLB，保留 skin、joint weights 和 113 个面部 Morph Targets；它不再承担近景头像换脸。应用内默认模型和相关开源许可见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run ui:check
npm run faces:check
npm run voice:check
```

`npm run ui:check` 使用本机 Chrome 验证 WebGL 画布、相机切换、本地头像资源、MediaPipe 身份烘焙、照片上传、模型导入及两种桌面窗口尺寸，并输出截图到 `test-results/`。

`npm run faces:check` 会逐一点击并生成 30 个本地身份，确认每个身份都恢复到 3D ready 状态并保留眨眼和口型 Morph Targets。

`npm run voice:check` 会实际请求一段神经语音并校验返回的 MP3 音频，需要联网。

## 桌面打包

```bash
npm run pack
```

打包产物不会提交到仓库。头像与场景图片随应用本地提供，启动时不访问远程图片生成接口；神经语音需要联网，系统语音和可用口音取决于操作系统安装的语音。
