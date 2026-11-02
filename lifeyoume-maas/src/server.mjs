import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chatCompletion, embeddings, previewSpeech, speechSynthesis, testProviderConnection } from "./gateway.mjs";
import { secureEqual, StateStore } from "./store.mjs";
import { imageGeneration } from "./image-gateway.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicRoot = join(root, "public");
const host = process.env.MAAS_HOST || "127.0.0.1";
const port = Number(process.env.MAAS_PORT || 43280);
const dataPath = process.env.MAAS_DATA_PATH || join(root, "data", "state.json");
const masterKey = process.env.MAAS_MASTER_KEY || (process.env.NODE_ENV === "production" ? "" : "development-master-key-change-before-production");
if (masterKey.length < 32) throw new Error("MAAS_MASTER_KEY must contain at least 32 characters.");

const store = new StateStore(dataPath, masterKey);
await store.load();
await store.bootstrap(process.env);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(body));
}

async function body(request, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("request_too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }
}

function bearer(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function clientDisconnectSignal(response) {
  const controller = new AbortController();
  response.once("close", () => {
    if (!response.writableEnded) controller.abort();
  });
  return controller.signal;
}

function adminActor(request) {
  const platformAdmin = String(request.headers["x-lifeyoume-admin-user"] || "").trim();
  if (platformAdmin) return platformAdmin;
  const configured = process.env.MAAS_ADMIN_TOKEN || "";
  if (configured && secureEqual(bearer(request), configured)) return "token-admin";
  if (process.env.NODE_ENV !== "production") return "local-developer";
  return "";
}

async function staticFile(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const path = join(publicRoot, safe);
  if (!path.startsWith(publicRoot)) return false;
  try {
    const content = await readFile(path);
    response.writeHead(200, {
      "content-type": mime[extname(path)] || "application/octet-stream",
      "cache-control": [".html", ".js", ".css"].includes(extname(path))
        ? "no-cache, must-revalidate"
        : "public, max-age=3600",
      "x-content-type-options": "nosniff"
    });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/health/live") {
      return json(response, 200, { ok: true, service: "lifeyoume-maas" });
    }
    if (request.method === "GET" && url.pathname === "/health/ready") {
      const configured = store.state.deployments.some((item) => item.enabled);
      return json(response, configured ? 200 : 503, { ok: configured, stateLoaded: true, configuredDeployment: configured });
    }
    if (request.method === "GET" && url.pathname === "/v1/models") {
      const auth = store.authenticateKey(bearer(request));
      if (!auth) return json(response, 401, { error: { code: "invalid_api_key", message: "A valid application key is required." } });
      return json(response, 200, {
        object: "list",
        data: store.state.logicalModels
          .filter((model) => model.enabled && auth.application.allowedModels.includes(model.id))
          .map((model) => ({ id: model.id, object: "model", owned_by: "lifeyoume" }))
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const auth = store.authenticateKey(bearer(request));
      if (!auth) return json(response, 401, { error: { code: "invalid_api_key", message: "A valid application key is required." } });
      const signal = clientDisconnectSignal(response);
      const result = await chatCompletion(store, auth, await body(request), signal);
      return json(response, result.status, result.body, {
        "x-lifeyoume-request-id": result.requestId,
        "x-lifeyoume-deployment": result.deploymentId
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/images/generations") {
      const auth = store.authenticateKey(bearer(request));
      if (!auth) return json(response, 401, { error: { code: "invalid_api_key", message: "A valid application key is required." } });
      const result = await imageGeneration(store, auth, await body(request), clientDisconnectSignal(response));
      return json(response, result.status, result.body, {
        "x-lifeyoume-request-id": result.requestId, "x-lifeyoume-deployment": result.deploymentId
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/embeddings") {
      const auth = store.authenticateKey(bearer(request));
      if (!auth) return json(response, 401, { error: { code: "invalid_api_key", message: "A valid application key is required." } });
      const result = await embeddings(store, auth, await body(request), clientDisconnectSignal(response));
      return json(response, result.status, result.body, {
        "x-lifeyoume-request-id": result.requestId, "x-lifeyoume-deployment": result.deploymentId
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/audio/speech") {
      const auth = store.authenticateKey(bearer(request));
      if (!auth) return json(response, 401, { error: { code: "invalid_api_key", message: "A valid application key is required." } });
      const signal = clientDisconnectSignal(response);
      const payload = await body(request);
      const result = await speechSynthesis(store, auth, payload, signal);
      response.writeHead(result.status, {
        "content-type": result.contentType,
        "content-length": result.audio.length,
        "cache-control": "private, max-age=0",
        "x-content-type-options": "nosniff",
        "x-lifeyoume-request-id": result.requestId,
        "x-lifeyoume-deployment": result.deploymentId,
        "x-lifeyoume-model-revision": result.modelRevision,
        "x-lifeyoume-voice": result.voice,
        "x-lifeyoume-cache": result.cache
      });
      return response.end(result.audio);
    }
    if (url.pathname.startsWith("/api/admin/")) {
      const actor = adminActor(request);
      if (!actor) return json(response, 401, { error: "admin_authentication_required" });
      if (request.method === "GET" && url.pathname === "/api/admin/state") {
        return json(response, 200, { actor, ...store.publicState() });
      }
      if (request.method === "GET" && ["/api/admin/usage", "/api/admin/audit"].includes(url.pathname)) {
        return json(response, 200, store.queryLogs(url.pathname.split("/").pop(), url.searchParams));
      }
      if (request.method === "PUT" && url.pathname === "/api/admin/deployments/primary") {
        const configured = await store.configurePrimaryDeployment(await body(request), actor);
        return json(response, 200, configured);
      }
      if (request.method === "POST" && url.pathname === "/api/admin/models") {
        return json(response, 201, await store.saveModel(await body(request), actor));
      }
      const modelMatch = url.pathname.match(/^\/api\/admin\/models\/([^/]+)$/);
      if (request.method === "PUT" && modelMatch) {
        return json(response, 200, await store.saveModel(
          await body(request), actor, decodeURIComponent(modelMatch[1])
        ));
      }
      if (request.method === "DELETE" && modelMatch) {
        return json(response, 200, await store.deleteModel(decodeURIComponent(modelMatch[1]), actor));
      }
      const modelStatusMatch = url.pathname.match(/^\/api\/admin\/models\/([^/]+)\/status$/);
      if (request.method === "PATCH" && modelStatusMatch) {
        const payload = await body(request);
        return json(response, 200, await store.setModelEnabled(
          decodeURIComponent(modelStatusMatch[1]), Boolean(payload.enabled), actor
        ));
      }
      const modelTestMatch = url.pathname.match(/^\/api\/admin\/models\/([^/]+)\/test$/);
      if (request.method === "POST" && modelTestMatch) {
        const model = store.state.logicalModels.find((item) => item.id === decodeURIComponent(modelTestMatch[1]));
        const deployment = model?.routes?.[0]
          ? store.state.deployments.find((item) => item.id === model.routes[0].deploymentId)
          : null;
        if (!deployment) return json(response, 404, { error: "model_not_found" });
        // A row test checks persisted configuration, never an arbitrary candidate from the body.
        await body(request);
        const snapshot = JSON.stringify([deployment.providerId, deployment.upstreamModel,
          store.state.providers.find(item => item.id === deployment.providerId)?.baseUrl,
          store.state.providers.find(item => item.id === deployment.providerId)?.secretEncrypted]);
        const result = await testProviderConnection(store, {}, undefined, deployment.providerId, deployment.id);
        const latest = store.state.deployments.find(item => item.id === deployment.id);
        const provider = store.state.providers.find(item => item.id === latest?.providerId);
        if (!latest || snapshot !== JSON.stringify([latest.providerId, latest.upstreamModel, provider?.baseUrl, provider?.secretEncrypted])) {
          return json(response, 409, { error: "配置已变更，请重新测试当前模型。" });
        }
        return json(response, 200, await store.recordProviderTest(deployment.providerId, result, actor, deployment.id));
      }
      const modelCredentialMatch = url.pathname.match(/^\/api\/admin\/models\/([^/]+)\/credential\/reveal$/);
      if (request.method === "POST" && modelCredentialMatch) {
        const model = store.state.logicalModels.find((item) => item.id === decodeURIComponent(modelCredentialMatch[1]));
        const deployment = model?.routes?.[0]
          ? store.state.deployments.find((item) => item.id === model.routes[0].deploymentId)
          : null;
        if (!deployment) return json(response, 404, { error: "model_not_found" });
        const credential = await store.revealProviderCredential(deployment.providerId, actor);
        return json(response, 200, { credential }, {
          "cache-control": "no-store, private", pragma: "no-cache"
        });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/providers/provider-ark/credential/reveal") {
        const credential = await store.revealProviderCredential("provider-ark", actor);
        return json(response, 200, { credential }, {
          "cache-control": "no-store, private",
          pragma: "no-cache"
        });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/providers/provider-ark/test") {
        const result = await testProviderConnection(store, await body(request));
        // Candidate configuration tests must not overwrite saved model health.
        return json(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/api/admin/tts/preview") {
        const result = await previewSpeech(store, await body(request));
        await store.mutate("tts.preview_generated", actor, () => {});
        response.writeHead(200, {
          "content-type": "audio/wav",
          "content-length": result.audio.length,
          "cache-control": "no-store, private",
          "x-content-type-options": "nosniff",
          "x-lifeyoume-request-id": result.requestId,
          "x-lifeyoume-model-revision": result.modelRevision,
          "x-lifeyoume-voice": result.voice
        });
        return response.end(result.audio);
      }
      const permissionsMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/models$/);
      if (request.method === "PUT" && permissionsMatch) {
        return json(response, 200, await store.setApplicationModels(
          decodeURIComponent(permissionsMatch[1]), await body(request), actor
        ));
      }
      const keyMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/keys$/);
      if (request.method === "POST" && keyMatch) {
        const payload = await body(request);
        const created = await store.createApplicationKey(decodeURIComponent(keyMatch[1]), String(payload.name || ""), actor);
        return json(response, 201, created);
      }
      const revokeMatch = url.pathname.match(/^\/api\/admin\/keys\/([^/]+)$/);
      if (request.method === "DELETE" && revokeMatch) {
        return json(response, 200, await store.revokeApplicationKey(decodeURIComponent(revokeMatch[1]), actor));
      }
      return json(response, 404, { error: "not_found" });
    }
    if (request.method === "GET" && await staticFile(url.pathname, response)) return;
    json(response, 404, { error: "not_found" });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", path: url.pathname, type: error.name, message: error.message }));
    json(response, error.status || 500, {
      error: {
        code: error.code || error.message || "internal_error",
        message: error.status && error.message ? error.message : "The MaaS request could not be completed."
      }
    });
  }
});

server.listen(port, host, () => {
  console.log(`LifeYouMe MaaS listening on http://${host}:${server.address().port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
