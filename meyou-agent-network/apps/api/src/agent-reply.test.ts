import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversation: vi.fn(), agent: vi.fn(), draft: vi.fn(), escalate: vi.fn(),
  audit: vi.fn(), message: vi.fn(), complete: vi.fn(), current: vi.fn(),
  values: vi.fn(), notification: vi.fn()
}));
vi.mock("./db/client.js", () => ({
  db: {
    query: {
      users: { findFirst: async () => ({ displayName: "测试用户", goals: [], interests: [] }) },
      notifications: { findFirst: mocks.notification }
    },
    insert: () => ({ values: mocks.values })
  }
}));
vi.mock("./repository.js", () => ({
  getConversation: mocks.conversation, getAgentForUser: mocks.agent,
  createReplyDraft: mocks.draft, escalateConversation: mocks.escalate,
  audit: mocks.audit, addMessage: mocks.message,
  candidatePool: vi.fn(), createOrGetConversation: vi.fn(),
  datingCandidatePool: vi.fn(), saveMatch: vi.fn()
}));
vi.mock("./model.js", async importOriginal => ({
  ...await importOriginal<typeof import("./model.js")>(),
  modelProvider: { completeDetailed: mocks.complete },
  assertModelExecutionCurrent: mocks.current
}));
import { generateAgentReply } from "./agent-service.js";

function conversation(state = "active") {
  return { conversation: { agentMode: "auto", participantState: state },
    messages: [{ id: "source", senderId: "visitor", content: "介绍一下自己" }] };
}
function agent(mode = "auto") {
  return { name: "测试 Agent", modes: { personal: mode }, tone: "友好", boundaries: [] };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversation.mockResolvedValue(conversation());
  mocks.agent.mockResolvedValue(agent());
  mocks.complete.mockResolvedValue({
    content: "我是 Agent，很高兴认识你。", provider: "configured-provider",
    model: "configured-model", source: "database", configurationId: "internal"
  });
  mocks.current.mockResolvedValue(undefined);
  mocks.message.mockResolvedValue({ id: "reply" });
  mocks.values.mockResolvedValue(undefined);
  mocks.notification.mockResolvedValue({ id: "existing-notification" });
});
describe("personal reply publication boundary", () => {
  it("escalates unsafe model output without sending it automatically", async () => {
    mocks.complete.mockResolvedValue({
      content: "我保证付款并签合同。", provider: "configured-provider",
      model: "configured-model", source: "database", configurationId: "internal"
    });
    expect((await generateAgentReply("conversation", "owner")).status).toBe("waiting_human");
    expect(mocks.draft).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "owner", sourceMessageId: "source", content: "我保证付款并签合同。"
    }));
    expect(mocks.escalate).toHaveBeenCalledWith("owner", "conversation", expect.any(String));
    expect(mocks.message).not.toHaveBeenCalled();
  });
  it("does not send after the participant enters waiting-human during generation", async () => {
    mocks.conversation.mockResolvedValueOnce(conversation()).mockResolvedValueOnce(conversation("waiting_human"));
    expect((await generateAgentReply("conversation", "owner")).status).toBe("paused");
    expect(mocks.message).not.toHaveBeenCalled();
    expect(mocks.draft).not.toHaveBeenCalled();
  });
  it("retains a draft when automatic permission changes to confirmation during generation", async () => {
    mocks.agent.mockResolvedValueOnce(agent()).mockResolvedValueOnce(agent("confirm"));
    expect((await generateAgentReply("conversation", "owner")).status).toBe("pending");
    expect(mocks.draft).toHaveBeenCalledOnce();
    expect(mocks.message).not.toHaveBeenCalled();
  });
  it("rejects a stale model execution before creating any reply or draft", async () => {
    mocks.current.mockRejectedValueOnce(new Error("model_configuration_changed"));
    await expect(generateAgentReply("conversation", "owner")).rejects.toThrow("model_configuration_changed");
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.message).not.toHaveBeenCalled();
  });
  it("records the actual model provider for permitted automatic replies", async () => {
    expect((await generateAgentReply("conversation", "owner")).status).toBe("sent");
    expect(mocks.message).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { provider: "configured-provider", model: "configured-model",
        configurationSource: "database", disclosed: true }
    }));
  });
});
