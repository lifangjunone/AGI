const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const FRONT = path.join(ROOT, "public-front");
const DYNAMIC_URL_FILE = path.join(FRONT, "service.json");

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function copyFile(relative) {
  const source = path.join(DIST, relative);
  const target = path.join(FRONT, relative);
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function rewriteDiscoveryUrl(html, targetUrl) {
  return html
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${targetUrl}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${targetUrl}$2`)
    .replace(/("url"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(targetUrl)}`);
}

function rewriteHome(html, frontBaseUrl) {
  return rewriteDiscoveryUrl(
    html
    .replace('href="/styles.css"', 'href="./styles.css"')
    .replace('src="/fflate.js"', 'src="./fflate.js"')
    .replace('href="/wechat-pay.jpg"', 'href="./wechat-pay.jpg"')
    .replace('src="/wechat-pay.jpg"', 'src="./wechat-pay.jpg"')
    .replace("navigator.sendBeacon?.('/api/events'", "navigator.sendBeacon?.('./api/events'"),
    publicFrontUrl(frontBaseUrl)
  );
}

function rewritePreset(html, slug, frontBaseUrl) {
  return rewriteDiscoveryUrl(
    html
    .replace('href="/styles.css"', 'href="../styles.css"')
    .replace('src="/fflate.js"', 'src="../fflate.js"')
    .replace('href="/wechat-pay.jpg"', 'href="../wechat-pay.jpg"')
    .replace('src="/wechat-pay.jpg"', 'src="../wechat-pay.jpg"')
    .replace("navigator.sendBeacon?.('/api/events'", "navigator.sendBeacon?.('../api/events'"),
    publicFrontUrl(frontBaseUrl, `presets/${slug}.html`)
  );
}

function publicFrontUrl(frontBaseUrl, relative = "") {
  const base = String(frontBaseUrl || "").replace(/\/+$/, "");
  const clean = String(relative || "").replace(/^\/+/, "");
  if (!base) return clean ? `./${clean}` : "./";
  return clean ? `${base}/${clean}` : `${base}/`;
}

function writeDiscoveryFiles(frontBaseUrl = "") {
  const title = "商品图批量成品机";
  const description = "批量统一商品图尺寸、主体占比、纯色背景、留白和品牌角标；先预览，到账后自动解锁高清 ZIP。";
  const presets = [
    { slug: "white-main-image", title: "商品白底主图批量生成", description: "自动换纯色背景并生成 1200×1200 白底主图；先预览，到账解锁高清 ZIP。" },
    { slug: "portrait-product-image", title: "3:4 商品图批量生成", description: "统一主体占比并生成 1200×1600 商品图；先预览，到账解锁高清 ZIP。" },
    { slug: "social-product-card", title: "4:5 商品内容图批量生成", description: "自动居中铺满并生成 1200×1500 内容图；先预览，到账解锁高清 ZIP。" },
    { slug: "taobao-main-image", title: "淘宝主图批量生成", description: "生成 800×800 淘宝白底主图并统一主体占比；先预览，到账解锁高清 ZIP。" },
    { slug: "pdd-main-image", title: "拼多多主图批量生成", description: "生成 800×800 拼多多白底主图并统一商品大小；先预览，到账解锁高清 ZIP。" },
    { slug: "xiaohongshu-product-image", title: "小红书商品图批量生成", description: "生成 1242×1660 小红书竖版商品图；先预览，到账解锁高清 ZIP。" },
    { slug: "douyin-product-image", title: "抖音商品图批量生成", description: "生成 1080×1440 抖音竖版商品图；先预览，到账解锁高清 ZIP。" },
  ];
  const urls = [publicFrontUrl(frontBaseUrl), ...presets.map((page) => publicFrontUrl(frontBaseUrl, `presets/${page.slug}.html`))];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>
`;
  const feed = {
    version: 1,
    title,
    description,
    homeUrl: publicFrontUrl(frontBaseUrl),
    updatedAt: new Date().toISOString(),
    freeTools: [],
    presetTools: presets.map((page) => ({
      title: page.title,
      description: page.description,
      url: publicFrontUrl(frontBaseUrl, `presets/${page.slug}.html`),
    })),
    products: [
      {
        id: "product-image-batch-studio",
        title,
        price: 6.9,
        url: publicFrontUrl(frontBaseUrl),
      },
    ],
  };
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${title}</title>
  <link>${publicFrontUrl(frontBaseUrl)}</link>
  <description>${description}</description>
  <item><guid>product-image-batch-studio</guid><title>${title}</title><link>${publicFrontUrl(frontBaseUrl)}</link><description>${description}</description></item>
  ${presets.map((page) => `<item><guid>${page.slug}</guid><title>${page.title}</title><link>${publicFrontUrl(frontBaseUrl, `presets/${page.slug}.html`)}</link><description>${page.description}</description></item>`).join("\n  ")}
</channel></rss>
`;
  const robots = [
    "User-agent: *",
    "Allow: /",
    ...(frontBaseUrl ? [`Sitemap: ${publicFrontUrl(frontBaseUrl, "sitemap.xml")}`] : []),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(FRONT, "sitemap.xml"), sitemap);
  fs.writeFileSync(path.join(FRONT, "feed.json"), JSON.stringify(feed, null, 2));
  fs.writeFileSync(path.join(FRONT, "rss.xml"), rss);
  fs.writeFileSync(path.join(FRONT, "robots.txt"), robots);
}

function buildPublicFront({ serviceUrl = "", frontBaseUrl = "" } = {}) {
  resetDirectory(FRONT);
  const publicFiles = [
    "styles.css",
    "fflate.js",
    "wechat-pay.jpg",
    "feed.json",
    "rss.xml",
    "robots.txt",
    "sitemap.xml",
    "presets/white-main-image.html",
    "presets/portrait-product-image.html",
    "presets/social-product-card.html",
    "presets/taobao-main-image.html",
    "presets/pdd-main-image.html",
    "presets/xiaohongshu-product-image.html",
    "presets/douyin-product-image.html",
  ];
  for (const relative of publicFiles) copyFile(relative);
  for (const relative of publicFiles.filter((file) => file.startsWith("presets/"))) {
    const file = path.join(FRONT, relative);
    const slug = path.basename(relative, ".html");
    fs.writeFileSync(file, rewritePreset(fs.readFileSync(file, "utf8"), slug, frontBaseUrl));
  }
  const home = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  fs.writeFileSync(path.join(FRONT, "index.html"), rewriteHome(home, frontBaseUrl));
  writeDiscoveryFiles(String(frontBaseUrl || "").replace(/\/+$/, ""));
  fs.writeFileSync(
    DYNAMIC_URL_FILE,
    JSON.stringify(
      {
        url: String(serviceUrl || "").replace(/\/+$/, ""),
        productId: "product-image-batch-studio",
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(FRONT, ".nojekyll"), "");
  return {
    directory: FRONT,
    files: fs.readdirSync(FRONT, { recursive: true }).sort(),
    serviceUrl,
    frontBaseUrl,
  };
}

if (require.main === module) {
  const serviceUrl = process.argv[2] || "";
  const frontBaseUrl = process.argv[3] || "";
  console.log(JSON.stringify(buildPublicFront({ serviceUrl, frontBaseUrl }), null, 2));
}

module.exports = { buildPublicFront };
