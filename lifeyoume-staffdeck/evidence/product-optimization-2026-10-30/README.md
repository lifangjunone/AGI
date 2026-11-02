# AI Team 产品入口优化验收

日期：2026-10-30（Asia/Shanghai）

## 产品方向

保留已确认的极简方向：真实数字团队工作台是唯一主视觉，用户先看到产品，
再通过唯一的“进入数字团队”操作进入独立统一账号页。黑色用于主操作，
LifeYouMe 荧光绿只用于身份和状态提示。

## 截图迭代

1. 初始线上版本：CTA 悬浮在主视觉上方，手机端图与按钮位于顶部但层级顺序不理想。
2. 第一轮：将 CTA 移到主视觉之后；手机端因垂直居中出现过大顶部空白。
3. 第二轮：手机端改为顶部对齐并收紧圆角，桌面端保留大图优先。
4. 登录页：为显示名称、邮箱和密码增加始终可见的标签，保留图标、密码显示按钮、
   自动填充属性和统一身份提交逻辑。

最终截图：

- `ai-team-current-desktop.png`
- `ai-team-current-mobile.png`
- `ai-team-auth-current-desktop.png`
- `ai-team-auth-current-mobile.png`

## 验证结果

- 桌面视口：1440 × 900
- 手机视口：390 × 844
- 两个视口均无横向溢出。
- 首页产品图加载完成后自然尺寸有效。
- “进入数字团队”跳转到 `/ai-team/auth/login`。
- 登录页邮箱和密码输入框可见、可访问。
- 前端生产构建通过。
- 首页和应用路由关键测试：5/5 通过。
- 完整前端测试：286/293 通过；7 项既有失败集中在 `useToolTest.test.tsx`
  与当前 `useToolTest` API mock 契约不一致，不属于本次页面改动。
- 匿名首页自身 JS 为 62.5 kB（gzip 22.0 kB）；加共享运行时后约
  172 kB gzip，较优化前约 705 kB gzip 减少约 76%。
- 线上浏览器网络验收确认匿名访问不会请求 504 kB gzip 的
  `AuthenticatedApp` 工作台 chunk。

## 发布

- 腾讯云静态入口采用“资源先增量复制、`index.html` 最后切换”的方式发布。
- 生产构建必须使用 `VITE_PUBLIC_BASE=/ai-team/`；若通过发行准备脚本构建，则使用
  `STAFFDECK_PUBLIC_BASE=/ai-team/`，脚本会转成 Vite 变量。
- 回滚备份：
  `/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T172100Z`
- 未修改共享 Nginx。
