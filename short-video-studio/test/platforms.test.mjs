import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "../server.mjs";

test("serves the web, mobile, and desktop entrypoints", async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));

  for (const platform of ["web", "mobile", "desktop"]) {
    const response = await fetch(`http://127.0.0.1:${instance.port}/${platform}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /FRAME\/60/);
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
    headers: { "content-type": "application/json" },
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
  assert.match(result.orderId, /^FRAME60_/);
});
