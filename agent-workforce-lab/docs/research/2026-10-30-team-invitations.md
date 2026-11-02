# 团队邀请：同一团队的双角色冷启动

## 公开来源与采用结论

2026-10-30 读取以下官方页面，均返回 200。核查的是公开说明，不是登录后完整产品实测。

| 来源 | 核实内容 | 本项目采用 |
|---|---|---|
| [Linear 邀请成员](https://linear.app/docs/invite-members) | 邀请选择邮箱、角色、团队；管理员权限；链接可重置 | 入口位于运营辅助管理，员工不能自行邀请 |
| [Notion 成员管理](https://www.notion.com/help/add-members-admins-guests-and-groups) | 邮箱与角色邀请；待接受列表；成员角色调整 | 明确员工与运营的职责，显示待接受/已加入 |
| [Slack 邀请](https://slack.com/help/articles/201330256-Invite-new-members-to-your-workspace) | 邀请链接、有效期、分享风险、管理员权限 | 不使用无限期全员通用链接 |
| [GitHub 组织邀请](https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization) | 邮箱匹配已验证邮箱；7 天到期；接受后加入；可取消 | 7 天、指定邮箱、接受后加入；本项目尚无邮箱验证，不能宣称同等身份保证 |
| [OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | 最小权限、每请求门禁、关系校验、测试 | 员工/运营/负责人权限服务端检查 |
| [OWASP 令牌安全参考](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) | 账号恢复令牌的随机性、有效期与单次使用 | 仅借鉴令牌安全原则，不把邀请当作密码恢复 |

## 本轮实现

- 负责人/管理员生成员工或运营邀请，不允许邀请成为负责人。
- 链接 7 天有效、指定邮箱、一次接受；数据库保存 SHA-256 摘要。
- 使用 URL fragment 携带令牌，避免进入 HTTP URL 和访问日志；仍属于敏感链接，不应分享截图或传播。
- 注册/登录保留邀请，预览团队和权限，接受后直接进入 `/me`。
- 成员列表与待接受列表；撤销邀请；仅负责人可调整普通员工/运营角色。
- 运营能处理任务，但不能分配成员权限；负责人不能在此入口被误降权。
- 已加入其他团队的账号不会被隐式迁移。本轮未实现多团队切换。
- 原生 dialog 补齐键盘焦点与 Escape，不用角色标签冒充完整交互。

## 证据

- 后端 `test_studio_v2.py`：5 passed，包括过期、撤销、重复接受、权限升降与令牌不明文落库。
- `tests/member-invitation.cjs`：两个浏览器会话通过 UI 生成邀请→注册→接受→员工入口限制→负责人授予运营→运营入口。
- 截图：`design/review/member-invitation/`，1440、1024、768、375px，未拍摄有效邀请令牌。

## 仍未满足的产品能力

- 没有邮件发送、邮箱验证、SSO 或邀请限流，本地账号匹配不等于企业身份认证。
- 模型学习、自主考核、真实执行与知识撤回仍待建设。
- 团队冷启动改善不能证明整个产品已达到最终产品级。
