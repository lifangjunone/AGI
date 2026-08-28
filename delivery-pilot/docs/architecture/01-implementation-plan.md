# 第一阶段技术实现计划

## 目标

交付一个 macOS Apple Silicon 上可运行的 DeliveryPilot 第一阶段版本：用户导入需求文档后，应用以统一事件流驱动领导视角和开发者视角，展示 TraeWork 分析过程并进入人工业务确认。

## 实施顺序

1. 建立 React + TypeScript + Vite UI 与 Tauri 2 Rust 主进程。
2. 定义任务、阶段运行、事件、审批和产物领域模型。
3. 使用 SQLite 追加写入事件，并从事件恢复任务投影。
4. 建立 mock TraeWork adapter，跑通文档接入、分析、审批主链路。
5. 建立 Swift JSONL sidecar 协议和 AX 权限检查骨架。
6. 接入真实 TraeWork 语义控件定位、截图和完成监控。

## 模块边界

- UI 只通过 Tauri commands 发起意图，通过 events 接收事实。
- Orchestrator 负责状态机、幂等键和阶段恢复。
- Event Store 先落盘事件，再通知 UI。
- Adapter 只处理外部系统能力，不决定业务流程。
- 原始文档复制到任务 `source/`，研发产物写入独立 `artifacts/`。

## 第一阶段完成门槛

- 导入 `pdf/docx/txt/md/xlsx` 并显示文件元数据。
- 两种视角读取同一个任务投影，切换时状态不丢失。
- mock 分析过程产生真实、可回放的顺序事件。
- `approval.required` 后必须人工确认才能继续。
- 刷新或重启后能从本地事件快照恢复。
- 前端单元测试、类型检查和构建通过。
