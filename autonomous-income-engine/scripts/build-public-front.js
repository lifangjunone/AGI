const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const FRONT = path.join(ROOT, "public-front");
const DYNAMIC_URL_FILE = path.join(FRONT, "service.json");
const GUIDE_SLUGS = [
  "12315-complaint-evidence-list",
  "merchant-refuses-refund-evidence",
  "product-not-as-described-evidence",
  "wechat-chat-evidence-organize",
  "damaged-delivery-claim-evidence",
  "prepaid-service-refund-evidence",
];

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
    .replace('href="/favicon.svg"', 'href="./favicon.svg"')
    .replace('href="/styles.css"', 'href="./styles.css"')
    .replace('class="matrix-brand" href="/"', 'class="matrix-brand" href="./"')
    .replaceAll('href="/products/', 'href="./products/')
    .replace(/href="(?:https?:\/\/[^"]+)?\/guides\//g, 'href="./guides/')
    .replace(/href="https?:\/\/[^"]+\/image\/guides\//g, 'href="./guides/')
    .replace('href="/admin/"', 'href="./"'),
    publicFrontUrl(frontBaseUrl)
  );
}

function rewriteProduct(html, relativePath, frontBaseUrl) {
  const baseUrl = publicFrontUrl(frontBaseUrl, relativePath);
  return rewriteDiscoveryUrl(
    html
      .replace('href="/favicon.svg"', 'href="../../favicon.svg"')
      .replace('href="/styles.css"', 'href="../../styles.css"')
      .replace('src="/fflate.js"', 'src="../../fflate.js"')
      .replace('href="/wechat-pay.jpg"', 'href="../../wechat-pay.jpg"')
      .replace('src="/wechat-pay.jpg"', 'src="../../wechat-pay.jpg"')
      .replace('href="/"', 'href="../../"'),
    baseUrl
  );
}

function rewritePreset(html, slug, frontBaseUrl) {
  return rewriteDiscoveryUrl(
    html
    .replace('href="/favicon.svg"', 'href="../favicon.svg"')
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
  const title = "LifeYouMe 实用工具箱";
  const description = "先免费生成和预览，确认结果适合自己后，再付费下载完整文件。";
  const sourceFeed = JSON.parse(fs.readFileSync(path.join(DIST, "feed.json"), "utf8"));
  const guides = (sourceFeed.guides || []).map((guide, index) => ({
    ...guide, url: publicFrontUrl(frontBaseUrl, `guides/${GUIDE_SLUGS[index]}/`),
  }));
  const presets = [
    { slug: "white-main-image", title: "商品白底主图批量生成", description: "自动换纯色背景并生成 1200×1200 白底主图；先预览，到账解锁高清 ZIP。" },
    { slug: "portrait-product-image", title: "3:4 商品图批量生成", description: "统一主体占比并生成 1200×1600 商品图；先预览，到账解锁高清 ZIP。" },
    { slug: "social-product-card", title: "4:5 商品内容图批量生成", description: "自动居中铺满并生成 1200×1500 内容图；先预览，到账解锁高清 ZIP。" },
    { slug: "taobao-main-image", title: "淘宝主图批量生成", description: "生成 800×800 淘宝白底主图并统一主体占比；先预览，到账解锁高清 ZIP。" },
    { slug: "pdd-main-image", title: "拼多多主图批量生成", description: "生成 800×800 拼多多白底主图并统一商品大小；先预览，到账解锁高清 ZIP。" },
    { slug: "xiaohongshu-product-image", title: "小红书商品图批量生成", description: "生成 1242×1660 小红书竖版商品图；先预览，到账解锁高清 ZIP。" },
    { slug: "douyin-product-image", title: "抖音商品图批量生成", description: "生成 1080×1440 抖音竖版商品图；先预览，到账解锁高清 ZIP。" },
  ];
  const products = [
    { slug: "consumer-evidence-pack", title: "消费维权证据包生成器", price: 19.9 },
    { slug: "product-image-batch-studio", title: "商品图批量成品机", price: 6.9 },
  ];
  const urls = [
    publicFrontUrl(frontBaseUrl),
    ...products.map((product) => publicFrontUrl(frontBaseUrl, `products/${product.slug}/`)),
    ...guides.map((guide) => guide.url),
    ...presets.map((page) => publicFrontUrl(frontBaseUrl, `presets/${page.slug}.html`)),
  ];
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
    guides,
    presetTools: presets.map((page) => ({
      title: page.title,
      description: page.description,
      url: publicFrontUrl(frontBaseUrl, `presets/${page.slug}.html`),
    })),
    products: products.map((product) => ({
      id: product.slug,
      title: product.title,
      price: product.price,
      url: publicFrontUrl(frontBaseUrl, `products/${product.slug}/`),
    })),
  };
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${title}</title>
  <link>${publicFrontUrl(frontBaseUrl)}</link>
  <description>${description}</description>
  <item><guid>product-image-batch-studio</guid><title>${title}</title><link>${publicFrontUrl(frontBaseUrl)}</link><description>${description}</description></item>
  ${guides.map((guide) => `<item><guid>${guide.url}</guid><title>${guide.title}</title><link>${guide.url}</link><description>${guide.description}</description></item>`).join("\n  ")}
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
    "favicon.svg",
    "styles.css",
    "fflate.js",
    "wechat-pay.jpg",
    "feed.json",
    "rss.xml",
    "robots.txt",
    "sitemap.xml",
    "products/consumer-evidence-pack/index.html",
    "products/product-image-batch-studio/index.html",
    ...GUIDE_SLUGS.map((slug) => `guides/${slug}/index.html`),
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
  for (const relative of publicFiles.filter((file) => file.startsWith("products/"))) {
    const file = path.join(FRONT, relative);
    fs.writeFileSync(file, rewriteProduct(fs.readFileSync(file, "utf8"), relative.replace(/index\.html$/, ""), frontBaseUrl));
  }
  for (const slug of GUIDE_SLUGS) {
    const file = path.join(FRONT, "guides", slug, "index.html");
    let html = fs.readFileSync(file, "utf8");
    html = html
      .replace(/href="[^"]*\/favicon\.svg"/, 'href="../../favicon.svg"')
      .replace(/(<nav class="guide-nav"><a href=")[^"]*"/, '$1../../"')
      .replace(/href="(?:https?:\/\/[^"]+)?\/(?:image\/)?guides\//g, 'href="../')
      .replace(/href="[^"]*\/products\/consumer-evidence-pack\/\?/g, 'href="../../products/consumer-evidence-pack/?')
      .replace(/const endpoint = [^;]+;/, `const endpoint = ${JSON.stringify(serviceUrl ? `${serviceUrl.replace(/\/+$/, "")}/api/events` : "../../api/events")};`);
    fs.writeFileSync(file, rewriteDiscoveryUrl(html, publicFrontUrl(frontBaseUrl, `guides/${slug}/`)));
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
