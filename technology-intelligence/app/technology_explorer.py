#!/usr/bin/python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import datetime as dt
import email.utils
import getpass
import html
import json
import math
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tkinter import END, BOTH, LEFT, RIGHT, VERTICAL, X, Y, BooleanVar, StringVar, Tk, Toplevel, messagebox
from tkinter import ttk
from typing import Optional


APP_NAME = "Technology Exploration Agent"
SUPPORT_DIR = Path.home() / "Library" / "Application Support" / APP_NAME
REPORT_DIR = SUPPORT_DIR / "reports"
CONFIG_PATH = SUPPORT_DIR / "config.json"
JOB_DIR = SUPPORT_DIR / "jobs"
PROJECT_DIR = SUPPORT_DIR / "requirement-projects"
DEMO_HANDOFF_DIR = SUPPORT_DIR / "demo-handoffs"
PROVIDER_ADDRESS = ("127.0.0.1", 43128)
PROJECT_SCAN_INTERVAL_SECONDS = 300
DEFAULT_RESEARCH_TOPIC = "AI 工程与智能体"
DEFAULT_RESEARCH_KEYWORDS = [
    "AI agent",
    "LLM",
    "open source AI",
    "developer tools",
    "RAG",
    "multimodal AI",
]
DEFAULT_RESEARCH_TOPICS = [
    {
        "id": "agents",
        "name": "AI 智能体",
        "keywords": ["AI agent", "agentic AI", "MCP", "tool use"],
    },
    {
        "id": "models",
        "name": "大模型与多模态",
        "keywords": ["LLM", "multimodal AI", "vision language model", "inference"],
    },
    {
        "id": "devtools",
        "name": "开源开发工具",
        "keywords": ["open source AI", "developer tools", "coding agent", "AI IDE"],
    },
    {
        "id": "knowledge",
        "name": "RAG 与知识工程",
        "keywords": ["RAG", "knowledge graph", "vector database", "retrieval augmented generation"],
    },
    {
        "id": "personal-assistants",
        "name": "个人助理",
        "keywords": [
            "WorkBuddy", "千问办公", "豆包工作", "Kimi Work",
            "TRAE Work", "阶跃桌面版", "desktop agent", "AI 办公助手",
        ],
    },
    {
        "id": "agent-platforms",
        "name": "Agent 平台",
        "keywords": [
            "腾讯 ADP", "HiAgent", "阿里百炼", "Agent Builder",
            "Copilot Studio", "智能体开发平台", "Agent governance",
            "Agent Portal", "Agent ID Guard", "Agent 365",
            "Agent Registry", "AgentCore", "Agent Fabric",
            "AI Control Tower", "AgentSphere", "智能体纳管",
        ],
    },
    {
        "id": "ai-coding",
        "name": "AI Coding",
        "keywords": [
            "Codex", "TRAE", "CodeBuddy", "Claude Code",
            "Cursor", "Windsurf", "Qoder", "coding agent",
        ],
    },
    {
        "id": "knowledge-engines",
        "name": "知识引擎",
        "keywords": [
            "ima", "腾讯乐享", "企业知识引擎", "Agentic RAG",
            "百度甄知", "千帆知识库", "NotebookLM", "Cloud Search",
            "SharePoint", "Microsoft Graph", "Amazon Q Business",
            "enterprise knowledge", "AI knowledge base",
        ],
    },
]
REQUIRED_TRACKING_TOPICS = DEFAULT_RESEARCH_TOPICS[-4:]
PRODUCT_MATRIX = [
    {
        "vendor": "腾讯", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("WorkBuddy", "https://www.workbuddy.cn/"),
            "mobile": ("腾讯元宝 / WorkBuddy", "https://yuanbao.tencent.com/"),
            "platform": ("腾讯云 ADP", "https://cloud.tencent.com/product/adp"),
            "governance": ("ADP Agent Portal", "https://adp.tencentcloud.com/zh/blog/adp-agent-portal"),
            "data": ("ima / 腾讯乐享", "https://cloud.tencent.com.cn/product/lexiang"),
            "coding": ("CodeBuddy", "https://www.codebuddy.ai/"),
        },
    },
    {
        "vendor": "阿里巴巴", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("千问办公", "https://qwenwork.cn/"),
            "mobile": ("千问", "https://www.qianwen.com/"),
            "platform": ("阿里云百炼", "https://bailian.console.aliyun.com/"),
            "governance": ("Agent ID Guard", "https://help.aliyun.com/zh/idaas/eiam/user-guide/scenarios-for-using-agent-id-guard"),
            "data": ("百炼 Agentic RAG", "https://rag.console.aliyun.com/"),
            "coding": ("Qoder / 通义灵码", "https://qoder.com/"),
        },
    },
    {
        "vendor": "字节跳动", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("豆包工作 / TRAE Work", "https://work.trae.cn/"),
            "mobile": ("豆包 / TRAE", "https://www.doubao.com/"),
            "platform": ("火山引擎 HiAgent / 扣子", "https://www.volcengine.com/product/hiagent"),
            "governance": ("AgentSphere", "https://www.volcengine.com/product/hiagent"),
            "data": ("企业知识引擎", "https://www.volcengine.com/docs/86760/1867053"),
            "coding": ("TRAE", "https://www.trae.cn/"),
        },
    },
    {
        "vendor": "月之暗面", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("Kimi Work", "https://www.kimi.com/zh-cn/products/kimi-work"),
            "mobile": ("Kimi", "https://www.kimi.com/"),
            "platform": ("Kimi 开放平台", "https://platform.moonshot.cn/"),
            "governance": ("-", ""),
            "data": ("Kimi 知识库", "https://www.kimi.com/"),
            "coding": ("Kimi Code", "https://www.kimi.com/code/"),
        },
    },
    {
        "vendor": "阶跃星辰", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("阶跃桌面版", "https://stepfun.com/"),
            "mobile": ("阶跃 AI", "https://stepfun.com/"),
            "platform": ("阶跃开放平台", "https://platform.stepfun.com/"),
            "governance": ("-", ""),
            "data": ("-", ""),
            "coding": ("-", ""),
        },
    },
    {
        "vendor": "百度", "region": "china", "tier": "观察",
        "products": {
            "desktop": ("文心一言", "https://yiyan.baidu.com/"),
            "mobile": ("文小言", "https://yiyan.baidu.com/"),
            "platform": ("百度智能云千帆", "https://cloud.baidu.com/product/wenxinworkshop"),
            "governance": ("-", ""),
            "data": ("甄知 / 千帆知识库", "https://zhenzhi.cloud.baidu.com/"),
            "coding": ("Comate", "https://comate.baidu.com/"),
        },
    },
    {
        "vendor": "华为", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("小艺（HarmonyOS PC）", "https://consumer.huawei.com/cn/mobileservices/celia/"),
            "mobile": ("小艺", "https://consumer.huawei.com/cn/mobileservices/celia/"),
            "platform": ("小艺智能体平台", "https://developer.huawei.com/consumer/cn/doc/service/platform-concepts-0000002625401382"),
            "governance": ("-", ""),
            "data": ("盘古大模型知识库", "https://www.huaweicloud.com/product/pangu.html"),
            "coding": ("CodeArts Doer", "https://www.huaweicloud.com/product/codearts.html"),
        },
    },
    {
        "vendor": "京东", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("JoyClaw", "https://joyagent.jd.com/pl/enterprise"),
            "mobile": ("京言", "https://oxygen.jd.com/solution"),
            "platform": ("JoyAgent 开发平台", "https://joyagent.jd.com/pl/enterprise"),
            "governance": ("大模型安全网关", "https://joyagent.jd.com/pl/enterprise"),
            "data": ("JoyContext", "https://joyagent.jd.com/pl/enterprise"),
            "coding": ("JoyCode", "https://joyagent.jd.com/pl/enterprise"),
        },
    },
    {
        "vendor": "小米", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("Xiaomi MiMo Desktop", "https://mimo.xiaomi.com/zh"),
            "mobile": ("超级小爱", "https://developers.xiaoai.mi.com/xiaoai"),
            "platform": ("Xiaomi MiMo API", "https://platform.xiaomimimo.com/"),
            "governance": ("-", ""),
            "data": ("-", ""),
            "coding": ("MiMo Code", "https://mimo.xiaomi.com/zh"),
        },
    },
    {
        "vendor": "美团", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("CatPaw / Tabbit", "https://tech.meituan.com/2026/07/28/CatPaw-LongCat.html"),
            "mobile": ("CatPaw / 小团", "https://www.meituan.com/technology"),
            "platform": ("CatPaw Managed Agents", "https://tech.meituan.com/2026/07/28/CatPaw-LongCat.html"),
            "governance": ("CatPaw 企业管理", "https://tech.meituan.com/2026/07/28/CatPaw-LongCat.html"),
            "data": ("-", ""),
            "coding": ("-", ""),
        },
    },
    {
        "vendor": "智谱", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("AutoGLM / 智谱清言", "https://chatglm.cn/"),
            "mobile": ("智谱清言", "https://chatglm.cn/"),
            "platform": ("智谱开放平台", "https://open.bigmodel.cn/"),
            "governance": ("-", ""),
            "data": ("智谱知识库", "https://open.bigmodel.cn/"),
            "coding": ("Z Code / GLM Coding Plan", "https://bigmodel.cn/activity/trial-card/HLKCALKANE"),
        },
    },
    {
        "vendor": "DeepSeek", "region": "china", "tier": "重点",
        "products": {
            "desktop": ("DeepSeek", "https://chat.deepseek.com/"),
            "mobile": ("DeepSeek", "https://chat.deepseek.com/"),
            "platform": ("DeepSeek 开放平台", "https://platform.deepseek.com/"),
            "governance": ("-", ""),
            "data": ("-", ""),
            "coding": ("DeepSeek Harness", "https://deepseek-harness.github.io/deepseek-harness/"),
        },
    },
    {
        "vendor": "OpenAI", "region": "global", "tier": "重点",
        "products": {
            "desktop": ("ChatGPT Desktop", "https://chatgpt.com/download/"),
            "mobile": ("ChatGPT", "https://chatgpt.com/download/"),
            "platform": ("OpenAI Agent Platform", "https://platform.openai.com/"),
            "governance": ("-", ""),
            "data": ("-", ""),
            "coding": ("Codex", "https://openai.com/codex/"),
        },
    },
    {
        "vendor": "Anthropic", "region": "global", "tier": "重点",
        "products": {
            "desktop": ("Claude Desktop", "https://claude.ai/download"),
            "mobile": ("Claude", "https://claude.ai/"),
            "platform": ("Claude Agent SDK", "https://docs.anthropic.com/"),
            "governance": ("-", ""),
            "data": ("-", ""),
            "coding": ("Claude Code", "https://www.anthropic.com/claude-code"),
        },
    },
    {
        "vendor": "Google", "region": "global", "tier": "重点",
        "products": {
            "desktop": ("Gemini", "https://gemini.google.com/"),
            "mobile": ("Gemini", "https://gemini.google.com/"),
            "platform": ("Gemini Enterprise Agent Platform", "https://cloud.google.com/generative-ai-app-builder"),
            "governance": ("Agent Registry / Gateway", "https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform"),
            "data": ("NotebookLM / Cloud Search", "https://workspace.google.com/products/cloud-search/"),
            "coding": ("Gemini Code Assist / Jules", "https://codeassist.google/"),
        },
    },
    {
        "vendor": "Microsoft", "region": "global", "tier": "重点",
        "products": {
            "desktop": ("Microsoft 365 Copilot", "https://www.microsoft.com/microsoft-365/copilot"),
            "mobile": ("Microsoft Copilot", "https://copilot.microsoft.com/"),
            "platform": ("Copilot Studio / Foundry", "https://www.microsoft.com/microsoft-copilot/microsoft-copilot-studio"),
            "governance": ("Microsoft Agent 365", "https://www.microsoft.com/en/microsoft-agent-365"),
            "data": ("SharePoint / Microsoft Graph", "https://www.microsoft.com/microsoft-365/sharepoint/collaboration"),
            "coding": ("GitHub Copilot", "https://github.com/features/copilot"),
        },
    },
    {
        "vendor": "Amazon", "region": "global", "tier": "观察",
        "products": {
            "desktop": ("Amazon Q", "https://aws.amazon.com/q/"),
            "mobile": ("Alexa+", "https://www.amazon.com/alexa"),
            "platform": ("Amazon Bedrock Agents", "https://aws.amazon.com/bedrock/agents/"),
            "governance": ("Bedrock AgentCore", "https://aws.amazon.com/bedrock/agentcore/"),
            "data": ("Amazon Q Business", "https://aws.amazon.com/q/business/"),
            "coding": ("Kiro", "https://kiro.dev/"),
        },
    },
    {
        "vendor": "ServiceNow", "region": "global", "tier": "纳管重点",
        "products": {
            "desktop": ("Now Assist", "https://www.servicenow.com/products/now-assist.html"),
            "mobile": ("Now Mobile", "https://www.servicenow.com/products/mobile-employee-experience.html"),
            "platform": ("AI Agent Studio", "https://www.servicenow.com/products/ai-agents.html"),
            "governance": ("AI Control Tower", "https://www.servicenow.com/products/ai-control-tower.html"),
            "data": ("Knowledge Management", "https://www.servicenow.com/products/knowledge-management.html"),
            "coding": ("-", ""),
        },
    },
    {
        "vendor": "Salesforce", "region": "global", "tier": "纳管重点",
        "products": {
            "desktop": ("Agentforce / Slack", "https://www.salesforce.com/agentforce/"),
            "mobile": ("Agentforce", "https://www.salesforce.com/agentforce/"),
            "platform": ("Agentforce Builder", "https://www.salesforce.com/agentforce/"),
            "governance": ("MuleSoft Agent Fabric", "https://www.mulesoft.com/ai/agent-fabric"),
            "data": ("Data 360", "https://www.salesforce.com/data/"),
            "coding": ("Agentforce Vibes", "https://developer.salesforce.com/agentforce"),
        },
    },
    {
        "vendor": "Meta", "region": "global", "tier": "重点",
        "products": {
            "desktop": ("Meta AI", "https://www.meta.ai/"),
            "mobile": ("Meta AI", "https://www.meta.ai/"),
            "platform": ("Llama API", "https://llama.developer.meta.com/"),
            "governance": ("-", ""),
            "data": ("LlamaStack", "https://llama.meta.com/"),
            "coding": ("-", ""),
        },
    },
]
PRODUCT_FOCUS = ("WorkBuddy", "千问办公", "豆包工作", "Kimi Work", "TRAE Work", "阶跃桌面版")
AI_TERMS = (
    "ai", "llm", "agent", "model", "transformer", "diffusion", "rag", "mcp",
    "multimodal", "inference", "robot", "copilot", "gpt", "claude", "gemini",
    "智能体", "模型", "人工智能", "推理", "多模态", "机器人",
)
PRACTICAL_TERMS = (
    "open source", "github", "sdk", "api", "framework", "runtime", "coding",
    "tool", "memory", "workflow", "benchmark", "开源", "框架", "工具", "记忆", "工作流",
)
CRYPTO_TERMS = (
    "bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "token",
    "stablecoin", "defi", "web3", "binance", "upbit", "bithumb",
    "比特币", "以太坊", "加密", "区块链", "代币", "稳定币", "交易所", "币安",
)
GENERIC_TITLES = {
    "结果", "首页", "详情", "新闻", "热点", "热榜", "更多", "点击查看",
    "result", "results", "home", "news", "untitled",
}
EVENT_STOPWORDS = {
    "如何", "评价", "怎么看", "什么", "一个", "这个", "发布", "宣布", "推出",
    "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with",
    "new", "launch", "launches", "released", "release", "announces",
}

REQUIREMENT_TRANSLATIONS = {
    "检修": ["maintenance", "cmms"],
    "工单": ["work-order", "workflow"],
    "审批": ["approval", "workflow"],
    "设备": ["asset", "equipment"],
    "知识库": ["knowledge-base", "rag"],
    "搜索": ["search"],
    "智能体": ["agent", "ai-agent"],
    "数据分析": ["analytics"],
    "低代码": ["low-code"],
}
REQUIREMENT_TERM_LABELS = {
    "work": "业务流程",
    "order": "工单",
    "state": "状态",
    "machine": "状态机",
    "maintenance": "设备维护",
    "cmms": "设备运维系统",
    "work-order": "工单管理",
    "workflow": "流程流转",
    "approval": "审批流程",
    "asset": "设备台账",
    "equipment": "设备管理",
    "knowledge-base": "知识库",
    "rag": "知识检索",
    "analytics": "统计分析",
    "low-code": "低代码配置",
    "agent": "智能体",
    "ai-agent": "智能体",
    "search": "搜索",
}


@dataclass
class TechItem:
    title: str
    url: str
    source: str
    summary: str
    published_at: Optional[str]
    engagement: float
    evidence: str
    score: float = 0
    total_stars: Optional[int] = None


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def parse_date(value) -> Optional[dt.datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            timestamp = value / 1000 if abs(value) > 100_000_000_000 else value
            return dt.datetime.fromtimestamp(timestamp, dt.timezone.utc)
        except (ValueError, OSError):
            return None
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def number(value) -> float:
    try:
        return float(str(value or 0).replace(",", ""))
    except ValueError:
        return 0


def metric_number(value) -> float:
    text = str(value or "0").strip().lower().replace(",", "")
    multipliers = {"w": 10_000, "万": 10_000, "k": 1_000, "m": 1_000_000, "亿": 100_000_000}
    match = re.search(r"(-?\d+(?:\.\d+)?)\s*([kwm万亿])?", text)
    if not match:
        return 0
    return float(match.group(1)) * multipliers.get(match.group(2) or "", 1)


def compact_count(value: float) -> str:
    amount = number(value)
    if amount >= 1_000_000:
        return f"{amount / 1_000_000:.1f}M"
    if amount >= 1_000:
        return f"{amount / 1_000:.1f}k"
    return f"{int(amount):,}"


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


def research_context(config: dict) -> dict:
    configured = config.get("research_topics")
    if not isinstance(configured, list) or not configured:
        if config.get("research_topic") or config.get("research_keywords"):
            configured = [{
                "id": "custom",
                "name": config.get("research_topic") or DEFAULT_RESEARCH_TOPIC,
                "keywords": config.get("research_keywords") or DEFAULT_RESEARCH_KEYWORDS,
            }]
        else:
            configured = DEFAULT_RESEARCH_TOPICS
    topics = []
    used_ids = set()
    for index, raw_topic in enumerate(configured[:10]):
        if not isinstance(raw_topic, dict):
            continue
        name = clean_text(str(raw_topic.get("name") or ""))[:40]
        raw_keywords = raw_topic.get("keywords") or []
        if isinstance(raw_keywords, str):
            raw_keywords = re.split(r"[,，、;\n]+", raw_keywords)
        keywords = []
        for value in raw_keywords:
            keyword = clean_text(str(value))
            if keyword and keyword.lower() not in {item.lower() for item in keywords}:
                keywords.append(keyword)
        if not name or not keywords:
            continue
        topic_id = re.sub(r"[^a-z0-9_-]", "-", str(raw_topic.get("id") or "").lower()).strip("-")
        topic_id = topic_id or f"topic-{index + 1}"
        base_id = topic_id[:36]
        suffix = 2
        while topic_id in used_ids:
            topic_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(topic_id)
        topics.append({"id": topic_id[:40], "name": name, "keywords": keywords[:12]})
    tracking_markers = {
        "personal-assistants": ("workbuddy", "千问办公", "豆包工作", "kimi work", "trae work", "阶跃桌面版"),
        "agent-platforms": ("腾讯 adp", "hiagent", "阿里百炼", "agent builder", "copilot studio"),
        "ai-coding": ("codex", "codebuddy", "claude code", "windsurf"),
        "knowledge-engines": ("腾讯乐享", "企业知识引擎", "agentic rag", "千帆知识库", "cloud search"),
    }
    configured_terms = {
        clean_text(str(value)).lower()
        for topic in topics
        for value in [topic.get("name"), *(topic.get("keywords") or [])]
        if clean_text(str(value or ""))
    }
    for required in REQUIRED_TRACKING_TOPICS:
        markers = tracking_markers[required["id"]]
        if required["id"] in used_ids or any(marker in configured_terms for marker in markers):
            continue
        topics.append({
            "id": required["id"],
            "name": required["name"],
            "keywords": list(required["keywords"]),
        })
        used_ids.add(required["id"])
        configured_terms.update(keyword.lower() for keyword in required["keywords"])
    all_keywords = []
    for keyword_index in range(12):
        for topic in topics:
            if keyword_index >= len(topic["keywords"]):
                continue
            keyword = topic["keywords"][keyword_index]
            if keyword.lower() not in {item.lower() for item in all_keywords}:
                all_keywords.append(keyword)
    if not topics:
        return research_context({"research_topics": DEFAULT_RESEARCH_TOPICS})
    return {
        "topic": "全部主题",
        "topics": topics,
        "keywords": all_keywords[:48],
        "query": " OR ".join(
            f'"{keyword}"' if " " in keyword else keyword
            for keyword in all_keywords[:24]
        ),
    }


def keyword_matches(text: str, keyword: str) -> bool:
    normalized_text = clean_text(text).lower()
    normalized_keyword = clean_text(keyword).lower()
    if not normalized_keyword:
        return False
    if re.search(r"[\u4e00-\u9fff]", normalized_keyword):
        return normalized_keyword in normalized_text
    return bool(re.search(
        rf"(?<![a-z0-9]){re.escape(normalized_keyword)}(?![a-z0-9])",
        normalized_text,
    ))


def matching_topic_ids(text: str, research: dict) -> list[str]:
    return [
        topic["id"]
        for topic in research.get("topics", [])
        if any(keyword_matches(text, keyword) for keyword in topic.get("keywords", []))
    ]


def relative_date(value: str) -> Optional[str]:
    text = clean_text(value).lower()
    match = re.search(r"(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago", text)
    if not match:
        return None
    amount, unit = int(match.group(1)), match.group(2)
    days = {"minute": 1 / 1440, "hour": 1 / 24, "day": 1, "week": 7, "month": 30, "year": 365}
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=amount * days[unit])).isoformat()


class HTTPClient:
    def request(self, url: str, headers: Optional[dict] = None, data: Optional[bytes] = None, timeout: int = 25) -> bytes:
        merged = {
            "User-Agent": "TechnologyExplorationAgent/1.0",
            "Accept": "application/json,text/html,application/atom+xml",
        }
        merged.update(headers or {})
        request = urllib.request.Request(url, headers=merged, data=data, method="POST" if data else "GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            try:
                payload = json.loads(body)
                detail = payload.get("error", payload)
                if isinstance(detail, dict):
                    detail = detail.get("message") or detail.get("detail") or json.dumps(detail, ensure_ascii=False)
            except json.JSONDecodeError:
                detail = clean_text(body)[:240]
            raise RuntimeError(f"HTTP {exc.code}: {detail or exc.reason}") from exc


class AnchorCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_href = ""
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current_href = dict(attrs).get("href", "")
            self.current_text = []

    def handle_data(self, data):
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current_href:
            self.links.append((self.current_href, clean_text(" ".join(self.current_text))))
            self.current_href = ""
            self.current_text = []


class Aggregator:
    def __init__(self, config: dict):
        self.config = config
        self.research = research_context(config)
        self.client = HTTPClient()
        self.errors: list[str] = []

    def item_payload(self, item: TechItem) -> dict:
        payload = asdict(item)
        payload["topic_ids"] = matching_topic_ids(
            f"{item.title} {item.summary}",
            self.research,
        )
        return payload

    def collect(self) -> dict:
        items: list[TechItem] = []
        source_status = []
        sources = [
            ("GitHub Trending", self.github_trending),
            ("Hugging Face", self.hugging_face),
            ("Hacker News", self.hacker_news),
            ("arXiv", self.arxiv),
            ("小红书", lambda: self.public_hot_list("rednote", "小红书")),
            ("抖音", lambda: self.public_hot_list("douyin", "抖音")),
            ("Bilibili", self.bilibili_public),
            ("微博", lambda: self.public_hot_list("weibo", "微博")),
            ("知乎", lambda: self.public_hot_list("zhihu", "知乎")),
            ("AI今日热榜", self.ai_hot_today),
            ("AiNews.com", self.ai_news),
            ("Buzzing 中文国际热点", self.buzzing_news),
            ("NewsNow 多平台", self.newsnow_multi),
            ("方程式新闻 BWEnews", self.bwe_news),
            ("6551 Daily News", self.daily_news_6551),
        ]
        if self.config.get("tikhub_api_token"):
            sources.extend([
                ("YouTube/TikHub", self.tikhub_youtube),
                ("X/TikHub", self.tikhub_x),
            ])
        elif self.config.get("youtube_key"):
            sources.append(("YouTube", self.youtube))
        else:
            sources.append(("YouTube/Public", self.youtube_public_search))
        if not self.config.get("tikhub_api_token") and self.config.get("x_bearer_token"):
            sources.append(("X", self.x_posts))
        elif not self.config.get("tikhub_api_token"):
            sources.append(("X/Public", self.x_public_accounts))
        if self.config.get("media_crawler_path"):
            sources.append(("MediaCrawler", self.media_crawler))
        else:
            source_status.append({"source": "MediaCrawler 深度数据", "status": "missing_config", "detail": "可选增强"})

        for name, collector in sources:
            try:
                collected = collector()
                items.extend(collected)
                source_status.append({"source": name, "status": "ok", "items": len(collected)})
            except Exception as exc:
                detail = clean_text(str(exc))[:300]
                self.errors.append(f"{name}: {detail}")
                source_status.append({"source": name, "status": "error", "detail": detail})

        cleaned_items, quality_stats = self.quality_gate(items)
        news_boards = self.build_news_boards(cleaned_items)
        ranked = self.score_and_clean(cleaned_items)
        selected = self.select_diverse(ranked)
        signals = self.build_signal_clusters(ranked)
        source_top10 = []
        grouped: dict[str, dict] = {}
        for item in ranked:
            key, label = self.source_category(item.source)
            group = grouped.setdefault(key, {"key": key, "label": label, "items": []})
            if len(group["items"]) < 10:
                group["items"].append(self.item_payload(item))
        source_top10.extend(group for group in grouped.values() if group["items"])
        return {
            "generated_at": now_iso(),
            "research_context": self.research,
            "items": [self.item_payload(item) for item in selected],
            "signals": signals,
            "quality_stats": quality_stats,
            "source_top10": source_top10,
            "news_boards": news_boards,
            "content_portals": [
                {"name": "今日热榜", "url": "https://tophub.today", "description": "国内外平台热榜导航"},
                {"name": "Buzzing", "url": "https://buzzing.cc", "description": "国外热点中文导读"},
                {"name": "NewsNow", "url": "https://newsnow.busiyi.world", "description": "开源多平台聚合"},
                {"name": "BWEnews", "url": "https://t.me/s/BWEnews", "description": "加密市场实时快讯"},
                {"name": "6551", "url": "https://github.com/6551Team/daily-news", "description": "加密与 AI 新闻 API"},
            ],
            "source_status": source_status,
            "source_errors": self.errors,
        }

    def github_trending(self) -> list[TechItem]:
        page = self.client.request("https://github.com/trending?since=daily").decode("utf-8", "replace")
        results = []
        for block in re.findall(r'<article[^>]*Box-row[^>]*>(.*?)</article>', page, re.I | re.S):
            heading = re.search(r'<h2[^>]*>(.*?)</h2>', block, re.I | re.S)
            match = re.search(r'href="/([^"?#]+/[^"?#]+)"', heading.group(1), re.I | re.S) if heading else None
            if not match:
                continue
            repo = re.sub(r"\s+", "", match.group(1))
            paragraph = re.search(r"<p[^>]*>(.*?)</p>", block, re.I | re.S)
            summary = clean_text(paragraph.group(1)) if paragraph else ""
            stars_match = re.search(r"([0-9,]+)\s+stars?\s+today", clean_text(block), re.I)
            stars = number(stars_match.group(1) if stars_match else 0)
            total_anchor = re.search(
                rf'href="/{re.escape(repo)}/stargazers"[^>]*>(.*?)</a>', block, re.I | re.S
            )
            total_stars = int(number(clean_text(total_anchor.group(1)))) if total_anchor else 0
            evidence = f"GitHub 日榜，今日新增 {int(stars):,} Stars"
            if total_stars:
                evidence += f"，累计 {compact_count(total_stars)} Stars"
            results.append(TechItem(
                repo, f"https://github.com/{repo}", "GitHub Trending", summary,
                now_iso(), stars, evidence, total_stars=total_stars or None,
            ))
        return results

    def hugging_face(self) -> list[TechItem]:
        rows = json.loads(self.client.request("https://huggingface.co/api/models?sort=trendingScore&limit=30"))
        results = []
        for row in rows:
            model_id = row.get("id") or row.get("modelId")
            if not model_id:
                continue
            likes, downloads = number(row.get("likes")), number(row.get("downloads"))
            trending = number(row.get("trendingScore"))
            pipeline = row.get("pipeline_tag") or "AI model"
            results.append(TechItem(model_id, f"https://huggingface.co/{model_id}", "Hugging Face",
                                    f"{pipeline}；{int(downloads)} downloads，{int(likes)} likes",
                                    row.get("createdAt"), trending + math.log10(downloads + 1) * 10,
                                    f"Hugging Face 趋势分 {int(trending)}，{int(likes)} likes"))
        return results

    def hacker_news(self) -> list[TechItem]:
        results = []
        seen = set()
        for query in self.research["keywords"][:4]:
            params = urllib.parse.urlencode({"query": query, "tags": "story", "hitsPerPage": 30})
            payload = json.loads(self.client.request(f"https://hn.algolia.com/api/v1/search_by_date?{params}"))
            for row in payload.get("hits", []):
                title = row.get("title") or ""
                object_id = row.get("objectID") or ""
                if not title or object_id in seen:
                    continue
                seen.add(object_id)
                points, comments = number(row.get("points")), number(row.get("num_comments"))
                url = row.get("url") or f"https://news.ycombinator.com/item?id={object_id}"
                results.append(TechItem(title, url, "Hacker News", "技术社区讨论", row.get("created_at"),
                                        points + comments * 1.5, f"HN {int(points)} points / {int(comments)} comments"))
        return results

    def arxiv(self) -> list[TechItem]:
        topic_query = " OR ".join(
            f'all:"{keyword}"' for keyword in self.research["keywords"][:6]
        )
        params = urllib.parse.urlencode({
            "search_query": topic_query,
            "start": 0,
            "max_results": 30,
            "sortBy": "submittedDate", "sortOrder": "descending",
        })
        root = ET.fromstring(self.client.request(f"https://export.arxiv.org/api/query?{params}", timeout=35))
        ns = {"a": "http://www.w3.org/2005/Atom"}
        results = []
        for entry in root.findall("a:entry", ns):
            title = clean_text(entry.findtext("a:title", "", ns))
            summary = clean_text(entry.findtext("a:summary", "", ns))
            link_node = next((n for n in entry.findall("a:link", ns) if n.attrib.get("rel") == "alternate"), None)
            link = link_node.attrib.get("href", "") if link_node is not None else ""
            published = entry.findtext("a:published", None, ns)
            results.append(TechItem(
                title, link, "arXiv", summary, published, 0,
                f"近期论文 · 主题：{self.research['topic']}",
            ))
        return results

    def public_hot_list(self, platform: str, label: str) -> list[TechItem]:
        errors = []
        payload = None
        for base_url in ("https://60s.viki.moe/v2", "https://60s-api-cf.114128.xyz/v2"):
            try:
                candidate = json.loads(self.client.request(f"{base_url}/{platform}", timeout=20))
                if candidate.get("code") == 200 and isinstance(candidate.get("data"), list):
                    payload = candidate
                    break
                errors.append(str(candidate.get("message") or "返回数据为空"))
            except Exception as exc:
                errors.append(str(exc))
        if payload is None:
            raise RuntimeError("；".join(errors) or "公共热榜不可用")

        results = []
        for index, row in enumerate(payload["data"][:50], 1):
            if not isinstance(row, dict):
                continue
            title = clean_text(str(row.get("title") or row.get("name") or row.get("keyword") or ""))
            if not title:
                continue
            url = str(row.get("link") or row.get("url") or "")
            summary = clean_text(str(row.get("detail") or row.get("desc") or row.get("summary") or ""))[:600]
            heat_raw = row.get("hot_value", row.get("score", row.get("hot", 0)))
            engagement = metric_number(heat_raw) or max(1, 51 - index) * 100
            published = (
                parse_date(row.get("event_time_at"))
                or parse_date(row.get("created_at"))
                or parse_date(row.get("active_time"))
            )
            heat_text = str(
                row.get("hot_value_desc") or row.get("score") or row.get("hot_value") or f"榜单第 {index} 名"
            )
            results.append(TechItem(
                title, url, label, summary, published.isoformat() if published else now_iso(),
                engagement, f"{label}实时热榜 · 第 {index} 名 · 热度 {heat_text}",
            ))
        return results

    def bilibili_public(self) -> list[TechItem]:
        try:
            return self.public_hot_list("bili", "Bilibili")
        except Exception:
            payload = json.loads(self.client.request(
                "https://api.bilibili.com/x/web-interface/popular?pn=1&ps=30", timeout=20
            ))
            if payload.get("code") != 0:
                raise RuntimeError(payload.get("message") or "Bilibili 公共接口失败")
            results = []
            for index, row in enumerate(payload.get("data", {}).get("list", []), 1):
                title = clean_text(str(row.get("title") or ""))
                bvid = str(row.get("bvid") or "")
                stats = row.get("stat") or {}
                views = metric_number(stats.get("view"))
                likes = metric_number(stats.get("like"))
                comments = metric_number(stats.get("reply"))
                engagement = views * 0.02 + likes * 2 + comments * 3
                results.append(TechItem(
                    title,
                    f"https://www.bilibili.com/video/{bvid}" if bvid else "",
                    "Bilibili",
                    clean_text(str(row.get("desc") or ""))[:600],
                    parse_date(row.get("pubdate")).isoformat() if parse_date(row.get("pubdate")) else now_iso(),
                    engagement,
                    f"Bilibili 综合热门第 {index} 名 · {compact_count(views)} 播放 · "
                    f"{compact_count(likes)} 赞 · {compact_count(comments)} 评论",
                ))
            return results

    def ai_hot_today(self) -> list[TechItem]:
        page = self.client.request("https://aihot.today/", timeout=35).decode("utf-8", "replace")
        source_names = {
            "6": "TechCrunch", "17": "36Kr", "19": "量子位", "20": "极客公园",
            "10": "Product Hunt", "14": "CNBC", "15": "ArsTechnica", "2": "DeepLearning.AI",
            "12": "TechInAsia", "201": "OpenAI", "4": "Azure AI", "5": "Google Research",
            "3": "Anthropic", "1": "MIT News", "16": "A16Z", "13": "WSJ",
        }
        pattern = re.compile(
            r'\\"id\\":\\"(?P<id>.*?)\\",\\"title\\":\\"(?P<title>.*?)\\",'
            r'\\"des\\":\\"(?P<des>.*?)\\",\\"link\\":\\"(?P<link>.*?)\\",'
            r'\\"type\\":-?\d+,\\"source\\":(?P<source>\d+),'
            r'\\"publish_time\\":\\"(?P<published>.*?)\\",\\"like_num\\":(?P<likes>-?\d+),'
            r'\\"title_trans\\":(?:\\"(?P<title_trans>.*?)\\"|null),'
            r'\\"des_trans\\":(?:\\"(?P<des_trans>.*?)\\"|null)'
        )
        source_positions = {}
        results = []
        for match in pattern.finditer(page):
            source_id = match.group("source")
            source_name = source_names.get(source_id)
            if not source_name:
                continue
            source_positions[source_id] = source_positions.get(source_id, 0) + 1
            if source_positions[source_id] > 12:
                continue

            def decode(value):
                return (value or "").replace(r'\"', '"').replace(r"\n", " ").replace(r"\\", "\\")

            title = decode(match.group("title_trans") or match.group("title"))
            summary = decode(match.group("des_trans") or match.group("des"))
            url = decode(match.group("link"))
            position = source_positions[source_id]
            engagement = max(1, 26 - position) * 3 + max(0, number(match.group("likes")))
            results.append(TechItem(
                title, url, f"AI今日热榜/{source_name}", summary,
                match.group("published"), engagement,
                f"AI今日热榜 · {source_name} 第 {position} 条",
            ))
        if not results:
            raise ValueError("页面数据结构未识别")
        return results

    def ai_news(self) -> list[TechItem]:
        try:
            page = self.client.request("https://www.ainews.com/", timeout=25).decode("utf-8", "replace")
            if "Just a moment" in page or "challenge-platform" in page:
                raise ValueError("Cloudflare challenge")
            parser = AnchorCollector()
            parser.feed(page)
            results, seen = [], set()
            for href, title in parser.links:
                if not href.startswith("/p/") or len(title) < 24 or href in seen:
                    continue
                seen.add(href)
                results.append(TechItem(title, f"https://www.ainews.com{href}", "AiNews.com",
                                        "AiNews.com 最新行业分析", now_iso(), 18,
                                        "AiNews.com 最新文章"))
                if len(results) >= 12:
                    break
            if results:
                return results
        except Exception:
            pass

        query = urllib.parse.quote(
            f"site:ainews.com ({self.research['query']})"
        )
        feed = self.client.request(
            f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en", timeout=25
        )
        root = ET.fromstring(feed)
        results = []
        for entry in root.findall("./channel/item")[:12]:
            title = clean_text(entry.findtext("title", "")).removesuffix(" - AiNews.com")
            link = entry.findtext("link", "")
            published = entry.findtext("pubDate", "")
            parsed = email.utils.parsedate_to_datetime(published) if published else None
            results.append(TechItem(title, link, "AiNews.com", "AiNews.com 行业分析",
                                    parsed.isoformat() if parsed else None, 12, "AiNews.com · Google News 索引"))
        return results

    def buzzing_news(self) -> list[TechItem]:
        feeds = (
            ("https://www.buzzing.cc/", "Buzzing/Hacker News"),
            ("https://news.buzzing.cc/", "Buzzing/国际新闻"),
            ("https://reddit.buzzing.cc/", "Buzzing/Reddit"),
            ("https://ph.buzzing.cc/", "Buzzing/Product Hunt"),
            ("https://economistnew.buzzing.cc/", "Buzzing/经济学人"),
        )
        results, errors = [], []
        for feed_url, source in feeds:
            try:
                page = self.client.request(
                    feed_url, headers={"Accept-Language": "zh-CN,zh;q=0.9"}, timeout=25
                ).decode("utf-8", "replace")
                blocks = re.findall(
                    r'<article[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)</article>',
                    page, re.I | re.S,
                )
                if not blocks:
                    blocks = re.findall(
                        r'<div class="article[^"]*h-entry[^"]*">(.*?)</div>\s*</div>',
                        page, re.I | re.S,
                    )
                for block in blocks[:20]:
                    title_match = re.search(
                        r'<a[^>]*class="[^"]*entry-title[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                        block, re.I | re.S,
                    )
                    if not title_match:
                        title_match = re.search(
                            r'<a[^>]*href="([^"]+)"[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)</a>',
                            block, re.I | re.S,
                        )
                    if not title_match:
                        continue
                    url = html.unescape(title_match.group(1))
                    title = re.sub(r"^\d+\.\s*", "", clean_text(title_match.group(2)))
                    time_match = re.search(r'<time[^>]*datetime="([^"]+)"', block, re.I)
                    points_match = re.search(
                        r"([\d,.]+[KkMm]?)\s+(?:HN\s+Points|PH\s+Upvotes|Reddit\s+Upvotes)",
                        clean_text(block), re.I,
                    )
                    points = metric_number(points_match.group(1) if points_match else 0)
                    results.append(TechItem(
                        title, url, source, clean_text(block)[:500],
                        time_match.group(1) if time_match else now_iso(),
                        points or max(1, 21 - len(results)),
                        f"{source.replace('Buzzing/', '')} 中文导读"
                        f"{f' · {int(points)} 热度' if points else ''}",
                    ))
            except Exception as exc:
                errors.append(f"{source}: {exc}")
        if not results:
            raise RuntimeError("；".join(errors) or "Buzzing 暂无内容")
        return results

    def newsnow_multi(self) -> list[TechItem]:
        feeds = (
            ("zhihu", "NewsNow/知乎"),
            ("weibo", "NewsNow/微博"),
            ("bilibili-hot-search", "NewsNow/Bilibili"),
            ("hupu", "NewsNow/虎扑"),
            ("v2ex-share", "NewsNow/V2EX"),
            ("producthunt", "NewsNow/Product Hunt"),
        )
        results, errors = [], []
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 Chrome/140 Safari/537.36"
            ),
            "Accept": "application/json",
        }
        for source_id, source in feeds:
            try:
                query = urllib.parse.urlencode({"id": source_id})
                payload = json.loads(self.client.request(
                    f"https://newsnow.busiyi.world/api/s?{query}", headers=headers, timeout=25
                ))
                rows = payload.get("items") or []
                for index, row in enumerate(rows[:20], 1):
                    title = clean_text(str(row.get("title") or ""))
                    if not title:
                        continue
                    extra = row.get("extra") if isinstance(row.get("extra"), dict) else {}
                    heat = metric_number(
                        extra.get("info") or extra.get("hover") or row.get("hot") or row.get("score")
                    )
                    results.append(TechItem(
                        title, str(row.get("url") or ""), source,
                        clean_text(str(row.get("description") or extra.get("hover") or ""))[:500],
                        parse_date(row.get("pubDate") or row.get("timestamp")).isoformat()
                        if parse_date(row.get("pubDate") or row.get("timestamp")) else now_iso(),
                        heat or max(1, 31 - index) * 20,
                        f"NewsNow · {source.split('/', 1)[1]}第 {index} 名",
                    ))
            except Exception as exc:
                errors.append(f"{source_id}: {exc}")
        if not results:
            raise RuntimeError("；".join(errors) or "NewsNow 暂无内容")
        return results

    def bwe_news(self) -> list[TechItem]:
        page = self.client.request(
            "https://t.me/s/BWEnews",
            headers={"User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/140 Safari/537.36"},
            timeout=25,
        ).decode("utf-8", "replace")
        results = []
        blocks = re.findall(
            r'<div class="tgme_widget_message[^>]*data-post="([^"]+)"[^>]*>(.*?)'
            r'(?=<div class="tgme_widget_message_wrap|</body>)',
            page, re.I | re.S,
        )
        for post_id, block in blocks[-30:]:
            text_match = re.search(
                r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
                block, re.I | re.S,
            )
            if not text_match:
                continue
            content = clean_text(text_match.group(1))
            lines = [clean_text(part) for part in re.split(r"<br\s*/?>", text_match.group(1), flags=re.I)]
            chinese = next((line for line in lines if re.search(r"[\u4e00-\u9fff]", line)), "")
            title = (chinese or content)[:180]
            time_match = re.search(r'<time[^>]*datetime="([^"]+)"', block, re.I)
            views_match = re.search(r'tgme_widget_message_views">([^<]+)', block, re.I)
            views = metric_number(views_match.group(1) if views_match else 0)
            results.append(TechItem(
                title, f"https://t.me/{post_id}", "BWEnews", content[:700],
                time_match.group(1) if time_match else now_iso(), views,
                f"方程式新闻 · {compact_count(views)} 浏览",
            ))
        if not results:
            raise ValueError("BWEnews 公开频道结构未识别")
        return results

    def daily_news_6551(self) -> list[TechItem]:
        results, errors = [], []
        for category, label in (("web3", "6551/加密"), ("ai", "6551/AI"), ("macro", "6551/宏观")):
            try:
                query = urllib.parse.urlencode({"category": category})
                payload = json.loads(self.client.request(
                    f"https://ai.6551.io/open/free_hot?{query}", timeout=30
                ))
                if not payload.get("success"):
                    raise RuntimeError(payload.get("message") or "接口暂不可用")
                rows = (payload.get("news") or {}).get("items") or []
                for row in rows[:25]:
                    title = clean_text(str(row.get("title") or ""))
                    if not title:
                        continue
                    summary = clean_text(str(row.get("summary_zh") or row.get("summary_en") or ""))
                    score = number(row.get("score"))
                    grade = clean_text(str(row.get("grade") or ""))
                    results.append(TechItem(
                        title[:200], str(row.get("link") or ""), label, summary[:700],
                        row.get("published_at") or row.get("created_at") or now_iso(),
                        score * 100, f"6551 Daily News · {grade or '热点'} · {int(score)} 分",
                    ))
            except Exception as exc:
                errors.append(f"{category}: {exc}")
        if not results:
            raise RuntimeError("；".join(errors) or "6551 Daily News 暂无内容")
        return results

    def tikhub_request(self, path: str, params: Optional[dict] = None) -> dict:
        base_url = str(self.config.get("tikhub_base_url") or "https://api.tikhub.dev").rstrip("/")
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        headers = {"Authorization": f"Bearer {self.config['tikhub_api_token']}"}
        payload = json.loads(self.client.request(f"{base_url}{path}{query}", headers=headers, timeout=60))
        if payload.get("code") not in (None, 0, 200):
            raise RuntimeError(payload.get("message") or f"TikHub 业务错误 {payload.get('code')}")
        return payload

    @staticmethod
    def nested_dicts(value):
        if isinstance(value, dict):
            yield value
            for child in value.values():
                yield from Aggregator.nested_dicts(child)
        elif isinstance(value, list):
            for child in value:
                yield from Aggregator.nested_dicts(child)

    @staticmethod
    def text_value(value) -> str:
        if isinstance(value, str):
            return clean_text(value)
        if isinstance(value, dict):
            if isinstance(value.get("simpleText"), str):
                return clean_text(value["simpleText"])
            runs = value.get("runs")
            if isinstance(runs, list):
                return clean_text("".join(str(run.get("text") or "") for run in runs if isinstance(run, dict)))
        return ""

    def tikhub_youtube(self) -> list[TechItem]:
        payload = self.tikhub_request(
            "/api/v1/youtube/web/search_video",
            {
                "search_query": " ".join(self.research["keywords"][:6]),
                "language_code": "en",
                "country_code": "us",
            },
        )
        results, seen = [], set()
        for row in self.nested_dicts(payload.get("data", payload)):
            video_id = str(row.get("videoId") or row.get("video_id") or "")
            title = self.text_value(row.get("title"))
            if not video_id or not title or video_id in seen:
                continue
            seen.add(video_id)
            views = metric_number(
                row.get("viewCount") or row.get("view_count") or row.get("shortViewCountText")
            )
            likes = metric_number(row.get("likeCount") or row.get("like_count"))
            published_text = self.text_value(row.get("publishedTimeText")) or str(row.get("publish_date") or "")
            results.append(TechItem(
                title, f"https://www.youtube.com/watch?v={video_id}", "YouTube",
                self.text_value(row.get("descriptionSnippet")) or self.text_value(row.get("description")),
                parse_date(row.get("published_at")).isoformat() if parse_date(row.get("published_at")) else now_iso(),
                views * 0.02 + likes * 2,
                f"YouTube/TikHub 主题检索 · {compact_count(views)} 次观看 · "
                f"{compact_count(likes)} 赞{f' · {published_text}' if published_text else ''}",
            ))
            if len(results) >= 30:
                break
        if not results:
            raise ValueError("TikHub YouTube 返回结构未识别")
        return results

    def tikhub_x(self) -> list[TechItem]:
        payload = self.tikhub_request(
            "/api/v1/twitter/web/fetch_search_timeline",
            {"keyword": self.research["query"], "search_type": "Latest"},
        )
        results, seen = [], set()
        for row in self.nested_dicts(payload.get("data", payload)):
            legacy = row.get("legacy") if isinstance(row.get("legacy"), dict) else row
            text = clean_text(str(legacy.get("full_text") or legacy.get("text") or ""))
            post_id = str(row.get("rest_id") or legacy.get("id_str") or row.get("tweet_id") or "")
            if not text or not post_id or post_id in seen:
                continue
            seen.add(post_id)
            likes = metric_number(legacy.get("favorite_count") or legacy.get("like_count"))
            reposts = metric_number(legacy.get("retweet_count"))
            replies = metric_number(legacy.get("reply_count"))
            quotes = metric_number(legacy.get("quote_count"))
            results.append(TechItem(
                text[:160], f"https://x.com/i/web/status/{post_id}", "X", text,
                legacy.get("created_at"), likes + reposts * 2 + replies + quotes * 1.5,
                f"X/TikHub · {compact_count(likes)} 赞 · {compact_count(reposts)} 转发 · "
                f"{compact_count(replies)} 回复 · {compact_count(quotes)} 引用",
            ))
            if len(results) >= 50:
                break
        if not results:
            raise ValueError("TikHub X 返回结构未识别")
        return results

    def youtube_public_search(self) -> list[TechItem]:
        query = urllib.parse.urlencode({
            "search_query": " ".join(self.research["keywords"][:6]),
            "sp": "EgIIAg==",
        })
        page = self.client.request(
            f"https://www.youtube.com/results?{query}",
            headers={"Accept-Language": "en-US,en;q=0.9"},
            timeout=35,
        ).decode("utf-8", "replace")
        match = re.search(r"(?:var\s+ytInitialData\s*=\s*|ytInitialData\s*=\s*)(\{.*?\});</script>", page, re.S)
        if not match:
            raise ValueError("YouTube 搜索页结构未识别")
        payload = json.loads(match.group(1))
        results, seen = [], set()
        for row in self.nested_dicts(payload):
            renderer = row.get("videoRenderer")
            if not isinstance(renderer, dict):
                continue
            video_id = str(renderer.get("videoId") or "")
            title = self.text_value(renderer.get("title"))
            if not video_id or not title or video_id in seen:
                continue
            seen.add(video_id)
            views_text = self.text_value(renderer.get("viewCountText"))
            views = metric_number(views_text)
            published_text = self.text_value(renderer.get("publishedTimeText"))
            channel = self.text_value(renderer.get("ownerText"))
            description = self.text_value(renderer.get("detailedMetadataSnippets"))
            results.append(TechItem(
                title,
                f"https://www.youtube.com/watch?v={video_id}",
                "YouTube",
                f"{channel}：{description}" if channel else description,
                relative_date(published_text) or now_iso(),
                views * 0.02,
                f"YouTube 公开搜索 · {views_text or '观看量未提供'}"
                f"{f' · {published_text}' if published_text else ''}",
            ))
            if len(results) >= 30:
                break
        if not results:
            raise ValueError("YouTube 公开搜索没有返回视频")
        return results

    def x_public_accounts(self) -> list[TechItem]:
        accounts = (
            "OpenAI", "AnthropicAI", "GoogleDeepMind", "huggingface",
            "AIatMeta", "MistralAI", "NVIDIAAI",
        )
        results, seen, failures = [], set(), []
        successful_accounts = 0
        for account in accounts:
            try:
                completed = subprocess.run([
                    "/usr/bin/curl", "-L", "--fail", "--silent", "--show-error",
                    "--max-time", "20",
                    "-A", (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 Chrome/140 Safari/537.36"
                    ),
                    f"https://syndication.twitter.com/srv/timeline-profile/screen-name/{account}?dnt=true",
                ], capture_output=True, check=True)
                if len(completed.stdout) > 5_000_000:
                    raise ValueError("时间线响应过大")
                page = completed.stdout.decode("utf-8", "replace")
                match = re.search(
                    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                    page, re.S,
                )
                if not match:
                    raise ValueError("时间线结构未识别")
                payload = json.loads(match.group(1))
                entries = (
                    payload.get("props", {}).get("pageProps", {})
                    .get("timeline", {}).get("entries", [])
                )
                for entry in entries:
                    tweet = entry.get("content", {}).get("tweet", {})
                    post_id = str(tweet.get("id_str") or "")
                    text = clean_text(str(tweet.get("full_text") or tweet.get("text") or ""))
                    if not post_id or not text or post_id in seen:
                        continue
                    seen.add(post_id)
                    likes = number(tweet.get("favorite_count"))
                    reposts = number(tweet.get("retweet_count"))
                    replies = number(tweet.get("reply_count"))
                    quotes = number(tweet.get("quote_count"))
                    results.append(TechItem(
                        text[:160], f"https://x.com/{account}/status/{post_id}", "X",
                        f"@{account}：{text}", tweet.get("created_at"),
                        likes + reposts * 2 + replies + quotes * 1.5,
                        f"X 官方嵌入时间线 · @{account} · {compact_count(likes)} 赞 · "
                        f"{compact_count(reposts)} 转发 · {compact_count(replies)} 回复 · "
                        f"{compact_count(quotes)} 引用",
                    ))
                successful_accounts += 1
                if successful_accounts >= 2:
                    break
            except Exception as exc:
                failures.append(f"{account}: {exc}")
        if not results:
            query = urllib.parse.quote(
                f"site:x.com/ ({self.research['query']}) when:3d"
            )
            feed = self.client.request(
                f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en",
                timeout=25,
            )
            root = ET.fromstring(feed)
            for index, entry in enumerate(root.findall("./channel/item")[:40], 1):
                title = clean_text(entry.findtext("title", "")).removesuffix(" - x.com")
                if not title:
                    continue
                published = entry.findtext("pubDate", "")
                parsed = email.utils.parsedate_to_datetime(published) if published else None
                results.append(TechItem(
                    title[:160], entry.findtext("link", ""), "X", title,
                    parsed.isoformat() if parsed else now_iso(),
                    max(1, 41 - index) * 5,
                    f"X 近三日公开内容 · Google News 索引第 {index} 条 · 互动指标未提供",
                ))
        if not results:
            raise ValueError("X 公开来源均不可用：" + "；".join(failures))
        return results

    def youtube(self) -> list[TechItem]:
        after = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=3)).isoformat().replace("+00:00", "Z")
        params = urllib.parse.urlencode({
            "part": "snippet", "type": "video", "order": "date", "maxResults": 25,
            "publishedAfter": after,
            "q": " ".join(self.research["keywords"][:6]),
            "key": self.config["youtube_key"],
        })
        payload = json.loads(self.client.request(f"https://www.googleapis.com/youtube/v3/search?{params}"))
        search_rows = {
            row.get("id", {}).get("videoId"): row.get("snippet", {})
            for row in payload.get("items", [])
            if row.get("id", {}).get("videoId")
        }
        if not search_rows:
            return []
        detail_params = urllib.parse.urlencode({
            "part": "snippet,statistics",
            "id": ",".join(search_rows),
            "key": self.config["youtube_key"],
        })
        details = json.loads(self.client.request(f"https://www.googleapis.com/youtube/v3/videos?{detail_params}"))
        results = []
        for row in details.get("items", []):
            video_id = row.get("id")
            snippet = row.get("snippet", search_rows.get(video_id, {}))
            statistics = row.get("statistics", {})
            views = number(statistics.get("viewCount"))
            likes = number(statistics.get("likeCount"))
            comments = number(statistics.get("commentCount"))
            engagement = views * 0.02 + likes * 2 + comments * 3
            evidence = (
                f"YouTube 近 72 小时 · {compact_count(views)} 次观看 · "
                f"{compact_count(likes)} 赞 · {compact_count(comments)} 评论"
            )
            channel = clean_text(snippet.get("channelTitle", ""))
            summary = html.unescape(snippet.get("description", ""))
            if channel:
                summary = f"{channel}：{summary}"
            results.append(TechItem(
                html.unescape(snippet.get("title", "")),
                f"https://www.youtube.com/watch?v={video_id}", "YouTube",
                summary, snippet.get("publishedAt"), engagement, evidence,
            ))
        return results

    def x_posts(self) -> list[TechItem]:
        start_time = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=3)).isoformat().replace("+00:00", "Z")
        params = urllib.parse.urlencode({
            "query": f"({self.research['query']}) lang:en -is:retweet has:links",
            "max_results": 100, "start_time": start_time,
            "tweet.fields": "created_at,public_metrics,author_id",
        })
        headers = {"Authorization": f"Bearer {self.config['x_bearer_token']}"}
        payload = json.loads(self.client.request(f"https://api.x.com/2/tweets/search/recent?{params}", headers=headers))
        results = []
        for row in payload.get("data", []):
            text = row.get("text", "")
            metrics = row.get("public_metrics", {})
            likes = number(metrics.get("like_count"))
            reposts = number(metrics.get("retweet_count"))
            replies = number(metrics.get("reply_count"))
            quotes = number(metrics.get("quote_count"))
            engagement = likes + reposts * 2 + replies + quotes * 1.5
            evidence = (
                f"X 近 72 小时 · {compact_count(likes)} 赞 · {compact_count(reposts)} 转发 · "
                f"{compact_count(replies)} 回复 · {compact_count(quotes)} 引用"
            )
            results.append(TechItem(text[:120], f"https://x.com/i/web/status/{row.get('id', '')}", "X", text,
                                    row.get("created_at"), engagement, evidence))
        return results

    def media_crawler(self) -> list[TechItem]:
        root = Path(os.path.expanduser(self.config["media_crawler_path"]))
        if not root.exists():
            raise FileNotFoundError("找不到导出目录")
        results = []
        cutoff = dt.datetime.now().timestamp() - 7 * 86400
        paths = list(root.rglob("*.json")) + list(root.rglob("*.jsonl"))
        for path in paths:
            if path.stat().st_mtime < cutoff:
                continue
            if "comment" in path.stem.lower() or "评论" in path.stem:
                continue
            try:
                text = path.read_text(encoding="utf-8")
                if path.suffix.lower() == ".jsonl":
                    rows = [json.loads(line) for line in text.splitlines() if line.strip()]
                else:
                    payload = json.loads(text)
                    rows = payload if isinstance(payload, list) else [payload] if isinstance(payload, dict) else []
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                title = next((str(row[k]) for k in ("title", "content", "desc", "description", "note_content", "text") if row.get(k)), "")
                if not title:
                    continue
                url = next((str(row[k]) for k in ("url", "note_url", "video_url", "detail_url", "content_url") if row.get(k)), "")
                platform = row.get("platform") or row.get("source") or "国内平台"
                engagement = sum(number(row.get(k)) for k in (
                    "liked_count", "like_count", "digg_count", "collect_count",
                    "comment_count", "share_count", "repost_count",
                ))
                published = next((
                    parse_date(row.get(key))
                    for key in ("publish_time", "published_at", "create_time", "time")
                    if parse_date(row.get(key))
                ), None)
                results.append(TechItem(title[:160], url, f"MediaCrawler/{platform}", title[:360],
                                        (published or dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc)).isoformat(),
                                        engagement, f"MediaCrawler 聚合，互动量约 {int(engagement)}"))
                if len(results) >= 100:
                    return results
        return results

    @staticmethod
    def source_category(source: str) -> tuple[str, str]:
        direct = {
            "GitHub Trending": ("github", "GitHub"),
            "YouTube": ("youtube", "YouTube"),
            "X": ("x", "X"),
            "小红书": ("xiaohongshu", "小红书"),
            "抖音": ("douyin", "抖音"),
            "Bilibili": ("bilibili", "Bilibili"),
            "微博": ("weibo", "微博"),
            "知乎": ("zhihu", "知乎"),
            "Hugging Face": ("hugging-face", "Hugging Face"),
            "Hacker News": ("hacker-news", "Hacker News"),
            "arXiv": ("arxiv", "arXiv"),
            "AiNews.com": ("ai-news", "AiNews"),
            "BWEnews": ("bwenews", "BWEnews"),
        }
        if source in direct:
            return direct[source]
        if source.startswith("AI今日热榜"):
            return "ai-hot-today", "AI今日热榜"
        if source.startswith("Buzzing/"):
            label = source.split("/", 1)[1]
            key = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
            return f"buzzing-{key or urllib.parse.quote(label)}", label
        if source.startswith("NewsNow/"):
            label = source.split("/", 1)[1]
            aliases = {"Bilibili": "Bilibili", "Product Hunt": "Product Hunt"}
            display = aliases.get(label, label)
            key = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
            return f"newsnow-{key or urllib.parse.quote(label)}", display
        if source.startswith("6551/"):
            label = source.split("/", 1)[1]
            return f"daily-6551-{urllib.parse.quote(label)}", f"6551 {label}"
        if source.startswith("MediaCrawler/"):
            platform = source.split("/", 1)[1].strip()
            normalized = platform.lower().replace("_", "").replace("-", "")
            aliases = [
                (("xiaohongshu", "xhs", "小红书"), "xiaohongshu", "小红书"),
                (("douyin", "dy", "抖音"), "douyin", "抖音"),
                (("bilibili", "bili", "b站"), "bilibili", "Bilibili"),
                (("weibo", "wb", "微博"), "weibo", "微博"),
                (("tieba", "贴吧"), "tieba", "百度贴吧"),
                (("zhihu", "知乎"), "zhihu", "知乎"),
                (("kuaishou", "ks", "快手"), "kuaishou", "快手"),
            ]
            for names, key, label in aliases:
                if any(name in normalized for name in names):
                    return key, label
            safe_key = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-") or "media-crawler"
            return safe_key, platform or "MediaCrawler"
        safe_key = re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-") or "other"
        return safe_key, source or "其他"

    @staticmethod
    def board_category(source: str, label: str) -> str:
        text = f"{source} {label}".lower()
        if any(term in text for term in ("bwenews", "6551/加密", "crypto", "web3")):
            return "crypto"
        if any(term in text for term in ("6551/宏观", "economist", "财经", "finance", "macro")):
            return "finance"
        if source.startswith("Buzzing/"):
            return "world"
        if any(term in text for term in (
            "github", "hacker", "product hunt", "v2ex", "hugging", "arxiv",
            "ai今日", "6551/ai", "ainews",
        )):
            return "tech"
        if any(term in text for term in (
            "知乎", "微博", "抖音", "bilibili", "虎扑", "小红书", "国内",
        )):
            return "china"
        return "all"

    @staticmethod
    def event_tokens(title: str) -> set[str]:
        normalized = clean_text(title).lower()
        words = {
            word for word in re.findall(r"[a-z][a-z0-9.+-]{2,}", normalized)
            if word not in EVENT_STOPWORDS
        }
        chinese = "".join(re.findall(r"[\u4e00-\u9fff]", normalized))
        words.update(
            chinese[index:index + 2]
            for index in range(max(0, len(chinese) - 1))
            if chinese[index:index + 2] not in EVENT_STOPWORDS
        )
        return words

    @staticmethod
    def token_similarity(left: set[str], right: set[str]) -> float:
        if not left or not right:
            return 0
        return len(left & right) / max(1, min(len(left), len(right)))

    @staticmethod
    def event_entities(title: str) -> set[str]:
        normalized = clean_text(title).lower()
        patterns = (
            r"deepseek(?:[-\s]?[a-z0-9.]+){0,2}",
            r"glm[-\s]?\d+(?:\.\d+)?",
            r"qwen(?:[-\s]?\d+(?:\.\d+)?[a-z]*)?",
            r"gpt[-\s]?\d+(?:\.\d+)?[a-z]*",
            r"claude(?:\s+(?:opus|sonnet|haiku))?(?:\s+\d+(?:\.\d+)?)?",
            r"gemini(?:\s+\d+(?:\.\d+)?)?",
            r"llama(?:\s+\d+(?:\.\d+)?)?",
            r"minimax(?:[-\s]?[a-z0-9.]+)?",
        )
        entities = set()
        for pattern in patterns:
            entities.update(
                re.sub(r"\s+", "", match)
                for match in re.findall(pattern, normalized)
                if len(match) >= 3
            )
        return entities

    def quality_gate(self, items: list[TechItem]) -> tuple[list[TechItem], dict]:
        accepted: dict[str, TechItem] = {}
        rejected = Counter()
        for item in items:
            original_title = clean_text(item.title)
            title = clean_text(re.sub(r"https?://\S+", "", original_title)).strip(" -:|")
            summary = clean_text(re.sub(r"https?://\S+", "", item.summary or ""))
            normalized = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", title.lower())
            if title.lower() in GENERIC_TITLES or len(normalized) < 4:
                rejected["meaningless_title"] += 1
                continue
            if len(title) > 140:
                title = title[:137].rstrip() + "..."
                rejected["trimmed_title"] += 1
            source_text = item.source.lower()
            content_text = f"{title} {summary}".lower()
            if source_text == "6551/ai" and not any(term in content_text for term in AI_TERMS):
                rejected["wrong_category"] += 1
                continue
            if source_text == "6551/加密" and not any(term in content_text for term in CRYPTO_TERMS):
                rejected["wrong_category"] += 1
                continue
            item.title = title
            item.summary = summary[:500]
            key = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", title.lower())
            current = accepted.get(key)
            if current is None or item.engagement > current.engagement:
                if current is not None:
                    rejected["exact_duplicate"] += 1
                accepted[key] = item
            else:
                rejected["exact_duplicate"] += 1

        cleaned = list(accepted.values())
        complete = sum(bool(item.summary and len(item.summary) >= 10) for item in cleaned)
        return cleaned, {
            "raw": len(items),
            "accepted": len(cleaned),
            "rejected": len(items) - len(cleaned),
            "summary_complete": complete,
            "summary_rate": round(complete / max(1, len(cleaned)) * 100, 1),
            "reasons": dict(rejected),
        }

    @staticmethod
    def source_percentiles(items: list[TechItem]) -> dict[int, float]:
        groups: dict[str, list[TechItem]] = {}
        for item in items:
            groups.setdefault(item.source.split("/")[0], []).append(item)
        percentiles: dict[int, float] = {}
        for group in groups.values():
            ordered = sorted(group, key=lambda item: item.engagement)
            denominator = max(1, len(ordered) - 1)
            for index, item in enumerate(ordered):
                percentiles[id(item)] = index / denominator
        return percentiles

    def build_signal_clusters(self, ranked: list[TechItem]) -> list[dict]:
        clusters: list[dict] = []
        for item in ranked[:80]:
            if item.title.endswith("..."):
                continue
            tokens = self.event_tokens(item.title)
            entities = self.event_entities(item.title)
            match = next(
                (
                    cluster for cluster in clusters
                    if (
                        entities & cluster["_entities"]
                        or self.token_similarity(tokens, cluster["_tokens"]) >= 0.52
                    )
                ),
                None,
            )
            if match is None:
                clusters.append({"_tokens": tokens, "_entities": entities, "items": [item]})
            else:
                match["items"].append(item)
                match["_tokens"].update(tokens)
                match["_entities"].update(entities)

        signals = []
        for cluster in clusters:
            members = sorted(cluster["items"], key=lambda item: item.score, reverse=True)
            primary = members[0]
            sources = list(dict.fromkeys(item.source for item in members))
            consensus = min(12, max(0, len(sources) - 1) * 4)
            signal_score = min(99, round(primary.score + consensus))
            profile = project_profile(asdict(primary))
            takeaway = knowledge_takeaway(asdict(primary), profile)
            knowledge_points = [
                clean_text(profile["positioning"]),
                clean_text(profile["highlight"]),
            ]
            if len(sources) > 1:
                knowledge_points.append(f"已在 {len(sources)} 个独立来源中出现，可信度高于单点热榜。")
            signals.append({
                "title": primary.title,
                "url": primary.url,
                "summary": primary.summary or profile["positioning"],
                "takeaway": takeaway,
                "knowledge_points": [point for point in knowledge_points if point][:3],
                "scenario": profile["scenario"],
                "next_step": learning_action(asdict(primary)),
                "score": signal_score,
                "category": self.board_category(primary.source, primary.source),
                "source_count": len(sources),
                "sources": sources[:4],
                "topic_ids": sorted({
                    topic_id
                    for item in members
                    for topic_id in matching_topic_ids(
                        f"{item.title} {item.summary}",
                        self.research,
                    )
                }),
                "why": (
                    f"{len(sources)} 个独立来源同时出现，正在形成跨平台信号。"
                    if len(sources) > 1 else profile.get("why_learn") or profile["highlight"]
                ),
                "evidence": [self.item_payload(item) for item in members[:4]],
            })
        signals.sort(key=lambda signal: (signal["source_count"], signal["score"]), reverse=True)

        selected = []
        selected_titles = set()
        for topic in self.research.get("topics", []):
            match = next(
                (
                    signal for signal in signals
                    if topic["id"] in signal["topic_ids"]
                    and signal["title"] not in selected_titles
                ),
                None,
            )
            if match:
                selected.append(match)
                selected_titles.add(match["title"])

        category_counts, family_counts = Counter(), Counter()
        for signal in selected:
            category_counts[signal["category"]] += 1
            for family in {source.split("/")[0] for source in signal["sources"]}:
                family_counts[family] += 1
        for signal in signals:
            if signal["title"] in selected_titles:
                continue
            category = signal["category"]
            families = {source.split("/")[0] for source in signal["sources"]}
            if category_counts[category] >= 3 or any(family_counts[family] >= 2 for family in families):
                continue
            selected.append(signal)
            selected_titles.add(signal["title"])
            category_counts[category] += 1
            for family in families:
                family_counts[family] += 1
            if len(selected) == 8:
                break
        return selected[:8]

    def build_news_boards(self, items: list[TechItem]) -> list[dict]:
        grouped: dict[str, dict] = {}
        now = dt.datetime.now(dt.timezone.utc)
        percentiles = self.source_percentiles(items)
        for item in items:
            key, label = self.source_category(item.source)
            canonical_key = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", label.lower()) or key
            board = grouped.setdefault(canonical_key, {
                "key": key,
                "label": label,
                "category": self.board_category(item.source, label),
                "items": [],
            })
            if item.source.startswith("Buzzing/"):
                board["category"] = "world"
            normalized = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", item.title.lower())
            if not normalized or any(row["_key"] == normalized for row in board["items"]):
                continue
            published = parse_date(item.published_at)
            age_hours = max(0, (now - published).total_seconds() / 3600) if published else 72
            freshness = max(0, 40 - min(age_hours, 168) / 168 * 40)
            completeness = 10 if item.summary and len(item.summary) >= 10 else 4
            trend_score = freshness * 0.75 + percentiles.get(id(item), 0.5) * 55 + completeness
            row = asdict(item)
            row["score"] = round(trend_score, 1)
            row["topic_ids"] = matching_topic_ids(
                f"{item.title} {item.summary}",
                self.research,
            )
            row["_key"] = normalized
            board["items"].append(row)

        boards = []
        for board in grouped.values():
            board["items"].sort(key=lambda row: row["score"], reverse=True)
            board["items"] = [
                {key: value for key, value in row.items() if key != "_key"}
                for row in board["items"][:10]
            ]
            if board["items"]:
                boards.append(board)
        category_order = {"china": 0, "world": 1, "tech": 2, "crypto": 3, "finance": 4, "all": 5}
        boards.sort(key=lambda board: (category_order.get(board["category"], 9), board["label"]))
        return boards

    def score_and_clean(self, items: list[TechItem]) -> list[TechItem]:
        unique: dict[str, TechItem] = {}
        now = dt.datetime.now(dt.timezone.utc)
        percentiles = self.source_percentiles(items)
        for item in items:
            text = f"{item.title} {item.summary}".lower()
            relevance = sum(
                keyword_matches(text, keyword)
                for keyword in self.research["keywords"]
            )
            if not relevance:
                continue
            key = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", item.title.lower())
            if len(key) < 4:
                continue
            published = parse_date(item.published_at)
            age_hours = max(0, (now - published).total_seconds() / 3600) if published else 72
            freshness = max(0, 22 - min(age_hours, 168) / 168 * 22)
            momentum = percentiles.get(id(item), 0.5) * 24
            novelty = min(18, relevance * 2.5 + (4 if "new" in text or "release" in text or "发布" in text else 0))
            practical = min(14, sum(term in text for term in PRACTICAL_TERMS) * 2.5)
            credibility = 12 if item.source in ("GitHub Trending", "Hugging Face", "arXiv") else 8
            completeness = 6 if item.summary and len(item.summary) >= 10 else 2
            item.score = min(96, freshness + momentum + novelty + practical + credibility + completeness)
            if key not in unique or item.score > unique[key].score:
                unique[key] = item

        return sorted(unique.values(), key=lambda candidate: candidate.score, reverse=True)

    @staticmethod
    def select_diverse(ranked: list[TechItem]) -> list[TechItem]:
        selected, source_counts = [], {}
        for item in ranked:
            family = item.source.split("/")[0]
            if source_counts.get(family, 0) >= 4:
                continue
            selected.append(item)
            source_counts[family] = source_counts.get(family, 0) + 1
            if len(selected) == 10:
                break
        return selected


SEARCH_TYPE_LABELS = {
    "desktop": "桌面助手",
    "mobile": "手机助手",
    "platform": "Agent 开发平台",
    "governance": "Agent 纳管平台",
    "data": "知识引擎",
    "coding": "Code 工具",
}
SEARCH_TIME_RANGES = {
    "7d": ("近一周", 7),
    "30d": ("近一个月", 30),
    "1y": ("近 1 年", 365),
    "3y": ("近 3 年", 1095),
    "all": ("不限制", None),
}
SEARCH_CACHE: dict[tuple[str, str, int, str], tuple[float, dict]] = {}
SEARCH_CACHE_LOCK = threading.Lock()


def normalize_search_time_range(value: str) -> str:
    return value if value in SEARCH_TIME_RANGES else "30d"


def search_time_cutoff(value: str) -> Optional[dt.datetime]:
    value = normalize_search_time_range(value)
    days = SEARCH_TIME_RANGES[value][1]
    if days is None:
        return None
    now = dt.datetime.now(dt.timezone.utc)
    if value in {"1y", "3y"}:
        years = 1 if value == "1y" else 3
        try:
            return now.replace(year=now.year - years)
        except ValueError:
            return now.replace(year=now.year - years, day=28)
    return now - dt.timedelta(days=days)


def search_item_in_time_range(item: dict, value: str) -> bool:
    cutoff = search_time_cutoff(value)
    if cutoff is None or item.get("source") == "产品矩阵":
        return True
    published = parse_date(item.get("publishedAt"))
    return bool(published and published >= cutoff)


def search_query_with_time(query: str, value: str) -> str:
    value = normalize_search_time_range(value)
    days = SEARCH_TIME_RANGES[value][1]
    if days is None:
        return query
    if value in {"7d", "30d"}:
        return f"{query} when:{days}d"
    cutoff = search_time_cutoff(value)
    return f"{query} after:{cutoff.date().isoformat()}" if cutoff else query


def search_query_terms(query: str) -> list[str]:
    cleaned = clean_text(query)[:120]
    if not cleaned:
        return []
    values = [cleaned]
    values.extend(
        part for part in re.split(r"[\s,，、;/|]+", cleaned)
        if len(part.strip()) >= 2
    )
    return list(dict.fromkeys(value.lower() for value in values if value.strip()))


def search_relevance(query: str, *values: str) -> int:
    terms = search_query_terms(query)
    haystack = clean_text(" ".join(str(value or "") for value in values)).lower()
    compact_haystack = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", haystack)
    compact_query = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", clean_text(query).lower())
    score = 0
    if compact_query and compact_query in compact_haystack:
        score += 60
    for term in terms:
        compact_term = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", term)
        if compact_term and compact_term in compact_haystack:
            score += 14
    return min(100, score)


def product_catalog_search(query: str) -> list[dict]:
    results = []
    for vendor in PRODUCT_MATRIX:
        for product_type, (name, url) in vendor["products"].items():
            if name == "-":
                continue
            aliases = product_aliases(name)
            label = SEARCH_TYPE_LABELS.get(product_type, "产品")
            relevance = search_relevance(
                query, vendor["vendor"], name, label, " ".join(aliases)
            )
            if relevance < 28:
                continue
            results.append({
                "title": name,
                "url": url,
                "source": "产品矩阵",
                "summary": f'{vendor["vendor"]} · {label} · {vendor["tier"]}跟踪',
                "publishedAt": "",
                "score": min(100, relevance + 26),
                "type": "产品",
                "evidence": "已纳入产品情报矩阵，链接指向官方入口",
            })
    return results


def cached_report_search(query: str, time_range: str = "30d") -> list[dict]:
    report = ReportStore().latest()
    if not report:
        return []
    candidates, seen = [], set()
    candidates.extend(report.get("items", []))
    for board in report.get("news_boards", []):
        candidates.extend(board.get("items", []))
    for signal in report.get("signals", []):
        candidates.append(signal)
        candidates.extend(signal.get("evidence", []))
    product_terms = [
        alias.lower()
        for vendor in PRODUCT_MATRIX
        for name, _url in vendor["products"].values()
        if name != "-"
        for alias in product_aliases(name)
    ]
    results = []
    for item in candidates:
        title = clean_text(str(item.get("title") or ""))
        url = str(item.get("url") or "")
        key = url or re.sub(r"\W+", "", title.lower())
        if not title or key in seen:
            continue
        seen.add(key)
        summary = clean_text(str(item.get("summary") or item.get("takeaway") or ""))
        relevance = search_relevance(query, title, summary, str(item.get("source") or ""))
        if relevance <= 0:
            continue
        content = f"{title} {summary}".lower()
        result_type = "产品" if any(alias in content for alias in product_terms) else "技术"
        result = {
            "title": title,
            "url": url,
            "source": str(item.get("source") or "历史报告"),
            "summary": summary[:500],
            "publishedAt": str(item.get("published_at") or item.get("generated_at") or ""),
            "score": min(96, relevance + round(number(item.get("score")) * 0.2) + 8),
            "type": result_type,
            "evidence": str(item.get("evidence") or "来自本机历史情报报告"),
        }
        if search_item_in_time_range(result, time_range):
            results.append(result)
    return results


def google_news_search(query: str, time_range: str = "30d") -> list[dict]:
    params = urllib.parse.urlencode({
        "q": search_query_with_time(query, time_range),
        "hl": "zh-CN",
        "gl": "CN",
        "ceid": "CN:zh-Hans",
    })
    root = ET.fromstring(HTTPClient().request(
        f"https://news.google.com/rss/search?{params}", timeout=25
    ))
    results = []
    for entry in root.findall("./channel/item")[:18]:
        title = clean_text(entry.findtext("title", ""))
        source = clean_text(entry.findtext("source", "")) or "Google News"
        if title.endswith(f" - {source}"):
            title = title[:-(len(source) + 3)].rstrip()
        published = entry.findtext("pubDate", "")
        try:
            published_at = email.utils.parsedate_to_datetime(published).isoformat()
        except (TypeError, ValueError):
            published_at = ""
        results.append({
            "title": title,
            "url": entry.findtext("link", ""),
            "source": source,
            "summary": f"Google News 实时检索 · {source}",
            "publishedAt": published_at,
            "score": min(92, search_relevance(query, title) + 22),
            "type": "动态",
            "evidence": "Google News 实时索引",
        })
    return results


def github_repository_search(query: str, time_range: str = "30d") -> list[dict]:
    cutoff = search_time_cutoff(time_range)
    date_filter = f" pushed:>={cutoff.date().isoformat()}" if cutoff else ""
    params = urllib.parse.urlencode({
        "q": f"{query} in:name,description,readme{date_filter}",
        "sort": "updated",
        "order": "desc",
        "per_page": 12,
    })
    payload = json.loads(HTTPClient().request(
        f"https://api.github.com/search/repositories?{params}",
        headers={"Accept": "application/vnd.github+json"},
        timeout=25,
    ))
    results = []
    for row in payload.get("items", []):
        title = clean_text(str(row.get("full_name") or ""))
        summary = clean_text(str(row.get("description") or ""))
        stars = int(number(row.get("stargazers_count")))
        results.append({
            "title": title,
            "url": str(row.get("html_url") or ""),
            "source": "GitHub",
            "summary": summary,
            "publishedAt": str(row.get("updated_at") or ""),
            "score": min(94, search_relevance(query, title, summary) + 14 + min(20, math.log10(stars + 1) * 5)),
            "type": "开源项目",
            "evidence": f"{stars:,} Stars · {row.get('language') or '多语言'}",
        })
    return results


def hacker_news_search(query: str, time_range: str = "30d") -> list[dict]:
    request_params = {
        "query": query,
        "tags": "story",
        "hitsPerPage": 12,
    }
    cutoff = search_time_cutoff(time_range)
    if cutoff:
        request_params["numericFilters"] = f"created_at_i>={int(cutoff.timestamp())}"
    params = urllib.parse.urlencode(request_params)
    payload = json.loads(HTTPClient().request(
        f"https://hn.algolia.com/api/v1/search?{params}", timeout=20
    ))
    results = []
    for row in payload.get("hits", []):
        title = clean_text(str(row.get("title") or ""))
        points = int(number(row.get("points")))
        comments = int(number(row.get("num_comments")))
        object_id = str(row.get("objectID") or "")
        results.append({
            "title": title,
            "url": str(row.get("url") or f"https://news.ycombinator.com/item?id={object_id}"),
            "source": "Hacker News",
            "summary": clean_text(str(row.get("story_text") or ""))[:500],
            "publishedAt": str(row.get("created_at") or ""),
            "score": min(92, search_relevance(query, title) + 14 + min(18, math.log10(points + comments + 1) * 6)),
            "type": "技术",
            "evidence": f"{points} points · {comments} comments",
        })
    return results


def arxiv_topic_search(query: str, time_range: str = "30d") -> list[dict]:
    search_query = f'all:"{query}"'
    cutoff = search_time_cutoff(time_range)
    if cutoff:
        start = cutoff.strftime("%Y%m%d%H%M")
        end = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M")
        search_query += f" AND submittedDate:[{start} TO {end}]"
    params = urllib.parse.urlencode({
        "search_query": search_query,
        "start": 0,
        "max_results": 12,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    })
    root = ET.fromstring(HTTPClient().request(
        f"https://export.arxiv.org/api/query?{params}", timeout=25
    ))
    ns = {"a": "http://www.w3.org/2005/Atom"}
    results = []
    for entry in root.findall("a:entry", ns):
        title = clean_text(entry.findtext("a:title", "", ns))
        summary = clean_text(entry.findtext("a:summary", "", ns))
        link_node = next(
            (node for node in entry.findall("a:link", ns) if node.attrib.get("rel") == "alternate"),
            None,
        )
        results.append({
            "title": title,
            "url": link_node.attrib.get("href", "") if link_node is not None else "",
            "source": "arXiv",
            "summary": summary[:500],
            "publishedAt": entry.findtext("a:published", "", ns),
            "score": min(90, search_relevance(query, title, summary) + 18),
            "type": "论文",
            "evidence": "arXiv 按提交时间检索",
        })
    return results


def active_search(
    query: str,
    kind: str = "all",
    limit: int = 24,
    time_range: str = "30d",
) -> dict:
    query = clean_text(query)[:120]
    kind = kind if kind in {"all", "technology", "product"} else "all"
    time_range = normalize_search_time_range(time_range)
    limit = max(1, min(40, int(limit)))
    if len(query) < 2:
        raise ValueError("请输入至少 2 个字符")
    cache_key = (query.lower(), kind, limit, time_range)
    with SEARCH_CACHE_LOCK:
        cached = SEARCH_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < 300:
            return {**cached[1], "cached": True}

    results = []
    source_status = []
    if kind in {"all", "product"}:
        catalog_results = product_catalog_search(query)
        results.extend(catalog_results)
        source_status.append({
            "source": "产品矩阵", "status": "ok", "items": len(catalog_results),
        })
    local_results = cached_report_search(query, time_range)
    if kind == "product":
        local_results = [item for item in local_results if item["type"] == "产品"]
    results.extend(local_results)
    source_status.append({
        "source": "本机历史报告", "status": "ok", "items": len(local_results),
    })

    collectors = {"Google News": google_news_search}
    if kind in {"all", "technology"}:
        collectors.update({
            "GitHub": github_repository_search,
            "Hacker News": hacker_news_search,
            "arXiv": arxiv_topic_search,
        })
    with ThreadPoolExecutor(max_workers=len(collectors)) as executor:
        futures = {
            executor.submit(collector, query, time_range): source
            for source, collector in collectors.items()
        }
        for future in as_completed(futures):
            source = futures[future]
            try:
                collected = future.result()
                if kind == "product":
                    collected = [
                        item for item in collected
                        if search_relevance(
                            query, item["title"], item["summary"], "产品 product"
                        ) > 0
                    ]
                results.extend(collected)
                source_status.append({
                    "source": source, "status": "ok", "items": len(collected),
                })
            except Exception as exc:
                source_status.append({
                    "source": source,
                    "status": "error",
                    "detail": clean_text(str(exc))[:180],
                })

    unique = {}
    for item in results:
        if not item.get("title"):
            continue
        if kind == "technology" and item.get("type") == "产品":
            continue
        if (
            item.get("source") != "产品矩阵"
            and search_relevance(query, item.get("title"), item.get("summary")) < 28
        ):
            continue
        if not search_item_in_time_range(item, time_range):
            continue
        key = str(item.get("url") or "").split("?", 1)[0]
        if not key:
            key = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", item["title"].lower())
        current = unique.get(key)
        if current is None or number(item.get("score")) > number(current.get("score")):
            unique[key] = item
    ordered = sorted(
        unique.values(),
        key=lambda item: (
            number(item.get("score")),
            parse_date(item.get("publishedAt")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
        ),
        reverse=True,
    )[:limit]
    payload = {
        "query": query,
        "kind": kind,
        "timeRange": time_range,
        "timeLabel": SEARCH_TIME_RANGES[time_range][0],
        "searchedAt": now_iso(),
        "total": len(ordered),
        "sourceCount": sum(1 for status in source_status if status["status"] == "ok"),
        "sourceStatus": source_status,
        "results": ordered,
        "cached": False,
    }
    with SEARCH_CACHE_LOCK:
        SEARCH_CACHE[cache_key] = (time.time(), payload)
        if len(SEARCH_CACHE) > 50:
            oldest = min(SEARCH_CACHE, key=lambda key: SEARCH_CACHE[key][0])
            SEARCH_CACHE.pop(oldest, None)
    return payload


def plain_language_signal(signal: dict, profile: dict) -> str:
    title = clean_text(str(signal.get("title") or ""))
    lowered = title.lower()
    rules = (
        (("deepseek harness", "dsh"), "围绕 DeepSeek Harness 的开源 Agent 框架定位、工具编排能力和使用边界展开的社区讨论。"),
        (("ldpc decoding", "ldpc 解码"), "利用大模型从文本语义推测纠错结果，再通过校验机制避免错误修改的通信解码方法。"),
        (("mathcode", "mathematical coding"), "把数学推理转成代码、执行计算并自动验证结果的数学编程 Agent。"),
        (("knowledge graph", "知识图谱"), "让 AI Agent 通过命令行创建、查询和维护知识图谱的开发工具。"),
        (("agent orchestrator", "fleet manager", "车队经理"), "统一分配、监控和协调多个编码 Agent 工作任务的管理工具。"),
        (("blender", "代理桥"), "连接 AI Agent 与 Blender，让代理能够调用建模、场景编辑等操作的桥接工具。"),
        (("lo-fi", "低保真", "nenspace"), "弱化直接给出成品答案，改用开放式提示帮助用户扩展和整理思路的 LLM 产品。"),
        (("manthan", "concept cards"), "通过 MCP 保存概念卡片及其前置依赖关系，为 Agent 建立可追溯的结构化知识。"),
        (("x api", "x developer docs"), "把 X 平台 API 和开发文档封装为 MCP 工具，供 Agent 统一查询和调用。"),
        (("rag indexing", "indexing strategies"), "对比多种 RAG 索引与检索组织方式，说明它们对召回效果和适用场景的影响。"),
    )
    for keywords, description in rules:
        if any(keyword in lowered for keyword in keywords):
            return description

    candidates = (
        signal.get("takeaway"),
        signal.get("summary"),
        profile.get("positioning"),
    )
    generic = {
        "技术社区讨论",
        "面向复杂任务自动执行的 AI Agent 技术或产品。",
        "聚焦模型能力、推理效率或部署方式的新技术。",
        "一项正在升温的 AI 产品或技术动态。",
    }
    for candidate in candidates:
        text = clean_text(str(candidate or ""))
        if text and text not in generic:
            return text[:120].rstrip() + ("…" if len(text) > 120 else "")
    return f"一项与“{title}”相关的技术动态，当前信息有限，建议进入详情核对来源证据。"


def signal_business_context(signal: dict, profile: dict) -> dict:
    title = clean_text(str(signal.get("title") or ""))
    lowered = title.lower()
    rules = (
        (("deepseek harness", "dsh"), "AI 应用研发", "缩短 Agent 工具接入和流程编排的开发周期", ["Agent 框架", "工具调用", "任务编排"]),
        (("ldpc decoding", "ldpc 解码"), "通信与网络", "提升自然语言载荷在信道受损后的恢复准确率", ["LDPC", "语义通信", "大模型纠错", "校验反馈"]),
        (("mathcode", "mathematical coding"), "科研与工程计算", "把数学推导、编码计算和结果验证串成自动闭环", ["代码生成", "数学推理", "执行验证", "Agent"]),
        (("knowledge graph", "知识图谱"), "企业知识管理", "降低知识录入和关系维护成本，让 Agent 可持续使用组织知识", ["知识图谱", "CLI", "Agent 工具", "结构化记忆"]),
        (("agent orchestrator", "fleet manager", "车队经理"), "软件研发", "并行调度多个编码 Agent，减少人工分工、盯进度和任务交接", ["多 Agent", "任务调度", "状态监控", "工作流编排"]),
        (("blender", "代理桥"), "3D 内容生产", "让 AI 直接执行建模和场景操作，减少重复手工制作", ["Blender API", "工具调用", "Agent", "场景自动化"]),
        (("lo-fi", "低保真", "nenspace"), "创意与知识工作", "通过开放式引导扩展思路，降低过早收敛到单一答案的风险", ["大语言模型", "提示设计", "人机协作"]),
        (("mcp server", "mcp servers"), "AI 工具集成", "把外部数据或服务标准化接入 Agent，减少重复适配工作", ["MCP", "工具协议", "API 集成"]),
        (("rag indexing", "indexing strategies"), "企业知识问答", "改善知识检索命中率，为问答质量和可解释性提供基础", ["RAG", "向量索引", "分块策略", "混合检索"]),
    )
    for keywords, domain, value, technologies in rules:
        if any(keyword in lowered for keyword in keywords):
            return {"domain": domain, "value": value, "technologies": technologies}

    topic_ids = set(str(value) for value in signal.get("topic_ids") or [])
    if "agents" in topic_ids:
        return {
            "domain": "业务流程自动化",
            "value": "将模型能力接入真实工具和流程，减少重复人工操作",
            "technologies": ["AI Agent", "工具调用", "任务编排"],
        }
    if "knowledge" in topic_ids:
        return {
            "domain": "知识管理",
            "value": "提升组织知识的检索、复用和持续维护效率",
            "technologies": ["RAG", "知识检索", "向量索引"],
        }
    if "devtools" in topic_ids:
        return {
            "domain": "软件研发",
            "value": "减少研发流程中的重复操作和人工协作成本",
            "technologies": ["开发者工具", "自动化工作流", "AI 辅助"],
        }
    if "models" in topic_ids:
        return {
            "domain": "企业 AI 应用",
            "value": "在模型能力、运行成本和部署门槛之间寻找更优平衡",
            "technologies": ["大语言模型", "推理优化", "模型评估"],
        }
    return {
        "domain": clean_text(str(signal.get("scenario") or profile.get("scenario") or "技术预研")).split("、")[0],
        "value": "帮助团队判断是否值得进入产品验证或技术选型",
        "technologies": ["技术方案待核实"],
    }


def product_aliases(product_name: str) -> list[str]:
    aliases = [clean_text(value) for value in re.split(r"\s*/\s*", product_name) if clean_text(value)]
    alias_map = {
        "腾讯云 ADP": ["腾讯 ADP", "Tencent ADP"],
        "火山引擎 HiAgent": ["HiAgent"],
        "阿里云百炼": ["阿里百炼", "Model Studio"],
        "ADP Agent Portal": ["Agent Portal", "ADP Agent Portal"],
        "Agent ID Guard": ["Agent ID Guard", "Agent 身份安全"],
        "AgentSphere": ["AgentSphere", "Agent Sphere", "HiAgent 数字员工治理"],
        "百度智能云千帆": ["百度千帆", "千帆平台"],
        "小艺（HarmonyOS PC）": ["华为小艺", "Celia", "HarmonyOS PC"],
        "小艺智能体平台": ["小艺开放平台", "华为智能体平台"],
        "盘古大模型知识库": ["华为盘古", "盘古知识库"],
        "CodeArts Doer": ["华为 CodeArts Doer", "CodeArts"],
        "JoyClaw": ["京东 JoyClaw", "JoyAgent 个人助手"],
        "京言": ["京东京言", "京言电商智能体"],
        "JoyAgent 开发平台": ["京东 JoyAgent", "JoyAgent"],
        "大模型安全网关": ["京东大模型安全网关"],
        "JoyContext": ["京东 JoyContext", "JoyContext 知识库"],
        "JoyCode": ["京东 JoyCode"],
        "Xiaomi MiMo Desktop": ["小米 MiMo Desktop", "MiMo 桌面客户端"],
        "超级小爱": ["小米超级小爱", "小爱同学"],
        "Xiaomi MiMo API": ["小米 MiMo API", "MiMo 开放平台"],
        "MiMo Code": ["Xiaomi MiMo Code", "小米 MiMo Code"],
        "CatPaw": ["美团 CatPaw"],
        "Tabbit": ["美团 Tabbit"],
        "小团": ["美团小团"],
        "CatPaw Managed Agents": ["美团 Managed Agents", "CatPaw Agent 平台"],
        "CatPaw 企业管理": ["CatPaw Managed Agents", "美团 Agent 管理"],
        "AutoGLM": ["智谱 AutoGLM"],
        "智谱清言": ["ChatGLM", "智谱清言"],
        "智谱开放平台": ["BigModel", "智谱 BigModel"],
        "智谱知识库": ["BigModel 知识库"],
        "Z Code": ["智谱 Z Code"],
        "GLM Coding Plan": ["智谱 GLM Coding Plan"],
        "DeepSeek 开放平台": ["DeepSeek API", "DeepSeek Platform"],
        "DeepSeek Harness": ["DeepSeek Harness", "DSH"],
        "OpenAI Agent Platform": ["OpenAI Agents SDK", "AgentKit"],
        "Meta AI": ["Meta AI", "meta.ai"],
        "Llama API": ["Meta Llama API", "Llama API", "Llama 4"],
        "LlamaStack": ["Meta LlamaStack", "LlamaStack"],
        "Gemini Enterprise Agent Platform": ["Gemini Enterprise Agent Platform", "Vertex AI Agent Builder"],
        "Agent Registry": ["Google Agent Registry", "Agent Registry"],
        "Microsoft Agent 365": ["Microsoft Agent 365", "Agent 365"],
        "Bedrock AgentCore": ["Bedrock AgentCore", "AgentCore"],
        "AI Control Tower": ["ServiceNow AI Control Tower", "AI Control Tower"],
        "MuleSoft Agent Fabric": ["MuleSoft Agent Fabric", "Agent Fabric"],
        "ima": ["ima.copilot", "腾讯 ima", "ima 知识库"],
        "腾讯乐享": ["腾讯乐享", "乐享知识库"],
        "百炼 Agentic RAG": ["百炼 Agentic RAG", "Agentic RAG"],
        "企业知识引擎": ["火山引擎企业知识引擎", "字节知识引擎", "企业知识引擎"],
        "Kimi 知识库": ["Kimi 知识库"],
        "甄知": ["百度甄知", "甄知"],
        "千帆知识库": ["百度千帆知识库", "千帆知识库"],
        "NotebookLM": ["Google NotebookLM", "NotebookLM"],
        "Cloud Search": ["Google Cloud Search", "Cloud Search"],
        "SharePoint": ["Microsoft SharePoint", "SharePoint"],
        "Microsoft Graph": ["Microsoft Graph"],
        "Amazon Q Business": ["Amazon Q Business"],
        "Knowledge Management": ["ServiceNow Knowledge Management"],
        "Data 360": ["Salesforce Data 360", "Data Cloud"],
        "Amazon Bedrock Agents": ["Bedrock Agents"],
        "Microsoft 365 Copilot": ["Microsoft 365 Copilot", "M365 Copilot"],
        "Gemini Code Assist": ["Gemini Code Assist"],
        "GitHub Copilot": ["GitHub Copilot"],
    }
    expanded = []
    for alias in aliases:
        expanded.append(alias)
        expanded.extend(alias_map.get(alias, []))
    return list(dict.fromkeys(expanded))


def product_intelligence_context(report: dict, research: dict) -> dict:
    candidates = []
    seen = set()
    raw_items = list(report.get("items", []))
    for board in report.get("news_boards", []):
        raw_items.extend(board.get("items", []))
    for signal in report.get("signals", []):
        raw_items.extend(signal.get("evidence", []))
    for item in raw_items:
        identity = str(item.get("url") or item.get("title") or "").strip()
        if not identity or identity in seen:
            continue
        seen.add(identity)
        candidates.append(item)

    rows = []
    product_mentions = {}
    product_lookup = []
    for vendor in PRODUCT_MATRIX:
        cells = {}
        vendor_topic_ids = set()
        search_terms = [vendor["vendor"]]
        for product_type, (name, url) in vendor["products"].items():
            aliases = [] if name == "-" else product_aliases(name)
            matches = [
                item for item in candidates
                if any(
                    keyword_matches(f'{item.get("title", "")} {item.get("summary", "")}', alias)
                    for alias in aliases
                )
            ]
            matches.sort(
                key=lambda item: (
                    parse_date(item.get("published_at")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
                    number(item.get("score")),
                ),
                reverse=True,
            )
            cells[product_type] = {
                "name": name,
                "url": url,
                "mentions": len(matches),
                "latest": matches[0] if matches else None,
            }
            product_mentions[name] = matches
            if aliases:
                product_lookup.append((vendor["vendor"], name, aliases))
                search_terms.extend(aliases)
                vendor_topic_ids.update(matching_topic_ids(" ".join(aliases), research))
        rows.append({
            **vendor,
            "cells": cells,
            "topic_ids": sorted(vendor_topic_ids),
            "search": " ".join(search_terms).lower(),
        })

    feed = []
    for item in candidates:
        text = f'{item.get("title", "")} {item.get("summary", "")}'
        matched = next(
            (
                (vendor, product)
                for vendor, product, aliases in product_lookup
                if any(keyword_matches(text, alias) for alias in aliases)
            ),
            None,
        )
        if not matched:
            continue
        payload = dict(item)
        payload["vendor"], payload["product"] = matched
        payload["topic_ids"] = sorted(
            set(item.get("topic_ids") or []) | set(matching_topic_ids(text, research))
        )
        feed.append(payload)
    feed.sort(
        key=lambda item: (
            parse_date(item.get("published_at")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
            number(item.get("score")),
        ),
        reverse=True,
    )
    product_types = tuple(PRODUCT_MATRIX[0]["products"])
    hotspots = {}
    for product_type in product_types:
        candidates_for_type = [
            {
                "vendor": vendor["vendor"],
                "region": vendor["region"],
                "product_type": product_type,
                **vendor["cells"][product_type],
            }
            for vendor in rows
            if vendor["cells"][product_type]["name"] != "-"
        ]
        hotspots[product_type] = max(
            candidates_for_type,
            key=lambda product: (
                product["mentions"],
                parse_date((product.get("latest") or {}).get("published_at"))
                or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
            ),
            default=None,
        )
    active_hotspots = [
        product for product in hotspots.values()
        if product and product["mentions"] > 0
    ]
    hotspot = max(
        active_hotspots,
        key=lambda product: (
            product["mentions"],
            parse_date((product.get("latest") or {}).get("published_at"))
            or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
        ),
        default=None,
    )
    return {
        "rows": rows,
        "focus": [
            {
                "name": name,
                "mentions": len(product_mentions.get(name, [])),
                "latest": (product_mentions.get(name) or [None])[0],
            }
            for name in PRODUCT_FOCUS
        ],
        "feed": feed[:12],
        "hotspot": hotspot,
        "hotspots": hotspots,
    }


class ReportStore:
    def __init__(self):
        REPORT_DIR.mkdir(parents=True, exist_ok=True)

    def save(self, report: dict) -> tuple[Path, Path]:
        generated = parse_date(report["generated_at"]) or dt.datetime.now(dt.timezone.utc)
        day = generated.astimezone().strftime("%Y-%m-%d")
        json_path, html_path = REPORT_DIR / f"{day}.json", REPORT_DIR / f"{day}.html"
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        html_path.write_text(self.render_html(report), encoding="utf-8")
        return json_path, html_path

    def latest(self) -> Optional[dict]:
        files = sorted(REPORT_DIR.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not files:
            return None
        try:
            return json.loads(files[0].read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def render_html(self, report: dict) -> str:
        generated = parse_date(report["generated_at"])
        stamp = generated.astimezone().strftime("%Y年%m月%d日 %H:%M") if generated else ""
        report_scope = report.get("research_context") or research_context({})
        scope = research_context({"research_topics": report_scope.get("topics")})
        topics = scope["topics"]
        topic_names = {
            str(topic.get("id") or ""): str(topic.get("name") or "")
            for topic in topics
        }
        def resolved_topic_ids(item: dict) -> list[str]:
            text = f'{item.get("title", "")} {item.get("summary", "")}'
            return sorted(set(item.get("topic_ids") or []) | set(matching_topic_ids(text, scope)))

        topics_json = json.dumps(topics, ensure_ascii=False).replace("<", "\\u003c")
        topic_buttons = "".join(
            f'<button data-topic="{html.escape(str(topic["id"]))}" '
            f'title="{html.escape(str(topic["name"]))}">'
            f'<i></i><span>{html.escape(str(topic["name"]))}</span></button>'
            for topic in topics
        )
        product_intelligence = product_intelligence_context(report, scope)
        category_labels = {
            "all": "全部热点", "china": "国内热榜", "world": "国际中文",
            "tech": "科技产品", "crypto": "加密快讯", "finance": "财经宏观",
        }
        category_counts = Counter(
            board.get("category", "all") for board in report.get("news_boards", [])
        )
        category_nav = "".join(
            f'<button class="category-button{" active" if key == "all" else ""}" '
            f'data-category="{key}"><i></i><span>{label}</span>'
            f'<b>{len(report.get("news_boards", [])) if key == "all" else category_counts.get(key, 0)}</b></button>'
            for key, label in category_labels.items()
        )

        board_cards = []
        for board in report.get("news_boards", []):
            board_key = html.escape(str(board.get("key") or board.get("label") or "board"))
            rows = []
            for index, item in enumerate(board.get("items", [])[:10], 1):
                title = html.escape(str(item.get("title") or ""))
                url = html.escape(str(item.get("url") or ""))
                heat = round(number(item.get("score")))
                item_topic_ids = resolved_topic_ids(item)
                item_topics = html.escape(" ".join(item_topic_ids))
                search_text = html.escape(
                    clean_text(f'{item.get("title", "")} {item.get("summary", "")}').lower(),
                    quote=True,
                )
                link = f'<a href="{url}" title="{title}">{title}</a>' if url else f"<span>{title}</span>"
                rows.append(
                    f'<li data-search="{search_text}" data-topics="{item_topics}">'
                    f'<em>{index}</em><div>{link}'
                    f'<small>{html.escape(str(item.get("evidence") or ""))}</small></div>'
                    f'<strong>{heat}</strong></li>'
                )
            board_topics = html.escape(" ".join(sorted({
                topic_id
                for item in board.get("items", [])
                for topic_id in (
                    resolved_topic_ids(item)
                )
            })))
            board_cards.append(
                f'<section class="board-card" data-board-key="{board_key}" '
                f'data-category="{html.escape(board.get("category", "all"))}" '
                f'data-topics="{board_topics}" draggable="false">'
                f'<header><button class="drag-handle" title="拖动排序" aria-label="拖动排序">⠿</button>'
                f'<div class="source-mark">{html.escape(str(board.get("label") or "?"))[:1]}</div>'
                f'<div><h2>{html.escape(str(board.get("label") or "热点"))}</h2>'
                f'<p>{category_labels.get(board.get("category"), "热点")} · 实时更新</p></div>'
                f'<span class="live-dot"></span><button class="card-style" title="卡片颜色" '
                f'aria-label="选择卡片颜色">◐</button></header><ol>{"".join(rows)}</ol>'
                f'<button class="resize-grip" title="拖动调整卡片大小" '
                f'aria-label="拖动调整卡片大小"></button></section>'
            )

        product_type_labels = {
            "desktop": "桌面办公", "mobile": "手机端",
            "platform": "Agent 开发平台", "governance": "Agent 纳管平台",
            "data": "知识引擎", "coding": "Code 工具",
        }
        type_hot_cards = []
        for product_type, label in product_type_labels.items():
            leader = product_intelligence["hotspots"].get(product_type)
            if not leader:
                continue
            status = (
                f'{leader["mentions"]} 条动态'
                if leader["mentions"] else "持续跟踪"
            )
            type_hot_cards.append(
                f'<a class="focus-product" href="{html.escape(leader["url"])}" '
                f'data-hot-type="{product_type}" title="打开 {html.escape(leader["name"])} 官方入口">'
                f'<i></i><small>{html.escape(label)} · HOT 01</small>'
                f'<strong>{html.escape(leader["name"])}</strong>'
                f'<span>{html.escape(leader["vendor"])} · {status}</span></a>'
            )

        company_options = []
        for vendor in product_intelligence["rows"]:
            vendor_name = html.escape(vendor["vendor"], quote=True)
            region_label = "国内" if vendor["region"] == "china" else "国外"
            company_options.append(
                f'<label class="company-option" data-company-search="'
                f'{html.escape(vendor["search"], quote=True)}">'
                f'<input type="checkbox" data-vendor-choice="{vendor_name}" checked>'
                f'<span class="company-check" aria-hidden="true"></span>'
                f'<span class="company-name">{vendor_name}</span>'
                f'<small>{region_label}</small></label>'
            )

        product_rows = []
        hotspot = product_intelligence.get("hotspot")
        type_hotspots = product_intelligence["hotspots"]
        if hotspot:
            hotspot_vendor = html.escape(hotspot["vendor"])
            hotspot_name = html.escape(hotspot["name"])
            hotspot_url = html.escape(hotspot["url"])
            hotspot_type = html.escape(product_type_labels[hotspot["product_type"]])
            hotspot_latest = hotspot.get("latest") or {}
            hotspot_latest_title = html.escape(clean_text(str(
                hotspot_latest.get("title") or "当天多个来源持续关注"
            )))
            hotspot_latest_url = html.escape(str(hotspot_latest.get("url") or ""))
            hotspot_latest_html = (
                f'<a href="{hotspot_latest_url}">{hotspot_latest_title}<i>↗</i></a>'
                if hotspot_latest_url else f"<span>{hotspot_latest_title}</span>"
            )
            hotspot_html = (
                f'<section class="hot-product" data-hot-vendor="{hotspot_vendor}">'
                f'<header><span class="hot-product-pulse"></span><b>今日热度焦点</b>'
                f'<small>基于当日采集动态自动计算</small></header>'
                f'<div class="hot-product-main"><span>{hotspot_vendor} · {hotspot_type}</span>'
                f'<h2>{hotspot_name}</h2>{hotspot_latest_html}</div>'
                f'<div class="hot-product-score"><b>{hotspot["mentions"]}</b><span>条动态</span></div>'
                f'<a class="hot-product-open" href="{hotspot_url}" title="打开 {hotspot_name} 官方入口">查看产品 ↗</a>'
                f'</section>'
            )
        else:
            hotspot_html = (
                '<section class="hot-product hot-product-idle"><header>'
                '<span class="hot-product-pulse"></span><b>今日热度焦点</b>'
                '<small>等待当天产品动态</small></header>'
                '<div class="hot-product-main"><span>持续扫描</span>'
                '<h2>暂无集中热议信号</h2></div></section>'
            )
        for vendor in product_intelligence["rows"]:
            cells = []
            is_hot_vendor = any(
                leader and vendor["vendor"] == leader["vendor"]
                for leader in type_hotspots.values()
            )
            for product_type in product_type_labels:
                product = vendor["cells"][product_type]
                name = html.escape(product["name"])
                url = html.escape(product["url"])
                if product["name"] == "-":
                    cells.append(
                        f'<td data-product-type="{product_type}" class="product-empty-cell">暂无独立产品</td>'
                    )
                    continue
                signal_label = (
                    f'<b>{product["mentions"]}</b> 条动态'
                    if product["mentions"] else "持续跟踪"
                )
                type_leader = type_hotspots.get(product_type)
                is_hot_product = bool(
                    type_leader
                    and vendor["vendor"] == type_leader["vendor"]
                    and product["name"] == type_leader["name"]
                )
                hot_badge = '<em class="hot-cell-badge">HOT 01</em>' if is_hot_product else ""
                cells.append(
                    f'<td data-product-type="{product_type}"'
                    f' class="{"hottest-product" if is_hot_product else ""}">{hot_badge}'
                    f'<a href="{url}" '
                    f'title="打开 {name} 官方入口"><span>{name}</span><i>↗</i></a>'
                    f'<small class="{"has-signal" if product["mentions"] else ""}">{signal_label}</small></td>'
                )
            product_rows.append(
                f'<tr class="{"hottest-vendor" if is_hot_vendor else ""}" '
                f'data-region="{vendor["region"]}" '
                f'data-vendor="{html.escape(vendor["vendor"], quote=True)}" '
                f'data-topics="{html.escape(" ".join(vendor["topic_ids"]))}" '
                f'data-search="{html.escape(vendor["search"], quote=True)}">'
                f'<th><span class="vendor-mark">{html.escape(vendor["vendor"])[:1]}</span>'
                f'<span>{html.escape(vendor["vendor"])}'
                f'<small>{"分类 HOT 01" if is_hot_vendor else vendor["tier"] + "跟踪"}</small></span></th>'
                f'{"".join(cells)}</tr>'
            )

        product_feed = []
        for item in product_intelligence["feed"]:
            title = html.escape(str(item.get("title") or ""))
            url = html.escape(str(item.get("url") or ""))
            topic_ids = html.escape(" ".join(resolved_topic_ids(item)))
            published = parse_date(item.get("published_at"))
            date_label = published.astimezone().strftime("%m-%d %H:%M") if published else "今日采集"
            product_feed.append(
                f'<a class="product-feed-item" href="{url}" data-topics="{topic_ids}" '
                f'data-vendor="{html.escape(item["vendor"], quote=True)}" '
                f'data-search="{html.escape(clean_text(str(item.get("title") or "")).lower(), quote=True)}">'
                f'<span><b>{html.escape(item["vendor"])}</b>{html.escape(item["product"])}</span>'
                f'<strong>{title}</strong><small>{html.escape(str(item.get("source") or ""))} · {date_label}</small></a>'
            )
        product_activity_count = sum(
            product["mentions"]
            for vendor in product_intelligence["rows"]
            for product in vendor["cells"].values()
        )

        portal_cards = "".join(
            f'<a class="portal" href="{html.escape(portal.get("url") or "")}">'
            f'<span>{html.escape(portal.get("name") or "")}</span>'
            f'<small>{html.escape(portal.get("description") or "")}</small><b>↗</b></a>'
            for portal in report.get("content_portals", [])
        )
        health_rows = []
        for status in report.get("source_status", []):
            state = str(status.get("status") or "error")
            detail = status.get("detail") or f"{status.get('items', 0)} 条"
            health_rows.append(
                f'<li><i class="{html.escape(state)}"></i><span>'
                f'{html.escape(str(status.get("source") or "未知来源"))}</span>'
                f'<b>{html.escape(str(detail))}</b></li>'
            )

        signal_cards = []
        signal_index_rows = []
        signal_items = report.get("signals") or [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "summary": item.get("summary"),
                "score": item.get("score"),
                "source_count": 1,
                "sources": [item.get("source")],
                "why": project_profile(item).get("why_learn"),
            }
            for item in report.get("items", [])[:5]
        ]
        signal_items = sorted(
            signal_items,
            key=lambda item: number(item.get("score")),
            reverse=True,
        )
        for index, signal in enumerate(signal_items[:8], 1):
            profile = project_profile(signal)
            title = html.escape(str(signal.get("title") or ""))
            url = html.escape(str(signal.get("url") or ""))
            title_html = f'<a href="{url}">{title}</a>' if url else title
            signal_key = html.escape(
                str(signal.get("url") or signal.get("title") or index),
                quote=True,
            )
            takeaway = clean_text(str(
                signal.get("takeaway") or signal.get("summary") or profile["positioning"]
            ))
            takeaway = takeaway[:110].rstrip() + ("…" if len(takeaway) > 110 else "")
            signal["topic_ids"] = resolved_topic_ids(signal)
            topic_ids = " ".join(signal["topic_ids"])
            points = signal.get("knowledge_points") or [
                profile["positioning"],
                profile["highlight"],
            ]
            knowledge_points = "".join(
                f"<li>{html.escape(clean_text(str(point)))}</li>"
                for point in points[:3] if clean_text(str(point))
            )
            sources = "".join(
                f'<span>{html.escape(str(source))}</span>'
                for source in signal.get("sources", [])[:4]
            )
            evidence_rows = []
            for evidence in signal.get("evidence", [])[:4]:
                evidence_url = html.escape(str(evidence.get("url") or ""))
                evidence_title = html.escape(str(evidence.get("title") or ""))
                evidence_link = (
                    f'<a href="{evidence_url}">{evidence_title}<b>↗</b></a>'
                    if evidence_url else f"<span>{evidence_title}</span>"
                )
                evidence_rows.append(
                    f'<li><i></i><div><small>{html.escape(str(evidence.get("source") or ""))}'
                    f' · {html.escape(str(evidence.get("evidence") or ""))}</small>'
                    f'{evidence_link}</div></li>'
                )
            consensus = int(signal.get("source_count") or 1)
            score = round(number(signal.get("score")))
            strength_label = (
                "优先了解" if score >= 70
                else "值得关注" if score >= 55
                else "持续观察"
            )
            attention = "focus" if score >= 55 else "watch"
            matched_topics = [
                topic_names.get(str(topic_id), "")
                for topic_id in signal.get("topic_ids") or []
            ]
            topic_label = " · ".join(name for name in matched_topics if name) or "技术动态"
            plain_summary = plain_language_signal(signal, profile)
            business = signal_business_context(signal, profile)
            technology_tags = "".join(
                f"<span>{html.escape(str(value))}</span>"
                for value in business["technologies"][:4]
            )
            why_text = clean_text(str(
                signal.get("why") or "帮助判断这项技术是否值得进一步验证。"
            ))
            why_text = why_text[:72].rstrip() + ("…" if len(why_text) > 72 else "")
            primary_source = html.escape(
                str((signal.get("sources") or ["技术信号"])[0])
            )
            search_text = " ".join((
                title,
                plain_summary,
                why_text,
                str(business["domain"]),
                str(business["value"]),
            )).lower()
            rank_label = (
                "今日最热" if index == 1
                else "热度第二" if index == 2
                else "热度第三" if index == 3
                else f"热度第 {index}"
            )
            signal_index_rows.append(
                f'<button class="signal-index-item{" selected" if index == 1 else ""}" '
                f'data-signal-key="{signal_key}" data-topics="{html.escape(topic_ids)}" '
                f'data-attention="{attention}" data-rank="{index}" style="--heat:{score}%" '
                f'data-search="{html.escape(search_text, quote=True)}">'
                f'<span class="hot-rank"><strong>{index:02d}</strong>'
                f'<span>{rank_label}</span></span><span class="index-copy"><span class="index-context">'
                f'<span class="index-topic">{html.escape(topic_label)}</span>'
                f'<span class="index-priority">{strength_label}</span></span>'
                f'<b class="index-title">{title}</b>'
                f'<span class="index-summary"><strong>它是什么</strong>'
                f'<span>{html.escape(plain_summary)}</span></span>'
                f'<span class="index-value"><strong>业务价值</strong>'
                f'<span>{html.escape(str(business["value"]))}</span></span>'
                f'<span class="index-facts"><span><strong>业务领域</strong>'
                f'<span>{html.escape(str(business["domain"]))}</span></span>'
                f'<span><strong>背后技术</strong><span class="tech-tags">{technology_tags}</span></span></span>'
                f'<span class="index-why"><strong>为什么看</strong>'
                f'<span>{html.escape(why_text)}</span></span>'
                f'<span class="index-meta"><span>{primary_source} · {consensus} 个来源</span>'
                f'<span>热度 {score}</span></span><span class="heat-track" aria-label="热度 {score}">'
                f'<i></i></span></span></button>'
            )
            signal_cards.append(
                f'<article class="signal-card{" selected" if index == 1 else ""}" data-signal-key="{signal_key}" '
                f'data-topics="{html.escape(topic_ids)}" data-takeaway="{html.escape(takeaway, quote=True)}">'
                f'<div class="signal-content"><div class="detail-kicker">'
                f'<span>今日信号 {index:02d}</span><button class="detail-more" type="button" '
                f'aria-label="更多操作">•••</button></div><div class="signal-meta">'
                f'<b>{strength_label}</b><span>信号强度 {score}/100</span>'
                f'<i></i><span>{consensus} 个来源</span></div>'
                f'<h2>{title_html}</h2><div class="takeaway"><b>一句话结论</b>'
                f'<p>{html.escape(takeaway)}</p></div>'
                f'<div class="business-detail"><section><b>业务领域</b>'
                f'<p>{html.escape(str(business["domain"]))}</p></section>'
                f'<section class="business-value"><b>业务价值</b>'
                f'<p>{html.escape(str(business["value"]))}</p></section>'
                f'<section><b>背后技术</b><div class="tech-tags">{technology_tags}</div></section></div>'
                f'<div class="knowledge-grid"><section><b>核心知识点</b>'
                f'<ul>{knowledge_points}</ul></section><section><b>适用场景</b>'
                f'<p>{html.escape(str(signal.get("scenario") or profile["scenario"]))}</p>'
                f'<b>下一步验证</b><p>{html.escape(str(signal.get("next_step") or learning_action(signal)))}</p>'
                f'</section></div>'
                f'<div class="signal-why"><b>为什么值得关注</b>'
                f'<span>{html.escape(str(signal.get("why") or "值得持续跟踪的高相关技术信号。"))}</span></div>'
                f'<div class="evidence-panel" hidden><b>来源证据</b>'
                f'<ul>{"".join(evidence_rows)}</ul></div>'
                f'<footer><div class="signal-sources">{sources}</div><div class="signal-actions">'
                f'<button class="evidence-toggle" type="button">展开证据</button>'
                f'<button class="master-button" type="button"><span>✓</span> 标记已掌握</button>'
                f'</div></footer>'
                f'</div></article>'
            )
        ai_cards = []
        for index, item in enumerate(report.get("items", [])[:10], 1):
            profile = project_profile(item)
            url = html.escape(str(item.get("url") or ""))
            title = html.escape(str(item.get("title") or ""))
            title_html = f'<a href="{url}">{title}</a>' if url else title
            ai_cards.append(
                f'<article class="ai-card" data-topics="{html.escape(" ".join(resolved_topic_ids(item)))}">'
                f'<em>{index:02d}</em><div><div class="ai-meta">'
                f'{html.escape(str(item.get("source") or ""))} · {round(number(item.get("score")))} 分</div>'
                f'<h2>{title_html}</h2><p>{html.escape(profile["positioning"])}</p>'
                f'<footer><span>适用场景</span>{html.escape(profile["scenario"])}</footer></div></article>'
            )

        ok_count = sum(1 for status in report.get("source_status", []) if status.get("status") == "ok")
        total_candidates = sum(
            int(status.get("items") or 0)
            for status in report.get("source_status", [])
            if status.get("status") == "ok"
        )
        quality = report.get("quality_stats") or {}
        rejected_count = int(quality.get("rejected") or 0)
        errors = ""
        if report.get("source_errors"):
            errors = (
                '<details><summary>查看暂不可用的数据源</summary><p>'
                + html.escape("；".join(report["source_errors"])) + "</p></details>"
            )
        return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>热点雷达 · {stamp}</title><style>
:root{{--bg:#f4f6f8;--panel:#fff;--soft:#f7f8fa;--text:#202328;--muted:#7b818a;--line:#e6e9ed;--accent:#ff5b35;--blue:#356ee8;--green:#14a47b;--shadow:0 2px 12px rgba(22,30,45,.055)}}@media(prefers-color-scheme:dark){{:root{{--bg:#111315;--panel:#1a1d21;--soft:#22262b;--text:#f2f3f5;--muted:#9aa1aa;--line:#2c3036;--accent:#ff7959;--blue:#79a4ff;--green:#4bcaa3;--shadow:none}}}}*{{box-sizing:border-box}}html,body{{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}}button,input{{font:inherit}}a{{color:inherit;text-decoration:none}}.app-head{{height:68px;display:flex;align-items:center;gap:18px;padding:0 22px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}}.brand{{display:flex;align-items:center;gap:10px;min-width:170px}}.brand-mark{{width:30px;height:30px;border-radius:8px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:800}}.brand strong{{font-size:15px}}.brand small{{display:block;color:var(--muted);font-size:10px}}.mode-switch{{display:flex;padding:3px;background:var(--soft);border:1px solid var(--line);border-radius:8px}}.mode-switch button{{height:28px;border:0;border-radius:6px;padding:0 12px;background:transparent;color:var(--muted);font-weight:600;cursor:pointer}}.mode-switch button.active{{background:var(--panel);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.08)}}.search{{margin-left:auto;width:min(280px,28vw);height:34px;border:1px solid var(--line);border-radius:8px;background:var(--soft);padding:0 12px;color:var(--text);outline:0}}.search:focus{{border-color:var(--blue);background:var(--panel)}}.updated{{color:var(--muted);white-space:nowrap;font-size:11px}}.dashboard{{display:grid;grid-template-columns:168px minmax(560px,1fr) 220px;max-width:1480px;margin:auto;min-height:calc(100vh - 68px)}}.sidebar,.rightbar{{padding:20px 14px;position:sticky;top:68px;align-self:start;max-height:calc(100vh - 68px);overflow:auto}}.sidebar{{border-right:1px solid var(--line)}}.rightbar{{border-left:1px solid var(--line)}}.sidebar h3,.rightbar h3{{margin:0 8px 10px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}}.category-button{{width:100%;height:38px;display:flex;align-items:center;gap:9px;border:0;border-radius:8px;background:transparent;color:var(--muted);padding:0 9px;cursor:pointer;text-align:left}}.category-button i{{width:7px;height:7px;border-radius:50%;background:var(--line)}}.category-button span{{flex:1}}.category-button b{{font-size:10px;font-weight:600}}.category-button:hover{{background:var(--soft);color:var(--text)}}.category-button.active{{background:#fff0eb;color:var(--accent);font-weight:700}}.category-button.active i{{background:var(--accent)}}.board-area{{padding:20px}}.board-summary{{display:flex;align-items:end;gap:26px;margin-bottom:16px}}.board-summary h1{{font-size:24px;margin:0 0 3px;letter-spacing:0}}.board-summary p{{margin:0;color:var(--muted)}}.stat{{margin-left:auto;text-align:right}}.stat b{{font-size:18px}}.stat small{{display:block;color:var(--muted)}}.board-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}}.board-card{{background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);overflow:hidden}}.board-card>header{{height:60px;padding:0 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line)}}.source-mark{{width:32px;height:32px;border-radius:8px;background:var(--soft);display:grid;place-items:center;color:var(--blue);font-weight:800}}.board-card h2{{font-size:14px;margin:0}}.board-card header p{{font-size:10px;color:var(--muted);margin:2px 0 0}}.live-dot{{width:7px;height:7px;border-radius:50%;background:var(--green);margin-left:auto}}ol{{list-style:none;padding:5px 0;margin:0}}.board-card li{{min-height:44px;display:flex;align-items:center;gap:8px;padding:6px 12px}}.board-card li:hover{{background:var(--soft)}}.board-card li em{{width:20px;color:#a0a5ad;font-style:normal;font-size:11px;text-align:center}}.board-card li:nth-child(-n+3) em{{color:var(--accent);font-weight:800}}.board-card li>div{{min-width:0;flex:1}}.board-card li a,.board-card li div>span{{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.board-card li a:hover{{color:var(--blue)}}.board-card li small{{display:block;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}}.board-card li strong{{font-size:10px;color:var(--muted)}}.portal{{position:relative;display:block;padding:10px 26px 10px 10px;margin-bottom:7px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}}.portal:hover{{border-color:var(--blue)}}.portal span{{font-weight:700;display:block}}.portal small{{color:var(--muted)}}.portal b{{position:absolute;right:9px;top:14px;color:var(--muted)}}.health{{list-style:none;padding:0;margin:0}}.health li{{display:grid;grid-template-columns:8px 1fr;gap:7px;padding:7px 4px;border-bottom:1px solid var(--line)}}.health i{{width:6px;height:6px;border-radius:50%;margin-top:5px;background:var(--muted)}}.health i.ok{{background:var(--green)}}.health i.error{{background:var(--accent)}}.health span{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}.health b{{grid-column:2;color:var(--muted);font-size:9px;font-weight:400}}details{{margin-top:12px;color:var(--muted);font-size:10px}}.ai-view{{display:none;max-width:980px;margin:auto;padding:24px}}.ai-view.active{{display:block}}.ai-head h1{{font-size:26px;margin:0}}.ai-head p{{color:var(--muted);margin:5px 0 18px}}.ai-card{{display:grid;grid-template-columns:40px 1fr;gap:14px;padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:10px;margin-bottom:10px}}.ai-card>em{{width:34px;height:34px;border-radius:8px;background:var(--soft);display:grid;place-items:center;font-style:normal;font-weight:700}}.ai-meta{{font-size:10px;color:var(--green)}}.ai-card h2{{font-size:17px;margin:4px 0}}.ai-card p{{margin:0;color:var(--muted)}}.ai-card footer{{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:11px}}.ai-card footer span{{color:var(--blue);font-weight:700;margin-right:8px}}.hidden{{display:none!important}}@media(min-width:1380px){{.board-grid{{grid-template-columns:repeat(3,minmax(0,1fr))}}}}@media(max-width:900px){{.dashboard{{grid-template-columns:130px 1fr}}.rightbar{{display:none}}.board-grid{{grid-template-columns:1fr}}}}@media(max-width:640px){{.app-head{{padding:0 12px}}.brand small,.updated{{display:none}}.dashboard{{display:block}}.sidebar{{position:static;display:flex;overflow:auto;border:0;padding:9px}}.sidebar h3{{display:none}}.category-button{{width:auto;flex:none}}.category-button b,.category-button i{{display:none}}.board-area{{padding:12px}}.search{{display:none}}}}
</style><style>
html[data-theme="light"]{{--bg:#f4f6f8;--panel:#fff;--soft:#f7f8fa;--text:#202328;--muted:#7b818a;--line:#e6e9ed;--accent:#ff5b35;--blue:#356ee8;--green:#14a47b;--shadow:0 2px 12px rgba(22,30,45,.055);color-scheme:light}}
html[data-theme="dark"]{{--bg:#111315;--panel:#1a1d21;--soft:#22262b;--text:#f2f3f5;--muted:#9aa1aa;--line:#2c3036;--accent:#ff7959;--blue:#79a4ff;--green:#4bcaa3;--shadow:none;color-scheme:dark}}
html[data-theme="graphite"]{{--bg:#1d2024;--panel:#272b30;--soft:#30353b;--text:#f3f4f5;--muted:#a8adb4;--line:#3a3f46;--accent:#ff7655;--blue:#75a0ef;--green:#58c6a5;--shadow:0 8px 24px rgba(0,0,0,.16);color-scheme:dark}}
html[data-theme="paper"]{{--bg:#f4f1e9;--panel:#fffefa;--soft:#f0ede5;--text:#242522;--muted:#76766f;--line:#dfddd4;--accent:#d95738;--blue:#386ca8;--green:#367d68;--shadow:0 2px 10px rgba(65,58,40,.06);color-scheme:light}}
.customize-button{{height:34px;display:flex;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--soft);color:var(--text);cursor:pointer;font-size:11px;font-weight:650;white-space:nowrap}}.customize-button[hidden]{{display:none!important}}.customize-button:hover,.customize-button.active{{border-color:var(--blue);color:var(--blue);background:var(--panel)}}.sliders-icon{{position:relative;width:15px;height:12px;display:block;background:linear-gradient(var(--muted),var(--muted)) 0 1px/15px 1px no-repeat,linear-gradient(var(--muted),var(--muted)) 0 6px/15px 1px no-repeat,linear-gradient(var(--muted),var(--muted)) 0 11px/15px 1px no-repeat}}.sliders-icon::before{{content:"";position:absolute;width:3px;height:3px;border:1px solid currentColor;border-radius:50%;background:var(--panel);left:3px;top:-1px;box-shadow:6px 5px 0 -1px var(--panel),6px 5px 0 0 currentColor,-3px 10px 0 -1px var(--panel),-3px 10px 0 0 currentColor}}.customizer{{position:fixed;z-index:20;right:18px;top:76px;width:310px;max-height:calc(100vh - 94px);overflow:auto;padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 60px rgba(15,20,30,.22)}}.customizer[hidden]{{display:none}}.customizer-head{{display:flex;align-items:center;margin-bottom:18px}}.customizer-head h2{{font-size:16px;margin:0}}.customizer-head button{{margin-left:auto;width:28px;height:28px;border:0;background:var(--soft);border-radius:7px;color:var(--muted);cursor:pointer}}.setting-group{{padding:14px 0;border-top:1px solid var(--line)}}.setting-group:first-of-type{{border-top:0;padding-top:0}}.setting-group h3{{font-size:11px;margin:0 0 10px;color:var(--muted)}}.layout-options{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}.layout-option{{min-height:64px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--soft);color:var(--muted);cursor:pointer;text-align:left}}.layout-option b{{display:block;color:var(--text);font-size:11px;margin-top:5px}}.layout-option.active{{border-color:var(--blue);box-shadow:inset 0 0 0 1px var(--blue)}}.layout-preview{{height:20px;display:grid;gap:2px}}.layout-preview i{{display:block;background:var(--muted);border-radius:2px;opacity:.5}}.layout-preview.adaptive{{grid-template-columns:1fr 1fr}}.layout-preview.fixed{{grid-template-columns:1fr 1fr}}.layout-preview.list{{grid-template-columns:1fr}}.layout-preview.compact{{grid-template-columns:1fr 1fr 1fr}}.theme-options,.card-palette{{display:flex;gap:9px;flex-wrap:wrap}}.theme-option,.color-option{{width:30px;height:30px;border:2px solid var(--panel);border-radius:50%;box-shadow:0 0 0 1px var(--line);cursor:pointer}}.theme-option.active,.color-option.active{{box-shadow:0 0 0 2px var(--blue)}}.theme-option[data-value="system"]{{background:linear-gradient(135deg,#fff 50%,#25282d 50%)}}.theme-option[data-value="light"]{{background:#fff}}.theme-option[data-value="dark"]{{background:#1a1d21}}.theme-option[data-value="graphite"]{{background:#30353b}}.theme-option[data-value="paper"]{{background:#f4f1e9}}.edit-toggle{{display:flex;align-items:center;gap:8px}}.switch{{position:relative;width:38px;height:22px;border:0;border-radius:11px;background:var(--line);cursor:pointer}}.switch::after{{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:.15s}}.switch.active{{background:var(--blue)}}.switch.active::after{{transform:translateX(16px)}}.setting-note{{font-size:10px;color:var(--muted);margin:8px 0 0}}.reset-button{{width:100%;height:34px;border:1px solid var(--line);border-radius:8px;background:var(--soft);color:var(--muted);cursor:pointer}}.board-grid[data-layout="adaptive"]{{grid-template-columns:repeat(auto-fit,minmax(310px,1fr))}}.board-grid[data-layout="fixed"]{{grid-template-columns:repeat(2,minmax(0,1fr))}}.board-grid[data-layout="list"]{{grid-template-columns:1fr}}.board-grid[data-layout="compact"]{{grid-template-columns:repeat(3,minmax(220px,1fr));gap:10px}}.board-grid[data-layout="compact"] .board-card li{{min-height:36px;padding-top:4px;padding-bottom:4px}}.board-grid[data-layout="compact"] .board-card li small{{display:none}}.board-card{{position:relative;background:var(--card-bg,var(--panel));grid-column:span var(--card-span,1)}}.board-card[data-visible-rows="5"] li:nth-child(n+6){{display:none}}.board-card[data-card-color="rose"]{{--card-bg:#fff1f0}}.board-card[data-card-color="sky"]{{--card-bg:#eef6ff}}.board-card[data-card-color="mint"]{{--card-bg:#eefaf5}}.board-card[data-card-color="amber"]{{--card-bg:#fff7e8}}.board-card[data-card-color="lavender"]{{--card-bg:#f5f1ff}}html[data-theme="dark"] .board-card[data-card-color="rose"],html[data-theme="graphite"] .board-card[data-card-color="rose"]{{--card-bg:#3a2728}}html[data-theme="dark"] .board-card[data-card-color="sky"],html[data-theme="graphite"] .board-card[data-card-color="sky"]{{--card-bg:#233141}}html[data-theme="dark"] .board-card[data-card-color="mint"],html[data-theme="graphite"] .board-card[data-card-color="mint"]{{--card-bg:#20352f}}html[data-theme="dark"] .board-card[data-card-color="amber"],html[data-theme="graphite"] .board-card[data-card-color="amber"]{{--card-bg:#3a3021}}html[data-theme="dark"] .board-card[data-card-color="lavender"],html[data-theme="graphite"] .board-card[data-card-color="lavender"]{{--card-bg:#302a41}}.board-card.dragging-source{{opacity:.24}}.drag-ghost{{position:fixed;z-index:100;pointer-events:none;margin:0;overflow:hidden;border-color:var(--blue);box-shadow:0 18px 48px rgba(16,24,40,.24);transform:rotate(.35deg) scale(1.015);will-change:left,top}}.drag-ghost ol{{max-height:140px;overflow:hidden}}.drag-handle,.card-style{{display:none;border:0;background:transparent;color:var(--muted);cursor:pointer}}.drag-handle{{font-size:18px;padding:6px;margin-left:-7px;cursor:grab;touch-action:none;user-select:none}}.drag-handle:active{{cursor:grabbing}}.card-style{{font-size:16px;padding:5px}}.editing .drag-handle,.editing .card-style{{display:block}}.editing .live-dot{{display:none}}.resize-grip{{display:none;position:absolute;right:1px;bottom:1px;width:20px;height:20px;border:0;background:linear-gradient(135deg,transparent 48%,var(--muted) 49%,var(--muted) 55%,transparent 56%,transparent 68%,var(--muted) 69%,var(--muted) 75%,transparent 76%);opacity:.65;cursor:nwse-resize;touch-action:none}}.editing .resize-grip{{display:block}}.resize-badge{{position:fixed;z-index:90;pointer-events:none;padding:5px 8px;border-radius:6px;background:var(--text);color:var(--panel);font-size:10px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.18)}}.color-popover{{position:fixed;z-index:30;display:flex;gap:8px;padding:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 35px rgba(0,0,0,.2)}}.color-popover[hidden]{{display:none}}.color-option[data-color="default"]{{background:var(--panel)}}.color-option[data-color="rose"]{{background:#fff1f0}}.color-option[data-color="sky"]{{background:#eef6ff}}.color-option[data-color="mint"]{{background:#eefaf5}}.color-option[data-color="amber"]{{background:#fff7e8}}.color-option[data-color="lavender"]{{background:#f5f1ff}}html[data-theme="dark"] .color-option[data-color="rose"],html[data-theme="graphite"] .color-option[data-color="rose"]{{background:#3a2728}}html[data-theme="dark"] .color-option[data-color="sky"],html[data-theme="graphite"] .color-option[data-color="sky"]{{background:#233141}}html[data-theme="dark"] .color-option[data-color="mint"],html[data-theme="graphite"] .color-option[data-color="mint"]{{background:#20352f}}html[data-theme="dark"] .color-option[data-color="amber"],html[data-theme="graphite"] .color-option[data-color="amber"]{{background:#3a3021}}html[data-theme="dark"] .color-option[data-color="lavender"],html[data-theme="graphite"] .color-option[data-color="lavender"]{{background:#302a41}}@media(max-width:1100px){{.board-grid[data-layout="compact"]{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}@media(max-width:760px){{.customizer{{right:10px;left:10px;width:auto}}.board-grid[data-layout]{{grid-template-columns:1fr}}.board-card{{grid-column:span 1!important}}}}
</style><style>
.signals-view{{max-width:1040px;margin:auto;padding:34px 28px 64px}}.signals-head{{display:flex;align-items:flex-end;gap:18px;margin-bottom:20px}}.signals-head h1{{font-size:27px;margin:0 0 5px}}.signals-head p{{margin:0;color:var(--muted)}}.quality-summary{{margin-left:auto;display:flex;gap:18px;text-align:right}}.quality-summary b{{display:block;font-size:17px}}.quality-summary span{{font-size:10px;color:var(--muted)}}.signal-list{{display:grid;gap:12px}}.signal-card{{display:grid;grid-template-columns:44px 1fr;gap:16px;padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)}}.signal-rank{{width:36px;height:36px;display:grid;place-items:center;border-radius:8px;background:var(--soft);font-weight:800;color:var(--muted)}}.signal-card:first-child .signal-rank{{background:var(--accent);color:#fff}}.signal-meta{{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:10px}}.signal-meta b{{color:var(--green);font-size:13px}}.signal-meta i{{width:3px;height:3px;border-radius:50%;background:var(--muted)}}.signal-card h2{{font-size:19px;line-height:1.35;margin:7px 0 6px}}.signal-card h2 a:hover{{color:var(--blue)}}.signal-card p{{margin:0;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}.signal-why{{display:grid;grid-template-columns:120px 1fr;gap:10px;margin-top:14px;padding:11px 12px;border-left:3px solid var(--blue);background:var(--soft);border-radius:0 7px 7px 0;font-size:11px}}.signal-why b{{color:var(--blue)}}.signal-card footer{{display:flex;align-items:center;gap:12px;margin-top:13px;padding-top:12px;border-top:1px solid var(--line)}}.signal-sources{{display:flex;gap:5px;flex:1;overflow:hidden}}.signal-sources span{{white-space:nowrap;padding:3px 7px;border-radius:5px;background:var(--soft);color:var(--muted);font-size:9px}}.signal-card footer>a{{color:var(--blue);font-size:11px;font-weight:650;white-space:nowrap}}.mode-switch{{flex:none;white-space:nowrap}}.mode-switch button{{white-space:nowrap}}.category-button span{{white-space:nowrap}}@media(max-width:1050px){{.app-head{{height:auto;min-height:68px;flex-wrap:wrap;gap:8px 12px;padding:10px 14px}}.brand{{min-width:140px;flex:1;order:1}}.customize-button{{order:2}}.updated{{display:none}}.mode-switch{{order:3}}.search{{order:4;flex:1;width:auto;min-width:180px;margin-left:0}}.dashboard{{display:block}}.sidebar{{position:sticky;top:116px;z-index:4;display:flex;gap:4px;max-height:none;padding:8px 12px;overflow-x:auto;background:var(--bg);border:0;border-bottom:1px solid var(--line)}}.sidebar h3{{display:none}}.category-button{{width:auto;min-width:max-content;flex:none;padding:0 10px}}.board-area{{padding:16px}}.rightbar{{display:block;position:static;max-height:none;border:0;border-top:1px solid var(--line);padding:18px}}.rightbar>.portal{{display:inline-block;width:190px;margin-right:6px;vertical-align:top}}.health{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}}}}@media(max-width:700px){{.brand{{min-width:120px}}.brand small{{display:none}}.mode-switch{{width:100%;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}}.mode-switch button{{min-width:0;padding:0 4px;font-size:10px}}.search{{min-width:0}}.signals-view{{padding:22px 14px 50px}}.signals-head{{align-items:flex-start;flex-direction:column}}.quality-summary{{margin-left:0;text-align:left}}.signal-card{{grid-template-columns:1fr;padding:16px}}.signal-rank{{display:none}}.signal-why{{grid-template-columns:1fr;gap:3px}}.signal-card footer{{align-items:flex-start;flex-direction:column}}.sidebar{{top:152px}}.health{{grid-template-columns:1fr}}}}
</style><style>
.learning-bar{{display:flex;align-items:center;gap:12px;margin:18px 0 14px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:9px}}.learning-progress{{flex:1;min-width:160px}}.learning-progress>div{{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:11px}}.learning-progress b{{color:var(--green)}}.progress-track{{height:5px;background:var(--soft);border-radius:3px;overflow:hidden}}.progress-track i{{display:block;width:0;height:100%;background:var(--green);border-radius:3px;transition:width .25s}}.unmastered-filter{{height:30px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:var(--soft);color:var(--muted);cursor:pointer;white-space:nowrap}}.unmastered-filter.active{{color:var(--blue);border-color:var(--blue);background:var(--panel)}}.quick-read{{display:grid;grid-template-columns:140px 1fr;gap:18px;margin-bottom:14px;padding:16px 18px;background:var(--panel);border:1px solid var(--line);border-radius:10px}}.quick-read header b{{display:block;font-size:14px}}.quick-read header span{{font-size:10px;color:var(--muted)}}.quick-read ol{{display:grid;gap:8px;padding:0;margin:0;list-style:none}}.quick-read li{{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start}}.quick-read li b{{width:20px;height:20px;display:grid;place-items:center;border-radius:5px;background:var(--accent);color:#fff;font-size:10px}}.quick-read li span{{font-size:11px;line-height:1.5}}.takeaway{{display:grid;grid-template-columns:86px 1fr;gap:10px;align-items:start;margin:10px 0 0;padding:11px 12px;background:var(--soft);border-radius:7px}}.takeaway>b{{font-size:10px;color:var(--accent)}}.takeaway p{{color:var(--text);font-weight:600;-webkit-line-clamp:3}}.knowledge-grid{{display:grid;grid-template-columns:1.35fr 1fr;gap:12px;margin-top:12px}}.knowledge-grid section{{padding:11px 12px;border:1px solid var(--line);border-radius:7px}}.knowledge-grid section>b{{display:block;margin-bottom:6px;color:var(--blue);font-size:10px}}.knowledge-grid ul{{display:grid;gap:5px;margin:0;padding-left:16px}}.knowledge-grid li,.knowledge-grid p{{font-size:11px;color:var(--muted)}}.knowledge-grid section>p{{margin:0 0 9px;display:block}}.signal-card.mastered{{opacity:.68}}.signal-card.mastered .signal-rank{{background:var(--green);color:#fff}}.signal-actions{{display:flex;gap:6px}}.signal-actions button{{height:28px;padding:0 9px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--muted);cursor:pointer;font-size:10px;white-space:nowrap}}.signal-actions button:hover{{border-color:var(--blue);color:var(--blue)}}.master-button.active{{background:var(--green);border-color:var(--green);color:#fff}}.evidence-panel{{margin-top:12px;padding:12px;background:var(--soft);border-radius:7px}}.evidence-panel[hidden]{{display:none}}.evidence-panel>b{{font-size:10px;color:var(--muted)}}.evidence-panel ul{{display:grid;gap:9px;margin:8px 0 0;padding:0;list-style:none}}.evidence-panel li{{display:grid;grid-template-columns:7px 1fr;gap:8px}}.evidence-panel li>i{{width:6px;height:6px;margin-top:6px;border-radius:50%;background:var(--green)}}.evidence-panel small{{display:block;color:var(--muted);font-size:9px}}.evidence-panel a,.evidence-panel li>div>span{{display:block;margin-top:2px;font-size:11px}}.evidence-panel a:hover{{color:var(--blue)}}.evidence-panel a b{{margin-left:4px;color:var(--blue)}}@media(max-width:700px){{.learning-bar{{align-items:stretch;flex-direction:column}}.quick-read{{grid-template-columns:1fr;gap:10px}}.takeaway{{grid-template-columns:1fr;gap:3px}}.knowledge-grid{{grid-template-columns:1fr}}.signal-actions{{width:100%}}.signal-actions button{{flex:1}}}}
</style><style>
:root{{--bg:#f3f5f7;--panel:#ffffff;--soft:#f6f7f9;--text:#171a1f;--muted:#69717d;--line:#dde2e8;--accent:#e65d3f;--blue:#356fd6;--green:#16866d;--shadow:0 1px 2px rgba(20,27,38,.04),0 8px 28px rgba(20,27,38,.06)}}
html,body{{font-size:14px;line-height:1.55}}
body{{min-height:100vh}}
button,a,input{{transition:border-color .16s ease,color .16s ease,background-color .16s ease,box-shadow .16s ease,opacity .16s ease}}
button:focus-visible,a:focus-visible,input:focus-visible{{outline:2px solid var(--blue);outline-offset:2px}}
.app-head{{height:56px;padding:0 max(24px,calc((100vw - 1120px)/2));gap:12px;background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:saturate(150%) blur(18px);border-color:var(--line)}}
.app-head .brand{{display:none}}
.mode-switch{{height:34px;padding:3px;border:0;background:var(--soft)}}
.mode-switch button{{height:28px;min-width:82px;padding:0 14px;border-radius:6px;font-size:12px;font-weight:650}}
.mode-switch button.active{{box-shadow:0 1px 3px rgba(16,24,40,.12)}}
.search{{width:260px;height:34px;margin-left:auto;padding:0 12px 0 34px;border-color:transparent;background:var(--soft);background-image:linear-gradient(45deg,transparent 46%,var(--muted) 47% 53%,transparent 54%),radial-gradient(circle at 45% 45%,transparent 42%,var(--muted) 44% 54%,transparent 56%);background-size:7px 7px,14px 14px;background-position:19px 20px,8px 9px;background-repeat:no-repeat}}
.search:hover{{border-color:var(--line)}}.search:focus{{box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}}
.updated{{padding-left:12px;border-left:1px solid var(--line);font-size:10px;font-variant-numeric:tabular-nums}}
.signals-view{{max-width:1120px;padding:34px 32px 72px}}
.signals-head{{align-items:center;margin-bottom:12px}}
.signals-head h1{{font-size:30px;line-height:1.2;font-weight:720;margin:0 0 7px}}
.signals-head p{{font-size:12px}}
.quality-summary{{gap:0}}
.quality-summary>div{{min-width:86px;padding:1px 18px;border-left:1px solid var(--line)}}
.quality-summary b{{font-size:20px;line-height:1.2;font-variant-numeric:tabular-nums}}
.quality-summary span{{font-size:10px}}
.topic-switcher{{display:flex;align-items:center;gap:6px;margin:0 0 8px;overflow-x:auto;padding:2px}}.topic-switcher>span{{color:var(--muted);font-size:10px;white-space:nowrap;margin-right:2px}}.topic-switcher button{{height:30px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--muted);font-size:10px;font-weight:650;white-space:nowrap;cursor:pointer}}.topic-switcher button.active{{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 10%,var(--panel));color:var(--blue)}}.topic-switcher .manage-topics{{margin-left:auto;color:var(--text)}}.topic-onboarding{{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:9px 11px;border-radius:7px;background:color-mix(in srgb,var(--blue) 8%,var(--panel));color:var(--muted);font-size:10px}}.topic-onboarding b{{color:var(--blue)}}.topic-onboarding button{{margin-left:auto;border:0;background:transparent;color:var(--muted);cursor:pointer}}.topic-onboarding[hidden]{{display:none}}.topic-empty{{padding:28px;border:1px dashed var(--line);border-radius:8px;text-align:center;color:var(--muted)}}.topic-empty[hidden]{{display:none}}
.topic-modal{{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(15,20,28,.48);backdrop-filter:blur(6px)}}.topic-modal[hidden]{{display:none}}.topic-dialog{{width:min(680px,100%);max-height:min(760px,calc(100vh - 40px));overflow:auto;padding:22px;border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:0 24px 80px rgba(0,0,0,.3)}}.topic-dialog header{{display:flex;align-items:start;gap:14px;margin-bottom:16px}}.topic-dialog header>div{{flex:1}}.topic-dialog h2{{margin:0;font-size:18px}}.topic-dialog header p{{margin:4px 0 0;color:var(--muted);font-size:11px}}.topic-dialog header button{{width:28px;height:28px;border:0;border-radius:6px;background:var(--soft);color:var(--muted);cursor:pointer}}.topic-rows{{display:grid;gap:9px}}.topic-row{{display:grid;grid-template-columns:150px 1fr 30px;gap:8px;padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--soft)}}.topic-row input{{height:34px;padding:0 9px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text);outline:0}}.topic-row input:focus{{border-color:var(--blue)}}.topic-row button{{border:0;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer}}.topic-row button:hover{{color:var(--accent);background:var(--panel)}}.topic-actions{{display:flex;align-items:center;gap:8px;margin-top:16px}}.topic-actions button{{height:34px;padding:0 12px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text);font-weight:650;cursor:pointer}}.topic-actions .save-topics{{margin-left:auto;border-color:var(--blue);background:var(--blue);color:#fff}}.topic-guide{{margin-top:12px;padding:10px 12px;border-left:3px solid var(--blue);background:var(--soft);color:var(--muted);font-size:10px}}.topic-status{{margin-top:10px;padding:8px 10px;border-radius:6px;background:color-mix(in srgb,var(--blue) 8%,var(--panel));color:var(--blue);font-size:10px}}.topic-status.error{{background:color-mix(in srgb,var(--accent) 9%,var(--panel));color:var(--accent)}}.topic-status[hidden]{{display:none}}
.learning-bar{{margin:0 0 14px;padding:10px 0;background:transparent;border:0;border-radius:0}}
.learning-progress>div{{font-size:11px}}.progress-track{{height:4px;background:var(--line)}}
.unmastered-filter{{height:30px;background:transparent;font-size:11px;font-weight:600}}
.quick-read{{grid-template-columns:150px 1fr;gap:22px;margin-bottom:18px;padding:20px 22px;background:#20262d;color:#f8fafc;border:1px solid #303843;border-radius:8px;box-shadow:0 12px 30px rgba(18,24,32,.14)}}
.quick-read header{{padding-right:18px;border-right:1px solid #3b444f}}
.quick-read header b{{font-size:16px}}.quick-read header span{{font-size:11px;color:#9faab8}}
.quick-read ol{{gap:10px}}.quick-read li{{grid-template-columns:24px 1fr;gap:10px}}
.quick-read li b{{width:22px;height:22px;border-radius:6px;background:var(--accent);font-size:11px}}
.quick-read li span{{font-size:12px;line-height:1.55;color:#edf1f5}}
.signal-list{{gap:14px}}
.signal-card{{grid-template-columns:46px 1fr;gap:18px;padding:22px 24px;border-radius:8px;box-shadow:var(--shadow);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}}
.signal-card:hover{{transform:translateY(-1px);border-color:color-mix(in srgb,var(--blue) 28%,var(--line));box-shadow:0 2px 4px rgba(20,27,38,.05),0 14px 34px rgba(20,27,38,.08)}}
.signal-rank{{width:38px;height:38px;border-radius:8px;font-size:13px;font-variant-numeric:tabular-nums}}
.signal-card:first-child .signal-rank{{background:var(--accent)}}
.signal-meta{{gap:8px;font-size:10px;text-transform:none}}.signal-meta b{{font-size:14px}}
.signal-card h2{{max-width:900px;margin:7px 0 12px;font-size:19px;line-height:1.38;font-weight:680}}
.takeaway{{grid-template-columns:96px 1fr;gap:14px;margin:0;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;background:transparent}}
.takeaway>b{{padding-top:2px;font-size:10px}}.takeaway p{{font-size:13px;line-height:1.6;font-weight:620}}
.knowledge-grid{{grid-template-columns:1.2fr 1fr;gap:0;margin-top:0}}
.knowledge-grid section{{padding:16px 18px 14px 0;border:0;border-radius:0}}
.knowledge-grid section+section{{padding-left:20px;border-left:1px solid var(--line)}}
.knowledge-grid section>b{{margin-bottom:7px;font-size:10px}}
.knowledge-grid ul{{gap:6px;padding-left:17px}}
.knowledge-grid li,.knowledge-grid p{{font-size:12px;line-height:1.55}}
.signal-why{{grid-template-columns:112px 1fr;gap:12px;margin-top:0;padding:12px 0;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;font-size:11px}}
.signal-card footer{{margin-top:0;padding-top:12px}}
.signal-sources{{gap:6px;flex-wrap:wrap}}.signal-sources span{{padding:3px 7px;border:1px solid var(--line);background:transparent;font-size:9px}}
.signal-actions button{{height:30px;padding:0 11px;background:transparent;font-size:10px;font-weight:600}}
.signal-actions button:hover{{background:var(--soft)}}
.master-button.active{{background:color-mix(in srgb,var(--green) 12%,var(--panel));border-color:var(--green);color:var(--green)}}
.signal-card.mastered{{opacity:1;border-color:color-mix(in srgb,var(--green) 35%,var(--line))}}
.signal-card.mastered .signal-content{{opacity:.76}}
.signal-card.mastered .signal-actions,.signal-card.mastered .signal-rank{{opacity:1}}
.evidence-panel{{margin-top:2px;padding:14px 0 4px;border-radius:0;background:transparent;border-top:1px dashed var(--line)}}
.evidence-panel li{{padding:2px 0}}.evidence-panel small{{font-size:10px}}.evidence-panel a,.evidence-panel li>div>span{{font-size:12px}}
.dashboard{{max-width:1560px}}
.sidebar,.rightbar{{top:56px;max-height:calc(100vh - 56px)}}
.board-area{{padding:26px 22px 60px}}
.board-card,.ai-card{{border-radius:8px;box-shadow:var(--shadow)}}
.board-card>header{{height:62px}}
.board-card li{{min-height:46px}}
.ai-view{{max-width:1080px;padding:34px 28px 64px}}
.ai-head h1{{font-size:28px}}.ai-card{{padding:20px}}
.customizer{{top:66px;border-radius:8px}}
@media(prefers-color-scheme:dark){{:root{{--bg:#15181c;--panel:#1d2126;--soft:#252a30;--text:#f2f4f7;--muted:#9ca5b1;--line:#323840;--accent:#f0785d;--blue:#7ca7ef;--green:#55c4a2;--shadow:0 1px 2px rgba(0,0,0,.2),0 10px 30px rgba(0,0,0,.2)}}}}
html[data-theme="light"]{{--bg:#f3f5f7;--panel:#fff;--soft:#f6f7f9;--text:#171a1f;--muted:#69717d;--line:#dde2e8;--accent:#e65d3f;--blue:#356fd6;--green:#16866d;--shadow:0 1px 2px rgba(20,27,38,.04),0 8px 28px rgba(20,27,38,.06)}}
html[data-theme="dark"],html[data-theme="graphite"]{{--bg:#15181c;--panel:#1d2126;--soft:#252a30;--text:#f2f4f7;--muted:#9ca5b1;--line:#323840;--accent:#f0785d;--blue:#7ca7ef;--green:#55c4a2;--shadow:0 1px 2px rgba(0,0,0,.2),0 10px 30px rgba(0,0,0,.2)}}
@media(max-width:1050px){{.app-head{{padding:10px 16px}}.signals-view{{padding-top:26px}}}}
@media(max-width:700px){{.app-head{{gap:8px}}.mode-switch{{width:100%}}.search{{width:100%;order:4}}.signals-view{{padding:24px 16px 48px}}.signals-head h1{{font-size:26px}}.quality-summary>div{{min-width:74px;padding:0 12px}}.quick-read{{grid-template-columns:1fr;padding:18px}}.quick-read header{{padding:0 0 12px;border-right:0;border-bottom:1px solid #3b444f}}.signal-card{{grid-template-columns:1fr;padding:18px}}.signal-rank{{display:none}}.knowledge-grid{{grid-template-columns:1fr}}.knowledge-grid section{{padding:14px 0}}.knowledge-grid section+section{{padding-left:0;border-left:0;border-top:1px solid var(--line)}}.signal-why{{grid-template-columns:1fr;gap:4px}}}}
@media(max-width:700px){{.topic-switcher .manage-topics{{margin-left:0}}.topic-row{{grid-template-columns:1fr 30px}}.topic-row input:nth-child(2){{grid-column:1/-1;grid-row:2}}}}
@media(prefers-reduced-motion:reduce){{*{{scroll-behavior:auto!important;transition:none!important;animation:none!important}}}}
</style><style>
:root{{--sidebar:#eef0f3;--list-bg:#f8f9fa;--selection:#dbe8fb;--selection-text:#174d96}}
html,body{{height:100%;overflow:hidden;background:var(--panel)}}
.app-head{{display:none}}
.desktop-shell{{display:grid;grid-template-columns:220px minmax(0,1fr);height:100vh;min-height:0;background:var(--panel)}}
.source-list{{display:flex;flex-direction:column;min-height:0;padding:18px 12px 12px;background:var(--sidebar);border-right:1px solid var(--line);user-select:none}}
.source-brand{{display:none}}
.source-list section{{margin-bottom:16px}}.source-list label{{display:block;padding:0 9px 6px;color:var(--muted);font-size:9px;font-weight:700}}
.source-list button{{width:100%;height:34px;display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:7px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--text);cursor:default;text-align:left;font-size:12px}}.source-list button:hover{{background:color-mix(in srgb,var(--text) 5%,transparent)}}.source-list button.active{{background:var(--selection);color:var(--selection-text);font-weight:650}}.source-list button i{{font-style:normal;text-align:center;color:var(--muted)}}.source-list button.active i{{color:inherit}}.source-list button b{{color:var(--muted);font-size:10px;font-weight:600}}
.source-topics button i{{width:7px;height:7px;justify-self:center;border-radius:50%;background:#aab0ba}}.source-topics button:nth-of-type(2) i{{background:#587fda}}.source-topics button:nth-of-type(3) i{{background:#9a6ec0}}.source-topics button:nth-of-type(4) i{{background:#4f9c84}}.source-topics button:nth-of-type(5) i{{background:#c78850}}.source-topics .manage-topics i{{width:auto;height:auto;background:transparent}}
.sidebar-learning{{margin-top:auto;padding:12px 9px 8px;border-top:1px solid var(--line)}}.sidebar-learning>div:first-child{{display:flex;justify-content:space-between;margin-bottom:7px;color:var(--muted);font-size:9px}}.sidebar-learning b{{color:var(--text)}}.sidebar-learning .unmastered-filter{{height:27px;margin-top:8px;padding:0;text-align:center;display:block;border:0;color:var(--muted);font-size:9px}}
.source-list .topic-onboarding{{position:relative;display:block;margin:6px 4px 0;padding:9px 24px 9px 10px;border:1px solid color-mix(in srgb,var(--blue) 18%,var(--line));border-radius:6px;background:color-mix(in srgb,var(--blue) 7%,var(--panel));font-size:9px;line-height:1.45}}.source-list .topic-onboarding b{{display:block;margin-bottom:2px}}.source-list .topic-onboarding button{{position:absolute;right:3px;top:3px;width:20px;height:20px;display:block;padding:0;text-align:center}}
.workspace-content{{min-width:0;min-height:0;overflow:hidden}}
.signals-view{{display:grid;grid-template-columns:330px minmax(0,1fr);height:100%;max-width:none;margin:0;padding:0;background:var(--panel)}}
.signal-browser{{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--list-bg);border-right:1px solid var(--line)}}.signal-browser>header{{height:76px;display:flex;align-items:center;gap:10px;padding:16px 16px 10px}}.signal-browser>header>div{{min-width:0;flex:1}}.signal-browser h1{{margin:0;font-size:20px;line-height:1.2;font-weight:720}}.signal-browser header p{{margin:4px 0 0;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.signal-browser header p b{{color:var(--text)}}.browser-filter{{display:none}}
.overview-return{{height:28px;display:flex;align-items:center;gap:4px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--muted);cursor:pointer;font-size:10px;white-space:nowrap}}.overview-return:hover{{border-color:color-mix(in srgb,var(--blue) 45%,var(--line));color:var(--blue)}}.overview-return span{{font-size:14px}}
.signal-search{{position:relative;margin:0 14px 10px}}.signal-search>span{{position:absolute;left:10px;top:6px;color:var(--muted);z-index:1}}.signal-search .search{{width:100%;height:30px;margin:0;padding:0 10px 0 28px;border:1px solid transparent;border-radius:6px;background:color-mix(in srgb,var(--text) 5%,var(--panel));background-image:none;font-size:10px}}.signal-search .search:focus{{border-color:color-mix(in srgb,var(--blue) 45%,var(--line));box-shadow:none}}
.signal-index-list{{flex:1;min-height:0;overflow-y:auto;padding:0 8px 12px}}.signal-index-item{{width:100%;display:block;padding:11px 10px;border:0;border-bottom:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:6px;background:transparent;color:var(--text);cursor:default;text-align:left}}.signal-index-item:hover{{background:color-mix(in srgb,var(--text) 4%,transparent)}}.signal-index-item.selected{{background:var(--selection)}}.index-copy{{display:block;min-width:0}}.index-context{{display:flex;align-items:center;gap:6px;margin-bottom:6px}}.index-topic{{min-width:0;overflow:hidden;color:var(--blue);font-size:8px;font-weight:650;white-space:nowrap;text-overflow:ellipsis}}.index-priority{{margin-left:auto;color:var(--green);font-size:8px;font-weight:650;white-space:nowrap}}.index-title{{display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:11px;line-height:1.4}}.index-summary{{display:-webkit-box;overflow:hidden;margin-top:5px;color:var(--muted);font-size:9px;line-height:1.45;-webkit-line-clamp:2;-webkit-box-orient:vertical}}.index-summary strong,.index-why strong{{margin-right:5px;color:var(--text);font-size:8px}}.index-value,.index-facts{{display:none}}.index-why{{display:none}}.index-meta{{display:flex;justify-content:space-between;gap:8px;margin-top:7px;color:var(--muted);font-size:8px}}.index-meta span{{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}}.index-meta span:last-child{{flex:none}}
.signal-browser .topic-empty{{margin:12px;padding:18px 12px;font-size:10px}}
.signal-detail{{min-width:0;min-height:0;overflow-y:auto;background:var(--panel)}}.signal-detail .signal-list{{display:block}}.signal-detail .signal-card{{display:none;max-width:760px;margin:0 auto;padding:34px 42px 52px;border:0;border-radius:0;background:transparent;box-shadow:none;transform:none}}.signal-detail .signal-card.selected{{display:block}}.signal-detail .signal-card:hover{{transform:none;border-color:transparent;box-shadow:none}}
.signals-view.overview{{display:block;overflow:hidden;background:var(--panel)}}.signals-view.overview .signal-browser{{height:100%;border-right:0;background:var(--panel)}}.signals-view.overview .signal-browser>header{{width:min(1180px,100%);height:96px;margin:0 auto;padding:26px 30px 12px}}.signals-view.overview .signal-browser h1{{font-size:26px}}.signals-view.overview .signal-browser header p{{font-size:10px}}.signals-view.overview .overview-return{{display:none}}.signals-view.overview .signal-search{{width:min(1120px,calc(100% - 60px));margin:0 auto 18px}}.signals-view.overview .signal-search .search{{height:34px}}.signals-view.overview .signal-index-list{{width:min(1180px,100%);margin:0 auto;padding:0 30px 30px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(318px,auto);gap:14px;align-content:start}}.signals-view.overview .signal-index-item{{position:relative;height:100%;overflow:hidden;padding:18px 19px 16px;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:0 1px 2px rgba(20,27,38,.04),0 7px 22px rgba(20,27,38,.045);cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}}.signals-view.overview .signal-index-item::before{{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--muted);opacity:.45}}.signals-view.overview .signal-index-item[data-attention="focus"]::before{{background:var(--green);opacity:1}}.signals-view.overview .signal-index-item::after{{content:"查看详情  →";position:absolute;right:18px;bottom:15px;color:var(--blue);font-size:9px;font-weight:650;opacity:0;transform:translateX(-4px);transition:opacity .18s ease,transform .18s ease}}.signals-view.overview .signal-index-item:hover{{z-index:1;transform:translateY(-2px);border-color:color-mix(in srgb,var(--blue) 35%,var(--line));box-shadow:0 2px 4px rgba(20,27,38,.05),0 16px 34px rgba(20,27,38,.11)}}.signals-view.overview .signal-index-item:hover::after{{opacity:1;transform:translateX(0)}}.signals-view.overview .signal-index-item.selected{{background:var(--panel)}}.signals-view.overview .index-context{{margin-bottom:10px}}.signals-view.overview .index-topic,.signals-view.overview .index-priority{{font-size:9px}}.signals-view.overview .index-priority{{padding:3px 6px;border-radius:4px;background:color-mix(in srgb,var(--green) 9%,transparent)}}.signals-view.overview .index-title{{font-size:14px;line-height:1.4}}.signals-view.overview .index-summary,.signals-view.overview .index-why{{display:grid;grid-template-columns:56px minmax(0,1fr);gap:7px;margin-top:10px;font-size:10px;line-height:1.5}}.signals-view.overview .index-summary strong,.signals-view.overview .index-why strong{{margin:0;color:var(--muted);font-size:9px;font-weight:650}}.signals-view.overview .index-summary>span,.signals-view.overview .index-why>span{{color:var(--text)}}.signals-view.overview .index-value{{display:grid;grid-template-columns:56px minmax(0,1fr);gap:7px;margin-top:11px;padding:9px 10px;border-left:2px solid var(--green);border-radius:0 5px 5px 0;background:color-mix(in srgb,var(--green) 7%,var(--panel));font-size:10px;line-height:1.5}}.signals-view.overview .index-value strong{{color:var(--green);font-size:9px}}.signals-view.overview .index-value>span{{color:var(--text);font-weight:620}}.signals-view.overview .index-facts{{display:grid;grid-template-columns:1fr 1.45fr;gap:12px;margin-top:11px}}.signals-view.overview .index-facts>span{{min-width:0}}.signals-view.overview .index-facts strong{{display:block;margin-bottom:5px;color:var(--muted);font-size:9px;font-weight:650}}.signals-view.overview .index-facts>span>span{{font-size:10px;color:var(--text)}}.tech-tags{{display:flex;gap:4px;flex-wrap:wrap}}.tech-tags span{{padding:2px 5px;border:1px solid color-mix(in srgb,var(--blue) 18%,var(--line));border-radius:4px;background:color-mix(in srgb,var(--blue) 5%,var(--panel));color:var(--blue)!important;font-size:8px!important;white-space:nowrap}}.signals-view.overview .index-meta{{margin-top:12px;padding-top:9px;padding-right:70px;border-top:1px solid var(--line);font-size:8px}}.signals-view.overview .signal-detail{{display:none}}
.signals-view.overview .signal-index-list{{grid-auto-rows:minmax(344px,auto)}}
.detail-kicker{{display:flex;align-items:center;margin-bottom:20px;color:var(--muted);font-size:9px;font-weight:650;text-transform:uppercase}}.detail-more{{margin-left:auto;width:28px;height:24px;border:0;border-radius:5px;background:transparent;color:var(--muted);cursor:pointer}}.detail-more:hover{{background:var(--soft)}}
.signal-detail .signal-meta{{margin-bottom:8px}}.signal-detail .signal-card h2{{margin:0 0 24px;font-size:27px;line-height:1.28;font-weight:730}}.signal-detail .takeaway{{grid-template-columns:104px 1fr;padding:15px 0}}.signal-detail .takeaway p{{font-size:14px;line-height:1.65}}.business-detail{{display:grid;grid-template-columns:.8fr 1.45fr 1.15fr;border-bottom:1px solid var(--line)}}.business-detail section{{min-width:0;padding:16px 16px 16px 0}}.business-detail section+section{{padding-left:16px;border-left:1px solid var(--line)}}.business-detail b{{display:block;margin-bottom:7px;color:var(--muted);font-size:9px}}.business-detail p{{margin:0;color:var(--text);font-size:11px;line-height:1.55}}.business-detail .business-value b{{color:var(--green)}}.business-detail .business-value p{{font-weight:620}}.signal-detail .knowledge-grid section{{padding-top:20px;padding-bottom:20px}}.signal-detail .knowledge-grid li,.signal-detail .knowledge-grid p{{font-size:12px;line-height:1.65}}.signal-detail .signal-why{{padding:16px 0}}.signal-detail .signal-card footer{{padding-top:16px}}.signal-detail .signal-actions button{{background:var(--panel)}}
.dashboard,.ai-view{{height:100%;max-width:none;overflow-y:auto}}.dashboard{{min-height:0}}.dashboard .sidebar,.dashboard .rightbar{{top:0;max-height:100vh}}.ai-view{{margin:0;padding:30px 34px 60px}}.ai-card{{max-width:940px}}.topic-modal{{backdrop-filter:blur(18px);background:rgba(30,33,38,.35)}}.topic-dialog{{border-radius:12px;box-shadow:0 28px 90px rgba(0,0,0,.28)}}
.board-summary .board-customize-button{{height:32px;display:flex;align-items:center;gap:7px;margin-left:auto;padding:0 11px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text);cursor:pointer;font-size:10px;font-weight:650;white-space:nowrap}}.board-summary .board-customize-button:hover,.board-summary .board-customize-button.active{{border-color:var(--blue);color:var(--blue);background:color-mix(in srgb,var(--blue) 5%,var(--panel))}}.board-summary .stat{{margin-left:0}}
@media(prefers-color-scheme:dark){{:root{{--sidebar:#202328;--list-bg:#181b1f;--selection:#23456f;--selection-text:#eef5ff}}}}html[data-theme="dark"],html[data-theme="graphite"]{{--sidebar:#202328;--list-bg:#181b1f;--selection:#23456f;--selection-text:#eef5ff}}
@media(max-width:980px){{.desktop-shell{{grid-template-columns:190px minmax(0,1fr)}}.signals-view{{grid-template-columns:300px minmax(0,1fr)}}.signals-view.overview .signal-index-list{{grid-template-columns:repeat(2,minmax(0,1fr))}}.signal-detail .signal-card{{padding-left:28px;padding-right:28px}}.signal-detail .signal-card h2{{font-size:23px}}.business-detail{{grid-template-columns:1fr 1fr}}.business-detail .business-value{{grid-column:1/-1;grid-row:1;padding-left:0;border-left:0;border-bottom:1px solid var(--line)}}}}
@media(max-width:760px){{html,body{{overflow:auto}}.app-head{{display:flex;position:sticky}}.desktop-shell{{display:block;height:auto}}.source-list{{display:none}}.workspace-content{{overflow:visible}}.signals-view{{display:block;height:auto}}.signal-browser{{border:0}}.signal-index-list{{max-height:none;overflow:visible}}.signal-detail{{display:none}}.dashboard,.ai-view,.product-view,.active-search-view{{height:auto;overflow:visible}}}}
</style><style>
.source-list span,.source-list b{{transition:opacity .14s ease}}
.source-list label{{font-size:10px;letter-spacing:.02em}}
.sidebar-head{{height:32px;display:flex;align-items:center;margin:0 2px 18px;padding-left:8px}}
.sidebar-title{{min-width:0;overflow:hidden;color:var(--text);font-size:11px;font-weight:750;white-space:nowrap}}
.sidebar-title small{{display:block;color:var(--muted);font-size:8px;font-weight:550}}
.sidebar-collapse{{width:28px!important;height:28px!important;display:grid!important;grid-template-columns:1fr!important;place-items:center;margin-left:auto;padding:0!important;border:1px solid var(--line)!important;background:color-mix(in srgb,var(--panel) 65%,transparent)!important;color:var(--muted)!important;cursor:pointer!important;font-size:17px!important}}
.sidebar-collapse:hover{{border-color:color-mix(in srgb,var(--blue) 45%,var(--line))!important;color:var(--blue)!important}}
.desktop-shell.sidebar-collapsed{{grid-template-columns:64px minmax(0,1fr)!important}}
.desktop-shell.sidebar-collapsed .source-list{{min-width:0;padding-left:9px;padding-right:9px}}
.desktop-shell.sidebar-collapsed .sidebar-head{{justify-content:center;padding:0}}
.desktop-shell.sidebar-collapsed .sidebar-title,.desktop-shell.sidebar-collapsed .source-list label,.desktop-shell.sidebar-collapsed .source-list button>span,.desktop-shell.sidebar-collapsed .source-list button>b,.desktop-shell.sidebar-collapsed .sidebar-learning,.desktop-shell.sidebar-collapsed .topic-onboarding{{display:none}}
.desktop-shell.sidebar-collapsed .sidebar-collapse{{margin:0}}
.desktop-shell.sidebar-collapsed .source-list section{{margin-bottom:12px}}
.desktop-shell.sidebar-collapsed .source-list section button{{height:36px;display:grid;grid-template-columns:1fr;padding:0;place-items:center}}
.desktop-shell.sidebar-collapsed .source-list section button i{{font-size:13px}}
.desktop-shell.sidebar-collapsed .source-topics button i{{width:8px;height:8px}}
.signals-view.overview .signal-index-list{{grid-template-columns:repeat(6,minmax(0,1fr));grid-auto-rows:auto;gap:14px;padding-bottom:44px}}
.signals-view.overview .signal-index-item{{grid-column:span 2;height:max-content;min-height:270px;padding:20px 20px 24px 78px}}
.signals-view.overview .signal-index-item:nth-child(1){{grid-column:1/-1;min-height:300px;padding:28px 32px 27px 108px;background:#1d2731;color:#fff;border-color:#344452;box-shadow:0 18px 42px rgba(20,27,38,.18)}}
.signals-view.overview .signal-index-item:nth-child(2),.signals-view.overview .signal-index-item:nth-child(3){{grid-column:span 3;min-height:330px;padding:22px 22px 19px 78px}}
.signals-view.overview .signal-index-item:nth-child(2) .index-title,.signals-view.overview .signal-index-item:nth-child(3) .index-title{{font-size:18px}}
.signals-view.overview .signal-index-item:nth-child(1)::before{{width:5px;background:#ff6546}}
.signals-view.overview .signal-index-item:nth-child(2)::before{{width:4px;background:#e1a33b;opacity:1}}
.signals-view.overview .signal-index-item:nth-child(3)::before{{width:4px;background:#5486d9;opacity:1}}
.hot-rank{{position:absolute;left:18px;top:20px;width:43px;display:flex;flex-direction:column;align-items:center;color:#5e6875}}
.hot-rank strong{{font:750 24px/1.05 ui-monospace,SFMono-Regular,Menlo,monospace}}
.hot-rank span{{margin-top:5px;font-size:10px;font-weight:700;white-space:nowrap}}
.signals-view.overview .signal-index-item:nth-child(1) .hot-rank{{left:30px;top:29px;width:54px;color:#ff8b72}}
.signals-view.overview .signal-index-item:nth-child(1) .hot-rank strong{{font-size:30px;color:#fff}}
.signals-view.overview .signal-index-item:nth-child(2) .hot-rank strong{{color:#b8760c}}
.signals-view.overview .signal-index-item:nth-child(3) .hot-rank strong{{color:#356fd6}}
.signals-view.overview .signal-index-item:nth-child(1) .index-copy{{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.8fr);column-gap:42px}}
.signals-view.overview .signal-index-item:nth-child(1) .index-context,.signals-view.overview .signal-index-item:nth-child(1) .index-title,.signals-view.overview .signal-index-item:nth-child(1) .index-summary{{grid-column:1}}
.signals-view.overview .signal-index-item:nth-child(1) .index-value,.signals-view.overview .signal-index-item:nth-child(1) .index-facts,.signals-view.overview .signal-index-item:nth-child(1) .index-why{{grid-column:2}}
.signals-view.overview .signal-index-item:nth-child(1) .index-value{{grid-row:1/3;margin:0;padding:14px 16px;border-left-color:#20a47d;background:#edf8f4}}
.signals-view.overview .signal-index-item:nth-child(1) .index-facts{{grid-row:3;margin-top:13px}}
.signals-view.overview .signal-index-item:nth-child(1) .index-why{{grid-row:4}}
.signals-view.overview .signal-index-item:nth-child(1) .index-title{{display:block;max-width:760px;overflow:visible;font-size:24px;line-height:1.32;color:#fff}}
.signals-view.overview .signal-index-item:nth-child(1) .index-topic{{color:#9dc4ff}}
.signals-view.overview .signal-index-item:nth-child(1) .index-priority{{color:#a8ead5;background:#25443e}}
.signals-view.overview .signal-index-item:nth-child(1) .index-summary strong,.signals-view.overview .signal-index-item:nth-child(1) .index-why strong,.signals-view.overview .signal-index-item:nth-child(1) .index-facts strong{{color:#b6c1cc}}
.signals-view.overview .signal-index-item:nth-child(1) .index-summary>span,.signals-view.overview .signal-index-item:nth-child(1) .index-why>span,.signals-view.overview .signal-index-item:nth-child(1) .index-facts>span>span{{color:#f5f7fa}}
.signals-view.overview .signal-index-item:nth-child(1) .index-value strong{{color:#08785e}}
.signals-view.overview .signal-index-item:nth-child(1) .index-value>span{{color:#17212b!important}}
.signals-view.overview .signal-index-item:nth-child(1) .tech-tags span{{border-color:#58708a;background:#2b3946;color:#d4e5ff!important}}
.signals-view.overview .signal-index-item:nth-child(1) .index-meta{{grid-column:1/-1;color:#c5cdd6;border-color:#52606d}}
.signals-view.overview .signal-index-item:nth-child(1)::after{{color:#a8caff}}
.signals-view.overview .signal-index-item:nth-child(n+4) .index-facts,.signals-view.overview .signal-index-item:nth-child(n+4) .index-why{{display:none}}
.signals-view.overview .signal-index-item:nth-child(n+4) .index-title{{font-size:15px}}
.signals-view.overview .index-topic,.signals-view.overview .index-priority{{font-size:11px}}
.signals-view.overview .index-summary,.signals-view.overview .index-value,.signals-view.overview .index-why{{font-size:12px;line-height:1.55}}
.signals-view.overview .index-summary strong,.signals-view.overview .index-value strong,.signals-view.overview .index-why strong,.signals-view.overview .index-facts strong{{font-size:10px}}
.signals-view.overview .index-facts>span>span{{font-size:12px}}
.signals-view.overview .tech-tags span{{font-size:10px!important}}
.signals-view.overview .index-meta{{font-size:10px}}
.heat-track{{position:absolute;left:19px;right:19px;bottom:11px;height:3px;overflow:hidden;border-radius:2px;background:color-mix(in srgb,var(--muted) 16%,transparent)}}
.heat-track i{{display:block;width:var(--heat);height:100%;border-radius:inherit;background:#89919b}}
.signals-view.overview .signal-index-item:nth-child(1) .heat-track{{left:108px;right:32px;background:#3b4652}}.signals-view.overview .signal-index-item:nth-child(1) .heat-track i{{background:#ff6546}}
.signals-view.overview .signal-index-item:nth-child(2) .heat-track i{{background:#e1a33b}}.signals-view.overview .signal-index-item:nth-child(3) .heat-track i{{background:#5486d9}}
.product-view{{height:100%;overflow-y:auto;overflow-x:hidden;background:#f3f6f9;padding:24px 26px 46px}}
.product-view-inner{{width:min(1440px,100%);margin:0 auto}}
.product-head{{display:flex;align-items:center;gap:24px;margin-bottom:16px;padding-bottom:15px;border-bottom:1px solid #d8e0e8}}
.product-head h1{{margin:0 0 5px;font-family:"Songti SC","STSong",serif;font-size:27px;font-weight:800;letter-spacing:0}}
.product-head p{{margin:0;color:#647180;font-size:11px}}
.product-stats{{display:flex;gap:8px;margin-left:auto;text-align:left}}
.product-stats span{{min-width:104px;padding:9px 12px;border-left:3px solid #2f6fdb;background:#fff;box-shadow:0 1px 2px rgba(22,34,51,.05)}}
.product-stats span:last-child{{border-left-color:#14a17d}}
.product-stats b{{display:block;font-size:20px;line-height:1;font-variant-numeric:tabular-nums}}
.product-stats small{{display:block;margin-top:5px;color:#788493;font-size:8px}}
.product-highlights{{display:grid;grid-template-columns:minmax(310px,.72fr) minmax(0,1.45fr);gap:12px;margin-bottom:12px}}
.hot-product{{position:relative;min-width:0;min-height:92px;display:grid;grid-template-columns:minmax(0,1fr) 64px;grid-template-rows:auto 1fr;overflow:hidden;border:1px solid #344454;border-left:4px solid #ff6546;border-radius:6px;background:#182430;color:#fff;box-shadow:0 8px 22px rgba(20,31,44,.16)}}
.hot-product::after{{content:"";position:absolute;right:86px;top:0;width:1px;height:100%;background:#344454;box-shadow:12px 0 #2b3a48,24px 0 #253441}}
.hot-product header{{display:flex;align-items:center;gap:7px;grid-column:1;padding:10px 14px 0;color:#ff9b83}}
.hot-product header b{{font-size:9px;letter-spacing:.06em}}.hot-product header small{{color:#8999a9;font-size:7px}}
.hot-product-pulse{{width:7px;height:7px;border-radius:50%;background:#ff6546;box-shadow:0 0 0 0 rgba(255,101,70,.5);animation:hot-product-pulse 1.8s ease-out infinite}}
@keyframes hot-product-pulse{{70%{{box-shadow:0 0 0 7px rgba(255,101,70,0)}}100%{{box-shadow:0 0 0 0 rgba(255,101,70,0)}}}}
.hot-product-main{{min-width:0;grid-column:1;padding:5px 14px 12px}}.hot-product-main>span{{display:block;color:#91a2b3;font-size:7px}}
.hot-product-main h2{{margin:2px 0 4px;overflow:hidden;font-size:17px;line-height:1.15;white-space:nowrap;text-overflow:ellipsis}}
.hot-product-main>a,.hot-product-main>span:last-child{{display:block;overflow:hidden;color:#bdc8d3;font-size:8px;white-space:nowrap;text-overflow:ellipsis}}
.hot-product-main>a:hover{{color:#fff}}.hot-product-main>a i{{margin-left:4px;color:#ff8c73;font-style:normal}}
.hot-product-score{{position:relative;z-index:1;grid-column:2;grid-row:1/3;display:grid;align-content:center;justify-items:center}}
.hot-product-score b{{font:800 27px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#ff785b}}.hot-product-score span{{margin-top:5px;color:#91a2b3;font-size:7px}}
.hot-product-open{{position:absolute;right:98px;top:11px;color:#dce5ed;font-size:8px;font-weight:700}}.hot-product-open:hover{{color:#ff8c73}}
.hot-product-idle{{border-left-color:#7b8794}}.hot-product-idle .hot-product-pulse{{background:#7b8794;animation:none}}
.focus-strip{{display:flex;min-width:0;min-height:92px;overflow-x:auto;border:1px solid #d8e0e8;background:#fff;box-shadow:0 2px 8px rgba(25,39,58,.04)}}
.focus-strip>header{{display:flex;min-width:126px;flex-direction:column;justify-content:center;padding:12px 14px;border-right:1px solid #324252;background:#202c38;color:#fff}}
.focus-strip>header strong{{font-size:11px}}.focus-strip>header small{{margin-top:3px;color:#aebac6;font-size:8px}}
.focus-product{{position:relative;min-width:84px;flex:1;padding:12px 10px 10px;border-left:1px solid #e3e8ee}}
.focus-product:first-of-type{{border-left:0}}
.focus-product:hover{{background:#f4f8fd}}.focus-product i{{display:block;width:18px;height:3px;margin-bottom:8px;background:#5e87d8}}
.focus-product:nth-child(3n) i{{background:#1b9a78}}.focus-product:nth-child(3n+1) i{{background:#e16a4a}}
.focus-product strong,.focus-product small,.focus-product>span{{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}}
.focus-product small{{margin:0 0 4px;color:#d64a2e;font-size:6px;font-weight:800;letter-spacing:.03em}}
.focus-product strong{{font-size:9px;line-height:1.25}}.focus-product>span{{margin-top:5px;color:#7b8794;font-size:6px}}
.focus-product[data-hot-type="desktop"] i,.focus-product[data-hot-type="coding"] i{{background:#527fd8}}
.focus-product[data-hot-type="mobile"] i,.focus-product[data-hot-type="data"] i{{background:#16a07b}}
.focus-product[data-hot-type="platform"] i,.focus-product[data-hot-type="governance"] i{{background:#ec684b}}
.product-toolbar{{display:grid;grid-template-columns:auto minmax(0,1fr) auto 210px;align-items:end;gap:10px;margin-bottom:12px;padding:11px 12px;border:1px solid #d8e0e8;background:#fff;box-shadow:0 2px 8px rgba(25,39,58,.04)}}
.filter-block{{min-width:0}}.filter-block>span{{display:block;margin:0 0 5px 2px;color:#7a8694;font-size:8px;font-weight:750}}
.matrix-filters{{display:flex;min-width:0;padding:2px;border-radius:5px;background:#edf1f5}}
.matrix-filters button{{height:28px;padding:0 10px;border:0;border-radius:4px;background:transparent;color:#65717e;cursor:pointer;font-size:9px;font-weight:700;white-space:nowrap}}
.matrix-filters button:hover{{color:#1d2936}}.matrix-filters button.active{{background:#202b37;color:#fff;box-shadow:0 1px 3px rgba(13,25,39,.18)}}
.company-picker-button{{height:33px;padding:0 11px;border:1px solid #cfd8e2;border-radius:5px;background:#fff;color:#285fb9;font-size:9px;font-weight:750;cursor:pointer;white-space:nowrap}}
.company-picker-button:hover,.company-picker-button[aria-expanded="true"]{{border-color:#2f6fdb;background:#f3f7ff;color:#1f5fc8}}
.company-picker-button span{{display:inline-block;margin-left:4px;padding:2px 5px;border-radius:8px;background:#e8f0ff;font-variant-numeric:tabular-nums}}
.product-search{{width:100%;height:33px;margin:0;padding:0 10px;border:1px solid #cfd8e2;border-radius:5px;background:#f8fafc;color:var(--text);outline:0;font-size:10px}}
.product-search:focus{{border-color:#2f6fdb;background:#fff;box-shadow:0 0 0 3px rgba(47,111,219,.1)}}
.company-picker{{margin:-3px 0 12px;border:1px solid #cfd8e2;border-radius:6px;background:#fff;box-shadow:0 12px 30px rgba(28,43,61,.12)}}
.company-picker[hidden]{{display:none}}
.company-picker-head{{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid #e1e7ed}}
.company-picker-search{{width:min(340px,100%);height:32px;padding:0 10px;border:1px solid #cfd8e2;border-radius:5px;background:#f7f9fb;color:var(--text);outline:0;font-size:10px}}
.company-picker-search:focus{{border-color:var(--blue);background:var(--panel)}}
.company-picker-actions{{display:flex;gap:6px;margin-left:auto}}
.company-picker-actions button{{height:28px;padding:0 9px;border:1px solid #d5dde5;border-radius:4px;background:#fff;color:#667383;font-size:9px;font-weight:700;cursor:pointer}}
.company-picker-actions button:last-child{{border-color:#2f6fdb;background:#2f6fdb;color:#fff}}
.company-picker-actions button:hover{{border-color:var(--blue);color:var(--blue)}}
.company-picker-actions button:last-child:hover{{border-color:#2258b5;background:#2258b5;color:#fff}}
.company-picker-count{{min-width:88px;color:var(--muted);font-size:9px;text-align:right}}
.company-options{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));max-height:190px;gap:4px;overflow:auto;padding:9px}}
.company-picker-empty{{padding:18px 12px;color:#7b8794;font-size:9px;text-align:center}}
.company-picker-empty[hidden]{{display:none}}
.company-option{{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:7px;min-height:38px;padding:6px 8px;border:1px solid transparent;border-radius:5px;cursor:pointer}}
.company-option:hover{{border-color:#d7e0e9;background:#f5f8fc}}.company-option.hidden{{display:none}}
.company-option input{{position:absolute;opacity:0;pointer-events:none}}
.company-check{{width:15px;height:15px;display:grid;place-items:center;border:1px solid #bdc8d4;border-radius:3px;background:#fff}}
.company-option input:checked+.company-check{{border-color:#2f6fdb;background:#2f6fdb}}
.company-option input:checked+.company-check::after{{content:"✓";color:#fff;font-size:10px;font-weight:800}}
.company-name{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:700}}
.company-option small{{color:var(--muted);font-size:8px}}
.product-workspace{{display:grid;grid-template-columns:minmax(680px,1fr) 282px;gap:12px;align-items:start;min-width:0}}
.product-workspace main{{min-width:0}}
.matrix-wrap{{max-height:calc(100vh - 248px);overflow:auto;border:1px solid #d5dde5;border-radius:6px;background:#fff;box-shadow:0 3px 12px rgba(25,39,58,.05)}}
.product-table{{width:100%;min-width:1080px;border-collapse:separate;border-spacing:0;table-layout:fixed}}
.product-table th,.product-table td{{border-bottom:1px solid #e1e7ed;border-right:1px solid #e6ebf0;text-align:left;vertical-align:top}}
.product-table thead th{{position:sticky;top:0;z-index:3;height:42px;padding:0 12px;border-bottom-color:#cbd5df;background:#edf2f6;color:#52606f;font-size:8px;font-weight:800}}
.product-table thead th:first-child{{left:0;z-index:5;width:142px;background:#e8eef4}}.product-table thead th:last-child,.product-table tbody td:last-child{{border-right:0}}
.product-table tbody th{{position:sticky;left:0;z-index:2;height:74px;padding:12px;background:#f8fafc;font-size:10px}}
.product-table tbody tr:nth-child(even) th{{background:#f2f6f9}}
.product-table tbody tr:hover th,.product-table tbody tr:hover td{{background:#f1f6fd!important}}
.product-table tbody tr.hottest-vendor th{{background:#fff7ed!important;box-shadow:inset 4px 0 #ff6546}}
.product-table td.hottest-product{{position:relative;background:#fff3e5!important;box-shadow:inset 0 0 0 2px #ff7557}}
.product-table td.hottest-product a{{padding-right:41px;color:#9c321c}}
.hot-cell-badge{{position:absolute;right:7px;top:7px;padding:2px 4px;border-radius:3px;background:#ff6546;color:#fff;font:800 6px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;font-style:normal;letter-spacing:.04em}}
.product-table tbody th>span:last-child{{display:inline-block;vertical-align:middle}}
.vendor-mark{{width:27px;height:27px;display:inline-grid!important;place-items:center;margin-right:8px;border:1px solid #cbd6e2;border-radius:5px;background:#fff;color:#2f6fdb;font-weight:800;box-shadow:0 1px 2px rgba(20,35,52,.05)}}
.product-table tbody th small{{display:block;margin-top:2px;color:var(--muted);font-size:8px;font-weight:500}}
.product-table td{{height:74px;padding:11px 12px;background:#fff}}
.product-table tbody tr:nth-child(even) td{{background:#fbfcfd}}
.product-table [data-product-column="governance"],.product-table [data-product-type="governance"]{{background:#f0f8f5}}
.product-table [data-product-column="data"],.product-table [data-product-type="data"]{{background:#f2f6fc}}
.product-table td a{{display:flex;align-items:start;gap:5px;font-size:9px;font-weight:750;line-height:1.35}}
.product-table td a span{{min-width:0}}.product-table td a i{{margin-left:auto;color:var(--muted);font-style:normal}}
.product-table td a:hover{{color:#2f6fdb}}.product-table td small{{display:block;margin-top:8px;color:#86919d;font-size:7px}}
.product-table td small.has-signal{{display:inline-block;padding:2px 5px;border-radius:3px;background:#e6f7f1;color:#087e61;font-weight:700}}.product-table td small b{{font-size:9px}}
.product-empty-cell{{color:var(--muted);font-size:9px}}
.matrix-empty{{padding:30px;border:1px dashed var(--line);background:var(--panel);text-align:center;color:var(--muted);font-size:11px}}
.matrix-empty[hidden]{{display:none}}
.product-feed{{max-height:calc(100vh - 248px);overflow:auto;border:1px solid #d5dde5;border-top:3px solid #202c38;border-radius:6px;background:#fff;box-shadow:0 3px 12px rgba(25,39,58,.05)}}
.product-feed>header{{position:sticky;top:0;z-index:2;padding:13px 14px;border-bottom:1px solid #e1e7ed;background:#fff}}.product-feed h2{{margin:0;font-size:12px}}.product-feed header p{{margin:3px 0 0;color:#7b8794;font-size:8px}}
.product-feed-item{{display:block;padding:12px 14px;border-bottom:1px solid #e5eaf0}}
.product-feed-item:hover{{background:#f4f8fd}}.product-feed-item>span{{display:flex;gap:6px;margin-bottom:5px;color:#2f6fdb;font-size:8px}}
.product-feed-item>span b{{color:var(--text)}}.product-feed-item>strong{{display:-webkit-box;overflow:hidden;font-size:10px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}}
.product-feed-item>small{{display:block;margin-top:5px;color:var(--muted);font-size:8px}}
.product-feed-empty{{margin:12px;border:1px dashed var(--line)}}
.active-search-view{{height:100%;overflow-y:auto;background:var(--bg);padding:34px 34px 64px}}
.active-search-inner{{width:min(1080px,100%);margin:0 auto}}
.active-search-head{{display:flex;align-items:end;gap:24px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--line)}}
.active-search-head h1{{margin:0 0 4px;font-size:27px}}.active-search-head p{{margin:0;color:var(--muted);font-size:11px}}
.search-live-badge{{display:flex;align-items:center;gap:7px;margin-left:auto;color:var(--green);font-size:10px;font-weight:700;white-space:nowrap}}.search-live-badge i{{width:7px;height:7px;border-radius:50%;background:var(--green)}}
.active-search-form{{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;padding:16px;border:1px solid var(--line);background:var(--panel)}}
.active-search-input-wrap{{position:relative}}.active-search-input-wrap>span{{position:absolute;left:13px;top:10px;color:var(--muted);font-size:15px}}
.active-search-input{{width:100%;height:42px;padding:0 14px 0 38px;border:1px solid var(--line);border-radius:6px;background:var(--soft);color:var(--text);outline:0;font-size:13px}}.active-search-input:focus{{border-color:var(--blue);background:var(--panel);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 12%,transparent)}}
.active-search-submit{{height:42px;padding:0 18px;border:0;border-radius:6px;background:var(--blue);color:#fff;font-size:11px;font-weight:700;cursor:pointer}}.active-search-submit:disabled{{opacity:.58;cursor:wait}}
.active-search-controls{{grid-column:1/-1;display:flex;align-items:center;gap:14px}}
.search-filter-group{{display:flex;align-items:center;gap:6px}}.search-filter-group>span{{color:var(--muted);font-size:9px;font-weight:700}}
.active-search-kinds,.active-search-ranges{{display:flex;padding:3px;border:1px solid var(--line);background:var(--soft)}}.active-search-kinds button,.active-search-ranges button{{height:26px;padding:0 10px;border:0;background:transparent;color:var(--muted);font-size:9px;font-weight:700;cursor:pointer;white-space:nowrap}}.active-search-kinds button.active,.active-search-ranges button.active{{background:var(--panel);color:var(--text);box-shadow:0 1px 3px rgba(20,27,38,.1)}}
.search-hint{{margin-left:auto;color:var(--muted);font-size:9px}}
.search-history{{display:flex;align-items:center;gap:7px;min-height:38px;padding:9px 0;overflow-x:auto}}.search-history>span{{color:var(--muted);font-size:9px;white-space:nowrap}}.search-history button{{height:24px;padding:0 8px;border:1px solid var(--line);border-radius:5px;background:var(--panel);color:var(--muted);font-size:9px;white-space:nowrap;cursor:pointer}}.search-history button:hover{{border-color:var(--blue);color:var(--blue)}}
.search-state{{margin-top:8px;border-top:3px solid #202a34;background:var(--panel)}}.search-state[hidden]{{display:none}}
.search-initial{{padding:34px 28px 38px}}.search-initial h2{{margin:0 0 5px;font-size:17px}}.search-initial>p{{margin:0;color:var(--muted);font-size:11px}}.search-suggestions{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:24px;border:1px solid var(--line)}}.search-suggestions button{{min-height:72px;padding:13px 15px;border:0;border-right:1px solid var(--line);background:transparent;color:var(--text);text-align:left;cursor:pointer}}.search-suggestions button:last-child{{border-right:0}}.search-suggestions button:hover{{background:var(--soft)}}.search-suggestions b,.search-suggestions small{{display:block}}.search-suggestions b{{font-size:11px}}.search-suggestions small{{margin-top:4px;color:var(--muted);font-size:9px}}
.search-loading{{padding:28px}}.search-loading header{{display:flex;align-items:center;gap:9px;margin-bottom:18px;font-size:11px;font-weight:700}}.search-loading header i{{width:12px;height:12px;border:2px solid var(--line);border-top-color:var(--blue);border-radius:50%;animation:search-spin .7s linear infinite}}.search-loading-lines{{display:grid;gap:12px}}.search-loading-lines i{{display:block;height:58px;background:linear-gradient(90deg,var(--soft),color-mix(in srgb,var(--blue) 5%,var(--panel)),var(--soft));background-size:200% 100%;animation:search-pulse 1.2s ease infinite}}@keyframes search-spin{{to{{transform:rotate(360deg)}}}}@keyframes search-pulse{{to{{background-position:-200% 0}}}}
.search-results-head{{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line)}}.search-results-head strong{{font-size:12px}}.search-results-head span{{color:var(--muted);font-size:9px}}.search-results-head time{{margin-left:auto;color:var(--muted);font-size:9px}}
.search-result-list{{display:grid}}.search-result{{display:grid;grid-template-columns:92px minmax(0,1fr) 30px;gap:14px;min-height:112px;padding:17px 16px;border-bottom:1px solid var(--line)}}.search-result:hover{{background:var(--soft)}}.search-result-source{{min-width:0}}.search-result-source b,.search-result-source span{{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}.search-result-source b{{color:var(--blue);font-size:9px}}.search-result-source span{{margin-top:5px;color:var(--muted);font-size:8px}}.search-result-copy{{min-width:0}}.search-result-copy h2{{margin:0;font-size:14px;line-height:1.4}}.search-result-copy h2 a:hover{{color:var(--blue)}}.search-result-copy p{{display:-webkit-box;overflow:hidden;margin:7px 0 0;color:var(--muted);font-size:10px;line-height:1.5;-webkit-line-clamp:2;-webkit-box-orient:vertical}}.search-result-copy small{{display:block;margin-top:8px;color:var(--green);font-size:8px}}.search-result-open{{align-self:center;width:28px;height:28px;display:grid;place-items:center;border:1px solid var(--line);border-radius:6px;color:var(--muted);font-size:12px}}.search-result-open:hover{{border-color:var(--blue);color:var(--blue);background:var(--panel)}}
.search-error,.search-empty{{padding:42px 24px;text-align:center}}.search-error b,.search-empty b{{display:block;font-size:14px}}.search-error p,.search-empty p{{margin:6px 0 0;color:var(--muted);font-size:10px}}.search-error b{{color:var(--accent)}}
@media(max-width:1120px){{.product-highlights{{grid-template-columns:minmax(300px,.72fr) minmax(0,1.3fr)}}.product-toolbar{{grid-template-columns:auto minmax(0,1fr) auto}}.product-search{{grid-column:1/-1}}.company-options{{grid-template-columns:repeat(3,minmax(0,1fr))}}.product-workspace{{grid-template-columns:1fr}}.matrix-wrap{{max-height:calc(100vh - 298px)}}.product-feed{{display:grid;grid-template-columns:repeat(2,1fr);max-height:none;margin-top:12px}}.product-feed>header,.product-feed-empty{{grid-column:1/-1}}}}
@media(max-width:1120px) and (min-width:761px){{.signals-view.overview .signal-index-list{{grid-template-columns:repeat(2,minmax(0,1fr))}}.signals-view.overview .signal-index-item,.signals-view.overview .signal-index-item:nth-child(2),.signals-view.overview .signal-index-item:nth-child(3){{grid-column:span 1}}.signals-view.overview .signal-index-item:nth-child(1){{grid-column:1/-1;padding-left:92px}}.signals-view.overview .signal-index-item:nth-child(1) .index-copy{{display:block}}.signals-view.overview .signal-index-item:nth-child(1) .index-value{{margin-top:12px}}.signals-view.overview .signal-index-item:nth-child(1) .heat-track{{left:92px}}}}
@media(max-width:760px){{.signals-view.overview .signal-index-list{{display:grid;grid-template-columns:1fr;padding:0 14px 30px}}.signals-view.overview .signal-index-item,.signals-view.overview .signal-index-item:nth-child(1),.signals-view.overview .signal-index-item:nth-child(2),.signals-view.overview .signal-index-item:nth-child(3){{grid-column:1;min-height:0;padding:18px 18px 22px 68px}}.signals-view.overview .signal-index-item:nth-child(1) .index-copy{{display:block}}.signals-view.overview .signal-index-item:nth-child(1) .index-title{{font-size:18px}}.signals-view.overview .signal-index-item:nth-child(1) .heat-track{{left:68px;right:18px}}.hot-rank,.signals-view.overview .signal-index-item:nth-child(1) .hot-rank{{left:15px;top:19px;width:40px}}.product-view,.active-search-view{{height:auto;padding:18px 12px 36px}}.product-head,.active-search-head{{align-items:start;flex-direction:column}}.product-stats,.search-live-badge{{margin-left:0;text-align:left}}.product-highlights{{grid-template-columns:1fr}}.focus-strip>header{{min-width:125px}}.product-toolbar{{grid-template-columns:1fr;padding:10px}}.product-toolbar>*{{grid-column:1}}.matrix-filters{{overflow-x:auto}}.product-search{{width:100%;margin-left:0}}.company-picker-head{{align-items:stretch;flex-direction:column}}.company-picker-search{{width:100%}}.company-picker-actions{{margin-left:0}}.company-picker-count{{text-align:left}}.company-options{{grid-template-columns:repeat(2,minmax(0,1fr))}}.matrix-wrap{{max-width:100%;max-height:none}}.product-feed{{grid-template-columns:1fr}}.active-search-form{{grid-template-columns:1fr}}.active-search-submit{{width:100%}}.active-search-controls{{align-items:flex-start;flex-direction:column}}.search-filter-group{{width:100%;align-items:flex-start;flex-direction:column}}.active-search-ranges{{max-width:100%;overflow-x:auto}}.search-hint{{margin-left:0}}.search-suggestions{{grid-template-columns:1fr}}.search-suggestions button{{border-right:0;border-bottom:1px solid var(--line)}}.search-suggestions button:last-child{{border-bottom:0}}.search-result{{grid-template-columns:76px minmax(0,1fr) 28px;gap:9px;padding-left:10px;padding-right:10px}}}}
</style></head><body><header class="app-head"><div class="brand"><div class="brand-mark">R</div><div><strong>热点雷达</strong><small>Daily Signal</small></div></div><div class="mode-switch" role="tablist" aria-label="内容视图"><button class="active" role="tab" aria-selected="true" data-mode="signals">今日信号</button><button role="tab" aria-selected="false" data-mode="search">主动搜索</button><button role="tab" aria-selected="false" data-mode="products">产品矩阵</button><button role="tab" aria-selected="false" data-mode="boards">探索榜单</button><button role="tab" aria-selected="false" data-mode="ai">技术雷达</button></div><button class="customize-button" id="customize-button" title="自定义看板的布局、主题和卡片" aria-label="自定义看板" hidden><span class="sliders-icon" aria-hidden="true"></span><span>自定义</span></button><span class="updated">{stamp}</span></header>
<aside class="customizer" id="customizer" hidden><div class="customizer-head"><h2>自定义看板</h2><button id="close-customizer" title="关闭" aria-label="关闭">×</button></div><section class="setting-group"><h3>排版样式</h3><div class="layout-options"><button class="layout-option" data-layout-option="adaptive"><span class="layout-preview adaptive"><i></i><i></i></span><b>自适应瀑布流</b></button><button class="layout-option" data-layout-option="fixed"><span class="layout-preview fixed"><i></i><i></i></span><b>固定双列</b></button><button class="layout-option" data-layout-option="list"><span class="layout-preview list"><i></i></span><b>单列阅读</b></button><button class="layout-option" data-layout-option="compact"><span class="layout-preview compact"><i></i><i></i><i></i></span><b>紧凑三列</b></button></div></section><section class="setting-group"><h3>整体主题</h3><div class="theme-options"><button class="theme-option" data-value="system" title="跟随系统"></button><button class="theme-option" data-value="light" title="明亮"></button><button class="theme-option" data-value="dark" title="深色"></button><button class="theme-option" data-value="graphite" title="石墨"></button><button class="theme-option" data-value="paper" title="纸张"></button></div></section><section class="setting-group"><h3>卡片布局</h3><div class="edit-toggle"><button class="switch" id="edit-toggle" role="switch" aria-checked="false"></button><span>编辑卡片位置与大小</span></div><p class="setting-note">开启后，按住卡片左上角拖动柄移动位置；拖动右下角调整宽度和显示条数。</p></section><section class="setting-group"><button class="reset-button" id="reset-board">恢复默认布局</button></section></aside><div class="color-popover" id="color-popover" hidden><button class="color-option" data-color="default" title="默认"></button><button class="color-option" data-color="rose" title="浅红"></button><button class="color-option" data-color="sky" title="浅蓝"></button><button class="color-option" data-color="mint" title="浅绿"></button><button class="color-option" data-color="amber" title="浅黄"></button><button class="color-option" data-color="lavender" title="浅紫"></button></div>
<div class="desktop-shell"><aside class="source-list"><div class="sidebar-head"><div class="sidebar-title">SIGNAL DESK<small>技术情报工作台</small></div><button class="sidebar-collapse" id="sidebar-collapse" type="button" title="折叠导航栏" aria-label="折叠导航栏" aria-expanded="true">‹</button></div><section><label>资料库</label><button class="source-nav active" data-workspace-mode="signals" title="今日热点"><i>⌁</i><span>今日热点</span><b>{len(signal_items[:8])}</b></button><button class="source-nav" data-workspace-mode="search" title="主动搜索"><i>⌕</i><span>主动搜索</span></button><button class="source-nav" data-workspace-mode="products" title="产品矩阵"><i>▤</i><span>产品矩阵</span><b>{len(PRODUCT_MATRIX)}</b></button><button class="source-nav" data-workspace-mode="boards" title="探索榜单"><i>▦</i><span>探索榜单</span><b>{len(report.get("news_boards", []))}</b></button><button class="source-nav" data-workspace-mode="ai" title="技术雷达"><i>◇</i><span>技术雷达</span><b>{len(report.get("items", [])[:10])}</b></button></section><section class="source-topics"><label>关注主题</label><button class="active" data-topic="all" title="全部主题"><i></i><span>全部主题</span></button>{topic_buttons}<button class="manage-topics" id="manage-topics" title="管理主题"><i>＋</i><span>管理主题</span></button></section><div class="sidebar-learning"><div><span>今日学习</span><b id="mastered-count">0 / {len(signal_items[:8])}</b></div><div class="progress-track"><i id="mastered-progress"></i></div><button class="unmastered-filter" id="unmastered-filter" type="button">只看未掌握</button></div><div class="topic-onboarding" id="topic-onboarding"><b>提示</b><span>选择主题后，热点、榜单、雷达和产品矩阵会同步变化。</span><button id="dismiss-topic-guide" aria-label="知道了">×</button></div></aside><div class="workspace-content">
<section id="signals-view" class="signals-view overview"><section class="signal-browser"><header><div><h1>今日热点</h1><p>按综合热度排序 · 从 <b>{ok_count}</b> 个来源中筛选出 <b>{len(signal_items[:8])}</b> 条关键技术动态 · 已过滤 {rejected_count} 条低质量内容</p></div><button class="browser-filter" id="browser-filter" title="筛选未掌握">⌄</button><button class="overview-return" id="overview-return" type="button" title="返回热点总览"><span>←</span>总览</button></header><div class="signal-search"><span>⌕</span><input class="search" id="search" type="search" aria-label="搜索热点、来源或主题" placeholder="搜索今日热点"></div><div class="signal-index-list">{"".join(signal_index_rows)}</div><div class="topic-empty" id="topic-empty" hidden>该主题今天暂无高质量信号，系统仍在持续关注。</div></section><main class="signal-detail"><div class="signal-list">{"".join(signal_cards)}</div></main></section>
<section id="search-view" class="active-search-view hidden"><div class="active-search-inner"><header class="active-search-head"><div><h1>主动搜索</h1><p>技术、产品、论文与开源项目</p></div><span class="search-live-badge"><i></i>实时检索</span></header><form class="active-search-form" id="active-search-form"><div class="active-search-input-wrap"><span>⌕</span><input id="active-search-input" class="active-search-input" type="search" maxlength="120" autocomplete="off" aria-label="搜索技术或产品" placeholder="输入技术、产品或问题，例如：Agent 纳管平台"></div><button class="active-search-submit" id="active-search-submit" type="submit">搜索</button><div class="active-search-controls"><div class="search-filter-group"><span>类型</span><div class="active-search-kinds" role="group" aria-label="搜索类型"><button class="active" type="button" data-search-kind="all">全部</button><button type="button" data-search-kind="technology">技术</button><button type="button" data-search-kind="product">产品</button></div></div><div class="search-filter-group"><span>时间</span><div class="active-search-ranges" role="group" aria-label="时间范围"><button type="button" data-search-range="7d">近一周</button><button class="active" type="button" data-search-range="30d">近一个月</button><button type="button" data-search-range="1y">近 1 年</button><button type="button" data-search-range="3y">近 3 年</button><button type="button" data-search-range="all">不限制</button></div></div><span class="search-hint">⌘ K 快速打开</span></div></form><div class="search-history" id="search-history"></div><section class="search-state search-initial" id="search-initial"><h2>搜索你正在关注的方向</h2><p>结果将合并产品矩阵、本机报告与实时公开来源。</p><div class="search-suggestions"><button type="button" data-search-query="Agent Portal"><b>Agent Portal</b><small>纳管平台与治理动态</small></button><button type="button" data-search-query="企业知识引擎"><b>企业知识引擎</b><small>知识接入、检索与 Agent 应用</small></button><button type="button" data-search-query="AI Coding Agent"><b>AI Coding Agent</b><small>产品、开源项目与技术进展</small></button></div></section><section class="search-state search-loading" id="search-loading" hidden><header><i></i><span>正在检索多个实时来源…</span></header><div class="search-loading-lines"><i></i><i></i><i></i></div></section><section class="search-state" id="search-results" hidden><header class="search-results-head"><strong id="search-result-title">搜索结果</strong><span id="search-result-meta"></span><time id="search-result-time"></time></header><div class="search-result-list" id="search-result-list"></div></section><section class="search-state search-error" id="search-error" hidden><b>搜索暂时不可用</b><p id="search-error-message"></p></section></div></section>
<section id="products-view" class="product-view hidden"><div class="product-view-inner"><header class="product-head"><div><h1>产品情报矩阵</h1><p>覆盖个人助手、Agent 开发与纳管、知识引擎和 AI Coding，动态关联当天采集结果。</p></div><div class="product-stats"><span><b>{len(PRODUCT_MATRIX)}</b><small>国内外厂商</small></span><span><b>{product_activity_count}</b><small>今日产品动态</small></span></div></header><div class="product-highlights">{hotspot_html}<section class="focus-strip"><header><strong>六维 HOT 01</strong><small>各产品类型当前第一</small></header>{"".join(type_hot_cards)}</section></div><div class="product-toolbar"><div class="filter-block"><span>市场范围</span><div class="matrix-filters" aria-label="地区筛选"><button class="active" data-product-region="all">全部</button><button data-product-region="china">国内</button><button data-product-region="global">国外</button></div></div><div class="filter-block"><span>产品维度</span><div class="matrix-filters" aria-label="产品类型筛选"><button class="active" data-product-scope="all">完整矩阵</button><button data-product-scope="desktop">桌面办公</button><button data-product-scope="mobile">手机端</button><button data-product-scope="platform">开发平台</button><button data-product-scope="governance">纳管平台</button><button data-product-scope="data">知识引擎</button><button data-product-scope="coding">Code 工具</button></div></div><button class="company-picker-button" id="company-picker-button" type="button" aria-expanded="false" aria-controls="company-picker">选择公司 <span id="company-picker-button-count">{len(PRODUCT_MATRIX)}/{len(PRODUCT_MATRIX)}</span></button><input class="product-search" id="product-search" type="search" placeholder="搜索厂商或产品" aria-label="搜索厂商或产品"></div><section class="company-picker" id="company-picker" hidden><header class="company-picker-head"><input class="company-picker-search" id="company-picker-search" type="search" placeholder="搜索公司或旗下产品" aria-label="搜索可选公司"><div class="company-picker-actions"><button id="select-all-companies" type="button">全选</button><button id="clear-all-companies" type="button">全不选</button><button id="close-company-picker" type="button">完成</button></div><span class="company-picker-count" id="company-picker-count">已选择 {len(PRODUCT_MATRIX)} / {len(PRODUCT_MATRIX)} 家</span></header><div class="company-options">{"".join(company_options)}</div><div class="company-picker-empty" id="company-picker-empty" hidden>未找到匹配公司或产品，请尝试英文名、中文名或产品名。</div></section><div class="product-workspace"><main><div class="matrix-wrap"><table class="product-table"><thead><tr><th>厂商</th><th data-product-column="desktop">个人助理（桌面办公）</th><th data-product-column="mobile">个人助理（手机端）</th><th data-product-column="platform">Agent 开发平台</th><th data-product-column="governance">Agent 纳管平台</th><th data-product-column="data">知识引擎</th><th data-product-column="coding">Code 工具</th></tr></thead><tbody>{"".join(product_rows)}</tbody></table></div><div class="matrix-empty" id="matrix-empty" hidden>当前没有已选公司，或筛选条件下暂无匹配产品。</div></main><aside class="product-feed"><header><h2>产品动态</h2><p>来自今日已采集来源，点击查看原文</p></header>{"".join(product_feed)}<div class="matrix-empty product-feed-empty" id="product-feed-empty" hidden>当前所选公司暂无产品动态。</div></aside></div></div></section>
<div id="boards-view" class="dashboard hidden"><aside class="sidebar"><h3>内容分类</h3>{category_nav}</aside><main class="board-area"><div class="board-summary"><div><h1>探索榜单</h1><p>{ok_count} 个有效来源，聚合 {total_candidates} 条实时信号</p></div><button class="board-customize-button" id="board-customize-button" type="button" title="调整排版、主题、卡片顺序、大小和颜色"><span class="sliders-icon" aria-hidden="true"></span><span>自定义看板</span></button><div class="stat"><b>{len(report.get("news_boards", []))}</b><small>热点榜单</small></div></div><div class="board-grid" id="board-grid" data-layout="adaptive">{"".join(board_cards)}</div></main><aside class="rightbar"><h3>内容门户</h3>{portal_cards}<h3 style="margin-top:20px">采集状态</h3><ul class="health">{"".join(health_rows)}</ul>{errors}</aside></div>
<section id="ai-view" class="ai-view"><div class="ai-head"><h1>技术雷达</h1><p>正在聚合 {len(topics)} 个关注主题、{len(scope.get("keywords", []))} 个关键词的高相关技术信号。</p></div>{"".join(ai_cards)}</section></div></div><div class="topic-modal" id="topic-modal" role="dialog" aria-modal="true" aria-labelledby="topic-dialog-title" hidden><div class="topic-dialog"><header><div><h2 id="topic-dialog-title">管理关注主题</h2><p>每天会同时采集所有关注主题；首页默认合并展示，也可以随时单独切换。</p></div><button id="close-topic-modal" aria-label="关闭">×</button></header><div class="topic-rows" id="topic-rows"></div><div class="topic-guide">每个主题建议填写 3-8 个具体关键词。英文短语会按完整词匹配，避免 RAG 误命中 STRATEGY 之类的噪声。</div><div class="topic-status" id="topic-status" role="status" hidden></div><div class="topic-actions"><button id="add-topic">＋ 添加主题</button><button id="cancel-topics">取消</button><button class="save-topics" id="save-topics">保存并刷新</button></div></div></div><script>
let researchTopics={topics_json};
const desktopShell=document.querySelector('.desktop-shell');
const sidebarCollapse=document.getElementById('sidebar-collapse');
const sidebarStorageKey='technology-radar-sidebar-collapsed-v1';
const setSidebarCollapsed=collapsed=>{{
  desktopShell.classList.toggle('sidebar-collapsed',collapsed);
  sidebarCollapse.textContent=collapsed?'›':'‹';
  sidebarCollapse.title=collapsed?'展开导航栏':'折叠导航栏';
  sidebarCollapse.setAttribute('aria-label',sidebarCollapse.title);
  sidebarCollapse.setAttribute('aria-expanded',String(!collapsed));
}};
let sidebarCollapsed=false;
try{{sidebarCollapsed=localStorage.getItem(sidebarStorageKey)==='1';}}catch(error){{}}
setSidebarCollapsed(sidebarCollapsed);
sidebarCollapse.addEventListener('click',()=>{{
  sidebarCollapsed=!desktopShell.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(sidebarCollapsed);
  try{{localStorage.setItem(sidebarStorageKey,sidebarCollapsed?'1':'0');}}catch(error){{}}
}});
const workspaceModeKey='technology-workspace-mode-v1';
const modeButtons=[...document.querySelectorAll('[data-mode]')];
modeButtons.forEach(button=>button.addEventListener('click',()=>{{
  modeButtons.forEach(item=>{{
    item.classList.toggle('active',item===button);
    item.setAttribute('aria-selected',String(item===button));
  }});
  document.getElementById('signals-view').classList.toggle('hidden',button.dataset.mode!=='signals');
  document.getElementById('search-view').classList.toggle('hidden',button.dataset.mode!=='search');
  document.getElementById('products-view').classList.toggle('hidden',button.dataset.mode!=='products');
  document.getElementById('boards-view').classList.toggle('hidden',button.dataset.mode!=='boards');
  document.getElementById('ai-view').classList.toggle('active',button.dataset.mode==='ai');
  document.getElementById('customize-button').hidden=button.dataset.mode!=='boards';
  if(button.dataset.mode!=='boards'){{
    document.getElementById('customizer').hidden=true;
    document.querySelectorAll('#customize-button,#board-customize-button')
      .forEach(item=>item.classList.remove('active'));
  }}
  document.querySelectorAll('[data-workspace-mode]').forEach(item=>item.classList.toggle(
    'active',item.dataset.workspaceMode===button.dataset.mode
  ));
  try{{localStorage.setItem(workspaceModeKey,button.dataset.mode);}}catch(error){{}}
  if(button.dataset.mode==='search')setTimeout(()=>document.getElementById('active-search-input')?.focus(),80);
  window.scrollTo({{top:0,behavior:'smooth'}});
}}));
document.querySelectorAll('[data-workspace-mode]').forEach(button=>button.addEventListener('click',()=>{{
  document.querySelector(`[data-mode="${{button.dataset.workspaceMode}}"]`)?.click();
  if(button.dataset.workspaceMode==='signals') showSignalOverview();
}}));
try{{
  const savedWorkspaceMode=localStorage.getItem(workspaceModeKey);
  if(savedWorkspaceMode)document.querySelector(`[data-mode="${{savedWorkspaceMode}}"]`)?.click();
}}catch(error){{}}
const categoryButtons=[...document.querySelectorAll('[data-category].category-button')];
const boards=[...document.querySelectorAll('.board-card')];
let activeCategory='all';
categoryButtons.forEach(button=>button.addEventListener('click',()=>{{
  activeCategory=button.dataset.category;
  categoryButtons.forEach(item=>item.classList.toggle('active',item===button));
  applyBoardVisibility();
}}));
const signalCards=[...document.querySelectorAll('.signal-card')];
const signalIndexItems=[...document.querySelectorAll('.signal-index-item')];
const signalsView=document.getElementById('signals-view');
const aiCards=[...document.querySelectorAll('.ai-card')];
const productRows=[...document.querySelectorAll('.product-table tbody tr')];
const productFeedItems=[...document.querySelectorAll('.product-feed-item')];
const productRegionButtons=[...document.querySelectorAll('[data-product-region]')];
const productScopeButtons=[...document.querySelectorAll('[data-product-scope]')];
const companyPicker=document.getElementById('company-picker');
const companyPickerButton=document.getElementById('company-picker-button');
const companyPickerSearch=document.getElementById('company-picker-search');
const companyOptions=[...document.querySelectorAll('.company-option')];
const vendorChoices=[...document.querySelectorAll('[data-vendor-choice]')];
const allVendorNames=productRows.map(row=>row.dataset.vendor);
const vendorSelectionStorageKey='technology-product-vendor-selection-v1';
let selectedVendors=new Set(allVendorNames);
try{{
  const storedVendors=localStorage.getItem(vendorSelectionStorageKey);
  if(storedVendors!==null){{
    const parsed=JSON.parse(storedVendors);
    if(Array.isArray(parsed))selectedVendors=new Set(
      parsed.filter(vendor=>allVendorNames.includes(vendor))
    );
  }}
}}catch(error){{}}
vendorChoices.forEach(choice=>choice.checked=selectedVendors.has(choice.dataset.vendorChoice));
const topicButtons=[...document.querySelectorAll('[data-topic]')];
let activeTopic='all';
let activeProductRegion='all';
let activeProductScope='all';
let selectedSignalKey=signalIndexItems[0]?.dataset.signalKey||'';
const learningStorageKey='technology-radar-learning-v1';
let learningState={{mastered:{{}},unmasteredOnly:false}};
try{{learningState={{...learningState,...JSON.parse(localStorage.getItem(learningStorageKey)||'{{}}')}};}}catch(error){{}}
const saveLearningState=()=>{{
  try{{localStorage.setItem(learningStorageKey,JSON.stringify(learningState));}}catch(error){{}}
}};
const selectSignal=key=>{{
  selectedSignalKey=key;
  signalsView.classList.remove('overview');
  signalIndexItems.forEach(item=>item.classList.toggle('selected',item.dataset.signalKey===key));
  signalCards.forEach(card=>card.classList.toggle('selected',card.dataset.signalKey===key));
  document.querySelector('.signal-detail')?.scrollTo({{top:0,behavior:'smooth'}});
}};
const showSignalOverview=()=>{{
  signalsView.classList.add('overview');
  signalIndexItems.forEach(item=>item.classList.remove('selected'));
  document.querySelector('.signal-index-list')?.scrollTo({{top:0,behavior:'smooth'}});
}};
signalIndexItems.forEach(item=>item.addEventListener('click',()=>selectSignal(item.dataset.signalKey)));
document.getElementById('overview-return').addEventListener('click',showSignalOverview);
const hasActiveTopic=item=>activeTopic==='all'||(item.dataset.topics||'').split(' ').includes(activeTopic);
const applyBoardVisibility=()=>{{
  const query=document.getElementById('search').value.trim().toLowerCase();
  boards.forEach(board=>{{
    let matches=0;
    board.querySelectorAll('li').forEach(row=>{{
      const queryMatches=!query||row.dataset.search.includes(query)||
        board.querySelector('h2').textContent.toLowerCase().includes(query);
      const visible=queryMatches&&hasActiveTopic(row);
      row.classList.toggle('hidden',!visible);
      if(visible)matches++;
    }});
    const categoryMatches=activeCategory==='all'||board.dataset.category===activeCategory;
    board.classList.toggle('hidden',!categoryMatches||matches===0);
  }});
}};
const applyProductVisibility=()=>{{
  const query=document.getElementById('product-search').value.trim().toLowerCase();
  let visibleRows=0;
  let visibleFeedItems=0;
  document.querySelectorAll('[data-product-column],[data-product-type]').forEach(cell=>{{
    const type=cell.dataset.productColumn||cell.dataset.productType;
    cell.classList.toggle('hidden',activeProductScope!=='all'&&type!==activeProductScope);
  }});
  productRows.forEach(row=>{{
    const vendorMatches=selectedVendors.has(row.dataset.vendor);
    const regionMatches=activeProductRegion==='all'||row.dataset.region===activeProductRegion;
    const searchMatches=!query||row.dataset.search.includes(query);
    const scopeCell=activeProductScope==='all'?null:row.querySelector(`[data-product-type="${{activeProductScope}}"]`);
    const scopeMatches=!scopeCell||!scopeCell.classList.contains('product-empty-cell');
    const visible=vendorMatches&&regionMatches&&searchMatches&&scopeMatches&&hasActiveTopic(row);
    row.classList.toggle('hidden',!visible);
    if(visible)visibleRows++;
  }});
  productFeedItems.forEach(item=>{{
    const vendorMatches=selectedVendors.has(item.dataset.vendor);
    const searchMatches=!query||item.dataset.search.includes(query);
    const visible=vendorMatches&&searchMatches&&hasActiveTopic(item);
    item.classList.toggle('hidden',!visible);
    if(visible)visibleFeedItems++;
  }});
  document.getElementById('matrix-empty').hidden=visibleRows>0;
  document.getElementById('product-feed-empty').hidden=visibleFeedItems>0;
}};
const syncVendorSelection=()=>{{
  vendorChoices.forEach(choice=>choice.checked=selectedVendors.has(choice.dataset.vendorChoice));
  const count=selectedVendors.size;
  document.getElementById('company-picker-count').textContent=
    `已选择 ${{count}} / ${{allVendorNames.length}} 家`;
  document.getElementById('company-picker-button-count').textContent=
    `${{count}}/${{allVendorNames.length}}`;
  try{{
    localStorage.setItem(vendorSelectionStorageKey,JSON.stringify([...selectedVendors]));
  }}catch(error){{}}
  applyProductVisibility();
}};
const setCompanyPickerOpen=open=>{{
  companyPicker.hidden=!open;
  companyPickerButton.setAttribute('aria-expanded',String(open));
  if(open)setTimeout(()=>companyPickerSearch.focus(),50);
}};
companyPickerButton.addEventListener('click',()=>setCompanyPickerOpen(companyPicker.hidden));
document.getElementById('close-company-picker').addEventListener('click',()=>setCompanyPickerOpen(false));
document.getElementById('select-all-companies').addEventListener('click',()=>{{
  selectedVendors=new Set(allVendorNames);
  syncVendorSelection();
}});
document.getElementById('clear-all-companies').addEventListener('click',()=>{{
  selectedVendors=new Set();
  syncVendorSelection();
}});
vendorChoices.forEach(choice=>choice.addEventListener('change',()=>{{
  if(choice.checked)selectedVendors.add(choice.dataset.vendorChoice);
  else selectedVendors.delete(choice.dataset.vendorChoice);
  syncVendorSelection();
}}));
companyPickerSearch.addEventListener('input',()=>{{
  const query=companyPickerSearch.value.trim().toLowerCase();
  let matches=0;
  companyOptions.forEach(option=>{{
    const visible=!query||option.dataset.companySearch.includes(query);
    option.classList.toggle('hidden',!visible);
    if(visible)matches++;
  }});
  document.getElementById('company-picker-empty').hidden=matches>0;
}});
syncVendorSelection();
const applySignalVisibility=()=>{{
  const query=document.getElementById('search').value.trim().toLowerCase();
  const visibleItems=signalIndexItems.filter(item=>{{
    const mastered=Boolean(learningState.mastered[item.dataset.signalKey]);
    const matches=!query||item.dataset.search.includes(query);
    const topicMatches=activeTopic==='all'||item.dataset.topics.split(' ').includes(activeTopic);
    const visible=matches&&topicMatches&&!(learningState.unmasteredOnly&&mastered);
    item.classList.toggle('hidden',!visible);
    return visible;
  }});
  if(!visibleItems.some(item=>item.dataset.signalKey===selectedSignalKey)){{
    selectedSignalKey=visibleItems[0]?.dataset.signalKey||'';
  }}
  signalCards.forEach(card=>card.classList.toggle(
    'selected',
    card.dataset.signalKey===selectedSignalKey
  ));
  if(!signalsView.classList.contains('overview')){{
    signalIndexItems.forEach(item=>item.classList.toggle(
      'selected',
      item.dataset.signalKey===selectedSignalKey
    ));
  }}
  aiCards.forEach(card=>card.classList.toggle(
    'hidden',
    activeTopic!=='all'&&!card.dataset.topics.split(' ').includes(activeTopic)
  ));
  document.getElementById('topic-empty').hidden=visibleItems.length>0;
  applyBoardVisibility();
  applyProductVisibility();
}};
topicButtons.forEach(button=>button.addEventListener('click',()=>{{
  activeTopic=button.dataset.topic;
  topicButtons.forEach(item=>item.classList.toggle('active',item===button));
  applySignalVisibility();
}}));
productRegionButtons.forEach(button=>button.addEventListener('click',()=>{{
  activeProductRegion=button.dataset.productRegion;
  productRegionButtons.forEach(item=>item.classList.toggle('active',item===button));
  applyProductVisibility();
}}));
productScopeButtons.forEach(button=>button.addEventListener('click',()=>{{
  activeProductScope=button.dataset.productScope;
  productScopeButtons.forEach(item=>item.classList.toggle('active',item===button));
  applyProductVisibility();
}}));
document.getElementById('product-search').addEventListener('input',applyProductVisibility);
const activeSearchInput=document.getElementById('active-search-input');
const activeSearchSubmit=document.getElementById('active-search-submit');
const activeSearchKinds=[...document.querySelectorAll('[data-search-kind]')];
const activeSearchRanges=[...document.querySelectorAll('[data-search-range]')];
const activeSearchInitial=document.getElementById('search-initial');
const activeSearchLoading=document.getElementById('search-loading');
const activeSearchResults=document.getElementById('search-results');
const activeSearchError=document.getElementById('search-error');
const activeSearchHistory=document.getElementById('search-history');
const activeSearchHistoryKey='technology-active-search-history-v1';
const activeSearchRangeKey='technology-active-search-range-v1';
let activeSearchKind='all';
let activeSearchTimeRange='30d';
let activeSearchController=null;
let searchHistory=[];
try{{searchHistory=JSON.parse(localStorage.getItem(activeSearchHistoryKey)||'[]').filter(Boolean).slice(0,8);}}catch(error){{}}
try{{
  const storedRange=localStorage.getItem(activeSearchRangeKey);
  if(activeSearchRanges.some(button=>button.dataset.searchRange===storedRange))activeSearchTimeRange=storedRange;
}}catch(error){{}}
activeSearchRanges.forEach(button=>button.classList.toggle('active',button.dataset.searchRange===activeSearchTimeRange));
const escapeSearchHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[char]));
const setActiveSearchState=state=>{{
  activeSearchInitial.hidden=state!=='initial';
  activeSearchLoading.hidden=state!=='loading';
  activeSearchResults.hidden=state!=='results';
  activeSearchError.hidden=state!=='error';
}};
const renderSearchHistory=()=>{{
  activeSearchHistory.innerHTML=searchHistory.length
    ?`<span>最近搜索</span>${{searchHistory.map(query=>`<button type="button" data-history-query="${{escapeSearchHTML(query)}}">${{escapeSearchHTML(query)}}</button>`).join('')}}`
    :'<span>最近搜索将在这里显示</span>';
  activeSearchHistory.querySelectorAll('[data-history-query]').forEach(button=>button.addEventListener('click',()=>{{
    activeSearchInput.value=button.dataset.historyQuery;
    runActiveSearch();
  }}));
}};
const searchDate=value=>{{
  if(!value)return'';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('zh-CN',{{month:'2-digit',day:'2-digit'}});
}};
const renderActiveSearchResults=data=>{{
  const list=document.getElementById('search-result-list');
  const failed=(data.sourceStatus||[]).filter(source=>source.status!=='ok').length;
  document.getElementById('search-result-title').textContent=`“${{data.query}}”`;
  document.getElementById('search-result-meta').textContent=
    `${{data.timeLabel}} · ${{data.total}} 条结果 · ${{data.sourceCount}} 个来源${{failed?` · ${{failed}} 个来源暂不可用`:''}}`;
  document.getElementById('search-result-time').textContent=data.cached?'缓存结果':'刚刚更新';
  if(!data.results?.length){{
    list.innerHTML='<div class="search-empty"><b>暂未找到相关结果</b><p>可以更换产品全名、英文名或技术关键词后重试。</p></div>';
    setActiveSearchState('results');
    return;
  }}
  list.innerHTML=data.results.map(item=>{{
    const date=searchDate(item.publishedAt);
    const link=item.url
      ?`<a href="${{escapeSearchHTML(item.url)}}" title="打开原始来源">${{escapeSearchHTML(item.title)}}</a>`
      :escapeSearchHTML(item.title);
    const open=item.url?`<a class="search-result-open" href="${{escapeSearchHTML(item.url)}}" title="打开原始来源" aria-label="打开原始来源">↗</a>`:'';
    return `<article class="search-result"><div class="search-result-source"><b>${{escapeSearchHTML(item.source)}}</b><span>${{escapeSearchHTML(item.type)}}${{date?` · ${{date}}`:''}}</span></div><div class="search-result-copy"><h2>${{link}}</h2><p>${{escapeSearchHTML(item.summary||'暂无摘要')}}</p><small>${{escapeSearchHTML(item.evidence||'实时检索结果')}}</small></div>${{open}}</article>`;
  }}).join('');
  setActiveSearchState('results');
}};
const runActiveSearch=async()=>{{
  const query=activeSearchInput.value.trim();
  if(query.length<2){{
    activeSearchInput.focus();
    activeSearchInput.setCustomValidity('请输入至少 2 个字符');
    activeSearchInput.reportValidity();
    return;
  }}
  activeSearchInput.setCustomValidity('');
  activeSearchController?.abort();
  const controller=new AbortController();
  activeSearchController=controller;
  activeSearchSubmit.disabled=true;
  activeSearchSubmit.textContent='搜索中…';
  setActiveSearchState('loading');
  try{{
    const url=`http://127.0.0.1:43128/v1/search?q=${{encodeURIComponent(query)}}&kind=${{activeSearchKind}}&range=${{activeSearchTimeRange}}&limit=24`;
    const response=await fetch(url,{{signal:controller.signal}});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'搜索请求失败');
    searchHistory=[query,...searchHistory.filter(value=>value.toLowerCase()!==query.toLowerCase())].slice(0,8);
    try{{localStorage.setItem(activeSearchHistoryKey,JSON.stringify(searchHistory));}}catch(error){{}}
    renderSearchHistory();
    renderActiveSearchResults(data);
  }}catch(error){{
    if(error.name==='AbortError')return;
    document.getElementById('search-error-message').textContent=
      error.message||'无法连接实时搜索服务，请稍后重试。';
    setActiveSearchState('error');
  }}finally{{
    if(activeSearchController===controller){{
      activeSearchSubmit.disabled=false;
      activeSearchSubmit.textContent='搜索';
    }}
  }}
}};
document.getElementById('active-search-form').addEventListener('submit',event=>{{
  event.preventDefault();
  runActiveSearch();
}});
activeSearchKinds.forEach(button=>button.addEventListener('click',()=>{{
  activeSearchKind=button.dataset.searchKind;
  activeSearchKinds.forEach(item=>item.classList.toggle('active',item===button));
  if(activeSearchInput.value.trim().length>=2)runActiveSearch();
}}));
activeSearchRanges.forEach(button=>button.addEventListener('click',()=>{{
  activeSearchTimeRange=button.dataset.searchRange;
  activeSearchRanges.forEach(item=>item.classList.toggle('active',item===button));
  try{{localStorage.setItem(activeSearchRangeKey,activeSearchTimeRange);}}catch(error){{}}
  if(activeSearchInput.value.trim().length>=2)runActiveSearch();
}}));
document.querySelectorAll('[data-search-query]').forEach(button=>button.addEventListener('click',()=>{{
  activeSearchInput.value=button.dataset.searchQuery;
  runActiveSearch();
}}));
renderSearchHistory();
const topicModal=document.getElementById('topic-modal');
const topicRows=document.getElementById('topic-rows');
const topicStatus=document.getElementById('topic-status');
let editingTopics=[];
let topicReturnFocus=null;
const setTopicStatus=(message,type='info')=>{{
  topicStatus.textContent=message;
  topicStatus.classList.toggle('error',type==='error');
  topicStatus.hidden=!message;
}};
const renderTopicRows=()=>{{
  topicRows.innerHTML='';
  editingTopics.forEach((topic,index)=>{{
    const row=document.createElement('div');row.className='topic-row';
    const name=document.createElement('input');name.value=topic.name;name.placeholder='主题名称';
    const keywords=document.createElement('input');keywords.value=topic.keywords.join(', ');keywords.placeholder='关键词，用逗号分隔';
    const remove=document.createElement('button');remove.textContent='×';remove.title='取消关注';
    name.addEventListener('input',()=>topic.name=name.value);
    keywords.addEventListener('input',()=>topic.keywords=keywords.value.split(/[,，、;\\n]+/).map(value=>value.trim()).filter(Boolean));
    remove.addEventListener('click',()=>{{editingTopics.splice(index,1);renderTopicRows();}});
    row.append(name,keywords,remove);topicRows.appendChild(row);
  }});
}};
const openTopicModal=()=>{{
  topicReturnFocus=document.activeElement;
  editingTopics=researchTopics.map(topic=>({{...topic,keywords:[...topic.keywords]}}));
  setTopicStatus('');
  renderTopicRows();topicModal.hidden=false;
  topicRows.querySelector('input')?.focus();
}};
const closeTopicModal=()=>{{
  topicModal.hidden=true;
  const returnTarget=topicReturnFocus?.matches?.('button,a,input')
    ? topicReturnFocus : document.getElementById('manage-topics');
  returnTarget?.focus();
}};
document.getElementById('manage-topics').addEventListener('click',openTopicModal);
document.getElementById('close-topic-modal').addEventListener('click',closeTopicModal);
document.getElementById('cancel-topics').addEventListener('click',closeTopicModal);
topicModal.addEventListener('click',event=>{{
  if(event.target===topicModal)closeTopicModal();
}});
document.addEventListener('keydown',event=>{{
  if(event.key==='Escape'&&!topicModal.hidden)closeTopicModal();
}});
document.getElementById('add-topic').addEventListener('click',()=>{{
  if(editingTopics.length>=10)return;
  editingTopics.push({{id:`topic-${{Date.now()}}`,name:'新关注主题',keywords:['关键词']}});
  renderTopicRows();topicRows.lastElementChild?.querySelector('input')?.select();
}});
document.getElementById('save-topics').addEventListener('click',()=>{{
  const valid=editingTopics.filter(topic=>topic.name.trim()&&topic.keywords.length);
  if(!valid.length){{
    setTopicStatus('请至少保留一个包含关键词的关注主题。','error');
    topicRows.querySelector('input')?.focus();
    return;
  }}
  try{{
    const handler=window.webkit?.messageHandlers?.technologyRadar;
    if(!handler){{
      setTopicStatus('请在 Technology Exploration 桌面应用中管理关注主题。','error');
      return;
    }}
    handler.postMessage({{type:'saveResearchTopics',topics:valid}});
    const saveButton=document.getElementById('save-topics');
    saveButton.disabled=true;
    saveButton.textContent='已保存，正在刷新…';
    setTopicStatus('配置已保存，正在重新采集关注主题。');
  }}catch(error){{setTopicStatus('主题保存失败，请重试。','error');}}
}});
const guideKey='technology-topic-guide-seen-v1';
try{{document.getElementById('topic-onboarding').hidden=localStorage.getItem(guideKey)==='1';}}catch(error){{}}
document.getElementById('dismiss-topic-guide').addEventListener('click',()=>{{
  document.getElementById('topic-onboarding').hidden=true;
  try{{localStorage.setItem(guideKey,'1');}}catch(error){{}}
}});
const updateLearningProgress=()=>{{
  const mastered=signalCards.filter(card=>learningState.mastered[card.dataset.signalKey]).length;
  document.getElementById('mastered-count').textContent=`${{mastered}} / ${{signalCards.length}}`;
  document.getElementById('mastered-progress').style.width=`${{mastered/Math.max(1,signalCards.length)*100}}%`;
  signalCards.forEach(card=>{{
    const active=Boolean(learningState.mastered[card.dataset.signalKey]);
    card.classList.toggle('mastered',active);
    const button=card.querySelector('.master-button');
    button.classList.toggle('active',active);
    button.innerHTML=active?'<span>✓</span> 已掌握':'<span>✓</span> 标记已掌握';
  }});
  signalIndexItems.forEach(item=>item.classList.toggle(
    'mastered',
    Boolean(learningState.mastered[item.dataset.signalKey])
  ));
  applySignalVisibility();
}};
signalCards.forEach(card=>{{
  card.querySelector('.master-button').addEventListener('click',()=>{{
    const key=card.dataset.signalKey;
    learningState.mastered[key]=!learningState.mastered[key];
    saveLearningState();updateLearningProgress();
  }});
  card.querySelector('.evidence-toggle').addEventListener('click',event=>{{
    const panel=card.querySelector('.evidence-panel');
    panel.hidden=!panel.hidden;
    event.currentTarget.textContent=panel.hidden?'展开证据':'收起证据';
  }});
}});
document.getElementById('unmastered-filter').addEventListener('click',event=>{{
  learningState.unmasteredOnly=!learningState.unmasteredOnly;
  event.currentTarget.classList.toggle('active',learningState.unmasteredOnly);
  event.currentTarget.textContent=learningState.unmasteredOnly?'显示全部':'只看未掌握';
  saveLearningState();applySignalVisibility();
}});
document.getElementById('unmastered-filter').classList.toggle('active',learningState.unmasteredOnly);
document.getElementById('unmastered-filter').textContent=learningState.unmasteredOnly?'显示全部':'只看未掌握';
document.getElementById('browser-filter').addEventListener('click',()=>document.getElementById('unmastered-filter').click());
updateLearningProgress();
document.getElementById('search').addEventListener('input',applySignalVisibility);
document.addEventListener('keydown',event=>{{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){{
    event.preventDefault();
    document.querySelector('[data-mode="search"]')?.click();
    activeSearchInput.focus();
  }}
  if(event.key==='Escape'){{
    if(!signalsView.classList.contains('overview')) showSignalOverview();
    document.getElementById('search').blur();
    activeSearchInput.blur();
    document.getElementById('customizer').hidden=true;
    document.querySelectorAll('#customize-button,#board-customize-button')
      .forEach(item=>item.classList.remove('active'));
    document.getElementById('color-popover').hidden=true;
  }}
}});
const boardGrid=document.getElementById('board-grid');
const customizer=document.getElementById('customizer');
const customizeButton=document.getElementById('customize-button');
const boardCustomizeButton=document.getElementById('board-customize-button');
const customizeButtons=[customizeButton,boardCustomizeButton].filter(Boolean);
const colorPopover=document.getElementById('color-popover');
const editToggle=document.getElementById('edit-toggle');
const storageKey='technology-radar-board-v2';
let activeColorCard=null;
let draggedCard=null;
let preferences={{layout:'adaptive',theme:'system',order:[],cards:{{}}}};
try{{
  preferences={{...preferences,...(window.__nativeBoardPreferences||{{}}),...JSON.parse(localStorage.getItem(storageKey)||'{{}}')}};
  preferences.cards=preferences.cards||{{}};
}}catch(error){{}}
const savePreferences=()=>{{
  preferences.order=[...boardGrid.querySelectorAll('.board-card')].map(card=>card.dataset.boardKey);
  try{{localStorage.setItem(storageKey,JSON.stringify(preferences));}}catch(error){{}}
  try{{
    window.webkit?.messageHandlers?.technologyRadar?.postMessage({{
      type:'saveBoardPreferences',preferences
    }});
  }}catch(error){{}}
}};
const applyTheme=theme=>{{
  preferences.theme=theme;
  if(theme==='system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme=theme;
  document.querySelectorAll('.theme-option').forEach(option=>option.classList.toggle('active',option.dataset.value===theme));
}};
const applyLayout=layout=>{{
  preferences.layout=layout;
  boardGrid.dataset.layout=layout;
  document.querySelectorAll('.layout-option').forEach(option=>option.classList.toggle('active',option.dataset.layoutOption===layout));
}};
const applyCardPreference=card=>{{
  const setting=preferences.cards[card.dataset.boardKey]||{{}};
  card.dataset.cardColor=setting.color||'default';
  card.dataset.visibleRows=String(setting.rows||10);
  card.style.setProperty('--card-span',String(setting.span||1));
}};
const orderMap=new Map(preferences.order.map((key,index)=>[key,index]));
[...boardGrid.children].sort((left,right)=>(orderMap.get(left.dataset.boardKey)??999)-(orderMap.get(right.dataset.boardKey)??999)).forEach(card=>boardGrid.appendChild(card));
boards.forEach(applyCardPreference);
applyTheme(preferences.theme||'system');
applyLayout(preferences.layout||'adaptive');
const toggleCustomizer=()=>{{
  customizer.hidden=!customizer.hidden;
  customizeButtons.forEach(button=>button.classList.toggle('active',!customizer.hidden));
  colorPopover.hidden=true;
}};
customizeButtons.forEach(button=>button.addEventListener('click',toggleCustomizer));
document.getElementById('close-customizer').addEventListener('click',()=>{{
  customizer.hidden=true;
  customizeButtons.forEach(button=>button.classList.remove('active'));
}});
document.querySelectorAll('.layout-option').forEach(option=>option.addEventListener('click',()=>{{
  applyLayout(option.dataset.layoutOption); savePreferences();
}}));
document.querySelectorAll('.theme-option').forEach(option=>option.addEventListener('click',()=>{{
  applyTheme(option.dataset.value); savePreferences();
}}));
editToggle.addEventListener('click',()=>{{
  const editing=!boardGrid.classList.contains('editing');
  boardGrid.classList.toggle('editing',editing);
  editToggle.classList.toggle('active',editing);
  editToggle.setAttribute('aria-checked',String(editing));
  if(!editing) colorPopover.hidden=true;
}});
const captureCardPositions=()=>new Map(
  boards.filter(card=>!card.classList.contains('hidden')).map(card=>[card,card.getBoundingClientRect()])
);
const animateCardReflow=before=>{{
  boards.forEach(item=>{{
    const previous=before.get(item);
    if(!previous||item.classList.contains('dragging-source'))return;
    const current=item.getBoundingClientRect();
    const deltaX=previous.left-current.left,deltaY=previous.top-current.top;
    if(Math.abs(deltaX)<1&&Math.abs(deltaY)<1)return;
    item.getAnimations().forEach(animation=>animation.cancel());
    item.animate(
      [{{transform:`translate(${{deltaX}}px,${{deltaY}}px)`}},{{transform:'translate(0,0)'}}],
      {{duration:170,easing:'cubic-bezier(.2,.8,.2,1)'}}
    );
  }});
}};
boards.forEach(card=>{{
  const dragHandle=card.querySelector('.drag-handle');
  dragHandle.addEventListener('pointerdown',event=>{{
    if(!boardGrid.classList.contains('editing'))return;
    event.preventDefault();
    const startX=event.clientX,startY=event.clientY;
    let moving=false;
    let ghost=null,offsetX=0,offsetY=0;
    try{{dragHandle.setPointerCapture?.(event.pointerId);}}catch(error){{}}
    const move=moveEvent=>{{
      if(!moving&&Math.hypot(moveEvent.clientX-startX,moveEvent.clientY-startY)<4)return;
      if(!moving){{
        moving=true; draggedCard=card; card.classList.add('dragging-source');
        const rect=card.getBoundingClientRect();
        offsetX=startX-rect.left;offsetY=startY-rect.top;
        ghost=card.cloneNode(true);
        ghost.className='board-card drag-ghost';
        ghost.style.width=`${{rect.width}}px`;
        ghost.style.height=`${{Math.min(rect.height,240)}}px`;
        document.body.appendChild(ghost);
      }}
      moveEvent.preventDefault();
      ghost.style.left=`${{moveEvent.clientX-offsetX}}px`;
      ghost.style.top=`${{moveEvent.clientY-offsetY}}px`;
      const candidates=boards.filter(item=>item!==card&&!item.classList.contains('hidden'));
      const target=candidates.find(item=>{{
        const rect=item.getBoundingClientRect();
        return moveEvent.clientX>=rect.left&&moveEvent.clientX<=rect.right&&
          moveEvent.clientY>=rect.top&&moveEvent.clientY<=rect.bottom;
      }});
      if(target){{
        const rect=target.getBoundingClientRect();
        const sameRow=Math.abs(rect.top-card.getBoundingClientRect().top)<rect.height/2;
        const before=sameRow
          ? moveEvent.clientX<rect.left+rect.width/2
          : moveEvent.clientY<rect.top+rect.height/2;
        const reference=before?target:target.nextSibling;
        if(reference!==card&&reference!==card.nextSibling){{
          const positions=captureCardPositions();
          boardGrid.insertBefore(card,reference);
          animateCardReflow(positions);
        }}
      }}
      if(moveEvent.clientY<90)window.scrollBy(0,-14);
      else if(moveEvent.clientY>window.innerHeight-40)window.scrollBy(0,14);
    }};
    const stop=()=>{{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',stop);
      window.removeEventListener('pointercancel',stop);
      card.classList.remove('dragging-source');
      ghost?.remove();
      draggedCard=null;
      if(moving)savePreferences();
    }};
    window.addEventListener('pointermove',move,{{passive:false}});
    window.addEventListener('pointerup',stop);
    window.addEventListener('pointercancel',stop);
  }});
  card.querySelector('.card-style').addEventListener('click',event=>{{
    activeColorCard=card;
    const rect=event.currentTarget.getBoundingClientRect();
    colorPopover.style.left=`${{Math.max(8,rect.right-220)}}px`;
    colorPopover.style.top=`${{rect.bottom+6}}px`;
    colorPopover.hidden=false;
    colorPopover.querySelectorAll('.color-option').forEach(option=>option.classList.toggle('active',option.dataset.color===card.dataset.cardColor));
  }});
  card.querySelector('.resize-grip').addEventListener('pointerdown',event=>{{
    if(!boardGrid.classList.contains('editing'))return;
    event.preventDefault();
    const startX=event.clientX,startY=event.clientY;
    const setting=preferences.cards[card.dataset.boardKey]||{{}};
    const startSpan=setting.span||1,startRows=setting.rows||10;
    let lastSpan=startSpan,lastRows=startRows;
    const badge=document.createElement('div');
    badge.className='resize-badge';
    badge.textContent=`${{startSpan}} 列 · ${{startRows}} 条`;
    badge.style.left=`${{event.clientX-74}}px`;
    badge.style.top=`${{event.clientY-34}}px`;
    document.body.appendChild(badge);
    const move=moveEvent=>{{
      const maxSpan=preferences.layout==='compact'?3:2;
      const span=Math.max(1,Math.min(maxSpan,startSpan+Math.round((moveEvent.clientX-startX)/180)));
      const rows=(moveEvent.clientY-startY)<-70?5:(moveEvent.clientY-startY)>70?10:startRows;
      badge.style.left=`${{moveEvent.clientX-74}}px`;
      badge.style.top=`${{moveEvent.clientY-34}}px`;
      badge.textContent=`${{span}} 列 · ${{rows}} 条`;
      if(span===lastSpan&&rows===lastRows)return;
      const positions=captureCardPositions();
      card.style.setProperty('--card-span',String(span));
      card.dataset.visibleRows=String(rows);
      preferences.cards[card.dataset.boardKey]={{...setting,span,rows,color:card.dataset.cardColor}};
      lastSpan=span;lastRows=rows;
      animateCardReflow(positions);
    }};
    const stop=()=>{{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',stop);
      window.removeEventListener('pointercancel',stop);
      badge.remove();savePreferences();
    }};
    window.addEventListener('pointermove',move,{{passive:false}});
    window.addEventListener('pointerup',stop);
    window.addEventListener('pointercancel',stop);
  }});
}});
colorPopover.querySelectorAll('.color-option').forEach(option=>option.addEventListener('click',()=>{{
  if(!activeColorCard)return;
  const key=activeColorCard.dataset.boardKey;
  activeColorCard.dataset.cardColor=option.dataset.color;
  preferences.cards[key]={{...(preferences.cards[key]||{{}}),color:option.dataset.color}};
  colorPopover.hidden=true; savePreferences();
}}));
document.addEventListener('pointerdown',event=>{{
  if(!colorPopover.hidden&&!colorPopover.contains(event.target)&&!event.target.closest('.card-style')) colorPopover.hidden=true;
}});
document.getElementById('reset-board').addEventListener('click',()=>{{
  try{{localStorage.removeItem(storageKey);}}catch(error){{}}
  location.reload();
}});
</script></body></html>'''


def load_config() -> dict:
    SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
    defaults = {
        "youtube_key": os.environ.get("YOUTUBE_API_KEY", ""),
        "x_bearer_token": os.environ.get("X_BEARER_TOKEN", ""),
        "tikhub_api_token": os.environ.get("TIKHUB_API_TOKEN", ""),
        "tikhub_base_url": os.environ.get("TIKHUB_BASE_URL", "https://api.tikhub.dev"),
        "feishu_webhook": os.environ.get("FEISHU_WEBHOOK", ""),
        "media_crawler_path": os.environ.get("MEDIA_CRAWLER_EXPORT_DIR", ""),
        "ark_api_key": os.environ.get("ARK_API_KEY", ""),
        "ark_base_url": os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
        "ark_model": os.environ.get("ARK_MODEL", "glm-5-2-260617"),
        "feishu_paused": True,
    }
    env_topic = os.environ.get("TECHNOLOGY_RESEARCH_TOPIC")
    env_keywords = os.environ.get("TECHNOLOGY_RESEARCH_KEYWORDS")
    if env_topic or env_keywords:
        defaults["research_topic"] = env_topic or DEFAULT_RESEARCH_TOPIC
        defaults["research_keywords"] = env_keywords or ", ".join(DEFAULT_RESEARCH_KEYWORDS)
    try:
        defaults.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    return defaults


def save_config(config: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    CONFIG_PATH.chmod(0o600)


def parse_model_json(content: str) -> dict:
    text = content.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.I | re.S)
    if fenced:
        text = fenced.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("模型未返回 JSON 对象")
    return payload


def enrich_report_with_ark(report: dict, config: dict) -> dict:
    api_key = str(config.get("ark_api_key") or "").strip()
    model = str(config.get("ark_model") or "glm-5-2-260617").strip()
    if not api_key:
        report["analysis_model"] = "local-rules"
        return report

    candidates = []
    for index, item in enumerate(report.get("items", []), 1):
        candidates.append({
            "rank": index,
            "title": item.get("title", ""),
            "source": item.get("source", ""),
            "summary": clean_text(str(item.get("summary") or ""))[:600],
            "heat_evidence": clean_text(str(item.get("evidence") or ""))[:240],
        })

    system_prompt = """你是 Technology Exploration Agent 的资深 AI 技术分析师。你的读者是希望每天快速理解前沿技术的产品经理、研发负责人和创业者。
请仅根据输入事实分析，不得编造融资、客户、性能数字或尚未提供的产品能力。信息不足时使用审慎表达。
输出必须是一个可直接解析的 JSON 对象，不要输出 Markdown 或解释文字。"""
    user_prompt = """分析下面已按热度排序的 AI Top 10。为每一条生成准确、简练、自然的中文内容。

严格输出以下结构：
{
  "daily_insight": "不超过60字，概括今天最值得关注的技术主线",
  "items": [
    {
      "rank": 1,
      "positioning": "一句话说明它是什么，不超过45字",
      "business_scenarios": ["具体业务场景1", "具体业务场景2"],
      "highlight": "相对已有方案最值得关注的亮点，不超过55字",
      "core_features": ["核心能力1", "核心能力2", "核心能力3"],
      "why_learn": "读者今天值得花15分钟了解它的原因，不超过45字"
    }
  ]
}

要求：业务场景必须具体；核心能力使用短语；不要把热度数字当作产品亮点；英文项目也用中文解释。

输入数据：
""" + json.dumps(candidates, ensure_ascii=False)

    request_body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 3000,
        "thinking": {"type": "disabled"},
    }, ensure_ascii=False).encode("utf-8")
    base_url = str(config.get("ark_base_url") or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
    endpoint = f"{base_url}/chat/completions"
    response = HTTPClient().request(endpoint, {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }, request_body, timeout=180)
    completion = json.loads(response.decode("utf-8"))
    content = completion["choices"][0]["message"]["content"]
    analysis = parse_model_json(content)
    by_rank = {int(row.get("rank", 0)): row for row in analysis.get("items", []) if isinstance(row, dict)}
    for index, item in enumerate(report.get("items", []), 1):
        row = by_rank.get(index)
        if not row:
            continue
        item["analysis"] = {
            "positioning": clean_text(str(row.get("positioning") or ""))[:100],
            "business_scenarios": [clean_text(str(value))[:70] for value in row.get("business_scenarios", [])[:3]],
            "highlight": clean_text(str(row.get("highlight") or ""))[:120],
            "core_features": [clean_text(str(value))[:40] for value in row.get("core_features", [])[:4]],
            "why_learn": clean_text(str(row.get("why_learn") or ""))[:100],
        }
    analysis_by_url = {
        item.get("url"): item.get("analysis")
        for item in report.get("items", [])
        if item.get("url") and isinstance(item.get("analysis"), dict)
    }
    for group in report.get("source_top10", []):
        for item in group.get("items", []):
            if item.get("url") in analysis_by_url:
                item["analysis"] = analysis_by_url[item["url"]]
    report["daily_insight"] = clean_text(str(analysis.get("daily_insight") or ""))[:120]
    report["analysis_model"] = model
    return report


def create_report(config: dict) -> dict:
    report = Aggregator(config).collect()
    try:
        return enrich_report_with_ark(report, config)
    except Exception as exc:
        report["analysis_model"] = "local-rules"
        report["analysis_error"] = clean_text(str(exc))[:240]
        return report


def daily_theme_summary(items: list[dict]) -> tuple[str, list[str]]:
    themes = [
        ("Agent 与持续执行", ("agent", "智能体", "workflow", "runtime", "skill")),
        ("模型与本地推理", ("model", "模型", "llm", "inference", "推理", "local")),
        ("安全与评估", ("safety", "security", "安全", "eval", "benchmark")),
        ("编程自动化", ("coding", "code", "编程", "developer", "github")),
        ("多模态与生成", ("multimodal", "diffusion", "video", "多模态", "生成")),
        ("机器人与具身智能", ("robot", "机器人", "embodied", "具身")),
    ]
    combined = " ".join(f"{item.get('title', '')} {item.get('summary', '')}" for item in items).lower()
    ranked = sorted(((sum(term in combined for term in terms), label) for label, terms in themes), reverse=True)
    selected = [label for score, label in ranked if score > 0][:3] or ["AI 产品与技术演进"]
    if len(selected) == 1:
        sentence = f"今天的高信号内容集中在{selected[0]}。"
    else:
        sentence = "今天的高信号内容集中在" + "、".join(selected[:-1]) + "与" + selected[-1] + "。"
    return sentence + " 建议先看前三条，再用速览区确认其余变化。", selected


def learning_action(item: dict) -> str:
    text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    if str(item.get("source") or "").lower() == "arxiv":
        return "核对论文方法、数据集与基线，判断结果能否复现并迁移到真实场景"
    if any(term in text for term in ("agent", "智能体", "workflow", "runtime")):
        return "对照它的工具、记忆、反馈循环与长任务恢复机制"
    if any(term in text for term in ("safety", "security", "安全", "eval")):
        return "梳理威胁模型、权限边界和人工审批位置"
    if any(term in text for term in ("model", "llm", "模型", "inference")):
        return "查看模型卡、硬件要求与关键基准，判断可用场景"
    if any(term in text for term in ("github", "open source", "开源", "framework", "sdk")):
        return "阅读 README 与架构目录，完成一个最小运行示例"
    return "阅读原始发布，记录它相对现有方案的一个实质变化"


def knowledge_takeaway(item: dict, profile: dict) -> str:
    text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    title = clean_text(str(item.get("title") or ""))
    if "deepseek" in text and any(term in text for term in ("harness", "工具", "tool", "过拟合")):
        return "DeepSeek V4 Pro 对首轮可见工具高度敏感，精简工具集可能明显改善其推理表现。"
    if "qwen" in text:
        return "Qwen 新一代本地模型正在以更低部署门槛逼近高端闭源模型的实用能力。"
    if item.get("source") == "GitHub Trending" or "/" in title and "github" in text:
        return f"{title} 正在成为开发者关注的新工具，重点判断其工作流整合能力是否可替代现有方案。"
    if item.get("source") == "arXiv":
        return f"这项研究提出新的模型组合或路由方法，核心价值在于提升跨数据集场景的稳定性。"
    if "apple" in text and ("alibaba" in text or "阿里" in text):
        return "Apple 正在联合阿里构建中国市场专用大模型，反映本地合规与产品适配将采用独立技术路线。"
    takeaway = clean_text(str(profile.get("positioning") or ""))
    if len(takeaway) < 12:
        takeaway = title
    was_long = len(takeaway) > 96
    return takeaway[:96].rstrip("，,；;:： ") + ("…" if was_long else "")


def project_profile(item: dict) -> dict:
    model_analysis = item.get("analysis")
    if isinstance(model_analysis, dict) and model_analysis.get("positioning"):
        scenarios = model_analysis.get("business_scenarios") or []
        features = model_analysis.get("core_features") or []
        return {
            "positioning": model_analysis.get("positioning"),
            "scenario": "、".join(str(value) for value in scenarios) or "需阅读原文进一步确认",
            "highlight": model_analysis.get("highlight") or "需阅读原文进一步确认",
            "features": [str(value) for value in features] or ["需阅读原文确认"],
            "why_learn": model_analysis.get("why_learn") or learning_action(item),
        }
    source = str(item.get("source") or "")
    if source.lower() == "arxiv":
        return {
            "positioning": "一项 AI 前沿研究，提出新的模型方法并通过实验验证其效果。",
            "scenario": "技术预研、论文复现、模型方案选型",
            "highlight": "重点判断方法相对基线的增益、跨数据集稳定性与复现成本",
            "features": ["研究假设与方法", "数据集与基线", "实验结果与局限"],
        }
    text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    profiles = [
        (("comfyui", "diffusion", "nodes interface"), {
            "positioning": "节点式生成式 AI 工作流平台，把图像与视频生成过程变成可编排流程。",
            "scenario": "设计团队批量出图、模型工作流复用、生成服务后端集成",
            "highlight": "用可视化节点替代黑盒提示词，复杂生成链路可复现、可调试",
            "features": ["节点编排", "模型与插件生态", "API / 后端运行"],
        }),
        (("agent-skills", "agent skills", "skills for ai coding"), {
            "positioning": "面向 AI 编程 Agent 的工程能力库，把团队经验沉淀为可复用技能。",
            "scenario": "代码生成规范化、研发流程自动化、团队最佳实践复用",
            "highlight": "将零散提示词升级为可版本化、可组合、可共享的工程资产",
            "features": ["技能模块化", "工程流程复用", "Agent 能力扩展"],
        }),
        (("watermark", "水印"), {
            "positioning": "用于识别 AI 生成内容的隐形水印技术与产品动态。",
            "scenario": "内容平台溯源、版权保护、生成内容合规审核",
            "highlight": "在尽量不影响内容质量的前提下，为生成结果加入可验证标记",
            "features": ["不可见标记", "内容溯源", "篡改与鲁棒性检测"],
        }),
        (("storage chip", "memory technologies", "芯片", "存储"), {
            "positioning": "AI 计算基础设施与存储供应链的关键产业动态。",
            "scenario": "算力采购评估、数据中心规划、硬件供应链判断",
            "highlight": "从存储带宽与供应关系观察 AI 基础设施成本和产能变化",
            "features": ["存储带宽", "硬件供应链", "基础设施成本"],
        }),
        (("safety harness", "safety", "security", "安全", "eval"), {
            "positioning": "面向 LLM Agent 的安全约束与持续评估方案。",
            "scenario": "高权限 Agent 上线、自动化任务审计、风险操作拦截",
            "highlight": "把安全从静态规则升级为随 Agent 行为轨迹持续演进的防护机制",
            "features": ["轨迹评估", "动态安全策略", "风险行为检测"],
        }),
        (("needle2", "wearable", "smart home", "14mb"), {
            "positioning": "面向端侧设备的超轻量 Agent 模型，可在低资源环境持续运行。",
            "scenario": "手机助手、可穿戴设备、智能家居与轻量机器人",
            "highlight": "仅约 14MB 的体积，让 Agent 能力进入对功耗和内存敏感的设备",
            "features": ["端侧推理", "低内存占用", "设备任务执行"],
        }),
        (("local agent", "always-on local", "local model", "本地模型"), {
            "positioning": "为本地常驻 Agent 优化的模型，强调隐私、低延迟与持续运行。",
            "scenario": "个人桌面助手、企业内网 Agent、隐私敏感的自动化任务",
            "highlight": "在本地硬件上兼顾模型能力和常驻运行成本，减少云端依赖",
            "features": ["本地推理", "持续运行", "Agent 工作流优化"],
        }),
        (("solver", "grid analysis", "neural solver"), {
            "positioning": "将神经网络求解器嵌入工程开发框架的前沿研究。",
            "scenario": "电网仿真、稳态分析、工程计算与科学机器学习",
            "highlight": "把学习型求解能力直接接入传统工程流程，缩短复杂计算链路",
            "features": ["神经求解器", "工程框架集成", "稳态计算"],
        }),
        (("prime-agent", "self-improving", "long-running autonomous"), {
            "positioning": "面向编码与长周期任务的自改进 AI Agent。",
            "scenario": "大型代码改造、持续调试、跨步骤研发任务自动执行",
            "highlight": "通过反馈循环持续优化执行策略，重点解决长任务易中断的问题",
            "features": ["强化学习反馈", "长任务恢复", "自主编码工作流"],
        }),
        (("agent", "智能体", "workflow"), {
            "positioning": "面向复杂任务自动执行的 AI Agent 技术或产品。",
            "scenario": "研发自动化、知识工作流、跨工具任务协同",
            "highlight": "将模型能力连接到工具与真实流程，减少人工重复操作",
            "features": ["工具调用", "任务规划", "上下文与状态管理"],
        }),
        (("model", "llm", "模型", "inference"), {
            "positioning": "聚焦模型能力、推理效率或部署方式的新技术。",
            "scenario": "企业 AI 应用、私有化部署、推理成本优化",
            "highlight": "在能力、成本与部署门槛之间提供新的平衡点",
            "features": ["模型推理", "部署优化", "基准与能力评估"],
        }),
    ]
    for terms, profile in profiles:
        if any(term in text for term in terms):
            return profile
    return {
        "positioning": "一项正在升温的 AI 产品或技术动态。",
        "scenario": "趋势研究、产品选型、团队技术预研",
        "highlight": "短期热度与行业讨论快速上升，值得确认其真实落地价值",
        "features": ["趋势信号", "产品能力", "落地价值评估"],
    }


def markdown_heading(item: dict, limit: int = 90) -> str:
    title = clean_text(str(item.get("title") or "未命名项目"))[:limit]
    title = title.replace("[", "【").replace("]", "】")
    url = item.get("url") or ""
    return f"[{title}]({url})" if url else title


def build_feishu_payload(report: dict) -> dict:
    generated = parse_date(report.get("generated_at"))
    stamp = generated.astimezone().strftime("%m月%d日 %H:%M") if generated else "今日"
    items = report.get("items", [])
    source_counts = Counter(str(item.get("source") or "未知来源").split("/")[0] for item in items)
    insight, themes = daily_theme_summary(items)
    model_insight = clean_text(str(report.get("daily_insight") or ""))
    source_line = " · ".join(f"{name} ×{count}" for name, count in source_counts.most_common(6))

    elements = [{
        "tag": "div",
        "text": {
            "tag": "lark_md",
            "content": (
                f"<font color='blue'>**{stamp} · DAILY 10**</font>\n"
                f"{len(source_counts)} 个有效来源，筛选 {len(items)} 条高信号技术与产品"
            ),
        },
    }, {
        "tag": "div",
        "text": {
            "tag": "lark_md",
            "content": (
                "<font color='grey'>TODAY'S SIGNAL</font>\n"
                + f"**{model_insight or insight.replace(' 建议先看前三条，再用速览区确认其余变化。', '')}**\n"
                + "  ".join(f"<font color='blue'>{theme}</font>" for theme in themes)
            ),
        },
    }, {"tag": "hr"}, {
        "tag": "div",
        "text": {"tag": "lark_md", "content": "**重点精读**  <font color='grey'>TOP 01–03</font>"},
    }]

    for index, item in enumerate(items[:3], 1):
        profile = project_profile(item)
        evidence = clean_text(str(item.get("evidence") or ""))[:140]
        source = str(item.get("source") or "未知来源")
        score = round(number(item.get("score")))
        features = "  ·  ".join(profile["features"])
        content = (
            f"<font color='blue'>**TOP {index:02d}  ·  {score} 分**</font>\n"
            f"**{markdown_heading(item)}**\n"
            f"<font color='grey'>{source}  ·  {evidence}</font>\n\n"
            f"**一句话定位**\n{profile['positioning']}\n\n"
            f"<font color='blue'>**业务场景**</font>  {profile['scenario']}\n"
            f"<font color='orange'>**最大亮点**</font>  {profile['highlight']}\n"
            f"<font color='grey'>**CORE FEATURES**</font>  {features}"
        )
        elements.append({"tag": "div", "text": {"tag": "lark_md", "content": content}})
        if index < min(3, len(items)):
            elements.append({"tag": "hr"})

    if len(items) > 3:
        compact_items = []
        for index, item in enumerate(items[3:], 4):
            profile = project_profile(item)
            source = str(item.get("source") or "未知来源")
            score = round(number(item.get("score")))
            features = " · ".join(profile["features"])
            compact_items.append(
                {"tag": "div", "text": {"tag": "lark_md", "content": (
                    f"<font color='blue'>**{index:02d}  ·  {score} 分**</font>  **{markdown_heading(item, 72)}**\n"
                    f"<font color='grey'>{source}</font>\n"
                    f"**场景**  {profile['scenario']}\n"
                    f"**亮点**  {profile['highlight']}\n"
                    f"<font color='grey'>Features  {features}</font>"
                )}}
            )
        elements.extend([{"tag": "hr"}, {"tag": "div", "text": {
            "tag": "lark_md", "content": "**快速掌握**  <font color='grey'>TOP 04–10</font>",
        }}])
        for compact in compact_items:
            elements.append(compact)

    elements.extend([
        {"tag": "hr"},
        {"tag": "div", "text": {
            "tag": "lark_md",
            "content": (
                "**来源结构**\n"
                f"<font color='grey'>{source_line}</font>\n"
                "<font color='grey'>聚合平台用于发现信号；最终判断优先引用官方公告、论文和仓库。</font>"
            ),
        }},
    ])

    if report.get("source_errors"):
        elements.extend([
            {"tag": "hr"},
            {"tag": "note", "elements": [{
                "tag": "plain_text",
                "content": "部分数据源暂不可用：" + "；".join(report["source_errors"]),
            }]},
        ])
    elements.append({
        "tag": "note",
        "elements": [{"tag": "plain_text", "content": "Technology Exploration Agent · 每天 09:00 自动更新"}],
    })
    return {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "template": "blue",
                "title": {"tag": "plain_text", "content": "AI 前沿雷达 · 每日精选"},
            },
            "elements": elements,
        },
    }


def send_feishu(report: dict, webhook: str) -> dict:
    if not webhook:
        raise ValueError("未配置飞书机器人 Webhook")
    body = json.dumps(build_feishu_payload(report), ensure_ascii=False).encode()
    response = HTTPClient().request(webhook, {"Content-Type": "application/json"}, body, timeout=12)
    result = json.loads(response.decode("utf-8")) if response else {}
    status = result.get("code", result.get("StatusCode", 0))
    if status != 0:
        message = result.get("msg", result.get("StatusMessage", "未知错误"))
        raise RuntimeError(f"飞书发送失败：{message}")
    return result


class DesktopApp:
    def __init__(self):
        self.root = Tk()
        self.root.title(APP_NAME)
        self.root.geometry("980x700")
        self.root.minsize(720, 520)
        self.store = ReportStore()
        self.report = None
        self.status = StringVar(value="准备就绪")
        self.build_ui()
        cached = self.store.latest()
        if cached:
            self.show_report(cached)
        self.root.after(350, self.refresh)

    def build_ui(self):
        style = ttk.Style()
        style.configure("Treeview", rowheight=34)
        toolbar = ttk.Frame(self.root, padding=(12, 10))
        toolbar.pack(fill=X)
        ttk.Button(toolbar, text="刷新", command=self.refresh).pack(side=LEFT)
        ttk.Button(toolbar, text="设置", command=self.open_settings).pack(side=LEFT, padx=(8, 0))
        ttk.Button(toolbar, text="报告目录", command=lambda: subprocess.Popen(["open", str(REPORT_DIR)])).pack(side=LEFT, padx=(8, 0))
        ttk.Label(toolbar, textvariable=self.status).pack(side=LEFT, padx=14)

        pane = ttk.Panedwindow(self.root, orient=VERTICAL)
        pane.pack(fill=BOTH, expand=True, padx=12, pady=(0, 12))
        table_frame = ttk.Frame(pane)
        self.tree = ttk.Treeview(table_frame, columns=("rank", "source", "score", "title"), show="headings")
        self.tree.heading("rank", text="#"); self.tree.column("rank", width=42, anchor="center", stretch=False)
        self.tree.heading("source", text="来源"); self.tree.column("source", width=145, stretch=False)
        self.tree.heading("score", text="评分"); self.tree.column("score", width=65, anchor="center", stretch=False)
        self.tree.heading("title", text="技术 / 产品"); self.tree.column("title", width=650)
        scroll = ttk.Scrollbar(table_frame, orient=VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side=LEFT, fill=BOTH, expand=True); scroll.pack(side=RIGHT, fill=Y)
        self.tree.bind("<<TreeviewSelect>>", self.select_item)
        self.tree.bind("<Double-1>", self.open_selected)
        pane.add(table_frame, weight=3)

        detail = ttk.Frame(pane, padding=12)
        self.detail_title = ttk.Label(detail, text="选择一条查看详情", font=("Helvetica", 17, "bold"), wraplength=880)
        self.detail_title.pack(anchor="w", fill=X)
        self.detail_meta = ttk.Label(detail, text="", foreground="#147d64")
        self.detail_meta.pack(anchor="w", pady=(6, 4))
        self.detail_summary = ttk.Label(detail, text="", wraplength=900, justify=LEFT)
        self.detail_summary.pack(anchor="w", fill=X)
        self.open_button = ttk.Button(detail, text="打开原始来源", command=self.open_selected, state="disabled")
        self.open_button.pack(anchor="w", pady=(12, 0))
        pane.add(detail, weight=2)

    def refresh(self):
        self.status.set("正在收集和清洗信息…")
        threading.Thread(target=self._refresh_worker, daemon=True).start()

    def _refresh_worker(self):
        try:
            config = load_config()
            report = create_report(config)
            self.store.save(report)
            if not config.get("feishu_paused", True):
                send_feishu(report, config.get("feishu_webhook", ""))
            self.root.after(0, lambda: self._refresh_done(report))
        except Exception as exc:
            message = f"生成失败：{exc}"
            self.root.after(0, lambda value=message: self.status.set(value))

    def _refresh_done(self, report: dict):
        self.show_report(report)
        self.status.set(f"已整理 {len(report['items'])} 条 · {dt.datetime.now().strftime('%H:%M')}")
        subprocess.run(["osascript", "-e", f'display notification "今天的 Top {len(report["items"])} 已生成" with title "AI 前沿信息已整理完成"'], check=False)

    def show_report(self, report: dict):
        self.report = report
        for row in self.tree.get_children():
            self.tree.delete(row)
        for index, item in enumerate(report.get("items", []), 1):
            self.tree.insert("", END, iid=str(index - 1), values=(index, item["source"], round(item["score"]), item["title"]))
        if report.get("items"):
            self.tree.selection_set("0")
            self.select_item()

    def select_item(self, _event=None):
        if not self.report or not self.tree.selection():
            return
        item = self.report["items"][int(self.tree.selection()[0])]
        self.detail_title.config(text=item["title"])
        self.detail_meta.config(text=f"{item['source']} · {round(item['score'])}/100 · {item['evidence']}")
        self.detail_summary.config(text=item["summary"] or "暂无简介，打开原始来源查看详情。")
        self.open_button.config(state="normal" if item.get("url") else "disabled")

    def open_selected(self, _event=None):
        if self.report and self.tree.selection():
            url = self.report["items"][int(self.tree.selection()[0])].get("url")
            if url:
                webbrowser.open(url)

    def open_settings(self):
        config = load_config()
        window = Toplevel(self.root)
        window.title("数据源与通知设置")
        window.transient(self.root); window.grab_set(); window.resizable(False, False)
        frame = ttk.Frame(window, padding=18); frame.pack(fill=BOTH, expand=True)
        entries = {}
        fields = [
            ("research_topic", "检索主题"),
            ("research_keywords", "检索关键词（用逗号分隔）"),
            ("ark_api_key", "方舟 ARK API Key"),
            ("ark_base_url", "方舟 API Base URL"),
            ("ark_model", "方舟模型 / 接入点 ID"),
            ("tikhub_api_token", "TikHub API Token（一把 Key 接入多平台）"),
            ("tikhub_base_url", "TikHub API Base URL"),
            ("youtube_key", "YouTube Data API Key"), ("x_bearer_token", "X Bearer Token"),
            ("feishu_webhook", "飞书机器人 Webhook"), ("media_crawler_path", "MediaCrawler JSON/JSONL 导出目录"),
        ]
        for row, (key, label) in enumerate(fields):
            ttk.Label(frame, text=label).grid(row=row * 2, column=0, sticky="w", pady=(4, 2))
            entry = ttk.Entry(frame, width=70, show="•" if key.endswith("key") or "token" in key or "webhook" in key else "")
            entry.insert(0, config.get(key, "")); entry.grid(row=row * 2 + 1, column=0, sticky="ew", pady=(0, 7)); entries[key] = entry
        footer_row = len(fields) * 2
        send_feishu = BooleanVar(value=not config.get("feishu_paused", True))
        ttk.Checkbutton(
            frame, text="发送每日 Top 10 到飞书机器人", variable=send_feishu,
        ).grid(row=footer_row, column=0, sticky="w", pady=(5, 4))
        ttk.Label(frame, text="密钥仅保存在本机。留空会跳过对应数据源。", foreground="#68717d").grid(row=footer_row + 1, column=0, sticky="w", pady=(0, 10))
        buttons = ttk.Frame(frame); buttons.grid(row=footer_row + 2, column=0, sticky="e")
        ttk.Button(buttons, text="取消", command=window.destroy).pack(side=LEFT)

        def save():
            if send_feishu.get() and not entries["feishu_webhook"].get().strip():
                messagebox.showerror("缺少 Webhook", "请先填写飞书机器人 Webhook，或关闭发送开关。", parent=window)
                return
            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            saved = dict(config)
            saved.update({
                key: entry.get().strip()
                for key, entry in entries.items()
            })
            saved["research_topic"] = (
                saved["research_topic"] or DEFAULT_RESEARCH_TOPIC
            )
            saved["research_keywords"] = (
                saved["research_keywords"]
                or ", ".join(DEFAULT_RESEARCH_KEYWORDS)
            )
            saved["feishu_paused"] = not send_feishu.get()
            save_config(saved)
            window.destroy(); self.refresh()

        ttk.Button(buttons, text="保存并刷新", command=save).pack(side=LEFT, padx=(8, 0))

    def run(self):
        self.root.mainloop()


def collect_once() -> int:
    report = create_report(load_config())
    json_path, html_path = ReportStore().save(report)
    config = load_config()
    if not config.get("feishu_paused", True):
        send_feishu(report, config.get("feishu_webhook", ""))
    print(json.dumps({"items": len(report["items"]), "json": str(json_path), "html": str(html_path), "errors": report["source_errors"]}, ensure_ascii=False))
    return 0 if report["items"] else 1


def collect_preview() -> int:
    report = create_report(load_config())
    json_path, html_path = ReportStore().save(report)
    print(json.dumps({
        "items": len(report.get("items", [])),
        "sources": [
            {"label": group.get("label"), "items": len(group.get("items", []))}
            for group in report.get("source_top10", [])
        ],
        "model": report.get("analysis_model"),
        "json": str(json_path),
        "html": str(html_path),
        "feishu_sent": False,
    }, ensure_ascii=False))
    return 0 if report.get("items") else 1


def atomic_json_write(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def advisory_terms(profile: dict) -> list[str]:
    values = []
    for key in ("businessDomain", "summary"):
        value = profile.get(key)
        if isinstance(value, str):
            values.append(value)
    for key in ("goals", "capabilities", "nonFunctionalRequirements"):
        value = profile.get(key)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
    text = " ".join(values)
    terms = [
        token.lower()
        for token in re.split(r"[\s，。；、,.;/：:（）()]+", text)
        if len(token.strip()) >= 2
    ]
    for source, targets in REQUIREMENT_TRANSLATIONS.items():
        if source in text:
            terms.extend(targets)
    return list(dict.fromkeys(terms))[:24]


def github_repository_urls(item: dict) -> list[str]:
    values = [str(item.get("url") or ""), str(item.get("summary") or "")]
    urls = []
    pattern = re.compile(r"https?://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)")
    for value in values:
        for owner, repository in pattern.findall(value):
            repository = repository.rstrip(".,);]}")
            canonical = f"https://github.com/{owner}/{repository}"
            if canonical not in urls:
                urls.append(canonical)
    return urls


def github_api_repository(url: str) -> dict:
    path = urllib.parse.urlparse(url).path.strip("/").split("/")
    if len(path) < 2:
        raise ValueError(f"无效 GitHub 仓库地址: {url}")
    owner, repository = path[0], path[1]
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = json.loads(HTTPClient().request(
        f"https://api.github.com/repos/{owner}/{repository}",
        headers=headers,
        timeout=15,
    ))
    return {
        "name": payload.get("name") or repository,
        "fullName": payload.get("full_name") or f"{owner}/{repository}",
        "url": payload.get("html_url") or url,
        "cloneUrl": payload.get("clone_url") or f"https://github.com/{owner}/{repository}.git",
        "description": clean_text(str(payload.get("description") or "")),
        "language": payload.get("language") or "多语言",
        "stars": int(payload.get("stargazers_count") or 0),
        "forks": int(payload.get("forks_count") or 0),
        "openIssues": int(payload.get("open_issues_count") or 0),
        "updatedAt": payload.get("updated_at") or "",
        "pushedAt": payload.get("pushed_at") or "",
        "defaultBranch": payload.get("default_branch") or "main",
        "license": (payload.get("license") or {}).get("spdx_id") or "待核实",
        "archived": bool(payload.get("archived")),
        "topics": payload.get("topics") or [],
    }


def github_search_repositories(terms: list[str], limit: int) -> list[dict]:
    available = {
        term for term in terms
        if re.fullmatch(r"[a-z0-9_.-]+", term)
    }
    preferred = [
        term for term in (
            "cmms", "work-order", "equipment", "approval", "knowledge-base",
            "low-code", "analytics", "ai-agent", "search",
        )
        if term in available
    ]
    search_terms = preferred or [
        term for term in available
        if term not in {"rag", "asset", "maintenance", "workflow"}
    ]
    if not search_terms:
        return []
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    repositories = {}
    for term in search_terms[:4]:
        params = urllib.parse.urlencode({
            "q": f"{term} stars:>20 archived:false",
            "sort": "stars",
            "order": "desc",
            "per_page": min(10, max(5, limit)),
        })
        payload = json.loads(HTTPClient().request(
            f"https://api.github.com/search/repositories?{params}",
            headers=headers,
            timeout=20,
        ))
        for row in payload.get("items", []):
            full_name = row.get("full_name") or ""
            if not full_name:
                continue
            repositories.setdefault(full_name, {
                "name": row.get("name") or "",
                "fullName": full_name,
                "url": row.get("html_url") or "",
                "cloneUrl": row.get("clone_url") or "",
                "description": clean_text(str(row.get("description") or "")),
                "language": row.get("language") or "多语言",
                "stars": int(row.get("stargazers_count") or 0),
                "forks": int(row.get("forks_count") or 0),
                "openIssues": int(row.get("open_issues_count") or 0),
                "updatedAt": row.get("updated_at") or "",
                "pushedAt": row.get("pushed_at") or "",
                "defaultBranch": row.get("default_branch") or "main",
                "license": (row.get("license") or {}).get("spdx_id") or "待核实",
                "archived": bool(row.get("archived")),
                "topics": row.get("topics") or [],
            })
    return list(repositories.values())


def repository_fit(
    repository: dict,
    terms: list[str],
    trend_signal: Optional[dict],
    forbidden_licenses: set[str],
) -> dict:
    haystack = " ".join([
        repository.get("fullName", ""),
        repository.get("description", ""),
        repository.get("language", ""),
        " ".join(repository.get("topics") or []),
        str((trend_signal or {}).get("summary") or ""),
    ]).lower()
    normalized_haystack = haystack.replace("-", " ").replace("_", " ")
    matched = [
        term for term in terms
        if term.lower() in haystack
        or term.lower().replace("-", " ").replace("_", " ") in normalized_haystack
    ]
    coverage = min(30, round(30 * len(matched) / max(1, min(6, len(terms)))))
    demo_speed = 15 if repository.get("description") else 8
    integration = 12 if repository.get("language") not in ("", "多语言") else 7
    maturity = min(10, 3 + round(math.log10(max(1, repository.get("stars", 0))) * 1.8))
    license_value = repository.get("license") or "待核实"
    license_blocked = license_value in forbidden_licenses
    safety = (
        0 if license_blocked
        else 15 if license_value in ("MIT", "Apache-2.0", "BSD-3-Clause", "MPL-2.0")
        else 8 if license_value != "待核实"
        else 3
    )
    documentation = 4
    trend = min(5, round(number((trend_signal or {}).get("score")) / 20)) if trend_signal else 0
    score = min(100, coverage + demo_speed + integration + maturity + safety + documentation + trend)
    confidence = "high" if license_value != "待核实" and len(matched) >= 3 else "medium" if matched else "low"
    verdict = (
        "许可证阻断" if license_blocked
        else "小范围试用" if score >= 72 and confidence != "low"
        else "仅作参考" if score >= 52
        else "不建议"
    )
    matched_label = "、".join(
        REQUIREMENT_TERM_LABELS.get(term, term)
        for term in matched[:4]
    ) or "通用工程能力"
    confidence_label = {"high": "证据充分", "medium": "建议验证", "low": "证据较弱"}[confidence]
    coverage_percent = min(100, round(coverage / 30 * 100))
    implementation_plan = [
        {
            "stage": "验证",
            "title": "先跑通核心场景",
            "detail": f"用 {repository.get('fullName') or repository.get('name')} 完成一个最小样例，确认 {matched_label} 能力。",
        },
        {
            "stage": "连接",
            "title": "接入现有业务流程",
            "detail": "通过 API 或模块边界连接账号、数据和审批流程，不直接改动核心业务数据。",
        },
        {
            "stage": "加固",
            "title": "补齐权限与可靠性",
            "detail": "增加权限控制、操作审计、失败回滚和关键流程人工确认。",
        },
        {
            "stage": "上线",
            "title": "小范围试用后推广",
            "detail": "先让一个团队试用，以完成时间、错误率和人工节省量决定是否扩大使用。",
        },
    ]
    risk_notes = []
    if license_value == "待核实":
        risk_notes.append("开源许可证尚未确认，商用前必须核实")
    if license_blocked:
        risk_notes.append(f"{license_value} 许可证不符合当前约束")
    if repository.get("archived"):
        risk_notes.append("仓库已经归档，不建议作为长期核心依赖")
    if confidence == "low":
        risk_notes.append("当前需求证据较少，只适合作为参考")
    return {
        **repository,
        "fitScore": score,
        "trendScore": round(number((trend_signal or {}).get("score"))) if trend_signal else 0,
        "evidenceConfidence": confidence,
        "verdict": verdict,
        "licenseBlocked": license_blocked,
        "matchedTerms": matched[:8],
        "coveragePercent": coverage_percent,
        "confidenceLabel": confidence_label,
        "plainDescription": (
            f"一个覆盖“{matched_label}”的开源社区项目。"
            f"主要开发语言为 {repository.get('language') or '多语言'}，"
            f"社区已有 {compact_count(repository.get('stars', 0))} Stars。"
        ),
        "plainExplanation": (
            f"它与需求中的“{matched_label}”直接相关；"
            f"项目成熟度和接入条件综合评分为 {score} 分。"
        ),
        "adoptionAdvice": (
            "可以进入原型验证，不建议直接替换现有系统。"
            if verdict == "小范围试用"
            else "可借鉴设计或局部模块，核心流程仍建议自主实现。"
            if verdict == "仅作参考"
            else "当前风险高于收益，暂不建议采用。"
        ),
        "implementationPlan": implementation_plan,
        "riskNotes": risk_notes or ["未发现阻断性风险，但仍需完成真实数据验证"],
        "breakdown": {
            "requirementCoverage": coverage,
            "demoSpeed": demo_speed,
            "stackFit": integration,
            "maturity": maturity,
            "licenseAndSafety": safety,
            "documentation": documentation,
            "trend": trend,
        },
        "sourceSignals": [{
            "source": (trend_signal or {}).get("source") or "GitHub Search",
            "evidence": (trend_signal or {}).get("evidence") or "GitHub 实时仓库检索",
            "observedAt": (trend_signal or {}).get("published_at") or now_iso(),
        }],
    }


def build_advisory(request: dict, progress=None) -> dict:
    profile = request.get("requirementProfile") or {}
    constraints = profile.get("constraints") if isinstance(profile.get("constraints"), dict) else {}
    forbidden_licenses = {
        str(value) for value in constraints.get("forbiddenLicenses") or ["AGPL-3.0"]
    }
    job_id = str(request.get("jobId") or "")
    limit = min(12, max(1, int(request.get("maxCandidates") or 8)))
    terms = advisory_terms(profile)
    if progress:
        progress("discovering", 15, "正在从技术情报快照发现相关开源项目")
    report = ReportStore().latest() or {}
    trend_by_url = {}
    all_items = list(report.get("items") or [])
    for group in report.get("source_top10") or []:
        all_items.extend(group.get("items") or [])
    for item in all_items:
        signal_text = " ".join([
            str(item.get("title") or ""),
            str(item.get("summary") or ""),
            str(item.get("evidence") or ""),
        ]).lower()
        if not any(term.lower() in signal_text for term in terms):
            continue
        for url in github_repository_urls(item):
            current = trend_by_url.get(url)
            if not current or number(item.get("score")) > number(current.get("score")):
                trend_by_url[url] = item
    repositories = {}
    for url, signal in trend_by_url.items():
        try:
            repository = github_api_repository(url)
            repositories[repository["fullName"]] = (repository, signal)
        except Exception:
            continue
    if progress:
        progress("searching", 40, "正在使用需求关键词补充 GitHub 实时候选")
    try:
        for repository in github_search_repositories(terms, limit):
            repositories.setdefault(repository["fullName"], (repository, None))
    except Exception:
        pass
    if progress:
        progress("scoring", 70, "正在计算需求覆盖、Demo 速度与工程可信度")
    candidates = [
        repository_fit(repository, terms, signal, forbidden_licenses)
        for repository, signal in repositories.values()
    ]
    strong_terms = {
        "cmms", "work-order", "approval", "equipment", "knowledge-base",
        "low-code", "analytics", "ai-agent", "search",
    }
    candidates = [
        candidate for candidate in candidates
        if strong_terms.intersection(candidate["matchedTerms"])
        or len(candidate["matchedTerms"]) >= 2
    ]
    candidates.sort(key=lambda item: item["fitScore"], reverse=True)
    candidates = candidates[:limit]
    recommended = next(
        (candidate for candidate in candidates if not candidate["licenseBlocked"]),
        None,
    )
    recommendation = recommended["fullName"] if recommended else None
    return {
        "schemaVersion": "1.0",
        "jobId": job_id,
        "state": "completed",
        "completed": True,
        "generatedAt": now_iso(),
        "provider": "technology-exploration",
        "analysisModel": report.get("analysis_model") or "local-rules",
        "requirementTerms": terms,
        "candidates": candidates,
        "recommendation": recommendation,
        "summary": (
            f"发现 {len(candidates)} 个 GitHub 候选，优先建议验证 {recommendation}"
            if recommendation else "没有发现满足最低证据要求的 GitHub 候选，建议独立开发"
        ),
        "sourceHealth": report.get("source_status") or [],
        "notice": None if report else "当前没有技术情报快照，仅使用 GitHub 实时检索",
    }


def advisory_job_path(job_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "-", job_id)[:100]
    if not safe:
        raise ValueError("jobId 不能为空")
    return JOB_DIR / safe


def validate_advisory_request(request: dict) -> dict:
    if not isinstance(request, dict):
        raise ValueError("请求必须是 JSON 对象")
    if request.get("schemaVersion") not in (None, "1.0"):
        raise ValueError("仅支持 schemaVersion 1.0")
    job_id = str(request.get("jobId") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{2,99}", job_id):
        raise ValueError("jobId 必须为 3-100 位字母、数字、点、下划线或连字符")
    profile = request.get("requirementProfile")
    if not isinstance(profile, dict):
        raise ValueError("requirementProfile 不能为空")
    if not advisory_terms(profile):
        raise ValueError("requirementProfile 必须包含业务领域、摘要或能力")
    depth = request.get("depth") or "recommend"
    if depth not in ("recommend", "verify", "code_graph"):
        raise ValueError("depth 必须为 recommend、verify 或 code_graph")
    normalized = dict(request)
    normalized["schemaVersion"] = "1.0"
    normalized["jobId"] = job_id
    normalized["depth"] = depth
    normalized["maxCandidates"] = min(12, max(1, int(request.get("maxCandidates") or 8)))
    return normalized


def run_advisory_job(request: dict) -> dict:
    request = validate_advisory_request(request)
    job_id = request["jobId"]
    root = advisory_job_path(job_id)
    root.mkdir(parents=True, exist_ok=True)
    atomic_json_write(root / "request.json", request)
    event_path = root / "events.jsonl"

    def progress(phase: str, percent: int, message: str):
        if (root / "cancel.json").is_file():
            raise RuntimeError("任务已取消")
        payload = {
            "jobId": job_id,
            "state": "running",
            "phase": phase,
            "percent": percent,
            "message": message,
            "completed": False,
            "updatedAt": now_iso(),
        }
        atomic_json_write(root / "progress.json", payload)
        with event_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(payload, ensure_ascii=False) + "\n")

    try:
        progress("starting", 5, "技术参考任务已启动")
        result = build_advisory(request, progress)
        atomic_json_write(root / "result.json", result)
        progress_payload = {
            "jobId": job_id,
            "state": "completed",
            "phase": "completed",
            "percent": 100,
            "message": result["summary"],
            "completed": True,
            "updatedAt": now_iso(),
        }
        atomic_json_write(root / "progress.json", progress_payload)
        with event_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(progress_payload, ensure_ascii=False) + "\n")
        return result
    except Exception as exc:
        failure = {
            "jobId": job_id,
            "state": "failed",
            "phase": "failed",
            "percent": 100,
            "message": clean_text(str(exc))[:500],
            "completed": False,
            "updatedAt": now_iso(),
        }
        atomic_json_write(root / "progress.json", failure)
        atomic_json_write(root / "result.json", failure)
        raise


PROJECT_SCAN_LOCK = threading.Lock()
PROJECT_SNAPSHOT_LOCK = threading.Lock()
PROJECTS_SCANNING: set[str] = set()


def project_path(project_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "-", project_id)[:80]
    if not safe:
        raise ValueError("项目 ID 不能为空")
    return PROJECT_DIR / safe


def load_requirement_project(project_id: str) -> Optional[dict]:
    path = project_path(project_id) / "project.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def list_requirement_projects() -> list[dict]:
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    projects = []
    for path in PROJECT_DIR.glob("*/project.json"):
        try:
            project = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        result_path = path.parent / "latest-result.json"
        if result_path.is_file():
            try:
                result = json.loads(result_path.read_text(encoding="utf-8"))
                candidates = result.get("candidates") or []
                project["matchCount"] = len(candidates)
                project["topMatch"] = candidates[0] if candidates else None
                project["matches"] = candidates[:3]
                project["recommendation"] = result.get("recommendation")
                project["sourceCount"] = sum(
                    1 for status in result.get("sourceHealth") or []
                    if status.get("status") == "ok"
                )
            except (OSError, json.JSONDecodeError):
                pass
        delivery_root = DEMO_HANDOFF_DIR
        deliveries = []
        if delivery_root.is_dir():
            for delivery_path in delivery_root.glob("*/status.json"):
                try:
                    delivery = json.loads(delivery_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if delivery.get("projectId") == project.get("id"):
                    deliveries.append(delivery)
        deliveries.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
        project["deliveries"] = deliveries[:10]
        project["activeDelivery"] = next(
            (
                item for item in deliveries
                if item.get("state") not in ("completed", "failed", "cancelled")
            ),
            deliveries[0] if deliveries else None,
        )
        projects.append(project)
    projects.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
    return projects


def normalize_project_payload(payload: dict, existing: Optional[dict] = None) -> dict:
    name = clean_text(str(payload.get("name") or ""))
    summary = clean_text(str(payload.get("summary") or ""))
    if not name:
        raise ValueError("项目名称不能为空")
    if len(summary) < 8:
        raise ValueError("需求说明至少需要 8 个字")
    raw_capabilities = payload.get("capabilities") or []
    if isinstance(raw_capabilities, str):
        raw_capabilities = re.split(r"[,，、\n]+", raw_capabilities)
    capabilities = [
        clean_text(str(value))
        for value in raw_capabilities
        if clean_text(str(value))
    ][:20]
    now = now_iso()
    project_id = str((existing or {}).get("id") or f"req-{uuid.uuid4().hex[:12]}")
    project = {
        **(existing or {}),
        "id": project_id,
        "name": name[:80],
        "businessDomain": clean_text(str(payload.get("businessDomain") or "通用业务"))[:40],
        "summary": summary[:1200],
        "capabilities": capabilities,
        "status": str(payload.get("status") or (existing or {}).get("status") or "active"),
        "executionTool": str(
            payload.get("executionTool")
            or (existing or {}).get("executionTool")
            or "oneopc"
        ) if str(
            payload.get("executionTool")
            or (existing or {}).get("executionTool")
            or "oneopc"
        ) in ("oneopc", "delivery-pilot") else "oneopc",
        "autoBuildDemo": bool(
            payload.get("autoBuildDemo", (existing or {}).get("autoBuildDemo", False))
        ),
        "scanIntervalSeconds": PROJECT_SCAN_INTERVAL_SECONDS,
        "createdAt": (existing or {}).get("createdAt") or now,
        "updatedAt": now,
        "scanStatus": (existing or {}).get("scanStatus") or "waiting",
        "lastScannedAt": (existing or {}).get("lastScannedAt"),
        "nextScanAt": (existing or {}).get("nextScanAt") or now,
    }
    return project


def save_requirement_project(payload: dict, project_id: Optional[str] = None) -> dict:
    existing = load_requirement_project(project_id) if project_id else None
    if project_id and not existing:
        raise ValueError("项目不存在")
    project = normalize_project_payload(payload, existing)
    root = project_path(project["id"])
    root.mkdir(parents=True, exist_ok=True)
    (root / "history").mkdir(exist_ok=True)
    atomic_json_write(root / "project.json", project)
    return project


def project_advisory_request(project: dict) -> dict:
    return {
        "schemaVersion": "1.0",
        "jobId": f"project-{project['id']}-{int(time.time())}",
        "requirementProfile": {
            "businessDomain": project.get("businessDomain") or "",
            "summary": project.get("summary") or "",
            "capabilities": project.get("capabilities") or [],
        },
        "depth": "code_graph",
        "maxCandidates": 8,
    }


def ensure_fresh_project_snapshot() -> Optional[dict]:
    with PROJECT_SNAPSHOT_LOCK:
        files = sorted(
            REPORT_DIR.glob("*.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if files and time.time() - files[0].stat().st_mtime < PROJECT_SCAN_INTERVAL_SECONDS:
            return ReportStore().latest()
        try:
            report = Aggregator(load_config()).collect()
            ReportStore().save(report)
            return report
        except Exception:
            return ReportStore().latest()


def scan_requirement_project(project_id: str) -> dict:
    with PROJECT_SCAN_LOCK:
        if project_id in PROJECTS_SCANNING:
            return {"projectId": project_id, "state": "running"}
        PROJECTS_SCANNING.add(project_id)
    try:
        project = load_requirement_project(project_id)
        if not project:
            raise ValueError("项目不存在")
        project["scanStatus"] = "running"
        project["scanPhase"] = "正在刷新已配置数据源"
        project["updatedAt"] = now_iso()
        atomic_json_write(project_path(project_id) / "project.json", project)
        snapshot = ensure_fresh_project_snapshot()
        project["scanPhase"] = "正在匹配技术与开源社区"
        atomic_json_write(project_path(project_id) / "project.json", project)
        result = build_advisory(project_advisory_request(project))
        result["projectId"] = project_id
        result["projectName"] = project["name"]
        result["requirementSummary"] = project["summary"]
        result["snapshotGeneratedAt"] = (
            snapshot.get("generated_at") if snapshot else None
        )
        root = project_path(project_id)
        atomic_json_write(root / "latest-result.json", result)
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        atomic_json_write(root / "history" / f"{stamp}.json", result)
        scanned = dt.datetime.now(dt.timezone.utc)
        project["scanStatus"] = "completed"
        project["scanPhase"] = "等待下次自动扫描"
        project["lastScannedAt"] = scanned.isoformat()
        project["nextScanAt"] = (
            scanned + dt.timedelta(seconds=PROJECT_SCAN_INTERVAL_SECONDS)
        ).isoformat()
        project["lastMatchCount"] = len(result.get("candidates") or [])
        project["updatedAt"] = now_iso()
        atomic_json_write(root / "project.json", project)
        if project.get("autoBuildDemo") and result.get("candidates"):
            active_exists = False
            if DEMO_HANDOFF_DIR.is_dir():
                for status_path in DEMO_HANDOFF_DIR.glob("*/status.json"):
                    try:
                        delivery = json.loads(status_path.read_text(encoding="utf-8"))
                    except (OSError, json.JSONDecodeError):
                        continue
                    if (
                        delivery.get("projectId") == project_id
                        and delivery.get("state")
                        not in ("completed", "failed", "cancelled")
                    ):
                        active_exists = True
                        break
            if not active_exists:
                launch_demo_delivery(project_id, {
                    "tool": project.get("executionTool") or "oneopc",
                    "candidate": result["candidates"][0].get("fullName"),
                })
        return result
    except Exception as exc:
        project = load_requirement_project(project_id)
        if project:
            project["scanStatus"] = "failed"
            project["scanError"] = clean_text(str(exc))[:300]
            project["nextScanAt"] = (
                dt.datetime.now(dt.timezone.utc)
                + dt.timedelta(seconds=PROJECT_SCAN_INTERVAL_SECONDS)
            ).isoformat()
            project["updatedAt"] = now_iso()
            atomic_json_write(project_path(project_id) / "project.json", project)
        raise
    finally:
        with PROJECT_SCAN_LOCK:
            PROJECTS_SCANNING.discard(project_id)


def project_scan_due(project: dict) -> bool:
    if project.get("status") != "active" or project.get("scanStatus") == "running":
        return False
    next_scan = parse_date(project.get("nextScanAt"))
    return not next_scan or next_scan <= dt.datetime.now(dt.timezone.utc)


def delivery_tool_info(tool: str) -> dict:
    home = Path.home()
    if tool == "delivery-pilot":
        candidates = [
            Path("/Applications/DeliveryPilot.app"),
            home / "Applications/DeliveryPilot.app",
            Path(__file__).resolve().parents[2] / "delivery-pilot/release/DeliveryPilot.app",
        ]
        return {
            "id": tool,
            "name": "DeliveryPilot",
            "bundleId": "com.deliverypilot.desktop",
            "appPath": next((str(path) for path in candidates if path.is_dir()), None),
        }
    candidates = [
        Path("/Applications/delivery-control-center.app"),
        home / "Applications/delivery-control-center.app",
        Path(__file__).resolve().parents[2] / "delivery-control-center/dist/mac-arm64/delivery-control-center.app",
    ]
    return {
        "id": "oneopc",
        "name": "OneOPC",
        "bundleId": "com.oneopc.desktop",
        "appPath": next((str(path) for path in candidates if path.is_dir()), None),
    }


def demo_handoff_markdown(project: dict, candidate: dict) -> str:
    capabilities = "\n".join(
        f"- {value}" for value in project.get("capabilities") or []
    ) or "- 根据需求分析补充"
    implementation = "\n".join(
        f"{index}. **{step.get('title')}**：{step.get('detail')}"
        for index, step in enumerate(candidate.get("implementationPlan") or [], 1)
    )
    return f"""# {project["name"]} Demo 交付需求

## 业务目标

{project["summary"]}

## 必须实现的能力

{capabilities}

## 已匹配的技术参考

- 项目：{candidate.get("fullName")}
- 地址：{candidate.get("url")}
- 匹配分：{candidate.get("fitScore")}
- 需求覆盖：{candidate.get("coveragePercent")}%
- 许可证：{candidate.get("license")}
- 采用建议：{candidate.get("adoptionAdvice")}

该项目只作为有证据的技术参考。不得执行未知仓库脚本，不得直接复制不兼容许可证代码。

## 建议实现路径

{implementation}

## Demo 验收标准

1. 核心业务流程可以在本机浏览器完整操作。
2. 使用真实 HTTP 地址交付，不得仅提供 `file://` 文件路径。
3. 关键业务状态和异常提示可见。
4. 提供自动化验收结果、实现说明和已知限制。
5. 所有研发过程资产与原始需求物理隔离。
"""


def launch_demo_delivery(project_id: str, payload: dict) -> dict:
    project = load_requirement_project(project_id)
    if not project:
        raise ValueError("项目不存在")
    result_path = project_path(project_id) / "latest-result.json"
    if not result_path.is_file():
        raise ValueError("项目尚未完成技术匹配")
    result = json.loads(result_path.read_text(encoding="utf-8"))
    candidates = result.get("candidates") or []
    candidate_name = str(payload.get("candidate") or "")
    candidate = next(
        (item for item in candidates if item.get("fullName") == candidate_name),
        candidates[0] if candidates else None,
    )
    if not candidate:
        raise ValueError("没有可用于 Demo 的匹配方案")
    tool = str(payload.get("tool") or project.get("executionTool") or "oneopc")
    if tool not in ("oneopc", "delivery-pilot"):
        raise ValueError("不支持的交付工具")
    tool_info = delivery_tool_info(tool)
    if not tool_info["appPath"]:
        raise ValueError(f"未检测到 {tool_info['name']}，请先构建或安装应用")
    delivery_id = f"demo-{dt.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
    root = DEMO_HANDOFF_DIR / delivery_id
    root.mkdir(parents=True, exist_ok=False)
    requirement_path = root / "requirement.md"
    requirement_path.write_text(
        demo_handoff_markdown(project, candidate),
        encoding="utf-8",
    )
    handoff = {
        "schemaVersion": "technology-demo-handoff/1.0",
        "deliveryId": delivery_id,
        "projectId": project_id,
        "projectName": project["name"],
        "businessDomain": project.get("businessDomain"),
        "summary": project["summary"],
        "capabilities": project.get("capabilities") or [],
        "executionTool": tool,
        "mode": "unattended",
        "autoStart": True,
        "requirementPath": str(requirement_path),
        "technologyProjectId": project_id,
        "technologyResultPath": str(result_path),
        "selectedCandidate": candidate,
        "acceptance": [
            "核心业务流程可在本机浏览器完整操作",
            "提供真实 HTTP Demo 地址",
            "自动化验收通过并保存证据",
        ],
        "createdAt": now_iso(),
    }
    atomic_json_write(root / "request.json", handoff)
    status = {
        "deliveryId": delivery_id,
        "projectId": project_id,
        "tool": tool,
        "toolName": tool_info["name"],
        "state": "queued",
        "phase": "等待执行工具接收",
        "percent": 2,
        "message": f"已创建交付事件，正在启动 {tool_info['name']}",
        "requirementPath": str(requirement_path),
        "events": [{
            "at": now_iso(),
            "type": "handoff.created",
            "message": "Technology Exploration 已生成不可变需求包",
        }],
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    atomic_json_write(root / "status.json", status)
    subprocess.Popen(
        [
            "/usr/bin/open", tool_info["appPath"], "--args",
            "--technology-handoff", str(root / "request.json"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    project["executionTool"] = tool
    project["updatedAt"] = now_iso()
    atomic_json_write(project_path(project_id) / "project.json", project)
    return status


def load_demo_delivery(delivery_id: str) -> Optional[dict]:
    path = DEMO_HANDOFF_DIR / re.sub(r"[^A-Za-z0-9_.-]", "-", delivery_id) / "status.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def project_monitor_loop():
    while True:
        for project in list_requirement_projects():
            if not project_scan_due(project):
                continue
            try:
                scan_requirement_project(str(project["id"]))
            except Exception:
                pass
        time.sleep(15)


def project_center_html() -> str:
    return """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>项目需求中心</title><style>
:root{--bg:#f3f5f7;--panel:#fff;--soft:#f6f7f9;--text:#171a1f;--muted:#6d7580;--line:#dde2e8;--blue:#356fd6;--green:#16866d;--amber:#b56d12;--red:#c34e45;--shadow:0 1px 2px rgba(20,27,38,.04),0 10px 28px rgba(20,27,38,.07)}
@media(prefers-color-scheme:dark){:root{--bg:#15181c;--panel:#1d2126;--soft:#252a30;--text:#f2f4f7;--muted:#9ca5b1;--line:#323840;--blue:#7ca7ef;--green:#55c4a2;--amber:#e7ac58;--red:#ef8b82;--shadow:0 12px 32px rgba(0,0,0,.22)}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}button,input,textarea,select{font:inherit}button{cursor:pointer}.shell{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh}.side{padding:24px 16px;border-right:1px solid var(--line);background:var(--panel);position:sticky;top:0;height:100vh;overflow:auto}.side-head{display:flex;align-items:center;justify-content:space-between;margin:0 8px 18px}.side-head h1{font-size:14px;margin:0}.new{width:30px;height:30px;border:0;border-radius:7px;background:var(--blue);color:#fff;font-size:20px}.project-list{display:grid;gap:5px}.project-item{width:100%;padding:11px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text);text-align:left}.project-item:hover{background:var(--soft)}.project-item.active{border-color:var(--line);background:var(--soft)}.project-item b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-item span{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--muted);font-size:10px}.dot{width:6px;height:6px;border-radius:50%;background:var(--muted)}.dot.completed{background:var(--green)}.dot.running{background:var(--blue)}.dot.failed{background:var(--red)}.side-note{margin:20px 8px 0;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}.main{padding:32px 36px 70px;max-width:1220px;width:100%;margin:auto}.empty{display:grid;place-items:center;min-height:65vh;text-align:center}.empty h2{font-size:24px;margin:0 0 8px}.empty p{max-width:430px;color:var(--muted)}.primary,.secondary{height:34px;padding:0 13px;border-radius:7px;font-weight:650}.primary{border:0;background:var(--blue);color:#fff}.secondary{border:1px solid var(--line);background:var(--panel);color:var(--text)}.hero{display:flex;gap:20px;align-items:flex-start;margin-bottom:22px}.hero>div:first-child{flex:1}.eyebrow{color:var(--blue);font-size:10px;font-weight:700}.hero h2{font-size:28px;line-height:1.25;margin:5px 0 8px}.hero p{max-width:760px;margin:0;color:var(--muted);font-size:13px}.hero-actions{display:flex;gap:8px}.statusbar{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:22px;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:var(--shadow)}.statusbar>div{padding:14px 16px;border-right:1px solid var(--line)}.statusbar>div:last-child{border:0}.statusbar b{display:block;font-size:16px}.statusbar span{color:var(--muted);font-size:10px}.section-head{display:flex;align-items:end;justify-content:space-between;margin:24px 0 11px}.section-head h3{font-size:16px;margin:0}.section-head span{color:var(--muted);font-size:10px}.flow{display:grid;grid-template-columns:1fr 34px 1fr 34px 1fr 34px 1fr;align-items:stretch;margin-bottom:22px}.node{min-height:92px;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.node small{display:block;color:var(--blue);font-weight:700}.node b{display:block;margin:5px 0 3px}.node span{color:var(--muted);font-size:10px}.arrow{display:grid;place-items:center;color:var(--muted);font-size:18px}.match-list{display:grid;gap:12px}.match{padding:19px 20px;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:var(--shadow)}.match-top{display:flex;gap:16px}.score{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:conic-gradient(var(--green) calc(var(--score)*1%),var(--soft) 0);position:relative;flex:none}.score:after{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--panel)}.score b{position:relative;z-index:1;font-size:16px}.match-title{flex:1;min-width:0}.match-title h4{margin:0 0 4px;font-size:17px}.match-title h4 a{color:inherit;text-decoration:none}.match-title h4 a:hover{color:var(--blue)}.match-title p{margin:0;color:var(--muted)}.match-title small{display:block;margin-top:5px;color:var(--muted);font-size:10px}.verdict{height:25px;padding:3px 8px;border-radius:5px;background:color-mix(in srgb,var(--green) 12%,var(--panel));color:var(--green);font-size:10px;font-weight:700}.explain{margin:15px 0 0;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.explain b{color:var(--blue);font-size:10px}.explain p{margin:4px 0 0}.bars{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0}.bar label{display:flex;justify-content:space-between;color:var(--muted);font-size:10px}.track{height:5px;margin-top:5px;border-radius:3px;background:var(--soft);overflow:hidden}.track i{display:block;height:100%;background:var(--blue)}.plan{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:16px}.step{position:relative;padding:0 14px;border-left:2px solid var(--line)}.step:first-child{border-color:var(--blue)}.step small{color:var(--blue);font-weight:700}.step b{display:block;margin:4px 0;font-size:11px}.step p{margin:0;color:var(--muted);font-size:10px}.risks{margin-top:14px;color:var(--amber);font-size:10px}.modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(15,20,28,.42);backdrop-filter:blur(6px)}.modal[hidden]{display:none}.dialog{width:min(620px,calc(100vw - 32px));padding:22px;border:1px solid var(--line);border-radius:9px;background:var(--panel);box-shadow:0 24px 80px rgba(0,0,0,.3)}.dialog h2{margin:0 0 5px}.dialog>p{margin:0 0 18px;color:var(--muted)}.field{display:grid;gap:6px;margin:12px 0}.field span{font-size:11px;font-weight:650}.field input,.field textarea,.field select{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:7px;background:var(--soft);color:var(--text);outline:0}.field textarea{min-height:100px;resize:vertical}.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.toast{position:fixed;right:20px;bottom:20px;padding:10px 13px;border-radius:7px;background:var(--text);color:var(--panel);box-shadow:var(--shadow)}@media(max-width:900px){.shell{grid-template-columns:210px 1fr}.main{padding:26px 22px}.flow{grid-template-columns:1fr}.arrow{height:28px;transform:rotate(90deg)}.statusbar{grid-template-columns:repeat(2,1fr)}.statusbar>div:nth-child(2){border-right:0}.plan{grid-template-columns:repeat(2,1fr);gap:14px}.bars{grid-template-columns:1fr}}@media(max-width:650px){.shell{display:block}.side{position:static;width:100%;height:auto;border:0;border-bottom:1px solid var(--line)}.project-list{display:flex;overflow:auto}.project-item{min-width:180px}.main{padding:22px 16px}.hero{display:block}.hero-actions{margin-top:14px}.statusbar{grid-template-columns:1fr}.statusbar>div{border-right:0;border-bottom:1px solid var(--line)}.match-top{flex-wrap:wrap}.plan{grid-template-columns:1fr}}
</style><style>
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.tool-select{height:34px;padding:0 30px 0 10px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text)}.demo-button{border:0;background:var(--green);color:#fff}.match .demo-button{height:31px;padding:0 12px;border-radius:6px;font-weight:700}.match-actions{display:flex;justify-content:flex-end;margin-top:14px}.delivery-live{margin:0 0 22px;padding:18px 20px;border:1px solid color-mix(in srgb,var(--green) 45%,var(--line));border-radius:8px;background:color-mix(in srgb,var(--green) 7%,var(--panel));box-shadow:var(--shadow)}.delivery-head{display:flex;align-items:center;gap:14px}.delivery-head>div{flex:1}.delivery-head small,.delivery-head b{display:block}.delivery-head small{color:var(--green);font-weight:700}.delivery-head b{margin-top:3px;font-size:15px}.delivery-head strong{font-size:22px;color:var(--green)}.delivery-track{height:6px;margin:13px 0 9px;overflow:hidden;border-radius:3px;background:var(--soft)}.delivery-track i{display:block;height:100%;background:var(--green);transition:width .35s}.delivery-meta{display:flex;gap:18px;color:var(--muted);font-size:10px}.delivery-meta a{margin-left:auto;color:var(--blue);font-weight:700;text-decoration:none}.field-check{display:flex;gap:9px;align-items:flex-start;margin:12px 0;padding:11px;border:1px solid var(--line);border-radius:7px;background:var(--soft)}.field-check input{margin-top:3px}.field-check b,.field-check small{display:block}.field-check small{color:var(--muted)}@media(max-width:650px){.hero-actions{flex-wrap:wrap}.tool-select{flex:1}.delivery-meta{flex-wrap:wrap}.delivery-meta a{margin-left:0}}
</style><style>
:root{--sidebar:#eef0f3;--selection:#dbe8fb;--selection-text:#174d96}
html,body{height:100%;min-height:0;overflow:hidden}.shell{grid-template-columns:220px minmax(0,1fr);height:100vh;min-height:0}.side{position:static;height:auto;min-height:0;padding:18px 12px;background:var(--sidebar);overflow:auto}.side-head{margin:0 7px 14px}.side-head h1{font-size:12px}.new{width:27px;height:27px;font-size:17px}.project-item{padding:10px 9px;border:0;border-radius:6px}.project-item.active{border:0;background:var(--selection);color:var(--selection-text)}.project-item:hover{background:color-mix(in srgb,var(--text) 5%,transparent)}.project-item span{font-size:9px}.side-note{margin-top:18px;font-size:9px}.main{max-width:none;height:100vh;margin:0;padding:28px 32px 64px;overflow-y:auto}.hero h2{font-size:25px}.statusbar,.node,.match{box-shadow:none}.statusbar,.node,.match,.delivery-live{border-radius:7px}.statusbar{background:color-mix(in srgb,var(--panel) 90%,var(--soft))}.match{max-width:1100px}.dialog{border-radius:11px}
@media(prefers-color-scheme:dark){:root{--sidebar:#202328;--selection:#23456f;--selection-text:#eef5ff}}
@media(max-width:900px){.shell{grid-template-columns:190px 1fr}.main{padding:24px 22px 56px}}
@media(max-width:650px){html,body{overflow:auto}.shell{height:auto}.main{height:auto;overflow:visible}.side{height:auto}}
</style><style>
.main{padding:24px 30px 44px;background:var(--panel)}.hero{align-items:center;max-width:1280px;margin:0 auto 18px;padding-bottom:18px;border-bottom:1px solid var(--line)}.hero h2{margin:4px 0 5px;font-size:23px}.hero p{max-width:760px;font-size:11px;line-height:1.55}.hero-actions{align-items:center;flex:none}.hero-actions .secondary,.hero-actions .primary,.tool-select{height:32px;border-radius:6px;font-size:10px}.eyebrow{font-size:9px}.capabilities{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.capabilities span{padding:3px 6px;border-radius:4px;background:var(--soft);color:var(--muted);font-size:8px}.project-pulse{display:grid;grid-template-columns:minmax(280px,1fr) auto;gap:24px;align-items:center;max-width:1280px;margin:0 auto 14px;padding:15px 17px;border-left:3px solid var(--green);background:color-mix(in srgb,var(--green) 5%,var(--panel))}.project-pulse small,.project-pulse>div:first-child b,.project-pulse>div:first-child span{display:block}.project-pulse small{color:var(--green);font-size:9px;font-weight:700}.project-pulse>div:first-child b{margin:3px 0;font-size:14px}.project-pulse>div:first-child span{color:var(--muted);font-size:9px}.pulse-metrics{display:flex;gap:16px;color:var(--muted);font-size:9px;white-space:nowrap}.pulse-metrics b{color:var(--text)}.delivery-path{display:flex;align-items:center;max-width:1280px;margin:0 auto 22px;padding:12px 16px;border:1px solid var(--line);border-radius:7px;background:var(--soft)}.path-step{display:flex;align-items:center;gap:8px;min-width:0}.path-step i{width:22px;height:22px;display:grid;place-items:center;flex:none;border:1px solid var(--line);border-radius:50%;background:var(--panel);color:var(--muted);font-size:8px;font-style:normal;font-weight:700}.path-step.done i{border-color:var(--green);background:var(--green);color:#fff}.path-step.active i{border-color:var(--blue);color:var(--blue)}.path-step b,.path-step small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.path-step b{font-size:9px}.path-step small{color:var(--muted);font-size:8px}.path-line{height:1px;min-width:24px;flex:1;margin:0 10px;background:var(--line)}.section-head{max-width:1280px;margin:0 auto 10px;align-items:center}.section-head h3{font-size:14px}.decision-workspace{display:grid;grid-template-columns:330px minmax(0,1fr);max-width:1280px;min-height:500px;margin:0 auto;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:var(--panel)}.candidate-list{padding:7px;background:var(--soft);border-right:1px solid var(--line)}.candidate-row{width:100%;display:grid;grid-template-columns:22px minmax(0,1fr) 48px;gap:9px;align-items:start;padding:13px 10px;border:0;border-bottom:1px solid var(--line);border-radius:6px;background:transparent;color:var(--text);text-align:left}.candidate-row:hover{background:color-mix(in srgb,var(--text) 4%,var(--panel))}.candidate-row.active{background:var(--panel);box-shadow:0 1px 3px rgba(20,27,38,.08)}.candidate-rank{width:21px;height:21px;display:grid;place-items:center;border-radius:5px;background:color-mix(in srgb,var(--blue) 9%,var(--panel));color:var(--blue);font-size:8px;font-weight:750}.candidate-copy{min-width:0}.candidate-copy b{display:block;overflow:hidden;font-size:11px;white-space:nowrap;text-overflow:ellipsis}.candidate-copy small{display:-webkit-box;overflow:hidden;margin-top:4px;color:var(--muted);font-size:9px;line-height:1.45;-webkit-line-clamp:2;-webkit-box-orient:vertical}.candidate-copy em{display:block;margin-top:6px;color:var(--muted);font-size:8px;font-style:normal}.candidate-score{text-align:right}.candidate-score b,.candidate-score small{display:block}.candidate-score b{color:var(--green);font-size:17px;line-height:1}.candidate-score small{color:var(--muted);font-size:7px}.candidate-panel{min-width:0;padding:24px 28px 30px}.candidate-detail>header{display:flex;gap:20px;padding-bottom:15px;border-bottom:1px solid var(--line)}.candidate-detail>header>div:first-child{min-width:0;flex:1}.candidate-detail h3{margin:5px 0;font-size:20px}.candidate-detail h3 a{color:inherit;text-decoration:none}.candidate-detail header p{margin:0;color:var(--muted);font-size:10px}.fit-score{width:70px;height:70px;display:grid;place-content:center;flex:none;border:4px solid color-mix(in srgb,var(--green) 70%,var(--soft));border-radius:50%;text-align:center}.fit-score b{color:var(--green);font-size:20px;line-height:1}.fit-score span{color:var(--muted);font-size:7px}.candidate-meta{display:flex;gap:7px;margin:12px 0}.candidate-meta span{padding:3px 6px;border:1px solid var(--line);border-radius:4px;color:var(--muted);font-size:8px}.decision-highlight{margin:12px 0;padding:12px 14px;border-left:3px solid var(--green);background:color-mix(in srgb,var(--green) 6%,var(--panel))}.decision-highlight small,.decision-highlight b{display:block}.decision-highlight small{color:var(--green);font-size:8px;font-weight:700}.decision-highlight b{margin-top:3px;font-size:11px}.reason{padding:12px 0;border-bottom:1px solid var(--line)}.reason b,.detail-section-head b{color:var(--blue);font-size:9px}.reason p{margin:4px 0 0;font-size:10px}.candidate-detail .bars{margin:13px 0 17px}.detail-section-head{display:flex;justify-content:space-between}.detail-section-head span{color:var(--muted);font-size:8px}.candidate-detail .plan{margin-top:10px}.candidate-detail .step{padding:0 10px}.candidate-detail .step small{font-size:8px}.candidate-detail .step b{font-size:10px}.candidate-detail .step p{font-size:9px;line-height:1.45}.detail-footer{display:flex;align-items:center;gap:18px;margin-top:17px;padding-top:13px;border-top:1px solid var(--line)}.detail-footer p{flex:1;margin:0;color:var(--amber);font-size:8px}.detail-footer .demo-button{height:32px;padding:0 12px;border-radius:6px;font-size:10px;font-weight:700}.candidate-empty{padding:24px;color:var(--muted);font-size:10px}.delivery-live{max-width:1280px;margin:0 auto 14px}
button:disabled,select:disabled{cursor:not-allowed;opacity:.52}.toast.success{background:var(--green);color:#fff}.toast.error{background:var(--red);color:#fff}.load-error{display:grid;place-items:center;min-height:70vh;text-align:center}.load-error h2{margin:0 0 7px;font-size:18px}.load-error p{margin:0 0 14px;color:var(--muted)}
@media(max-width:1100px){.decision-workspace{grid-template-columns:1fr}.candidate-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;border-right:0;border-bottom:1px solid var(--line)}.candidate-row{height:100%;border:1px solid transparent}.candidate-row.active{border-color:var(--line)}.candidate-panel{padding:22px 24px}.candidate-detail .plan{grid-template-columns:repeat(2,1fr);gap:12px}}
@media(max-width:900px){.main{padding:22px 20px 44px}.pulse-metrics{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}}
</style></head><body><div class="shell"><aside class="side"><div class="side-head"><h1>项目需求</h1><button class="new" id="new-project" title="创建项目">+</button></div><div class="project-list" id="project-list"></div><p class="side-note">系统每 5 分钟自动检查技术情报和开源社区。发现方案后可直接交给 OneOPC 或 DeliveryPilot 生成 Demo。</p></aside><main class="main" id="main"></main></div>
<div class="modal" id="modal" hidden><form class="dialog" id="project-form"><h2>创建项目需求</h2><p>用业务语言描述目标，系统负责匹配技术并交给执行工具完成 Demo。</p><label class="field"><span>项目名称</span><input name="name" required placeholder="例如：设备检修工单管理"></label><label class="field"><span>业务领域</span><select name="businessDomain"><option>设备运维</option><option>企业管理</option><option>研发效能</option><option>数据智能</option><option>客户服务</option><option>通用业务</option></select></label><label class="field"><span>需求说明</span><textarea name="summary" required placeholder="谁在什么场景遇到什么问题，希望最终得到什么结果"></textarea></label><label class="field"><span>关键能力</span><input name="capabilities" placeholder="工单、审批、状态流转、知识库（用逗号分隔）"></label><label class="field"><span>Demo 执行工具</span><select name="executionTool"><option value="oneopc">OneOPC（默认，完整自动交付）</option><option value="delivery-pilot">DeliveryPilot（研发交付驾驶舱）</option></select></label><label class="field-check"><input type="checkbox" name="autoBuildDemo"><span><b>匹配完成后自动生成 Demo</b><small>系统采用最高匹配方案并启动所选工具；仍会保留许可证和验收门禁。</small></span></label><div class="dialog-actions"><button class="secondary" type="button" id="cancel">取消</button><button class="primary" type="submit">保存并立即匹配</button></div></form></div><div class="toast" id="toast" hidden></div>
<script>
const state={projects:[],selected:null,selectedCandidate:null,selectedTool:null,research:null,busy:null,loaded:false,dataSignature:null};const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const api=async(path,options={})=>{let response;try{response=await fetch(path,{headers:{'Content-Type':'application/json'},...options})}catch(error){throw new Error('无法连接本机服务')}const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch(error){throw new Error('服务返回了无法解析的数据')}if(!response.ok)throw new Error(data.error||'请求失败');return data};const toast=(message,type='info')=>{const el=document.querySelector('#toast');el.textContent=message;el.className=`toast ${type}`;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3200)};const timeText=value=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未扫描';const countdown=value=>{if(!value)return'即将开始';const seconds=Math.max(0,Math.round((new Date(value)-Date.now())/1000));return seconds<=0?'等待扫描':`${Math.floor(seconds/60)}分${seconds%60}秒后`};
function renderList(){const list=document.querySelector('#project-list');list.innerHTML=state.projects.map(p=>`<button class="project-item ${p.id===state.selected?'active':''}" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><span><i class="dot ${esc(p.scanStatus)}"></i>${p.scanStatus==='running'?'正在匹配':`${p.matchCount||0} 个匹配`}</span></button>`).join('');list.querySelectorAll('button').forEach(button=>button.onclick=()=>{state.selected=button.dataset.id;state.selectedCandidate=null;state.selectedTool=null;render()})}
function scoreBar(label,value){return`<div class="bar"><label><span>${label}</span><b>${value}%</b></label><div class="track"><i style="width:${value}%"></i></div></div>`}
function renderMatch(candidate,index,selected){return`<button class="candidate-row ${selected?'active':''}" data-candidate="${esc(candidate.fullName)}"><span class="candidate-rank">${index+1}</span><span class="candidate-copy"><b>${esc(candidate.fullName)}</b><small>${esc(candidate.plainDescription||'与当前需求相关的开源项目')}</small><em>${esc(candidate.language||'多语言')} · ${candidate.stars||0} Stars</em></span><span class="candidate-score"><b>${candidate.fitScore||0}</b><small>匹配度</small></span></button>`}
function renderCandidateDetail(candidate){if(!candidate)return`<div class="candidate-empty">系统正在持续寻找满足证据要求的开源方案。</div>`;const maturity=Math.min(100,Math.round((candidate.breakdown?.maturity||0)*10));const safety=Math.min(100,Math.round((candidate.breakdown?.licenseAndSafety||0)/15*100));const plan=(candidate.implementationPlan||[]).map((step,index)=>`<div class="step"><small>0${index+1} · ${esc(step.stage)}</small><b>${esc(step.title)}</b><p>${esc(step.detail)}</p></div>`).join('');return`<article class="candidate-detail"><header><div><span class="verdict">${esc(candidate.verdict)}</span><h3><a href="${esc(candidate.url)}" target="_blank">${esc(candidate.fullName)} ↗</a></h3><p>${esc(candidate.plainDescription||'一个与当前需求相关的开源社区项目。')}</p></div><div class="fit-score"><b>${candidate.fitScore||0}</b><span>综合匹配</span></div></header><div class="candidate-meta"><span>${esc(candidate.language||'多语言')}</span><span>${candidate.stars||0} Stars</span><span>${esc(candidate.license||'许可证待核实')}</span></div><section class="decision-highlight"><small>推荐判断</small><b>${esc(candidate.adoptionAdvice)}</b></section><section class="reason"><b>为什么匹配</b><p>${esc(candidate.plainExplanation)}</p></section><div class="bars">${scoreBar('需求覆盖',candidate.coveragePercent||0)}${scoreBar('社区成熟度',maturity)}${scoreBar('许可证安全',safety)}</div><section class="implementation"><div class="detail-section-head"><b>落地路径</b><span>从验证到可交付 Demo</span></div><div class="plan">${plan}</div></section><div class="detail-footer"><p>${(candidate.riskNotes||[]).length?`风险：${esc(candidate.riskNotes.join('；'))}`:'未发现需要立即阻断的风险'}</p><button class="demo-button" id="candidate-deliver" data-candidate="${esc(candidate.fullName)}">使用此方案生成 Demo</button></div></article>`}
function deliveryView(delivery){if(!delivery)return'';const terminal=['completed','failed','cancelled'].includes(delivery.state);return`<section class="delivery-live"><div class="delivery-head"><div><small>真实交付事件 · ${esc(delivery.toolName)}</small><b>${esc(delivery.phase||delivery.message)}</b></div><strong>${delivery.percent||0}%</strong></div><div class="delivery-track"><i style="width:${delivery.percent||0}%"></i></div><div class="delivery-meta"><span>${esc(delivery.message||'执行工具正在处理')}</span>${delivery.recoveryCount?`<span>已自动恢复 ${delivery.recoveryCount} 次</span>`:''}${delivery.workspacePath?`<span title="${esc(delivery.workspacePath)}">工作区已创建</span>`:''}${delivery.previewUrl?`<a href="${esc(delivery.previewUrl)}" target="_blank">立即体验 Demo ↗</a>`:terminal?'<span>等待产物地址</span>':'<span>完成后自动出现体验地址</span>'}</div></section>`}
async function startDelivery(project,candidate=''){if(state.busy)return;const tool=document.querySelector('#execution-tool')?.value||state.selectedTool||project.executionTool||'oneopc';state.busy='delivery';document.querySelectorAll('#deliver,#candidate-deliver').forEach(button=>{button.disabled=true;button.textContent='正在创建交付…'});toast(`正在交给 ${tool==='oneopc'?'OneOPC':'DeliveryPilot'}…`);try{await api(`/v1/projects/${project.id}/deliver`,{method:'POST',body:JSON.stringify({tool,candidate})});toast('交付任务已创建','success');await load()}catch(error){toast(`启动失败：${error.message}`,'error')}finally{state.busy=null}}
function render(){renderList();const main=document.querySelector('#main');const project=state.projects.find(p=>p.id===state.selected)||state.projects[0];if(!project){main.innerHTML=`<section class="empty"><div><h2>创建第一个项目需求</h2><p>系统会持续关注技术情报和开源社区，发现方案后可直接生成 Demo。</p><button class="primary" onclick="openModal()">创建项目需求</button></div></section>`;return}state.selected=project.id;const candidate=project.topMatch;const matches=project.matches||[];const selectedMatch=matches.find(item=>item.fullName===state.selectedCandidate)||matches[0]||candidate;state.selectedCandidate=selectedMatch?.fullName||null;const topic=state.research?.topic||'AI 工程与智能体';const toolValue=state.selectedTool||project.executionTool||'oneopc';const toolName=toolValue==='delivery-pilot'?'DeliveryPilot':'OneOPC';main.innerHTML=`<header class="hero"><div><span class="eyebrow">${esc(project.businessDomain)} · ${esc(topic)}</span><h2>${esc(project.name)}</h2><p>${esc(project.summary)}</p><div class="capabilities">${(project.capabilities||[]).slice(0,5).map(value=>`<span>${esc(value)}</span>`).join('')}</div></div><div class="hero-actions"><select class="tool-select" id="execution-tool"><option value="oneopc" ${toolValue==='oneopc'?'selected':''}>OneOPC</option><option value="delivery-pilot" ${toolValue==='delivery-pilot'?'selected':''}>DeliveryPilot</option></select><button class="demo-button primary" id="deliver" ${candidate&&!state.busy?'':'disabled'}>生成 Demo</button><button class="secondary" id="edit">编辑</button><button class="secondary" id="scan" ${project.scanStatus==='running'||state.busy?'disabled':''}>${project.scanStatus==='running'?'匹配中…':'重新匹配'}</button></div></header>${deliveryView(project.activeDelivery)}<section class="project-pulse"><div><small>推荐方案</small><b>${esc(candidate?.fullName||'持续搜索中')}</b><span>${candidate?`${candidate.fitScore} 分 · ${esc(candidate.confidenceLabel||candidate.verdict)}`:'尚无满足证据要求的方案'}</span></div><div class="pulse-metrics"><span><b>${project.matchCount||0}</b> 个候选</span><span><b>${project.sourceCount||0}</b> 个来源</span><span>更新于 <b>${timeText(project.lastScannedAt)}</b></span><span><b>${countdown(project.nextScanAt)}</b></span></div></section><section class="delivery-path"><div class="path-step done"><i>1</i><span><b>需求已定义</b><small>${esc((project.capabilities||[]).slice(0,3).join('、')||'业务目标')}</small></span></div><div class="path-line"></div><div class="path-step done"><i>2</i><span><b>持续扫描</b><small>${project.sourceCount||0} 个来源 · 每 5 分钟</small></span></div><div class="path-line"></div><div class="path-step ${candidate?'done':'active'}"><i>3</i><span><b>方案匹配</b><small>${candidate?`${matches.length} 个候选已通过门禁`:'正在寻找证据'}</small></span></div><div class="path-line"></div><div class="path-step ${project.activeDelivery?'active':''}"><i>4</i><span><b>${toolName} 交付</b><small>${project.activeDelivery?'已启动真实执行':'选择方案后生成 Demo'}</small></span></div></section><div class="section-head"><h3>候选方案</h3><span>选择左侧方案，右侧查看采用判断与落地路径</span></div><section class="decision-workspace"><aside class="candidate-list">${matches.length?matches.map((item,index)=>renderMatch(item,index,item.fullName===selectedMatch?.fullName)).join(''):`<div class="candidate-empty">${project.scanStatus==='running'?'正在检查技术情报与开源社区…':'暂未发现满足最低证据要求的项目'}</div>`}</aside><main class="candidate-panel">${renderCandidateDetail(selectedMatch)}</main></section>`;document.querySelector('#execution-tool').onchange=event=>{state.selectedTool=event.target.value;render()};document.querySelector('#scan').onclick=async event=>{if(state.busy)return;state.busy='scan';event.currentTarget.disabled=true;event.currentTarget.textContent='正在启动…';try{await api(`/v1/projects/${project.id}/scan`,{method:'POST',body:'{}'});toast('已开始匹配','success');await load()}catch(error){toast(`匹配失败：${error.message}`,'error')}finally{state.busy=null}};document.querySelector('#edit').onclick=()=>openModal(project);document.querySelector('#deliver').onclick=()=>startDelivery(project);document.querySelectorAll('.candidate-row').forEach(button=>button.onclick=()=>{state.selectedCandidate=button.dataset.candidate;render()});const candidateDeliver=document.querySelector('#candidate-deliver');if(candidateDeliver)candidateDeliver.onclick=()=>startDelivery(project,candidateDeliver.dataset.candidate)}
function closeModal(){document.querySelector('#modal').hidden=true}function openModal(project=null){const form=document.querySelector('#project-form');form.reset();form.dataset.id=project?.id||'';if(project){form.name.value=project.name;form.businessDomain.value=project.businessDomain;form.summary.value=project.summary;form.capabilities.value=(project.capabilities||[]).join('，');form.executionTool.value=project.executionTool||'oneopc';form.autoBuildDemo.checked=Boolean(project.autoBuildDemo)}document.querySelector('#modal').hidden=false;form.name.focus()}document.querySelector('#new-project').onclick=()=>openModal();document.querySelector('#cancel').onclick=closeModal;document.querySelector('#modal').onclick=event=>{if(event.target.id==='modal')closeModal()};document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('#modal').hidden)closeModal()});document.querySelector('#project-form').onsubmit=async event=>{event.preventDefault();if(state.busy)return;const form=event.currentTarget;const submit=form.querySelector('[type="submit"]');const payload=Object.fromEntries(new FormData(form));payload.autoBuildDemo=form.autoBuildDemo.checked;const id=form.dataset.id;state.busy='save';submit.disabled=true;submit.textContent='正在保存…';try{const project=await api(id?`/v1/projects/${id}`:'/v1/projects',{method:id?'PUT':'POST',body:JSON.stringify(payload)});closeModal();state.selected=project.id;state.selectedTool=null;toast('需求已保存，正在首次匹配','success');await api(`/v1/projects/${project.id}/scan`,{method:'POST',body:'{}'});await load()}catch(error){toast(`保存失败：${error.message}`,'error');submit.disabled=false;submit.textContent='保存并立即匹配'}finally{state.busy=null}};const visibleSignature=projects=>JSON.stringify(projects.map(project=>({id:project.id,name:project.name,businessDomain:project.businessDomain,summary:project.summary,capabilities:project.capabilities,executionTool:project.executionTool,autoBuildDemo:project.autoBuildDemo,scanStatus:project.scanStatus,scanPhase:project.scanPhase,lastScannedAt:project.lastScannedAt,nextScanAt:project.nextScanAt,matchCount:project.matchCount,sourceCount:project.sourceCount,topMatch:project.topMatch,matches:project.matches,activeDelivery:project.activeDelivery?{deliveryId:project.activeDelivery.deliveryId,tool:project.activeDelivery.tool,state:project.activeDelivery.state,phase:project.activeDelivery.phase,percent:project.activeDelivery.percent,message:project.activeDelivery.message,recoveryCount:project.activeDelivery.recoveryCount,workspacePath:project.activeDelivery.workspacePath,previewUrl:project.activeDelivery.previewUrl}:null})));async function load(){try{const currentTool=document.querySelector('#execution-tool')?.value;if(currentTool)state.selectedTool=currentTool;const data=await api('/v1/projects');const signature=visibleSignature(data.projects);const changed=signature!==state.dataSignature;state.projects=data.projects;state.research=data.researchContext;state.dataSignature=signature;if(!state.selected&&state.projects[0])state.selected=state.projects[0].id;if(!state.loaded||changed)render();state.loaded=true}catch(error){if(!state.loaded)document.querySelector('#main').innerHTML=`<section class="load-error"><div><h2>需求匹配服务暂不可用</h2><p>${esc(error.message)}。应用会自动重试，也可以立即重试。</p><button class="primary" id="retry-load">重新连接</button></div></section>`;document.querySelector('#retry-load')?.addEventListener('click',load);toast(`同步失败：${error.message}`,'error')}}load();setInterval(load,5000);
const projectModal=document.querySelector('#modal');projectModal.setAttribute('role','dialog');projectModal.setAttribute('aria-modal','true');const projectModalTitle=projectModal.querySelector('h2');projectModalTitle.id='project-modal-title';projectModal.setAttribute('aria-labelledby',projectModalTitle.id);let projectReturnFocus=null;const baseOpenModal=openModal;openModal=project=>{projectReturnFocus=document.activeElement;baseOpenModal(project);projectModalTitle.textContent=project?'编辑项目需求':'创建项目需求';projectModal.querySelector('[type="submit"]').textContent=project?'保存修改并重新匹配':'保存并立即匹配'};const baseCloseModal=closeModal;closeModal=()=>{baseCloseModal();projectReturnFocus?.focus()};document.querySelector('#cancel').onclick=closeModal;
</script></body></html>"""


class AdvisoryProviderHandler(BaseHTTPRequestHandler):
    server_version = "TechnologyExplorationProvider/1.0"

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("请求必须是 JSON 对象")
        return payload

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, body: str):
        payload = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        if path in ("/projects", "/projects/"):
            self.send_html(project_center_html())
            return
        if path == "/v1/search":
            query = urllib.parse.parse_qs(parsed_url.query)
            try:
                payload = active_search(
                    (query.get("q") or [""])[0],
                    (query.get("kind") or ["all"])[0],
                    int((query.get("limit") or ["24"])[0]),
                    (query.get("range") or ["30d"])[0],
                )
                self.send_json(200, payload)
            except ValueError as exc:
                self.send_json(400, {"error": clean_text(str(exc))[:300]})
            except Exception as exc:
                self.send_json(500, {"error": clean_text(str(exc))[:500]})
            return
        if path == "/v1/projects":
            self.send_json(200, {
                "projects": list_requirement_projects(),
                "scanIntervalSeconds": PROJECT_SCAN_INTERVAL_SECONDS,
                "researchContext": research_context(load_config()),
            })
            return
        project_match = re.fullmatch(r"/v1/projects/([^/]+)", path)
        if project_match:
            project = load_requirement_project(project_match.group(1))
            if not project:
                self.send_json(404, {"error": "project_not_found"})
                return
            result_path = project_path(project["id"]) / "latest-result.json"
            result = (
                json.loads(result_path.read_text(encoding="utf-8"))
                if result_path.is_file() else None
            )
            self.send_json(200, {"project": project, "result": result})
            return
        delivery_match = re.fullmatch(r"/v1/deliveries/([^/]+)", path)
        if delivery_match:
            delivery = load_demo_delivery(delivery_match.group(1))
            if not delivery:
                self.send_json(404, {"error": "delivery_not_found"})
                return
            self.send_json(200, delivery)
            return
        if path == "/v1/health":
            self.send_json(200, {
                "status": "ok",
                "service": "Technology Exploration Provider",
                "version": "1.0",
                "capabilities": [
                    "advisory", "repository-discovery", "trend-evidence",
                    "requirement-projects", "five-minute-monitor",
                    "demo-handoff", "oneopc-delivery", "delivery-pilot-delivery",
                    "configurable-research-topic", "active-search",
                ],
            })
            return
        if path == "/v1/capabilities":
            self.send_json(200, {
                "transports": ["provider_api", "computer_use"],
                "depths": ["recommend", "verify", "code_graph"],
                "entityTypes": [
                    "requirement-project", "repository", "model",
                    "paper", "product", "topic",
                ],
                "projectMonitoring": {
                    "enabled": True,
                    "intervalSeconds": PROJECT_SCAN_INTERVAL_SECONDS,
                },
                "researchContext": research_context(load_config()),
                "demoDelivery": {
                    "enabled": True,
                    "defaultTool": "oneopc",
                    "tools": ["oneopc", "delivery-pilot"],
                    "statusWriteback": True,
                },
            })
            return
        match = re.fullmatch(r"/v1/advisories/([^/]+)", path)
        if match:
            root = advisory_job_path(match.group(1))
            target = root / ("result.json" if (root / "result.json").is_file() else "progress.json")
            if not target.is_file():
                self.send_json(404, {"error": "job_not_found"})
                return
            self.send_json(200, json.loads(target.read_text(encoding="utf-8")))
            return
        match = re.fullmatch(r"/v1/advisories/([^/]+)/events", path)
        if match:
            event_path = advisory_job_path(match.group(1)) / "events.jsonl"
            if not event_path.is_file():
                self.send_json(404, {"error": "job_not_found"})
                return
            events = [
                json.loads(line)
                for line in event_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.send_json(200, {"jobId": match.group(1), "events": events})
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/v1/projects":
            try:
                project = save_requirement_project(self.read_json())
                self.send_json(201, project)
            except Exception as exc:
                self.send_json(400, {"error": clean_text(str(exc))[:500]})
            return
        project_scan_match = re.fullmatch(r"/v1/projects/([^/]+)/scan", path)
        if project_scan_match:
            project_id = project_scan_match.group(1)
            if not load_requirement_project(project_id):
                self.send_json(404, {"error": "project_not_found"})
                return
            thread = threading.Thread(
                target=lambda: scan_requirement_project(project_id),
                daemon=True,
            )
            thread.start()
            self.send_json(202, {"projectId": project_id, "state": "queued"})
            return
        project_delivery_match = re.fullmatch(r"/v1/projects/([^/]+)/deliver", path)
        if project_delivery_match:
            try:
                delivery = launch_demo_delivery(
                    project_delivery_match.group(1),
                    self.read_json(),
                )
                self.send_json(202, delivery)
            except Exception as exc:
                self.send_json(400, {"error": clean_text(str(exc))[:500]})
            return
        cancel_match = re.fullmatch(r"/v1/advisories/([^/]+)/cancel", path)
        if cancel_match:
            try:
                root = advisory_job_path(cancel_match.group(1))
                if not root.is_dir():
                    self.send_json(404, {"error": "job_not_found"})
                    return
                atomic_json_write(root / "cancel.json", {
                    "jobId": cancel_match.group(1),
                    "requestedAt": now_iso(),
                })
                self.send_json(202, {"jobId": cancel_match.group(1), "state": "cancelling"})
            except Exception as exc:
                self.send_json(400, {"error": clean_text(str(exc))[:500]})
            return
        if path != "/v1/advisories":
            self.send_json(404, {"error": "not_found"})
            return
        try:
            request = validate_advisory_request(self.read_json())
            job_id = request["jobId"]
            root = advisory_job_path(job_id)
            if (root / "progress.json").is_file():
                existing = json.loads((root / "progress.json").read_text(encoding="utf-8"))
                if existing.get("state") == "running":
                    self.send_json(409, {"error": "job_already_running", "jobId": job_id})
                    return
            root.mkdir(parents=True, exist_ok=True)
            (root / "cancel.json").unlink(missing_ok=True)
            atomic_json_write(root / "progress.json", {
                "jobId": job_id,
                "state": "queued",
                "phase": "queued",
                "percent": 0,
                "message": "任务已进入队列",
                "completed": False,
                "updatedAt": now_iso(),
            })
            thread = threading.Thread(target=run_advisory_job, args=(request,), daemon=True)
            thread.start()
            self.send_json(202, {
                "jobId": job_id,
                "state": "queued",
                "links": {
                    "status": f"/v1/advisories/{job_id}",
                    "events": f"/v1/advisories/{job_id}/events",
                    "cancel": f"/v1/advisories/{job_id}/cancel",
                },
            })
        except Exception as exc:
            self.send_json(400, {"error": clean_text(str(exc))[:500]})

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        project_match = re.fullmatch(r"/v1/projects/([^/]+)", path)
        if not project_match:
            self.send_json(404, {"error": "not_found"})
            return
        try:
            project = save_requirement_project(
                self.read_json(),
                project_match.group(1),
            )
            self.send_json(200, project)
        except Exception as exc:
            self.send_json(400, {"error": clean_text(str(exc))[:500]})

    def log_message(self, _format, *_args):
        return


def serve_provider() -> int:
    JOB_DIR.mkdir(parents=True, exist_ok=True)
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    monitor = threading.Thread(target=project_monitor_loop, daemon=True)
    monitor.start()
    server = ThreadingHTTPServer(PROVIDER_ADDRESS, AdvisoryProviderHandler)
    print(json.dumps({
        "service": "Technology Exploration Provider",
        "address": f"http://{PROVIDER_ADDRESS[0]}:{PROVIDER_ADDRESS[1]}",
    }, ensure_ascii=False), flush=True)
    server.serve_forever()
    return 0


def advisory_job_cli(path: str) -> int:
    request = json.loads(Path(path).read_text(encoding="utf-8"))
    result = run_advisory_job(request)
    print(json.dumps(result, ensure_ascii=False))
    return 0


def enable_feishu_and_send_test() -> int:
    config = load_config()
    report = ReportStore().latest()
    if not report:
        print(json.dumps({"sent": False, "error": "没有可发送的历史报告"}, ensure_ascii=False))
        return 1
    try:
        send_feishu(report, config.get("feishu_webhook", ""))
    except Exception as exc:
        print(json.dumps({"sent": False, "error": str(exc)}, ensure_ascii=False))
        return 1

    config["feishu_paused"] = False
    save_config(config)
    print(json.dumps({"sent": True, "items": len(report.get("items", [])), "daily_enabled": True}, ensure_ascii=False))
    return 0


def pause_feishu() -> int:
    config = load_config()
    config["feishu_paused"] = True
    save_config(config)
    print(json.dumps({"daily_enabled": False, "feishu_paused": True}, ensure_ascii=False))
    return 0


def configure_ark() -> int:
    api_key = (getpass.getpass("ARK API Key: ") if sys.stdin.isatty() else sys.stdin.read()).strip()
    if not api_key:
        print(json.dumps({"configured": False, "error": "未读取到 ARK API Key"}, ensure_ascii=False))
        return 1
    config = load_config()
    config["ark_api_key"] = api_key
    config["ark_base_url"] = "https://ark.cn-beijing.volces.com/api/v3"
    config["ark_model"] = "glm-5-2-260617"
    config["feishu_paused"] = True
    save_config(config)
    print(json.dumps({"configured": True, "model": config["ark_model"], "feishu_paused": True}, ensure_ascii=False))
    return 0


def test_ark() -> int:
    config = load_config()
    report = ReportStore().latest()
    if not report:
        print(json.dumps({"success": False, "error": "没有可用于测试的报告"}, ensure_ascii=False))
        return 1
    report.pop("analysis_error", None)
    for item in report.get("items", []):
        item.pop("analysis", None)
    try:
        enrich_report_with_ark(report, config)
    except Exception as exc:
        print(json.dumps({"success": False, "error": clean_text(str(exc))[:240]}, ensure_ascii=False))
        return 1
    ReportStore().save(report)
    analyzed = sum(isinstance(item.get("analysis"), dict) for item in report.get("items", []))
    print(json.dumps({
        "success": analyzed == len(report.get("items", [])),
        "model": report.get("analysis_model"),
        "analyzed_items": analyzed,
        "daily_insight": report.get("daily_insight", ""),
        "feishu_sent": False,
    }, ensure_ascii=False))
    return 0 if analyzed else 1


if __name__ == "__main__":
    if "--serve-provider" in sys.argv:
        raise SystemExit(serve_provider())
    if "--advisory-job" in sys.argv:
        index = sys.argv.index("--advisory-job")
        if index + 1 >= len(sys.argv):
            raise SystemExit("--advisory-job requires a request.json path")
        raise SystemExit(advisory_job_cli(sys.argv[index + 1]))
    if "--collect-preview" in sys.argv:
        raise SystemExit(collect_preview())
    if "--configure-ark" in sys.argv:
        raise SystemExit(configure_ark())
    if "--test-ark" in sys.argv:
        raise SystemExit(test_ark())
    if "--pause-feishu" in sys.argv:
        raise SystemExit(pause_feishu())
    if "--enable-feishu-and-send-test" in sys.argv:
        raise SystemExit(enable_feishu_and_send_test())
    if "--collect" in sys.argv:
        raise SystemExit(collect_once())
    DesktopApp().run()
