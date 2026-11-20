from __future__ import annotations

import dataclasses
import ipaddress
import json
import re
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any


AI_BOTS = [
    ("GPTBot", "OpenAI / ChatGPT"),
    ("ChatGPT-User", "OpenAI browsing"),
    ("ClaudeBot", "Anthropic Claude"),
    ("Claude-User", "Anthropic user fetch"),
    ("PerplexityBot", "Perplexity"),
    ("Google-Extended", "Google Gemini training opt-out"),
    ("GoogleOther", "Google other crawlers"),
    ("Bytespider", "ByteDance"),
    ("CCBot", "Common Crawl"),
    ("Amazonbot", "Amazon"),
]


class SafeFetchError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclasses.dataclass
class FetchResult:
    url: str
    final_url: str
    status: int
    headers: dict[str, str]
    body: bytes
    elapsed_ms: int

    @property
    def text(self) -> str:
        content_type = self.headers.get("content-type", "")
        if "charset=" in content_type:
            charset = content_type.split("charset=", 1)[1].split(";", 1)[0].strip()
        else:
            charset = "utf-8"
        try:
            return self.body.decode(charset, "replace")
        except LookupError:
            return self.body.decode("utf-8", "replace")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.description = ""
        self.meta_robots = ""
        self.canonical = ""
        self.headings: list[str] = []
        self.links: list[str] = []
        self._skip_depth = 0
        self._title_active = False
        self._heading: str | None = None
        self._heading_chunks: list[str] = []
        self._text_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag == "title":
            self._title_active = True
        if tag in {"h1", "h2", "h3"}:
            self._heading = tag
            self._heading_chunks = []
        if tag == "meta":
            name = (attr.get("name") or attr.get("property") or "").lower()
            content = attr.get("content", "").strip()
            if name == "description" and content and not self.description:
                self.description = content
            if name == "robots" and content:
                self.meta_robots = content
        if tag == "link" and attr.get("rel", "").lower() == "canonical":
            self.canonical = attr.get("href", "").strip()
        if tag == "a" and attr.get("href"):
            self.links.append(attr["href"])

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._title_active = False
        if self._heading and tag == self._heading:
            heading = normalize_space(" ".join(self._heading_chunks))
            if heading:
                self.headings.append(heading)
            self._heading = None
            self._heading_chunks = []

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._title_active:
            self.title += data
        if self._heading:
            self._heading_chunks.append(data)
        if data.strip():
            self._text_chunks.append(data)

    def visible_text(self) -> str:
        return normalize_space(" ".join(self._text_chunks))


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def public_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise SafeFetchError("url_required", "请输入要检测的网址。")
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme not in {"http", "https"}:
        raise SafeFetchError("unsupported_scheme", "只支持 http 或 https 网址。")
    if not parsed.hostname:
        raise SafeFetchError("invalid_url", "网址格式不正确。")
    if parsed.username or parsed.password:
        raise SafeFetchError("credentials_not_allowed", "网址不能包含用户名或密码。")
    hostname = parsed.hostname.rstrip(".")
    if hostname.lower() in {"localhost", "localhost.localdomain"}:
        raise SafeFetchError("private_host", "不能检测本机或内网地址。")
    try:
        addresses = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise SafeFetchError("dns_failed", "域名解析失败。")
    for entry in addresses:
        ip = ipaddress.ip_address(entry[4][0])
        if not ip.is_global:
            raise SafeFetchError("private_host", "不能检测内网、保留或本机地址。")
    path = parsed.path or "/"
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))


def same_origin_url(base_url: str, path: str) -> str:
    parsed = urllib.parse.urlsplit(base_url)
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def fetch_url(url: str, *, timeout: float = 8.0, max_bytes: int = 700_000, user_agent: str = "AIVisibilityClinic/0.1") -> FetchResult:
    safe = public_url(url)
    request = urllib.request.Request(
        safe,
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,text/plain,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.2",
        },
        method="GET",
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
            final_url = public_url(response.geturl())
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                body = body[:max_bytes]
            return FetchResult(
                url=safe,
                final_url=final_url,
                status=response.status,
                headers={key.lower(): value for key, value in response.headers.items()},
                body=body,
                elapsed_ms=round((time.monotonic() - started) * 1000),
            )
    except urllib.error.HTTPError as error:
        body = error.read(min(max_bytes, 160_000))
        return FetchResult(
            url=safe,
            final_url=public_url(error.geturl()),
            status=error.code,
            headers={key.lower(): value for key, value in error.headers.items()},
            body=body,
            elapsed_ms=round((time.monotonic() - started) * 1000),
        )
    except urllib.error.URLError as error:
        raise SafeFetchError("fetch_failed", f"抓取失败：{error.reason}")
    except TimeoutError:
        raise SafeFetchError("fetch_timeout", "抓取超时。")


def parse_robots(robots_text: str) -> dict[str, Any]:
    groups: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for raw_line in robots_text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, value = [part.strip() for part in line.split(":", 1)]
        key = key.lower()
        if key == "user-agent":
            if current is None or current.get("rules"):
                current = {"agents": [], "rules": []}
                groups.append(current)
            current["agents"].append(value)
        elif key in {"allow", "disallow"} and current is not None:
            current["rules"].append({"type": key, "path": value})
        elif key == "sitemap":
            if current is None:
                current = {"agents": [], "rules": []}
                groups.append(current)
            current.setdefault("sitemaps", []).append(value)
    return {"groups": groups}


def robot_status(parsed: dict[str, Any], bot_name: str) -> dict[str, str]:
    exact_candidates = []
    wildcard_candidates = []
    for group in parsed.get("groups", []):
        agents = [agent.lower() for agent in group.get("agents", [])]
        if bot_name.lower() in agents:
            exact_candidates.append(group)
        elif "*" in agents:
            wildcard_candidates.append(group)
    candidates = exact_candidates or wildcard_candidates
    if not candidates:
        return {"bot": bot_name, "status": "unknown", "label": "未声明", "detail": "robots.txt 没有专门声明"}
    disallows = []
    allows = []
    for group in candidates:
        for rule in group.get("rules", []):
            if rule["path"] == "" or rule["path"] == "/":
                if rule["type"] == "disallow":
                    disallows.append(rule["path"])
                if rule["type"] == "allow":
                    allows.append(rule["path"])
    if disallows and not allows:
        return {"bot": bot_name, "status": "blocked", "label": "阻止", "detail": "根路径被 Disallow"}
    if allows:
        return {"bot": bot_name, "status": "allowed", "label": "允许", "detail": "根路径有 Allow"}
    return {"bot": bot_name, "status": "allowed", "label": "大概率允许", "detail": "未发现根路径禁止规则"}


def score_report(report: dict[str, Any]) -> dict[str, Any]:
    score = 100
    penalties: list[str] = []
    if report["page"]["status"] >= 400:
        score -= 35
        penalties.append("页面返回错误状态")
    if report["page"]["textLength"] < 600:
        score -= 16
        penalties.append("可读正文偏少")
    if not report["page"]["title"]:
        score -= 8
        penalties.append("缺少标题")
    if not report["page"]["description"]:
        score -= 8
        penalties.append("缺少描述")
    if report["page"]["metaRobots"] and any(token in report["page"]["metaRobots"].lower() for token in ["noindex", "none"]):
        score -= 25
        penalties.append("meta robots 阻止索引")
    blocked = [bot for bot in report["robots"]["bots"] if bot["status"] == "blocked"]
    score -= min(24, len(blocked) * 4)
    if blocked:
        penalties.append(f"{len(blocked)} 个 AI/搜索爬虫被 robots 阻止")
    if not report["llms"]["exists"]:
        score -= 7
        penalties.append("缺少 llms.txt")
    if not report["page"]["canonical"]:
        score -= 4
        penalties.append("缺少 canonical")
    score = max(0, min(100, score))
    if score >= 82:
        grade = "A"
        label = "AI 可见性良好"
    elif score >= 66:
        grade = "B"
        label = "有改进空间"
    elif score >= 48:
        grade = "C"
        label = "AI 抓取阻力较大"
    else:
        grade = "D"
        label = "需要优先修复"
    return {"score": score, "grade": grade, "label": label, "penalties": penalties[:6]}


def local_recommendations(report: dict[str, Any]) -> list[str]:
    recs = []
    if report["page"]["status"] >= 400:
        recs.append("先确认目标页对匿名访问返回 200；AI 爬虫通常不会登录，也不会执行复杂重试。")
    if report["page"]["textLength"] < 600:
        recs.append("页面可读正文偏少，建议补充稳定的 HTML 文本摘要、FAQ 或产品说明，不要只依赖图片和客户端渲染。")
    if report["page"]["metaRobots"] and any(token in report["page"]["metaRobots"].lower() for token in ["noindex", "none"]):
        recs.append("meta robots 当前含 noindex/none；如果希望被 AI 搜索引用，应移除或限定到不希望收录的页面。")
    blocked = [bot["bot"] for bot in report["robots"]["bots"] if bot["status"] == "blocked"]
    if blocked:
        recs.append(f"robots.txt 阻止了 {', '.join(blocked[:5])}；确认这是策略选择还是历史配置遗留。")
    if not report["llms"]["exists"]:
        recs.append("可以新增 /llms.txt，放一份给 LLM/Agent 看的站点简介、重要页面、授权边界和联系方式。")
    if not report["page"]["description"]:
        recs.append("补齐 meta description，让摘要系统更容易抓住页面用途。")
    if not report["page"]["canonical"]:
        recs.append("补齐 canonical，减少同内容多 URL 对引用与摘要的一致性影响。")
    if not recs:
        recs.append("基础可见性不错。下一步可以优化结构化数据、FAQ、案例页和 llms.txt，让 AI 摘要更稳定。")
    return recs[:6]


def analyze_target(url: str) -> dict[str, Any]:
    safe_url = public_url(url)
    page = fetch_url(safe_url)
    extractor = TextExtractor()
    content_type = page.headers.get("content-type", "")
    if "html" in content_type or page.text.lstrip().lower().startswith("<!doctype") or "<html" in page.text[:500].lower():
        extractor.feed(page.text[:650_000])
    visible_text = extractor.visible_text()

    robots_url = same_origin_url(page.final_url, "/robots.txt")
    robots_result: dict[str, Any]
    try:
        robots_fetch = fetch_url(robots_url, timeout=6.0, max_bytes=180_000, user_agent="AIVisibilityClinic/0.1")
        if robots_fetch.status < 400:
            parsed = parse_robots(robots_fetch.text)
            bots = [robot_status(parsed, name) | {"owner": owner} for name, owner in AI_BOTS]
            robots_result = {
                "exists": True,
                "status": robots_fetch.status,
                "url": robots_url,
                "bots": bots,
                "sitemaps": sorted({
                    sitemap
                    for group in parsed.get("groups", [])
                    for sitemap in group.get("sitemaps", [])
                })[:8],
            }
        else:
            robots_result = {"exists": False, "status": robots_fetch.status, "url": robots_url, "bots": [], "sitemaps": []}
    except SafeFetchError as error:
        robots_result = {"exists": False, "status": 0, "url": robots_url, "error": error.message, "bots": [], "sitemaps": []}

    llms_url = same_origin_url(page.final_url, "/llms.txt")
    try:
        llms_fetch = fetch_url(llms_url, timeout=6.0, max_bytes=180_000, user_agent="AIVisibilityClinic/0.1")
        llms = {
            "exists": llms_fetch.status < 400,
            "status": llms_fetch.status,
            "url": llms_url,
            "bytes": len(llms_fetch.body) if llms_fetch.status < 400 else 0,
            "preview": normalize_space(llms_fetch.text)[:360] if llms_fetch.status < 400 else "",
        }
    except SafeFetchError as error:
        llms = {"exists": False, "status": 0, "url": llms_url, "bytes": 0, "preview": "", "error": error.message}

    report = {
        "target": safe_url,
        "checkedAt": int(time.time()),
        "page": {
            "url": page.url,
            "finalUrl": page.final_url,
            "status": page.status,
            "elapsedMs": page.elapsed_ms,
            "contentType": content_type,
            "title": normalize_space(extractor.title)[:160],
            "description": normalize_space(extractor.description)[:260],
            "metaRobots": extractor.meta_robots,
            "canonical": extractor.canonical,
            "headings": extractor.headings[:8],
            "textLength": len(visible_text),
            "sampleText": visible_text[:800],
            "linkCount": len(extractor.links),
        },
        "robots": robots_result,
        "llms": llms,
    }
    report["rating"] = score_report(report)
    report["recommendations"] = local_recommendations(report)
    return report


def compact_report_for_model(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "target": report["target"],
        "rating": report["rating"],
        "page": {key: report["page"][key] for key in ["status", "title", "description", "metaRobots", "canonical", "textLength", "headings", "sampleText"]},
        "robots": {
            "exists": report["robots"].get("exists"),
            "status": report["robots"].get("status"),
            "bots": report["robots"].get("bots", [])[:10],
            "sitemaps": report["robots"].get("sitemaps", []),
        },
        "llms": report["llms"],
        "localRecommendations": report["recommendations"],
    }


def to_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
