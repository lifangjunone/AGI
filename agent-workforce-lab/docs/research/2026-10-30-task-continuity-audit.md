# 任务连续性与成果修订复查

本轮仍是隔离设计原型，正式产品未替换。源文件检查发现两个缺陷：发布新任务覆盖旧状态；退回直接增加版本号，没有形成新成果。修复为独立任务对象、跨布局可用任务选择器、不可覆盖的提交快照及显式修订草稿。

## 本轮来源核查

- [Linear project updates](https://linear.app/docs/project-updates)：200；成员和状态变化保留在时间顺序的更新历史。采用连续记录。
- [Linear board layout](https://linear.app/docs/board-layout)：200；同一对象可用不同视图。任务切换不能因布局变化不可用。
- [Notion delete & restore](https://www.notion.com/help/duplicate-delete-and-restore-content)：200；本次正文强调可恢复内容。不把它当作本产品版本快照实现依据。
- [Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)：200；无数据需解释上下文和下一步。新任务不填假成果。
- [WAI modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)：200；模态需可关闭、明确标题、焦点约束。补可访问标题，保留原生 dialog。
- [Linear issues 尝试地址](https://linear.app/docs/issues)：404，不作为证据。

这是六个查询，不是六轮 deepresearch 或穷尽调研。`ui-ux-pro-max` 的 error validation feedback 查询用于明确验收失败后的下一步。

## 实际变化

1. 发布内容进入新任务；旧任务成员、记录、验收状态独立保留。
2. 任务选择器在桌面、手机及三个布局均可用。
3. 草稿不叫正式 v1。提交后保存 v1 内容快照；退回保留其内容和意见。
4. 编辑并保存修订草稿后，下一次提交才形成 v2。成果窗口可切换查看旧版。
5. 查看草稿或旧版本不能代替当前版本验收；每次提交重置已查看标记。
6. 新任务无候选或产物时，明确等待，不套预置故事或编造结果。

验证脚本扩展 `operations-check.cjs`：多任务保留、查看当前版本门禁、退回、修订、新旧成果内容对照。新增截图 `ops-version-history.png`。原型没有 API、自动执行、模型评审或持久化，不能作为整体产品已完成证据。下一正式改版仍需用户方向选择。
