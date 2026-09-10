import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ALIPAY_MOBILE_WAP_ENABLED = "true";
const { startServer } = await import("../server.mjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("uses the production mini-program request domain allowed by WeChat", async () => {
  const files = [
    "apps/miniapp/src/services/assistant.ts",
    "apps/miniapp/src/services/notifications.ts",
    "apps/miniapp/src/pages/webview/index.tsx",
    "apps/miniapp/src/data/getAssistantConfig.ts"
  ];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    assert.doesNotMatch(source, /https:\/\/lifeyoume\.icu\/video/);
    assert.match(source, /https:\/\/www\.lifeyoume\.icu\/video/);
  }
});

test("serves the web, mobile, and desktop entrypoints", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  for (const platform of ["web", "mobile", "desktop"]) {
    const response = await fetch(`http://127.0.0.1:${instance.port}/${platform}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /FRAME\/60/);
    assert.match(html, /content-pack-form/);
    assert.match(html, /解锁完整内容包/);
  }

  const response = await fetch(`http://127.0.0.1:${instance.port}/manifest.webmanifest`);
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.start_url, "/mobile/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length > 0);
});

test("generates a preview content pack without charging", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${instance.port}/api/content-pack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productName: "轻薄防晒外套",
      audience: "通勤、怕晒又不想闷热的女生",
      sellingPoints: "轻薄透气，UPF50+，可收纳，通勤穿着不闷热",
      platform: "抖音",
      tone: "真实种草",
      offer: "首单立减 20 元"
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.pack.source, "local-template");
  assert.equal(result.pack.sellingPoints, "轻薄透气，UPF50+，可收纳，通勤穿着不闷热");
  assert.equal(result.pack.titles.length, 10);
  assert.equal(result.pack.scripts.length, 3);
  assert.equal(result.pack.calendar.length, 7);
  assert.equal(result.payment.status, "not-integrated");
});

test("builds an Alipay web payment form without trusting a browser result", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${instance.port}/api/content-pack/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "lifeyoume.icu"
    },
    body: JSON.stringify({
      productName: "轻薄防晒外套",
      audience: "通勤用户",
      sellingPoints: "轻薄透气，UPF50+，可收纳",
      platform: "抖音",
      tone: "真实种草"
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.paymentHtml, /<form/i);
  assert.match(result.paymentHtml, /alipay\.trade\.page\.pay/);
  assert.match(result.paymentHtml, /FAST_INSTANT_TRADE_PAY/);
  assert.match(result.paymentHtml, /return_url=https%3A%2F%2Flifeyoume\.icu/);
  assert.match(result.orderId, /^FRAME60_/);
});

test("uses mobile website payment to launch the Alipay app flow", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${instance.port}/api/content-pack/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Linux; Android 14; Mobile)"
    },
    body: JSON.stringify({
      productName: "手机支付测试商品",
      audience: "移动端用户",
      sellingPoints: "轻便好用，适合移动端支付流程验证"
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.paymentHtml, /alipay\.trade\.wap\.pay/);
  assert.match(result.paymentHtml, /QUICK_WAP_WAP_PAY/);
});

test("serves the Zhizhu assistant workspace and generates all three previews", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  const page = await fetch(`http://127.0.0.1:${instance.port}/zhizhu/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /智助乖乖/);
  const config = await fetch(`http://127.0.0.1:${instance.port}/api/assistant/config`);
  assert.equal(config.status, 200);
  const configBody = await config.json();
  assert.equal(configBody.brand, "智助乖乖");
  assert.match(configBody.prices.product, /^\d+\.\d{2}$/);
  assert.match(configBody.channels.officialAccount.article, /tool=article/);

  const payloads = [
    {
      type: "product",
      productName: "轻薄防晒外套",
      audience: "通勤女生",
      sellingPoints: "轻薄透气，UPF50+，可收纳",
      platform: "抖音",
      tone: "真实种草"
    },
    {
      type: "article",
      topic: "新手挑选防晒衣",
      reader: "第一次购买的上班族",
      angle: "从真实通勤场景出发讲清楚选择方法"
    },
    {
      type: "social",
      scene: "新品上架",
      offer: "本周新客体验价 49 元",
      voice: "自然真诚"
    }
  ];

  for (const payload of payloads) {
    const response = await fetch(`http://127.0.0.1:${instance.port}/api/assistant/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.result.type, payload.type);
    assert.ok(result.result.items.length >= 3);
    assert.ok(result.result.deliverables.length >= 3);
    assert.equal(result.payment.status, "not-integrated");
  }

  const response = await fetch(`http://127.0.0.1:${instance.port}/api/assistant/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "article",
      topic: "短",
      reader: "读者",
      angle: "太短"
    })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /文章主题|文章角度/);
});

test("protects the admin console and persists dynamic prices", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  const page = await fetch(`http://127.0.0.1:${instance.port}/admin/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /后台管理/);
  const redirect = await fetch(`http://127.0.0.1:${instance.port}/admin`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/admin/");

  const unauthorized = await fetch(`http://127.0.0.1:${instance.port}/api/admin/settings`);
  assert.equal(unauthorized.status, 401);

  const login = await fetch(`http://127.0.0.1:${instance.port}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test-admin", password: "test-password" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /frame60_admin=/);

  const update = await fetch(`http://127.0.0.1:${instance.port}/api/admin/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ prices: { product: "12.90", article: "8.90", social: "3.90" } })
  });
  assert.equal(update.status, 200);
  assert.deepEqual((await update.json()).prices, { product: "12.90", article: "8.90", social: "3.90" });

  const preview = await fetch(`http://127.0.0.1:${instance.port}/api/content-pack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productName: "测试商品",
      audience: "测试用户",
      sellingPoints: "轻薄透气，适合日常使用"
    })
  });
  assert.equal((await preview.json()).pack.price, "12.90");
});
