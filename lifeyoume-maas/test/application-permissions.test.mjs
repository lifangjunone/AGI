import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/store.mjs";
import { selectRoute } from "../src/gateway.mjs";

test("application permissions validate atomically, audit and reject stale edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-permissions-"));
  const store = new StateStore(join(directory, "state.json"), "permissions-test-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  const created = await store.createApplicationKey("staffdeck", "test", "tester");
  const update = (allowedModels, expectedAllowedModels = []) =>
    store.setApplicationModels("staffdeck", { allowedModels, expectedAllowedModels }, "tester");
  const before = JSON.stringify(store.state);
  for (const value of [null, "chat", ["unknown"], ["lym-chat-quality", "lym-chat-quality"], [42]]) {
    await assert.rejects(() => update(value), (error) => error.status === 400);
    assert.equal(JSON.stringify(store.state), before);
  }
  await assert.rejects(
    () => store.setApplicationModels("missing", { allowedModels: [], expectedAllowedModels: [] }, "tester"),
    (error) => error.status === 404
  );
  await assert.rejects(() => store.setApplicationModels("staffdeck", { allowedModels: [] }, "tester"),
    (error) => error.status === 400);
  assert.throws(() => selectRoute(store, "lym-tts-realtime", store.authenticateKey(created.token).application),
    (error) => error.status === 403);
  await update(["lym-tts-realtime", "lym-chat-quality"]);
  assert.equal(store.state.audit[0].action, "application.models_updated");
  assert.equal(store.state.audit[0].actor, "tester");
  assert.equal(selectRoute(store, "lym-tts-realtime", store.authenticateKey(created.token).application).logicalModel.id,
    "lym-tts-realtime");
  const granted = JSON.stringify(store.state);
  await assert.rejects(() => update([]), (error) => error.status === 409);
  assert.equal(JSON.stringify(store.state), granted);
  // Reordered expected permissions are equivalent; disabled models may retain authorization.
  await update([], ["lym-chat-quality", "lym-tts-realtime"]);
  assert.throws(() => selectRoute(store, "lym-tts-realtime", store.authenticateKey(created.token).application),
    (error) => error.status === 403);
  await store.load();
  assert.deepEqual(store.authenticateKey(created.token).application.allowedModels, []);
});
