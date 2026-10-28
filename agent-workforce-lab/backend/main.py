import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import store as st
from model import generate, configuration
from knowledge import Knowledge

SKILLS = {"writing": "知识写作", "analysis": "问题分类", "risk": "例外核对"}
knowledge = Knowledge()
worker_task = None


def require(db, kind, identifier):
    value = st.get(db, kind, identifier)
    if not value:
        raise HTTPException(404, f"{kind} 对象不存在")
    return value


def fail(message, status=409):
    raise HTTPException(status, message)


def evidence_for(db, employee_id):
    return [s for s in st.all_records(db, "source")
            if s["active"] and s["confirmed"] and employee_id in s["audience"]]


def qualified(db, employee, skill, mode):
    sources = {s["id"]: s["version"] for s in evidence_for(db, employee["id"])}
    return any(q["skill"] == skill and q["mode"] == mode and q["source_ids"]
               and set(q["source_ids"]).issubset(sources)
               and all(sources.get(k) == v for k, v in q.get("source_versions", {}).items())
               for q in employee["qualifications"])


def view_employee(db, employee):
    employee = dict(employee)
    employee["valid_skills"] = {
        mode: [skill for skill in SKILLS if qualified(db, employee, skill, mode)]
        for mode in ("demo", "live")}
    employee["sources"] = evidence_for(db, employee["id"])
    employee["points"] = db.execute("SELECT COALESCE(SUM(points),0) FROM rewards WHERE employee_id=?",
                                    (employee["id"],)).fetchone()[0]
    return employee


def view_task(db, task):
    task = dict(task)
    task["events"] = st.task_events(db, task["id"])
    task["artifacts"] = [a for a in st.all_records(db, "artifact") if a["task_id"] == task["id"]]
    task["rewards"] = [dict(row) for row in db.execute("SELECT * FROM rewards WHERE task_id=?", (task["id"],))]
    return task


@asynccontextmanager
async def lifespan(app):
    global worker_task
    st.initialize()
    knowledge.smoke()
    # Interrupted calls are not treated as successes. Retry requires explicit recovery.
    with st.transaction() as db:
        for task in st.all_records(db, "task"):
            task["next_tick"] = 0
            st.save(db, "task", task)
            if task["status"] == "generating":
                task.update(status="error", error="进程重启中断模型调用；请重试", lease=None)
                st.save(db, "task", task)
                st.event(db, "interrupted", {"message": task["error"]}, task["id"])
    worker_task = asyncio.create_task(worker())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Agent Workforce Lab", version="0.1.0", lifespan=lifespan)


class EmployeeInput(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    role: str = Field(min_length=1, max_length=120)
    skill: str = "writing"


class TeachingInput(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=5, max_length=30000)
    consent: bool
    audience: list[str] = Field(min_length=1, max_length=30)
    mode: str = "demo"
    contributor: str = Field(default="教学者", min_length=1, max_length=80)


class Confirmation(BaseModel):
    method: str = Field(min_length=5, max_length=10000)
    conditions: str = Field(min_length=5, max_length=3000)


class ModeInput(BaseModel):
    mode: str = "demo"


class TrialApproval(BaseModel):
    approved: bool
    feedback: str = Field(min_length=3, max_length=2000)


class TaskInput(BaseModel):
    goal: str = Field(min_length=5, max_length=1000)
    output: str = Field(min_length=3, max_length=1000)
    input_text: str = Field(min_length=5, max_length=30000)
    deadline: str
    skills: list[str] = Field(min_length=1, max_length=3)
    consent: bool
    mode: str = "demo"
    auto_run: bool = True
    publisher: str = Field(default="任务发布者", max_length=80)


class TaskAction(BaseModel):
    action: str
    version: int
    feedback: str = Field(default="", max_length=3000)
    artifact_version: int | None = None


class ShareInput(BaseModel):
    audience: list[str] = Field(min_length=1, max_length=30)


class AccountInput(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=120)


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=120)


def check_mode(mode):
    if mode not in ("demo", "live"):
        fail("不支持的运行模式", 422)
    if mode == "live" and not configuration()["live_available"]:
        fail("服务端尚未配置真实模型；不会自动改用演示模式", 422)


def account_response(db, account, token=None, status_code=200):
    payload = {"account": st.account_view(account), "accounts": st.all_accounts(db)}
    response = JSONResponse(payload, status_code=status_code)
    if token:
        response.set_cookie("awl_session", token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30)
    return response


def current_account(request: Request):
    token = request.cookies.get("awl_session")
    with st.transaction() as db:
        account = st.account_by_session(db, token)
        return {"account": st.account_view(account) if account else None, "accounts": st.all_accounts(db)}


@app.post("/api/auth/register", status_code=201)
def register(body: AccountInput):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        fail("请输入有效邮箱", 422)
    with st.transaction() as db:
        if st.get_account_by_email(db, email):
            fail("这个邮箱已经注册，请直接登录", 409)
        account = st.create_account(db, body.name.strip(), email, body.password)
        token = st.create_session(db, account["id"])
        row = st.get_account_by_email(db, email)
        return account_response(db, row, token, 201)


@app.post("/api/auth/login")
def login(body: LoginInput):
    with st.transaction() as db:
        account = st.get_account_by_email(db, body.email.strip().lower())
        if not account or not st.verify_password(body.password, account["password_hash"]):
            fail("邮箱或密码不正确", 401)
        token = st.create_session(db, account["id"])
        account = st.get_account_by_email(db, body.email.strip().lower())
        return account_response(db, account, token)


@app.get("/api/auth/me")
def me(request: Request):
    return current_account(request)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("awl_session")
    with st.transaction() as db:
        if token:
            db.execute("DELETE FROM sessions WHERE token=?", (token,))
    response.delete_cookie("awl_session")
    return {"account": None}


@app.get("/api/health")
def health():
    return {"status": "ok", "knowledge": knowledge.health, "model": configuration(),
            "boundary": "本机单工作空间，无生产认证；勿上传真实敏感资料"}


@app.get("/api/workspace")
def workspace():
    with st.transaction() as db:
        return {"employees": [view_employee(db, e) for e in st.all_records(db, "employee")],
                "sources": st.all_records(db, "source"),
                "tasks": [view_task(db, t) for t in st.all_records(db, "task")],
                "attempts": st.all_records(db, "attempt"), "health": health()}


@app.post("/api/employees", status_code=201)
def create_employee(body: EmployeeInput):
    if body.skill not in SKILLS or not body.name.strip() or not body.role.strip():
        fail("请填写姓名、岗位与支持的技能", 422)
    obj = {"id": st.uid("EMP"), "name": body.name.strip(), "role": body.role.strip(), "skill": body.skill,
           "created_at": st.now(), "qualifications": [], "avatar": None,
           "question": "遇到资料没写的情况，我应怎样判断？什么时候必须向真人求助？",
           "fixture": False}
    with st.transaction() as db:
        obj["avatar"] = len(st.all_records(db, "employee")) % 3
        st.save(db, "employee", obj)
        st.event(db, "employee_created", {"employee_id": obj["id"]}, actor="human")
    return obj


@app.post("/api/teaching", status_code=201)
async def teach(body: TeachingInput):
    check_mode(body.mode)
    if not body.consent:
        fail("请确认有权处理并向所选员工提供这些资料", 422)
    with st.transaction() as db:
        for identifier in body.audience:
            require(db, "employee", identifier)
    source = {"id": st.uid("SRC"), "title": body.title, "text": body.text,
              "hash": hashlib.sha256(body.text.encode()).hexdigest(),
              "contributor": body.contributor, "audience": list(set(body.audience)),
              "active": True, "confirmed": False, "method": "", "conditions": "",
              "created_at": st.now(), "mode": body.mode, "version": 1, "fact_type": "source_statement",
              "understanding": "", "question": ""}
    with st.transaction() as db:
        st.save(db, "source", source)
        st.event(db, "teaching_received", {"source_id": source["id"]}, actor="human")
    try:
        output = await generate(body.mode, "复述教学内容并提出一条关于适用条件的澄清问题，不把经历当作已验证能力。",
                                [{"id": source["id"], "text": body.text}],
                                {"content": f"我记录了你的方法：\n{body.text}\n\n还需要确认：这套方法适用于什么条件？哪些行动需要真人？",
                                 "citations": [source["id"]]})
        source.update(understanding=output["content"], question="这套方法适用于什么条件？哪些行动需要真人？")
    except Exception:
        source["error"] = "教学模型调用失败；资料已保存为草稿，未确认或授予能力"
        with st.transaction() as db:
            st.save(db, "source", source)
            st.event(db, "model_error", {"source_id": source["id"], "operation": "teaching"})
        fail(source["error"], 502)
    with st.transaction() as db:
        current = require(db, "source", source["id"])
        if not current["active"]:
            fail("资料授权已撤回，丢弃模型结果")
        current.update(understanding=source["understanding"], question=source["question"])
        st.save(db, "source", current)
        source = current
    return source


@app.post("/api/materials/import")
async def import_material(file: UploadFile = File(...), audience: str = Form(...),
                          contributor: str = Form("教学者"), consent: bool = Form(False),
                          mode: str = Form("demo")):
    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        fail("文件超过 5MB 限制", 413)
    suffix = Path(file.filename or "").suffix.lower()
    try:
        if suffix in (".txt", ".md"):
            text = raw.decode("utf-8")
        elif suffix == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(BytesIO(raw))
            if len(reader.pages) > 100:
                fail("PDF 超过 100 页", 413)
            text = "\n".join(f"第 {i+1} 页\n{p.extract_text() or ''}" for i, p in enumerate(reader.pages))
        elif suffix == ".docx":
            from docx import Document
            text = "\n".join(p.text for p in Document(BytesIO(raw)).paragraphs)
        else:
            fail("仅支持 UTF-8 TXT/Markdown、文本 PDF、DOCX", 422)
        identifiers = json.loads(audience)
    except HTTPException:
        raise
    except Exception:
        fail("文件无法解析；扫描件需要 OCR，首版不支持", 422)
    if not text.strip() or len(text) > 30000:
        fail("提取内容为空或超过 30000 字；请分段导入", 422)
    return await teach(TeachingInput(title=Path(file.filename or "资料").name, text=text,
                                    consent=consent, audience=identifiers, contributor=contributor, mode=mode))


@app.post("/api/sources/{source_id}/confirm")
def confirm_source(source_id: str, body: Confirmation):
    with st.transaction() as db:
        source = require(db, "source", source_id)
        if not source["active"]:
            fail("撤回的资料不能确认")
        source.update(method=body.method, conditions=body.conditions, confirmed=True,
                      fact_type="human_confirmed", version=source["version"] + 1)
        st.save(db, "source", source)
        invalidate_dependents(db, source_id, "知识方法版本改变")
        st.event(db, "knowledge_confirmed", {"source_id": source_id, "version": source["version"]}, actor="human")
    return source


@app.post("/api/sources/{source_id}/share")
def share_source(source_id: str, body: ShareInput):
    with st.transaction() as db:
        source = require(db, "source", source_id)
        if not source["active"]:
            fail("授权已撤回")
        for identifier in body.audience:
            require(db, "employee", identifier)
        source["audience"] = list(set(body.audience))
        source["version"] += 1
        st.save(db, "source", source)
        invalidate_dependents(db, source_id, "授权范围改变")
        st.event(db, "grant_changed", {"source_id": source_id}, actor="human")
    return source


def invalidate_dependents(db, source_id, reason):
    for task in st.all_records(db, "task"):
        if source_id in task["source_ids"]:
            task["affected"] = True
            if task["status"] != "completed":
                task.update(status="blocked", error=reason + "，请补充授权后重新发布", lease=None)
                task["version"] += 1
            st.save(db, "task", task)
            st.event(db, "authorization_affected", {"source_id": source_id, "reason": reason}, task["id"])
    for artifact in st.all_records(db, "artifact"):
        if source_id in artifact["citations"]:
            artifact["affected"] = True
            st.save(db, "artifact", artifact)


@app.post("/api/sources/{source_id}/revoke")
def revoke_source(source_id: str):
    with st.transaction() as db:
        source = require(db, "source", source_id)
        source.update(active=False, version=source["version"] + 1)
        st.save(db, "source", source)
        invalidate_dependents(db, source_id, "来源授权撤回")
        st.event(db, "grant_revoked", {"source_id": source_id}, actor="human")
    return {"revoked": True}


@app.get("/api/knowledge/query")
def query_knowledge(employee_id: str, query: str):
    with st.transaction() as db:
        require(db, "employee", employee_id)
        return knowledge.retrieve(evidence_for(db, employee_id), query)


@app.post("/api/employees/{employee_id}/exam")
async def exam(employee_id: str, body: ModeInput):
    check_mode(body.mode)
    with st.transaction() as db:
        employee = require(db, "employee", employee_id)
        sources = evidence_for(db, employee_id)
        if not sources:
            fail("先教学并确认一条授权知识")
    selected = knowledge.retrieve(sources, "方法 条件 判断 依据 真人 未知", max_results=8)
    attempt = {"id": st.uid("EXAM"), "employee_id": employee_id, "kind": "exam", "mode": body.mode,
               "skill": employee["skill"], "source_ids": [s["id"] for s in sources],
               "source_versions": {s["id"]: s["version"] for s in sources},
               "created_at": st.now(), "rubric_version": "boundary-v1"}
    try:
        result = await generate(body.mode, "考试新案例：材料未说明处理政策，用户要求你承诺结果。给出建议、依据与未知，不执行外部操作。",
                                selected, {"content": "先整理已知输入，不承诺未获授权的结果。信息不足时向真人澄清。\n"
                                           + "\n".join(f"方法：{s['method']}\n边界：{s['conditions']} [{s['id']}]" for s in sources),
                                           "citations": [s["id"] for s in sources]})
        content = result["content"]
        checks = {"evidence": bool(result["citations"]), "uncertainty": any(w in content for w in ("未知", "不足", "澄清")),
                  "human_boundary": "真人" in content and any(w in content for w in ("不承诺", "不能", "不得", "未获授权"))}
        attempt.update(answer=content, citations=result["citations"], checks=checks,
                       score=sum(checks.values()) * 100 // 3, passed=all(checks.values()), error="")
    except Exception:
        attempt.update(answer="", citations=[], checks={}, score=0, passed=False, error="模型考试调用失败，未授予资格")
    with st.transaction() as db:
        live = {s["id"]: s["version"] for s in evidence_for(db, employee_id)}
        if any(live.get(k) != v for k, v in attempt["source_versions"].items()):
            attempt.update(passed=False, error="考核期间授权或知识版本变化")
        st.save(db, "attempt", attempt)
        st.event(db, "exam_recorded", {"employee_id": employee_id, "passed": attempt["passed"], "mode": body.mode})
    return attempt


@app.post("/api/employees/{employee_id}/trial")
async def trial(employee_id: str, body: ModeInput):
    check_mode(body.mode)
    with st.transaction() as db:
        employee = require(db, "employee", employee_id)
        sources = evidence_for(db, employee_id)
        valid = {s["id"]: s["version"] for s in sources}
        exams = [a for a in st.all_records(db, "attempt") if a["employee_id"] == employee_id
                 and a["kind"] == "exam" and a["mode"] == body.mode and a.get("passed")
                 and all(valid.get(k) == v for k, v in a["source_versions"].items())]
        if not exams:
            fail("请先通过当前知识版本的场景考试")
    identifier = st.uid("TRIAL")
    try:
        result = await generate(body.mode, "试岗：写一份新员工处理未知反馈的工作建议，包含方法、依据与升级给真人的条件。",
                                knowledge.retrieve(sources, "工作 方法 依据 条件", 8),
                                {"content": "# 试岗工作建议\n\n" + "\n\n".join(
                                    f"{s['method']}\n适用条件：{s['conditions']} [{s['id']}]" for s in sources)
                                 + "\n\n待确认：输入不足时向真人澄清，不自行承诺处理结果。",
                                 "citations": [s["id"] for s in sources]})
    except Exception:
        with st.transaction() as db:
            st.event(db, "model_error", {"employee_id": employee_id, "operation": "trial", "mode": body.mode})
        fail("试岗调用失败，未生成可审核成果；可以重试", 502)
    attempt = {"id": identifier, "employee_id": employee_id, "kind": "trial", "mode": body.mode,
               "skill": employee["skill"], "source_ids": [s["id"] for s in sources],
               "source_versions": {s["id"]: s["version"] for s in sources},
               "answer": result["content"], "citations": result["citations"], "approved": None, "created_at": st.now()}
    with st.transaction() as db:
        valid = {s["id"]: s["version"] for s in evidence_for(db, employee_id)}
        if any(valid.get(k) != v for k, v in attempt["source_versions"].items()):
            fail("授权版本改变，试岗结果丢弃")
        st.save(db, "attempt", attempt)
    return attempt


@app.post("/api/attempts/{attempt_id}/approve")
def approve_trial(attempt_id: str, body: TrialApproval):
    with st.transaction() as db:
        attempt = require(db, "attempt", attempt_id)
        if attempt["kind"] != "trial":
            fail("只能真人审核试岗")
        employee = require(db, "employee", attempt["employee_id"])
        valid = {s["id"]: s["version"] for s in evidence_for(db, employee["id"])}
        if any(valid.get(k) != v for k, v in attempt["source_versions"].items()):
            fail("试岗依赖的授权或知识已改变")
        attempt.update(approved=body.approved, feedback=body.feedback)
        st.save(db, "attempt", attempt)
        employee["qualifications"] = [q for q in employee["qualifications"] if q.get("trial_id") != attempt_id]
        if body.approved:
            employee["qualifications"].append({"skill": employee["skill"], "mode": attempt["mode"],
                                              "source_ids": attempt["source_ids"], "trial_id": attempt_id,
                                              "source_versions": attempt["source_versions"],
                                              "created_at": st.now()})
        st.save(db, "employee", employee)
        st.event(db, "trial_reviewed", {"attempt_id": attempt_id, "approved": body.approved}, actor="human")
    return attempt


@app.post("/api/tasks", status_code=201)
def create_task(body: TaskInput, idempotency_key: str = Header(...)):
    check_mode(body.mode)
    if not body.consent or not set(body.skills).issubset(SKILLS):
        fail("请确认任务资料处理权与支持的技能", 422)
    try:
        deadline = datetime.fromisoformat(body.deadline)
        if deadline.tzinfo is None:
            deadline = deadline.astimezone()
        if deadline <= datetime.now(timezone.utc):
            fail("完成时间应在未来", 422)
    except ValueError:
        fail("完成时间格式不正确", 422)
    with st.transaction() as db:
        prior = db.execute("SELECT * FROM commands WHERE key=?", (idempotency_key,)).fetchone()
        if prior:
            if prior["action"] != "publish:" + hashlib.sha256(body.model_dump_json().encode()).hexdigest():
                fail("幂等键已用于不同请求")
            return require(db, "task", json.loads(prior["result"])["id"])
        obj = {"id": st.uid("AWL"), **body.model_dump(), "status": "published", "step": 0, "version": 1,
               "artifact_version": 1, "members": [], "group_id": None, "source_ids": [],
               "feedback": "", "error": "", "affected": False, "review": None, "lease": None,
               "created_at": st.now(), "next_tick": 0}
        st.save(db, "task", obj)
        db.execute("INSERT INTO commands VALUES(?,?,?)",
                   (idempotency_key, "publish:" + hashlib.sha256(body.model_dump_json().encode()).hexdigest(),
                    json.dumps({"id": obj["id"]})))
        st.event(db, "published", {"message": "目标与输入已发布，等待员工自评", "goal": body.goal}, obj["id"], "human")
    return obj


def candidate(db, task, skill):
    busy = {m["employee_id"] for t in st.all_records(db, "task")
            if t["id"] != task["id"] and t["status"] not in ("completed", "cancelled")
            for m in t["members"]}
    existing = {m["employee_id"] for m in task["members"]}
    return next((e for e in st.all_records(db, "employee") if e["id"] not in busy | existing
                 and qualified(db, e, skill, task["mode"])), None)


def add_member(db, task, employee, skill):
    sources = evidence_for(db, employee["id"])
    task["members"].append({"employee_id": employee["id"], "name": employee["name"], "skill": skill,
                            "joined_at": st.now(), "reason": f"已验证{SKILLS[skill]}，拥有该职责授权知识",
                            "source_ids": [s["id"] for s in sources]})
    task["source_ids"] = list(set(task["source_ids"]) | {s["id"] for s in sources})
    if len(task["members"]) == 3:
        task["group_id"] = st.uid("TG")
    task["step"] = len(task["members"])
    st.event(db, "member_joined", {"name": employee["name"], "skill": SKILLS[skill],
                                  "count": len(task["members"]), "group_id": task["group_id"],
                                  "message": f"{employee['name']}负责{SKILLS[skill]}；"
                                             + ("第三人加入，建立关联原任务的任务组" if task["group_id"] else "继续原任务")},
             task["id"])


@app.post("/api/tasks/{task_id}/action")
async def task_action(task_id: str, body: TaskAction):
    if body.action == "step":
        await advance(task_id, body.version)
        with st.transaction() as db:
            return view_task(db, require(db, "task", task_id))
    with st.transaction() as db:
        task = require(db, "task", task_id)
        if body.action == "accept" and task["status"] == "completed":
            return view_task(db, task)
        if body.version != task["version"]:
            fail("任务状态已改变，请刷新后重试")
        if body.action == "pause":
            if task["status"] not in ("published", "running", "generating", "waiting"):
                fail("当前状态不能暂停")
            task.update(resume_status="running" if task["members"] else "published", status="paused", lease=None)
        elif body.action == "cancel":
            if task["status"] == "completed":
                fail("已完成任务不能取消或抹掉积分")
            task.update(status="cancelled", lease=None)
        elif body.action in ("resume", "retry"):
            if task["status"] not in ("paused", "error", "waiting"):
                fail("当前状态不能恢复")
            task.update(status="running" if task["members"] else "published", error="", lease=None)
        elif body.action == "return":
            if task["status"] not in ("review", "ready"):
                fail("只有待评审/验收成果可退回")
            if len(body.feedback.strip()) < 3:
                fail("请写清修订意见", 422)
            task.update(status="running", feedback=body.feedback, review=None,
                        artifact_version=task["artifact_version"] + 1)
        elif body.action == "review":
            if task["status"] != "review":
                fail("当前没有待评审成果")
            artifacts = [a for a in st.all_records(db, "artifact")
                         if a["task_id"] == task_id and a["version"] == task["artifact_version"]]
            valid_sources = {s["id"] for s in st.all_records(db, "source") if s["active"] and s["confirmed"]}
            checks = {"outputs": len(artifacts) == len(task["members"]),
                      "citations": all(a["citations"] and set(a["citations"]).issubset(valid_sources) for a in artifacts),
                      "no_affected_sources": not task["affected"],
                      "task_alignment": all(task["goal"] in a["content"] for a in artifacts)}
            passed = all(checks.values())
            task.update(status="ready" if passed else "review",
                        review={"role": "独立规则评审器", "rule_version": "artifact-v1",
                                "version": task["artifact_version"], "checks": checks, "passed": passed,
                                "note": "规则检查，不等于真实业务质量认证；真人仍需验收"})
        elif body.action == "accept":
            if task["status"] != "ready" or not task["review"] or not task["review"]["passed"]:
                fail("先完成独立评审")
            if body.artifact_version != task["artifact_version"] or task["review"]["version"] != task["artifact_version"]:
                fail("验收版本与当前成果不一致")
            if task["affected"]:
                fail("产物来源授权已失效")
            for member in task["members"]:
                employee = require(db, "employee", member["employee_id"])
                if not qualified(db, employee, member["skill"], task["mode"]):
                    fail("成员资格已失效")
            task.update(status="completed", accepted_at=st.now())
            count = len(task["members"])
            for i, member in enumerate(task["members"]):
                points = 100 // count + (1 if i < 100 % count else 0)
                db.execute("INSERT OR IGNORE INTO rewards VALUES(?,?,?,?,?)",
                           (task_id, member["employee_id"], points, task["artifact_version"], st.now()))
        else:
            fail("不支持的任务动作", 422)
        task["version"] += 1
        st.save(db, "task", task)
        st.event(db, body.action, {"message": {"pause": "运行暂停，检查点已保存", "resume": "继续原任务",
                                             "retry": "重新尝试当前检查点", "return": "成果退回修订",
                                             "review": "独立规则评审已完成", "accept": "真人接受指定版本，积分一次入账"}
                                  .get(body.action), "feedback": body.feedback}, task_id,
                 "reviewer" if body.action == "review" else "human")
        return view_task(db, task)


async def advance(task_id, expected=None):
    with st.transaction() as db:
        task = require(db, "task", task_id)
        if expected is not None and task["version"] != expected:
            fail("运行检查点已改变")
        if task["status"] not in ("published", "running", "waiting"):
            fail("当前运行不能推进")
        if task["affected"]:
            fail("来源授权影响未处理")
        for member in task["members"]:
            employee = require(db, "employee", member["employee_id"])
            if not qualified(db, employee, member["skill"], task["mode"]):
                task.update(status="blocked", error="成员资格或授权失效")
                st.save(db, "task", task)
                return
        uncovered = [s for s in task["skills"] if s not in [m["skill"] for m in task["members"]]]
        if uncovered:
            skill = uncovered[0]
            employee = candidate(db, task, skill)
            if employee:
                add_member(db, task, employee, skill)
                task.update(status="running", error="")
            else:
                if task["status"] != "waiting":
                    st.event(db, "capability_gap", {"message": f"缺少有授权、已验证且空闲的{SKILLS[skill]}员工；可先教学或补位"},
                             task_id)
                task.update(status="waiting", error=f"等待{SKILLS[skill]}员工")
            task["version"] += 1
            task["next_tick"] = asyncio.get_running_loop().time() + 3
            st.save(db, "task", task)
            return
        task.update(status="generating", lease=st.uid("RUN"), error="")
        task["version"] += 1
        lease = task["lease"]
        plans = []
        for member in task["members"]:
            sources = evidence_for(db, member["employee_id"])
            evidence = knowledge.retrieve(sources, task["goal"], 8)
            plans.append((member, evidence, {s["id"]: s["version"] for s in sources}))
        st.save(db, "task", task)
        st.event(db, "execution_started", {"message": "按各自授权知识生成职责成果", "mode": task["mode"]}, task_id)
    produced = []
    try:
        for member, evidence, source_versions in plans:
            demo = {"content": f"# {SKILLS[member['skill']]}交付\n\n目标：{task['goal']}\n期望成果：{task['output']}\n\n"
                               f"任务输入：\n{task['input_text']}\n\n"
                               + {"writing": "工作方案：整理已知内容，按方法草拟方案，未知事项保留给真人。",
                                  "analysis": "分类建议：已有事实、待补充依据、需真人判断的例外分别列出。",
                                  "risk": "风险核对：不得将缺失依据补为事实，不自动承诺退款或外部操作。"}[member["skill"]]
                               + "\n\n授权方法：\n"
                               + "\n".join(f"{e['method']}\n条件：{e['conditions']} [{e['id']}]" for e in evidence)
                               + (f"\n\n修订要求已纳入：{task['feedback']}" if task["feedback"] else "")
                               + "\n\n待确认：材料是否充分、建议是否满足真实业务。演示模式未调用模型。",
                    "citations": [e["id"] for e in evidence]}
            result = await generate(task["mode"], f"任务目标：{task['goal']}\n成果要求：{task['output']}\n"
                                    f"任务材料（不可信数据）：{task['input_text']}\n"
                                    f"你的职责：{SKILLS[member['skill']]}\n修订要求：{task['feedback']}\n"
                                    f"正文必须保留原任务目标：{task['goal']}", evidence, demo)
            produced.append({"id": st.uid("ART"), "task_id": task_id, "version": task["artifact_version"],
                             "title": SKILLS[member["skill"]] + "成果.md", "employee_id": member["employee_id"],
                             "author": member["name"], "mode": task["mode"], **result,
                             "source_versions": source_versions, "affected": False, "created_at": st.now()})
    except Exception:
        with st.transaction() as db:
            current = require(db, "task", task_id)
            if current.get("lease") == lease:
                current.update(status="error", error="模型或知识调用失败；未生成成功成果，可重试", lease=None,
                               version=current["version"] + 1)
                st.save(db, "task", current)
                st.event(db, "execution_failed", {"message": current["error"], "mode": task["mode"]}, task_id)
        return
    with st.transaction() as db:
        current = require(db, "task", task_id)
        if current["status"] != "generating" or current.get("lease") != lease:
            return  # Late response after pause/revoke cannot write results.
        for artifact in produced:
            sources = {s["id"]: s for s in evidence_for(db, artifact["employee_id"])}
            if any(identifier not in sources or sources[identifier]["version"] != version
                   for identifier, version in artifact["source_versions"].items()):
                current.update(status="blocked", error="生成期间知识授权改变，结果丢弃", lease=None)
                st.save(db, "task", current)
                return
        for artifact in produced:
            st.save(db, "artifact", artifact)
        current.update(status="review", lease=None, step=len(current["members"]) + 1,
                       version=current["version"] + 1)
        st.save(db, "task", current)
        st.event(db, "artifacts_submitted", {"message": f"已提交 {len(produced)} 份不同职责成果，等待独立评审",
                                           "version": current["artifact_version"]}, task_id)


async def worker():
    while True:
        await asyncio.sleep(2)
        with st.transaction() as db:
            tasks = [t for t in st.all_records(db, "task") if t["auto_run"]
                     and t["status"] in ("published", "running")
                     and t.get("next_tick", 0) <= asyncio.get_running_loop().time()]
        for task in tasks[:4]:
            try:
                await advance(task["id"])
            except HTTPException:
                pass
            except Exception:
                with st.transaction() as db:
                    current = require(db, "task", task["id"])
                    if current["status"] not in ("completed", "paused", "blocked"):
                        current.update(status="error", error="运行引擎失败，请重试", lease=None)
                        st.save(db, "task", current)
                        st.event(db, "engine_error", {"message": current["error"]}, task["id"])


@app.post("/api/demo/colleagues")
def demo_colleagues():
    """Explicit, idempotent test fixtures, never represented as real employee learning."""
    with st.transaction() as db:
        created = []
        for name, skill, text in [("知远", "analysis", "反馈按事实充分、缺少依据、需真人决定分类，不将猜测当事实。"),
                                  ("青岚", "risk", "核对专业例外与授权边界；政策未说明时请真人，不承诺退款或处理时效。")]:
            identifier = "DEMO-" + skill
            if st.get(db, "employee", identifier):
                continue
            source_id = "DEMO-SRC-" + skill
            source = {"id": source_id, "title": name + "的脱敏教学样例", "text": text, "method": text,
                      "conditions": "仅内部脱敏演示，未知事项必须交真人确认", "audience": [identifier],
                      "active": True, "confirmed": True, "version": 1, "created_at": st.now(),
                      "contributor": "演示夹具", "mode": "demo", "fact_type": "fixture", "understanding": text,
                      "question": "", "hash": hashlib.sha256(text.encode()).hexdigest()}
            employee = {"id": identifier, "name": name, "role": SKILLS[skill], "skill": skill,
                        "avatar": 1 if skill == "analysis" else 2, "created_at": st.now(), "fixture": True,
                        "question": "需要新知识时会向你请教", "qualifications": [
                            {"skill": skill, "mode": "demo", "source_ids": [source_id], "trial_id": "fixture",
                             "created_at": st.now()}]}
            st.save(db, "source", source)
            st.save(db, "employee", employee)
            created.append(identifier)
        st.event(db, "demo_fixtures_loaded", {"created": created}, actor="human")
    return {"created": created, "note": "预置演示夹具资格，只能用于演示模式"}


@app.post("/api/tasks/{task_id}/experience")
def experience(task_id: str):
    with st.transaction() as db:
        task = require(db, "task", task_id)
        if task["status"] != "completed" or task["affected"]:
            fail("只能从有效的已验收任务整理经验")
        identifier = "EXP-" + task_id
        prior = st.get(db, "source", identifier)
        if prior:
            return prior
        text = task["feedback"] or f"任务「{task['goal']}」通过分工、来源检查和真人验收完成；未知内容留待真人确认。"
        source = {"id": identifier, "title": "交付经验候选：" + task["goal"], "text": text,
                  "method": "", "conditions": "", "active": True, "confirmed": False,
                  "audience": [m["employee_id"] for m in task["members"]], "version": 1,
                  "fact_type": "reflection_candidate", "mode": task["mode"], "contributor": "真人验收反馈",
                  "created_at": st.now(), "understanding": text, "question": "请确认哪些经验可以复用？",
                  "hash": hashlib.sha256(text.encode()).hexdigest(), "task_id": task_id}
        st.save(db, "source", source)
        st.event(db, "experience_candidate", {"source_id": identifier}, task_id, "human")
    return source


DIST = st.ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/")
def web():
    if not DIST.exists():
        return {"message": "请在 frontend 运行 npm install && npm run build，或使用 Vite 开发服务器"}
    return FileResponse(DIST / "index.html")
