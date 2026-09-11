import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateVideo, listVideos, validateGenerationInput } from "./lib/video-service.mjs";
import { createAlipayWebPay } from "./lib/alipay-webpay.mjs";
import {
  adminCookie,
  createAdminStore,
  expiredAdminCookie,
  parseCookies
} from "./lib/admin.mjs";
import {
  assistantToolConfig,
  generateAssistantTool
} from "./lib/assistant-tools.mjs";
import { createWechatNotifications } from "./lib/wechat-notifications.mjs";
import { createWechatVirtualPay } from "./lib/wechat-virtual-pay.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = path.join(ROOT, "public");
const DATA_DIRECTORY = process.env.FRAME60_DATA_DIRECTORY || path.join(ROOT, "data");

async function loadEnv(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadEnv(path.join(ROOT, ".env"));
await loadEnv(path.join(ROOT, ".env.local"));
if (process.env.FRAME60_CONFIG_FILE) {
  await loadEnv(process.env.FRAME60_CONFIG_FILE);
}

const config = {
  apiUrl: process.env.VIDEO_API_URL || "http://127.0.0.1:32280/api/v3/chat/completions",
  apiKey: process.env.VIDEO_API_KEY || "",
  modelId: process.env.VIDEO_MODEL_ID || ""
};
const defaultPort = Number(process.env.PORT || 4317);
const publicBasePath = String(process.env.FRAME60_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
const adminStore = createAdminStore({
  dataDirectory: DATA_DIRECTORY,
  defaultPrices: {
    product: process.env.CONTENT_PACK_PRICE || "9.90",
    article: process.env.ARTICLE_PRICE || "9.90",
    social: process.env.SOCIAL_PRICE || "4.90"
  }
});
await adminStore.initialize();
const alipayWebPay = createAlipayWebPay({
  rootDirectory: ROOT,
  dataDirectory: DATA_DIRECTORY,
  price: adminStore.getPrices().product,
  getPrice: () => adminStore.getPrices().product
});
const wechatNotifications = createWechatNotifications({ dataDirectory: DATA_DIRECTORY });
const wechatVirtualPay = createWechatVirtualPay({
  dataDirectory: DATA_DIRECTORY,
  getPrice: (type) => adminStore.getPrices()[type] || adminStore.getPrices().product
});
const generationJobsDirectory = path.join(DATA_DIRECTORY, "generation-jobs");

async function writeGenerationJob(job) {
  await mkdir(generationJobsDirectory, { recursive: true });
  await writeFile(
    path.join(generationJobsDirectory, `${job.id}.json`),
    `${JSON.stringify(job, null, 2)}\n`
  );
}

async function getGenerationJob(jobId) {
  try {
    return JSON.parse(
      await readFile(path.join(generationJobsDirectory, `${jobId}.json`), "utf8")
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function runGenerationJob({ id, input, config: generationConfig, ffmpegPath, ffprobePath }) {
  const update = async (patch) => {
    const current = (await getGenerationJob(id)) || { id, input };
    await writeGenerationJob({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    });
  };
  try {
    await update({ status: "running", progress: 12, detail: "已进入后台生成队列" });
    const video = await generateVideo({
      jobId: id,
      input,
      config: generationConfig,
      dataDirectory: DATA_DIRECTORY,
      ffmpeg: ffmpegPath,
      ffprobe: ffprobePath,
      signal: AbortSignal.timeout(20 * 60 * 1000)
    });
    await update({
      status: "completed",
      progress: 100,
      detail: "视频已生成",
      video,
      completedAt: new Date().toISOString()
    });
    let notification = { sent: 0, skipped: true, reason: "通知发送异常" };
    try {
      notification = await wechatNotifications.notifyJobComplete({
        id,
        detail: "视频已生成",
        video,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("[VideoJob] notification failed", { id, error: error.message });
    }
    await update({ notification });
  } catch (error) {
    console.error("[VideoJob] generation failed", { id, error: error.message });
    await update({
      status: "failed",
      progress: 100,
      detail: "视频生成失败",
      error: error.message || "视频生成失败",
      completedAt: new Date().toISOString()
    });
  }
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readText(value, field, { min = 1, max = 800 } = {}) {
  const text = String(value || "").trim();
  if (text.length < min) throw new Error(`${field}至少需要 ${min} 个字符`);
  if (text.length > max) throw new Error(`${field}不能超过 ${max} 个字符`);
  return text;
}

function requestOrigin(request, url) {
  const configuredOrigin = String(process.env.FRAME60_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");
  if (configuredOrigin) return configuredOrigin;
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || url.protocol.replace(":", "");
  const host = forwardedHost || url.host;
  return `${protocol}://${host}${publicBasePath}`;
}

function isSecureRequest(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwardedProto === "https" || process.env.NODE_ENV === "production";
}

function isMobileRequest(request) {
  return /android|iphone|ipad|ipod|mobile/i.test(String(request.headers["user-agent"] || ""));
}

function adminAuthorized(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return adminStore.authorize(cookies.frame60_admin);
}

function makeContentPack(input) {
  const product = readText(input.productName, "商品名称", { max: 80 });
  const audience = readText(input.audience, "目标客户", { max: 120 });
  const sellingPoints = readText(input.sellingPoints, "核心卖点", { min: 8, max: 500 });
  const platform = readText(input.platform || "抖音", "发布平台", { max: 30 });
  const tone = readText(input.tone || "真实种草", "表达风格", { max: 30 });
  const offer = String(input.offer || "暂无优惠").trim().slice(0, 120);
  const hooks = [
    `用了${product}之后，${audience}最明显的变化是什么？`,
    `别只看价格，${product}真正值得买的是这 3 点`,
    `${audience}挑${product}，先看懂这份避坑清单`,
    `我把${product}连续用了一周，真实感受是……`,
    `如果你正在找${product}，这条视频建议先收藏`,
    `${product}到底适不适合你？30 秒讲清楚`,
    `同类产品那么多，为什么我留下了${product}`,
    `买${product}前一定要问自己的 3 个问题`,
    `预算有限，${product}这样选更不容易踩坑`,
    `${product}的核心卖点，终于有人说人话了`
  ];
  const scripts = [
    {
      title: "问题切入",
      voiceover: `很多${audience}都会遇到同一个问题：想要更好的体验，却不知道怎么选。${product}的核心优势是${sellingPoints}。${offer}。如果你正好有这个需求，先把这条视频收藏起来。`,
      shots: ["0-3s 痛点特写", "3-12s 展示商品细节", "12-24s 真实使用过程", "24-30s 出现购买/咨询引导"]
    },
    {
      title: "对比切入",
      voiceover: `同类${product}看起来都差不多，真正拉开差距的是细节。我们重点看三件事：${sellingPoints}。不夸大效果，只说适合谁、不适合谁。${offer}，需要的朋友可以了解一下。`,
      shots: ["0-4s 两种选择并置", "4-14s 卖点逐项对比", "14-25s 使用前后或场景切换", "25-30s 口播行动建议"]
    },
    {
      title: "体验分享",
      voiceover: `我把${product}放进日常使用了一段时间，最直观的感受是：${sellingPoints}。它更适合${audience}，如果你期待的是立刻解决所有问题，那它并不适合你。想看更多真实体验，评论区告诉我。`,
      shots: ["0-3s 开箱或上手", "3-10s 第一天体验", "10-22s 高频使用场景", "22-30s 总结与评论引导"]
    }
  ];
  return {
    product,
    audience,
    sellingPoints,
    platform,
    tone,
    sellingPoints,
    offer,
    source: "local-template",
    price: adminStore.getPrices().product,
    titles: hooks,
    scripts,
    captions: [
      `${product}不是越贵越好，关键看${sellingPoints}。适合${audience}，不适合盲目跟风。`,
      `把商品放进真实场景里，才能知道它到底值不值得。${offer}。`,
      `今天只讲真实体验，不讲夸张话术。想看哪个角度，评论区留言。`
    ],
    hashtags: [`#${product.replace(/\s+/g, "")}`, "#真实测评", "#好物分享", `#${platform}`],
    calendar: [
      { day: "Day 1", angle: "痛点提问", format: "口播" },
      { day: "Day 2", angle: "核心卖点拆解", format: "细节特写" },
      { day: "Day 3", angle: "真实体验", format: "Vlog" },
      { day: "Day 4", angle: "使用误区", format: "清单" },
      { day: "Day 5", angle: "评论区问答", format: "回复视频" },
      { day: "Day 6", angle: "适合谁/不适合谁", format: "对比" },
      { day: "Day 7", angle: "一周总结", format: "合集" }
    ]
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function verifyWechatCallback(signature, timestamp, nonce, token) {
  if (!signature || !timestamp || !nonce || !token) return false;
  const expected = createHash("sha1")
    .update([token, timestamp, nonce].sort().join(""), "utf8")
    .digest("hex");
  return expected === signature;
}

function renderPaidContent(pack, order) {
  const titles = pack.titles.map((title, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(title)}</li>`).join("");
  const scripts = pack.scripts.map((script) => `<article><h3>${escapeHtml(script.title)}</h3><p>${escapeHtml(script.voiceover)}</p><small>${script.shots.map(escapeHtml).join(" · ")}</small></article>`).join("");
  const calendar = pack.calendar.map((item) => `<li><b>${escapeHtml(item.day)}</b><span>${escapeHtml(item.angle)} · ${escapeHtml(item.format)}</span></li>`).join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>内容包已交付</title><style>
  :root{color-scheme:dark}body{margin:0;background:#101110;color:#f1f0e8;font:15px system-ui,-apple-system,sans-serif}main{max-width:900px;margin:0 auto;padding:42px 20px 70px}header{padding-bottom:24px;border-bottom:1px solid #343833}h1{margin:8px 0;font-size:32px}h2{margin:30px 0 14px;font-size:20px}h3{margin:0 0 10px;color:#f4d35e;font-size:15px}p,small{color:#b0b6ae;line-height:1.8}.badge{color:#73e6ba;font-size:12px}.order{margin-top:10px;color:#8f988f;font-size:12px}.back{display:inline-block;margin-top:18px;padding:10px 13px;border:1px solid #4a5049;border-radius:4px;color:#f1f0e8;text-decoration:none;font-size:12px}.titles{display:grid;gap:8px;padding:0;list-style:none}.titles li,.calendar li,article{padding:14px;border:1px solid #292d29;border-radius:5px;background:#191b19}.titles b,.calendar b{display:inline-block;width:34px;color:#f4d35e}.scripts{display:grid;gap:10px}.calendar{display:grid;gap:8px;padding:0;list-style:none}.calendar li{display:flex;gap:14px}.calendar span{color:#d5dad2}</style><main><header><span class="badge">PAYMENT CONFIRMED / 已支付</span><h1>${escapeHtml(pack.product)} · 内容包</h1><div class="order">订单 ${escapeHtml(order.orderId)} · ¥${escapeHtml(order.amount)}</div><a class="back" href="${publicBasePath}/">返回商品页面</a></header><h2>10 个短视频标题</h2><ol class="titles">${titles}</ol><h2>3 条口播与分镜</h2><section class="scripts">${scripts}</section><h2>7 天发布计划</h2><ul class="calendar">${calendar}</ul></main></html>`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("请求内容不能超过 64 KB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求内容不是有效 JSON");
  }
}

async function readBody(request, maxSize = 128 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error("表单内容不能超过 128 KB");
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

async function resolveCommand(command, configuredPath) {
  const candidates = [
    configuredPath,
    ...(process.env.PATH || "").split(path.delimiter).map((directory) => path.join(directory, command)),
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue searching executable candidates.
    }
  }
  return undefined;
}

async function serveFile(request, response, filePath) {
  const fileStat = await stat(filePath);
  const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
  const range = request.headers.range;

  if (range && contentType === "video/mp4") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` });
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
    if (start > end || start >= fileStat.size) {
      response.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
      "Content-Type": contentType
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    "Content-Length": fileStat.size,
    "Content-Type": contentType,
    "Cache-Control": contentType === "video/mp4" ? "private, max-age=3600" : "no-cache"
  });
  createReadStream(filePath).pipe(response);
}

export const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      const [ffmpegPath, ffprobePath] = await Promise.all([
        resolveCommand("ffmpeg", process.env.FFMPEG_PATH),
        resolveCommand("ffprobe", process.env.FFPROBE_PATH)
      ]);
      sendJson(response, 200, {
        ready: Boolean(config.apiKey && config.modelId && ffmpegPath && ffprobePath),
        contentPackReady: true,
        prices: adminStore.getPrices(),
        modelConfigured: Boolean(config.apiKey && config.modelId),
        ffmpegReady: Boolean(ffmpegPath && ffprobePath),
        model: config.modelId || null
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assistant/config") {
      const prices = adminStore.getPrices();
      const base = `${requestOrigin(request, url)}`;
      sendJson(response, 200, {
        brand: "智助乖乖",
        prices,
        tools: [
          { type: "product", label: "商品内容包", price: prices.product },
          { type: "article", label: "公众号文章助手", price: prices.article },
          { type: "social", label: "朋友圈与社群助手", price: prices.social }
        ],
        channels: {
          web: `${base}/zhizhu/`,
          miniapp: "zhizhu://pages/index/index",
          officialAccount: {
            home: `${base}/zhizhu/?from=official-account`,
            product: `${base}/zhizhu/?from=official-account&tool=product`,
            article: `${base}/zhizhu/?from=official-account&tool=article`,
            social: `${base}/zhizhu/?from=official-account&tool=social`
          }
        }
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/wechat-pay/config") {
      sendJson(response, 200, wechatVirtualPay.status());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/wechat-pay/order") {
      const input = await readJson(request);
      try {
        const payment = await wechatVirtualPay.createOrder({
          code: readText(input.code, "微信登录凭证", { max: 512 }),
          type: String(input.type || "product"),
          input: input.input || {}
        });
        sendJson(response, 201, payment);
      } catch (error) {
        const status = error.code === "WECHAT_VIRTUAL_PAY_NOT_CONFIGURED" ? 503 : 400;
        sendJson(response, status, { error: error.message || "微信支付下单失败" });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/wechat-pay/notify") {
      const signatureValid = verifyWechatCallback(
        url.searchParams.get("signature"),
        url.searchParams.get("timestamp"),
        url.searchParams.get("nonce"),
        process.env.WECHAT_VIRTUAL_NOTIFY_TOKEN || ""
      );

      response.writeHead(signatureValid ? 200 : 403, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(
        signatureValid
          ? url.searchParams.get("echostr") || ""
          : "invalid signature"
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/wechat-pay/notify") {
      try {
        const xml = await readBody(request);
        await wechatVirtualPay.handleNotify(xml);
        response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
        response.end("<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>");
      } catch (error) {
        console.error("[WechatVirtualPay] notify failed", error);
        response.writeHead(400, { "Content-Type": "application/xml; charset=utf-8" });
        response.end(`<xml><ErrCode>1</ErrCode><ErrMsg><![CDATA[${escapeHtml(error.message || "notify failed")}]]></ErrMsg></xml>`);
      }
      return;
    }

    const wechatOrderMatch = /^\/api\/wechat-pay\/orders\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (request.method === "GET" && wechatOrderMatch) {
      const order = await wechatVirtualPay.getOrder(wechatOrderMatch[1]);
      if (!order) {
        sendJson(response, 404, { error: "微信支付订单不存在" });
        return;
      }
      sendJson(response, 200, {
        orderId: order.orderId,
        status: order.status,
        wxOrderId: order.wxOrderId || null,
        deliveredAt: order.deliveredAt || null
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/notifications/config") {
      sendJson(response, 200, wechatNotifications.status());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/notifications/miniapp/subscribe") {
      const input = await readJson(request);
      const result = await wechatNotifications.bindMiniappJob(input.jobId, input.code);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/notifications/official/start") {
      const status = wechatNotifications.status().official;
      const jobId = url.searchParams.get("jobId") || "";
      if (!status.authorizeUrl) {
        sendJson(response, 503, { error: "公众号模板消息尚未配置" });
        return;
      }
      const redirect = new URL(status.authorizeUrl);
      redirect.searchParams.set("state", `notify:${jobId}`);
      response.writeHead(302, { Location: redirect.toString() });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/notifications/official/callback") {
      const state = url.searchParams.get("state") || "";
      const jobId = state.startsWith("notify:") ? state.slice("notify:".length) : "";
      await wechatNotifications.bindOfficialCode(jobId, url.searchParams.get("code"));
      response.writeHead(302, {
        Location: `${publicBasePath}/?job=${encodeURIComponent(jobId)}&notification=ready`
      });
      response.end();
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      const input = await readJson(request);
      const token = adminStore.authenticate(
        input.username,
        input.password,
        request.socket.remoteAddress || "unknown"
      );
      if (!token) {
        sendJson(response, adminStore.credentialsConfigured() ? 401 : 503, {
          error: adminStore.credentialsConfigured() ? "账号或密码错误" : "后台账号尚未配置"
        });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": adminCookie(token, isSecureRequest(request))
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      const cookies = parseCookies(request.headers.cookie || "");
      adminStore.revoke(cookies.frame60_admin);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": expiredAdminCookie(isSecureRequest(request))
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname.startsWith("/api/admin/") && !adminAuthorized(request)) {
      sendJson(response, 401, { error: "需要后台登录" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/settings") {
      sendJson(response, 200, {
        prices: adminStore.getPrices(),
        credentialsConfigured: adminStore.credentialsConfigured()
      });
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/admin/settings") {
      const input = await readJson(request);
      try {
        const prices = await adminStore.updatePrices(input.prices || input);
        sendJson(response, 200, { prices });
      } catch (error) {
        sendJson(response, 400, { error: error.message || "价格配置无效" });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/orders") {
      sendJson(response, 200, { orders: await alipayWebPay.listOrders() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/videos") {
      sendJson(response, 200, { videos: await listVideos(DATA_DIRECTORY) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/content-pack") {
      const input = await readJson(request);
      const pack = makeContentPack(input);
      sendJson(response, 201, {
        pack,
        payment: {
          status: "not-integrated",
          amount: adminStore.getPrices().product,
          product: "商品短视频内容包"
        }
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assistant/generate") {
      const input = await readJson(request);
      let result;
      try {
        result = generateAssistantTool(input, adminStore.getPrices());
      } catch (error) {
        sendJson(response, 400, { error: error.message || "输入内容不完整" });
        return;
      }
      const tool = assistantToolConfig(result.type, adminStore.getPrices());
      sendJson(response, 201, {
        result,
        payment: {
          status: "not-integrated",
          amount: tool.price,
          product: tool.label
        }
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/content-pack/checkout") {
      const input = await readJson(request);
      const pack = makeContentPack(input);
      const payment = await alipayWebPay.buildPaymentForm({
        input: {
          productName: pack.product,
          audience: pack.audience,
          sellingPoints: pack.sellingPoints,
          platform: pack.platform,
          tone: pack.tone,
          offer: pack.offer
        },
        origin: requestOrigin(request, url),
        mobile: isMobileRequest(request)
      });
      sendJson(response, 201, {
        orderId: payment.order.orderId,
        amount: payment.order.amount,
        environment: payment.environment,
        paymentHtml: payment.paymentHtml
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/payment/return") {
      const params = Object.fromEntries(url.searchParams.entries());
      const orderId = params.out_trade_no || "";
      let order = null;
      if (orderId) {
        const verified = await alipayWebPay.verifyNotification(params);
        if (verified.ok) {
          order = verified.order;
        } else {
          const queried = await alipayWebPay.queryTrade(orderId);
          if (queried?.status === "TRADE_SUCCESS" || queried?.status === "TRADE_FINISHED") {
            order = await alipayWebPay.fulfillOrder(orderId);
          }
        }
      }
      if (order?.fulfilledAt) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(renderPaidContent(makeContentPack(order.input), order));
        return;
      }
      const status = orderId ? "正在确认支付结果" : "缺少订单号";
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      const safeOrderId = JSON.stringify(orderId).replace(/</g, "\\u003c");
      const paymentApi = `${publicBasePath}/api/payments/`;
      response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>支付结果确认</title><style>body{margin:0;background:#101010;color:#f1efe7;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{width:min(520px,calc(100% - 32px));padding:32px;border:1px solid #393936;background:#181818}h1{font-size:28px;margin:0 0 12px}p{color:#aaa89f;line-height:1.7}a{display:inline-block;margin-top:12px;padding:12px 15px;background:#f4d35e;color:#171812;text-decoration:none;font-weight:700;border-radius:4px}</style><main><h1>${status}</h1><p id="message">支付成功后会自动确认并展示完整内容包，请保持页面打开。</p><a href="${publicBasePath}/">返回商品页面</a></main><script>const orderId=${safeOrderId};const message=document.querySelector("#message");if(orderId){let attempts=0;const timer=setInterval(async()=>{attempts+=1;try{const response=await fetch(${JSON.stringify(paymentApi)}+encodeURIComponent(orderId),{cache:"no-store"});const data=await response.json();if(["TRADE_SUCCESS","TRADE_FINISHED"].includes(data.order?.status)){clearInterval(timer);message.textContent="支付已确认，正在打开完整内容包…";location.reload();}else if(attempts>=15){clearInterval(timer);message.textContent="仍在等待支付宝确认，请稍后刷新此页面。";}}catch(error){if(attempts>=15)clearInterval(timer);}},2000);}</script></html>`);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/alipay/notify") {
      const params = await readForm(request);
      const result = await alipayWebPay.verifyNotification(params);
      response.writeHead(result.ok ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(result.ok ? "success" : "fail");
      return;
    }

    const paymentMatch = /^\/api\/payments\/([^/]+)(?:\/(query|refund|refund-query|close))?$/.exec(url.pathname);
    if (request.method === "GET" && paymentMatch) {
      const order = await alipayWebPay.queryTrade(paymentMatch[1]);
      if (!order) {
        sendJson(response, 404, { error: "订单不存在" });
        return;
      }
      sendJson(response, 200, { order });
      return;
    }

    if (request.method === "POST" && paymentMatch && paymentMatch[2]) {
      const adminToken = process.env.PAYMENT_ADMIN_TOKEN;
      if (!adminToken || request.headers["x-payment-admin-token"] !== adminToken) {
        sendJson(response, 403, { error: "需要支付管理令牌" });
        return;
      }
      const orderId = paymentMatch[1];
      const action = paymentMatch[2];
      const body = action === "refund" || action === "refund-query" ? await readJson(request) : {};
      const result = action === "query"
        ? await alipayWebPay.query(orderId)
        : action === "refund"
          ? await alipayWebPay.refund(orderId, body.amount, body.requestNo)
          : action === "refund-query"
            ? await alipayWebPay.refundQuery(orderId, body.requestNo)
            : await alipayWebPay.close(orderId);
      sendJson(response, result.ok === false ? 400 : 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      if (!config.apiKey || !config.modelId) {
        sendJson(response, 503, { error: "模型尚未配置，请检查 .env.local" });
        return;
      }
      const [ffmpegPath, ffprobePath] = await Promise.all([
        resolveCommand("ffmpeg", process.env.FFMPEG_PATH),
        resolveCommand("ffprobe", process.env.FFPROBE_PATH)
      ]);
      if (!ffmpegPath || !ffprobePath) {
        sendJson(response, 503, { error: "FFmpeg 尚未配置，请运行 npm run desktop:config" });
        return;
      }
      const input = await readJson(request);
      validateGenerationInput(input);
      if (url.searchParams.get("async") === "1") {
        const id = randomUUID();
        await writeGenerationJob({
          id,
          status: "queued",
          progress: 5,
          detail: "等待后台任务启动",
          input,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        setImmediate(() => {
          void runGenerationJob({
            id,
            input,
            config,
            ffmpegPath,
            ffprobePath
          });
        });
        sendJson(response, 202, {
          jobId: id,
          status: "queued",
          progress: 5,
          statusUrl: `${publicBasePath}/api/generate/jobs/${id}`
        });
        return;
      }
      const video = await generateVideo({
        input,
        config,
        dataDirectory: DATA_DIRECTORY,
        ffmpeg: ffmpegPath,
        ffprobe: ffprobePath,
        signal: AbortSignal.timeout(20 * 60 * 1000)
      });
      sendJson(response, 201, { video });
      return;
    }

    const generationJobMatch = url.pathname.match(/^\/api\/generate\/jobs\/([a-f0-9-]+)$/);
    if (request.method === "GET" && generationJobMatch) {
      const job = await getGenerationJob(generationJobMatch[1]);
      if (!job) {
        sendJson(response, 404, { error: "任务不存在" });
        return;
      }
      sendJson(response, 200, {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        detail: job.detail,
        video: job.video || null,
        error: job.error || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt || null
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/videos/")) {
      const fileName = path.basename(url.pathname);
      if (!/^[a-f0-9-]+\.mp4$/.test(fileName)) throw Object.assign(new Error(), { code: "ENOENT" });
      await serveFile(request, response, path.join(DATA_DIRECTORY, "videos", fileName));
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/admin") {
        response.writeHead(301, { Location: `${publicBasePath}/admin/` });
        response.end();
        return;
      }
      const appEntrypoints = new Set([
        "/", "/web", "/web/", "/mobile", "/mobile/", "/desktop", "/desktop/",
        "/zhizhu", "/zhizhu/"
        , "/admin", "/admin/"
      ]);
      const requestedPath = appEntrypoints.has(url.pathname)
        ? (url.pathname.startsWith("/zhizhu") ? "zhizhu.html" : url.pathname.startsWith("/admin") ? "admin.html" : "index.html")
        : url.pathname.slice(1);
      const filePath = path.resolve(PUBLIC_DIRECTORY, requestedPath);
      if (!filePath.startsWith(`${PUBLIC_DIRECTORY}${path.sep}`)) {
        sendJson(response, 403, { error: "禁止访问" });
        return;
      }
      await serveFile(request, response, filePath);
      return;
    }

    sendJson(response, 404, { error: "未找到该接口" });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "未找到资源" });
      return;
    }
    console.error(`[${new Date().toISOString()}]`, error);
    sendJson(response, 500, { error: error.message || "服务内部错误" });
  }
});

export function startServer({
  host = process.env.HOST || "127.0.0.1",
  port = defaultPort,
  quiet = false
} = {}) {
  if (server.listening) {
    const address = server.address();
    return Promise.resolve({ server, host: address.address, port: address.port });
  }

  return new Promise((resolve, reject) => {
    const handleError = (error) => reject(error);
    server.once("error", handleError);
    server.listen(port, host, () => {
      server.off("error", handleError);
      const address = server.address();
      const instance = { server, host: address.address, port: address.port };
      if (!quiet) console.log(`Frame/60 Studio running at http://${host}:${instance.port}`);
      resolve(instance);
    });
  });
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await startServer();
}
