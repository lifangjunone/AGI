import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWechatVirtualPay } from "../lib/wechat-virtual-pay.mjs";

const originalEnv = { ...process.env };

function configureWechat() {
  process.env.WECHAT_MINIAPP_APP_ID = "wx-test";
  process.env.WECHAT_MINIAPP_APP_SECRET = "secret";
  process.env.WECHAT_VIRTUAL_OFFER_ID = "offer";
  process.env.WECHAT_VIRTUAL_APP_KEY = "app-key";
  process.env.WECHAT_VIRTUAL_PRODUCT_ID = "product";
  process.env.WECHAT_VIRTUAL_ENV = "0";
}

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
});

test("creates a signed virtual-payment order with the required purchase mode", async () => {
  configureWechat();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "wechat-pay-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    openid: "openid",
    session_key: "session-key"
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const payment = createWechatVirtualPay({
      dataDirectory,
      getPrice: () => "1.00"
    });
    const result = await payment.createOrder({
      code: "login-code",
      type: "product",
      input: { productName: "测试商品" }
    });
    const signData = JSON.parse(result.payData.signData);

    assert.equal(result.payData.mode, "short_series_goods");
    assert.equal(signData.goodsPrice, 100);
    assert.equal(signData.currencyType, "CNY");
    assert.equal(signData.attach.includes("测试商品"), true);
    assert.equal(result.orderId.length >= 8, true);

    const stored = JSON.parse(await readFile(
      path.join(dataDirectory, "payments", "wechat-virtual-orders.json"),
      "utf8"
    ));
    assert.equal(stored[result.orderId].status, "PENDING");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handles the official nested delivery notification order id", async () => {
  configureWechat();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "wechat-pay-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    openid: "openid",
    session_key: "session-key"
  }), { status: 200 });

  try {
    const payment = createWechatVirtualPay({
      dataDirectory,
      getPrice: () => "1.00"
    });
    const order = await payment.createOrder({
      code: "login-code",
      type: "product",
      input: {}
    });
    const result = await payment.handleNotify(`
      <xml>
        <Event><![CDATA[xpay_goods_deliver_notify]]></Event>
        <OutTradeNo>${order.orderId}</OutTradeNo>
        <WeChatPayInfo><MchOrderNo>wx-order</MchOrderNo></WeChatPayInfo>
      </xml>
    `);

    assert.deepEqual(result, {
      orderId: order.orderId,
      wxOrderId: "wx-order"
    });
    assert.equal((await payment.getOrder(order.orderId)).status, "DELIVERED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
