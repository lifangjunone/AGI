import unittest

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

from analyzer import SafeFetchError, parse_robots, public_url, robot_status, score_report  # noqa: E402


class AnalyzerTests(unittest.TestCase):
    def test_public_url_normalizes_domain(self):
        self.assertEqual(public_url("example.com"), "https://example.com/")

    def test_public_url_rejects_localhost(self):
        with self.assertRaises(SafeFetchError):
            public_url("http://localhost:8000")

    def test_robot_status_blocks_named_bot(self):
        parsed = parse_robots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n")
        status = robot_status(parsed, "GPTBot")
        self.assertEqual(status["status"], "blocked")

    def test_score_penalizes_noindex_and_small_text(self):
        report = {
            "page": {
                "status": 200,
                "textLength": 20,
                "title": "Title",
                "description": "",
                "metaRobots": "noindex",
                "canonical": "",
            },
            "robots": {"bots": [{"status": "blocked"}, {"status": "allowed"}]},
            "llms": {"exists": False},
        }
        rating = score_report(report)
        self.assertLess(rating["score"], 60)
        self.assertEqual(rating["grade"], "D")


if __name__ == "__main__":
    unittest.main()
