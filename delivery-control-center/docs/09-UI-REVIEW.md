# OneOPC UI Review

## Score

| Pillar | Score | Finding |
|---|---:|---|
| Copywriting | 3/4 | 状态真实，但中英文技术标签过多，领导视角缺少一句话结论 |
| Visuals | 2/4 | 图谱真实但标签重叠，候选列表与图谱缺少视觉主次 |
| Color | 3/4 | 深色体系一致，但蓝色边框使用过密，状态与操作层级不够明确 |
| Typography | 2/4 | 正文和标签普遍偏小，长仓库名、URL 和图谱符号可读性不足 |
| Spacing | 2/4 | 技术参考区纵向过长，配置、漏斗、候选和图谱同时展开 |
| Experience Design | 2/4 | 功能入口完整，但缺少渐进披露、推荐候选聚焦和领导结论 |

Overall: **14/24**

## Priority Fixes

1. 把技术参考改为“结论优先，证据下钻”，配置默认收起。
2. 候选默认突出 Top 1，其余候选折叠，减少扫描成本。
3. 领导图只展示需求能力、候选和每项能力的一条代表性证据。
4. 增加图谱图例、路径说明、覆盖率与风险结论。
5. 提高核心正文、候选名称和图谱标签字号，减少等宽小字滥用。

## Remediation Result

- 技术参考设置默认收起。
- 首屏增加最佳候选、发现匹配、代码验证和实际通道四项结论。
- 候选默认只展示 Top 1，可展开全部候选。
- 领导图由 21 个节点压缩为 10 个语义节点。
- 领导图能力词中文化，技术图保留完整 21 节点、22 条关系。
- 图谱默认展示验证结论、Commit、许可证和安全边界。
- 1440×900 与 1080×700 均无横向溢出。

Remediated score: **21/24**

## 2026-08-18 Product Re-Audit

This audit uses the signed Electron package and real 980x640 / 1440x900
screenshots rather than code inspection alone.

| Pillar | Score | Current evidence |
|---|---:|---|
| Copywriting | 4/4 | Customer-facing states and destructive actions use precise Chinese; retaining a draft is now labeled `稍后继续` rather than `取消` |
| Visuals | 4/4 | Five top-level pages, digital employees, task evidence and modal layers retain a coherent native control-center hierarchy |
| Color | 4/4 | Navigation, health, warning, danger and success colors remain distinct without turning the interface into a one-hue palette |
| Typography | 3/4 | All text meets the 10px floor and avoids clipping; some auxiliary metadata remains intentionally dense at 1440x900 |
| Spacing | 4/4 | The 46px collapsed execution environment returns the complete delivery summary to the 980x640 first viewport |
| Experience Design | 4/4 | Draft save, recovery, explicit discard, destructive confirmation, focus return and toolchain disclosure now form a complete workflow |

Overall: **24/24**

### Highest-Impact Findings Resolved

1. Home no longer opens with a 219px execution-configuration block. The local
   environment defaults to a 46px health summary on every top-level page and
   remains available through an explicit disclosure control.
2. Requirement and employee drafts expose a trash command only after an actual
   unsaved change. The command has a stable accessible name and native tooltip.
3. Discarding uses the shared danger dialog with Cancel focused by default.
   Cancelling preserves every field; confirming restores the blank requirement
   baseline or the employee registry record without touching committed data.
4. Opening and closing an unchanged employee record no longer creates a false
   draft.

### Runtime Evidence

- [Signed-package Home at 980x640](screenshots/product-audit/14-signed-home-980.png)
- [Signed-package discard confirmation](screenshots/product-audit/14-signed-draft-confirm-980.png)
- [Compact Home at 980x640](screenshots/product-audit/14-home-compact-980.png)
- [Draft controls at 980x640](screenshots/product-audit/14-draft-controls-980.png)
- [Discard confirmation at 980x640](screenshots/product-audit/14-draft-confirm-980.png)
- [Compact Home at 1440x900](screenshots/product-audit/14-home-compact-1440.png)

### Fifteenth-Pass Typography Closure

- The Display menu now provides native radio choices for `标准（显示更多内容）`
  and `舒适（文字更易阅读）`, plus `Command+Shift+D` for direct switching.
- Comfortable density raises auxiliary navigation, metadata and labels from
  10px to 11px and form text to 12px without browser zoom or whole-page scale.
- The preference is atomically persisted and restored before normal rendering.
- All five pages retain the 46px execution summary, zero horizontal overflow
  and zero Long Tasks at 980x640 and 1440x900.
- macOS Accessibility evidence showed the Comfortable native radio item with a
  real checkmark.

Typography is now **4/4**: the default preserves high-density scanning while
the comfortable option provides a product-supported readable mode.

- [Comfortable Home at 980x640](screenshots/product-audit/15-comfortable-home-980.png)
- [Comfortable Home at 1440x900](screenshots/product-audit/15-comfortable-home-1440.png)
