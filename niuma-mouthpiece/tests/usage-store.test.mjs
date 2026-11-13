import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageStore } from "../src/usage-store.mjs";

test("usage store records successful generations and enforces a caller-provided limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "niuma-usage-"));
  try {
    const store = new UsageStore(join(directory, "usage.json"));
    await store.load();
    assert.deepEqual(store.quotaFor("visitor-a", 20), { used: 0, remaining: 20, limit: 20 });

    for (let index = 0; index < 20; index += 1) {
      await store.recordGeneration({
        visitorId: "visitor-a",
        source: "maas",
        model: { used: true, modelId: "lym-chat-quality" },
        freeLimit: 20
      });
    }

    assert.deepEqual(store.quotaFor("visitor-a", 20), { used: 20, remaining: 0, limit: 20 });
    const stats = store.adminStats();
    assert.equal(stats.totalGenerations, 20);
    assert.equal(stats.visitorCount, 1);
    assert.equal(stats.modelUsedCount, 20);
    assert.equal(stats.recent[0].userId, "");
    assert.equal("rage" in stats.recent[0], false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
