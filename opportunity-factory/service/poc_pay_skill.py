#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Paid AI POC acceptance methodology over Alipay A2M."""

import base64
import json
import os
import re
import sqlite3
import time
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, unquote
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256
from Crypto.PublicKey import RSA
from flask import Flask, request, Response
from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient
from alipay.aop.api.request.AlipayAipayAgentPaymentVerifyRequest import AlipayAipayAgentPaymentVerifyRequest
from alipay.aop.api.request.AlipayAipayAgentFulfillmentConfirmRequest import AlipayAipayAgentFulfillmentConfirmRequest
from alipay.aop.api.domain.AlipayAipayAgentPaymentVerifyModel import AlipayAipayAgentPaymentVerifyModel
from alipay.aop.api.domain.AlipayAipayAgentFulfillmentConfirmModel import AlipayAipayAgentFulfillmentConfirmModel

app = Flask(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = Path(os.environ.get(
    "OPPORTUNITY_FACTORY_HOME",
    PROJECT_ROOT / "runtime",
))
ORDER_DB = RUNTIME_DIR / "poc-pay-skill.db"


def load_alipay_config():
    sandbox_path = PROJECT_ROOT / ".alipay-sandbox.json"
    sandbox = {}
    if sandbox_path.is_file():
        sandbox = json.loads(sandbox_path.read_text(encoding="utf-8"))
    sandbox_apps = sandbox.get("appIds") or []
    sandbox_app = sandbox_apps[0] if sandbox_apps else {}
    production = bool(os.environ.get("AIPAY_APP_ID"))
    private_key_file = os.environ.get("AIPAY_PRIVATE_PKCS_KEY_FILE")
    alipay_public_key_file = os.environ.get("AIPAY_ALIPAY_PUBLIC_KEY_FILE")

    def read_secret_file(path_value):
        if not path_value:
            return ""
        path = Path(path_value).expanduser()
        return path.read_text(encoding="utf-8").strip() if path.is_file() else ""

    config = {
        "appId": os.environ.get("AIPAY_APP_ID") or sandbox_app.get("appId"),
        "privateKey": (
            os.environ.get("AIPAY_PRIVATE_PKCS_KEY")
            or read_secret_file(private_key_file)
            or sandbox_app.get("appPrivatePkcsKey")
        ),
        "alipayPublicKey": (
            os.environ.get("AIPAY_ALIPAY_PUBLIC_KEY")
            or read_secret_file(alipay_public_key_file)
            or sandbox_app.get("alipayPublicKey")
        ),
        "gateway": os.environ.get(
            "ALIPAY_GATEWAY",
            "https://openapi.alipay.com/gateway.do" if production
            else "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
        ),
        "sellerId": os.environ.get("AIPAY_SELLER_ID") or sandbox_app.get("pid"),
        "serviceId": os.environ.get("AIPAY_SERVICE_ID") or "api_mock_service_id",
    }
    config["merchantPrivateKey"] = config["privateKey"]
    missing = [key for key, value in config.items() if not value]
    if missing:
        raise RuntimeError(f"支付宝配置缺少字段: {', '.join(missing)}")
    return config


ALIPAY_CONFIG = load_alipay_config()

RESOURCE_CONFIG = {
    "path": "/api/pay-skills/ai-poc-acceptance-auditor",
    "goodsName": "AI POC 验收与投标应答审计",
    "amount": os.environ.get(
        "POC_AUDIT_PRICE",
        "0.01" if ALIPAY_CONFIG["serviceId"] == "api_mock_service_id" else "1.99",
    ),
}

ORDER_REPOSITORY = None


class SQLiteOrderRepository:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS poc_pay_orders (
                    out_trade_no TEXT PRIMARY KEY,
                    trade_no TEXT UNIQUE,
                    amount TEXT NOT NULL,
                    currency TEXT NOT NULL,
                    resource_id TEXT NOT NULL,
                    goods_name TEXT NOT NULL,
                    pay_before TEXT NOT NULL,
                    order_status TEXT NOT NULL,
                    fulfill_status TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    service_result TEXT,
                    created_at TEXT NOT NULL,
                    fulfilled_at TEXT
                )
            """)

    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        return db

    def create_pending(self, order):
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO poc_pay_orders(
                    out_trade_no, amount, currency, resource_id, goods_name,
                    pay_before, order_status, fulfill_status, request_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order["out_trade_no"], order["amount"], order["currency"],
                    order["resource_id"], order["goods_name"], order["pay_before"],
                    order["order_status"], order["fulfill_status"],
                    json.dumps(order["request"], ensure_ascii=False),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def find_by_out_trade_no(self, out_trade_no):
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM poc_pay_orders WHERE out_trade_no=?",
                (out_trade_no,),
            ).fetchone()
        return dict(row) if row else None

    def prepare_fulfillment(self, request_data):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM poc_pay_orders WHERE out_trade_no=?",
                (request_data["out_trade_no"],),
            ).fetchone()
            if not row:
                return None
            order = dict(row)
            if (
                order["amount"] != request_data["expected_amount"]
                or order["resource_id"] != request_data["expected_resource_id"]
            ):
                return None
            if order["trade_no"] and order["trade_no"] != request_data["trade_no"]:
                return None
            if order["fulfill_status"] == "FULFILLED":
                return {"state": "FULFILLED", "service_result": order["service_result"]}
            if order["fulfill_status"] == "PENDING_CONFIRM":
                return {
                    "state": "PENDING_CONFIRM",
                    "service_result": order["service_result"],
                }
            payload = json.loads(order["request_json"])
            service_result = request_data["create_resource"](payload)
            db.execute(
                """
                UPDATE poc_pay_orders
                SET trade_no=?, order_status='PAID',
                    fulfill_status='PENDING_CONFIRM', service_result=?
                WHERE out_trade_no=?
                """,
                (request_data["trade_no"], service_result, request_data["out_trade_no"]),
            )
            return {"state": "PENDING_CONFIRM", "service_result": service_result}

    def mark_fulfilled(self, out_trade_no, trade_no):
        with self.connect() as db:
            db.execute(
                """
                UPDATE poc_pay_orders
                SET fulfill_status='FULFILLED', trade_no=?, fulfilled_at=?,
                    request_json='{}'
                WHERE out_trade_no=?
                """,
                (trade_no, datetime.now(timezone.utc).isoformat(), out_trade_no),
            )


def configure_order_repository(repository):
    """绑定项目的真实持久化端口。

    实现必须使用数据库事务和唯一约束，并提供 create_pending、
    find_by_out_trade_no、prepare_fulfillment 和 mark_fulfilled。
    prepare_fulfillment 必须原子地校验订单、只生成一次资源，
    并返回已持久化的 PENDING_CONFIRM 或 FULFILLED 结果。
    订单快照将支付状态映射为 PENDING_PAYMENT/PAID，
    将履约状态映射为 UNFULFILLED/PENDING_CONFIRM/FULFILLED。
    """
    required_methods = (
        'create_pending',
        'find_by_out_trade_no',
        'prepare_fulfillment',
        'mark_fulfilled'
    )
    if repository is None or any(not callable(getattr(repository, name, None)) for name in required_methods):
        raise RuntimeError(f'order_repository 必须实现 {", ".join(required_methods)}')
    global ORDER_REPOSITORY
    ORDER_REPOSITORY = repository


def require_order_repository():
    if ORDER_REPOSITORY is None:
        raise RuntimeError('尚未绑定项目真实 order_repository，禁止回退到内存订单')
    return ORDER_REPOSITORY

# 初始化支付宝客户端
def init_alipay_client():
    """初始化支付宝 SDK 客户端"""
    config = AlipayClientConfig()
    config.server_url = ALIPAY_CONFIG['gateway']
    config.app_id = ALIPAY_CONFIG['appId']
    config.app_private_key = ALIPAY_CONFIG['privateKey']
    config.alipay_public_key = ALIPAY_CONFIG['alipayPublicKey']
    config.charset = 'utf-8'
    config.sign_type = 'RSA2'

    return DefaultAlipayClient(alipay_client_config=config)


# ==================== 工具方法 ====================

def format_alipay_timestamp(dt=None):
    """格式化支付宝时间戳：yyyy-MM-dd HH:mm:ss"""
    if dt is None:
        dt = datetime.now()
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def generate_seller_signature(params, private_key):
    """
    生成商家签名（seller_signature）

    Args:
        params: 待签名参数字典
        private_key: 商户私钥字符串

    Returns:
        Base64 编码的签名
    """
    # 1. 按 key 字典序排序
    sorted_keys = sorted(params.keys())

    # 2. 拼接签名内容
    sign_content = []
    for key in sorted_keys:
        value = params[key]
        if value is not None and value != '':
            sign_content.append(f"{key}={value}")

    sign_string = '&'.join(sign_content)

    # 3. 将裸 PKCS#1 Base64 临时解码为 DER 密钥对象，不修改原始配置。
    key_der = base64.b64decode(private_key, validate=True)
    key = RSA.import_key(key_der)
    h = SHA256.new(sign_string.encode('utf-8'))
    signature = pkcs1_15.new(key).sign(h)

    return base64.b64encode(signature).decode('utf-8')


def base64url_encode(data):
    """Base64URL 编码"""
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def base64url_decode(data):
    """Base64URL 解码"""
    # 补充 padding
    padding = 4 - len(data) % 4
    if padding != 4:
        data += '=' * padding

    return base64.urlsafe_b64decode(data).decode('utf-8')


def normalize_amount(value):
    text = str(value or '').strip()
    if not re.fullmatch(r'\d+(?:\.\d{1,2})?', text):
        return None
    return f'{Decimal(text):.2f}'


def amounts_equal(left, right):
    left_amount = normalize_amount(left)
    right_amount = normalize_amount(right)
    return left_amount is not None and right_amount is not None and left_amount == right_amount


def is_future(value):
    try:
        return datetime.fromisoformat(value).timestamp() > time.time()
    except (TypeError, ValueError):
        return False


def is_exact_sandbox_mode():
    return (
        ALIPAY_CONFIG['gateway'] == 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
        and ALIPAY_CONFIG['serviceId'] == 'api_mock_service_id'
    )


def json_response(data, status_code=200, headers=None):
    """发送 JSON 响应"""
    response = Response(
        json.dumps(data, ensure_ascii=False),
        status=status_code,
        mimetype='application/json; charset=utf-8'
    )

    if headers:
        for key, value in headers.items():
            response.headers[key] = value

    return response


# ==================== 智能收产品接入示例接口 ====================

@app.route(RESOURCE_CONFIG["path"], methods=["POST"])
def handle_resource():
    """
    智能收产品统一接口

    核心协议流程演示：
    1. 不带 Payment-Proof Header：返回 HTTP 402 + Payment-Needed Header
    2. 带 Payment-Proof Header：验证支付 → 自动履约 → 返回资源
    """
    # 获取 Payment-Proof Header
    payment_proof = request.headers.get("Payment-Proof")
    payload = request.get_json(silent=True) or {}
    error = validate_request(payload)
    if error:
        return json_response({"code": "INVALID_REQUEST", "message": error}, 400)

    # 场景 1：用户未支付，返回 402 + Payment-Needed Header
    if not payment_proof or not payment_proof.strip():
        return create_payment_required_response(payload)

    # 场景 2：用户已支付，验证 Payment-Proof 并返回资源
    return verify_payment_and_deliver_resource(payment_proof)


def validate_request(payload):
    if not isinstance(payload, dict):
        return "请求体必须是 JSON 对象"
    requirements = str(payload.get("requirements_text") or "").strip()
    if len(requirements) < 80:
        return "requirements_text 至少需要 80 个字符"
    if len(requirements) > 120_000:
        return "requirements_text 不能超过 120000 个字符"
    return ""


def create_payment_required_response(payload):
    """创建 402 支付请求响应"""
    try:
        # 1. 构造订单信息
        out_trade_no = f"ORDER_{int(time.time() * 1000)}_{uuid.uuid4().hex[:12]}"
        amount = normalize_amount(RESOURCE_CONFIG["amount"])
        currency = 'CNY'
        resource_id = RESOURCE_CONFIG['path']
        goods_name = RESOURCE_CONFIG['goodsName']

        # 2. 计算支付截止时间（30 分钟后），使用带时区的 ISO 8601 格式
        pay_before = (datetime.now(timezone.utc).astimezone() + timedelta(minutes=30)).isoformat()

        # 3. 生成商家签名
        seller_signature = generate_seller_signature({
            'amount': amount,
            'currency': currency,
            'goods_name': goods_name,
            'out_trade_no': out_trade_no,
            'pay_before': pay_before,
            'resource_id': resource_id,
            'seller_id': ALIPAY_CONFIG['sellerId'],
            'service_id': ALIPAY_CONFIG['serviceId']
        }, ALIPAY_CONFIG['merchantPrivateKey'])

        require_order_repository().create_pending({
            'out_trade_no': out_trade_no,
            'amount': normalize_amount(amount),
            'currency': currency,
            'resource_id': resource_id,
            'goods_name': goods_name,
            'pay_before': pay_before,
            'order_status': 'PENDING_PAYMENT',
            'fulfill_status': 'UNFULFILLED'
            , 'request': {
                "requirements_text": str(payload.get("requirements_text") or ""),
                "project_context": str(payload.get("project_context") or "")[:4000],
                "project_type": str(payload.get("project_type") or "AI POC")[:80],
            }
        })

        # 4. 持久化成功后构造 Payment-Needed Header 内容
        payment_needed = {
            'protocol': {
                'out_trade_no': out_trade_no,
                'amount': amount,
                'currency': currency,
                'resource_id': resource_id,
                'pay_before': pay_before,
                'seller_signature': seller_signature,
                'seller_sign_type': 'RSA2',
                'seller_unique_id': ALIPAY_CONFIG['sellerId']
            },
            'method': {
                'seller_name': 'Opportunity Factory',
                'seller_id': ALIPAY_CONFIG['sellerId'],
                'seller_app_id': ALIPAY_CONFIG['appId'],
                'goods_name': goods_name,
                'seller_unique_id_key': 'seller_id',
                'service_id': ALIPAY_CONFIG['serviceId']
            }
        }

        # 5. Base64URL 编码
        payment_needed_encoded = base64url_encode(json.dumps(payment_needed, ensure_ascii=False))

        # 6. 构造 402 响应
        response_data = {
            'code': 'Payment-Needed',
            'message': '需要支付',
            'out_trade_no': out_trade_no,
            'amount': amount,
            'currency': currency,
            'goods_name': goods_name
        }

        print(f"创建支付订单成功：outTradeNo={out_trade_no}, amount={amount}")

        return json_response(
            response_data,
            status_code=402,
            headers={'Payment-Needed': payment_needed_encoded}
        )

    except Exception as e:
        print(f'创建订单失败：{str(e)}')
        return json_response({
            'code': 'CREATE_ORDER_ERROR',
            'message': f'创建订单失败：{str(e)}'
        }, status_code=500)


def verify_payment_and_deliver_resource(payment_proof):
    """验证支付凭证并交付资源"""
    try:
        # 1. 从 Payment-Proof 中解析订单信息
        try:
            decoded_proof = base64url_decode(payment_proof)
            proof_json = json.loads(decoded_proof)

            # 从 protocol 层获取 payment_proof 和 trade_no
            protocol = proof_json.get('protocol', {})
            payment_proof_value = protocol.get('payment_proof')
            trade_no = protocol.get('trade_no')

            # 从 method 层获取 client_session
            method = proof_json.get('method', {})
            client_session = method.get('client_session')

            # 校验必要字段
            if not payment_proof_value or not payment_proof_value.strip():
                return create_payment_required_response(request.get_json(silent=True) or {})

            if not trade_no or not trade_no.strip():
                return create_payment_required_response(request.get_json(silent=True) or {})

        except Exception as e:
            print(f'Payment-Proof 解析失败：{str(e)}')
            return create_payment_required_response(request.get_json(silent=True) or {})

        # 2. 调用支付宝 API 验证支付凭证
        # 注意：必须使用 Model 类，不能使用 dict
        # SDK 的 get_params() 方法会调用 biz_model.to_alipay_dict()
        alipay_client = init_alipay_client()
        verify_request = AlipayAipayAgentPaymentVerifyRequest()

        # 使用 Model 类（正确方式）
        model = AlipayAipayAgentPaymentVerifyModel()
        model.payment_proof = payment_proof_value
        model.trade_no = trade_no
        if client_session:
            model.client_session = client_session
        verify_request.biz_model = model

        verify_response_content = alipay_client.execute(verify_request)
        verify_response = json.loads(verify_response_content)

        # 3. 验证失败，返回错误
        # 注意：SDK execute() 返回的 JSON 可能是扁平结构（直接包含 code/trade_no 等字段），
        # 也可能嵌套在 alipay_aipay_agent_payment_verify_response 键下，需兼容两种情况
        response_data = verify_response.get('alipay_aipay_agent_payment_verify_response', verify_response)
        if response_data.get('code') != '10000':
            print(f'支付凭证验证失败：{response_data.get("sub_msg")}')
            return create_payment_required_response(request.get_json(silent=True) or {})

        # 4. 验证成功，获取订单信息
        returned_trade_no = response_data.get('trade_no') or response_data.get('tradeNo') or ''
        verify_out_trade_no = response_data.get('out_trade_no') or response_data.get('outTradeNo') or ''
        returned_amount = response_data.get('amount')
        returned_resource_id = response_data.get('resource_id') or response_data.get('resourceId') or ''
        active = response_data.get('active')

        repository = require_order_repository()
        order = repository.find_by_out_trade_no(verify_out_trade_no) if verify_out_trade_no else None
        sandbox_mode = is_exact_sandbox_mode()
        verify_trade_no = returned_trade_no or (trade_no if sandbox_mode else '')
        verify_amount = returned_amount or (order.get('amount') if sandbox_mode and order else '')
        resource_id_verified = returned_resource_id or (order.get('resource_id') if sandbox_mode and order else '')

        print(f"支付凭证验证成功：tradeNo={verify_trade_no}, outTradeNo={verify_out_trade_no}")

        # 5. 校验凭证有效性（active=true 表示凭证有效）
        if (
            active is not True
            or not verify_trade_no
            or verify_trade_no != trade_no
            or not verify_out_trade_no
            or not resource_id_verified
        ):
            print(f"支付凭证无效或已过期：outTradeNo={verify_out_trade_no}")
            return create_payment_required_response(request.get_json(silent=True) or {})

        amount_matches = order and amounts_equal(order.get('amount'), verify_amount)
        resource_matches = (
            order
            and order.get('resource_id') == resource_id_verified
            and resource_id_verified == RESOURCE_CONFIG['path']
        )
        fulfill_status = order.get('fulfill_status') if order else None
        fulfillment_in_progress = fulfill_status in ('PENDING_CONFIRM', 'FULFILLED')
        order_usable = (
            order
            and order.get('currency') == 'CNY'
            and order.get('order_status') in ('PENDING_PAYMENT', 'PAID')
            and fulfill_status in ('UNFULFILLED', 'PENDING_CONFIRM', 'FULFILLED')
            and (fulfillment_in_progress or is_future(order.get('pay_before')))
        )
        if not amount_matches or not resource_matches or not order_usable:
            return create_payment_required_response(request.get_json(silent=True) or {})

        fulfillment = repository.prepare_fulfillment({
            'out_trade_no': verify_out_trade_no,
            'trade_no': verify_trade_no,
            'expected_amount': normalize_amount(verify_amount),
            'expected_resource_id': resource_id_verified,
            'create_resource': generate_service_resource
        })
        if (
            not fulfillment
            or fulfillment.get('state') not in ('PENDING_CONFIRM', 'FULFILLED')
            or not fulfillment.get('service_result')
        ):
            raise RuntimeError('order_repository.prepare_fulfillment 未返回已持久化的履约结果')
        service_result = fulfillment['service_result']
        if fulfillment['state'] == 'FULFILLED':
            return successful_resource_response(
                verify_trade_no, verify_out_trade_no, resource_id_verified, service_result, True
            )

        fulfillment_trade_no = verify_trade_no
        print(f"资源已生成，准备发送履约确认：outTradeNo={verify_out_trade_no}, tradeNo={fulfillment_trade_no}")

        # 12. 发送履约确认到支付宝，确认成功后才返回成功交付
        # 注意：同样需要使用 Model 类
        if not send_fulfillment_confirm(fulfillment_trade_no):
            return json_response({
                'code': 'FULFILLMENT_CONFIRM_FAILED',
                'message': '资源已生成但履约确认失败，请稍后使用同一 Payment-Proof 重试'
            }, status_code=502)

        repository.mark_fulfilled(verify_out_trade_no, fulfillment_trade_no)

        print(f"履约确认成功：outTradeNo={verify_out_trade_no}, tradeNo={fulfillment_trade_no}")

        return successful_resource_response(
            fulfillment_trade_no, verify_out_trade_no, resource_id_verified, service_result, False
        )

    except Exception as e:
        print(f'支付凭证验证异常：{type(e).__name__}: {str(e)}')
        return json_response({
            'code': 'VERIFY_FAILED',
            'message': f'支付凭证验证失败：{type(e).__name__}: {str(e)}'
        }, status_code=500)


def successful_resource_response(trade_no, out_trade_no, resource_id, service_result, already_fulfilled):
    payment_validation = base64url_encode(json.dumps({
        'trade_no': trade_no,
        'out_trade_no': out_trade_no,
        'validated': True,
        'resource_id': resource_id
    }, ensure_ascii=False))
    return json_response({
        'resource_id': resource_id,
        'content': service_result,
        'trade_no': trade_no,
        'out_trade_no': out_trade_no,
        'already_fulfilled': already_fulfilled,
        'fulfillment_confirmed': True
    }, headers={'Payment-Validation': payment_validation})


def generate_service_resource(payload):
    """Return the paid analysis contract used by the invoking Agent."""
    requirements = payload["requirements_text"]
    line_count = len([line for line in requirements.splitlines() if line.strip()])
    methodology = {
        "status": "success",
        "service_type": "AI_POC_ACCEPTANCE_AUDIT",
        "input_summary": {
            "project_type": payload["project_type"],
            "character_count": len(requirements),
            "non_empty_lines": line_count,
        },
        "required_outputs": [
            "需求追踪矩阵",
            "POC验收测试用例",
            "证据采集清单",
            "现场演示脚本",
            "风险与缺口清单",
            "投标应答覆盖审查",
        ],
        "analysis_dimensions": [
            "业务目标与可量化收益",
            "功能范围与边界",
            "模型效果与评测数据集",
            "知识库检索与引用证据",
            "Agent任务成功率与异常恢复",
            "性能、并发与容量",
            "数据安全、权限与审计",
            "私有化部署与离线依赖",
            "国产化与基础设施适配",
            "可运维性、监控与告警",
            "交付物、培训与知识转移",
            "验收口径、责任人与签字证据",
        ],
        "rules": [
            "每条结论必须引用用户材料中的原句或条款编号。",
            "无法从材料证明的指标、资质、案例和能力必须标为待确认。",
            "每条需求必须映射验收步骤、预期结果、失败判据和证据。",
            "硬性门槛、评分项、一般要求必须分开，不得混合排序。",
            "发现矛盾条款时并列展示，不擅自选择其中一项。",
            "演示脚本按业务价值组织，不按产品菜单组织。",
        ],
        "scoring": {
            "coverage": 30,
            "testability": 25,
            "evidence_readiness": 20,
            "delivery_feasibility": 15,
            "risk_control": 10,
            "grade_thresholds": {"ready": 85, "conditional": 65, "high_risk": 0},
        },
        "schemas": {
            "requirement_matrix": [
                "id", "source_quote", "type", "priority", "owner",
                "acceptance_metric", "test_case_ids", "evidence", "status", "risk",
            ],
            "test_case": [
                "id", "requirement_ids", "preconditions", "test_data",
                "steps", "expected_result", "failure_criteria", "evidence",
            ],
            "risk": [
                "severity", "source", "gap", "impact", "mitigation",
                "owner", "decision_deadline",
            ],
        },
        "project_context": payload["project_context"],
        "generated_at": datetime.now(timezone.utc).astimezone().isoformat(),
    }
    return json.dumps(methodology, ensure_ascii=False)


def send_fulfillment_confirm(trade_no):
    """发送履约确认"""
    if not trade_no:
        print("履约确认失败：tradeNo 为空")
        return False

    try:
        print(f"开始发送履约确认：tradeNo={trade_no}")

        alipay_client = init_alipay_client()
        confirm_request = AlipayAipayAgentFulfillmentConfirmRequest()

        # 使用 Model 类（正确方式）
        model = AlipayAipayAgentFulfillmentConfirmModel()
        model.trade_no = trade_no
        confirm_request.biz_model = model

        # 备选方案：使用 biz_content
        # confirm_request.biz_content = json.dumps({
        #     'trade_no': trade_no
        # }, ensure_ascii=False)

        response_content = alipay_client.execute(confirm_request)
        response = json.loads(response_content)

        # 注意：SDK execute() 返回的 JSON 可能是扁平结构，也可能嵌套在响应键下，需兼容两种情况
        response_data = response.get('alipay_aipay_agent_fulfillment_confirm_response', response)
        if response_data.get('code') == '10000':
            print(f"履约确认成功：tradeNo={trade_no}")
            return True
        else:
            print(f"履约确认失败：tradeNo={trade_no}, errorCode={response_data.get('sub_code')}, "
                  f"errorMsg={response_data.get('sub_msg')}")
            return False

    except Exception as e:
        print(f"履约确认异常：tradeNo={trade_no}, error={str(e)}")
        return False


# ==================== 启动服务 ====================

configure_order_repository(SQLiteOrderRepository(ORDER_DB))


if __name__ == '__main__':
    port = int(os.environ.get("POC_PAY_SKILL_PORT", "8788"))
    print(f"A2M service listening on http://127.0.0.1:{port}{RESOURCE_CONFIG['path']}")
    app.run(host="0.0.0.0", port=port, debug=False)
