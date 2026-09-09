# 智助乖乖微信渠道接入

## 公众号菜单与文章入口

公众号“智助乖乖”可将菜单或文章底部阅读原文配置为以下地址：

| 入口 | 地址 |
| --- | --- |
| 首页工作台 | `https://lifeyoume.icu/video/zhizhu/?from=official-account` |
| 商品内容包 | `https://lifeyoume.icu/video/zhizhu/?from=official-account&tool=product` |
| 公众号文章助手 | `https://lifeyoume.icu/video/zhizhu/?from=official-account&tool=article` |
| 朋友圈与社群助手 | `https://lifeyoume.icu/video/zhizhu/?from=official-account&tool=social` |

页面会根据 `tool` 参数直接打开对应工具，并从共享接口读取当前价格。

## 小程序共享入口

小程序 `apps/miniapp` 的工作台直接调用：

```text
https://lifeyoume.icu/video/api/assistant/generate
```

公众号文章助手入口从小程序“我的”页面打开共享 Web 工作台，地址为：

```text
https://lifeyoume.icu/video/zhizhu/?from=miniapp&tool=article
```

## 统一配置接口

```text
GET /video/api/assistant/config
```

返回三类工具价格、Web 地址、小程序标识和公众号入口。后台修改价格后，Web 和小程序重新加载配置即可同步。

## 尚未接入的微信能力

- 微信虚拟支付需要真实小程序 AppID、OfferID、现网 AppKey 和道具配置。
- 当前小程序不会伪造支付成功；配置完成后再接入 `Taro.requestPayment`。
- 公众号菜单发布需要在公众号后台完成保存和发布。
