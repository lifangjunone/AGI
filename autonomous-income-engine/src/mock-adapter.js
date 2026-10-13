const http = require("node:http");
const { URL } = require("node:url");

const calls = [];
const payments = [];

function resetCalls() {
  calls.length = 0;
  payments.length = 0;
}

function readJson(req, maxBytes = 25 * 1024 * 1024) {
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

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/calls") {
    return sendJson(res, 200, { ok: true, calls });
  }

  if (req.method === "GET" && url.pathname === "/payments") {
    return sendJson(res, 200, { ok: true, payments });
  }

  if (req.method === "POST" && url.pathname === "/payments") {
    try {
      const body = await readJson(req);
      const payment = {
        id: body.id || body.transactionId || `mock_payment_${Date.now()}_${payments.length}`,
        at: new Date().toISOString(),
        ...body,
      };
      payments.push(payment);
      return sendJson(res, 201, { ok: true, payment });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "POST" && (url.pathname.startsWith("/publish/") || url.pathname.startsWith("/growth/") || url.pathname === "/fulfillment" || url.pathname === "/indexnow" || url.pathname === "/deploy")) {
    try {
      const body = await readJson(req);
      const call = {
        id: `mock_${Date.now()}_${calls.length}`,
        at: new Date().toISOString(),
        path: url.pathname,
        body,
      };
      calls.push(call);
      if (url.pathname === "/deploy") {
        return sendJson(res, 200, {
          ok: true,
          received: call.id,
          publicBaseUrl: body.publicBaseUrl || "https://mock-money.example",
          files: Array.isArray(body.files) ? body.files.length : 0,
        });
      }
      if (url.pathname.startsWith("/growth/")) {
        return sendJson(res, 200, {
          ok: true,
          received: call.id,
          externalUrl: `https://growth.example${url.pathname}/${encodeURIComponent(body.experimentId || call.id)}`,
        });
      }
      return sendJson(res, 200, { ok: true, received: call.id });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  }

  return sendJson(res, 404, { ok: false, error: "not found" });
}

if (require.main === module) {
  const port = Number(process.env.MOCK_ADAPTER_PORT || 4199);
  http.createServer(handler).listen(port, "127.0.0.1", () => {
    console.log(`本地 mock 外部适配器：http://127.0.0.1:${port}`);
    console.log(`查看收到的发布/交付调用：http://127.0.0.1:${port}/calls`);
    console.log(`模拟付款 feed：http://127.0.0.1:${port}/payments`);
  });
}

module.exports = { handler, calls, payments, resetCalls };
