# AI Team / StaffDeck 部署

最后核验：2026-10-30（Asia/Shanghai）

## 公网入口

- 首页：`https://lifeyoume.icu/ai-team/`
- 登录：`https://lifeyoume.icu/ai-team/auth/login`
- 注册：`https://lifeyoume.icu/ai-team/auth/register`
- 统一管理员改密：`https://lifeyoume.icu/admin/#security`

阿里云 Nginx 继续负责 TLS、路径前缀和统一账号校验。

管理员密码由 LifeYouMe Platform 统一账号系统维护，不在 StaffDeck 中另存一套。
管理员登录后可在上述安全页验证当前密码并设置新密码；修改成功会使旧管理员会话
失效。实现与运维细节见
[`lifeyoume-platform.md`](lifeyoume-platform.md)。

## 腾讯云服务

| systemd 服务 | 用途 |
| --- | --- |
| `lifeyoume-staffdeck.service` | StaffDeck 单端口应用 |
| `lifeyoume-staffdeck-sso.service` | LifeYouMe 统一账号交换桥 |
| `lifeyoume-staffdeck-aliyun-tunnel.service` | 到阿里云的 45173/45174 反向隧道 |

部署根目录：

`/data/app/lifeyoume-staffdeck`

当前前端静态目录：

`/data/app/lifeyoume-staffdeck/current/usr/lib/staffdeck/_internal/frontend-enterprise/dist`

`lifeyoume-staffdeck-sso.service` 的 `LIFEYOUME_AI_TEAM_INDEX` 也指向该目录中的
`index.html`。前端发布必须更新这个 AppImage 解包目录，而不是在部署根目录新建
`frontend-dist`。

端口：

- StaffDeck：`127.0.0.1:45173`
- SSO Bridge：`127.0.0.1:45174`

权威数据库：

`/data/app/lifeyoume-staffdeck/data/skill_agent_loop.db`

## 阿里云状态

旧 `lifeyoume-staffdeck.service` 和 `lifeyoume-staffdeck-sso.service` 已停止并
取消开机自启。阿里云 45173/45174 当前应由 `sshd` 隧道进程监听。

禁止同时启动阿里云旧服务和腾讯云服务，避免 SQLite 双写和入口端口冲突。

## 验证

```bash
ssh tencent 'systemctl is-active lifeyoume-staffdeck.service lifeyoume-staffdeck-sso.service lifeyoume-staffdeck-aliyun-tunnel.service'
ssh aliyun 'ss -lntp | grep -E "127.0.0.1:4517[34]"'
curl -fsS https://lifeyoume.icu/ai-team/api/health
```

迁移完成时已通过真实 `web` 渠道问答验证，模型、知识库和 Harness 返回正常。

## 前端静态发布

直接构建前端时必须使用：

```bash
VITE_PUBLIC_BASE=/ai-team/ npm --prefix frontend-enterprise run build
```

若使用项目发行准备脚本，则设置 `STAFFDECK_PUBLIC_BASE=/ai-team/`，准备脚本会将其
转换成 `VITE_PUBLIC_BASE`。发布前必须检查 `dist/index.html` 的 JS、CSS 和图标路径
都以 `/ai-team/` 开头。

静态发布采用追加式资源更新：

1. 备份当前 `dist`。
2. 先复制带内容哈希的 `assets/`，保留旧哈希资源。
3. 最后更新 `index.html`。
4. 验证首页、登录页、桌面和手机端关键流程。

2026-10-30 产品入口优化发布的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T162050Z`

2026-10-30 首屏分包优化发布的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T172100Z`

该版本将公开首页和登录页与认证后工作台拆成独立加载模块：

- 公开入口自身 JS：62.5 kB，gzip 22.0 kB。
- 加上共享运行时后的匿名首屏 JS：约 172 kB gzip。
- 优化前单一入口约 705 kB gzip，匿名首屏 JS 减少约 76%。
- `AuthenticatedApp` 约 504 kB gzip，仅在检测到本地登录态后并行下载。
- 线上 Playwright 已验证匿名访问不会请求 `AuthenticatedApp` chunk。

2026-10-30 认证后工作台按路由分包发布的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T220742Z`

该版本保留数字团队广场和核心对话为即时加载，将账号、渠道、模型、运行设置、
知识库、技能、SOP、工具和管理后台等低频页面改为按路由加载：

- `AuthenticatedApp` 从 `AuthenticatedApp-hJTGHgay.js` 的约 501 kB gzip
  降至 `AuthenticatedApp-BW1w1n6Y.js` 的约 63 kB gzip，入口减少约 87%。
- 匿名首页仍只请求 `index-BKzdPqbb.js` 和 `jsx-runtime-BD1Pzipv.js`，不会请求
  `AuthenticatedApp`。
- 本地 Playwright 验证 `/workspace/gallery` 不会提前请求任一低频页面 chunk；
  进入账号管理后才请求 `AccountsPage-BEgWH3dT.js`，SOP 直达页按需请求
  `DistillPage-BsDA5ujL.js`。
- SOP 编辑器仍保持“访问后挂载、离开时隐藏”的语义，避免编辑状态丢失。
- 前端全量回归为 `59/59` 个测试文件、`293/293` 个测试用例通过。
- 线上桌面和手机 Playwright 均验证首页、进入数字团队、独立登录页和注册切换，
  无页面脚本错误。
- 发布采用追加式资源复制并最后原子替换 `index.html`；未改共享 Nginx、未重启
  应用，三项 systemd 服务保持 `active`，主服务 `NRestarts=0`。
- 首页、登录、注册、工作台、账号管理、SOP、健康接口以及 `/flowframe/`、
  `/image/`、`/resume/`、`/vault/`、`/trends/`、MeYou 和 Audit 均返回 `200`。

2026-10-30 数字团队广场与问答页进一步分包的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T223923Z`

该版本将完整问答页从认证入口中拆为路由级延迟加载，同时保持数字团队广场即时
可用：

- `AuthenticatedApp` 从 `AuthenticatedApp-BW1w1n6Y.js` 的约 63 kB gzip
  进一步降至 `AuthenticatedApp-rJ6yLFAC.js` 的约 11.4 kB gzip。
- 完整问答界面为独立的 `ChatPage-WiIdI4Wm.js`，约 22.5 kB gzip；只在进入
  `/workspace/chat`、会话或草稿路由时加载。
- 全量前端回归为 `59/59` 个测试文件、`293/293` 个测试用例通过。
- 本地和生产 Playwright 均验证 `/workspace/gallery` 不请求 `ChatPage` chunk，
  进入 `/workspace/chat` 后才请求该 chunk，且问答页面完成实际渲染、无失败请求。
- 发布使用追加式资源复制并最后原子替换 `index.html`；未修改共享 Nginx、未重启
  应用，StaffDeck、SSO Bridge、Aliyun Tunnel 均保持 `active`，主服务
  `NRestarts=0`。
- 首页、登录、注册、数字团队广场、问答路由、健康接口以及代表性其它产品均为
  `200`。

2026-10-30 对话弹窗按需加载的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T225221Z`

该版本继续缩减数字团队广场首次进入时的脚本下载：

- 待回答、引用详情、重命名、删除确认和模型配置弹窗合并为独立
  `ChatDialogs-DcwNBvE-.js`，约 4.5 kB gzip；没有弹窗打开时不下载。
- 会话状态逻辑抽成共享 `useChatSession-C_KcB9qt.js`，避免广场与问答页重复打包。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过。
- 本地及生产 Playwright 均验证广场初始不请求 `ChatDialogs`，点击“待回答”后才
  请求该 chunk，并成功显示弹窗。
- 发布未修改共享 Nginx、未重启应用；StaffDeck、SSO Bridge、Aliyun Tunnel 均
  保持 `active`，主服务 `NRestarts=0`。
- AI Team 全部关键入口和代表性其它产品均返回 `200`。

2026-10-30 数字团队广场运行时轻量化的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T230757Z`

该版本减少停留在数字团队广场时的无关 API 请求和后台轮询：

- 广场不再读取模型目录、问答 UI 配置和斜杠命令，也不启动发送队列处理；进入
  `/workspace/chat` 后仍正常加载这些问答运行时数据。
- 广场会话列表仍首次立即读取，后台刷新周期由 2.5 秒放宽为 15 秒；员工、团队、
  历史会话和待回答数据保持可用。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过。
- 本地与生产 Playwright 均验证：广场 3.2 秒窗口内仅发起一次会话列表请求，且
  没有模型目录、UI 配置或斜杠命令请求；问答路由完成渲染后仍会请求模型目录和
  UI 配置。
- 发布未修改共享 Nginx、未重启应用；三项 systemd 服务保持 `active`，主服务
  `NRestarts=0`，AI Team 与代表性其它产品均为 `200`。

2026-10-30 广场团队数据去重的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T232606Z`

该版本合并数字团队广场中侧栏和团队卡片的重复数据读取：

- `/api/enterprise/teams` 由会话侧栏统一加载，团队卡片共享同一份结果；首次进入
  广场不再对同一接口并发请求两次。
- 团队首次读取失败时仍保留失败状态；用户切换“团队对话”标签会触发重试。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过，其中包含团队
  请求失败后重试以及团队群聊跳转用例。
- 本地和生产 Playwright 均验证广场仅请求一次团队接口，切换“团队对话”后团队
  卡片正常显示。
- 发布未修改共享 Nginx、未重启应用；三项 systemd 服务保持 `active`，主服务
  `NRestarts=0`，AI Team 与代表性其它产品均为 `200`。

2026-10-30 广场员工编辑组件按需加载的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261029T234335Z`

该版本继续减少数字团队广场首次进入时的隐藏组件下载：

- 头像编辑器、员工资料编辑器和删除确认框分别拆为
  `EmployeeAvatarEditor-DsTtzlul.js`、`EmployeeProfileEditor-XMTRTxSN.js` 和
  `ConfirmDialog-BIMT5zVZ.js`，仅在对应操作状态出现时加载。
- 当前广场员工卡片不展示编辑菜单，因此首次进入广场不会下载上述三个组件；
  Agents、Dashboard 等已有编辑入口保持原有功能和测试覆盖。
- 生产入口为 `index-eRv5sY2U.js`，认证入口为
  `AuthenticatedApp-6WaBSdlT.js`；生产 `index.html` SHA-256 为
  `c87df648a146ab1776216b74b90f7c64f5a4f537c905fe21eb5de19a664abd79`。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过。
- 本地与生产 Playwright 均以模拟登录态进入广场并渲染员工卡片，网络请求中没有
  头像编辑器、资料编辑器或删除确认框 chunk，且无控制台错误或失败请求。
- 发布采用追加式资源复制并最后原子替换 `index.html`；未修改共享 Nginx、未重启
  应用。三项 systemd 服务保持 `active`，主服务 `NRestarts=0`。
- 首页、登录、注册、广场、问答、健康接口以及 `/flowframe/`、`/image/`、
  `/resume/`、`/vault/`、`/trends/`、MeYou 和 Audit 均返回 `200`。

2026-10-30 引导与账号密钥弹窗按需加载的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T000612Z`

该版本继续减少已完成引导用户进入数字团队广场时的无关脚本和图片请求：

- 账号 API 密钥弹窗拆为 `AccountApiKeyDialog-D4SaujkU.js`，仅在账户菜单点击
  “API 全量密钥”后加载。
- 欢迎引导和快速引导分别拆为 `OnboardingGuide-DsHd1sqp.js` 和
  `QuickStartGuide-DFr5dm18.js`；已完成引导的用户首屏不下载两个组件，也不请求
  两张合计约 673 kB 的引导图片。
- 引导事件常量拆入轻量 `guide-events` 模块，由认证入口先监听重开事件，再挂载
  延迟组件并传递请求序号，避免动态加载期间丢失重开操作。
- 新用户首次进入仍自动显示欢迎引导；老用户通过
  `staffdeck-open-onboarding` 事件仍可重新打开欢迎引导。
- 生产入口为 `index-D0cXWdqd.js`，认证入口为
  `AuthenticatedApp-Dp0PhkDp.js`；生产 `index.html` SHA-256 为
  `ce6b83da9cd0a1392eea62d9c30a0411e545aa15b56c894f3068f02ce886d607`。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过；账户菜单测试
  覆盖实际点击并等待延迟弹窗渲染。
- 本地和生产 Playwright 均验证：老用户首屏不加载上述三个组件和两张引导图；
  点击后账号密钥弹窗正常显示；重开事件后欢迎引导正常显示；新用户首次欢迎引导
  正常显示；全程无控制台错误或失败请求。
- 发布采用追加式资源复制并最后原子替换 `index.html`，切换前复核上一版生产
  哈希以防并发覆盖；未修改共享 Nginx、未重启应用。三项 systemd 服务保持
  `active`，主服务 `NRestarts=0`。
- 首页、登录、注册、广场、问答、健康接口以及 `/flowframe/`、`/image/`、
  `/resume/`、`/vault/`、`/trends/`、MeYou 和 Audit 均返回 `200`。

2026-10-30 广场卡片与管理菜单职责拆分的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T003640Z`

该版本将员工卡片的公共展示主体与仅管理页使用的操作菜单分离：

- `EmployeeCard` 仅保留头像、名称、岗位、状态、描述、能力统计和发起对话等
  广场/管理页共享内容；上下线、广场发布、编辑资料、设置头像、账号密钥和删除
  操作移入 `EmployeeCardActions`，只由按路由加载的 `AgentsPage` 引用。
- 广场不再维护没有任何可见入口的头像编辑、资料编辑、状态更新、发布和删除状态
  及回调，类型接口也不再接受这些隐藏管理能力。
- `EmployeeCard` 从约 2.70 kB gzip 降至约 1.60 kB gzip，认证入口从约
  12.08 kB gzip 降至约 11.31 kB gzip；菜单及专属 `more`、`pause`、`play`
  图标随 `AgentsPage` 加载。
- 生产入口为 `index-4urdd-Ug.js`，认证入口为
  `AuthenticatedApp-Byf6drsG.js`，公共卡片为 `EmployeeCard-SmGhLV60.js`，
  管理页为 `AgentsPage-C6R6wwaZ.js`；生产 `index.html` SHA-256 为
  `fe8f09a95e2e385fef40c08484fac6d863716a12a2dfc7b2d314b7ec014af8d0`。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过。
- 本地和生产 Playwright 均验证：广场员工卡片正常渲染，不显示“员工操作”且
  不加载 `AgentsPage`、`more`、`pause`、`play` 资源；管理页菜单仍显示
  发起对话、上下线、发布到广场、编辑资料、设置头像、API 密钥和删除全部操作。
- 发布采用追加式资源复制并最后原子替换 `index.html`，切换前复核上一版生产
  哈希以防并发覆盖；未修改共享 Nginx、未重启应用。三项 systemd 服务保持
  `active`，主服务 `NRestarts=0`。
- 首页、登录、注册、广场、问答、健康接口以及 `/flowframe/`、`/image/`、
  `/resume/`、`/vault/`、`/trends/`、MeYou 和 Audit 均返回 `200`。

2026-10-30 执行记录与代码高亮按内容加载的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T010106Z`

该版本减少普通问答和数字团队广场进入时的富执行记录脚本下载：

- Markdown fenced code 使用动态 `CodeBlock`，加载期间以原生 `<pre><code>` 展示
  完整代码，模块到达后升级为原有语法高亮组件，不会出现内容空白。
- 一对一消息和团队成员回复中的 `ExecutionRecord` 均仅在确有可见 trace 摘要时
  加载；普通回答不再携带 trace 图标、MCP App 展示和代码/输出渲染逻辑。
- `ChatPage` 从约 23.82 kB gzip 降至约 17.68 kB gzip；执行记录独立为
  `ExecutionRecord-ng24MWOy.js`（约 6.42 kB gzip），代码高亮独立为
  `CodeBlock-CixlSMMz.js`（约 1.32 kB gzip）。
- 生产入口为 `index-CcFYbrXf.js`，认证入口为
  `AuthenticatedApp-9s4ugVas.js`，问答页为 `ChatPage-BkjD3Ex4.js`；
  生产 `index.html` SHA-256 为
  `615f056e37ddbdd147009b045267ae916fab6be823e894778bccd7ab7bd61ea7`。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过，其中 Markdown、
  消息气泡和团队协作针对性测试 `35/35` 通过。
- 本地和生产 Playwright 均验证：广场不加载代码高亮；只有普通 Markdown 的问答
  不加载代码高亮；包含 fenced code 的回答才请求高亮 chunk，且代码正文和高亮
  容器正常显示；无控制台错误或失败请求。
- 发布采用追加式资源复制并最后原子替换 `index.html`，切换前复核上一版生产
  哈希以防并发覆盖；未修改共享 Nginx、未重启应用。三项 systemd 服务保持
  `active`，主服务 `NRestarts=0`。
- 首页、登录、注册、广场、问答、健康接口以及 `/flowframe/`、`/image/`、
  `/resume/`、`/vault/`、`/trends/`、MeYou 和 Audit 均返回 `200`。

2026-10-30 管理侧栏资源按使用场景加载的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T013554Z`

该版本继续减少数字团队广场首次进入时的管理端资源下载：

- 管理导航 SVG 统一经 `ManagementSidebarIcons-G2SIVDt1.js` 延迟加载；数字团队
  广场不再请求管理侧栏模块及 `nav-platform`、`nav-agents`、员工资料、能力和
  模型配置等 11 个管理专属图标资源，进入管理路由后才加载。
- 公共账户图标仍由广场的空员工状态复用，因此保留在认证入口依赖中；未为追求
  资源数量而移除广场现有功能。
- 生产入口为 `index-cpzLKVag.js`，认证入口为
  `AuthenticatedApp-BRvwmtAj.js`，管理侧栏图标入口为
  `ManagementSidebarIcons-G2SIVDt1.js`；生产 `index.html` SHA-256 为
  `5427cd795fe0b34146ff12a0c31fb52fbf3e52dfa79f36f02fd3c0efe2c84632`。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过；侧栏及应用针对性
  回归 `12/12` 通过。
- 本地与生产 Playwright 均以虚拟会话验证：广场请求的 37 个资源中管理专属资源
  为 0；进入管理路由后才请求管理侧栏模块及其图标；无失败请求或控制台错误。
- 发布前后均核对生产哈希，上传暂存区与本地 137/137 个文件逐一 SHA-256 一致；
  资源先追加，最后原子替换 `index.html`。未修改共享 Nginx、未重启应用。
- StaffDeck、SSO Bridge、Aliyun Tunnel 三项 systemd 服务保持 `active`，主服务
  `NRestarts=0`；AI Team 关键入口和代表性其它产品回归正常。

2026-10-30 空员工管理状态按需加载的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T015210Z`

该版本移除数字团队广场中最后一个由管理空状态带入的隐藏资源：

- `EmptyEmployeeState` 从认证入口静态依赖改为仅在管理端确实没有数字员工时延迟
  加载；该状态的“新建数字员工”和“浏览开放广场”行为保持不变。
- `sys-accounts` 图标不再随数字团队广场下载；严格网络合同同时覆盖
  `EmptyEmployeeState`、`sys-accounts`、管理侧栏模块及全部管理专属导航图标。
- 认证入口从 `AuthenticatedApp-BRvwmtAj.js` 的约 11.35 kB gzip 降至
  `AuthenticatedApp-glKTCyXr.js` 的约 10.87 kB gzip；空状态独立为
  `EmptyEmployeeState-_klU5K18.js`，约 1.10 kB gzip。
- 生产入口为 `index-Dful0t9j.js`；生产 `index.html` SHA-256 为
  `13454e447ee7be68adcc334f639d04d5148e6bb323d2effa944a5c609288defd`。
- 全量前端回归 `59/59` 个测试文件、`293/293` 个测试用例通过；侧栏及应用针对性
  回归 `12/12` 通过。
- 本地与生产 Playwright 均验证：广场请求的 37 个资源中管理资源为 0；进入无
  员工管理工作台后才加载空状态、账户图标和管理侧栏资源；无失败请求或控制台
  错误。匿名首页、登录和注册在手机视口也均为 `200` 且正常渲染。
- 上传暂存区与本地 139/139 个文件逐一 SHA-256 一致；发布按资源先追加、
  `index.html` 最后原子替换执行。未修改共享 Nginx、未重启应用。
- StaffDeck、SSO Bridge、Aliyun Tunnel 三项 systemd 服务保持 `active`，主服务
  `NRestarts=0`；AI Team 关键入口和代表性其它产品回归正常。

2026-10-30 数字团队广场专用轻量会话运行时的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T022606Z`

该版本将数字团队广场从完整问答运行时中真正拆开：

- 新增广场专用会话运行时，只保留员工/团队目录、会话列表与 15 秒轮询、筛选与
  未读状态、待回答、重命名、删除、进入对话和返回管理端。
- 消息流、附件、模型目录、问答 UI 配置、斜杠命令、发送队列、执行记录和故障
  恢复逻辑不再进入广场代码路径；进入 `/workspace/chat` 后才加载完整问答能力。
- 待回答、重命名和删除使用独立 `GalleryDialogs-BYu8FTrY.js`，约 1.32 kB
  gzip，只有打开相应弹窗时才请求；完整 `ChatDialogs` 继续服务问答页。
- 会话读状态从完整 `chatHelpers` 拆为轻量模块，广场不再为了未读判断下载
  Markdown、流式事件和执行记录辅助代码。
- 广场轻量运行时位于 `sessionFilterOptions-C0OiTQXV.js`，约 11.46 kB gzip；
  替代原先广场必载的完整 `useChatSession + chatHelpers`（合计约 47.8 kB
  gzip），该部分减少约 76%。
- 使用正确的老用户引导存储键复测后，广场资源请求从上一版的 37 个降为 30 个；
  `ChatPage`、`chatHelpers`、`ChatDialogs`、`GalleryDialogs`、欢迎引导组件及
  图片、管理侧栏和管理空状态在广场均为 0。
- 生产入口为 `index-CUZ1nsx9.js`，完整问答入口为 `ChatPage-DuE7J__w.js`，
  `index.html` SHA-256 为
  `ac4fb067cd180e09628ba91bff0a423d35d3b57dee5bcf35ff015c872c007b35`。
- 新增广场运行时测试，覆盖只请求所需接口、员工/团队筛选继续与管理端共享、
  重命名和删除无需完整问答运行时仍可用。全量前端回归为 `60/60` 个测试文件、
  `296/296` 个测试用例通过。
- 本地及生产 Playwright 均验证广场禁止资源为 0，进入问答后才加载完整运行时，
  且无失败请求或控制台错误；匿名首页、登录和注册手机视口均正常。
- 上传暂存区与本地 140/140 个文件逐一 SHA-256 一致；发布按资源先追加、
  `index.html` 最后原子替换执行。未修改共享 Nginx、未重启应用。
- StaffDeck、SSO Bridge、Aliyun Tunnel 三项 systemd 服务保持 `active`，主服务
  `NRestarts=0`；AI Team 关键入口和代表性其它产品回归正常。

2026-10-30 英文词典按语言加载发布的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T032852Z`

- 原 270 kB 源词典不再静态编入所有用户必载的入口；默认中文用户不请求
  `en-aNkOUDIo.js`，首次选择 English 后才加载，已保存英文偏好的用户启动时自动
  加载并恢复英文。
- 英文词典加载完成后才切换界面语言；网络加载失败时保持中文，不进入半翻译状态。
- 主入口由 `index-CUZ1nsx9.js`（485.18 kB，169.4 kB gzip）降至
  `index-BhiSWJW1.js`（236.24 kB，78.61 kB gzip）。
- 真实老用户中文广场仍为 30 个资源；总原始字节从 1,188,792 降至 940,015，
  按同一 gzip-9 口径从 336,258 B 降至 246,175 B，减少 90,083 B（26.79%）。
- 生产 `index.html` SHA-256 为
  `4f5699be82461b68d5404a481881b5dc64c4d64d4de65a5a749be907ca93872c`。
- 全量前端回归为 `62/62` 个测试文件、`299/299` 个测试用例通过；类型检查通过。
  项目既有 i18n 完整性门禁仍报告 36 条未翻译的新近中文文案，本次未新增缺口。
- 本地与生产 Playwright 均验证：中文首屏不请求英文词典、手动切换 English 后
  加载词典并完整翻译、保存的英文偏好可恢复；广场与问答资源合同无失败请求或
  控制台错误。
- 上传暂存区与本地 141/141 个文件逐一 SHA-256 一致；发布按资源先追加、
  `index.html` 最后原子替换执行。未修改共享 Nginx、未重启应用。
- StaffDeck、SSO Bridge、Aliyun Tunnel 三项 systemd 服务保持 `active` 且
  `NRestarts=0`；AI Team 首页、登录、注册及 FlowFrame、Image、Resume、
  Vault、Trends、MeYou、Audit 均回归为 `200`。

2026-10-30 英文体验完整性发布的回滚备份：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T034320Z`

- 补齐认证入口、统一账号回调、工作区加载、工具提交状态、广场人工回复和目录
  错误等 39 个此前缺失的英文词条，并将既有小写 `register` 修正为 `Register`。
- `i18n:check` 从 36 条初始缺失归零；扫描确认当前源码使用的 4,022 条英文翻译
  全部覆盖，配置门禁、类型检查及全量 `62/62` 测试文件、`299/299` 用例通过。
- 生产 Playwright 逐项验证登录、注册、统一账号失败回调在桌面与手机视口均为
  完整英文；中文首屏仍不请求英文词典，切换英文及保存英文偏好均正常。
- 英文词典仍为按需资源 `en-C6FnsGeO.js`（约 91.46 kB gzip），本次文案补齐不
  增加中文首屏请求；广场继续为 30 个资源，问答完整运行时仍只在进入问答时加载。
- 生产 `index.html` SHA-256 为
  `dc70cd728a65968bb76929517b9721dd8c75ec1ebe7b390c7e1f0debbe63dae5`。
- 上传暂存区与本地 141/141 个文件逐一 SHA-256 一致，资源先追加、
  `index.html` 最后原子替换；未修改共享 Nginx、未重启应用。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active` 且 `NRestarts=0`；
  AI Team 及代表性其它产品入口均为 `200`。

## 2026-10-30 Linux 整包发布

已将包含工具测试幂等协议的 Linux 冻结整包发布到腾讯云：

- 当前 AppDir：`/data/app/lifeyoume-staffdeck/current`
- 旧整包回滚目录：
  `/data/app/lifeyoume-staffdeck/releases/staffdeck-before-idempotency-20261029T201948Z`
- 发布前 SQLite 在线备份：
  `/data/app/lifeyoume-staffdeck/backups/skill_agent_loop-20261029T201948Z.db`
- 构建工作区：`/data/build/lifeyoume-staffdeck-build`
- Debian 包：`packaging/out/StaffDeck-linux-x86_64.deb`（426 MB）
- AppImage：`packaging/out/StaffDeck-linux-x86_64.AppImage`（554 MB）

发行文件 SHA-256：

```text
f116a92021a3b54220c69341e1cfd134947d316ef86eca53ed95fba6e5d54c34  StaffDeck-linux-x86_64.deb
07281502d0b3edea86259310e2729af0d42b0491f0e800962ee75d5833aee29f  StaffDeck-linux-x86_64.AppImage
```

发布前使用独立的 `127.0.0.1:45183` 和临时数据目录完成隔离烟测：

- 冻结应用 `/api/health` 返回正常。
- 全新 SQLite、WAL、程序集和日志文件可正常初始化。
- `/chat/` 输出的 JS、CSS、图标均保持 `/ai-team/` 前缀。
- 新旧包的公开入口 HTML 和前端内容哈希一致。
- `client_request_id` 幂等用例通过；构建树目标后端源码与工作区 SHA-256 一致。
- Packaging smoke、CLI、Sandbox bundle 和 Debian 元数据校验均通过。

生产切换保留完整旧 AppDir，并通过 SQLite 在线备份 API 创建一致性备份且
`PRAGMA integrity_check` 为 `ok`。发布后验证：

- StaffDeck、SSO Bridge、Aliyun Tunnel 三项 systemd 服务均为 active。
- 腾讯本地和阿里云隧道端健康检查正常。
- 首页、登录、注册、健康接口及代表性其他产品均为 `200`。
- 匿名浏览器仅加载 `index-Cc97TSlh.js` 与 `utils-BXLcodEp.js`，无页面脚本错误。
- 点击“进入数字团队”可进入独立统一账号登录页。

### systemd 与隧道注意

- `lifeyoume-staffdeck.service` 使用 `Restart=on-failure`。不要写 Docker Compose
  的 `Restart=unless-stopped`；systemd 不支持该值并会退化为 `Restart=no`。
- Tunnel 单元 `Requires=lifeyoume-staffdeck.service`。执行 `systemctl stop`
  主应用会连带停止隧道，而随后单独 `start` 主应用不会自动重新启动已经停止的
  Tunnel。整包发布优先使用 `restart`；如必须 stop/start，发布脚本必须显式启动
  并验证 `lifeyoume-staffdeck-aliyun-tunnel.service`，否则公网 `/ai-team/` 会 502。

## 2026-10-30 外部任务恢复可靠性版

已将发行包版本 `0.6.1` 整包发布到腾讯云（内置 CLI 仍报告上游应用版本
`0.6.0`），生产二进制 SHA-256：

```text
ce29d565d489eedbb7d94051aed44bb1b8257ab4436df7f559806e3cc492be55
```

发行文件 SHA-256：

```text
1703e44cda9bfd1dfc97aa36769ccd1cfc56787cc732398aa7a1eb09ef93a423  StaffDeck-linux-x86_64.deb
efb28e8a74fd5715831fae922bca0a90be570f8397b9566a1c684cfd3b05fdda  StaffDeck-linux-x86_64.AppImage
```

本次修复：

- Worker 每轮使用独立运行时 Session，单轮事务异常不会终止后台恢复。
- 有界停止超时后不启动重叠 Worker 代次。
- 单个异常任务不再阻塞同批其它队列任务。
- 同一任务帧恢复时复用参数相同的待处理回执，避免重复提交业务副作用。
- 参数不同的合法后续调用仍可在同一任务帧创建新任务。
- 任务恢复严格使用回执中的 StaffDeck task ID，不会串用旧完成记录。
- 本地可信的过期事件可直接落为 `expired`，不会被误判为结果监管失败。

验证证据：

- 外部任务、工具执行器、错误分类测试：`61/61`。
- Harness、任务帧和恢复测试：`106/106`。
- 外部任务分发和聊天 trace 测试：`48/48`。
- 新 AppDir 在隔离端口 `127.0.0.1:45183` 完成启动、全新 SQLite 初始化、
  `PRAGMA integrity_check=ok`、外部任务表和 `/ai-team/` 资源前缀验证。
- 发布后生产数据库 `PRAGMA integrity_check=ok`，journal mode 为 `wal`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 均为 `active`，主服务 `NRestarts=0`。
- 首页、登录、注册、健康接口和代表性其它产品均返回 `200`。

发布前在线数据库备份：

`/data/app/lifeyoume-staffdeck/backups/skill_agent_loop-20261030T051659Z.db`

旧 AppDir 回滚目录：

`/data/app/lifeyoume-staffdeck/releases/staffdeck-before-external-recovery-20261030T051659Z`

构建工作区仍为：

`/data/build/lifeyoume-staffdeck-build`

后续整包发布使用仓库中的：

`deploy/release_staffdeck.py`

腾讯云安装路径：

`/data/app/lifeyoume-staffdeck/deploy/release_staffdeck.py`

当前仓库和腾讯云安装副本 SHA-256：

```text
2ee0cb13a0ee8895d78e0e9bd6bebe7ba24672fb8df3540c61aff6205f58e59e
```

先执行只读门禁：

```bash
sudo /data/app/lifeyoume-staffdeck/deploy/release_staffdeck.py \
  --source-appdir /data/build/lifeyoume-staffdeck-build/packaging/out/StaffDeck.AppDir \
  --check-only
```

门禁通过后去掉 `--check-only` 执行发布。工具会：

1. 验证 AppDir、`/ai-team/` 前缀、三项 systemd 服务和当前全部代表性入口。
2. 在 `releases/` 内完整分阶段复制并校验生产二进制 SHA-256。
3. 使用 SQLite online backup API 创建并校验数据库备份。
4. 在同一文件系统原子切换 `current`，使用 `systemctl restart` 主应用。
5. 显式启动 SSO 与 Aliyun Tunnel，先验证腾讯本地，再验证公网和其它产品。
6. 任一发布后门禁失败时恢复旧 AppDir，并再次验证本地、隧道和公网。

工具不读取、写入、重载或重启共享阿里云 Nginx。

2026-10-30 已使用当前生产 AppDir 执行一次 `--check-only` 真实验证，结果为
`status=ready`；验证后未产生 staging/candidate 目录，主服务 `NRestarts=0`。

该构建树曾从 `/work` 迁至 `/data/build`。`build_linux.sh` 现会在
`SKIP_BACKEND_ENV=1` 时自动修复虚拟环境的解释器链接和 `pyvenv.cfg`，并通过
`python -m PyInstaller` 避免复用旧 shebang；同时显式设置便携 Python 根目录。
生产切换期间停止主服务会连带停止隧道，本次也观察到隧道恢复前的一次瞬时公网
`502`；必须显式启动隧道并以最终公网健康结果作为发布门禁。

## 2026-10-30 全局 CSS 清理与手机管理端响应式修复

本次只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、SSO Bridge、
Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 删除已被新版 Tailwind 员工详情页替代、且全仓库无运行时引用的旧
  `employee-home-*`、旧热力图/时间轴、旧能力卡片和少量知识图谱遗留样式。
- 修复旧 CSS 中 `}@media` 黏连和移动断点闭合边界，构建器可独立验证语法。
- 手机端强制使用 56px 折叠侧栏，侧栏占位、固定容器和正文宽度保持一致；
  禁用首屏 220px 到 56px 的宽度过渡，避免 300ms 遮挡正文。
- 手机员工统计区改为两列紧凑卡片，标签不再逐字换行；侧栏主要触控区增至
  40px，正文在 390px 视口获得 334px 可用宽度。

首次发布的错误构建（已立即回滚，不再是生产版本）：

```text
index.html SHA-256:
410ff4d722e6ff97741edcde6d8f5dc08eb74584917c6b235c99b0a360e314a7

CSS:
index-D2Z7aQHU.css
348439 bytes
56917 bytes (gzip -9)
```

与上一生产 CSS `353853 / 57756 bytes` 相比，原始体积减少 5414 bytes，
gzip-9 减少 839 bytes。发布前验证：

- 前端 `62/62` 测试文件、`299/299` 测试通过。
- TypeScript、i18n（4022 条英文翻译）、Vite 配置门禁全部通过。
- Playwright 覆盖登录、广场、员工管理、问答页及 390px 手机登录/员工管理；
  无失败请求、控制台错误或横向溢出，并人工检查桌面与手机截图。
- 公网手机员工管理页加载 `index-D2Z7aQHU.css`，HTTP 200，正文完整，
  `documentWidth=viewportWidth=390`。
- AI Team、Products、Image、FlowFrame、Resume、Vault、Trends、MeYou、
  Audit 代表性公网入口均为 200。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项 `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T121200Z`

## 2026-10-30 手机折叠侧栏可操作性修复

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 手机端隐藏无法改变强制折叠状态的“展开边栏”按钮；桌面折叠态仍保留该按钮，
  点击后正常展开为 220px。
- 折叠栏导航、员工切换器和“切换到对话端”触控目标均达到至少 `44×44px`。
- 折叠栏改为独立纵向滚动，在 `360×640` 等矮手机视口中，记忆、对话日志、
  知识库、技能、SOP、工具和底部对话入口均可滚动访问。
- 保持手机侧栏 56px 总宽和正文宽度，不引入横向溢出。

生产静态版本：

```text
index.html SHA-256:
4f1aa3ef5c000315638ae1e744e47a977cfb882a79daebdca426bc609ebc0f2d

CSS:
index-BY7CRXaI.css
348586 bytes
56927 bytes (gzip -9)
```

验证：

- 前端 `62/62` 测试文件、`300/300` 测试通过。
- TypeScript、i18n（4022 条英文翻译）、Vite 配置门禁和 `git diff --check`
  全部通过。
- 本地 Playwright 验证 `390×844`、`360×640` 手机视口下无小于 44px 的侧栏
  交互目标，底部入口可滚动到视口内；桌面折叠栏仍可展开至 220px。
- 公网生产浏览器重复通过相同两种手机视口合同；新 CSS 与入口哈希和本地构建
  一致。
- AI Team、登录、健康接口、Admin、Products、Image、FlowFrame、Resume、
  Vault、Trends、MeYou，以及正确入口 `https://audit.lifeyoume.icu/` 均返回
  `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项 `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T042149Z`

## 2026-10-30 独立登录/注册页交互与无障碍修复

本次只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 登录/注册模式按钮触控高度增至 `44px`，并暴露准确的
  `aria-pressed` 状态和键盘焦点样式。
- 密码显示按钮增至 `44×44px`，通过 `aria-controls` 关联密码框，并在
  显示/隐藏密码时同步 `aria-pressed`；切换登录/注册会重置密码显示状态。
- 邮箱、显示名称和密码输入本体填满 `50px` 输入容器，不再只有外层视觉高度。
- 身份服务错误集中到可聚焦的 `role="alert"` 错误摘要；明确的单字段错误会通过
  `aria-invalid` 和 `aria-describedby` 关联对应输入，编辑该字段后清除错误。
- “邮箱或密码不正确”等联合凭据错误只聚焦错误摘要，不错误归因到某一个字段。

生产静态版本：

```text
index.html SHA-256:
37eb38f66188368fa09a679be5370c6b2fe0bb9e44921e02d85e7d23660262b7

CSS:
index-8DIlPZf8.css
348659 bytes
56939 bytes (gzip -9)

主入口 JS:
index-CH_GXK5V.js
5173375984592d4c4832c7bcb7a76555525072885d7ec05cf13fe7fb20ff7e3f SHA-256
```

验证：

- 前端 `63/63` 测试文件、`303/303` 测试通过。
- TypeScript、i18n（4022 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 本地与公网 Playwright 均覆盖 `1440×900`、`390×844`、`375×667`
  和 `844×390` 横屏；验证 44px 触控目标、密码状态、模式状态、错误聚焦与
  字段关联、联合凭据错误归因以及 reduced-motion，无失败请求、控制台错误或
  横向溢出。
- AI Team、登录和正确健康端点 `/ai-team/api/health`，以及 Admin、
  Products、Image、FlowFrame、Resume、Vault、Trends、MeYou、Audit
  代表性公网入口均返回 `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T044443Z`

## 2026-10-30 登录/注册页可读性与注册密码提示增强

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 注册密码要求从输入后会消失的 placeholder 改为密码框下方常驻帮助文字，
  明确提示“至少 12 位，可使用密码管理器生成并填入”。
- 通过 `aria-describedby` 将注册密码帮助与密码输入框关联；若同时出现明确的
  密码错误，帮助和错误摘要均会被引用。
- 公开页头的“返回产品首页”操作高度提升至 `44px`，改善手机触控。
- 页面底部统一身份与密码存储说明从 `11px`、约 `3.02:1` 对比度提升为
  `12px`、约 `4.90:1`，达到普通文字对比度要求。
- 英文词典补齐新增的注册密码文案。

生产静态版本：

```text
index.html SHA-256:
4144cfe020cd341c919fe1f58afad06d2c4a0e1fd2a9b4848b4bc4d4bc087dee

CSS:
index-B0awgjni.css
348626 bytes
56932 bytes (gzip -9)

主入口 JS:
index-BH7JG_x_.js
edd0fc489837a4d6715c2170e45eff91f78353c39dac15c6794d4e43fbccb42b SHA-256

英文词典:
en-C9FMJ5L2.js
7f2ba17e01114214baa1615591681461dbbb14c1d762975ba898548de32b7e62 SHA-256
```

验证：

- 前端 `63/63` 测试文件、`304/304` 测试通过。
- TypeScript、i18n（4024 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 本地与公网 Playwright 均覆盖 `1440×900`、`390×844`、`375×667`
  和 `844×390` 横屏；验证返回链接 44px、注册密码规则常驻和语义关联、
  reduced-motion，以及既有登录错误合同，无失败请求、控制台错误或横向溢出。
- AI Team、登录、注册和 `/ai-team/api/health`，以及 Admin、Products、
  Image、FlowFrame、Resume、Vault、Trends、MeYou、Audit 代表性公网
  入口均返回 `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T044933Z`

## 2026-10-30 公共首页与认证链路语言切换

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 公共首页、登录、注册和认证回调页统一在页头提供中文/English 切换入口，
  新访客无需先进入工作区即可选择语言。
- 语言偏好复用现有 `staffdeck_locale`，选择 English 后进入登录/注册页继续
  保持英文，刷新后仍保留。
- 公共页语言按钮与两个菜单项均达到 `44px` 触控高度，支持键盘打开、选择和
  可见焦点。
- 手机端返回入口收敛为 `44×44px` 箭头按钮，保留完整 `aria-label`；
  桌面继续显示“返回产品目录/首页”文字，避免英文在窄屏折行挤压页头。
- 首次进入链路同时验证首页预览优先呈现、CTA 首屏可达、浏览器返回可恢复
  首页，以及 360px 小屏无横向溢出。

生产静态版本：

```text
index.html SHA-256:
72eb1ff8ca18b127ff30eb81cead753de4a3cdf5b76f20e442a4d7334bd46ce0

CSS:
index--uxnTCB8.css
348739 bytes
56953 bytes (gzip -9)

主入口 JS:
index-yiGKbKAb.js
a9fd9b0cb894f407211c3143ca6635cacc59dd29223745fa13fe3261527d7e13 SHA-256
```

验证：

- 前端 `63/63` 测试文件、`305/305` 测试通过。
- TypeScript、i18n（4024 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 本地与公网 Playwright 验证 `1440×900`、`390×844`、`360×640`：
  语言按钮和菜单项稳定态均为 44px，可全键盘选择 English，偏好持久化并
  贯穿登录页；手机返回按钮为 44×44px，无失败请求、控制台错误或横向溢出。
- 原登录/注册合同在 `1440×900`、`390×844`、`375×667` 和
  `844×390` 横屏公网重复通过。
- AI Team 首页、`/chat/`、登录、注册和 `/ai-team/api/health`，以及
  Admin、Products、Image、FlowFrame、Resume、Vault、Trends、MeYou、
  Audit 代表性公网入口均返回 `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T050907Z`

## 2026-10-30 认证回调状态与失败恢复增强

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 统一账号交换中的说明文字改为原子 `role="status"`，外层卡片通过
  `aria-busy="true"` 明确声明加载状态。
- 交换失败后，标题、具体原因和恢复动作组成一个可聚焦的 `role="alert"`
  区域并自动获得焦点；同时清除 busy 状态。
- “重新登录”恢复入口补齐 2px 可见焦点环，触控高度保持 `46px`。
- 补齐常见动态身份错误“会话已过期，请重新登录”的英文翻译，避免英文回调页
  出现标题/按钮为英文、原因仍为中文的混合语言。
- 新增组件测试覆盖加载播报、失败聚焦与恢复地址、成功交换后保存会话并替换到
  `/workspace/gallery`。

生产静态版本：

```text
index.html SHA-256:
4749b11ad5b1954e7778600fa2cda84901175f3ce5cc6c026f0dbae76df2bd1a

CSS（与上一版一致）:
index--uxnTCB8.css
348739 bytes
56953 bytes (gzip -9)

主入口 JS:
index-BPHlqObV.js
4255682aa309d83665538aadc7de9354d58870ad65c05f2594e1efb2751d8a78 SHA-256

英文词典:
en-CgHDDgU3.js
c816dd277b2a23d6f81a26cc83a085f98145528f6e8ec683378a14406cc6b4ff SHA-256
```

验证：

- 前端 `64/64` 测试文件、`308/308` 测试通过。
- TypeScript、i18n（4025 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 本地与公网 Playwright 均覆盖 `1440×900`、`390×844`、`360×640`：
  验证加载状态播报与 busy、失败 alert 自动聚焦、busy 清除、恢复入口 46px
  与 2px 焦点环、中文切英文后的动态错误翻译，无横向溢出。
- 公网首页语言合同重复通过；AI Team 首页、`/chat/`、登录、注册和
  `/ai-team/api/health`，以及 Admin、Products、Image、FlowFrame、Resume、
  Vault、Trends、MeYou、Audit 代表性公网入口均返回 `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T051342Z`

## 2026-10-30 注册表单产品内校验与错误恢复

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 注册表单关闭浏览器不可控的原生校验气泡，显示名称、邮箱和密码统一使用产品内
  中文/英文错误提示。
- 提交时依次校验显示名称至少 2 个字符、邮箱必填与格式、密码必填以及注册密码
  至少 12 位；无效数据不会请求身份提交接口。
- 首个无效字段自动获得焦点，通过 `aria-invalid` 和 `aria-describedby`
  关联字段旁的 `role="alert"` 错误；编辑对应字段后错误即时清除。
- 注册密码同时保留常驻密码要求和字段错误的语义关联。
- 身份服务返回的明确单字段错误聚焦到对应输入；“邮箱或密码不正确”等联合错误
  继续使用可聚焦的表单级摘要。

生产静态版本：

```text
index.html SHA-256:
95c960bdf963d0ed6cc2eb1fbf1ab67e221551547e240867d64201cc4cc19442

CSS（与上一版一致）:
index--uxnTCB8.css
efb1a645fd643580937205df9dfadfd0320569432be1c8850a99eddff0747b02 SHA-256

主入口 JS:
index-VXriYOrx.js
f938ec4c881ff6485701ab2ef61b29c52e93d48db12494a407f609f01b79d6cb SHA-256

英文词典:
en-DKrFk2vM.js
28a3bef384b77b73358f286be8112156551080b7eb2d82fbb360485b1645c9c3 SHA-256
```

验证：

- 前端 `64/64` 测试文件、`310/310` 测试通过。
- TypeScript、i18n（4029 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 本地候选与公网生产 Playwright 均覆盖 `1440×900`、`390×844` 和
  `360×800`；验证校验顺序、字段错误与焦点、ARIA 关联、中英切换、
  无效数据零身份提交及无横向溢出。
- AI Team、登录、注册、`/ai-team/api/health`、Admin、Products、
  Image、FlowFrame、Resume、Vault、Trends、MeYou、Audit 代表性公网
  入口均返回 `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T052305Z`

## 2026-10-30 身份服务连接失败自助恢复

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 登录或注册页首次连接统一身份服务失败时，在错误卡片内显示“重新连接”操作，
  不再要求用户手动刷新整页。
- 重连操作保持 `44px` 触控高度、可见键盘焦点，并与自动聚焦的
  `role="alert"` 错误区域组成完整恢复路径。
- 重连过程中保留用户已经输入的邮箱、显示名称和密码；重新获取 CSRF 成功后
  自动清除错误并恢复提交按钮。
- English 模式同步提供 `Reconnect`，避免异常恢复链路出现中英混排。
- 额外审计认证页在 `375×667`、`360×640`、`844×390` 横屏及 200% 放大
  下的滚动、错误聚焦和提交按钮可达性，均无需额外布局修正。

生产静态版本：

```text
index.html SHA-256:
6282ea4d0c9e24df29190788279829ffe57e0a20111f51721a495e2fad1477a8

CSS:
index-C2JapX2P.css
baf6f231a5db275f097e62fae0b203f2e78364373e7dc183a487eb20f6947dec SHA-256

主入口 JS:
index-c2mzbRqe.js
16bd47fa4718c5da2731a9d5761c4665486ce28960a1c9c488e0722d21354515 SHA-256

英文词典:
en-DnIgkW6N.js
f7dc40e3dbd41450332058e29d564a555c0cb82bab782b1f956c1cbc6a23e00d SHA-256
```

验证：

- 前端 `64/64` 测试文件、`311/311` 测试通过。
- TypeScript、i18n（4030 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 本地候选与公网生产 Playwright 均验证首次 bootstrap `503`、错误自动聚焦、
  重连按钮 `44px`、输入保留、第二次 bootstrap 成功、错误清除及提交恢复；
  公网中文流程严格只有两次 bootstrap。
- English 冷启动异常合同在 `1440×900` 与 `360×640` 均正确显示英文错误和
  `Reconnect`，无横向溢出。
- AI Team、登录、注册、`/ai-team/api/health`、Admin、Products、Image、
  FlowFrame、Resume、Vault、Trends、MeYou、Audit 代表性公网入口均返回
  `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T052724Z`

## 2026-10-30 公共首页语义、焦点与触控可达性

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 公共首页增加视觉隐藏但可被辅助技术识别的唯一 H1：
  “LifeYouMe 数字团队”；English 模式同步为 “LifeYouMe Digital Team”。
- 保持用户已确认的“产品预览图优先、进入按钮随后”的视觉顺序，不增加会抢夺
  首页注意力的可见标题。
- 开源项目链接的触控区域从实际 `17px` 行高扩展到 `44px`，同时增加
  2px 可见键盘焦点轮廓。
- 修复语言按钮基础 `outline-none` 抵消触控版焦点样式的问题；浏览器实际
  计算样式现为 2px solid 焦点轮廓和 2px offset。

生产静态版本：

```text
index.html SHA-256:
e212c2a1d1c3f28911907420f082e91c466a6bc9a93b8e2682f0927b0b1d4f63

CSS:
index-C2JapX2P.css
baf6f231a5db275f097e62fae0b203f2e78364373e7dc183a487eb20f6947dec SHA-256

主入口 JS:
index-CPhOhmqS.js
284437fa398772c2401e826e8d436661478feb40c6e3704275c8a2deec3490d9 SHA-256

英文词典:
en-DFtidlX1.js
71bd1f6a8b4324b28bd53b2ea2096779a79a975749a3d951253922c5a163b46c SHA-256
```

验证：

- 前端 `64/64` 测试文件、`311/311` 测试通过。
- TypeScript、i18n（4031 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 公网生产 Playwright 在 `1440×900` 和 `360×640` 验证中英文各唯一 H1、
  开源链接实际 `125×44px`、语言按钮与开源链接均为 2px solid 焦点轮廓，
  CTA 正确进入登录页且无横向或纵向溢出。
- AI Team、登录、注册、`/ai-team/api/health`、Admin、Products、Image、
  FlowFrame、Resume、Vault、Trends、MeYou、Audit 代表性公网入口均返回
  `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T053616Z`

## 2026-10-30 问答首轮断线恢复与手机发送可达性

本次只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 新建问答任务的第一条消息若在服务端确认会话前断线，会把原文字、已解析附件
  和定时任务意图恢复到输入框，由用户确认后重试；不会自动二次提交。
- 若等待期间用户已输入新内容，原内容追加在前面，不覆盖新输入。
- 已取得服务端会话 ID 后的断流继续使用事件恢复，不把消息还原成可重发草稿，
  避免重复提交。
- 发送和停止按钮均为 `44×44px`；手机通知左右保留 16px 安全边距。
- 手机问答工作台使用 56px 图标侧栏，修复 390px 视口下发送按钮被桌面宽侧栏
  推出屏幕的问题。

生产静态版本：

```text
index.html SHA-256:
5e80778902cdd5a64dc8988a7039b151f88a3e55b450158584887aa48a3f4aab

主入口 JS:
index-DxfNDG5v.js
842062a29ef160aab9a713e203440d266e625ad7ed21ebc5410656715b97bf78 SHA-256

CSS:
index-acpj4DsP.css
95705010f22d228619a29679a2ef33ba1dd3f1d0d2c42283fce74389ba0a6a46 SHA-256

问答页:
ChatPage-B4ERW30j.js
62ac0f0cb48140a23fdcc6df9bdaefac5da818707ab2cfcca6bcdedc8281bdf5 SHA-256

英文词典:
en-Cg9ucGWR.js
4b91b95aa0480a0b6132a39e7cc25a350ed6e7b6d743e042992023d84929906d SHA-256
```

验证：

- 前端 `64/64` 测试文件、`315/315` 测试通过。
- TypeScript、i18n（4033 条英文翻译）、Vite 配置门禁、
  `git diff --check` 和 `/ai-team/` 生产构建全部通过。
- 候选与公网生产浏览器合同均在 `1440×900` 和 `390×844` 验证：断线后原文
  完整恢复，发送接口只调用一次，无控制台错误、失败请求或横向溢出。
- AI Team 首页、登录、注册、广场、问答、健康接口、Admin、Products、Image、
  FlowFrame、Resume、Vault、Trends、MeYou 和 Audit 代表性公网入口均为 `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T055727Z`

## 2026-10-30 手机工作台导航与全链路触控可达性

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 手机问答页和数字员工广场由组件真实渲染 56px 折叠导航，不再将 220px
  展开侧栏裁切成窄栏，消除“管理端”等按钮部分落在屏幕外的问题。
- 手机折叠栏隐藏无实际作用的“展开边栏”操作；广场、待回答、会话筛选、
  新建对话、历史会话和管理端入口均使用至少 `44×44px` 命中区。
- 短横屏中间会话区保持可滚动，底部管理入口始终留在视口内，Flex 不再把
  “待回答”和“筛选会话”压缩至 31px 高。
- 问答页语言切换、账户菜单、添加附件、模型选择、菜单项、发送和停止操作均
  统一为至少 44px 高。

生产静态版本：

```text
index.html SHA-256:
dc250fab3912bbacdcca7b7993e963f73f38fe1a16aa0b7ce15052ae4c589f97

主入口 JS:
index-CzTNW2F6.js
da7a5d15599c8db45b76a227373d0c7850a07c8122151ccb7710955e66f74ae8 SHA-256

CSS:
index-B4w8f789.css
16f147d0d2348037b19576bb34a0797a547454b26f8e5dd32c0a0191dcbbd972 SHA-256

问答页:
ChatPage-GKEYCFNA.js
1610e9826c8762f76f28c9fadd1cb6bdcace2ff9a268b81bcd3440e32d300a65 SHA-256
```

验证：

- 前端 `64/64` 测试文件、`315/315` 测试通过。
- TypeScript、i18n（4033 条英文翻译）、Vite 配置门禁、
  `git diff --check` 和 `/ai-team/` 生产构建全部通过。
- 候选与公网生产均在 reduced-motion 模式下验证 `375×667` 竖屏和
  `667×375` 横屏：所有当前可见交互控件至少 `44×44px`，无控件裁切、
  横向溢出或控制台错误。
- 公网桌面与手机断线恢复合同继续通过：原文完整恢复且发送接口只调用一次。
- AI Team 首页、登录、注册、广场、问答、健康接口、Admin、Image、
  FlowFrame、Resume、Vault、Trends、MeYou 和 Audit 代表性公网入口均为
  `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T060318Z`

## 2026-10-30 320px 小屏与数字员工广场触控修复

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 问答页在 `320px` 视口下不再把“添加”附件按钮压缩至约 20px，实际命中区恢复
  为至少 `44×44px`。
- 数字员工广场窄屏头部改为两行布局：语言和账户操作位于第一行，搜索框在第二行
  获得完整可用宽度；`320px` 下搜索输入不再被压缩至约 2px。
- 广场语言、账户、分类标签和员工卡“发起对话”均提升为至少 44px 高。
- 窄屏堆叠布局仅对数字员工广场启用，不改变其它管理页面的头部布局。

生产静态版本：

```text
index.html SHA-256:
e7288f88e521b33be0898f1f41dc5b7b2e7f5063a639caa604220cabeb06c83e

主入口 JS:
index-Cx-sGrWT.js
f48b8fec59270fa49a680b2b9bdf94efb356ab23803949f4d2e6b1050775ed9a SHA-256

CSS:
index-CA_87Kug.css
3fae63e72a4bd0dd4a58c764351f72a17d2304fa09925fab09476f0711f208b5 SHA-256

认证入口:
AuthenticatedApp-CPcd9KPu.js
5a6263bfb8e44fdcca434eba8b5477b5e437c3d83aa5282057a4a28550e2bf3b SHA-256
```

验证：

- 前端 `64/64` 测试文件、`315/315` 测试通过。
- TypeScript、i18n（4033 条英文翻译）、Vite 配置门禁和
  `git diff --check` 全部通过。
- 候选与公网生产均验证 `320×568`、`375×667` 和 `667×375`；问答页和广场
  无裁切、横向溢出或小于 44px 的当前可见交互控件，reduced-motion 模式无
  控制台错误。
- 公网桌面与手机断线恢复合同继续通过：原文完整恢复且发送接口只调用一次。
- AI Team 首页、登录、注册、广场、问答、健康接口、Admin、Image、
  FlowFrame、Resume、Vault、Trends、MeYou 和 Audit 代表性公网入口均为
  `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T061442Z`

## 2026-10-30 登录/注册页主标题与浏览器标题语义

本次继续只原子更新腾讯云 AppDir 内的前端静态目录，未重启 StaffDeck、
SSO Bridge、Aliyun Tunnel 或共享 Nginx，也未修改任何 Nginx 配置。

上线内容：

- 登录页“欢迎回来”和注册页“创建统一账号”改为各自页面唯一的 H1，使手机端
  不再出现唯一 H1 位于隐藏桌面宣传区、实际主任务却从 H2 开始的问题。
- 桌面宣传语降为辅助 H2，视觉样式和布局保持不变。
- 登录、注册及中英文切换会同步更新浏览器标题，分别显示当前认证任务与
  `LifeYouMe` 品牌，方便标签页识别和辅助技术定位。
- 回归测试新增登录/注册路由切换后的标题层级和文档标题合同。

生产静态版本：

```text
index.html SHA-256:
e7ed54b09991f29b94968f9b33b08963a4a37824286b4443be5b5ae4ead40523

主入口 JS:
index-DbslOH_c.js
8f28c5edf4d64bf1e557d550c495c261aca2edd1f1674218dc7779f6b6e97c3a SHA-256

CSS:
index-CA_87Kug.css
3fae63e72a4bd0dd4a58c764351f72a17d2304fa09925fab09476f0711f208b5 SHA-256
```

验证：

- 前端 `64/64` 测试文件、`316/316` 测试通过。
- TypeScript、i18n（4033 条英文翻译）、Vite 配置门禁、
  `git diff --check` 和 `/ai-team/` 生产构建全部通过。
- 候选验证覆盖 `320×568`、`375×667`、`667×375` 和 `1440×900`，
  中英文登录/注册共 16 种组合；公网验证覆盖手机、横屏和桌面共 12 种组合。
- 所有组合均只有一个可见 H1，浏览器标题与路由和语言一致，无横向溢出、
  小于 44px 的当前可见控件、控制台错误或失败请求。
- AI Team 首页、登录、注册、广场、问答、健康接口、Admin、Image、
  FlowFrame、Resume、Vault、Trends、MeYou 和 Audit 代表性公网入口均为
  `200`。
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active`，三项
  `NRestarts=0`。

回滚目录：

`/data/app/lifeyoume-staffdeck/backups/frontend-dist-20261030T062519Z`

## 2026-10-30 统一账号与安全入口

AI Team 登录后的账户菜单新增“统一账号与安全”，链接到
`https://auth.lifeyoume.icu/account`。密码修改完全由 LifeYouMe Platform
统一账号系统处理，StaffDeck 不读取、不保存统一账号密码。

交互与发布：

- 统一账号与安全、API 全量密钥、退出登录三项菜单操作均至少 44px 高；
- 英文界面对应文案为 `LifeYouMe account & security`；
- 前端 `64/64` 测试文件、`316/316` 测试通过，TypeScript、i18n
  （4034 条）、Vite 配置和 diff 门禁通过；
- 腾讯云采用静态资产追加、最后原子替换 `index.html` 的方式发布；
- 未重启 StaffDeck、SSO Bridge 或 Aliyun Tunnel，三项服务保持
  `active` 且 `NRestarts=0`；
- 未修改共享 Nginx。

生产静态版本：

```text
5a825e260958d0d74e3a44a9128a2fc62842cf96e673622d7d25f5277cdb2194  index.html
3f2cbb0e67f72b0e76af6fd37efb59d0e668f183243b06300058a7217f8d6412  assets/index-Db2b1g57.js
036bcb41542e19962bd11c231c55b4fd25c5815c64d90504b7a88c45cab339b3  assets/AuthenticatedApp-8yJ1se8P.js
d8fb0c53633e942fbe4a7e977e6e39851e130153c9573814935893364a1a7f6b  assets/AppHeader-DZi1tzZB.js
debe53e08cdffdb4a09d58c1e18a5cf43b0ae02d6a35dfc6907442252689b652  assets/en-Qlb-g2zR.js
3fae63e72a4bd0dd4a58c764351f72a17d2304fa09925fab09476f0711f208b5  assets/index-CA_87Kug.css
```

回滚入口文件：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T064343Z-account-entry`

候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/20261030T064343Z-account-entry`

正式公网入口仍为 `https://lifeyoume.icu/ai-team/`。
`team.lifeyoume.icu` 当前 TLS 证书不覆盖该主机名，不应作为生产地址。

## 2026-10-30 公共顶栏产品目录坏链修复

AI Team 公共首页和认证页顶栏的“返回产品目录”此前指向不存在的
`https://lifeyoume.icu/products`，公网返回 `404`。现已改为平台首页真实
产品区 `https://lifeyoume.icu/#products`，并增加自动化合同防止回退。

生产静态版本：

```text
62f97fc9432dd7cab9ed7c606d1a4725d6508a16b5743f9d5244369dea526db0  index.html
599a373e3dfbc4e49cc92372c739ed3fc6f818a700c7ff0ab89ff75e5ca85082  assets/index-B3fXPtPi.js
8602b3c28f14fb3bc5b12c42f865309ae87a6ff0bbaf187ffdad6f7edf57aa27  assets/AuthenticatedApp-CTHEwq67.js
eb8c2499e60cf14c332bb8dcd6ad67183f8399782b27fd4355add96cbe74faa8  assets/AppHeader-DGsbdHWm.js
debe53e08cdffdb4a09d58c1e18a5cf43b0ae02d6a35dfc6907442252689b652  assets/en-Qlb-g2zR.js
c98749663922f0d365b32c66bc029888bae9c466dbc371b1bb9efb28e66733e7  assets/index-1RyGpqTR.css
```

验证：

- 前端 `64/64` 测试文件、`316/316` 测试通过；
- TypeScript、生产构建、i18n（4034 条）、Vite 配置与 diff 门禁通过；
- 公网构建哈希与候选一致，主入口 JS 明确包含
  `https://lifeyoume.icu/#products`；
- AI Team 首页、登录、注册、健康检查、统一账号页、Admin、Image、
  FlowFrame、MeYou 与 Audit 均为 `200`；
- StaffDeck、SSO Bridge、Aliyun Tunnel 保持 `active` 且
  `NRestarts=0`，发布后无 warning 及以上日志；
- 未修改或重载共享 Nginx，也未重启任何 StaffDeck 服务。

回滚入口文件：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T064826Z-products-link`

候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/20261030T064826Z-products-link`

### 基路径事故修复与永久门禁

首次发布坏链修复时，误用默认 `npm run build`，产出的 `index.html` 将静态资源
写成 `/assets/...` 而非 `/ai-team/assets/...`。HTTP 探针仍能看到入口页 `200`，
但真实浏览器中 JS、CSS 和模块预加载全部 `404`，造成整页空白。浏览器审计发现后
立即原子回滚入口页，随后以正确基路径重建并重新发布。

当前生产静态版本：

```text
91e803fa93ce357f9ea56186f2fbfbc6c94a31f68cd4812b505b3c213f8d9a10  index.html
a16882923a787a72e2ffb13046f5ccbcdc1438a7bf2c50b3f0722ab369c7a2a1  assets/index-BzRcb25Y.js
b6fa2a3322433609890f6697c1ef58ccfa6c2d413c8720715f4fb4489ae48299  assets/AuthenticatedApp-Xf65rZf6.js
ee19ea3e6a11766752a9ff374120b3b769aa69957f5e09803ee0ff61c866875d  assets/AppHeader-wHzA21TD.js
debe53e08cdffdb4a09d58c1e18a5cf43b0ae02d6a35dfc6907442252689b652  assets/en-Qlb-g2zR.js
3fae63e72a4bd0dd4a58c764351f72a17d2304fa09925fab09476f0711f208b5  assets/index-CA_87Kug.css
```

永久门禁：

- 新增 `npm run build:production`，强制设置 `VITE_PUBLIC_BASE=/ai-team/`；
- 新增 `npm run verify:production`，扫描生产 `index.html` 的全部本地
  `src`/`href`，出现任何不以 `/ai-team/` 开头的 URL 即失败；
- 配置检查会验证生产构建命令、强制基路径和扫描器均存在；
- 服务器发布前再次检查 `/ai-team/assets/` 存在且不存在根路径
  `src="/assets/..."` 或 `href="/assets/..."`。

真实浏览器验证覆盖 `320×568`、`390×844`、`667×375` 和 `1440×900`，
每种视口均检查公共首页、登录页和注册页，共 12 个组合。全部结果：

- 页面可见、预期 H1 与动态浏览器标题正确；
- 产品目录链接为 `https://lifeyoume.icu/#products`；
- 无横向溢出，无小于 44px 的可见交互控件；
- 无失败请求、控制台错误或错误 MIME 类型；
- StaffDeck、SSO Bridge、Aliyun Tunnel 均保持 `active` 且
  `NRestarts=0`，未修改或重载共享 Nginx。

当前回滚入口文件：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T065320Z-products-link-fixed`

当前候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/20261030T065320Z-products-link-fixed`

## 2026-10-30 前端安全发布器

为避免日常静态发布再次绕过生产基路径门禁，腾讯云已安装专用前端发布器：

`/data/app/lifeyoume-staffdeck/deploy/release_frontend.py`

标准流程：

```bash
npm --prefix frontend-enterprise run build:production

sudo /data/app/lifeyoume-staffdeck/deploy/release_frontend.py \
  --source-dist /path/to/uploaded/dist \
  --check-only

sudo /data/app/lifeyoume-staffdeck/deploy/release_frontend.py \
  --source-dist /path/to/uploaded/dist
```

安全边界：

- 写入前要求候选全部本地 `src`/`href` 以 `/ai-team/` 开头，并确认每个引用文件
  在候选中真实存在；
- 写入前检查 StaffDeck、SSO Bridge、Aliyun Tunnel 均为 active，并检查 AI Team
  健康端点与代表性现有产品矩阵；
- 候选完整复制到带时间戳的 release 快照，旧 `index.html` 单独备份；
- 带哈希资产只追加不覆盖；线上存在同名但不同内容的资产时立即终止；
- 最后使用 `os.replace` 原子切换入口；
- 切换后的服务或公网回归失败时，自动原子恢复旧入口并再次验证；
- 工具不包含服务 restart、Nginx 写入、reload 或容器重建操作。
- 同名资产冲突会在复制任何新资产之前统一检查，避免半追加状态；
- 完整候选与回滚入口一旦生成，即使发布后验证失败也会保留用于审计和复盘。
- 追加候选哈希资产后、切换入口前，通过真实公网逐项请求候选入口引用的全部
  JS、CSS、图标与模块预加载；所有资源必须为 `200`，JavaScript 只接受
  `application/javascript` 或 `text/javascript`，CSS 只接受 `text/css`；
- 候选资源公网检查失败时不会切换入口；若入口切换后的完整回归失败，则恢复旧
  入口并再次检查旧入口引用的全部公网资源。

自动化证据：

- 前端发布安全合同覆盖错误根路径、缺失引用资产、成功追加与原子切换、同名资产
  哈希冲突、切换后公网失败自动回滚、基线产品失败零写入、公网资源 URL 与预期
  MIME 传递、候选资源失败不切换入口并复查旧入口；
- 与原整包发布器合同合并执行，`14/14` 通过；
- Python 编译与 diff 门禁通过；
- 已在腾讯云以当前生产候选执行 `--check-only`：候选结构、三个 systemd 服务、
  AI Team 健康端点及默认代表性产品矩阵全部通过；
- 服务器安装文件 SHA-256：
  `5063dabf9b166abff9b661bb0aba9329ef8a0c33ab45b118764f401ea93832dc`。

### 2026-10-30 公网资源与 MIME 发布门禁增强

此前发布器已能避免错误基路径构建，但 `--check-only` 和发布后回归主要检查入口与
健康端点，无法直接证明浏览器需要的每个 JS/CSS 都能从公网正确加载。现已补齐：

- 发布前检查当前生产入口引用的全部公网资源，避免在已有空白页故障上继续发布；
- 候选资产追加后、入口切换前检查候选入口引用的全部公网资源；
- JS/CSS 除 `200` 外必须返回浏览器接受的正确 MIME；
- 入口切换后的服务、产品矩阵和资源检查失败时自动恢复旧入口，并复查旧入口资源；
- 资源检查在入口切换前完成，因此候选资源故障不会造成短暂坏入口。

本地当前生产 JS/CSS 的真实公网 MIME 检查通过；增强版工具安装后在腾讯云对
`frontend-20261030T070756Z` 执行资源级 `--check-only` 通过，三个服务保持
active。工具本身未执行前端切换、服务重启或 Nginx 操作。

## 2026-10-30 注册确认密码与首次安全发布器实发

注册页新增“确认密码”字段，避免用户首次输入失误后直接创建无法按预期登录的账号。

交互与安全行为：

- 确认密码仅在注册模式显示，不会提交给身份服务；
- 密码和确认密码均使用 `autocomplete="new-password"`，兼容密码管理器；
- 确认字段拥有独立显示/隐藏控制、`aria-controls` 与 `aria-pressed`；
- 确认字段失焦时即可提示“两次输入的密码不一致”，提交时再次兜底；
- 空确认值、不一致值均显示字段旁错误，并通过 `aria-invalid`、
  `aria-describedby` 与焦点恢复关联确认字段；
- 登录/注册模式切换时清空两个密码字段及可见状态；
- 中英文文案完整，i18n 覆盖提升到 4040 条。

验证：

- 定向 AuthPage `9/9` 测试通过；
- 前端完整 `64/64` 测试文件、`317/317` 测试通过；
- TypeScript、生产构建、`/ai-team/` 基路径校验、i18n、配置与 diff 门禁通过；
- 隔离候选与公网生产均覆盖 `320×568`、`390×844`、`667×375`、
  `1440×900` 四种视口；
- 四种视口均无横向溢出、小于 44px 的可见控件、控制台错误或失败请求；
- 公网确认密码失焦错误、字段语义、显示按钮控制和页面标题均正确。

本次是专用 `release_frontend.py` 的首次正式发布：

- 发布前 `--check-only` 通过；
- 发布器完成资产追加、旧入口备份、原子切换及发布后产品矩阵回归；
- 未手工复制生产入口，未重启服务，未修改或重载共享 Nginx；
- StaffDeck、SSO Bridge、Aliyun Tunnel 发布前后均为 active。

生产静态版本：

```text
760f5877305ef47be0d3d76eb607d29c244744f655bed1c946590eddff00d5c1  index.html
1ec23f7abb4511be9ca9954a572cf3a5d1e813c306ee50d0977753b2176ebef1  assets/index-BL97CPmd.js
f46bbea07797901fb067ea1a5201b544f5af3de3a53bd22131dda109d1052456  assets/AuthenticatedApp-DkPCYgY0.js
fe422a09b693758c6a109e770ceba4448936901c1b86f08cc3db653427dec821  assets/AppHeader-WyGVa7xi.js
b69ed67acb4b45c70a12c5895e8a64236aac97dbafaf0d9340602b6301586aac  assets/en-CUa9u2ZB.js
63749c9a323801bd833d3094b7a158588df8e830de58b718b0ccc35b49768b4d  assets/index-C-IucaaZ.css
```

候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/frontend-20261030T070756Z`

回滚入口：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T070756Z/index.html`

## 2026-10-30 注册确认密码焦点语义修复

修复确认密码字段即时校验与提交校验之间的焦点语义：

- 确认密码失焦且与密码不一致时，仅在字段旁显示错误，不把键盘焦点抢回输入框；
- 用户继续提交同一个未修正错误时，明确把焦点移回确认密码输入框；
- 提交端客户端校验、身份服务错误、网络错误及身份初始化错误仍会聚焦首个无效字段
  或表单错误摘要；
- 焦点请求使用独立递增信号，同一错误文本和同一无效字段连续出现时也能重新聚焦，
  不依赖错误状态值发生变化。

验证：

- AuthPage 定向 `9/9` 测试通过，并覆盖“失焦不抢焦点、同一错误提交后重新聚焦”；
- 前端完整 `64/64` 测试文件、`317/317` 测试通过；
- i18n 4040 条、配置、TypeScript、生产构建、`/ai-team/` 基路径、生产构建复验
  与 diff 门禁通过；
- 隔离候选覆盖 `320×568`、`1440×900`；公网生产覆盖 `320×568`、
  `390×844`、`667×375`、`1440×900`；
- 所有视口均确认失焦后焦点位于“显示确认密码”按钮，提交同一错误后焦点返回确认
  密码输入框；
- 所有视口均无控制台错误、失败请求、横向溢出或小于 44px 的可见交互控件；
- 公网入口、健康接口、主 JS 与主 CSS 均为 `200`，JS 返回
  `text/javascript`，CSS 返回 `text/css`；
- StaffDeck、SSO Bridge、Aliyun Tunnel 发布后均为 `active` 且
  `NRestarts=0`；
- 使用专用 `release_frontend.py` 完成预检、候选资源公网/MIME 门禁、原子入口
  切换和产品矩阵回归；未修改共享 Nginx，未重启任何服务。

生产静态版本：

```text
f7090dea4a18015a0ee6565b4ef7c6288e84b59e798765adc87dba76b85287a2  index.html
66f7a5492e95d3ee755f28588ea0a7bd2773ce78d27f2f0234383ffffd5f90c1  assets/index-DTv8-QDE.js
d29e14fffdf6383469bfb488edf734db21515debcad52dd942146c21bf9ca4bb  assets/AuthenticatedApp-D_Uq2t-H.js
593311ed4a57f604ef89c569743969c220a7ed510b838f2ea9d719a82f0bb7c5  assets/AppHeader-BpH1ieCA.js
b69ed67acb4b45c70a12c5895e8a64236aac97dbafaf0d9340602b6301586aac  assets/en-CUa9u2ZB.js
63749c9a323801bd833d3094b7a158588df8e830de58b718b0ccc35b49768b4d  assets/index-C-IucaaZ.css
```

候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/frontend-20261030T073330Z`

回滚入口：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T073330Z/index.html`

## 2026-10-30 注册确认密码关联错误恢复

修复确认密码错误在相关字段间未同步恢复的问题：确认密码已出现“两次输入的密码
不一致”后，如果用户修改上方原密码并使两者一致，现在会立即清除确认字段的错误、
`aria-invalid` 和 `aria-describedby`，无需再回到确认密码框重复输入。焦点保持在用户
正在编辑的原密码输入框，不发生意外跳转。

验证：

- 新增针对“确认框触发错误后，通过修改原密码完成修正”的回归测试；
- AuthPage 定向 `10/10`、前端完整 `64/64` 测试文件与 `318/318` 测试通过；
- i18n 4040 条、配置、TypeScript、生产构建、`/ai-team/` 基路径、生产构建复验
  与 diff 门禁通过；
- 隔离候选覆盖 `320×568`、`1440×900`；公网生产覆盖 `320×568`、
  `390×844`、`667×375`、`1440×900`；
- 所有视口均确认错误和无障碍错误属性同步清除、焦点停留在原密码输入框、无横向
  溢出、控制台错误或失败请求；
- 公网入口、健康接口、主 JS 与主 CSS 均为 `200` 且 MIME 正确；
- StaffDeck、SSO Bridge、Aliyun Tunnel 发布后均为 `active` 且
  `NRestarts=0`；
- 使用专用 `release_frontend.py` 通过只读预检、候选资源公网/MIME 门禁、原子
  切换与产品矩阵回归；未修改共享 Nginx，未重启服务。

生产静态版本：

```text
62de8ab6c2bf80f09ffc4261c15f326563075e62d27db1d2330b3fd02f2a51a9  index.html
5bc84528f95d12b002b881fcbbad86831b1a3ad32d5beb5e021e9c8daf626ace  assets/index-CzVCAPW3.js
c61b78dff817ff4fd15040d29973d0be1b4703a0ea70519a6242ac418cb0f9ee  assets/AuthenticatedApp-B5LU7zTO.js
eae24f20baccb99d726f539ec69fe8d072685ab23b7067fb31587a73e812ba66  assets/AppHeader-DYy2usV7.js
b69ed67acb4b45c70a12c5895e8a64236aac97dbafaf0d9340602b6301586aac  assets/en-CUa9u2ZB.js
63749c9a323801bd833d3094b7a158588df8e830de58b718b0ccc35b49768b4d  assets/index-C-IucaaZ.css
```

候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/frontend-20261030T092030Z`

回滚入口：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T092030Z/index.html`

## 2026-10-30 注册密码双向即时校验

补齐确认密码的对称校验路径：确认密码已填写且原本匹配时，用户随后修改原密码造成
不一致，原密码失焦后会立即在确认密码字段旁显示“两次输入的密码不一致”，无需等到
提交。该提示只在原密码本身已满足 12 位要求时触发，避免遮蔽密码长度规则；失焦提示
不会抢回原密码或确认密码焦点。

验证：

- 新增“修改原密码造成不一致后，原密码失焦即时提示”的回归测试；
- AuthPage 定向 `11/11`、前端完整 `64/64` 测试文件与 `319/319` 测试通过；
- i18n 4040 条、配置、TypeScript、生产构建、`/ai-team/` 基路径、生产构建复验
  与 diff 门禁通过；
- 隔离候选覆盖 `320×568`、`1440×900`；公网生产覆盖 `320×568`、
  `390×844`、`667×375`、`1440×900`；
- 所有视口均确认错误关联到确认密码字段、原密码失焦后焦点自然进入“显示密码”
  按钮、两个输入框均未抢焦点，并且无横向溢出、控制台错误或失败请求；
- 公网入口、健康接口、主 JS 与主 CSS 均为 `200` 且 MIME 正确；
- StaffDeck、SSO Bridge、Aliyun Tunnel 发布后均为 `active` 且
  `NRestarts=0`；
- 使用专用 `release_frontend.py` 完成预检、候选资源公网/MIME 门禁、原子切换
  与产品矩阵回归；未修改共享 Nginx，未重启服务。

生产静态版本：

```text
fa86df73ca67e2fae9b42e8454fbfd37745e3b93b7002f364984db2126686400  index.html
486ea44b904da89d49b72aa76688808d9faca733dcfcb2a8d375a222d272f2d2  assets/index-i3nqLa7c.js
702a1b74b86064d20645af04f65de58aec17c2bbb6205de4fcd2e3a4afa4a9f7  assets/AuthenticatedApp-blAwgYIp.js
271254a87b3727f9e382e8d294118b13330e2a56c8ece3a95b4ddcb27965f4c9  assets/AppHeader-mYxNCmQf.js
b69ed67acb4b45c70a12c5895e8a64236aac97dbafaf0d9340602b6301586aac  assets/en-CUa9u2ZB.js
63749c9a323801bd833d3094b7a158588df8e830de58b718b0ccc35b49768b4d  assets/index-C-IucaaZ.css
```

候选发布快照：

`/data/app/lifeyoume-staffdeck/releases/frontend-20261030T100042Z`

回滚入口：

`/data/app/lifeyoume-staffdeck/backups/frontend-index-20261030T100042Z/index.html`
