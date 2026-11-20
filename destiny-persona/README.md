# 命运分身今日时运

中文轻量 H5 产品。用户填写昵称和生日后进入独立今日卡页面，按北京时间当天六十甲子日柱生成整体、事业、关系、财运、行动、心绪六张不重复时运卡。结果页支持切卡、复制签文和保存 PNG。

## 本地运行

```bash
python3 -m venv .venv
.venv/bin/pip install .
PORT=45560 .venv/bin/python app/server.py
```

打开：

- `http://127.0.0.1:45560/destiny-persona/`
- `http://127.0.0.1:45560/destiny-persona/health`

## 产品边界

- 娱乐与自我观察用途，不提供医学、心理诊断或真实命理承诺；
- 不保存完整昵称、生日、主题或原始测算输入；
- 保存匿名访客额度与脱敏记录，不在页面展示用户热榜；
- 结果由本地确定性算法生成，不依赖外部模型或数据库；
- 同一输入在同一天会稳定得到相同卡组，便于分享和复测；
- 每位匿名访客先使用 3 次免费额度，之后可购买支付宝次数包；
- 灵感包 ¥6.90 / 10 次，常用包 ¥19.90 / 50 次；
- 只有支付宝异步通知验签或服务端主动查单确认成功后才增加次数，到账操作幂等；
- 支付订单 15 分钟有效；支付宝回跳后自动查单，短时轮询到账，无需手动刷新；
- 异步通知地址默认由受保护的 `PUBLIC_ORIGIN` 生成，生产环境必须使用 HTTPS；
- 未配置生产支付宝应用时，套餐仍可见，但付款按钮保持禁用，不以沙箱模拟真实收款。

## 支付配置

生产环境通过受保护的环境变量提供：

```text
PUBLIC_ORIGIN=https://lifeyoume.icu
ALIPAY_APP_ID=...
ALIPAY_APP_PRIVATE_KEY=...
ALIPAY_PUBLIC_KEY=...
ALIPAY_SELLER_ID=...
ALIPAY_NOTIFY_URL=https://lifeyoume.icu/destiny-persona/api/billing/notify
```

`ALIPAY_SELLER_ID` 可由 `ALIPAY_SELLER_EMAIL` 替代。应用私钥只存放在服务器受保护配置中，不提交仓库，也不要发送给 Agent。正式上线收款前还必须在支付宝完成 AI 网页应用收款产品开通及生产应用上线。

## 线上路径

线上地址：

- `https://lifeyoume.icu/destiny-persona/`
