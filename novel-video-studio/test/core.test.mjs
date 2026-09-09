import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { makeConfig } from "../lib/config.mjs";
import { buildDemoBible, makeShots } from "../lib/pipeline.mjs";
import { titleScore } from "../lib/novel-search.mjs";
import { ProjectStore } from "../lib/store.mjs";

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
