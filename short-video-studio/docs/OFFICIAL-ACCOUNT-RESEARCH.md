# 公众号内容与排版调研

## 结论

成熟的 Markdown 公众号工具和运营案例普遍采用：

```text
Markdown 管理原稿
→ 主题渲染为微信兼容 HTML
→ 统一封面与正文视觉系统
→ 浏览器/手机预览
→ 创建草稿
→ 人工或授权后发布
```

Markdown 不是直接粘到公众号编辑器里，而是作为结构化写作格式，经过转换后生成带内联样式的富文本。

参考文章《用了 Pi 一个月，我把 Claude Code 客户端删了》的实际结构也验证了这一点：

- 标题先给出冲突和明确结果；
- 标题下方保留作者、时间和原创信息；
- 首屏使用一张带观点文字的横版视觉，不使用无关装饰图；
- 开头用一句个人体验钩住读者；
- 正文以编号章节推进，重点句用颜色强调；
- 图片、代码和列表只在解释问题时出现；
- 结尾再做轻量互动或工具引导。

## 可复用的视觉规则

- 封面采用公众号常见的 `2.35:1` 比例，本项目首篇为 `900×383`。
- 正文字号控制在 `15px` 左右，正文使用深灰色，不使用刺眼的纯黑。
- 行高约 `1.75–1.9`，段落之间保留明显留白。
- 小标题使用固定品牌色、左侧色条和较大的上下间距。
- 引用使用浅色背景和左侧强调线，不把整篇文章做成密集卡片。
- 列表只承载可执行步骤，避免为了“炫”堆叠装饰。
- 正文至少插入 3 张与内容相关的图片，分别承担场景、解释和行动清单的视觉分段作用，避免连续文字造成阅读疲劳。
- 正文图片必须是 3 张不同图片；渲染器和发布器同时校验总数与去重后的数量。
- 文章结尾只保留一个低压力 CTA，先交付内容，再介绍工具。
- 首篇 CTA 必须同时提供产品目录和直接体验入口：
  `https://lifeyoume.icu/products` 与 `https://lifeyoume.icu/video/`。

## 参考

- [md2wechat：Markdown 转微信公众号主题与草稿工作流](https://www.md2wechat.cn/)
- [MoPai 墨排：多主题 Markdown 公众号编辑器](https://github.com/ye4wzp/mopai-markdown)
- [公众号 Markdown 编辑器：主题、图片和富文本复制](https://github.com/imyouhu/huasheng_editor)
- [135 编辑器：公众号字体、行高和配色建议](http://www.135editor.com/essences/11100.html)

## 本项目落地

- 原稿：`content/official-account/*.md`
- 渲染器：`lib/official-account-markdown.mjs`
- 首篇样稿：`content/official-account/001-normal-product-7-videos.md`
- 首篇头图：`public/official-covers/001-normal-product-7-videos-hero.png`
- 发布器：`scripts/official-account-publisher.mjs`
- 发布默认关闭，必须通过预览验收后显式开启。
