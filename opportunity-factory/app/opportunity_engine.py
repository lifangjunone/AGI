#!/usr/bin/python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SOURCE_REPORT_DIR = (
    Path.home()
    / "Library"
    / "Application Support"
    / "Technology Exploration Agent"
    / "reports"
)
SUPPORT_DIR = Path.home() / "Library" / "Application Support" / "Opportunity Compass"
REPORT_DIR = SUPPORT_DIR / "reports"
LATEST_HTML = SUPPORT_DIR / "latest.html"


def clean(value: Any) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()


def number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def parse_date(value: Any) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


@dataclass(frozen=True)
class OpportunityPattern:
    key: str
    title: str
    keywords: tuple[str, ...]
    strong_phrases: tuple[str, ...]
    buyer: str
    pain: str
    offer: str
    price: str
    channel: str
    deliverable: str
    why_now: str
    competition: str
    risks: tuple[str, ...]
    experiment: tuple[str, ...]
    pass_condition: str
    stop_condition: str


PATTERNS = (
    OpportunityPattern(
        key="agent-operations",
        title="AI Agent 交付监管与断点恢复改造包",
        keywords=(
            "agent", "智能体", "orchestrator", "workflow", "coding agent",
            "task", "tool use", "mcp", "multi-agent", "多 agent",
        ),
        strong_phrases=("agent orchestrator", "coding agent", "fleet manager", "任务编排", "断点恢复"),
        buyer="正在使用多个 AI 编码工具的 5-50 人软件团队、AI 外包团队",
        pain="Agent 长任务中断、进度不可见、人工盯守和重复重跑造成交付时间浪费",
        offer="用一周把现有 Agent 工具接入心跳、检查点、异常拉起和交付进度看板",
        price="首个诊断 1,999-3,999 元；一周改造试点 9,800-29,800 元",
        channel="AI 开发者社群、独立软件团队、正在招聘 AI 工程岗位的公司",
        deliverable="运行审计、监管 Sidecar、检查点协议、异常恢复演示、交付报告",
        why_now="Agent 正从单次问答进入长时间执行，可靠性问题开始直接影响项目交付",
        competition="已有 Agent 平台提供部分监控，但跨工具、本机运行和断点恢复仍较分散",
        risks=("团队现有任务过短，监管价值不明显", "工具缺少可读取的任务状态或检查点"),
        experiment=(
            "列出 30 家公开使用 AI 编码工具的团队，并筛选 10 家有长任务场景的团队",
            "用 3 张真实故障截图制作一页诊断说明，私信 10 位负责人",
            "提供 30 分钟免费运行审计，记录中断频次、人工盯守时间和重跑成本",
            "拿到 1 个付费诊断后，只实现该团队最痛的一条恢复链路",
        ),
        pass_condition="7 天内至少获得 3 次有效访谈，并有 1 家愿意支付诊断费或签署试点意向",
        stop_condition="10 个精准触达均否认中断和盯守成本，或没有任何人愿意开放一次运行审计",
    ),
    OpportunityPattern(
        key="knowledge-connector",
        title="企业 Agent 知识接入冲刺包",
        keywords=(
            "knowledge graph", "知识图谱", "rag", "retrieval", "knowledge base",
            "知识库", "memory", "记忆", "concept card", "indexing", "mcp",
        ),
        strong_phrases=("knowledge graph", "concept cards", "rag indexing", "知识图谱", "结构化记忆"),
        buyer="已有内部文档、客服知识或项目资料，但 Agent 回答不稳定的专业服务团队",
        pain="文档散落、检索命中不稳、知识关系不可追溯，导致 AI 回答不能直接用于工作",
        offer="7 天完成一个高价值知识域的清洗、索引、关系组织和 Agent 接入验证",
        price="知识诊断 1,299 元；单知识域冲刺 6,800-19,800 元",
        channel="咨询、法务、售后、研发支持团队，以及正在建设内部知识库的企业",
        deliverable="知识样本审计、索引策略、评测集、Agent 接口和命中率对比报告",
        why_now="大量团队已完成模型接入，下一阶段瓶颈从“能不能回答”转向“能否可信复用内部知识”",
        competition="通用知识库产品很多，机会集中在行业资料治理、评测和现有工作流接入",
        risks=("客户资料权限和隐私要求导致接入周期变长", "样本文档质量过低，短期提升有限"),
        experiment=(
            "选择一个垂直行业，收集 20 个公开的知识检索失败案例",
            "制作 10 问评测集和接入前后对比模板",
            "向 10 位知识库负责人提供一次免费命中率体检",
            "对最明确的一家，用其脱敏资料完成 48 小时样板验证",
        ),
        pass_condition="获得 2 份真实脱敏样本，并有 1 家为知识诊断或单域冲刺付费",
        stop_condition="目标客户已有稳定评测和知识治理流程，或无法提供任何可验证样本",
    ),
    OpportunityPattern(
        key="model-cost-audit",
        title="企业大模型成本与效果双轨体检",
        keywords=(
            "llm", "model", "模型", "inference", "推理", "benchmark", "evaluation",
            "eval", "multimodal", "多模态", "token", "latency", "quantization",
        ),
        strong_phrases=("inference", "benchmark", "model evaluation", "推理优化", "模型评测"),
        buyer="已经把大模型接入客服、内容或研发流程，但缺少统一评测的中小企业",
        pain="模型选型凭感觉，效果、延迟和调用成本无法同时比较，换模型风险高",
        offer="基于客户真实任务建立小型评测集，对 3-5 个候选模型做效果、速度和成本对比",
        price="单场景体检 3,999-9,999 元；迁移与优化项目 15,000 元起",
        channel="AI 应用开发商、企业数字化负责人、正在公开讨论模型成本的技术团队",
        deliverable="脱敏评测集、模型对比矩阵、失败案例、成本测算和迁移建议",
        why_now="模型迭代和价格变化很快，固定使用单一模型越来越容易造成效果或成本浪费",
        competition="云厂商提供基准测试，但通常不覆盖客户的真实任务和跨供应商比较",
        risks=("客户调用量太小，节省金额不足以覆盖服务费", "无法取得真实任务样本"),
        experiment=(
            "选定一个高频场景，做一份 30 条任务的公开评测样板",
            "找到 10 家已经上线大模型功能的中小企业",
            "提供一次模型账单和失败样本联合体检",
            "用客户 10 条脱敏任务产出一页对比结果，再报价完整评测",
        ),
        pass_condition="至少 2 家愿意提供脱敏任务，其中 1 家接受付费评测",
        stop_condition="目标客户月调用成本普遍低于 1,000 元，且不存在可量化的质量损失",
    ),
    OpportunityPattern(
        key="creative-automation",
        title="AI 内容生产流程自动化样板间",
        keywords=(
            "video", "image", "blender", "3d", "creator", "content", "multimodal",
            "视频", "图像", "建模", "内容", "创作者", "youtube", "bilibili",
        ),
        strong_phrases=("blender", "3d", "video generation", "内容生产", "场景自动化"),
        buyer="每周重复制作短视频、商品图或 3D 素材的小型内容团队和电商品牌",
        pain="素材整理、版本调整和多平台适配占用大量重复人工时间",
        offer="选择一条高频内容链路，把脚本、素材、生成、检查和导出串成可重复运行的流程",
        price="流程诊断 999 元；单链路样板 5,800-16,800 元",
        channel="小型 MCN、电商服务商、设计工作室和垂直内容创作者",
        deliverable="流程图、自动化脚本、品牌模板、质检清单和一次真实内容交付",
        why_now="多模态模型和创作工具接口逐渐成熟，但团队仍缺少适配自身素材规范的稳定工作流",
        competition="通用生成工具密集，差异化必须来自客户现有素材、模板和发布流程的深度接入",
        risks=("客户更看重创意而非效率", "平台接口变化造成维护成本"),
        experiment=(
            "选择一个内容品类，记录从需求到发布的完整人工步骤和耗时",
            "制作一条前后对比样板，明确节省的步骤而非只展示生成效果",
            "联系 10 个同类团队，询问最高频的返工环节",
            "只为最重复的一条链路报价付费样板",
        ),
        pass_condition="3 个团队承认同一返工问题，且 1 个团队愿意为样板支付至少 3,000 元",
        stop_condition="访谈显示主要瓶颈是创意判断而非重复执行，自动化不能减少可测量工时",
    ),
    OpportunityPattern(
        key="open-source-integration",
        title="热门开源 AI 工具企业落地服务",
        keywords=(
            "open source", "github", "sdk", "api", "framework", "runtime",
            "developer tool", "开源", "框架", "工具", "代码", "cli",
        ),
        strong_phrases=("open source", "github", "developer tool", "开源项目", "sdk"),
        buyer="想采用新开源 AI 工具，但缺少评估、部署和现有系统接入能力的中小研发团队",
        pain="热门项目看起来有价值，但许可证、成熟度、部署成本和集成风险难以快速判断",
        offer="对一个候选工具完成可复现安装、业务样例接入、风险清单和采用建议",
        price="单项目验证 2,999-8,999 元；生产接入 12,000 元起",
        channel="GitHub 项目讨论区、技术社群、软件外包团队和企业研发负责人",
        deliverable="可复现 Demo、适配代码、许可证检查、性能记录和上线差距清单",
        why_now="开源 AI 项目增长快于团队评估能力，企业愿意为缩短试错周期和降低接入风险付费",
        competition="传统外包能做接入，但通常缺少持续技术雷达和标准化采用评估",
        risks=("热门项目生命周期短，维护承诺难控制", "客户可由内部工程师低成本完成验证"),
        experiment=(
            "从本周信号中选择一个有明确业务用途的开源项目",
            "48 小时内做出可复现 Demo 和一页采用风险清单",
            "向 10 家目标团队展示 Demo，询问其当前评估周期和阻塞点",
            "以固定价出售一次工具验证，不承诺长期维护",
        ),
        pass_condition="至少 3 家确认存在评估积压，且 1 家愿意购买固定价验证",
        stop_condition="目标团队能在 1 天内自行完成同等验证，或项目缺少可复现安装和明确许可证",
    ),
)

SOLO_BLUEPRINTS = {
    "agent-operations": {
        "fit": 88,
        "scope": "只做一个 Agent 工具的一条关键恢复链路：心跳、检查点、异常拉起和一页状态看板。",
        "cash": 1800,
        "hours": 72,
        "launch_days": 14,
        "first_offer": "30 分钟运行审计 + 一份中断成本诊断，确认问题后再售卖固定范围改造。",
        "promotion": "在 AI 编码社群发布真实故障复盘；定向联系正在招聘 AI 工程岗位的团队负责人。",
        "revenue": "先收 1,999 元诊断费，再升级为 9,800-19,800 元固定范围实施。",
        "monthly_goal": 19600,
        "break_even": "售出 1 次付费诊断即可覆盖现金投入；2 个试点可形成稳定月收入。",
        "boundary": "不承诺跨所有 Agent 平台，不接 7×24 运维，不在首单开发通用 SaaS。",
    },
    "knowledge-connector": {
        "fit": 82,
        "scope": "只选一个知识域、50 份以内文档和 20 道评测题，交付可演示的检索改进。",
        "cash": 1200,
        "hours": 64,
        "launch_days": 12,
        "first_offer": "免费做 10 问命中率体检，付费交付单知识域清洗、索引和评测。",
        "promotion": "发布脱敏前后对比案例；定向触达咨询、售后和内部知识库负责人。",
        "revenue": "1,299 元知识诊断，随后销售 6,800-12,800 元单知识域冲刺。",
        "monthly_goal": 13600,
        "break_even": "1 个知识诊断覆盖现金成本；2 个单域冲刺达到单人可持续收入。",
        "boundary": "不接全公司知识治理，不处理未经授权的敏感数据，不承诺回答零错误。",
    },
    "model-cost-audit": {
        "fit": 76,
        "scope": "一个业务场景、30 条脱敏任务、3 个模型，输出效果、延迟与成本对比。",
        "cash": 2500,
        "hours": 56,
        "launch_days": 10,
        "first_offer": "先用 10 条任务免费产出一页对比，再销售完整评测与迁移建议。",
        "promotion": "发布公开模型账单拆解和失败样本；触达已上线 AI 功能的中小企业。",
        "revenue": "3,999-6,999 元单场景体检，迁移实施另行固定报价。",
        "monthly_goal": 14000,
        "break_even": "1 个付费体检即可回本；每月 2-3 个体检可形成稳定现金流。",
        "boundary": "不自建模型，不做无限模型横评，不接没有真实任务样本的客户。",
    },
    "creative-automation": {
        "fit": 80,
        "scope": "只自动化一种内容、一套模板和一个发布渠道，以减少返工步骤为目标。",
        "cash": 1600,
        "hours": 68,
        "launch_days": 14,
        "first_offer": "用客户一条真实内容做付费样板，明确节省的工时和可复用模板。",
        "promotion": "用前后流程录屏展示节省步骤；在垂直创作者和电商服务群触达。",
        "revenue": "999 元流程诊断，5,800-12,800 元单链路自动化样板。",
        "monthly_goal": 11600,
        "break_even": "2 个诊断或 1 个样板覆盖投入；每月 2 个样板达到目标。",
        "boundary": "不承诺创意爆款，不覆盖多平台矩阵，不承担平台账号运营。",
    },
    "open-source-integration": {
        "fit": 92,
        "scope": "一次只验证一个开源项目、一个业务样例和一种部署方式，48 小时内可演示。",
        "cash": 900,
        "hours": 48,
        "launch_days": 7,
        "first_offer": "售卖固定价的可复现验证：安装、业务样例、许可证和上线差距清单。",
        "promotion": "每周公开一个开源项目的企业采用报告；在 GitHub、V2EX 和技术群获取线索。",
        "revenue": "2,999-5,999 元单项目验证，生产接入 12,000 元起。",
        "monthly_goal": 12000,
        "break_even": "1 个验证订单即可回本；每月 2-4 个验证形成稳定收入。",
        "boundary": "不承诺项目长期维护，不接许可证不清晰的项目，不先做通用集成平台。",
    },
}

TEAM_SCALE_META = {
    "solo": {"label": "1 人", "capacity": "创始人独立完成", "fit_delta": 0},
    "micro": {"label": "2-5 人", "capacity": "产品、开发、销售可并行", "fit_delta": 6},
    "growth": {"label": "6-20 人", "capacity": "可承接多客户与持续运营", "fit_delta": 10},
}


def load_source_reports(limit: int = 7) -> list[tuple[Path, dict[str, Any]]]:
    files = sorted(SOURCE_REPORT_DIR.glob("*.json"), reverse=True)
    reports: list[tuple[Path, dict[str, Any]]] = []
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict) and (payload.get("signals") or payload.get("items")):
            reports.append((path, payload))
        if len(reports) >= limit:
            break
    return reports


def normalize_signal(raw: dict[str, Any], report_date: str) -> dict[str, Any]:
    evidence = raw.get("evidence") if isinstance(raw.get("evidence"), list) else []
    if not evidence:
        evidence = [{
            "title": raw.get("title"),
            "url": raw.get("url"),
            "source": raw.get("source") or "Technology Exploration",
            "summary": raw.get("summary"),
            "published_at": raw.get("published_at"),
            "engagement": raw.get("engagement"),
            "evidence": raw.get("evidence") if isinstance(raw.get("evidence"), str) else "",
        }]
    fields = [
        raw.get("title"), raw.get("summary"), raw.get("takeaway"), raw.get("scenario"),
        raw.get("why"), " ".join(map(str, raw.get("knowledge_points") or [])),
        " ".join(map(str, raw.get("sources") or [])),
    ]
    return {
        "title": clean(raw.get("title")),
        "url": clean(raw.get("url")),
        "text": clean(" ".join(str(field or "") for field in fields)).lower(),
        "score": number(raw.get("score")),
        "source_count": max(1, int(number(raw.get("source_count")))),
        "evidence": evidence,
        "report_date": report_date,
    }


def report_signals(report: dict[str, Any], report_date: str) -> list[dict[str, Any]]:
    rows = report.get("signals") or report.get("items") or []
    return [normalize_signal(row, report_date) for row in rows if isinstance(row, dict)]


def term_hits(text: str, pattern: OpportunityPattern) -> tuple[int, int]:
    keyword_hits = sum(1 for term in pattern.keywords if term in text)
    strong_hits = sum(1 for term in pattern.strong_phrases if term in text)
    return keyword_hits, strong_hits


def source_family(value: str) -> str:
    return clean(value).split("/", 1)[0].lower()


def score_pattern(
    pattern: OpportunityPattern,
    latest: list[dict[str, Any]],
    history: list[dict[str, Any]],
) -> dict[str, Any] | None:
    matched: list[tuple[float, dict[str, Any]]] = []
    for signal in latest:
        keyword_hits, strong_hits = term_hits(signal["text"], pattern)
        if keyword_hits == 0:
            continue
        relevance = keyword_hits * 4.5 + strong_hits * 10
        signal_strength = min(18, signal["score"] * 0.18)
        corroboration = min(8, signal["source_count"] * 2)
        matched.append((relevance + signal_strength + corroboration, signal))

    if not matched:
        return None

    matched.sort(key=lambda row: row[0], reverse=True)
    strongest = matched[:4]
    history_days = {
        signal["report_date"]
        for signal in history
        if term_hits(signal["text"], pattern)[0] > 0
    }
    evidence_rows: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    source_families: set[str] = set()
    for _, signal in strongest:
        for raw in signal["evidence"]:
            if not isinstance(raw, dict):
                continue
            url = clean(raw.get("url") or signal.get("url"))
            title = clean(raw.get("title") or signal.get("title"))
            if not title or (url and url in seen_urls):
                continue
            if url:
                seen_urls.add(url)
            source = clean(raw.get("source") or "Technology Exploration")
            source_families.add(source_family(source))
            evidence_rows.append({
                "title": title,
                "url": url,
                "source": source,
                "observed": clean(raw.get("evidence") or raw.get("summary") or "上游报告收录该信号"),
                "published_at": clean(raw.get("published_at")),
            })
            if len(evidence_rows) >= 5:
                break
        if len(evidence_rows) >= 5:
            break

    if not evidence_rows:
        return None

    demand_evidence = min(25, round(sum(row[0] for row in strongest) / max(1, len(strongest)) * 0.45))
    repeat_signal = min(12, len(history_days) * 2)
    source_diversity = min(12, len(source_families) * 4)
    monetization_clarity = 18
    execution_speed = 16
    competition_penalty = 8 if len(matched) > 5 else 5
    total = max(
        0,
        min(
            100,
            demand_evidence
            + repeat_signal
            + source_diversity
            + monetization_clarity
            + execution_speed
            - competition_penalty,
        ),
    )
    return {
        "pattern": pattern,
        "score": total,
        "components": {
            "需求证据": demand_evidence,
            "跨日持续": repeat_signal,
            "来源独立性": source_diversity,
            "变现清晰度": monetization_clarity,
            "启动速度": execution_speed,
            "竞争扣分": -competition_penalty,
        },
        "evidence": evidence_rows,
        "matched_signals": len(matched),
        "history_days": len(history_days),
        "source_families": len(source_families),
    }


def opportunity_id(day: str, key: str) -> str:
    digest = hashlib.sha1(f"{day}:{key}".encode()).hexdigest()[:8]
    return f"opp-{day.replace('-', '')}-{digest}"


def build_team_profiles(pattern: OpportunityPattern) -> dict[str, dict[str, Any]]:
    solo = SOLO_BLUEPRINTS[pattern.key]
    solo_profile = {
        "team_size": "solo",
        "label": TEAM_SCALE_META["solo"]["label"],
        "capacity": TEAM_SCALE_META["solo"]["capacity"],
        "fit_score": solo["fit"],
        "feasibility": "高" if solo["fit"] >= 85 else "中高" if solo["fit"] >= 75 else "中",
        "cash_budget": solo["cash"],
        "hours": solo["hours"],
        "launch_days": solo["launch_days"],
        "monthly_goal": solo["monthly_goal"],
        "scope": solo["scope"],
        "first_offer": solo["first_offer"],
        "promotion": solo["promotion"],
        "revenue_model": solo["revenue"],
        "break_even": solo["break_even"],
        "boundary": solo["boundary"],
        "roles": ["产品判断", "开发交付", "销售验证", "客户成功"],
    }
    micro_profile = {
        "team_size": "micro",
        "label": TEAM_SCALE_META["micro"]["label"],
        "capacity": TEAM_SCALE_META["micro"]["capacity"],
        "fit_score": min(98, solo["fit"] + TEAM_SCALE_META["micro"]["fit_delta"]),
        "feasibility": "高",
        "cash_budget": max(6000, solo["cash"] * 4),
        "hours": max(120, solo["hours"] * 2),
        "launch_days": max(10, solo["launch_days"] - 2),
        "monthly_goal": solo["monthly_goal"] * 3,
        "scope": f"{solo['scope']} 增加标准化交付模板、客户后台和并行销售验证。",
        "first_offer": pattern.offer,
        "promotion": f"{solo['promotion']} 同时建设案例内容、渠道合作和每周销售节奏。",
        "revenue_model": f"{pattern.price}；建立诊断、试点、长期服务三级报价。",
        "break_even": "以 2 个标准项目覆盖团队月固定成本，第三个项目开始贡献利润。",
        "boundary": "不在验证前扩充全职团队，不同时进入超过两个垂直行业。",
        "roles": ["产品/交付负责人", "全栈开发", "销售增长", "兼职设计或运营"],
    }
    growth_profile = {
        "team_size": "growth",
        "label": TEAM_SCALE_META["growth"]["label"],
        "capacity": TEAM_SCALE_META["growth"]["capacity"],
        "fit_score": min(99, solo["fit"] + TEAM_SCALE_META["growth"]["fit_delta"]),
        "feasibility": "高",
        "cash_budget": max(30000, solo["cash"] * 15),
        "hours": max(420, solo["hours"] * 6),
        "launch_days": max(21, solo["launch_days"] + 7),
        "monthly_goal": solo["monthly_goal"] * 8,
        "scope": f"{pattern.offer} 产品化为可配置方案，并建立多客户交付、权限、监控和服务流程。",
        "first_offer": f"以 {pattern.deliverable} 为核心销售标准试点，再升级年度服务。",
        "promotion": "行业白皮书、标杆案例、合作伙伴、定向销售和线上活动并行获客。",
        "revenue_model": f"{pattern.price}；叠加年度支持、增购模块和实施服务。",
        "break_even": "用 3-5 个标准试点覆盖研发和销售成本，再转向年度合同提高毛利。",
        "boundary": "不在标准试点重复成交前建设大而全平台，不接受无限定制。",
        "roles": ["产品负责人", "研发团队", "解决方案", "销售", "客户成功", "运营"],
    }
    return {"solo": solo_profile, "micro": micro_profile, "growth": growth_profile}


def build_lifecycle(pattern: OpportunityPattern, profile: dict[str, Any]) -> list[dict[str, Any]]:
    cash = int(profile["cash_budget"])
    days = int(profile["launch_days"])
    return [
        {
            "id": "discover",
            "label": "商机",
            "objective": "确认信号不是热度幻觉，并锁定一个可触达的付费买家。",
            "days": 1,
            "cash": 0,
            "gate": "至少有 2 个独立来源，且买家、痛点和替代方案均可明确描述。",
            "tasks": [
                "阅读全部原始证据并记录事实与假设",
                f"写出唯一首选买家：{pattern.buyer}",
                "列出客户当前替代方案及其成本",
            ],
        },
        {
            "id": "validate",
            "label": "验证",
            "objective": "在开发前确认痛点、触达渠道和付费意愿。",
            "days": 7,
            "cash": min(300, cash // 6),
            "gate": pattern.pass_condition,
            "tasks": list(pattern.experiment[:3]),
        },
        {
            "id": "build",
            "label": "开发",
            "objective": f"按单人边界交付最小可收费版本：{profile['scope']}",
            "days": max(3, days - 4),
            "cash": max(100, cash // 3),
            "gate": "核心场景可完整演示，有验收清单，不存在阻塞首单的已知故障。",
            "tasks": [
                "冻结首版范围和明确不做清单",
                "先完成最关键的端到端交付路径",
                "用一个真实样本验收并录制 2 分钟演示",
            ],
        },
        {
            "id": "launch",
            "label": "上线",
            "objective": "让客户能看到、试用、询价并留下联系方式。",
            "days": 2,
            "cash": max(100, cash // 8),
            "gate": "公开体验或交付入口可访问，定价、案例、隐私和联系方式完整。",
            "tasks": [
                "发布一页介绍、明确报价和适用边界",
                "配置咨询或付款入口及基础数据统计",
                "完成一次从访问到提交需求的全链路验收",
            ],
        },
        {
            "id": "promote",
            "label": "推广",
            "objective": profile["promotion"],
            "days": 7,
            "cash": max(100, cash // 5),
            "gate": "完成 20 个精准触达，获得至少 3 个有效回复或 1 个演示预约。",
            "tasks": [
                "发布一篇问题复盘或前后对比案例",
                "建立 20 个高匹配潜客名单并逐一触达",
                "记录来源、回复、预约和拒绝原因",
            ],
        },
        {
            "id": "monetize",
            "label": "盈利",
            "objective": profile["revenue_model"],
            "days": 7,
            "cash": 0,
            "gate": "收到第一笔真实款项，并确认交付成本、毛利和回款周期。",
            "tasks": [
                f"按首单方案报价：{profile['first_offer']}",
                "使用明确范围、交付时间和验收条件的报价单",
                "收款后记录收入、实际工时和客户结果",
            ],
        },
        {
            "id": "optimize",
            "label": "复利",
            "objective": "复盘真实数据，砍掉低回报动作，把有效交付变成可重复资产。",
            "days": 7,
            "cash": 0,
            "gate": "形成可复用模板，并决定继续、调整或停止该商机。",
            "tasks": [
                "复盘线索到付款的各阶段转化率",
                "将重复交付步骤沉淀为模板或自动化",
                "根据利润和客户反馈调整定价与目标买家",
            ],
        },
    ]


def build_opportunity(candidate: dict[str, Any], day: str, rank: int) -> dict[str, Any]:
    pattern: OpportunityPattern = candidate["pattern"]
    score = int(candidate["score"])
    confidence = "中高" if score >= 70 and candidate["source_families"] >= 2 else "中" if score >= 55 else "待验证"
    team_profiles = build_team_profiles(pattern)
    for profile in team_profiles.values():
        profile["lifecycle"] = build_lifecycle(pattern, profile)
    return {
        "id": opportunity_id(day, pattern.key),
        "rank": rank,
        "title": pattern.title,
        "confidence": confidence,
        "score": score,
        "buyer": pattern.buyer,
        "pain": pattern.pain,
        "offer": pattern.offer,
        "price": pattern.price,
        "channel": pattern.channel,
        "deliverable": pattern.deliverable,
        "why_now": pattern.why_now,
        "competition": pattern.competition,
        "risks": list(pattern.risks),
        "experiment": list(pattern.experiment),
        "pass_condition": pattern.pass_condition,
        "stop_condition": pattern.stop_condition,
        "team_profiles": team_profiles,
        "evidence": candidate["evidence"],
        "score_components": candidate["components"],
        "observed": (
            f"今日匹配 {candidate['matched_signals']} 条相关信号，"
            f"来自 {candidate['source_families']} 个独立来源族；"
            f"近 {candidate['history_days']} 个报告日持续出现。"
        ),
        "hypothesis_notice": "投入、定价、买家痛点和成交可能性均为待验证假设；实际收入与支出必须在经营账本中记录。",
    }


def generate_report(reports: list[tuple[Path, dict[str, Any]]]) -> dict[str, Any]:
    if not reports:
        raise RuntimeError(
            f"没有找到 Technology Exploration 报告：{SOURCE_REPORT_DIR}"
        )
    latest_path, latest_report = reports[0]
    generated = parse_date(latest_report.get("generated_at"))
    day = generated.astimezone().strftime("%Y-%m-%d") if generated else latest_path.stem
    latest = report_signals(latest_report, day)
    history = [
        signal
        for path, report in reports
        for signal in report_signals(report, path.stem)
    ]
    candidates = [
        candidate
        for pattern in PATTERNS
        if (candidate := score_pattern(pattern, latest, history)) is not None
    ]
    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected = candidates[:3]
    if not selected:
        raise RuntimeError("上游报告存在，但没有候选通过买家、变现和验证门槛")

    opportunities = [
        build_opportunity(candidate, day, index)
        for index, candidate in enumerate(selected, 1)
    ]
    source_status = latest_report.get("source_status") or []
    healthy_sources = sum(
        1 for status in source_status
        if isinstance(status, dict) and status.get("status") == "ok"
    )
    return {
        "schema_version": 2,
        "date": day,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_report": str(latest_path),
        "source_generated_at": latest_report.get("generated_at"),
        "source_health": {
            "healthy": healthy_sources,
            "total": len(source_status),
            "signal_count": len(latest),
            "history_days": len(reports),
        },
        "method": {
            "summary": "先用买家、付费路径、证据和可验证性做硬筛选，再按团队规模评估投入、上线周期、可落地性和盈利路径。",
            "warning": "商机是有证据支持的商业假设，不是收益保证。只有真实付费才算验证。",
        },
        "team_scales": TEAM_SCALE_META,
        "opportunities": opportunities,
    }


def save_report(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORT_DIR / f"{report['date']}.json"
    html_path = REPORT_DIR / f"{report['date']}.html"
    document = render_html(report)
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    html_path.write_text(document, encoding="utf-8")
    LATEST_HTML.write_text(document, encoding="utf-8")
    return json_path, html_path


def latest_saved_report() -> dict[str, Any] | None:
    for path in sorted(REPORT_DIR.glob("*.json"), reverse=True):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict) and payload.get("opportunities"):
            return payload
    return None


def escape_json_for_script(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c")


def render_html(report: dict[str, Any]) -> str:
    opportunities = report.get("opportunities") or []
    payload = escape_json_for_script(report)
    date_label = clean(report.get("date")).replace("-", ".")
    health = report.get("source_health") or {}
    generated_at = parse_date(report.get("generated_at"))
    source_generated_at = parse_date(report.get("source_generated_at"))
    generated_label = (
        generated_at.astimezone().strftime("%m月%d日 %H:%M")
        if generated_at else "时间未知"
    )
    source_generated_label = (
        source_generated_at.astimezone().strftime("%m月%d日 %H:%M")
        if source_generated_at else "时间未知"
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>商机罗盘</title>
<style>
:root {{
  color-scheme: light dark;
  --bg:#eef0f3;--sidebar:rgba(245,246,248,.92);--panel:#ffffff;--list:#f7f8fa;
  --text:#20242a;--muted:#737a84;--faint:#9ca2ab;--line:#dde1e6;
  --green:#16866f;--green-soft:#e7f4f0;--blue:#3a69bb;--blue-soft:#eaf0fa;
  --coral:#d85e42;--coral-soft:#fbece8;--amber:#a76c18;--amber-soft:#fbf2df;
  --selection:#e8edf4;--shadow:0 10px 28px rgba(25,31,40,.07);
}}
@media(prefers-color-scheme:dark){{
  :root{{--bg:#17191c;--sidebar:rgba(31,34,38,.96);--panel:#23262a;--list:#1e2125;
  --text:#f1f2f3;--muted:#a2a8b0;--faint:#747b84;--line:#353a40;
  --green:#55bea6;--green-soft:#203a35;--blue:#7da5e8;--blue-soft:#263448;
  --coral:#ef8a70;--coral-soft:#412c29;--amber:#e1af5b;--amber-soft:#403522;
  --selection:#303844;--shadow:none;}}
}}
*{{box-sizing:border-box}}
html,body{{height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--text);
  font:13px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",sans-serif}}
button,textarea,select{{font:inherit;color:inherit}}
button{{letter-spacing:0}}
.shell{{height:100%;display:grid;grid-template-columns:210px 350px minmax(430px,1fr)}}
.sidebar{{display:flex;flex-direction:column;min-height:0;padding:18px 12px 14px;
  background:var(--sidebar);border-right:1px solid var(--line)}}
.brand{{display:flex;align-items:center;gap:10px;padding:3px 9px 20px}}
.brand-mark{{width:30px;height:30px;display:grid;place-items:center;border-radius:7px;
  background:#176b5e;color:white;font-weight:800;box-shadow:0 5px 14px rgba(23,91,81,.22)}}
.brand b{{display:block;font-size:13px}}.brand small{{display:block;color:var(--muted);font-size:9px}}
.section-label{{padding:12px 9px 6px;color:var(--faint);font-size:9px;font-weight:700;text-transform:uppercase}}
.nav{{width:100%;height:34px;display:grid;grid-template-columns:22px 1fr auto;align-items:center;
  gap:5px;padding:0 9px;border:0;border-radius:6px;background:transparent;text-align:left;cursor:pointer}}
.nav:hover{{background:color-mix(in srgb,var(--text) 5%,transparent)}}.nav.active{{background:var(--selection);font-weight:650}}
.nav i{{font-style:normal;color:var(--muted);text-align:center}}.nav em{{font-style:normal;color:var(--muted);font-size:9px}}
.pipeline{{display:grid;gap:2px}}.pipeline .nav i{{width:8px;height:8px;border-radius:50%;justify-self:center;background:var(--faint)}}
.pipeline .nav[data-stage="validate"] i,.pipeline .nav[data-stage="build"] i{{background:var(--blue)}}
.pipeline .nav[data-stage="launch"] i,.pipeline .nav[data-stage="promote"] i{{background:var(--amber)}}
.pipeline .nav[data-stage="monetize"] i,.pipeline .nav[data-stage="optimize"] i{{background:var(--green)}}
.source-health{{margin-top:auto;padding:12px 10px;border-top:1px solid var(--line)}}
.source-health div{{display:flex;justify-content:space-between;gap:8px}}.source-health b{{font-size:11px}}
.source-health span,.source-health p{{color:var(--muted);font-size:9px}}.source-health p{{margin:6px 0 0}}
.opportunity-list{{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--list);border-right:1px solid var(--line)}}
.list-head{{padding:18px 18px 14px;border-bottom:1px solid var(--line)}}
.list-head-top{{display:flex;align-items:center;justify-content:space-between;gap:10px}}
.eyebrow{{color:var(--green);font-size:9px;font-weight:750;text-transform:uppercase}}
.list-head h1{{margin:4px 0 2px;font-size:22px;line-height:1.25}}.list-head p{{margin:0;color:var(--muted);font-size:10px}}
.refresh-data{{height:30px;display:flex;align-items:center;gap:6px;padding:0 9px;border:1px solid var(--line);
  border-radius:6px;background:var(--panel);color:var(--text);font-size:9px;font-weight:650;cursor:pointer;white-space:nowrap}}
.refresh-data:hover{{border-color:var(--green);color:var(--green)}}.refresh-data:disabled{{opacity:.58;cursor:wait}}
.refresh-data i{{font-style:normal;font-size:13px;line-height:1}}.refresh-data.updating i{{animation:spin .8s linear infinite}}
.data-freshness{{display:flex;gap:9px;flex-wrap:wrap;margin-top:9px;color:var(--muted);font-size:8px}}
.data-freshness span{{display:flex;align-items:center;gap:4px}}.data-freshness i{{width:5px;height:5px;border-radius:50%;background:var(--green)}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
.team-switch{{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:13px;padding:3px;border:1px solid var(--line);border-radius:7px;background:var(--bg)}}
.team-switch button{{height:27px;border:0;border-radius:5px;background:transparent;color:var(--muted);font-size:9px;cursor:pointer}}
.team-switch button.active{{background:var(--panel);color:var(--text);font-weight:700;box-shadow:0 1px 4px rgba(20,25,32,.08)}}
.queue{{flex:1;min-height:0;overflow-y:auto;padding:10px 8px 20px}}
.queue-item{{position:relative;width:100%;display:block;padding:16px 14px 14px;border:1px solid transparent;
  border-radius:7px;background:transparent;text-align:left;cursor:pointer}}
.queue-item+ .queue-item{{border-top-color:var(--line);border-radius:0}}
.queue-item:hover{{background:color-mix(in srgb,var(--text) 4%,transparent)}}
.queue-item.selected{{background:var(--panel);border-color:var(--line);border-radius:7px;box-shadow:0 2px 10px rgba(22,29,38,.05)}}
.queue-top{{display:flex;align-items:center;gap:8px;margin-bottom:8px}}.rank{{color:var(--faint);font-size:10px;font-weight:750}}
.confidence{{padding:2px 6px;border-radius:4px;background:var(--green-soft);color:var(--green);font-size:8px;font-weight:750}}
.status-chip{{margin-left:auto;color:var(--muted);font-size:8px}}.queue-item h2{{margin:0;font-size:14px;line-height:1.45}}
.queue-item p{{display:-webkit-box;overflow:hidden;margin:8px 0 0;color:var(--muted);font-size:10px;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
.queue-meta{{display:flex;justify-content:space-between;gap:8px;margin-top:12px;padding-top:9px;border-top:1px solid var(--line);font-size:8px;color:var(--muted)}}
.detail{{min-width:0;min-height:0;overflow-y:auto;background:var(--panel)}}
.detail-inner{{max-width:900px;margin:0 auto;padding:36px 44px 70px}}
.detail-kicker{{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:9px}}
.detail-kicker .dot{{width:6px;height:6px;border-radius:50%;background:var(--green)}}.detail-kicker b{{color:var(--green)}}
.detail h1{{max-width:760px;margin:11px 0 8px;font-size:30px;line-height:1.25;font-weight:730}}
.lead{{max-width:760px;margin:0;color:var(--muted);font-size:13px;line-height:1.65}}
.truth-note{{margin:18px 0 0;padding:10px 12px;border-left:3px solid var(--amber);background:var(--amber-soft);color:var(--amber);font-size:10px}}
.action-bar{{display:flex;align-items:center;gap:8px;margin:22px 0 26px;padding-bottom:20px;border-bottom:1px solid var(--line)}}
.status-select{{height:32px;padding:0 28px 0 10px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}}
.primary-action{{height:32px;padding:0 12px;border:0;border-radius:6px;background:var(--text);color:var(--panel);font-weight:650;cursor:pointer}}
.ghost-action{{height:32px;padding:0 10px;border:1px solid var(--line);border-radius:6px;background:transparent;cursor:pointer}}
.score-strip{{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}}
.score-strip>div{{padding:14px 14px 14px 0}}.score-strip>div+div{{padding-left:16px;border-left:1px solid var(--line)}}
.score-strip small{{display:block;color:var(--muted);font-size:9px}}.score-strip b{{display:block;margin-top:3px;font-size:13px}}
.section{{padding:24px 0;border-bottom:1px solid var(--line)}}.section h3{{margin:0 0 14px;font-size:11px}}
.fact-grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px}}.fact h4{{margin:0 0 5px;color:var(--muted);font-size:9px}}
.fact p{{margin:0;font-size:12px;line-height:1.65}}.fact.offer{{grid-column:1/-1;padding:14px 16px;border-left:3px solid var(--green);background:var(--green-soft)}}
.fact.offer h4{{color:var(--green)}}.fact.offer p{{font-size:14px;font-weight:650}}
.experiment{{display:grid;grid-template-columns:34px 1fr;gap:9px 12px;align-items:start}}
.experiment b{{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;background:var(--blue-soft);color:var(--blue);font-size:10px}}
.experiment p{{margin:2px 0 8px;line-height:1.6}}.decision-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}}
.decision{{padding:13px 14px;border:1px solid var(--line);border-radius:7px}}.decision.pass{{border-left:3px solid var(--green)}}.decision.stop{{border-left:3px solid var(--coral)}}
.decision b{{display:block;margin-bottom:5px;font-size:9px}}.decision.pass b{{color:var(--green)}}.decision.stop b{{color:var(--coral)}}.decision p{{margin:0;font-size:10px;line-height:1.55}}
.evidence-list{{display:grid;gap:0}}.evidence{{display:grid;grid-template-columns:90px 1fr auto;gap:14px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}}
.evidence:first-child{{border-top:0}}.evidence-source{{color:var(--blue);font-size:9px;font-weight:650}}.evidence a{{color:inherit;text-decoration:none;font-weight:620}}
.evidence a:hover{{color:var(--blue)}}.evidence p{{margin:4px 0 0;color:var(--muted);font-size:9px}}.evidence time{{color:var(--faint);font-size:8px;white-space:nowrap}}
.risks{{margin:0;padding-left:18px}}.risks li{{margin:7px 0;line-height:1.6}}
.score-components{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}.score-component{{padding:10px 11px;border:1px solid var(--line);border-radius:6px}}
.score-component span{{display:block;color:var(--muted);font-size:9px}}.score-component b{{font-size:13px}}
.lifecycle-rail{{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:0 0 24px}}
.stage-button{{position:relative;min-width:0;padding:9px 4px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;text-align:center;font-size:9px}}
.stage-button::before{{content:"";display:block;width:7px;height:7px;margin:0 auto 5px;border:2px solid var(--faint);border-radius:50%;background:var(--panel)}}
.stage-button.active{{border-color:var(--blue);color:var(--blue);background:var(--blue-soft);font-weight:700}}
.stage-button.done::before{{border-color:var(--green);background:var(--green)}}.stage-button.active::before{{border-color:var(--blue)}}
.stage-workbench{{padding:17px 18px;border:1px solid var(--line);border-radius:7px;background:var(--list)}}
.stage-head{{display:flex;justify-content:space-between;gap:16px;align-items:start}}.stage-head h3{{margin:0 0 5px;font-size:14px}}
.stage-head p{{margin:0;color:var(--muted);font-size:10px}}.stage-meta{{display:flex;gap:6px;white-space:nowrap}}
.stage-meta span{{padding:3px 6px;border-radius:4px;background:var(--panel);border:1px solid var(--line);font-size:8px}}
.task-list{{display:grid;gap:7px;margin:15px 0}}.task{{display:grid;grid-template-columns:20px 1fr;gap:8px;align-items:start;cursor:pointer}}
.task input{{width:15px;height:15px;margin:2px 0 0;accent-color:var(--green)}}.task span{{font-size:11px;line-height:1.5}}
.task:has(input:checked) span{{color:var(--muted);text-decoration:line-through}}
.gate{{padding:10px 11px;border-left:3px solid var(--green);background:var(--green-soft);font-size:10px}}.gate b{{color:var(--green);margin-right:6px}}
.advance-row{{display:flex;justify-content:flex-end;margin-top:12px}}
.economics{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}}.metric{{padding:12px;border:1px solid var(--line);border-radius:6px}}
.metric label{{display:block;color:var(--muted);font-size:9px}}.metric input{{width:100%;margin-top:5px;padding:0;border:0;background:transparent;color:var(--text);font-size:17px;font-weight:700;outline:0}}
.profit-summary{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}}.profit-summary div{{padding:10px 11px;background:var(--list);border-radius:6px}}
.profit-summary small{{display:block;color:var(--muted);font-size:8px}}.profit-summary b{{display:block;margin-top:3px;font-size:13px}}.profit-positive{{color:var(--green)}}.profit-negative{{color:var(--coral)}}
.promotion-box{{padding:14px 16px;border:1px solid var(--line);border-radius:7px}}.promotion-box b{{display:block;margin-bottom:6px;color:var(--blue);font-size:10px}}.promotion-box p{{margin:0;line-height:1.65}}
.team-boundary{{padding:12px 14px;border-left:3px solid var(--coral);background:var(--coral-soft)}}.team-boundary b{{display:block;color:var(--coral);font-size:9px}}.team-boundary p{{margin:4px 0 0;font-size:11px}}
.notes{{width:100%;min-height:100px;resize:vertical;padding:11px 12px;border:1px solid var(--line);border-radius:7px;background:var(--list);outline:0}}
.notes:focus{{border-color:var(--blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}}
.empty{{padding:70px 30px;text-align:center;color:var(--muted)}}
.toast{{position:fixed;right:18px;bottom:18px;padding:9px 12px;border-radius:7px;background:var(--text);color:var(--panel);font-size:10px;box-shadow:var(--shadow);opacity:0;transform:translateY(8px);pointer-events:none;transition:.18s}}
.toast.show{{opacity:1;transform:translateY(0)}}
@media(max-width:1050px){{.shell{{grid-template-columns:176px 310px minmax(420px,1fr)}}.detail-inner{{padding-left:28px;padding-right:28px}}}}
@media(max-width:1100px){{.economics,.profit-summary{{grid-template-columns:1fr 1fr}}}}
@media(max-width:900px){{.shell{{grid-template-columns:300px minmax(390px,1fr)}}.sidebar{{display:none}}.detail-inner{{padding-left:24px;padding-right:24px}}.detail h1{{font-size:25px}}.fact-grid{{grid-template-columns:1fr}}.fact.offer{{grid-column:auto}}.score-strip{{grid-template-columns:1fr 1fr}}.score-strip>div:nth-child(3){{padding-left:0;border-left:0}}.lifecycle-rail{{grid-template-columns:repeat(4,1fr)}}}}
@media(max-width:650px){{.shell{{grid-template-columns:1fr}}.detail{{display:none}}}}
@media(prefers-reduced-motion:reduce){{*,*::before,*::after{{scroll-behavior:auto!important;transition:none!important;animation:none!important}}}}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">O</div><div><b>商机罗盘</b><small>Opportunity Compass</small></div></div>
    <div class="section-label">工作台</div>
    <button class="nav active" data-filter="all"><i>⌁</i><span>今日商机</span><em>{len(opportunities)}</em></button>
    <button class="nav" data-filter="history"><i>◷</i><span>历史报告</span><em>{health.get('history_days', 0)}天</em></button>
    <div class="section-label">经营阶段</div>
    <div class="pipeline">
      <button class="nav" data-stage="discover"><i></i><span>商机确认</span><em id="count-discover">0</em></button>
      <button class="nav" data-stage="validate"><i></i><span>需求验证</span><em id="count-validate">0</em></button>
      <button class="nav" data-stage="build"><i></i><span>开发交付</span><em id="count-build">0</em></button>
      <button class="nav" data-stage="launch"><i></i><span>正式上线</span><em id="count-launch">0</em></button>
      <button class="nav" data-stage="promote"><i></i><span>推广获客</span><em id="count-promote">0</em></button>
      <button class="nav" data-stage="monetize"><i></i><span>收款盈利</span><em id="count-monetize">0</em></button>
      <button class="nav" data-stage="optimize"><i></i><span>复盘复利</span><em id="count-optimize">0</em></button>
    </div>
    <div class="source-health">
      <div><b>数据源健康</b><span>{health.get('healthy', 0)} / {health.get('total', 0)}</span></div>
      <p>读取 Technology Exploration · {health.get('signal_count', 0)} 条今日信号</p>
    </div>
  </aside>
  <section class="opportunity-list">
    <header class="list-head"><div class="list-head-top"><div class="eyebrow">Daily opportunity brief</div>
      <button class="refresh-data" id="refresh-data" type="button" title="重新读取 Technology Exploration 最新数据并计算商机"><i>↻</i><span>更新数据</span></button>
      </div><h1>{date_label} 商机</h1><p>按团队承载力重算投入、落地与盈利路径</p>
      <div class="data-freshness"><span title="本页商机完成计算的时间"><i></i>商机生成 {generated_label}</span><span title="Technology Exploration 上游报告的生成时间">来源数据 {source_generated_label}</span></div>
      <div class="team-switch" id="team-switch"><button data-team="solo">1 人</button><button data-team="micro">2-5 人</button><button data-team="growth">6-20 人</button></div>
    </header>
    <div class="queue" id="queue"></div>
  </section>
  <main class="detail" id="detail"></main>
</div>
<div class="toast" id="toast">已保存</div>
<script>
const report={payload};
const stageLabels={{discover:'商机',validate:'验证',build:'开发',launch:'上线',promote:'推广',monetize:'盈利',optimize:'复利'}};
const stageOrder=Object.keys(stageLabels);
let selectedId=localStorage.getItem('opportunity.selected')||report.opportunities[0]?.id||'';
let teamSize=localStorage.getItem('opportunity.teamSize')||'solo';
let activeFilter='all',viewedStage='';
const stateKey='opportunity.state.v2';
let states={{}};
try{{states=JSON.parse(localStorage.getItem(stateKey)||'{{}}')}}catch(_e){{states={{}}}}
function getState(id){{return states[id]||{{stage:'discover',completedTasks:{{}},notes:'',spend:0,revenue:0,leads:0,customers:0}};}}
function saveState(id,patch){{
  states[id]={{...getState(id),...patch,updatedAt:new Date().toISOString()}};
  localStorage.setItem(stateKey,JSON.stringify(states));updateCounts();showToast('已保存在本机');
}}
function profileFor(item){{return item.team_profiles?.[teamSize]||item.team_profiles?.solo;}}
function nativeMessage(message){{
  const handler=window.webkit?.messageHandlers?.opportunityCompass;
  if(handler)handler.postMessage(message);else if(message.action==='open-url')window.open(message.url,'_blank');
}}
function visibleOpportunities(){{
  const sorted=[...report.opportunities].sort((a,b)=>profileFor(b).fit_score-profileFor(a).fit_score);
  return activeFilter==='all'?sorted:sorted.filter(item=>getState(item.id).stage===activeFilter);
}}
function updateCounts(){{
  stageOrder.forEach(stage=>{{const node=document.getElementById('count-'+stage);if(node)node.textContent=report.opportunities.filter(item=>getState(item.id).stage===stage).length;}});
}}
function renderQueue(){{
  const items=visibleOpportunities();
  document.getElementById('queue').innerHTML=items.length?items.map(item=>{{
    const state=getState(item.id),profile=profileFor(item);
    return `<button class="queue-item ${{item.id===selectedId?'selected':''}}" data-id="${{item.id}}">
      <div class="queue-top"><span class="rank">${{profile.label}}</span><span class="confidence">${{profile.feasibility}}落地 · ${{profile.fit_score}}分</span><span class="status-chip">${{stageLabels[state.stage]}}</span></div>
      <h2>${{escapeHtml(item.title)}}</h2><p>${{escapeHtml(profile.first_offer)}}</p>
      <div class="queue-meta"><span>投入 ¥${{money(profile.cash_budget)}} · ${{profile.hours}}h</span><span>${{profile.launch_days}} 天上线</span></div></button>`;
  }}).join(''):'<div class="empty">该阶段暂时没有商机</div>';
  document.querySelectorAll('.queue-item').forEach(button=>button.addEventListener('click',()=>{{selectedId=button.dataset.id;viewedStage='';localStorage.setItem('opportunity.selected',selectedId);renderQueue();renderDetail();}}));
}}
function renderDetail(){{
  const item=report.opportunities.find(row=>row.id===selectedId)||visibleOpportunities()[0];
  if(!item){{document.getElementById('detail').innerHTML='<div class="empty">请选择一条商机</div>';return;}}
  selectedId=item.id;
  const state=getState(item.id),profile=profileFor(item);
  const currentStage=profile.lifecycle.find(stage=>stage.id===(viewedStage||state.stage))||profile.lifecycle[0];
  const stageIndex=stageOrder.indexOf(state.stage);
  const components=Object.entries(item.score_components).map(([label,value])=>`<div class="score-component"><span>${{label}}</span><b>${{value>0?'+':''}}${{value}}</b></div>`).join('');
  const evidence=item.evidence.map(row=>`<div class="evidence"><span class="evidence-source">${{escapeHtml(row.source)}}</span><div><a href="${{escapeHtml(row.url)}}" data-url="${{escapeHtml(row.url)}}">${{escapeHtml(row.title)}}</a><p>${{escapeHtml(row.observed||'上游报告已收录')}}</p></div><time>${{escapeHtml((row.published_at||'').slice(0,10))}}</time></div>`).join('');
  const lifecycle=profile.lifecycle.map((stage,index)=>`<button class="stage-button ${{stage.id===currentStage.id?'active':''}} ${{index<stageIndex?'done':''}}" data-view-stage="${{stage.id}}">${{stage.label}}</button>`).join('');
  const tasks=currentStage.tasks.map((task,index)=>{{
    const taskKey=`${{teamSize}}:${{currentStage.id}}:${{index}}`;
    return `<label class="task"><input type="checkbox" data-task="${{taskKey}}" ${{state.completedTasks?.[taskKey]?'checked':''}}><span>${{escapeHtml(task)}}</span></label>`;
  }}).join('');
  document.getElementById('detail').innerHTML=`<article class="detail-inner">
    <div class="detail-kicker"><span class="dot"></span><b>${{profile.label}}团队 · ${{profile.feasibility}}落地</b><span>适配度 ${{profile.fit_score}} / 100</span><span>·</span><span>${{item.observed}}</span></div>
    <h1>${{escapeHtml(item.title)}}</h1><p class="lead">${{escapeHtml(item.offer)}}</p><div class="truth-note">${{escapeHtml(item.hypothesis_notice)}}</div>
    <div class="action-bar"><select class="status-select" id="stage-select">${{profile.lifecycle.map(stage=>`<option value="${{stage.id}}" ${{state.stage===stage.id?'selected':''}}>${{stage.label}}</option>`).join('')}}</select>
      <button class="primary-action" id="advance-stage">完成当前阶段并推进</button><button class="ghost-action" id="copy-brief">复制完整执行摘要</button></div>
    <div class="score-strip"><div><small>预计现金投入</small><b>¥${{money(profile.cash_budget)}}</b></div><div><small>个人工时</small><b>${{profile.hours}} 小时</b></div><div><small>可上线时间</small><b>${{profile.launch_days}} 天</b></div><div><small>月收入目标</small><b>¥${{money(profile.monthly_goal)}}</b></div></div>
    <section class="section"><h3>${{profile.label}}团队落地模型</h3><div class="fact-grid">
      <div class="fact offer"><h4>最小可收费版本</h4><p>${{escapeHtml(profile.scope)}}</p></div>
      <div class="fact"><h4>谁会付钱</h4><p>${{escapeHtml(item.buyer)}}</p></div><div class="fact"><h4>付钱解决什么</h4><p>${{escapeHtml(item.pain)}}</p></div>
      <div class="fact"><h4>首单怎么卖</h4><p>${{escapeHtml(profile.first_offer)}}</p></div><div class="fact"><h4>需要承担的角色</h4><p>${{escapeHtml(profile.roles.join('、'))}}</p></div>
    </div><div class="team-boundary"><b>范围红线</b><p>${{escapeHtml(profile.boundary)}}</p></div></section>
    <section class="section"><h3>从商机到盈利的完整闭环</h3><div class="lifecycle-rail">${{lifecycle}}</div>
      <div class="stage-workbench"><div class="stage-head"><div><h3>${{currentStage.label}}阶段</h3><p>${{escapeHtml(currentStage.objective)}}</p></div><div class="stage-meta"><span>${{currentStage.days}} 天</span><span>预算 ¥${{money(currentStage.cash)}}</span></div></div>
      <div class="task-list">${{tasks}}</div><div class="gate"><b>放行条件</b>${{escapeHtml(currentStage.gate)}}</div><div class="advance-row"><button class="primary-action" id="advance-inline">完成并进入下一阶段</button></div></div></section>
    <section class="section"><h3>推广与盈利设计</h3><div class="fact-grid"><div class="promotion-box"><b>推广获客</b><p>${{escapeHtml(profile.promotion)}}</p></div><div class="promotion-box"><b>收费方式</b><p>${{escapeHtml(profile.revenue_model)}}</p></div><div class="promotion-box"><b>回本逻辑</b><p>${{escapeHtml(profile.break_even)}}</p></div><div class="promotion-box"><b>目标买家渠道</b><p>${{escapeHtml(item.channel)}}</p></div></div></section>
    <section class="section"><h3>真实经营账本</h3><div class="economics">
      <div class="metric"><label>实际投入（元）</label><input id="spend-input" type="number" min="0" value="${{numberValue(state.spend)}}"></div>
      <div class="metric"><label>实际收入（元）</label><input id="revenue-input" type="number" min="0" value="${{numberValue(state.revenue)}}"></div>
      <div class="metric"><label>有效线索</label><input id="leads-input" type="number" min="0" value="${{numberValue(state.leads)}}"></div>
      <div class="metric"><label>付费客户</label><input id="customers-input" type="number" min="0" value="${{numberValue(state.customers)}}"></div>
    </div><div class="profit-summary" id="profit-summary"></div></section>
    <section class="section"><h3>原始证据链</h3><div class="evidence-list">${{evidence}}</div></section>
    <section class="section"><h3>竞争与风险</h3><div class="fact"><h4>现有替代方案</h4><p>${{escapeHtml(item.competition)}}</p></div><ul class="risks">${{item.risks.map(risk=>`<li>${{escapeHtml(risk)}}</li>`).join('')}}</ul></section>
    <section class="section"><h3>评分为什么是 ${{item.score}}</h3><div class="score-components">${{components}}</div></section>
    <section class="section"><h3>经营记录</h3><textarea class="notes" id="notes" placeholder="记录访谈、开发决策、推广反馈、报价、收款和复盘…">${{escapeHtml(state.notes||'')}}</textarea></section>
  </article>`;
  document.querySelectorAll('[data-view-stage]').forEach(button=>button.addEventListener('click',()=>{{viewedStage=button.dataset.viewStage;renderDetail();}}));
  document.querySelectorAll('[data-task]').forEach(input=>input.addEventListener('change',()=>{{const completed={{...(getState(item.id).completedTasks||{{}}),[input.dataset.task]:input.checked}};saveState(item.id,{{completedTasks:completed}});}}));
  document.getElementById('stage-select').addEventListener('change',event=>{{viewedStage=event.target.value;saveState(item.id,{{stage:event.target.value}});renderQueue();renderDetail();}});
  const advance=()=>advanceStage(item);
  document.getElementById('advance-stage').addEventListener('click',advance);document.getElementById('advance-inline').addEventListener('click',advance);
  ['spend','revenue','leads','customers'].forEach(field=>document.getElementById(field+'-input').addEventListener('change',event=>{{saveState(item.id,{{[field]:Math.max(0,Number(event.target.value)||0)}});renderProfit(item);}}));
  document.getElementById('notes').addEventListener('change',event=>saveState(item.id,{{notes:event.target.value}}));
  document.getElementById('copy-brief').addEventListener('click',()=>copyBrief(item));
  document.querySelectorAll('a[data-url]').forEach(link=>link.addEventListener('click',event=>{{event.preventDefault();nativeMessage({{action:'open-url',url:link.dataset.url}});}}));
  renderProfit(item);
}}
function advanceStage(item){{
  const state=getState(item.id),profile=profileFor(item),stage=profile.lifecycle.find(row=>row.id===state.stage);
  const complete=(stage?.tasks||[]).every((_task,index)=>state.completedTasks?.[`${{teamSize}}:${{state.stage}}:${{index}}`]);
  if(!complete){{showToast('请先完成当前阶段的全部任务');return;}}
  const index=stageOrder.indexOf(state.stage),next=stageOrder[Math.min(index+1,stageOrder.length-1)];
  saveState(item.id,{{stage:next}});viewedStage=next;renderQueue();renderDetail();
}}
function renderProfit(item){{
  const state=getState(item.id),profile=profileFor(item),profit=Number(state.revenue||0)-Number(state.spend||0),roi=state.spend>0?Math.round(profit/state.spend*100):0,conversion=state.leads>0?Math.round((state.customers||0)/state.leads*100):0,gap=Math.max(0,profile.monthly_goal-Number(state.revenue||0));
  document.getElementById('profit-summary').innerHTML=`<div><small>当前利润</small><b class="${{profit>=0?'profit-positive':'profit-negative'}}">¥${{money(profit)}}</b></div><div><small>投入回报率</small><b>${{roi}}%</b></div><div><small>线索成交率</small><b>${{conversion}}%</b></div><div><small>距月目标</small><b>¥${{money(gap)}}</b></div>`;
}}
function copyBrief(item){{
  const profile=profileFor(item),text=`${{item.title}}（${{profile.label}}团队）\\n适配度：${{profile.fit_score}}\\n预计投入：¥${{profile.cash_budget}} / ${{profile.hours}} 小时\\n上线周期：${{profile.launch_days}} 天\\n最小版本：${{profile.scope}}\\n首单：${{profile.first_offer}}\\n推广：${{profile.promotion}}\\n盈利：${{profile.revenue_model}}\\n回本：${{profile.break_even}}`;
  if(window.webkit?.messageHandlers?.opportunityCompass){{
    nativeMessage({{action:'copy-text',text}});showToast('完整执行摘要已复制');
  }}else{{
    navigator.clipboard?.writeText(text).then(()=>showToast('完整执行摘要已复制')).catch(()=>showToast('复制失败'));
  }}
}}
function money(value){{return Math.round(Number(value)||0).toLocaleString('zh-CN');}}
function numberValue(value){{return Number(value)||0;}}
function escapeHtml(value){{return String(value??'').replace(/[&<>"']/g,char=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[char]));}}
function showToast(message){{const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1600);}}
document.querySelectorAll('.nav[data-stage]').forEach(button=>button.addEventListener('click',()=>{{activeFilter=button.dataset.stage;document.querySelectorAll('.nav').forEach(node=>node.classList.remove('active'));button.classList.add('active');const first=visibleOpportunities()[0];if(first)selectedId=first.id;renderQueue();renderDetail();}}));
document.querySelector('.nav[data-filter="all"]').addEventListener('click',event=>{{activeFilter='all';document.querySelectorAll('.nav').forEach(node=>node.classList.remove('active'));event.currentTarget.classList.add('active');renderQueue();renderDetail();}});
document.querySelector('.nav[data-filter="history"]').addEventListener('click',()=>nativeMessage({{action:'open-reports'}}));
document.getElementById('refresh-data').addEventListener('click',event=>{{
  const button=event.currentTarget;
  const handler=window.webkit?.messageHandlers?.opportunityCompass;
  if(!handler){{showToast('请在商机罗盘桌面应用中更新数据');return;}}
  button.disabled=true;button.classList.add('updating');
  button.querySelector('span').textContent='更新中…';
  nativeMessage({{action:'refresh'}});
  showToast('正在读取最新情报并重新计算');
}});
document.querySelectorAll('[data-team]').forEach(button=>{{button.classList.toggle('active',button.dataset.team===teamSize);button.addEventListener('click',()=>{{teamSize=button.dataset.team;localStorage.setItem('opportunity.teamSize',teamSize);viewedStage='';document.querySelectorAll('[data-team]').forEach(node=>node.classList.toggle('active',node.dataset.team===teamSize));renderQueue();renderDetail();}});}});
updateCounts();renderQueue();renderDetail();
</script>
</body>
</html>"""


def generate_and_save() -> tuple[dict[str, Any], Path, Path]:
    report = generate_report(load_source_reports())
    json_path, html_path = save_report(report)
    return report, json_path, html_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate evidence-backed daily opportunities")
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--print-json", action="store_true")
    parser.add_argument("--render-latest", action="store_true")
    args = parser.parse_args()
    try:
        if args.render_latest:
            report = latest_saved_report()
            if not report:
                raise RuntimeError("还没有已保存的商机报告")
            _, html_path = save_report(report)
            print(html_path)
            return 0
        report, json_path, html_path = generate_and_save()
        if args.print_json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(json.dumps({
                "success": True,
                "count": len(report["opportunities"]),
                "json": str(json_path),
                "html": str(html_path),
            }, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"success": False, "error": clean(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
