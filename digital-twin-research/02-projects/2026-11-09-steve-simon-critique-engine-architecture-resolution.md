# Steve Simon Critique engine 架构解析与 ELG-11 裁决

日期：2026-11-09
访问日期：2026-11-09
状态：公开运行架构已解析；P01 触发 `ELG-11` 并转观察；未上传图片、未付款、未联系任何人

## 裁决

1. **Steve Simon 触发 `ELG-11`。** `Passionate Photographer Critiques`
   是过去 24 个月内公开 beta、当前公开销售的同专家、同垂直 AI coach。
2. **这不是根据 `engine` 一词推断。** 公开主页、提交页、条款、隐私页、样例页
   和前端调用共同直接证明：系统用 Anthropic 模型读取照片和文字输入，按
   `Steve Simon Critique Framework` 自动生成摄影点评，并在自动检查通过后
   直接交付；Steve 不逐条本人复核。
3. **Steve 的材料和人格方法被明确绑定。** 主页称系统建立在 Steve 的教学、
   书籍和大量录制点评之上，询问他会问的问题；条款称自动系统由 Steve 的教学
   塑造；beta testimonial 明确感知到 “Steve Simon experience”、他的声音和
   判断方式。
4. **产品已跨过概念、预览和免费测试。** 当前公开价格为单张 9 美元、5 张
   35 美元、Strongest Frame 15 美元；另售 5 credits/35 美元和
   25 credits/125 美元。首张可免费，但公开 checkout、credit 和退款机制均已
   建立。
5. **P01 从 `wave_1` 转入 `P-OBS01`。** 不能靠主域名当前超时、改文案、
   临时下线、排除既有用户或另建实验落地页修复既有报价和身份暴露污染。
6. **该裁决不证明产品成功。** 公开资料没有付款人数、付费转化、重复使用、
   退款率、30/90 天留存、人工减负或摄影改进的独立数据。
7. **P02 Karl Taylor 不自动补位。** 必须按交易、本人容量、AI 暴露、图片
   权利和中立认知完成独立专项审计。

## 直接运行证据

### 公开产品与价格

可访问的 Render 部署为：

- [主页](https://passionate-photographer-critiques.onrender.com/)
- [提交页](https://passionate-photographer-critiques.onrender.com/start)
- [样例页](https://passionate-photographer-critiques.onrender.com/sample)
- [credits](https://passionate-photographer-critiques.onrender.com/credits)
- [隐私页](https://passionate-photographer-critiques.onrender.com/privacy)
- [条款](https://passionate-photographer-critiques.onrender.com/terms)

主页和提交页当前公开：

| 产品 | 价格 | 公开交付 |
| --- | ---: | --- |
| 单张 written critique | 9 美元；首张免费 | AI 自动生成，通常 3–5 分钟 |
| 五张独立 critique | 35 美元 | AI 自动生成，通常 15–20 分钟 |
| Strongest Frame | 15 美元或 2 credits | 比较 2–5 张并选出最强帧 |
| 5 credits | 35 美元 | 每张 7 美元 |
| 25 credits | 125 美元 | 每张 5 美元 |

条款还规定七天 usefulness guarantee、未使用 credits 退款和 Stripe 支付。
这证明公开报价与交易机制，不证明任何支付已成功。

### 模型、材料与自动交付

主页直接披露：

- Critique engine 建立在 Steve 的教学、书籍和大量录制点评之上。
- 系统询问 Steve 会问的问题，并给出“像他在 workshop 中会给的”反馈。
- 照片先被独立描述，再经过三次 portfolio 判断、正式 critique 和逐项图片
  核对；五张模式还会跨图查找习惯。
- 页面称模型为 Anthropic `Claude Fable 5.1`，单张通常运行 3–5 分钟。

提交页再次披露：

- 照片和不含身份的提交信息由 Anthropic 模型处理。
- 自动 critique 不经 Steve 逐条本人复核。
- 最终页面注明输出使用 `Steve Simon Critique Framework`。

公开前端 `start.js` 进一步显示：

1. `POST /api/orders` 创建订单。
2. 原图上传至 `/api/orders/{token}/images/{n}`。
3. 浏览器另做最长约 1568 px 的 JPEG，上传至
   `/api/orders/{token}/images/{n}/engine`。
4. `/submit` 固化订单，付款或免费验证后 `/process` 启动处理。
5. 状态从 `paid`、`in_review` 到 `ready`；通过自动检查后网页和邮件交付。

未提交任何图片，也未触发订单或支付。以上只使用公开 HTML、JavaScript 和
静态页面。

### 样例与 beta

样例页公开四份完整输出，并明确：

- 四份 critique 都由当前 engine 从照片和给定 context 生成。
- 页面按原样展示输出。
- Steve 从多次运行中挑选这四份。

主页和样例页还有实名 beta testimonial，用户称输出像 Steve、接近
“Steve Simon experience”，并表示愿意再次使用。它们证明 beta 已有人试用，
但属于产品方选取的 testimonial，不提供 beta 分母、复用率或付费。

## `ELG-11` 逐项映射

| 门禁要素 | 直接证据 | 判定 |
| --- | --- | --- |
| 过去 24 个月 | 域名 2026-10-02 注册，2026-10-20 私有预览，当前公开销售 | 通过 |
| 本人姓名或品牌 | 产品标题、主页、framework 和 testimonial 均绑定 Steve | 通过 |
| 本人课程或方法 | 教学、书籍、大量录制 critique 和看图方法明确进入 engine | 通过 |
| 同垂直 | 输入为摄影作品，输出为构图、注意、后期和下一次拍摄建议 | 通过 |
| AI clone/coach | Anthropic 多模态模型自动生成个性化 critique | 通过 |
| 公开销售、捆绑或 beta 分发 | 免费首单、美元定价、credits、Stripe 和 beta testimonial | 通过 |
| 既有报价与身份暴露 | 价格、Steve 身份、方法来源和“像 Steve”均在购买前可见 | 通过 |

因此不存在继续保留
`public_product_architecture_unresolved` 的事实基础。

## 数据与权利路径

隐私页当前公开：

- 收集姓名、邮箱、输入答案、原图、浏览器缩小副本、草稿和交付结果。
- 原图和答案发送给 Anthropic，但不发送姓名和邮箱。
- Anthropic 商业条款下不用于训练，并称最长 30 天删除，法定或滥用例外除外。
- Render 美国服务器保存数据库和图片；Resend 发邮件；Stripe 收款；
  Mailchimp 仅在用户勾选后接收 newsletter 信息。
- 订单图片、答案和 critique 默认保留 90 天。
- 用户可选允许 Steve 私下保留照片用于未来版本测试；未给测试照片固定期限，
  但允许随时请求删除。
- beta 期间 Steve 会阅读已交付 critique 以改进系统。

这比 PhotoEducate 的旧通用模板完整，但仍有公开缺口：

- 条款仍保留 `[Add any content you will not accept.]` 草稿占位。
- 条款日期仍为 `[date]`，隐私页也保留让顾问确认地区权利的占位。
- Terms/Privacy 页面被 `noindex`，主页和提交页没有可见政策链接。
- 未明确未成年人、私密场所、委托作品、模型区域、生物识别、测试样本最长
  保留期及 Steve 历史录音和书籍的模型使用授权链。

这些缺口影响产品治理，但不改变 `ELG-11` 裁决。

## 运行与域名状态

- `passionatecritique.com` 当前 A 记录为 Render IP `216.24.57.1`。
- 证书透明度记录显示 2026-10-03 和 2026-10-19 已为 apex 与 `www` 发证。
- urlscan 的 2026-10-20 记录显示 Render 私有预览。
- 当前从研究环境访问主域名仍超时。
- 同一产品的 `passionate-photographer-critiques.onrender.com` 公开部署返回
  200，页面、表单、价格、政策和静态 JavaScript 完整可用。

主域名绑定故障不能覆盖可访问 Render 部署的直接产品证据。

## X-012 影响

- Steve 不再是 X-012 干净身份实验候选。
- 已有同专家、同垂直、同输入形态和公开价格，使参与者在实验前后都可能带入
  产品认知、价格锚点和既有使用经验。
- 该污染位于专家层，不是只排除几个已知 beta 用户就能消除。
- Steve 可保留为观察样本，后续研究真实付款、复用、留存、人工减负和图片
  改进，但不得计入 X-012 的 `0/3`。
- P02 Karl Taylor 只能在独立完整审计后保持备选或进入后续资格，不继承
  Steve 的任何分数或门禁结果。

## 当前计数

- 外部联系：0。
- 人工回应：0。
- 渠道预筛：0。
- 支出：0 美元。
- 资格专家：0/3。
- 参与者：0/240。
- 自然支付：0。

## 主要来源

- [Passionate Photographer Critiques 主页](https://passionate-photographer-critiques.onrender.com/)
- [提交页](https://passionate-photographer-critiques.onrender.com/start)
- [样例页](https://passionate-photographer-critiques.onrender.com/sample)
- [credits](https://passionate-photographer-critiques.onrender.com/credits)
- [隐私页](https://passionate-photographer-critiques.onrender.com/privacy)
- [条款](https://passionate-photographer-critiques.onrender.com/terms)
- [公开 start.js](https://passionate-photographer-critiques.onrender.com/static/live/start.js)
- [PhotoEducate 首页](https://photoeducate.com/)
- [Verisign RDAP](https://rdap.verisign.com/com/v1/domain/PASSIONATECRITIQUE.COM)
- [urlscan 历史记录](https://urlscan.io/result/01a156ec-1992-7639-9c4a-77ca001d3050)
