import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import opportunity_engine as engine


def sample_report():
    return {
        "generated_at": "2026-08-17T09:00:00+00:00",
        "source_status": [
            {"source": "Hacker News", "status": "ok"},
            {"source": "GitHub Trending", "status": "ok"},
        ],
        "signals": [
            {
                "title": "Open source agent orchestrator adds checkpoint recovery",
                "summary": "A coding agent workflow can resume interrupted tasks.",
                "score": 82,
                "source_count": 2,
                "sources": ["Hacker News", "GitHub Trending"],
                "evidence": [
                    {
                        "title": "Agent orchestrator release",
                        "url": "https://example.com/agent",
                        "source": "Hacker News",
                        "summary": "82 points and implementation discussion",
                        "published_at": "2026-08-17T07:00:00Z",
                    },
                    {
                        "title": "Checkpoint runtime repository",
                        "url": "https://github.com/example/checkpoint",
                        "source": "GitHub Trending",
                        "summary": "Open source runtime",
                        "published_at": "2026-08-17T06:00:00Z",
                    },
                ],
            },
            {
                "title": "MCP knowledge graph server for concept cards",
                "summary": "A knowledge graph and RAG indexing tool for AI agents.",
                "score": 74,
                "source_count": 2,
                "sources": ["Product Hunt", "Hacker News"],
                "evidence": [
                    {
                        "title": "Knowledge graph MCP server",
                        "url": "https://example.com/knowledge",
                        "source": "Product Hunt",
                        "summary": "Launch discussion",
                        "published_at": "2026-08-17T05:00:00Z",
                    }
                ],
            },
        ],
    }


class OpportunityEngineTests(unittest.TestCase):
    def test_generates_at_most_three_complete_opportunities(self):
        report = engine.generate_report([
            (Path("2026-08-17.json"), sample_report()),
            (Path("2026-08-16.json"), sample_report()),
        ])

        self.assertGreaterEqual(len(report["opportunities"]), 1)
        self.assertLessEqual(len(report["opportunities"]), 3)
        required = {
            "buyer", "pain", "offer", "price", "channel", "evidence",
            "experiment", "pass_condition", "stop_condition", "team_profiles",
        }
        for opportunity in report["opportunities"]:
            self.assertTrue(required.issubset(opportunity))
            self.assertTrue(opportunity["evidence"])
            self.assertEqual(len(opportunity["experiment"]), 4)
            self.assertEqual(
                set(opportunity["team_profiles"]),
                {"solo", "micro", "growth"},
            )
            solo = opportunity["team_profiles"]["solo"]
            self.assertGreaterEqual(solo["fit_score"], 70)
            self.assertGreater(solo["cash_budget"], 0)
            self.assertGreater(solo["hours"], 0)
            self.assertLessEqual(solo["launch_days"], 30)
            self.assertEqual(
                [stage["id"] for stage in solo["lifecycle"]],
                [
                    "discover", "validate", "build", "launch",
                    "promote", "monetize", "optimize",
                ],
            )
            for stage in solo["lifecycle"]:
                self.assertTrue(stage["tasks"])
                self.assertTrue(stage["gate"])

    def test_team_scale_changes_investment_and_capacity(self):
        report = engine.generate_report([(Path("2026-08-17.json"), sample_report())])
        profiles = report["opportunities"][0]["team_profiles"]

        self.assertLess(
            profiles["solo"]["cash_budget"],
            profiles["micro"]["cash_budget"],
        )
        self.assertLess(
            profiles["micro"]["cash_budget"],
            profiles["growth"]["cash_budget"],
        )
        self.assertNotEqual(profiles["solo"]["scope"], profiles["growth"]["scope"])

    def test_rejects_report_without_actionable_matches(self):
        weak = {
            "generated_at": "2026-08-17T09:00:00+00:00",
            "signals": [{
                "title": "Unrelated sports score",
                "summary": "A match result",
                "score": 99,
                "source_count": 3,
            }],
        }
        with self.assertRaisesRegex(RuntimeError, "没有候选"):
            engine.generate_report([(Path("2026-08-17.json"), weak)])

    def test_save_writes_json_and_html(self):
        report = engine.generate_report([(Path("2026-08-17.json"), sample_report())])
        with tempfile.TemporaryDirectory() as temp:
            original_report_dir = engine.REPORT_DIR
            original_support_dir = engine.SUPPORT_DIR
            original_latest_html = engine.LATEST_HTML
            try:
                engine.SUPPORT_DIR = Path(temp)
                engine.REPORT_DIR = Path(temp) / "reports"
                engine.LATEST_HTML = Path(temp) / "latest.html"
                json_path, html_path = engine.save_report(report)
                self.assertTrue(json_path.exists())
                self.assertTrue(html_path.exists())
                self.assertIn("商机罗盘", html_path.read_text(encoding="utf-8"))
            finally:
                engine.REPORT_DIR = original_report_dir
                engine.SUPPORT_DIR = original_support_dir
                engine.LATEST_HTML = original_latest_html

    def test_html_exposes_update_times_and_manual_refresh(self):
        report = engine.generate_report([(Path("2026-08-17.json"), sample_report())])
        document = engine.render_html(report)

        self.assertIn("商机生成", document)
        self.assertIn("来源数据", document)
        self.assertIn('id="refresh-data"', document)
        self.assertIn("更新数据", document)
        self.assertIn("action:'refresh'", document)


if __name__ == "__main__":
    unittest.main()
