# Tauri Command 与事件契约

## Commands

| Command | 输入 | 输出 |
|---|---|---|
| `environment_check` | 无 | `EnvironmentCheck[]` |
| `task_create` | `TaskCreateInput` | `DeliveryTask` |
| `task_get` | `{ taskId }` | `TaskProjection` |
| `task_start` | `{ taskId }` | `Accepted` |
| `task_pause` | `{ taskId }` | `Accepted` |
| `task_resume` | `{ taskId }` | `Accepted` |
| `stage_retry` | `{ taskId, stage }` | `StageRun` |
| `approval_submit` | `ApprovalInput` | `Accepted` |
| `computer_takeover` | `{ taskId }` | `Accepted` |
| `computer_return_control` | `{ taskId }` | `Accepted` |
| `document_select` | 无 | `SelectedDocument` |

所有变更命令接受可选 `requestId`。主进程以 `taskId + requestId` 保证幂等。

## Events

| Channel | Payload | 用途 |
|---|---|---|
| `task-event` | `TaskEvent` | 权威任务事件 |
| `stage-output-delta` | `StageOutputDelta` | Agent 流式文本 |
| `computer-frame` | `ComputerFrame` | 低帧率窗口预览 |
| `approval-required` | `Approval` | 人工确认置前 |
| `environment-status` | `EnvironmentCheck[]` | 环境状态变化 |

事件先提交 SQLite 事务，再通过 Tauri event channel 发出。前端断线重连后调用 `task_get` 获取完整投影，不依赖丢失的内存消息。

## 错误

```json
{
  "code": "adapter.control_not_found",
  "message": "未找到 TraeWork 的上传附件按钮",
  "recoverable": true,
  "evidenceIds": ["shot-102"],
  "actions": ["retry", "takeover"]
}
```
