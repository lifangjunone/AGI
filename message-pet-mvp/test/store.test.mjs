import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore, sanitizePreferences } from "../src/store.mjs";

test("偏好设置会去重、清理空白并限制字段", () => {
  assert.deepEqual(
    sanitizePreferences({
      userName: " 小明 ",
      importantPeople: [" 张总 ", "", "张总", "陈曦"],
      importantGroups: ["核心群", "核心群"],
    }),
    {
      userName: "小明",
      importantPeople: ["张总", "陈曦"],
      importantGroups: ["核心群"],
    },
  );
});

test("消息和规则可持久化且重复事件不会重复写入", async () => {
  const directory = await mkdtemp(join(tmpdir(), "message-pet-test-"));
  try {
    const store = createStore(directory, []);
    await store.load();
    await store.updatePreferences({
      userName: "我",
      importantPeople: ["张总"],
      importantGroups: ["核心群"],
    });
    const message = { id: "m1", sender: "张总", content: "请确认" };
    assert.equal(await store.addMessage(message), true);
    assert.equal(await store.addMessage(message), false);

    const saved = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
    assert.equal(saved.messages.length, 1);
    assert.deepEqual(saved.preferences.importantGroups, ["核心群"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
