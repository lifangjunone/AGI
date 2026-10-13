import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFeishuEvent,
  verifyFeishuEvent,
} from "../src/feishu-adapter.mjs";

function eventPayload() {
  return {
    token: "secret-token",
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: {
        sender_id: { open_id: "ou_sender" },
        sender_name: "李雷",
      },
      message: {
        message_id: "om_123",
        chat_id: "oc_group",
        chat_name: "核心项目群",
        chat_type: "group",
        create_time: "1790730000000",
        content: JSON.stringify({ text: "@小明 请今天确认上线方案" }),
        mentions: [{ id: { open_id: "ou_me" }, name: "小明" }],
      },
    },
  };
}

test("飞书事件必须通过验证令牌", () => {
  assert.equal(verifyFeishuEvent(eventPayload(), "secret-token").ok, true);
  assert.equal(verifyFeishuEvent(eventPayload(), "wrong-token").ok, false);
  assert.equal(verifyFeishuEvent(eventPayload(), "").ok, false);
});

test("飞书群消息可标准化并准确识别 @我", () => {
  const message = normalizeFeishuEvent(eventPayload(), "ou_me");

  assert.equal(message.id, "feishu-om_123");
  assert.equal(message.sender, "李雷");
  assert.equal(message.group, "核心项目群");
  assert.equal(message.content, "@小明 请今天确认上线方案");
  assert.equal(message.mentionedMe, true);
});

test("未配置本人 Open ID 时不应将所有 mention 误认为 @我", () => {
  const message = normalizeFeishuEvent(eventPayload());
  assert.equal(message.mentionedMe, false);
});
