import { describe, expect, it, vi } from "vitest";
vi.mock("./db/client.js", () => ({
  db: { query: { blocks: { findFirst: async () => null } } },
  pool: { query: async () => ({ rows: [{ owner_id: "alice", peer_id: "bob" }] }) }
}));
vi.mock("./agent-service.js", async original => ({
  ...await original<typeof import("./agent-service.js")>(),
  generateAgentReply: async () => ({ status: "paused" })
}));
vi.mock("./auth.js", async original => ({
  ...await original<typeof import("./auth.js")>(),
  resolveUser: async (request: { headers: Record<string, string> }) =>
    request.headers["x-test-user"] ? { id: request.headers["x-test-user"] } : null
}));
vi.mock("./repository.js", async original => ({
  ...await original<typeof import("./repository.js")>(),
  ensureUser: async (identity: { id: string }) => ({ id: identity.id }),
  getConversation: async () => ({ conversation: { ownerId: "alice", peerId: "bob", participantState: "active" } }),
  addMessage: async () => ({ id: "saved-message" }),
  audit: async () => undefined
}));
import { buildServer } from "./server.js";

describe("event socket handshake security", () => {
  it("delivers conversation notifications to both participants but not a third connected account", async () => {
    const app = buildServer();
    const sockets: Awaited<ReturnType<typeof app.injectWS>>[] = [];
    try {
      await app.ready();
      const received = { alice: [] as string[], bob: [] as string[], outsider: [] as string[] };
      let resolveBob!: () => void;
      const bobMessage = new Promise<void>(resolve => { resolveBob = resolve; });
      for (const user of ["alice", "bob", "outsider"] as const) {
        sockets.push(await app.injectWS("/api/v1/events", { headers: { "x-test-user": user } }, {
          onInit: socket => socket.on("message", (bytes: unknown) => {
            const event = JSON.parse(String(bytes)) as { type: string };
            received[user].push(event.type);
            if (user === "bob" && event.type === "conversation.message") resolveBob();
          })
        }));
      }
      const response = await app.inject({
        method: "POST", url: "/api/v1/conversations/thread/messages",
        headers: { "x-test-user": "alice" }, payload: { content: "你好" }
      });
      expect(response.statusCode).toBe(201);
      await bobMessage;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(received.alice).toContain("conversation.message");
      expect(received.bob).toContain("conversation.message");
      expect(received.outsider).not.toContain("conversation.message");
    } finally {
      await Promise.all(sockets.map(socket => new Promise<void>(resolve => {
        socket.once("close", () => resolve()); socket.close();
      })));
      await app.close();
    }
  });
  it("denies anonymous socket connections", async () => {
    const app = buildServer();
    try {
      await app.ready();
      await expect(app.injectWS("/api/v1/events")).rejects.toThrow("401");
    } finally { await app.close(); }
  });
  it("denies a cross-site origin even with an authenticated identity", async () => {
    const app = buildServer();
    try {
      await app.ready();
      await expect(app.injectWS("/api/v1/events", { headers: {
        "x-test-user": "alice", origin: "https://untrusted.example"
      } })).rejects.toThrow("403");
    } finally { await app.close(); }
  });
  it("accepts an authenticated socket", async () => {
    const app = buildServer();
    try {
      await app.ready();
      const socket = await app.injectWS("/api/v1/events", { headers: { "x-test-user": "alice" } });
      expect(socket.readyState).toBe(1);
      const closed = new Promise<void>(resolve => socket.once("close", () => resolve()));
      socket.close();
      await closed;
    } finally { await app.close(); }
  });
});
