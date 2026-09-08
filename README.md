# LifeYouMe Product Workspace

这是一个由多个本地优先 AI 产品、交付工具和学习产品组成的产品工作区。每个子项目都可以独立安装、运行、测试和发布；根目录只负责项目导航、协作关系和统一命名。

在线产品：[免费检查 GitHub 开源项目是否适合生产采用](https://audit.lifeyoume.icu/)；专业整改报告 ¥9.90/仓库，支持微信扫码。

## 项目目录

| 目录 | 产品 | 定位 | 技术形态 |
| --- | --- | --- | --- |
| [`lifeyoume-platform/`](lifeyoume-platform/README.md) | LifeYouMe Platform | 产品门户、运营控制、身份/支付边界和私有健康检查 | Python、systemd、Nginx |
| [`technology-intelligence/`](technology-intelligence/README.md) | Technology Intelligence | 技术信号聚合、主题学习、需求匹配和 Demo 交接 | Python、Objective-C、WebKit |
| [`opportunity-factory/`](opportunity-factory/README.md) | [Opportunity Factory](https://audit.lifeyoume.icu/) | 免费审计 GitHub 开源项目生产采用风险，生成可付费下载的整改报告 | Python、Objective-C、WebKit、Nginx |
| [`delivery-control-center/`](delivery-control-center/README.md) | Delivery Control Center | 从需求输入到研发、测试、部署和交付收据的桌面控制中心 | Electron、Node.js |
| [`delivery-pilot/`](delivery-pilot/README.md) | DeliveryPilot | Tauri 研发交付驾驶舱，负责执行、恢复、验收和质量门禁 | Tauri 2、React、Rust、Swift、SQLite |
| [`english-speaking-coach/`](english-speaking-coach/README.md) | English Speaking Coach | 面向成年人的英语口语训练和本地语音学习产品 | React、TypeScript、Capacitor、Python MLX |
| [`english-immersion-studio/`](english-immersion-studio/README.md) | English Immersion Studio | 通过成年 3D 数字员工、30 个本地纹理身份预设、离线照片烘焙、薄弱项推荐及语言分析构建沉浸式英语环境；生产级角色已选型 MetaHuman 5.7 | Electron、React、Three.js、MediaPipe、Neural TTS |
| [`avatar-generator-service/`](avatar-generator-service/README.md) | Local Avatar Generator | 在 Apple Silicon 上重绘可动画 GLB 材质，并保留骨骼、权重和面部 Morph Targets | Swift、MLX、Node.js |
| [`english-foundation/`](english-foundation/README.md) | English Foundation | 面向初学者的词汇、句子、语法和错项复习桌面产品 | Tauri 2、React、TypeScript、Rust |
| [`fde-playbook/`](fde-playbook/README.md) | FDE Playbook | FDE 岗位认知、交付方法、能力地图和制造业实战 | React、TypeScript、Vite |
| [`agent-workforce-console/`](agent-workforce-console/README.md) | Agent Workforce Console | 多 Agent 任务图、协作、评审和人工门禁控制台 | React、TypeScript、Vite |
| [`hover-translator/`](hover-translator/README.md) | Hover Translator | macOS 全局划词、悬停取词和英译中桌面工具 | Electron、React、Swift、Apple Vision |

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

- `english-immersion-studio`：新增沉浸式英语桌面训练产品，覆盖固定/推荐场景、CEFR 难度、语言分析、字幕模式、VRM/GLB 角色、MediaPipe 本地头像烘焙、Microsoft 神经语音和 MetaHuman 5.7 生产级数字人接入。
- `english-immersion-studio`：补充 [MetaHuman 资产重建说明](english-immersion-studio/docs/METAHUMAN_ASSET_REBUILD.md)，明确公共仓库边界、私有备份、角色重建和视觉验收要求。
- `avatar-generator-service`：新增 Apple Silicon 本地头像材质生成服务，基于 Hunyuan3D-Swift/MLX Paint 生成 GLB PBR 材质，并保留骨骼、权重和面部 Morph Targets。
- `metahuman-renderer`：新增 Unreal Engine 5.7 MetaHuman 渲染工程，用于承载 Pixel Streaming、角色状态桥接、摄像机、发型、服装和面部动画运行契约。
- `hover-translator`：新增 macOS 全局英语翻译工具，支持悬停取词、框选句子、双击单词、Apple Vision OCR、音标词性和离线词典回退。
- `opportunity-factory`：新增 ¥9.90 微信首单闭环，包含私有收款码、唯一付款备注、付款申报、后台核账确认、报告解锁和人民币收入记账；静态码不被伪装为自动支付接口。

## 远端仓库

```text
https://github.com/lifangjunone/AGI.git
```
