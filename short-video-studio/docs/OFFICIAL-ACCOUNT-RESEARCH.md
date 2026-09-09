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

## 可复用的视觉规则

- 封面采用公众号常见的 `2.35:1` 比例，本项目首篇为 `900×383`。
- 正文字号控制在 `15px` 左右，正文使用深灰色，不使用刺眼的纯黑。
- 行高约 `1.75–1.9`，段落之间保留明显留白。
- 小标题使用固定品牌色、左侧色条和较大的上下间距。
- 引用使用浅色背景和左侧强调线，不把整篇文章做成密集卡片。
- 列表只承载可执行步骤，避免为了“炫”堆叠装饰。
- 文章结尾只保留一个低压力 CTA，先交付内容，再介绍工具。

## 参考

- [md2wechat：Markdown 转微信公众号主题与草稿工作流](https://www.md2wechat.cn/)
- [MoPai 墨排：多主题 Markdown 公众号编辑器](https://github.com/ye4wzp/mopai-markdown)
- [公众号 Markdown 编辑器：主题、图片和富文本复制](https://github.com/imyouhu/huasheng_editor)
- [135 编辑器：公众号字体、行高和配色建议](http://www.135editor.com/essences/11100.html)

## 本项目落地

- 原稿：`content/official-account/*.md`
- 渲染器：`lib/official-account-markdown.mjs`
- 首篇样稿：`content/official-account/001-normal-product-7-videos.md`
- 首篇头图：`public/official-covers/001-normal-product-7-videos.jpg`
- 发布器：`scripts/official-account-publisher.mjs`
- 发布默认关闭，必须通过预览验收后显式开启。
