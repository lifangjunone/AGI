const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function configuredPublisher(env = process.env) {
  const endpoint = env.SOCIAL_PUBLISHER_URL;
  const token = env.SOCIAL_PUBLISHER_TOKEN;
  if (!endpoint || !token) return undefined;
  const base = new URL(endpoint);
  if (base.protocol !== "https:") throw new Error("Publisher requires HTTPS");
  const request = async (operation, payload) => {
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ operation, ...payload }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Publisher HTTP ${response.status}`);
    return response.json();
  };
  return {
    lookup: key => request("lookup", { idempotencyKey: key }),
    publish: task => request("publish", { task }),
  };
}

function beijingClock(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(item => [item.type, item.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function stableContentHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function dayDistance(left, right) {
  return Math.floor((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000);
}

function selectedProductForDay(config, clock) {
  const campaign = config.dailyProductCampaign;
  if (!campaign?.startDay || !Array.isArray(campaign.sequence) || campaign.sequence.length === 0) {
    return null;
  }
  const offset = dayDistance(clock.day, campaign.startDay);
  const index = ((offset % campaign.sequence.length) + campaign.sequence.length) % campaign.sequence.length;
  return campaign.sequence[index];
}

function campaignContentForSlot(config, productId, slot) {
  const product = config.dailyProductCampaign?.products?.[productId];
  const angle = product?.angles?.[slot.id];
  if (!product || !angle) return null;
  const commercial = product.price
    ? `完整结果价格是${product.price}，${product.payment}。`
    : `${product.payment}。`;
  const accessAddress = new URL(product.landingUrl);
  const accessText = `${accessAddress.host}${accessAddress.pathname}`;
  return {
    id: `${productId}-${slot.id}`,
    productId,
    title: angle.title,
    body: `${angle.hook}这个产品面向${product.audience}，实际提供的是${product.result}。${commercial}浏览器打开：${accessText}。可以先查看真实能力和当前可用状态，再决定是否继续使用。内容只介绍已经存在的功能，不伪造客户案例、销量或收入，也不承诺使用后一定获得特定结果。本条配图是产品能力说明，不是真实客户订单。`,
    assets: [`docs/promotion/product-campaign-covers/${angle.cover}`],
    topicQueries: product.topicQueries,
    landingUrl: product.landingUrl,
    disclosures: ["marketing", "demo-not-customer-case"],
    campaignRole: product.price ? "commerce" : "exploration",
    offer: {
      price: product.price,
      payment: product.payment,
      result: product.result,
    },
  };
}

function validateContentPackage(item, context = {}) {
  const errors = [];
  if (!item || typeof item !== "object") {
    return { ok: false, errors: ["content-package-missing"] };
  }
  if (!item.title || item.title.length < 8 || item.title.length > 60) errors.push("title-length");
  if (!item.body || item.body.length < 120 || item.body.length > 1000) errors.push("body-length");
  if (!Array.isArray(item.assets) || item.assets.length < 1) errors.push("assets-missing");
  if (!Array.isArray(item.topicQueries) || item.topicQueries.length < 2) errors.push("topic-queries-missing");
  if (!item.landingUrl || !/^https:\/\/([a-z0-9-]+\.)?lifeyoume\.icu\//.test(item.landingUrl)) {
    errors.push("landing-url-not-owned-product");
  } else {
    const accessUrl = new URL(item.landingUrl);
    const accessText = `${accessUrl.host}${accessUrl.pathname}`;
    if (item.campaignRole && !item.body?.includes(accessText)) {
      errors.push("buyer-access-address-missing-from-body");
    }
  }
  const disclosures = new Set(item.disclosures || []);
  if (!disclosures.has("marketing")) errors.push("marketing-disclosure-missing");
  if (!disclosures.has("demo-not-customer-case")) errors.push("demo-disclosure-missing");
  const claimText = `${item.title}\n${item.body}`
    .replace(/不保证/g, "")
    .replace(/不承诺/g, "")
    .replace(/不提供/g, "")
    .replace(/不是真实客户案例/g, "");
  if (/(保证|必赚|包退款|包胜诉|自动退款|真实客户案例)/.test(claimText)) {
    errors.push("overclaiming-risk");
  }
  if (/#\S/.test(`${item.title}\n${item.body}`)) {
    errors.push("raw-hashtag-present-use-native-topic-picker");
  }
  const firstAsset = item.assets?.[0];
  const recentPackages = context.recentPackages || [];
  if (recentPackages.some(previous => previous?.title === item.title)) {
    errors.push("title-reused-within-seven-days");
  }
  if (firstAsset && recentPackages.some(previous => previous?.assets?.[0] === firstAsset)) {
    errors.push("cover-reused-within-seven-days");
  }
  return { ok: errors.length === 0, errors };
}

function contentForSlot(config, slot, clock, recentPackages = []) {
  const selectedProductId = selectedProductForDay(config, clock);
  const campaignContent = selectedProductId
    ? campaignContentForSlot(config, selectedProductId, slot)
    : null;
  const packages = campaignContent ? [campaignContent] : config.contentPackages?.[slot.id];
  if (!Array.isArray(packages) || packages.length === 0) return null;
  const dayNumber = Number(clock.day.replaceAll("-", ""));
  const startingIndex = Number.isFinite(dayNumber) ? dayNumber % packages.length : 0;
  let content;
  let qualityGate;
  for (let offset = 0; offset < packages.length; offset += 1) {
    content = structuredClone(packages[(startingIndex + offset) % packages.length]);
    qualityGate = validateContentPackage(content, { recentPackages });
    if (qualityGate.ok) break;
  }
  return {
    ...content,
    selectedProductId: selectedProductId || content.productId,
    slotId: slot.id,
    contentHash: stableContentHash(content),
    qualityGate,
  };
}

function planSocialSlots({ now, config, state }) {
  const clock = beijingClock(now);
  const next = structuredClone(state || { tasks: [] });
  next.tasks ||= [];
  if (!config.runtimeEnabled) return next;
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  for (const slot of config.dailySlots) {
    const key = `${config.channel}:${clock.day}:${slot.id}`;
    const existing = next.tasks.find(task => task.key === key);
    if (existing) {
      if (!existing.contentPackage) {
        existing.contentPackage = contentForSlot(config, slot, clock);
      }
      continue;
    }
    const recentPackages = next.tasks
      .filter(task => task.day !== clock.day && Date.parse(task.dueAt || 0) >= sevenDaysAgo)
      .map(task => task.contentPackage)
      .filter(Boolean);
    const todayPackages = next.tasks
      .filter(task => task.day === clock.day)
      .map(task => task.contentPackage)
      .filter(Boolean);
    next.tasks.push({
      key, channel: config.channel, day: clock.day, slot: slot.id,
      dueAt: `${clock.day}T${slot.time}:00+08:00`,
      contentType: slot.content, status: "scheduled", attempts: 0,
      contentPackage: contentForSlot(config, slot, clock, [...recentPackages, ...todayPackages]),
      createdAt: now.toISOString(),
    });
  }
  next.lastTickAt = now.toISOString();
  return next;
}

function verifiedPublication(receipt) {
  if (!receipt || receipt.status !== "published" || !receipt.noteId || !receipt.url ||
      !receipt.verifiedAt || !receipt.nativeTopicsVerified) return false;
  try {
    const url = new URL(receipt.url);
    return url.protocol === "https:" &&
      (url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com"));
  } catch { return false; }
}

function socialStateFile(dataDir) {
  return path.join(dataDir, "social-schedule-state.json");
}

function readSocialState(dataDir) {
  try {
    const value = JSON.parse(fs.readFileSync(socialStateFile(dataDir), "utf8"));
    return value && Array.isArray(value.tasks) ? value : { tasks: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { tasks: [] };
    throw error;
  }
}

function writeSocialState(dataDir, state) {
  const file = socialStateFile(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function claimDueSocialTask({ dataDir, workerId = "xhs-browser-agent", now = new Date() } = {}) {
  const state = readSocialState(dataDir);
  const staleBefore = now.getTime() - 20 * 60 * 1000;
  const task = state.tasks.find((item) => {
    if (Date.parse(item.dueAt) > now.getTime()) return false;
    if (now.getTime() - Date.parse(item.dueAt) > 2 * 60 * 60 * 1000) return false;
    if (["platform-scheduled", "published", "expired"].includes(item.status)) return false;
    if (!item.contentPackage?.qualityGate?.ok) return false;
    if (Number(item.attempts || 0) >= 3) return false;
    if (item.nextAttemptAt && Date.parse(item.nextAttemptAt) > now.getTime()) return false;
    return item.status !== "claimed" || Date.parse(item.claimedAt || 0) < staleBefore;
  });
  if (!task) return null;
  task.status = "claimed";
  task.claimedAt = now.toISOString();
  task.claimedBy = String(workerId).slice(0, 120);
  task.attempts = Number(task.attempts || 0) + 1;
  writeSocialState(dataDir, state);
  return structuredClone(task);
}

function recordSocialTaskResult({ dataDir, key, result, now = new Date() } = {}) {
  const state = readSocialState(dataDir);
  const task = state.tasks.find((item) => item.key === key);
  if (!task) {
    const error = new Error("social task not found");
    error.statusCode = 404;
    throw error;
  }
  const status = String(result?.status || "");
  const allowed = new Set(["platform-scheduled", "published", "verification-pending", "blocked", "failed"]);
  if (!allowed.has(status)) {
    const error = new Error("invalid social result status");
    error.statusCode = 400;
    throw error;
  }
  if (status === "published" && !verifiedPublication(result.receipt)) {
    const error = new Error("published requires verified platform receipt");
    error.statusCode = 409;
    throw error;
  }
  if (status === "platform-scheduled") {
    if (!result.platformSchedule?.scheduledAt || !result.platformSchedule?.platformStatus) {
      const error = new Error("platform schedule proof is required");
      error.statusCode = 409;
      throw error;
    }
    task.platformSchedule = {
      scheduledAt: result.platformSchedule.scheduledAt,
      platformStatus: result.platformSchedule.platformStatus,
      verifiedAt: result.platformSchedule.verifiedAt || now.toISOString(),
      evidencePath: String(result.platformSchedule.evidencePath || "").slice(0, 500),
    };
  }
  task.status = status;
  task.reason = String(result.reason || "").slice(0, 300);
  task.error = String(result.error || "").slice(0, 500);
  task.receipt = result.receipt || task.receipt;
  task.lastResultAt = now.toISOString();
  if (["verification-pending", "failed"].includes(status)) {
    task.nextAttemptAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  }
  writeSocialState(dataDir, state);
  return structuredClone(task);
}

// A publisher must expose BOTH lookup and publish. Lookup is mandatory after
// ambiguous errors; retrying a POST blindly may create a duplicate public note.
async function executeSocialTasks({ now, state, publisher, persist }) {
  for (const task of state.tasks) {
    if (Date.parse(task.dueAt) > now.getTime() ||
        ["platform-scheduled", "published", "expired"].includes(task.status)) continue;
    if (now.getTime() - Date.parse(task.dueAt) > 2 * 60 * 60 * 1000) {
      task.status = "expired";
      task.reason = "slot-window-expired-no-backfill";
      persist(state);
      continue;
    }
    if (!publisher?.lookup || !publisher?.publish) {
      task.status = "ready-for-browser-agent";
      task.reason = "awaiting-audited-browser-publisher";
      persist(state);
      continue;
    }
    if (!task.contentPackage?.qualityGate?.ok) {
      task.status = "blocked";
      task.reason = "content-quality-gate-failed";
      task.qualityErrors = task.contentPackage?.qualityGate?.errors || ["content-package-missing"];
      persist(state);
      continue;
    }
    if (task.nextAttemptAt && Date.parse(task.nextAttemptAt) > now.getTime()) continue;
    try {
      const existing = await publisher.lookup(task.key);
      if (verifiedPublication(existing)) {
        task.status = "published";
        task.receipt = existing;
        delete task.reason;
        persist(state);
        continue;
      }
      if (existing?.status !== "absent") {
        task.status = "verification-pending";
        task.reason = "publication-state-unknown-do-not-resubmit";
        task.nextAttemptAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
        persist(state);
        continue;
      }
      if (task.attempts >= 3) {
        task.status = "blocked";
        task.reason = "attempt-limit";
        persist(state);
        continue;
      }
      task.status = "submitting";
      task.attempts += 1;
      task.lastAttemptAt = now.toISOString();
      persist(state);
      const receipt = await publisher.publish({
        ...task,
        idempotencyKey: task.key,
        requirements: {
          selectNativeTopics: true,
          verifyNativeTopicIdsBeforeSubmit: true,
          discloseMarketing: true,
          verifyPlatformRecordAfterSubmit: true,
        },
      });
      task.status = verifiedPublication(receipt) ? "published" : "verification-pending";
      task.receipt = receipt;
      task.reason = task.status === "published" ? "" : "platform-proof-required";
      task.nextAttemptAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      persist(state);
    } catch (error) {
      task.status = "verification-pending";
      task.reason = "ambiguous-result-check-before-retry";
      task.error = String(error.message).slice(0, 300);
      task.nextAttemptAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      persist(state);
    }
  }
  return state;
}

async function runSocialScheduler({ dataDir, configPath, now = new Date(), publisher, dryRun = false }) {
  const file = path.join(dataDir, "social-schedule-state.json");
  const lock = path.join(dataDir, ".social-scheduler.lock");
  let fd;
  try { fd = fs.openSync(lock, "wx"); } catch (error) {
    if (error.code === "EEXIST") return { status: "locked", reason: "existing-lock-inspect-before-recovery" };
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: now.toISOString() }));
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (config.timezone !== "Asia/Shanghai" || config.channel !== "xiaohongshu" ||
        !Array.isArray(config.dailySlots) || config.dailySlots.length !== 3 ||
        new Set(config.dailySlots.map(slot => slot.id)).size !== 3 ||
        !config.dailySlots.every(slot => /^\d{2}:\d{2}$/.test(slot.time) &&
          Number(slot.time.slice(0, 2)) < 24 && Number(slot.time.slice(3)) < 60)) {
      throw new Error("Invalid social schedule");
    }
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { tasks: [] };
    const persist = state => {
      if (dryRun) return;
      const temporary = `${file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, file);
    };
    const state = planSocialSlots({ now, config, state: previous });
    persist(state);
    if (!dryRun) await executeSocialTasks({ now, state, publisher, persist });
    return { status: config.runtimeEnabled ? "running" : "disabled", publisherConnected: Boolean(publisher), ...state };
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

module.exports = {
  configuredPublisher,
  beijingClock,
  validateContentPackage,
  selectedProductForDay,
  contentForSlot,
  planSocialSlots,
  executeSocialTasks,
  verifiedPublication,
  readSocialState,
  claimDueSocialTask,
  recordSocialTaskResult,
  runSocialScheduler,
};
