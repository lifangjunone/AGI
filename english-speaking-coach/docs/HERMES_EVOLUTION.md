# Hermes Cognitive Evolution Engine

EasySay 的“赫尔墨斯认知进化引擎”是可选的高级学习能力。它使用
[NousResearch Hermes Agent](https://github.com/NousResearch/hermes-agent)
归纳真实练习轨迹，并调整当前周及未来最多六周的课程。

## 能力边界

- 分析转写、练习时长、四维评分、待补强记录和现有课程结构。
- 输出优势、优先问题、证据、下一步动作和路线调整原因。
- 只修改当前周及未来课程，不改写历史学习记录。
- 用户确认通过仍记为“待补强”，不会被当作标准掌握。
- 不向 Hermes 发送录音文件。
- 默认关闭，用户必须在“设置 > 高级自进化”中主动启用。

## 安装

```bash
npm run hermes:setup
hermes setup
```

`hermes setup` 用于选择推理服务。可以配置 Nous Portal、OpenRouter、
OpenAI 或兼容的本地模型服务。密钥保存在 Hermes 自己的用户配置中，
不进入 EasySay 仓库。

## 运行与检查

```bash
npm run hermes:doctor
```

EasySay 通过 `hermes chat -Q` 按需运行 Agent，不需要常驻 Proxy。
每位学习者使用独立的 `easysay-*` 持久会话，让 Hermes 可以在后续
进化周期中继续使用既有学习记忆。

## 环境变量

```bash
HERMES_AGENT_BIN=/Users/yourname/.local/bin/hermes
HERMES_HOME=/Users/yourname/.hermes
```

通常无需设置，EasySay 会使用标准安装位置。模型密钥只配置在
`~/.hermes/.env` 或 Hermes 的 OAuth 存储中。

## 自进化周期

默认每新增三次口语记录运行一次。用户也可以关闭自动运行，改为手动点击
“立即进化”。Hermes 不在线时现有学习、ASR、TTS 和固定路线继续正常工作。
