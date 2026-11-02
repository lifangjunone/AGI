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
        CREATE TABLE IF NOT EXISTS organizations(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memberships(
          organization_id TEXT NOT NULL, account_id TEXT NOT NULL, role TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(organization_id,account_id),
          FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workspace_invites(
          id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
          email TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL, accepted_by TEXT, accepted_at TEXT,
          FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS product_objects(
          organization_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
          data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY(organization_id,kind,id),
          FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS product_objects_org_kind
          ON product_objects(organization_id,kind,updated_at);
        CREATE TABLE IF NOT EXISTS product_audit(
          seq INTEGER PRIMARY KEY AUTOINCREMENT, organization_id TEXT NOT NULL,
          account_id TEXT NOT NULL, action TEXT NOT NULL, object_kind TEXT,
          object_id TEXT, detail TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
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


def organizations_for(db, account_id):
    return [dict(row) for row in db.execute(
        """SELECT o.*,m.role FROM organizations o
           JOIN memberships m ON m.organization_id=o.id
           WHERE m.account_id=? ORDER BY o.created_at""", (account_id,))]


def organization_members(db, organization_id):
    return [dict(row) for row in db.execute(
        """SELECT a.id,a.name,a.email,m.role,m.created_at
           FROM memberships m JOIN accounts a ON a.id=m.account_id
           WHERE m.organization_id=?
           ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
           WHEN 'reviewer' THEN 2 ELSE 3 END,m.created_at""",
        (organization_id,))]


def add_organization_member(db, organization_id, account_id, role):
    db.execute(
        """INSERT INTO memberships(organization_id,account_id,role,created_at)
           VALUES(?,?,?,?)
           ON CONFLICT(organization_id,account_id)
           DO UPDATE SET role=excluded.role""",
        (organization_id, account_id, role, now()))


def create_organization(db, account_id, name):
    organization = {"id": uid("ORG"), "name": name, "created_at": now()}
    db.execute("INSERT INTO organizations(id,name,created_at) VALUES(?,?,?)",
               (organization["id"], organization["name"], organization["created_at"]))
    db.execute("INSERT INTO memberships(organization_id,account_id,role,created_at) VALUES(?,?,?,?)",
               (organization["id"], account_id, "owner", now()))
    return organization


def product_get(db, organization_id, kind, identifier):
    row = db.execute(
        "SELECT data FROM product_objects WHERE organization_id=? AND kind=? AND id=?",
        (organization_id, kind, identifier)).fetchone()
    return json.loads(row["data"]) if row else None


def product_all(db, organization_id, kind):
    return [json.loads(row["data"]) for row in db.execute(
        """SELECT data FROM product_objects
           WHERE organization_id=? AND kind=? ORDER BY created_at""",
        (organization_id, kind))]


def product_all_organizations(db, kind):
    return [
        (row["organization_id"], json.loads(row["data"]))
        for row in db.execute(
            """SELECT organization_id,data FROM product_objects
               WHERE kind=? ORDER BY updated_at""", (kind,))
    ]


def product_save(db, organization_id, kind, obj):
    timestamp = now()
    db.execute(
        """INSERT INTO product_objects(organization_id,kind,id,data,created_at,updated_at)
           VALUES(?,?,?,?,?,?)
           ON CONFLICT(organization_id,kind,id)
           DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at""",
        (organization_id, kind, obj["id"], json.dumps(obj, ensure_ascii=False),
         obj.get("created_at", timestamp), timestamp))


def product_audit(db, organization_id, account_id, action, kind=None, identifier=None, detail=None):
    db.execute(
        """INSERT INTO product_audit(
             organization_id,account_id,action,object_kind,object_id,detail,created_at
           ) VALUES(?,?,?,?,?,?,?)""",
        (organization_id, account_id, action, kind, identifier,
         json.dumps(detail or {}, ensure_ascii=False), now()))
