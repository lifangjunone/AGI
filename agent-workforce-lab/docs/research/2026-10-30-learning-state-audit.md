# 学习记录交互连续性

本轮只修隔离设计原型，未替换正式产品。

## 实际问题

确认动作只改变文字而未保存记录状态；切换回来再次要求回答。确认后替换了整个响应区，其他记录可能丢失复述与确认按钮。记录列表、手机选择器与待处理数量也不一致。

## 修复

- 每条记录独立保存回答、理解草稿、是否待确认及确认状态。
- 已确认记录切换回来保留原回答，不再次要求确认。
- 未确认记录可以独立复述、修改和确认。
- 列表、选择器、数量和成长节点反映同一状态。
- 过短回答保留输入，聚焦字段并显示可读错误。
- 对话框有明确可访问标题，保留原生 Escape 与焦点约束。

原型理解仍直接回显回答，没有模型学习；刷新重置数据，没有后端持久化。不把教学确认当作考试资格。

## 来源与技能

本轮查询六个公开地址均 200，检查标题和正文可读取性。不是六轮 deepresearch。

- [Linear Inbox](https://linear.app/docs/inbox)：具体记录处理参考，细节沿用前轮阅读。
- [WAI dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)：标题与关闭规则。
- [Carbon Forms](https://carbondesignsystem.com/patterns/forms-pattern/)：表单规则参考；本轮未深读全文，不归因具体状态设计。
- [Notion teamspaces](https://www.notion.com/help/intro-to-teamspaces)：空间与权限机制参考。
- [Lindy Watch and Learn](https://www.lindy.ai/product/watch-and-learn)：澄清问题机制，不复制营销承诺。
- [Linear updates](https://linear.app/docs/project-updates)：连续记录参考。

`ui-ux-pro-max` error recovery feedback 查询采用明确错误、恢复路径与屏幕阅读反馈；`playwright-skill` 运行实际交互。

## 验证

`check.cjs` 通过：三种构图、四种尺寸、多记录输入保留、连续确认两条记录、切换回已确认记录、手机选择、对话框 Escape、首次使用。截图已重新生成并检查确认状态。

整体目标未完成，正式视觉选择、真实低人工学习和自主任务执行仍待建设。
