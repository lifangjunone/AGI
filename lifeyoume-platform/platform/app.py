#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
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
PLATFORM_DIR = Path(__file__).resolve().parent
if str(PLATFORM_DIR) not in sys.path:
    sys.path.insert(0, str(PLATFORM_DIR))

from auth_store import AuthStore, AuthUser


ASSET_ROOT = ROOT / "platform" / "assets"
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
AUTH_DB_PATH = Path(os.environ.get("AUTH_DB", str(ROOT / "data" / "auth.db")))
SSO_SESSION_TTL_SECONDS = int(
    os.environ.get("SSO_SESSION_TTL_SECONDS", str(30 * 24 * 60 * 60))
)
AUTH_REGISTRATION_ENABLED = (
    os.environ.get("AUTH_REGISTRATION_ENABLED", "true").lower() == "true"
)
SSO_COOKIE = "lym_sso_session"
CSRF_COOKIE = "lym_auth_csrf"
ADMIN_COOKIE = "lym_admin_session"
ADMIN_CSRF_COOKIE = "lym_admin_csrf"
AUTH_STORE = AuthStore(AUTH_DB_PATH)


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    tagline: str
    summary: str
    public_url: str
    health_url: str
    lifecycle: str
    availability: str
    category: str
    owner: str
    audience: str
    platforms: tuple[str, ...]
    capabilities: tuple[str, ...]
    featured: bool
    visibility: str
    visual: str
    accent: str
    cta: str


def load_products(path: Path = REGISTRY_PATH) -> list[Product]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") not in {1, 2}:
        raise ValueError("Unsupported product registry schema")
    products: list[Product] = []
    seen: set[str] = set()
    for raw in payload.get("products", []):
        product = Product(
            id=raw["id"],
            name=raw["name"],
            tagline=raw.get("tagline", raw["summary"]),
            summary=raw["summary"],
            public_url=raw.get("public_url", ""),
            health_url=raw.get("health_url", ""),
            lifecycle=raw["lifecycle"],
            availability=raw.get(
                "availability", "online" if raw["lifecycle"] == "live" else "showcase"
            ),
            category=raw["category"],
            owner=raw["owner"],
            audience=raw.get("audience", ""),
            platforms=tuple(raw.get("platforms", [])),
            capabilities=tuple(raw.get("capabilities", [])),
            featured=bool(raw.get("featured", False)),
            visibility=raw.get("visibility", "public"),
            visual=raw.get("visual", ""),
            accent=raw.get("accent", "cobalt"),
            cta=raw.get("cta", "查看产品"),
        )
        if not re.fullmatch(r"[a-z][a-z0-9-]{1,31}", product.id):
            raise ValueError(f"Invalid product id: {product.id}")
        if product.id in seen:
            raise ValueError(f"Duplicate product id: {product.id}")
        if product.lifecycle not in {
            "live", "beta", "preview", "internal", "reserved", "paused", "retired"
        }:
            raise ValueError(f"Invalid lifecycle: {product.lifecycle}")
        if product.public_url and urllib.parse.urlparse(product.public_url).scheme != "https":
            raise ValueError(f"Product URL must use HTTPS: {product.id}")
        if product.health_url:
            health = urllib.parse.urlparse(product.health_url)
            if health.scheme != "http" or health.hostname not in {"127.0.0.1", "localhost"}:
                raise ValueError(f"Health URL must be loopback HTTP: {product.id}")
        if product.visibility not in {"public", "lab", "internal"}:
            raise ValueError(f"Invalid visibility: {product.visibility}")
        seen.add(product.id)
        products.append(product)
    return products


def check_product(product: Product, timeout: float = 0.8) -> dict[str, Any]:
    if product.lifecycle != "live":
        return {"status": product.lifecycle, "latency_ms": None}
    if not product.health_url:
        return {"status": "live", "latency_ms": None}
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


def page(
    title: str,
    body: str,
    *,
    ops: bool = False,
    portal: bool = False,
    admin: bool = False,
) -> bytes:
    if ops:
        nav = (
            '<a href="https://lifeyoume.icu/products">产品目录</a>'
            '<form method="post" action="/logout"><button class="nav-link">退出</button></form>'
        )
    else:
        nav = (
            '<a href="https://lifeyoume.icu/products">全部产品</a>'
            '<a href="https://lifeyoume.icu/products?scope=lab">实验室</a>'
            '<a href="https://auth.lifeyoume.icu/account">账号</a>'
        )
    content = body if portal else f"<main>{body}</main>"
    body_class = "admin-page" if admin else ("portal-page" if portal else "service-page")
    header = "" if admin else f"""<header class="site-header">
  <a class="brand" href="/"><span class="brand-glyph">LY</span><span>LifeYouMe<small>PRODUCT STUDIO</small></span></a>
  <nav aria-label="主导航">{nav}</nav>
</header>"""
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="LifeYouMe 产品展厅：把 AI 变成真正可使用的个人工具与生产系统。">
<meta name="theme-color" content="#111411">
<title>{esc(title)} · LifeYouMe</title>
<link rel="stylesheet" href="/assets/portal.css?v=3">
</head><body class="{body_class}">
{header}
{content}
{'<script src="/assets/portal.js?v=3" defer></script>' if portal else ''}
</body></html>"""
    return document.encode("utf-8")


STATUS_LABELS = {
    "healthy": "在线可用",
    "live": "在线可用",
    "beta": "内测中",
    "preview": "产品预览",
    "internal": "内部组件",
    "reserved": "待部署",
    "offline": "暂时离线",
    "degraded": "服务异常",
    "paused": "已暂停",
    "retired": "已下线",
}


def visible_products(products: list[Product]) -> list[Product]:
    return [item for item in products if item.visibility in {"public", "lab"}]


def product_status(product: Product) -> tuple[str, str]:
    runtime = check_product(product)
    state = runtime["status"]
    return state, STATUS_LABELS.get(state, state)


def product_visual(product: Product, *, large: bool = False) -> str:
    visual_class = "product-visual large" if large else "product-visual"
    if product.visual:
        return (
            f'<div class="{visual_class}"><img src="/assets/{esc(product.visual)}" '
            f'alt="{esc(product.name)} 产品界面" loading="{"eager" if large else "lazy"}"></div>'
        )
    initials = "".join(part[:1] for part in re.split(r"[\s/·]+", product.name) if part)[:3]
    return (
        f'<div class="{visual_class} visual-fallback accent-{esc(product.accent)}">'
        f'<span>{esc(initials or product.name[:2])}</span>'
        f'<small>{esc(product.category)}</small></div>'
    )


def product_card(product: Product) -> str:
    state, label = product_status(product)
    platforms = "".join(f"<span>{esc(item)}</span>" for item in product.platforms[:3])
    return f"""<article class="product-card" data-category="{esc(product.category)}"
 data-scope="{esc(product.visibility)}" data-search="{esc(product.name + ' ' + product.tagline + ' ' + product.summary)}">
{product_visual(product)}
<div class="product-card-body">
  <div class="product-meta"><span>{esc(product.category)}</span><span class="status {esc(state)}"><i></i>{esc(label)}</span></div>
  <h3>{esc(product.name)}</h3>
  <p>{esc(product.tagline)}</p>
  <div class="platforms">{platforms}</div>
  <a class="product-link" href="/products/{esc(product.id)}">查看产品 <span aria-hidden="true">↗</span></a>
</div></article>"""


def portal_page(products: list[Product]) -> bytes:
    public = visible_products(products)
    featured = [item for item in public if item.featured][:6]
    cards = "".join(product_card(item) for item in featured)
    total = len(public)
    online = sum(item.lifecycle == "live" for item in public)
    categories = len({item.category for item in public})
    body = f"""<main>
<section class="hero">
  <div class="hero-image" role="img" aria-label="LifeYouMe 多款产品界面"></div>
  <div class="hero-shade"></div>
  <div class="hero-content">
    <p class="eyebrow light">LIFEYOUME PRODUCT STUDIO · 2026</p>
    <h1>LifeYouMe</h1>
    <p class="hero-line">把 AI 变成真正可使用的个人工具与生产系统。</p>
    <div class="hero-actions">
      <a class="button primary" href="/products">探索全部产品</a>
      <a class="button ghost" href="/video/">打开智助乖乖</a>
    </div>
    <dl class="hero-stats">
      <div><dt>{total:02d}</dt><dd>公开产品与实验</dd></div>
      <div><dt>{online:02d}</dt><dd>当前在线产品</dd></div>
      <div><dt>{categories:02d}</dt><dd>产品方向</dd></div>
    </dl>
  </div>
</section>
<section class="showcase band">
  <div class="section-head">
    <div><p class="eyebrow">SELECTED PRODUCTS</p><h2>正在形成的产品组合</h2></div>
    <a class="section-link" href="/products">查看全部 {total} 个产品</a>
  </div>
  <div class="product-grid">{cards}</div>
</section>
<section class="collections band">
  <div class="section-head">
    <div><p class="eyebrow">PRODUCT COLLECTIONS</p><h2>从个人工具到生产系统</h2></div>
  </div>
  <div class="collection-list">
    <a href="/products?category=AI%20创作"><b>01</b><span><strong>AI 创作</strong><small>内容、短视频与长篇故事生产</small></span><em>2 PRODUCTS</em></a>
    <a href="/products?category=学习成长"><b>02</b><span><strong>学习成长</strong><small>语言学习、职业训练与阅读辅助</small></span><em>5 PRODUCTS</em></a>
    <a href="/products?category=AI%20工程"><b>03</b><span><strong>AI 工程</strong><small>情报、Agent、模型与交付控制</small></span><em>5 PRODUCTS</em></a>
    <a href="/products?category=隐私工具"><b>04</b><span><strong>隐私工具</strong><small>本地优先的数据与个人信息管理</small></span><em>1 PRODUCT</em></a>
    <a href="/products?category=企业服务"><b>05</b><span><strong>企业服务</strong><small>面向真实决策和验收的专业服务</small></span><em>1 PRODUCT</em></a>
  </div>
</section>
<section class="principles band" id="principles">
  <div class="principle-intro"><p class="eyebrow">HOW WE BUILD</p><h2>产品可以不同，底线必须一致。</h2></div>
  <div class="principle-grid">
    <div><b>01</b><h3>真实能力</h3><p>未接入的模型、支付和平台能力明确标记，不用演示数据伪装生产状态。</p></div>
    <div><b>02</b><h3>本地优先</h3><p>能在设备侧完成的处理留在设备侧，凭据与隐私数据不进入浏览器包。</p></div>
    <div><b>03</b><h3>证据交付</h3><p>任务、产物、状态与限制均可追溯，让结果不仅能看，也能够被验证。</p></div>
  </div>
</section>
</main>
<footer class="site-footer"><span>LifeYouMe · Product Studio</span><span>Independent products. Shared standards.</span></footer>"""
    return page("产品展厅", body, portal=True)


def catalog_page(products: list[Product]) -> bytes:
    public = visible_products(products)
    cards = "".join(product_card(item) for item in public)
    categories = ["全部", "AI 创作", "学习成长", "AI 工程", "隐私工具", "企业服务"]
    controls = "".join(
        f'<button type="button" data-category-filter="{esc(item)}">{esc(item)}</button>'
        for item in categories
    )
    body = f"""<main class="catalog-main">
<section class="catalog-intro">
  <p class="eyebrow">PRODUCT INDEX · {len(public):02d}</p>
  <h1>产品目录</h1>
  <p>浏览当前在线产品、桌面工具与实验室项目。每项状态均对应真实交付能力。</p>
</section>
<section class="catalog-controls" aria-label="产品筛选">
  <div class="segmented">{controls}</div>
  <label class="catalog-search"><span>搜索</span><input id="product-search" type="search" placeholder="产品、能力或场景"></label>
</section>
<p class="catalog-result" aria-live="polite"><strong id="visible-count">{len(public)}</strong> 个产品</p>
<section class="product-grid catalog-grid" id="product-grid">{cards}</section>
<section class="catalog-empty" id="catalog-empty" hidden><strong>没有匹配产品</strong><span>尝试其他分类或关键词。</span></section>
</main>
<footer class="site-footer"><span>LifeYouMe · Product Index</span><a href="/">返回产品展厅</a></footer>"""
    return page("产品目录", body, portal=True)


def product_page(product: Product) -> bytes:
    state, label = product_status(product)
    capabilities = "".join(
        f"<li><span>{index:02d}</span>{esc(item)}</li>"
        for index, item in enumerate(product.capabilities, 1)
    )
    platforms = "".join(f"<span>{esc(item)}</span>" for item in product.platforms)
    if product.public_url:
        action = f'<a class="button primary" href="{esc(product.public_url)}">{esc(product.cta)}</a>'
    else:
        action = '<span class="button disabled" aria-disabled="true">暂未开放公开入口</span>'
    body = f"""<main class="detail-main">
<a class="back-link" href="/products">← 返回产品目录</a>
<section class="product-hero accent-{esc(product.accent)}">
  <div class="product-hero-copy">
    <div class="product-meta"><span>{esc(product.category)}</span><span class="status {esc(state)}"><i></i>{esc(label)}</span></div>
    <h1>{esc(product.name)}</h1>
    <p class="detail-tagline">{esc(product.tagline)}</p>
    <p class="detail-summary">{esc(product.summary)}</p>
    <div class="hero-actions">{action}</div>
  </div>
  {product_visual(product, large=True)}
</section>
<section class="product-facts">
  <div><span>适用人群</span><strong>{esc(product.audience)}</strong></div>
  <div><span>产品形态</span><div class="platforms">{platforms}</div></div>
  <div><span>当前阶段</span><strong>{esc(label)}</strong></div>
</section>
<section class="capability-section">
  <div><p class="eyebrow">CORE CAPABILITIES</p><h2>核心能力</h2></div>
  <ol>{capabilities}</ol>
</section>
<section class="detail-note">
  <p class="eyebrow">DELIVERY STATUS</p>
  <p>页面只展示当前真实可用范围。没有公开入口的桌面产品和实验室项目不会被标记为在线服务。</p>
</section>
</main>
<footer class="site-footer"><span>LifeYouMe · {esc(product.name)}</span><a href="/products">全部产品</a></footer>"""
    return page(product.name, body, portal=True)


def ops_page(products: list[Product], username: str) -> bytes:
    states = [(product, check_product(product)) for product in products]
    live = sum(product.lifecycle == "live" for product, _ in states)
    healthy = sum(state["status"] == "healthy" for _, state in states)
    rows = "".join(
        f"""<tr><td>{f'<a href="{esc(product.public_url)}">{esc(product.name)}</a>' if product.public_url else esc(product.name)}<br><code>{esc(product.id)}</code></td>
<td>{esc(product.lifecycle)}</td><td><span class="status {esc(state['status'])}"><i></i>{esc(state['status'])}</span></td>
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


def admin_login_page(csrf_token: str, error: str = "") -> bytes:
    body = f"""<main class="admin-login-main">
<section class="auth-copy"><p class="eyebrow">PLATFORM ADMINISTRATION</p>
<h1>底座管理后台</h1>
<p>统一管理 LifeYouMe 用户状态、密码重置和各子产品的登录策略。</p></section>
<section class="auth-panel admin-login-panel">
<form method="post" action="/admin/login">
<input type="hidden" name="csrf_token" value="{esc(csrf_token)}">
<label for="username">管理员账号</label>
<input id="username" name="username" autocomplete="username" required>
<label for="password">管理员密码</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button class="button primary auth-submit" type="submit">进入管理后台</button>
{f'<p class="error" role="alert">{esc(error)}</p>' if error else ''}
</form></section></main>"""
    return page("底座管理后台", body, portal=True)


def format_admin_time(value: object) -> str:
    if not value:
        return "-"
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(int(value)))


def admin_dashboard(
    products: list[Product],
    username: str,
    csrf_token: str,
    notice: str = "",
) -> bytes:
    users = AUTH_STORE.list_users()
    active_users = sum(item["status"] == "active" for item in users)
    user_rows = []
    for user in users:
        active = user["status"] == "active"
        next_status = "disabled" if active else "active"
        status_label = "已启用" if active else "已禁用"
        action_label = "禁用" if active else "启用"
        user_rows.append(
            f"""<tr data-admin-row data-search="{esc(user["display_name"] + " " + user["email"])}">
<td><strong>{esc(user["display_name"])}</strong><small>{esc(user["email"])}</small></td>
<td><span class="admin-status {'active' if active else 'disabled'}"><i></i>{status_label}</span></td>
<td>{esc(format_admin_time(user["last_login_at"]))}</td>
<td class="admin-actions">
  <form method="post" action="/admin/users/status">
    <input type="hidden" name="csrf_token" value="{esc(csrf_token)}">
    <input type="hidden" name="user_id" value="{esc(user["id"])}">
    <input type="hidden" name="status" value="{next_status}">
    <button class="table-button {'danger' if active else 'positive'}" type="submit">{action_label}</button>
  </form>
  <form class="password-reset-form" method="post" action="/admin/users/password">
    <input type="hidden" name="csrf_token" value="{esc(csrf_token)}">
    <input type="hidden" name="user_id" value="{esc(user["id"])}">
    <label><span>新密码</span><input name="new_password" type="password" minlength="12"
      maxlength="200" autocomplete="new-password" placeholder="至少 12 位" required></label>
    <button class="table-button" type="submit">修改密码</button>
  </form>
</td></tr>"""
        )
    if not user_rows:
        user_rows.append(
            '<tr><td colspan="4" class="admin-empty">暂无注册账号</td></tr>'
        )

    policy_rows = []
    for product in products:
        required = AUTH_STORE.login_required(product.id)
        next_required = "false" if required else "true"
        policy_rows.append(
            f"""<tr data-admin-row data-search="{esc(product.name + " " + product.id + " " + product.category)}">
<td><strong>{esc(product.name)}</strong><small>{esc(product.id)}</small></td>
<td>{esc(product.category)}</td>
<td><span class="admin-status {'required' if required else 'optional'}"><i></i>
{'需要登录' if required else '免登录直达'}</span></td>
<td><form method="post" action="/admin/products/login-policy">
  <input type="hidden" name="csrf_token" value="{esc(csrf_token)}">
  <input type="hidden" name="product_id" value="{esc(product.id)}">
  <input type="hidden" name="login_required" value="{next_required}">
  <button class="table-button" type="submit">{'关闭登录' if required else '开启登录'}</button>
</form></td></tr>"""
        )

    audit_items = AUTH_STORE.recent_admin_audit()
    audit_rows = "".join(
        f"""<tr data-admin-row data-search="{esc(item["actor"] + " " + item["action"] + " " + item["target_id"])}"><td>{esc(format_admin_time(item["created_at"]))}</td>
<td>{esc(item["actor"])}</td><td><code>{esc(item["action"])}</code></td>
<td>{esc(item["target_id"])}</td></tr>"""
        for item in audit_items
    )
    if not audit_rows:
        audit_rows = '<tr><td colspan="4" class="admin-empty">暂无管理操作</td></tr>'

    notice_map = {
        "user-status": "账号状态已更新，相关会话已按策略处理。",
        "password": "账号密码已更新，原有 Web 与设备会话已全部失效。",
        "product-policy": "产品登录策略已生效，无需重载服务。",
    }
    notice_text = notice_map.get(notice, "")
    login_required_count = sum(
        AUTH_STORE.login_required(item.id) for item in products
    )
    latest_actions = "".join(
        f"""<li><span>{esc(format_admin_time(item["created_at"]))}</span>
<strong>{esc(item["action"])}</strong><small>{esc(item["target_id"])}</small></li>"""
        for item in audit_items[:5]
    ) or "<li class=\"admin-empty\">暂无管理操作</li>"
    body = f"""<main class="admin-app" data-admin-app>
<aside class="admin-rail">
  <a class="admin-brand" href="/admin/"><span>LY</span><strong>LifeYouMe<small>CONTROL PLANE</small></strong></a>
  <div class="admin-rail-label">工作区</div>
  <nav class="admin-nav" aria-label="后台分区">
    <a href="#overview" data-admin-target="overview"><b>01</b><span>总览</span></a>
    <a href="#users" data-admin-target="users"><b>02</b><span>账号管理</span><em>{len(users)}</em></a>
    <a href="#products" data-admin-target="products"><b>03</b><span>产品登录</span><em>{len(products)}</em></a>
    <a href="#audit" data-admin-target="audit"><b>04</b><span>操作审计</span></a>
  </nav>
  <div class="admin-rail-footer">
    <div><span>当前管理员</span><strong>{esc(username)}</strong></div>
    <form method="post" action="/admin/logout"><button type="submit">退出</button></form>
  </div>
</aside>
<section class="admin-console">
  <header class="admin-console-header">
    <div><span>LIFEYOUME PLATFORM</span><h1 data-admin-title>平台总览</h1></div>
    <a href="https://lifeyoume.icu/" target="_blank" rel="noopener">打开产品门户 ↗</a>
  </header>
  {f'<div class="admin-notice" role="status">{esc(notice_text)}</div>' if notice_text else ''}
  <div class="admin-view-stack">
    <section class="admin-view" data-admin-view="overview">
      <div class="admin-metrics" aria-label="平台摘要">
        <div><strong>{len(users):02d}</strong><span>注册账号</span><small>{active_users} 个正常使用</small></div>
        <div><strong>{active_users:02d}</strong><span>已启用账号</span><small>{len(users) - active_users} 个已禁用</small></div>
        <div><strong>{len(products):02d}</strong><span>注册产品</span><small>统一目录管理</small></div>
        <div><strong>{login_required_count:02d}</strong><span>启用登录</span><small>{len(products) - login_required_count} 个免登录</small></div>
      </div>
      <div class="admin-overview-grid">
        <section class="admin-overview-panel">
          <div class="admin-panel-title"><span>访问策略</span><a href="#products" data-admin-target="products">管理策略</a></div>
          <div class="policy-gauge"><strong>{login_required_count}/{len(products)}</strong><span>产品当前要求统一登录</span></div>
          <progress class="policy-bar" value="{login_required_count}" max="{max(len(products), 1)}">{login_required_count}/{len(products)}</progress>
          <p>策略由身份服务实时判断，修改后立即生效，无需重新部署。</p>
        </section>
        <section class="admin-overview-panel">
          <div class="admin-panel-title"><span>最近操作</span><a href="#audit" data-admin-target="audit">查看全部</a></div>
          <ol class="admin-activity">{latest_actions}</ol>
        </section>
      </div>
    </section>
    <section class="admin-view" data-admin-view="users" hidden>
      <div class="admin-view-head">
        <div><p class="eyebrow">ACCOUNTS</p><h2>账号管理</h2><p>禁用或改密会立即撤销该账号全部会话。</p></div>
        <label class="admin-search"><span>搜索账号</span><input type="search" data-admin-search="users" placeholder="姓名或邮箱"></label>
      </div>
      <div class="admin-data-panel" data-admin-table="users" data-page-size="7">
        <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>账号</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
        <tbody>{''.join(user_rows)}</tbody></table></div>
        <div class="admin-pager"><span data-admin-result></span><div><button type="button" data-admin-prev>上一页</button><span data-admin-page></span><button type="button" data-admin-next>下一页</button></div></div>
      </div>
    </section>
    <section class="admin-view" data-admin-view="products" hidden>
      <div class="admin-view-head">
        <div><p class="eyebrow">ACCESS POLICY</p><h2>子产品登录策略</h2><p>关闭后直接进入产品首页，开启后进入统一登录。</p></div>
        <label class="admin-search"><span>搜索产品</span><input type="search" data-admin-search="products" placeholder="名称、分类或 ID"></label>
      </div>
      <div class="admin-data-panel" data-admin-table="products" data-page-size="7">
        <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>产品</th><th>分类</th><th>当前策略</th><th>操作</th></tr></thead>
        <tbody>{''.join(policy_rows)}</tbody></table></div>
        <div class="admin-pager"><span data-admin-result></span><div><button type="button" data-admin-prev>上一页</button><span data-admin-page></span><button type="button" data-admin-next>下一页</button></div></div>
      </div>
    </section>
    <section class="admin-view" data-admin-view="audit" hidden>
      <div class="admin-view-head">
        <div><p class="eyebrow">AUDIT TRAIL</p><h2>操作审计</h2><p>账号和访问策略变更均保留可追踪记录。</p></div>
        <label class="admin-search"><span>搜索记录</span><input type="search" data-admin-search="audit" placeholder="操作者、动作或目标"></label>
      </div>
      <div class="admin-data-panel" data-admin-table="audit" data-page-size="8">
        <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>目标</th></tr></thead>
        <tbody>{audit_rows}</tbody></table></div>
        <div class="admin-pager"><span data-admin-result></span><div><button type="button" data-admin-prev>上一页</button><span data-admin-page></span><button type="button" data-admin-next>下一页</button></div></div>
      </div>
    </section>
  </div>
</section>
</main>"""
    return page("底座管理后台", body, portal=True, admin=True)


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


def safe_return_to(value: str) -> str:
    fallback = "https://lifeyoume.icu/"
    if not value:
        return fallback
    parsed = urllib.parse.urlparse(value)
    hostname = (parsed.hostname or "").lower()
    if (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and (hostname == "lifeyoume.icu" or hostname.endswith(".lifeyoume.icu"))
    ):
        return value
    return fallback


def trusted_origin(value: str) -> str | None:
    if not value:
        return None
    parsed = urllib.parse.urlparse(value)
    hostname = (parsed.hostname or "").lower()
    if (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and not parsed.path.strip("/")
        and not parsed.query
        and not parsed.fragment
        and (hostname == "lifeyoume.icu" or hostname.endswith(".lifeyoume.icu"))
    ):
        return value.rstrip("/")
    return None


def sso_login_url(return_to: str) -> str:
    return (
        "https://auth.lifeyoume.icu/login?return_to="
        + urllib.parse.quote(safe_return_to(return_to), safe="")
    )


def auth_form_page(
    mode: str, csrf_token: str, return_to: str, error: str = ""
) -> bytes:
    registering = mode == "register"
    title = "创建 LifeYouMe 账号" if registering else "登录 LifeYouMe"
    action = "/register" if registering else "/login"
    alternate = (
        f'<a href="/login?return_to={urllib.parse.quote(return_to, safe="")}">已有账号，直接登录</a>'
        if registering
        else f'<a href="/register?return_to={urllib.parse.quote(return_to, safe="")}">创建统一账号</a>'
    )
    display_name = (
        '<label for="display_name">显示名称</label>'
        '<input id="display_name" name="display_name" maxlength="80" autocomplete="name" required>'
        if registering
        else ""
    )
    note = (
        "一个账号可进入 LifeYouMe 的 Web、桌面和移动产品。"
        if registering
        else "登录一次，即可在 LifeYouMe 产品间切换。"
    )
    body = f"""<main class="auth-main"><section class="auth-copy">
<p class="eyebrow">LIFEYOUME IDENTITY</p><h1>{esc(title)}</h1>
<p>{esc(note)}</p>
<ul><li>跨产品单点登录</li><li>产品数据继续独立存储</li><li>密码只由身份服务验证</li></ul>
</section>
<section class="auth-panel">
<form method="post" action="{action}">
<input type="hidden" name="csrf_token" value="{esc(csrf_token)}">
<input type="hidden" name="return_to" value="{esc(return_to)}">
{display_name}
<label for="email">邮箱</label>
<input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>
<label for="password">密码</label>
<input id="password" name="password" type="password" minlength="12"
 autocomplete="{'new-password' if registering else 'current-password'}" required>
<button class="button primary auth-submit" type="submit">{'创建账号' if registering else '登录'}</button>
{f'<p class="error" role="alert">{esc(error)}</p>' if error else ''}
</form>
<div class="auth-alternate">{alternate}</div>
</section></main>"""
    return page(title, body, portal=True)


def account_page(user: AuthUser) -> bytes:
    body = f"""<main class="auth-main account-main"><section class="auth-copy">
<p class="eyebrow">LIFEYOUME ACCOUNT</p><h1>{esc(user.display_name)}</h1>
<p>{esc(user.email)}</p>
<div class="account-id"><span>USER ID</span><code>{esc(user.id)}</code></div>
</section>
<section class="auth-panel account-panel">
<h2>统一账号已连接</h2>
<p>当前会话适用于 `lifeyoume.icu` 及其产品子域。产品业务数据仍由各产品独立管理。</p>
<a class="button" href="https://lifeyoume.icu/products">进入产品目录</a>
<form method="post" action="/logout"><button class="nav-link danger" type="submit">退出所有 Web 产品</button></form>
</section></main>"""
    return page("账号", body, portal=True)


def device_page(
    user_code: str, user: AuthUser | None, csrf_token: str = "", message: str = ""
) -> bytes:
    if user:
        form = f"""<form method="post" action="/device">
<input type="hidden" name="user_code" value="{esc(user_code)}">
<input type="hidden" name="csrf_token" value="{esc(csrf_token)}">
<button class="button primary auth-submit" type="submit">授权此设备</button></form>"""
    else:
        return_to = "https://auth.lifeyoume.icu/device?user_code=" + urllib.parse.quote(
            user_code
        )
        form = f'<a class="button primary" href="{esc(sso_login_url(return_to))}">先登录账号</a>'
    body = f"""<main class="auth-main"><section class="auth-copy">
<p class="eyebrow">DEVICE AUTHORIZATION</p><h1>连接桌面产品</h1>
<p>仅授权你正在使用的 LifeYouMe 应用。设备不会接触你的账号密码。</p>
</section><section class="auth-panel">
<label>设备代码</label><div class="device-code">{esc(user_code or "---- ----")}</div>
{form}{f'<p class="success">{esc(message)}</p>' if message else ''}
</section></main>"""
    return page("设备授权", body, portal=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeYouMePlatform/2.0"
    login_attempts: dict[str, list[float]] = {}

    def send_common_headers(self, content_type: str, length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self'; "
            "script-src 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
        )
        self.send_header(
            "Cache-Control", "no-store" if ROLE in {"ops", "auth"} else "public, max-age=60"
        )
        origin = trusted_origin(self.headers.get("Origin", ""))
        if ROLE == "auth" and origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")

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

    def send_json_headers(
        self, status: int, payload: dict[str, Any], headers: dict[str, str]
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_with_headers(
            status, body, headers, "application/json; charset=utf-8"
        )

    def send_with_headers(
        self,
        status: int,
        body: bytes,
        headers: dict[str, str],
        content_type: str = "text/html; charset=utf-8",
    ) -> None:
        self.send_response(status)
        self.send_common_headers(content_type, len(body))
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location: str, headers: dict[str, str] | None = None) -> None:
        self.send_response(303)
        self.send_header("Location", location)
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def cookie_jar(self) -> cookies.SimpleCookie[str]:
        return cookies.SimpleCookie(self.headers.get("Cookie", ""))

    def cookie_value(self, name: str) -> str:
        morsel = self.cookie_jar().get(name)
        return morsel.value if morsel else ""

    def form_data(self, limit: int = 8192) -> dict[str, str]:
        length = min(int(self.headers.get("Content-Length", "0")), limit)
        raw = self.rfile.read(length).decode("utf-8")
        if self.headers.get("Content-Type", "").split(";", 1)[0] == "application/json":
            payload = json.loads(raw or "{}")
            return {
                str(key): str(value)
                for key, value in payload.items()
                if isinstance(value, (str, int, float))
            }
        parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
        return {key: values[0] for key, values in parsed.items()}

    def sso_user(self) -> AuthUser | None:
        authorization = self.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            return AUTH_STORE.bearer_user(authorization.removeprefix("Bearer ").strip())
        return AUTH_STORE.session_user(self.cookie_value(SSO_COOKIE))

    def csrf_valid(self, form: dict[str, str]) -> bool:
        submitted = form.get("csrf_token", "")
        cookie_token = self.cookie_value(CSRF_COOKIE)
        return bool(submitted and cookie_token) and hmac.compare_digest(
            submitted, cookie_token
        )

    def rate_limited(self, limit: int = 8) -> bool:
        client = self.client_address[0]
        now = time.monotonic()
        attempts = [
            stamp for stamp in self.login_attempts.get(client, []) if now - stamp < 900
        ]
        self.login_attempts[client] = attempts
        return len(attempts) >= limit

    def record_failed_attempt(self) -> None:
        self.login_attempts.setdefault(self.client_address[0], []).append(
            time.monotonic()
        )

    def clear_failed_attempts(self) -> None:
        self.login_attempts.pop(self.client_address[0], None)

    @staticmethod
    def sso_cookie(token: str, max_age: int = SSO_SESSION_TTL_SECONDS) -> str:
        return (
            f"{SSO_COOKIE}={token}; Domain=.lifeyoume.icu; Path=/; "
            f"Max-Age={max_age}; HttpOnly; Secure; SameSite=Lax"
        )

    @staticmethod
    def csrf_cookie(token: str, max_age: int = 900) -> str:
        return (
            f"{CSRF_COOKIE}={token}; Path=/; Max-Age={max_age}; "
            "HttpOnly; Secure; SameSite=Strict"
        )

    def send_asset(self, path: str) -> None:
        relative = urllib.parse.unquote(path.removeprefix("/assets/"))
        candidate = (ASSET_ROOT / relative).resolve()
        if ASSET_ROOT.resolve() not in candidate.parents or not candidate.is_file():
            self.send_body(404, b"Not found", "text/plain; charset=utf-8")
            return
        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_common_headers(content_type, len(body))
        self.end_headers()
        self.wfile.write(body)

    def session_user(self) -> str | None:
        jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        token = jar.get("lym_ops_session")
        return verify_session(token.value) if token else None

    def admin_user(self) -> str | None:
        username = verify_session(self.cookie_value(ADMIN_COOKIE))
        return username if username == OPS_ADMIN_USER else None

    def admin_csrf_valid(self, form: dict[str, str]) -> bool:
        submitted = form.get("csrf_token", "")
        cookie_token = self.cookie_value(ADMIN_CSRF_COOKIE)
        return bool(submitted and cookie_token) and hmac.compare_digest(
            submitted, cookie_token
        )

    @staticmethod
    def admin_session_cookie(token: str, max_age: int = 43_200) -> str:
        return (
            f"{ADMIN_COOKIE}={token}; Path=/admin; Max-Age={max_age}; "
            "HttpOnly; Secure; SameSite=Strict"
        )

    @staticmethod
    def admin_csrf_cookie(token: str, max_age: int = 43_200) -> str:
        return (
            f"{ADMIN_CSRF_COOKIE}={token}; Path=/admin; Max-Age={max_age}; "
            "HttpOnly; Secure; SameSite=Strict"
        )

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        if path.startswith("/assets/"):
            self.send_asset(path)
            return
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
        if ROLE == "auth" and path == "/api/v1/access/check":
            product_id = self.headers.get("X-LifeYouMe-Product-ID", "")[:64]
            valid_products = {item.id for item in load_products()}
            if product_id not in valid_products:
                self.send_json(400, {"allowed": False, "error": "invalid_product"})
                return
            required = AUTH_STORE.login_required(product_id)
            user = self.sso_user()
            if required and not user:
                self.send_json(
                    401,
                    {
                        "allowed": False,
                        "login_required": True,
                        "product_id": product_id,
                    },
                )
                return
            payload = {
                "allowed": True,
                "login_required": required,
                "product_id": product_id,
                "authenticated": bool(user),
            }
            headers = {"X-LifeYouMe-Login-Required": str(required).lower()}
            if user:
                headers.update(
                    {
                        "X-LifeYouMe-User-ID": user.id,
                        "X-LifeYouMe-User-Email": user.email,
                    }
                )
            self.send_json_headers(200, payload, headers)
            return
        if ROLE == "auth" and path in {"/api/v1/me", "/api/v1/session/verify"}:
            user = self.sso_user()
            if not user:
                self.send_json(401, {"authenticated": False})
                return
            payload = {
                "authenticated": True,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "display_name": user.display_name,
                },
            }
            self.send_json_headers(
                200,
                payload,
                {
                    "X-LifeYouMe-User-ID": user.id,
                    "X-LifeYouMe-User-Email": user.email,
                },
            )
            return
        if ROLE == "auth" and path in {"/", "/login", "/register"}:
            return_to = safe_return_to(query.get("return_to", [""])[0])
            user = self.sso_user()
            if user:
                self.redirect(return_to if path != "/" else "/account")
                return
            if path == "/" :
                self.redirect("/login")
                return
            if path == "/register" and not AUTH_REGISTRATION_ENABLED:
                self.send_body(403, auth_form_page("login", "", return_to, "当前未开放注册"))
                return
            csrf_token = secrets.token_urlsafe(24)
            self.send_with_headers(
                200,
                auth_form_page(path.removeprefix("/"), csrf_token, return_to),
                {"Set-Cookie": self.csrf_cookie(csrf_token)},
            )
            return
        if ROLE == "auth" and path == "/account":
            user = self.sso_user()
            if not user:
                self.redirect(sso_login_url("https://auth.lifeyoume.icu/account"))
                return
            self.send_body(200, account_page(user))
            return
        if ROLE == "auth" and path == "/device":
            user_code = query.get("user_code", [""])[0].strip().upper()[:9]
            csrf_token = secrets.token_urlsafe(24)
            self.send_with_headers(
                200,
                device_page(user_code, self.sso_user(), csrf_token),
                {"Set-Cookie": self.csrf_cookie(csrf_token)},
            )
            return
        if ROLE == "ops" and path in {"/admin", "/admin/", "/admin/login"}:
            if path == "/admin":
                self.redirect("/admin/")
                return
            username = self.admin_user()
            if username and path == "/admin/login":
                self.redirect("/admin/")
                return
            csrf_token = self.cookie_value(ADMIN_CSRF_COOKIE) or secrets.token_urlsafe(24)
            headers = (
                {"Set-Cookie": self.admin_csrf_cookie(csrf_token)}
                if not self.cookie_value(ADMIN_CSRF_COOKIE)
                else {}
            )
            if username:
                body = admin_dashboard(
                    load_products(),
                    username,
                    csrf_token,
                    query.get("ok", [""])[0],
                )
            else:
                body = admin_login_page(csrf_token)
            self.send_with_headers(200, body, headers)
            return
        if path == "/api/v1/products" and ROLE in {"portal", "ops"}:
            products = [
                {
                    "id": item.id,
                    "name": item.name,
                    "tagline": item.tagline,
                    "summary": item.summary,
                    "public_url": item.public_url,
                    "lifecycle": item.lifecycle,
                    "availability": item.availability,
                    "category": item.category,
                    "audience": item.audience,
                    "platforms": item.platforms,
                    "capabilities": item.capabilities,
                    "featured": item.featured,
                    "visibility": item.visibility,
                    "visual": item.visual,
                    "cta": item.cta,
                    "runtime": check_product(item),
                }
                for item in load_products()
                if ROLE == "ops" or item.visibility in {"public", "lab"}
            ]
            self.send_json(200, {"schema_version": 2, "products": products})
            return
        if ROLE == "portal" and path == "/":
            self.send_body(200, portal_page(load_products()))
            return
        if ROLE == "portal" and path == "/products":
            self.send_body(200, catalog_page(load_products()))
            return
        if ROLE == "portal" and path.startswith("/products/"):
            product_id = path.removeprefix("/products/").strip("/")
            product = next(
                (
                    item
                    for item in load_products()
                    if item.id == product_id and item.visibility in {"public", "lab"}
                ),
                None,
            )
            if product:
                self.send_body(200, product_page(product))
            else:
                self.send_body(404, page("未找到产品", "<main class=\"not-found\"><h1>未找到产品</h1><a href=\"/products\">返回产品目录</a></main>", portal=True))
            return
        if path != "/":
            self.send_body(404, page("Not found", "<h1>Page not found</h1>"))
            return
        if ROLE == "ops":
            user = self.session_user()
            self.send_body(200, ops_page(load_products(), user) if user else login_page())
        elif ROLE in {"auth", "billing"}:
            self.send_body(200, service_page(ROLE))
        else:
            self.send_json(503, {"status": "error", "message": "Unknown service role"})

    def do_OPTIONS(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        origin = trusted_origin(self.headers.get("Origin", ""))
        if ROLE != "auth" or path not in {"/api/v1/me", "/api/v1/session/verify"} or not origin:
            self.send_json(404, {"status": "error", "message": "Not found"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_POST(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if ROLE == "ops" and path.startswith("/admin/"):
            form = self.form_data()
            if path == "/admin/logout":
                self.redirect(
                    "/admin/",
                    {"Set-Cookie": self.admin_session_cookie("", max_age=0)},
                )
                return
            if path == "/admin/login":
                csrf_token = self.cookie_value(ADMIN_CSRF_COOKIE)
                if not self.admin_csrf_valid(form):
                    self.send_body(
                        403,
                        admin_login_page(
                            csrf_token, "登录页面已过期，请刷新后重试"
                        ),
                    )
                    return
                if self.rate_limited():
                    self.send_body(
                        429,
                        admin_login_page(
                            csrf_token, "尝试次数过多，请稍后再试"
                        ),
                    )
                    return
                username = form.get("username", "")[:128]
                password = form.get("password", "")[:200]
                valid = (
                    bool(OPS_ADMIN_PASSWORD_HASH)
                    and hmac.compare_digest(username, OPS_ADMIN_USER)
                    and verify_password(password, OPS_ADMIN_PASSWORD_HASH)
                )
                if not valid:
                    self.record_failed_attempt()
                    self.send_body(
                        401,
                        admin_login_page(csrf_token, "管理员账号或密码不正确"),
                    )
                    return
                self.clear_failed_attempts()
                self.redirect(
                    "/admin/",
                    {"Set-Cookie": self.admin_session_cookie(issue_session(username))},
                )
                return

            username = self.admin_user()
            if not username:
                self.redirect("/admin/")
                return
            if not self.admin_csrf_valid(form):
                self.send_body(
                    403,
                    page(
                        "请求已过期",
                        '<main class="not-found"><h1>请求已过期</h1>'
                        '<a href="/admin/">返回管理后台</a></main>',
                        portal=True,
                    ),
                )
                return
            if path == "/admin/users/status":
                user_id = form.get("user_id", "")[:64]
                status = form.get("status", "")
                if not re.fullmatch(r"[a-f0-9]{32}", user_id) or status not in {
                    "active",
                    "disabled",
                }:
                    self.send_json(400, {"error": "invalid_request"})
                    return
                if not AUTH_STORE.set_user_status(user_id, status, username):
                    self.send_json(404, {"error": "user_not_found"})
                    return
                self.redirect("/admin/?ok=user-status#users")
                return
            if path == "/admin/users/password":
                user_id = form.get("user_id", "")[:64]
                new_password = form.get("new_password", "")[:200]
                if (
                    not re.fullmatch(r"[a-f0-9]{32}", user_id)
                    or len(new_password) < 12
                ):
                    self.send_json(400, {"error": "invalid_password"})
                    return
                if not AUTH_STORE.set_user_password(
                    user_id, password_hash(new_password), username
                ):
                    self.send_json(404, {"error": "user_not_found"})
                    return
                self.redirect("/admin/?ok=password#users")
                return
            if path == "/admin/products/login-policy":
                product_id = form.get("product_id", "")[:64]
                valid_products = {item.id for item in load_products()}
                if product_id not in valid_products:
                    self.send_json(400, {"error": "invalid_product"})
                    return
                required = form.get("login_required") == "true"
                AUTH_STORE.set_login_required(product_id, required, username)
                self.redirect("/admin/?ok=product-policy#products")
                return
            self.send_json(404, {"error": "not_found"})
            return
        if ROLE == "auth":
            form = self.form_data()
            if path == "/api/v1/device/start":
                client_id = form.get("client_id", "")[:64]
                valid_clients = {item.id for item in load_products()}
                if client_id not in valid_clients:
                    self.send_json(400, {"error": "invalid_client"})
                    return
                device_code, user_code, interval = AUTH_STORE.start_device_authorization(
                    client_id
                )
                self.send_json(
                    201,
                    {
                        "device_code": device_code,
                        "user_code": user_code,
                        "verification_uri": "https://auth.lifeyoume.icu/device",
                        "verification_uri_complete": (
                            "https://auth.lifeyoume.icu/device?user_code="
                            + urllib.parse.quote(user_code)
                        ),
                        "expires_in": 600,
                        "interval": interval,
                    },
                )
                return
            if path == "/api/v1/device/token":
                status, access_token, client_id = AUTH_STORE.exchange_device(
                    form.get("device_code", "")[:256]
                )
                if status != "ok":
                    self.send_json(400, {"error": status})
                    return
                self.send_json(
                    200,
                    {
                        "access_token": access_token,
                        "token_type": "Bearer",
                        "expires_in": 2_592_000,
                        "client_id": client_id,
                    },
                )
                return
            if path == "/logout":
                AUTH_STORE.revoke_session(self.cookie_value(SSO_COOKIE))
                self.redirect(
                    "https://lifeyoume.icu/",
                    {"Set-Cookie": self.sso_cookie("", max_age=0)},
                )
                return
            if path == "/device":
                user = self.sso_user()
                user_code = form.get("user_code", "").strip().upper()[:9]
                if not user:
                    self.redirect(sso_login_url(
                        "https://auth.lifeyoume.icu/device?user_code="
                        + urllib.parse.quote(user_code)
                    ))
                    return
                if not self.csrf_valid(form):
                    self.send_body(
                        403, device_page(user_code, user, "", "授权页面已过期，请重新打开")
                    )
                    return
                approved = AUTH_STORE.approve_device(user_code, user.id)
                self.send_body(
                    200,
                    device_page(
                        user_code,
                        user,
                        "",
                        "设备已授权，可以返回应用" if approved else "设备代码无效或已过期",
                    ),
                )
                return
            if path not in {"/login", "/register"}:
                self.send_json(404, {"status": "error", "message": "Not found"})
                return
            return_to = safe_return_to(form.get("return_to", ""))
            mode = path.removeprefix("/")
            if not self.csrf_valid(form):
                self.send_body(
                    403,
                    auth_form_page(
                        mode, "", return_to, "登录页面已过期，请刷新后重试"
                    ),
                )
                return
            if self.rate_limited():
                self.send_body(
                    429,
                    auth_form_page(
                        mode, self.cookie_value(CSRF_COOKIE), return_to, "尝试次数过多，请稍后再试"
                    ),
                )
                return
            email = AuthStore.normalize_email(form.get("email", ""))[:254]
            password = form.get("password", "")[:200]
            if path == "/register":
                display_name = form.get("display_name", "").strip()[:80]
                valid_email = bool(
                    re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
                )
                if (
                    not AUTH_REGISTRATION_ENABLED
                    or not valid_email
                    or len(display_name) < 2
                    or len(password) < 12
                ):
                    self.record_failed_attempt()
                    self.send_body(
                        400,
                        auth_form_page(
                            "register",
                            self.cookie_value(CSRF_COOKIE),
                            return_to,
                            "请填写有效邮箱、至少 2 位显示名称和至少 12 位密码",
                        ),
                    )
                    return
                try:
                    user = AUTH_STORE.create_user(
                        email, display_name, password_hash(password)
                    )
                except sqlite3.IntegrityError:
                    self.record_failed_attempt()
                    self.send_body(
                        409,
                        auth_form_page(
                            "register",
                            self.cookie_value(CSRF_COOKIE),
                            return_to,
                            "该邮箱已经注册",
                        ),
                    )
                    return
            else:
                user = AUTH_STORE.authenticate(email, password, verify_password)
                if not user:
                    self.record_failed_attempt()
                    self.send_body(
                        401,
                        auth_form_page(
                            "login",
                            self.cookie_value(CSRF_COOKIE),
                            return_to,
                            "邮箱或密码不正确",
                        ),
                    )
                    return
            self.clear_failed_attempts()
            session_token = AUTH_STORE.create_session(
                user.id,
                SSO_SESSION_TTL_SECONDS,
                self.headers.get("User-Agent", "")[:512],
            )
            self.redirect(
                return_to, {"Set-Cookie": self.sso_cookie(session_token)}
            )
            return
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
    if ROLE in {"auth", "ops"}:
        AUTH_STORE.initialize()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(json.dumps({"service": ROLE, "listen": f"{HOST}:{PORT}"}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
