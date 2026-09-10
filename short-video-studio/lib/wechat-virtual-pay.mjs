import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
const ORDER_LENGTH = 32;

function hmacSha256(secret, value) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function safePriceInFen(value) {
  const amount = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("微信虚拟支付价格配置无效");
  return Math.round(amount * 100);
}

function createOrderId() {
  const suffix = randomBytes(5).toString("hex");
  return `ZZ${Date.now().toString(36)}${suffix}`.slice(0, ORDER_LENGTH);
}

function xmlValue(xml, name) {
  const tag = name.split(".").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(">[\\s\\S]*?<");
  const match = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([^<\\]]+)(?:\\]\\]>)?</${name.split(".").at(-1)}>`, "i").exec(xml);
  return match?.[1] || "";
}

export function createWechatVirtualPay({
  dataDirectory,
  getPrice
}) {
  const ordersPath = path.join(dataDirectory, "payments", "wechat-virtual-orders.json");
  const appId = process.env.WECHAT_MINIAPP_APP_ID || "";
  const appSecret = process.env.WECHAT_MINIAPP_APP_SECRET || "";
  const offerId = process.env.WECHAT_VIRTUAL_OFFER_ID || "";
  const appKey = process.env.WECHAT_VIRTUAL_APP_KEY || "";
  const productId = process.env.WECHAT_VIRTUAL_PRODUCT_ID || "";
  const notifyToken = process.env.WECHAT_VIRTUAL_NOTIFY_TOKEN || "";
  const environment = Number(process.env.WECHAT_VIRTUAL_ENV || 0);

  async function readOrders() {
    try {
      return JSON.parse(await readFile(ordersPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async function updateOrders(mutator) {
    const orders = await readOrders();
    const result = await mutator(orders);
    await mkdir(path.dirname(ordersPath), { recursive: true });
    await writeFile(ordersPath, `${JSON.stringify(orders, null, 2)}\n`, { mode: 0o600 });
    return result;
  }

  function status() {
    return {
      enabled: Boolean(appId && appSecret && offerId && appKey && productId),
      offerIdConfigured: Boolean(offerId),
      appKeyConfigured: Boolean(appKey),
      productIdConfigured: Boolean(productId),
      notifyConfigured: Boolean(notifyToken)
    };
  }

  async function getSession(code) {
    const params = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: "authorization_code"
    });
    const response = await fetch(`${SESSION_URL}?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.errcode || !payload.openid || !payload.session_key) {
      throw new Error(payload.errmsg || "微信登录态获取失败");
    }
    return payload;
  }

  async function createOrder({ code, type, input }) {
    if (!status().enabled) {
      const error = new Error("微信虚拟支付尚未配置 OfferID、AppKey 或 ProductID");
      error.code = "WECHAT_VIRTUAL_PAY_NOT_CONFIGURED";
      throw error;
    }
    const session = await getSession(code);
    const orderId = createOrderId();
    const goodsPrice = safePriceInFen(getPrice(type));
    const signData = JSON.stringify({
      offerId,
      buyQuantity: 1,
      env: environment,
      currencyType: "CNY",
      productId,
      goodsPrice,
      outTradeNo: orderId,
      attach: JSON.stringify({ type, productName: input?.productName || "" })
    });
    const order = {
      orderId,
      openid: session.openid,
      type,
      input,
      productId,
      goodsPrice,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    await updateOrders((orders) => {
      orders[orderId] = order;
      return order;
    });
    return {
      orderId,
      payData: {
        signData,
        paySig: hmacSha256(appKey, `requestVirtualPayment&${signData}`),
        signature: hmacSha256(session.session_key, signData),
        mode: "short_series_goods"
      }
    };
  }

  async function handleNotify(xml) {
    const event = xmlValue(xml, "Event");
    if (event !== "xpay_goods_deliver_notify") throw new Error("不是微信虚拟支付发货通知");
    if (notifyToken && xmlValue(xml, "Token") !== notifyToken) throw new Error("微信发货通知令牌无效");
    const orderId = xmlValue(xml, "OutTradeNo");
    const wxOrderId =
      xmlValue(xml, "WeChatPayInfo.MchOrderNo") ||
      xmlValue(xml, "MchOrderNo");
    if (!orderId || !wxOrderId) throw new Error("微信发货通知缺少订单号");
    await updateOrders((orders) => {
      const order = orders[orderId];
      if (!order) return null;
      if (order.wxOrderId === wxOrderId && order.status === "DELIVERED") return order;
      orders[orderId] = {
        ...order,
        wxOrderId,
        status: "DELIVERED",
        deliveredAt: new Date().toISOString()
      };
      return orders[orderId];
    });
    return { orderId, wxOrderId };
  }

  async function getOrder(orderId, openid) {
    const orders = await readOrders();
    const order = orders[orderId];
    if (!order || (openid && order.openid !== openid)) return null;
    return order;
  }

  return {
    status,
    createOrder,
    handleNotify,
    getOrder
  };
}
