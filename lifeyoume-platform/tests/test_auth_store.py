import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

PLATFORM_DIR = Path(__file__).resolve().parents[1] / "platform"
if str(PLATFORM_DIR) not in sys.path:
    sys.path.insert(0, str(PLATFORM_DIR))

from auth_store import AuthStore

APP_PATH = PLATFORM_DIR / "app.py"
SPEC = importlib.util.spec_from_file_location("lifeyoume_auth_test_app", APP_PATH)
assert SPEC and SPEC.loader
app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = app
SPEC.loader.exec_module(app)


class AuthStoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = AuthStore(Path(self.directory.name) / "auth.db")
        self.store.initialize()

    def tearDown(self):
        self.directory.cleanup()

    def create_user(self):
        return self.store.create_user(
            "USER@example.com",
            "Test User",
            app.password_hash("correct horse battery staple"),
            now=1_000,
        )

    def test_account_session_and_revocation(self):
        user = self.create_user()
        authenticated = self.store.authenticate(
            "user@example.com", "correct horse battery staple", app.verify_password
        )
        self.assertEqual(user.id, authenticated.id)
        self.assertIsNone(
            self.store.authenticate(
                "user@example.com", "wrong password", app.verify_password
            )
        )

        token = self.store.create_session(user.id, 300, now=2_000)
        self.assertEqual(user.id, self.store.session_user(token, now=2_001).id)
        self.store.revoke_session(token, now=2_002)
        self.assertIsNone(self.store.session_user(token, now=2_003))

    def test_device_authorization_issues_scoped_bearer(self):
        user = self.create_user()
        device_code, user_code, interval = self.store.start_device_authorization(
            "delivery-control-center", now=3_000
        )
        self.assertEqual(5, interval)
        self.assertEqual(
            ("authorization_pending", None, None),
            self.store.exchange_device(device_code, now=3_001),
        )
        self.assertTrue(self.store.approve_device(user_code, user.id, now=3_002))
        status, access_token, client_id = self.store.exchange_device(
            device_code, now=3_003
        )
        self.assertEqual("ok", status)
        self.assertEqual("delivery-control-center", client_id)
        self.assertEqual(
            user.id, self.store.bearer_user(access_token, now=3_004).id
        )
        self.assertEqual(
            ("expired_token", None, None),
            self.store.exchange_device(device_code, now=3_005),
        )

    def test_admin_can_disable_enable_and_reset_password(self):
        user = self.create_user()
        session = self.store.create_session(user.id, 300, now=4_000)
        self.assertTrue(
            self.store.set_user_status(user.id, "disabled", "admin", now=4_001)
        )
        self.assertIsNone(self.store.session_user(session, now=4_002))
        self.assertIsNone(
            self.store.authenticate(
                "user@example.com", "correct horse battery staple", app.verify_password
            )
        )

        self.assertTrue(
            self.store.set_user_status(user.id, "active", "admin", now=4_003)
        )
        self.assertTrue(
            self.store.set_user_password(
                user.id,
                app.password_hash("replacement password 2026"),
                "admin",
                now=4_004,
            )
        )
        authenticated = self.store.authenticate(
            "user@example.com", "replacement password 2026", app.verify_password
        )
        self.assertEqual(user.id, authenticated.id)
        self.assertEqual(3, len(self.store.recent_admin_audit()))

    def test_product_login_policy_defaults_to_required_and_is_mutable(self):
        self.assertTrue(self.store.login_required("privacy-vault"))
        self.store.set_login_required("privacy-vault", False, "admin", now=5_000)
        self.assertFalse(self.store.login_required("privacy-vault"))
        self.store.set_login_required("privacy-vault", True, "admin", now=5_001)
        self.assertTrue(self.store.login_required("privacy-vault"))
        actions = [item["action"] for item in self.store.recent_admin_audit()]
        self.assertEqual(
            ["product.login_required", "product.login_optional"], actions
        )


if __name__ == "__main__":
    unittest.main()
