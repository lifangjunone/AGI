#!/usr/bin/env python3
"""Exchange a proxy-verified LifeYouMe identity for a StaffDeck access token."""

from __future__ import annotations

import base64
from datetime import UTC, datetime
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
import re
import secrets
import sqlite3
import time


HOST = "127.0.0.1"
PORT = int(os.environ.get("LIFEYOUME_SSO_BRIDGE_PORT", "45174"))
DB_PATH = os.environ.get(
    "ULTRARAG_DATABASE_URL",
    "/data/app/lifeyoume-staffdeck/data/skill_agent_loop.db",
).removeprefix("sqlite:///")
INDEX_PATH = os.environ.get(
    "LIFEYOUME_AI_TEAM_INDEX",
    "/data/app/lifeyoume-staffdeck/current/usr/lib/staffdeck/"
    "_internal/frontend-enterprise/dist/index.html",
)
TENANT_ID = os.environ.get("VITE_TENANT_ID", "tenant_demo")
APP_SECRET = os.environ["APP_SECRET"].encode()
ADMIN_EMAILS = {
    value.strip().lower()
    for value in os.environ.get("LIFEYOUME_ADMIN_EMAILS", "").split(",")
    if value.strip()
}
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def access_token(user: sqlite3.Row) -> str:
    payload = {
        "tenant_id": user["tenant_id"],
        "user_id": user["id"],
        "username": user["username"],
        "exp": int(time.time()) + 60 * 60 * 24 * 14,
    }
    body = b64(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode())
    signature = b64(hmac.new(APP_SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def exchange(external_id: str, email: str) -> dict[str, object]:
    if not external_id or len(external_id) > 128 or not EMAIL_RE.fullmatch(email):
        raise ValueError("LifeYouMe session required")
    digest = hashlib.sha256(external_id.encode()).hexdigest()
    user_id = f"user_lym_{digest[:16]}"
    username = f"lym_{digest[:24]}"
    role = "admin" if email in ADMIN_EMAILS else "member"
    display_name = email.split("@", 1)[0][:80]
    now = datetime.now(UTC).replace(tzinfo=None).isoformat(sep=" ")

    with sqlite3.connect(DB_PATH, timeout=15) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        tenant = db.execute("SELECT id FROM tenants WHERE id = ?", (TENANT_ID,)).fetchone()
        if tenant is None:
            raise RuntimeError("StaffDeck tenant is not initialized")
        user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if user is None:
            db.execute(
                """
                INSERT INTO users
                    (id, tenant_id, username, display_name, role, source,
                     password_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'lifeyoume', ?, ?, ?)
                """,
                (
                    user_id,
                    TENANT_ID,
                    username,
                    display_name,
                    role,
                    f"external-authentication-only${secrets.token_hex(32)}",
                    now,
                    now,
                ),
            )
            db.commit()
        elif user["tenant_id"] != TENANT_ID or user["source"] != "lifeyoume":
            raise RuntimeError("LifeYouMe identity conflicts with an existing account")
        elif (
            user["display_name"] != display_name
            or (role == "admin" and user["role"] != "admin")
        ):
            db.execute(
                "UPDATE users SET display_name = ?, role = ?, updated_at = ? WHERE id = ?",
                (display_name, role if role == "admin" else user["role"], now, user_id),
            )
            db.commit()
        user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return {
        "token": access_token(user),
        "refresh_mode": "none",
        "user": {
            "id": user["id"],
            "tenant_id": user["tenant_id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "role": user["role"],
            "source": user["source"],
            "disabled": False,
        },
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeYouMeSSOBridge/1.0"

    def do_GET(self) -> None:
        if self.path == "/index":
            try:
                body = open(INDEX_PATH, "rb").read()
            except OSError:
                self.send_error(503)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path != "/health":
            self.send_error(404)
            return
        self.send_json(200, {"status": "ok"})

    def do_POST(self) -> None:
        if self.path != "/exchange":
            self.send_error(404)
            return
        external_id = self.headers.get("X-LifeYouMe-User-ID", "").strip()
        email = self.headers.get("X-LifeYouMe-User-Email", "").strip().lower()
        try:
            payload = exchange(external_id, email)
        except ValueError as error:
            self.send_json(401, {"detail": str(error)})
        except Exception:
            self.send_json(500, {"detail": "Unable to create StaffDeck session"})
        else:
            self.send_json(200, payload)

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, message: str, *args: object) -> None:
        print(f"{self.address_string()} {message % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
