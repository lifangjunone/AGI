import json
import tempfile
import unittest
from pathlib import Path

from service import poc_pay_skill as pay_skill


SAMPLE_REQUIREMENTS = """
项目需在客户内网私有化部署知识库问答系统，不得访问公网。
系统应支持 100 个并发用户，问答响应时间 P95 不高于 3 秒。
供应商需要提供 100 道客户测试题的准确率报告和原始引用证据。
POC 现场必须演示权限隔离、审计日志和服务异常后的任务恢复。
"""


class PocPaySkillTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        pay_skill.configure_order_repository(
            pay_skill.SQLiteOrderRepository(Path(self.temp.name) / "orders.db")
        )
        self.client = pay_skill.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def test_rejects_too_short_input_before_payment(self):
        response = self.client.post(
            pay_skill.RESOURCE_CONFIG["path"],
            json={"requirements_text": "太短"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "INVALID_REQUEST")

    def test_unpaid_request_returns_signed_402_and_persists_order(self):
        response = self.client.post(
            pay_skill.RESOURCE_CONFIG["path"],
            json={
                "requirements_text": SAMPLE_REQUIREMENTS,
                "project_type": "知识库问答 POC",
            },
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 402)
        self.assertEqual(body["amount"], pay_skill.RESOURCE_CONFIG["amount"])
        self.assertTrue(response.headers["Payment-Needed"])
        order = pay_skill.require_order_repository().find_by_out_trade_no(
            body["out_trade_no"]
        )
        self.assertEqual(order["fulfill_status"], "UNFULFILLED")
        self.assertIn("知识库问答 POC", order["request_json"])

    def test_paid_resource_contains_six_traceable_deliverables(self):
        resource = json.loads(pay_skill.generate_service_resource({
            "requirements_text": SAMPLE_REQUIREMENTS,
            "project_type": "知识库问答 POC",
            "project_context": "三家厂商竞标",
        }))
        self.assertEqual(resource["service_type"], "AI_POC_ACCEPTANCE_AUDIT")
        self.assertEqual(len(resource["required_outputs"]), 6)
        self.assertIn("需求追踪矩阵", resource["required_outputs"])
        self.assertIn("每条结论必须引用用户材料中的原句或条款编号。", resource["rules"])
        self.assertNotIn(SAMPLE_REQUIREMENTS, json.dumps(resource, ensure_ascii=False))

    def test_fulfillment_clears_source_requirements(self):
        repository = pay_skill.require_order_repository()
        order = {
            "out_trade_no": "ORDER_PRIVACY_TEST",
            "amount": "0.01",
            "currency": "CNY",
            "resource_id": pay_skill.RESOURCE_CONFIG["path"],
            "goods_name": pay_skill.RESOURCE_CONFIG["goodsName"],
            "pay_before": "2099-01-01T00:00:00+08:00",
            "order_status": "PENDING_PAYMENT",
            "fulfill_status": "UNFULFILLED",
            "request": {
                "requirements_text": SAMPLE_REQUIREMENTS,
                "project_type": "AI POC",
                "project_context": "",
            },
        }
        repository.create_pending(order)
        repository.prepare_fulfillment({
            "out_trade_no": order["out_trade_no"],
            "trade_no": "TRADE_PRIVACY_TEST",
            "expected_amount": "0.01",
            "expected_resource_id": order["resource_id"],
            "create_resource": pay_skill.generate_service_resource,
        })
        repository.mark_fulfilled(order["out_trade_no"], "TRADE_PRIVACY_TEST")

        stored = repository.find_by_out_trade_no(order["out_trade_no"])
        self.assertEqual(stored["request_json"], "{}")
        self.assertNotIn(SAMPLE_REQUIREMENTS, stored["service_result"])


if __name__ == "__main__":
    unittest.main()
