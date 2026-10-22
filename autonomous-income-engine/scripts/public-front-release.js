const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const DEFAULT_FRONT = path.join(ROOT, "public-front");
const ALLOWED_FILES = new Set([
  ".nojekyll",
  "favicon.svg",
  "feed.json",
  "fflate.js",
  "index.html",
  "robots.txt",
  "rss.xml",
  "service.json",
  "sitemap.xml",
  "styles.css",
  "wechat-pay.jpg",
  "products/consumer-evidence-pack/index.html",
  "products/product-image-batch-studio/index.html",
  "guides/12315-complaint-evidence-list/index.html",
  "guides/merchant-refuses-refund-evidence/index.html",
  "guides/product-not-as-described-evidence/index.html",
  "guides/wechat-chat-evidence-organize/index.html",
  "guides/damaged-delivery-claim-evidence/index.html",
  "guides/prepaid-service-refund-evidence/index.html",
  "presets/portrait-product-image.html",
  "presets/social-product-card.html",
  "presets/white-main-image.html",
  "presets/taobao-main-image.html",
  "presets/pdd-main-image.html",
  "presets/xiaohongshu-product-image.html",
  "presets/douyin-product-image.html",
]);
const SENSITIVE_PATTERNS = [
  /paymentRemark/i,
  /webhookSecret/i,
  /feedSecret/i,
  /deliveryToken/i,
  /checkout_[0-9]/,
  /order_[0-9]/,
  /data\/delivery/i,
  /runtime\/local-loop/i,
];

function walkFiles(root, current = root) {
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, full));
    else files.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return files.sort();
}

function verifyPublicFront(directory = DEFAULT_FRONT) {
  const root = path.resolve(directory);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`public front directory does not exist: ${root}`);
  }
  const files = walkFiles(root);
  const unexpected = files.filter((file) => !ALLOWED_FILES.has(file));
  const missing = [...ALLOWED_FILES].filter((file) => !files.includes(file));
  if (unexpected.length || missing.length) {
    throw new Error(
      `public front whitelist mismatch; unexpected=${unexpected.join(",") || "none"} missing=${missing.join(",") || "none"}`
    );
  }
  const sensitiveMatches = [];
  let bytes = 0;
  for (const relative of files) {
    const file = path.join(root, relative);
    const content = fs.readFileSync(file);
    bytes += content.length;
    const text = content.toString("utf8");
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(relative) || pattern.test(text)) sensitiveMatches.push(`${relative}:${pattern}`);
    }
  }
  if (sensitiveMatches.length) {
    throw new Error(`public front contains sensitive material: ${sensitiveMatches.join(", ")}`);
  }
  const approvedQr = fs.readFileSync(path.join(ROOT, "assets", "wechat-pay.jpg"));
  const publicQr = fs.readFileSync(path.join(root, "wechat-pay.jpg"));
  const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
  if (digest(publicQr) !== digest(approvedQr)) {
    throw new Error("public front QR does not match the user-approved collection code");
  }
  const service = JSON.parse(fs.readFileSync(path.join(root, "service.json"), "utf8"));
  if (service.productId !== "product-image-batch-studio") {
    throw new Error("public front service.json has an unexpected product");
  }
  if (service.url) {
    const target = new URL(service.url);
    if (target.protocol !== "https:") throw new Error("public payment service must use HTTPS");
  }
  return { ok: true, directory: root, files, bytes, serviceUrl: service.url || "" };
}

function copyAllowedPublicFront(source, target) {
  const verified = verifyPublicFront(source);
  const destination = path.resolve(target);
  if (destination === path.parse(destination).root) throw new Error("refusing to stage public front at filesystem root");
  if (fs.existsSync(destination)) {
    if (!fs.statSync(destination).isDirectory()) throw new Error("public front stage target must be a directory");
    if (fs.readdirSync(destination).length) throw new Error("refusing to overwrite a non-empty public front stage target");
  }
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(temporary, { recursive: true });
  try {
    for (const relative of verified.files) {
      const from = path.join(verified.directory, relative);
      const to = path.join(temporary, relative);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
    verifyPublicFront(temporary);
    if (fs.existsSync(destination)) fs.rmdirSync(destination);
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return verifyPublicFront(destination);
}

async function probePaymentService(serviceUrl, { timeoutMs = 5000, fetchImpl = fetch } = {}) {
  const target = new URL(serviceUrl);
  if (target.protocol !== "https:") throw new Error("public payment service must use HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs) || 5000));
  timer.unref?.();
  try {
    const response = await fetchImpl(new URL("/api/status", target), {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "autonomous-income-engine-health-probe" },
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {}
    if (!response.ok || body?.ok !== true) {
      throw new Error(`payment service health check failed: status=${response.status} ok=${body?.ok === true}`);
    }
    return { ok: true, statusCode: response.status, url: target.origin };
  } finally {
    clearTimeout(timer);
  }
}

function atomicWriteJson(file, value) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  fs.renameSync(temporary, target);
}

async function updatePaymentService({
  directory = DEFAULT_FRONT,
  serviceUrl,
  probe = probePaymentService,
  now = () => new Date().toISOString(),
} = {}) {
  verifyPublicFront(directory);
  const cleanUrl = String(serviceUrl || "").replace(/\/+$/, "");
  if (!cleanUrl) throw new Error("serviceUrl is required");
  const health = await probe(cleanUrl);
  const file = path.join(directory, "service.json");
  atomicWriteJson(file, {
    url: cleanUrl,
    productId: "product-image-batch-studio",
    updatedAt: now(),
    health,
  });
  return verifyPublicFront(directory);
}

async function main() {
  const [command = "verify", first = "", second = ""] = process.argv.slice(2);
  if (command === "verify") {
    console.log(JSON.stringify(verifyPublicFront(first || DEFAULT_FRONT), null, 2));
    return;
  }
  if (command === "stage") {
    if (!first) throw new Error("stage target directory is required");
    console.log(JSON.stringify(copyAllowedPublicFront(second || DEFAULT_FRONT, first), null, 2));
    return;
  }
  if (command === "set-service") {
    if (!first) throw new Error("HTTPS service URL is required");
    console.log(JSON.stringify(await updatePaymentService({ directory: second || DEFAULT_FRONT, serviceUrl: first }), null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_FILES,
  verifyPublicFront,
  copyAllowedPublicFront,
  probePaymentService,
  updatePaymentService,
};
