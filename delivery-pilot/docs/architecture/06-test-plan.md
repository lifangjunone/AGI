# 第一阶段测试方案

## 单元测试

- 任务阶段只能按允许的状态转换推进。
- 事件序号严格递增，重复幂等键不产生第二条事件。
- 领导视角和开发者视角从同一事件集合得到一致状态。
- 文件扩展名、大小、SHA-256 和不支持格式处理正确。
- 审批通过、退回、暂停、恢复和重试产生正确事件。
- Prompt 模板缺少变量时拒绝执行。

## Adapter 契约测试

- 使用固定 AX Tree fixture 验证 `New task`、附件、输入框和发送按钮定位。
- 控件缺失时返回可恢复错误和截图 ID。
- Agent 输出稳定两秒且无弹窗时才判定完成。
- 重试附件动作不会创建重复附件。

## 桌面 E2E

1. 导入预置 DOCX。
2. 创建任务并启动 mock TraeWork。
3. 验证事件实时出现且顺序正确。
4. 切换两种视角，验证任务 ID、阶段和状态一致。
5. 在业务确认节点刷新应用，验证状态恢复。
6. 确认后验证任务进入 Spec 阶段。
7. 模拟控件找不到，验证错误证据、重试和人工接管入口。

## 验证命令

```bash
npm run lint
npm run test
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --workspace
```

真实 TraeWork 连续 10 次主链路测试作为接入真实 sidecar 后的发布门禁。
