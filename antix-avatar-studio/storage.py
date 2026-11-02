import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path


UTC = timezone.utc


def utc_now():
    return datetime.now(UTC)


def iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds")


def parse_time(value):
    return datetime.fromisoformat(value) if value else None


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self._initialize()

    @contextmanager
    def connection(self):
        database = sqlite3.connect(self.path, timeout=15)
        database.row_factory = sqlite3.Row
        try:
            database.execute("PRAGMA foreign_keys=ON")
            yield database
            database.commit()
        finally:
            database.close()

    def _initialize(self):
        with self.connection() as database:
            database.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS guest_usage (
                    guest_hash TEXT PRIMARY KEY,
                    successful_chats INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS subscriptions (
                    user_id TEXT PRIMARY KEY,
                    expires_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS orders (
                    out_trade_no TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    status TEXT NOT NULL,
                    trade_no TEXT,
                    created_at TEXT NOT NULL,
                    paid_at TEXT,
                    entitlement_applied INTEGER NOT NULL DEFAULT 0,
                    raw_result TEXT
                );
                CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS notify_events (
                    event_key TEXT PRIMARY KEY,
                    out_trade_no TEXT NOT NULL,
                    trade_status TEXT,
                    received_at TEXT NOT NULL,
                    raw_params TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS refunds (
                    out_request_no TEXT PRIMARY KEY,
                    out_trade_no TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    raw_result TEXT
                );
                CREATE TABLE IF NOT EXISTS workspaces (
                    owner_key TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

    def workspace(self, owner_key):
        if not owner_key:
            return None
        with self.connection() as database:
            row = database.execute(
                "SELECT payload, updated_at FROM workspaces WHERE owner_key=?", (owner_key,)
            ).fetchone()
        if not row:
            return None
        try:
            payload = json.loads(row["payload"])
        except (TypeError, ValueError):
            return None
        return {"payload": payload, "updatedAt": row["updated_at"]}

    def save_workspace(self, owner_key, payload, expected_version=None):
        if not owner_key:
            raise ValueError("workspace_owner_required")
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        with self.connection() as database:
            database.execute("BEGIN IMMEDIATE")
            current = database.execute(
                "SELECT updated_at FROM workspaces WHERE owner_key=?", (owner_key,)
            ).fetchone()
            version = current["updated_at"] if current else "new"
            if expected_version is not None and expected_version != version:
                raise ValueError("workspace_version_conflict")
            # Allocate the revision after acquiring the database write lock.
            # Keep the timestamp API, but never reuse a token if the clock stalls
            # or moves backwards: a stale page must not pass compare-and-swap.
            revision_time = utc_now()
            if current:
                previous_time = parse_time(current["updated_at"])
                if revision_time <= previous_time:
                    revision_time = previous_time + timedelta(microseconds=1)
            now = revision_time.isoformat(timespec="microseconds")
            database.execute(
                """INSERT INTO workspaces(owner_key, payload, updated_at) VALUES(?, ?, ?)
                   ON CONFLICT(owner_key) DO UPDATE SET payload=excluded.payload,
                   updated_at=excluded.updated_at""",
                (owner_key, encoded, now),
            )
        return now

    def trial_used(self, guest_hash):
        if not guest_hash:
            return 0
        with self.connection() as database:
            row = database.execute(
                "SELECT successful_chats FROM guest_usage WHERE guest_hash=?", (guest_hash,)
            ).fetchone()
            return int(row["successful_chats"]) if row else 0

    def consume_trial(self, guest_hash, limit=3):
        now = iso(utc_now())
        with self.lock, self.connection() as database:
            database.execute(
                """INSERT INTO guest_usage(guest_hash, successful_chats, created_at, updated_at)
                   VALUES(?, 0, ?, ?) ON CONFLICT(guest_hash) DO NOTHING""",
                (guest_hash, now, now),
            )
            changed = database.execute(
                """UPDATE guest_usage SET successful_chats=successful_chats+1, updated_at=?
                   WHERE guest_hash=? AND successful_chats < ?""",
                (now, guest_hash, limit),
            ).rowcount
            return changed == 1

    def subscription_expiry(self, user_id):
        if not user_id:
            return None
        with self.connection() as database:
            row = database.execute(
                "SELECT expires_at FROM subscriptions WHERE user_id=?", (user_id,)
            ).fetchone()
            return parse_time(row["expires_at"]) if row else None

    def subscription_active(self, user_id):
        expiry = self.subscription_expiry(user_id)
        return bool(expiry and expiry > utc_now())

    def create_order(self, out_trade_no, user_id, amount, status="PENDING", raw_result=None):
        now = iso(utc_now())
        with self.connection() as database:
            database.execute(
                """INSERT INTO orders(out_trade_no, user_id, amount, status, created_at, raw_result)
                   VALUES(?, ?, ?, ?, ?, ?)""",
                (
                    out_trade_no,
                    user_id,
                    amount,
                    status,
                    now,
                    json.dumps(raw_result, ensure_ascii=False) if raw_result else None,
                ),
            )

    def order(self, out_trade_no):
        with self.connection() as database:
            row = database.execute(
                "SELECT * FROM orders WHERE out_trade_no=?", (out_trade_no,)
            ).fetchone()
            return dict(row) if row else None

    def record_order_state(self, out_trade_no, status, trade_no=None, raw_result=None):
        with self.connection() as database:
            database.execute(
                """UPDATE orders SET status=?, trade_no=COALESCE(?, trade_no),
                   raw_result=COALESCE(?, raw_result) WHERE out_trade_no=?""",
                (status, trade_no, json.dumps(raw_result, ensure_ascii=False) if raw_result else None, out_trade_no),
            )

    def manual_orders(self, limit=100, include_paid=False):
        statuses = ("PENDING", "PAID", "CLOSED", "CANCELLED") if include_paid else ("PENDING",)
        placeholders = ",".join("?" for _ in statuses)
        with self.connection() as database:
            rows = database.execute(
                f"""SELECT * FROM orders WHERE status IN ({placeholders})
                    ORDER BY created_at DESC LIMIT ?""",
                (*statuses, int(limit)),
            ).fetchall()
        orders = []
        for row in rows:
            order = dict(row)
            try:
                raw = json.loads(order.get("raw_result") or "{}")
            except ValueError:
                raw = {}
            if raw.get("payment_method") == "manual-mobile":
                order["raw"] = raw
                orders.append(order)
        return orders

    def record_event_once(self, event_key, out_trade_no, trade_status, params):
        try:
            with self.connection() as database:
                database.execute(
                    """INSERT INTO notify_events(event_key, out_trade_no, trade_status, received_at, raw_params)
                       VALUES(?, ?, ?, ?, ?)""",
                    (event_key, out_trade_no, trade_status, iso(utc_now()), json.dumps(params, ensure_ascii=False)),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def grant_order_once(self, out_trade_no, days=7):
        with self.lock, self.connection() as database:
            order = database.execute(
                "SELECT * FROM orders WHERE out_trade_no=?", (out_trade_no,)
            ).fetchone()
            if not order or order["entitlement_applied"]:
                return False
            now = utc_now()
            subscription = database.execute(
                "SELECT expires_at FROM subscriptions WHERE user_id=?", (order["user_id"],)
            ).fetchone()
            current = parse_time(subscription["expires_at"]) if subscription else None
            expires_at = max(now, current) + timedelta(days=days) if current else now + timedelta(days=days)
            paid_at = iso(now)
            database.execute(
                """INSERT INTO subscriptions(user_id, expires_at, updated_at) VALUES(?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,
                   updated_at=excluded.updated_at""",
                (order["user_id"], iso(expires_at), paid_at),
            )
            database.execute(
                """UPDATE orders SET status='PAID', paid_at=?, entitlement_applied=1
                   WHERE out_trade_no=? AND entitlement_applied=0""",
                (paid_at, out_trade_no),
            )
            return True

    def save_refund(self, out_request_no, out_trade_no, amount, status, result):
        now = iso(utc_now())
        with self.connection() as database:
            database.execute(
                """INSERT INTO refunds(out_request_no, out_trade_no, amount, status, created_at, updated_at, raw_result)
                   VALUES(?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(out_request_no) DO UPDATE SET status=excluded.status,
                   updated_at=excluded.updated_at, raw_result=excluded.raw_result""",
                (out_request_no, out_trade_no, amount, status, now, now, json.dumps(result, ensure_ascii=False)),
            )
