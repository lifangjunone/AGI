# LifeYouMe Product Workspace

这是一个由多个本地优先 AI 产品、交付工具和学习产品组成的产品工作区。每个子项目都可以独立安装、运行、测试和发布；根目录只负责项目导航、协作关系和统一命名。

## 项目目录

| 目录 | 产品 | 定位 | 技术形态 |
| --- | --- | --- | --- |
| [`lifeyoume-platform/`](lifeyoume-platform/README.md) | LifeYouMe Platform | 产品门户、运营控制、身份/支付边界和私有健康检查 | Python、systemd、Nginx |
| [`technology-intelligence/`](technology-intelligence/README.md) | Technology Intelligence | 技术信号聚合、主题学习、需求匹配和 Demo 交接 | Python、Objective-C、WebKit |
| [`opportunity-factory/`](opportunity-factory/README.md) | Opportunity Factory | 从技术和市场信号中发现、审计、验证并推进可收费机会 | Python、Objective-C、WebKit、Nginx |
| [`delivery-control-center/`](delivery-control-center/README.md) | Delivery Control Center | 从需求输入到研发、测试、部署和交付收据的桌面控制中心 | Electron、Node.js |
| [`delivery-pilot/`](delivery-pilot/README.md) | DeliveryPilot | Tauri 研发交付驾驶舱，负责执行、恢复、验收和质量门禁 | Tauri 2、React、Rust、Swift、SQLite |
| [`english-speaking-coach/`](english-speaking-coach/README.md) | English Speaking Coach | 面向成年人的英语口语训练和本地语音学习产品 | React、TypeScript、Capacitor、Python MLX |
| [`english-foundation/`](english-foundation/README.md) | English Foundation | 面向初学者的词汇、句子、语法和错项复习桌面产品 | Tauri 2、React、TypeScript、Rust |
| [`fde-playbook/`](fde-playbook/README.md) | FDE Playbook | FDE 岗位认知、交付方法、能力地图和制造业实战 | React、TypeScript、Vite |
| [`agent-workforce-console/`](agent-workforce-console/README.md) | Agent Workforce Console | 多 Agent 任务图、协作、评审和人工门禁控制台 | React、TypeScript、Vite |

## 产品协作链路

```text
Technology Intelligence
  ├─ 技术信号与需求匹配 ──> Opportunity Factory
  ├─ Demo handoff ──> Delivery Control Center
  └─ Demo handoff ──> DeliveryPilot

LifeYouMe Platform
  └─ 产品注册、域名路由、运营状态和共享服务边界

English Speaking Coach / English Foundation / FDE Playbook / Agent Workforce Console
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
cd ../english-foundation && npm install && npm run tauri dev
cd ../fde-playbook && npm install && npm run dev
cd ../agent-workforce-console && npm install && npm run dev
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

## 代码索引

仓库级代码地图位于 [`.planning/codebase/`](.planning/codebase/)，包含结构、架构、技术栈、集成、测试约定和风险记录。

## 远端仓库

```text
https://github.com/lifangjunone/desk_apps.git
```
