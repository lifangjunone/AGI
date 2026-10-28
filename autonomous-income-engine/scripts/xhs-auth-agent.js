#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright-core");
const { PNG } = require("pngjs");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_DIR = process.env.AIE_RUNTIME_DIR || path.join(ROOT, "runtime");
const PROFILE_DIR = process.env.XHS_PROFILE_DIR || path.join(RUNTIME_DIR, "xhs-browser-profile");
const STATE_FILE = path.join(RUNTIME_DIR, "xhs-auth-agent-state.json");
const LOCK_FILE = path.join(RUNTIME_DIR, ".xhs-auth-agent.lock");
const EVIDENCE_DIR = path.join(RUNTIME_DIR, "xhs-publish-evidence");
const API_BASE = String(process.env.XHS_AGENT_API_BASE || "https://lifeyoume.icu/image").replace(/\/$/, "");
const POLL_MS = 3000;
const QR_LIFETIME_MS = 15 * 60 * 1000;
const AUTH_NOTICE_FILE = path.join(RUNTIME_DIR, "xhs-auth-notice.json");
const AUTH_NOTICE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function reconcileAuthenticatedTasks() {
  await api("POST", "/api/admin/channel-authenticated", {
    channel: "xiaohongshu",
    verification: "publisher-rechecked-authenticated-session",
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveState(state) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.${crypto.randomBytes(5).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(temporary, STATE_FILE);
}

async function api(method, route, body) {
  const adminSecret = String(process.env.XHS_AGENT_ADMIN_SECRET || remoteAdminSecret());
  if (!adminSecret) throw new Error("XHS agent admin secret is required");
  const response = await fetch(`${API_BASE}${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": adminSecret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`admin API ${response.status}: ${payload.error || "request failed"}`);
  return payload;
}

function remoteAdminSecret() {
  return execFileSync(
    process.env.XHS_AGENT_SSH || "/usr/bin/ssh",
    [
      process.env.XHS_AGENT_SSH_HOST || "aliyun",
      "sed -n 's/^ADMIN_API_SECRET=//p' /data/app/autonomous-income-engine/shared/runtime.env",
    ],
    { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
}

async function loggedIn(page) {
  if (page.url().includes("/login")) return false;
  const body = await page.locator("body").innerText().catch(() => "");
  return body.includes("发布笔记") && body.includes("笔记管理");
}

async function openCreatorHome(page) {
  await page.goto("https://creator.xiaohongshu.com/new/home", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await sleep(1500);
  return loggedIn(page);
}

function resolveTaskAssets(task) {
  return (task.contentPackage?.assets || []).map((asset) => path.resolve(ROOT, asset));
}

async function selectNativeTopic(page, query) {
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.focus();
  await page.getByRole("button", { name: /话题/ }).click();
  await page.keyboard.type(query);
  await sleep(900);
  const exact = page.getByText(`#${query}`, { exact: true });
  const count = await exact.count();
  if (!count) throw new Error(`native topic candidate missing: ${query}`);
  await exact.last().click();
  await sleep(350);
  const body = await editor.innerText();
  if (!body.includes(`#${query}`)) throw new Error(`native topic selection not reflected: ${query}`);
}

async function selectMarketingDisclosure(page) {
  await page.getByText("添加内容类型声明", { exact: true }).click();
  const option = page.getByText("内容包含营销广告", { exact: true });
  await option.last().click();
  await sleep(400);
  const checked = await page.locator('input[type="checkbox"]:checked').count();
  if (!checked) throw new Error("marketing disclosure was not selected");
}

async function submitPublishControl(page) {
  const host = page.locator("xhs-publish-btn");
  await host.waitFor({ state: "visible", timeout: 10000 });
  if ((await host.getAttribute("submit-disabled")) !== "false") {
    throw new Error("platform publish control is disabled");
  }
  await host.scrollIntoViewIfNeeded();

  // xhs-publish-btn uses a closed component: DOM/text locators can see the
  // host but cannot address its real inner button. Detect the enabled red
  // control in the audited screenshot and click the visible browser surface,
  // which is the same path that previously succeeded in the visible browser.
  const png = PNG.sync.read(await page.screenshot({ type: "png" }));
  const matching = (x, y) => {
    const offset = (png.width * y + x) * 4;
    const [red, green, blue, alpha] = png.data.subarray(offset, offset + 4);
    return alpha > 200 && red >= 235 && green <= 85 && blue <= 105;
  };
  const visited = new Uint8Array(png.width * png.height);
  const components = [];
  const startY = Math.floor(png.height * 0.68);
  for (let y = startY; y < png.height; y += 1) {
    for (let x = Math.floor(png.width * 0.2); x < Math.floor(png.width * 0.8); x += 1) {
      const start = y * png.width + x;
      if (visited[start] || !matching(x, y)) continue;
      const queue = [start];
      visited[start] = 1;
      let cursor = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixels = 0;
      while (cursor < queue.length) {
        const current = queue[cursor++];
        const currentX = current % png.width;
        const currentY = Math.floor(current / png.width);
        pixels += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);
        for (const [nextX, nextY] of [
          [currentX - 1, currentY], [currentX + 1, currentY],
          [currentX, currentY - 1], [currentX, currentY + 1],
        ]) {
          if (nextX < 0 || nextX >= png.width || nextY < startY || nextY >= png.height) continue;
          const next = nextY * png.width + nextX;
          if (visited[next] || !matching(nextX, nextY)) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      components.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixels,
      });
    }
  }
  const button = components
    .filter((item) => item.width >= 80 && item.width <= 260 &&
      item.height >= 30 && item.height <= 90 && item.pixels >= 1500 &&
      item.y >= png.height * 0.75)
    .sort((left, right) => right.pixels - left.pixels)[0];
  if (!button) {
    throw new Error("enabled red platform publish button was not found on the audited page");
  }
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
}

async function verifyPlatformRecord(page, title) {
  await page.goto("https://creator.xiaohongshu.com/new/note-manager", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await sleep(1800);
  const body = await page.locator("body").innerText();
  if (!body.includes(title)) return null;
  const status = body.includes(`审核中 ${title}`) ? "reviewing" : "published-or-listed";
  return {
    status,
    verifiedAt: new Date().toISOString(),
    url: page.url(),
  };
}

async function publishSocialTask(page, task) {
  const content = task.contentPackage;
  const qualityErrors = content?.qualityGate?.errors || [];
  if (!content?.qualityGate?.ok) throw new Error(`content quality gate failed: ${qualityErrors.join(",")}`);
  const assets = resolveTaskAssets(task);
  if (!assets.length || assets.some((asset) => !fs.existsSync(asset))) {
    throw new Error("one or more audited publish assets are missing");
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidenceBase = path.join(EVIDENCE_DIR, crypto.createHash("sha256").update(task.key).digest("hex").slice(0, 16));
  const existing = await verifyPlatformRecord(page, content.title);
  if (existing) {
    return {
      status: "verification-pending",
      reason: "existing-platform-record-prevented-duplicate",
      error: `platform record exists with status ${existing.status}; public note URL is not verified yet`,
    };
  }
  await page.goto("https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await sleep(1200);
  if (page.url().includes("/login")) return { status: "blocked", reason: "login-required" };
  await page.locator('input[type="file"]').first().setInputFiles(assets);
  await page.locator('input[placeholder="填写标题会有更多赞哦"]').waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[placeholder="填写标题会有更多赞哦"]').fill(content.title);
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill(content.body);
  for (const topic of content.topicQueries.slice(0, 3)) await selectNativeTopic(page, topic);
  await selectMarketingDisclosure(page);
  await page.screenshot({ path: `${evidenceBase}-ready.png`, fullPage: true });
  await submitPublishControl(page);
  await sleep(2500);
  await page.screenshot({ path: `${evidenceBase}-submitted.png`, fullPage: true });
  const record = await verifyPlatformRecord(page, content.title);
  if (!record) {
    return {
      status: "verification-pending",
      reason: "submit-result-unknown-platform-record-required",
      error: "title not found in note manager after submit",
    };
  }
  return {
    status: "verification-pending",
    reason: "verified-in-platform-note-manager-awaiting-public-url",
    error: `platform record exists with status ${record.status}; evidence ${evidenceBase}-submitted.png`,
  };
}

async function runDuePublishing(page) {
  const claimed = await api("POST", "/api/admin/social-tasks/claim", {
    workerId: "xhs-browser-agent",
  });
  if (!claimed.task) return { status: "idle" };
  let result;
  try {
    result = await publishSocialTask(page, claimed.task);
  } catch (error) {
    result = {
      status: /login/i.test(String(error.message)) ? "blocked" : "failed",
      reason: "audited-browser-publisher-error",
      error: String(error.message || error).slice(0, 500),
    };
  }
  await api("POST", "/api/admin/social-tasks/result", {
    key: claimed.task.key,
    result,
  });
  saveState({ status: "publish-cycle-complete", taskKey: claimed.task.key, result });
  return result;
}

async function realLoginQr(page) {
  if (!page.url().includes("/login")) {
    await page.goto("https://creator.xiaohongshu.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }
  await sleep(1000);
  const body = await page.locator("body").innerText().catch(() => "");
  if (!body.includes("APP扫一扫登录")) {
    const switcher = page.locator("img").first();
    await switcher.click();
    await sleep(1200);
  }
  const images = page.locator("img");
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    const [box, src] = await Promise.all([
      image.boundingBox(),
      image.getAttribute("src"),
    ]);
    if (box?.width >= 150 && box?.height >= 150 && src?.startsWith("data:image/png;base64,")) {
      return src;
    }
  }
  throw new Error("real Xiaohongshu login QR was not found");
}

async function waitForOwnerAndPlatform(page, taskId, expiresAt) {
  while (Date.now() < expiresAt) {
    await sleep(POLL_MS);
    const current = await api("GET", `/api/admin/action-tasks/${encodeURIComponent(taskId)}`);
    if (await loggedIn(page)) {
      await reconcileAuthenticatedTasks();
      await api("POST", `/api/admin/action-tasks/${encodeURIComponent(taskId)}/complete`, {});
      saveState({ status: "authenticated", taskId, accountVerified: true });
      return true;
    }
    if (current.task.status === "owner-confirmed") {
      await openCreatorHome(page);
      if (await loggedIn(page)) {
        await reconcileAuthenticatedTasks();
        await api("POST", `/api/admin/action-tasks/${encodeURIComponent(taskId)}/complete`, {});
        saveState({ status: "authenticated", taskId, accountVerified: true });
        return true;
      }
      saveState({ status: "owner-confirmed-platform-not-authenticated", taskId });
    }
  }
  saveState({ status: "qr-expired", taskId });
  return false;
}

async function run() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  let lock;
  try {
    lock = fs.openSync(LOCK_FILE, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: process.env.XHS_BROWSER_CHANNEL || "chrome",
      headless: true,
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = context.pages()[0] || await context.newPage();
    if (await openCreatorHome(page)) {
      await reconcileAuthenticatedTasks();
      saveState({ status: "authenticated", accountVerified: true });
      await runDuePublishing(page);
      return;
    }
    // A slow or changed home page is not proof of a revoked session.
    const body = await page.locator("body").innerText().catch(() => "");
    if (!page.url().includes("/login") && !/扫一扫登录|验证码登录|手机号登录/.test(body)) {
      saveState({ status: "authentication-check-inconclusive", reason: "no-explicit-login-page" });
      return;
    }
    let previousNotice = {};
    try { previousNotice = JSON.parse(fs.readFileSync(AUTH_NOTICE_FILE, "utf8")); } catch {}
    if (Date.now() - Number(previousNotice.createdAt || 0) < AUTH_NOTICE_COOLDOWN_MS) {
      saveState({ status: "login-required-notification-cooldown", nextNoticeAt: new Date(previousNotice.createdAt + AUTH_NOTICE_COOLDOWN_MS).toISOString() });
      return;
    }
    const qrImage = await realLoginQr(page);
    const qrHash = crypto.createHash("sha256").update(qrImage).digest("hex").slice(0, 16);
    const expiresAt = Date.now() + QR_LIFETIME_MS;
    const result = await api("POST", "/api/admin/action-tasks", {
      type: "xiaohongshu-login",
      idempotencyKey: `xhs-login:${new Date().toISOString().slice(0, 16)}:${qrHash}`,
      qrImage,
      expiresAt: new Date(expiresAt).toISOString(),
      message: "小红书自动发布会话需要认证。请用小红书 App 扫码，完成后点击“我已完成认证”。",
    });
    saveState({ status: "waiting-owner-scan", taskId: result.task.id, expiresAt: result.task.expiresAt });
    fs.writeFileSync(AUTH_NOTICE_FILE, JSON.stringify({ createdAt: Date.now(), taskId: result.task.id }), { mode: 0o600 });
    await waitForOwnerAndPlatform(page, result.task.id, expiresAt);
  } finally {
    await context?.close().catch(() => {});
    if (lock !== undefined) fs.closeSync(lock);
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

run().catch((error) => {
  saveState({ status: "failed", error: String(error.message || error).slice(0, 500) });
  process.exitCode = 1;
});
