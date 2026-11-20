from __future__ import annotations

import json
import os
import re
import secrets
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlencode

PRODUCT_ID = "destiny-persona"
PLANS = {
    "starter": {"id": "starter", "name": "灵感包", "amount": "6.90", "credits": 10, "tag": "先试一轮"},
    "value": {"id": "value", "name": "常用包", "amount": "19.90", "credits": 50, "tag": "更划算"},
}
PAID_STATES = {"TRADE_SUCCESS", "TRADE_FINISHED"}
ORDER_TTL_SECONDS = 15 * 60


class PaymentError(RuntimeError):
    pass


def payment_configured() -> bool:
    if os.environ.get("ALIPAY_USE_SANDBOX") == "1":
        return True
    core_ready = all(
        str(os.environ.get(name, "")).strip()
        for name in ("ALIPAY_APP_ID", "ALIPAY_APP_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "PUBLIC_ORIGIN")
    )
    public_origin = os.environ.get("PUBLIC_ORIGIN", "").strip()
    seller_ready = bool(
        os.environ.get("ALIPAY_SELLER_ID", "").strip()
        or os.environ.get("ALIPAY_SELLER_EMAIL", "").strip()
    )
    return core_ready and public_origin.startswith("https://") and seller_ready


def public_config():
    return {
        "provider": "alipay" if payment_configured() else None,
        "checkoutEnabled": payment_configured(),
        "plans": list(PLANS.values()),
    }


def _load_sandbox_config(project_root: Path):
    path = project_root / ".alipay-sandbox.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    applications = data.get("appIds") or []
    if not applications or not isinstance(applications[0], dict):
        raise PaymentError("sandbox_application_missing")
    application = applications[0]
    partner = (data.get("sandboxAccounts") or {}).get("partner") or {}
    return {
        "app_id": str(application["appId"]).strip(),
        "private_key": str(application["appPrivatePkcsKey"]).strip(),
        "public_key": str(application["alipayPublicKey"]).strip(),
        "gateway": "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
        "seller_id": str(application.get("pid") or partner.get("merchantId") or "").strip(),
        "seller_email": str(partner.get("email") or "").strip(),
        "sandbox": True,
    }


def load_config(project_root: Path):
    if os.environ.get("ALIPAY_USE_SANDBOX") == "1":
        return _load_sandbox_config(project_root)
    if not payment_configured():
        raise PaymentError("payment_not_configured")
    return {
        "app_id": os.environ["ALIPAY_APP_ID"].strip(),
        "private_key": os.environ["ALIPAY_APP_PRIVATE_KEY"].strip(),
        "public_key": os.environ["ALIPAY_PUBLIC_KEY"].strip(),
        "gateway": os.environ.get("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do").strip(),
        "seller_id": os.environ.get("ALIPAY_SELLER_ID", "").strip(),
        "seller_email": os.environ.get("ALIPAY_SELLER_EMAIL", "").strip(),
        "sandbox": False,
    }


def client_for(config):
    from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
    from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient

    sdk = AlipayClientConfig()
    sdk.server_url = config["gateway"]
    sdk.app_id = config["app_id"]
    sdk.app_private_key = config["private_key"]
    sdk.alipay_public_key = config["public_key"]
    sdk.charset = "utf-8"
    sdk.sign_type = "RSA2"
    return DefaultAlipayClient(alipay_client_config=sdk)


def create_order(state, visitor_id: str, plan_id: str):
    plan = PLANS.get(plan_id)
    if not plan:
        raise PaymentError("invalid_plan")
    now = int(time.time())
    order_no = f"DP{time.strftime('%Y%m%d%H%M%S', time.localtime(now))}{secrets.token_hex(5).upper()}"
    order = {
        "outTradeNo": order_no,
        "visitorId": visitor_id,
        "productId": PRODUCT_ID,
        "planId": plan["id"],
        "subject": f"命运分身·{plan['name']}（{plan['credits']}次）",
        "amount": plan["amount"],
        "credits": plan["credits"],
        "status": "PENDING_PAYMENT",
        "createdAt": now,
        "expiresAt": now + ORDER_TTL_SECONDS,
        "updatedAt": now,
        "tradeNo": None,
        "creditedAt": None,
        "refunds": [],
        "events": [],
    }
    state.setdefault("orders", {})[order_no] = order
    return order


def create_payment_form(order, config, return_url: str, notify_url: str = ""):
    from alipay.aop.api.domain.AlipayTradePagePayModel import AlipayTradePagePayModel
    from alipay.aop.api.request.AlipayTradePagePayRequest import AlipayTradePagePayRequest

    request = AlipayTradePagePayRequest()
    request.return_url = return_url
    if notify_url:
        request.notify_url = notify_url
    model = AlipayTradePagePayModel()
    model.out_trade_no = order["outTradeNo"]
    model.total_amount = order["amount"]
    model.subject = order["subject"]
    model.product_code = "FAST_INSTANT_TRADE_PAY"
    model.timeout_express = "15m"
    request.biz_model = model
    return client_for(config).page_execute(request)


def _execute(config, request, response_key: str):
    response = json.loads(client_for(config).execute(request))
    result = response.get(response_key, {})
    if result.get("code") != "10000":
        raise PaymentError(result.get("sub_code") or result.get("msg") or "alipay_request_failed")
    return result


def query_trade(order, config):
    from alipay.aop.api.domain.AlipayTradeQueryModel import AlipayTradeQueryModel
    from alipay.aop.api.request.AlipayTradeQueryRequest import AlipayTradeQueryRequest

    request = AlipayTradeQueryRequest()
    model = AlipayTradeQueryModel()
    model.out_trade_no = order["outTradeNo"]
    request.biz_model = model
    return _execute(config, request, "alipay_trade_query_response")


def close_trade(order, config):
    from alipay.aop.api.domain.AlipayTradeCloseModel import AlipayTradeCloseModel
    from alipay.aop.api.request.AlipayTradeCloseRequest import AlipayTradeCloseRequest

    request = AlipayTradeCloseRequest()
    model = AlipayTradeCloseModel()
    model.out_trade_no = order["outTradeNo"]
    request.biz_model = model
    return _execute(config, request, "alipay_trade_close_response")


def refund_trade(order, amount: str, out_request_no: str, config):
    from alipay.aop.api.domain.AlipayTradeRefundModel import AlipayTradeRefundModel
    from alipay.aop.api.request.AlipayTradeRefundRequest import AlipayTradeRefundRequest

    refund_amount = normalize_amount(amount)
    paid_amount = Decimal(order["amount"])
    previous = sum(Decimal(item["amount"]) for item in order.get("refunds", []) if item["status"] == "REFUND_SUCCESS")
    if refund_amount <= 0 or previous + refund_amount > paid_amount:
        raise PaymentError("invalid_refund_amount")
    request = AlipayTradeRefundRequest()
    model = AlipayTradeRefundModel()
    model.out_trade_no = order["outTradeNo"]
    model.refund_amount = f"{refund_amount:.2f}"
    model.refund_reason = "用户申请退款"
    model.out_request_no = out_request_no
    request.biz_model = model
    return _execute(config, request, "alipay_trade_refund_response")


def query_refund(order, out_request_no: str, config):
    from alipay.aop.api.domain.AlipayTradeFastpayRefundQueryModel import AlipayTradeFastpayRefundQueryModel
    from alipay.aop.api.request.AlipayTradeFastpayRefundQueryRequest import AlipayTradeFastpayRefundQueryRequest

    request = AlipayTradeFastpayRefundQueryRequest()
    model = AlipayTradeFastpayRefundQueryModel()
    model.out_trade_no = order["outTradeNo"]
    model.out_request_no = out_request_no
    request.biz_model = model
    return _execute(config, request, "alipay_trade_fastpay_refund_query_response")


def normalize_amount(value) -> Decimal:
    if not re.fullmatch(r"\d+(?:\.\d{1,2})?", str(value or "").strip()):
        raise PaymentError("invalid_amount")
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except InvalidOperation as error:
        raise PaymentError("invalid_amount") from error


def verify_notification(params, config):
    from alipay.aop.api.util.SignatureUtils import get_sign_content, verify_with_rsa

    sign = str(params.get("sign") or "")
    if not sign:
        return False
    signed = {key: value for key, value in params.items() if key not in {"sign", "sign_type"}}
    return verify_with_rsa(config["public_key"], get_sign_content(signed).encode("utf-8"), sign)


def business_fields_match(order, params, config):
    seller_matches = (
        bool(config.get("seller_id") and params.get("seller_id") == config["seller_id"])
        or bool(config.get("seller_email") and params.get("seller_email") == config["seller_email"])
    )
    return (
        params.get("app_id") == config["app_id"]
        and params.get("out_trade_no") == order["outTradeNo"]
        and normalize_amount(params.get("total_amount")) == Decimal(order["amount"])
        and seller_matches
    )


def is_paid_event(params):
    return (
        params.get("trade_status") in PAID_STATES
        and not params.get("out_biz_no")
        and not params.get("gmt_refund")
        and not params.get("refund_fee")
    )


def apply_paid_order(state, order, trade_no: str, event=None):
    if order.get("creditedAt"):
        return False
    visitor = state.setdefault("visitors", {}).setdefault(order["visitorId"], {"used": 0})
    visitor["credits"] = int(visitor.get("credits", 0) or 0) + int(order["credits"])
    visitor["lastPurchaseAt"] = int(time.time())
    order["status"] = "PAID"
    order["tradeNo"] = trade_no
    order["creditedAt"] = int(time.time())
    order["updatedAt"] = int(time.time())
    if event:
        order.setdefault("events", []).append(event)
    return True


def safe_order(order):
    return {
        "outTradeNo": order["outTradeNo"],
        "planId": order["planId"],
        "subject": order["subject"],
        "amount": order["amount"],
        "credits": order["credits"],
        "status": order["status"],
        "createdAt": order["createdAt"],
        "expiresAt": order.get("expiresAt"),
        "updatedAt": order["updatedAt"],
        "creditedAt": order.get("creditedAt"),
    }


def return_url(origin: str, order_no: str):
    return f"{origin}/destiny-persona/payment/return?{urlencode({'order': order_no})}"
