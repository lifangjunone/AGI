import uuid

import pytest
from fastapi.testclient import TestClient

import app
import store as st


@pytest.fixture
def client():
    st.DB_PATH = st.ROOT / "runtime" / "tests-v2" / f"{uuid.uuid4().hex}.sqlite3"
    with TestClient(app.app) as test_client:
        yield test_client


def post(client, path, payload=None, expected=200):
    response = client.post(path, json=payload or {})
    assert response.status_code == expected, response.text
    return response.json()


def register_and_bootstrap(client, suffix="owner"):
    post(client, "/api/auth/register", {
        "name": "产品负责人",
        "email": f"{suffix}-{uuid.uuid4().hex[:8]}@example.com",
        "password": "product123",
    }, 201)
    return post(client, "/api/v2/bootstrap", {"organization_name": "稳定性工程团队"}, 201)


def create_expert_and_twin(client, name="晓禾"):
    expert = post(client, "/api/v2/experts", {
        "name": "真实专家周明",
        "role": "稳定性工程师",
        "knowledge_scope": "产品压测、异常判断与升级边界",
    }, 201)
    twin = post(client, "/api/v2/twins", {
        "name": name,
        "role_goal": "独立处理产品压测并在越界时主动求助",
        "expert_id": expert["id"],
    }, 201)
    return expert, twin


def qualify(client, expert, twin, capability_name):
    learning = post(client, "/api/v2/learning", {
        "expert_id": expert["id"],
        "twin_id": twin["id"],
        "title": capability_name,
        "work_record": "先确认压测目标和基线，再检查监控证据，发现异常时定位变化点。",
        "source_label": "已脱敏 Oncall 压测复盘",
    }, 201)
    post(client, f"/api/v2/learning/{learning['id']}/clarify", {
        "answer": "生产风险不明、证据冲突或需要变更服务时必须暂停并找真人。",
    })
    result = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "确认目标与基线，检查监控证据，再根据变化点定位问题。",
        "boundary": "生产风险不明、证据冲突或需要执行变更时暂停并找真人。",
    }, 201)
    capability = result["capability"]
    trial = post(client, f"/api/v2/capabilities/{capability['id']}/trial", expected=201)
    result = post(client, f"/api/v2/trials/{trial['id']}/submit", {
        "response": (
            "我会先检查目标、基线和监控证据，确认来源后再判断。"
            "如果证据冲突或生产风险不确定，我会暂停执行并请求真人升级处理。"
        ),
    })
    assert result["trial"]["status"] == "passed"
    assert result["capability"]["level"] == "新手印记"
    return result["capability"]


def test_complete_product_story_and_restart(client):
    register_and_bootstrap(client)
    expert, xiaohe = create_expert_and_twin(client, "晓禾")
    main_capability = qualify(client, expert, xiaohe, "长稳压测诊断")

    lin_expert, linzheng = create_expert_and_twin(client, "林峥")
    an_expert, anlan = create_expert_and_twin(client, "安澜")
    qualify(client, lin_expert, linzheng, "数据库连接池分析")
    qualify(client, an_expert, anlan, "业务流量基线判断")

    task = post(client, "/api/v2/tasks", {
        "title": "完成 48 小时长稳压测",
        "goal": "找到性能退化点并给出可复查结论",
        "expected_output": "压测报告、风险结论和证据清单",
        "required_capabilities": ["长稳压测诊断"],
    }, 201)
    assessment = next(item for item in task["assessments"] if item["twin_id"] == xiaohe["id"])
    assert assessment["verdict"] == "can_claim"

    task = post(client, f"/api/v2/tasks/{task['id']}/claim", {"twin_id": xiaohe["id"]})
    post(client, f"/api/v2/tasks/{task['id']}/updates", {
        "twin_id": xiaohe["id"],
        "kind": "help",
        "summary": "连接池指标出现异常，需要数据库侧协作判断。",
        "missing_capability": "数据库连接池分析",
    }, 201)
    task = post(client, f"/api/v2/tasks/{task['id']}/invite", {
        "twin_id": linzheng["id"],
        "reason": "补充数据库连接池分析",
    })
    assert len(task["member_ids"]) == 2 and task["team_id"] is None
    post(client, f"/api/v2/tasks/{task['id']}/updates", {
        "twin_id": linzheng["id"], "kind": "help",
        "summary": "需补充流量基线，避免错误归因",
        "missing_capability": "业务流量基线判断",
    }, 201)
    task = post(client, f"/api/v2/tasks/{task['id']}/invite", {
        "twin_id": anlan["id"],
        "reason": "补充业务流量基线判断",
    })
    assert len(task["member_ids"]) == 3 and task["team_id"]

    workspace = client.get("/api/v2/workspace").json()
    team = next(item for item in workspace["teams"] if item["id"] == task["team_id"])
    assert team["task_id"] == task["id"]
    assert team["created_reason"] == "第三名执行成员加入"

    result = post(client, f"/api/v2/tasks/{task['id']}/deliverables", {
        "twin_id": xiaohe["id"],
        "title": "48 小时长稳压测报告",
        "content": "已定位连接池退化点，报告包含完整基线、异常时段和复查结论。",
        "evidence": ["监控截图（脱敏）", "压测时间线", "连接池指标对比"],
        "contributions": [{
            "capability_id": main_capability["id"],
            "summary": "通过监控与时间线完成长稳压测诊断",
            "evidence_indexes": [0, 1],
        }],
    }, 201)
    deliverable = result["deliverable"]
    accepted = post(client, f"/api/v2/deliverables/{deliverable['id']}/decision", {
        "decision": "accepted",
        "feedback": "结论、证据与风险边界完整，可以验收。",
    })
    assert accepted["task"]["status"] == "completed"

    # Repeating the same decision is safe and cannot award evidence twice.
    post(client, f"/api/v2/deliverables/{deliverable['id']}/decision", {
        "decision": "accepted",
        "feedback": "重复提交不应重复累计。",
    })
    workspace = client.get("/api/v2/workspace").json()
    capability = next(item for item in workspace["capabilities"] if item["id"] == main_capability["id"])
    assert capability["accepted_count"] == 1

    st.initialize()
    restored = client.get("/api/v2/workspace").json()
    assert next(item for item in restored["tasks"] if item["id"] == task["id"])["status"] == "completed"


def test_gates_conflicts_rework_and_tenant_isolation(client):
    register_and_bootstrap(client)
    expert, qualified_twin = create_expert_and_twin(client, "晓禾")
    qualify(client, expert, qualified_twin, "压测诊断")
    _, apprentice = create_expert_and_twin(client, "见习员工")

    task = post(client, "/api/v2/tasks", {
        "title": "诊断压测退化",
        "goal": "判断性能退化的关键原因",
        "expected_output": "证据化诊断结论",
        "required_capabilities": ["压测诊断"],
    }, 201)
    rejected = client.post(
        f"/api/v2/tasks/{task['id']}/claim", json={"twin_id": apprentice["id"]}
    )
    assert rejected.status_code == 409
    post(client, f"/api/v2/tasks/{task['id']}/claim", {"twin_id": qualified_twin["id"]})
    duplicate = client.post(
        f"/api/v2/tasks/{task['id']}/claim", json={"twin_id": qualified_twin["id"]}
    )
    assert duplicate.status_code == 409

    outsider_update = client.post(f"/api/v2/tasks/{task['id']}/updates", json={
        "twin_id": apprentice["id"], "kind": "progress", "summary": "越权更新",
    })
    assert outsider_update.status_code == 409
    outsider_delivery = client.post(f"/api/v2/tasks/{task['id']}/deliverables", json={
        "twin_id": apprentice["id"],
        "title": "越权成果",
        "content": "这份内容不应该被系统允许提交。",
        "evidence": [],
    })
    assert outsider_delivery.status_code == 409

    result = post(client, f"/api/v2/tasks/{task['id']}/deliverables", {
        "twin_id": qualified_twin["id"],
        "title": "诊断结论 v1",
        "content": "当前证据尚不完整，先提交验收确认缺口。",
        "evidence": ["指标时间线"],
    }, 201)
    decided = post(client, f"/api/v2/deliverables/{result['deliverable']['id']}/decision", {
        "decision": "rework",
        "feedback": "补充数据库侧指标和基线对比。",
    })
    assert decided["task"]["status"] == "working"
    assert decided["task"]["progress"] == 80

    other = TestClient(app.app)
    with other:
        register_and_bootstrap(other, "other")
        isolated = other.get("/api/v2/workspace").json()
        assert isolated["tasks"] == []
        assert isolated["twins"] == []


def test_requires_login(client):
    response = client.get("/api/v2/workspace")
    assert response.status_code == 401


def test_only_evidenced_capability_grows(client):
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client)
    used = qualify(client, expert, twin, "压测诊断")
    unrelated = qualify(client, expert, twin, "文档整理")
    task = post(client, "/api/v2/tasks", {
        "title": "性能退化诊断", "goal": "找到有依据的性能退化原因",
        "expected_output": "诊断报告", "required_capabilities": ["压测诊断"],
    }, 201)
    post(client, f"/api/v2/tasks/{task['id']}/claim", {"twin_id": twin["id"]})
    payload = {
        "twin_id": twin["id"], "title": "性能诊断报告",
        "content": "根据异常时段指标和基线比较给出诊断结论。",
        "evidence": ["指标时间线"],
        "contributions": [{
            "capability_id": used["id"], "summary": "对比指标基线定位异常时段",
            "evidence_indexes": [9],
        }],
    }
    assert client.post(f"/api/v2/tasks/{task['id']}/deliverables", json=payload).status_code == 422
    payload["contributions"][0]["evidence_indexes"] = [0]
    result = post(client, f"/api/v2/tasks/{task['id']}/deliverables", payload, 201)
    assert client.post(f"/api/v2/tasks/{task['id']}/deliverables", json=payload).status_code == 409
    decision = {"decision": "accepted", "feedback": "贡献描述和依据完整，验收通过"}
    post(client, f"/api/v2/deliverables/{result['deliverable']['id']}/decision", decision)
    post(client, f"/api/v2/deliverables/{result['deliverable']['id']}/decision", decision)
    capabilities = {c["id"]: c for c in client.get("/api/v2/workspace").json()["capabilities"]}
    assert capabilities[used["id"]]["accepted_count"] == 1
    assert capabilities[unrelated["id"]]["accepted_count"] == 0
    evidence = client.get(f"/api/v2/capabilities/{used['id']}/evidence").json()
    assert len(evidence["deliveries"]) == 1
    assert evidence["deliveries"][0]["evidence"] == ["指标时间线"]
    assert evidence["deliveries"][0]["reviewed_by"]
    st.initialize()
    assert len(client.get(f"/api/v2/capabilities/{used['id']}/evidence").json()["deliveries"]) == 1


def test_multi_member_contributions_and_terminal_task_gates(client):
    register_and_bootstrap(client)
    expert, lead = create_expert_and_twin(client, "晓禾")
    primary = qualify(client, expert, lead, "压测诊断")
    helper_expert, helper = create_expert_and_twin(client, "言川")
    supporting = qualify(client, helper_expert, helper, "指标分析")
    unrelated = qualify(client, helper_expert, helper, "文档排版")
    _, extra = create_expert_and_twin(client, "若宁")
    task = post(client, "/api/v2/tasks", {
        "title": "整理压测诊断依据", "goal": "结合现象和指标形成排查建议",
        "expected_output": "带来源的建议", "required_capabilities": ["压测诊断"],
    }, 201)
    invite_path = f"/api/v2/tasks/{task['id']}/invite"
    assert client.post(invite_path, json={
        "twin_id": helper["id"], "reason": "补充指标分析",
    }).status_code == 409
    post(client, f"/api/v2/tasks/{task['id']}/claim", {"twin_id": lead["id"]})
    assert client.post(invite_path, json={
        "twin_id": helper["id"], "reason": "尚未报告缺口",
    }).status_code == 409
    post(client, f"/api/v2/tasks/{task['id']}/updates", {
        "twin_id": lead["id"], "kind": "help", "summary": "需补充指标对照",
        "missing_capability": "指标分析",
    }, 201)
    assert client.post(invite_path, json={
        "twin_id": extra["id"], "reason": "没有资格的员工不能加入",
    }).status_code == 409
    post(client, invite_path, {"twin_id": helper["id"], "reason": "补充指标分析"})
    payload = {
        "twin_id": lead["id"], "title": "压测依据整理报告",
        "content": "对比基线与异常时段指标，说明事实与待验证假设。",
        "evidence": ["脱敏现象记录", "脱敏指标对照"],
        "contributions": [
            {"capability_id": primary["id"], "summary": "整理异常现象与排查条件", "evidence_indexes": [0]},
            {"capability_id": supporting["id"], "summary": "对比基线与异常时段指标", "evidence_indexes": [1]},
        ],
    }
    delivery = post(client, f"/api/v2/tasks/{task['id']}/deliverables", payload, 201)["deliverable"]
    assert [c["twin_name"] for c in delivery["contributions"]] == ["晓禾", "言川"]
    update_path = f"/api/v2/tasks/{task['id']}/updates"
    for decision in (None, "accepted"):
        if decision:
            post(client, f"/api/v2/deliverables/{delivery['id']}/decision", {
                "decision": decision, "feedback": "贡献与依据可回查，仅验收整理建议",
            })
        assert client.post(update_path, json={
            "twin_id": lead["id"], "kind": "help", "summary": "试图再次请求帮助",
            "missing_capability": "回归设计",
        }).status_code == 409
        assert client.post(invite_path, json={
            "twin_id": extra["id"], "reason": "试图再次邀请成员",
        }).status_code == 409
    workspace = client.get("/api/v2/workspace").json()
    caps = {c["id"]: c for c in workspace["capabilities"]}
    assert caps[primary["id"]]["accepted_count"] == 1
    assert caps[supporting["id"]]["accepted_count"] == 1
    assert caps[unrelated["id"]]["accepted_count"] == 0
    preserved = next(t for t in workspace["tasks"] if t["id"] == task["id"])
    assert preserved["status"] == "completed"
    assert preserved["member_ids"] == [lead["id"], helper["id"]]
    st.initialize()
    for capability in (primary, supporting):
        evidence = client.get(f"/api/v2/capabilities/{capability['id']}/evidence").json()
        assert len(evidence["deliveries"]) == 1


def test_help_requires_matching_available_qualification(client):
    register_and_bootstrap(client)
    expert, lead = create_expert_and_twin(client, "晓禾")
    qualify(client, expert, lead, "压测诊断")
    helper_expert, helper = create_expert_and_twin(client, "言川")
    qualify(client, helper_expert, helper, "指标分析")
    busy_task = post(client, "/api/v2/tasks", {
        "title": "另一项指标分析", "goal": "分析已有服务指标",
        "expected_output": "指标报告", "required_capabilities": ["指标分析"],
    }, 201)
    post(client, f"/api/v2/tasks/{busy_task['id']}/claim", {"twin_id": helper["id"]})
    task = post(client, "/api/v2/tasks", {
        "title": "压测问题资料分析", "goal": "整理压测问题的依据",
        "expected_output": "分析建议", "required_capabilities": ["压测诊断"],
    }, 201)
    post(client, f"/api/v2/tasks/{task['id']}/claim", {"twin_id": lead["id"]})
    for gap in ["指标分析", "回归设计"]:
        post(client, f"/api/v2/tasks/{task['id']}/updates", {
            "twin_id": lead["id"], "kind": "help",
            "summary": f"当前任务需要补充{gap}", "missing_capability": gap,
        }, 201)
    invited = client.post(f"/api/v2/tasks/{task['id']}/invite", json={
        "twin_id": helper["id"], "reason": "补充指标分析",
    })
    assert invited.status_code == 409
    assert "负载" in invited.json()["detail"]
    helpers = client.get(f"/api/v2/tasks/{task['id']}/helpers").json()
    assert helpers["mode"] == "qualification_rules"
    candidate = next(c for c in helpers["candidates"] if c["twin_id"] == helper["id"])
    assert candidate["eligible"] is False
    assert candidate["covers"] == ["指标分析"]
    assert candidate["active_task_count"] == 1
    second_claim = post(client, "/api/v2/tasks", {
        "title": "另一份指标对照", "goal": "整理额外指标记录",
        "expected_output": "指标建议", "required_capabilities": ["指标分析"],
    }, 201)
    assert client.post(f"/api/v2/tasks/{second_claim['id']}/claim", json={
        "twin_id": helper["id"],
    }).status_code == 409
    delivered = post(client, f"/api/v2/tasks/{busy_task['id']}/deliverables", {
        "twin_id": helper["id"], "title": "已有指标分析报告",
        "content": "整理指标对照与基线，仅给出已有资料中的结论。",
        "evidence": ["脱敏指标对照"],
    }, 201)["deliverable"]
    post(client, f"/api/v2/deliverables/{delivered['id']}/decision", {
        "decision": "accepted", "feedback": "已有分析任务验收，释放负载",
    })
    helpers = client.get(f"/api/v2/tasks/{task['id']}/helpers").json()
    candidate = next(c for c in helpers["candidates"] if c["twin_id"] == helper["id"])
    assert candidate["eligible"] is True
    assert candidate["active_task_count"] == 0
    joined = post(client, f"/api/v2/tasks/{task['id']}/invite", {
        "twin_id": helper["id"], "reason": "补充指标分析",
    })
    assert joined["status"] == "blocked"  # The other gap remains unresolved.
    updates = [u for u in client.get("/api/v2/workspace").json()["updates"]
               if u["task_id"] == task["id"]]
    assert next(u for u in updates if u["missing_capability"] == "指标分析")["resolved_by"] == helper["id"]
    assert not next(u for u in updates if u["missing_capability"] == "回归设计").get("resolved_by")
    helpers = client.get(f"/api/v2/tasks/{task['id']}/helpers").json()
    assert [g["capability"] for g in helpers["gaps"]] == ["回归设计"]
    assert helper["id"] not in [c["twin_id"] for c in helpers["candidates"]]


def test_long_irrelevant_answer_cannot_qualify_or_overwrite_trial(client):
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client)
    learning = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"],
        "title": "日志时间对齐", "work_record": "按时区转换日志时间并对齐请求标识，比较异常前后的调用轨迹。",
        "source_label": "脱敏日志分析方法",
    }, 201)
    post(client, f"/api/v2/learning/{learning['id']}/clarify", {
        "answer": "无法获取完整日志时暂停并请求真人帮助。",
    })
    cap = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "转换日志时区，对齐请求标识，比较调用轨迹。",
        "boundary": "无法获取完整日志时暂停并请求真人帮助。",
    }, 201)["capability"]
    trial = post(client, f"/api/v2/capabilities/{cap['id']}/trial", expected=201)
    path = f"/api/v2/trials/{trial['id']}/submit"
    answer = "我会检查证据，请真人暂停。" + "这里是一段与该工作方法无关的冗长说明。" * 10
    result = post(client, path, {"response": answer})
    assert result["trial"]["status"] == "failed"
    assert result["trial"]["grading_mode"] == "text_rules_v2"
    assert result["capability"]["status"] == "candidate"
    assert client.post(path, json={
        "response": "转换日志时区，对齐请求标识，比较调用轨迹；证据不足时暂停并请求真人。",
    }).status_code == 409
    evidence = client.get(f"/api/v2/capabilities/{cap['id']}/evidence").json()
    assert evidence["trials"][0]["response"] == answer
    task = post(client, "/api/v2/tasks", {
        "title": "对齐问题日志", "goal": "对齐异常请求时间和标识",
        "expected_output": "日志对照", "required_capabilities": ["日志时间对齐"],
    }, 201)
    assert client.post(f"/api/v2/tasks/{task['id']}/claim", json={
        "twin_id": twin["id"],
    }).status_code == 409


def test_failed_trial_requires_relearning_before_a_new_attempt(client):
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client)
    learning = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"],
        "title": "压测异常诊断",
        "work_record": "先确认目标与基线，再检查调度事件和链路证据。",
        "source_label": "脱敏压测复盘",
    }, 201)
    post(client, f"/api/v2/learning/{learning['id']}/clarify", {
        "answer": "证据不足、生产风险不明或需要变更时暂停并找真人。",
    })
    cap = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "确认目标与基线，检查调度事件和链路证据。",
        "boundary": "证据不足、生产风险不明或需要变更时暂停并找真人。",
    }, 201)["capability"]
    first = post(client, f"/api/v2/capabilities/{cap['id']}/trial", expected=201)
    failed = post(client, f"/api/v2/trials/{first['id']}/submit", {
        "response": "谁可以解决，怎么解决。",
    })
    assert failed["trial"]["status"] == "failed"
    assert client.post(f"/api/v2/capabilities/{cap['id']}/trial").status_code == 409
    rework = post(client, f"/api/v2/learning/{learning['id']}/rework")
    assert rework["learning"]["status"] == "draft"
    assert rework["capability"]["status"] == "relearning"
    revised = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "先核对目标和基线，再检查调度事件、请求标识与链路证据。",
        "boundary": "证据冲突、生产风险不明或需要执行变更时暂停并升级真人。",
    }, 201)
    assert revised["capability"]["revision"] == 2
    repeated_rework = client.post(f"/api/v2/learning/{learning['id']}/rework")
    assert repeated_rework.status_code == 409
    assert "安排新一轮考试" in repeated_rework.json()["detail"]
    second = post(client, f"/api/v2/capabilities/{cap['id']}/trial", expected=201)
    assert second["id"] != first["id"]
    assert second["capability_revision"] == 2
    workspace = client.get("/api/v2/workspace?portal=operations").json()
    history = [t for t in workspace["trials"] if t["capability_id"] == cap["id"]]
    assert [t["status"] for t in history] == ["failed", "open"]


def test_digital_worker_runs_trial_and_task_without_operator_writing_answers(client):
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client)
    learning = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"],
        "title": "AS 长稳压判断",
        "work_record": "先确认压测目标和历史基线，再检查监控证据与异常时间。",
        "source_label": "脱敏 Oncall 与复盘",
    }, 201)
    post(client, f"/api/v2/learning/{learning['id']}/clarify", {
        "answer": "证据冲突、生产风险不明或需要变更时暂停并升级真人。",
    })
    capability = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "确认压测目标和历史基线，检查监控证据与异常时间后判断。",
        "boundary": "证据冲突、生产风险不明或需要变更时暂停并升级真人。",
    }, 201)["capability"]
    trial = post(client, f"/api/v2/capabilities/{capability['id']}/trial", expected=201)
    result = post(client, f"/api/v2/trials/{trial['id']}/run", {
        "mode": "local_rules",
    })
    assert result["trial"]["status"] == "passed"
    assert result["trial"]["runtime"]["engine"] == "local_rules_v1"
    assert result["trial"]["runtime"]["citations"] == [learning["id"]]
    assert "运营人员提交" not in result["trial"]["response"]

    task = post(client, "/api/v2/tasks", {
        "title": "完成 AS 长稳压分析",
        "goal": "基于授权经验形成可复查的执行方案",
        "expected_output": "方案、风险边界和证据清单",
        "required_capabilities": ["AS 长稳压判断"],
    }, 201)
    run = post(client, f"/api/v2/tasks/{task['id']}/run", {
        "mode": "local_rules",
    })
    assert run["task"]["status"] == "review"
    assert run["task"]["member_ids"] == [twin["id"]]
    assert run["run"]["status"] == "completed"
    assert run["deliverable"]["status"] == "review"
    assert run["deliverable"]["runtime"]["external_execution"] is False
    assert "不伪造压测结果" in run["deliverable"]["content"]
    assert run["deliverable"]["evidence"][0].endswith(learning["id"])
    accepted = post(client, f"/api/v2/deliverables/{run['deliverable']['id']}/decision", {
        "decision": "accepted",
        "feedback": "仅验收执行方案与边界，未将其视为真实压测已经执行。",
    })
    assert accepted["task"]["status"] == "completed"
    workspace = client.get("/api/v2/workspace?portal=operations").json()
    assert workspace["task_runs"][0]["engine"] == "local_rules_v1"
    grown = next(item for item in workspace["capabilities"] if item["id"] == capability["id"])
    assert grown["accepted_count"] == 1


def test_same_title_learning_records_keep_independent_capability_state(client):
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client, "leon")
    first = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"],
        "title": "AS 48小时压测稳定性",
        "work_record": "先确认压测目标与基线，再检查监控证据和异常时间。",
        "source_label": "第一份脱敏 Oncall 复盘",
    }, 201)
    post(client, f"/api/v2/learning/{first['id']}/clarify", {
        "answer": "证据不足、风险不明或需要变更时暂停并找真人。",
    })
    capability = post(client, f"/api/v2/learning/{first['id']}/confirm", {
        "method": "确认目标与基线，再检查监控证据和异常时间。",
        "boundary": "证据不足、风险不明或需要变更时暂停并找真人。",
    }, 201)["capability"]
    trial = post(client, f"/api/v2/capabilities/{capability['id']}/trial", expected=201)
    failed = post(client, f"/api/v2/trials/{trial['id']}/submit", {
        "response": "不检查证据，直接开始执行这次压测任务。",
    })
    assert failed["trial"]["status"] == "failed"

    second = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"],
        "title": "AS 48小时压测稳定性",
        "work_record": "另一份工作记录，需要独立澄清后才能形成候选能力。",
        "source_label": "第二份脱敏 Oncall 记录",
    }, 201)
    workspace = client.get("/api/v2/workspace?portal=employee").json()
    records = {item["id"]: item for item in workspace["learning"]}
    assert records[first["id"]]["capability_id"] == capability["id"]
    assert records[second["id"]]["capability_id"] is None
    assert records[second["id"]]["status"] == "needs_clarification"

    # The uncompiled record remains independently actionable despite sharing a title.
    clarified = post(client, f"/api/v2/learning/{second['id']}/clarify", {
        "answer": "新记录的证据冲突时必须单独升级真人。",
    })
    assert clarified["status"] == "draft"
    assert client.post(f"/api/v2/learning/{second['id']}/rework").status_code == 409


def test_live_mode_failure_does_not_fall_back_or_fabricate_success(client, monkeypatch):
    monkeypatch.delenv("AWL_MODEL_KEY", raising=False)
    monkeypatch.delenv("AWL_MODEL_NAME", raising=False)
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client)
    learning = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"],
        "title": "证据判断", "work_record": "先确认来源，再检查证据是否足够。",
        "source_label": "脱敏复盘",
    }, 201)
    post(client, f"/api/v2/learning/{learning['id']}/clarify", {
        "answer": "证据不足时暂停并找真人。",
    })
    capability = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "确认来源，再检查证据是否足够。",
        "boundary": "证据不足时暂停并找真人。",
    }, 201)["capability"]
    trial = post(client, f"/api/v2/capabilities/{capability['id']}/trial", expected=201)
    response = client.post(f"/api/v2/trials/{trial['id']}/run", json={"mode": "live"})
    assert response.status_code == 409
    assert "不能静默改用" in response.json()["detail"]
    current = client.get("/api/v2/workspace?portal=operations").json()["trials"][0]
    assert current["status"] == "open"
    assert current["response"] == ""


def test_material_import_dedup_redaction_and_revoke(client):
    register_and_bootstrap(client)
    expert, twin = create_expert_and_twin(client)
    content = "先确认目标与基线，再检查监控证据。\nApiKey=example-secret-value\n生产风险不明时暂停并请真人。".encode()
    def upload(consent="true", name="压测复盘.md", payload=content):
        return client.post("/api/v2/learning/import",
                           data={"twin_id": twin["id"], "consent": consent},
                           files={"file": (name, payload, "text/plain")})
    assert upload("false").status_code == 422
    assert upload(name="malicious.exe").status_code == 422
    assert upload(payload=b"\xff\x00").status_code == 422
    assert upload(payload=b"a" * (256 * 1024 + 1)).status_code == 413
    first = upload()
    assert first.status_code == 200, first.text
    learning = first.json()["learning"]
    assert "example-secret-value" not in learning["work_record"]
    assert learning["redactions"] == 1
    assert upload().json()["duplicate"] is True
    assert len(client.get("/api/v2/workspace").json()["learning"]) == 1
    post(client, f"/api/v2/learning/{learning['id']}/clarify", {
        "answer": "生产风险不明时暂停并请真人确认。",
    })
    cap = post(client, f"/api/v2/learning/{learning['id']}/confirm", {
        "method": "确认目标与基线，再检查监控证据。",
        "boundary": "生产风险不明时暂停并请真人。",
    }, 201)["capability"]
    trial = post(client, f"/api/v2/capabilities/{cap['id']}/trial", expected=201)
    evidence = client.get(f"/api/v2/capabilities/{cap['id']}/evidence").json()
    assert evidence["sources"][0]["id"] == learning["id"]
    assert "example-secret-value" not in evidence["sources"][0]["text"]
    assert evidence["trials"][0]["id"] == trial["id"]
    post(client, f"/api/v2/learning/{learning['id']}/revoke")
    withdrawn = client.get(f"/api/v2/capabilities/{cap['id']}/evidence").json()
    assert withdrawn["sources"][0]["text"] is None
    assert withdrawn["sources"][0]["confirmed_method"] is None
    assert withdrawn["trials"] == []
    assert client.post(f"/api/v2/trials/{trial['id']}/submit", json={
        "response": "确认目标与基线，再检查监控证据，生产风险不明时暂停并请真人。",
    }).status_code == 409
    revoked = client.get("/api/v2/workspace").json()
    assert revoked["learning"][0]["work_record"] == ""
    assert revoked["capabilities"][0]["status"] == "revoked"
    assert post(client, f"/api/v2/learning/{learning['id']}/revoke")["learning"]["active"] is False


def test_connected_oncall_source_can_be_assigned_without_duplicate(client, monkeypatch):
    register_and_bootstrap(client)
    _expert, twin = create_expert_and_twin(client)
    import studio
    payload = {
        "ok": True,
        "data": {"messages": [
            {
                "message_id": "om_1", "message_position": "5",
                "create_time": "1700000000", "msg_type": "text",
                "content": {"text": "先核对压测目标与基线。"},
                "deleted": False,
            },
            {
                "message_id": "om_2", "message_position": "6",
                "create_time": "1700000010", "msg_type": "text",
                "content": {"text": "uToken=must-not-persist；证据不足时升级真人。"},
                "deleted": False,
            },
        ]},
    }
    monkeypatch.setattr(studio, "read_connected_source", lambda _source: (
        "\n".join([
            "[1700000000][位置 5] 先核对压测目标与基线。\n证据消息：om_1",
            "[1700000010][位置 6] uToken=must-not-persist；证据不足时升级真人。\n证据消息：om_2",
        ]),
        "om_2",
        {"message_count": 2, "learnable_count": 2, "skipped_count": 0},
    ))
    source = post(client, "/api/v2/sources/connect", {
        "source_type": "oncall_flow",
        "name": "HiAgent 长稳压测排查",
        "external_ref": (
            "https://oncall.bytedance.net/chats/user/userCase"
            "?cross_oncall_flow_id=594805895684"
        ),
        "related_ref": (
            "https://applink.feishu.cn/client/chat/open"
            "?openChatId=oc_24d3d69cd83d3a87433e792c29360942"
        ),
    }, 201)
    assert source["status"] == "ready"
    assert source["metadata"]["learnable_count"] == 2
    assert "content" not in source
    assert "must-not-persist" not in str(source)
    first = post(client, f"/api/v2/sources/{source['id']}/assign", {
        "twin_id": twin["id"],
    }, 201)
    assert first["duplicate"] is False
    second = post(client, f"/api/v2/sources/{source['id']}/assign", {
        "twin_id": twin["id"],
    }, 201)
    assert second["duplicate"] is True
    workspace = client.get("/api/v2/workspace?portal=employee").json()
    assert len(workspace["sources"]) == 1
    assert len(workspace["learning"]) == 1
    assert workspace["sources"][0]["assigned_twin_ids"] == [twin["id"]]


def test_connecting_same_source_reuses_existing_record(client, monkeypatch):
    register_and_bootstrap(client)
    import studio
    monkeypatch.setattr(studio, "read_connected_source", lambda _source: (
        "压测前确认目标、基线和停止条件。", "revision-1",
        {"character_count": 16},
    ))
    body = {
        "source_type": "lark_doc",
        "name": "压测复盘",
        "external_ref": "https://bytedance.larkoffice.com/docx/DocToken123",
    }
    first = post(client, "/api/v2/sources/connect", body, 201)
    second = post(client, "/api/v2/sources/connect", body, 201)
    assert second["id"] == first["id"]
    workspace = client.get("/api/v2/workspace?portal=employee").json()
    assert len(workspace["sources"]) == 1


def test_invitation_accept_revoke_expiry_and_roles(client):
    register_and_bootstrap(client)
    invite = post(client, "/api/v2/member-invitations",
                  {"email": "invitee@example.com", "role": "member"}, 201)
    token = invite["invite_path"].split("invite=")[1]
    with TestClient(app.app) as employee:
        account = post(employee, "/api/auth/register", {
            "name": "受邀员工", "email": "invitee@example.com", "password": "product123",
        }, 201)["account"]
        assert employee.get("/api/v2/members").status_code == 412
        assert employee.post("/api/v2/invitations/accept",
                             json={"token": "incorrect-token-long-enough"}).status_code == 403
        assert post(employee, "/api/v2/invitations/preview", {"token": token})["role"] == "member"
        assert post(employee, "/api/v2/invitations/accept", {"token": token})["joined"]
        assert employee.post("/api/v2/invitations/accept", json={"token": token}).status_code == 409
        assert employee.get("/api/v2/members").status_code == 403
        assert employee.post("/api/v2/member-invitations",
                             json={"email": "x@example.com"}).status_code == 403
        assert employee.get("/api/v2/workspace?portal=operations").status_code == 403
        post(client, f"/api/v2/members/{account['id']}/role", {"role": "operator"})
        assert employee.get("/api/v2/workspace?portal=operations").status_code == 200
        # Operators may run tasks but cannot delegate membership privileges.
        assert employee.get("/api/v2/members").status_code == 403
        post(client, f"/api/v2/members/{account['id']}/role", {"role": "member"})
        assert employee.get("/api/v2/workspace?portal=operations").status_code == 403
    owner_id = client.get("/api/v2/workspace").json()["account"]["id"]
    assert client.post(f"/api/v2/members/{owner_id}/role",
                       json={"role": "member"}).status_code == 409
    revoked = post(client, "/api/v2/member-invitations",
                   {"email": "revoked@example.com"}, 201)
    post(client, f"/api/v2/member-invitations/{revoked['id']}/revoke")
    with TestClient(app.app) as revoked_user:
        post(revoked_user, "/api/auth/register", {
            "name": "撤销测试", "email": "revoked@example.com", "password": "product123",
        }, 201)
        assert revoked_user.post("/api/v2/invitations/accept", json={
            "token": revoked["invite_path"].split("invite=")[1],
        }).status_code == 409
    expired = post(client, "/api/v2/member-invitations",
                   {"email": "expired@example.com"}, 201)
    with st.transaction() as db:
        db.execute("UPDATE workspace_invites SET expires_at=? WHERE id=?",
                   ("2020-01-01T00:00:00+00:00", expired["id"]))
        row = db.execute("SELECT * FROM workspace_invites WHERE id=?", (expired["id"],)).fetchone()
        assert expired["invite_path"].split("invite=")[1] not in str(dict(row))
    with TestClient(app.app) as expired_user:
        post(expired_user, "/api/auth/register", {
            "name": "过期测试", "email": "expired@example.com", "password": "product123",
        }, 201)
        assert expired_user.post("/api/v2/invitations/accept", json={
            "token": expired["invite_path"].split("invite=")[1],
        }).status_code == 409


def test_employee_ownership_and_operator_gate(client):
    register_and_bootstrap(client)
    organization_id = client.get("/api/v2/workspace").json()["organization"]["id"]
    expert, twin = create_expert_and_twin(client)
    learning = post(client, "/api/v2/learning", {
        "expert_id": expert["id"], "twin_id": twin["id"], "title": "压测诊断",
        "work_record": "确认基线，检查指标证据，生产风险不明时暂停。",
        "source_label": "脱敏复盘",
    }, 201)
    with TestClient(app.app) as employee:
        account = post(employee, "/api/auth/register", {
            "name": "另一位员工", "email": "member@example.com", "password": "product123",
        }, 201)["account"]
        with st.transaction() as db:
            st.add_organization_member(db, organization_id, account["id"], "member")
        workspace = employee.get("/api/v2/workspace").json()
        assert workspace["twins"] == []
        assert workspace["learning"] == []
        assert workspace["can_operate"] is False
        assert employee.get("/api/v2/workspace?portal=operations").status_code == 403
        assert employee.post("/api/v2/twins", json={
            "name": "越权分身", "role_goal": "冒用其他人的经验", "expert_id": expert["id"],
        }).status_code == 403
        assert employee.post(f"/api/v2/learning/{learning['id']}/clarify", json={
            "answer": "越权修改他人学习记录",
        }).status_code == 403
        assert employee.post("/api/v2/tasks", json={
            "title": "越权发布任务", "goal": "不应当允许员工发布",
            "expected_output": "诊断结论", "required_capabilities": ["压测诊断"],
        }).status_code == 403
        own_expert, own_twin = create_expert_and_twin(employee, "本人的分身")
        assert own_expert["owner_account_id"] == account["id"]
        assert [v["id"] for v in employee.get("/api/v2/workspace").json()["twins"]] == [own_twin["id"]]
    # Operator sees team-wide candidates but /me is scoped to their own twins.
    assert len(client.get("/api/v2/workspace?portal=operations").json()["twins"]) == 2
    assert [v["id"] for v in client.get("/api/v2/workspace?portal=employee").json()["twins"]] == [twin["id"]]
