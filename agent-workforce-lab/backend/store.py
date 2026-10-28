"""SQLite is the authoritative store; graph and browser state are projections."""
import json
import os
import sqlite3
import secrets
import hashlib
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "runtime"
DATA.mkdir(exist_ok=True)
DB_PATH = Path(os.environ.get("AWL_DB_PATH", str(DATA / "workforce.sqlite3")))
if not DB_PATH.resolve().is_relative_to(ROOT):
    raise RuntimeError("AWL_DB_PATH must remain inside the project")


def now():
    return datetime.now(timezone.utc).isoformat()


def uid(prefix):
    return f"{prefix}-{uuid4().hex[:12]}"


@contextmanager
def transaction():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with transaction() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS records(
          kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
          PRIMARY KEY(kind,id)
        );
        CREATE TABLE IF NOT EXISTS rewards(
          task_id TEXT NOT NULL, employee_id TEXT NOT NULL, points INTEGER NOT NULL,
          version INTEGER NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(task_id,employee_id)
        );
        CREATE TABLE IF NOT EXISTS commands(
          key TEXT PRIMARY KEY, action TEXT NOT NULL, result TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events(
          seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, actor TEXT NOT NULL,
          action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS accounts(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions(
          token TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
        """)


def get(db, kind, identifier):
    row = db.execute("SELECT data FROM records WHERE kind=? AND id=?", (kind, identifier)).fetchone()
    return json.loads(row["data"]) if row else None


def all_records(db, kind):
    return [json.loads(row["data"]) for row in db.execute(
        "SELECT data FROM records WHERE kind=? ORDER BY rowid", (kind,))]


def save(db, kind, obj):
    db.execute("INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
               (kind, obj["id"], json.dumps(obj, ensure_ascii=False)))


def event(db, action, detail, task_id=None, actor="engine"):
    db.execute("INSERT INTO events(task_id,actor,action,detail,created_at) VALUES(?,?,?,?,?)",
               (task_id, actor, action, json.dumps(detail, ensure_ascii=False), now()))


def task_events(db, task_id):
    return [{**dict(row), "detail": json.loads(row["detail"])} for row in db.execute(
        "SELECT * FROM events WHERE task_id=? ORDER BY seq", (task_id,))]


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password, encoded):
    try:
        method, salt, digest = encoded.split("$", 2)
    except ValueError:
        return False
    if method != "pbkdf2_sha256":
        return False
    return secrets.compare_digest(password_hash(password, salt), encoded)


def account_view(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"],
            "created_at": row["created_at"], "last_login_at": row["last_login_at"]}


def get_account_by_email(db, email):
    return db.execute("SELECT * FROM accounts WHERE lower(email)=lower(?)", (email,)).fetchone()


def create_account(db, name, email, password):
    account = {"id": uid("ACC"), "name": name, "email": email.lower(),
               "password_hash": password_hash(password), "created_at": now(), "last_login_at": now()}
    db.execute("INSERT INTO accounts(id,name,email,password_hash,created_at,last_login_at) VALUES(?,?,?,?,?,?)",
               (account["id"], account["name"], account["email"], account["password_hash"],
                account["created_at"], account["last_login_at"]))
    return account


def create_session(db, account_id):
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions(token,account_id,created_at) VALUES(?,?,?)", (token, account_id, now()))
    db.execute("UPDATE accounts SET last_login_at=? WHERE id=?", (now(), account_id))
    return token


def account_by_session(db, token):
    if not token:
        return None
    row = db.execute("""SELECT a.* FROM accounts a
                        JOIN sessions s ON s.account_id=a.id WHERE s.token=?""", (token,)).fetchone()
    return row


def all_accounts(db):
    return [account_view(row) for row in db.execute("SELECT * FROM accounts ORDER BY created_at DESC")]
