import test from "node:test";
import assert from "node:assert/strict";
import { logPage } from "../public/log-view.js";

const logs = Array.from({ length: 105 }, (_, index) => ({
  requestId: `request-${index}`, applicationId: index % 2 ? "app-a" : "app-b",
  logicalModel: "chat", deploymentId: "deployment-main", status: index % 3 ? 200 : 502,
  action: index % 2 ? "key.created" : "key.revoked", actor: "Tester"
}));
test("log pagination filters before slicing and clamps stale pages", () => {
  assert.equal(logPage(logs).items.length, 20);
  assert.equal(logPage(logs, { page: 6 }).items.length, 5);
  assert.equal(logPage(logs, { page: 99 }).page, 6);
  const selected = logPage(logs, { query: "DEPLOYMENT", filters: { application: "app-a", status: "failed" } });
  assert.ok(selected.items.every(item => item.applicationId === "app-a" && item.status === 502));
  assert.equal(selected.total, 17);
  assert.equal(logPage(logs, { filters: { status: "success" } }).total, 70);
  assert.equal(logPage(logs, { query: "request-104", page: 4 }).items[0].requestId, "request-104");
  const empty = logPage(logs, { query: "missing", page: 3 });
  assert.deepEqual([empty.total, empty.page, empty.pages], [0, 1, 1]);
  assert.equal(logPage(logs, { pageSize: 0 }).pageSize, 20);
});
test("audit filtering searches actors and event IDs without changing input", () => {
  const before = JSON.stringify(logs);
  const selected = logPage(logs, { query: "tester", filters: { action: "key.revoked" }, pageSize: 50 });
  assert.equal(selected.total, 53);
  assert.equal(selected.items.length, 50);
  assert.equal(JSON.stringify(logs), before);
});
