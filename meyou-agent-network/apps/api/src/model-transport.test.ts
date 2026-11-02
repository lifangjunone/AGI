import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { modelCompletion } from "./model-transport.js";

const config = { baseUrl: "https://gateway.test/v1", modelId: "chat", apiKey: "isolated-transport-key",
  thinkingEnabled: true, temperature: 0.35, timeoutMs: 10000 };
afterEach(() => vi.unstubAllGlobals());
describe("shared model transport safety", () => {
  it.each([
    [new Response("private-upstream-body"), "model_invalid_response"],
    [Response.json({ choices: [] }), "model_empty_response"],
    [Response.json({ choices: [{ message: { content: { unsafe: true } } }] }), "model_empty_response"],
    [new Response("x".repeat(8 * 1024 * 1024 + 1)), "model_response_too_large"]
  ])("rejects malformed or oversized output with safe errors", async (response, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(modelCompletion(config, [])).rejects.toThrow(code);
  });
  it("does not forward a service key through same-origin redirects", async () => {
    let redirectedCalls = 0;
    const server = createServer((request, response) => {
      if (request.url === "/v1/chat/completions") {
        response.writeHead(307, { location: "/capture" });
        response.end();
      } else {
        redirectedCalls++;
        response.end("{}");
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing_address");
      await expect(modelCompletion({ ...config, baseUrl: `http://127.0.0.1:${address.port}/v1` }, []))
        .rejects.toThrow();
      expect(redirectedCalls).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
