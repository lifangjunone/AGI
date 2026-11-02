import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/store.mjs";

test("history queries search beyond the console window and whitelist safe fields", () => {
  const store = new StateStore("/unused", "test-master-key-over-32-characters");
  store.state.usage = Array.from({ length: 405 }, (_, i) => ({
    id: `usage-${i}`, applicationId: i > 200 ? "older-app" : "recent-app",
    status: 200, token: "must-not-leak", secretEncrypted: "must-not-leak"
  }));
  store.state.audit = Array.from({ length: 305 }, (_, i) => ({
    id: `audit-${i}`, action: i > 100 ? "older-action" : "recent-action",
    actor: "tester", apiKey: "must-not-leak"
  }));
  assert.equal(store.publicState().usage.length, 200);
  const usage = store.queryLogs("usage", new URLSearchParams("application=older-app&page=2&size=50"));
  assert.equal(usage.total, 204);
  assert.equal(usage.items.length, 50);
  assert.equal(usage.items[0].id, "usage-251");
  assert.equal(usage.retainedTotal, 405);
  assert.deepEqual(usage.filterValues, ["older-app", "recent-app"]);
  assert.equal(JSON.stringify(usage).includes("must-not-leak"), false);
  const audit = store.queryLogs("audit", new URLSearchParams("q=audit-304"));
  assert.equal(audit.total, 1);
  assert.equal(audit.items[0].id, "audit-304");
  assert.equal(audit.retentionLimit, 500);
  assert.equal(JSON.stringify(audit).includes("must-not-leak"), false);
});
