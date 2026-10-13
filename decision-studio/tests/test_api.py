from fastapi.testclient import TestClient

from app.main import app


def test_jev_requires_key():
    with TestClient(app) as client:
        response = client.post(
            "/api/decisions",
            json={
                "provider": "jev",
                "state": "hello",
                "questions": {
                    "route": {
                        "type": "choice",
                        "instructions": "choose",
                        "criteria": {"a": "A", "b": "B"},
                    }
                },
            },
        )
    assert response.status_code == 422


def test_invalid_choice_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/decisions",
            json={
                "provider": "clm",
                "state": "hello",
                "questions": {
                    "route": {
                        "type": "choice",
                        "instructions": "choose",
                        "criteria": {"a": "A"},
                    }
                },
            },
        )
    assert response.status_code == 422


def test_jev_rank_requires_key():
    with TestClient(app) as client:
        response = client.post(
            "/api/rank",
            json={
                "provider": "jev",
                "context": "客户需要退款",
                "question": "处理顺序",
                "answers": ["退款", "忽略"],
            },
        )
    assert response.status_code == 422


def test_score_requires_two_levels():
    with TestClient(app) as client:
        response = client.post(
            "/api/decisions",
            json={
                "state": "风险很高",
                "questions": {
                    "risk": {
                        "type": "score",
                        "instructions": "风险等级",
                        "criteria": ["高"],
                    }
                },
            },
        )
    assert response.status_code == 422
