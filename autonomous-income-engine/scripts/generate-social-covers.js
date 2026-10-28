#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "docs", "promotion", "consumer-evidence-covers");
const PRODUCT_OUTPUT = path.join(ROOT, "docs", "promotion", "product-campaign-covers");

const covers = [
  {
    id: "frame60-access-fix",
    eyebrow: "商品内容包｜访问地址补充",
    title: ["浏览器打开", "lifeyoume.icu/video/"],
    points: ["先免费生成预览", "满意再付 ¥9.90", "支付宝支付后交付"],
    footer: "9 个标题 · 3 条口播 · 3 套分镜 · 7 天发布计划",
    accent: "#C33F31",
    pale: "#FFF0EC",
  },
  {
    id: "frame60-01-paid-result",
    eyebrow: "商品内容包｜先免费预览",
    title: ["¥9.90 解锁的", "不是一句 AI 文案"],
    points: ["9 个标题", "3 条口播与分镜", "7 天发布计划"],
    footer: "输入商品信息，满意预览后再支付宝解锁",
    accent: "#E34A34",
    pale: "#FFF0EC",
  },
  {
    id: "frame60-02-time-cost",
    eyebrow: "商品内容每天都要想",
    title: ["别从空白页", "硬憋下一条内容"],
    points: ["先写卖点", "再生成标题", "最后得到发布计划"],
    footer: "免费生成预览，不满意不用付款",
    accent: "#C13A67",
    pale: "#FFF0F6",
  },
  {
    id: "frame60-03-delivery",
    eyebrow: "卖商品的人真正要交付什么",
    title: ["标题、口播、分镜", "一次整理成内容包"],
    points: ["小红书标题", "短视频口播", "镜头执行清单"],
    footer: "完整内容包 ¥9.90，支付宝支付后交付",
    accent: "#B24A1F",
    pale: "#FFF3EA",
  },
  {
    id: "01-missing-materials",
    eyebrow: "退款售后｜材料自查",
    title: ["别急着投诉", "先检查这 5 类材料"],
    points: ["订单与付款", "问题照片", "沟通记录"],
    footer: "免费导入自己的截图，先看完整预览",
    accent: "#E84A5F",
    pale: "#FFF1F3",
  },
  {
    id: "02-screenshot-chaos",
    eyebrow: "几十张截图怎么交",
    title: ["截图越多", "越要先编号和排序"],
    points: ["按时间排列", "对应证明内容", "保留原文件"],
    footer: "不是代投诉，是把材料整理清楚",
    accent: "#DB6B2D",
    pale: "#FFF4EA",
  },
  {
    id: "03-zip-delivery",
    eyebrow: "¥19.90 下载的到底是什么",
    title: ["不是一段文字", "是完整分类 ZIP"],
    points: ["编号原文件", "证据目录", "事件时间线"],
    footer: "完整预览免费，满意再下载",
    accent: "#1C7C54",
    pale: "#EAF8F1",
  },
  {
    id: "04-final-files",
    eyebrow: "整理完成后的 4 份交付物",
    title: ["原图、目录、时间线", "再加可打印报告"],
    points: ["文件统一命名", "材料对应清楚", "一键打包下载"],
    footer: "演示内容为虚构案例，不冒充客户订单",
    accent: "#2D6CDF",
    pale: "#EDF3FF",
  },
  {
    id: "05-local-processing",
    eyebrow: "隐私敏感材料怎么处理",
    title: ["图片和 PDF", "只在本机浏览器处理"],
    points: ["不上传原文件", "不读取聊天", "不代写事实"],
    footer: "先用自己的材料试，预览不收费",
    accent: "#6A4BBC",
    pale: "#F3EEFF",
  },
  {
    id: "06-before-after",
    eyebrow: "整理前 vs 整理后",
    title: ["一堆无序截图", "变成可核对的材料包"],
    points: ["编号", "时间", "证明内容"],
    footer: "节省整理时间，不承诺退款结果",
    accent: "#147D92",
    pale: "#E9F8FA",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function shorten(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function svgFor(cover) {
  const pointRows = cover.points.map((point, index) => `
    <g transform="translate(90 ${790 + index * 112})">
      <circle cx="30" cy="30" r="30" fill="${cover.accent}"/>
      <text x="30" y="43" text-anchor="middle" class="index">${index + 1}</text>
      <text x="88" y="44" class="point">${escapeXml(point)}</text>
    </g>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <rect width="1080" height="1440" fill="#FCFCF8"/>
  <rect x="48" y="48" width="984" height="1344" rx="46" fill="${cover.pale}"/>
  <rect x="78" y="82" width="924" height="1276" rx="34" fill="#FFFFFF"/>
  <rect x="90" y="112" width="520" height="58" rx="29" fill="${cover.accent}"/>
  <text x="350" y="151" text-anchor="middle" class="eyebrow">${escapeXml(shorten(cover.eyebrow, 20))}</text>
  <text x="90" y="330" class="title">${escapeXml(cover.title[0])}</text>
  <text x="90" y="450" class="title">${escapeXml(cover.title[1])}</text>
  <rect x="90" y="548" width="900" height="10" rx="5" fill="${cover.accent}"/>
  <text x="90" y="666" class="label">你最终会得到</text>
  ${pointRows}
  <rect x="90" y="1190" width="900" height="112" rx="24" fill="${cover.pale}"/>
  <text x="540" y="1259" text-anchor="middle" class="footer">${escapeXml(cover.footer)}</text>
  <style>
    text { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
    .eyebrow { fill: #FFFFFF; font-size: 27px; font-weight: 600; }
    .title { fill: #14231B; font-size: 72px; font-weight: 700; letter-spacing: -2px; }
    .label { fill: #607067; font-size: 32px; font-weight: 600; }
    .index { fill: #FFFFFF; font-size: 30px; font-weight: 700; }
    .point { fill: #14231B; font-size: 47px; font-weight: 650; }
    .footer { fill: #263E31; font-size: 30px; font-weight: 600; }
  </style>
</svg>`;
}

fs.mkdirSync(OUTPUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
    for (const cover of covers) {
      const svgPath = path.join(OUTPUT, `${cover.id}.svg`);
      const pngPath = path.join(OUTPUT, `${cover.id}.png`);
      const svg = svgFor(cover);
      fs.writeFileSync(svgPath, svg);
      await page.setContent(`<style>*{margin:0}body{overflow:hidden}</style>${svg}`, { waitUntil: "load" });
      await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 1080, height: 1440 } });
    }
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "social-publishing-schedule.json")));
    fs.mkdirSync(PRODUCT_OUTPUT, { recursive: true });
    for (const product of Object.values(config.dailyProductCampaign.products)) {
      const landing = new URL(product.landingUrl);
      const accessText = `${landing.host}${landing.pathname}`;
      for (const [slot, angle] of Object.entries(product.angles)) {
        const resultParts = String(product.result)
          .split(/[、，,]/)
          .map(item => item.trim())
          .filter(Boolean);
        const generated = {
          eyebrow: angle.coverEyebrow ||
            `${product.name}｜${slot === "morning" ? "问题" : slot === "noon" ? "结果" : "交付"}`,
          title: angle.coverTitle || (angle.title.length > 15
            ? [angle.title.slice(0, Math.ceil(angle.title.length / 2)), angle.title.slice(Math.ceil(angle.title.length / 2))]
            : [angle.title, product.price ? `${product.price} 真实交付` : "当前能力验证"]),
          points: angle.coverPoints || [
            resultParts[0] || "真实产品能力",
            resultParts[1] || "明确交付结果",
            product.price ? `${product.price} · ${product.payment}` : product.payment,
          ],
          footer: `浏览器打开：${accessText}`,
          accent: slot === "morning" ? "#D9473F" : slot === "noon" ? "#257A57" : "#4E55B8",
          pale: slot === "morning" ? "#FFF0EE" : slot === "noon" ? "#EAF8F1" : "#EFF0FF",
        };
        const svgPath = path.join(PRODUCT_OUTPUT, angle.cover.replace(/\.png$/, ".svg"));
        const pngPath = path.join(PRODUCT_OUTPUT, angle.cover);
        const svg = svgFor(generated);
        fs.writeFileSync(svgPath, svg);
        await page.setContent(`<style>*{margin:0}body{overflow:hidden}</style>${svg}`, { waitUntil: "load" });
        await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 1080, height: 1440 } });
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Generated ${covers.length} base covers and product campaign covers`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
