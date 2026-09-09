# Dogfood Report: 长卷制片厂

| Field | Value |
|-------|-------|
| **Date** | 2026-09-09 |
| **App URL** | Electron `http://127.0.0.1:<dynamic>/desktop/` |
| **Session** | `novel-dogfood` |
| **Scope** | 桌面 App 全功能、核心流程、错误状态与三端共享交互 |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 0 |
| Low | 0 |
| **Total** | **2** |

## Issues

<!-- Copy this block for each issue found. Interactive issues need video + step-by-step screenshots. Static issues (typos, visual glitches) only need a single screenshot -- set Repro Video to N/A. -->

### ISSUE-001: 三个主导航按钮点击后无任何响应

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | `/desktop/` |
| **Repro Video** | `videos/issue-001-repro.webm` |

**Description**

左侧“小说源库”“角色资产”“分集队列”均呈现为可点击按钮，但点击后选中态和主内容均不变化。用户无法进入三个核心业务视图。

**Repro Steps**

<!-- Each step has a screenshot. A reader should be able to follow along visually. -->

1. 打开桌面 App，停留在生产总览。
   ![Step 1](screenshots/issue-001-step-1.png)

2. 点击“小说源库”。

3. **观察：** 主页面和导航选中态均未变化。
   ![Result](screenshots/issue-001-result.png)

---

### ISSUE-002: 合法公版作品因固定超时被误判为“未找到来源”

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | `/desktop/` |
| **Repro Video** | N/A |

**Description**

输入 Project Gutenberg 明确收录的 `Alice's Adventures in Wonderland` 后，四个检索请求均在固定 8 秒超时，项目失败并显示“未找到可识别的小说来源”。同机直接访问 Gutendex 可在约 11 秒返回 6 个结果，说明失败来自客户端超时策略而非无结果。

**Repro Steps**

1. 输入 `Alice's Adventures in Wonderland` 并点击“开始生产”。
2. 等待检索完成，进入“小说源库”。
3. **观察：** 页面显示 0 个来源及“未找到可识别的小说来源”。
   ![Result](screenshots/issue-002.png)

---
