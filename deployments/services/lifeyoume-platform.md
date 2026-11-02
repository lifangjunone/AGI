# LifeYouMe 平台基座

最后核验：2026-10-30（Asia/Shanghai）

## 入口与运行位置

| 角色 | 公网入口 | 阿里云本地端口 | systemd 服务 |
| --- | --- | ---: | --- |
| Portal | `https://lifeyoume.icu/` | 8800 | `lifeyoume-platform@portal.service` |
| Ops | `https://lifeyoume.icu/admin/` | 8801 | `lifeyoume-platform@ops.service` |
| Auth | `https://auth.lifeyoume.icu/` | 8802 | `lifeyoume-platform@auth.service` |
| Billing | `https://billing.lifeyoume.icu/` | 8803 | `lifeyoume-platform@billing.service` |

应用目录为 `/data/app/lifeyoume-platform`，统一认证数据库为
`/var/lib/lifeyoume-platform/auth.db`。数据库由 systemd `StateDirectory`
提供可写持久化空间；应用目录在服务沙箱中只读。

## 管理员凭据

- 管理后台账号名由 `.env` 中的 `OPS_ADMIN_USER` 定义。
- 环境变量中的密码哈希只用于首次初始化和兼容回退。
- 可变管理员密码保存在认证数据库的 `platform_admin_credentials` 表中。
- 管理员可登录 `https://lifeyoume.icu/admin/#security` 修改自己的密码。
- 修改密码会增加凭据版本并立即使全部旧管理员 Cookie 失效。
- 修改动作写入 `admin_audit`，但任何文档和日志都不得记录密码或哈希。

### 生产核验（2026-10-30）

- `https://lifeyoume.icu/admin/` 登录页和改密前端资源在线，浏览器加载无脚本错误。
- Ops 与 Auth 健康检查均为 `200`，四个平台代理角色均处于 active 状态。
- 生产认证库已存在 `platform_admin_credentials` 表和有效凭据记录。
- 线上 `app.py`、`auth_store.py`、`portal.js`、`portal.css` 与工作区改密实现
  的 SHA-256 一致，本次无需再次发布或重启服务。
- 本地隔离数据库的 HTTP 回归测试覆盖：旧密码登录、当前密码校验、修改成功后
  退出、旧 Cookie 失效、旧密码拒绝、新密码登录成功。测试不会读取或修改生产密码。

数据库备份必须同时复制主文件及有效的 WAL 状态，优先在停服窗口使用 SQLite
在线备份命令，禁止只复制一个可能处于写入中的 `auth.db`。

### 管理员改密交互与可访问性增强（2026-10-30）

已对 `https://lifeyoume.icu/admin/#security` 进行第二轮可用性增强：

- 当前密码、新密码、确认密码及显示/隐藏控制均达到至少 `44px` 高；
- 每个显示按钮保留对应字段名称，并通过 `aria-controls`、`aria-pressed`
  表达控制关系和显示状态；
- 新密码与当前密码相同、两次新密码不一致时，在提交前提供字段级校验；
- 服务端返回当前密码错误后，将焦点移回当前密码字段，设置
  `aria-invalid=true`，并显示与该字段直接关联的就地错误；
- 保存期间禁用提交按钮并显示“正在保存…”，避免重复提交；
- 静态资源版本提升为 `portal.css?v=8`、`portal.js?v=10`，避免已有浏览器
  继续复用旧缓存。

验证证据：

- 平台 `32/32` 自动测试通过，Python 编译、JavaScript 语法和 diff 门禁通过；
- 隔离临时认证库的 Playwright 合同覆盖桌面与 `390×844` 手机视口，
  不读取或修改生产密码；
- 三个密码输入框和显示按钮实际高度均为 `44px`，手机页面
  `documentWidth=viewportWidth=390`；
- 键盘焦点顺序为当前密码、显示当前密码、新密码、显示新密码、确认密码、
  显示确认密码、提交按钮，全部具有至少 `2px` 可见焦点环；
- 公网匿名登录页在桌面和手机均加载新资源，无失败请求、控制台错误或横向溢出；
- Admin、AI Team、Image、FlowFrame、Resume、Vault、Trends、MeYou、Audit
  代表性入口均返回 `200`，四个平台 systemd 角色均为 `active`。

本次未修改共享 Nginx，仅重启 `lifeyoume-platform@ops.service`；发布后
`NRestarts=0`。生产文件回滚目录：

`/data/app/backups/lifeyoume-platform-accessibility-20261030T043852Z`

发布前认证库 SQLite 在线备份（`PRAGMA integrity_check=ok`）：

`/data/app/backups/lifeyoume-platform-auth-20261030T043852Z.db`

## 2026-10-30 普通用户统一账号自助改密

已在 `https://auth.lifeyoume.icu/account` 上线普通用户“账号与安全”页面。
用户登录统一账号后可自行修改密码，不需要管理员代为重置。

安全行为：

- 必须验证当前密码，新密码至少 12 位、两次输入一致，且不能与当前密码相同；
- 改密成功后撤销该账号全部 Web 会话、设备 Token 和尚未兑换的设备码；
- 当前 SSO Cookie 同时清除，随后跳回登录页，要求使用新密码重新登录；
- 管理员重置普通用户密码时采用相同的设备码失效边界；
- 页面支持密码管理器、允许粘贴，并为字段错误、显示密码按钮和键盘焦点提供
  完整的无障碍语义。

发布与验证：

- 发布前对 `/var/lib/lifeyoume-platform/auth.db` 执行 SQLite 在线备份，
  `PRAGMA integrity_check=ok`；
- 平台 `34/34` 自动测试、Python 编译、JavaScript 语法及 diff 门禁通过；
- 匿名访问 `/account` 会 `303` 跳转统一登录页，登录页和云内 8802 均为
  `200`；
- 仅重启 `lifeyoume-platform@auth.service`，Portal、Ops、Billing 未重启；
- 四个平台角色发布后均为 `active` 且 `NRestarts=0`；
- 未修改共享 Nginx。

生产文件 SHA-256：

```text
2e339376cc41e49d7b8a1efbe08236062df87de443e6530dce42dce8f6cfb872  platform/app.py
a5aefcc504aea9e4b34387b8d899a58a3dede2dbe3288132541725036fdcd35c  platform/auth_store.py
8a888537d9073b83b5bcae28c11d7c5286918c872e7e4159f6e4a9a64c0749b9  platform/assets/portal.js
9f895c0363fe20d0c20625927da050cb72f1ad06698f826dac10870e1e582975  platform/assets/portal.css
```

应用文件与认证库回滚备份：

`/data/backups/lifeyoume-platform/20261030T064200Z-account-password`

## 发布注意

平台代码更新不需要修改共享 Nginx。单独发布管理员或认证功能时：

1. 备份当前应用文件和认证数据库。
2. 更新 `platform/app.py`、`platform/auth_store.py` 及相关静态资源。
3. 只重启受影响的 `ops`、`auth` 角色。
4. 验证 8801、8802 健康检查和管理后台登录页。
5. 回归 MeYou 管理后台统一保护以及代表性现有产品入口。

共享入口规则仍以
[`../runbooks/SHARED_NGINX.md`](../runbooks/SHARED_NGINX.md) 为准。
