import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContentPreviews, buyerHash } from "../lib/content-previews.mjs";
import { createAlipayWebPay } from "../lib/alipay-webpay.mjs";

test("preview snapshots persist, reject other buyers and unsafe IDs", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frame60-preview-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createContentPreviews(dir);
  const preview = await store.save({ titles: ["原版本"], price: "9.90" }, buyerHash("buyer"));
  assert.equal(await store.get(preview.id, buyerHash("other")), null);
  assert.equal(await store.get("../private", buyerHash("buyer")), null);
  const restored = await createContentPreviews(dir).get(preview.id, buyerHash("buyer"));
  assert.deepEqual(restored.pack, { titles: ["原版本"], price: "9.90" });
});

test("payment idempotency, signed confirmation, recovery and refund revocation", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frame60-pay-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sdk = {
    pageExec: () => "<form></form>",
    checkNotifySignV2: params => params.testSignature === "valid",
    exec: async (method, request) => method === "alipay.trade.refund"
      ? { code: "10000", fund_change: "Y" }
      : { code: "10000", total_amount: "9.90", out_trade_no: request.bizContent.out_trade_no, trade_status: "TRADE_SUCCESS" }
  };
  const create = () => createAlipayWebPay({ rootDirectory: dir, dataDirectory: dir, sdkFactory: () => sdk });
  const pay = create();
  const options = { input: { buyerHash: "owner", previewId: "version", contentPack: { titles: ["快照"] } }, origin: "https://lifeyoume.icu/video", price: "9.90" };
  const first = await pay.buildPaymentForm(options);
  const second = await pay.buildPaymentForm(options);
  assert.equal(first.order.orderId, second.order.orderId);
  assert.equal(await pay.fulfillOrder(first.order.orderId), null);
  assert.equal(await pay.authorizeBuyer(first.order.orderId, "wrong", ""), null);
  assert.ok(await pay.authorizeBuyer(first.order.orderId, "", first.order.recoveryToken));
  const params = { out_trade_no: first.order.orderId, total_amount: "9.90", app_id: "", trade_status: "TRADE_SUCCESS", testSignature: "valid" };
  assert.equal((await pay.verifyNotification({ ...params, testSignature: "bad" })).ok, false);
  assert.equal((await pay.verifyNotification({ ...params, total_amount: "0.01" })).ok, false);
  const confirmed = await pay.verifyNotification(params);
  assert.equal(confirmed.ok, true);
  const repeated = await pay.verifyNotification(params);
  assert.equal(repeated.order.accessToken, confirmed.order.accessToken);
  assert.equal(repeated.order.paidAt, confirmed.order.paidAt);
  sdk.exec = async () => { throw new Error("offline"); };
  assert.equal((await pay.resolveBuyerDelivery(first.order.orderId, "owner", "")).status, "ready");
  assert.equal((await pay.resolveBuyerDelivery(first.order.orderId, "wrong", "")).status, "unauthorized");
  sdk.exec = async () => ({ code: "10000", fund_change: "Y" });
  assert.deepEqual((await create().getOrder(first.order.orderId)).input.contentPack, { titles: ["快照"] });
  await pay.refund(first.order.orderId, "9.90", "refund-test");
  assert.equal(await pay.fulfillOrder(first.order.orderId), null);
  assert.equal(await pay.getFulfilledOrder(first.order.orderId, confirmed.order.accessToken), null);
  await pay.verifyNotification(params);
  assert.equal((await pay.getOrder(first.order.orderId)).status, "REFUNDED");
  assert.deepEqual(await pay.resolveBuyerDelivery(first.order.orderId, "owner", ""), {
    status: "REFUNDED", order: null
  });
});
