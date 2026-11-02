# 对象导航与操作连续性

## 本轮参考

读取以下官方公开页面，均返回 200。六个来源是六次资料核查，不等于六轮完整深度研究。

- [Linear Inbox](https://linear.app/docs/inbox)：通知进入对应问题详情，不是泛化列表。
- [Linear Search](https://linear.app/docs/search)：可以按对象标题、ID 查找。
- [Notion 侧栏](https://www.notion.com/help/navigate-with-the-sidebar)：对象、私人空间与团队空间分开导航。
- [MDN pushState](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState)：地址进入历史栈，但不会自行触发 popstate。
- [MDN popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)：返回/前进需要恢复页面状态。
- [WAI Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)：页面导航不冒用 tabs 语义；真正 tab 组件需要对应键盘行为。

## 实际修正

- 新增 `frontend/src/navigation.ts` 统一路径解析与导航通知。
- `/me/learning/{id}`、`/me/workers/{id}`、`/ops/workers/{id}`、`/ops/tasks/{id}` 可恢复具体对象。
- 运营能力待办打开对应员工；任务求助和成果待办打开对应任务。
- 普通页面刷新保留选中记录，返回历史地址恢复前一对象。
- 不存在的对象 ID 不替换成列表第一项。
- 员工端路由只开放首页、学习和成长；运营端只开放总览、员工和任务。服务端权限独立校验。

## 证据与限制

`tests/learning-inbox.cjs` 已通过第二条学习记录和第二个任务的选择、刷新与返回验证；
教学、确认、筛选、文件导入与撤回流程也通过。

尚未完成：对象不存在的专门提示、能力级定位（当前到员工级）、指定成果版本的直达、
未保存输入离开提醒、请求竞态保护。不得把本轮导航通过说成整体产品完成。
