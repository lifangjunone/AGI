// 极简 Web 预览/归档服务（无第三方框架）。
//   GET /            最新文章
//   GET /<date>      指定日期文章（如 /2026-09-20）
//   GET /api/briefs  归档列表 JSON
import { createServer } from "node:http";
import { config } from "./config.js";
import { renderPage } from "./render.js";
import { latestBrief, getBrief, listDates } from "./store.js";

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function indexPage() {
  const dates = listDates();
  const items = dates
    .map((d) => {
      const b = getBrief(d);
      return `<li><a href="/${d}">${d}</a> · ${(b?.article?.title || "")}</li>`;
    })
    .join("");
  return `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px;">
    <h2>FDE 每日速递归档</h2><ul style="line-height:2">${items || "<li>暂无</li>"}</ul></body>`;
}

export function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/api/briefs") {
      return send(res, 200, JSON.stringify(listDates()), "application/json; charset=utf-8");
    }

    if (path === "/" || path === "/index.html") {
      const brief = latestBrief();
      if (!brief) return send(res, 200, indexPage());
      return send(res, 200, renderPage(brief));
    }

    const m = path.match(/^\/(\d{4}-\d{2}-\d{2})\/?$/);
    if (m) {
      const brief = getBrief(m[1]);
      if (!brief) return send(res, 404, "<h2>当天无文章</h2><a href='/'>返回</a>");
      return send(res, 200, renderPage(brief));
    }

    if (path === "/archive") return send(res, 200, indexPage());

    send(res, 404, "Not found");
  });

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`[fde-daily-brief] 预览服务: http://0.0.0.0:${config.port}/`);
  });
  return server;
}
