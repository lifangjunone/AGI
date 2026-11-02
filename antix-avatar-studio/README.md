# Second Me

一套包含分身、记忆、对话与内容创作的数字分身操作系统。产品名为 **Second Me**，支持简体中文与 English，默认简体中文。

## 运行

```bash
npm install
npm run dev
```

然后打开终端显示的本地地址。

## 生产环境

- 地址：<https://lifeyoume.icu/second-me/>
- 静态服务：`second-me.service`，监听 `127.0.0.1:4395`
- 发布目录：`/data/app/second-me/releases/`
- 当前版本：`/data/app/second-me/current`
- 共享 Nginx 仅包含本产品的 `/second-me` 与 `/second-me/` 路由。

## 已实现

- 总览控制中心与全局搜索
- 多分身创建、编辑和删除
- 卡片“开始对话”绑定所选分身；工作室可切换当前分身，选择刷新后恢复
- 对话记录按分身隔离；升级前的共用记录只归属于原来的第一个分身
- 实时工作室、连续对话和服务端 MaaS 分句语音；语音失败不会阻断文字回复
- 长期记忆训练、删除与 JSON 导出
- 帖子、口播稿、邮件等内容生成与复制
- 声音、语言、生成质量和隐私设置
- 完整本地持久化与响应式布局
- 默认简体中文，可切换 English；语言选择刷新后保留
- 免费体验 3 次真实对话，之后登录统一账号开通使用权
- 个人收款码 + 手机确认收款：¥0.9 / 7 天，单次购买、手动续费、不自动扣款
- 隐藏管理页 `/admin/manual-payments?token=...` 可在手机上确认到账并发放 7 天权益

分身、人格、记忆、对话、声音与优化后的头像现在会同步保存到 Second Me
服务端 SQLite。登录用户按统一账号 ID 隔离，未登录用户按安全匿名 Cookie
隔离；浏览器 `localStorage` 仅作为离线缓存。首次升级会把仍存在的本地工作区
自动迁移到服务端，刷新或清空本地缓存后会从服务端恢复。

## MaaS 语音配置

Second Me 只在服务端持有 MaaS Key。生产 Secret 位于
`/etc/second-me/model.env`，不得提交到仓库或下发浏览器：

- `SECOND_ME_MAAS_TTS_URL=https://maas.lifeyoume.icu/v1/audio/speech`
- `SECOND_ME_MAAS_TTS_KEY`：Second Me 专属服务 Key
- `SECOND_ME_TTS_MODEL=lym-tts-realtime`
- `SECOND_ME_TTS_VOICE=voice-1`
- `SECOND_ME_TTS_SPEED=1`

聊天接口先返回文字和一个五分钟有效、不可猜测的语音计划。浏览器按句请求
`POST /api/speech`，服务端验证计划后代理 MaaS；浏览器不能提交任意 TTS 文本，
也接触不到 MaaS Key。

分身编辑器提供五种真实 Runtime 音色，并按女声、男声与中性分组。选择音色会
调用受限的 `POST /api/speech/preview` 自动播放固定试听句；该接口不接受任意
文本，生成结果在 Second Me 进程内缓存。保存后，分身的真实聊天语音使用所选
`voice-0` 至 `voice-4`，旧的 Yunxi、Xiaoxiao 和 Narrator 本地数据会自动迁移。

## 手动收款配置

生产环境默认使用 `manual-mobile` 模式，不接正式商户 API：

- `SECOND_ME_PAYMENT_MODE=manual-mobile`
- `SECOND_ME_MANUAL_PAY_QR=/etc/second-me/manual-pay-qr.png`
- `SECOND_ME_ADMIN_TOKEN` 放在 `/etc/second-me/model.env`，不要提交到代码仓库

用户付款流程：

1. 免费 3 次真实对话用完后，弹出付费墙。
2. 用户登录 LifeYouMe 统一账号。
3. 用户扫码支付 ¥0.90，并在备注/留言填写订单短码。
4. 店主在手机打开 `/second-me/admin/manual-payments?token=...`，核对到账后点击确认。
5. 系统发放 7 天使用权；用户页面轮询到确认状态后自动解锁。
