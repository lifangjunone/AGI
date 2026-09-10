import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const coverDir = path.join(root, "public", "official-covers");
const assets = [
  "001-scene-wide.jpg",
  "001-screen-closeup.jpg",
  "001-action-detail.jpg"
];
const images = await Promise.all(assets.map(async (name) => ({
  name,
  data: `data:image/jpeg;base64,${(await readFile(path.join(coverDir, name))).toString("base64")}`
})));
const output = path.join(coverDir, "001-normal-product-7-videos-hero.png");

await mkdir(coverDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 510 },
    deviceScaleFactor: 2
  });
  await page.setContent(`<!doctype html>
  <html><head><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#172d26}
  .cover{position:relative;width:1200px;height:510px;overflow:hidden;padding:42px 54px;background:#f5f0e8}
  .grain{position:absolute;inset:0;opacity:.25;background-image:linear-gradient(90deg,#d8d0c544 1px,transparent 1px),linear-gradient(#d8d0c544 1px,transparent 1px);background-size:38px 38px}
  .eyebrow{position:relative;z-index:2;display:flex;align-items:center;gap:10px;color:#0b8b68;font-size:17px;font-weight:800;letter-spacing:2px}.eyebrow i{display:block;width:34px;height:4px;background:#ed7b28}
  .copy{position:relative;z-index:2;width:47%;padding-top:38px}h1{margin:0;font-size:61px;line-height:1.03;letter-spacing:-2px;font-weight:900}h1 strong{display:block;color:#eb7624;font-weight:900}.lead{margin:19px 0 0;color:#52655c;font-size:23px;line-height:1.35;font-weight:700}.lead b{color:#0b8b68}.chips{display:flex;gap:9px;margin-top:24px}.chip{padding:8px 14px;border:1px solid #b6c9be;border-radius:999px;background:#fffaf1;color:#37675a;font-size:14px;font-weight:700}
  .rail{position:absolute;right:48px;top:42px;z-index:2;width:555px;height:426px;display:flex;gap:12px;transform:rotate(2deg)}.panel{position:relative;flex:1;overflow:hidden;border:9px solid #17382f;border-radius:18px;background:#17382f;box-shadow:9px 12px 0 #eaa05e}.panel:nth-child(2){transform:translateY(23px)}.panel:nth-child(3){transform:translateY(46px)}.panel img{width:100%;height:100%;object-fit:cover;filter:saturate(.94) contrast(1.05)}.panel:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,#17382faa)}.tag{position:absolute;left:12px;bottom:12px;z-index:2;color:#fff;font-size:13px;font-weight:800}
  .mark{position:absolute;right:44px;bottom:30px;z-index:3;padding:11px 17px;border-radius:12px;background:#e9fff6;color:#087b60;font-size:16px;font-weight:900;box-shadow:0 5px 0 #0e7e6144}.number{position:absolute;right:38px;top:18px;color:#0b8b68;font-size:38px;font-weight:900}
  </style></head><body><main class="cover"><div class="grain"></div><div class="number">01 / 07</div><div class="eyebrow"><i></i>智助乖乖 · 内容拆解</div><section class="copy"><h1>一个商品<br><strong>7条视频</strong></h1><p class="lead">第 3 条，最容易带来<br><b>真实咨询</b></p><div class="chips"><span class="chip">真实场景</span><span class="chip">可执行</span><span class="chip">不硬广</span></div></section><section class="rail">${images.map((image, index) => `<figure class="panel"><img src="${image.data}"><span class="tag">${["场景", "动作", "清单"][index]}</span></figure>`).join("")}</section><div class="mark">先解决问题，再介绍商品</div></main></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: output });
} finally {
  await browser.close();
}
console.log(output);
