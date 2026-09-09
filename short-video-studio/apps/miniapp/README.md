# 智助乖乖小程序

这是与 `short-video-studio` 共享生成能力的 Taro 4 微信小程序端。

## 当前能力

- 原生三 Tab：工作台、生成记录、我的。
- 商品内容包、公众号文章、朋友圈与社群三类工具。
- 小程序端通过 HTTPS 调用 `https://lifeyoume.icu/video/api/assistant/generate`。
- 非微信预览使用本地 mock，生成记录保存在本地缓存。
- 完整内容包价格展示已接入，微信虚拟支付按钮保留官方支付接入位，未伪造已开通状态。

## 目录

```text
src/
├── pages/index/       # 工作台
├── pages/records/     # 生成记录
├── pages/profile/     # 我的
├── services/          # 共享 API
├── data/              # H5 mock
└── assets/tabbar/     # 原生 TabBar SVG 图标
```

项目模板使用 Taro 4.1.9，当前 `project.config.json` 仍使用模板 `touristappid`，接入用户小程序时需要替换为真实 AppID。
