# DeliveryPilot

产品类型：研发交付驾驶舱
运行形态：Tauri 2 macOS 桌面应用、Rust、Swift sidecar
协作项目：[`technology-intelligence/`](../technology-intelligence/)、[`delivery-control-center/`](../delivery-control-center/)

基于《AI研发交付桌面端开发方案》实现的 macOS AI 研发交付桌面应用。

当前版本完成第一阶段可运行原型：

- 需求文档接入与 SHA-256 指纹
- 统一任务事件模型
- 领导视角与开发者视角
- mock TraeWork 可见编排过程
- 业务人工确认节点
- 浏览器本地状态恢复
- 仅在存在运行中任务时启用异常退出恢复，并始终尊重用户主动退出
- Tauri 2、SQLite 与 Swift sidecar 骨架

## 直接打开桌面应用

在 Finder 中双击：

```text
release/DeliveryPilot.app
```

也可以执行：

```bash
npm run open:app
```

重新打包桌面应用：

```bash
source "$HOME/.cargo/env"
npm run build:app
```

## 前端开发

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:1420`。

开发模式运行桌面壳：

```bash
rustup target add aarch64-apple-darwin
npm run tauri dev
```

## 验证

```bash
npm run lint
npm run test
npm run build
swift build --package-path sidecars/macos-computer-use
```

## 后台任务恢复

执行控制中心提供“异常退出自动恢复”开关。自动拉起只在以下条件同时满足时生效：

- 用户已开启异常退出自动恢复
- 当前存在 `monitoring`、`recovering` 或 `transition_pending` 状态的任务
- 最近一次退出不是用户主动退出

用户通过菜单或 `Command+Q` 主动退出后，DeliveryPilot 会写入停机标记，后台 LaunchAgent 不会重新打开应用。用户下次主动启动应用时会清除该标记；此后如果仍有运行中任务，异常崩溃恢复才会重新生效。没有运行中任务时，LaunchAgent 保持空闲，不会自动启动应用。

## 产品宣讲资料

面向客户和管理者的高级宣讲版位于：

[`DeliveryPilot产品介绍-高级宣讲版.pptx`](DeliveryPilot产品介绍-高级宣讲版.pptx)

该材料介绍产品定位、端到端交付闭环、数字员工协作、自动化业务验收和交付质量门禁。

## 工程边界

- 原始设计资料保持在上级目录，应用源码位于独立 `delivery-pilot/`。
- UI 不直接调用 shell 或 Accessibility API。
- 浏览器模式使用 mock adapter；真实系统操作必须经过 Tauri 主进程和 Swift sidecar。
- 技术契约位于 `docs/architecture/`。

## Technology Exploration Demo Handoff

DeliveryPilot 持续检查共享的 `technology-demo-handoff/1.0` 收件箱。收到目标为
`delivery-pilot` 的事件后，会直接复用现有 `createTask -> startTask` 真实交付链：

- 自动创建独立项目版本与原始需求归档
- 默认使用无人值守模式并启用 Technology Exploration 技术证据
- 继续执行需求分析、方案、开发、自动化测试、部署与验收
- 每 5 秒回写真实阶段、进度、工作区和最终 HTTP Demo 地址
- 同时使用 Tauri 事件与持久化轮询，应用已打开或窗口事件丢失时仍可接管
