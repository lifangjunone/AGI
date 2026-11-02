import assert from "node:assert/strict";
import test from "node:test";
import { readNavigation, navigationHash } from "../public/navigation.js";

test("navigation round trips filters and pagination without secrets or selections", () => {
  const value = { view: "models", query: "中文模型", capability: "chat", provider: "DeepSeek",
    status: "failed", page: 3, pageSize: 20, sort: "name", apiKey: "secret", selected: ["model-a"] };
  const hash = navigationHash(value);
  assert.equal(hash.includes("secret"), false);
  assert.equal(hash.includes("model-a"), false);
  assert.deepEqual(readNavigation(hash), {
    view: "models", query: "中文模型", capability: "chat", provider: "DeepSeek",
    status: "failed", page: 3, pageSize: 20, sort: "name"
  });
});

test("invalid URL values fall back to safe navigation defaults", () => {
  const value = readNavigation("#view=bad&page=-5&size=999&status=wrong&sort=wrong");
  assert.equal(value.view, "overview");
  assert.equal(value.page, 1);
  assert.equal(value.pageSize, 10);
  assert.equal(value.status, "all");
  assert.equal(value.sort, "updated");
});
