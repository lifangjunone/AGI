import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const source = `data:image/jpeg;base64,${(await readFile(path.join(root, "public", "studio-poster.jpg"))).toString("base64")}`;
const output = path.join(root, "public", "official-covers", "001-normal-product-7-videos.png");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 510 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
  <html><head><style>
    *{box-sizing:border-box}body{margin:0;background:#f4efe6;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1b2924}
    .cover{position:relative;width:1200px;height:510px;overflow:hidden;padding:48px 54px;background:#f4efe6}
    .grid{position:absolute;inset:0;background-image:linear-gradient(#d9d0c355 1px,transparent 1px),linear-gradient(90deg,#d9d0c355 1px,transparent 1px);background-size:42px 42px;opacity:.38}
    .copy{position:relative;z-index:2;width:53%;height:100%;display:flex;flex-direction:column;justify-content:center}
    .eyebrow{display:inline-flex;align-items:center;gap:10px;color:#087b60;font-size:18px;font-weight:700;letter-spacing:2px}
    .eyebrow i{width:34px;height:4px;background:#f28c28;border-radius:4px}
    h1{margin:22px 0 8px;font-size:62px;line-height:1.05;letter-spacing:-2px;font-weight:900}
    h1 span{display:block;color:#e87523}
    .sub{margin:18px 0 0;font-size:24px;line-height:1.45;color:#56655e;font-weight:600}
    .chips{display:flex;gap:10px;margin-top:28px}.chip{padding:8px 14px;border:1px solid #b9c8bf;border-radius:999px;color:#276354;background:#fffaf1;font-size:15px}
    .visual{position:absolute;right:52px;top:48px;width:500px;height:414px;z-index:2;border:12px solid #17382f;border-radius:24px;overflow:hidden;box-shadow:18px 18px 0 #e9a05e}
    .visual img{width:100%;height:100%;object-fit:cover;object-position:center 57%;filter:saturate(.9) contrast(1.04)}
    .visual:after{content:"";position:absolute;inset:0;background:linear-gradient(125deg,#0e352b66,transparent 58%,#f28c2822)}
    .stamp{position:absolute;right:40px;bottom:34px;z-index:3;padding:10px 15px;border-radius:12px;background:#e9fff6;color:#087b60;font-weight:800;font-size:16px;box-shadow:0 5px 0 #0e7e6144}
    .corner{position:absolute;right:38px;top:24px;color:#087b60;font-size:42px;font-weight:900;z-index:3}
  </style></head><body><main class="cover"><div class="grid"></div><div class="corner">×07</div><section class="copy"><div class="eyebrow"><i></i>智助乖乖 · 内容拆解</div><h1>一个商品<br><span>7条视频</span></h1><p class="sub">第3条，最容易带来咨询</p><div class="chips"><b class="chip">真实场景</b><b class="chip">可执行</b><b class="chip">不硬广</b></div></section><figure class="visual"><img src="${source}"></figure><div class="stamp">先解决问题，再介绍商品</div></main></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: output });
} finally {
  await browser.close();
}
console.log(output);
