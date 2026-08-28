import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

APP_PATH = Path(__file__).resolve().parents[1] / "platform" / "app.py"
SPEC = importlib.util.spec_from_file_location("lifeyoume_platform_app", APP_PATH)
assert SPEC and SPEC.loader
app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = app
SPEC.loader.exec_module(app)


class PlatformTests(unittest.TestCase):
    def test_registry_loads_independent_products(self):
        products = app.load_products()
        self.assertEqual(["audit", "easysay"], [item.id for item in products])
        self.assertEqual("live", products[0].lifecycle)
        self.assertEqual("reserved", products[1].lifecycle)

    def test_registry_rejects_external_health_endpoint(self):
        payload = {
            "schema_version": 1,
            "products": [
                {
                    "id": "bad-product",
                    "name": "Bad",
                    "summary": "Bad health URL",
                    "public_url": "https://bad.lifeyoume.icu",
                    "health_url": "https://example.com/health",
                    "lifecycle": "live",
                    "category": "Test",
                    "owner": "Test",
                }
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "products.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "loopback"):
                app.load_products(path)

    def test_password_hash_round_trip(self):
        encoded = app.password_hash("correct horse battery staple", b"0" * 16)
        self.assertTrue(app.verify_password("correct horse battery staple", encoded))
        self.assertFalse(app.verify_password("wrong", encoded))

    def test_signed_session_expires_and_rejects_tampering(self):
        with mock.patch.object(app, "SESSION_SECRET", "test-secret"):
            token = app.issue_session("operator", now=1_000)
            self.assertEqual("operator", app.verify_session(token, now=1_001))
            self.assertIsNone(
                app.verify_session(token, now=1_000 + app.SESSION_TTL_SECONDS + 1)
            )
            self.assertIsNone(app.verify_session(token[:-2] + "AA", now=1_001))

    def test_reserved_product_is_not_health_checked(self):
        product = app.Product(
            id="reserved",
            name="Reserved",
            summary="Not deployed",
            public_url="https://reserved.lifeyoume.icu",
            health_url="http://127.0.0.1:9999/healthz",
            lifecycle="reserved",
            category="Test",
            owner="Test",
        )
        with mock.patch("urllib.request.urlopen") as urlopen:
            result = app.check_product(product)
        urlopen.assert_not_called()
        self.assertEqual({"status": "reserved", "latency_ms": None}, result)

    def test_billing_status_defaults_to_disabled(self):
        self.assertFalse(app.PAYMENT_CONFIGURED)
        self.assertEqual("", app.PAYMENT_PROVIDER)


if __name__ == "__main__":
    unittest.main()
