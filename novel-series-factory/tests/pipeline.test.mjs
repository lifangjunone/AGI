import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildContinuitySnapshot, buildSeedanceReferences, buildSeriesPlan, createMvpPipeline,
  deriveEpisodePlan, productionAssetReadiness, requestMultimodalQuality, validateInput,
  wrapSubtitleText,
} from "../lib/mvp-pipeline.mjs";
import { createHermesAgentLoop } from "../lib/hermes-agent-loop.mjs";
import { createModelHealthMonitor } from "../lib/model-config.mjs";

const input = { sourceType: "manual", content: "第一声钟响。第二声钟响。门打开了。", rightsConfirmed: true };
async function setup(services = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "novel-pipeline-test-"));
  const pipeline = createMvpPipeline({ dataDir, env: {}, services });
  await pipeline.initialize();
  return { pipeline, dataDir };
}
async function setupWithEnv(env, services = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "novel-pipeline-test-"));
  const pipeline = createMvpPipeline({ dataDir, env, services });
  await pipeline.initialize();
  return { pipeline, dataDir };
}
function readyProductionBible(bible) {
  bible.analyzedAt = new Date().toISOString();
  for (const character of bible.characters) {
    character.views = {
      front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: "back.jpg",
    };
  }
  for (const scene of bible.scenes) scene.image = "scene.jpg";
  for (const prop of bible.props) prop.image = "prop.jpg";
  for (const voice of bible.voices) {
    voice.speaker = `speaker-${voice.id}`;
    voice.sample = "voice.wav";
  }
  return bible;
}
async function waitFor(pipeline, id) {
  for (let i = 0; i < 150; i++) {
    const project = await pipeline.read(id);
    if (["completed", "failed"].includes(project.status)) return project;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Test job timed out");
}

test("reject unsupported, empty, oversized and unauthorized input", () => {
  for (const value of [null, [], {}, { ...input, sourceType: "url" },
    { ...input, rightsConfirmed: false }, { ...input, content: " " },
    { ...input, content: "字".repeat(1_000_001) }]) {
    assert.throws(() => validateInput(value));
  }
  assert.doesNotThrow(() => validateInput(input));
});

test("episode count is derived from content while duration is user supplied", () => {
  const short = deriveEpisodePlan({ sourceType: "manual", content: "字".repeat(1000), format: "anime", episodeDurationSeconds: 90 });
  const long = deriveEpisodePlan({ sourceType: "manual", content: "字".repeat(12000), format: "anime", episodeDurationSeconds: 90 });
  const slower = deriveEpisodePlan({ sourceType: "manual", content: "字".repeat(12000), format: "anime", episodeDurationSeconds: 180 });
  assert.equal(short.episodeDurationSeconds, 90);
  assert.ok(long.episodeCount > short.episodeCount);
  assert.ok(slower.episodeCount < long.episodeCount);
  assert.equal(long.episodeCount, 11);
  assert.equal(long.sourceMetrics.language, "zh");
  assert.equal(long.sourceMetrics.cjkCharacters, 12000);
  assert.equal(long.provisional, false);
  assert.match(long.basis, /12,000 个中文字符/);
  assert.equal(deriveEpisodePlan({ sourceType: "manual", content: "故事", format: "film", episodeDurationSeconds: 5400 }).episodeCount, 1);
  assert.equal(deriveEpisodePlan({ sourceType: "url", content: "", format: "drama", episodeDurationSeconds: 1200 }).episodeCount, null);
});

test("episode estimate distinguishes English words and partial URL samples", () => {
  const english = deriveEpisodePlan({
    sourceType: "manual",
    content: Array.from({ length: 2000 }, (_, index) => `word${index}`).join(" "),
    format: "anime",
    episodeDurationSeconds: 90,
  });
  assert.equal(english.sourceMetrics.language, "en");
  assert.equal(english.sourceMetrics.latinWords, 2000);
  assert.equal(english.episodeCount, 8);
  assert.match(english.basis, /2,000 个英文单词/);

  const chapter = deriveEpisodePlan({
    sourceType: "url",
    content: "夜色笼罩村庄。".repeat(300),
    format: "anime",
    episodeDurationSeconds: 90,
    urlImport: { sourceScope: "chapter_sample", truncated: false },
  });
  assert.equal(chapter.provisional, true);
  assert.equal(chapter.sourceScope, "chapter_sample");
  assert.match(chapter.basis, /公开章节样本/);
  assert.match(chapter.basis, /不是整本书最终集数/);

  const ai = deriveEpisodePlan({
    sourceType: "ai", premise: "一名修钟师发现时间停止的秘密。",
    format: "anime", episodeDurationSeconds: 90,
  });
  assert.equal(ai.episodeCount, 3);
  assert.equal(ai.provisional, true);
  assert.equal(ai.sourceScope, "ai_premise");
});

test("subtitle wrapping keeps English words intact", () => {
  const wrapped = wrapSubtitleText(
    "Alice followed the rabbit into Wonderland and found another mysterious doorway.",
    20,
    5,
  );
  assert.equal(wrapped, [
    "Alice followed the",
    "rabbit into",
    "Wonderland and found",
    "another mysterious",
    "doorway.",
  ].join("\n"));
  assert.match(wrapped, /Wonderland/);
  assert.doesNotMatch(wrapped, /Wonder\nland/);
  assert.equal(wrapSubtitleText("第一声钟响。第二声钟响。", 6, 3), "第一声钟响。\n第二声钟响。");
});

test("custom episode duration accepts 5 seconds through 180 minutes", () => {
  const seconds = deriveEpisodePlan({ sourceType: "manual", content: "字".repeat(1000), format: "anime", episodeDurationSeconds: 5 });
  const minutes = deriveEpisodePlan({ sourceType: "manual", content: "字".repeat(1000), format: "drama", episodeDurationSeconds: 450 });
  assert.equal(seconds.episodeDurationSeconds, 5);
  assert.equal(minutes.episodeDurationSeconds, 450);
  for (const duration of [4, 10801, 90.5, NaN]) {
    assert.throws(() => deriveEpisodePlan({
      sourceType: "manual", content: "故事", format: "anime", episodeDurationSeconds: duration,
    }), /有效的单集时长/);
  }
});

test("Seedance references include character views, fixed voice audio and previous episode video", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "seedance-reference-test-"));
  await writeFile(join(projectDir, "character-1-front.jpg"), "front-image");
  await writeFile(join(projectDir, "character-1-side.jpg"), "side-image");
  await writeFile(join(projectDir, "scene-1-sheet.jpg"), "scene-image");
  await writeFile(join(projectDir, "prop-1-sheet.jpg"), "prop-image");
  await writeFile(join(projectDir, "voice-1-sample.wav"), "voice-sample");
  await writeFile(join(projectDir, "narration-02.wav"), "fixed-voice-audio");
  const project = {
    dir: projectDir,
    productionBible: {
      characters: [{
        id: "character-1", name: "林舟",
        views: {
          front: "/api/projects/test/assets/character-1-front.jpg",
          side: "/api/projects/test/assets/character-1-side.jpg",
        },
      }],
      scenes: [{ id: "scene-1", name: "雾港", image: "/api/projects/test/assets/scene-1-sheet.jpg" }],
      props: [{ id: "prop-1", name: "怀表", image: "/api/projects/test/assets/prop-1-sheet.jpg" }],
      voices: [{
        id: "voice-1", characterId: "character-1", characterName: "林舟",
        speaker: "Uncle_Fu", bindingVersion: 1,
        sample: "/api/projects/test/assets/voice-1-sample.wav",
      }],
    },
    assets: {
      episodes: [{
        number: 1,
        videoGeneration: {
          remoteTaskId: "task-1",
          sourceUrl: "https://example.com/episode-01.mp4",
        },
      }],
    },
  };
  const story = {
    episode: { number: 2 },
    continuitySnapshot: {
      voices: [{ characterId: "character-1", speaker: "Uncle_Fu", bindingVersion: 1 }],
    },
  };
  const result = await buildSeedanceReferences({
    SEEDANCE_MULTIMODAL_REFERENCES: "true",
    SEEDANCE_CROSS_EPISODE_VIDEO_REFERENCE: "true",
  }, story, project);
  assert.equal(result.audit.images.length, 4);
  assert.equal(result.audit.voiceSamples.length, 1);
  assert.equal(result.audit.audio.filename, "narration-02.wav");
  assert.equal(result.audit.video.episodeNumber, 1);
  assert.deepEqual(result.content.map(item => item.role), [
    "reference_image", "reference_image", "reference_image", "reference_image",
    "reference_audio", "reference_audio", "reference_video",
  ]);
  assert.match(result.content[0].image_url.url, /^data:image\/jpeg;base64,/);
  assert.match(result.content[4].audio_url.url, /^data:audio\/wav;base64,/);
});

test("production readiness blocks video until every visual and voice sample exists", () => {
  const project = {
    productionBible: {
      analyzedAt: "2026-10-10T00:00:00.000Z",
      characters: [{
        name: "林舟",
        views: { front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: null },
      }],
      scenes: [{ name: "雾港", image: null }],
      props: [{ name: "怀表", image: "watch.jpg" }],
      voices: [{ characterName: "林舟", speaker: "Uncle_Fu", sample: null }],
      continuity: {},
    },
  };
  const missing = productionAssetReadiness(project);
  assert.equal(missing.ready, false);
  assert.deepEqual(missing.missing, ["林舟人物多视图（缺 1 张）", "雾港场景概念图", "林舟音色样本"]);
  project.productionBible.characters[0].views.back = "back.jpg";
  project.productionBible.scenes[0].image = "scene.jpg";
  project.productionBible.voices[0].sample = "voice.wav";
  assert.equal(productionAssetReadiness(project).ready, true);
});

test("series plan exposes explainable split preview", () => {
  const plan = buildSeriesPlan({
    sourceType: "manual",
    content: "第一章 雾起\n\n第一幕开始。第二幕反转。\n\n第二章 追击\n\n第三幕追击。第四幕真相。第五幕悬念。",
    format: "anime",
    episodeDurationSeconds: 60,
    title: "测试故事",
  });
  assert.equal(plan.title, "测试故事");
  assert.equal(plan.episodeDurationSeconds, 60);
  assert.ok(plan.episodeCount >= 1);
  assert.ok(plan.episodes.length === plan.episodeCount);
  assert.match(plan.basis, /正文/);
  assert.ok(plan.sourceDocument.paragraphs.every(item => /^p-\d{6}$/.test(item.id)));
  assert.equal(plan.episodes[0].source.startOffset, 0);
  assert.equal(plan.episodes.at(-1).source.endOffset, plan.sourceDocument.text.length);
  for (let index = 1; index < plan.episodes.length; index++) {
    assert.equal(plan.episodes[index - 1].source.endOffset, plan.episodes[index].source.startOffset);
  }
  assert.equal(plan.sourceCoverage.ratio, 1);
  assert.deepEqual(plan.sourceCoverage.gaps, []);
  assert.deepEqual(plan.sourceCoverage.overlaps, []);
  assert.equal(buildSeriesPlan({ sourceType: "url", content: "", premise: "", url: "https://example.com/a", format: "drama", episodeDurationSeconds: 600 }).episodeCount, null);
});

test("long novel is stored once with stable metadata and compact episode ranges", async () => {
  const { pipeline } = await setup();
  const content = Array.from({ length: 120 }, (_, index) =>
    `第${index + 1}章\n\n${`长篇剧情${index + 1}继续推进，人物面对新的选择。`.repeat(45)}`)
    .join("\n\n");
  assert.ok(content.length > 100_000);
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content,
    format: "anime",
    episodeDurationSeconds: 90,
    rightsConfirmed: true,
  });
  const saved = await pipeline.read(project.id);
  const document = saved.seriesPlan.sourceDocument;
  assert.equal(document.version, 2);
  assert.equal(document.text, content);
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  assert.equal(document.chapterCount, 120);
  assert.ok(document.paragraphCount >= 240);
  assert.ok(saved.seriesPlan.episodeCount > 20);
  assert.ok(saved.input.content.length <= 12_000);
  assert.ok(document.paragraphs.every(item => !("text" in item)));
  assert.ok(saved.seriesPlan.episodes.every(episode =>
    !("excerpt" in episode.source) && episode.source.preview.length <= 320));
  assert.equal(saved.seriesPlan.episodes[0].source.startOffset, 0);
  assert.equal(saved.seriesPlan.episodes.at(-1).source.endOffset, document.text.length);
});

test("critical edits create external versions and restore is itself recoverable", async () => {
  const { pipeline } = await setup();
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 60, rightsConfirmed: true,
  });
  const original = await pipeline.read(project.id);
  const originalSummary = original.seriesPlan.episodes[0].summary;
  await pipeline.updateEpisodePlan(project.id, 1, { summary: "修改后的分集摘要" });
  const versions = await pipeline.listVersions(project.id);
  assert.equal(versions.length, 1);
  assert.match(versions[0].reason, /第 1 集/);
  const restored = await pipeline.restoreVersion(project.id, versions[0].id);
  assert.equal(restored.seriesPlan.episodes[0].summary, originalSummary);
  assert.equal(restored.status, "draft");
  assert.equal(restored.restoredVersion.id, versions[0].id);
  const afterRestore = await pipeline.listVersions(project.id);
  assert.equal(afterRestore.length, 2);
  assert.match(afterRestore[0].reason, /恢复到版本/);
});

test("commercial delivery package contains verified media and traceable reports", async () => {
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 1; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" };
    },
    mediaQualityAnalyzer: async () => ({
      status: "analyzed", blackSeconds: 0, blackSegments: 0,
      freezeSeconds: 0, freezeSegments: 0,
      integratedLoudnessLufs: -16, truePeakDbfs: -2,
    }),
    realVideo: async (_env, _story, _project, path) => writeFile(path, "model-video"),
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
    seriesAssembler: async (_dir, _list, output) => { await writeFile(output, "series"); return 10; },
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: "钟楼响起。".repeat(360), format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  project.productionBible = readyProductionBible(project.productionBible);
  await writeFile(join(project.dir, "project.json"), JSON.stringify(project), "utf8");
  const preflight = await pipeline.productionPreflight(project.id);
  await pipeline.startSeriesProduction(project.id, {
    confirmBillable: true, confirmedEpisodeCount: preflight.remainingCount,
  });
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  const packaged = await pipeline.createDeliveryPackage(project.id);
  assert.equal(packaged.delivery.status, "completed");
  assert.ok(packaged.delivery.files.includes("delivery-manifest.json"));
  assert.ok(packaged.delivery.files.includes("quality-report.json"));
  assert.ok(packaged.delivery.files.includes("production-bible.json"));
  await readFile(pipeline.assetPath(project.id, "commercial-delivery.zip"));
});

test("advanced media gate rejects excessive black frames and invalid loudness", async () => {
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 1; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" };
    },
    mediaQualityAnalyzer: async () => ({
      status: "analyzed", blackSeconds: 3, blackSegments: 1,
      freezeSeconds: 0, freezeSegments: 0,
      integratedLoudnessLufs: -45, truePeakDbfs: -0.2,
    }),
    realVideo: async (_env, _story, _project, path) => writeFile(path, "model-video"),
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  project.productionBible = readyProductionBible(project.productionBible);
  await writeFile(join(project.dir, "project.json"), JSON.stringify(project), "utf8");
  await pipeline.startEpisode(project.id, 1);
  const failed = await waitFor(pipeline, project.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /black_frames/);
});

test("semantic media gate rejects visual asset inconsistency", async () => {
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 1; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" };
    },
    visualConsistencyAnalyzer: async () => ({
      status: "analyzed", passed: false, confidence: 0.94,
      summary: "主角服装颜色与锁定设定不一致",
    }),
    realVideo: async (_env, _story, _project, path) => writeFile(path, "model-video"),
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  project.productionBible = readyProductionBible(project.productionBible);
  await writeFile(join(project.dir, "project.json"), JSON.stringify(project), "utf8");
  await pipeline.startEpisode(project.id, 1);
  const failed = await waitFor(pipeline, project.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /visual_asset_consistency/);
});

test("url source can be imported and then split from fetched text", async () => {
  const { pipeline } = await setup({
    sourceFetcher: async url => ({
      url,
      title: "雾港谜案",
      content: "第一章雾起。第二章追查。第三章反转。第四章真相。" + "长剧情。".repeat(900),
      characters: 3600,
    }),
  });
  const project = await pipeline.createPlan({
    sourceType: "url",
    url: "https://example.com/story",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  const saved = await pipeline.read(project.id);
  assert.equal(saved.title, "雾港谜案");
  assert.equal(saved.input.sourceType, "url");
  assert.equal(saved.input.effectiveSourceType, "resolved_url");
  assert.match(saved.input.resolvedContent, /第一章雾起/);
  assert.equal(saved.input.url, "https://example.com/story");
  assert.ok(saved.specification.episodeCount > 1);
  assert.equal(saved.seriesPlan.episodes[0].source.startOffset, 0);
  assert.equal(saved.seriesPlan.episodes.at(-1).source.endOffset, saved.seriesPlan.sourceDocument.text.length);
});

test("qidian book page can be imported from public mobile SSR content", async () => {
  const html = `<!doctype html><script id="vite-plugin-ssr_pageContext" type="application/json">${JSON.stringify({
    pageContext: { pageProps: { pageData: {
      bookInfo: {
        bookId: 1042674946,
        bookName: "短篇之鬼故事",
        authorName: "灵火舞",
        chanName: "悬疑灵异",
        subCateName: "诡异神秘",
        desc: "短篇小故事",
        showWordsCnt: "8.88万",
        bookStatus: "完本",
        isVip: 0,
      },
      chapterContentInfo: {
        firstChapterT: "鬼影深处的秘密",
        firstChapterId: 816774008,
        nextChapterId: 816780045,
        firstChapterC: "夜幕降临，月光洒落在古老村落上。" + "林风走进古宅，听见走廊尽头传来哭泣声。".repeat(80),
      },
    } } },
  })}</script>`;
  const { pipeline } = await setup({
    sourceFetcher: async () => {
      const { fetchSourceFromUrlForTest } = await import("../lib/mvp-pipeline.mjs");
      return fetchSourceFromUrlForTest("https://www.qidian.com/book/1042674946/", html);
    },
  });
  const project = await pipeline.createPlan({
    sourceType: "url",
    url: "https://www.qidian.com/book/1042674946/",
    format: "anime",
    episodeDurationSeconds: 5,
    rightsConfirmed: true,
  });
  const saved = await pipeline.read(project.id);
  assert.equal(saved.title, "短篇之鬼故事");
  assert.equal(saved.sourceImport.provider, "qidian");
  assert.equal(saved.sourceImport.chapter.title, "鬼影深处的秘密");
  assert.equal(saved.input.sourceType, "url");
  assert.equal(saved.input.effectiveSourceType, "resolved_url");
  assert.match(saved.input.content, /林风走进古宅/);
  assert.ok(saved.specification.episodeCount > 1);
});

test("persist, list and isolate assets", async () => {
  const { pipeline } = await setup();
  const project = await pipeline.create(input);
  assert.equal((await pipeline.list()).length, 1);
  assert.equal((await pipeline.read(project.id)).input.content, input.content);
  assert.equal(pipeline.assetPath(project.id, "project.json"), null);
  assert.equal(pipeline.assetPath(project.id, "../.env.local"), null);
  await assert.rejects(() => pipeline.read("../secret"));
});

test("interrupted projects become retryable after restart", async () => {
  const { pipeline, dataDir } = await setup();
  const project = await pipeline.create(input);
  const restarted = createMvpPipeline({ dataDir, env: {} });
  await restarted.initialize();
  assert.equal((await restarted.read(project.id)).status, "failed");
});

test("queue is serial, duplicate scheduling is ignored", async () => {
  let active = 0, peak = 0, calls = 0;
  const { pipeline } = await setup({
    speech: async (_url, _story, path) => {
      calls++; active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      await writeFile(path, "test audio"); active--;
      return 1;
    },
    probe: async path => { await readFile(path); return 2; },
    render: async (_dir, _story, _duration, _audio, path) => { await writeFile(path, "test video"); },
  });
  const first = await pipeline.create(input);
  const second = await pipeline.create(input);
  pipeline.enqueue(first); pipeline.enqueue(first); pipeline.enqueue(second);
  assert.equal((await waitFor(pipeline, first.id)).status, "completed");
  assert.equal((await waitFor(pipeline, second.id)).status, "completed");
  assert.equal(calls, 2);
  assert.equal(peak, 1);
  await assert.rejects(() => pipeline.retry(first.id));
});

test("render failure retry reuses valid narration without another TTS request", async () => {
  let calls = 0, renders = 0;
  const { pipeline } = await setup({
    speech: async (_url, _story, path) => { calls++; await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 3; },
    render: async (_dir, _story, _duration, _audio, path) => {
      if (++renders === 1) throw new Error("render failed");
      await writeFile(path, "video");
    },
  });
  const project = await pipeline.create(input);
  pipeline.enqueue(project);
  assert.equal((await waitFor(pipeline, project.id)).status, "failed");
  await pipeline.retry(project.id);
  const result = await waitFor(pipeline, project.id);
  assert.equal(result.status, "completed");
  assert.equal(result.error, null);
  assert.equal(calls, 1);
  assert.equal(renders, 2);
});

test("narration cache is invalidated when episode dialogue changes", async () => {
  let calls = 0;
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, story, path) => {
      calls++;
      await writeFile(path, `audio:${story.episode.narration}`);
      return 1;
    },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return {
        duration: 5, hasVideo: true, hasAudio: path.includes("episode-"),
        videoCodec: "h264", audioCodec: path.includes("episode-") ? "aac" : null,
      };
    },
    realVideo: async (_env, _story, _project, path) => writeFile(path, "model-video"),
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  await pipeline.startRealVideo(project.id, { episodeLimit: 1 });
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  assert.equal(calls, 1);
  await pipeline.updateEpisodePlan(project.id, 1, {
    instruction: "结尾改为主人公说出新的台词",
    allowCompleted: true,
  });
  await pipeline.startEpisode(project.id, 1);
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  assert.equal(calls, 2);
  const meta = JSON.parse(await readFile(join(project.dir, "narration-01.meta.json"), "utf8"));
  assert.match(meta.hash, /^[a-f0-9]{64}$/);
});

test("real video sample is gated and uses video generator when explicitly enabled", async () => {
  const { pipeline: blocked } = await setup();
  const blockedPlan = await blocked.createPlan({
    sourceType: "manual",
    content: input.content,
    title: "真实视频门禁",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  await assert.rejects(() => blocked.startRealVideo(blockedPlan.id), /真实视频生成未开启/);

  let calls = 0;
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 3; },
    mediaProbe: async path => {
      await readFile(path);
      const final = path.includes("episode-");
      return {
        duration: 3, hasVideo: true, hasAudio: final,
        videoCodec: "h264", audioCodec: final ? "aac" : null,
      };
    },
    realVideo: async (_env, _story, _project, path) => { calls++; await writeFile(path, "model-video"); },
    mux: async (_dir, _raw, _audio, path) => { await writeFile(path, "final-video"); },
    render: async () => { throw new Error("placeholder renderer should not run"); },
  });
  const plan = await pipeline.createPlan({
    sourceType: "manual",
    content: "第一幕宫墙阴云。第二幕少年进言。第三幕君臣争执。".repeat(200),
    title: "真实视频样片",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  await pipeline.startRealVideo(plan.id, { episodeLimit: 2 });
  const result = await waitFor(pipeline, plan.id);
  assert.equal(result.status, "completed");
  assert.equal(result.outputKind, "real_video_sample");
  assert.equal(result.generatedEpisodeCount, 2);
  assert.equal(result.assets.episodes.length, 2);
  assert.equal(calls, 2);
  assert.equal(result.episodeStates[0].status, "completed");
  assert.equal(result.episodeStates[1].status, "completed");
  assert.equal(result.episodeStates[2].status, "not_started");

  await pipeline.startEpisode(plan.id, 2);
  const regenerated = await waitFor(pipeline, plan.id);
  assert.equal(regenerated.status, "completed");
  assert.equal(regenerated.generatedEpisodeCount, 2);
  assert.equal(regenerated.episodeStates[0].status, "completed");
  assert.equal(regenerated.episodeStates[1].status, "completed");
  assert.equal(calls, 3);
});

test("full-series production requires assets and explicit billable confirmation", async () => {
  const { pipeline, dataDir } = await setupWithEnv(
    { ALLOW_BILLABLE_GENERATION: "true" },
    { visualConsistencyAnalyzer: async () => ({ status: "analyzed", passed: true }) },
  );
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "第一幕雾起。第二幕追查。第三幕反转。".repeat(120),
    title: "全集门禁",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  await assert.rejects(
    () => pipeline.startSeriesProduction(project.id, {
      confirmBillable: true,
      confirmedEpisodeCount: project.seriesPlan.episodeCount,
    }),
    /制片资产包尚未完成/,
  );

  const saved = await pipeline.read(project.id);
  saved.productionBible.analyzedAt = new Date().toISOString();
  for (const character of saved.productionBible.characters) {
    character.views = {
      front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: "back.jpg",
    };
  }
  for (const scene of saved.productionBible.scenes) scene.image = "scene.jpg";
  for (const prop of saved.productionBible.props) prop.image = "prop.jpg";
  for (const voice of saved.productionBible.voices) {
    voice.speaker = `speaker-${voice.id}`;
    voice.sample = "voice.wav";
  }
  await writeFile(join(dataDir, "projects", project.id, "project.json"), JSON.stringify(saved));
  await assert.rejects(
    () => pipeline.startSeriesProduction(project.id, {}),
    /请确认本次将调用模型生成/,
  );
  await assert.rejects(
    () => pipeline.startSeriesProduction(project.id, {
      confirmBillable: true,
      confirmedEpisodeCount: project.seriesPlan.episodeCount + 1,
    }),
    /请确认本次将调用模型生成/,
  );
});

test("full-series production completes remaining episodes and assembles verified series", async () => {
  let videoCalls = 0, assemblyCalls = 0;
  const { pipeline, dataDir } = await setupWithEnv({
    ALLOW_BILLABLE_GENERATION: "true",
  }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return {
        duration: 5, hasVideo: true, hasAudio: path.includes("episode-"),
        videoCodec: "h264", audioCodec: path.includes("episode-") ? "aac" : null,
      };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, path) => writeFile(path, "final-video"),
    seriesAssembler: async (_dir, _list, output) => {
      assemblyCalls++;
      await writeFile(output, "series-video");
      return 10;
    },
  });
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "第一幕雾起。第二幕追查。第三幕反转。".repeat(70),
    title: "全集闭环",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  assert.ok(project.seriesPlan.episodeCount >= 2);
  const saved = await pipeline.read(project.id);
  saved.productionBible.analyzedAt = new Date().toISOString();
  for (const character of saved.productionBible.characters) {
    character.views = {
      front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: "back.jpg",
    };
  }
  for (const scene of saved.productionBible.scenes) scene.image = "scene.jpg";
  for (const prop of saved.productionBible.props) prop.image = "prop.jpg";
  for (const voice of saved.productionBible.voices) {
    voice.speaker = `speaker-${voice.id}`;
    voice.sample = "voice.wav";
  }
  await writeFile(join(dataDir, "projects", project.id, "project.json"), JSON.stringify(saved));
  await pipeline.startSeriesProduction(project.id, {
    confirmBillable: true,
    confirmedEpisodeCount: project.seriesPlan.episodeCount,
  });
  const result = await waitFor(pipeline, project.id);
  assert.equal(result.status, "completed");
  assert.equal(result.outputKind, "complete_series");
  assert.equal(result.productionRun.status, "completed");
  assert.equal(result.productionRun.qualityGate.status, "passed");
  assert.equal(result.assets.episodes.length, project.seriesPlan.episodeCount);
  assert.ok(result.assets.episodes.every(item => item.qualityReport?.status === "passed"));
  assert.equal(videoCalls, project.seriesPlan.episodeCount);
  assert.equal(assemblyCalls, 1);
  assert.equal(result.assembly.episodeCount, project.seriesPlan.episodeCount);
});

test("existing episode can be revalidated without regenerating or billing video", async () => {
  let videoCalls = 0;
  const { pipeline } = await setupWithEnv({
    ALLOW_BILLABLE_GENERATION: "true",
  }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return {
        duration: 5, hasVideo: true, hasAudio: path.includes("episode-"),
        videoCodec: "h264", audioCodec: path.includes("episode-") ? "aac" : null,
        width: 720, height: 1280,
      };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, path) => writeFile(path, "final-video"),
    visualConsistencyAnalyzer: async () => ({
      status: "analyzed", passed: true, confidence: 0.9, summary: "一致",
    }),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  await pipeline.startRealVideo(project.id, { episodeLimit: 1 });
  const completed = await waitFor(pipeline, project.id);
  assert.equal(completed.status, "completed");
  assert.equal(videoCalls, 1);
  completed.assets.episodes[0].qualityReport = null;
  await writeFile(join(completed.dir, "project.json"), JSON.stringify(completed), "utf8");

  const result = await pipeline.revalidateEpisode(project.id, 1);
  assert.equal(videoCalls, 1);
  assert.equal(result.asset.qualityReport.status, "passed");
  assert.equal(result.asset.qualityReport.revalidationKind, "existing_media_only");
  assert.equal(result.asset.qualityReport.semanticAnalysis.visual.confidence, 0.9);
  const persisted = await pipeline.read(project.id);
  assert.equal(persisted.assets.episodes[0].qualityReport.status, "passed");
  assert.equal(persisted.episodeStates[0].stage, "重新验收通过");
});

test("failed revalidation invalidates completed project assembly and delivery", async () => {
  const { pipeline } = await setupWithEnv({}, {
    mediaProbe: async path => {
      await readFile(path);
      return {
        duration: 5, hasVideo: true, hasAudio: true,
        videoCodec: "h264", audioCodec: "aac", width: 720, height: 1280,
      };
    },
    mediaQualityAnalyzer: async () => ({
      status: "analyzed", blackSeconds: 0, freezeSeconds: 0,
      integratedLoudnessLufs: -20, truePeakDbfs: -3,
    }),
    visualConsistencyAnalyzer: async () => ({
      status: "analyzed", passed: false, confidence: 0.2, summary: "人物不一致",
    }),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  await writeFile(join(project.dir, "episode-01.mp4"), "existing-video");
  await writeFile(join(project.dir, "story-01.json"), JSON.stringify({
    episode: { number: 1, narration: "第一声钟响。", scenes: [] },
  }));
  const saved = await pipeline.read(project.id);
  saved.status = "completed";
  saved.assets = {
    episodes: [{
      number: 1, video: `/api/projects/${project.id}/assets/episode-01.mp4`,
      audioSource: "tts",
    }],
  };
  saved.assembly = {
    status: "completed", video: `/api/projects/${project.id}/assets/series-complete.mp4`,
  };
  saved.delivery = {
    status: "completed", url: `/api/projects/${project.id}/assets/commercial-delivery.zip`,
  };
  await writeFile(join(project.dir, "project.json"), JSON.stringify(saved), "utf8");

  const result = await pipeline.revalidateEpisode(project.id, 1);
  assert.equal(result.asset.qualityReport.status, "failed");
  const persisted = await pipeline.read(project.id);
  assert.equal(persisted.status, "failed");
  assert.match(persisted.error, /质量门禁/);
  assert.equal(persisted.episodeStates[0].status, "failed");
  assert.equal(persisted.assembly.status, "stale");
  assert.equal(persisted.delivery.status, "stale");
});

test("full-series resume skips completed episodes and only bills remaining work", async () => {
  let videoCalls = 0;
  const { pipeline, dataDir } = await setupWithEnv({
    ALLOW_BILLABLE_GENERATION: "true",
  }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return {
        duration: 5, hasVideo: true, hasAudio: path.includes("episode-"),
        videoCodec: "h264", audioCodec: path.includes("episode-") ? "aac" : null,
      };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, path) => writeFile(path, "final-video"),
    seriesAssembler: async (_dir, _list, output) => {
      await writeFile(output, "series-video");
      return 10;
    },
  });
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "第一幕雾起。第二幕追查。第三幕反转。".repeat(70),
    title: "全集续跑",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  assert.ok(project.seriesPlan.episodeCount >= 2);
  const saved = await pipeline.read(project.id);
  saved.productionBible.analyzedAt = new Date().toISOString();
  for (const character of saved.productionBible.characters) {
    character.views = {
      front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: "back.jpg",
    };
  }
  for (const scene of saved.productionBible.scenes) scene.image = "scene.jpg";
  for (const prop of saved.productionBible.props) prop.image = "prop.jpg";
  for (const voice of saved.productionBible.voices) {
    voice.speaker = `speaker-${voice.id}`;
    voice.sample = "voice.wav";
  }
  saved.assets = {
    episodes: [{
      number: 1, duration: 5,
      video: `/api/projects/${project.id}/assets/episode-01.mp4`,
      audio: `/api/projects/${project.id}/assets/narration-01.wav`,
      subtitles: `/api/projects/${project.id}/assets/episode-01.srt`,
    }],
  };
  saved.episodeStates[0] = {
    ...saved.episodeStates[0], status: "completed", stage: "已完成", progress: 100,
    assets: saved.assets.episodes[0],
  };
  await writeFile(join(dataDir, "projects", project.id, "episode-01.mp4"), "old-video");
  await writeFile(join(dataDir, "projects", project.id, "project.json"), JSON.stringify(saved));
  const remaining = project.seriesPlan.episodeCount - 1;
  await pipeline.startSeriesProduction(project.id, {
    confirmBillable: true,
    confirmedEpisodeCount: remaining,
  });
  const result = await waitFor(pipeline, project.id);
  assert.equal(result.status, "completed");
  assert.equal(result.productionRun.completedBeforeRun, 1);
  assert.deepEqual(result.productionRun.submittedEpisodes,
    Array.from({ length: remaining }, (_, index) => index + 2));
  assert.equal(videoCalls, remaining);
  assert.equal(result.assets.episodes.length, project.seriesPlan.episodeCount);
});

test("production preflight exposes estimates and hard-blocks work above daily budget", async () => {
  const { pipeline, dataDir } = await setupWithEnv({
    ALLOW_BILLABLE_GENERATION: "true",
    VIDEO_COST_CNY_PER_SECOND: "1",
    DAILY_BUDGET_CNY: "10",
  });
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "第一幕雾起。第二幕追查。第三幕反转。".repeat(70),
    title: "预算门禁",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  const saved = await pipeline.read(project.id);
  saved.productionBible.analyzedAt = new Date().toISOString();
  for (const character of saved.productionBible.characters) {
    character.views = {
      front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: "back.jpg",
    };
  }
  for (const scene of saved.productionBible.scenes) scene.image = "scene.jpg";
  for (const prop of saved.productionBible.props) prop.image = "prop.jpg";
  for (const voice of saved.productionBible.voices) {
    voice.speaker = `speaker-${voice.id}`;
    voice.sample = "voice.wav";
  }
  await writeFile(join(dataDir, "projects", project.id, "project.json"), JSON.stringify(saved));
  const preflight = await pipeline.productionPreflight(project.id);
  assert.equal(preflight.ready, false);
  assert.equal(preflight.costEstimate.available, true);
  assert.equal(preflight.costEstimate.estimatedCost,
    project.seriesPlan.episodeCount * 60);
  assert.match(preflight.blockers.join(" "), /超过每日预算/);
  await assert.rejects(() => pipeline.startSeriesProduction(project.id, {
    confirmBillable: true,
    confirmedEpisodeCount: project.seriesPlan.episodeCount,
  }), /超过每日预算/);
});

test("production preflight blocks real video when multimodal quality gate is unavailable", async () => {
  const { pipeline } = await setupWithEnv({
    ALLOW_BILLABLE_GENERATION: "true",
    VIDEO_COST_CNY_PER_SECOND: "0.2",
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  project.productionBible = readyProductionBible(project.productionBible);
  await writeFile(join(project.dir, "project.json"), JSON.stringify(project), "utf8");
  const preflight = await pipeline.productionPreflight(project.id);
  assert.equal(preflight.ready, false);
  assert.ok(preflight.blockers.includes("多模态成片一致性质检不可用或未通过运行检查"));
  await assert.rejects(
    () => pipeline.startSeriesProduction(project.id, {
      confirmBillable: true, confirmedEpisodeCount: preflight.remainingCount,
    }),
    /多模态成片一致性质检未通过运行检查/,
  );
});

test("model health distinguishes configured multimodal from operational access", async () => {
  const env = {
    ARK_BASE_URL: "https://ark.example.test/api/v3",
    ARK_API_KEY: "test-key",
    ARK_MULTIMODAL_MODEL: "restricted-endpoint",
  };
  const monitor = createModelHealthMonitor(
    new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
    env,
    {
      ttlMs: 60_000,
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: "AccessDenied" },
      }), {
        status: 403,
        headers: { "x-request-id": "request-1" },
      }),
    },
  );
  const status = await monitor.refresh({ force: true });
  const multimodal = status.models.find(model => model.id === "ark_multimodal");
  assert.equal(multimodal.configured, true);
  assert.equal(multimodal.health.operational, false);
  assert.equal(multimodal.health.httpStatus, 403);
  assert.equal(multimodal.health.errorCode, "AccessDenied");
  assert.equal(multimodal.health.requestId, "request-1");
  assert.equal(monitor.isOperational("ark_multimodal"), false);
  assert.equal(status.summary.configuredReady, false);
  assert.equal(status.summary.runtimeGates, 1);
  assert.equal(status.summary.runtimeGatesOperational, 0);
  assert.equal(status.summary.runtimeGatesReady, false);
  assert.equal(status.summary.ready, false);
});

test("model health uses a verified image-capable language model as quality fallback", async () => {
  const env = {
    ARK_BASE_URL: "https://ark.example.test/api/v3",
    ARK_API_KEY: "test-key",
    ARK_MULTIMODAL_MODEL: "restricted-endpoint",
    ARK_LLM_MODEL: "image-capable-language-model",
  };
  const requestedModels = [];
  const monitor = createModelHealthMonitor(
    new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
    env,
    {
      fetchImpl: async (_url, options) => {
        const model = JSON.parse(options.body).model;
        requestedModels.push(model);
        return model === "restricted-endpoint"
          ? new Response(JSON.stringify({ error: { code: "AccessDenied" } }), {
              status: 403,
            })
          : new Response(JSON.stringify({
              choices: [{ message: { content: "OK" } }],
            }), { status: 200 });
      },
    },
  );
  const status = await monitor.refresh({ force: true });
  const health = status.models.find(model => model.id === "ark_multimodal").health;
  assert.deepEqual(requestedModels, [
    "restricted-endpoint", "image-capable-language-model",
  ]);
  assert.equal(health.operational, true);
  assert.equal(health.fallbackUsed, true);
  assert.equal(health.selectedModel, "image-capable-language-model");
  assert.equal(health.primaryFailure.httpStatus, 403);
  assert.equal(env.ARK_QUALITY_MULTIMODAL_MODEL, "image-capable-language-model");
  assert.equal(status.summary.runtimeGatesReady, true);
  assert.equal(status.summary.configuredReady, false);
  assert.equal(status.summary.ready, false);
});

test("multimodal quality request retries transient failure but not permission denial", async () => {
  let attempts = 0;
  const payload = await requestMultimodalQuality({
    ARK_BASE_URL: "https://ark.example.test/api/v3",
    ARK_API_KEY: "test-key",
    MODEL_REQUEST_TIMEOUT_MS: "15000",
  }, "quality-model", [{ type: "text", text: "check" }], async () => {
    attempts++;
    return attempts === 1
      ? new Response('{"error":{"code":"InternalError"}}', { status: 503 })
      : new Response('{"choices":[{"message":{"content":"{}"}}]}', { status: 200 });
  });
  assert.equal(attempts, 2);
  assert.equal(payload.choices[0].message.content, "{}");

  let deniedAttempts = 0;
  await assert.rejects(() => requestMultimodalQuality({
    ARK_BASE_URL: "https://ark.example.test/api/v3",
    ARK_API_KEY: "test-key",
  }, "quality-model", [], async () => {
    deniedAttempts++;
    return new Response('{"error":{"code":"AccessDenied"}}', { status: 403 });
  }), /多模态质检失败 \(403\)/);
  assert.equal(deniedAttempts, 1);
});

test("full-series pause waits for the current episode and resumes remaining episodes", async () => {
  let videoCalls = 0;
  let firstStarted;
  const firstStartedPromise = new Promise(resolve => { firstStarted = resolve; });
  const { pipeline, dataDir } = await setupWithEnv({
    ALLOW_BILLABLE_GENERATION: "true",
    VIDEO_COST_CNY_PER_SECOND: "0.01",
    DAILY_BUDGET_CNY: "1000",
  }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return {
        duration: 5, hasVideo: true, hasAudio: path.includes("episode-"),
        videoCodec: "h264", audioCodec: path.includes("episode-") ? "aac" : null,
        width: 720, height: 1280,
      };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      if (videoCalls === 1) firstStarted();
      await new Promise(resolve => setTimeout(resolve, 40));
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, path) => writeFile(path, "final-video"),
    seriesAssembler: async (_dir, _list, output) => {
      await writeFile(output, "series-video");
      return 10;
    },
  });
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "第一幕雾起。第二幕追查。第三幕反转。".repeat(140),
    title: "暂停续跑",
    format: "anime",
    episodeDurationSeconds: 60,
    rightsConfirmed: true,
  });
  assert.ok(project.seriesPlan.episodeCount >= 3);
  const saved = await pipeline.read(project.id);
  saved.productionBible.analyzedAt = new Date().toISOString();
  for (const character of saved.productionBible.characters) {
    character.views = {
      front: "front.jpg", threeQuarter: "three.jpg", side: "side.jpg", back: "back.jpg",
    };
  }
  for (const scene of saved.productionBible.scenes) scene.image = "scene.jpg";
  for (const prop of saved.productionBible.props) prop.image = "prop.jpg";
  for (const voice of saved.productionBible.voices) {
    voice.speaker = `speaker-${voice.id}`;
    voice.sample = "voice.wav";
  }
  await writeFile(join(dataDir, "projects", project.id, "project.json"), JSON.stringify(saved));
  await pipeline.startSeriesProduction(project.id, {
    confirmBillable: true,
    confirmedEpisodeCount: project.seriesPlan.episodeCount,
  });
  await firstStartedPromise;
  await pipeline.controlSeriesProduction(project.id, "pause");
  let paused;
  for (let index = 0; index < 100; index++) {
    paused = await pipeline.read(project.id);
    if (paused.status === "paused") break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(paused.status, "paused");
  assert.equal(paused.productionRun.status, "paused");
  assert.equal(paused.assets.episodes.length, 1);
  assert.equal(videoCalls, 1);
  const remaining = project.seriesPlan.episodeCount - 1;
  await pipeline.startSeriesProduction(project.id, {
    confirmBillable: true,
    confirmedEpisodeCount: remaining,
  });
  const completed = await waitFor(pipeline, project.id);
  assert.equal(completed.status, "completed");
  assert.equal(videoCalls, project.seriesPlan.episodeCount);
  assert.equal(completed.productionRun.completedBeforeRun, 1);
});

test("AI production bible and generated character views are persisted", async () => {
  const { pipeline } = await setupWithEnv({
    ARK_API_KEY: "test", ARK_BASE_URL: "https://example.com", ARK_LLM_MODEL: "test-llm",
    ARK_IMAGE_MODEL: "test-image",
  }, {
    bibleAnalyzer: async () => ({
      version: 2, status: "needs_review",
      recommendation: {
        format: "drama", reason: "人物关系驱动，适合真人短剧", confidence: 0.88,
        currentFormatAtAnalysis: "anime",
      },
      characters: [{
        id: "character-1", name: "林舟", role: "主角", description: "追查真相",
        visualAnchor: "黑发、蓝衣", views: {}, sheet: null, status: "needs_design", locked: false,
      }],
      scenes: [], props: [],
      voices: [{
        id: "voice-1", characterId: "character-1", characterName: "林舟",
        speaker: "Uncle_Fu", direction: "沉稳", status: "configured", locked: false,
      }],
      continuity: { enabled: true, transitionStyle: "动作承接" },
    }),
    imageGenerator: async () => ({
      buffer: Buffer.from("valid mocked image bytes"),
      extension: "jpg", contentType: "image/jpeg",
      generation: { model: "test-image", bytes: 24 },
    }),
    characterSheetSplitter: async (_dir, _path, base, extension) => ({
      front: `${base}-front.${extension}`,
      threeQuarter: `${base}-threeQuarter.${extension}`,
      side: `${base}-side.${extension}`,
      back: `${base}-back.${extension}`,
    }),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: "林舟来到雾港。林舟发现一封信。",
    title: "资产链路", format: "anime", episodeDurationSeconds: 60, rightsConfirmed: true,
  });
  const analyzed = await pipeline.analyzeBible(project.id);
  assert.equal(analyzed.productionBible.characters[0].name, "林舟");
  assert.equal(analyzed.specification.format, "anime");
  assert.equal(analyzed.productionBible.recommendation.format, "drama");
  const applied = await pipeline.applyFormatRecommendation(project.id);
  assert.equal(applied.specification.format, "drama");
  assert.equal(applied.seriesPlan.format, "drama");
  const generated = await pipeline.generateBibleAsset(project.id, "character", "character-1");
  const character = generated.productionBible.characters[0];
  assert.equal(character.status, "ready");
  assert.match(character.sheet, /character-character-1-sheet\.jpg$/);
  assert.match(character.views.front, /character-character-1-front\.jpg$/);
  assert.ok(await readFile(join(generated.dir, "character-character-1-sheet.jpg")));
  assert.equal(pipeline.assetPath(project.id, "character-character-1-sheet.jpg"),
    join(generated.dir, "character-character-1-sheet.jpg"));
});

test("smart audio keeps native model audio without calling TTS", async () => {
  let speechCalls = 0, nativeCopies = 0, muxCalls = 0;
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async () => { speechCalls++; },
    probe: async () => 5,
    mediaProbe: async () => ({
      duration: 5, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac",
    }),
    nativeVoiceVerifier: async () => ({ verified: true, reason: "mock voice match" }),
    realVideo: async (_env, _story, _project, path) => writeFile(path, "native-video"),
    preserveNative: async (_dir, raw, output) => {
      nativeCopies++;
      await writeFile(output, await readFile(raw));
    },
    mux: async () => { muxCalls++; },
  });
  const plan = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime", episodeDurationSeconds: 5,
    audioStrategy: "auto", rightsConfirmed: true,
  });
  await pipeline.startRealVideo(plan.id, { episodeLimit: 1 });
  const result = await waitFor(pipeline, plan.id);
  assert.equal(result.status, "completed");
  assert.equal(speechCalls, 0);
  assert.equal(nativeCopies, 1);
  assert.equal(muxCalls, 0);
  assert.equal(result.assets.episodes[0].audioSource, "native");
  assert.equal(result.assets.episodes[0].nativeAudioDetected, true);
});

test("continuity ledger inherits voices, wardrobe and props unless the story explicitly changes them", () => {
  const project = {
    input: { sourceType: "manual", content: "林舟拿着长剑来到城门。" },
    seriesPlan: { format: "anime", episodes: [] },
    productionBible: {
      characters: [{
        id: "character-1", name: "林舟", visualAnchor: "青年、黑发、瘦高",
        defaultWardrobe: "深蓝长袍",
      }],
      voices: [{
        id: "voice-1", characterId: "character-1", characterName: "林舟",
        speaker: "Uncle_Fu", direction: "沉稳", bindingVersion: 1,
      }],
      scenes: [{ id: "scene-1", name: "城门", description: "石砌城门，左侧旗杆" }],
      props: [{
        id: "prop-1", name: "长剑", description: "黑铁剑鞘，银色剑格", initialHolder: "林舟",
      }],
      continuity: {},
    },
  };
  const first = buildContinuitySnapshot(project, {
    episode: { number: 1, narration: "林舟拿着长剑来到城门。" },
  });
  const second = buildContinuitySnapshot(project, {
    episode: { number: 2, narration: "林舟继续向城内走去。" },
  }, first);
  assert.equal(second.characters[0].wardrobe, "深蓝长袍");
  assert.equal(second.characters[0].wardrobeVersion, 1);
  assert.equal(second.voices[0].speaker, "Uncle_Fu");
  assert.equal(second.voices[0].bindingVersion, 1);
  assert.equal(second.props[0].holder, "林舟");
  assert.equal(second.props[0].stateVersion, 1);
  assert.equal(second.changes.length, 0);

  const third = buildContinuitySnapshot(project, {
    episode: { number: 3, narration: "林舟换上黑色夜行衣，长剑在打斗中折断。" },
  }, second);
  assert.equal(third.characters[0].wardrobeVersion, 2);
  assert.match(third.characters[0].wardrobe, /换上黑色夜行衣/);
  assert.equal(third.voices[0].speaker, "Uncle_Fu");
  assert.equal(third.props[0].stateVersion, 2);
  assert.match(third.props[0].condition, /长剑.*折断/);
  assert.equal(third.changes.length, 2);
});

test("episode continuity can be reviewed before generation and propagates to later episodes", async () => {
  const { pipeline } = await setup();
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "林舟拿着长剑进城。林舟继续赶路。林舟到达客栈。" + "剧情推进。".repeat(80),
    title: "连续性人工确认",
    format: "anime",
    episodeDurationSeconds: 5,
    rightsConfirmed: true,
  });
  const created = await pipeline.read(project.id);
  assert.equal(created.continuityLedger.snapshots.length, created.seriesPlan.episodeCount);
  const characterId = created.productionBible.characters[0].id;
  const updated = await pipeline.updateEpisodeContinuity(project.id, 2, {
    characters: [{
      characterId,
      wardrobe: "黑色夜行衣",
      reason: "潜入客栈前主动换装",
    }],
    note: "导演已确认",
  });
  const second = updated.continuityLedger.snapshots[1];
  const third = updated.continuityLedger.snapshots[2];
  assert.equal(second.characters[0].wardrobe, "黑色夜行衣");
  assert.equal(second.review.status, "confirmed");
  assert.equal(third.characters[0].wardrobe, "黑色夜行衣");
  assert.equal(third.characters[0].inheritedWardrobe, true);
});

test("unverified native character voices fall back to fixed TTS", async () => {
  let speechCalls = 0, muxCalls = 0, nativeCopies = 0;
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { speechCalls++; await writeFile(path, "audio"); },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" };
    },
    nativeVoiceVerifier: async () => ({ verified: false, reason: "character voice mismatch" }),
    realVideo: async (_env, _story, _project, path) => writeFile(path, "native-video"),
    mux: async (_dir, _raw, _audio, output) => { muxCalls++; await writeFile(output, "final-video"); },
    preserveNative: async () => { nativeCopies++; },
  });
  const plan = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime", episodeDurationSeconds: 5,
    audioStrategy: "auto", rightsConfirmed: true,
  });
  await pipeline.startRealVideo(plan.id, { episodeLimit: 1 });
  const result = await waitFor(pipeline, plan.id);
  assert.equal(result.status, "completed");
  assert.equal(speechCalls, 1);
  assert.equal(muxCalls, 1);
  assert.equal(nativeCopies, 0);
  assert.equal(result.assets.episodes[0].audioSource, "tts");
  assert.equal(result.assets.episodes[0].nativeVoiceVerification.verified, false);
});

test("native audio with matching voice but unverified words falls back to fixed TTS", async () => {
  let speechCalls = 0, muxCalls = 0, nativeCopies = 0;
  const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { speechCalls++; await writeFile(path, "audio"); },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" };
    },
    nativeVoiceVerifier: async () => ({ verified: true, reason: "voice identity matched" }),
    nativeSpeechVerifier: async () => ({
      status: "analyzed", verified: false, similarity: 0.21,
      reason: "recognized dialogue does not match episode script",
    }),
    realVideo: async (_env, _story, _project, path) => writeFile(path, "native-video"),
    mux: async (_dir, _raw, _audio, output) => { muxCalls++; await writeFile(output, "final-video"); },
    preserveNative: async () => { nativeCopies++; },
  });
  const plan = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime", episodeDurationSeconds: 5,
    audioStrategy: "auto", rightsConfirmed: true,
  });
  await pipeline.startRealVideo(plan.id, { episodeLimit: 1 });
  const result = await waitFor(pipeline, plan.id);
  assert.equal(result.status, "completed");
  assert.equal(speechCalls, 1);
  assert.equal(muxCalls, 1);
  assert.equal(nativeCopies, 0);
  assert.equal(result.assets.episodes[0].audioSource, "tts");
  assert.equal(result.assets.episodes[0].nativeSpeechVerification.verified, false);
  assert.equal(
    result.assets.episodes[0].qualityReport.semanticAnalysis.speech.proof,
    "tts_subtitle_same_source",
  );
});

test("smart audio falls back to TTS while TTS mode always replaces native audio", async () => {
  for (const scenario of [
    { strategy: "auto", native: false, fallback: false },
    { strategy: "native", native: false, fallback: true },
    { strategy: "tts", native: true, fallback: false },
  ]) {
    let speechCalls = 0, muxCalls = 0, nativeCopies = 0;
    const { pipeline } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
      speech: async (_url, _story, path) => { speechCalls++; await writeFile(path, "audio"); },
      probe: async path => { await readFile(path); return 5; },
      mediaProbe: async path => {
        await readFile(path);
        return {
          duration: 5, hasVideo: true,
          hasAudio: path.includes("episode-") ? true : scenario.native,
          videoCodec: "h264", audioCodec: scenario.native ? "aac" : null,
        };
      },
      realVideo: async (_env, _story, _project, path) => writeFile(path, "model-video"),
      mux: async (_dir, _raw, _audio, output) => { muxCalls++; await writeFile(output, "final-video"); },
      preserveNative: async () => { nativeCopies++; },
    });
    const plan = await pipeline.createPlan({
      sourceType: "manual", content: input.content, format: "anime", episodeDurationSeconds: 5,
      audioStrategy: scenario.strategy, rightsConfirmed: true,
    });
    await pipeline.startRealVideo(plan.id, { episodeLimit: 1 });
    const result = await waitFor(pipeline, plan.id);
    assert.equal(result.status, "completed");
    assert.equal(speechCalls, 1);
    assert.equal(muxCalls, 1);
    assert.equal(nativeCopies, 0);
    assert.equal(result.assets.episodes[0].audioSource, "tts");
    assert.equal(result.assets.episodes[0].nativeAudioFallback, scenario.fallback);
  }
});

test("Hermes agent loop plans safe edits and persists verified session", async () => {
  const { pipeline, dataDir } = await setup();
  const project = await pipeline.createPlan({
    sourceType: "manual",
    content: "林舟穿着蓝衣来到钟楼。林舟听见钟声。林舟推开门。" + "剧情推进。".repeat(80),
    title: "导演 Agent 测试",
    format: "anime",
    episodeDurationSeconds: 5,
    rightsConfirmed: true,
  });
  const characterId = (await pipeline.read(project.id)).productionBible.characters[0].id;
  const agent = createHermesAgentLoop({
    pipeline, dataDir, env: {},
    planner: async () => ({
      reply: "计划把第 2 集服装改成黑色夜行衣。",
      actions: [{
        tool: "update_episode_continuity",
        arguments: {
          episodeNumber: 2,
          characters: [{ characterId, wardrobe: "黑色夜行衣", reason: "潜入前换装" }],
          note: "导演 Agent 修改",
        },
        reason: "更新第 2 集服装连续性",
      }],
    }),
  });
  const session = await agent.message(project.id, "林舟从第 2 集开始换黑色夜行衣");
  assert.equal(session.status, "completed");
  assert.equal(session.toolCalls[0].status, "completed");
  const saved = await agent.read(project.id, session.id);
  assert.equal(saved.status, "completed");
  const updated = await pipeline.read(project.id);
  assert.equal(updated.continuityLedger.snapshots[1].characters[0].wardrobe, "黑色夜行衣");
});

test("Hermes agent loop requires approval before regenerating completed episodes", async () => {
  let videoCalls = 0;
  const { pipeline, dataDir } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: path.includes("episode-"), videoCodec: "h264", audioCodec: "aac" };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      if (videoCalls > 1) await new Promise(resolve => setTimeout(resolve, 50));
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  await pipeline.startRealVideo(project.id, { episodeLimit: 1 });
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  const agent = createHermesAgentLoop({
    pipeline, dataDir, env: {},
    planner: async () => ({
      reply: "计划重新生成第 1 集。",
      actions: [{ tool: "regenerate_episode", arguments: { episodeNumber: 1 }, reason: "修复第 1 集" }],
    }),
  });
  const session = await agent.message(project.id, "重新生成第 1 集");
  assert.equal(session.status, "needs_approval");
  assert.equal(session.plan.approvals[0].billable, true);
  await assert.rejects(() => agent.approve(project.id, session.id, "wrong-token"), /审批令牌/);
  const approved = await agent.approve(project.id, session.id, session.approvalToken);
  assert.equal(approved.status, "running");
  assert.equal(approved.toolCalls[0].status, "submitted");
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  const completed = await agent.read(project.id, session.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.toolCalls[0].status, "completed");
});

test("Hermes agent loop expands visual ending edits into regeneration", async () => {
  let videoCalls = 0;
  const { pipeline, dataDir } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: path.includes("episode-"), videoCodec: "h264", audioCodec: "aac" };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      if (videoCalls > 1) await new Promise(resolve => setTimeout(resolve, 50));
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  await pipeline.startRealVideo(project.id, { episodeLimit: 1 });
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  const agent = createHermesAgentLoop({
    pipeline, dataDir, env: {},
    planner: async () => ({
      reply: "计划把第 1 集结尾改成一只狗的帧结尾。",
      actions: [{
        tool: "update_episode",
        arguments: { episodeNumber: 1, instruction: "把第 1 集结尾改成一只狗的帧结尾" },
        reason: "更新第 1 集结尾画面",
      }],
    }),
  });
  const session = await agent.message(project.id, "把第 1 集结尾改成一只狗的帧结尾");
  assert.equal(session.status, "needs_approval");
  assert.deepEqual(session.plan.actions.map(action => action.tool), ["update_episode", "regenerate_episode"]);
  const approved = await agent.approve(project.id, session.id, session.approvalToken);
  assert.equal(approved.status, "running");
  assert.equal(approved.toolCalls.at(-1).status, "submitted");
  const updated = await pipeline.read(project.id);
  assert.match(updated.seriesPlan.episodes[0].directorInstruction, /狗/);
  assert.match(updated.episodeStates[0].status, /^(queued|running)$/);
  assert.equal((await waitFor(pipeline, project.id)).status, "completed");
  assert.equal((await agent.read(project.id, session.id)).status, "completed");
});

test("Hermes agent loop regenerates multiple episodes sequentially without duplicate calls", async () => {
  let videoCalls = 0;
  const { pipeline, dataDir } = await setupWithEnv({ ALLOW_BILLABLE_GENERATION: "true" }, {
    speech: async (_url, _story, path) => { await writeFile(path, "audio"); return 1; },
    probe: async path => { await readFile(path); return 5; },
    mediaProbe: async path => {
      await readFile(path);
      return { duration: 5, hasVideo: true, hasAudio: path.includes("episode-"), videoCodec: "h264", audioCodec: "aac" };
    },
    realVideo: async (_env, _story, _project, path) => {
      videoCalls++;
      await new Promise(resolve => setTimeout(resolve, 25));
      await writeFile(path, "model-video");
    },
    mux: async (_dir, _raw, _audio, output) => writeFile(output, "final-video"),
  });
  const project = await pipeline.createPlan({
    sourceType: "manual", content: "钟楼亮起。".repeat(80), format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  assert.ok(project.seriesPlan.episodeCount >= 2);
  const agent = createHermesAgentLoop({
    pipeline, dataDir, env: {},
    planner: async () => ({
      reply: "依次重新生成前两集。",
      actions: [1, 2].map(episodeNumber => ({
        tool: "regenerate_episode", arguments: { episodeNumber }, reason: `重新生成第 ${episodeNumber} 集`,
      })),
    }),
  });
  const planned = await agent.message(project.id, "依次重新生成前两集");
  const running = await agent.approve(project.id, planned.id, planned.approvalToken);
  assert.equal(running.status, "running");
  for (let index = 0; index < 200; index++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    const state = await agent.read(project.id, planned.id);
    if (state.status === "completed") {
      assert.deepEqual(state.toolCalls.map(call => call.arguments.episodeNumber), [1, 2]);
      assert.ok(state.toolCalls.every(call => call.status === "completed"));
      assert.equal(new Set(state.toolCalls.map(call => call.actionId)).size, 2);
      assert.equal(videoCalls, 2);
      return;
    }
    assert.notEqual(state.status, "failed", state.error);
  }
  assert.fail("Agent sequential regeneration timed out");
});

test("Hermes agent loop reports a submitted generation interrupted by restart as failed", async () => {
  const { pipeline, dataDir } = await setup();
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  const agent = createHermesAgentLoop({ pipeline, dataDir, env: {} });
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(), projectId: project.id, status: "running",
    createdAt: now, updatedAt: now, prompt: "重生成第 1 集", reply: "生成中",
    rounds: 1,
    plan: {
      actions: [{ id: "action-1", tool: "regenerate_episode", arguments: { episodeNumber: 1 } }],
      approvals: [],
    },
    toolCalls: [{
      actionId: "action-1", tool: "regenerate_episode", arguments: { episodeNumber: 1 },
      status: "submitted", startedAt: now, submittedAt: now,
    }],
  };
  const sessionDir = join(dataDir, "projects", project.id, "agent-sessions");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, `${session.id}.json`), JSON.stringify(session));
  const persisted = await pipeline.read(project.id);
  persisted.status = "failed";
  persisted.stage = "任务被服务重启中断";
  persisted.error = "请点击重试；已生成的旁白会在校验后复用。";
  persisted.episodeStates[0].status = "failed";
  persisted.episodeStates[0].error = persisted.error;
  await writeFile(join(dataDir, "projects", project.id, "project.json"), JSON.stringify(persisted));
  const failed = await agent.read(project.id, session.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.toolCalls[0].status, "failed");
  assert.match(failed.reply, /视频生成失败/);
});

test("Hermes agent loop rejects unknown tools", async () => {
  const { pipeline, dataDir } = await setup();
  const project = await pipeline.createPlan({
    sourceType: "manual", content: input.content, format: "anime",
    episodeDurationSeconds: 5, rightsConfirmed: true,
  });
  const agent = createHermesAgentLoop({
    pipeline, dataDir, env: {},
    planner: async () => ({
      reply: "bad",
      actions: [{ tool: "shell_exec", arguments: { cmd: "rm -rf ." }, reason: "bad" }],
    }),
  });
  await assert.rejects(() => agent.message(project.id, "执行未知工具"), /未授权工具/);
});
