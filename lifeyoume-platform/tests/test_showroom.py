import http.client
import threading
import unittest
from dataclasses import replace
from unittest import mock

from test_platform import app


class ShowroomTests(unittest.TestCase):
    def test_curated_order_search_and_optional_content(self):
        with mock.patch.object(app, "product_status", return_value=("live", "在线可用")):
            products = app.load_products()
            html = app.catalog_page(products).decode()
        self.assertIn("把想法，", html)
        self.assertIn('data-category-filter="轻松娱乐"', html)
        self.assertIn('<option value="lab">实验室</option>', html)
        self.assertIn("AES-256-GCM", html)
        selected = html.split('class="show-selected-grid">')[1].split('class="show-secondary-grid">')[0]
        self.assertLess(selected.index("遇见 MeYou"), selected.index("FRAME/60"))
        self.assertLess(selected.index("FRAME/60"), selected.index("FlowFrame"))
        self.assertNotIn("avatar-generator-service", html)
        old = next(item for item in products if item.id == "hover-translator")
        document = app.product_page(old).decode()
        self.assertIn("悬停取词", document)
        self.assertIn("当前暂无公开入口", document)
        self.assertNotIn('class="show-sticky"', document)

    def test_public_payload_is_additive_and_private_health_stays_private(self):
        product = app.load_products()[0]
        with mock.patch.object(app, "check_product", return_value={"status": "live"}):
            payload = app.product_payload(product)
        self.assertTrue(payload["highlights"])
        self.assertNotIn("health_url", payload)
        self.assertEqual(product.public_url, payload["public_url"])

    def request_path(self, path, products, enabled=True):
        server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        with (
            mock.patch.object(app, "ROLE", "portal"),
            mock.patch.object(app, "load_products", return_value=products),
            mock.patch.object(app.AUTH_STORE, "product_enabled", return_value=enabled),
            mock.patch.object(app.AUTH_STORE, "record_product_click") as record,
            mock.patch.object(app, "product_status", return_value=("live", "在线可用")),
        ):
            thread.start()
            connection = http.client.HTTPConnection(*server.server_address)
            try:
                connection.request("GET", path)
                response = connection.getresponse()
                result = response.status, response.getheader("Location"), response.read()
                calls = record.call_count
            finally:
                connection.close()
                server.shutdown()
                thread.join()
                server.server_close()
        return result, calls

    def test_open_uses_registry_target_and_records_exactly_once(self):
        product = app.load_products()[0]
        (status, location, _), calls = self.request_path(
            f"/products/{product.id}/open?url=https://evil.example&return=https://evil.example",
            [product],
        )
        self.assertEqual(303, status)
        self.assertEqual(product.public_url, location)
        self.assertEqual(1, calls)

    def test_details_are_not_trial_clicks(self):
        product = app.load_products()[0]
        (status, _, _), calls = self.request_path(f"/products/{product.id}?from=card", [product])
        self.assertEqual(200, status)
        self.assertEqual(0, calls)

    def test_open_refuses_disabled_private_missing_and_unavailable_products(self):
        product = app.load_products()[0]
        for item, enabled, path in [
            (product, False, f"/products/{product.id}/open"),
            (replace(product, visibility="internal"), True, f"/products/{product.id}/open"),
            (replace(product, public_url=""), True, f"/products/{product.id}/open"),
            (product, True, "/products/unknown/open"),
            (product, True, f"/products/{product.id}/open/extra"),
        ]:
            with self.subTest(path=path, enabled=enabled, visibility=item.visibility):
                (status, location, _), calls = self.request_path(path, [item], enabled)
                self.assertEqual(404, status)
                self.assertIsNone(location)
                self.assertEqual(0, calls)

    def test_preview_assets_and_truthful_limitations(self):
        for product in app.load_products():
            if product.preview:
                self.assertTrue((app.ASSET_ROOT / product.preview).is_file())
                self.assertTrue(product.preview_alt)
                self.assertTrue(product.limitations)


if __name__ == "__main__":
    unittest.main()
