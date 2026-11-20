from __future__ import annotations

import json
import mimetypes
import os
import re
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(os.environ.get("INDIE_PROJECTS_ROOT", "/data/app/indie-five-runtime/current/projects")).resolve()
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "45540"))
VERSION = "0.1.0"

PROJECTS = {
    "/typewriter": "typewriter-room",
    "/mind-blobs": "mind-blobs-garden",
    "/emoji-motion": "emoji-motion-studio",
    "/agent-avatar": "adaptive-agent-avatar",
    "/feihua-map": "feihua-map",
}


def json_bytes(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()


def local_avatar_role(text: str):
    lowered = text.lower()
    rules = [
        ("engineer", "工程师", ["代码", "网站", "api", "部署", "debug", "ai", "模型"], "像工程师一样进入问题：关注结构、日志、接口和可验证结果。"),
        ("chef", "厨师", ["饭", "菜", "餐厅", "食谱", "吃"], "像厨师一样组织步骤：先备料，再调味，最后出盘。"),
        ("travel", "旅行向导", ["旅行", "地图", "路线", "城市", "酒店"], "像旅行向导一样帮你规划路线、取舍和节奏。"),
        ("teacher", "老师", ["学习", "课程", "解释", "题目", "教学"], "像老师一样拆概念、举例子、检查理解。"),
        ("creative", "创意导演", ["设计", "文案", "海报", "视频", "创意"], "像创意导演一样抓住情绪、画面和传播点。"),
    ]
    for role, label, keywords, reason in rules:
        if any(keyword in lowered for keyword in keywords):
            return {"role": role, "label": label, "reason": reason}
    return {"role": "creative", "label": "创意导演", "reason": "没有命中特定专业场景，先用创意导演形态帮你发散。"}


def call_maas(messages):
    token = os.environ.get("MAAS_SERVICE_KEY", "").strip()
    if not token:
        raise RuntimeError("maas_not_configured")
    base = os.environ.get("MAAS_BASE_URL", "http://127.0.0.1:43280/v1").rstrip("/")
    model = os.environ.get("MAAS_MODEL_ID", "lym-chat-quality")
    body = json_bytes({"model": model, "messages": messages, "temperature": 0.45, "response_format": {"type": "json_object"}})
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=float(os.environ.get("MODEL_TIMEOUT_MS", "45000")) / 1000) as response:
        payload = json.loads(response.read(1_000_000).decode())
    return payload["choices"][0]["message"]["content"]


def parse_json(text: str):
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        value = json.loads(match.group(0))
        if isinstance(value, dict):
            return value
    raise ValueError("invalid_json")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if os.environ.get("ACCESS_LOG") == "1":
            super().log_message(fmt, *args)

    def send_json(self, status, data):
        raw = json_bytes(data)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def read_json(self):
        length = int(self.headers.get("content-length", "0") or "0")
        if length > 64_000:
            raise ValueError("request_too_large")
        return json.loads(self.rfile.read(length).decode() if length else "{}")

    def send_file(self, file: Path):
        if not file.is_file():
            self.send_error(404)
            return
        raw = file.read_bytes()
        ctype = mimetypes.guess_type(str(file))[0] or "application/octet-stream"
        if file.suffix == ".js":
            ctype = "text/javascript; charset=utf-8"
        if file.suffix in {".html", ".css"} and "charset" not in ctype:
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-cache, must-revalidate" if file.suffix in {".html", ".css", ".js"} else "public, max-age=86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def route_project(self, path: str):
        for prefix, directory in PROJECTS.items():
            if path == prefix:
                self.send_response(308)
                self.send_header("Location", prefix + "/")
                self.end_headers()
                return True
            if path.startswith(prefix + "/"):
                rel = path[len(prefix) + 1 :] or "index.html"
                if rel.startswith("api/"):
                    return False
                target = (ROOT / directory / "public" / rel).resolve()
                base = (ROOT / directory / "public").resolve()
                if not str(target).startswith(str(base)):
                    self.send_error(400)
                else:
                    self.send_file(target if target.is_file() else base / "index.html")
                return True
        return False

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            return self.send_json(200, {"status": "ok", "service": "indie-five-runtime", "version": VERSION, "maasConfigured": bool(os.environ.get("MAAS_SERVICE_KEY"))})
        if self.route_project(path):
            return
        self.send_error(404)

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.read_json()
            if path == "/emoji-motion/api/emoji-advice":
                text = str(data.get("text", ""))[:1000]
                try:
                    out = parse_json(call_maas([
                        {"role": "system", "content": "你是网页微动效顾问，只输出 JSON：advice 字符串。"},
                        {"role": "user", "content": text},
                    ]))
                    return self.send_json(200, {"advice": str(out.get("advice", ""))[:400], "source": "maas"})
                except Exception as error:
                    return self.send_json(200, {"advice": "欢迎语用 wave，提醒用 shake，奖励和成就用 spark，按钮点击用 pop。", "source": "fallback", "error": str(error)})
            if path == "/agent-avatar/api/avatar-role":
                text = str(data.get("text", ""))[:1000]
                fallback = local_avatar_role(text)
                try:
                    out = parse_json(call_maas([
                        {"role": "system", "content": "根据任务内容选择角色，只输出 JSON：role(engineer/chef/travel/teacher/creative), label, reason。"},
                        {"role": "user", "content": text},
                    ]))
                    role = out.get("role") if out.get("role") in {"engineer", "chef", "travel", "teacher", "creative"} else fallback["role"]
                    return self.send_json(200, {"role": role, "label": str(out.get("label") or fallback["label"])[:40], "reason": str(out.get("reason") or fallback["reason"])[:240], "source": "maas"})
                except Exception as error:
                    return self.send_json(200, {**fallback, "source": "fallback", "error": str(error)})
            if path == "/feihua-map/api/extract-places":
                text = str(data.get("text", ""))[:2000]
                try:
                    out = parse_json(call_maas([
                        {"role": "system", "content": "从播客笔记抽取地点，只输出 JSON：places 数组，每项 name/city/reason/tags。最多5个。"},
                        {"role": "user", "content": text},
                    ]))
                    places = out.get("places") if isinstance(out.get("places"), list) else []
                    return self.send_json(200, {"places": places[:5], "source": "maas"})
                except Exception as error:
                    return self.send_json(200, {"places": [], "message": "没有识别到地点，或 MaaS 暂不可用。", "source": "fallback", "error": str(error)})
        except Exception as error:
            return self.send_json(400, {"ok": False, "error": str(error)})
        self.send_error(404)


def main():
    print(f"indie-five-runtime listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
