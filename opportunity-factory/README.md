# Opportunity Factory

**在线使用：** [免费审计 GitHub 开源项目](https://audit.lifeyoume.icu/)
**专业报告：** ¥9.90/仓库，微信扫码付款，到账确认后解锁 Markdown 和 JSON 整改清单。

产品类型：商机发现、审计与验证工作台
原产品名：商机罗盘 / Opportunity Compass
运行形态：macOS 桌面应用 + 本地/服务器无人值守服务
上游项目：[`technology-intelligence/`](../technology-intelligence/)

每天从 Technology Intelligence 的本机报告中筛选 1-3 个可收费、可触达、可在 7 天内验证的商机。

默认以 **1 人团队** 评估，并可切换到 2-5 人或 6-20 人团队。不同规模会分别显示适配度、现金投入、个人/团队工时、上线时间、交付范围和收入目标。

## 它如何判断商机

商机罗盘不会把热点直接当成生意。候选必须同时具备：

- 明确的付费买家和高成本问题
- 可以立即报价的首个服务或产品
- 来自 Technology Exploration 的原始证据链接
- 7 天内可执行的需求验证动作
- 可量化的继续条件和停止条件

定价、客户意愿和收入均明确标记为待验证假设。只有真实付费才算验证。

## 单人创业闭环

每条商机包含七个可推进阶段：

1. 商机确认：核对证据、买家和替代方案
2. 需求验证：访谈和付费意愿验证
3. 开发交付：按单人范围完成最小可收费版本
4. 正式上线：发布体验、报价和咨询入口
5. 推广获客：执行内容与精准触达任务
6. 收款盈利：报价、收款并核算交付成本
7. 复盘复利：沉淀模板并根据利润决定继续或停止

应用会在本机保存阶段、任务、经营笔记、实际投入、收入、线索和付费客户，并实时计算利润、ROI 和成交率。

## 数据更新

商机列表顶部会同时展示：

- 商机生成时间
- Technology Exploration 来源数据时间

点击“更新数据”或按 `⌘R`，会重新读取 Technology Exploration 最新本机报告并重新计算今日商机。更新期间按钮会锁定；失败时保留上一次可用结果。

## 无人值守商机工厂

`service/autonomous_factory.py` 是独立于 Technology Exploration 的 24/7 服务：

- 每 15 分钟读取 GitHub Issues 和 Hacker News 官方公开 API
- 区分悬赏/付费交付需求与可复用产品机会
- 单个需求只进入联系队列，不直接生成公共产品
- 至少三位独立作者、三个独立来源重复提出同类问题后，才允许自动上线产品
- 只有具备真实执行引擎的产品类型才能上线，禁止生成固定文案模板
- 当前产品会实时合并 GitHub 与 OpenSSF 独立证据，输出供应链安全、工程准备度、维护采用和许可证四维评分
- 审计会根据业务场景、数据敏感度和维护团队规模计算 65-90 分的采用门槛；同一仓库不会得到脱离使用环境的通用结论
- 客户生产系统、可执行 Agent、敏感数据和单人维护会分别增加专属放行门禁
- 免费版用于风险摘要；专业版自动生成失败项原因、优先级、整改动作、7 天门禁及 Markdown/JSON 交付物
- 首页直接提供实时审计工作台，不再以商机工厂介绍页作为首屏
- 免费候选对比会在同一业务上下文下审计两个仓库，区分一方达标、双方接近和双方均不达标，不为营销强行选择赢家
- 报告库提供一份明确标记的完整专业样例，买家可在付款前检查真实结构与下载文件；样例不会解锁付款状态或计入收入
- 自动生成可使用的工具、留资入口、RSS、Sitemap、IndexNow 提交和渠道归因
- 每次审计生成可分享链接；支付确认后自动开放 Markdown 与 JSON 证据下载
- 每天自动审计一个主流开源项目，并在内部工具、客户生产系统、敏感数据 Agent 三类场景间轮换，持续形成高意图搜索资产
- 同场景公开报告达到两份后，系统自动生成仓库 A vs B 对比页，并提交 Sitemap、IndexNow、RSS 和 WebSub
- 每份公开报告提供跨域摘要 API、稳定的仓库+场景 SVG 徽章和公开证据历史；徽章随最新公开重审自动更新
- 徽章复制代码自动携带 `embedded_badge` 归因，只有点击回站并发生真实交互才进入有效访问
- 可配置服务器私有微信收款码，生成带唯一付款备注的 ¥9.90 首单订单；买家提交付款信息后进入后台核账队列
- 管理员确认微信真实到账后，系统才会解锁 Markdown/JSON、记录支付事件和增加人民币净收入
- 本机每 5 分钟轮询一次生产待核账订单；发现新微信付款申报时发送 macOS 通知，避免交付卡在人工确认
- 外联默认关闭；启用后也只回复明确悬赏需求，每天最多两条

### 推广与盈利边界

已经自动执行：

- 新产品通过 IndexNow 主动提交给支持的搜索引擎
- 每日公开样本报告通过 IndexNow 主动提交，报告库持续增长
- RSS、WebSub、Sitemap、产品页和每日采用报告持续更新
- 报告标题、RSS 与 TechArticle JSON-LD 包含仓库和采用场景；页面同时包含 canonical、OpenGraph 与 Twitter Card
- README/文档可嵌入的动态采用徽章形成产品自传播入口；系统不会未经授权修改第三方仓库
- 外联链接携带 UTM，管理页统计访问、审计、报告查看、下载和留资
- 管理页统计“有效访问 → 有效审计 → 打开微信收款 → 提交核对 → 确认到账 → 下载交付”的完整漏斗
- 有效访问只在页面发生首次触摸、点击或键盘操作后记录，并按天匿名去重；纯 GET、索引抓取、QA 和自动化测试不会进入商业实验

尚未验证：

- 目前 `site:lifeyoume.icu` 尚未发现可见搜索收录，IndexNow 成功仅代表提交成功，不代表已获得自然流量
- 自动推广尚未产生有效真人访问、审计或收入

仍需外部账户：

- 自动联系 GitHub 需求方需要专用 GitHub Token
- 自动收款支持 Stripe Checkout；需要配置 `STRIPE_SECRET_KEY`、`STRIPE_PRICE_ID` 与签名 webhook
- 全球数字产品收款支持 Lemon Squeezy；需要结账 URL、Variant ID、签名 webhook，并先确认中国卖家的 PayPal 或境外银行打款资格
- 只有签名有效、金额和币种完全匹配的 `checkout.session.completed` 才解锁专业报告并计入收入
- Lemon Squeezy 只有签名有效、正式环境、已付款、Variant 和 USD 税前金额精确匹配的 `order_created` 才解锁；美元收入独立记账

微信静态收款码被限定为国内最小首单实验通道，不伪装成自动支付 API。二维码文件保存在服务器私有目录，不进入 Git；买家自报付款不会计入收入，必须由管理员核对微信到账后确认。需要无人值守自动核账时，仍应接入微信支付商户 API、Stripe 或 Lemon Squeezy。完整边界见 [跨境部署与收款决策](docs/CROSS_BORDER_DEPLOYMENT_AND_PAYMENTS.md)。

当前生产商业证据（2026-09-08）：

- 有效真人访问：4
- 有效真人审计：0
- 购买意向：0
- 真实支付与收入：0

这些数字不会包含 QA、自动化测试、爬虫或未付款留资。

商业实验止损标准：

- 达到 300 个自然/外联有效访问后，免费审计完成率低于 8%：重做定位与首屏承诺
- 达到 30 个非测试审计后，微信收款页打开率低于 5%：停止当前专业报告方案
- 达到 10 次微信收款页打开后仍无付款提交：调整价格、信任说明或交付物
- 付款申报不等于收入；只有核账确认才计入支付和人民币净收入

配置微信首单通道：

```bash
./scripts/install-wechat-qr.sh /absolute/path/to/wechat-pay.png
```

脚本会验证图片格式和大小，通过 SSH 上传到服务器私有目录，更新生产环境变量、重启服务并等待健康检查通过。

安装本机后台守护：

```bash
./scripts/install_factory_daemon.sh
```

本机运行地址：

`http://127.0.0.1:8792`

服务器部署：

```bash
DEPLOY_KEY=/path/to/private-key ./deploy/push.sh
```

部署程序会安装 systemd 服务、Nginx 反向代理和 Let's Encrypt HTTPS，不会覆盖占用 `8787` 端口的未知服务。

## 数据

只读使用：

`~/Library/Application Support/Technology Exploration Agent/reports/*.json`

商机报告和个人验证状态仅保存在本机：

`~/Library/Application Support/Opportunity Compass/`

应用不复制或上传 Technology Exploration 的 API Key。

## 构建

```bash
chmod +x scripts/build.sh scripts/install_daily.sh
./scripts/build.sh
```

构建产物：

`dist/商机罗盘.app`

安装每天 09:10 自动打开：

```bash
./scripts/install_daily.sh 9 10
```

## 测试

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile app/opportunity_engine.py
python3 -m py_compile service/autonomous_factory.py
clang -fobjc-arc -fsyntax-only -framework Cocoa -framework WebKit native/NativeShell.m
```

## 当前机会模型

- AI Agent 交付监管与断点恢复
- 企业 Agent 知识接入
- 企业大模型成本与效果体检
- AI 内容生产流程自动化
- 热门开源 AI 工具企业落地

后续应使用真实访谈、报价和成交结果调整评分，而不是继续增加抽象趋势指标。

生产运行台位于 `https://audit.lifeyoume.icu/admin`，同时兼容末尾带 `/` 的地址；访问凭据保存在本机 `~/Library/Application Support/Opportunity Factory/server-credentials.txt`。
