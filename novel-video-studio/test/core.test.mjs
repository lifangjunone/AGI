import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { makeConfig } from "../lib/config.mjs";
import { buildDemoBible, makeShots, ProductionPipeline } from "../lib/pipeline.mjs";
import { titleScore } from "../lib/novel-search.mjs";
import { ProjectStore } from "../lib/store.mjs";

const waitFor = async (predicate, timeout = 3000) => {
  const started = Date.now();
  while (!await predicate()) {
    if (Date.now() - started > timeout) throw new Error("condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("title matching tolerates book-title punctuation", () => {
  assert.equal(titleScore("《西游记》", "西游记"), 100);
  assert.ok(titleScore("Journey to the West", "Journey to the West: Volume I") >= 80);
  assert.equal(titleScore("", "西游记"), 0);
});

test("production capacity derives 15-minute episodes and 30-second shots", () => {
  const previous = {
    hours: process.env.DAILY_OUTPUT_HOURS,
    minutes: process.env.EPISODE_DURATION_MINUTES,
    seconds: process.env.SHOT_DURATION_SECONDS
  };
  process.env.DAILY_OUTPUT_HOURS = "72";
  process.env.EPISODE_DURATION_MINUTES = "15";
  process.env.SHOT_DURATION_SECONDS = "30";
  const config = makeConfig("/tmp/novel-video-studio");
  assert.equal(config.production.episodesPerDay, 288);
  assert.equal(config.production.shotsPerEpisode, 30);
  assert.equal(config.production.videoTasksPerDay, 8640);
  assert.equal(config.production.maxProjectConcurrency, 2);
  for (const [key, value] of Object.entries(previous)) {
    const envKey = { hours: "DAILY_OUTPUT_HOURS", minutes: "EPISODE_DURATION_MINUTES", seconds: "SHOT_DURATION_SECONDS" }[key];
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

test("episode shot plan has stable IDs and exact duration", () => {
  const shots = makeShots("西游记", 1, 30, 30);
  assert.equal(shots.length, 30);
  assert.equal(shots.reduce((total, shot) => total + shot.duration, 0), 900);
  assert.equal(shots[0].id, "E001-S001");
  assert.equal(shots[29].id, "E001-S030");
});

test("demo bible includes continuity-controlled production assets", () => {
  const config = { production: { episodeMinutes: 15, shotsPerEpisode: 30, shotSeconds: 30 } };
  const bible = buildDemoBible("西游记", { description: "公版名著" }, config);
  assert.ok(bible.characters.every((item) => item.continuityId.startsWith("CHAR-")));
  assert.ok(bible.weapons.every((item) => item.continuityId.startsWith("PROP-")));
  assert.ok(bible.locations.every((item) => item.continuityId.startsWith("LOC-")));
  assert.equal(bible.episodes[0].shots.length, 30);
});

test("project store persists updates atomically", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-studio-"));
  try {
    const store = new ProjectStore(directory);
    await store.save({ id: "one", createdAt: "2026-09-09T00:00:00.000Z", status: "queued" });
    await store.save({ id: "one", createdAt: "2026-09-09T00:00:00.000Z", status: "completed" });
    assert.equal((await store.get("one")).status, "completed");
    assert.equal((await store.list()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("live video submission fills only the configured per-project shot slots", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-video-slots-"));
  try {
    const store = new ProjectStore(directory);
    const config = {
      mode: "live",
      dataDirectory: directory,
      ark: {},
      production: {
        maxProjectConcurrency: 2,
        maxVideoConcurrency: 4,
        shotSeconds: 30
      }
    };
    const pipeline = new ProductionPipeline(config, store);
    let submitted = 0;
    pipeline.ark.createVideo = async () => ({ id: `remote-${++submitted}` });
    const episode = { status: "queued", shots: makeShots("西游记", 1, 10, 30) };
    const project = {
      id: "video-slots",
      novelName: "西游记",
      status: "running",
      createdAt: new Date().toISOString(),
      activity: [],
      episodes: [episode]
    };
    await store.save(project);
    await pipeline.submitVideoBatch(project, episode);
    assert.equal(submitted, 4);
    assert.equal(episode.shots.filter((shot) => shot.status === "submitted").length, 4);
    assert.equal(episode.shots.filter((shot) => shot.status === "queued").length, 6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pipeline pauses for explicit source confirmation and records every node artifact", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-source-gate-"));
  try {
    const store = new ProjectStore(directory);
    const sources = [
      { id: "candidate-a", title: "同名改编版", authors: "作者甲", source: "目录 A", rights: "metadata-only", score: 95 },
      { id: "candidate-b", title: "目标原著", authors: "作者乙", source: "目录 B", rights: "public-domain", score: 88, description: "正文梗概" }
    ];
    const config = {
      mode: "demo",
      dataDirectory: directory,
      ark: {},
      search: {},
      production: {
        episodeMinutes: 15,
        shotsPerEpisode: 30,
        shotSeconds: 30,
        maxProjectConcurrency: 1,
        maxVideoConcurrency: 4
      }
    };
    const pipeline = new ProductionPipeline(config, store, {
      search: async () => sources,
      loadText: async () => "目标正文"
    });

    const created = await pipeline.create("同名小说");
    await waitFor(async () => (await store.get(created.id)).status === "source-review");
    let project = await store.get(created.id);
    assert.equal(project.source, null);
    assert.equal(project.sources.length, 2);
    assert.equal(project.nodes.discover.status, "completed");
    assert.equal(project.nodes.discover.output.candidateCount, 2);

    await pipeline.confirmSource(created.id, "candidate-b");
    await waitFor(async () => (await store.get(created.id)).status === "completed");
    project = await store.get(created.id);
    assert.equal(project.source.id, "candidate-b");
    assert.equal(project.sourceConfirmed, true);
    assert.ok(["discover", "ingest", "adapt", "design", "render", "assemble"].every(
      (id) => project.nodes[id].status === "completed"
    ));
    assert.equal(project.nodes.ingest.output.contentCharacters, 4);
    assert.equal(project.nodes.render.output.completedShots, 30);
    assert.equal(project.nodes.assemble.output.durationSeconds, 900);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
