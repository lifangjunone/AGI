const test = require("node:test");
const assert = require("node:assert/strict");
const { planSocialSlots, executeSocialTasks, validateContentPackage, verifiedPublication } = require("../src/social-scheduler");
const config = {
  channel: "xiaohongshu", runtimeEnabled: true,
  dailySlots: ["08:00", "12:00", "20:00"].map((time, i) => ({ id: String(i), time, content: "test" })),
  contentPackages: Object.fromEntries(["0", "1", "2"].map(id => [id, [{
    id: `package-${id}`,
    title: "投诉截图太乱？先变成这3份材料",
    body: "遇到退款、售后扯皮时，最费时间的往往不是截图，而是把几十张截图说清楚。工具先免费预览整理目录、时间线和报告，满意后再决定是否下载分类ZIP。配图是虚构演示，不是真实客户案例；工具不代写事实、不提供法律意见、不保证退款结果。这个内容包用于平台发布前检查，必须保留营销声明、演示声明和本地处理说明，避免把草稿或普通话题字符误当成真实发布。",
    assets: ["docs/promotion/consumer-evidence-first-post/01-demo-delivery.png"],
    topicQueries: ["证据整理", "消费维权"],
    landingUrl: "https://lifeyoume.icu/image/products/consumer-evidence-pack/",
    disclosures: ["marketing", "demo-not-customer-case"],
  }]])),
};
test("Beijing schedule creates three slots once and preserves state", () => {
  const now = new Date("2026-10-22T04:00:00Z");
  const state = planSocialSlots({ now, config, state: {} });
  assert.equal(state.tasks.length, 3);
  assert.equal(state.tasks[1].dueAt, "2026-10-22T12:00:00+08:00");
  assert.equal(state.tasks[1].contentPackage.qualityGate.ok, true);
  assert.equal(state.tasks[1].contentPackage.topicQueries.includes("证据整理"), true);
  assert.equal(planSocialSlots({ now, config, state }).tasks.length, 3);
});
test("existing daily tasks are hydrated with content packages after a release upgrade", () => {
  const now = new Date("2026-10-22T09:40:00Z");
  const state = planSocialSlots({
    now,
    config,
    state: {
      tasks: [{
        key: "xiaohongshu:2026-10-22:2",
        channel: "xiaohongshu",
        day: "2026-10-22",
        slot: "2",
        dueAt: "2026-10-22T20:00:00+08:00",
        contentType: "具体场景与整理前后对照",
        status: "scheduled",
        attempts: 0,
      }],
    },
  });
  const evening = state.tasks.find(task => task.slot === "2");
  assert.equal(evening.contentPackage.title, "投诉截图太乱？先变成这3份材料");
  assert.equal(evening.contentPackage.qualityGate.ok, true);
});
test("content package gate blocks raw hashtags and overclaims", () => {
  const result = validateContentPackage({
    title: "保证退款 #维权",
    body: "保证退款，真实客户案例，随便写点内容满足最短长度要求，随便写点内容满足最短长度要求，随便写点内容满足最短长度要求。",
    assets: ["a.png"],
    topicQueries: ["证据整理", "消费维权"],
    landingUrl: "https://lifeyoume.icu/image/products/consumer-evidence-pack/",
    disclosures: ["marketing", "demo-not-customer-case"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.includes("raw-hashtag-present-use-native-topic-picker"), true);
  assert.equal(result.errors.includes("overclaiming-risk"), true);
});
test("missing publisher is blocked, not marked published; expired slots do not backfill", async () => {
  const now = new Date("2026-10-22T04:00:00Z");
  const state = planSocialSlots({ now, config, state: {} });
  await executeSocialTasks({ now, state, persist: () => {} });
  assert.equal(state.tasks[0].status, "expired");
  assert.equal(state.tasks[1].status, "blocked");
  assert.equal(state.tasks[2].status, "scheduled");
});
test("ambiguous publish is looked up before retry, verified existing result prevents duplicate", async () => {
  const now = new Date("2026-10-22T04:00:00Z");
  const state = planSocialSlots({ now, config, state: {} });
  let calls = 0;
  const receipt = { status: "published", noteId: "real-note", url: "https://www.xiaohongshu.com/explore/real-note", verifiedAt: now.toISOString(), nativeTopicsVerified: true };
  const publisher = { lookup: async () => calls ? receipt : { status: "absent" }, publish: async () => { calls++; throw new Error("timeout"); } };
  await executeSocialTasks({ now, state, publisher, persist: () => {} });
  assert.equal(state.tasks[1].status, "verification-pending");
  await executeSocialTasks({ now: new Date(now.getTime() + 16 * 60000), state, publisher, persist: () => {} });
  assert.equal(state.tasks[1].status, "published");
  assert.equal(calls, 1);
  assert.equal(verifiedPublication({ status: "published" }), false);
});
test("publisher receives content package and native topic requirements", async () => {
  const now = new Date("2026-10-22T04:00:00Z");
  const state = planSocialSlots({ now, config, state: {} });
  let submitted;
  const publisher = {
    lookup: async () => ({ status: "absent" }),
    publish: async task => {
      submitted = task;
      return {
        status: "published",
        noteId: "scheduled-note",
        url: "https://www.xiaohongshu.com/explore/scheduled-note",
        verifiedAt: now.toISOString(),
        nativeTopicsVerified: true,
      };
    },
  };
  await executeSocialTasks({ now, state, publisher, persist: () => {} });
  assert.equal(state.tasks[1].status, "published");
  assert.equal(submitted.contentPackage.title, "投诉截图太乱？先变成这3份材料");
  assert.equal(submitted.requirements.selectNativeTopics, true);
});
