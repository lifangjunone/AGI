export type PackageTier = {
  name: string;
  price: number;
  description: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type Offer = {
  sellerName: string;
  serviceName: string;
  audience: string;
  promise: string;
  proof: string;
  contactLabel: string;
  contactValue: string;
  ctaText: string;
  caseStudy: string;
  guarantee: string;
  faqs: FaqItem[];
  deliverables: string[];
  deliveryDays: number;
  hoursPerOrder: number;
  targetHourlyRate: number;
  monthlyCapacity: number;
  packages: [PackageTier, PackageTier, PackageTier];
};

export const templates: Record<string, Offer> = {
  career: {
    sellerName: "林晓",
    serviceName: "大厂产品经理简历诊断",
    audience: "准备冲刺大厂产品岗位、投递后反馈少的 1-5 年职场人",
    promise: "把经历改写成招聘方 30 秒能看懂的业务价值",
    proof: "8 年互联网产品经验，参与筛选 300+ 份产品简历",
    contactLabel: "微信",
    contactValue: "linxiao-career",
    ctaText: "预约一个名额",
    caseStudy: "一位连续投递 20 份简历无反馈的产品经理，重构项目表达后一周获得 3 次面试。",
    guarantee: "首次交付后 7 天内，可免费补充一次针对目标岗位的调整。",
    faqs: [
      { question: "需要准备什么？", answer: "现有简历和 1-3 个目标岗位链接。" },
      { question: "会代写经历吗？", answer: "不会虚构经历，只重构真实经验的表达。" },
    ],
    deliverables: ["逐段问题批注", "一版结构重排建议", "30 分钟语音复盘"],
    deliveryDays: 2,
    hoursPerOrder: 1.5,
    targetHourlyRate: 120,
    monthlyCapacity: 20,
    packages: [
      { name: "快速诊断", price: 39, description: "3 个关键问题 + 修改方向" },
      { name: "完整精修", price: 199, description: "逐段批注 + 结构方案 + 复盘" },
      { name: "求职冲刺", price: 599, description: "精修 + 模拟面试 + 7 天答疑" },
    ],
  },
  design: {
    sellerName: "你的名字",
    serviceName: "小红书首图焕新",
    audience: "内容稳定但点击率偏低的知识型博主",
    promise: "48 小时交付 3 套更清晰、更有辨识度的首图方案",
    proof: "专注内容视觉设计，熟悉知识类账号的信息层级",
    contactLabel: "微信",
    contactValue: "design-with-me",
    ctaText: "咨询档期",
    caseStudy: "知识类账号更换首图体系后，连续 8 篇内容的平均点击率提升 31%。",
    guarantee: "首版不满意可在原方向上免费修改一次。",
    faqs: [
      { question: "可以加急吗？", answer: "可先沟通档期，加急费用单独确认。" },
      { question: "包含源文件吗？", answer: "标准包与月度包包含可编辑源文件。" },
    ],
    deliverables: ["3 套首图方案", "可编辑源文件", "1 次免费修改"],
    deliveryDays: 2,
    hoursPerOrder: 2,
    targetHourlyRate: 100,
    monthlyCapacity: 16,
    packages: [
      { name: "试单", price: 59, description: "1 张首图，1 次修改" },
      { name: "标准包", price: 229, description: "3 张首图 + 源文件" },
      { name: "月度包", price: 799, description: "12 张首图 + 视觉规范" },
    ],
  },
  automation: {
    sellerName: "你的名字",
    serviceName: "AI 工作流效率诊断",
    audience: "每天被重复表格、周报和资料整理占用 2 小时以上的团队",
    promise: "找出 3 个可自动化环节，并交付一条能立即运行的工作流",
    proof: "专注 AI 自动化落地，以可运行结果而非概念报告交付",
    contactLabel: "邮箱",
    contactValue: "hello@example.com",
    ctaText: "预约诊断",
    caseStudy: "曾将每周 6 小时的手工汇总流程压缩到 40 分钟，并保留人工复核节点。",
    guarantee: "交付后 14 天内提供一次工作流故障排查。",
    faqs: [
      { question: "需要购买新软件吗？", answer: "优先复用现有工具，新增成本会在实施前确认。" },
      { question: "数据会上传吗？", answer: "诊断阶段只读取流程信息，不要求提交生产数据。" },
    ],
    deliverables: ["60 分钟流程访谈", "自动化机会清单", "1 条可运行工作流"],
    deliveryDays: 5,
    hoursPerOrder: 4,
    targetHourlyRate: 300,
    monthlyCapacity: 8,
    packages: [
      { name: "诊断", price: 199, description: "流程访谈 + 机会清单" },
      { name: "落地", price: 1299, description: "诊断 + 1 条工作流" },
      { name: "陪跑", price: 3999, description: "3 条工作流 + 30 天优化" },
    ],
  },
};

export const emptyOffer: Offer = {
  sellerName: "",
  serviceName: "",
  audience: "",
  promise: "",
  proof: "",
  contactLabel: "微信",
  contactValue: "",
  ctaText: "咨询下单",
  caseStudy: "",
  guarantee: "",
  faqs: [
    { question: "", answer: "" },
    { question: "", answer: "" },
  ],
  deliverables: ["", "", ""],
  deliveryDays: 3,
  hoursPerOrder: 2,
  targetHourlyRate: 100,
  monthlyCapacity: 10,
  packages: [
    { name: "体验版", price: 39, description: "" },
    { name: "主推版", price: 199, description: "" },
    { name: "进阶版", price: 599, description: "" },
  ],
};

export function normalizeOffer(value: Partial<Offer> | null | undefined): Offer {
  return {
    ...templates.career,
    ...value,
    deliverables: value?.deliverables ?? templates.career.deliverables,
    packages: value?.packages ?? templates.career.packages,
    contactLabel: value?.contactLabel ?? "微信",
    contactValue: value?.contactValue ?? "",
    ctaText: value?.ctaText ?? "咨询下单",
    caseStudy: value?.caseStudy ?? "",
    guarantee: value?.guarantee ?? "",
    faqs: value?.faqs ?? [
      { question: "", answer: "" },
      { question: "", answer: "" },
    ],
    targetHourlyRate: value?.targetHourlyRate ?? 100,
  };
}

export function readiness(offer: Offer) {
  const checks = [
    ["卖家称呼", offer.sellerName.trim()],
    ["服务名称", offer.serviceName.trim()],
    ["目标客户", offer.audience.trim()],
    ["结果承诺", offer.promise.trim()],
    ["可信依据", offer.proof.trim()],
    ["联系方式", offer.contactValue.trim()],
    ["行动按钮", offer.ctaText.trim()],
    ["至少两项交付", offer.deliverables.filter((item) => item.trim()).length >= 2],
    ["三档价格", offer.packages.every((item) => item.price > 0 && item.description.trim())],
    ["交付周期", offer.deliveryDays > 0],
  ] as const;
  const completed = checks.filter(([, passed]) => Boolean(passed)).length;
  return {
    score: Math.round((completed / checks.length) * 100),
    missing: checks.filter(([, passed]) => !passed).map(([label]) => label),
  };
}

export function pricingHealth(offer: Offer) {
  const prices = offer.packages.map((item) => Math.max(0, item.price));
  const ascending = prices[0] < prices[1] && prices[1] < prices[2];
  const mainToEntryRatio = prices[0] > 0 ? prices[1] / prices[0] : 0;
  return {
    ascending,
    mainToEntryRatio,
    message: ascending
      ? `价格梯度清晰，主推方案是体验方案的 ${mainToEntryRatio.toFixed(1)} 倍`
      : "建议保持体验价 < 主推价 < 高阶价，避免买家难以判断",
  };
}

export function conversionScore(offer: Offer) {
  const checks = [
    Boolean(offer.proof.trim()),
    Boolean(offer.caseStudy.trim()),
    Boolean(offer.guarantee.trim()),
    offer.faqs.some((item) => item.question.trim() && item.answer.trim()),
    offer.packages.every((item) => item.description.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function priceRecommendation(offer: Offer) {
  const costFloor = Math.ceil((offer.hoursPerOrder * offer.targetHourlyRate) / 10) * 10;
  const recommended = Math.ceil((costFloor * 1.35) / 10) * 10;
  return {
    costFloor,
    recommended,
    underpriced: offer.packages[1].price < costFloor,
  };
}

export function encodeOffer(offer: Offer) {
  const bytes = new TextEncoder().encode(JSON.stringify(offer));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeOffer(encoded: string) {
  try {
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return normalizeOffer(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function revenueProjection(offer: Offer, monthlyOrders: number, pro = false) {
  const mainPrice = Math.max(0, offer.packages[1].price);
  const gross = mainPrice * Math.max(0, monthlyOrders);
  const platformFee = pro ? 29 : Math.round(gross * 0.03 * 100) / 100;
  const hours = Math.max(0, offer.hoursPerOrder) * Math.max(0, monthlyOrders);
  return {
    gross,
    platformFee,
    net: Math.max(0, gross - platformFee),
    hours,
    overCapacity: monthlyOrders > Math.max(0, offer.monthlyCapacity),
    proSaves: Math.max(0, Math.round((gross * 0.03 - 29) * 100) / 100),
  };
}

export function shareCopy(offer: Offer) {
  return [
    `我把「${offer.serviceName || "我的服务"}」正式做成了一个可直接下单的服务。`,
    offer.promise || "把我擅长的事，变成一个结果清楚、边界明确的交付。",
    `适合：${offer.audience || "正在面对这个问题的人"}`,
    `首批只开放 ${offer.monthlyCapacity || 1} 个名额，想了解可以直接回复我。`,
  ].join("\n\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function exportHtml(offer: Offer) {
  const deliverables = offer.deliverables
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const packages = offer.packages
    .map(
      (item, index) => `<article class="${index === 1 ? "featured" : ""}">
        <small>${escapeHtml(item.name)}</small><strong>¥${item.price}</strong>
        <p>${escapeHtml(item.description)}</p>
      </article>`,
    )
    .join("");
  const faqs = offer.faqs
    .filter((item) => item.question.trim() && item.answer.trim())
    .map(
      (item) =>
        `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`,
    )
    .join("");
  const contactHref = offer.contactLabel.includes("邮箱")
    ? `mailto:${encodeURIComponent(offer.contactValue)}?subject=${encodeURIComponent(offer.serviceName)}`
    : offer.contactLabel.includes("电话")
      ? `tel:${encodeURIComponent(offer.contactValue)}`
      : "#contact";

  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(offer.serviceName)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f2f0e9;color:#171714;font-family:ui-sans-serif,system-ui;line-height:1.6}.wrap{max-width:720px;margin:auto;padding:48px 20px}header{border-top:8px solid #d8ff3e;padding:38px 0 24px}h1{font-size:clamp(34px,8vw,64px);line-height:1.04;margin:8px 0 18px}h2{margin-top:38px}.tag{font-weight:800;text-transform:uppercase}.lead{font-size:20px;max-width:600px}.proof,.case,.guarantee{border-left:3px solid #171714;padding:14px 16px;background:#fff}.guarantee{border-color:#1f6b4f}.delivery{font-weight:700}.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.tiers article{background:#fff;border:1px solid #cbc9c0;padding:18px}.tiers .featured{background:#171714;color:white}.tiers strong{display:block;font-size:28px;margin:8px 0}details{border-top:1px solid #cbc9c0;padding:12px 0}summary{cursor:pointer;font-weight:700}.cta{display:block;background:#d8ff3e;color:#171714;padding:16px;text-align:center;font-weight:900;text-decoration:none;margin:26px 0}.contact{text-align:center;border:1px solid #cbc9c0;background:#fff;padding:18px}.contact strong{display:block;font-size:20px}.brand{text-align:center;font-size:12px;color:#68675f}@media(max-width:600px){.tiers{grid-template-columns:1fr}.wrap{padding-top:20px}}</style><main class="wrap"><header><span class="tag">${escapeHtml(offer.sellerName)}</span><h1>${escapeHtml(offer.serviceName)}</h1><p class="lead">${escapeHtml(offer.promise)}</p></header><p>适合 ${escapeHtml(offer.audience)}</p><h2>你会得到</h2><ul>${deliverables}</ul><p class="delivery">${offer.deliveryDays} 天内交付 · 每月限量 ${offer.monthlyCapacity} 单</p><p class="proof">${escapeHtml(offer.proof)}</p>${offer.caseStudy ? `<h2>真实结果</h2><p class="case">${escapeHtml(offer.caseStudy)}</p>` : ""}${offer.guarantee ? `<h2>服务保障</h2><p class="guarantee">${escapeHtml(offer.guarantee)}</p>` : ""}<h2>选择适合你的方案</h2><section class="tiers">${packages}</section>${faqs ? `<h2>常见问题</h2>${faqs}` : ""}<a class="cta" href="${contactHref}">${escapeHtml(offer.ctaText)}</a><section class="contact" id="contact"><small>${escapeHtml(offer.contactLabel)}</small><strong>${escapeHtml(offer.contactValue)}</strong></section><p class="brand">用「开单页」创建你的第一张售卖页</p></main></html>`;
}
