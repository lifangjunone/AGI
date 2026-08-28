from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "service"))

import autonomous_factory as factory


def demand(
    external_id: str,
    author: str,
    title: str = "Looking for an AI agent monitoring tool",
    labels: list[str] | None = None,
) -> factory.Demand:
    return factory.Demand(
        source="github",
        external_id=external_id,
        title=title,
        body="We need software for workflow checkpoint monitoring and have a paid bounty.",
        url=f"https://github.com/example/repo/issues/{external_id}",
        author=author,
        contact_url=f"https://github.com/example/repo/issues/{external_id}",
        published_at=factory.now_iso(),
        labels=labels or ["help wanted", "bounty"],
        engagement=4,
        explicit_request=True,
        metadata={
            "comments_url": f"https://api.github.com/repos/example/repo/issues/{external_id}/comments",
            "repository_url": f"https://api.github.com/repos/{author}/repo",
        },
    )


class AutonomousFactoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = factory.Store(Path(self.temp.name) / "factory.db")
        self.engine = factory.Factory(self.store)

    def tearDown(self):
        self.temp.cleanup()

    def add(self, row: factory.Demand) -> int:
        score, category = factory.score_demand(row)
        self.store.upsert_demand(row, score, category)
        return score

    def test_paid_explicit_demand_scores_above_generic_issue(self):
        paid = demand("1", "buyer")
        generic = demand("2", "maintainer", labels=["help wanted"])
        generic.body = "Please improve this internal workflow."

        paid_score, _ = factory.score_demand(paid)
        generic_score, _ = factory.score_demand(generic)

        self.assertGreater(paid_score, generic_score)
        self.assertGreaterEqual(paid_score, 60)

    def test_single_request_does_not_trigger_public_product(self):
        self.add(demand("1", "buyer"))
        self.assertIsNone(self.engine.build(force=True))
        self.assertEqual(self.store.dashboard()["counts"]["products"], 0)

    def test_three_independent_users_trigger_one_product(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index),
                author,
                title="Looking for an open source GitHub integration deployment tool",
            ))

        product = self.engine.build(force=True)

        self.assertIsNotNone(product)
        self.assertEqual(product["tool"], "integration")
        self.assertIsNone(self.engine.build(force=True))
        self.assertEqual(self.store.dashboard()["counts"]["products"], 1)

    def test_outreach_requires_paid_github_signal(self):
        self.add(demand("1", "buyer"))
        unpaid = demand("2", "maintainer", labels=["help wanted"])
        unpaid.body = "Looking for help with workflow automation."
        self.add(unpaid)

        queued = self.engine.prepare_outreach()
        dashboard = self.store.dashboard()

        self.assertEqual(queued, 1)
        self.assertEqual(dashboard["counts"]["outreach"], 1)
        self.assertIn("透明标识", dashboard["outreach"][0]["message"])

    def test_lead_rate_limit_and_redacted_ip(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index),
                author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)

        for index in range(3):
            self.store.add_lead(
                product["id"], "Customer", f"user{index}@example.com", "Need this", "127.0.0.1"
            )
        with self.assertRaisesRegex(ValueError, "频繁"):
            self.store.add_lead(
                product["id"], "Customer", "four@example.com", "Need this", "127.0.0.1"
            )
        with self.store.connect() as db:
            stored = db.execute("SELECT source_ip_hash FROM leads LIMIT 1").fetchone()[0]
        self.assertNotEqual(stored, "127.0.0.1")
        self.assertEqual(len(stored), 64)

    def test_outreach_dispatch_is_disabled_by_default(self):
        old = os.environ.pop("ALLOW_AUTONOMOUS_OUTREACH", None)
        try:
            self.assertEqual(self.engine.dispatch_outreach(), 0)
        finally:
            if old is not None:
                os.environ["ALLOW_AUTONOMOUS_OUTREACH"] = old

    def test_rss_remains_machine_readable_and_has_browser_view(self):
        feed = factory.build_feed([
            {
                "name": "知识库命中率体检",
                "slug": "knowledge-check",
                "promise": "检查知识库为什么答不准",
            }
        ], [{
            "repository": "acme/tool",
            "token": "acme-tool-12345678",
            "verdict": "建议先做隔离试点",
            "score": 65,
            "scenario_label": "面向客户的生产系统",
            "created_at": factory.now_iso(),
        }], [{
            "left_repository": "acme/a",
            "right_repository": "acme/b",
            "token": "acme-a-vs-acme-b-12345678",
            "scenario_label": "可执行操作的 AI Agent",
            "recommendation": "两者都未达到门槛",
            "created_at": factory.now_iso(),
        }]).decode()
        stylesheet = factory.rss_stylesheet().decode()

        self.assertIn('<?xml-stylesheet type="text/xsl" href="/rss.xsl"?>', feed)
        self.assertIn('<rss version="2.0" xmlns:atom=', feed)
        self.assertRegex(feed, r"<pubDate>[A-Z][a-z]{2}, ")
        self.assertIn("<item>", feed)
        self.assertIn("acme/tool 用于面向客户的生产系统的采用报告", feed)
        self.assertIn(
            "acme/a vs acme/b：可执行操作的 AI Agent的采用对比",
            feed,
        )
        self.assertIn('rel="hub"', feed)
        self.assertIn("订阅产品更新", stylesheet)
        self.assertIn('select="rss/channel/item"', stylesheet)
        self.assertIn('href="/updates">订阅</a>', factory.page_shell("test", "").decode())

    def test_aggregated_bounty_alert_is_rejected(self):
        row = demand("alert", "scanner", title="Bounty Alert: 8 New Opportunities Found")
        row.metadata["repository_url"] = "https://api.github.com/repos/example/BountyScout"

        score, _category = factory.score_demand(row)

        self.assertEqual(score, 0)
        self.assertTrue(factory.is_low_quality_demand(row))

    def test_catalog_maintenance_retires_templates_and_polluted_outreach(self):
        alert = demand("alert", "scanner", title="Bounty Alert: 8 New Opportunities Found")
        alert_id = self.store.upsert_demand(alert, 90, "agent-reliability")
        with self.store.connect() as db:
            demand_row = db.execute("SELECT * FROM demands WHERE id=?", (alert_id,)).fetchone()
        product = self.store.create_product(
            demand_row, factory.PRODUCT_TEMPLATES["agent-reliability"]
        )
        self.store.queue_outreach(demand_row, product, "test")

        self.store.maintain_catalog()

        with self.store.connect() as db:
            state = db.execute("SELECT state, score FROM demands WHERE id=?", (alert_id,)).fetchone()
            product_status = db.execute("SELECT status FROM products WHERE id=?", (product["id"],)).fetchone()[0]
            outreach_status = db.execute("SELECT state FROM outreach WHERE demand_id=?", (alert_id,)).fetchone()[0]
        self.assertEqual(tuple(state), ("low_quality", 0))
        self.assertEqual(product_status, "retired")
        self.assertEqual(outreach_status, "rejected")

    def test_github_audit_returns_evidence_based_score(self):
        repo = {
            "html_url": "https://github.com/acme/tool",
            "description": "A production tool",
            "pushed_at": factory.now_iso(),
            "license": {"spdx_id": "Apache-2.0"},
            "stargazers_count": 120,
            "forks_count": 20,
            "open_issues_count": 8,
            "language": "Python",
            "archived": False,
        }
        root = [
            {"name": "README.md"}, {"name": "pyproject.toml"},
            {"name": "Dockerfile"}, {"name": ".github"}, {"name": "tests"},
        ]

        def fake_request(url, _headers=None, timeout=20):
            if "api.securityscorecards.dev" in url:
                return {
                    "score": 8.5,
                    "date": "2026-08-10",
                    "scorecard": {"version": "v5"},
                    "checks": [
                        {
                            "name": "Token-Permissions",
                            "score": 2,
                            "reason": "workflow tokens have excessive permissions",
                            "documentation": {"url": "https://example.com/check"},
                        }
                    ],
                }
            if url.endswith("/contents"):
                return [{"name": "README.md"}]
            if url.endswith("/releases/latest"):
                return {"tag_name": "v1.0.0"}
            if url.endswith("/community/profile"):
                return {"files": {"readme": {"url": "x"}}}
            if "/git/trees/" in url:
                return {"tree": [
                    {"path": "packages/core/pyproject.toml"},
                    {"path": "packages/core/tests/test_api.py"},
                    {"path": ".github/workflows/test.yml"},
                    {"path": "deploy/Dockerfile"},
                ]}
            return repo

        with patch.object(factory, "request_json", side_effect=fake_request):
            report = factory.audit_github_repository(
                "https://github.com/acme/tool",
                {
                    "scenario": "agent",
                    "sensitivity": "sensitive",
                    "team_size": "solo",
                },
            )

        self.assertEqual(report["repository"], "acme/tool")
        self.assertGreaterEqual(report["score"], 75)
        self.assertEqual(report["license"], "Apache-2.0")
        self.assertEqual(len(report["checks"]), 8)
        self.assertEqual(report["openssf"]["score"], 8.5)
        self.assertEqual(report["security_failures"][0]["priority"], "P0")
        self.assertIn("GitHub Actions token", report["remediation_plan"][0]["task"])
        self.assertTrue(any(
            "单人可执行" in item["task"]
            for item in report["remediation_plan"]
        ))

    def test_github_audit_rejects_non_github_url(self):
        with self.assertRaisesRegex(ValueError, "GitHub"):
            factory.parse_github_repository("http://127.0.0.1/admin")

    def test_adoption_gate_changes_with_business_context(self):
        internal = factory.normalize_adoption_context({
            "scenario": "internal",
            "sensitivity": "public",
            "team_size": "small",
        })
        sensitive_agent = factory.normalize_adoption_context({
            "scenario": "agent",
            "sensitivity": "sensitive",
            "team_size": "solo",
        })

        internal_threshold, internal_verdict, internal_gates = (
            factory.contextual_adoption_gate(72, internal)
        )
        agent_threshold, agent_verdict, agent_gates = (
            factory.contextual_adoption_gate(72, sensitive_agent)
        )

        self.assertEqual(internal_threshold, 65)
        self.assertIn("达到", internal_verdict)
        self.assertEqual(agent_threshold, 90)
        self.assertIn("还差 18 分", agent_verdict)
        self.assertGreater(len(agent_gates), len(internal_gates))
        self.assertTrue(any("Agent" in item["task"] for item in agent_gates))
        self.assertTrue(any("敏感字段" in item["gate"] for item in agent_gates))

    def test_comparison_uses_one_context_and_does_not_force_winner(self):
        context = factory.normalize_adoption_context({
            "scenario": "agent",
            "sensitivity": "sensitive",
            "team_size": "solo",
        })

        def report(repository: str, score: int) -> dict:
            return {
                "repository": repository,
                "url": f"https://github.com/{repository}",
                "score": score,
                "verdict": "测试结论",
                "license": "MIT",
                "inactive_days": 2,
                "risks": ["风险一"],
                "pillars": [
                    {"label": "供应链安全", "score": score // 3, "max": 40},
                    {"label": "工程准备度", "score": 25, "max": 30},
                ],
                "adoption_context": context,
                "adoption_threshold": 90,
            }

        one_passes = factory.compare_adoption_reports(
            report("acme/a", 92),
            report("acme/b", 76),
        )
        neither_passes = factory.compare_adoption_reports(
            report("acme/a", 84),
            report("acme/b", 82),
        )

        self.assertEqual(one_passes["winner"], "left")
        self.assertIn("达到当前场景", one_passes["recommendation"])
        self.assertEqual(neither_passes["winner"], "none")
        self.assertIn("都未达到", neither_passes["recommendation"])

        mismatched = report("acme/c", 95)
        mismatched["adoption_context"] = factory.normalize_adoption_context({
            "scenario": "internal",
            "sensitivity": "public",
            "team_size": "small",
        })
        with self.assertRaisesRegex(ValueError, "相同业务场景"):
            factory.compare_adoption_reports(report("acme/a", 92), mismatched)

    def test_public_comparison_is_persisted_and_rendered_for_search(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index), author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        context = factory.normalize_adoption_context({
            "scenario": "customer",
            "sensitivity": "internal",
            "team_size": "small",
        })
        left = {
            "repository": "acme/a",
            "url": "https://github.com/acme/a",
            "score": 80,
            "verdict": "达到门槛",
            "license": "MIT",
            "inactive_days": 3,
            "risks": [],
            "pillars": [{"label": "供应链安全", "score": 30, "max": 40}],
            "adoption_context": context,
            "adoption_threshold": 78,
        }
        right = {
            **left,
            "repository": "acme/b",
            "url": "https://github.com/acme/b",
            "score": 70,
            "verdict": "未达到门槛",
            "pillars": [{"label": "供应链安全", "score": 22, "max": 40}],
        }
        comparison = factory.compare_adoption_reports(left, right)

        token = self.store.save_comparison_report(
            product["id"],
            comparison,
            "left-report-token",
            "right-report-token",
            source="daily_sample",
            is_public=True,
        )
        row = self.store.comparison_report(token)
        public = self.store.public_comparison_reports()
        page = factory.render_comparison_report(
            product,
            comparison,
            token,
        ).decode()

        self.assertIsNotNone(row)
        self.assertEqual(public[0]["left_repository"], "acme/a")
        self.assertIn("acme/a vs acme/b", page)
        self.assertIn('rel="canonical"', page)
        self.assertIn(f"/c/{token}", page)
        self.assertIn('"@type": "TechArticle"', page)

    def test_audit_report_can_be_saved_shared_and_download_tracked(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index),
                author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        report = {
            "repository": "acme/tool",
            "url": "https://github.com/acme/tool",
            "score": 80,
            "verdict": "可进入业务样例验证",
            "evidence_time": factory.now_iso(),
        }

        token = self.store.save_audit_report(product["id"], report, source="test")
        self.store.touch_audit_report(token, "report_viewed")
        saved = self.store.audit_report(token)

        self.assertEqual(saved["repository"], "acme/tool")
        self.assertEqual((saved["views"], saved["downloads"]), (1, 0))
        self.assertIn(f"/r/{token}", factory.render_audit_report(
            product,
            {
                **report,
                "description": "",
                "stars": 1,
                "forks": 0,
                "inactive_days": 1,
                "license": "MIT",
                "language": "Python",
                "checks": [],
                "risks": [],
            },
            token,
        ).decode())

    def test_payment_unlock_is_idempotent_and_counts_real_revenue_once(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index), author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        report = {
            "repository": "acme/paid",
            "url": "https://github.com/acme/paid",
            "score": 70,
            "verdict": "建议先做隔离试点",
            "evidence_time": factory.now_iso(),
        }
        token = self.store.save_audit_report(product["id"], report)

        self.assertTrue(self.store.unlock_audit_report(token, "pi_123", 29900))
        self.assertTrue(self.store.unlock_audit_report(token, "pi_123", 29900))

        with self.store.connect() as db:
            saved = db.execute(
                "SELECT pro_unlocked, payment_reference FROM audit_reports WHERE token=?",
                (token,),
            ).fetchone()
            revenue = db.execute(
                "SELECT revenue_cents FROM products WHERE id=?", (product["id"],)
            ).fetchone()[0]
        self.assertEqual(tuple(saved), (1, "pi_123"))
        self.assertEqual(revenue, 29900)
        events = [
            row for row in self.store.dashboard()["funnel"]
            if row["kind"] == "payment_confirmed"
        ]
        self.assertEqual(events[0]["count"], 1)

    def test_public_showcase_exposes_pro_format_without_claiming_revenue(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index), author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        report = {
            "repository": "acme/showcase",
            "url": "https://github.com/acme/showcase",
            "score": 72,
            "verdict": "建议先做隔离试点",
            "evidence_time": factory.now_iso(),
        }

        token = self.store.save_audit_report(
            product["id"],
            report,
            source="daily_sample",
            is_public=True,
            is_showcase=True,
        )
        saved = self.store.audit_report(token)
        showcase = self.store.professional_showcase()

        self.assertEqual(saved["pro_unlocked"], 0)
        self.assertIsNone(saved["paid_at"])
        self.assertIsNone(saved["payment_reference"])
        self.assertEqual(showcase["token"], token)
        with self.store.connect() as db:
            revenue = db.execute(
                "SELECT revenue_cents FROM products WHERE id=?",
                (product["id"],),
            ).fetchone()[0]
        self.assertEqual(revenue, 0)

    def test_paid_session_requires_exact_amount_and_currency(self):
        valid = {
            "payment_status": "paid",
            "amount_total": factory.REPORT_PRICE_CENTS,
            "currency": factory.REPORT_CURRENCY,
            "metadata": {"report_token": "report-12345678"},
        }

        self.assertEqual(
            factory.paid_report_from_session(valid), "report-12345678"
        )
        self.assertEqual(
            factory.paid_report_from_session({
                **valid, "amount_total": factory.REPORT_PRICE_CENTS - 1
            }),
            "",
        )
        self.assertEqual(
            factory.paid_report_from_session({**valid, "currency": "usd"}),
            "",
        )

    def test_lemonsqueezy_checkout_and_paid_order_are_strictly_matched(self):
        payload = json.dumps({"meta": {"event_name": "order_created"}}).encode()
        signature = hmac.new(
            b"lemon-secret",
            payload,
            hashlib.sha256,
        ).hexdigest()
        valid_order = {
            "meta": {
                "event_name": "order_created",
                "custom_data": {"report_token": "report-12345678"},
            },
            "data": {
                "id": "order_1",
                "attributes": {
                    "status": "paid",
                    "test_mode": False,
                    "identifier": "order-reference",
                    "subtotal_usd": factory.REPORT_PRICE_USD_CENTS,
                    "discount_total_usd": 0,
                    "refunded": False,
                    "first_order_item": {"variant_id": 42},
                },
            },
        }
        with patch.dict(factory.os.environ, {
            "LEMONSQUEEZY_CHECKOUT_URL":
                "https://example.lemonsqueezy.com/checkout/buy/variant",
            "LEMONSQUEEZY_VARIANT_ID": "42",
        }):
            checkout = factory.create_lemonsqueezy_checkout(
                "report-12345678"
            )
            matched = factory.paid_report_from_lemonsqueezy_order(
                valid_order
            )
            wrong_variant = factory.paid_report_from_lemonsqueezy_order({
                **valid_order,
                "data": {
                    **valid_order["data"],
                    "attributes": {
                        **valid_order["data"]["attributes"],
                        "first_order_item": {"variant_id": 7},
                    },
                },
            })
            test_order = factory.paid_report_from_lemonsqueezy_order({
                **valid_order,
                "data": {
                    **valid_order["data"],
                    "attributes": {
                        **valid_order["data"]["attributes"],
                        "test_mode": True,
                    },
                },
            })
            discounted_order = factory.paid_report_from_lemonsqueezy_order({
                **valid_order,
                "data": {
                    **valid_order["data"],
                    "attributes": {
                        **valid_order["data"]["attributes"],
                        "discount_total_usd": 1,
                    },
                },
            })

        query = urllib.parse.parse_qs(urllib.parse.urlparse(checkout).query)
        self.assertEqual(
            query["checkout[custom][report_token]"],
            ["report-12345678"],
        )
        self.assertEqual(
            factory.verify_lemonsqueezy_webhook(
                payload,
                signature,
                "lemon-secret",
            )["meta"]["event_name"],
            "order_created",
        )
        with self.assertRaisesRegex(ValueError, "签名校验失败"):
            factory.verify_lemonsqueezy_webhook(
                payload,
                "bad",
                "lemon-secret",
            )
        self.assertEqual(
            matched,
            (
                "report-12345678",
                "order-reference",
                factory.REPORT_PRICE_USD_CENTS,
            ),
        )
        self.assertEqual(wrong_variant, ("", "", 0))
        self.assertEqual(test_order, ("", "", 0))
        self.assertEqual(discounted_order, ("", "", 0))
        self.assertEqual(
            factory.refunded_report_from_lemonsqueezy_order({
                "meta": {
                    "event_name": "order_refunded",
                    "custom_data": {
                        "report_token": "report-12345678",
                    },
                },
                "data": {
                    "attributes": {
                        "identifier": "order-reference",
                        "test_mode": False,
                        "refunded_amount_usd": 1200,
                    },
                },
            }),
            ("report-12345678", "order-reference", 1200),
        )

    def test_usd_payment_is_idempotent_and_separate_from_cny_revenue(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index), author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        token = self.store.save_audit_report(product["id"], {
            "repository": "acme/global-paid",
            "url": "https://github.com/acme/global-paid",
            "score": 70,
            "verdict": "建议先做隔离试点",
            "evidence_time": factory.now_iso(),
        })

        for _ in range(2):
            self.assertTrue(self.store.unlock_audit_report(
                token,
                "lemon-order-1",
                3900,
                currency="usd",
                payment_source="lemonsqueezy",
            ))
        for _ in range(2):
            self.assertTrue(self.store.record_audit_refund(
                token,
                "lemon-order-1",
                1200,
            ))

        with self.store.connect() as db:
            saved = db.execute(
                """
                SELECT paid_currency, paid_amount_cents,
                       refunded_amount_cents
                FROM audit_reports WHERE token=?
                """,
                (token,),
            ).fetchone()
            revenue = db.execute(
                """
                SELECT revenue_cents, revenue_usd_cents
                FROM products WHERE id=?
                """,
                (product["id"],),
            ).fetchone()
        self.assertEqual(tuple(saved), ("usd", 3900, 1200))
        self.assertEqual(tuple(revenue), (0, 2700))
        self.assertEqual(
            self.store.dashboard()["experiment"]["payments"],
            1,
        )

        self.assertTrue(self.store.record_audit_refund(
            token,
            "lemon-order-1",
            3900,
        ))
        with self.store.connect() as db:
            revenue_after_full_refund = db.execute(
                "SELECT revenue_usd_cents FROM products WHERE id=?",
                (product["id"],),
            ).fetchone()[0]
        self.assertEqual(revenue_after_full_refund, 0)
        self.assertEqual(
            self.store.dashboard()["experiment"]["payments"],
            0,
        )

    def test_professional_report_contains_actionable_download(self):
        report = {
            "repository": "acme/pro",
            "url": "https://github.com/acme/pro",
            "description": "Production tool",
            "score": 68,
            "verdict": "建议先做隔离试点",
            "stars": 100,
            "forks": 10,
            "inactive_days": 20,
            "license": "MIT",
            "language": "Python",
            "checks": [],
            "risks": ["签名发布缺失"],
            "pillars": [
                {"label": "供应链安全", "score": 20, "max": 40},
                {"label": "工程准备度", "score": 28, "max": 30},
            ],
            "security_failures": [{
                "priority": "P0",
                "name": "Signed-Releases",
                "score": 0,
                "reason": "No signed releases",
                "action": "为发布产物增加签名",
            }],
            "remediation_plan": [{
                "day": 1,
                "priority": "P0",
                "task": "为发布产物增加签名",
                "gate": "签名证据可验证",
            }],
            "confidence": "高",
            "evidence_sources": ["GitHub REST API", "OpenSSF Scorecard"],
            "evidence_time": factory.now_iso(),
        }
        product = {
            "slug": "integration-product",
        }

        free = factory.render_audit_report(
            product, report, "acme-pro-token", professional=False
        ).decode()
        pro = factory.render_audit_report(
            product, report, "acme-pro-token", professional=True
        ).decode()
        markdown = factory.build_professional_markdown(report).decode()

        self.assertNotIn("OpenSSF 供应链失败项</h2>", free)
        self.assertNotIn(".md\">下载决策报告", free)
        self.assertIn("OpenSSF 供应链失败项</h2>", pro)
        self.assertIn(".md\">下载决策报告", pro)
        self.assertIn("7 天采用门禁计划", markdown)
        self.assertIn("Signed-Releases", markdown)

    def test_public_api_badge_and_history_exclude_professional_fields(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index), author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        context = factory.normalize_adoption_context({
            "scenario": "agent",
            "sensitivity": "sensitive",
            "team_size": "solo",
        })
        report = {
            "repository": "acme/public",
            "url": "https://github.com/acme/public",
            "description": "Public test",
            "score": 72,
            "verdict": "未达到当前场景门槛，还差 18 分",
            "stars": 10,
            "forks": 1,
            "inactive_days": 4,
            "license": "MIT",
            "language": "Python",
            "checks": [],
            "risks": ["公开风险"],
            "pillars": [
                {"label": "供应链安全", "score": 25, "max": 40},
            ],
            "security_failures": [{
                "priority": "P0",
                "name": "Signed-Releases",
                "score": 0,
                "reason": "professional evidence",
                "action": "professional action",
            }],
            "remediation_plan": [{
                "day": 1,
                "priority": "P0",
                "task": "professional plan",
                "gate": "professional gate",
            }],
            "adoption_context": context,
            "adoption_threshold": 90,
            "evidence_sources": ["GitHub REST API", "OpenSSF Scorecard"],
            "evidence_time": factory.now_iso(),
        }
        token = self.store.save_audit_report(
            product["id"],
            report,
            source="daily_sample",
            is_public=True,
        )

        payload = factory.public_report_payload(report, token)
        badge = factory.render_adoption_badge(report).decode()
        history = self.store.public_repository_history("acme/public")
        history_page = factory.render_repository_history(
            "acme/public",
            history,
        ).decode()
        page = factory.render_audit_report(
            product,
            report,
            token,
            public_artifact=True,
        ).decode()

        self.assertEqual(payload["score"], 72)
        self.assertEqual(payload["adoption_threshold"], 90)
        self.assertNotIn("security_failures", payload)
        self.assertNotIn("remediation_plan", payload)
        self.assertNotIn("professional evidence", json.dumps(payload))
        self.assertIn("72/90 blocked", badge)
        self.assertEqual(history[0]["token"], token)
        self.assertIn("acme/public 采用证据历史", history_page)
        self.assertIn("/badge/github/acme/public.svg?", history_page)
        self.assertIn("/badge/github/acme/public.svg?", page)
        self.assertIn("utm_source=embedded_badge", page)
        self.assertIn(f"/api/v1/reports/{token}", page)
        self.assertIn("/history/acme/public", page)

        latest = self.store.latest_public_repository_report(
            "acme/public",
            context,
        )
        self.assertEqual(latest["token"], token)

    def test_qualified_views_are_anonymous_unique_and_exclude_automation(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index), author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)

        first = self.store.record_qualified_view(
            product["id"], "anonymous-hash", "search"
        )
        duplicate = self.store.record_qualified_view(
            product["id"], "anonymous-hash", "search"
        )
        dashboard = self.store.dashboard()

        self.assertTrue(first)
        self.assertFalse(duplicate)
        self.assertEqual(dashboard["experiment"]["qualified_views"], 1)
        self.assertTrue(factory.is_automated_user_agent("Googlebot/2.1"))
        self.assertTrue(factory.is_automated_user_agent("curl/8.0"))
        self.assertFalse(factory.is_automated_user_agent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
        ))
        self.assertTrue(factory.is_test_attribution("production_qa"))

    def test_qualified_view_requires_explicit_user_interaction_beacon(self):
        beacon = factory.qualified_view_beacon(
            {"slug": "integration-product"},
            {
                "utm_source": "search",
                "utm_medium": "organic",
                "utm_campaign": "agent-adoption",
            },
        )

        self.assertIn("/api/qualified-view", beacon)
        self.assertIn("pointerdown", beacon)
        self.assertIn("touchstart", beacon)
        self.assertIn("keydown", beacon)
        self.assertNotIn("setTimeout", beacon)
        self.assertIn('"utm_source": "search"', beacon)

    def test_commercial_experiment_enforces_stop_conditions(self):
        collecting = factory.commercial_experiment_status({
            "qualified_views": 20, "qualified_audits": 2,
            "purchase_intents": 0, "payments": 0,
        })
        reposition = factory.commercial_experiment_status({
            "qualified_views": 300, "qualified_audits": 10,
            "purchase_intents": 0, "payments": 0,
        })
        stop_offer = factory.commercial_experiment_status({
            "qualified_views": 100, "qualified_audits": 30,
            "purchase_intents": 1, "payments": 0,
        })
        validated = factory.commercial_experiment_status({
            "qualified_views": 10, "qualified_audits": 1,
            "purchase_intents": 1, "payments": 1,
        })

        self.assertEqual(collecting["decision"], "collecting")
        self.assertEqual(reposition["decision"], "reposition")
        self.assertEqual(stop_offer["decision"], "stop_offer")
        self.assertEqual(validated["decision"], "validated")

    def test_report_page_has_canonical_social_and_valid_json_ld(self):
        report = {
            "repository": "acme/schema",
            "url": "https://github.com/acme/schema",
            "description": "Schema test",
            "score": 75,
            "verdict": "可进入业务样例验证",
            "stars": 20,
            "forks": 2,
            "inactive_days": 5,
            "license": "MIT",
            "language": "Python",
            "checks": [],
            "risks": [],
            "pillars": [],
            "security_failures": [],
            "remediation_plan": [],
            "confidence": "高",
            "evidence_sources": ["GitHub REST API"],
            "evidence_time": factory.now_iso(),
        }
        document = factory.render_audit_report(
            {"slug": "integration-product"},
            report,
            "acme-schema-12345678",
        ).decode()
        schema_text = document.split(
            '<script type="application/ld+json">', 1
        )[1].split("</script>", 1)[0]

        schema = json.loads(schema_text)
        self.assertEqual(schema["@type"], "TechArticle")
        self.assertEqual(schema["about"][-1], "acme/schema")
        self.assertIn(
            'rel="canonical" href="https://audit.lifeyoume.icu/r/acme-schema-12345678"',
            document,
        )
        self.assertIn('property="og:title"', document)

    def test_stripe_webhook_signature_must_be_valid_and_fresh(self):
        payload = json.dumps({"type": "checkout.session.completed"}).encode()
        timestamp = int(factory.time.time())
        signature = hmac.new(
            b"whsec_test",
            f"{timestamp}.".encode() + payload,
            hashlib.sha256,
        ).hexdigest()

        event = factory.verify_stripe_webhook(
            payload, f"t={timestamp},v1={signature}", "whsec_test"
        )

        self.assertEqual(event["type"], "checkout.session.completed")
        with self.assertRaisesRegex(ValueError, "校验失败"):
            factory.verify_stripe_webhook(
                payload, f"t={timestamp},v1=bad", "whsec_test"
            )

    def test_daily_sample_publishes_only_once_per_day(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index),
                author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        self.engine.build(force=True)
        report = {
            "repository": "acme/sample",
            "url": "https://github.com/acme/sample",
            "description": "",
            "score": 70,
            "verdict": "建议先做隔离试点",
            "stars": 10,
            "forks": 1,
            "open_issues": 2,
            "inactive_days": 3,
            "license": "MIT",
            "language": "Python",
            "checks": [],
            "risks": [],
            "adoption_context": factory.normalize_adoption_context({
                "scenario": "agent",
                "sensitivity": "sensitive",
                "team_size": "solo",
            }),
            "adoption_threshold": 90,
            "evidence_time": factory.now_iso(),
        }
        with (
            patch.object(
                factory,
                "audit_github_repository",
                return_value=report,
            ) as audit_mock,
            patch.object(factory, "submit_indexnow", return_value=True),
            patch.object(factory, "notify_websub", return_value=True),
        ):
            first = self.engine.publish_daily_sample()
            second = self.engine.publish_daily_sample()

        self.assertTrue(first)
        self.assertIsNone(second)
        self.assertEqual(len(self.store.public_audit_reports()), 1)
        audit_call = audit_mock.call_args
        self.assertIn(
            audit_call.args[1],
            factory.PUBLIC_SAMPLE_CONTEXTS,
        )
        self.assertEqual(
            self.store.professional_showcase()["token"],
            first,
        )

    def test_daily_sample_creates_public_comparison_for_matching_context(self):
        for index, author in enumerate(("alice", "bob", "carol"), 1):
            self.add(demand(
                str(index),
                author,
                title="Looking for an open source GitHub integration deployment tool",
            ))
        product = self.engine.build(force=True)
        context = factory.PUBLIC_SAMPLE_CONTEXTS[
            factory.dt.datetime.now(
                factory.dt.timezone.utc
            ).date().toordinal() % len(factory.PUBLIC_SAMPLE_CONTEXTS)
        ]
        normalized_context = factory.normalize_adoption_context(context)

        def sample(repository: str, score: int) -> dict:
            return {
                "repository": repository,
                "url": f"https://github.com/{repository}",
                "description": "",
                "score": score,
                "verdict": "测试采用结论",
                "stars": 10,
                "forks": 1,
                "open_issues": 2,
                "inactive_days": 3,
                "license": "MIT",
                "language": "Python",
                "checks": [],
                "risks": [],
                "pillars": [
                    {"label": "供应链安全", "score": 30, "max": 40},
                ],
                "adoption_context": normalized_context,
                "adoption_threshold": 65,
                "evidence_time": factory.now_iso(),
            }

        previous = sample("acme/previous", 75)
        previous_token = self.store.save_audit_report(
            product["id"],
            previous,
            source="daily_sample",
            is_public=True,
        )
        yesterday = (
            factory.dt.datetime.now(factory.dt.timezone.utc)
            - factory.dt.timedelta(days=1)
        ).isoformat()
        with self.store.connect() as db:
            db.execute(
                "UPDATE audit_reports SET created_at=? WHERE token=?",
                (yesterday, previous_token),
            )

        with (
            patch.object(
                factory,
                "audit_github_repository",
                return_value=sample("acme/today", 82),
            ),
            patch.object(factory, "submit_indexnow", return_value=True) as indexnow,
            patch.object(factory, "notify_websub", return_value=True),
        ):
            token = self.engine.publish_daily_sample()

        comparisons = self.store.public_comparison_reports()
        submitted_urls = indexnow.call_args.args[0]
        self.assertTrue(token)
        self.assertEqual(len(comparisons), 1)
        self.assertIn("/c/", " ".join(submitted_urls))
        self.assertEqual(comparisons[0]["scenario_label"], normalized_context["scenario_label"])


if __name__ == "__main__":
    unittest.main()
