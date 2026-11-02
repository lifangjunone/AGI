import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const legacy = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./db/client.js", () => ({
  db: { select: () => { legacy.read(); throw new Error("legacy_database_must_not_be_used"); } }
}));
vi.mock("./admin.js", () => ({ decryptModelSecret: () => { throw new Error("legacy_secret_must_not_be_used"); } }));
import { modelProvider, modelExecutionMetadata, parseModelJson } from "./model.js";
import { maasPreflight } from "./maas-preflight.js";
import { maasShadow } from "./maas-shadow.js";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("MeYou crosses the real MaaS HTTP gateway with JSON, permissions and isolated credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meyou-maas-integration-"));
  let upstreamCalls = 0;
  let upstreamFailure = false;
  const upstream = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    expect(request.headers.authorization).toBe("Bearer local-upstream-test-key");
    expect(payload.model).toBe("upstream-structured");
    expect(payload.response_format).toEqual({ type: "json_object" });
    const shadow = payload.messages[0]?.content.startsWith("Migration synthetic JSON test.");
    if (!shadow) expect(payload.thinking).toEqual({ type: "disabled" });
    expect(payload.temperature).toBe(0.35);
    expect(payload.stream).toBe(false);
    upstreamCalls++;
    response.setHeader("content-type", "application/json");
    if (upstreamFailure) {
      response.writeHead(503);
      response.end(JSON.stringify({ error: "local-upstream-test-key" }));
    } else {
      response.end(JSON.stringify({
        choices: [{ message: { content: shadow
          ? '{"probe":"meyou-maas","ok":true,"values":[2,4]}'
          : '{"reply":"集成测试成功","ok":true}' } }],
        usage: { prompt_tokens: 7, completion_tokens: 9 }
      }));
    }
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("missing_upstream_address");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../../../lifeyoume-maas/src/server.mjs", import.meta.url))], {
    env: {
      ...process.env, NODE_ENV: "development", MAAS_PORT: "0",
      MAAS_MASTER_KEY: "isolated-integration-master-key-over-32-characters",
      MAAS_DATA_PATH: join(directory, "state.json")
    },
    stdio: ["ignore", "pipe", "ignore"]
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      child.stdout.on("data", chunk => {
        const match = chunk.toString().match(/listening on (http:\/\/\S+)/);
        if (match) resolve(match[1].trim());
      });
      child.once("exit", code => reject(new Error(`gateway_exit_${code}`)));
    });
    const admin = async (path: string, method: string, body: unknown) => {
      const response = await fetch(`${base}/api/admin${path}`, {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      expect(response.ok).toBe(true);
      return response.json();
    };
    await admin("/models", "POST", {
      logicalModelId: "meyou-integration-chat", name: "MeYou integration", capability: "chat",
      providerName: "Isolated upstream", baseUrl: `http://127.0.0.1:${address.port}/v1`,
      upstreamModel: "upstream-structured", apiKey: "local-upstream-test-key"
    });
    const { token } = await admin("/applications/staffdeck/keys", "POST", { name: "isolated test" });
    vi.stubEnv("MODEL_PROVIDER_MODE", "maas");
    vi.stubEnv("MAAS_BASE_URL", `${base}/v1`);
    vi.stubEnv("MEYOU_MAAS_MODEL_ID", "meyou-integration-chat");
    vi.stubEnv("MEYOU_MAAS_SERVICE_KEY", token);
    vi.stubEnv("MODEL_TIMEOUT_MS", "10000");
    const messages = [{ role: "user" as const, content: "请返回JSON" }];
    const options = { json: true, thinking: false };
    expect((await maasPreflight(process.env)).code).toBe("model_not_available");
    expect(upstreamCalls).toBe(0);
    await expect(modelProvider.complete(messages, options)).rejects.toThrow("model_provider_error:403");
    expect(upstreamCalls).toBe(0);
    await admin("/applications/staffdeck/models", "PUT", {
      allowedModels: ["meyou-integration-chat"], expectedAllowedModels: []
    });
    expect(await maasPreflight(process.env)).toEqual({
      ok: true, code: "model_authorized", inferenceVerified: false
    });
    expect(upstreamCalls).toBe(0);
    const execution = await modelProvider.completeDetailed(messages, options);
    expect(parseModelJson(execution.content)).toEqual({ reply: "集成测试成功", ok: true });
    expect(modelExecutionMetadata(execution)).toMatchObject({ provider: "maas", model: "meyou-integration-chat" });
    expect(JSON.stringify(execution)).not.toContain(token);
    expect(JSON.stringify(execution)).not.toContain("local-upstream-test-key");
    expect(legacy.read).not.toHaveBeenCalled();
    const usage = await (await fetch(`${base}/api/admin/usage`)).json();
    expect(usage.items[0]).toMatchObject({
      logicalModel: "meyou-integration-chat", applicationId: "staffdeck", inputUnits: 7, outputUnits: 9
    });
    const shadowResult = await maasShadow(process.env, true);
    expect(shadowResult).toMatchObject({ ok: true, inferenceVerified: true });
    expect(shadowResult.checks.map(check => check.thinking)).toEqual([false, true]);
    expect(JSON.stringify(shadowResult)).not.toContain(token);
    expect(legacy.read).not.toHaveBeenCalled();
    upstreamFailure = true;
    await expect(modelProvider.complete(messages, options)).rejects.toThrow("model_provider_error:502");
    await admin("/applications/staffdeck/models", "PUT", {
      allowedModels: [], expectedAllowedModels: ["meyou-integration-chat"]
    });
    expect((await maasPreflight(process.env)).code).toBe("model_not_available");
    await expect(modelProvider.complete(messages, options)).rejects.toThrow("model_provider_error:403");
    expect(upstreamCalls).toBe(4);
    vi.stubEnv("MEYOU_MAAS_SERVICE_KEY", "invalid-local-key");
    expect((await maasPreflight(process.env)).code).toBe("invalid_service_key");
    await expect(modelProvider.complete(messages, options)).rejects.toThrow("model_provider_error:401");
    expect(legacy.read).not.toHaveBeenCalled();
  } finally {
    child.kill("SIGTERM");
    upstream.close();
  }
}, 15000);
