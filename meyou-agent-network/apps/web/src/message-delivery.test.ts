import { describe, expect, it } from "vitest";
import { deliveryFeedback } from "./message-delivery";

describe("message delivery feedback", () => {
  it("does not describe an agent failure as failed delivery", () => {
    const feedback = deliveryFeedback("zh-CN", { status: "unavailable", reason: "model_disabled" });
    expect(feedback).toContain("消息已送达");
    expect(feedback).toContain("请勿重复发送");
    expect(feedback).toContain("模型未启用");
  });
  it("explains owner approval and human handoff", () => {
    expect(deliveryFeedback("zh-CN", { status: "pending" })).toContain("等待本人确认");
    expect(deliveryFeedback("zh-CN", { status: "waiting_human" })).toContain("本人回复");
  });
  it("localizes system status without exposing internal errors", () => {
    const feedback = deliveryFeedback("en", { status: "unavailable", reason: "private error" });
    expect(feedback).toContain("Message delivered");
    expect(feedback).not.toMatch(/[\u4e00-\u9fff]/);
    expect(feedback).not.toContain("private error");
  });
});
