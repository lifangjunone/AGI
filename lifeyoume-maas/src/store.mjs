import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { logPage } from "../public/log-view.js";

const initialState = () => ({
  version: 1,
  providers: [],
  deployments: [],
  logicalModels: [],
  applications: [],
  keys: [],
  usage: [],
  audit: []
});

const now = () => new Date().toISOString();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const maskCredential = (value) => {
  const secret = String(value || "");
  if (!secret) return "";
  if (secret.length <= 8) return `${secret.slice(0, 2)}${"•".repeat(6)}`;
  return `${secret.slice(0, Math.min(5, secret.length - 4))}${"•".repeat(8)}${secret.slice(-4)}`;
};
const safeId = (value, fallback) => {
  const id = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || fallback;
};

function ensureTtsRuntime(state, env) {
  if (!state.providers.some((item) => item.id === "provider-tts-runtime")) {
    state.providers.push({
      id: "provider-tts-runtime",
      name: "Tencent CPU TTS Runtime",
      kind: "internal",
      baseUrl: env.MAAS_TTS_BASE_URL || "http://tts-runtime:43281/v1",
      secretEncrypted: "",
      enabled: true,
      createdAt: now()
    });
  }
  if (!state.deployments.some((item) => item.id === "deployment-tts-cpu")) {
    state.deployments.push({
      id: "deployment-tts-cpu",
      name: "Tencent CPU TTS",
      providerId: "provider-tts-runtime",
      upstreamModel: "sherpa-vits-zh-ll",
      capabilities: ["audio.speech"],
      enabled: true,
      health: "unknown",
      createdAt: now()
    });
  }
  const logicalModel = state.logicalModels.find((item) => item.id === "lym-tts-realtime");
  if (logicalModel) {
    logicalModel.routes ||= [];
    if (!logicalModel.routes.some((item) => item.deploymentId === "deployment-tts-cpu")) {
      logicalModel.routes.push({ deploymentId: "deployment-tts-cpu", priority: 1, weight: 100 });
    }
    logicalModel.enabled = true;
    logicalModel.managed = true;
    logicalModel.statusNote = "Tencent CPU sherpa-onnx VITS";
  }
}

export function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class StateStore {
  constructor(path, masterKey) {
    this.path = path;
    this.key = createHash("sha256").update(masterKey).digest();
    this.state = initialState();
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      this.state = { ...initialState(), ...JSON.parse(await readFile(this.path, "utf8")) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.persist();
    }
    return this.state;
  }

  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  decrypt(value) {
    const [version, iv, tag, encrypted] = String(value || "").split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("invalid_encrypted_secret");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  }

  persist() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
      await rename(temp, this.path);
    });
    return this.writeChain;
  }

  async mutate(action, actor, callback) {
    const result = callback(this.state);
    this.state.audit.unshift({
      id: randomUUID(),
      action,
      actor,
      at: now()
    });
    this.state.audit = this.state.audit.slice(0, 500);
    await this.persist();
    return result;
  }

  queryLogs(kind, params) {
    const source = kind === "usage" ? this.state.usage : this.state.audit;
    const fields = kind === "usage"
      ? ["id", "requestId", "at", "applicationId", "keyId", "logicalModel", "deploymentId", "capability", "status", "latencyMs", "inputUnits", "outputUnits"]
      : ["id", "at", "action", "actor"];
    const result = logPage(source, {
      query: String(params.get("q") || "").slice(0, 200),
      page: params.get("page"), pageSize: params.get("size"),
      filters: {
        application: params.get("application") || "",
        action: params.get("action") || "",
        status: ["success", "failed"].includes(params.get("status")) ? params.get("status") : ""
      }
    });
    return {
      ...result,
      items: result.items.map(item => Object.fromEntries(fields.filter(field => item[field] !== undefined).map(field => [field, item[field]]))),
      retainedTotal: source.length,
      retentionLimit: kind === "usage" ? 5000 : 500,
      filterValues: [...new Set(source.map(item => kind === "usage" ? item.applicationId : item.action))].filter(Boolean).sort()
    };
  }

  publicState() {
    return {
      providers: this.state.providers.map(({ secretEncrypted, ...provider }) => ({
        ...provider,
        hasCredential: Boolean(secretEncrypted),
        credentialMasked: secretEncrypted ? maskCredential(this.decrypt(secretEncrypted)) : ""
      })),
      deployments: this.state.deployments,
      logicalModels: this.state.logicalModels,
      applications: this.state.applications,
      keys: this.state.keys.map(({ tokenHash, ...key }) => key),
      usage: this.state.usage.slice(0, 200),
      audit: this.state.audit.slice(0, 100)
    };
  }

  async bootstrap(env) {
    if (this.state.applications.length) {
      const needsTtsRuntime = !this.state.providers.some((item) => item.id === "provider-tts-runtime")
        || !this.state.deployments.some((item) => item.id === "deployment-tts-cpu")
        || !this.state.logicalModels.find((item) => item.id === "lym-tts-realtime")
          ?.routes?.some((item) => item.deploymentId === "deployment-tts-cpu")
        || this.state.logicalModels.find((item) => item.id === "lym-tts-realtime")?.managed !== true;
      if (needsTtsRuntime) {
        await this.mutate("system.tts_runtime_bootstrap", "bootstrap", (state) => ensureTtsRuntime(state, env));
      }
      return;
    }
    const providerId = "provider-ark";
    const deploymentId = "deployment-chat-primary";
    const logicalModelId = "lym-chat-quality";
    const providerKey = env.MAAS_BOOTSTRAP_PROVIDER_API_KEY?.trim();
    await this.mutate("system.bootstrap", "bootstrap", (state) => {
      state.providers.push({
        id: providerId,
        name: env.MAAS_BOOTSTRAP_PROVIDER_NAME || "Ark",
        kind: "openai-compatible",
        baseUrl: (env.MAAS_BOOTSTRAP_PROVIDER_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
        secretEncrypted: providerKey ? this.encrypt(providerKey) : "",
        enabled: true,
        createdAt: now()
      });
      state.deployments.push({
        id: deploymentId,
        name: "Primary chat deployment",
        providerId,
        upstreamModel: env.MAAS_BOOTSTRAP_MODEL_ID || "configure-model-id",
        capabilities: ["chat"],
        enabled: Boolean(providerKey && env.MAAS_BOOTSTRAP_MODEL_ID),
        health: providerKey ? "unknown" : "unconfigured",
        createdAt: now()
      });
      state.logicalModels.push({
        id: logicalModelId,
        name: "高质量对话",
        capability: "chat",
        routes: [{ deploymentId, priority: 1, weight: 100 }],
        enabled: true,
        createdAt: now()
      });
      state.logicalModels.push({
        id: "lym-tts-realtime",
        name: "实时中文语音",
        capability: "audio.speech",
        routes: [],
        enabled: true,
        statusNote: "Tencent CPU sherpa-onnx VITS",
        managed: true,
        createdAt: now()
      });
      for (const [id, name] of [["meyou", "MeYou"], ["second-me", "Second Me"], ["staffdeck", "StaffDeck"]]) {
        state.applications.push({
          id,
          name,
          enabled: true,
          allowedModels: id === "second-me"
            ? [logicalModelId, "lym-tts-realtime"]
            : id === "staffdeck" ? [] : [logicalModelId],
          rpm: 60,
          monthlyBudgetCny: 200,
          createdAt: now()
        });
      }
      ensureTtsRuntime(state, env);
    });
  }

  authenticateKey(token) {
    if (!token) return null;
    const tokenHash = digest(token);
    const key = this.state.keys.find((item) => secureEqual(item.tokenHash, tokenHash) && !item.revokedAt);
    if (!key) return null;
    const application = this.state.applications.find((item) => item.id === key.applicationId && item.enabled);
    return application ? { key, application } : null;
  }

  async setApplicationModels(applicationId, payload, actor) {
    const fail = (status, code, message) => {
      throw Object.assign(new Error(message), { status, code });
    };
    const application = this.state.applications.find((item) => item.id === applicationId);
    if (!application) fail(404, "application_not_found", "应用不存在，请刷新后重试。");
    const validList = (value) => Array.isArray(value)
      && value.every((id) => typeof id === "string" && id.length > 0)
      && new Set(value).size === value.length;
    if (!validList(payload?.allowedModels) || !validList(payload?.expectedAllowedModels)) {
      fail(400, "invalid_model_permissions", "模型权限必须是无重复的模型 ID 列表。");
    }
    if (payload.allowedModels.some((id) => !this.state.logicalModels.some((model) => model.id === id))) {
      fail(400, "unknown_model", "所选模型已不存在，请重新打开授权窗口。");
    }
    const expected = new Set(payload.expectedAllowedModels);
    if (expected.size !== application.allowedModels.length
      || application.allowedModels.some((id) => !expected.has(id))) {
      fail(409, "permissions_conflict", "权限已被其他管理员修改，请重新打开授权窗口后合并。");
    }
    return this.mutate("application.models_updated", actor, () => {
      application.allowedModels = [...payload.allowedModels];
      application.updatedAt = now();
      return application;
    });
  }

  async createApplicationKey(applicationId, name, actor) {
    const application = this.state.applications.find((item) => item.id === applicationId);
    if (!application) throw new Error("application_not_found");
    const normalizedName = String(name || "").trim() || "Default service key";
    if (normalizedName.length > 80 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
      throw Object.assign(new Error("名称最多 80 个字符，不能包含控制字符。"), { status: 400, code: "invalid_key_name" });
    }
    const token = `lym_srv_${applicationId.replace(/[^a-z0-9]/gi, "_")}_${randomBytes(24).toString("base64url")}`;
    const record = {
      id: randomUUID(),
      applicationId,
      name: normalizedName,
      prefix: token.slice(0, 22),
      tokenHash: digest(token),
      createdAt: now(),
      lastUsedAt: null,
      revokedAt: null
    };
    await this.mutate("key.created", actor, (state) => state.keys.push(record));
    return { token, key: { ...record, tokenHash: undefined } };
  }

  async configurePrimaryDeployment(payload, actor) {
    const provider = this.state.providers.find((item) => item.id === "provider-ark");
    const deployment = this.state.deployments.find((item) => item.id === "deployment-chat-primary");
    if (!provider || !deployment) throw new Error("bootstrap_resources_not_found");
    const baseUrl = String(payload.baseUrl || "").trim().replace(/\/$/, "");
    const upstreamModel = String(payload.upstreamModel || "").trim();
    const apiKey = String(payload.apiKey || "").trim();
    const timeoutMs = Number(payload.timeoutMs ?? deployment.timeoutMs ?? 120_000);
    const temperature = Number(payload.temperature ?? deployment.temperature ?? 0.7);
    if (!/^https?:\/\//.test(baseUrl)) throw new Error("invalid_provider_base_url");
    if (!upstreamModel) throw new Error("upstream_model_required");
    if (!Number.isFinite(timeoutMs) || timeoutMs < 3_000 || timeoutMs > 120_000) {
      throw new Error("timeout_must_be_between_3000_and_120000");
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error("temperature_must_be_between_0_and_2");
    }
    const providerChanged = provider.baseUrl !== baseUrl || Boolean(apiKey);
    await this.mutate("deployment.primary_configured", actor, () => {
      provider.name = String(payload.providerName || provider.name).trim().slice(0, 80) || provider.name;
      provider.baseUrl = baseUrl;
      if (apiKey) provider.secretEncrypted = this.encrypt(apiKey);
      provider.updatedAt = now();
      deployment.upstreamModel = upstreamModel;
      deployment.timeoutMs = Math.round(timeoutMs);
      deployment.temperature = temperature;
      deployment.enabled = Boolean(provider.secretEncrypted);
      deployment.health = deployment.enabled ? "unknown" : "unconfigured";
      for (const item of this.state.deployments.filter(item => item.providerId === provider.id
        && (providerChanged || item.id === deployment.id))) {
        for (const field of ["lastTestAt", "lastTestStatus", "lastTestLatencyMs", "lastTestMessage", "lastTestCode"]) {
          delete item[field];
        }
        item.health = "unknown";
      }
      deployment.updatedAt = now();
    });
    return {
      provider: {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        hasCredential: Boolean(provider.secretEncrypted),
        credentialMasked: provider.secretEncrypted ? maskCredential(this.decrypt(provider.secretEncrypted)) : "",
        updatedAt: provider.updatedAt
      },
      deployment
    };
  }

  async saveModel(payload, actor, modelId = "") {
    const existingModel = modelId
      ? this.state.logicalModels.find((item) => item.id === modelId)
      : null;
    if (modelId && !existingModel) throw new Error("model_not_found");
    if (existingModel?.managed) throw new Error("managed_model_read_only");

    const logicalModelId = existingModel?.id || safeId(payload.logicalModelId, `lym-model-${randomUUID().slice(0, 8)}`);
    if (!existingModel && this.state.logicalModels.some((item) => item.id === logicalModelId)) {
      throw new Error("model_id_already_exists");
    }
    const capability = String(payload.capability || existingModel?.capability || "chat").trim();
    if (!["chat", "audio.speech", "embeddings", "image.generation", "multimodal"].includes(capability)) {
      throw new Error("unsupported_capability");
    }
    const baseUrl = String(payload.baseUrl || "").trim().replace(/\/$/, "");
    const upstreamModel = String(payload.upstreamModel || "").trim();
    const apiKey = String(payload.apiKey || "").trim();
    const timeoutMs = Number(payload.timeoutMs ?? 120_000);
    const temperature = Number(payload.temperature ?? 0.7);
    if (!/^https?:\/\//.test(baseUrl)) throw new Error("invalid_provider_base_url");
    if (!upstreamModel) throw new Error("upstream_model_required");
    if (!Number.isFinite(timeoutMs) || timeoutMs < 3_000 || timeoutMs > 120_000) {
      throw new Error("timeout_must_be_between_3000_and_120000");
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error("temperature_must_be_between_0_and_2");
    }

    const currentDeployment = existingModel?.routes?.[0]
      ? this.state.deployments.find((item) => item.id === existingModel.routes[0].deploymentId)
      : null;
    const currentProvider = currentDeployment
      ? this.state.providers.find((item) => item.id === currentDeployment.providerId)
      : null;
    if (!apiKey && !currentProvider?.secretEncrypted) throw new Error("provider_credential_required");
    const providerId = currentProvider?.id || `provider-${randomUUID()}`;
    const deploymentId = currentDeployment?.id || `deployment-${randomUUID()}`;
    const enabled = payload.enabled ?? existingModel?.enabled ?? true;
    const providerConnectionChanged = !currentProvider || currentProvider.baseUrl !== baseUrl || Boolean(apiKey);
    const connectionChanged = providerConnectionChanged || currentDeployment?.upstreamModel !== upstreamModel;

    await this.mutate(existingModel ? "model.updated" : "model.created", actor, (state) => {
      const provider = currentProvider || {
        id: providerId,
        kind: "openai-compatible",
        secretEncrypted: "",
        createdAt: now()
      };
      provider.name = String(payload.providerName || provider.name || "OpenAI-compatible").trim().slice(0, 80);
      provider.baseUrl = baseUrl;
      provider.enabled = enabled;
      provider.updatedAt = now();
      if (apiKey) provider.secretEncrypted = this.encrypt(apiKey);
      if (connectionChanged) {
        for (const field of ["lastTestAt", "lastTestStatus", "lastTestLatencyMs", "lastTestMessage"]) {
          delete provider[field];
        }
      }
      if (!currentProvider) state.providers.push(provider);

      const deployment = currentDeployment || {
        id: deploymentId,
        providerId,
        createdAt: now()
      };
      deployment.name = String(payload.deploymentName || `${logicalModelId} deployment`).trim().slice(0, 100);
      deployment.upstreamModel = upstreamModel;
      deployment.capabilities = [capability];
      deployment.timeoutMs = Math.round(timeoutMs);
      deployment.temperature = temperature;
      deployment.enabled = enabled;
      deployment.health = connectionChanged ? "unknown" : deployment.health || "unknown";
      if (connectionChanged) {
        const affected = this.state.deployments.filter(item => item.providerId === providerId
          && (providerConnectionChanged || item.id === deploymentId));
        for (const item of [...affected, deployment]) {
          for (const field of ["lastTestAt", "lastTestStatus", "lastTestLatencyMs", "lastTestMessage", "lastTestCode"]) {
            delete item[field];
          }
          item.health = "unknown";
        }
      }
      deployment.updatedAt = now();
      if (!currentDeployment) state.deployments.push(deployment);

      const logicalModel = existingModel || {
        id: logicalModelId,
        routes: [{ deploymentId, priority: 1, weight: 100 }],
        createdAt: now()
      };
      logicalModel.name = String(payload.name || logicalModel.name || logicalModelId).trim().slice(0, 100);
      logicalModel.capability = capability;
      logicalModel.enabled = enabled;
      logicalModel.updatedAt = now();
      if (!existingModel) state.logicalModels.push(logicalModel);
    });
    return { id: logicalModelId };
  }

  async setModelEnabled(modelId, enabled, actor) {
    const model = this.state.logicalModels.find((item) => item.id === modelId);
    if (!model) throw new Error("model_not_found");
    if (model.managed) throw new Error("managed_model_read_only");
    await this.mutate(enabled ? "model.enabled" : "model.disabled", actor, (state) => {
      model.enabled = enabled;
      model.updatedAt = now();
      for (const route of model.routes || []) {
        const deployment = state.deployments.find((item) => item.id === route.deploymentId);
        if (!deployment) continue;
        deployment.enabled = enabled;
        const provider = state.providers.find((item) => item.id === deployment.providerId);
        if (provider) provider.enabled = enabled;
      }
    });
    return { id: modelId, enabled };
  }

  async deleteModel(modelId, actor) {
    const model = this.state.logicalModels.find((item) => item.id === modelId);
    if (!model) throw new Error("model_not_found");
    if (model.managed || modelId === "lym-tts-realtime") throw new Error("managed_model_cannot_be_deleted");
    const deploymentIds = new Set((model.routes || []).map((item) => item.deploymentId));
    const providerIds = new Set(this.state.deployments.filter((item) => deploymentIds.has(item.id)).map((item) => item.providerId));
    await this.mutate("model.deleted", actor, (state) => {
      state.logicalModels = state.logicalModels.filter((item) => item.id !== modelId);
      state.deployments = state.deployments.filter((item) => !deploymentIds.has(item.id));
      state.providers = state.providers.filter((item) => {
        if (!providerIds.has(item.id)) return true;
        return state.deployments.some((deployment) => deployment.providerId === item.id);
      });
      for (const application of state.applications) {
        application.allowedModels = application.allowedModels.filter((id) => id !== modelId);
      }
    });
    return { id: modelId, deleted: true };
  }

  async revealProviderCredential(providerId, actor) {
    const provider = this.state.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error("provider_not_found");
    if (!provider.secretEncrypted) throw new Error("provider_credential_not_configured");
    const credential = this.decrypt(provider.secretEncrypted);
    await this.mutate("provider.credential_revealed", actor, () => {});
    return credential;
  }

  async recordProviderTest(providerId, result, actor, deploymentId = result.deploymentId) {
    const provider = this.state.providers.find((item) => item.id === providerId);
    const candidates = this.state.deployments.filter((item) => item.providerId === providerId);
    const deployment = deploymentId ? candidates.find(item => item.id === deploymentId)
      : candidates.length === 1 ? candidates[0] : null;
    if (!provider) throw new Error("provider_not_found");
    if (!deployment) throw new Error("deployment_not_found");
    await this.mutate("provider.connection_tested", actor, () => {
      deployment.lastTestAt = now();
      deployment.lastTestCode = result.code || (result.ok ? "model_confirmed" : "connection_failed");
      deployment.lastTestStatus = result.ok ? "healthy"
        : ["directory_unavailable", "model_not_listed"].includes(result.code) ? "unknown" : "failed";
      deployment.lastTestLatencyMs = result.latencyMs;
      deployment.lastTestMessage = String(result.message || "").slice(0, 240);
      deployment.health = deployment.lastTestStatus === "healthy" ? "healthy"
        : deployment.lastTestStatus === "failed" ? "unhealthy" : "unknown";
    });
    return {
      ok: result.ok,
      code: deployment.lastTestCode,
      inferenceVerified: false,
      latencyMs: result.latencyMs,
      message: deployment.lastTestMessage,
      testedAt: deployment.lastTestAt
    };
  }

  async revokeApplicationKey(keyId, actor) {
    const key = this.state.keys.find((item) => item.id === keyId && !item.revokedAt);
    if (!key) throw new Error("key_not_found");
    await this.mutate("key.revoked", actor, () => {
      key.revokedAt = now();
    });
    return { id: key.id, revokedAt: key.revokedAt };
  }

  async recordUsage(event) {
    this.state.usage.unshift({ id: randomUUID(), at: now(), ...event });
    this.state.usage = this.state.usage.slice(0, 5000);
    const key = this.state.keys.find((item) => item.id === event.keyId);
    if (key) key.lastUsedAt = now();
    await this.persist();
  }
}
