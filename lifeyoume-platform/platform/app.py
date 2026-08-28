#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ROLE = os.environ.get("SERVICE_ROLE", "portal").strip().lower()
PORTS = {"portal": 8800, "ops": 8801, "auth": 8802, "billing": 8803}
PORT = int(os.environ.get("PORT", str(PORTS.get(ROLE, 8800))))
HOST = os.environ.get("HOST", "127.0.0.1")
REGISTRY_PATH = Path(
    os.environ.get("PRODUCT_REGISTRY", str(ROOT / "config" / "products.json"))
)
SESSION_SECRET = os.environ.get("SESSION_SECRET", "development-only")
OPS_ADMIN_USER = os.environ.get("OPS_ADMIN_USER", "admin")
OPS_ADMIN_PASSWORD_HASH = os.environ.get("OPS_ADMIN_PASSWORD_HASH", "")
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "28800"))
PAYMENT_PROVIDER = os.environ.get("PAYMENT_PROVIDER", "").strip()
PAYMENT_CONFIGURED = os.environ.get("PAYMENT_CONFIGURED", "false").lower() == "true"


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    summary: str
    public_url: str
    health_url: str
    lifecycle: str
    category: str
    owner: str


def load_products(path: Path = REGISTRY_PATH) -> list[Product]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise ValueError("Unsupported product registry schema")
    products: list[Product] = []
    seen: set[str] = set()
    for raw in payload.get("products", []):
        product = Product(**raw)
        if not re.fullmatch(r"[a-z][a-z0-9-]{1,31}", product.id):
            raise ValueError(f"Invalid product id: {product.id}")
        if product.id in seen:
            raise ValueError(f"Duplicate product id: {product.id}")
        if product.lifecycle not in {"live", "reserved", "paused", "retired"}:
            raise ValueError(f"Invalid lifecycle: {product.lifecycle}")
        if urllib.parse.urlparse(product.public_url).scheme != "https":
            raise ValueError(f"Product URL must use HTTPS: {product.id}")
        health = urllib.parse.urlparse(product.health_url)
        if health.scheme != "http" or health.hostname not in {"127.0.0.1", "localhost"}:
            raise ValueError(f"Health URL must be loopback HTTP: {product.id}")
        seen.add(product.id)
        products.append(product)
    return products


def check_product(product: Product, timeout: float = 0.8) -> dict[str, Any]:
    if product.lifecycle != "live":
        return {"status": product.lifecycle, "latency_ms": None}
    started = time.monotonic()
    try:
        request = urllib.request.Request(
            product.health_url, headers={"User-Agent": "LifeYouMePlatform/1.0"}
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            healthy = 200 <= response.status < 300
        return {
            "status": "healthy" if healthy else "degraded",
            "latency_ms": round((time.monotonic() - started) * 1000),
        }
    except (urllib.error.URLError, TimeoutError, OSError):
        return {
            "status": "offline",
            "latency_ms": round((time.monotonic() - started) * 1000),
        }


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    iterations = 310_000
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations, dklen=32
    )
    return (
        f"pbkdf2_sha256${iterations}$"
        f"{base64.urlsafe_b64encode(salt).decode()}$"
        f"{base64.urlsafe_b64encode(digest).decode()}"
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, expected_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        if iterations < 200_000 or iterations > 1_000_000:
            return False
        salt = base64.urlsafe_b64decode(salt_text)
        expected = base64.urlsafe_b64decode(expected_text)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, iterations, dklen=32
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def issue_session(username: str, now: int | None = None) -> str:
    issued = int(time.time() if now is None else now)
    payload = f"{username}|{issued}"
    signature = hmac.new(
        SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{signature}".encode("utf-8")).decode()


def verify_session(token: str, now: int | None = None) -> str | None:
    try:
        decoded = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        username, issued_text, signature = decoded.split("|", 2)
        issued = int(issued_text)
        current = int(time.time() if now is None else now)
        if issued > current + 60 or current - issued > SESSION_TTL_SECONDS:
            return None
        payload = f"{username}|{issued}"
        expected = hmac.new(
            SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return username if hmac.compare_digest(signature, expected) else None
    except (ValueError, UnicodeDecodeError):
        return None


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def page(title: str, body: str, *, ops: bool = False) -> bytes:
    nav = (
        '<a class="brand" href="/">LifeYouMe</a>'
        '<nav><a href="https://lifeyoume.icu">产品</a>'
        + ('<form method="post" action="/logout"><button class="link">退出</button></form>' if ops else "")
        + "</nav>"
    )
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} · LifeYouMe</title>
<style>
:root{{--bg:#f5f7f9;--surface:#fff;--ink:#17202a;--muted:#66717d;--line:#dce2e8;--blue:#1769aa;--blue-soft:#e8f3fb;--green:#087f5b;--amber:#9a6700;--red:#b42318}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}}
header{{height:60px;background:rgba(255,255,255,.94);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1120px)/2));position:sticky;top:0;z-index:2}}
.brand{{font-size:18px;font-weight:600;color:var(--ink);text-decoration:none}}nav{{display:flex;gap:18px;align-items:center}}nav a,.link{{color:var(--muted);text-decoration:none;background:none;border:0;padding:8px 0;font:inherit;cursor:pointer}}
main{{max-width:1120px;margin:auto;padding:52px 24px 72px}}.eyebrow{{font:11px ui-monospace,SFMono-Regular,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--blue);margin-bottom:10px}}
h1{{font-size:40px;line-height:1.12;margin:0 0 16px;max-width:760px;font-weight:600}}h2{{font-size:22px;margin:0 0 8px}}p{{color:var(--muted);margin:0}}.lead{{font-size:17px;max-width:700px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:36px}}.card{{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:20px;text-decoration:none;color:inherit;min-height:190px;display:flex;flex-direction:column;transition:transform .18s,border-color .18s}}
a.card:hover{{transform:translateY(-2px);border-color:#8fb8d6}}.meta{{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:26px}}.tag,.status{{font-size:12px;color:var(--muted)}}.dot{{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;background:#9aa4ad}}.healthy .dot{{background:var(--green)}}.reserved .dot{{background:var(--amber)}}.offline .dot,.degraded .dot{{background:var(--red)}}.arrow{{margin-top:auto;color:var(--blue);padding-top:22px}}
.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:28px 0 24px}}.metric{{background:var(--surface);padding:18px}}.value{{font-size:28px;font-weight:600;color:var(--blue)}}.label{{font-size:12px;color:var(--muted)}}
table{{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line)}}th,td{{padding:14px;text-align:left;border-bottom:1px solid var(--line)}}th{{font-size:12px;color:var(--muted);font-weight:600}}code{{font:12px ui-monospace,SFMono-Regular,monospace}}.panel{{max-width:440px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:26px;margin-top:30px}}
label{{display:block;font-size:12px;color:var(--muted);margin:14px 0 6px}}input{{width:100%;height:42px;border:1px solid var(--line);border-radius:6px;padding:0 12px;font:inherit}}button.primary{{width:100%;height:42px;border:0;border-radius:6px;background:var(--blue);color:#fff;font:600 14px inherit;margin-top:20px;cursor:pointer}}.error{{color:var(--red);margin-top:12px}}
@media(max-width:700px){{h1{{font-size:31px}}main{{padding-top:34px}}.metrics{{grid-template-columns:1fr 1fr}}table{{display:block;overflow-x:auto}}}}
</style></head><body><header>{nav}</header><main>{body}</main></body></html>"""
    return document.encode("utf-8")


def portal_page(products: list[Product]) -> bytes:
    cards = []
    for product in products:
        health = check_product(product)
        state = health["status"]
        enabled = product.lifecycle == "live"
        tag = {
            "healthy": "运行正常",
            "reserved": "待部署",
            "offline": "离线",
            "degraded": "服务异常",
            "paused": "已暂停",
            "retired": "已下线",
        }.get(state, state)
        content = f"""<div class="meta"><span class="tag">{esc(product.category)}</span>
<span class="status {esc(state)}"><span class="dot"></span>{esc(tag)}</span></div>
<h2>{esc(product.name)}</h2><p>{esc(product.summary)}</p>
<span class="arrow">{'进入产品 &rarr;' if enabled else '入口已预留'}</span>"""
        if enabled:
            cards.append(
                f'<a class="card" href="{esc(product.public_url)}">{content}</a>'
            )
        else:
            cards.append(f'<article class="card" aria-disabled="true">{content}</article>')
    body = f"""<div class="eyebrow">独立产品 · 统一可信基座</div>
<h1>每个产品独立运行，共享平台能力。</h1>
<p class="lead">LifeYouMe 的产品拥有独立入口、进程与发布周期，身份、支付和运营能力由平台统一提供。</p>
<section class="grid" aria-label="产品">{''.join(cards)}</section>"""
    return page("产品", body)


def ops_page(products: list[Product], username: str) -> bytes:
    states = [(product, check_product(product)) for product in products]
    live = sum(product.lifecycle == "live" for product, _ in states)
    healthy = sum(state["status"] == "healthy" for _, state in states)
    rows = "".join(
        f"""<tr><td><a href="{esc(product.public_url)}">{esc(product.name)}</a><br><code>{esc(product.id)}</code></td>
<td>{esc(product.lifecycle)}</td><td><span class="status {esc(state['status'])}"><span class="dot"></span>{esc(state['status'])}</span></td>
<td>{esc(state['latency_ms']) + ' ms' if state['latency_ms'] is not None else '-'}</td><td>{esc(product.owner)}</td></tr>"""
        for product, state in states
    )
    body = f"""<div class="eyebrow">运营控制面</div><h1>产品运营</h1>
<p class="lead">当前账号：{esc(username)}。运行状态由服务器通过各产品的私有健康端点实时检查。</p>
<section class="metrics"><div class="metric"><div class="value">{len(products)}</div><div class="label">已注册产品</div></div>
<div class="metric"><div class="value">{live}</div><div class="label">在线产品</div></div>
<div class="metric"><div class="value">{healthy}</div><div class="label">当前健康</div></div>
<div class="metric"><div class="value">4</div><div class="label">基座服务</div></div></section>
<table><thead><tr><th>产品</th><th>生命周期</th><th>运行状态</th><th>延迟</th><th>归属</th></tr></thead><tbody>{rows}</tbody></table>"""
    return page("运营管理", body, ops=True)


def login_page(error: str = "") -> bytes:
    body = f"""<div class="eyebrow">受保护的平台入口</div><h1>登录运营管理端</h1>
<p class="lead">运营控制面与公开产品流量相互隔离。</p>
<form class="panel" method="post" action="/login"><label for="username">账号</label>
<input id="username" name="username" autocomplete="username" required>
<label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button class="primary" type="submit">登录</button>{f'<p class="error">{esc(error)}</p>' if error else ''}</form>"""
    return page("运营端登录", body)


def service_page(service: str) -> bytes:
    if service == "auth":
        title = "统一身份服务"
        description = "独立承载账号、会话、权限以及后续 OIDC 单点登录能力。"
        facts = [("运行方式", "独立服务"), ("公开注册", "未开放"), ("OIDC", "待配置")]
    else:
        title = "统一计费服务"
        description = "独立承载商品、订单、支付签名回调、退款与权益发放。"
        facts = [
            ("运行方式", "独立服务"),
            ("支付渠道", PAYMENT_PROVIDER or "待配置"),
            ("在线结账", "已就绪" if PAYMENT_CONFIGURED else "未启用"),
        ]
    cards = "".join(
        f'<article class="card"><span class="tag">{esc(label)}</span><h2>{esc(value)}</h2></article>'
        for label, value in facts
    )
    body = f"""<div class="eyebrow">平台基座服务</div><h1>{esc(title)}</h1>
<p class="lead">{esc(description)}</p><section class="grid">{cards}</section>"""
    return page(title, body)


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeYouMePlatform/1.0"
    login_attempts: dict[str, list[float]] = {}

    def send_common_headers(self, content_type: str, length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        )
        self.send_header("Cache-Control", "no-store" if ROLE == "ops" else "public, max-age=60")

    def send_body(self, status: int, body: bytes, content_type: str = "text/html; charset=utf-8") -> None:
        self.send_response(status)
        self.send_common_headers(content_type, len(body))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        self.send_body(
            status,
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            "application/json; charset=utf-8",
        )

    def session_user(self) -> str | None:
        jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        token = jar.get("lym_ops_session")
        return verify_session(token.value) if token else None

    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/healthz":
            self.send_json(200, {"status": "ok", "service": ROLE})
            return
        if path == "/api/v1/status" and ROLE in {"auth", "billing"}:
            payload: dict[str, Any] = {"status": "ok", "service": ROLE}
            if ROLE == "billing":
                payload.update(
                    {"provider": PAYMENT_PROVIDER or None, "checkout_enabled": PAYMENT_CONFIGURED}
                )
            self.send_json(200, payload)
            return
        if path == "/api/v1/products" and ROLE in {"portal", "ops"}:
            products = [
                {
                    "id": item.id,
                    "name": item.name,
                    "public_url": item.public_url,
                    "lifecycle": item.lifecycle,
                    "runtime": check_product(item),
                }
                for item in load_products()
            ]
            self.send_json(200, {"schema_version": 1, "products": products})
            return
        if path != "/":
            self.send_body(404, page("Not found", "<h1>Page not found</h1>"))
            return
        if ROLE == "portal":
            self.send_body(200, portal_page(load_products()))
        elif ROLE == "ops":
            user = self.session_user()
            self.send_body(200, ops_page(load_products(), user) if user else login_page())
        elif ROLE in {"auth", "billing"}:
            self.send_body(200, service_page(ROLE))
        else:
            self.send_json(503, {"status": "error", "message": "Unknown service role"})

    def do_POST(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if ROLE != "ops" or path not in {"/login", "/logout"}:
            self.send_json(404, {"status": "error", "message": "Not found"})
            return
        if path == "/logout":
            self.send_response(303)
            self.send_header("Location", "/")
            self.send_header(
                "Set-Cookie",
                "lym_ops_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
            )
            self.end_headers()
            return
        client = self.client_address[0]
        now = time.monotonic()
        attempts = [stamp for stamp in self.login_attempts.get(client, []) if now - stamp < 900]
        if len(attempts) >= 8:
            self.send_body(429, login_page("Too many attempts. Try again later."))
            return
        length = min(int(self.headers.get("Content-Length", "0")), 4096)
        form = urllib.parse.parse_qs(self.rfile.read(length).decode("utf-8"))
        username = form.get("username", [""])[0][:80]
        password = form.get("password", [""])[0][:200]
        valid = (
            bool(OPS_ADMIN_PASSWORD_HASH)
            and hmac.compare_digest(username, OPS_ADMIN_USER)
            and verify_password(password, OPS_ADMIN_PASSWORD_HASH)
        )
        if not valid:
            attempts.append(now)
            self.login_attempts[client] = attempts
            self.send_body(401, login_page("Invalid username or password."))
            return
        self.login_attempts.pop(client, None)
        self.send_response(303)
        self.send_header("Location", "/")
        self.send_header(
            "Set-Cookie",
            f"lym_ops_session={issue_session(username)}; Path=/; Max-Age={SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict",
        )
        self.end_headers()

    def log_message(self, fmt: str, *args: Any) -> None:
        remote = hashlib.sha256(self.client_address[0].encode()).hexdigest()[:10]
        print(
            json.dumps(
                {"time": int(time.time()), "service": ROLE, "remote": remote, "message": fmt % args}
            ),
            flush=True,
        )


def main() -> None:
    if ROLE not in PORTS:
        raise SystemExit(f"Unsupported SERVICE_ROLE: {ROLE}")
    load_products()
    if ROLE == "ops" and (
        SESSION_SECRET == "development-only" or not OPS_ADMIN_PASSWORD_HASH
    ):
        raise SystemExit("Ops requires SESSION_SECRET and OPS_ADMIN_PASSWORD_HASH")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(json.dumps({"service": ROLE, "listen": f"{HOST}:{PORT}"}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
