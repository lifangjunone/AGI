const { config } = require("./config");
const resultCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `你是资深的中国本地生活商家增长顾问和内容总监。
你的任务是根据真实商家信息，生成可以直接交付给客户的增长方案。
要求：
1. 只输出严格 JSON，不要 Markdown 代码围栏；
2. 不虚构门店事实、数据、资质、顾客案例；
3. 不承诺流量、排名、到店量或收入；
4. 禁止刷评、诱导删评、绝对化广告用语和违法营销；
5. 文案具体、自然、像真人表达，避免空泛 AI 套话；
6. 如果输入信息不足，用“待商家确认”标记，不要猜测；
7. 严格控制长度：summary 60 字内；每条 obstacle 35 字内；action 的 detail 80 字内、evidence 40 字内；
   script 的 hook 35 字内、shots 每项 25 字内、voiceover 160 字内、cta 30 字内；
   每条评价回复 55 字内；calendar 的 content 70 字内、goal 25 字内；salesPitch 140 字内；
8. 不要增加字段，不要重复内容，完整 JSON 总长度控制在 8000 个汉字以内。`;

const responseShape = {
  summary: "一句话诊断",
  obstacles: ["核心阻力1", "核心阻力2", "核心阻力3"],
  actions: [
    { title: "行动标题", detail: "具体建议", evidence: "建议拍摄或收集的证据" },
  ],
  scripts: [
    {
      title: "标题",
      hook: "开头3秒",
      shots: ["镜头1", "镜头2"],
      voiceover: "完整口播",
      cta: "单一行动指令",
    },
  ],
  reviews: {
    positive: ["好评回复，共5条"],
    negative: ["中差评回复，共5条"],
  },
  calendar: [
    { day: "周一", theme: "主题", content: "内容", goal: "目标" },
  ],
  salesPitch: "面向该商家的定制销售开场白",
  caveats: ["事实核对与合规提醒"],
};

const coreResponseShape = {
  summary: responseShape.summary,
  obstacles: responseShape.obstacles,
  actions: responseShape.actions,
  scripts: responseShape.scripts,
  salesPitch: responseShape.salesPitch,
  caveats: responseShape.caveats,
};

const executionResponseShape = {
  reviews: responseShape.reviews,
  calendar: responseShape.calendar,
};

function validateBrief(input) {
  const clean = {
    shop: String(input?.shop || "").trim(),
    industry: String(input?.industry || "").trim(),
    ticket: Number(input?.ticket || 0),
    product: String(input?.product || "").trim(),
    audience: String(input?.audience || "").trim(),
    pain: String(input?.pain || "").trim(),
    mode: ["fast", "quality", "reasoning"].includes(input?.mode) ? input.mode : "quality",
  };
  if (!clean.shop || !clean.product || !clean.audience) {
    const error = new Error("请填写门店名称、核心产品和目标客群");
    error.statusCode = 400;
    throw error;
  }
  for (const key of ["shop", "industry", "product", "audience", "pain"]) {
    if (clean[key].length > 500) {
      const error = new Error("输入内容过长，请精简后重试");
      error.statusCode = 400;
      throw error;
    }
  }
  if (!Number.isFinite(clean.ticket) || clean.ticket < 0 || clean.ticket > 1000000) {
    const error = new Error("客单价格式不正确");
    error.statusCode = 400;
    throw error;
  }
  return clean;
}

function modelForMode(provider, mode) {
  if (provider === "fallback") return config.providers.fallback.models.primary;
  const models = config.providers.ark.models;
  if (mode === "fast") return models.fast || models.primary;
  if (mode === "reasoning") return models.reasoning || models.primary;
  return models.primary;
}

function endpoint(baseUrl, resource) {
  return `${baseUrl.replace(/\/+$/, "")}/${resource.replace(/^\/+/, "")}`;
}

function extractJson(text) {
  if (typeof text !== "string") throw new Error("模型未返回文本");
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型没有返回有效 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeResult(value, requireComplete = true) {
  if (!value || typeof value !== "object") throw new Error("模型结果格式无效");
  const result = {
    summary: String(value.summary || "需要进一步核对门店信息"),
    obstacles: Array.isArray(value.obstacles) ? value.obstacles.slice(0, 5).map(String) : [],
    actions: Array.isArray(value.actions) ? value.actions.slice(0, 6) : [],
    scripts: Array.isArray(value.scripts) ? value.scripts.slice(0, 10) : [],
    reviews: {
      positive: Array.isArray(value.reviews?.positive) ? value.reviews.positive.slice(0, 10).map(String) : [],
      negative: Array.isArray(value.reviews?.negative) ? value.reviews.negative.slice(0, 10).map(String) : [],
    },
    calendar: Array.isArray(value.calendar) ? value.calendar.slice(0, 7) : [],
    salesPitch: String(value.salesPitch || ""),
    caveats: Array.isArray(value.caveats) ? value.caveats.slice(0, 8).map(String) : [],
  };
  if (
    requireComplete &&
    result.summary === "需要进一步核对门店信息" ||
    requireComplete &&
    result.actions.length < 3 ||
    requireComplete &&
    result.scripts.length < 3 ||
    requireComplete &&
    result.reviews.positive.length < 5 ||
    requireComplete &&
    result.reviews.negative.length < 5 ||
    requireComplete &&
    result.calendar.length < 7
  ) {
    throw new Error("模型返回的方案不完整");
  }
  return result;
}

function validatePart(value, part) {
  if (!value || typeof value !== "object") throw new Error("模型结果格式无效");
  if (part === "core") {
    if (
      !value.summary ||
      !Array.isArray(value.obstacles) ||
      !Array.isArray(value.actions) ||
      value.actions.length < 3 ||
      !Array.isArray(value.scripts) ||
      value.scripts.length < 3
    ) {
      throw new Error("核心提案输出不完整");
    }
    return value;
  }
  if (
    !Array.isArray(value.reviews?.positive) ||
    value.reviews.positive.length < 5 ||
    !Array.isArray(value.reviews?.negative) ||
    value.reviews.negative.length < 5 ||
    !Array.isArray(value.calendar) ||
    value.calendar.length < 7
  ) {
    throw new Error("执行方案输出不完整");
  }
  return value;
}

function makeResilientFallback(brief) {
  const playbooks = {
    餐饮: {
      proofs: ["制作过程与食材细节", "真实出品近景", "价格、分量和适合人数"],
      objections: ["价格是否值得", "实物是否一致", "购买是否方便"],
    },
    美业: {
      proofs: ["服务前后对比", "工具消毒过程", "不同人群的真实效果"],
      objections: ["效果是否自然", "是否推销办卡", "卫生是否可靠"],
    },
    健身: {
      proofs: ["动作纠错演示", "教练专业背景", "会员阶段性变化"],
      objections: ["能否坚持", "训练是否适合新手", "私教价格是否值得"],
    },
    宠物: {
      proofs: ["服务过程记录", "环境清洁细节", "宠物服务前后状态"],
      objections: ["宠物是否应激", "环境是否卫生", "收费是否透明"],
    },
    家政: {
      proofs: ["施工前后对比", "工具和操作规范", "服务项目透明报价"],
      objections: ["是否临时加价", "能否真正解决问题", "售后是否可靠"],
    },
    通用: {
      proofs: ["真实服务过程", "结果前后对比", "价格与适合人群"],
      objections: ["价格是否值得", "效果是否可靠", "服务是否透明"],
    },
  };
  const selected = playbooks[brief.industry] || playbooks.通用;
  const product = brief.product;
  const audience = brief.audience;
  const shop = brief.shop;
  return normalizeResult({
    summary: `当前不是缺少内容，而是没有围绕“${product}”讲清具体价值、可信证据和行动理由。`,
    obstacles: [
      brief.pain || "内容发布后缺少有效咨询",
      `没有用真实过程证明${product}为什么值得`,
      `没有针对${audience}设置清晰的咨询入口`,
    ],
    actions: selected.proofs.map((proof, index) => ({
      title: ["统一核心卖点", "补足信任证据", "缩短咨询路径"][index],
      detail: [
        `主页和短视频统一突出“${product}”，避免笼统介绍整家门店。`,
        `连续展示${proof}，用顾客能核实的画面替代空泛形容词。`,
        "每条内容只设置一个动作：私信预约、到店出示视频或评论询价。",
      ][index],
      evidence: proof,
    })),
    scripts: selected.proofs.map((proof, index) => ({
      title: [`为什么同样是${product}，价格会不同`, `${audience}下单前最关心什么`, `${shop}把过程直接拍给你看`][index],
      hook: [`先别急着只比价格，差别其实在这里。`, `如果你正在找${product}，先看完这几点。`, "不讲空话，我们把真实过程拍给你看。"][index],
      shots: [proof, index === 2 ? "门店位置与咨询方式" : "产品或服务细节特写"],
      voiceover: `很多顾客会担心“${selected.objections[index]}”。我们不做无法证明的承诺，直接展示${proof}。如果你是${audience}，可以先告诉我们具体需求，再判断这项服务是否适合你。`,
      cta: "评论或私信“方案”，获取具体建议。",
    })),
    reviews: {
      positive: [
        `谢谢你的认真分享，很高兴这次${product}让你满意。`,
        "感谢认可，你提到的细节我们会继续保持。",
        "谢谢支持，真实反馈对小店特别重要。",
        "很开心这次服务符合预期，期待下次见。",
        `感谢选择${shop}，也欢迎随时告诉我们改进建议。`,
      ],
      negative: [
        "很抱歉这次体验没有达到预期。请通过订单页联系我们，我们会核实后给出处理方案。",
        "谢谢你直说，我们已经记录问题，会复核当天的服务过程。",
        "抱歉让你感到不舒服。方便的话请私信订单信息，负责人会跟进。",
        "价格和服务内容应该提前说明清楚，我们会核实沟通是否存在偏差。",
        "我们理解你的失望，也不会回避问题。请联系我们说明具体环节，我们会认真处理。",
      ],
    },
    calendar: selected.proofs.concat(["价格解释", "顾客问答", "老板故事", "到店攻略"]).map((theme, index) => ({
      day: `第 ${index + 1} 天`,
      theme,
      content: index < 3 ? `用真实画面展示${theme}，说明它与${product}体验的关系。` : `围绕${theme}回答${audience}最常见的一个问题。`,
      goal: index < 3 ? "建立信任" : "促成咨询",
    })),
    salesPitch: `老板你好，我看了${shop}的线上内容，针对“${product}”做了一页具体建议。你先看回本账和第一条脚本；如果方向有用，完整体验包 99 元，24 小时交付。`,
    caveats: ["发布前核对价格、资质和门店事实", "不承诺播放量、排名或成交量", "顾客信息不得出现在公开内容中"],
  });
}

async function fetchWithTimeout(url, options, timeoutMs = config.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestCompletion(
  provider,
  model,
  brief,
  messages,
  useResponseFormat = true,
  compactRetry = false
) {
  const requestBody = {
    model,
    messages,
    temperature: compactRetry ? 0.2 : brief.mode === "reasoning" ? 0.3 : 0.55,
    max_tokens: provider.label === "兜底模型" ? 12000 : 8000,
  };
  if (useResponseFormat) requestBody.response_format = { type: "json_object" };

  return fetchWithTimeout(endpoint(provider.baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  }, Math.min(config.timeoutMs, 12000));
}

async function callProviderPart(providerName, brief, part) {
  const provider = config.providers[providerName];
  const model = modelForMode(providerName, brief.mode);
  if (!provider.enabled) {
    const error = new Error(`${provider.label}已暂停，等待可用推理 Endpoint`);
    error.noRetry = true;
    throw error;
  }
  if (!provider.baseUrl || !provider.apiKey || !model) {
    throw new Error(`${provider.label}未完成配置`);
  }

  const shape = part === "core" ? coreResponseShape : executionResponseShape;
  const partInstruction =
    part === "core"
      ? "生成核心成交提案：诊断、阻力、3 条行动、3 条脚本、销售开场和合规提醒"
      : "生成交付执行内容：正负评价回复各 5 条和 7 天内容计划";
  const userPrompt = `请为以下商家${partInstruction}：
${JSON.stringify(
    {
      门店名称: brief.shop,
      行业: brief.industry,
      客单价: brief.ticket,
      核心产品: brief.product,
      目标客群: brief.audience,
      当前问题: brief.pain,
    },
    null,
    2
)}

严格按照这个 JSON 字段结构返回，所有数组必须填满，不要返回结构之外的字段：
${JSON.stringify(shape, null, 2)}`;

  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let lastOutputError;
  for (let outputAttempt = 0; outputAttempt < 2; outputAttempt += 1) {
    const compactRetry = outputAttempt === 1;
    const messages = compactRetry
      ? [
          ...baseMessages,
          {
            role: "user",
            content:
              "上一次输出过长或不完整。请重新从头输出一份完整 JSON。必须压缩措辞、遵守所有字数上限，" +
              "不要解释，不要省略必填数组，不要输出 JSON 之外的任何字符。",
          },
        ]
      : baseMessages;

    let response = await requestCompletion(provider, model, brief, messages, true, compactRetry);
    if (!response.ok && [400, 422].includes(response.status)) {
      const firstError = await response.text();
      if (/response_format|json_object|unsupported/i.test(firstError)) {
        response = await requestCompletion(provider, model, brief, messages, false, compactRetry);
      } else {
        const error = new Error(`${provider.label}请求失败（${response.status}）：${firstError.slice(0, 240)}`);
        error.statusCode = 502;
        throw error;
      }
    }

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        detail = parsed.error?.message || parsed.message || raw;
      } catch {}
      const error = new Error(`${provider.label}请求失败（${response.status}）：${String(detail).slice(0, 240)}`);
      error.statusCode = 502;
      throw error;
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      const error = new Error(`${provider.label}响应格式异常`);
      error.statusCode = 502;
      throw error;
    }
    const choice = body.choices?.[0];
    const message = choice?.message;
    const content = message?.content || message?.reasoning_content;
    try {
      if (["length", "max_tokens"].includes(choice?.finish_reason)) {
        throw new Error("模型输出被截断");
      }
      return {
        data: validatePart(extractJson(content), part),
        provider: providerName,
        providerLabel: provider.label,
        model,
        usage: body.usage || null,
        outputRetried: compactRetry,
      };
    } catch (error) {
      lastOutputError = error;
    }
  }

  const error = new Error(`${provider.label}输出不完整，请重新生成`);
  error.statusCode = 502;
  error.cause = lastOutputError;
  throw error;
}

async function callProvider(providerName, brief) {
  const core = await callProviderPart(providerName, brief, "core");
  const execution = await callProviderPart(providerName, brief, "execution");
  return {
    data: normalizeResult({ ...core.data, ...execution.data }),
    provider: providerName,
    providerLabel: core.providerLabel,
    model: core.model,
    usage:
      core.usage || execution.usage
        ? {
            prompt_tokens:
              Number(core.usage?.prompt_tokens || 0) + Number(execution.usage?.prompt_tokens || 0),
            completion_tokens:
              Number(core.usage?.completion_tokens || 0) + Number(execution.usage?.completion_tokens || 0),
            total_tokens:
              Number(core.usage?.total_tokens || 0) + Number(execution.usage?.total_tokens || 0),
          }
        : null,
    outputRetried: core.outputRetried || execution.outputRetried,
  };
}

async function generateDeliverables(input) {
  const brief = validateBrief(input);
  const cacheKey = JSON.stringify(brief);
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.result, cached: true };
  }
  const attempts = [];
  const routes = ["ark", "fallback"];

  for (const provider of routes) {
    for (let retry = 0; retry <= config.maxRetries; retry += 1) {
      try {
        const result = await callProvider(provider, brief);
        const completed = { ...result, fallbackUsed: provider === "fallback", attempts, cached: false };
        resultCache.set(cacheKey, { createdAt: Date.now(), result: completed });
        if (resultCache.size > 100) {
          const oldestKey = resultCache.keys().next().value;
          resultCache.delete(oldestKey);
        }
        return completed;
      } catch (error) {
        attempts.push({
          provider,
          message: error.name === "AbortError" ? "请求超时" : error.message,
        });
        if (error.statusCode === 400) throw error;
        if (error.noRetry || (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429)) break;
      }
    }
  }

  const lastMessage = attempts.at(-1)?.message;
  return {
    data: makeResilientFallback(brief),
    provider: "local",
    providerLabel: "本地保障引擎",
    model: "industry-playbook-v1",
    usage: null,
    fallbackUsed: true,
    degraded: true,
    attempts,
    cached: false,
    warning: lastMessage ? "AI 通道暂时不稳定，已生成完整保障方案" : "已生成完整保障方案",
  };
}

async function checkProvider(providerName) {
  const provider = config.providers[providerName];
  const model = modelForMode(providerName, "quality");
  if (!provider.enabled) {
    return {
      provider: providerName,
      label: provider.label,
      model,
      ok: false,
      message: "已暂停，等待可用推理 Endpoint",
    };
  }
  if (!provider.baseUrl || !provider.apiKey || !model) {
    return { provider: providerName, label: provider.label, ok: false, message: "未配置" };
  }
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(
      endpoint(provider.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "只回复 OK" }],
          temperature: 0,
          max_tokens: 8,
        }),
      },
      Math.min(config.timeoutMs, 15000)
    );
    if (!response.ok) {
      const body = await response.text();
      return {
        provider: providerName,
        label: provider.label,
        model,
        ok: false,
        latencyMs: Date.now() - started,
        message: `HTTP ${response.status}: ${body.slice(0, 160)}`,
      };
    }
    return {
      provider: providerName,
      label: provider.label,
      model,
      ok: true,
      latencyMs: Date.now() - started,
      message: "连接正常",
    };
  } catch (error) {
    return {
      provider: providerName,
      label: provider.label,
      model,
      ok: false,
      latencyMs: Date.now() - started,
      message: error.name === "AbortError" ? "连接超时" : error.message,
    };
  }
}

module.exports = {
  callProvider,
  checkProvider,
  extractJson,
  generateDeliverables,
  makeResilientFallback,
  normalizeResult,
  validateBrief,
};
