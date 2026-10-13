import { readFile } from "node:fs/promises";

const HEALTH_TTL_MS = 5 * 60 * 1000;
const MULTIMODAL_PROBE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAASUlEQVR4nO3PQQ0AIBDAsAP/nuGNAvZoFSzZOjNnyNi1dgF2AXYBdgF2AXYBdgF2AXYBdgF2AXYBdgF2AXYBdgF2AXYBdgF2AXYBdgF2AXaBD7x9AX+N6BcAAAAASUVORK5CYII=";

function isConfigured(value) {
  return Boolean(value && !/(^ep-your-|^your-|^<.+>$|your-[a-z0-9-]*host)/i.test(value));
}

function endpointOrigin(value) {
  if (!isConfigured(value)) return null;
  try {
    return new URL(value).origin;
  } catch {
    return String(value);
  }
}

function healthLabel(health) {
  if (health?.operational === true) return "可用";
  if (health?.operational === false) return "不可用";
  return "未检测";
}

function safeErrorCode(payload) {
  return payload?.error?.code || payload?.code || null;
}

function safeRequestId(response, payload) {
  return response.headers.get("x-request-id") ||
    response.headers.get("x-tt-logid") ||
    payload?.request_id ||
    null;
}

async function checkArkMultimodal(env, fetchImpl, model) {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetchImpl(
      `${env.ARK_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.ARK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "只回答 OK。" },
              { type: "image_url", image_url: { url: MULTIMODAL_PROBE_IMAGE } },
            ],
          }],
          max_tokens: 4,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    let payload = null;
    try { payload = JSON.parse(await response.text()); } catch { /* Only metadata is retained. */ }
    return {
      status: response.ok ? "operational" : "failed",
      operational: response.ok,
      checkedAt: startedAt,
      httpStatus: response.status,
      errorCode: response.ok ? null : safeErrorCode(payload),
      requestId: safeRequestId(response, payload),
      message: response.ok
        ? "图片理解请求验证通过"
        : response.status === 403
          ? "当前 API Key 无权访问该多模态模型"
          : `图片理解请求失败（HTTP ${response.status}）`,
      selectedModel: model,
    };
  } catch (error) {
    return {
      status: "failed",
      operational: false,
      checkedAt: startedAt,
      httpStatus: null,
      errorCode: error?.name === "TimeoutError" ? "Timeout" : "NetworkError",
      requestId: null,
      message: error?.name === "TimeoutError" ? "健康检查超时" : "无法连接模型服务",
      selectedModel: model,
    };
  }
}

export async function loadModelConfig(projectRoot, env, healthById = {}) {
  const raw = await readFile(`${projectRoot}/config/models.json`, "utf8");
  const registry = JSON.parse(raw);

  const models = registry.models.map((model) => {
    const missing = [];
    const checks = [
      ["API 地址", model.baseUrlEnv],
      ["API Key", model.apiKeyEnv],
      ["模型", model.modelEnv],
      ...((model.extraRequiredEnvs || []).map((name) => [name, name])),
    ].filter(([, envName]) => envName);

    for (const [label, envName] of checks) {
      if (!isConfigured(env[envName])) missing.push(label);
    }

    const health = healthById[model.id] || {
      status: missing.length ? "not_configured" : "not_checked",
      operational: missing.length ? false : null,
      checkedAt: null,
      message: missing.length ? "配置字段不完整" : "尚未执行运行检查",
    };
    const healthCheckSupported = model.id === "ark_multimodal";
    return {
      id: model.id,
      label: model.label,
      provider: model.provider,
      capabilities: model.capabilities,
      apiStyle: model.apiStyle,
      required: model.required,
      configured: missing.length === 0,
      missing,
      model:
        model.modelEnv && isConfigured(env[model.modelEnv])
          ? env[model.modelEnv]
          : null,
      endpoint: endpointOrigin(env[model.baseUrlEnv]),
      healthCheckSupported,
      health: { ...health, label: healthLabel(health) },
    };
  });

  const required = models.filter((model) => model.required);
  const runtimeGates = required.filter((model) => model.healthCheckSupported);
  const checkedRuntimeGates = runtimeGates.filter((model) => model.health.operational != null);
  const configuredReady = required.every((model) => model.configured);
  const runtimeGatesReady = runtimeGates.length > 0 &&
    runtimeGates.every((model) => model.health.operational === true);
  return {
    version: registry.version,
    billableGenerationEnabled:
      String(env.ALLOW_BILLABLE_GENERATION).toLowerCase() === "true",
    limits: {
      dailyBudgetCny: Number(env.DAILY_BUDGET_CNY || 0),
      maxConcurrency: Number(env.MAX_MODEL_CONCURRENCY || 1),
      requestTimeoutMs: Number(env.MODEL_REQUEST_TIMEOUT_MS || 120000),
    },
    summary: {
      total: models.length,
      configured: models.filter((model) => model.configured).length,
      required: required.length,
      requiredConfigured: required.filter((model) => model.configured).length,
      operational: models.filter((model) => model.health.operational === true).length,
      runtimeGates: runtimeGates.length,
      runtimeGatesChecked: checkedRuntimeGates.length,
      runtimeGatesOperational: runtimeGates.filter(
        (model) => model.health.operational === true,
      ).length,
      configuredReady,
      runtimeGatesReady,
      ready: configuredReady && runtimeGatesReady,
    },
    routing: registry.routing,
    models,
  };
}

export function createModelHealthMonitor(projectRoot, env, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const ttlMs = options.ttlMs ?? HEALTH_TTL_MS;
  const healthById = {};
  let inFlight = null;

  async function refresh({ force = false } = {}) {
    const previous = healthById.ark_multimodal;
    const fresh = previous?.checkedAt &&
      Date.now() - Date.parse(previous.checkedAt) < ttlMs;
    if (!force && fresh) return snapshot();
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const configured = isConfigured(env.ARK_API_KEY) &&
        isConfigured(env.ARK_BASE_URL) &&
        isConfigured(env.ARK_MULTIMODAL_MODEL);
      let health;
      if (configured) {
        const primary = await checkArkMultimodal(
          env, fetchImpl, env.ARK_MULTIMODAL_MODEL,
        );
        health = primary;
        if (!primary.operational && isConfigured(env.ARK_LLM_MODEL) &&
            env.ARK_LLM_MODEL !== env.ARK_MULTIMODAL_MODEL) {
          const fallback = await checkArkMultimodal(
            env, fetchImpl, env.ARK_LLM_MODEL,
          );
          health = fallback.operational
            ? {
                ...fallback,
                fallbackUsed: true,
                primaryModel: env.ARK_MULTIMODAL_MODEL,
                primaryFailure: {
                  httpStatus: primary.httpStatus,
                  errorCode: primary.errorCode,
                  requestId: primary.requestId,
                },
                message: "专用多模态不可用，已验证语言模型具备图片理解能力并接管质检",
              }
            : {
                ...primary,
                fallbackUsed: false,
                fallbackFailure: {
                  model: env.ARK_LLM_MODEL,
                  httpStatus: fallback.httpStatus,
                  errorCode: fallback.errorCode,
                  requestId: fallback.requestId,
                },
              };
        }
        if (health.operational) {
          env.ARK_QUALITY_MULTIMODAL_MODEL = health.selectedModel;
        } else {
          delete env.ARK_QUALITY_MULTIMODAL_MODEL;
        }
      } else {
        health = {
          status: "not_configured",
          operational: false,
          checkedAt: new Date().toISOString(),
          httpStatus: null,
          errorCode: "MissingConfiguration",
          requestId: null,
          message: "多模态模型配置不完整",
        };
      }
      healthById.ark_multimodal = health;
      return snapshot();
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function snapshot() {
    return loadModelConfig(projectRoot, env, healthById);
  }

  return {
    refresh,
    snapshot,
    isOperational(id) {
      return healthById[id]?.operational === true;
    },
  };
}
