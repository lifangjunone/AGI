# Work Shadow Recorder v0.1 · 工作旁听采集器

这是一个可以马上本地试用的「任务级工作旁听」原型。

它的目的不是监控员工，而是验证这个产品想法：

> 用户在处理一次真实任务时，主动把 AI 对话、操作记录、产物变化、验证证据和验收反馈放进来，系统把这些材料编译成数字员工可学习的「方法卡」。

## 它会采集什么

- 任务目标与约束
- AI 协作对话
- 人工操作记录
- git diff / 文档差异 / 产物变化
- 测试、截图、检查项等验证证据
- 真人验收或退回反馈

## 它不会做什么

- 不录屏
- 不监听键盘
- 不扫描电脑文件
- 不读取浏览器历史
- 不上传任何数据
- 不需要模型密钥

所有数据保存在：

```bash
runtime/work-shadow-recorder.json
```

## 快速试用

```bash
cd /Users/bytedance/Desktop/agi/agent-workforce-lab/work-shadow-recorder
python3 recorder.py --demo
python3 recorder.py
```

打开：

```text
http://127.0.0.1:43233/
```

## 你可以怎么演示

1. 点击左侧创建一个「旁听会话」。
2. 粘贴一段你和 AI 的真实对话，类型选择「AI 协作」。
3. 粘贴一段操作记录，例如“打开页面、修改入口、运行测试”。
4. 粘贴 git diff 或拖入 `.diff/.patch/.md/.txt` 文件，类型选择「产物变化」。
5. 粘贴测试结果或验收标准，类型选择「验证证据」。
6. 点击「生成方法卡」。
7. 导出 Markdown 报告。

## 命令行导出

```bash
python3 recorder.py --export WS-xxxxxxx > report.md
```

## 产品验证点

这版重点验证三件事：

1. 用户是否愿意以“任务”为单位主动开启旁听；
2. 半自动采集是否足够讲清“从真实工作到数字员工方法卡”；
3. 方法卡是否比原始聊天记录更像可复用能力。

如果这版手感成立，再进入下一阶段：

- 浏览器插件 / rrweb：自动采 Web 操作回放；
- Agent 插件：自动采 Codex、Claude、WorkBuddy 对话与工具调用；
- git/test 集成：自动采 diff、测试和截图；
- Screenpipe / OpenAdapt 对照：评估是否接桌面旁听或示范编译能力。
