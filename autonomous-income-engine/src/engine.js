const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.resolve(process.env.AIE_DIST_DIR || path.join(ROOT, "dist"));
const DATA_DIR = path.resolve(process.env.AIE_DATA_DIR || path.join(ROOT, "data"));
const PRIVATE_DELIVERY_DIR = path.join(DATA_DIR, "delivery");
const PRIVATE_FULFILLMENT_DIR = path.join(DATA_DIR, "fulfillment");
const PUBLIC_SITE_DIR = path.resolve(process.env.AIE_PUBLIC_SITE_DIR || path.join(ROOT, "public-site"));
const RUNTIME_DIR = path.resolve(process.env.AIE_RUNTIME_DIR || path.join(ROOT, "runtime"));
const ASSET_QR = path.resolve(process.env.WECHAT_QR_PATH || path.join(ROOT, "assets", "wechat-pay.jpg"));
const SITE_BUILD_LOCK_DIR = path.join(RUNTIME_DIR, "site-build.lock");
let siteBuildLockDepth = 0;
const managedPublicTunnelProcesses = new Map();
const PUBLIC_INCOME_PRODUCT = Object.freeze({
  id: "product-image-batch-studio",
  title: "商品图批量成品机",
  buyer: "需要一次整理多张商品图、但不想逐张修图的网店经营者",
  pain: "不同来源的商品图尺寸、留白和主体占比不一致，逐张处理耗时",
  spendReason: "先看到本地生成效果，再用小额一次性付款下载整批高清 ZIP",
  delivery: "当前浏览器自动生成并在权威到账后解锁的高清商品图 ZIP",
  promise: "批量统一尺寸、主体占比、纯色背景和品牌角标；图片不上传，先预览后付款。",
  safety: "不上传原图；不把买家自报付款当作到账；关闭页面前需下载已解锁 ZIP。",
  marketId: "small-shop-owners",
  offerTypeId: "micro-tool",
  price: 6.9,
  metrics: Object.freeze({ views: 0, clicks: 0, paid: 0, revenue: 0, pendingDelivery: 0 }),
});

const PRODUCT_MATRIX = Object.freeze([
  Object.freeze({
    id: "consumer-evidence-pack",
    title: "消费维权证据包生成器",
    shortTitle: "维权证据包",
    status: "ready",
    category: "消费维权",
    buyer: "需要向平台、商家或监管渠道清楚提交消费纠纷材料的人",
    pain: "聊天截图、订单、付款、物流和商品照片散落，提交时很难说明顺序和对应关系",
    spendReason: "免费整理和预览；确认材料结构可用后，付费下载编号归档、哈希清单和可打印完整报告",
    delivery: "证据目录、时间线、编号原文件、SHA-256 清单、投诉事实摘要和可打印报告 ZIP",
    promise: "把散乱材料整理成一份能检查、能打印、能继续补充的证据包；文件只在当前浏览器处理。",
    safety: "不编造事实、不判断责任、不提供法律意见、不承诺投诉或诉讼结果。",
    marketId: "consumer-disputes",
    offerTypeId: "browser-tool",
    price: 19.9,
    path: "/products/consumer-evidence-pack/",
    actionLabel: "免费整理自己的材料",
    resultEvent: "evidence-pack-completed",
    startEvent: "evidence-upload-started",
    downloadEvent: "evidence-pack-downloaded",
    launchedOn: "2026-10-19",
    stopLoss: Object.freeze({ qualifiedVisits: 30, uploads: 10, completed: 5, checkouts: 2, paid: 1 }),
  }),
  Object.freeze({
    ...PUBLIC_INCOME_PRODUCT,
    shortTitle: "商品图成品机",
    status: "ready",
    category: "电商效率",
    path: "/products/product-image-batch-studio/",
    actionLabel: "免费处理自己的图片",
    resultEvent: "image-batch-completed",
    startEvent: "upload-started",
    downloadEvent: "zip-downloaded",
    launchedOn: "2026-10-18",
    stopLoss: Object.freeze({ qualifiedVisits: 50, uploads: 15, completed: 15, checkouts: 5, paid: 1 }),
  }),
  Object.freeze({
    id: "invoice-reimbursement-pack",
    title: "报销材料自检打包器",
    shortTitle: "报销材料包",
    status: "candidate",
    category: "职场效率",
    promise: "检查发票、行程单和付款凭证是否齐全，并按报销单编号整理。",
    safety: "工具尚在构建，不开放付款，不计入正式榜单。",
    price: 0,
    path: "",
  }),
  Object.freeze({
    id: "rental-handover-evidence",
    title: "租房交接证据整理器",
    shortTitle: "租房交接包",
    status: "candidate",
    category: "租房生活",
    promise: "把水电表、房屋照片、物品清单和交接对话整理成带时间的归档包。",
    safety: "工具尚在构建，不开放付款，不计入正式榜单。",
    price: 0,
    path: "",
  }),
  Object.freeze({
    id: "secondhand-delivery-proof",
    title: "二手交易交付凭证包",
    shortTitle: "二手交付包",
    status: "candidate",
    category: "闲置交易",
    promise: "整理商品状态、沟通约定、打包和物流材料，生成双方可核对的交付记录。",
    safety: "工具尚在构建，不开放付款，不计入正式榜单。",
    price: 0,
    path: "",
  }),
]);

const CONSUMER_EVIDENCE_GUIDES = Object.freeze([
  Object.freeze({
    slug: "12315-complaint-evidence-list",
    title: "12315 投诉需要准备哪些材料？一份可直接核对的证据清单",
    description: "准备向 12315 或全国 12315 平台投诉时，先按主体、交易、问题、沟通、诉求五部分整理材料，避免截图散乱、事实顺序不清。",
    question: "12315 投诉通常要准备什么？",
    intro: "不同地区和具体事项的受理要求可能不同，但一份容易核对的消费投诉材料，至少应让接收方看清楚：谁和谁发生了什么交易、出现了什么问题、你已经如何沟通、现在希望怎样处理。",
    checklist: ["商家或平台名称、店铺链接及可识别主体信息", "订单号、购买时间、商品或服务名称与付款凭证", "能够直接展示问题的照片、视频截图或检测材料", "与商家或平台沟通的完整关键记录", "按时间顺序写清事实，并提出具体、可执行的诉求"],
    mistakes: ["只提交情绪表达，没有订单、付款和问题材料", "聊天截图裁掉账号、时间或上下文，无法对应双方身份", "几十张图片没有编号，正文也没有说明每张图证明什么"],
  }),
  Object.freeze({
    slug: "merchant-refuses-refund-evidence",
    title: "商家拒绝退款怎么办？先整理这 5 类沟通和交易证据",
    description: "商家拒绝退款时，先保留交易约定、付款记录、问题材料、售后沟通和平台处理记录，再按时间线整理。",
    question: "商家拒绝退款，哪些材料最关键？",
    intro: "先不要只截取商家最后一句“不能退”。更重要的是保留交易时的约定、实际交付、发现问题后的沟通过程，以及商家拒绝处理的完整上下文。",
    checklist: ["购买页面、服务说明或双方约定", "订单详情和实际付款记录", "收到的商品、服务或未履约情况", "提出退款的时间、原因和商家回复", "平台介入、售后单或其他处理记录"],
    mistakes: ["只有付款截图，没有说明购买的具体内容", "只保留对自己有利的一句话，缺失前后对话", "诉求只写“必须处理”，没有明确退款金额或处理方式"],
  }),
  Object.freeze({
    slug: "product-not-as-described-evidence",
    title: "商品与描述不符怎么举证？购买页、实物和沟通记录这样对应",
    description: "遇到商品与描述不符时，把购买时的宣传内容、订单、实物差异和售后沟通一一对应，形成可检查的材料目录。",
    question: "怎样说明商品与页面描述不一致？",
    intro: "核心不是堆很多照片，而是把“购买时看到的描述”和“实际收到的情况”对应起来。每一项差异都尽量有同一角度或同一指标的对照。",
    checklist: ["下单时商品详情、规格选项和商家承诺的截图", "订单中的具体型号、数量、颜色或服务内容", "收货后的整体照片、问题部位和包装物流信息", "描述项与实物差异的逐项说明", "向商家提出问题及对方回复的完整记录"],
    mistakes: ["下单后商品页面已经变化，却没有保留下单时页面", "照片看不出具体问题，也无法与订单商品对应", "把主观不满意写成描述不符，却没有列出具体差异"],
  }),
  Object.freeze({
    slug: "wechat-chat-evidence-organize",
    title: "微信聊天记录太多，投诉材料应该怎么截图和整理？",
    description: "整理消费纠纷聊天记录时，保留双方身份、时间、关键上下文，按发生顺序编号并说明每段记录证明什么。",
    question: "聊天记录怎样整理才容易看懂？",
    intro: "不要把几百张连续截图直接打包。先筛出能说明交易约定、问题反馈、对方答复和处理结果的关键片段，同时保留必要上下文。",
    checklist: ["能识别双方身份的账号或店铺信息", "交易约定、价格、交付内容等关键对话", "发现问题后第一次反馈的时间和内容", "对方承认、解释、拒绝或提出方案的记录", "按日期排序，并为每组截图补一句“证明什么”"],
    mistakes: ["裁掉聊天对象和时间，只剩孤立的一句话", "截图顺序与事情发生顺序不一致", "图片文件名全是系统默认名称，正文无法引用"],
  }),
  Object.freeze({
    slug: "damaged-delivery-claim-evidence",
    title: "快递破损索赔要留什么证据？从外包装到签收沟通的材料清单",
    description: "快递或网购商品破损后，保存外包装、运单、开箱过程、破损细节、商品价值和联系记录，并按时间整理。",
    question: "商品运输破损后应当先保存什么？",
    intro: "破损场景很依赖当时状态。保证安全的前提下，尽早记录外包装、运单信息、内部防护和商品损坏情况，并保留与商家、平台和承运方的沟通。",
    checklist: ["带运单信息的外包装整体照片", "开箱过程或能够说明初始状态的连续材料", "破损位置的远景、近景及商品型号", "订单、付款凭证和商品价值材料", "签收时间及与商家、平台、快递的沟通记录"],
    mistakes: ["先丢掉包装，之后才发现无法说明运输状态", "只有破损特写，无法识别是哪件商品", "商家、平台和快递沟通混在一起，没有时间顺序"],
  }),
  Object.freeze({
    slug: "prepaid-service-refund-evidence",
    title: "预付费课程或会员退款，材料应该如何整理？",
    description: "预付费服务退款时，整理合同或宣传、付款、已消费情况、停课停业信息、退款沟通和明确金额诉求。",
    question: "预付费服务退款要把哪些事实说清楚？",
    intro: "重点是说明最初购买了什么、总共支付多少、已经使用多少、为什么要求终止，以及剩余金额如何计算。无法确认的数字不要估算成确定事实。",
    checklist: ["合同、报名页面、宣传承诺或服务规则", "付款记录、收据及总金额", "已经上课、使用或核销的次数与记录", "停课、闭店、变更服务或提出退款的原因材料", "退款沟通、对方回复及剩余金额计算说明"],
    mistakes: ["没有区分总付款、已消费和主张退还金额", "宣传承诺没有保存原页面或出处", "把听说的经营情况当作已经证实的事实"],
  }),
]);

const channels = ["wechat-moments", "xhs-note", "zhihu-answer", "landing-page"];

const markets = [
  {
    id: "jobseekers",
    name: "求职人群",
    buyer: "急着投简历但不会包装真实经历的人",
    urgentPain: "今晚就要投递，简历还是流水账",
    spendReason: "花小钱换一套可直接套用的表达模板，比找人代写更快",
  },
  {
    id: "solo-creators",
    name: "想做副业的人",
    buyer: "有执行意愿但不知道卖什么的人",
    urgentPain: "想赚钱但每天都在想方向，没有一个能当天上线的东西",
    spendReason: "买的是当天能上架的最小商品包和发布素材",
  },
  {
    id: "small-shop-owners",
    name: "小店老板",
    buyer: "没有预算做代运营但想自己发内容的小店老板",
    urgentPain: "今天又不知道发什么，账号像死号",
    spendReason: "买的是一周内容日历和可复制发布文案",
  },
  {
    id: "office-workers",
    name: "普通上班族",
    buyer: "想把工作流程自动化但不会写脚本的人",
    urgentPain: "重复整理表格、日报、周报，浪费时间",
    spendReason: "买的是能立刻照抄的自动化脚本模板和说明",
  },
];

const offerTypes = [
  {
    id: "template-pack",
    label: "模板包",
    price: 19,
    assetName: "可复制模板包",
    delivery: "Markdown 模板 + 使用说明 + 3 个示例",
  },
  {
    id: "micro-tool",
    label: "小工具",
    price: 39,
    assetName: "本地 HTML 小工具",
    delivery: "单文件 HTML 工具 + 示例数据 + 说明",
  },
  {
    id: "prompt-system",
    label: "AI 提示词系统",
    price: 29,
    assetName: "提示词流程包",
    delivery: "角色提示词 + 输入表单 + 输出检查清单",
  },
  {
    id: "checklist",
    label: "执行清单",
    price: 9,
    assetName: "24 小时执行清单",
    delivery: "分步清单 + 失败判断标准 + 下一步动作",
  },
];

function ensureDirs() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PRIVATE_DELIVERY_DIR, { recursive: true });
  fs.mkdirSync(PRIVATE_FULFILLMENT_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

function dataFile(name) {
  ensureDirs();
  return path.join(DATA_DIR, name);
}

function waitForSiteBuildLock(delayMs) {
  const waitUntil = Date.now() + delayMs;
  while (Date.now() < waitUntil) {}
}

function isStaleSiteBuildLock(lockDir, staleMs) {
  try {
    const ownerFile = path.join(lockDir, "owner.json");
    if (fs.existsSync(ownerFile)) {
      try {
        const owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
        const pid = Number(owner.pid || 0);
        if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
          try {
            process.kill(pid, 0);
          } catch (error) {
            if (error.code === "ESRCH") return true;
          }
        }
      } catch {
        return true;
      }
    }
    const stat = fs.existsSync(ownerFile) ? fs.statSync(ownerFile) : fs.statSync(lockDir);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch (error) {
    return false;
  }
}

function withSiteBuildLock(work, { timeoutMs = 15000, staleMs = 120000 } = {}) {
  ensureDirs();
  if (siteBuildLockDepth > 0) return work();
  const startedAt = Date.now();
  let acquired = false;
  while (!acquired) {
    try {
      fs.mkdirSync(SITE_BUILD_LOCK_DIR);
      fs.writeFileSync(
        path.join(SITE_BUILD_LOCK_DIR, "owner.json"),
        JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)
      );
      acquired = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (isStaleSiteBuildLock(SITE_BUILD_LOCK_DIR, staleMs)) {
        fs.rmSync(SITE_BUILD_LOCK_DIR, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        const timeout = new Error("site build lock timeout");
        timeout.statusCode = 503;
        throw timeout;
      }
      waitForSiteBuildLock(50);
    }
  }
  siteBuildLockDepth += 1;
  try {
    return work();
  } finally {
    siteBuildLockDepth -= 1;
    if (siteBuildLockDepth === 0) fs.rmSync(SITE_BUILD_LOCK_DIR, { recursive: true, force: true });
  }
}

function readJsonFile(name, fallback) {
  const file = dataFile(name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(name, value) {
  fs.writeFileSync(dataFile(name), JSON.stringify(value, null, 2));
}

function loadServiceHealth() {
  return readJsonFile("service-health.json", null);
}

function recordServiceHealthState(state) {
  const previous = loadServiceHealth() || {};
  const next = {
    ...previous,
    ...state,
    at: new Date().toISOString(),
  };
  writeJsonFile("service-health.json", next);
  return next;
}

function readJsonPath(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonDirectory(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const items = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    if (!/\.json$/i.test(name)) continue;
    if (/\.(consumed|published|stale|ignored)\.json$/i.test(name)) continue;
    const base = path.basename(name, ".json");
    const mtimeMs = fs.statSync(full).mtimeMs;
    const archived = ["consumed", "published", "stale", "ignored"].some((status) => {
      const archiveFile = path.join(dir, `${base}.${status}.json`);
      return fs.existsSync(archiveFile) && fs.statSync(archiveFile).mtimeMs >= mtimeMs;
    });
    if (archived) continue;
    items.push({ file: full, name, value: readJsonPath(full) });
  }
  return items;
}

function archiveJsonFile(file, status) {
  const archived = path.join(path.dirname(file), `${path.basename(file, ".json")}.${status}.json`);
  if (!fs.existsSync(file)) return { archived, moved: false };
  fs.renameSync(file, archived);
  return { archived, moved: true };
}

function positiveMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function todaySeed(date = new Date()) {
  return Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function hypothesisFor(market, offerType, index, seed = todaySeed()) {
  const id = `${market.id}-${offerType.id}-${seed}-${index}`;
  const title = `${market.name}${offerType.label}：${market.urgentPain}`;
  const promise = `让${market.buyer}在 30 分钟内拿到「${offerType.assetName}」，解决：${market.urgentPain}`;
  return {
    id,
    marketId: market.id,
    offerTypeId: offerType.id,
    title,
    buyer: market.buyer,
    pain: market.urgentPain,
    whyBuy: market.spendReason,
    promise,
    delivery: offerType.delivery,
    price: offerType.price,
    status: "testing",
    safety: "不承诺收益、不刷量、不伪造案例；只销售明确交付物。",
  };
}

function hypothesisFromOpportunity(signal, index, seed = todaySeed()) {
  const market = markets.find((item) => item.id === signal.marketId) || markets.find((item) => item.id === "solo-creators") || markets[0];
  const offerType = offerTypes.find((item) => item.id === signal.offerTypeId) || offerTypes.find((item) => item.id === "template-pack") || offerTypes[0];
  const keyword = String(signal.keyword || signal.title || "新机会").slice(0, 48);
  const pain = signal.pain || `最近有人在关注「${keyword}」，但缺少能当天执行的材料`;
  return {
    id: `opportunity-${market.id}-${offerType.id}-${shortHash(`${signal.sourceId}:${keyword}`)}-${seed}-${index}`,
    marketId: market.id,
    offerTypeId: offerType.id,
    opportunityId: signal.id,
    opportunityKeyword: keyword,
    opportunitySourceId: signal.sourceId || "unknown",
    title: `${market.name}${offerType.label}：${keyword}`,
    buyer: signal.buyer || market.buyer,
    pain,
    whyBuy: signal.spendReason || `买的是把「${keyword}」快速落成可执行版本的现成包`,
    promise: `让${signal.buyer || market.buyer}围绕「${keyword}」在 30 分钟内拿到「${offerType.assetName}」，解决：${pain}`,
    delivery: offerType.delivery,
    price: offerType.price,
    status: "testing",
    safety: "不承诺收益、不刷量、不伪造案例；只销售明确交付物。",
    opportunity: {
      id: signal.id,
      sourceId: signal.sourceId,
      keyword,
      score: signal.score || 0,
      url: signal.url || "",
      evidence: signal.evidence || "",
    },
  };
}

function priceRuleForCombo(combo) {
  const offerType = offerTypes.find((item) => item.id === combo.offerTypeId);
  const basePrice = offerType?.price || 19;
  let multiplier = 1;
  let reason = "基础测试价";
  if (combo.metrics.paid >= 3 || combo.metrics.revenue >= basePrice * 3) {
    multiplier = 1.35;
    reason = "已有多笔付款，下一轮提高价格测试利润上限";
  } else if (combo.metrics.paid > 0 || combo.metrics.revenue > 0) {
    multiplier = 1.15;
    reason = "已有付款证据，轻微涨价验证支付意愿";
  } else if ((combo.metrics.clicks >= 10 || combo.metrics.leads >= 3) && combo.metrics.paid === 0) {
    multiplier = 0.65;
    reason = "已有购买意图但无人付款，自动测试更低入门价";
  } else if (combo.metrics.clicks >= 3 && combo.metrics.paid === 0) {
    multiplier = 0.8;
    reason = "点击较多但无人付款，降低价格并改写承诺";
  } else if (combo.metrics.views >= 100 && combo.metrics.clicks < 2) {
    multiplier = 0.9;
    reason = "曝光较高但点击不足，降低门槛并换痛点";
  }
  return {
    key: combo.key,
    marketId: combo.marketId,
    offerTypeId: combo.offerTypeId,
    basePrice,
    price: Math.max(5, Math.round((basePrice * multiplier) / 5) * 5 - 1),
    multiplier: Number(multiplier.toFixed(2)),
    reason,
  };
}

function generateHypotheses({ seed = todaySeed(), count = 8 } = {}) {
  const items = [];
  const totalCombos = markets.length * offerTypes.length;
  for (let i = 0; i < count; i += 1) {
    const pairIndex = (seed + i) % totalCombos;
    const market = markets[pairIndex % markets.length];
    const offerType = offerTypes[Math.floor(pairIndex / markets.length) % offerTypes.length];
    items.push(hypothesisFor(market, offerType, i, seed));
  }
  return items;
}

function marketPlaybookMarkdown(hypothesis) {
  const playbooks = {
    jobseekers: {
      firstMove: "先锁定 1 个岗位 JD，把经历逐条改成“场景 + 动作 + 结果 + 证据”的表达。",
      proof: "可证明的项目、指标、角色、工具、时间线、协作对象。",
      buyerAction: "复制模板后，把自己最近 2 段经历填进去，30 分钟内产出一版可投递简历片段。",
      rejection: "不要写“精通、负责、熟悉”这种空词；没有证据的结果不要编。",
    },
    "solo-creators": {
      firstMove: "先卖一个非常小的数字交付物，不做大课、不做长期陪跑，今天就能上架。",
      proof: "明确交付清单、适用人群、不适用人群、使用前后对比样例。",
      buyerAction: "复制上架模板，替换成自己的技能/素材，生成一个 ¥9-¥39 的最小商品。",
      rejection: "不要承诺暴富，不要做需要重客服的复杂服务。",
    },
    "small-shop-owners": {
      firstMove: "先把明天要发的 3 条内容生成出来：引流、信任、成交各一条。",
      proof: "店铺真实卖点、客户常问问题、价格区间、服务边界、门店/产品照片说明。",
      buyerAction: "填入店铺类型和主推产品，得到 7 天内容日历和可直接复制的短文案。",
      rejection: "不要编造排队、爆单、明星同款等无法证明的信息。",
    },
    "office-workers": {
      firstMove: "先选一个重复动作，把输入、处理、输出拆成三列，再套用自动化模板。",
      proof: "样例表头、原始输入、目标输出、异常情况、是否允许本地脚本处理。",
      buyerAction: "复制脚本/流程模板，替换字段名，先在 3 行测试数据上跑通。",
      rejection: "不要把公司敏感数据上传到陌生服务；先用脱敏样例验证。",
    },
  };
  const item = playbooks[hypothesis.marketId] || playbooks["solo-creators"];
  return `## 场景打法

- 第一步：${item.firstMove}
- 需要准备：${item.proof}
- 买家拿到后要做：${item.buyerAction}
- 边界提醒：${item.rejection}
`;
}

function templatePackMarkdown(hypothesis) {
  return `## 可复制模板包

### 模板 1：问题诊断卡

- 我现在卡住的具体问题：${hypothesis.pain}
- 我已经试过但没用的方法：
- 我手上已有素材/证据：
- 今天必须完成的最小结果：
- 不能承诺或不能碰的边界：

### 模板 2：对外发布文案

标题：我把「${hypothesis.pain}」整理成了一个 ¥${hypothesis.price} 的现成包

适合：${hypothesis.buyer}

你会拿到：${hypothesis.delivery}

购买前先说清楚：这不是保证结果的服务，只是把你从 0 到 1 的整理成本压到 30 分钟内。

### 模板 3：交付确认消息

你好，已收到你的付款备注。下面是交付内容和使用顺序：

1. 先看「场景打法」确认是否适合你；
2. 再复制「输入模板」填入真实信息；
3. 最后用「检查清单」删除不能证明的承诺。

如果文件打不开，带付款备注回来，我会重新发送。
`;
}

function promptSystemMarkdown(hypothesis) {
  return `## AI 提示词系统

### 角色提示词

你是一个克制、务实、反套路的交付包生成助手。你的任务不是画饼，而是帮「${hypothesis.buyer}」围绕「${hypothesis.pain}」产出今天能用的材料。

### 输入表单

- 我的身份/业务：
- 我的目标用户：
- 用户现在最急的问题：
- 我能提供的真实素材：
- 我不能承诺的结果：
- 我希望最终输出的格式：

### 主提示词

请根据上面的输入，输出：

1. 一个 30 分钟内可执行的方案；
2. 三条可直接发布的文案；
3. 一个购买前说明，明确交付内容和不承诺内容；
4. 一个交付后检查清单；
5. 如果用户没有付款，下一轮应该测试的新标题。

要求：不要夸大，不要承诺收益，不要编造案例；每句话都要能被真实执行。

### 追问提示词

如果输出太空泛，请继续追问：你需要我提供哪 3 个具体素材，才能把它变成可直接复制的版本？
`;
}

function checklistMarkdown(hypothesis) {
  if (hypothesis.marketId === "jobseekers") {
    return `## 今晚可直接使用的简历项目急救包

这不是“教你做简历”的泛泛教程。下面的结构用于把你已经真实做过的项目，改成招聘方能快速读懂、且经得起追问的项目描述。

### 一、先填事实底稿

- 目标岗位：
- 项目名称和时间：
- 当时遇到的具体问题：
- 你本人负责的部分：
- 你采取的 2-4 个动作：
- 使用的工具/方法：
- 可证明的结果（没有数字就写交付物、范围或反馈）：
- 面试时能补充的证据：

### 二、三种可直接套用的表达

#### 版本 A：动作优先

针对【具体问题】，我负责【你的职责】，通过【动作 1】、【动作 2】完成【交付物】，最终【真实结果】。

#### 版本 B：结果优先

完成【真实结果/交付物】；过程中使用【工具/方法】解决【具体难点】，本人主要负责【职责边界】。

#### 版本 C：协作优先

在【项目背景】中，与【协作对象】共同推进【目标】；我独立完成【你的动作】，并以【证据】验证结果。

### 三、真实示例

原句：负责后台管理系统开发，参与需求讨论，完成多个页面。

改写：参与后台订单模块迭代，独立完成订单筛选、批量导出和异常状态提示 3 个页面；与产品确认 6 类边界状态，并补齐接口异常兜底，按期交付测试。

为什么更好：职责、动作、数量和交付结果都可追问，没有虚构“提升 50%”。

### 四、虚假与空话检查

- [ ] “负责/参与/熟悉”后面是否写清了具体动作；
- [ ] 每个数字是否有来源，面试时能否解释；
- [ ] 是否把团队结果冒充成个人结果；
- [ ] 是否出现无法证明的“显著提升、大幅优化”；
- [ ] 招聘方能否在 15 秒内看懂问题、动作和结果；
- [ ] 是否保留一条面试时可展开的技术或业务难点。

### 五、没有量化结果时怎么写

不要编百分比。可以写：交付了什么、覆盖了多少场景、处理了哪些异常、服务了哪些角色、缩短了哪个步骤、获得了什么可验证反馈。

### 六、使用顺序

1. 只选一段真实项目；
2. 填完事实底稿；
3. 分别套用 A/B/C 三版；
4. 用检查清单删掉空词和假数字；
5. 选择最贴近目标岗位的一版放进简历。
`;
  }
  return `## 24 小时执行清单

### 0-10 分钟：定义交付

- [ ] 写清楚买家是谁：${hypothesis.buyer}
- [ ] 写清楚痛点：${hypothesis.pain}
- [ ] 写清楚交付物：${hypothesis.delivery}
- [ ] 删除所有“保证、稳赚、必过、爆单”等承诺

### 10-30 分钟：产出第一版

- [ ] 套用输入模板
- [ ] 生成 1 个主版本和 3 个替换版本
- [ ] 做一次“买家拿到后能不能直接用”的检查

### 30-60 分钟：发布测试

- [ ] 发出 1 条信任型文案
- [ ] 发出 1 条痛点型文案
- [ ] 发出 1 条交付清单型文案
- [ ] 每条都带唯一购买备注或追踪链接

### 次日判断

- 有点击有付款：保留标题，放大同人群；
- 有点击没付款：重写交付承诺；
- 有曝光没点击：换痛点；
- 没曝光：换渠道，不判断产品失败。
`;
}

function microToolMarkdown(hypothesis) {
  if (hypothesis.marketId === "jobseekers") {
    return `## 本地简历项目描述生成器

把下面内容保存为 resume-project-builder.html，用浏览器打开即可。所有内容只在本机处理，不上传。它不会替你编造指标，而是把真实事实整理成 3 种可直接修改的项目描述。

~~~html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>简历项目描述生成器</title>
<style>
body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 16px;line-height:1.6;color:#17211b}
label{display:block;font-weight:700;margin-top:14px}textarea,input{width:100%;box-sizing:border-box;padding:11px;margin-top:5px;border:1px solid #ccd5ce;border-radius:8px}
button{margin-top:18px;padding:12px 18px;border:0;border-radius:9px;background:#173d2a;color:white;font-weight:700;cursor:pointer}
pre{white-space:pre-wrap;background:#f3f6f2;padding:18px;border-radius:10px}.tip{color:#627067}
</style>
<h1>简历项目描述生成器</h1>
<p class="tip">只整理真实经历，不生成虚假数据。没有数字时，用交付物、范围、异常场景或反馈替代。</p>
<label>目标岗位</label><input id="role" placeholder="例如：Java 后端开发">
<label>项目背景 / 要解决的问题</label><textarea id="problem" rows="3" placeholder="例如：订单退款状态分散，客服需要跨系统查询"></textarea>
<label>你本人负责什么</label><textarea id="duty" rows="3" placeholder="例如：负责退款查询接口和后台状态页"></textarea>
<label>你做了哪些动作</label><textarea id="actions" rows="4" placeholder="例如：梳理 6 类退款状态；设计统一状态模型；补齐超时重试"></textarea>
<label>真实结果或交付物</label><textarea id="result" rows="3" placeholder="例如：交付 3 个接口和 1 个状态页，覆盖退款查询与异常提示"></textarea>
<button onclick="make()">生成 3 个真实版本</button>
<pre id="output">填写上面的事实后生成。</pre>
<script>
const value=id=>(document.getElementById(id).value||'【请补充】').trim();
function clean(s){return s.replace(/[。；;]+$/,'')}
function make(){
 const role=clean(value('role')),problem=clean(value('problem')),duty=clean(value('duty')),actions=clean(value('actions')),result=clean(value('result'));
 const warnings=[];
 if(/提升|增长|降低|减少/.test(result)&&!/[0-9一二三四五六七八九十]/.test(result)) warnings.push('结果中有“提升/降低”等词，但没有证据；建议改成交付物或可解释范围。');
 if(/负责|参与/.test(duty)&&duty.length<10) warnings.push('职责过短，请补充你独立完成的模块或动作。');
 document.getElementById('output').textContent=
 '版本 A｜动作优先\\n针对“'+problem+'”，'+duty+'；通过'+actions+'，完成'+result+'。\\n\\n'+
 '版本 B｜结果优先\\n完成'+result+'；过程中围绕“'+problem+'”推进'+actions+'，本人职责为'+duty+'。\\n\\n'+
 '版本 C｜岗位匹配\\n面向 '+role+' 岗位：在“'+problem+'”场景中，'+duty+'，具体执行'+actions+'，最终交付'+result+'。\\n\\n'+
 '真实性检查\\n'+(warnings.length?warnings.map((x,i)=>(i+1)+'. '+x).join('\\n'):'未发现明显空话；请再确认所有数字和结果都能在面试中解释。');
}
</script>
</html>
~~~

### 示例输入

- 目标岗位：Java 后端开发
- 问题：订单退款状态分散，客服需要跨系统查询
- 职责：负责退款查询接口和后台状态页
- 动作：梳理 6 类退款状态；设计统一状态模型；补齐超时重试
- 结果：交付 3 个接口和 1 个状态页，覆盖退款查询与异常提示
`;
  }
  return `## 单文件 HTML 小工具

把下面内容保存为 ${slug(hypothesis.title)}.html，用浏览器打开即可。它会把买家的输入整理成可执行材料。

~~~html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>${hypothesis.title}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 860px; margin: 32px auto; line-height: 1.6; }
textarea, input { width: 100%; box-sizing: border-box; padding: 10px; margin: 6px 0 14px; }
button { padding: 10px 16px; }
pre { white-space: pre-wrap; background: #f6f6f6; padding: 16px; border-radius: 10px; }
</style>
<h1>${hypothesis.title}</h1>
<p>用途：把「${hypothesis.pain}」整理成可执行输出。</p>
<label>你的真实情况</label>
<textarea id="context" rows="5" placeholder="写当前状态、已有素材、限制条件"></textarea>
<label>今天要完成的最小结果</label>
<input id="goal" placeholder="例如：生成 3 条可发布文案">
<button onclick="make()">生成执行稿</button>
<pre id="output"></pre>
<script>
function make() {
  const context = document.getElementById('context').value || '未填写';
  const goal = document.getElementById('goal').value || '先产出一个可执行版本';
  document.getElementById('output').textContent =
    '目标：' + goal + '\\n\\n' +
    '已知情况：\\n' + context + '\\n\\n' +
    '执行顺序：\\n1. 先删掉无法证明的承诺。\\n2. 写一个只解决单一痛点的版本。\\n3. 做 3 个标题。\\n4. 发出测试并记录点击/付款。\\n\\n' +
    '检查：买家是否能在 30 分钟内用上？如果不能，继续缩小交付范围。';
}
</script>
</html>
~~~

### 示例数据

- 真实情况：${hypothesis.buyer}，现在的问题是「${hypothesis.pain}」
- 今天要完成的最小结果：拿到一个能直接复制使用的版本
`;
}

function offerSpecificAssetMarkdown(hypothesis) {
  if (hypothesis.offerTypeId === "template-pack") return templatePackMarkdown(hypothesis);
  if (hypothesis.offerTypeId === "prompt-system") return promptSystemMarkdown(hypothesis);
  if (hypothesis.offerTypeId === "checklist") return checklistMarkdown(hypothesis);
  if (hypothesis.offerTypeId === "micro-tool") return microToolMarkdown(hypothesis);
  return templatePackMarkdown(hypothesis);
}

function deliveryMarkdown(hypothesis) {
  return `# ${hypothesis.title}

## 购买者

${hypothesis.buyer}

## 购买原因

${hypothesis.whyBuy}

## 交付内容

${hypothesis.delivery}

${marketPlaybookMarkdown(hypothesis)}

${offerSpecificAssetMarkdown(hypothesis)}

## 30 分钟执行

1. 复制下面的输入模板。
2. 用真实情况替换方括号内容。
3. 按输出标准检查，不合格就重做一遍。
4. 如果要对外发布，先删掉所有无法证明的效果承诺。

## 输入模板

目标：我想解决「${hypothesis.pain}」。

我的真实情况：
- 当前状态：[写具体情况]
- 可用素材：[写你已有的资料]
- 今天能投入的时间：[写分钟数]
- 不能承诺的结果：[写清楚边界]

请输出：
- 一个可直接使用的版本；
- 三条可替换表达；
- 一个发布/交付前检查清单；
- 一个失败后下一步动作。

## 输出标准

- 具体到一个场景；
- 不出现“保证赚钱、保证涨粉、稳赚”等承诺；
- 交付物能在付款后立刻发出；
- 买家不需要再理解复杂概念。

## 售后说明

这是数字交付文件。购买的是「${hypothesis.delivery}」，不是收益、流量、工作机会或平台推荐。若文件无法打开，可凭付款备注申请重新发送。
`;
}

function resumeWorkbenchHtml(hypothesis) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>一页简历成品生成器</title>
  <link rel="preload" href="/wechat-pay.jpg" as="image">
  <style>
    :root{--ink:#14251a;--muted:#68746b;--green:#155d3b;--lime:#d8ff5b;--line:#dce5dc;--paper:#f5f7f2}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"PingFang SC",sans-serif}
    main{width:min(900px,calc(100% - 28px));margin:auto;padding:28px 0 60px}.card{margin-top:16px;padding:clamp(22px,5vw,42px);border:1px solid var(--line);border-radius:18px;background:#fff}
    h1,h2,h3{line-height:1.2}h1{margin:0;font-size:clamp(34px,7vw,58px)}h2{margin:0 0 18px}.lead,.hint{color:var(--muted)}
    label{display:grid;gap:7px;margin-top:15px;font-weight:750}input,textarea{width:100%;padding:12px 13px;border:1px solid #cbd6cd;border-radius:10px;font:inherit;resize:vertical}
    input:focus,textarea:focus{outline:3px solid #dcefe2;border-color:var(--green)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    button{margin-top:20px;padding:13px 20px;border:0;border-radius:11px;background:var(--lime);color:var(--ink);font:inherit;font-weight:850;cursor:pointer}
    .result{margin-top:14px;padding:18px;border-radius:12px;background:#f1f8f2}.result p{font-size:17px;font-weight:650}.copy{margin:0;background:#fff;border:1px solid var(--line)}
    .warning{color:#803a14}.badge{display:inline-block;padding:4px 9px;border-radius:999px;background:#e4f4e7;color:var(--green);font-size:12px;font-weight:800}
    .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.toolbar button{margin-top:0}.toolbar select{min-width:220px;padding:11px;border:1px solid #cbd6cd;border-radius:10px;background:#fff;font:inherit}
    .secondary{background:#fff;border:1px solid var(--line)}.danger{background:#fff4ef;border:1px solid #f0c9b4;color:#7d3218}
    .resume-sheet{margin-top:18px;padding:42px;min-height:1120px;border:1px solid #ccd6ce;background:#fff;box-shadow:0 12px 35px #18372415}
    .resume-head{display:flex;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:3px solid var(--green)}
    .resume-head h2{margin:0;font-size:34px}.resume-head p{margin:5px 0;color:var(--muted)}
    .resume-contact{text-align:right;white-space:pre-line}.resume-section{margin-top:25px}.resume-section h3{margin:0 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line);color:var(--green)}
    .resume-section p{margin:6px 0}.skill-list{display:flex;flex-wrap:wrap;gap:7px}.skill-list span{padding:4px 9px;border-radius:6px;background:#edf5ee}
    .support{text-align:center}.support img{display:block;width:min(280px,80%);margin:18px auto;border-radius:14px}.support strong{font-size:24px}.support[hidden]{display:none}
    @media print{body{background:#fff}.card{display:none}.card.print-card{display:block;margin:0;padding:0;border:0}.print-card>h2,.print-card>.hint,.print-card>.toolbar{display:none}.resume-sheet{margin:0;min-height:0;border:0;box-shadow:none}main{width:100%;padding:0}}
    @media(max-width:650px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <section class="card">
    <span class="badge">免费使用 · 本地处理 · 不上传内容</span>
    <h1>一页简历成品生成器</h1>
    <p class="lead">填入真实资料和岗位 JD，免费生成岗位匹配表达与可保存为 PDF 的成品。不登录、不上传内容，也不会替你编造经历。</p>
  </section>
  <section class="card">
    <h2>1. 粘贴岗位与真实事实</h2>
    <div class="grid">
      <label>姓名<input id="name" placeholder="例如：林晓"></label>
      <label>求职方向<input id="headline" placeholder="例如：Java 后端开发工程师"></label>
    </div>
    <div class="grid">
      <label>联系方式<input id="contact" placeholder="手机 · 邮箱 · 城市"></label>
      <label>核心技能<input id="skills" placeholder="Java、Spring Boot、MySQL、Redis"></label>
    </div>
    <label>个人优势<textarea id="summary" rows="3" placeholder="例如：3 年电商后端经验，熟悉订单与退款链路"></textarea></label>
    <label>工作经历<textarea id="work" rows="4" placeholder="公司 · 职位 · 时间；每行写一条真实工作成果"></textarea></label>
    <label>目标岗位 JD<textarea id="jd" rows="5" placeholder="粘贴招聘信息里的岗位职责和任职要求。内容只在当前文件中处理。"></textarea></label>
    <div class="grid">
      <label>目标岗位<input id="job" placeholder="例如：前端开发"></label>
      <label>项目名称<input id="project" placeholder="例如：后台订单管理系统"></label>
    </div>
    <div class="grid">
      <label>你的责任边界<input id="role" placeholder="例如：独立负责订单模块前端"></label>
      <label>协作对象<input id="partners" placeholder="例如：产品、后端、测试"></label>
    </div>
    <label>当时要解决的具体问题<textarea id="problem" rows="3" placeholder="不要写宏大背景，只写当时卡在哪里"></textarea></label>
    <label>你亲自做的 2—4 个动作<textarea id="actions" rows="5" placeholder="每行一个动作，例如：梳理 6 类状态&#10;完成筛选与批量导出&#10;补齐接口异常提示"></textarea></label>
    <div class="grid">
      <label>范围、难点或约束<input id="scope" placeholder="例如：覆盖 6 类状态和弱网异常"></label>
      <label>真实结果或交付物<input id="result" placeholder="例如：按期交付测试并上线"></label>
    </div>
    <label>能在面试中展示或解释的证据<input id="evidence" placeholder="例如：需求文档、测试记录、上线版本"></label>
    <button id="generate" type="button">生成三版表达与追问卡</button>
  </section>
  <section class="card">
    <h2>项目草稿箱</h2>
    <p class="hint">保存多个项目并随时切换。数据只保存在这个浏览器，不会上传。</p>
    <div class="toolbar">
      <select id="savedProjects" aria-label="已保存项目"><option value="">选择已保存项目</option></select>
      <button id="saveProject" type="button">保存当前项目</button>
      <button id="newProject" class="secondary" type="button">新建空白项目</button>
      <button id="deleteProject" class="danger" type="button">删除所选项目</button>
    </div>
    <p class="hint" id="saveStatus"></p>
  </section>
  <section class="card" id="output" hidden>
    <h2>2. 岗位匹配结果</h2>
    <div class="result">
      <h3>匹配概览</h3>
      <p id="matchSummary"></p>
      <p class="hint" id="keywordSummary"></p>
    </div>
    <h2 style="margin-top:30px">3. 三版项目表达</h2>
    <div class="result"><h3>动作优先版</h3><p id="actionVersion"></p><button class="copy" data-copy="actionVersion">复制</button></div>
    <div class="result"><h3>结果优先版</h3><p id="resultVersion"></p><button class="copy" data-copy="resultVersion">复制</button></div>
    <div class="result"><h3>岗位匹配版</h3><p id="jobVersion"></p><button class="copy" data-copy="jobVersion">复制</button></div>
    <h2 style="margin-top:30px">4. 真实性与证据检查</h2>
    <ul id="checks"></ul>
    <h2 style="margin-top:30px">5. 面试追问卡</h2>
    <ol id="questions"></ol>
    <div class="toolbar">
      <button id="print" type="button">打印 / 保存为 PDF</button>
      <button id="download" class="secondary" type="button">下载完整结果 TXT</button>
    </div>
    <p class="hint">选择最贴近目标岗位的一版放进简历。其余两版用来准备面试，不要把三版同时堆进简历。</p>
  </section>
  <section class="card print-card" id="resumePreview">
    <h2>6. 一页简历成品预览</h2>
    <p class="hint">点击生成后自动更新。确认全部内容真实，再打印或保存为 PDF。</p>
    <div class="resume-sheet">
      <header class="resume-head">
        <div><h2 id="resumeName">你的姓名</h2><p id="resumeHeadline">求职方向</p></div>
        <p class="resume-contact" id="resumeContact">手机 · 邮箱 · 城市</p>
      </header>
      <section class="resume-section" id="resumeSummarySection"><h3>个人优势</h3><p id="resumeSummary"></p></section>
      <section class="resume-section" id="resumeSkillsSection"><h3>核心技能</h3><div class="skill-list" id="resumeSkills"></div></section>
      <section class="resume-section" id="resumeWorkSection"><h3>工作经历</h3><p id="resumeWork"></p></section>
      <section class="resume-section"><h3>项目经历</h3><h4 id="resumeProject">项目名称</h4><p id="resumeProjectLine">填写真实项目后生成岗位匹配表达。</p></section>
    </div>
    <div class="toolbar"><button type="button" onclick="window.print()">打印 / 保存为 PDF</button></div>
  </section>
  <section class="card support" id="support" hidden>
    <span class="badge">结果已经生成</span>
    <h2>觉得确实帮到你，再自愿支持</h2>
    <p class="hint">工具完整功能永久免费，付款不是解锁条件，也不会影响下载和保存 PDF。支持金额由你决定。</p>
    <img src="/wechat-pay.jpg" alt="微信收款二维码">
    <strong>谢谢支持这个免费工具继续运行</strong>
  </section>
</main>
<script>
const get=id=>(document.getElementById(id).value||'').replace(/[<>]/g,'').replace(/\\s+/g,' ').trim();
const parts=id=>(document.getElementById(id).value||'').split(/[\\n，,；;。]+/).map(x=>x.replace(/[<>]/g,'').trim()).filter(Boolean).slice(0,4);
const list=(id,items)=>{const root=document.getElementById(id);root.replaceChildren(...items.map(text=>{const li=document.createElement('li');li.textContent=text;return li}))};
const sentence=items=>items.filter(Boolean).join('；')+'。';
const roleLabel=value=>value.replace(/^(本人|我)?\\s*(独立)?\\s*负责\\s*/,'').trim()||value;
const fieldIds=['name','headline','contact','skills','summary','work','jd','job','project','role','partners','problem','actions','scope','result','evidence'];
const storageKey='resume-workbench-projects-v1';
const readProjects=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{return[]}};
const writeProjects=projects=>{try{localStorage.setItem(storageKey,JSON.stringify(projects));return true}catch{return false}};
const currentDraft=()=>Object.fromEntries(fieldIds.map(id=>[id,document.getElementById(id).value]));
const fillDraft=draft=>fieldIds.forEach(id=>{document.getElementById(id).value=draft?.[id]||''});
const refreshProjects=selected=>{
  const select=document.getElementById('savedProjects'),projects=readProjects();
  select.replaceChildren(new Option('选择已保存项目',''),...projects.map(item=>new Option(item.name,item.id)));
  if(selected)select.value=selected;
};
document.getElementById('generate').onclick=()=>{
  const name=get('name'),headline=get('headline'),contact=get('contact'),skills=get('skills'),summary=get('summary'),work=get('work'),jd=get('jd'),job=get('job'),project=get('project'),role=get('role'),partners=get('partners'),problem=get('problem'),actions=parts('actions'),scope=get('scope'),result=get('result'),evidence=get('evidence');
  if(!project||!role||!actions.length){alert('请至少填写项目、责任边界和具体动作。');return}
  const actionText=actions.join('、');
  const source=[role,problem,actionText,scope,result,evidence].join(' ');
  const stop=new Set(['负责','相关','工作','岗位','要求','以及','进行','具备','能够','熟悉','经验','优先','以上','良好','项目','能力']);
  const tokens=(jd.match(/[A-Za-z][A-Za-z0-9+#.-]{1,20}|[\u4e00-\u9fa5]{2,6}/g)||[]).map(x=>x.toLowerCase()).filter(x=>!stop.has(x));
  const keywords=[...new Set(tokens)].slice(0,30);
  const matched=keywords.filter(word=>source.toLowerCase().includes(word));
  const missing=keywords.filter(word=>!matched.includes(word)).slice(0,8);
  const score=keywords.length?Math.round(matched.length/keywords.length*100):null;
  document.getElementById('matchSummary').textContent=score===null?'未粘贴 JD：已按目标岗位生成，粘贴 JD 后可获得关键词匹配检查。':'当前事实覆盖 JD 关键词 '+matched.length+'/'+keywords.length+'（约 '+score+'%）。这只是文本覆盖检查，不代表录用概率。';
  document.getElementById('keywordSummary').textContent=missing.length?'JD 中尚未被真实经历覆盖：'+missing.join('、')+'。只补你确实做过且能解释的内容。':'没有发现明显缺失关键词；仍需逐项确认都能在面试中举证。';
  document.getElementById('actionVersion').textContent=sentence([problem?'针对'+problem:'在'+project+'中',role,'通过'+actionText,scope?'覆盖'+scope.replace(/^覆盖/,''):'',result||'完成项目交付']);
  document.getElementById('resultVersion').textContent=sentence([result||'完成'+project+'交付',problem?'围绕'+problem:'',actionText,'本人主要负责'+roleLabel(role)]);
  document.getElementById('jobVersion').textContent=sentence([(job?'面向'+job+'岗位，':'')+'在'+project+'中，'+role,'通过'+actionText,partners?'与'+partners+'协作':'',result||scope||'形成可验证交付']);
  document.getElementById('resumeName').textContent=name||'你的姓名';
  document.getElementById('resumeHeadline').textContent=headline||job||'求职方向';
  document.getElementById('resumeContact').textContent=contact||'手机 · 邮箱 · 城市';
  document.getElementById('resumeSummary').textContent=summary;
  document.getElementById('resumeSummarySection').hidden=!summary;
  document.getElementById('resumeWork').textContent=work;
  document.getElementById('resumeWorkSection').hidden=!work;
  const skillItems=skills.split(/[，,、；;\s]+/).filter(Boolean);
  document.getElementById('resumeSkills').replaceChildren(...skillItems.map(text=>{const span=document.createElement('span');span.textContent=text;return span}));
  document.getElementById('resumeSkillsSection').hidden=!skillItems.length;
  document.getElementById('resumeProject').textContent=project;
  document.getElementById('resumeProjectLine').textContent=document.getElementById('jobVersion').textContent;
  const checks=[];
  if(!problem)checks.push('缺少具体问题：补一句项目当时为什么必须做。');
  if(!scope)checks.push('缺少范围或难点：可补功能数、状态类型、用户角色、约束或异常场景。');
  if(!result)checks.push('缺少结果：没有百分比也可以写上线、验收、交付物、反馈或问题关闭。');
  if(!evidence)checks.push('缺少证据：至少准备一个需求、测试、上线或反馈记录，面试时能解释。');
  if(/提升|增长|降低|减少/.test(result)&&!/[0-9一二三四五六七八九十]/.test(result))checks.push('结果使用了提升/降低等词，但没有可核对范围；建议改成交付物或补证据。');
  if(!checks.length)checks.push('事实要素完整；提交前逐个确认数字、动作和结果都能经得住追问。');
  list('checks',checks);
  list('questions',[
    '为什么当时选择这套方案，而不是另一个方案？',
    '这项工作里哪些是你独立完成的，哪些是团队结果？',
    '最难的异常或边界情况是什么，你怎么处理？',
    '你用什么证据判断交付完成或方案有效？',
    '如果重新做一次，你会保留和改变什么？'
  ]);
  document.getElementById('output').hidden=false;
  document.getElementById('support').hidden=false;
  try{
    navigator.sendBeacon('/api/events',new Blob([JSON.stringify({type:'interaction',experimentId:'jobseekers-resume-workbench',channel:'public-workbench-result'})],{type:'application/json'}));
    navigator.sendBeacon('/api/events',new Blob([JSON.stringify({type:'interaction',experimentId:'jobseekers-resume-workbench',channel:'public-support-shown'})],{type:'application/json'}));
  }catch{}
  document.getElementById('resumePreview').scrollIntoView({behavior:'smooth'});
};
document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{const text=document.getElementById(button.dataset.copy).textContent;try{await navigator.clipboard.writeText(text);button.textContent='已复制'}catch{button.textContent='请长按文字复制'}});
document.getElementById('saveProject').onclick=()=>{
  const draft=currentDraft(),name=(draft.project||draft.job||'未命名项目').trim();
  const select=document.getElementById('savedProjects'),projects=readProjects(),id=select.value||('project-'+Date.now());
  const item={id,name,updatedAt:new Date().toISOString(),...draft};
  const ok=writeProjects([item,...projects.filter(project=>project.id!==id)]);refreshProjects(id);
  document.getElementById('saveStatus').textContent=ok?'已保存“'+name+'”到当前浏览器。':'浏览器禁止本地保存，请改用下载结果。';
};
document.getElementById('savedProjects').onchange=event=>{
  const item=readProjects().find(project=>project.id===event.target.value);
  if(!item)return;fillDraft(item);document.getElementById('output').hidden=true;
  document.getElementById('saveStatus').textContent='已载入“'+item.name+'”。点击生成可刷新结果。';
};
document.getElementById('newProject').onclick=()=>{fillDraft({});document.getElementById('savedProjects').value='';document.getElementById('output').hidden=true;document.getElementById('saveStatus').textContent='已新建空白项目。'};
document.getElementById('deleteProject').onclick=()=>{
  const select=document.getElementById('savedProjects');if(!select.value)return;
  writeProjects(readProjects().filter(project=>project.id!==select.value));refreshProjects();
  document.getElementById('saveStatus').textContent='所选项目已从当前浏览器删除。';
};
document.getElementById('download').onclick=()=>{
  const project=get('project')||'项目经历';
  const checks=[...document.querySelectorAll('#checks li')].map((item,index)=>(index+1)+'. '+item.textContent).join('\\n');
  const questions=[...document.querySelectorAll('#questions li')].map((item,index)=>(index+1)+'. '+item.textContent).join('\\n');
  const text=['# '+project,'','岗位匹配结果',document.getElementById('matchSummary').textContent,document.getElementById('keywordSummary').textContent,'','动作优先版',document.getElementById('actionVersion').textContent,'','结果优先版',document.getElementById('resultVersion').textContent,'','岗位匹配版',document.getElementById('jobVersion').textContent,'','真实性与证据检查',checks,'','面试追问卡',questions].join('\\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));link.download=project.replace(/[\\/:*?"<>|]/g,'-')+'-岗位匹配结果.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
};
document.getElementById('print').onclick=()=>window.print();
refreshProjects();
</script>
</body>
</html>`;
}

function deliveryPreviewMarkdown(hypothesis) {
  return `# ${hypothesis.title}

这是付款前可公开查看的交付边界，不是完整交付内容。

## 你会买到什么

${hypothesis.delivery}

## 适合谁

${hypothesis.buyer}

## 解决什么

${hypothesis.pain}

## 不承诺什么

不承诺收益、不承诺涨粉、不承诺录用、不承诺平台推荐。

完整文件只在付款通知匹配成功后进入交付队列。
`;
}

function starterDeliveryMarkdown(hypothesis) {
  const starterPrice = starterOfferPrice(hypothesis);
  const fullBuyUrl = `/buy/${encodeURIComponent(hypothesis.id)}/${encodeURIComponent(hypothesis.winningVariant?.id || "proof")}?source=${encodeURIComponent("starter-delivery-upsell")}`;
  return `# ${hypothesis.title}｜入门版

这是低价入门版交付物，目的是让买家先用最小成本判断「${hypothesis.delivery}」是否适合自己，不是完整包。

## 入门版包含

- 一个可直接复制的起步模板；
- 一份 10 分钟内能完成的检查清单；
- 一个示例输入；
- 一个升级完整包的入口。

## 先做这一步

目标：我想解决「${hypothesis.pain}」。

我的当前情况：
- 当前状态：[写一个真实场景]
- 今天最急的结果：[写今天必须完成什么]
- 不能夸大的承诺：[写清楚边界]

请先输出一个可直接使用的最小版本，并指出哪 3 处最容易失败。

## 10 分钟检查清单

1. 是否具体到一个人群：${hypothesis.buyer}
2. 是否只解决一个痛点：${hypothesis.pain}
3. 是否能在今天直接用上；
4. 是否没有“保证赚钱、保证涨粉、保证录用”等承诺；
5. 是否知道下一步该复制什么、改什么、发给谁。

## 入门版边界

入门版价格：¥${starterPrice}

入门版不包含完整模板包、完整示例、完整执行流程和所有素材。完整包包含：${hypothesis.delivery}。

如果这个入门版对你有用，可以升级完整包：

${fullBuyUrl}

## 售后说明

这是数字交付文件。购买的是低价入门版，不是收益、流量、工作机会或平台推荐。若文件无法打开，可凭付款备注申请重新发送。
`;
}

function promoFor(hypothesis) {
  const track = (channel) => `/t/${hypothesis.id}/${channel}`;
  const offerUrl = hypothesis.winningVariant ? publicOfferVariantUrl(hypothesis.id, hypothesis.winningVariant.id) : `/offer/${hypothesis.id}.html`;
  const variantLabel = hypothesis.winningVariant?.label ? `\n当前自动胜出版：${hypothesis.winningVariant.label}` : "";
  return channels.map((channel) => {
    if (channel === "wechat-moments") {
      return {
        channel,
        label: "朋友圈",
        url: track(channel),
        text: `我做了一个小东西：${hypothesis.title}\n\n适合：${hypothesis.buyer}\n解决：${hypothesis.pain}\n交付：${hypothesis.delivery}\n价格：¥${hypothesis.price}${variantLabel}\n\n不是鸡血，不保证赚钱，只卖一个能立刻拿走用的交付包。想要就点链接/扫码备注：${hypothesis.id}`,
      };
    }
    if (channel === "xhs-note") {
      return {
        channel,
        label: "小红书/短内容",
        url: track(channel),
        text: `标题：我把「${hypothesis.pain}」做成了 ¥${hypothesis.price} 的现成包\n\n适合人群：${hypothesis.buyer}\n你会拿到：${hypothesis.delivery}\n为什么不是智商税：付款前就把交付内容写清楚，不承诺收益，不造假。${variantLabel}\n\n需要的话，备注：${hypothesis.id}`,
      };
    }
    if (channel === "zhihu-answer") {
      return {
        channel,
        label: "问答平台",
        url: track(channel),
        text: `如果你的问题是「${hypothesis.pain}」，核心不是继续收藏方法，而是拿到一个今天能执行的最小版本。我做了一个 ${hypothesis.delivery}，价格 ¥${hypothesis.price}。边界也写清楚：不保证结果，只减少你从 0 到 1 的整理成本。${variantLabel}`,
      };
    }
    return {
      channel,
      label: "售卖页",
      url: offerUrl,
      text: `售卖页：${offerUrl}`,
    };
  });
}

function scoreExperiment(metrics) {
  const views = metrics.views || 0;
  const clicks = metrics.clicks || 0;
  const paid = metrics.paid || 0;
  const revenue = metrics.revenue || 0;
  const ctr = views ? clicks / views : 0;
  const cvr = clicks ? paid / clicks : 0;
  const score = paid * 100 + revenue * 2 + ctr * 20 + cvr * 60;
  let decision = "collect-more-data";
  if (paid > 0 || revenue > 0) decision = "double-down";
  else if (views >= 100 && clicks < 2) decision = "kill";
  else if (clicks >= 10 && paid === 0) decision = "rewrite-offer";
  return { score: Number(score.toFixed(2)), ctr, cvr, decision };
}

function loadEvents() {
  return readJsonFile("events.json", []).map(enrichTrafficQuality);
}

function appendEvent(event) {
  const events = loadEvents();
  const next = enrichTrafficQuality({ id: `evt_${Date.now()}_${events.length}`, at: new Date().toISOString(), ...event });
  events.push(next);
  writeJsonFile("events.json", events);
  return next;
}

const PROMOTION_CONTENT_TYPES = Object.freeze([
  {
    key: "time",
    label: "时间对比",
    title: "30 张商品图，不再一张张改尺寸",
    opening: "开店后才发现，最耗时间的不是拍图，是同一批图要反复改成不同平台规格。",
    body: "我做了一个浏览器本地处理的小工具：拖入一批原图，会同时生成淘宝、拼多多、小红书和抖音四套规格，按平台分文件夹并统一命名。最多 30 张原图，先看完整预览，确认能用再决定是否花 6.9 元下载高清 ZIP。图片不会上传。",
    keywords: ["商品图批量处理", "淘宝主图", "拼多多主图", "网店工具", "开店效率"],
    demo: "保温杯",
  },
  {
    key: "result",
    label: "结果展示",
    title: "1 张原图，直接拿到 4 个平台上架图",
    opening: "不是 AI 修图，也不承诺提升销量，只解决重复改尺寸、命名和分类这件事。",
    body: "同一张商品原图，程序会生成淘宝 800×800、拼多多 800×800、小红书 1242×1660、抖音 1080×1440 四个版本。原图在浏览器本地处理，结果先完整预览；需要高清文件时，6.9 元下载整批按平台整理好的 ZIP。",
    keywords: ["一图多尺寸", "电商图片", "淘宝图片尺寸", "小红书商品图", "抖音商品图"],
    demo: "帆布包",
  },
  {
    key: "pain",
    label: "真实问题",
    title: "商品图尺寸乱、文件名乱，上传前还要整理半天",
    opening: "如果你也在几个平台同时卖货，应该遇到过：图能用，但尺寸、留白和文件名全不一样。",
    body: "这个小工具把一批原图统一处理并按淘宝、拼多多、小红书、抖音分目录打包。它不会凭空美化商品，也不是代运营；只是把原本逐张重复的整理工作一次做完。可以免费用自己的图看完整效果，不满意不用付费。",
    keywords: ["商品图整理", "批量改图片尺寸", "电商运营工具", "小卖家", "上架图片"],
    demo: "桌面灯",
  },
]);

function loadPromotionProgram({ now = new Date() } = {}) {
  const existing = readJsonFile("promotion-program.json", null);
  if (existing?.startedAt) return existing;
  const program = {
    startedAt: now.toISOString(),
    budget: 0,
    weeklyReviewMinutes: 15,
    primaryChannel: "xiaohongshu",
    audience: "淘宝、拼多多小卖家",
    packageStates: {},
  };
  writeJsonFile("promotion-program.json", program);
  return program;
}

function promotionTrackingUrl(campaignId, source = "xiaohongshu") {
  const query = new URLSearchParams({
    source,
    campaign: campaignId,
    content: "weekly-promotion-package",
  });
  return toPublicUrl(`${PUBLIC_INCOME_PRODUCT.path || "/products/product-image-batch-studio/"}?${query.toString()}`);
}

function promotionWeekNumber(startedAt, now = new Date()) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.min(5, Math.floor((now.getTime() - start) / (7 * 24 * 60 * 60 * 1000)) + 1));
}

function promotionPackagesForWeek(week, program = loadPromotionProgram()) {
  const demoRotation = ["保温杯", "帆布包", "桌面灯", "收纳盒", "运动水杯", "香薰蜡烛"];
  return PROMOTION_CONTENT_TYPES.map((template, index) => {
    const campaignId = `xhs-w${week}-${template.key}`;
    const state = program.packageStates?.[campaignId] || {};
    const demo = demoRotation[((week - 1) * 3 + index) % demoRotation.length];
    return {
      id: campaignId,
      week,
      channel: "xiaohongshu",
      type: template.key,
      label: template.label,
      title: week === 1 ? template.title : `${template.title}｜第 ${week} 周实测`,
      opening: template.opening,
      body: template.body,
      keywords: template.keywords,
      hashtags: template.keywords.map((item) => `#${item}`).join(" "),
      trackingUrl: promotionTrackingUrl(campaignId),
      demo,
      disclosure: `演示示意｜${demo}并非客户订单，实际效果请用自己的原图免费测试`,
      visual: {
        format: "1080x1350",
        beforeLabel: "原图：尺寸与留白未整理",
        afterLabel: "处理后：四平台规格 + 分类 ZIP",
        storyboard: ["拖入原图", "一次生成四套规格", "预览满意再下载"],
      },
      status: state.status || "draft",
      publishedAt: state.publishedAt || null,
      externalUrl: state.externalUrl || "",
    };
  });
}

function uniqueEventCount(events, predicate) {
  const matched = events.filter((event) => isBuyerSignalEvent(event) && predicate(event));
  const unique = new Set(
    matched.map((event) => event.visitorId || event.leadSessionId || event.id)
  );
  return unique.size;
}

function promotionFunnelSnapshot({ now = new Date(), program = loadPromotionProgram({ now }) } = {}) {
  const events = loadEvents();
  const checkouts = loadCheckouts();
  const relevant = (event) => event.experimentId === PUBLIC_INCOME_PRODUCT.id;
  const visits = uniqueEventCount(events, (event) => relevant(event) && (event.channel === "landing-view" || event.type === "view"));
  const uploads = uniqueEventCount(events, (event) => relevant(event) && event.channel === "upload-started");
  const generated = uniqueEventCount(events, (event) => relevant(event) && event.channel === "image-batch-completed");
  const downloads = uniqueEventCount(events, (event) => relevant(event) && event.channel === "zip-downloaded");
  const paid = checkouts.filter((item) => item.experimentId === PUBLIC_INCOME_PRODUCT.id && item.status === "paid");
  const xhsGenerated = uniqueEventCount(
    events,
    (event) =>
      relevant(event) &&
      event.channel === "image-batch-completed" &&
      (event.trafficSource === "xiaohongshu" || String(event.campaign || "").startsWith("xhs-"))
  );
  const campaignIds = new Set([
    ...events.map((event) => event.campaign).filter(Boolean),
    ...Object.keys(program.packageStates || {}),
  ]);
  const campaigns = [...campaignIds]
    .filter((id) => String(id).startsWith("xhs-"))
    .map((campaign) => ({
      campaign,
      visits: uniqueEventCount(events, (event) => relevant(event) && event.campaign === campaign && event.channel === "landing-view"),
      uploads: uniqueEventCount(events, (event) => relevant(event) && event.campaign === campaign && event.channel === "upload-started"),
      generated: uniqueEventCount(events, (event) => relevant(event) && event.campaign === campaign && event.channel === "image-batch-completed"),
      checkouts: checkouts.filter((item) => item.campaign === campaign).length,
      paid: checkouts.filter((item) => item.campaign === campaign && item.status === "paid").length,
    }))
    .sort((left, right) => right.generated - left.generated || right.visits - left.visits);
  return {
    visits,
    uploads,
    generated,
    checkouts: checkouts.filter((item) => item.experimentId === PUBLIC_INCOME_PRODUCT.id).length,
    paid: paid.length,
    downloads,
    revenue: Number(paid.reduce((sum, item) => sum + Number(item.paymentAmount || item.amount || 0), 0).toFixed(2)),
    xhsGenerated,
    campaigns,
  };
}

function promotionDiagnosis(funnel, days) {
  if (funnel.paid > 0) {
    return { stage: "first-sale", label: "真实首单已验证", action: "继续复用产生生成和付款的内容结构，并开始测试闲鱼入口。" };
  }
  if (funnel.visits >= 50 && funnel.checkouts === 0) {
    return { stage: "stop-offer", label: "达到止损线", action: "暂停推广当前卖点，验证卖家是否愿意为尺寸整理付费，再决定是否增加白底或去背景能力。" };
  }
  if (funnel.checkouts > 0) {
    return { stage: "payment-friction", label: "有人下单但未付款", action: "检查专属金额、微信收款信任和手机确认反馈，不增加新功能。" };
  }
  if (funnel.generated > 0) {
    return { stage: "value-friction", label: "有人生成但未下单", action: "强化四平台分类 ZIP、统一命名和节省时间的价值表达。" };
  }
  if (funnel.visits > 0) {
    return { stage: "activation-friction", label: "有人访问但未生成", action: "简化上传入口并强调免费完整预览，不急着扩渠道。" };
  }
  return {
    stage: days >= 7 ? "distribution-failed" : "seed-traffic",
    label: days >= 7 ? "内容尚未带来真人访问" : "等待第一批真人",
    action: days >= 7 ? "调整封面、标题和搜索关键词；不能据此判断产品没人买。" : "发布本周 3 套真实演示内容，先获得可归因访问。",
  };
}

function promotionCenterSnapshot({ now = new Date() } = {}) {
  const program = loadPromotionProgram({ now });
  const week = promotionWeekNumber(program.startedAt, now);
  const days = Math.max(1, Math.floor((now.getTime() - Date.parse(program.startedAt)) / (24 * 60 * 60 * 1000)) + 1);
  const funnel = promotionFunnelSnapshot({ now, program });
  const diagnosis = promotionDiagnosis(funnel, days);
  const milestones = [
    { day: 7, visits: 10, generated: 3, checkouts: 0, paid: 0 },
    { day: 14, visits: 25, generated: 8, checkouts: 2, paid: 0 },
    { day: 30, visits: 50, generated: 15, checkouts: 5, paid: 1 },
  ].map((target) => ({
    ...target,
    reached:
      funnel.visits >= target.visits &&
      funnel.generated >= target.generated &&
      funnel.checkouts >= target.checkouts &&
      funnel.paid >= target.paid,
  }));
  return {
    program: { ...program, packageStates: undefined },
    day: days,
    week,
    funnel,
    diagnosis,
    milestones,
    xianyu: {
      unlocked: funnel.xhsGenerated >= 5,
      generatedRequired: 5,
      generatedCurrent: funnel.xhsGenerated,
      reason: funnel.xhsGenerated >= 5
        ? "小红书已带来至少 5 次真实生成，可以测试一个高意向闲鱼入口。"
        : "先让小红书累计带来 5 次真实生成；未达标前不增加第二渠道。",
    },
    packages: promotionPackagesForWeek(week, program),
    boundaries: [
      "程序生成素材、文案、追踪链接和诊断；账号最终发布由你确认。",
      "不刷量、不群发私信、不伪造客户案例，不绕过平台安全机制。",
      "SEO 只作为长期资产，不计入首月主动冷启动任务。",
    ],
  };
}

function markPromotionPackagePublished(packageId, { externalUrl = "", now = new Date() } = {}) {
  const id = String(packageId || "").trim();
  if (!/^xhs-w[1-5]-(time|result|pain)$/.test(id)) {
    const error = new Error("推广包编号无效");
    error.statusCode = 400;
    throw error;
  }
  const program = loadPromotionProgram({ now });
  program.packageStates = program.packageStates || {};
  program.packageStates[id] = {
    status: "published",
    publishedAt: now.toISOString(),
    externalUrl: String(externalUrl || "").trim().slice(0, 500),
  };
  writeJsonFile("promotion-program.json", program);
  appendEvent({
    type: "promotion-published",
    experimentId: PUBLIC_INCOME_PRODUCT.id,
    channel: "xiaohongshu",
    campaign: id,
    externalUrl: program.packageStates[id].externalUrl,
  });
  return promotionCenterSnapshot({ now });
}

function isCrawlerUserAgent(userAgent = "") {
  const value = String(userAgent || "").toLowerCase();
  if (!value) return false;
  return /(bot|crawler|spider|slurp|bingpreview|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|linkedinbot|bytespider|petalbot|semrush|ahrefs|mj12bot|dotbot|yandex|baiduspider|sogou|duckduckbot)/.test(value) || /(curl|wget|python-requests|python-urllib|go-http-client|java\/|okhttp|httpclient|headlesschrome|playwright|puppeteer)/.test(value);
}

function enrichTrafficQuality(event) {
  if (event?.type !== "view") return event;
  const bot = Boolean(event.isBot || event.isCrawler || isCrawlerUserAgent(event.userAgent));
  return {
    ...event,
    isBot: bot,
    buyerSignal: bot ? false : event.buyerSignal !== false,
    trafficQuality: bot ? "bot-or-crawler" : event.trafficQuality || "human-or-unknown",
  };
}

function isBuyerSignalEvent(event) {
  if (!event) return false;
  if (event.isTest || event.trafficSource === "self-test") return false;
  if (event.isBot || event.isCrawler || event.buyerSignal === false || isCrawlerUserAgent(event.userAgent)) return false;
  return true;
}

function beijingDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function productMatrixProgram({ now = new Date() } = {}) {
  const existing = readJsonFile("product-matrix-program.json", null);
  if (existing?.startedOn) return existing;
  const program = {
    startedOn: beijingDateKey(now),
    cadence: "one-candidate-per-day",
    rankingWeights: { paid: 1000, checkout: 120, completed: 25, started: 5, qualifiedVisit: 1 },
  };
  writeJsonFile("product-matrix-program.json", program);
  return program;
}

function matrixCandidateState(index, program, now = new Date()) {
  const start = Date.parse(`${program.startedOn}T00:00:00+08:00`);
  const current = Date.parse(`${beijingDateKey(now)}T00:00:00+08:00`);
  const dayIndex = Math.max(0, Math.floor((current - start) / (24 * 60 * 60 * 1000)));
  if (index > dayIndex) return { visible: false, state: "queued", day: index + 1 };
  return {
    visible: true,
    state: "building",
    day: index + 1,
    activatedOn: beijingDateKey(new Date(start + index * 24 * 60 * 60 * 1000)),
  };
}

function matrixProductFunnel(product, { events = loadEvents(), checkouts = loadCheckouts(), orders = loadOrders() } = {}) {
  const relevantEvents = events.filter((event) => event.experimentId === product.id && isBuyerSignalEvent(event));
  const unique = (predicate) =>
    new Set(
      relevantEvents
        .filter(predicate)
        .map((event) => event.visitorId || event.leadSessionId || `${event.remoteAddress || ""}:${event.userAgent || ""}` || event.id)
    ).size;
  const productCheckouts = checkouts.filter(
    (item) => item.experimentId === product.id && item.status !== "invalid-automation" && item.trafficSource !== "self-test" && !item.isTest
  );
  const productOrders = orders.filter((item) => item.experimentId === product.id && item.status !== "refunded");
  const paidCheckoutIds = new Set(
    productCheckouts.filter((item) => item.status === "paid").map((item) => item.id)
  );
  const paidOrders = productOrders.filter((item) => item.status === "paid" || item.status === "delivered");
  const paid = Math.max(paidCheckoutIds.size, paidOrders.length);
  const paidOrderCheckoutIds = new Set(paidOrders.map((item) => item.checkoutId).filter(Boolean));
  const paidWithoutOrder = productCheckouts.filter(
    (item) => item.status === "paid" && !paidOrderCheckoutIds.has(item.id)
  );
  const visits = unique((event) => event.type === "view" || /(?:landing-view|server:)/.test(String(event.channel || "")));
  const started = unique((event) => event.channel === product.startEvent);
  const completed = unique((event) => event.channel === product.resultEvent);
  const downloads = unique((event) => event.channel === product.downloadEvent);
  return {
    visits,
    started,
    completed,
    checkouts: productCheckouts.length,
    paid,
    downloads,
    revenue: Number(
      [...paidWithoutOrder, ...paidOrders]
        .reduce((sum, item) => sum + Number(item.paymentAmount || item.amount || 0), 0)
        .toFixed(2)
    ),
  };
}

function productMatrixSnapshot({ now = new Date() } = {}) {
  const program = productMatrixProgram({ now });
  const events = loadEvents();
  const checkouts = loadCheckouts();
  const orders = loadOrders();
  const weights = program.rankingWeights;
  let candidateIndex = 0;
  const products = PRODUCT_MATRIX.map((product) => {
    const candidate = product.status === "candidate"
      ? matrixCandidateState(candidateIndex++, program, now)
      : { visible: true, state: product.status };
    const funnel = matrixProductFunnel(product, { events, checkouts, orders });
    const score =
      funnel.paid * weights.paid +
      funnel.checkouts * weights.checkout +
      funnel.completed * weights.completed +
      funnel.started * weights.started +
      funnel.visits * weights.qualifiedVisit;
    const sampleEnough = funnel.paid > 0 || funnel.checkouts >= 2 || funnel.completed >= 5 || funnel.visits >= 30;
    return {
      ...product,
      status: candidate.state,
      visible: candidate.visible,
      activationDay: candidate.day || null,
      activatedOn: candidate.activatedOn || product.launchedOn || null,
      purchasable: product.status === "ready" && Boolean(product.path) && Number(product.price) > 0,
      funnel,
      acquisition: productAcquisitionSnapshot(product, { events, checkouts, orders }),
      score,
      sampleEnough,
      rankLabel: sampleEnough ? "真实转化榜" : "实验榜 · 数据不足",
      campaignUrl: product.path
        ? toPublicUrl(`${product.path}?source=owner-promotion&campaign=${encodeURIComponent(`matrix-${product.id}`)}`)
        : "",
    };
  });
  const ranked = products
    .filter((item) => item.purchasable)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.funnel.paid - left.funnel.paid ||
        right.funnel.checkouts - left.funnel.checkouts ||
        right.funnel.completed - left.funnel.completed ||
        right.funnel.visits - left.funnel.visits ||
        left.id.localeCompare(right.id)
    )
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const visibleCandidates = products.filter((item) => item.visible && !item.purchasable);
  const nextCandidate = products.find((item) => !item.visible) || null;
  return {
    generatedAt: now.toISOString(),
    rankingKind: ranked.some((item) => item.sampleEnough) ? "真实转化榜" : "实验榜",
    rankingNote: "排名只使用真人访问、开始操作、完成结果、创建订单和真实确认付款；不使用点赞或伪造销量。",
    weights,
    top: ranked.slice(0, 3),
    products: [...ranked, ...visibleCandidates],
    readyCount: ranked.length,
    visibleCount: ranked.length + visibleCandidates.length,
    nextCandidate: nextCandidate
      ? { id: nextCandidate.id, title: nextCandidate.title, activationDay: nextCandidate.activationDay }
      : null,
  };
}

function productAcquisitionSnapshot(product, { events = loadEvents(), checkouts = loadCheckouts(), orders = loadOrders() } = {}) {
  const campaignIds = new Set([
    ...events.filter((item) => item.experimentId === product.id && isBuyerSignalEvent(item)).map((item) => item.campaign),
    ...checkouts.filter((item) => item.experimentId === product.id && item.trafficSource !== "self-test").map((item) => item.campaign),
  ].filter(Boolean));
  const campaigns = [...campaignIds].map((campaign) => {
    const selectedCheckouts = checkouts.filter((item) => item.campaign === campaign && item.trafficSource !== "self-test");
    const ids = new Set(selectedCheckouts.map((item) => item.id));
    const funnel = matrixProductFunnel(product, {
      events: events.filter((item) => item.campaign === campaign),
      checkouts: selectedCheckouts,
      orders: orders.filter((item) => ids.has(item.checkoutId)),
    });
    const stage = funnel.paid ? "paid" : funnel.checkouts ? "payment" : funnel.completed ? "value" : funnel.started ? "completion" : funnel.visits ? "upload" : "distribution";
    const actions = {
      paid: "复用这条入口的真实问题与交付结构，继续验证同类买家。",
      payment: "有人下单未付款：检查收款说明、信任和手机确认反馈。",
      value: "有人完成未下单：检查完整 ZIP 是否比免费预览更有用。",
      completion: "有人开始未完成：检查材料导入、标注和生成错误。",
      upload: "有访问未上传：先降低首次操作门槛，明确本地隐私处理。",
      distribution: "没有有效访问：先验证搜索收录和入口曝光，不判断产品失败。",
    };
    return { campaign, funnel, stage, action: actions[stage], sampleEnough: funnel.visits >= 30 || funnel.completed >= 5 || funnel.paid > 0 };
  }).sort((a, b) => b.funnel.paid - a.funnel.paid || b.funnel.checkouts - a.funnel.checkouts || b.funnel.completed - a.funnel.completed || b.funnel.visits - a.funnel.visits);
  return {
    campaigns,
    bestCampaign: campaigns.find((item) => item.funnel.completed > 0 || item.funnel.checkouts > 0)?.campaign || null,
    note: "优先复用产生真实结果和订单的入口；样本不足时不宣称胜出。自测与已识别爬虫不计入。",
  };
}

function inferEventFromPublicPath(urlPath, { userAgent = "", remoteAddress = "" } = {}) {
  const cleanPath = String(urlPath || "/").split("?")[0];
  const matrixProduct = PRODUCT_MATRIX.find((item) => item.path && cleanPath.startsWith(item.path));
  if (matrixProduct) {
    return {
      type: "view",
      experimentId: matrixProduct.id,
      channel: "server:product",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  if (cleanPath === "/" || /^\/presets\/[^/]+\.html$/i.test(cleanPath)) {
    return {
      type: "view",
      experimentId: cleanPath === "/" ? "product-matrix" : PUBLIC_INCOME_PRODUCT.id,
      channel: cleanPath === "/" ? "server:matrix" : "server:preset",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const offer = /^\/offer\/([^/]+?)(?:--([a-z0-9-]+))?\.html$/i.exec(cleanPath);
  if (offer) {
    return {
      type: "view",
      experimentId: decodeURIComponent(offer[1]),
      variantId: offer[2] ? decodeURIComponent(offer[2]) : null,
      channel: "server:offer",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const tool = /^\/tools\/([^/]+)\.html$/i.exec(cleanPath);
  if (tool) {
    return {
      type: "view",
      experimentId: decodeURIComponent(tool[1]),
      channel: "server:lead-tool",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const rescue = /^\/rescue\/([^/]+)\.html$/i.exec(cleanPath);
  if (rescue) {
    return {
      type: "view",
      experimentId: decodeURIComponent(rescue[1]),
      channel: "server:rescue-offer",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const sampleClose = /^\/sample-close\/([^/]+)\.html$/i.exec(cleanPath);
  if (sampleClose) {
    return {
      type: "view",
      experimentId: decodeURIComponent(sampleClose[1]),
      variantId: "proof",
      channel: "server:sample-close",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const purchaseIntent = /^\/intent\/(.+?)-(wechat-pay-delivery|starter-first|urgent-use|proof-before-buy|copyable-example|refund-boundary)\.html$/i.exec(cleanPath);
  if (purchaseIntent) {
    return {
      type: "view",
      experimentId: decodeURIComponent(purchaseIntent[1]),
      channel: `server:intent:${purchaseIntent[2]}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const demand = /^\/demand\/(.+?)-(pay-now|wechat-remark|starter-price|instant-download)\.html$/i.exec(cleanPath);
  if (demand) {
    return {
      type: "view",
      experimentId: decodeURIComponent(demand[1]),
      variantId: "proof",
      channel: `server:demand:${demand[2]}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const utility = /^\/utilities\/(.+?)-(fit-calculator|starter-builder|delivery-readiness|price-decision)\.html$/i.exec(cleanPath);
  if (utility) {
    return {
      type: "view",
      experimentId: decodeURIComponent(utility[1]),
      variantId: "proof",
      channel: `server:utility:${utility[2]}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const seo = /^\/seo\/(.+?)-(pain-solution|delivery-checklist|compare-diy|tonight-delivery|cheap-alternative|examples|mistakes|who-should-buy)\.html$/i.exec(cleanPath);
  if (seo) {
    return {
      type: "view",
      experimentId: decodeURIComponent(seo[1]),
      channel: `server:seo:${seo[2]}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const promotion = /^\/promotions\/([^/]+)\/([^/]+)\.html$/i.exec(cleanPath);
  if (promotion) {
    return {
      type: "view",
      experimentId: decodeURIComponent(promotion[2]),
      channel: `server:promotion:${decodeURIComponent(promotion[1])}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const buyNow = /^\/buy-now\/([^/]+)\.html$/i.exec(cleanPath);
  if (buyNow) {
    return {
      type: "view",
      experimentId: decodeURIComponent(buyNow[1]),
      channel: "server:buy-now",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const sales = /^\/sales\/([^/]+)\.html$/i.exec(cleanPath);
  if (sales) {
    return {
      type: "view",
      experimentId: decodeURIComponent(sales[1]),
      channel: "server:sales-assistant",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const starter = /^\/starter\/([^/]+)\.html$/i.exec(cleanPath);
  if (starter) {
    return {
      type: "view",
      experimentId: decodeURIComponent(starter[1]),
      variantId: "proof",
      channel: "server:starter-offer",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const instant = /^\/instant\/([^/]+)\.html$/i.exec(cleanPath);
  if (instant) {
    return {
      type: "view",
      experimentId: decodeURIComponent(instant[1]),
      variantId: "proof",
      channel: "server:instant-checkout",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const objection = /^\/objections\/(.+?)-(price-objection|fit-objection|delivery-objection|risk-objection)\.html$/i.exec(cleanPath);
  if (objection) {
    return {
      type: "view",
      experimentId: decodeURIComponent(objection[1]),
      channel: `server:objection:${objection[2]}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const question = /^\/questions\/(.+?)-(instant-delivery|included-files|buyer-fit|payment-steps)\.html$/i.exec(cleanPath);
  if (question) {
    return {
      type: "view",
      experimentId: decodeURIComponent(question[1]),
      channel: `server:question:${question[2]}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  if (cleanPath === "/deals/today.html") {
    return {
      type: "view",
      experimentId: "deals:today",
      channel: "server:deal:today",
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const syndication = /^\/syndication\/([^/]+)\/pub-(.+)-\1\.html$/i.exec(cleanPath);
  if (syndication) {
    return {
      type: "view",
      experimentId: decodeURIComponent(syndication[2]),
      channel: `server:syndication:${decodeURIComponent(syndication[1])}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const marketHub = /^\/markets\/([^/]+)\.html$/i.exec(cleanPath);
  if (marketHub) {
    const marketId = decodeURIComponent(marketHub[1]);
    return {
      type: "view",
      experimentId: `hub:market:${marketId}`,
      channel: `server:hub:market:${marketId}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  const offerTypeHub = /^\/offer-types\/([^/]+)\.html$/i.exec(cleanPath);
  if (offerTypeHub) {
    const offerTypeId = decodeURIComponent(offerTypeHub[1]);
    return {
      type: "view",
      experimentId: `hub:offer-type:${offerTypeId}`,
      channel: `server:hub:offer-type:${offerTypeId}`,
      path: cleanPath,
      userAgent,
      remoteAddress,
    };
  }
  return null;
}

function appendServerViewEvent(urlPath, { userAgent = "", remoteAddress = "", now = new Date() } = {}) {
  const event = inferEventFromPublicPath(urlPath, { userAgent, remoteAddress });
  if (!event?.experimentId) return null;
  const bucketMs = 5 * 60 * 1000;
  const bucket = Math.floor(now.getTime() / bucketMs);
  const dedupeKey = shortHash(`${event.type}:${event.experimentId}:${event.variantId || ""}:${event.channel}:${event.path}:${userAgent}:${remoteAddress}:${bucket}`);
  const events = loadEvents();
  if (events.some((item) => item.serverDedupeKey === dedupeKey)) return null;
  return appendEvent({
    ...enrichTrafficQuality(event),
    source: "server-static",
    serverDedupeKey: dedupeKey,
  });
}

function acquisitionFunnelSnapshot({
  lab = buildLab(),
  events = loadEvents(),
  orders = loadOrders(),
  checkouts = loadCheckouts(),
  publishQueue = loadPublishQueue(),
  publicAccessMonitor = loadPublicAccessMonitor(),
  now = new Date(),
} = {}) {
  const labIds = new Set(lab.map((item) => item.id));
  const productViews = events.filter((event) => event.type === "view" && labIds.has(event.experimentId));
  const buyerSignalViews = productViews.filter(isBuyerSignalEvent);
  const botOrCrawlerViews = productViews.filter((event) => !isBuyerSignalEvent(event));
  const productClicks = events.filter((event) => event.type === "click" && labIds.has(event.experimentId) && isBuyerSignalEvent(event));
  const interactionCount = (channel) =>
    events.filter(
      (event) =>
        event.experimentId &&
        labIds.has(event.experimentId) &&
        event.channel === channel &&
        isBuyerSignalEvent(event)
    ).length;
  const interactionPrefixCount = (prefix) =>
    events.filter(
      (event) =>
        event.experimentId &&
        labIds.has(event.experimentId) &&
        String(event.channel || "").startsWith(prefix) &&
        isBuyerSignalEvent(event)
    ).length;
  const imageBatchesCompleted = interactionCount("image-batch-completed");
  const freeResultsGenerated = interactionCount("free-result-generated") + imageBatchesCompleted;
  const careerToolResults = interactionPrefixCount("career-tool-result:");
  const supportPromptsShown =
    interactionCount("public-support-shown") + interactionPrefixCount("career-tool-support:") + imageBatchesCompleted;
  const careerToolUpgradeClicks = interactionPrefixCount("career-tool-upgrade:");
  const shareCardsCreated = interactionCount("share-card-created");
  const shareCardsShared = interactionCount("share-card-shared");
  const shareCardReferrals = interactionCount("share-card-referral");
  const upgradeClicks = interactionCount("free-result-upgrade");
  const serverViews = buyerSignalViews.filter((event) => String(event.source || "").includes("server") || String(event.channel || "").startsWith("server:"));
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const recentViews = buyerSignalViews.filter((event) => {
    const at = Date.parse(event.at || event.createdAt || event.timestamp || "");
    return Number.isFinite(at) && at >= cutoff;
  });
  const paidOrders = orders.filter((order) => order.status === "paid" || order.status === "delivered" || Number(order.amount || 0) > 0);
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const paidCheckouts = checkouts.filter((checkout) => checkout.status === "paid");
  const pendingCheckouts = checkouts.filter((checkout) => ["pending", "proof-submitted", "underpaid"].includes(checkout.status));
  const sentPublishTasks = publishQueue.filter((task) => task.status === "sent" || task.status === "handed-off").length;
  const publicBase = publicBaseUrl();
  const publicAccessUnreachable =
    Boolean(publicAccessMonitor) &&
    publicAccessMonitor.publicUrl === publicBase &&
    publicAccessMonitor.lastProbe?.reachable === false;
  let stage = "no-revenue-yet";
  let diagnosis = "还没有真实订单收入，程序必须继续找流量、压缩付款路径，并等待真实付款信号。";
  let nextAction = "continue-autonomous-cycle";

  if (revenue > 0 || paidOrders.length > 0 || paidCheckouts.length > 0) {
    stage = "revenue-found";
    diagnosis = "已经出现真实付款/订单，应优先放大已成交方向。";
    nextAction = "double-down-paid-offers";
  } else if (!isPublicHttpUrl(publicBase)) {
    stage = "no-public-access";
    diagnosis = "没有可公开访问的公网地址，搜索和自然流量无法进入。";
    nextAction = "open-public-tunnel-or-deploy";
  } else if (publicAccessUnreachable) {
    stage = "public-access-unreachable";
    diagnosis = "配置中的公网入口探活失败，真实买家和搜索引擎无法稳定进入；程序必须先恢复入口，不能把零访问误判成商品问题。";
    nextAction = "heal-public-access-before-acquisition";
  } else if (
    serverViews.length < 5 &&
    buyerSignalViews.length < 10 &&
    freeResultsGenerated + careerToolResults === 0
  ) {
    stage = "traffic-starved";
    diagnosis = "发布入口存在，但可计入买家意图的真实商品访问不足；程序会忽略机器人/爬虫访问，继续扩展自动获客。";
    nextAction = "expand-demand-capture-and-submit-index";
  } else if (freeResultsGenerated + careerToolResults === 0) {
    stage = "no-buyer-intent";
    diagnosis = "已有访问但没有用户生成工具结果；问题主要在入口价值和首次使用摩擦。";
    nextAction = "improve-free-result-activation";
  } else if (supportPromptsShown === 0) {
    stage = "support-prompt-friction";
    diagnosis = "用户已经生成结果，但支持二维码没有成功展示；程序应先修复结果后的收款入口。";
    nextAction = "repair-support-prompt";
  } else if (paidOrders.length === 0) {
    stage = "awaiting-authoritative-support-payment";
    diagnosis = "工具已经产出结果并展示自愿支持码；继续获取真实使用量，并只等待权威微信到账信号。";
    nextAction = "grow-qualified-usage-and-watch-authoritative-payments";
  } else if (pendingCheckouts.length > 0) {
    stage = "payment-friction";
    diagnosis = "有待支付 checkout 但没有真实付款；需要持续同步付款通知并挽回未付款。";
    nextAction = "watch-payment-and-recover-checkout";
  }

  return {
    at: now.toISOString(),
    stage,
    diagnosis,
    nextAction,
    revenue,
    paidOrders: paidOrders.length,
    orders: orders.length,
    checkouts: {
      total: checkouts.length,
      pending: pendingCheckouts.length,
      paid: paidCheckouts.length,
    },
    traffic: {
      productViews: buyerSignalViews.length,
      rawProductViews: productViews.length,
      botOrCrawlerViews: botOrCrawlerViews.length,
      serverViews: serverViews.length,
      recent24hViews: recentViews.length,
      productClicks: productClicks.length,
      freeResultsGenerated,
      imageBatchesCompleted,
      careerToolResults,
      supportPromptsShown,
      careerToolUpgradeClicks,
      shareCardsCreated,
      shareCardsShared,
      shareCardReferrals,
      upgradeClicks,
      sentPublishTasks,
    },
  };
}

function loadOrders() {
  return readJsonFile("orders.json", []);
}

function loadCheckouts({ expire = true, now = new Date() } = {}) {
  const checkouts = readJsonFile("checkouts.json", []);
  if (!expire) return checkouts;
  let changed = false;
  for (const checkout of checkouts) {
    if (
      checkout.status === "pending" &&
      /:auto$/.test(String(checkout.source || "")) &&
      checkout.leadScore === null &&
      !hasBuyerContext(checkout)
    ) {
      checkout.status = "invalid-automation";
      checkout.invalidatedAt = now.toISOString();
      checkout.invalidatedReason = "legacy-page-engagement-created-without-explicit-purchase-click";
      changed = true;
      continue;
    }
    if (!["pending", "proof-submitted"].includes(checkout.status) || !checkout.expiresAt) continue;
    const expiresAt = Date.parse(checkout.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt > now.getTime()) continue;
    checkout.status = "expired";
    checkout.expiredAt = now.toISOString();
    checkout.expiredReason = "checkout-window-elapsed-without-payment";
    changed = true;
  }
  if (changed) writeJsonFile("checkouts.json", checkouts);
  return checkouts;
}

function loadAdminPushSubscriptions() {
  return readJsonFile("admin-push-subscriptions.json", []);
}

function saveAdminPushSubscriptions(subscriptions) {
  writeJsonFile("admin-push-subscriptions.json", subscriptions);
  return subscriptions;
}

function loadOutbox() {
  return readJsonFile("outbox.json", []);
}

function loadDeliveryTokens() {
  return readJsonFile("delivery-tokens.json", []);
}

function loadPublishQueue() {
  return readJsonFile("publish-queue.json", []);
}

function loadSearchSubmissions() {
  return readJsonFile("search-submissions.json", { submitted: [] });
}

function loadOpportunitySignals() {
  return readJsonFile("opportunity-signals.json", { at: null, status: "not-run", sources: [], signals: [] });
}

function loadTrafficPlan() {
  return readJsonFile("traffic-plan.json", null);
}

function loadExecutionQueue() {
  return readJsonFile("execution-queue.json", { at: null, tasks: [] });
}

function loadLastExecutionQueueRun() {
  return readJsonFile("last-execution-queue-run.json", null);
}

function loadAutonomousSupervisor() {
  return readJsonFile("autonomous-supervisor.json", null);
}

function loadLastAutonomousSupervisorRun() {
  return readJsonFile("last-autonomous-supervisor-run.json", null);
}

function loadAdapters() {
  return readJsonFile("adapters.json", {
    publicBaseUrl: "",
    channels: {},
    growthWebhooks: [],
    growthOutbox: {},
    fulfillment: {},
    payments: {},
    opportunitySources: [],
  });
}

function saveAdapters(adapters) {
  const next = {
    publicBaseUrl: adapters.publicBaseUrl || "",
    channels: adapters.channels || {},
    growthWebhooks: Array.isArray(adapters.growthWebhooks) ? adapters.growthWebhooks : [],
    growthOutbox: adapters.growthOutbox || {},
    fulfillment: adapters.fulfillment || {},
    payments: adapters.payments || {},
    opportunitySources: Array.isArray(adapters.opportunitySources) ? adapters.opportunitySources : [],
    publishAgent: adapters.publishAgent || {},
    search: adapters.search || {},
    deploy: adapters.deploy || {},
  };
  writeJsonFile("adapters.json", next);
  return next;
}

function adapterEnvSpec() {
  return [
    { key: "PUBLIC_BASE_URL", path: "publicBaseUrl", requiredFor: ["public-traffic", "search-index"] },
    { key: "DEPLOY_WEBHOOK_URL", path: "deploy.webhookUrl", requiredFor: ["deploy"] },
    { key: "DEPLOY_TARGET_DIR", path: "deploy.targetDir", requiredFor: ["deploy"] },
    { key: "DEPLOY_PUBLIC_BASE_URL", path: "deploy.publicBaseUrl", requiredFor: ["deploy"] },
    { key: "PUBLISH_WECHAT_WEBHOOK_URL", path: "channels.wechat-moments.webhookUrl", requiredFor: ["publish"] },
    { key: "PUBLISH_XHS_WEBHOOK_URL", path: "channels.xhs-note.webhookUrl", requiredFor: ["publish"] },
    { key: "PUBLISH_ZHIHU_WEBHOOK_URL", path: "channels.zhihu-answer.webhookUrl", requiredFor: ["publish"] },
    { key: "GROWTH_WEBHOOK_URL", path: "growthWebhooks[0].webhookUrl", requiredFor: ["publish"] },
    { key: "GROWTH_OUTBOX_DIR", path: "growthOutbox.dir", requiredFor: ["publish"] },
    { key: "GROWTH_RESULTS_DIR", path: "growthOutbox.resultsDir", requiredFor: ["publish-result-sync"] },
    { key: "FULFILLMENT_WEBHOOK_URL", path: "fulfillment.webhookUrl", requiredFor: ["fulfillment"] },
    { key: "FULFILLMENT_OUTBOX_DIR", path: "fulfillment.outboxDir", requiredFor: ["fulfillment"] },
    { key: "FULFILLMENT_RESULTS_DIR", path: "fulfillment.resultsDir", requiredFor: ["fulfillment-result-sync"] },
    { key: "PAYMENTS_FEED_URL", path: "payments.feedUrl", requiredFor: ["payment"] },
    { key: "PAYMENTS_FEED_FILE", path: "payments.feedFile", requiredFor: ["payment"] },
    { key: "PAYMENTS_FEED_DIR", path: "payments.feedDir", requiredFor: ["payment"] },
    { key: "PAYMENT_WEBHOOK_SECRET", path: "payments.webhookSecret", requiredFor: ["payment-webhook"] },
    { key: "PAYMENTS_FEED_SECRET", path: "payments.feedSecret", requiredFor: ["payment"] },
    { key: "PUBLISH_AGENT_TOKEN", path: "publishAgent.token", requiredFor: ["publish-agent-auth"] },
    { key: "INDEXNOW_ENDPOINT", path: "search.indexNowEndpoint", requiredFor: ["search-index"] },
    { key: "INDEXNOW_KEY", path: "search.indexNowKey", requiredFor: ["search-index"] },
    { key: "OPPORTUNITY_SOURCE_URLS", path: "opportunitySources[].url", requiredFor: ["opportunity-scan"] },
    { key: "OPPORTUNITY_SOURCE_TEXT", path: "opportunitySources[].inlineText", requiredFor: ["opportunity-scan"] },
  ];
}

function parseOpportunitySourcesFromEnv(env = process.env) {
  const sources = [];
  const urls = String(env.OPPORTUNITY_SOURCE_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  urls.forEach((url, index) => {
    sources.push({
      id: `env-url-${index + 1}`,
      type: url.endsWith(".json") ? "json" : "text",
      url,
      weight: 1,
    });
  });
  if (env.OPPORTUNITY_SOURCE_TEXT) {
    sources.push({
      id: "env-inline-text",
      type: "text",
      inlineText: env.OPPORTUNITY_SOURCE_TEXT,
      weight: 1,
    });
  }
  return sources;
}

function envPublicUrl(envValue, existingValue = "") {
  const envUrl = String(envValue || "").replace(/\/+$/, "");
  const existingUrl = String(existingValue || "").replace(/\/+$/, "");
  if (!envUrl) return existingUrl;
  if (isPublicHttpUrl(envUrl)) return envUrl;
  if (isPublicHttpUrl(existingUrl)) return existingUrl;
  return envUrl;
}

function configureAdaptersFromEnv(env = process.env) {
  const existing = loadAdapters();
  const nextPublicBaseUrl = envPublicUrl(env.PUBLIC_BASE_URL, existing.publicBaseUrl);
  const nextDeployPublicBaseUrl = envPublicUrl(env.DEPLOY_PUBLIC_BASE_URL, existing.deploy?.publicBaseUrl || nextPublicBaseUrl);
  const channels = { ...(existing.channels || {}) };
  if (env.PUBLISH_WECHAT_WEBHOOK_URL) channels["wechat-moments"] = { ...(channels["wechat-moments"] || {}), webhookUrl: env.PUBLISH_WECHAT_WEBHOOK_URL };
  if (env.PUBLISH_XHS_WEBHOOK_URL) channels["xhs-note"] = { ...(channels["xhs-note"] || {}), webhookUrl: env.PUBLISH_XHS_WEBHOOK_URL };
  if (env.PUBLISH_ZHIHU_WEBHOOK_URL) channels["zhihu-answer"] = { ...(channels["zhihu-answer"] || {}), webhookUrl: env.PUBLISH_ZHIHU_WEBHOOK_URL };
  const growthWebhooks = env.GROWTH_WEBHOOK_URL
    ? [{ id: env.GROWTH_WEBHOOK_ID || "growth-router", channels: ["*"], webhookUrl: env.GROWTH_WEBHOOK_URL }]
    : existing.growthWebhooks || [];
  const opportunitySources = parseOpportunitySourcesFromEnv(env);
  const adapters = saveAdapters({
    publicBaseUrl: nextPublicBaseUrl,
    channels,
    growthWebhooks,
    growthOutbox:
      env.GROWTH_OUTBOX_DIR || env.GROWTH_OUTBOX_CHANNELS || env.GROWTH_RESULTS_DIR
        ? {
            ...(existing.growthOutbox || {}),
            ...(env.GROWTH_OUTBOX_DIR ? { dir: env.GROWTH_OUTBOX_DIR } : {}),
            ...(env.GROWTH_RESULTS_DIR ? { resultsDir: env.GROWTH_RESULTS_DIR } : {}),
            ...(env.GROWTH_OUTBOX_CHANNELS ? { channels: env.GROWTH_OUTBOX_CHANNELS.split(",").map((item) => item.trim()).filter(Boolean) } : {}),
          }
        : existing.growthOutbox || {},
    fulfillment:
      env.FULFILLMENT_WEBHOOK_URL || env.FULFILLMENT_OUTBOX_DIR || env.FULFILLMENT_RESULTS_DIR
        ? {
            ...(existing.fulfillment || {}),
            ...(env.FULFILLMENT_WEBHOOK_URL ? { webhookUrl: env.FULFILLMENT_WEBHOOK_URL } : {}),
            ...(env.FULFILLMENT_OUTBOX_DIR ? { outboxDir: env.FULFILLMENT_OUTBOX_DIR } : {}),
            ...(env.FULFILLMENT_RESULTS_DIR ? { resultsDir: env.FULFILLMENT_RESULTS_DIR } : {}),
          }
        : existing.fulfillment || {},
    payments: {
      ...(existing.payments || {}),
      ...(env.PAYMENT_WEBHOOK_SECRET ? { webhookSecret: env.PAYMENT_WEBHOOK_SECRET } : {}),
      ...(env.PAYMENTS_FEED_URL ? { feedUrl: env.PAYMENTS_FEED_URL } : {}),
      ...(env.PAYMENTS_FEED_FILE ? { feedFile: env.PAYMENTS_FEED_FILE } : {}),
      ...(env.PAYMENTS_FEED_DIR ? { feedDir: env.PAYMENTS_FEED_DIR } : {}),
      ...(env.PAYMENTS_FEED_SECRET ? { feedSecret: env.PAYMENTS_FEED_SECRET } : {}),
    },
    opportunitySources: opportunitySources.length ? opportunitySources : existing.opportunitySources || [],
    publishAgent: env.PUBLISH_AGENT_TOKEN ? { ...(existing.publishAgent || {}), token: env.PUBLISH_AGENT_TOKEN } : existing.publishAgent || {},
    search: {
      ...(existing.search || {}),
      ...(env.INDEXNOW_ENDPOINT ? { indexNowEndpoint: env.INDEXNOW_ENDPOINT } : {}),
      ...(env.INDEXNOW_KEY ? { indexNowKey: env.INDEXNOW_KEY } : {}),
    },
    deploy:
      env.DEPLOY_WEBHOOK_URL || env.DEPLOY_TARGET_DIR || env.DEPLOY_PUBLIC_BASE_URL
        ? {
            ...(existing.deploy || {}),
            ...(env.DEPLOY_WEBHOOK_URL ? { webhookUrl: env.DEPLOY_WEBHOOK_URL } : {}),
            ...(env.DEPLOY_TARGET_DIR ? { targetDir: env.DEPLOY_TARGET_DIR } : {}),
            ...(env.DEPLOY_PUBLIC_BASE_URL || nextDeployPublicBaseUrl ? { publicBaseUrl: nextDeployPublicBaseUrl } : {}),
          }
        : existing.deploy || {},
  });
  const finalMissing = {
    DEPLOY_TARGET: !(adapters.deploy?.webhookUrl || adapters.deploy?.targetDir || isPublicHttpUrl(adapters.publicBaseUrl)),
    GROWTH_TARGET: !(Object.values(adapters.channels || {}).some((item) => item?.webhookUrl) || (adapters.growthWebhooks || []).some((item) => item?.webhookUrl) || adapters.growthOutbox?.dir),
    FULFILLMENT_TARGET: !(adapters.fulfillment?.webhookUrl || adapters.fulfillment?.outboxDir),
    PAYMENTS_SOURCE: !(adapters.payments?.feedUrl || adapters.payments?.feedFile || adapters.payments?.feedDir || adapters.payments?.webhookSecret),
  };
  const provided = adapterEnvSpec().filter((item) => env[item.key]).map((item) => item.key);
  const summary = {
    at: new Date().toISOString(),
    provided,
    missingCore: Object.entries(finalMissing)
      .filter(([, missing]) => missing)
      .map(([key]) => key),
    adapters,
  };
  writeJsonFile("adapter-configure-from-env.json", summary);
  return summary;
}

function buildAdapterReadinessPlan({ health = loadAdapterHealth(), adapters = loadAdapters() } = {}) {
  const publishConfigured =
    Object.values(adapters.channels || {}).filter((item) => item?.webhookUrl).length +
    (adapters.growthWebhooks || []).filter((item) => item?.webhookUrl).length +
    (adapters.growthOutbox?.dir ? 1 : 0);
  const required = [
    {
      area: "deploy",
      ok: Boolean(isPublicHttpUrl(adapters.publicBaseUrl) || adapters.deploy?.webhookUrl || adapters.deploy?.targetDir),
      env: ["PUBLIC_BASE_URL", "DEPLOY_WEBHOOK_URL", "DEPLOY_TARGET_DIR", "DEPLOY_PUBLIC_BASE_URL"],
      purpose: "把本地生成的公开站点上线，形成真实外部访问入口；targetDir 适合挂载到静态托管目录。",
    },
    {
      area: "publish",
      ok: Boolean(publishConfigured),
      env: ["GROWTH_WEBHOOK_URL", "GROWTH_OUTBOX_DIR", "PUBLISH_WECHAT_WEBHOOK_URL", "PUBLISH_XHS_WEBHOOK_URL", "PUBLISH_ZHIHU_WEBHOOK_URL"],
      purpose: "让发布 Agent 能把商品和胜出成交变体推到外部分发渠道；outbox 目录适合给本机自动发布器、RPA 或同步器消费。",
    },
    {
      area: "payment",
      ok: Boolean(adapters.payments?.feedUrl || adapters.payments?.feedFile || adapters.payments?.feedDir || adapters.payments?.webhookSecret),
      env: ["PAYMENTS_FEED_URL", "PAYMENTS_FEED_FILE", "PAYMENTS_FEED_DIR", "PAYMENT_WEBHOOK_SECRET"],
      purpose: "让程序能确认真实付款，而不是靠手动输入订单；文件/目录源适合接微信收款通知转发器或日志同步。",
    },
    {
      area: "fulfillment",
      ok: Boolean(adapters.fulfillment?.webhookUrl || adapters.fulfillment?.outboxDir),
      env: ["FULFILLMENT_WEBHOOK_URL", "FULFILLMENT_OUTBOX_DIR"],
      purpose: "付款匹配后自动把交付链接发给买家；outbox 目录适合给邮件/微信/RPA 发送器消费。",
    },
  ];
  const plan = {
    at: new Date().toISOString(),
    ready: required.every((item) => item.ok) && !(health?.blocked > 0),
    required,
    health: health || null,
    envSpec: adapterEnvSpec(),
    commands: {
      configureFromEnv: "node src/cli.js configure-from-env",
      checkHealth: "node src/cli.js adapter-health",
      runAutonomousLoop: "npm run daemon -- --interval 300",
    },
  };
  writeJsonFile("adapter-readiness.json", plan);
  return plan;
}

function shellQuote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function generateSecret(prefix = "secret") {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

function bootstrapLocalLoop({ rootDir = path.join(RUNTIME_DIR, "local-loop"), publicBaseUrl = "http://127.0.0.1:4188", preserveExisting = true } = {}) {
  const baseDir = path.resolve(rootDir);
  const siteDir = path.join(baseDir, "site");
  const growthOutboxDir = path.join(baseDir, "growth-outbox");
  const growthResultsDir = path.join(baseDir, "growth-results");
  const paymentInboxDir = path.join(baseDir, "payment-inbox");
  const fulfillmentOutboxDir = path.join(baseDir, "fulfillment-outbox");
  const fulfillmentResultsDir = path.join(baseDir, "fulfillment-results");
  for (const directory of [siteDir, growthOutboxDir, growthResultsDir, paymentInboxDir, fulfillmentOutboxDir, fulfillmentResultsDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const existing = preserveExisting ? loadAdapters() : {};
  const adapters = saveAdapters({
    ...existing,
    publicBaseUrl,
    channels: existing.channels || {},
    growthWebhooks: existing.growthWebhooks || [],
    growthOutbox: {
      ...(existing.growthOutbox || {}),
      dir: growthOutboxDir,
      resultsDir: growthResultsDir,
      channels: existing.growthOutbox?.channels || ["*"],
    },
    fulfillment: {
      ...(existing.fulfillment || {}),
      outboxDir: fulfillmentOutboxDir,
      resultsDir: fulfillmentResultsDir,
    },
    payments: {
      ...(existing.payments || {}),
      feedDir: paymentInboxDir,
      webhookSecret: existing.payments?.webhookSecret || generateSecret("pay"),
    },
    deploy: {
      ...(existing.deploy || {}),
      targetDir: siteDir,
      publicBaseUrl,
    },
  });
  const envFile = path.join(baseDir, ".env.local-loop");
  const envLines = [
    `PUBLIC_BASE_URL=${shellQuote(publicBaseUrl)}`,
    `DEPLOY_TARGET_DIR=${shellQuote(siteDir)}`,
    `DEPLOY_PUBLIC_BASE_URL=${shellQuote(publicBaseUrl)}`,
    `GROWTH_OUTBOX_DIR=${shellQuote(growthOutboxDir)}`,
    `GROWTH_RESULTS_DIR=${shellQuote(growthResultsDir)}`,
    `PAYMENTS_FEED_DIR=${shellQuote(paymentInboxDir)}`,
    `PAYMENT_WEBHOOK_SECRET=${shellQuote(adapters.payments.webhookSecret)}`,
    `FULFILLMENT_OUTBOX_DIR=${shellQuote(fulfillmentOutboxDir)}`,
    `FULFILLMENT_RESULTS_DIR=${shellQuote(fulfillmentResultsDir)}`,
    "ADAPTERS_FROM_ENV=1",
    "WORKER_AUTORUN=1",
    "WORKER_INTERVAL_SECONDS=300",
    "LOCAL_LOOP_WATCH=1",
    "LOCAL_LOOP_DEBOUNCE_MS=500",
  ];
  fs.writeFileSync(envFile, `${envLines.join("\n")}\n`);
  const readmeFile = path.join(baseDir, "README.md");
  fs.writeFileSync(
    readmeFile,
    `# 本地自主赚钱闭环目录

这个目录由 \`node src/cli.js bootstrap-local-loop\` 生成，用来把程序能自己执行的链路接起来。

- \`site/\`：程序部署出的公开静态站文件；如果这个目录被 Nginx、对象存储同步器或静态托管平台挂载，外部用户就能访问。
- \`growth-outbox/\`：程序写出的发布任务 JSON 包；自动发布器/RPA/同步器监听这里。
- \`growth-results/\`：自动发布器写回执行结果，程序会消费这些 JSON 并更新发布队列。
- \`payment-inbox/\`：付款通知文件入口；可以放 JSON、JSONL、txt、log，程序会解析微信收款文本和唯一备注。
- \`fulfillment-outbox/\`：付款匹配后写出的交付通知 JSON 包；邮件/微信/RPA 发送器监听这里。
- \`fulfillment-results/\`：发货发送器写回执行结果，程序会消费这些 JSON 并更新订单交付状态。
- \`.env.local-loop\`：可加载的环境变量模板。

启动示例：

\`\`\`bash
set -a
. ${envFile}
set +a
npm start
\`\`\`
`
  );
  const summary = {
    at: new Date().toISOString(),
    rootDir: baseDir,
    publicBaseUrl,
    directories: {
      site: siteDir,
      growthOutbox: growthOutboxDir,
      growthResults: growthResultsDir,
      paymentInbox: paymentInboxDir,
      fulfillmentOutbox: fulfillmentOutboxDir,
      fulfillmentResults: fulfillmentResultsDir,
    },
    envFile,
    readmeFile,
    adapters,
  };
  writeJsonFile("local-loop-bootstrap.json", summary);
  buildAdapterReadinessPlan({ adapters });
  return summary;
}

function parseRssItems(text) {
  const raw = String(text || "");
  const items = [];
  for (const match of raw.matchAll(/<item[\s\S]*?<\/item>/gi)) {
    const item = match[0];
    const pick = (tag) => {
      const tagMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return tagMatch ? tagMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").trim() : "";
    };
    items.push({ title: pick("title"), summary: pick("description"), url: pick("link") });
  }
  return items;
}

function flattenOpportunityJson(value) {
  const root = typeof value === "string" ? JSON.parse(value) : value;
  const list = Array.isArray(root) ? root : root.items || root.entries || root.signals || root.trends || [];
  return list
    .filter(Boolean)
    .map((item) => ({
      title: item.title || item.name || item.keyword || item.query || "",
      summary: item.summary || item.description || item.content || item.text || "",
      url: item.url || item.link || "",
      score: Number(item.score || item.hot || item.heat || item.count || 0),
    }));
}

function splitTextOpportunityItems(text) {
  return String(text || "")
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-*#\d.\s]+/, "").trim())
    .filter((line) => line.length >= 2)
    .slice(0, 50)
    .map((line) => ({ title: line.slice(0, 80), summary: line, url: "" }));
}

function cleanOpportunityText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function opportunityKeywordFromText(title, summary, source = {}) {
  const cleanTitle = cleanOpportunityText(title);
  const cleanSummary = cleanOpportunityText(summary);
  const sourceId = String(source.id || source.url || "").toLowerCase();
  const repoLike = /^[\w.-]+\/[\w.-]+$/.test(cleanTitle);
  if (repoLike && cleanSummary) {
    const firstSentence = cleanSummary
      .split(/(?<=[.!?。！？])\s+/)
      .map((item) => item.trim())
      .find((item) => item.length >= 12 && !/^https?:\/\//i.test(item));
    if (firstSentence) return firstSentence.slice(0, 80);
  }
  if (sourceId.includes("github") && cleanSummary && cleanTitle.length < 40) {
    return cleanSummary.slice(0, 80);
  }
  return (cleanTitle || cleanSummary.slice(0, 80)).slice(0, 80);
}

function buyerNeedFromTrend(keyword, summary) {
  const raw = `${keyword} ${summary}`.toLowerCase();
  const original = `${keyword} ${summary}`;
  if (raw.includes("excel") || raw.includes("spreadsheet") || raw.includes("weekly report") || raw.includes("messy sheets")) {
    return {
      keyword: "Excel 周报自动整理工具包",
      buyer: "每周要从表格和聊天记录里整理周报的办公室人群",
      pain: "表格来源杂、字段乱、每周都要重复整理，缺少能本地套用的字段映射和周报生成流程",
      spendReason: "买的是可复制的表格字段映射、周报脚本说明和脱敏样例",
    };
  }
  if (raw.includes("resume") || raw.includes("job seeker") || raw.includes("job seekers") || raw.includes("bullet") || /简历|求职|岗位匹配/.test(original)) {
    return {
      keyword: "简历项目经历真实改写清单",
      buyer: "有真实经历但不会写成岗位匹配表达的求职者",
      pain: "简历项目像流水账，既怕写虚假指标，又不知道怎么突出动作、结果和证据",
      spendReason: "买的是不编造经历的 STAR 改写清单、项目亮点模板和自查表",
    };
  }
  if (
    raw.includes("local shop") ||
    raw.includes("small shop") ||
    raw.includes("content calendar") ||
    raw.includes("reply templates") ||
    /小店|本地商家|门店|团购|内容日历|获客/.test(original)
  ) {
    return {
      keyword: "小店内容日历和团购回复模板",
      buyer: "每天要发内容和回复客户的小店老板、本地商家",
      pain: "缺少可直接发布的内容日历、团购说明和客户回复模板，容易断更也难把咨询转成到店或下单",
      spendReason: "买的是一周内容日历、团购发布文案、客户回复模板和禁用夸大表达清单",
    };
  }
  if (raw.includes("reverse engineer") || raw.includes("binary") || raw.includes("native")) {
    return {
      keyword: "逆向分析入门检查清单",
      buyer: "想分析 App 行为、接口或本地程序但缺少流程的新手开发者",
      pain: "看到逆向/Agent 工具趋势，但不知道从环境、目标、证据到报告怎么安全拆解",
      spendReason: "买的是一套可照着走的逆向分析流程、风险边界和报告模板",
    };
  }
  if (raw.includes("diagram") || raw.includes("design")) {
    return {
      keyword: "技术图表设计模板包",
      buyer: "需要把方案讲清楚但不会画结构图的开发者和产品人",
      pain: "工具和项目越来越多，但汇报/文档里的图仍然混乱难懂",
      spendReason: "买的是可直接套用的架构图、流程图和说明模板",
    };
  }
  if (raw.includes("context") || raw.includes("prompt") || raw.includes("agent")) {
    return {
      keyword: "AI Agent 上下文工作流检查清单",
      buyer: "正在用 AI 编程或自动化但经常上下文失控的人",
      pain: "Agent 工具变多，但任务上下文、文件边界和验收标准容易混乱",
      spendReason: "买的是一套可复用的上下文整理、提示词和验收流程",
    };
  }
  if (raw.includes("skills")) {
    return {
      keyword: "个人技能资产化模板包",
      buyer: "想把自己的技能整理成可售教程、模板或服务的人",
      pain: "知道自己会一些东西，但不知道如何包装成当天能卖的小交付物",
      spendReason: "买的是技能拆解、定价、交付边界和售卖页模板",
    };
  }
  if (raw.includes("game") || raw.includes("ps5")) {
    return {
      keyword: "游戏工具需求验证清单",
      buyer: "想做玩家工具、攻略或周边数字商品的个人开发者",
      pain: "游戏相关热点很多，但不知道哪些能变成合规的小工具或模板",
      spendReason: "买的是需求筛选、合规边界和最小商品验证清单",
    };
  }
  return null;
}

function buyerNeedFromSeedText(keyword, summary) {
  const cleanKeyword = cleanOpportunityText(keyword).slice(0, 80);
  const cleanSummary = cleanOpportunityText(summary);
  if (!cleanKeyword || !cleanSummary) return null;
  const buyerMatch = cleanSummary.match(/^(.{2,24}?)(?:临近|想|需要|缺少|不知道|每天|有|把|重复|面对|项目|发|准备|不)/);
  const buyer = buyerMatch?.[1]?.replace(/[，。；、\s]+$/g, "") || "";
  const painMatch = cleanSummary.match(/(?:需要|缺少|不知道|不会|怕)([^。；]+)/);
  const pain = painMatch ? `${painMatch[0]}。` : cleanSummary.slice(0, 80);
  if (!buyer || !pain) return null;
  return {
    keyword: cleanKeyword,
    buyer,
    pain,
    spendReason: `买的是围绕「${cleanKeyword}」整理好的模板、清单、样例和交付边界，省掉从零拼资料的时间。`,
  };
}

function isGenericTechnologyOpportunity(keyword, summary = "") {
  const raw = `${keyword} ${summary}`.toLowerCase();
  const genericPatterns = [
    /open source (machine learning|ai|software|framework|platform|library|tool)/i,
    /(machine learning|deep learning|ai) framework/i,
    /end-to-end open source platform/i,
    /\binstall\b.*\bpip\b/i,
    /\bdocumentation\b.*\btutorials?\b/i,
    /\bgithub issues\b|\bcontribution guidelines\b|\bcode of conduct\b/i,
    /\btensorflow\b|\bpytorch\b|\bkubernetes\b|\breact\b|\bvue\b|\bnext\.js\b/i,
  ];
  return genericPatterns.some((pattern) => pattern.test(raw));
}

function hasConcreteBuyerNeed(signal = {}) {
  return Boolean(signal.buyer && signal.pain && signal.spendReason);
}

function isUsableOpportunitySignal(signal = {}) {
  if (!signal?.keyword) return false;
  if (!hasConcreteBuyerNeed(signal)) return false;
  if (isGenericTechnologyOpportunity(signal.keyword, signal.summary || signal.evidence || signal.title || "")) return false;
  return true;
}

function validOpportunitySignals(limit = Infinity) {
  return (loadOpportunitySignals().signals || [])
    .filter(isUsableOpportunitySignal)
    .slice(0, Math.max(0, limit));
}

function inferOpportunityMarket(text) {
  const raw = String(text || "").toLowerCase();
  const rules = [
    { id: "jobseekers", words: ["简历", "求职", "面试", "招聘", "jd", "岗位"] },
    { id: "small-shop-owners", words: ["门店", "小店", "餐饮", "探店", "团购", "商家", "老板", "获客"] },
    { id: "office-workers", words: ["excel", "表格", "日报", "周报", "自动化", "脚本", "办公"] },
    { id: "solo-creators", words: ["副业", "赚钱", "自媒体", "内容", "ai", "提示词", "小红书"] },
  ];
  return rules
    .map((rule) => ({ id: rule.id, score: rule.words.filter((word) => raw.includes(word)).length }))
    .sort((a, b) => b.score - a.score)[0]?.id || "solo-creators";
}

function inferOpportunityOfferType(text) {
  const raw = String(text || "").toLowerCase();
  if (["工具", "计算器", "生成器", "脚本", "html", "自动化"].some((word) => raw.includes(word))) return "micro-tool";
  if (["提示词", "prompt", "ai", "大模型"].some((word) => raw.includes(word))) return "prompt-system";
  if (["清单", "步骤", "流程", "计划"].some((word) => raw.includes(word))) return "checklist";
  return "template-pack";
}

function normalizeOpportunityItem(item, source, index) {
  const title = String(item.title || item.keyword || item.summary || "").trim();
  const summary = String(item.summary || item.description || item.text || "").trim();
  const inferredKeyword = opportunityKeywordFromText(title, summary, source);
  const need = buyerNeedFromTrend(inferredKeyword, summary) || (source?.type === "seed" ? buyerNeedFromSeedText(inferredKeyword, summary) : null);
  const sourceIdentity = `${source?.id || ""} ${source?.url || ""} ${item.url || ""}`.toLowerCase();
  const requiresMappedBuyerNeed = source?.default || sourceIdentity.includes("github");
  if (requiresMappedBuyerNeed && !(need?.buyer && need?.pain && need?.spendReason)) return null;
  const keyword = need?.keyword || inferredKeyword;
  if (!keyword) return null;
  const cleanSummary = cleanOpportunityText(summary);
  if (isGenericTechnologyOpportunity(keyword, cleanSummary) && !(need?.buyer && need?.pain && need?.spendReason)) return null;
  const evidence = [cleanOpportunityText(title), cleanSummary].filter(Boolean).join(" ｜ ").slice(0, 260);
  const sourceWeight = Number(source.weight || 1);
  const score = Math.max(1, Number(item.score || 0) || 1) * sourceWeight + Math.max(0, 20 - index);
  return {
    id: `opp_${shortHash(`${source.id || source.url || "source"}:${keyword}`)}`,
    sourceId: source.id || source.url || "source",
    keyword: keyword.slice(0, 80),
    title: keyword.slice(0, 80),
    summary: cleanSummary,
    url: item.url || "",
    evidence,
    score: Number(score.toFixed(2)),
    marketId: inferOpportunityMarket(`${keyword} ${cleanSummary}`),
    offerTypeId: inferOpportunityOfferType(`${keyword} ${cleanSummary}`),
    buyer: need?.buyer || "",
    pain: need?.pain || "",
    spendReason: need?.spendReason || "",
  };
}

const defaultOpportunitySourceCandidates = [
  {
    id: "hn-show-rss",
    type: "rss",
    url: "https://hnrss.org/show",
    weight: 1.2,
    timeoutMs: 2200,
  },
  {
    id: "hn-frontpage-rss",
    type: "rss",
    url: "https://hnrss.org/frontpage",
    weight: 1,
    timeoutMs: 2200,
  },
  {
    id: "github-trending-rss",
    type: "rss",
    url: "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml",
    weight: 1.1,
    timeoutMs: 2200,
  },
];

function defaultOpportunitySources() {
  return defaultOpportunitySourceCandidates.map((source) => ({ ...source, default: true }));
}

function internalOpportunitySeedItems(seed = todaySeed()) {
  const templates = [
    {
      title: "AI 简历岗位匹配表达包",
      summary: "求职者把真实经历改成 JD 匹配表达，今晚就能投递，不编造项目和指标。",
      score: 58,
    },
    {
      title: "小店老板 7 天内容日历",
      summary: "本地小店每天缺引流、信任、成交内容，需要可直接复制的短文案和拍摄清单。",
      score: 54,
    },
    {
      title: "Excel 日报周报自动化脚本模板",
      summary: "上班族重复整理表格和周报，需要本地可复制的脚本和脱敏样例。",
      score: 52,
    },
    {
      title: "副业最小商品上架包",
      summary: "想做副业的人缺少当天可上架的数字商品，需要标题、交付边界、售卖页和发布素材。",
      score: 50,
    },
    {
      title: "AI 提示词检查清单",
      summary: "内容创作者需要把提示词产出从空泛改成可交付版本，包含输入表单和验收标准。",
      score: 46,
    },
    {
      title: "门店团购回复模板",
      summary: "商家面对客户常问价格、预约、服务边界，需要一组不夸大的自动回复模板。",
      score: 44,
    },
  ];
  const offset = Math.abs(Number(seed || 0)) % templates.length;
  return [...templates.slice(offset), ...templates.slice(0, offset)];
}

function internalOpportunitySignals({ seed = todaySeed(), limit = 12 } = {}) {
  const source = { id: "internal-seed", type: "seed", weight: 1 };
  return internalOpportunitySeedItems(seed)
    .map((item, index) => normalizeOpportunityItem(item, source, index))
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      seeded: true,
      evidence: `内置机会种子：${item.evidence}`,
    }));
}

function expansionOpportunitySeedItems(seed = todaySeed(), round = 0) {
  const templates = [
    { title: "考研复试自我介绍急救包", summary: "准备复试的学生临近面试还不会把经历讲成 1 分钟版本，需要中文/英文模板、追问清单和避坑表达。", score: 64 },
    { title: "AI 副业报价单模板", summary: "自由职业者和副业新手不知道 AI 服务怎么报价、怎么写交付边界，需要可复制报价单和成交说明。", score: 62 },
    { title: "小红书店铺种草标题库", summary: "本地商家和小店老板发小红书没有标题和结构，需要一周可复制种草标题、正文骨架和禁用夸大词清单。", score: 60 },
    { title: "述职汇报 PPT 文案救急包", summary: "上班族临近述职不知道怎么把流水账整理成结果表达，需要结构、标题、量化表达和领导追问准备。", score: 58 },
    { title: "闲鱼虚拟资料商品上架清单", summary: "想卖虚拟资料的人不知道如何合规描述、定价和交付，需要标题、详情页、发货说明和风险边界。", score: 56 },
    { title: "短视频口播脚本改写模板", summary: "内容创作者有素材但不会改成短视频口播，需要开头钩子、正文结构和成交 CTA 模板。", score: 54 },
    { title: "AI 自动化周报脚本说明包", summary: "办公室人群想把周报从聊天记录和表格里整理出来，需要本地脚本模板、字段映射和脱敏示例。", score: 52 },
    { title: "本地生活客服回复模板", summary: "门店老板每天重复回答价格、预约、地址和售后问题，需要可复制话术和不同客诉场景处理边界。", score: 50 },
    { title: "面试项目亮点提炼卡", summary: "求职者项目经历真实但讲不出亮点，需要 STAR 结构、技术难点追问和不编造指标的表达模板。", score: 48 },
    { title: "AI 工具选型对比表", summary: "小团队不知道该买哪个 AI 工具或插件，需要需求清单、对比维度和采购前试用记录模板。", score: 46 },
    { title: "朋友圈成交文案边界包", summary: "个人服务提供者想发朋友圈成交但怕像割韭菜，需要真实边界、适合/不适合买、付款说明模板。", score: 44 },
    { title: "低价数字产品交付检查表", summary: "想做副业的人不知道一个 ¥9-¥39 的数字产品到底该交付什么，需要清单、样例和自动交付说明。", score: 42 },
  ];
  const offset = Math.abs(Number(seed || 0) + Number(round || 0) * 3) % templates.length;
  return [...templates.slice(offset), ...templates.slice(0, offset)];
}

function expansionOpportunitySignals({ seed = todaySeed(), limit = 12, round = 0 } = {}) {
  const source = { id: `traffic-expansion-${round}`, type: "seed", weight: 1.25 };
  return expansionOpportunitySeedItems(seed, round)
    .map((item, index) => normalizeOpportunityItem(item, source, index))
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      seeded: true,
      expansionRound: round,
      evidence: `自动扩流机会种子：${item.evidence}`,
    }));
}

async function expandTrafficSurface({ seed = todaySeed(), count = 8, dryRun = false } = {}) {
  const previous = loadTrafficExpansion();
  const round = (Array.isArray(previous.runs) ? previous.runs.length : 0) + 1;
  const opportunityState = loadOpportunitySignals();
  const existingSignals = Array.isArray(opportunityState.signals) ? opportunityState.signals : [];
  const expansionSignals = expansionOpportunitySignals({ seed: Number(seed || todaySeed()) + round, limit: Math.max(count, 8), round });
  const byId = new Map();
  for (const signal of [...expansionSignals, ...existingSignals]) {
    if (signal?.id && !byId.has(signal.id)) byId.set(signal.id, signal);
  }
  const nextOpportunityState = {
    at: new Date().toISOString(),
    status: "expanded",
    reason: "traffic-starved-new-opportunity-surface",
    expansionRound: round,
    sources: [
      ...(Array.isArray(opportunityState.sources) ? opportunityState.sources : []),
      { id: `traffic-expansion-${round}`, status: "seeded", items: expansionSignals.length },
    ],
    signals: [...byId.values()].slice(0, Math.max(12, count * 2)),
  };
  if (!dryRun) writeJsonFile("opportunity-signals.json", nextOpportunityState);
  const site = generateSite({ seed: Number(seed || todaySeed()) + round, count });
  const deploy = await deployStaticSite({ dryRun });
  const owned = publishGrowthOutboxToOwnedSite({ dryRun, limit: count * channels.length });
  const search = await submitSearchIndex({ dryRun, lab: site.lab });
  const run = {
    id: `traffic_expansion_${Date.now()}`,
    at: new Date().toISOString(),
    round,
    status: "executed",
    dryRun,
    signalsAdded: expansionSignals.length,
    experiments: site.lab.length,
    demandPages: site.lab.reduce((sum, item) => sum + demandCapturePagesFor(item).length, 0),
    deployStatus: deploy.status,
    deployedFiles: deploy.files || 0,
    ownedPublished: owned.published || 0,
    ownedRefreshed: owned.refreshed || 0,
    searchStatus: search.status,
    searchSubmitted: search.submitted || 0,
    searchDiscovered: search.discovered || 0,
    primaryRoute: publishQueueRoutingSummary(loadPublishQueue()).primary,
  };
  recordTrafficExpansionRun(run);
  return run;
}

async function readOpportunitySource(source = {}) {
  if (source.inlineText) return { status: "ok", contentType: "text", items: splitTextOpportunityItems(source.inlineText) };
  if (!source.url) return { status: "blocked", reason: "missing-url", items: [] };
  try {
    const response = await getText(source.url, source.headers || {}, Number(source.timeoutMs || 2500));
    const contentType = String(response.headers["content-type"] || source.type || "").toLowerCase();
    let items;
    if (contentType.includes("json") || source.type === "json") items = flattenOpportunityJson(response.body);
    else if (response.body.includes("<rss") || response.body.includes("<item")) items = parseRssItems(response.body);
    else items = splitTextOpportunityItems(response.body);
    return { status: "ok", statusCode: response.statusCode, contentType, items };
  } catch (error) {
    return { status: "failed", reason: error.message, items: [] };
  }
}

async function scanOpportunitySources({ sources = loadAdapters().opportunitySources || [], limit = 12, useInternalSeeds = true, useDefaultSources = true, defaultSources = defaultOpportunitySources(), seed = todaySeed() } = {}) {
  const configuredSources = Array.isArray(sources) ? sources.filter(Boolean) : [];
  const fallbackSources = Array.isArray(defaultSources) ? defaultSources.filter(Boolean) : [];
  const sourceList = configuredSources.length || !useDefaultSources ? configuredSources : fallbackSources.map((source) => ({ ...source, default: true }));
  const defaultSourcesUsed = !configuredSources.length && useDefaultSources;
  if (!sourceList.length) {
    if (useInternalSeeds) {
      const signals = internalOpportunitySignals({ seed, limit });
      const summary = {
        at: new Date().toISOString(),
        status: "seeded",
        reason: "using-internal-opportunity-seeds",
        sources: [{ id: "internal-seed", status: "seeded", items: signals.length }],
        signals,
      };
      writeJsonFile("opportunity-signals.json", summary);
      return summary;
    }
    const summary = {
      at: new Date().toISOString(),
      status: "blocked",
      reason: "missing-opportunity-sources",
      sources: [],
      signals: [],
    };
    writeJsonFile("opportunity-signals.json", summary);
    return summary;
  }
  const sourceResults = [];
  const signals = [];
  for (const source of sourceList) {
    const result = await readOpportunitySource(source);
    sourceResults.push({
      id: source.id || source.url || "source",
      url: source.url || "",
      status: result.status,
      statusCode: result.statusCode || null,
      reason: result.reason || "",
      items: result.items.length,
    });
    result.items.forEach((item, index) => {
      const signal = normalizeOpportunityItem(item, source, index);
      if (signal) signals.push(signal);
    });
  }
  const supplementalSignals =
    useInternalSeeds && defaultSourcesUsed
      ? [
          ...internalOpportunitySignals({ seed, limit }),
          ...expansionOpportunitySignals({ seed, limit, round: 0 }),
        ].map((item) => ({
          ...item,
          supplemental: true,
          evidence: `默认外部源冷启动补位：${item.evidence}`,
        }))
      : [];
  const byId = new Map();
  for (const signal of signals.sort((a, b) => b.score - a.score)) {
    if (!byId.has(signal.id)) byId.set(signal.id, signal);
  }
  for (const signal of supplementalSignals.sort((a, b) => b.score - a.score)) {
    if (!byId.has(signal.id)) byId.set(signal.id, signal);
  }
  const compact = [...byId.values()].slice(0, limit);
  if (!compact.length && useInternalSeeds) {
    const fallbackSignals = internalOpportunitySignals({ seed, limit });
    const summary = {
      at: new Date().toISOString(),
      status: "seeded",
      reason: configuredSources.length ? "configured-opportunity-sources-empty" : "default-opportunity-sources-empty",
      defaultSourcesUsed,
      sources: [...sourceResults, { id: "internal-seed", status: "seeded", items: fallbackSignals.length }],
      signals: fallbackSignals,
    };
    writeJsonFile("opportunity-signals.json", summary);
    return summary;
  }
  const summary = {
    at: new Date().toISOString(),
    status: compact.length ? "ok" : "empty",
    defaultSourcesUsed,
    reason: supplementalSignals.length && signals.length ? "default-sources-plus-internal-buyer-seeds" : "",
    sources: [
      ...sourceResults,
      ...(supplementalSignals.length ? [{ id: "internal-seed", status: "supplemental", items: supplementalSignals.length }] : []),
    ],
    signals: compact,
  };
  writeJsonFile("opportunity-signals.json", summary);
  return summary;
}

function publicBaseUrl() {
  return String(loadAdapters().publicBaseUrl || "").replace(/\/+$/, "");
}

function isPublicHttpUrl(value) {
  try {
    const target = new URL(value);
    return ["http:", "https:"].includes(target.protocol) && !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(target.hostname);
  } catch {
    return false;
  }
}

function isTemporaryPublicTunnelUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ["trycloudflare.com", "loca.lt", "localtunnel.me", "tunnelmole.net", "ngrok-free.app", "ngrok.io", "pinggy-free.link", "free.pinggy.net"].some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

function publicBaseNeedsProbe(base, adapters = loadAdapters()) {
  return Boolean(adapters.search?.verifyPublicBaseUrl || adapters.search?.publicProbeUrl || isTemporaryPublicTunnelUrl(base));
}

function toPublicUrl(value) {
  const raw = String(value || "");
  if (!raw) return raw;
  const base = publicBaseUrl();
  if (/^https?:\/\//i.test(raw)) {
    if (!base) return raw;
    try {
      const target = new URL(raw);
      if (!isTemporaryPublicTunnelUrl(raw)) return raw;
      const currentBase = new URL(base);
      if (!isTemporaryPublicTunnelUrl(base)) return raw;
      return `${currentBase.origin}${target.pathname}${target.search}${target.hash}`;
    } catch {
      return raw;
    }
  }
  if (!base) return raw;
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function comparableUrlPath(value) {
  const raw = String(value || "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://local.invalid");
    return `${parsed.pathname}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

function configurePublicBaseUrl(publicUrl, { source = "manual" } = {}) {
  const cleanUrl = String(publicUrl || "").replace(/\/+$/, "");
  if (!isPublicHttpUrl(cleanUrl)) {
    const error = new Error("publicUrl must be a non-local http(s) URL");
    error.statusCode = 400;
    throw error;
  }
  const existing = loadAdapters();
  const adapters = saveAdapters({
    ...existing,
    publicBaseUrl: cleanUrl,
    deploy: {
      ...(existing.deploy || {}),
      publicBaseUrl: cleanUrl,
    },
    search: {
      ...(existing.search || {}),
      publicProbeUrl: `${cleanUrl}/api/status`,
    },
  });
  const summary = {
    at: new Date().toISOString(),
    status: "configured",
    source,
    publicBaseUrl: cleanUrl,
    adapters,
  };
  writeJsonFile("public-access.json", summary);
  return summary;
}

function recordPublicAccessAttempt(record = {}) {
  const summary = {
    at: new Date().toISOString(),
    status: record.status || "failed",
    source: record.source || "unknown",
    provider: record.provider || "",
    publicUrl: record.publicUrl || "",
    reason: record.reason || "",
    error: record.error || "",
    command: record.command || "",
    pid: record.pid || null,
    logFile: record.logFile || "",
  };
  writeJsonFile("public-access.json", summary);
  return summary;
}

function loadPublicAccessMonitor() {
  return readJsonFile("public-access-monitor.json", null);
}

function stopRecordedPublicTunnel(record = {}) {
  const safeRecord = record || {};
  const pid = Number(safeRecord.pid || 0);
  const logFile = String(safeRecord.logFile || "");
  const runtimeRoot = `${path.resolve(RUNTIME_DIR)}${path.sep}`;
  if (!Number.isInteger(pid) || pid <= 1 || !logFile || !path.resolve(logFile).startsWith(runtimeRoot)) {
    return { stopped: false, reason: "untrusted-or-missing-tunnel-record" };
  }
  try {
    process.kill(-pid, "SIGTERM");
    return { stopped: true, pid };
  } catch (groupError) {
    try {
      process.kill(pid, "SIGTERM");
      return { stopped: true, pid };
    } catch (error) {
      return {
        stopped: false,
        pid,
        reason: error.code === "ESRCH" ? "tunnel-process-already-stopped" : error.message,
      };
    }
  }
}

function stopManagedPublicTunnelProcesses() {
  const results = [];
  for (const [pid, record] of managedPublicTunnelProcesses.entries()) {
    results.push(stopRecordedPublicTunnel({ ...record, pid }));
    managedPublicTunnelProcesses.delete(pid);
  }
  return {
    stopped: results.filter((item) => item.stopped).length,
    results,
  };
}

function recordedPublicTunnelIsAlive(record = {}) {
  const safeRecord = record || {};
  const pid = Number(safeRecord.pid || 0);
  const logFile = String(safeRecord.logFile || "");
  const runtimeRoot = `${path.resolve(RUNTIME_DIR)}${path.sep}`;
  if (!Number.isInteger(pid) || pid <= 1 || !logFile || !path.resolve(logFile).startsWith(runtimeRoot)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runPublicAccessMonitorOnceUnlocked({
  port = 4188,
  failureThreshold = 3,
  retryCooldownMs = 10 * 60 * 1000,
  probeTimeoutMs = 5000,
  probe = checkPublicBaseReachable,
  tunnelStarter = startAutonomousPublicTunnel,
  configure = configurePublicBaseUrl,
  siteBuilder = () => generateSite({ seed: todaySeed(), count: 8 }),
  deployer = deployStaticSite,
  searchSubmitter = submitSearchIndex,
  frontBuilder = null,
  tunnelStopper = stopRecordedPublicTunnel,
  tunnelAlive = recordedPublicTunnelIsAlive,
  now = () => new Date().toISOString(),
} = {}) {
  const previous = loadPublicAccessMonitor() || {};
  const previousActiveTunnel = tunnelAlive(previous.activeTunnel) ? previous.activeTunnel : null;
  const adapters = loadAdapters();
  const currentUrl = String(adapters.publicBaseUrl || "").replace(/\/+$/, "");
  const checkedAt = now();
  const health = isPublicHttpUrl(currentUrl)
    ? await probe(currentUrl, { timeoutMs: probeTimeoutMs })
    : { configured: false, reachable: false, url: currentUrl, error: "public base URL is missing" };

  if (health.reachable) {
    const lastPublicAccess = loadPublicAccess();
    const recordedAccessTunnel =
      lastPublicAccess?.publicUrl === currentUrl && tunnelAlive(lastPublicAccess)
        ? lastPublicAccess
        : null;
    const activeTunnel =
      previousActiveTunnel?.publicUrl === currentUrl
        ? previousActiveTunnel
        : recordedAccessTunnel;
    const healthy = {
      at: checkedAt,
      status: "healthy",
      publicUrl: currentUrl,
      consecutiveFailures: 0,
      lastProbe: health,
      activeTunnel: activeTunnel
        ? {
            provider: activeTunnel.provider || "",
            publicUrl: activeTunnel.publicUrl,
            pid: activeTunnel.pid || null,
            logFile: activeTunnel.logFile || "",
          }
        : null,
    };
    writeJsonFile("public-access-monitor.json", healthy);
    return healthy;
  }

  const consecutiveFailures = Number(previous.consecutiveFailures || 0) + 1;
  if (consecutiveFailures < Math.max(1, Number(failureThreshold) || 3)) {
    const degraded = {
      at: checkedAt,
      status: "degraded",
      publicUrl: currentUrl,
      consecutiveFailures,
      failureThreshold,
      lastProbe: health,
      activeTunnel: previousActiveTunnel?.publicUrl === currentUrl ? previousActiveTunnel : null,
    };
    writeJsonFile("public-access-monitor.json", degraded);
    return degraded;
  }

  const retryAfter = Date.parse(previous.retryAfter || "");
  if (previous.status === "heal-failed" && Number.isFinite(retryAfter) && Date.now() < retryAfter) {
    const coolingDown = {
      at: checkedAt,
      status: "cooldown",
      publicUrl: currentUrl,
      consecutiveFailures,
      failureThreshold,
      retryAfter: previous.retryAfter,
      lastProbe: health,
      error: previous.error || "",
      activeTunnel: previousActiveTunnel?.publicUrl === currentUrl ? previousActiveTunnel : null,
    };
    writeJsonFile("public-access-monitor.json", coolingDown);
    return coolingDown;
  }

  const lastPublicAccess = loadPublicAccess();
  const recordedAccessTunnel =
    lastPublicAccess?.publicUrl === currentUrl && tunnelAlive(lastPublicAccess)
      ? lastPublicAccess
      : null;
  const oldTunnel = previousActiveTunnel?.publicUrl === currentUrl
    ? previousActiveTunnel
    : recordedAccessTunnel;
  const lastProvider = oldTunnel?.provider || previous.activeTunnel?.provider || "";
  const nextProvider = nextPublicTunnelProvider(lastProvider);
  let newTunnel = null;
  let publicBaseChanged = false;
  try {
    const providerOrder = [
      nextProvider,
      ...AUTO_PUBLIC_TUNNEL_PROVIDERS.filter((provider) => provider !== nextProvider),
    ];
    let tunnel = null;
    let tunnelError = null;
    for (const provider of providerOrder) {
      try {
        tunnel = await tunnelStarter({ port, provider });
        break;
      } catch (error) {
        tunnelError = error;
      }
    }
    if (!tunnel) throw tunnelError || new Error("no public tunnel provider succeeded");
    newTunnel = tunnel;
    const configured = configure(tunnel.publicUrl, { source: `public-access-monitor:${tunnel.provider || nextProvider}` });
    publicBaseChanged = true;
    const site = await siteBuilder();
    const deploy = await deployer({ dryRun: false });
    const buildFront = frontBuilder || ((options) => require("../scripts/build-public-front").buildPublicFront(options));
    const front = await buildFront({ serviceUrl: configured.publicBaseUrl });
    const search = await searchSubmitter({ dryRun: false, lab: site.lab });
    const stoppedOldTunnel =
      oldTunnel && Number(oldTunnel.pid || 0) !== Number(tunnel.pid || 0)
        ? tunnelStopper(oldTunnel)
        : { stopped: false, reason: "no-previous-managed-tunnel" };
    const healed = {
      at: checkedAt,
      status: "healed",
      previousUrl: currentUrl,
      publicUrl: configured.publicBaseUrl,
      consecutiveFailures: 0,
      failureThreshold,
      lastProbe: health,
      activeTunnel: {
        provider: tunnel.provider || nextProvider,
        publicUrl: tunnel.publicUrl,
        pid: tunnel.pid || null,
        logFile: tunnel.logFile || "",
      },
      deployStatus: deploy.status || "",
      searchStatus: search.status || "",
      searchSubmitted: search.submitted || 0,
      frontDirectory: front.directory || "",
      stoppedOldTunnel,
    };
    writeJsonFile("public-access-monitor.json", healed);
    return healed;
  } catch (error) {
    const stoppedFailedTunnel = newTunnel
      ? tunnelStopper(newTunnel)
      : { stopped: false, reason: "new-tunnel-never-started" };
    if (publicBaseChanged) {
      saveAdapters(adapters);
    }
    const failed = {
      at: checkedAt,
      status: "heal-failed",
      publicUrl: currentUrl,
      consecutiveFailures,
      failureThreshold,
      lastProbe: health,
      error: error.message,
      retryAfter: new Date(Date.now() + Math.max(60000, Number(retryCooldownMs) || 10 * 60 * 1000)).toISOString(),
      activeTunnel: previousActiveTunnel?.publicUrl === currentUrl ? previousActiveTunnel : null,
      stoppedFailedTunnel,
      publicBaseRolledBack: publicBaseChanged,
    };
    writeJsonFile("public-access-monitor.json", failed);
    return failed;
  }
}

function acquirePublicAccessMonitorLock() {
  ensureDirs();
  const lockDir = path.join(DATA_DIR, "public-access-monitor.lock");
  try {
    fs.mkdirSync(lockDir);
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    );
    return {
      acquired: true,
      release: () => fs.rmSync(lockDir, { recursive: true, force: true }),
    };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner = null;
    try {
      owner = JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
    } catch {}
    const ownerPid = Number(owner?.pid || 0);
    let ownerAlive = false;
    if (Number.isInteger(ownerPid) && ownerPid > 1) {
      try {
        process.kill(ownerPid, 0);
        ownerAlive = true;
      } catch {}
    }
    if (ownerAlive) {
      return { acquired: false, ownerPid, release: () => {} };
    }
    fs.rmSync(lockDir, { recursive: true, force: true });
    return acquirePublicAccessMonitorLock();
  }
}

async function runPublicAccessMonitorOnce(options = {}) {
  const lock = acquirePublicAccessMonitorLock();
  if (!lock.acquired) {
    const current = loadPublicAccessMonitor() || {};
    return {
      ...current,
      status: "monitor-busy",
      ownerPid: lock.ownerPid,
      skipped: true,
    };
  }
  try {
    return await runPublicAccessMonitorOnceUnlocked(options);
  } finally {
    lock.release();
  }
}

function startPublicAccessMonitor({
  intervalMs = 60000,
  unref = true,
  runOnce = runPublicAccessMonitorOnce,
  ...options
} = {}) {
  let inFlight = null;
  const run = () => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve(runOnce(options)).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  const timer = setInterval(() => {
    run().catch((error) => {
      writeJsonFile("public-access-monitor.json", {
        at: new Date().toISOString(),
        status: "monitor-error",
        error: error.message,
      });
    });
  }, Math.max(1000, Number(intervalMs) || 60000));
  if (unref) timer.unref?.();
  return {
    run,
    stop: ({ stopActiveTunnel = false } = {}) => {
      clearInterval(timer);
      if (!stopActiveTunnel) return { stopped: true, tunnel: { stopped: false, reason: "tunnel-left-running" } };
      const state = loadPublicAccessMonitor();
      const tunnel = state?.activeTunnel ? stopRecordedPublicTunnel(state.activeTunnel) : { stopped: false, reason: "no-active-managed-tunnel" };
      return { stopped: true, tunnel };
    },
    intervalMs: Math.max(1000, Number(intervalMs) || 60000),
  };
}

function resolveBundledNpxCommand() {
  const candidates = [
    path.join(path.dirname(process.execPath), "npx"),
    path.join(path.dirname(process.execPath), "npx.cmd"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "npx";
}

const AUTO_PUBLIC_TUNNEL_PROVIDERS = ["tunnelmole", "localtunnel", "pinggy"];

function publicTunnelProviders(provider = "auto") {
  return provider === "auto" ? [...AUTO_PUBLIC_TUNNEL_PROVIDERS] : [provider];
}

function nextPublicTunnelProvider(lastProvider = "") {
  const currentIndex = AUTO_PUBLIC_TUNNEL_PROVIDERS.indexOf(lastProvider);
  return AUTO_PUBLIC_TUNNEL_PROVIDERS[(currentIndex + 1) % AUTO_PUBLIC_TUNNEL_PROVIDERS.length];
}

function choosePublicTunnelCommand({ port = 4188, provider = "tunnelmole", subdomain = "", pinggyIp = "" } = {}) {
  if (provider === "cloudflared") {
    const bundledCloudflared = path.join(RUNTIME_DIR, "bin", "cloudflared");
    return {
      command: fs.existsSync(bundledCloudflared) ? bundledCloudflared : "cloudflared",
      args: ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"],
    };
  }
  if (provider === "tunnelmole") {
    return {
      command: resolveBundledNpxCommand(),
      args: ["--yes", "tunnelmole", String(port), ...(subdomain ? ["as", `${subdomain}.tunnelmole.net`] : [])],
    };
  }
  if (provider === "localtunnel") {
    return {
      command: resolveBundledNpxCommand(),
      args: ["--yes", "localtunnel", "--port", String(port), ...(subdomain ? ["--subdomain", subdomain] : [])],
    };
  }
  if (provider === "pinggy") {
    if (!pinggyIp) return null;
    return {
      command: "ssh",
      args: [
        "-p",
        "443",
        "-o",
        `HostName=${pinggyIp}`,
        "-o",
        "HostKeyAlias=a.pinggy.io",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ExitOnForwardFailure=yes",
        "-T",
        `-R0:localhost:${port}`,
        "a.pinggy.io",
      ],
    };
  }
  return null;
}

function extractPublicTunnelUrl(text) {
  const matches = String(text || "").match(/https:\/\/[A-Za-z0-9.-]+(?:trycloudflare\.com|loca\.lt|localtunnel\.me|tunnelmole\.net|ngrok-free\.app|ngrok\.io|pinggy-free\.link|free\.pinggy\.net)[^\s"']*/g);
  return matches?.[0]?.replace(/[),.]+$/, "") || "";
}

async function resolvePinggyIp({ resolver = getJson } = {}) {
  const response = await resolver("https://dns.google/resolve?name=a.pinggy.io&type=A", {}, 5000);
  const answer = Array.isArray(response?.Answer) ? response.Answer : [];
  const record = answer.find((item) => Number(item.type) === 1 && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(item.data || "")));
  if (!record) throw new Error("Pinggy DNS-over-HTTPS lookup returned no IPv4 address");
  return String(record.data);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startAutonomousPublicTunnel({
  port = 4188,
  provider = "auto",
  subdomain = "",
  timeoutMs = 45000,
  probeTimeoutMs = 2000,
  stabilityProbeCount = 3,
  stabilityIntervalMs = 1000,
  spawnProcess = spawn,
} = {}) {
  ensureDirs();
  const providers = publicTunnelProviders(provider);
  const startedAt = new Date().toISOString();
  let lastError = null;
  for (const selected of providers) {
    let pinggyIp = "";
    if (selected === "pinggy") {
      try {
        pinggyIp = await resolvePinggyIp();
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    const spec = choosePublicTunnelCommand({ port, provider: selected, subdomain, pinggyIp });
    if (!spec) {
      lastError = new Error(`unsupported tunnel provider: ${selected}`);
      continue;
    }
    const logFile = path.join(RUNTIME_DIR, `public-tunnel-${Date.now()}-${selected}.log`);
    const out = fs.openSync(logFile, "a");
    const child = spawnProcess(spec.command, spec.args, {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", out, out],
    });
    let processExit = null;
    if (child.pid) {
      managedPublicTunnelProcesses.set(child.pid, {
        provider: selected,
        pid: child.pid,
        logFile,
      });
      child.once?.("exit", (code, signal) => {
        processExit = { code, signal };
        managedPublicTunnelProcesses.delete(child.pid);
      });
    }
    let spawnError = null;
    child.once?.("error", (error) => {
      spawnError = error;
    });
    try {
      fs.closeSync(out);
    } catch {}
    child.unref?.();
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 45000);
    let lastProbe = null;
    let lastCandidateUrl = "";
    let consecutiveReachable = 0;
    const requiredReachable = Math.max(1, Number(stabilityProbeCount) || 3);
    while (Date.now() < deadline) {
      if (spawnError) break;
      if (processExit) {
        spawnError = new Error(
          `${selected} tunnel process exited before becoming stable (code=${processExit.code ?? "null"}, signal=${processExit.signal || "none"})`
        );
        break;
      }
      const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
      const publicUrl = extractPublicTunnelUrl(logText);
      if (publicUrl) {
        lastProbe = await checkPublicBaseReachable(publicUrl, { timeoutMs: probeTimeoutMs });
        if (lastProbe.reachable) {
          consecutiveReachable = publicUrl === lastCandidateUrl ? consecutiveReachable + 1 : 1;
          lastCandidateUrl = publicUrl;
        } else {
          consecutiveReachable = 0;
          lastCandidateUrl = publicUrl;
        }
        if (consecutiveReachable >= requiredReachable) {
          const summary = recordPublicAccessAttempt({
            status: "running",
            source: "execution-queue-public-tunnel",
            provider: selected,
            publicUrl,
            command: `${spec.command} ${spec.args.join(" ")}`,
            pid: child.pid || null,
            logFile,
          });
          return {
            ...summary,
            publicUrl,
            provider: selected,
            command: `${spec.command} ${spec.args.join(" ")}`,
            pid: child.pid || null,
            logFile,
            startedAt,
            probe: {
              ...lastProbe,
              consecutiveReachable,
              requiredReachable,
            },
          };
        }
      }
      await sleep(publicUrl && lastProbe?.reachable ? Math.max(250, Number(stabilityIntervalMs) || 1000) : 750);
    }
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          process.kill(child.pid, "SIGTERM");
        } catch {}
      }
      managedPublicTunnelProcesses.delete(child.pid);
    }
    lastError = spawnError || new Error(`timed out waiting for reachable ${selected} public URL${lastProbe?.error ? `: ${lastProbe.error}` : ""}`);
    recordPublicAccessAttempt({
      status: "failed",
      source: "execution-queue-public-tunnel",
      provider: selected,
      command: `${spec.command} ${spec.args.join(" ")}`,
      pid: child.pid || null,
      logFile,
      error: lastError.message,
    });
  }
  throw lastError || new Error("no public tunnel provider succeeded");
}

function loadStrategy() {
  return readJsonFile("strategy.json", null);
}

function loadWorkerHistory() {
  return readJsonFile("worker-history.json", []);
}

function loadLastRun() {
  return readJsonFile("last-run.json", null);
}

function loadLastWorker() {
  return readJsonFile("last-worker.json", null);
}

function loadLastPaymentSync() {
  return readJsonFile("last-payment-sync.json", null);
}

function loadLastSearchSubmit() {
  return readJsonFile("last-search-submit.json", null);
}

function loadTrafficExpansion() {
  return readJsonFile("traffic-expansion.json", { runs: [] });
}

function recordTrafficExpansionRun(run) {
  const current = loadTrafficExpansion();
  const runs = Array.isArray(current.runs) ? current.runs : [];
  const next = {
    at: run.at || new Date().toISOString(),
    runs: [run, ...runs].slice(0, 20),
  };
  writeJsonFile("traffic-expansion.json", next);
  return next;
}

function loadLastDeploy() {
  return readJsonFile("last-deploy.json", null);
}

function loadPublicAccess() {
  return readJsonFile("public-access.json", null);
}

function loadActionPlan() {
  return readJsonFile("action-plan.json", null);
}

function loadLastActionExecution() {
  return readJsonFile("last-action-execution.json", null);
}

function loadActionExecutionHistory() {
  return readJsonFile("action-execution-history.json", []);
}

function loadExecutionQueueHistory() {
  return readJsonFile("execution-queue-history.json", []);
}

function loadAutonomousSupervisorHistory() {
  return readJsonFile("autonomous-supervisor-history.json", []);
}

function loadVariantOptimizations() {
  return readJsonFile("variant-optimizations.json", []);
}

function loadRecoveryOutbox() {
  return readJsonFile("recovery-outbox.json", []);
}

function loadLastResultSync() {
  return readJsonFile("last-result-sync.json", null);
}

function loadLocalLoopWatcher() {
  return readJsonFile("local-loop-watcher.json", null);
}

function loadAdapterHealth() {
  return readJsonFile("adapter-health.json", null);
}

function appendWorkerHistory(summary) {
  const history = loadWorkerHistory();
  history.push(summary);
  const compact = history.slice(-100);
  writeJsonFile("worker-history.json", compact);
  return compact;
}

function appendActionExecutionHistory(summary) {
  const history = loadActionExecutionHistory();
  history.push(summary);
  const compact = history.slice(-100);
  writeJsonFile("action-execution-history.json", compact);
  return compact;
}

function appendExecutionQueueHistory(summary) {
  const history = loadExecutionQueueHistory();
  history.push(summary);
  const compact = history.slice(-100);
  writeJsonFile("execution-queue-history.json", compact);
  return compact;
}

function recordAutonomousSupervisorState(state) {
  const previous = loadAutonomousSupervisor() || {};
  const next = {
    ...previous,
    ...state,
    at: new Date().toISOString(),
  };
  writeJsonFile("autonomous-supervisor.json", next);
  const history = loadAutonomousSupervisorHistory();
  history.push(next);
  writeJsonFile("autonomous-supervisor-history.json", history.slice(-200));
  return next;
}

function revenueSnapshot() {
  const orders = loadOrders();
  const checkouts = loadCheckouts();
  const paidOrders = orders.filter((order) => order.status === "paid" || order.status === "delivered" || Number(order.amount || 0) > 0);
  return {
    revenue: Number(paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0).toFixed(2)),
    orders: orders.length,
    paidOrders: paidOrders.length,
    checkouts: {
      total: checkouts.length,
      pending: checkouts.filter((item) => ["pending", "proof-submitted", "underpaid"].includes(item.status)).length,
      paid: checkouts.filter((item) => item.status === "paid").length,
    },
  };
}

function saveVariantOptimization(record) {
  const optimizations = loadVariantOptimizations();
  const next = {
    at: new Date().toISOString(),
    ...record,
  };
  const existingIndex = optimizations.findIndex((item) => item.experimentId === next.experimentId);
  if (existingIndex >= 0) optimizations[existingIndex] = { ...optimizations[existingIndex], ...next };
  else optimizations.push(next);
  writeJsonFile("variant-optimizations.json", optimizations);
  return next;
}

function checkoutRecoveryPackage(checkout, context = {}) {
  const experiment = knownExperiments().find((item) => item.id === checkout.experimentId) || {};
  const recoveryUrl = publicCheckoutRecoveryUrl(checkout.id);
  return {
    id: `recovery_${checkout.id}`,
    checkoutId: checkout.id,
    experimentId: checkout.experimentId,
    variantId: checkout.variantId || null,
    offer: checkout.offer || null,
    amount: checkout.amount,
    expectedAmount: checkout.expectedAmount || checkout.amount,
    receivedAmount: checkout.receivedAmount || 0,
    shortAmount: checkout.shortAmount || Math.max(0, Number((Number(checkout.expectedAmount || checkout.amount) - Number(checkout.receivedAmount || 0)).toFixed(2))),
    status: checkout.status,
    paymentRemark: checkout.paymentRemark,
    recoveryUrl,
    checkoutStatusUrl: checkout.statusUrl || toPublicUrl(`/checkout/${encodeURIComponent(checkout.id)}`),
    wechatQrUrl: toPublicUrl("/wechat-pay.jpg"),
    productTitle: experiment.title || checkout.experimentId,
    buyer: experiment.buyer || "",
    source: context.source || "automatic-unpaid-checkout-recovery",
    reason: context.reason || "",
    trigger: context.trigger || "",
    recommendedPublishUrl: context.recommendedPublishUrl || "",
    createdAt: checkout.createdAt || "",
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckoutRecoveryPackages(checkoutIds = [], context = {}) {
  const ids = new Set((checkoutIds || []).filter(Boolean));
  if (!ids.size) return [];
  const checkouts = loadCheckouts().filter((item) => ids.has(item.id) && ["pending", "underpaid"].includes(item.status));
  if (!checkouts.length) return [];
  const outbox = loadRecoveryOutbox();
  const packages = checkouts.map((checkout) => checkoutRecoveryPackage(checkout, context));
  for (const pkg of packages) {
    const existingIndex = outbox.findIndex((item) => item.id === pkg.id);
    if (existingIndex >= 0) outbox[existingIndex] = { ...outbox[existingIndex], ...pkg };
    else outbox.push(pkg);
  }
  writeJsonFile("recovery-outbox.json", outbox);
  return packages;
}

function adapterGateActions({ adapters = loadAdapters(), health = loadAdapterHealth(), publishQueue = loadPublishQueue(), outbox = loadOutbox(), checkouts = loadCheckouts() } = {}) {
  const hasHealth = Array.isArray(health?.checks);
  const checks = hasHealth ? health.checks : [];
  const gate = (kinds) => {
    const selected = checks.filter((item) => kinds.includes(item.kind));
    const configured = selected.filter((item) => item.configured).length;
    const reachable = selected.filter((item) => item.reachable).length;
    const blocked = selected.filter((item) => item.configured && !item.reachable);
    return { selected, configured, reachable, blocked };
  };
  const actions = [];
  const waitingPublish = publishQueue.filter((item) => !["sent", "handed-off"].includes(item.status));
  const publishConfigured =
    Object.values(adapters.channels || {}).filter((item) => item?.webhookUrl).length +
    (adapters.growthWebhooks || []).filter((item) => item?.webhookUrl).length +
    (adapters.growthOutbox?.dir ? 1 : 0);
  const publishGate = gate(["publish-channel", "growth-webhook", "growth-outbox"]);
  if (waitingPublish.length && (!publishConfigured || (hasHealth && !publishGate.reachable))) {
    actions.push({
      type: "fix-adapter-publish",
      priority: 130,
      target: "publish-adapter",
      count: waitingPublish.length,
      reason: !publishConfigured
        ? `还有 ${waitingPublish.length} 条发布任务，但没有配置可用的发布/增长 webhook 或 outbox 目录。`
        : `还有 ${waitingPublish.length} 条发布任务，但已配置的发布/增长 webhook 或 outbox 目录当前不可达。`,
      command: "configure publish channels, growthWebhooks or growthOutbox.dir",
      health: publishGate,
    });
  }
  const pendingDeliveries = outbox.filter((item) => item.status === "queued" || item.status === "prepared" || item.status === "failed");
  const fulfillmentGate = gate(["fulfillment"]);
  const fulfillmentConfigured = Boolean(adapters.fulfillment?.webhookUrl || adapters.fulfillment?.outboxDir);
  if (pendingDeliveries.length && (!fulfillmentConfigured || (hasHealth && !fulfillmentGate.reachable))) {
    actions.push({
      type: "fix-adapter-fulfillment",
      priority: 125,
      target: "fulfillment-adapter",
      count: pendingDeliveries.length,
      reason: !fulfillmentConfigured
        ? `还有 ${pendingDeliveries.length} 条交付任务，但没有配置交付 webhook 或 outbox 目录。`
        : `还有 ${pendingDeliveries.length} 条交付任务，但交付 webhook 或 outbox 目录当前不可达。`,
      command: "configure fulfillment.webhookUrl or fulfillment.outboxDir",
      health: fulfillmentGate,
    });
  }
  const pendingCheckouts = checkouts.filter((item) => ["pending", "proof-submitted"].includes(item.status));
  const paymentGate = gate(["payment-feed"]);
  if (pendingCheckouts.length && (!adapters.payments?.feedUrl || (hasHealth && !paymentGate.reachable))) {
    actions.push({
      type: "fix-adapter-payment",
      priority: 120,
      target: "payment-feed",
      count: pendingCheckouts.length,
      reason: !adapters.payments?.feedUrl
        ? `还有 ${pendingCheckouts.length} 个待支付 checkout，但没有配置付款 feed。`
        : `还有 ${pendingCheckouts.length} 个待支付 checkout，但付款 feed 当前不可达。`,
      command: "configure payments.feedUrl or payment webhook bridge",
      health: paymentGate,
    });
  }
  const deployGate = gate(["deploy"]);
  const publicBase = publicBaseUrl();
  const publicAccessGate = gate(["public-access"]);
  const publicAccessBlocked = hasHealth && publicAccessGate.blocked.length > 0;
  if ((!isPublicHttpUrl(publicBase) || publicAccessBlocked) && (!adapters.deploy?.webhookUrl || (hasHealth && !deployGate.reachable))) {
    actions.push({
      type: "open-public-tunnel",
      priority: 110,
      target: "public-access",
      reason: publicAccessBlocked
        ? "已配置的公网 publicBaseUrl 当前探活失败；应重新打开公网隧道或部署到稳定域名，避免继续提交死链接。"
        : !adapters.deploy?.webhookUrl
          ? "站点还没有可探活的公网 publicBaseUrl；应先自动尝试公网隧道，探活通过后再提交搜索。"
          : "站点还没有公网 publicBaseUrl，且部署 webhook 当前不可达，无法自动上线。",
      command: "node src/cli.js public-tunnel --provider auto --port 4188",
      health: publicAccessBlocked ? publicAccessGate : deployGate,
    });
  }
  return actions;
}

function comboKey(marketId, offerTypeId) {
  return `${marketId}::${offerTypeId}`;
}

function experimentMatchesCombo(experimentId, marketId, offerTypeId) {
  const value = String(experimentId || "");
  return value.startsWith(`${marketId}-${offerTypeId}-`) || value.startsWith(`opportunity-${marketId}-${offerTypeId}-`);
}

function isLeadEvent(event) {
  return ["lead-tool-result", "sample-lead", "sales-assistant-message"].includes(event?.type);
}

function isHighIntentLeadEvent(event) {
  if (!isLeadEvent(event)) return false;
  if (event.highIntent === false) return false;
  return Number(event.score || 0) >= 4 || event.highIntent === true;
}

function computeComboMetrics(events = loadEvents(), orders = loadOrders()) {
  const combos = [];
  for (const market of markets) {
    for (const offerType of offerTypes) {
      const metrics = { views: 0, clicks: 0, leads: 0, paid: 0, delivered: 0, revenue: 0, pendingDelivery: 0 };
      for (const event of events) {
        if (!experimentMatchesCombo(event.experimentId, market.id, offerType.id)) continue;
        if (!isBuyerSignalEvent(event)) continue;
        if (event.type === "view") metrics.views += 1;
        if (event.type === "click") metrics.clicks += 1;
        if (isLeadEvent(event)) metrics.leads += 1;
      }
      for (const order of orders) {
        if (!experimentMatchesCombo(order.experimentId, market.id, offerType.id)) continue;
        metrics.paid += order.status === "paid" || order.status === "delivered" ? 1 : 0;
        metrics.delivered += order.status === "delivered" ? 1 : 0;
        metrics.pendingDelivery += order.status === "paid" ? 1 : 0;
        metrics.revenue += Number(order.amount || 0);
      }
      const scored = scoreExperiment(metrics);
      combos.push({
        key: comboKey(market.id, offerType.id),
        marketId: market.id,
        offerTypeId: offerType.id,
        marketName: market.name,
        offerLabel: offerType.label,
        metrics,
        ...scored,
      });
    }
  }
  return combos;
}

function buildStrategy({ seed = todaySeed(), count = 8 } = {}) {
  const combos = computeComboMetrics();
  const opportunitySignals = validOpportunitySignals(Math.floor(count / 2));
  const hasEvidence = combos.some((item) => item.metrics.views || item.metrics.clicks || item.metrics.paid || item.metrics.revenue);
  const deterministicOrder = new Map();
  const baseline = generateHypotheses({ seed, count: markets.length * offerTypes.length });
  for (const [index, item] of baseline.entries()) {
    deterministicOrder.set(comboKey(item.marketId, item.offerTypeId), index);
  }
  const ranked = [...combos].sort((a, b) => {
    if (b.metrics.paid !== a.metrics.paid) return b.metrics.paid - a.metrics.paid;
    if (b.metrics.revenue !== a.metrics.revenue) return b.metrics.revenue - a.metrics.revenue;
    if (b.metrics.clicks !== a.metrics.clicks) return b.metrics.clicks - a.metrics.clicks;
    if (b.score !== a.score) return b.score - a.score;
    return (deterministicOrder.get(a.key) ?? 999) - (deterministicOrder.get(b.key) ?? 999);
  });
  const promoted = ranked.filter((item) => item.metrics.paid > 0 || item.metrics.revenue > 0);
  const suppressed = ranked.filter((item) => item.decision === "kill");
  const selected = (hasEvidence ? ranked : baseline.map((item) => combos.find((combo) => combo.key === comboKey(item.marketId, item.offerTypeId)))).filter(Boolean).slice(0, count);
  return {
    at: new Date().toISOString(),
    seed,
    count,
    hasEvidence,
    opportunitySignals: opportunitySignals.map((item) => ({
      id: item.id,
      keyword: item.keyword,
      sourceId: item.sourceId,
      marketId: item.marketId,
      offerTypeId: item.offerTypeId,
      score: item.score,
    })),
    promotedCombos: promoted.map((item) => ({
      key: item.key,
      marketId: item.marketId,
      offerTypeId: item.offerTypeId,
      paid: item.metrics.paid,
      revenue: item.metrics.revenue,
      decision: item.decision,
    })),
    suppressedCombos: suppressed.map((item) => ({
      key: item.key,
      marketId: item.marketId,
      offerTypeId: item.offerTypeId,
      views: item.metrics.views,
      clicks: item.metrics.clicks,
      decision: item.decision,
    })),
    selectedCombos: selected.map((item) => ({
      key: item.key,
      marketId: item.marketId,
      offerTypeId: item.offerTypeId,
      decision: item.decision,
      score: item.score,
    })),
    pricingRules: ranked.map(priceRuleForCombo),
  };
}

function channelReadiness(channel, adapters = loadAdapters(), health = loadAdapterHealth()) {
  if (channel === "landing-page") return { status: "owned", reason: "站内售卖页总是可生成", configured: true, reachable: true };
  const checks = Array.isArray(health?.checks) ? health.checks : [];
  const channelAdapter = adapters.channels?.[channel];
  const growthTargets = (adapters.growthWebhooks || []).filter((item) => {
    if (!item?.webhookUrl) return false;
    const targetChannels = Array.isArray(item.channels) && item.channels.length ? item.channels : ["*"];
    return targetChannels.includes("*") || targetChannels.includes(channel);
  });
  const configured = Boolean(channelAdapter?.webhookUrl || growthTargets.length);
  if (!configured) return { status: "blocked", reason: "external-account-authorization-required", configured: false, reachable: false };
  const relevant = checks.filter((item) => {
    if (item.kind === "publish-channel" && item.id === channel) return true;
    if (item.kind !== "growth-webhook") return false;
    const webhook = growthTargets.find((target, index) => (target.id || `growth:${index}`) === item.id);
    return Boolean(webhook);
  });
  if (!relevant.length) return { status: "configured", reason: "health-not-checked", configured: true, reachable: null };
  const reachable = relevant.some((item) => item.reachable);
  return reachable
    ? { status: "active", reason: "reachable-adapter", configured: true, reachable: true }
    : { status: "blocked", reason: "adapter-unreachable", configured: true, reachable: false };
}

function trafficScoreForExperiment(experiment) {
  const metrics = experiment.metrics || {};
  const opportunityScore = Number(experiment.opportunity?.score || 0);
  const revenue = Number(metrics.revenue || 0);
  const paid = Number(metrics.paid || 0);
  const clicks = Number(metrics.clicks || 0);
  const views = Number(metrics.views || 0);
  const freshness = experiment.id.startsWith("opportunity-") ? 25 : 0;
  const conversion = paid * 120 + revenue * 2 + clicks * 6 + Math.min(views, 100) * 0.2;
  const variantScore = Number(experiment.winningVariant?.score || 0);
  return Number((freshness + opportunityScore + conversion + variantScore).toFixed(2));
}

function bestSeoIntentForExperiment(experiment, events = loadEvents()) {
  const counts = new Map();
  for (const event of events) {
    if (event.experimentId !== experiment.id || event.type !== "view") continue;
    if (!isBuyerSignalEvent(event)) continue;
    const match = /^server:seo:(.+)$/i.exec(String(event.channel || ""));
    if (!match) continue;
    const intent = match[1];
    counts.set(intent, (counts.get(intent) || 0) + 1);
  }
  if (!counts.size) return null;
  const pages = seoPagesFor(experiment);
  const ranked = [...counts.entries()]
    .map(([intent, views]) => {
      const page = pages.find((item) => item.intent === intent);
      return page ? { ...page, views, url: seoPageUrl(page) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.views - a.views || a.intent.localeCompare(b.intent));
  return ranked[0] || null;
}

function bestUtilityIntentForExperiment(experiment, events = loadEvents()) {
  const counts = new Map();
  for (const event of events) {
    if (event.experimentId !== experiment.id || event.type !== "view") continue;
    if (!isBuyerSignalEvent(event)) continue;
    const match = /^server:utility:(.+)$/i.exec(String(event.channel || ""));
    if (!match) continue;
    const intent = match[1];
    counts.set(intent, (counts.get(intent) || 0) + 1);
  }
  const pages = utilityIntentPagesFor(experiment);
  if (!counts.size) {
    const preferred = pages.find((page) => page.intent === "fit-calculator") || pages[0];
    return preferred
      ? {
          ...preferred,
          views: 0,
          url: publicUtilityIntentUrl(preferred),
          reason: "cold-start-interactive-utility",
        }
      : null;
  }
  const ranked = [...counts.entries()]
    .map(([intent, views]) => {
      const page = pages.find((item) => item.intent === intent);
      return page ? { ...page, views, url: publicUtilityIntentUrl(page), reason: "observed-utility-interest" } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.views - a.views || a.intent.localeCompare(b.intent));
  return ranked[0] || null;
}

function bestHubPageForExperiment(experiment, events = loadEvents()) {
  const candidates = [
    {
      kind: "market",
      id: experiment.marketId,
      title: `${marketById(experiment.marketId)?.name || experiment.marketId}今天能买的现成包`,
      url: publicMarketHubUrl(experiment.marketId),
    },
    {
      kind: "offer-type",
      id: experiment.offerTypeId,
      title: `${offerTypeById(experiment.offerTypeId)?.label || experiment.offerTypeId}：自动生成的可购买交付`,
      url: publicOfferTypeHubUrl(experiment.offerTypeId),
    },
  ].filter((item) => item.id);
  const counts = new Map(candidates.map((item) => [`${item.kind}:${item.id}`, 0]));
  for (const event of events) {
    if (event.type !== "view") continue;
    for (const candidate of candidates) {
      const key = `${candidate.kind}:${candidate.id}`;
      const marker = `hub:${key}`;
      const serverMarker = `server:${marker}`;
      if (event.experimentId === marker || event.channel === marker || event.channel === serverMarker) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  const ranked = candidates
    .map((item) => ({ ...item, views: counts.get(`${item.kind}:${item.id}`) || 0 }))
    .filter((item) => item.views > 0)
    .sort((a, b) => b.views - a.views || a.kind.localeCompare(b.kind));
  return ranked[0] || null;
}

function samplePageRecommendationForExperiment(experiment, events = loadEvents()) {
  const metrics = experiment.metrics || {};
  const highIntentLeads = events.filter((event) => event.experimentId === experiment.id && isHighIntentLeadEvent(event)).length;
  const hasBuyerCommitment = Boolean(
    Number(metrics.checkouts || 0) ||
      Number(metrics.paid || 0) ||
      Number(metrics.revenue || 0) ||
      highIntentLeads
  );
  if (hasBuyerCommitment) return null;
  return {
    kind: "sample",
    id: experiment.id,
    title: `免费样例：${experiment.title}`,
    url: publicSamplePageUrl(experiment.id),
    views: 0,
    highIntentLeads,
    reason: "cold-start-trust-sample",
  };
}

function buildTrafficPlan({ lab = [canonicalPublicProduct()], adapters = loadAdapters(), health = loadAdapterHealth(), budget = 24 } = {}) {
  const channelStates = Object.fromEntries(channels.map((channel) => [channel, channelReadiness(channel, adapters, health)]));
  const events = loadEvents();
  const ranked = [...lab]
    .map((experiment) => ({
      experiment,
      score: trafficScoreForExperiment(experiment),
      bestHubPage: bestHubPageForExperiment(experiment, events),
      bestSeoIntent: bestSeoIntentForExperiment(experiment, events),
      bestUtilityIntent: bestUtilityIntentForExperiment(experiment, events),
      samplePage: samplePageRecommendationForExperiment(experiment, events),
    }))
    .sort((a, b) => b.score - a.score);
  const totalScore = ranked.reduce((sum, item) => sum + Math.max(1, item.score), 0) || 1;
  const allocations = ranked.map(({ experiment, score, bestHubPage, bestSeoIntent, bestUtilityIntent, samplePage }) => {
    const share = Math.max(1, Math.round((Math.max(1, score) / totalScore) * budget));
    const channelPlans = (experiment.promos || promoFor(experiment)).map((promo) => {
      const state = channelStates[promo.channel] || { status: "blocked", reason: "unknown-channel" };
      const isOwned = promo.channel === "landing-page";
      const recommendedPage = bestHubPage || bestSeoIntent || bestUtilityIntent || samplePage;
      const recommendationKind = bestHubPage ? "聚合入口页" : bestSeoIntent ? "长尾页" : bestUtilityIntent ? "免费工具页" : samplePage ? "免费样例页" : "";
      return {
        channel: promo.channel,
        label: promo.label,
        status: state.status,
        reason: state.reason,
        priority: Number((score + (isOwned ? 10 : 0)).toFixed(2)),
        trackingUrl: toPublicUrl(promo.url),
        recommendedUrl: recommendedPage && !isOwned ? recommendedPage.url : toPublicUrl(promo.url),
        recommendedReason:
          recommendedPage && !isOwned
            ? bestUtilityIntent && recommendedPage === bestUtilityIntent
              ? `${recommendationKind}「${bestUtilityIntent.title}」用于冷启动筛选真实意图；还没有 checkout、付款或高意图 lead 前，后续发布优先导向可交互工具入口。`
              : samplePage && recommendedPage === samplePage
                ? `${recommendationKind}「${samplePage.title}」用于冷启动建立信任；还没有 checkout、付款或高意图 lead 前，后续发布优先导向免费样例入口。`
                : `${recommendationKind}「${bestHubPage?.title || bestSeoIntent?.intent || bestUtilityIntent?.intent}」已有 ${recommendedPage.views} 次服务端访问，后续发布优先导向这个已有反应的入口。`
            : "",
      };
    });
    return {
      experimentId: experiment.id,
      title: experiment.title,
      opportunityId: experiment.opportunityId || "",
      opportunityKeyword: experiment.opportunityKeyword || "",
      score,
      budget: share,
      recommendedVariantId: experiment.winningVariant?.id || null,
      recommendedHubPage: bestHubPage
        ? {
            kind: bestHubPage.kind,
            id: bestHubPage.id,
            title: bestHubPage.title,
            url: bestHubPage.url,
            views: bestHubPage.views,
          }
        : null,
      recommendedSeoIntent: bestSeoIntent
        ? {
            intent: bestSeoIntent.intent,
            title: bestSeoIntent.title,
            url: bestSeoIntent.url,
            views: bestSeoIntent.views,
          }
        : null,
      recommendedUtilityIntent: bestUtilityIntent
        ? {
            intent: bestUtilityIntent.intent,
            title: bestUtilityIntent.title,
            url: bestUtilityIntent.url,
            views: bestUtilityIntent.views,
            reason: bestUtilityIntent.reason,
          }
        : null,
      recommendedSamplePage: samplePage
        ? {
            kind: samplePage.kind,
            id: samplePage.id,
            title: samplePage.title,
            url: samplePage.url,
            reason: samplePage.reason,
          }
        : null,
      channels: channelPlans,
    };
  });
  const plan = {
    at: new Date().toISOString(),
    budget,
    channelStates,
    allocations,
  };
  writeJsonFile("traffic-plan.json", plan);
  return plan;
}

function executionTaskId(parts) {
  return `exec_${shortHash(parts.filter(Boolean).join(":"))}`;
}

function buildExecutionQueue({ actionPlan = loadActionPlan(), trafficPlan = loadTrafficPlan(), publishQueue = loadPublishQueue(), outbox = loadOutbox(), checkouts = loadCheckouts() } = {}) {
  const tasks = [];
  const now = new Date().toISOString();
  for (const action of actionPlan?.actions || []) {
    tasks.push({
      id: executionTaskId(["action", action.type, action.target || action.experimentId || "system"]),
      kind: "action",
      action: action.type,
      target: action.target || action.experimentId || "",
      priority: action.priority || 0,
      status: action.status || (action.type.startsWith("fix-adapter-") ? "blocked" : "queued"),
      command: action.command || "",
      endpoint: action.endpoint || "",
      reason: action.reason || "",
      experimentId: action.experimentId || "",
      variantId: action.variantId || null,
      variantLabel: action.variantLabel || "",
      variantUrl: action.variantUrl || "",
      recommendedPublishUrl: action.recommendedPublishUrl || "",
      previousVariantId: action.previousVariantId || null,
      trigger: action.trigger || "",
      checkoutIds: action.checkoutIds || [],
      recoveryUrls: action.recoveryUrls || [],
      leadScores: action.leadScores || [],
      leadTypes: action.leadTypes || [],
      metrics: action.metrics || null,
      count: action.count || 0,
      createdAt: now,
    });
  }
  for (const allocation of trafficPlan?.allocations || []) {
    tasks.push({
      id: executionTaskId(["traffic", allocation.experimentId]),
      kind: "traffic-allocation",
      action: "allocate-traffic",
      target: allocation.experimentId,
      priority: allocation.score || 0,
      status: "queued",
      budget: allocation.budget || 1,
      opportunityKeyword: allocation.opportunityKeyword || "",
      recommendedVariantId: allocation.recommendedVariantId || null,
      channels: allocation.channels,
      reason: `自动分配 ${allocation.budget || 1} 份行动预算给 ${allocation.title}`,
      createdAt: now,
    });
  }
  for (const task of publishQueue.filter((item) => !["sent", "handed-off"].includes(item.status)).slice(0, 100)) {
    const externallyBlocked =
      task.status === "waiting-for-account-authorization" ||
      task.status === "waiting-for-owner-review" ||
      task.blockedReason === "external-platform-account-authorization-required" ||
      task.blockedReason === "owner-final-platform-publish-confirmation-required" ||
      task.channelStatus === "blocked";
    tasks.push({
      id: executionTaskId(["publish", task.id]),
      kind: "publish",
      action: "publish-task",
      target: task.id,
      priority: task.priority || 0,
      status: externallyBlocked ? "blocked" : "queued",
      endpoint: "/api/publish-agent/tasks",
      experimentId: task.experimentId,
      channel: task.channel,
      opportunityKeyword: task.opportunityKeyword || "",
      reason: externallyBlocked ? task.blockedReason || "external account authorization required" : "ready for publish agent",
      createdAt: now,
    });
  }
  for (const item of outbox.filter((entry) => ["queued", "prepared", "failed"].includes(entry.status)).slice(0, 100)) {
    tasks.push({
      id: executionTaskId(["delivery", item.id]),
      kind: "fulfillment",
      action: "send-delivery",
      target: item.id,
      priority: 95,
      status: item.blockedReason ? "blocked" : "queued",
      orderId: item.orderId,
      experimentId: item.experimentId,
      command: "deliverPrepared",
      reason: item.blockedReason || "paid order needs delivery",
      createdAt: now,
    });
  }
  for (const checkout of checkouts.filter((item) => ["pending", "underpaid"].includes(item.status)).slice(0, 100)) {
    tasks.push({
      id: executionTaskId(["payment", checkout.id]),
      kind: "payment",
      action: "watch-payment",
      target: checkout.id,
      priority: 80,
      status: "queued",
      experimentId: checkout.experimentId,
      command: "syncPaymentFeed",
      reason: "checkout is waiting for a matching payment signal",
      createdAt: now,
    });
  }
  const queue = {
    at: now,
    tasks: tasks.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)),
  };
  writeJsonFile("execution-queue.json", queue);
  return queue;
}

function normalizeExecutionResultStatus(result) {
  if (!result) return "skipped";
  if (["blocked", "failed", "skipped", "dry-run-ready", "executed", "handed-off"].includes(result.status)) return result.status;
  if (["submitted", "synced", "sent", "deployed", "deployed-without-public-url", "noop", "seeded", "ok"].includes(result.status)) return "executed";
  return result.status || "executed";
}

function summarizeExecutionQueueResults(results) {
  return {
    attempted: results.length,
    executed: results.filter((item) => item.status === "executed").length,
    blocked: results.filter((item) => item.status === "blocked").length,
    handedOff: results.filter((item) => item.status === "handed-off").length,
    dryRunReady: results.filter((item) => item.status === "dry-run-ready").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
  };
}

async function runExecutionQueueTask(
  task,
  { dryRun = false, publishAgentLimit = 10, publicTunnelStarter = startAutonomousPublicTunnel, serviceHealer = ensureCheckoutService } = {}
) {
  if (!task || task.status === "blocked") {
    return {
      taskId: task?.id || "",
      kind: task?.kind || "",
      action: task?.action || "",
      target: task?.target || "",
      status: "blocked",
      reason: task?.reason || "task is blocked",
    };
  }
  if (task.status && task.status !== "queued") {
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "skipped",
      reason: `task-status-${task.status}`,
    };
  }

  if (task.action === "scan-opportunities") {
    const scan = await scanOpportunitySources();
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: scan.status === "ok" || scan.status === "seeded" ? "executed" : normalizeExecutionResultStatus(scan),
      scanStatus: scan.status,
      signals: scan.signals?.length || 0,
      reason: scan.reason || "",
    };
  }

  if (task.action === "expand-demand-capture" || task.action === "expand-utility-intent") {
    const site = generateSite();
    const deploy = await deployStaticSite({ dryRun });
    const search = await submitSearchIndex({ dryRun, lab: site.lab });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      stage: task.stage || "",
      demandPages: site.lab.reduce((sum, item) => sum + demandCapturePagesFor(item).length, 0),
      utilityPages: site.lab.reduce((sum, item) => sum + utilityIntentPagesFor(item).length, 0),
      deployStatus: deploy.status,
      submitStatus: search.status,
      submitted: search.submitted || 0,
      discovered: search.discovered || 0,
      reason: task.reason || "",
    };
  }

  if (task.action === "expand-traffic-surface") {
    const expansion = await expandTrafficSurface({ dryRun });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      stage: task.stage || "",
      expansionId: expansion.id,
      round: expansion.round,
      signalsAdded: expansion.signalsAdded,
      experiments: expansion.experiments,
      demandPages: expansion.demandPages,
      searchStatus: expansion.searchStatus,
      submitted: expansion.searchSubmitted,
      discovered: expansion.searchDiscovered,
      reason: task.reason || "",
    };
  }

  if (task.action === "open-public-tunnel") {
    if (dryRun) {
      return {
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "dry-run-ready",
        reason: task.reason || "public access requires a reachable public tunnel",
        command: task.command || "node src/cli.js public-tunnel --provider auto --port 4188",
      };
    }
    const serviceHealth = await serviceHealer({ port: 4188 });
    const tunnel = await publicTunnelStarter({ port: 4188, provider: "auto" });
    const configured = configurePublicBaseUrl(tunnel.publicUrl, { source: `execution-queue:${tunnel.provider || "tunnel"}` });
    const deploy = await deployStaticSite({ dryRun: false });
    const site = generateSite();
    const search = await submitSearchIndex({ dryRun: false, lab: site.lab });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      reason: search.reason || task.reason || "",
      command: task.command || "node src/cli.js public-tunnel --provider auto --port 4188",
      serviceStatus: serviceHealth.status,
      publicUrl: configured.publicBaseUrl,
      provider: tunnel.provider || "",
      pid: tunnel.pid || null,
      logFile: tunnel.logFile || "",
      deployStatus: deploy.status,
      submitStatus: search.status,
      submitted: search.submitted || 0,
      discovered: search.discovered || 0,
    };
  }

  if (task.action === "allocate-traffic") {
    const trafficPlan = loadTrafficPlan() || buildTrafficPlan({ lab: [canonicalPublicProduct()] });
    const publishQueue = loadPublishQueue();
    const allocation = (trafficPlan.allocations || []).find((item) => item.experimentId === task.target);
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      allocationFound: Boolean(allocation),
      budget: allocation?.budget || task.budget || 0,
      activeChannels: (allocation?.channels || []).filter((item) => ["active", "owned", "configured"].includes(item.status)).length,
      blockedChannels: (allocation?.channels || []).filter((item) => item.status === "blocked").length,
      publishTasks: publishQueue.length,
    };
  }

  if (task.action === "submit-search-index") {
    let search = await submitSearchIndex({ dryRun });
    let healedPublicAccess = null;
    let deploy = null;
    if (!dryRun && search.status === "blocked" && search.reason === "public-base-url-unreachable") {
      const serviceHealth = await serviceHealer({ port: 4188 });
      const tunnel = await publicTunnelStarter({ port: 4188, provider: "auto" });
      const configured = configurePublicBaseUrl(tunnel.publicUrl, { source: `submit-search-index:${tunnel.provider || "tunnel"}` });
      deploy = await deployStaticSite({ dryRun: false });
      const site = generateSite();
      search = await submitSearchIndex({ dryRun: false, lab: site.lab });
      if (search.status === "failed") {
        await sleep(3000);
        search = await submitSearchIndex({ dryRun: false, lab: site.lab });
      }
      healedPublicAccess = {
        serviceStatus: serviceHealth.status,
        publicUrl: configured.publicBaseUrl,
        provider: tunnel.provider || "",
        pid: tunnel.pid || null,
        logFile: tunnel.logFile || "",
      };
    }
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: normalizeExecutionResultStatus(search),
      submitStatus: search.status,
      submitted: search.submitted || 0,
      discovered: search.discovered || 0,
      reason: search.reason || "",
      endpoint: search.endpoint,
      healedPublicAccess,
      deployStatus: deploy?.status || "",
    };
  }

  if (task.action === "watch-payment") {
    const sync = await syncPaymentFeed({ dryRun });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: normalizeExecutionResultStatus(sync),
      syncStatus: sync.status,
      seen: sync.seen || 0,
      created: sync.created || 0,
      duplicates: sync.duplicates || 0,
      failed: sync.failed || 0,
      reason: sync.reason || "",
    };
  }

  if (task.action === "send-delivery") {
    const delivery = await deliverPrepared({ dryRun });
    const matching = delivery.results.find((item) => item.deliveryId === task.target) || null;
    const blocked = delivery.results.filter((item) => item.status === "blocked").length;
    const sent = delivery.results.filter((item) => item.status === "sent").length;
    const ready = delivery.results.filter((item) => item.status === "dry-run-ready").length;
    const failed = delivery.results.filter((item) => item.status === "failed").length;
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: normalizeExecutionResultStatus(matching || (sent ? { status: "sent" } : ready ? { status: "dry-run-ready" } : blocked ? { status: "blocked" } : failed ? { status: "failed" } : { status: "skipped" })),
      sent,
      blocked,
      dryRunReady: ready,
      failed,
      reason: matching?.reason || "",
      error: matching?.error || "",
    };
  }

  if (task.action === "publish-task" || task.action === "claim-publish") {
    const publish = await runPublishAgentOnce({
      dryRun,
      limit: task.action === "publish-task" ? 1 : publishAgentLimit,
      channel: task.channel || null,
      workerId: "execution-queue-runner",
    });
    const matching = publish.results.find((item) => item.taskId === task.target) || null;
    let ownedSitePublisher = null;
    let resultSync = null;
    let closedLocalHandoff = false;
    if (!dryRun && publish.handedOff > 0) {
      ownedSitePublisher = publishGrowthOutboxToOwnedSite({ dryRun: false, limit: Math.max(1, publish.handedOff) });
      resultSync = consumeResultInboxes({ dryRun: false });
      closedLocalHandoff = Boolean(ownedSitePublisher.published || resultSync.growth?.consumed);
    }
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: normalizeExecutionResultStatus(
        closedLocalHandoff ? { status: "sent" } : matching || (publish.sent ? { status: "sent" } : publish.blocked ? { status: "blocked" } : publish.failed ? { status: "failed" } : { status: "skipped" })
      ),
      claimed: publish.claimed,
      sent: publish.sent,
      handedOff: publish.handedOff,
      closedLocalHandoff,
      ownedSitePublished: ownedSitePublisher?.published || 0,
      resultSyncConsumed: resultSync?.growth?.consumed || 0,
      blocked: publish.blocked,
      failed: publish.failed,
      reason: matching?.reason || "",
      error: matching?.error || "",
      publishUrl: matching?.publishUrl || "",
      variantId: matching?.variantId || null,
      payload: matching?.payload || null,
    };
  }

  if (task.action === "double-down" || task.action === "collect-more-data") {
    const run = runAutopilot();
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      runId: run.id,
      experiments: run.experiments,
      publishTasks: run.publishTasks,
    };
  }

  if (task.action === "optimize-offer-variant" || task.action === "escalate-published-no-checkout" || task.action === "discount-direct-traffic-no-checkout" || task.action === "compress-starter-traffic-to-instant-checkout" || task.action === "route-traffic-starved-to-utility") {
    if (!task.experimentId || !task.variantId) {
      return {
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "skipped",
        reason: "missing-variant-optimization-data",
      };
    }
    const source =
      task.action === "escalate-published-no-checkout"
        ? "automatic-published-no-checkout-direct-buy"
        : task.action === "discount-direct-traffic-no-checkout"
          ? "automatic-direct-traffic-starter-offer"
        : task.action === "compress-starter-traffic-to-instant-checkout"
          ? "automatic-starter-no-checkout-instant"
        : task.action === "route-traffic-starved-to-utility"
          ? "automatic-traffic-starved-utility"
        : "buyer-intent-variant-optimization";
    const trigger =
      task.action === "escalate-published-no-checkout"
        ? task.trigger || "published-without-checkout"
        : task.action === "discount-direct-traffic-no-checkout"
          ? task.trigger || "direct-views-without-checkout"
        : task.action === "compress-starter-traffic-to-instant-checkout"
          ? task.trigger || "starter-route-without-checkout"
        : task.action === "route-traffic-starved-to-utility"
          ? task.trigger || "paid-route-without-real-traffic"
        : task.trigger || "buyer-intent-variant-optimization";
    const optimization = saveVariantOptimization({
      experimentId: task.experimentId,
      variantId: task.variantId,
      variantLabel: task.variantLabel,
      variantUrl: task.variantUrl,
      previousVariantId: task.previousVariantId || null,
      metrics: task.metrics,
      trigger,
      reason: task.reason,
      recommendedPublishUrl: task.recommendedPublishUrl || task.variantUrl,
      source,
    });
    const republish = writeOptimizedGrowthOutboxPackages(task.experimentId, {
      source,
      trigger,
      reason: task.reason,
      dryRun,
    });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      experimentId: optimization.experimentId,
      variantId: optimization.variantId,
      previousVariantId: optimization.previousVariantId,
      recommendedPublishUrl: optimization.recommendedPublishUrl,
      republishStatus: republish.status,
      republishPackages: republish.packages.length,
    };
  }

  if (task.action === "rewrite-offer-from-views") {
    if (!task.experimentId || !task.variantId) {
      return {
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "skipped",
        reason: "missing-view-rewrite-data",
      };
    }
    const optimization = saveVariantOptimization({
      experimentId: task.experimentId,
      variantId: task.variantId,
      variantLabel: task.variantLabel,
      variantUrl: task.variantUrl,
      previousVariantId: task.previousVariantId || null,
      metrics: task.metrics,
      trigger: task.trigger || "views-without-buyer-action",
      reason: task.reason,
      recommendedPublishUrl: task.recommendedPublishUrl || task.variantUrl,
      source: "automatic-view-rewrite",
    });
    const republish = writeOptimizedGrowthOutboxPackages(task.experimentId, {
      source: "automatic-view-rewrite",
      trigger: task.trigger || "views-without-buyer-action",
      reason: task.reason,
      dryRun,
    });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      experimentId: optimization.experimentId,
      variantId: optimization.variantId,
      previousVariantId: optimization.previousVariantId,
      recommendedPublishUrl: optimization.recommendedPublishUrl,
      republishStatus: republish.status,
      republishPackages: republish.packages.length,
    };
  }

  if (task.action === "recover-unpaid-checkout") {
    if (!task.experimentId || !task.variantId) {
      return {
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "skipped",
        reason: "missing-unpaid-checkout-recovery-data",
      };
    }
    const optimization = saveVariantOptimization({
      experimentId: task.experimentId,
      variantId: task.variantId,
      variantLabel: task.variantLabel,
      variantUrl: task.variantUrl,
      previousVariantId: task.previousVariantId || null,
      checkoutIds: task.checkoutIds || [],
      recoveryUrls: task.recoveryUrls || [],
      metrics: task.metrics,
      trigger: task.trigger || "stale-pending-checkout",
      reason: task.reason,
      recommendedPublishUrl: task.variantUrl,
      source: "automatic-unpaid-checkout-recovery",
    });
    const recoveryPackages = saveCheckoutRecoveryPackages(task.checkoutIds || [], {
      source: "automatic-unpaid-checkout-recovery",
      reason: task.reason,
      trigger: task.trigger || "stale-pending-checkout",
      recommendedPublishUrl: task.variantUrl,
    });
    const republish = writeOptimizedGrowthOutboxPackages(task.experimentId, {
      source: "automatic-unpaid-checkout-recovery",
      trigger: task.trigger || "stale-pending-checkout",
      reason: task.reason,
      dryRun,
    });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      experimentId: optimization.experimentId,
      variantId: optimization.variantId,
      previousVariantId: optimization.previousVariantId,
      recommendedPublishUrl: optimization.recommendedPublishUrl,
      recoveryUrls: optimization.recoveryUrls || [],
      recoveryPackages: recoveryPackages.length,
      republishStatus: republish.status,
      republishPackages: republish.packages.length,
    };
  }

  if (task.action === "convert-high-intent-lead") {
    if (!task.experimentId || !task.variantId) {
      return {
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "skipped",
        reason: "missing-high-intent-lead-data",
      };
    }
    const optimization = saveVariantOptimization({
      experimentId: task.experimentId,
      variantId: task.variantId,
      variantLabel: task.variantLabel,
      variantUrl: task.variantUrl,
      leadScores: task.leadScores || [],
      leadTypes: task.leadTypes || [],
      metrics: task.metrics,
      trigger: task.trigger || "high-intent-lead-tool",
      reason: task.reason,
      recommendedPublishUrl: task.variantUrl,
      source: "automatic-high-intent-lead-conversion",
    });
    const republish = writeOptimizedGrowthOutboxPackages(task.experimentId, {
      source: "automatic-high-intent-lead-conversion",
      trigger: task.trigger || "high-intent-lead-tool",
      reason: task.reason,
      dryRun,
    });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      experimentId: optimization.experimentId,
      variantId: optimization.variantId,
      recommendedPublishUrl: optimization.recommendedPublishUrl,
      republishStatus: republish.status,
      republishPackages: republish.packages.length,
    };
  }

  if (task.action === "convert-sample-interest") {
    if (!task.experimentId || !task.variantId) {
      return {
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "skipped",
        reason: "missing-sample-interest-data",
      };
    }
    const optimization = saveVariantOptimization({
      experimentId: task.experimentId,
      variantId: task.variantId,
      variantLabel: task.variantLabel,
      variantUrl: task.variantUrl,
      previousVariantId: task.previousVariantId || null,
      metrics: task.metrics,
      trigger: task.trigger || "sample-views-without-checkout",
      reason: task.reason,
      recommendedPublishUrl: task.recommendedPublishUrl || publicSampleCloseUrl(task.experimentId),
      source: "automatic-sample-interest-close",
    });
    const republish = writeOptimizedGrowthOutboxPackages(task.experimentId, {
      source: "automatic-sample-interest-close",
      trigger: task.trigger || "sample-views-without-checkout",
      reason: task.reason,
      dryRun,
    });
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "executed",
      experimentId: optimization.experimentId,
      variantId: optimization.variantId,
      previousVariantId: optimization.previousVariantId,
      recommendedPublishUrl: optimization.recommendedPublishUrl,
      republishStatus: republish.status,
      republishPackages: republish.packages.length,
    };
  }

  if (task.action?.startsWith("fix-adapter-")) {
    return {
      taskId: task.id,
      kind: task.kind,
      action: task.action,
      target: task.target,
      status: "blocked",
      count: task.count || 0,
      reason: task.reason,
      command: task.command,
    };
  }

  return {
    taskId: task.id,
    kind: task.kind,
    action: task.action,
    target: task.target,
    status: "skipped",
    reason: "unknown-task-action",
  };
}

function localLoopAllowedExecutionTask(task = {}) {
  if (task.kind === "traffic-allocation") return true;
  if (["publish", "fulfillment", "payment"].includes(task.kind)) return true;
  return ["allocate-traffic", "publish-task", "send-delivery", "watch-payment"].includes(task.action);
}

async function runExecutionQueue({ dryRun = false, limit = 20, rebuild = true, publishAgentLimit = 10, localOnly = false } = {}) {
  if (rebuild) {
    const lab = [canonicalPublicProduct()];
    const trafficPlan = buildTrafficPlan({ lab });
    const publishQueue = buildPublishQueue(lab);
    saveActionPlan(buildActionPlan({ publishQueue }));
    buildExecutionQueue({ trafficPlan, publishQueue });
  }
  const queue = loadExecutionQueue();
  const runnable = (queue.tasks || [])
    .filter((task) => task.status === "queued" || task.status === "blocked")
    .filter((task) => !localOnly || localLoopAllowedExecutionTask(task))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
  const results = [];
  for (const task of runnable) {
    try {
      results.push(await runExecutionQueueTask(task, { dryRun, publishAgentLimit }));
    } catch (error) {
      results.push({
        taskId: task.id,
        kind: task.kind,
        action: task.action,
        target: task.target,
        status: "failed",
        error: error.message,
      });
    }
  }
  const refreshedActionPlan = saveActionPlan(buildActionPlan({ publishQueue: loadPublishQueue() }));
  const rebuiltQueue = buildExecutionQueue({
    actionPlan: refreshedActionPlan,
    trafficPlan: loadTrafficPlan(),
    publishQueue: loadPublishQueue(),
    outbox: loadOutbox(),
    checkouts: loadCheckouts(),
  });
  const summary = {
    id: `execution_queue_run_${Date.now()}`,
    at: new Date().toISOString(),
    dryRun,
    limit,
    localOnly,
    queueAt: queue.at,
    beforeTasks: (queue.tasks || []).length,
    afterTasks: (rebuiltQueue.tasks || []).length,
    ...summarizeExecutionQueueResults(results),
    results,
  };
  writeJsonFile("last-execution-queue-run.json", summary);
  appendExecutionQueueHistory(summary);
  return summary;
}

function buildActionPlan({ strategy = buildStrategy(), publishQueue = loadPublishQueue(), outbox = loadOutbox(), checkouts = loadCheckouts() } = {}) {
  const gateActions = adapterGateActions({ publishQueue, outbox, checkouts });
  const gatedTypes = new Set(gateActions.map((item) => item.type));
  const actions = [...gateActions];
  const funnel = acquisitionFunnelSnapshot({ lab: knownExperiments(), publishQueue, outbox, checkouts });
  const opportunityState = loadOpportunitySignals();
  const hasOpportunitySources = (loadAdapters().opportunitySources || []).length > 0;
  const hasOpportunitySignals = ["ok", "seeded"].includes(opportunityState.status) && opportunityState.signals?.length;
  if (!hasOpportunitySources && !hasOpportunitySignals) {
    actions.push({
      type: "scan-opportunities",
      priority: 115,
      target: "opportunity-sources",
      reason: "还没有配置外部机会源，程序会先使用内置机会种子继续生成商品实验。",
      command: "scanOpportunitySources",
    });
  } else if (hasOpportunitySources && !hasOpportunitySignals) {
    actions.push({
      type: "scan-opportunities",
      priority: 115,
      target: "opportunity-sources",
      reason: "已配置机会源，但还没有可用机会信号，下一轮应先抓取趋势再生成商品。",
      command: "scanOpportunitySources",
    });
  }
  const publishedExperimentIds = new Set((publishQueue || []).map((item) => item.experimentId).filter(Boolean));
  const actionExperiments = knownExperiments().filter((item) => !publishedExperimentIds.size || publishedExperimentIds.has(item.id));
  for (const experiment of actionExperiments.map((item) => experimentView(item, aggregateMetrics([item])[item.id] || { views: 0, clicks: 0, leads: 0, paid: 0, delivered: 0, revenue: 0, pendingDelivery: 0 }))) {
    const winner = bestOfferVariant(experiment);
    const evidence = winner?.metrics || {};
    const paymentFriction = paymentFrictionRecommendation(experiment, checkouts);
    if (paymentFriction) {
      actions.push({
        type: "recover-unpaid-checkout",
        priority: 155 + paymentFriction.metrics.staleCheckouts * 8 + paymentFriction.metrics.underpaidCheckouts * 12,
        target: experiment.id,
        experimentId: experiment.id,
        variantId: paymentFriction.variant.id,
        variantLabel: paymentFriction.variant.label,
        variantUrl: paymentFriction.variant.url,
        previousVariantId: paymentFriction.previousVariantId,
        checkoutIds: paymentFriction.checkoutIds,
      recoveryUrls: paymentFriction.recoveryUrls,
        metrics: paymentFriction.metrics,
        trigger: paymentFriction.trigger,
        reason: `已有 checkout 但没有付款完成：pending ${paymentFriction.metrics.pendingCheckouts}、underpaid ${paymentFriction.metrics.underpaidCheckouts}、超时 ${paymentFriction.metrics.staleCheckouts}、收入 ¥${paymentFriction.metrics.revenue || 0}。程序判定支付/信任环节有摩擦，后续发布自动改导向「${paymentFriction.variant.label}」。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const highIntentLead = highIntentLeadRecommendation(experiment);
    if (highIntentLead) {
      actions.push({
        type: "convert-high-intent-lead",
        priority: 145 + highIntentLead.metrics.highIntentLeads * 10 + highIntentLead.metrics.checkouts * 5,
        target: experiment.id,
        experimentId: experiment.id,
        variantId: highIntentLead.variant.id,
        variantLabel: highIntentLead.variant.label,
        variantUrl: highIntentLead.variant.url,
        leadScores: highIntentLead.leadScores,
        leadTypes: highIntentLead.leadTypes,
        metrics: highIntentLead.metrics,
        trigger: highIntentLead.trigger,
        reason: `自动销售入口产生 ${highIntentLead.metrics.highIntentLeads} 个高意图 lead（${highIntentLead.leadTypes.join("、")}），但还没有付款。程序把后续分发自动改导向「${highIntentLead.variant.label}」，缩短从意图到唯一付款备注的路径。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const hasBuyerIntent = (evidence.paid || 0) > 0 || (evidence.checkouts || 0) > 0 || (evidence.clicks || 0) >= 3;
    if (winner && hasBuyerIntent) {
      actions.push({
        type: "optimize-offer-variant",
        priority: 140 + (evidence.paid || 0) * 20 + (evidence.checkouts || 0) * 8 + (evidence.clicks || 0),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: winner.id,
        variantLabel: winner.label,
        variantUrl: winner.url,
        metrics: evidence,
        reason: `当前胜出成交角度是「${winner.label}」：曝光 ${evidence.views || 0}、点击 ${evidence.clicks || 0}、checkout ${evidence.checkouts || 0}、付款 ${evidence.paid || 0}、收入 ¥${evidence.revenue || 0}，后续推广应优先导向该变体。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const sampleClose = sampleInterestCloseRecommendation(experiment);
    if (sampleClose) {
      actions.push({
        type: "convert-sample-interest",
        priority: 132 + Math.min(30, sampleClose.metrics.sampleViews * 4),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: sampleClose.variant.id,
        variantLabel: sampleClose.variant.label,
        variantUrl: sampleClose.variant.url,
        recommendedPublishUrl: sampleClose.closeUrl,
        previousVariantId: sampleClose.previousVariantId,
        metrics: sampleClose.metrics,
        trigger: sampleClose.trigger,
        reason: `免费样例页已有 ${sampleClose.metrics.sampleViews} 次访问，但还没有 checkout 或付款。程序判定样例能吸引注意力但承接不够强，后续发布自动改导向「样例后成交页」，用样例回顾、边界说明和唯一付款备注缩短购买路径。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const directTrafficNoCheckout = directTrafficNoCheckoutRecommendation(experiment, publishQueue);
    if (directTrafficNoCheckout) {
      actions.push({
        type: "discount-direct-traffic-no-checkout",
        priority: 134 + Math.min(30, directTrafficNoCheckout.metrics.directViews * 5 + directTrafficNoCheckout.metrics.routedBuyNowTasks),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: directTrafficNoCheckout.variant.id,
        variantLabel: directTrafficNoCheckout.variant.label,
        variantUrl: directTrafficNoCheckout.variant.url,
        recommendedPublishUrl: directTrafficNoCheckout.starterUrl,
        previousVariantId: directTrafficNoCheckout.previousVariantId,
        metrics: directTrafficNoCheckout.metrics,
        trigger: directTrafficNoCheckout.trigger,
        reason: `直购页已有 ${directTrafficNoCheckout.metrics.directViews} 次访问、${directTrafficNoCheckout.metrics.routedBuyNowTasks} 条发布入口导向直购，但仍没有 checkout 或付款。程序自动降门槛到 ¥${directTrafficNoCheckout.metrics.starterPrice} 入门版，后续发布改导向低价入门页，先争取第一笔小额真实付款。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const starterNoCheckout = starterTrafficNoCheckoutRecommendation(experiment, publishQueue);
    if (starterNoCheckout) {
      actions.push({
        type: "compress-starter-traffic-to-instant-checkout",
        priority: 138 + Math.min(35, starterNoCheckout.metrics.starterViews * 5 + starterNoCheckout.metrics.routedStarterTasks),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: starterNoCheckout.variant.id,
        variantLabel: starterNoCheckout.variant.label,
        variantUrl: starterNoCheckout.variant.url,
        recommendedPublishUrl: starterNoCheckout.instantUrl,
        previousVariantId: starterNoCheckout.previousVariantId,
        metrics: starterNoCheckout.metrics,
        trigger: starterNoCheckout.trigger,
        reason: `低价入门页已成为发布主入口（${starterNoCheckout.metrics.routedStarterTasks} 条）且已有 ${starterNoCheckout.metrics.starterViews} 次入门页访问，但仍没有 checkout 或付款。程序自动压缩到一屏付款页，保留 ¥${starterNoCheckout.metrics.starterPrice} 入门价，把价格、二维码、交付边界和唯一付款备注生成入口放到同一屏。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const rewrite = exposureRewriteRecommendation(experiment);
    if (rewrite) {
      actions.push({
        type: "rewrite-offer-from-views",
        priority: 125 + Math.min(40, rewrite.metrics.experimentViews || rewrite.metrics.views || 0),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: rewrite.variant.id,
        variantLabel: rewrite.variant.label,
        variantUrl: rewrite.variant.url,
        recommendedPublishUrl: rewrite.rescueUrl,
        previousVariantId: rewrite.previousVariantId,
        metrics: rewrite.metrics,
        trigger: rewrite.trigger,
        reason: `已有曝光但没有形成购买动作：总曝光 ${rewrite.metrics.experimentViews || 0}、点击 ${rewrite.metrics.experimentClicks || 0}、checkout ${rewrite.metrics.checkouts || 0}、付款 ${rewrite.metrics.paid || 0}。程序判定原卖法不够强，后续发布自动改导向「自动挽回成交页」，用入门价和完整包双入口降低第一次付款阻力。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const trafficStarvedUtility = trafficStarvedUtilityRecommendation(experiment, publishQueue);
    if (trafficStarvedUtility) {
      actions.push({
        type: "route-traffic-starved-to-utility",
        priority: 126 + Math.min(25, trafficStarvedUtility.metrics.routedPaidTasks * 4),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: trafficStarvedUtility.variant.id,
        variantLabel: trafficStarvedUtility.utility.title,
        variantUrl: trafficStarvedUtility.variant.url,
        recommendedPublishUrl: trafficStarvedUtility.utilityUrl,
        previousVariantId: trafficStarvedUtility.previousVariantId,
        metrics: trafficStarvedUtility.metrics,
        trigger: trafficStarvedUtility.trigger,
        reason: `发布入口已经导向 ${trafficStarvedUtility.previousVariantId} 等收款页（${trafficStarvedUtility.metrics.routedPaidTasks} 条），但真实商品访问只有 ${trafficStarvedUtility.metrics.productViews} 次且没有 checkout。程序回切到免费工具页「${trafficStarvedUtility.utility.title}」，先用交互表单筛选真实意图，再对强意图用户生成付款备注。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
    const publishedNoCheckout = publishedNoCheckoutRecommendation(experiment, publishQueue);
    if (publishedNoCheckout) {
      actions.push({
        type: "escalate-published-no-checkout",
        priority: 130 + Math.min(30, publishedNoCheckout.metrics.sentPublishTasks * 5 + publishedNoCheckout.metrics.publishSentEvents * 2),
        target: experiment.id,
        experimentId: experiment.id,
        variantId: publishedNoCheckout.variant.id,
        variantLabel: publishedNoCheckout.variant.label,
        variantUrl: publishedNoCheckout.variant.url,
        recommendedPublishUrl: publishedNoCheckout.directUrl,
        previousVariantId: publishedNoCheckout.previousVariantId,
        metrics: publishedNoCheckout.metrics,
        trigger: publishedNoCheckout.trigger,
        reason: `已有 ${publishedNoCheckout.metrics.sentPublishTasks} 条发布任务发出、${publishedNoCheckout.metrics.publishSentEvents} 条发布事件，但还没有 checkout 或付款。程序不再继续温和承接，后续发布自动改导向直购成交页，用唯一付款备注把流量直接推向付款。`,
        command: "saveVariantOptimization",
      });
      continue;
    }
  }
  for (const combo of strategy.promotedCombos || []) {
    actions.push({
      type: "double-down",
      priority: 100 + combo.paid * 10 + combo.revenue,
      target: combo.key,
      marketId: combo.marketId,
      offerTypeId: combo.offerTypeId,
      reason: `已有 ${combo.paid} 笔付款、¥${combo.revenue} 收入记录，下一轮优先生成同类商品并提高分发频次。`,
      command: "runWorkerOnce",
    });
  }
  for (const combo of strategy.suppressedCombos || []) {
    actions.push({
      type: "pause-combo",
      priority: 70 + combo.views,
      target: combo.key,
      marketId: combo.marketId,
      offerTypeId: combo.offerTypeId,
      reason: `曝光 ${combo.views} 但点击不足，下一轮应降低该组合优先级或换痛点。`,
      command: "suppressInStrategy",
    });
  }
  const waitingPublish = publishQueue.filter(
    (item) =>
      !["sent", "handed-off", "waiting-for-account-authorization", "waiting-for-owner-review"].includes(item.status) &&
      ![
        "external-platform-account-authorization-required",
        "owner-final-platform-publish-confirmation-required",
      ].includes(item.blockedReason)
  );
  if (waitingPublish.length && !gatedTypes.has("fix-adapter-publish")) {
    actions.push({
      type: "claim-publish",
      priority: 90,
      target: "publish-queue",
      count: waitingPublish.length,
      reason: `还有 ${waitingPublish.length} 条发布任务没有成功发布，外部发布机器人应领取并回传结果。`,
      command: "GET /api/publish-agent/tasks",
    });
  }
  const publicBase = publicBaseUrl();
  actions.push({
    type: "submit-search-index",
    priority: isPublicHttpUrl(publicBase) ? 60 : 20,
    target: "search-index",
    reason: isPublicHttpUrl(publicBase)
      ? "站点已有公网地址，worker 应把新售卖页提交到搜索索引获取自然流量。"
      : "尚未配置公网 publicBaseUrl，搜索索引提交会阻塞，避免把 localhost 当成真实流量入口。",
    command: "submitSearchIndex",
  });
  const pendingDeliveries = outbox.filter((item) => item.status === "queued" || item.status === "prepared" || item.status === "failed");
  if (pendingDeliveries.length && !gatedTypes.has("fix-adapter-fulfillment")) {
    actions.push({
      type: "send-delivery",
      priority: 95,
      target: "delivery-outbox",
      count: pendingDeliveries.length,
      reason: `还有 ${pendingDeliveries.length} 条交付任务未确认发出，worker 应调用交付适配器。`,
      command: "deliverPrepared",
    });
  }
  const pendingCheckouts = checkouts.filter((item) => ["pending", "proof-submitted"].includes(item.status));
  if (pendingCheckouts.length && !gatedTypes.has("fix-adapter-payment")) {
    actions.push({
      type: "watch-payment",
      priority: 80,
      target: "payment-feed",
      count: pendingCheckouts.length,
      reason: `还有 ${pendingCheckouts.length} 个待支付 checkout，worker 应持续同步付款 feed。`,
      command: "syncPaymentFeed",
    });
  }
  const hasNearMoneyAction = actions.some((item) =>
    [
      "recover-unpaid-checkout",
      "convert-high-intent-lead",
      "convert-sample-interest",
      "escalate-published-no-checkout",
      "discount-direct-traffic-no-checkout",
      "compress-starter-traffic-to-instant-checkout",
      "rewrite-offer-from-views",
      "claim-publish",
      "watch-payment",
      "send-delivery",
    ].includes(item.type)
  );
  if (!hasNearMoneyAction && funnel.revenue === 0 && ["traffic-starved", "no-buyer-intent"].includes(funnel.stage)) {
    const lastSearch = loadLastSearchSubmit();
    const demandAlreadyCovered = lastSearch?.status === "noop" && lastSearch?.reason === "no-new-urls" && Number(lastSearch.discovered || 0) > 0;
    const labForUtilityCount =
      strategy?.selectedCombos?.length || strategy?.opportunitySignals?.length
        ? buildLab({ strategy, seed: strategy.seed || todaySeed(), count: strategy.count || 8 })
        : buildLab();
    const utilityPages = labForUtilityCount.flatMap((item) => utilityIntentPagesFor(item));
    actions.push({
      type: demandAlreadyCovered ? "expand-traffic-surface" : "expand-utility-intent",
      priority: demandAlreadyCovered ? 62 : 59,
      target: demandAlreadyCovered ? "new-opportunity-surface" : "utility-intent-pages",
      stage: funnel.stage,
      metrics: funnel,
      utilityPages: utilityPages.length,
      reason: demandAlreadyCovered
        ? `${funnel.diagnosis} 需求捕获页已经提交过且搜索提交没有新 URL，程序不能继续空转；下一步自动换一批机会/商品面，生成新的可索引收款入口。`
        : `${funnel.diagnosis} 程序将补充并提交免费诊断/计算器/清单生成器入口（${utilityPages.length} 个），让搜索流量先发生真实交互；强意图才生成 checkout，不把发布数量冒充收入。`,
      command: demandAlreadyCovered ? "expandTrafficSurface" : "generateSite",
    });
  }
  if (!actions.length) {
    actions.push({
      type: "collect-more-data",
      priority: 10,
      target: "lab",
      reason: "当前没有待处理队列或明确胜出组合，继续生成实验并收集曝光、点击和付款数据。",
      command: "runAutopilot",
    });
  }
  return {
    at: new Date().toISOString(),
    actions: actions.sort((a, b) => b.priority - a.priority),
  };
}

function saveActionPlan(plan = buildActionPlan()) {
  writeJsonFile("action-plan.json", plan);
  buildExecutionQueue({ actionPlan: plan });
  return plan;
}

async function executeActionPlan({ dryRun = false } = {}) {
  const plan = saveActionPlan(buildActionPlan());
  const results = [];
  for (const action of plan.actions) {
    if (action.type === "send-delivery") {
      const delivery = await deliverPrepared({ dryRun });
      results.push({ action: action.type, status: "executed", sent: delivery.results.filter((item) => item.status === "sent").length, blocked: delivery.results.filter((item) => item.status === "blocked").length });
    } else if (action.type === "watch-payment") {
      const sync = await syncPaymentFeed({ dryRun });
      results.push({ action: action.type, status: "executed", created: sync.created || 0, duplicates: sync.duplicates || 0, blocked: sync.status === "blocked" ? 1 : 0 });
    } else if (action.type === "scan-opportunities") {
      const scan = await scanOpportunitySources();
      results.push({ action: action.type, status: scan.status === "ok" || scan.status === "seeded" ? "executed" : scan.status, scanStatus: scan.status, signals: scan.signals?.length || 0, reason: scan.reason || "" });
    } else if (action.type === "expand-demand-capture" || action.type === "expand-utility-intent") {
      const site = generateSite();
      const deploy = await deployStaticSite({ dryRun });
      const search = await submitSearchIndex({ dryRun, lab: site.lab });
      results.push({
        action: action.type,
        status: "executed",
        stage: action.stage,
        demandPages: site.lab.reduce((sum, item) => sum + demandCapturePagesFor(item).length, 0),
        utilityPages: site.lab.reduce((sum, item) => sum + utilityIntentPagesFor(item).length, 0),
        deployStatus: deploy.status,
        searchStatus: search.status,
        submitted: search.submitted || 0,
        discovered: search.discovered || 0,
        reason: action.reason,
      });
    } else if (action.type === "expand-traffic-surface") {
      const expansion = await expandTrafficSurface({ dryRun });
      results.push({
        action: action.type,
        status: "executed",
        stage: action.stage,
        expansionId: expansion.id,
        round: expansion.round,
        signalsAdded: expansion.signalsAdded,
        experiments: expansion.experiments,
        demandPages: expansion.demandPages,
        searchStatus: expansion.searchStatus,
        submitted: expansion.searchSubmitted,
        discovered: expansion.searchDiscovered,
        reason: action.reason,
      });
    } else if (action.type === "double-down" || action.type === "collect-more-data") {
      const run = runAutopilot();
      results.push({ action: action.type, status: "executed", runId: run.id, experiments: run.experiments, publishTasks: run.publishTasks });
    } else if (action.type === "claim-publish") {
      const publish = await publishQueuedTasks({ dryRun });
      const sent = publish.results.filter((item) => item.status === "sent").length;
      const handedOff = publish.results.filter((item) => item.status === "handed-off").length;
      const ready = publish.results.filter((item) => item.status === "dry-run-ready").length;
      const blocked = publish.results.filter((item) => item.status === "blocked").length;
      const failed = publish.results.filter((item) => item.status === "failed").length;
      const status = sent || handedOff || ready ? "executed" : "needs-external-agent";
      results.push({
        action: action.type,
        status,
        sent,
        handedOff,
        dryRunReady: ready,
        blocked,
        failed,
        endpoint: status === "needs-external-agent" ? "/api/publish-agent/tasks" : undefined,
        count: action.count || 0,
      });
    } else if (action.type === "optimize-offer-variant" || action.type === "rewrite-offer-from-views" || action.type === "recover-unpaid-checkout" || action.type === "convert-high-intent-lead" || action.type === "convert-sample-interest" || action.type === "escalate-published-no-checkout" || action.type === "discount-direct-traffic-no-checkout" || action.type === "compress-starter-traffic-to-instant-checkout" || action.type === "route-traffic-starved-to-utility") {
      const optimization = saveVariantOptimization({
        experimentId: action.experimentId,
        variantId: action.variantId,
        variantLabel: action.variantLabel,
        variantUrl: action.variantUrl,
        previousVariantId: action.previousVariantId || null,
        checkoutIds: action.checkoutIds || [],
        recoveryUrls: action.recoveryUrls || [],
        leadScores: action.leadScores || [],
        leadTypes: action.leadTypes || [],
        metrics: action.metrics,
        trigger: action.trigger,
        reason: action.reason,
        recommendedPublishUrl: action.recommendedPublishUrl || action.variantUrl,
        source:
          action.type === "rewrite-offer-from-views"
            ? "automatic-view-rewrite"
            : action.type === "recover-unpaid-checkout"
              ? "automatic-unpaid-checkout-recovery"
              : action.type === "convert-high-intent-lead"
                ? "automatic-high-intent-lead-conversion"
                : action.type === "convert-sample-interest"
                  ? "automatic-sample-interest-close"
                : action.type === "escalate-published-no-checkout"
                  ? "automatic-published-no-checkout-direct-buy"
                : action.type === "discount-direct-traffic-no-checkout"
                  ? "automatic-direct-traffic-starter-offer"
                : action.type === "compress-starter-traffic-to-instant-checkout"
                  ? "automatic-starter-no-checkout-instant"
                : action.type === "route-traffic-starved-to-utility"
                  ? "automatic-traffic-starved-utility"
                : "buyer-intent-variant-optimization",
      });
      const recoveryPackages =
        action.type === "recover-unpaid-checkout"
          ? saveCheckoutRecoveryPackages(action.checkoutIds || [], {
              source: "automatic-unpaid-checkout-recovery",
              reason: action.reason,
              trigger: action.trigger,
              recommendedPublishUrl: action.recommendedPublishUrl || action.variantUrl,
            })
          : [];
      const republish = writeOptimizedGrowthOutboxPackages(action.experimentId, {
        source:
          action.type === "rewrite-offer-from-views"
            ? "automatic-view-rewrite"
            : action.type === "recover-unpaid-checkout"
              ? "automatic-unpaid-checkout-recovery"
              : action.type === "convert-high-intent-lead"
                ? "automatic-high-intent-lead-conversion"
                : action.type === "convert-sample-interest"
                  ? "automatic-sample-interest-close"
                : action.type === "escalate-published-no-checkout"
                  ? "automatic-published-no-checkout-direct-buy"
                : action.type === "discount-direct-traffic-no-checkout"
                  ? "automatic-direct-traffic-starter-offer"
                : action.type === "compress-starter-traffic-to-instant-checkout"
                  ? "automatic-starter-no-checkout-instant"
                : action.type === "route-traffic-starved-to-utility"
                  ? "automatic-traffic-starved-utility"
                : "buyer-intent-variant-optimization",
        trigger: action.trigger || action.type,
        reason: action.reason,
        dryRun,
      });
      results.push({
        action: action.type,
        status: "executed",
        experimentId: optimization.experimentId,
        variantId: optimization.variantId,
        previousVariantId: optimization.previousVariantId,
        recommendedPublishUrl: optimization.recommendedPublishUrl,
        recoveryUrls: optimization.recoveryUrls || [],
        recoveryPackages: recoveryPackages.length || undefined,
        republishStatus: republish.status,
        republishPackages: republish.packages.length,
      });
    } else if (action.type.startsWith("fix-adapter-")) {
      results.push({
        action: action.type,
        status: "blocked",
        target: action.target,
        count: action.count || 0,
        reason: action.reason,
        command: action.command,
      });
    } else if (action.type === "pause-combo") {
      results.push({ action: action.type, status: "recorded", target: action.target });
    } else if (action.type === "submit-search-index") {
      const search = await submitSearchIndex({ dryRun });
      results.push({
        action: action.type,
        status: search.status === "submitted" || search.status === "dry-run-ready" || search.status === "noop" ? "executed" : search.status,
        submitted: search.submitted || 0,
        discovered: search.discovered || 0,
        reason: search.reason,
      });
    } else {
      results.push({ action: action.type, status: "skipped", reason: "unknown-action" });
    }
  }
  const summary = {
    id: `action_exec_${Date.now()}`,
    at: new Date().toISOString(),
    dryRun,
    results,
  };
  writeJsonFile("last-action-execution.json", summary);
  appendActionExecutionHistory(summary);
  saveActionPlan(buildActionPlan());
  return summary;
}

function generateAdaptiveHypotheses({ seed = todaySeed(), count = 8, strategy = buildStrategy({ seed, count }) } = {}) {
  const opportunitySignals = validOpportunitySignals(Math.floor(count / 2));
  const opportunityHypotheses = opportunitySignals.map((signal, index) => hypothesisFromOpportunity(signal, index, seed));
  if (!strategy.hasEvidence) {
    const baseline = generateHypotheses({ seed, count });
    return [...opportunityHypotheses, ...baseline].slice(0, count);
  }
  const adaptive = strategy.selectedCombos.map((combo, index) => {
    const market = markets.find((item) => item.id === combo.marketId);
    const offerType = offerTypes.find((item) => item.id === combo.offerTypeId);
    const hypothesis = hypothesisFor(market, offerType, index + opportunityHypotheses.length, seed);
    const pricing = (strategy.pricingRules || []).find((item) => item.key === combo.key);
    if (pricing) {
      hypothesis.basePrice = pricing.basePrice;
      hypothesis.price = pricing.price;
      hypothesis.pricingReason = pricing.reason;
      hypothesis.promise = `${hypothesis.promise}（本轮自动测试价：¥${pricing.price}，原因：${pricing.reason}）`;
    }
    return hypothesis;
  });
  return [...opportunityHypotheses, ...adaptive].slice(0, count);
}

function aggregateMetrics(experiments, events = loadEvents(), orders = loadOrders()) {
  const byId = Object.fromEntries(experiments.map((item) => [item.id, { views: 0, clicks: 0, leads: 0, paid: 0, delivered: 0, revenue: 0, pendingDelivery: 0 }]));
  for (const event of events) {
    if (!byId[event.experimentId]) continue;
    if (!isBuyerSignalEvent(event)) continue;
    if (event.type === "view") byId[event.experimentId].views += 1;
    if (event.type === "click") byId[event.experimentId].clicks += 1;
    if (isLeadEvent(event)) byId[event.experimentId].leads += 1;
  }
  for (const order of orders) {
    if (!byId[order.experimentId]) continue;
    byId[order.experimentId].paid += order.status === "paid" || order.status === "delivered" ? 1 : 0;
    byId[order.experimentId].delivered += order.status === "delivered" ? 1 : 0;
    byId[order.experimentId].pendingDelivery += order.status === "paid" ? 1 : 0;
    byId[order.experimentId].revenue += Number(order.amount || 0);
  }
  return byId;
}

function offerVariantsFor(experiment) {
  return [
    {
      id: "direct",
      label: "直接成交版",
      headline: experiment.title,
      lead: experiment.promise,
      angle: "直接说明痛点、交付和价格，适合已经知道自己要什么的买家。",
      cta: "生成唯一付款备注",
    },
    {
      id: "pain",
      label: "痛点放大版",
      headline: `别再卡在「${experiment.pain}」`,
      lead: `给${experiment.buyer}的现成交付包：${experiment.delivery}。今天先拿到能用的版本。`,
      angle: "先放大买家的当前阻塞，再承接到一个可立即购买的最小交付物。",
      cta: "我想今天解决这个问题",
    },
    {
      id: "proof",
      label: "边界信任版",
      headline: `${experiment.delivery}，付款前先把边界讲清楚`,
      lead: `不承诺收益、不制造焦虑，只卖一个明确、可复制、能立刻交付的数字包。`,
      angle: "先降低智商税疑虑，突出交付边界、价格和自动发货机制。",
      cta: "先确认边界再付款",
    },
  ];
}

function variantMetricsFor(experimentId, variantId, events = loadEvents(), orders = loadOrders()) {
  const metrics = { views: 0, clicks: 0, leads: 0, checkouts: 0, paid: 0, revenue: 0 };
  for (const event of events) {
    if (event.experimentId !== experimentId || event.variantId !== variantId) continue;
    if (!isBuyerSignalEvent(event)) continue;
    if (event.type === "view") metrics.views += 1;
    if (event.type === "click") metrics.clicks += 1;
    if (isLeadEvent(event)) metrics.leads += 1;
    if (event.type === "checkout-created") metrics.checkouts += 1;
  }
  for (const order of orders) {
    if (order.experimentId !== experimentId || order.variantId !== variantId) continue;
    if (order.status === "paid" || order.status === "delivered") metrics.paid += 1;
    metrics.revenue += Number(order.amount || 0);
  }
  return metrics;
}

function scoreVariantMetrics(metrics) {
  const views = metrics.views || 0;
  const clicks = metrics.clicks || 0;
  const checkouts = metrics.checkouts || 0;
  const leads = metrics.leads || 0;
  const paid = metrics.paid || 0;
  const revenue = metrics.revenue || 0;
  const ctr = views ? clicks / views : 0;
  const checkoutRate = clicks ? checkouts / clicks : 0;
  const paidRate = checkouts ? paid / checkouts : 0;
  const score = paid * 120 + revenue * 2 + checkouts * 20 + leads * 8 + ctr * 20 + checkoutRate * 30 + paidRate * 50;
  return { score: Number(score.toFixed(2)), ctr, checkoutRate, paidRate };
}

function offerVariantViews(experiment) {
  return offerVariantsFor(experiment).map((variant) => {
    const metrics = variantMetricsFor(experiment.id, variant.id);
    return { ...variant, metrics, ...scoreVariantMetrics(metrics), url: publicOfferVariantUrl(experiment.id, variant.id) };
  });
}

function bestOfferVariant(experiment) {
  return [...offerVariantViews(experiment)].sort((a, b) => {
    if (b.metrics.paid !== a.metrics.paid) return b.metrics.paid - a.metrics.paid;
    if (b.metrics.revenue !== a.metrics.revenue) return b.metrics.revenue - a.metrics.revenue;
    if (b.metrics.checkouts !== a.metrics.checkouts) return b.metrics.checkouts - a.metrics.checkouts;
    if (b.metrics.clicks !== a.metrics.clicks) return b.metrics.clicks - a.metrics.clicks;
    return b.score - a.score;
  })[0];
}

function exposureRewriteRecommendation(experiment) {
  const metrics = experiment.metrics || {};
  const views = metrics.views || 0;
  const clicks = metrics.clicks || 0;
  const variants = offerVariantViews(experiment);
  const variantTotals = variants.reduce(
    (acc, variant) => {
      acc.views += variant.metrics?.views || 0;
      acc.clicks += variant.metrics?.clicks || 0;
      acc.leads += variant.metrics?.leads || 0;
      acc.checkouts += variant.metrics?.checkouts || 0;
      acc.paid += variant.metrics?.paid || 0;
      acc.revenue += variant.metrics?.revenue || 0;
      return acc;
    },
    { views: 0, clicks: 0, leads: 0, checkouts: 0, paid: 0, revenue: 0 }
  );
  if ((metrics.paid || 0) > 0 || variantTotals.paid > 0 || variantTotals.checkouts > 0) return null;
  const existingStarter = loadVariantOptimizations().find(
    (item) =>
      item.experimentId === experiment.id &&
      ["automatic-direct-traffic-starter-offer", "automatic-starter-no-checkout-instant"].includes(item.source)
  );
  if (existingStarter) return null;
  const enoughDeadExposure = views >= 10 && clicks === 0 && variantTotals.clicks === 0;
  const weakExposure = views >= 25 && clicks < 2 && variantTotals.clicks < 2;
  if (!enoughDeadExposure && !weakExposure) return null;

  const mostViewedVariant = [...variants].sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0))[0];
  const failingVariantId = (mostViewedVariant?.metrics?.views || 0) > 0 ? mostViewedVariant.id : "direct";
  const preferredOrder = clicks > 0 || variantTotals.clicks > 0 ? ["proof", "pain", "direct"] : ["pain", "proof", "direct"];
  const recommendedVariant =
    preferredOrder.map((id) => variants.find((variant) => variant.id === id)).find((variant) => variant && variant.id !== failingVariantId) ||
    variants.find((variant) => variant.id !== failingVariantId) ||
    variants[0];
  if (!recommendedVariant) return null;
  return {
    trigger: enoughDeadExposure ? "views-without-clicks" : "weak-exposure",
    previousVariantId: failingVariantId,
    variant: recommendedVariant,
    rescueUrl: publicRescueOfferUrl(experiment.id),
    metrics: {
      ...variantTotals,
      experimentViews: views,
      experimentClicks: clicks,
    },
  };
}

function sampleInterestCloseRecommendation(experiment, events = loadEvents()) {
  const variants = offerVariantViews(experiment);
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const checkoutEvents = events.filter((item) => item.experimentId === experiment.id && item.type === "checkout-created");
  if (checkoutEvents.length) return null;
  const sampleViews = events.filter(
    (item) =>
      item.experimentId === experiment.id &&
      item.type === "view" &&
      isBuyerSignalEvent(item) &&
      ["sample-page", "server:sample-page"].includes(String(item.channel || ""))
  );
  if (sampleViews.length < 3) return null;
  const proof = variants.find((variant) => variant.id === "proof") || variants[0];
  if (!proof) return null;
  return {
    trigger: "sample-views-without-checkout",
    previousVariantId: "sample",
    variant: proof,
    closeUrl: publicSampleCloseUrl(experiment.id),
    metrics: {
      sampleViews: sampleViews.length,
      checkouts: checkoutEvents.length,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
    },
  };
}

function publishedNoCheckoutRecommendation(experiment, publishQueue = loadPublishQueue(), events = loadEvents()) {
  const variants = offerVariantViews(experiment);
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const checkoutEvents = events.filter((item) => item.experimentId === experiment.id && item.type === "checkout-created");
  if (checkoutEvents.length) return null;
  const existingUtility = loadVariantOptimizations().find(
    (item) => item.experimentId === experiment.id && item.source === "automatic-traffic-starved-utility"
  );
  if (existingUtility) {
    const utilityEvidence = events.filter((item) => {
      if (item.experimentId !== experiment.id) return false;
      if (!isBuyerSignalEvent(item)) return false;
      if (isLeadEvent(item)) return true;
      if (item.type !== "view") return false;
      const channel = String(item.channel || "");
      const pathValue = String(item.path || item.url || "");
      return channel.startsWith("server:utility:") || landingRouteKind(pathValue) === "utility";
    });
    const highIntentLeads = utilityEvidence.filter((item) => isHighIntentLeadEvent(item));
    if (!highIntentLeads.length && utilityEvidence.length < 3) return null;
  }
  const existingStarter = loadVariantOptimizations().find(
    (item) =>
      item.experimentId === experiment.id &&
      ["automatic-direct-traffic-starter-offer", "automatic-starter-no-checkout-instant"].includes(item.source)
  );
  if (existingStarter) return null;
  const sentTasks = publishQueue.filter((item) => item.experimentId === experiment.id && ["sent", "handed-off"].includes(item.status));
  const publishSentEvents = events.filter((item) => item.experimentId === experiment.id && item.type === "publish-sent");
  if (!sentTasks.length && !publishSentEvents.length) return null;
  const buyerSignalEvents = events.filter(
    (item) => item.experimentId === experiment.id && isBuyerSignalEvent(item) && (item.type === "view" || item.type === "click" || isLeadEvent(item))
  );
  if (!buyerSignalEvents.length) return null;
  const existing = loadVariantOptimizations().find(
    (item) => item.experimentId === experiment.id && item.source === "automatic-published-no-checkout-direct-buy"
  );
  if (existing) return null;
  const direct = variants.find((variant) => variant.id === "direct") || variants[0];
  if (!direct) return null;
  const routedKinds = sentTasks.reduce((acc, task) => {
    const kind = landingRouteKind(task.recommendedUrl || task.trackingUrl || "");
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});
  const coldStartSentTasks = sentTasks.filter((task) => ["utility", "hub", "seo", "sample"].includes(landingRouteKind(task.recommendedUrl || task.trackingUrl || "")));
  if (coldStartSentTasks.length === sentTasks.length && publishSentEvents.length === 0) return null;
  return {
    trigger: "published-without-checkout",
    previousVariantId: sentTasks[0]?.recommendedVariantId || sentTasks[0]?.recommendedSamplePage?.kind || "published",
    variant: direct,
    directUrl: publicBuyNowUrl(experiment.id),
    metrics: {
      sentPublishTasks: sentTasks.length,
      publishSentEvents: publishSentEvents.length,
      buyerSignalEvents: buyerSignalEvents.length,
      checkouts: checkoutEvents.length,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
      routedKinds,
    },
  };
}

function directTrafficNoCheckoutRecommendation(experiment, publishQueue = loadPublishQueue(), events = loadEvents()) {
  const variants = offerVariantViews(experiment);
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const checkoutEvents = events.filter((item) => item.experimentId === experiment.id && item.type === "checkout-created");
  if (checkoutEvents.length) return null;
  const directViews = events.filter(
    (item) =>
      item.experimentId === experiment.id &&
      item.type === "view" &&
      isBuyerSignalEvent(item) &&
      ["server:buy-now", "buy-now"].includes(String(item.channel || ""))
  );
  const routedTasks = publishQueue.filter((item) => {
    if (item.experimentId !== experiment.id) return false;
    const optimized = optimizedPublishUrlForTask(item);
    return landingRouteKind(optimized.url || item.recommendedUrl || item.trackingUrl || "") === "buy-now";
  });
  const directRouteAlreadyActive = routedTasks.length > 0;
  if (directViews.length < 2 && !(directRouteAlreadyActive && directViews.length >= 1)) return null;
  const existing = loadVariantOptimizations().find(
    (item) =>
      item.experimentId === experiment.id &&
      ["automatic-direct-traffic-starter-offer", "automatic-starter-no-checkout-instant"].includes(item.source)
  );
  if (existing) return null;
  const proof = variants.find((variant) => variant.id === "proof") || variants[0];
  if (!proof) return null;
  return {
    trigger: "direct-views-without-checkout",
    previousVariantId: "direct",
    variant: proof,
    starterUrl: publicStarterOfferUrl(experiment.id),
    metrics: {
      directViews: directViews.length,
      routedBuyNowTasks: routedTasks.length,
      checkouts: checkoutEvents.length,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
      offer: "starter",
      starterPrice: starterOfferPrice(experiment),
    },
  };
}

function starterTrafficNoCheckoutRecommendation(experiment, publishQueue = loadPublishQueue(), events = loadEvents()) {
  const variants = offerVariantViews(experiment);
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const checkoutEvents = events.filter((item) => item.experimentId === experiment.id && item.type === "checkout-created");
  if (checkoutEvents.length) return null;
  const existingInstant = loadVariantOptimizations().find(
    (item) => item.experimentId === experiment.id && item.source === "automatic-starter-no-checkout-instant"
  );
  if (existingInstant) return null;
  const hasStarterOptimization = loadVariantOptimizations().some(
    (item) => item.experimentId === experiment.id && item.source === "automatic-direct-traffic-starter-offer"
  );
  const routedTasks = publishQueue.filter((item) => {
    if (item.experimentId !== experiment.id) return false;
    const optimized = optimizedPublishUrlForTask(item);
    return landingRouteKind(optimized.url || item.recommendedUrl || item.trackingUrl || "") === "starter";
  });
  const starterViews = events.filter(
    (item) =>
      item.experimentId === experiment.id &&
      item.type === "view" &&
      isBuyerSignalEvent(item) &&
      ["server:starter-offer", "starter-offer"].includes(String(item.channel || ""))
  );
  const starterRouteAlreadyActive = routedTasks.length > 0 || hasStarterOptimization;
  if (!starterRouteAlreadyActive) return null;
  if (starterViews.length < 1) return null;
  const proof = variants.find((variant) => variant.id === "proof") || variants[0];
  if (!proof) return null;
  return {
    trigger: "starter-route-without-checkout",
    previousVariantId: "starter",
    variant: proof,
    instantUrl: publicInstantCheckoutUrl(experiment.id),
    metrics: {
      starterViews: starterViews.length,
      routedStarterTasks: routedTasks.length,
      checkouts: checkoutEvents.length,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
      offer: "starter",
      starterPrice: starterOfferPrice(experiment),
    },
  };
}

function trafficStarvedUtilityRecommendation(experiment, publishQueue = loadPublishQueue(), events = loadEvents()) {
  const variants = offerVariantViews(experiment);
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const checkoutEvents = events.filter((item) => item.experimentId === experiment.id && item.type === "checkout-created");
  if (checkoutEvents.length) return null;
  const utility = bestUtilityIntentForExperiment(experiment, events);
  if (!utility) return null;
  const productViews = events.filter((item) => item.experimentId === experiment.id && item.type === "view" && isBuyerSignalEvent(item)).length;
  const paidPageViews = events.filter((item) => {
    if (item.experimentId !== experiment.id || item.type !== "view") return false;
    if (!isBuyerSignalEvent(item)) return false;
    const channel = String(item.channel || "");
    const pathValue = String(item.path || item.url || "");
    return (
      ["server:buy-now", "buy-now", "server:starter-offer", "starter-offer", "server:instant-checkout", "instant-checkout"].includes(channel) ||
      ["buy-now", "starter", "instant"].includes(landingRouteKind(pathValue))
    );
  }).length;
  const routedTasks = publishQueue.filter((item) => {
    if (item.experimentId !== experiment.id) return false;
    const optimized = optimizedPublishUrlForTask(item);
    return ["starter", "instant", "buy-now"].includes(landingRouteKind(optimized.url || item.recommendedUrl || item.trackingUrl || ""));
  });
  const existingUtility = loadVariantOptimizations().find(
    (item) => item.experimentId === experiment.id && item.source === "automatic-traffic-starved-utility"
  );
  if (existingUtility && paidPageViews < 3) return null;
  if (routedTasks.length < 3 || paidPageViews !== 0) return null;
  const proof = variants.find((variant) => variant.id === "proof") || variants[0];
  if (!proof) return null;
  return {
    trigger: "paid-route-without-real-traffic",
    previousVariantId: landingRouteKind(optimizedPublishUrlForTask(routedTasks[0]).url || routedTasks[0].recommendedUrl || routedTasks[0].trackingUrl || "paid-route"),
    variant: proof,
    utilityUrl: publicUtilityIntentUrl(utility),
    utility,
    metrics: {
      productViews,
      paidPageViews,
      routedPaidTasks: routedTasks.length,
      utilityViews: Number(utility.views || 0),
      checkouts: checkoutEvents.length,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
    },
  };
}

function paymentFrictionRecommendation(experiment, checkouts = loadCheckouts(), { now = Date.now(), staleMinutes = 20 } = {}) {
  const variants = offerVariantViews(experiment);
  const experimentCheckouts = checkouts.filter((item) => item.experimentId === experiment.id && ["pending", "underpaid"].includes(item.status));
  if (!experimentCheckouts.length) return null;
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const staleMs = Math.max(1, Number(staleMinutes) || 20) * 60 * 1000;
  const stale = experimentCheckouts.filter((item) => {
    const createdAt = Date.parse(item.createdAt || "");
    return Number.isFinite(createdAt) && now - createdAt >= staleMs;
  });
  const underpaid = experimentCheckouts.filter((item) => item.status === "underpaid");
  if (!stale.length && !underpaid.length) return null;

  const sourceCheckout = underpaid[0] || stale[0];
  const previousVariantId = sourceCheckout.variantId || "direct";
  const recommendedVariant =
    variants.find((variant) => variant.id === "proof" && variant.id !== previousVariantId) ||
    variants.find((variant) => variant.id === "pain" && variant.id !== previousVariantId) ||
    variants.find((variant) => variant.id !== previousVariantId) ||
    variants[0];
  if (!recommendedVariant) return null;
  return {
    trigger: underpaid.length ? "underpaid-checkout" : "stale-pending-checkout",
    previousVariantId,
    variant: recommendedVariant,
    checkoutIds: experimentCheckouts.map((item) => item.id),
    recoveryUrls: experimentCheckouts.map((item) => publicCheckoutRecoveryUrl(item.id)),
    metrics: {
      pendingCheckouts: experimentCheckouts.filter((item) => item.status === "pending").length,
      underpaidCheckouts: underpaid.length,
      staleCheckouts: stale.length,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
    },
  };
}

function highIntentLeadRecommendation(experiment, events = loadEvents()) {
  const variants = offerVariantViews(experiment);
  const leads = events.filter(
    (item) =>
      item.experimentId === experiment.id &&
      isHighIntentLeadEvent(item)
  );
  if (!leads.length) return null;
  const hasPaid = (experiment.metrics?.paid || 0) > 0 || variants.some((variant) => (variant.metrics?.paid || 0) > 0);
  if (hasPaid) return null;
  const proof = variants.find((variant) => variant.id === "proof") || variants[0];
  if (!proof) return null;
  const checkouts = events.filter((item) => item.experimentId === experiment.id && item.type === "checkout-created").length;
  return {
    trigger: "high-intent-lead-tool",
    variant: proof,
    leadScores: leads.map((item) => Number(item.score || 0)),
    leadTypes: [...new Set(leads.map((item) => item.type))],
    metrics: {
      highIntentLeads: leads.length,
      leads: experiment.metrics?.leads || 0,
      clicks: experiment.metrics?.clicks || 0,
      checkouts,
      paid: experiment.metrics?.paid || 0,
      revenue: experiment.metrics?.revenue || 0,
    },
  };
}

function experimentView(experiment, metrics) {
  const scored = scoreExperiment(metrics);
  const base = { ...experiment, metrics, ...scored };
  const offerVariants = offerVariantViews(base);
  const winningVariant = bestOfferVariant(base);
  return { ...base, offerVariants, winningVariant, promos: promoFor({ ...base, winningVariant }) };
}

function buildLab({ seed = todaySeed(), count = 8, adaptive = true, strategy = buildStrategy({ seed, count }) } = {}) {
  const experiments = adaptive ? generateAdaptiveHypotheses({ seed, count, strategy }) : generateHypotheses({ seed, count });
  const metrics = aggregateMetrics(experiments);
  return experiments.map((experiment) => experimentView(experiment, metrics[experiment.id]));
}

function canonicalPublicProduct() {
  const base =
    generateHypotheses({ seed: 20261012, count: 16 }).find(
      (item) => item.marketId === "jobseekers" && item.offerTypeId === "checklist"
    ) || generateHypotheses({ seed: 20261012, count: 1 })[0];
  return experimentView(
    {
      ...base,
      id: "jobseekers-resume-workbench",
      marketId: "jobseekers",
      offerTypeId: "checklist",
      title: "一页简历成品生成器",
      buyer: "今晚就要投递、但手里只有零散经历的求职者",
      pain: "简历信息散乱、排版难看，无法快速做出一份能直接投递的 PDF",
      spendReason: "购买一个不上传隐私、填完资料就能直接打印成 PDF 的简历成品生成器",
      delivery: "离线单文件应用：岗位 JD 对齐、简历成品排版、项目表达、证据检查和 PDF 输出",
      promise: "填写真实资料并粘贴目标 JD，直接生成排好版的一页简历，可保存为 PDF；内容不上传。",
      safety: "不编造经历，不承诺录用；只交付可离线使用的一页简历生成器。",
      price: 9,
      opportunityId: "",
      opportunityKeyword: "",
    },
    { views: 0, clicks: 0, leads: 0, paid: 0, delivered: 0, revenue: 0, pendingDelivery: 0 }
  );
}

function featuredExperiment() {
  return canonicalPublicProduct();
}

function publicFeaturedExperiments(lab) {
  const featured = featuredExperiment();
  return featured ? [featured] : [];
}

function writePrivateExperimentAssets(experiment) {
  fs.mkdirSync(PRIVATE_DELIVERY_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}.md`), deliveryMarkdown(experiment));
  fs.writeFileSync(path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}--starter.md`), starterDeliveryMarkdown(experiment));
  if (experiment.marketId === "jobseekers") {
    fs.writeFileSync(path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}.html`), resumeWorkbenchHtml(experiment));
  }
}

function writeExperimentAssets(experiment, { curated = false } = {}) {
  const offerDir = path.join(DIST_DIR, "offer");
  const previewDir = path.join(DIST_DIR, "delivery-preview");
  const samplesDir = path.join(DIST_DIR, "samples");
  const appDir = path.join(DIST_DIR, "app");
  fs.mkdirSync(offerDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });
  fs.mkdirSync(samplesDir, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  writePrivateExperimentAssets(experiment);
  if (experiment.marketId === "jobseekers") {
    fs.writeFileSync(path.join(appDir, "resume-builder.html"), resumeWorkbenchHtml(experiment));
  }
  fs.writeFileSync(path.join(previewDir, `${experiment.id}.md`), deliveryPreviewMarkdown(experiment));
  fs.writeFileSync(
    path.join(offerDir, `${experiment.id}.html`),
    offerHtml(experiment, experiment.winningVariant || offerVariantsFor(experiment)[0], publicOfferUrl(experiment.id))
  );
  for (const variant of experiment.offerVariants || offerVariantViews(experiment)) {
    fs.writeFileSync(path.join(offerDir, `${experiment.id}--${variant.id}.html`), offerHtml(experiment, variant));
  }
  fs.writeFileSync(path.join(samplesDir, `${experiment.id}.html`), samplePageHtml(experiment));
  if (curated) return;
  const seoDir = path.join(DIST_DIR, "seo");
  const toolsDir = path.join(DIST_DIR, "tools");
  const sampleCloseDir = path.join(DIST_DIR, "sample-close");
  const salesDir = path.join(DIST_DIR, "sales");
  const objectionsDir = path.join(DIST_DIR, "objections");
  const questionsDir = path.join(DIST_DIR, "questions");
  const intentDir = path.join(DIST_DIR, "intent");
  const demandDir = path.join(DIST_DIR, "demand");
  const utilitiesDir = path.join(DIST_DIR, "utilities");
  for (const directory of [seoDir, toolsDir, sampleCloseDir, salesDir, objectionsDir, questionsDir, intentDir, demandDir, utilitiesDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(path.join(toolsDir, `${experiment.id}.html`), leadToolHtml(experiment));
  fs.writeFileSync(path.join(sampleCloseDir, `${experiment.id}.html`), sampleClosePageHtml(experiment));
  fs.writeFileSync(path.join(salesDir, `${experiment.id}.html`), salesAssistantHtml(experiment));
  for (const page of seoPagesFor(experiment)) {
    fs.writeFileSync(path.join(seoDir, `${page.slug}.html`), seoArticleHtml(experiment, page));
  }
  for (const page of objectionPagesFor(experiment)) {
    fs.writeFileSync(path.join(objectionsDir, `${page.slug}.html`), objectionPageHtml(experiment, page));
  }
  for (const page of buyerQuestionPagesFor(experiment)) {
    fs.writeFileSync(path.join(questionsDir, `${page.slug}.html`), buyerQuestionPageHtml(experiment, page));
  }
  for (const page of purchaseIntentPagesFor(experiment)) {
    fs.writeFileSync(path.join(intentDir, `${page.slug}.html`), purchaseIntentPageHtml(experiment, page));
  }
  for (const page of demandCapturePagesFor(experiment)) {
    fs.writeFileSync(path.join(demandDir, `${page.slug}.html`), demandCapturePageHtml(experiment, page));
  }
  for (const page of utilityIntentPagesFor(experiment)) {
    fs.writeFileSync(path.join(utilitiesDir, `${page.slug}.html`), utilityIntentPageHtml(experiment, page));
  }
}

function publicLeadToolUrl(experimentId) {
  return toPublicUrl(`/tools/${encodeURIComponent(experimentId)}.html`);
}

function publicSamplePageUrl(experimentId) {
  return toPublicUrl(`/samples/${encodeURIComponent(experimentId)}.html`);
}

function publicSampleCloseUrl(experimentId) {
  return toPublicUrl(`/sample-close/${encodeURIComponent(experimentId)}.html`);
}

function publicSalesAssistantUrl(experimentId) {
  return toPublicUrl(`/sales/${encodeURIComponent(experimentId)}.html`);
}

function publicObjectionPageUrl(page) {
  return toPublicUrl(`/objections/${encodeURIComponent(page.slug)}.html`);
}

function publicBuyerQuestionPageUrl(page) {
  return toPublicUrl(`/questions/${encodeURIComponent(page.slug)}.html`);
}

function publicPurchaseIntentPageUrl(page) {
  return toPublicUrl(`/intent/${encodeURIComponent(page.slug)}.html`);
}

function samplePageHtml(experiment) {
  const variantId = experiment.winningVariant?.id || "proof";
  const buyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("sample-page")}`;
  const canonicalUrl = publicSamplePageUrl(experiment.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`一页简历成品示例｜${experiment.title}`)}</title>
  <meta name="description" content="查看一页 A4 简历的完整排版示例、项目经历写法和交付内容；购买前先确认成品是否适合你。" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(`一页简历成品示例｜${experiment.title}`)}" />
  <meta property="og:description" content="购买前先看完整 A4 排版效果：基本信息、技能、工作和项目经历如何落在一页内。" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page storefront">
    <section class="hero card">
      <p class="eyebrow">购买前完整看成品</p>
      <h1>一页简历最终会长这样。</h1>
      <p class="lead">这是一份完整的 A4 排版示例，不是教程截图。购买后，你可以在离线生成器里换成自己的真实资料、对照目标 JD 检查关键词，再直接保存为 PDF。</p>
      <div class="actions">
        <a class="button" href="${escapeHtml(buyUrl)}">¥${escapeHtml(String(experiment.price))} 获取完整生成器</a>
        <a class="button ghost" href="/#rewrite">先免费试排一条经历</a>
      </div>
      <p class="trust-line">示例姓名和经历均为虚构，仅用于展示真实排版结构；生成器不会替你编造经历。</p>
    </section>

    <section class="card sample-resume-stage">
      <div class="resume-sheet sample-resume-sheet" aria-label="一页简历完整成品示例">
        <header class="resume-sheet-header">
          <div>
            <strong>林知远</strong>
            <span>前端开发工程师</span>
          </div>
          <small>138 **** 9527 · lin***@mail.com · 上海</small>
        </header>
        <div class="resume-sheet-section">
          <b>个人优势</b>
          <p>3 年 Web 应用开发经验，负责过后台交易与内容管理模块，能独立推进需求澄清、开发、联调和上线；重视异常场景、交付质量与可维护性。</p>
        </div>
        <div class="resume-sheet-section">
          <b>核心技能</b>
          <div class="resume-tags"><span>Vue 3</span><span>TypeScript</span><span>Vite</span><span>性能优化</span><span>前端工程化</span></div>
        </div>
        <div class="resume-sheet-section">
          <b>工作经历</b>
          <div class="resume-role"><strong>远杉科技 · 前端开发工程师</strong><small>2022.07–2025.06</small></div>
          <ul>
            <li>负责交易后台与运营工具的前端开发，参与需求评审、方案设计、联调、测试和上线。</li>
            <li>沉淀表格筛选、权限控制和异常提示等公共能力，供多个业务模块复用。</li>
          </ul>
        </div>
        <div class="resume-sheet-section">
          <b>项目经历</b>
          <div class="resume-role"><strong>交易后台订单模块</strong><small>核心开发 · 2024.03–2025.01</small></div>
          <ul>
            <li>独立完成订单筛选、批量导出与异常状态提示，覆盖 6 类订单状态和弱网场景。</li>
            <li>补齐接口失败兜底与操作反馈，协同产品、测试完成验收并按期上线。</li>
          </ul>
          <div class="resume-role"><strong>运营内容管理工具</strong><small>前端开发 · 2023.05–2024.02</small></div>
          <ul>
            <li>完成内容创建、审核与发布流程，明确 3 类角色权限和 8 个关键操作状态。</li>
          </ul>
        </div>
        <div class="resume-sheet-section">
          <b>教育经历</b>
          <div class="resume-role"><strong>华东理工大学 · 软件工程</strong><small>2018.09–2022.06</small></div>
        </div>
        <div class="resume-sheet-footer">A4 一页成品示例 · 示例内容均为虚构，仅展示排版</div>
      </div>
    </section>

    <section class="card comparison">
      <p class="eyebrow">同一段经历，差别在哪里</p>
      <div class="before-after">
        <article>
          <span class="comparison-label bad">原始写法</span>
          <p>负责后台系统开发，参与需求讨论，完成多个页面。</p>
          <small>看不出负责范围、做了什么，也没有可追问的交付证据。</small>
        </article>
        <article>
          <span class="comparison-label good">成品写法</span>
          <p>独立完成订单筛选、批量导出与异常状态提示，覆盖 6 类订单状态和弱网场景；协同产品、测试完成验收并按期上线。</p>
          <small>只整理真实事实，不生成无法解释的夸张数字。</small>
        </article>
      </div>
    </section>

    <section class="card guarantee">
      <div>
        <p class="eyebrow">你实际会收到</p>
        <h2>一个可离线使用的 HTML 生成器</h2>
        <p>双击打开，填写自己的资料，检查 JD 覆盖情况并生成一页排版；支持本地草稿、TXT 下载和浏览器保存 PDF。内容不上传。</p>
      </div>
      <div class="final-buy">
        <strong>¥${escapeHtml(String(experiment.price))}</strong>
        <a class="button" href="${escapeHtml(buyUrl)}">获取完整生成器</a>
      </div>
    </section>
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:'sample-page'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function sampleClosePageHtml(experiment) {
  const variantId = "proof";
  const fullBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("sample-close:full")}`;
  const starterBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("sample-close:starter")}&offer=starter`;
  const canonicalUrl = publicSampleCloseUrl(experiment.id);
  const starterPrice = starterOfferPrice(experiment);
  const sample = sampleLeadMarkdown(experiment, `我已经看过样例，现在想拿完整版本解决：${experiment.pain}`);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`样例后购买：${experiment.title}`)}</title>
  <meta name="description" content="${escapeHtml(`程序检测到免费样例有访问但未形成 checkout，自动生成样例后成交页：回顾样例价值，并提供 ¥${starterPrice} 入门版或 ¥${experiment.price} 完整包。`)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(`样例后购买：${experiment.title}`)}" />
  <meta property="og:description" content="${escapeHtml(`看过样例后，如果要完整 ${experiment.delivery}，生成唯一付款备注即可自动取货。`)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: `样例后购买：${experiment.title}`, description: `免费样例后的自动成交页，提供入门版和完整包。`, price: starterPrice }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">样例后成交页 / 程序自动生成 / ${escapeHtml(variantId)}</p>
      <h1>你已经看过样例，下一步拿完整包</h1>
      <p class="lead">程序检测到这个免费样例有人看，但还没有生成 checkout。它会把后续流量切到这个更强的成交承接页：先复盘样例价值，再给入门版和完整包两个付款入口。</p>
      <div class="price">入门版 ¥${escapeHtml(String(starterPrice))} / 完整包 ¥${escapeHtml(String(experiment.price))}</div>
      <p class="actions">
        <a class="button" href="${escapeHtml(starterBuyUrl)}">先买入门版并生成付款备注</a>
        <a class="button ghost" href="${escapeHtml(fullBuyUrl)}">直接买完整包</a>
        <a class="button ghost" href="/samples/${escapeHtml(experiment.id)}.html">回看免费样例</a>
      </p>
    </section>
    <section class="card">
      <h2>你刚才看的样例说明了什么</h2>
      <pre>${escapeHtml(sample)}</pre>
      <p>免费样例只能证明方向和开头；完整包交付的是「${escapeHtml(experiment.delivery)}」，用于解决「${escapeHtml(experiment.pain)}」。</p>
    </section>
    <section class="grid">
      <article class="card"><h2>买家</h2><p>${escapeHtml(experiment.buyer)}</p></article>
      <article class="card"><h2>交付边界</h2><p>${escapeHtml(experiment.safety)}</p></article>
      <article class="card"><h2>自动交付</h2><p>点击购买后生成唯一付款备注；付款匹配成功后，系统自动生成私有交付链接。</p></article>
    </section>
    ${directCheckoutSectionHtml({
      experimentId: experiment.id,
      variantId,
      source: "sample-close:click",
      title: "样例后成交页：生成完整包付款备注",
      cta: "生成完整包付款备注",
      autostart: false,
      engagementAutostart: true,
    })}
    ${staticPaymentFallbackHtml(experiment, { label: "样例后成交页兜底收款" })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:'sample-close'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function leadToolHtml(experiment) {
  const recommendedOffer = publicOfferVariantUrl(experiment.id, "proof");
  const sampleLeadSessionKey = `sample-lead-session:${experiment.id}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(experiment.pain)} 自测工具</title>
  <meta name="description" content="${escapeHtml(`给${experiment.buyer}的免费自测：判断是否该购买 ${experiment.delivery}，并自动跳转到可付款交付包。`)}" />
  <link rel="canonical" href="${escapeHtml(publicLeadToolUrl(experiment.id))}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">免费诊断工具 / 自动获客入口</p>
      <h1>${escapeHtml(experiment.pain)}：3 题判断你是不是该买现成包</h1>
      <p class="lead">这个页面不是让你手工推销；它是程序自动生成的可索引小工具。用户完成自测后，系统记录真实购买意图，再把强意图用户导向付费 checkout。</p>
    </section>
    <section class="card">
      <form id="lead-tool">
        <label>1. 这个问题今天是否已经影响你交付/获客/求职？<select name="urgency"><option value="0">还没有</option><option value="1">有点影响</option><option value="2">今天就卡住了</option></select></label>
        <label>2. 你是否愿意用一个现成模板/清单先解决 80%？<select name="fit"><option value="0">只想免费看看</option><option value="1">可以考虑</option><option value="2">愿意直接拿来用</option></select></label>
        <label>3. 如果价格是 ¥${experiment.price}，你更担心什么？<select name="friction"><option value="0">价格</option><option value="1">是否适合我</option><option value="2">能否马上交付</option></select></label>
        <button class="button" type="submit">生成诊断结果</button>
      </form>
    </section>
    <section class="card" id="lead-result" hidden>
      <h2>诊断结果</h2>
      <p data-result-text></p>
      <p data-tool-checkout-status></p>
      <p data-tool-payment-remark></p>
      <div class="actions">
        <a class="button" href="${escapeHtml(recommendedOffer)}">打开付费包，生成唯一付款备注</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">先看交付边界</a>
      </div>
    </section>
    <section class="card">
      <h2>先拿一个免费样例</h2>
      <p class="safe">这不是让你人工卖；这是程序自动用免费样例换取真实意图。低意图只给样例，高意图直接生成唯一付款备注。</p>
      <form id="sample-lead-form">
        <label>你的具体场景
          <textarea name="context" rows="4" placeholder="例如：我今晚要整理一份面试/内容/店铺清单，想先看能不能直接套用。"></textarea>
        </label>
        <label>紧急程度
          <select name="urgency"><option value="">不急，只看看</option><option value="今天要用">今天要用</option><option value="马上要用">马上要用</option></select>
        </label>
        <label>接收方式（可选，填了说明意图更强）
          <input name="email" placeholder="邮箱 / 微信 / 其他联系方式" />
        </label>
        <button class="button" type="submit">生成免费样例并判断是否该买</button>
      </form>
    </section>
    <section class="card" id="sample-lead-result" hidden>
      <h2>程序生成的免费样例</h2>
      <pre data-sample-lead-preview></pre>
      <p data-sample-lead-reasons></p>
      <p data-sample-lead-checkout-status></p>
      <p data-sample-lead-payment-remark></p>
    </section>
  </main>
  <script>
    const experimentId = ${JSON.stringify(experiment.id)};
    const recommendedVariantId = 'proof';
    const leadSessionKey = 'lead-tool-session:' + experimentId;
    const leadSessionId = (() => {
      try {
        const existing = localStorage.getItem(leadSessionKey);
        if (existing) return existing;
        const next = 'lead_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(leadSessionKey, next);
        return next;
      } catch {
        return '';
      }
    })();
    fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId,channel:'lead-tool'})}).catch(()=>{});
    document.getElementById('lead-tool')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const urgencyScore = Number(data.get('urgency') || 0);
      const fitScore = Number(data.get('fit') || 0);
      const frictionScore = Number(data.get('friction') || 0);
      const score = urgencyScore + fitScore + frictionScore;
      const urgencyLabel = {0:'还没有影响',1:'有点影响',2:'今天就卡住了'}[String(data.get('urgency') || '0')] || '';
      const fitLabel = {0:'只想免费看看',1:'可以考虑',2:'愿意直接拿来用'}[String(data.get('fit') || '0')] || '';
      const frictionLabel = {0:'价格',1:'是否适合我',2:'能否马上交付'}[String(data.get('friction') || '0')] || '';
      const leadContext = '自测结果：影响程度=' + urgencyLabel + '；适配态度=' + fitLabel + '；主要担心=' + frictionLabel + '。';
      const resultText = score >= 4
        ? '你属于强意图场景：继续自己整理会浪费时间，建议直接拿现成包并按唯一备注付款，系统自动发货。'
        : score >= 2
          ? '你有一定需求，但先看交付边界更安全；如果边界对得上，再生成唯一付款备注。'
          : '你当前不适合买，先收藏这个免费诊断即可。系统不会把低意图误判成成交。';
      document.querySelector('[data-result-text]').textContent = resultText;
      document.getElementById('lead-result').hidden = false;
      const leadResponse = await fetch('/api/lead-tool-results',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          type:'lead-tool-result',
          experimentId,
          variantId:recommendedVariantId,
          channel:'lead-tool',
          score,
          leadSessionId,
          context: leadContext,
          urgency: urgencyLabel,
          reasons: [urgencyLabel, fitLabel, '担心：' + frictionLabel].filter(Boolean)
        })
      }).catch(()=>null);
      const leadPayload = leadResponse ? await leadResponse.json().catch(()=>null) : null;
      if (leadPayload?.result?.checkout) {
        document.querySelector('[data-tool-payment-remark]').textContent = leadPayload.result.checkout.paymentInstruction;
        document.querySelector('[data-tool-checkout-status]').innerHTML = '<a href="' + leadPayload.result.checkout.statusUrl + '">打开订单状态页，付款后自动取货</a>';
      }
    });
    const sampleLeadSessionKey = ${JSON.stringify(sampleLeadSessionKey)};
    const sampleLeadSessionId = (() => {
      try {
        const existing = localStorage.getItem(sampleLeadSessionKey);
        if (existing) return existing;
        const next = 'sample_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(sampleLeadSessionKey, next);
        return next;
      } catch {
        return '';
      }
    })();
    document.getElementById('sample-lead-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const payload = {
        experimentId,
        variantId: recommendedVariantId,
        context: data.get('context') || '',
        urgency: data.get('urgency') || '',
        email: data.get('email') || '',
        leadSessionId: sampleLeadSessionId
      };
      const response = await fetch('/api/sample-lead', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error || 'sample lead failed');
      const result = body.result;
      document.getElementById('sample-lead-result').hidden = false;
      document.querySelector('[data-sample-lead-preview]').textContent = result.sample;
      document.querySelector('[data-sample-lead-reasons]').textContent = '意图分：' + result.score + '；' + (result.reasons || []).join('、');
      if (result.checkout) {
        document.querySelector('[data-sample-lead-payment-remark]').textContent = result.checkout.paymentInstruction;
        document.querySelector('[data-sample-lead-checkout-status]').innerHTML = '<a href="' + result.checkout.statusUrl + '">打开订单状态页，付款后自动取货</a>';
      } else {
        document.querySelector('[data-sample-lead-payment-remark]').textContent = '';
        document.querySelector('[data-sample-lead-checkout-status]').textContent = '当前意图不足，程序只给免费样例，不创建 checkout。';
      }
    });
  </script>
</body>
</html>`;
}

function salesAssistantHtml(experiment) {
  const variantId = experiment.winningVariant?.id || "proof";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`自动销售助手：${experiment.title}`)}</title>
  <meta name="description" content="${escapeHtml(`程序自动回答${experiment.buyer}购买 ${experiment.delivery} 前的问题，高意图时直接生成付款备注。`)}" />
  <link rel="canonical" href="${escapeHtml(publicSalesAssistantUrl(experiment.id))}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">自动销售助手 / 不需要人工接待</p>
      <h1>${escapeHtml(experiment.title)}</h1>
      <p class="lead">你可以直接问：适不适合我、交付物有什么、付款后怎么拿、价格值不值。程序会按商品边界回答；如果你表达强购买意图，它会直接生成唯一付款备注。</p>
      <div class="price">¥${escapeHtml(String(experiment.price))}</div>
    </section>
    <section class="card">
      <h2>问销售助手</h2>
      <form id="sales-assistant-form">
        <label>你的问题或当前情况
          <textarea name="message" rows="5" placeholder="例如：我今晚要投简历，这个包能不能直接用？付款后多久能拿到？"></textarea>
        </label>
        <button class="button" type="submit">让程序回答并判断是否该付款</button>
      </form>
    </section>
    <section class="card" id="sales-assistant-result" hidden>
      <h2>程序回复</h2>
      <p data-sales-reply></p>
      <ul data-sales-reasons></ul>
      <p data-sales-checkout-status></p>
      <p data-sales-payment-remark></p>
      <p class="actions">
        <a class="button" href="/buy/${escapeHtml(experiment.id)}/${escapeHtml(variantId)}?source=sales-assistant">我已决定购买，生成付款备注</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">先看交付边界</a>
      </p>
    </section>
  </main>
  <script>
    const salesExperimentId = ${JSON.stringify(experiment.id)};
    const salesVariantId = ${JSON.stringify(variantId)};
    const salesSessionKey = 'sales-assistant-session:' + salesExperimentId;
    const salesSessionId = (() => {
      try {
        const existing = localStorage.getItem(salesSessionKey);
        if (existing) return existing;
        const next = 'sales_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(salesSessionKey, next);
        return next;
      } catch {
        return '';
      }
    })();
    fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:salesExperimentId,variantId:salesVariantId,channel:'sales-assistant'})}).catch(()=>{});
    document.getElementById('sales-assistant-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = new FormData(event.currentTarget).get('message') || '';
      const response = await fetch('/api/sales-assistant/message', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({experimentId: salesExperimentId, variantId: salesVariantId, message, leadSessionId: salesSessionId})
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || 'sales assistant failed');
      const result = payload.result;
      document.getElementById('sales-assistant-result').hidden = false;
      document.querySelector('[data-sales-reply]').textContent = result.reply;
      document.querySelector('[data-sales-reasons]').innerHTML = result.reasons.map((item) => '<li>' + item + '</li>').join('');
      if (result.checkout) {
        document.querySelector('[data-sales-payment-remark]').textContent = result.checkout.paymentInstruction;
        document.querySelector('[data-sales-checkout-status]').innerHTML = '<a href="' + result.checkout.statusUrl + '">打开订单状态页，付款后自动取货</a>';
      } else {
        document.querySelector('[data-sales-payment-remark]').textContent = '';
        document.querySelector('[data-sales-checkout-status]').textContent = '你还没表现出强购买意图，程序先回答问题，不强行创建订单。';
      }
    });
  </script>
</body>
</html>`;
}

function seoPagesFor(experiment) {
  const base = experiment.id;
  return [
    {
      slug: `${base}-pain-solution`,
      intent: "pain-solution",
      title: `${experiment.pain}怎么办？给${experiment.buyer}的 30 分钟现成包`,
      summary: `面向「${experiment.buyer}」的长尾搜索入口：先讲清楚问题，再把买家导向可直接购买的 ${experiment.delivery}。`,
    },
    {
      slug: `${base}-delivery-checklist`,
      intent: "delivery-checklist",
      title: `${experiment.delivery}里应该有什么？购买前检查清单`,
      summary: `把交付边界公开讲清楚，过滤不合适买家，让真正需要的人进入付款页。`,
    },
    {
      slug: `${base}-compare-diy`,
      intent: "compare-diy",
      title: `自己整理还是买现成包？${experiment.title}购买前对比`,
      summary: `比较自己从零整理和购买现成数字交付物的成本，降低成交前疑虑。`,
    },
    {
      slug: `${base}-tonight-delivery`,
      intent: "tonight-delivery",
      title: `今晚就要用：${experiment.delivery}最快怎么落地`,
      summary: `专门承接“今晚就要结果”的搜索意图，把紧急需求导向可立即付款、自动交付的页面。`,
    },
    {
      slug: `${base}-cheap-alternative`,
      intent: "cheap-alternative",
      title: `${experiment.buyer}低成本解决${experiment.pain}的替代方案`,
      summary: `承接低预算买家，解释为什么小额数字交付物比继续找教程更省时间。`,
    },
    {
      slug: `${base}-examples`,
      intent: "examples",
      title: `${experiment.title}示例和可复制结构`,
      summary: `用示例型长尾页让买家先看到结构，再进入付费 checkout 获取完整版本。`,
    },
    {
      slug: `${base}-mistakes`,
      intent: "mistakes",
      title: `${experiment.buyer}处理${experiment.pain}时最容易踩的 5 个坑`,
      summary: `用避坑内容筛出高痛点买家，减少泛流量，把下一步导向付费交付。`,
    },
    {
      slug: `${base}-who-should-buy`,
      intent: "who-should-buy",
      title: `谁适合买${experiment.title}，谁不该买`,
      summary: `把适合买/不适合买讲清楚，降低退款和误购，同时提高真正买家的信任。`,
    },
  ];
}

function seoPageUrl(page) {
  return toPublicUrl(`/seo/${encodeURIComponent(page.slug)}.html`);
}

function objectionPagesFor(experiment) {
  const base = experiment.id;
  return [
    {
      slug: `${base}-price-objection`,
      intent: "price-objection",
      title: `${experiment.title} 值不值 ¥${experiment.price}？`,
      objection: "价格值不值",
      summary: `专门回答买家对 ¥${experiment.price} 的犹豫，把价格和自己整理的时间成本讲清楚。`,
      answer: `如果你只是随便看看，它不值；如果你今天确实卡在「${experiment.pain}」，买的是省掉从 0 整理到可用版本的时间。`,
      nextStep: "如果价格疑虑解决，直接生成唯一付款备注；如果还不确定，先让销售助手按你的情况判断。",
    },
    {
      slug: `${base}-fit-objection`,
      intent: "fit-objection",
      title: `${experiment.title} 适不适合我？`,
      objection: "适配不确定",
      summary: `自动承接“我能不能用”的搜索和犹豫，让不适合买的人离开，让适合买的人进入付款。`,
      answer: `适合买：你是「${experiment.buyer}」，并且现在的问题就是「${experiment.pain}」。不适合买：你需要定制服务、保证结果或长期陪跑。`,
      nextStep: "把你的情况发给销售助手；强意图且适配时，程序会生成 checkout。",
    },
    {
      slug: `${base}-delivery-objection`,
      intent: "delivery-objection",
      title: `${experiment.title} 付款后到底拿到什么？`,
      objection: "担心交付不清楚",
      summary: `把交付内容、自动发货和唯一付款备注讲透，减少买家因不确定而流失。`,
      answer: `你买到的是「${experiment.delivery}」。付款前可以看交付边界；付款匹配成功后，系统自动生成私有交付链接。`,
      nextStep: "先看交付边界；确认对得上以后，再生成本次购买的唯一付款备注。",
    },
    {
      slug: `${base}-risk-objection`,
      intent: "risk-objection",
      title: `${experiment.title} 有什么风险和不承诺？`,
      objection: "怕被割韭菜",
      summary: `公开写清楚不承诺收益、不承诺平台推荐，过滤错误期待，建立成交信任。`,
      answer: `${experiment.safety} 这不是收益承诺，也不是代运营；它只卖一个可立即拿走使用的数字交付包。`,
      nextStep: "如果你接受边界，就购买；如果你需要保证结果，不应该买。",
    },
  ];
}

function objectionPageHtml(experiment, page) {
  const variantId = experiment.winningVariant?.id || "proof";
  const directBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`objection:${page.intent}`)}`;
  const canonicalUrl = publicObjectionPageUrl(page);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: page.title, description: page.summary }))}</script>
</head>
<body>
  <main class="page">
    <article class="card">
      <p class="eyebrow">自动异议处理 / ${escapeHtml(page.intent)} / 不需要人工销售</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <h2>你现在犹豫的是：${escapeHtml(page.objection)}</h2>
      <p>${escapeHtml(page.answer)}</p>
      <h2>这个商品的边界</h2>
      <ul>
        <li>买家：${escapeHtml(experiment.buyer)}</li>
        <li>痛点：${escapeHtml(experiment.pain)}</li>
        <li>交付：${escapeHtml(experiment.delivery)}</li>
        <li>价格：¥${escapeHtml(String(experiment.price))}</li>
      </ul>
      <h2>程序下一步怎么处理</h2>
      <p>${escapeHtml(page.nextStep)}</p>
      <p class="safe">这个页面不会在爬虫访问时创建 checkout；只有买家点击直购或在销售助手里表达强购买意图，系统才会生成唯一付款备注。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(directBuyUrl)}">我接受边界，生成唯一付款备注</a>
        <a class="button ghost" href="/sales/${escapeHtml(experiment.id)}.html">继续问自动销售助手</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">先看交付边界</a>
      </p>
    </article>
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:${JSON.stringify(`objection:${page.intent}`)}})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function buyerQuestionPagesFor(experiment) {
  const base = experiment.id;
  return [
    {
      slug: `${base}-instant-delivery`,
      intent: "instant-delivery",
      question: "付款后多久能拿到？",
      title: `${experiment.title} 付款后多久能拿到？`,
      answer: `系统匹配到带唯一备注的付款通知后，会自动生成私有交付链接。你买到的是「${experiment.delivery}」，不是人工排队服务。`,
      summary: `回答${experiment.buyer}最关心的交付速度问题，并把强意图买家导向唯一付款备注。`,
    },
    {
      slug: `${base}-included-files`,
      intent: "included-files",
      question: "里面具体包含什么？",
      title: `${experiment.title} 里面具体包含什么？`,
      answer: `交付物是「${experiment.delivery}」。付款前可以先看公开交付边界，付款后获得完整版本。`,
      summary: `把商品内容说清楚，减少因为“不知道买到什么”造成的流失。`,
    },
    {
      slug: `${base}-buyer-fit`,
      intent: "buyer-fit",
      question: "我这种情况适合买么？",
      title: `${experiment.title} 适合什么人买？`,
      answer: `适合买的人是「${experiment.buyer}」，并且当前确实卡在「${experiment.pain}」。如果你期待保证收益、保证录用、保证平台推荐，就不适合买。`,
      summary: `过滤低质量流量，让适合买的人继续问自动销售助手或直接购买。`,
    },
    {
      slug: `${base}-payment-steps`,
      intent: "payment-steps",
      question: "怎么买，为什么要唯一备注？",
      title: `${experiment.title} 怎么购买并自动取货？`,
      answer: `先点击直购按钮生成本次购买的唯一付款备注，再扫码付款并带上备注。程序用备注匹配付款，匹配成功后自动发货。`,
      summary: `解释唯一备注、扫码付款和自动发货流程，把买家从问题直接带到 checkout。`,
    },
  ];
}

function buyerQuestionPageHtml(experiment, page) {
  const variantId = experiment.winningVariant?.id || "proof";
  const directBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`question:${page.intent}`)}`;
  const canonicalUrl = publicBuyerQuestionPageUrl(page);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: page.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: page.answer,
        },
      },
      {
        "@type": "Question",
        name: "下一步怎么买？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "点击页面上的直购按钮生成唯一付款备注；付款匹配成功后，系统自动生成交付链接。",
        },
      },
    ],
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(faqSchema)}</script>
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: page.title, description: page.summary }))}</script>
</head>
<body>
  <main class="page">
    <article class="card">
      <p class="eyebrow">自动买家问答 / ${escapeHtml(page.intent)} / FAQPage</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <h2>${escapeHtml(page.question)}</h2>
      <p>${escapeHtml(page.answer)}</p>
      <h2>这个商品解决什么</h2>
      <ul>
        <li>买家：${escapeHtml(experiment.buyer)}</li>
        <li>痛点：${escapeHtml(experiment.pain)}</li>
        <li>交付：${escapeHtml(experiment.delivery)}</li>
        <li>价格：¥${escapeHtml(String(experiment.price))}</li>
      </ul>
      <h2>下一步</h2>
      <p>如果这个回答解决了你的问题，直接生成唯一付款备注；如果还不确定，把你的情况发给自动销售助手，它会继续判断是否适合买。</p>
      <p class="safe">程序不会因为搜索引擎访问这个问答页就创建 checkout；只有买家主动点击购买，或在销售助手里表达强购买意图，才会生成付款备注。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(directBuyUrl)}">生成唯一付款备注</a>
        <a class="button ghost" href="/sales/${escapeHtml(experiment.id)}.html">问自动销售助手</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">查看交付边界</a>
      </p>
    </article>
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:${JSON.stringify(`question:${page.intent}`)}})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function purchaseIntentPagesFor(experiment) {
  const base = experiment.id;
  const starterPrice = starterOfferPrice(experiment);
  return [
    {
      slug: `${base}-wechat-pay-delivery`,
      intent: "wechat-pay-delivery",
      title: `${experiment.title} 微信付款后怎么自动取货？`,
      summary: `专门承接“怎么付款、怎么取货”的购买意图，解释唯一付款备注、微信扫码和自动交付。`,
      promise: `点按钮生成唯一付款备注，扫码付款时带上备注；程序匹配付款后自动生成私有交付链接。`,
      primary: "完整包付款备注",
    },
    {
      slug: `${base}-starter-first`,
      intent: "starter-first",
      title: `${experiment.title} 可以先低价试一下吗？`,
      summary: `承接还没准备买完整包的人，直接给 ¥${starterPrice} 入门版入口，争取第一笔小额付款。`,
      promise: `先买 ¥${starterPrice} 入门版，拿到最小可用切片；觉得对路再升级完整包。`,
      primary: "入门版付款备注",
    },
    {
      slug: `${base}-urgent-use`,
      intent: "urgent-use",
      title: `${experiment.title} 今天急用，最快怎么拿到？`,
      summary: `承接“今天/今晚/马上要用”的强时效搜索，把紧急需求导向自动 checkout。`,
      promise: `这个商品不是排队服务；付款匹配后自动发货，适合今天先拿到可复制版本。`,
      primary: "完整包付款备注",
    },
    {
      slug: `${base}-proof-before-buy`,
      intent: "proof-before-buy",
      title: `${experiment.title} 付款前能先确认边界吗？`,
      summary: `承接怕被割韭菜、怕交付不清的买家，先讲边界再导向付款。`,
      promise: `不承诺收益、不承诺平台推荐，只交付「${experiment.delivery}」。边界接受再买。`,
      primary: "确认后付款",
    },
    {
      slug: `${base}-copyable-example`,
      intent: "copyable-example",
      title: `${experiment.title} 有没有可复制示例？`,
      summary: `承接想先看结构的买家，给出示例边界，再引导购买完整可复制版本。`,
      promise: `公开页只展示结构和边界；完整可复制版本在付款匹配后自动交付。`,
      primary: "获取完整示例",
    },
    {
      slug: `${base}-refund-boundary`,
      intent: "refund-boundary",
      title: `${experiment.title} 不适合哪些人买？`,
      summary: `承接风险和退款疑虑，过滤错误期待，减少误购并提高真实买家的信任。`,
      promise: `需要保证结果、定制陪跑、平台推荐的人不适合买；需要现成数字交付物的人可以买。`,
      primary: "接受边界后付款",
    },
  ];
}

function purchaseIntentPageHtml(experiment, page) {
  const variantId = "proof";
  const starterPrice = starterOfferPrice(experiment);
  const canonicalUrl = publicPurchaseIntentPageUrl(page);
  const fullBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`intent:${page.intent}:full`)}`;
  const starterBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`intent:${page.intent}:starter`)}&offer=starter`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: page.title,
        acceptedAnswer: {
          "@type": "Answer",
          text: page.promise,
        },
      },
      {
        "@type": "Question",
        name: "怎么买并自动取货？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "点击页面按钮生成唯一付款备注；微信付款带上备注；付款 feed、通知桥或订单页付款凭证匹配后，系统自动生成交付链接。",
        },
      },
    ],
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(faqSchema)}</script>
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: page.title, description: page.summary, price: starterPrice }))}</script>
</head>
<body>
  <main class="page">
    <article class="card">
      <p class="eyebrow">强购买意图入口 / ${escapeHtml(page.intent)} / 自动成交</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <h2>直接回答</h2>
      <p>${escapeHtml(page.promise)}</p>
      <h2>这个商品的购买边界</h2>
      <ul>
        <li>买家：${escapeHtml(experiment.buyer)}</li>
        <li>痛点：${escapeHtml(experiment.pain)}</li>
        <li>完整包：¥${escapeHtml(String(experiment.price))}，${escapeHtml(experiment.delivery)}</li>
        <li>入门版：¥${escapeHtml(String(starterPrice))}，最小可用切片</li>
        <li>边界：${escapeHtml(experiment.safety)}</li>
      </ul>
      <h2>程序怎么自动成交</h2>
      <p>这个页面不会因为爬虫访问就创建订单；只有买家点击按钮时，系统才生成唯一付款备注。付款匹配后进入自动交付。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(starterBuyUrl)}">先买入门版：¥${escapeHtml(String(starterPrice))}</a>
        <a class="button ghost" href="${escapeHtml(fullBuyUrl)}">${escapeHtml(page.primary)}：¥${escapeHtml(String(experiment.price))}</a>
        <a class="button ghost" href="/rescue/${escapeHtml(experiment.id)}.html">看自动挽回成交页</a>
      </p>
    </article>
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:${JSON.stringify(`intent:${page.intent}`)}})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function demandCapturePagesFor(experiment) {
  const base = experiment.id;
  const starterPrice = starterOfferPrice(experiment);
  return [
    {
      slug: `${base}-pay-now`,
      intent: "pay-now",
      title: `${experiment.title} 现在能直接买吗？`,
      summary: `承接已经准备付款的买家：先给 ¥${starterPrice} 入门版和完整包两个入口，减少从搜索到付款的距离。`,
      angle: "买家已经有购买动作，不再先讲概念，直接给可付款选项和交付边界。",
    },
    {
      slug: `${base}-wechat-remark`,
      intent: "wechat-remark",
      title: `${experiment.title} 微信付款备注怎么填？`,
      summary: `专门承接扫码付款前的最后疑问，把唯一备注、到账匹配和自动取货讲清楚。`,
      angle: "把付款步骤变成页面主内容，减少因为不知道备注怎么填而流失。",
    },
    {
      slug: `${base}-starter-price`,
      intent: "starter-price",
      title: `${experiment.title} 有没有 ¥${starterPrice} 入门版？`,
      summary: `承接低预算买家，直接给入门版付款路径，先争取第一笔真实小额付款。`,
      angle: "先成交最小可用切片，再通过交付文件里的升级入口卖完整包。",
    },
    {
      slug: `${base}-instant-download`,
      intent: "instant-download",
      title: `${experiment.title} 付款后可以马上下载吗？`,
      summary: `承接“马上拿到文件”的强意图，解释付款匹配后自动生成私有交付链接。`,
      angle: "强调这不是人工排队服务，付款匹配后程序自动发货。",
    },
  ];
}

function publicDemandCaptureUrl(page) {
  return toPublicUrl(`/demand/${encodeURIComponent(page.slug)}.html`);
}

function utilityIntentPagesFor(experiment) {
  const base = experiment.id;
  const starterPrice = starterOfferPrice(experiment);
  return [
    {
      slug: `${base}-fit-calculator`,
      intent: "fit-calculator",
      title: `${experiment.title} 值不值得买？免费适配计算器`,
      summary: `让${experiment.buyer}输入场景、紧急度和预算，程序自动判断是否适合买，不适合就不给 checkout。`,
      question: "你现在遇到的具体场景是什么？",
      placeholder: `例如：我今天卡在「${experiment.pain}」，想知道这个包能不能直接用。`,
      resultLabel: "适配判断",
      cta: "免费判断是否该买",
    },
    {
      slug: `${base}-starter-builder`,
      intent: "starter-builder",
      title: `${experiment.title} 免费生成一版入门清单`,
      summary: `用免费清单承接搜索流量；用户表达今天要用、留下接收方式或描述具体场景时，程序自动生成 ¥${starterPrice} 入门版 checkout。`,
      question: "你希望这份入门清单先覆盖哪个场景？",
      placeholder: "例如：今晚就要交付，先给我一个能复制执行的最小清单。",
      resultLabel: "入门清单",
      cta: "生成免费入门清单",
    },
    {
      slug: `${base}-delivery-readiness`,
      intent: "delivery-readiness",
      title: `${experiment.title} 今天能不能直接交付？免费检查`,
      summary: `专门承接“今天能不能用”的强时效意图，把真实急用的人导向付款备注和自动交付。`,
      question: "你今天要交付/完成的结果是什么？",
      placeholder: "例如：今晚要发出去/投递/上线，缺一份能马上套用的材料。",
      resultLabel: "交付就绪度",
      cta: "检查今天能不能用",
    },
    {
      slug: `${base}-price-decision`,
      intent: "price-decision",
      title: `${experiment.title} 买完整包还是 ¥${starterPrice} 入门版？`,
      summary: `把价格犹豫变成选择题：低意图给免费建议，高意图给入门版付款备注，减少从访问到付款的距离。`,
      question: "你更想先解决哪个问题：省钱、马上拿到、还是完整交付？",
      placeholder: `例如：我预算有限，但今天想先拿到 ${experiment.delivery} 的最小可用版本。`,
      resultLabel: "购买档位建议",
      cta: "判断买哪个档位",
    },
  ];
}

function publicUtilityIntentUrl(page) {
  return toPublicUrl(`/utilities/${encodeURIComponent(page.slug)}.html`);
}

function utilityIntentPageHtml(experiment, page) {
  const variantId = "proof";
  const starterPrice = starterOfferPrice(experiment);
  const canonicalUrl = publicUtilityIntentUrl(page);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: page.title, description: page.summary, price: starterPrice }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">程序化免费工具 / ${escapeHtml(page.intent)} / 自动筛选买家</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <p class="safe">这个入口不是给你人工销售用的。它会进入 sitemap、RSS、feed 和搜索提交；页面加载只记录访问，不创建 checkout。只有真实用户提交场景且意图足够强时，程序才生成唯一付款备注。</p>
      <div class="price">入门版 ¥${escapeHtml(String(starterPrice))} / 完整包 ¥${escapeHtml(String(experiment.price))}</div>
    </section>
    <section class="card">
      <form id="utility-intent-form">
        <label>${escapeHtml(page.question)}
          <textarea name="context" rows="5" placeholder="${escapeHtml(page.placeholder)}"></textarea>
        </label>
        <label>紧急程度
          <select name="urgency">
            <option value="">不急，只看看</option>
            <option value="今天要用">今天要用</option>
            <option value="马上要用">马上要用</option>
          </select>
        </label>
        <label>接收方式（可选；填写代表意图更强）
          <input name="email" placeholder="邮箱 / 微信 / 手机 / 其他联系方式" />
        </label>
        <button class="button" type="submit">${escapeHtml(page.cta)}</button>
      </form>
    </section>
    <section class="card" id="utility-intent-result" hidden>
      <h2>${escapeHtml(page.resultLabel)}</h2>
      <pre data-utility-preview></pre>
      <p data-utility-reasons></p>
      <p data-utility-checkout-status></p>
      <p data-utility-payment-remark></p>
      <p class="actions">
        <a class="button" href="/instant/${escapeHtml(experiment.id)}.html">打开一屏付款页</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">先看交付边界</a>
      </p>
    </section>
    <section class="card">
      <h2>程序如何用这个入口逼近成交</h2>
      <ul>
        <li>低意图：只给免费判断，不创建订单，避免假 checkout。</li>
        <li>高意图：复用 sample-lead 评分规则，自动生成付款备注和订单状态页。</li>
        <li>付款匹配：只有真实到账通知、付款 feed 或付款凭证匹配后，才生成订单和交付链接。</li>
      </ul>
    </section>
  </main>
  <script>
    const utilityExperimentId = ${JSON.stringify(experiment.id)};
    const utilityVariantId = ${JSON.stringify(variantId)};
    const utilityIntent = ${JSON.stringify(page.intent)};
    const utilitySessionKey = 'utility-intent-session:' + utilityExperimentId + ':' + utilityIntent;
    const utilityLeadSessionId = (() => {
      try {
        const existing = localStorage.getItem(utilitySessionKey);
        if (existing) return existing;
        const next = 'utility_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(utilitySessionKey, next);
        return next;
      } catch {
        return '';
      }
    })();
    fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:utilityExperimentId,variantId:utilityVariantId,channel:'utility:' + utilityIntent})}).catch(()=>{});
    document.getElementById('utility-intent-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const response = await fetch('/api/sample-lead', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          experimentId: utilityExperimentId,
          variantId: utilityVariantId,
          context: data.get('context') || '',
          urgency: data.get('urgency') || '',
          email: data.get('email') || '',
          leadSessionId: utilityLeadSessionId,
          source: 'utility:' + utilityIntent
        })
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error || 'utility lead failed');
      const result = body.result;
      document.getElementById('utility-intent-result').hidden = false;
      document.querySelector('[data-utility-preview]').textContent = result.sample;
      document.querySelector('[data-utility-reasons]').textContent = '意图分：' + result.score + '；' + (result.reasons || []).join('、');
      if (result.checkout) {
        document.querySelector('[data-utility-payment-remark]').textContent = result.checkout.paymentInstruction;
        document.querySelector('[data-utility-checkout-status]').innerHTML = '<a href="' + result.checkout.statusUrl + '">打开订单状态页，付款后自动取货</a>';
      } else {
        document.querySelector('[data-utility-payment-remark]').textContent = '';
        document.querySelector('[data-utility-checkout-status]').textContent = '当前意图不足，程序只给免费判断，不创建 checkout。';
      }
    });
  </script>
</body>
</html>`;
}

function demandCapturePageHtml(experiment, page) {
  const variantId = "proof";
  const starterPrice = starterOfferPrice(experiment);
  const canonicalUrl = publicDemandCaptureUrl(page);
  const starterBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`demand:${page.intent}:starter`)}&offer=starter`;
  const fullBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`demand:${page.intent}:full`)}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: page.title,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${page.summary} 入门版 ¥${starterPrice}，完整包 ¥${experiment.price}。付款匹配后自动交付。`,
        },
      },
      {
        "@type": "Question",
        name: "微信付款备注怎么填？",
        acceptedAnswer: {
          "@type": "Answer",
          text: `点击按钮生成唯一付款备注；如果按钮不可用，入门版可使用静态备注 ${experiment.id}#STARTER。`,
        },
      },
    ],
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(faqSchema)}</script>
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: page.title, description: page.summary, price: starterPrice }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">需求捕获页 / ${escapeHtml(page.intent)} / 直达付款</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <div class="price">入门版 ¥${escapeHtml(String(starterPrice))} / 完整包 ¥${escapeHtml(String(experiment.price))}</div>
      <p class="safe">${escapeHtml(page.angle)} 页面访问不会创建订单；只有点击购买、有效互动或真实付款通知才进入收款/交付流程。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(starterBuyUrl)}">先买入门版并生成备注</a>
        <a class="button ghost" href="${escapeHtml(fullBuyUrl)}">直接买完整包</a>
        <a class="button ghost" href="/instant/${escapeHtml(experiment.id)}.html">打开一屏付款页</a>
      </p>
    </section>
    <section class="card">
      <h2>这个页面为什么由程序生成</h2>
      <p>当前系统还没有真实订单，程序不能假装成功；它会自动扩展更接近购买动作的搜索入口，把「能不能买、怎么备注、能不能先低价试、付款后能不能马上取货」这些问题直接导向收款页。</p>
      <ul>
        <li>买家：${escapeHtml(experiment.buyer)}</li>
        <li>痛点：${escapeHtml(experiment.pain)}</li>
        <li>交付：${escapeHtml(experiment.delivery)}</li>
        <li>边界：${escapeHtml(experiment.safety)}</li>
      </ul>
    </section>
    ${directCheckoutSectionHtml({
      experimentId: experiment.id,
      variantId,
      source: `demand:${page.intent}`,
      title: `需求页：生成 ¥${starterPrice} 入门版付款备注`,
      cta: "生成入门版付款备注",
      autostart: false,
      engagementAutostart: true,
      offer: "starter",
      amount: starterPrice,
    })}
    ${staticPaymentFallbackHtml(experiment, { label: `${page.intent} 需求页兜底收款`, amount: starterPrice, offer: "starter" })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:${JSON.stringify(`demand:${page.intent}`)}})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function marketById(id) {
  return markets.find((item) => item.id === id) || null;
}

function offerTypeById(id) {
  return offerTypes.find((item) => item.id === id) || null;
}

function publicMarketHubUrl(marketId) {
  return toPublicUrl(`/markets/${encodeURIComponent(marketId)}.html`);
}

function publicOfferTypeHubUrl(offerTypeId) {
  return toPublicUrl(`/offer-types/${encodeURIComponent(offerTypeId)}.html`);
}

function hubPagesForLab(lab) {
  const marketIds = [...new Set(lab.map((item) => item.marketId).filter(Boolean))];
  const offerTypeIds = [...new Set(lab.map((item) => item.offerTypeId).filter(Boolean))];
  const marketPages = marketIds.map((marketId) => {
    const market = marketById(marketId);
    const items = lab.filter((item) => item.marketId === marketId).sort((a, b) => b.score - a.score);
    return {
      kind: "market",
      id: marketId,
      slug: `market-${marketId}`,
      title: `${market?.name || marketId}今天能买的现成包`,
      summary: `程序自动聚合给「${market?.buyer || items[0]?.buyer || marketId}」的可购买数字交付物，按真实访问、checkout 和付款数据排序。`,
      url: publicMarketHubUrl(marketId),
      items,
    };
  });
  const offerTypePages = offerTypeIds.map((offerTypeId) => {
    const offerType = offerTypeById(offerTypeId);
    const items = lab.filter((item) => item.offerTypeId === offerTypeId).sort((a, b) => b.score - a.score);
    return {
      kind: "offer-type",
      id: offerTypeId,
      slug: `offer-type-${offerTypeId}`,
      title: `${offerType?.label || offerTypeId}：自动生成的可购买交付`,
      summary: `程序自动聚合「${offerType?.delivery || offerType?.assetName || offerTypeId}」类商品，把买家从入口页导向自测工具、售卖页和唯一付款备注。`,
      url: publicOfferTypeHubUrl(offerTypeId),
      items,
    };
  });
  return [...marketPages, ...offerTypePages];
}

function hubPageHtml(page) {
  const canonicalUrl = page.url;
  const top = page.items[0];
  const groupLabel = page.kind === "market" ? "买家入口" : "交付类型入口";
  const topVariantId = top?.winningVariant?.id || "proof";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page wide">
    <section class="hero card">
      <p class="eyebrow">自动获客聚合页 / ${escapeHtml(groupLabel)} / ${escapeHtml(page.id)}</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <div class="actions">
        ${top ? `<a class="button" href="#hub-pay" data-hub-create-checkout>直接生成付款备注</a>` : ""}
        ${top ? `<a class="button ghost" href="/tools/${escapeHtml(top.id)}.html">先做免费自测</a>` : ""}
      </div>
    </section>
    ${
      top
        ? `<section id="hub-pay" class="pay card">
      <div>
        <p class="eyebrow">聚合页直接成交 / 当前最高分商品</p>
        <h2>${escapeHtml(top.title)}</h2>
        <p>${escapeHtml(top.promise)}</p>
        <p>价格：<strong>¥${escapeHtml(String(top.price))}</strong></p>
        <p>付款备注：<strong data-hub-payment-remark>正在生成本次购买专属备注...</strong></p>
        <p data-hub-checkout-status></p>
        <p class="safe">这个聚合入口会直接为当前最高分商品创建 checkout；同一浏览器会复用同一个待支付备注，避免重复订单。付款 feed、通知桥或订单页付款凭证匹配后会自动发货。</p>
      </div>
      <img src="/wechat-pay.jpg" alt="微信收款二维码" />
    </section>`
        : ""
    }
    <section class="card">
      <h2>程序为什么生成这个入口</h2>
      <p>单个商品页太分散，搜索引擎和买家都需要更清楚的入口。这个页面由程序按买家/交付类型自动聚合，进入 sitemap、RSS、feed 和搜索提交队列，后续访问会被记录，用来决定哪些方向继续放大。</p>
    </section>
    <section class="grid">
      ${page.items
        .map(
          (item) => `<article class="card">
        <p class="eyebrow">${escapeHtml(item.buyer)}</p>
        <h2><a href="/offer/${escapeHtml(item.id)}.html">${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(item.promise)}</p>
        <ul>
          <li>痛点：${escapeHtml(item.pain)}</li>
          <li>交付：${escapeHtml(item.delivery)}</li>
          <li>价格：¥${escapeHtml(String(item.price))}</li>
          <li>当前分数：${escapeHtml(String(item.score))}，付款：${escapeHtml(String(item.metrics?.paid || 0))}</li>
        </ul>
        <p class="actions">
          <a class="button" href="/offer/${escapeHtml(item.id)}.html">生成唯一付款备注</a>
          <a class="button ghost" href="/tools/${escapeHtml(item.id)}.html">免费自测</a>
        </p>
      </article>`
        )
        .join("")}
    </section>
    <section class="card">
      <h2>继续看长尾入口</h2>
      <div class="grid">
        ${page.items
          .flatMap((item) => seoPagesFor(item).slice(0, 2).map((seoPage) => ({ ...seoPage, experiment: item })))
          .slice(0, 8)
          .map((seoPage) => `<article><h3><a href="/seo/${escapeHtml(seoPage.slug)}.html">${escapeHtml(seoPage.title)}</a></h3><p>${escapeHtml(seoPage.summary)}</p></article>`)
          .join("")}
      </div>
    </section>
  </main>
  <script>
    const hubExperimentId = ${JSON.stringify(top?.id || "")};
    const hubVariantId = ${JSON.stringify(topVariantId)};
    const hubSessionKey = ${JSON.stringify(`hub-checkout-session:${page.kind}:${page.id}`)};
    let hubCheckoutReady = null;
    function getHubCheckoutSessionId() {
      try {
        let value = localStorage.getItem(hubSessionKey);
        if (!value) {
          value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
          localStorage.setItem(hubSessionKey, value);
        }
        return value;
      } catch (error) {
        return 'hub-session-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      }
    }
    async function ensureHubCheckout() {
      if (!hubExperimentId) return null;
      if (hubCheckoutReady) return hubCheckoutReady;
      const button = document.querySelector('[data-hub-create-checkout]');
      const status = document.querySelector('[data-hub-checkout-status]');
      if (button) button.textContent = '准备付款信息...';
      if (status) status.textContent = '系统正在为这个聚合入口生成唯一付款备注...';
      try {
        const response = await fetch('/api/checkouts', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            experimentId: hubExperimentId,
            variantId: hubVariantId,
            source: 'hub-page:${escapeHtml(page.kind)}:${escapeHtml(page.id)}',
            leadSessionId: getHubCheckoutSessionId()
          }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'checkout failed');
        hubCheckoutReady = data.checkout;
        document.querySelector('[data-hub-payment-remark]').textContent = data.checkout.paymentInstruction;
        if (status && data.checkout.statusUrl) status.innerHTML = '<a href="' + data.checkout.statusUrl + '">打开订单状态页，付款后自动取货</a>';
        if (button) button.textContent = '查看付款信息';
        return hubCheckoutReady;
      } catch (error) {
        if (button) button.textContent = '生成失败，重试';
        if (status) status.textContent = '付款信息生成失败，请点击按钮重试。';
        throw error;
      }
    }
    fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(`hub:${page.kind}:${page.id}`)},channel:${JSON.stringify(`hub:${page.kind}:${page.id}`)}})}).catch(()=>{});
    setTimeout(() => ensureHubCheckout().catch(() => {}), 500);
    document.querySelector('[data-hub-create-checkout]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      if (hubExperimentId) {
        fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({type:'click',experimentId:hubExperimentId,variantId:hubVariantId,channel:${JSON.stringify(`hub-checkout:${page.kind}:${page.id}`)}})}).catch(()=>{});
      }
      try {
        await ensureHubCheckout();
        location.hash = 'hub-pay';
      } catch (error) {
        alert(error.message);
      }
    });
  </script>
</body>
</html>`;
}

function writeHubPages(lab) {
  const pages = hubPagesForLab(lab);
  const marketDir = path.join(DIST_DIR, "markets");
  const offerTypeDir = path.join(DIST_DIR, "offer-types");
  fs.mkdirSync(marketDir, { recursive: true });
  fs.mkdirSync(offerTypeDir, { recursive: true });
  for (const page of pages) {
    const directory = page.kind === "market" ? marketDir : offerTypeDir;
    fs.writeFileSync(path.join(directory, `${page.id}.html`), hubPageHtml(page));
  }
  return pages;
}

function productStructuredData(experiment, { url = publicOfferUrl(experiment.id), name = experiment.title, description = experiment.promise, price = experiment.price } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    sku: experiment.id,
    category: "DigitalProduct",
    url,
    offers: {
      "@type": "Offer",
      priceCurrency: "CNY",
      price: String(price),
      availability: "https://schema.org/InStock",
      url,
    },
    isRelatedTo: {
      "@type": "CreativeWork",
      name: experiment.delivery,
      url: toPublicUrl(`/delivery-preview/${encodeURIComponent(experiment.id)}.md`),
    },
  };
}

function seoArticleHtml(experiment, page) {
  const offerUrl = `/offer/${encodeURIComponent(experiment.id)}.html`;
  const previewUrl = `/delivery-preview/${encodeURIComponent(experiment.id)}.md`;
  const canonicalUrl = seoPageUrl(page);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.summary)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.summary)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: page.title, description: page.summary }))}</script>
</head>
<body>
  <main class="page">
    <article class="card">
      <p class="eyebrow">程序化获客入口 / ${escapeHtml(page.intent)}</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      <h2>先判断你是不是这个场景</h2>
      <p>${escapeHtml(experiment.buyer)}通常不是缺大道理，而是卡在「${experiment.pain}」。如果今天要出结果，最小可买的东西应该是一个能马上复制、检查和交付的版本。</p>
      <h2>这个现成包解决什么</h2>
      <p>${escapeHtml(experiment.promise)}</p>
      <ul>
        <li>交付：${escapeHtml(experiment.delivery)}</li>
        <li>价格：¥${escapeHtml(String(experiment.price))}</li>
        <li>边界：${escapeHtml(experiment.safety)}</li>
      </ul>
      <h2>为什么这个入口会自动导向成交页</h2>
      <p>这不是人工写软文。程序为同一个商品生成多个搜索意图入口，记录真实曝光、点击、checkout 和付款，再把后续推广自动切到更容易成交的角度。</p>
      <h2>适合买，不适合买</h2>
      <p>适合买：你需要今天拿到可复制的最小版本，而不是继续收藏教程。</p>
      <p>不适合买：你期待保证收益、保证流量、保证录用或平台推荐。</p>
      <h2>下一步</h2>
      <p>如果这个场景对得上，打开售卖页生成唯一付款备注；系统收到匹配付款通知后会自动生成受控交付链接。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(offerUrl)}">打开售卖页并生成唯一付款备注</a>
        <a class="button ghost" href="${escapeHtml(previewUrl)}">先看交付边界</a>
      </p>
    </article>
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},channel:'seo:${page.intent}'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function offerHtml(
  experiment,
  variant = experiment.winningVariant || offerVariantsFor(experiment)[0],
  canonicalUrlOverride = ""
) {
  const canonicalUrl = canonicalUrlOverride || publicOfferVariantUrl(experiment.id, variant.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(variant.headline)}</title>
  <meta name="description" content="${escapeHtml(variant.lead)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(variant.headline)}" />
  <meta property="og:description" content="${escapeHtml(variant.lead)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="product:price:amount" content="0" />
  <meta property="product:price:currency" content="CNY" />
  <meta name="twitter:card" content="summary" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: variant.headline, description: variant.lead, price: 0 }))}</script>
</head>
<body>
  <main class="page storefront">
    <section class="hero card">
      <p class="eyebrow">一页 A4 成品 · 本地使用 · 不上传隐私</p>
      <h1>${escapeHtml(variant.headline)}</h1>
      <p class="lead">${escapeHtml(variant.lead)}</p>
      <div class="price">免费使用</div>
      <p class="safe">${escapeHtml(experiment.safety)}</p>
      <div class="actions">
        <a class="button" href="/app/resume-builder.html">打开完整生成器</a>
        <a class="button ghost" href="/samples/${experiment.id}.html">先看完整成品示例</a>
      </div>
      <p class="trust-line">所有功能直接开放。生成出真实结果后，可以自愿扫码支持；支持不是使用条件。</p>
    </section>

    <section class="card product-preview">
      <div class="preview-copy">
        <p class="eyebrow">现在直接使用</p>
        <h2>不是资料包，是一个能生成简历成品的离线工具</h2>
        <p>填写姓名、联系方式、技能、工作和项目经历，对照目标 JD 检查关键词，然后直接打印或保存为 PDF。</p>
        <ul class="preview-proof">
          <li>一页 A4 成品排版，空白模块自动隐藏</li>
          <li>本地草稿保存、TXT 下载和 PDF 输出</li>
          <li>内容只留在你的浏览器，不上传隐私</li>
        </ul>
      </div>
      <div class="resume-sheet" aria-label="一页简历成品缩略示例">
        <header class="resume-sheet-header">
          <div><strong>林知远</strong><span>前端开发工程师</span></div>
          <small>138 **** 9527 · lin***@mail.com · 上海</small>
        </header>
        <div class="resume-sheet-section"><b>个人优势</b><p>3 年 Web 应用开发经验，能独立推进需求澄清、开发、联调和上线。</p></div>
        <div class="resume-sheet-section"><b>核心技能</b><div class="resume-tags"><span>Vue 3</span><span>TypeScript</span><span>Vite</span></div></div>
        <div class="resume-sheet-section">
          <b>项目经历</b>
          <div class="resume-role"><strong>交易后台订单模块</strong><small>核心开发</small></div>
          <ul><li>独立完成订单筛选、批量导出与异常状态提示，覆盖 6 类订单状态和弱网场景。</li></ul>
        </div>
        <div class="resume-sheet-footer">示例内容均为虚构，仅展示排版</div>
      </div>
    </section>

    <section class="card">
      <p class="eyebrow">使用边界</p>
      <h2>工具能做什么，以及不能做什么</h2>
      <div class="benefit-grid">
        <article><strong>可以</strong><h3>直接在线运行</h3><p>无需安装软件、注册账号或付款解锁。</p></article>
        <article><strong>可以</strong><h3>反复修改和导出</h3><p>在本机保存不同岗位版本，并直接输出 PDF。</p></article>
        <article><strong>不会</strong><h3>编造工作经历</h3><p>工具只整理你提供的事实，不制造无法解释的数字。</p></article>
        <article><strong>不会</strong><h3>承诺录用结果</h3><p>交付的是简历制作工具，不出售“保证录用”。</p></article>
      </div>
    </section>

    <section class="card guarantee">
      <div>
        <p class="eyebrow">完整功能免费开放</p>
        <h2>先拿到结果，再决定是否支持</h2>
        <p>使用工具不会创建订单。生成结果后会显示自愿支持二维码，不支持也能继续使用全部功能。</p>
      </div>
      <div class="final-buy">
        <strong>免费</strong>
        <a class="button" href="/app/resume-builder.html">开始生成简历</a>
      </div>
    </section>
  </main>
  <script>
    const experimentId = ${JSON.stringify(experiment.id)};
    const offerVariantId = ${JSON.stringify(variant.id)};
    fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId,variantId:offerVariantId,channel:'offer-page'})}).catch(()=>{});
  </script>
</body>
</html>`;
}

function storefrontHomeHtml(lab) {
  const featured = featuredExperiment(lab);
  const variantId = featured.winningVariant?.id || "direct";
  const stableFrontUrl = String(process.env.PUBLIC_FRONT_BASE_URL || "").replace(/\/+$/, "");
  const canonicalUrl = stableFrontUrl ? `${stableFrontUrl}/` : toPublicUrl("/");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>把零散经历直接变成一页可投递简历</title>
  <meta name="description" content="填写真实经历，直接得到排好版的一页简历，可保存为 PDF；不上传隐私，不编造经历。" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="把零散经历直接变成一页可投递简历" />
  <meta property="og:description" content="免费先试排一条项目经历；满意后可获得离线一页简历生成器。" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script src="/qrcode.js"></script>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "一页简历成品生成器",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    offers: { "@type": "Offer", price: 0, priceCurrency: "CNY" },
    description: "离线生成岗位匹配的一页简历，可保存为 PDF；内容不上传。",
  })}</script>
</head>
<body>
  <main class="page storefront">
    <section class="hero card">
      <p class="eyebrow">今晚投递 · 直接得到 PDF 成品</p>
      <h1>别再对着空白 Word。填完资料，直接拿走一页简历。</h1>
      <p class="lead">不是课程、模板包或“AI 提示词”。你得到的是一个离线简历生成器：输入真实资料和目标岗位，立即排出成品，检查无误后直接保存为 PDF。</p>
      <div class="actions">
        <a class="button" href="#preview">先看真实效果</a>
        <a class="button ghost" href="/app/resume-builder.html">直接使用完整生成器</a>
      </div>
      <p class="trust-line">完整功能免费使用。内容只留在你的电脑里；不上传简历，不编造数字。</p>
    </section>

    <section id="preview" class="card product-preview">
      <div class="preview-copy">
        <p class="eyebrow">这就是现在能生成的文件</p>
        <h2>不是“模板资料包”，是能直接保存为 PDF 的 A4 成品</h2>
        <p>右侧是生成器的真实排版结构。你的姓名、岗位、技能和经历会自动进入对应位置；没有填写的模块会隐藏，不会留下空白占位。</p>
        <ul class="preview-proof">
          <li>一页 A4 排版，打印时不带网页按钮</li>
          <li>根据目标 JD 标出已覆盖与缺失关键词</li>
          <li>草稿只保存在本机，可反复修改和导出</li>
        </ul>
        <a class="text-link" href="/samples/jobseekers-resume-workbench.html">打开完整示例页 →</a>
      </div>
      <div class="resume-sheet" aria-label="一页简历成品示例">
        <header class="resume-sheet-header">
          <div>
            <strong>林知远</strong>
            <span>前端开发工程师</span>
          </div>
          <small>138 **** 9527 · lin***@mail.com · 上海</small>
        </header>
        <div class="resume-sheet-section">
          <b>个人优势</b>
          <p>3 年 Web 应用开发经验，负责过后台交易与内容管理模块，能独立推进需求澄清、开发、联调和上线。</p>
        </div>
        <div class="resume-sheet-section">
          <b>核心技能</b>
          <div class="resume-tags"><span>Vue 3</span><span>TypeScript</span><span>Vite</span><span>性能优化</span></div>
        </div>
        <div class="resume-sheet-section">
          <b>项目经历</b>
          <div class="resume-role"><strong>交易后台订单模块</strong><small>前端开发 · 2024.03–2025.01</small></div>
          <ul>
            <li>独立完成订单筛选、批量导出与异常状态提示，覆盖 6 类订单状态和弱网场景。</li>
            <li>补齐接口失败兜底与操作反馈，协同产品、测试完成验收并按期上线。</li>
          </ul>
        </div>
        <div class="resume-sheet-footer">A4 一页成品预览 · 示例内容均为虚构，仅展示排版</div>
      </div>
    </section>

    <section id="rewrite" class="card rewrite-tool">
      <div class="tool-heading">
        <div>
          <p class="eyebrow">先验证实际效果</p>
          <h2>现场试排一条项目经历</h2>
        </div>
        <span>约 2 分钟</span>
      </div>
      <form id="resume-rewrite-form">
        <div class="form-grid">
          <label>你做的项目是什么？
            <input name="project" maxlength="80" required placeholder="例如：后台订单管理系统" />
          </label>
          <label>你的角色是什么？
            <input name="role" maxlength="60" required placeholder="例如：前端开发，负责订单模块" />
          </label>
        </div>
        <label>你具体做了哪些事？每件事用逗号或换行分开
          <textarea name="actions" rows="5" maxlength="600" required placeholder="例如：完成订单筛选和批量导出；和产品确认异常状态；补上接口失败提示"></textarea>
        </label>
        <div class="form-grid">
          <label>范围或难点（没有数字也可以）
            <input name="scope" maxlength="160" placeholder="例如：覆盖 6 类订单状态，处理弱网和接口异常" />
          </label>
          <label>最后交付了什么？
            <input name="result" maxlength="160" placeholder="例如：按期交付测试并上线；不知道可留空" />
          </label>
        </div>
        <button class="button" type="submit">现场试排，不上传内容</button>
      </form>
      <div id="rewrite-result" class="rewrite-result" hidden>
        <p class="eyebrow">可直接继续修改的初稿</p>
        <p class="generated-line" data-generated-line></p>
        <div class="result-actions">
          <button class="button ghost" type="button" data-copy-result>复制这条</button>
          <button class="button ghost" type="button" data-share-result>生成可分享成果卡</button>
          <a class="button" href="/app/resume-builder.html" data-upgrade-result>生成完整一页简历</a>
          <span data-copy-status></span>
        </div>
        <p class="share-status" data-share-status></p>
        <div class="evidence-check">
          <h3>还可以补强的证据</h3>
          <ul data-evidence-list></ul>
        </div>
        <p class="tool-boundary">这里仅验证项目表达效果。完整版会把基本信息、优势、技能、工作和项目经历排成一页 A4 简历。</p>
      </div>
    </section>

    <section id="buy" class="card purchase-card">
      <div>
        <p class="eyebrow">完整功能已经开放</p>
        <h2>直接生成整份一页简历</h2>
        <p>无需登录或付款。填写资料后生成岗位匹配表达与 A4 排版成品，保存草稿，并直接打印或保存为 PDF。</p>
      </div>
      <div class="storefront-price"><strong>免费</strong><span>生成结果后，可自愿扫码支持</span></div>
      <div class="actions">
        <a class="button" href="/app/resume-builder.html">打开完整生成器</a>
      </div>
      <p class="checkout-message">支持不是使用条件，所有输入都只在浏览器本地处理。</p>
    </section>

    <section class="card comparison">
      <p class="eyebrow">输入事实就能看到结果差异</p>
      <div class="before-after">
        <article>
          <span class="comparison-label bad">改写前</span>
          <p>负责后台管理系统开发，参与需求讨论，完成多个页面。</p>
          <small>问题：职责不清、动作不清、结果不清，面试官无法追问。</small>
        </article>
        <article>
          <span class="comparison-label good">按模板改写后</span>
          <p>参与后台订单模块迭代，独立完成订单筛选、批量导出和异常状态提示 3 个页面；与产品确认 6 类边界状态，并补齐接口异常兜底，按期交付测试。</p>
          <small>职责、动作、范围和交付结果都能解释，没有虚构“提升 50%”。</small>
        </article>
      </div>
    </section>

    <section class="card">
      <p class="eyebrow">完整功能直接开放</p>
      <h2>拿到程序和成品能力，不是阅读材料</h2>
      <div class="benefit-grid">
        <article><strong>01</strong><h3>JD 匹配检查</h3><p>识别岗位关键词，指出真实经历已覆盖和尚未覆盖的要求。</p></article>
        <article><strong>02</strong><h3>A4 成品排版</h3><p>基本信息、技能、经历和项目组成一页简历，空白模块自动隐藏。</p></article>
        <article><strong>03</strong><h3>证据审计</h3><p>检查空话、无证据数字、职责边界和缺失的验收材料。</p></article>
        <article><strong>04</strong><h3>PDF 直接投递</h3><p>浏览器直接打印或保存为 PDF，内容全程只留在本地。</p></article>
      </div>
    </section>

    <section class="card steps">
      <p class="eyebrow">使用只需 20 分钟</p>
      <ol>
        <li><strong>填资料：</strong>输入联系方式、技能、工作和项目经历。</li>
        <li><strong>对岗位：</strong>粘贴 JD，查看缺失关键词，只补真实内容。</li>
        <li><strong>看成品：</strong>生成岗位匹配表达并完成一页排版。</li>
        <li><strong>直接投：</strong>打印或保存为 PDF，文件留在本地。</li>
      </ol>
    </section>

    <section class="card related-tools">
      <p class="eyebrow">更多免费本地工具</p>
      <h2>4 个免费本地检查工具</h2>
      <p class="safe">所有内容只在当前浏览器里处理，不登录、不上传简历。</p>
      <div class="related-tool-grid">
        ${careerUtilityPages()
          .map(
            (page) => `<a href="/career-tools/${escapeHtml(page.slug)}.html"><strong>${escapeHtml(page.title)}</strong><span>${escapeHtml(page.description)}</span></a>`
          )
          .join("")}
      </div>
    </section>

    <section class="card guarantee">
      <div>
        <p class="eyebrow">使用边界</p>
        <h2>免费提供工具，不卖“保证录用”</h2>
        <p>程序负责整理和排版，不承诺录用、不代写虚假经历。生成结果后若觉得有用，可以自愿扫码支持；不支持也能继续使用全部功能。</p>
      </div>
      <div class="final-buy">
        <strong>免费</strong>
        <a class="button" href="/app/resume-builder.html">开始生成完整简历</a>
      </div>
    </section>
  </main>
  <script>
    const storefrontExperimentId = ${JSON.stringify(featured.id)};
    const storefrontVariantId = ${JSON.stringify(variantId)};
    const stableFrontUrl = ${JSON.stringify(stableFrontUrl)};
    const trackStorefrontEvent = (type, channel) => fetch('/api/events', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      keepalive: true,
      body: JSON.stringify({type, experimentId: storefrontExperimentId, variantId: storefrontVariantId, channel})
    }).catch(() => {});
    if (new URLSearchParams(location.search).get('source') === 'share-card') {
      trackStorefrontEvent('view', 'share-card-referral');
    }
    const cleanText = (value, max) => String(value || '').replace(/[<>]/g, '').replace(/\\s+/g, ' ').trim().slice(0, max);
    const splitActions = (value) => String(value || '')
      .split(/[\\n,，;；。]+/)
      .map((item) => cleanText(item, 100).replace(/^(负责|参与|协助)\\s*/, ''))
      .filter(Boolean)
      .slice(0, 4);
    const joinChinese = (items) => items.length < 2 ? (items[0] || '') : items.slice(0, -1).join('、') + '，并' + items.at(-1);
    document.querySelector('#resume-rewrite-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const project = cleanText(form.get('project'), 80);
      const role = cleanText(form.get('role'), 60);
      const actions = splitActions(form.get('actions'));
      const scope = cleanText(form.get('scope'), 160);
      const result = cleanText(form.get('result'), 160);
      if (!project || !role || !actions.length) return;
      const actionText = joinChinese(actions);
      const clauses = [
        '在' + project + '中，' + role,
        actionText,
        scope ? '覆盖' + scope.replace(/^覆盖/, '') : '',
        result ? result.replace(/[。；;]+$/, '') : '形成可验证的项目交付'
      ].filter(Boolean);
      const line = clauses.join('；') + '。';
      document.querySelector('[data-generated-line]').textContent = line;
      trackStorefrontEvent('interaction', 'free-result-generated');
      const evidence = [];
      if (!scope) evidence.push('补一个真实范围：页面数、功能数、状态类型、用户角色或异常场景。');
      if (!result) evidence.push('补一个可验证结果：上线、验收、交付、反馈、复用或问题关闭。');
      if (!/独立|主导|协作|配合|负责/.test(role + actions.join(''))) evidence.push('说清责任边界：独立完成、主导，还是与谁协作。');
      if (!/测试|验收|上线|反馈|工单|数据|文档|记录/.test(scope + result + actions.join(''))) evidence.push('保留一个面试可追问的证据：测试记录、上线版本、需求文档或真实反馈。');
      if (!evidence.length) evidence.push('事实要素较完整；面试前确认每个动作都能讲清过程和边界。');
      document.querySelector('[data-evidence-list]').replaceChildren(...evidence.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }));
      document.querySelector('#rewrite-result').hidden = false;
      document.querySelector('#rewrite-result').scrollIntoView({behavior: 'smooth', block: 'center'});
    });
    document.querySelector('[data-copy-result]')?.addEventListener('click', async () => {
      const text = document.querySelector('[data-generated-line]')?.textContent || '';
      const status = document.querySelector('[data-copy-status]');
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = '已复制';
      } catch {
        status.textContent = '请长按文字复制';
      }
    });
    document.querySelector('[data-upgrade-result]')?.addEventListener('click', () => {
      trackStorefrontEvent('click', 'free-result-upgrade');
    });
    document.querySelector('[data-share-result]')?.addEventListener('click', async () => {
      const result = document.querySelector('[data-generated-line]')?.textContent || '';
      const status = document.querySelector('[data-share-status]');
      if (!result) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const context = canvas.getContext('2d');
      context.fillStyle = '#f3f7ef';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#d9ff58';
      context.fillRect(70, 70, 940, 16);
      context.fillStyle = '#102116';
      context.font = '700 46px sans-serif';
      context.fillText('我的项目经历，终于不是流水账了', 70, 170);
      context.font = '500 28px sans-serif';
      context.fillStyle = '#66736a';
      context.fillText('免费现场试排结果 · 不编数字', 70, 225);
      const wrap = (text, maxWidth) => {
        const lines = [];
        let line = '';
        for (const character of text) {
          const next = line + character;
          if (context.measureText(next).width > maxWidth && line) {
            lines.push(line);
            line = character;
          } else {
            line = next;
          }
        }
        if (line) lines.push(line);
        return lines;
      };
      context.fillStyle = '#ffffff';
      context.roundRect(70, 285, 940, 700, 28);
      context.fill();
      context.fillStyle = '#207349';
      context.font = '700 25px sans-serif';
      context.fillText('试排后的项目表达', 120, 360);
      context.fillStyle = '#102116';
      context.font = '600 37px sans-serif';
      wrap(result, 840).slice(0, 10).forEach((line, index) => context.fillText(line, 120, 445 + index * 62));
      context.fillStyle = '#102116';
      context.font = '700 32px sans-serif';
      context.fillText('你也可以免费试一条', 70, 1090);
      context.fillStyle = '#207349';
      context.font = '500 24px sans-serif';
      const shareUrl = (stableFrontUrl || location.origin) + '/?source=share-card';
      const qr = qrcode(0, 'M');
      qr.addData(shareUrl);
      qr.make();
      const qrModules = qr.getModuleCount();
      const qrBox = 250;
      const qrCell = Math.floor(qrBox / (qrModules + 8));
      const qrSize = qrCell * (qrModules + 8);
      const qrLeft = 760;
      const qrTop = 1030;
      context.fillStyle = '#ffffff';
      context.fillRect(qrLeft, qrTop, qrSize, qrSize);
      context.fillStyle = '#102116';
      for (let row = 0; row < qrModules; row += 1) {
        for (let column = 0; column < qrModules; column += 1) {
          if (qr.isDark(row, column)) {
            context.fillRect(
              qrLeft + (column + 4) * qrCell,
              qrTop + (row + 4) * qrCell,
              qrCell,
              qrCell
            );
          }
        }
      }
      wrap(shareUrl, 620).slice(0, 2).forEach((line, index) => context.fillText(line, 70, 1145 + index * 35));
      context.fillStyle = '#66736a';
      context.font = '500 21px sans-serif';
      context.fillText('内容由使用者真实填写；工具只负责整理与排版。', 70, 1270);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        status.textContent = '成果卡生成失败，请重试。';
        return;
      }
      const file = new File([blob], '项目经历成果卡.png', {type: 'image/png'});
      trackStorefrontEvent('interaction', 'share-card-created');
      if (navigator.canShare?.({files: [file]})) {
        try {
          await navigator.share({title: '我的项目经历试排结果', text: '免费把一条真实项目经历整理清楚', url: shareUrl, files: [file]});
          trackStorefrontEvent('interaction', 'share-card-shared');
          status.textContent = '已打开系统分享面板。';
          return;
        } catch (error) {
          if (error?.name === 'AbortError') {
            status.textContent = '已取消分享，成果卡没有发送。';
            return;
          }
        }
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = '成果卡已下载；是否分享由你决定。';
    });
  </script>
</body>
</html>`;
}

function adminDashboardHtml(lab) {
  const seoPages = lab.flatMap((item) => seoPagesFor(item));
  const utilityPages = lab.flatMap((item) => utilityIntentPagesFor(item).map((page) => ({ ...page, experiment: item })));
  const hubPages = hubPagesForLab(lab);
  const rows = lab
    .map(
      (item) => `<tr>
        <td><a href="/offer/${item.id}.html">${escapeHtml(item.title)}</a><small>${escapeHtml(item.id)}</small></td>
        <td>¥${item.price}</td>
        <td>${item.metrics.views}</td>
        <td>${item.metrics.clicks}</td>
        <td>${item.metrics.paid}</td>
        <td>${item.metrics.pendingDelivery}</td>
        <td>¥${item.metrics.revenue}</td>
        <td>${item.score}</td>
        <td><span class="decision ${item.decision}">${item.decision}</span></td>
      </tr>`
    )
    .join("");
  const variantRows = lab
    .flatMap((item) =>
      (item.offerVariants || []).map((variant) => `<tr>
        <td><a href="/offer/${item.id}--${variant.id}.html">${escapeHtml(item.title)}</a><small>${escapeHtml(item.id)}</small></td>
        <td>${escapeHtml(variant.label)}${item.winningVariant?.id === variant.id ? " <span class=\"decision double-down\">winner</span>" : ""}<small>${escapeHtml(variant.angle)}</small></td>
        <td>${variant.metrics?.views || 0}</td>
        <td>${variant.metrics?.clicks || 0}</td>
        <td>${variant.metrics?.checkouts || 0}</td>
        <td>${variant.metrics?.paid || 0}</td>
        <td>¥${variant.metrics?.revenue || 0}</td>
        <td>${escapeHtml(String(variant.score || 0))}</td>
      </tr>`)
    )
    .join("");
  const top = [...lab].sort((a, b) => b.score - a.score)[0];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>自动收入引擎后台</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page wide">
    <section class="hero card">
      <p class="eyebrow">仅供经营者查看</p>
      <h1>真实经营状态</h1>
      <p class="lead">这里只展示程序实际验证过的访问、付款和收入。生成页面、提交搜索、展示收款码都不算赚钱；没有权威到账记录时，收入就是 ¥0。</p>
      <div class="actions">
        <a class="button" href="/">查看买家实际看到的页面</a>
        <a class="button ghost" href="/api/status">查看原始运行状态</a>
      </div>
    </section>
    <section class="grid">
      <article class="card"><h2>真实收入</h2><p>¥${lab.reduce((sum, item) => sum + Number(item.metrics?.revenue || 0), 0)}</p></article>
      <article class="card"><h2>真实付款</h2><p>${lab.reduce((sum, item) => sum + Number(item.metrics?.paid || 0), 0)} 笔</p></article>
      <article class="card"><h2>当前结论</h2><p>尚未证明能赚钱</p></article>
    </section>
    <section class="card">
      <h2>实验排行榜</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>实验</th><th>价格</th><th>曝光</th><th>点击</th><th>付款</th><th>待交付</th><th>收入</th><th>分数</th><th>动作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <h2>成交角度自动学习</h2>
      <p class="safe">每个商品同时生成 3 个售卖页变体：直接成交、痛点放大、边界信任。追踪入口 /t/:experiment/:channel 会按真实曝光、点击、checkout 和付款记录，自动跳到当前胜出的变体页。</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>实验</th><th>变体</th><th>曝光</th><th>点击</th><th>Checkout</th><th>付款</th><th>收入</th><th>变体分</th></tr></thead>
          <tbody>${variantRows}</tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <h2>自动生成的搜索获客页</h2>
      <p class="safe">这些不是给你手工复制的文案，而是程序每轮直接写入静态站、sitemap、RSS 和 feed 的长尾入口页。部署到公网后，worker 会把新 URL 提交给搜索索引。</p>
      <div class="grid">
        ${seoPages
          .slice(0, 12)
          .map((page) => `<article><h3><a href="/seo/${page.slug}.html">${escapeHtml(page.title)}</a></h3><p>${escapeHtml(page.summary)}</p></article>`)
          .join("")}
      </div>
    </section>
    <section class="card">
      <h2>程序化免费工具入口</h2>
      <p class="safe">这些入口把“先免费看看”的流量变成表单交互：低意图只给免费判断，高意图才自动生成唯一付款备注。它们会进入 sitemap、RSS、feed 和搜索提交，不需要你人工发布文案。</p>
      <div class="grid">
        ${utilityPages
          .slice(0, 12)
          .map((page) => `<article><h3><a href="/utilities/${escapeHtml(page.slug)}.html">${escapeHtml(page.title)}</a></h3><p>${escapeHtml(page.summary)}</p><p class="safe">${escapeHtml(page.experiment.title)}</p></article>`)
          .join("")}
      </div>
    </section>
    <section class="card">
      <h2>自动聚合入口页</h2>
      <p class="safe">程序会把零散商品按买家和交付类型聚合成可索引入口页，买家能从一个入口进入自测、售卖页和唯一付款备注；访问数据会进入事件流，后续发布自动向更有反应的入口倾斜。</p>
      <div class="grid">
        ${hubPages
          .map((page) => {
            const href = page.kind === "market" ? `/markets/${page.id}.html` : `/offer-types/${page.id}.html`;
            return `<article><h3><a href="${escapeHtml(href)}">${escapeHtml(page.title)}</a></h3><p>${escapeHtml(page.summary)}</p><p class="safe">包含 ${page.items.length} 个可购买商品</p></article>`;
          })
          .join("")}
      </div>
    </section>
    <section class="card">
      <h2>自动工人状态</h2>
      <p class="safe">这里读取真实运行状态：收入记录、发布队列、交付队列、策略迭代和最近 worker。若显示 blocked，说明程序没有假装成功，而是缺外部账号/支付/交付适配器。</p>
      <pre id="system-status">正在读取 /api/status ...</pre>
    </section>
    <section class="card">
      <h2>外部赚钱链路就绪度</h2>
      <p class="safe">这个卡片只显示程序自己能验证的链路：公网部署、自动分发、付款确认、自动交付。缺任何一项都不会被说成“已经赚钱”。</p>
      <pre id="adapter-readiness">正在读取 /api/adapter-readiness ...</pre>
    </section>
    <section class="card">
      <h2>闭环缺口</h2>
      <ul>
        <li>程序已经能自动提供在线工具、部署页面、记录匿名使用事件并展示用户提供的微信收款码。</li>
        <li>当前没有已经授权的稳定获客渠道；搜索收录或机器人抓取不能算真实买家。</li>
        <li>个人微信收款码没有服务端回调；程序无法确认谁付款、付了多少，也不能安全执行付费解锁。</li>
        <li>在接入商户支付回调、广告分成或联盟结算账户之前，不能声称已经形成自动收入闭环。</li>
      </ul>
    </section>
  </main>
  <script>
    fetch('/api/status')
      .then((response) => response.json())
      .then((payload) => {
        const status = payload.status;
        document.getElementById('system-status').textContent = JSON.stringify({
          revenue: status.revenue,
          orders: status.orders,
          publishQueue: status.publishQueue,
          deliveryQueue: status.deliveryQueue,
          opportunities: status.opportunities ? {
            status: status.opportunities.status,
            sources: status.opportunities.sources?.length || 0,
            signals: status.opportunities.signals?.slice(0, 5).map((item) => ({
              keyword: item.keyword,
              sourceId: item.sourceId,
              score: item.score
            }))
          } : null,
          trafficPlan: status.trafficPlan ? {
            budget: status.trafficPlan.budget,
            topAllocations: status.trafficPlan.allocations?.slice(0, 5).map((item) => ({
              experimentId: item.experimentId,
              title: item.title,
              score: item.score,
              budget: item.budget,
              opportunityKeyword: item.opportunityKeyword,
              activeChannels: item.channels.filter((channel) => ['active', 'owned', 'configured'].includes(channel.status)).map((channel) => channel.channel),
              blockedChannels: item.channels.filter((channel) => channel.status === 'blocked').map((channel) => channel.channel)
            }))
          } : null,
          executionQueue: status.executionQueue ? {
            total: status.executionQueue.tasks?.length || 0,
            topTasks: status.executionQueue.tasks?.slice(0, 8).map((item) => ({
              kind: item.kind,
              action: item.action,
              target: item.target,
              priority: item.priority,
              status: item.status,
              reason: item.reason
            }))
          } : null,
          adapterHealth: status.adapterHealth ? {
            configured: status.adapterHealth.configured,
            reachable: status.adapterHealth.reachable,
            blocked: status.adapterHealth.blocked,
            missing: status.adapterHealth.missing
          } : null,
          adapterReadiness: status.adapterReadiness ? {
            ready: status.adapterReadiness.ready,
            required: status.adapterReadiness.required?.map((item) => ({area: item.area, ok: item.ok}))
          } : null,
          publicAccess: status.publicAccess,
          promotedCombos: status.strategy?.promotedCombos || [],
          actionPlan: status.actionPlan?.actions?.slice(0, 5) || [],
          lastWorker: status.lastWorker?.id || null
        }, null, 2);
      })
      .catch(() => {
        document.getElementById('system-status').textContent = '静态部署模式下无法读取 API；请在本地 Node 服务中打开。';
      });
    fetch('/api/adapter-readiness')
      .then((response) => response.json())
      .then((payload) => {
        const readiness = payload.readiness;
        document.getElementById('adapter-readiness').textContent = JSON.stringify({
          ready: readiness.ready,
          required: readiness.required?.map((item) => ({
            area: item.area,
            ok: item.ok,
            env: item.env,
            purpose: item.purpose
          })),
          commands: readiness.commands
        }, null, 2);
      })
      .catch(() => {
        document.getElementById('adapter-readiness').textContent = '静态部署模式下无法读取 API；请在本地 Node 服务中打开。';
      });
  </script>
</body>
</html>`;
}

function writePublicAssets() {
  fs.copyFileSync(ASSET_QR, path.join(DIST_DIR, "wechat-pay.jpg"));
  fs.copyFileSync(path.join(ROOT, "public", "favicon.svg"), path.join(DIST_DIR, "favicon.svg"));
  fs.copyFileSync(path.join(ROOT, "public", "styles.css"), path.join(DIST_DIR, "styles.css"));
  fs.copyFileSync(path.join(ROOT, "node_modules", "qrcode-generator", "qrcode.js"), path.join(DIST_DIR, "qrcode.js"));
  fs.copyFileSync(path.join(ROOT, "node_modules", "fflate", "umd", "index.js"), path.join(DIST_DIR, "fflate.js"));
  fs.writeFileSync(
    path.join(DIST_DIR, "service.json"),
    JSON.stringify({ url: "", productId: PUBLIC_INCOME_PRODUCT.id }, null, 2)
  );
  copyDir(path.join(ROOT, "public", "admin"), path.join(DIST_DIR, "admin"));
}

function productMatrixHomeHtml(snapshot = productMatrixSnapshot()) {
  const readyProducts = snapshot.products.filter((product) => product.purchasable);
  const primary = readyProducts[0];
  const secondaryProducts = readyProducts.slice(1);
  const primaryBenefits =
    primary?.id === "consumer-evidence-pack"
      ? ["聊天、订单、付款和物流材料统一编号", "自动生成证据目录、时间线和文件校验清单", "原文件不上传，先免费预览整理结果"]
      : ["直接使用自己的材料免费生成", "先检查完整结果，再决定是否下载", "文件在当前浏览器本地处理"];
  const secondaryCards = secondaryProducts
    .map(
      (product) => `<article class="tool-card">
        <div class="tool-card-icon" aria-hidden="true">图</div>
        <div class="tool-card-copy">
          <span>${escapeHtml(product.category)}</span>
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.promise)}</p>
          <ul>
            <li>用自己的文件免费查看完整预览</li>
            <li>满意后再支付 ¥${Number(product.price).toFixed(2)} 下载成品</li>
          </ul>
        </div>
        <a href="${escapeHtml(product.path)}">立即使用 <span>→</span></a>
      </article>`
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="不注册、不安装，打开即用的在线实用工具。文件优先在浏览器本地处理，先看结果再决定是否下载。">
  <title>LifeYouMe 实用工具箱｜打开即用，先看结果</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="matrix-body">
  <main class="matrix-shell">
    <nav class="matrix-nav">
      <a class="matrix-brand" href="/"><span>LifeYouMe</span><strong>实用工具箱</strong></a>
      <span class="matrix-nav-note">无需注册 · 打开即用</span>
    </nav>
    <section class="matrix-hero">
      <div>
        <p class="matrix-kicker">在线实用工具</p>
        <h1>把麻烦事，<br>在线一次做完</h1>
        <p>不下载软件，不学习复杂操作。使用自己的材料直接生成结果，先免费检查，确认有用再下载。</p>
        <a class="matrix-hero-button" href="#tools">查看全部工具</a>
      </div>
      <div class="matrix-trust-card">
        <strong>使用更放心</strong>
        <span>文件优先在你的浏览器本地处理</span>
        <span>不强制注册，不收集原文件</span>
        <span>付费前可以先看完整预览</span>
      </div>
    </section>

    ${
      primary
        ? `<section class="matrix-recommend">
      <div class="matrix-section-title">
        <span>重点推荐</span>
        <h2>最近遇到消费纠纷？先把材料整理清楚</h2>
        <p>不用研究复杂格式，把现有截图和凭证放进来，几分钟得到一份结构清楚的证据材料包。</p>
      </div>
      <article class="primary-tool">
        <div class="primary-tool-copy">
          <span class="primary-tool-label">${escapeHtml(primary.category)} · 免费预览</span>
          <h3>${escapeHtml(primary.title)}</h3>
          <p>${escapeHtml(primary.promise)}</p>
          <ul>${primaryBenefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("")}</ul>
          <div class="primary-tool-actions">
            <a class="matrix-button" href="${escapeHtml(primary.path)}">免费整理我的材料</a>
            <span>完整证据包 ¥${Number(primary.price).toFixed(2)}</span>
          </div>
        </div>
        <div class="primary-tool-preview" aria-label="证据包交付内容示意">
          <div class="preview-window">
            <div class="preview-window-top"><i></i><i></i><i></i><span>证据材料包</span></div>
            <div class="preview-document">
              <strong>消费纠纷证据目录</strong>
              <span>01　订单与付款凭证</span>
              <span>02　商家沟通记录</span>
              <span>03　物流与商品照片</span>
              <span>04　售后处理记录</span>
              <em>已按时间排序 · 已生成校验清单</em>
            </div>
          </div>
        </div>
      </article>
    </section>`
        : ""
    }

    <section class="matrix-section" id="tools">
      <div class="matrix-section-head">
        <div><span>全部工具</span><h2>选择你现在要解决的问题</h2></div>
        <p>这里只展示已经完成、可以直接生成结果的工具。</p>
      </div>
      <div class="tool-grid">${secondaryCards || "<p>更多实用工具正在准备中。</p>"}</div>
    </section>

    <section class="matrix-section">
      <div class="matrix-section-head">
        <div><span>免费材料清单</span><h2>还不知道要准备什么？</h2></div>
        <p>先按实际问题核对材料，再决定是否需要工具整理。</p>
      </div>
      <div class="tool-grid">${CONSUMER_EVIDENCE_GUIDES.map((guide) => `<a class="tool-card guide-discovery-card" href="${escapeHtml(consumerEvidenceGuideUrl(guide))}"><div><h3>${escapeHtml(guide.question)}</h3><p>${escapeHtml(guide.description)}</p></div></a>`).join("")}</div>
    </section>

    <section class="matrix-footer-note">
      <strong>为什么这些工具可以先免费用？</strong>
      <p>你需要先确认结果是否适合自己，所以生成和预览不收费。只有需要下载整理好的完整成品时才付款。</p>
    </section>
    <footer class="matrix-footer"><span>LifeYouMe 实用工具箱</span><span>不承诺结果，只交付页面写明的文件</span></footer>
  </main>
</body>
</html>`;
}

function productImageStudioHtml({ preset = "", title = "", description = "", pathName = "/" } = {}) {
  const source = fs.readFileSync(path.join(ROOT, "public", "product-image-studio.html"), "utf8");
  const resolvedTitle = title || "商品图批量成品机｜先看整批效果，微信确认后下载";
  const resolvedDescription = description || "一批原图生成淘宝、拼多多、小红书和抖音上架图；先看本地预览，扫码付款后由店主手机确认并自动开放高清 ZIP。";
  const canonical = toPublicUrl(pathName);
  const discovery = [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(resolvedTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(resolvedDescription)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: resolvedTitle,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      url: canonical,
      description: resolvedDescription,
      offers: { "@type": "Offer", price: PUBLIC_INCOME_PRODUCT.price, priceCurrency: "CNY" },
      featureList: ["批量商品图处理", "四平台上架图套装", "统一主体占比", "统一尺寸与留白", "先预览后付款", "微信人工确认后下载高清 ZIP"],
    })}</script>`,
  ].join("\n  ");
  return source
    .replace("<title>商品图批量成品机｜拖入原图，直接下载上架图包</title>", `<title>${escapeHtml(resolvedTitle)}</title>\n  ${discovery}`)
    .replace(
      'content="一批原图生成淘宝、拼多多、小红书和抖音上架图；先看本地预览，扫码付款后由店主手机确认并自动开放高清 ZIP。"',
      `content="${escapeHtml(resolvedDescription)}"`
    )
    .replace('data-default-preset=""', `data-default-preset="${escapeHtml(preset)}"`);
}

function consumerEvidencePackHtml() {
  let html = fs.readFileSync(path.join(ROOT, "public", "consumer-evidence-pack.html"), "utf8");
  const evolution = readJsonFile("income-evolution.json", {});
  const variant = evolution.products?.["consumer-evidence-pack"]?.variant || "control";
  if (variant === "upload-first") {
    html = html.replace(
      "<h1>散乱截图和凭证，<br>整理成一份能提交的证据包。</h1>",
      '<h1>先放入截图，<br>免费检查整理结果。</h1><p><a href="#evidence-upload" style="color:inherit">选择自己的材料，免费开始 →</a></p>'
    ).replace('<label class="evidence-drop">', '<label class="evidence-drop" id="evidence-upload">');
  } else if (variant === "delivery-value") {
    html = html.replace(
      "¥19.90 下载完整证据包",
      "¥19.90 下载编号原文件＋目录＋完整报告 ZIP"
    );
  }
  return html.replace("const attribution = {", `const evolutionVariant = ${JSON.stringify(variant)};\n    const attribution = { evolutionVariant,`);
}

function evaluateIncomeEvolution({ now = new Date(), state = {}, products = [], channels = {} } = {}) {
  const day = beijingDateKey(now);
  if (state.lastEvaluatedOn === day) return { ...state, skipped: true };
  const next = {
    ...state, lastEvaluatedOn: day, skipped: false,
    products: { ...(state.products || {}) },
    history: [...(state.history || [])],
    channelState: Object.keys(channels).length ? "configured-not-proven" : "no-authorized-publisher",
    ownerTasks: [],
  };
  for (const product of products.filter((item) => item.purchasable)) {
    const previous = next.products[product.id] || { variant: "control", attempts: [], };
    const funnel = product.funnel;
    let decision = "observe";
    let reason = "样本不足，不因一天没有收入就修改产品。";
    let variant = previous.variant;
    let experiment = previous.experiment;
    const attempts = [...(previous.attempts || [])];
    if (experiment) {
      const addedVisits = funnel.visits - experiment.baseline.visits;
      const addedCompleted = funnel.completed - experiment.baseline.completed;
      const addedCheckouts = funnel.checkouts - experiment.baseline.checkouts;
      if (addedVisits >= 30) {
        const denominator = Math.max(1, experiment.baseline.visits);
        const before = experiment.kind === "upload-first" ? experiment.baseline.completed / denominator : experiment.baseline.checkouts / denominator;
        const after = (experiment.kind === "upload-first" ? addedCompleted : addedCheckouts) / addedVisits;
        decision = after > before ? "retain" : "rollback";
        reason = after > before ? "增量转化率提高，保留候选改法；这不是因果证明或收入保证。" : "新增样本没有改善转化，恢复原版本，不无限堆改动。";
        if (decision === "rollback") variant = "control";
        experiment = null;
      } else reason = `候选改法继续观察，新增有效访问 ${Math.max(0, addedVisits)}/30。`;
    } else if (funnel.paid > 0) {
      decision = "retain";
      reason = "已有确认付款，保留当前交付；仍需验证持续获客与收益。";
    } else if (funnel.visits < 30) {
      decision = "distribution";
      reason = "曝光样本不足：维护现有搜索提交，不盲目造页面；未授权社交渠道记为不可用，不向用户反复派任务。";
    } else if (funnel.checkouts > 0) {
      decision = "payment-observe";
      reason = "存在下单未付款：保留价格和收款规则，不伪造到账、不自动确认个人微信。";
    } else if (product.id === "consumer-evidence-pack") {
      const candidate = funnel.completed >= 5 ? "delivery-value" : "upload-first";
      if (!attempts.includes(candidate)) {
        variant = candidate;
        decision = "apply";
        reason = candidate === "upload-first" ? "有访问缺完成：自动突出免费上传入口。" : "完成后缺下单：自动突出付费 ZIP 交付物。";
        attempts.push(candidate);
        experiment = { kind: candidate, startedOn: day, baseline: { ...funnel } };
      } else {
        decision = "stop-variant-churn";
        reason = "现有有限候选已尝试，不重复轮换或声称自动创造新需求；等待新的有效信号。";
      }
    } else {
      decision = "offer-review";
      reason = "当前卖点缺乏成交信号，暂停自动扩张，不无边界增加收费能力。";
    }
    next.products[product.id] = { variant, attempts, experiment, decision, reason, funnel: { ...funnel } };
    next.history.push({ day, productId: product.id, decision, variant, reason, funnel: { ...funnel } });
  }
  next.history = next.history.slice(-180);
  return next;
}

function runIncomeEvolution({ now = new Date(), dryRun = false } = {}) {
  const next = evaluateIncomeEvolution({
    now, state: readJsonFile("income-evolution.json", {}),
    products: productMatrixSnapshot({ now }).products,
    channels: loadAdapters().channels || {},
  });
  if (!dryRun && !next.skipped) writeJsonFile("income-evolution.json", next);
  return next;
}

function consumerEvidenceGuideUrl(guide) {
  return toPublicUrl(`/guides/${guide.slug}/`);
}

function consumerEvidenceGuideHtml(guide) {
  const campaign = `guide-${guide.slug}`;
  const toolUrl = toPublicUrl(
    `/products/consumer-evidence-pack/?source=search&campaign=${encodeURIComponent(campaign)}`
  );
  const canonical = consumerEvidenceGuideUrl(guide);
  const event = JSON.stringify({
    type: "view",
    experimentId: "consumer-evidence-pack",
    channel: "guide-view",
    campaign,
    trafficSource: "search",
  }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(guide.title)}｜LifeYouMe</title>
  <meta name="description" content="${escapeHtml(guide.description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="${escapeHtml(toPublicUrl("/favicon.svg"))}" type="image/svg+xml">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(guide.title)}">
  <meta property="og:description" content="${escapeHtml(guide.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <script type="application/ld+json">${jsonScript({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    mainEntityOfPage: canonical,
    publisher: { "@type": "Organization", name: "LifeYouMe 实用工具箱" },
  })}</script>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75}
    a{color:inherit}.guide-nav{height:58px;background:#fff;border-bottom:1px solid #e8ebf0;display:flex;align-items:center;padding:0 20px}.guide-nav a{text-decoration:none;font-weight:800}
    .guide-shell{width:min(780px,calc(100% - 32px));margin:32px auto 64px}.guide-article{background:#fff;border:1px solid #e5e8ee;border-radius:18px;padding:clamp(24px,5vw,46px);box-shadow:0 12px 36px rgba(20,34,60,.06)}
    .guide-tag{display:inline-flex;padding:5px 10px;border-radius:99px;background:#eaf5ff;color:#1769aa;font-size:13px;font-weight:700}.guide-article h1{font-size:clamp(28px,6vw,42px);line-height:1.28;margin:16px 0 14px;letter-spacing:-.02em}
    .guide-lead{font-size:18px;color:#4d596d}.guide-article h2{margin:34px 0 12px;font-size:23px}.guide-list{padding-left:0;list-style:none;counter-reset:item}.guide-list li{counter-increment:item;margin:12px 0;padding:14px 16px 14px 52px;background:#f7f9fc;border-radius:12px;position:relative}
    .guide-list li:before{content:counter(item);position:absolute;left:16px;top:14px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#1769aa;color:#fff;font-size:13px;font-weight:800}
    .guide-mistakes{padding-left:22px;color:#4d596d}.guide-mistakes li{margin:10px 0}.guide-cta{margin-top:36px;padding:26px;background:#102f4f;color:#fff;border-radius:16px}.guide-cta h2{margin:0 0 8px}.guide-cta p{color:#d7e6f4;margin:0 0 18px}
    .guide-button{display:inline-flex;background:#ffcf4a;color:#302500;text-decoration:none;font-weight:800;border-radius:10px;padding:13px 20px}.guide-note{font-size:13px;color:#697386;margin-top:28px;padding-top:20px;border-top:1px solid #e8ebf0}
    @media(max-width:560px){.guide-shell{margin-top:18px}.guide-article{border-radius:14px}.guide-lead{font-size:16px}}
  </style>
</head>
<body>
  <nav class="guide-nav"><a href="${escapeHtml(toPublicUrl("/"))}">LifeYouMe 实用工具箱</a></nav>
  <main class="guide-shell">
    <article class="guide-article">
      <span class="guide-tag">消费材料整理清单</span>
      <h1>${escapeHtml(guide.title)}</h1>
      <p class="guide-lead">${escapeHtml(guide.intro)}</p>
      <h2>${escapeHtml(guide.question)}</h2>
      <ol class="guide-list">${guide.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      <h2>整理时常见的 3 个问题</h2>
      <ul class="guide-mistakes">${guide.mistakes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <section class="guide-cta">
        <h2>材料很多，不想手工编号？</h2>
        <p>把自己的图片和 PDF 放进浏览器，免费生成目录、时间线和完整预览。文件不会上传；确认结果适合自己后，再决定是否下载完整 ZIP。</p>
        <a class="guide-button" href="${escapeHtml(toolUrl)}">用自己的材料免费整理</a>
      </section>
      <section class="guide-related">
        <h2>其他材料整理问题</h2>
        <ul>${CONSUMER_EVIDENCE_GUIDES.filter((item) => item.slug !== guide.slug).map((item) => `<li><a href="${escapeHtml(consumerEvidenceGuideUrl(item))}">${escapeHtml(item.question)}</a></li>`).join("")}</ul>
      </section>
      <p class="guide-note">边界说明：本页仅提供通用的材料整理方法，不构成法律意见，也不承诺投诉、退款、索赔或诉讼结果。具体提交要求请以相关平台、机构或专业人士的最新说明为准。</p>
    </article>
  </main>
  <script>
    (() => {
      const payload = ${event};
      try {
        payload.visitorId = localStorage.getItem('consumer-evidence-pack:visitor') || crypto.randomUUID();
        localStorage.setItem('consumer-evidence-pack:visitor', payload.visitorId);
      } catch {
        payload.visitorId = String(Date.now()) + Math.random();
      }
      if (new URLSearchParams(location.search).get('source') === 'self-test') {
        payload.trafficSource = 'self-test';
        const link = document.querySelector('.guide-button');
        const target = new URL(link.href, location.href);
        target.searchParams.set('source', 'self-test');
        link.href = target.href;
      }
      const endpoint = ${jsonScript(toPublicUrl("/api/events"))};
      const body = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon(endpoint, new Blob([body], {type:'application/json'}))) return;
      } catch {}
      fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true}).catch(() => {});
    })();
  </script>
</body>
</html>`;
}

function writeConsumerEvidenceGuidePages() {
  for (const guide of CONSUMER_EVIDENCE_GUIDES) {
    const directory = path.join(DIST_DIR, "guides", guide.slug);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.html"), consumerEvidenceGuideHtml(guide));
  }
}

function publicDiscoveryUrls() {
  return [
    toPublicUrl("/"),
    ...PRODUCT_MATRIX.filter((product) => product.status === "ready" && product.path).map((product) =>
      toPublicUrl(product.path)
    ),
    ...CONSUMER_EVIDENCE_GUIDES.map(consumerEvidenceGuideUrl),
    ...productImagePresetPages().map((page) => toPublicUrl(`/presets/${page.slug}.html`)),
  ].filter(Boolean);
}

function writeMatrixProductPages() {
  const evidenceDir = path.join(DIST_DIR, "products", "consumer-evidence-pack");
  const imageDir = path.join(DIST_DIR, "products", "product-image-batch-studio");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "index.html"), consumerEvidencePackHtml());
  fs.writeFileSync(
    path.join(imageDir, "index.html"),
    productImageStudioHtml({
      pathName: "/products/product-image-batch-studio/",
      title: "商品图批量成品机｜免费预览四平台图包",
    })
  );
}

function productImagePresetPages() {
  return [
    {
      slug: "white-main-image",
      preset: "white-main",
      pathName: "/presets/white-main-image.html",
      title: "商品白底主图批量生成｜先预览，到账解锁高清 ZIP",
      description: "批量识别白、灰或棚拍纯色背景，统一主体占比并生成 1200×1200 白底主图；先预览，到账解锁高清 ZIP。",
    },
    {
      slug: "portrait-product-image",
      preset: "portrait-product",
      pathName: "/presets/portrait-product-image.html",
      title: "3:4 商品图批量生成｜统一主体占比，到账解锁高清 ZIP",
      description: "批量把横图和竖图统一为 1200×1600 商品图，自动统一主体占比和留白；先预览，到账解锁高清 ZIP。",
    },
    {
      slug: "social-product-card",
      preset: "social-card",
      pathName: "/presets/social-product-card.html",
      title: "4:5 商品内容图批量生成｜先预览，到账解锁高清 ZIP",
      description: "批量生成 1200×1500 商品内容图，自动居中铺满并统一品牌角标；先预览，到账解锁高清 ZIP。",
    },
    {
      slug: "taobao-main-image",
      preset: "taobao-main",
      pathName: "/presets/taobao-main-image.html",
      title: "淘宝主图批量生成｜800×800 白底图与主体统一",
      description: "批量生成 800×800 淘宝商品主图，自动识别纯色背景、统一主体占比；先预览，到账解锁高清 ZIP。",
    },
    {
      slug: "pdd-main-image",
      preset: "pdd-main",
      pathName: "/presets/pdd-main-image.html",
      title: "拼多多主图批量生成｜800×800 白底成品图",
      description: "批量生成 800×800 拼多多商品主图，自动换纯色背景并统一商品大小；先预览，到账解锁高清 ZIP。",
    },
    {
      slug: "xiaohongshu-product-image",
      preset: "xhs-product",
      pathName: "/presets/xiaohongshu-product-image.html",
      title: "小红书商品图批量生成｜1242×1660 竖版图",
      description: "批量生成 1242×1660 小红书竖版商品图，统一主体占比、留白和品牌角标；先预览，到账解锁高清 ZIP。",
    },
    {
      slug: "douyin-product-image",
      preset: "douyin-product",
      pathName: "/presets/douyin-product-image.html",
      title: "抖音商品图批量生成｜1080×1440 竖版图",
      description: "批量生成 1080×1440 抖音竖版商品图，自动居中铺满并统一品牌角标；先预览，到账解锁高清 ZIP。",
    },
  ];
}

function writeProductImagePresetPages() {
  const directory = path.join(DIST_DIR, "presets");
  fs.mkdirSync(directory, { recursive: true });
  for (const page of productImagePresetPages()) {
    fs.writeFileSync(path.join(directory, `${page.slug}.html`), productImageStudioHtml(page));
  }
}

function careerUtilityPages() {
  return [
    { slug: "jd-keyword-gap", title: "JD 关键词差距检查", description: "粘贴岗位 JD 和真实经历，立即查看已覆盖与缺失关键词。", kind: "gap" },
    { slug: "resume-fluff-scan", title: "简历空话扫描器", description: "扫描负责、参与、熟悉、显著提升等缺少证据的表达。", kind: "fluff" },
    { slug: "interview-question-builder", title: "项目面试追问生成器", description: "根据一段真实项目经历，生成面试官最可能追问的问题。", kind: "questions" },
    { slug: "resume-evidence-check", title: "项目经历证据检查", description: "检查职责、动作、范围、结果和证据是否完整。", kind: "evidence" },
  ];
}

function careerUtilityHtml(page, experiment) {
  const buyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(experiment.winningVariant?.id || "direct")}?source=${encodeURIComponent(`career-tool:${page.slug}`)}`;
  const canonicalUrl = toPublicUrl(`/career-tools/${page.slug}.html`);
  const relatedTools = careerUtilityPages().filter((item) => item.slug !== page.slug);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(page.title)}｜免费本地工具</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/styles.css">
  <link rel="preload" href="/wechat-pay.jpg" as="image">
  <script type="application/ld+json">${jsonScript({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: page.title,
    description: page.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    url: canonicalUrl,
    offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
    isPartOf: { "@type": "WebSite", name: "一页简历成品生成器", url: toPublicUrl("/") },
  })}</script>
</head>
<body><main class="page storefront">
  <nav class="buyer-nav" aria-label="页面导航">
    <a href="/">一页简历生成器</a>
    <span>›</span>
    <span>${escapeHtml(page.title)}</span>
  </nav>
  <section class="hero card">
    <p class="eyebrow">免费 · 不登录 · 内容不上传</p>
    <h1>${escapeHtml(page.title)}</h1>
    <p class="lead">${escapeHtml(page.description)} 结果只做文本检查，不代表录用概率，也不会替你编造经历。</p>
  </section>
  <section class="card rewrite-tool">
    ${page.kind === "gap" ? `<label>岗位 JD<textarea id="primary" rows="7" placeholder="粘贴岗位职责和任职要求"></textarea></label><label>你的真实经历<textarea id="secondary" rows="7" placeholder="粘贴你真实做过的项目和技能"></textarea></label>` : `<label>你的真实项目经历<textarea id="primary" rows="10" placeholder="粘贴一段项目经历；所有处理都在当前浏览器完成"></textarea></label>`}
    <button class="button" id="run" type="button">立即检查</button>
    <div id="result" class="rewrite-result" hidden>
      <p class="eyebrow">根据你刚才输入的内容</p>
      <h2>检查结果</h2>
      <div id="output" class="diagnostic-results"></div>
      <div class="result-actions">
        <a class="button" href="/app/resume-builder.html" data-career-tool-upgrade>把整份简历做成一页 PDF</a>
        <a class="button ghost" href="/samples/${escapeHtml(experiment.id)}.html">先看完整成品示例</a>
      </div>
      <p class="tool-boundary">你的输入没有上传；上面的结果由当前浏览器即时生成。</p>
      <aside class="support" data-tool-support hidden>
        <span class="badge">检查完成</span>
        <h2>觉得结果有用，再自愿支持</h2>
        <p class="safe">全部功能免费，支持不是解锁条件。金额由你决定。</p>
        <img src="/wechat-pay.jpg" alt="微信收款二维码">
      </aside>
    </div>
  </section>
  <section class="card purchase-card">
    <div><p class="eyebrow">完整功能免费开放</p><h2>一页简历成品生成器</h2><p>直接完成 JD 匹配、项目表达、证据检查、一页排版和 PDF 输出。</p></div>
    <div class="storefront-price"><strong>免费</strong><span>生成结果后，可自愿支持</span></div>
    <a class="button" href="/app/resume-builder.html">打开完整生成器</a>
  </section>
  <section class="card related-tools">
    <p class="eyebrow">继续免费检查</p>
    <h2>另外三个本地工具</h2>
    <div class="related-tool-grid">
      ${relatedTools
        .map(
          (item) => `<a href="/career-tools/${escapeHtml(item.slug)}.html"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></a>`
        )
        .join("")}
    </div>
  </section>
</main>
<script>
const clean=value=>String(value||'').replace(/[<>]/g,'').trim();
const toolSlug=${JSON.stringify(page.slug)};
const productId=${JSON.stringify(experiment.id)};
const track=(channel)=>{
  const payload=JSON.stringify({type:'interaction',experimentId:productId,channel});
  try{navigator.sendBeacon('/api/events',new Blob([payload],{type:'application/json'}))}catch{}
};
const resultItem=(label,text,tone='neutral')=>{
  const article=document.createElement('article');article.className='diagnostic-item '+tone;
  const strong=document.createElement('strong');strong.textContent=label;
  const p=document.createElement('p');p.textContent=text;
  article.append(strong,p);return article;
};
const render=items=>{
  const root=document.getElementById('output');
  root.replaceChildren(...items.map(item=>resultItem(item.label,item.text,item.tone)));
  document.getElementById('result').hidden=false;
  document.querySelector('[data-tool-support]').hidden=false;
  document.getElementById('result').scrollIntoView({behavior:'smooth',block:'center'});
  track('career-tool-result:'+toolSlug);
  track('career-tool-support:'+toolSlug);
};
const splitClauses=value=>value.split(/[\\n。；;]+/).map(item=>item.trim()).filter(Boolean);
document.getElementById('run').onclick=()=>{
  const primary=clean(document.getElementById('primary').value),secondary=clean(document.getElementById('secondary')?.value);
  if(!primary||(toolSlug==='jd-keyword-gap'&&!secondary)){alert(toolSlug==='jd-keyword-gap'?'请同时粘贴岗位 JD 和你的真实经历。':'请先粘贴真实内容。');return}
  const kind=${JSON.stringify(page.kind)};let items=[];
  if(kind==='gap'){
    const stop=new Set(['负责','相关','工作','岗位','要求','以及','进行','具备','能够','熟悉','经验','优先','以上','良好','项目','能力']);
    const common=['前端开发','后端开发','性能优化','接口联调','异常处理','自动化测试','单元测试','需求分析','系统设计','数据分析','项目管理','团队协作','用户研究','产品设计','弱网优化','状态管理','微服务','数据库','可视化','交互设计'];
    const latin=primary.match(/[A-Za-z][A-Za-z0-9+#.-]{1,20}/g)||[];
    const chinese=common.filter(x=>primary.includes(x));
    const words=[...new Set([...latin,...chinese].map(x=>x.toLowerCase()).filter(x=>!stop.has(x)))].slice(0,30);
    const hit=words.filter(x=>secondary.toLowerCase().includes(x)),miss=words.filter(x=>!hit.includes(x));
    const rate=words.length?Math.round(hit.length/words.length*100):0;
    items=[
      {label:'关键词覆盖 '+rate+'%',text:hit.join('、')||'暂未识别到明确匹配词',tone:hit.length?'good':'warn'},
      {label:'岗位提到、经历未体现',text:miss.slice(0,12).join('、')||'没有识别到明显缺口',tone:miss.length?'warn':'good'},
      {label:'下一步怎么补',text:miss.length?'从缺失词里挑你确实做过的 1–3 项，补上具体动作、使用场景和可核验结果；没做过的不要硬写。':'覆盖不错，再确认每个关键词都有真实项目和证据可讲。'}
    ];
  } else if(kind==='fluff'){
    const rules=[
      ['负责','后面补“独立完成了什么”以及范围'],
      ['参与','说清你本人承担的部分，避免团队成果都算在自己头上'],
      ['熟悉','换成实际用它完成过的功能或解决的问题'],
      ['精通','除非能回答原理和复杂故障，否则换成具体项目证据'],
      ['显著提升','补测量口径、前后数据和测试时间'],
      ['大幅优化','补优化对象、动作、前后差异和验证方式']
    ];
    const risky=rules.filter(([word])=>primary.includes(word));
    items=risky.length
      ? risky.map(([word,advice])=>({label:'发现空话：“'+word+'”',text:advice,tone:'warn'}))
      : [{label:'未发现常见空话',text:'继续检查每个数字、结果和职责边界是否都有证据可讲。',tone:'good'}];
    items.push({label:'可直接套用的事实结构',text:'在【项目/场景】中，我【独立/协作】完成【具体动作】，覆盖【范围/约束】，最终【上线/验收/交付结果】。'});
  } else if(kind==='questions'){
    const clauses=splitClauses(primary);
    const topic=(clauses[0]||primary).slice(0,38);
    const technologies=[...new Set(primary.match(/[A-Za-z][A-Za-z0-9+#.-]{1,20}/g)||[])].slice(0,3);
    const numbers=primary.match(/\\d+(?:\\.\\d+)?%|\\d+\\s*(?:个|类|次|天|周|月)/g)||[];
    items=[
      {label:'职责追问',text:'在“'+topic+'”里，哪些部分是你独立完成的，哪些是团队协作的？'},
      {label:'方案追问',text:technologies.length?'为什么选择 '+technologies.join(' / ')+'，当时比较过哪些替代方案？':'为什么选择这个方案，而不是另一种实现？'},
      {label:'难点追问',text:'最难复现的边界、异常或失败是什么？你如何定位和处理？'},
      {label:'结果追问',text:numbers.length?'这些数字（'+numbers.slice(0,4).join('、')+'）如何测量，原始记录在哪里？':'你用什么验收记录、上线版本或反馈证明项目完成？'},
      {label:'复盘追问',text:'如果现在重做一次，你会保留什么、改变什么，为什么？'}
    ];
  } else {
    const checks=[['职责边界',/独立|主导|负责|协作/],['具体动作',/完成|实现|设计|梳理|优化|搭建|开发/],['范围或约束',/[0-9一二三四五六七八九十]|覆盖|场景|异常/],['结果或交付',/上线|交付|验收|测试|反馈|完成/],['可核验证据',/文档|记录|版本|工单|数据|测试/]];
    const passed=checks.filter(([,rule])=>rule.test(primary)).length;
    items=[{label:'完整度 '+passed+'/5',text:passed>=4?'事实要素较完整，可以开始压缩成简历表达。':'先补齐缺项，再润色句子。',tone:passed>=4?'good':'warn'}];
    items.push(...checks.map(([label,rule])=>rule.test(primary)
      ? {label:'已有：'+label,text:'文本中识别到了对应事实；面试前确认能够展开说明。',tone:'good'}
      : {label:'待补：'+label,text:label==='职责边界'?'说明是独立完成、主导还是协作。':label==='具体动作'?'写出你实际完成、设计或解决了什么。':label==='范围或约束'?'补页面数、状态类型、用户角色或异常场景。':label==='结果或交付'?'补上线、验收、交付或真实反馈。':'补测试记录、版本、文档、工单或数据来源。',tone:'warn'}));
  }
  render(items);
};
document.querySelector('[data-career-tool-upgrade]')?.addEventListener('click',()=>track('career-tool-upgrade:'+toolSlug));
</script></body></html>`;
}

function writeCareerUtilityAssets(experiment) {
  const directory = path.join(DIST_DIR, "career-tools");
  fs.mkdirSync(directory, { recursive: true });
  for (const page of careerUtilityPages()) {
    fs.writeFileSync(path.join(directory, `${page.slug}.html`), careerUtilityHtml(page, experiment));
  }
}

function publicOfferUrl(experimentId) {
  return toPublicUrl(`/offer/${encodeURIComponent(experimentId)}.html`);
}

function publicOfferVariantUrl(experimentId, variantId) {
  return toPublicUrl(`/offer/${encodeURIComponent(experimentId)}--${encodeURIComponent(variantId)}.html`);
}

function publicBuyNowUrl(experimentId) {
  return toPublicUrl(`/buy-now/${encodeURIComponent(experimentId)}.html`);
}

function starterOfferPrice(experiment) {
  const base = Number(experiment.price || 0);
  if (!Number.isFinite(base) || base <= 0) return 9;
  return Math.max(6, Math.min(base - 1, Math.ceil(base * 0.38)));
}

function publicStarterOfferUrl(experimentId) {
  return toPublicUrl(`/starter/${encodeURIComponent(experimentId)}.html`);
}

function publicInstantCheckoutUrl(experimentId) {
  return toPublicUrl(`/instant/${encodeURIComponent(experimentId)}.html`);
}

function publicRescueOfferUrl(experimentId) {
  return toPublicUrl(`/rescue/${encodeURIComponent(experimentId)}.html`);
}

function publicCheckoutRecoveryUrl(checkoutId) {
  return toPublicUrl(`/recover/${encodeURIComponent(checkoutId)}`);
}

function publicTodayDealsUrl() {
  return toPublicUrl("/deals/today.html");
}

function buyNowPageHtml(experiment) {
  const variantId = experiment.winningVariant?.id || "proof";
  const buyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("buy-now")}`;
  const starterUrl = `/starter/${encodeURIComponent(experiment.id)}.html`;
  const canonicalUrl = publicBuyNowUrl(experiment.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`直接购买：${experiment.title}`)}</title>
  <meta name="description" content="${escapeHtml(`¥${experiment.price} 购买 ${experiment.delivery}。点击后系统生成唯一付款备注，付款匹配后自动发货。`)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(`直接购买：${experiment.title}`)}" />
  <meta property="og:description" content="${escapeHtml(experiment.promise)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: `直接购买：${experiment.title}`, description: experiment.promise }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">直购成交页 / 程序自动生成 / ${escapeHtml(variantId)}</p>
      <h1>${escapeHtml(experiment.title)}</h1>
      <p class="lead">${escapeHtml(experiment.promise)}</p>
      <div class="price">¥${escapeHtml(String(experiment.price))}</div>
      <p class="safe">这个页面可被搜索和分发发现，但不会在爬虫访问时创建订单；真实买家滚动、触摸、点击或键盘互动后，程序会自动生成唯一付款备注，买家也可以直接点按钮进入 /buy。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(buyUrl)}">立即生成唯一付款备注</a>
        <a class="button ghost" href="${escapeHtml(starterUrl)}">先买低价入门包</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">先看交付边界</a>
      </p>
    </section>
    <section class="pay card">
      <div>
        <p class="eyebrow">付款后自动交付</p>
        <h2>扫码付款前先点按钮生成备注</h2>
        <p>程序会用唯一备注匹配你的付款，匹配成功后自动生成私有交付链接。</p>
        <ul>
          <li>买家：${escapeHtml(experiment.buyer)}</li>
          <li>痛点：${escapeHtml(experiment.pain)}</li>
          <li>交付：${escapeHtml(experiment.delivery)}</li>
          <li>边界：${escapeHtml(experiment.safety)}</li>
        </ul>
      </div>
      <img src="/wechat-pay.jpg" alt="微信收款二维码" />
    </section>
    ${directCheckoutSectionHtml({
      experimentId: experiment.id,
      variantId,
      source: "buy-now:click",
      title: "直购页：自动生成完整包付款备注",
      cta: "生成完整包付款备注",
      autostart: false,
      engagementAutostart: true,
    })}
    ${staticPaymentFallbackHtml(experiment, { label: "直购页兜底收款" })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:'buy-now'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function starterOfferHtml(experiment) {
  const variantId = "proof";
  const price = starterOfferPrice(experiment);
  const buyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("starter-offer")}&offer=starter`;
  const canonicalUrl = publicStarterOfferUrl(experiment.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`低价入门：${experiment.title}`)}</title>
  <meta name="description" content="${escapeHtml(`¥${price} 先买 ${experiment.delivery} 的入门版。程序自动生成唯一付款备注，降低第一次付款门槛。`)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(`低价入门：${experiment.title}`)}" />
  <meta property="og:description" content="${escapeHtml(`先用 ¥${price} 验证是否适合，再决定是否购买完整包。`)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: `低价入门：${experiment.title}`, description: `¥${price} 入门版，用更低门槛验证 ${experiment.delivery} 是否适合。`, price }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">低价入门成交页 / 自动降门槛 / ${escapeHtml(variantId)}</p>
      <h1>${escapeHtml(experiment.title)}：先买入门版</h1>
      <p class="lead">如果你还没准备好直接买完整包，程序会先提供一个低价入门成交入口，用更低金额换第一笔真实付款和交付验证。</p>
      <div class="price">¥${escapeHtml(String(price))}</div>
      <p class="safe">入门版不承诺收益、不承诺结果；它只交付完整包的最小可用切片。付款备注仍由系统唯一生成，付款匹配后自动交付。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(buyUrl)}">购买入门版并生成唯一付款备注</a>
        <a class="button ghost" href="/buy-now/${escapeHtml(experiment.id)}.html">查看完整包</a>
        <a class="button ghost" href="/sales/${escapeHtml(experiment.id)}.html">问自动销售助手</a>
      </p>
    </section>
    <section class="card">
      <h2>入门版包含什么</h2>
      <ul>
        <li>一个可复制开头：围绕「${escapeHtml(experiment.pain)}」的最小执行结构。</li>
        <li>一份购买判断：你是否需要完整的「${escapeHtml(experiment.delivery)}」。</li>
        <li>一条升级路径：如果入门版对得上，再买完整包。</li>
      </ul>
      <h2>为什么这更接近自动赚钱</h2>
      <p>程序不只等待原价成交，还会自动提供低门槛付款入口，用真实小额付款判断商品是否值得继续放大。</p>
    </section>
    ${directCheckoutSectionHtml({
      experimentId: experiment.id,
      variantId,
      source: "starter-offer:click",
      title: `低价入门页：生成入门版付款备注`,
      cta: "生成入门版付款备注",
      autostart: false,
      engagementAutostart: true,
      offer: "starter",
      amount: price,
    })}
    ${staticPaymentFallbackHtml(experiment, { label: "入门版兜底收款", amount: price, offer: "starter" })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:'starter-offer'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function instantCheckoutHtml(experiment) {
  const variantId = "proof";
  const price = starterOfferPrice(experiment);
  const buyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("instant-checkout")}&offer=starter`;
  const fullBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("instant-checkout:full")}`;
  const canonicalUrl = publicInstantCheckoutUrl(experiment.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`一屏付款：${experiment.title}`)}</title>
  <meta name="description" content="${escapeHtml(`程序检测到低价入门页仍没有 checkout，自动切到一屏付款页：¥${price} 入门版，点击/互动后生成唯一付款备注。`)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(`一屏付款：${experiment.title}`)}" />
  <meta property="og:description" content="${escapeHtml(`¥${price} 入门版，一屏说明交付、边界和付款备注，降低从访问到付款的距离。`)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: `一屏付款：${experiment.title}`, description: `低价入门页无 checkout 后自动升级的一屏成交页。`, price }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">一屏付款页 / starter 无 checkout 后自动升级 / ${escapeHtml(variantId)}</p>
      <h1>${escapeHtml(experiment.title)}</h1>
      <p class="lead">程序已经把入口降到入门价，但仍没有 checkout，所以这页继续减少摩擦：一屏内同时给出价格、交付、边界、二维码和唯一付款备注生成入口。</p>
      <div class="price">入门版 ¥${escapeHtml(String(price))}</div>
      <p class="safe">不承诺收益、不承诺结果；只卖可立即交付的数字切片。页面访问不会创建订单，真实买家点击或有效互动后才会生成 checkout。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(buyUrl)}">现在生成入门版付款备注</a>
        <a class="button ghost" href="${escapeHtml(fullBuyUrl)}">我直接买完整包</a>
      </p>
    </section>
    <section class="pay card">
      <div>
        <p class="eyebrow">付款动作压缩到这一屏</p>
        <h2>买家只需要做两步</h2>
        <ol>
          <li>点击按钮生成本次购买唯一付款备注。</li>
          <li>扫码付款 ¥${escapeHtml(String(price))}，备注保持一致；匹配成功后自动交付。</li>
        </ol>
        <ul>
          <li>适合：${escapeHtml(experiment.buyer)}</li>
          <li>解决：${escapeHtml(experiment.pain)}</li>
          <li>入门版：完整包的最小可用切片</li>
          <li>边界：${escapeHtml(experiment.safety)}</li>
        </ul>
      </div>
      <img src="/wechat-pay.jpg" alt="微信收款二维码" />
    </section>
    ${directCheckoutSectionHtml({
      experimentId: experiment.id,
      variantId,
      source: "instant-checkout:click",
      title: "一屏付款页：生成入门版付款备注",
      cta: "生成入门版付款备注",
      autostart: false,
      engagementAutostart: true,
      offer: "starter",
      amount: price,
    })}
    ${staticPaymentFallbackHtml(experiment, { label: "一屏付款兜底收款", amount: price, offer: "starter" })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:'instant-checkout'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function rescueOfferHtml(experiment) {
  const variantId = "proof";
  const starterPrice = starterOfferPrice(experiment);
  const fullBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("rescue-offer:full")}`;
  const starterBuyUrl = `/buy/${encodeURIComponent(experiment.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent("rescue-offer:starter")}&offer=starter`;
  const canonicalUrl = publicRescueOfferUrl(experiment.id);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`限时挽回：${experiment.title}`)}</title>
  <meta name="description" content="${escapeHtml(`程序检测到这个商品有曝光但未成交，自动改成更低阻力的购买入口：¥${starterPrice} 入门版或 ¥${experiment.price} 完整包。`)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(`限时挽回：${experiment.title}`)}" />
  <meta property="og:description" content="${escapeHtml(`先买 ¥${starterPrice} 入门版，或直接买 ¥${experiment.price} 完整包。付款备注自动生成，付款匹配后自动交付。`)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${jsonScript(productStructuredData(experiment, { url: canonicalUrl, name: `限时挽回：${experiment.title}`, description: `¥${starterPrice} 入门版或 ¥${experiment.price} 完整包，自动生成付款备注。`, price: starterPrice }))}</script>
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">自动挽回成交页 / 有曝光无成交时生成 / ${escapeHtml(variantId)}</p>
      <h1>${escapeHtml(experiment.title)}：先用低门槛拿到一个可用版本</h1>
      <p class="lead">程序检测到原售卖入口没有转成付款，所以自动切换到这个挽回页：先给低价入门版，降低第一次付款阻力；愿意一步到位的人也可以直接买完整包。</p>
      <div class="price">入门版 ¥${escapeHtml(String(starterPrice))} / 完整包 ¥${escapeHtml(String(experiment.price))}</div>
      <p class="safe">不承诺收益、不承诺录用、不承诺平台推荐。这里只卖数字交付物；付款匹配成功后自动发货。</p>
      <p class="actions">
        <a class="button" href="${escapeHtml(starterBuyUrl)}">先买入门版并生成付款备注</a>
        <a class="button ghost" href="${escapeHtml(fullBuyUrl)}">直接买完整包</a>
        <a class="button ghost" href="/delivery-preview/${escapeHtml(experiment.id)}.md">查看交付边界</a>
      </p>
    </section>
    <section class="card">
      <h2>为什么程序改卖法</h2>
      <ul>
        <li>原页面有曝光但没有付款，说明买家还没被说服或付款门槛太高。</li>
        <li>挽回页把选择拆成两档：低价入门版用于拿第一笔付款，完整包用于高意图买家。</li>
        <li>不需要你人工判断；action plan 会把后续发布自动导向这个页面。</li>
      </ul>
      <h2>你会拿到什么</h2>
      <p>入门版拿到最小可用切片；完整包拿到「${escapeHtml(experiment.delivery)}」。适合：${escapeHtml(experiment.buyer)}。</p>
    </section>
    ${directCheckoutSectionHtml({
      experimentId: experiment.id,
      variantId,
      source: "rescue-offer:click",
      title: `自动挽回页：生成完整包付款备注`,
      cta: "生成完整包付款备注",
      autostart: false,
      engagementAutostart: true,
    })}
    ${staticPaymentFallbackHtml(experiment, { label: "挽回页兜底收款" })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(experiment.id)},variantId:${JSON.stringify(variantId)},channel:'rescue-offer'})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function todayDealsPageHtml(lab) {
  const ranked = [...lab].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 8);
  const top = ranked[0];
  const topVariantId = top?.winningVariant?.id || "proof";
  const topBuyUrl = top ? `/buy/${encodeURIComponent(top.id)}/${encodeURIComponent(topVariantId)}?source=${encodeURIComponent("today-deals")}` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>今日最值得买的现成交付包</title>
  <meta name="description" content="程序按机会信号、访问、点击、checkout 和付款数据自动排序，把今日主推商品集中到一个可索引成交入口。" />
  <link rel="canonical" href="${escapeHtml(publicTodayDealsUrl())}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page wide">
    <section class="hero card">
      <p class="eyebrow">今日主推 / 自动成交入口</p>
      <h1>程序今天优先卖这些现成交付包</h1>
      <p class="lead">这个页面由程序自动排序生成，不需要你人工选品。它把当前最有机会成交的商品集中展示，并把买家导向唯一付款备注。</p>
      ${top ? `<div class="actions"><a class="button" href="${escapeHtml(topBuyUrl)}">购买当前第一名：¥${escapeHtml(String(top.price))}</a><a class="button ghost" href="/buy-now/${escapeHtml(top.id)}.html">查看直购说明</a></div>` : ""}
    </section>
    <section class="grid">
      ${ranked
        .map((item, index) => {
          const variantId = item.winningVariant?.id || "proof";
          const buyUrl = `/buy/${encodeURIComponent(item.id)}/${encodeURIComponent(variantId)}?source=${encodeURIComponent(`today-deals:rank-${index + 1}`)}`;
          return `<article class="card">
        <p class="eyebrow">#${index + 1} / ${escapeHtml(item.buyer)}</p>
        <h2><a href="/buy-now/${escapeHtml(item.id)}.html">${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(item.promise)}</p>
        <ul>
          <li>价格：¥${escapeHtml(String(item.price))}</li>
          <li>交付：${escapeHtml(item.delivery)}</li>
          <li>当前分数：${escapeHtml(String(item.score || 0))}</li>
          <li>付款：${escapeHtml(String(item.metrics?.paid || 0))}，checkout：${escapeHtml(String(item.metrics?.checkouts || 0))}</li>
        </ul>
        <p class="actions">
          <a class="button" href="${escapeHtml(buyUrl)}">直接生成付款备注</a>
          <a class="button ghost" href="/offer/${escapeHtml(item.id)}--${escapeHtml(variantId)}.html">看售卖页</a>
        </p>
      </article>`;
        })
        .join("")}
    </section>
    <section class="card">
      <h2>为什么这更接近自动赚钱</h2>
      <p>程序不再只生成分散页面，而是每轮自动把注意力集中到当前最该卖的几个商品，并通过可索引页面、RSS、feed、sitemap 和搜索提交持续暴露。真实买家点击购买才创建 checkout，避免爬虫制造假订单。</p>
    </section>
  </main>
</body>
</html>`;
}

function writeBuyNowPages(lab) {
  const buyNowDir = path.join(DIST_DIR, "buy-now");
  const starterDir = path.join(DIST_DIR, "starter");
  const instantDir = path.join(DIST_DIR, "instant");
  const rescueDir = path.join(DIST_DIR, "rescue");
  const dealsDir = path.join(DIST_DIR, "deals");
  fs.mkdirSync(buyNowDir, { recursive: true });
  fs.mkdirSync(starterDir, { recursive: true });
  fs.mkdirSync(instantDir, { recursive: true });
  fs.mkdirSync(rescueDir, { recursive: true });
  fs.mkdirSync(dealsDir, { recursive: true });
  for (const experiment of lab) {
    fs.writeFileSync(path.join(buyNowDir, `${experiment.id}.html`), buyNowPageHtml(experiment));
    fs.writeFileSync(path.join(starterDir, `${experiment.id}.html`), starterOfferHtml(experiment));
    fs.writeFileSync(path.join(instantDir, `${experiment.id}.html`), instantCheckoutHtml(experiment));
    fs.writeFileSync(path.join(rescueDir, `${experiment.id}.html`), rescueOfferHtml(experiment));
  }
  fs.writeFileSync(path.join(dealsDir, "today.html"), todayDealsPageHtml(lab));
  return {
    today: publicTodayDealsUrl(),
    pages: lab.map((item) => ({ experimentId: item.id, url: publicBuyNowUrl(item.id), starterUrl: publicStarterOfferUrl(item.id), instantUrl: publicInstantCheckoutUrl(item.id), rescueUrl: publicRescueOfferUrl(item.id) })),
  };
}

function syndicationPagesForFeed(pages, { limit = 16, textLength = 40 } = {}) {
  return pages.slice(-limit).map((page) => ({
    taskId: page.taskId,
    channel: page.channel,
    experimentId: page.experimentId,
    title: page.label,
    url: page.url,
    text: String(page.text || "").slice(0, textLength),
  }));
}

function compactFeedPage(page) {
  return {
    intent: page.intent,
    url: page.url,
  };
}

function compactFeedPages(pages, preferredIntents = [], limit = 2) {
  const byIntent = new Map(pages.map((page) => [page.intent, page]));
  const selected = [];
  for (const intent of preferredIntents) {
    const page = byIntent.get(intent);
    if (page && !selected.includes(page)) selected.push(page);
  }
  for (const page of pages) {
    if (selected.length >= limit) break;
    if (!selected.includes(page)) selected.push(page);
  }
  return selected.slice(0, limit).map(compactFeedPage);
}

function distributionFeed(lab) {
  const publishTasks = publishTasksForLab(lab);
  const syndicationPages = publishedSyndicationPages();
  const hubPages = hubPagesForLab(lab);
  const rankedDeals = [...lab].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return {
    generatedAt: new Date().toISOString(),
    version: 1,
    todayDeals: {
      title: "今日最值得买的现成交付包",
      url: publicTodayDealsUrl(),
      products: rankedDeals.slice(0, 8).map((item, index) => ({
        rank: index + 1,
        id: item.id,
        title: item.title,
        price: item.price,
        score: item.score,
        buyNowUrl: publicBuyNowUrl(item.id),
        starterOfferUrl: publicStarterOfferUrl(item.id),
        rescueOfferUrl: publicRescueOfferUrl(item.id),
        starterPrice: starterOfferPrice(item),
      instantCheckoutUrl: publicInstantCheckoutUrl(item.id),
        offerUrl: publicOfferVariantUrl(item.id, item.winningVariant?.id || "proof"),
      })),
    },
    hubPages: hubPages.map((page) => ({
      kind: page.kind,
      id: page.id,
      title: page.title,
      summary: page.summary,
      url: page.url,
      productCount: page.items.length,
      products: page.items.map((item) => ({
        id: item.id,
        offerUrl: publicOfferUrl(item.id),
        leadToolUrl: publicLeadToolUrl(item.id),
        sampleUrl: publicSamplePageUrl(item.id),
        sampleCloseUrl: publicSampleCloseUrl(item.id),
      })),
    })),
    ownedPromotionPages: publishTasks.map((task) => ({
      channel: task.channel,
      experimentId: task.experimentId,
      title: task.label,
      url: promotionPageUrl(task),
      priority: task.priority || 0,
      channelStatus: task.channelStatus || "",
      opportunityKeyword: task.opportunityKeyword || "",
    })),
    totalOwnedSyndicationPages: syndicationPages.length,
    ownedSyndicationPagesLimit: 16,
    ownedSyndicationPages: syndicationPagesForFeed(syndicationPages),
    products: lab.map((item) => ({
      id: item.id,
      title: item.title,
      buyer: item.buyer,
      pain: item.pain,
      whyBuy: item.whyBuy,
      delivery: item.delivery,
      price: item.price,
      basePrice: item.basePrice || item.price,
      decision: item.decision,
      score: item.score,
      winningVariant: item.winningVariant
        ? {
            id: item.winningVariant.id,
            label: item.winningVariant.label,
            url: item.winningVariant.url,
          }
        : null,
      offerVariants: (item.offerVariants || []).map((variant) => ({
        id: variant.id,
        label: variant.label,
        url: variant.url,
      })),
      offerUrl: publicOfferUrl(item.id),
      buyNowUrl: publicBuyNowUrl(item.id),
      starterOfferUrl: publicStarterOfferUrl(item.id),
      instantCheckoutUrl: publicInstantCheckoutUrl(item.id),
      rescueOfferUrl: publicRescueOfferUrl(item.id),
      starterPrice: starterOfferPrice(item),
      sampleUrl: publicSamplePageUrl(item.id),
      sampleCloseUrl: publicSampleCloseUrl(item.id),
      salesAssistantUrl: publicSalesAssistantUrl(item.id),
      objectionPages: objectionPagesFor(item).map((page) => ({
        intent: page.intent,
        url: publicObjectionPageUrl(page),
      })).slice(0, 2),
      questionPages: buyerQuestionPagesFor(item).map((page) => ({
        intent: page.intent,
        url: publicBuyerQuestionPageUrl(page),
      })).sort((a, b) => (a.intent === "payment-steps" ? -1 : b.intent === "payment-steps" ? 1 : 0)).slice(0, 2),
      purchaseIntentPages: compactFeedPages(
        purchaseIntentPagesFor(item).map((page) => ({ ...page, url: publicPurchaseIntentPageUrl(page) })),
        ["starter-first", "payment-remark"]
      ),
      demandCapturePages: compactFeedPages(
        demandCapturePagesFor(item).map((page) => ({ ...page, url: publicDemandCaptureUrl(page) })),
        ["wechat-remark", "urgent-delivery"]
      ),
      utilityIntentPages: compactFeedPages(
        utilityIntentPagesFor(item).map((page) => ({ ...page, url: publicUtilityIntentUrl(page) })),
        ["fit-calculator", "starter-builder"]
      ),
      leadToolUrl: publicLeadToolUrl(item.id),
      previewUrl: toPublicUrl(`/delivery-preview/${encodeURIComponent(item.id)}.md`),
      checkoutApi: toPublicUrl("/api/checkouts"),
      acquisitionPages: compactFeedPages(
        seoPagesFor(item).map((page) => ({ ...page, url: seoPageUrl(page) })),
        ["tonight-delivery", "cheap-alternative"]
      ),
      promos: (item.promos || promoFor(item)).map((promo) => ({
        channel: promo.channel,
        trackingUrl: toPublicUrl(promo.url),
      })),
    })),
  };
}

function rssXml(lab) {
  const publishTasks = publishTasksForLab(lab);
  const syndicationPages = publishedSyndicationPages();
  const hubPages = hubPagesForLab(lab);
  const dealItems = [
    `<item>
  <guid>deals-today</guid>
  <title>今日最值得买的现成交付包</title>
  <link>${escapeXml(publicTodayDealsUrl())}</link>
  <description>程序按机会信号、访问、点击、checkout 和付款数据自动排序出的今日主推成交入口。</description>
</item>`,
    ...lab.map(
      (item) => `<item>
  <guid>buy-now-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`直接购买：${item.title}`)}</title>
  <link>${escapeXml(publicBuyNowUrl(item.id))}</link>
  <description>${escapeXml(`¥${item.price} 购买 ${item.delivery}，点击后生成唯一付款备注。`)}</description>
</item>`
    ),
    ...lab.map(
      (item) => `<item>
  <guid>starter-offer-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`低价入门：${item.title}`)}</title>
  <link>${escapeXml(publicStarterOfferUrl(item.id))}</link>
  <description>${escapeXml(`¥${starterOfferPrice(item)} 先买入门版，用更低门槛验证 ${item.delivery} 是否适合。`)}</description>
</item>`
    ),
    ...lab.map(
      (item) => `<item>
  <guid>instant-checkout-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`一屏付款：${item.title}`)}</title>
  <link>${escapeXml(publicInstantCheckoutUrl(item.id))}</link>
  <description>${escapeXml(`低价入门页仍无 checkout 时自动切换的一屏付款入口：¥${starterOfferPrice(item)} 入门版。`)}</description>
</item>`
    ),
    ...lab.map(
      (item) => `<item>
  <guid>rescue-offer-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`自动挽回：${item.title}`)}</title>
  <link>${escapeXml(publicRescueOfferUrl(item.id))}</link>
  <description>${escapeXml(`曝光无成交时自动导向的低阻力成交页：¥${starterOfferPrice(item)} 入门版或 ¥${item.price} 完整包。`)}</description>
</item>`
    ),
    ...lab.map(
      (item) => `<item>
  <guid>sales-assistant-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`自动销售助手：${item.title}`)}</title>
  <link>${escapeXml(publicSalesAssistantUrl(item.id))}</link>
  <description>${escapeXml(`自动回答${item.buyer}购买前的问题，高意图时直接生成付款备注。`)}</description>
</item>`
    ),
    ...lab.map(
      (item) => `<item>
  <guid>sample-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`免费样例：${item.title}`)}</title>
  <link>${escapeXml(publicSamplePageUrl(item.id))}</link>
  <description>${escapeXml(`程序自动生成 ${item.delivery} 的免费样例，降低信任成本后导向完整包付款。`)}</description>
</item>`
    ),
    ...lab.map(
      (item) => `<item>
  <guid>sample-close-${escapeXml(item.id)}</guid>
  <title>${escapeXml(`样例后购买：${item.title}`)}</title>
  <link>${escapeXml(publicSampleCloseUrl(item.id))}</link>
  <description>${escapeXml(`免费样例有访问但未成交时，程序自动生成更强的样例后成交页。`)}</description>
</item>`
    ),
    ...lab.flatMap((item) =>
      objectionPagesFor(item).map(
        (page) => `<item>
  <guid>objection-${escapeXml(page.slug)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(publicObjectionPageUrl(page))}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
      )
    ),
    ...lab.flatMap((item) =>
      buyerQuestionPagesFor(item).map(
        (page) => `<item>
  <guid>question-${escapeXml(page.slug)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(publicBuyerQuestionPageUrl(page))}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
      )
    ),
    ...lab.flatMap((item) =>
      purchaseIntentPagesFor(item).map(
        (page) => `<item>
  <guid>intent-${escapeXml(page.slug)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(publicPurchaseIntentPageUrl(page))}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
      )
    ),
    ...lab.flatMap((item) =>
      demandCapturePagesFor(item).map(
        (page) => `<item>
  <guid>demand-${escapeXml(page.slug)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(publicDemandCaptureUrl(page))}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
      )
    ),
    ...lab.flatMap((item) =>
      utilityIntentPagesFor(item).map(
        (page) => `<item>
  <guid>utility-${escapeXml(page.slug)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(publicUtilityIntentUrl(page))}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
      )
    ),
  ];
  const productItems = lab.map(
    (item) => `<item>
  <guid>${escapeXml(item.id)}</guid>
  <title>${escapeXml(item.title)}</title>
  <link>${escapeXml(publicOfferUrl(item.id))}</link>
  <description>${escapeXml(`${item.promise} 价格：¥${item.price}。交付：${item.delivery}`)}</description>
</item>`
  );
  const acquisitionItems = lab.flatMap((item) =>
    [
      {
        slug: `tool-${item.id}`,
        title: `${item.pain} 自测工具`,
        summary: `免费诊断 ${item.buyer} 是否该购买 ${item.delivery}，完成后按意图导向付费 checkout。`,
        url: publicLeadToolUrl(item.id),
      },
      {
        slug: `sample-${item.id}`,
        title: `免费样例：${item.title}`,
        summary: `程序自动生成 ${item.delivery} 的免费样例，降低信任成本后导向完整包付款。`,
        url: publicSamplePageUrl(item.id),
      },
      {
        slug: `sample-close-${item.id}`,
        title: `样例后购买：${item.title}`,
        summary: `样例访问热但没有 checkout 时，程序自动导向这个更强成交承接页。`,
        url: publicSampleCloseUrl(item.id),
      },
      ...seoPagesFor(item).map((page) => ({ ...page, url: seoPageUrl(page) })),
    ].map(
      (page) => `<item>
  <guid>${escapeXml(page.slug)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(page.url)}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
    )
  );
  const promotionItems = publishTasks.map(
    (task) => `<item>
  <guid>owned-${escapeXml(task.id)}</guid>
  <title>${escapeXml(task.label)}</title>
  <link>${escapeXml(promotionPageUrl(task))}</link>
  <description>${escapeXml(task.text.slice(0, 220))}</description>
</item>`
  );
  const syndicationItems = syndicationPages.map(
    (page) => `<item>
  <guid>syndication-${escapeXml(page.taskId)}</guid>
  <title>${escapeXml(`${page.label} 自有分发页：${page.experimentId}`)}</title>
  <link>${escapeXml(page.url)}</link>
  <description>${escapeXml(String(page.text || "程序已发布到自有站点的可索引推广入口。").slice(0, 220))}</description>
</item>`
  );
  const hubItems = hubPages.map(
    (page) => `<item>
  <guid>hub-${escapeXml(page.kind)}-${escapeXml(page.id)}</guid>
  <title>${escapeXml(page.title)}</title>
  <link>${escapeXml(page.url)}</link>
  <description>${escapeXml(page.summary)}</description>
</item>`
  );
  const items = [...dealItems, ...productItems, ...acquisitionItems, ...hubItems, ...promotionItems, ...syndicationItems].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Autonomous Money Lab 商品实验</title>
  <link>${escapeXml(toPublicUrl("/"))}</link>
  <description>自动生成的可售数字商品、长尾获客页、追踪链接和交付预览。</description>
${items}
</channel>
</rss>
`;
}

function sitemapXml(lab) {
  const lastModified = new Date().toISOString().slice(0, 10);
  const urls = publicDiscoveryUrls();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc><lastmod>${lastModified}</lastmod></url>`).join("\n")}
</urlset>
`;
}

function robotsTxt() {
  return `User-agent: *
Allow: /
Sitemap: ${toPublicUrl("/sitemap.xml")}
`;
}

function indexNowKey() {
  const adapters = loadAdapters();
  if (adapters.search?.indexNowKey) return adapters.search.indexNowKey;
  const existing = readJsonFile("indexnow.json", null);
  if (existing?.key) return existing.key;
  return crypto.randomBytes(16).toString("hex");
}

function writeDistributionFiles(lab) {
  const key = indexNowKey();
  const homeUrl = toPublicUrl("/");
  const title = "LifeYouMe 实用工具箱";
  const description = "先免费生成和预览，确认结果适合自己后，再付费下载整理好的完整文件。";
  const products = PRODUCT_MATRIX.filter((product) => product.status === "ready").map((product) => ({
    id: product.id,
    title: product.title,
    description: product.promise,
    price: product.price,
    url: toPublicUrl(product.path),
  }));
  const feed = {
    version: 1,
    title,
    description,
    homeUrl,
    updatedAt: new Date().toISOString(),
    freeTools: [],
    presetTools: productImagePresetPages().map((page) => ({
      title: page.title,
      description: page.description,
      url: toPublicUrl(`/presets/${page.slug}.html`),
    })),
    products,
    guides: CONSUMER_EVIDENCE_GUIDES.map((guide) => ({
      title: guide.title,
      description: guide.description,
      url: consumerEvidenceGuideUrl(guide),
    })),
  };
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${escapeXml(title)}</title>
  <link>${escapeXml(homeUrl)}</link>
  <description>${escapeXml(description)}</description>
  ${products.map((product) => `<item><guid>${escapeXml(product.id)}</guid><title>${escapeXml(product.title)}</title><link>${escapeXml(product.url)}</link><description>${escapeXml(product.description)}</description></item>`).join("\n  ")}
  ${CONSUMER_EVIDENCE_GUIDES.map((guide) => `<item><guid>guide-${escapeXml(guide.slug)}</guid><title>${escapeXml(guide.title)}</title><link>${escapeXml(consumerEvidenceGuideUrl(guide))}</link><description>${escapeXml(guide.description)}</description></item>`).join("\n  ")}
  ${productImagePresetPages().map((page) => `<item><guid>${escapeXml(page.slug)}</guid><title>${escapeXml(page.title)}</title><link>${escapeXml(toPublicUrl(`/presets/${page.slug}.html`))}</link><description>${escapeXml(page.description)}</description></item>`).join("\n  ")}
</channel></rss>
`;
  fs.writeFileSync(path.join(DIST_DIR, "feed.json"), JSON.stringify(feed, null, 2));
  fs.writeFileSync(path.join(DIST_DIR, "rss.xml"), rss);
  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemapXml(lab));
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), robotsTxt());
  fs.writeFileSync(path.join(DIST_DIR, `${key}.txt`), key);
  writeJsonFile("indexnow.json", { key, keyLocation: toPublicUrl(`/${key}.txt`), updatedAt: new Date().toISOString() });
}

function removePathWithRetry(target, { recursive = true, force = true, retries = 5 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.rmSync(target, { recursive, force });
      return;
    } catch (error) {
      if (!["ENOTEMPTY", "EBUSY", "EPERM"].includes(error.code) || attempt === retries) throw error;
      const waitUntil = Date.now() + 25 * (attempt + 1);
      while (Date.now() < waitUntil) {}
    }
  }
}

function copyDir(source, target) {
  removePathWithRetry(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function cleanPublicGeneratedFiles() {
  for (const directory of ["admin", "app", "products", "guides", "delivery", "fulfillment", "offer", "delivery-preview", "seo", "tools", "career-tools", "samples", "sample-close", "sales", "objections", "questions", "intent", "demand", "utilities", "markets", "offer-types", "buy-now", "starter", "instant", "rescue", "deals", "promotions", "syndication"]) {
    removePathWithRetry(path.join(DIST_DIR, directory), { recursive: true, force: true });
  }
  if (fs.existsSync(DIST_DIR)) {
    for (const file of fs.readdirSync(DIST_DIR)) {
      if (/^[a-f0-9]{32}\.txt$/i.test(file)) removePathWithRetry(path.join(DIST_DIR, file), { recursive: false, force: true });
    }
  }
  removePathWithRetry(path.join(DIST_DIR, "wechat-contact.jpg"), { recursive: false, force: true });
}

function publishStaticSite() {
  return withSiteBuildLock(() => {
    if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) generateSite();
    copyDir(DIST_DIR, PUBLIC_SITE_DIR);
    const manifest = {
      target: "local-static",
      publishedAt: new Date().toISOString(),
      directory: PUBLIC_SITE_DIR,
      entry: path.join(PUBLIC_SITE_DIR, "index.html"),
      note: "本地静态发布已完成；外部平台发布需要账号授权。",
    };
    writeJsonFile("publish.json", manifest);
    return manifest;
  });
}

function collectStaticSiteFiles(directory = PUBLIC_SITE_DIR) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = path.relative(directory, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (["delivery", "fulfillment"].includes(relative.split("/")[0])) continue;
        walk(full);
      } else {
        const content = fs.readFileSync(full);
        files.push({
          path: relative,
          encoding: "base64",
          size: content.length,
          content: content.toString("base64"),
        });
      }
    }
  }
  if (fs.existsSync(directory)) walk(directory);
  return files;
}

function localDeployPublicUrl(deploy = {}, adapters = loadAdapters()) {
  return String(deploy.publicBaseUrl || adapters.publicBaseUrl || "").replace(/\/+$/, "");
}

async function checkEndpointReachable(url, headers = {}) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch (error) {
      resolve({ configured: true, reachable: false, url, error: error.message });
      return;
    }
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      {
        method: "GET",
        headers: {
          Accept: "application/json,text/plain,*/*",
          ...headers,
        },
        timeout: 800,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ configured: true, reachable: true, url, statusCode: res.statusCode }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("health check timed out")));
    req.on("error", (error) => resolve({ configured: true, reachable: false, url, error: error.message }));
    req.end();
  });
}

async function checkPublicBaseReachable(url, { probeUrl = "", timeoutMs = 1500, expectedText = "" } = {}) {
  const targetUrl = probeUrl || `${String(url || "").replace(/\/+$/, "")}/api/status`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const deadline = setTimeout(() => {
      req?.destroy?.();
      finish({ configured: Boolean(url), reachable: false, url, probeUrl: targetUrl, error: "public base probe deadline exceeded" });
    }, Math.max(250, Number(timeoutMs) || 1500));
    let req;
    let target;
    try {
      target = new URL(targetUrl);
    } catch (error) {
      finish({ configured: Boolean(url), reachable: false, url, probeUrl: targetUrl, error: error.message });
      return;
    }
    const requiredText = expectedText || (target.pathname === "/api/status" ? '"ok":true' : "");
    const transport = target.protocol === "https:" ? https : http;
    req = transport.request(
      target,
      {
        method: "GET",
        headers: { Accept: "text/html,application/json,text/plain,*/*" },
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (body.length < 8192) body += chunk;
        });
        res.on("end", () => {
          const statusOk = res.statusCode >= 200 && res.statusCode < 400;
          const contentOk = requiredText ? body.includes(requiredText) : true;
          finish({
            configured: true,
            reachable: statusOk && contentOk,
            url,
            probeUrl: targetUrl,
            statusCode: res.statusCode,
            contentVerified: requiredText ? contentOk : null,
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("public base probe timed out")));
    req.on("error", (error) => finish({ configured: true, reachable: false, url, probeUrl: targetUrl, error: error.message }));
    req.end();
  });
}

async function checkAdapterHealth() {
  const adapters = loadAdapters();
  const checks = [];
  const publicBase = String(adapters.publicBaseUrl || "").replace(/\/+$/, "");
  if (isPublicHttpUrl(publicBase)) {
    const shouldProbe = publicBaseNeedsProbe(publicBase, adapters);
    checks.push(
      shouldProbe
        ? {
            kind: "public-access",
            id: "public-base-url",
            temporaryTunnel: isTemporaryPublicTunnelUrl(publicBase),
            ...(await checkPublicBaseReachable(publicBase, { probeUrl: adapters.search?.publicProbeUrl || publicBase })),
          }
        : { kind: "public-access", id: "public-base-url", configured: true, reachable: true, url: publicBase, probed: false }
    );
  } else {
    checks.push({ kind: "public-access", id: "public-base-url", configured: false, reachable: false, url: publicBase });
  }
  for (const [channel, config] of Object.entries(adapters.channels || {})) {
    checks.push({ kind: "publish-channel", id: channel, ...(config.webhookUrl ? await checkEndpointReachable(config.webhookUrl, config.headers || {}) : { configured: false, reachable: false }) });
  }
  for (const [index, config] of (adapters.growthWebhooks || []).entries()) {
    checks.push({ kind: "growth-webhook", id: config.id || `growth:${index}`, ...(config.webhookUrl ? await checkEndpointReachable(config.webhookUrl, config.headers || {}) : { configured: false, reachable: false }) });
  }
  const growthOutbox = adapters.growthOutbox || {};
  if (growthOutbox.dir) {
    try {
      fs.mkdirSync(growthOutbox.dir, { recursive: true });
      fs.accessSync(growthOutbox.dir, fs.constants.W_OK);
      checks.push({ kind: "growth-outbox", id: "growth-outbox", configured: true, reachable: true, dir: growthOutbox.dir, local: true });
    } catch (error) {
      checks.push({ kind: "growth-outbox", id: "growth-outbox", configured: true, reachable: false, dir: growthOutbox.dir, local: true, error: error.message });
    }
  }
  const fulfillment = adapters.fulfillment || {};
  if (fulfillment.webhookUrl) {
    checks.push({ kind: "fulfillment", id: "fulfillment", ...(await checkEndpointReachable(fulfillment.webhookUrl, fulfillment.headers || {})) });
  } else if (fulfillment.outboxDir) {
    try {
      fs.mkdirSync(fulfillment.outboxDir, { recursive: true });
      fs.accessSync(fulfillment.outboxDir, fs.constants.W_OK);
      checks.push({ kind: "fulfillment", id: "fulfillment-outbox", configured: true, reachable: true, dir: fulfillment.outboxDir, local: true });
    } catch (error) {
      checks.push({ kind: "fulfillment", id: "fulfillment-outbox", configured: true, reachable: false, dir: fulfillment.outboxDir, local: true, error: error.message });
    }
  } else {
    checks.push({ kind: "fulfillment", id: "fulfillment", configured: false, reachable: false });
  }
  const deploy = adapters.deploy || {};
  if (deploy.webhookUrl) {
    checks.push({ kind: "deploy", id: "deploy", ...(await checkEndpointReachable(deploy.webhookUrl, deploy.headers || {})) });
  } else if (deploy.targetDir) {
    try {
      fs.mkdirSync(deploy.targetDir, { recursive: true });
      fs.accessSync(deploy.targetDir, fs.constants.W_OK);
      checks.push({ kind: "deploy", id: "deploy-target-dir", configured: true, reachable: true, targetDir: deploy.targetDir, local: true });
    } catch (error) {
      checks.push({ kind: "deploy", id: "deploy-target-dir", configured: true, reachable: false, targetDir: deploy.targetDir, local: true, error: error.message });
    }
  } else {
    checks.push({ kind: "deploy", id: "deploy", configured: false, reachable: false });
  }
  const payments = adapters.payments || {};
  if (payments.feedUrl) {
    checks.push({ kind: "payment-feed", id: "payments", ...(await checkEndpointReachable(payments.feedUrl, payments.feedSecret ? { Authorization: `Bearer ${payments.feedSecret}` } : {})) });
  } else if (payments.feedFile || payments.feedDir) {
    const target = payments.feedFile || payments.feedDir;
    try {
      const stat = fs.statSync(target);
      fs.accessSync(target, fs.constants.R_OK);
      checks.push({ kind: "payment-feed", id: payments.feedFile ? "payment-feed-file" : "payment-feed-dir", configured: true, reachable: true, path: target, local: true, files: payments.feedDir ? loadPaymentFeedFiles(payments).length : undefined, isDirectory: stat.isDirectory() });
    } catch (error) {
      checks.push({ kind: "payment-feed", id: payments.feedFile ? "payment-feed-file" : "payment-feed-dir", configured: true, reachable: false, path: target, local: true, error: error.message });
    }
  } else {
    checks.push({ kind: "payment-feed", id: "payments", configured: false, reachable: false });
  }
  const summary = {
    at: new Date().toISOString(),
    configured: checks.filter((item) => item.configured).length,
    reachable: checks.filter((item) => item.reachable).length,
    blocked: checks.filter((item) => item.configured && !item.reachable).length,
    missing: checks.filter((item) => !item.configured).length,
    checks,
  };
  writeJsonFile("adapter-health.json", summary);
  buildAdapterReadinessPlan({ health: summary, adapters });
  return summary;
}

async function deployStaticSite({ dryRun = false } = {}) {
  const adapters = loadAdapters();
  const deploy = adapters.deploy || {};
  const now = new Date().toISOString();
  if (deploy.publicBaseUrl && adapters.publicBaseUrl !== deploy.publicBaseUrl) {
    saveAdapters({ ...adapters, publicBaseUrl: deploy.publicBaseUrl });
  }
  const publish = publishStaticSite();
  const files = collectStaticSiteFiles(publish.directory);
  if (deploy.targetDir) {
    const publicUrl = localDeployPublicUrl(deploy, adapters);
    if (dryRun) {
      const summary = {
        at: now,
        status: "dry-run-ready",
        mode: "target-dir",
        targetDir: deploy.targetDir,
        files: files.length,
        publicBaseUrl: publicUrl,
      };
      writeJsonFile("last-deploy.json", summary);
      return summary;
    }
    try {
      copyDir(publish.directory, deploy.targetDir);
      const nextAdapters = publicUrl ? saveAdapters({ ...adapters, publicBaseUrl: publicUrl }) : adapters;
      const summary = {
        at: now,
        status: publicUrl ? "deployed" : "deployed-without-public-url",
        mode: "target-dir",
        targetDir: deploy.targetDir,
        files: files.length,
        publicBaseUrl: nextAdapters.publicBaseUrl || "",
        entry: path.join(deploy.targetDir, "index.html"),
      };
      writeJsonFile("last-deploy.json", summary);
      return summary;
    } catch (error) {
      const summary = {
        at: now,
        status: "failed",
        mode: "target-dir",
        targetDir: deploy.targetDir,
        error: error.message,
        files: files.length,
        publicBaseUrl: adapters.publicBaseUrl || "",
      };
      writeJsonFile("last-deploy.json", summary);
      return summary;
    }
  }
  if (!deploy.webhookUrl) {
    const summary = {
      at: now,
      status: "blocked",
      reason: "missing-deploy-webhook-or-target-dir",
      files: files.length,
      publicBaseUrl: adapters.publicBaseUrl || "",
    };
    writeJsonFile("last-deploy.json", summary);
    return summary;
  }
  if (dryRun) {
    const summary = {
      at: now,
      status: "dry-run-ready",
      endpoint: deploy.webhookUrl,
      files: files.length,
      publicBaseUrl: deploy.publicBaseUrl || adapters.publicBaseUrl || "",
    };
    writeJsonFile("last-deploy.json", summary);
    return summary;
  }
  try {
    const response = await postJson(deploy.webhookUrl, {
      type: "deploy-static-site",
      at: now,
      siteName: deploy.siteName || "autonomous-income-engine",
      files,
    });
    let body = {};
    try {
      body = JSON.parse(response.body || "{}");
    } catch {
      body = {};
    }
    const publicUrl = String(body.publicBaseUrl || body.url || deploy.publicBaseUrl || "").replace(/\/+$/, "");
    const nextAdapters = publicUrl ? saveAdapters({ ...adapters, publicBaseUrl: publicUrl }) : adapters;
    const summary = {
      at: now,
      status: publicUrl ? "deployed" : "deployed-without-public-url",
      endpoint: deploy.webhookUrl,
      statusCode: response.statusCode,
      files: files.length,
      publicBaseUrl: nextAdapters.publicBaseUrl || "",
    };
    writeJsonFile("last-deploy.json", summary);
    return summary;
  } catch (error) {
    const summary = {
      at: now,
      status: "failed",
      endpoint: deploy.webhookUrl,
      error: error.message,
      files: files.length,
      publicBaseUrl: adapters.publicBaseUrl || "",
    };
    writeJsonFile("last-deploy.json", summary);
    return summary;
  }
}

function buildPublishQueue(lab = [canonicalPublicProduct()]) {
  const existingById = Object.fromEntries(loadPublishQueue().map((task) => [task.id, task]));
  const tasks = publishTasksForLab(lab, existingById);
  writeJsonFile("publish-queue.json", tasks);
  return tasks;
}

function publishTasksForLab(lab = [canonicalPublicProduct()], existingById = {}) {
  const tasks = [];
  const trafficPlan = buildTrafficPlan({ lab });
  const allocationByExperiment = Object.fromEntries((trafficPlan.allocations || []).map((item) => [item.experimentId, item]));
  const resultByTaskId = publishResultsByTaskId();
  const publishedPayloadByTaskId = publishedGrowthOutboxPayloadsByTaskId();
  for (const experiment of lab) {
    const allocation = allocationByExperiment[experiment.id] || {};
    const channelPlanByChannel = Object.fromEntries((allocation.channels || []).map((item) => [item.channel, item]));
    for (const promo of experiment.promos || promoFor(experiment)) {
      if (promo.channel === "landing-page") continue;
      const id = `pub_${experiment.id}_${promo.channel}`;
      const existing = existingById[id] || {};
      const persistedResult = resultByTaskId[id] || {};
      const publishedPayload = publishedPayloadByTaskId[id] || {};
      const channelPlan = channelPlanByChannel[promo.channel] || {};
      const recommendedUrl = channelPlan.recommendedUrl || "";
      const previousRecommendedUrl = existing.recommendedUrl || publishedPayload.trackingUrl || persistedResult.recommendedUrl || recommendedUrl;
      const recommendationChanged = Boolean(
        existing.id &&
          recommendedUrl &&
          previousRecommendedUrl &&
          comparableUrlPath(previousRecommendedUrl) !== comparableUrlPath(recommendedUrl)
      );
      const shouldRepublish = recommendationChanged;
      const status = shouldRepublish ? "waiting-for-account-authorization" : persistedResult.status || existing.status || "waiting-for-account-authorization";
      tasks.push({
        ...existing,
        ...persistedResult,
        status,
        externalUrl: persistedResult.externalUrl || existing.externalUrl || "",
        publishedBy: persistedResult.publishedBy || existing.publishedBy || "",
        sentAt: persistedResult.sentAt || existing.sentAt || "",
        id,
        experimentId: experiment.id,
        channel: promo.channel,
        label: promo.label,
        priority: channelPlan.priority || allocation.score || 0,
        budget: allocation.budget || 1,
        channelStatus: channelPlan.status || "blocked",
        blockedReason: channelPlan.status === "blocked" ? channelPlan.reason : existing.blockedReason,
        opportunityId: experiment.opportunityId || "",
        opportunityKeyword: experiment.opportunityKeyword || "",
        recommendedVariantId: allocation.recommendedVariantId || null,
        recommendedHubPage: allocation.recommendedHubPage || null,
        recommendedSeoIntent: allocation.recommendedSeoIntent || null,
        recommendedUtilityIntent: allocation.recommendedUtilityIntent || null,
        recommendedSamplePage: allocation.recommendedSamplePage || null,
        recommendedUrl,
        recommendedReason: channelPlan.recommendedReason || "",
        republishReason: shouldRepublish ? `recommended-url-changed:${previousRecommendedUrl}->${recommendedUrl}` : existing.republishReason || "",
        trackingUrl: toPublicUrl(promo.url),
        text: promo.text,
        createdAt: existing.createdAt || new Date().toISOString(),
      });
    }
  }
  return tasks.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
}

function promotionPageUrl(task) {
  return toPublicUrl(`/promotions/${encodeURIComponent(task.channel)}/${encodeURIComponent(task.experimentId)}.html`);
}

function directBuyUrlForTask(task, publishUrl = {}) {
  const experimentId = task.experimentId || task.productId || "";
  if (!experimentId) return "";
  const variantId = publishUrl.variantId || task.recommendedVariantId || task.variantId || "";
  const source = `publish:${task.channel || "unknown"}`;
  const offer = publishUrl.offer || publishUrl.metrics?.offer || null;
  const variantPath = variantId ? `/${encodeURIComponent(variantId)}` : "";
  return toPublicUrl(
    `/buy/${encodeURIComponent(experimentId)}${variantPath}?source=${encodeURIComponent(source)}${offer === "starter" ? "&offer=starter" : ""}`
  );
}

function appendDirectBuyLink(text, buyUrl) {
  const body = String(text || "").trim();
  if (!buyUrl) return body;
  if (body.includes(buyUrl)) return body;
  const directLine = `直接购买并生成付款备注：${buyUrl}`;
  return body ? `${body}\n\n${directLine}` : directLine;
}

function promotionTaskUrls(lab = buildLab()) {
  return publishTasksForLab(lab).map((task) => promotionPageUrl(task));
}

function staticPaymentFallbackHtml(experiment, { amount = experiment.price, offer = null, label = "静态兜底付款" } = {}) {
  if (!experiment?.id) return "";
  const cleanAmount = positiveMoney(amount || experiment.price);
  const fallbackOffer = offer === "starter" ? "starter" : null;
  const remark = fallbackOffer ? `${experiment.id}#STARTER` : experiment.id;
  const formId = `static-payment-proof-${shortHash(`${experiment.id}:${remark}:${label}`)}`;
  return `<section class="pay card" data-static-payment-fallback>
      <div>
        <p class="eyebrow">${escapeHtml(label)} / 无 JS 也能付款</p>
        <h2>如果按钮或脚本失败，直接扫码付款 ¥${escapeHtml(String(cleanAmount))}</h2>
        <p>付款备注填：<strong>${escapeHtml(remark)}</strong></p>
        ${fallbackOffer ? `<p class="safe">这是入门版兜底付款；后台会识别 #STARTER，只按入门版金额与入门版交付处理。</p>` : ""}
        <p class="safe">这个兜底备注不会因为页面访问创建 checkout；只有真实付款通知里包含这个商品 ID、金额满足价格并带交易号时，程序才会自动创建订单并交付。</p>
      </div>
      <img src="/wechat-pay.jpg" alt="微信收款二维码" />
    </section>
    ${staticPaymentProofFormHtml({ formId, amount: cleanAmount, remark })}`;
}

function staticPaymentProofFormHtml({ formId, amount, remark } = {}) {
  const proofExample = `微信支付收款到账 ¥${amount} 备注 ${remark} 交易单号 wx123456`;
  return `<form id="${escapeHtml(formId)}" class="card static-payment-proof-form" data-static-payment-proof-form style="margin-top: 1rem;">
      <h2>已按这个静态备注付款？提交到账文本自动取货</h2>
      <p>如果没有自动回调，把微信到账通知文本粘贴到这里。必须包含金额、备注和交易单号；程序验证后自动创建订单和交付链接。</p>
      <textarea name="text" rows="5" style="width: 100%;" placeholder="${escapeHtml(proofExample)}"></textarea>
      <p><button class="button" type="submit">我已付款，提交给程序匹配</button></p>
      <p data-static-payment-proof-result class="safe"></p>
    </form>
    <script>
      (() => {
        const form = document.getElementById(${JSON.stringify(formId)});
        if (!form) return;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const result = form.querySelector('[data-static-payment-proof-result]');
          const text = form.querySelector('textarea[name="text"]')?.value || '';
          if (result) result.textContent = '系统正在解析到账文本并匹配商品...';
          try {
            const response = await fetch('/api/wechat-notify', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ text })
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
              if (result) result.textContent = payload.error || '付款文本未通过匹配，请确认金额、备注和交易单号。';
              return;
            }
            const url = payload.payment?.delivery?.deliveryUrl || payload.payment?.order?.deliveryUrl;
            if (url) {
              if (result) result.textContent = '付款已匹配，正在打开交付文件...';
              window.location.href = url;
              return;
            }
            if (result) result.textContent = '已匹配，但交付链接还未生成，请稍后刷新。';
          } catch (error) {
            if (result) result.textContent = '提交失败，请稍后重试。';
          }
        });
      })();
    </script>`;
}

function directCheckoutSectionHtml({ experimentId = "", variantId = "", source = "direct-page", title = "直接付款", cta = "直接生成付款备注", offer = null, amount = null } = {}) {
  if (!experimentId) return "";
  const checkoutOffer = offer === "starter" ? "starter" : null;
  const checkoutAmount = positiveMoney(amount);
  const sessionKey = `direct-checkout-session:${source}:${experimentId}:${variantId || "default"}:${checkoutOffer || "full"}`;
  const buyUrl = `/buy/${encodeURIComponent(experimentId)}${variantId ? `/${encodeURIComponent(variantId)}` : ""}?source=${encodeURIComponent(source)}${checkoutOffer ? `&offer=${encodeURIComponent(checkoutOffer)}` : ""}`;
  return `<section id="direct-pay" class="pay card">
      <div>
        <p class="eyebrow">直接成交入口 / ${escapeHtml(source)}</p>
        <h2>${escapeHtml(title)}</h2>
        <p>付款备注：<strong data-direct-payment-remark>正在生成本次购买专属备注...</strong></p>
        <p data-direct-checkout-status></p>
        <p class="safe">只有明确点击下面的购买按钮，系统才会创建 checkout；浏览、滚动、触摸和搜索爬虫都不会产生待支付记录。付款匹配后自动发货。</p>
        <p class="actions"><a class="button" href="#direct-pay" data-direct-create-checkout>${escapeHtml(cta)}</a><a class="button ghost" href="${escapeHtml(buyUrl)}">打开购买确认页</a></p>
      </div>
      <img src="/wechat-pay.jpg" alt="微信收款二维码" />
    </section>
    <script>
      (() => {
        const directExperimentId = ${JSON.stringify(experimentId)};
        const directVariantId = ${JSON.stringify(variantId || null)};
        const directSource = ${JSON.stringify(source)};
        const directOffer = ${JSON.stringify(checkoutOffer)};
        const directAmount = ${JSON.stringify(checkoutAmount || null)};
        const directSessionKey = ${JSON.stringify(sessionKey)};
        let directCheckoutReady = null;
        function getDirectCheckoutSessionId() {
          try {
            let value = localStorage.getItem(directSessionKey);
            if (!value) {
              value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
              localStorage.setItem(directSessionKey, value);
            }
            return value;
          } catch (error) {
            return 'direct-session-' + Date.now() + '-' + Math.random().toString(36).slice(2);
          }
        }
        async function ensureDirectCheckout() {
          if (directCheckoutReady) return directCheckoutReady;
          const button = document.querySelector('[data-direct-create-checkout]');
          const status = document.querySelector('[data-direct-checkout-status]');
          if (button) button.textContent = '准备付款信息...';
          if (status) status.textContent = '系统正在生成唯一付款备注...';
          try {
            const response = await fetch('/api/checkouts', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                experimentId: directExperimentId,
                variantId: directVariantId,
                source: directSource,
                offer: directOffer,
                amount: directAmount,
                leadSessionId: getDirectCheckoutSessionId()
              })
            });
            const data = await response.json();
            if (!data.ok) throw new Error(data.error || 'checkout failed');
            directCheckoutReady = data.checkout;
            document.querySelector('[data-direct-payment-remark]').textContent = data.checkout.paymentInstruction;
            if (status && data.checkout.statusUrl) status.innerHTML = '<a href="' + data.checkout.statusUrl + '">打开订单状态页，付款后自动取货</a>';
            if (button) button.textContent = '查看付款信息';
            return directCheckoutReady;
          } catch (error) {
            if (button) button.textContent = '生成失败，重试';
            if (status) status.textContent = '付款信息生成失败，请点击按钮重试。';
            throw error;
          }
        }
        document.querySelector('[data-direct-create-checkout]')?.addEventListener('click', async (event) => {
          event.preventDefault();
          fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({type:'click',experimentId:directExperimentId,variantId:directVariantId,channel:'direct-checkout:' + directSource})}).catch(()=>{});
          try {
            await ensureDirectCheckout();
            location.hash = 'direct-pay';
          } catch (error) {
            alert(error.message);
          }
        });
      })();
    </script>`;
}

function syndicationPagesFromResultFiles() {
  const adapters = loadAdapters();
  const resultsDir = adapters.growthOutbox?.resultsDir || "";
  if (!resultsDir || !fs.existsSync(resultsDir)) return [];
  const pages = [];
  for (const name of fs.readdirSync(resultsDir).sort()) {
    const full = path.join(resultsDir, name);
    if (!fs.statSync(full).isFile() || !/\.json$/i.test(name)) continue;
    try {
      const item = readJsonPath(full);
      if (item.status !== "published" || !isPublicHttpUrl(item.externalUrl)) continue;
      pages.push({
        taskId: item.taskId || path.basename(name, ".json"),
        experimentId: item.experimentId || "",
        channel: item.channel || "",
        label: item.label || item.channel || "自有分发页",
        url: canonicalOwnedSyndicationUrlFromTask({
          taskId: item.taskId || path.basename(name, ".json"),
          channel: item.channel || "",
          fallbackUrl: item.externalUrl,
        }),
        originalUrl: item.externalUrl,
        text: item.text || "",
      });
    } catch {
      continue;
    }
  }
  return pages;
}

function publishResultsByTaskId() {
  const adapters = loadAdapters();
  const resultsDir = adapters.growthOutbox?.resultsDir || "";
  const byTaskId = {};
  if (!resultsDir || !fs.existsSync(resultsDir)) return byTaskId;
  for (const name of fs.readdirSync(resultsDir).sort()) {
    const full = path.join(resultsDir, name);
    if (!fs.statSync(full).isFile() || !/\.json$/i.test(name)) continue;
    try {
      const item = readJsonPath(full);
      const taskId = item.taskId || item.id || item.publishTaskId || "";
      const status = normalizeResultStatus(item.status, item.error ? "failed" : "sent");
      const externalUrl = item.externalUrl || item.url || item.publishedUrl || "";
      if (!taskId || status !== "sent" || !isPublicHttpUrl(externalUrl)) continue;
      byTaskId[taskId] = {
        status: "sent",
        externalUrl,
        publishedBy: item.workerId || item.publisher || "growth-results",
        sentAt: item.publishedAt || item.at || "",
      };
    } catch {
      continue;
    }
  }
  return byTaskId;
}

function publishedGrowthOutboxPayloadsByTaskId(adapters = loadAdapters()) {
  const dir = adapters.growthOutbox?.dir || "";
  const byTaskId = {};
  if (!dir || !fs.existsSync(dir)) return byTaskId;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.published\.json$/i.test(name)) continue;
    const file = path.join(dir, name);
    if (!fs.statSync(file).isFile()) continue;
    try {
      const payload = readJsonPath(file);
      const taskId = payload.taskId || payload.id || payload.publishTaskId || "";
      if (!taskId) continue;
      const priority = payload.type === "optimization-republish" || payload.republishSource ? 2 : 1;
      const previous = byTaskId[taskId];
      if (!previous || priority >= previous.priority) byTaskId[taskId] = { ...payload, file, priority };
    } catch {
      continue;
    }
  }
  return byTaskId;
}

function publishedSyndicationPages() {
  const byUrl = new Map();
  for (const page of syndicationPagesFromResultFiles()) {
    byUrl.set(page.url, page);
  }
  for (const page of loadPublishQueue()
    .filter((task) => task.status === "sent" && isPublicHttpUrl(task.externalUrl))
    .map((task) => ({
      taskId: task.id,
      experimentId: task.experimentId || "",
      channel: task.channel || "",
      label: task.label || task.channel || "自有分发页",
      url: canonicalOwnedSyndicationUrlFromTask({
        taskId: task.id,
        channel: task.channel || "",
        fallbackUrl: task.externalUrl,
      }),
      originalUrl: task.externalUrl,
      text: task.text || "",
    }))) {
    byUrl.set(page.url, { ...(byUrl.get(page.url) || {}), ...page });
  }
  return [...byUrl.values()];
}

function promotionPageHtml(task) {
  const variantId = task.recommendedVariantId || task.optimizedVariantId || "proof";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`${task.label}：${task.experimentId}`)}</title>
  <meta name="description" content="${escapeHtml(task.text.slice(0, 140))}" />
  <link rel="canonical" href="${escapeHtml(promotionPageUrl(task))}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <article class="card">
      <p class="eyebrow">站内自动发布 / ${escapeHtml(task.channel)}</p>
      <h1>${escapeHtml(task.label)}</h1>
      <p class="safe">这是程序从发布队列自动生成的公开推广页。部署到公网后，它会作为自有流量入口被 sitemap、RSS 和搜索提交发现。</p>
      <pre>${escapeHtml(task.text)}</pre>
      <p class="actions">
        <a class="button" href="${escapeHtml(task.trackingUrl)}">打开带追踪的售卖页</a>
        <a class="button ghost" href="/offer/${encodeURIComponent(task.experimentId)}.html">直接查看商品</a>
      </p>
    </article>
    ${directCheckoutSectionHtml({
      experimentId: task.experimentId,
      variantId,
      source: `promotion:${task.channel}`,
      title: `${task.label}：直接生成付款备注`,
      cta: "在这个推广页直接生成付款备注",
      autostart: false,
      engagementAutostart: true,
    })}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(task.experimentId)},channel:${JSON.stringify(`owned-promotion:${task.channel}`)}})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function exportLocalPublishDrafts(tasks = loadPublishQueue(), directory = PUBLIC_SITE_DIR) {
  const draftsDir = path.join(directory, "promotions");
  fs.mkdirSync(draftsDir, { recursive: true });
  const exported = [];
  const now = new Date().toISOString();
  for (const task of tasks) {
    const channelDir = path.join(draftsDir, task.channel);
    fs.mkdirSync(channelDir, { recursive: true });
    const file = path.join(channelDir, `${task.experimentId}.md`);
    const pageFile = path.join(channelDir, `${task.experimentId}.html`);
    fs.writeFileSync(
      file,
      `# ${task.label} 发布草稿

状态：等待外部账号授权后自动发布
实验：${task.experimentId}
渠道：${task.channel}
追踪链接：${task.trackingUrl}

## 文案

${task.text}
`
    );
    fs.writeFileSync(pageFile, promotionPageHtml(task));
    exported.push({
      ...task,
      status: task.status === "sent" ? "sent" : "local-draft-exported",
      draftFile: file,
      ownedPromotionUrl: promotionPageUrl(task),
      ownedPromotionFile: pageFile,
      exportedAt: now,
    });
  }
  writeJsonFile("publish-queue.json", exported);
  return exported;
}

function publishableTaskStatuses() {
  return ["waiting-for-account-authorization", "local-draft-exported", "failed", "dry-run-ready", "claimed"];
}

function refreshPublishTaskRouting(task) {
  if (!task?.experimentId) return task;
  const experiment = knownExperiments().find((item) => item.id === task.experimentId);
  if (!experiment) return task;
  const plan = buildTrafficPlan({ lab: [experiment] });
  const allocation = (plan.allocations || []).find((item) => item.experimentId === task.experimentId);
  const channelPlan = (allocation?.channels || []).find((item) => item.channel === task.channel);
  if (!allocation || !channelPlan) return task;
  return {
    ...task,
    priority: channelPlan.priority || allocation.score || task.priority || 0,
    budget: allocation.budget || task.budget || 1,
    channelStatus: channelPlan.status || task.channelStatus || "",
    blockedReason: channelPlan.status === "blocked" ? channelPlan.reason : task.blockedReason,
    recommendedVariantId: allocation.recommendedVariantId || task.recommendedVariantId || null,
    recommendedHubPage: allocation.recommendedHubPage || null,
    recommendedSeoIntent: allocation.recommendedSeoIntent || null,
    recommendedUtilityIntent: allocation.recommendedUtilityIntent || null,
    recommendedSamplePage: allocation.recommendedSamplePage || null,
    recommendedUrl: channelPlan.recommendedUrl || task.recommendedUrl || "",
    recommendedReason: channelPlan.recommendedReason || task.recommendedReason || "",
  };
}

function claimPublishTasks({ limit = 10, channel = null, workerId = "external-publisher" } = {}) {
  const queue = loadPublishQueue().sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const now = new Date().toISOString();
  const picked = [];
  const max = Math.max(1, Math.min(50, Number(limit) || 10));
  for (const task of queue) {
    if (picked.length >= max) break;
    if (task.status === "sent") continue;
    if (channel && task.channel !== channel) continue;
    if (!publishableTaskStatuses().includes(task.status)) continue;
    Object.assign(task, refreshPublishTaskRouting(task));
    task.status = "claimed";
    task.claimedAt = now;
    task.claimedBy = workerId;
    delete task.blockedReason;
    picked.push({
      id: task.id,
      experimentId: task.experimentId,
      channel: task.channel,
      label: task.label,
      priority: task.priority || 0,
      budget: task.budget || 1,
      opportunityKeyword: task.opportunityKeyword || "",
      recommendedVariantId: task.recommendedVariantId || null,
      recommendedHubPage: task.recommendedHubPage || null,
      recommendedSeoIntent: task.recommendedSeoIntent || null,
      recommendedUtilityIntent: task.recommendedUtilityIntent || null,
      recommendedSamplePage: task.recommendedSamplePage || null,
      recommendedUrl: task.recommendedUrl || "",
      recommendedReason: task.recommendedReason || "",
      trackingUrl: task.trackingUrl,
      text: task.text,
      claimedAt: task.claimedAt,
    });
  }
  writeJsonFile("publish-queue.json", queue);
  return picked;
}

function recordPublishResult({ taskId, status = "sent", externalUrl = "", error = "", workerId = "" } = {}) {
  if (!taskId) {
    const missing = new Error("taskId is required");
    missing.statusCode = 400;
    throw missing;
  }
  const queue = loadPublishQueue();
  const task = queue.find((item) => item.id === taskId);
  if (!task) {
    const notFound = new Error("publish task not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  const now = new Date().toISOString();
  if (status === "sent" || status === "published") {
    task.status = "sent";
    task.sentAt = now;
    task.externalUrl = externalUrl || task.externalUrl || "";
    task.publishedBy = workerId || task.claimedBy || "external-publisher";
    delete task.lastError;
    delete task.blockedReason;
    appendEvent({
      type: "publish-sent",
      experimentId: task.experimentId,
      channel: task.channel,
      externalUrl: task.externalUrl,
      taskId: task.id,
    });
  } else if (status === "failed") {
    task.status = "failed";
    task.lastError = error || "external publisher reported failure";
    task.lastTriedAt = now;
  } else {
    const invalid = new Error("status must be sent or failed");
    invalid.statusCode = 400;
    throw invalid;
  }
  writeJsonFile("publish-queue.json", queue);
  return task;
}

function recordPublishHandoff({ taskId, attempts = [], workerId = "" } = {}) {
  if (!taskId) {
    const missing = new Error("taskId is required");
    missing.statusCode = 400;
    throw missing;
  }
  const queue = loadPublishQueue();
  const task = queue.find((item) => item.id === taskId);
  if (!task) {
    const notFound = new Error("publish task not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  const now = new Date().toISOString();
  task.status = "handed-off";
  task.handedOffAt = now;
  task.handedOffBy = workerId || task.claimedBy || "local-outbox";
  task.publishAttempts = attempts;
  task.handoffFiles = attempts.filter((item) => item.outboxFile).map((item) => item.outboxFile);
  delete task.blockedReason;
  delete task.lastError;
  appendEvent({
    type: "publish-handed-off",
    experimentId: task.experimentId,
    channel: task.channel,
    taskId: task.id,
    targetCount: attempts.length,
  });
  writeJsonFile("publish-queue.json", queue);
  return task;
}

function normalizeResultStatus(status, successDefault = "sent") {
  const value = String(status || successDefault).toLowerCase();
  if (["ok", "success", "sent", "published", "delivered", "done"].includes(value)) return "sent";
  if (["failed", "error", "blocked"].includes(value)) return "failed";
  return value;
}

function resolvePublishResultTaskId(payload = {}, queue = loadPublishQueue()) {
  const taskId = payload.taskId || payload.id || payload.publishTaskId || "";
  if (taskId && queue.some((task) => task.id === taskId)) return taskId;
  const experimentId = payload.experimentId || "";
  const channel = payload.channel || "";
  if (experimentId && channel) {
    const matched = queue.find((task) => task.experimentId === experimentId && task.channel === channel);
    if (matched) return matched.id;
  }
  return "";
}

function consumeGrowthResults({ dir = loadAdapters().growthOutbox?.resultsDir, dryRun = false } = {}) {
  const now = new Date().toISOString();
  if (!dir) {
    return { at: now, status: "blocked", reason: "missing-growth-results-dir", consumed: 0, failed: 0, results: [] };
  }
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  const queue = loadPublishQueue();
  for (const item of readJsonDirectory(dir)) {
    try {
      const payload = item.value || {};
      const originalTaskId = payload.taskId || payload.id || payload.publishTaskId || "";
      const taskId = resolvePublishResultTaskId(payload, queue);
      if (!taskId) {
        if (!originalTaskId) throw new Error("taskId is required");
        if (!dryRun) {
          archiveJsonFile(item.file, "stale");
        }
        results.push({
          file: item.file,
          taskId: originalTaskId,
          status: dryRun ? "dry-run-stale" : "stale",
          reason: "publish task is no longer in current queue",
        });
        continue;
      }
      const status = normalizeResultStatus(payload.status, payload.error ? "failed" : "sent");
      if (dryRun) {
        results.push({ file: item.file, taskId, originalTaskId, status: "dry-run-ready" });
        continue;
      }
      const updated = recordPublishResult({
        taskId,
        status,
        externalUrl: payload.externalUrl || payload.url || payload.publishedUrl || "",
        error: payload.error || payload.reason || "",
        workerId: payload.workerId || payload.publisher || "growth-results-consumer",
      });
      archiveJsonFile(item.file, "consumed");
      results.push({ file: item.file, taskId, originalTaskId, status: updated.status, externalUrl: updated.externalUrl || "" });
    } catch (error) {
      results.push({ file: item.file, status: "failed", error: error.message });
    }
  }
  return {
    at: now,
    status: "synced",
    dir,
    consumed: results.filter((item) => !["failed", "dry-run-ready", "stale", "dry-run-stale"].includes(item.status)).length,
    dryRunReady: results.filter((item) => item.status === "dry-run-ready").length,
    stale: results.filter((item) => item.status === "stale" || item.status === "dry-run-stale").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
}

function recordFulfillmentResult({ orderId, deliveryId = "", status = "sent", sentTo = "", externalMessageId = "", error = "", workerId = "" } = {}) {
  if (!orderId && !deliveryId) {
    const missing = new Error("orderId or deliveryId is required");
    missing.statusCode = 400;
    throw missing;
  }
  const normalized = normalizeResultStatus(status, error ? "failed" : "sent");
  const outbox = loadOutbox();
  const item = outbox.find((entry) => (deliveryId && entry.id === deliveryId) || (orderId && entry.orderId === orderId));
  if (!item) {
    const notFound = new Error("fulfillment task not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  const now = new Date().toISOString();
  if (normalized === "sent") {
    item.status = "sent";
    item.sentAt = item.sentAt || now;
    item.sentTo = sentTo || item.sentTo || "";
    item.externalMessageId = externalMessageId || item.externalMessageId || "";
    item.sentBy = workerId || item.sentBy || "fulfillment-results-consumer";
    delete item.lastError;
    delete item.blockedReason;
    writeJsonFile("outbox.json", outbox);
    markDelivered(item.orderId);
  } else if (normalized === "failed") {
    item.status = "failed";
    item.lastError = error || "external fulfillment sender reported failure";
    item.lastTriedAt = now;
    item.sentBy = workerId || item.sentBy || "fulfillment-results-consumer";
    writeJsonFile("outbox.json", outbox);
  } else {
    const invalid = new Error("status must be sent or failed");
    invalid.statusCode = 400;
    throw invalid;
  }
  return loadOutbox().find((entry) => entry.id === item.id) || item;
}

function consumeFulfillmentResults({ dir = loadAdapters().fulfillment?.resultsDir, dryRun = false } = {}) {
  const now = new Date().toISOString();
  if (!dir) {
    return { at: now, status: "blocked", reason: "missing-fulfillment-results-dir", consumed: 0, failed: 0, results: [] };
  }
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  for (const item of readJsonDirectory(dir)) {
    try {
      const payload = item.value || {};
      const orderId = payload.orderId || payload.id || "";
      const deliveryId = payload.deliveryId || "";
      if (!orderId && !deliveryId) throw new Error("orderId or deliveryId is required");
      const status = normalizeResultStatus(payload.status, payload.error ? "failed" : "sent");
      if (dryRun) {
        results.push({ file: item.file, orderId, deliveryId, status: "dry-run-ready" });
        continue;
      }
      const updated = recordFulfillmentResult({
        orderId,
        deliveryId,
        status,
        sentTo: payload.sentTo || payload.recipient || "",
        externalMessageId: payload.externalMessageId || payload.messageId || "",
        error: payload.error || payload.reason || "",
        workerId: payload.workerId || payload.sender || "fulfillment-results-consumer",
      });
      archiveJsonFile(item.file, "consumed");
      results.push({ file: item.file, orderId: updated.orderId, deliveryId: updated.id, status: updated.status });
    } catch (error) {
      results.push({ file: item.file, status: "failed", error: error.message });
    }
  }
  return {
    at: now,
    status: "synced",
    dir,
    consumed: results.filter((item) => item.status !== "failed" && item.status !== "dry-run-ready").length,
    dryRunReady: results.filter((item) => item.status === "dry-run-ready").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
}

function consumeResultInboxes({ dryRun = false } = {}) {
  const growth = consumeGrowthResults({ dryRun });
  const fulfillment = consumeFulfillmentResults({ dryRun });
  const summary = {
    at: new Date().toISOString(),
    dryRun,
    growth,
    fulfillment,
    consumed: (growth.consumed || 0) + (fulfillment.consumed || 0),
    dryRunReady: (growth.dryRunReady || 0) + (fulfillment.dryRunReady || 0),
    failed: (growth.failed || 0) + (fulfillment.failed || 0),
    blocked: [growth, fulfillment].filter((item) => item.status === "blocked").length,
  };
  writeJsonFile("last-result-sync.json", summary);
  return summary;
}

function reconcileLocalHandoffState() {
  const now = new Date().toISOString();
  const publishQueue = loadPublishQueue();
  let publishFixed = 0;
  for (const task of publishQueue) {
    const attempts = task.publishAttempts || [];
    const onlyLocalOutbox = attempts.length && attempts.every((item) => item.targetKind === "growth-outbox");
    if (task.status === "sent" && onlyLocalOutbox && !task.externalUrl) {
      task.status = "handed-off";
      task.handedOffAt = task.handedOffAt || task.sentAt || now;
      task.handoffFiles = attempts.map((item) => item.outboxFile).filter(Boolean);
      delete task.sentAt;
      publishFixed += 1;
    }
  }
  if (publishFixed) writeJsonFile("publish-queue.json", publishQueue);

  const outbox = loadOutbox();
  const orders = loadOrders();
  let fulfillmentFixed = 0;
  for (const item of outbox) {
    if (item.status === "sent" && item.fulfillmentOutboxFile && !item.externalMessageId) {
      item.status = "handed-off";
      item.handedOffAt = item.handedOffAt || item.sentAt || now;
      delete item.sentAt;
      const order = orders.find((entry) => entry.id === item.orderId && entry.status === "delivered");
      if (order && !order.externalMessageId) {
        order.status = "paid";
        delete order.deliveredAt;
      }
      fulfillmentFixed += 1;
    }
  }
  if (fulfillmentFixed) {
    writeJsonFile("outbox.json", outbox);
    writeJsonFile("orders.json", orders);
  }
  const summary = { at: now, publishFixed, fulfillmentFixed };
  writeJsonFile("last-handoff-reconcile.json", summary);
  return summary;
}

async function runLocalLoopOnce({ dryRun = false, executionQueueLimit = 20, publishAgentLimit = 10, localOnly = true, ensureService = false, servicePort = 4188 } = {}) {
  const serviceHealth = ensureService ? await ensureCheckoutService({ port: servicePort }) : loadServiceHealth();
  const reconcile = reconcileLocalHandoffState();
  const paymentSync = await syncPaymentFeed({ dryRun });
  const ownedSitePublisher = publishGrowthOutboxToOwnedSite({ dryRun });
  const resultSync = consumeResultInboxes({ dryRun });
  const fulfillment = await deliverPrepared({ dryRun });
  const executionQueueRun = await runExecutionQueue({
    dryRun,
    limit: executionQueueLimit,
    publishAgentLimit,
    localOnly,
  });
  const summary = {
    id: `local_loop_${Date.now()}`,
    at: new Date().toISOString(),
    dryRun,
    paymentSync,
    resultSync,
    fulfillment,
    executionQueueRun,
    serviceHealth,
    reconcile,
    ownedSitePublisher,
    paymentsCreated: paymentSync.created || 0,
    ownedPublished: ownedSitePublisher.published || 0,
    resultsConsumed: resultSync.consumed || 0,
    fulfilled: fulfillment.results.filter((item) => item.status === "sent").length,
    fulfillmentHandedOff: fulfillment.results.filter((item) => item.status === "handed-off").length,
    queueExecuted: executionQueueRun.executed || 0,
    queueBlocked: executionQueueRun.blocked || 0,
    queueFailed: executionQueueRun.failed || 0,
  };
  writeJsonFile("last-local-loop-run.json", summary);
  return summary;
}

function localLoopWatchDirectories(adapters = loadAdapters()) {
  return [
    { kind: "payment-inbox", dir: adapters.payments?.feedDir || "" },
    { kind: "growth-results", dir: adapters.growthOutbox?.resultsDir || "" },
    { kind: "fulfillment-results", dir: adapters.fulfillment?.resultsDir || "" },
  ].filter((item) => item.dir);
}

function startLocalLoopWatcher({ dryRun = false, debounceMs = 500, onRun = runLocalLoopOnce, unref = false } = {}) {
  const directories = localLoopWatchDirectories();
  const watchers = [];
  let timer = null;
  let running = null;
  let closed = false;

  const writeState = (state) => {
    const previous = loadLocalLoopWatcher() || {};
    const next = {
      ...previous,
      ...state,
      at: new Date().toISOString(),
      dryRun,
      directories,
    };
    writeJsonFile("local-loop-watcher.json", next);
    return next;
  };

  const run = (reason = "manual") => {
    if (closed) return Promise.resolve(null);
    if (running) {
      writeState({ status: "skipped-overlap", reason });
      return running;
    }
    writeState({ status: "running", reason });
    running = Promise.resolve()
      .then(() => onRun({ dryRun }))
      .then((summary) => {
        writeState({
          status: "idle",
          reason,
          lastRunId: summary?.id || "",
          lastRunAt: summary?.at || "",
          lastSummary: {
            paymentsCreated: summary?.paymentsCreated || 0,
            ownedPublished: summary?.ownedPublished || 0,
            resultsConsumed: summary?.resultsConsumed || 0,
            fulfilled: summary?.fulfilled || 0,
            queueExecuted: summary?.queueExecuted || 0,
            queueBlocked: summary?.queueBlocked || 0,
            queueFailed: summary?.queueFailed || 0,
          },
        });
        return summary;
      })
      .catch((error) => {
        writeState({ status: "failed", reason, error: error.message });
        throw error;
      })
      .finally(() => {
        running = null;
      });
    return running;
  };

  const schedule = (reason = "fs-change") => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run(reason).catch(() => {});
    }, Math.max(50, Number(debounceMs) || 500));
    if (unref) timer.unref?.();
  };

  for (const item of directories) {
    fs.mkdirSync(item.dir, { recursive: true });
    const watcher = fs.watch(item.dir, { persistent: true }, (eventType, filename) => {
      schedule(`${item.kind}:${eventType}:${filename || ""}`);
    });
    if (unref) watcher.unref?.();
    watchers.push(watcher);
  }

  writeState({ status: directories.length ? "watching" : "blocked", reason: directories.length ? "watchers-started" : "no-local-loop-directories" });

  return {
    directories,
    run,
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      writeState({ status: "closed", reason: "watcher-closed" });
    },
  };
}

function probeCheckoutService({ port = 4188, timeoutMs = 1500, path: pathname = "/api/status" } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        headers: { Accept: "application/json" },
      },
      (res) => {
        res.resume();
        const durationMs = Date.now() - startedAt;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: "up", port, statusCode: res.statusCode, durationMs });
          return;
        }
        resolve({ ok: false, status: "unhealthy", port, statusCode: res.statusCode, durationMs, error: `HTTP ${res.statusCode}` });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("probe timeout"));
    });
    req.on("error", (error) => {
      resolve({ ok: false, status: "down", port, durationMs: Date.now() - startedAt, error: error.message });
    });
  });
}

async function waitForCheckoutService({ port = 4188, timeoutMs = 8000, intervalMs = 250, probe = probeCheckoutService } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  while (Date.now() <= deadline) {
    lastProbe = await probe({ port, timeoutMs: Math.min(1500, Math.max(250, intervalMs * 4)) });
    if (lastProbe.ok) return lastProbe;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastProbe || { ok: false, status: "down", port, error: "probe timeout" };
}

async function ensureCheckoutService({ port = 4188, timeoutMs = 8000, logFile = path.join("/tmp", `autonomous-income-engine-${port}.log`), probe = probeCheckoutService, spawnProcess = spawn } = {}) {
  const before = await probe({ port });
  if (before.ok) {
    const previous = loadServiceHealth();
    return recordServiceHealthState({
      status: "up",
      port,
      pid: before.pid || (previous?.port === port ? previous.pid || null : null),
      source: "service-health-probe",
      probe: before,
      started: false,
      logFile,
    });
  }

  const out = fs.openSync(logFile, "a");
  const child = spawnProcess(process.execPath, [path.join(ROOT, "src", "server.js")], {
    cwd: ROOT,
    detached: true,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", out, out],
  });
  try {
    fs.closeSync(out);
  } catch {}
  child.unref?.();

  const after = await waitForCheckoutService({ port, timeoutMs, probe });
  return recordServiceHealthState({
    status: after.ok ? "restarted" : "failed",
    port,
    pid: child.pid || null,
    source: "service-health-supervisor",
    started: true,
    before,
    probe: after,
    logFile,
    error: after.ok ? "" : after.error || "service did not become healthy",
  });
}

function optimizedPublishUrlForTask(task) {
  const optimization = loadVariantOptimizations()
    .filter((item) => item.experimentId === task.experimentId && item.recommendedPublishUrl)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0];
  if (!optimization && task.recommendedUrl) {
    return {
      url: toPublicUrl(task.recommendedUrl),
      variantId: task.recommendedVariantId || null,
      variantLabel: task.recommendedHubPage?.title || task.recommendedSeoIntent?.title || task.recommendedUtilityIntent?.title || task.recommendedSamplePage?.title || "",
      metrics: task.recommendedHubPage || task.recommendedSeoIntent || task.recommendedUtilityIntent || task.recommendedSamplePage || null,
      reason: task.recommendedReason || "traffic-plan-recommended-url",
    };
  }
  return optimization
    ? {
        url: toPublicUrl(optimization.recommendedPublishUrl),
        variantId: optimization.variantId,
        variantLabel: optimization.variantLabel,
        metrics: optimization.metrics,
        reason: optimization.reason,
        recoveryUrls: optimization.recoveryUrls || [],
        checkoutIds: optimization.checkoutIds || [],
      }
    : {
        url: toPublicUrl(task.trackingUrl),
        variantId: null,
        variantLabel: "",
        metrics: null,
        reason: "",
        recoveryUrls: [],
        checkoutIds: [],
      };
}

function publishPayloadForTask(task, publishUrl, type = "publish") {
  const directBuyUrl = directBuyUrlForTask(task, publishUrl);
  return {
    type,
    channel: task.channel,
    experimentId: task.experimentId,
    taskId: task.id,
    trackingUrl: publishUrl.url,
    landingUrl: publishUrl.url,
    recommendedReason: publishUrl.reason || task.recommendedReason || "",
    directBuyUrl,
    buyUrl: directBuyUrl,
    checkoutEntryUrl: directBuyUrl,
    originalTrackingUrl: task.trackingUrl,
    optimizedVariantId: publishUrl.variantId,
    optimizedVariantLabel: publishUrl.variantLabel,
    optimizedVariantMetrics: publishUrl.metrics,
    optimizedReason: publishUrl.reason,
    recoveryUrls: publishUrl.recoveryUrls || [],
    checkoutRecoveryUrls: publishUrl.recoveryUrls || [],
    checkoutIds: publishUrl.checkoutIds || [],
    salesLinks: {
      landingUrl: publishUrl.url,
      directBuyUrl,
      recoveryUrls: publishUrl.recoveryUrls || [],
      originalTrackingUrl: task.trackingUrl,
    },
    originalText: task.text,
    text: appendDirectBuyLink(task.text, directBuyUrl),
  };
}

function writeGrowthOutboxTask(target, task, publishUrl, type = "publish") {
  fs.mkdirSync(target.dir, { recursive: true });
  const file = path.join(target.dir, `${task.id}.json`);
  const payload = {
    ...publishPayloadForTask(task, publishUrl, type),
    targetId: target.id,
    targetKind: target.kind,
    writtenAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function configuredGrowthOutboxTargetForChannel(channel, adapters = loadAdapters()) {
  const growthOutbox = adapters.growthOutbox || {};
  const channels = Array.isArray(growthOutbox.channels) && growthOutbox.channels.length ? growthOutbox.channels : ["*"];
  if (!growthOutbox.dir || (!channels.includes("*") && !channels.includes(channel))) return null;
  return {
    id: "growth-outbox",
    kind: "growth-outbox",
    dir: growthOutbox.dir,
    resultsDir: growthOutbox.resultsDir || "",
  };
}

function writeOptimizedGrowthOutboxPackages(experimentId, { source = "automatic-optimization", trigger = "", reason = "", dryRun = false } = {}) {
  if (!experimentId) return { status: "skipped", reason: "missing-experiment-id", packages: [] };
  const adapters = loadAdapters();
  const currentQueue = loadPublishQueue();
  let tasks = currentQueue.filter((task) => task.experimentId === experimentId && task.channel !== "landing-page");
  if (!tasks.length) {
    const experiment = knownExperiments().find((item) => item.id === experimentId);
    if (experiment) tasks = publishTasksForLab([experiment], Object.fromEntries(currentQueue.map((task) => [task.id, task])));
  }
  const packages = [];
  for (const task of tasks) {
    const target = configuredGrowthOutboxTargetForChannel(task.channel, adapters);
    if (!target) continue;
    const publishUrl = optimizedPublishUrlForTask(task);
    const payload = {
      ...publishPayloadForTask(task, publishUrl, "optimization-republish"),
      targetId: target.id,
      targetKind: target.kind,
      republishSource: source,
      optimizationTrigger: trigger,
      optimizationReason: reason,
      writtenAt: new Date().toISOString(),
    };
    const file = path.join(target.dir, `${task.id}.optimization.json`);
    packages.push({ taskId: task.id, channel: task.channel, file, publishUrl: publishUrl.url, variantId: publishUrl.variantId, payload });
    if (!dryRun) {
      fs.mkdirSync(target.dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    }
  }
  return {
    status: packages.length ? (dryRun ? "dry-run-ready" : "handed-off") : "skipped",
    reason: packages.length ? "" : "missing-growth-outbox-target",
    packages,
  };
}

function ownedSyndicationRelativePath(payload) {
  const channel = slug(payload.channel || "owned");
  const taskId = slug(payload.taskId || payload.id || shortHash(JSON.stringify(payload)));
  return path.join("syndication", channel, `${taskId}.html`);
}

function ownedSyndicationUrl(payload) {
  return toPublicUrl(`/${ownedSyndicationRelativePath(payload).replaceAll(path.sep, "/")}`);
}

function canonicalOwnedSyndicationUrlFromTask({ taskId = "", channel = "", fallbackUrl = "" } = {}) {
  const resolvedTaskId = taskId || (() => {
    try {
      const parsed = new URL(fallbackUrl);
      return path.basename(parsed.pathname, ".html");
    } catch {
      return "";
    }
  })();
  const resolvedChannel = channel || (() => {
    try {
      const parsed = new URL(fallbackUrl);
      const match = /^\/syndication\/([^/]+)\//i.exec(parsed.pathname);
      return match?.[1] || "";
    } catch {
      return "";
    }
  })();
  if (resolvedTaskId && resolvedChannel) return ownedSyndicationUrl({ taskId: resolvedTaskId, channel: resolvedChannel });
  return fallbackUrl;
}

function landingRouteKind(url = "") {
  const value = String(url || "");
  if (/\/instant\//.test(value)) return "instant";
  if (/\/starter\//.test(value)) return "starter";
  if (/\/buy-now\//.test(value)) return "buy-now";
  if (/\/utilities\//.test(value)) return "utility";
  if (/\/samples\//.test(value)) return "sample";
  if (/\/markets\/|\/offer-types\//.test(value)) return "hub";
  if (/\/seo\//.test(value)) return "seo";
  if (/\/rescue\//.test(value)) return "rescue";
  if (/\/offer\//.test(value)) return "offer";
  if (/\/t\//.test(value)) return "tracking";
  return value ? "other" : "missing";
}

function landingRouteCopy(url = "") {
  const kind = landingRouteKind(url);
  const copies = {
    instant: {
      title: "程序推荐入口：一屏付款页",
      cta: "打开一屏付款页",
      note: "低价入门页仍没有 checkout，程序把入口压缩到一屏，把价格、二维码、交付边界和付款备注生成入口放在一起。",
    },
    starter: {
      title: "程序推荐入口：低价入门页",
      cta: "打开低价入门页",
      note: "直购页已有访问但还没有 checkout，程序自动降门槛到入门价，先争取第一笔小额真实付款。",
    },
    "buy-now": {
      title: "程序推荐入口：直购成交页",
      cta: "打开直购页",
      note: "已有发布动作但没有 checkout，程序把入口切到更硬的直购页，减少从浏览到付款备注的距离。",
    },
    utility: {
      title: "程序推荐入口：免费工具页",
      cta: "打开免费工具",
      note: "当前真实流量不足，程序先把陌生流量导到可交互诊断/计算器；用户提交高意图场景后才生成唯一付款备注。",
    },
    sample: {
      title: "程序推荐入口：先看免费样例",
      cta: "先看免费样例",
      note: "当前还没有真实付款或高意图线索，程序先把冷启动流量导到免费样例，降低陌生人直接付款的阻力。",
    },
    hub: {
      title: "程序推荐入口：聚合成交入口",
      cta: "打开聚合入口",
      note: "这个品类入口已经有访问迹象，程序把后续流量集中到更容易承接比较和选择的聚合页。",
    },
    seo: {
      title: "程序推荐入口：长尾需求页",
      cta: "打开长尾需求页",
      note: "这个搜索意图页已经被识别为可承接流量，程序优先用它接住更明确的需求。",
    },
    rescue: {
      title: "程序推荐入口：挽回成交页",
      cta: "打开挽回成交页",
      note: "已有行为信号显示需要更强的成交解释，程序把入口切到挽回页。",
    },
    offer: {
      title: "程序推荐入口：成交页",
      cta: "打开成交页",
      note: "程序当前判断直接成交页更合适，会继续记录访问、checkout 和付款结果。",
    },
    tracking: {
      title: "程序推荐入口：追踪成交页",
      cta: "打开追踪页",
      note: "这是带渠道标记的追踪入口，程序会用后续行为数据继续改路由。",
    },
    other: {
      title: "程序推荐入口",
      cta: "打开推荐入口",
      note: "程序会记录这个入口的访问和成交信号，用于后续自动调整。",
    },
    missing: {
      title: "程序推荐入口",
      cta: "打开推荐入口",
      note: "当前发布包缺少推荐入口，程序会回退到站点首页。",
    },
  };
  return copies[kind] || copies.other;
}

function publishQueueRoutingSummary(publishQueue = loadPublishQueue()) {
  const counts = {
    instant: 0,
    starter: 0,
    "buy-now": 0,
    utility: 0,
    sample: 0,
    hub: 0,
    seo: 0,
    rescue: 0,
    offer: 0,
    tracking: 0,
    other: 0,
    missing: 0,
  };
  const examples = [];
  for (const task of publishQueue) {
    const optimized = optimizedPublishUrlForTask(task);
    const url = optimized.url || task.recommendedUrl || task.trackingUrl || "";
    const kind = landingRouteKind(url);
    counts[kind] = (counts[kind] || 0) + 1;
    if (examples.length < 8) {
      examples.push({
        taskId: task.id,
        experimentId: task.experimentId,
        channel: task.channel,
        kind,
        url,
        reason: optimized.reason || task.recommendedReason || "",
      });
    }
  }
  return {
    counts,
    examples,
    primary: Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "missing",
  };
}

function currentRoutingPayload(payload = {}, queueTask = {}) {
  const isOptimizationPayload = Boolean(payload.type === "optimization-republish" || payload.republishSource);
  const publishUrl =
    isOptimizationPayload && payload.trackingUrl
      ? {
          url: payload.trackingUrl,
          variantId: payload.optimizedVariantId || payload.variantId || queueTask.recommendedVariantId || "",
          variantLabel: payload.optimizedVariantLabel || "",
          metrics: payload.optimizedVariantMetrics || null,
          reason: payload.optimizedReason || payload.optimizationReason || payload.recommendedReason || "",
        }
      : optimizedPublishUrlForTask(queueTask);
  const directBuyUrl =
    isOptimizationPayload && (payload.directBuyUrl || payload.buyUrl || payload.checkoutEntryUrl)
      ? payload.directBuyUrl || payload.buyUrl || payload.checkoutEntryUrl
      : directBuyUrlForTask(queueTask, publishUrl) || payload.directBuyUrl || payload.buyUrl || payload.checkoutEntryUrl || "";
  return {
    ...payload,
    channel: payload.channel || queueTask.channel || "",
    experimentId: payload.experimentId || queueTask.experimentId || "",
    taskId: payload.taskId || queueTask.id || "",
    trackingUrl: publishUrl.url || payload.trackingUrl || payload.landingUrl || "",
    landingUrl: publishUrl.url || payload.landingUrl || payload.trackingUrl || "",
    recommendedReason: publishUrl.reason || queueTask.recommendedReason || payload.recommendedReason || payload.optimizedReason || "",
    directBuyUrl,
    buyUrl: directBuyUrl,
    checkoutEntryUrl: directBuyUrl,
    originalTrackingUrl: payload.originalTrackingUrl || queueTask.trackingUrl || "",
    optimizedVariantId: publishUrl.variantId || payload.optimizedVariantId || queueTask.recommendedVariantId || "",
    optimizedVariantLabel: publishUrl.variantLabel || payload.optimizedVariantLabel || "",
    optimizedVariantMetrics: publishUrl.metrics || payload.optimizedVariantMetrics || null,
    optimizedReason: publishUrl.reason || payload.optimizedReason || queueTask.recommendedReason || "",
    salesLinks: {
      ...(payload.salesLinks || {}),
      landingUrl: publishUrl.url || payload.salesLinks?.landingUrl || payload.trackingUrl || "",
      directBuyUrl,
      originalTrackingUrl: payload.originalTrackingUrl || queueTask.trackingUrl || "",
    },
  };
}

function ownedSyndicationHtml(payload) {
  const variantId = payload.optimizedVariantId || payload.variantId || "";
  const recommendedUrl = payload.trackingUrl || payload.landingUrl || "/";
  const recommended = landingRouteCopy(recommendedUrl);
  const routeKind = landingRouteKind(recommendedUrl);
  const recommendationReason = payload.optimizedReason || payload.recommendedReason || "";
  const checkoutOffer = payload.optimizedVariantMetrics?.offer === "starter" || /[?&]offer=starter\b/.test(String(payload.directBuyUrl || "")) || routeKind === "instant" || routeKind === "starter" ? "starter" : null;
  const starterExperiment = payload.experimentId ? knownExperiments().find((item) => item.id === payload.experimentId) : null;
  const checkoutAmount = checkoutOffer === "starter" ? positiveMoney(payload.optimizedVariantMetrics?.starterPrice || (starterExperiment ? starterOfferPrice(starterExperiment) : 0)) : null;
  const syndicationStarterAmount = positiveMoney(checkoutAmount || (starterExperiment ? starterOfferPrice(starterExperiment) : 0));
  const syndicationFallback =
    payload.experimentId && syndicationStarterAmount
      ? staticPaymentFallbackHtml(
          { id: payload.experimentId, price: syndicationStarterAmount },
          { label: `${payload.channel || "owned"} 分发页直接兜底收款`, amount: syndicationStarterAmount, offer: "starter" }
        )
      : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(`${payload.channel || "owned"} 自动分发：${payload.experimentId || payload.taskId}`)}</title>
  <meta name="description" content="${escapeHtml(String(payload.text || "").slice(0, 140))}" />
  <link rel="canonical" href="${escapeHtml(ownedSyndicationUrl(payload))}" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <article class="card">
      <p class="eyebrow">程序自有分发 / ${escapeHtml(payload.channel || "owned")}</p>
      <h1>${escapeHtml(payload.experimentId || payload.taskId || "自动分发页")}</h1>
      <p class="safe">这是程序从 growth-outbox 自动消费后发布到自有站点的页面。它不是小红书/微信外部发布结果，但部署到公网后可以作为可索引、可追踪的自有流量入口。</p>
      <pre>${escapeHtml(payload.text || "")}</pre>
      <section class="card">
        <p class="eyebrow">${escapeHtml(recommended.title)}</p>
        <h2>这条流量先导向哪里</h2>
        <p>${escapeHtml(recommended.note)}</p>
        ${recommendationReason ? `<p class="safe">路由原因：${escapeHtml(recommendationReason)}</p>` : ""}
        <p class="actions">
          <a class="button" href="${escapeHtml(recommendedUrl)}">${escapeHtml(recommended.cta)}</a>
          ${payload.directBuyUrl ? `<a class="button ghost" href="${escapeHtml(payload.directBuyUrl)}">已经决定购买：生成付款备注</a>` : ""}
          ${payload.originalTrackingUrl && payload.originalTrackingUrl !== recommendedUrl ? `<a class="button ghost" href="${escapeHtml(payload.originalTrackingUrl)}">原始追踪链接</a>` : ""}
        </p>
      </section>
      <p class="actions">
        <a class="button ghost" href="${escapeHtml(recommendedUrl)}">打开当前推荐入口</a>
        ${payload.directBuyUrl ? `<a class="button ghost" href="${escapeHtml(payload.directBuyUrl)}">直接购买并生成付款备注</a>` : ""}
      </p>
    </article>
    ${directCheckoutSectionHtml({
      experimentId: payload.experimentId || "",
      variantId,
      source: `syndication:${payload.channel || "owned"}`,
      title: checkoutOffer === "starter" ? `${payload.channel || "owned"} 自有分发页：直接生成入门版付款备注` : `${payload.channel || "owned"} 自有分发页：直接生成付款备注`,
      cta: checkoutOffer === "starter" ? "在这个分发页直接生成入门版付款备注" : "在这个分发页直接生成付款备注",
      autostart: false,
      engagementAutostart: true,
      offer: checkoutOffer,
      amount: checkoutAmount,
    })}
    ${syndicationFallback}
    <script>
      fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'view',experimentId:${JSON.stringify(payload.experimentId || "")},channel:${JSON.stringify(`owned-syndication:${payload.channel || "owned"}`)},taskId:${JSON.stringify(payload.taskId || "")}})}).catch(()=>{});
    </script>
  </main>
</body>
</html>`;
}

function writeOwnedSyndicationPage(rootDir, payload) {
  const relative = ownedSyndicationRelativePath(payload);
  const file = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ownedSyndicationHtml(payload));
  return file;
}

function localOwnedSyndicationPayloadForTask(task) {
  if (!task?.id || !task.experimentId) return null;
  const routingPayload = currentRoutingPayload(
    {
      type: "owned-local-syndication",
      channel: task.channel || "",
      experimentId: task.experimentId,
      taskId: task.id,
      text: task.text || "",
      label: task.label || task.channel || "",
      originalTrackingUrl: task.trackingUrl || "",
    },
    task
  );
  return {
    ...routingPayload,
    localOwned: true,
    republishSource: routingPayload.republishSource || "owned-site-publisher-local-queue",
  };
}

function appendSitemapUrl(rootDir, url) {
  const file = path.join(rootDir, "sitemap.xml");
  if (!fs.existsSync(file)) return false;
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(`<loc>${escapeXml(url)}</loc>`)) return false;
  fs.writeFileSync(file, current.replace("</urlset>", `  <url><loc>${escapeXml(url)}</loc></url>\n</urlset>`));
  return true;
}

function publishGrowthOutboxToOwnedSite({ dryRun = false, limit = 50 } = {}) {
  const adapters = loadAdapters();
  const dir = adapters.growthOutbox?.dir || "";
  const resultsDir = adapters.growthOutbox?.resultsDir || "";
  const deployTargetDir = adapters.deploy?.targetDir || "";
  const now = new Date().toISOString();
  if (!dir || !resultsDir) {
    const summary = { at: now, status: "blocked", reason: "missing-growth-outbox-or-results-dir", published: 0, failed: 0, results: [] };
    writeJsonFile("last-owned-site-publisher.json", summary);
    return summary;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  const items = readJsonDirectory(dir).slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
  const hasPublishedArchives = fs.readdirSync(dir).some((name) => /\.published\.json$/i.test(name));
  const results = [];
  const queue = loadPublishQueue();
  const queueById = Object.fromEntries(queue.map((task) => [task.id, task]));
  let changedQueue = false;
  for (const item of items) {
    try {
      const payload = item.value || {};
      if (!payload.taskId) throw new Error("taskId is required");
      const queueTask = queueById[payload.taskId];
      if (!queueTask) {
        if (!dryRun) {
          archiveJsonFile(item.file, "stale");
        }
        results.push({
          file: item.file,
          taskId: payload.taskId,
          status: dryRun ? "dry-run-stale" : "stale",
          reason: "publish task is no longer in current queue",
        });
        continue;
      }
      const pagePayload = currentRoutingPayload(payload, queueTask);
      const externalUrl = ownedSyndicationUrl(pagePayload);
      if (dryRun) {
        results.push({ file: item.file, taskId: payload.taskId, status: "dry-run-ready", externalUrl });
        continue;
      }
      const written = [writeOwnedSyndicationPage(DIST_DIR, pagePayload), writeOwnedSyndicationPage(PUBLIC_SITE_DIR, pagePayload)];
      appendSitemapUrl(DIST_DIR, externalUrl);
      appendSitemapUrl(PUBLIC_SITE_DIR, externalUrl);
      if (deployTargetDir && fs.existsSync(deployTargetDir)) {
        written.push(writeOwnedSyndicationPage(deployTargetDir, pagePayload));
        appendSitemapUrl(deployTargetDir, externalUrl);
      }
      const resultFile = path.join(resultsDir, `${payload.taskId}.json`);
      fs.writeFileSync(
        resultFile,
        JSON.stringify(
          {
            taskId: payload.taskId,
            status: "published",
            externalUrl,
            workerId: "owned-site-publisher",
            channel: payload.channel || "",
            experimentId: payload.experimentId || "",
            label: payload.label || payload.channel || "",
            text: payload.text || "",
            written,
            publishedAt: now,
          },
          null,
          2
        )
      );
      archiveJsonFile(item.file, "published");
      results.push({ file: item.file, taskId: payload.taskId, status: "published", externalUrl, resultFile, written });
    } catch (error) {
      results.push({ file: item.file, status: "failed", error: error.message });
    }
  }
  if (!items.length && !hasPublishedArchives) {
    const maxItems = Math.max(1, Math.min(200, Number(limit) || 50));
    const candidates = queue.filter((task) => ["waiting-for-account-authorization", "local-draft-exported", "failed", "dry-run-ready", "claimed"].includes(task.status)).slice(0, maxItems);
    for (const task of candidates) {
      try {
        const pagePayload = localOwnedSyndicationPayloadForTask(task);
        if (!pagePayload) continue;
        const externalUrl = ownedSyndicationUrl(pagePayload);
        if (dryRun) {
          results.push({ taskId: task.id, status: "dry-run-ready", externalUrl, source: "local-queue" });
          continue;
        }
        const written = [writeOwnedSyndicationPage(DIST_DIR, pagePayload), writeOwnedSyndicationPage(PUBLIC_SITE_DIR, pagePayload)];
        appendSitemapUrl(DIST_DIR, externalUrl);
        appendSitemapUrl(PUBLIC_SITE_DIR, externalUrl);
        if (deployTargetDir && fs.existsSync(deployTargetDir)) {
          written.push(writeOwnedSyndicationPage(deployTargetDir, pagePayload));
          appendSitemapUrl(deployTargetDir, externalUrl);
        }
        if (resultsDir) {
          const resultFile = path.join(resultsDir, `${task.id}.json`);
          fs.writeFileSync(
            resultFile,
            JSON.stringify(
              {
                taskId: task.id,
                status: "published",
                externalUrl,
                workerId: "owned-site-publisher-local-queue",
                channel: task.channel || "",
                experimentId: task.experimentId || "",
                label: task.label || task.channel || "",
                text: task.text || "",
                written,
                publishedAt: now,
              },
              null,
              2
            )
          );
        }
        task.status = "sent";
        task.externalUrl = externalUrl;
        task.publishedBy = "owned-site-publisher-local-queue";
        task.sentAt = now;
        changedQueue = true;
        results.push({ taskId: task.id, status: "published-local", externalUrl, written });
      } catch (error) {
        results.push({ taskId: task.id, status: "failed", error: error.message });
      }
    }
  }
  if (!dryRun) {
    const refreshByTaskId = new Map();
    for (const name of fs.readdirSync(dir).sort()) {
      if (!/\.published\.json$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        const payload = readJsonPath(file);
        if (!payload.taskId || !queueById[payload.taskId]) continue;
        const previous = refreshByTaskId.get(payload.taskId);
        const priority = payload.type === "optimization-republish" || payload.republishSource ? 2 : 1;
        if (!previous || priority >= previous.priority) refreshByTaskId.set(payload.taskId, { file, payload, priority });
      } catch (error) {
        results.push({ file, status: "failed", error: error.message });
      }
    }
    for (const { file, payload } of [...refreshByTaskId.values()].sort((a, b) => a.file.localeCompare(b.file))) {
      if (results.length >= Math.max(1, Math.min(200, Number(limit) || 50))) break;
      try {
        const queueTask = queueById[payload.taskId];
        const pagePayload = currentRoutingPayload(payload, queueTask);
        const externalUrl = ownedSyndicationUrl(pagePayload);
        const written = [writeOwnedSyndicationPage(DIST_DIR, pagePayload), writeOwnedSyndicationPage(PUBLIC_SITE_DIR, pagePayload)];
        appendSitemapUrl(DIST_DIR, externalUrl);
        appendSitemapUrl(PUBLIC_SITE_DIR, externalUrl);
        if (deployTargetDir && fs.existsSync(deployTargetDir)) {
          written.push(writeOwnedSyndicationPage(deployTargetDir, pagePayload));
          appendSitemapUrl(deployTargetDir, externalUrl);
        }
        if (queueTask.externalUrl !== externalUrl) {
          queueTask.externalUrl = externalUrl;
          queueTask.refreshedAt = now;
          changedQueue = true;
        }
        results.push({ file, taskId: payload.taskId, status: "refreshed", externalUrl, written });
      } catch (error) {
        results.push({ file, status: "failed", error: error.message });
      }
    }
  }
  if (!dryRun && changedQueue) writeJsonFile("publish-queue.json", queue);
  const summary = {
    at: now,
    status: "synced",
    dir,
    resultsDir,
    published: results.filter((item) => item.status === "published" || item.status === "published-local").length,
    refreshed: results.filter((item) => item.status === "refreshed").length,
    dryRunReady: results.filter((item) => item.status === "dry-run-ready").length,
    stale: results.filter((item) => item.status === "stale" || item.status === "dry-run-stale").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  writeJsonFile("last-owned-site-publisher.json", summary);
  return summary;
}

function publishTargetsForTask(task, adapters) {
  const targets = [];
  const channelAdapter = adapters.channels?.[task.channel];
  if (channelAdapter?.webhookUrl) {
    targets.push({
      id: `channel:${task.channel}`,
      kind: "channel",
      channel: task.channel,
      webhookUrl: channelAdapter.webhookUrl,
      headers: channelAdapter.headers || {},
    });
  }
  for (const [index, webhook] of (adapters.growthWebhooks || []).entries()) {
    if (!webhook?.webhookUrl) continue;
    const channels = Array.isArray(webhook.channels) && webhook.channels.length ? webhook.channels : ["*"];
    if (!channels.includes("*") && !channels.includes(task.channel)) continue;
    targets.push({
      id: webhook.id || `growth:${index}`,
      kind: "growth-webhook",
      channel: task.channel,
      webhookUrl: webhook.webhookUrl,
      headers: webhook.headers || {},
    });
  }
  const growthOutbox = adapters.growthOutbox || {};
  if (growthOutbox.dir) {
    const channels = Array.isArray(growthOutbox.channels) && growthOutbox.channels.length ? growthOutbox.channels : ["*"];
    if (channels.includes("*") || channels.includes(task.channel)) {
      targets.push({
        id: "growth-outbox",
        kind: "growth-outbox",
        channel: task.channel,
        dir: growthOutbox.dir,
      });
    }
  }
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.id}:${target.webhookUrl || target.dir}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runPublishAgentOnce({ limit = 10, channel = null, workerId = "local-publish-agent", dryRun = false } = {}) {
  const adapters = loadAdapters();
  const tasks = dryRun
    ? loadPublishQueue()
        .filter((task) => task.status !== "sent" && (!channel || task.channel === channel) && publishableTaskStatuses().includes(task.status))
        .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
    : claimPublishTasks({ limit, channel, workerId });
  const results = [];
  for (const task of tasks) {
    const publishUrl = optimizedPublishUrlForTask(task);
    const targets = publishTargetsForTask({ ...task, trackingUrl: publishUrl.url }, adapters);
    if (!targets.length) {
      const payload = publishPayloadForTask(task, publishUrl, "publish-agent");
      if (!dryRun) {
        recordPublishResult({
          taskId: task.id,
          status: "failed",
          error: "missing-publish-or-growth-webhook",
          workerId,
        });
      }
      results.push({
        taskId: task.id,
        status: "blocked",
        reason: "missing-publish-or-growth-webhook",
        publishUrl: publishUrl.url,
        variantId: publishUrl.variantId,
        variantLabel: publishUrl.variantLabel,
        optimizedReason: publishUrl.reason,
        payload,
      });
      continue;
    }
    if (dryRun) {
      const payload = publishPayloadForTask(task, publishUrl, "publish-agent");
      results.push({
        taskId: task.id,
        status: "dry-run-ready",
        targetCount: targets.length,
        publishUrl: publishUrl.url,
        variantId: publishUrl.variantId,
        variantLabel: publishUrl.variantLabel,
        optimizedReason: publishUrl.reason,
        payload,
      });
      continue;
    }
    const attempts = [];
    for (const target of targets) {
      try {
        if (target.kind === "growth-outbox") {
          const file = writeGrowthOutboxTask(target, task, publishUrl, "publish-agent");
          attempts.push({
            targetId: target.id,
            targetKind: target.kind,
            outboxFile: file,
            status: "handed-off",
            statusCode: 0,
            externalUrl: "",
          });
        } else {
          const response = await postJson(
            target.webhookUrl,
            {
              ...publishPayloadForTask(task, publishUrl, "publish-agent"),
              targetId: target.id,
              targetKind: target.kind,
            },
            target.headers
          );
          attempts.push({
            targetId: target.id,
            targetKind: target.kind,
            webhookUrl: target.webhookUrl,
            status: "sent",
            statusCode: response.statusCode,
            externalUrl: externalUrlFromWebhookResponse(response),
          });
        }
      } catch (error) {
        attempts.push({
          targetId: target.id,
          targetKind: target.kind,
          webhookUrl: target.webhookUrl || "",
          outboxDir: target.dir || "",
          status: "failed",
          error: error.message,
        });
      }
    }
    const sent = attempts.filter((item) => item.status === "sent");
    const handedOff = attempts.filter((item) => item.status === "handed-off");
    if (sent.length) {
      const externalUrl = sent.find((item) => item.externalUrl)?.externalUrl || "";
      recordPublishResult({ taskId: task.id, status: "sent", externalUrl, workerId });
      results.push({
        taskId: task.id,
        status: "sent",
        sent: sent.length,
        failed: attempts.length - sent.length,
        externalUrl,
        publishUrl: publishUrl.url,
        variantId: publishUrl.variantId,
        variantLabel: publishUrl.variantLabel,
        optimizedReason: publishUrl.reason,
        attempts,
      });
    } else if (handedOff.length) {
      recordPublishHandoff({ taskId: task.id, attempts, workerId });
      results.push({
        taskId: task.id,
        status: "handed-off",
        handedOff: handedOff.length,
        failed: attempts.length - handedOff.length,
        publishUrl: publishUrl.url,
        variantId: publishUrl.variantId,
        variantLabel: publishUrl.variantLabel,
        optimizedReason: publishUrl.reason,
        attempts,
      });
    } else {
      const error = attempts.map((item) => `${item.targetId}: ${item.error}`).join("; ") || "all publish targets failed";
      recordPublishResult({ taskId: task.id, status: "failed", error, workerId });
      results.push({
        taskId: task.id,
        status: "failed",
        failed: attempts.length,
        error,
        publishUrl: publishUrl.url,
        variantId: publishUrl.variantId,
        attempts,
      });
    }
  }
  const summary = {
    id: `publish_agent_${Date.now()}`,
    at: new Date().toISOString(),
    workerId,
    dryRun,
    claimed: tasks.length,
    sent: results.filter((item) => item.status === "sent").length,
    handedOff: results.filter((item) => item.status === "handed-off").length,
    blocked: results.filter((item) => item.status === "blocked").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  writeJsonFile("last-publish-agent.json", summary);
  return summary;
}

function externalUrlFromWebhookResponse(response) {
  try {
    const body = JSON.parse(response.body || "{}");
    return body.externalUrl || body.url || body.permalink || body.publishedUrl || "";
  } catch {
    return "";
  }
}

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = Buffer.from(JSON.stringify(payload));
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: responseBody });
          } else {
            const error = new Error(`webhook failed with ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.body = responseBody;
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getText(url, headers = {}, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      {
        method: "GET",
        headers: {
          Accept: "application/json,application/rss+xml,application/xml,text/plain,*/*",
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`opportunity source failed with ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.body = body;
            reject(error);
            return;
          }
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function getJson(url, headers = {}, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`payment feed failed with ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.body = body;
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(body || "{}"));
          } catch {
            const error = new Error("payment feed returned invalid json");
            error.statusCode = 502;
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function normalizePaymentFeed(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.payments)) return body.payments;
  if (Array.isArray(body.data)) return body.data;
  return [];
}

function paymentSourceKey(item = {}) {
  if (item.transactionId || item.paymentId || item.outTradeNo || item.id) return String(item.transactionId || item.paymentId || item.outTradeNo || item.id);
  const raw = item.rawText || item.text || item.content || item.message || item.remark || item.description || JSON.stringify(item);
  return `content_${shortHash(String(raw || ""))}`;
}

function normalizePaymentFeedText(text, source = {}) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  try {
    return normalizePaymentFeed(JSON.parse(raw)).map((item, index) => ({
      ...item,
      source: item.source || source.source || "payment-feed-file",
      feedFile: item.feedFile || source.feedFile || "",
      feedIndex: item.feedIndex ?? index,
    }));
  } catch {
    return raw
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk, index) =>
        normalizeWechatPaymentNotification({
          text: chunk,
          source: source.source || "payment-feed-text",
          feedFile: source.feedFile || "",
          feedIndex: index,
        })
      );
  }
}

function loadPaymentFeedFiles(payments = {}) {
  const files = [];
  if (payments.feedFile) files.push(payments.feedFile);
  if (payments.feedDir && fs.existsSync(payments.feedDir)) {
    for (const name of fs.readdirSync(payments.feedDir).sort()) {
      const full = path.join(payments.feedDir, name);
      if (!fs.statSync(full).isFile()) continue;
      if (!/\.(json|jsonl|txt|log)$/i.test(name)) continue;
      files.push(full);
    }
  }
  const seenFiles = new Set();
  const items = [];
  for (const file of files) {
    if (seenFiles.has(file) || !fs.existsSync(file)) continue;
    seenFiles.add(file);
    const text = fs.readFileSync(file, "utf8");
    if (/\.jsonl$/i.test(file)) {
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line, index) => {
          items.push(...normalizePaymentFeedText(line, { source: "payment-feed-jsonl", feedFile: file, feedIndex: index }));
        });
    } else {
      items.push(...normalizePaymentFeedText(text, { source: "payment-feed-file", feedFile: file }));
    }
  }
  return items;
}

function indexNowUrls(lab = buildLab()) {
  const base = publicBaseUrl();
  const baseHost = isPublicHttpUrl(base) ? new URL(base).hostname.toLowerCase() : "";
  return publicDiscoveryUrls().filter((url) => {
    if (!isPublicHttpUrl(url)) return false;
    if (!baseHost) return true;
    try {
      return new URL(url).hostname.toLowerCase() === baseHost;
    } catch {
      return false;
    }
  });
}

function publicUrlPathForFileLookup(url) {
  try {
    const target = new URL(url);
    let pathname = decodeURIComponent(target.pathname || "/");
    const base = publicBaseUrl();
    const basePath = isPublicHttpUrl(base) ? new URL(base).pathname.replace(/\/+$/, "") : "";
    if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
      pathname = pathname.slice(basePath.length) || "/";
    }
    if (pathname === "/" || pathname.endsWith("/")) return path.join(pathname.replace(/^\/+/, ""), "index.html");
    return pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function staticRootsForSearchFingerprint() {
  const adapters = loadAdapters();
  return [
    adapters.deploy?.targetDir || "",
    PUBLIC_SITE_DIR,
    DIST_DIR,
  ].filter(Boolean);
}

function searchContentFingerprint(url) {
  const relative = publicUrlPathForFileLookup(url);
  if (!relative) return "";
  for (const root of staticRootsForSearchFingerprint()) {
    const file = path.resolve(root, relative);
    const safeRoot = path.resolve(root);
    if (file !== safeRoot && !file.startsWith(`${safeRoot}${path.sep}`)) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    return shortHash(fs.readFileSync(file));
  }
  return "";
}

function searchSubmissionKey(url) {
  const fingerprint = searchContentFingerprint(url);
  return fingerprint ? `${url}#${fingerprint}` : url;
}

function isSearchUrlAlreadySubmitted(url, submittedState, submissionKey) {
  if (submissionKey && submissionKey !== url) {
    return submittedState.submittedFingerprints?.[url] === submissionKey;
  }
  return (submittedState.submitted || []).includes(url);
}

function recordSearchSubmissionFallback({ at, endpoint, keyLocation, error, candidates = [], urls = [], payload = {} }) {
  const existing = loadSearchSubmissions();
  const failures = Array.isArray(existing.failures) ? existing.failures : [];
  const host = payload.host || "";
  const signature = shortHash(JSON.stringify({ endpoint, host, keyLocation, urls }));
  const record = {
    id: `search_fallback_${signature}`,
    at,
    status: "queued",
    reason: "indexnow-submit-failed",
    endpoint,
    host,
    keyLocation,
    error: error?.message || String(error || ""),
    discovered: candidates.length,
    urls,
    payload,
  };
  const nextFailures = [record, ...failures.filter((item) => item.id !== record.id)].slice(0, 20);
  writeJsonFile("search-submissions.json", {
    ...existing,
    submitted: existing.submitted || [],
    failures: nextFailures,
    updatedAt: at,
  });
  writeJsonFile("search-submit-outbox.json", {
    at,
    status: "queued",
    reason: "indexnow-submit-failed",
    queued: urls.length,
    endpoint,
    keyLocation,
    error: record.error,
    records: nextFailures,
  });
  return record;
}

async function submitSearchIndex({ dryRun = false, lab = buildLab() } = {}) {
  const adapters = loadAdapters();
  const base = publicBaseUrl();
  const now = new Date().toISOString();
  const endpoint = adapters.search?.indexNowEndpoint || "https://api.indexnow.org/indexnow";
  const key = indexNowKey();
  const keyLocation = toPublicUrl(`/${key}.txt`);
  const submittedState = loadSearchSubmissions();
  const candidates = indexNowUrls(lab);
  const searchKeys = Object.fromEntries(candidates.map((url) => [url, searchSubmissionKey(url)]));
  const urls = candidates.filter((url) => !isSearchUrlAlreadySubmitted(url, submittedState, searchKeys[url]));

  if (!isPublicHttpUrl(base)) {
    const summary = {
      at: now,
      status: "blocked",
      reason: "public-base-url-required",
      endpoint,
      keyLocation,
      discovered: candidates.length,
      submitted: 0,
      urls: [],
    };
    writeJsonFile("last-search-submit.json", summary);
    return summary;
  }
  if (!dryRun && publicBaseNeedsProbe(base, adapters)) {
    const probe = await checkPublicBaseReachable(base, { probeUrl: adapters.search?.publicProbeUrl || base });
    if (!probe.reachable) {
      const summary = {
        at: now,
        status: "blocked",
        reason: "public-base-url-unreachable",
        endpoint,
        keyLocation,
        discovered: candidates.length,
        submitted: 0,
        urls: [],
        publicBaseUrl: base,
        probe,
      };
      writeJsonFile("last-search-submit.json", summary);
      return summary;
    }
  }
  if (!urls.length) {
    const summary = {
      at: now,
      status: "noop",
      reason: "no-new-urls",
      endpoint,
      keyLocation,
      discovered: candidates.length,
      submitted: 0,
      urls: [],
    };
    writeJsonFile("last-search-submit.json", summary);
    return summary;
  }
  if (dryRun) {
    const summary = {
      at: now,
      status: "dry-run-ready",
      endpoint,
      keyLocation,
      discovered: candidates.length,
      submitted: 0,
      urls,
    };
    writeJsonFile("last-search-submit.json", summary);
    return summary;
  }

  const host = new URL(base).hostname;
  const payload = { host, key, keyLocation, urlList: urls };
  try {
    const response = await postJson(endpoint, payload);
    const submitted = [...new Set([...(submittedState.submitted || []), ...urls])];
    const submittedFingerprints = { ...(submittedState.submittedFingerprints || {}) };
    for (const url of urls) submittedFingerprints[url] = searchKeys[url];
    writeJsonFile("search-submissions.json", { submitted, submittedFingerprints, failures: submittedState.failures || [], updatedAt: now });
    const summary = {
      at: now,
      status: "submitted",
      endpoint,
      keyLocation,
      statusCode: response.statusCode,
      discovered: candidates.length,
      submitted: urls.length,
      urls,
    };
    writeJsonFile("last-search-submit.json", summary);
    return summary;
  } catch (error) {
    const fallback = recordSearchSubmissionFallback({ at: now, endpoint, keyLocation, error, candidates, urls, payload });
    const summary = {
      at: now,
      status: "failed",
      endpoint,
      keyLocation,
      error: error.message,
      discovered: candidates.length,
      submitted: 0,
      fallbackQueued: urls.length,
      fallbackId: fallback.id,
      urls,
    };
    writeJsonFile("last-search-submit.json", summary);
    return summary;
  }
}

async function syncPaymentFeed({ dryRun = false } = {}) {
  const adapters = loadAdapters();
  const payments = adapters.payments || {};
  const now = new Date().toISOString();
  const hasLocalSource = Boolean(payments.feedFile || payments.feedDir);
  if (!payments.feedUrl && !hasLocalSource) {
    const summary = {
      at: now,
      status: "blocked",
      reason: "missing-payment-feed-url-or-file",
      created: 0,
      duplicates: 0,
      failed: 0,
      seen: 0,
    };
    writeJsonFile("last-payment-sync.json", summary);
    return summary;
  }
  if (dryRun) {
    const summary = {
      at: now,
      status: "dry-run-ready",
      feedUrl: payments.feedUrl || "",
      feedFile: payments.feedFile || "",
      feedDir: payments.feedDir || "",
      created: 0,
      duplicates: 0,
      failed: 0,
      seen: 0,
    };
    writeJsonFile("last-payment-sync.json", summary);
    return summary;
  }

  const headers = {};
  if (payments.feedSecret || payments.webhookSecret) headers["X-Payment-Secret"] = payments.feedSecret || payments.webhookSecret;
  if (payments.feedBearerToken) headers.Authorization = `Bearer ${payments.feedBearerToken}`;

  const remoteItems = payments.feedUrl ? normalizePaymentFeed(await getJson(payments.feedUrl, headers)) : [];
  const localItems = hasLocalSource ? loadPaymentFeedFiles(payments) : [];
  const seenKeys = new Set();
  const items = [...remoteItems, ...localItems].filter((item) => {
    const key = paymentSourceKey(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  const results = [];
  for (const item of items) {
    try {
      const payment = receivePaymentNotification(validateAuthoritativePaymentNotification(item));
      results.push({
        status: payment.duplicate ? "duplicate" : "created",
        orderId: payment.order.id,
        externalPaymentId: payment.order.externalPaymentId,
        experimentId: payment.order.experimentId,
        feedFile: item.feedFile || "",
      });
    } catch (error) {
      results.push({
        status: "failed",
        error: error.message,
        externalPaymentId: item.transactionId || item.paymentId || item.outTradeNo || item.id || null,
        feedFile: item.feedFile || "",
      });
    }
  }
  const summary = {
    at: now,
    status:
      payments.feedUrl || items.length > 0
        ? "synced"
        : "waiting-for-authoritative-source",
    reason:
      !payments.feedUrl && items.length === 0
        ? "local-payment-inbox-is-empty-and-no-authoritative-producer-has-been-observed"
        : "",
    feedUrl: payments.feedUrl || "",
    feedFile: payments.feedFile || "",
    feedDir: payments.feedDir || "",
    created: results.filter((item) => item.status === "created").length,
    duplicates: results.filter((item) => item.status === "duplicate").length,
    failed: results.filter((item) => item.status === "failed").length,
    seen: items.length,
    remoteSeen: remoteItems.length,
    localSeen: localItems.length,
    results,
  };
  writeJsonFile("last-payment-sync.json", summary);
  return summary;
}

async function publishQueuedTasks({ dryRun = false } = {}) {
  const adapters = loadAdapters();
  const queue = loadPublishQueue();
  const results = [];
  const now = new Date().toISOString();
  for (const task of queue) {
    if (!["waiting-for-account-authorization", "local-draft-exported", "failed", "dry-run-ready"].includes(task.status)) continue;
    const publishUrl = optimizedPublishUrlForTask(task);
    const targets = publishTargetsForTask({ ...task, trackingUrl: publishUrl.url }, adapters);
    if (!targets.length) {
      task.status = task.status === "failed" ? "waiting-for-account-authorization" : task.status;
      task.blockedReason = "missing-publish-or-growth-webhook";
      results.push({ taskId: task.id, status: "blocked", reason: task.blockedReason, publishUrl: publishUrl.url, variantId: publishUrl.variantId, variantLabel: publishUrl.variantLabel, optimizedReason: publishUrl.reason });
      continue;
    }
    if (dryRun) {
      task.status = "dry-run-ready";
      task.lastTriedAt = now;
      task.targetCount = targets.length;
      delete task.blockedReason;
      results.push({ taskId: task.id, status: task.status, targetCount: targets.length, publishUrl: publishUrl.url, variantId: publishUrl.variantId, variantLabel: publishUrl.variantLabel, optimizedReason: publishUrl.reason });
      continue;
    }
    const attempts = [];
    for (const target of targets) {
      try {
        if (target.kind === "growth-outbox") {
          const file = writeGrowthOutboxTask(target, task, publishUrl, "publish");
          attempts.push({
            targetId: target.id,
            targetKind: target.kind,
            outboxFile: file,
            status: "handed-off",
            statusCode: 0,
            externalUrl: "",
          });
        } else {
          const response = await postJson(
            target.webhookUrl,
            {
              ...publishPayloadForTask(task, publishUrl, "publish"),
              targetId: target.id,
              targetKind: target.kind,
            },
            target.headers
          );
          attempts.push({
            targetId: target.id,
            targetKind: target.kind,
            webhookUrl: target.webhookUrl,
            status: "sent",
            statusCode: response.statusCode,
            externalUrl: externalUrlFromWebhookResponse(response),
          });
        }
      } catch (error) {
        attempts.push({
          targetId: target.id,
          targetKind: target.kind,
          webhookUrl: target.webhookUrl || "",
          outboxDir: target.dir || "",
          status: "failed",
          error: error.message,
        });
      }
    }
    const sent = attempts.filter((item) => item.status === "sent");
    const handedOff = attempts.filter((item) => item.status === "handed-off");
    if (sent.length) {
      task.status = "sent";
      task.sentAt = now;
      task.publishAttempts = attempts;
      task.webhookStatusCode = sent[0].statusCode;
      task.externalUrl = sent.find((item) => item.externalUrl)?.externalUrl || task.externalUrl || "";
      delete task.blockedReason;
      delete task.lastError;
      appendEvent({ type: "publish-sent", experimentId: task.experimentId, channel: task.channel, externalUrl: task.externalUrl, targetCount: sent.length });
      results.push({ taskId: task.id, status: "sent", sent: sent.length, failed: attempts.length - sent.length, externalUrl: task.externalUrl, publishUrl: publishUrl.url, variantId: publishUrl.variantId, variantLabel: publishUrl.variantLabel, optimizedReason: publishUrl.reason, attempts });
    } else if (handedOff.length) {
      task.status = "handed-off";
      task.handedOffAt = now;
      task.publishAttempts = attempts;
      task.handoffFiles = handedOff.map((item) => item.outboxFile).filter(Boolean);
      delete task.blockedReason;
      delete task.lastError;
      appendEvent({ type: "publish-handed-off", experimentId: task.experimentId, channel: task.channel, taskId: task.id, targetCount: handedOff.length });
      results.push({ taskId: task.id, status: "handed-off", handedOff: handedOff.length, failed: attempts.length - handedOff.length, publishUrl: publishUrl.url, variantId: publishUrl.variantId, variantLabel: publishUrl.variantLabel, optimizedReason: publishUrl.reason, attempts });
    } else {
      task.status = "failed";
      task.publishAttempts = attempts;
      task.lastError = attempts.map((item) => `${item.targetId}: ${item.error}`).join("; ") || "all publish targets failed";
      task.lastTriedAt = now;
      results.push({ taskId: task.id, status: "failed", failed: attempts.length, error: task.lastError, publishUrl: publishUrl.url, variantId: publishUrl.variantId, variantLabel: publishUrl.variantLabel, optimizedReason: publishUrl.reason, attempts });
    }
  }
  writeJsonFile("publish-queue.json", queue);
  return { results, queue };
}

function generateSite(options = {}) {
  return withSiteBuildLock(() => {
    ensureDirs();
    cleanPublicGeneratedFiles();
    const strategy = buildStrategy(options);
    const lab = buildLab({ ...options, strategy });
    const publicLab = publicFeaturedExperiments(lab);
    const matrix = productMatrixSnapshot();
    saveProductCatalog([...PRODUCT_MATRIX.filter((item) => item.status === "ready"), ...lab, ...publicLab]);
    fs.writeFileSync(
      privateDeliveryFile(PUBLIC_INCOME_PRODUCT.id),
      [
        "# 商品图批量成品机付款凭证",
        "",
        "高清 ZIP 由买家浏览器本地生成，图片不会上传到服务器。",
        "权威到账后，原处理页面会自动解锁当前浏览器内存中的 ZIP 下载。",
        "若买家关闭页面，可重新选择原图并使用同一浏览器恢复已付款订单状态。",
        "",
      ].join("\n")
    );
    fs.writeFileSync(
      privateDeliveryFile("consumer-evidence-pack"),
      [
        "# 消费维权证据包付款凭证",
        "",
        "完整 ZIP 由买家浏览器根据其本地文件即时生成，原材料不会上传到服务器。",
        "店主手机确认微信到账后，买家原页面会自动解锁本地 ZIP 下载。",
        "该工具只做材料整理，不判断责任、不提供法律意见、不承诺任何处理结果。",
        "",
      ].join("\n")
    );
    for (const experiment of publicLab) writeExperimentAssets(experiment, { curated: true });
    if (publicLab[0]) writeCareerUtilityAssets(publicLab[0]);
    const promotionProgram = loadPromotionProgram();
    const promotionWeek = promotionWeekNumber(promotionProgram.startedAt);
    const publishQueue = promotionPackagesForWeek(promotionWeek, promotionProgram).map((item) => ({
      id: `pub_${item.id}`,
      experimentId: PUBLIC_INCOME_PRODUCT.id,
      channel: "xhs-note",
      label: item.label,
      status: item.status === "published" ? "sent" : "waiting-for-owner-review",
      externalUrl: item.externalUrl,
      publishedBy: item.status === "published" ? "owner-confirmed" : "",
      sentAt: item.publishedAt || "",
      recommendedUrl: item.trackingUrl,
      recommendedReason: "指向商品图免费完整预览，并使用独立 campaign 参数追踪真实生成与下单。",
      trackingUrl: item.trackingUrl,
      text: [item.title, item.opening, item.body, item.disclosure, item.hashtags, item.trackingUrl].join("\n\n"),
      campaign: item.id,
      contentType: item.type,
      disclosure: item.disclosure,
      blockedReason: item.status === "published" ? "" : "owner-final-platform-publish-confirmation-required",
      createdAt: item.publishedAt || new Date().toISOString(),
    }));
    writeJsonFile("publish-queue.json", publishQueue);
    const trafficPlan = loadTrafficPlan();
    const localDrafts = [];
    fs.writeFileSync(path.join(DIST_DIR, "index.html"), productMatrixHomeHtml(matrix));
    writeMatrixProductPages();
    writeConsumerEvidenceGuidePages();
    writeProductImagePresetPages();
    fs.writeFileSync(path.join(DIST_DIR, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), strategy, trafficPlan, experiments: lab }, null, 2));
    const hubPages = [];
    const buyNowPages = [];
    writeDistributionFiles(publicLab);
    writeJsonFile("strategy.json", strategy);
    writePublicAssets();
    const publish = publishStaticSite();
    const actionPlan = saveActionPlan(buildActionPlan({ strategy, publishQueue }));
    const executionQueue = loadExecutionQueue();
    return {
      lab,
      strategy,
      trafficPlan,
      actionPlan,
      executionQueue,
      product: PUBLIC_INCOME_PRODUCT,
      matrix,
      legacyCommerceProduct: featuredExperiment(publicLab),
      publish,
      publishQueue,
      localDrafts,
      files: [
        "index.html",
        "manifest.json",
        "feed.json",
        "favicon.svg",
        "rss.xml",
        "service.json",
        "sitemap.xml",
        "robots.txt",
        "wechat-pay.jpg",
        "fflate.js",
        "qrcode.js",
        "styles.css",
        "admin/index.html",
        "admin/mobile-admin.css",
        "admin/mobile-admin.js",
        "admin/manifest.webmanifest",
        "admin/sw.js",
        "products/consumer-evidence-pack/index.html",
        "products/product-image-batch-studio/index.html",
        ...CONSUMER_EVIDENCE_GUIDES.map((guide) => `guides/${guide.slug}/index.html`),
        ...productImagePresetPages().map((page) => `presets/${page.slug}.html`),
        "deals/today.html",
        ...publicLab.flatMap((item) => [
          `offer/${item.id}.html`,
          `buy-now/${item.id}.html`,
          `starter/${item.id}.html`,
          `rescue/${item.id}.html`,
          `sales/${item.id}.html`,
          `tools/${item.id}.html`,
          `delivery-preview/${item.id}.md`,
          ...seoPagesFor(item).map((page) => `seo/${page.slug}.html`),
          ...objectionPagesFor(item).map((page) => `objections/${page.slug}.html`),
          ...buyerQuestionPagesFor(item).map((page) => `questions/${page.slug}.html`),
          ...purchaseIntentPagesFor(item).map((page) => `intent/${page.slug}.html`),
          ...demandCapturePagesFor(item).map((page) => `demand/${page.slug}.html`),
          ...utilityIntentPagesFor(item).map((page) => `utilities/${page.slug}.html`),
        ]),
        ...careerUtilityPages().map((page) => `career-tools/${page.slug}.html`),
        ...hubPages.map((page) => (page.kind === "market" ? `markets/${page.id}.html` : `offer-types/${page.id}.html`)),
        ...publishQueue.flatMap((task) => [`promotions/${task.channel}/${task.experimentId}.html`, `promotions/${task.channel}/${task.experimentId}.md`]),
      ],
      buyNowPages,
    };
  });
}

function privateDeliveryFile(experimentId) {
  return path.join(PRIVATE_DELIVERY_DIR, `${experimentId}.md`);
}

function privateStarterDeliveryFile(experimentId) {
  return path.join(PRIVATE_DELIVERY_DIR, `${experimentId}--starter.md`);
}

function privateInteractiveDeliveryFile(experimentId) {
  return path.join(PRIVATE_DELIVERY_DIR, `${experimentId}.html`);
}

function privateOrderDeliveryFile(orderId) {
  return path.join(PRIVATE_DELIVERY_DIR, "orders", `${orderId}.md`);
}

function cleanBuyerField(value, maxLength) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function buyerContextFromInput(input = {}) {
  const leadReasons = Array.isArray(input.leadReasons)
    ? input.leadReasons.map((item) => cleanBuyerField(item, 120)).filter(Boolean).slice(0, 8)
    : [];
  const context = {
    leadContext: cleanBuyerField(input.leadContext || input.context || input.message || input.text, 1000),
    leadUrgency: cleanBuyerField(input.leadUrgency || input.urgency, 200),
    leadContact: cleanBuyerField(input.leadContact || input.contact || input.email, 200),
    leadReasons,
  };
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value)))
  );
}

function enrichLeadContext(target, context) {
  let changed = false;
  for (const [key, value] of Object.entries(context || {})) {
    if (Array.isArray(value)) {
      if (!value.length) continue;
      const existing = Array.isArray(target[key]) ? target[key] : [];
      const merged = [...new Set([...existing, ...value])].slice(0, 8);
      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        target[key] = merged;
        changed = true;
      }
      continue;
    }
    if (value && target[key] !== value) {
      target[key] = value;
      changed = true;
    }
  }
  return changed;
}

function hasBuyerContext(order) {
  return Boolean(
    cleanBuyerField(order.leadContext, 1000) ||
      cleanBuyerField(order.leadUrgency, 200) ||
      cleanBuyerField(order.leadContact, 200) ||
      (Array.isArray(order.leadReasons) && order.leadReasons.length > 0)
  );
}

function personalizedDeliveryMarkdown(order, experiment, baseContent) {
  const context = cleanBuyerField(order.leadContext, 1000) || "未留下具体场景。";
  const urgency = cleanBuyerField(order.leadUrgency, 200) || "未填写";
  const reasons = Array.isArray(order.leadReasons) ? order.leadReasons.filter(Boolean).slice(0, 8) : [];
  const contact = cleanBuyerField(order.leadContact, 200);
  const title = experiment?.title || order.experimentId;
  const pain = experiment?.pain || "当前痛点";
  const delivery = experiment?.delivery || "购买的数字交付包";
  return `# ${title}｜订单专属交付

这份文件由程序在付款匹配成功后，按买家留下的购买场景自动生成。它不是通用下载页的简单复制。

## 你提交的场景

${context}

## 紧急程度

${urgency}

${contact ? `## 接收方式\n\n${contact}\n\n` : ""}## 系统判断你需要先做什么

1. 先围绕「${pain}」产出一个能今天使用的版本，不要先追求完整包装。
2. 把下面通用交付包里的模板、清单或工具，只替换成你上面这段真实场景。
3. 做完后检查：是否能直接拿到「${delivery}」对应的结果；如果还需要解释很多概念，就继续缩小范围。

${reasons.length ? `## 为什么系统把你判为高意向\n\n${reasons.map((item) => `- ${item}`).join("\n")}\n\n` : ""}## 订单信息

- 订单：${order.id}
- 商品：${order.experimentId}
- 金额：¥${order.amount}

--- 以下是完整交付包 ---

${baseContent}
`;
}

function createPersonalizedDeliveryFile(order, experiment, baseDeliveryFile) {
  if (!hasBuyerContext(order)) return null;
  if (path.extname(baseDeliveryFile || "").toLowerCase() === ".html") return null;
  const baseContent = readDeliveryContent(order.experimentId, baseDeliveryFile);
  const file = privateOrderDeliveryFile(order.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, personalizedDeliveryMarkdown(order, experiment, baseContent));
  return file;
}

function deliveryFileForOrder(order) {
  if (order.deliveryFile) return order.deliveryFile;
  const experimentId = order.experimentId || order.productId;
  const offer = String(order.offer || order.offerType || "").toLowerCase();
  const source = String(order.source || "").toLowerCase();
  if (offer === "starter" || source.startsWith("starter")) {
    return privateStarterDeliveryFile(experimentId);
  }
  const interactiveFile = privateInteractiveDeliveryFile(experimentId);
  if (fs.existsSync(interactiveFile)) return interactiveFile;
  return privateDeliveryFile(experimentId);
}

function publicDeliveryUrl(token) {
  return toPublicUrl(`/deliver/${encodeURIComponent(token)}`);
}

function createDeliveryToken(order, { ttlHours = 24 * 7 } = {}) {
  const tokens = loadDeliveryTokens();
  const now = new Date();
  const existing = tokens.find((item) => item.orderId === order.id && new Date(item.expiresAt) > now);
  if (existing) {
    const nextUrl = publicDeliveryUrl(existing.token);
    if (existing.deliveryUrl !== nextUrl) {
      existing.deliveryUrl = nextUrl;
      writeJsonFile("delivery-tokens.json", tokens);
    }
    return existing;
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const item = {
    token,
    orderId: order.id,
    experimentId: order.experimentId,
    offer: order.offer || null,
    deliveryFile: deliveryFileForOrder(order),
    deliveryUrl: publicDeliveryUrl(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString(),
    usedAt: null,
  };
  tokens.push(item);
  writeJsonFile("delivery-tokens.json", tokens);
  return item;
}

function redeemDeliveryToken(token) {
  const tokens = loadDeliveryTokens();
  const item = tokens.find((entry) => entry.token === token);
  if (!item) {
    const error = new Error("delivery token not found");
    error.statusCode = 404;
    throw error;
  }
  if (new Date(item.expiresAt) <= new Date()) {
    const error = new Error("delivery token expired");
    error.statusCode = 410;
    throw error;
  }
  if (!item.usedAt) {
    item.usedAt = new Date().toISOString();
    writeJsonFile("delivery-tokens.json", tokens);
    appendEvent({ type: "delivery-link-opened", experimentId: item.experimentId, orderId: item.orderId });
  }
  return {
    token: item,
    file: item.deliveryFile,
    content: readDeliveryContent(item.experimentId, item.deliveryFile),
  };
}

function readDeliveryContent(experimentId, deliveryFile = privateDeliveryFile(experimentId)) {
  const file = deliveryFile || privateDeliveryFile(experimentId);
  if (!fs.existsSync(file)) {
    const error = new Error("delivery file not found");
    error.statusCode = 404;
    throw error;
  }
  return fs.readFileSync(file, "utf8");
}

function loadManifestExperiments() {
  const file = path.join(DIST_DIR, "manifest.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).experiments || [];
  } catch {
    return [];
  }
}

function loadProductCatalog() {
  return readJsonFile("product-catalog.json", []);
}

function saveProductCatalog(experiments) {
  const existing = loadProductCatalog();
  const byId = new Map(existing.filter((item) => item?.id).map((item) => [item.id, item]));
  const now = new Date().toISOString();
  for (const experiment of experiments) {
    if (!experiment?.id) continue;
    const previous = byId.get(experiment.id) || {};
    byId.set(experiment.id, {
      ...previous,
      id: experiment.id,
      title: experiment.title,
      buyer: experiment.buyer,
      pain: experiment.pain,
      promise: experiment.promise,
      delivery: experiment.delivery,
      price: positiveMoney(experiment.price),
      basePrice: positiveMoney(experiment.basePrice || experiment.price),
      offerTypeId: experiment.offerTypeId,
      marketId: experiment.marketId,
      opportunityId: experiment.opportunityId || "",
      opportunityKeyword: experiment.opportunityKeyword || "",
      opportunitySourceId: experiment.opportunitySourceId || "",
      opportunity: experiment.opportunity || null,
      firstSeenAt: previous.firstSeenAt || now,
      lastSeenAt: now,
    });
  }
  writeJsonFile("product-catalog.json", [...byId.values()]);
}

function inferExperimentFromId(id) {
  for (const market of markets) {
    for (const offerType of offerTypes) {
      const prefix = `${market.id}-${offerType.id}-`;
      if (!String(id).startsWith(prefix)) continue;
      const rest = String(id).slice(prefix.length);
      const match = rest.match(/^(\d+)-(\d+)$/);
      if (!match) continue;
      return hypothesisFor(market, offerType, Number(match[2]), Number(match[1]));
    }
  }
  return null;
}

function knownExperiments() {
  const byId = new Map();
  for (const item of [canonicalPublicProduct(), ...PRODUCT_MATRIX.filter((product) => product.status === "ready"), ...loadProductCatalog(), ...loadManifestExperiments(), ...buildLab(), PUBLIC_INCOME_PRODUCT]) {
    if (item?.id) byId.set(item.id, item);
  }
  if (fs.existsSync(PRIVATE_DELIVERY_DIR)) {
    for (const file of fs.readdirSync(PRIVATE_DELIVERY_DIR)) {
      if (!file.endsWith(".md")) continue;
      const id = file.slice(0, -3);
      if (!byId.has(id)) {
        const inferred = inferExperimentFromId(id);
        if (inferred) byId.set(id, inferred);
      }
    }
  }
  return [...byId.values()];
}

function enqueueDelivery(order) {
  const outbox = loadOutbox();
  const deliveryToken = createDeliveryToken(order);
  const deliveryUrl = publicDeliveryUrl(deliveryToken.token);
  const item = {
    id: `delivery_${Date.now()}_${outbox.length}`,
    orderId: order.id,
    experimentId: order.experimentId,
    amount: order.amount,
    offer: order.offer || null,
    deliveryFile: order.deliveryFile,
    status: "queued",
    channel: "manual-or-adapter",
    deliveryUrl,
    message: `订单 ${order.id} 已付款，交付链接：${deliveryUrl}`,
    createdAt: new Date().toISOString(),
  };
  outbox.push(item);
  writeJsonFile("outbox.json", outbox);
  appendEvent({ type: "delivery-queued", experimentId: order.experimentId, orderId: order.id });
  return item;
}

function prepareDeliveryOutbox() {
  const outbox = loadOutbox();
  const preparedDir = PRIVATE_FULFILLMENT_DIR;
  fs.mkdirSync(preparedDir, { recursive: true });
  const now = new Date().toISOString();
  for (const item of outbox) {
    if (item.status !== "queued") continue;
    const orderDeliveryUrl = refreshOrderDeliveryUrl(item.orderId);
    if (orderDeliveryUrl) item.deliveryUrl = orderDeliveryUrl;
    item.deliveryUrl = toPublicUrl(item.deliveryUrl);
    item.message = `订单 ${item.orderId} 已付款，交付链接：${item.deliveryUrl}`;
    const file = path.join(preparedDir, `${item.orderId}.txt`);
    const deliveryContent = readDeliveryContent(item.experimentId, item.deliveryFile);
    fs.writeFileSync(
      file,
      `订单：${item.orderId}
实验：${item.experimentId}
交付文件：${item.deliveryFile}
交付链接：${item.deliveryUrl}

发送给买家的消息：
你购买的数字交付包如下。
如果文件打不开，请带订单号 ${item.orderId} 反馈。

--- 完整交付内容 ---

${deliveryContent}
`
    );
    item.status = "prepared";
    item.preparedAt = now;
    item.preparedFile = file;
  }
  writeJsonFile("outbox.json", outbox);
  return outbox;
}

function fulfillmentPayloadForItem(item, deliveryUrl = item.deliveryUrl) {
  return {
    type: "fulfillment",
    orderId: item.orderId,
    experimentId: item.experimentId,
    deliveryFile: item.deliveryFile,
    deliveryUrl,
    deliveryContent: readDeliveryContent(item.experimentId, item.deliveryFile),
    message: item.message,
  };
}

function writeFulfillmentOutboxItem(dir, item, deliveryUrl) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${item.orderId}.json`);
  const payload = {
    ...fulfillmentPayloadForItem(item, deliveryUrl),
    targetKind: "fulfillment-outbox",
    deliveryId: item.id,
    writtenAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

async function deliverPrepared({ dryRun = false } = {}) {
  const adapters = loadAdapters();
  let outbox = prepareDeliveryOutbox();
  const results = [];
  const now = new Date().toISOString();
  for (const item of outbox) {
    if (!["prepared", "failed", "dry-run-ready"].includes(item.status)) continue;
    const deliveryUrl = refreshOrderDeliveryUrl(item.orderId) || toPublicUrl(item.deliveryUrl);
    item.deliveryUrl = deliveryUrl;
    item.message = `订单 ${item.orderId} 已付款，交付链接：${deliveryUrl}`;
    if (!adapters.fulfillment?.webhookUrl && !adapters.fulfillment?.outboxDir) {
      item.blockedReason = "missing-fulfillment-webhook-or-outbox-dir";
      results.push({ deliveryId: item.id, status: "blocked", reason: item.blockedReason });
      continue;
    }
    if (dryRun) {
      item.status = "dry-run-ready";
      item.lastTriedAt = now;
      delete item.blockedReason;
      results.push({ deliveryId: item.id, status: item.status });
      continue;
    }
    try {
      let response = null;
      let outboxFile = "";
      if (adapters.fulfillment.outboxDir) {
        outboxFile = writeFulfillmentOutboxItem(adapters.fulfillment.outboxDir, item, deliveryUrl);
        item.status = "handed-off";
        item.handedOffAt = now;
        item.fulfillmentOutboxFile = outboxFile;
        delete item.blockedReason;
        results.push({ deliveryId: item.id, status: "handed-off", outboxFile });
        continue;
      } else {
        response = await postJson(adapters.fulfillment.webhookUrl, fulfillmentPayloadForItem(item, deliveryUrl));
      }
      item.status = "sent";
      item.sentAt = now;
      item.webhookStatusCode = response?.statusCode || 0;
      item.fulfillmentOutboxFile = outboxFile || "";
      delete item.blockedReason;
      results.push({ deliveryId: item.id, status: "sent", statusCode: response?.statusCode || 0, outboxFile });
      markDelivered(item.orderId);
    } catch (error) {
      item.status = "failed";
      item.lastError = error.message;
      item.lastTriedAt = now;
      results.push({ deliveryId: item.id, status: "failed", error: error.message });
    }
  }
  outbox = loadOutbox().map((existing) => {
    const updated = outbox.find((item) => item.id === existing.id);
    return updated || existing;
  });
  writeJsonFile("outbox.json", outbox);
  return { results, outbox };
}

function findExperimentIdFromPayment(payload, lab = knownExperiments()) {
  if (payload.experimentId) return payload.experimentId;
  const haystack = `${payload.payerNote || ""} ${payload.remark || ""} ${payload.description || ""}`;
  const found = lab.find((item) => haystack.includes(item.id));
  return found?.id || null;
}

function inferStaticPaymentOffer(payload) {
  const explicit = String(payload.offer || payload.offerType || "").toLowerCase();
  if (explicit === "starter") return "starter";
  const haystack = `${payload.payerNote || ""} ${payload.remark || ""} ${payload.description || ""}`.toUpperCase();
  if (/(^|[#\s:_-])STARTER($|[#\s:_-])/.test(haystack) || /入门版/.test(haystack)) return "starter";
  return null;
}

function findCheckoutFromPayment(payload) {
  if (payload.authoritativeCheckoutId) {
    return (
      loadCheckouts().find(
        (checkout) =>
          checkout.id === payload.authoritativeCheckoutId &&
          ["pending", "proof-submitted", "underpaid", "paid"].includes(checkout.status)
      ) || null
    );
  }
  const haystack = `${payload.payerNote || ""} ${payload.remark || ""} ${payload.description || ""}`;
  if (!haystack.trim()) return null;
  return loadCheckouts().find((checkout) => ["pending", "proof-submitted", "underpaid"].includes(checkout.status) && (haystack.includes(checkout.paymentRemark) || haystack.includes(checkout.id))) || null;
}

function parseAmountFromText(text) {
  const raw = String(text || "");
  const patterns = [
    /(?:到账|收款|收款金额|金额|实收|收入)[^\d￥¥]{0,12}[￥¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /[￥¥]\s*([0-9]+(?:\.[0-9]{1,2})?)/,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*元/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

function parseTransactionIdFromText(text) {
  const raw = String(text || "");
  const match = raw.match(/(?:交易单号|交易号|订单号|流水号|transactionId|paymentId|outTradeNo)[:：\s]*([A-Za-z0-9_-]{6,64})/i);
  if (match) return match[1];
  return null;
}

function normalizeWechatPaymentNotification(input = {}) {
  const text = [input.title, input.text, input.content, input.message, input.remark, input.description].filter(Boolean).join(" ");
  const amount = Number(input.amount || parseAmountFromText(text));
  return {
    ...input,
    source: input.source || "wechat-notification-bridge",
    amount,
    transactionId: input.transactionId || input.paymentId || input.outTradeNo || parseTransactionIdFromText(text) || null,
    remark: input.remark || text,
    description: input.description || text,
    payerNote: input.payerNote || text,
    rawText: text,
  };
}

function validateAuthoritativePaymentNotification(input = {}) {
  const payload = normalizeWechatPaymentNotification(input);
  const externalPaymentId = String(payload.transactionId || "").trim();
  if (!externalPaymentId) {
    const error = new Error("authoritative payment notification requires a unique transaction id");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    const error = new Error("authoritative payment notification requires a positive amount");
    error.statusCode = 400;
    throw error;
  }

  const haystack = `${payload.payerNote || ""} ${payload.remark || ""} ${payload.description || ""}`;
  const checkouts = loadCheckouts({ expire: false });
  let checkout = checkouts.find((item) =>
    (item.payments || []).some((payment) => payment.externalPaymentId === externalPaymentId)
  );
  if (!checkout) {
    checkout = checkouts.find((item) => item.paymentRemark && haystack.includes(item.paymentRemark));
  }
  if (!checkout) {
    const amountMatches = checkouts.filter(
      (item) =>
        ["pending", "proof-submitted", "underpaid"].includes(item.status) &&
        item.paymentMatchMode === "exact-amount" &&
        Number(item.paymentAmount || 0) === Number(payload.amount)
    );
    if (amountMatches.length > 1) {
      const error = new Error("authoritative payment amount matches multiple pending checkouts");
      error.statusCode = 409;
      throw error;
    }
    checkout = amountMatches[0] || null;
  }
  if (!checkout) {
    const error = new Error("authoritative payment notification must match an existing checkout exact amount or unique payment remark");
    error.statusCode = 400;
    throw error;
  }
  if (!["pending", "proof-submitted", "underpaid", "paid"].includes(checkout.status)) {
    const error = new Error(`checkout cannot accept payment notification in status ${checkout.status}`);
    error.statusCode = 409;
    throw error;
  }
  return {
    ...payload,
    authoritativeCheckoutId: checkout.id,
  };
}

function receivePaymentNotification(payload) {
  const lab = knownExperiments();
  const checkout = findCheckoutFromPayment(payload);
  const experimentId = checkout?.experimentId || findExperimentIdFromPayment(payload, lab);
  if (!experimentId) {
    const error = new Error("cannot match payment notification to an experiment");
    error.statusCode = 400;
    throw error;
  }
  const experiment = lab.find((item) => item.id === experimentId);
  const staticOffer = checkout ? null : inferStaticPaymentOffer(payload);
  const externalPaymentId = payload.transactionId || payload.paymentId || payload.outTradeNo || payload.id || null;
  if (externalPaymentId) {
    const duplicateCheckout = loadCheckouts().find((item) => (item.payments || []).some((payment) => payment.externalPaymentId === externalPaymentId));
    if (duplicateCheckout) {
      const existingOrder = duplicateCheckout.orderId ? loadOrders().find((order) => order.id === duplicateCheckout.orderId) : null;
      const outbox = existingOrder ? prepareDeliveryOutbox() : loadOutbox();
      return {
        status: duplicateCheckout.status,
        checkout: duplicateCheckout,
        order: existingOrder || null,
        delivery: existingOrder ? outbox.find((item) => item.orderId === existingOrder.id) : null,
        duplicate: true,
      };
    }
    const existingOrder = loadOrders().find((order) => order.externalPaymentId === externalPaymentId);
    if (existingOrder) {
      const outbox = prepareDeliveryOutbox();
      return { order: existingOrder, delivery: outbox.find((item) => item.orderId === existingOrder.id), duplicate: true };
    }
  }
  if (checkout?.orderId) {
    const existingOrder = loadOrders().find((order) => order.id === checkout.orderId);
    if (existingOrder) {
      const outbox = prepareDeliveryOutbox();
      return { order: existingOrder, delivery: outbox.find((item) => item.orderId === existingOrder.id), duplicate: true, checkout };
    }
  }
  const paymentAmount = Number(payload.amount || 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    const error = new Error("payment amount must be positive");
    error.statusCode = 400;
    throw error;
  }
  const previouslyReceived = Number(checkout?.receivedAmount || 0);
  const receivedAmount = checkout ? Number((previouslyReceived + paymentAmount).toFixed(2)) : paymentAmount;
  const expectedAmount = Number(checkout?.paymentAmount || checkout?.amount || (staticOffer === "starter" ? starterOfferPrice(experiment) : experiment?.price) || 0);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    const error = new Error("experiment price is required before accepting payment");
    error.statusCode = 400;
    throw error;
  }
  if (!checkout && paymentAmount < expectedAmount) {
    const error = new Error(`payment amount is below expected ${staticOffer === "starter" ? "starter" : "product"} price`);
    error.statusCode = 402;
    error.expectedAmount = expectedAmount;
    error.receivedAmount = paymentAmount;
    throw error;
  }
  if (checkout && receivedAmount < expectedAmount) {
    const checkouts = loadCheckouts();
    const underpaidCheckout = checkouts.find((item) => item.id === checkout.id);
    if (underpaidCheckout) {
      underpaidCheckout.status = "underpaid";
      underpaidCheckout.receivedAmount = receivedAmount;
      underpaidCheckout.expectedAmount = expectedAmount;
      underpaidCheckout.shortAmount = Number(Math.max(0, expectedAmount - receivedAmount).toFixed(2));
      underpaidCheckout.externalPaymentId = externalPaymentId;
      underpaidCheckout.lastPaymentNote = payload.payerNote || payload.remark || payload.description || "";
      underpaidCheckout.underpaidAt = new Date().toISOString();
      underpaidCheckout.payments = [
        ...(underpaidCheckout.payments || []),
        {
          amount: paymentAmount,
          externalPaymentId,
          note: payload.payerNote || payload.remark || payload.description || "",
          at: underpaidCheckout.underpaidAt,
        },
      ];
      writeJsonFile("checkouts.json", checkouts);
      appendEvent({ type: "underpaid", experimentId, checkoutId: checkout.id, amount: paymentAmount, receivedAmount, expectedAmount });
      return {
        status: "underpaid",
        checkout: underpaidCheckout,
        order: null,
        delivery: null,
        expectedAmount,
        receivedAmount,
        shortAmount: underpaidCheckout.shortAmount,
      };
    }
  }
  const order = recordOrder({
    experimentId,
    variantId: checkout?.variantId || payload.variantId || payload.offerVariantId || null,
    amount: Number(checkout ? receivedAmount : payload.amount || experiment?.price || 0),
    payerNote: payload.payerNote || payload.remark || payload.description || "",
    externalPaymentId,
    checkoutId: checkout?.id || null,
    offer: checkout?.offer || staticOffer || payload.offer || payload.offerType || null,
    source: checkout?.source || payload.source || "",
    leadContext: checkout?.leadContext || payload.leadContext || payload.context || "",
    leadUrgency: checkout?.leadUrgency || payload.leadUrgency || payload.urgency || "",
    leadContact: checkout?.leadContact || payload.leadContact || payload.contact || payload.email || "",
    leadReasons: checkout?.leadReasons || payload.leadReasons || payload.reasons || [],
    status: "paid",
  });
  let paidCheckout = null;
  if (checkout) {
    const checkouts = loadCheckouts();
    paidCheckout = checkouts.find((item) => item.id === checkout.id);
    if (paidCheckout) {
      paidCheckout.status = "paid";
      paidCheckout.orderId = order.id;
      paidCheckout.externalPaymentId = externalPaymentId;
      paidCheckout.receivedAmount = receivedAmount || Number(checkout.amount || order.amount || 0);
      paidCheckout.expectedAmount = expectedAmount || Number(checkout.amount || experiment?.price || 0);
      paidCheckout.payments = [
        ...(paidCheckout.payments || []),
        {
          amount: paymentAmount || paidCheckout.receivedAmount,
          externalPaymentId,
          note: payload.payerNote || payload.remark || payload.description || "",
          at: new Date().toISOString(),
        },
      ];
      delete paidCheckout.shortAmount;
      paidCheckout.paidAt = new Date().toISOString();
      writeJsonFile("checkouts.json", checkouts);
    }
  }
  const outbox = prepareDeliveryOutbox();
  return { order, delivery: outbox.find((item) => item.orderId === order.id), checkout: paidCheckout || checkout || null };
}

function runAutopilot(options = {}) {
  const site = generateSite(options);
  const publish = publishStaticSite();
  const publishQueue = site.publishQueue;
  const localDrafts = site.localDrafts;
  const deliveryOutbox = prepareDeliveryOutbox();
  const run = {
    id: `run_${Date.now()}`,
    at: new Date().toISOString(),
    experiments: site.lab.length,
    strategy: site.strategy,
    staticSite: publish.directory,
    publishTasks: publishQueue.length,
    exportedDrafts: localDrafts.length,
    pendingDeliveries: deliveryOutbox.filter((item) => item.status === "prepared" || item.status === "queued").length,
    blockedExternalActions: [
      "外部平台自动发布需要账号授权和平台规则确认",
      "个人微信收款码自动到账确认需要商户支付接口或授权通知来源",
    ],
  };
  writeJsonFile("last-run.json", run);
  return run;
}

async function runWorkerOnce(options = {}) {
  const reconcile = reconcileLocalHandoffState();
  const opportunityScan = await scanOpportunitySources();
  const run = runAutopilot(options);
  const deploy = await deployStaticSite({ dryRun: options.dryRun });
  const effectiveLab = publicFeaturedExperiments(buildLab({ seed: options.seed, count: options.count }));
  const paymentSync = await syncPaymentFeed({ dryRun: options.dryRun });
  const publish = await publishQueuedTasks({ dryRun: options.dryRun });
  const ownedSitePublisher = publishGrowthOutboxToOwnedSite({ dryRun: options.dryRun });
  const resultSync = consumeResultInboxes({ dryRun: options.dryRun });
  const fulfillment = await deliverPrepared({ dryRun: options.dryRun });
  const searchSubmit = await submitSearchIndex({ dryRun: options.dryRun, lab: effectiveLab });
  const actionPlan = saveActionPlan(buildActionPlan({ publishQueue: loadPublishQueue() }));
  const summary = {
    id: `worker_${Date.now()}`,
    at: new Date().toISOString(),
    opportunityScan,
    run,
    reconcile,
    deploy,
    paymentSync,
    ownedSitePublisher,
    resultSync,
    paymentsCreated: paymentSync.created || 0,
    paymentsDuplicate: paymentSync.duplicates || 0,
    paymentsFailed: paymentSync.failed || 0,
    paymentsBlocked: paymentSync.status === "blocked" ? 1 : 0,
    deployed: deploy.status === "deployed" ? 1 : 0,
    deployBlocked: deploy.status === "blocked" ? 1 : 0,
    published: publish.results.filter((item) => item.status === "sent").length,
    ownedPublished: ownedSitePublisher.published || 0,
    publishHandedOff: publish.results.filter((item) => item.status === "handed-off").length,
    resultSyncConsumed: resultSync.consumed || 0,
    resultSyncBlocked: resultSync.blocked || 0,
    resultSyncFailed: resultSync.failed || 0,
    publishBlocked: publish.results.filter((item) => item.status === "blocked").length,
    publishDryRunReady: publish.results.filter((item) => item.status === "dry-run-ready").length,
    publishFailed: publish.results.filter((item) => item.status === "failed").length,
    fulfilled: fulfillment.results.filter((item) => item.status === "sent").length,
    fulfillmentHandedOff: fulfillment.results.filter((item) => item.status === "handed-off").length,
    fulfillmentBlocked: fulfillment.results.filter((item) => item.status === "blocked").length,
    fulfillmentDryRunReady: fulfillment.results.filter((item) => item.status === "dry-run-ready").length,
    fulfillmentFailed: fulfillment.results.filter((item) => item.status === "failed").length,
    searchSubmit,
    searchSubmitted: searchSubmit.submitted || 0,
    searchBlocked: searchSubmit.status === "blocked" ? 1 : 0,
    actionPlan,
  };
  writeJsonFile("last-worker.json", summary);
  appendWorkerHistory(summary);
  return summary;
}

async function runStorefrontCommerceCycle({
  dryRun = false,
  siteBuilder = () => generateSite({ seed: todaySeed(), count: 8 }),
  deployer = deployStaticSite,
  paymentSyncer = syncPaymentFeed,
  fulfiller = deliverPrepared,
  searchSubmitter = submitSearchIndex,
  now = () => new Date().toISOString(),
} = {}) {
  const evolution = runIncomeEvolution({ now: new Date(now()), dryRun });
  const socialSchedule = await require("./social-scheduler").runSocialScheduler({
    dataDir: DATA_DIR,
    configPath: path.join(ROOT, "config", "social-publishing-schedule.json"),
    now: new Date(now()),
    publisher: require("./social-scheduler").configuredPublisher(),
    dryRun,
  }).catch(error => ({ status: "failed", reason: "scheduler-error", error: error.message }));
  const site = await siteBuilder();
  const publicLab = [PUBLIC_INCOME_PRODUCT];
  const deploy = await deployer({ dryRun });
  const paymentSync = await paymentSyncer({ dryRun });
  const fulfillment = await fulfiller({ dryRun });
  const search = await searchSubmitter({ dryRun, lab: publicLab });
  const status = systemStatus();
  const funnel = acquisitionFunnelSnapshot({
    lab: publicLab,
    orders: loadOrders(),
    checkouts: loadCheckouts(),
    publishQueue: loadPublishQueue(),
  });
  const summary = {
    id: `commerce_${Date.now()}`,
    at: now(),
    status: "idle",
    productId: PUBLIC_INCOME_PRODUCT.id,
    price: PUBLIC_INCOME_PRODUCT.price,
    deployStatus: deploy.status || "",
    paymentsCreated: paymentSync.created || 0,
    paymentsDuplicate: paymentSync.duplicates || 0,
    paymentsFailed: paymentSync.failed || 0,
    fulfillmentSent: fulfillment.results?.filter((item) => item.status === "sent").length || 0,
    fulfillmentHandedOff: fulfillment.results?.filter((item) => item.status === "handed-off").length || 0,
    fulfillmentFailed: fulfillment.results?.filter((item) => item.status === "failed").length || 0,
    searchStatus: search.status || "",
    searchSubmitted: search.submitted || 0,
    funnel,
    orders: status.orders,
    revenue: status.revenue,
    evolution,
    socialSchedule,
  };
  writeJsonFile("storefront-commerce-cycle.json", summary);
  return summary;
}

async function runAutonomousCycle(options = {}) {
  const serviceHealth = options.ensureService ? await ensureCheckoutService({ port: options.servicePort || 4188 }) : loadServiceHealth();
  const adapterHealth = await checkAdapterHealth();
  const worker = await runWorkerOnce(options);
  const executionQueueRun = await runExecutionQueue({
    dryRun: options.dryRun,
    limit: options.executionQueueLimit || 20,
    publishAgentLimit: options.publishAgentLimit || 10,
  });
  const actionExecution = await executeActionPlan({ dryRun: options.dryRun });
  const publishAgent = await runPublishAgentOnce({
    dryRun: options.dryRun,
    limit: options.publishAgentLimit || 10,
    workerId: options.publishAgentWorkerId || "autonomous-cycle-publish-agent",
  });
  const summary = {
    id: `cycle_${Date.now()}`,
    at: new Date().toISOString(),
    serviceHealth,
    adapterHealth,
    worker,
    executionQueueRun,
    actionExecution,
    publishAgent,
  };
  writeJsonFile("last-cycle.json", summary);
  return summary;
}

function shouldSupervisorExpandTraffic(status, { minExpansionIntervalSeconds = 300, now = new Date() } = {}) {
  if (!status || Number(status.revenue || 0) > 0) return { expand: false, reason: "revenue-already-present" };
  const funnel = status.acquisitionFunnel || {};
  if (!["traffic-starved", "no-buyer-intent"].includes(funnel.stage)) {
    return { expand: false, reason: `funnel-stage-${funnel.stage || "unknown"}` };
  }
  if (!isPublicHttpUrl(publicBaseUrl())) return { expand: false, reason: "missing-public-base-url" };
  const traffic = funnel.traffic || {};
  const lastSearch = loadLastSearchSubmit();
  const lastExpansion = (loadTrafficExpansion().runs || [])[0] || null;
  const lastExpansionAt = Date.parse(lastExpansion?.at || "");
  const cooldownMs = Math.max(0, Number(minExpansionIntervalSeconds || 0)) * 1000;
  if (Number.isFinite(lastExpansionAt) && cooldownMs > 0 && now.getTime() - lastExpansionAt < cooldownMs) {
    return { expand: false, reason: "traffic-expansion-cooldown", lastExpansionId: lastExpansion.id || "" };
  }
  if (lastSearch?.status === "noop" && lastSearch?.reason === "no-new-urls" && Number(lastSearch.discovered || 0) > 0) {
    return { expand: true, reason: "search-has-no-new-urls" };
  }
  if (Number(traffic.recent24hViews || 0) === 0 && Number(traffic.sentPublishTasks || 0) >= 6) {
    return { expand: true, reason: "published-but-no-recent-views" };
  }
  if (Number(traffic.productViews || 0) < 5 && Number(status.publishQueue?.sent || 0) + Number(status.publishQueue?.handedOff || 0) >= 12) {
    return { expand: true, reason: "published-surface-too-small-for-first-sale" };
  }
  return { expand: false, reason: "wait-for-current-surface" };
}

function hasConversionAccelerationTasks(queue = loadExecutionQueue()) {
  return (queue.tasks || []).some(
    (task) =>
      task.status === "queued" &&
      [
        "escalate-published-no-checkout",
        "discount-direct-traffic-no-checkout",
        "compress-starter-traffic-to-instant-checkout",
        "convert-sample-interest",
        "convert-high-intent-lead",
        "recover-unpaid-checkout",
      ].includes(task.action)
  );
}

async function runAutonomousSupervisorOnce(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const executionQueueLimit = Number(options.executionQueueLimit || 120);
  const publishAgentLimit = Number(options.publishAgentLimit || 20);
  const expansionCount = Number(options.expansionCount || 8);
  const servicePort = Number(options.servicePort || 4188);
  const startedAt = new Date().toISOString();
  const beforeStatus = systemStatus();
  const beforeRevenue = revenueSnapshot();
  recordAutonomousSupervisorState({
    status: "running",
    mode: "money-funnel-supervisor",
    dryRun,
    servicePort,
    startedAt,
    before: {
      revenue: beforeRevenue.revenue,
      orders: beforeRevenue.orders,
      checkouts: beforeRevenue.checkouts,
      funnelStage: beforeStatus.acquisitionFunnel?.stage || "",
    },
  });

  const steps = [];
  const serviceHealth = options.ensureService === false ? loadServiceHealth() : await ensureCheckoutService({ port: servicePort });
  steps.push({ action: "ensure-checkout-service", status: serviceHealth?.status || "unknown", port: serviceHealth?.port || servicePort });
  const reconcile = reconcileLocalHandoffState();
  steps.push({ action: "reconcile-local-handoff", status: "executed", publishFixed: reconcile.publishFixed || 0, fulfillmentFixed: reconcile.fulfillmentFixed || 0 });
  const paymentSync = await syncPaymentFeed({ dryRun });
  steps.push({ action: "sync-payment-feed", status: paymentSync.status, created: paymentSync.created || 0, duplicates: paymentSync.duplicates || 0, failed: paymentSync.failed || 0, reason: paymentSync.reason || "" });
  const ownedSitePublisher = publishGrowthOutboxToOwnedSite({ dryRun, limit: Number(options.ownedPublishLimit || 160) });
  steps.push({ action: "publish-owned-site", status: ownedSitePublisher.status, published: ownedSitePublisher.published || 0, refreshed: ownedSitePublisher.refreshed || 0, failed: ownedSitePublisher.failed || 0, reason: ownedSitePublisher.reason || "" });
  const resultSync = consumeResultInboxes({ dryRun });
  steps.push({ action: "consume-result-inboxes", status: "executed", consumed: resultSync.consumed || 0, failed: resultSync.failed || 0, blocked: resultSync.blocked || 0 });
  const fulfillment = await deliverPrepared({ dryRun });
  steps.push({
    action: "deliver-prepared",
    status: "executed",
    sent: fulfillment.results.filter((item) => item.status === "sent").length,
    handedOff: fulfillment.results.filter((item) => item.status === "handed-off").length,
    blocked: fulfillment.results.filter((item) => item.status === "blocked").length,
    failed: fulfillment.results.filter((item) => item.status === "failed").length,
  });
  const executionQueueRun = await runExecutionQueue({
    dryRun,
    limit: executionQueueLimit,
    publishAgentLimit,
    localOnly: false,
    rebuild: false,
  });
  steps.push({
    action: "run-execution-queue",
    status: "executed",
    runId: executionQueueRun.id,
    attempted: executionQueueRun.attempted,
    executed: executionQueueRun.executed,
    blocked: executionQueueRun.blocked,
    skipped: executionQueueRun.skipped,
    failed: executionQueueRun.failed,
  });
  const publishAfterQueue = publishGrowthOutboxToOwnedSite({ dryRun, limit: Number(options.ownedPublishLimit || 160) });
  steps.push({ action: "publish-owned-site-after-queue", status: publishAfterQueue.status, published: publishAfterQueue.published || 0, refreshed: publishAfterQueue.refreshed || 0, failed: publishAfterQueue.failed || 0, reason: publishAfterQueue.reason || "" });

  let expansion = null;
  let expansionQueueRun = null;
  const expansionDecision = shouldSupervisorExpandTraffic(systemStatus(), {
    minExpansionIntervalSeconds: options.minExpansionIntervalSeconds ?? 300,
  });
  if (expansionDecision.expand && Number(options.maxExpansions || 1) > 0) {
    expansion = await expandTrafficSurface({ dryRun, count: expansionCount, seed: options.seed || Date.now() });
    steps.push({
      action: "expand-traffic-surface",
      status: expansion.status,
      reason: expansionDecision.reason,
      expansionId: expansion.id,
      round: expansion.round,
      signalsAdded: expansion.signalsAdded,
      experiments: expansion.experiments,
      searchStatus: expansion.searchStatus,
      submitted: expansion.searchSubmitted,
      discovered: expansion.searchDiscovered,
    });
    expansionQueueRun = await runExecutionQueue({
      dryRun,
      limit: executionQueueLimit,
      publishAgentLimit,
      localOnly: false,
      rebuild: false,
    });
    steps.push({
      action: "run-execution-queue-after-expansion",
      status: "executed",
      runId: expansionQueueRun.id,
      attempted: expansionQueueRun.attempted,
      executed: expansionQueueRun.executed,
      blocked: expansionQueueRun.blocked,
      skipped: expansionQueueRun.skipped,
      failed: expansionQueueRun.failed,
    });
    const publishAfterExpansion = publishGrowthOutboxToOwnedSite({ dryRun, limit: Number(options.ownedPublishLimit || 160) });
    steps.push({ action: "publish-owned-site-after-expansion", status: publishAfterExpansion.status, published: publishAfterExpansion.published || 0, refreshed: publishAfterExpansion.refreshed || 0, failed: publishAfterExpansion.failed || 0, reason: publishAfterExpansion.reason || "" });
  } else {
    steps.push({ action: "expand-traffic-surface", status: "skipped", reason: expansionDecision.reason });
  }

  const accelerationRuns = [];
  const maxAccelerationPasses = Math.max(0, Math.min(3, Number(options.maxAccelerationPasses ?? 2)));
  for (let pass = 1; pass <= maxAccelerationPasses && hasConversionAccelerationTasks(loadExecutionQueue()); pass += 1) {
    const accelerationRun = await runExecutionQueue({
      dryRun,
      limit: executionQueueLimit,
      publishAgentLimit,
      localOnly: false,
      rebuild: false,
    });
    accelerationRuns.push(accelerationRun);
    steps.push({
      action: "run-conversion-acceleration",
      status: "executed",
      pass,
      runId: accelerationRun.id,
      attempted: accelerationRun.attempted,
      executed: accelerationRun.executed,
      blocked: accelerationRun.blocked,
      skipped: accelerationRun.skipped,
      failed: accelerationRun.failed,
    });
    const publishAfterAcceleration = publishGrowthOutboxToOwnedSite({ dryRun, limit: Number(options.ownedPublishLimit || 160) });
    steps.push({
      action: "publish-owned-site-after-acceleration",
      status: publishAfterAcceleration.status,
      pass,
      published: publishAfterAcceleration.published || 0,
      refreshed: publishAfterAcceleration.refreshed || 0,
      failed: publishAfterAcceleration.failed || 0,
      reason: publishAfterAcceleration.reason || "",
    });
  }

  const paymentSyncAfter = await syncPaymentFeed({ dryRun });
  steps.push({ action: "sync-payment-feed-after-actions", status: paymentSyncAfter.status, created: paymentSyncAfter.created || 0, duplicates: paymentSyncAfter.duplicates || 0, failed: paymentSyncAfter.failed || 0, reason: paymentSyncAfter.reason || "" });
  const afterStatus = systemStatus();
  const afterRevenue = revenueSnapshot();
  const revenueDelta = Number((afterRevenue.revenue - beforeRevenue.revenue).toFixed(2));
  const orderDelta = afterRevenue.orders - beforeRevenue.orders;
  const checkoutDelta = afterRevenue.checkouts.total - beforeRevenue.checkouts.total;
  const revenueProgress = Math.max(0, revenueDelta);
  const orderProgress = Math.max(0, orderDelta);
  const checkoutProgress = Math.max(0, checkoutDelta);
  const summary = {
    id: `autonomous_supervisor_${Date.now()}`,
    at: new Date().toISOString(),
    startedAt,
    dryRun,
    before: beforeRevenue,
    after: afterRevenue,
    beforeFunnel: beforeStatus.acquisitionFunnel,
    afterFunnel: afterStatus.acquisitionFunnel,
    revenueDelta,
    orderDelta,
    checkoutDelta,
    revenueProgress,
    orderProgress,
    checkoutProgress,
    outcome: afterRevenue.revenue > beforeRevenue.revenue ? "revenue-increased" : afterRevenue.revenue > 0 ? "revenue-present" : "no-revenue-yet",
    serviceHealth,
    executionQueueRun,
    expansionQueueRun,
    accelerationRuns,
    expansionDecision,
    expansion,
    steps,
  };
  writeJsonFile("last-autonomous-supervisor-run.json", summary);
  recordAutonomousSupervisorState({
    status: "idle",
    mode: "money-funnel-supervisor",
    dryRun,
    servicePort,
    lastSupervisorRunId: summary.id,
    lastRunAt: summary.at,
    lastCycleId: summary.id,
    lastSummary: {
      outcome: summary.outcome,
      revenue: afterRevenue.revenue,
      orders: afterRevenue.orders,
      checkouts: afterRevenue.checkouts,
      revenueDelta: summary.revenueDelta,
      orderDelta: summary.orderDelta,
      checkoutDelta: summary.checkoutDelta,
      revenueProgress: summary.revenueProgress,
      orderProgress: summary.orderProgress,
      checkoutProgress: summary.checkoutProgress,
      funnelStage: afterStatus.acquisitionFunnel?.stage || "",
      expanded: Boolean(expansion),
      expansionReason: expansionDecision.reason,
      queueExecuted: executionQueueRun.executed || 0,
      queueBlocked: executionQueueRun.blocked || 0,
      queueFailed: executionQueueRun.failed || 0,
    },
  });
  return summary;
}

function systemStatus() {
  const lab = PRODUCT_MATRIX.filter((product) => product.status === "ready");
  const publishQueue = loadPublishQueue();
  const outbox = loadOutbox();
  const orders = loadOrders();
  const checkouts = loadCheckouts();
  const adapters = loadAdapters();
  const variantOptimizations = loadVariantOptimizations();
  const lastPaymentSync = loadLastPaymentSync();
  const authoritativePaymentSourceSeen = Boolean(
    lastPaymentSync?.status === "synced" &&
      (lastPaymentSync?.feedUrl || Number(lastPaymentSync?.seen || 0) > 0)
  );
  const revenue = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  return {
    at: new Date().toISOString(),
    experiments: lab.length,
    revenue,
    orders: orders.length,
    checkouts: {
      total: checkouts.length,
      pending: checkouts.filter((item) => ["pending", "proof-submitted"].includes(item.status)).length,
      paid: checkouts.filter((item) => item.status === "paid").length,
    },
    publishQueue: {
      total: publishQueue.length,
      sent: publishQueue.filter((item) => item.status === "sent").length,
      handedOff: publishQueue.filter((item) => item.status === "handed-off").length,
      blocked: publishQueue.filter(
        (item) => item.blockedReason || ["waiting-for-account-authorization", "waiting-for-owner-review"].includes(item.status)
      ).length,
      failed: publishQueue.filter((item) => item.status === "failed").length,
      routing: publishQueueRoutingSummary(publishQueue),
    },
    deliveryQueue: {
      total: outbox.length,
      queued: outbox.filter((item) => item.status === "queued").length,
      prepared: outbox.filter((item) => item.status === "prepared").length,
      sent: outbox.filter((item) => item.status === "sent").length,
      handedOff: outbox.filter((item) => item.status === "handed-off").length,
      blocked: outbox.filter((item) => item.blockedReason).length,
      failed: outbox.filter((item) => item.status === "failed").length,
    },
    adapters: {
      channels: Object.fromEntries(Object.entries(adapters.channels || {}).map(([channel, config]) => [channel, { configured: Boolean(config.webhookUrl) }])),
      deploy: {
        configured: Boolean(adapters.deploy?.webhookUrl || adapters.deploy?.targetDir),
        publicBaseUrl: adapters.deploy?.publicBaseUrl || "",
      },
      growthOutbox: {
        configured: Boolean(adapters.growthOutbox?.dir),
        dir: adapters.growthOutbox?.dir || "",
        resultsDir: adapters.growthOutbox?.resultsDir || "",
        channels: adapters.growthOutbox?.channels || ["*"],
      },
      fulfillment: {
        configured: Boolean(adapters.fulfillment?.webhookUrl || adapters.fulfillment?.outboxDir),
        webhookConfigured: Boolean(adapters.fulfillment?.webhookUrl),
        outboxConfigured: Boolean(adapters.fulfillment?.outboxDir),
        outboxDir: adapters.fulfillment?.outboxDir || "",
        resultsDir: adapters.fulfillment?.resultsDir || "",
      },
      payments: {
        webhookSecretConfigured: Boolean(adapters.payments?.webhookSecret),
        feedConfigured: Boolean(adapters.payments?.feedUrl || adapters.payments?.feedFile || adapters.payments?.feedDir),
        feedUrlConfigured: Boolean(adapters.payments?.feedUrl),
        feedFileConfigured: Boolean(adapters.payments?.feedFile),
        feedDirConfigured: Boolean(adapters.payments?.feedDir),
        wechatNotifyEndpoint: "/api/wechat-notify",
        wechatNotifyBridgeReady: true,
        authoritativeSourceSeen: authoritativePaymentSourceSeen,
        sourceStatus: lastPaymentSync?.status || "unknown",
      },
      search: {
        indexNowConfigured: Boolean(adapters.search?.indexNowEndpoint || adapters.publicBaseUrl),
        indexNowEndpoint: adapters.search?.indexNowEndpoint || "https://api.indexnow.org/indexnow",
      },
      opportunitySources: {
        configured: (adapters.opportunitySources || []).length,
      },
      publicBaseUrl: adapters.publicBaseUrl || "",
    },
    lastRun: loadLastRun(),
    lastWorker: loadLastWorker(),
    lastPaymentSync,
    lastResultSync: loadLastResultSync(),
    lastDeploy: loadLastDeploy(),
    lastSearchSubmit: loadLastSearchSubmit(),
    publicAccess: loadPublicAccess(),
    publicAccessMonitor: loadPublicAccessMonitor(),
    acquisitionFunnel: acquisitionFunnelSnapshot({ lab, orders, checkouts, publishQueue }),
    trafficExpansion: loadTrafficExpansion(),
    lastPublishAgent: readJsonFile("last-publish-agent.json", null),
    adapterHealth: readJsonFile("adapter-health.json", null),
    adapterReadiness: readJsonFile("adapter-readiness.json", null),
    opportunities: loadOpportunitySignals(),
    autonomousSupervisor: loadAutonomousSupervisor(),
    serviceHealth: loadServiceHealth(),
    lastActionExecution: loadLastActionExecution(),
    lastExecutionQueueRun: loadLastExecutionQueueRun(),
    lastCycle: readJsonFile("last-cycle.json", null),
    strategy: loadStrategy(),
    trafficPlan: loadTrafficPlan(),
    actionPlan: loadActionPlan(),
    executionQueue: loadExecutionQueue(),
    variantOptimizations,
    workerHistory: loadWorkerHistory().slice(-10),
    actionExecutionHistory: loadActionExecutionHistory().slice(-10),
    executionQueueHistory: loadExecutionQueueHistory().slice(-10),
    autonomousSupervisorHistory: loadAutonomousSupervisorHistory().slice(-10),
    localLoopWatcher: loadLocalLoopWatcher(),
    lastLocalLoopRun: readJsonFile("last-local-loop-run.json", null),
    lastHandoffReconcile: readJsonFile("last-handoff-reconcile.json", null),
    lastOwnedSitePublisher: readJsonFile("last-owned-site-publisher.json", null),
    storefrontCommerceCycle: readJsonFile("storefront-commerce-cycle.json", null),
    productMatrix: productMatrixSnapshot(),
    incomeEvolution: readJsonFile("income-evolution.json", null),
    socialSchedule: readJsonFile("social-schedule-state.json", null),
  };
}

function createCheckout(input) {
  const lab = knownExperiments();
  const experimentId = input.experimentId || input.productId;
  const experiment = lab.find((item) => item.id === experimentId);
  if (!experiment) {
    const error = new Error("experiment not found");
    error.statusCode = 404;
    throw error;
  }
  const offer = input.offer === "starter" || input.offerType === "starter" ? "starter" : null;
  const amount = positiveMoney(offer === "starter" ? starterOfferPrice(experiment) : experiment.price);
  if (!amount) {
    const error = new Error("experiment price is required before checkout");
    error.statusCode = 400;
    throw error;
  }
  const checkouts = loadCheckouts();
  const variantId = input.variantId || input.offerVariantId || null;
  const leadSessionId = input.leadSessionId || input.sessionId || "";
  const source = input.source || "";
  const trafficSource = cleanBuyerField(input.trafficSource, 80);
  const campaign = cleanBuyerField(input.campaign, 120);
  const buyerContext = buyerContextFromInput(input);
  if (leadSessionId && source) {
    const existing = checkouts.find(
      (item) =>
        item.experimentId === experiment.id &&
        (item.variantId || null) === (variantId || null) &&
        item.status === "pending" &&
        item.source === source &&
        (item.offer || null) === offer &&
        (item.checkoutMode || "authoritative-payment") ===
          (input.checkoutMode === "manual-wechat" ? "manual-wechat" : "authoritative-payment") &&
        item.leadSessionId === leadSessionId
    );
    if (existing) {
      if (enrichLeadContext(existing, buyerContext)) writeJsonFile("checkouts.json", checkouts);
      return existing;
    }
  }
  const random = crypto.randomBytes(5).toString("base64url").toUpperCase();
  const id = `checkout_${crypto.randomBytes(24).toString("base64url")}`;
  const paymentRemark = `${experiment.id}#${random}`;
  const checkoutMode = input.checkoutMode === "manual-wechat" ? "manual-wechat" : "authoritative-payment";
  const activeAmounts = new Set(
    checkouts
      .filter((item) => ["pending", "proof-submitted", "underpaid"].includes(item.status))
      .map((item) => Number(item.paymentAmount || 0).toFixed(2))
  );
  const maxDiscountCents = checkoutMode === "manual-wechat"
    ? 9
    : Math.min(99, Math.max(0, Math.floor(amount * 100) - 1));
  const startOffset = maxDiscountCents ? crypto.randomInt(1, maxDiscountCents + 1) : 0;
  let paymentAmount = amount;
  let paymentMatchMode = "remark";
  for (let step = 0; step < maxDiscountCents; step += 1) {
    const offsetCents = ((startOffset - 1 + step) % maxDiscountCents) + 1;
    const candidate = Number((amount - offsetCents / 100).toFixed(2));
    if (candidate <= 0 || activeAmounts.has(candidate.toFixed(2))) continue;
    paymentAmount = candidate;
    paymentMatchMode = "exact-amount";
    break;
  }
  if (checkoutMode === "manual-wechat" && paymentMatchMode !== "exact-amount") {
    const error = new Error("当前待确认订单较多，请稍后再创建付款订单");
    error.statusCode = 503;
    throw error;
  }
  const checkout = {
    id,
    experimentId: experiment.id,
    variantId,
    amount,
    listAmount: amount,
    paymentAmount,
    paymentDiscount: Number((amount - paymentAmount).toFixed(2)),
    paymentMatchMode,
    checkoutMode,
    contactReference: `WX-${random}`,
    offer,
    paymentRemark,
    statusUrl: toPublicUrl(`/checkout/${encodeURIComponent(id)}`),
    status: "pending",
    source,
    trafficSource,
    campaign,
    leadScore: input.leadScore === undefined ? null : Number(input.leadScore || 0),
    leadSessionId,
    ...buyerContext,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (checkoutMode === "manual-wechat" ? 30 : 120) * 60 * 1000).toISOString(),
  };
  checkouts.push(checkout);
  writeJsonFile("checkouts.json", checkouts);
  appendEvent({
    type: "checkout-created",
    experimentId: experiment.id,
    variantId,
    checkoutId: checkout.id,
    channel: "checkout-created",
    trafficSource,
    campaign,
    visitorId: cleanBuyerField(input.visitorId, 120),
  });
  return checkout;
}

function confirmManualCheckoutDirect(checkoutIdOrReference) {
  const checkouts = loadCheckouts({ expire: false });
  const checkout = checkouts.find(
    (item) => item.id === checkoutIdOrReference || item.contactReference === checkoutIdOrReference
  );
  if (!checkout) {
    const error = new Error("checkout not found");
    error.statusCode = 404;
    throw error;
  }
  if (checkout.checkoutMode !== "manual-wechat") {
    const error = new Error("checkout is not a manual WeChat checkout");
    error.statusCode = 409;
    throw error;
  }
  if (checkout.status === "paid") {
    return {
      checkout,
      order: checkout.orderId ? loadOrders().find((item) => item.id === checkout.orderId) || null : null,
      duplicate: true,
    };
  }
  if (checkout.status !== "pending") {
    const error = new Error(`checkout cannot be confirmed in status ${checkout.status}`);
    error.statusCode = 409;
    throw error;
  }
  const confirmedAt = new Date().toISOString();
  const order = recordOrder({
    experimentId: checkout.experimentId,
    variantId: checkout.variantId || null,
    amount: Number(checkout.paymentAmount || checkout.amount),
    payerNote: `手机管理端人工确认 ${checkout.contactReference}`,
    externalPaymentId: `mobile-admin:${checkout.id}`,
    checkoutId: checkout.id,
    source: "mobile-admin-confirmation",
    status: "paid",
  });
  checkout.status = "paid";
  checkout.orderId = order.id;
  checkout.receivedAmount = Number(checkout.paymentAmount || checkout.amount);
  checkout.expectedAmount = Number(checkout.paymentAmount || checkout.amount);
  checkout.paymentSource = "mobile-admin-confirmation";
  checkout.manualConfirmedAt = confirmedAt;
  checkout.paidAt = confirmedAt;
  writeJsonFile("checkouts.json", checkouts);
  appendEvent({
    type: "mobile-admin-payment-confirmed",
    experimentId: checkout.experimentId,
    checkoutId: checkout.id,
    orderId: order.id,
    amount: checkout.receivedAmount,
  });
  return { checkout, order, duplicate: false };
}

function updateCheckoutLeadContext(checkoutId, context) {
  if (!checkoutId) return null;
  const checkouts = loadCheckouts();
  const checkout = checkouts.find((item) => item.id === checkoutId);
  if (!checkout) return null;
  if (!enrichLeadContext(checkout, buyerContextFromInput(context))) return checkout;
  writeJsonFile("checkouts.json", checkouts);
  return checkout;
}

function processLeadToolResult(input) {
  const lab = knownExperiments();
  const experimentId = input.experimentId || input.productId;
  const experiment = lab.find((item) => item.id === experimentId);
  if (!experiment) {
    const error = new Error("experiment not found");
    error.statusCode = 404;
    throw error;
  }
  const score = Number(input.score || 0);
  const variantId = input.variantId || input.offerVariantId || "proof";
  const leadSessionId = input.leadSessionId || input.sessionId || "";
  const leadEvent = appendEvent({
    type: "lead-tool-result",
    experimentId: experiment.id,
    variantId,
    channel: input.channel || "lead-tool",
    score,
    leadSessionId,
  });
  let clickEvent = null;
  let checkout = null;
  let reusedCheckout = false;
  if (score >= 4) {
    clickEvent = appendEvent({
      type: "click",
      experimentId: experiment.id,
      variantId,
      channel: "lead-tool-cta",
      score,
      leadSessionId,
    });
    const existing = loadCheckouts().find(
      (item) =>
        item.experimentId === experiment.id &&
        item.variantId === variantId &&
        item.status === "pending" &&
        item.source === "lead-tool" &&
        (leadSessionId ? item.leadSessionId === leadSessionId : true)
    );
    if (existing) {
      checkout = updateCheckoutLeadContext(existing.id, {
        leadContext: input.context || input.message || input.text || "",
        leadUrgency: input.urgency || "",
        leadContact: input.contact || input.email || "",
        leadReasons: input.reasons || input.leadReasons || [],
      }) || existing;
      reusedCheckout = true;
    } else {
      checkout = createCheckout({
        experimentId: experiment.id,
        variantId,
        source: "lead-tool",
        leadScore: score,
        leadSessionId,
        leadContext: input.context || input.message || input.text || "",
        leadUrgency: input.urgency || "",
        leadContact: input.contact || input.email || "",
        leadReasons: input.reasons || input.leadReasons || [],
      });
    }
  }
  return {
    experimentId: experiment.id,
    variantId,
    score,
    highIntent: score >= 4,
    leadEvent,
    clickEvent,
    checkout,
    reusedCheckout,
  };
}

function sampleLeadMarkdown(experiment, context) {
  const cleanContext = String(context || "").trim();
  const scenario = cleanContext || experiment.pain;
  return `## 免费样例：先给你一个可直接复制的开头

场景：${scenario}

1. 先把目标写成一句话：我要解决「${experiment.pain}」。
2. 今天只做最小版本：拿到「${experiment.delivery}」后，先按清单跑一遍，不追求完美。
3. 检查边界：${experiment.safety}

这个免费样例只给方向和开头，不包含完整模板、完整检查清单和可交付版本。`;
}

function scoreSampleLead({ context = "", urgency = "", email = "" } = {}, experiment) {
  const text = `${context} ${urgency} ${email}`.toLowerCase();
  const rules = [
    { score: 2, reason: "留下了接收方式", test: () => /@|微信|wx|wechat|手机|电话/.test(text) },
    { score: 2, reason: "表达了今天/马上要用", test: () => /今天|今晚|马上|立刻|现在|急|明天/.test(text) },
    { score: 2, reason: "描述了具体使用场景", test: () => String(context || "").trim().length >= 12 },
    { score: 1, reason: "问题与商品痛点匹配", test: () => text.includes(String(experiment.pain || "").slice(0, 4).toLowerCase()) || text.includes(String(experiment.buyer || "").slice(0, 3).toLowerCase()) },
  ];
  const reasons = [];
  let score = 0;
  for (const rule of rules) {
    if (rule.test()) {
      score += rule.score;
      reasons.push(rule.reason);
    }
  }
  return { score, reasons };
}

function processSampleLead(input) {
  const lab = knownExperiments();
  const experimentId = input.experimentId || input.productId;
  const experiment = lab.find((item) => item.id === experimentId);
  if (!experiment) {
    const error = new Error("experiment not found");
    error.statusCode = 404;
    throw error;
  }
  const variantId = input.variantId || input.offerVariantId || experiment.winningVariant?.id || "proof";
  const leadSessionId = input.leadSessionId || input.sessionId || "";
  const context = String(input.context || input.message || input.text || "").slice(0, 1000);
  const urgency = String(input.urgency || "").slice(0, 200);
  const email = String(input.email || input.contact || "").slice(0, 200);
  const scored = scoreSampleLead({ context, urgency, email }, experiment);
  const highIntent = scored.score >= 4;
  const checkoutSource = cleanBuyerField(input.source || "sample-lead", 120) || "sample-lead";
  const sample = sampleLeadMarkdown(experiment, context);
  const leadEvent = appendEvent({
    type: "sample-lead",
    experimentId: experiment.id,
    variantId,
    channel: "sample-lead",
    score: scored.score,
    highIntent,
    reasons: scored.reasons,
    leadSessionId,
    context: context.slice(0, 500),
    hasContact: Boolean(email),
  });
  let clickEvent = null;
  let checkout = null;
  let reusedCheckout = false;
  if (highIntent) {
    clickEvent = appendEvent({
      type: "click",
      experimentId: experiment.id,
      variantId,
      channel: "sample-lead-cta",
      score: scored.score,
      leadSessionId,
    });
    const existing = loadCheckouts().find(
      (item) =>
        item.experimentId === experiment.id &&
        item.variantId === variantId &&
        item.status === "pending" &&
        item.source === checkoutSource &&
        (leadSessionId ? item.leadSessionId === leadSessionId : true)
    );
    if (existing) {
      checkout = updateCheckoutLeadContext(existing.id, {
        leadContext: context,
        leadUrgency: urgency,
        leadContact: email,
        leadReasons: scored.reasons,
      }) || existing;
      reusedCheckout = true;
    } else {
      checkout = createCheckout({
        experimentId: experiment.id,
        variantId,
        source: checkoutSource,
        leadScore: scored.score,
        leadSessionId,
        leadContext: context,
        leadUrgency: urgency,
        leadContact: email,
        leadReasons: scored.reasons,
      });
    }
  }
  return {
    experimentId: experiment.id,
    variantId,
    score: scored.score,
    highIntent,
    reasons: scored.reasons,
    sample,
    leadEvent,
    clickEvent,
    checkout,
    reusedCheckout,
  };
}

function scoreSalesAssistantMessage(message, experiment) {
  const text = String(message || "").toLowerCase();
  const rules = [
    { score: 3, reason: "表达了立即购买/付款/下单意图", words: ["买", "购买", "下单", "付款", "支付", "扫码", "收款码", "备注", "现在要", "直接给我", "马上"] },
    { score: 2, reason: "表达了紧急场景", words: ["今晚", "今天", "马上", "急", "立刻", "现在", "明天"] },
    { score: 1, reason: "询问交付和可用性", words: ["交付", "拿到", "怎么用", "能不能用", "包含", "模板", "清单", "例子", "示例"] },
    { score: 1, reason: "询问价格或值不值", words: ["价格", "多少钱", "值不值", "贵", "便宜", "退款"] },
  ];
  const reasons = [];
  let score = 0;
  for (const rule of rules) {
    if (rule.words.some((word) => text.includes(word))) {
      score += rule.score;
      reasons.push(rule.reason);
    }
  }
  const experimentText = `${experiment.buyer} ${experiment.pain} ${experiment.delivery}`.toLowerCase();
  if (text && experimentText.split(/\s+/).some((word) => word.length >= 2 && text.includes(word))) {
    score += 1;
    reasons.push("问题与当前商品场景匹配");
  }
  return { score, reasons: [...new Set(reasons)] };
}

function salesAssistantReply({ experiment, score, reasons, highIntent }) {
  const base = `这个包适合「${experiment.buyer}」在「${experiment.pain}」时快速拿到 ${experiment.delivery}。价格 ¥${experiment.price}，边界是：${experiment.safety}`;
  if (highIntent) {
    return `${base} 你已经表现出明确购买意图，我已为你生成唯一付款备注；按备注扫码付款后，系统会自动匹配并给出私有交付链接。`;
  }
  if (score >= 2) {
    return `${base} 你现在像是在确认适配度，我建议先看交付边界；如果确认今天要用，再点击购买生成唯一付款备注。`;
  }
  return `${base} 目前你的问题还不足以判断强购买意图，所以我先回答边界，不创建订单，避免给你制造无效付款备注。`;
}

function processSalesAssistantMessage(input) {
  const lab = knownExperiments();
  const experimentId = input.experimentId || input.productId;
  const experiment = lab.find((item) => item.id === experimentId);
  if (!experiment) {
    const error = new Error("experiment not found");
    error.statusCode = 404;
    throw error;
  }
  const message = String(input.message || input.text || "").slice(0, 2000);
  const variantId = input.variantId || input.offerVariantId || experiment.winningVariant?.id || "proof";
  const leadSessionId = input.leadSessionId || input.sessionId || "";
  const scored = scoreSalesAssistantMessage(message, experiment);
  const highIntent = scored.score >= 4;
  const leadEvent = appendEvent({
    type: "sales-assistant-message",
    experimentId: experiment.id,
    variantId,
    channel: "sales-assistant",
    score: scored.score,
    highIntent,
    reasons: scored.reasons,
    leadSessionId,
    message: message.slice(0, 500),
  });
  let clickEvent = null;
  let checkout = null;
  let reusedCheckout = false;
  if (highIntent) {
    clickEvent = appendEvent({
      type: "click",
      experimentId: experiment.id,
      variantId,
      channel: "sales-assistant-cta",
      score: scored.score,
      leadSessionId,
    });
    const existing = loadCheckouts().find(
      (item) =>
        item.experimentId === experiment.id &&
        item.variantId === variantId &&
        item.status === "pending" &&
        item.source === "sales-assistant" &&
        (leadSessionId ? item.leadSessionId === leadSessionId : true)
    );
    if (existing) {
      checkout = updateCheckoutLeadContext(existing.id, {
        leadContext: message,
        leadReasons: scored.reasons,
      }) || existing;
      reusedCheckout = true;
    } else {
      checkout = createCheckout({
        experimentId: experiment.id,
        variantId,
        source: "sales-assistant",
        leadScore: scored.score,
        leadSessionId,
        leadContext: message,
        leadReasons: scored.reasons,
      });
    }
  }
  return {
    experimentId: experiment.id,
    variantId,
    score: scored.score,
    highIntent,
    reasons: scored.reasons,
    reply: salesAssistantReply({ experiment, score: scored.score, reasons: scored.reasons, highIntent }),
    leadEvent,
    clickEvent,
    checkout,
    reusedCheckout,
  };
}

function checkoutStatus(checkoutId) {
  const checkout = loadCheckouts().find((item) => item.id === checkoutId);
  if (!checkout) {
    const error = new Error("checkout not found");
    error.statusCode = 404;
    throw error;
  }
  const order = checkout.orderId ? loadOrders().find((item) => item.id === checkout.orderId) || null : null;
  const outbox = order ? loadOutbox().find((item) => item.orderId === order.id) || null : null;
  return {
    checkout,
    order,
    delivery: outbox
      ? {
          status: outbox.status,
          deliveryUrl: outbox.deliveryUrl || order?.deliveryUrl || "",
          sentAt: outbox.sentAt || null,
        }
      : null,
  };
}

function submitCheckoutPaymentProof(checkoutId, input = {}) {
  const checkouts = loadCheckouts();
  const checkout = checkouts.find((item) => item.id === checkoutId);
  if (!checkout) {
    const error = new Error("checkout not found");
    error.statusCode = 404;
    throw error;
  }
  const rawText = [input.title, input.text, input.content, input.message, input.remark, input.description].filter(Boolean).join(" ").trim();
  if (!rawText) {
    const error = new Error("payment proof text is required");
    error.statusCode = 400;
    throw error;
  }
  const parsed = normalizeWechatPaymentNotification({ ...input, text: rawText });
  const haystack = `${parsed.payerNote || ""} ${parsed.remark || ""} ${parsed.description || ""} ${parsed.rawText || ""}`;
  const matchesExactAmount =
    checkout.paymentMatchMode === "exact-amount" &&
    Boolean(parsed.transactionId) &&
    Number(parsed.amount || 0) === Number(checkout.paymentAmount || checkout.amount || 0);
  if (!matchesExactAmount && !haystack.includes(checkout.paymentRemark) && !haystack.includes(checkout.id)) {
    const error = new Error(
      "payment proof must include this checkout's exact amount and transaction id or unique payment remark"
    );
    error.statusCode = 400;
    throw error;
  }
  if (checkout.status === "paid") {
    return { ...checkoutStatus(checkout.id), duplicate: true, alreadyPaid: true, parsed };
  }
  const proofId = parsed.transactionId || shortHash(rawText);
  const existingProof = (checkout.buyerProofs || []).find((item) => item.proofId === proofId);
  if (!existingProof) {
    checkout.buyerProofs = [
      ...(checkout.buyerProofs || []),
      {
        proofId,
        amountClaimed: Number(parsed.amount || 0),
        transactionIdClaimed: parsed.transactionId || null,
        text: rawText.slice(0, 2000),
        submittedAt: new Date().toISOString(),
        verificationStatus: "awaiting-independent-payment-notification",
      },
    ];
  }
  checkout.status = "proof-submitted";
  checkout.proofSubmittedAt = new Date().toISOString();
  writeJsonFile("checkouts.json", checkouts);
  appendEvent({
    type: "payment-proof-submitted",
    experimentId: checkout.experimentId,
    checkoutId: checkout.id,
    amountClaimed: Number(parsed.amount || 0),
  });
  return {
    status: "proof-submitted",
    checkout,
    order: null,
    delivery: null,
    parsed,
    duplicate: Boolean(existingProof),
    verificationRequired: true,
  };
}

function checkoutProofFormHtml(checkout, { title = "已付款？提交交易信息，加快自动核验" } = {}) {
  const exactAmountMode = checkout.paymentMatchMode === "exact-amount";
  const proofExample = exactAmountMode
    ? `微信支付收款到账 ¥${checkout.paymentAmount || checkout.amount} 交易单号 wx123456`
    : `微信支付收款到账 ¥${checkout.amount} 备注 ${checkout.paymentRemark} 交易单号 wx123456`;
  const proofRequirement = exactAmountMode
    ? "必须包含交易号和本单精确实付金额"
    : "必须包含上面的唯一付款备注";
  return `<form id="payment-proof-form" class="card" style="margin-top: 1rem;">
        <h2>${escapeHtml(title)}</h2>
        <p>粘贴微信付款通知文本，${proofRequirement}。提交只用于匹配，不能代替真实到账；程序收到独立支付通知后才会自动发货。</p>
        <textarea id="payment-proof-text" name="text" rows="5" style="width: 100%;" placeholder="${escapeHtml(proofExample)}"></textarea>
        <p><button class="button" type="submit">我已付款，提交给系统匹配</button></p>
        <p id="payment-proof-result" class="safe"></p>
      </form>`;
}

function checkoutProofScript(checkoutId, { paidRedirect = true, autoRefresh = true } = {}) {
  return `<script>
      const checkoutId = ${JSON.stringify(checkoutId)};
      async function refreshCheckoutStatus() {
        try {
          const response = await fetch('/api/checkouts/' + encodeURIComponent(checkoutId));
          const payload = await response.json();
          const url = payload.delivery?.deliveryUrl || payload.order?.deliveryUrl;
          if (${paidRedirect ? "true" : "false"} && payload.checkout?.status === 'paid' && url) window.location.href = url;
        } catch (error) {}
      }
      refreshCheckoutStatus();
      ${autoRefresh ? "setInterval(refreshCheckoutStatus, 5000);" : ""}
      const proofForm = document.getElementById('payment-proof-form');
      if (proofForm) {
        proofForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const result = document.getElementById('payment-proof-result');
          const text = document.getElementById('payment-proof-text').value;
          result.textContent = '系统正在登记交易信息...';
          try {
            const response = await fetch('/api/checkouts/' + encodeURIComponent(checkoutId) + '/payment-proof', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text })
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
              result.textContent = payload.error || '交易信息未匹配，请确认本单实付金额和交易号。';
              return;
            }
            result.textContent = '交易信息已登记，正在等待独立到账通知；核验成功后本页会自动出现交付文件。';
          } catch (error) {
            result.textContent = '提交失败，请稍后重试。';
          }
        });
      }
    </script>`;
}

function checkoutStatusHtml(checkoutId) {
  const status = checkoutStatus(checkoutId);
  const { checkout, order, delivery } = status;
  const isPaid = checkout.status === "paid";
  const isUnderpaid = checkout.status === "underpaid";
  const isProofSubmitted = checkout.status === "proof-submitted";
  const deliveryUrl = delivery?.deliveryUrl || order?.deliveryUrl || "";
  const heading = isPaid ? "付款已匹配，交付已生成" : isUnderpaid ? "付款金额不足，暂不交付" : isProofSubmitted ? "交易信息已登记，等待到账核验" : "等待付款通知匹配";
  const helper = isUnderpaid
    ? `系统已收到 ¥${checkout.receivedAmount || 0}，应付 ¥${checkout.expectedAmount || checkout.amount}，还差 ¥${checkout.shortAmount || 0}。补足并带同一个唯一备注后会自动发货。`
    : isProofSubmitted
      ? "你提交的交易信息不会直接触发发货。系统核对到真实到账后，会自动生成交付链接。"
    : "此页面会自动刷新。系统核对到真实到账后，这里会出现下载入口。";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="${isPaid ? "30" : "120"}" />
  <title>订单状态 / ${escapeHtml(checkout.id)}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <section class="card">
      <p class="eyebrow">自动交付状态</p>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(helper)}</p>
      <dl>
        <dt>订单号</dt><dd>${escapeHtml(checkout.id)}</dd>
        <dt>商品</dt><dd>岗位匹配简历工作台</dd>
        <dt>商品价</dt><dd>¥${checkout.listAmount || checkout.amount}</dd>
        <dt>本单实付</dt><dd><strong>¥${checkout.paymentAmount || checkout.amount}</strong></dd>
        <dt>自动匹配</dt><dd>${checkout.paymentMatchMode === "exact-amount" ? "按本单实付金额自动匹配，无需手填长备注" : `付款备注 ${escapeHtml(checkout.paymentRemark)}`}</dd>
        <dt>状态</dt><dd>${isPaid ? "已付款，已交付" : isProofSubmitted ? "核对到账中" : isUnderpaid ? "金额不足" : "等待付款"}</dd>
        ${isUnderpaid ? `<dt>已收</dt><dd>¥${escapeHtml(String(checkout.receivedAmount || 0))}</dd><dt>差额</dt><dd>¥${escapeHtml(String(checkout.shortAmount || 0))}</dd>` : ""}
      </dl>
      ${
        isPaid && deliveryUrl
          ? `<p><a class="button" href="${escapeHtml(deliveryUrl)}">下载你的交付文件</a></p>`
          : `<div class="grid">
              <div><h2>微信扫码付款</h2><img src="/wechat-pay.jpg" alt="微信收款二维码" /></div>
              <div><h2>请支付本单金额</h2><p class="price">¥${escapeHtml(String(checkout.paymentAmount || checkout.amount))}</p><p class="safe">${isUnderpaid ? "请补足订单页显示的差额。金额满足后系统才会自动发货。" : checkout.paymentMatchMode === "exact-amount" ? "请按页面金额精确支付，无需填写长备注；到账后自动匹配并交付。" : "请扫码付款并填写页面显示的付款备注；到账后自动交付。"}</p></div>
            </div>`
      }
      ${
        !isPaid
          ? checkoutProofFormHtml(checkout)
          : ""
      }
    </section>
    ${checkoutProofScript(checkout.id, { autoRefresh: !isPaid })}
  </main>
</body>
</html>`;
}

function purchaseConfirmationHtml({ experimentId, variantId = null, source = "server-buy-link", offer = null } = {}) {
  const experiment = knownExperiments().find((item) => item.id === experimentId);
  if (!experiment) {
    const error = new Error("experiment not found");
    error.statusCode = 404;
    throw error;
  }
  const checkoutOffer = offer === "starter" ? "starter" : null;
  const amount = checkoutOffer ? starterOfferPrice(experiment) : positiveMoney(experiment.price);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,follow" />
  <title>确认购买 / ${escapeHtml(experiment.title)}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">购买确认 · 此页面不会自动创建订单</p>
      <h1>${escapeHtml(experiment.title)}</h1>
      <p class="lead">${escapeHtml(experiment.promise)}</p>
      <div class="price">¥${escapeHtml(String(amount))}</div>
      <ul>
        <li>交付：${escapeHtml(experiment.delivery)}</li>
        <li>适合：${escapeHtml(experiment.buyer)}</li>
        <li>边界：${escapeHtml(experiment.safety)}</li>
      </ul>
      <p class="actions"><button class="button" type="button" data-confirm-purchase>确认购买，生成唯一付款备注</button></p>
      <p class="safe" data-confirm-purchase-status>只有点击确认按钮后，系统才会创建待支付记录。</p>
    </section>
  </main>
  <script>
    (() => {
      const button = document.querySelector('[data-confirm-purchase]');
      const status = document.querySelector('[data-confirm-purchase-status]');
      const key = ${JSON.stringify(`purchase-confirmation:${source}:${experiment.id}:${variantId || "default"}:${checkoutOffer || "full"}`)};
      function sessionId() {
        try {
          let value = localStorage.getItem(key);
          if (!value) {
            value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
            localStorage.setItem(key, value);
          }
          return value;
        } catch {
          return 'purchase-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        }
      }
      button?.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = '正在生成付款信息…';
        status.textContent = '正在创建本次购买的唯一付款备注。';
        try {
          const response = await fetch('/api/checkouts', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              experimentId: ${JSON.stringify(experiment.id)},
              variantId: ${JSON.stringify(variantId || null)},
              source: ${JSON.stringify(source)},
              offer: ${JSON.stringify(checkoutOffer)},
              amount: ${JSON.stringify(amount)},
              leadSessionId: sessionId()
            })
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok || !payload.checkout?.statusUrl) throw new Error(payload.error || '付款页生成失败');
          window.location.href = payload.checkout.statusUrl;
        } catch (error) {
          button.disabled = false;
          button.textContent = '确认购买，生成唯一付款备注';
          status.textContent = error.message + '，请重试。';
        }
      });
    })();
  </script>
</body>
</html>`;
}

function checkoutRecoveryHtml(checkoutId) {
  const { checkout, order, delivery } = checkoutStatus(checkoutId);
  const experiment = knownExperiments().find((item) => item.id === checkout.experimentId) || {};
  const isPaid = checkout.status === "paid";
  const isUnderpaid = checkout.status === "underpaid";
  const shortAmount = checkout.shortAmount || Math.max(0, Number((Number(checkout.expectedAmount || checkout.paymentAmount || checkout.amount) - Number(checkout.receivedAmount || 0)).toFixed(2)));
  const statusUrl = checkout.statusUrl || toPublicUrl(`/checkout/${encodeURIComponent(checkout.id)}`);
  const title = isPaid ? "这笔订单已经付款成功" : isUnderpaid ? "补足差额后系统立即自动交付" : "刚才的付款还没完成，保留这个专属备注继续购买";
  const helper = isPaid
    ? "系统已匹配付款并生成交付链接。"
    : isUnderpaid
      ? `系统已收到 ¥${checkout.receivedAmount || 0}，还差 ¥${shortAmount}。继续用同一个唯一备注补足即可自动发货。`
      : "这个页面是程序针对未付款 checkout 自动生成的挽回入口：不用重新下单，扫码付款时填写同一个唯一备注，到账匹配后自动发货。";
  const deliveryUrl = delivery?.deliveryUrl || order?.deliveryUrl || "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>继续完成付款 / ${escapeHtml(checkout.id)}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="page">
    <section class="hero card">
      <p class="eyebrow">自动未付款挽回 / checkout recovery / 不重新造单</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(helper)}</p>
      <div class="price">本单实付 ¥${escapeHtml(String(checkout.expectedAmount || checkout.paymentAmount || checkout.amount))}${isUnderpaid ? ` / 已收 ¥${escapeHtml(String(checkout.receivedAmount || 0))} / 差额 ¥${escapeHtml(String(shortAmount))}` : ""}</div>
      <p class="safe">访问这个页面不会创建新订单；它只恢复这笔 checkout 的付款路径。付款匹配成功后才会生成真实订单和交付。</p>
    </section>
    <section class="card">
      <h2>${escapeHtml(experiment.title || checkout.experimentId)}</h2>
      <p>${escapeHtml(experiment.promise || "付款匹配成功后，系统会自动生成交付链接。")}</p>
      <dl>
        <dt>Checkout</dt><dd>${escapeHtml(checkout.id)}</dd>
        <dt>商品</dt><dd>${escapeHtml(checkout.experimentId)}</dd>
        <dt>版本</dt><dd>${escapeHtml(checkout.offer === "starter" ? "入门版" : "完整包")}</dd>
        <dt>状态</dt><dd>${escapeHtml(checkout.status)}</dd>
        <dt>自动匹配方式</dt><dd>${checkout.paymentMatchMode === "exact-amount" ? `精确支付 ¥${escapeHtml(String(checkout.paymentAmount))}` : escapeHtml(checkout.paymentRemark)}</dd>
      </dl>
      ${
        isPaid && deliveryUrl
          ? `<p><a class="button" href="${escapeHtml(deliveryUrl)}">付款已完成，打开交付文件</a></p>`
          : `<div class="grid">
        <div>
          <h2>1. 微信扫码付款</h2>
          <img src="/wechat-pay.jpg" alt="微信收款二维码" />
        </div>
        <div>
          <h2>2. ${checkout.paymentMatchMode === "exact-amount" ? "支付订单页显示的精确金额" : "填写付款备注"}</h2>
          <p class="price">${checkout.paymentMatchMode === "exact-amount" ? `¥${escapeHtml(String(checkout.paymentAmount))}` : escapeHtml(checkout.paymentRemark)}</p>
          <p>${checkout.paymentMatchMode === "exact-amount" ? "这个分角金额是本单专属优惠金额，无需输入长备注；到账后程序自动匹配。" : "系统只认这个备注。金额达到应付金额后，程序自动创建订单并发货。"}</p>
          <p><a class="button ghost" href="${escapeHtml(statusUrl)}">查看实时订单状态</a></p>
        </div>
      </div>`
      }
    </section>
    ${!isPaid ? checkoutProofFormHtml(checkout, { title: "已付款或已补差？提交到账文本让程序匹配" }) : ""}
    ${checkoutProofScript(checkout.id, { autoRefresh: !isPaid })}
  </main>
</body>
</html>`;
}

function recordOrder(order) {
  const orders = loadOrders();
  const experimentId = order.experimentId || order.productId;
  if (!experimentId) {
    const error = new Error("experimentId is required");
    error.statusCode = 400;
    throw error;
  }
  const amount = positiveMoney(order.amount);
  if (!amount) {
    const error = new Error("order amount must be positive");
    error.statusCode = 400;
    throw error;
  }
  const next = {
    id: `order_${Date.now()}_${orders.length}`,
    experimentId,
    variantId: order.variantId || null,
    amount,
    payerNote: order.payerNote || "",
    externalPaymentId: order.externalPaymentId || null,
    checkoutId: order.checkoutId || null,
    offer: order.offer === "starter" || order.offerType === "starter" ? "starter" : null,
    source: order.source || "",
    ...buyerContextFromInput(order),
    status: order.status || "paid",
    createdAt: new Date().toISOString(),
  };
  const experiment = knownExperiments().find((item) => item.id === experimentId);
  const baseDeliveryFile = deliveryFileForOrder(next);
  next.deliveryFile = createPersonalizedDeliveryFile(next, experiment, baseDeliveryFile) || baseDeliveryFile;
  const deliveryToken = createDeliveryToken(next);
  next.deliveryUrl = deliveryToken.deliveryUrl;
  orders.push(next);
  writeJsonFile("orders.json", orders);
  appendEvent({ type: "paid", experimentId, variantId: next.variantId, amount: next.amount });
  next.deliveryTask = enqueueDelivery(next);
  return next;
}

function refreshOrderDeliveryUrl(orderId) {
  const orders = loadOrders();
  const order = orders.find((item) => item.id === orderId);
  if (!order) return null;
  const deliveryToken = createDeliveryToken(order);
  const deliveryUrl = deliveryToken.deliveryUrl;
  if (order.deliveryUrl !== deliveryUrl) {
    order.deliveryUrl = deliveryUrl;
    writeJsonFile("orders.json", orders);
  }
  return deliveryUrl;
}

function markDelivered(orderId) {
  const orders = loadOrders();
  const order = orders.find((item) => item.id === orderId);
  if (!order) {
    const error = new Error("order not found");
    error.statusCode = 404;
    throw error;
  }
  order.status = "delivered";
  order.deliveredAt = new Date().toISOString();
  writeJsonFile("orders.json", orders);
  const outbox = loadOutbox();
  for (const item of outbox) {
    if (item.orderId === orderId) {
      item.status = "sent";
      item.sentAt = order.deliveredAt;
    }
  }
  writeJsonFile("outbox.json", outbox);
  appendEvent({ type: "delivered", experimentId: order.experimentId, orderId });
  return order;
}

module.exports = {
  ROOT,
  DIST_DIR,
  DATA_DIR,
  PRIVATE_DELIVERY_DIR,
  PRIVATE_FULFILLMENT_DIR,
  PUBLIC_SITE_DIR,
  markets,
  offerTypes,
  channels,
  todaySeed,
  generateHypotheses,
  buildLab,
  featuredExperiment,
  generateSite,
  scoreExperiment,
  aggregateMetrics,
  offerVariantsFor,
  offerVariantViews,
  bestOfferVariant,
  publicOfferVariantUrl,
  publicStarterOfferUrl,
  publicInstantCheckoutUrl,
  publicUtilityIntentUrl,
  publicSampleCloseUrl,
  publicCheckoutRecoveryUrl,
  starterOfferPrice,
  utilityIntentPagesFor,
  acquisitionFunnelSnapshot,
  promotionCenterSnapshot,
  productMatrixSnapshot,
  evaluateIncomeEvolution,
  runIncomeEvolution,
  productAcquisitionSnapshot,
  searchContentFingerprint,
  indexNowUrls,
  markPromotionPackagePublished,
  appendEvent,
  appendServerViewEvent,
  loadEvents,
  loadOrders,
  loadCheckouts,
  loadAdminPushSubscriptions,
  saveAdminPushSubscriptions,
  loadOutbox,
  loadRecoveryOutbox,
  loadDeliveryTokens,
  loadPublishQueue,
  loadOpportunitySignals,
  loadTrafficPlan,
  loadExecutionQueue,
  loadLastExecutionQueueRun,
  loadExecutionQueueHistory,
  loadAutonomousSupervisor,
  loadLastAutonomousSupervisorRun,
  loadAutonomousSupervisorHistory,
  recordAutonomousSupervisorState,
  loadAdapters,
  saveAdapters,
  adapterEnvSpec,
  configureAdaptersFromEnv,
  configurePublicBaseUrl,
  recordPublicAccessAttempt,
  loadPublicAccessMonitor,
  runPublicAccessMonitorOnce,
  startPublicAccessMonitor,
  resolveBundledNpxCommand,
  stopRecordedPublicTunnel,
  stopManagedPublicTunnelProcesses,
  consumeFulfillmentResults,
  consumeGrowthResults,
  consumeResultInboxes,
  reconcileLocalHandoffState,
  bootstrapLocalLoop,
  buildAdapterReadinessPlan,
  loadStrategy,
  loadWorkerHistory,
  loadLastRun,
  loadLastWorker,
  loadLastPaymentSync,
  loadLastResultSync,
  loadLocalLoopWatcher,
  loadServiceHealth,
  recordServiceHealthState,
  loadLastDeploy,
  loadLastSearchSubmit,
  loadPublicAccess,
  loadActionPlan,
  loadLastActionExecution,
  loadActionExecutionHistory,
  loadVariantOptimizations,
  buildStrategy,
  buildTrafficPlan,
  buildExecutionQueue,
  runExecutionQueueTask,
  runExecutionQueue,
  buildActionPlan,
  saveActionPlan,
  executeActionPlan,
  generateAdaptiveHypotheses,
  normalizeWechatPaymentNotification,
  validateAuthoritativePaymentNotification,
  knownExperiments,
  createCheckout,
  confirmManualCheckoutDirect,
  processLeadToolResult,
  processSampleLead,
  processSalesAssistantMessage,
  checkoutStatus,
  checkoutStatusHtml,
  purchaseConfirmationHtml,
  checkoutRecoveryHtml,
  submitCheckoutPaymentProof,
  recordOrder,
  markDelivered,
  publishStaticSite,
  collectStaticSiteFiles,
  publishGrowthOutboxToOwnedSite,
  checkPublicBaseReachable,
  checkAdapterHealth,
  scanOpportunitySources,
  expandTrafficSurface,
  publicTunnelProviders,
  nextPublicTunnelProvider,
  startAutonomousPublicTunnel,
  deployStaticSite,
  buildPublishQueue,
  exportLocalPublishDrafts,
  claimPublishTasks,
  recordPublishResult,
  recordFulfillmentResult,
  runPublishAgentOnce,
  prepareDeliveryOutbox,
  publishQueuedTasks,
  submitSearchIndex,
  deliverPrepared,
  syncPaymentFeed,
  probeCheckoutService,
  waitForCheckoutService,
  ensureCheckoutService,
  receivePaymentNotification,
  runLocalLoopOnce,
  startLocalLoopWatcher,
  shouldSupervisorExpandTraffic,
  hasConversionAccelerationTasks,
  runAutonomousSupervisorOnce,
  runAutopilot,
  runWorkerOnce,
  runStorefrontCommerceCycle,
  runAutonomousCycle,
  systemStatus,
  deliveryMarkdown,
  starterDeliveryMarkdown,
  deliveryPreviewMarkdown,
  readDeliveryContent,
  createDeliveryToken,
  redeemDeliveryToken,
};
