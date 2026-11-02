import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  drafts: vi.fn(), conversation: vi.fn(), block: vi.fn(), participant: vi.fn(),
  insert: vi.fn(), update: vi.fn(), transaction: vi.fn()
}));
vi.mock("./db/client.js", () => ({
  db: { transaction: mocks.transaction }
}));
import { decideReplyDraft } from "./repository.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.drafts.mockResolvedValue([{ id: "draft", conversationId: "thread", ownerId: "owner", status: "pending", content: "草稿" }]);
  mocks.conversation.mockResolvedValue({ id: "thread", ownerId: "owner", peerId: "peer" });
  mocks.block.mockResolvedValue(null);
  mocks.participant.mockResolvedValue(null);
  mocks.insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: "message" }] }) });
  mocks.update.mockReturnValue({ set: () => ({ where: () => ({
    returning: async () => [{ id: "draft", status: "sent" }]
  }) }) });
  mocks.transaction.mockImplementation(async fn => fn({
    select: () => ({ from: () => ({ where: () => ({ for: mocks.drafts }) }) }),
    query: {
      conversations: { findFirst: mocks.conversation },
      blocks: { findFirst: mocks.block },
      conversationParticipants: { findFirst: mocks.participant }
    },
    insert: mocks.insert, update: mocks.update
  }));
});
describe("draft confirmation transaction", () => {
  it("locks a pending draft and commits message plus draft state in one transaction", async () => {
    expect((await decideReplyDraft("owner", "thread", "draft", true)).message).toEqual({ id: "message" });
    expect(mocks.drafts).toHaveBeenCalledWith("update");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it("rejects missing, mismatched or already processed drafts without sending", async () => {
    mocks.drafts.mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: "sent" }]);
    await expect(decideReplyDraft("owner", "wrong-thread", "draft", true)).rejects.toThrow("draft_not_found");
    await expect(decideReplyDraft("owner", "thread", "draft", true)).rejects.toThrow("draft_not_found");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not approve after either participant blocks contact", async () => {
    mocks.block.mockResolvedValueOnce({ id: "block" });
    await expect(decideReplyDraft("owner", "thread", "draft", true)).rejects.toThrow("contact_blocked");
    mocks.participant.mockResolvedValueOnce({ state: "blocked" });
    await expect(decideReplyDraft("owner", "thread", "draft", true)).rejects.toThrow("contact_blocked");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not silently replace an empty edit with the original draft", async () => {
    await expect(decideReplyDraft("owner", "thread", "draft", true, "  ")).rejects.toThrow("invalid_draft_content");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("allows dismissal without sending even when contact is blocked", async () => {
    mocks.block.mockResolvedValue({ id: "block" });
    expect((await decideReplyDraft("owner", "thread", "draft", false)).message).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
