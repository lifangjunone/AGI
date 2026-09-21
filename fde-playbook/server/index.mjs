import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { assessProject, getAssessmentCatalog } from "./assessment.mjs";
import {
  closeTrade,
  createPaymentForm,
  getAlipaySdk,
  loadPaymentConfig,
  mapTradeStatus,
  normalizeAmount,
  paymentBusinessFieldsMatch,
  queryRefund,
  queryTrade,
  refundTrade,
  verifyNotify,
} from "./alipay.mjs";
import {
  createDiagnostic,
  createOrder,
  createRefundRecord,
  getDiagnostic,
  getOrder,
  getRefund,
  hashToken,
  insertNotifyEventOnce,
  listRefundsByOrder,
  updateOrder,
  updateRefund,
} from "./store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = resolve(ROOT, "dist");
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}`
).replace(/\/$/, "");
const REPORT_PRICE = "199.00";
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));

function safeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function errorResponse(res, status, message, code = "REQUEST_FAILED") {
  return res.status(status).json({ error: { code, message } });
}

function tokenMatches(order, token) {
  if (!order?.accessTokenHash || !token) return false;
  const expected = Buffer.from(order.accessTokenHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_TOKEN;
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected) {
    return errorResponse(
      res,
      503,
      "ADMIN_API_TOKEN 未配置",
      "ADMIN_NOT_CONFIGURED",
    );
  }
  const expectedHash = createHash("sha256").update(expected).digest();
  const suppliedHash = createHash("sha256").update(supplied || "").digest();
  if (!timingSafeEqual(expectedHash, suppliedHash)) {
    return errorResponse(res, 401, "无权执行该操作", "UNAUTHORIZED");
  }
  next();
}

async function queryAndPersist(order) {
  const result = await queryTrade(order.id);
  const status =
    result.code === "10000" ? mapTradeStatus(result.trade_status) : "UNKNOWN";
  return (
    (await updateOrder(order.id, {
      status,
      tradeNo: result.trade_no || order.tradeNo,
      lastQueriedAt: new Date().toISOString(),
      ...(status === "PAID" && !order.paidAt
        ? { paidAt: new Date().toISOString() }
        : {}),
    })) || order
  );
}

app.get("/api/health", (_req, res) => {
  try {
    const config = loadPaymentConfig();
    res.json({
      ok: true,
      paymentMode: config.mode,
      notifyConfigured: Boolean(process.env.ALIPAY_NOTIFY_URL?.trim()),
    });
  } catch (error) {
    errorResponse(res, 503, error.message, "PAYMENT_CONFIG_INVALID");
  }
});

app.get("/api/assessment", (_req, res) => {
  res.json(getAssessmentCatalog());
});

app.post("/api/diagnostics", async (req, res) => {
  try {
    const assessment = assessProject(req.body?.answers);
    const context = {
      stage: safeText(req.body?.context?.stage, 40),
      industry: safeText(req.body?.context?.industry, 60),
    };
    const diagnostic = await createDiagnostic({
      context,
      answers: assessment.answers,
      assessment,
    });
    res.status(201).json({
      diagnosticId: diagnostic.id,
      preview: assessment.preview,
      price: REPORT_PRICE,
    });
  } catch (error) {
    errorResponse(res, 400, error.message, "INVALID_DIAGNOSTIC");
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const diagnosticId = safeText(req.body?.diagnosticId, 80);
    const projectName = safeText(req.body?.projectName, 80);
    const contact = safeText(req.body?.contact, 100);
    if (!getDiagnostic(diagnosticId)) {
      return errorResponse(res, 404, "诊断不存在", "DIAGNOSTIC_NOT_FOUND");
    }
    if (projectName.length < 2 || contact.length < 3) {
      return errorResponse(
        res,
        400,
        "请填写项目名称和有效联系方式",
        "CONTACT_REQUIRED",
      );
    }

    const { order, accessToken } = await createOrder({
      diagnosticId,
      projectName,
      contact,
      amount: REPORT_PRICE,
    });
    const paymentHtml = createPaymentForm(order, PUBLIC_BASE_URL);
    res.status(201).json({
      orderId: order.id,
      accessToken,
      paymentHtml,
      amount: order.amount,
    });
  } catch (error) {
    console.error("[order:create]", error.message);
    errorResponse(res, 500, "创建支付订单失败", "ORDER_CREATE_FAILED");
  }
});

app.get("/api/orders/:orderId/status", async (req, res) => {
  const order = getOrder(req.params.orderId);
  const token = safeText(req.query.token, 128);
  if (!order || !tokenMatches(order, token)) {
    return errorResponse(res, 404, "订单不存在", "ORDER_NOT_FOUND");
  }

  try {
    const stale =
      !order.lastQueriedAt ||
      Date.now() - new Date(order.lastQueriedAt).getTime() > 5000;
    const current =
      order.status === "PENDING_PAYMENT" && stale
        ? await queryAndPersist(order)
        : order;
    res.json({
      orderId: current.id,
      status: current.status,
      paidAt: current.paidAt,
      reportReady: current.status === "PAID",
    });
  } catch (error) {
    console.warn("[order:query]", order.id, error.message);
    res.json({
      orderId: order.id,
      status: order.status,
      paidAt: order.paidAt,
      reportReady: order.status === "PAID",
      queryDeferred: true,
    });
  }
});

app.get("/api/reports/:orderId", (req, res) => {
  const order = getOrder(req.params.orderId);
  const token = safeText(req.query.token, 128);
  if (!order || !tokenMatches(order, token)) {
    return errorResponse(res, 404, "报告不存在", "REPORT_NOT_FOUND");
  }
  if (order.status !== "PAID") {
    return errorResponse(res, 402, "订单尚未支付", "PAYMENT_REQUIRED");
  }
  const diagnostic = getDiagnostic(order.diagnosticId);
  if (!diagnostic) {
    return errorResponse(res, 404, "诊断数据不存在", "DIAGNOSTIC_NOT_FOUND");
  }
  res.json({
    orderId: order.id,
    projectName: order.projectName,
    generatedAt: order.paidAt,
    score: diagnostic.assessment.overall,
    level: diagnostic.assessment.level,
    report: diagnostic.assessment.fullReport,
  });
});

app.post(
  "/payment/alipay/notify",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const params = { ...req.body };
    const fail = (message) => {
      const { sign: _sign, ...safeParams } = params;
      console.warn(`[alipay:notify] ${message}`, safeParams);
      return res.type("text/plain").send("fail");
    };

    try {
      if (!verifyNotify(params)) return fail("signature check failed");
      const order = getOrder(params.out_trade_no);
      if (!order || !paymentBusinessFieldsMatch(order, params)) {
        return fail("business fields mismatch");
      }

      const inserted = await insertNotifyEventOnce({
        notifyId: params.notify_id,
        tradeNo: params.trade_no,
        outTradeNo: params.out_trade_no,
        tradeStatus: params.trade_status,
        rawParams: Object.fromEntries(
          Object.entries(params).filter(([key]) => key !== "sign"),
        ),
      });
      if (!inserted) return res.type("text/plain").send("success");

      const isPaid =
        ["TRADE_SUCCESS", "TRADE_FINISHED"].includes(params.trade_status) &&
        !params.out_biz_no &&
        !params.gmt_refund &&
        !params.refund_fee;
      await updateOrder(order.id, {
        status: isPaid ? "PAID" : mapTradeStatus(params.trade_status),
        tradeNo: params.trade_no || order.tradeNo,
        ...(isPaid && !order.paidAt
          ? { paidAt: new Date().toISOString() }
          : {}),
      });
      return res.type("text/plain").send("success");
    } catch (error) {
      return fail(error.message);
    }
  },
);

app.get("/payment/return", async (req, res) => {
  const orderId = safeText(req.query.orderId, 80);
  const order = getOrder(orderId);
  if (!order) {
    return res.redirect(302, "/?paymentReturn=missing");
  }
  if (order?.status === "PENDING_PAYMENT") {
    try {
      await queryAndPersist(order);
    } catch (error) {
      console.warn("[payment:return]", orderId, error.message);
    }
  }
  res.redirect(
    302,
    `/?paymentReturn=1&orderId=${encodeURIComponent(orderId)}`,
  );
});

app.post("/api/admin/orders/:orderId/query", requireAdmin, async (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return errorResponse(res, 404, "订单不存在", "ORDER_NOT_FOUND");
  try {
    res.json(await queryAndPersist(order));
  } catch (error) {
    errorResponse(res, 502, error.message, "ALIPAY_QUERY_FAILED");
  }
});

app.post("/api/admin/orders/:orderId/close", requireAdmin, async (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return errorResponse(res, 404, "订单不存在", "ORDER_NOT_FOUND");
  if (order.status !== "PENDING_PAYMENT") {
    return errorResponse(res, 409, "只有待支付订单可关闭", "ORDER_NOT_PENDING");
  }
  try {
    const result = await closeTrade(order.id);
    if (result.code === "10000") await updateOrder(order.id, { status: "CLOSED" });
    res.json(result);
  } catch (error) {
    errorResponse(res, 502, error.message, "ALIPAY_CLOSE_FAILED");
  }
});

app.post("/api/admin/orders/:orderId/refunds", requireAdmin, async (req, res) => {
  const order = getOrder(req.params.orderId);
  const amount = normalizeAmount(req.body?.amount);
  const outRequestNo = safeText(req.body?.outRequestNo, 80);
  if (!order) return errorResponse(res, 404, "订单不存在", "ORDER_NOT_FOUND");
  if (order.status !== "PAID") {
    return errorResponse(res, 409, "订单未支付", "ORDER_NOT_PAID");
  }
  if (!amount || !outRequestNo) {
    return errorResponse(res, 400, "退款金额和退款请求号必填", "INVALID_REFUND");
  }
  const cents = (text) => {
    const [yuan, fen] = text.split(".");
    return BigInt(yuan) * 100n + BigInt(fen);
  };
  const alreadyRefunded = listRefundsByOrder(order.id)
    .filter((refund) => ["SUCCESS", "REQUESTED", "PENDING"].includes(refund.status))
    .reduce((sum, refund) => sum + cents(refund.amount), 0n);
  if (alreadyRefunded + cents(amount) > cents(order.amount)) {
    return errorResponse(
      res,
      400,
      "累计退款金额超过原订单金额",
      "REFUND_EXCEEDS_PAYMENT",
    );
  }

  try {
    await createRefundRecord({
      orderId: order.id,
      amount,
      outRequestNo,
      reason: safeText(req.body?.reason, 120),
    });
    const result = await refundTrade({
      orderId: order.id,
      amount,
      outRequestNo,
      reason: safeText(req.body?.reason, 120),
    });
    const status =
      result.code === "10000" && result.fund_change === "Y"
        ? "SUCCESS"
        : result.code === "10000"
          ? "PENDING"
          : "FAILED";
    await updateRefund(outRequestNo, {
      status,
      tradeNo: result.trade_no || null,
    });
    res.json({ status, result });
  } catch (error) {
    errorResponse(res, 502, error.message, "ALIPAY_REFUND_FAILED");
  }
});

app.get(
  "/api/admin/orders/:orderId/refunds/:outRequestNo",
  requireAdmin,
  async (req, res) => {
    const refund = getRefund(req.params.outRequestNo);
    if (!refund || refund.orderId !== req.params.orderId) {
      return errorResponse(res, 404, "退款记录不存在", "REFUND_NOT_FOUND");
    }
    try {
      const result = await queryRefund({
        orderId: refund.orderId,
        outRequestNo: refund.outRequestNo,
      });
      const status =
        result.code === "10000" && result.refund_status === "REFUND_SUCCESS"
          ? "SUCCESS"
          : "PENDING";
      await updateRefund(refund.outRequestNo, { status });
      res.json({ status, result });
    } catch (error) {
      errorResponse(res, 502, error.message, "ALIPAY_REFUND_QUERY_FAILED");
    }
  },
);

if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    return res.sendFile(resolve(DIST, "index.html"));
  });
}

if (process.env.NODE_ENV !== "test") {
  getAlipaySdk();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[fde] http://127.0.0.1:${PORT} · ${loadPaymentConfig().mode} payment`,
    );
  });
}

export { app };
