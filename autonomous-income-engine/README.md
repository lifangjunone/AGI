# Autonomous Income Engine

这是一个独立项目，目录固定为：

```text
/Users/bytedance/Desktop/agi/autonomous-income-engine
```

目标是让程序完成商品展示、免费获客工具、下单、独立付款确认和数字交付，而不是让所有者人工接单或照着教程运营。

商业判断、方向纠偏、真实数据基线与后续验证口径见 [商业逻辑时间线](docs/BUSINESS_TIMELINE.md)；程序内的有限自优化范围见 [收入自优化循环](docs/INCOME_EVOLUTION.md)。目前尚无真实付款证据，不能把技术上线等同于商业验证。

## 当前公开产品

- 首页已是产品箱；正式产品包括商品图批量成品机（¥6.90）和消费维权证据包（¥19.90），分别提供自己的免费预览和完整 ZIP 下载。
- 产品 ID：`product-image-batch-studio`
- 产品：商品图批量成品机
- 使用价格：整批高清 ZIP ¥6.90；买家先看带预览标识的处理效果，确认后再创建付款订单
- 交付：浏览器本地生成高清 ZIP；个人微信扫码订单目前需店主手机核对到账后解锁，不需要人工返图。另行接入可靠的支付通知来源后才可能自动核验到账。
- 功能：一次处理最多 30 张图，批量统一尺寸和主体占比、完整留白/居中裁切、纯色背景自动换底、留白比例、品牌角标、JPG/WebP/PNG 和文件命名
- 自动换底边界：从四角判断白、灰或棚拍纯色背景；四角差异过大的复杂背景会保留原图，不会假装抠图成功
- 快捷入口：通用白底主图、3:4 商品图、4:5 内容图，以及淘宝、拼多多、小红书、抖音四个平台规格，共 7 个可索引预设页；全部使用同一个本地图片处理引擎
- 自动回流：每次完成预览后自动生成 1080×1350 效果卡；支持系统分享，不支持时自动下载卡片并复制带来源标记的回流链接
- 隐私：图片解码、画布处理和 ZIP 打包全部在买家浏览器中完成，原图不上传
- 推广中心：手机管理端每周自动准备 3 套小红书发布包，固定覆盖时间对比、结果展示和真实问题；每条内容带独立来源链接并明确标注演示素材不是客户订单
- 真实漏斗：匿名统计真人访问、开始上传、生成成功、创建订单、付款确认和完成下载，机器人和爬虫不计入有效数据
- 30 天验证：管理端按照 7/14/30 天目标诊断掉队环节；小红书累计带来 5 次真实生成前不会建议启用闲鱼

历史简历交付代码只保留为支付与交付兼容层，不再控制公开首页、搜索提交、公开产品身份或真实使用漏斗。

## 程序自动完成

1. 买家拖入原图后，程序在浏览器本地处理并展示整批带标识预览；
2. 买家确认效果后，程序创建服务端固定价格的 checkout，并显示本单唯一实付金额和用户提供的微信收款码；
3. 客户端传入的金额不会改变 ¥6.90 商品价；
4. 权威到账通知匹配后，原页面自动解锁浏览器内存中的高清 ZIP；
5. 只记录不含图片、文件名和品牌名的匿名完成事件；
6. 服务端用真实 User-Agent 标记自动化流量，客户端不能伪造成人类事件；
7. 买家自报付款不能触发订单、收入或高清下载；
8. 独立 payment feed、带密钥 webhook 或受保护的手机管理端真实核对才能确认付款；当前个人微信流程使用手机核对，不能宣称已经无人收款；
9. 每 15 秒同步一次独立付款来源；
10. 公网入口每 60 秒探活，连续三次失败才切换；
11. 每 15 分钟重建、部署、同步付款并维护搜索提交；
12. 外部发布只在渠道能力、授权和平台规则允许时执行；当前服务器队列仍可能标记 `waiting-for-owner-review`，浏览器登录和上传草稿不等于发布成功。用户要求无日常运营参与，程序将不可用渠道记为限制，不伪装成已发布。
13. 买家分享效果卡带回的访问单独记为 `share-card-referral`；机器人和浏览器自动化仍不会计为真实用户。
14. 用户从带 `source` 和 `campaign` 的推广链接进入后，来源会匿名贯穿上传、生成、下单和下载，不记录原图、文件名或品牌名。

## 本地查看

```bash
cd /Users/bytedance/Desktop/agi/autonomous-income-engine
npm start
```

浏览器打开：

```text
http://127.0.0.1:4188
```

正式入口：

```text
https://lifeyoume.icu/image/
```

手机经营管理：

```text
https://lifeyoume.icu/image/admin/
```

管理端包含收款确认、产品榜和推广中心。推广中心准备发布草稿与独立链接，产品榜展示来源漏斗。每日自优化自动执行有限候选与回退；发布和个人微信核验尚未达到全程无人参与，具体限制与验证时间线见上述文档。

该项目继续保存在独立目录、使用独立的 `4188` 服务端口；统一域名只通过
Nginx 将 `/image/` 转发给本项目，不覆盖 LifeYouMe 根站或其他项目。

状态接口：

```text
http://127.0.0.1:4188/api/status
```

真实收入只看状态接口中的：

```json
{
  "revenue": 0,
  "orders": 0,
  "checkouts": {
    "paid": 0
  }
}
```

部署成功、页面访问、checkout 或测试付款都不算收入。

## 构建与验证

```bash
npm run verify
npm run verify:runtime
npm run build:storefront
node scripts/build-public-front.js \
  https://dynamic-payment-service.example \
  https://seller.example/autonomous-income-engine
```

`npm run verify` 覆盖固定商品、支付防伪、自动交付、公网自愈和显式购买等核心不变量。

`npm run verify:runtime` 会在隔离临时目录启动一个 `0.0.0.0` 运行实例，验证生产密钥、匿名状态脱敏和外置持久化目录，结束后自动清理。

`build-public-front.js` 的第一个参数是动态服务地址，第二个参数是稳定静态前门地址。生成的 `public-front/` 只包含可公开文件：

- 首页和 7 个使用不同真实导出参数的商品图预设入口；
- 样式、feed、RSS、robots、sitemap；
- 只保存动态服务 URL 的 `service.json`。

它包含商品图批处理器、浏览器端 ZIP 库和用户明确提供并批准公开的微信收款码。发布门禁会校验二维码与批准原图的 SHA-256 完全一致；公开包不包含订单、付款密钥、交付令牌或项目源码。

发布前安全检查：

```bash
npm run verify:front
```

需要把公开包复制到专用空目录时：

```bash
node scripts/public-front-release.js stage /absolute/empty/staging-directory
```

安全门只允许 17 个白名单文件，发现二维码、订单 ID、付款密钥、交付令牌或额外文件会拒绝。动态付款地址更新前还会请求该服务的 `/api/status`，只有 HTTPS 且返回 `{"ok":true}` 才会原子写入：

```bash
node scripts/public-front-release.js set-service https://healthy-payment-service.example
```

## 常驻服务

项目自带 macOS launchd 配置：

```text
ops/com.codex.autonomous-income-engine.plist
```

它只启动本项目的 `src/server.js`，异常退出自动拉起。日志位于：

```text
runtime/logs/service.out.log
runtime/logs/service.err.log
```

常驻进程默认执行三条互相独立的真实链路：

- 每 15 秒同步独立付款通知；买家自报付款不会触发交付；
- 每 15 分钟运行固定商品商务循环，只维护 `product-image-batch-studio` 的页面、真实使用漏斗和搜索索引，不启用旧的多实验 worker；
- 每 60 秒探测公网入口，连续失败后尝试切换临时入口；失败的启动中/已启动隧道会回收并进入冷却，避免孤儿进程。

状态接口：

```text
http://127.0.0.1:4188/api/status
```

`revenue`、`orders` 和 `checkouts.paid` 只来自权威付款通知，不把访问、checkout、测试或部署计为收入。

## 生产容器

项目包含 `Dockerfile` 与 `compose.yaml`。容器运行时：

- 监听 `0.0.0.0:4188`；
- 订单、checkout、交付令牌和生成站点写入 `/app/state` 持久化卷；
- 微信二维码只读挂载到 `/run/secrets/wechat-pay.jpg`，不进入镜像；
- 缺少付款密钥或管理密钥时拒绝启动；
- 两个密钥都必须至少 24 字节并且不能相同；
- 匿名 `/api/status` 只返回健康信息，管理状态和管理写接口需要 `X-Admin-Secret`；
- 付款通知使用独立 `X-Payment-Secret`，不能复用管理密钥。

创建本地生产环境文件：

```bash
cp .env.production.example .env.production
```

填入两个不同的强随机密钥和最终 HTTPS 地址后，可由容器平台执行：

```bash
docker compose --env-file .env.production up -d --build
```

启动前可以只校验配置，不创建容器：

```bash
docker compose --env-file .env.production config --quiet
```

部署平台必须提供一个持久化卷和 HTTPS 入口。程序启动后会自行维护固定商品页面、真实付款同步、订单和自动交付；不需要所有者手工接单。

## 仍需外部条件

- 正式地址固定为 `https://lifeyoume.icu/image/`；临时隧道只用于本地故障排查，不能作为 canonical、分享回流或搜索提交地址；
- 个人微信收款码本身不提供官方到账回调。当前独立 payment feed 尚未收到过真实通知，因此收费按钮会自动显示“付款通道未就绪”并禁止创建订单；程序不会收取一笔无法自动核验的款；
- 一旦安全的独立到账源产生真实通知，readiness 会自动转为 ready，页面随即开放“¥6.90 解锁高清 ZIP”，无需再改前端或人工确认订单；
- 未提供外部平台账号授权时，程序不会擅自发布内容。

这些缺口会在状态接口中保持失败或阻塞，不会被写成“已经赚钱”。
