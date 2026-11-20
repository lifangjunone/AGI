from __future__ import annotations

import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from analyzer import SafeFetchError, analyze_target, compact_report_for_model
from maas import maas_configured, model_diagnosis


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
BASE_PATH = os.environ.get("BASE_PATH", "/ai-visibility").rstrip("/")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "45530"))
VERSION = "0.1.0"


def json_bytes(data: object) -> bytes:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "AIVisibilityClinic/0.1"

    def log_message(self, fmt: str, *args: object) -> None:
        if os.environ.get("ACCESS_LOG", "0") == "1":
            super().log_message(fmt, *args)

    def send_json(self, status: int, payload: object) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_text(self, status: int, body: str) -> None:
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def send_static(self, relative: str) -> None:
        if not relative or relative.endswith("/"):
            relative += "index.html"
        target = (STATIC / relative).resolve()
        if not str(target).startswith(str(STATIC.resolve())) or not target.is_file():
            self.send_text(HTTPStatus.NOT_FOUND, "Not found")
            return
        body = target.read_bytes()
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if target.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"
        if target.suffix in {".html", ".css"}:
            content_type = f"{content_type}; charset=utf-8" if "charset" not in content_type else content_type
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, must-revalidate" if target.suffix in {".html", ".css", ".js"} else "public, max-age=86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        self.send_header(
            "Content-Security-Policy",
            "; ".join(
                [
                    "default-src 'self'",
                    "img-src 'self' data:",
                    "style-src 'self' 'unsafe-inline'",
                    "script-src 'self'",
                    "connect-src 'self'",
                    "object-src 'none'",
                    "base-uri 'self'",
                    "frame-ancestors 'none'",
                ]
            ),
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("content-length", "0") or "0")
        if length > 32_000:
            raise SafeFetchError("request_too_large", "请求体过大。")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            value = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            raise SafeFetchError("invalid_json", "请求 JSON 格式不正确。")
        if not isinstance(value, dict):
            raise SafeFetchError("invalid_json", "请求 JSON 必须是对象。")
        return value

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path in {"/health", f"{BASE_PATH}/health"}:
            self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "service": "ai-visibility-clinic",
                    "version": VERSION,
                    "basePath": BASE_PATH,
                    "maasConfigured": maas_configured(),
                },
            )
            return
        if path == BASE_PATH:
            self.send_response(HTTPStatus.PERMANENT_REDIRECT)
            self.send_header("Location", f"{BASE_PATH}/")
            self.end_headers()
            return
        if path == f"{BASE_PATH}/api/analyze":
            query = parse_qs(parsed.query)
            target = (query.get("url") or [""])[0]
            self.handle_analyze(target)
            return
        if not path.startswith(f"{BASE_PATH}/"):
            self.send_text(HTTPStatus.NOT_FOUND, "Not found")
            return
        relative = path[len(BASE_PATH) + 1 :]
        self.send_static(relative)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != f"{BASE_PATH}/api/analyze":
            self.send_text(HTTPStatus.NOT_FOUND, "Not found")
            return
        try:
            payload = self.read_json()
            self.handle_analyze(str(payload.get("url") or ""))
        except SafeFetchError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": error.code, "message": error.message})

    def handle_analyze(self, target: str) -> None:
        try:
            report = analyze_target(target)
            diagnosis = model_diagnosis(report, compact_report_for_model(report))
            self.send_json(HTTPStatus.OK, {"ok": True, "report": report, "diagnosis": diagnosis})
        except SafeFetchError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": error.code, "message": error.message})
        except Exception as error:  # noqa: BLE001
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": "internal_error", "message": str(error)})


def run() -> None:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"AI Visibility Clinic listening on http://{HOST}:{PORT}{BASE_PATH}/", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    run()
