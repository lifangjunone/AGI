const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file = path.join(__dirname, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const config = {
  timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000),
  maxRetries: Number(process.env.AI_MAX_RETRIES || 1),
  providers: {
    ark: {
      label: "火山方舟",
      enabled: process.env.ARK_ENABLED !== "false",
      baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: process.env.ARK_API_KEY || "",
      models: {
        primary: process.env.ARK_PRIMARY_MODEL || "",
        fast: process.env.ARK_FAST_MODEL || "",
        reasoning: process.env.ARK_REASONING_MODEL || "",
      },
    },
    fallback: {
      label: "兜底模型",
      enabled: process.env.FALLBACK_ENABLED !== "false",
      baseUrl: process.env.FALLBACK_BASE_URL || "",
      apiKey: process.env.FALLBACK_API_KEY || "",
      models: {
        primary: process.env.FALLBACK_MODEL || "",
      },
    },
  },
};

function publicConfig() {
  const provider = (item) => ({
    label: item.label,
    enabled: item.enabled,
    configured: Boolean(item.enabled && item.baseUrl && item.apiKey && item.models.primary),
    models: Object.fromEntries(
      Object.entries(item.models)
        .filter(([, value]) => Boolean(value))
        .map(([role, model]) => [role, model])
    ),
  });
  return {
    timeoutMs: config.timeoutMs,
    providers: {
      ark: provider(config.providers.ark),
      fallback: provider(config.providers.fallback),
    },
  };
}

module.exports = { config, loadEnv, publicConfig };
