#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


SUPPORT_DIR = Path.home() / "Library" / "Application Support" / "Opportunity Factory"
CREDENTIALS_PATH = SUPPORT_DIR / "server-credentials.txt"
STATE_PATH = SUPPORT_DIR / "notified-orders.json"
ORDERS_URL = "https://audit.lifeyoume.icu/api/admin/wechat-orders"


def credentials() -> tuple[str, str]:
    values: dict[str, str] = {}
    for line in CREDENTIALS_PATH.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip()] = value.strip()
    return values.get("admin_user", ""), values.get("admin_password", "")


def pending_orders(user: str, password: str) -> list[dict[str, object]]:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    request = urllib.request.Request(
        ORDERS_URL,
        headers={
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "User-Agent": "OpportunityFactoryOrderNotifier/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode())
    return payload.get("pending") or []


def notified_tokens() -> set[str]:
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    return set(payload.get("order_tokens") or [])


def notify(order: dict[str, object]) -> None:
    amount = int(order.get("amount_cents") or 0) / 100
    message = (
        f"{order.get('repository', '专业报告')} · ¥{amount:.2f} · "
        f"备注 {order.get('payment_note', '')}"
    )
    script = (
        "display notification "
        f"{json.dumps(message)} "
        'with title "微信付款待核对" '
        'subtitle "Opportunity Factory"'
    )
    subprocess.run(["osascript", "-e", script], check=False)


def main() -> int:
    if not CREDENTIALS_PATH.is_file():
        return 0
    user, password = credentials()
    if not password:
        return 0
    try:
        orders = pending_orders(user, password)
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return 1
    seen = notified_tokens()
    current = {
        str(order.get("order_token") or "")
        for order in orders
        if order.get("order_token")
    }
    for order in orders:
        token = str(order.get("order_token") or "")
        if token and token not in seen:
            notify(order)
    STATE_PATH.write_text(
        json.dumps(
            {"order_tokens": sorted(seen | current)},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    STATE_PATH.chmod(0o600)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
