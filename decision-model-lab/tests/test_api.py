from fastapi.testclient import TestClient

from decision_model_lab.server import app


def test_decide_and_evaluate():
    with TestClient(app) as client:
        decision = client.post(
            "/api/decide",
            json={
                "state": "客户重复扣款，需要退款。",
                "model": "mock-lexical",
                "questions": {
                    "route": {
                        "type": "choice",
                        "instructions": "哪个团队处理？",
                        "criteria": {
                            "billing": "退款扣款发票",
                            "technical": "系统故障",
                        },
                    }
                },
            },
        )
        assert decision.status_code == 200
        payload = decision.json()
        assert payload["answers"]["route"]["choice"] == "billing"
        assert sum(payload["answers"]["route"]["probabilities"].values()) == 1.0

        evaluation = client.post(
            "/api/evaluate",
            json={
                "model": "mock-lexical",
                "examples": [
                    {
                        "id": "one",
                        "state": "客户重复扣款，需要退款。",
                        "question": {
                            "type": "choice",
                            "instructions": "哪个团队处理？",
                            "criteria": {
                                "billing": "退款扣款发票",
                                "technical": "系统故障",
                            },
                        },
                        "label": "billing",
                    }
                ],
            },
        )
        assert evaluation.status_code == 200
        assert evaluation.json()["metrics"]["count"] == 1


def test_invalid_choice_is_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/decide",
            json={
                "state": "x",
                "questions": {
                    "bad": {
                        "type": "choice",
                        "instructions": "pick",
                        "criteria": {"only": "one"},
                    }
                },
            },
        )
        assert response.status_code == 422
