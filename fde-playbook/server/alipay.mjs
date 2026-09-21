import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlipaySdk } from "alipay-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SANDBOX_PATH = resolve(ROOT, ".alipay-sandbox.json");
const SANDBOX_GATEWAY =
  "https://openapi-sandbox.dl.alipaydev.com/gateway.do";
const PRODUCTION_GATEWAY = "https://openapi.alipay.com/gateway.do";

let cached;

function required(value, name) {
  if (!value || !String(value).trim()) throw new Error(`missing ${name}`);
  return String(value).trim();
}

export function loadPaymentConfig() {
  if (cached) return cached;

  const production = process.env.ALIPAY_ENV === "production";
  if (production) {
    cached = {
      mode: "production",
      appId: required(process.env.ALIPAY_APP_ID, "ALIPAY_APP_ID"),
      privateKey: required(
        process.env.ALIPAY_APP_PRIVATE_KEY,
        "ALIPAY_APP_PRIVATE_KEY",
      ),
      alipayPublicKey: required(
        process.env.ALIPAY_PUBLIC_KEY,
        "ALIPAY_PUBLIC_KEY",
      ),
      gateway: PRODUCTION_GATEWAY,
      sellerId: process.env.ALIPAY_SELLER_ID?.trim() || "",
      sellerEmail: process.env.ALIPAY_SELLER_EMAIL?.trim() || "",
    };
  } else {
    const raw = JSON.parse(readFileSync(SANDBOX_PATH, "utf8"));
    const app = raw.appIds?.[0] || {};
    const seller = raw.sandboxAccounts?.partner || {};
    cached = {
      mode: "sandbox",
      appId: required(app.appId, "sandbox appId"),
      privateKey: required(
        app.appPrivatePkcsKey,
        "sandbox appPrivatePkcsKey",
      ),
      alipayPublicKey: required(
        app.alipayPublicKey,
        "sandbox alipayPublicKey",
      ),
      gateway: SANDBOX_GATEWAY,
      sellerId: seller.userId || seller.merchantId || app.pid || "",
      sellerEmail: seller.email || "",
    };
  }

  if (
    cached.mode === "production" &&
    !cached.sellerId &&
    !cached.sellerEmail
  ) {
    throw new Error(
      "production requires ALIPAY_SELLER_ID or ALIPAY_SELLER_EMAIL",
    );
  }
  return cached;
}

export function getAlipaySdk() {
  const config = loadPaymentConfig();
  return new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: config.gateway,
    signType: "RSA2",
    keyType: "PKCS1",
    camelcase: false,
  });
}

export function createPaymentForm(order, publicBaseUrl) {
  const sdk = getAlipaySdk();
  const notifyUrl = (process.env.ALIPAY_NOTIFY_URL || "").trim();
  const request = {
    returnUrl: `${publicBaseUrl}/payment/return?orderId=${encodeURIComponent(order.id)}`,
    bizContent: {
      out_trade_no: order.id,
      total_amount: order.amount,
      subject: order.subject,
      product_code: "FAST_INSTANT_TRADE_PAY",
    },
  };
  if (notifyUrl) request.notifyUrl = notifyUrl;
  return sdk.pageExec("alipay.trade.page.pay", "POST", request);
}

export async function queryTrade(orderId) {
  return getAlipaySdk().exec("alipay.trade.query", {
    bizContent: { out_trade_no: orderId },
  });
}

export async function closeTrade(orderId) {
  return getAlipaySdk().exec("alipay.trade.close", {
    bizContent: { out_trade_no: orderId },
  });
}

export async function refundTrade({
  orderId,
  amount,
  reason,
  outRequestNo,
}) {
  return getAlipaySdk().exec("alipay.trade.refund", {
    bizContent: {
      out_trade_no: orderId,
      refund_amount: amount,
      refund_reason: reason || "用户申请退款",
      out_request_no: outRequestNo,
    },
  });
}

export async function queryRefund({ orderId, outRequestNo }) {
  return getAlipaySdk().exec("alipay.trade.fastpay.refund.query", {
    bizContent: {
      out_trade_no: orderId,
      out_request_no: outRequestNo,
    },
  });
}

export function verifyNotify(params) {
  return getAlipaySdk().checkNotifySignV2(params);
}

export function paymentBusinessFieldsMatch(order, params) {
  const config = loadPaymentConfig();
  const amountMatches =
    normalizeAmount(order.amount) === normalizeAmount(params.total_amount);
  const sellerMatches = Boolean(
    (config.sellerId && params.seller_id === config.sellerId) ||
      (config.sellerEmail && params.seller_email === config.sellerEmail),
  );
  return (
    params.app_id === config.appId &&
    params.out_trade_no === order.id &&
    amountMatches &&
    sellerMatches
  );
}

export function normalizeAmount(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return `${BigInt(match[1]).toString()}.${(match[2] || "").padEnd(2, "0")}`;
}

export function mapTradeStatus(status) {
  return (
    {
      TRADE_SUCCESS: "PAID",
      TRADE_FINISHED: "PAID",
      WAIT_BUYER_PAY: "PENDING_PAYMENT",
      TRADE_CLOSED: "CLOSED",
    }[status] || "UNKNOWN"
  );
}
