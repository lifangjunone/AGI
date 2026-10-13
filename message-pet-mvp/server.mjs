import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboard } from "./src/message-engine.mjs";
import { normalizeFeishuEvent, verifyFeishuEvent } from "./src/feishu-adapter.mjs";
import { createStore } from "./src/store.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const dataDir = process.env.MESSAGE_PET_DATA_DIR || join(root, ".data");

const rawMessages = [
  {
    id: "m1",
    platform: "飞书",
    sender: "张总",
    group: "核心项目群",
    content: "@我 线上支付异常，请今天 16:00 前确认影响范围并回复。",
    mentionedMe: true,
    timestamp: "2026-09-30T13:42:00+08:00",
    unread: true,
  },
  {
    id: "m2",
    platform: "微信",
    sender: "陈曦",
    content: "客户明早要看方案，麻烦今晚确认一下最终版本。",
    mentionedMe: false,
    timestamp: "2026-09-30T13:25:00+08:00",
    unread: true,
  },
  {
    id: "m3",
    platform: "飞书",
    sender: "林然",
    group: "产品上线群",
    content: "@我 新版本灰度数据已出，需要你确认是否继续放量。",
    mentionedMe: true,
    timestamp: "2026-09-30T12:58:00+08:00",
    unread: true,
  },
  {
    id: "m4",
    platform: "微信",
    sender: "家人",
    group: "家庭群",
    content: "周末聚餐还是老地方，大家有空回复一下。",
    mentionedMe: false,
    timestamp: "2026-09-30T11:16:00+08:00",
    unread: true,
  },
  {
    id: "m5",
    platform: "飞书",
    sender: "项目机器人",
    group: "研发通知群",
    content: "构建 #2841 已成功，测试环境部署完成。",
    mentionedMe: false,
    timestamp: "2026-09-30T10:30:00+08:00",
    unread: false,
  },
  {
    id: "m6",
    platform: "微信",
    sender: "王哲",
    content: "下午有空吗？想同步一下下季度规划。",
    mentionedMe: false,
    timestamp: "2026-09-30T09:48:00+08:00",
    unread: true,
  },
];

const store = createStore(dataDir, rawMessages);
await store.load();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request, maxBytes = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("请求内容过大");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON 格式无效");
    error.statusCode = 400;
    throw error;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/dashboard") {
    const data = store.read();
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      preferences: data.preferences,
      integrations: {
        feishu: {
          configured: Boolean(process.env.FEISHU_VERIFICATION_TOKEN),
          currentUserConfigured: Boolean(process.env.FEISHU_CURRENT_USER_OPEN_ID),
          callbackPath: "/api/integrations/feishu/events",
        },
        browserBridge: {
          configured: true,
          endpoint: `http://${host}:${port}/api/integrations/browser/messages`,
          pairingCode: data.integrations.browserBridgeToken,
        },
      },
      ...buildDashboard(data.messages, data.preferences),
    });
    return;
  }

  if (url.pathname === "/api/integrations/browser/messages" && request.method === "POST") {
    try {
      const data = store.read();
      const pairingCode = request.headers["x-message-pet-token"];
      if (pairingCode !== data.integrations.browserBridgeToken) {
        sendJson(response, 401, { error: "浏览器伴侣配对码无效" });
        return;
      }
      const payload = await readJson(request, 32 * 1024);
      const content = String(payload.content || "").trim().slice(0, 2000);
      const sender = String(payload.sender || payload.title || "网页通知").trim().slice(0, 100);
      if (!content) {
        sendJson(response, 400, { error: "消息内容不能为空" });
        return;
      }
      const receivedAt = new Date();
      const suppliedId = String(payload.id || "").trim();
      const safeId = /^[a-zA-Z0-9._:-]{1,160}$/.test(suppliedId)
        ? suppliedId
        : `${receivedAt.getTime()}-${Math.random().toString(16).slice(2)}`;
      const message = {
        id: `browser-${safeId}`,
        platform: String(payload.platform || "浏览器").trim().slice(0, 30),
        sender,
        group: payload.group ? String(payload.group).trim().slice(0, 100) : undefined,
        content,
        mentionedMe: Boolean(payload.mentionedMe || /@我|@\s*me\b/i.test(content)),
        timestamp: receivedAt.toISOString(),
        unread: true,
        sourceUrl: /^https?:\/\//.test(payload.sourceUrl || "") ? payload.sourceUrl : undefined,
      };
      const added = await store.addMessage(message);
      sendJson(response, 200, { accepted: true, added, messageId: message.id });
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/preferences" && request.method === "PUT") {
    try {
      const preferences = await store.updatePreferences(await readJson(request, 32 * 1024));
      sendJson(response, 200, { preferences });
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/integrations/feishu/events" && request.method === "POST") {
    try {
      const payload = await readJson(request);
      const verification = verifyFeishuEvent(
        payload,
        process.env.FEISHU_VERIFICATION_TOKEN,
      );
      if (!verification.ok) {
        sendJson(response, 401, { error: verification.reason });
        return;
      }
      if (payload.challenge) {
        sendJson(response, 200, { challenge: payload.challenge });
        return;
      }

      const message = normalizeFeishuEvent(
        payload,
        process.env.FEISHU_CURRENT_USER_OPEN_ID,
      );
      if (!message) {
        sendJson(response, 202, { accepted: false, reason: "非消息事件" });
        return;
      }
      const added = await store.addMessage(message);
      sendJson(response, 200, { accepted: true, added, messageId: message.id });
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message });
    }
    return;
  }

  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(publicDir, safePath);

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mime[extname(filePath)] ?? "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`消息灵宠 MVP 已启动：http://${host}:${port}`);
});
