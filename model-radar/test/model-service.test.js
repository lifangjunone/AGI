import test from "node:test";
import assert from "node:assert/strict";
import { ModelService, classifyModel, normalizeHuggingFace, normalizeProvider } from "../lib/model-service.js";

test("classifies models by pipeline and tags", () => {
  assert.equal(classifyModel({ pipeline_tag: "text-to-image" }), "图像生成");
  assert.equal(classifyModel({ tags: ["audio-generation"] }), "语音模型");
  assert.equal(classifyModel({ tags: ["embedding"] }), "嵌入模型");
});

test("normalizes known and community providers", () => {
  assert.equal(normalizeProvider("deepseek-ai/model"), "DeepSeek");
  assert.equal(normalizeProvider("some-lab/model"), "Some Lab");
});

test("scores a Hugging Face model", () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  const model = normalizeHuggingFace({
    id: "deepseek-ai/new-model",
    pipeline_tag: "text-generation",
    createdAt: "2026-10-22T00:00:00Z",
    trendingScore: 1200,
    likes: 900,
    downloads: 30000,
    tags: []
  }, now);
  assert.equal(model.provider, "DeepSeek");
  assert.equal(model.type, "语言模型");
  assert.ok(model.heat > 70);
  assert.deepEqual(Object.keys(model.scoreBreakdown), ["momentum", "freshness", "adoption"]);
});

test("caches results for one hour and can force refresh", async () => {
  let calls = 0;
  let now = Date.parse("2026-10-23T00:00:00Z");
  const fetcher = async (url) => {
    calls += 1;
    return {
      ok: true,
      json: async () => url.includes("huggingface")
        ? [{ id: "qwen/Test", createdAt: "2026-10-22T00:00:00Z", trendingScore: 20, tags: [], pipeline_tag: "text-generation" }]
        : { data: [] }
    };
  };
  const service = new ModelService({ fetcher, now: () => now });
  const first = await service.getSnapshot();
  const second = await service.getSnapshot();
  assert.equal(first, second);
  assert.equal(calls, 2);
  await service.getSnapshot({ force: true });
  assert.equal(calls, 4);
  assert.equal(service.snapshot.hasComparison, true);
  assert.equal(service.snapshot.models[0].movement.rankDelta, 0);
  assert.equal(service.snapshot.leaderHours, 1);
  now += 2 * 60 * 60 * 1000;
  await service.getSnapshot({ force: true });
  assert.equal(service.snapshot.leaderHours, 3);
});
