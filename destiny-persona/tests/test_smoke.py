import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import tempfile
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.payment import (
    PaymentError,
    apply_paid_order,
    business_fields_match,
    create_order,
    is_paid_event,
    normalize_amount,
    public_config,
)
from app.server import build_fortune, quota_for, sexagenary_day


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def test_sexagenary_cycle():
    start = date(2026, 1, 1)
    cycle = [sexagenary_day(start + timedelta(days=offset)) for offset in range(60)]
    assert len({item["name"] for item in cycle}) == 60
    assert len({item["id"] for item in cycle}) == 60
    assert sexagenary_day(start + timedelta(days=60))["name"] == cycle[0]["name"]
    fortune = build_fortune(
        {"name": "阿坐", "birth": "1995-01-01", "focus": "事业", "instinct": "风"},
        today=date(2026, 11, 16),
    )
    assert fortune["kind"] == "daily_fortune"
    assert len(fortune["cards"]) == 6
    assert len({card["key"] for card in fortune["cards"]}) == 6
    assert fortune["dayPillar"] == sexagenary_day(date(2026, 11, 16))


def test_paid_credit_order():
    state = {"visitors": {"visitor": {"used": 3}}, "records": [], "orders": {}, "notifyEvents": {}}
    order = create_order(state, "visitor", "starter")
    assert order["amount"] == "6.90"
    assert order["credits"] == 10
    assert order["status"] == "PENDING_PAYMENT"
    assert order["expiresAt"] - order["createdAt"] == 15 * 60
    assert apply_paid_order(state, order, "trade-1") is True
    assert apply_paid_order(state, order, "trade-1") is False
    assert quota_for(state, "visitor")["paidRemaining"] == 10
    assert quota_for(state, "visitor")["remaining"] == 10
    assert normalize_amount("6.9") == normalize_amount("6.90")
    try:
        create_order(state, "visitor", "made-up")
        raise AssertionError("invalid plan should fail")
    except PaymentError as error:
        assert str(error) == "invalid_plan"
    assert public_config()["checkoutEnabled"] is False
    config = {"app_id": "app", "seller_id": "seller", "seller_email": ""}
    notification = {
        "app_id": "app",
        "seller_id": "seller",
        "out_trade_no": order["outTradeNo"],
        "total_amount": "6.9",
        "trade_status": "TRADE_SUCCESS",
    }
    assert business_fields_match(order, notification, config) is True
    assert is_paid_event(notification) is True
    notification["refund_fee"] = "1.00"
    assert is_paid_event(notification) is False


def test_smoke(tmp_path):
    env = os.environ.copy()
    env["HOST"] = "127.0.0.1"
    env["PORT"] = "45660"
    env["DATA_PATH"] = str(tmp_path / "analytics.json")
    proc = subprocess.Popen(
        [sys.executable, "app/server.py"],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.time() + 5
        while time.time() < deadline:
            try:
                with urllib.request.urlopen("http://127.0.0.1:45660/destiny-persona/health", timeout=0.5) as response:
                    assert response.status == 200
                    break
            except Exception:
                time.sleep(0.1)
        else:
            raise AssertionError(proc.stdout.read() if proc.stdout else "server did not start")

        with urllib.request.urlopen("http://127.0.0.1:45660/destiny-persona/", timeout=2) as response:
            assert response.status == 200
            html = response.read().decode()
            assert "看看今天的时运" in html
            assert "六十甲子" in html
            assert "这个产品怎么赚钱" not in html
            assert "Conversion Loop" not in html
            assert "选次数包" in html
            assert "自动到账" in html

        with urllib.request.urlopen("http://127.0.0.1:45660/destiny-persona/api/pulse", timeout=2) as response:
            pulse = json.loads(response.read().decode())
        assert pulse["ok"] is True
        assert pulse["visitorCount"] == 0
        assert pulse["readingCount"] == 0
        assert pulse["recent"] == []

        return_request = urllib.request.Request(
            "http://127.0.0.1:45660/destiny-persona/payment/return?order=DPTEST123",
            method="GET",
        )
        no_redirect = urllib.request.build_opener(NoRedirect())
        try:
            no_redirect.open(return_request, timeout=2)
        except urllib.error.HTTPError as error:
            assert error.code == 303
            assert error.headers["Location"] == "/destiny-persona/#purchase?order=DPTEST123"

        body = json.dumps({"name": "阿坐", "birth": "1995-01-01", "focus": "事业", "instinct": "雷"}).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:45660/destiny-persona/api/read",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        with opener.open(req, timeout=2) as response:
            payload = json.loads(response.read().decode())
        assert payload["ok"] is True
        assert payload["kind"] == "daily_fortune"
        assert payload["dayPillar"]["id"].startswith("JZ-")
        assert len(payload["cards"]) == 6
        assert len({card["key"] for card in payload["cards"]}) == 6
        assert payload["quota"]["remaining"] == 2
        assert payload["quota"]["freeRemaining"] == 2
        assert payload["quota"]["paidRemaining"] == 0
        assert payload["source"] == "local_calendar_rules"
        assert payload["paidAvailable"] is False
        assert "upsell" not in payload
        assert "resonance" not in payload

        for _ in range(2):
            with opener.open(req, timeout=2) as response:
                json.loads(response.read().decode())
        try:
            opener.open(req, timeout=2)
            raise AssertionError("expected quota exhaustion")
        except urllib.error.HTTPError as error:
            assert error.code == 402
            exhausted = json.loads(error.read().decode())
            assert exhausted["error"] == "quota_exhausted"
            assert exhausted["billing"]["plans"][0]["amount"] == "6.90"
            assert exhausted["paidAvailable"] is False
            assert "actions" not in exhausted
        saved = (tmp_path / "analytics.json").read_text()
        assert "1995-01-01" not in saved
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    test_sexagenary_cycle()
    test_paid_credit_order()
    with tempfile.TemporaryDirectory() as temp_dir:
        test_smoke(Path(temp_dir))
    print("PASS: 60-day cycle, six-card deck, page, quota, privacy.")
