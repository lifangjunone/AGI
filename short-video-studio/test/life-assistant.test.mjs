import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLifeAssistant } from "../lib/life-assistant.mjs";

test("life assistant creates a reusable today snapshot", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "zhizhu-life-"));
  const life = createLifeAssistant({ dataDirectory });
  const snapshot = await life.today("test-user");

  assert.equal(snapshot.weather.source, "local-template");
  assert.equal(snapshot.tasks.length, 3);

  const tasks = await life.saveTasks("test-user", [
    { id: "one", title: "带伞", done: true }
  ]);
  assert.deepEqual(tasks, [{ id: "one", title: "带伞", done: true }]);
  assert.equal((await life.today("test-user")).tasks[0].done, true);
});

test("life assistant creates photo copy and chore steps without exposing photo data", () => {
  const life = createLifeAssistant({ dataDirectory: os.tmpdir() });
  const copy = life.createPhotoCopy({ photoCount: 4, style: "轻松分享" });
  assert.equal(copy.photoCount, 4);
  assert.equal(copy.order.join(","), "1,2,3,4");
  assert.match(copy.copy, /随手记录/);

  const chore = life.splitChore("周末搬家");
  assert.equal(chore.steps.length, 5);
  assert.match(chore.steps[0], /周末搬家/);
});
