const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const {
  DIST_DIR,
  PRIVATE_DELIVERY_DIR,
  PRIVATE_FULFILLMENT_DIR,
  PUBLIC_SITE_DIR,
  aggregateMetrics,
  acquisitionFunnelSnapshot,
  promotionCenterSnapshot,
  markPromotionPackagePublished,
  appendEvent,
  buildLab,
  buildAdapterReadinessPlan,
  buildPublishQueue,
  buildStrategy,
  buildTrafficPlan,
  bootstrapLocalLoop,
  buildExecutionQueue,
  checkAdapterHealth,
  checkPublicBaseReachable,
  configureAdaptersFromEnv,
  configurePublicBaseUrl,
  claimPublishTasks,
  consumeResultInboxes,
  createCheckout,
  processLeadToolResult,
  processSampleLead,
  processSalesAssistantMessage,
  checkoutStatus,
  checkoutStatusHtml,
  checkoutRecoveryHtml,
  submitCheckoutPaymentProof,
  deliverPrepared,
  deployStaticSite,
  executeActionPlan,
  exportLocalPublishDrafts,
  generateAdaptiveHypotheses,
  generateHypotheses,
  generateSite,
  deliveryMarkdown,
  starterDeliveryMarkdown,
  publicInstantCheckoutUrl,
  publicUtilityIntentUrl,
  loadAdapters,
  loadActionExecutionHistory,
  loadEvents,
  loadOrders,
  loadVariantOptimizations,
  loadDeliveryTokens,
  loadCheckouts,
  loadWorkerHistory,
  knownExperiments,
  loadOutbox,
  loadRecoveryOutbox,
  loadOpportunitySignals,
  loadPublishQueue,
  loadPublicAccessMonitor,
  loadTrafficPlan,
  loadExecutionQueue,
  loadExecutionQueueHistory,
  loadLastExecutionQueueRun,
  loadLocalLoopWatcher,
  loadServiceHealth,
  loadAutonomousSupervisor,
  loadLastAutonomousSupervisorRun,
  loadAutonomousSupervisorHistory,
  normalizeWechatPaymentNotification,
  validateAuthoritativePaymentNotification,
  prepareDeliveryOutbox,
  publishGrowthOutboxToOwnedSite,
  publishQueuedTasks,
  publishStaticSite,
  recordPublishResult,
  receivePaymentNotification,
  recordOrder,
  recordAutonomousSupervisorState,
  redeemDeliveryToken,
  readDeliveryContent,
  runAutopilot,
  runAutonomousCycle,
  runAutonomousSupervisorOnce,
  runExecutionQueue,
  runExecutionQueueTask,
  runLocalLoopOnce,
  runPublishAgentOnce,
  runPublicAccessMonitorOnce,
  resolveBundledNpxCommand,
  publicTunnelProviders,
  nextPublicTunnelProvider,
  ensureCheckoutService,
  runWorkerOnce,
  runStorefrontCommerceCycle,
  saveAdapters,
  scanOpportunitySources,
  scoreExperiment,
  starterOfferPrice,
  submitSearchIndex,
  startLocalLoopWatcher,
  shouldSupervisorExpandTraffic,
  syncPaymentFeed,
  systemStatus,
  buildActionPlan,
  loadActionPlan,
  utilityIntentPagesFor,
  startAutonomousPublicTunnel,
} = require("../src/engine");
const {
  handler,
  staticSiteRoot,
  assertRuntimeSecurity,
  adminApiAuthorized,
  assertAdminApiAllowed,
  buyerCheckoutView,
  clientAddress,
  consumePublicRateLimit,
  shouldStopPublicTunnelOnShutdown,
} = require("../src/server");
const { handler: mockAdapterHandler, resetCalls: resetMockAdapterCalls } = require("../src/mock-adapter");
const { buildPublicFront } = require("../scripts/build-public-front");
const {
  verifyPublicFront,
  copyAllowedPublicFront,
  updatePaymentService,
} = require("../scripts/public-front-release");

const dataDir = path.join(__dirname, "..", "data");

function snapshotData() {
  fs.mkdirSync(dataDir, { recursive: true });
  const files = [
    "adapters.json",
    "admin-push-subscriptions.json",
    "checkouts.json",
    "delivery-tokens.json",
    "events.json",
    "indexnow.json",
    "last-deploy.json",
    "last-search-submit.json",
    "last-publish-agent.json",
    "adapter-health.json",
    "adapter-configure-from-env.json",
    "adapter-readiness.json",
    "opportunity-signals.json",
    "traffic-plan.json",
    "execution-queue.json",
    "last-execution-queue-run.json",
    "last-autonomous-supervisor-run.json",
    "execution-queue-history.json",
    "autonomous-supervisor.json",
    "autonomous-supervisor-history.json",
    "local-loop-bootstrap.json",
    "last-result-sync.json",
    "last-local-loop-run.json",
    "local-loop-watcher.json",
    "service-health.json",
    "last-handoff-reconcile.json",
    "last-owned-site-publisher.json",
    "public-access.json",
    "public-access-monitor.json",
    "storefront-commerce-cycle.json",
    "last-run.json",
    "last-worker.json",
    "orders.json",
    "owner-action-tasks.json",
    "outbox.json",
    "recovery-outbox.json",
    "publish.json",
    "publish-queue.json",
    "promotion-program.json",
    "strategy.json",
    "action-plan.json",
    "last-action-execution.json",
    "action-execution-history.json",
    "last-cycle.json",
    "search-submissions.json",
    "search-submit-outbox.json",
    "worker-history.json",
    "product-catalog.json",
    "variant-optimizations.json",
    "traffic-expansion.json",
  ];
  const snapshot = {};
  for (const file of files) {
    const full = path.join(dataDir, file);
    snapshot[file] = fs.existsSync(full) ? fs.readFileSync(full) : null;
    if (file === "adapters.json") {
      fs.writeFileSync(full, JSON.stringify({ publicBaseUrl: "", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} }));
    } else if (file === "opportunity-signals.json") {
      fs.writeFileSync(full, JSON.stringify({ at: null, status: "not-run", sources: [], signals: [] }));
    } else if (file === "execution-queue.json") {
      fs.writeFileSync(full, JSON.stringify({ at: null, tasks: [] }));
    } else if (file === "last-execution-queue-run.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "last-autonomous-supervisor-run.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "autonomous-supervisor.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "local-loop-bootstrap.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "last-result-sync.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "last-local-loop-run.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "local-loop-watcher.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "service-health.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "last-handoff-reconcile.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "last-owned-site-publisher.json") {
      fs.writeFileSync(full, "null");
    } else if (file === "public-access.json" || file === "public-access-monitor.json") {
      fs.writeFileSync(full, "null");
    } else {
      fs.writeFileSync(full, "[]");
    }
  }
  return () => {
    for (const [file, content] of Object.entries(snapshot)) {
      const full = path.join(dataDir, file);
      if (content === null) fs.rmSync(full, { force: true });
      else fs.writeFileSync(full, content);
    }
  };
}

function webhookServer() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      calls.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, calls, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function request(server, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: pathname,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks), headers: response.headers }));
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function headRequest(server, pathname, headers = {}) {
  return request(server, pathname, { method: "HEAD", headers });
}

async function waitUntil(predicate, { timeoutMs = 2000, intervalMs = 25 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
}

test("generates multiple money experiments with unique offer and delivery assets", () => {
  const result = generateSite({ seed: 20261010, count: 8 });
  assert.equal(result.lab.length, 8);
  assert.equal(new Set(result.lab.map((item) => item.id)).size, 8);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "index.html")), true);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "feed.json")), true);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "rss.xml")), true);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "sitemap.xml")), true);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "robots.txt")), true);
  const indexNow = JSON.parse(fs.readFileSync(path.join(dataDir, "indexnow.json"), "utf8"));
  assert.equal(fs.existsSync(path.join(DIST_DIR, `${indexNow.key}.txt`)), true);
  const feed = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "feed.json"), "utf8"));
  assert.equal(feed.products.length, 8);
  assert.match(feed.todayDeals.url, /\/deals\/today\.html/);
  assert.equal(feed.todayDeals.products.length, 8);
  assert.match(feed.todayDeals.products[0].buyNowUrl, /\/buy-now\/.+\.html/);
  assert.match(feed.todayDeals.products[0].starterOfferUrl, /\/starter\/.+\.html/);
  assert.match(feed.todayDeals.products[0].rescueOfferUrl, /\/rescue\/.+\.html/);
  assert.equal(feed.todayDeals.products[0].starterPrice < feed.todayDeals.products[0].price, true);
  assert.equal(feed.ownedPromotionPages.length, 24);
  assert.equal(feed.hubPages.length >= 6, true);
  assert.equal(feed.hubPages.some((item) => item.kind === "market" && item.url.includes("/markets/")), true);
  assert.equal(feed.hubPages.some((item) => item.kind === "offer-type" && item.url.includes("/offer-types/")), true);
  assert.equal(feed.products[0].promos.some((item) => item.trackingUrl), true);
  assert.equal(feed.products[0].acquisitionPages.length, 2);
  assert.match(feed.products[0].acquisitionPages[0].url, /\/seo\//);
  assert.equal(feed.products[0].acquisitionPages.some((item) => item.intent === "tonight-delivery"), true);
  assert.equal(feed.products[0].acquisitionPages.some((item) => item.intent === "cheap-alternative"), true);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), new RegExp(`/seo/${feed.products[0].id}-examples\\.html`));
  assert.match(feed.products[0].leadToolUrl, /\/tools\/.+\.html/);
  assert.match(feed.products[0].buyNowUrl, /\/buy-now\/.+\.html/);
  assert.match(feed.products[0].starterOfferUrl, /\/starter\/.+\.html/);
  assert.match(feed.products[0].rescueOfferUrl, /\/rescue\/.+\.html/);
  assert.match(feed.products[0].sampleUrl, /\/samples\/.+\.html/);
  assert.equal(typeof feed.products[0].whyBuy, "string");
  assert.equal(feed.products[0].whyBuy.length > 0, true);
  assert.equal(feed.products[0].starterPrice < feed.products[0].price, true);
  assert.match(feed.products[0].salesAssistantUrl, /\/sales\/.+\.html/);
  assert.equal(feed.products[0].objectionPages.length, 2);
  assert.equal(feed.products[0].objectionPages.some((item) => item.intent === "price-objection"), true);
  assert.match(feed.products[0].objectionPages[0].url, /\/objections\/.+\.html/);
  assert.equal(feed.products[0].questionPages.length, 2);
  assert.equal(feed.products[0].questionPages.some((item) => item.intent === "payment-steps"), true);
  assert.match(feed.products[0].questionPages[0].url, /\/questions\/.+\.html/);
  assert.equal(feed.products[0].purchaseIntentPages.length, 2);
  assert.equal(feed.products[0].purchaseIntentPages.some((item) => item.intent === "starter-first"), true);
  assert.match(feed.products[0].purchaseIntentPages[0].url, /\/intent\/.+\.html/);
  assert.equal(feed.products[0].demandCapturePages.length, 2);
  assert.equal(feed.products[0].demandCapturePages.some((item) => item.intent === "wechat-remark"), true);
  assert.match(feed.products[0].demandCapturePages[0].url, /\/demand\/.+\.html/);
  assert.equal(feed.products[0].utilityIntentPages.length, 2);
  assert.equal(feed.products[0].utilityIntentPages.some((item) => item.intent === "fit-calculator"), true);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), new RegExp(`/utilities/${feed.products[0].id}-starter-builder\\.html`));
  assert.match(feed.products[0].utilityIntentPages[0].url, /\/utilities\/.+\.html/);
  assert.equal(feed.products[0].offerVariants.length, 3);
  assert.equal(feed.products[0].winningVariant.id, "direct");
  assert.match(feed.products[0].offerVariants[0].url, /\/offer\/.+--direct\.html/);
  const storefront = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
  const admin = fs.readFileSync(path.join(DIST_DIR, "admin", "index.html"), "utf8");
  assert.match(storefront, /项目经历还是流水账/);
  assert.match(storefront, /立即购买，生成付款备注/);
  assert.doesNotMatch(storefront, /成交角度自动学习|实验排行榜|机器生成清单/);
  assert.match(admin, /手机收款确认/);
  assert.match(admin, /管理密码/);
  const resumeChecklist = result.lab.find(
    (item) => item.marketId === "jobseekers" && item.offerTypeId === "checklist"
  );
  const resumeDelivery = fs.readFileSync(path.join(dataDir, "delivery", `${resumeChecklist.id}.md`), "utf8");
  assert.match(resumeDelivery, /三种可直接套用的表达/);
  assert.match(resumeDelivery, /没有量化结果时怎么写/);
  assert.doesNotMatch(resumeDelivery, /发出 1 条信任型文案|每条都带唯一购买备注/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /<rss version="2.0">/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /deals-today/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /buy-now-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /starter-offer-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /rescue-offer-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /sales-assistant-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /sample-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /objection-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /question-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /intent-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /demand-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /utility-/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /自测工具/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), /hub-market|hub-offer-type/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /<urlset/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/deals\/today\.html/);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/buy-now\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/starter\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/rescue\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/sales\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/samples\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/objections\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/questions\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/intent\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/demand\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/utilities\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/tools\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/markets\//);
  assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), /\/offer-types\//);
  const promotionHtmlText = fs.readFileSync(path.join(DIST_DIR, "promotions", "wechat-moments", `${result.lab[0].id}.html`), "utf8");
  assert.match(promotionHtmlText, /data-direct-create-checkout/);
  assert.match(promotionHtmlText, /direct-checkout-session:promotion:wechat-moments/);
  assert.match(promotionHtmlText, /\/api\/checkouts/);
  assert.match(promotionHtmlText, /data-direct-payment-remark/);
  assert.doesNotMatch(promotionHtmlText, /data-engagement-autostart/);
  assert.doesNotMatch(promotionHtmlText, /startEngagedCheckout/);
  assert.doesNotMatch(promotionHtmlText, /setTimeout\(\(\) => ensureDirectCheckout/);
  for (const experiment of result.lab) {
    assert.equal(fs.existsSync(path.join(DIST_DIR, "offer", `${experiment.id}.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "buy-now", `${experiment.id}.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "demand", `${experiment.id}-wechat-remark.html`)), true);
    const demandHtmlText = fs.readFileSync(path.join(DIST_DIR, "demand", `${experiment.id}-wechat-remark.html`), "utf8");
    assert.match(demandHtmlText, /需求捕获页/);
    assert.match(demandHtmlText, /生成入门版付款备注/);
    assert.match(demandHtmlText, /#STARTER/);
    assert.match(demandHtmlText, /data-static-payment-fallback/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "utilities", `${experiment.id}-fit-calculator.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "utilities", `${experiment.id}-starter-builder.html`)), true);
    const utilityHtmlText = fs.readFileSync(path.join(DIST_DIR, "utilities", `${experiment.id}-fit-calculator.html`), "utf8");
    assert.match(utilityHtmlText, /程序化免费工具/);
    assert.match(utilityHtmlText, /utility-intent-form/);
    assert.match(utilityHtmlText, /\/api\/sample-lead/);
    assert.match(utilityHtmlText, /utility-intent-session:/);
    assert.match(utilityHtmlText, /当前意图不足，程序只给免费判断，不创建 checkout/);
    assert.doesNotMatch(utilityHtmlText, /setTimeout\(\(\) =>/);
    const buyNowHtmlText = fs.readFileSync(path.join(DIST_DIR, "buy-now", `${experiment.id}.html`), "utf8");
    assert.match(buyNowHtmlText, /直购成交页/);
    assert.match(buyNowHtmlText, /\/buy\//);
    assert.match(buyNowHtmlText, /source=buy-now/);
    assert.match(buyNowHtmlText, /先买低价入门包/);
    assert.match(buyNowHtmlText, /微信收款二维码/);
    assert.doesNotMatch(buyNowHtmlText, /data-engagement-autostart/);
    assert.doesNotMatch(buyNowHtmlText, /startEngagedCheckout/);
    assert.match(buyNowHtmlText, /buy-now:click/);
    assert.doesNotMatch(buyNowHtmlText, /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.match(buyNowHtmlText, /data-static-payment-fallback/);
    assert.match(buyNowHtmlText, /无 JS 也能付款/);
    assert.match(buyNowHtmlText, /付款备注填/);
    assert.match(buyNowHtmlText, new RegExp(experiment.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const offerFallbackHtmlText = fs.readFileSync(path.join(DIST_DIR, "offer", `${experiment.id}.html`), "utf8");
    assert.match(offerFallbackHtmlText, /确认适合后，再进入订单页付款/);
    assert.match(offerFallbackHtmlText, /一页简历成品缩略示例/);
    assert.doesNotMatch(offerFallbackHtmlText, /商品级兜底收款|data-static-payment-fallback|粘贴到这里|通用备注|付款备注填/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "starter", `${experiment.id}.html`)), true);
    const starterHtmlText = fs.readFileSync(path.join(DIST_DIR, "starter", `${experiment.id}.html`), "utf8");
    assert.match(starterHtmlText, /低价入门成交页/);
    assert.match(starterHtmlText, /offer=starter/);
    assert.match(starterHtmlText, /购买入门版并生成唯一付款备注/);
    assert.match(starterHtmlText, /starter-offer:click/);
    assert.doesNotMatch(starterHtmlText, /data-engagement-autostart/);
    assert.doesNotMatch(starterHtmlText, /startEngagedCheckout/);
    assert.match(starterHtmlText, /const directOffer = "starter"/);
    assert.match(starterHtmlText, /const directAmount = [0-9]+/);
    assert.match(starterHtmlText, /offer: directOffer/);
    assert.match(starterHtmlText, /amount: directAmount/);
    assert.doesNotMatch(starterHtmlText, /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.match(starterHtmlText, /data-static-payment-fallback/);
    assert.match(starterHtmlText, /入门版兜底收款/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "rescue", `${experiment.id}.html`)), true);
    const rescueHtmlText = fs.readFileSync(path.join(DIST_DIR, "rescue", `${experiment.id}.html`), "utf8");
    assert.match(rescueHtmlText, /自动挽回成交页/);
    assert.match(rescueHtmlText, /rescue-offer%3Astarter/);
    assert.match(rescueHtmlText, /offer=starter/);
    assert.match(rescueHtmlText, /rescue-offer:click/);
    assert.doesNotMatch(rescueHtmlText, /data-engagement-autostart/);
    assert.doesNotMatch(rescueHtmlText, /startEngagedCheckout/);
    assert.doesNotMatch(rescueHtmlText, /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.match(rescueHtmlText, /挽回页兜底收款/);
    assert.match(rescueHtmlText, /data-static-payment-fallback/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "sales", `${experiment.id}.html`)), true);
    const salesHtmlText = fs.readFileSync(path.join(DIST_DIR, "sales", `${experiment.id}.html`), "utf8");
    assert.match(salesHtmlText, /自动销售助手/);
    assert.match(salesHtmlText, /\/api\/sales-assistant\/message/);
    assert.match(salesHtmlText, /sales-assistant-session:/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "objections", `${experiment.id}-price-objection.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "objections", `${experiment.id}-fit-objection.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "objections", `${experiment.id}-delivery-objection.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "objections", `${experiment.id}-risk-objection.html`)), true);
    const objectionHtmlText = fs.readFileSync(path.join(DIST_DIR, "objections", `${experiment.id}-price-objection.html`), "utf8");
    assert.match(objectionHtmlText, /自动异议处理/);
    assert.match(objectionHtmlText, /\/sales\//);
    assert.match(objectionHtmlText, /\/buy\//);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "questions", `${experiment.id}-instant-delivery.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "questions", `${experiment.id}-included-files.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "questions", `${experiment.id}-buyer-fit.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "questions", `${experiment.id}-payment-steps.html`)), true);
    const questionHtmlText = fs.readFileSync(path.join(DIST_DIR, "questions", `${experiment.id}-payment-steps.html`), "utf8");
    assert.match(questionHtmlText, /自动买家问答/);
    assert.match(questionHtmlText, /FAQPage/);
    assert.match(questionHtmlText, /\/sales\//);
    assert.match(questionHtmlText, /\/buy\//);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "intent", `${experiment.id}-starter-first.html`)), true);
    const intentHtmlText = fs.readFileSync(path.join(DIST_DIR, "intent", `${experiment.id}-starter-first.html`), "utf8");
    assert.match(intentHtmlText, /强购买意图入口/);
    assert.match(intentHtmlText, /offer=starter/);
    assert.match(intentHtmlText, /intent%3Astarter-first%3Astarter/);
    assert.match(intentHtmlText, /自动成交/);
    const offerHtmlText = fs.readFileSync(path.join(DIST_DIR, "offer", `${experiment.id}.html`), "utf8");
    assert.match(offerHtmlText, /application\/ld\+json/);
    assert.match(offerHtmlText, /https:\/\/schema\.org/);
    assert.match(offerHtmlText, /"@type":"Product"/);
    assert.match(offerHtmlText, /property="og:type" content="product"/);
    assert.match(offerHtmlText, /product:price:amount/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "tools", `${experiment.id}.html`)), true);
    assert.match(fs.readFileSync(path.join(DIST_DIR, "tools", `${experiment.id}.html`), "utf8"), /lead-tool-result/);
    assert.match(fs.readFileSync(path.join(DIST_DIR, "tools", `${experiment.id}.html`), "utf8"), /生成诊断结果/);
    assert.match(fs.readFileSync(path.join(DIST_DIR, "tools", `${experiment.id}.html`), "utf8"), /免费样例/);
    assert.match(fs.readFileSync(path.join(DIST_DIR, "tools", `${experiment.id}.html`), "utf8"), /\/api\/sample-lead/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "samples", `${experiment.id}.html`)), true);
    const sampleHtmlText = fs.readFileSync(path.join(DIST_DIR, "samples", `${experiment.id}.html`), "utf8");
    assert.match(sampleHtmlText, /自动免费样例/);
    assert.match(sampleHtmlText, /程序自动生成的免费样例/);
    assert.match(sampleHtmlText, /sample-page:click/);
    assert.match(sampleHtmlText, /data-static-payment-fallback/);
    assert.doesNotMatch(sampleHtmlText, /data-engagement-autostart/);
    assert.doesNotMatch(sampleHtmlText, /startEngagedCheckout/);
    assert.doesNotMatch(sampleHtmlText, /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "sample-close", `${experiment.id}.html`)), true);
    const sampleCloseHtmlText = fs.readFileSync(path.join(DIST_DIR, "sample-close", `${experiment.id}.html`), "utf8");
    assert.match(sampleCloseHtmlText, /样例后成交页/);
    assert.match(sampleCloseHtmlText, /sample-close%3Astarter/);
    assert.match(sampleCloseHtmlText, /sample-close:click/);
    assert.doesNotMatch(sampleCloseHtmlText, /data-engagement-autostart/);
    assert.doesNotMatch(sampleCloseHtmlText, /startEngagedCheckout/);
    assert.doesNotMatch(sampleCloseHtmlText, /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.match(sampleCloseHtmlText, /样例后成交页兜底收款/);
    assert.match(sampleCloseHtmlText, /data-static-payment-fallback/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "delivery-preview", `${experiment.id}.md`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-pain-solution.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-delivery-checklist.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-compare-diy.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-tonight-delivery.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-cheap-alternative.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-examples.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-mistakes.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "seo", `${experiment.id}-who-should-buy.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "markets", `${experiment.marketId}.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "offer-types", `${experiment.offerTypeId}.html`)), true);
    const marketHubHtml = fs.readFileSync(path.join(DIST_DIR, "markets", `${experiment.marketId}.html`), "utf8");
    assert.match(marketHubHtml, /data-hub-create-checkout/);
    assert.match(marketHubHtml, /hub-checkout-session:/);
    assert.match(marketHubHtml, /source: 'hub-page:/);
    assert.match(marketHubHtml, /\/api\/checkouts/);
    assert.match(marketHubHtml, /data-hub-payment-remark/);
    const seoHtmlText = fs.readFileSync(path.join(DIST_DIR, "seo", `${experiment.id}-tonight-delivery.html`), "utf8");
    assert.match(seoHtmlText, /application\/ld\+json/);
    assert.match(seoHtmlText, /property="og:type" content="article"/);
    assert.match(seoHtmlText, /"priceCurrency":"CNY"/);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "promotions", "wechat-moments", `${experiment.id}.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "promotions", "xhs-note", `${experiment.id}.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "promotions", "zhihu-answer", `${experiment.id}.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "delivery", `${experiment.id}.md`)), false);
    assert.equal(fs.existsSync(path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}.md`)), true);
    assert.equal(fs.existsSync(path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}--starter.md`)), true);
    assert.match(fs.readFileSync(path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}--starter.md`), "utf8"), /入门版/);
    assert.equal(experiment.promos.length >= 4, true);
  }
});

test("public storefront stays curated while the private lab keeps all experiments", () => {
  const result = generateSite({ seed: 20261012, count: 8 });
  const storefront = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
  const imageStudio = fs.readFileSync(path.join(DIST_DIR, "products", "product-image-batch-studio", "index.html"), "utf8");
  const sitemap = fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "manifest.json"), "utf8"));
  const htmlFiles = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) htmlFiles.push(file);
    }
  };
  walk(DIST_DIR);

  assert.equal(result.lab.length, 8);
  assert.equal(manifest.experiments.length, 8);
  assert.equal(result.product.id, "product-image-batch-studio");
  assert.equal(result.legacyCommerceProduct.marketId, "jobseekers");
  assert.equal(result.legacyCommerceProduct.offerTypeId, "checklist");
  assert.equal(htmlFiles.length <= 28, true);
  assert.equal((sitemap.match(/<url>/g) || []).length <= 16, true);
  assert.match(storefront, /商品图批量成品机/);
  assert.match(storefront, /把麻烦事/);
  assert.match(storefront, /消费维权证据包生成器/);
  assert.match(imageStudio, /data-file-input/);
  assert.match(imageStudio, /生成四平台整批预览/);
  assert.match(imageStudio, /¥6\.90 微信购买高清 ZIP/);
  assert.match(imageStudio, /下载已购高清 ZIP/);
  assert.match(imageStudio, /fflate\.zipSync/);
  assert.match(imageStudio, /图片不会上传到服务器/);
  assert.match(imageStudio, /data-support hidden/);
  assert.match(imageStudio, /src="\/wechat-pay\.jpg"/);
  assert.match(imageStudio, /image-batch-completed/);
  assert.match(imageStudio, /apiUrl\('\/api\/checkouts'\)/);
  assert.match(imageStudio, /payload\.checkout\.status === 'paid'/);
  assert.doesNotMatch(storefront, /机器生成清单|最高分实验/);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "utilities")), false);
  assert.equal(htmlFiles.length, 28);
  assert.equal(fs.existsSync(path.join(DIST_DIR, "fflate.js")), true);
  assert.equal((sitemap.match(/<url>/g) || []).length, 16);
  assert.match(sitemap, /<loc>[^<]+\/<\/loc>/);
  const presetExpectations = {
    "white-main-image.html": "white-main",
    "portrait-product-image.html": "portrait-product",
    "social-product-card.html": "social-card",
    "taobao-main-image.html": "taobao-main",
    "pdd-main-image.html": "pdd-main",
    "xiaohongshu-product-image.html": "xhs-product",
    "douyin-product-image.html": "douyin-product",
  };
  for (const [file, preset] of Object.entries(presetExpectations)) {
    const presetHtml = fs.readFileSync(path.join(DIST_DIR, "presets", file), "utf8");
    assert.match(presetHtml, new RegExp(`data-default-preset="${preset}"`));
    assert.match(presetHtml, /fflate\.zipSync/);
    assert.match(sitemap, new RegExp(`/presets/${file.replace(".", "\\.")}`));
  }
  assert.doesNotMatch(sitemap, /feed\.json|rss\.xml|delivery-preview/);
  assert.equal((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, 16);
  const trafficPlan = buildTrafficPlan({ lab: [result.product] });
  const queue = buildExecutionQueue({
    actionPlan: buildActionPlan({ publishQueue: result.publishQueue }),
    trafficPlan,
    publishQueue: result.publishQueue,
  });
  assert.equal(trafficPlan.channelStates["wechat-moments"].status, "blocked");
  assert.equal(trafficPlan.channelStates["xhs-note"].status, "blocked");
  assert.equal(trafficPlan.channelStates["zhihu-answer"].status, "blocked");
  assert.equal(queue.tasks.some((task) => task.action === "claim-publish"), false);
  assert.equal(
    queue.tasks.filter((task) => task.action === "publish-task").every((task) => task.status === "blocked"),
    true
  );
});

test("delivery assets are concrete for each offer type", () => {
  const hypotheses = generateHypotheses({ seed: 20261010, count: 16 });
  const template = deliveryMarkdown(hypotheses.find((item) => item.offerTypeId === "template-pack"));
  const prompt = deliveryMarkdown(hypotheses.find((item) => item.offerTypeId === "prompt-system"));
  const tool = deliveryMarkdown(hypotheses.find((item) => item.offerTypeId === "micro-tool"));
  const checklist = deliveryMarkdown(hypotheses.find((item) => item.offerTypeId === "checklist"));

  assert.match(template, /## 可复制模板包/);
  assert.match(template, /模板 1：问题诊断卡/);
  assert.match(prompt, /## AI 提示词系统/);
  assert.match(prompt, /角色提示词/);
  assert.match(tool, /## 单文件 HTML 小工具/);
  assert.match(tool, /~~~html/);
  assert.match(checklist, /## 24 小时执行清单/);
  assert.match(checklist, /次日判断/);
});

test("starter delivery is a bounded entry product with a full-package upsell", () => {
  const experiment = generateHypotheses({ seed: 20261010, count: 1 })[0];
  const starter = starterDeliveryMarkdown(experiment);
  assert.match(starter, /入门版包含/);
  assert.match(starter, /不是完整包/);
  assert.match(starter, /starter-delivery-upsell/);
  assert.match(starter, new RegExp(`/buy/${experiment.id}/proof`));
});

test("scores experiments from views, clicks and paid orders", () => {
  assert.equal(scoreExperiment({ views: 150, clicks: 1, paid: 0, revenue: 0 }).decision, "kill");
  assert.equal(scoreExperiment({ views: 50, clicks: 11, paid: 0, revenue: 0 }).decision, "rewrite-offer");
  assert.equal(scoreExperiment({ views: 20, clicks: 2, paid: 1, revenue: 19 }).decision, "double-down");

  const experiments = generateHypotheses({ seed: 20261010, count: 1 });
  const metrics = aggregateMetrics(
    experiments,
    [
      { type: "view", experimentId: experiments[0].id },
      { type: "click", experimentId: experiments[0].id },
      { type: "lead-tool-result", experimentId: experiments[0].id },
      { type: "sample-lead", experimentId: experiments[0].id },
      { type: "sales-assistant-message", experimentId: experiments[0].id },
    ],
    [{ experimentId: experiments[0].id, amount: 19, status: "paid" }]
  );
  assert.deepEqual(metrics[experiments[0].id], { views: 1, clicks: 1, leads: 3, paid: 1, delivered: 0, revenue: 19, pendingDelivery: 1 });
});

test("strategy promotes combinations that have real payment evidence", () => {
  const restore = snapshotData();
  try {
    recordOrder({ experimentId: "office-workers-micro-tool-20261010-old", amount: 39, payerNote: "paid" });
    const strategy = buildStrategy({ seed: 20261010, count: 4 });
    const adaptive = generateAdaptiveHypotheses({ seed: 20261010, count: 4, strategy });
    assert.equal(strategy.hasEvidence, true);
    assert.equal(strategy.promotedCombos[0].marketId, "office-workers");
    assert.equal(strategy.promotedCombos[0].offerTypeId, "micro-tool");
    assert.equal(strategy.pricingRules.find((item) => item.key === "office-workers::micro-tool").price > 39, true);
    assert.equal(adaptive[0].marketId, "office-workers");
    assert.equal(adaptive[0].offerTypeId, "micro-tool");
    assert.equal(adaptive[0].price > 39, true);
    assert.match(adaptive[0].pricingReason, /付款证据/);
  } finally {
    restore();
  }
});

test("strategy prices opportunity experiments from real buyer-intent evidence", () => {
  const restore = snapshotData();
  try {
    for (let index = 0; index < 4; index += 1) {
      appendEvent({ type: "click", experimentId: `opportunity-jobseekers-prompt-system-signal-20261010-${index}`, channel: "direct-checkout:promotion:wechat-moments" });
    }
    for (let index = 0; index < 3; index += 1) {
      appendEvent({ type: "lead-tool-result", experimentId: `opportunity-jobseekers-prompt-system-signal-20261010-${index}`, channel: "lead-tool", score: 5 });
    }
    const strategy = buildStrategy({ seed: 20261010, count: 4 });
    const rule = strategy.pricingRules.find((item) => item.key === "jobseekers::prompt-system");
    assert.equal(rule.price < rule.basePrice, true);
    assert.equal(rule.multiplier, 0.65);
    assert.match(rule.reason, /购买意图/);

    const adaptive = generateAdaptiveHypotheses({ seed: 20261010, count: 4, strategy });
    const repriced = adaptive.find((item) => item.marketId === "jobseekers" && item.offerTypeId === "prompt-system");
    assert.equal(Boolean(repriced), true);
    assert.equal(repriced.price, rule.price);
    assert.match(repriced.pricingReason, /购买意图/);
  } finally {
    restore();
  }
});

test("action plan turns evidence and queues into machine actions", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    buildPublishQueue(result.lab);
    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    assert.equal(plan.actions.some((item) => item.type === "double-down"), true);
    assert.equal(plan.actions.some((item) => item.type === "fix-adapter-publish"), true);
    assert.equal(loadActionPlan().actions.length > 0, true);
  } finally {
    restore();
  }
});

test("action plan gates external money loop on adapter readiness", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    createCheckout({ experimentId: experiment.id });
    recordOrder({ experimentId: experiment.id, amount: experiment.price, payerNote: "paid" });

    const missingPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    assert.equal(missingPlan.actions.some((item) => item.type === "fix-adapter-publish"), true);
    assert.equal(missingPlan.actions.some((item) => item.type === "fix-adapter-payment"), true);
    assert.equal(missingPlan.actions.some((item) => item.type === "fix-adapter-fulfillment"), true);
    assert.equal(missingPlan.actions.some((item) => item.type === "open-public-tunnel"), true);
    assert.equal(missingPlan.actions.find((item) => item.type === "open-public-tunnel").command.includes("public-tunnel"), true);

    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [{ id: "growth-router", channels: ["*"], webhookUrl: `${baseUrl}/growth/router` }],
      fulfillment: { webhookUrl: `${baseUrl}/fulfillment` },
      payments: { feedUrl: `${baseUrl}/payments` },
      deploy: { webhookUrl: `${baseUrl}/deploy` },
    });
    await checkAdapterHealth();
    const healthyPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    assert.equal(healthyPlan.actions.some((item) => item.type.startsWith("fix-adapter-")), false);

    await new Promise((resolve) => mockServer.close(resolve));
    await checkAdapterHealth();
    const blockedPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    assert.equal(blockedPlan.actions.some((item) => item.type === "fix-adapter-publish"), true);
    assert.equal(blockedPlan.actions.some((item) => item.type === "fix-adapter-payment"), true);

    const execution = await executeActionPlan({ dryRun: true });
    assert.equal(execution.results.some((item) => item.action === "fix-adapter-publish" && item.status === "blocked"), true);
  } finally {
    if (mockServer.listening) await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("action plan executor runs local actions and flags external publishing", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    createCheckout({ experimentId: result.lab[0].id });
    const execution = await executeActionPlan({ dryRun: true });
    assert.equal(execution.results.some((item) => item.action === "fix-adapter-payment" && item.status === "blocked"), true);
    assert.equal(execution.results.some((item) => item.action === "fix-adapter-publish" && item.status === "blocked"), true);
    assert.equal(loadActionExecutionHistory().some((item) => item.id === execution.id), true);
  } finally {
    restore();
  }
});

test("action plan optimizes winning offer variants into machine-readable state", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof" });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "proof" });
    const checkout = createCheckout({ experimentId: experiment.id, variantId: "proof" });
    receivePaymentNotification({
      transactionId: "variant_optimizer_tx_001",
      remark: checkout.paymentRemark,
      amount: checkout.amount,
    });

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const action = plan.actions.find((item) => item.type === "optimize-offer-variant");
    assert.equal(action.variantId, "proof");
    assert.match(action.variantUrl, /--proof\.html/);

    const execution = await executeActionPlan({ dryRun: true });
    assert.equal(execution.results.some((item) => item.action === "optimize-offer-variant" && item.status === "executed" && item.variantId === "proof"), true);
    const optimizations = loadVariantOptimizations();
    assert.equal(optimizations.length, 1);
    assert.equal(optimizations[0].experimentId, experiment.id);
    assert.equal(optimizations[0].variantId, "proof");
    assert.match(optimizations[0].recommendedPublishUrl, /--proof\.html/);
    assert.equal(systemStatus().variantOptimizations[0].variantId, "proof");
  } finally {
    restore();
  }
});

test("action plan recovers stale unpaid checkouts by switching to trust-focused offer", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: { feedFile: path.join(dataDir, "empty-payment-feed.json") }, opportunitySources: [], publishAgent: {} });
    fs.writeFileSync(path.join(dataDir, "empty-payment-feed.json"), "[]");
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    const experiment = result.lab[0];
    const checkout = createCheckout({ experimentId: experiment.id, variantId: "pain" });
    const checkoutsFile = path.join(dataDir, "checkouts.json");
    const checkouts = JSON.parse(fs.readFileSync(checkoutsFile, "utf8"));
    checkouts[0].createdAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    fs.writeFileSync(checkoutsFile, JSON.stringify(checkouts, null, 2));

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const action = plan.actions.find((item) => item.type === "recover-unpaid-checkout");
    assert.equal(action.experimentId, experiment.id);
    assert.equal(action.previousVariantId, "pain");
    assert.equal(action.variantId, "proof");
    assert.deepEqual(action.checkoutIds, [checkout.id]);
    assert.deepEqual(action.recoveryUrls, [`https://money.example/recover/${checkout.id}`]);
    assert.match(action.reason, /支付\/信任环节有摩擦/);

    const execution = await executeActionPlan({ dryRun: true });
    const recovery = execution.results.find((item) => item.action === "recover-unpaid-checkout");
    assert.equal(recovery.status, "executed");
    assert.equal(recovery.variantId, "proof");
    assert.deepEqual(recovery.recoveryUrls, [`https://money.example/recover/${checkout.id}`]);
    assert.equal(recovery.recoveryPackages, 1);
    const optimization = loadVariantOptimizations()[0];
    assert.equal(optimization.source, "automatic-unpaid-checkout-recovery");
    assert.equal(optimization.variantId, "proof");
    assert.deepEqual(optimization.checkoutIds, [checkout.id]);
    assert.deepEqual(optimization.recoveryUrls, [`https://money.example/recover/${checkout.id}`]);
    assert.match(optimization.recommendedPublishUrl, /--proof\.html/);
    const recoveryOutbox = loadRecoveryOutbox();
    assert.equal(recoveryOutbox.length, 1);
    assert.equal(recoveryOutbox[0].checkoutId, checkout.id);
    assert.equal(recoveryOutbox[0].paymentRemark, checkout.paymentRemark);
    assert.equal(recoveryOutbox[0].recoveryUrl, `https://money.example/recover/${checkout.id}`);
    assert.equal(recoveryOutbox[0].checkoutStatusUrl, checkout.statusUrl);
    assert.equal(recoveryOutbox[0].wechatQrUrl, "https://money.example/wechat-pay.jpg");

    const dryRunPublish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(dryRunPublish.results[0].variantId, "proof");
    assert.match(dryRunPublish.results[0].publishUrl, /--proof\.html/);
    const task = loadPublishQueue()[0];
    const publishResult = await runExecutionQueueTask({
      id: "exec_recovery_publish_payload",
      kind: "publish",
      action: "publish-task",
      target: task.id,
      status: "queued",
      experimentId: task.experimentId,
      channel: task.channel,
      priority: 1,
    }, { dryRun: true });
    assert.deepEqual(publishResult.payload.checkoutRecoveryUrls, [`https://money.example/recover/${checkout.id}`]);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("checkout recovery page restores unpaid payment path without creating orders", async () => {
  const restore = snapshotData();
  const server = http.createServer(handler);
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const checkout = createCheckout({ experimentId: experiment.id, variantId: "proof" });
    const html = checkoutRecoveryHtml(checkout.id);
    assert.match(html, /自动未付款挽回/);
    assert.match(html, /wechat-pay\.jpg/);
    assert.match(html, /payment-proof-form/);
    assert.match(html, new RegExp(checkout.paymentRemark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, new RegExp(`/checkout/${checkout.id}`));
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await request(server, `/recover/${checkout.id}`);
    assert.equal(response.status, 200);
    const body = response.body.toString("utf8");
    assert.match(body, /不重新造单/);
    assert.match(body, /微信收款二维码/);
    assert.match(body, new RegExp(checkout.paymentRemark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);
  } finally {
    server.close();
    restore();
  }
});

test("checkout recovery page shows underpaid short amount and preserves original checkout", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const underpaid = receivePaymentNotification({
      transactionId: "checkout_recovery_underpaid_001",
      remark: checkout.paymentRemark,
      amount: checkout.amount - 2,
    });
    assert.equal(underpaid.status, "underpaid");
    const html = checkoutRecoveryHtml(checkout.id);
    assert.match(html, /补足差额后系统立即自动交付/);
    assert.match(html, /差额 ¥2/);
    assert.match(html, /同一个唯一备注/);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("high intent lead tool results automatically route future publishing to paid offer", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} });
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    const experiment = result.lab[0];
    appendEvent({ type: "view", experimentId: experiment.id, channel: "lead-tool" });
    appendEvent({ type: "lead-tool-result", experimentId: experiment.id, variantId: "proof", channel: "lead-tool", score: 5 });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "proof", channel: "lead-tool-cta" });

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const action = plan.actions.find((item) => item.type === "convert-high-intent-lead");
    assert.equal(action.experimentId, experiment.id);
    assert.equal(action.variantId, "proof");
    assert.deepEqual(action.leadScores, [5]);
    assert.match(action.reason, /高意图 lead/);

    const execution = await executeActionPlan({ dryRun: true });
    const conversion = execution.results.find((item) => item.action === "convert-high-intent-lead");
    assert.equal(conversion.status, "executed");
    assert.equal(conversion.variantId, "proof");
    const optimization = loadVariantOptimizations()[0];
    assert.equal(optimization.source, "automatic-high-intent-lead-conversion");
    assert.equal(optimization.variantId, "proof");
    assert.deepEqual(optimization.leadScores, [5]);

    const dryRunPublish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(dryRunPublish.results[0].variantId, "proof");
    assert.match(dryRunPublish.results[0].publishUrl, /--proof\.html/);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("high intent sample leads automatically route future publishing to trust offer", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} });
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    const experiment = result.lab[0];
    appendEvent({ type: "sample-lead", experimentId: experiment.id, variantId: "proof", channel: "sample-lead", score: 6, highIntent: true });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "proof", channel: "sample-lead-cta" });

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const action = plan.actions.find((item) => item.type === "convert-high-intent-lead");
    assert.equal(action.experimentId, experiment.id);
    assert.equal(action.variantId, "proof");
    assert.deepEqual(action.leadScores, [6]);
    assert.deepEqual(action.leadTypes, ["sample-lead"]);
    assert.match(action.reason, /sample-lead/);

    const execution = await executeActionPlan({ dryRun: true });
    const conversion = execution.results.find((item) => item.action === "convert-high-intent-lead");
    assert.equal(conversion.status, "executed");
    assert.equal(conversion.variantId, "proof");
    const optimization = loadVariantOptimizations()[0];
    assert.equal(optimization.source, "automatic-high-intent-lead-conversion");
    assert.equal(optimization.variantId, "proof");
    assert.deepEqual(optimization.leadScores, [6]);
    assert.deepEqual(optimization.leadTypes, ["sample-lead"]);

    const dryRunPublish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(dryRunPublish.results[0].variantId, "proof");
    assert.match(dryRunPublish.results[0].publishUrl, /--proof\.html/);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("sample page views without checkout automatically route future publishing to sample-close page", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} });
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    const experiment = result.lab[0];
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:sample-page" });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:sample-page" });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "sample-page" });

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const action = plan.actions.find((item) => item.type === "convert-sample-interest");
    assert.equal(action.experimentId, experiment.id);
    assert.equal(action.variantId, "proof");
    assert.equal(action.metrics.sampleViews, 3);
    assert.match(action.recommendedPublishUrl, new RegExp(`/sample-close/${experiment.id}\\.html$`));
    assert.match(action.reason, /样例后成交页/);

    const execution = await executeActionPlan({ dryRun: true });
    const conversion = execution.results.find((item) => item.action === "convert-sample-interest");
    assert.equal(conversion.status, "executed");
    assert.equal(conversion.variantId, "proof");
    assert.match(conversion.recommendedPublishUrl, new RegExp(`/sample-close/${experiment.id}\\.html$`));
    const optimization = loadVariantOptimizations()[0];
    assert.equal(optimization.source, "automatic-sample-interest-close");
    assert.equal(optimization.variantId, "proof");
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/sample-close/${experiment.id}\\.html$`));

    const dryRunPublish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(dryRunPublish.results[0].variantId, "proof");
    assert.match(dryRunPublish.results[0].publishUrl, new RegExp(`/sample-close/${experiment.id}\\.html$`));
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("sent publishing without checkout escalates future routing to buy-now page", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "published-no-checkout-outbox");
  const growthResultsDir = path.join(dataDir, "published-no-checkout-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: "wechat-moments", taskId: sentQueue[0].id });

    const coldPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(coldPlan.actions.some((item) => item.type === "escalate-published-no-checkout" && item.experimentId === experiment.id), false);

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:promotion", path: "/promotions/wechat-moments/test.html" });
    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    const action = plan.actions.find((item) => item.type === "escalate-published-no-checkout");
    assert.equal(action.experimentId, experiment.id);
    assert.equal(action.variantId, "direct");
    assert.match(action.recommendedPublishUrl, new RegExp(`/buy-now/${experiment.id}\\.html$`));
    assert.equal(action.metrics.sentPublishTasks, 3);
    assert.equal(action.metrics.buyerSignalEvents, 1);
    assert.match(action.reason, /直购成交页/);
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);

    const queue = buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() });
    const task = queue.tasks.find((item) => item.action === "escalate-published-no-checkout");
    assert.equal(task.variantId, "direct");
    assert.match(task.recommendedPublishUrl, new RegExp(`/buy-now/${experiment.id}\\.html$`));

    const taskResult = await runExecutionQueueTask(task, { dryRun: false });
    assert.equal(taskResult.status, "executed");
    assert.equal(taskResult.republishStatus, "handed-off");
    assert.equal(taskResult.republishPackages, 3);
    assert.match(taskResult.recommendedPublishUrl, new RegExp(`/buy-now/${experiment.id}\\.html$`));
    const optimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(optimization.source, "automatic-published-no-checkout-direct-buy");
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/buy-now/${experiment.id}\\.html$`));

    const files = fs.readdirSync(growthOutboxDir).filter((item) => item.endsWith(".optimization.json"));
    assert.equal(files.length, 3);
    const payload = JSON.parse(fs.readFileSync(path.join(growthOutboxDir, files[0]), "utf8"));
    assert.equal(payload.republishSource, "automatic-published-no-checkout-direct-buy");
    assert.match(payload.trackingUrl, new RegExp(`/buy-now/${experiment.id}\\.html$`));
    assert.match(payload.directBuyUrl, new RegExp(`/buy/${experiment.id}/direct\\?source=publish%3A`));

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 3);
    const ownedHtml = fs.readFileSync(owned.results[0].written[0], "utf8");
    assert.match(ownedHtml, /程序推荐入口：直购成交页/);
    assert.match(ownedHtml, /打开直购页/);
    assert.match(ownedHtml, /\/buy-now\//);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts["buy-now"], 3);
    assert.equal(status.publishQueue.routing.primary, "buy-now");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("handed off owned utility publishing without visits does not escalate to buy-now page", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: {},
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const handedOffQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "handed-off",
      handedOffAt: new Date().toISOString(),
      handoffFiles: [`/tmp/${task.id}.json`],
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(handedOffQueue, null, 2));

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(plan.actions.some((item) => item.type === "escalate-published-no-checkout" && item.experimentId === experiment.id), false);
    assert.equal(plan.actions.some((item) => item.type === "claim-publish"), false);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.utility, 3);
    assert.equal(status.publishQueue.routing.primary, "utility");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("utility publishing without visits is not escalated straight to buy-now", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: {},
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const utilityUrl = publicUtilityIntentUrl(utilityIntentPagesFor(experiment)[0]);
    const handedOffQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "handed-off",
      handedOffAt: new Date().toISOString(),
      handoffFiles: [`/tmp/${task.id}.json`],
      recommendedUrl: utilityUrl,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(handedOffQueue, null, 2));

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(plan.actions.some((item) => item.type === "escalate-published-no-checkout" && item.experimentId === experiment.id), false);
    assert.equal(plan.actions.some((item) => item.type === "route-traffic-starved-to-utility" && item.experimentId === experiment.id), false);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.utility, 3);
    assert.equal(status.publishQueue.routing.primary, "utility");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("buy-now visits without checkout automatically lower the next route to starter offer", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "direct-no-checkout-outbox");
  const growthResultsDir = path.join(dataDir, "direct-no-checkout-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: "wechat-moments", taskId: sentQueue[0].id });
    appendEvent({ type: "click", experimentId: experiment.id, channel: "wechat-moments", taskId: sentQueue[0].id });

    const directPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    const directAction = directPlan.actions.find((item) => item.type === "escalate-published-no-checkout");
    assert.ok(directAction);
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: directPlan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "escalate-published-no-checkout"), { dryRun: false });
    assert.equal(systemStatus().publishQueue.routing.primary, "buy-now");

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });

    const starterPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    const starterAction = starterPlan.actions.find((item) => item.type === "discount-direct-traffic-no-checkout");
    assert.equal(starterAction.experimentId, experiment.id);
    assert.equal(starterAction.variantId, "proof");
    assert.equal(starterAction.metrics.directViews, 2);
    assert.equal(starterAction.metrics.offer, "starter");
    assert.equal(starterAction.metrics.starterPrice, starterOfferPrice(experiment));
    assert.match(starterAction.recommendedPublishUrl, new RegExp(`/starter/${experiment.id}\\.html$`));
    assert.match(starterAction.reason, /低价入门页|入门版/);
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);

    const queue = buildExecutionQueue({ actionPlan: starterPlan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() });
    const task = queue.tasks.find((item) => item.action === "discount-direct-traffic-no-checkout");
    assert.equal(task.variantId, "proof");
    assert.match(task.recommendedPublishUrl, new RegExp(`/starter/${experiment.id}\\.html$`));

    const taskResult = await runExecutionQueueTask(task, { dryRun: false });
    assert.equal(taskResult.status, "executed");
    assert.equal(taskResult.republishStatus, "handed-off");
    assert.equal(taskResult.republishPackages, 3);
    assert.match(taskResult.recommendedPublishUrl, new RegExp(`/starter/${experiment.id}\\.html$`));
    const optimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(optimization.source, "automatic-direct-traffic-starter-offer");
    assert.equal(optimization.metrics.offer, "starter");
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/starter/${experiment.id}\\.html$`));

    const files = fs.readdirSync(growthOutboxDir).filter((item) => item.endsWith(".optimization.json"));
    assert.equal(files.length, 3);
    const payload = JSON.parse(fs.readFileSync(path.join(growthOutboxDir, files[0]), "utf8"));
    assert.equal(payload.republishSource, "automatic-direct-traffic-starter-offer");
    assert.match(payload.trackingUrl, new RegExp(`/starter/${experiment.id}\\.html$`));
    assert.match(payload.directBuyUrl, new RegExp(`/buy/${experiment.id}/proof\\?source=publish%3A.*&offer=starter`));

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 3);
    const ownedHtml = fs.readFileSync(owned.results[0].written[0], "utf8");
    assert.match(ownedHtml, /程序推荐入口：低价入门页/);
    assert.match(ownedHtml, /打开低价入门页/);
    assert.match(ownedHtml, /\/starter\//);
    assert.match(ownedHtml, /自有分发页：直接生成入门版付款备注/);
    assert.match(ownedHtml, /在这个分发页直接生成入门版付款备注/);
    assert.match(ownedHtml, /const directOffer = "starter"/);
    assert.match(ownedHtml, new RegExp(`const directAmount = ${starterOfferPrice(experiment)}`));
    assert.match(ownedHtml, /offer: directOffer/);
    assert.match(ownedHtml, /amount: directAmount/);
    assert.doesNotMatch(ownedHtml, /data-engagement-autostart/);
    assert.doesNotMatch(ownedHtml, /setTimeout\(\(\) => ensureDirectCheckout/);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.starter, 3);
    assert.equal(status.publishQueue.routing.primary, "starter");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("starter discount route is not overwritten back to buy-now while still no checkout", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "starter-not-overwritten-outbox");
  const growthResultsDir = path.join(dataDir, "starter-not-overwritten-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    for (const task of sentQueue) {
      appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: task.channel, taskId: task.id });
    }
    appendEvent({ type: "click", experimentId: experiment.id, channel: sentQueue[0].channel, taskId: sentQueue[0].id });

    let plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "escalate-published-no-checkout"), { dryRun: false });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });
    plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "discount-direct-traffic-no-checkout"), { dryRun: false });

    const starterOptimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(starterOptimization.source, "automatic-direct-traffic-starter-offer");
    assert.match(starterOptimization.recommendedPublishUrl, new RegExp(`/starter/${experiment.id}\\.html$`));

    const nextPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(nextPlan.actions.some((item) => item.type === "escalate-published-no-checkout" && item.experimentId === experiment.id), false);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.starter, 3);
    assert.equal(status.publishQueue.routing.primary, "starter");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("paid routes without paid-page visits are routed back to utility pages", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "traffic-starved-utility-outbox");
  const growthResultsDir = path.join(dataDir, "traffic-starved-utility-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    for (const task of sentQueue) {
      appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: task.channel, taskId: task.id });
    }

    fs.writeFileSync(
      path.join(dataDir, "variant-optimizations.json"),
      JSON.stringify(
        [
          {
            at: new Date().toISOString(),
            experimentId: experiment.id,
            variantId: "direct",
            variantLabel: "直接成交版",
            recommendedPublishUrl: `https://money.example/buy-now/${experiment.id}.html`,
            source: "automatic-published-no-checkout-direct-buy",
            metrics: { sentPublishTasks: sentQueue.length, publishSentEvents: sentQueue.length },
          },
        ],
        null,
        2
      )
    );
    assert.equal(systemStatus().publishQueue.routing.primary, "buy-now");

    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:utility:fit-calculator", path: `/utilities/${experiment.id}-fit-calculator.html` });
    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(plan.actions.some((item) => item.type === "discount-direct-traffic-no-checkout" && item.experimentId === experiment.id), false);
    assert.equal(plan.actions.some((item) => item.type === "compress-starter-traffic-to-instant-checkout" && item.experimentId === experiment.id), false);
    const utilityAction = plan.actions.find((item) => item.type === "route-traffic-starved-to-utility" && item.experimentId === experiment.id);
    assert.equal(utilityAction.experimentId, experiment.id);
    assert.equal(utilityAction.metrics.productViews, 1);
    assert.equal(utilityAction.metrics.paidPageViews, 0);
    assert.equal(utilityAction.metrics.routedPaidTasks, 3);
    assert.match(utilityAction.recommendedPublishUrl, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html$`));
    assert.match(utilityAction.reason, /免费工具页/);

    const queue = buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() });
    const task = queue.tasks.find((item) => item.action === "route-traffic-starved-to-utility");
    const taskResult = await runExecutionQueueTask(task, { dryRun: false });
    assert.equal(taskResult.status, "executed");
    assert.equal(taskResult.republishStatus, "handed-off");
    assert.equal(taskResult.republishPackages, 3);
    assert.match(taskResult.recommendedPublishUrl, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html$`));

    const optimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(optimization.source, "automatic-traffic-starved-utility");
    assert.equal(optimization.metrics.paidPageViews, 0);
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html$`));
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.utility, 3);
    assert.equal(status.publishQueue.routing.primary, "utility");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("utility recovery is not immediately overwritten by direct buy without utility evidence", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "utility-not-overwritten-outbox");
  const growthResultsDir = path.join(dataDir, "utility-not-overwritten-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    for (const task of sentQueue) {
      appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: task.channel, taskId: task.id });
    }
    fs.writeFileSync(
      path.join(dataDir, "variant-optimizations.json"),
      JSON.stringify(
        [
          {
            at: new Date().toISOString(),
            experimentId: experiment.id,
            variantId: "proof",
            variantLabel: `${experiment.title} 值不值得买？免费适配计算器`,
            recommendedPublishUrl: publicUtilityIntentUrl(utilityIntentPagesFor(experiment)[0]),
            source: "automatic-traffic-starved-utility",
            metrics: { productViews: 1, paidPageViews: 0, routedPaidTasks: 3, utilityViews: 1 },
          },
        ],
        null,
        2
      )
    );
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:promotion", path: "/promotions/wechat-moments/test.html" });

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(plan.actions.some((item) => item.type === "escalate-published-no-checkout" && item.experimentId === experiment.id), false);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.primary, "utility");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("starter traffic without checkout compresses future routing to instant checkout page", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "starter-instant-outbox");
  const growthResultsDir = path.join(dataDir, "starter-instant-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    for (const task of sentQueue) {
      appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: task.channel, taskId: task.id });
    }
    appendEvent({ type: "click", experimentId: experiment.id, channel: sentQueue[0].channel, taskId: sentQueue[0].id });

    let plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "escalate-published-no-checkout"), { dryRun: false });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });
    plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "discount-direct-traffic-no-checkout"), { dryRun: false });
    assert.equal(systemStatus().publishQueue.routing.primary, "starter");

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:starter-offer" });
    const instantPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    const instantAction = instantPlan.actions.find((item) => item.type === "compress-starter-traffic-to-instant-checkout");
    assert.equal(instantAction.experimentId, experiment.id);
    assert.equal(instantAction.variantId, "proof");
    assert.equal(instantAction.metrics.offer, "starter");
    assert.equal(instantAction.metrics.starterViews, 1);
    assert.equal(instantAction.metrics.routedStarterTasks, 3);
    assert.equal(instantAction.metrics.starterPrice, starterOfferPrice(experiment));
    assert.match(instantAction.recommendedPublishUrl, new RegExp(`/instant/${experiment.id}\\.html$`));
    assert.match(instantAction.reason, /一屏付款页/);
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);

    const queue = buildExecutionQueue({ actionPlan: instantPlan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() });
    const task = queue.tasks.find((item) => item.action === "compress-starter-traffic-to-instant-checkout");
    assert.equal(task.variantId, "proof");
    assert.match(task.recommendedPublishUrl, new RegExp(`/instant/${experiment.id}\\.html$`));
    const expectedRepublishPackages = loadPublishQueue().filter((item) => item.experimentId === experiment.id && item.channel !== "landing-page").length;
    assert.equal(expectedRepublishPackages > 0, true);

    const taskResult = await runExecutionQueueTask(task, { dryRun: false });
    assert.equal(taskResult.status, "executed");
    assert.equal(taskResult.republishStatus, "handed-off");
    assert.equal(taskResult.republishPackages, expectedRepublishPackages);
    assert.match(taskResult.recommendedPublishUrl, new RegExp(`/instant/${experiment.id}\\.html$`));
    const optimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(optimization.source, "automatic-starter-no-checkout-instant");
    assert.equal(optimization.metrics.offer, "starter");
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/instant/${experiment.id}\\.html$`));

    const files = fs.readdirSync(growthOutboxDir).filter((item) => item.endsWith(".optimization.json"));
    assert.equal(files.length, expectedRepublishPackages);
    const payload = JSON.parse(fs.readFileSync(path.join(growthOutboxDir, files[0]), "utf8"));
    assert.equal(payload.republishSource, "automatic-starter-no-checkout-instant");
    assert.match(payload.trackingUrl, new RegExp(`/instant/${experiment.id}\\.html$`));
    assert.match(payload.directBuyUrl, new RegExp(`/buy/${experiment.id}/proof\\?source=publish%3A.*&offer=starter`));

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 3);
    const ownedHtml = fs.readFileSync(owned.results[0].written[0], "utf8");
    assert.match(ownedHtml, /程序推荐入口：一屏付款页/);
    assert.match(ownedHtml, /打开一屏付款页/);
    assert.match(ownedHtml, /\/instant\//);
    assert.match(ownedHtml, /const directOffer = "starter"/);
    assert.match(ownedHtml, new RegExp(`const directAmount = ${starterOfferPrice(experiment)}`));
    assert.match(ownedHtml, new RegExp(`${experiment.id}#STARTER`));
    assert.match(ownedHtml, /分发页直接兜底收款/);
    assert.match(ownedHtml, /data-static-payment-proof-form/);
    assert.match(ownedHtml, /\/api\/wechat-notify/);
    assert.doesNotMatch(ownedHtml, /setTimeout\(\(\) => ensureDirectCheckout/);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.instant, expectedRepublishPackages);
    assert.equal(status.publishQueue.routing.primary, "instant");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("instant checkout route is not downgraded back to earlier no-checkout routes", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    for (const task of sentQueue) {
      appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: task.channel, taskId: task.id });
    }
    appendEvent({ type: "click", experimentId: experiment.id, channel: sentQueue[0].channel, taskId: sentQueue[0].id });

    let plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "escalate-published-no-checkout"), { dryRun: false });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });
    plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "discount-direct-traffic-no-checkout"), { dryRun: false });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:starter-offer" });
    plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "compress-starter-traffic-to-instant-checkout"), { dryRun: false });

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:starter-offer" });
    for (let i = 0; i < 20; i += 1) {
      appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:offer" });
    }
    const nextPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    const regressionActions = nextPlan.actions.filter((item) =>
      ["escalate-published-no-checkout", "discount-direct-traffic-no-checkout", "rewrite-offer-from-views"].includes(item.type) &&
      item.experimentId === experiment.id
    );
    assert.deepEqual(regressionActions, []);
    const optimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(optimization.source, "automatic-starter-no-checkout-instant");
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/instant/${experiment.id}\\.html$`));
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("starter discount route is not overwritten by exposure rescue while still no checkout", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({ publicBaseUrl: "https://money.example", channels: {}, growthWebhooks: [], fulfillment: {}, payments: {}, opportunitySources: [], publishAgent: {} });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));
    for (const task of sentQueue) {
      appendEvent({ type: "publish-sent", experimentId: experiment.id, channel: task.channel, taskId: task.id });
    }
    appendEvent({ type: "click", experimentId: experiment.id, channel: sentQueue[0].channel, taskId: sentQueue[0].id });

    let plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "escalate-published-no-checkout"), { dryRun: false });
    appendEvent({ type: "view", experimentId: experiment.id, variantId: "direct", channel: "server:buy-now" });
    plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    await runExecutionQueueTask(buildExecutionQueue({ actionPlan: plan, trafficPlan: loadTrafficPlan(), publishQueue: loadPublishQueue() }).tasks.find((item) => item.action === "discount-direct-traffic-no-checkout"), { dryRun: false });

    for (let i = 0; i < 12; i += 1) {
      appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof", channel: "server:starter-offer" });
    }

    const nextPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    assert.equal(nextPlan.actions.some((item) => item.type === "rewrite-offer-from-views" && item.experimentId === experiment.id), false);
    const optimization = loadVariantOptimizations().find((item) => item.experimentId === experiment.id);
    assert.equal(optimization.source, "automatic-direct-traffic-starter-offer");
    assert.match(optimization.recommendedPublishUrl, new RegExp(`/starter/${experiment.id}\\.html$`));
    assert.equal(systemStatus().publishQueue.routing.primary, "starter");
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("action plan executor sends publish tasks when channel adapters are configured", async () => {
  const restore = snapshotData();
  const webhook = await webhookServer();
  try {
    generateSite({ seed: 20261010, count: 1 });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {
        "wechat-moments": { webhookUrl: `${webhook.baseUrl}/publish/wechat` },
        "xhs-note": { webhookUrl: `${webhook.baseUrl}/publish/xhs` },
        "zhihu-answer": { webhookUrl: `${webhook.baseUrl}/publish/zhihu` },
      },
      fulfillment: {},
      payments: {},
      publishAgent: {},
    });
    const execution = await executeActionPlan({ dryRun: false });
    assert.equal(execution.results.some((item) => item.action === "claim-publish" && item.status === "executed" && item.sent === 3), true);
    assert.equal(webhook.calls.filter((item) => item.body.type === "publish").length, 3);
  } finally {
    await new Promise((resolve) => webhook.server.close(resolve));
    restore();
  }
});

test("autonomous cycle runs worker and then executes the machine action plan", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    const cycle = await runAutonomousCycle({ seed: 20261010, count: 1, dryRun: true });
    assert.match(cycle.id, /^cycle_/);
    assert.equal(typeof cycle.adapterHealth.configured, "number");
    assert.match(cycle.worker.id, /^worker_/);
    assert.match(cycle.executionQueueRun.id, /^execution_queue_run_/);
    assert.match(cycle.publishAgent.id, /^publish_agent_/);
    assert.equal(cycle.actionExecution.results.some((item) => item.status === "executed"), true);
    const status = systemStatus();
    assert.equal(status.lastCycle.id, cycle.id);
    assert.equal(status.lastCycle.executionQueueRun.id, cycle.executionQueueRun.id);
    assert.equal(status.lastExecutionQueueRun.id, cycle.executionQueueRun.id);
    assert.equal(status.lastCycle.publishAgent.id, cycle.publishAgent.id);
    assert.equal(status.lastPublishAgent.id, cycle.publishAgent.id);
    assert.equal(status.lastActionExecution.id, cycle.actionExecution.id);
    assert.equal(status.actionExecutionHistory.at(-1).id, cycle.actionExecution.id);
  } finally {
    restore();
  }
});

test("autonomous supervisor records observable runner state", () => {
  const restore = snapshotData();
  try {
    const running = recordAutonomousSupervisorState({
      status: "running",
      port: 4188,
      intervalSeconds: 300,
      dryRun: true,
      startedAt: "2026-10-12T00:00:00.000Z",
    });
    assert.equal(running.status, "running");
    const idle = recordAutonomousSupervisorState({
      status: "idle",
      port: 4188,
      intervalSeconds: 300,
      dryRun: true,
      lastCycleId: "cycle_test",
      lastSummary: { queueExecuted: 2, queueBlocked: 3 },
    });
    assert.equal(loadAutonomousSupervisor().status, "idle");
    assert.equal(loadAutonomousSupervisor().lastCycleId, "cycle_test");
    assert.equal(loadAutonomousSupervisorHistory().length, 2);
    assert.equal(loadAutonomousSupervisorHistory().at(-1).lastSummary.queueExecuted, 2);
    assert.equal(systemStatus().autonomousSupervisor.lastCycleId, idle.lastCycleId);
  } finally {
    restore();
  }
});

test("money-funnel supervisor expands traffic without faking revenue", async () => {
  const restore = snapshotData();
  try {
    bootstrapLocalLoop({
      rootDir: path.join(dataDir, "supervisor-money-loop"),
      publicBaseUrl: "https://money.example",
      preserveExisting: false,
    });
    await scanOpportunitySources({ seed: 20261012, useDefaultSources: false });
    const site = generateSite({ seed: 20261012, count: 2 });
    const queue = buildPublishQueue(site.lab);
    for (const task of queue.slice(0, 12)) {
      task.status = "handed-off";
      task.handedOffAt = new Date().toISOString();
    }
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(queue, null, 2));
    fs.writeFileSync(
      path.join(dataDir, "last-search-submit.json"),
      JSON.stringify({ at: new Date().toISOString(), status: "noop", reason: "no-new-urls", discovered: 24, submitted: 0 }, null, 2)
    );

    const before = systemStatus();
    const decision = shouldSupervisorExpandTraffic(before, { minExpansionIntervalSeconds: 0 });
    assert.equal(decision.expand, true);
    const run = await runAutonomousSupervisorOnce({
      dryRun: false,
      seed: 20261012,
      executionQueueLimit: 80,
      expansionCount: 3,
      minExpansionIntervalSeconds: 0,
      ensureService: false,
    });
    assert.match(run.id, /^autonomous_supervisor_/);
    assert.equal(run.before.revenue, 0);
    assert.equal(run.after.revenue, 0);
    assert.equal(run.revenueDelta, 0);
    assert.equal(Boolean(run.expansion), true);
    assert.equal(run.expansion.signalsAdded >= 3, true);
    assert.equal(run.steps.some((item) => item.action === "expand-traffic-surface" && item.status === "executed"), true);
    assert.equal(loadLastAutonomousSupervisorRun().id, run.id);
    assert.equal(loadAutonomousSupervisor().lastSupervisorRunId, run.id);
    assert.equal(loadAutonomousSupervisor().lastSummary.outcome, "no-revenue-yet");
    assert.equal(loadAutonomousSupervisor().lastSummary.expanded, true);
    assert.equal(systemStatus().orders, 0);
    const status = systemStatus();
    assert.equal(status.publishQueue.routing.counts.utility > 0, true);
    const checked = status.publishQueue.routing.examples.filter((item) => ["utility", "starter", "instant", "buy-now", "sample"].includes(item.kind)).slice(0, 3);
    assert.equal(checked.length > 0, true);
    for (const item of checked) {
      const pathname = new URL(item.url).pathname;
      assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, pathname)), true);
    }
  } finally {
    fs.rmSync(path.join(dataDir, "supervisor-money-loop"), { recursive: true, force: true });
    restore();
  }
});

test("checkout service health records an already healthy service without spawning", async () => {
  const restore = snapshotData();
  try {
    let spawned = false;
    const health = await ensureCheckoutService({
      port: 4188,
      probe: async ({ port }) => ({ ok: true, status: "up", port, statusCode: 200, durationMs: 3 }),
      spawnProcess: () => {
        spawned = true;
        throw new Error("spawn should not run");
      },
    });
    assert.equal(health.status, "up");
    assert.equal(health.started, false);
    assert.equal(spawned, false);
    assert.equal(loadServiceHealth().status, "up");
    assert.equal(systemStatus().serviceHealth.status, "up");
  } finally {
    restore();
  }
});

test("checkout service health starts the checkout API when probe is down", async () => {
  const restore = snapshotData();
  try {
    const calls = [];
    const fakeChild = { pid: 4242, unref() {} };
    const health = await ensureCheckoutService({
      port: 4555,
      timeoutMs: 500,
      logFile: path.join(dataDir, "service-health-test.log"),
      probe: async ({ port }) => {
        calls.push(port);
        return calls.length === 1
          ? { ok: false, status: "down", port, error: "ECONNREFUSED" }
          : { ok: true, status: "up", port, statusCode: 200, durationMs: 4 };
      },
      spawnProcess: (command, args, options) => {
        assert.equal(command, process.execPath);
        assert.equal(args.at(-1).endsWith(path.join("src", "server.js")), true);
        assert.equal(options.cwd.endsWith("autonomous-income-engine"), true);
        assert.equal(options.env.PORT, "4555");
        return fakeChild;
      },
    });
    assert.equal(health.status, "restarted");
    assert.equal(health.started, true);
    assert.equal(health.pid, 4242);
    assert.equal(health.before.status, "down");
    assert.equal(health.probe.status, "up");
    assert.equal(loadServiceHealth().status, "restarted");
  } finally {
    fs.rmSync(path.join(dataDir, "service-health-test.log"), { force: true });
    restore();
  }
});

test("publishes a static site directory that can be deployed elsewhere", () => {
  const result = generateSite({ seed: 20261010, count: 8 });
  const publish = publishStaticSite();
  assert.equal(fs.existsSync(publish.entry), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "feed.json")), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "rss.xml")), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "sitemap.xml")), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "robots.txt")), true);
  const indexNow = JSON.parse(fs.readFileSync(path.join(dataDir, "indexnow.json"), "utf8"));
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, `${indexNow.key}.txt`)), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "wechat-pay.jpg")), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "deals", "today.html")), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "buy-now", `${result.lab[0].id}.html`)), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "sales", `${result.lab[0].id}.html`)), true);
  assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "promotions", "wechat-moments", `${result.lab[0].id}.html`)), true);
});

test("site generation and publish release their build lock", () => {
  const restore = snapshotData();
  const lockDir = path.join(__dirname, "..", "runtime", "site-build.lock");
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
    const result = generateSite({ seed: 20261010, count: 1 });
    assert.equal(fs.existsSync(path.join(DIST_DIR, "delivery-preview", `${result.lab[0].id}.md`)), true);
    assert.equal(fs.existsSync(lockDir), false);
    const publish = publishStaticSite();
    assert.equal(fs.existsSync(publish.entry), true);
    assert.equal(fs.existsSync(path.join(publish.directory, "delivery-preview", `${result.lab[0].id}.md`)), true);
    assert.equal(fs.existsSync(lockDir), false);
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
    restore();
  }
});

test("builds a publish queue from generated channel copy", () => {
  const restore = snapshotData();
  const growthOutboxDir = fs.mkdtempSync(path.join(dataDir, "publish-queue-build-outbox-"));
  const growthResultsDir = fs.mkdtempSync(path.join(dataDir, "publish-queue-build-results-"));
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const lab = buildLab({ seed: 20261010, count: 8 });
    const tasks = buildPublishQueue(lab);
    assert.equal(tasks.length, 24);
    assert.equal(tasks.every((item) => item.status === "waiting-for-account-authorization"), true);
    assert.equal(loadPublishQueue().length, 24);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("autopilot exports local publish drafts and prepares delivery notifications", () => {
  const restore = snapshotData();
  try {
    const run = runAutopilot({ seed: 20261010, count: 8 });
    assert.equal(run.experiments, 8);
    assert.equal(run.publishTasks, 24);
    assert.equal(run.exportedDrafts, 24);
    assert.equal(fs.existsSync(path.join(PUBLIC_SITE_DIR, "promotions", "wechat-moments")), true);
    assert.equal(fs.readdirSync(path.join(PUBLIC_SITE_DIR, "promotions", "wechat-moments")).some((file) => file.endsWith(".html")), true);

    const result = generateSite({ seed: 20261010, count: 8 });
    const order = recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    const outbox = prepareDeliveryOutbox();
    const item = outbox.find((task) => task.orderId === order.id);
    assert.equal(item.status, "prepared");
    assert.equal(fs.existsSync(item.preparedFile), true);
  } finally {
    restore();
  }
});

test("payment notification matches an experiment and prepares delivery automatically", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const experiment = result.lab[0];
    const payment = receivePaymentNotification({
      remark: `付款备注 ${experiment.id}`,
      amount: experiment.price,
      transactionId: "wx-static-product-payment-001",
    });
    assert.equal(payment.checkout, null);
    assert.equal(payment.order.experimentId, experiment.id);
    assert.equal(payment.order.status, "paid");
    assert.equal(payment.order.externalPaymentId, "wx-static-product-payment-001");
    assert.match(payment.order.deliveryUrl, /^\/deliver\/[-_A-Za-z0-9]+$/);
    assert.equal(payment.delivery.status, "prepared");
    assert.equal(payment.delivery.deliveryUrl, payment.order.deliveryUrl);
    assert.equal(fs.existsSync(payment.delivery.preparedFile), true);
    assert.equal(payment.delivery.preparedFile.startsWith(PRIVATE_FULFILLMENT_DIR), true);
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 1);
    assert.equal(loadDeliveryTokens().some((item) => item.orderId === payment.order.id), true);
  } finally {
    restore();
  }
});

test("checkout creates a unique payment remark and payment notification confirms it", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const experiment = result.lab[0];
    const checkout = createCheckout({ experimentId: experiment.id });
    assert.equal(checkout.status, "pending");
    assert.equal(checkout.experimentId, experiment.id);
    assert.equal(checkout.variantId, null);
    assert.match(checkout.paymentRemark, new RegExp(`^${experiment.id}#[-_A-Z0-9]+$`));
    assert.match(checkout.id, /^checkout_[-_A-Za-z0-9]{32}$/);
    assert.match(checkout.statusUrl, /^\/checkout\/checkout_[-_A-Za-z0-9]{32}$/);
    assert.equal(loadCheckouts().filter((item) => item.status === "pending").length, 1);
    assert.equal(checkoutStatus(checkout.id).order, null);
    assert.match(checkoutStatusHtml(checkout.id), /等待付款通知匹配/);

    const payment = receivePaymentNotification({
      transactionId: "checkout_tx_001",
      remark: `微信到账 ${checkout.paymentRemark}`,
      amount: experiment.price,
    });
    assert.equal(payment.checkout.id, checkout.id);
    assert.equal(payment.checkout.status, "paid");
    assert.equal(payment.order.checkoutId, checkout.id);
    assert.equal(payment.order.experimentId, experiment.id);
    assert.equal(payment.delivery.status, "prepared");
    assert.equal(loadCheckouts().find((item) => item.id === checkout.id).orderId, payment.order.id);
    const paidStatus = checkoutStatus(checkout.id);
    assert.equal(paidStatus.order.id, payment.order.id);
    assert.match(paidStatus.delivery.deliveryUrl, /^\/deliver\/[-_A-Za-z0-9]+$/);
    assert.match(checkoutStatusHtml(checkout.id), /下载你的交付文件/);

    const duplicate = receivePaymentNotification({
      transactionId: "checkout_tx_001",
      remark: checkout.paymentRemark,
      amount: experiment.price,
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.order.id, payment.order.id);
  } finally {
    restore();
  }
});

test("checkout price is server-authoritative and ignores client amount tampering", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const experiment = result.lab[0];
    const full = createCheckout({ experimentId: experiment.id, amount: 0.01 });
    const starter = createCheckout({ experimentId: experiment.id, offer: "starter", amount: 0.01 });
    assert.equal(full.amount, experiment.price);
    assert.equal(starter.amount, starterOfferPrice(experiment));
  } finally {
    restore();
  }
});

test("personal QR checkout assigns unique discounted amounts and matches authoritative notifications without remarks", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const experiment = result.lab[0];
    const first = createCheckout({ experimentId: experiment.id });
    const second = createCheckout({ experimentId: experiment.id });
    assert.equal(first.paymentMatchMode, "exact-amount");
    assert.equal(second.paymentMatchMode, "exact-amount");
    assert.equal(first.paymentAmount < first.amount, true);
    assert.equal(second.paymentAmount < second.amount, true);
    assert.notEqual(first.paymentAmount, second.paymentAmount);
    assert.equal(first.paymentDiscount, Number((first.amount - first.paymentAmount).toFixed(2)));

    const payload = validateAuthoritativePaymentNotification({
      transactionId: "wx_exact_amount_001",
      amount: first.paymentAmount,
      text: `微信支付收款到账 ¥${first.paymentAmount}，交易单号 wx_exact_amount_001`,
    });
    assert.equal(payload.authoritativeCheckoutId, first.id);
    const payment = receivePaymentNotification(payload);
    assert.equal(payment.checkout.id, first.id);
    assert.equal(payment.order.amount, first.paymentAmount);
    assert.equal(payment.delivery.status, "prepared");

    const repeated = receivePaymentNotification(
      validateAuthoritativePaymentNotification({
        transactionId: "wx_exact_amount_001",
        amount: first.paymentAmount,
        text: `重复到账通知 ¥${first.paymentAmount}，交易单号 wx_exact_amount_001`,
      })
    );
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.order.id, payment.order.id);
    assert.equal(loadOrders().length, 1);
  } finally {
    restore();
  }
});

test("expired unpaid checkout is removed from pending buyer intent", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "checkouts.json"), "utf8"));
    stored.find((item) => item.id === checkout.id).expiresAt = "2020-01-01T00:00:00.000Z";
    fs.writeFileSync(path.join(dataDir, "checkouts.json"), JSON.stringify(stored, null, 2));

    const checkouts = loadCheckouts({ now: new Date("2026-10-12T00:00:00.000Z") });
    const expired = checkouts.find((item) => item.id === checkout.id);
    assert.equal(expired.status, "expired");
    assert.equal(expired.expiredReason, "checkout-window-elapsed-without-payment");
    assert.equal(acquisitionFunnelSnapshot({ lab: result.lab, events: [], orders: [], checkouts }).checkouts.pending, 0);
    assert.equal(systemStatus().checkouts.pending, 0);
  } finally {
    restore();
  }
});

test("high intent lead context becomes order-specific delivery after payment", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const lead = processSampleLead({
      experimentId: experiment.id,
      variantId: "proof",
      context: "我今晚要投递后端岗位，项目经历写得像流水账，需要一版能直接复制到简历里的项目描述。",
      urgency: "今天 22 点前必须用",
      contact: "wx: buyer-context-test",
      leadSessionId: "buyer-context-session",
    });
    assert.equal(lead.highIntent, true);
    assert.equal(lead.checkout.leadContext.includes("后端岗位"), true);
    assert.equal(lead.checkout.leadUrgency, "今天 22 点前必须用");
    assert.equal(lead.checkout.leadContact, "wx: buyer-context-test");
    assert.equal(lead.checkout.leadReasons.includes("描述了具体使用场景"), true);

    const payment = receivePaymentNotification({
      transactionId: "buyer_context_tx_001",
      remark: lead.checkout.paymentRemark,
      amount: lead.checkout.amount,
    });

    assert.equal(payment.order.checkoutId, lead.checkout.id);
    assert.equal(payment.order.leadContext.includes("后端岗位"), true);
    assert.equal(payment.order.leadUrgency, "今天 22 点前必须用");
    assert.equal(payment.order.leadContact, "wx: buyer-context-test");
    assert.equal(payment.order.leadReasons.includes("表达了今天/马上要用"), true);
    assert.match(payment.order.deliveryFile, /data\/delivery\/orders\/order_/);
    assert.equal(fs.existsSync(payment.order.deliveryFile), true);
    const orderDelivery = fs.readFileSync(payment.order.deliveryFile, "utf8");
    assert.match(orderDelivery, /订单专属交付/);
    assert.match(orderDelivery, /后端岗位/);
    assert.match(orderDelivery, /今天 22 点前必须用/);
    assert.match(orderDelivery, /为什么系统把你判为高意向/);
    assert.match(orderDelivery, /--- 以下是完整交付包 ---/);
    assert.equal(payment.delivery.deliveryFile, payment.order.deliveryFile);
    assert.match(fs.readFileSync(payment.delivery.preparedFile, "utf8"), /后端岗位/);

    const token = loadDeliveryTokens().find((item) => item.orderId === payment.order.id);
    assert.equal(token.deliveryFile, payment.order.deliveryFile);
    const redeemed = redeemDeliveryToken(token.token);
    assert.match(redeemed.content, /订单专属交付/);
    assert.match(redeemed.content, /后端岗位/);
  } finally {
    restore();
  }
});

test("starter checkout payment delivers starter content instead of the full package", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const starterAmount = Math.max(6, Math.min(experiment.price - 1, Math.ceil(experiment.price * 0.38)));
    const checkout = createCheckout({
      experimentId: experiment.id,
      variantId: "proof",
      amount: starterAmount,
      offer: "starter",
      source: "starter-offer",
    });
    const payment = receivePaymentNotification({
      transactionId: "starter_checkout_tx_001",
      remark: checkout.paymentRemark,
      amount: checkout.amount,
    });
    const starterFile = path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}--starter.md`);
    assert.equal(payment.checkout.offer, "starter");
    assert.equal(payment.order.offer, "starter");
    assert.equal(payment.order.amount, starterAmount);
    assert.equal(payment.order.deliveryFile, starterFile);
    assert.equal(payment.delivery.deliveryFile, starterFile);
    assert.match(fs.readFileSync(payment.delivery.preparedFile, "utf8"), /入门版/);
    assert.doesNotMatch(fs.readFileSync(payment.delivery.preparedFile, "utf8"), /--- 完整交付内容 ---[\s\S]*## 30 分钟执行/);
    const token = loadDeliveryTokens().find((item) => item.orderId === payment.order.id);
    assert.equal(token.deliveryFile, starterFile);
    const redeemed = redeemDeliveryToken(token.token);
    assert.match(redeemed.content, /入门版包含/);
    assert.doesNotMatch(redeemed.content, /## 30 分钟执行/);

    const fullOrder = recordOrder({ experimentId: experiment.id, amount: experiment.price, payerNote: "paid" });
    assert.equal(fullOrder.deliveryFile, path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}.md`));
  } finally {
    restore();
  }
});

test("jobseeker full payment delivers a runnable JD matching workbench", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261012, count: 8, adaptive: false });
    const experiment = result.legacyCommerceProduct;
    assert.ok(experiment);
    assert.equal(experiment.id, "jobseekers-resume-workbench");
    assert.equal(experiment.price, 9);
    const order = recordOrder({
      experimentId: experiment.id,
      amount: experiment.price,
      payerNote: "independent-payment-confirmed",
    });
    assert.match(order.deliveryFile, /\.html$/);
    assert.equal(fs.existsSync(order.deliveryFile), true);
    const token = loadDeliveryTokens().find((item) => item.orderId === order.id);
    assert.ok(token);
    assert.match(token.deliveryFile, /\.html$/);
    const redeemed = redeemDeliveryToken(token.token);
    assert.equal(redeemed.file, order.deliveryFile);
    assert.match(redeemed.content, /一页简历成品生成器/);
    assert.match(redeemed.content, /目标岗位 JD/);
    assert.match(redeemed.content, /id="name"/);
    assert.match(redeemed.content, /id="skills"/);
    assert.match(redeemed.content, /id="work"/);
    assert.match(redeemed.content, /class="resume-sheet"/);
    assert.match(redeemed.content, /matchSummary/);
    assert.match(redeemed.content, /actionVersion/);
    assert.match(redeemed.content, /resultVersion/);
    assert.match(redeemed.content, /jobVersion/);
    assert.match(redeemed.content, /面试追问卡/);
    assert.match(redeemed.content, /打印 \/ 保存为 PDF/);
    assert.match(redeemed.content, /项目草稿箱/);
    assert.match(redeemed.content, /resume-workbench-projects-v1/);
    assert.match(redeemed.content, /保存当前项目/);
    assert.match(redeemed.content, /下载完整结果 TXT/);
    assert.doesNotMatch(redeemed.content, /fetch\s*\(|XMLHttpRequest|WebSocket/);
    const scripts = [...redeemed.content.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: order.deliveryFile }));
  } finally {
    restore();
  }
});

test("public product identity and price never drift with internal experiment inputs", () => {
  const restore = snapshotData();
  try {
    const first = generateSite({ seed: 20261010, count: 1 });
    const firstHome = fs.readFileSync(path.join(DIST_DIR, "products", "product-image-batch-studio", "index.html"), "utf8");
    const second = generateSite({ seed: 20269999, count: 16, adaptive: false });
    const secondHome = fs.readFileSync(path.join(DIST_DIR, "products", "product-image-batch-studio", "index.html"), "utf8");
    for (const product of [first.product, second.product]) {
      assert.equal(product.id, "product-image-batch-studio");
      assert.equal(product.price, 6.9);
      assert.equal(product.title, "商品图批量成品机");
    }
    const imageCheckout = createCheckout({
      productId: "product-image-batch-studio",
      variantId: "browser-hd-zip",
      source: "product-image-preview",
      amount: 0.01,
    });
    assert.equal(imageCheckout.amount, 6.9);
    assert.equal(imageCheckout.paymentAmount > 5.9 && imageCheckout.paymentAmount < 6.9, true);
    assert.equal(imageCheckout.status, "pending");
    assert.equal(first.legacyCommerceProduct.id, "jobseekers-resume-workbench");
    assert.equal(second.legacyCommerceProduct.id, "jobseekers-resume-workbench");
    for (const home of [firstHome, secondHome]) {
      assert.match(home, /商品图批量成品机/);
      assert.match(home, /product-image-batch-studio/);
      assert.match(home, /¥6\.90 微信购买高清 ZIP/);
      assert.match(home, /下载已购高清 ZIP/);
      assert.match(home, /payload\.checkout\.status === 'paid'/);
      assert.doesNotMatch(home, /<strong>¥19<\/strong>|<strong>¥29<\/strong>|<strong>¥39<\/strong>/);
    }
    const checkout = createCheckout({
      experimentId: "jobseekers-resume-workbench",
      source: "canonical-product-test",
    });
    assert.equal(checkout.amount, 9);
    assert.match(checkout.paymentRemark, /^jobseekers-resume-workbench#/);
  } finally {
    restore();
  }
});

test("starter static fallback payment is machine-matched as starter without creating checkout first", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const starterAmount = starterOfferPrice(experiment);
    const instantHtml = fs.readFileSync(path.join(DIST_DIR, "instant", `${experiment.id}.html`), "utf8");
    assert.match(instantHtml, new RegExp(`${experiment.id}#STARTER`));
    assert.match(instantHtml, /data-static-payment-proof-form/);
    assert.match(instantHtml, /\/api\/wechat-notify/);
    assert.match(instantHtml, /提交到账文本自动取货/);

    const payment = receivePaymentNotification({
      transactionId: "starter_static_fallback_tx_001",
      remark: `微信到账 ${experiment.id}#STARTER`,
      amount: starterAmount,
    });
    const starterFile = path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}--starter.md`);
    assert.equal(payment.checkout, null);
    assert.equal(payment.order.offer, "starter");
    assert.equal(payment.order.amount, starterAmount);
    assert.equal(payment.order.deliveryFile, starterFile);
    assert.equal(payment.delivery.deliveryFile, starterFile);
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 1);
  } finally {
    restore();
  }
});

test("static fallback payment does not fulfill underpaid product payments without checkout", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    assert.throws(
      () =>
        receivePaymentNotification({
          transactionId: "static_underpaid_full_tx_001",
          remark: `微信到账 ${experiment.id}`,
          amount: Math.max(1, experiment.price - 1),
        }),
      /below expected product price/
    );
    assert.equal(loadOrders().length, 0);
    assert.equal(loadOutbox().length, 0);
  } finally {
    restore();
  }
});

test("offer variants track checkout and payment conversion", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    assert.equal(experiment.offerVariants.length, 3);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "offer", `${experiment.id}--direct.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "offer", `${experiment.id}--pain.html`)), true);
    assert.equal(fs.existsSync(path.join(DIST_DIR, "offer", `${experiment.id}--proof.html`)), true);

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "pain" });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "pain" });
    const checkout = createCheckout({ experimentId: experiment.id, variantId: "pain" });
    const payment = receivePaymentNotification({
      transactionId: "variant_paid_001",
      remark: checkout.paymentRemark,
      amount: checkout.amount,
    });
    assert.equal(payment.checkout.variantId, "pain");
    assert.equal(payment.order.variantId, "pain");

    const updated = buildLab({ seed: 20261010, count: 1 })[0];
    assert.equal(updated.winningVariant.id, "pain");
    assert.equal(updated.offerVariants.find((item) => item.id === "pain").metrics.paid, 1);
  } finally {
    restore();
  }
});

test("checkout payment notification does not fulfill when amount is underpaid", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const underpaid = receivePaymentNotification({
      transactionId: "checkout_underpaid_001",
      remark: `微信到账 ${checkout.paymentRemark}`,
      amount: checkout.amount - 1,
    });
    assert.equal(underpaid.status, "underpaid");
    assert.equal(underpaid.order, null);
    assert.equal(underpaid.delivery, null);
    assert.equal(underpaid.checkout.status, "underpaid");
    assert.equal(underpaid.checkout.shortAmount, 1);
    assert.equal(loadCheckouts().find((item) => item.id === checkout.id).orderId, undefined);
    assert.equal(loadOutbox().length, 0);
    assert.match(checkoutStatusHtml(checkout.id), /付款金额不足/);

    const paid = receivePaymentNotification({
      transactionId: "checkout_paid_after_underpaid_001",
      remark: checkout.paymentRemark,
      amount: 1,
    });
    assert.equal(paid.checkout.status, "paid");
    assert.equal(paid.checkout.receivedAmount, checkout.amount);
    assert.equal(paid.order.checkoutId, checkout.id);
    assert.equal(paid.order.amount, checkout.amount);
    assert.equal(paid.delivery.status, "prepared");
  } finally {
    restore();
  }
});

test("wechat notification text is parsed and matched to a pending checkout", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const payload = normalizeWechatPaymentNotification({
      text: `微信支付收款到账 ¥${checkout.amount}，付款备注 ${checkout.paymentRemark}，交易单号 wxnotice001`,
    });
    assert.equal(payload.amount, checkout.amount);
    assert.equal(payload.transactionId, "wxnotice001");
    const payment = receivePaymentNotification(payload);
    assert.equal(payment.checkout.id, checkout.id);
    assert.equal(payment.checkout.status, "paid");
    assert.equal(payment.order.checkoutId, checkout.id);
    assert.equal(payment.delivery.status, "prepared");
  } finally {
    restore();
  }
});

test("authoritative payment notifications require transaction id, positive amount and an exact checkout remark", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    assert.throws(
      () => validateAuthoritativePaymentNotification({ text: `微信支付收款到账 ¥${checkout.amount} 备注 ${checkout.paymentRemark}` }),
      /unique transaction id/
    );
    assert.throws(
      () => validateAuthoritativePaymentNotification({ transactionId: "wx_bad_amount_001", amount: 0, remark: checkout.paymentRemark }),
      /positive amount/
    );
    assert.throws(
      () => validateAuthoritativePaymentNotification({ transactionId: "wx_chat_001", amount: checkout.amount, text: `普通聊天 ${checkout.experimentId}` }),
      /existing checkout exact amount or unique payment remark/
    );

    const valid = validateAuthoritativePaymentNotification({
      text: `微信支付收款到账 ¥${checkout.amount}，付款备注 ${checkout.paymentRemark}，交易单号 wx_authoritative_001`,
    });
    assert.equal(valid.transactionId, "wx_authoritative_001");
    assert.equal(valid.amount, checkout.amount);
  } finally {
    restore();
  }
});

test("buyer payment proof waits for independent payment confirmation before fulfillment", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const html = checkoutStatusHtml(checkout.id);
    assert.match(html, /payment-proof-form/);
    assert.match(html, /我已付款，提交给系统匹配/);
    assert.match(html, new RegExp(`本单实付[\\s\\S]*¥${checkout.paymentAmount}`));
    assert.doesNotMatch(html, new RegExp(checkout.paymentRemark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const payment = submitCheckoutPaymentProof(checkout.id, {
      text: `微信支付收款到账 ¥${checkout.paymentAmount} 交易单号 wx_proof_001`,
    });
    assert.equal(payment.checkout.id, checkout.id);
    assert.equal(payment.checkout.status, "proof-submitted");
    assert.equal(payment.order, null);
    assert.equal(payment.delivery, null);
    assert.equal(payment.verificationRequired, true);
    assert.equal(payment.parsed.transactionId, "wx_proof_001");
    assert.equal(loadOrders().length, 0);
    assert.equal(loadOutbox().length, 0);
    assert.match(checkoutStatusHtml(checkout.id), /等待到账核验/);

    const confirmed = receivePaymentNotification(
      validateAuthoritativePaymentNotification({
        transactionId: "wx_authoritative_001",
        amount: checkout.paymentAmount,
        source: "payment-feed",
      })
    );
    assert.equal(confirmed.checkout.status, "paid");
    assert.equal(confirmed.order.checkoutId, checkout.id);
    assert.equal(confirmed.delivery.status, "prepared");
    assert.match(checkoutStatusHtml(checkout.id), /下载你的交付文件/);
  } finally {
    restore();
  }
});

test("checkout payment proof rejects text without the checkout unique remark", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    assert.throws(
      () =>
        submitCheckoutPaymentProof(checkout.id, {
          text: `微信支付收款到账 ¥${checkout.amount} 备注 wrong-remark 交易单号 wx_wrong_remark_001`,
        }),
      /unique payment remark/
    );
    assert.equal(loadOrders().length, 0);
    assert.equal(loadOutbox().length, 0);
    assert.equal(loadCheckouts().find((item) => item.id === checkout.id).status, "pending");
  } finally {
    restore();
  }
});

test("buyer payment proof never marks an order underpaid or paid by itself", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const underpaid = submitCheckoutPaymentProof(checkout.id, {
      text: `微信支付收款到账 ¥${checkout.amount - 1} 备注 ${checkout.paymentRemark} 交易单号 wx_proof_underpaid_001`,
    });
    assert.equal(underpaid.status, "proof-submitted");
    assert.equal(underpaid.order, null);
    assert.equal(underpaid.delivery, null);
    assert.equal(underpaid.checkout.status, "proof-submitted");
    assert.equal(loadOrders().length, 0);
    assert.equal(loadOutbox().length, 0);

    const secondProof = submitCheckoutPaymentProof(checkout.id, {
      text: `微信支付收款到账 ¥1 备注 ${checkout.paymentRemark} 交易单号 wx_proof_topup_001`,
    });
    assert.equal(secondProof.checkout.status, "proof-submitted");
    assert.equal(secondProof.order, null);
    assert.equal(secondProof.delivery, null);
    assert.equal(secondProof.checkout.buyerProofs.length, 2);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("buyer payment proof is idempotent and never creates an order", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const first = submitCheckoutPaymentProof(checkout.id, {
      text: `微信支付收款到账 ¥${checkout.amount} 备注 ${checkout.paymentRemark} 交易单号 wx_proof_dupe_001`,
    });
    const second = submitCheckoutPaymentProof(checkout.id, {
      text: `微信支付收款到账 ¥${checkout.amount} 备注 ${checkout.paymentRemark} 交易单号 wx_proof_dupe_001`,
    });
    assert.equal(second.duplicate, true);
    assert.equal(first.order, null);
    assert.equal(second.order, null);
    assert.equal(second.checkout.buyerProofs.length, 1);
    assert.equal(loadOrders().length, 0);
    assert.equal(loadOutbox().length, 0);
  } finally {
    restore();
  }
});

test("payment notifications are idempotent when an external payment id is provided", () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 8 });
    const experiment = result.lab[0];
    const first = receivePaymentNotification({
      transactionId: "wx_tx_001",
      remark: `付款备注 ${experiment.id}`,
      amount: experiment.price,
    });
    const second = receivePaymentNotification({
      transactionId: "wx_tx_001",
      remark: `重复通知 ${experiment.id}`,
      amount: experiment.price,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.order.id, first.order.id);
    assert.equal(loadOutbox().filter((item) => item.orderId === first.order.id).length, 1);
  } finally {
    restore();
  }
});

test("publish and fulfillment adapters report blocked, dry-run and sent states", async () => {
  const restore = snapshotData();
  const webhook = await webhookServer();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));

    const blockedPublish = await publishQueuedTasks();
    assert.equal(blockedPublish.results.length, 3);
    assert.equal(blockedPublish.results.every((item) => item.status === "blocked"), true);

    const order = recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    const blockedDelivery = await deliverPrepared();
    assert.equal(blockedDelivery.results.some((item) => item.reason === "missing-fulfillment-webhook-or-outbox-dir"), true);

    fs.writeFileSync(
      path.join(dataDir, "adapters.json"),
      JSON.stringify(
        {
          channels: {
            "wechat-moments": { webhookUrl: `${webhook.baseUrl}/publish/wechat` },
            "xhs-note": { webhookUrl: `${webhook.baseUrl}/publish/xhs` },
            "zhihu-answer": { webhookUrl: `${webhook.baseUrl}/publish/zhihu` },
          },
          fulfillment: { webhookUrl: `${webhook.baseUrl}/fulfillment` },
        },
        null,
        2
      )
    );

    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    const dryRun = await publishQueuedTasks({ dryRun: true });
    assert.equal(dryRun.results.every((item) => item.status === "dry-run-ready"), true);

    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    const sentPublish = await publishQueuedTasks();
    assert.equal(sentPublish.results.every((item) => item.status === "sent"), true);
    assert.equal(webhook.calls.filter((item) => item.body.type === "publish").length, 3);

    const repeatedPublish = await publishQueuedTasks();
    assert.equal(repeatedPublish.results.length, 0);
    assert.equal(webhook.calls.filter((item) => item.body.type === "publish").length, 3);

    const sentDelivery = await deliverPrepared();
    assert.equal(sentDelivery.results.some((item) => item.status === "sent"), true);
    assert.equal(webhook.calls.some((item) => item.body.type === "fulfillment" && item.body.orderId === order.id), true);
    assert.match(webhook.calls.find((item) => item.body.type === "fulfillment").body.deliveryContent, /30 分钟执行/);
  } finally {
    await new Promise((resolve) => webhook.server.close(resolve));
    restore();
  }
});

test("fulfillment outbox directory receives machine-readable delivery packages", async () => {
  const restore = snapshotData();
  const fulfillmentOutboxDir = path.join(dataDir, "fulfillment-outbox");
  try {
    fs.rmSync(fulfillmentOutboxDir, { recursive: true, force: true });
    const result = generateSite({ seed: 20261010, count: 1 });
    const order = recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      fulfillment: { outboxDir: fulfillmentOutboxDir },
      payments: {},
    });

    const health = await checkAdapterHealth();
    const fulfillmentCheck = health.checks.find((item) => item.id === "fulfillment-outbox");
    assert.equal(fulfillmentCheck.reachable, true);

    const delivery = await deliverPrepared();
    assert.equal(delivery.results.length, 1);
    assert.equal(delivery.results[0].status, "handed-off");
    assert.match(delivery.results[0].outboxFile, /order_/);
    const payload = JSON.parse(fs.readFileSync(delivery.results[0].outboxFile, "utf8"));
    assert.equal(payload.type, "fulfillment");
    assert.equal(payload.targetKind, "fulfillment-outbox");
    assert.equal(payload.orderId, order.id);
    assert.match(payload.deliveryUrl, /^https:\/\/money\.example\/deliver\/[-_A-Za-z0-9]+$/);
    assert.match(payload.deliveryContent, /30 分钟执行/);
    assert.equal(loadOutbox().find((item) => item.orderId === order.id).status, "handed-off");
    assert.equal(systemStatus().deliveryQueue.handedOff, 1);
  } finally {
    fs.rmSync(fulfillmentOutboxDir, { recursive: true, force: true });
    restore();
  }
});

test("growth webhooks push publish tasks to external automation endpoints", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [{ id: "growth-router", channels: ["*"], webhookUrl: `${baseUrl}/growth/router` }],
      fulfillment: {},
      payments: {},
    });

    const sent = await publishQueuedTasks();
    assert.equal(sent.results.length, 3);
    assert.equal(sent.results.every((item) => item.status === "sent" && item.sent === 1), true);
    assert.equal(sent.results.every((item) => item.externalUrl && item.externalUrl.startsWith("https://growth.example/growth/router/")), true);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    assert.equal(body.calls.filter((item) => item.path === "/growth/router").length, 3);
    assert.equal(body.calls.every((item) => item.body.targetKind === "growth-webhook"), true);
    assert.equal(loadPublishQueue().every((item) => item.status === "sent" && item.externalUrl), true);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("growth outbox directory receives machine-readable publish packages", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "growth-outbox");
  const growthResultsDir = path.join(dataDir, "growth-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });

    const health = await checkAdapterHealth();
    const outboxCheck = health.checks.find((item) => item.kind === "growth-outbox");
    assert.equal(outboxCheck.reachable, true);

    const sent = await publishQueuedTasks();
    assert.equal(sent.results.length, 3);
    assert.equal(sent.results.every((item) => item.status === "handed-off"), true);
    const files = fs.readdirSync(growthOutboxDir).filter((item) => item.endsWith(".json"));
    assert.equal(files.length, 3);
    const outboxFile = sent.results[0].attempts.find((item) => item.targetKind === "growth-outbox").outboxFile;
    const payload = JSON.parse(fs.readFileSync(outboxFile, "utf8"));
    assert.equal(payload.type, "publish");
    assert.equal(payload.targetKind, "growth-outbox");
    assert.match(payload.trackingUrl, /^https:\/\/money\.example\/utilities\//);
    assert.match(payload.originalTrackingUrl, /^\/t\//);
    assert.match(payload.optimizedReason, /免费工具页/);
    assert.match(payload.recommendedReason, /免费工具页/);
    assert.match(payload.directBuyUrl, /^https:\/\/money\.example\/buy\/[^/]+(\?source=|\/[^/]+\?source=)publish%3A/);
    assert.equal(payload.buyUrl, payload.directBuyUrl);
    assert.equal(payload.checkoutEntryUrl, payload.directBuyUrl);
    assert.equal(payload.salesLinks.directBuyUrl, payload.directBuyUrl);
    assert.match(payload.text, /直接购买并生成付款备注：https:\/\/money\.example\/buy\//);
    assert.equal(loadPublishQueue().every((item) => item.status === "handed-off"), true);
    assert.equal(systemStatus().publishQueue.handedOff, 3);
    assert.equal(systemStatus().publishQueue.sent, 0);

    const repeated = await publishQueuedTasks();
    assert.equal(repeated.results.length, 0);

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 3);
    assert.match(owned.results[0].externalUrl, /^https:\/\/money\.example\/syndication\//);
    assert.equal(fs.existsSync(owned.results[0].written[0]), true);
    const ownedHtml = fs.readFileSync(owned.results[0].written[0], "utf8");
    assert.match(ownedHtml, /data-direct-create-checkout/);
    assert.match(ownedHtml, /direct-checkout-session:syndication:/);
    assert.match(ownedHtml, /\/api\/checkouts/);
    assert.match(ownedHtml, /data-direct-payment-remark/);
    assert.doesNotMatch(ownedHtml, /data-engagement-autostart/);
    assert.doesNotMatch(ownedHtml, /startEngagedCheckout/);
    assert.doesNotMatch(ownedHtml, /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.match(ownedHtml, /程序推荐入口：免费工具页/);
    assert.match(ownedHtml, /打开免费工具/);
    assert.match(ownedHtml, /\/utilities\//);
    assert.match(ownedHtml, /路由原因：/);
    assert.match(ownedHtml, /直接购买并生成付款备注/);
    const repeatedOwned = publishGrowthOutboxToOwnedSite();
    assert.equal(repeatedOwned.published, 0);
    const sync = consumeResultInboxes();
    assert.equal(sync.growth.consumed, 3);
    assert.equal(loadPublishQueue().every((item) => item.status === "sent" && item.externalUrl.includes("/syndication/")), true);
    const rebuilt = generateSite({ seed: 20261010, count: 1 });
    const sitemap = fs.readFileSync(path.join(PUBLIC_SITE_DIR, "sitemap.xml"), "utf8");
    const rss = fs.readFileSync(path.join(PUBLIC_SITE_DIR, "rss.xml"), "utf8");
    const feed = JSON.parse(fs.readFileSync(path.join(PUBLIC_SITE_DIR, "feed.json"), "utf8"));
    assert.match(sitemap, /\/syndication\//);
    assert.match(rss, /syndication-/);
    assert.equal(feed.ownedSyndicationPages.length, 3);
    assert.equal(feed.ownedSyndicationPages.every((page) => page.url.includes("/syndication/")), true);
    assert.equal(feed.ownedSyndicationPages.every((page) => page.experimentId === rebuilt.lab[0].id), true);
    configurePublicBaseUrl("https://fresh-money.example", { source: "test" });
    generateSite({ seed: 20261010, count: 1 });
    const refreshedFeed = JSON.parse(fs.readFileSync(path.join(PUBLIC_SITE_DIR, "feed.json"), "utf8"));
    assert.equal(refreshedFeed.ownedSyndicationPages.length, 3);
    assert.equal(refreshedFeed.ownedSyndicationPages.every((page) => page.url.startsWith("https://fresh-money.example/syndication/")), true);
    assert.equal(refreshedFeed.ownedSyndicationPages.every((page) => !page.url.startsWith("https://money.example/syndication/")), true);
    const searchReady = await submitSearchIndex({ dryRun: true, lab: rebuilt.lab });
    assert.equal(searchReady.urls.some((url) => url.includes("/syndication/")), true);
    assert.equal(systemStatus().publishQueue.sent, 3);
    assert.equal(systemStatus().publishQueue.handedOff, 0);
    assert.equal(systemStatus().publishQueue.routing.counts.utility, 3);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("local publish agent can write claimed tasks to growth outbox", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "agent-growth-outbox");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    const result = generateSite({ seed: 20261010, count: 1 });
    buildPublishQueue(result.lab);
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir },
      fulfillment: {},
      payments: {},
    });

    const agent = await runPublishAgentOnce({ limit: 1, workerId: "outbox-agent" });
    assert.equal(agent.handedOff, 1);
    assert.equal(agent.results[0].status, "handed-off");
    const files = fs.readdirSync(growthOutboxDir).filter((item) => item.endsWith(".json"));
    assert.equal(files.length, 1);
    const payload = JSON.parse(fs.readFileSync(path.join(growthOutboxDir, files[0]), "utf8"));
    assert.equal(payload.type, "publish-agent");
    assert.equal(payload.targetKind, "growth-outbox");
    assert.equal(payload.taskId, agent.results[0].taskId);
    assert.match(payload.trackingUrl, /^https:\/\/money\.example\/utilities\//);
    assert.match(payload.originalTrackingUrl, /^\/t\//);
    assert.match(payload.optimizedReason, /免费工具页/);
    assert.match(payload.directBuyUrl, /^https:\/\/money\.example\/buy\/[^/]+(\?source=|\/[^/]+\?source=)publish%3A/);
    assert.match(payload.text, /直接购买并生成付款备注：https:\/\/money\.example\/buy\//);
    assert.equal(loadPublishQueue().find((item) => item.id === agent.results[0].taskId).status, "handed-off");
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    restore();
  }
});

test("distribution feed keeps syndication summary bounded while sitemap keeps every page", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "bounded-feed-outbox");
  const growthResultsDir = path.join(dataDir, "bounded-feed-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthResultsDir, { recursive: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    for (let index = 0; index < 140; index += 1) {
      fs.writeFileSync(
        path.join(growthResultsDir, `bulk-${index}.json`),
        JSON.stringify({
          taskId: `bulk-${index}`,
          status: "published",
          externalUrl: `https://money.example/syndication/wechat-moments/bulk-${index}.html`,
          channel: "wechat-moments",
          experimentId: experiment.id,
          label: `bulk ${index}`,
          text: "长尾分发正文 ".repeat(80),
          publishedAt: new Date().toISOString(),
        })
      );
    }

    generateSite({ seed: 20261010, count: 1 });
    const feed = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "feed.json"), "utf8"));
    const sitemap = fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8");
    assert.equal(feed.totalOwnedSyndicationPages, 140);
    assert.equal(feed.ownedSyndicationPagesLimit, 16);
    assert.equal(feed.ownedSyndicationPages.length, 16);
    assert.equal(feed.ownedSyndicationPages.every((page) => page.text.length <= 40), true);
    assert.equal(Buffer.byteLength(JSON.stringify(feed)) < 90000, true);
    assert.match(sitemap, /\/syndication\/wechat-moments\/bulk-0\.html/);
    assert.match(sitemap, /\/syndication\/wechat-moments\/bulk-139\.html/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("worker publishing uses optimized variant URL when available", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [{ id: "growth-router", channels: ["*"], webhookUrl: `${baseUrl}/growth/router` }],
      fulfillment: {},
      payments: {},
    });

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "proof" });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "proof" });
    createCheckout({ experimentId: experiment.id, variantId: "proof" });
    await executeActionPlan({ dryRun: true });

    const sent = await publishQueuedTasks();
    assert.equal(sent.results.length, 3);
    assert.equal(sent.results[0].variantId, "proof");
    assert.match(sent.results[0].publishUrl, /--proof\.html/);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    assert.equal(body.calls.length, 3);
    assert.equal(body.calls.every((item) => item.body.optimizedVariantId === "proof"), true);
    assert.equal(body.calls.every((item) => /--proof\.html/.test(item.body.trackingUrl)), true);
    assert.equal(body.calls.every((item) => /\/buy\/.+\/proof\?source=publish%3A/.test(item.body.directBuyUrl)), true);
    assert.equal(body.calls.every((item) => item.body.text.includes(item.body.directBuyUrl)), true);
    assert.equal(body.calls.every((item) => /\/t\//.test(item.body.originalTrackingUrl)), true);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("external publish agent can claim tasks and report published URLs", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(result.lab));

    const claimed = claimPublishTasks({ limit: 2, workerId: "bot-1" });
    assert.equal(claimed.length, 2);
    assert.equal(claimed.every((item) => item.text && item.trackingUrl), true);
    assert.equal(loadPublishQueue().filter((item) => item.status === "claimed").length, 2);

    const published = recordPublishResult({
      taskId: claimed[0].id,
      status: "sent",
      externalUrl: "https://example.com/post/1",
      workerId: "bot-1",
    });
    assert.equal(published.status, "sent");
    assert.equal(published.externalUrl, "https://example.com/post/1");

    const failed = recordPublishResult({
      taskId: claimed[1].id,
      status: "failed",
      error: "account rate limited",
      workerId: "bot-1",
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "account rate limited");

    const publish = await publishQueuedTasks({ dryRun: true });
    assert.equal(publish.results.some((item) => item.taskId === claimed[0].id), false);
  } finally {
    restore();
  }
});

test("local publish agent sends claimed tasks with winning variant URL", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    exportLocalPublishDrafts(buildPublishQueue(result.lab));
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [{ id: "growth-router", channels: ["*"], webhookUrl: `${baseUrl}/growth/router` }],
      fulfillment: {},
      payments: {},
    });

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "pain" });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "pain" });
    createCheckout({ experimentId: experiment.id, variantId: "pain" });
    await executeActionPlan({ dryRun: true });

    const agent = await runPublishAgentOnce({ limit: 1, workerId: "local-agent-1" });
    assert.equal(agent.claimed, 1);
    assert.equal(agent.sent, 1);
    assert.equal(agent.results[0].variantId, "pain");
    assert.match(agent.results[0].publishUrl, /--pain\.html/);
    assert.equal(loadPublishQueue().filter((item) => item.status === "sent").length, 1);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    assert.equal(body.calls.length, 1);
    assert.equal(body.calls[0].body.type, "publish-agent");
    assert.equal(body.calls[0].body.optimizedVariantId, "pain");
    assert.match(body.calls[0].body.trackingUrl, /--pain\.html/);
    assert.match(body.calls[0].body.directBuyUrl, /\/buy\/.+\/pain\?source=publish%3A/);
    assert.match(body.calls[0].body.text, /直接购买并生成付款备注：https:\/\/money\.example\/buy\//);
    assert.match(body.calls[0].body.originalTrackingUrl, /\/t\//);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("local mock adapter receives a full worker publish and fulfillment pass", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {
        "wechat-moments": { webhookUrl: `${baseUrl}/publish/wechat` },
        "xhs-note": { webhookUrl: `${baseUrl}/publish/xhs` },
        "zhihu-answer": { webhookUrl: `${baseUrl}/publish/zhihu` },
      },
      fulfillment: { webhookUrl: `${baseUrl}/fulfillment` },
      payments: { webhookSecret: "secret-123" },
    });
    const worker = await runWorkerOnce({ seed: 20261010, count: 1, dryRun: false });
    assert.equal(worker.published, 3);
    assert.equal(worker.fulfilled, 1);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    assert.equal(body.calls.filter((item) => item.body.type === "publish").length, 3);
    assert.equal(body.calls.filter((item) => item.body.type === "fulfillment").length, 1);
    assert.match(body.calls.find((item) => item.body.type === "publish").body.trackingUrl, /^https:\/\/money\.example\/utilities\//);
    assert.match(body.calls.find((item) => item.body.type === "publish").body.directBuyUrl, /^https:\/\/money\.example\/buy\//);
    const fulfillment = body.calls.find((item) => item.body.type === "fulfillment").body;
    assert.match(fulfillment.deliveryUrl, /^https:\/\/money\.example\/deliver\/[-_A-Za-z0-9]+$/);
    assert.match(fulfillment.deliveryContent, /30 分钟执行/);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("worker pulls payment feed, creates orders once and prepares delivery", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const checkout = createCheckout({ experimentId: experiment.id });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: {
        feedUrl: `${baseUrl}/payments`,
        feedSecret: "secret-123",
      },
    });

    const seeded = await request(mockServer, "/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionId: "feed_tx_001",
        remark: `feed paid ${checkout.paymentRemark}`,
        amount: checkout.amount,
      }),
    });
    assert.equal(seeded.status, 201);

    const sync = await syncPaymentFeed();
    assert.equal(sync.status, "synced");
    assert.equal(sync.seen, 1);
    assert.equal(sync.created, 1);
    assert.equal(loadOutbox().length, 1);
    assert.match(loadOutbox()[0].deliveryUrl, /^https:\/\/money\.example\/deliver\/[-_A-Za-z0-9]+$/);

    const repeated = await syncPaymentFeed();
    assert.equal(repeated.seen, 1);
    assert.equal(repeated.created, 0);
    assert.equal(repeated.duplicates, 1);
    assert.equal(loadOutbox().length, 1);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("payment feed can be read from a local json file", async () => {
  const restore = snapshotData();
  const feedFile = path.join(dataDir, "payment-feed.json");
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    const checkout = createCheckout({ experimentId: experiment.id });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: { feedFile },
    });
    fs.writeFileSync(
      feedFile,
      JSON.stringify({
        payments: [
          {
            transactionId: "file_tx_001",
            remark: `file paid ${checkout.paymentRemark}`,
            amount: checkout.amount,
          },
        ],
      })
    );

    const health = await checkAdapterHealth();
    const paymentCheck = health.checks.find((item) => item.id === "payment-feed-file");
    assert.equal(paymentCheck.reachable, true);

    const sync = await syncPaymentFeed();
    assert.equal(sync.status, "synced");
    assert.equal(sync.localSeen, 1);
    assert.equal(sync.created, 1);
    assert.equal(sync.results[0].feedFile, feedFile);
    assert.equal(loadOutbox().length, 1);

    const repeated = await syncPaymentFeed();
    assert.equal(repeated.created, 0);
    assert.equal(repeated.duplicates, 1);
  } finally {
    fs.rmSync(feedFile, { force: true });
    restore();
  }
});

test("payment feed directory parses wechat notification text files", async () => {
  const restore = snapshotData();
  const feedDir = path.join(dataDir, "payment-feed-dir");
  try {
    fs.mkdirSync(feedDir, { recursive: true });
    const result = generateSite({ seed: 20261010, count: 1 });
    const checkout = createCheckout({ experimentId: result.lab[0].id });
    const notification = `微信支付收款到账 ¥${checkout.amount}，付款备注 ${checkout.paymentRemark}，交易单号 wxfile001`;
    fs.writeFileSync(path.join(feedDir, "wechat-notice.txt"), notification);
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: { feedDir },
    });

    const sync = await syncPaymentFeed();
    assert.equal(sync.status, "synced");
    assert.equal(sync.localSeen, 1);
    assert.equal(sync.created, 1);
    assert.equal(loadCheckouts().find((item) => item.id === checkout.id).status, "paid");
    assert.equal(loadOutbox().length, 1);

    const repeated = await syncPaymentFeed();
    assert.equal(repeated.created, 0);
    assert.equal(repeated.duplicates, 1);
  } finally {
    fs.rmSync(feedDir, { recursive: true, force: true });
    restore();
  }
});

test("empty local payment inbox is not reported as an authoritative synced source", async () => {
  const restore = snapshotData();
  const feedDir = path.join(dataDir, "empty-payment-feed-dir");
  try {
    fs.mkdirSync(feedDir, { recursive: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: { feedDir },
    });

    const sync = await syncPaymentFeed();
    assert.equal(sync.status, "waiting-for-authoritative-source");
    assert.equal(sync.seen, 0);
    assert.match(sync.reason, /no-authoritative-producer/);
    const status = systemStatus();
    assert.equal(status.adapters.payments.authoritativeSourceSeen, false);
    assert.equal(status.adapters.payments.sourceStatus, "waiting-for-authoritative-source");
  } finally {
    fs.rmSync(feedDir, { recursive: true, force: true });
    restore();
  }
});

test("production checkout gate refuses to collect money while the authoritative payment inbox is empty", async () => {
  const restore = snapshotData();
  const feedDir = path.join(dataDir, "gated-empty-payment-feed-dir");
  const server = http.createServer(handler);
  try {
    fs.mkdirSync(feedDir, { recursive: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: { feedDir },
    });
    await syncPaymentFeed();
    process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE = "1";
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await request(server, "/api/checkouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: "jobseekers-resume-workbench", variantId: "direct" }),
    });
    assert.equal(response.status, 503);
    assert.match(JSON.parse(response.body.toString("utf8")).error, /暂未开放收款/);
    assert.equal(loadCheckouts().length, 0);
  } finally {
    delete process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE;
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(feedDir, { recursive: true, force: true });
    restore();
  }
});

test("public commerce readiness disables checkout without exposing payment internals", async () => {
  const restore = snapshotData();
  const feedDir = path.join(dataDir, "readiness-empty-payment-feed-dir");
  const server = http.createServer(handler);
  try {
    fs.mkdirSync(feedDir, { recursive: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: { feedDir },
    });
    await syncPaymentFeed();
    process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE = "1";
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await request(server, "/api/commerce-readiness");
    const body = JSON.parse(response.body.toString("utf8"));
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.checkoutEnabled, true);
    assert.equal(body.checkoutMode, "manual-wechat");
    assert.equal(body.manualWechatEnabled, true);
    assert.equal(body.automaticCheckoutEnabled, false);
    assert.equal(body.paymentSourceStatus, "waiting");
    assert.match(body.message, /手机管理端/);
    assert.doesNotMatch(response.body.toString("utf8"), /feedDir|webhookSecret|payment-inbox/);
  } finally {
    delete process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE;
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(feedDir, { recursive: true, force: true });
    restore();
  }
});

test("adapter health distinguishes configured but unreachable endpoints", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {
        "wechat-moments": { webhookUrl: `${baseUrl}/publish/wechat` },
      },
      growthWebhooks: [{ id: "growth-router", channels: ["*"], webhookUrl: `${baseUrl}/growth/router` }],
      fulfillment: { webhookUrl: `${baseUrl}/fulfillment` },
      payments: { feedUrl: `${baseUrl}/payments` },
      deploy: { webhookUrl: `${baseUrl}/deploy` },
    });
    const healthy = await checkAdapterHealth();
    assert.equal(healthy.configured, 6);
    assert.equal(healthy.reachable, 6);
    assert.equal(healthy.blocked, 0);
    assert.equal(healthy.checks.some((item) => item.kind === "public-access" && item.reachable), true);

    await new Promise((resolve) => mockServer.close(resolve));
    const unreachable = await checkAdapterHealth();
    assert.equal(unreachable.configured, 6);
    assert.equal(unreachable.reachable, 1);
    assert.equal(unreachable.blocked, 5);
    assert.equal(unreachable.checks.some((item) => item.kind === "public-access" && item.reachable), true);
    assert.equal(systemStatus().adapterHealth.blocked, 5);
  } finally {
    if (mockServer.listening) await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("adapter readiness can be generated from environment variables", () => {
  const restore = snapshotData();
  try {
    const configured = configureAdaptersFromEnv({
      PUBLIC_BASE_URL: "https://money.example",
      DEPLOY_WEBHOOK_URL: "https://deploy.example/hook",
      DEPLOY_TARGET_DIR: path.join(dataDir, "deploy-target"),
      DEPLOY_PUBLIC_BASE_URL: "https://static.example",
      GROWTH_WEBHOOK_URL: "https://growth.example/hook",
      GROWTH_OUTBOX_DIR: path.join(dataDir, "growth-outbox"),
      GROWTH_OUTBOX_CHANNELS: "xhs-note,zhihu-answer",
      FULFILLMENT_WEBHOOK_URL: "https://fulfillment.example/hook",
      FULFILLMENT_OUTBOX_DIR: path.join(dataDir, "fulfillment-outbox"),
      PAYMENTS_FEED_URL: "https://payments.example/feed",
      PAYMENTS_FEED_FILE: path.join(dataDir, "payments.json"),
      PAYMENTS_FEED_DIR: path.join(dataDir, "payment-notices"),
      PAYMENT_WEBHOOK_SECRET: "secret-123",
      INDEXNOW_KEY: "index-key",
    });
    assert.equal(configured.provided.includes("GROWTH_WEBHOOK_URL"), true);
    assert.equal(configured.provided.includes("GROWTH_OUTBOX_DIR"), true);
    assert.equal(configured.provided.includes("FULFILLMENT_OUTBOX_DIR"), true);
    assert.equal(configured.provided.includes("DEPLOY_TARGET_DIR"), true);
    assert.equal(configured.provided.includes("PAYMENTS_FEED_FILE"), true);
    assert.equal(configured.missingCore.length, 0);
    assert.equal(configured.adapters.deploy.targetDir, path.join(dataDir, "deploy-target"));
    assert.equal(configured.adapters.deploy.publicBaseUrl, "https://static.example");
    assert.equal(configured.adapters.growthOutbox.dir, path.join(dataDir, "growth-outbox"));
    assert.deepEqual(configured.adapters.growthOutbox.channels, ["xhs-note", "zhihu-answer"]);
    assert.equal(configured.adapters.fulfillment.outboxDir, path.join(dataDir, "fulfillment-outbox"));
    assert.equal(configured.adapters.payments.feedFile, path.join(dataDir, "payments.json"));
    assert.equal(configured.adapters.payments.feedDir, path.join(dataDir, "payment-notices"));
    const readiness = buildAdapterReadinessPlan();
    assert.equal(readiness.required.every((item) => item.ok), true);
    assert.equal(readiness.commands.configureFromEnv, "node src/cli.js configure-from-env");
  } finally {
    restore();
  }
});

test("local env cannot downgrade an existing public URL to localhost", () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://public.example",
      deploy: { publicBaseUrl: "https://public.example", targetDir: path.join(dataDir, "existing-target") },
      channels: {},
      growthWebhooks: [],
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const configured = configureAdaptersFromEnv({
      PUBLIC_BASE_URL: "http://127.0.0.1:4188",
      DEPLOY_PUBLIC_BASE_URL: "http://127.0.0.1:4188",
      DEPLOY_TARGET_DIR: path.join(dataDir, "deploy-target"),
    });
    assert.equal(configured.adapters.publicBaseUrl, "https://public.example");
    assert.equal(configured.adapters.deploy.publicBaseUrl, "https://public.example");
    assert.equal(configured.adapters.deploy.targetDir, path.join(dataDir, "deploy-target"));
  } finally {
    restore();
  }
});

test("bootstrap local loop creates runnable directories and adapters", async () => {
  const restore = snapshotData();
  const rootDir = path.join(dataDir, "local-loop-test");
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
    const summary = bootstrapLocalLoop({
      rootDir,
      publicBaseUrl: "http://127.0.0.1:4188",
      preserveExisting: false,
    });
    assert.equal(fs.existsSync(summary.directories.site), true);
    assert.equal(fs.existsSync(summary.directories.growthOutbox), true);
    assert.equal(fs.existsSync(summary.directories.growthResults), true);
    assert.equal(fs.existsSync(summary.directories.paymentInbox), true);
    assert.equal(fs.existsSync(summary.directories.fulfillmentOutbox), true);
    assert.equal(fs.existsSync(summary.directories.fulfillmentResults), true);
    assert.equal(fs.existsSync(summary.envFile), true);
    assert.equal(summary.adapters.deploy.targetDir, summary.directories.site);
    assert.equal(summary.adapters.growthOutbox.dir, summary.directories.growthOutbox);
    assert.equal(summary.adapters.growthOutbox.resultsDir, summary.directories.growthResults);
    assert.equal(summary.adapters.payments.feedDir, summary.directories.paymentInbox);
    assert.match(summary.adapters.payments.webhookSecret, /^pay_/);
    assert.equal(summary.adapters.fulfillment.outboxDir, summary.directories.fulfillmentOutbox);
    assert.equal(summary.adapters.fulfillment.resultsDir, summary.directories.fulfillmentResults);
    assert.match(fs.readFileSync(summary.envFile, "utf8"), /PAYMENT_WEBHOOK_SECRET="pay_/);

    const health = await checkAdapterHealth();
    assert.equal(health.checks.some((item) => item.id === "deploy-target-dir" && item.reachable), true);
    assert.equal(health.checks.some((item) => item.kind === "growth-outbox" && item.reachable), true);
    assert.equal(health.checks.some((item) => item.id === "payment-feed-dir" && item.reachable), true);
    assert.equal(health.checks.some((item) => item.id === "fulfillment-outbox" && item.reachable), true);
    const readiness = buildAdapterReadinessPlan();
    assert.equal(readiness.required.every((item) => item.ok), true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    restore();
  }
});

test("local result inboxes update publish queue and fulfillment state", () => {
  const restore = snapshotData();
  const rootDir = path.join(dataDir, "result-inbox-test");
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
    const summary = bootstrapLocalLoop({
      rootDir,
      publicBaseUrl: "https://money.example",
      preserveExisting: false,
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(site.lab));
    const task = loadPublishQueue()[0];
    const order = recordOrder({ experimentId: site.lab[0].id, amount: site.lab[0].price, payerNote: "paid" });
    prepareDeliveryOutbox();

    fs.writeFileSync(
      path.join(summary.directories.growthResults, "publish-result.json"),
      JSON.stringify({ taskId: task.id, status: "published", externalUrl: "https://social.example/post/1", workerId: "local-rpa" }, null, 2)
    );
    fs.writeFileSync(
      path.join(summary.directories.fulfillmentResults, "fulfillment-result.json"),
      JSON.stringify({ orderId: order.id, status: "delivered", sentTo: "buyer@example.test", messageId: "msg_001" }, null, 2)
    );

    const sync = consumeResultInboxes();
    assert.equal(sync.consumed, 2);
    assert.equal(sync.failed, 0);
    assert.equal(loadPublishQueue().find((item) => item.id === task.id).externalUrl, "https://social.example/post/1");
    assert.equal(loadOrders().find((item) => item.id === order.id).status, "delivered");
    assert.equal(loadOutbox().find((item) => item.orderId === order.id).status, "sent");
    assert.equal(fs.existsSync(path.join(summary.directories.growthResults, "publish-result.consumed.json")), true);
    assert.equal(fs.existsSync(path.join(summary.directories.fulfillmentResults, "fulfillment-result.consumed.json")), true);
    assert.equal(systemStatus().lastResultSync.consumed, 2);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    restore();
  }
});

test("stale growth results are archived without blocking current publish queue", () => {
  const restore = snapshotData();
  const rootDir = path.join(dataDir, "stale-growth-result-test");
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
    const summary = bootstrapLocalLoop({
      rootDir,
      publicBaseUrl: "https://money.example",
      preserveExisting: false,
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue(site.lab));
    const task = loadPublishQueue()[0];

    fs.writeFileSync(
      path.join(summary.directories.growthResults, "stale-publish-result.json"),
      JSON.stringify(
        {
          taskId: "pub_previous-product_wechat-moments",
          status: "published",
          externalUrl: "https://social.example/stale",
          workerId: "old-local-rpa",
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(summary.directories.growthResults, "current-publish-result.json"),
      JSON.stringify(
        {
          taskId: task.id,
          status: "published",
          externalUrl: "https://social.example/current",
          workerId: "local-rpa",
        },
        null,
        2
      )
    );

    const sync = consumeResultInboxes();
    assert.equal(sync.growth.consumed, 1);
    assert.equal(sync.growth.stale, 1);
    assert.equal(sync.growth.failed, 0);
    assert.equal(loadPublishQueue().find((item) => item.id === task.id).externalUrl, "https://social.example/current");
    assert.equal(fs.existsSync(path.join(summary.directories.growthResults, "stale-publish-result.stale.json")), true);
    assert.equal(fs.existsSync(path.join(summary.directories.growthResults, "current-publish-result.consumed.json")), true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    restore();
  }
});

test("newer growth outbox files are processed even when an older archive exists", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "archive-collision-growth-outbox");
  const growthResultsDir = path.join(dataDir, "archive-collision-growth-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthOutboxDir, { recursive: true });
    const site = generateSite({ seed: 20261010, count: 1 });
    const task = buildPublishQueue(site.lab)[0];
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });

    const archivedFile = path.join(growthOutboxDir, `${task.id}.published.json`);
    fs.writeFileSync(archivedFile, JSON.stringify({ taskId: task.id, archived: true }, null, 2));
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(archivedFile, oldTime, oldTime);

    const sent = await publishQueuedTasks();
    assert.equal(sent.results[0].status, "handed-off");
    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 3);
    assert.equal(owned.results[0].taskId, task.id);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("owned site publisher refreshes already published syndication pages after template changes", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "refresh-owned-site-outbox");
  const growthResultsDir = path.join(dataDir, "refresh-owned-site-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthOutboxDir, { recursive: true });
    const site = generateSite({ seed: 20261010, count: 1 });
    const task = buildPublishQueue(site.lab)[0];
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });
    const payload = {
      type: "publish",
      channel: task.channel,
      experimentId: task.experimentId,
      taskId: task.id,
      trackingUrl: task.trackingUrl,
      originalTrackingUrl: task.trackingUrl,
      optimizedVariantId: "proof",
      text: task.text,
    };
    const archiveFile = path.join(growthOutboxDir, `${task.id}.published.json`);
    fs.writeFileSync(archiveFile, JSON.stringify(payload, null, 2));
    const oldPage = path.join(PUBLIC_SITE_DIR, "syndication", task.channel, `${task.id}.html`);
    fs.mkdirSync(path.dirname(oldPage), { recursive: true });
    fs.writeFileSync(oldPage, "<html><body>old syndication page</body></html>");

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.refreshed, 1);
    assert.equal(owned.published, 0);
    assert.match(loadPublishQueue().find((item) => item.id === task.id).externalUrl, /^https:\/\/money\.example\/syndication\//);
    const refreshedFile = owned.results.find((item) => item.status === "refreshed").written.find((item) => item.includes(`${path.sep}public-site${path.sep}`));
    const refreshed = fs.readFileSync(refreshedFile, "utf8");
    assert.match(refreshed, /data-direct-create-checkout/);
    assert.match(refreshed, /direct-checkout-session:syndication:/);
    assert.match(refreshed, /\/api\/checkouts/);
    assert.doesNotMatch(refreshed, /data-engagement-autostart/);
    assert.doesNotMatch(refreshed, /startEngagedCheckout/);
    assert.doesNotMatch(refreshed, /setTimeout\(\(\) => ensureDirectCheckout/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("owned site publisher publishes local draft queue with starter payment fallback", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "local-owned-site-outbox");
  const growthResultsDir = path.join(dataDir, "local-owned-site-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    exportLocalPublishDrafts(buildPublishQueue(site.lab));
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 3);
    assert.equal(owned.results.every((item) => item.status === "published-local"), true);
    assert.equal(loadPublishQueue().every((item) => item.status === "sent" && item.externalUrl.includes("/syndication/")), true);
    const html = fs.readFileSync(owned.results[0].written.find((item) => item.includes(`${path.sep}public-site${path.sep}`)), "utf8");
    assert.match(html, /程序推荐入口：免费工具页/);
    assert.match(html, new RegExp(`${experiment.id}#STARTER`));
    assert.match(html, /分发页直接兜底收款/);
    assert.match(html, /data-static-payment-proof-form/);
    assert.match(html, /提交到账文本自动取货/);
    assert.match(html, /\/api\/wechat-notify/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("owned site publisher refresh uses current queue routing instead of stale archived tracking url", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "refresh-current-routing-outbox");
  const growthResultsDir = path.join(dataDir, "refresh-current-routing-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthOutboxDir, { recursive: true });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    const task = buildPublishQueue(site.lab).find((item) => item.channel === "wechat-moments");
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });
    fs.writeFileSync(
      path.join(growthOutboxDir, `${task.id}.published.json`),
      JSON.stringify(
        {
          type: "publish",
          channel: task.channel,
          experimentId: task.experimentId,
          taskId: task.id,
          trackingUrl: `https://money.example/t/${experiment.id}/wechat-moments`,
          originalTrackingUrl: `https://money.example/t/${experiment.id}/wechat-moments`,
          text: "旧归档文本",
        },
        null,
        2
      )
    );

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.refreshed, 1);
    const refreshedFile = owned.results.find((item) => item.status === "refreshed").written.find((item) => item.includes(`${path.sep}public-site${path.sep}`));
    const refreshed = fs.readFileSync(refreshedFile, "utf8");
    assert.match(refreshed, /程序推荐入口：免费工具页/);
    assert.match(refreshed, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html`));
    assert.doesNotMatch(refreshed, /程序推荐入口：追踪成交页/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("owned site publisher keeps optimization republish payload over older published payload", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "optimization-refresh-growth-outbox");
  const growthResultsDir = path.join(dataDir, "optimization-refresh-growth-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthOutboxDir, { recursive: true });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    const task = buildPublishQueue(site.lab).find((item) => item.channel === "wechat-moments");
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });

    fs.writeFileSync(
      path.join(growthOutboxDir, `${task.id}.published.json`),
      JSON.stringify(
        {
          type: "publish",
          channel: task.channel,
          experimentId: task.experimentId,
          taskId: task.id,
          trackingUrl: `https://money.example/offer/${experiment.id}--proof.html`,
          directBuyUrl: `https://money.example/buy/${experiment.id}/proof?source=publish%3Awechat-moments`,
          optimizedVariantId: "proof",
          text: "旧发布包",
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(growthOutboxDir, `${task.id}.optimization.published.json`),
      JSON.stringify(
        {
          type: "optimization-republish",
          channel: task.channel,
          experimentId: task.experimentId,
          taskId: task.id,
          trackingUrl: `https://money.example/rescue/${experiment.id}.html`,
          directBuyUrl: `https://money.example/buy/${experiment.id}/pain?source=publish%3Awechat-moments`,
          optimizedVariantId: "pain",
          republishSource: "automatic-view-rewrite",
          text: "优化后发布包\n\n直接购买并生成付款备注：https://money.example/buy/",
        },
        null,
        2
      )
    );

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.refreshed, 1);
    const refreshedFile = owned.results.find((item) => item.status === "refreshed").written.find((item) => item.includes(`${path.sep}public-site${path.sep}`));
    const refreshed = fs.readFileSync(refreshedFile, "utf8");
    assert.match(refreshed, /优化后发布包/);
    assert.match(refreshed, /\/rescue\//);
    assert.match(refreshed, /\/pain\?source=syndication%3Awechat-moments/);
    assert.doesNotMatch(refreshed, /旧发布包/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("owned site publisher archives stale outbox packages without publishing them", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "stale-owned-site-outbox");
  const growthResultsDir = path.join(dataDir, "stale-owned-site-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthOutboxDir, { recursive: true });
    buildPublishQueue(generateSite({ seed: 20261010, count: 1 }).lab);
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });
    fs.writeFileSync(
      path.join(growthOutboxDir, "pub_old-product_wechat-moments.json"),
      JSON.stringify(
        {
          taskId: "pub_old-product_wechat-moments",
          channel: "wechat-moments",
          experimentId: "old-product",
          text: "old stale package",
          trackingUrl: "https://money.example/t/old-product/wechat-moments",
        },
        null,
        2
      )
    );

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 0);
    assert.equal(owned.stale, 1);
    assert.equal(fs.existsSync(path.join(growthOutboxDir, "pub_old-product_wechat-moments.stale.json")), true);
    assert.equal(fs.readdirSync(growthResultsDir).length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("local loop runner consumes payment and result inboxes without manual state edits", async () => {
  const restore = snapshotData();
  const rootDir = path.join(dataDir, "local-loop-runner-test");
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
    const summary = bootstrapLocalLoop({
      rootDir,
      publicBaseUrl: "https://money.example",
      preserveExisting: false,
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const checkout = createCheckout({ experimentId: site.lab[0].id });
    fs.writeFileSync(
      path.join(summary.directories.paymentInbox, "wechat-notice.txt"),
      `微信支付收款到账 ¥${checkout.amount}，付款备注 ${checkout.paymentRemark}，交易单号 wx_loop_001`
    );

    const first = await runLocalLoopOnce();
    assert.equal(first.paymentsCreated, 1);
    assert.equal(loadCheckouts().find((item) => item.id === checkout.id).status, "paid");
    const delivery = loadOutbox().find((item) => item.orderId === loadCheckouts().find((item) => item.id === checkout.id).orderId);
    assert.equal(delivery.status, "handed-off");
    assert.equal(fs.existsSync(path.join(summary.directories.fulfillmentOutbox, `${delivery.orderId}.json`)), true);

    fs.writeFileSync(
      path.join(summary.directories.fulfillmentResults, "delivery-result.json"),
      JSON.stringify({ orderId: delivery.orderId, status: "delivered", messageId: "msg_loop_001" }, null, 2)
    );
    const second = await runLocalLoopOnce();
    assert.equal(second.resultsConsumed >= 1, true);
    assert.equal(loadOrders().find((item) => item.id === delivery.orderId).status, "delivered");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    restore();
  }
});

test("local loop watcher triggers when inbox files appear", async () => {
  const restore = snapshotData();
  const rootDir = path.join(dataDir, "local-loop-watcher-test");
  let watcher = null;
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
    const summary = bootstrapLocalLoop({
      rootDir,
      publicBaseUrl: "https://money.example",
      preserveExisting: false,
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const checkout = createCheckout({ experimentId: site.lab[0].id });
    watcher = startLocalLoopWatcher({ debounceMs: 50 });
    assert.equal(watcher.directories.length, 3);
    fs.writeFileSync(
      path.join(summary.directories.paymentInbox, "watcher-notice.txt"),
      `微信支付收款到账 ¥${checkout.amount}，付款备注 ${checkout.paymentRemark}，交易单号 wx_watch_001`
    );
    const paidCheckout = await waitUntil(() => loadCheckouts().find((item) => item.id === checkout.id && item.status === "paid"), { timeoutMs: 5000 });
    assert.equal(Boolean(paidCheckout), true);
    const idleState = await waitUntil(
      () => {
      const state = loadLocalLoopWatcher();
      return state?.status === "idle" && state?.lastSummary?.paymentsCreated >= 1 ? state : null;
      },
      { timeoutMs: 5000 }
    );
    assert.equal(Boolean(idleState), true);
  } finally {
    if (watcher) watcher.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
    restore();
  }
});

test("opportunity scan turns external signals into product experiments", async () => {
  const restore = snapshotData();
  const sourceServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        items: [
          { title: "AI 简历改写突然爆火", description: "求职者需要把真实经历改成岗位匹配表达", score: 88 },
          { title: "小店老板缺团购内容日历", description: "本地商家要每天发内容获客", score: 65 },
        ],
      })
    );
  });
  await new Promise((resolve) => sourceServer.listen(0, "127.0.0.1", resolve));
  const sourceUrl = `http://127.0.0.1:${sourceServer.address().port}/trends.json`;
  try {
    saveAdapters({ opportunitySources: [{ id: "trend-json", type: "json", url: sourceUrl, weight: 2 }] });
    const scan = await scanOpportunitySources();
    assert.equal(scan.status, "ok");
    assert.equal(scan.signals.length, 2);
    assert.equal(loadOpportunitySignals().signals[0].sourceId, "trend-json");

    const lab = buildLab({ seed: 20261012, count: 4 });
    assert.equal(lab.some((item) => item.id.startsWith("opportunity-")), true);
    assert.equal(lab[0].opportunitySourceId, "trend-json");
    assert.match(lab[0].title, /简历项目经历真实改写清单|小店内容日历和团购回复模板/);
    assert.equal(lab.filter((item) => item.id.startsWith("opportunity-")).every((item) => item.buyer && item.pain && item.whyBuy), true);
  } finally {
    await new Promise((resolve) => sourceServer.close(resolve));
    restore();
  }
});

test("opportunity scan can use default public sources before falling back to seeds", async () => {
  const restore = snapshotData();
  const sourceServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/rss+xml" });
    res.end(`<?xml version="1.0"?>
<rss><channel>
  <item><title>Show HN: Excel automation helper for weekly reports</title><description>Office workers need a small tool to convert messy sheets into weekly summaries.</description><link>https://example.test/weekly</link></item>
  <item><title>AI resume bullet checker</title><description>Job seekers need a fast checklist for truthful resume bullets.</description><link>https://example.test/resume</link></item>
</channel></rss>`);
  });
  await new Promise((resolve) => sourceServer.listen(0, "127.0.0.1", resolve));
  const sourceUrl = `http://127.0.0.1:${sourceServer.address().port}/rss.xml`;
  try {
    const scan = await scanOpportunitySources({
      sources: [],
      useDefaultSources: true,
      defaultSources: [{ id: "test-default-rss", type: "rss", url: sourceUrl, weight: 2 }],
      seed: 20261012,
    });
    assert.equal(scan.status, "ok");
    assert.equal(scan.defaultSourcesUsed, true);
    assert.equal(scan.sources[0].id, "test-default-rss");
    assert.equal(scan.signals.length, 12);
    assert.equal(scan.sources.some((item) => item.id === "internal-seed" && item.status === "supplemental"), true);
    assert.equal(scan.signals.some((item) => item.supplemental), true);
    assert.equal(loadOpportunitySignals().signals[0].sourceId, "test-default-rss");
    assert.equal(scan.signals.some((item) => item.keyword === "Excel 周报自动整理工具包"), true);
    assert.equal(scan.signals.some((item) => item.keyword === "简历项目经历真实改写清单"), true);
    assert.equal(scan.signals.every((item) => !/show hn/i.test(item.keyword)), true);
  } finally {
    await new Promise((resolve) => sourceServer.close(resolve));
    restore();
  }
});

test("opportunity scan rewrites repo-like trends into buyer needs", async () => {
  const restore = snapshotData();
  const sourceServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/rss+xml" });
    res.end(`<?xml version="1.0"?>
<rss><channel>
  <item><title>morluto/rea</title><description><![CDATA[<p>Reverse engineer anything with agents, from app behavior down to native binaries.</p>]]></description><link>https://github.com/morluto/rea</link></item>
</channel></rss>`);
  });
  await new Promise((resolve) => sourceServer.listen(0, "127.0.0.1", resolve));
  const sourceUrl = `http://127.0.0.1:${sourceServer.address().port}/rss.xml`;
  try {
    const scan = await scanOpportunitySources({
      sources: [{ id: "repo-rss", type: "rss", url: sourceUrl }],
      seed: 20261012,
    });
    assert.equal(scan.status, "ok");
    assert.equal(scan.signals[0].keyword, "逆向分析入门检查清单");
    assert.match(scan.signals[0].buyer, /开发者/);
    assert.match(scan.signals[0].pain, /不知道/);
    assert.equal(scan.signals[0].offerTypeId, "checklist");

    const lab = buildLab({ seed: 20261012, count: 4 });
    const opportunity = lab.find((item) => item.opportunityKeyword === "逆向分析入门检查清单");
    assert.equal(Boolean(opportunity), true);
    assert.match(opportunity.title, /逆向分析入门检查清单/);
    assert.match(opportunity.buyer, /开发者/);
  } finally {
    await new Promise((resolve) => sourceServer.close(resolve));
    restore();
  }
});

test("opportunity scan filters generic repo readmes without a buyer need", async () => {
  const restore = snapshotData();
  const sourceServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/rss+xml" });
    res.end(`<?xml version="1.0"?>
<rss><channel>
  <item><title>An Open Source Machine Learning Framework for Everyone</title><description>Documentation TensorFlow is an end-to-end open source platform for machine learning. Install TensorFlow with pip and browse tutorials.</description><link>https://github.com/tensorflow/tensorflow</link></item>
  <item><title>Show HN: Excel automation helper for weekly reports</title><description>Office workers need a small tool to convert messy sheets into weekly summaries.</description><link>https://example.test/weekly</link></item>
</channel></rss>`);
  });
  await new Promise((resolve) => sourceServer.listen(0, "127.0.0.1", resolve));
  const sourceUrl = `http://127.0.0.1:${sourceServer.address().port}/rss.xml`;
  try {
    const scan = await scanOpportunitySources({
      sources: [{ id: "generic-repo-rss", type: "rss", url: sourceUrl }],
      seed: 20261012,
    });
    assert.equal(scan.status, "ok");
    assert.equal(scan.signals.some((item) => /tensorflow|machine learning framework/i.test(`${item.keyword} ${item.title}`)), false);
    assert.equal(scan.signals.some((item) => item.keyword === "Excel 周报自动整理工具包"), true);
    assert.equal(scan.signals.every((item) => item.buyer && item.pain && item.spendReason), true);
  } finally {
    await new Promise((resolve) => sourceServer.close(resolve));
    restore();
  }
});

test("stale generic opportunity signals are ignored when building products", () => {
  const restore = snapshotData();
  try {
    fs.writeFileSync(
      path.join(dataDir, "opportunity-signals.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          status: "ok",
          sources: [{ id: "github-trending-rss", status: "ok", items: 2 }],
          signals: [
            {
              id: "opp_tensorflow",
              sourceId: "github-trending-rss",
              keyword: "An Open Source Machine Learning Framework for Everyone",
              title: "An Open Source Machine Learning Framework for Everyone",
              summary: "Documentation TensorFlow is an end-to-end open source platform for machine learning. Install TensorFlow with pip and browse tutorials.",
              url: "https://github.com/tensorflow/tensorflow",
              score: 99,
              marketId: "solo-creators",
              offerTypeId: "prompt-system",
              buyer: "",
              pain: "",
              spendReason: "",
            },
            {
              id: "opp_excel",
              sourceId: "hn-show-rss",
              keyword: "Excel 周报自动整理工具包",
              title: "Excel 周报自动整理工具包",
              summary: "Office workers need a small tool to convert messy sheets into weekly summaries.",
              score: 20,
              marketId: "office-workers",
              offerTypeId: "micro-tool",
              buyer: "每周要从表格和聊天记录里整理周报的办公室人群",
              pain: "表格来源杂、字段乱、每周都要重复整理。",
              spendReason: "买的是可复制的表格字段映射、周报脚本说明和脱敏样例。",
            },
          ],
        },
        null,
        2
      )
    );

    const lab = buildLab({ seed: 20261012, count: 4 });
    assert.equal(lab.some((item) => /tensorflow|machine learning framework/i.test(`${item.title} ${item.opportunity?.keyword || ""}`)), false);
    assert.equal(lab.some((item) => item.opportunityKeyword === "Excel 周报自动整理工具包"), true);
    assert.equal(lab.filter((item) => item.id.startsWith("opportunity-")).every((item) => item.buyer && item.pain && item.whyBuy), true);
  } finally {
    restore();
  }
});

test("opportunity scan uses labeled internal seeds when no external source is configured", async () => {
  const restore = snapshotData();
  try {
    const scan = await scanOpportunitySources({ seed: 20261012, useDefaultSources: false });
    assert.equal(scan.status, "seeded");
    assert.equal(scan.signals.length > 0, true);
    assert.equal(scan.signals.every((item) => item.seeded), true);
    assert.equal(scan.signals.every((item) => item.buyer && item.pain && item.spendReason), true);

    const lab = buildLab({ seed: 20261012, count: 4 });
    assert.equal(lab.some((item) => item.id.startsWith("opportunity-")), true);
    assert.equal(lab.filter((item) => item.id.startsWith("opportunity-")).every((item) => item.buyer && item.pain && item.whyBuy), true);
    const plan = buildActionPlan();
    assert.equal(plan.actions.some((item) => item.type === "scan-opportunities"), false);
  } finally {
    restore();
  }
});

test("traffic plan ranks opportunity products and annotates publish queue priorities", async () => {
  const restore = snapshotData();
  try {
    await scanOpportunitySources({ seed: 20261012 });
    const site = generateSite({ seed: 20261012, count: 4 });
    const plan = buildTrafficPlan({ lab: site.lab, budget: 20 });
    assert.equal(plan.allocations.length, 4);
    assert.equal(plan.allocations[0].experimentId.startsWith("opportunity-"), true);
    assert.equal(plan.allocations[0].channels.some((item) => item.channel === "landing-page" && item.status === "owned"), true);

    const queue = loadPublishQueue();
    assert.equal(queue.length, 12);
    assert.equal(queue.every((item) => typeof item.priority === "number"), true);
    assert.equal(queue[0].priority >= queue[queue.length - 1].priority, true);
    assert.equal(queue.some((item) => item.opportunityKeyword), true);
    assert.equal(loadTrafficPlan().allocations[0].experimentId, plan.allocations[0].experimentId);
  } finally {
    restore();
  }
});

test("traffic plan routes cold-start publishing to interactive utility pages", async () => {
  const restore = snapshotData();
  const growthOutboxDir = fs.mkdtempSync(path.join(dataDir, "growth-sample-outbox-test-"));
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    const lab = buildLab({ seed: 20261010, count: 1 });
    const plan = buildTrafficPlan({ lab, budget: 10 });
    const allocation = plan.allocations.find((item) => item.experimentId === experiment.id);
    assert.equal(allocation.recommendedUtilityIntent.intent, "fit-calculator");
    assert.match(allocation.recommendedUtilityIntent.url, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html$`));

    const queue = buildPublishQueue(lab);
    assert.equal(queue.every((item) => item.recommendedUtilityIntent.intent === "fit-calculator"), true);
    assert.equal(queue.every((item) => item.recommendedUrl.endsWith(`/utilities/${experiment.id}-fit-calculator.html`)), true);
    assert.equal(queue.every((item) => /免费工具页/.test(item.recommendedReason)), true);

    const publish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(publish.results[0].status, "dry-run-ready");
    assert.match(publish.results[0].publishUrl, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html$`));
    assert.match(publish.results[0].optimizedReason, /免费工具页/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    restore();
  }
});

test("traffic plan routes future publishing to utility pages with observed tool visits", async () => {
  const restore = snapshotData();
  const growthOutboxDir = fs.mkdtempSync(path.join(dataDir, "growth-utility-outbox-test-"));
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:utility:starter-builder" });
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:utility:starter-builder" });
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:utility:fit-calculator" });

    const lab = buildLab({ seed: 20261010, count: 1 });
    const plan = buildTrafficPlan({ lab, budget: 10 });
    const allocation = plan.allocations.find((item) => item.experimentId === experiment.id);
    assert.equal(allocation.recommendedUtilityIntent.intent, "starter-builder");
    assert.equal(allocation.recommendedUtilityIntent.views, 2);
    assert.match(allocation.recommendedUtilityIntent.url, /-starter-builder\.html/);

    const queue = buildPublishQueue(lab);
    assert.equal(queue.every((item) => item.recommendedUtilityIntent.intent === "starter-builder"), true);
    assert.equal(queue.every((item) => /-starter-builder\.html/.test(item.recommendedUrl)), true);

    const publish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(publish.results[0].status, "dry-run-ready");
    assert.match(publish.results[0].publishUrl, /-starter-builder\.html/);
    assert.equal(publish.results[0].variantLabel.includes("免费生成一版入门清单"), true);
    assert.match(publish.results[0].optimizedReason, /免费工具页/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    restore();
  }
});

test("owned syndication page makes the current routing recommendation the primary CTA", () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "owned-routing-outbox");
  const growthResultsDir = path.join(dataDir, "owned-routing-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    fs.mkdirSync(growthOutboxDir, { recursive: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    const task = loadPublishQueue().find((item) => item.channel === "wechat-moments");
    fs.writeFileSync(
      path.join(growthOutboxDir, `${task.id}.json`),
      JSON.stringify(
        {
          type: "publish",
          channel: task.channel,
          experimentId: task.experimentId,
          taskId: task.id,
          trackingUrl: `https://money.example/utilities/${experiment.id}-fit-calculator.html`,
          landingUrl: `https://money.example/utilities/${experiment.id}-fit-calculator.html`,
          recommendedReason: "免费工具页用于冷启动筛选真实意图",
          directBuyUrl: `https://money.example/buy/${experiment.id}?source=publish%3Awechat-moments`,
          originalTrackingUrl: `https://money.example/t/${experiment.id}/wechat-moments`,
          text: "自动发布文本",
        },
        null,
        2
      )
    );

    const owned = publishGrowthOutboxToOwnedSite();
    assert.equal(owned.published, 1);
    const html = fs.readFileSync(owned.results[0].written.find((item) => item.includes(`${path.sep}public-site${path.sep}`)), "utf8");
    const sampleIndex = html.indexOf("打开免费工具");
    const buyIndex = html.indexOf("已经决定购买：生成付款备注");
    assert.equal(sampleIndex >= 0, true);
    assert.equal(buyIndex >= 0, true);
    assert.equal(sampleIndex < buyIndex, true);
    assert.match(html, /程序推荐入口：免费工具页/);
    assert.match(html, /冷启动筛选真实意图/);
    assert.match(html, new RegExp(`href="https://money\\.example/utilities/${experiment.id}-fit-calculator\\.html"`));
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("traffic plan routes future publishing to long-tail pages with observed visits", async () => {
  const restore = snapshotData();
  const growthOutboxDir = fs.mkdtempSync(path.join(dataDir, "growth-outbox-test-"));
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:seo:tonight-delivery" });
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:seo:tonight-delivery" });
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:seo:examples" });

    const lab = buildLab({ seed: 20261010, count: 1 });
    const plan = buildTrafficPlan({ lab, budget: 10 });
    const allocation = plan.allocations.find((item) => item.experimentId === experiment.id);
    assert.equal(allocation.recommendedSeoIntent.intent, "tonight-delivery");
    assert.equal(allocation.recommendedSeoIntent.views, 2);
    assert.match(allocation.recommendedSeoIntent.url, /-tonight-delivery\.html/);

    const queue = buildPublishQueue(lab);
    assert.equal(queue.every((item) => item.recommendedSeoIntent.intent === "tonight-delivery"), true);
    assert.equal(queue.every((item) => /-tonight-delivery\.html/.test(item.recommendedUrl)), true);

    const publish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(publish.results[0].status, "dry-run-ready");
    assert.match(publish.results[0].publishUrl, /-tonight-delivery\.html/);
    assert.equal(publish.results[0].variantLabel.includes("今晚就要用"), true);
    assert.match(publish.results[0].optimizedReason, /长尾页/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    restore();
  }
});

test("traffic plan routes future publishing to hub pages with observed buyer entry visits", async () => {
  const restore = snapshotData();
  const growthOutboxDir = fs.mkdtempSync(path.join(dataDir, "growth-hub-outbox-test-"));
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    appendEvent({ type: "view", experimentId: `hub:market:${experiment.marketId}`, channel: `server:hub:market:${experiment.marketId}` });
    appendEvent({ type: "view", experimentId: `hub:market:${experiment.marketId}`, channel: `server:hub:market:${experiment.marketId}` });
    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:seo:tonight-delivery" });

    const lab = buildLab({ seed: 20261010, count: 1 });
    const plan = buildTrafficPlan({ lab, budget: 10 });
    const allocation = plan.allocations.find((item) => item.experimentId === experiment.id);
    assert.equal(allocation.recommendedHubPage.kind, "market");
    assert.equal(allocation.recommendedHubPage.id, experiment.marketId);
    assert.equal(allocation.recommendedHubPage.views, 2);
    assert.match(allocation.recommendedHubPage.url, new RegExp(`/markets/${experiment.marketId}\\.html$`));
    assert.equal(allocation.recommendedSeoIntent.intent, "tonight-delivery");

    const queue = buildPublishQueue(lab);
    assert.equal(queue.every((item) => item.recommendedHubPage.id === experiment.marketId), true);
    assert.equal(queue.every((item) => item.recommendedUrl.endsWith(`/markets/${experiment.marketId}.html`)), true);
    assert.equal(queue.every((item) => /聚合入口页/.test(item.recommendedReason)), true);

    const publish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(publish.results[0].status, "dry-run-ready");
    assert.match(publish.results[0].publishUrl, new RegExp(`/markets/${experiment.marketId}\\.html$`));
    assert.equal(publish.results[0].variantLabel.includes("今天能买的现成包"), true);
    assert.match(publish.results[0].optimizedReason, /聚合入口页/);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    restore();
  }
});

test("publish queue reopens sent tasks when long-tail recommendation changes", () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: path.join(dataDir, "growth-outbox-reopen"), channels: ["*"] },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    const sentQueue = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      recommendedUrl: task.trackingUrl,
      sentAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sentQueue, null, 2));

    appendEvent({ type: "view", experimentId: experiment.id, channel: "server:seo:tonight-delivery" });
    const lab = buildLab({ seed: 20261010, count: 1 });
    const reopened = buildPublishQueue(lab).filter((task) => task.experimentId === experiment.id);
    assert.equal(reopened.every((item) => item.status === "waiting-for-account-authorization"), true);
    assert.equal(reopened.every((item) => /recommended-url-changed/.test(item.republishReason)), true);
    assert.equal(reopened.every((item) => /-tonight-delivery\.html/.test(item.recommendedUrl)), true);
  } finally {
    fs.rmSync(path.join(dataDir, "growth-outbox-reopen"), { recursive: true, force: true });
    restore();
  }
});

test("publish result metadata does not overwrite current sample routing", () => {
  const restore = snapshotData();
  const resultsDir = path.join(dataDir, "growth-result-routing");
  const outboxDir = path.join(dataDir, "growth-result-routing-outbox");
  try {
    fs.rmSync(resultsDir, { recursive: true, force: true });
    fs.rmSync(outboxDir, { recursive: true, force: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(outboxDir, { recursive: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: outboxDir, resultsDir, channels: ["*"] },
      fulfillment: {},
      payments: {},
    });
    const site = generateSite({ seed: 20261010, count: 1 });
    const experiment = site.lab[0];
    const task = loadPublishQueue().find((item) => item.experimentId === experiment.id && item.channel === "wechat-moments");
    const oldQueue = loadPublishQueue().map((item) =>
      item.id === task.id
        ? {
            ...item,
            status: "sent",
            recommendedUrl: item.trackingUrl,
            recommendedReason: "",
            sentAt: "2026-10-10T00:00:00.000Z",
          }
        : item
    );
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(oldQueue, null, 2));
    fs.writeFileSync(
      path.join(resultsDir, `${task.id}.json`),
      JSON.stringify(
        {
          taskId: task.id,
          status: "published",
          externalUrl: "https://money.example/syndication/old.html",
          recommendedUrl: task.trackingUrl,
          workerId: "old-publisher",
          publishedAt: "2026-10-10T00:00:00.000Z",
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(outboxDir, `${task.id}.published.json`),
      JSON.stringify(
        {
          taskId: task.id,
          type: "publish",
          status: "published",
          trackingUrl: task.trackingUrl,
          originalTrackingUrl: task.trackingUrl,
          directBuyUrl: "https://money.example/buy/old?source=publish%3Awechat-moments",
        },
        null,
        2
      )
    );

    const rebuilt = buildPublishQueue(buildLab({ seed: 20261010, count: 1 }));
    const updated = rebuilt.find((item) => item.id === task.id);
    assert.equal(updated.status, "waiting-for-account-authorization");
    assert.equal(updated.externalUrl, "https://money.example/syndication/old.html");
    assert.match(updated.recommendedUrl, new RegExp(`/utilities/${experiment.id}-fit-calculator\\.html$`));
    assert.match(updated.recommendedReason, /免费工具页/);
    assert.match(updated.republishReason, /recommended-url-changed/);
  } finally {
    fs.rmSync(resultsDir, { recursive: true, force: true });
    fs.rmSync(outboxDir, { recursive: true, force: true });
    restore();
  }
});

test("execution queue materializes machine tasks from plans and queues", async () => {
  const restore = snapshotData();
  try {
    await scanOpportunitySources({ seed: 20261012 });
    const site = generateSite({ seed: 20261012, count: 4 });
    const queue = buildExecutionQueue({ actionPlan: site.actionPlan, trafficPlan: site.trafficPlan, publishQueue: site.publishQueue });
    assert.equal(queue.tasks.length > site.publishQueue.length, true);
    assert.equal(queue.tasks.some((item) => item.kind === "traffic-allocation"), true);
    assert.equal(queue.tasks.some((item) => item.kind === "publish" && item.status === "blocked"), true);
    assert.equal(queue.tasks[0].priority >= queue.tasks[queue.tasks.length - 1].priority, true);
    assert.equal(loadExecutionQueue().tasks.length, queue.tasks.length);
    assert.equal(systemStatus().executionQueue.tasks.length, queue.tasks.length);
  } finally {
    restore();
  }
});

test("execution queue does not republish tasks already marked sent", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: path.join(dataDir, "already-sent-growth-outbox"), resultsDir: path.join(dataDir, "already-sent-growth-results"), channels: ["*"] },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const site = generateSite({ seed: 20261012, count: 2 });
    const sent = loadPublishQueue().map((task) => ({
      ...task,
      status: "sent",
      sentAt: new Date().toISOString(),
      externalUrl: `https://money.example/syndication/${task.id}.html`,
    }));
    fs.writeFileSync(path.join(dataDir, "publish-queue.json"), JSON.stringify(sent, null, 2));

    const lab = buildLab({ seed: 20261012, count: 2 });
    const trafficPlan = buildTrafficPlan({ lab });
    const publishQueue = buildPublishQueue(lab);
    const actionPlan = buildActionPlan({ publishQueue });
    const queue = buildExecutionQueue({ actionPlan, trafficPlan, publishQueue });
    assert.equal(publishQueue.every((task) => task.status === "sent"), true);
    assert.equal(queue.tasks.some((task) => task.kind === "publish" && task.action === "publish-task"), false);
    assert.equal(site.lab.length, 2);
  } finally {
    restore();
  }
});

test("execution queue runner consumes runnable tasks and keeps adapter blockers honest", async () => {
  const restore = snapshotData();
  try {
    await scanOpportunitySources({ seed: 20261012 });
    generateSite({ seed: 20261012, count: 2 });
    const run = await runExecutionQueue({ dryRun: true, limit: 6 });
    assert.match(run.id, /^execution_queue_run_/);
    assert.equal(run.attempted, 6);
    assert.equal(run.executed > 0, true);
    assert.equal(run.blocked > 0, true);
    assert.equal(run.results.some((item) => item.action === "fix-adapter-publish" && item.status === "blocked"), true);
    assert.equal(run.results.some((item) => item.action === "allocate-traffic" && item.status === "executed"), true);
    assert.equal(loadLastExecutionQueueRun().id, run.id);
    assert.equal(loadExecutionQueueHistory().at(-1).id, run.id);
    assert.equal(systemStatus().lastExecutionQueueRun.id, run.id);
  } finally {
    restore();
  }
});

test("local loop execution queue skips external network tasks so inbox processing stays fast", async () => {
  const restore = snapshotData();
  try {
    await scanOpportunitySources({ seed: 20261012, useDefaultSources: false });
    generateSite({ seed: 20261012, count: 2 });
    const local = await runExecutionQueue({ dryRun: true, limit: 20, localOnly: true });
    assert.equal(local.localOnly, true);
    assert.equal(local.results.some((item) => item.action === "allocate-traffic"), true);
    assert.equal(local.results.some((item) => item.action === "scan-opportunities"), false);
    assert.equal(local.results.some((item) => item.action === "submit-search-index"), false);
  } finally {
    restore();
  }
});

test("execution queue can heal public tunnel tasks without manual handoff", async () => {
  const restore = snapshotData();
  try {
    generateSite({ seed: 20261010, count: 1 });
    saveAdapters({
      publicBaseUrl: "http://127.0.0.1:4188",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: path.join(dataDir, "tunnel-growth-outbox") },
      fulfillment: { outboxDir: path.join(dataDir, "tunnel-fulfillment-outbox") },
      payments: { feedDir: path.join(dataDir, "tunnel-payment-inbox"), webhookSecret: "secret" },
      deploy: { targetDir: path.join(dataDir, "tunnel-site"), publicBaseUrl: "http://127.0.0.1:4188" },
    });
    const queue = buildExecutionQueue({ actionPlan: buildActionPlan() });
    const task = queue.tasks.find((item) => item.action === "open-public-tunnel");
    assert.ok(task);
    const result = await runExecutionQueueTask(task, {
      dryRun: false,
      serviceHealer: async () => ({ status: "up", started: false, port: 4188 }),
      publicTunnelStarter: async () => ({
        status: "running",
        provider: "test-tunnel",
        publicUrl: "https://fresh-money.example",
        pid: 12345,
        logFile: path.join(dataDir, "test-public-tunnel.log"),
      }),
    });
    assert.equal(result.action, "open-public-tunnel");
    assert.equal(result.status, "executed");
    assert.equal(result.publicUrl, "https://fresh-money.example");
    assert.equal(loadAdapters().publicBaseUrl, "https://fresh-money.example");
    assert.equal(result.deployStatus, "deployed");
    assert.match(result.submitStatus, /submitted|noop|failed/);
    assert.match(result.command, /public-tunnel/);
  } finally {
    restore();
  }
});

test("search index task heals an unreachable public tunnel and retries", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    const site = generateSite({ seed: 20261010, count: 1 });
    saveAdapters({
      publicBaseUrl: "https://dead-tunnel.tunnelmole.net",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: path.join(dataDir, "search-heal-growth-outbox") },
      fulfillment: { outboxDir: path.join(dataDir, "search-heal-fulfillment-outbox") },
      payments: { feedDir: path.join(dataDir, "search-heal-payment-inbox"), webhookSecret: "secret" },
      deploy: { targetDir: path.join(dataDir, "search-heal-site"), publicBaseUrl: "https://dead-tunnel.tunnelmole.net" },
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "healsearchkey" },
    });
    const task = {
      id: "exec_test_search_heal",
      kind: "action",
      action: "submit-search-index",
      target: "search-index",
      status: "queued",
    };
    const result = await runExecutionQueueTask(task, {
      dryRun: false,
      serviceHealer: async () => ({ status: "up", started: false, port: 4188 }),
      publicTunnelStarter: async () => ({
        status: "running",
        provider: "test-tunnel",
        publicUrl: "https://fresh-money.example",
        pid: 23456,
        logFile: path.join(dataDir, "test-search-heal-tunnel.log"),
      }),
    });
    assert.equal(result.action, "submit-search-index");
    assert.equal(result.status, "executed");
    assert.equal(result.submitStatus, "submitted");
    assert.equal(result.healedPublicAccess.publicUrl, "https://fresh-money.example");
    assert.equal(loadAdapters().publicBaseUrl, "https://fresh-money.example");
    assert.equal(result.deployStatus, "deployed");
    assert.equal(result.submitted > 0, true);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    const indexCall = body.calls.find((item) => item.path === "/indexnow");
    assert.equal(indexCall.body.host, "fresh-money.example");
    assert.equal(indexCall.body.urlList.every((url) => new URL(url).hostname === "fresh-money.example"), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("dead-tunnel.tunnelmole.net")), false);
    assert.equal(site.lab.length, 1);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("execution queue runner sends publish tasks through configured adapters", async () => {
  const restore = snapshotData();
  const webhook = await webhookServer();
  try {
    const site = generateSite({ seed: 20261010, count: 1 });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {
        "wechat-moments": { webhookUrl: `${webhook.baseUrl}/publish/wechat` },
        "xhs-note": { webhookUrl: `${webhook.baseUrl}/publish/xhs` },
        "zhihu-answer": { webhookUrl: `${webhook.baseUrl}/publish/zhihu` },
      },
      growthWebhooks: [],
      fulfillment: {},
      payments: {},
      publishAgent: {},
    });
    const publishQueue = buildPublishQueue(site.lab);
    const queue = buildExecutionQueue({ actionPlan: { at: new Date().toISOString(), actions: [] }, trafficPlan: buildTrafficPlan({ lab: site.lab }), publishQueue });
    assert.equal(queue.tasks.some((item) => item.kind === "publish" && item.status === "queued"), true);
    const run = await runExecutionQueue({ dryRun: false, limit: 4, rebuild: false });
    assert.equal(run.results.some((item) => item.action === "publish-task" && item.status === "executed"), true);
    assert.equal(webhook.calls.filter((item) => item.body.type === "publish-agent").length > 0, true);
  } finally {
    await new Promise((resolve) => webhook.server.close(resolve));
    restore();
  }
});

test("execution queue runner closes local growth outbox publish handoffs in the same task", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "execution-growth-outbox");
  const growthResultsDir = path.join(dataDir, "execution-growth-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    const site = generateSite({ seed: 20261010, count: 1 });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
      publishAgent: {},
    });
    const publishQueue = buildPublishQueue(site.lab);
    const queue = buildExecutionQueue({ actionPlan: { at: new Date().toISOString(), actions: [] }, trafficPlan: buildTrafficPlan({ lab: site.lab }), publishQueue });
    const task = queue.tasks.find((item) => item.action === "publish-task");

    const result = await runExecutionQueueTask(task, { dryRun: false });

    assert.equal(result.status, "executed");
    assert.equal(result.handedOff, 1);
    assert.equal(result.closedLocalHandoff, true);
    assert.equal(result.ownedSitePublished, 1);
    assert.equal(result.resultSyncConsumed, 1);
    const updated = loadPublishQueue().find((item) => item.id === task.target);
    assert.equal(updated.status, "sent");
    assert.match(updated.externalUrl, /^https:\/\/money\.example\/syndication\//);
    assert.equal(fs.readdirSync(growthOutboxDir).some((item) => item.endsWith(".published.json")), true);
    assert.equal(fs.readdirSync(growthResultsDir).some((item) => item.endsWith(".consumed.json")), true);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("search index submission blocks without a public URL and posts IndexNow when configured", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    generateSite({ seed: 20261010, count: 1 });
    const blocked = await submitSearchIndex();
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.reason, "public-base-url-required");

    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: {},
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "testindexnowkey" },
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const submitted = await submitSearchIndex({ lab: result.lab });
    assert.equal(submitted.status, "submitted");
    const expectedSubmitted = 44 + utilityIntentPagesFor(result.lab[0]).length;
    assert.equal(submitted.submitted, expectedSubmitted);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    const indexCall = body.calls.find((item) => item.path === "/indexnow");
    assert.equal(indexCall.body.host, "money.example");
    assert.equal(indexCall.body.key, "testindexnowkey");
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/deals/today.html")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/offer/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/buy-now/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/starter/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/instant/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/rescue/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/demand/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/utilities/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/sales/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/samples/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/sample-close/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/objections/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/questions/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/intent/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/tools/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/seo/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/markets/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/offer-types/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/promotions/")), true);

    const repeated = await submitSearchIndex({ lab: result.lab });
    assert.equal(repeated.status, "noop");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("temporary public tunnel must be reachable before search submission", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  const publicServer = http.createServer((req, res) => {
    req.resume();
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("No matching tunnel");
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => publicServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  const probeUrl = `http://127.0.0.1:${publicServer.address().port}/`;
  try {
    saveAdapters({
      publicBaseUrl: "https://dead-tunnel.tunnelmole.net",
      channels: {},
      fulfillment: {},
      payments: {},
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "deadpublickey", publicProbeUrl: probeUrl },
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const blocked = await submitSearchIndex({ lab: result.lab });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.reason, "public-base-url-unreachable");
    assert.equal(blocked.probe.statusCode, 404);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    assert.equal(body.calls.some((item) => item.path === "/indexnow"), false);

    await checkAdapterHealth();
    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }), publishQueue: loadPublishQueue() });
    const tunnelAction = plan.actions.find((item) => item.type === "open-public-tunnel");
    assert.ok(tunnelAction);
    assert.match(tunnelAction.reason, /探活失败|死链接/);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    await new Promise((resolve) => publicServer.close(resolve));
    restore();
  }
});

test("public base probe rejects a provider placeholder even when the homepage returns 200", async () => {
  const placeholder = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>tunnel provider placeholder</h1>");
  });
  await new Promise((resolve) => placeholder.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${placeholder.address().port}`;
  try {
    const probe = await checkPublicBaseReachable(base);
    assert.equal(probe.statusCode, 200);
    assert.equal(probe.contentVerified, false);
    assert.equal(probe.reachable, false);
    assert.match(probe.probeUrl, /\/api\/status$/);
  } finally {
    await new Promise((resolve) => placeholder.close(resolve));
  }
});

test("public tunnel spawn errors reject cleanly instead of crashing the service", async () => {
  const { EventEmitter } = require("node:events");
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.pid = null;
    child.unref = () => {};
    process.nextTick(() => {
      const error = new Error("spawn npx ENOENT");
      error.code = "ENOENT";
      child.emit("error", error);
    });
    return child;
  };
  await assert.rejects(
    startAutonomousPublicTunnel({
      port: 4188,
      provider: "tunnelmole",
      timeoutMs: 1000,
      probeTimeoutMs: 100,
      spawnProcess,
    }),
    /spawn npx ENOENT/
  );
});

test("public tunnel launcher resolves npx beside the running node binary for launchd", () => {
  const command = resolveBundledNpxCommand();
  const adjacent = path.join(path.dirname(process.execPath), process.platform === "win32" ? "npx.cmd" : "npx");
  if (fs.existsSync(adjacent)) {
    assert.equal(command, adjacent);
  } else {
    assert.equal(command, "npx");
  }
});

test("automatic public tunnels skip cloudflared and rotate between allowed providers", () => {
  assert.deepEqual(publicTunnelProviders("auto"), ["tunnelmole", "localtunnel", "pinggy"]);
  assert.deepEqual(publicTunnelProviders("cloudflared"), ["cloudflared"]);
  assert.equal(nextPublicTunnelProvider(""), "tunnelmole");
  assert.equal(nextPublicTunnelProvider("cloudflared"), "tunnelmole");
  assert.equal(nextPublicTunnelProvider("tunnelmole"), "localtunnel");
  assert.equal(nextPublicTunnelProvider("localtunnel"), "pinggy");
  assert.equal(nextPublicTunnelProvider("pinggy"), "tunnelmole");
});

test("public access monitor heals only after consecutive failures and refreshes every public surface", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://old-money.tunnelmole.net",
      deploy: { publicBaseUrl: "https://old-money.tunnelmole.net" },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access.json"),
      JSON.stringify({
        status: "running",
        provider: "tunnelmole",
        publicUrl: "https://old-money.tunnelmole.net",
        pid: 12345,
        logFile: path.join(__dirname, "..", "runtime", "old-tunnel.log"),
      })
    );
    const calls = [];
    const options = {
      failureThreshold: 3,
      probe: async (url) => ({ configured: true, reachable: false, url, statusCode: 502 }),
      tunnelStarter: async ({ provider }) => {
        calls.push(["tunnel", provider]);
        return {
          provider,
          publicUrl: "https://new-money.loca.lt",
          pid: 54321,
          logFile: path.join(__dirname, "..", "runtime", "new-tunnel.log"),
        };
      },
      configure: (url, details) => {
        calls.push(["configure", url, details.source]);
        return configurePublicBaseUrl(url, details);
      },
      siteBuilder: async () => {
        calls.push(["site"]);
        return { lab: [{ id: "jobseekers-checklist-test" }] };
      },
      deployer: async () => {
        calls.push(["deploy"]);
        return { status: "deployed" };
      },
      frontBuilder: async ({ serviceUrl }) => {
        calls.push(["front", serviceUrl]);
        return { directory: "/tmp/public-front" };
      },
      searchSubmitter: async ({ lab }) => {
        calls.push(["search", lab[0].id]);
        return { status: "submitted", submitted: 6 };
      },
      tunnelStopper: (record) => {
        calls.push(["stop", record.pid]);
        return { stopped: true, pid: record.pid };
      },
      tunnelAlive: () => true,
      now: () => "2026-10-13T00:00:00.000Z",
    };

    const first = await runPublicAccessMonitorOnce(options);
    const second = await runPublicAccessMonitorOnce(options);
    assert.equal(first.status, "degraded");
    assert.equal(first.consecutiveFailures, 1);
    assert.equal(second.status, "degraded");
    assert.equal(second.consecutiveFailures, 2);
    assert.deepEqual(calls, []);

    const healed = await runPublicAccessMonitorOnce(options);
    assert.equal(healed.status, "healed");
    assert.equal(healed.publicUrl, "https://new-money.loca.lt");
    assert.equal(healed.consecutiveFailures, 0);
    assert.equal(healed.deployStatus, "deployed");
    assert.equal(healed.searchStatus, "submitted");
    assert.equal(healed.searchSubmitted, 6);
    assert.equal(healed.stoppedOldTunnel.stopped, true);
    assert.deepEqual(calls, [
      ["tunnel", "localtunnel"],
      ["configure", "https://new-money.loca.lt", "public-access-monitor:localtunnel"],
      ["site"],
      ["deploy"],
      ["front", "https://new-money.loca.lt"],
      ["search", "jobseekers-checklist-test"],
      ["stop", 12345],
    ]);
    assert.equal(loadAdapters().publicBaseUrl, "https://new-money.loca.lt");
    assert.equal(loadPublicAccessMonitor().status, "healed");
  } finally {
    restore();
  }
});

test("public access monitor tries the backup provider in the same heal attempt", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "",
      deploy: { publicBaseUrl: "" },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    const providers = [];
    const healed = await runPublicAccessMonitorOnce({
      failureThreshold: 1,
      probe: async (url) => ({ configured: Boolean(url), reachable: false, url, statusCode: 502 }),
      tunnelStarter: async ({ provider }) => {
        providers.push(provider);
        if (provider === "tunnelmole") throw new Error("anonymous tunnel quota exceeded");
        return {
          provider,
          publicUrl: "https://backup-money.loca.lt",
          pid: 54322,
          logFile: path.join(__dirname, "..", "runtime", "backup-tunnel.log"),
        };
      },
      configure: (url, details) => configurePublicBaseUrl(url, details),
      siteBuilder: async () => ({ lab: [{ id: "jobseekers-resume-workbench" }] }),
      deployer: async () => ({ status: "deployed" }),
      frontBuilder: async () => ({ directory: "/tmp/public-front" }),
      searchSubmitter: async () => ({ status: "submitted", submitted: 1 }),
      tunnelAlive: () => false,
      now: () => "2026-10-13T00:00:00.000Z",
    });
    assert.deepEqual(providers, ["tunnelmole", "localtunnel"]);
    assert.equal(healed.status, "healed");
    assert.equal(healed.activeTunnel.provider, "localtunnel");
    assert.equal(healed.publicUrl, "https://backup-money.loca.lt");
  } finally {
    restore();
  }
});

test("public access monitor clears failures without rotating a healthy URL", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://healthy-money.example",
      deploy: { publicBaseUrl: "https://healthy-money.example" },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access-monitor.json"),
      JSON.stringify({ status: "degraded", consecutiveFailures: 2 })
    );
    let tunnelStarts = 0;
    const healthy = await runPublicAccessMonitorOnce({
      probe: async (url) => ({ configured: true, reachable: true, url, statusCode: 200 }),
      tunnelStarter: async () => {
        tunnelStarts += 1;
        throw new Error("must not start");
      },
    });
    assert.equal(healthy.status, "healthy");
    assert.equal(healthy.consecutiveFailures, 0);
    assert.equal(tunnelStarts, 0);
  } finally {
    restore();
  }
});

test("public access monitor adopts a healthy tunnel started outside the monitor loop", async () => {
  const restore = snapshotData();
  try {
    const publicUrl = "https://healthy-money.run.pinggy-free.link";
    const logFile = path.join(__dirname, "..", "runtime", "adopt-pinggy.log");
    saveAdapters({
      publicBaseUrl: publicUrl,
      deploy: { publicBaseUrl: publicUrl },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access.json"),
      JSON.stringify({ status: "running", provider: "pinggy", publicUrl, pid: 54321, logFile })
    );
    const healthy = await runPublicAccessMonitorOnce({
      probe: async (url) => ({ configured: true, reachable: true, url, statusCode: 200 }),
      tunnelAlive: (record) => record?.pid === 54321 && record?.logFile === logFile,
    });
    assert.equal(healthy.status, "healthy");
    assert.deepEqual(healthy.activeTunnel, {
      provider: "pinggy",
      publicUrl,
      pid: 54321,
      logFile,
    });
  } finally {
    restore();
  }
});

test("public access monitor skips concurrent cross-process heal attempts", async () => {
  const restore = snapshotData();
  const lockDir = path.join(dataDir, "public-access-monitor.lock");
  try {
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    );
    let tunnelStarts = 0;
    const busy = await runPublicAccessMonitorOnce({
      failureThreshold: 1,
      tunnelStarter: async () => {
        tunnelStarts += 1;
        throw new Error("must not start while another monitor owns the lock");
      },
    });
    assert.equal(busy.status, "monitor-busy");
    assert.equal(busy.skipped, true);
    assert.equal(busy.ownerPid, process.pid);
    assert.equal(tunnelStarts, 0);
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
    restore();
  }
});

test("public access monitor drops stale active tunnel metadata during cooldown", async () => {
  const restore = snapshotData();
  try {
    const publicUrl = "https://dead-money.tunnelmole.net";
    saveAdapters({
      publicBaseUrl: publicUrl,
      deploy: { publicBaseUrl: publicUrl },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access-monitor.json"),
      JSON.stringify({
        status: "heal-failed",
        publicUrl,
        consecutiveFailures: 3,
        retryAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        activeTunnel: {
          provider: "tunnelmole",
          publicUrl,
          pid: 999999,
          logFile: path.join(__dirname, "..", "runtime", "dead-tunnel.log"),
        },
      })
    );
    const state = await runPublicAccessMonitorOnce({
      failureThreshold: 3,
      probe: async (url) => ({ configured: true, reachable: false, url, statusCode: 404 }),
      tunnelAlive: () => false,
    });
    assert.equal(state.status, "cooldown");
    assert.equal(state.activeTunnel, null);
  } finally {
    restore();
  }
});

test("public access monitor accepts an explicit null active tunnel", async () => {
  const restore = snapshotData();
  try {
    const publicUrl = "https://dead-money.tunnelmole.net";
    saveAdapters({
      publicBaseUrl: publicUrl,
      deploy: { publicBaseUrl: publicUrl },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access-monitor.json"),
      JSON.stringify({
        status: "heal-failed",
        publicUrl,
        consecutiveFailures: 3,
        retryAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        activeTunnel: null,
      })
    );
    const state = await runPublicAccessMonitorOnce({
      failureThreshold: 3,
      probe: async (url) => ({ configured: true, reachable: false, url, statusCode: 404 }),
    });
    assert.equal(state.status, "cooldown");
    assert.equal(state.activeTunnel, null);
  } finally {
    restore();
  }
});

test("public access monitor cools down after a failed heal instead of leaking tunnel processes", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://dead-money.tunnelmole.net",
      deploy: { publicBaseUrl: "https://dead-money.tunnelmole.net" },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access-monitor.json"),
      JSON.stringify({
        status: "heal-failed",
        publicUrl: "https://dead-money.tunnelmole.net",
        consecutiveFailures: 3,
        retryAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        error: "previous tunnel start failed",
      })
    );
    let tunnelStarts = 0;
    const state = await runPublicAccessMonitorOnce({
      failureThreshold: 3,
      probe: async (url) => ({ configured: true, reachable: false, url, statusCode: 502 }),
      tunnelStarter: async () => {
        tunnelStarts += 1;
        throw new Error("must not start during cooldown");
      },
    });
    assert.equal(state.status, "cooldown");
    assert.equal(tunnelStarts, 0);
    assert.match(state.retryAfter, /T/);
  } finally {
    restore();
  }
});

test("public access monitor stops a new tunnel and rolls back configuration when healing fails", async () => {
  const restore = snapshotData();
  try {
    const oldUrl = "https://old-money.tunnelmole.net";
    saveAdapters({
      publicBaseUrl: oldUrl,
      deploy: { publicBaseUrl: oldUrl },
      channels: {},
      fulfillment: {},
      payments: {},
      search: { publicProbeUrl: `${oldUrl}/api/status` },
    });
    fs.writeFileSync(
      path.join(dataDir, "public-access-monitor.json"),
      JSON.stringify({
        status: "degraded",
        publicUrl: oldUrl,
        consecutiveFailures: 2,
        activeTunnel: {
          provider: "tunnelmole",
          publicUrl: oldUrl,
          pid: 12345,
          logFile: path.join(__dirname, "..", "runtime", "old-tunnel.log"),
        },
      })
    );
    const stopped = [];
    const failed = await runPublicAccessMonitorOnce({
      failureThreshold: 3,
      retryCooldownMs: 60000,
      probe: async (url) => ({ configured: true, reachable: false, url, statusCode: 502 }),
      tunnelStarter: async () => ({
        provider: "localtunnel",
        publicUrl: "https://new-money.loca.lt",
        pid: 54321,
        logFile: path.join(__dirname, "..", "runtime", "new-tunnel.log"),
      }),
      siteBuilder: async () => ({ lab: [] }),
      deployer: async () => {
        throw new Error("deploy failed after tunnel start");
      },
      tunnelStopper: (record) => {
        stopped.push(record.pid);
        return { stopped: true, pid: record.pid };
      },
      tunnelAlive: () => true,
    });

    assert.equal(failed.status, "heal-failed");
    assert.equal(failed.publicBaseRolledBack, true);
    assert.equal(failed.stoppedFailedTunnel.stopped, true);
    assert.deepEqual(stopped, [54321]);
    assert.equal(loadAdapters().publicBaseUrl, oldUrl);
    assert.equal(loadAdapters().deploy.publicBaseUrl, oldUrl);
    assert.equal(loadAdapters().search.publicProbeUrl, `${oldUrl}/api/status`);
  } finally {
    restore();
  }
});

test("search index submission records a retryable outbox when IndexNow rejects URLs", async () => {
  const restore = snapshotData();
  const failingServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "domain rejected" }));
    });
  });
  await new Promise((resolve) => failingServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${failingServer.address().port}`;
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      fulfillment: {},
      payments: {},
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "retryindexnowkey" },
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const failed = await submitSearchIndex({ lab: result.lab });
    assert.equal(failed.status, "failed");
    assert.equal(failed.submitted, 0);
    assert.equal(failed.fallbackQueued, failed.urls.length);
    assert.match(failed.fallbackId, /^search_fallback_/);

    const outbox = JSON.parse(fs.readFileSync(path.join(dataDir, "search-submit-outbox.json"), "utf8"));
    assert.equal(outbox.status, "queued");
    assert.equal(outbox.queued, failed.urls.length);
    assert.equal(outbox.records[0].payload.host, "money.example");
    assert.equal(outbox.records[0].payload.key, "retryindexnowkey");
    assert.equal(outbox.records[0].urls.some((url) => url.includes("/offer/")), true);

    const state = JSON.parse(fs.readFileSync(path.join(dataDir, "search-submissions.json"), "utf8"));
    assert.deepEqual(state.submitted, []);
    assert.equal(state.failures[0].id, failed.fallbackId);
  } finally {
    await new Promise((resolve) => failingServer.close(resolve));
    restore();
  }
});

test("search index submission ignores stale syndication URLs from a different public host", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    saveAdapters({
      publicBaseUrl: "https://fresh-money.example",
      channels: {},
      fulfillment: {},
      payments: {},
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "testindexnowkey" },
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    fs.mkdirSync(path.join(dataDir, "growth-results"), { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "growth-results", "stale-syndication.json"),
      JSON.stringify(
        {
          status: "sent",
          taskId: "stale-syndication",
          experimentId: result.lab[0].id,
          channel: "zhihu-answer",
          externalUrl: "https://old-money.example/syndication/zhihu-answer/stale.html",
        },
        null,
        2
      )
    );

    const submitted = await submitSearchIndex({ lab: result.lab });
    assert.equal(submitted.status, "submitted");
    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    const indexCall = body.calls.find((item) => item.path === "/indexnow");
    assert.equal(indexCall.body.host, "fresh-money.example");
    assert.equal(indexCall.body.urlList.every((url) => new URL(url).hostname === "fresh-money.example"), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("old-money.example")), false);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("search index submission resubmits URLs when generated page content changes", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    saveAdapters({
      publicBaseUrl: "https://fresh-money.example",
      channels: {},
      fulfillment: {},
      payments: {},
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "testindexnowkey" },
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const first = await submitSearchIndex({ lab: result.lab });
    assert.equal(first.status, "submitted");
    const repeated = await submitSearchIndex({ lab: result.lab });
    assert.equal(repeated.status, "noop");

    fs.appendFileSync(path.join(PUBLIC_SITE_DIR, "feed.json"), "\n");
    const changed = await submitSearchIndex({ lab: result.lab });
    assert.equal(changed.status, "submitted");
    assert.deepEqual(changed.urls, ["https://fresh-money.example/feed.json"]);

    const state = JSON.parse(fs.readFileSync(path.join(dataDir, "search-submissions.json"), "utf8"));
    assert.match(state.submittedFingerprints["https://fresh-money.example/feed.json"], /^https:\/\/fresh-money\.example\/feed\.json#[a-f0-9]{10}$/);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("deploy adapter publishes the static site and updates publicBaseUrl", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    generateSite({ seed: 20261010, count: 1 });
    const blocked = await deployStaticSite();
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.reason, "missing-deploy-webhook-or-target-dir");

    saveAdapters({
      publicBaseUrl: "",
      channels: {},
      fulfillment: {},
      payments: {},
      deploy: { webhookUrl: `${baseUrl}/deploy` },
    });
    const deployed = await deployStaticSite();
    assert.equal(deployed.status, "deployed");
    assert.equal(deployed.publicBaseUrl, "https://mock-money.example");

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    const deployCall = body.calls.find((item) => item.path === "/deploy");
    assert.equal(deployCall.body.type, "deploy-static-site");
    assert.equal(deployCall.body.files.some((item) => item.path === "index.html" && item.encoding === "base64"), true);
    assert.equal(deployCall.body.files.some((item) => item.path.startsWith("delivery/")), false);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("deploy adapter can publish directly into a target directory", async () => {
  const restore = snapshotData();
  const targetDir = path.join(dataDir, "mounted-static-site");
  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    generateSite({ seed: 20261010, count: 1 });
    saveAdapters({
      publicBaseUrl: "",
      channels: {},
      fulfillment: {},
      payments: {},
      deploy: { targetDir, publicBaseUrl: "https://static.example/income" },
    });
    const health = await checkAdapterHealth();
    const deployCheck = health.checks.find((item) => item.id === "deploy-target-dir");
    assert.equal(deployCheck.reachable, true);
    const deployed = await deployStaticSite();
    assert.equal(deployed.status, "deployed");
    assert.equal(deployed.mode, "target-dir");
    assert.equal(deployed.publicBaseUrl, "https://static.example/income");
    assert.equal(fs.existsSync(path.join(targetDir, "index.html")), true);
    assert.equal(fs.existsSync(path.join(targetDir, "feed.json")), true);
    assert.equal(fs.existsSync(path.join(targetDir, "delivery")), false);
    assert.equal(systemStatus().adapters.publicBaseUrl, "https://static.example/income");
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
    restore();
  }
});

test("public base url configuration updates public and deploy adapter URLs", () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "http://127.0.0.1:4188",
      channels: {},
      growthWebhooks: [],
      fulfillment: {},
      payments: {},
      deploy: { targetDir: path.join(dataDir, "public-url-site"), publicBaseUrl: "http://127.0.0.1:4188" },
    });
    const summary = configurePublicBaseUrl("https://money-public.example/demo/", { source: "test" });
    assert.equal(summary.publicBaseUrl, "https://money-public.example/demo");
    const adapters = loadAdapters();
    assert.equal(adapters.publicBaseUrl, "https://money-public.example/demo");
    assert.equal(adapters.deploy.publicBaseUrl, "https://money-public.example/demo");
    assert.throws(() => configurePublicBaseUrl("http://127.0.0.1:4188"), /non-local/);
  } finally {
    restore();
  }
});

test("worker deploys the site before submitting public URLs to search", async () => {
  const restore = snapshotData();
  resetMockAdapterCalls();
  const mockServer = http.createServer(mockAdapterHandler);
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;
  try {
    saveAdapters({
      publicBaseUrl: "",
      channels: {},
      fulfillment: {},
      payments: {},
      deploy: { webhookUrl: `${baseUrl}/deploy` },
      search: { indexNowEndpoint: `${baseUrl}/indexnow`, indexNowKey: "workerindexnowkey" },
    });
    const worker = await runWorkerOnce({ seed: 20261010, count: 1, dryRun: false });
    assert.equal(worker.deployed, 1);
    assert.equal(worker.deploy.publicBaseUrl, "https://mock-money.example");
    assert.equal(worker.searchSubmit.status, "submitted");
    const expectedSubmitted = 44 + utilityIntentPagesFor(generateSite({ seed: 20261010, count: 1 }).lab[0]).length;
    assert.equal(worker.searchSubmitted, expectedSubmitted);

    const calls = await request(mockServer, "/calls");
    const body = JSON.parse(calls.body.toString("utf8"));
    assert.equal(body.calls.some((item) => item.path === "/deploy"), true);
    const indexCall = body.calls.find((item) => item.path === "/indexnow");
    assert.equal(indexCall.body.host, "mock-money.example");
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/deals/today.html")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/buy-now/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/demand/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/utilities/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/starter/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/instant/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/rescue/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/sales/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/samples/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/sample-close/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/objections/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/questions/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/intent/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/tools/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/markets/")), true);
    assert.equal(indexCall.body.urlList.some((url) => url.includes("/offer-types/")), true);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    restore();
  }
});

test("worker produces a real blocked-action summary when external adapters are missing", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    recordOrder({ experimentId: result.lab[0].id, amount: result.lab[0].price, payerNote: "paid" });
    const worker = await runWorkerOnce({ seed: 20261010, count: 1, dryRun: false });
    assert.equal(worker.published, 0);
    assert.equal(worker.publishBlocked, loadPublishQueue().filter((item) => item.status === "waiting-for-account-authorization" || item.blockedReason).length);
    assert.equal(worker.publishBlocked > 0, true);
    assert.equal(worker.fulfilled, 0);
    assert.equal(worker.fulfillmentBlocked, 1);
    assert.equal(loadWorkerHistory().some((item) => item.id === worker.id), true);
  } finally {
    restore();
  }
});

test("system status summarizes revenue, queue state and worker history", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    recordOrder({ experimentId: result.lab[0].id, amount: 29, payerNote: "paid" });
    const worker = await runWorkerOnce({ seed: 20261010, count: 1, dryRun: false });
    const status = systemStatus();
    assert.equal(status.experiments, 8);
    assert.equal(status.orders, 1);
    assert.equal(status.revenue, 29);
    assert.equal(status.publishQueue.total, 3);
    assert.equal(status.publishQueue.blocked, 3);
    assert.equal(status.deliveryQueue.blocked, 1);
    assert.equal(status.lastWorker.id, worker.id);
    assert.equal(status.lastPaymentSync.status, "blocked");
    assert.equal(status.workerHistory.at(-1).id, worker.id);
  } finally {
    restore();
  }
});

test("action plan rewrites offer angle from views without buyer action", async () => {
  const restore = snapshotData();
  const growthOutboxDir = path.join(dataDir, "rewrite-growth-outbox");
  const growthResultsDir = path.join(dataDir, "rewrite-growth-results");
  try {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: { dir: growthOutboxDir, resultsDir: growthResultsDir },
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    for (let index = 0; index < 12; index += 1) {
      appendEvent({ type: "view", experimentId: experiment.id, channel: "server:offer", source: "server-static" });
    }

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const action = plan.actions.find((item) => item.type === "rewrite-offer-from-views");
    assert.equal(action.experimentId, experiment.id);
    assert.equal(action.variantId, "pain");
    assert.match(action.variantUrl, /--pain\.html/);
    assert.match(action.recommendedPublishUrl, /\/rescue\/.+\.html/);
    assert.match(action.reason, /自动挽回成交页/);
    assert.equal(loadOrders().length, 0);

    const execution = await executeActionPlan({ dryRun: true });
    const rewriteResult = execution.results.find((item) => item.action === "rewrite-offer-from-views");
    assert.equal(rewriteResult.status, "executed");
    assert.equal(rewriteResult.variantId, "pain");
    assert.equal(rewriteResult.republishStatus, "dry-run-ready");
    assert.equal(rewriteResult.republishPackages, 3);
    assert.equal(fs.existsSync(growthOutboxDir), false);
    const optimizations = loadVariantOptimizations();
    assert.equal(optimizations.length, 1);
    assert.equal(optimizations[0].source, "automatic-view-rewrite");
    assert.equal(optimizations[0].variantId, "pain");
    assert.match(optimizations[0].recommendedPublishUrl, /\/rescue\/.+\.html/);

    const dryRunPublish = await runPublishAgentOnce({ dryRun: true, limit: 1 });
    assert.equal(dryRunPublish.results[0].variantId, "pain");
    assert.match(dryRunPublish.results[0].publishUrl, /\/rescue\/.+\.html/);

    const executionLive = await executeActionPlan({ dryRun: false });
    const liveRewrite = executionLive.results.find((item) => item.action === "rewrite-offer-from-views");
    assert.equal(liveRewrite.republishStatus, "handed-off");
    assert.equal(liveRewrite.republishPackages, 3);
    const files = fs.readdirSync(growthOutboxDir).filter((item) => item.endsWith(".optimization.json"));
    assert.equal(files.length, 3);
    const payload = JSON.parse(fs.readFileSync(path.join(growthOutboxDir, files[0]), "utf8"));
    assert.equal(payload.type, "optimization-republish");
    assert.equal(payload.republishSource, "automatic-view-rewrite");
    assert.match(payload.trackingUrl, /\/rescue\/.+\.html/);
    assert.match(payload.directBuyUrl, /^https:\/\/money\.example\/buy\/[^/]+\/pain\?source=publish%3A/);
    assert.equal(payload.targetKind, "growth-outbox");
    assert.equal(loadOrders().length, 0);
  } finally {
    fs.rmSync(growthOutboxDir, { recursive: true, force: true });
    fs.rmSync(growthResultsDir, { recursive: true, force: true });
    restore();
  }
});

test("execution queue applies view-only offer rewrites", async () => {
  const restore = snapshotData();
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    for (let index = 0; index < 10; index += 1) {
      appendEvent({ type: "view", experimentId: experiment.id, channel: "server:offer", source: "server-static" });
    }

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    const queue = buildExecutionQueue({ actionPlan: plan });
    const task = queue.tasks.find((item) => item.action === "rewrite-offer-from-views");
    assert.equal(task.variantId, "pain");
    assert.match(task.recommendedPublishUrl, /\/rescue\/.+\.html/);
    const resultTask = await runExecutionQueueTask(task, { dryRun: true });
    assert.equal(resultTask.status, "executed");
    assert.equal(resultTask.variantId, "pain");
    assert.match(loadVariantOptimizations()[0].recommendedPublishUrl, /\/rescue\/.+\.html/);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("bot or crawler views are logged but ignored for autonomous buyer-intent routing", async () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: {},
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const result = generateSite({ seed: 20261010, count: 1 });
    const experiment = result.lab[0];
    for (let index = 0; index < 12; index += 1) {
      appendEvent({
        type: "view",
        experimentId: experiment.id,
        channel: "server:offer",
        source: "server-static",
        userAgent: index % 2 === 0 ? `Mozilla/5.0 AppleWebKit/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) ${index}` : `curl/8.7.${index}`,
      });
    }

    const funnel = acquisitionFunnelSnapshot({ lab: [experiment] });
    assert.equal(funnel.traffic.rawProductViews, 12);
    assert.equal(funnel.traffic.botOrCrawlerViews, 12);
    assert.equal(funnel.traffic.productViews, 0);
    assert.equal(funnel.stage, "traffic-starved");

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    assert.equal(plan.actions.some((item) => item.type === "rewrite-offer-from-views" && item.experimentId === experiment.id), false);
    assert.equal(plan.actions.some((item) => item.type === "escalate-published-no-checkout" && item.experimentId === experiment.id), false);

    for (let index = 0; index < 10; index += 1) {
      appendEvent({ type: "view", experimentId: experiment.id, channel: "server:offer", source: "server-static", userAgent: `Mozilla/5.0 Buyer/${index}` });
    }

    const humanFunnel = acquisitionFunnelSnapshot({ lab: [experiment] });
    assert.equal(humanFunnel.traffic.rawProductViews, 22);
    assert.equal(humanFunnel.traffic.botOrCrawlerViews, 12);
    assert.equal(humanFunnel.traffic.productViews, 10);
    const humanPlan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 1 }) });
    assert.equal(humanPlan.actions.find((item) => item.type === "rewrite-offer-from-views" && item.experimentId === experiment.id)?.variantId, "pain");
  } finally {
    restore();
  }
});

test("event API attaches request traffic quality so crawler JavaScript pings cannot steer routing", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await request(server, "/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" },
      body: JSON.stringify({ type: "view", experimentId: experiment.id, channel: "utility:fit-calculator" }),
    });
    assert.equal(response.status, 201);
    const event = loadEvents().at(-1);
    assert.equal(event.isBot, true);
    assert.equal(event.buyerSignal, false);
    assert.equal(event.trafficQuality, "bot-or-crawler");

    const funnel = acquisitionFunnelSnapshot({ lab: [experiment] });
    assert.equal(funnel.traffic.rawProductViews, 1);
    assert.equal(funnel.traffic.botOrCrawlerViews, 1);
    assert.equal(funnel.traffic.productViews, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("product image studio counts real usage without counting crawlers", async () => {
  const restore = snapshotData();
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    generateSite({ seed: 20261010, count: 1 });
    const humanHeaders = { "User-Agent": "Mozilla/5.0 RealBuyer/1.0" };
    const crawlerHeaders = { "User-Agent": "curl/8.7.1" };
    assert.equal((await request(server, "/products/product-image-batch-studio/", { headers: humanHeaders })).status, 200);
    assert.equal((await request(server, "/products/product-image-batch-studio/", { headers: crawlerHeaders })).status, 200);
    const forgedAutomationEvent = await request(server, "/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Playwright/1.0" },
      body: JSON.stringify({
        type: "interaction",
        experimentId: "product-image-batch-studio",
        channel: "image-batch-completed",
        userAgent: "Mozilla/5.0 RealBuyer/1.0",
      }),
    });
    assert.equal(forgedAutomationEvent.status, 201);

    const product = { id: "product-image-batch-studio" };
    const funnel = acquisitionFunnelSnapshot({ lab: [product] });
    assert.equal(funnel.traffic.rawProductViews, 2);
    assert.equal(funnel.traffic.productViews, 1);
    assert.equal(funnel.traffic.botOrCrawlerViews, 1);
    assert.equal(funnel.traffic.imageBatchesCompleted, 0);
    assert.equal(
      loadEvents().filter((item) => item.experimentId === product.id && item.channel === "server:product").length,
      2
    );
    appendEvent({
      type: "interaction",
      experimentId: product.id,
      channel: "image-batch-completed",
      userAgent: "Mozilla/5.0 RealBuyer/1.0",
    });
    configurePublicBaseUrl("https://money.example");
    const interactionFunnel = acquisitionFunnelSnapshot({ lab: [product] });
    assert.equal(interactionFunnel.traffic.imageBatchesCompleted, 1);
    assert.equal(interactionFunnel.traffic.freeResultsGenerated, 1);
    assert.equal(interactionFunnel.traffic.supportPromptsShown, 1);
    assert.equal(interactionFunnel.stage, "awaiting-authoritative-support-payment");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("storefront commerce cycle maintains only the fixed product payment and delivery loop", async () => {
  const restore = snapshotData();
  try {
    const calls = [];
    const product = knownExperiments().find((item) => item.id === "jobseekers-resume-workbench");
    const summary = await runStorefrontCommerceCycle({
      siteBuilder: async () => {
        calls.push("site");
        return { product, lab: [product] };
      },
      deployer: async () => {
        calls.push("deploy");
        return { status: "deployed" };
      },
      paymentSyncer: async () => {
        calls.push("payments");
        return { status: "synced", created: 0, duplicates: 0, failed: 0 };
      },
      fulfiller: async () => {
        calls.push("fulfillment");
        return { results: [] };
      },
      searchSubmitter: async ({ lab }) => {
        calls.push(`search:${lab.map((item) => item.id).join(",")}`);
        return { status: "noop", submitted: 0 };
      },
      now: () => "2026-10-13T02:00:00.000Z",
    });

    assert.deepEqual(calls, [
      "site",
      "deploy",
      "payments",
      "fulfillment",
      "search:product-image-batch-studio",
    ]);
    assert.equal(summary.productId, "product-image-batch-studio");
    assert.equal(summary.price, 6.9);
    assert.equal(summary.orders, 0);
    assert.equal(summary.revenue, 0);
    assert.equal(systemStatus().storefrontCommerceCycle.productId, "product-image-batch-studio");
    const defaultTrafficPlan = buildTrafficPlan();
    assert.deepEqual(
      defaultTrafficPlan.allocations.map((item) => item.experimentId),
      ["jobseekers-resume-workbench"]
    );
    const defaultPublishQueue = buildPublishQueue();
    assert.equal(defaultPublishQueue.length, 3);
    assert.equal(defaultPublishQueue.every((item) => item.experimentId === "jobseekers-resume-workbench"), true);
  } finally {
    restore();
  }
});

test("stable public front is portable under a project path and only indexes files it ships", () => {
  const restore = snapshotData();
  try {
    generateSite({ seed: 20261010, count: 1 });
    const result = buildPublicFront({
      serviceUrl: "https://pay-service.example",
      frontBaseUrl: "https://seller.example/autonomous-income-engine",
    });
    const front = result.directory;
    const home = fs.readFileSync(path.join(front, "index.html"), "utf8");
    const imageStudio = fs.readFileSync(path.join(front, "products", "product-image-batch-studio", "index.html"), "utf8");
    const sitemap = fs.readFileSync(path.join(front, "sitemap.xml"), "utf8");
    const robots = fs.readFileSync(path.join(front, "robots.txt"), "utf8");
    const service = JSON.parse(fs.readFileSync(path.join(front, "service.json"), "utf8"));

    assert.match(home, /href="\.\/styles\.css"/);
    assert.match(home, /href="\.\/favicon\.svg"/);
    assert.match(home, /商品图批量成品机/);
    assert.match(home, /消费维权证据包生成器/);
    assert.doesNotMatch(home, /实验榜|真人访问|确认付款|得分 0/);
    assert.match(imageStudio, /src="\.\.\/\.\.\/fflate\.js"/);
    assert.match(imageStudio, /src="\.\.\/\.\.\/wechat-pay\.jpg"/);
    assert.match(imageStudio, /data-file-input/);
    assert.match(imageStudio, /¥6\.90 微信购买高清 ZIP/);
    assert.match(imageStudio, /下载已购高清 ZIP/);
    assert.match(imageStudio, /fflate\.zipSync/);
    assert.doesNotMatch(home, /src="\/|href="\//);
    assert.match(imageStudio, /service\.json/);
    assert.equal(service.url, "https://pay-service.example");
    assert.equal(service.productId, "product-image-batch-studio");
    assert.match(sitemap, /https:\/\/seller\.example\/autonomous-income-engine\//);
    assert.equal((sitemap.match(/<url>/g) || []).length, 16);
    const guide = fs.readFileSync(path.join(front, "guides", "12315-complaint-evidence-list", "index.html"), "utf8");
    assert.match(home, /href="\.\/guides\/12315-complaint-evidence-list\//);
    assert.match(guide, /href="\.\.\/\.\.\/products\/consumer-evidence-pack\/\?/);
    assert.match(guide, /https:\/\/pay-service\.example\/api\/events/);
    assert.match(sitemap, /\/guides\/12315-complaint-evidence-list\//);
    for (const [file, preset] of Object.entries({
      "white-main-image.html": "white-main",
      "portrait-product-image.html": "portrait-product",
      "social-product-card.html": "social-card",
      "taobao-main-image.html": "taobao-main",
      "pdd-main-image.html": "pdd-main",
      "xiaohongshu-product-image.html": "xhs-product",
      "douyin-product-image.html": "douyin-product",
    })) {
      const presetHtml = fs.readFileSync(path.join(front, "presets", file), "utf8");
      assert.match(presetHtml, new RegExp(`data-default-preset="${preset}"`));
      assert.match(presetHtml, /href="\.\.\/styles\.css"/);
      assert.match(presetHtml, /href="\.\.\/favicon\.svg"/);
      assert.match(presetHtml, /src="\.\.\/fflate\.js"/);
      assert.match(presetHtml, /src="\.\.\/wechat-pay\.jpg"/);
      assert.doesNotMatch(presetHtml, /src="\/|href="\//);
      assert.match(sitemap, new RegExp(`https://seller\\.example/autonomous-income-engine/presets/${file.replace(".", "\\.")}`));
    }
    assert.doesNotMatch(sitemap, /\/samples\//);
    assert.doesNotMatch(sitemap, /\/offer\//);
    assert.match(robots, /Sitemap: https:\/\/seller\.example\/autonomous-income-engine\/sitemap\.xml/);
    assert.equal(fs.existsSync(path.join(front, "fflate.js")), true);
    assert.equal(fs.existsSync(path.join(front, "app")), false);
    assert.equal(fs.existsSync(path.join(front, "career-tools")), false);
  } finally {
    buildPublicFront();
    restore();
  }
});

test("public front release gate stages only the audited whitelist and refuses sensitive additions", async () => {
  const restore = snapshotData();
  const stageDir = path.join(dataDir, "public-front-stage-test");
  try {
    generateSite({ seed: 20261010, count: 1 });
    const result = buildPublicFront();
    const verified = verifyPublicFront(result.directory);
    assert.equal(verified.ok, true);
    assert.equal(verified.files.length, 26);
    assert.equal(verified.files.includes("favicon.svg"), true);
    assert.equal(verified.files.includes("fflate.js"), true);
    assert.equal(verified.files.includes("wechat-pay.jpg"), true);
    assert.equal(verified.files.includes("products/consumer-evidence-pack/index.html"), true);
    assert.equal(verified.files.includes("products/product-image-batch-studio/index.html"), true);
    assert.equal(verified.files.includes("app/resume-builder.html"), false);
    assert.equal(verified.files.includes("presets/white-main-image.html"), true);
    assert.equal(verified.files.includes("presets/portrait-product-image.html"), true);
    assert.equal(verified.files.includes("presets/social-product-card.html"), true);
    assert.equal(verified.files.includes("presets/taobao-main-image.html"), true);
    assert.equal(verified.files.includes("presets/pdd-main-image.html"), true);
    assert.equal(verified.files.includes("presets/xiaohongshu-product-image.html"), true);
    assert.equal(verified.files.includes("presets/douyin-product-image.html"), true);
    assert.equal(verified.serviceUrl, "");

    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });
    const staged = copyAllowedPublicFront(result.directory, stageDir);
    assert.deepEqual(staged.files, verified.files);

    const updated = await updatePaymentService({
      directory: stageDir,
      serviceUrl: "https://payment.example/",
      probe: async (url) => ({ ok: true, statusCode: 200, url }),
      now: () => "2026-10-13T03:00:00.000Z",
    });
    assert.equal(updated.serviceUrl, "https://payment.example");
    const service = JSON.parse(fs.readFileSync(path.join(stageDir, "service.json"), "utf8"));
    assert.equal(service.url, "https://payment.example");
    assert.equal(service.health.ok, true);

    fs.writeFileSync(path.join(stageDir, "wechat-pay.jpg"), "not a real image");
    assert.throws(() => verifyPublicFront(stageDir), /user-approved collection code/);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
    buildPublicFront();
    restore();
  }
});

test("public front payment service update keeps the previous URL when health verification fails", async () => {
  const restore = snapshotData();
  try {
    generateSite({ seed: 20261010, count: 1 });
    const result = buildPublicFront({ serviceUrl: "https://healthy.example" });
    await assert.rejects(
      updatePaymentService({
        directory: result.directory,
        serviceUrl: "https://dead.example",
        probe: async () => {
          throw new Error("health failed");
        },
      }),
      /health failed/
    );
    const service = JSON.parse(fs.readFileSync(path.join(result.directory, "service.json"), "utf8"));
    assert.equal(service.url, "https://healthy.example");
  } finally {
    buildPublicFront();
    restore();
  }
});

test("funnel reports an unreachable configured public URL before blaming traffic", () => {
  const restore = snapshotData();
  try {
    const publicUrl = "https://dead-money.tunnelmole.net";
    saveAdapters({
      publicBaseUrl: publicUrl,
      deploy: { publicBaseUrl: publicUrl },
      channels: {},
      fulfillment: {},
      payments: {},
      search: {},
    });
    const product = knownExperiments().find((item) => item.id === "jobseekers-resume-workbench");
    const funnel = acquisitionFunnelSnapshot({
      lab: [product],
      publicAccessMonitor: {
        publicUrl,
        status: "cooldown",
        lastProbe: { reachable: false, statusCode: 404 },
      },
    });
    assert.equal(funnel.stage, "public-access-unreachable");
    assert.equal(funnel.nextAction, "heal-public-access-before-acquisition");
  } finally {
    restore();
  }
});

test("traffic-starved utility expansion counts the current lab instead of stale product catalog", () => {
  const restore = snapshotData();
  try {
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: {},
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
    });
    const current = generateSite({ seed: 20261010, count: 2 });
    const stale = generateSite({ seed: 20261011, count: 8 });
    assert.equal(knownExperiments().length > current.lab.length, true);
    fs.writeFileSync(path.join(dataDir, "last-search-submit.json"), JSON.stringify({ status: "submitted", discovered: 0, submitted: 0 }, null, 2));

    const plan = buildActionPlan({ strategy: buildStrategy({ seed: 20261010, count: 2 }) });
    const action = plan.actions.find((item) => item.type === "expand-utility-intent");
    assert.equal(action.utilityPages, current.lab.reduce((sum, item) => sum + utilityIntentPagesFor(item).length, 0));
    assert.equal(action.utilityPages < stale.lab.reduce((sum, item) => sum + utilityIntentPagesFor(item).length, 0) + action.utilityPages, true);
  } finally {
    restore();
  }
});

test("execution utility expansion deploys the regenerated public site", async () => {
  const restore = snapshotData();
  const deployTargetDir = path.join(dataDir, "execution-expand-deploy-site");
  try {
    fs.rmSync(deployTargetDir, { recursive: true, force: true });
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      growthOutbox: {},
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
      deploy: { targetDir: deployTargetDir, publicBaseUrl: "https://money.example" },
    });
    generateSite({ seed: 20261010, count: 1 });
    await deployStaticSite({ dryRun: false });
    assert.match(fs.readFileSync(path.join(deployTargetDir, "index.html"), "utf8"), /项目经历还是流水账/);
    assert.match(fs.readFileSync(path.join(deployTargetDir, "admin", "index.html"), "utf8"), /<h2>实验数<\/h2><p>1<\/p>/);

    generateSite({ seed: 20261010, count: 2 });
    const task = {
      id: "exec_test_expand_utility_deploy",
      kind: "action",
      action: "expand-utility-intent",
      target: "utility-intent-pages",
      status: "queued",
    };
    const result = await runExecutionQueueTask(task, { dryRun: false });

    assert.equal(result.status, "executed");
    assert.equal(result.deployStatus, "deployed");
    assert.match(fs.readFileSync(path.join(deployTargetDir, "index.html"), "utf8"), /项目经历还是流水账/);
    assert.match(fs.readFileSync(path.join(deployTargetDir, "admin", "index.html"), "utf8"), /<h2>实验数<\/h2><p>8<\/p>/);
  } finally {
    fs.rmSync(deployTargetDir, { recursive: true, force: true });
    restore();
  }
});

test("server records static page views without requiring browser JavaScript", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 2 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const before = loadEvents().length;
    const offer = await request(server, `/offer/${experiment.id}.html`, {
      headers: { "User-Agent": "TestBot/1.0" },
    });
    assert.equal(offer.status, 200);
    const afterOffer = loadEvents();
    assert.equal(afterOffer.length, before + 1);
    assert.equal(afterOffer.at(-1).type, "view");
    assert.equal(afterOffer.at(-1).experimentId, experiment.id);
    assert.equal(afterOffer.at(-1).channel, "server:offer");

    const duplicate = await request(server, `/offer/${experiment.id}.html`, {
      headers: { "User-Agent": "TestBot/1.0" },
    });
    assert.equal(duplicate.status, 200);
    assert.equal(loadEvents().length, before + 1);

    const variant = await request(server, `/offer/${experiment.id}--pain.html`, {
      headers: { "User-Agent": "AnotherBot/1.0" },
    });
    assert.equal(variant.status, 200);
    assert.equal(loadEvents().at(-1).variantId, "pain");

    const seo = await request(server, `/seo/${experiment.id}-pain-solution.html`, {
      headers: { "User-Agent": "Crawler/1.0" },
    });
    assert.equal(seo.status, 200);
    assert.match(loadEvents().at(-1).channel, /server:seo:pain-solution/);

    const longTailSeo = await request(server, `/seo/${experiment.id}-tonight-delivery.html`, {
      headers: { "User-Agent": "LongTailCrawler/1.0" },
    });
    assert.equal(longTailSeo.status, 200);
    assert.match(loadEvents().at(-1).channel, /server:seo:tonight-delivery/);

    const marketHub = await request(server, `/markets/${experiment.marketId}.html`, {
      headers: { "User-Agent": "HubCrawler/1.0" },
    });
    assert.equal(marketHub.status, 200);
    assert.equal(loadEvents().at(-1).experimentId, `hub:market:${experiment.marketId}`);
    assert.equal(loadEvents().at(-1).channel, `server:hub:market:${experiment.marketId}`);

    const offerTypeHub = await request(server, `/offer-types/${experiment.offerTypeId}.html`, {
      headers: { "User-Agent": "HubCrawler/2.0" },
    });
    assert.equal(offerTypeHub.status, 200);
    assert.equal(loadEvents().at(-1).experimentId, `hub:offer-type:${experiment.offerTypeId}`);
    assert.equal(loadEvents().at(-1).channel, `server:hub:offer-type:${experiment.offerTypeId}`);

    const buyNow = await request(server, `/buy-now/${experiment.id}.html`, {
      headers: { "User-Agent": "BuyerCrawler/1.0" },
    });
    assert.equal(buyNow.status, 200);
    assert.match(buyNow.body.toString("utf8"), /直购成交页/);
    assert.match(buyNow.body.toString("utf8"), /\/buy\//);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:buy-now");
    assert.equal(loadCheckouts().length, 0);

    const starter = await request(server, `/starter/${experiment.id}.html`, {
      headers: { "User-Agent": "StarterCrawler/1.0" },
    });
    assert.equal(starter.status, 200);
    assert.match(starter.body.toString("utf8"), /低价入门成交页/);
    assert.match(starter.body.toString("utf8"), /offer=starter/);
    assert.match(starter.body.toString("utf8"), /starter-offer:click/);
    assert.doesNotMatch(starter.body.toString("utf8"), /data-engagement-autostart/);
    assert.match(starter.body.toString("utf8"), /offer: directOffer/);
    assert.match(starter.body.toString("utf8"), /amount: directAmount/);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:starter-offer");
    assert.equal(loadCheckouts().length, 0);

    const instant = await request(server, `/instant/${experiment.id}.html`, {
      headers: { "User-Agent": "InstantCrawler/1.0" },
    });
    assert.equal(instant.status, 200);
    assert.match(instant.body.toString("utf8"), /一屏付款页/);
    assert.match(instant.body.toString("utf8"), /offer=starter/);
    assert.match(instant.body.toString("utf8"), /instant-checkout:click/);
    assert.doesNotMatch(instant.body.toString("utf8"), /data-engagement-autostart/);
    assert.match(instant.body.toString("utf8"), /offer: directOffer/);
    assert.match(instant.body.toString("utf8"), /amount: directAmount/);
    assert.match(instant.body.toString("utf8"), new RegExp(`${experiment.id}#STARTER`));
    assert.doesNotMatch(instant.body.toString("utf8"), /setTimeout\(\(\) => ensureDirectCheckout/);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:instant-checkout");
    assert.equal(loadCheckouts().length, 0);

    const rescue = await request(server, `/rescue/${experiment.id}.html`, {
      headers: { "User-Agent": "RescueCrawler/1.0" },
    });
    assert.equal(rescue.status, 200);
    assert.match(rescue.body.toString("utf8"), /自动挽回成交页/);
    assert.match(rescue.body.toString("utf8"), /offer=starter/);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:rescue-offer");
    assert.equal(loadCheckouts().length, 0);

    const salesAssistant = await request(server, `/sales/${experiment.id}.html`, {
      headers: { "User-Agent": "SalesCrawler/1.0" },
    });
    assert.equal(salesAssistant.status, 200);
    assert.match(salesAssistant.body.toString("utf8"), /自动销售助手/);
    assert.match(salesAssistant.body.toString("utf8"), /\/api\/sales-assistant\/message/);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:sales-assistant");
    assert.equal(loadCheckouts().length, 0);

    const objection = await request(server, `/objections/${experiment.id}-price-objection.html`, {
      headers: { "User-Agent": "ObjectionCrawler/1.0" },
    });
    assert.equal(objection.status, 200);
    assert.match(objection.body.toString("utf8"), /自动异议处理/);
    assert.match(objection.body.toString("utf8"), /\/sales\//);
    assert.match(objection.body.toString("utf8"), /\/buy\//);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:objection:price-objection");
    assert.equal(loadCheckouts().length, 0);

    const question = await request(server, `/questions/${experiment.id}-payment-steps.html`, {
      headers: { "User-Agent": "QuestionCrawler/1.0" },
    });
    assert.equal(question.status, 200);
    assert.match(question.body.toString("utf8"), /自动买家问答/);
    assert.match(question.body.toString("utf8"), /FAQPage/);
    assert.match(question.body.toString("utf8"), /\/sales\//);
    assert.match(question.body.toString("utf8"), /\/buy\//);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:question:payment-steps");
    assert.equal(loadCheckouts().length, 0);

    const intent = await request(server, `/intent/${experiment.id}-starter-first.html`, {
      headers: { "User-Agent": "IntentCrawler/1.0" },
    });
    assert.equal(intent.status, 200);
    assert.match(intent.body.toString("utf8"), /强购买意图入口/);
    assert.match(intent.body.toString("utf8"), /offer=starter/);
    assert.equal(loadEvents().at(-1).experimentId, experiment.id);
    assert.equal(loadEvents().at(-1).channel, "server:intent:starter-first");
    assert.equal(loadCheckouts().length, 0);

    const todayDeals = await request(server, "/deals/today.html", {
      headers: { "User-Agent": "DealCrawler/1.0" },
    });
    assert.equal(todayDeals.status, 200);
    assert.match(todayDeals.body.toString("utf8"), /今日主推/);
    assert.match(todayDeals.body.toString("utf8"), /\/buy-now\//);
    assert.equal(loadEvents().at(-1).experimentId, "deals:today");
    assert.equal(loadEvents().at(-1).channel, "server:deal:today");
    assert.equal(loadCheckouts().length, 0);

    const head = await headRequest(server, `/offer/${experiment.id}.html`, { "User-Agent": "HeadBot/1.0" });
    assert.equal(head.status, 200);
    assert.equal(loadEvents().filter((item) => item.source === "server-static").length, 15);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("offer page prepares a reusable checkout and records buyer intent", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  try {
    const variantFile = path.join(DIST_DIR, "offer", `${experiment.id}--pain.html`);
    const html = fs.readFileSync(variantFile, "utf8");
    assert.match(html, /ensureCheckout\(\)/);
    assert.match(html, /offer-checkout-session:/);
    assert.match(html, /source: 'offer-page'/);
    assert.match(html, /leadSessionId: getCheckoutSessionId\(\)/);
    assert.match(html, /type:'click'/);
    assert.match(html, /channel:'checkout-button'/);
    assert.match(html, /trackCheckoutClick\(\);/);
    assert.match(html, /type:'view'/);
    assert.doesNotMatch(html, /setTimeout\(\(\) => ensureCheckout/);

    appendEvent({ type: "view", experimentId: experiment.id, variantId: "pain", channel: "offer-page" });
    appendEvent({ type: "click", experimentId: experiment.id, variantId: "pain", channel: "checkout-button" });
    const firstCheckout = createCheckout({ experimentId: experiment.id, variantId: "pain", source: "offer-page", leadSessionId: "browser-session-1" });
    const secondCheckout = createCheckout({ experimentId: experiment.id, variantId: "pain", source: "offer-page", leadSessionId: "browser-session-1" });
    assert.equal(secondCheckout.id, firstCheckout.id);
    assert.equal(loadCheckouts().length, 1);
    const viewed = buildLab({ seed: 20261010, count: 1, adaptive: false })[0];
    const pain = viewed.offerVariants.find((item) => item.id === "pain");
    assert.equal(pain.metrics.views, 1);
    assert.equal(pain.metrics.clicks, 1);
    assert.equal(pain.metrics.checkouts, 1);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("lead tool creates checkout automatically for high intent results", () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  try {
    const toolFile = path.join(DIST_DIR, "tools", `${experiment.id}.html`);
    const html = fs.readFileSync(toolFile, "utf8");
    assert.match(html, /lead-tool-result/);
    assert.match(html, /\/api\/lead-tool-results/);
    assert.match(html, /leadSessionId/);
    assert.match(html, /lead-tool-session:/);
    assert.match(html, /data-tool-payment-remark/);
    assert.match(html, /唯一付款备注/);
    assert.match(html, /sample-lead-form/);
    assert.match(html, /\/api\/sample-lead/);
    assert.match(html, /data-sample-lead-payment-remark/);
  } finally {
    restore();
  }
});

test("sample lead endpoint gives a free sample and creates checkout only for high intent", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const lowIntent = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, variantId: "proof", context: "先看看" }),
    });
    assert.equal(lowIntent.status, 201);
    const lowBody = JSON.parse(lowIntent.body.toString("utf8"));
    assert.equal(lowBody.result.highIntent, false);
    assert.match(lowBody.result.sample, /免费样例/);
    assert.equal(lowBody.result.checkout, null);
    assert.equal(loadCheckouts().length, 0);

    const highIntent = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        context: "我今晚马上要用这套材料，想直接套到我的场景里并交付出去",
        urgency: "今天要用",
        email: "buyer@example.com",
        leadSessionId: "sample-session-1",
      }),
    });
    assert.equal(highIntent.status, 201);
    const highBody = JSON.parse(highIntent.body.toString("utf8"));
    assert.equal(highBody.result.highIntent, true);
    assert.equal(highBody.result.checkout.experimentId, experiment.id);
    assert.equal(highBody.result.checkout.variantId, "proof");
    assert.equal(highBody.result.checkout.source, "sample-lead");
    assert.match(highBody.result.checkout.paymentRemark, new RegExp(`^${experiment.id}#[-_A-Z0-9]+$`));
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);
    const events = loadEvents();
    assert.equal(events.filter((item) => item.type === "sample-lead").length, 2);
    assert.equal(events.filter((item) => item.type === "click" && item.channel === "sample-lead-cta").length, 1);
    assert.equal(events.filter((item) => item.type === "checkout-created").length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("utility intent pages are indexed tools and do not create checkout until high intent submit", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const page = utilityIntentPagesFor(experiment).find((item) => item.intent === "fit-calculator");
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    assert.equal(fs.existsSync(path.join(DIST_DIR, "utilities", `${page.slug}.html`)), true);
    assert.match(publicUtilityIntentUrl(page), /\/utilities\/.+fit-calculator\.html/);
    assert.match(fs.readFileSync(path.join(DIST_DIR, "sitemap.xml"), "utf8"), new RegExp(`/utilities/${page.slug}\\.html`));
    assert.match(fs.readFileSync(path.join(DIST_DIR, "rss.xml"), "utf8"), new RegExp(`utility-${page.slug}`));
    const feed = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "feed.json"), "utf8"));
    assert.equal(feed.products[0].utilityIntentPages.some((item) => item.intent === "fit-calculator"), true);

    const pageResponse = await request(server, `/utilities/${page.slug}.html`);
    assert.equal(pageResponse.status, 200);
    const html = pageResponse.body.toString("utf8");
    assert.match(html, /程序化免费工具/);
    assert.match(html, /\/api\/sample-lead/);
    assert.equal(loadCheckouts().length, 0);
    assert.equal(loadOrders().length, 0);

    const highIntent = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        context: "我今天马上要用这套材料，想直接套到我的场景里并交付出去",
        urgency: "马上要用",
        email: "wx:buyer",
        leadSessionId: "utility-session-1",
        source: "utility:fit-calculator",
      }),
    });
    assert.equal(highIntent.status, 201);
    const highBody = JSON.parse(highIntent.body.toString("utf8"));
    assert.equal(highBody.result.highIntent, true);
    assert.equal(highBody.result.checkout.source, "utility:fit-calculator");
    assert.match(highBody.result.checkout.leadContext, /直接套到我的场景/);
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("sample lead checkout creation is idempotent for the same session", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const payload = {
      experimentId: experiment.id,
      variantId: "proof",
      context: "我今天马上要把这个东西交付出去，希望直接拿完整模板使用",
      urgency: "马上要用",
      email: "buyer@example.com",
      leadSessionId: "sample-session-1",
    };
    const first = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const second = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = JSON.parse(first.body.toString("utf8"));
    const secondBody = JSON.parse(second.body.toString("utf8"));
    assert.equal(firstBody.result.reusedCheckout, false);
    assert.equal(secondBody.result.reusedCheckout, true);
    assert.equal(firstBody.result.checkout.id, secondBody.result.checkout.id);
    assert.equal(firstBody.result.checkout.paymentRemark, secondBody.result.checkout.paymentRemark);
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadEvents().filter((item) => item.type === "checkout-created").length, 1);
    assert.equal(loadOrders().length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("reused sample lead checkout updates buyer context for personalized delivery", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const first = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        context: "我今天马上要用，先给一个大概模板看看",
        urgency: "今天要用",
        email: "buyer@example.com",
        source: "utility:fit-calculator",
        leadSessionId: "sample-context-refresh",
      }),
    });
    const second = await request(server, "/api/sample-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        context: "我今晚要投后端岗位，项目经历写得像流水账，要一版能直接粘进简历的项目描述。",
        urgency: "马上要用",
        email: "wx: context-refresh",
        source: "utility:fit-calculator",
        leadSessionId: "sample-context-refresh",
      }),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = JSON.parse(first.body.toString("utf8"));
    const secondBody = JSON.parse(second.body.toString("utf8"));
    assert.equal(secondBody.result.reusedCheckout, true);
    assert.equal(firstBody.result.checkout.id, secondBody.result.checkout.id);
    assert.equal(secondBody.result.checkout.source, "utility:fit-calculator");
    assert.match(secondBody.result.checkout.leadContext, /后端岗位/);
    assert.equal(secondBody.result.checkout.leadUrgency, "马上要用");
    assert.equal(secondBody.result.checkout.leadContact, "wx: context-refresh");

    const paid = receivePaymentNotification({
      transactionId: "reused_sample_context_tx_001",
      remark: secondBody.result.checkout.paymentRemark,
      amount: secondBody.result.checkout.amount,
    });
    assert.match(fs.readFileSync(paid.order.deliveryFile, "utf8"), /后端岗位/);
    assert.match(fs.readFileSync(paid.delivery.preparedFile, "utf8"), /后端岗位/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("lead tool result endpoint atomically records lead intent and creates checkout", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const lowIntent = await request(server, "/api/lead-tool-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, variantId: "proof", score: 2 }),
    });
    assert.equal(lowIntent.status, 201);
    const lowBody = JSON.parse(lowIntent.body.toString("utf8"));
    assert.equal(lowBody.result.highIntent, false);
    assert.equal(lowBody.result.checkout, null);
    assert.equal(loadCheckouts().length, 0);

    const highIntent = await request(server, "/api/lead-tool-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, variantId: "proof", score: 5 }),
    });
    assert.equal(highIntent.status, 201);
    const highBody = JSON.parse(highIntent.body.toString("utf8"));
    assert.equal(highBody.result.highIntent, true);
    assert.equal(highBody.result.checkout.experimentId, experiment.id);
    assert.equal(highBody.result.checkout.variantId, "proof");
    assert.match(highBody.result.checkout.paymentRemark, new RegExp(`^${experiment.id}#[-_A-Z0-9]+$`));
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);
    const events = loadEvents();
    assert.equal(events.filter((item) => item.type === "lead-tool-result").length, 2);
    assert.equal(events.filter((item) => item.type === "click" && item.channel === "lead-tool-cta").length, 1);
    assert.equal(events.filter((item) => item.type === "checkout-created").length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("lead tool checkout creation is idempotent for the same lead session", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const payload = { experimentId: experiment.id, variantId: "proof", score: 5, leadSessionId: "lead-session-1" };
    const first = await request(server, "/api/lead-tool-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const second = await request(server, "/api/lead-tool-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = JSON.parse(first.body.toString("utf8"));
    const secondBody = JSON.parse(second.body.toString("utf8"));
    assert.equal(firstBody.result.reusedCheckout, false);
    assert.equal(secondBody.result.reusedCheckout, true);
    assert.equal(firstBody.result.checkout.id, secondBody.result.checkout.id);
    assert.equal(firstBody.result.checkout.paymentRemark, secondBody.result.checkout.paymentRemark);
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadEvents().filter((item) => item.type === "checkout-created").length, 1);
    assert.equal(loadOrders().length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("reused lead tool checkout preserves latest self-test context", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const first = await request(server, "/api/lead-tool-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        score: 5,
        context: "自测结果：今天就卡住了；担心价格。",
        urgency: "今天就卡住了",
        leadSessionId: "lead-tool-context-refresh",
      }),
    });
    const second = await request(server, "/api/lead-tool-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        score: 6,
        context: "自测结果：今天就卡住了；愿意直接拿来用；主要担心能否马上交付。",
        urgency: "今天就卡住了",
        leadSessionId: "lead-tool-context-refresh",
        reasons: ["今天就卡住了", "愿意直接拿来用", "担心：能否马上交付"],
      }),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = JSON.parse(first.body.toString("utf8"));
    const secondBody = JSON.parse(second.body.toString("utf8"));
    assert.equal(secondBody.result.reusedCheckout, true);
    assert.equal(firstBody.result.checkout.id, secondBody.result.checkout.id);
    assert.match(secondBody.result.checkout.leadContext, /马上交付/);
    assert.equal(secondBody.result.checkout.leadReasons.includes("愿意直接拿来用"), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("sales assistant answers objections and creates checkout only for high intent", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const lowIntent = await request(server, "/api/sales-assistant/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, variantId: "proof", message: "这个里面包含什么？", leadSessionId: "sales-session-1" }),
    });
    assert.equal(lowIntent.status, 201);
    const lowBody = JSON.parse(lowIntent.body.toString("utf8"));
    assert.equal(lowBody.result.highIntent, false);
    assert.equal(lowBody.result.checkout, null);
    assert.match(lowBody.result.reply, /不创建订单|先回答边界|先看交付边界/);
    assert.equal(loadCheckouts().length, 0);

    const highIntent = await request(server, "/api/sales-assistant/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, variantId: "proof", message: "我今晚就要用，现在购买，怎么付款生成备注？", leadSessionId: "sales-session-1" }),
    });
    assert.equal(highIntent.status, 201);
    const highBody = JSON.parse(highIntent.body.toString("utf8"));
    assert.equal(highBody.result.highIntent, true);
    assert.equal(highBody.result.checkout.experimentId, experiment.id);
    assert.equal(highBody.result.checkout.variantId, "proof");
    assert.equal(highBody.result.checkout.source, "sales-assistant");
    assert.match(highBody.result.checkout.paymentRemark, new RegExp(`^${experiment.id}#[-_A-Z0-9]+$`));
    assert.match(highBody.result.reply, /唯一付款备注/);
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);
    assert.equal(loadEvents().filter((item) => item.type === "sales-assistant-message").length, 2);
    assert.equal(loadEvents().filter((item) => item.type === "click" && item.channel === "sales-assistant-cta").length, 1);
    assert.equal(loadEvents().filter((item) => item.type === "checkout-created").length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("sales assistant checkout creation is idempotent for the same session", () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  try {
    const payload = {
      experimentId: experiment.id,
      variantId: "proof",
      message: "我现在购买，今晚就要用，请给付款备注",
      leadSessionId: "sales-session-repeat",
    };
    const first = processSalesAssistantMessage(payload);
    const second = processSalesAssistantMessage(payload);
    assert.equal(first.reusedCheckout, false);
    assert.equal(second.reusedCheckout, true);
    assert.equal(first.checkout.id, second.checkout.id);
    assert.equal(first.checkout.paymentRemark, second.checkout.paymentRemark);
    assert.equal(loadCheckouts().length, 1);
    assert.equal(loadOrders().length, 0);
  } finally {
    restore();
  }
});

test("server buy links require explicit confirmation and crawler GET never creates checkout", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const first = await request(server, `/buy/${experiment.id}/proof?source=promotion%3Awechat-moments`, {
      headers: { "User-Agent": "Googlebot/2.1" },
    });
    assert.equal(first.status, 200);
    assert.match(first.body.toString("utf8"), /此页面不会自动创建订单/);
    assert.match(first.body.toString("utf8"), /确认购买，生成唯一付款备注/);
    assert.match(first.body.toString("utf8"), /method: 'POST'/);
    assert.match(first.body.toString("utf8"), /\/api\/checkouts/);
    assert.equal(loadCheckouts().length, 0);

    const second = await request(server, `/buy/${experiment.id}/proof?source=promotion%3Awechat-moments`, {
      headers: { "User-Agent": "NoJsBuyer/1.0" },
    });
    assert.equal(second.status, 200);
    assert.equal(loadCheckouts().length, 0);

    const starter = await request(server, `/buy/${experiment.id}/proof?source=starter-offer&offer=starter`, {
      headers: { "User-Agent": "StarterCrawler/1.0" },
    });
    assert.equal(starter.status, 200);
    assert.match(starter.body.toString("utf8"), new RegExp(`amount: ${starterOfferPrice(experiment)}`));
    assert.match(starter.body.toString("utf8"), /offer: "starter"/);
    assert.equal(loadCheckouts().length, 0);

    const apiStarter = await request(server, "/api/checkouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: experiment.id,
        variantId: "proof",
        source: "starter-offer:click",
        offer: "starter",
        amount: starterOfferPrice(experiment),
        leadSessionId: "starter-auto-session-001",
      }),
    });
    assert.equal(apiStarter.status, 201);
    const apiStarterBody = JSON.parse(apiStarter.body.toString("utf8"));
    assert.equal(apiStarterBody.checkout.source, undefined);
    assert.equal(apiStarterBody.checkout.variantId, "proof");
    assert.equal(apiStarterBody.checkout.offer, "starter");
    assert.equal(apiStarterBody.checkout.amount, starterOfferPrice(experiment));
    assert.equal(loadCheckouts().find((item) => item.id === apiStarterBody.checkout.id).source, "starter-offer:click");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("serves lab dashboard, tracking redirects, records orders and marks delivery", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 8 });
  const experiment = result.lab[0];
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const page = await request(server, "/");
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /text\/html/);
    assert.match(page.body.toString("utf8"), /项目经历还是流水账/);
    assert.doesNotMatch(page.body.toString("utf8"), /程序自己跑赚钱实验|实验排行榜|机器生成清单/);

    const redirect = await request(server, `/t/${experiment.id}/wechat-moments`);
    assert.equal(redirect.status, 302);
    assert.match(redirect.headers.location, new RegExp(`/offer/${experiment.id}--[a-z]+\\.html`));

    const lab = await request(server, "/api/lab");
    assert.equal(lab.status, 200);
    assert.equal(JSON.parse(lab.body.toString("utf8")).experiments.length, 8);

    const checkout = await request(server, "/api/checkouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id }),
    });
    assert.equal(checkout.status, 201);
    const checkoutBody = JSON.parse(checkout.body.toString("utf8"));
    assert.equal(checkoutBody.checkout.experimentId, experiment.id);
    assert.match(checkoutBody.checkout.paymentRemark, new RegExp(`^${experiment.id}#[-_A-Z0-9]+$`));
    assert.match(checkoutBody.checkout.statusUrl, /^\/checkout\/checkout_/);

    const checkoutPage = await request(server, checkoutBody.checkout.statusUrl);
    assert.equal(checkoutPage.status, 200);
    assert.match(checkoutPage.body.toString("utf8"), /等待付款通知匹配/);

    const order = await request(server, "/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, amount: experiment.price, payerNote: "test" }),
    });
    assert.equal(order.status, 201);
    const orderBody = JSON.parse(order.body.toString("utf8"));
    assert.equal(orderBody.ok, true);
    assert.equal(orderBody.order.deliveryFile, path.join(PRIVATE_DELIVERY_DIR, `${experiment.id}.md`));
    assert.match(orderBody.order.deliveryUrl, /^\/deliver\/[-_A-Za-z0-9]+$/);
    assert.equal(readDeliveryContent(experiment.id).includes("30 分钟执行"), true);
    assert.equal(orderBody.order.deliveryTask.status, "queued");
    assert.equal(loadOutbox().some((item) => item.orderId === orderBody.order.id), true);
    assert.equal(loadDeliveryTokens().some((item) => item.orderId === orderBody.order.id), true);

    const delivered = await request(server, `/api/orders/${orderBody.order.id}/deliver`, { method: "POST" });
    assert.equal(delivered.status, 200);
    assert.equal(JSON.parse(delivered.body.toString("utf8")).order.status, "delivered");

    const outbox = await request(server, "/api/outbox");
    assert.equal(outbox.status, 200);

    const publish = await request(server, "/api/publish", { method: "POST" });
    assert.equal(publish.status, 200);
    assert.equal(JSON.parse(publish.body.toString("utf8")).ok, true);

    const queue = await request(server, "/api/publish-queue/rebuild", { method: "POST" });
    assert.equal(queue.status, 200);
    assert.equal(JSON.parse(queue.body.toString("utf8")).tasks.length, 24);

    const drafts = await request(server, "/api/publish-queue/export-local-drafts", { method: "POST" });
    assert.equal(drafts.status, 200);
    assert.equal(JSON.parse(drafts.body.toString("utf8")).tasks.length, 24);

    const claimedPublish = await request(server, "/api/publish-agent/tasks?limit=1&workerId=http-bot");
    assert.equal(claimedPublish.status, 200);
    const claimedPublishBody = JSON.parse(claimedPublish.body.toString("utf8"));
    assert.equal(claimedPublishBody.tasks.length, 1);
    assert.equal(claimedPublishBody.tasks[0].text.length > 0, true);

    const publishResult = await request(server, "/api/publish-agent/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: claimedPublishBody.tasks[0].id,
        status: "sent",
        externalUrl: "https://example.com/published/http-bot",
        workerId: "http-bot",
      }),
    });
    assert.equal(publishResult.status, 200);
    assert.equal(JSON.parse(publishResult.body.toString("utf8")).task.externalUrl, "https://example.com/published/http-bot");

    const prepared = await request(server, "/api/outbox/prepare", { method: "POST" });
    assert.equal(prepared.status, 200);

    const autopilot = await request(server, "/api/autopilot/run", { method: "POST" });
    assert.equal(autopilot.status, 200);
    assert.equal(JSON.parse(autopilot.body.toString("utf8")).run.publishTasks, 24);

    const adapters = await request(server, "/api/adapters");
    assert.equal(adapters.status, 200);
    assert.equal(JSON.parse(adapters.body.toString("utf8")).adapters.fulfillment.configured, false);

    const status = await request(server, "/api/status");
    assert.equal(status.status, 200);
    assert.equal(JSON.parse(status.body.toString("utf8")).status.experiments, 8);

    const actionPlan = await request(server, "/api/action-plan");
    assert.equal(actionPlan.status, 200);
    assert.equal(JSON.parse(actionPlan.body.toString("utf8")).actionPlan.actions.length > 0, true);

    const trafficPlan = await request(server, "/api/traffic-plan");
    assert.equal(trafficPlan.status, 200);
    assert.equal(JSON.parse(trafficPlan.body.toString("utf8")).trafficPlan.allocations.length, 8);

    const executionQueue = await request(server, "/api/execution-queue");
    assert.equal(executionQueue.status, 200);
    assert.equal(Array.isArray(JSON.parse(executionQueue.body.toString("utf8")).executionQueue.tasks), true);

    const adapterReadiness = await request(server, "/api/adapter-readiness");
    assert.equal(adapterReadiness.status, 200);
    assert.equal(Array.isArray(JSON.parse(adapterReadiness.body.toString("utf8")).readiness.required), true);

    const opportunityScan = await request(server, "/api/opportunity-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 3 }),
    });
    assert.equal(opportunityScan.status, 200);
    const opportunityScanBody = JSON.parse(opportunityScan.body.toString("utf8"));
    assert.equal(["ok", "seeded"].includes(opportunityScanBody.scan.status), true);
    if (opportunityScanBody.scan.status === "ok") assert.equal(opportunityScanBody.scan.defaultSourcesUsed, true);
    else assert.equal(opportunityScanBody.scan.signals.every((item) => item.seeded), true);

    const actionExecution = await request(server, "/api/action-plan/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(actionExecution.status, 200);
    assert.equal(JSON.parse(actionExecution.body.toString("utf8")).execution.results.length > 0, true);

    const executionQueueRun = await request(server, "/api/execution-queue/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true, limit: 4 }),
    });
    assert.equal(executionQueueRun.status, 200);
    assert.equal(JSON.parse(executionQueueRun.body.toString("utf8")).run.results.length > 0, true);

    const variantOptimizations = await request(server, "/api/variant-optimizations");
    assert.equal(variantOptimizations.status, 200);
    assert.equal(Array.isArray(JSON.parse(variantOptimizations.body.toString("utf8")).optimizations), true);
    const currentFeed = JSON.parse((await request(server, "/feed.json")).body.toString("utf8"));
    const currentExperiment = currentFeed.products[0];

    const publicFullDelivery = await request(server, `/delivery/${experiment.id}.md`);
    assert.equal(publicFullDelivery.status, 404);

    const publicPreview = await request(server, `/delivery-preview/${currentExperiment.id}.md`);
    assert.equal(publicPreview.status, 200);
    assert.match(publicPreview.body.toString("utf8"), /付款前可公开查看的交付边界/);
    const leadTool = await request(server, `/tools/${currentExperiment.id}.html`, {
      headers: { "User-Agent": "ToolCrawler/1.0" },
    });
    assert.equal(leadTool.status, 200);
    assert.match(leadTool.body.toString("utf8"), /生成诊断结果/);
    assert.match(leadTool.body.toString("utf8"), /lead-tool-result/);
    assert.equal(loadEvents().some((item) => item.experimentId === currentExperiment.id && item.channel === "server:lead-tool"), true);
    const ownedPromotion = await request(server, `/promotions/wechat-moments/${currentExperiment.id}.html`);
    assert.equal(ownedPromotion.status, 200);
    assert.match(ownedPromotion.body.toString("utf8"), /站内自动发布/);

    const feed = await request(server, "/feed.json");
    assert.equal(feed.status, 200);
    const feedBody = JSON.parse(feed.body.toString("utf8"));
    assert.equal(feedBody.products.length, 8);
    assert.equal(feedBody.ownedPromotionPages.length, 24);

    const rss = await request(server, "/rss.xml");
    assert.equal(rss.status, 200);
    assert.match(rss.headers["content-type"], /application\/xml/);

    const sitemap = await request(server, "/sitemap.xml");
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.body.toString("utf8"), /<urlset/);
    assert.match(sitemap.body.toString("utf8"), /\/promotions\//);
    assert.match(sitemap.body.toString("utf8"), /\/tools\//);

    const robots = await request(server, "/robots.txt");
    assert.equal(robots.status, 200);
    assert.match(robots.body.toString("utf8"), /Sitemap:/);

    const payment = await request(server, "/api/payment-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: "wx_http_payment_001", remark: `付款 ${checkoutBody.checkout.paymentRemark}`, amount: experiment.price }),
    });
    assert.equal(payment.status, 201);
    const paymentBody = JSON.parse(payment.body.toString("utf8"));
    assert.equal(paymentBody.payment.checkout.id, checkoutBody.checkout.id);
    assert.equal(paymentBody.payment.order.checkoutId, checkoutBody.checkout.id);
    assert.equal(paymentBody.payment.delivery.status, "prepared");
    assert.match(paymentBody.payment.order.deliveryUrl, /^\/deliver\/[-_A-Za-z0-9]+$/);

    const checkoutStatusResponse = await request(server, `/api/checkouts/${checkoutBody.checkout.id}`);
    assert.equal(checkoutStatusResponse.status, 200);
    const checkoutStatusBody = JSON.parse(checkoutStatusResponse.body.toString("utf8"));
    assert.equal(checkoutStatusBody.checkout.status, "paid");
    assert.equal(checkoutStatusBody.order.id, paymentBody.payment.order.id);
    assert.match(checkoutStatusBody.delivery.deliveryUrl, /^\/deliver\/[-_A-Za-z0-9]+$/);

    const paidCheckoutPage = await request(server, checkoutBody.checkout.statusUrl);
    assert.equal(paidCheckoutPage.status, 200);
    assert.match(paidCheckoutPage.body.toString("utf8"), /下载你的交付文件/);

    const redeemed = await request(server, paymentBody.payment.order.deliveryUrl);
    assert.equal(redeemed.status, 200);
    assert.match(redeemed.headers["content-disposition"], /attachment/);
    assert.match(redeemed.body.toString("utf8"), /30 分钟执行/);

    const wechatCheckout = createCheckout({ experimentId: experiment.id });
    const wechatPayment = await request(server, "/api/wechat-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `微信支付收款到账 ¥${wechatCheckout.amount} 备注 ${wechatCheckout.paymentRemark} 交易单号 wx_http_notice_001` }),
    });
    assert.equal(wechatPayment.status, 201);
    const wechatBody = JSON.parse(wechatPayment.body.toString("utf8"));
    assert.equal(wechatBody.parsed.amount, wechatCheckout.amount);
    assert.equal(wechatBody.parsed.transactionId, "wx_http_notice_001");
    assert.equal(wechatBody.payment.checkout.id, wechatCheckout.id);

    const staticStarterAmount = starterOfferPrice(experiment);
    const staticStarterPayment = await request(server, "/api/wechat-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `微信支付收款到账 ¥${staticStarterAmount} 备注 ${experiment.id}#STARTER 交易单号 wx_http_static_starter_001` }),
    });
    assert.equal(staticStarterPayment.status, 400);
    const staticStarterBody = JSON.parse(staticStarterPayment.body.toString("utf8"));
    assert.match(staticStarterBody.error, /existing checkout unique payment remark/);

    const underpaidCheckout = createCheckout({ experimentId: experiment.id });
    const underpaidResponse = await request(server, "/api/wechat-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `微信支付收款到账 ¥${underpaidCheckout.amount - 1} 备注 ${underpaidCheckout.paymentRemark} 交易单号 wx_http_underpaid_001` }),
    });
    assert.equal(underpaidResponse.status, 201);
    const underpaidBody = JSON.parse(underpaidResponse.body.toString("utf8"));
    assert.equal(underpaidBody.payment.status, "underpaid");
    assert.equal(underpaidBody.payment.order, null);
    assert.equal(underpaidBody.payment.checkout.status, "underpaid");
    const underpaidStatus = await request(server, `/api/checkouts/${underpaidCheckout.id}`);
    assert.equal(JSON.parse(underpaidStatus.body.toString("utf8")).checkout.shortAmount, 1);

    const topUpResponse = await request(server, "/api/wechat-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `微信支付收款到账 ¥1 备注 ${underpaidCheckout.paymentRemark} 交易单号 wx_http_topup_001` }),
    });
    assert.equal(topUpResponse.status, 201);
    const topUpBody = JSON.parse(topUpResponse.body.toString("utf8"));
    assert.equal(topUpBody.payment.checkout.status, "paid");
    assert.equal(topUpBody.payment.checkout.receivedAmount, underpaidCheckout.amount);
    assert.equal(topUpBody.payment.delivery.status, "prepared");

    const missingDelivery = await request(server, "/deliver/not-a-real-token");
    assert.equal(missingDelivery.status, 404);

    const publishSend = await request(server, "/api/publish-queue/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(publishSend.status, 200);

    const deliverySend = await request(server, "/api/outbox/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(deliverySend.status, 200);

    const worker = await request(server, "/api/worker/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 20261010, count: 1, dryRun: true }),
    });
    assert.equal(worker.status, 200);
    assert.equal(JSON.parse(worker.body.toString("utf8")).worker.publishBlocked, 3);

    const cycle = await request(server, "/api/worker/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 20261010, count: 1, dryRun: true, autonomous: true }),
    });
    assert.equal(cycle.status, 200);
    assert.match(JSON.parse(cycle.body.toString("utf8")).cycle.id, /^cycle_/);

    const paymentSync = await request(server, "/api/payments/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(paymentSync.status, 200);
    assert.equal(JSON.parse(paymentSync.body.toString("utf8")).sync.status, "blocked");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("server serves configured deploy target before stale dist files", async () => {
  const restore = snapshotData();
  const targetDir = path.join(dataDir, "server-deploy-target");
  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    generateSite({ seed: 1, count: 1 });
    fs.writeFileSync(path.join(DIST_DIR, "feed.json"), JSON.stringify({ source: "stale-dist", products: [] }));
    fs.writeFileSync(path.join(targetDir, "index.html"), "<!doctype html><title>current deploy</title>");
    fs.writeFileSync(path.join(targetDir, "feed.json"), JSON.stringify({ source: "current-deploy", products: [{ id: "live" }] }));
    saveAdapters({
      publicBaseUrl: "https://money.example",
      channels: {},
      growthWebhooks: [],
      fulfillment: {},
      payments: {},
      opportunitySources: [],
      publishAgent: {},
      deploy: { targetDir },
    });
    assert.equal(staticSiteRoot(), targetDir);

    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const feed = await request(server, "/feed.json");
      assert.equal(feed.status, 200);
      const body = JSON.parse(feed.body.toString("utf8"));
      assert.equal(body.source, "current-deploy");
      assert.equal(body.products[0].id, "live");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
    restore();
  }
});

test("payment webhook rejects forged notifications when a secret is configured", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 8 });
  const experiment = result.lab[0];
  const checkout = createCheckout({ experimentId: experiment.id });
  fs.writeFileSync(
    path.join(dataDir, "adapters.json"),
    JSON.stringify({ channels: {}, fulfillment: {}, payments: { webhookSecret: "secret-123" } }, null, 2)
  );
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const rejected = await request(server, "/api/payment-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: "wx_tx_guarded", remark: checkout.paymentRemark, amount: checkout.amount }),
    });
    assert.equal(rejected.status, 401);

    const accepted = await request(server, "/api/payment-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Payment-Secret": "secret-123" },
      body: JSON.stringify({ transactionId: "wx_tx_guarded", remark: checkout.paymentRemark, amount: checkout.amount }),
    });
    assert.equal(accepted.status, 201);
    assert.equal(JSON.parse(accepted.body.toString("utf8")).payment.order.externalPaymentId, "wx_tx_guarded");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("production runtime refuses to start without a payment webhook secret", () => {
  const restore = snapshotData();
  try {
    saveAdapters({ channels: {}, fulfillment: {}, payments: {} });
    assert.throws(
      () => assertRuntimeSecurity({ REQUIRE_PAYMENT_WEBHOOK_SECRET: "1" }),
      /PAYMENT_WEBHOOK_SECRET is required/
    );
    saveAdapters({ channels: {}, fulfillment: {}, payments: { webhookSecret: "a-long-production-secret" } });
    assert.doesNotThrow(() => assertRuntimeSecurity({ REQUIRE_PAYMENT_WEBHOOK_SECRET: "1" }));
    assert.throws(
      () =>
        assertRuntimeSecurity({
          REQUIRE_PAYMENT_WEBHOOK_SECRET: "1",
          REQUIRE_ADMIN_API_SECRET: "1",
          ADMIN_API_SECRET: "",
        }),
      /ADMIN_API_SECRET is required/
    );
    assert.doesNotThrow(() =>
      assertRuntimeSecurity({
        REQUIRE_PAYMENT_WEBHOOK_SECRET: "1",
        REQUIRE_ADMIN_API_SECRET: "1",
        ADMIN_API_SECRET: "a-different-long-admin-secret",
      })
    );
    assert.throws(
      () =>
        assertRuntimeSecurity({
          REQUIRE_PAYMENT_WEBHOOK_SECRET: "1",
          REQUIRE_ADMIN_API_SECRET: "1",
          ADMIN_API_SECRET: "short",
        }),
      /at least 24 bytes/
    );
    saveAdapters({ channels: {}, fulfillment: {}, payments: { webhookSecret: "same-secret-value-123456789" } });
    assert.throws(
      () =>
        assertRuntimeSecurity({
          REQUIRE_PAYMENT_WEBHOOK_SECRET: "1",
          REQUIRE_ADMIN_API_SECRET: "1",
          ADMIN_API_SECRET: "same-secret-value-123456789",
        }),
      /must be different/
    );
    assert.doesNotThrow(() => assertRuntimeSecurity({}));
  } finally {
    restore();
  }
});

test("routine service restarts preserve the public tunnel while explicit stops can close it", () => {
  assert.equal(shouldStopPublicTunnelOnShutdown("SIGTERM", {}), false);
  assert.equal(shouldStopPublicTunnelOnShutdown("SIGTERM", { STOP_PUBLIC_TUNNEL_ON_SHUTDOWN: "1" }), true);
  assert.equal(shouldStopPublicTunnelOnShutdown("SIGINT", {}), true);
});

test("admin API secret protects operational state and mutation endpoints", async () => {
  const restore = snapshotData();
  const previousSecret = process.env.ADMIN_API_SECRET;
  process.env.ADMIN_API_SECRET = "admin-secret-123";
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    generateSite({ seed: 20261010, count: 1 });
    assert.equal(adminApiAuthorized({ headers: {} }), false);
    assert.throws(() => assertAdminApiAllowed({ headers: {} }), /admin API secret is required/);

    const publicStatus = await request(server, "/api/status");
    assert.equal(publicStatus.status, 200);
    const publicBody = JSON.parse(publicStatus.body.toString("utf8"));
    assert.equal(publicBody.ok, true);
    assert.equal(publicBody.productId, "product-image-batch-studio");
    assert.equal(publicBody.status, undefined);

    const rejectedRead = await request(server, "/api/checkouts");
    assert.equal(rejectedRead.status, 401);
    const rejectedWrite = await request(server, "/api/regenerate", { method: "POST" });
    assert.equal(rejectedWrite.status, 401);

    const headers = { "X-Admin-Secret": "admin-secret-123" };
    const acceptedRead = await request(server, "/api/checkouts", { headers });
    assert.equal(acceptedRead.status, 200);
    const privateStatus = await request(server, "/api/status", { headers });
    assert.equal(JSON.parse(privateStatus.body.toString("utf8")).status.orders, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = previousSecret;
    restore();
  }
});

test("mobile admin confirms a unique-amount WeChat checkout and buyer unlocks automatically", async () => {
  const restore = snapshotData();
  const previousSecret = process.env.ADMIN_API_SECRET;
  const previousMobilePassword = process.env.ADMIN_MOBILE_PASSWORD;
  const previousPaymentSource = process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE;
  process.env.ADMIN_API_SECRET = "manual-checkout-admin-secret";
  process.env.ADMIN_MOBILE_PASSWORD = "phone-only-password";
  process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE = "1";
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    generateSite({ seed: 20261014, count: 1 });
    const created = await request(server, "/api/checkouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: "product-image-batch-studio",
        variantId: "browser-hd-zip",
        source: "product-image-preview",
        leadSessionId: "manual-wechat-flow",
        checkoutMode: "manual-wechat",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = JSON.parse(created.body.toString("utf8"));
    const checkoutId = createdBody.checkout.id;
    assert.equal(createdBody.checkout.checkoutMode, "manual-wechat");
    assert.match(createdBody.checkout.contactReference, /^WX-[-_A-Z0-9]+$/);
    assert.equal(createdBody.checkout.amount, 6.9);
    assert.equal(createdBody.checkout.paymentAmount >= 6.81, true);
    assert.equal(createdBody.checkout.paymentAmount <= 6.89, true);
    assert.equal(createdBody.checkout.paymentMatchMode, "exact-amount");
    assert.equal(loadOrders().length, 0);

    const rejectedOrders = await request(server, "/api/admin-mobile/orders");
    assert.equal(rejectedOrders.status, 401);
    const badLogin = await request(server, "/api/admin-mobile/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    assert.equal(badLogin.status, 401);
    assert.equal(loadOrders().length, 0);

    const login = await request(server, "/api/admin-mobile/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ password: "phone-only-password" }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers["set-cookie"][0], /HttpOnly/);
    assert.match(login.headers["set-cookie"][0], /Secure/);
    assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    const orders = await request(server, "/api/admin-mobile/orders", { headers: { Cookie: cookie } });
    assert.equal(orders.status, 200);
    const ordersBody = JSON.parse(orders.body.toString("utf8"));
    assert.equal(ordersBody.summary.pending, 1);
    assert.equal(ordersBody.orders[0].amount, createdBody.checkout.paymentAmount);

    const confirmed = await request(server, `/api/admin-mobile/orders/${checkoutId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    assert.equal(confirmed.status, 200);
    const confirmedBody = JSON.parse(confirmed.body.toString("utf8"));
    assert.equal(confirmedBody.checkout.status, "paid");
    assert.equal(confirmedBody.duplicate, false);
    assert.equal(loadOrders().length, 1);
    assert.equal(loadOrders()[0].source, "mobile-admin-confirmation");
    assert.equal(loadOrders()[0].amount, createdBody.checkout.paymentAmount);

    const anonymousStatus = await request(server, `/api/checkouts/${checkoutId}`);
    assert.equal(anonymousStatus.status, 200);
    assert.equal(JSON.parse(anonymousStatus.body.toString("utf8")).checkout.status, "paid");

    const replay = await request(server, `/api/admin-mobile/orders/${checkoutId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    assert.equal(replay.status, 200);
    assert.equal(JSON.parse(replay.body.toString("utf8")).duplicate, true);
    assert.equal(loadOrders().length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = previousSecret;
    if (previousMobilePassword === undefined) delete process.env.ADMIN_MOBILE_PASSWORD;
    else process.env.ADMIN_MOBILE_PASSWORD = previousMobilePassword;
    if (previousPaymentSource === undefined) delete process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE;
    else process.env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE = previousPaymentSource;
    restore();
  }
});

test("mobile admin receives a protected Xiaohongshu login QR and confirms owner action", async () => {
  const restore = snapshotData();
  const previousSecret = process.env.ADMIN_API_SECRET;
  const previousMobilePassword = process.env.ADMIN_MOBILE_PASSWORD;
  process.env.ADMIN_API_SECRET = "xiaohongshu-publisher-admin-secret";
  process.env.ADMIN_MOBILE_PASSWORD = "phone-only-password";
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const anonymous = await request(server, "/api/admin-mobile/action-tasks");
    assert.equal(anonymous.status, 401);

    const qr = `data:image/png;base64,${Buffer.from("fake-png-for-route-test").toString("base64")}`;
    const created = await request(server, "/api/admin/action-tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": "xiaohongshu-publisher-admin-secret",
      },
      body: JSON.stringify({
        type: "xiaohongshu-login",
        idempotencyKey: "xiaohongshu-login:session-1",
        qrImage: qr,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = JSON.parse(created.body.toString("utf8"));
    assert.equal(createdBody.task.status, "pending");
    assert.match(createdBody.task.qrImageUrl, /\/action-tasks\/.+\/qr$/);

    const duplicate = await request(server, "/api/admin/action-tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": "xiaohongshu-publisher-admin-secret",
      },
      body: JSON.stringify({
        type: "xiaohongshu-login",
        idempotencyKey: "xiaohongshu-login:session-1",
        qrImage: qr,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(JSON.parse(duplicate.body.toString("utf8")).duplicate, true);

    const login = await request(server, "/api/admin-mobile/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ password: "phone-only-password" }),
    });
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const tasks = await request(server, "/api/admin-mobile/action-tasks", { headers: { Cookie: cookie } });
    assert.equal(tasks.status, 200);
    const tasksBody = JSON.parse(tasks.body.toString("utf8"));
    assert.equal(tasksBody.summary.pending, 1);

    const qrAnonymous = await request(server, createdBody.task.qrImageUrl.replace("..", ""));
    assert.equal(qrAnonymous.status, 401);
    const qrProtected = await request(server, createdBody.task.qrImageUrl.replace("..", ""), {
      headers: { Cookie: cookie },
    });
    assert.equal(qrProtected.status, 200);
    assert.equal(qrProtected.headers["content-type"], "image/png");

    const confirmed = await request(server, `/api/admin-mobile/action-tasks/${createdBody.task.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    assert.equal(confirmed.status, 200);
    assert.equal(JSON.parse(confirmed.body.toString("utf8")).task.status, "owner-confirmed");

    const publisherLookup = await request(server, `/api/admin/action-tasks/${createdBody.task.id}`, {
      headers: { "X-Admin-Secret": "xiaohongshu-publisher-admin-secret" },
    });
    assert.equal(publisherLookup.status, 200);
    assert.equal(JSON.parse(publisherLookup.body.toString("utf8")).task.status, "owner-confirmed");

    const completed = await request(server, `/api/admin/action-tasks/${createdBody.task.id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": "xiaohongshu-publisher-admin-secret",
      },
      body: "{}",
    });
    assert.equal(completed.status, 200);
    assert.equal(JSON.parse(completed.body.toString("utf8")).task.status, "completed");

    const completedAgain = await request(server, `/api/admin/action-tasks/${createdBody.task.id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": "xiaohongshu-publisher-admin-secret",
      },
      body: "{}",
    });
    assert.equal(completedAgain.status, 200);
    assert.equal(JSON.parse(completedAgain.body.toString("utf8")).duplicate, true);

    const secondCreated = await request(server, "/api/admin/action-tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": "xiaohongshu-publisher-admin-secret",
      },
      body: JSON.stringify({
        type: "xiaohongshu-login",
        idempotencyKey: "xiaohongshu-login:session-2",
        qrImage: qr,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
    });
    const secondBody = JSON.parse(secondCreated.body.toString("utf8"));
    const platformVerified = await request(server, `/api/admin/action-tasks/${secondBody.task.id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": "xiaohongshu-publisher-admin-secret",
      },
      body: "{}",
    });
    assert.equal(platformVerified.status, 200);
    assert.equal(JSON.parse(platformVerified.body.toString("utf8")).task.status, "completed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = previousSecret;
    if (previousMobilePassword === undefined) delete process.env.ADMIN_MOBILE_PASSWORD;
    else process.env.ADMIN_MOBILE_PASSWORD = previousMobilePassword;
    restore();
  }
});

test("buyer checkout APIs redact payment internals and contact context", async () => {
  const restore = snapshotData();
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = generateSite({ seed: 20261010, count: 1 });
    const checkout = createCheckout({
      experimentId: result.lab[0].id,
      source: "redaction-test",
      leadSessionId: "private-session",
      leadContact: "wx:private-contact",
      leadContext: "private buyer context",
    });
    const storedCheckouts = loadCheckouts({ expire: false });
    const stored = storedCheckouts.find((item) => item.id === checkout.id);
    stored.buyerProofs = [{ proofId: "private-proof", text: "private payment text" }];
    stored.payments = [{ externalPaymentId: "private-tx", note: "private payer note" }];
    fs.writeFileSync(path.join(dataDir, "checkouts.json"), JSON.stringify(storedCheckouts, null, 2));

    const view = buyerCheckoutView(stored);
    assert.equal(view.id, checkout.id);
    assert.equal(view.paymentRemark, checkout.paymentRemark);
    assert.equal(view.leadContact, undefined);
    assert.equal(view.leadContext, undefined);
    assert.equal(view.leadSessionId, undefined);
    assert.equal(view.source, undefined);
    assert.equal(view.buyerProofs, undefined);
    assert.equal(view.payments, undefined);

    const response = await request(server, `/api/checkouts/${checkout.id}`);
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body.toString("utf8"));
    assert.equal(body.checkout.paymentRemark, checkout.paymentRemark);
    assert.doesNotMatch(response.body.toString("utf8"), /private-contact|private buyer context|private payment text|private-tx|private payer note/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("public write rate limiter honors trusted proxy addresses and resets by window", () => {
  const buckets = new Map();
  const requestLike = {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const previousTrustProxy = process.env.TRUST_PROXY;
  try {
    process.env.TRUST_PROXY = "1";
    assert.equal(clientAddress(requestLike), "203.0.113.10");
    assert.equal(
      consumePublicRateLimit(requestLike, { scope: "checkout", limit: 2, windowMs: 1000, now: 1000, buckets }).allowed,
      true
    );
    assert.equal(
      consumePublicRateLimit(requestLike, { scope: "checkout", limit: 2, windowMs: 1000, now: 1100, buckets }).allowed,
      true
    );
    const rejected = consumePublicRateLimit(requestLike, { scope: "checkout", limit: 2, windowMs: 1000, now: 1200, buckets });
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.retryAfterSeconds, 1);
    assert.equal(
      consumePublicRateLimit(requestLike, { scope: "checkout", limit: 2, windowMs: 1000, now: 2001, buckets }).allowed,
      true
    );
    process.env.TRUST_PROXY = "0";
    assert.equal(clientAddress(requestLike), "127.0.0.1");
  } finally {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
  }
});

test("direct paid order endpoint requires payment secret when configured", async () => {
  const restore = snapshotData();
  const result = generateSite({ seed: 20261010, count: 1 });
  const experiment = result.lab[0];
  fs.writeFileSync(
    path.join(dataDir, "adapters.json"),
    JSON.stringify({ channels: {}, fulfillment: {}, payments: { webhookSecret: "secret-123" } }, null, 2)
  );
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const rejected = await request(server, "/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, amount: experiment.price, payerNote: "forged" }),
    });
    assert.equal(rejected.status, 401);

    const accepted = await request(server, "/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Payment-Secret": "secret-123" },
      body: JSON.stringify({ experimentId: experiment.id, amount: experiment.price, payerNote: "guarded" }),
    });
    assert.equal(accepted.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("publish agent endpoints reject forged workers when a token is configured", async () => {
  const restore = snapshotData();
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    generateSite({ seed: 20261010, count: 1 });
    exportLocalPublishDrafts(buildPublishQueue());
    fs.writeFileSync(
      path.join(dataDir, "adapters.json"),
      JSON.stringify({ publicBaseUrl: "", channels: {}, fulfillment: {}, payments: {}, publishAgent: { token: "agent-secret" } }, null, 2)
    );

    const rejected = await request(server, "/api/publish-agent/tasks?limit=1");
    assert.equal(rejected.status, 401);

    const accepted = await request(server, "/api/publish-agent/tasks?limit=1", {
      headers: { "X-Publish-Agent-Token": "agent-secret" },
    });
    assert.equal(accepted.status, 200);
    const task = JSON.parse(accepted.body.toString("utf8")).tasks[0];
    assert.equal(Boolean(task.id), true);

    const resultRejected = await request(server, "/api/publish-agent/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, status: "sent" }),
    });
    assert.equal(resultRejected.status, 401);

    const resultAccepted = await request(server, "/api/publish-agent/result", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer agent-secret" },
      body: JSON.stringify({ taskId: task.id, status: "sent", externalUrl: "https://example.com/ok" }),
    });
    assert.equal(resultAccepted.status, 200);
    assert.equal(JSON.parse(resultAccepted.body.toString("utf8")).task.externalUrl, "https://example.com/ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("promotion center prepares three product-image packages and gates Xianyu on attributed generations", () => {
  const restore = snapshotData();
  try {
    fs.writeFileSync(
      path.join(dataDir, "adapters.json"),
      JSON.stringify({ publicBaseUrl: "https://lifeyoume.icu/image", channels: {}, fulfillment: {}, payments: {} })
    );
    const initial = promotionCenterSnapshot({ now: new Date("2026-10-16T08:00:00.000Z") });
    assert.equal(initial.packages.length, 3);
    assert.deepEqual(initial.packages.map((item) => item.type), ["time", "result", "pain"]);
    assert.equal(initial.packages.every((item) => item.trackingUrl.includes("lifeyoume.icu/image/")), true);
    assert.equal(initial.packages.every((item) => item.disclosure.includes("并非客户订单")), true);
    assert.equal(initial.xianyu.unlocked, false);
    assert.doesNotMatch(JSON.stringify(initial.packages), /简历|rewrite|保证销量/);

    for (let index = 0; index < 5; index += 1) {
      appendEvent({
        type: "interaction",
        experimentId: "product-image-batch-studio",
        channel: "landing-view",
        trafficSource: "xiaohongshu",
        campaign: "xhs-w1-time",
        visitorId: `buyer-${index}`,
      });
      appendEvent({
        type: "interaction",
        experimentId: "product-image-batch-studio",
        channel: "image-batch-completed",
        trafficSource: "xiaohongshu",
        campaign: "xhs-w1-time",
        visitorId: `buyer-${index}`,
      });
    }
    appendEvent({
      type: "interaction",
      experimentId: "product-image-batch-studio",
      channel: "image-batch-completed",
      trafficSource: "xiaohongshu",
      campaign: "xhs-w1-time",
      visitorId: "crawler",
      userAgent: "Googlebot/2.1",
    });

    const unlocked = promotionCenterSnapshot({ now: new Date("2026-10-16T09:00:00.000Z") });
    assert.equal(unlocked.funnel.visits, 5);
    assert.equal(unlocked.funnel.generated, 5);
    assert.equal(unlocked.funnel.xhsGenerated, 5);
    assert.equal(unlocked.xianyu.unlocked, true);

    const published = markPromotionPackagePublished("xhs-w1-time", {
      now: new Date("2026-10-16T10:00:00.000Z"),
    });
    assert.equal(published.packages.find((item) => item.id === "xhs-w1-time").status, "published");
  } finally {
    restore();
  }
});

test("mobile promotion center is private and records owner-confirmed publishing", async () => {
  const restore = snapshotData();
  const previousSecret = process.env.ADMIN_API_SECRET;
  const previousPassword = process.env.ADMIN_MOBILE_PASSWORD;
  process.env.ADMIN_API_SECRET = "promotion-admin-secret";
  process.env.ADMIN_MOBILE_PASSWORD = "promotion-phone-password";
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const rejected = await request(server, "/api/admin-mobile/promotion-center");
    assert.equal(rejected.status, 401);

    const login = await request(server, "/api/admin-mobile/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "promotion-phone-password" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const center = await request(server, "/api/admin-mobile/promotion-center", { headers: { Cookie: cookie } });
    assert.equal(center.status, 200);
    assert.equal(JSON.parse(center.body.toString("utf8")).promotion.packages.length, 3);

    const marked = await request(server, "/api/admin-mobile/promotion-packages/xhs-w1-result/published", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    assert.equal(marked.status, 200);
    const resultPackage = JSON.parse(marked.body.toString("utf8")).promotion.packages.find(
      (item) => item.id === "xhs-w1-result"
    );
    assert.equal(resultPackage.status, "published");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = previousSecret;
    if (previousPassword === undefined) delete process.env.ADMIN_MOBILE_PASSWORD;
    else process.env.ADMIN_MOBILE_PASSWORD = previousPassword;
    restore();
  }
});
