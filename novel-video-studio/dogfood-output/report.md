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
| Medium | 3 |
| Low | 1 |
| **Total** | **6** |

## Remediation

| Issue | Status | Verification |
|-------|--------|--------------|
| ISSUE-001 | Fixed | Four desktop and four mobile navigation controls switch to distinct populated views. |
| ISSUE-002 | Fixed | Gutenberg retry returns six valid sources for `Alice's Adventures in Wonderland`. |
| ISSUE-003 | Mitigated | Completed demo projects auto-refresh generated images; manual refresh uses a restricted server proxy. Upstream may still return its generating placeholder. |
| ISSUE-004 | Fixed | Final desktop WCAG 2 A/AA audit: 0 violations; only contrast checks for partially obscured, scroll-clipped rows remain inconclusive. |
| ISSUE-005 | Fixed | Retry clears the previous error before discovery restarts. |
| ISSUE-006 | Fixed | Restored projects synchronize the title input unless the user is actively editing it. |

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

### ISSUE-003: 演示视觉资产长期停留在“生成中”占位图

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual / ux |
| **URL** | `/desktop/` |
| **Repro Video** | N/A |

**Description**

演示模式首次请求图片服务时可能返回“image is generating”占位图。应用此前不会主动重新获取，导致封面和全部资产缩略图长期不可用。

**Repro Steps**

1. 完成一个演示生产任务并进入“角色资产”。
2. **观察：** 所有资产均停留在生成中占位图。
   ![Result](screenshots/regression-assets.png)

---

### ISSUE-004: 分组、阶段和标签页缺少完整 ARIA 语义

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | accessibility |
| **URL** | `/desktop/`、`/mobile/` |
| **Repro Video** | N/A |

**Description**

axe-core 指出资产筛选和生产阶段容器在普通 `div` 上使用 `aria-label` 却没有有效角色；资产/日志声明了 `tablist`，子按钮却没有 `tab` 和选中状态。辅助技术无法可靠理解这些控件之间的关系。

**Repro Steps**

1. 对资产页执行 WCAG 2 A/AA 自动审计。
2. **观察：** 审计报告出现 `aria-prohibited-attr` 与 `aria-required-children`。

---

### ISSUE-005: 失败任务重试成功后仍显示旧错误

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional / ux |
| **URL** | `/desktop/` |
| **Repro Video** | N/A |

**Description**

来源检索失败后点击“重试任务”，项目可成功完成并得到 Gutenberg 来源，但输入区下方仍显示上一次的“未找到可识别的小说来源”。项目状态与提示信息互相矛盾。

**Repro Steps**

1. 打开一个来源检索失败的项目。
2. 在“分集队列”点击“重试任务”，等待项目完成。
3. **观察：** 项目显示已完成且来源有效，顶部仍保留旧错误。
   ![Result](screenshots/regression-assets-refreshed.png)

---

### ISSUE-006: 当前项目与书名输入框显示不同作品

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | `/desktop/` |
| **Repro Video** | N/A |

**Description**

应用恢复历史项目时，项目内容显示 `Alice's Adventures in Wonderland`，输入框却保留硬编码的“西游记”。用户难以判断再次点击“开始生产”会处理哪部作品。

**Repro Steps**

1. 创建其他作品项目并重新打开桌面 App。
2. **观察：** 当前项目标题与书名输入框内容不一致。
   ![Result](screenshots/regression-assets-refreshed.png)

---
