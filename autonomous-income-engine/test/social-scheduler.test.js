const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  planSocialSlots,
  executeSocialTasks,
  validateContentPackage,
  verifiedPublication,
  claimDueSocialTask,
  recordSocialTaskResult,
  selectedProductForDay,
} = require("../src/social-scheduler");
const config = {
  channel: "xiaohongshu", runtimeEnabled: true,
  dailySlots: ["08:00", "12:00", "20:00"].map((time, i) => ({ id: String(i), time, content: "test" })),
  contentPackages: Object.fromEntries(["0", "1", "2"].map(id => [id, [{
    id: `package-${id}`,
    title: `投诉截图整理测试内容包${id}`,
    body: "遇到退款、售后扯皮时，最费时间的往往不是截图，而是把几十张截图说清楚。工具先免费预览整理目录、时间线和报告，满意后再决定是否下载分类ZIP。配图是虚构演示，不是真实客户案例；工具不代写事实、不提供法律意见、不保证退款结果。这个内容包用于平台发布前检查，必须保留营销声明、演示声明和本地处理说明，避免把草稿或普通话题字符误当成真实发布。",
    assets: [`docs/promotion/test-cover-${id}.png`],
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
  assert.equal(evening.contentPackage.title, "投诉截图整理测试内容包2");
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
test("content package gate blocks a title or cover reused within seven days", () => {
  const candidate = structuredClone(config.contentPackages["0"][0]);
  const sameTitle = validateContentPackage(candidate, {
    recentPackages: [{ title: candidate.title, assets: ["different-cover.png"] }],
  });
  assert.equal(sameTitle.ok, false);
  assert.equal(sameTitle.errors.includes("title-reused-within-seven-days"), true);
  const sameCover = validateContentPackage(candidate, {
    recentPackages: [{ title: "不同标题不会触发标题重复", assets: candidate.assets }],
  });
  assert.equal(sameCover.ok, false);
  assert.equal(sameCover.errors.includes("cover-reused-within-seven-days"), true);
});
test("daily slots reject duplicate covers even when titles differ", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  const duplicateConfig = structuredClone(config);
  duplicateConfig.contentPackages["1"][0].assets = duplicateConfig.contentPackages["0"][0].assets;
  const state = planSocialSlots({ now, config: duplicateConfig, state: {} });
  assert.equal(state.tasks[0].contentPackage.qualityGate.ok, true);
  assert.equal(state.tasks[1].contentPackage.qualityGate.ok, false);
  assert.equal(
    state.tasks[1].contentPackage.qualityGate.errors.includes("cover-reused-within-seven-days"),
    true
  );
});
test("30-day product campaign preserves the agreed promotion distribution", () => {
  const campaignConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config", "social-publishing-schedule.json"), "utf8")
  );
  const counts = {};
  for (let offset = 0; offset < 30; offset += 1) {
    const now = new Date(Date.parse("2026-10-23T00:00:00Z") + offset * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const productId = selectedProductForDay(campaignConfig, { day: parts });
    counts[productId] = (counts[productId] || 0) + 1;
  }
  assert.deepEqual(counts, {
    frame60: 11,
    audit: 7,
    "resume-forge": 4,
    "privacy-vault": 2,
    "travel-frame": 2,
    "story-studio": 1,
    "flowframe-studio": 1,
    "meyou-agent-network": 1,
    "skill-radar": 1,
  });
});
test("campaign content distinguishes paid commerce from free exploration", () => {
  const campaignConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config", "social-publishing-schedule.json"), "utf8")
  );
  const paid = planSocialSlots({
    now: new Date("2026-10-23T00:00:00Z"), config: campaignConfig, state: {},
  }).tasks[1].contentPackage;
  assert.equal(paid.selectedProductId, "frame60");
  assert.equal(paid.campaignRole, "commerce");
  assert.match(paid.body, /¥9\.90/);
  assert.match(paid.body, /lifeyoume\.icu\/video\//);
  const free = planSocialSlots({
    now: new Date("2026-10-26T00:00:00Z"), config: campaignConfig, state: {},
  }).tasks[1].contentPackage;
  assert.equal(free.selectedProductId, "resume-forge");
  assert.equal(free.campaignRole, "exploration");
  assert.doesNotMatch(free.body, /¥/);
  assert.match(free.body, /lifeyoume\.icu\/resume\//);
});
test("campaign quality gate rejects a post whose buyer access address is missing", () => {
  const result = validateContentPackage({
    title: "商品内容包到底会交付哪些内容",
    body: "这是一段足够长的产品说明，用于介绍已经存在的真实交付能力、免费预览、价格和支付方式，但故意遗漏用户能够访问产品的地址。内容不会伪造客户、销量、收入或使用结果，也明确说明配图只是产品能力演示，不是真实客户案例。这里继续补充必要的产品边界与使用说明，以满足正常发布正文的长度要求。",
    assets: ["cover.png"],
    topicQueries: ["商品文案", "内容运营"],
    landingUrl: "https://lifeyoume.icu/video/",
    campaignRole: "commerce",
    disclosures: ["marketing", "demo-not-customer-case"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.includes("buyer-access-address-missing-from-body"), true);
});
test("missing HTTP publisher waits for audited browser agent; expired slots do not backfill", async () => {
  const now = new Date("2026-10-22T04:00:00Z");
  const state = planSocialSlots({ now, config, state: {} });
  await executeSocialTasks({ now, state, persist: () => {} });
  assert.equal(state.tasks[0].status, "expired");
  assert.equal(state.tasks[1].status, "ready-for-browser-agent");
  assert.equal(state.tasks[1].reason, "awaiting-audited-browser-publisher");
  assert.equal(state.tasks[2].status, "scheduled");
});
test("platform-scheduled tasks are not resubmitted or downgraded", async () => {
  const now = new Date("2026-10-22T12:30:00Z");
  const state = planSocialSlots({ now, config, state: {} });
  const task = state.tasks[2];
  task.status = "platform-scheduled";
  task.platformSchedule = {
    scheduledAt: "2026-10-22T21:30:00+08:00",
    platformStatus: "reviewing",
  };
  let calls = 0;
  const publisher = {
    lookup: async () => { calls += 1; return { status: "absent" }; },
    publish: async () => { calls += 1; return { status: "absent" }; },
  };
  await executeSocialTasks({ now, state, publisher, persist: () => {} });
  assert.equal(task.status, "platform-scheduled");
  assert.equal(calls, 0);
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
  assert.equal(submitted.contentPackage.title, "投诉截图整理测试内容包1");
  assert.equal(submitted.requirements.selectNativeTopics, true);
});

test("browser publisher claims once and requires platform proof for final states", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-browser-agent-"));
  try {
    const now = new Date("2026-10-22T04:00:00Z");
    const state = planSocialSlots({ now, config, state: {} });
    fs.writeFileSync(path.join(dataDir, "social-schedule-state.json"), JSON.stringify(state));
    const claimed = claimDueSocialTask({ dataDir, now, workerId: "browser-1" });
    assert.equal(claimed.key, "xiaohongshu:2026-10-22:1");
    assert.equal(claimed.status, "claimed");
    assert.equal(claimDueSocialTask({ dataDir, now, workerId: "browser-2" }), null);
    assert.throws(
      () => recordSocialTaskResult({
        dataDir,
        key: claimed.key,
        result: { status: "published", receipt: { status: "published" } },
        now,
      }),
      /verified platform receipt/
    );
    const pending = recordSocialTaskResult({
      dataDir,
      key: claimed.key,
      result: { status: "verification-pending", reason: "platform-record-required" },
      now,
    });
    assert.equal(pending.status, "verification-pending");
    assert.equal(pending.reason, "platform-record-required");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
