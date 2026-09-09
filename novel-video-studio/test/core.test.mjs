import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArkClient } from "../lib/ark-client.mjs";
import {
  DEFAULT_ARK_MODELS,
  EPISODE_DURATION_SECONDS,
  MAX_SEASON_EPISODES,
  MAX_VIDEO_SEGMENT_SECONDS,
  makeConfig
} from "../lib/config.mjs";
import {
  buildDemoBible,
  buildFallbackAdaptationPlan,
  buildSeriesBible,
  extractChapterInventory,
  makeShots,
  makeShotsForDuration,
  normalizeAdaptationPlan,
  ProductionPipeline
} from "../lib/pipeline.mjs";
import { searchNovel, titleScore } from "../lib/novel-search.mjs";
import { loadRecommendations, sanitizeRecommendations } from "../lib/recommendations.mjs";
import { BLOCKED_SOURCE_DOMAINS, loadSourceRegistry, sanitizeSources } from "../lib/source-registry.mjs";
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

test("recommendation catalog contains only trusted public-domain works", async () => {
  const catalog = await loadRecommendations();
  assert.equal(catalog.items.length, 16);
  assert.ok(catalog.items.some((item) => item.language === "中文"));
  assert.ok(catalog.items.some((item) => item.language === "英文"));
  assert.ok(catalog.items.every((item) => item.rights === "public-domain" && item.requiresAuthorization === false));
  assert.throws(() => sanitizeRecommendations({
    items: [{
      id: "unsafe",
      title: "Unsafe",
      author: "Unknown",
      sourceUrl: "https://example.com/book",
      rightsEvidenceUrl: "https://example.com/rights"
    }]
  }), /未受信任来源/);
});

test("default source registry includes audited free sources and blocks unsafe domains", async () => {
  const config = makeConfig(process.cwd());
  const sources = await loadSourceRegistry(config.search);
  const qidian = sources.find((source) => source.id === "qidian");
  const qqReading = sources.find((source) => source.id === "qq-reading");
  assert.equal(sources.length, 23);
  assert.equal(qidian.knownBooks[0].url, "https://www.qidian.com/book/2070910/");
  assert.equal(qqReading.knownBooks[0].url, "https://book.qq.com/book-detail/481326");
  assert.equal(sources.some((source) => source.id === "hetushu"), false);
  assert.equal(sources.find((source) => source.id === "gutenberg").automation, "public-domain-verify");
  assert.ok(BLOCKED_SOURCE_DOMAINS.includes("cn-qidianzww.com.cn"));
  assert.throws(() => sanitizeSources([{ name: "Invalid", domain: "localhost" }]), /有效名称或域名/);
  assert.throws(
    () => sanitizeSources([{ name: "Fake Qidian", domains: ["cn-qidianzww.com.cn"] }]),
    /拒绝名单/
  );
});

test("known Qiu Mo sources survive upstream search blocking", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("blocked");
  };
  try {
    const result = await searchNovel("求魔", makeConfig(process.cwd()).search);
    assert.ok(result.candidates.some((candidate) => candidate.sourceUrl === "https://www.qidian.com/book/2070910/"));
    assert.ok(result.candidates.some((candidate) => candidate.sourceUrl === "https://book.qq.com/book-detail/481326"));
    assert.equal(result.candidates.some((candidate) => candidate.sourceUrl.includes("hetushu.com")), false);
    assert.equal(result.searches.find((run) => run.provider === "起点免费频道").status, "degraded");
    const classic = await searchNovel("聊斋志异", makeConfig(process.cwd()).search);
    assert.equal(classic.candidates[0].source, "中文维基文库");
    assert.equal(classic.candidates[0].rights, "public-domain");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production capacity fixes episodes at five minutes and segments at 30 seconds", () => {
  const previous = {
    hours: process.env.DAILY_OUTPUT_HOURS,
    minutes: process.env.EPISODE_DURATION_MINUTES,
    seconds: process.env.SHOT_DURATION_SECONDS,
    mode: process.env.PRODUCTION_MODE
  };
  process.env.DAILY_OUTPUT_HOURS = "72";
  process.env.EPISODE_DURATION_MINUTES = "15";
  process.env.SHOT_DURATION_SECONDS = "30";
  delete process.env.PRODUCTION_MODE;
  const config = makeConfig("/tmp/novel-video-studio");
  assert.equal(config.mode, "live");
  assert.equal(config.production.episodeDurationSeconds, 300);
  assert.equal(config.production.episodesPerDay, 864);
  assert.equal(config.production.shotsPerEpisode, 10);
  assert.equal(config.production.videoTasksPerDay, 8640);
  assert.equal(config.production.maxProjectConcurrency, 2);
  assert.equal(config.production.videoCostPerSecondCny, 1.512);
  assert.equal(config.production.estimatedEpisodeVideoCostCny, 453.6);
  assert.equal(config.production.maxVideoSegmentSeconds, 30);
  assert.equal(config.production.maxSeasonEpisodes, MAX_SEASON_EPISODES);
  assert.equal(config.production.defaultOutputDurationSeconds, 5);
  assert.deepEqual(config.production.outputDurationOptions, [5, 10, 15, 30, 60]);
  assert.equal(config.production.outputsPerDay, 864);
  for (const [key, value] of Object.entries(previous)) {
    const envKey = {
      hours: "DAILY_OUTPUT_HOURS",
      minutes: "EPISODE_DURATION_MINUTES",
      seconds: "SHOT_DURATION_SECONDS",
      mode: "PRODUCTION_MODE"
    }[key];
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
    await client.createVideo({
      prompt: "shot",
      duration: 30,
      firstFrameUrl: "data:image/jpeg;base64,ZmFrZQ=="
    });
    assert.equal(requests[0].url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    assert.equal(requests[0].body.model, "glm-5-2-260617");
    assert.equal(requests[1].url, "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    assert.equal(requests[1].body.model, "doubao-seedance-2-5-260628");
    assert.equal(requests[1].body.duration, 30);
    assert.equal(requests[1].body.return_last_frame, true);
    assert.equal(requests[1].body.content[1].role, "first_frame");
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

test("five-minute episodes split into ten ordered 30-second segments", () => {
  const episode = makeShotsForDuration("西游记", 1, 300);
  assert.equal(episode.length, 10);
  assert.ok(episode.every((shot) => shot.duration === 30));
  assert.equal(episode[0].continuityMode, "episode-opening");
  assert.equal(episode[1].continuityMode, "previous-last-frame");
  assert.equal(episode[1].previousShotId, "E001-S001");

  for (const duration of [5, 10, 15, 30]) {
    const shots = makeShotsForDuration("西游记", 1, duration);
    assert.equal(shots.length, 1);
    assert.equal(shots[0].duration, duration);
  }
  const minute = makeShotsForDuration("西游记", 1, 60);
  assert.deepEqual(minute.map((shot) => shot.duration), [30, 30]);
  assert.deepEqual(minute.map((shot) => shot.id), ["E001-S001", "E001-S002"]);
});

test("chapter inventory drives a dynamic whole-book episode plan", () => {
  const sourceText = [
    "第一章 山中异响",
    "甲".repeat(3200),
    "第二章 夜访古寺",
    "乙".repeat(3400),
    "第三章 真相初现",
    "丙".repeat(2800)
  ].join("\n");
  const chapters = extractChapterInventory(sourceText, "测试小说");
  const plan = buildFallbackAdaptationPlan(
    "测试小说",
    sourceText,
    { description: "" }
  );
  assert.equal(chapters.length, 3);
  assert.equal(plan.detectedChapterCount, 3);
  assert.equal(plan.episodes.length, 3);
  assert.equal(plan.episodes[0].sourceChapterStart, 1);
  assert.equal(plan.episodes[2].sourceChapterEnd, 3);

  const shortPlan = buildFallbackAdaptationPlan(
    "短篇",
    "短篇正文".repeat(100),
    { description: "" }
  );
  assert.equal(shortPlan.episodes.length, 1);

  const partialModelPlan = normalizeAdaptationPlan({
    episodes: [{
      number: 1,
      title: "模型增强标题",
      logline: "模型只返回了第一集"
    }]
  }, plan);
  assert.equal(partialModelPlan.episodes.length, 3);
  assert.equal(partialModelPlan.episodes[0].title, "模型增强标题");
  assert.equal(partialModelPlan.episodes[2].sourceChapterEnd, 3);
});

test("series planning prepares every episode before video rendering", () => {
  const config = {
    production: {
      episodeDurationSeconds: EPISODE_DURATION_SECONDS,
      maxVideoSegmentSeconds: MAX_VIDEO_SEGMENT_SECONDS,
      defaultOutputDurationSeconds: 5,
      episodeMinutes: 5
    }
  };
  const bible = buildSeriesBible(
    "西游记",
    { description: "公版名著" },
    config,
    6
  );
  assert.equal(bible.episodes.length, 6);
  assert.ok(bible.episodes.every((episode) => episode.contentStatus === "ready"));
  assert.ok(bible.episodes.every((episode) => episode.durationSeconds === 300));
  assert.ok(bible.episodes.every((episode) => episode.shots.length === 10));
  assert.equal(bible.episodes[1].shots[0].previousShotId, null);
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

test("live video submission is sequential and chains the previous last frame", async () => {
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
    const submissions = [];
    pipeline.ark.createVideo = async (input) => {
      submissions.push(input);
      return { id: `remote-${submissions.length}` };
    };
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
    await pipeline.submitVideoBatch(project, [episode]);
    assert.equal(submissions.length, 1);
    assert.equal(episode.shots.filter((shot) => shot.status === "submitted").length, 1);
    assert.equal(episode.shots.filter((shot) => shot.status === "queued").length, 9);
    const frameFile = path.join(directory, "last-frame.jpg");
    await writeFile(frameFile, Buffer.from("frame"));
    episode.shots[0].status = "succeeded";
    episode.shots[0].lastFrameFile = frameFile;
    await pipeline.submitNextSequentialShot(project);
    assert.equal(submissions.length, 2);
    assert.match(submissions[1].firstFrameUrl, /^data:image\/jpeg;base64,/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the first segment of a new episode continues from the previous episode last frame", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-cross-episode-frame-"));
  try {
    const store = new ProjectStore(directory);
    const pipeline = new ProductionPipeline({
      mode: "live",
      dataDirectory: directory,
      ark: {},
      production: {
        maxProjectConcurrency: 1,
        maxVideoConcurrency: 4
      }
    }, store);
    const frameFile = path.join(directory, "episode-one-last-frame.jpg");
    await writeFile(frameFile, Buffer.from("episode-one-frame"));
    const project = {
      episodes: [
        {
          number: 1,
          status: "completed",
          shots: [{
            id: "E001-S010",
            status: "succeeded",
            lastFrameFile: frameFile
          }]
        },
        {
          number: 2,
          status: "queued",
          shots: makeShotsForDuration("西游记", 2, 300)
        }
      ]
    };

    const firstFrame = await pipeline.continuityFrame(project, 1, 0);
    assert.match(firstFrame, /^data:image\/jpeg;base64,/);
    assert.equal(
      Buffer.from(firstFrame.split(",")[1], "base64").toString(),
      "episode-one-frame"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("render retry preserves completed segments and resets only the failed segment", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-render-retry-"));
  try {
    const store = new ProjectStore(directory);
    const pipeline = new ProductionPipeline({
      mode: "live",
      dataDirectory: directory,
      ark: {},
      production: {
        maxProjectConcurrency: 1,
        maxVideoConcurrency: 4
      }
    }, store);
    pipeline.scheduler.enqueue = async (id) => store.get(id);
    const project = {
      id: "render-retry",
      novelName: "西游记",
      status: "failed",
      stage: "render",
      progress: 78,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contentPlanCompletedAt: new Date().toISOString(),
      activity: [],
      nodes: {
        render: {
          id: "render",
          status: "failed",
          error: "片段 E001-S002 渲染失败"
        }
      },
      episodes: [{
        number: 1,
        status: "rendering",
        shots: [
          {
            id: "E001-S001",
            status: "succeeded",
            progress: 100,
            remoteTaskId: "completed-task",
            localFile: "/tmp/completed.mp4",
            lastFrameFile: "/tmp/completed.jpg"
          },
          {
            id: "E001-S002",
            status: "failed",
            progress: 0,
            remoteTaskId: "failed-task"
          },
          {
            id: "E001-S003",
            status: "queued",
            progress: 0
          }
        ]
      }]
    };
    await store.save(project);

    const retried = await pipeline.retry(project.id);
    assert.equal(retried.status, "queued");
    assert.equal(retried.resumeStage, "render-retry");
    assert.equal(retried.episodes[0].status, "queued");
    assert.equal(retried.episodes[0].shots[0].status, "succeeded");
    assert.equal(retried.episodes[0].shots[0].remoteTaskId, "completed-task");
    assert.equal(retried.episodes[0].shots[1].status, "queued");
    assert.equal(retried.episodes[0].shots[1].remoteTaskId, undefined);
    assert.equal(retried.episodes[0].shots[2].status, "queued");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("live production stops before model calls when cost authorization is missing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-budget-gate-"));
  try {
    const store = new ProjectStore(directory);
    const config = {
      mode: "live",
      dataDirectory: directory,
      ark: { apiKey: "test-key", planningModel: "glm-test" },
      search: {},
      production: {
        episodeMinutes: 15,
        shotsPerEpisode: 30,
        shotSeconds: 30,
        maxProjectConcurrency: 1,
        maxVideoConcurrency: 4,
        dailyBudgetCny: 200,
        estimatedEpisodeVideoCostCny: 1360.8,
        billableGenerationEnabled: false,
        budgetOverrunAllowed: false
      }
    };
    const pipeline = new ProductionPipeline(config, store, {
      loadText: async () => "公版正文"
    });
    pipeline.ark.generateJson = async () => {
      throw new Error("预算门禁前不应调用模型");
    };
    await store.save({
      id: "budget-gate",
      novelName: "西游记",
      status: "queued",
      stage: "ingest",
      progress: 18,
      mode: "live",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [],
      sourceConfirmed: true,
      source: {
        id: "public-domain",
        title: "西游记",
        authors: "吴承恩",
        source: "中文维基文库",
        rights: "public-domain"
      }
    });

    await pipeline.run("budget-gate");
    const project = await store.get("budget-gate");
    assert.equal(project.status, "budget-gate");
    assert.equal(project.stage, "adapt");
    assert.equal(project.nodes.adapt.status, "paused");
    assert.match(project.error, /未获计费授权/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("whole-book planning precedes season selection and video budget approval", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-series-budget-"));
  try {
    const store = new ProjectStore(directory);
    const pipeline = new ProductionPipeline({
      mode: "live",
      dataDirectory: directory,
      ark: { apiKey: "test-key", planningModel: "glm-test", videoModel: "seedance-test" },
      search: {},
      production: {
        episodeMinutes: 5,
        episodeDurationSeconds: 300,
        maxVideoSegmentSeconds: 30,
        maxProjectConcurrency: 1,
        maxVideoConcurrency: 4,
        dailyBudgetCny: 200,
        videoCostPerSecondCny: 1.512,
        billableGenerationEnabled: true,
        budgetOverrunAllowed: false
      }
    }, store, {
      loadText: async () => [
        "第一章 五行山",
        "正文".repeat(2500),
        "第二章 拜师",
        "正文".repeat(2500),
        "第三章 启程",
        "正文".repeat(2500)
      ].join("\n")
    });
    let planningCalls = 0;
    pipeline.ark.generateJson = async () => {
      planningCalls += 1;
      if (planningCalls === 1) {
        return {
          analysisBasis: "章节边界与叙事事件",
          recommendedEpisodeCount: 3,
          suggestedSeasonSize: 2,
          seriesSynopsis: "取经启程",
          tone: "东方奇幻",
          characters: [{ name: "孙悟空", continuityId: "CHAR-001" }],
          weapons: [{ name: "金箍棒", continuityId: "PROP-001" }],
          locations: [{ name: "五行山", continuityId: "LOC-001" }],
          episodes: [
            { number: 1, title: "五行山", logline: "孙悟空等待取经人", sourceRange: "第一章" },
            { number: 2, title: "拜师", logline: "孙悟空重获自由", sourceRange: "第二章" },
            { number: 3, title: "启程", logline: "师徒踏上西行路", sourceRange: "第三章" }
          ]
        };
      }
      return {
        title: "启程",
        logline: "孙悟空重获自由",
        script: "五分钟分集剧本",
        segmentBriefs: Array.from({ length: 10 }, (_, index) => ({
          order: index + 1,
          beat: `段落 ${index + 1}`,
          prompt: `连续镜头 ${index + 1}`
        }))
      };
    };
    let videoCalls = 0;
    pipeline.ark.createVideo = async () => ({ id: `video-${++videoCalls}` });
    await store.save({
      id: "series-budget",
      novelName: "西游记",
      status: "queued",
      stage: "ingest",
      progress: 18,
      mode: "live",
      episodeDurationSeconds: 300,
      productionSpec: {
        episodeDurationSeconds: 300,
        segmentDurationSeconds: 30
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [],
      sourceConfirmed: true,
      source: {
        id: "public-domain",
        title: "西游记",
        authors: "吴承恩",
        source: "中文维基文库",
        rights: "public-domain"
      }
    });

    await pipeline.run("series-budget");
    let project = await store.get("series-budget");
    assert.equal(project.status, "season-review");
    assert.equal(project.stage, "adapt");
    assert.equal(project.adaptationPlan.episodes.length, 3);
    assert.equal(project.seasonEpisodeCount, undefined);
    assert.equal(project.episodes?.length || 0, 0);
    assert.equal(videoCalls, 0);

    await assert.rejects(
      pipeline.selectSeason("series-budget", {
        seasonNumber: 1,
        startEpisode: 3,
        episodeCount: 2
      }),
      /本季集数必须/
    );
    await pipeline.selectSeason("series-budget", {
      seasonNumber: 1,
      startEpisode: 2,
      episodeCount: 2
    });
    await waitFor(async () => (await store.get("series-budget")).status === "budget-gate");
    project = await store.get("series-budget");
    assert.equal(project.status, "budget-gate");
    assert.equal(project.stage, "render");
    assert.equal(project.episodes.length, 2);
    assert.deepEqual(project.episodes.map((episode) => episode.number), [2, 3]);
    assert.ok(project.episodes.every((episode) => episode.contentStatus === "ready"));
    assert.ok(project.episodes.every((episode) => episode.shots.length === 10));
    assert.equal(videoCalls, 0);

    await pipeline.retry("series-budget", { approveBudget: true });
    await waitFor(async () => (await store.get("series-budget")).status === "rendering");
    project = await store.get("series-budget");
    assert.equal(project.budgetApproved, true);
    assert.equal(videoCalls, 1);
    assert.equal(project.episodes.flatMap((episode) => episode.shots)
      .filter((shot) => shot.status === "submitted").length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a legacy planning preview can be upgraded to the current live runtime", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-live-upgrade-"));
  try {
    const store = new ProjectStore(directory);
    const pipeline = new ProductionPipeline({
      mode: "live",
      dataDirectory: directory,
      ark: { apiKey: "test-key", planningModel: "glm-test" },
      search: {},
      production: {
        episodeMinutes: 15,
        defaultOutputDurationSeconds: 5,
        maxProjectConcurrency: 1,
        maxVideoConcurrency: 4,
        dailyBudgetCny: 200,
        videoCostPerSecondCny: 1.512,
        billableGenerationEnabled: false,
        budgetOverrunAllowed: false
      }
    }, store, {
      loadText: async () => "公版正文"
    });
    await store.save({
      id: "upgrade-preview",
      novelName: "西游记",
      status: "demo-preview",
      stage: "render",
      progress: 72,
      mode: "demo",
      targetDurationSeconds: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [],
      sourceConfirmed: true,
      source: {
        id: "public-domain",
        title: "西游记",
        authors: "吴承恩",
        source: "中文维基文库",
        rights: "public-domain"
      },
      episodes: [{
        number: 1,
        durationSeconds: 5,
        shots: makeShotsForDuration("西游记", 1, 5)
      }]
    });

    await pipeline.retry("upgrade-preview");
    await waitFor(async () => (await store.get("upgrade-preview")).status === "budget-gate");
    const project = await store.get("upgrade-preview");
    assert.equal(project.mode, "live");
    assert.equal(project.targetDurationSeconds, 5);
    assert.equal(project.stage, "adapt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pipeline pauses for source confirmation and labels planning output as non-video", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novel-source-gate-"));
  try {
    const store = new ProjectStore(directory);
    const sources = [
      { id: "candidate-a", title: "同名改编版", authors: "作者甲", source: "目录 A", rights: "metadata-only", score: 95 },
      { id: "candidate-b", title: "目标原著", authors: "作者乙", source: "目录 B", rights: "public-domain", score: 88, description: "正文梗概" }
    ];
    const config = {
      mode: "planning",
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

    const created = await pipeline.create("同名小说", 60);
    await waitFor(async () => (await store.get(created.id)).status === "source-review");
    let project = await store.get(created.id);
    assert.equal(project.source, null);
    assert.equal(project.sources.length, 2);
    assert.equal(project.nodes.discover.status, "completed");
    assert.equal(project.nodes.discover.output.candidateCount, 2);
    assert.deepEqual(project.searchRuns, searchRuns);
    assert.equal(project.nodes.discover.output.searchCount, 1);

    await pipeline.confirmSource(created.id, "candidate-b");
    await waitFor(async () => (await store.get(created.id)).status === "season-review");
    project = await store.get(created.id);
    assert.equal(project.adaptationPlan.episodes.length, 1);
    assert.equal(project.episodes.length, 0);
    await pipeline.selectSeason(created.id, {
      seasonNumber: 1,
      startEpisode: 1,
      episodeCount: 1
    });
    await waitFor(async () => (await store.get(created.id)).status === "planning-ready");
    project = await store.get(created.id);
    assert.equal(project.source.id, "candidate-b");
    assert.equal(project.sourceConfirmed, true);
    assert.ok(["discover", "ingest", "adapt", "design"].every(
      (id) => project.nodes[id].status === "completed"
    ));
    assert.equal(project.nodes.render.status, "paused");
    assert.equal(project.nodes.assemble.status, "pending");
    assert.equal(project.nodes.ingest.output.contentCharacters, 4);
    assert.equal(project.nodes.render.output.completedShots, 0);
    assert.equal(project.targetDurationSeconds, 60);
    assert.equal(project.nodes.render.output.simulatedShots, 2);
    assert.deepEqual(project.episodes[0].shots.map((shot) => shot.duration), [30, 30]);
    assert.equal(project.episodes[0].videoUrl, undefined);
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
      mode: "planning",
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
    await assert.rejects(
      pipeline.importAuthorizedContent(created.id, {
        sourceId: source.id,
        content,
        fileName: "求魔-授权正文.txt",
        rightsConfirmed: false
      }),
      /必须确认/
    );
    await pipeline.importAuthorizedContent(created.id, {
      sourceId: source.id,
      content,
      fileName: "求魔-授权正文.txt",
      rightsConfirmed: true
    });
    await waitFor(async () => (await store.get(created.id)).status === "season-review");
    let project = await store.get(created.id);
    assert.ok(project.adaptationPlan.episodes.length >= 1);
    await pipeline.selectSeason(created.id, {
      seasonNumber: 1,
      startEpisode: 1,
      episodeCount: 1
    });
    await waitFor(async () => (await store.get(created.id)).status === "planning-ready");
    project = await store.get(created.id);
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
