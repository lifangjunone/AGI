import { randomUUID } from "node:crypto";
import { visionMessages } from "./vision-input.mjs";

function error(status, code, message) {
  const value = new Error(message);
  value.status = status;
  value.code = code;
  return value;
}

function requestTimeoutSignal(requestSignal, timeoutMs) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (requestSignal instanceof AbortSignal) signals.unshift(requestSignal);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function safeProviderMessage(status) {
  return status ? `Provider returned HTTP ${status}.` : "Unable to reach the provider.";
}

export async function testProviderConnection(store, payload, requestSignal, providerId = "provider-ark", deploymentId) {
  const saved = store.state.providers.find((item) => item.id === providerId);
  const deployment = store.state.deployments.find((item) => item.providerId === providerId
    && (!deploymentId || item.id === deploymentId));
  if (!saved || !deployment) throw error(404, "provider_not_found", "Provider is not configured.");
  const baseUrl = String(payload?.baseUrl || saved.baseUrl || "").trim().replace(/\/$/, "");
  const apiKey = String(payload?.apiKey || "").trim()
    || (saved.secretEncrypted ? store.decrypt(saved.secretEncrypted) : "");
  if (!/^https?:\/\//.test(baseUrl)) throw error(400, "invalid_provider_base_url", "请输入有效的 HTTP(S) Endpoint。");
  if (!apiKey) throw error(400, "provider_credential_not_configured", "请先填写或保存 API Key。");
  const timeoutMs = Math.min(15_000, Math.max(3_000, Number(payload?.timeoutMs || 10_000)));
  const upstreamModel = String(payload?.upstreamModel ?? deployment.upstreamModel ?? "").trim();
  const started = performance.now();
  const result = (code, latencyMs, message) => ({
    ok: code === "model_confirmed", code, latencyMs, message, deploymentId: deployment.id,
    upstreamModel, inferenceVerified: false
  });
  try {
    const upstream = await fetch(`${baseUrl}/models`, {
      redirect: "error",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: requestTimeoutSignal(requestSignal, timeoutMs)
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!upstream.ok) {
      return result([401, 403].includes(upstream.status) ? "authentication_failed" : "directory_unavailable",
        latencyMs, safeProviderMessage(upstream.status));
    }
    const reader = upstream.body?.getReader();
    if (!reader) return result("directory_unavailable", latencyMs, "认证接口未返回模型目录，无法核验上游 Model ID。");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return result("directory_unavailable", latencyMs, "模型目录超过 1 MiB，无法完成核验。");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let directory;
    try { directory = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return result("directory_unavailable", latencyMs, "认证接口未返回有效 JSON 模型目录，无法核验上游 Model ID。"); }
    if (!Array.isArray(directory?.data)) {
      return result("directory_unavailable", latencyMs, "供应商未返回兼容模型目录，请核对文档与实际调用。");
    }
    if (!upstreamModel || !directory.data.some(item => item?.id === upstreamModel)) {
      return result("model_not_listed", latencyMs, "上游 Model ID 不在供应商返回的目录中。请核对 ID 与供应商文档；本次未执行推理，不能据此断言模型不存在。");
    }
    return result("model_confirmed", latencyMs, "上游 Model ID 已在目录中确认；尚未验证实际推理。");
  } catch (cause) {
    const latencyMs = Math.round(performance.now() - started);
    if (cause.name === "TimeoutError") {
      return result("connection_failed", latencyMs, `连接测试超过 ${Math.round(timeoutMs / 1000)} 秒。`);
    }
    return result("connection_failed", latencyMs, safeProviderMessage());
  }
}

export function selectRoute(store, logicalModelId, application, expectedCapability) {
  if (!application.allowedModels.includes(logicalModelId)) {
    throw error(403, "model_not_allowed", `Application ${application.id} cannot call ${logicalModelId}.`);
  }
  const logicalModel = store.state.logicalModels.find((item) => item.id === logicalModelId && item.enabled);
  if (!logicalModel) throw error(404, "model_not_found", "Logical model is not available.");
  if (expectedCapability && logicalModel.capability !== expectedCapability) {
    throw error(400, "capability_mismatch", `${logicalModelId} does not support ${expectedCapability}.`);
  }
  const routes = [...logicalModel.routes].sort((a, b) => a.priority - b.priority);
  for (const route of routes) {
    const deployment = store.state.deployments.find((item) => item.id === route.deploymentId && item.enabled);
    if (!deployment) continue;
    const provider = store.state.providers.find((item) => item.id === deployment.providerId && item.enabled);
    if (provider && (provider.kind === "internal" || provider.secretEncrypted)) {
      return { logicalModel, deployment, provider };
    }
  }
  throw error(503, "no_healthy_deployment", "No enabled deployment is available.");
}

export async function chatCompletion(store, auth, payload, requestSignal) {
  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length) {
    throw error(400, "invalid_request", "messages must be a non-empty array.");
  }
  if (payload.stream) {
    throw error(400, "stream_not_supported", "Streaming will be added after the non-streaming gateway cutover.");
  }
  const logicalModelId = String(payload.model || "");
  // Authorization happens before inspecting model-specific content.
  const routed = selectRoute(store, logicalModelId, auth.application);
  const { logicalModel, deployment, provider } = routed;
  if (!["chat", "multimodal"].includes(logicalModel.capability)) {
    throw error(400, "capability_mismatch", "This model does not support chat or image understanding.");
  }
  const messages = logicalModel.capability === "multimodal" ? visionMessages(payload.messages) : payload.messages;
  const requestId = randomUUID();
  const started = performance.now();
  let status = 502;
  let responseBody;
  try {
    const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST", redirect: "error",
      headers: {
        authorization: `Bearer ${store.decrypt(provider.secretEncrypted)}`,
        "content-type": "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify({ ...payload, messages, model: deployment.upstreamModel, stream: false }),
      signal: requestTimeoutSignal(requestSignal, deployment.timeoutMs || 120_000)
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw error(502, "provider_error", `Provider returned HTTP ${upstream.status}.`);
    }
    const reader = upstream.body?.getReader();
    if (!reader) throw error(502, "invalid_upstream_response", "Provider returned no chat body.");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw error(502, "chat_response_too_large", "Chat response exceeds 8 MiB.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    try { responseBody = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw error(502, "invalid_upstream_response", "Provider returned invalid chat JSON."); }
    if (!responseBody || !Array.isArray(responseBody.choices) || !responseBody.choices.length) {
      throw error(502, "invalid_upstream_response", "Provider returned an invalid chat response.");
    }
    status = 200;
    responseBody.model = logicalModel.id;
    responseBody.maas = {
      requestId,
      deployment: deployment.id,
      provider: provider.id,
      latencyMs: Math.round(performance.now() - started)
    };
    return { status: 200, body: responseBody, requestId, deploymentId: deployment.id };
  } catch (cause) {
    if (cause.status) throw cause;
    if (cause.name === "TimeoutError") {
      status = 504;
      throw error(504, "chat_timeout", "Chat provider exceeded the request deadline.");
    }
    if (requestSignal?.aborted) {
      status = 499;
      throw error(499, "chat_cancelled", "Chat request was cancelled.");
    }
    throw error(502, "chat_provider_unreachable", safeProviderMessage());
  } finally {
    await store.recordUsage({
      requestId,
      applicationId: auth.application.id,
      keyId: auth.key.id,
      logicalModel: logicalModel.id,
      deploymentId: deployment.id,
      capability: logicalModel.capability,
      status,
      latencyMs: Math.round(performance.now() - started),
      inputUnits: responseBody?.usage?.prompt_tokens ?? 0,
      outputUnits: responseBody?.usage?.completion_tokens ?? 0
    });
  }
}

// Text-only OpenAI-compatible embeddings. Never persist input text or vectors.
export async function embeddings(store, auth, payload, requestSignal) {
  const inputs = typeof payload?.input === "string" ? [payload.input] : payload?.input;
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 128
    || inputs.some(value => typeof value !== "string" || !value.trim())
    || inputs.reduce((total, value) => total + value.length, 0) > 100000) {
    throw error(400, "invalid_embedding_input", "input must be text or 1-128 non-empty texts, at most 100000 characters total.");
  }
  if (payload.encoding_format && payload.encoding_format !== "float") {
    throw error(400, "unsupported_embedding_encoding", "Only float encoding is supported.");
  }
  if (payload.dimensions !== undefined && (!Number.isInteger(payload.dimensions)
    || payload.dimensions < 1 || payload.dimensions > 65536)) {
    throw error(400, "invalid_embedding_dimensions", "dimensions must be an integer between 1 and 65536.");
  }
  const { logicalModel, deployment, provider } = selectRoute(
    store, String(payload.model || ""), auth.application, "embeddings"
  );
  if (provider.kind === "internal") {
    throw error(503, "embedding_provider_not_supported", "Embeddings require an OpenAI-compatible provider.");
  }
  const requestId = randomUUID();
  const started = performance.now();
  let status = 502;
  let inputUnits = 0;
  try {
    const upstream = await fetch(`${provider.baseUrl}/embeddings`, {
      method: "POST", redirect: "error",
      headers: {
        authorization: `Bearer ${store.decrypt(provider.secretEncrypted)}`,
        "content-type": "application/json", "x-request-id": requestId
      },
      body: JSON.stringify({
        model: deployment.upstreamModel, input: payload.input, encoding_format: "float",
        ...(payload.dimensions !== undefined ? { dimensions: payload.dimensions } : {})
      }),
      signal: requestTimeoutSignal(requestSignal, deployment.timeoutMs || 120000)
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw error(502, "embedding_provider_error", safeProviderMessage(upstream.status));
    }
    // Bound response allocation even when the provider omits Content-Length.
    const reader = upstream.body?.getReader();
    const chunks = [];
    let size = 0;
    if (!reader) throw error(502, "invalid_embedding_response", "Provider returned no embedding body.");
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw error(502, "embedding_response_too_large", "Embedding response exceeds 8 MiB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw error(502, "invalid_embedding_response", "Provider returned invalid embedding JSON."); }
    if (!result || !Array.isArray(result.data) || result.data.length !== inputs.length) {
      throw error(502, "invalid_embedding_response", "Provider returned an invalid embedding list.");
    }
    const seen = new Set();
    let dimensions;
    const data = result.data.map(item => {
      if (!item || !Number.isInteger(item.index) || item.index < 0 || item.index >= inputs.length
        || seen.has(item.index) || !Array.isArray(item.embedding) || !item.embedding.length
        || item.embedding.length > 65536 || item.embedding.some(value => typeof value !== "number" || !Number.isFinite(value))
        || (dimensions !== undefined && item.embedding.length !== dimensions)
        || (payload.dimensions !== undefined && item.embedding.length !== payload.dimensions)) {
        throw error(502, "invalid_embedding_response", "Provider returned invalid embedding vectors.");
      }
      seen.add(item.index);
      dimensions = item.embedding.length;
      return { object: "embedding", index: item.index, embedding: item.embedding };
    }).sort((a, b) => a.index - b.index);
    const tokens = result.usage?.prompt_tokens ?? result.usage?.total_tokens;
    inputUnits = Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : 0;
    status = 200;
    return {
      status, requestId, deploymentId: deployment.id,
      body: { object: "list", model: logicalModel.id, data,
        usage: { prompt_tokens: inputUnits, total_tokens: inputUnits },
        maas: { requestId, deployment: deployment.id, latencyMs: Math.round(performance.now() - started) } }
    };
  } catch (cause) {
    if (cause.status) throw cause;
    if (cause.name === "TimeoutError") {
      status = 504;
      throw error(504, "embedding_timeout", "Embedding provider exceeded the request deadline.");
    }
    if (requestSignal?.aborted) {
      status = 499;
      throw error(499, "embedding_cancelled", "Embedding request was cancelled.");
    }
    throw error(502, "embedding_provider_unreachable", safeProviderMessage());
  } finally {
    await store.recordUsage({
      requestId, applicationId: auth.application.id, keyId: auth.key.id,
      logicalModel: logicalModel.id, deploymentId: deployment.id, capability: "embeddings",
      status, latencyMs: Math.round(performance.now() - started), inputUnits, outputUnits: 0
    });
  }
}

export async function previewSpeech(store, payload, requestSignal) {
  const deployment = store.state.deployments.find((item) => item.id === "deployment-tts-cpu" && item.enabled);
  const provider = deployment && store.state.providers.find((item) => item.id === deployment.providerId && item.enabled);
  if (!deployment || !provider) throw error(503, "tts_not_available", "TTS Runtime is not available.");
  const input = String(payload?.input || "").trim();
  if (!input || input.length > 500) throw error(400, "invalid_request", "input must contain 1-500 characters.");
  const voice = String(payload?.voice || "voice-1");
  if (!/^voice-[0-4]$/.test(voice)) throw error(400, "invalid_voice", "voice must be voice-0 through voice-4.");
  const speed = Number(payload?.speed ?? 1);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw error(400, "invalid_speed", "speed must be between 0.5 and 2.");
  }
  const requestId = randomUUID();
  const upstream = await fetch(`${provider.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.TTS_INTERNAL_TOKEN || ""}`,
      "content-type": "application/json",
      "x-request-id": requestId
    },
    body: JSON.stringify({
      model: deployment.upstreamModel,
      voice,
      input,
      speed,
      response_format: "wav"
    }),
    signal: requestTimeoutSignal(requestSignal, 30_000)
  });
  if (!upstream.ok) {
    const detail = await upstream.json().catch(() => ({}));
    throw error(upstream.status === 429 ? 429 : 502, "tts_preview_failed", detail.error || safeProviderMessage(upstream.status));
  }
  return {
    audio: Buffer.from(await upstream.arrayBuffer()),
    requestId,
    voice: upstream.headers.get("x-tts-voice") || voice,
    modelRevision: upstream.headers.get("x-tts-model") || deployment.upstreamModel
  };
}

export async function speechSynthesis(store, auth, payload, requestSignal) {
  const logicalModelId = String(payload?.model || "lym-tts-realtime");
  const input = String(payload?.input || "").trim();
  if (!input || input.length > 500) {
    throw error(400, "invalid_request", "input must contain 1-500 characters.");
  }
  const responseFormat = String(payload.response_format || "wav").toLowerCase();
  if (responseFormat !== "wav") {
    throw error(400, "unsupported_format", "Only wav is currently supported.");
  }
  const { logicalModel, deployment, provider } = selectRoute(
    store, logicalModelId, auth.application, "audio.speech"
  );
  const internal = provider.kind === "internal";
  const voice = String(payload.voice || (internal ? "voice-1" : "")).trim();
  if (!voice || voice.length > 100 || /[\u0000-\u001f\u007f]/.test(voice)
    || (internal && !/^voice-[0-4]$/.test(voice))) {
    throw error(400, "invalid_voice", internal
      ? "voice must be voice-0 through voice-4." : "Provide the supplier's voice ID (1-100 characters).");
  }
  const speed = Number(payload.speed ?? 1);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw error(400, "invalid_speed", "speed must be between 0.5 and 2.");
  }
  const timeoutMs = internal ? 30000 : deployment.timeoutMs || 120000;
  const requestId = randomUUID();
  const started = performance.now();
  let status = 502;
  try {
    const upstream = await fetch(`${provider.baseUrl}/audio/speech`, {
      method: "POST", redirect: "error",
      headers: {
        authorization: `Bearer ${internal ? process.env.TTS_INTERNAL_TOKEN || "" : store.decrypt(provider.secretEncrypted)}`,
        "content-type": "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify({
        model: deployment.upstreamModel,
        voice,
        input,
        speed,
        response_format: responseFormat
      }),
      signal: requestTimeoutSignal(requestSignal, timeoutMs)
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      status = upstream.status === 429 ? 429 : 502;
      throw error(
        status,
        upstream.status === 429 ? "tts_queue_full" : "runtime_error",
        safeProviderMessage(upstream.status)
      );
    }
    const reader = upstream.body?.getReader();
    if (!reader) throw error(502, "invalid_speech_response", "Provider returned no audio.");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16 * 1024 * 1024) {
          await reader.cancel();
          throw error(502, "speech_response_too_large", "Audio response exceeds 16 MiB.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const audio = Buffer.concat(chunks);
    if (!internal && (audio.length < 12 || audio.toString("ascii", 0, 4) !== "RIFF"
      || audio.toString("ascii", 8, 12) !== "WAVE")) {
      throw error(502, "invalid_speech_response", "Provider did not return the requested WAV audio.");
    }
    status = 200;
    return {
      status: 200,
      audio,
      contentType: "audio/wav",
      requestId,
      deploymentId: deployment.id,
      cache: upstream.headers.get("x-tts-cache") || "unknown",
      voice: upstream.headers.get("x-tts-voice") || voice,
      modelRevision: upstream.headers.get("x-tts-model") || deployment.upstreamModel
    };
  } catch (cause) {
    if (cause.name === "TimeoutError") {
      status = 504;
      throw error(504, "tts_timeout", `Speech provider exceeded the ${Math.round(timeoutMs / 1000)} second deadline.`);
    }
    if (cause.status) throw cause;
    if (requestSignal?.aborted) {
      status = 499;
      throw error(499, "speech_cancelled", "Speech request was cancelled.");
    }
    throw error(502, "speech_provider_unreachable", safeProviderMessage());
  } finally {
    await store.recordUsage({
      requestId,
      applicationId: auth.application.id,
      keyId: auth.key.id,
      logicalModel: logicalModel.id,
      deploymentId: deployment.id,
      capability: logicalModel.capability,
      status,
      latencyMs: Math.round(performance.now() - started),
      inputUnits: input.length,
      outputUnits: 0
    });
  }
}
