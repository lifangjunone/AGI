import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "src");
const port = Number(process.env.PORT || 45210);
const host = process.env.HOST || "127.0.0.1";
const basePath = "/mapproof";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".woff2": "font/woff2"
};

function sendFile(res, file) {
  res.writeHead(200, {
    "Content-Type": types[extname(file)] || "application/octet-stream",
    "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ status: "ok", service: "mapproof", version: "0.1.0" }));
  }
  if (url.pathname === basePath) {
    res.writeHead(308, { Location: `${basePath}/` });
    return res.end();
  }
  if (!url.pathname.startsWith(`${basePath}/`)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }

  let relative = decodeURIComponent(url.pathname.slice(basePath.length + 1)) || "index.html";
  if (relative === "vendor/mermaid.js") {
    return sendFile(res, join(root, "node_modules/mermaid/dist/mermaid.esm.min.mjs"));
  }
  if (relative.startsWith("vendor/chunks/")) {
    const vendorRelative = normalize(relative.slice("vendor/".length)).replace(/^(\.\.(\/|\\|$))+/, "");
    const vendorFile = join(root, "node_modules/mermaid/dist", vendorRelative);
    if (!vendorFile.startsWith(join(root, "node_modules/mermaid/dist")) || !existsSync(vendorFile)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    return sendFile(res, vendorFile);
  }
  relative = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = join(publicRoot, relative);
  if (!candidate.startsWith(publicRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  sendFile(res, candidate);
});

server.listen(port, host, () => {
  console.log(`MapProof listening on http://${host}:${port}${basePath}/`);
});
