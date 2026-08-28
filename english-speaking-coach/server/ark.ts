import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam
} from "openai/resources/chat/completions";

const baseURL =
  process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
const apiKey = process.env.ARK_API_KEY;

export const arkConfigured = Boolean(apiKey);

const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 1,
      timeout: 30_000
    })
  : undefined;

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function completeJson<T>(
  system: string,
  user: unknown,
  maxTokens = 4096
): Promise<T> {
  if (!client) throw new Error("ARK_API_KEY is not configured");

  const model = process.env.ARK_REASONING_MODEL ?? "doubao-seed-evolving";
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${system}\n只输出合法 JSON，不要输出 Markdown 代码块。`
    } satisfies ChatCompletionSystemMessageParam,
    {
      role: "user",
      content: JSON.stringify(user)
    }
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.5
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Ark returned an empty response");
  return JSON.parse(stripCodeFence(content)) as T;
}

export async function completeText(
  system: string,
  messages: ChatCompletionMessageParam[]
): Promise<string> {
  if (!client) throw new Error("ARK_API_KEY is not configured");

  const model = process.env.ARK_REASONING_MODEL ?? "doubao-seed-evolving";
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: 240,
    temperature: 0.7
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Ark returned an empty response");
  return content;
}

export async function generateSceneImage(prompt: string): Promise<string> {
  if (!client) throw new Error("ARK_API_KEY is not configured");

  const model =
    process.env.ARK_VISION_ENDPOINT ??
    process.env.ARK_IMAGE_MODEL ??
    "doubao-seedream-5-0-pro-260628";
  const response = await client.images.generate({
    model,
    prompt,
    size: "1024x1024",
    response_format: "url"
  });
  const url = response.data?.[0]?.url;
  if (!url) throw new Error("Ark returned no image");
  return url;
}
