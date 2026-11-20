# 命运分身今日时运

最后核验：2026-11-17（Asia/Shanghai）

2026-11-16 20:21：平台共享证书过期已修复，严格 TLS 校验下
`/destiny-persona/` 返回 200；新证书有效至 2027-02-14，已启用自动续签。
产品代码和路由未改。维护方式见 [`PLATFORM_TLS.md`](../runbooks/PLATFORM_TLS.md)。

## 公网入口

- 产品入口：`https://lifeyoume.icu/destiny-persona/`
- 健康检查：`https://lifeyoume.icu/destiny-persona/health`
- 测算接口：`POST https://lifeyoume.icu/destiny-persona/api/read`

这是一个中文娱乐 H5。0.5.1 使用墨绿玄符卡方向：填写后进入独立今日卡页面，不在首页底部追加结果。按北京时间计算当天六十甲子日柱，一次生成洗牌得到整体、事业、关系、财运、行动、心绪六个不重复观察角度；切卡不改变当天日柱，也不重复消耗额度。支持复制签文和浏览器生成 PNG 卡片。

每位匿名访客先使用 3 次免费额度，之后可购买灵感包（¥6.90 / 10 次）或常用包（¥19.90 / 50 次）。支付订单 15 分钟有效；支付宝同步回跳自动返回产品页，前端短时自动查单，到账后直接恢复生成。异步通知地址默认由 `PUBLIC_ORIGIN` 生成，并执行 RSA2 验签、应用/订单/金额/卖家校验和幂等增额。代码与支付宝沙箱验证已完成；生产支付宝产品及应用配置尚未开通，未配置时线上只展示套餐，付款按钮禁用，不能视为已经支持真实收款。

产品边界：

- 娱乐与自我观察用途，不构成心理、医学、投资或真实命理建议；
- 不保存完整昵称、生日、主题、意象或原始测算输入；
- 持久化匿名访客额度、脱敏昵称、省份、人格名、主宫、五行等运营热力指标；
- 使用本地日历与娱乐规则；当天日柱固定，六个解签角度按输入和日期确定性洗牌；
- 不依赖数据库、MaaS 或第三方模型。

## 腾讯云部署

- 部署根目录：`/data/app/destiny-persona`
- 当前版本链接：`/data/app/destiny-persona/current`
- 当前 release：`/data/app/destiny-persona/releases/20261117T090733Z-flow-0.5.1`
- 服务：`destiny-persona.service`
- 隧道：`destiny-persona-aliyun-tunnel.service`
- 监听：`127.0.0.1:45560`
- 环境文件：`/etc/destiny-persona/app.env`，root-only
- 匿名热力数据：`/data/app/destiny-persona/data/analytics.json`

服务使用 release 内 Python venv 承载静态页面和支付宝官方 SDK，并提供：

- `GET /destiny-persona/`
- `GET /destiny-persona/health`
- `GET /destiny-persona/api/pulse`
- `POST /destiny-persona/api/read`
- `GET /destiny-persona/api/billing/config`
- `POST /destiny-persona/api/billing/checkout`
- `GET /destiny-persona/api/billing/order`
- `POST /destiny-persona/api/billing/confirm`
- `POST /destiny-persona/api/billing/notify`
- `GET /destiny-persona/payment/return`

生产支付配置只允许写入 root-only 的 `/etc/destiny-persona/app.env`：

- `PUBLIC_ORIGIN=https://lifeyoume.icu`
- `ALIPAY_APP_ID`
- `ALIPAY_APP_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`
- `ALIPAY_SELLER_ID` 或 `ALIPAY_SELLER_EMAIL`
- 可选 `ALIPAY_NOTIFY_URL=https://lifeyoume.icu/destiny-persona/api/billing/notify`

不得在生产设置 `ALIPAY_USE_SANDBOX=1`，不得将 `.alipay-sandbox.json` 上传服务器，也不得把生产私钥记录在本文档、Git 或会话中。

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块标记：`BEGIN/END destiny-persona`
- Aliyun 本地监听：`127.0.0.1:45560`，由 Tencent 反向 SSH 隧道提供
- 共享容器：`opportunity_factory_proxy`

本次只追加 `/destiny-persona/` scoped location，保持共享配置 inode，执行 `nginx -t` 后使用 `nginx -s reload`，未重启或重建共享代理容器。

0.5.1 发布仅切换 Tencent 产品 release 并重启 `destiny-persona.service`，
未改共享 Nginx，未重启隧道或共享代理。旧 release 保留可回滚。

## 验证

2026-11-17 上线验证：

- 本地 smoke test、Python 编译和前端 JavaScript 语法检查通过；
- 支付宝沙箱下单、官方网页支付表单、回跳待确认和未付款不增额验证通过；
- 0.5.1 沙箱支付表单包含 15 分钟有效期、精确 `return_url` 和默认公网
  `notify_url`；同步回跳使用 303 自动返回产品页；
- 375px 浏览器模拟待确认后自动查单两次并到账，成功态、继续生成按钮、44px
  触控目标和无横向溢出检查通过；
- Tencent release 使用固定 `alipay-sdk-python==3.7.1411` 的独立 venv，SDK 导入验证通过；
- Tencent `destiny-persona.service` active，`NRestarts=0`；
- Tencent `destiny-persona-aliyun-tunnel.service` active，`NRestarts=0`；
- Tencent `127.0.0.1:45560` 由 Python runtime 监听；
- `https://lifeyoume.icu/destiny-persona/` 返回 200；
- `https://lifeyoume.icu/destiny-persona/health` 返回 `status=ok`；
- `GET /destiny-persona/api/pulse` 兼容旧 API，仅返回保留记录统计；无种子热度、虚构昵称或累计数字，当前 UI 不调用；
- 公网 `POST /destiny-persona/api/read` 返回 200、`JZ-xx` 当日日柱和六个不重复解签角度，并返回匿名额度；
- 2026-11-16 公网返回 `JZ-31`、`甲午`，六张卡的 `key` 均不重复；
- 同一匿名访客第 4 次返回 402、`quota_exhausted`；展示两个真实套餐；生产支付宝配置未就绪时按钮禁用并准确说明正在开通；
- 公网 Billing 配置返回 `provider=null`、`checkoutEnabled=false`，未配置生产商户时 checkout API 返回 `payment_not_configured`，不会创建假付款；
- 公网 375px 浏览器真实生成 3 次后，第 4 次进入新版三步付费墙；两档套餐可见且
  生产按钮禁用，无横向溢出；
- 1440/768/375/320px 浏览器检查通过：独立卡片 URL、六张不重复翻卡、固定日柱、刷新恢复、返回保留输入、无横向溢出和 PNG 下载；
- 公网桌面与手机浏览器完成真实生成、独立卡片路由、固定日柱与翻卡检查；
  截图位于 `destiny-persona/design-review/live-desktop.png` 和
  `live-mobile.png`。
- 代表性既有入口回归：
  `/ai-team/`、`/flowframe/`、`/image/`、`/resume/`、`/vault/`、
  `/trends/`、`meyou.lifeyoume.icu`、`audit.lifeyoume.icu` 均返回 200。

0.5.1 未修改共享 Nginx；`destiny-persona.service` 和反向隧道均为
`active`、`NRestarts=0`。

共享 Nginx 备份：

`/data/app/backups/destiny-persona/nginx-20261116T063633Z`
