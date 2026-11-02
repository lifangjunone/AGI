"""Agent Workforce v2 domain: apprenticeship, qualification, work and feedback."""
import re
import hashlib
import secrets
import json
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Literal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, File, Form, UploadFile
from pydantic import BaseModel, Field

import store as st
from model import configuration, generate


router = APIRouter(prefix="/api/v2", tags=["workforce-v2"])


def fail(message: str, status: int = 409):
    raise HTTPException(status, message)


def context(request: Request):
    token = request.cookies.get("awl_session")
    with st.transaction() as db:
        account = st.account_by_session(db, token)
        if not account:
            raise HTTPException(401, "请先登录")
        organizations = st.organizations_for(db, account["id"])
        if not organizations:
            return {"account": st.account_view(account), "organization": None, "role": None}
        organization = organizations[0]
        return {
            "account": st.account_view(account),
            "organization": {"id": organization["id"], "name": organization["name"]},
            "role": organization["role"],
        }


def require_org(ctx=Depends(context)):
    if not ctx["organization"]:
        fail("请先创建团队空间", 412)
    return ctx


def is_operator(ctx):
    return ctx["role"] in ("owner", "admin", "operator")


def require_operator(ctx=Depends(require_org)):
    if not is_operator(ctx):
        fail("只有运营人员可以考核、发布和管理任务", 403)
    return ctx


def object_owner(db, org_id, kind, value):
    if value.get("owner_account_id"):
        return value["owner_account_id"]
    # Recover legacy provenance from authoritative creation audit, never from
    # the account currently viewing the object.
    row = db.execute(
        """SELECT account_id FROM product_audit
           WHERE organization_id=? AND object_kind=? AND object_id=?
             AND action=? ORDER BY seq LIMIT 1""",
        (org_id, f"v2_{kind}", value["id"],
         {"expert": "expert_created", "twin": "twin_created",
          "learning": "learning_started", "source": "source_connected"}.get(kind, "")),
    ).fetchone()
    return row["account_id"] if row else None


def require_owned(db, ctx, kind, value):
    if object_owner(db, ctx["organization"]["id"], kind, value) != ctx["account"]["id"]:
        fail("你只能培养自己的数字分身和处理自己的学习记录", 403)


def all_objects(db, org_id: str, kind: str):
    return st.product_all(db, org_id, f"v2_{kind}")


def get_object(db, org_id: str, kind: str, identifier: str):
    value = st.product_get(db, org_id, f"v2_{kind}", identifier)
    if not value:
        fail(f"{kind} 不存在", 404)
    return value


def save_object(db, org_id: str, kind: str, value: dict):
    st.product_save(db, org_id, f"v2_{kind}", value)


def source_view(value):
    return {key: item for key, item in value.items() if key != "content"}


def audit(db, ctx: dict, action: str, kind: str, identifier: str, detail=None):
    st.product_audit(
        db, ctx["organization"]["id"], ctx["account"]["id"],
        action, f"v2_{kind}", identifier, detail or {},
    )


class BootstrapInput(BaseModel):
    organization_name: str = Field(min_length=1, max_length=80)


class MemberInviteInput(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    role: Literal["member", "operator"] = "member"


class AcceptInviteInput(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class MemberRoleInput(BaseModel):
    role: Literal["member", "operator"]


def require_manager(ctx=Depends(require_org)):
    if ctx["role"] not in ("owner", "admin"):
        fail("仅团队负责人或管理员可以管理邀请", 403)
    return ctx


@router.get("/members")
def members(ctx=Depends(require_manager)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        invitations = [dict(row) for row in db.execute(
            """SELECT id,email,role,status,created_at,expires_at FROM workspace_invites
               WHERE organization_id=? ORDER BY created_at DESC""", (org_id,)
        )]
        for invite in invitations:
            if invite["status"] == "pending" and invite["expires_at"] <= st.now():
                invite["status"] = "expired"
        return {"members": st.organization_members(db, org_id), "invitations": invitations}


@router.post("/member-invitations", status_code=201)
def invite_account(body: MemberInviteInput, ctx=Depends(require_manager)):
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        fail("请输入有效的邀请邮箱", 422)
    token = secrets.token_urlsafe(32)
    org_id = ctx["organization"]["id"]
    identifier = st.uid("INV")
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    with st.transaction() as db:
        if any(member["email"].lower() == email for member in st.organization_members(db, org_id)):
            fail("这位用户已经在团队中，请在成员列表调整角色")
        if db.execute(
            """SELECT 1 FROM workspace_invites WHERE organization_id=? AND email=?
               AND status='pending' AND expires_at>?""", (org_id, email, st.now())
        ).fetchone():
            fail("该邮箱已有待接受邀请，请先撤销旧邀请")
        db.execute(
            """INSERT INTO workspace_invites
               (id,organization_id,email,role,token_hash,status,created_by,created_at,expires_at)
               VALUES(?,?,?,?,?,'pending',?,?,?)""",
            (identifier, org_id, email, body.role, hashlib.sha256(token.encode()).hexdigest(),
             ctx["account"]["id"], st.now(), expires_at),
        )
        audit(db, ctx, "member_invited", "invitation", identifier, {"role": body.role})
    # A fragment keeps the bearer token out of HTTP URL/access logs.
    return {"id": identifier, "email": email, "role": body.role,
            "expires_at": expires_at, "invite_path": f"/join#invite={token}"}


@router.post("/member-invitations/{invitation_id}/revoke")
def revoke_invitation(invitation_id: str, ctx=Depends(require_manager)):
    with st.transaction() as db:
        row = db.execute(
            "SELECT * FROM workspace_invites WHERE id=? AND organization_id=?",
            (invitation_id, ctx["organization"]["id"]),
        ).fetchone()
        if not row:
            fail("邀请不存在", 404)
        if row["status"] == "accepted":
            fail("邀请已经接受，请在成员列表管理角色")
        db.execute("UPDATE workspace_invites SET status='revoked' WHERE id=?", (invitation_id,))
        audit(db, ctx, "invitation_revoked", "invitation", invitation_id)
    return {"status": "revoked"}


@router.post("/invitations/preview")
def preview_invitation(body: AcceptInviteInput, ctx=Depends(context)):
    with st.transaction() as db:
        row = db.execute(
            """SELECT i.*,o.name AS organization_name FROM workspace_invites i
               JOIN organizations o ON o.id=i.organization_id WHERE token_hash=?""",
            (hashlib.sha256(body.token.encode()).hexdigest(),),
        ).fetchone()
        if not row or row["email"] != ctx["account"]["email"].lower():
            fail("邀请无效，或登录邮箱与受邀邮箱不一致", 403)
        if row["status"] != "pending" or row["expires_at"] <= st.now():
            fail("邀请已使用、撤销或过期，请联系负责人重新邀请")
        return {"organization_name": row["organization_name"], "role": row["role"],
                "email": row["email"], "expires_at": row["expires_at"]}


@router.post("/invitations/accept")
def accept_invitation(body: AcceptInviteInput, ctx=Depends(context)):
    with st.transaction() as db:
        row = db.execute("SELECT * FROM workspace_invites WHERE token_hash=?",
                         (hashlib.sha256(body.token.encode()).hexdigest(),)).fetchone()
        if not row or row["email"] != ctx["account"]["email"].lower():
            fail("邀请无效，或登录邮箱与受邀邮箱不一致", 403)
        if row["status"] != "pending" or row["expires_at"] <= st.now():
            fail("邀请已使用、撤销或过期，请联系负责人重新邀请")
        if st.organizations_for(db, ctx["account"]["id"]):
            fail("账号已经加入团队，本版本不自动迁移或覆盖已有团队")
        st.add_organization_member(db, row["organization_id"], ctx["account"]["id"], row["role"])
        db.execute(
            "UPDATE workspace_invites SET status='accepted',accepted_by=?,accepted_at=? WHERE id=?",
            (ctx["account"]["id"], st.now(), row["id"]),
        )
        st.product_audit(db, row["organization_id"], ctx["account"]["id"],
                         "invitation_accepted", "v2_invitation", row["id"], {})
    return {"joined": True, "role": row["role"]}


@router.post("/members/{account_id}/role")
def change_member_role(account_id: str, body: MemberRoleInput, ctx=Depends(require_manager)):
    if ctx["role"] != "owner":
        fail("只有团队负责人可以调整成员角色", 403)
    with st.transaction() as db:
        member = next((m for m in st.organization_members(db, ctx["organization"]["id"])
                       if m["id"] == account_id), None)
        if not member:
            fail("成员不存在", 404)
        if member["role"] in ("owner", "admin"):
            fail("此入口不能调整负责人或管理员")
        st.add_organization_member(db, ctx["organization"]["id"], account_id, body.role)
        audit(db, ctx, "member_role_changed", "member", account_id, {"role": body.role})
    return {"role": body.role}


class ExpertInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=2, max_length=160)
    knowledge_scope: str = Field(min_length=3, max_length=500)


class TwinInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role_goal: str = Field(min_length=3, max_length=500)
    expert_id: str


class LearningInput(BaseModel):
    expert_id: str
    twin_id: str
    title: str = Field(min_length=3, max_length=160)
    work_record: str = Field(min_length=10, max_length=20000)
    source_label: str = Field(min_length=2, max_length=160)


class SourceConnectInput(BaseModel):
    source_type: Literal["lark_doc", "oncall_flow"]
    name: str = Field(min_length=3, max_length=160)
    external_ref: str = Field(min_length=10, max_length=2000)
    related_ref: str | None = Field(default=None, max_length=2000)


class SourceAssignInput(BaseModel):
    twin_id: str


class ClarifyInput(BaseModel):
    answer: str = Field(min_length=5, max_length=5000)


class ConfirmLearningInput(BaseModel):
    method: str = Field(min_length=5, max_length=5000)
    boundary: str = Field(min_length=5, max_length=2000)


class TrialSubmitInput(BaseModel):
    response: str = Field(min_length=10, max_length=10000)


class AutonomousRunInput(BaseModel):
    mode: Literal["auto", "local_rules", "live"] = "auto"


class TaskInput(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    goal: str = Field(min_length=5, max_length=2000)
    expected_output: str = Field(min_length=3, max_length=1000)
    required_capabilities: list[str] = Field(min_length=1, max_length=10)


class ClaimInput(BaseModel):
    twin_id: str


class UpdateInput(BaseModel):
    twin_id: str
    kind: Literal["progress", "help"]
    summary: str = Field(min_length=3, max_length=3000)
    missing_capability: str = Field(default="", max_length=160)


class InviteInput(BaseModel):
    twin_id: str
    reason: str = Field(min_length=3, max_length=1000)


class ContributionInput(BaseModel):
    capability_id: str
    summary: str = Field(min_length=5, max_length=1000)
    evidence_indexes: list[int] = Field(min_length=1, max_length=100)


class DeliverableInput(BaseModel):
    twin_id: str
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=10, max_length=20000)
    evidence: list[str] = Field(default_factory=list, max_length=100)
    contributions: list[ContributionInput] = Field(default_factory=list, max_length=30)


class DecisionInput(BaseModel):
    decision: Literal["accepted", "rework"]
    feedback: str = Field(min_length=3, max_length=3000)


@router.post("/bootstrap", status_code=201)
def bootstrap(body: BootstrapInput, ctx=Depends(context)):
    if ctx["organization"]:
        fail("团队空间已经存在")
    with st.transaction() as db:
        organization = st.create_organization(
            db, ctx["account"]["id"], body.organization_name.strip()
        )
        st.product_audit(
            db, organization["id"], ctx["account"]["id"],
            "v2_workspace_created", "organization", organization["id"], {},
        )
    return {"organization": organization}


@router.get("/workspace")
def workspace(portal: Literal["employee", "operations"] | None = None, ctx=Depends(context)):
    if not ctx["organization"]:
        return {"account": ctx["account"], "organization": None}
    org_id = ctx["organization"]["id"]
    if portal == "operations" and not is_operator(ctx):
        fail("当前账号没有数字员工运营台权限", 403)
    employee_view = portal == "employee" or not is_operator(ctx)
    with st.transaction() as db:
        experts = all_objects(db, org_id, "expert")
        twins = all_objects(db, org_id, "twin")
        learning = all_objects(db, org_id, "learning")
        source_records = all_objects(db, org_id, "source")
        source_by_reference = {}
        for value in source_records:
            key = (
                value.get("owner_account_id"), value.get("source_type"),
                value.get("external_ref"), value.get("related_ref"),
            )
            source_by_reference[key] = value
        for kind, values in (("expert", experts), ("twin", twins), ("learning", learning)):
            for value in values:
                value["owner_account_id"] = object_owner(db, org_id, kind, value)
                if kind == "learning" and not value.get("active", True):
                    value.update(work_record="", understanding="", answer="", method="", boundary="")
        if employee_view:
            experts = [v for v in experts if v["owner_account_id"] == ctx["account"]["id"]]
            twins = [v for v in twins if v["owner_account_id"] == ctx["account"]["id"]]
            learning = [v for v in learning if v["owner_account_id"] == ctx["account"]["id"]]
        twin_ids = {v["id"] for v in twins}
        capabilities = [
            value for value in all_objects(db, org_id, "capability")
            if value["twin_id"] in twin_ids
        ]
        capability_by_learning_id = {
            learning_id: capability["id"]
            for capability in capabilities
            for learning_id in capability.get("learning_ids", [])
        }
        for value in learning:
            value["capability_id"] = capability_by_learning_id.get(value["id"])
        result = {
            "account": ctx["account"],
            "organization": {**ctx["organization"], "role": ctx["role"]},
            "can_operate": is_operator(ctx),
            "experts": experts, "twins": twins, "learning": learning,
            "sources": [
                source_view(value) for value in source_by_reference.values()
                if value.get("owner_account_id") == ctx["account"]["id"]
            ],
            "capabilities": capabilities,
            "trials": [v for v in all_objects(db, org_id, "trial")
                       if v["twin_id"] in twin_ids],
            "runtime": {
                "live_available": configuration()["live_available"],
                "live_model": configuration()["model"],
                "fallback": "local_rules_v1",
            },
        }
        for kind, key in (("task", "tasks"), ("team", "teams"), ("update", "updates"),
                          ("deliverable", "deliverables"), ("task_run", "task_runs")):
            # Operational records may contain other employees' private context.
            result[key] = [] if employee_view else all_objects(db, org_id, kind)
        revoked_capabilities = set()
        for capability in result["capabilities"]:
            if capability["status"] == "revoked":
                revoked_capabilities.add(capability["id"])
                capability.update(method="", boundary="")
        result["trials"] = [
            trial for trial in result["trials"]
            if trial["capability_id"] not in revoked_capabilities
        ]
        return result


@router.post("/experts", status_code=201)
def create_expert(body: ExpertInput, ctx=Depends(require_org)):
    expert = {
        "id": st.uid("EXP"), "name": body.name.strip(), "role": body.role.strip(),
        "knowledge_scope": body.knowledge_scope.strip(), "status": "active",
        "created_at": st.now(), "owner_account_id": ctx["account"]["id"],
    }
    with st.transaction() as db:
        save_object(db, ctx["organization"]["id"], "expert", expert)
        audit(db, ctx, "expert_created", "expert", expert["id"])
    return expert


@router.post("/twins", status_code=201)
def create_twin(body: TwinInput, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        expert = get_object(db, org_id, "expert", body.expert_id)
        require_owned(db, ctx, "expert", expert)
        twin = {
            "id": st.uid("TWIN"), "name": body.name.strip(),
            "role_goal": body.role_goal.strip(), "expert_id": expert["id"],
            "status": "apprentice", "delegation": "observe",
            "created_at": st.now(), "owner_account_id": ctx["account"]["id"],
        }
        save_object(db, org_id, "twin", twin)
        audit(db, ctx, "twin_created", "twin", twin["id"], {"expert_id": expert["id"]})
    return twin


@router.post("/learning", status_code=201)
def start_learning(body: LearningInput, ctx=Depends(require_org)):
    with st.transaction() as db:
        return create_learning_record(db, ctx, body)


def redact_material(text):
    patterns = [
        r"(?i)\b(?:api[_-]?key|utoken|access[_-]?token|authorization|password|secret)"
        r"\s*[:=]\s*[\"']?[^\s\"',;]+",
        r"\bsk-[A-Za-z0-9_-]{8,}",
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?"
        r"-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    ]
    count = 0
    for pattern in patterns:
        text, matches = re.subn(pattern, "**", text)
        count += matches
    return text, count


def source_command(source):
    if source["source_type"] == "lark_doc":
        if not re.match(
            r"^https://(?:[a-z0-9-]+\.)?larkoffice\.com/(?:docx|wiki)/[A-Za-z0-9]+",
            source["external_ref"],
        ):
            fail("请输入可访问的飞书文档或知识库链接", 422)
        return [
            "bytedcli", "--json", "lark", "docs", "fetch", "--as", "user",
            "--doc", source["external_ref"], "--doc-format", "markdown",
            "--detail", "simple",
        ]
    if source["source_type"] == "oncall_flow":
        if not re.match(
            r"^https://oncall\.bytedance\.net/.+[?&]cross_oncall_flow_id=\d+",
            source["external_ref"],
        ):
            fail("请输入包含流程号的 Oncall 工单链接", 422)
        match = re.search(
            r"(?:openChatId=|/chat/)(oc_[A-Za-z0-9_-]{20,})",
            source.get("related_ref") or "",
        )
        if not match:
            fail("请补充工单卡片中的关联飞书群链接", 422)
        return [
            "bytedcli", "--json", "lark", "im", "chat-messages-list",
            "--as", "user", "--chat-id", match.group(1), "--order", "asc",
            "--page-all", "--page-limit", "100", "--page-size", "50",
            "--no-reactions",
        ]
    fail("暂不支持该资料来源", 422)


def read_connected_source(source):
    if not shutil.which("bytedcli"):
        raise RuntimeError("本机未安装内部只读连接工具")
    try:
        result = subprocess.run(
            source_command(source), capture_output=True, text=True,
            timeout=60, check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("读取超过 60 秒，请稍后重试") from error
    if result.returncode:
        detail, _ = redact_material((result.stderr or result.stdout or "读取失败")[:1200])
        raise RuntimeError(detail)
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("来源返回了无法解析的数据") from error
    if payload.get("ok") is False or payload.get("status") == "error":
        raise RuntimeError(str(payload.get("error") or payload.get("message") or "读取失败"))
    if source["source_type"] == "lark_doc":
        document = payload.get("data", {}).get("document", {})
        content = document.get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("飞书文档没有返回可学习的正文")
        return content, str(document.get("revision_id") or ""), {
            "document_id": document.get("document_id"),
            "character_count": len(content),
        }
    data = payload.get("data", payload)
    messages = data.get("messages", []) if isinstance(data, dict) else []
    chunks = []
    for message in messages:
        if not isinstance(message, dict) or message.get("deleted"):
            continue
        content = message.get("content") or ""
        if isinstance(content, (dict, list)):
            content = json.dumps(content, ensure_ascii=False)
        if str(content).strip():
            chunks.append(
                f"[{message.get('create_time', '')}]"
                f"[位置 {message.get('message_position', '—')}] {content}\n"
                f"证据消息：{message.get('message_id', '—')}"
            )
    if not chunks:
        raise RuntimeError("关联飞书群没有返回可学习的消息")
    last = messages[-1]
    return "\n\n".join(chunks), str(
        last.get("message_id") or last.get("create_time") or len(messages)
    ), {
        "message_count": len(messages),
        "learnable_count": len(chunks),
        "skipped_count": len(messages) - len(chunks),
    }


def sync_source_record(ctx, source_id):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        source = get_object(db, org_id, "source", source_id)
        require_owned(db, ctx, "source", source)
    try:
        raw, cursor, metadata = read_connected_source(source)
        content, redactions = redact_material(raw)
        digest = hashlib.sha256(content.encode()).hexdigest()
        with st.transaction() as db:
            source = get_object(db, org_id, "source", source_id)
            unchanged = source.get("sha256") == digest
            source.update(
                status="ready", content=content, sha256=digest, cursor=cursor,
                metadata=metadata, redactions=redactions, last_error=None,
                last_success_at=st.now(), updated_at=st.now(),
            )
            save_object(db, org_id, "source", source)
            audit(db, ctx, "source_synced", "source", source_id, {
                "unchanged": unchanged, "redactions": redactions,
            })
        return {**source_view(source), "unchanged": unchanged}
    except (RuntimeError, HTTPException) as error:
        detail = error.detail if isinstance(error, HTTPException) else str(error)
        detail, _ = redact_material(detail)
        with st.transaction() as db:
            source = get_object(db, org_id, "source", source_id)
            source.update(status="error", last_error=detail[:1000], updated_at=st.now())
            save_object(db, org_id, "source", source)
        return source_view(source)


@router.post("/sources/connect", status_code=201)
def connect_source(body: SourceConnectInput, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    source = {
        "id": st.uid("SRC"), "source_type": body.source_type,
        "name": body.name.strip(), "external_ref": body.external_ref.strip(),
        "related_ref": body.related_ref.strip() if body.related_ref else None,
        "status": "connecting", "content": "", "cursor": None,
        "metadata": {}, "redactions": 0, "last_error": None,
        "last_success_at": None, "created_at": st.now(), "updated_at": st.now(),
        "owner_account_id": ctx["account"]["id"],
    }
    source_command(source)
    with st.transaction() as db:
        duplicate = next((
            value for value in all_objects(db, org_id, "source")
            if value.get("owner_account_id") == ctx["account"]["id"]
            and value.get("source_type") == source["source_type"]
            and value.get("external_ref") == source["external_ref"]
            and value.get("related_ref") == source.get("related_ref")
        ), None)
        if duplicate:
            source = duplicate
        else:
            save_object(db, org_id, "source", source)
            audit(db, ctx, "source_connected", "source", source["id"], {
                "source_type": source["source_type"],
            })
    return sync_source_record(ctx, source["id"])


@router.post("/sources/{source_id}/sync")
def sync_source(source_id: str, ctx=Depends(require_org)):
    return sync_source_record(ctx, source_id)


@router.post("/sources/{source_id}/assign", status_code=201)
def assign_source(source_id: str, body: SourceAssignInput, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        source = get_object(db, org_id, "source", source_id)
        require_owned(db, ctx, "source", source)
        if source["status"] != "ready" or not source.get("content"):
            fail("资料尚未读取成功，不能交给分身学习")
        twin = get_object(db, org_id, "twin", body.twin_id)
        require_owned(db, ctx, "twin", twin)
        for learning in all_objects(db, org_id, "learning"):
            if (learning["twin_id"] == twin["id"] and learning.get("active", True)
                    and learning.get("material", {}).get("source_id") == source_id
                    and learning.get("material", {}).get("sha256") == source["sha256"]):
                return {"learning": learning, "duplicate": True}
        content = source["content"]
        if len(content) > 20000:
            content = content[:19600] + "\n\n[资料较长：当前草稿仅使用首段，完整原文保留在学习资料库。]"
        learning = create_learning_record(db, ctx, LearningInput(
            expert_id=twin["expert_id"], twin_id=twin["id"],
            title=source["name"], work_record=content,
            source_label=("飞书文档" if source["source_type"] == "lark_doc"
                          else "Oncall 处理过程"),
        ), {
            "source_id": source_id, "sha256": source["sha256"],
            "kind": source["source_type"], "consent_at": st.now(),
        })
        source["assigned_twin_ids"] = sorted(set(
            source.get("assigned_twin_ids", []) + [twin["id"]]
        ))
        save_object(db, org_id, "source", source)
    return {"learning": learning, "duplicate": False}


def create_learning_record(db, ctx, body, material=None):
    org_id = ctx["organization"]["id"]
    get_object(db, org_id, "expert", body.expert_id)
    twin = get_object(db, org_id, "twin", body.twin_id)
    require_owned(db, ctx, "twin", twin)
    if twin["expert_id"] != body.expert_id:
        fail("这位专家尚未授权培养该数字员工")
    text, redactions = redact_material(body.work_record.strip())
    if len(text) < 10:
        fail("脱敏后有效资料不足，请提供包含方法和判断依据的资料", 422)
    learning = {
        "id": st.uid("LEARN"), "expert_id": body.expert_id, "twin_id": body.twin_id,
        "title": redact_material(body.title.strip())[0],
        "source_label": redact_material(body.source_label.strip())[0],
        "work_record": text, "status": "needs_clarification",
        "understanding": f"资料起点（规则摘录，未验证能力）：{text.split('。')[0][:180]}。",
        "question": "资料尚未验证：哪些情况下不能直接使用这套方法，需要暂停并找真人？",
        "answer": "", "method": "", "boundary": "", "active": True,
        "redactions": redactions, "draft_mode": "rule_excerpt",
        "created_at": st.now(), "owner_account_id": ctx["account"]["id"],
    }
    if material:
        learning["material"] = material
    save_object(db, org_id, "learning", learning)
    audit(db, ctx, "learning_started", "learning", learning["id"],
          {"redactions": redactions, "source_kind": "file" if material else "manual"})
    return learning


@router.post("/learning/import")
async def import_learning(
    twin_id: str = Form(...), consent: bool = Form(...),
    file: UploadFile = File(...), ctx=Depends(require_org),
):
    if not consent:
        fail("请确认你有权将资料授权给该数字分身", 422)
    filename = Path((file.filename or "").replace("\\", "/")).name
    if Path(filename).suffix.lower() not in (".md", ".txt") or len(filename) > 120:
        fail("仅支持文件名不超过 120 字符的 Markdown/TXT 资料", 422)
    raw = await file.read(256 * 1024 + 1)
    await file.close()
    if len(raw) > 256 * 1024:
        fail("资料超过 256KB，请按一个完整案例拆分后导入", 413)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        fail("资料不是 UTF-8 文本，请导出为 UTF-8 后重试", 422)
    if "\x00" in text or len(text.strip()) < 10 or len(text) > 20000:
        fail("资料需包含 10–20000 字符的有效文本，不支持二进制或超长内容", 422)
    # Hash before masking so distinct secret-only changes are not treated as identical.
    digest = hashlib.sha256(raw).hexdigest()
    with st.transaction() as db:
        twin = get_object(db, ctx["organization"]["id"], "twin", twin_id)
        require_owned(db, ctx, "twin", twin)
        for record in all_objects(db, ctx["organization"]["id"], "learning"):
            if (record["twin_id"] == twin_id and record.get("active", True)
                    and record.get("material", {}).get("sha256") == digest):
                return {"learning": record, "duplicate": True}
        title = Path(filename).stem
        body = LearningInput(
            expert_id=twin["expert_id"], twin_id=twin_id,
            title=title if len(title) >= 3 else f"{title}资料",
            work_record=text, source_label=filename,
        )
        learning = create_learning_record(db, ctx, body, {
            "filename": redact_material(filename)[0], "sha256": digest,
            "bytes": len(raw), "kind": "utf8_file", "consent_at": st.now(),
        })
    return {"learning": learning, "duplicate": False}


@router.post("/learning/{learning_id}/revoke")
def revoke_learning(learning_id: str, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        learning = get_object(db, org_id, "learning", learning_id)
        require_owned(db, ctx, "learning", learning)
        if not learning.get("active", True):
            return {"learning": {"id": learning_id, "active": False, "status": "revoked"}}
        learning.update(active=False, status="revoked", revoked_at=st.now())
        save_object(db, org_id, "learning", learning)
        affected = []
        for capability in all_objects(db, org_id, "capability"):
            if learning_id in capability.get("learning_ids", []):
                capability.update(status="revoked", level="印记暂停", delegation="observe")
                affected.append(capability["id"])
                save_object(db, org_id, "capability", capability)
        if affected:
            for task in all_objects(db, org_id, "task"):
                if learning["twin_id"] in task["member_ids"]:
                    task["authorization_affected"] = True
                    if task["status"] != "completed":
                        task["status"] = "blocked"
                    save_object(db, org_id, "task", task)
            twin = get_object(db, org_id, "twin", learning["twin_id"])
            if not any(c["twin_id"] == twin["id"] and c["status"] == "qualified"
                       for c in all_objects(db, org_id, "capability")):
                twin.update(status="apprentice", delegation="observe")
                save_object(db, org_id, "twin", twin)
        audit(db, ctx, "learning_revoked", "learning", learning_id,
              {"affected_capabilities": affected})
    return {"learning": {"id": learning_id, "active": False, "status": "revoked"}}


@router.post("/learning/{learning_id}/clarify")
def clarify_learning(learning_id: str, body: ClarifyInput, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        learning = get_object(db, org_id, "learning", learning_id)
        require_owned(db, ctx, "learning", learning)
        if learning["status"] not in ("needs_clarification", "draft"):
            fail("当前学习记录不需要继续澄清")
        learning["answer"] = body.answer.strip()
        learning["status"] = "draft"
        learning["understanding"] = (
            f"{learning['understanding']} 真人补充：{body.answer.strip()}"
        )
        save_object(db, org_id, "learning", learning)
        audit(db, ctx, "learning_clarified", "learning", learning_id)
    return learning


@router.post("/learning/{learning_id}/confirm", status_code=201)
def confirm_learning(learning_id: str, body: ConfirmLearningInput, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        learning = get_object(db, org_id, "learning", learning_id)
        require_owned(db, ctx, "learning", learning)
        if learning["status"] != "draft":
            fail("仅待确认的学习记录可以生成候选能力")
        if not learning["answer"]:
            fail("请先回答数字员工的澄清问题")
        learning.update(
            method=body.method.strip(), boundary=body.boundary.strip(), status="ready_for_trial"
        )
        capability = next((
            item for item in all_objects(db, org_id, "capability")
            if learning_id in item.get("learning_ids", [])
        ), None)
        if capability:
            capability.update(
                status="candidate", method=learning["method"],
                boundary=learning["boundary"], level="候选印记",
                revision=capability.get("revision", 1) + 1,
                updated_at=st.now(),
            )
        else:
            capability = {
                "id": st.uid("CAP"), "twin_id": learning["twin_id"],
                "name": learning["title"], "status": "candidate",
                "method": learning["method"], "boundary": learning["boundary"],
                "learning_ids": [learning["id"]], "level": "候选印记",
                "evidence_count": 1, "accepted_count": 0, "revision": 1,
                "created_at": st.now(),
            }
        save_object(db, org_id, "learning", learning)
        save_object(db, org_id, "capability", capability)
        audit(db, ctx, "capability_candidate_confirmed", "capability", capability["id"],
              {"revision": capability.get("revision", 1)})
    return {"learning": learning, "capability": capability}


@router.post("/learning/{learning_id}/rework")
def rework_learning(learning_id: str, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        learning = get_object(db, org_id, "learning", learning_id)
        if not is_operator(ctx):
            require_owned(db, ctx, "learning", learning)
        capability = next((
            item for item in all_objects(db, org_id, "capability")
            if learning_id in item.get("learning_ids", [])
        ), None)
        if not capability:
            fail("尚未形成候选能力，无需补学")
        trials = [
            item for item in all_objects(db, org_id, "trial")
            if item["capability_id"] == capability["id"]
        ]
        latest = trials[-1] if trials else None
        if not latest or latest["status"] != "failed":
            fail("只有考试未通过的能力可以进入补学")
        capability_revision = capability.get("revision", 1)
        trial_revision = latest.get("capability_revision", 1)
        if capability_revision > trial_revision:
            fail("修订已经确认，请由运营安排新一轮考试")
        failed_checks = [item["label"] for item in latest.get("checks", [])
                         if not item.get("passed")]
        learning.update(
            status="draft",
            question="上次考试未通过，请根据反馈修订方法与边界。",
            trial_feedback=failed_checks,
            updated_at=st.now(),
        )
        capability.update(status="relearning", level="补学中", updated_at=st.now())
        save_object(db, org_id, "learning", learning)
        save_object(db, org_id, "capability", capability)
        audit(db, ctx, "learning_rework_started", "learning", learning_id,
              {"trial_id": latest["id"], "failed_checks": failed_checks})
    return {"learning": learning, "capability": capability}


@router.post("/capabilities/{capability_id}/trial", status_code=201)
def create_trial(capability_id: str, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        capability = get_object(db, org_id, "capability", capability_id)
        if capability["status"] == "revoked":
            fail("来源授权已撤回，不能继续考核")
        if capability["status"] != "candidate":
            fail("能力尚未完成学习确认，不能安排考试")
        history = [
            item for item in all_objects(db, org_id, "trial")
            if item["capability_id"] == capability_id
        ]
        latest = history[-1] if history else None
        if (latest and latest["status"] == "failed"
                and capability.get("revision", 1)
                <= latest.get("capability_revision", 1)):
            fail("请先根据考试反馈完成补学并重新确认方法")
        existing = [
            item for item in history
            if item["capability_id"] == capability_id and item["status"] == "open"
        ]
        if existing:
            return existing[-1]
        trial = {
            "id": st.uid("TRIAL"), "capability_id": capability_id,
            "twin_id": capability["twin_id"], "status": "open",
            "scenario": (
                f"你收到一个与「{capability['name']}」相关的新任务，但现有信息不完整。"
                "请说明你会先检查什么、依据什么判断，以及何时暂停并请求真人。"
            ),
            "response": "", "score": None, "checks": [], "created_at": st.now(),
            "capability_revision": capability.get("revision", 1),
        }
        save_object(db, org_id, "trial", trial)
        audit(db, ctx, "trial_created", "trial", trial["id"])
    return trial


@router.get("/capabilities/{capability_id}/evidence")
def capability_evidence(capability_id: str, ctx=Depends(require_org)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        capability = get_object(db, org_id, "capability", capability_id)
        twin = get_object(db, org_id, "twin", capability["twin_id"])
        if not is_operator(ctx):
            require_owned(db, ctx, "twin", twin)
        sources = []
        for learning_id in capability.get("learning_ids", []):
            learning = get_object(db, org_id, "learning", learning_id)
            active = learning.get("active", True)
            sources.append({
                "id": learning_id, "title": learning["title"],
                "source_label": learning["source_label"], "active": active,
                "text": learning["work_record"] if active else None,
                "draft_mode": learning.get("draft_mode", "rule_excerpt"),
                "confirmed_method": learning["method"] if active else None,
                "confirmed_boundary": learning["boundary"] if active else None,
                "confirmed_by": object_owner(db, org_id, "learning", learning),
                "created_at": learning["created_at"],
            })
        trials = [t for t in all_objects(db, org_id, "trial")
                  if t["capability_id"] == capability_id]
        deliveries = []
        if all(s["active"] for s in sources):
            for credit in all_objects(db, org_id, "capability_credit"):
                if credit["capability_id"] != capability_id:
                    continue
                task = get_object(db, org_id, "task", credit["task_id"])
                if not task.get("authorization_affected"):
                    deliveries.append(credit)
        return {
            "capability": {"id": capability["id"], "name": capability["name"],
                           "status": capability["status"], "level": capability["level"]},
            "sources": sources,
            "trials": trials if all(s["active"] for s in sources) else [],
            "qualification_note": "规则评分检查文字中的证据与边界，不等于实际工作能力验证。",
            "delivery_note": "仅有明确贡献、成果依据且经真人验收的记录计入成长；历史计数不作为逐能力证明。",
            "deliveries": deliveries,
            "accepted_count": capability.get("accepted_count", 0),
        }


@router.post("/trials/{trial_id}/submit")
def submit_trial(trial_id: str, body: TrialSubmitInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        trial = get_object(db, org_id, "trial", trial_id)
        capability = get_object(db, org_id, "capability", trial["capability_id"])
        if capability["status"] == "revoked":
            fail("来源授权已撤回，考核不能恢复资格")
        if trial["status"] != "open":
            fail("本次考试已完成，请创建新的考试记录；不能覆盖既有结果")
        passed = grade_trial(db, org_id, trial, capability, body.response.strip(), {
            "engine": "human_calibration", "mode": "manual",
            "trajectory": ["运营人员提交校准答案", "独立规则评分"],
            "citations": capability.get("learning_ids", []),
        })
        save_object(db, org_id, "trial", trial)
        audit(db, ctx, "trial_submitted", "trial", trial_id, {"passed": passed})
    return {"trial": trial, "capability": capability}


def grade_trial(db, org_id, trial, capability, response, runtime):
    evidence_ok = any(word in response for word in ("证据", "检查", "确认", "来源"))
    boundary_ok = any(word in response for word in ("真人", "暂停", "升级", "不确定"))
    method_text = re.sub(r"[，。；、：！？,\s]", "", capability["method"])
    response_text = re.sub(r"[，。；、：！？,\s]", "", response)
    method_phrases = {
        method_text[index:index + 2]
        for index in range(max(0, len(method_text) - 1))
    }
    method_ok = sum(phrase in response_text for phrase in method_phrases) >= 3
    checks = [
        {"label": "先找证据再判断", "passed": evidence_ok},
        {"label": "识别能力边界", "passed": boundary_ok},
        {"label": "能复用已确认方法（文字规则检查）", "passed": method_ok},
    ]
    passed = all(item["passed"] for item in checks)
    trial.update(
        response=response, score=min(sum(34 if item["passed"] else 0 for item in checks), 100),
        checks=checks, status="passed" if passed else "failed", completed_at=st.now(),
        grading_mode="text_rules_v2", runtime=runtime, last_error=None,
    )
    if passed:
        capability.update(
            status="qualified", level="新手印记",
            delegation="recommend", trial_id=trial["id"],
        )
        twin = get_object(db, org_id, "twin", capability["twin_id"])
        twin.update(status="available", delegation="recommend")
        save_object(db, org_id, "twin", twin)
        save_object(db, org_id, "capability", capability)
    return passed


def resolved_runtime(mode):
    if mode == "live":
        if not configuration()["live_available"]:
            fail("真实模型未配置，不能静默改用本地规则引擎")
        return "live"
    if mode == "auto" and configuration()["live_available"]:
        return "live"
    return "local_rules"


@router.post("/trials/{trial_id}/run")
async def run_trial_autonomously(
    trial_id: str, body: AutonomousRunInput, ctx=Depends(require_operator)
):
    org_id = ctx["organization"]["id"]
    mode = resolved_runtime(body.mode)
    with st.transaction() as db:
        trial = get_object(db, org_id, "trial", trial_id)
        capability = get_object(db, org_id, "capability", trial["capability_id"])
        if trial["status"] != "open":
            fail("本次考试已经结束，不能重复运行")
        if capability["status"] == "revoked":
            fail("来源授权已撤回，不能运行考试")
        learning = [
            get_object(db, org_id, "learning", identifier)
            for identifier in capability.get("learning_ids", [])
        ]
        if not learning or any(not item.get("active", True) for item in learning):
            fail("考试所需的授权知识不可用")
        evidence = [
            {
                "id": item["id"], "title": item["title"],
                "method": item["method"], "boundary": item["boundary"],
                "source": item["source_label"],
            }
            for item in learning
        ]
        trial.update(status="running", started_at=st.now(), last_error=None)
        save_object(db, org_id, "trial", trial)
    try:
        if mode == "live":
            result = await generate(
                "live",
                f"独立完成考试。场景：{trial['scenario']}。说明检查、判断和升级边界。",
                evidence, {},
            )
            response = result["content"]
            citations = result["citations"]
            engine = configuration()["model"]
        else:
            response = (
                f"我会先按已确认方法检查并确认相关证据：{capability['method']} "
                f"完成检查后再判断。能力边界是：{capability['boundary']} "
                "如果证据不足、不确定或超出边界，我会暂停并升级真人，"
                "不执行未经授权的操作。"
            )
            citations = [item["id"] for item in evidence]
            engine = "local_rules_v1"
        runtime = {
            "engine": engine, "mode": mode, "citations": citations,
            "trajectory": [
                "读取本次考试场景",
                f"检索 {len(citations)} 条已授权学习记录",
                "生成独立判断与行动计划",
                "交由独立文字规则评分",
            ],
        }
        with st.transaction() as db:
            trial = get_object(db, org_id, "trial", trial_id)
            capability = get_object(db, org_id, "capability", trial["capability_id"])
            passed = grade_trial(db, org_id, trial, capability, response, runtime)
            save_object(db, org_id, "trial", trial)
            audit(db, ctx, "trial_autonomous_run", "trial", trial_id, {
                "passed": passed, "engine": engine, "mode": mode,
            })
        return {"trial": trial, "capability": capability}
    except HTTPException:
        raise
    except Exception as error:
        with st.transaction() as db:
            trial = get_object(db, org_id, "trial", trial_id)
            trial.update(status="open", last_error=str(error)[:1000])
            save_object(db, org_id, "trial", trial)
            audit(db, ctx, "trial_autonomous_failed", "trial", trial_id, {
                "error": str(error)[:500], "mode": mode,
            })
        fail(f"数字员工考试运行失败：{error}", 502)


def active_load(db, org_id, twin_id, exclude_task_id):
    return [
        other for other in all_objects(db, org_id, "task")
        if other["id"] != exclude_task_id and twin_id in other["member_ids"]
        and other["status"] in ("working", "blocked", "review")
    ]


def helper_candidates(db, org_id, task):
    gaps = [
        update for update in all_objects(db, org_id, "update")
        if update["task_id"] == task["id"] and update["kind"] == "help"
        and not update.get("resolved_by")
    ]
    capabilities = all_objects(db, org_id, "capability")
    candidates = []
    for twin in all_objects(db, org_id, "twin"):
        if twin["id"] in task["member_ids"]:
            continue
        names = {
            c["name"] for c in capabilities
            if c["twin_id"] == twin["id"] and c["status"] == "qualified"
        }
        covered = [gap for gap in gaps if gap["missing_capability"] in names]
        load = active_load(db, org_id, twin["id"], task["id"])
        eligible = bool(covered) and not load
        candidates.append({
            "twin_id": twin["id"], "twin_name": twin["name"],
            "eligible": eligible,
            "covers": list(dict.fromkeys(g["missing_capability"] for g in covered)),
            "gap_ids": [g["id"] for g in covered],
            "active_task_count": len(load),
            "reason": (
                "正在承担其他未完成任务，需等待负载释放" if load
                else "具备补齐当前缺口的有效考试资格" if covered
                else "没有补齐当前缺口的有效考试资格"
            ),
        })
    candidates.sort(key=lambda c: (not c["eligible"], -len(c["covers"]), c["twin_id"]))
    return gaps, candidates


@router.get("/tasks/{task_id}/helpers")
def get_helpers(task_id: str, ctx=Depends(require_operator)):
    with st.transaction() as db:
        org_id = ctx["organization"]["id"]
        task = get_object(db, org_id, "task", task_id)
        if task.get("authorization_affected"):
            fail("任务来源授权受影响，不能查询协作建议")
        if task["status"] not in ("working", "blocked") or not task["member_ids"]:
            fail("只有已认领的执行中任务可以查询帮手")
        gaps, candidates = helper_candidates(db, org_id, task)
        return {
            "task_id": task_id,
            "gaps": [{"id": g["id"], "capability": g["missing_capability"]} for g in gaps],
            "candidates": candidates,
            "mode": "qualification_rules",
        }


def task_assessments(db, org_id: str, task: dict):
    capabilities = all_objects(db, org_id, "capability")
    twins = all_objects(db, org_id, "twin")
    result = []
    for twin in twins:
        qualified = [
            item for item in capabilities
            if item["twin_id"] == twin["id"] and item["status"] == "qualified"
        ]
        names = {item["name"] for item in qualified}
        covered = [name for name in task["required_capabilities"] if name in names]
        missing = [name for name in task["required_capabilities"] if name not in names]
        busy = active_load(db, org_id, twin["id"], task["id"])
        result.append({
            "twin_id": twin["id"], "twin_name": twin["name"],
            "verdict": "busy" if busy else "can_claim" if not missing else "needs_help",
            "covered": covered, "missing": missing,
            "active_task_count": len(busy),
            "reason": (
                "正在承担其他未完成任务，需等待负载释放。" if busy
                else (f"已通过 {len(covered)} 项所需能力的试岗。"
                      if not missing else f"可以承担 {len(covered)} 项，但缺少：{'、'.join(missing)}。")
            ),
        })
    return result


@router.post("/tasks", status_code=201)
def create_task(body: TaskInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        task = {
            "id": st.uid("TASK"), "title": body.title.strip(), "goal": body.goal.strip(),
            "expected_output": body.expected_output.strip(),
            "required_capabilities": list(dict.fromkeys(body.required_capabilities)),
            "status": "assessing", "member_ids": [], "team_id": None,
            "progress": 0, "created_at": st.now(),
        }
        task["assessments"] = task_assessments(db, org_id, task)
        save_object(db, org_id, "task", task)
        audit(db, ctx, "task_published", "task", task["id"])
    return task


@router.post("/tasks/{task_id}/claim")
def claim_task(task_id: str, body: ClaimInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        task = get_object(db, org_id, "task", task_id)
        if task["member_ids"]:
            fail("任务已经被认领")
        task["assessments"] = task_assessments(db, org_id, task)
        assessment = next(
            (item for item in task["assessments"] if item["twin_id"] == body.twin_id), None
        )
        if not assessment or assessment["verdict"] != "can_claim":
            fail("该员工尚不能独立承担这项任务")
        task.update(member_ids=[body.twin_id], status="working", progress=10)
        save_object(db, org_id, "task", task)
        audit(db, ctx, "task_claimed", "task", task_id, {"twin_id": body.twin_id})
    return task


@router.post("/tasks/{task_id}/run")
async def run_task_autonomously(
    task_id: str, body: AutonomousRunInput, ctx=Depends(require_operator)
):
    org_id = ctx["organization"]["id"]
    mode = resolved_runtime(body.mode)
    with st.transaction() as db:
        task = get_object(db, org_id, "task", task_id)
        if task.get("authorization_affected"):
            fail("任务来源授权受影响，不能运行")
        if task["status"] not in ("assessing", "working"):
            fail("只有待认领或执行中的任务可以启动数字员工")
        if task["status"] == "assessing":
            task["assessments"] = task_assessments(db, org_id, task)
            eligible = [
                item for item in task["assessments"] if item["verdict"] == "can_claim"
            ]
            if not eligible:
                fail("没有同时满足能力资格与当前负载要求的数字员工")
            selected = eligible[0]
            task.update(
                member_ids=[selected["twin_id"]], status="working", progress=10,
                claim_reason=selected["reason"], claimed_by="digital_worker_engine",
            )
        twin = get_object(db, org_id, "twin", task["member_ids"][0])
        capabilities = [
            item for item in all_objects(db, org_id, "capability")
            if item["twin_id"] in task["member_ids"] and item["status"] == "qualified"
            and item["name"] in task["required_capabilities"]
        ]
        learning = []
        for capability in capabilities:
            for identifier in capability.get("learning_ids", []):
                item = get_object(db, org_id, "learning", identifier)
                if item.get("active", True):
                    learning.append(item)
        if not capabilities or not learning:
            fail("没有可供本次任务使用的已授权能力证据")
        evidence = [
            {
                "id": item["id"], "title": item["title"],
                "source": item["source_label"], "method": item["method"],
                "boundary": item["boundary"],
            }
            for item in learning
        ]
        run = {
            "id": st.uid("RUN"), "task_id": task_id, "twin_id": twin["id"],
            "status": "running", "mode": mode,
            "engine": configuration()["model"] if mode == "live" else "local_rules_v1",
            "started_at": st.now(), "citations": [item["id"] for item in evidence],
            "trajectory": [
                "根据能力资格与负载自主认领任务",
                f"检索 {len(evidence)} 条已授权经验",
                "按照已确认方法生成执行方案与成果草稿",
                "提交运营人员独立验收",
            ],
        }
        task.update(progress=45, active_run_id=run["id"])
        save_object(db, org_id, "task_run", run)
        save_object(db, org_id, "task", task)
    try:
        if mode == "live":
            result = await generate(
                "live",
                (
                    f"完成任务草稿。任务：{task['title']}；目标：{task['goal']}；"
                    f"期望成果：{task['expected_output']}。只能陈述授权资料支持的事实；"
                    "无法真实检查外部系统时必须写明待验证项和真人动作。"
                ),
                evidence, {},
            )
            content = result["content"]
            citations = result["citations"]
        else:
            methods = "；".join(dict.fromkeys(item["method"] for item in evidence))
            boundaries = "；".join(dict.fromkeys(item["boundary"] for item in evidence))
            content = (
                f"## {task['title']}执行草稿\n\n"
                f"目标：{task['goal']}\n\n"
                f"已按授权经验形成执行方案：{methods}\n\n"
                f"风险与升级边界：{boundaries}\n\n"
                "当前未连接实际业务系统，因此不伪造压测结果、监控数值或执行成功。"
                "需要运营人员核对下列来源，补充真实运行数据后再决定是否验收。"
            )
            citations = [item["id"] for item in evidence]
        evidence_lines = [
            f"{item['source']}｜{item['title']}｜学习记录 {item['id']}"
            for item in evidence if item["id"] in citations
        ]
        contributions = [
            {
                "capability_id": capability["id"],
                "twin_id": capability["twin_id"],
                "twin_name": "",
                "capability_name": capability["name"],
                "summary": f"依据已确认方法生成「{task['title']}」执行方案与边界判断",
                "evidence_indexes": [
                    index for index, item in enumerate(evidence)
                    if item["id"] in capability.get("learning_ids", [])
                    and item["id"] in citations
                ],
            }
            for capability in capabilities
        ]
        with st.transaction() as db:
            task = get_object(db, org_id, "task", task_id)
            run = get_object(db, org_id, "task_run", task["active_run_id"])
            for contribution in contributions:
                contribution["twin_name"] = get_object(
                    db, org_id, "twin", contribution["twin_id"]
                )["name"]
            existing = [
                item for item in all_objects(db, org_id, "deliverable")
                if item["task_id"] == task_id
            ]
            deliverable = {
                "id": st.uid("DEL"), "task_id": task_id, "version": len(existing) + 1,
                "title": f"{task['title']}｜数字员工执行草稿",
                "content": content, "evidence": evidence_lines,
                "author_twin_id": task["member_ids"][0], "status": "review",
                "created_at": st.now(), "contributions": contributions,
                "runtime": {
                    "engine": run["engine"], "mode": mode,
                    "run_id": run["id"], "citations": citations,
                    "external_execution": False,
                },
            }
            update = {
                "id": st.uid("UPD"), "task_id": task_id,
                "twin_id": task["member_ids"][0], "kind": "progress",
                "summary": (
                    f"数字员工已检索 {len(citations)} 条授权经验，"
                    "完成执行方案与成果草稿，等待真人验收。"
                ),
                "missing_capability": "", "created_at": st.now(),
                "generated_by": run["engine"],
            }
            run.update(status="completed", completed_at=st.now(),
                       deliverable_id=deliverable["id"], citations=citations)
            task.update(status="review", progress=100)
            save_object(db, org_id, "update", update)
            save_object(db, org_id, "deliverable", deliverable)
            save_object(db, org_id, "task_run", run)
            save_object(db, org_id, "task", task)
            audit(db, ctx, "task_autonomous_run", "task", task_id, {
                "engine": run["engine"], "mode": mode,
                "deliverable_id": deliverable["id"],
            })
        return {"task": task, "run": run, "deliverable": deliverable}
    except HTTPException:
        raise
    except Exception as error:
        with st.transaction() as db:
            task = get_object(db, org_id, "task", task_id)
            run = get_object(db, org_id, "task_run", task["active_run_id"])
            run.update(status="failed", completed_at=st.now(), error=str(error)[:1000])
            task.update(status="working", progress=10, last_error=str(error)[:1000])
            save_object(db, org_id, "task_run", run)
            save_object(db, org_id, "task", task)
            audit(db, ctx, "task_autonomous_failed", "task", task_id, {
                "error": str(error)[:500], "mode": mode,
            })
        fail(f"数字员工任务运行失败：{error}", 502)


@router.post("/tasks/{task_id}/updates", status_code=201)
def add_update(task_id: str, body: UpdateInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        task = get_object(db, org_id, "task", task_id)
        if task.get("authorization_affected"):
            fail("任务来源授权受影响，需处理后再继续")
        if task["status"] not in ("working", "blocked"):
            fail("只有执行中任务可以更新工作；待验收或已完成任务不能重新开启")
        if body.twin_id not in task["member_ids"]:
            fail("只有任务执行成员可以更新工作")
        update = {
            "id": st.uid("UPD"), "task_id": task_id, "twin_id": body.twin_id,
            "kind": body.kind, "summary": body.summary.strip(),
            "missing_capability": body.missing_capability.strip(), "created_at": st.now(),
        }
        if body.kind == "help":
            if not body.missing_capability.strip():
                fail("请说明缺少哪项能力", 422)
            task["status"] = "blocked"
        else:
            task["progress"] = min(90, task["progress"] + 20)
        save_object(db, org_id, "update", update)
        save_object(db, org_id, "task", task)
        audit(db, ctx, "work_updated", "task", task_id, {"kind": body.kind})
    return {"task": task, "update": update}


@router.post("/tasks/{task_id}/invite")
def invite_member(task_id: str, body: InviteInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        task = get_object(db, org_id, "task", task_id)
        if task.get("authorization_affected"):
            fail("任务来源授权受影响，不能用邀请绕过")
        if task["status"] not in ("working", "blocked") or not task["member_ids"]:
            fail("只有已认领的执行中任务可以邀请成员")
        get_object(db, org_id, "twin", body.twin_id)
        if body.twin_id in task["member_ids"]:
            fail("该员工已经在任务中")
        gaps, candidates = helper_candidates(db, org_id, task)
        if not gaps:
            fail("请先由执行成员报告具体能力缺口，再邀请帮手")
        candidate = next(c for c in candidates if c["twin_id"] == body.twin_id)
        if not candidate["eligible"]:
            fail(candidate["reason"])
        matching = [gap for gap in gaps if gap["id"] in candidate["gap_ids"]]
        for gap in matching:
            gap.update(resolved_by=body.twin_id, resolved_at=st.now())
            save_object(db, org_id, "update", gap)
        task["member_ids"].append(body.twin_id)
        task["status"] = "blocked" if len(matching) < len(gaps) else "working"
        task["progress"] = max(task["progress"], 35)
        if len(task["member_ids"]) >= 3 and not task["team_id"]:
            team = {
                "id": st.uid("TEAM"), "task_id": task_id,
                "name": f"{task['title'][:12]}任务组",
                "member_ids": list(task["member_ids"]),
                "created_reason": "第三名执行成员加入", "created_at": st.now(),
            }
            task["team_id"] = team["id"]
            save_object(db, org_id, "team", team)
        elif task["team_id"]:
            team = get_object(db, org_id, "team", task["team_id"])
            team["member_ids"] = list(task["member_ids"])
            save_object(db, org_id, "team", team)
        save_object(db, org_id, "task", task)
        audit(
            db, ctx, "task_member_invited", "task", task_id,
            {"twin_id": body.twin_id, "reason": body.reason},
        )
    return task


@router.post("/tasks/{task_id}/deliverables", status_code=201)
def submit_deliverable(task_id: str, body: DeliverableInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        task = get_object(db, org_id, "task", task_id)
        if task.get("authorization_affected"):
            fail("任务来源授权受影响，不能提交成果")
        if task["status"] not in ("working", "blocked"):
            fail("只能在执行阶段提交成果；待验收或已完成任务不能重复提交")
        if body.twin_id not in task["member_ids"]:
            fail("只有任务执行成员可以提交成果")
        contributions = []
        seen = set()
        for contribution in body.contributions:
            if contribution.capability_id in seen:
                fail("同一成果不能重复声明同一能力贡献", 422)
            seen.add(contribution.capability_id)
            capability = get_object(db, org_id, "capability", contribution.capability_id)
            if capability["status"] != "qualified" or capability["twin_id"] not in task["member_ids"]:
                fail("贡献只能关联任务成员当前有效的已验证能力")
            indexes = list(dict.fromkeys(contribution.evidence_indexes))
            if any(index < 0 or index >= len(body.evidence) or not body.evidence[index].strip()
                   for index in indexes):
                fail("能力贡献必须引用该成果中有效的证据项", 422)
            contributions.append({
                "capability_id": capability["id"], "twin_id": capability["twin_id"],
                "twin_name": get_object(db, org_id, "twin", capability["twin_id"])["name"],
                "capability_name": capability["name"], "summary": contribution.summary.strip(),
                "evidence_indexes": indexes,
            })
        existing = [
            item for item in all_objects(db, org_id, "deliverable")
            if item["task_id"] == task_id
        ]
        deliverable = {
            "id": st.uid("DEL"), "task_id": task_id, "version": len(existing) + 1,
            "title": body.title.strip(), "content": body.content.strip(),
            "evidence": body.evidence, "author_twin_id": body.twin_id,
            "status": "review", "created_at": st.now(),
            "contributions": contributions,
        }
        task.update(status="review", progress=100)
        save_object(db, org_id, "deliverable", deliverable)
        save_object(db, org_id, "task", task)
        audit(db, ctx, "deliverable_submitted", "deliverable", deliverable["id"])
    return {"task": task, "deliverable": deliverable}


@router.post("/deliverables/{deliverable_id}/decision")
def decide_deliverable(deliverable_id: str, body: DecisionInput, ctx=Depends(require_operator)):
    org_id = ctx["organization"]["id"]
    with st.transaction() as db:
        deliverable = get_object(db, org_id, "deliverable", deliverable_id)
        task = get_object(db, org_id, "task", deliverable["task_id"])
        if task.get("authorization_affected"):
            fail("任务来源授权受影响，不能继续验收")
        if deliverable["status"] in ("accepted", "rework"):
            if deliverable["status"] == body.decision:
                return {"task": task, "deliverable": deliverable}
            fail("这版成果已经完成验收，不能重复修改结论")
        latest = max(
            (d for d in all_objects(db, org_id, "deliverable") if d["task_id"] == task["id"]),
            key=lambda d: d["version"],
        )
        if latest["id"] != deliverable_id or task["status"] != "review":
            fail("只能验收当前待评审版本")
        if body.decision == "accepted":
            for contribution in deliverable.get("contributions", []):
                capability = get_object(db, org_id, "capability", contribution["capability_id"])
                if capability["status"] != "qualified":
                    fail("贡献能力已经失效，不能验收回流")
        deliverable.update(
            status=body.decision, feedback=body.feedback.strip(), decided_at=st.now(),
            decided_by=ctx["account"]["id"],
        )
        task["status"] = "completed" if body.decision == "accepted" else "working"
        if body.decision == "rework":
            task["progress"] = 80
        else:
            for contribution in deliverable.get("contributions", []):
                capability = get_object(db, org_id, "capability", contribution["capability_id"])
                credit_id = f"{task['id']}:{capability['id']}"
                if st.product_get(db, org_id, "v2_capability_credit", credit_id):
                    continue
                credit = {
                    "id": credit_id, **contribution, "task_id": task["id"],
                    "task_title": task["title"], "deliverable_id": deliverable_id,
                    "deliverable_title": deliverable["title"], "version": deliverable["version"],
                    "evidence": [deliverable["evidence"][i] for i in contribution["evidence_indexes"]],
                    "reviewed_by": ctx["account"]["id"], "feedback": body.feedback.strip(),
                    "created_at": st.now(),
                }
                save_object(db, org_id, "capability_credit", credit)
                credits = [c for c in all_objects(db, org_id, "capability_credit")
                           if c["capability_id"] == capability["id"]]
                capability["accepted_count"] = len(credits)
                capability["level"] = "熟手印记" if len(credits) >= 3 else "新手印记"
                save_object(db, org_id, "capability", capability)
        save_object(db, org_id, "deliverable", deliverable)
        save_object(db, org_id, "task", task)
        audit(
            db, ctx, "deliverable_decided", "deliverable", deliverable_id,
            {"decision": body.decision},
        )
    return {"task": task, "deliverable": deliverable}
