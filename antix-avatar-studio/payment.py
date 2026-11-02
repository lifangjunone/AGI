import hashlib
import json
import os
import secrets
from decimal import Decimal, InvalidOperation
from pathlib import Path


AMOUNT = Decimal("0.90")
SUBJECT = "Second Me 7 天使用权"
PAID_STATES = {"TRADE_SUCCESS", "TRADE_FINISHED"}


def amount_matches(value):
    try:
        return Decimal(str(value)).quantize(Decimal("0.01")) == AMOUNT
    except (InvalidOperation, TypeError):
        return False


class PaymentUnavailable(RuntimeError):
    pass


class AlipayGateway:
    def __init__(self, root, store):
        self.root = Path(root)
        self.store = store
        self.settings = self._load_settings()
        self.client = None

    @property
    def enabled(self):
        return bool(self.settings)

    @property
    def mode(self):
        return self.settings.get("mode", "unavailable") if self.settings else "unavailable"

    def _load_settings(self):
        env = {
            "app_id": os.environ.get("ALIPAY_APP_ID", "").strip(),
            "app_private_key": os.environ.get("ALIPAY_APP_PRIVATE_KEY", "").strip(),
            "alipay_public_key": os.environ.get("ALIPAY_PUBLIC_KEY", "").strip(),
            "seller_id": os.environ.get("ALIPAY_SELLER_ID", "").strip(),
            "seller_email": os.environ.get("ALIPAY_SELLER_EMAIL", "").strip(),
            "server_url": os.environ.get("ALIPAY_SERVER_URL", "https://openapi.alipay.com/gateway.do").strip(),
            "mode": os.environ.get("ALIPAY_MODE", "production").strip(),
        }
        if env["app_id"] and env["app_private_key"] and env["alipay_public_key"]:
            return env
        sandbox = Path(os.environ.get("ALIPAY_SANDBOX_CONFIG", str(self.root / ".alipay-sandbox.json")))
        if not sandbox.exists():
            return {}
        try:
            data = json.loads(sandbox.read_text())
            application = (data.get("appIds") or [{}])[0]
            accounts = data.get("sandboxAccounts") or {}
            settings = {
                "app_id": application.get("appId"),
                "app_private_key": application.get("appPrivatePkcsKey"),
                "alipay_public_key": application.get("alipayPublicKey"),
                "seller_id": application.get("pid") or application.get("uid"),
                "seller_email": accounts.get("sellerEmail"),
                "server_url": data.get("serverUrl") or data.get("gateway") or "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
                "mode": "sandbox",
            }
            required = ("app_id", "app_private_key", "alipay_public_key")
            return settings if all(settings.get(key) for key in required) else {}
        except (OSError, ValueError):
            return {}

    def _client(self):
        if not self.enabled:
            raise PaymentUnavailable("payment_not_configured")
        if self.client:
            return self.client
        try:
            from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
            from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient
        except ImportError as error:
            raise PaymentUnavailable("payment_sdk_unavailable") from error
        config = AlipayClientConfig()
        config.server_url = self.settings["server_url"]
        config.app_id = self.settings["app_id"]
        config.app_private_key = self.settings["app_private_key"]
        config.alipay_public_key = self.settings["alipay_public_key"]
        config.charset = "utf-8"
        config.sign_type = "RSA2"
        self.client = DefaultAlipayClient(alipay_client_config=config)
        return self.client

    def create_payment(self, user_id, public_base):
        from alipay.aop.api.domain.AlipayTradePagePayModel import AlipayTradePagePayModel
        from alipay.aop.api.request.AlipayTradePagePayRequest import AlipayTradePagePayRequest

        out_trade_no = f"SM{secrets.token_hex(12).upper()}"
        self.store.create_order(out_trade_no, user_id, str(AMOUNT))
        request = AlipayTradePagePayRequest()
        request.notify_url = f"{public_base}/api/payment/alipay/notify"
        request.return_url = f"{public_base}/payment/return?out_trade_no={out_trade_no}"
        model = AlipayTradePagePayModel()
        model.out_trade_no = out_trade_no
        model.total_amount = str(AMOUNT)
        model.subject = SUBJECT
        model.product_code = "FAST_INSTANT_TRADE_PAY"
        request.biz_model = model
        return out_trade_no, self._client().page_execute(request)

    def query(self, out_trade_no):
        from alipay.aop.api.domain.AlipayTradeQueryModel import AlipayTradeQueryModel
        from alipay.aop.api.request.AlipayTradeQueryRequest import AlipayTradeQueryRequest

        request = AlipayTradeQueryRequest()
        model = AlipayTradeQueryModel()
        model.out_trade_no = out_trade_no
        request.biz_model = model
        result = self._execute(request, "alipay_trade_query_response")
        if result.get("code") == "10000":
            state = result.get("trade_status", "UNKNOWN")
            order = self.store.order(out_trade_no)
            response_order = result.get("out_trade_no")
            if (
                order
                and response_order == out_trade_no
                and state in PAID_STATES
                and amount_matches(result.get("total_amount"))
            ):
                self.store.record_order_state(out_trade_no, "PAID", result.get("trade_no"), result)
                self.store.grant_order_once(out_trade_no)
            elif state == "TRADE_CLOSED":
                self.store.record_order_state(out_trade_no, "CLOSED", result.get("trade_no"), result)
        return result

    def verify_notify(self, params):
        sign = params.get("sign", "")
        if not sign or params.get("sign_type", "RSA2") != "RSA2":
            return False
        values = {key: value for key, value in params.items() if key not in ("sign", "sign_type") and value != ""}
        try:
            from alipay.aop.api.util.SignatureUtils import get_sign_content, verify_with_rsa
            content = get_sign_content(values).encode("utf-8")
            return verify_with_rsa(self.settings["alipay_public_key"], content, sign)
        except Exception:
            return False

    def accept_notify(self, params):
        if not self.verify_notify(params):
            return False
        order = self.store.order(params.get("out_trade_no"))
        seller_ok = (
            bool(self.settings.get("seller_id") and params.get("seller_id") == self.settings["seller_id"])
            or bool(self.settings.get("seller_email") and params.get("seller_email") == self.settings["seller_email"])
        )
        if not order or params.get("app_id") != self.settings["app_id"] or not seller_ok:
            return False
        if not amount_matches(params.get("total_amount")) or order["amount"] != str(AMOUNT):
            return False
        event_key = params.get("notify_id") or hashlib.sha256(
            "|".join(str(params.get(key, "")) for key in ("trade_no", "out_trade_no", "trade_status", "gmt_payment")).encode()
        ).hexdigest()
        if not self.store.record_event_once(event_key, order["out_trade_no"], params.get("trade_status"), params):
            return True
        paid = params.get("trade_status") in PAID_STATES
        is_refund = bool(params.get("out_biz_no") or params.get("gmt_refund") or params.get("refund_fee"))
        if paid and not is_refund:
            self.store.record_order_state(order["out_trade_no"], "PAID", params.get("trade_no"), params)
            self.store.grant_order_once(order["out_trade_no"])
        else:
            self.store.record_order_state(order["out_trade_no"], params.get("trade_status", "EVENT"), params.get("trade_no"), params)
        return True

    def close(self, out_trade_no):
        from alipay.aop.api.domain.AlipayTradeCloseModel import AlipayTradeCloseModel
        from alipay.aop.api.request.AlipayTradeCloseRequest import AlipayTradeCloseRequest

        request = AlipayTradeCloseRequest()
        model = AlipayTradeCloseModel()
        model.out_trade_no = out_trade_no
        request.biz_model = model
        result = self._execute(request, "alipay_trade_close_response")
        if result.get("code") == "10000":
            self.store.record_order_state(out_trade_no, "CLOSED", result.get("trade_no"), result)
        return result

    def refund(self, out_trade_no, out_request_no, reason="用户申请退款"):
        order = self.store.order(out_trade_no)
        if not order or order["status"] != "PAID" or not amount_matches(order["amount"]):
            raise ValueError("order_not_refundable")
        if not out_request_no or len(out_request_no) > 64:
            raise ValueError("invalid_refund_request_no")
        from alipay.aop.api.domain.AlipayTradeRefundModel import AlipayTradeRefundModel
        from alipay.aop.api.request.AlipayTradeRefundRequest import AlipayTradeRefundRequest

        request = AlipayTradeRefundRequest()
        model = AlipayTradeRefundModel()
        model.out_trade_no = out_trade_no
        model.refund_amount = str(AMOUNT)
        model.refund_reason = reason[:200]
        model.out_request_no = out_request_no
        request.biz_model = model
        result = self._execute(request, "alipay_trade_refund_response")
        status = "SUCCESS" if result.get("code") == "10000" and result.get("fund_change") == "Y" else "PENDING"
        self.store.save_refund(out_request_no, out_trade_no, str(AMOUNT), status, result)
        return result

    def query_refund(self, out_trade_no, out_request_no):
        from alipay.aop.api.domain.AlipayTradeFastpayRefundQueryModel import AlipayTradeFastpayRefundQueryModel
        from alipay.aop.api.request.AlipayTradeFastpayRefundQueryRequest import AlipayTradeFastpayRefundQueryRequest

        request = AlipayTradeFastpayRefundQueryRequest()
        model = AlipayTradeFastpayRefundQueryModel()
        model.out_trade_no = out_trade_no
        model.out_request_no = out_request_no
        request.biz_model = model
        result = self._execute(request, "alipay_trade_fastpay_refund_query_response")
        self.store.save_refund(out_request_no, out_trade_no, str(AMOUNT), result.get("refund_status", "UNKNOWN"), result)
        return result

    def _execute(self, request, key):
        response = json.loads(self._client().execute(request))
        return response.get(key, {})
