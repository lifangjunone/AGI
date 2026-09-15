# ResumeForge / 简历锻造厂

面向目标岗位的证据化简历工作台。把 JD、真实经历和量化结果组织成 ATS 可读的一页简历。

## 当前能力

- 编辑个人资料、职业摘要、技能、教育和多段工作经历。
- 从目标岗位 JD 提取关键词，展示命中、缺失和可解释匹配分。
- 按动作词、数字证据、业务影响和长度检查每条经历要点。
- 用动作、任务、数字和结果字段生成不虚构的成果描述。
- 实时生成单栏 A4 预览，判断一页风险并导出可打印 HTML。
- 手机端在编辑、预览和诊断之间切换。
- 草稿仅保存在当前浏览器。
- 公网版可识别 LifeYouMe 统一账号，但不把简历内容上传到账号服务。
- 与 FDE Playbook、English Speaking Coach、English Immersion Studio 和 English Foundation 组成求职成长产品线。

## 运行

```bash
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173/`

构建并部署到 LifeYouMe `/resume/`：

```bash
npm run build:portal
npm run deploy
```

## 验证

```bash
npm test
npm run test:e2e
npm run build
```

## 产品边界

- 当前不调用模型 API，不会自动补造工作经历或业绩数据。
- 当前没有产品自建账号、云端简历存储、招聘网站自动投递或真实支付。
- 统一计费服务已预留 `resume-forge` 产品边界，但平台当前
  `checkout_enabled=false`，不得展示或宣称 Pro 已可购买。
- HTML 导出可在浏览器中打印为文本可检索的 PDF。

产品定义、需求和路线图位于 [`.planning/`](.planning/)。
