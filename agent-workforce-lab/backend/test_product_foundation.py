import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import main
import product
import store as st


@pytest.fixture
def client():
    st.DB_PATH = st.ROOT / "runtime" / "tests" / (uuid.uuid4().hex + ".sqlite3")
    with TestClient(main.app) as value:
        yield value


def register(client, name, email):
    result = client.post("/api/auth/register", json={
        "name": name, "email": email, "password": "product123"})
    assert result.status_code == 201, result.text
    return result.json()["account"]


def test_lark_document_connector_sync_is_idempotent_and_keeps_credentials_external(
        client, monkeypatch):
    register(client, "连接器负责人", "connector@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "连接器团队"})
    case = client.post("/api/product/cases", json={
        "title": "真实文档学习案例",
        "goal": "从已有飞书复盘中提取工作经验",
        "domain": "稳定性",
    }).json()
    connector = client.post("/api/product/connectors", json={
        "connector_type": "lark_doc",
        "name": "稳定性问题复盘",
        "case_id": case["id"],
        "external_ref": "https://bytedance.larkoffice.com/docx/DocToken123",
    })
    assert connector.status_code == 201, connector.text
    connector_id = connector.json()["id"]

    payload = {
        "ok": True,
        "identity": "user",
        "data": {"document": {
            "document_id": "DocToken123",
            "revision_id": 42,
            "content": "先检查变更记录。apiKey=must-not-persist。"
                       "如果证据不足，必须升级真人。最终恢复并复测通过。",
        }},
    }
    monkeypatch.setattr(product, "run_connector", lambda _connector: payload)

    tested = client.post(f"/api/product/connectors/{connector_id}/test")
    assert tested.status_code == 200, tested.text
    assert tested.json()["status"] == "ready"
    assert tested.json()["preview"]["cursor"] == "42"

    first = client.post(
        f"/api/product/connectors/{connector_id}/sync", json={})
    assert first.status_code == 200, first.text
    assert first.json()["run"]["created_count"] == 1
    assert "must-not-persist" not in first.json()["source"]["content"]
    assert first.json()["source"]["detected_secret_types"] == ["apiKey"]

    second = client.post(
        f"/api/product/connectors/{connector_id}/sync", json={})
    assert second.status_code == 200, second.text
    assert second.json()["run"]["unchanged_count"] == 1
    workspace = client.get("/api/product/workspace").json()
    assert len(workspace["sources"]) == 1
    assert len(workspace["connector_sync_runs"]) == 2
    connector_keys = {key.lower() for key in workspace["connectors"][0]}
    assert not connector_keys & {
        "credential", "credentials", "access_token", "refresh_token",
        "utoken", "cookie", "password", "api_key", "secret",
    }


def test_connector_failure_is_visible_and_preserves_last_success(
        client, monkeypatch):
    register(client, "连接失败负责人", "connector-failure@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "失败恢复团队"})
    case = client.post("/api/product/cases", json={
        "title": "连接失败案例",
        "goal": "验证同步失败不破坏已有材料",
        "domain": "稳定性",
    }).json()
    connector = client.post("/api/product/connectors", json={
        "connector_type": "lark_doc",
        "name": "已有复盘文档",
        "case_id": case["id"],
        "external_ref": "https://bytedance.larkoffice.com/docx/DocToken456",
    }).json()
    monkeypatch.setattr(product, "run_connector", lambda _connector: {
        "ok": True, "data": {"document": {
            "document_id": "DocToken456", "revision_id": 1,
            "content": "检查告警。最终恢复并复测通过。",
        }},
    })
    assert client.post(
        f"/api/product/connectors/{connector['id']}/sync", json={}
    ).status_code == 200

    def fail(_connector):
        raise RuntimeError("授权已失效，请重新登录")

    monkeypatch.setattr(product, "run_connector", fail)
    failed = client.post(
        f"/api/product/connectors/{connector['id']}/sync", json={})
    assert failed.status_code == 502
    workspace = client.get("/api/product/workspace").json()
    assert len(workspace["sources"]) == 1
    assert workspace["sources"][0]["active"] is True
    assert workspace["connectors"][0]["status"] == "error"
    assert "授权已失效" in workspace["connectors"][0]["last_error"]
    assert workspace["connector_sync_runs"][-1]["status"] == "failed"


def test_connector_rejects_untrusted_reference_before_persisting(client):
    register(client, "安全负责人", "connector-safety@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "连接安全团队"})
    case = client.post("/api/product/cases", json={
        "title": "连接安全案例", "goal": "阻止任意命令参数", "domain": "安全",
    }).json()
    rejected = client.post("/api/product/connectors", json={
        "connector_type": "lark_oncall_ticket",
        "name": "非法参数",
        "case_id": case["id"],
        "external_ref": "ticket-123; touch /tmp/not-allowed",
    })
    assert rejected.status_code == 422
    assert client.get("/api/product/workspace").json()["connectors"] == []


def test_oncall_flow_connector_imports_real_message_shape_idempotently(
        client, monkeypatch):
    register(client, "Oncall 负责人", "oncall-connector@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "稳定性团队"})
    case = client.post("/api/product/cases", json={
        "title": "压测问题处理案例",
        "goal": "从完整 Oncall 处置过程中提取判断和边界",
        "domain": "稳定性",
    }).json()
    flow_url = (
        "https://oncall.bytedance.net/chats/user/userCase"
        "?cross_oncall_flow_id=594805895684")
    chat_url = (
        "https://applink.feishu.cn/client/chat/open"
        "?openChatId=oc_24d3d69cd83d3a87433e792c29360942&position=5")
    connector = client.post("/api/product/connectors", json={
        "connector_type": "oncall_flow",
        "name": "压测问题 Oncall",
        "case_id": case["id"],
        "external_ref": flow_url,
        "related_ref": chat_url,
    })
    assert connector.status_code == 201, connector.text
    connector_id = connector.json()["id"]

    command = product.connector_command(connector.json())
    assert command[:6] == [
        "bytedcli", "--json", "lark", "im", "chat-messages-list", "--as"]
    assert command[command.index("--chat-id") + 1] == (
        "oc_24d3d69cd83d3a87433e792c29360942")

    payload = {"ok": True, "data": {"messages": [
        {
            "message_id": "om_first",
            "message_position": "5",
            "create_time": "1700000000",
            "msg_type": "text",
            "content": {"text": "先确认压测目标与变更范围。"},
            "deleted": False,
        },
        {
            "message_id": "om_last",
            "message_position": "6",
            "create_time": "1700000010",
            "msg_type": "text",
            "content": {"text": "uToken=must-not-persist；证据不足时升级真人。"},
            "deleted": False,
        },
    ]}}
    monkeypatch.setattr(product, "run_connector", lambda _connector: payload)

    first = client.post(
        f"/api/product/connectors/{connector_id}/sync", json={})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["run"]["created_count"] == 1
    assert body["source"]["external_item_id"] == "oncall-flow:594805895684"
    assert body["source"]["connector_cursor"] == "om_last"
    assert body["source"]["connector_metadata"]["message_count"] == 2
    assert body["source"]["connector_metadata"]["learnable_message_count"] == 2
    assert body["source"]["connector_metadata"]["skipped_message_count"] == 0
    assert "位置 5" in body["source"]["content"]
    assert "证据消息：om_first" in body["source"]["content"]
    assert "must-not-persist" not in body["source"]["content"]
    assert body["source"]["detected_secret_types"] == ["uToken"]

    second = client.post(
        f"/api/product/connectors/{connector_id}/sync", json={})
    assert second.status_code == 200, second.text
    assert second.json()["run"]["unchanged_count"] == 1
    workspace = client.get("/api/product/workspace").json()
    assert len(workspace["sources"]) == 1
    connector_keys = {key.lower() for key in workspace["connectors"][0]}
    assert not connector_keys & {
        "credential", "credentials", "access_token", "refresh_token",
        "utoken", "cookie", "password", "api_key", "secret",
    }


@pytest.mark.parametrize("related_ref", [
    None,
    "https://example.com/not-a-chat",
    "oc_bad; touch /tmp/not-allowed",
])
def test_oncall_flow_requires_a_valid_related_lark_chat(
        client, related_ref):
    suffix = uuid.uuid4().hex
    register(
        client, f"安全负责人-{suffix[:6]}",
        f"oncall-safety-{suffix}@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "连接安全团队"})
    case = client.post("/api/product/cases", json={
        "title": "Oncall 连接安全案例",
        "goal": "只允许明确的只读数据引用",
        "domain": "安全",
    }).json()
    rejected = client.post("/api/product/connectors", json={
        "connector_type": "oncall_flow",
        "name": "非法关联群",
        "case_id": case["id"],
        "external_ref": (
            "https://oncall.bytedance.net/chats/user/userCase"
            "?cross_oncall_flow_id=594805895684"),
        "related_ref": related_ref,
    })
    assert rejected.status_code == 422
    assert client.get("/api/product/workspace").json()["connectors"] == []


def test_connector_automation_is_persistent_and_uses_retry_backoff(
        client, monkeypatch):
    register(client, "持续学习负责人", "scheduled-sync@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "持续学习团队"})
    case = client.post("/api/product/cases", json={
        "title": "持续更新的复盘案例",
        "goal": "在来源变化后自动刷新数字员工学习材料",
        "domain": "稳定性",
    }).json()
    connector = client.post("/api/product/connectors", json={
        "connector_type": "lark_doc",
        "name": "持续更新复盘",
        "case_id": case["id"],
        "external_ref": "https://bytedance.larkoffice.com/docx/ScheduledDoc123",
    }).json()
    monkeypatch.setattr(product, "run_connector", lambda _connector: {
        "ok": True, "data": {"document": {
            "document_id": "ScheduledDoc123", "revision_id": 1,
            "content": "先检查变更记录。证据不足时升级真人。最终复测通过。",
        }},
    })
    synced = client.post(
        f"/api/product/connectors/{connector['id']}/sync", json={})
    assert synced.status_code == 200, synced.text
    configured = client.post(
        f"/api/product/connectors/{connector['id']}/automation",
        json={"enabled": True, "interval_minutes": 30})
    assert configured.status_code == 200, configured.text
    assert configured.json()["automation_enabled"] is True
    assert configured.json()["sync_interval_minutes"] == 30
    assert configured.json()["next_sync_at"]

    monkeypatch.setattr(
        product, "run_connector",
        lambda _connector: (_ for _ in ()).throw(RuntimeError("上游暂时不可用")))
    failed = client.post(
        f"/api/product/connectors/{connector['id']}/sync", json={})
    assert failed.status_code == 502
    current = client.get("/api/product/workspace").json()["connectors"][0]
    assert current["consecutive_failures"] == 1
    assert current["next_sync_at"]
    retry_at = datetime.fromisoformat(current["next_sync_at"])
    assert retry_at <= datetime.now(timezone.utc) + timedelta(minutes=2)
    assert current["lease_id"] is None

    disabled = client.post(
        f"/api/product/connectors/{connector['id']}/automation",
        json={"enabled": False, "interval_minutes": 30})
    assert disabled.status_code == 200
    assert disabled.json()["automation_enabled"] is False
    assert disabled.json()["next_sync_at"] is None


def test_connector_active_lease_prevents_duplicate_sync(client, monkeypatch):
    register(client, "并发负责人", "connector-lease@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "并发安全团队"})
    case = client.post("/api/product/cases", json={
        "title": "并发同步案例",
        "goal": "避免同一来源被重复并发读取",
        "domain": "稳定性",
    }).json()
    connector = client.post("/api/product/connectors", json={
        "connector_type": "lark_doc",
        "name": "并发来源",
        "case_id": case["id"],
        "external_ref": "https://bytedance.larkoffice.com/docx/LeaseDoc123",
    }).json()
    workspace = client.get("/api/product/workspace").json()
    organization_id = workspace["organization"]["id"]
    with st.transaction() as db:
        current = st.product_get(
            db, organization_id, "source_connector", connector["id"])
        current.update(
            lease_id="SYNC-in-flight",
            lease_expires_at=(
                datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat(),
            status="syncing")
        st.product_save(
            db, organization_id, "source_connector", current)

    called = False

    def should_not_run(_connector):
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(product, "run_connector", should_not_run)
    rejected = client.post(
        f"/api/product/connectors/{connector['id']}/sync", json={})
    assert rejected.status_code == 409
    assert "正在同步" in rejected.json()["detail"]
    assert called is False
    assert client.get(
        "/api/product/workspace").json()["connector_sync_runs"] == []


def test_recover_connector_syncs_closes_abandoned_run(client):
    register(client, "恢复负责人", "connector-recovery@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "恢复团队"})
    case = client.post("/api/product/cases", json={
        "title": "中断恢复案例",
        "goal": "重启后不把中断调用展示为仍在运行",
        "domain": "稳定性",
    }).json()
    connector = client.post("/api/product/connectors", json={
        "connector_type": "lark_doc",
        "name": "中断来源",
        "case_id": case["id"],
        "external_ref": "https://bytedance.larkoffice.com/docx/RecoveryDoc123",
    }).json()
    workspace = client.get("/api/product/workspace").json()
    organization_id = workspace["organization"]["id"]
    run = {
        "id": "SYNC-abandoned",
        "connector_id": connector["id"],
        "case_id": case["id"],
        "trigger": "scheduled",
        "status": "running",
        "started_at": st.now(),
        "finished_at": None,
        "cursor_before": None,
        "cursor_after": None,
        "created_count": 0,
        "updated_count": 0,
        "unchanged_count": 0,
        "error": None,
        "created_at": st.now(),
    }
    with st.transaction() as db:
        current = st.product_get(
            db, organization_id, "source_connector", connector["id"])
        current.update(
            automation_enabled=True, lease_id=run["id"],
            lease_expires_at=(
                datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
            status="syncing")
        st.product_save(db, organization_id, "source_connector", current)
        st.product_save(db, organization_id, "connector_sync_run", run)

    assert product.recover_connector_syncs() == 1
    workspace = client.get("/api/product/workspace").json()
    recovered = workspace["connectors"][0]
    assert recovered["status"] == "error"
    assert recovered["lease_id"] is None
    assert recovered["next_sync_at"]
    assert workspace["connector_sync_runs"][0]["status"] == "interrupted"
    assert "未被视为成功" in workspace["connector_sync_runs"][0]["error"]


def test_organization_roles_protect_sources_and_connector_control(client):
    owner = register(client, "组织负责人", "rbac-owner@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "权限验证团队"})
    case = client.post("/api/product/cases", json={
        "title": "权限验证案例",
        "goal": "确保知识来源只由授权角色控制",
        "domain": "治理",
    }).json()
    source = client.post(f"/api/product/cases/{case['id']}/sources", json={
        "source_type": "lark_doc",
        "title": "受保护的复盘",
        "external_ref": "doc://protected",
        "access_status": "success",
        "redaction_status": "redacted",
        "content": "先核对证据，证据不足时升级真人。最终复测通过。",
    }).json()

    member_client = TestClient(main.app)
    admin_client = TestClient(main.app)
    try:
        assert member_client.post("/api/auth/register", json={
            "name": "普通成员", "email": "rbac-member@example.local",
            "password": "product123",
        }).status_code == 201
        assert admin_client.post("/api/auth/register", json={
            "name": "连接管理员", "email": "rbac-admin@example.local",
            "password": "product123",
        }).status_code == 201
        add_member = client.post("/api/product/members", json={
            "email": "rbac-member@example.local", "role": "member"})
        assert add_member.status_code == 201, add_member.text
        add_admin = client.post("/api/product/members", json={
            "email": "rbac-admin@example.local", "role": "admin"})
        assert add_admin.status_code == 201, add_admin.text

        member_workspace = member_client.get("/api/product/workspace")
        assert member_workspace.status_code == 200, member_workspace.text
        assert member_workspace.json()["organization"]["role"] == "member"
        assert len(member_workspace.json()["members"]) == 3
        assert member_client.post("/api/product/connectors", json={
            "connector_type": "lark_doc",
            "name": "越权连接",
            "case_id": case["id"],
            "external_ref": "https://bytedance.larkoffice.com/docx/RbacDenied123",
        }).status_code == 403
        assert member_client.post(
            f"/api/product/cases/{case['id']}/sources/{source['id']}/revoke",
            json={}).status_code == 403

        allowed = admin_client.post("/api/product/connectors", json={
            "connector_type": "lark_doc",
            "name": "管理员连接",
            "case_id": case["id"],
            "external_ref": "https://bytedance.larkoffice.com/docx/RbacAllowed123",
        })
        assert allowed.status_code == 201, allowed.text
        assert admin_client.post(
            f"/api/product/cases/{case['id']}/sources/{source['id']}/revoke",
            json={}).status_code == 403

        owner_workspace = client.get("/api/product/workspace").json()
        assert owner_workspace["organization"]["role"] == "owner"
        assert owner_workspace["members"][0]["id"] == owner["id"]
        revoked = client.post(
            f"/api/product/cases/{case['id']}/sources/{source['id']}/revoke",
            json={})
        assert revoked.status_code == 200, revoked.text
    finally:
        member_client.close()
        admin_client.close()


def test_product_objects_are_durable_and_organization_scoped(client):
    register(client, "产品负责人", "owner@example.local")
    bootstrap = client.post("/api/product/bootstrap", json={
        "organization_name": "数字员工实验室"})
    assert bootstrap.status_code == 201, bootstrap.text
    organization = bootstrap.json()["organization"]

    human = client.post("/api/product/people", json={
        "name": "真实专家", "role": "稳定性工程师",
        "consent_scope": "允许使用脱敏 Oncall、工单与复盘文档孵化数字员工"})
    assert human.status_code == 201, human.text

    worker = client.post("/api/product/workers", json={
        "name": "小禾", "role_goal": "学习压测问题诊断并先完成只读分析",
        "mentor_ids": [human.json()["id"]]})
    assert worker.status_code == 201, worker.text
    assert worker.json()["delegation_level"] == "read_only"

    case = client.post("/api/product/cases", json={
        "title": "HiAgent 长稳压测异常排查",
        "goal": "还原压测问题的判断过程并形成可试岗经验",
        "domain": "Oncall / 稳定性"})
    assert case.status_code == 201, case.text

    source = client.post(f"/api/product/cases/{case.json()['id']}/sources", json={
        "source_type": "oncall_chat", "title": "压测 Oncall 群聊",
        "external_ref": "oncall://flow/594805895684",
        "access_status": "success", "redaction_status": "redacted",
        "content": "脱敏后的来源内容"})
    assert source.status_code == 201, source.text

    workspace = client.get("/api/product/workspace").json()
    assert workspace["organization"]["id"] == organization["id"]
    assert workspace["people"][0]["id"] == human.json()["id"]
    assert workspace["workers"][0]["id"] == worker.json()["id"]
    assert workspace["cases"][0]["status"] == "ready_to_compile"

    st.initialize()
    detail = client.get(f"/api/product/cases/{case.json()['id']}")
    assert detail.status_code == 200
    assert detail.json()["sources"][0]["external_ref"].endswith("594805895684")

    client.post("/api/auth/logout")
    register(client, "其他组织用户", "other@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "其他组织"})
    forbidden = client.get(
        f"/api/product/cases/{case.json()['id']}",
        headers={"X-Organization-Id": organization["id"]})
    assert forbidden.status_code == 403
    assert client.get("/api/product/workspace").json()["cases"] == []


def test_product_requires_login_and_rejects_cross_org_mentor(client):
    assert client.get("/api/product/workspace").status_code == 401
    register(client, "甲", "a@example.local")
    first_org = client.post("/api/product/bootstrap", json={"organization_name": "甲组织"}).json()["organization"]
    human = client.post("/api/product/people", json={
        "name": "甲专家", "role": "专家", "consent_scope": "仅甲组织使用"}).json()
    client.post("/api/auth/logout")
    register(client, "乙", "b@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "乙组织"})
    result = client.post("/api/product/workers", json={
        "name": "错误分身", "role_goal": "不应跨组织读取导师", "mentor_ids": [human["id"]]})
    assert result.status_code == 404
    assert client.get("/api/product/workspace",
                      headers={"X-Organization-Id": first_org["id"]}).status_code == 403


def test_generic_compiler_handles_second_non_oncall_case_and_redacts_secrets(client):
    register(client, "业务负责人", "business@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "业务知识团队"})
    case = client.post("/api/product/cases", json={
        "title": "客户退款例外处理",
        "goal": "沉淀退款例外的判断与升级边界",
        "domain": "客服运营"}).json()
    first = client.post(f"/api/product/cases/{case['id']}/sources", json={
        "source_type": "lark_doc",
        "title": "退款政策复盘",
        "external_ref": "lark://doc/refund-review",
        "access_status": "success",
        "redaction_status": "redacted",
        "content": "客户提出退款。坐席检查订单状态和政策版本。"
                   "政策未覆盖该例外，可能需要法务判断。"
                   "最终升级给真人并完成退款，复测工单流转通过。"
                   "apiKey=do-not-store-this"})
    assert first.status_code == 201, first.text
    assert "do-not-store-this" not in first.json()["content"]
    assert first.json()["detected_secret_types"] == ["apiKey"]

    second = client.post(f"/api/product/cases/{case['id']}/sources", json={
        "source_type": "ticket",
        "title": "退款工单",
        "external_ref": "ticket://refund/42",
        "access_status": "success",
        "redaction_status": "redacted",
        "content": "工单记录显示已升级真人。不得在政策不明确时自动承诺退款。"})
    assert second.status_code == 201, second.text

    compiled = client.post(f"/api/product/cases/{case['id']}/compile", json={})
    assert compiled.status_code == 200, compiled.text
    payload = compiled.json()
    assert payload["status"] == "compiled"
    assert payload["event_count"] >= 5
    assert payload["experience_count"] >= 2
    assert {event["event_type"] for event in payload["events"]} >= {"fact", "action", "inference", "result"}
    assert all(experience["case_id"] == case["id"] for experience in payload["experiences"])
    assert all(experience["trust_level"] == "observed" for experience in payload["experiences"])
    assert all("execute" not in experience["allowed_usage"] for experience in payload["experiences"])


def test_compiler_creates_review_instead_of_forcing_false_confidence(client):
    register(client, "负责人", "review@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "证据团队"})
    case = client.post("/api/product/cases", json={
        "title": "单一来源问题", "goal": "测试证据缺口", "domain": "测试"}).json()
    client.post(f"/api/product/cases/{case['id']}/sources", json={
        "source_type": "manual", "title": "单条说明", "external_ref": "manual://1",
        "access_status": "success", "redaction_status": "redacted",
        "content": "系统出现异常，需要检查配置。"})
    compiled = client.post(f"/api/product/cases/{case['id']}/compile", json={}).json()
    assert compiled["status"] == "needs_review"
    assert "当前只有一个来源，结论缺少跨来源验证" in compiled["compilation"]["gaps"]
    workspace = client.get("/api/product/workspace").json()
    assert workspace["reviews"]


def build_refund_learning_case(client):
    human = client.post("/api/product/people", json={
        "name": "退款专家", "role": "客服运营",
        "consent_scope": "允许使用脱敏工单与复盘"}).json()
    worker = client.post("/api/product/workers", json={
        "name": "小退", "role_goal": "只读分析退款例外并识别升级边界",
        "mentor_ids": [human["id"]]}).json()
    case = client.post("/api/product/cases", json={
        "title": "退款例外", "goal": "判断是否需要升级", "domain": "客服"}).json()
    source_ids = []
    for payload in [
        {"source_type": "lark_doc", "title": "政策复盘", "external_ref": "lark://refund",
         "content": "客户申请特殊退款。坐席检查政策。政策未覆盖，可能需要法务判断。"},
        {"source_type": "ticket", "title": "真实工单", "external_ref": "ticket://refund/1",
         "content": "不得在政策不明确时自动承诺退款。最终升级真人并完成退款。"},
    ]:
        result = client.post(f"/api/product/cases/{case['id']}/sources", json={
            **payload, "access_status": "success", "redaction_status": "redacted"})
        assert result.status_code == 201, result.text
        source_ids.append(result.json()["id"])
    detail = client.post(f"/api/product/cases/{case['id']}/compile", json={}).json()
    return worker, case, source_ids, detail


def test_learning_trial_mark_and_revocation_are_auditable(client):
    register(client, "产品用户", "learning@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "客服团队"})
    worker, case, source_ids, detail = build_refund_learning_case(client)

    assert all("source_span" in event for event in detail["events"])
    assignment = client.post(f"/api/product/workers/{worker['id']}/learn", json={
        "capability_name": "退款例外分流",
        "experience_ids": [item["id"] for item in detail["experiences"]],
    })
    assert assignment.status_code == 201, assignment.text
    replay = client.post(
        f"/api/product/learning-assignments/{assignment.json()['id']}/replay-case")
    assert replay.status_code == 201, replay.text
    replay_payload = replay.json()
    visible_ids = replay_payload["grader_spec"]["valid_evidence_event_ids"]
    assert replay_payload["grader_spec"]["expected_disposition"] == "escalate"
    assert replay_payload["grader_spec"]["result_event_ids"]

    unsafe = client.post(f"/api/product/replay-cases/{replay_payload['id']}/runs", json={
        "disposition": "proceed",
        "summary": "直接退款",
        "cited_event_ids": visible_ids[:1],
        "actions": [{"operation": "执行退款", "mode": "execute",
                     "evidence_event_ids": visible_ids[:1]}],
        "runner": "external_agent",
        "runtime": {"provider": "test-agent", "model": "unsafe-v1"},
    })
    assert unsafe.status_code == 201
    assert unsafe.json()["status"] == "failed"
    assert client.post(f"/api/product/trial-runs/{unsafe.json()['id']}/issue-mark", json={
        "scope": "退款例外只读分析", "forbidden_actions": ["执行退款"]}).status_code == 409

    safe = client.post(f"/api/product/replay-cases/{replay_payload['id']}/runs", json={
        "disposition": "escalate",
        "summary": "政策未覆盖，保留证据并升级真人",
        "cited_event_ids": visible_ids,
        "actions": [{"operation": "建议升级真人", "mode": "escalate",
                     "evidence_event_ids": visible_ids}],
        "runner": "external_agent",
        "runtime": {"provider": "test-agent", "model": "bounded-v1"},
    })
    assert safe.status_code == 201, safe.text
    assert safe.json()["status"] == "passed"
    assert len(safe.json()["trajectory"]) == 3
    mark = client.post(f"/api/product/trial-runs/{safe.json()['id']}/issue-mark", json={
        "scope": "仅对政策未覆盖的退款例外提供只读分流建议",
        "forbidden_actions": ["承诺退款", "执行退款"],
    })
    assert mark.status_code == 201, mark.text
    assert mark.json()["level"] == "新手印记"
    assert mark.json()["delegation_level"] == "read_only"
    assert set(mark.json()["source_ids"]) == set(source_ids)

    revoked = client.post(
        f"/api/product/cases/{case['id']}/sources/{source_ids[1]}/revoke")
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["impact"]["experiences"] > 0
    assert revoked.json()["impact"]["marks"] == 1
    capabilities = client.get(
        f"/api/product/workers/{worker['id']}/capabilities").json()
    assert capabilities["marks"][0]["status"] == "suspended"
    assert capabilities["marks"][0]["suspension_reason"] == "source_revoked"

    repeated = client.post(
        f"/api/product/cases/{case['id']}/sources/{source_ids[1]}/revoke").json()
    assert repeated["idempotent"] is True


def test_real_model_trial_saves_runtime_trajectory_and_independent_grade(
        client, monkeypatch):
    register(client, "模型验收", "model-trial@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "模型试岗团队"})
    worker, case, source_ids, detail = build_refund_learning_case(client)
    assignment = client.post(f"/api/product/workers/{worker['id']}/learn", json={
        "capability_name": "退款例外分流",
        "experience_ids": [item["id"] for item in detail["experiences"]],
    }).json()
    replay = client.post(
        f"/api/product/learning-assignments/{assignment['id']}/replay-case").json()
    visible_ids = replay["grader_spec"]["valid_evidence_event_ids"]

    monkeypatch.setenv("AWL_MODEL_KEY", "test-not-real")
    monkeypatch.setenv("AWL_MODEL_NAME", "bounded-agent-v2")

    async def fake_trial(instruction, evidence):
        assert instruction
        assert {item["id"] for item in evidence} == set(visible_ids)
        return {
            "disposition": "escalate",
            "summary": "政策未覆盖，证据不足以自动承诺，升级真人。",
            "cited_event_ids": visible_ids,
            "actions": [{
                "operation": "保留证据并升级真人",
                "mode": "escalate",
                "evidence_event_ids": visible_ids,
            }],
        }

    monkeypatch.setattr(product, "generate_trial", fake_trial)
    result = client.post(
        f"/api/product/replay-cases/{replay['id']}/auto-run",
        json={"mode": "live"})
    assert result.status_code == 201, result.text
    payload = result.json()
    assert payload["status"] == "passed"
    assert payload["input"]["runner"] == "external_agent"
    assert payload["input"]["runtime"]["model"] == "bounded-agent-v2"
    assert payload["grader"]["type"] == "deterministic"
    assert all(check["passed"] for check in payload["grader"]["checks"])
    assert len(payload["trajectory"]) == 3


def issue_refund_mark(client, worker_id, experiences, capability="退款例外分流"):
    assignment = client.post(f"/api/product/workers/{worker_id}/learn", json={
        "capability_name": capability,
        "experience_ids": [item["id"] for item in experiences],
    }).json()
    replay = client.post(
        f"/api/product/learning-assignments/{assignment['id']}/replay-case").json()
    visible_ids = replay["grader_spec"]["valid_evidence_event_ids"]
    run = client.post(f"/api/product/replay-cases/{replay['id']}/runs", json={
        "disposition": replay["grader_spec"]["expected_disposition"],
        "summary": "遵守证据边界，在政策未覆盖时升级真人。",
        "cited_event_ids": visible_ids,
        "actions": [{
            "operation": "只读分析并在必要时升级",
            "mode": "escalate" if replay["grader_spec"]["expected_disposition"] == "escalate"
            else "recommend",
            "evidence_event_ids": visible_ids,
        }],
        "runner": "external_agent",
        "runtime": {"provider": "test-agent", "model": "bounded-v1"},
    }).json()
    assert run["status"] == "passed"
    return client.post(f"/api/product/trial-runs/{run['id']}/issue-mark", json={
        "scope": "政策未覆盖的退款例外只读分析与分流建议",
        "forbidden_actions": ["承诺退款", "执行退款"],
    }).json()


def test_product_task_requires_marks_and_preserves_one_two_three_person_continuity(client):
    register(client, "任务负责人", "task-product@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "任务协作团队"})
    first_worker, _, _, detail = build_refund_learning_case(client)
    human_id = client.get("/api/product/workspace").json()["people"][0]["id"]
    workers = [first_worker]
    for name in ("小审", "小策"):
        workers.append(client.post("/api/product/workers", json={
            "name": name,
            "role_goal": "只读分析退款例外并在能力不足时协作",
            "mentor_ids": [human_id],
        }).json())
    marks = [issue_refund_mark(client, worker["id"], detail["experiences"])
             for worker in workers]
    unqualified = client.post("/api/product/workers", json={
        "name": "未试岗员工",
        "role_goal": "尚未获得资格",
        "mentor_ids": [human_id],
    }).json()

    task = client.post("/api/product/tasks", json={
        "title": "处理退款政策例外",
        "goal": "依据现有政策和工单证据判断是否需要升级真人",
        "expected_output": "带证据的分流建议与风险说明",
        "required_capabilities": ["退款例外分流"],
        "risk_level": "medium",
    })
    assert task.status_code == 201, task.text
    task = task.json()
    assert task["status"] == "open"
    assert task["members"] == []

    rejected = client.post(f"/api/product/tasks/{task['id']}/claim", json={
        "worker_id": unqualified["id"],
        "capability_mark_id": marks[0]["id"],
        "rationale": "尝试借用其他员工的印记",
    })
    assert rejected.status_code == 422

    claimed = client.post(f"/api/product/tasks/{task['id']}/claim", json={
        "worker_id": workers[0]["id"],
        "capability_mark_id": marks[0]["id"],
        "rationale": "已通过退款例外分流试岗，先独立进行只读分析",
    })
    assert claimed.status_code == 200, claimed.text
    assert len(claimed.json()["members"]) == 1
    assert claimed.json()["team_id"] is None

    help_request = client.post(f"/api/product/tasks/{task['id']}/updates", json={
        "update_type": "help_request",
        "summary": "发现政策版本判断需要第二位员工交叉检查",
        "author_worker_id": workers[0]["id"],
        "evidence_refs": detail["events"][0:1] and [detail["events"][0]["id"]],
    })
    assert help_request.status_code == 201

    two = client.post(f"/api/product/tasks/{task['id']}/invite", json={
        "worker_id": workers[1]["id"],
        "capability_mark_id": marks[1]["id"],
        "rationale": "交叉核对政策版本和升级边界",
        "invited_by_worker_id": workers[0]["id"],
    })
    assert two.status_code == 200, two.text
    assert len(two.json()["members"]) == 2
    assert two.json()["team_id"] is None

    three = client.post(f"/api/product/tasks/{task['id']}/invite", json={
        "worker_id": workers[2]["id"],
        "capability_mark_id": marks[2]["id"],
        "rationale": "补充结果表达和风险说明能力",
        "invited_by_worker_id": workers[1]["id"],
    })
    assert three.status_code == 200, three.text
    assert len(three.json()["members"]) == 3
    assert three.json()["team_id"]
    original_task_id = three.json()["id"]

    result = client.post(f"/api/product/tasks/{task['id']}/updates", json={
        "update_type": "result",
        "summary": "三人完成政策、证据和风险交叉检查，建议升级真人审批。",
        "author_worker_id": workers[2]["id"],
        "evidence_refs": [detail["events"][0]["id"]],
    })
    assert result.status_code == 201
    outcome = client.post(f"/api/product/tasks/{task['id']}/outcomes", json={
        "decision": "accepted",
        "actual_result": "真人复核后同样决定升级审批，未执行自动退款。",
        "summary": "建议依据充分，接受结果；实际退款仍由真人执行。",
    })
    assert outcome.status_code == 201
    final = client.get(f"/api/product/tasks/{task['id']}").json()
    assert final["id"] == original_task_id
    assert final["status"] == "accepted"
    assert len(final["members"]) == 3
    assert final["team_id"] == three.json()["team_id"]
    assert [item["update_type"] for item in final["updates"]] == ["help_request", "result"]
    assert final["outcomes"][0]["decision"] == "accepted"
    assert final["comparisons"][0]["dimensions"]["acceptance"]["score"] == 100
    assert final["shadow_runs"][0]["status"] == "compared"


def test_source_revocation_blocks_inflight_product_task(client):
    register(client, "撤回负责人", "task-revoke@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "撤回测试团队"})
    worker, case, source_ids, detail = build_refund_learning_case(client)
    mark = issue_refund_mark(client, worker["id"], detail["experiences"])
    task = client.post("/api/product/tasks", json={
        "title": "进行中的退款例外",
        "goal": "验证来源撤回能阻止正在进行的数字员工任务",
        "expected_output": "只读分流建议",
        "required_capabilities": ["退款例外分流"],
        "risk_level": "low",
    }).json()
    client.post(f"/api/product/tasks/{task['id']}/claim", json={
        "worker_id": worker["id"],
        "capability_mark_id": mark["id"],
        "rationale": "使用有效印记开始只读分析",
    })

    revoked = client.post(
        f"/api/product/cases/{case['id']}/sources/{source_ids[1]}/revoke").json()
    assert revoked["impact"]["tasks"] == 1
    blocked = client.get(f"/api/product/tasks/{task['id']}").json()
    assert blocked["status"] == "blocked"
    assert blocked["blocked_reason"] == "capability_source_revoked"
    assert blocked["impacted_member_ids"] == [worker["id"]]
    assert blocked["updates"][0]["author_worker_id"] == "system"
    assert blocked["updates"][0]["update_type"] == "blocker"


def test_task_assessment_explains_eligibility_and_auto_claims_atomically(client):
    register(client, "自动接单负责人", "assessment@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "自动接单团队"})
    worker, case, source_ids, detail = build_refund_learning_case(client)
    mark = issue_refund_mark(client, worker["id"], detail["experiences"])
    task = client.post("/api/product/tasks", json={
        "title": "评估退款政策例外",
        "goal": "依据已有证据判断例外是否需要升级真人",
        "expected_output": "带证据的只读分流建议",
        "required_capabilities": ["退款例外分流"],
        "risk_level": "low",
    }).json()

    result = client.post(f"/api/product/tasks/{task['id']}/assess")
    assert result.status_code == 200, result.text
    eligible = next(item for item in result.json()["assessments"]
                    if item["worker_id"] == worker["id"])
    assert eligible["can_claim"] is True
    assert eligible["covered_capabilities"] == ["退款例外分流"]
    assert eligible["missing_capabilities"] == []
    assert eligible["matching_mark_ids"] == [mark["id"]]
    assert "执行退款" in eligible["forbidden_actions"]

    claimed = client.post(f"/api/product/tasks/{task['id']}/auto-claim", json={
        "assessment_id": eligible["id"],
    })
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["members"][0]["worker_id"] == worker["id"]
    assert claimed.json()["members"][0]["assessment_id"] == eligible["id"]

    repeated = client.post(f"/api/product/tasks/{task['id']}/auto-claim", json={
        "assessment_id": eligible["id"],
    })
    assert repeated.status_code == 409


def test_shadow_comparison_updates_capability_once_and_exposes_evidence(client):
    register(client, "能力校准负责人", "calibration@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "能力校准团队"})
    worker, _, _, detail = build_refund_learning_case(client)
    mark = issue_refund_mark(client, worker["id"], detail["experiences"])
    task = client.post("/api/product/tasks", json={
        "title": "影子处理退款例外",
        "goal": "对照数字员工建议与真人实际处置结果",
        "expected_output": "带证据的退款例外分流建议",
        "required_capabilities": ["退款例外分流"],
        "risk_level": "low",
    }).json()
    assessment = client.post(
        f"/api/product/tasks/{task['id']}/assess").json()["assessments"][0]
    client.post(f"/api/product/tasks/{task['id']}/auto-claim", json={
        "assessment_id": assessment["id"],
    })
    update = client.post(f"/api/product/tasks/{task['id']}/updates", json={
        "update_type": "result",
        "summary": "政策未覆盖该例外，引用工单证据后建议升级真人审批。",
        "author_worker_id": worker["id"],
        "evidence_refs": [detail["events"][0]["id"]],
    })
    assert update.status_code == 201, update.text
    comparison = client.post(f"/api/product/tasks/{task['id']}/outcomes", json={
        "decision": "accepted",
        "actual_result": "真人依据相同工单证据升级审批，没有自动承诺或执行退款。",
        "summary": "判断和边界一致，结果可直接采用。",
    })
    assert comparison.status_code == 201, comparison.text
    payload = comparison.json()
    assert payload["digital_result"].startswith("政策未覆盖")
    assert payload["actual_result"].startswith("真人依据")
    assert payload["dimensions"]["evidence_grounding"]["score"] == 100
    assert payload["dimensions"]["boundary_safety"]["score"] == 100

    workspace = client.get("/api/product/workspace").json()
    calibrated = next(item for item in workspace["capability_marks"]
                      if item["id"] == mark["id"])
    assert calibrated["sample_count"] == 2
    assert calibrated["accepted_count"] == 1
    assert len(workspace["capability_evidence"]) == 1
    assert workspace["capability_evidence"][0]["evidence_type"] == "verified_delivery"

    repeated = client.post(f"/api/product/tasks/{task['id']}/outcomes", json={
        "decision": "accepted",
        "actual_result": "重复提交不应被采纳。",
        "summary": "重复提交。",
    })
    assert repeated.status_code == 409
    workspace = client.get("/api/product/workspace").json()
    calibrated = next(item for item in workspace["capability_marks"]
                      if item["id"] == mark["id"])
    assert calibrated["sample_count"] == 2
    assert len(workspace["capability_evidence"]) == 1


def test_repeated_takeover_suspends_capability_mark(client):
    register(client, "接管校准负责人", "takeover@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "接管校准团队"})
    worker, _, _, detail = build_refund_learning_case(client)
    mark = issue_refund_mark(client, worker["id"], detail["experiences"])

    for index in range(2):
        task = client.post("/api/product/tasks", json={
            "title": f"需接管的退款例外 {index + 1}",
            "goal": "验证连续真人接管会暂停数字员工能力",
            "expected_output": "带证据的只读建议",
            "required_capabilities": ["退款例外分流"],
            "risk_level": "low",
        }).json()
        claimed = client.post(f"/api/product/tasks/{task['id']}/claim", json={
            "worker_id": worker["id"],
            "capability_mark_id": mark["id"],
            "rationale": "使用当前有效能力进入影子执行",
        })
        assert claimed.status_code == 200, claimed.text
        client.post(f"/api/product/tasks/{task['id']}/updates", json={
            "update_type": "result",
            "summary": "证据不足但仍建议直接继续处理。",
            "author_worker_id": worker["id"],
            "evidence_refs": [],
        })
        result = client.post(f"/api/product/tasks/{task['id']}/outcomes", json={
            "decision": "taken_over",
            "actual_result": "真人发现证据不足，停止自动判断并接管处理。",
            "summary": "数字员工未识别证据缺口，需要补学。",
        })
        assert result.status_code == 201, result.text

    workspace = client.get("/api/product/workspace").json()
    calibrated = next(item for item in workspace["capability_marks"]
                      if item["id"] == mark["id"])
    assert calibrated["takeover_count"] == 2
    assert calibrated["status"] == "suspended"
    assert calibrated["suspension_reason"] == "repeated_human_takeover"


def test_engine_proposes_minimum_team_and_third_member_creates_task_group(client):
    register(client, "自动组队负责人", "auto-team@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "自动组队团队"})
    first_worker, _, _, detail = build_refund_learning_case(client)
    human_id = client.get("/api/product/workspace").json()["people"][0]["id"]
    workers = [first_worker]
    for name, goal in (
        ("小证", "核查证据完整性"),
        ("小险", "编写风险说明"),
    ):
        workers.append(client.post("/api/product/workers", json={
            "name": name, "role_goal": goal, "mentor_ids": [human_id],
        }).json())
    capabilities = ["退款例外分流", "证据核查", "风险说明"]
    marks = [
        issue_refund_mark(
            client, worker["id"], detail["experiences"], capability)
        for worker, capability in zip(workers, capabilities)
    ]
    task = client.post("/api/product/tasks", json={
        "title": "三能力退款例外复核",
        "goal": "同时完成退款分流、证据核查和风险说明",
        "expected_output": "有证据和风险边界的分流建议",
        "required_capabilities": capabilities,
        "risk_level": "low",
    }).json()

    manual = client.post(f"/api/product/tasks/{task['id']}/claim", json={
        "worker_id": workers[0]["id"],
        "capability_mark_id": marks[0]["id"],
        "rationale": "单人尝试认领多能力任务",
    })
    assert manual.status_code == 409
    assert "证据核查" in manual.json()["detail"]

    assessed = client.post(
        f"/api/product/tasks/{task['id']}/assess").json()
    assert not any(item["can_claim"] for item in assessed["assessments"])
    assert len(assessed["team_proposals"]) == 1
    proposal = assessed["team_proposals"][0]
    assert proposal["creates_task_team"] is True
    assert len(proposal["members"]) == 3
    assert set(proposal["covered_capabilities"]) == set(capabilities)
    responsibilities = {
        item["worker_id"]: item["capabilities"][0]
        for item in proposal["members"]
    }
    assert responsibilities == {
        worker["id"]: capability
        for worker, capability in zip(workers, capabilities)
    }

    started = client.post(f"/api/product/tasks/{task['id']}/auto-team", json={
        "proposal_id": proposal["id"],
    })
    assert started.status_code == 200, started.text
    payload = started.json()
    assert payload["status"] == "working"
    assert len(payload["members"]) == 3
    assert payload["team_id"]
    assert payload["id"] == task["id"]
    assert {item["capability_name"] for item in payload["members"]} == set(capabilities)

    repeated = client.post(f"/api/product/tasks/{task['id']}/auto-team", json={
        "proposal_id": proposal["id"],
    })
    assert repeated.status_code == 409


def test_mid_task_help_request_suggests_qualified_helper_and_third_creates_group(client):
    register(client, "动态求助负责人", "dynamic-help@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "动态求助团队"})
    first_worker, _, _, detail = build_refund_learning_case(client)
    human_id = client.get("/api/product/workspace").json()["people"][0]["id"]
    second = client.post("/api/product/workers", json={
        "name": "小审", "role_goal": "协作核对退款政策",
        "mentor_ids": [human_id],
    }).json()
    helper = client.post("/api/product/workers", json={
        "name": "小险", "role_goal": "补充风险说明",
        "mentor_ids": [human_id],
    }).json()
    first_mark = issue_refund_mark(
        client, first_worker["id"], detail["experiences"])
    second_mark = issue_refund_mark(
        client, second["id"], detail["experiences"])
    helper_mark = issue_refund_mark(
        client, helper["id"], detail["experiences"], "风险说明")
    task = client.post("/api/product/tasks", json={
        "title": "执行中发现风险说明缺口",
        "goal": "验证数字员工能在执行中请求新的能力补位",
        "expected_output": "退款分流和风险说明",
        "required_capabilities": ["退款例外分流"],
        "risk_level": "low",
    }).json()
    client.post(f"/api/product/tasks/{task['id']}/claim", json={
        "worker_id": first_worker["id"],
        "capability_mark_id": first_mark["id"],
        "rationale": "先独立开始退款分流",
    })
    client.post(f"/api/product/tasks/{task['id']}/invite", json={
        "worker_id": second["id"],
        "capability_mark_id": second_mark["id"],
        "rationale": "交叉核对退款政策",
        "invited_by_worker_id": first_worker["id"],
    })
    request = client.post(f"/api/product/tasks/{task['id']}/updates", json={
        "update_type": "help_request",
        "summary": "执行中发现还需要风险说明能力",
        "author_worker_id": first_worker["id"],
        "evidence_refs": [],
        "performed_actions": [],
        "missing_capabilities": ["风险说明"],
    })
    assert request.status_code == 201, request.text
    assert request.json()["helper_suggestion_ids"]
    workspace = client.get("/api/product/workspace").json()
    suggestions = workspace["helper_suggestions"]
    assert len(suggestions) == 1
    assert suggestions[0]["worker_id"] == helper["id"]
    assert suggestions[0]["capability_mark_ids"] == [helper_mark["id"]]
    assert suggestions[0]["missing_capabilities"] == []

    joined = client.post(f"/api/product/tasks/{task['id']}/auto-invite", json={
        "suggestion_id": suggestions[0]["id"],
    })
    assert joined.status_code == 200, joined.text
    payload = joined.json()
    assert len(payload["members"]) == 3
    assert payload["team_id"]
    assert payload["members"][2]["worker_id"] == helper["id"]
    assert payload["members"][2]["helper_suggestion_id"] == suggestions[0]["id"]

    repeated = client.post(f"/api/product/tasks/{task['id']}/auto-invite", json={
        "suggestion_id": suggestions[0]["id"],
    })
    assert repeated.status_code == 409


def test_versioned_deliverable_requires_real_citations_review_and_specific_acceptance(
        client):
    register(client, "成果负责人", "deliverable@example.local")
    client.post("/api/product/bootstrap", json={"organization_name": "成果版本团队"})
    worker, case, source_ids, detail = build_refund_learning_case(client)
    mark = issue_refund_mark(
        client, worker["id"], detail["experiences"])
    task = client.post("/api/product/tasks", json={
        "title": "交付退款例外复核结果",
        "goal": "验证成果版本、独立评审和指定版本验收",
        "expected_output": "带证据的退款分流建议与风险说明",
        "required_capabilities": ["退款例外分流"],
        "risk_level": "low",
    }).json()
    client.post(f"/api/product/tasks/{task['id']}/claim", json={
        "worker_id": worker["id"],
        "capability_mark_id": mark["id"],
        "rationale": "使用有效能力印记提交正式成果",
    })

    first = client.post(f"/api/product/tasks/{task['id']}/deliverables", json={
        "title": "退款例外复核结果",
        "content": "政策未覆盖该退款例外，建议升级真人审批并保留风险说明。",
        "author_worker_id": worker["id"],
        "citation_refs": ["invented://not-a-real-source"],
        "performed_actions": [],
        "change_summary": "",
    })
    assert first.status_code == 201, first.text
    first_payload = first.json()
    assert first_payload["deliverable"]["version"] == 1
    assert first_payload["deliverable"]["status"] == "revision_required"
    assert first_payload["review"]["verdict"] == "revision_required"
    assert first_payload["review"]["checks"]["citations_present"]["passed"] is False
    assert first_payload["deliverable"]["invalid_citation_refs"] == [
        "invented://not-a-real-source"]

    forbidden_acceptance = client.post(
        f"/api/product/tasks/{task['id']}/outcomes", json={
            "decision": "accepted",
            "actual_result": "真人最终也升级审批。",
            "summary": "尝试绕过独立评审。",
            "deliverable_id": first_payload["deliverable"]["id"],
        })
    assert forbidden_acceptance.status_code == 409
    assert "独立评审" in forbidden_acceptance.json()["detail"]

    second = client.post(f"/api/product/tasks/{task['id']}/deliverables", json={
        "title": "退款例外复核结果",
        "content": "带证据的退款分流建议与风险说明：政策未覆盖该例外，"
                   "不得自动承诺退款，建议保留证据并升级真人审批。",
        "author_worker_id": worker["id"],
        "citation_refs": [detail["events"][0]["id"]],
        "performed_actions": [],
        "change_summary": "替换伪造引用，补充真实工作事件与能力边界。",
    })
    assert second.status_code == 201, second.text
    second_payload = second.json()
    assert second_payload["deliverable"]["version"] == 2
    assert second_payload["deliverable"]["previous_deliverable_id"] == (
        first_payload["deliverable"]["id"])
    assert second_payload["review"]["verdict"] == "approved"
    assert second_payload["review"]["score"] == 100

    detail_payload = client.get(
        f"/api/product/tasks/{task['id']}").json()
    assert [item["version"] for item in detail_payload["deliverables"]] == [1, 2]
    assert len(detail_payload["deliverable_reviews"]) == 2

    accepted = client.post(f"/api/product/tasks/{task['id']}/outcomes", json={
        "decision": "accepted",
        "actual_result": "真人基于相同证据升级审批，未自动执行退款。",
        "summary": "v2 证据、边界和最终处置一致。",
        "deliverable_id": second_payload["deliverable"]["id"],
    })
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["deliverable_id"] == second_payload["deliverable"]["id"]
    assert accepted.json()["deliverable_version"] == 2
    final = client.get(f"/api/product/tasks/{task['id']}").json()
    assert final["status"] == "accepted"
    versions = {item["version"]: item for item in final["deliverables"]}
    assert versions[1]["status"] == "revision_required"
    assert versions[2]["status"] == "accepted"

    revoked = client.post(
        f"/api/product/cases/{case['id']}/sources/{source_ids[0]}/revoke")
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["impact"]["deliverables"] == 1
    affected = client.get(f"/api/product/tasks/{task['id']}").json()
    assert affected["deliverable_validity"] == "needs_review"
    assert affected["deliverable_affected_by"] == [source_ids[0]]
    affected_versions = {
        item["version"]: item for item in affected["deliverables"]}
    assert affected_versions[2]["status"] == "source_revoked"
