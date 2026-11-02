import { describe, expect, it, vi } from "vitest";
import { agentReplyFailureReason, settleAgentReply } from "./conversation-delivery.js";

describe("accepted message delivery", () => {
  it("keeps successful agent results intact", async () => {
    const audit = vi.fn();
    expect(await settleAgentReply(async () => ({ status: "pending" }), audit)).toEqual({ status: "pending" });
    expect(audit).not.toHaveBeenCalled();
  });
  it("returns a separate agent failure after model shutdown", async () => {
    const audit = vi.fn();
    expect(await settleAgentReply(async () => { throw new Error("model_not_configured"); }, audit))
      .toEqual({ status: "unavailable", reason: "model_disabled" });
    expect(audit).toHaveBeenCalledWith("model_disabled");
  });
  it("does not expose provider details and preserves delivery even if auditing fails", async () => {
    expect(await settleAgentReply(async () => { throw new Error("private upstream credentials"); },
      async () => { throw new Error("audit unavailable"); }))
      .toEqual({ status: "unavailable", reason: "reply_unavailable" });
  });
  it("distinguishes configuration changes, empty results and timeouts", () => {
    expect(agentReplyFailureReason(new Error("model_configuration_changed"))).toBe("model_changed");
    expect(agentReplyFailureReason(new Error("model_empty_response"))).toBe("empty_response");
    expect(agentReplyFailureReason(new DOMException("expired", "TimeoutError"))).toBe("timeout");
  });
});
