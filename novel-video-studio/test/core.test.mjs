import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArkClient } from "../lib/ark-client.mjs";
import { DEFAULT_ARK_MODELS, makeConfig } from "../lib/config.mjs";
import { buildDemoBible, makeShots, ProductionPipeline } from "../lib/pipeline.mjs";
import { searchNovel, titleScore } from "../lib/novel-search.mjs";
import { loadSourceRegistry, sanitizeSources } from "../lib/source-registry.mjs";
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

test("default source registry includes exact Qiu Mo candidates and validates custom domains", async () => {
  const config = makeConfig(process.cwd());
  const sources = await loadSourceRegistry(config.search);
  const qidian = sources.find((source) => source.id === "qidian");
  const hetushu = sources.find((source) => source.id === "hetushu");
  assert.equal(qidian.knownBooks[0].url, "https://www.qidian.com/book/2070910/");
  assert.equal(hetushu.knownBooks[0].url, "https://www.hetushu.com/book/37/index.html");
  assert.throws(() => sanitizeSources([{ name: "Invalid", domain: "localhost" }]), /有效名称或域名/);
});

test("known Qiu Mo sources survive upstream search blocking", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("blocked");
  };
  try {
    const result = await searchNovel("求魔", makeConfig(process.cwd()).search);
    assert.ok(result.candidates.some((candidate) => candidate.sourceUrl === "https://www.qidian.com/book/2070910/"));
    assert.ok(result.candidates.some((candidate) => candidate.sourceUrl === "https://www.hetushu.com/book/37/index.html"));
    assert.equal(result.searches.find((run) => run.provider === "起点中文网").status, "degraded");
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("Ark defaults use GLM planning and Seedance 2.5 video models", () => {
  const keys = ["ARK_PLANNING_MODEL", "ARK_TEXT_MODEL", "ARK_VIDEO_MODEL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const config = makeConfig("/tmp/novel-video-studio");
    assert.equal(config.ark.planningModel, DEFAULT_ARK_MODELS.planning);
    assert.equal(config.ark.textModel, DEFAULT_ARK_MODELS.planning);
    assert.equal(config.ark.videoModel, DEFAULT_ARK_MODELS.video);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Ark client sends planning and video requests to the configured models", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => requests.length === 1
        ? { choices: [{ message: { content: "{\"episodes\":[]}" } }] }
        : { id: "video-task" }
    };
  };
  try {
    const client = new ArkClient({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      planningModel: DEFAULT_ARK_MODELS.planning,
      videoModel: DEFAULT_ARK_MODELS.video
    });
    await client.generateJson("system", "user");
    await client.createVideo({ prompt: "shot", duration: 30 });
    assert.equal(requests[0].url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    assert.equal(requests[0].body.model, "glm-5-2-260617");
    assert.equal(requests[1].url, "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    assert.equal(requests[1].body.model, "doubao-seedance-2-5-260628");
    assert.equal(requests[1].body.duration, 30);
  } finally {
    globalThis.fetch = originalFetch;
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
    const searchRuns = [{
      id: "source-a",
      provider: "目录 A",
      kind: "domestic-site",
      queryUrl: "https://search.example.com/?q=test",
      status: "completed",
      candidateCount: 2,
      durationMs: 12,
      error: null
    }];
    const pipeline = new ProductionPipeline(config, store, {
      search: async () => ({
        candidates: sources,
        searches: searchRuns,
        configuredSources: [{ id: "a", name: "目录 A", domains: ["example.com"], enabled: true }]
      }),
      loadText: async () => "目标正文"
    });

    const created = await pipeline.create("同名小说");
    await waitFor(async () => (await store.get(created.id)).status === "source-review");
    let project = await store.get(created.id);
    assert.equal(project.source, null);
    assert.equal(project.sources.length, 2);
    assert.equal(project.nodes.discover.status, "completed");
    assert.equal(project.nodes.discover.output.candidateCount, 2);
    assert.deepEqual(project.searchRuns, searchRuns);
    assert.equal(project.nodes.discover.output.searchCount, 1);

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

test("authorized full-text import persists content and resumes the pipeline", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-authorized-content-"));
  try {
    const store = new ProjectStore(directory);
    const source = {
      id: "qidian-qiumo",
      title: "求魔",
      authors: "耳根",
      source: "起点中文网",
      rights: "metadata-only",
      score: 100,
      sourceUrl: "https://www.qidian.com/book/2070910/"
    };
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
      search: async () => [source],
      loadText: async () => ""
    });
    const created = await pipeline.create("求魔");
    await waitFor(async () => (await store.get(created.id)).status === "source-review");
    const content = "这是已获授权的小说正文内容。".repeat(80);
    await pipeline.importAuthorizedContent(created.id, {
      sourceId: source.id,
      content,
      fileName: "求魔-授权正文.txt",
      rightsConfirmed: true
    });
    await waitFor(async () => (await store.get(created.id)).status === "completed");
    const project = await store.get(created.id);
    assert.equal(project.source.rights, "user-provided");
    assert.equal(project.authorizedContent.characterCount, content.length);
    assert.equal(project.authorizedContent.sha256.length, 64);
    assert.equal(await readFile(path.join(directory, project.source.localContentFile), "utf8"), content);
    assert.equal(project.nodes.ingest.output.contentCharacters, content.length);
    assert.equal(project.nodes.ingest.output.importedFileName, "求魔-授权正文.txt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
