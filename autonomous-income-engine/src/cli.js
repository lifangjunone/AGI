const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { spawn } = require("node:child_process");
const {
  buildLab,
  buildAdapterReadinessPlan,
  buildActionPlan,
  buildExecutionQueue,
  buildPublishQueue,
  buildTrafficPlan,
  bootstrapLocalLoop,
  checkAdapterHealth,
  configureAdaptersFromEnv,
  configurePublicBaseUrl,
  createCheckout,
  consumeResultInboxes,
  deliverPrepared,
  executeActionPlan,
  exportLocalPublishDrafts,
  featuredExperiment,
  generateSite,
  loadAdapters,
  loadExecutionQueue,
  loadOutbox,
  loadPublishQueue,
  ensureCheckoutService,
  normalizeWechatPaymentNotification,
  markDelivered,
  prepareDeliveryOutbox,
  publishQueuedTasks,
  publishGrowthOutboxToOwnedSite,
  publishStaticSite,
  publicTunnelProviders,
  recordPublicAccessAttempt,
  recordAutonomousSupervisorState,
  resolveBundledNpxCommand,
  receivePaymentNotification,
  recordOrder,
  runAutopilot,
  runAutonomousCycle,
  runAutonomousSupervisorOnce,
  runExecutionQueue,
  runLocalLoopOnce,
  runPublishAgentOnce,
  runWorkerOnce,
  saveAdapters,
  scanOpportunitySources,
  startLocalLoopWatcher,
  syncPaymentFeed,
  systemStatus,
  DIST_DIR,
} = require("./engine");
const { handler: mockAdapterHandler, resetCalls: resetMockAdapterCalls } = require("./mock-adapter");

const command = process.argv[2] || "run";

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function chooseTunnelCommand({ port, provider, subdomain }) {
  if (provider === "cloudflared") return { command: "cloudflared", args: ["tunnel", "--url", `http://127.0.0.1:${port}`] };
  if (provider === "tunnelmole") {
    return {
      command: resolveBundledNpxCommand(),
      args: ["--yes", "tunnelmole", String(port), ...(subdomain ? ["as", `${subdomain}.tunnelmole.net`] : [])],
    };
  }
  if (provider === "localtunnel") {
    return {
      command: resolveBundledNpxCommand(),
      args: ["--yes", "localtunnel", "--port", String(port), ...(subdomain ? ["--subdomain", subdomain] : [])],
    };
  }
  return null;
}

function extractPublicTunnelUrl(text) {
  const matches = String(text || "").match(/https:\/\/[A-Za-z0-9.-]+(?:trycloudflare\.com|loca\.lt|localtunnel\.me|tunnelmole\.net|ngrok-free\.app|ngrok\.io)[^\s"']*/g);
  return matches?.[0]?.replace(/[),.]+$/, "") || "";
}

function startPublicTunnel({ port = 4188, provider = "auto", subdomain = "", timeoutMs = 45000 } = {}) {
  const candidates = publicTunnelProviders(provider);
  let index = 0;
  const startedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tryNext = (lastError = null) => {
      if (index >= candidates.length) {
        reject(lastError || new Error("no public tunnel provider succeeded"));
        return;
      }
      const selected = candidates[index++];
      const spec = chooseTunnelCommand({ port, provider: selected, subdomain });
      if (!spec) {
        tryNext(new Error(`unsupported tunnel provider: ${selected}`));
        return;
      }
      const child = spawn(spec.command, spec.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
      let settled = false;
      let buffer = "";
      const timer = setTimeout(() => {
        if (settled) return;
        child.kill("SIGTERM");
        tryNext(new Error(`timed out waiting for ${selected} public URL`));
      }, timeoutMs);
      const onData = (chunk) => {
        const text = chunk.toString("utf8");
        process.stdout.write(text);
        buffer += text;
        const publicUrl = extractPublicTunnelUrl(buffer);
        if (!publicUrl || settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          status: "running",
          provider: selected,
          command: `${spec.command} ${spec.args.join(" ")}`,
          publicUrl,
          pid: child.pid,
          startedAt,
          process: child,
        });
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tryNext(error);
      });
      child.on("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tryNext(new Error(`${selected} exited before exposing a URL: code=${code} signal=${signal || ""}`));
      });
    };
    tryNext();
  });
}

function waitForPublicUrl(url, { timeoutMs = 30000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  return new Promise((resolve, reject) => {
    const probe = () => {
      const client = String(url).startsWith("https:") ? https : http;
      const req = client.get(url, { headers: { Accept: "text/html,application/json" } }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ status: "reachable", statusCode: res.statusCode, url });
          return;
        }
        lastError = `HTTP ${res.statusCode}`;
        if (Date.now() >= deadline) {
          reject(new Error(`public URL is not reachable yet: ${lastError}`));
          return;
        }
        setTimeout(probe, intervalMs);
      });
      req.setTimeout(Math.min(intervalMs, 5000), () => {
        req.destroy(new Error("probe timeout"));
      });
      req.on("error", (error) => {
        lastError = error.message;
        if (Date.now() >= deadline) {
          reject(new Error(`public URL is not reachable yet: ${lastError}`));
          return;
        }
        setTimeout(probe, intervalMs);
      });
    };
    probe();
  });
}

function requestJson(baseUrl, pathname, { method = "GET", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, baseUrl);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      target,
      {
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`request ${method} ${target.href} failed with ${res.statusCode}: ${text}`);
            error.statusCode = res.statusCode;
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(text || "{}"));
          } catch {
            reject(new Error(`request ${method} ${target.href} returned invalid json`));
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function listen(server, port = 0) {
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server.address()));
  });
}

function demoSeed() {
  return Number(argValue("--seed", String(Date.now())));
}

if (command === "run") {
  const result = generateSite();
  console.log(`已生成 ${result.lab.length} 个自动赚钱实验`);
  console.log(`仪表盘：${path.join(DIST_DIR, "index.html")}`);
  console.log(`最高分实验：${result.lab.sort((a, b) => b.score - a.score)[0].title}`);
} else if (command === "autopilot") {
  const run = runAutopilot();
  console.log(`Autopilot 已运行：${run.id}`);
  console.log(`实验数：${run.experiments}`);
  console.log(`本地静态站：${run.staticSite}`);
  console.log(`待发布任务：${run.publishTasks}`);
  console.log(`本地发布草稿：${run.exportedDrafts}`);
  console.log(`待交付任务：${run.pendingDeliveries}`);
} else if (command === "worker") {
  runWorkerOnce({ dryRun: process.argv.includes("--dry-run") })
    .then((worker) => {
      console.log(`Worker 已运行：${worker.id}`);
      console.log(`公网部署：deployed=${worker.deployed} blocked=${worker.deployBlocked}`);
      console.log(`发送发布：${worker.published}`);
      console.log(`发布阻塞：${worker.publishBlocked}`);
      console.log(`同步付款：created=${worker.paymentsCreated} duplicate=${worker.paymentsDuplicate} failed=${worker.paymentsFailed} blocked=${worker.paymentsBlocked}`);
      console.log(`发送交付：${worker.fulfilled}`);
      console.log(`交付阻塞：${worker.fulfillmentBlocked}`);
      console.log(`搜索提交：submitted=${worker.searchSubmitted} blocked=${worker.searchBlocked}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "execute-plan") {
  executeActionPlan({ dryRun: process.argv.includes("--dry-run") })
    .then((execution) => {
      console.log(`行动计划已执行：${execution.id}`);
      for (const item of execution.results) {
        console.log(`${item.action}\t${item.status}\t${item.sent ?? item.created ?? item.count ?? item.runId ?? ""}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "daemon") {
  const intervalSeconds = Math.max(5, Number(argValue("--interval", "300")));
  const dryRun = process.argv.includes("--dry-run");
  const servicePort = Number(argValue("--service-port", process.env.PORT || "4188"));
  console.log(`自主赚钱监督器常驻启动：每 ${intervalSeconds} 秒运行一次${dryRun ? "（dry-run）" : ""}`);
  const tick = () => {
    runAutonomousSupervisorOnce({
      dryRun,
      ensureService: !process.argv.includes("--no-service-heal"),
      servicePort,
      executionQueueLimit: Number(argValue("--limit", "120")),
      publishAgentLimit: Number(argValue("--publish-agent-limit", "20")),
      ownedPublishLimit: Number(argValue("--owned-publish-limit", "160")),
      expansionCount: Number(argValue("--expand-count", "8")),
      minExpansionIntervalSeconds: Number(argValue("--min-expansion-interval", "300")),
    })
      .then((run) => {
        console.log(
          `[${run.at}] outcome=${run.outcome} revenue=¥${run.after.revenue} orders=${run.after.orders} checkouts=${run.after.checkouts.total} funnel=${run.afterFunnel?.stage || "unknown"} expanded=${run.expansion ? "yes" : "no"} queueExecuted=${run.executionQueueRun?.executed || 0} queueBlocked=${run.executionQueueRun?.blocked || 0} queueFailed=${run.executionQueueRun?.failed || 0}`
        );
      })
      .catch((error) => {
        recordAutonomousSupervisorState({ status: "failed", mode: "money-funnel-supervisor", error: error.message });
        console.error(`[${new Date().toISOString()}] autonomous cycle failed: ${error.message}`);
      });
  };
  tick();
  setInterval(tick, intervalSeconds * 1000);
} else if (command === "lab") {
  const lab = buildLab();
  for (const item of lab.sort((a, b) => b.score - a.score)) {
    console.log(`${item.score}\t${item.decision}\t¥${item.price}\t${item.id}\t${item.title}`);
  }
} else if (command === "traffic-plan") {
  const plan = buildTrafficPlan();
  console.log(`流量行动预算：budget=${plan.budget} allocations=${plan.allocations.length}`);
  for (const item of plan.allocations.slice(0, 10)) {
    const active = item.channels.filter((channel) => ["active", "owned", "configured"].includes(channel.status)).map((channel) => channel.channel).join(",");
    const blocked = item.channels.filter((channel) => channel.status === "blocked").map((channel) => channel.channel).join(",");
    console.log(`${item.score}\tbudget=${item.budget}\tactive=${active || "-"}\tblocked=${blocked || "-"}\t${item.experimentId}\t${item.title}`);
  }
} else if (command === "execution-queue") {
  const queue = process.argv.includes("--no-rebuild")
    ? loadExecutionQueue()
    : (() => {
        const lab = [featuredExperiment()];
        const trafficPlan = buildTrafficPlan({ lab });
        const publishQueue = buildPublishQueue(lab);
        const actionPlan = buildActionPlan({ publishQueue });
        return buildExecutionQueue({ actionPlan, trafficPlan, publishQueue });
      })();
  console.log(`执行队列：tasks=${queue.tasks.length}`);
  for (const item of queue.tasks.slice(0, 20)) {
    console.log(`${item.priority || 0}\t${item.status}\t${item.kind}\t${item.action}\t${item.target}\t${item.reason || ""}`);
  }
} else if (command === "run-execution-queue") {
  runExecutionQueue({
    dryRun: process.argv.includes("--dry-run"),
    limit: Number(argValue("--limit", "20")),
  })
    .then((run) => {
      console.log(`执行队列已运行：${run.id}`);
      console.log(`attempted=${run.attempted} executed=${run.executed} blocked=${run.blocked} dryRunReady=${run.dryRunReady} skipped=${run.skipped} failed=${run.failed}`);
      for (const item of run.results) {
        console.log(`${item.status}\t${item.kind}\t${item.action}\t${item.target}${item.reason ? `\t${item.reason}` : ""}${item.error ? `\t${item.error}` : ""}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "expand-traffic-surface") {
  const { expandTrafficSurface } = require("./engine");
  expandTrafficSurface({
    dryRun: process.argv.includes("--dry-run"),
    seed: Number(argValue("--seed", String(Date.now()))),
    count: Number(argValue("--count", "8")),
  })
    .then((run) => {
      console.log(`扩流面已生成：${run.id}`);
      console.log(`round=${run.round} signalsAdded=${run.signalsAdded} experiments=${run.experiments} demandPages=${run.demandPages}`);
      console.log(`ownedPublished=${run.ownedPublished} ownedRefreshed=${run.ownedRefreshed} searchStatus=${run.searchStatus} submitted=${run.searchSubmitted} discovered=${run.searchDiscovered}`);
      console.log(`primaryRoute=${run.primaryRoute}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "supervisor-once") {
  runAutonomousSupervisorOnce({
    dryRun: process.argv.includes("--dry-run"),
    seed: Number(argValue("--seed", String(Date.now()))),
    executionQueueLimit: Number(argValue("--limit", "120")),
    publishAgentLimit: Number(argValue("--publish-agent-limit", "20")),
    ownedPublishLimit: Number(argValue("--owned-publish-limit", "160")),
    expansionCount: Number(argValue("--expand-count", "8")),
    minExpansionIntervalSeconds: Number(argValue("--min-expansion-interval", "300")),
    ensureService: !process.argv.includes("--no-service-heal"),
    servicePort: Number(argValue("--service-port", process.env.PORT || "4188")),
  })
    .then((run) => {
      console.log(`自主赚钱监督器已运行：${run.id}`);
      console.log(`outcome=${run.outcome} revenue=¥${run.after.revenue} revenueDelta=¥${run.revenueDelta} orders=${run.after.orders} orderDelta=${run.orderDelta} checkouts=${run.after.checkouts.total} checkoutDelta=${run.checkoutDelta}`);
      console.log(`funnel=${run.afterFunnel?.stage || "unknown"} diagnosis=${run.afterFunnel?.diagnosis || ""}`);
      console.log(`expanded=${run.expansion ? "yes" : "no"} reason=${run.expansionDecision?.reason || ""}`);
      for (const item of run.steps) {
        console.log(`${item.status}\t${item.action}${item.reason ? `\t${item.reason}` : ""}`);
      }
    })
    .catch((error) => {
      recordAutonomousSupervisorState({ status: "failed", mode: "money-funnel-supervisor", error: error.message });
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "publish") {
  const publish = publishStaticSite();
  console.log(`已发布到本地静态目录：${publish.directory}`);
  console.log(`入口文件：${publish.entry}`);
} else if (command === "publish-queue") {
  const tasks = process.argv.includes("--rebuild") ? buildPublishQueue() : loadPublishQueue();
  if (!tasks.length) {
    console.log("发布队列为空，可运行：node src/cli.js publish-queue --rebuild");
  } else {
    for (const item of tasks) {
      console.log(`${item.status}\t${item.channel}\t${item.experimentId}`);
    }
  }
} else if (command === "send-publish") {
  publishQueuedTasks({ dryRun: process.argv.includes("--dry-run") })
    .then((publish) => {
      for (const item of publish.results) {
        console.log(`${item.status}\t${item.taskId}${item.reason ? `\t${item.reason}` : ""}${item.error ? `\t${item.error}` : ""}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "publish-agent") {
  runPublishAgentOnce({
    dryRun: process.argv.includes("--dry-run"),
    limit: Number(argValue("--limit", "10")),
    channel: argValue("--channel", null),
    workerId: argValue("--worker-id", "local-publish-agent"),
  })
    .then((summary) => {
      console.log(`发布 Agent 已运行：${summary.id}`);
      console.log(`claimed=${summary.claimed} sent=${summary.sent} blocked=${summary.blocked} failed=${summary.failed}`);
      for (const item of summary.results) {
        console.log(`${item.status}\t${item.taskId}\t${item.publishUrl || ""}${item.variantId ? `\tvariant=${item.variantId}` : ""}${item.reason ? `\t${item.reason}` : ""}${item.error ? `\t${item.error}` : ""}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "sync-payments") {
  syncPaymentFeed({ dryRun: process.argv.includes("--dry-run") })
    .then((sync) => {
      console.log(`付款同步：${sync.status}`);
      console.log(`seen=${sync.seen} created=${sync.created} duplicate=${sync.duplicates} failed=${sync.failed}`);
      if (sync.reason) console.log(`blocked=${sync.reason}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "sync-results") {
  const sync = consumeResultInboxes({ dryRun: process.argv.includes("--dry-run") });
  console.log(`结果回写同步：consumed=${sync.consumed} blocked=${sync.blocked} failed=${sync.failed}`);
  console.log(`发布结果：status=${sync.growth.status} consumed=${sync.growth.consumed || 0} stale=${sync.growth.stale || 0} failed=${sync.growth.failed || 0}${sync.growth.reason ? ` reason=${sync.growth.reason}` : ""}`);
  console.log(`交付结果：status=${sync.fulfillment.status} consumed=${sync.fulfillment.consumed || 0} failed=${sync.fulfillment.failed || 0}${sync.fulfillment.reason ? ` reason=${sync.fulfillment.reason}` : ""}`);
} else if (command === "service-health") {
  ensureCheckoutService({
    port: Number(argValue("--port", process.env.PORT || "4188")),
    timeoutMs: Number(argValue("--timeout-ms", "8000")),
  })
    .then((health) => {
      console.log(`收款服务：status=${health.status} port=${health.port} started=${health.started ? "yes" : "no"} pid=${health.pid || "-"}`);
      if (health.error) console.log(`error=${health.error}`);
      console.log(`log=${health.logFile}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "owned-site-publisher") {
  const summary = publishGrowthOutboxToOwnedSite({
    dryRun: process.argv.includes("--dry-run"),
    limit: Number(argValue("--limit", "50")),
  });
  console.log(`自有站点发布器：status=${summary.status} published=${summary.published || 0} dryRunReady=${summary.dryRunReady || 0} failed=${summary.failed || 0}`);
  for (const item of summary.results || []) {
    console.log(`${item.status}\t${item.taskId || "-"}\t${item.externalUrl || item.error || ""}`);
  }
} else if (command === "local-loop-once") {
  runLocalLoopOnce({
    dryRun: process.argv.includes("--dry-run"),
    executionQueueLimit: Number(argValue("--limit", "20")),
    localOnly: !process.argv.includes("--include-external"),
    ensureService: !process.argv.includes("--no-service-heal"),
    servicePort: Number(argValue("--service-port", process.env.PORT || "4188")),
  })
    .then((run) => {
      console.log(`本地闭环已运行：${run.id}`);
      console.log(`service=${run.serviceHealth?.status || "unknown"} paymentsCreated=${run.paymentsCreated} resultsConsumed=${run.resultsConsumed} fulfilled=${run.fulfilled} queueExecuted=${run.queueExecuted} queueBlocked=${run.queueBlocked} queueFailed=${run.queueFailed}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "watch-local-loop") {
  const dryRun = process.argv.includes("--dry-run");
  const debounceMs = Number(argValue("--debounce-ms", "500"));
  const servicePort = Number(argValue("--service-port", process.env.PORT || "4188"));
  const watcher = startLocalLoopWatcher({
    dryRun,
    debounceMs,
    onRun: (options) => runLocalLoopOnce({ ...options, ensureService: !process.argv.includes("--no-service-heal"), servicePort }),
  });
  console.log(`本地闭环监听已启动：directories=${watcher.directories.length} debounceMs=${debounceMs}${dryRun ? "（dry-run）" : ""}`);
  for (const item of watcher.directories) console.log(`${item.kind}\t${item.dir}`);
  watcher.run("startup").catch((error) => console.error(error.message));
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
} else if (command === "export-drafts") {
  const tasks = exportLocalPublishDrafts();
  console.log(`已导出 ${tasks.length} 条本地发布草稿`);
} else if (command === "prepare-delivery") {
  const outbox = prepareDeliveryOutbox();
  console.log(`已准备 ${outbox.filter((item) => item.status === "prepared").length} 条交付通知`);
} else if (command === "send-delivery") {
  deliverPrepared({ dryRun: process.argv.includes("--dry-run") })
    .then((delivery) => {
      for (const item of delivery.results) {
        console.log(`${item.status}\t${item.deliveryId}${item.reason ? `\t${item.reason}` : ""}${item.error ? `\t${item.error}` : ""}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "outbox") {
  const outbox = loadOutbox();
  if (!outbox.length) {
    console.log("交付队列为空");
  } else {
    for (const item of outbox) {
      console.log(`${item.status}\t${item.orderId}\t${item.deliveryFile}`);
    }
  }
} else if (command === "order") {
  const [, , , experimentId, amount, ...noteParts] = process.argv;
  if (!experimentId || !amount) {
    console.error("用法：node src/cli.js order <experimentId> <amount> [payerNote]");
    process.exit(1);
  }
  const order = recordOrder({ experimentId, amount, payerNote: noteParts.join(" ") });
  console.log(`订单已记录：${order.id}`);
  console.log(`交付文件：${order.deliveryFile}`);
} else if (command === "payment") {
  const [, , , experimentId, amount, ...noteParts] = process.argv;
  if (!experimentId || !amount) {
    console.error("用法：node src/cli.js payment <experimentId> <amount> [payerNote]");
    process.exit(1);
  }
  const payment = receivePaymentNotification({ experimentId, amount, payerNote: noteParts.join(" ") || experimentId });
  console.log(`付款通知已匹配，订单：${payment.order.id}`);
  console.log(`交付任务：${payment.delivery?.id || "未生成"}`);
} else if (command === "wechat-notify") {
  const text = process.argv.slice(3).join(" ");
  if (!text) {
    console.error("用法：node src/cli.js wechat-notify <微信收款通知文本>");
    process.exit(1);
  }
  const payload = normalizeWechatPaymentNotification({ text });
  const payment = receivePaymentNotification(payload);
  console.log(`微信通知已解析：amount=${payload.amount} transactionId=${payload.transactionId || "无"}`);
  console.log(`付款通知已匹配，订单：${payment.order.id}`);
  console.log(`交付任务：${payment.delivery?.id || "未生成"}`);
} else if (command === "deliver") {
  const orderId = process.argv[3];
  if (!orderId) {
    console.error("用法：node src/cli.js deliver <orderId>");
    process.exit(1);
  }
  const order = markDelivered(orderId);
  console.log(`订单已标记交付：${order.id}`);
} else if (command === "adapters") {
  const adapters = loadAdapters();
  const configuredChannels = Object.entries(adapters.channels || {}).filter(([, config]) => config.webhookUrl).map(([channel]) => channel);
  console.log(`发布适配器：${configuredChannels.length ? configuredChannels.join(", ") : "未配置"}`);
  console.log(`增长执行器：${(adapters.growthWebhooks || []).filter((item) => item.webhookUrl).length || "未配置"}`);
  console.log(`增长投递目录：${adapters.growthOutbox?.dir || "未配置"}`);
  console.log(`部署适配器：${adapters.deploy?.webhookUrl ? "已配置" : "未配置"}`);
  console.log(`交付适配器：${adapters.fulfillment?.webhookUrl ? "已配置" : "未配置"}`);
  console.log(`交付投递目录：${adapters.fulfillment?.outboxDir || "未配置"}`);
} else if (command === "adapter-health") {
  checkAdapterHealth()
    .then((health) => {
      console.log(`适配器健康检查：configured=${health.configured} reachable=${health.reachable} blocked=${health.blocked} missing=${health.missing}`);
      for (const item of health.checks) {
        console.log(`${item.kind}\t${item.id}\tconfigured=${item.configured}\treachable=${item.reachable}${item.error ? `\t${item.error}` : ""}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "adapter-readiness") {
  const readiness = buildAdapterReadinessPlan();
  console.log(`外部赚钱链路就绪：${readiness.ready ? "ready" : "not-ready"}`);
  for (const item of readiness.required) {
    console.log(`${item.area}\tok=${item.ok}\tenv=${item.env.join("|")}\t${item.purpose}`);
  }
} else if (command === "opportunity-scan") {
  scanOpportunitySources()
    .then((scan) => {
      console.log(`机会雷达：status=${scan.status} signals=${scan.signals.length}${scan.reason ? ` reason=${scan.reason}` : ""}`);
      for (const signal of scan.signals) {
        console.log(`${signal.score}\t${signal.sourceId}\t${signal.marketId}/${signal.offerTypeId}\t${signal.keyword}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else if (command === "configure-from-env") {
  const summary = configureAdaptersFromEnv();
  console.log(`已从环境变量生成 adapters：provided=${summary.provided.length} missingCore=${summary.missingCore.length}`);
  if (summary.provided.length) console.log(`已提供：${summary.provided.join(", ")}`);
  if (summary.missingCore.length) console.log(`仍缺核心变量：${summary.missingCore.join(", ")}`);
} else if (command === "public-url") {
  const publicUrl = process.argv[3];
  if (!publicUrl) {
    console.error("用法：node src/cli.js public-url <https://your-public-domain>");
    process.exit(1);
  }
  try {
    const summary = configurePublicBaseUrl(publicUrl, { source: "cli" });
    console.log(`公网入口已配置：${summary.publicBaseUrl}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "public-tunnel") {
  (async () => {
    const port = Number(argValue("--port", process.env.PORT || "4188"));
    const provider = argValue("--provider", "auto");
    const subdomain = argValue("--subdomain", "");
    const timeoutMs = Number(argValue("--timeout-ms", "45000"));
    let tunnel;
    try {
      tunnel = await startPublicTunnel({ port, provider, subdomain, timeoutMs });
      const probe = await waitForPublicUrl(tunnel.publicUrl, { timeoutMs: Number(argValue("--probe-timeout-ms", "30000")) });
      console.log(`公网探活通过：${probe.url} status=${probe.statusCode}`);
    } catch (error) {
      recordPublicAccessAttempt({
        status: "failed",
        source: "public-tunnel",
        provider,
        publicUrl: tunnel?.publicUrl || "",
        command: tunnel?.command || `node src/cli.js public-tunnel --provider ${provider} --port ${port}`,
        error: error.message,
      });
      if (tunnel?.process) tunnel.process.kill("SIGTERM");
      throw error;
    }
    const summary = configurePublicBaseUrl(tunnel.publicUrl, { source: `tunnel:${tunnel.provider}` });
    console.log(`\n公网入口已配置：${summary.publicBaseUrl}`);
    const deployed = await runWorkerOnce();
    console.log(`worker 已用公网入口重跑：deployed=${deployed.deployed} searchSubmitted=${deployed.searchSubmitted} searchBlocked=${deployed.searchBlocked}`);
    console.log(`隧道进程 PID：${tunnel.pid}`);
    console.log("保持此命令运行，公网入口才会持续可访问。按 Ctrl+C 可停止隧道。");
    const shutdown = () => {
      tunnel.process.kill("SIGTERM");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    tunnel.process.on("exit", (code, signal) => {
      console.log(`隧道已退出：code=${code} signal=${signal || ""}`);
      process.exit(code || 0);
    });
  })().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else if (command === "bootstrap-local-loop") {
  const summary = bootstrapLocalLoop({
    rootDir: argValue("--root-dir", path.join(process.cwd(), "runtime", "local-loop")),
    publicBaseUrl: argValue("--public-base-url", "http://127.0.0.1:4188"),
    preserveExisting: !process.argv.includes("--replace"),
  });
  console.log("本地自主闭环已初始化");
  console.log(`根目录：${summary.rootDir}`);
  console.log(`站点目录：${summary.directories.site}`);
  console.log(`增长投递目录：${summary.directories.growthOutbox}`);
  console.log(`增长结果目录：${summary.directories.growthResults}`);
  console.log(`付款通知目录：${summary.directories.paymentInbox}`);
  console.log(`交付投递目录：${summary.directories.fulfillmentOutbox}`);
  console.log(`交付结果目录：${summary.directories.fulfillmentResults}`);
  console.log(`环境文件：${summary.envFile}`);
} else if (command === "configure-local-adapters") {
  const baseUrl = argValue("--base-url", "http://127.0.0.1:4199");
  const publicBaseUrl = argValue("--public-base-url", "http://127.0.0.1:4188");
  const secret = argValue("--payment-secret", "local-payment-secret");
  const adapters = saveAdapters({
    publicBaseUrl,
    channels: {
      "wechat-moments": { webhookUrl: `${baseUrl}/publish/wechat` },
      "xhs-note": { webhookUrl: `${baseUrl}/publish/xhs` },
      "zhihu-answer": { webhookUrl: `${baseUrl}/publish/zhihu` },
    },
    growthWebhooks: [{ id: "local-growth-router", channels: ["*"], webhookUrl: `${baseUrl}/growth/router` }],
    fulfillment: {
      webhookUrl: `${baseUrl}/fulfillment`,
    },
    payments: {
      webhookSecret: secret,
      feedUrl: `${baseUrl}/payments`,
      feedSecret: secret,
    },
    deploy: {
      webhookUrl: `${baseUrl}/deploy`,
    },
    search: {
      indexNowEndpoint: `${baseUrl}/indexnow`,
      indexNowKey: "local-indexnow-key",
    },
  });
  console.log(`已配置本地外部适配器：${baseUrl}`);
  console.log(`公开访问地址：${adapters.publicBaseUrl || "未配置"}`);
  console.log(`付款通知密钥：${adapters.payments.webhookSecret}`);
} else if (command === "clear-local-adapters") {
  const adapters = saveAdapters({
    publicBaseUrl: "",
    channels: {},
    growthWebhooks: [],
    fulfillment: {},
    payments: {},
    publishAgent: {},
    search: {},
    deploy: {},
  });
  console.log("已清理本地 mock 外部适配器配置");
  console.log(`公开访问地址：${adapters.publicBaseUrl || "未配置"}`);
} else if (command === "demo-loop") {
  (async () => {
    resetMockAdapterCalls();
    const mockServer = http.createServer(mockAdapterHandler);
    const address = await listen(mockServer);
    const adapterBaseUrl = `http://127.0.0.1:${address.port}`;
    const publicBaseUrl = argValue("--public-base-url", "http://127.0.0.1:4188");
    const secret = argValue("--payment-secret", "local-payment-secret");
    const seed = demoSeed();
    const count = Number(argValue("--count", "1"));
    try {
      const site = generateSite({ seed, count });
      const experiment = site.lab[0];
      saveAdapters({
        publicBaseUrl,
        channels: {
          "wechat-moments": { webhookUrl: `${adapterBaseUrl}/publish/wechat` },
          "xhs-note": { webhookUrl: `${adapterBaseUrl}/publish/xhs` },
          "zhihu-answer": { webhookUrl: `${adapterBaseUrl}/publish/zhihu` },
        },
        growthWebhooks: [{ id: "local-growth-router", channels: ["*"], webhookUrl: `${adapterBaseUrl}/growth/router` }],
        fulfillment: {
          webhookUrl: `${adapterBaseUrl}/fulfillment`,
        },
        payments: {
          webhookSecret: secret,
          feedUrl: `${adapterBaseUrl}/payments`,
          feedSecret: secret,
        },
        deploy: {
          webhookUrl: `${adapterBaseUrl}/deploy`,
        },
        search: {
          indexNowEndpoint: `${adapterBaseUrl}/indexnow`,
          indexNowKey: "local-indexnow-key",
        },
      });
      const checkout = createCheckout({ experimentId: experiment.id });
      await requestJson(adapterBaseUrl, "/payments", {
        method: "POST",
        body: {
          transactionId: `demo_${Date.now()}`,
          remark: `demo paid ${checkout.paymentRemark}`,
          amount: checkout.amount,
        },
      });
      const worker = await runWorkerOnce({ seed, count });
      const calls = await requestJson(adapterBaseUrl, "/calls");
      const createdOrders = new Set((worker.paymentSync?.results || []).filter((item) => item.status === "created").map((item) => item.orderId));
      const publishCalls = calls.calls.filter((item) => item.body.type === "publish");
      const fulfillmentCalls = calls.calls.filter((item) => item.body.type === "fulfillment" && createdOrders.has(item.body.orderId));
      const deployCalls = calls.calls.filter((item) => item.body.type === "deploy-static-site");
      const indexCalls = calls.calls.filter((item) => item.path === "/indexnow");
      const fulfillment = fulfillmentCalls.find((item) => item.body.deliveryUrl);
      console.log("自动闭环演示完成");
      console.log(`实验：${experiment.id}`);
      console.log(`seed：${seed}`);
      console.log(`唯一付款备注：${checkout.paymentRemark}`);
      console.log(`订单状态页：${checkout.statusUrl}`);
      console.log(`付款同步：created=${worker.paymentsCreated} duplicate=${worker.paymentsDuplicate} failed=${worker.paymentsFailed}`);
      console.log(`本轮新订单：${[...createdOrders].join(", ") || "无"}`);
      console.log(`自动部署调用：${deployCalls.length}`);
      console.log(`自动发布调用：${publishCalls.length}`);
      console.log(`搜索索引提交：${indexCalls.length}`);
      console.log(`本轮自动发货调用：${fulfillmentCalls.length}`);
      console.log(`买家交付链接：${fulfillment?.body.deliveryUrl || "未生成"}`);
      console.log(`mock 调用记录：${adapterBaseUrl}/calls`);
    } finally {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  })().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else if (command === "status") {
  const status = systemStatus();
  console.log(`实验数：${status.experiments}`);
  console.log(`订单数：${status.orders}`);
  console.log(`待支付：${status.checkouts?.pending || 0}，已匹配付款：${status.checkouts?.paid || 0}`);
  console.log(`收入记录：¥${status.revenue}`);
  console.log(`付款同步：${status.lastPaymentSync?.status || "无"}`);
  if (status.autonomousSupervisor?.lastSummary) {
    const summary = status.autonomousSupervisor.lastSummary;
    console.log(`自主监督：outcome=${summary.outcome || "unknown"} stage=${summary.funnelStage || "unknown"} revenueDelta=¥${summary.revenueDelta || 0} orderDelta=${summary.orderDelta || 0} expanded=${summary.expanded ? "yes" : "no"}`);
  }
  console.log(`发布队列：total=${status.publishQueue.total} sent=${status.publishQueue.sent} blocked=${status.publishQueue.blocked} failed=${status.publishQueue.failed}`);
  console.log(`交付队列：total=${status.deliveryQueue.total} queued=${status.deliveryQueue.queued} prepared=${status.deliveryQueue.prepared} sent=${status.deliveryQueue.sent} blocked=${status.deliveryQueue.blocked} failed=${status.deliveryQueue.failed}`);
  console.log(`最近 worker：${status.lastWorker?.id || "无"}`);
} else {
  console.error(`未知命令：${command}`);
  process.exit(1);
}
