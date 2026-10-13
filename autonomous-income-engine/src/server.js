const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  DIST_DIR,
  appendEvent,
  appendServerViewEvent,
  buildLab,
  buildAdapterReadinessPlan,
  buildPublishQueue,
  buildTrafficPlan,
  checkAdapterHealth,
  configureAdaptersFromEnv,
  createCheckout,
  processLeadToolResult,
  processSampleLead,
  processSalesAssistantMessage,
  checkoutStatus,
  checkoutStatusHtml,
  purchaseConfirmationHtml,
  checkoutRecoveryHtml,
  submitCheckoutPaymentProof,
  claimPublishTasks,
  deliverPrepared,
  executeActionPlan,
  generateSite,
  exportLocalPublishDrafts,
  knownExperiments,
  bestOfferVariant,
  publicOfferVariantUrl,
  starterOfferPrice,
  loadAdapters,
  loadActionPlan,
  loadExecutionQueue,
  loadVariantOptimizations,
  loadCheckouts,
  loadLastPaymentSync,
  loadOutbox,
  loadPublishQueue,
  validateAuthoritativePaymentNotification,
  markDelivered,
  prepareDeliveryOutbox,
  publishQueuedTasks,
  publishStaticSite,
  recordPublishResult,
  recordServiceHealthState,
  receivePaymentNotification,
  redeemDeliveryToken,
  recordOrder,
  recordAutonomousSupervisorState,
  runAutopilot,
  runAutonomousCycle,
  runStorefrontCommerceCycle,
  runExecutionQueue,
  startLocalLoopWatcher,
  startPublicAccessMonitor,
  stopManagedPublicTunnelProcesses,
  runWorkerOnce,
  scanOpportunitySources,
  syncPaymentFeed,
  systemStatus,
} = require("./engine");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
};
const publicRateLimitBuckets = new Map();

function staticSiteRoot() {
  const deployTarget = loadAdapters().deploy?.targetDir;
  if (deployTarget && fs.existsSync(path.join(deployTarget, "index.html"))) return path.resolve(deployTarget);
  return DIST_DIR;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function cookieValue(value) {
  return encodeURIComponent(String(value || "")).replace(/[()]/g, escape);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function sendPublicJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function clientAddress(req, env = process.env) {
  if (env.TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);
    if (forwarded) return forwarded.slice(0, 128);
  }
  return String(req.socket?.remoteAddress || "unknown").slice(0, 128);
}

function consumePublicRateLimit(req, {
  scope,
  limit,
  windowMs = 60_000,
  now = Date.now(),
  buckets = publicRateLimitBuckets,
} = {}) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const safeWindowMs = Math.max(1000, Number(windowMs) || 60_000);
  const key = `${scope}:${clientAddress(req)}`;
  const previous = buckets.get(key);
  const bucket =
    previous && now - previous.startedAt < safeWindowMs
      ? previous
      : { startedAt: now, count: 0 };
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [storedKey, stored] of buckets.entries()) {
      if (now - stored.startedAt >= safeWindowMs) buckets.delete(storedKey);
      if (buckets.size <= 8_000) break;
    }
  }
  return {
    allowed: bucket.count <= safeLimit,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + safeWindowMs - now) / 1000)),
  };
}

function enforcePublicRateLimit(req, res, options) {
  const result = consumePublicRateLimit(req, options);
  if (result.allowed) return true;
  res.writeHead(429, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Retry-After": String(result.retryAfterSeconds),
  });
  res.end(JSON.stringify({ ok: false, error: "too many requests; retry later" }));
  return false;
}

function readJson(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        const error = new Error("payload too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        const error = new Error("invalid json");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function adapterSummary() {
  const adapters = loadAdapters();
  const channels = {};
  for (const [channel, config] of Object.entries(adapters.channels || {})) {
    channels[channel] = { configured: Boolean(config.webhookUrl) };
  }
  const growthWebhooks = (adapters.growthWebhooks || []).map((item, index) => ({
    id: item.id || `growth:${index}`,
    configured: Boolean(item.webhookUrl),
    channels: item.channels || ["*"],
  }));
  const growthOutbox = adapters.growthOutbox || {};
  return {
    publicBaseUrl: adapters.publicBaseUrl || "",
    channels,
    growthWebhooks,
    growthOutbox: {
      configured: Boolean(growthOutbox.dir),
      dir: growthOutbox.dir || "",
      channels: growthOutbox.channels || ["*"],
    },
    deploy: {
      configured: Boolean(adapters.deploy?.webhookUrl),
      publicBaseUrl: adapters.deploy?.publicBaseUrl || "",
    },
    fulfillment: {
      configured: Boolean(adapters.fulfillment?.webhookUrl || adapters.fulfillment?.outboxDir),
      webhookConfigured: Boolean(adapters.fulfillment?.webhookUrl),
      outboxConfigured: Boolean(adapters.fulfillment?.outboxDir),
      outboxDir: adapters.fulfillment?.outboxDir || "",
    },
    payments: {
      webhookSecretConfigured: Boolean(adapters.payments?.webhookSecret),
      feedConfigured: Boolean(adapters.payments?.feedUrl || adapters.payments?.feedFile || adapters.payments?.feedDir),
      feedUrlConfigured: Boolean(adapters.payments?.feedUrl),
      feedFileConfigured: Boolean(adapters.payments?.feedFile),
      feedDirConfigured: Boolean(adapters.payments?.feedDir),
      wechatNotifyEndpoint: "/api/wechat-notify",
      wechatNotifyBridgeReady: true,
    },
    search: {
      indexNowConfigured: Boolean(adapters.search?.indexNowEndpoint || adapters.publicBaseUrl),
      indexNowEndpoint: adapters.search?.indexNowEndpoint || "https://api.indexnow.org/indexnow",
    },
    opportunitySources: (adapters.opportunitySources || []).map((item, index) => ({
      id: item.id || `opportunity:${index}`,
      configured: Boolean(item.url || item.inlineText),
      type: item.type || (item.url?.endsWith(".json") ? "json" : "text"),
    })),
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

function adminApiSecret(env = process.env) {
  return String(env.ADMIN_API_SECRET || "");
}

function adminApiAuthorized(req, env = process.env) {
  const secret = adminApiSecret(env);
  if (!secret) return true;
  const provided = req.headers["x-admin-secret"] || readBearerToken(req);
  return safeEqual(provided, secret);
}

function assertAdminApiAllowed(req, env = process.env) {
  if (adminApiAuthorized(req, env)) return;
  const error = new Error("admin API secret is required");
  error.statusCode = 401;
  throw error;
}

function assertPaymentWebhookAllowed(req) {
  const secret = loadAdapters().payments?.webhookSecret;
  if (!secret) return;
  const provided = req.headers["x-payment-secret"] || req.headers["x-webhook-secret"] || readBearerToken(req);
  if (!safeEqual(provided, secret)) {
    const error = new Error("payment webhook secret is required");
    error.statusCode = 401;
    throw error;
  }
}

function assertRuntimeSecurity(env = process.env) {
  const paymentSecret = String(loadAdapters().payments?.webhookSecret || "");
  const adminSecret = adminApiSecret(env);
  if (env.REQUIRE_PAYMENT_WEBHOOK_SECRET === "1") {
    if (!paymentSecret) {
      const error = new Error("PAYMENT_WEBHOOK_SECRET is required when REQUIRE_PAYMENT_WEBHOOK_SECRET=1");
      error.code = "MISSING_PAYMENT_WEBHOOK_SECRET";
      throw error;
    }
    if (Buffer.byteLength(paymentSecret) < 24) {
      const error = new Error("PAYMENT_WEBHOOK_SECRET must be at least 24 bytes");
      error.code = "WEAK_PAYMENT_WEBHOOK_SECRET";
      throw error;
    }
  }
  if (env.REQUIRE_ADMIN_API_SECRET === "1") {
    if (!adminSecret) {
      const error = new Error("ADMIN_API_SECRET is required when REQUIRE_ADMIN_API_SECRET=1");
      error.code = "MISSING_ADMIN_API_SECRET";
      throw error;
    }
    if (Buffer.byteLength(adminSecret) < 24) {
      const error = new Error("ADMIN_API_SECRET must be at least 24 bytes");
      error.code = "WEAK_ADMIN_API_SECRET";
      throw error;
    }
  }
  if (paymentSecret && adminSecret && safeEqual(paymentSecret, adminSecret)) {
    const error = new Error("ADMIN_API_SECRET must be different from PAYMENT_WEBHOOK_SECRET");
    error.code = "SHARED_RUNTIME_SECRET";
    throw error;
  }
}

function authoritativePaymentSourceReady(env = process.env) {
  if (env.REQUIRE_AUTHORITATIVE_PAYMENT_SOURCE !== "1") return true;
  const payments = loadAdapters().payments || {};
  if (payments.feedUrl) return true;
  const sync = loadLastPaymentSync();
  return Boolean(
    sync?.status === "synced" &&
      Number(sync?.seen || 0) > 0 &&
      (sync?.remoteSeen > 0 || sync?.localSeen > 0)
  );
}

function commerceReadiness(env = process.env) {
  const checkoutEnabled = authoritativePaymentSourceReady(env);
  const payments = loadAdapters().payments || {};
  const sync = loadLastPaymentSync();
  const feedConfigured = Boolean(payments.feedUrl || payments.feedFile || payments.feedDir);
  const paymentSourceReason = checkoutEnabled
    ? "ready"
    : !feedConfigured
      ? "payment-feed-not-configured"
      : sync?.status === "failed"
        ? "payment-feed-unreachable"
        : "payment-feed-empty";
  return {
    checkoutEnabled,
    paymentSourceStatus: checkoutEnabled ? "ready" : "waiting",
    paymentSourceReason,
    message: checkoutEnabled
      ? "付款与自动交付通道已就绪。"
      : paymentSourceReason === "payment-feed-empty"
        ? "到账源已配置，但尚未收到可核验的真实到账事件；暂不收款，商品图效果预览仍可使用。"
        : "可靠到账确认源尚未就绪，暂不收款；商品图效果预览仍可直接使用。",
  };
}

function shouldStopPublicTunnelOnShutdown(signal, env = process.env) {
  return signal === "SIGINT" || env.STOP_PUBLIC_TUNNEL_ON_SHUTDOWN === "1";
}

function assertPublishAgentAllowed(req) {
  const token = loadAdapters().publishAgent?.token;
  if (!token) return;
  const provided = req.headers["x-publish-agent-token"] || readBearerToken(req);
  if (!safeEqual(provided, token)) {
    const error = new Error("publish agent token is required");
    error.statusCode = 401;
    throw error;
  }
}

function buyerCheckoutView(checkout = null) {
  if (!checkout) return null;
  const paymentAmount = checkout.paymentAmount || checkout.amount;
  const paymentMatchMode = checkout.paymentMatchMode || "remark";
  const paymentInstruction =
    paymentMatchMode === "exact-amount"
      ? `请精确支付 ¥${paymentAmount}，无需填写长备注`
      : `付款备注：${checkout.paymentRemark}`;
  return {
    id: checkout.id,
    experimentId: checkout.experimentId,
    variantId: checkout.variantId || null,
    amount: checkout.amount,
    listAmount: checkout.listAmount || checkout.amount,
    paymentAmount,
    paymentDiscount: checkout.paymentDiscount || 0,
    paymentMatchMode,
    offer: checkout.offer || null,
    paymentRemark: checkout.paymentRemark,
    paymentInstruction,
    statusUrl: checkout.statusUrl,
    status: checkout.status,
    receivedAmount: checkout.receivedAmount,
    expectedAmount: checkout.expectedAmount,
    shortAmount: checkout.shortAmount,
    proofSubmittedAt: checkout.proofSubmittedAt || null,
    paidAt: checkout.paidAt || null,
    createdAt: checkout.createdAt,
    expiresAt: checkout.expiresAt,
  };
}

function buyerOrderView(order = null) {
  if (!order) return null;
  return {
    id: order.id,
    experimentId: order.experimentId,
    checkoutId: order.checkoutId || null,
    amount: order.amount,
    offer: order.offer || null,
    status: order.status,
    deliveryUrl: order.deliveryUrl || "",
    paidAt: order.paidAt || order.createdAt || null,
    deliveredAt: order.deliveredAt || null,
  };
}

function buyerCheckoutStatusView(status = {}) {
  return {
    checkout: buyerCheckoutView(status.checkout),
    order: buyerOrderView(status.order),
    delivery: status.delivery
      ? {
          status: status.delivery.status,
          deliveryUrl: status.delivery.deliveryUrl || "",
          sentAt: status.delivery.sentAt || null,
        }
      : null,
  };
}

async function handler(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (req.method === "OPTIONS" && urlPath.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }
  if (
    req.method === "POST" &&
    urlPath === "/api/checkouts" &&
    !enforcePublicRateLimit(req, res, { scope: "checkout-create", limit: 20 })
  ) {
    return;
  }
  if (
    req.method === "POST" &&
    urlPath.endsWith("/payment-proof") &&
    !enforcePublicRateLimit(req, res, { scope: "payment-proof", limit: 20 })
  ) {
    return;
  }
  if (
    req.method === "POST" &&
    ["/api/lead-tool-results", "/api/sample-lead", "/api/sales-assistant/message"].includes(urlPath) &&
    !enforcePublicRateLimit(req, res, { scope: "buyer-intent", limit: 30 })
  ) {
    return;
  }
  if (
    req.method === "POST" &&
    urlPath === "/api/events" &&
    !enforcePublicRateLimit(req, res, { scope: "events", limit: 120 })
  ) {
    return;
  }
  const publicApiRoute =
    (req.method === "GET" && (["/api/status", "/api/commerce-readiness"].includes(urlPath) || urlPath.startsWith("/api/checkouts/"))) ||
    (req.method === "POST" &&
      ([
        "/api/events",
        "/api/lead-tool-results",
        "/api/sample-lead",
        "/api/sales-assistant/message",
        "/api/checkouts",
        "/api/orders",
        "/api/payment-notify",
        "/api/wechat-notify",
      ].includes(urlPath) ||
        (urlPath.startsWith("/api/checkouts/") && urlPath.endsWith("/payment-proof")) ||
        urlPath.startsWith("/api/publish-agent/")));
  if (urlPath.startsWith("/api/") && !publicApiRoute) {
    try {
      assertAdminApiAllowed(req);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/regenerate") {
    const result = generateSite();
    return sendJson(res, 200, { ok: true, experiments: result.lab, files: result.files });
  }

  if (req.method === "POST" && urlPath === "/api/autopilot/run") {
    try {
      const body = await readJson(req);
      const run = runAutopilot(body);
      return sendJson(res, 200, { ok: true, run });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/worker/run") {
    try {
      const body = await readJson(req);
      if (body.autonomous === true || body.mode === "autonomous") {
        const cycle = await runAutonomousCycle({ dryRun: Boolean(body.dryRun), seed: body.seed, count: body.count });
        return sendJson(res, 200, { ok: true, cycle });
      }
      const worker = await runWorkerOnce({ dryRun: Boolean(body.dryRun), seed: body.seed, count: body.count });
      return sendJson(res, 200, { ok: true, worker });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/action-plan/execute") {
    try {
      const body = await readJson(req);
      const execution = await executeActionPlan({ dryRun: Boolean(body.dryRun) });
      return sendJson(res, 200, { ok: true, execution });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/payments/sync") {
    try {
      const body = await readJson(req);
      const sync = await syncPaymentFeed({ dryRun: Boolean(body.dryRun) });
      return sendJson(res, 200, { ok: true, sync });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath === "/api/lab") {
    return sendJson(res, 200, { ok: true, experiments: buildLab() });
  }

  if (req.method === "GET" && urlPath === "/api/status") {
    if (!adminApiAuthorized(req)) {
      return sendJson(res, 200, {
        ok: true,
        service: "autonomous-income-engine",
        productId: "product-image-batch-studio",
      });
    }
    return sendJson(res, 200, { ok: true, status: systemStatus() });
  }

  if (req.method === "GET" && urlPath === "/api/commerce-readiness") {
    return sendPublicJson(res, 200, { ok: true, ...commerceReadiness() });
  }

  if (req.method === "GET" && urlPath === "/api/adapters") {
    return sendJson(res, 200, { ok: true, adapters: adapterSummary() });
  }

  if (req.method === "GET" && urlPath === "/api/adapter-health") {
    try {
      const health = await checkAdapterHealth();
      return sendJson(res, 200, { ok: true, health });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath === "/api/adapter-readiness") {
    return sendJson(res, 200, { ok: true, readiness: buildAdapterReadinessPlan() });
  }

  if (req.method === "POST" && urlPath === "/api/opportunity-scan") {
    try {
      const body = await readJson(req);
      const scan = await scanOpportunitySources({ limit: body.limit || 12 });
      return sendJson(res, 200, { ok: true, scan });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath === "/api/action-plan") {
    return sendJson(res, 200, { ok: true, actionPlan: loadActionPlan() });
  }

  if (req.method === "GET" && urlPath === "/api/traffic-plan") {
    return sendJson(res, 200, { ok: true, trafficPlan: buildTrafficPlan() });
  }

  if (req.method === "GET" && urlPath === "/api/execution-queue") {
    return sendJson(res, 200, { ok: true, executionQueue: loadExecutionQueue() });
  }

  if (req.method === "POST" && urlPath === "/api/execution-queue/run") {
    try {
      const body = await readJson(req);
      const run = await runExecutionQueue({
        dryRun: Boolean(body.dryRun),
        limit: body.limit || 20,
      });
      return sendJson(res, 200, { ok: true, run });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath === "/api/variant-optimizations") {
    return sendJson(res, 200, { ok: true, optimizations: loadVariantOptimizations() });
  }

  if (req.method === "GET" && urlPath === "/api/outbox") {
    return sendJson(res, 200, { ok: true, outbox: loadOutbox() });
  }

  if (req.method === "GET" && urlPath === "/api/checkouts") {
    return sendJson(res, 200, { ok: true, checkouts: loadCheckouts() });
  }

  if (req.method === "GET" && urlPath.startsWith("/api/checkouts/")) {
    try {
      const checkoutId = urlPath.split("/")[3];
      return sendPublicJson(res, 200, { ok: true, ...buyerCheckoutStatusView(checkoutStatus(checkoutId)) });
    } catch (error) {
      return sendPublicJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath === "/api/publish-queue") {
    return sendJson(res, 200, { ok: true, tasks: loadPublishQueue() });
  }

  if ((req.method === "GET" || req.method === "POST") && urlPath === "/api/publish-agent/tasks") {
    try {
      assertPublishAgentAllowed(req);
      const query = new URL(req.url || "/", "http://127.0.0.1").searchParams;
      const body = req.method === "POST" ? await readJson(req) : {};
      const tasks = claimPublishTasks({
        limit: body.limit || query.get("limit") || 10,
        channel: body.channel || query.get("channel") || null,
        workerId: body.workerId || query.get("workerId") || "external-publisher",
      });
      return sendJson(res, 200, { ok: true, tasks });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/publish-agent/result") {
    try {
      assertPublishAgentAllowed(req);
      const task = recordPublishResult(await readJson(req));
      return sendJson(res, 200, { ok: true, task });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/publish-queue/rebuild") {
    const tasks = buildPublishQueue();
    return sendJson(res, 200, { ok: true, tasks });
  }

  if (req.method === "POST" && urlPath === "/api/publish-queue/export-local-drafts") {
    const tasks = exportLocalPublishDrafts();
    return sendJson(res, 200, { ok: true, tasks });
  }

  if (req.method === "POST" && urlPath === "/api/publish-queue/send") {
    try {
      const body = await readJson(req);
      const publish = await publishQueuedTasks({ dryRun: Boolean(body.dryRun) });
      return sendJson(res, 200, { ok: true, publish });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/outbox/prepare") {
    const outbox = prepareDeliveryOutbox();
    return sendJson(res, 200, { ok: true, outbox });
  }

  if (req.method === "POST" && urlPath === "/api/outbox/send") {
    try {
      const body = await readJson(req);
      const delivery = await deliverPrepared({ dryRun: Boolean(body.dryRun) });
      return sendJson(res, 200, { ok: true, delivery });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/publish") {
    try {
      const publish = publishStaticSite();
      return sendJson(res, 200, { ok: true, publish });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/events") {
    try {
      const body = await readJson(req);
      const event = appendEvent({
        ...body,
        userAgent: req.headers["user-agent"] || body.userAgent || "",
        remoteAddress: clientAddress(req),
      });
      return sendJson(res, 201, { ok: true, event });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/lead-tool-results") {
    try {
      const result = processLeadToolResult(await readJson(req));
      return sendJson(res, 201, { ok: true, result });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/sample-lead") {
    try {
      const result = processSampleLead(await readJson(req));
      return sendJson(res, 201, { ok: true, result });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/sales-assistant/message") {
    try {
      const result = processSalesAssistantMessage(await readJson(req));
      return sendJson(res, 201, { ok: true, result });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/checkouts") {
    try {
      if (!authoritativePaymentSourceReady()) {
        const error = new Error("付款入口正在等待可靠到账确认源，暂未开放收款；请稍后再试。");
        error.statusCode = 503;
        throw error;
      }
      const checkout = createCheckout(await readJson(req));
      return sendPublicJson(res, 201, { ok: true, checkout: buyerCheckoutView(checkout) });
    } catch (error) {
      return sendPublicJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath.startsWith("/api/checkouts/") && urlPath.endsWith("/payment-proof")) {
    try {
      const checkoutId = urlPath.split("/")[3];
      const payment = submitCheckoutPaymentProof(checkoutId, await readJson(req));
      return sendJson(res, 201, {
        ok: true,
        payment: {
          status: payment.status,
          checkout: buyerCheckoutView(payment.checkout),
          order: buyerOrderView(payment.order),
          delivery: payment.delivery
            ? {
                status: payment.delivery.status,
                deliveryUrl: payment.delivery.deliveryUrl || "",
                sentAt: payment.delivery.sentAt || null,
              }
            : null,
          duplicate: Boolean(payment.duplicate),
          verificationRequired: Boolean(payment.verificationRequired),
        },
      });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/orders") {
    try {
      assertPaymentWebhookAllowed(req);
      const order = recordOrder(await readJson(req));
      return sendJson(res, 201, { ok: true, order });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/payment-notify") {
    try {
      assertPaymentWebhookAllowed(req);
      const payload = validateAuthoritativePaymentNotification(await readJson(req));
      const payment = receivePaymentNotification(payload);
      return sendJson(res, 201, { ok: true, payment });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/wechat-notify") {
    try {
      assertPaymentWebhookAllowed(req);
      const payload = validateAuthoritativePaymentNotification(await readJson(req));
      const payment = receivePaymentNotification(payload);
      return sendJson(res, 201, { ok: true, payment, parsed: payload });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && urlPath.startsWith("/api/orders/") && urlPath.endsWith("/deliver")) {
    try {
      const orderId = urlPath.split("/")[3];
      const order = markDelivered(orderId);
      return sendJson(res, 200, { ok: true, order });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath.startsWith("/t/")) {
    const [, , experimentId, channel = "unknown"] = urlPath.split("/");
    const experiment = knownExperiments().find((item) => item.id === experimentId);
    const variant = experiment ? bestOfferVariant(experiment) : null;
    appendEvent({ type: "click", experimentId, channel, variantId: variant?.id || null });
    res.writeHead(302, {
      Location: variant ? `/offer/${encodeURIComponent(experimentId)}--${encodeURIComponent(variant.id)}.html` : `/offer/${encodeURIComponent(experimentId)}.html`,
      "Cache-Control": "no-store",
    });
    return res.end();
  }

  if (req.method === "GET" && urlPath.startsWith("/buy/")) {
    try {
      const [, , experimentId, variantId = ""] = urlPath.split("/");
      const query = new URL(req.url || "/", "http://127.0.0.1").searchParams;
      const source = query.get("source") || "server-buy-link";
      const html = purchaseConfirmationHtml({
        experimentId,
        variantId: variantId || query.get("variantId") || null,
        source,
        offer: query.get("offer") === "starter" ? "starter" : null,
      });
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(html);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath.startsWith("/deliver/")) {
    try {
      const token = urlPath.split("/")[2];
      const delivery = redeemDeliveryToken(token);
      const extension = path.extname(delivery.file || delivery.token.deliveryFile || "").toLowerCase();
      const isHtml = extension === ".html";
      res.writeHead(200, {
        "Content-Type": isHtml ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${isHtml ? "inline" : "attachment"}; filename="${delivery.token.experimentId}${isHtml ? ".html" : ".md"}"`,
      });
      return res.end(delivery.content);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath.startsWith("/checkout/")) {
    try {
      const checkoutId = urlPath.split("/")[2];
      const html = checkoutStatusHtml(checkoutId);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return res.end(html);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && urlPath.startsWith("/recover/")) {
    try {
      const checkoutId = urlPath.split("/")[2];
      const html = checkoutRecoveryHtml(checkoutId);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return res.end(html);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { ok: false, error: "method not allowed" });
  }

  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) generateSite();

  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const siteRoot = staticSiteRoot();
  const file = path.resolve(siteRoot, relative);
  if (!file.startsWith(`${siteRoot}${path.sep}`) && file !== path.join(siteRoot, "index.html")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(file, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    if (path.extname(file) === ".html") {
      appendServerViewEvent(urlPath, {
        userAgent: req.headers["user-agent"] || "",
        remoteAddress: req.socket?.remoteAddress || "",
      });
    }
    res.end(content);
  });
}

if (require.main === module) {
  if (process.env.ADAPTERS_FROM_ENV === "1") {
    const summary = configureAdaptersFromEnv(process.env);
    console.log(`已从环境变量装载外部链路：provided=${summary.provided.length} missingCore=${summary.missingCore.length}`);
  }
  assertRuntimeSecurity(process.env);
  generateSite();
  const preferredPort = Number(process.env.PORT || 4188);
  const listenHost = String(process.env.HOST || "127.0.0.1");
  const server = http.createServer(handler);
  let port = preferredPort;
  let workerTimer = null;
  let paymentTimer = null;
  let commerceTimer = null;
  let publicAccessMonitor = null;
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (workerTimer) clearInterval(workerTimer);
    if (paymentTimer) clearInterval(paymentTimer);
    if (commerceTimer) clearInterval(commerceTimer);
    const stopPublicTunnel = shouldStopPublicTunnelOnShutdown(signal, process.env);
    const monitorStop = publicAccessMonitor?.stop({ stopActiveTunnel: stopPublicTunnel });
    const startingTunnelsStop = stopPublicTunnel
      ? stopManagedPublicTunnelProcesses()
      : { stopped: 0, results: [], reason: "tunnels-preserved-for-service-restart" };
    console.log(
      `服务停止：signal=${signal} tunnelPolicy=${stopPublicTunnel ? "stop" : "preserve"} tunnelStopped=${Boolean(monitorStop?.tunnel?.stopped)} startingTunnelsStopped=${startingTunnelsStop.stopped}`
    );
    server.close(() => process.exit(0));
    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref?.();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT && port < preferredPort + 20) {
      port += 1;
      server.listen(port, listenHost);
      return;
    }
    throw error;
  });

  server.on("listening", () => {
    console.log(`自动收入引擎：http://${listenHost}:${port}`);
    recordServiceHealthState({
      status: "up",
      port,
      pid: process.pid,
      started: false,
      source: "server-listening",
      probe: { ok: true, status: "up", port, statusCode: 200 },
    });
    if (process.env.PAYMENT_AUTOSYNC !== "0") {
      const intervalSeconds = Math.max(5, Number(process.env.PAYMENT_SYNC_INTERVAL_SECONDS || 15));
      let paymentSyncInFlight = null;
      const syncPayments = () => {
        if (paymentSyncInFlight) return paymentSyncInFlight;
        paymentSyncInFlight = syncPaymentFeed({ dryRun: false })
          .then((summary) => {
            if ((summary.created || 0) > 0 || (summary.failed || 0) > 0) {
              console.log(`付款自动同步：created=${summary.created || 0} duplicate=${summary.duplicates || 0} failed=${summary.failed || 0}`);
            }
            return summary;
          })
          .catch((error) => {
            console.error(`付款自动同步失败：${error.message}`);
          })
          .finally(() => {
            paymentSyncInFlight = null;
          });
        return paymentSyncInFlight;
      };
      syncPayments();
      paymentTimer = setInterval(syncPayments, intervalSeconds * 1000);
      paymentTimer.unref?.();
      console.log(`真实付款同步已开启：每 ${intervalSeconds} 秒检查一次，仅独立支付通知可触发交付`);
    }
    if (process.env.PUBLIC_ACCESS_MONITOR !== "0") {
      const intervalMs = Math.max(10000, Number(process.env.PUBLIC_ACCESS_INTERVAL_MS || 60000));
      const failureThreshold = Math.max(2, Number(process.env.PUBLIC_ACCESS_FAILURE_THRESHOLD || 3));
      publicAccessMonitor = startPublicAccessMonitor({
        port,
        intervalMs,
        failureThreshold,
        probeTimeoutMs: Math.max(1000, Number(process.env.PUBLIC_ACCESS_PROBE_TIMEOUT_MS || 5000)),
        unref: true,
      });
      publicAccessMonitor.run()
        .then((state) => console.log(`公网入口监控：${state.status} url=${state.publicUrl || ""} failures=${state.consecutiveFailures || 0}`))
        .catch((error) => console.error(`公网入口监控启动失败：${error.message}`));
      console.log(`公网入口自动自愈已开启：每 ${Math.round(intervalMs / 1000)} 秒探活，连续 ${failureThreshold} 次失败后切换入口`);
    }
    if (process.env.COMMERCE_AUTORUN !== "0") {
      const intervalSeconds = Math.max(60, Number(process.env.COMMERCE_INTERVAL_SECONDS || 900));
      let commerceInFlight = null;
      const runCommerce = () => {
        if (commerceInFlight) return commerceInFlight;
        commerceInFlight = runStorefrontCommerceCycle({ dryRun: false })
          .then((cycle) => {
            console.log(
              `固定商品商务循环：product=${cycle.productId} orders=${cycle.orders} revenue=${cycle.revenue} payments=${cycle.paymentsCreated} fulfilled=${cycle.fulfillmentSent + cycle.fulfillmentHandedOff} search=${cycle.searchStatus}`
            );
            return cycle;
          })
          .catch((error) => {
            console.error(`固定商品商务循环失败：${error.message}`);
          })
          .finally(() => {
            commerceInFlight = null;
          });
        return commerceInFlight;
      };
      runCommerce();
      commerceTimer = setInterval(runCommerce, intervalSeconds * 1000);
      commerceTimer.unref?.();
      console.log(`固定商品商务循环已开启：每 ${intervalSeconds} 秒维护获客、付款与交付闭环`);
    }
    if (process.env.WORKER_AUTORUN === "1") {
      const intervalSeconds = Math.max(5, Number(process.env.WORKER_INTERVAL_SECONDS || 300));
      const dryRun = process.env.WORKER_DRY_RUN === "1";
      let inFlight = null;
      const tick = () => {
        if (inFlight) {
          const state = recordAutonomousSupervisorState({
            status: "skipped-overlap",
            port,
            intervalSeconds,
            dryRun,
            reason: "previous-cycle-still-running",
          });
          console.log(`自主循环跳过重叠 tick：${state.at}`);
          return inFlight;
        }
        const startedAt = new Date().toISOString();
        recordAutonomousSupervisorState({
          status: "running",
          port,
          intervalSeconds,
          dryRun,
          startedAt,
        });
        inFlight = runAutonomousCycle({ dryRun, ensureService: true, servicePort: port }).then((cycle) => {
          const worker = cycle.worker;
          const executed = cycle.actionExecution.results.filter((item) => item.status === "executed").length;
          const external = cycle.actionExecution.results.filter((item) => item.status === "needs-external-agent").length;
          const agent = cycle.publishAgent || {};
          const queue = cycle.executionQueueRun || {};
          recordAutonomousSupervisorState({
            status: "idle",
            port,
            intervalSeconds,
            dryRun,
            startedAt,
            lastCycleId: cycle.id,
            lastCycleAt: cycle.at,
            lastExecutionQueueRunId: queue.id || "",
            lastSummary: {
              deployed: worker.deployed,
              deployBlocked: worker.deployBlocked,
              published: worker.published,
              publishHandedOff: worker.publishHandedOff || 0,
              publishBlocked: worker.publishBlocked,
              fulfilled: worker.fulfilled,
              fulfillmentHandedOff: worker.fulfillmentHandedOff || 0,
              fulfillmentBlocked: worker.fulfillmentBlocked,
              searchSubmitted: worker.searchSubmitted,
              searchBlocked: worker.searchBlocked,
              queueExecuted: queue.executed || 0,
              queueBlocked: queue.blocked || 0,
              queueFailed: queue.failed || 0,
              planExecuted: executed,
              externalNeeded: external,
              agentSent: agent.sent || 0,
              agentHandedOff: agent.handedOff || 0,
              agentBlocked: agent.blocked || 0,
              agentFailed: agent.failed || 0,
            },
          });
          console.log(
            `自主循环：${cycle.id} deployed=${worker.deployed} deployBlocked=${worker.deployBlocked} published=${worker.published} publishHandedOff=${worker.publishHandedOff || 0} publishBlocked=${worker.publishBlocked} queueExecuted=${queue.executed || 0} queueHandedOff=${queue.handedOff || 0} queueBlocked=${queue.blocked || 0} queueFailed=${queue.failed || 0} agentSent=${agent.sent || 0} agentHandedOff=${agent.handedOff || 0} agentBlocked=${agent.blocked || 0} agentFailed=${agent.failed || 0} fulfilled=${worker.fulfilled} fulfillmentHandedOff=${worker.fulfillmentHandedOff || 0} fulfillmentBlocked=${worker.fulfillmentBlocked} searchSubmitted=${worker.searchSubmitted} searchBlocked=${worker.searchBlocked} planExecuted=${executed} externalNeeded=${external}`
          );
        }).catch((error) => {
          recordAutonomousSupervisorState({
            status: "failed",
            port,
            intervalSeconds,
            dryRun,
            startedAt,
            error: error.message,
          });
          console.error(`自主循环失败：${error.message}`);
        }).finally(() => {
          inFlight = null;
        });
        return inFlight;
      };
      tick();
      workerTimer = setInterval(tick, intervalSeconds * 1000);
      workerTimer.unref?.();
      console.log(`自主赚钱循环已开启：每 ${intervalSeconds} 秒运行一次${dryRun ? "（dry-run）" : ""}`);
    }
    if (process.env.LOCAL_LOOP_WATCH === "1") {
      const dryRun = process.env.LOCAL_LOOP_DRY_RUN === "1";
      const debounceMs = Math.max(50, Number(process.env.LOCAL_LOOP_DEBOUNCE_MS || 500));
      const watcher = startLocalLoopWatcher({ dryRun, debounceMs, unref: true });
      console.log(`本地闭环目录监听已开启：directories=${watcher.directories.length} debounceMs=${debounceMs}${dryRun ? "（dry-run）" : ""}`);
      watcher.run("startup").catch((error) => console.error(`本地闭环启动同步失败：${error.message}`));
    }
  });

  server.listen(port, listenHost);
}

module.exports = {
  handler,
  staticSiteRoot,
  assertRuntimeSecurity,
  adminApiAuthorized,
  assertAdminApiAllowed,
  buyerCheckoutView,
  buyerCheckoutStatusView,
  clientAddress,
  consumePublicRateLimit,
  shouldStopPublicTunnelOnShutdown,
};
