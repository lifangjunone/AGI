import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProjectStore } from "../lib/store.mjs";
import { TaskScheduler } from "../lib/task-scheduler.mjs";

const waitFor = async (predicate, timeout = 2000) => {
  const started = Date.now();
  while (!await predicate()) {
    if (Date.now() - started > timeout) throw new Error("condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("scheduler runs only configured project slots and advances queue positions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-scheduler-"));
  try {
    const store = new ProjectStore(directory);
    const gates = new Map();
    const started = [];
    const scheduler = new TaskScheduler({
      store,
      maxConcurrency: 2,
      worker: async (id) => {
        started.push(id);
        const project = await store.get(id);
        project.status = "running";
        project.startedAt = new Date().toISOString();
        await store.save(project);
        await new Promise((resolve) => gates.set(id, resolve));
        project.status = "completed";
        project.completedAt = new Date().toISOString();
        await store.save(project);
        return false;
      }
    });

    for (let index = 1; index <= 4; index += 1) {
      const id = `project-${index}`;
      await store.save({
        id,
        novelName: `作品 ${index}`,
        status: "queued",
        createdAt: `2026-09-09T00:00:0${index}.000Z`,
        activity: []
      });
      await scheduler.enqueue(id);
    }

    await waitFor(() => started.length === 2);
    assert.deepEqual(started, ["project-1", "project-2"]);
    assert.equal((await store.get("project-3")).queuePosition, 1);
    assert.equal((await store.get("project-4")).queuePosition, 2);

    gates.get("project-1")();
    await waitFor(() => started.length === 3);
    assert.equal(started[2], "project-3");
    assert.equal((await store.get("project-4")).queuePosition, 1);

    gates.get("project-2")();
    gates.get("project-3")();
    await waitFor(() => started.length === 4);
    gates.get("project-4")();
    await waitFor(async () => (await scheduler.snapshot()).activeCount === 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("scheduler restores rendering and queued work after restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-scheduler-resume-"));
  try {
    const store = new ProjectStore(directory);
    const projects = [
      { id: "rendering", status: "rendering", queuePosition: null },
      { id: "interrupted", status: "running", queuePosition: null },
      { id: "waiting", status: "queued", queuePosition: 2 }
    ];
    for (const [index, project] of projects.entries()) {
      await store.save({
        ...project,
        novelName: project.id,
        createdAt: `2026-09-09T00:00:0${index}.000Z`,
        activity: []
      });
    }

    const started = [];
    const scheduler = new TaskScheduler({
      store,
      maxConcurrency: 1,
      worker: async (id) => {
        started.push(id);
        const project = await store.get(id);
        project.status = "completed";
        project.startedAt = new Date().toISOString();
        project.completedAt = new Date().toISOString();
        await store.save(project);
        return false;
      }
    });

    await scheduler.resume();
    let snapshot = await scheduler.snapshot();
    assert.equal(snapshot.activeCount, 1);
    assert.equal(snapshot.queuedCount, 2);
    assert.deepEqual(started, []);

    const rendering = await store.get("rendering");
    rendering.status = "completed";
    rendering.completedAt = new Date().toISOString();
    await store.save(rendering);
    await scheduler.release("rendering");
    await waitFor(() => started.length === 2);
    snapshot = await scheduler.snapshot();
    assert.equal(snapshot.queuedCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
