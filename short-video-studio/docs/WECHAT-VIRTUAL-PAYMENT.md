# 微信小程序虚拟支付

## 当前状态

代码已接入微信虚拟支付道具直购链路，但生产支付仍需在微信小程序后台完成开通和配置。未配置完整参数时，服务端返回 `503`，小程序显示“微信支付暂未开通”，不会伪造支付成功。

## 必需配置

将以下敏感配置写入生产 `.env.local`，不要提交到仓库：

```env
WECHAT_MINIAPP_APP_ID=wxa087f03ad52dd2bf
WECHAT_MINIAPP_APP_SECRET=
WECHAT_VIRTUAL_OFFER_ID=
WECHAT_VIRTUAL_APP_KEY=
WECHAT_VIRTUAL_PRODUCT_ID=
WECHAT_VIRTUAL_ENV=0
WECHAT_VIRTUAL_NOTIFY_TOKEN=
```

部署服务必须加载该文件。当前 systemd 模板已增加：

```ini
EnvironmentFile=-/data/app/short-video-studio/.env.local
```

其中 `OfferID`、现网 `AppKey` 和道具 `ProductID` 来自微信后台“支付与交易 → 虚拟支付”。商品道具价格必须与后台一致；当前商品内容包价格为 `¥1.00`，服务端签名使用 `100` 分。

## 生产链路

```text
Taro.login
→ POST /api/wechat-pay/order
→ 服务端 code2Session + 双 HMAC 签名
→ requestVirtualPayment（mode=short_series_goods）
→ 微信 xpay_goods_deliver_notify
→ /api/wechat-pay/notify 幂等发货
→ 小程序轮询 /api/wechat-pay/orders/:id
```

通知地址：

```text
https://lifeyoume.icu/video/api/wechat-pay/notify
```

## 开通后检查

1. 在微信后台创建并发布道具，记录 `ProductID`。
2. 配置发货推送地址；如后台提供通知令牌，再同步配置 `WECHAT_VIRTUAL_NOTIFY_TOKEN`。
3. 重启生产服务。
4. 用小额真实订单验证“支付 → 发货通知 → `DELIVERED` → 内容解锁”。

发货通知中的微信平台订单号按官方格式位于
`WeChatPayInfo.MchOrderNo`，服务端以它做幂等判断，同时兼容历史顶层字段。

## 官方支付字段

- `signData`：包含 `offerId`、`buyQuantity`、`env`、`currencyType`、`productId`、
  `goodsPrice`、唯一 `outTradeNo` 和 `attach` 的 JSON 字符串。
- `mode`：固定为 `short_series_goods`。
- `paySig`：`HMAC-SHA256(appKey, "requestVirtualPayment&" + signData)`。
- `signature`：`HMAC-SHA256(sessionKey, signData)`。

前端支付成功回调不能作为发货依据；生产环境还需要完成 `query_order` 查单兜底，
防止支付成功但发货推送丢失时订单一直停留在 `PENDING`。

当前订单文件：

```text
data/payments/wechat-virtual-orders.json
```
