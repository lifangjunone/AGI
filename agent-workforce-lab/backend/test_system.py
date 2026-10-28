import asyncio
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
import store as st
import main


@pytest.fixture
def client():
    st.DB_PATH = st.ROOT / "runtime" / "tests" / (uuid.uuid4().hex + ".sqlite3")
    with TestClient(main.app) as client:
        yield client


def employee(client, name="测试员工", skill="writing"):
    return client.post("/api/employees", json={"name": name, "role": "内部知识工作", "skill": skill}).json()


def teach(client, emp):
    response = client.post("/api/teaching", json={
        "title": "脱敏教学", "text": "先整理已知依据，政策不明确时向真人澄清，不承诺未知结果。",
        "consent": True, "audience": [emp["id"]], "mode": "demo"})
    assert response.status_code == 201, response.text
    source = response.json()
    result = client.post(f"/api/sources/{source['id']}/confirm", json={
        "method": "整理已知依据，不承诺未确认的结果", "conditions": "输入不足时向真人澄清；仅用于内部知识工作"})
    assert result.status_code == 200
    return result.json()


def qualify(client, emp):
    source = teach(client, emp)
    exam = client.post(f"/api/employees/{emp['id']}/exam", json={"mode": "demo"})
    assert exam.status_code == 200 and exam.json()["passed"], exam.text
    trial = client.post(f"/api/employees/{emp['id']}/trial", json={"mode": "demo"})
    assert trial.status_code == 200, trial.text
    result = client.post(f"/api/attempts/{trial.json()['id']}/approve",
                         json={"approved": True, "feedback": "方法、引用与边界均已检查"})
    assert result.status_code == 200
    return source


def publish(client, required=None, key=None):
    response = client.post("/api/tasks", headers={"Idempotency-Key": key or uuid.uuid4().hex}, json={
        "goal": "分析北区客户反馈，提出知识改进建议", "output": "方法建议和风险清单",
        "input_text": "客户对流程不清楚，希望答复，但政策尚未明确。",
        "deadline": "2035-10-26T18:00:00+08:00", "skills": required or ["writing", "analysis", "risk"],
        "consent": True, "mode": "demo", "auto_run": False})
    assert response.status_code in (200, 201), response.text
    return response.json()


def current(client, task):
    return next(t for t in client.get("/api/workspace").json()["tasks"] if t["id"] == task["id"])


def action(client, task, command, **extra):
    task = current(client, task)
    result = client.post(f"/api/tasks/{task['id']}/action", json={
        "action": command, "version": task["version"], **extra})
    assert result.status_code == 200, result.text
    return result.json()


def test_real_sdk_roundtrip_and_permissions(client):
    emp = employee(client)
    source = qualify(client, emp)
    other = employee(client, "未授权员工")
    result = client.get("/api/knowledge/query", params={"employee_id": emp["id"], "query": "依据"})
    assert result.status_code == 200 and source["id"] in [x["id"] for x in result.json()]
    forbidden = client.get("/api/knowledge/query", params={"employee_id": other["id"], "query": "依据"})
    assert forbidden.json() == []
    client.post(f"/api/sources/{source['id']}/revoke")
    assert client.get("/api/knowledge/query", params={"employee_id": emp["id"], "query": "依据"}).json() == []
    assert not client.get("/api/workspace").json()["employees"][0]["valid_skills"]["demo"]


def test_full_flow_group_review_rewards_and_restart(client):
    emp = employee(client, "晓禾")
    source = qualify(client, emp)
    client.post("/api/demo/colleagues")
    task = publish(client)
    task = action(client, task, "step")
    assert len(task["members"]) == 1 and not task["group_id"]
    task = action(client, task, "pause")
    assert task["status"] == "paused"
    task = action(client, task, "resume")
    task = action(client, task, "step")
    assert len(task["members"]) == 2 and not task["group_id"]
    task = action(client, task, "step")
    assert len(task["members"]) == 3 and task["group_id"]
    task = action(client, task, "step")
    assert task["status"] == "review" and len(task["artifacts"]) == 3
    assert len({a["content"] for a in task["artifacts"]}) == 3
    task = action(client, task, "return", feedback="补充真人升级的触发条件")
    task = action(client, task, "step")
    assert len(task["artifacts"]) == 6 and task["artifact_version"] == 2
    task = action(client, task, "review")
    assert task["status"] == "ready"
    wrong = client.post(f"/api/tasks/{task['id']}/action", json={
        "action": "accept", "version": task["version"], "artifact_version": 1})
    assert wrong.status_code == 409
    task = action(client, task, "accept", artifact_version=2)
    assert sum(r["points"] for r in task["rewards"]) == 100
    task = action(client, task, "accept", artifact_version=2)
    assert len(task["rewards"]) == 3
    experience = client.post(f"/api/tasks/{task['id']}/experience").json()
    assert not experience["confirmed"] and experience["fact_type"] == "reflection_candidate"
    st.initialize()
    assert current(client, task)["status"] == "completed"
    client.post(f"/api/sources/{source['id']}/revoke")
    assert current(client, task)["affected"]


def test_qualification_gate_and_conflicting_claim(client):
    emp = employee(client)
    first = publish(client, ["writing"])
    waiting = action(client, first, "step")
    assert waiting["status"] == "waiting" and not waiting["members"]
    qualify(client, emp)
    first = action(client, first, "resume")
    first = action(client, first, "step")
    assert len(first["members"]) == 1
    second = publish(client, ["writing"])
    second = action(client, second, "step")
    assert second["status"] == "waiting"
    stale = client.post(f"/api/tasks/{first['id']}/action", json={"action": "pause", "version": 1})
    assert stale.status_code == 409


def test_live_failure_never_becomes_demo(client, monkeypatch):
    monkeypatch.setenv("AWL_MODEL_KEY", "test-not-real")
    monkeypatch.setenv("AWL_MODEL_NAME", "test")
    async def broken(*args, **kwargs):
        raise TimeoutError("test timeout")
    monkeypatch.setattr(main, "generate", broken)
    emp = employee(client)
    response = client.post("/api/teaching", json={
        "title": "模型失败教学", "text": "已授权的脱敏资料，未调用成功不应确认。",
        "consent": True, "audience": [emp["id"]], "mode": "live"})
    assert response.status_code == 502
    source = client.get("/api/workspace").json()["sources"][0]
    assert not source["confirmed"] and source["error"]


def test_model_execution_failure_and_late_response(client, monkeypatch):
    emp = employee(client)
    qualify(client, emp)
    task = publish(client, ["writing"])
    task = action(client, task, "step")
    async def broken(*args, **kwargs):
        raise TimeoutError("test")
    monkeypatch.setattr(main, "generate", broken)
    task = action(client, task, "step")
    assert task["status"] == "error" and not task["artifacts"]
    task = action(client, task, "retry")
    async def paused(*args, **kwargs):
        with st.transaction() as db:
            t = st.get(db, "task", task["id"])
            t.update(status="paused", lease=None, version=t["version"] + 1)
            st.save(db, "task", t)
        return {"content": "late response", "citations": []}
    monkeypatch.setattr(main, "generate", paused)
    task = action(client, task, "step")
    assert task["status"] == "paused" and not task["artifacts"]


def test_import_and_idempotent_publish(client):
    emp = employee(client)
    result = client.post("/api/materials/import", files={"file": ("lesson.md", "脱敏资料：缺少依据时找真人确认。".encode(), "text/markdown")},
                         data={"audience": json.dumps([emp["id"]]), "consent": "true", "mode": "demo"})
    assert result.status_code == 200, result.text
    key = uuid.uuid4().hex
    first = publish(client, ["writing"], key)
    second = publish(client, ["writing"], key)
    assert first["id"] == second["id"]
    assert len(client.get("/api/workspace").json()["tasks"]) == 1


def test_cancel_releases_load_and_source_edit_invalidates(client):
    emp = employee(client)
    source = qualify(client, emp)
    task = publish(client, ["writing"])
    task = action(client, task, "step")
    task = action(client, task, "cancel")
    assert task["status"] == "cancelled"
    other = publish(client, ["writing"])
    other = action(client, other, "step")
    assert len(other["members"]) == 1
    client.post(f"/api/sources/{source['id']}/confirm", json={
        "method": "更新方法，依据不够时请真人", "conditions": "只处理内部知识，不直接承诺业务结果"})
    assert current(client, other)["status"] == "blocked"
    assert not client.get("/api/workspace").json()["employees"][0]["valid_skills"]["demo"]


def test_local_account_register_login_logout(client):
    first = client.post("/api/auth/register", json={
        "name": "演示用户", "email": "demo@example.local", "password": "demo1234"})
    assert first.status_code == 201, first.text
    assert first.json()["account"]["email"] == "demo@example.local"
    assert client.get("/api/auth/me").json()["account"]["name"] == "演示用户"
    duplicate = client.post("/api/auth/register", json={
        "name": "重复", "email": "demo@example.local", "password": "demo1234"})
    assert duplicate.status_code == 409
    wrong = client.post("/api/auth/login", json={"email": "demo@example.local", "password": "wrong000"})
    assert wrong.status_code == 401
    login = client.post("/api/auth/login", json={"email": "demo@example.local", "password": "demo1234"})
    assert login.status_code == 200
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/auth/me").json()["account"] is None
