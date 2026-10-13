// 极简 .env 加载：无需 dotenv 依赖。只在文件存在时解析，不覆盖已存在的环境变量。
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const DATA_DIR = resolve(ROOT, "data");

const ENV_PATH = resolve(ROOT, ".env");
if (existsSync(ENV_PATH)) {
  const raw = readFileSync(ENV_PATH, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 去掉成对引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export const config = {
  ark: {
    apiKey: process.env.ARK_API_KEY || "",
    baseUrl: (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
    model: process.env.ARK_MODEL || "glm-5-2-260617",
  },
  schedule: process.env.SCHEDULE_CRON || "0 8 * * *",
  timezone: process.env.TIMEZONE || "Asia/Shanghai",
  port: Number(process.env.PORT || 8210),
  topic: process.env.BRIEF_TOPIC || "FDE 现场交付（企业 AI 部署、智能体落地、LLM 工程化）",
};
