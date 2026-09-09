# 微信通知接入

## 已实现

- 小程序一次性订阅消息：小程序调用 `requestSubscribeMessage`，服务端用 `Taro.login()` 的 code 换取 openid。
- 公众号模板消息：通过 `snsapi_base` OAuth 获取 openid，服务端在视频任务完成后发送模板消息。
- 任务绑定：订阅记录保存在 `data/notifications/subscriptions.json`，不保存微信 `session_key`。
- 任务完成触发：后台视频任务完成后同时尝试小程序和公众号通知；通知失败不会把已完成的视频任务标记为失败。
- 凭证缓存：微信 access token 保存于受限的 `data/notifications/access-tokens.json`，不会写入日志。

## 服务器变量

```text
WECHAT_MINIAPP_APP_ID=
WECHAT_MINIAPP_APP_SECRET=
WECHAT_MINIAPP_TEMPLATE_ID=
WECHAT_MINIAPP_TEMPLATE_DATA={"thing1":"视频生成完成","phrase2":"{{status}}","time3":"{{completedAt}}","thing4":"{{detail}}"}

WECHAT_OFFICIAL_APP_ID=
WECHAT_OFFICIAL_APP_SECRET=
WECHAT_OFFICIAL_TEMPLATE_ID=
WECHAT_OFFICIAL_TEMPLATE_DATA={"first":"视频已生成完成","keyword1":"{{detail}}","keyword2":"{{completedAt}}","remark":"点击查看视频"}
WECHAT_OFFICIAL_REDIRECT_URI=https://lifeyoume.icu/video/api/notifications/official/callback
```

模板字段名必须替换为微信后台实际模板字段。不要把 App Secret 写入小程序代码。

## 接口

```text
GET  /api/notifications/config
POST /api/notifications/miniapp/subscribe
GET  /api/notifications/official/start?jobId={jobId}
GET  /api/notifications/official/callback
```

公众号入口应在微信内打开 `/api/notifications/official/start?jobId=...`，用户授权后会回到任务页面。小程序完成任务后跳转到 `pages/notifications/index?jobId=...`，用户点击“开启完成通知”完成授权。

未配置凭证或模板 ID 时，配置接口会返回 `enabled: false`，任务仍正常完成，不会伪造“通知已发送”。
