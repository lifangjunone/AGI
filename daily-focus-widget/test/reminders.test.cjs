const test = require("node:test");
const assert = require("node:assert/strict");
const { getReminderCandidates, localDateKey } = require("../electron/reminders.cjs");

test("localDateKey uses the local calendar date", () => {
  assert.equal(localDateKey(new Date(2026, 8, 11, 23, 30)), "2026-09-11");
});

test("returns a due reminder once within the ten-minute window", () => {
  const now = new Date(2026, 8, 11, 9, 5);
  const tasks = [{
    id: "one",
    title: "提交方案",
    date: "2026-09-11",
    time: "09:00",
    completed: false,
    priority: "normal"
  }];

  const reminders = getReminderCandidates(tasks, {}, now);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].key, "one:due");
  assert.equal(getReminderCandidates(tasks, { "one:due": Date.now() }, now).length, 0);
});

test("skips completed and non-today tasks", () => {
  const now = new Date(2026, 8, 11, 9, 0);
  const tasks = [
    { id: "done", title: "已完成", date: "2026-09-11", time: "09:00", completed: true },
    { id: "old", title: "昨天", date: "2026-09-10", time: "09:00", completed: false }
  ];
  assert.deepEqual(getReminderCandidates(tasks, {}, now), []);
});

test("creates one contextual slot reminder for active tasks", () => {
  const now = new Date(2026, 8, 11, 15, 2);
  const tasks = [
    { id: "a", title: "整理材料", date: "2026-09-11", time: "", completed: false, priority: "high" },
    { id: "b", title: "回复邮件", date: "2026-09-11", time: "", completed: false, priority: "normal" }
  ];

  const reminders = getReminderCandidates(tasks, {}, now);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].key, "2026-09-11:slot:15");
  assert.match(reminders[0].body, /2 项/);
  assert.match(reminders[0].body, /1 项已置顶/);
});
