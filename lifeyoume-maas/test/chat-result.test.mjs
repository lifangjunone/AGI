import test from "node:test";
import assert from "node:assert/strict";
import { chatAnswer } from "../public/chat-result.js";

test("chat answer supports text, text parts, refusal and tool-only responses", () => {
  assert.equal(chatAnswer({ choices: [{ message: { content: "<script>literal</script>" } }] }), "<script>literal</script>");
  assert.equal(chatAnswer({ choices: [{ message: { content: [{ type: "text", text: "一" }, { type: "image", url: "ignored" }, { type: "text", text: "二" }] } }] }), "一\n二");
  assert.match(chatAnswer({ choices: [{ message: { refusal: "无法处理" } }] }), /模型拒绝回答/);
  assert.match(chatAnswer({ choices: [{ message: { tool_calls: [{}] } }] }), /不会执行工具/);
  assert.match(chatAnswer({}), /未包含/);
});
