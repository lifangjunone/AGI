# Swift Sidecar JSONL 协议

## 传输

Rust 主进程启动 sidecar，通过 `stdin/stdout` 交换单行 JSON。`stdout` 仅用于协议消息，诊断日志写入 `stderr`。每个请求必须有唯一 `id`。

## 请求

```json
{"id":"a1","method":"permission.check","params":{}}
{"id":"a2","method":"app.focus","params":{"bundleId":"cn.trae.solo.app"}}
{"id":"a3","method":"ui.snapshot","params":{"bundleId":"cn.trae.solo.app"}}
{"id":"a4","method":"ui.click","params":{"selector":{"role":"AXButton","name":"New task"}}}
{"id":"a5","method":"ui.type","params":{"selector":{"role":"AXTextArea"},"text":"...","sensitive":false}}
```

## 响应

```json
{"id":"a4","ok":true,"durationMs":184,"screenshotId":"shot-102","result":{}}
```

失败响应：

```json
{"id":"a4","ok":false,"durationMs":3200,"error":{"code":"control_not_found","message":"未找到控件","recoverable":true},"screenshotId":"shot-103"}
```

## 约束

- 每次动作前校验 Bundle ID、窗口和焦点。
- 选择器顺序为 AX role/name、文字结构、视觉识别、相对坐标兜底。
- 点击和输入动作前后各保存一张证据图。
- `sensitive=true` 时事件只保存长度和哈希，不保存正文。
- sidecar 不直接访问 SQLite，也不决定重试和审批。
