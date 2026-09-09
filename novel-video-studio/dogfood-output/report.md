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
| High | 3 |
| Medium | 3 |
| Low | 1 |
| **Total** | **7** |

## Remediation

| Issue | Status | Verification |
|-------|--------|--------------|
| ISSUE-001 | Fixed | Four desktop and four mobile navigation controls switch to distinct populated views. |
| ISSUE-002 | Fixed | Gutenberg retry returns six valid sources for `Alice's Adventures in Wonderland`. |
| ISSUE-003 | Mitigated | Completed demo projects auto-refresh generated images; manual refresh uses a restricted server proxy. Upstream may still return its generating placeholder. |
| ISSUE-004 | Fixed | Final desktop WCAG 2 A/AA audit: 0 violations; only contrast checks for partially obscured, scroll-clipped rows remain inconclusive. |
| ISSUE-005 | Fixed | Retry clears the previous error before discovery restarts. |
| ISSUE-006 | Fixed | Restored projects synchronize the title input unless the user is actively editing it. |
| ISSUE-007 | Fixed | Demo projects now show zero generated videos and stop before assembly; a preflight gate blocks unauthorized or over-budget model calls. |

## Task Center Acceptance

- Submitted three projects against one configured project slot and observed `1 running / 2 queued`.
- Verified FIFO positions `1/2` and `2/2`, wait estimates, and automatic promotion when a slot became available.
- Verified restart recovery for interrupted, queued, and remotely rendering projects.
- Verified status filters, title/source search, historical-project restoration, and failed-task retry entry.
- Verified desktop and 390×844 mobile layouts with six working mobile destinations.
- Automated suite: 40 passing tests.

![Task center desktop](screenshots/task-center-desktop.png)

![Task center mobile](screenshots/task-center-mobile.png)

## Project Center Acceptance

- Verified the app opens at the project center without implicitly entering the latest project.
- Verified create-project modal, project search/status filters, visual project cards, six-node progress rails, queue/status metrics, and project entry.
- Verified project-scoped navigation is disabled before selection, enabled after entering a project, and disabled again after returning to the project center.
- Verified project deep links preserve project ID and detail view in the URL.
- Desktop 1120×720 and mobile 390×844 audits report 0 WCAG 2 A/AA violations and no horizontal overflow.

![Project center desktop](screenshots/project-center-desktop.png)

![Project center mobile](screenshots/project-center-mobile.png)

![Create project mobile](screenshots/create-project-mobile.png)

![Project detail mobile](screenshots/project-detail-mobile.png)

## Source Confirmation and Pipeline Acceptance

- Submitted `西游记` in both the final Electron package and the 390×844 mobile PWA.
- Verified discovery pauses at `source-review`; no source is committed and no downstream node runs before confirmation.
- Verified the candidate view exposes title, author, content level, provider, rights status, match score, and the original-source link.
- Confirmed the selected source and observed all six fixed nodes complete: discovery, ingestion, adaptation, visual design, shot rendering, and assembly.
- Opened node 03 in the final Electron and mobile builds and verified persisted input, output, status, timestamp, duration, and long-output scrolling.
- Final WCAG 2 A/AA audits report 0 violations on the source-review page and node dialog. The dialog audit has one inconclusive contrast check because axe cannot resolve the partially overlapped code-block background.

![Source review desktop](screenshots/source-review-desktop.png)

![Node detail desktop](screenshots/node-detail-desktop.png)

![Source review mobile](screenshots/source-review-mobile.png)

![Node detail mobile](screenshots/node-detail-mobile.png)

## Domestic Search and Source Registry Acceptance

- Rechecked 23 accepted official sources across Chinese web fiction, public-domain classics, overseas originals, and digital libraries on 2026-09-09.
- Retried `求魔` and verified two exact official candidates: Qidian `https://www.qidian.com/book/2070910/` and QQ Reading `https://book.qq.com/book-detail/481326`.
- Verified 26 auditable search runs covering 360 domestic web search, configured site queries, international catalogs, and optional Brave Search.
- Each run exposes its query URL, completion/degraded/failure state, hit count, elapsed time, and error.
- Verified the source registry preserves category, free mode, registration, Web/download support, advertising, copyright notes, automation policy, and availability.
- Verified `cn-qidianzww.com.cn`, `hetushu.com`, and `www.hetushu.com` cannot be restored through the configuration API.
- Verified historical projects can explicitly rerun discovery with the current registry instead of silently rewriting stored traces.
- Desktop 1120×720 and mobile 390×844 trace views, plus the source configuration dialog, report 0 WCAG 2 A/AA violations.

![Search trace desktop](screenshots/search-trace-desktop.png)

![Search trace mobile](screenshots/search-trace-mobile.png)

![Audited free-source registry](screenshots/free-source-registry-desktop.png)

## Season Production Acceptance

- Verified project creation accepts only the novel title and does not expose or submit a season episode count.
- Verified source analysis extracts chapter boundaries and content length before producing a whole-book adaptation map.
- Verified a 36-chapter, 186,420-character acceptance fixture produces an 18-episode whole-book plan with explicit chapter ranges.
- Verified selecting whole-book episode 5 as the start and 10 episodes as the season yields episode range 5–14 and a dynamic `¥4536.00` reference budget.
- Verified no detailed episode scripts or Seedance tasks exist before the user locks a season range.
- Verified all selected-season scripts are persisted before any Seedance task is submitted.
- Verified one-at-a-time segment submission, local last-frame persistence, within-episode handoff, and previous-episode-to-next-episode handoff.
- Verified a failed render retry preserves succeeded segments and resets only failed or expired segments.
- Verified desktop `1120×720` and mobile `390×844` create-project layouts have no horizontal or button overflow.
- Verified the final packaged Electron app exposes the same content-first creation flow with no episode preset.
- Automated suite: 40 passing tests.

![Content-first project creation on desktop](screenshots/dynamic-create-desktop.png)

![Content-first project creation on mobile](screenshots/dynamic-create-mobile.png)

![Content-first project creation in the packaged Electron app](screenshots/dynamic-create-electron.png)

![Dynamic whole-book plan and season selection on desktop](screenshots/dynamic-season-plan-desktop.png)

![Dynamic whole-book plan and season selection on mobile](screenshots/dynamic-season-plan-mobile.png)

## Episode Center and Budget Gate Acceptance

- Verified the episode center reports full-season content readiness, completed delivery count, completed segment count, and the sequential last-frame strategy.
- Verified completed, actively rendering, and script-locked episodes expose distinct states and five-minute durations.
- Verified a 3-episode budget gate displays `¥453.60` per episode and `¥1360.80` for the season before rendering.
- Verified the explicit budget approval action is visible on desktop and mobile; it was not clicked, so no billable Seedance task was created.
- Verified desktop `1120×720` and mobile `390×844` layouts have no horizontal or button overflow and emit no browser console errors.
- Versioned `app.js` and `styles.css` under PWA cache v19 so the removed create-time episode presets cannot remain cached.
- Opened the historical real 5-second project in the final Electron package and verified its player, download action, six-node history, and legacy duration remain accessible.

![Episode center on desktop](screenshots/series-center-desktop.png)

![Episode center on mobile](screenshots/series-center-mobile.png)

![Season budget gate on desktop](screenshots/series-budget-gate-desktop.png)

![Season budget gate on mobile](screenshots/series-budget-gate-mobile.png)

## Real Seedance Production Acceptance

- Verified the packaged app reports `正式生产 · 计费已开启`; no user-visible demo wording remains in the active product flow.
- Verified fresh installs default to production and stop at explicit configuration or budget gates when prerequisites are missing.
- Upgraded the legacy 5-second `西游记` planning preview to the live runtime through the same project ID.
- Verified planning model `glm-5-2-260617` and Seedance model `doubao-seedance-2-5-260628`.
- Verified remote task `cgt-20260909215437-nrn78` reached `succeeded` and was downloaded before the temporary URL expired.
- Verified FFmpeg output is H.264/AAC, 1280×720, 5.024 seconds, and 2,096,254 bytes.
- Verified the archived MP4 supports HTTP Range delivery and is exposed through the project player and download action.

![Real Seedance output in final Electron package](screenshots/real-seedance-output-electron.png)

## Public-Domain Recommendation Acceptance

- Verified 16 curated works: eight Chinese classics and eight English classics.
- Verified every item is normalized to `public-domain`, requires no additional authorization, and links only to the trusted recommendation-source allowlist.
- Verified language filters return eight Chinese and eight English works; keyword search matches title, author, genre, and tags.
- Verified every card exposes rights evidence, the original source, and one-click project creation; the created title re-enters the existing source-confirmation and six-node audit workflow.
- Verified desktop rendering and an emulated 390×844 mobile viewport. The mobile layout has no horizontal overflow, and the recommendation count, all three card actions, and all seven navigation destinations remain within the viewport.
- Redesigned the catalog as a 3-column cinematic shelf at 1320×828 and a compact single-column list at 390×844.
- Verified unfinished generated covers remain hidden behind designed title artwork; the provider's white generation placeholder is not visible.
- Automated suite: 40 passing tests.

![Public-domain recommendations desktop](screenshots/public-domain-recommendations-desktop.png)

![Public-domain recommendations in final Electron package](screenshots/public-domain-recommendations-electron.png)

![Public-domain recommendations mobile](screenshots/public-domain-recommendations-mobile.png)

![Redesigned recommendation catalog on desktop](screenshots/recommendations-redesign-desktop.png)

![Redesigned recommendation catalog on mobile](screenshots/recommendations-redesign-mobile.png)

## Authorized Full-Text Import Acceptance

- Verified commercial-source candidates expose an authorized TXT/Markdown import workflow instead of attempting to bypass WAF, login, or payment controls.
- Verified 12 MB file-size enforcement, 500-character minimum, explicit rights confirmation, and disabled submission until both content and confirmation are present.
- Verified the UI reads the selected local file, displays filename, character count and the first 2,000 characters without submitting the test file.
- Backend tests verify complete text persistence outside project JSON, SHA-256 recording, path confinement, ingestion metadata, and automatic pipeline resume.
- Desktop preview reports 0 WCAG 2 A/AA violations.

![Authorized content preview](screenshots/authorized-content-preview-desktop.png)

![Authorized content preview mobile](screenshots/authorized-content-preview-mobile.png)

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

### ISSUE-007: 旧版规划任务被错误显示为真实视频已完成

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional / trust |
| **URL** | `/desktop/`、`/mobile/`、`/web/` |
| **Repro Video** | N/A |

**Description**

旧版非计费规划流程没有调用 Seedance，镜头没有远端任务 ID、视频 URL 或本地 MP4，但旧状态机仍把 30 个镜头和成片装配标记为完成。

**Resolution**

应用现在默认进入正式生产。缺少 Ark Key 或计费授权时分别停在明确的配置/预算门禁；只有显式设置 `PRODUCTION_MODE=planning` 才会生成规划预览，且不会把它标记为真实成片。

---
