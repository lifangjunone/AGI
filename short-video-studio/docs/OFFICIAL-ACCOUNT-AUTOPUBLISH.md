# 公众号自动发布

`scripts/official-account-publisher.mjs` 使用 Playwright 持久化浏览器登录态，每天生成一篇结构化文章，填写公众号编辑器、上传封面并提交发布。

发布器默认关闭发布动作。只有在完成内容验收后，明确设置 `WECHAT_PUBLISHER_ENABLE=1` 才会点击“发表”。

## 首次初始化

```bash
npm install
WECHAT_PUBLISHER_HEADLESS=0 node scripts/official-account-publisher.mjs
```

只预览首篇 Markdown 文章，不发布：

```bash
WECHAT_PUBLISHER_ENABLE=1 \
WECHAT_PUBLISHER_MODE=preview \
WECHAT_PUBLISHER_ARTICLE_INDEX=0 \
WECHAT_PUBLISHER_HEADLESS=0 \
npm run official:publish
```

第一次运行需要在公众号后台完成登录或扫码。登录态保存在：

```text
~/Library/Application Support/LifeYouMe/wechat-official-publisher
```

## 定时运行

```bash
bash scripts/install-official-account-publisher.sh
```

默认每天北京时间 08:30 和 17:30 各执行一次。两个时段使用不同选题，并按日期与时段分别去重。日志位于：

```text
~/Library/Logs/LifeYouMe/official-account-publisher.log
~/Library/Logs/LifeYouMe/official-account-publisher.error.log
```

## 运行边界

- 公众号平台出现二维码、验证码、风控确认或登录过期时，任务会失败并写入日志，不会伪造发布成功。
- 文章使用语义化标题、段落、列表和引用，避免将 HTML 当作纯文本塞入编辑器。
- 每篇正文必须包含至少 3 张图片；图片数量不足时发布器直接失败。
- `runs.jsonl` 只记录日期、状态、标题和错误，不记录 AppSecret。
- 自动发布能力依赖公众号账号当前的后台权限和平台风控策略。
