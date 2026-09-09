import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AlipaySdk } from "alipay-sdk";

const PRODUCT_CODE = "FAST_INSTANT_TRADE_PAY";
const PAYMENT_METHOD = "alipay.trade.page.pay";

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeAmount(value) {
  const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return match ? `${BigInt(match[1]).toString()}.${(match[2] || "").padEnd(2, "0")}` : null;
}

function unwrapResponse(result) {
  if (!result || typeof result !== "object") return {};
  return Object.values(result).find((value) => value && typeof value === "object" && "code" in value) || result;
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function createAlipayWebPay({ rootDirectory, dataDirectory, price = "9.90" }) {
  const ordersPath = path.join(dataDirectory, "payments", "orders.json");
  const sandboxPath = path.join(rootDirectory, ".alipay-sandbox.json");
  let writeQueue = Promise.resolve();

  async function loadConfig() {
    const sandbox = await readJsonFile(sandboxPath, {});
    const sandboxApp = sandbox.appIds?.[0] || {};
    const production = process.env.ALIPAY_ENV === "production";
    const config = {
      appId: process.env.ALIPAY_APP_ID || sandboxApp.appId || "",
      privateKey: process.env.ALIPAY_PRIVATE_KEY || sandboxApp.appPrivatePkcsKey || "",
      alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || sandboxApp.alipayPublicKey || "",
      gateway: process.env.ALIPAY_GATEWAY || (
        production
          ? "https://openapi.alipay.com/gateway.do"
          : "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
      ),
      sellerId: process.env.ALIPAY_SELLER_ID || sandboxApp.pid || "",
      environment: production ? "production" : "sandbox"
    };
    return config;
  }

  async function sdkOrNull() {
    const config = await loadConfig();
    if (!config.appId || !config.privateKey || !config.alipayPublicKey) return { config, sdk: null };
    return {
      config,
      sdk: new AlipaySdk({
        appId: config.appId,
        privateKey: config.privateKey,
        alipayPublicKey: config.alipayPublicKey,
        gateway: config.gateway,
        signType: "RSA2"
      })
    };
  }

  async function readOrders() {
    return readJsonFile(ordersPath, {});
  }

  async function saveOrders(orders) {
    await mkdir(path.dirname(ordersPath), { recursive: true });
    const temporaryPath = `${ordersPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(orders, null, 2), { mode: 0o600 });
    await rename(temporaryPath, ordersPath);
  }

  async function updateOrders(mutator) {
    const operation = writeQueue.then(async () => {
      const orders = await readOrders();
      const result = await mutator(orders);
      await saveOrders(orders);
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function createPending(input, origin) {
    const orderId = `FRAME60_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const order = {
      orderId,
      status: "WAIT_BUYER_PAY",
      amount: normalizeAmount(price),
      subject: "商品短视频内容包",
      input,
      createdAt: new Date().toISOString(),
      returnUrl: `${origin}/payment/return`,
      tradeNo: null
    };
    await updateOrders((orders) => {
      orders[orderId] = order;
      return order;
    });
    return order;
  }

  async function buildPaymentForm({ input, origin }) {
    const { config, sdk } = await sdkOrNull();
    if (!sdk) {
      const error = new Error("支付宝网页收款配置未完成，请配置 ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY、ALIPAY_PUBLIC_KEY");
      error.code = "ALIPAY_CONFIG_MISSING";
      throw error;
    }
    const order = await createPending(input, origin);
    const notifyUrl = String(process.env.ALIPAY_NOTIFY_URL || "").trim();
    const request = {
      returnUrl: order.returnUrl,
      bizContent: {
        out_trade_no: order.orderId,
        total_amount: order.amount,
        subject: order.subject,
        product_code: PRODUCT_CODE
      }
    };
    if (notifyUrl) request.notifyUrl = notifyUrl;
    return {
      order,
      environment: config.environment,
      paymentHtml: sdk.pageExec(PAYMENT_METHOD, "POST", request)
    };
  }

  async function getOrder(orderId) {
    const orders = await readOrders();
    return orders[orderId] || null;
  }

  async function queryTrade(orderId) {
    const order = await getOrder(orderId);
    if (!order) return null;
    const { sdk } = await sdkOrNull();
    if (!sdk) return order;
    const result = unwrapResponse(await sdk.exec("alipay.trade.query", {
      bizContent: { out_trade_no: order.orderId }
    }));
    const status = result.trade_status || order.status;
    if (status !== order.status || result.trade_no) {
      await updateOrders((orders) => {
        if (orders[orderId]) {
          orders[orderId].status = status;
          orders[orderId].tradeNo = result.trade_no || orders[orderId].tradeNo;
          orders[orderId].lastQueryAt = new Date().toISOString();
        }
      });
    }
    return { ...(await getOrder(orderId)), alipay: { code: result.code, msg: result.msg, tradeStatus: status } };
  }

  async function verifyNotification(params) {
    const { config, sdk } = await sdkOrNull();
    if (!sdk || !sdk.checkNotifySignV2(params)) return { ok: false, reason: "签名校验失败" };
    const order = await getOrder(params.out_trade_no);
    const amount = normalizeAmount(params.total_amount);
    const sellerMatches = !config.sellerId || params.seller_id === config.sellerId;
    const paid = params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED";
    if (!order || params.app_id !== config.appId || amount !== order.amount || !sellerMatches || !paid) {
      return { ok: false, reason: "订单、金额、商户或状态校验失败" };
    }
    await updateOrders((orders) => {
      const current = orders[order.orderId];
      if (current) {
        current.status = params.trade_status;
        current.tradeNo = params.trade_no || current.tradeNo;
        current.paidAt = new Date().toISOString();
      }
    });
    return { ok: true, order: await getOrder(order.orderId) };
  }

  async function executeTradeOperation(orderId, operation, bizContent) {
    const order = await getOrder(orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    const { sdk } = await sdkOrNull();
    if (!sdk) return { ok: false, code: "ALIPAY_CONFIG_MISSING" };
    const result = unwrapResponse(await sdk.exec(operation, { bizContent }));
    return { ok: result.code === "10000", result, order };
  }

  return {
    buildPaymentForm,
    getOrder,
    queryTrade,
    verifyNotification,
    query: (orderId) => executeTradeOperation(orderId, "alipay.trade.query", { out_trade_no: orderId }),
    refund: (orderId, amount, requestNo) => executeTradeOperation(orderId, "alipay.trade.refund", {
      out_trade_no: orderId,
      refund_amount: normalizeAmount(amount),
      out_request_no: requestNo
    }),
    refundQuery: (orderId, requestNo) => executeTradeOperation(orderId, "alipay.trade.fastpay.refund.query", {
      out_trade_no: orderId,
      out_request_no: requestNo
    }),
    close: (orderId) => executeTradeOperation(orderId, "alipay.trade.close", { out_trade_no: orderId }),
    formatTimestamp,
    normalizeAmount
  };
}
