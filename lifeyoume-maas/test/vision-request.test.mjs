import test from "node:test";
import assert from "node:assert/strict";
import { visionRequest } from "../public/vision-request.js";
test("workbench constructs image understanding message parts", () => {
  const result = visionRequest("vision", "描述", "https://assets.test/a.png\n\nhttps://assets.test/b.png", "low");
  assert.equal(result.messages[0].content.length, 3);
  assert.equal(result.messages[0].content[2].image_url.detail, "low");
  assert.equal(result.stream, false);
});
test("workbench rejects unsafe and excessive image links before sending", () => {
  for (const input of ["", "http://assets.test/a", "javascript:x", "https://user:secret@assets.test/a", Array(5).fill("https://assets.test/a").join("\n")]) {
    assert.throws(() => visionRequest("vision", "描述", input));
  }
});
