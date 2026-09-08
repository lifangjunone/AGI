import datetime as dt
import unittest
from unittest.mock import patch

from technology_explorer import (
    Aggregator,
    PRODUCT_MATRIX,
    ReportStore,
    TechItem,
    active_search,
    product_catalog_search,
    research_context,
    search_item_in_time_range,
    search_query_with_time,
)


class ResearchTopicTests(unittest.TestCase):
    def test_required_product_topics_are_added_without_duplicate_assistant_topic(self):
        context = research_context({
            "research_topics": [{
                "id": "custom-assistant",
                "name": "AI 个人助手",
                "keywords": ["WorkBuddy", "Kimi Work"],
            }]
        })

        names = [topic["name"] for topic in context["topics"]]
        self.assertEqual(names.count("AI 个人助手"), 1)
        self.assertIn("Agent 平台", names)
        self.assertIn("AI Coding", names)
        self.assertIn("知识引擎", names)

    def test_news_board_items_keep_topic_ids(self):
        aggregator = Aggregator({
            "research_topics": [{
                "id": "assistants",
                "name": "个人助理",
                "keywords": ["WorkBuddy"],
            }]
        })
        item = TechItem(
            title="WorkBuddy 发布桌面版更新",
            url="https://example.com/workbuddy",
            source="AI今日热榜",
            summary="新增本地文件处理能力",
            published_at=dt.datetime.now(dt.timezone.utc).isoformat(),
            engagement=100,
            evidence="测试来源",
        )

        boards = aggregator.build_news_boards([item])

        self.assertIn("assistants", boards[0]["items"][0]["topic_ids"])


class ProductMatrixRenderTests(unittest.TestCase):
    def test_matrix_contains_requested_vendors_without_duplicates(self):
        vendors = [vendor["vendor"] for vendor in PRODUCT_MATRIX]

        self.assertEqual(len(vendors), 19)
        self.assertEqual(len(vendors), len(set(vendors)))
        for vendor in ("华为", "京东", "小米", "美团", "智谱", "DeepSeek"):
            self.assertIn(vendor, vendors)

    def test_every_vendor_has_a_governance_column(self):
        governance_products = {
            vendor["vendor"]: vendor["products"]["governance"][0]
            for vendor in PRODUCT_MATRIX
        }

        self.assertEqual(governance_products["腾讯"], "ADP Agent Portal")
        self.assertEqual(governance_products["阿里巴巴"], "Agent ID Guard")
        self.assertEqual(governance_products["字节跳动"], "AgentSphere")
        self.assertEqual(governance_products["Microsoft"], "Microsoft Agent 365")
        self.assertEqual(governance_products["ServiceNow"], "AI Control Tower")
        self.assertTrue(all("governance" in vendor["products"] for vendor in PRODUCT_MATRIX))

    def test_every_vendor_has_a_knowledge_engine_column(self):
        knowledge_engines = {
            vendor["vendor"]: vendor["products"]["data"][0]
            for vendor in PRODUCT_MATRIX
        }

        self.assertEqual(knowledge_engines["腾讯"], "ima / 腾讯乐享")
        self.assertEqual(knowledge_engines["阿里巴巴"], "百炼 Agentic RAG")
        self.assertEqual(knowledge_engines["字节跳动"], "企业知识引擎")
        self.assertEqual(knowledge_engines["百度"], "甄知 / 千帆知识库")
        self.assertTrue(all("data" in vendor["products"] for vendor in PRODUCT_MATRIX))

    def test_report_contains_product_matrix_and_topic_aware_board_rows(self):
        report = {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "research_context": {
                "topics": [{
                    "id": "assistants",
                    "name": "个人助理",
                    "keywords": ["WorkBuddy"],
                }]
            },
            "items": [],
            "signals": [],
            "news_boards": [{
                "key": "news",
                "label": "测试",
                "category": "tech",
                "items": [{
                    "title": "WorkBuddy 发布桌面版更新",
                    "url": "https://example.com/workbuddy",
                    "summary": "办公智能体升级",
                    "score": 80,
                    "evidence": "测试来源",
                }],
            }],
            "source_status": [{"source": "测试", "status": "ok", "items": 1}],
            "quality_stats": {},
        }

        page = ReportStore().render_html(report)

        self.assertIn('id="products-view"', page)
        self.assertIn('data-workspace-mode="products"', page)
        self.assertIn('data-topics="assistants"', page)
        self.assertIn("Agent 平台", page)
        self.assertIn('data-product-column="governance"', page)
        self.assertIn("Agent 纳管平台", page)
        self.assertIn("ADP Agent Portal", page)
        self.assertIn('data-product-column="data"', page)
        self.assertIn("知识引擎", page)
        self.assertIn("ima / 腾讯乐享", page)
        self.assertIn("AI Coding", page)
        self.assertIn('id="company-picker"', page)
        self.assertIn('id="company-picker-search"', page)
        self.assertIn('id="select-all-companies"', page)
        self.assertIn('id="clear-all-companies"', page)
        self.assertIn('data-vendor="华为"', page)
        self.assertIn('data-vendor-choice="DeepSeek"', page)
        self.assertIn("technology-product-vendor-selection-v1", page)
        self.assertIn("selectedVendors=new Set()", page)
        self.assertIn("vendorMatches&&regionMatches", page)
        self.assertIn("今日热度焦点", page)
        self.assertIn('class="hottest-vendor"', page)
        self.assertIn('class="hottest-product"', page)
        self.assertIn("六维 HOT 01", page)
        self.assertEqual(page.count('class="hot-cell-badge"'), 6)
        for product_type in (
            "desktop", "mobile", "platform", "governance", "data", "coding"
        ):
            self.assertIn(f'data-hot-type="{product_type}"', page)


class ActiveSearchTests(unittest.TestCase):
    def test_product_search_matches_matrix_categories_and_names(self):
        governance = product_catalog_search("Agent 纳管平台")
        agent_sphere = product_catalog_search("AgentSphere")

        governance_titles = [item["title"] for item in governance]
        self.assertIn("ADP Agent Portal", governance_titles)
        self.assertNotIn("腾讯云 ADP", governance_titles)
        self.assertEqual(agent_sphere[0]["title"], "AgentSphere")
        self.assertEqual(agent_sphere[0]["type"], "产品")

    @patch("technology_explorer.cached_report_search", return_value=[])
    @patch("technology_explorer.arxiv_topic_search", return_value=[])
    @patch("technology_explorer.hacker_news_search", return_value=[])
    @patch("technology_explorer.github_repository_search", return_value=[
        {
            "title": "example/agent-runtime",
            "url": "https://github.com/example/agent-runtime",
            "source": "GitHub",
            "summary": "Agent runtime",
            "publishedAt": "2026-09-08T00:00:00+00:00",
            "score": 80,
            "type": "开源项目",
            "evidence": "100 Stars",
        },
        {
            "title": "example/unrelated",
            "url": "https://github.com/example/unrelated",
            "source": "GitHub",
            "summary": "Unrelated repository",
            "publishedAt": "2026-09-08T00:00:00+00:00",
            "score": 90,
            "type": "开源项目",
            "evidence": "200 Stars",
        },
    ])
    @patch("technology_explorer.google_news_search", return_value=[])
    def test_active_search_combines_live_sources(
        self, _google, _github, _hacker_news, _arxiv, _cached
    ):
        result = active_search("agent runtime", "technology", 10)

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["results"][0]["source"], "GitHub")
        self.assertEqual(result["sourceCount"], 5)
        self.assertEqual(result["timeRange"], "30d")
        self.assertEqual(result["timeLabel"], "近一个月")

    def test_search_time_range_filters_old_dynamic_items_but_keeps_catalog(self):
        old_dynamic = {
            "source": "Hacker News",
            "publishedAt": "2020-01-01T00:00:00+00:00",
        }
        catalog = {"source": "产品矩阵", "publishedAt": ""}

        self.assertFalse(search_item_in_time_range(old_dynamic, "30d"))
        self.assertTrue(search_item_in_time_range(old_dynamic, "all"))
        self.assertTrue(search_item_in_time_range(catalog, "7d"))
        self.assertIn("when:7d", search_query_with_time("Agent", "7d"))

    def test_report_contains_active_search_workspace(self):
        report = {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "items": [],
            "signals": [],
            "news_boards": [],
            "source_status": [],
            "quality_stats": {},
        }

        page = ReportStore().render_html(report)

        self.assertIn('id="search-view"', page)
        self.assertIn('data-workspace-mode="search"', page)
        self.assertIn('id="active-search-form"', page)
        self.assertIn("/v1/search?q=", page)
        self.assertIn('data-search-range="30d"', page)
        self.assertIn("range=${activeSearchTimeRange}", page)
        self.assertIn("technology-workspace-mode-v1", page)


if __name__ == "__main__":
    unittest.main()
