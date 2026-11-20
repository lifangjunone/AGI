import unittest


class SmokeTests(unittest.TestCase):
    def test_paths_declared(self):
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
        import server
        self.assertIn("/typewriter", server.PROJECTS)
        self.assertIn("/feihua-map", server.PROJECTS)


if __name__ == "__main__":
    unittest.main()
