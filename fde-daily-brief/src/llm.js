// 火山方舟调用（OpenAI 兼容 /chat/completions）。带超时、重试与 JSON 提取。
import { config } from "./config.js";

const TIMEOUT_MS = 90000;

export async function chat(messages, { temperature = 0.6, maxRetries = 2 } = {}) {
  if (!config.ark.apiKey) {
    const err = new Error("未配置 ARK_API_KEY，无法生成文章");
    err.code = "NO_ARK_KEY";
    throw err;
  }

  const endpoint = `${config.ark.baseUrl}/chat/completions`;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.ark.apiKey}`,
        },
        body: JSON.stringify({
          model: config.ark.model,
          messages,
          temperature,
          thinking: { type: "disabled" },
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`方舟接口 HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = JSON.parse(text);
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("方舟返回为空或格式异常");
      }
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * 从模型返回中提取 JSON。容忍 ```json 代码块和前后多余文字。
 * 提取最外层平衡花括号，失败则回退到首个 { 到最后一个 }。
 */
export function extractJSON(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型返回中未找到 JSON 对象");
  }

  const slice = t.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // 平衡括号兜底（应对字符串中出现花括号的极端情况）
    let depth = 0;
    for (let i = start; i <= end; i++) {
      if (t[i] === "{") depth++;
      else if (t[i] === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(t.slice(start, i + 1));
        }
      }
    }
    throw new Error("模型 JSON 无法解析");
  }
}
