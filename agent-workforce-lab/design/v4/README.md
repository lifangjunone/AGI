# Workforce Lab · 可操作的数字校园 v4

仅 UI 交互原型，独立于旧版本；不连接模型或业务后端。

## 打开与演示

直接打开 `index.html`，或启动本地静态服务：

```bash
python3 -m http.server 43220 --bind 127.0.0.1 --directory /Users/bytedance/Desktop/agi/agent-workforce-lab/design/v4
```

访问 [本地校园](http://127.0.0.1:43220/)。

1. 创建「晓禾」，填写「客服经验与知识写作」。
2. 在教学室回答：先记录诉求与依据，政策不明确时找真人，不承诺退款。
3. 编辑方法，补充适用条件与红线，确认理解。
4. 场景考试尝试错误答案，再选「整理已知信息，缺少依据先向真人澄清」；检查答法。
5. 检查试岗成果，获得对应样例资格。
6. 发布「分析北区客户反馈，提出知识库改进方案」，填写希望成果与未来时间。
7. 观察晓禾独立开始、邀请知远、第三人青岚加入建立 TG-001；原任务编号保持。
8. 分别打开三项成果；退回意见 → 完成样例修订 → 独立评审 → 真人验收。
9. 将反馈回流教学室，确认经验候选。

可以直接点击建筑或下沿文字按钮，不必等待人物。手机切换空间后定位操作面板；工作记录可以完整文字查看。

## 文件与证据

- [实际演化记录](ITERATIONS.md)：11 轮 before / after；不是十项清单。
- [设计系统与交互规范](DESIGN_SYSTEM.md)：视觉、身份、流程、响应式、技能取舍与竞品引用边界。
- `review.cjs`：逐轮截图工具。
- `verify.cjs`：完整故事与异常回归，支持 `RECORD=1`。
- `evidence/round-01` 到 `round-11`：实际逐轮图。
- `evidence/final`：最终页面、尺寸图、验证结果与录屏。

截图脚本使用本机已安装的 Playwright skill，不安装到其他项目，不需要项目密钥：

```bash
REVIEW_ROUND=10 REVIEW_PHASE=after node /Users/bytedance/.codex/skills/playwright-skill/run.js /Users/bytedance/Desktop/agi/agent-workforce-lab/design/v4/review.cjs
RECORD=1 node /Users/bytedance/.codex/skills/playwright-skill/run.js /Users/bytedance/Desktop/agi/agent-workforce-lab/design/v4/verify.cjs
```

## 明确限制

状态仅保存在当前页面内存，刷新重置。每次演示一位自建员工、一项任务，两位帮手预置为样例。重新发布不会覆盖已有任务。

教学理解反馈、考试、接单判断、执行、评审和成果是可操作的固定示例，不是实际模型行为。文件选择只显示文件名，不上传/解析；没有真实学习、Semantica、权限校验、积分账本、任意命令执行、外发或资金操作。

10 轮以上视觉自查与自动化不能替代客户理解测试。当前交付止于设计评审，确认之后才进行应用编码。
