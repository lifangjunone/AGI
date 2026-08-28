# Debug Session: iphone-hotspot-connection
- **Status**: [OPEN]
- **Issue**: iPhone 作为个人热点、Mac 连接该热点时，EasySay 手机端无法连接 Mac 本地服务。
- **Debug Server**: `http://172.20.10.3:7777/event`
- **Log File**: `.dbg/trae-debug-log-iphone-hotspot-connection.ndjson`

## Reproduction Steps
1. iPhone 开启个人热点。
2. Mac 连接 iPhone 热点。
3. iPhone 打开 EasySay 并尝试连接 Mac。
4. 预期连接到 Mac 的 EasySay 网关；实际连接失败。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | App 仍保存旧 Mac 地址 | High | Low | **Confirmed**: log line 1 loaded `10.3.223.139` while Mac is `172.20.10.3` |
| B | iPhone 热点隔离宿主到客户端的回连 | High | Medium | **Rejected**: iPhone reported logs to `172.20.10.3:7777` |
| C | iOS 本地网络权限被关闭 | Medium | Low | **Rejected**: iPhone successfully reached the debug server over LAN |
| D | Mac 防火墙或监听范围阻断 8785 | Medium | Low | **Rejected**: firewall disabled and listener is `*:8785` |
| E | TCP 可达但连接码或 CORS 拒绝 | Medium | Low | Inconclusive before address correction |

## Log Evidence
- Static pre-check: Mac hotspot interface is `en0 = 172.20.10.3/28`, gateway is iPhone `172.20.10.1`.
- Static pre-check: EasySay listens on `*:8785`; macOS firewall and block-all are disabled.
- Static pre-check: `http://172.20.10.3:8785/api/mobile/bootstrap` responds `401`, proving local listener and auth middleware are active.
- Instrumentation added to saved-address load, request start/result/error, and server arrival.
- Pre-fix line 1: saved address was `http://10.3.223.139:8785`.
- Pre-fix line 2: App attempted `/api/health` on the obsolete address.
- Pre-fix line 3: request ended with `AbortError` after eight seconds.

## Verification Conclusion
Root cause confirmed: the persisted Mac address survives network changes and
overrides the current hotspot address. The hotspot itself permits iPhone-to-Mac
traffic. Minimal fix will embed the current install-time LAN address and recover
from a stale saved address by testing and persisting that current default.

### Post-fix comparison
- Line 1: App still read the historical `10.3.223.139` value, proving migration
  was exercised rather than bypassed.
- Lines 2-3: the historical address timed out as expected.
- Line 4: App automatically retried the install-time address
  `http://172.20.10.3:8785`.
- Line 5: Mac received the request from hotspot host `172.20.10.1`, disproving
  iPhone hotspot client isolation.
- Line 6: App received HTTP `200`, `ok: true`, CORS response.

Pre-fix ended at `AbortError`; post-fix recovered automatically and completed
the authenticated health check with HTTP 200.
