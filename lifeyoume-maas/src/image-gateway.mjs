import { randomUUID } from "node:crypto";
import { selectRoute } from "./gateway.mjs";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function imageResult(item) {
  if (!item || typeof item !== "object") throw fail(502, "invalid_image_response", "Provider returned an invalid image.");
  if (typeof item.url === "string" && !item.b64_json) {
    let url;
    try { url = new URL(item.url); } catch { /* rejected below */ }
    if (!url || url.protocol !== "https:" || url.username || url.password || item.url.length > 8192) {
      throw fail(502, "invalid_image_response", "Image URL must use HTTPS without embedded credentials.");
    }
    // Return the link; never fetch a provider-selected URL on the gateway host.
    return { url: item.url };
  }
  if (typeof item.b64_json === "string" && !item.url
    && item.b64_json.length <= 12 * 1024 * 1024
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.b64_json)) {
    const bytes = Buffer.from(item.b64_json, "base64");
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WEBP";
    if (png || jpeg || webp) return { b64_json: item.b64_json };
  }
  throw fail(502, "invalid_image_response", "Provider must return an HTTPS URL or base64 PNG/JPEG/WebP.");
}

export async function imageGeneration(store, auth, payload, requestSignal) {
  if (typeof payload?.prompt !== "string" || !payload.prompt.trim() || payload.prompt.length > 4000) {
    throw fail(400, "invalid_image_prompt", "prompt must contain 1-4000 characters.");
  }
  const n = payload.n ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    throw fail(400, "invalid_image_count", "n must be an integer between 1 and 4.");
  }
  const format = payload.response_format ?? "url";
  if (!["url", "b64_json"].includes(format)) {
    throw fail(400, "invalid_image_format", "response_format must be url or b64_json.");
  }
  if (payload.size !== undefined && !["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024", "auto"].includes(payload.size)) {
    throw fail(400, "invalid_image_size", "Unsupported image size.");
  }
  for (const [name, values] of [["quality", ["auto", "standard", "hd", "low", "medium", "high"]],
    ["style", ["vivid", "natural"]]]) {
    if (payload[name] !== undefined && !values.includes(payload[name])) {
      throw fail(400, `invalid_image_${name}`, `Unsupported ${name}.`);
    }
  }
  const { logicalModel, deployment, provider } = selectRoute(
    store, String(payload.model || ""), auth.application, "image.generation"
  );
  if (provider.kind === "internal") {
    throw fail(503, "image_provider_not_supported", "Images require an OpenAI-compatible supplier.");
  }
  const requestId = randomUUID();
  const started = performance.now();
  let status = 502;
  let outputUnits = 0;
  try {
    const signals = [AbortSignal.timeout(deployment.timeoutMs || 120000)];
    if (requestSignal instanceof AbortSignal) signals.push(requestSignal);
    const response = await fetch(`${provider.baseUrl}/images/generations`, {
      method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${store.decrypt(provider.secretEncrypted)}`,
        "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({
        model: deployment.upstreamModel, prompt: payload.prompt, n, response_format: format,
        ...Object.fromEntries(["size", "quality", "style"].filter(key => payload[key] !== undefined)
          .map(key => [key, payload[key]]))
      }),
      signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals)
    });
    if (!response.ok) {
      await response.body?.cancel();
      status = response.status === 429 ? 429 : 502;
      throw fail(status, "image_provider_error", `Image provider returned HTTP ${response.status}.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw fail(502, "invalid_image_response", "Provider returned no image body.");
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16 * 1024 * 1024) {
          await reader.cancel();
          throw fail(502, "image_response_too_large", "Image response exceeds 16 MiB.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw fail(502, "invalid_image_response", "Provider returned invalid image JSON."); }
    if (!Array.isArray(result?.data) || !result.data.length || result.data.length > n) {
      throw fail(502, "invalid_image_response", "Provider returned an invalid image list.");
    }
    const data = result.data.map(imageResult);
    if (data.some(item => format === "url" ? !item.url : !item.b64_json)) {
      throw fail(502, "invalid_image_response", "Provider returned a different image format than requested.");
    }
    outputUnits = data.length;
    status = 200;
    return { status, requestId, deploymentId: deployment.id,
      body: { created: Number.isSafeInteger(result.created) && result.created >= 0 ? result.created : Math.floor(Date.now() / 1000),
        model: logicalModel.id, data,
        maas: { requestId, deployment: deployment.id, latencyMs: Math.round(performance.now() - started) } } };
  } catch (cause) {
    if (cause.status) throw cause;
    if (cause.name === "TimeoutError") {
      status = 504;
      throw fail(504, "image_timeout", "Image provider exceeded the request deadline.");
    }
    if (requestSignal?.aborted) {
      status = 499;
      throw fail(499, "image_cancelled", "Image request was cancelled.");
    }
    throw fail(502, "image_provider_unreachable", "Unable to reach the image provider.");
  } finally {
    await store.recordUsage({ requestId, applicationId: auth.application.id, keyId: auth.key.id,
      logicalModel: logicalModel.id, deploymentId: deployment.id, capability: "image.generation",
      status, latencyMs: Math.round(performance.now() - started),
      inputUnits: 0, outputUnits });
  }
}
