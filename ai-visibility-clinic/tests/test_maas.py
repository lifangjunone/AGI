import unittest

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

from maas import maas_configured, parse_json_object  # noqa: E402


class MaasTests(unittest.TestCase):
    def test_maas_configured(self):
        self.assertFalse(maas_configured({"MAAS_SERVICE_KEY": ""}))
        self.assertTrue(maas_configured({"MAAS_SERVICE_KEY": "secret"}))

    def test_parse_json_object(self):
        self.assertEqual(parse_json_object('{"a":1}')["a"], 1)
        self.assertEqual(parse_json_object('prefix {"b":2} suffix')["b"], 2)


if __name__ == "__main__":
    unittest.main()
