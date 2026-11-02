import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./db/client.js", () => ({ pool: { query } }));
import { eventAudience } from "./event-audience.js";
beforeEach(() => query.mockReset());
describe("realtime event audience", () => {
  it("uses stored conversation owners, not a caller-supplied recipient", async () => {
    query.mockResolvedValue({ rows: [{ owner_id: "alice", peer_id: "bob" }] });
    expect(await eventAudience({ type: "conversation.message", conversationId: "thread", recipientId: "outsider" }))
      .toEqual(new Set(["alice", "bob"]));
    expect(query).toHaveBeenCalledWith(expect.any(String), ["thread"]);
  });
  it("limits private circles to current owners and community members", async () => {
    query.mockResolvedValue({ rows: [
      { visibility: "private", owner_id: "owner", user_id: "member" },
      { visibility: "private", owner_id: "owner", user_id: null }
    ] });
    expect(await eventAudience({ type: "plaza.event", circleId: "circle" })).toEqual(new Set(["owner", "member"]));
  });
  it("allows public circle updates but denies missing circles", async () => {
    query.mockResolvedValueOnce({ rows: [{ visibility: "public" }] }).mockResolvedValueOnce({ rows: [] });
    expect(await eventAudience({ type: "plaza.event", circleId: "public" })).toBeNull();
    expect(await eventAudience({ type: "plaza.event", circleId: "missing" })).toEqual(new Set());
  });
  it("restricts relationship proposals to their participants", async () => {
    query.mockResolvedValue({ rows: [{ actor_id: "alice", target_user_id: "bob" }] });
    expect(await eventAudience({ type: "society.proposal_decided", proposalId: "proposal" }))
      .toEqual(new Set(["alice", "bob"]));
  });
  it("does not broadcast unknown or unscoped private events", async () => {
    expect(await eventAudience({ type: "plaza.presence", userId: "alice" })).toEqual(new Set(["alice"]));
    expect(await eventAudience({ type: "conversation.message" })).toEqual(new Set());
    expect(await eventAudience({ type: "unknown" })).toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});
