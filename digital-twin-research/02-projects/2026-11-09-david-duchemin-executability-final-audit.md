# P05 David duChemin 最终可执行性审计

日期：2026-11-09
访问日期：2026-11-09
状态：公开资料审计完成；未联系、未付款、未预约、未招募

## 审计问题

1. `one-on-one.net` 的 Book CTA 是否连接真实、可支付的当前预约。
2. 未来 30 天公开日历是否至少容纳 40 次本人服务。
3. 公开排期是否支持 X-012 的 24 小时目标时限。
4. 最近 12 个月是否有 50 位唯一成功付款人的直接或足够强代理证据。
5. 图片、肖像、EXIF、Zoom 录像、匿名展示、AI 处理、保留和删除是否已有可用授权。

## 结论

1. **当前交易入口成立。** `one-on-one.net` 的 Book CTA 指向 David 本人的
   Calendly event。公开 event metadata 显示 60 分钟、solo、Zoom、Stripe
   349 美元，付款条款为不退款，改期须提前 14 天。
2. **30 天公开总容量从“不可见”更正为“当前支持”。** 以 David 的
   `America/Los_Angeles` 时区查询 2026-11-09 至 2026-12-08，公开日历显示
   10 个开放日。Calendly 对 60 分钟服务每 30 分钟给一个起始时间；去除重叠
   后最多可容纳 55 次 60 分钟 session，超过 X-012 的 40 次月度量级。
3. **24 小时目标时限仍未通过。** 开放日集中在周二至周四，存在超过 4 天
   没有同步 slot 的区间。公开日历证明的是当前可预约总量，不证明异步短签认、
   周末覆盖、收到材料后 24 小时返回，也不证明 David 愿意把这些 slot 分配给
   实验。
4. **`ELG-01` 仍失败。** 销售页有 7 名具名 testimonial，Kerry Gordon 明确
   表示多年内做过多次一对一；但 testimonial 无日期、订单、付款状态和退款
   分母。站点 sitemap 的页面最后更新时间为 2025-05-07，早于本轮
   2025-11-09 至 2026-11-09 的 12 个月窗口，不能证明窗口内任何一笔交易。
5. **图片工作流存在，权利矩阵不存在。** Calendly 最终表单询问辅导需求、
   作品网址，并称确认邮件会提供图片提交链接。Calendly 条款把表单内容定义为
   David 控制的 Customer Data，并要求 Customer 自行取得所需权利和同意。
   图片提交目标、图片条款和录像条款在付款前不可见。
6. **通用隐私政策不能替代实验授权。** David 主站政策支持访问、更正和删除
   个人信息，也说明 Stripe 等服务商处理交易；但没有图片、肖像、EXIF、
   session 录像、AI 供应商、训练禁用、匿名展示、固定保留期或删除 SLA。
7. **P05 不进入 Wave 1。** 状态更新为
   `public_monthly_capacity_supported / public_24h_sla_unproven /
   image_and_recording_rights_unproven / neutral_recognition_unproven`。
   必须先取得 50 位/12 月交易证据、本人实验意愿、5 份计时校准、24 小时书面
   排期、完整权利矩阵和中立 40/40；摄影 Wave 1 继续为空。

## 预订与付款链路

### 当前公开端点

- 销售页 CTA：
  `https://calendly.com/davidduchemin/mentor`
- Event 名称：`60-min Mentoring Call with David duChemin`
- Event 类型：solo
- 时长：60 分钟
- 地点：Zoom
- 付款：Stripe，349 美元
- 付款条款：不退款；改期须提前 14 天；no-show 不改期、不退款
- 自定义问题：
  - 需要什么帮助。
  - 是否有网站或社交账号供查看。
  - 是否会在会前通过确认邮件中的链接提交图片。

这比销售页文案更强地证明当前 checkout 配置和图片工作流存在，但仍没有创建
预约、提交表单或付款，因此自然支付计数保持 0。

## 30 天容量复核

公开 range endpoint 查询窗口：

- 起点：2026-11-09
- 终点：2026-12-08
- 主时区：`America/Los_Angeles`
- 服务时长：60 分钟
- 起始间隔：30 分钟

| 主时区日期 | 可见起始时间数 | 去重叠后的最多 session |
| --- | ---: | ---: |
| 2026-11-17 | 9 | 5 |
| 2026-11-18 | 15 | 8 |
| 2026-11-19 | 1 | 1 |
| 2026-11-24 | 9 | 5 |
| 2026-11-25 | 15 | 8 |
| 2026-11-26 | 9 | 5 |
| 2026-12-01 | 9 | 5 |
| 2026-12-02 | 15 | 8 |
| 2026-12-03 | 9 | 5 |
| 2026-12-08 | 9 | 5 |
| **合计** | **100** | **55** |

计算只把相差至少 60 分钟的起始时间视为可同时成交，避免把 30 分钟重叠选项
重复计数。55 是访问时点的理论上限，不是保留容量、履约承诺或已完成 session。

### 对 24 小时目标的含义

- 排期按周二至周四集中，不是每日开放。
- 周四最后一场之后到下周二首场之间存在超过 4 天的同步服务空档。
- X-012 的签认可能比 60 分钟 session 短，也可能异步完成；公开日历无法证明
  David 会在未开放时段处理它。

因此月度总量有正面公开证据，24 小时履约仍必须用书面承诺和 5 份正式 rubric
计时校准验证。

## 交易与重复使用

销售页共有 7 名具名 testimonial：

- Cindy Mirabella
- Mark Hayward
- Ann Tyer
- Kerry Gordon
- Brittany Blake
- Rodrigo Caetano
- Erica Everhart

其中 Kerry 明确称“多年内做过多次一对一”；Cindy 的个人网站也独立称 David
曾长期指导她。两者支持服务真实存在和重复使用先验，但不能转化为付款证据：

- 没有 testimonial 日期。
- 没有订单、付款、退款或唯一客户字段。
- 没有证明服务是在本轮 12 个月窗口内发生。
- 页面 sitemap 最后更新时间为 2025-05-07，不能把现有 testimonial 当作
  2025-11-09 之后新增。

因此只记录“7 名具名历史 testimonial、至少 1 名明确重复使用”，
`ELG-01` 的成功付款分母仍为未知。

## 数据与权利链

| 数据 | 当前公开处理 | X-012 缺口 |
| --- | --- | --- |
| 姓名、邮箱 | Calendly 最终表单必填 | 实验角色、访问者、保留和删除 SLA |
| 辅导需求 | 必填自由文本 | 敏感内容限制和最小化 |
| 网站/社交链接 | 可选 | 抓取范围、第三方内容权利 |
| 图片 | 确认邮件后另行提交 | 提交目标、肖像、版权、EXIF、AI、匿名和删除 |
| Zoom 音视频 | 每次 session 含客户可保留录像 | 录制同意、谁保存、访问、保留和再利用 |
| 支付 | Calendly + Stripe | 实验退款规则和财务数据隔离 |

Calendly Participant Terms 只解决平台与预约参与者之间的控制关系：David 作为
Customer 控制 Customer Data，并负责取得权限。它没有授予 X-012 使用图片、
录像或历史材料的权利。David 主站隐私政策也只是通用交易政策，未覆盖实验。

## 门槛裁决

| 门槛 | 裁决 | 证据 |
| --- | --- | --- |
| 当前付费入口 | 通过公开预核验 | 活跃 Calendly + Stripe 349 美元 |
| 本人交付 | 通过公开预核验 | solo、David 本人、Zoom |
| 50 位/12 月 | 未通过 | testimonial 无窗口和支付分母 |
| 40 次/30 天总量 | 公开支持，不等于承诺 | 55 个不重叠 60 分钟理论容量 |
| 24 小时目标时限 | 未通过 | 周期性空档超过 4 天 |
| 5 份计时校准 | 未开始 | 0/5 |
| 图片与录像权利 | 未通过 | 无独立矩阵 |
| AI 暴露 | 当前未触发 | 延续 P05/P06 审计 |
| 中立 40/40 | 未开始 | 0 预筛 |
| 本人合作意愿 | 未知 | 0 联系、0 回应 |

## 当前计数

- 外部联系：0。
- 人工回应：0。
- 渠道预筛：0。
- 支出：0 美元。
- 资格专家：0/3。
- 参与者：0/240。
- 自然支付：0。

## 主要来源

- [David 1:1 销售页](https://www.one-on-one.net/)
- [David 1:1 sitemap](https://www.one-on-one.net/sitemap.xml)
- [David Calendly event](https://calendly.com/davidduchemin/mentor)
- [Calendly event metadata](https://calendly.com/api/booking/event_types/lookup?event_type_slug=mentor&profile_slug=davidduchemin)
- [Calendly 30 天公开日历](https://calendly.com/api/booking/event_types/GCAF6P5YAOWNTMFQ/calendar/range?timezone=America%2FLos_Angeles&diagnostics=false&range_start=2026-11-09&range_end=2026-12-08&scheduling_link_uuid=hqb-3nc-wjj)
- [David 主站隐私政策](https://davidduchemin.com/privacy-policy/)
- [Calendly Participant Terms](https://calendly.com/legal/participant-terms-conditions)
- [Calendly Privacy Notice](https://calendly.com/legal/privacy-notice)
- [Cindy Mirabella About](https://cindymirabella.com/about-cindy)
