import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  add: vi.fn(), reply: vi.fn(), audit: vi.fn()
}));
vi.mock("./auth.js", async original => ({
  ...await original<typeof import("./auth.js")>(),
  resolveUser: async () => ({ id: "sender" })
}));
vi.mock("./db/client.js", () => ({
  db: { query: { blocks: { findFirst: async () => null } } }
}));
vi.mock("./repository.js", async original => ({
  ...await original<typeof import("./repository.js")>(),
  ensureUser: async () => ({ id: "sender" }),
  getConversation: async () => ({
    conversation: { ownerId: "sender", peerId: "recipient", participantState: "active" }
  }),
  addMessage: mocks.add, audit: mocks.audit
}));
vi.mock("./agent-service.js", async original => ({
  ...await original<typeof import("./agent-service.js")>(),
  generateAgentReply: mocks.reply
}));
import { buildServer } from "./server.js";

describe("conversation delivery HTTP boundary", () => {
  it("returns 201 and the saved message when the model is disabled, without inserting twice", async () => {
    mocks.add.mockResolvedValue({ id: "saved-message", content: "你好" });
    mocks.reply.mockRejectedValue(new Error("model_not_configured"));
    mocks.audit.mockResolvedValue(undefined);
    const app = buildServer();
    try {
      const response = await app.inject({
        method: "POST", url: "/api/v1/conversations/thread/messages", payload: { content: "你好" }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        message: { id: "saved-message", content: "你好" },
        delivery: "delivered", agent: { status: "unavailable", reason: "model_disabled" }
      });
      expect(mocks.add).toHaveBeenCalledOnce();
      expect(mocks.audit).toHaveBeenCalledWith("sender", "conversation.agent_reply_unavailable",
        expect.any(String), expect.objectContaining({ escalationReason: "model_disabled" }));
    } finally { await app.close(); }
  });
});
