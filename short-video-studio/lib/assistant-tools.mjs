const TOOL_CONFIG = {
  product: { label: "商品内容包", price: "9.90" },
  article: { label: "公众号文章助手", price: "9.90" },
  social: { label: "朋友圈与社群助手", price: "4.90" }
};

function text(value, label, min = 2, max = 500) {
  const result = String(value || "").trim();
  if (result.length < min) throw new Error(`${label}至少需要 ${min} 个字符`);
  if (result.length > max) throw new Error(`${label}不能超过 ${max} 个字符`);
  return result;
}

export function assistantToolConfig(type, prices = {}) {
  const config = TOOL_CONFIG[type];
  if (!config) return null;
  return { ...config, price: prices[type] || config.price };
}

export function generateAssistantTool(input, prices = {}) {
  const type = String(input.type || "product");
  if (!TOOL_CONFIG[type]) throw new Error("暂不支持该助手类型");
  const tool = assistantToolConfig(type, prices);

  if (type === "product") {
    const product = text(input.productName, "商品名称", 2, 80);
    const audience = text(input.audience, "目标客户", 2, 120);
    const sellingPoints = text(input.sellingPoints, "核心卖点", 8, 500);
    return {
      type,
      title: `${product}商品内容包`,
      summary: `面向${audience}，围绕${sellingPoints}生成可发布内容。`,
      items: [
        `${product}适合${audience}的 3 个理由`,
        `购买${product}前，先看懂这几个细节`,
        `我把${product}放进日常使用后，最明显的变化`
      ],
      deliverables: ["10 个短视频标题", "3 条口播脚本", "3 套分镜", "7 天发布计划"],
      price: tool.price
    };
  }

  if (type === "article") {
    const topic = text(input.topic, "文章主题", 2, 120);
    const reader = text(input.reader, "目标读者", 2, 120);
    const angle = text(input.angle, "文章角度", 4, 300);
    return {
      type,
      title: `${topic}公众号文章包`,
      summary: `写给${reader}，从“${angle}”切入。`,
      items: [
        `${topic}：先把这件事讲明白`,
        `关于${topic}，普通人最容易忽略的 3 个细节`,
        `我用一个真实场景解释${topic}`
      ],
      deliverables: ["5 个文章标题", "1 个文章大纲", "开头与结尾", "配图提示词"],
      price: tool.price
    };
  }

  const scene = text(input.scene, "使用场景", 2, 120);
  const offer = text(input.offer, "活动或服务", 2, 240);
  const voice = text(input.voice, "表达语气", 2, 80);
  return {
    type,
    title: "朋友圈与社群内容包",
    summary: `围绕${scene}，用${voice}表达“${offer}”。`,
    items: [
      `${scene}，这条消息建议这样发`,
      `把${offer}说清楚，不用硬推销`,
      `适合发给老客户的一段提醒`
    ],
    deliverables: ["3 条朋友圈文案", "3 条社群公告", "5 条私聊回复", "1 个跟进节奏"],
    price: tool.price
  };
}
