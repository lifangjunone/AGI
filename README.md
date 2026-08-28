# desk_apps

本仓库是一组本地优先的 AI 产品与共享平台服务，覆盖产品门户、运营控制、技术情报、商机发现、自动化研发交付和语言学习。各产品独立运行，同时通过产品注册、本机文件与事件协议形成从“发现机会”到“交付验证”的协作链路。

## 项目目录

| 目录 | 项目 | 简介 | 技术形态 |
| --- | --- | --- | --- |
| [`LifeYouMe_Platform/`](LifeYouMe_Platform/README.md) | LifeYouMe Platform | `lifeyoume.icu` 旗下产品的共享控制面，提供产品门户、运营控制台、身份与支付服务边界及私有健康检查。 | Python、systemd、Nginx |
| [`Opportunity_Compass/`](Opportunity_Compass/README.md) | 商机罗盘 | 从技术情报中筛选可收费、可触达、可在 7 天内验证的商机，并通过无人值守商机工厂持续发现和验证需求。 | Python、Objective-C、WebKit、Nginx |
| [`Technology_Exploration/`](Technology_Exploration/README.md) | Technology Exploration Agent | 聚合多平台技术信号，支持主题化学习、持续需求匹配，并可把候选技术直接交给研发工具生成 Demo。 | Python、Objective-C、WebKit |
| [`OneOPC/`](OneOPC/README.md) | OneOPC | 输入文字描述或需求文档，编排数字员工与开发工具，完成研发、验证和本地系统交付；首页直接汇总监管重点与交付收据，本地草稿具备双副本完整性保护。 | Electron、Node.js |
| [`delivery-pilot/`](delivery-pilot/README.md) | DeliveryPilot | 接收需求或技术情报 Demo 任务，通过 Tauri 与 macOS Sidecar 执行研发、自动化业务验收和交付质量门禁；运行中任务支持异常恢复，同时尊重用户主动退出。 | Tauri 2、React、Rust、Swift、SQLite |
| [`easysay/`](easysay/README.md) | EasySay | 面向中国成年人的英语口语训练应用，提供原生手机端、本地 ASR/TTS、课程自进化和间隔复习。 | React、TypeScript、Capacitor、Python MLX |
| [`english-foundation/`](english-foundation/README.md) | Foundation | 面向英语初学者的本地桌面学习软件，通过词汇理解、句子拆解、语法辨析和错项复习夯实基础。 | Tauri 2、React、TypeScript、Rust |
| [`fde-fieldbook/`](fde-fieldbook/README.md) | FDE 前线工程手册 | 介绍 Forward Deployed Engineer 岗位、交付方法、能力与入行路径，并通过制造业部署任务提供可评分的交互实战。 | React、TypeScript、Vite |
| [`nexora/`](nexora/README.md) | Nexora | 本地优先、证据驱动的多 Agent 自主协作控制台，通过任务图、持久身份、独立评审、风险门禁和共享记忆完成复杂目标。 | React、TypeScript、Vite |

## 项目协作链路

```text
LifeYouMe Platform
  └─ 产品注册、域名路由与运行状态 ──> 商机罗盘 / EasySay / 后续独立产品

Technology Exploration Agent
  ├─ 技术信号与持续需求匹配 ──> OneOPC / DeliveryPilot ──> Demo 与交付证据
  └─ 本机技术报告 ──> 商机罗盘 ──> 需求验证、产品上线与经营复盘

EasySay
  └─ 独立的移动英语学习产品，复用本地 AI、语音和原生应用能力，并预留平台入口

Foundation
  └─ 独立的桌面英语基础训练产品，通过本地学习记录衔接词汇、句子、语法与复习

Nexora
  └─ 将复杂目标编译为 Agent 任务图，通过并行执行、证据评审与人工门禁形成可审计的自主协作闭环
```

## 快速开始

进入对应项目目录后按项目 README 运行。

### LifeYouMe Platform

```bash
cd LifeYouMe_Platform
python3 -m unittest discover -s tests
SERVICE_ROLE=portal python3 platform/app.py
```

本地产品门户默认运行在：

```text
http://127.0.0.1:8800
```

### 商机罗盘

```bash
cd Opportunity_Compass
chmod +x scripts/build.sh scripts/install_daily.sh
./scripts/build.sh
```

构建产物：

```text
Opportunity_Compass/dist/商机罗盘.app
```

运行无人值守商机工厂：

```bash
./scripts/run_factory_local.sh
```

### DeliveryPilot

```bash
cd delivery-pilot
npm install
npm run dev
```

桌面应用打包：

```bash
cd delivery-pilot
source "$HOME/.cargo/env"
npm run build:app
```

### OneOPC

```bash
cd OneOPC
npm install
npm start
```

验证与打包：

```bash
npm run check
npm run pack
```

### Technology Exploration Agent

```bash
cd Technology_Exploration
./scripts/build.sh
```

构建后双击：

```text
Technology_Exploration/dist/Technology Exploration.app
```

### EasySay

```bash
cd easysay
npm install
cp .env.example .env
npm run speech:setup
npm run dev
```

桌面开发地址默认是：

```text
https://localhost:5173
```

启动手机学习服务：

```bash
npm run native:start
```

### Foundation

```bash
cd english-foundation
npm install
npm run tauri dev
```

验证与打包：

```bash
npm test
npm run build
npm run build:app
```

### FDE 前线工程手册

```bash
cd fde-fieldbook
npm install
npm run dev
```

本地开发地址默认是：

```text
http://127.0.0.1:5173
```

### Nexora

```bash
cd nexora
npm install
npm run dev
```

验证：

```bash
npm test
npm run build
```

## 仓库约定

- 根目录只作为项目集入口，不直接放业务源码。
- 每个应用保留自己的 README、依赖声明、构建脚本和验证命令。
- 原始输入资料、研发过程资产、构建产物和依赖缓存要按项目目录隔离管理。
- 不提交 `node_modules/`、`dist/`、`build/`、`target/`、`test-results/`、`.workspace/`、`.sandbox/`、`.dbg/`、`.build/`、`.cert/`、本地模型、`.env` 和私钥证书。
- 如需新增项目，请新建独立目录，并在本 README 的“项目目录”表格中补充说明。

## 客户讲解资料

- [DeliveryPilot 高级宣讲版](delivery-pilot/DeliveryPilot产品介绍-高级宣讲版.pptx)：介绍 AI 研发交付闭环、数字员工协作、自动化业务验收与质量门禁。

## 常用命令

查看仓库状态：

```bash
git status --short --branch
```

提交全部源码改动：

```bash
git add -A
git commit -m "update project source"
git push
```

检查是否有大文件或敏感文件被暂存：

```bash
git diff --cached --name-only | rg '(^|/)(node_modules|dist|target|\.workspace|\.dbg|\.build|\.cert)/|\.(pem|key|p12|pfx)$'
```

## 远端仓库

```text
https://github.com/lifangjunone/desk_apps.git
```
