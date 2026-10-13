# Debug Session: app-management-sync
- **Status**: [OPEN]
- **Issue**: 管理 App 中保存的入口与首页实际展示不同步。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-app-management-sync.ndjson

## Reproduction Steps
1. 完成引导并进入首页。
2. 打开设置 -> 管理 App。
3. 修改已选 App，点击完成。
4. 返回首页，核对管理列表与首页入口。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 模型已更新，但首页未收到 Observation 重绘 | High | Low | Rejected; 4→5 UI test immediately rendered the fifth app |
| B | 首页预测排序或截断保留旧集合 | High | Low | Confirmed; line 9 saved 6 IDs but exposed only 5 predictions |
| C | 管理页本地选择与保存值不一致 | Medium | Low | Rejected; lines 7–9 preserve all six IDs through save |
| D | 两层 Sheet 关闭时序导致首页读取旧状态 | Medium | Medium | Rejected; mismatch remains after returning home |

## Log Evidence
- Pre-fix line 7: management accepted six selected IDs.
- Pre-fix line 8: save action submitted all six IDs.
- Pre-fix line 9: model stored six IDs while `visiblePredictionIDs` contained only the first five.

## Verification Conclusion
Root cause confirmed: management permits an unbounded selection while the fixed home has five slots.

Post-fix:
- Management stops at five selected IDs.
- Save and `visiblePredictionIDs` both contain exactly the same five IDs.
- Full iOS unit/UI test suite passes, including capacity and legacy-data normalization coverage.
