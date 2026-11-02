import importlib.util
import http.client
import json
import sys
import tempfile
import threading
import unittest
import urllib.parse
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
        self.assertEqual(25, len(products))
        self.assertEqual(
            ["frame60", "decision-studio", "travel-frame", "game-hub", "privacy-vault"],
            [item.id for item in products[:5]],
        )
        self.assertTrue(all(item.platforms for item in products))
        meyou = next(item for item in products if item.id == "meyou-agent-network")
        self.assertEqual("https://meyou.lifeyoume.icu/", meyou.public_url)
        self.assertEqual("beta", meyou.lifecycle)
        flowframe = next(item for item in products if item.id == "flowframe-studio")
        self.assertEqual("https://lifeyoume.icu/flowframe/", flowframe.public_url)
        self.assertEqual("live", flowframe.lifecycle)
        avatar = next(item for item in products if item.id == "avatar-generator-service")
        self.assertEqual("internal", avatar.visibility)

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

    def test_admin_session_subject_contains_credential_revision(self):
        with mock.patch.object(app, "SESSION_SECRET", "test-secret"):
            token = app.issue_admin_session("operator", 3, now=1_000)
            self.assertEqual(
                "platform-admin:operator:3",
                app.verify_session(token, now=1_001),
            )

    def test_admin_user_rejects_a_stale_credential_revision(self):
        class Request:
            def __init__(self, token):
                self.token = token

            def cookie_value(self, name):
                return self.token if name == app.ADMIN_COOKIE else ""

        with (
            mock.patch.object(app, "SESSION_SECRET", "test-secret"),
            mock.patch.object(app, "OPS_ADMIN_USER", "operator"),
            mock.patch.object(
                app,
                "admin_credential",
                return_value={"username": "operator", "revision": 4},
            ),
        ):
            current = app.issue_admin_session("operator", 4, now=1_000)
            stale = app.issue_admin_session("operator", 3, now=1_000)
            with mock.patch("time.time", return_value=1_001):
                self.assertEqual(
                    "operator", app.Handler.admin_user(Request(current))
                )
                self.assertIsNone(app.Handler.admin_user(Request(stale)))

    def test_reserved_product_is_not_health_checked(self):
        product = app.Product(
            id="reserved",
            name="Reserved",
            tagline="Reserved product",
            summary="Not deployed",
            public_url="https://reserved.lifeyoume.icu",
            health_url="http://127.0.0.1:9999/healthz",
            lifecycle="reserved",
            availability="showcase",
            category="Test",
            owner="Test",
            audience="Test audience",
            platforms=("Web",),
            capabilities=("Test",),
            featured=False,
            visibility="public",
            visual="",
            accent="cobalt",
            cta="View",
        )
        with mock.patch("urllib.request.urlopen") as urlopen:
            result = app.check_product(product)
        urlopen.assert_not_called()
        self.assertEqual({"status": "reserved", "latency_ms": None}, result)

    def test_public_catalog_excludes_internal_components(self):
        products = app.visible_products(app.load_products())
        ids = [item.id for item in products]
        self.assertIn("frame60", ids)
        self.assertIn("delivery-pilot", ids)
        self.assertNotIn("avatar-generator-service", ids)

    def test_public_catalog_excludes_disabled_products(self):
        products = app.load_products()
        with mock.patch.object(
            app.AUTH_STORE,
            "product_enabled",
            side_effect=lambda product_id: product_id != "privacy-vault",
        ):
            visible_ids = [item.id for item in app.visible_products(products)]
            catalog = app.catalog_page(products).decode("utf-8")
            detail_product = next(item for item in products if item.id == "decision-studio")
            detail = app.product_page(detail_product, products).decode("utf-8")

        self.assertNotIn("privacy-vault", visible_ids)
        self.assertNotIn("/products/privacy-vault", catalog)
        self.assertNotIn("/products/privacy-vault", detail)
        self.assertIn("decision-studio", visible_ids)

    def test_catalog_ranking_uses_clicks_pins_rotation_and_unavailable_last(self):
        products = [
            app.Product(
                id=product_id,
                name=product_id,
                tagline=product_id,
                summary=product_id,
                public_url=url,
                health_url="",
                lifecycle="preview",
                availability="showcase",
                category="Test",
                owner="Test",
                audience="Test",
                platforms=("Web",),
                capabilities=("Test",),
                featured=False,
                visibility="public",
                visual="",
                accent="cobalt",
                cta="Open",
            )
            for product_id, url in [
                ("alpha", "https://lifeyoume.icu/a"),
                ("bravo", "https://lifeyoume.icu/b"),
                ("charlie", "https://lifeyoume.icu/c"),
                ("desktop", ""),
            ]
        ]
        stats = {
            "alpha": {"clicks_24h": 1, "clicks_7d": 8, "total": 9},
            "bravo": {"clicks_24h": 2, "clicks_7d": 8, "total": 10},
            "charlie": {"clicks_24h": 0, "clicks_7d": 1, "total": 1},
            "desktop": {"clicks_24h": 99, "clicks_7d": 99, "total": 99},
        }
        with (
            mock.patch.object(app.AUTH_STORE, "product_click_stats", return_value=stats),
            mock.patch.object(
                app.AUTH_STORE,
                "pinned_priorities",
                return_value={"alpha": 0, "bravo": 0, "charlie": 9, "desktop": 99},
            ),
            mock.patch.object(app.AUTH_STORE, "rotation_minutes", return_value=1),
        ):
            first, _, _, _ = app.ranked_products(products, now=0)
            second, _, _, _ = app.ranked_products(products, now=60)

        self.assertEqual(
            ["charlie", "alpha", "bravo", "desktop"],
            [item.id for item in first],
        )
        self.assertEqual(
            ["charlie", "bravo", "alpha", "desktop"],
            [item.id for item in second],
        )

    def test_portal_and_detail_pages_use_real_catalog_data(self):
        products = app.load_products()
        portal = app.portal_page(products).decode("utf-8")
        catalog = app.catalog_page(products).decode("utf-8")
        vault = next(item for item in products if item.id == "privacy-vault")
        detail = app.product_page(vault).decode("utf-8")

        self.assertIn("把 AI 变成真正可使用的个人工具与生产系统", portal)
        self.assertIn("/products/privacy-vault?from=card", catalog)
        self.assertIn("/products/flowframe-studio?from=card", catalog)
        self.assertIn('rel="icon" type="image/svg+xml"', catalog)
        self.assertIn('href="/products/privacy-vault/open"', detail)
        self.assertNotIn("avatar-generator-service", portal)

        resume = next(item for item in products if item.id == "resume-forge")
        resume_detail = app.product_page(resume, products).decode("utf-8")
        self.assertIn('href="/products/resume-forge/open"', resume_detail)
        self.assertIn("求职成长产品线", resume_detail)
        self.assertIn("/products/fde-playbook", resume_detail)

    def test_live_static_product_does_not_require_fake_health_endpoint(self):
        vault = next(
            item for item in app.load_products() if item.id == "privacy-vault"
        )
        self.assertEqual({"status": "live", "latency_ms": None}, app.check_product(vault))

    def test_registered_product_visuals_exist(self):
        for product in app.load_products():
            if product.visual:
                self.assertTrue(
                    (app.ASSET_ROOT / product.visual).is_file(),
                    f"Missing visual for {product.id}",
                )

    def test_billing_status_defaults_to_disabled(self):
        self.assertFalse(app.PAYMENT_CONFIGURED)
        self.assertEqual("", app.PAYMENT_PROVIDER)

    def test_sso_redirects_only_allow_lifeyoume_https_hosts(self):
        self.assertEqual(
            "https://lifeyoume.icu/vault/",
            app.safe_return_to("https://lifeyoume.icu/vault/"),
        )
        self.assertEqual(
            "https://audit.lifeyoume.icu/",
            app.safe_return_to("https://audit.lifeyoume.icu/"),
        )
        self.assertEqual(
            "https://lifeyoume.icu/",
            app.safe_return_to("https://lifeyoume.icu.evil.example/"),
        )
        self.assertIsNone(app.trusted_origin("https://example.com"))

    def test_admin_dashboard_contains_account_and_product_controls(self):
        with tempfile.TemporaryDirectory() as directory:
            store = app.AuthStore(Path(directory) / "auth.db")
            store.initialize()
            store.create_user(
                "admin-test@example.com",
                "Admin Test",
                app.password_hash("not used by this render"),
                now=1_000,
            )
            with mock.patch.object(app, "AUTH_STORE", store):
                document = app.admin_dashboard(
                    app.load_products(), "operator", "csrf-test"
                ).decode("utf-8")
        self.assertIn('action="/admin/users/status"', document)
        self.assertIn('action="/admin/users/password"', document)
        self.assertIn('action="/admin/products/access-policy"', document)
        self.assertIn('action="/admin/products/login-policy"', document)
        self.assertIn('action="/admin/products/ranking-policy"', document)
        self.assertIn('action="/admin/products/rotation"', document)
        self.assertIn('class="admin-app" data-admin-app', document)
        self.assertIn('data-admin-view="overview"', document)
        self.assertIn('data-admin-view="products" hidden', document)
        self.assertIn('data-admin-view="heat" hidden', document)
        self.assertIn('data-admin-view="security" hidden', document)
        self.assertIn('action="/admin/security/password"', document)
        self.assertIn('name="current_password"', document)
        self.assertIn('name="new_password"', document)
        self.assertIn('name="confirm_password"', document)
        self.assertIn('aria-controls="admin-current-password"', document)
        self.assertIn('aria-controls="admin-new-password"', document)
        self.assertIn('aria-controls="admin-confirm-password"', document)
        self.assertEqual(3, document.count('aria-pressed="false"'))
        self.assertIn('aria-errormessage="admin-current-password-error"', document)
        self.assertIn('aria-errormessage="admin-new-password-error"', document)
        self.assertIn('aria-errormessage="admin-confirm-password-error"', document)
        self.assertEqual(3, document.count('class="field-error"'))
        self.assertIn('id="admin-password-feedback"', document)
        self.assertIn('aria-live="assertive"', document)
        self.assertIn('/assets/portal.css?v=9', document)
        self.assertIn('/assets/portal.js?v=11', document)
        self.assertIn('data-admin-table="heat" data-page-size="8"', document)
        self.assertIn('data-admin-table="products" data-page-size="7"', document)
        self.assertIn('data-admin-search="products"', document)
        self.assertIn("产品访问", document)
        self.assertIn("关闭访问", document)
        self.assertIn("用户兴趣与产品表现", document)
        self.assertIn("热门产品榜", document)
        self.assertIn("7 日点击趋势", document)
        self.assertIn("展示 1", document)
        self.assertNotIn("TOP 1", document)
        self.assertIn("还没有点击数据", document)
        self.assertIn("无公开入口 · 置底", document)
        self.assertNotIn('class="site-header"', document)
        self.assertIn("privacy-vault", document)
        self.assertNotIn("not used by this render", document)
        self.assertIn("https://meyou.lifeyoume.icu/admin", document)
        self.assertIn("遇见 MeYou · 模型控制台", document)

    def test_discovery_filters_include_all_categories_and_distinguish_promotions(self):
        with tempfile.TemporaryDirectory() as directory:
            store = app.AuthStore(Path(directory) / "auth.db")
            store.initialize()
            store.record_product_click("privacy-vault")
            store.set_pinned_priority("flowframe-studio", 20, "test")
            with mock.patch.object(app, "AUTH_STORE", store):
                document = app.catalog_page(app.load_products(), home=True).decode()
        self.assertIn('data-category-filter="轻松娱乐"', document)
        self.assertIn('id="product-availability"', document)
        self.assertIn("主推产品", document)
        self.assertIn("热度 TOP 1", document)
        self.assertNotIn("热度 TOP 2", document)
        self.assertIn('/assets/discovery.css', document)

    def test_admin_session_cookie_is_cross_subdomain_for_child_admins(self):
        header = app.Handler.admin_session_cookie("token-value")
        self.assertIn("Domain=.lifeyoume.icu", header)
        self.assertIn("Path=/", header)
        self.assertIn("HttpOnly", header)
        self.assertIn("Secure", header)
        self.assertIn("SameSite=Strict", header)

        expired = app.Handler.admin_session_cookie("", max_age=0)
        self.assertIn("Max-Age=0", expired)
        self.assertIn("Expires=Thu, 01 Jan 1970 00:00:00 GMT", expired)

    def test_admin_can_change_own_password_and_old_session_is_revoked(self):
        with tempfile.TemporaryDirectory() as directory:
            store = app.AuthStore(Path(directory) / "auth.db")
            store.initialize()
            store.ensure_admin_credential(
                "operator",
                app.password_hash("initial administrator password"),
                now=1_000,
            )
            server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            with (
                mock.patch.object(app, "ROLE", "ops"),
                mock.patch.object(app, "SESSION_SECRET", "test-session-secret"),
                mock.patch.object(app, "OPS_ADMIN_USER", "operator"),
                mock.patch.object(app, "AUTH_STORE", store),
                mock.patch.object(app.Handler, "log_message"),
            ):
                thread.start()
                connection = http.client.HTTPConnection(*server.server_address)
                try:
                    connection.request("GET", "/admin/")
                    login_page = connection.getresponse()
                    csrf_cookie = login_page.getheader("Set-Cookie").split(";", 1)[0]
                    login_page.read()
                    csrf_token = csrf_cookie.split("=", 1)[1]

                    login_body = urllib.parse.urlencode(
                        {
                            "csrf_token": csrf_token,
                            "username": "operator",
                            "password": "initial administrator password",
                        }
                    )
                    connection.request(
                        "POST",
                        "/admin/login",
                        body=login_body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": csrf_cookie,
                        },
                    )
                    login = connection.getresponse()
                    self.assertEqual(303, login.status)
                    admin_cookie = login.getheader("Set-Cookie").split(";", 1)[0]
                    login.read()

                    change_body = urllib.parse.urlencode(
                        {
                            "csrf_token": csrf_token,
                            "current_password": "initial administrator password",
                            "new_password": "replacement administrator password",
                            "confirm_password": "replacement administrator password",
                        }
                    )
                    connection.request(
                        "POST",
                        "/admin/security/password",
                        body=change_body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": f"{csrf_cookie}; {admin_cookie}",
                        },
                    )
                    changed = connection.getresponse()
                    self.assertEqual(303, changed.status)
                    self.assertEqual(
                        "/admin/login?changed=1", changed.getheader("Location")
                    )
                    self.assertIn("Max-Age=0", changed.getheader("Set-Cookie"))
                    changed.read()

                    connection.request(
                        "GET", "/admin/", headers={"Cookie": admin_cookie}
                    )
                    stale_session = connection.getresponse()
                    stale_body = stale_session.read().decode("utf-8")
                    self.assertEqual(200, stale_session.status)
                    self.assertIn("进入管理后台", stale_body)
                    self.assertNotIn("安全设置", stale_body)

                    old_login_body = urllib.parse.urlencode(
                        {
                            "csrf_token": csrf_token,
                            "username": "operator",
                            "password": "initial administrator password",
                        }
                    )
                    connection.request(
                        "POST",
                        "/admin/login",
                        body=old_login_body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": csrf_cookie,
                        },
                    )
                    old_login = connection.getresponse()
                    self.assertEqual(401, old_login.status)
                    old_login.read()

                    new_login_body = urllib.parse.urlencode(
                        {
                            "csrf_token": csrf_token,
                            "username": "operator",
                            "password": "replacement administrator password",
                        }
                    )
                    connection.request(
                        "POST",
                        "/admin/login",
                        body=new_login_body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": csrf_cookie,
                        },
                    )
                    new_login = connection.getresponse()
                    self.assertEqual(303, new_login.status)
                    new_login.read()
                finally:
                    connection.close()
                    server.shutdown()
                    thread.join()
                    server.server_close()

    def test_user_can_change_password_and_must_sign_in_again(self):
        with tempfile.TemporaryDirectory() as directory:
            store = app.AuthStore(Path(directory) / "auth.db")
            store.initialize()
            user = store.create_user(
                "member@example.com",
                "Member",
                app.password_hash("initial member password"),
                now=1_000,
            )
            session = store.create_session(user.id, 3_600)
            server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            with (
                mock.patch.object(app, "ROLE", "auth"),
                mock.patch.object(app, "AUTH_STORE", store),
                mock.patch.object(app.Handler, "log_message"),
            ):
                thread.start()
                connection = http.client.HTTPConnection(*server.server_address)
                try:
                    session_cookie = f"{app.SSO_COOKIE}={session}"
                    connection.request(
                        "GET", "/account", headers={"Cookie": session_cookie}
                    )
                    account = connection.getresponse()
                    self.assertEqual(200, account.status)
                    csrf_cookie = account.getheader("Set-Cookie").split(";", 1)[0]
                    csrf_token = csrf_cookie.split("=", 1)[1]
                    account_body = account.read().decode("utf-8")
                    self.assertIn('action="/account/password"', account_body)
                    self.assertIn('autocomplete="current-password"', account_body)
                    self.assertEqual(
                        3, account_body.count("data-account-password-toggle")
                    )

                    wrong_body = urllib.parse.urlencode(
                        {
                            "csrf_token": csrf_token,
                            "current_password": "wrong member password",
                            "new_password": "replacement member password",
                            "confirm_password": "replacement member password",
                        }
                    )
                    connection.request(
                        "POST",
                        "/account/password",
                        body=wrong_body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": f"{session_cookie}; {csrf_cookie}",
                        },
                    )
                    wrong = connection.getresponse()
                    self.assertEqual(401, wrong.status)
                    wrong_document = wrong.read().decode("utf-8")
                    self.assertIn("当前密码不正确", wrong_document)
                    self.assertIn('id="account-current-password"', wrong_document)
                    self.assertIn('autocomplete="current-password"', wrong_document)
                    self.assertIn('aria-invalid="true"', wrong_document)
                    self.assertIn('autofocus', wrong_document)

                    change_body = urllib.parse.urlencode(
                        {
                            "csrf_token": csrf_token,
                            "current_password": "initial member password",
                            "new_password": "replacement member password",
                            "confirm_password": "replacement member password",
                        }
                    )
                    connection.request(
                        "POST",
                        "/account/password",
                        body=change_body,
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": f"{session_cookie}; {csrf_cookie}",
                        },
                    )
                    changed = connection.getresponse()
                    self.assertEqual(303, changed.status)
                    self.assertEqual("/login?changed=1", changed.getheader("Location"))
                    self.assertIn("Max-Age=0", changed.getheader("Set-Cookie"))
                    changed.read()

                    connection.request(
                        "GET", "/account", headers={"Cookie": session_cookie}
                    )
                    stale = connection.getresponse()
                    self.assertEqual(303, stale.status)
                    stale.read()

                    self.assertIsNone(
                        store.authenticate(
                            "member@example.com",
                            "initial member password",
                            app.verify_password,
                        )
                    )
                    self.assertEqual(
                        user.id,
                        store.authenticate(
                            "member@example.com",
                            "replacement member password",
                            app.verify_password,
                        ).id,
                    )
                finally:
                    connection.close()
                    server.shutdown()
                    thread.join()
                    server.server_close()


if __name__ == "__main__":
    unittest.main()
