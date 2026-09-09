from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str
    display_name: str
    status: str
    created_at: int


class AuthStore:
    def __init__(self, path: Path):
        self.path = path

    @staticmethod
    def normalize_email(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    last_login_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    user_agent_hash TEXT,
                    revoked_at INTEGER
                );
                CREATE INDEX IF NOT EXISTS sessions_user_idx
                    ON sessions(user_id, expires_at);
                CREATE TABLE IF NOT EXISTS device_codes (
                    device_hash TEXT PRIMARY KEY,
                    user_code TEXT NOT NULL UNIQUE,
                    client_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    interval_seconds INTEGER NOT NULL,
                    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                    approved_at INTEGER,
                    consumed_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS access_tokens (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    client_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    revoked_at INTEGER
                );
                CREATE INDEX IF NOT EXISTS access_tokens_user_idx
                    ON access_tokens(user_id, expires_at);
                """
            )

    @staticmethod
    def row_to_user(row: sqlite3.Row | None) -> AuthUser | None:
        if row is None:
            return None
        return AuthUser(
            id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
            status=row["status"],
            created_at=row["created_at"],
        )

    def create_user(
        self, email: str, display_name: str, encoded_password: str, now: int | None = None
    ) -> AuthUser:
        current = int(time.time() if now is None else now)
        user_id = secrets.token_hex(16)
        normalized = self.normalize_email(email)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id, email, display_name, password_hash, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'active', ?, ?)
                """,
                (user_id, normalized, display_name.strip(), encoded_password, current, current),
            )
            row = connection.execute(
                "SELECT id, email, display_name, status, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        user = self.row_to_user(row)
        if user is None:
            raise RuntimeError("User creation failed")
        return user

    def authenticate(
        self, email: str, password: str, verifier: Callable[[str, str], bool]
    ) -> AuthUser | None:
        normalized = self.normalize_email(email)
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, email, display_name, password_hash, status, created_at
                FROM users WHERE email = ?
                """,
                (normalized,),
            ).fetchone()
            if row is None or row["status"] != "active":
                return None
            if not verifier(password, row["password_hash"]):
                return None
            connection.execute(
                "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
                (int(time.time()), int(time.time()), row["id"]),
            )
        return self.row_to_user(row)

    def create_session(
        self, user_id: str, ttl_seconds: int, user_agent: str = "", now: int | None = None
    ) -> str:
        current = int(time.time() if now is None else now)
        token = secrets.token_urlsafe(32)
        agent_hash = hashlib.sha256(user_agent.encode("utf-8")).hexdigest()[:24]
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (
                    token_hash, user_id, created_at, expires_at, user_agent_hash
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    self.token_hash(token),
                    user_id,
                    current,
                    current + ttl_seconds,
                    agent_hash,
                ),
            )
        return token

    def session_user(self, token: str, now: int | None = None) -> AuthUser | None:
        if not token:
            return None
        current = int(time.time() if now is None else now)
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT u.id, u.email, u.display_name, u.status, u.created_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.revoked_at IS NULL
                  AND s.expires_at > ? AND u.status = 'active'
                """,
                (self.token_hash(token), current),
            ).fetchone()
        return self.row_to_user(row)

    def revoke_session(self, token: str, now: int | None = None) -> None:
        if not token:
            return
        current = int(time.time() if now is None else now)
        with self.connect() as connection:
            connection.execute(
                "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
                (current, self.token_hash(token)),
            )

    def start_device_authorization(
        self, client_id: str, ttl_seconds: int = 600, now: int | None = None
    ) -> tuple[str, str, int]:
        current = int(time.time() if now is None else now)
        device_code = secrets.token_urlsafe(32)
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        user_code = "".join(secrets.choice(alphabet) for _ in range(8))
        user_code = f"{user_code[:4]}-{user_code[4:]}"
        interval = 5
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO device_codes (
                    device_hash, user_code, client_id, created_at, expires_at,
                    interval_seconds
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    self.token_hash(device_code),
                    user_code,
                    client_id,
                    current,
                    current + ttl_seconds,
                    interval,
                ),
            )
        return device_code, user_code, interval

    def approve_device(
        self, user_code: str, user_id: str, now: int | None = None
    ) -> bool:
        current = int(time.time() if now is None else now)
        with self.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE device_codes
                SET user_id = ?, approved_at = ?
                WHERE user_code = ? AND expires_at > ?
                  AND approved_at IS NULL AND consumed_at IS NULL
                """,
                (user_id, current, user_code.strip().upper(), current),
            )
        return cursor.rowcount == 1

    def exchange_device(
        self, device_code: str, token_ttl_seconds: int = 2_592_000, now: int | None = None
    ) -> tuple[str, str | None, str | None]:
        current = int(time.time() if now is None else now)
        device_hash = self.token_hash(device_code)
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT client_id, user_id, expires_at, approved_at, consumed_at
                FROM device_codes WHERE device_hash = ?
                """,
                (device_hash,),
            ).fetchone()
            if row is None or row["expires_at"] <= current:
                return "expired_token", None, None
            if row["consumed_at"] is not None:
                return "expired_token", None, None
            if row["approved_at"] is None or row["user_id"] is None:
                return "authorization_pending", None, None
            access_token = secrets.token_urlsafe(40)
            connection.execute(
                "UPDATE device_codes SET consumed_at = ? WHERE device_hash = ?",
                (current, device_hash),
            )
            connection.execute(
                """
                INSERT INTO access_tokens (
                    token_hash, user_id, client_id, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    self.token_hash(access_token),
                    row["user_id"],
                    row["client_id"],
                    current,
                    current + token_ttl_seconds,
                ),
            )
        return "ok", access_token, row["client_id"]

    def bearer_user(self, token: str, now: int | None = None) -> AuthUser | None:
        if not token:
            return None
        current = int(time.time() if now is None else now)
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT u.id, u.email, u.display_name, u.status, u.created_at
                FROM access_tokens t
                JOIN users u ON u.id = t.user_id
                WHERE t.token_hash = ? AND t.revoked_at IS NULL
                  AND t.expires_at > ? AND u.status = 'active'
                """,
                (self.token_hash(token), current),
            ).fetchone()
        return self.row_to_user(row)
