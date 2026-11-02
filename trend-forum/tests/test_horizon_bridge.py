import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "horizon_bridge.py"
SPEC = importlib.util.spec_from_file_location("horizon_bridge", SCRIPT)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class HorizonBridgeTests(unittest.TestCase):
    def sample_report(self):
        boards = []
        for index in range(70):
            source = f"Source {index % 12}"
            boards.append(
                {
                    "key": f"board-{index}",
                    "label": source,
                    "items": [
                        {
                            "title": f"Story {index}",
                            "url": f"https://example.com/{index}?utm_source=test",
                            "source": source,
                            "summary": "Useful technical context",
                            "published_at": "2026-11-02T00:00:00Z",
                            "engagement": index * 100,
                            "score": index,
                        }
                    ],
                }
            )
        return {
            "generated_at": "2026-11-02T00:00:00Z",
            "news_boards": boards,
            "signals": [],
            "items": [],
        }

    def test_technology_candidates_are_capped_and_keep_metadata(self):
        candidates = bridge.technology_candidates(self.sample_report())
        self.assertEqual(len(candidates), 60)
        self.assertEqual(candidates[0]["metadata"]["priority"], "board-top")
        self.assertIn("engagement", candidates[0]["metadata"])
        self.assertNotIn("utm_source", candidates[0]["url"])

    def test_duplicate_url_and_title_are_removed(self):
        report = self.sample_report()
        duplicate = dict(report["news_boards"][0])
        duplicate["key"] = "duplicate"
        duplicate["label"] = "Duplicate"
        report["news_boards"].insert(1, duplicate)
        candidates = bridge.technology_candidates(report)
        urls = [candidate["url"] for candidate in candidates]
        self.assertEqual(len(urls), len(set(urls)))

    def test_edition_slot_uses_shanghai_six_hour_window(self):
        moment = datetime(2026, 11, 2, 1, 5, tzinfo=timezone.utc)
        self.assertEqual(bridge.edition_id(moment), "2026-11-02T06")

    def test_editions_are_idempotent(self):
        generated = "2026-11-02T04:00:00+00:00"
        previous = {
            "editions": [
                {"id": "2026-11-02T12", "generatedAt": generated, "itemIds": ["old"]},
                {"id": "2026-11-02T06", "generatedAt": generated, "itemIds": ["older"]},
            ]
        }
        merged = bridge.merge_editions(
            previous,
            "2026-11-02T12",
            generated,
            [{"id": "new"}],
        )
        self.assertEqual([row["id"] for row in merged], ["2026-11-02T12", "2026-11-02T06"])
        self.assertEqual(merged[0]["itemIds"], ["new"])

    def test_mark_stale_preserves_existing_items(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "insights.json"
            path.write_text(
                json.dumps({"status": "fresh", "items": [{"id": "kept"}], "editions": []}),
                encoding="utf-8",
            )
            bridge.mark_stale(path, "model unavailable")
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "stale")
            self.assertEqual(payload["items"][0]["id"], "kept")
            self.assertEqual(payload["staleReason"], "model unavailable")

    def test_merge_items_keeps_only_retained_edition_details(self):
        previous = {
            "items": [
                {"id": "old", "title": "Old"},
                {"id": "expired", "title": "Expired"},
                {"id": "same", "title": "Stale copy"},
            ]
        }
        editions = [
            {"id": "new-edition", "itemIds": ["same", "new"]},
            {"id": "old-edition", "itemIds": ["old"]},
        ]
        merged = bridge.merge_items(
            previous,
            editions,
            [{"id": "same", "title": "Fresh copy"}, {"id": "new", "title": "New"}],
        )
        self.assertEqual([item["id"] for item in merged], ["same", "new", "old"])
        self.assertEqual(merged[0]["title"], "Fresh copy")


if __name__ == "__main__":
    unittest.main()
