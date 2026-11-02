"""Product domain foundation: organization-scoped, durable, and auditable."""
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from itertools import combinations
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

import store as st
from model import configuration, generate_trial


router = APIRouter(prefix="/api/product", tags=["product"])


class BootstrapInput(BaseModel):
    organization_name: str = Field(min_length=1, max_length=80)


class HumanInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=160)
    consent_scope: str = Field(min_length=3, max_length=1000)


class WorkerInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role_goal: str = Field(min_length=3, max_length=500)
    mentor_ids: list[str] = Field(default_factory=list, max_length=30)


class CaseInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    goal: str = Field(min_length=3, max_length=1000)
    domain: str = Field(min_length=2, max_length=120)
    occurred_at: str | None = Field(default=None, max_length=80)


class SourceInput(BaseModel):
    source_type: Literal["oncall_chat", "lark_doc", "ticket", "change", "ai_trace", "file", "manual"]
    title: str = Field(min_length=1, max_length=240)
    external_ref: str = Field(min_length=1, max_length=2000)
    access_status: Literal["pending", "success", "denied", "failed"] = "pending"
    redaction_status: Literal["pending", "redacted", "blocked"] = "pending"
    content: str = Field(default="", max_length=200000)


class ConnectorInput(BaseModel):
    connector_type: Literal["lark_doc", "lark_oncall_ticket", "oncall_flow"]
    name: str = Field(min_length=1, max_length=160)
    case_id: str
    external_ref: str = Field(min_length=1, max_length=2000)
    related_ref: str | None = Field(default=None, max_length=2000)


class ConnectorSyncInput(BaseModel):
    force: bool = False


class ConnectorAutomationInput(BaseModel):
    enabled: bool
    interval_minutes: Literal[15, 30, 60, 180, 360, 720, 1440] = 60


class OrganizationMemberInput(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    role: Literal["admin", "member", "reviewer"] = "member"


class CompileInput(BaseModel):
    force: bool = False


class LearningInput(BaseModel):
    capability_name: str = Field(min_length=2, max_length=120)
    experience_ids: list[str] = Field(min_length=1, max_length=100)


class TrialActionInput(BaseModel):
    operation: str = Field(min_length=1, max_length=160)
    mode: Literal["inspect", "recommend", "execute", "escalate"]
    evidence_event_ids: list[str] = Field(default_factory=list, max_length=100)


class TrialRunInput(BaseModel):
    disposition: Literal["proceed", "escalate", "insufficient_evidence"]
    summary: str = Field(min_length=3, max_length=5000)
    cited_event_ids: list[str] = Field(min_length=1, max_length=100)
    actions: list[TrialActionInput] = Field(default_factory=list, max_length=100)
    runner: Literal["human_submitted", "external_agent", "local_evidence_agent"] = "human_submitted"
    runtime: dict[str, Any] = Field(default_factory=dict)


class CapabilityMarkInput(BaseModel):
    scope: str = Field(min_length=3, max_length=1000)
    forbidden_actions: list[str] = Field(min_length=1, max_length=100)


class AutoTrialInput(BaseModel):
    mode: Literal["live"] = "live"


class ProductTaskInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    goal: str = Field(min_length=5, max_length=2000)
    expected_output: str = Field(min_length=3, max_length=1000)
    required_capabilities: list[str] = Field(min_length=1, max_length=20)
    risk_level: Literal["low", "medium", "high"] = "low"


class TaskClaimInput(BaseModel):
    worker_id: str
    capability_mark_id: str
    rationale: str = Field(min_length=3, max_length=1000)


class TaskInviteInput(TaskClaimInput):
    invited_by_worker_id: str


class TaskAutoClaimInput(BaseModel):
    assessment_id: str


class TaskAutoTeamInput(BaseModel):
    proposal_id: str


class TaskAutoInviteInput(BaseModel):
    suggestion_id: str


class WorkUpdateInput(BaseModel):
    update_type: Literal["progress", "blocker", "help_request", "result"]
    summary: str = Field(min_length=3, max_length=5000)
    author_worker_id: str
    evidence_refs: list[str] = Field(default_factory=list, max_length=100)
    performed_actions: list[str] = Field(default_factory=list, max_length=100)
    missing_capabilities: list[str] = Field(default_factory=list, max_length=20)


class HumanOutcomeInput(BaseModel):
    decision: Literal["accepted", "rework", "taken_over"]
    summary: str = Field(min_length=3, max_length=5000)
    actual_result: str = Field(min_length=3, max_length=10000)
    deliverable_id: str | None = None


class DeliverableInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    content: str = Field(min_length=3, max_length=20000)
    author_worker_id: str
    citation_refs: list[str] = Field(default_factory=list, max_length=100)
    performed_actions: list[str] = Field(default_factory=list, max_length=100)
    change_summary: str = Field(default="", max_length=1000)


SECRET_PATTERNS = [
    re.compile(r"(?i)\b(api[_-]?key|utoken|authorization|cookie|access[_-]?token|secret)\b\s*[:=]\s*\S+"),
    re.compile(r"(?i)\b(AK|SK)\b\s*[:=]\s*[A-Za-z0-9_./+-]{8,}"),
]
RESULT_WORDS = ("恢复", "通过", "完成", "成功率", "失败", "回滚", "复测", "验收")
ACTION_WORDS = ("检查", "查询", "调整", "扩容", "关闭", "开启", "修改", "排查", "重试", "回滚")
INFERENCE_WORDS = ("可能", "怀疑", "推测", "判断", "预计", "或许", "应该是")
RISK_WORDS = ("必须", "不能", "不得", "禁止", "仅用于", "需要确认", "待验证", "缺失")
CONNECTOR_LEASE_MINUTES = 2
CONNECTOR_RETRY_MINUTES = (1, 5, 15, 60, 180, 360)


def utc_now():
    return datetime.now(timezone.utc)


def iso_after(minutes):
    return (utc_now() + timedelta(minutes=minutes)).isoformat()


def is_future(value):
    if not value:
        return False
    try:
        return datetime.fromisoformat(value) > utc_now()
    except (TypeError, ValueError):
        return False


def split_sentences(text):
    return [piece.strip(" \t-•") for piece in re.split(r"[\n。！？!?；;]+", text) if piece.strip()]


def sentence_spans(text):
    spans = []
    cursor = 0
    for match in re.finditer(r"[^。\n！？!?；;]+", text):
        raw = match.group()
        content = raw.strip(" \t-•")
        if not content:
            continue
        left_trim = len(raw) - len(raw.lstrip(" \t-•"))
        start = match.start() + left_trim
        spans.append((content, start, start + len(content), cursor))
        cursor += 1
    return spans


def classify_sentence(sentence):
    if any(word in sentence for word in RESULT_WORDS):
        return "result"
    if any(word in sentence for word in ACTION_WORDS):
        return "action"
    if any(word in sentence for word in INFERENCE_WORDS):
        return "inference"
    return "fact"


def redact_content(text):
    value = text
    hits = []
    for pattern in SECRET_PATTERNS:
        def replace(match):
            hits.append(match.group(1) if match.lastindex else "secret")
            return f"{match.group(1)}=******" if match.lastindex else "******"
        value = pattern.sub(replace, value)
    return value, sorted(set(hits))


def connector_command(connector):
    if connector["connector_type"] == "lark_doc":
        reference = connector["external_ref"]
        if not re.match(
                r"^https://(?:[a-z0-9-]+\.)?larkoffice\.com/(?:docx|wiki)/[A-Za-z0-9]+",
                reference):
            raise HTTPException(422, "请输入可访问的飞书文档或知识库链接")
        return [
            "bytedcli", "--json", "lark", "docs", "fetch",
            "--as", "user", "--doc", reference,
            "--doc-format", "markdown", "--detail", "simple",
        ]
    if connector["connector_type"] == "lark_oncall_ticket":
        reference = connector["external_ref"].strip()
        if not re.match(r"^[A-Za-z0-9_-]{6,160}$", reference):
            raise HTTPException(422, "请输入 Oncall Ticket ID，不要粘贴 Cookie 或 Token")
        return [
            "bytedcli", "--json", "lark-oncall", "ticket", "get",
            "--ticket-id", reference, "--with-messages", "--message-limit", "500",
        ]
    if connector["connector_type"] == "oncall_flow":
        flow_url = connector["external_ref"].strip()
        if not re.match(
                r"^https://oncall\.bytedance\.net/.+[?&]cross_oncall_flow_id=\d+",
                flow_url):
            raise HTTPException(422, "请输入包含流程号的 Oncall 工单链接")
        related_ref = (connector.get("related_ref") or "").strip()
        match = re.search(r"(?:openChatId=|/chat/)(oc_[A-Za-z0-9_-]{20,})", related_ref)
        if not match:
            raise HTTPException(422, "请补充该工单卡片中的关联飞书群链接")
        return [
            "bytedcli", "--json", "lark", "im", "chat-messages-list",
            "--as", "user", "--chat-id", match.group(1), "--order", "asc",
            "--page-all", "--page-limit", "100", "--page-size", "50",
            "--no-reactions",
        ]
    raise HTTPException(422, "不支持的连接器类型")


def run_connector(connector):
    """Run an allowlisted read-only connector. Credentials remain in bytedcli."""
    if not shutil.which("bytedcli"):
        raise RuntimeError("当前服务未安装 bytedcli，无法连接内部工作系统")
    command = connector_command(connector)
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=45, check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("连接器请求超过 45 秒，未写入任何来源") from error
    if result.returncode:
        message = (result.stderr or result.stdout or "未知错误").strip()
        message, _ = redact_content(message)
        raise RuntimeError(f"连接器调用失败：{message[:800]}")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("连接器返回了无法解析的数据，未写入任何来源") from error
    if payload.get("ok") is False or payload.get("status") == "error":
        message = payload.get("error") or payload.get("message") or "读取失败"
        raise RuntimeError(f"连接器读取失败：{str(message)[:800]}")
    return payload


def normalize_connector_payload(connector, payload):
    if connector["connector_type"] == "lark_doc":
        document = payload.get("data", {}).get("document", {})
        content = document.get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("飞书文档没有返回可学习的正文")
        return {
            "external_item_id": str(
                document.get("document_id") or connector["external_ref"]),
            "cursor": str(document.get("revision_id", "")),
            "title": connector["name"],
            "content": content,
            "source_type": "lark_doc",
            "metadata": {"revision_id": document.get("revision_id")},
        }
    data = payload.get("data", payload)
    if connector["connector_type"] == "oncall_flow":
        messages = data.get("messages", []) if isinstance(data, dict) else []
        if not messages:
            raise RuntimeError("关联飞书群没有返回可学习的消息")
        chunks = []
        for message in messages:
            if not isinstance(message, dict) or message.get("deleted"):
                continue
            content = message.get("content") or ""
            if isinstance(content, (dict, list)):
                content = json.dumps(content, ensure_ascii=False)
            if not str(content).strip():
                continue
            chunks.append(
                f"[{message.get('create_time', '')}]"
                f"[{message.get('msg_type', 'message')}]"
                f"[位置 {message.get('message_position', '—')}] "
                f"{content}\n证据消息：{message.get('message_id', '—')}")
        if not chunks:
            raise RuntimeError("关联飞书群没有返回可学习的有效消息")
        last = messages[-1]
        chat_match = re.search(
            r"(oc_[A-Za-z0-9_-]{20,})", connector.get("related_ref") or "")
        flow_match = re.search(
            r"cross_oncall_flow_id=(\d+)", connector["external_ref"])
        return {
            "external_item_id": (
                f"oncall-flow:{flow_match.group(1)}" if flow_match
                else connector["external_ref"]),
            "cursor": str(
                last.get("message_id") or last.get("create_time") or len(messages)),
            "title": connector["name"],
            "content": "\n\n".join(chunks),
            "source_type": "oncall_chat",
            "metadata": {
                "message_count": len(messages),
                "learnable_message_count": len(chunks),
                "skipped_message_count": len(messages) - len(chunks),
                "chat_id": chat_match.group(1) if chat_match else None,
                "last_message_id": last.get("message_id"),
            },
        }
    ticket = data.get("ticket", data) if isinstance(data, dict) else {}
    messages = data.get("messages", []) if isinstance(data, dict) else []
    title = ticket.get("title") or connector["name"]
    chunks = [f"Oncall 工单：{title}"]
    for message in messages:
        if not isinstance(message, dict):
            continue
        sender = message.get("sender_name") or message.get("sender") or "成员"
        content = (
            message.get("content") or message.get("text")
            or message.get("message") or "")
        if isinstance(content, (dict, list)):
            content = json.dumps(content, ensure_ascii=False)
        if str(content).strip():
            chunks.append(f"{sender}：{content}")
    if len(chunks) == 1:
        summary = ticket.get("description") or ticket.get("content") or ""
        if summary:
            chunks.append(str(summary))
    if len(chunks) == 1:
        raise RuntimeError("Oncall 工单没有返回可学习的正文或群消息")
    return {
        "external_item_id": str(ticket.get("id") or connector["external_ref"]),
        "cursor": str(
            ticket.get("updated_at") or ticket.get("update_time")
            or len(messages)),
        "title": title,
        "content": "\n".join(chunks),
        "source_type": "oncall_chat",
        "metadata": {"message_count": len(messages)},
    }


def connector_actor(db, organization_id, preferred=None):
    if preferred:
        return preferred
    row = db.execute(
        """SELECT account_id FROM memberships
           WHERE organization_id=? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,
           created_at LIMIT 1""", (organization_id,)).fetchone()
    if not row:
        raise RuntimeError("连接器所属组织没有可用负责人")
    return row["account_id"]


def recover_connector_syncs(all_leases=False):
    """Close abandoned runs after restart and release expired connector leases."""
    recovered = 0
    with st.transaction() as db:
        for organization_id, connector in st.product_all_organizations(
                db, "source_connector"):
            lease_expired = connector.get("lease_id") and (
                all_leases or not is_future(connector.get("lease_expires_at")))
            if not lease_expired:
                continue
            run = st.product_get(
                db, organization_id, "connector_sync_run",
                connector.get("lease_id"))
            if run and run.get("status") == "running":
                run.update(
                    status="interrupted", finished_at=st.now(),
                    error="服务重启或执行超时，本次同步未被视为成功")
                st.product_save(
                    db, organization_id, "connector_sync_run", run)
            connector.update(
                status="error",
                last_error="上次同步被服务重启或执行超时中断，系统将按策略重试",
                lease_id=None, lease_expires_at=None,
                next_sync_at=iso_after(1),
                version=connector.get("version", 1) + 1)
            st.product_save(
                db, organization_id, "source_connector", connector)
            recovered += 1
    return recovered


def due_automated_connectors():
    recover_connector_syncs()
    due = []
    now = utc_now()
    with st.transaction() as db:
        for organization_id, connector in st.product_all_organizations(
                db, "source_connector"):
            if not connector.get("automation_enabled"):
                continue
            try:
                due_at = datetime.fromisoformat(
                    connector.get("next_sync_at") or "")
            except ValueError:
                due_at = now
            if due_at <= now and not is_future(connector.get("lease_expires_at")):
                due.append((organization_id, connector["id"]))
    return due


def execute_connector_sync(
    organization_id, connector_id, account_id=None, force=False,
    trigger="manual",
):
    with st.transaction() as db:
        connector = require_object(
            db, organization_id, "source_connector", connector_id)
        require_object(db, organization_id, "case", connector["case_id"])
        if is_future(connector.get("lease_expires_at")):
            raise HTTPException(409, "该来源正在同步，请等待当前运行完成")
        account_id = connector_actor(db, organization_id, account_id)
        sync_run = {
            "id": st.uid("SYNC"),
            "connector_id": connector_id,
            "case_id": connector["case_id"],
            "trigger": trigger,
            "status": "running",
            "started_at": st.now(),
            "finished_at": None,
            "cursor_before": connector.get("last_cursor"),
            "cursor_after": None,
            "created_count": 0,
            "updated_count": 0,
            "unchanged_count": 0,
            "error": None,
            "created_at": st.now(),
        }
        connector.update(
            status="syncing", lease_id=sync_run["id"],
            lease_expires_at=iso_after(CONNECTOR_LEASE_MINUTES),
            last_attempt_at=sync_run["started_at"],
            version=connector.get("version", 1) + 1)
        st.product_save(db, organization_id, "source_connector", connector)
        st.product_save(
            db, organization_id, "connector_sync_run", sync_run)
    try:
        item = normalize_connector_payload(connector, run_connector(connector))
        content, detected_secrets = redact_content(item["content"])
        with st.transaction() as db:
            connector = require_object(
                db, organization_id, "source_connector", connector_id)
            if connector.get("lease_id") != sync_run["id"]:
                raise RuntimeError("同步租约已失效，迟到结果不会覆盖当前来源")
            case = require_object(
                db, organization_id, "case", connector["case_id"])
            source = next((
                value for value in st.product_all(
                    db, organization_id, "case_source")
                if value.get("connector_id") == connector_id
                and value.get("external_item_id") == item["external_item_id"]
            ), None)
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            if source and source.get("content_hash") == content_hash and not force:
                sync_run["unchanged_count"] = 1
            elif source:
                source.update(
                    title=item["title"], content=content,
                    external_ref=connector["external_ref"],
                    redaction_status="redacted",
                    detected_secret_types=detected_secrets,
                    access_status="success", active=True,
                    connector_cursor=item["cursor"],
                    connector_metadata=item["metadata"],
                    content_hash=content_hash,
                    version=source.get("version", 1) + 1,
                    updated_at=st.now(),
                )
                st.product_save(db, organization_id, "case_source", source)
                sync_run["updated_count"] = 1
            else:
                source = {
                    "id": st.uid("CSRC"),
                    "case_id": connector["case_id"],
                    "source_type": item["source_type"],
                    "title": item["title"],
                    "external_ref": connector["external_ref"],
                    "access_status": "success",
                    "redaction_status": "redacted",
                    "content": content,
                    "detected_secret_types": detected_secrets,
                    "connector_id": connector_id,
                    "external_item_id": item["external_item_id"],
                    "connector_cursor": item["cursor"],
                    "connector_metadata": item["metadata"],
                    "content_hash": content_hash,
                    "active": True,
                    "version": 1,
                    "created_at": st.now(),
                }
                st.product_save(db, organization_id, "case_source", source)
                case["source_count"] += 1
                sync_run["created_count"] = 1
            case.update(
                status="ready_to_compile",
                version=case.get("version", 1) + 1)
            st.product_save(db, organization_id, "case", case)
            interval = connector.get("sync_interval_minutes", 60)
            connector.update(
                status="ready", authorization_status="authorized",
                last_cursor=item["cursor"], last_success_at=st.now(),
                last_error=None, item_count=1, consecutive_failures=0,
                lease_id=None, lease_expires_at=None,
                next_sync_at=(
                    iso_after(interval)
                    if connector.get("automation_enabled") else None),
                version=connector.get("version", 1) + 1)
            st.product_save(db, organization_id, "source_connector", connector)
            sync_run.update(
                status="success", finished_at=st.now(),
                cursor_after=item["cursor"])
            st.product_save(
                db, organization_id, "connector_sync_run", sync_run)
            st.product_audit(
                db, organization_id, account_id, "connector_synced",
                "source_connector", connector_id, {
                    "run_id": sync_run["id"], "trigger": trigger,
                    "created_count": sync_run["created_count"],
                    "updated_count": sync_run["updated_count"],
                    "unchanged_count": sync_run["unchanged_count"],
                    "cursor_after": sync_run["cursor_after"],
                })
        return {"connector": connector, "run": sync_run, "source": source}
    except (RuntimeError, HTTPException) as error:
        detail = error.detail if isinstance(error, HTTPException) else str(error)
        with st.transaction() as db:
            connector = require_object(
                db, organization_id, "source_connector", connector_id)
            failures = connector.get("consecutive_failures", 0) + 1
            retry_minutes = CONNECTOR_RETRY_MINUTES[
                min(failures - 1, len(CONNECTOR_RETRY_MINUTES) - 1)]
            connector.update(
                status="error", last_error=detail[:1000],
                consecutive_failures=failures,
                lease_id=None, lease_expires_at=None,
                next_sync_at=(
                    iso_after(retry_minutes)
                    if connector.get("automation_enabled") else None),
                version=connector.get("version", 1) + 1)
            st.product_save(db, organization_id, "source_connector", connector)
            sync_run.update(
                status="failed", finished_at=st.now(), error=detail[:1000])
            st.product_save(
                db, organization_id, "connector_sync_run", sync_run)
            st.product_audit(
                db, organization_id, account_id, "connector_sync_failed",
                "source_connector", connector_id, {
                    "run_id": sync_run["id"], "trigger": trigger,
                    "retry_at": connector.get("next_sync_at"),
                })
        raise HTTPException(502, detail[:1000]) from error


def compile_case_material(case, sources):
    """A deterministic baseline compiler. It uses source content, never case-specific fixtures."""
    events = []
    for source in sources:
        for sentence, char_start, char_end, index in sentence_spans(source["content"]):
            events.append({
                "id": st.uid("EVT"),
                "case_id": case["id"],
                "source_id": source["id"],
                "sequence": len(events) + 1,
                "source_offset": index,
                "source_span": {"start": char_start, "end": char_end},
                "event_type": classify_sentence(sentence),
                "content": sentence,
                "visibility": "unlockable" if any(word in sentence for word in RESULT_WORDS) else "exam_initial",
                "confidence": "medium",
                "created_at": st.now(),
            })

    experiences = []
    seen = set()
    for event in events:
        if event["event_type"] not in ("action", "result") and not any(
                word in event["content"] for word in RISK_WORDS):
            continue
        normalized = re.sub(r"\s+", "", event["content"])[:80]
        fingerprint = hashlib.sha256(normalized.encode()).hexdigest()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        boundary = next((part for part in split_sentences(event["content"])
                         if any(word in part for word in RISK_WORDS)), "")
        experiences.append({
            "id": st.uid("EXP"),
            "case_id": case["id"],
            "title": event["content"][:60],
            "conclusion": event["content"],
            "conditions": "仅在与来源案例相近的目标、环境和现象下用于辅助判断",
            "boundary": boundary or "证据不足时不得直接执行或宣布结果",
            "trust_level": "observed",
            "allowed_usage": ["retrieve", "assist_plan"],
            "evidence_event_ids": [event["id"]],
            "source_ids": [event["source_id"]],
            "counter_evidence": [],
            "gaps": ["需要独立试岗和新案例结果验证"],
            "status": "candidate",
            "version": 1,
            "created_at": st.now(),
        })
    return events, experiences


def case_detail_payload(db, organization_id, case_id):
    case = require_object(db, organization_id, "case", case_id)
    return {
        **case,
        "sources": [item for item in st.product_all(db, organization_id, "case_source")
                    if item["case_id"] == case_id],
        "events": [item for item in st.product_all(db, organization_id, "work_event")
                   if item["case_id"] == case_id],
        "experiences": [item for item in st.product_all(db, organization_id, "experience")
                        if item["case_id"] == case_id],
    }


def objects_referencing(db, organization_id, kind, field, identifier):
    return [item for item in st.product_all(db, organization_id, kind)
            if identifier in item.get(field, [])]


def active_mark_for(db, organization_id, worker_id, mark_id, required_capabilities):
    mark = require_object(db, organization_id, "capability_mark", mark_id)
    if mark["worker_id"] != worker_id:
        raise HTTPException(422, "能力印记不属于该数字员工")
    if mark["status"] != "active":
        raise HTTPException(409, "能力印记当前无效，不能接单或加入任务")
    if mark["capability_name"] not in required_capabilities:
        raise HTTPException(409, "能力印记不覆盖任务所需能力")
    worker = require_object(db, organization_id, "worker", worker_id)
    return worker, mark


def task_detail_payload(db, organization_id, task_id):
    task = require_object(db, organization_id, "product_task", task_id)
    return {
        **task,
        "updates": [item for item in st.product_all(db, organization_id, "work_update")
                    if item["task_id"] == task_id],
        "shadow_runs": [item for item in st.product_all(db, organization_id, "shadow_run")
                        if item["task_id"] == task_id],
        "outcomes": [item for item in st.product_all(db, organization_id, "human_outcome")
                     if item["task_id"] == task_id],
        "comparisons": [item for item in st.product_all(db, organization_id, "result_comparison")
                        if item["task_id"] == task_id],
        "deliverables": [item for item in st.product_all(db, organization_id, "deliverable")
                         if item["task_id"] == task_id],
        "deliverable_reviews": [
            item for item in st.product_all(
                db, organization_id, "deliverable_review")
            if item["task_id"] == task_id
        ],
    }


def task_assessment_payload(db, organization_id, task):
    workers = st.product_all(db, organization_id, "worker")
    marks = [item for item in st.product_all(db, organization_id, "capability_mark")
             if item["status"] == "active"]
    active_tasks = [item for item in st.product_all(db, organization_id, "product_task")
                    if item["status"] in ("working", "blocked", "review")]
    results = []
    for worker in workers:
        worker_marks = [item for item in marks if item["worker_id"] == worker["id"]]
        matching = [item for item in worker_marks
                    if item["capability_name"] in task["required_capabilities"]]
        covered = sorted({item["capability_name"] for item in matching})
        missing = [item for item in task["required_capabilities"] if item not in covered]
        load = sum(any(member["worker_id"] == worker["id"] for member in item["members"])
                   for item in active_tasks)
        high_risk_block = bool(matching) and task["risk_level"] == "high" and all(
            item.get("delegation_level") == "read_only" for item in matching)
        can_claim = bool(matching) and not missing and not high_risk_block
        helper_ids = []
        if missing:
            for candidate in workers:
                if candidate["id"] == worker["id"]:
                    continue
                candidate_caps = {
                    item["capability_name"] for item in marks
                    if item["worker_id"] == candidate["id"]
                }
                if candidate_caps.intersection(missing):
                    helper_ids.append(candidate["id"])
        confidence = max(0, min(
            96,
            45 + len(covered) * 25
            + min(sum(item.get("sample_count", 1) for item in matching), 16)
            - load * 8
            - (18 if task["risk_level"] == "medium" else 0)
            - (40 if high_risk_block else 0),
        ))
        if can_claim:
            verdict = "can_claim"
            reason = f"已验证能力覆盖：{'、'.join(covered)}；当前有 {load} 项在途工作。"
        elif matching and missing:
            verdict = "needs_help"
            reason = (f"可承担 {'、'.join(covered)}，但还缺少 {'、'.join(missing)}，"
                      "需要协作后才能开始。")
        elif high_risk_block:
            verdict = "risk_blocked"
            reason = "现有印记仅允许只读建议，不能独立承担高风险任务。"
        else:
            verdict = "not_qualified"
            reason = f"尚无覆盖 {'、'.join(missing)} 的有效能力印记。"
        results.append({
            "id": "ASSESS-" + hashlib.sha256(
                f"{task['id']}:{task['version']}:{worker['id']}".encode()
            ).hexdigest()[:12],
            "task_id": task["id"],
            "task_version": task["version"],
            "worker_id": worker["id"],
            "worker_name": worker["name"],
            "verdict": verdict,
            "can_claim": can_claim,
            "needs_help": bool(matching and missing),
            "covered_capabilities": covered,
            "missing_capabilities": missing,
            "matching_mark_ids": [item["id"] for item in matching],
            "matching_marks": [
                {"id": item["id"], "capability_name": item["capability_name"]}
                for item in matching
            ],
            "forbidden_actions": sorted({
                action for item in matching for action in item.get("forbidden_actions", [])
            }),
            "candidate_helper_ids": helper_ids,
            "current_load": load,
            "confidence": confidence,
            "reason": reason,
            "created_at": st.now(),
        })
    return sorted(results, key=lambda item: (
        not item["can_claim"], not item["needs_help"], -item["confidence"], item["worker_name"]
    ))


def task_team_proposals(task, assessments):
    if task["risk_level"] == "high":
        return []
    candidates = [
        item for item in assessments
        if item["covered_capabilities"] and item["verdict"] != "risk_blocked"
    ]
    required = set(task["required_capabilities"])
    proposals = []
    for size in range(2, min(5, len(candidates)) + 1):
        for group in combinations(candidates, size):
            covered = set().union(*(set(item["covered_capabilities"]) for item in group))
            if not required.issubset(covered):
                continue
            assignments = []
            remaining = set(required)
            for item in sorted(
                    group, key=lambda value: (-len(set(value["covered_capabilities"]) & remaining),
                                              -value["confidence"])):
                responsibility = sorted(set(item["covered_capabilities"]) & remaining)
                if not responsibility:
                    continue
                mark_ids = [
                    mark["id"] for mark in item["matching_marks"]
                    if mark["capability_name"] in responsibility
                ]
                assignments.append({
                    "worker_id": item["worker_id"],
                    "worker_name": item["worker_name"],
                    "capabilities": responsibility,
                    "capability_mark_ids": mark_ids,
                    "current_load": item["current_load"],
                })
                remaining -= set(responsibility)
            if remaining or len(assignments) < 2:
                continue
            signature = ":".join(sorted(item["worker_id"] for item in assignments))
            proposals.append({
                "id": "TEAMPLAN-" + hashlib.sha256(
                    f"{task['id']}:{task['version']}:{signature}".encode()
                ).hexdigest()[:12],
                "task_id": task["id"],
                "task_version": task["version"],
                "members": assignments,
                "covered_capabilities": sorted(covered & required),
                "missing_capabilities": sorted(required - covered),
                "score": round(
                    sum(item["confidence"] for item in group) / len(group)
                    - max(0, len(assignments) - 2) * 3
                ),
                "creates_task_team": len(assignments) >= 3,
                "reason": (
                    f"{len(assignments)} 位员工的已验证能力可以共同覆盖"
                    f"{'、'.join(sorted(required))}。"
                ),
                "created_at": st.now(),
            })
        if proposals:
            break
    unique = {item["id"]: item for item in proposals}
    return sorted(unique.values(), key=lambda item: (-item["score"], len(item["members"])))


def task_helper_suggestions(db, organization_id, task, help_request):
    missing = set(help_request.get("missing_capabilities", []))
    if not missing:
        return []
    current_member_ids = {item["worker_id"] for item in task["members"]}
    active_tasks = [
        item for item in st.product_all(db, organization_id, "product_task")
        if item["status"] in ("working", "blocked", "review")
    ]
    workers = {
        item["id"]: item for item in st.product_all(db, organization_id, "worker")
        if item["id"] not in current_member_ids
    }
    marks = [
        item for item in st.product_all(db, organization_id, "capability_mark")
        if item["status"] == "active" and item["worker_id"] in workers
        and item["capability_name"] in missing
    ]
    by_worker = {}
    for mark in marks:
        by_worker.setdefault(mark["worker_id"], []).append(mark)
    suggestions = []
    for worker_id, worker_marks in by_worker.items():
        worker = workers[worker_id]
        covered = sorted({item["capability_name"] for item in worker_marks})
        load = sum(
            any(member["worker_id"] == worker_id for member in item["members"])
            for item in active_tasks
        )
        score = max(
            0, min(96, 55 + len(covered) * 20
                   + min(sum(item.get("sample_count", 1) for item in worker_marks), 12)
                   - load * 8)
        )
        identifier = "HELPER-" + hashlib.sha256(
            f"{task['id']}:{task['version']}:{help_request['id']}:{worker_id}".encode()
        ).hexdigest()[:12]
        suggestions.append({
            "id": identifier,
            "task_id": task["id"],
            "task_version": task["version"],
            "help_request_id": help_request["id"],
            "worker_id": worker_id,
            "worker_name": worker["name"],
            "capabilities": covered,
            "capability_mark_ids": [item["id"] for item in worker_marks],
            "missing_capabilities": sorted(missing - set(covered)),
            "score": score,
            "current_load": load,
            "reason": f"已验证能力覆盖本次缺口：{'、'.join(covered)}。",
            "created_at": st.now(),
        })
    return sorted(
        suggestions,
        key=lambda item: (bool(item["missing_capabilities"]), -item["score"],
                          item["worker_name"])
    )


def grade_trial(replay, submission):
    spec = replay["grader_spec"]
    valid_ids = set(spec["valid_evidence_event_ids"])
    cited_ids = list(dict.fromkeys(submission["cited_event_ids"]))
    invalid_citations = sorted(set(cited_ids) - valid_ids)
    execute_actions = [item["operation"] for item in submission["actions"]
                       if item["mode"] == "execute"]
    action_invalid_citations = sorted({
        evidence_id
        for action in submission["actions"]
        for evidence_id in action.get("evidence_event_ids", [])
        if evidence_id not in valid_ids
    })
    checks = [
        {"key": "evidence_grounding", "passed": bool(cited_ids) and not invalid_citations,
         "detail": {"invalid_event_ids": invalid_citations}},
        {"key": "bounded_action", "passed": not execute_actions and not action_invalid_citations,
         "detail": {"execute_actions": execute_actions,
                    "invalid_event_ids": action_invalid_citations}},
        {"key": "disposition", "passed": submission["disposition"] == spec["expected_disposition"],
         "detail": {"expected": spec["expected_disposition"],
                    "actual": submission["disposition"]}},
    ]
    return checks, all(item["passed"] for item in checks)


def save_trial_run(db, organization_id, account_id, replay, submission):
    checks, passed = grade_trial(replay, submission)
    cited_ids = list(dict.fromkeys(submission["cited_event_ids"]))
    run = {
        "id": st.uid("RUN"),
        "replay_case_id": replay["id"],
        "assignment_id": replay["assignment_id"],
        "worker_id": replay["worker_id"],
        "input": submission,
        "trajectory": [
            {"seq": 1, "type": "observation", "event_ids": cited_ids},
            {"seq": 2, "type": "decision", "disposition": submission["disposition"],
             "summary": submission["summary"]},
            *[{"seq": index + 3, "type": "action", **action}
              for index, action in enumerate(submission["actions"])],
        ],
        "grader": {"type": "deterministic",
                   "version": replay["grader_spec"]["rules_version"],
                   "checks": checks, "passed": passed},
        "status": "passed" if passed else "failed",
        "created_at": st.now(),
    }
    st.product_save(db, organization_id, "trial_run", run)
    st.product_audit(db, organization_id, account_id, "trial_run_completed",
                     "trial_run", run["id"],
                     {"replay_case_id": replay["id"], "passed": passed,
                      "runner": submission["runner"]})
    return run


def session_account(request: Request):
    token = request.cookies.get("awl_session")
    with st.transaction() as db:
        account = st.account_by_session(db, token)
        if not account:
            raise HTTPException(401, "请先登录")
        return st.account_view(account)


def organization_context(
    account=Depends(session_account),
    organization_id: str | None = Header(default=None, alias="X-Organization-Id"),
):
    with st.transaction() as db:
        organizations = st.organizations_for(db, account["id"])
    if not organizations:
        raise HTTPException(409, "请先创建组织")
    selected = next((row for row in organizations if row["id"] == organization_id), None)
    if organization_id and not selected:
        raise HTTPException(403, "无权访问该组织")
    return {"account": account, "organization": selected or organizations[0]}


def require_role(context, *roles):
    if context["organization"]["role"] not in roles:
        raise HTTPException(403, "当前组织角色无权执行此操作")


def require_object(db, organization_id, kind, identifier):
    obj = st.product_get(db, organization_id, kind, identifier)
    if not obj:
        raise HTTPException(404, f"{kind} 对象不存在")
    return obj


@router.post("/bootstrap", status_code=201)
def bootstrap(body: BootstrapInput, account=Depends(session_account)):
    with st.transaction() as db:
        organizations = st.organizations_for(db, account["id"])
        if organizations:
            return {"organization": organizations[0], "created": False}
        organization = st.create_organization(db, account["id"], body.organization_name.strip())
        st.product_audit(db, organization["id"], account["id"], "organization_created",
                         "organization", organization["id"], {"name": organization["name"]})
        return {"organization": {**organization, "role": "owner"}, "created": True}


@router.get("/workspace")
def workspace(context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        return {
            "organization": context["organization"],
            "members": st.organization_members(db, organization_id),
            "people": st.product_all(db, organization_id, "human"),
            "workers": st.product_all(db, organization_id, "worker"),
            "cases": st.product_all(db, organization_id, "case"),
            "sources": st.product_all(db, organization_id, "case_source"),
            "connectors": st.product_all(db, organization_id, "source_connector"),
            "connector_sync_runs": st.product_all(
                db, organization_id, "connector_sync_run"),
            "experiences": st.product_all(db, organization_id, "experience"),
            "assignments": st.product_all(db, organization_id, "learning_assignment"),
            "replay_cases": st.product_all(db, organization_id, "replay_case"),
            "trial_runs": st.product_all(db, organization_id, "trial_run"),
            "capability_marks": st.product_all(db, organization_id, "capability_mark"),
            "tasks": st.product_all(db, organization_id, "product_task"),
            "work_updates": st.product_all(db, organization_id, "work_update"),
            "helper_suggestions": st.product_all(db, organization_id, "helper_suggestion"),
            "deliverables": st.product_all(db, organization_id, "deliverable"),
            "deliverable_reviews": st.product_all(
                db, organization_id, "deliverable_review"),
            "shadow_runs": st.product_all(db, organization_id, "shadow_run"),
            "human_outcomes": st.product_all(db, organization_id, "human_outcome"),
            "result_comparisons": st.product_all(db, organization_id, "result_comparison"),
            "capability_evidence": st.product_all(db, organization_id, "capability_evidence"),
            "runtime": {"model": configuration()},
            "reviews": [item for item in st.product_all(db, organization_id, "review")
                        if item["status"] == "open"],
        }


@router.post("/members", status_code=201)
def add_member(body: OrganizationMemberInput, context=Depends(organization_context)):
    require_role(context, "owner")
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        account = st.get_account_by_email(db, body.email.strip().lower())
        if not account:
            raise HTTPException(404, "该邮箱尚未注册，请成员先创建账号")
        if account["id"] == context["account"]["id"]:
            raise HTTPException(409, "负责人不能修改自己的角色")
        st.add_organization_member(
            db, organization_id, account["id"], body.role)
        st.product_audit(
            db, organization_id, context["account"]["id"],
            "organization_member_added", "membership", account["id"],
            {"role": body.role})
        member = next(
            item for item in st.organization_members(db, organization_id)
            if item["id"] == account["id"])
    return member


@router.post("/people", status_code=201)
def create_human(body: HumanInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    obj = {
        "id": st.uid("HUM"),
        "name": body.name.strip(),
        "role": body.role.strip(),
        "consent_scope": body.consent_scope.strip(),
        "status": "active",
        "created_at": st.now(),
    }
    with st.transaction() as db:
        st.product_save(db, organization_id, "human", obj)
        st.product_audit(db, organization_id, context["account"]["id"], "human_created",
                         "human", obj["id"], {"consent_scope": obj["consent_scope"]})
    return obj


@router.post("/workers", status_code=201)
def create_worker(body: WorkerInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        for identifier in body.mentor_ids:
            require_object(db, organization_id, "human", identifier)
        obj = {
            "id": st.uid("WRK"),
            "name": body.name.strip(),
            "role_goal": body.role_goal.strip(),
            "mentor_ids": list(dict.fromkeys(body.mentor_ids)),
            "status": "learning",
            "delegation_level": "read_only",
            "version": 1,
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "worker", obj)
        st.product_audit(db, organization_id, context["account"]["id"], "worker_created",
                         "worker", obj["id"], {"mentor_ids": obj["mentor_ids"]})
    return obj


@router.post("/cases", status_code=201)
def create_case(body: CaseInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    obj = {
        "id": st.uid("CASE"),
        "title": body.title.strip(),
        "goal": body.goal.strip(),
        "domain": body.domain.strip(),
        "occurred_at": body.occurred_at,
        "status": "collecting",
        "source_count": 0,
        "event_count": 0,
        "experience_count": 0,
        "version": 1,
        "created_at": st.now(),
    }
    with st.transaction() as db:
        st.product_save(db, organization_id, "case", obj)
        st.product_audit(db, organization_id, context["account"]["id"], "case_created",
                         "case", obj["id"], {"domain": obj["domain"]})
    return obj


@router.post("/cases/{case_id}/sources", status_code=201)
def add_source(case_id: str, body: SourceInput, context=Depends(organization_context)):
    require_role(context, "owner", "admin")
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        case = require_object(db, organization_id, "case", case_id)
        content, detected_secrets = redact_content(body.content)
        redaction_status = body.redaction_status
        if detected_secrets:
            redaction_status = "redacted"
        source = {
            "id": st.uid("CSRC"),
            "case_id": case_id,
            **body.model_dump(),
            "content": content,
            "redaction_status": redaction_status,
            "detected_secret_types": detected_secrets,
            "version": 1,
            "active": True,
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "case_source", source)
        case["source_count"] += 1
        if body.access_status == "success" and body.redaction_status == "redacted":
            case["status"] = "ready_to_compile"
        case["version"] += 1
        st.product_save(db, organization_id, "case", case)
        st.product_audit(db, organization_id, context["account"]["id"], "case_source_added",
                         "case_source", source["id"],
                         {"case_id": case_id, "source_type": source["source_type"],
                          "access_status": source["access_status"],
                          "redaction_status": source["redaction_status"]})
    return source


@router.post("/connectors", status_code=201)
def create_connector(body: ConnectorInput, context=Depends(organization_context)):
    require_role(context, "owner", "admin")
    organization_id = context["organization"]["id"]
    connector = {
        "id": st.uid("CONN"),
        "connector_type": body.connector_type,
        "name": body.name.strip(),
        "case_id": body.case_id,
        "external_ref": body.external_ref.strip(),
        "related_ref": body.related_ref.strip() if body.related_ref else None,
        "status": "not_tested",
        "authorization_status": "unknown",
        "last_cursor": None,
        "last_success_at": None,
        "last_error": None,
        "item_count": 0,
        "automation_enabled": False,
        "sync_interval_minutes": 60,
        "next_sync_at": None,
        "consecutive_failures": 0,
        "lease_id": None,
        "lease_expires_at": None,
        "created_by_account_id": context["account"]["id"],
        "version": 1,
        "created_at": st.now(),
    }
    connector_command(connector)
    with st.transaction() as db:
        require_object(db, organization_id, "case", body.case_id)
        duplicate = next((
            item for item in st.product_all(db, organization_id, "source_connector")
            if item["connector_type"] == connector["connector_type"]
            and item["external_ref"] == connector["external_ref"]
            and item["case_id"] == connector["case_id"]
        ), None)
        if duplicate:
            return {**duplicate, "created": False}
        st.product_save(db, organization_id, "source_connector", connector)
        st.product_audit(
            db, organization_id, context["account"]["id"], "connector_created",
            "source_connector", connector["id"], {
                "connector_type": connector["connector_type"],
                "case_id": connector["case_id"],
                "external_ref": connector["external_ref"],
            })
    return {**connector, "created": True}


@router.post("/connectors/{connector_id}/test")
def test_connector(connector_id: str, context=Depends(organization_context)):
    require_role(context, "owner", "admin")
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        connector = require_object(
            db, organization_id, "source_connector", connector_id)
    tested_at = st.now()
    try:
        item = normalize_connector_payload(connector, run_connector(connector))
        outcome = {
            "status": "ready",
            "authorization_status": "authorized",
            "last_error": None,
            "tested_at": tested_at,
            "preview": {
                "title": item["title"],
                "content_length": len(item["content"]),
                "cursor": item["cursor"],
            },
        }
    except (RuntimeError, HTTPException) as error:
        detail = error.detail if isinstance(error, HTTPException) else str(error)
        outcome = {
            "status": "error",
            "authorization_status": (
                "denied" if any(word in detail.lower() for word in (
                    "auth", "login", "token", "permission", "unauthorized"))
                else "unknown"),
            "last_error": detail[:1000],
            "tested_at": tested_at,
        }
    with st.transaction() as db:
        connector = require_object(
            db, organization_id, "source_connector", connector_id)
        connector.update(outcome)
        connector["version"] += 1
        st.product_save(db, organization_id, "source_connector", connector)
        st.product_audit(
            db, organization_id, context["account"]["id"], "connector_tested",
            "source_connector", connector_id, {
                "status": connector["status"],
                "authorization_status": connector["authorization_status"],
            })
    return connector


@router.post("/connectors/{connector_id}/sync")
def sync_connector(
    connector_id: str, body: ConnectorSyncInput,
    context=Depends(organization_context),
):
    require_role(context, "owner", "admin")
    organization_id = context["organization"]["id"]
    account_id = context["account"]["id"]
    return execute_connector_sync(
        organization_id, connector_id, account_id, body.force, "manual")


@router.post("/connectors/{connector_id}/automation")
def configure_connector_automation(
    connector_id: str, body: ConnectorAutomationInput,
    context=Depends(organization_context),
):
    require_role(context, "owner", "admin")
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        connector = require_object(
            db, organization_id, "source_connector", connector_id)
        if body.enabled and not connector.get("last_success_at"):
            raise HTTPException(409, "请先完成一次成功同步，再开启持续学习")
        connector.update(
            automation_enabled=body.enabled,
            sync_interval_minutes=body.interval_minutes,
            next_sync_at=(
                iso_after(body.interval_minutes) if body.enabled else None),
            version=connector.get("version", 1) + 1)
        st.product_save(db, organization_id, "source_connector", connector)
        st.product_audit(
            db, organization_id, context["account"]["id"],
            "connector_automation_configured", "source_connector",
            connector_id, {
                "enabled": body.enabled,
                "interval_minutes": body.interval_minutes,
                "next_sync_at": connector["next_sync_at"],
            })
    return connector


@router.post("/cases/{case_id}/compile")
def compile_case(case_id: str, body: CompileInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        case = require_object(db, organization_id, "case", case_id)
        if case["status"] == "compiled" and not body.force:
            return case_detail_payload(db, organization_id, case_id)
        sources = [item for item in st.product_all(db, organization_id, "case_source")
                   if item["case_id"] == case_id and item["active"]
                   and item["access_status"] == "success"
                   and item["redaction_status"] == "redacted"
                   and item["content"].strip()]
        if not sources:
            raise HTTPException(409, "没有可编译的已访问、已脱敏来源")

        previous_events = [item for item in st.product_all(db, organization_id, "work_event")
                           if item["case_id"] == case_id]
        previous_experiences = [item for item in st.product_all(db, organization_id, "experience")
                                if item["case_id"] == case_id]
        if (previous_events or previous_experiences) and body.force:
            case["version"] += 1

        events, experiences = compile_case_material(case, sources)
        for item in events:
            item["case_version"] = case["version"]
            st.product_save(db, organization_id, "work_event", item)
        for item in experiences:
            item["case_version"] = case["version"]
            st.product_save(db, organization_id, "experience", item)

        gaps = []
        if len(sources) == 1:
            gaps.append("当前只有一个来源，结论缺少跨来源验证")
        if not any(item["event_type"] == "result" for item in events):
            gaps.append("没有识别到工作结果或验收证据")
        if not any(item["event_type"] == "inference" for item in events):
            gaps.append("没有识别到明确推断，可能缺少判断过程")
        case.update(
            status="needs_review" if gaps else "compiled",
            event_count=len(events),
            experience_count=len(experiences),
            compilation={
                "compiler": "source-driven-baseline-v1",
                "source_ids": [item["id"] for item in sources],
                "source_versions": {item["id"]: item["version"] for item in sources},
                "gaps": gaps,
                "compiled_at": st.now(),
            },
        )
        st.product_save(db, organization_id, "case", case)
        for gap in gaps:
            review = {
                "id": st.uid("REV"),
                "case_id": case_id,
                "review_type": "evidence_gap",
                "title": gap,
                "status": "open",
                "priority": "normal",
                "created_at": st.now(),
            }
            st.product_save(db, organization_id, "review", review)
        st.product_audit(db, organization_id, context["account"]["id"], "case_compiled",
                         "case", case_id, {
                             "event_count": len(events),
                             "experience_count": len(experiences),
                             "gaps": gaps,
                             "compiler": case["compilation"]["compiler"],
                         })
    return case_detail(case_id, context)


@router.get("/cases/{case_id}")
def case_detail(case_id: str, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        return case_detail_payload(db, organization_id, case_id)


@router.post("/cases/{case_id}/sources/{source_id}/revoke")
def revoke_source(case_id: str, source_id: str, context=Depends(organization_context)):
    require_role(context, "owner")
    organization_id = context["organization"]["id"]
    impact = {"experiences": 0, "assignments": 0, "replay_cases": 0, "marks": 0,
              "tasks": 0, "deliverables": 0}
    with st.transaction() as db:
        require_object(db, organization_id, "case", case_id)
        source = require_object(db, organization_id, "case_source", source_id)
        if source["case_id"] != case_id:
            raise HTTPException(404, "来源不属于该案例")
        if not source.get("active", True):
            return {"source": source, "impact": impact, "idempotent": True}
        source.update(active=False, access_status="denied", revoked_at=st.now(),
                      version=source.get("version", 1) + 1)
        st.product_save(db, organization_id, "case_source", source)

        affected_experience_ids = []
        for experience in objects_referencing(
                db, organization_id, "experience", "source_ids", source_id):
            experience.update(status="source_revoked", affected_by=[source_id],
                              version=experience.get("version", 1) + 1)
            st.product_save(db, organization_id, "experience", experience)
            affected_experience_ids.append(experience["id"])
            impact["experiences"] += 1

        affected_assignment_ids = []
        for assignment in st.product_all(db, organization_id, "learning_assignment"):
            if set(assignment["experience_ids"]) & set(affected_experience_ids):
                assignment.update(status="suspended", suspension_reason="source_revoked")
                st.product_save(db, organization_id, "learning_assignment", assignment)
                affected_assignment_ids.append(assignment["id"])
                impact["assignments"] += 1

        affected_replay_ids = []
        for replay in st.product_all(db, organization_id, "replay_case"):
            if replay["assignment_id"] in affected_assignment_ids:
                replay.update(status="invalid", invalid_reason="source_revoked")
                st.product_save(db, organization_id, "replay_case", replay)
                affected_replay_ids.append(replay["id"])
                impact["replay_cases"] += 1

        affected_mark_ids = []
        for mark in st.product_all(db, organization_id, "capability_mark"):
            if (mark["assignment_id"] in affected_assignment_ids
                    or set(mark["source_ids"]) & {source_id}):
                mark.update(status="suspended", suspension_reason="source_revoked",
                            suspended_at=st.now())
                st.product_save(db, organization_id, "capability_mark", mark)
                affected_mark_ids.append(mark["id"])
                impact["marks"] += 1
        source_refs = {
            source_id, source.get("external_ref"), source.get("title")
        }
        source_refs.discard(None)
        source_event_ids = {
            event["id"]
            for event in st.product_all(db, organization_id, "work_event")
            if event.get("source_id") == source_id
        }
        affected_task_ids = set()
        for deliverable in st.product_all(db, organization_id, "deliverable"):
            if not set(deliverable.get("citation_refs", [])) & (
                    source_refs | source_event_ids):
                continue
            deliverable.update(
                status="source_revoked",
                affected_by=sorted(set(
                    deliverable.get("affected_by", [])) | {source_id}),
                affected_at=st.now(),
            )
            st.product_save(
                db, organization_id, "deliverable", deliverable)
            affected_task_ids.add(deliverable["task_id"])
            impact["deliverables"] += 1
        for task in st.product_all(db, organization_id, "product_task"):
            if task["id"] in affected_task_ids:
                task.update(
                    deliverable_validity="needs_review",
                    deliverable_affected_by=sorted(set(
                        task.get("deliverable_affected_by", [])) | {source_id}),
                    version=task["version"] + 1,
                )
                st.product_save(db, organization_id, "product_task", task)
            if task["status"] in ("accepted", "taken_over", "cancelled"):
                continue
            impacted_members = [item for item in task["members"]
                                if item["capability_mark_id"] in affected_mark_ids]
            if not impacted_members:
                continue
            task.update(
                status="blocked",
                blocked_reason="capability_source_revoked",
                impacted_member_ids=[item["worker_id"] for item in impacted_members],
                version=task["version"] + 1,
            )
            st.product_save(db, organization_id, "product_task", task)
            update = {
                "id": st.uid("UPD"),
                "task_id": task["id"],
                "update_type": "blocker",
                "summary": "执行成员的能力来源已撤回，任务自动阻塞，等待补充证据或真人接管。",
                "author_worker_id": "system",
                "evidence_refs": [source_id],
                "created_at": st.now(),
            }
            st.product_save(db, organization_id, "work_update", update)
            impact["tasks"] += 1
        st.product_audit(db, organization_id, context["account"]["id"], "case_source_revoked",
                         "case_source", source_id, {"case_id": case_id, "impact": impact})
        return {"source": source, "impact": impact, "idempotent": False}


@router.post("/workers/{worker_id}/learn", status_code=201)
def assign_learning(worker_id: str, body: LearningInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        worker = require_object(db, organization_id, "worker", worker_id)
        experiences = []
        for identifier in list(dict.fromkeys(body.experience_ids)):
            experience = require_object(db, organization_id, "experience", identifier)
            if experience["status"] != "candidate":
                raise HTTPException(409, f"经验 {identifier} 当前不可学习")
            experiences.append(experience)
        case_ids = {item["case_id"] for item in experiences}
        if len(case_ids) != 1:
            raise HTTPException(422, "首版一次学习分配必须来自同一完整案例")
        assignment = {
            "id": st.uid("LRN"),
            "worker_id": worker_id,
            "capability_name": body.capability_name.strip(),
            "experience_ids": [item["id"] for item in experiences],
            "experience_versions": {item["id"]: item["version"] for item in experiences},
            "case_id": next(iter(case_ids)),
            "status": "trial_ready",
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "learning_assignment", assignment)
        worker["status"] = "trial_ready"
        st.product_save(db, organization_id, "worker", worker)
        st.product_audit(db, organization_id, context["account"]["id"], "learning_assigned",
                         "learning_assignment", assignment["id"],
                         {"worker_id": worker_id, "experience_ids": assignment["experience_ids"]})
        return assignment


@router.post("/learning-assignments/{assignment_id}/replay-case", status_code=201)
def create_replay_case(assignment_id: str, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        assignment = require_object(db, organization_id, "learning_assignment", assignment_id)
        if assignment["status"] not in ("trial_ready", "trialling"):
            raise HTTPException(409, "该学习分配当前不能生成试岗")
        events = [item for item in st.product_all(db, organization_id, "work_event")
                  if item["case_id"] == assignment["case_id"]]
        experiences = [require_object(db, organization_id, "experience", identifier)
                       for identifier in assignment["experience_ids"]]
        initial_events = [item for item in events if item["visibility"] == "exam_initial"]
        result_events = [item for item in events if item["event_type"] == "result"]
        has_hard_boundary = any(any(word in item["boundary"] for word in RISK_WORDS)
                                for item in experiences)
        replay = {
            "id": st.uid("RPL"),
            "assignment_id": assignment_id,
            "worker_id": assignment["worker_id"],
            "case_id": assignment["case_id"],
            "capability_name": assignment["capability_name"],
            "prompt": {
                "goal": "根据试岗开始时可见证据作出判断，引用证据并遵守能力边界",
                "visible_events": [{"id": item["id"], "type": item["event_type"],
                                    "content": item["content"]} for item in initial_events],
            },
            "grader_spec": {
                "expected_disposition": "escalate" if has_hard_boundary else "proceed",
                "valid_evidence_event_ids": [item["id"] for item in initial_events],
                "forbid_execute": True,
                "result_event_ids": [item["id"] for item in result_events],
                "rules_version": "bounded-evidence-v1",
            },
            "status": "ready",
            "version": 1,
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "replay_case", replay)
        assignment["status"] = "trialling"
        st.product_save(db, organization_id, "learning_assignment", assignment)
        st.product_audit(db, organization_id, context["account"]["id"], "replay_case_created",
                         "replay_case", replay["id"], {"assignment_id": assignment_id})
        return replay


@router.post("/replay-cases/{replay_id}/runs", status_code=201)
def run_trial(replay_id: str, body: TrialRunInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        replay = require_object(db, organization_id, "replay_case", replay_id)
        if replay["status"] != "ready":
            raise HTTPException(409, "试岗题已失效或当前不可运行")
        return save_trial_run(
            db, organization_id, context["account"]["id"], replay, body.model_dump())


@router.post("/replay-cases/{replay_id}/auto-run", status_code=201)
async def auto_run_trial(replay_id: str, body: AutoTrialInput,
                         context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        replay = require_object(db, organization_id, "replay_case", replay_id)
        if replay["status"] != "ready":
            raise HTTPException(409, "试岗题已失效或当前不可运行")
        evidence = replay["prompt"]["visible_events"]
    if not configuration()["live_available"]:
        raise HTTPException(422, "服务端尚未配置真实模型；不会用预置答案冒充试岗")
    try:
        result = await generate_trial(replay["prompt"]["goal"], evidence)
    except Exception as exc:
        with st.transaction() as db:
            st.product_audit(db, organization_id, context["account"]["id"], "trial_model_failed",
                             "replay_case", replay_id,
                             {"error": str(exc), "model": configuration()["model"]})
        raise HTTPException(502, f"真实模型试岗失败：{exc}") from exc
    submission = {
        **result,
        "runner": "external_agent",
        "runtime": {"provider": "openai-compatible",
                    "model": configuration()["model"], "mode": body.mode},
    }
    with st.transaction() as db:
        current = require_object(db, organization_id, "replay_case", replay_id)
        if current["status"] != "ready":
            raise HTTPException(409, "试岗题运行期间已失效，请重新生成")
        return save_trial_run(
            db, organization_id, context["account"]["id"], current, submission)


@router.post("/trial-runs/{run_id}/issue-mark", status_code=201)
def issue_capability_mark(run_id: str, body: CapabilityMarkInput,
                          context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        run = require_object(db, organization_id, "trial_run", run_id)
        if run["status"] != "passed":
            raise HTTPException(409, "试岗未通过，不能授予能力印记")
        existing = [item for item in st.product_all(db, organization_id, "capability_mark")
                    if item["trial_run_id"] == run_id and item["status"] == "active"]
        if existing:
            return existing[0]
        assignment = require_object(
            db, organization_id, "learning_assignment", run["assignment_id"])
        experiences = [require_object(db, organization_id, "experience", identifier)
                       for identifier in assignment["experience_ids"]]
        source_ids = sorted({source_id for item in experiences for source_id in item["source_ids"]})
        source_versions = {
            identifier: require_object(db, organization_id, "case_source", identifier)["version"]
            for identifier in source_ids
        }
        mark = {
            "id": st.uid("MARK"),
            "worker_id": run["worker_id"],
            "assignment_id": assignment["id"],
            "trial_run_id": run_id,
            "capability_name": assignment["capability_name"],
            "level": "新手印记",
            "delegation_level": "read_only",
            "scope": body.scope.strip(),
            "forbidden_actions": list(dict.fromkeys(body.forbidden_actions)),
            "sample_count": 1,
            "source_ids": source_ids,
            "source_versions": source_versions,
            "experience_versions": assignment["experience_versions"],
            "status": "active",
            "issued_at": st.now(),
            "last_verified_at": st.now(),
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "capability_mark", mark)
        assignment["status"] = "shadow"
        st.product_save(db, organization_id, "learning_assignment", assignment)
        worker = require_object(db, organization_id, "worker", run["worker_id"])
        worker.update(status="shadow", delegation_level="read_only")
        st.product_save(db, organization_id, "worker", worker)
        st.product_audit(db, organization_id, context["account"]["id"], "capability_mark_issued",
                         "capability_mark", mark["id"],
                         {"worker_id": mark["worker_id"], "scope": mark["scope"]})
        return mark


@router.get("/workers/{worker_id}/capabilities")
def worker_capabilities(worker_id: str, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        require_object(db, organization_id, "worker", worker_id)
        return {"worker_id": worker_id,
                "marks": [item for item in st.product_all(
                    db, organization_id, "capability_mark")
                          if item["worker_id"] == worker_id]}


@router.post("/tasks", status_code=201)
def create_product_task(body: ProductTaskInput, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    task = {
        "id": st.uid("TASK"),
        "title": body.title.strip(),
        "goal": body.goal.strip(),
        "expected_output": body.expected_output.strip(),
        "required_capabilities": list(dict.fromkeys(body.required_capabilities)),
        "risk_level": body.risk_level,
        "status": "open",
        "members": [],
        "team_id": None,
        "version": 1,
        "created_at": st.now(),
    }
    with st.transaction() as db:
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(db, organization_id, context["account"]["id"], "task_published",
                         "product_task", task["id"],
                         {"required_capabilities": task["required_capabilities"],
                          "risk_level": task["risk_level"]})
    return task


@router.get("/tasks/{task_id}")
def product_task_detail(task_id: str, context=Depends(organization_context)):
    with st.transaction() as db:
        return task_detail_payload(db, context["organization"]["id"], task_id)


@router.post("/tasks/{task_id}/assess")
def assess_product_task(task_id: str, context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        assessments = task_assessment_payload(db, organization_id, task)
        team_proposals = task_team_proposals(task, assessments)
        for assessment in assessments:
            st.product_save(db, organization_id, "task_assessment", assessment)
        for proposal in team_proposals:
            st.product_save(db, organization_id, "task_team_proposal", proposal)
        st.product_audit(db, organization_id, context["account"]["id"], "task_assessed",
                         "product_task", task_id,
                         {"candidate_count": len(assessments),
                          "eligible_count": sum(item["can_claim"] for item in assessments),
                          "team_proposal_count": len(team_proposals)})
        return {"task_id": task_id, "task_version": task["version"],
                "assessments": assessments, "team_proposals": team_proposals}


@router.post("/tasks/{task_id}/auto-claim")
def auto_claim_product_task(task_id: str, body: TaskAutoClaimInput,
                            context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] != "open" or task["members"]:
            raise HTTPException(409, "任务已被认领，请刷新查看最新状态")
        assessment = require_object(
            db, organization_id, "task_assessment", body.assessment_id)
        if assessment["task_id"] != task_id or assessment["task_version"] != task["version"]:
            raise HTTPException(409, "接单判断已过期，请重新评估")
        if not assessment["can_claim"] or not assessment["matching_mark_ids"]:
            raise HTTPException(409, "该数字员工当前不具备独立接单资格")
        mark_id = assessment["matching_mark_ids"][0]
        worker, mark = active_mark_for(
            db, organization_id, assessment["worker_id"], mark_id,
            task["required_capabilities"])
        for current_mark_id in assessment["matching_mark_ids"][1:]:
            active_mark_for(
                db, organization_id, assessment["worker_id"], current_mark_id,
                task["required_capabilities"])
        current = task_assessment_payload(db, organization_id, task)
        latest = next(item for item in current if item["worker_id"] == worker["id"])
        if not latest["can_claim"]:
            raise HTTPException(409, "员工资格或负载已变化，请重新评估")
        member = {
            "worker_id": worker["id"],
            "worker_name": worker["name"],
            "capability_mark_id": mark["id"],
            "capability_mark_ids": assessment["matching_mark_ids"],
            "capability_name": "、".join(latest["covered_capabilities"]),
            "role": "owner",
            "rationale": latest["reason"],
            "assessment_id": assessment["id"],
            "joined_at": st.now(),
        }
        task.update(status="working", members=[member], version=task["version"] + 1)
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(db, organization_id, context["account"]["id"],
                         "task_auto_claim_confirmed", "product_task", task_id,
                         {"worker_id": worker["id"], "assessment_id": assessment["id"],
                          "mark_id": mark["id"]})
        return task


@router.post("/tasks/{task_id}/auto-team")
def auto_team_product_task(task_id: str, body: TaskAutoTeamInput,
                           context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] != "open" or task["members"]:
            raise HTTPException(409, "任务已被认领，请刷新查看最新状态")
        proposal = require_object(
            db, organization_id, "task_team_proposal", body.proposal_id)
        if proposal["task_id"] != task_id or proposal["task_version"] != task["version"]:
            raise HTTPException(409, "组队方案已过期，请重新评估")
        current_assessments = task_assessment_payload(db, organization_id, task)
        current = {
            item["id"]: item
            for item in task_team_proposals(task, current_assessments)
        }.get(proposal["id"])
        if not current:
            raise HTTPException(409, "成员资格或能力覆盖已变化，请重新评估")
        members = []
        for index, plan in enumerate(current["members"]):
            checked_marks = []
            for mark_id in plan["capability_mark_ids"]:
                _, mark = active_mark_for(
                    db, organization_id, plan["worker_id"], mark_id,
                    task["required_capabilities"])
                checked_marks.append(mark)
            if not checked_marks:
                raise HTTPException(409, "组队成员缺少有效能力印记")
            members.append({
                "worker_id": plan["worker_id"],
                "worker_name": plan["worker_name"],
                "capability_mark_id": checked_marks[0]["id"],
                "capability_mark_ids": [item["id"] for item in checked_marks],
                "capability_name": "、".join(plan["capabilities"]),
                "role": "owner" if index == 0 else "collaborator",
                "rationale": f"负责 {'、'.join(plan['capabilities'])}",
                "team_proposal_id": proposal["id"],
                "joined_at": st.now(),
            })
        team_id = None
        if len(members) >= 3:
            team = {
                "id": st.uid("TEAM"),
                "task_id": task_id,
                "name": task["title"] + "任务组",
                "member_ids": [item["worker_id"] for item in members],
                "created_reason": proposal["reason"],
                "proposal_id": proposal["id"],
                "created_at": st.now(),
            }
            st.product_save(db, organization_id, "task_team", team)
            team_id = team["id"]
        task.update(
            status="working", members=members, team_id=team_id,
            version=task["version"] + 1)
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(
            db, organization_id, context["account"]["id"],
            "task_team_started", "product_task", task_id, {
                "proposal_id": proposal["id"],
                "member_ids": [item["worker_id"] for item in members],
                "team_id": team_id,
            })
        return task


@router.post("/tasks/{task_id}/claim")
def claim_product_task(task_id: str, body: TaskClaimInput,
                       context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] not in ("open", "working", "blocked"):
            raise HTTPException(409, "任务当前不能认领")
        if task["members"]:
            raise HTTPException(409, "任务已有执行者，请使用邀请加入")
        worker, mark = active_mark_for(
            db, organization_id, body.worker_id, body.capability_mark_id,
            task["required_capabilities"])
        worker_marks = [
            item for item in st.product_all(db, organization_id, "capability_mark")
            if item["worker_id"] == worker["id"] and item["status"] == "active"
            and item["capability_name"] in task["required_capabilities"]
        ]
        covered = {item["capability_name"] for item in worker_marks}
        missing = set(task["required_capabilities"]) - covered
        if missing:
            raise HTTPException(
                409, f"该员工不能独立覆盖任务能力：{'、'.join(sorted(missing))}")
        if task["risk_level"] == "high" and all(
                item.get("delegation_level") == "read_only" for item in worker_marks):
            raise HTTPException(409, "现有印记仅允许只读建议，不能独立承担高风险任务")
        member = {
            "worker_id": worker["id"],
            "worker_name": worker["name"],
            "capability_mark_id": mark["id"],
            "capability_mark_ids": [item["id"] for item in worker_marks],
            "capability_name": "、".join(sorted(covered)),
            "role": "owner",
            "rationale": body.rationale.strip(),
            "joined_at": st.now(),
        }
        task.update(status="working", members=[member], version=task["version"] + 1)
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(db, organization_id, context["account"]["id"], "task_claimed",
                         "product_task", task_id,
                         {"worker_id": worker["id"], "mark_id": mark["id"]})
        return task


@router.post("/tasks/{task_id}/invite")
def invite_product_task(task_id: str, body: TaskInviteInput,
                        context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] not in ("working", "blocked"):
            raise HTTPException(409, "任务尚未开始或已经结束")
        if not any(item["worker_id"] == body.invited_by_worker_id for item in task["members"]):
            raise HTTPException(403, "只有当前任务成员可以发起求助")
        if any(item["worker_id"] == body.worker_id for item in task["members"]):
            raise HTTPException(409, "该员工已经在任务中")
        worker, mark = active_mark_for(
            db, organization_id, body.worker_id, body.capability_mark_id,
            task["required_capabilities"])
        member = {
            "worker_id": worker["id"],
            "worker_name": worker["name"],
            "capability_mark_id": mark["id"],
            "capability_name": mark["capability_name"],
            "role": "collaborator",
            "rationale": body.rationale.strip(),
            "joined_at": st.now(),
        }
        task["members"].append(member)
        if len(task["members"]) >= 3 and not task["team_id"]:
            team = {
                "id": st.uid("TEAM"),
                "task_id": task_id,
                "name": task["title"] + "任务组",
                "member_ids": [item["worker_id"] for item in task["members"]],
                "created_reason": body.rationale.strip(),
                "created_at": st.now(),
            }
            st.product_save(db, organization_id, "task_team", team)
            task["team_id"] = team["id"]
        elif task["team_id"]:
            team = require_object(db, organization_id, "task_team", task["team_id"])
            team["member_ids"] = [item["worker_id"] for item in task["members"]]
            st.product_save(db, organization_id, "task_team", team)
        task.update(status="working", version=task["version"] + 1)
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(db, organization_id, context["account"]["id"], "task_member_joined",
                         "product_task", task_id, {
                             "worker_id": worker["id"],
                             "member_count": len(task["members"]),
                             "team_id": task["team_id"],
                         })
        return task


def review_deliverable(task, deliverable, marks, valid_citation_refs):
    forbidden = sorted({
        action
        for mark in marks
        for action in mark.get("forbidden_actions", [])
        if action and any(
            action == performed or action in performed
            for performed in deliverable.get("performed_actions", [])
        )
    })
    checks = {
        "content_complete": {
            "passed": len(deliverable["content"].strip()) >= 20,
            "detail": "成果内容不少于 20 个字符",
        },
        "citations_present": {
            "passed": bool(deliverable["citation_refs"])
            and not deliverable["invalid_citation_refs"],
            "detail": (
                "引用均可解析到当前组织的来源或工作事件"
                if deliverable["citation_refs"]
                and not deliverable["invalid_citation_refs"]
                else (
                    f"存在无法解析的引用："
                    f"{'、'.join(deliverable['invalid_citation_refs'])}"
                    if deliverable["invalid_citation_refs"]
                    else "至少包含一条可回查的证据引用"
                )
            ),
        },
        "boundary_safe": {
            "passed": not forbidden,
            "detail": (
                "未发现越权动作" if not forbidden
                else f"触碰能力禁区：{'、'.join(forbidden)}"
            ),
        },
        "output_aligned": {
            "passed": bool(
                set(split_sentences(task["expected_output"]))
                & set(split_sentences(deliverable["content"]))
            ) or len(deliverable["content"].strip()) >= 40,
            "detail": f"对照成果要求：{task['expected_output']}",
        },
    }
    weights = {
        "content_complete": 25,
        "citations_present": 30,
        "boundary_safe": 35,
        "output_aligned": 10,
    }
    score = sum(
        weights[key] for key, value in checks.items() if value["passed"])
    hard_failed = [
        key for key in ("content_complete", "citations_present", "boundary_safe")
        if not checks[key]["passed"]
    ]
    verdict = "approved" if score >= 80 and not hard_failed else "revision_required"
    return {
        "score": score,
        "verdict": verdict,
        "checks": checks,
        "issues": [
            value["detail"] for value in checks.values() if not value["passed"]
        ],
        "rule_version": "deliverable-review-v1",
    }


def create_deliverable_record(
    db, organization_id, task, *, title, content, author_worker_id,
    citation_refs, performed_actions, change_summary="", update_id=None,
):
    if not any(
            member["worker_id"] == author_worker_id
            for member in task["members"]):
        raise HTTPException(403, "只有任务成员可以提交成果")
    previous = [
        item for item in st.product_all(db, organization_id, "deliverable")
        if item["task_id"] == task["id"]
    ]
    version = max(
        (item["version"] for item in previous), default=0) + 1
    deliverable = {
        "id": st.uid("DEL"),
        "task_id": task["id"],
        "task_version": task["version"],
        "version": version,
        "title": title.strip(),
        "content": content.strip(),
        "author_worker_id": author_worker_id,
        "citation_refs": list(dict.fromkeys(
            item.strip() for item in citation_refs if item.strip())),
        "performed_actions": list(dict.fromkeys(
            item.strip() for item in performed_actions if item.strip())),
        "change_summary": change_summary.strip(),
        "previous_deliverable_id": previous[-1]["id"] if previous else None,
        "work_update_id": update_id,
        "status": "submitted",
        "created_at": st.now(),
    }
    sources = st.product_all(db, organization_id, "case_source")
    events = st.product_all(db, organization_id, "work_event")
    valid_citation_refs = {
        value
        for source in sources
        for value in (
            source["id"], source.get("external_ref"), source.get("title"))
        if value
    } | {
        value
        for event in events
        for value in (
            event["id"], event.get("source_id"))
        if value
    }
    deliverable["invalid_citation_refs"] = [
        item for item in deliverable["citation_refs"]
        if item not in valid_citation_refs
    ]
    mark_ids = sorted({
        mark_id
        for member in task["members"]
        for mark_id in member.get(
            "capability_mark_ids", [member["capability_mark_id"]])
    })
    marks = [
        require_object(db, organization_id, "capability_mark", identifier)
        for identifier in mark_ids
    ]
    review_result = review_deliverable(
        task, deliverable, marks, valid_citation_refs)
    review = {
        "id": st.uid("DREV"),
        "task_id": task["id"],
        "deliverable_id": deliverable["id"],
        "deliverable_version": version,
        "reviewer": "independent_rules_critic",
        **review_result,
        "created_at": st.now(),
    }
    deliverable.update(
        status=review_result["verdict"],
        review_id=review["id"],
        reviewed_at=review["created_at"],
    )
    st.product_save(db, organization_id, "deliverable", deliverable)
    st.product_save(db, organization_id, "deliverable_review", review)
    return deliverable, review, mark_ids


@router.post("/tasks/{task_id}/deliverables", status_code=201)
def submit_deliverable(task_id: str, body: DeliverableInput,
                       context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] not in ("working", "blocked", "review"):
            raise HTTPException(409, "任务当前不能提交成果")
        deliverable, review, mark_ids = create_deliverable_record(
            db, organization_id, task,
            title=body.title,
            content=body.content,
            author_worker_id=body.author_worker_id,
            citation_refs=body.citation_refs,
            performed_actions=body.performed_actions,
            change_summary=body.change_summary,
        )
        shadow_run = {
            "id": "SHADOW-" + hashlib.sha256(
                deliverable["id"].encode()).hexdigest()[:12],
            "task_id": task_id,
            "task_version": task["version"],
            "deliverable_id": deliverable["id"],
            "deliverable_version": deliverable["version"],
            "digital_result": deliverable["content"],
            "evidence_refs": deliverable["citation_refs"],
            "performed_actions": deliverable["performed_actions"],
            "member_ids": [item["worker_id"] for item in task["members"]],
            "capability_mark_ids": mark_ids,
            "status": "awaiting_comparison",
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "shadow_run", shadow_run)
        task.update(
            status=(
                "review" if review["verdict"] == "approved"
                else "working"),
            latest_deliverable_id=deliverable["id"],
            latest_deliverable_version=deliverable["version"],
            version=task["version"] + 1,
        )
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(
            db, organization_id, context["account"]["id"],
            "deliverable_submitted", "deliverable", deliverable["id"], {
                "task_id": task_id,
                "version": deliverable["version"],
                "review_id": review["id"],
                "verdict": review["verdict"],
            })
        return {"deliverable": deliverable, "review": review}


@router.post("/tasks/{task_id}/updates", status_code=201)
def add_work_update(task_id: str, body: WorkUpdateInput,
                    context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if not any(item["worker_id"] == body.author_worker_id for item in task["members"]):
            raise HTTPException(403, "只有任务成员可以提交工作进展")
        if task["status"] in ("accepted", "cancelled"):
            raise HTTPException(409, "任务已经结束")
        update = {
            "id": st.uid("UPD"),
            "task_id": task_id,
            **body.model_dump(),
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "work_update", update)
        if body.update_type == "help_request":
            suggestions = task_helper_suggestions(
                db, organization_id, task, update)
            for suggestion in suggestions:
                st.product_save(
                    db, organization_id, "helper_suggestion", suggestion)
            update["helper_suggestion_ids"] = [
                item["id"] for item in suggestions]
            st.product_save(db, organization_id, "work_update", update)
        if body.update_type == "result":
            deliverable, review, mark_ids = create_deliverable_record(
                db, organization_id, task,
                title=f"{task['title']}成果",
                content=body.summary,
                author_worker_id=body.author_worker_id,
                citation_refs=body.evidence_refs,
                performed_actions=body.performed_actions,
                change_summary="从工作记录提交",
                update_id=update["id"],
            )
            shadow_run = {
                "id": "SHADOW-" + hashlib.sha256(
                    deliverable["id"].encode()).hexdigest()[:12],
                "task_id": task_id,
                "task_version": task["version"],
                "result_update_id": update["id"],
                "deliverable_id": deliverable["id"],
                "deliverable_version": deliverable["version"],
                "digital_result": deliverable["content"],
                "evidence_refs": deliverable["citation_refs"],
                "performed_actions": deliverable["performed_actions"],
                "member_ids": [item["worker_id"] for item in task["members"]],
                "capability_mark_ids": mark_ids,
                "status": "awaiting_comparison",
                "created_at": st.now(),
            }
            st.product_save(db, organization_id, "shadow_run", shadow_run)
            update["deliverable_id"] = deliverable["id"]
            st.product_save(db, organization_id, "work_update", update)
        task["status"] = {
            "blocker": "blocked",
            "help_request": "blocked",
            "result": (
                "review" if body.update_type == "result"
                and review["verdict"] == "approved" else "working"),
        }.get(body.update_type, "working")
        if body.update_type == "result":
            task["latest_deliverable_id"] = deliverable["id"]
            task["latest_deliverable_version"] = deliverable["version"]
        task["version"] += 1
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(db, organization_id, context["account"]["id"], "work_update_added",
                         "work_update", update["id"],
                         {"task_id": task_id, "update_type": body.update_type})
        return update


@router.post("/tasks/{task_id}/auto-invite")
def auto_invite_helper(task_id: str, body: TaskAutoInviteInput,
                       context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] not in ("working", "blocked"):
            raise HTTPException(409, "任务当前不能邀请协作成员")
        suggestion = require_object(
            db, organization_id, "helper_suggestion", body.suggestion_id)
        if suggestion["task_id"] != task_id:
            raise HTTPException(422, "协作建议不属于该任务")
        if suggestion["task_version"] > task["version"]:
            raise HTTPException(409, "协作建议版本无效")
        if any(item["worker_id"] == suggestion["worker_id"] for item in task["members"]):
            raise HTTPException(409, "该员工已经在任务中")
        help_request = require_object(
            db, organization_id, "work_update", suggestion["help_request_id"])
        if help_request["update_type"] != "help_request":
            raise HTTPException(409, "关联记录不是有效求助")
        current = next((
            item for item in task_helper_suggestions(
                db, organization_id, task, help_request)
            if item["worker_id"] == suggestion["worker_id"]
            and set(item["capabilities"]) == set(suggestion["capabilities"])
        ), None)
        if not current:
            raise HTTPException(409, "员工资格或负载已变化，请重新评估求助")
        marks = []
        allowed = sorted(set(task["required_capabilities"])
                         | set(help_request["missing_capabilities"]))
        for mark_id in current["capability_mark_ids"]:
            _, mark = active_mark_for(
                db, organization_id, current["worker_id"], mark_id, allowed)
            marks.append(mark)
        member = {
            "worker_id": current["worker_id"],
            "worker_name": current["worker_name"],
            "capability_mark_id": marks[0]["id"],
            "capability_mark_ids": [item["id"] for item in marks],
            "capability_name": "、".join(current["capabilities"]),
            "role": "collaborator",
            "rationale": current["reason"],
            "helper_suggestion_id": suggestion["id"],
            "joined_at": st.now(),
        }
        task["members"].append(member)
        if len(task["members"]) >= 3 and not task["team_id"]:
            team = {
                "id": st.uid("TEAM"),
                "task_id": task_id,
                "name": task["title"] + "任务组",
                "member_ids": [item["worker_id"] for item in task["members"]],
                "created_reason": help_request["summary"],
                "created_at": st.now(),
            }
            st.product_save(db, organization_id, "task_team", team)
            task["team_id"] = team["id"]
        elif task["team_id"]:
            team = require_object(
                db, organization_id, "task_team", task["team_id"])
            team["member_ids"] = [
                item["worker_id"] for item in task["members"]]
            st.product_save(db, organization_id, "task_team", team)
        task.update(status="working", version=task["version"] + 1)
        st.product_save(db, organization_id, "product_task", task)
        suggestion.update(status="accepted", accepted_at=st.now())
        st.product_save(db, organization_id, "helper_suggestion", suggestion)
        st.product_audit(
            db, organization_id, context["account"]["id"],
            "task_helper_auto_invited", "product_task", task_id, {
                "suggestion_id": suggestion["id"],
                "worker_id": member["worker_id"],
                "member_count": len(task["members"]),
                "team_id": task["team_id"],
            })
        return task


def comparison_dimensions(task, shadow_run, body, marks):
    forbidden = sorted({
        action for mark in marks for action in mark.get("forbidden_actions", [])
        if action and any(
            action == performed or action in performed
            for performed in shadow_run.get("performed_actions", [])
        )
    })
    decision_score = {"accepted": 100, "rework": 55, "taken_over": 0}[body.decision]
    evidence_score = 100 if shadow_run["evidence_refs"] else 35
    boundary_score = 0 if forbidden else 100
    expected_terms = set(split_sentences(task["expected_output"]))
    result_terms = set(split_sentences(shadow_run["digital_result"]))
    output_score = 100 if expected_terms.intersection(result_terms) else (
        75 if len(shadow_run["digital_result"]) >= 20 else 45)
    overall = round(
        decision_score * .5 + evidence_score * .2
        + boundary_score * .2 + output_score * .1)
    return {
        "acceptance": {"score": decision_score, "status": body.decision},
        "evidence_grounding": {
            "score": evidence_score,
            "status": "grounded" if shadow_run["evidence_refs"] else "missing",
            "refs": shadow_run["evidence_refs"],
        },
        "boundary_safety": {
            "score": boundary_score,
            "status": "violated" if forbidden else "within_boundary",
            "matched_forbidden_actions": forbidden,
        },
        "output_completeness": {
            "score": output_score,
            "status": "sufficient" if output_score >= 75 else "insufficient",
        },
        "overall_score": overall,
    }


def update_capability_from_comparison(db, organization_id, task, comparison):
    evidence_records = []
    for mark_id in comparison["capability_mark_ids"]:
        mark = require_object(db, organization_id, "capability_mark", mark_id)
        evidence_id = "CAPE-" + hashlib.sha256(
            f"{comparison['id']}:{mark_id}".encode()).hexdigest()[:12]
        existing = st.product_get(
            db, organization_id, "capability_evidence", evidence_id)
        if existing:
            evidence_records.append(existing)
            continue
        decision = comparison["decision"]
        evidence = {
            "id": evidence_id,
            "task_id": task["id"],
            "comparison_id": comparison["id"],
            "shadow_run_id": comparison["shadow_run_id"],
            "worker_id": mark["worker_id"],
            "capability_mark_id": mark_id,
            "capability_name": mark["capability_name"],
            "evidence_type": {
                "accepted": "verified_delivery",
                "rework": "rework_required",
                "taken_over": "human_takeover",
            }[decision],
            "decision": decision,
            "score": comparison["dimensions"]["overall_score"],
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "capability_evidence", evidence)
        mark["sample_count"] = mark.get("sample_count", 1) + 1
        counter = {
            "accepted": "accepted_count",
            "rework": "rework_count",
            "taken_over": "takeover_count",
        }[decision]
        mark[counter] = mark.get(counter, 0) + 1
        mark.setdefault("accepted_count", 0)
        mark.setdefault("rework_count", 0)
        mark.setdefault("takeover_count", 0)
        mark["last_verified_at"] = st.now()
        mark["promotion_eligible"] = (
            mark["accepted_count"] >= 3
            and mark["rework_count"] <= 1
            and mark["takeover_count"] == 0
            and mark["status"] == "active"
        )
        if (mark["takeover_count"] >= 2
                or comparison["dimensions"]["boundary_safety"]["status"] == "violated"):
            mark["status"] = "suspended"
            mark["suspension_reason"] = (
                "boundary_violation"
                if comparison["dimensions"]["boundary_safety"]["status"] == "violated"
                else "repeated_human_takeover"
            )
            mark["promotion_eligible"] = False
        st.product_save(db, organization_id, "capability_mark", mark)
        evidence_records.append(evidence)
    return evidence_records


@router.post("/tasks/{task_id}/outcomes", status_code=201)
def record_human_outcome(task_id: str, body: HumanOutcomeInput,
                         context=Depends(organization_context)):
    organization_id = context["organization"]["id"]
    with st.transaction() as db:
        task = require_object(db, organization_id, "product_task", task_id)
        if task["status"] not in ("review", "working", "blocked"):
            raise HTTPException(409, "任务当前不能验收")
        shadow_runs = [
            item for item in st.product_all(db, organization_id, "shadow_run")
            if item["task_id"] == task_id
            and item["status"] == "awaiting_comparison"
            and (
                not body.deliverable_id
                or item.get("deliverable_id") == body.deliverable_id)
        ]
        if not shadow_runs:
            raise HTTPException(409, "数字员工尚未提交可对照的结果")
        shadow_run = shadow_runs[-1]
        deliverable = (
            require_object(
                db, organization_id, "deliverable",
                shadow_run["deliverable_id"])
            if shadow_run.get("deliverable_id") else None
        )
        if body.decision == "accepted":
            if not deliverable:
                raise HTTPException(409, "必须验收一个可追踪的成果版本")
            review = require_object(
                db, organization_id, "deliverable_review",
                deliverable["review_id"])
            if review["verdict"] != "approved":
                raise HTTPException(409, "成果尚未通过独立评审，不能验收")
        comparison_id = "COMPARE-" + hashlib.sha256(
            shadow_run["id"].encode()).hexdigest()[:12]
        existing = st.product_get(
            db, organization_id, "result_comparison", comparison_id)
        if existing:
            return existing
        marks = [
            require_object(db, organization_id, "capability_mark", identifier)
            for identifier in shadow_run["capability_mark_ids"]
        ]
        outcome = {
            "id": "OUT-" + hashlib.sha256(
                shadow_run["id"].encode()).hexdigest()[:12],
            "task_id": task_id,
            "shadow_run_id": shadow_run["id"],
            "deliverable_id": deliverable["id"] if deliverable else None,
            "deliverable_version": deliverable["version"] if deliverable else None,
            "decision": body.decision,
            "summary": body.summary.strip(),
            "actual_result": body.actual_result.strip(),
            "member_ids": [item["worker_id"] for item in task["members"]],
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "human_outcome", outcome)
        dimensions = comparison_dimensions(task, shadow_run, body, marks)
        comparison = {
            "id": comparison_id,
            "task_id": task_id,
            "shadow_run_id": shadow_run["id"],
            "deliverable_id": deliverable["id"] if deliverable else None,
            "deliverable_version": deliverable["version"] if deliverable else None,
            "outcome_id": outcome["id"],
            "decision": body.decision,
            "digital_result": shadow_run["digital_result"],
            "actual_result": body.actual_result.strip(),
            "feedback": body.summary.strip(),
            "member_ids": shadow_run["member_ids"],
            "capability_mark_ids": shadow_run["capability_mark_ids"],
            "dimensions": dimensions,
            "created_at": st.now(),
        }
        st.product_save(db, organization_id, "result_comparison", comparison)
        update_capability_from_comparison(
            db, organization_id, task, comparison)
        shadow_run.update(
            status="compared", comparison_id=comparison["id"],
            outcome_id=outcome["id"], compared_at=st.now())
        st.product_save(db, organization_id, "shadow_run", shadow_run)
        if deliverable:
            deliverable["status"] = {
                "accepted": "accepted",
                "rework": "revision_required",
                "taken_over": "taken_over",
            }[body.decision]
            deliverable["outcome_id"] = outcome["id"]
            st.product_save(
                db, organization_id, "deliverable", deliverable)
        task["status"] = {
            "accepted": "accepted",
            "rework": "working",
            "taken_over": "taken_over",
        }[body.decision]
        task["version"] += 1
        st.product_save(db, organization_id, "product_task", task)
        st.product_audit(db, organization_id, context["account"]["id"], "human_outcome_recorded",
                         "human_outcome", outcome["id"],
                         {"task_id": task_id, "decision": body.decision,
                          "comparison_id": comparison["id"],
                          "overall_score": dimensions["overall_score"]})
        return comparison
