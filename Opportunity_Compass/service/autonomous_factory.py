#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_NAME = "Opportunity Factory"
BASE_DIR = Path(os.environ.get("OPPORTUNITY_FACTORY_HOME", Path(__file__).resolve().parents[1] / "runtime"))
DB_PATH = BASE_DIR / "factory.db"
HOST = os.environ.get("FACTORY_HOST", "127.0.0.1")
PORT = int(os.environ.get("FACTORY_PORT", "8787"))
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://audit.lifeyoume.icu").rstrip("/")
INDEXNOW_KEY = os.environ.get(
    "INDEXNOW_KEY",
    hashlib.sha256(f"{PUBLIC_URL}:opportunity-factory".encode()).hexdigest()[:32],
)
SCAN_SECONDS = max(300, int(os.environ.get("SCAN_SECONDS", "900")))
USER_AGENT = "OpportunityFactory/1.0 (+https://audit.lifeyoume.icu/about)"
DEMAND_TERMS = (
    "looking for", "need a tool", "need software", "help wanted", "bounty",
    "request for", "is there a", "how do you", "recommend a", "seeking",
    "需要一个", "求工具", "求推荐", "悬赏", "寻找", "有没有",
)
BUILD_TERMS = (
    "ai", "agent", "automation", "workflow", "rag", "knowledge", "api",
    "integration", "monitor", "dashboard", "search", "cost", "content",
    "智能体", "自动化", "工作流", "知识库", "集成", "监控", "搜索",
)
LOW_QUALITY_PATTERNS = (
    "bounty alert", "opportunities found", "opportunityies found",
    "daily digest", "weekly digest", "automated report", "自动汇总", "每日汇总",
)
IMPLEMENTED_PRODUCT_TOOLS = {"integration"}
REPORT_PRICE_CENTS = max(1, int(os.environ.get("REPORT_PRICE_CENTS", "29900")))
REPORT_CURRENCY = os.environ.get("REPORT_CURRENCY", "cny").strip().lower()[:3]
REPORT_PRICE_USD_CENTS = max(
    1, int(os.environ.get("REPORT_PRICE_USD_CENTS", "3900"))
)
PUBLIC_SAMPLE_REPOSITORIES = (
    "langchain-ai/langchain",
    "crewAIInc/crewAI",
    "microsoft/autogen",
    "open-webui/open-webui",
    "ollama/ollama",
    "n8n-io/n8n",
    "langgenius/dify",
)
PUBLIC_SAMPLE_CONTEXTS = (
    {
        "scenario": "internal",
        "sensitivity": "public",
        "team_size": "small",
    },
    {
        "scenario": "customer",
        "sensitivity": "internal",
        "team_size": "small",
    },
    {
        "scenario": "agent",
        "sensitivity": "sensitive",
        "team_size": "solo",
    },
)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def clean(value: Any, limit: int = 4000) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:48] or "micro-product"


def request_json(url: str, headers: dict[str, str] | None = None, timeout: int = 20) -> Any:
    request_headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    request_headers.update(headers or {})
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def submit_indexnow(urls: list[str]) -> bool:
    if not urls:
        return False
    host = urllib.parse.urlparse(PUBLIC_URL).netloc
    payload = json.dumps({
        "host": host,
        "key": INDEXNOW_KEY,
        "keyLocation": f"{PUBLIC_URL}/{INDEXNOW_KEY}.txt",
        "urlList": urls[:100],
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status in (200, 202)
    except urllib.error.HTTPError as exc:
        return exc.code in (200, 202)
    except OSError:
        return False


def notify_websub() -> bool:
    payload = urllib.parse.urlencode({
        "hub.mode": "publish",
        "hub.url": f"{PUBLIC_URL}/feed.xml",
    }).encode()
    request = urllib.request.Request(
        "https://pubsubhubbub.appspot.com/",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status in (200, 202, 204)
    except (OSError, urllib.error.HTTPError):
        return False


def create_stripe_checkout(report_token: str) -> str:
    secret_key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    price_id = os.environ.get("STRIPE_PRICE_ID", "").strip()
    if not secret_key or not price_id:
        raise ValueError("支付通道尚未配置")
    payload = urllib.parse.urlencode({
        "mode": "payment",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "metadata[report_token]": report_token,
        "success_url": f"{PUBLIC_URL}/r/{report_token}?payment=processing",
        "cancel_url": f"{PUBLIC_URL}/r/{report_token}?payment=cancelled",
    }).encode()
    request = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode())
    except (OSError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        raise ValueError("无法创建支付会话，请稍后重试") from exc
    checkout_url = clean(result.get("url"), 500)
    if not checkout_url.startswith("https://checkout.stripe.com/"):
        raise ValueError("支付平台未返回有效结账地址")
    return checkout_url


def verify_stripe_webhook(
    payload: bytes,
    signature_header: str,
    secret: str,
    tolerance_seconds: int = 300,
) -> dict[str, Any]:
    fields: dict[str, list[str]] = {}
    for part in signature_header.split(","):
        key, separator, value = part.partition("=")
        if separator:
            fields.setdefault(key.strip(), []).append(value.strip())
    try:
        timestamp = int(fields["t"][0])
    except (KeyError, ValueError, IndexError) as exc:
        raise ValueError("无效的支付签名") from exc
    if abs(int(time.time()) - timestamp) > tolerance_seconds:
        raise ValueError("支付签名已过期")
    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(
        secret.encode(), signed_payload, hashlib.sha256
    ).hexdigest()
    if not any(
        secrets.compare_digest(expected, candidate)
        for candidate in fields.get("v1", [])
    ):
        raise ValueError("支付签名校验失败")
    try:
        return json.loads(payload.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("支付事件格式无效") from exc


def paid_report_from_session(session: dict[str, Any]) -> str:
    token = clean((session.get("metadata") or {}).get("report_token"), 80)
    if (
        session.get("payment_status") != "paid"
        or int(session.get("amount_total") or 0) != REPORT_PRICE_CENTS
        or clean(session.get("currency"), 3).lower() != REPORT_CURRENCY
    ):
        return ""
    return token


def create_lemonsqueezy_checkout(report_token: str) -> str:
    checkout_url = clean(os.environ.get("LEMONSQUEEZY_CHECKOUT_URL"), 500)
    parsed = urllib.parse.urlparse(checkout_url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc.endswith(".lemonsqueezy.com")
        or "/checkout/buy/" not in parsed.path
    ):
        raise ValueError("Lemon Squeezy 结账地址尚未配置")
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("checkout[custom][report_token]", report_token))
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(query))
    )


def verify_lemonsqueezy_webhook(
    payload: bytes,
    signature_header: str,
    secret: str,
) -> dict[str, Any]:
    expected = hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    if not signature_header or not secrets.compare_digest(
        expected,
        signature_header.strip(),
    ):
        raise ValueError("Lemon Squeezy 支付签名校验失败")
    try:
        return json.loads(payload.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Lemon Squeezy 支付事件格式无效") from exc


def paid_report_from_lemonsqueezy_order(
    event: dict[str, Any],
) -> tuple[str, str, int]:
    if (event.get("meta") or {}).get("event_name") != "order_created":
        return "", "", 0
    attributes = ((event.get("data") or {}).get("attributes") or {})
    item = attributes.get("first_order_item") or {}
    expected_variant = clean(
        os.environ.get("LEMONSQUEEZY_VARIANT_ID"),
        40,
    )
    token = clean(
        ((event.get("meta") or {}).get("custom_data") or {}).get(
            "report_token"
        ),
        80,
    )
    try:
        amount_usd = int(attributes.get("subtotal_usd") or 0)
        discount_usd = int(attributes.get("discount_total_usd") or 0)
    except (TypeError, ValueError):
        return "", "", 0
    if (
        attributes.get("status") != "paid"
        or bool(attributes.get("test_mode"))
        or not expected_variant
        or str(item.get("variant_id") or "") != expected_variant
        or amount_usd != REPORT_PRICE_USD_CENTS
        or discount_usd != 0
        or bool(attributes.get("refunded"))
    ):
        return "", "", 0
    reference = clean(
        attributes.get("identifier")
        or (event.get("data") or {}).get("id"),
        200,
    )
    return token, reference, amount_usd


def refunded_report_from_lemonsqueezy_order(
    event: dict[str, Any],
) -> tuple[str, str, int]:
    if (event.get("meta") or {}).get("event_name") != "order_refunded":
        return "", "", 0
    attributes = ((event.get("data") or {}).get("attributes") or {})
    token = clean(
        ((event.get("meta") or {}).get("custom_data") or {}).get(
            "report_token"
        ),
        80,
    )
    try:
        refunded_usd = int(attributes.get("refunded_amount_usd") or 0)
    except (TypeError, ValueError):
        return "", "", 0
    if bool(attributes.get("test_mode")) or refunded_usd <= 0:
        return "", "", 0
    reference = clean(
        attributes.get("identifier")
        or (event.get("data") or {}).get("id"),
        200,
    )
    return token, reference, refunded_usd


def is_automated_user_agent(user_agent: str) -> bool:
    lowered = (user_agent or "").lower()
    markers = (
        "bot", "crawler", "spider", "slurp", "headless", "playwright",
        "lighthouse", "curl/", "wget/", "python-requests", "python-urllib",
        "facebookexternalhit", "twitterbot", "linkedinbot",
    )
    return not lowered or any(marker in lowered for marker in markers)


def is_test_attribution(source: str, medium: str = "", campaign: str = "") -> bool:
    combined = f"{source} {medium} {campaign}".lower()
    return any(marker in combined for marker in ("qa", "test", "acceptance"))


def commercial_experiment_status(metrics: dict[str, int]) -> dict[str, Any]:
    views = int(metrics.get("qualified_views") or 0)
    audits = int(metrics.get("qualified_audits") or 0)
    intents = int(metrics.get("purchase_intents") or 0)
    payments = int(metrics.get("payments") or 0)
    audit_rate = round(audits / views, 4) if views else 0
    intent_rate = round(intents / audits, 4) if audits else 0
    if payments:
        decision = "validated"
        reason = "已出现真实支付，继续扩大合格流量并监控退款和交付使用率"
    elif intents >= 10:
        decision = "reprice"
        reason = "已有 10 个购买意向但无支付，应调整价格或专业交付物"
    elif audits >= 30 and intent_rate < 0.05:
        decision = "stop_offer"
        reason = "30 个有效审计后购买意向率低于 5%，停止当前 ¥299 方案"
    elif views >= 300 and audit_rate < 0.08:
        decision = "reposition"
        reason = "300 个有效访问后审计完成率低于 8%，重做定位和首屏承诺"
    else:
        decision = "collecting"
        reason = "样本未达到判定阈值，继续采集合格真人流量"
    return {
        "decision": decision,
        "reason": reason,
        "audit_rate": audit_rate,
        "intent_rate": intent_rate,
    }


@dataclass
class Demand:
    source: str
    external_id: str
    title: str
    body: str
    url: str
    author: str
    contact_url: str
    published_at: str
    labels: list[str]
    engagement: int
    explicit_request: bool
    metadata: dict[str, Any]


PRODUCT_TEMPLATES = {
    "agent-reliability": {
        "keywords": ("agent", "coding", "workflow", "monitor", "checkpoint", "智能体", "监控"),
        "name": "Agent 可靠性体检",
        "promise": "10 分钟判断你的 AI Agent 是否具备长任务交付条件",
        "tool": "reliability",
        "cta": "提交运行问题，获取一页诊断",
    },
    "knowledge-audit": {
        "keywords": ("rag", "knowledge", "docs", "search", "retrieval", "知识库", "检索"),
        "name": "知识库命中率体检",
        "promise": "用真实问题检查企业知识库为什么答不准",
        "tool": "knowledge",
        "cta": "提交 3 个失败问题，获取改进清单",
    },
    "model-cost": {
        "keywords": ("model", "llm", "token", "cost", "inference", "模型", "成本", "推理"),
        "name": "AI 模型成本计算器",
        "promise": "估算当前模型调用成本和可优化空间",
        "tool": "cost",
        "cta": "提交调用规模，获取模型体检",
    },
    "integration-check": {
        "keywords": ("open source", "github", "api", "integration", "deploy", "开源", "集成", "部署"),
        "name": "开源工具落地检查器",
        "promise": "快速判断一个开源项目能否安全接入业务",
        "tool": "integration",
        "cta": "提交项目地址，获取采用风险清单",
    },
    "workflow-planner": {
        "keywords": (),
        "name": "业务自动化机会诊断",
        "promise": "识别一条流程中最值得先自动化的环节",
        "tool": "workflow",
        "cta": "描述当前流程，获取最小自动化方案",
    },
}


class Store:
    def __init__(self, path: Path = DB_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.parent.chmod(0o700)
        self.path = path
        self.initialize()
        self.path.chmod(0o600)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS demands (
                    id INTEGER PRIMARY KEY,
                    source TEXT NOT NULL,
                    external_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    url TEXT NOT NULL,
                    author TEXT NOT NULL,
                    contact_url TEXT NOT NULL,
                    published_at TEXT NOT NULL,
                    labels_json TEXT NOT NULL,
                    engagement INTEGER NOT NULL DEFAULT 0,
                    explicit_request INTEGER NOT NULL DEFAULT 0,
                    score INTEGER NOT NULL DEFAULT 0,
                    category TEXT NOT NULL DEFAULT 'workflow-planner',
                    metadata_json TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'new',
                    first_seen_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(source, external_id)
                );
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY,
                    demand_id INTEGER NOT NULL REFERENCES demands(id),
                    slug TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    promise TEXT NOT NULL,
                    tool TEXT NOT NULL,
                    source_title TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'launched',
                    created_at TEXT NOT NULL,
                    launched_at TEXT NOT NULL,
                    views INTEGER NOT NULL DEFAULT 0,
                    leads INTEGER NOT NULL DEFAULT 0,
                    revenue_cents INTEGER NOT NULL DEFAULT 0,
                    revenue_usd_cents INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS leads (
                    id INTEGER PRIMARY KEY,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    name TEXT NOT NULL,
                    contact TEXT NOT NULL,
                    problem TEXT NOT NULL,
                    source_ip_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'new'
                );
                CREATE TABLE IF NOT EXISTS outreach (
                    id INTEGER PRIMARY KEY,
                    demand_id INTEGER NOT NULL REFERENCES demands(id),
                    product_id INTEGER REFERENCES products(id),
                    channel TEXT NOT NULL,
                    contact_url TEXT NOT NULL,
                    message TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'queued',
                    created_at TEXT NOT NULL,
                    sent_at TEXT,
                    response TEXT,
                    UNIQUE(demand_id, channel)
                );
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY,
                    kind TEXT NOT NULL,
                    detail_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS product_events (
                    id INTEGER PRIMARY KEY,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    kind TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'direct',
                    medium TEXT NOT NULL DEFAULT '',
                    campaign TEXT NOT NULL DEFAULT '',
                    detail_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS audit_reports (
                    id INTEGER PRIMARY KEY,
                    token TEXT NOT NULL UNIQUE,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    repository TEXT NOT NULL,
                    repository_url TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    verdict TEXT NOT NULL,
                    report_json TEXT NOT NULL,
                    is_public INTEGER NOT NULL DEFAULT 0,
                    source TEXT NOT NULL DEFAULT 'direct',
                    created_at TEXT NOT NULL,
                    views INTEGER NOT NULL DEFAULT 0,
                    downloads INTEGER NOT NULL DEFAULT 0,
                    pro_unlocked INTEGER NOT NULL DEFAULT 0,
                    is_showcase INTEGER NOT NULL DEFAULT 0,
                    paid_at TEXT,
                    payment_reference TEXT,
                    paid_currency TEXT,
                    paid_amount_cents INTEGER,
                    refunded_amount_cents INTEGER NOT NULL DEFAULT 0,
                    refunded_at TEXT
                );
                CREATE TABLE IF NOT EXISTS comparison_reports (
                    id INTEGER PRIMARY KEY,
                    token TEXT NOT NULL UNIQUE,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    left_report_token TEXT NOT NULL,
                    right_report_token TEXT NOT NULL,
                    comparison_json TEXT NOT NULL,
                    is_public INTEGER NOT NULL DEFAULT 0,
                    source TEXT NOT NULL DEFAULT 'direct',
                    created_at TEXT NOT NULL,
                    views INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS qualified_visitors (
                    id INTEGER PRIMARY KEY,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    visit_date TEXT NOT NULL,
                    visitor_hash TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'direct',
                    created_at TEXT NOT NULL,
                    UNIQUE(product_id, visit_date, visitor_hash)
                );
                """
            )
            product_columns = {
                row["name"] for row in db.execute("PRAGMA table_info(products)")
            }
            if "revenue_usd_cents" not in product_columns:
                db.execute(
                    "ALTER TABLE products ADD COLUMN revenue_usd_cents "
                    "INTEGER NOT NULL DEFAULT 0"
                )
            audit_columns = {
                row["name"] for row in db.execute("PRAGMA table_info(audit_reports)")
            }
            for column, definition in (
                ("pro_unlocked", "INTEGER NOT NULL DEFAULT 0"),
                ("is_showcase", "INTEGER NOT NULL DEFAULT 0"),
                ("paid_at", "TEXT"),
                ("payment_reference", "TEXT"),
                ("paid_currency", "TEXT"),
                ("paid_amount_cents", "INTEGER"),
                ("refunded_amount_cents", "INTEGER NOT NULL DEFAULT 0"),
                ("refunded_at", "TEXT"),
            ):
                if column not in audit_columns:
                    db.execute(f"ALTER TABLE audit_reports ADD COLUMN {column} {definition}")
            if not db.execute(
                "SELECT 1 FROM audit_reports WHERE is_showcase=1 LIMIT 1"
            ).fetchone():
                showcase = db.execute(
                    """
                    SELECT id FROM audit_reports
                    WHERE is_public=1 ORDER BY created_at DESC LIMIT 1
                    """
                ).fetchone()
                if showcase:
                    db.execute(
                        "UPDATE audit_reports SET is_showcase=1 WHERE id=?",
                        (showcase["id"],),
                    )

    def event(self, kind: str, detail: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO events(kind, detail_json, created_at) VALUES (?, ?, ?)",
                (kind, json.dumps(detail, ensure_ascii=False), now_iso()),
            )

    def upsert_demand(self, demand: Demand, score: int, category: str) -> int:
        timestamp = now_iso()
        values = (
            demand.source, demand.external_id, demand.title, demand.body, demand.url,
            demand.author, demand.contact_url, demand.published_at,
            json.dumps(demand.labels, ensure_ascii=False), demand.engagement,
            int(demand.explicit_request), score, category,
            json.dumps(demand.metadata, ensure_ascii=False), timestamp, timestamp,
        )
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO demands(
                    source, external_id, title, body, url, author, contact_url,
                    published_at, labels_json, engagement, explicit_request,
                    score, category, metadata_json, first_seen_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source, external_id) DO UPDATE SET
                    title=excluded.title, body=excluded.body, url=excluded.url,
                    author=excluded.author, contact_url=excluded.contact_url,
                    labels_json=excluded.labels_json, engagement=excluded.engagement,
                    score=excluded.score, category=excluded.category,
                    metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
                """,
                values,
            )
            row = db.execute(
                "SELECT id FROM demands WHERE source=? AND external_id=?",
                (demand.source, demand.external_id),
            ).fetchone()
            return int(row["id"])

    def top_candidates(self, limit: int = 20) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                """
                SELECT d.* FROM demands d
                LEFT JOIN products p ON p.demand_id=d.id
                WHERE p.id IS NULL AND d.score >= 60
                ORDER BY d.score DESC, d.published_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()

    def product_created_today(self) -> bool:
        today = dt.datetime.now(dt.timezone.utc).date().isoformat()
        with self.connect() as db:
            row = db.execute(
                """
                SELECT 1 FROM products
                WHERE status='launched' AND substr(created_at,1,10)=? LIMIT 1
                """,
                (today,),
            ).fetchone()
            return bool(row)

    def has_product_tool(self, tool: str) -> bool:
        with self.connect() as db:
            return bool(db.execute(
                "SELECT 1 FROM products WHERE tool=? AND status='launched' LIMIT 1", (tool,)
            ).fetchone())

    def create_product(self, demand: sqlite3.Row, template: dict[str, str]) -> sqlite3.Row:
        base = slugify(f"{template['tool']}-{demand['external_id']}")
        slug = f"{base}-{hashlib.sha256(demand['url'].encode()).hexdigest()[:6]}"
        timestamp = now_iso()
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO products(
                    demand_id, slug, name, promise, tool, source_title, source_url,
                    created_at, launched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    demand["id"], slug, template["name"], template["promise"],
                    template["tool"], demand["title"], demand["url"], timestamp, timestamp,
                ),
            )
            db.execute("UPDATE demands SET state='product_launched' WHERE id=?", (demand["id"],))
            return db.execute("SELECT * FROM products WHERE slug=?", (slug,)).fetchone()

    def queue_outreach(
        self,
        demand: sqlite3.Row,
        product: sqlite3.Row | None,
        message: str,
    ) -> bool:
        with self.connect() as db:
            cursor = db.execute(
                """
                INSERT OR IGNORE INTO outreach(
                    demand_id, product_id, channel, contact_url, message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    demand["id"], product["id"] if product else None, demand["source"],
                    demand["contact_url"], message, now_iso(),
                ),
            )
            return cursor.rowcount == 1

    def reusable_clusters(self) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                """
                SELECT category, count(DISTINCT author) author_count,
                       count(DISTINCT COALESCE(
                           json_extract(metadata_json, '$.repository_url'),
                           source || ':' || author
                       )) origin_count,
                       count(*) demand_count, avg(score) avg_score,
                       max(score) max_score
                FROM demands
                WHERE score >= 42 AND state NOT IN ('rejected', 'low_quality')
                GROUP BY category
                HAVING count(DISTINCT author) >= 3
                   AND count(DISTINCT COALESCE(
                       json_extract(metadata_json, '$.repository_url'),
                       source || ':' || author
                   )) >= 3
                ORDER BY (count(*) * 6 + avg(score)) DESC
                """
            ).fetchall()

    def maintain_catalog(self) -> None:
        with self.connect() as db:
            db.execute(
                """
                UPDATE demands SET state='low_quality', score=0
                WHERE lower(title) LIKE '%bounty alert%'
                   OR lower(title) LIKE '%opportunities found%'
                   OR lower(title) LIKE '%opportunityies found%'
                   OR lower(title) LIKE '%daily digest%'
                   OR lower(title) LIKE '%weekly digest%'
                   OR lower(COALESCE(
                       json_extract(metadata_json, '$.repository_url'), ''
                   )) LIKE '%bountyscout%'
                """
            )
            db.execute(
                """
                UPDATE outreach SET state='rejected'
                WHERE demand_id IN (
                    SELECT id FROM demands WHERE state='low_quality'
                ) AND state='queued'
                """
            )
            db.execute(
                "UPDATE products SET status='retired' WHERE tool NOT IN ('integration')"
            )
            db.execute(
                """
                UPDATE products SET
                    name='GitHub 开源项目企业采用审计',
                    promise='输入公开仓库，获得基于实时证据的采用评分、风险清单和落地建议',
                    source_title='基于多个独立公开需求信号',
                    source_url='/about'
                WHERE tool='integration'
                """
            )

    def track_product_event(
        self,
        product_id: int,
        kind: str,
        source: str = "direct",
        medium: str = "",
        campaign: str = "",
        detail: dict[str, Any] | None = None,
    ) -> None:
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO product_events(
                    product_id, kind, source, medium, campaign, detail_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product_id, clean(kind, 40), clean(source, 80) or "direct",
                    clean(medium, 80), clean(campaign, 120),
                    json.dumps(detail or {}, ensure_ascii=False), now_iso(),
                ),
            )

    def record_qualified_view(
        self,
        product_id: int,
        visitor_hash: str,
        source: str,
        medium: str = "",
        campaign: str = "",
    ) -> bool:
        today = dt.datetime.now(dt.timezone.utc).date().isoformat()
        with self.connect() as db:
            cursor = db.execute(
                """
                INSERT OR IGNORE INTO qualified_visitors(
                    product_id, visit_date, visitor_hash, source, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    product_id, today, clean(visitor_hash, 64),
                    clean(source, 80) or "direct", now_iso(),
                ),
            )
        if cursor.rowcount:
            self.track_product_event(
                product_id, "qualified_view", source, medium, campaign
            )
        return cursor.rowcount == 1

    def save_audit_report(
        self,
        product_id: int,
        report: dict[str, Any],
        source: str = "direct",
        is_public: bool = False,
        is_showcase: bool = False,
    ) -> str:
        prefix = slugify(report["repository"])
        digest = hashlib.sha256(
            f"{report['repository']}:{report['evidence_time']}".encode()
        ).hexdigest()[:10]
        token = f"{prefix}-{digest}"[:80]
        with self.connect() as db:
            db.execute(
                """
                INSERT OR IGNORE INTO audit_reports(
                    token, product_id, repository, repository_url, score, verdict,
                    report_json, is_public, is_showcase, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    token, product_id, report["repository"], report["url"],
                    int(report["score"]), report["verdict"],
                    json.dumps(report, ensure_ascii=False), int(is_public),
                    int(is_showcase),
                    clean(source, 80) or "direct", now_iso(),
                ),
            )
        return token

    def audit_report(self, token: str) -> sqlite3.Row | None:
        with self.connect() as db:
            return db.execute(
                "SELECT * FROM audit_reports WHERE token=?", (token,)
            ).fetchone()

    def public_audit_reports(self, limit: int = 20) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                """
                SELECT audit_reports.*,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.scenario_label'
                           ),
                           '内部效率工具'
                       ) scenario_label,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.scenario'
                           ),
                           'internal'
                       ) scenario,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.sensitivity'
                           ),
                           'public'
                       ) sensitivity,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.team_size'
                           ),
                           'solo'
                       ) team_size,
                       COALESCE(
                           json_extract(report_json, '$.adoption_threshold'),
                           65
                       ) adoption_threshold
                FROM audit_reports WHERE is_public=1
                ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()

    def professional_showcase(self) -> sqlite3.Row | None:
        with self.connect() as db:
            return db.execute(
                """
                SELECT audit_reports.*,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.scenario_label'
                           ),
                           '内部效率工具'
                       ) scenario_label
                FROM audit_reports
                WHERE is_public=1 AND is_showcase=1
                ORDER BY created_at DESC LIMIT 1
                """
            ).fetchone()

    def save_comparison_report(
        self,
        product_id: int,
        comparison: dict[str, Any],
        left_report_token: str,
        right_report_token: str,
        source: str = "direct",
        is_public: bool = False,
    ) -> str:
        repositories = sorted((
            comparison["left"]["repository"],
            comparison["right"]["repository"],
        ))
        context = comparison["adoption_context"]
        digest = hashlib.sha256(
            (
                f"{repositories[0]}:{repositories[1]}:"
                f"{context['scenario']}:{context['sensitivity']}:"
                f"{context['team_size']}:{comparison['evidence_time']}"
            ).encode()
        ).hexdigest()[:10]
        token = (
            f"{slugify(repositories[0])}-vs-{slugify(repositories[1])}-{digest}"
        )[:120]
        with self.connect() as db:
            db.execute(
                """
                INSERT OR IGNORE INTO comparison_reports(
                    token, product_id, left_report_token, right_report_token,
                    comparison_json, is_public, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    token,
                    product_id,
                    left_report_token,
                    right_report_token,
                    json.dumps(comparison, ensure_ascii=False),
                    int(is_public),
                    clean(source, 80) or "direct",
                    now_iso(),
                ),
            )
        return token

    def comparison_report(self, token: str) -> sqlite3.Row | None:
        with self.connect() as db:
            return db.execute(
                "SELECT * FROM comparison_reports WHERE token=?",
                (token,),
            ).fetchone()

    def public_comparison_reports(self, limit: int = 20) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                """
                SELECT comparison_reports.*,
                       json_extract(
                           comparison_json, '$.left.repository'
                       ) left_repository,
                       json_extract(
                           comparison_json, '$.right.repository'
                       ) right_repository,
                       json_extract(
                           comparison_json,
                           '$.adoption_context.scenario_label'
                       ) scenario_label,
                       json_extract(
                           comparison_json, '$.recommendation'
                       ) recommendation
                FROM comparison_reports
                WHERE is_public=1
                ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()

    def public_reports_for_context(
        self,
        context: dict[str, str],
        exclude_token: str = "",
        limit: int = 5,
    ) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                """
                SELECT * FROM audit_reports
                WHERE is_public=1 AND token!=?
                  AND COALESCE(
                    json_extract(
                      report_json, '$.adoption_context.scenario'
                    ), 'internal'
                  )=?
                  AND COALESCE(
                    json_extract(
                      report_json, '$.adoption_context.sensitivity'
                    ), 'public'
                  )=?
                  AND COALESCE(
                    json_extract(
                      report_json, '$.adoption_context.team_size'
                    ), 'solo'
                  )=?
                ORDER BY created_at DESC LIMIT ?
                """,
                (
                    exclude_token,
                    context["scenario"],
                    context["sensitivity"],
                    context["team_size"],
                    limit,
                ),
            ).fetchall()

    def public_repository_history(
        self,
        repository: str,
        limit: int = 30,
    ) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                """
                SELECT audit_reports.*,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.scenario_label'
                           ),
                           '内部效率工具'
                       ) scenario_label,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.scenario'
                           ),
                           'internal'
                       ) scenario,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.sensitivity'
                           ),
                           'public'
                       ) sensitivity,
                       COALESCE(
                           json_extract(
                               report_json,
                               '$.adoption_context.team_size'
                           ),
                           'solo'
                       ) team_size,
                       COALESCE(
                           json_extract(report_json, '$.adoption_threshold'),
                           65
                       ) adoption_threshold
                FROM audit_reports
                WHERE is_public=1 AND lower(repository)=lower(?)
                ORDER BY created_at DESC LIMIT ?
                """,
                (repository, limit),
            ).fetchall()

    def latest_public_repository_report(
        self,
        repository: str,
        context: dict[str, str],
    ) -> sqlite3.Row | None:
        rows = self.public_reports_for_context(context, limit=100)
        return next(
            (
                row for row in rows
                if row["repository"].lower() == repository.lower()
            ),
            None,
        )

    def public_sample_created_today(self) -> bool:
        today = dt.datetime.now(dt.timezone.utc).date().isoformat()
        with self.connect() as db:
            return bool(db.execute(
                """
                SELECT 1 FROM audit_reports
                WHERE is_public=1 AND substr(created_at,1,10)=? LIMIT 1
                """,
                (today,),
            ).fetchone())

    def touch_audit_report(self, token: str, kind: str) -> None:
        column = "downloads" if kind == "report_downloaded" else "views"
        with self.connect() as db:
            row = db.execute(
                "SELECT product_id FROM audit_reports WHERE token=?", (token,)
            ).fetchone()
            if not row:
                return
            db.execute(
                f"UPDATE audit_reports SET {column}={column}+1 WHERE token=?",
                (token,),
            )
        self.track_product_event(
            int(row["product_id"]), kind, "report", detail={"token": token}
        )

    def unlock_audit_report(
        self,
        token: str,
        payment_reference: str,
        amount_cents: int,
        currency: str = "cny",
        payment_source: str = "stripe",
    ) -> bool:
        currency = clean(currency, 3).lower()
        if currency not in ("cny", "usd"):
            return False
        newly_unlocked = False
        with self.connect() as db:
            row = db.execute(
                "SELECT product_id, pro_unlocked FROM audit_reports WHERE token=?",
                (token,),
            ).fetchone()
            if not row:
                return False
            if not row["pro_unlocked"]:
                newly_unlocked = True
                db.execute(
                    """
                    UPDATE audit_reports SET pro_unlocked=1, paid_at=?,
                        payment_reference=?, paid_currency=?,
                        paid_amount_cents=? WHERE token=?
                    """,
                    (
                        now_iso(),
                        clean(payment_reference, 200),
                        currency,
                        max(0, int(amount_cents)),
                        token,
                    ),
                )
                revenue_column = (
                    "revenue_usd_cents" if currency == "usd"
                    else "revenue_cents"
                )
                db.execute(
                    f"UPDATE products SET {revenue_column}="
                    f"{revenue_column}+? WHERE id=?",
                    (max(0, int(amount_cents)), row["product_id"]),
                )
        if newly_unlocked:
            self.track_product_event(
                int(row["product_id"]),
                "payment_confirmed",
                clean(payment_source, 40),
                detail={
                    "token": token,
                    "payment_reference": clean(payment_reference, 80),
                    "amount_cents": max(0, int(amount_cents)),
                    "currency": currency,
                },
            )
        return True

    def record_audit_refund(
        self,
        token: str,
        payment_reference: str,
        refunded_amount_cents: int,
        payment_source: str = "lemonsqueezy",
    ) -> bool:
        requested_total = max(0, int(refunded_amount_cents))
        applied = 0
        with self.connect() as db:
            row = db.execute(
                """
                SELECT product_id, payment_reference, paid_currency,
                       paid_amount_cents, refunded_amount_cents
                FROM audit_reports WHERE token=?
                """,
                (token,),
            ).fetchone()
            if (
                not row
                or row["paid_currency"] != "usd"
                or not secrets.compare_digest(
                    clean(row["payment_reference"], 200),
                    clean(payment_reference, 200),
                )
            ):
                return False
            paid_total = max(0, int(row["paid_amount_cents"] or 0))
            previous_total = max(
                0, int(row["refunded_amount_cents"] or 0)
            )
            new_total = min(paid_total, requested_total)
            applied = max(0, new_total - previous_total)
            if applied:
                db.execute(
                    """
                    UPDATE audit_reports
                    SET refunded_amount_cents=?, refunded_at=?
                    WHERE token=?
                    """,
                    (new_total, now_iso(), token),
                )
                db.execute(
                    """
                    UPDATE products
                    SET revenue_usd_cents=max(0, revenue_usd_cents-?)
                    WHERE id=?
                    """,
                    (applied, row["product_id"]),
                )
        if applied:
            self.track_product_event(
                int(row["product_id"]),
                "payment_refunded",
                clean(payment_source, 40),
                detail={
                    "token": token,
                    "payment_reference": clean(payment_reference, 80),
                    "refund_delta_cents": applied,
                    "refund_total_cents": requested_total,
                    "currency": "usd",
                },
            )
        return True

    def representative_demand(self, category: str) -> sqlite3.Row | None:
        with self.connect() as db:
            return db.execute(
                """
                SELECT d.* FROM demands d
                LEFT JOIN products p ON p.demand_id=d.id
                WHERE d.category=? AND p.id IS NULL
                ORDER BY d.score DESC, d.published_at DESC LIMIT 1
                """,
                (category,),
            ).fetchone()

    def dashboard(self) -> dict[str, Any]:
        with self.connect() as db:
            counts = {
                "demands": db.execute("SELECT count(*) c FROM demands").fetchone()["c"],
                "qualified": db.execute("SELECT count(*) c FROM demands WHERE score>=60").fetchone()["c"],
                "products": db.execute(
                    "SELECT count(*) c FROM products WHERE status='launched'"
                ).fetchone()["c"],
                "leads": db.execute("SELECT count(*) c FROM leads").fetchone()["c"],
                "outreach": db.execute("SELECT count(*) c FROM outreach").fetchone()["c"],
                "audits": db.execute(
                    "SELECT count(*) c FROM product_events WHERE kind='audit_completed'"
                ).fetchone()["c"],
            }
            demands = [dict(row) for row in db.execute(
                "SELECT * FROM demands ORDER BY score DESC, published_at DESC LIMIT 30"
            )]
            products = [dict(row) for row in db.execute(
                "SELECT * FROM products ORDER BY created_at DESC LIMIT 20"
            )]
            outreach = [dict(row) for row in db.execute(
                "SELECT * FROM outreach ORDER BY created_at DESC LIMIT 20"
            )]
            events = [dict(row) for row in db.execute(
                "SELECT * FROM events ORDER BY id DESC LIMIT 30"
            )]
            funnel = [dict(row) for row in db.execute(
                """
                SELECT kind, source, count(*) count
                FROM product_events GROUP BY kind, source
                ORDER BY count(*) DESC
                """
            )]
            experiment = {
                "qualified_views": db.execute(
                    "SELECT count(*) c FROM product_events WHERE kind='qualified_view'"
                ).fetchone()["c"],
                "qualified_audits": db.execute(
                    "SELECT count(*) c FROM product_events WHERE kind='qualified_audit'"
                ).fetchone()["c"],
                "purchase_intents": db.execute(
                    "SELECT count(*) c FROM leads"
                ).fetchone()["c"],
                "payments": db.execute(
                    """
                    SELECT count(*) c FROM audit_reports
                    WHERE paid_amount_cents IS NOT NULL
                      AND paid_amount_cents>refunded_amount_cents
                    """
                ).fetchone()["c"],
                "revenue_cny_cents": db.execute(
                    "SELECT coalesce(sum(revenue_cents),0) c FROM products"
                ).fetchone()["c"],
                "revenue_usd_cents": db.execute(
                    "SELECT coalesce(sum(revenue_usd_cents),0) c FROM products"
                ).fetchone()["c"],
            }
            experiment["status"] = commercial_experiment_status(experiment)
        return {
            "counts": counts, "demands": demands, "products": products,
            "outreach": outreach, "events": events, "funnel": funnel,
            "experiment": experiment,
        }

    def public_products(self) -> list[sqlite3.Row]:
        with self.connect() as db:
            return db.execute(
                "SELECT * FROM products WHERE status='launched' ORDER BY launched_at DESC"
            ).fetchall()

    def product(self, slug: str) -> sqlite3.Row | None:
        with self.connect() as db:
            return db.execute(
                "SELECT * FROM products WHERE slug=? AND status='launched'", (slug,)
            ).fetchone()

    def view_product(
        self,
        product_id: int,
        source: str = "direct",
        medium: str = "",
        campaign: str = "",
    ) -> None:
        with self.connect() as db:
            db.execute("UPDATE products SET views=views+1 WHERE id=?", (product_id,))
        self.track_product_event(product_id, "view", source, medium, campaign)

    def add_lead(self, product_id: int, name: str, contact: str, problem: str, ip: str) -> int:
        ip_hash = hashlib.sha256(f"{ip}:{os.environ.get('IP_HASH_SALT','local')}".encode()).hexdigest()
        with self.connect() as db:
            recent = db.execute(
                """
                SELECT count(*) c FROM leads
                WHERE source_ip_hash=? AND created_at>=?
                """,
                (ip_hash, (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat()),
            ).fetchone()["c"]
            if recent >= 3:
                raise ValueError("提交过于频繁")
            cursor = db.execute(
                """
                INSERT INTO leads(product_id, name, contact, problem, source_ip_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (product_id, clean(name, 80), clean(contact, 160), clean(problem, 1500), ip_hash, now_iso()),
            )
            db.execute("UPDATE products SET leads=leads+1 WHERE id=?", (product_id,))
            return int(cursor.lastrowid)


def classify(text: str) -> tuple[str, int]:
    lowered = text.lower()
    best = ("workflow-planner", 0)
    for key, template in PRODUCT_TEMPLATES.items():
        hits = sum(1 for keyword in template["keywords"] if keyword in lowered)
        if hits > best[1]:
            best = (key, hits)
    return best


def score_demand(demand: Demand) -> tuple[int, str]:
    text = f"{demand.title} {demand.body}".lower()
    category, category_hits = classify(text)
    if is_low_quality_demand(demand):
        return 0, category
    explicit = sum(1 for term in DEMAND_TERMS if term in text)
    buildable = sum(1 for term in BUILD_TERMS if term in text)
    recency = 15
    try:
        published = dt.datetime.fromisoformat(demand.published_at.replace("Z", "+00:00"))
        age_days = (dt.datetime.now(dt.timezone.utc) - published).total_seconds() / 86400
        recency = max(0, round(18 - age_days * 2))
    except ValueError:
        pass
    labels = set(demand.labels)
    paid_signal = any(
        marker in text or any(marker in label for label in labels)
        for marker in ("bounty", "reward", "paid", "budget", "悬赏", "付费", "预算")
    )
    score = (
        min(30, explicit * 12)
        + min(22, buildable * 4)
        + min(12, category_hits * 4)
        + min(10, demand.engagement)
        + recency
        + (8 if demand.contact_url else 0)
        + (18 if paid_signal else 0)
    )
    if demand.source == "github" and not paid_signal:
        score -= 8
    if not demand.explicit_request:
        score -= 18
    return max(0, min(100, score)), category


def is_low_quality_demand(demand: Demand) -> bool:
    text = f"{demand.title} {demand.body}".lower()
    repository = str(demand.metadata.get("repository_url") or "").lower()
    if any(pattern in text for pattern in LOW_QUALITY_PATTERNS):
        return True
    if demand.author.lower().endswith(("[bot]", "-bot", "_bot")):
        return True
    return "bountyscout" in repository


def collect_github() -> list[Demand]:
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)).date().isoformat()
    queries = [
        f'is:issue is:open created:>={since} label:"help wanted" (AI OR automation OR workflow)',
        f'is:issue is:open created:>={since} (bounty OR "request for" OR "looking for")',
        f'is:issue is:open created:>={since} (RAG OR agent OR integration) label:enhancement',
    ]
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    headers = {"X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    demands: list[Demand] = []
    seen: set[str] = set()
    for query in queries:
        url = "https://api.github.com/search/issues?" + urllib.parse.urlencode(
            {"q": query, "sort": "created", "order": "desc", "per_page": 30}
        )
        try:
            payload = request_json(url, headers)
        except (OSError, urllib.error.HTTPError, json.JSONDecodeError):
            continue
        for item in payload.get("items", []):
            external_id = str(item.get("id") or "")
            if not external_id or external_id in seen or item.get("pull_request"):
                continue
            seen.add(external_id)
            labels = [clean(label.get("name"), 80).lower() for label in item.get("labels", [])]
            title = clean(item.get("title"), 300)
            body = clean(item.get("body"), 4000)
            combined = f"{title} {body}".lower()
            explicit = bool(set(labels) & {"help wanted", "bounty"}) or any(term in combined for term in DEMAND_TERMS)
            demand = Demand(
                source="github",
                external_id=external_id,
                title=title,
                body=body,
                url=clean(item.get("html_url"), 500),
                author=clean((item.get("user") or {}).get("login"), 80),
                contact_url=clean(item.get("html_url"), 500),
                published_at=clean(item.get("created_at"), 80),
                labels=labels,
                engagement=int(item.get("comments") or 0),
                explicit_request=explicit,
                metadata={
                    "repository_url": item.get("repository_url"),
                    "comments_url": item.get("comments_url"),
                    "state_reason": item.get("state_reason"),
                },
            )
            if not is_low_quality_demand(demand):
                demands.append(demand)
    return demands


def collect_hacker_news() -> list[Demand]:
    try:
        ids = request_json("https://hacker-news.firebaseio.com/v0/askstories.json")[:80]
    except (OSError, urllib.error.HTTPError, json.JSONDecodeError):
        return []
    demands: list[Demand] = []

    def fetch(item_id: int) -> dict[str, Any] | None:
        try:
            return request_json(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json")
        except (OSError, urllib.error.HTTPError, json.JSONDecodeError):
            return None

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch, item_id): item_id for item_id in ids}
        items = [(futures[future], future.result()) for future in as_completed(futures)]
    for item_id, item in items:
        if not item:
            continue
        title = clean(item.get("title"), 300)
        body = clean(item.get("text"), 4000)
        combined = f"{title} {body}".lower()
        explicit = any(term in combined for term in DEMAND_TERMS)
        if not explicit:
            continue
        timestamp = dt.datetime.fromtimestamp(int(item.get("time") or 0), dt.timezone.utc).isoformat()
        discussion = f"https://news.ycombinator.com/item?id={item_id}"
        demands.append(Demand(
            source="hackernews",
            external_id=str(item_id),
            title=title,
            body=body,
            url=discussion,
            author=clean(item.get("by"), 80),
            contact_url=discussion,
            published_at=timestamp,
            labels=["ask hn"],
            engagement=int(item.get("descendants") or 0),
            explicit_request=True,
            metadata={"score": item.get("score"), "type": item.get("type")},
        ))
    return demands


def parse_github_repository(value: str) -> tuple[str, str]:
    candidate = clean(value, 300).strip().removesuffix(".git").rstrip("/")
    match = re.fullmatch(
        r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)",
        candidate,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError("请输入完整的公开 GitHub 仓库地址")
    return match.group(1), match.group(2)


def github_headers() -> dict[str, str]:
    headers = {"X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def request_json_optional(url: str, headers: dict[str, str]) -> Any | None:
    try:
        return request_json(url, headers)
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 404):
            return None
        raise


def fetch_openssf_scorecard(owner: str, repository: str) -> dict[str, Any] | None:
    try:
        result = request_json(
            f"https://api.securityscorecards.dev/projects/github.com/"
            f"{urllib.parse.quote(owner)}/{urllib.parse.quote(repository)}",
            timeout=20,
        )
    except (OSError, urllib.error.HTTPError, json.JSONDecodeError):
        return None
    checks = []
    for item in result.get("checks") or []:
        score = int(item.get("score") if item.get("score") is not None else -1)
        checks.append({
            "name": clean(item.get("name"), 80),
            "score": score,
            "reason": clean(item.get("reason"), 500),
            "documentation": clean(
                (item.get("documentation") or {}).get("url"), 500
            ),
        })
    return {
        "score": float(result.get("score") or 0),
        "date": clean(result.get("date"), 40),
        "version": clean((result.get("scorecard") or {}).get("version"), 100),
        "checks": checks,
    }


def security_remediation(check: dict[str, Any]) -> str:
    actions = {
        "Branch-Protection": "为默认分支启用必需审查、状态检查和管理员保护",
        "Code-Review": "要求所有生产变更经过至少一名独立审查者",
        "Dangerous-Workflow": "移除 pull_request_target 等工作流中的不可信代码执行",
        "Dependency-Update-Tool": "启用 Dependabot 或 Renovate 并设定升级 SLA",
        "Pinned-Dependencies": "将 CI Action 与构建依赖固定到不可变提交摘要",
        "SAST": "在所有提交上运行静态安全扫描并阻断高危问题",
        "Fuzzing": "为高风险解析和输入边界接入持续模糊测试",
        "Signed-Releases": "为发布产物增加签名或 SLSA provenance",
        "Token-Permissions": "将 GitHub Actions token 默认权限降为只读并逐项授权",
        "Vulnerabilities": "修复或隔离仍开放的已知高危漏洞",
        "Binary-Artifacts": "移除无法从源码复现的二进制制品",
        "Security-Policy": "增加 SECURITY.md、响应窗口和私密披露通道",
    }
    return actions.get(
        check["name"],
        f"依据 OpenSSF {check['name']} 检查原因补齐安全控制",
    )


def normalize_adoption_context(context: dict[str, str] | None = None) -> dict[str, str]:
    context = context or {}
    allowed = {
        "scenario": {
            "internal": "内部效率工具",
            "customer": "面向客户的生产系统",
            "agent": "可执行操作的 AI Agent",
        },
        "sensitivity": {
            "public": "仅公开数据",
            "internal": "企业内部数据",
            "sensitive": "敏感或受监管数据",
        },
        "team_size": {
            "solo": "1 人",
            "small": "2-10 人",
            "large": "11 人以上",
        },
    }
    normalized: dict[str, str] = {}
    for key, options in allowed.items():
        value = clean(context.get(key), 20)
        normalized[key] = value if value in options else next(iter(options))
        normalized[f"{key}_label"] = options[normalized[key]]
    return normalized


def contextual_adoption_gate(
    score: int,
    context: dict[str, str],
) -> tuple[int, str, list[dict[str, str]]]:
    threshold = 65
    if context["scenario"] in {"customer", "agent"}:
        threshold += 8
    if context["sensitivity"] == "internal":
        threshold += 5
    elif context["sensitivity"] == "sensitive":
        threshold += 15
    if context["team_size"] == "solo":
        threshold += 5
    threshold = min(90, threshold)
    gates = [
        {
            "priority": "P0",
            "task": "用一个真实业务样例完成隔离环境验证",
            "gate": "输入、输出、失败路径和人工接管均有可复现证据",
        },
    ]
    if context["scenario"] == "customer":
        gates.append({
            "priority": "P0",
            "task": "建立发布回滚、SLA 和客户影响监控",
            "gate": "故障演练能在目标恢复时间内完成回滚",
        })
    if context["scenario"] == "agent":
        gates.append({
            "priority": "P0",
            "task": "限制 Agent 工具权限并增加高风险操作确认",
            "gate": "越权、提示注入和失控循环测试全部通过",
        })
    if context["sensitivity"] in {"internal", "sensitive"}:
        gates.append({
            "priority": "P0",
            "task": "完成数据流、保存位置和第三方传输审查",
            "gate": "敏感字段有最小化、加密、删除和审计策略",
        })
    if context["team_size"] == "solo":
        gates.append({
            "priority": "P1",
            "task": "准备单人可执行的备份、升级和故障手册",
            "gate": "无人协助时可在 30 分钟内恢复核心服务",
        })
    verdict = (
        "达到当前场景的试点门槛"
        if score >= threshold
        else f"未达到当前场景门槛，还差 {threshold - score} 分"
    )
    return threshold, verdict, gates


def audit_github_repository(
    value: str,
    context: dict[str, str] | None = None,
) -> dict[str, Any]:
    owner, repository = parse_github_repository(value)
    api = f"https://api.github.com/repos/{owner}/{repository}"
    headers = github_headers()
    try:
        repo = request_json(api, headers)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError("仓库不存在、不是公开仓库，或 GitHub 暂时无法访问") from exc
        raise ValueError("GitHub API 暂时不可用，请稍后重试") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("无法读取 GitHub 仓库，请稍后重试") from exc

    default_branch = clean(repo.get("default_branch") or "main", 100)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {
            "root": pool.submit(request_json_optional, f"{api}/contents", headers),
            "release": pool.submit(request_json_optional, f"{api}/releases/latest", headers),
            "community": pool.submit(request_json_optional, f"{api}/community/profile", headers),
            "tree": pool.submit(
                request_json_optional,
                f"{api}/git/trees/{urllib.parse.quote(default_branch)}?recursive=1",
                headers,
            ),
            "scorecard": pool.submit(
                fetch_openssf_scorecard, owner, repository
            ),
        }
        extras = {name: future.result() for name, future in futures.items()}

    root_files = {
        str(item.get("name") or "").lower()
        for item in (extras["root"] or [])
        if isinstance(item, dict)
    }
    tree_paths = {
        str(item.get("path") or "").lower()
        for item in ((extras["tree"] or {}).get("tree") or [])
        if isinstance(item, dict)
    }
    all_basenames = {path.rsplit("/", 1)[-1] for path in tree_paths} | root_files
    community = extras["community"] or {}
    pushed_at = str(repo.get("pushed_at") or "")
    try:
        pushed = dt.datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        inactive_days = max(0, int((dt.datetime.now(dt.timezone.utc) - pushed).total_seconds() / 86400))
    except ValueError:
        inactive_days = 9999

    has_license = bool((repo.get("license") or {}).get("spdx_id") not in (None, "NOASSERTION"))
    has_readme = "readme.md" in root_files or bool(community.get("files", {}).get("readme"))
    has_ci = any(path.startswith(".github/workflows/") for path in tree_paths)
    has_container = bool(all_basenames.intersection({
        "dockerfile", "docker-compose.yml", "compose.yml", "compose.yaml",
    }))
    has_package = bool(all_basenames.intersection({
        "package.json", "pyproject.toml", "requirements.txt", "go.mod",
        "cargo.toml", "pom.xml", "build.gradle",
    }))
    has_tests = any(
        segment in {"tests", "test", "__tests__", "spec"}
        for path in tree_paths
        for segment in path.split("/")[:-1]
    )
    has_release = bool(extras["release"])

    checks = [
        ("许可证明确", has_license, 10, "确认许可证允许你的商业使用和修改方式"),
        ("90 天内持续维护", inactive_days <= 90, 10, "仓库长期不活跃，生产采用需要维护兜底"),
        ("安装与依赖清单", has_package, 6, "缺少标准依赖清单，部署复现成本较高"),
        ("README 文档", has_readme, 4, "缺少基础使用文档，团队接入成本较高"),
        ("正式版本发布", has_release, 4, "没有正式 Release，版本升级和回滚风险较高"),
        ("持续集成线索", has_ci, 5, "仓库树未发现 .github/workflows，需要人工确认测试门禁"),
        ("容器化入口", has_container, 3, "仓库树未发现 Docker/Compose，生产部署需要额外封装"),
        ("测试目录", has_tests, 8, "仓库树未发现测试目录，需要人工核验覆盖率"),
    ]
    engineering_score = sum(
        weight for _label, passed, weight, _risk in checks[2:] if passed
    )
    maintenance_score = (
        (10 if inactive_days <= 90 else 0)
        + (5 if has_release else 0)
        + (5 if int(repo.get("stargazers_count") or 0) >= 100 else 0)
    )
    license_score = 10 if has_license else 0
    scorecard = extras["scorecard"]
    security_score = round(float(scorecard["score"]) * 4) if scorecard else (
        20 + (8 if has_ci else 0) + (6 if has_tests else 0)
    )
    security_score = max(0, min(40, security_score))
    score = license_score + maintenance_score + engineering_score + security_score
    risks = [risk for _label, passed, _weight, risk in checks if not passed]
    security_failures = sorted(
        [
            {
                **item,
                "action": security_remediation(item),
                "priority": "P0" if item["score"] <= 2 else "P1",
            }
            for item in (scorecard["checks"] if scorecard else [])
            if 0 <= item["score"] < 7
        ],
        key=lambda item: item["score"],
    )
    risks.extend(
        f"OpenSSF {item['name']} {item['score']}/10：{item['reason']}"
        for item in security_failures[:3]
    )
    if repo.get("archived"):
        score = min(score, 35)
        risks.insert(0, "仓库已归档，不建议作为新生产系统的核心依赖")
    if int(repo.get("open_issues_count") or 0) > 200:
        risks.append("开放问题较多，需要抽样检查维护响应速度")
    score = max(0, min(100, score))
    adoption_context = normalize_adoption_context(context)
    threshold, verdict, context_gates = contextual_adoption_gate(
        score, adoption_context
    )
    security_plan_limit = max(0, 7 - len(context_gates))
    remediation_plan = [
        {
            "day": index + 1,
            "priority": item["priority"],
            "task": item["action"],
            "gate": f"{item['name']} 风险有负责人、证据和接受/修复结论",
        }
        for index, item in enumerate(security_failures[:security_plan_limit])
    ]
    for gate in context_gates:
        remediation_plan.append({
            "day": len(remediation_plan) + 1,
            **gate,
        })
    return {
        "repository": f"{owner}/{repository}",
        "url": str(repo.get("html_url") or f"https://github.com/{owner}/{repository}"),
        "description": clean(repo.get("description"), 500),
        "score": score,
        "verdict": verdict,
        "stars": int(repo.get("stargazers_count") or 0),
        "forks": int(repo.get("forks_count") or 0),
        "open_issues": int(repo.get("open_issues_count") or 0),
        "inactive_days": inactive_days,
        "license": clean((repo.get("license") or {}).get("spdx_id") or "未识别", 80),
        "language": clean(repo.get("language") or "未识别", 80),
        "checks": [
            {"label": label, "passed": passed, "weight": weight}
            for label, passed, weight, _risk in checks
        ],
        "pillars": [
            {"label": "供应链安全", "score": security_score, "max": 40},
            {"label": "工程准备度", "score": engineering_score, "max": 30},
            {"label": "维护与采用", "score": maintenance_score, "max": 20},
            {"label": "许可证清晰度", "score": license_score, "max": 10},
        ],
        "openssf": scorecard,
        "security_failures": security_failures,
        "remediation_plan": remediation_plan,
        "adoption_context": adoption_context,
        "adoption_threshold": threshold,
        "risks": risks[:8],
        "confidence": "高" if scorecard else "中",
        "evidence_sources": [
            "GitHub REST API",
            "OpenSSF Scorecard" if scorecard else "GitHub 工程信号代理",
        ],
        "evidence_time": now_iso(),
    }


def compare_adoption_reports(
    left: dict[str, Any],
    right: dict[str, Any],
) -> dict[str, Any]:
    left_context = normalize_adoption_context(left.get("adoption_context"))
    right_context = normalize_adoption_context(right.get("adoption_context"))
    context_keys = ("scenario", "sensitivity", "team_size")
    if any(left_context[key] != right_context[key] for key in context_keys):
        raise ValueError("两个仓库必须使用相同业务场景、数据敏感度和团队规模")
    if left["repository"].lower() == right["repository"].lower():
        raise ValueError("请输入两个不同的 GitHub 仓库")

    threshold = max(
        int(left.get("adoption_threshold") or 65),
        int(right.get("adoption_threshold") or 65),
    )
    left_score = int(left["score"])
    right_score = int(right["score"])
    left_passes = left_score >= threshold
    right_passes = right_score >= threshold
    score_delta = abs(left_score - right_score)

    if left_passes != right_passes:
        winner = "left" if left_passes else "right"
        selected = left if left_passes else right
        recommendation = (
            f"优先验证 {selected['repository']}：它达到当前场景 "
            f"{threshold} 分门槛，另一候选尚未达到。"
        )
    elif left_passes and right_passes and score_delta >= 5:
        winner = "left" if left_score > right_score else "right"
        selected = left if winner == "left" else right
        recommendation = (
            f"两者都达到门槛，优先验证 {selected['repository']}："
            f"公开证据评分领先 {score_delta} 分。"
        )
    elif left_passes and right_passes:
        winner = "tie"
        recommendation = (
            "两者都达到门槛且公开证据差距不足 5 分，"
            "不应仅凭评分选型；请用同一个业务样例做限时试点。"
        )
    else:
        winner = "none"
        recommendation = (
            f"两者都未达到当前场景 {threshold} 分门槛，"
            "不建议直接进入生产；先处理各自 P0 阻塞项。"
        )

    left_pillars = {
        item["label"]: int(item["score"])
        for item in left.get("pillars") or []
    }
    right_pillars = {
        item["label"]: int(item["score"])
        for item in right.get("pillars") or []
    }
    labels = list(dict.fromkeys([*left_pillars, *right_pillars]))
    pillar_comparison = [
        {
            "label": label,
            "left": left_pillars.get(label, 0),
            "right": right_pillars.get(label, 0),
            "leader": (
                "tie"
                if left_pillars.get(label, 0) == right_pillars.get(label, 0)
                else (
                    "left"
                    if left_pillars.get(label, 0)
                    > right_pillars.get(label, 0)
                    else "right"
                )
            ),
        }
        for label in labels
    ]
    return {
        "left": {
            "repository": left["repository"],
            "url": left["url"],
            "score": left_score,
            "verdict": left["verdict"],
            "license": left["license"],
            "inactive_days": left["inactive_days"],
            "risks": (left.get("risks") or [])[:3],
            "passes": left_passes,
        },
        "right": {
            "repository": right["repository"],
            "url": right["url"],
            "score": right_score,
            "verdict": right["verdict"],
            "license": right["license"],
            "inactive_days": right["inactive_days"],
            "risks": (right.get("risks") or [])[:3],
            "passes": right_passes,
        },
        "winner": winner,
        "recommendation": recommendation,
        "adoption_context": left_context,
        "adoption_threshold": threshold,
        "pillar_comparison": pillar_comparison,
        "evidence_time": now_iso(),
    }


class Factory:
    def __init__(self, store: Store):
        self.store = store

    def collect(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for name, collector in (("github", collect_github), ("hackernews", collect_hacker_news)):
            try:
                rows = collector()
                for demand in rows:
                    score, category = score_demand(demand)
                    self.store.upsert_demand(demand, score, category)
                counts[name] = len(rows)
                self.store.event("collection", {"source": name, "count": len(rows)})
            except Exception as exc:
                counts[name] = 0
                self.store.event("collection_error", {"source": name, "error": clean(exc, 500)})
        return counts

    def prepare_outreach(self) -> int:
        queued = 0
        for demand in self.store.top_candidates(20):
            labels = set(json.loads(demand["labels_json"]))
            paid = any(
                marker in " ".join(labels)
                for marker in ("bounty", "reward", "paid", "maybe rewarded")
            )
            if demand["source"] != "github" or not paid:
                continue
            message = (
                f"你好，我是 Opportunity Factory，一个透明标识的自动化交付实验。"
                f"看到你公开征集“{demand['title']}”。我们可以先交付一个固定范围、可验收的最小实现。"
                f"需求与进展会公开记录在 {PUBLIC_URL}。如果这不符合你的预期，请忽略；系统不会重复联系。"
            )
            if self.store.queue_outreach(demand, None, message):
                queued += 1
        return queued

    def build(self, force: bool = False) -> sqlite3.Row | None:
        if self.store.product_created_today() and not force:
            return None
        clusters = self.store.reusable_clusters()
        if not clusters:
            self.store.event("decision", {"result": "no_repeated_problem_cluster"})
            return None
        selected: tuple[sqlite3.Row, sqlite3.Row, dict[str, str]] | None = None
        for cluster in clusters:
            template = PRODUCT_TEMPLATES.get(cluster["category"], PRODUCT_TEMPLATES["workflow-planner"])
            if template["tool"] not in IMPLEMENTED_PRODUCT_TOOLS:
                continue
            if self.store.has_product_tool(template["tool"]):
                continue
            demand = self.store.representative_demand(cluster["category"])
            if demand:
                selected = (cluster, demand, template)
                break
        if not selected:
            self.store.event("decision", {"result": "all_repeated_clusters_already_served"})
            return None
        cluster, demand, template = selected
        product = self.store.create_product(demand, template)
        tracked_url = (
            f"{PUBLIC_URL}/p/{product['slug']}?"
            f"utm_source=github&utm_medium=issue&utm_campaign=demand_{demand['id']}"
        )
        message = (
            f"你好，我是 Opportunity Factory，一个透明标识的自动化产品实验。"
            f"看到你公开提出“{demand['title']}”。系统发现至少 {cluster['author_count']} 位独立用户提出了同类问题，"
            f"因此上线了一个可直接体验的最小工具："
            f"{tracked_url} 。如果不希望收到后续回复，请忽略本消息；系统不会再次联系。"
        )
        self.store.queue_outreach(demand, product, message)
        self.store.event("product_launched", {
            "product": product["slug"], "demand": demand["url"], "score": demand["score"],
            "cluster_size": cluster["demand_count"], "independent_authors": cluster["author_count"],
        })
        promoted = submit_indexnow([
            f"{PUBLIC_URL}/p/{product['slug']}",
            f"{PUBLIC_URL}/updates",
            f"{PUBLIC_URL}/sitemap.xml",
        ])
        self.store.event("promotion_indexnow", {
            "product": product["slug"], "submitted": promoted,
        })
        return product

    def publish_daily_sample(self) -> str | None:
        if self.store.public_sample_created_today():
            return None
        products = self.store.public_products()
        product = next((row for row in products if row["tool"] == "integration"), None)
        if not product:
            return None
        day_index = dt.datetime.now(dt.timezone.utc).date().toordinal()
        repository = PUBLIC_SAMPLE_REPOSITORIES[day_index % len(PUBLIC_SAMPLE_REPOSITORIES)]
        adoption_context = PUBLIC_SAMPLE_CONTEXTS[
            day_index % len(PUBLIC_SAMPLE_CONTEXTS)
        ]
        try:
            report = audit_github_repository(
                f"https://github.com/{repository}",
                adoption_context,
            )
        except ValueError as exc:
            self.store.event(
                "sample_report_error", {"repository": repository, "error": str(exc)}
            )
            return None
        token = self.store.save_audit_report(
            int(product["id"]),
            report,
            source="daily_sample",
            is_public=True,
            is_showcase=self.store.professional_showcase() is None,
        )
        url = f"{PUBLIC_URL}/r/{token}"
        promoted_urls = [
            url,
            f"{PUBLIC_URL}/reports",
            f"{PUBLIC_URL}/sitemap.xml",
        ]
        comparison_token = ""
        matching_reports = self.store.public_reports_for_context(
            report["adoption_context"],
            exclude_token=token,
            limit=1,
        )
        if matching_reports:
            other_row = matching_reports[0]
            other_report = json.loads(other_row["report_json"])
            comparison = compare_adoption_reports(other_report, report)
            comparison_token = self.store.save_comparison_report(
                int(product["id"]),
                comparison,
                other_row["token"],
                token,
                source="daily_sample",
                is_public=True,
            )
            promoted_urls.extend([
                f"{PUBLIC_URL}/c/{comparison_token}",
                f"{PUBLIC_URL}/compare",
            ])
        submitted = submit_indexnow(promoted_urls)
        websub = notify_websub()
        self.store.event(
            "sample_report_published",
            {
                "repository": repository, "url": url,
                "scenario": (
                    report.get("adoption_context") or adoption_context
                )["scenario"],
                "comparison": comparison_token,
                "indexnow": submitted, "websub": websub,
            },
        )
        return token

    def dispatch_outreach(self) -> int:
        if os.environ.get("ALLOW_AUTONOMOUS_OUTREACH") != "1":
            return 0
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if not token:
            return 0
        today = dt.datetime.now(dt.timezone.utc).date().isoformat()
        with self.store.connect() as db:
            sent_today = db.execute(
                "SELECT count(*) c FROM outreach WHERE sent_at LIKE ? AND state='sent'",
                (f"{today}%",),
            ).fetchone()["c"]
            rows = db.execute(
                """
                SELECT o.*, d.labels_json, d.metadata_json FROM outreach o
                JOIN demands d ON d.id=o.demand_id
                WHERE o.state='queued' AND o.channel='github'
                ORDER BY o.id LIMIT ?
                """,
                (max(0, 2 - sent_today),),
            ).fetchall()
        sent = 0
        for row in rows:
            labels = set(json.loads(row["labels_json"]))
            if not labels.intersection({"help wanted", "bounty"}):
                continue
            comments_url = json.loads(row["metadata_json"]).get("comments_url")
            if not comments_url:
                continue
            data = json.dumps({"body": row["message"]}, ensure_ascii=False).encode()
            request = urllib.request.Request(
                comments_url,
                data=data,
                method="POST",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                    "User-Agent": USER_AGENT,
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=20):
                    pass
            except (OSError, urllib.error.HTTPError):
                continue
            with self.store.connect() as db:
                db.execute(
                    "UPDATE outreach SET state='sent', sent_at=? WHERE id=?",
                    (now_iso(), row["id"]),
                )
            sent += 1
        return sent

    def run_once(self, force_build: bool = False) -> dict[str, Any]:
        self.store.maintain_catalog()
        collected = self.collect()
        queued = self.prepare_outreach()
        product = self.build(force_build)
        sample_report = self.publish_daily_sample()
        sent = self.dispatch_outreach()
        result = {
            "collected": collected,
            "outreach_queued": queued,
            "product": dict(product) if product else None,
            "sample_report": sample_report,
            "outreach_sent": sent,
        }
        self.store.event("cycle_complete", result)
        return result


def page_shell(
    title: str,
    content: str,
    description: str = "",
    canonical_path: str = "",
    structured_data: dict[str, Any] | None = None,
) -> bytes:
    canonical_url = (
        f"{PUBLIC_URL}{canonical_path}" if canonical_path else PUBLIC_URL
    )
    schema = (
        '<script type="application/ld+json">'
        + json.dumps(structured_data, ensure_ascii=False).replace("</", "<\\/")
        + "</script>"
        if structured_data else ""
    )
    document = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="{html.escape(description or title)}">
<link rel="canonical" href="{html.escape(canonical_url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Life You Me">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description or title)}">
<meta property="og:url" content="{html.escape(canonical_url)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(description or title)}">{schema}
<link rel="alternate" type="application/rss+xml" title="Life You Me 产品与报告更新" href="{PUBLIC_URL}/feed.xml">
<title>{html.escape(title)} · Life You Me</title>
<style>
:root{{--bg:#f3f5f7;--panel:#fff;--text:#20242a;--muted:#6e7681;--line:#dfe3e8;--green:#147764;--soft:#e9f4f1;--blue:#3569b8}}
@media(prefers-color-scheme:dark){{:root{{--bg:#17191c;--panel:#24272b;--text:#f3f4f5;--muted:#a0a7b0;--line:#383d43;--green:#5bc1a9;--soft:#213b35;--blue:#83a9e8}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}}
a{{color:inherit}}header{{height:58px;display:flex;align-items:center;gap:10px;padding:0 max(20px,calc((100% - 1080px)/2));background:var(--panel);border-bottom:1px solid var(--line)}}
header b{{font-size:14px}}header span{{color:var(--muted);font-size:10px}}nav{{margin-left:auto;display:flex;gap:16px}}nav a{{color:var(--muted);text-decoration:none;font-size:11px}}
main{{width:min(1080px,calc(100% - 32px));margin:0 auto;padding:40px 0 80px}}h1{{font-size:34px;line-height:1.2;letter-spacing:0;margin:8px 0 12px}}h2{{font-size:18px}}p{{color:var(--muted)}}.eyebrow{{color:var(--green);font-size:10px;font-weight:750;text-transform:uppercase}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.card{{padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}}.card h3{{margin:0 0 6px;font-size:15px}}.card p{{margin:0;font-size:11px}}.card a{{display:inline-block;margin-top:12px;color:var(--blue);font-size:11px}}
.hero{{padding:36px 0 28px;border-bottom:1px solid var(--line)}}.hero p{{max-width:720px;font-size:15px}}.tool{{display:grid;grid-template-columns:1fr 340px;gap:24px;margin-top:28px}}.panel{{padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}}
label{{display:block;margin:11px 0 4px;font-size:10px;color:var(--muted)}}input,textarea,select{{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}}textarea{{min-height:90px;resize:vertical}}button{{margin-top:14px;padding:10px 14px;border:0;border-radius:6px;background:var(--text);color:var(--panel);font-weight:700;cursor:pointer}}.result{{padding:14px;border-left:3px solid var(--green);background:var(--soft)}}.source{{margin-top:20px;padding-top:15px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}}.notice{{font-size:10px;color:var(--muted)}}.stats{{display:flex;gap:18px;margin-top:18px}}.stats b{{font-size:22px}}.stats span{{display:block;color:var(--muted);font-size:9px}}
.guide-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}}.guide{{padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}}.guide.recommended{{border-top:3px solid var(--green)}}.guide-tag{{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--soft);color:var(--green);font-size:9px;font-weight:700}}.guide h3{{margin:9px 0 4px;font-size:16px}}.guide>p{{margin:0;font-size:11px}}.steps{{display:grid;gap:11px;margin:18px 0}}.step{{display:grid;grid-template-columns:24px 1fr;gap:9px;align-items:start}}.step b{{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--soft);color:var(--green);font-size:10px}}.step span{{padding-top:2px;font-size:11px}}.guide-actions{{display:flex;gap:8px;flex-wrap:wrap}}.guide-actions a{{padding:8px 11px;border:1px solid var(--line);border-radius:6px;color:var(--text);text-decoration:none;font-size:10px;font-weight:700}}.guide-actions a.primary{{border-color:var(--text);background:var(--text);color:var(--panel)}}.guide-note{{margin-top:12px;padding:9px 10px;border-left:3px solid var(--blue);background:var(--bg);color:var(--muted);font-size:10px}}
.audit-form{{display:grid;gap:8px}}.audit-form button{{width:100%}}.deliverables{{display:grid;gap:8px;margin:14px 0}}.deliverable{{display:grid;grid-template-columns:18px 1fr;gap:7px;font-size:11px}}.deliverable b{{color:var(--green)}}.price{{display:flex;align-items:end;gap:6px;margin:12px 0}}.price strong{{font-size:28px;line-height:1}}.price span{{color:var(--muted);font-size:10px}}.score-hero{{display:grid;grid-template-columns:120px 1fr;gap:20px;align-items:center}}.score-ring{{display:grid;place-items:center;width:120px;height:120px;border:10px solid var(--green);border-radius:50%;font-size:30px;font-weight:800}}.score-ring small{{display:block;font-size:9px;color:var(--muted)}}.metric-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}}.metric-box{{padding:12px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}}.metric-box small{{display:block;color:var(--muted);font-size:9px}}.metric-box b{{font-size:15px}}.check-list{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}.check{{padding:10px;border:1px solid var(--line);border-radius:6px;font-size:11px}}.check.pass{{border-left:3px solid var(--green)}}.check.fail{{border-left:3px solid #b44}}.risk-list{{padding-left:19px;color:var(--muted)}}.evidence-time{{font-size:9px;color:var(--muted)}}.compare-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}.compare-choice{{padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}}.compare-choice.pass{{border-top:3px solid var(--green)}}.compare-score{{font-size:30px;font-weight:800}}.decision{{padding:18px;border-left:4px solid var(--green);background:var(--soft);margin:20px 0}}
table{{width:100%;border-collapse:collapse;background:var(--panel);font-size:11px}}th,td{{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{color:var(--muted)}}.badge{{padding:2px 6px;border-radius:4px;background:var(--soft);color:var(--green);white-space:nowrap}}
@media(max-width:760px){{.grid,.guide-grid,.check-list,.compare-grid{{grid-template-columns:1fr}}.tool,.score-hero{{grid-template-columns:1fr}}.metric-grid{{grid-template-columns:1fr 1fr}}h1{{font-size:28px}}nav{{display:none}}.guide{{padding:17px}}table{{display:block;max-width:100%;overflow-x:auto}}select,button,.guide-actions a{{min-height:44px}}button,.guide-actions a{{display:inline-flex;align-items:center;justify-content:center}}}}
</style></head><body><header><b>Life You Me</b><span>Open Source Adoption Decisions</span><nav><a href="/">单仓库</a><a href="/compare">候选对比</a><a href="/reports">报告库</a><a href="/updates">订阅</a><a href="/about">关于</a></nav></header><main>{content}</main></body></html>"""
    return document.encode("utf-8")


def build_feed(
    products: list[sqlite3.Row],
    reports: list[sqlite3.Row] | None = None,
    comparisons: list[sqlite3.Row] | None = None,
) -> bytes:
    product_items = "".join(
        f"<item><title>{html.escape(row['name'])}</title>"
        f"<link>{PUBLIC_URL}/p/{row['slug']}</link>"
        f"<guid>{PUBLIC_URL}/p/{row['slug']}</guid>"
        f"<description>{html.escape(row['promise'])}</description></item>"
        for row in products
    )
    report_items = "".join(
        f"<item><title>{html.escape(row['repository'])} 用于"
        f"{html.escape(row['scenario_label'])}的采用报告</title>"
        f"<link>{PUBLIC_URL}/r/{row['token']}</link>"
        f"<guid>{PUBLIC_URL}/r/{row['token']}</guid>"
        f"<description>{html.escape(row['verdict'])}，综合得分 {row['score']}/100</description>"
        f"<pubDate>{html.escape(email.utils.format_datetime(dt.datetime.fromisoformat(row['created_at'])))}</pubDate></item>"
        for row in (reports or [])
    )
    comparison_items = "".join(
        f"<item><title>{html.escape(row['left_repository'])} vs "
        f"{html.escape(row['right_repository'])}："
        f"{html.escape(row['scenario_label'])}的采用对比</title>"
        f"<link>{PUBLIC_URL}/c/{row['token']}</link>"
        f"<guid>{PUBLIC_URL}/c/{row['token']}</guid>"
        f"<description>{html.escape(row['recommendation'])}</description>"
        f"<pubDate>{html.escape(email.utils.format_datetime(dt.datetime.fromisoformat(row['created_at'])))}</pubDate></item>"
        for row in (comparisons or [])
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<?xml-stylesheet type="text/xsl" href="/rss.xsl"?>'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        '<title>Life You Me 产品更新</title>'
        f'<link>{PUBLIC_URL}</link>'
        f'<atom:link href="{PUBLIC_URL}/feed.xml" rel="self" type="application/rss+xml"/>'
        '<atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/>'
        '<description>自动发现真实需求并上线的微产品</description>'
        f'{comparison_items}{report_items}{product_items}</channel></rss>'
    ).encode("utf-8")


def rss_stylesheet() -> bytes:
    return """<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8"/>
<xsl:template match="/">
<html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>订阅产品更新 · Life You Me</title>
<style>
:root{--bg:#f3f5f7;--panel:#fff;--text:#20242a;--muted:#6e7681;--line:#dfe3e8;--green:#147764;--soft:#e9f4f1;--blue:#3569b8}
@media(prefers-color-scheme:dark){:root{--bg:#17191c;--panel:#24272b;--text:#f3f4f5;--muted:#a0a7b0;--line:#383d43;--green:#5bc1a9;--soft:#213b35;--blue:#83a9e8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
header{height:58px;display:flex;align-items:center;gap:10px;padding:0 max(20px,calc((100% - 900px)/2));background:var(--panel);border-bottom:1px solid var(--line)}
header b{font-size:14px}header span{color:var(--muted);font-size:10px}header a{margin-left:auto;color:var(--muted);text-decoration:none;font-size:11px}
main{width:min(900px,calc(100% - 32px));margin:0 auto;padding:48px 0 80px}.eyebrow{color:var(--green);font-size:10px;font-weight:750;text-transform:uppercase}
h1{margin:7px 0 10px;font-size:34px;line-height:1.2}p{color:var(--muted)}.intro{max-width:680px;font-size:15px}
.subscribe{display:flex;gap:10px;align-items:center;margin:24px 0 34px;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.subscribe code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px}
.subscribe button{margin-left:auto;padding:8px 12px;border:0;border-radius:6px;background:var(--text);color:var(--panel);font-weight:700;cursor:pointer;white-space:nowrap}
.list{display:grid;gap:10px}.item{display:block;padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:inherit;text-decoration:none}
.item:hover{border-color:var(--green)}.item h2{margin:0 0 5px;font-size:16px}.item p{margin:0;font-size:11px}.item small{display:block;margin-top:10px;color:var(--green);font-size:9px}
.empty{padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--muted)}
@media(max-width:600px){h1{font-size:28px}.subscribe{align-items:stretch;flex-direction:column}.subscribe button{margin:0}}
</style></head><body>
<header><b>Life You Me</b><span>Autonomous Opportunity Factory</span><a href="/">返回产品</a></header>
<main><div class="eyebrow">RSS PRODUCT UPDATES</div><h1>订阅产品更新</h1>
<p class="intro">商机工厂发现重复需求并上线新产品时，会自动更新此订阅。将下面地址添加到 RSS 阅读器，即可持续接收更新。</p>
<div class="subscribe"><code id="feed-url"></code><button type="button" onclick="navigator.clipboard.writeText(location.href);this.textContent='已复制'">复制订阅地址</button></div>
<h2>最近上线</h2><div class="list">
<xsl:choose><xsl:when test="count(rss/channel/item) &gt; 0">
<xsl:for-each select="rss/channel/item"><a class="item"><xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute>
<h2><xsl:value-of select="title"/></h2><p><xsl:value-of select="description"/></p><small>查看产品</small></a></xsl:for-each>
</xsl:when><xsl:otherwise><div class="empty">暂无产品更新，系统仍在持续扫描需求。</div></xsl:otherwise></xsl:choose>
</div></main><script>document.getElementById('feed-url').textContent=location.href;</script>
</body></html>
</xsl:template></xsl:stylesheet>""".encode("utf-8")


def product_tool(product: sqlite3.Row, attribution: dict[str, str] | None = None) -> str:
    tool = product["tool"]
    attribution = attribution or {}
    tracking = "".join(
        f'<input type="hidden" name="{key}" value="{html.escape(attribution.get(key, ""))}">'
        for key in ("utm_source", "utm_medium", "utm_campaign")
    )
    if tool == "integration":
        fields = f"""
        <form class="audit-form" method="post" action="/api/github-audit">
          <input type="hidden" name="product" value="{html.escape(product["slug"])}">
          {tracking}
          <label>公开 GitHub 仓库地址</label>
          <input name="repository" type="url" placeholder="https://github.com/owner/repository" maxlength="300" required>
          <label>计划用于</label><select name="scenario">
            <option value="internal">内部效率工具</option>
            <option value="customer">面向客户的生产系统</option>
            <option value="agent">可执行操作的 AI Agent</option>
          </select>
          <label>会处理的数据</label><select name="sensitivity">
            <option value="public">仅公开数据</option>
            <option value="internal">企业内部数据</option>
            <option value="sensitive">敏感或受监管数据</option>
          </select>
          <label>维护团队规模</label><select name="team_size">
            <option value="solo">1 人</option>
            <option value="small">2-10 人</option>
            <option value="large">11 人以上</option>
          </select>
          <button type="submit">开始实时审计</button>
          <p class="notice">读取公开元数据，不克隆代码、不保存仓库内容。通常 5-15 秒完成。</p>
        </form>
        """
    elif tool == "cost":
        fields = """
        <label>每月请求数</label><input id="volume" type="number" value="100000">
        <label>平均输入 Token</label><input id="input" type="number" value="1200">
        <label>平均输出 Token</label><input id="output" type="number" value="300">
        <label>当前每百万 Token 成本（元）</label><input id="price" type="number" value="12">
        <button type="button" onclick="calculate()">计算月成本</button>
        <div class="result" id="result">填写真实调用规模后计算。</div>
        <script>function calculate(){{const v=+volume.value,i=+input.value,o=+output.value,p=+price.value;const cost=v*(i+o)/1e6*p;result.textContent=`预计月成本 ¥${{cost.toFixed(0)}}；若通过模型路由节省 30%，约可节省 ¥${{(cost*.3).toFixed(0)}}。`;}}</script>
        """
    else:
        prompts = {
            "reliability": ("最长任务运行多久？", "发生中断时能否从检查点继续？"),
            "knowledge": ("知识库最常回答错误的问题是什么？", "当前如何评估命中率？"),
            "integration": ("要评估的开源项目地址", "准备接入哪个真实业务场景？"),
            "workflow": ("最耗时的重复流程是什么？", "每周大约耗费多少小时？"),
        }
        first, second = prompts.get(tool, prompts["workflow"])
        fields = f"""
        <label>{html.escape(first)}</label><textarea id="answer1"></textarea>
        <label>{html.escape(second)}</label><textarea id="answer2"></textarea>
        <button type="button" onclick="diagnose()">生成最小行动方案</button>
        <div class="result" id="result">填写现状后生成一条可在 7 天内验证的建议。</div>
        <script>function diagnose(){{if(!answer1.value.trim()||!answer2.value.trim()){{result.textContent='请先填写两个关键事实。';return}}result.textContent='建议先选择一个真实样本，建立当前基线，只自动化最耗时的一步；7 天内以是否减少 30% 人工时间作为继续条件。';}}</script>
        """
    return fields


def qualified_view_beacon(
    product: sqlite3.Row,
    attribution: dict[str, str],
) -> str:
    payload = {
        "product": product["slug"],
        "utm_source": attribution.get("utm_source", ""),
        "utm_medium": attribution.get("utm_medium", ""),
        "utm_campaign": attribution.get("utm_campaign", ""),
    }
    encoded = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    return f"""
    <script>
    (() => {{
      let sent = false;
      const payload = {encoded};
      const send = () => {{
        if (sent || document.visibilityState !== 'visible') return;
        sent = true;
        const body = new URLSearchParams(payload);
        if (!navigator.sendBeacon('/api/qualified-view', body)) {{
          fetch('/api/qualified-view', {{
            method: 'POST',
            body,
            credentials: 'same-origin',
            keepalive: true
          }});
        }}
      }};
      for (const event of ['pointerdown', 'touchstart', 'keydown']) {{
        addEventListener(event, send, {{once: true, passive: true}});
      }}
    }})();
    </script>
    """


def comparison_form(
    product: sqlite3.Row,
    attribution: dict[str, str] | None = None,
) -> str:
    attribution = attribution or {}
    tracking = "".join(
        f'<input type="hidden" name="{key}" '
        f'value="{html.escape(attribution.get(key, ""))}">'
        for key in ("utm_source", "utm_medium", "utm_campaign")
    )
    return f"""
    <form class="audit-form" method="post" action="/api/github-compare">
      <input type="hidden" name="product" value="{html.escape(product["slug"])}">
      {tracking}
      <label>候选仓库 A</label>
      <input name="left_repository" type="url"
        placeholder="https://github.com/owner/repository-a"
        maxlength="300" required>
      <label>候选仓库 B</label>
      <input name="right_repository" type="url"
        placeholder="https://github.com/owner/repository-b"
        maxlength="300" required>
      <label>计划用于</label><select name="scenario">
        <option value="internal">内部效率工具</option>
        <option value="customer">面向客户的生产系统</option>
        <option value="agent">可执行操作的 AI Agent</option>
      </select>
      <label>会处理的数据</label><select name="sensitivity">
        <option value="public">仅公开数据</option>
        <option value="internal">企业内部数据</option>
        <option value="sensitive">敏感或受监管数据</option>
      </select>
      <label>维护团队规模</label><select name="team_size">
        <option value="solo">1 人</option>
        <option value="small">2-10 人</option>
        <option value="large">11 人以上</option>
      </select>
      <button type="submit">生成同场景对比</button>
      <p class="notice">两个候选使用完全相同的放行门槛。读取公开元数据，通常 10-30 秒完成。</p>
    </form>
    """


def public_report_payload(report: dict[str, Any], token: str) -> dict[str, Any]:
    context = report.get("adoption_context") or normalize_adoption_context()
    return {
        "repository": report["repository"],
        "report_url": f"{PUBLIC_URL}/r/{token}",
        "score": int(report["score"]),
        "adoption_threshold": int(report.get("adoption_threshold") or 65),
        "verdict": report["verdict"],
        "adoption_context": {
            key: context[key]
            for key in (
                "scenario",
                "scenario_label",
                "sensitivity",
                "sensitivity_label",
                "team_size",
                "team_size_label",
            )
        },
        "pillars": report.get("pillars") or [],
        "license": report["license"],
        "inactive_days": int(report["inactive_days"]),
        "evidence_sources": report.get("evidence_sources") or [],
        "evidence_time": report["evidence_time"],
        "api_version": "v1",
        "detail_boundary": (
            "OpenSSF failure reasons, remediation actions and the seven-day "
            "gate plan are professional-report fields."
        ),
    }


def render_adoption_badge(report: dict[str, Any]) -> bytes:
    score = int(report["score"])
    threshold = int(report.get("adoption_threshold") or 65)
    passes = score >= threshold
    value = f"{score}/{threshold} {'ready' if passes else 'blocked'}"
    label = "adoption gate"
    label_width = 92
    value_width = max(88, 7 * len(value) + 18)
    total_width = label_width + value_width
    color = "#147764" if passes else "#a33b3b"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20" role="img" aria-label="{label}: {value}">
<title>{label}: {value}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient>
<clipPath id="r"><rect width="{total_width}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="{label_width}" height="20" fill="#555"/><rect x="{label_width}" width="{value_width}" height="20" fill="{color}"/><rect width="{total_width}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11">
<text x="{label_width / 2}" y="14">{label}</text><text x="{label_width + value_width / 2}" y="14">{value}</text>
</g></svg>"""
    return svg.encode("ascii")


def render_repository_history(
    repository: str,
    rows: list[sqlite3.Row],
) -> bytes:
    entries = []
    previous_by_context: dict[tuple[str, str, str], int] = {}
    for row in reversed(rows):
        score = int(row["score"])
        context_key = (
            row["scenario"],
            row["sensitivity"],
            row["team_size"],
        )
        previous_score = previous_by_context.get(context_key)
        delta = score - previous_score if previous_score is not None else None
        entries.append({
            "row": row,
            "score": score,
            "delta": delta,
        })
        previous_by_context[context_key] = score
    entries.reverse()
    cards = "".join(
        f'<article class="card"><span class="eyebrow">'
        f'{html.escape(item["row"]["scenario_label"])} · '
        f'{html.escape(item["row"]["created_at"][:10])}</span>'
        f'<h3>{item["score"]} / {item["row"]["adoption_threshold"]}</h3>'
        f'<p>{html.escape(item["row"]["verdict"])}'
        f'{" · 同场景较上次 +" + str(item["delta"]) if item["delta"] is not None and item["delta"] > 0 else (" · 同场景较上次 " + str(item["delta"]) if item["delta"] is not None and item["delta"] < 0 else "")}</p>'
        f'<a href="/r/{urllib.parse.quote(item["row"]["token"])}">查看证据</a>'
        "</article>"
        for item in entries
    )
    latest = rows[0]
    latest_context_query = urllib.parse.urlencode({
        "scenario": latest["scenario"],
        "sensitivity": latest["sensitivity"],
        "team_size": latest["team_size"],
    })
    latest_badge_url = (
        f"/badge/github/{urllib.parse.quote(repository)}.svg?"
        f"{latest_context_query}"
    )
    content = f"""
    <section class="hero"><div class="eyebrow">PUBLIC EVIDENCE HISTORY</div>
      <h1>{html.escape(repository)} 采用证据历史</h1>
      <p>仅展示明确公开的审计，不包含 QA、私有请求或未公开买家报告。最新公开评分 {latest["score"]} 分。</p>
      <div class="guide-actions"><a href="/r/{urllib.parse.quote(latest["token"])}">查看最新报告</a>
      <a href="{html.escape(latest_badge_url)}">打开动态徽章</a></div>
    </section>
    <section><h2>公开变化记录</h2><div class="grid">{cards}</div></section>
    """
    return page_shell(
        f"{repository} 采用证据历史",
        content,
        f"{repository} 的公开 GitHub 与 OpenSSF 采用评分和场景门槛变化历史",
        f"/history/{repository}",
    )


def render_comparison_report(
    product: sqlite3.Row,
    comparison: dict[str, Any],
    comparison_token: str = "",
) -> bytes:
    left = comparison["left"]
    right = comparison["right"]
    context = comparison["adoption_context"]

    def choice(item: dict[str, Any], side: str) -> str:
        risks = "".join(
            f"<li>{html.escape(risk)}</li>"
            for risk in item.get("risks") or []
        ) or "<li>自动证据未发现明显缺口。</li>"
        return f"""
        <article class="compare-choice {'pass' if item['passes'] else ''}">
          <div class="eyebrow">候选 {side} · {'达到门槛' if item['passes'] else '未达到门槛'}</div>
          <h2>{html.escape(item["repository"])}</h2>
          <div class="compare-score">{item["score"]}<small> / 100</small></div>
          <p>{html.escape(item["verdict"])}</p>
          <p class="notice">许可证：{html.escape(item["license"])} ·
            距上次维护：{item["inactive_days"]} 天</p>
          <h3>优先核验风险</h3><ul class="risk-list">{risks}</ul>
          <a href="{html.escape(item["url"])}" rel="nofollow">查看原仓库</a>
        </article>
        """

    pillar_rows = "".join(
        f"<tr><td>{html.escape(item['label'])}</td>"
        f"<td>{item['left']}</td><td>{item['right']}</td>"
        f"<td>{'接近' if item['leader'] == 'tie' else ('候选 A' if item['leader'] == 'left' else '候选 B')}</td></tr>"
        for item in comparison.get("pillar_comparison") or []
    )
    share = (
        f'<div class="guide-actions"><a href="/c/{html.escape(comparison_token)}">'
        "分享此对比</a><a class=\"primary\" href=\"/\">审计另一个仓库</a></div>"
        if comparison_token else ""
    )
    content = f"""
    <section class="hero"><div class="eyebrow">SAME-CONTEXT COMPARISON</div>
      <h1>{html.escape(left["repository"])} vs {html.escape(right["repository"])}</h1>
      <p>场景：{html.escape(context["scenario_label"])} ·
        数据：{html.escape(context["sensitivity_label"])} ·
        团队：{html.escape(context["team_size_label"])} ·
        统一门槛：{comparison["adoption_threshold"]} 分</p>
    </section>
    <section class="decision"><div class="eyebrow">DECISION</div>
      <h2>采用建议</h2><p>{html.escape(comparison["recommendation"])}</p>
      {share}
    </section>
    <section class="compare-grid">
      {choice(left, "A")}{choice(right, "B")}
    </section>
    <section><h2>四维证据对比</h2>
      <table><thead><tr><th>维度</th><th>候选 A</th><th>候选 B</th><th>公开证据领先</th></tr></thead>
      <tbody>{pillar_rows}</tbody></table>
      <p class="evidence-time">证据对比时间：{html.escape(comparison["evidence_time"])}</p>
    </section>
    <section class="panel"><h2>下一步</h2>
      <p>免费对比用于缩小候选范围。进入生产前，仍应针对入选仓库完成单仓库专业报告中的 P0 整改和 7 天业务样例门禁。</p>
      <div class="guide-actions"><a class="primary" href="/">生成单仓库采用报告</a></div>
    </section>
    """
    canonical_path = f"/c/{comparison_token}" if comparison_token else ""
    headline = (
        f"{left['repository']} vs {right['repository']}："
        f"{context['scenario_label']}采用对比"
    )
    return page_shell(
        headline,
        content,
        (
            f"{left['repository']} 与 {right['repository']} 在"
            f"{context['scenario_label']}下的 OpenSSF、工程成熟度、"
            "维护状态和许可证采用对比"
        ),
        canonical_path,
        {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": headline,
            "datePublished": comparison["evidence_time"],
            "dateModified": comparison["evidence_time"],
            "author": {"@type": "Organization", "name": "Life You Me"},
            "mainEntityOfPage": (
                f"{PUBLIC_URL}{canonical_path}" if canonical_path else PUBLIC_URL
            ),
            "about": [
                left["repository"],
                right["repository"],
                context["scenario_label"],
                "Open source software adoption comparison",
            ],
        },
    )


def build_professional_markdown(report: dict[str, Any]) -> bytes:
    pillars = "\n".join(
        f"- {item['label']}: {item['score']} / {item['max']}"
        for item in report.get("pillars") or []
    )
    failures = "\n".join(
        f"| {item['priority']} | {item['name']} | {item['score']}/10 | "
        f"{item['reason'].replace('|', '/')} | {item['action'].replace('|', '/')} |"
        for item in report.get("security_failures") or []
    ) or "| - | 未发现低于 7 分的检查 | - | - | - |"
    plan = "\n".join(
        f"| 第 {item['day']} 天 | {item['priority']} | "
        f"{item['task'].replace('|', '/')} | {item['gate'].replace('|', '/')} |"
        for item in report.get("remediation_plan") or []
    ) or "| - | - | 无额外整改任务 | - |"
    risks = "\n".join(f"- {risk}" for risk in report.get("risks") or [])
    sources = "、".join(report.get("evidence_sources") or ["GitHub REST API"])
    context = report.get("adoption_context") or {}
    document = f"""# {report['repository']} 企业采用决策报告

生成时间：{report['evidence_time']}

## 决策摘要

- 综合得分：{report['score']} / 100
- 建议：{report['verdict']}
- 证据可信度：{report.get('confidence', '中')}
- 采用场景：{context.get('scenario_label', '内部效率工具')}
- 数据敏感度：{context.get('sensitivity_label', '仅公开数据')}
- 维护团队：{context.get('team_size_label', '1 人')}
- 当前场景放行门槛：{report.get('adoption_threshold', 65)} / 100
- 许可证：{report['license']}
- 维护间隔：{report['inactive_days']} 天
- 数据源：{sources}

## 四维评分

{pillars}

## 主要风险

{risks or '- 自动证据未发现明显风险'}

## OpenSSF 供应链失败项

| 优先级 | 检查 | 得分 | 独立证据 | 落地动作 |
|---|---|---:|---|---|
{failures}

## 7 天采用门禁计划

| 时间 | 优先级 | 任务 | 放行证据 |
|---|---|---|---|
{plan}

## 证据边界

本报告用于开源项目采用决策筛查，不等同于源代码安全审计、渗透测试或法律意见。
"""
    return document.encode("utf-8")


def render_audit_report(
    product: sqlite3.Row,
    report: dict[str, Any],
    report_token: str = "",
    professional: bool = False,
    showcase: bool = False,
    public_artifact: bool = False,
    attribution: dict[str, str] | None = None,
) -> bytes:
    pillars = report.get("pillars") or [
        {"label": "综合证据", "score": report["score"], "max": 100}
    ]
    context = report.get("adoption_context") or normalize_adoption_context()
    pillar_cards = "".join(
        f'<div class="metric-box"><small>{html.escape(item["label"])}</small>'
        f'<b>{int(item["score"])} / {int(item["max"])}</b></div>'
        for item in pillars
    )
    checks = "".join(
        f'<div class="check {"pass" if item["passed"] else "fail"}">'
        f'{"通过" if item["passed"] else "待处理"} · {html.escape(item["label"])}'
        f'<span style="float:right">+{item["weight"] if item["passed"] else 0}</span></div>'
        for item in report["checks"]
    )
    visible_risks = report["risks"] if professional else report["risks"][:3]
    risks = "".join(f"<li>{html.escape(risk)}</li>" for risk in visible_risks)
    checkout_url = clean(os.environ.get("CHECKOUT_URL"), 500)
    report_actions = (
        f'<div class="guide-actions"><a href="/r/{html.escape(report_token)}">分享此报告</a>'
        + (
            f'<a href="/r/{html.escape(report_token)}.md">下载决策报告</a>'
            f'<a href="/r/{html.escape(report_token)}.json">下载 JSON 证据</a>'
            if professional else ""
        )
        + "</div>"
        if report_token else ""
    )
    stripe_ready = all(
        os.environ.get(key, "").strip()
        for key in ("STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET")
    )
    lemon_ready = all(
        os.environ.get(key, "").strip()
        for key in (
            "LEMONSQUEEZY_CHECKOUT_URL",
            "LEMONSQUEEZY_VARIANT_ID",
            "LEMONSQUEEZY_WEBHOOK_SECRET",
        )
    )
    paid_block = (
        f'<form method="post" action="/api/checkout">'
        f'<input type="hidden" name="report" value="{html.escape(report_token)}">'
        f'<input type="hidden" name="provider" value="lemonsqueezy">'
        f'<button type="submit">全球支付并立即解锁</button></form>'
        if lemon_ready and report_token
        else (
        f'<form method="post" action="/api/checkout">'
        f'<input type="hidden" name="report" value="{html.escape(report_token)}">'
        f'<input type="hidden" name="provider" value="stripe">'
        f'<button type="submit">购买并立即解锁</button></form>'
        if stripe_ready and report_token
        else (
        f'<div class="guide-actions"><a class="primary" href="{html.escape(checkout_url)}">购买完整采用报告</a>'
        f'<a href="{html.escape(report["url"])}" rel="nofollow">查看原仓库</a></div>'
        if checkout_url
        else f"""
        <form method="post" action="/api/leads">
          <input type="hidden" name="product" value="{html.escape(product["slug"])}">
          <input type="hidden" name="problem" value="申请 {html.escape(report["repository"])} 企业采用深度报告">
          <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
          <label>称呼</label><input name="name" maxlength="80" required>
          <label>邮箱、微信或其他联系方式</label><input name="contact" maxlength="160" required>
          <button type="submit">申请完整采用报告</button>
        </form>
        """
        )
        )
    )
    security_rows = "".join(
        f'<tr><td><span class="badge">{html.escape(item["priority"])}</span></td>'
        f'<td>{html.escape(item["name"])}</td><td>{item["score"]}/10</td>'
        f'<td>{html.escape(item["reason"])}</td><td>{html.escape(item["action"])}</td></tr>'
        for item in report.get("security_failures") or []
    ) or '<tr><td colspan="5">OpenSSF 未发现低于 7 分的检查。</td></tr>'
    plan_rows = "".join(
        f'<tr><td>第 {item["day"]} 天</td><td>{html.escape(item["priority"])}</td>'
        f'<td>{html.escape(item["task"])}</td><td>{html.escape(item["gate"])}</td></tr>'
        for item in report.get("remediation_plan") or []
    ) or '<tr><td colspan="4">自动证据未生成额外整改任务。</td></tr>'
    professional_section = f"""
    {'<section class="panel"><div class="eyebrow">完整专业样例</div><h2>这是一份公开样例，不代表已付款订单</h2><p>下面展示 ¥299 报告的真实结构、证据粒度和可下载交付物。样例不会计入收入。</p></section>' if showcase else ''}
    <section><div class="eyebrow">PROFESSIONAL DELIVERABLE</div><h2>OpenSSF 供应链失败项</h2>
      <table><thead><tr><th>优先级</th><th>检查</th><th>得分</th><th>独立证据</th><th>落地动作</th></tr></thead>
      <tbody>{security_rows}</tbody></table></section>
    <section><h2>7 天采用门禁计划</h2>
      <table><thead><tr><th>时间</th><th>优先级</th><th>任务</th><th>放行证据</th></tr></thead>
      <tbody>{plan_rows}</tbody></table></section>
    <section class="panel"><h2>证据边界</h2>
      <p>可信度：{html.escape(report.get("confidence", "中"))}。数据源：{html.escape("、".join(report.get("evidence_sources") or ["GitHub REST API"]))}。</p>
      <p class="notice">本报告用于采用决策筛查，不等同于源代码安全审计、渗透测试或法律意见。</p></section>
    """ if professional else ""
    offer_section = "" if professional else f"""
    <section id="consult" class="panel"><div class="eyebrow">AUTOMATIC PRO REPORT</div><h2>解锁专业采用报告</h2>
      <div class="price"><strong>¥299 / $39</strong><span>一次性 · 单仓库</span></div>
      <div class="deliverables">
        <div class="deliverable"><b>✓</b><span>OpenSSF 独立安全检查、原始失败原因与优先级</span></div>
        <div class="deliverable"><b>✓</b><span>许可证、维护、工程准备度与供应链四维决策</span></div>
        <div class="deliverable"><b>✓</b><span>自动生成 7 天整改计划、放行门禁与 JSON 证据</span></div>
      </div>{paid_block}
      <p class="notice">仅在签名支付回调确认后自动解锁。个人二维码或私下转账不会自动计为收入。</p>
    </section>
    """
    embed_section = ""
    if public_artifact and report_token:
        owner, repository = report["repository"].split("/", 1)
        context_query = urllib.parse.urlencode({
            key: context[key]
            for key in ("scenario", "sensitivity", "team_size")
        })
        badge_url = (
            f"{PUBLIC_URL}/badge/github/{urllib.parse.quote(owner)}/"
            f"{urllib.parse.quote(repository)}.svg?{context_query}"
        )
        report_url = (
            f"{PUBLIC_URL}/r/{report_token}?"
            "utm_source=embedded_badge&utm_medium=referral&"
            f"utm_campaign={urllib.parse.quote(slugify(report['repository']))}"
        )
        markdown = f"[![Adoption gate]({badge_url})]({report_url})"
        embed_section = f"""
        <section class="panel"><div class="eyebrow">LIVE BADGE & API</div>
          <h2>在 README 或文档中引用此结果</h2>
          <p>徽章显示评分与当前场景门槛，并链接回完整公开证据。缓存一小时。</p>
          <code style="display:block;padding:12px;background:var(--bg);overflow-wrap:anywhere">{html.escape(markdown)}</code>
          <div class="guide-actions">
            <button type="button" style="margin:0" onclick='navigator.clipboard.writeText({json.dumps(markdown)})'>复制 Markdown</button>
            <a href="/api/v1/reports/{html.escape(report_token)}">公开摘要 API</a>
            <a href="/history/{urllib.parse.quote(report["repository"])}">查看公开历史</a>
          </div>
          <p class="notice">公开 API 不包含付费报告中的失败原因、整改动作和 7 天门禁。</p>
        </section>
        """
    content = f"""
    <section class="hero"><div class="eyebrow">LIVE GITHUB EVIDENCE</div>
      <div class="score-hero"><div class="score-ring">{report["score"]}<small>/ 100</small></div>
      <div><h1>{html.escape(report["repository"])}</h1><p>{html.escape(report["verdict"])}</p>
      <p>{html.escape(report["description"] or "仓库未提供简介")}</p>
      <p class="notice">场景：{html.escape(context["scenario_label"])} · 数据：{html.escape(context["sensitivity_label"])} · 团队：{html.escape(context["team_size_label"])} · 放行门槛：{report.get("adoption_threshold", 65)} 分</p>
      </div></div></section>
    <section><div class="metric-grid">
      <div class="metric-box"><small>许可证</small><b>{html.escape(report["license"])}</b></div>
      <div class="metric-box"><small>主要语言</small><b>{html.escape(report["language"])}</b></div>
      <div class="metric-box"><small>维护间隔</small><b>{report["inactive_days"]} 天</b></div>
      <div class="metric-box"><small>Stars / Forks</small><b>{report["stars"]} / {report["forks"]}</b></div>
    </div><h2>四维采用评分</h2><div class="metric-grid">{pillar_cards}</div>
      {'<h2>工程证据明细</h2><div class="check-list">' + checks + '</div>' if professional else ''}</section>
    <section><h2>采用前必须处理的风险</h2>
      <ul class="risk-list">{risks or "<li>自动检查未发现明显缺口，仍需结合真实业务样例验证。</li>"}</ul>
      <p class="evidence-time">证据读取时间：{html.escape(report["evidence_time"])}</p>
      {report_actions}</section>
    {embed_section}{professional_section}{offer_section}
    {qualified_view_beacon(product, attribution or {}) if public_artifact else ""}
    """
    canonical_path = f"/r/{report_token}" if report_token else ""
    structured_data = {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "headline": (
            f"{report['repository']} 用于"
            f"{context['scenario_label']}的开源项目采用报告"
        ),
        "description": (
            f"{report['repository']} 基于 GitHub 与 OpenSSF 公开证据的"
            f"供应链安全和采用风险评估，综合得分 {report['score']}/100。"
        ),
        "datePublished": report["evidence_time"],
        "dateModified": report["evidence_time"],
        "author": {"@type": "Organization", "name": "Life You Me"},
        "mainEntityOfPage": f"{PUBLIC_URL}{canonical_path}" if canonical_path else PUBLIC_URL,
        "about": [
            "Open source software adoption",
            "Software supply chain security",
            report["repository"],
        ],
    }
    return page_shell(
        f"{report['repository']} 用于{context['scenario_label']}的采用审计",
        content,
        (
            f"{report['repository']} 用于{context['scenario_label']}时的"
            "GitHub、OpenSSF 采用门槛、阻塞风险与整改计划"
        ),
        canonical_path,
        structured_data,
    )


class Handler(BaseHTTPRequestHandler):
    store: Store
    factory: Factory
    server_version = "OpportunityFactory/1.0"

    def send_bytes(
        self,
        status: int,
        body: bytes,
        content_type: str = "text/html; charset=utf-8",
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def redirect(self, location: str) -> None:
        self.send_response(303)
        self.send_header("Location", location)
        self.end_headers()

    def send_error_page(self, status: int, title: str, message: str) -> None:
        content = (
            f'<section class="hero"><div class="eyebrow">请求未完成</div>'
            f'<h1>{html.escape(title)}</h1><p>{html.escape(message)}</p>'
            '<a href="/">返回产品目录</a></section>'
        )
        self.send_bytes(status, page_shell(title, content))

    def attribution(self, parsed: urllib.parse.ParseResult) -> dict[str, str]:
        query = urllib.parse.parse_qs(parsed.query)
        return {
            key: clean(query.get(key, [""])[0], 120)
            for key in ("utm_source", "utm_medium", "utm_campaign")
        }

    def track_product_visit(
        self,
        product: sqlite3.Row,
        attribution: dict[str, str],
    ) -> None:
        source = attribution["utm_source"] or "direct"
        self.store.view_product(
            int(product["id"]),
            source,
            attribution["utm_medium"],
            attribution["utm_campaign"],
        )

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/healthz":
            self.send_bytes(200, b'{"status":"ok"}', "application/json")
        elif path == f"/{INDEXNOW_KEY}.txt":
            self.send_bytes(200, INDEXNOW_KEY.encode(), "text/plain; charset=utf-8")
        elif path.startswith("/api/v1/reports/"):
            token = path.rsplit("/", 1)[-1]
            if not re.fullmatch(r"[a-z0-9-]{8,80}", token):
                self.send_error(404)
                return
            row = self.store.audit_report(token)
            if not row or not row["is_public"]:
                self.send_error(404)
                return
            payload = public_report_payload(
                json.loads(row["report_json"]),
                token,
            )
            self.send_bytes(
                200,
                json.dumps(payload, ensure_ascii=False, indent=2).encode(),
                "application/json; charset=utf-8",
                {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        elif path.startswith("/api/v1/github/"):
            repository = urllib.parse.unquote(path[len("/api/v1/github/"):])
            if not re.fullmatch(
                r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
                repository,
            ):
                self.send_error(404)
                return
            query = urllib.parse.parse_qs(parsed.query)
            context = normalize_adoption_context({
                key: clean(query.get(key, [""])[0], 20)
                for key in ("scenario", "sensitivity", "team_size")
            })
            row = self.store.latest_public_repository_report(
                repository,
                context,
            )
            if not row:
                self.send_error(404)
                return
            payload = public_report_payload(
                json.loads(row["report_json"]),
                row["token"],
            )
            self.send_bytes(
                200,
                json.dumps(payload, ensure_ascii=False, indent=2).encode(),
                "application/json; charset=utf-8",
                {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        elif path.startswith("/badge/github/") and path.endswith(".svg"):
            repository = urllib.parse.unquote(
                path[len("/badge/github/"):-4]
            )
            if not re.fullmatch(
                r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
                repository,
            ):
                self.send_error(404)
                return
            query = urllib.parse.parse_qs(parsed.query)
            context = normalize_adoption_context({
                key: clean(query.get(key, [""])[0], 20)
                for key in ("scenario", "sensitivity", "team_size")
            })
            row = self.store.latest_public_repository_report(
                repository,
                context,
            )
            if not row:
                self.send_error(404)
                return
            self.send_bytes(
                200,
                render_adoption_badge(json.loads(row["report_json"])),
                "image/svg+xml; charset=utf-8",
                {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": (
                        "public, max-age=3600, stale-while-revalidate=86400"
                    ),
                },
            )
        elif path.startswith("/badge/") and path.endswith(".svg"):
            token = path.rsplit("/", 1)[-1][:-4]
            if not re.fullmatch(r"[a-z0-9-]{8,80}", token):
                self.send_error(404)
                return
            row = self.store.audit_report(token)
            if not row or not row["is_public"]:
                self.send_error(404)
                return
            self.send_bytes(
                200,
                render_adoption_badge(json.loads(row["report_json"])),
                "image/svg+xml; charset=utf-8",
                {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": (
                        "public, max-age=3600, stale-while-revalidate=86400"
                    ),
                },
            )
        elif path.startswith("/history/"):
            repository = urllib.parse.unquote(path[len("/history/"):])
            if not re.fullmatch(
                r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
                repository,
            ):
                self.send_error(404)
                return
            rows = self.store.public_repository_history(repository)
            if not rows:
                self.send_error(404)
                return
            self.send_bytes(
                200,
                render_repository_history(repository, rows),
                extra_headers={"Cache-Control": "public, max-age=900"},
            )
        elif path == "/":
            products = self.store.public_products()
            reports = self.store.public_audit_reports(3)
            product = next(
                (row for row in products if row["tool"] == "integration"),
                None,
            )
            if not product:
                self.send_error_page(
                    503,
                    "审计服务正在准备",
                    "采用决策引擎尚未完成初始化，请稍后重试。",
                )
                return
            attribution = self.attribution(parsed)
            self.track_product_visit(product, attribution)
            fields = product_tool(product, attribution)
            showcase = self.store.professional_showcase()
            showcase_link = (
                f'<a class="primary" href="/r/{urllib.parse.quote(showcase["token"])}">'
                "查看完整专业样例</a>"
                if showcase else ""
            )
            report_cards = "".join(
                f'<article class="card"><span class="eyebrow">实时证据 · {row["score"]}/100</span>'
                f'<h3>{html.escape(row["repository"])} · {html.escape(row["scenario_label"])}</h3>'
                f'<p>{html.escape(row["verdict"])}，门槛 {row["adoption_threshold"]} 分</p>'
                f'<a href="/r/{urllib.parse.quote(row["token"])}">查看报告</a></article>'
                for row in reports
            )
            content = f"""
            <section class="hero"><div class="eyebrow">OPEN-SOURCE ADOPTION DECISION</div>
              <h1>这个开源项目，能否用于你的生产场景？</h1>
              <p>输入公开 GitHub 仓库，并说明业务场景、数据敏感度和维护团队。系统实时合并 GitHub 与 OpenSSF 证据，给出场景化放行门槛、阻塞项和 7 天整改计划。</p>
              <div class="guide-actions">{showcase_link}<a href="/compare">对比两个候选</a><a href="/reports">浏览公开报告</a></div>
            </section>
            <section class="tool">
              <div class="panel"><div class="eyebrow">FREE LIVE AUDIT</div><h2>免费实时审计</h2>{fields}</div>
              <aside class="panel"><div class="eyebrow">¥299 · AUTOMATIC DELIVERY</div>
                <h2>专业采用决策报告</h2>
                <div class="deliverables">
                  <div class="deliverable"><b>1</b><span>失败检查的原始证据、优先级与具体整改动作</span></div>
                  <div class="deliverable"><b>2</b><span>与你的场景匹配的放行门槛，而非通用安全分数</span></div>
                  <div class="deliverable"><b>3</b><span>Markdown 决策文档与 JSON 证据，支付后自动交付</span></div>
                </div>
                <div class="guide-actions">{showcase_link}</div>
                <p class="notice">公开样例明确标记，不计入付款或收入。真实报告只在支付平台确认后解锁。</p>
              </aside>
            </section>
            {f'<section><h2>最新场景化采用报告</h2><div class="grid">{report_cards}</div><p><a href="/reports">查看全部报告</a></p></section>' if report_cards else ''}
            {qualified_view_beacon(product, attribution)}
            """
            self.send_bytes(
                200,
                page_shell(
                    "GitHub 开源项目企业采用决策",
                    content,
                    "基于 GitHub、OpenSSF、业务场景、数据敏感度和团队规模的开源项目采用决策",
                    "/",
                    {
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "GitHub 开源项目企业采用决策",
                        "applicationCategory": "SecurityApplication",
                        "operatingSystem": "Web",
                        "offers": {
                            "@type": "Offer",
                            "price": REPORT_PRICE_CENTS / 100,
                            "priceCurrency": REPORT_CURRENCY.upper(),
                        },
                    },
                ),
            )
        elif path == "/compare":
            product = next(
                (
                    row for row in self.store.public_products()
                    if row["tool"] == "integration"
                ),
                None,
            )
            if not product:
                self.send_error_page(
                    503,
                    "对比服务正在准备",
                    "采用决策引擎尚未完成初始化，请稍后重试。",
                )
                return
            attribution = self.attribution(parsed)
            self.track_product_visit(product, attribution)
            comparisons = self.store.public_comparison_reports(6)
            cards = "".join(
                f'<article class="card"><span class="eyebrow">'
                f'{html.escape(row["scenario_label"])} · 同场景对比</span>'
                f'<h3>{html.escape(row["left_repository"])} vs '
                f'{html.escape(row["right_repository"])}</h3>'
                f'<p>{html.escape(row["recommendation"])}</p>'
                f'<a href="/c/{urllib.parse.quote(row["token"])}">'
                "查看对比</a></article>"
                for row in comparisons
            )
            content = f"""
            <section class="hero"><div class="eyebrow">SHORTLIST DECISION</div>
              <h1>两个开源候选，哪个更适合你的场景？</h1>
              <p>使用同一业务场景、数据敏感度和团队规模审计两个公开仓库。系统只在证据足够时推荐候选；差距不足时会明确要求业务样例试点。</p>
            </section>
            <section class="tool">
              <div class="panel"><h2>免费同场景对比</h2>
                {comparison_form(product, attribution)}
              </div>
              <aside class="panel"><div class="eyebrow">WHAT YOU GET</div>
                <h2>不是简单比分数</h2>
                <div class="deliverables">
                  <div class="deliverable"><b>1</b><span>统一放行门槛，避免两个候选使用不同标准</span></div>
                  <div class="deliverable"><b>2</b><span>供应链、工程、维护与许可证四维差异</span></div>
                  <div class="deliverable"><b>3</b><span>一方达标、差距接近或都不达标的明确下一步</span></div>
                </div>
              </aside>
            </section>
            {f'<section><h2>公开对比</h2><div class="grid">{cards}</div></section>' if cards else ''}
            {qualified_view_beacon(product, attribution)}
            """
            self.send_bytes(
                200,
                page_shell(
                    "GitHub 开源项目同场景采用对比",
                    content,
                    "比较两个 GitHub 开源项目在相同生产场景下的 OpenSSF、工程成熟度、维护和许可证采用风险",
                    "/compare",
                ),
            )
        elif path.startswith("/c/"):
            token = path.split("/", 2)[2]
            if not re.fullmatch(r"[a-z0-9-]{8,120}", token):
                self.send_error(404)
                return
            row = self.store.comparison_report(token)
            if not row:
                self.send_error(404)
                return
            product = next(
                (
                    item for item in self.store.public_products()
                    if item["id"] == row["product_id"]
                ),
                None,
            )
            if not product:
                self.send_error(404)
                return
            with self.store.connect() as db:
                db.execute(
                    "UPDATE comparison_reports SET views=views+1 WHERE token=?",
                    (token,),
                )
            self.send_bytes(
                200,
                render_comparison_report(
                    product,
                    json.loads(row["comparison_json"]),
                    token,
                ),
            )
        elif path.startswith("/p/"):
            slug = path.split("/", 2)[2]
            if not re.fullmatch(r"[a-z0-9-]{1,80}", slug):
                self.send_error(404)
                return
            product = self.store.product(slug)
            if not product:
                self.send_error(404)
                return
            attribution = self.attribution(parsed)
            self.track_product_visit(product, attribution)
            fields = product_tool(product, attribution)
            content = f"""
            <section class="hero"><div class="eyebrow">实时证据 · 可直接使用</div><h1>{html.escape(product["name"])}</h1><p>{html.escape(product["promise"])}</p></section>
            <section class="tool"><div class="panel"><h2>免费实时审计</h2>{fields}</div>
            <form class="panel" method="post" action="/api/leads"><div class="eyebrow">AUTOMATIC PRO REPORT</div><h2>专业采用决策报告</h2>
            <input type="hidden" name="product" value="{html.escape(product["slug"])}"><input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
            <div class="price"><strong>¥299</strong><span>一次性 · 单仓库</span></div>
            <div class="deliverables"><div class="deliverable"><b>✓</b><span>GitHub + OpenSSF 四维独立证据</span></div><div class="deliverable"><b>✓</b><span>供应链失败原因、优先级与整改动作</span></div><div class="deliverable"><b>✓</b><span>7 天采用门禁与可下载决策报告</span></div></div>
            <label>称呼</label><input name="name" maxlength="80" required>
            <label>邮箱、微信或其他联系方式</label><input name="contact" maxlength="160" required>
            <label>仓库地址与业务场景</label><textarea name="problem" maxlength="1500" required></textarea>
            <button type="submit">申请专业报告</button><p class="notice">先运行免费审计查看真实摘要；支付通道接入后可自动解锁专业交付物。</p></form></section>
            <div class="source">产品源自公开需求信号：<a href="{html.escape(product["source_url"])}" rel="nofollow">{html.escape(product["source_title"])}</a></div>
            {qualified_view_beacon(product, attribution)}
            """
            self.send_bytes(200, page_shell(product["name"], content, product["promise"]))
        elif path == "/about":
            content = '<section class="hero"><div class="eyebrow">透明自动化</div><h1>关于 Opportunity Factory</h1><p>这是一个持续运行的商机实验系统。它只读取允许公开访问的数据源，所有自动回复都会披露自动化身份并严格频控。产品和定价均为市场假设，不承诺收益。</p></section>'
            self.send_bytes(200, page_shell("关于", content))
        elif path == "/updates":
            products = self.store.public_products()
            cards = "".join(
                f'<article class="card"><span class="eyebrow">产品更新</span>'
                f'<h3>{html.escape(row["name"])}</h3><p>{html.escape(row["promise"])}</p>'
                f'<a href="/p/{urllib.parse.quote(row["slug"])}">查看产品</a></article>'
                for row in products
            ) or '<article class="card"><h3>持续扫描中</h3><p>新产品上线后会自动出现在这里。</p></article>'
            content = f"""
            <section class="hero"><div class="eyebrow">PRODUCT UPDATES</div><h1>订阅产品更新</h1>
            <p>商机工厂发现重复需求并上线产品时，会自动更新此页面。使用 RSS 阅读器时，订阅下面的标准地址。</p>
            <div class="panel" style="margin-top:22px;display:flex;gap:10px;align-items:center">
              <code id="feed-url" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">{PUBLIC_URL}/feed.xml</code>
              <button type="button" style="margin:0 0 0 auto;white-space:nowrap" onclick="navigator.clipboard.writeText('{PUBLIC_URL}/feed.xml');this.textContent='已复制'">复制 RSS 地址</button>
            </div></section>
            <section><h2>在 iPhone 上使用</h2><div class="guide-grid">
              <article class="guide recommended"><span class="guide-tag">推荐 · 自动汇总更新</span>
                <h3>使用 NetNewsWire</h3><p>免费 RSS 阅读器。商机工厂上线新产品后，会进入你的订阅列表。</p>
                <div class="steps">
                  <div class="step"><b>1</b><span>在 App Store 安装 <strong>NetNewsWire</strong>。</span></div>
                  <div class="step"><b>2</b><span>回到本页，点击上方“复制 RSS 地址”。</span></div>
                  <div class="step"><b>3</b><span>打开 NetNewsWire，点击左上角 <strong>+</strong>，选择 <strong>Add Web Feed</strong>。</span></div>
                  <div class="step"><b>4</b><span>粘贴地址，确认订阅 <strong>Life You Me 产品更新</strong>。</span></div>
                </div>
                <div class="guide-actions">
                  <a class="primary" href="https://apps.apple.com/app/netnewswire-rss-reader/id1480640210">前往 App Store</a>
                  <a href="feed://audit.lifeyoume.icu/feed.xml">尝试在阅读器中打开</a>
                </div>
                <div class="guide-note">RSS 会汇总更新；是否弹出系统通知取决于阅读器的通知能力和 iPhone 设置。</div>
              </article>
              <article class="guide"><span class="guide-tag">无需安装 App</span>
                <h3>添加到主屏幕</h3><p>把产品更新页作为桌面入口，适合偶尔手动查看。</p>
                <div class="steps">
                  <div class="step"><b>1</b><span>使用 iPhone 的 <strong>Safari</strong> 打开本页面。</span></div>
                  <div class="step"><b>2</b><span>点击 Safari 底部的<strong>分享</strong>图标。</span></div>
                  <div class="step"><b>3</b><span>向下找到并点击<strong>添加到主屏幕</strong>。</span></div>
                  <div class="step"><b>4</b><span>名称保留“产品更新”，点击右上角<strong>添加</strong>。</span></div>
                </div>
                <div class="guide-note">主屏幕入口不会主动通知；打开后可直接查看最新上线产品。</div>
              </article>
            </div></section>
            <section><h2>最近上线</h2><div class="grid">{cards}</div></section>
            """
            self.send_bytes(200, page_shell("订阅产品更新", content, "订阅商机工厂自动上线的产品更新"))
        elif path == "/reports":
            reports = self.store.public_audit_reports()
            cards = "".join(
                f'<article class="card"><span class="eyebrow">'
                f'{"完整专业样例" if row["is_showcase"] else "公开采用样本"} · '
                f'{row["score"]}/100</span>'
                f'<h3>{html.escape(row["repository"])} · '
                f'{html.escape(row["scenario_label"])}</h3>'
                f'<p>{html.escape(row["verdict"])}，场景门槛 '
                f'{row["adoption_threshold"]} 分</p>'
                f'<a href="/r/{urllib.parse.quote(row["token"])}">'
                f'{"查看完整交付物" if row["is_showcase"] else "查看证据报告"}</a>'
                "</article>"
                for row in reports
            ) or '<article class="card"><h3>首份样本生成中</h3><p>系统每天自动审计一个热门开源项目。</p></article>'
            content = (
                '<section class="hero"><div class="eyebrow">EVIDENCE LIBRARY</div>'
                '<h1>按真实使用场景组织的采用报告</h1><p>系统每天轮换内部工具、'
                '客户生产系统和敏感数据 Agent 场景，读取实时公开证据。'
                '完整专业样例明确标记且不计入收入。</p></section>'
                f'<section><h2>最新报告</h2><div class="grid">{cards}</div></section>'
            )
            self.send_bytes(
                200,
                page_shell(
                    "场景化开源项目采用报告库",
                    content,
                    "GitHub 开源项目用于内部工具、客户生产系统和敏感数据 Agent 的采用决策报告",
                    "/reports",
                ),
            )
        elif path.startswith("/r/"):
            token = path.split("/", 2)[2]
            wants_json = token.endswith(".json")
            wants_markdown = token.endswith(".md")
            if wants_json:
                token = token[:-5]
            elif wants_markdown:
                token = token[:-3]
            if not re.fullmatch(r"[a-z0-9-]{8,80}", token):
                self.send_error(404)
                return
            row = self.store.audit_report(token)
            if not row:
                self.send_error(404)
                return
            report = json.loads(row["report_json"])
            product = next(
                (item for item in self.store.public_products() if item["id"] == row["product_id"]),
                None,
            )
            if not product:
                self.send_error(404)
                return
            if wants_json or wants_markdown:
                if not (row["pro_unlocked"] or row["is_showcase"]):
                    self.send_error_page(
                        403, "专业报告尚未解锁",
                        "完成购买后，系统会自动解锁 Markdown 与 JSON 交付物。",
                    )
                    return
                self.store.touch_audit_report(token, "report_downloaded")
                if wants_json:
                    self.send_bytes(
                        200,
                        json.dumps(report, ensure_ascii=False, indent=2).encode(),
                        "application/json; charset=utf-8",
                        {"Content-Disposition": f'attachment; filename="{token}.json"'},
                    )
                else:
                    self.send_bytes(
                        200,
                        build_professional_markdown(report),
                        "text/markdown; charset=utf-8",
                        {"Content-Disposition": f'attachment; filename="{token}.md"'},
                    )
            else:
                self.store.touch_audit_report(token, "report_viewed")
                attribution = self.attribution(parsed)
                self.track_product_visit(product, attribution)
                self.send_bytes(
                    200,
                    render_audit_report(
                        product,
                        report,
                        token,
                        bool(row["pro_unlocked"] or row["is_showcase"]),
                        bool(row["is_showcase"]),
                        bool(row["is_public"]),
                        attribution,
                    ),
                )
        elif path == "/feed.xml":
            self.send_bytes(
                200,
                build_feed(
                    self.store.public_products(),
                    self.store.public_audit_reports(20),
                    self.store.public_comparison_reports(20),
                ),
                "application/rss+xml; charset=utf-8",
            )
        elif path == "/rss.xsl":
            self.send_bytes(200, rss_stylesheet(), "application/xslt+xml; charset=utf-8")
        elif path == "/sitemap.xml":
            urls = [
                f"{PUBLIC_URL}/",
                f"{PUBLIC_URL}/compare",
                f"{PUBLIC_URL}/reports",
            ] + [
                f"{PUBLIC_URL}/p/{row['slug']}" for row in self.store.public_products()
            ] + [
                f"{PUBLIC_URL}/r/{row['token']}" for row in self.store.public_audit_reports(100)
            ] + [
                f"{PUBLIC_URL}/c/{row['token']}"
                for row in self.store.public_comparison_reports(100)
            ] + list(dict.fromkeys(
                f"{PUBLIC_URL}/history/{row['repository']}"
                for row in self.store.public_audit_reports(100)
            ))
            xml = ('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{html.escape(url)}</loc></url>" for url in urls) + "</urlset>").encode()
            self.send_bytes(200, xml, "application/xml; charset=utf-8")
        elif path == "/robots.txt":
            self.send_bytes(200, f"User-agent: *\nAllow: /\nSitemap: {PUBLIC_URL}/sitemap.xml\n".encode(), "text/plain; charset=utf-8")
        elif path == "/llms.txt":
            content = f"""# Life You Me

> GitHub 开源项目企业采用审计，基于 GitHub 与 OpenSSF 公开证据评估供应链安全、工程准备度、维护状态和许可证风险。

## Public resources

- Product: {PUBLIC_URL}/
- Compare two candidates: {PUBLIC_URL}/compare
- Live audit: {PUBLIC_URL}/p/{self.store.public_products()[0]['slug'] if self.store.public_products() else ''}
- Evidence library: {PUBLIC_URL}/reports
- Public report API: {PUBLIC_URL}/api/v1/reports/{{report_token}}
- Latest public repository API: {PUBLIC_URL}/api/v1/github/{{owner}}/{{repository}}?scenario=agent&sensitivity=sensitive&team_size=solo
- Dynamic adoption badge: {PUBLIC_URL}/badge/github/{{owner}}/{{repository}}.svg?scenario=agent&sensitivity=sensitive&team_size=solo
- Public evidence history: {PUBLIC_URL}/history/{{owner}}/{{repository}}
- RSS feed: {PUBLIC_URL}/feed.xml

Free reports provide a risk summary. Professional reports add OpenSSF failure evidence, remediation actions, a seven-day adoption gate plan, and downloadable Markdown/JSON artifacts.
"""
            self.send_bytes(200, content.encode(), "text/plain; charset=utf-8")
        elif path == "/admin":
            if not self.admin_authorized():
                return
            data = self.store.dashboard()
            demand_rows = "".join(
                f"<tr><td><span class='badge'>{row['score']}</span></td><td>{html.escape(row['source'])}</td><td><a href='{html.escape(row['url'])}'>{html.escape(row['title'])}</a></td><td>{html.escape(row['state'])}</td></tr>"
                for row in data["demands"]
            )
            funnel_rows = "".join(
                f"<tr><td>{html.escape(row['kind'])}</td><td>{html.escape(row['source'])}</td><td>{row['count']}</td></tr>"
                for row in data["funnel"]
            ) or "<tr><td colspan='3'>暂无转化事件</td></tr>"
            content = (
                "<section class='hero'><div class='eyebrow'>Private operations</div>"
                "<h1>无人值守运行台</h1><div class='stats'>"
                + "".join(f"<div><b>{value}</b><span>{key}</span></div>" for key, value in data["counts"].items())
                + "</div></section><h2>产品转化漏斗</h2>"
                f"<div class='panel'><b>商业实验：{html.escape(data['experiment']['status']['decision'])}</b>"
                f"<p>{html.escape(data['experiment']['status']['reason'])}</p>"
                f"<span>有效访问 {data['experiment']['qualified_views']} · "
                f"有效审计 {data['experiment']['qualified_audits']} · "
                f"购买意向 {data['experiment']['purchase_intents']} · "
                f"净支付 {data['experiment']['payments']} · "
                f"净收入 ¥{data['experiment']['revenue_cny_cents']/100:.2f} / "
                f"${data['experiment']['revenue_usd_cents']/100:.2f}</span></div>"
                f"<table><thead><tr><th>动作</th><th>渠道</th><th>数量</th></tr></thead><tbody>{funnel_rows}</tbody></table>"
                "<h2>需求信号</h2><table><thead><tr><th>评分</th><th>来源</th><th>需求</th><th>状态</th></tr></thead>"
                f"<tbody>{demand_rows}</tbody></table>"
            )
            self.send_bytes(200, page_shell("运行台", content))
        else:
            self.send_error(404)

    def do_HEAD(self) -> None:
        self.do_GET()

    def admin_authorized(self) -> bool:
        expected = os.environ.get("ADMIN_PASSWORD", "")
        if not expected:
            self.send_error(503, "Admin password is not configured")
            return False
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Basic "):
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="Opportunity Factory"')
            self.end_headers()
            return False
        import base64
        try:
            decoded = base64.b64decode(authorization[6:]).decode()
            _, password = decoded.split(":", 1)
        except (ValueError, UnicodeDecodeError):
            password = ""
        if not secrets.compare_digest(password, expected):
            self.send_error(403)
            return False
        return True

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path not in (
            "/api/leads", "/api/github-audit", "/api/github-compare", "/api/checkout",
            "/api/stripe-webhook", "/api/lemonsqueezy-webhook",
            "/api/qualified-view",
        ):
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 100_000:
            self.send_error(413)
            return
        raw_body = self.rfile.read(length)
        if parsed.path == "/api/stripe-webhook":
            webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
            if not webhook_secret:
                self.send_error_page(
                    503, "支付回调尚未配置", "服务器缺少支付平台签名密钥。"
                )
                return
            try:
                event = verify_stripe_webhook(
                    raw_body, self.headers.get("Stripe-Signature", ""), webhook_secret
                )
            except ValueError as exc:
                self.send_error_page(400, "支付回调校验失败", str(exc))
                return
            if event.get("type") == "checkout.session.completed":
                session = (event.get("data") or {}).get("object") or {}
                token = paid_report_from_session(session)
                amount_total = int(session.get("amount_total") or 0)
                if token:
                    self.store.unlock_audit_report(
                        token,
                        clean(session.get("payment_intent") or session.get("id"), 200),
                        amount_total,
                    )
            self.send_bytes(200, b'{"received":true}', "application/json")
            return
        if parsed.path == "/api/lemonsqueezy-webhook":
            webhook_secret = os.environ.get(
                "LEMONSQUEEZY_WEBHOOK_SECRET",
                "",
            ).strip()
            if not webhook_secret:
                self.send_error_page(
                    503,
                    "支付回调尚未配置",
                    "服务器缺少 Lemon Squeezy 签名密钥。",
                )
                return
            try:
                event = verify_lemonsqueezy_webhook(
                    raw_body,
                    self.headers.get("X-Signature", ""),
                    webhook_secret,
                )
            except ValueError as exc:
                self.send_error_page(400, "支付回调校验失败", str(exc))
                return
            token, reference, amount_usd = (
                paid_report_from_lemonsqueezy_order(event)
            )
            if token:
                self.store.unlock_audit_report(
                    token,
                    reference,
                    amount_usd,
                    currency="usd",
                    payment_source="lemonsqueezy",
                )
            refund_token, refund_reference, refunded_usd = (
                refunded_report_from_lemonsqueezy_order(event)
            )
            if refund_token:
                self.store.record_audit_refund(
                    refund_token,
                    refund_reference,
                    refunded_usd,
                    payment_source="lemonsqueezy",
                )
            self.send_bytes(200, b'{"received":true}', "application/json")
            return
        form = urllib.parse.parse_qs(raw_body.decode("utf-8", "replace"))
        if parsed.path == "/api/checkout":
            token = clean(form.get("report", [""])[0], 80)
            provider = clean(form.get("provider", [""])[0], 30)
            if not token or not self.store.audit_report(token):
                self.send_error(404)
                return
            try:
                checkout_url = (
                    create_lemonsqueezy_checkout(token)
                    if provider == "lemonsqueezy"
                    else create_stripe_checkout(token)
                )
            except ValueError as exc:
                self.send_error_page(503, "无法创建支付会话", str(exc))
                return
            self.redirect(checkout_url)
            return
        if clean(form.get("website", [""])[0]):
            self.redirect("/")
            return
        slug = clean(form.get("product", [""])[0], 80)
        product = self.store.product(slug)
        if not product:
            self.send_error(404)
            return
        if parsed.path == "/api/qualified-view":
            source = clean(form.get("utm_source", [""])[0], 80) or "direct"
            medium = clean(form.get("utm_medium", [""])[0], 80)
            campaign = clean(form.get("utm_campaign", [""])[0], 120)
            if (
                not is_automated_user_agent(self.headers.get("User-Agent", ""))
                and not is_test_attribution(source, medium, campaign)
            ):
                visitor_hash = hashlib.sha256(
                    (
                        f"{self.client_ip()}|{self.headers.get('User-Agent','')}|"
                        f"{os.environ.get('IP_HASH_SALT','local')}"
                    ).encode()
                ).hexdigest()
                self.store.record_qualified_view(
                    int(product["id"]),
                    visitor_hash,
                    source,
                    medium,
                    campaign,
                )
            self.send_bytes(204, b"", "text/plain; charset=utf-8")
            return
        if parsed.path == "/api/github-compare":
            left_value = clean(form.get("left_repository", [""])[0], 300)
            right_value = clean(form.get("right_repository", [""])[0], 300)
            source = clean(form.get("utm_source", [""])[0], 80) or "direct"
            medium = clean(form.get("utm_medium", [""])[0], 80)
            campaign = clean(form.get("utm_campaign", [""])[0], 120)
            adoption_context = {
                key: clean(form.get(key, [""])[0], 20)
                for key in ("scenario", "sensitivity", "team_size")
            }
            try:
                left_owner, left_repository = parse_github_repository(left_value)
                right_owner, right_repository = parse_github_repository(right_value)
                if (
                    left_owner.lower(),
                    left_repository.lower(),
                ) == (
                    right_owner.lower(),
                    right_repository.lower(),
                ):
                    raise ValueError("请输入两个不同的 GitHub 仓库")
                left_report = audit_github_repository(
                    f"https://github.com/{left_owner}/{left_repository}",
                    adoption_context,
                )
                right_report = audit_github_repository(
                    f"https://github.com/{right_owner}/{right_repository}",
                    adoption_context,
                )
                comparison = compare_adoption_reports(
                    left_report,
                    right_report,
                )
            except ValueError as exc:
                content = (
                    '<section class="hero"><div class="eyebrow">无法完成对比</div>'
                    '<h1>请检查两个候选仓库</h1>'
                    f'<p>{html.escape(str(exc))}</p>'
                    '<a href="/compare">返回重新输入</a></section>'
                )
                self.send_bytes(400, page_shell("对比失败", content))
                return
            left_token = self.store.save_audit_report(
                int(product["id"]),
                left_report,
                source=f"{source}:comparison",
            )
            right_token = self.store.save_audit_report(
                int(product["id"]),
                right_report,
                source=f"{source}:comparison",
            )
            comparison_token = self.store.save_comparison_report(
                int(product["id"]),
                comparison,
                left_token,
                right_token,
                source=source,
            )
            self.store.track_product_event(
                int(product["id"]),
                "comparison_completed",
                source,
                medium,
                campaign,
                {
                    "left": left_report["repository"],
                    "right": right_report["repository"],
                    "winner": comparison["winner"],
                },
            )
            if (
                not is_automated_user_agent(self.headers.get("User-Agent", ""))
                and not is_test_attribution(source, medium, campaign)
            ):
                self.store.track_product_event(
                    int(product["id"]),
                    "qualified_audit",
                    source,
                    medium,
                    campaign,
                    {
                        "kind": "comparison",
                        "left": left_report["repository"],
                        "right": right_report["repository"],
                    },
                )
            self.send_bytes(
                200,
                render_comparison_report(
                    product,
                    comparison,
                    comparison_token,
                ),
            )
            return
        if parsed.path == "/api/github-audit":
            repository = clean(form.get("repository", [""])[0], 300)
            source = clean(form.get("utm_source", [""])[0], 80) or "direct"
            medium = clean(form.get("utm_medium", [""])[0], 80)
            campaign = clean(form.get("utm_campaign", [""])[0], 120)
            adoption_context = {
                key: clean(form.get(key, [""])[0], 20)
                for key in ("scenario", "sensitivity", "team_size")
            }
            try:
                report = audit_github_repository(repository, adoption_context)
            except ValueError as exc:
                content = (
                    '<section class="hero"><div class="eyebrow">无法完成审计</div>'
                    f'<h1>仓库地址需要检查</h1><p>{html.escape(str(exc))}</p>'
                    f'<a href="/p/{html.escape(slug)}">返回重新输入</a></section>'
                )
                self.send_bytes(400, page_shell("审计失败", content))
                return
            self.store.track_product_event(
                product["id"], "audit_completed", source, medium, campaign,
                {"repository": report["repository"], "score": report["score"]},
            )
            if (
                not is_automated_user_agent(self.headers.get("User-Agent", ""))
                and not is_test_attribution(source, medium, campaign)
            ):
                self.store.track_product_event(
                    product["id"], "qualified_audit", source, medium, campaign,
                    {"repository": report["repository"], "score": report["score"]},
                )
            token = self.store.save_audit_report(
                int(product["id"]), report, source=source, is_public=False
            )
            self.send_bytes(200, render_audit_report(product, report, token))
            return
        name = clean(form.get("name", [""])[0], 80)
        contact = clean(form.get("contact", [""])[0], 160)
        problem = clean(form.get("problem", [""])[0], 1500)
        if not name or not contact or not problem or not re.search(r"[@+\w\u4e00-\u9fff]", contact):
            self.send_error_page(400, "信息不完整", "请完整填写称呼、联系方式和业务场景。")
            return
        try:
            self.store.add_lead(product["id"], name, contact, problem, self.client_ip())
        except ValueError as exc:
            self.send_error_page(429, "提交过于频繁", str(exc))
            return
        self.store.event("lead_received", {"product": slug, "lead": "redacted"})
        self.store.track_product_event(product["id"], "lead_submitted")
        content = '<section class="hero"><div class="eyebrow">已收到</div><h1>需求已进入处理队列</h1><p>系统已记录你的问题，将通过你提供的联系方式回复。</p><a href="/">返回产品目录</a></section>'
        self.send_bytes(200, page_shell("提交成功", content))

    def log_message(self, fmt: str, *args: Any) -> None:
        remote_hash = hashlib.sha256(
            f"{self.client_ip()}:{os.environ.get('IP_HASH_SALT','local')}".encode()
        ).hexdigest()[:12]
        print(json.dumps({"time": now_iso(), "remote_hash": remote_hash, "message": fmt % args}, ensure_ascii=False), flush=True)

    def client_ip(self) -> str:
        peer = self.client_address[0]
        if peer in {"127.0.0.1", "::1"}:
            forwarded = self.headers.get("X-Real-IP", "").strip()
            if re.fullmatch(r"[0-9a-fA-F:.]{3,45}", forwarded):
                return forwarded
        return peer


def serve(store: Store) -> None:
    factory = Factory(store)
    Handler.store = store
    Handler.factory = factory

    def loop() -> None:
        while True:
            try:
                factory.run_once()
            except Exception as exc:
                store.event("cycle_error", {"error": clean(exc, 500)})
            time.sleep(SCAN_SECONDS)

    threading.Thread(target=loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(json.dumps({"service": APP_NAME, "listen": f"{HOST}:{PORT}", "public_url": PUBLIC_URL}), flush=True)
    server.serve_forever()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("serve", "run-once", "collect", "dashboard"))
    parser.add_argument("--force-build", action="store_true")
    args = parser.parse_args()
    store = Store()
    factory = Factory(store)
    if args.command == "serve":
        serve(store)
    elif args.command == "collect":
        print(json.dumps(factory.collect(), ensure_ascii=False, indent=2))
    elif args.command == "run-once":
        print(json.dumps(factory.run_once(args.force_build), ensure_ascii=False, indent=2, default=str))
    else:
        print(json.dumps(store.dashboard(), ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
