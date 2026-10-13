# Dogfood Report: 坐坐游戏厅

| Field | Value |
|-------|-------|
| **Date** | 2026-10-13 |
| **App URL** | http://127.0.0.1:4180/games/（测试时自动选择空闲端口） |
| **Session** | game-hub-v0.1.0-release |
| **Scope** | 5 款游戏核心流程、成绩持久化、搜索、导航、桌面与移动端 |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

## Release Coverage

- 大厅正确显示 5 个开放席位和 1 个候场席位。
- 节奏反应完成 5 轮并记录平均反应时间。
- 闪记方格完成一关、进入下一关、失败后记录最高关卡。
- 盯住圆点完成目标追踪和 20 秒结算。
- 心算快跑覆盖正确答案、错误答案、连击和 30 秒结算。
- 十秒直觉覆盖隐藏计时、停止和误差结算。
- 5 款游戏成绩刷新后均保留，且高分方向正确。
- 搜索、无结果状态、清空筛选和 `Esc` 返回均正常。
- 1440px 桌面和 390px 手机无横向溢出。
- 控制台错误 0，失败网络请求 0。

## Visual Evidence

- [桌面大厅](screenshots/lobby-desktop.png)
- [手机大厅](screenshots/lobby-mobile.png)
- [节奏反应](screenshots/stage-reaction-mobile.png)
- [闪记方格](screenshots/stage-memory-mobile.png)
- [盯住圆点](screenshots/stage-focus-mobile.png)
- [心算快跑](screenshots/stage-math-mobile.png)
- [十秒直觉](screenshots/stage-time-mobile.png)

## Open Issues

未发现阻塞首发的问题。
