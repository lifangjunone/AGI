const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aie-product-matrix-"));
process.env.AIE_DATA_DIR = path.join(stateRoot, "data");
process.env.AIE_RUNTIME_DIR = path.join(stateRoot, "runtime");
process.env.AIE_DIST_DIR = path.join(stateRoot, "dist");
process.env.AIE_PUBLIC_SITE_DIR = path.join(stateRoot, "public-site");

const {
  DIST_DIR,
  appendEvent,
  configurePublicBaseUrl,
  createCheckout,
  confirmManualCheckoutDirect,
  generateSite,
  indexNowUrls,
  productMatrixSnapshot,
  productAcquisitionSnapshot,
  searchContentFingerprint,
  evaluateIncomeEvolution,
} = require("../src/engine");

test.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));

test("income evolution runs daily, applies bounded changes and rolls back ineffective variants", () => {
  const product = (visits, completed = 0, checkouts = 0) => ({
    id: "consumer-evidence-pack", purchasable: true,
    funnel: { visits, started: completed, completed, checkouts, paid: 0, downloads: 0, revenue: 0 },
  });
  const evaluate = (day, state, item) => evaluateIncomeEvolution({
    now: new Date(`2026-10-${day}T12:00:00+08:00`), state, products: [item],
  });
  const initial = evaluate(21, {}, product(2));
  assert.equal(initial.products["consumer-evidence-pack"].decision, "distribution");
  assert.deepEqual(initial.ownerTasks, []);
  assert.equal(initial.channelState, "no-authorized-publisher");
  const applied = evaluate(22, initial, product(30));
  assert.equal(applied.products["consumer-evidence-pack"].variant, "upload-first");
  assert.equal(evaluate(22, applied, product(50)).skipped, true);
  const observing = evaluate(23, applied, product(40));
  assert.equal(observing.products["consumer-evidence-pack"].experiment.kind, "upload-first");
  const rolledBack = evaluate(24, observing, product(60));
  assert.equal(rolledBack.products["consumer-evidence-pack"].decision, "rollback");
  assert.equal(rolledBack.products["consumer-evidence-pack"].variant, "control");
  const stopped = evaluate(25, rolledBack, product(70));
  assert.equal(stopped.products["consumer-evidence-pack"].decision, "stop-variant-churn");
  const value = evaluate(26, stopped, product(80, 5));
  assert.equal(value.products["consumer-evidence-pack"].variant, "delivery-value");
});

test("product matrix only ranks runnable products and exposes one daily candidate", () => {
  const now = new Date("2026-10-19T10:00:00+08:00");
  const matrix = productMatrixSnapshot({ now });
  assert.equal(matrix.readyCount, 2);
  assert.equal(matrix.visibleCount, 3);
  assert.deepEqual(
    matrix.top.map((item) => item.id),
    ["consumer-evidence-pack", "product-image-batch-studio"]
  );
  assert.equal(matrix.products.filter((item) => item.status === "building").length, 1);
  assert.equal(matrix.products.some((item) => item.id === "rental-handover-evidence"), false);
  assert.ok(matrix.products.filter((item) => item.purchasable).every((item) => item.path && item.price > 0));
});

test("ranking uses real funnel weights and ignores crawler views", () => {
  appendEvent({
    type: "view",
    experimentId: "product-image-batch-studio",
    channel: "server:product",
    visitorId: "bot",
    userAgent: "Googlebot",
  });
  appendEvent({
    type: "view",
    experimentId: "product-image-batch-studio",
    channel: "server:product",
    visitorId: "human-image",
    userAgent: "Mozilla/5.0",
  });
  appendEvent({
    type: "interaction",
    experimentId: "consumer-evidence-pack",
    channel: "evidence-upload-started",
    visitorId: "human-evidence",
  });
  appendEvent({
    type: "interaction",
    experimentId: "consumer-evidence-pack",
    channel: "evidence-pack-completed",
    visitorId: "human-evidence",
  });
  const checkout = createCheckout({
    productId: "consumer-evidence-pack",
    checkoutMode: "manual-wechat",
    visitorId: "human-evidence",
    source: "test-explicit-click",
  });
  const matrix = productMatrixSnapshot({ now: new Date("2026-10-19T11:00:00+08:00") });
  const evidence = matrix.products.find((item) => item.id === "consumer-evidence-pack");
  const image = matrix.products.find((item) => item.id === "product-image-batch-studio");
  assert.equal(image.funnel.visits, 1);
  assert.equal(evidence.funnel.started, 1);
  assert.equal(evidence.funnel.completed, 1);
  assert.equal(evidence.funnel.checkouts, 1);
  assert.equal(evidence.score, 150);
  assert.equal(matrix.top[0].id, "consumer-evidence-pack");
  confirmManualCheckoutDirect(checkout.id);
  const paidMatrix = productMatrixSnapshot({ now: new Date("2026-10-19T11:05:00+08:00") });
  const paidEvidence = paidMatrix.products.find((item) => item.id === "consumer-evidence-pack");
  assert.equal(paidEvidence.funnel.paid, 1);
  assert.equal(paidEvidence.funnel.revenue > 19 && paidEvidence.funnel.revenue < 19.9, true);
});

test("site build creates the matrix and both runnable tools", () => {
  const result = generateSite({ seed: 20261019, count: 2 });
  const home = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
  const sitemap = fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8");
  const feed = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "feed.json"), "utf8"));
  assert.match(home, /把麻烦事/);
  assert.match(home, /选择你现在要解决的问题/);
  assert.doesNotMatch(home, /实验榜|真人访问|确认付款|得分 0|正在构建/);
  assert.match(
    fs.readFileSync(path.join(DIST_DIR, "products", "consumer-evidence-pack", "index.html"), "utf8"),
    /SHA-256/
  );
  const evidenceTool = fs.readFileSync(
    path.join(DIST_DIR, "products", "consumer-evidence-pack", "index.html"),
    "utf8"
  );
  assert.match(evidenceTool, /查看演示成品/);
  assert.match(evidenceTool, /虚构演示 · 不是真实订单/);
  assert.match(evidenceTool, /evidence-demo-opened/);
  assert.doesNotMatch(evidenceTool, /真实客户案例|投诉成功案例/);
  assert.match(
    fs.readFileSync(path.join(DIST_DIR, "products", "product-image-batch-studio", "index.html"), "utf8"),
    /一批原图，生成四个平台上架图/
  );
  assert.equal(result.matrix.readyCount, 2);
  assert.deepEqual(
    feed.products.map((product) => product.id),
    ["consumer-evidence-pack", "product-image-batch-studio"]
  );
  assert.match(sitemap, /\/products\/consumer-evidence-pack\//);
  assert.match(sitemap, /\/products\/product-image-batch-studio\//);
  assert.equal(feed.guides.length, 6);

  for (const guide of feed.guides) {
    const slug = guide.url.split("?")[0].split("/").filter(Boolean).at(-1);
    const html = fs.readFileSync(path.join(DIST_DIR, "guides", slug, "index.html"), "utf8");
    assert.match(home, new RegExp(`/guides/${slug}/`));
    assert.equal((html.match(/<li><a href="[^"]*\/guides\//g) || []).length, 5);
    assert.match(html, /用自己的材料免费整理/);
    assert.match(html, new RegExp(`campaign=guide-${slug}`));
    assert.match(html, /不构成法律意见/);
    assert.match(html, /不承诺投诉、退款、索赔或诉讼结果/);
    assert.doesNotMatch(html, /保证成功|包退款|必然胜诉/);
    assert.match(sitemap, new RegExp(`/guides/${slug}/`));
  }

  configurePublicBaseUrl("https://lifeyoume.icu/image", { source: "test" });
  const submittedUrls = indexNowUrls();
  assert.equal(submittedUrls.some((url) => url.includes("/products/consumer-evidence-pack/")), true);
  assert.equal(submittedUrls.filter((url) => url.includes("/guides/")).length, 6);
  assert.match(searchContentFingerprint("https://lifeyoume.icu/image/guides/12315-complaint-evidence-list/"), /^[a-f0-9]+$/);
});

test("campaign diagnosis follows real conversions and excludes self tests", () => {
  const product = {
    id: "consumer-evidence-pack", startEvent: "evidence-upload-started",
    resultEvent: "evidence-pack-completed", downloadEvent: "evidence-pack-downloaded",
  };
  const events = [
    { experimentId: product.id, type: "view", campaign: "guide-a", visitorId: "buyer" },
    { experimentId: product.id, channel: product.resultEvent, campaign: "guide-a", visitorId: "buyer" },
    { experimentId: product.id, type: "view", campaign: "guide-b", visitorId: "other" },
    { experimentId: product.id, type: "view", campaign: "test", trafficSource: "self-test", visitorId: "tester" },
    { experimentId: product.id, channel: product.resultEvent, campaign: "bot", userAgent: "HeadlessChrome" },
  ];
  const acquisition = productAcquisitionSnapshot(product, { events, checkouts: [], orders: [] });
  assert.equal(acquisition.bestCampaign, "guide-a");
  assert.equal(acquisition.campaigns.length, 2);
  assert.equal(acquisition.campaigns[0].stage, "value");
  assert.equal(acquisition.campaigns[1].stage, "upload");
  assert.equal(acquisition.campaigns[0].sampleEnough, false);
});

test("guide script sends attribution to the product API and preserves self-test isolation", async () => {
  configurePublicBaseUrl("https://lifeyoume.icu/image", { source: "test" });
  generateSite({ seed: 20261019, count: 2 });
  const html = fs.readFileSync(path.join(DIST_DIR, "guides", "12315-complaint-evidence-list", "index.html"), "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const calls = [];
  const link = { href: "https://lifeyoume.icu/image/products/consumer-evidence-pack/?source=search&campaign=guide-12315-complaint-evidence-list" };
  vm.runInNewContext(script, {
    localStorage: { getItem: () => "known-visitor", setItem: () => {} },
    crypto: { randomUUID: () => "new-visitor" },
    location: { search: "?source=self-test", href: "https://lifeyoume.icu/image/guides/12315-complaint-evidence-list/?source=self-test" },
    document: { querySelector: () => link },
    URL, URLSearchParams, Blob,
    navigator: { sendBeacon: (endpoint) => { calls.push({ endpoint, beacon: true }); return false; } },
    fetch: (endpoint, options) => { calls.push({ endpoint, options }); return Promise.resolve(); },
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.endpoint === "https://lifeyoume.icu/image/api/events"));
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.visitorId, "known-visitor");
  assert.equal(payload.campaign, "guide-12315-complaint-evidence-list");
  assert.equal(payload.trafficSource, "self-test");
  assert.equal(new URL(link.href).searchParams.get("source"), "self-test");
  assert.equal(calls[1].options.keepalive, true);
});
