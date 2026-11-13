# 牛马嘴替部署

最后核验：2026-11-12（Asia/Shanghai）

## 公网入口

- 产品：`https://lifeyoume.icu/niuma/`
- 健康检查：`https://lifeyoume.icu/niuma/health`
- 模型诊断：`POST https://lifeyoume.icu/niuma/api/diagnose`
- 数据边界：前端会把用户吐槽提交给本产品后端调用 LifeYouMe MaaS 生成嘴替；服务端不持久化输入。常见手机号、邮箱和身份证号会先打码；MaaS 异常时自动降级到本地规则。

## 腾讯云

- 部署根目录：`/data/app/niuma-mouthpiece`
- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T092206Z`
- 当前链接：`/data/app/niuma-mouthpiece/current`
- 镜像：`niuma-mouthpiece:current`
- 容器：`niuma-mouthpiece`
- 服务：`niuma-mouthpiece.service`
- 隧道：`niuma-mouthpiece-aliyun-tunnel.service`
- 监听：`127.0.0.1:45410`
- MaaS 环境文件：`/etc/niuma-mouthpiece/app.env`，root-only

容器使用只读根文件系统、非 root `node` 用户、`no-new-privileges` 和
`cap-drop ALL`。MaaS 接入版服务使用 host 网络访问腾讯云本机 MaaS
`127.0.0.1:43280/v1`。

2026-11-12 MaaS 接入 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T093019Z`
- 后端新增 `POST /niuma/api/diagnose`。
- 生产 MaaS 应用：`niuma-mouthpiece`
- 授权逻辑模型：`lym-chat-quality`
- 模型不可用、超时或输出不合规时，自动降级到本地规则。
- MaaS state 授权前备份：`/data/app/lifeyoume-maas/backups/maas-data-niuma-authorize-*`
- 授权过程短暂停止 `lifeyoume-maas-maas-1`，用一次性容器挂载同一 data volume 运行
  `deploy/provision-maas-key.mjs` 创建应用与服务 Key，随后立即启动 MaaS 并验证
  `/health/ready`。

2026-11-12 营销首屏重构 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T093651Z`
- 首屏从工具表单改为强营销落地页：大标题“把今天的破事，做成一张能发群的怨气报告。”、
  MaaS 嘴替卖点、示例报告卡、传播机制说明和更明确的“生成我的牛马报告”CTA。
- 视觉语言调整为街头小广告、赛博受气诊所和打工人梗图海报混合风格，强化截图传播感。
- 本地 Playwright 截图验收：`1440×1000` 与 `390×844` 均无横向溢出；截图保存在
  `niuma-mouthpiece/evidence/desktop-1440.png` 和
  `niuma-mouthpiece/evidence/mobile-390.png`。
- 公网确认首页包含新主标题、`WHY IT SPREADS` 板块和新 CTA；`/niuma/api/diagnose`
  仍返回 `source=maas`、`modelId=lym-chat-quality`。

2026-11-12 UI/UX 重设计 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T095222Z`
- 按 Anthropic `frontend-design` 方法重构页面视觉与文案：从高饱和海报/内部产品解释，
  改为“下班后的安静工位”体验；背景为深墨蓝与低饱和紫色光晕，主行动使用柔和珊瑚色，
  表面使用低对比半透明层级。
- 首页文案改为用户视角：“你的委屈，不必只留在工位上。”；去除
  `WHY IT SPREADS`、`STEP 02/03/04/05` 等内部产品/流程话术，改为
  “你会拿到什么”“有些话，不必自己想”“带走今天的情绪”等用户可理解引导。
- 修复本地无 MaaS 截图环境中首页自动触发模型降级 toast 的问题；现在仅在用户提交后
  才会请求模型和展示相关反馈。
- Playwright 截图验收：
  `1440×1000`、`390×844` 均无横向溢出，首屏无自动 toast，页面不再包含 `STEP` 标记；
  截图在 `niuma-mouthpiece/evidence/calm-desktop.png` 与
  `niuma-mouthpiece/evidence/calm-mobile.png`。
- 公网确认新标题和用户引导文案存在，`/niuma/api/diagnose` 仍返回
  `source=maas`、`modelId=lym-chat-quality`；全部代表性入口回归 200。

2026-11-12 静态资源缓存修复 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T095815Z`
- 问题：HTML 使用 `no-cache`，但 `styles.css`/`app.mjs` 使用
  `public, max-age=86400` 且无版本号，用户浏览器可能出现“新 HTML + 旧 CSS”的混合页。
- 修复：HTML 的 CSS/JS 引用使用版本查询参数
  `?v=20261112T095222Z`；服务端将 HTML、CSS、JS、MJS 的缓存策略统一为
  `no-cache, must-revalidate`。
- 生产 Playwright 验证：
  - 桌面 `1440×1000` 实际请求并使用
    `https://lifeyoume.icu/niuma/styles.css?v=20261112T095222Z`；
    计算背景为深墨蓝渐变，非旧版红黑网格。
  - 手机 `390×844` 实际使用同一版本化 CSS，无横向溢出、首页无自动 toast。
  - 公网截图：
    `niuma-mouthpiece/evidence/production-cachefix-1440.png`、
    `niuma-mouthpiece/evidence/production-cachefix-390.png`。
- `/niuma/`、`/niuma/health`、Image、FlowFrame、MeYou 回归均为 HTTP 200。

2026-11-12 游戏优先重构 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T102900Z`
- 首屏不再展示营销介绍、诊断卡、报告卡或大输入框；打开后直接进入
  “今天是哪一坨？”的怨气怪物玩法。
- 用户从“临下班塞活、甲方改需求、连环会议、同事甩锅、已读不回”中选一个，
  连击 12 次粉碎怪物；每次点击都有血条、按压和飞字反馈。
- MaaS 生成的阴阳嘴替改为通关奖励，文明版回复在结果卡内按需展开；
  详细吐槽降为右上角“说具体点”的可选入口。
- 静态资源版本更新为 `?v=20261112T102500Z`，同时保持服务端
  `no-cache, must-revalidate`，避免 HTML/CSS/JS 混用旧缓存。
- Playwright 公网验收：手机 `390×844` 点击 12 次后显示“今日嘴替”奖励卡；
  真实模型响应为 `source=maas`、`model.used=true`、`modelId=lym-chat-quality`。
  桌面 `1440×1000` 无横向溢出；Image、FlowFrame、MeYou 代表性入口均返回 200。

2026-11-12 免费额度与匿名使用统计 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T104500Z`
- 参考星命矩阵的访客额度模式，使用 `niuma_vid` 的 HttpOnly、Secure、
  SameSite=Lax Cookie 识别匿名访客；每位访客成功领到一条通关 AI 嘴替时计一次，
  前 20 次免费。
- 第 21 次生成前返回 HTTP `402 free_quota_exhausted`，不再调用 MaaS；
  前端显示准确的额度耗尽/开通提示。
- 数据持久化到腾讯云 `/data/app/niuma-mouthpiece/data/usage.json`，只保存匿名
  访客哈希、时间、模型来源与模型 ID，不保存用户吐槽原文。
- 管理统计 API：`GET /niuma/api/admin/stats`；未认证请求返回 401。统计包含总生成数、
  当日生成数、匿名访客数和 MaaS 使用数。
- Billing 现状核验：`https://billing.lifeyoume.icu/api/v1/status` 返回
  `checkout_enabled=false`，因此界面明确说明“付费开通正在准备”，没有将未配置的
  Billing 链接表述为可完成付款。
- 测试：7 项单元测试通过；固定访客身份下第 20 次返回成功并耗尽额度，第 21 次返回
  402；HTTPS 生产 Playwright 验证通关后额度从 `20/20` 变为 `19/20`。

2026-11-12 无限闯关解压 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T112300Z`
- 玩法从单只怪物改为连续关卡：加急入侵、反复横跳、时间蒸发、精准命中、
  空气协作五类办公室怪物轮换，之后继续循环并随关卡提升血量。
- 每次击打累计“已释放怒气”，通关结算展示本关释放值和总释放值；“进入下一关”
  是清晰的主操作，核心点击解压可无限持续。
- MaaS 嘴替改成通关后的可选战利品，不阻断进入下一关。只有主动领取本关 AI
  嘴替时才消耗一次免费额度；连续闯关本身不消耗额度。
- 生产 Playwright 验证：第 1 关 12 击清空后，进入第 2 关“需求漂移怪”且总怒气
  为 12；连续通关不扣额度，领取第 2 关 AI 嘴替后额度从 `20/20` 变为 `19/20`。
  手机/桌面无横向溢出；奖励卡主、次操作均已按截图复核可见。

2026-11-12 异玩法关卡重构 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T120000Z`
- 修复旧版“下一关只换标题和血量”的无意义循环。现在五关有不同舞台对象、完成目标
  和输入手势：
  1. 连击砸碎加急需求；
  2. 将“再改一版”需求拖/点入碎纸机；
  3. 戳破 9 个独立会议泡泡；
  4. 点飞来的黑锅原路退回；
  5. 长按驱散已读不回幽灵。
- 移动端为碎纸机提供点击投入作为拖拽的等效路径；会议泡泡被戳后真正移除，不会因
  进度刷新而重新生成。
- 公网 Playwright 验证实际加载 `styles.css` 与 `app.mjs` 的
  `20261112T120000Z` 版本；第 2 关完成 6 次碎纸后清关，第 3 关从 9 个泡泡清到
  0 后清关。Niuma、Image、FlowFrame 均返回 200。

2026-11-12 卡通攻击手感 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T123000Z`
- 第一关从普通点击改为三种卡通办公室整蛊招式：拳套重击（+1）、飞踢需求
  （+2）、巨型红章驳回（+3）；快速连续出手可获得连击加成。
- 每次攻击有独立冲击字、震屏、目标受击反馈，设备支持时触发短震动；不使用
  真实伤害、血腥内容或对真人施暴的呈现。
- 攻击工具随关卡语境切换：会议关使用“静音一泡、取消会议、全员散会”，其中
  “全员散会”一次真正移除 3 个会议泡泡；碎纸、退锅关也改为对应工具文案。
- 生产 Playwright 验证：招式推进依次为 `12 → 11 → 9 → 6`；会议关从 9 个泡泡
  使用“全员散会”后变为 6 个。实际加载静态资源版本 `20261112T123000Z`，并回归
  Niuma、Image、FlowFrame 均为 200。

2026-11-12 怒气蓄力与清场大招 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T130000Z`
- 在普通招式之外加入“蓄力—爆发—清场”循环：每次出手为怒气大招充能，
  充满 100% 后解锁“全场清退”；释放时出现“下班！”冲击字、加强震屏及
  设备支持时的短震动，直接清空本关剩余目标。
- 目标根据关卡进度呈现裂纹、褪色等非血腥卡通损坏状态；连续攻击依然可以
  触发连击加成。大招就绪的提示采用光晕/亮度，不对按钮做持续位移动画，
  保证触控与浏览器自动化均可稳定点击。
- 公网 Playwright 验证：红章驳回三连后怒气达 `100%`、大招可用并清关；
  实际加载静态资源版本 `20261112T130000Z`，手机 `390px` 无横向溢出，
  Niuma 与 FlowFrame 均为 200。

2026-11-12 18:00 下班冲刺首关 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T132139Z`
- 第 1 关从点击任务卡改为 18 秒“下班电梯冲刺”：用户在三条跑道中点击换道，躲避临时会议、老板@你、加急需求等随机办公室事故，电梯关门前抵达即通关。
- 障碍碰撞扣除 2.3 秒；倒计时耗尽显示“电梯关了”并提供即时重开，不扣额度、不影响后续关卡；通关结算明确兑现“电梯没等老板，今晚准点走”。
- HTML 静态资源版本更新为 `?v=20261112T132139Z`，避免与前一版 CSS/JS 混用。
- 本地 Playwright 验证：手机 `390×844`、桌面 `1440×1000` 均无横向溢出；自动依据临近障碍选择安全跑道可以稳定通关；7 项单元测试与 `src/app.mjs` 语法检查通过。
- 腾讯云本机健康检查返回 200。公网 Playwright 已确认实际加载 `styles.css` 和 `app.mjs` 的 `20261112T132139Z` 版本，手机完整通关并显示下班冲刺结算、无横向溢出；桌面正常显示首波障碍。Niuma、Image、FlowFrame、MeYou 健康入口均为 200。

2026-11-12 通关结算视觉修复 release：

- 当前 release：`/data/app/niuma-mouthpiece/releases/20261112T134606Z`
- 移除浅米白、大面积公告式通关卡；替换为贴近游戏舞台的暗色胜利面板，黄色只用于通关状态与唯一主操作。
- 收紧标题、结果与操作的垂直节奏；“进入下一关”采用高亮黄主按钮，AI 嘴替降级为深色次操作，避免两个操作彼此争夺。
- 资源样式版本更新为 `?v=20261112T134606Z`。本地 Playwright 手机通关截图、桌面截图、无横向溢出和 7 项单测均通过。
- 腾讯云本机健康检查返回 200。公网 Playwright 已确认实际加载 `styles.css?v=20261112T134606Z`，完成通关并显示暗色胜利面板；手机无横向溢出。Niuma、Image、FlowFrame、MeYou 健康入口均为 200。

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块：`# BEGIN/END niuma-mouthpiece`
- 阿里云监听：`127.0.0.1:45410`，由腾讯云反向 SSH 隧道提供。
- 发布前备份：
  `/data/app/lifeyoume-platform/deploy/nginx-platform.conf.backup-niuma-20261112T092235Z`

共享配置发布前 SHA-256：
`a16148df7925075021056bc00e2b24433dc2a46c686027fb67026fe2a8a2eae6`

发布后 SHA-256：
`186d2054d1b79c8d4b74de22af07c349ab3705980aeaf8d439bdca771d8fda79`

发布前后 inode 均为 `1358688`。修改前盘点已有路由，修改后确认无既有路由
消失；使用现网容器执行 `nginx -t` 成功，只执行 `nginx -s reload`，未重启或
重建共享 `opportunity_factory_proxy` 容器。

## 验证

- 本地测试：`npm test`，5 项诊断测试通过。
- 本地 Node 语法检查通过：`server.mjs`、`src/app.mjs`、`src/diagnosis.mjs`。
- 本地临时服务验证：
  - `GET http://127.0.0.1:45410/health` 返回 200。
  - `GET http://127.0.0.1:45410/niuma/` 返回 200。
- 腾讯云：
  - `niuma-mouthpiece.service` active。
  - `GET http://127.0.0.1:45410/health` 返回 200。
  - `niuma-mouthpiece-aliyun-tunnel.service` active。
- 阿里云：
  - `sshd` 监听 `127.0.0.1:45410`。
  - `GET http://127.0.0.1:45410/health` 返回 200。
  - `GET http://127.0.0.1:45410/niuma/` 返回 200。
- 公网：
  - `GET https://lifeyoume.icu/niuma/` 返回 200。
  - `GET https://lifeyoume.icu/niuma/health` 返回 200。
  - `POST https://lifeyoume.icu/niuma/api/diagnose` 返回 `source=maas`、
    `model.used=true`、`modelId=lym-chat-quality`。
- 代表性既有入口：
  - AI Team `/ai-team/` 返回 200。
  - FlowFrame `/flowframe/` 返回 200。
  - Image `/image/` 返回 200。
  - Resume `/resume/` 返回 200。
  - Vault `/vault/` 返回 200。
  - Trends `/trends/` 返回 200。
  - MeYou `/health` 返回 200。
  - Audit 根入口返回 200。

## 回滚

1. 将共享 Nginx 中 `# BEGIN/END niuma-mouthpiece` 块删除，或将备份内容复制回原文件
   （保持 inode，不替换文件）。
2. 执行 `docker exec opportunity_factory_proxy nginx -t`。
3. 只执行 `docker exec opportunity_factory_proxy nginx -s reload`。
4. 停止并禁用 `niuma-mouthpiece-aliyun-tunnel.service` 和
   `niuma-mouthpiece.service`。

任何无关路由丢失、变为 404 或入口健康异常都应立即执行回滚。
