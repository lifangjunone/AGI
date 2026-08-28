const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculateStats,
  createOrder,
  filterOrders,
  transitionOrder
} = require("./lib/work-orders");

const root = __dirname;
const publicRoot = path.join(root, "public");
const dataPath = path.join(root, "data", "work-orders.json");
const port = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readOrders() {
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function writeOrders(orders) {
  const temporaryPath = `${dataPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, dataPath);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求 JSON 无效"));
      }
    });
    request.on("error", reject);
  });
}

function handleError(response, error) {
  const status =
    error.code === "VALIDATION_ERROR"
      ? 400
      : error.code === "INVALID_TRANSITION"
        ? 409
        : 500;
  sendJson(response, status, {
    error: error.code || "INTERNAL_ERROR",
    message: error.message,
    details: error.details || null
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      status: "ok",
      service: "equipment-work-order-system",
      version: "1.0.0"
    });
  }

  if (request.method === "GET" && url.pathname === "/api/work-orders") {
    const orders = readOrders();
    const filtered = filterOrders(orders, {
      query: url.searchParams.get("query"),
      status: url.searchParams.get("status"),
      priority: url.searchParams.get("priority")
    });
    return sendJson(response, 200, {
      items: filtered,
      total: filtered.length,
      stats: calculateStats(orders)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/work-orders") {
    try {
      const orders = readOrders();
      const input = await readBody(request);
      const order = createOrder(input, orders);
      orders.unshift(order);
      writeOrders(orders);
      return sendJson(response, 201, { item: order, stats: calculateStats(orders) });
    } catch (error) {
      return handleError(response, error);
    }
  }

  const detailMatch = url.pathname.match(/^\/api\/work-orders\/([^/]+)$/);
  if (request.method === "GET" && detailMatch) {
    const order = readOrders().find(
      (candidate) => candidate.id === decodeURIComponent(detailMatch[1])
    );
    return order
      ? sendJson(response, 200, { item: order })
      : sendJson(response, 404, { error: "NOT_FOUND", message: "工单不存在" });
  }

  const transitionMatch = url.pathname.match(
    /^\/api\/work-orders\/([^/]+)\/transition$/
  );
  if (request.method === "POST" && transitionMatch) {
    try {
      const orders = readOrders();
      const id = decodeURIComponent(transitionMatch[1]);
      const index = orders.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return sendJson(response, 404, {
          error: "NOT_FOUND",
          message: "工单不存在"
        });
      }
      const input = await readBody(request);
      orders[index] = transitionOrder(orders[index], input);
      writeOrders(orders);
      return sendJson(response, 200, {
        item: orders[index],
        stats: calculateStats(orders)
      });
    } catch (error) {
      return handleError(response, error);
    }
  }

  sendJson(response, 404, { error: "NOT_FOUND", message: "接口不存在" });
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicRoot, normalized);
  if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    return response.end("Not found");
  }
  const extension = path.extname(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, response, url);
  }
  return serveStatic(response, url.pathname);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`设备检修工单管理系统已启动：http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
