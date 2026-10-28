#!/usr/bin/env python3
"""
Work Shadow Recorder v0.1

一个零依赖、本地优先的「工作旁听采集器」原型：
- 只绑定 127.0.0.1
- 数据写入本项目 runtime/work-shadow-recorder.json
- 不录屏、不监听键盘、不扫描电脑
- 用户主动创建任务、粘贴/导入事件，系统生成可演示的方法卡
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "runtime" / "work-shadow-recorder.json"
DEFAULT_PORT = 43233

EVENT_LABELS = {
    "task_context": "任务上下文",
    "ai_conversation": "AI 协作",
    "operation": "操作记录",
    "artifact_diff": "产物变化",
    "validation": "验证证据",
    "acceptance": "验收反馈",
    "boundary": "风险边界",
}


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def load_store() -> dict:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_PATH.exists():
        return {"sessions": []}
    try:
        with DATA_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or "sessions" not in data:
            return {"sessions": []}
        return data
    except json.JSONDecodeError:
        backup = DATA_PATH.with_suffix(f".broken-{int(time.time())}.json")
        DATA_PATH.rename(backup)
        return {"sessions": []}


def save_store(data: dict) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(DATA_PATH)


def get_session(data: dict, session_id: str) -> dict | None:
    return next((s for s in data["sessions"] if s["id"] == session_id), None)


def clean_text(text: str, limit: int = 60000) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:limit]


def lines(text: str) -> list[str]:
    return [line.strip() for line in clean_text(text).splitlines() if line.strip()]


def uniq(items: list[str], limit: int = 12) -> list[str]:
    seen = set()
    result = []
    for item in items:
        item = re.sub(r"\s+", " ", item).strip(" -:：，。；;")
        if len(item) < 2:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
        if len(result) >= limit:
            break
    return result


def extract_signals(event_type: str, content: str) -> list[str]:
    text = clean_text(content)
    lower = text.lower()
    signals: list[str] = []

    if event_type == "ai_conversation":
        if any(k in text for k in ["不对", "不是", "没有理解", "重新", "继续优化", "你应该", "注意"]):
            signals.append("专家在纠正 AI：这里包含判断标准或产品边界")
        if any(k in text for k in ["不要", "不能", "不得", "禁止", "边界"]):
            signals.append("出现禁止事项：需要沉淀为风险边界")
        if any(k in text for k in ["验证", "测试", "检查", "截图", "验收"]):
            signals.append("出现验收要求：可转为质量标准")
        if any(k in lower for k in ["codex", "claude", "workbuddy", "agent", "ai"]):
            signals.append("包含 AI 指挥方式：可提取为提示/协作策略")
    elif event_type == "artifact_diff":
        added = len([l for l in text.splitlines() if l.startswith("+") and not l.startswith("+++")])
        removed = len([l for l in text.splitlines() if l.startswith("-") and not l.startswith("---")])
        files = re.findall(r"diff --git a/(.*?) b/", text) + re.findall(r"^\+\+\+ b/(.+)$", text, re.M)
        if files:
            signals.append("影响文件：" + "、".join(uniq(files, 5)))
        if added or removed:
            signals.append(f"产物变化规模：新增 {added} 行，删除 {removed} 行")
    elif event_type == "validation":
        if any(k in text for k in ["pass", "passed", "成功", "通过", "ok", "OK"]):
            signals.append("验证通过：可作为正向样本")
        if any(k in text for k in ["fail", "failed", "错误", "失败", "报错"]):
            signals.append("验证失败：需要记录补救方式")
        signals.append("验证材料可转为未来数字员工考试标准")
    elif event_type == "acceptance":
        if any(k in text for k in ["通过", "接受", "确认", "完成"]):
            signals.append("真人验收通过：可进入方法卡确认")
        if any(k in text for k in ["退回", "不通过", "修改", "重做"]):
            signals.append("存在退回意见：应沉淀为负样本和修订规则")
    elif event_type == "operation":
        if any(k in lower for k in ["git ", "npm ", "pytest", "curl", "python", "node"]):
            signals.append("包含工具/命令使用：可沉淀为执行步骤")
        if any(k in text for k in ["打开", "修改", "查看", "运行", "发布", "提交"]):
            signals.append("包含人工操作顺序：可转为步骤清单")
    elif event_type == "boundary":
        signals.append("用户主动标注边界：生成方法卡时必须保留")
    else:
        signals.append("任务上下文：用于判断经验适用范围")

    # 兜底提取含关键词的短句
    keywords = ["目标", "约束", "不要", "不能", "验证", "测试", "检查", "原因", "因为", "步骤", "边界", "风险", "完成"]
    for line in lines(text):
        if any(k in line for k in keywords) and len(line) <= 120:
            signals.append(line)
    return uniq(signals, 8)


def split_sentences(text: str) -> list[str]:
    chunks = re.split(r"[。！？!?；;\n]+", clean_text(text))
    return uniq([c.strip() for c in chunks if c.strip()], 30)


def build_method_card(session: dict) -> dict:
    events = session.get("events", [])
    by_type: dict[str, list[dict]] = {}
    for event in events:
        by_type.setdefault(event["type"], []).append(event)

    all_text = "\n".join(event.get("content", "") for event in events)
    ai_text = "\n".join(event.get("content", "") for event in by_type.get("ai_conversation", []))
    op_text = "\n".join(event.get("content", "") for event in by_type.get("operation", []))
    validation_text = "\n".join(event.get("content", "") for event in by_type.get("validation", []))
    boundary_text = "\n".join(event.get("content", "") for event in by_type.get("boundary", []))

    steps: list[str] = []
    if session.get("goal"):
        steps.append("先复述任务目标：" + session["goal"])
    for sentence in split_sentences(ai_text + "\n" + op_text):
        if any(k in sentence for k in ["先", "然后", "需要", "应该", "必须", "检查", "验证", "运行", "修改", "确认"]):
            steps.append(sentence)
    if not steps:
        steps = [
            "明确任务目标、输入材料和不可触碰边界",
            "让 AI 先给出拆解方案，专家根据经验纠正方向",
            "执行最小必要修改，并记录关键操作",
            "用测试、截图或人工检查验证结果",
            "验收通过后再沉淀为可复用方法",
        ]

    quality: list[str] = []
    for sentence in split_sentences(validation_text + "\n" + all_text):
        if any(k in sentence for k in ["验证", "测试", "检查", "通过", "验收", "截图", "结果", "标准"]):
            quality.append(sentence)
    if not quality:
        quality = ["必须有可回放的验证证据，不能只凭 AI 自述完成"]

    boundaries: list[str] = []
    for sentence in split_sentences(boundary_text + "\n" + all_text):
        if any(k in sentence for k in ["不要", "不能", "不得", "禁止", "边界", "风险", "敏感", "权限", "确认"]):
            boundaries.append(sentence)
    if not boundaries:
        boundaries = ["不自动扫描私人资料；不把一次任务经验直接等同于稳定能力"]

    ai_strategy: list[str] = []
    for sentence in split_sentences(ai_text):
        if any(k in sentence for k in ["AI", "你", "重新", "继续", "输出", "方案", "分析", "实现", "优化"]):
            ai_strategy.append(sentence)
    if not ai_strategy:
        ai_strategy = ["要求 AI 先解释判断，再执行；发现偏离主线时及时纠正"]

    evidence = [
        f"{EVENT_LABELS.get(event['type'], event['type'])} · {event['created_at']} · {event['title']}"
        for event in events
    ]

    existing_card = session.get("method_card") or {}
    card = {
        "id": existing_card.get("id") or uid("CARD"),
        "title": f"方法卡：{session.get('title', '未命名任务')}",
        "task_type": infer_task_type(session, all_text),
        "applicable_when": uniq([
            session.get("goal", ""),
            "出现类似任务目标、约束条件和验收标准时",
            "需要把专家使用 AI 完成任务的经验迁移给数字员工时",
        ], 5),
        "steps": uniq(steps, 8),
        "ai_strategy": uniq(ai_strategy, 6),
        "quality_bar": uniq(quality, 8),
        "boundaries": uniq(boundaries, 8),
        "human_confirmation_required": [
            "方法卡是否准确表达了专家真实判断",
            "边界和授权范围是否足够清楚",
            "是否允许数字员工用它进行影子练习",
        ],
        "evidence": evidence[-12:],
        "generated_at": now(),
        "status": "draft",
    }
    return card


def infer_task_type(session: dict, text: str) -> str:
    joined = f"{session.get('title','')} {session.get('goal','')} {text}"
    rules = [
        ("UX / 产品体验优化", ["UX", "UI", "体验", "首页", "页面", "视觉", "交互"]),
        ("代码修复与验证", ["bug", "修复", "测试", "报错", "diff", "pytest", "npm"]),
        ("文档/方案沉淀", ["文档", "方案", "PRD", "分析", "写入", "Wiki"]),
        ("流程处理与运营任务", ["流程", "工单", "审批", "后台", "操作"]),
    ]
    for label, keys in rules:
        if any(k.lower() in joined.lower() for k in keys):
            return label
    return "通用专家经验沉淀"


def markdown_export(session: dict) -> str:
    card = session.get("method_card") or build_method_card(session)
    event_lines = []
    for event in session.get("events", []):
        signal_lines = "\n".join(f"  - {s}" for s in event.get("signals", []))
        event_lines.append(
            f"### {EVENT_LABELS.get(event['type'], event['type'])}：{event['title']}\n\n"
            f"- 时间：{event['created_at']}\n"
            f"- 识别信号：\n{signal_lines or '  - 暂无'}\n\n"
            f"```text\n{event.get('content','')[:4000]}\n```"
        )
    return f"""# {session.get('title', '工作旁听报告')}

> 本报告由 Work Shadow Recorder 本地生成。它不是录屏监控，而是用户主动提交的任务级经验采集记录。

## 任务信息

- 旁听会话：{session['id']}
- 贡献者：{session.get('contributor', '未填写')}
- 数字员工：{session.get('employee', '未指定')}
- 目标：{session.get('goal', '')}
- 约束：{session.get('constraints', '')}
- 创建时间：{session.get('created_at', '')}

## 生成的方法卡

### {card['title']}

- 任务类型：{card['task_type']}
- 生成时间：{card['generated_at']}
- 状态：{card['status']}

### 适用条件

{chr(10).join(f"- {x}" for x in card['applicable_when'])}

### 工作步骤

{chr(10).join(f"{i + 1}. {x}" for i, x in enumerate(card['steps']))}

### AI 指挥策略

{chr(10).join(f"- {x}" for x in card['ai_strategy'])}

### 质量标准

{chr(10).join(f"- {x}" for x in card['quality_bar'])}

### 风险边界

{chr(10).join(f"- {x}" for x in card['boundaries'])}

### 需要真人确认

{chr(10).join(f"- {x}" for x in card['human_confirmation_required'])}

## 原始旁听事件

{chr(10).join(event_lines)}
"""


HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>工作旁听采集器 · Work Shadow Recorder</title>
  <style>
    :root{--bg:#f6f2e8;--paper:#fffdf6;--ink:#24352d;--muted:#6c776e;--line:#ded8c9;--green:#315f48;--green2:#dce9d3;--amber:#b9893b;--red:#a8523a;--blue:#416b88}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#f8f3e7,#edf3e9);color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,textarea,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}
    .app{max-width:1440px;margin:0 auto;padding:24px}.hero{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;margin-bottom:18px}
    .eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--green);font-weight:700}.hero h1{font-size:34px;line-height:1.15;margin:6px 0 8px}.hero p{margin:0;color:var(--muted);max-width:820px}
    .primary,.secondary,.ghost{border:0;border-radius:12px;min-height:42px;padding:0 15px;font-weight:700}.primary{background:var(--green);color:white}.secondary{background:var(--green2);color:var(--green)}.ghost{background:transparent;color:var(--green);border:1px solid var(--line)}
    .layout{display:grid;grid-template-columns:330px minmax(0,1fr);gap:18px}.panel{background:rgba(255,253,246,.86);border:1px solid var(--line);border-radius:20px;box-shadow:0 18px 60px #24352d12}.sidebar{padding:16px;height:calc(100dvh - 144px);position:sticky;top:18px;overflow:auto}.main{padding:18px;min-height:720px}
    .new-session{display:grid;gap:10px;margin-bottom:16px}.field span{display:block;font-size:12px;color:var(--muted);font-weight:700;margin-bottom:5px}.field input,.field textarea,.field select{width:100%;border:1px solid var(--line);background:white;border-radius:10px;padding:10px 11px;color:var(--ink)}.field textarea{min-height:74px;resize:vertical}
    .session-list{display:grid;gap:8px}.session-item{text-align:left;border:1px solid var(--line);border-radius:14px;background:white;padding:12px;width:100%}.session-item.active{border-color:var(--green);background:#f0f6eb}.session-item strong{display:block}.session-item small{display:block;color:var(--muted);margin-top:3px}
    .topline{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:16px}.topline h2{font-size:25px;margin:0 0 5px}.meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:12px}.pill{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:4px 9px;background:white}
    .story{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.step{border:1px solid var(--line);background:white;border-radius:14px;padding:11px}.step b{display:block;color:var(--green)}.step span{display:block;color:var(--muted);font-size:12px;margin-top:3px}.step.done{background:#eef6e8;border-color:#cddfc2}
    .workbench{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(360px,.9fr);gap:16px}.composer,.timeline,.signals,.card{padding:16px}.section-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.section-title h3{margin:0;font-size:17px}.section-title small{color:var(--muted)}
    .event-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.event-tabs button{border:1px solid var(--line);background:white;border-radius:999px;padding:7px 10px;color:var(--muted)}.event-tabs button.active{background:var(--green);border-color:var(--green);color:white}
    .drop{border:1px dashed #b8b09e;border-radius:14px;background:#fffaf0;padding:10px;color:var(--muted);font-size:12px;margin:8px 0}.drop.drag{background:#eef6e8;border-color:var(--green);color:var(--green)}
    .timeline-list{display:grid;gap:10px}.event{border:1px solid var(--line);background:white;border-radius:15px;padding:13px}.event header{display:flex;justify-content:space-between;gap:10px}.event strong{color:var(--green)}.event small{color:var(--muted)}.event pre{white-space:pre-wrap;max-height:150px;overflow:auto;background:#f7f5ee;border-radius:10px;padding:10px;font-size:12px}.signals ul{margin:0;padding-left:18px}.signal-box{border:1px solid var(--line);background:white;border-radius:14px;padding:12px;margin-bottom:10px}
    .method-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.method-block{border:1px solid var(--line);background:white;border-radius:14px;padding:13px}.method-block h4{margin:0 0 8px;color:var(--green)}.method-block ul,.method-block ol{margin:0;padding-left:19px}.method-block li{margin:5px 0}.wide{grid-column:1/-1}.empty{padding:44px;text-align:center;color:var(--muted)}
    .toast{position:fixed;right:20px;bottom:20px;background:#20372b;color:white;padding:12px 14px;border-radius:12px;box-shadow:0 20px 60px #0003;display:none}.toast.show{display:block}
    @media(max-width:980px){.layout,.workbench{grid-template-columns:1fr}.sidebar{position:static;height:auto}.story{grid-template-columns:1fr 1fr}.hero{grid-template-columns:1fr}.method-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<div class="app">
  <section class="hero">
    <div>
      <div class="eyebrow">Work Shadow Recorder · 本地原型</div>
      <h1>把一次真实工作，旁听成数字员工能学的方法卡。</h1>
      <p>这个原型不会录屏、不会监听键盘、不会扫描电脑。你主动创建一个任务，把 AI 对话、操作记录、diff、测试和验收反馈贴进来，它会实时提取经验信号并生成方法卡。</p>
    </div>
    <button class="ghost" id="openData">查看本地数据文件</button>
  </section>

  <div class="layout">
    <aside class="panel sidebar">
      <form class="new-session" id="newSession">
        <div class="section-title"><h3>开始旁听</h3><small>任务级采集</small></div>
        <label class="field"><span>任务标题</span><input name="title" required value="优化首页 UX 主线"/></label>
        <label class="field"><span>任务目标</span><textarea name="goal" required>让客户一眼看懂：真实员工经验如何迁移给数字员工，数字员工如何接任务和组队交付。</textarea></label>
        <label class="field"><span>约束边界</span><textarea name="constraints">不自动扫描电脑；不录屏；只采集本次用户主动提交的任务材料。</textarea></label>
        <label class="field"><span>贡献者</span><input name="contributor" value="李芳军"/></label>
        <label class="field"><span>数字员工</span><input name="employee" value="晓禾"/></label>
        <button class="primary">创建旁听会话</button>
      </form>
      <div class="section-title"><h3>旁听会话</h3><small id="count">0 个</small></div>
      <div class="session-list" id="sessions"></div>
    </aside>

    <main class="panel main" id="main">
      <div class="empty">先创建一个旁听会话，或者选择左侧已有会话。</div>
    </main>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const labels = {
  task_context:'任务上下文', ai_conversation:'AI 协作', operation:'操作记录',
  artifact_diff:'产物变化', validation:'验证证据', acceptance:'验收反馈', boundary:'风险边界'
};
let store = {sessions: []};
let selected = localStorage.getItem('wsr:selected') || '';
let eventType = 'ai_conversation';

const $ = (id) => document.getElementById(id);
const esc = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast = (msg) => {const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200)};
async function api(path, body){
  const res = await fetch('/api'+path, {method: body === undefined ? 'GET':'POST', headers: body===undefined?{}:{'Content-Type':'application/json'}, body: body===undefined?undefined:JSON.stringify(body)});
  if(!res.ok) throw new Error(await res.text());
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}
async function load(){
  store = await api('/sessions');
  if(!selected && store.sessions[0]) selected = store.sessions[0].id;
  renderSidebar(); renderMain();
}
function current(){return store.sessions.find(s=>s.id===selected)}
function renderSidebar(){
  $('count').textContent = `${store.sessions.length} 个`;
  $('sessions').innerHTML = store.sessions.map(s => `<button class="session-item ${s.id===selected?'active':''}" data-id="${s.id}">
    <strong>${esc(s.title)}</strong><small>${esc(s.employee)} · ${s.events.length} 条事件 · ${esc(s.created_at)}</small>
  </button>`).join('') || '<div class="empty" style="padding:18px">暂无会话</div>';
  document.querySelectorAll('.session-item').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.id; localStorage.setItem('wsr:selected',selected); renderSidebar(); renderMain()});
}
function renderMain(){
  const s = current();
  if(!s){$('main').innerHTML='<div class="empty">先创建一个旁听会话，或者选择左侧已有会话。</div>'; return}
  const card = s.method_card;
  const done = [s.events.length>0, has('ai_conversation'), has('artifact_diff')||has('operation'), has('validation'), !!card];
  $('main').innerHTML = `
    <div class="topline">
      <div><h2>${esc(s.title)}</h2><div class="meta">
        <span class="pill">贡献者：${esc(s.contributor)}</span><span class="pill">数字员工：${esc(s.employee)}</span><span class="pill">会话：${esc(s.id)}</span>
      </div></div>
      <div><button class="secondary" id="generate">生成方法卡</button> <button class="ghost" id="exportMd">导出 Markdown</button></div>
    </div>
    <div class="story">
      ${['创建任务','导入 AI 协作','记录操作/产物','添加验证验收','生成方法卡'].map((x,i)=>`<div class="step ${done[i]?'done':''}"><b>${done[i]?'✓':'0'+(i+1)}</b><span>${x}</span></div>`).join('')}
    </div>
    <div class="workbench">
      <section>
        <div class="panel composer">
          <div class="section-title"><h3>追加旁听事件</h3><small>主动提交，不做无感采集</small></div>
          <div class="event-tabs">${Object.entries(labels).map(([k,v])=>`<button class="${k===eventType?'active':''}" data-type="${k}">${v}</button>`).join('')}</div>
          <label class="field"><span>事件标题</span><input id="eventTitle" value="${labels[eventType]}"/></label>
          <label class="field"><span>事件内容</span><textarea id="eventContent" style="min-height:170px" placeholder="粘贴 AI 对话、操作记录、git diff、测试结果或验收反馈…"></textarea></label>
          <div class="drop" id="drop">也可以把 .txt/.md/.diff/.patch 文件拖到这里，浏览器会读取文本并填入上方。</div>
          <button class="primary" id="addEvent">保存事件并提取经验信号</button>
        </div>
        <div class="panel timeline" style="margin-top:16px">
          <div class="section-title"><h3>任务时间线</h3><small>${s.events.length} 条</small></div>
          <div class="timeline-list">${s.events.slice().reverse().map(eventHtml).join('') || '<div class="empty" style="padding:24px">还没有事件。先粘贴一段 AI 对话试试。</div>'}</div>
        </div>
      </section>
      <section>
        <div class="panel signals">
          <div class="section-title"><h3>实时经验信号</h3><small>系统从事件里提取</small></div>
          ${signalsHtml(s)}
        </div>
        <div class="panel card" style="margin-top:16px">
          <div class="section-title"><h3>方法卡草稿</h3><small>${card ? esc(card.generated_at) : '尚未生成'}</small></div>
          ${card ? cardHtml(card) : '<div class="empty" style="padding:26px">保存几条事件后点击「生成方法卡」。</div>'}
        </div>
      </section>
    </div>`;
  document.querySelectorAll('.event-tabs button').forEach(b=>b.onclick=()=>{eventType=b.dataset.type; renderMain()});
  $('addEvent').onclick = addEvent;
  $('generate').onclick = generate;
  $('exportMd').onclick = exportMd;
  wireDrop();
  function has(type){return s.events.some(e=>e.type===type)}
}
function eventHtml(e){
  return `<article class="event"><header><div><strong>${esc(labels[e.type]||e.type)} · ${esc(e.title)}</strong><small>${esc(e.created_at)}</small></div></header>
    <pre>${esc(e.content.slice(0,1800))}</pre>
    ${(e.signals||[]).length?`<small>识别信号：${e.signals.map(esc).join(' / ')}</small>`:''}</article>`;
}
function signalsHtml(s){
  const groups = {};
  s.events.forEach(e => (e.signals||[]).forEach(sig => {groups[e.type] ||= []; groups[e.type].push(sig)}));
  const parts = Object.entries(groups).map(([type, sigs])=>`<div class="signal-box"><strong>${labels[type]||type}</strong><ul>${[...new Set(sigs)].slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);
  return parts.join('') || '<div class="empty" style="padding:24px">保存事件后会显示。</div>';
}
function list(items, ordered=false){return `<${ordered?'ol':'ul'}>${(items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</${ordered?'ol':'ul'}>`}
function cardHtml(c){
  return `<div class="method-grid">
    <div class="method-block wide"><h4>${esc(c.title)}</h4><p>任务类型：${esc(c.task_type)} · 状态：${esc(c.status)}</p></div>
    <div class="method-block"><h4>适用条件</h4>${list(c.applicable_when)}</div>
    <div class="method-block"><h4>AI 指挥策略</h4>${list(c.ai_strategy)}</div>
    <div class="method-block wide"><h4>工作步骤</h4>${list(c.steps,true)}</div>
    <div class="method-block"><h4>质量标准</h4>${list(c.quality_bar)}</div>
    <div class="method-block"><h4>风险边界</h4>${list(c.boundaries)}</div>
    <div class="method-block wide"><h4>证据来源</h4>${list(c.evidence)}</div>
  </div>`;
}
async function addEvent(){
  const title = $('eventTitle').value.trim() || labels[eventType];
  const content = $('eventContent').value.trim();
  if(!content){toast('先输入事件内容'); return}
  await api(`/sessions/${selected}/events`, {type:eventType,title,content});
  $('eventContent').value = '';
  toast('已保存事件并提取信号');
  await load();
}
async function generate(){
  await api(`/sessions/${selected}/method-card`, {});
  toast('方法卡已生成');
  await load();
}
async function exportMd(){
  const md = await api(`/sessions/${selected}/export.md`);
  const blob = new Blob([md], {type:'text/markdown;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${current().id}-work-shadow-report.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function wireDrop(){
  const d = $('drop');
  d.ondragover = e => {e.preventDefault(); d.classList.add('drag')};
  d.ondragleave = () => d.classList.remove('drag');
  d.ondrop = async e => {
    e.preventDefault(); d.classList.remove('drag');
    const file = e.dataTransfer.files[0]; if(!file) return;
    const text = await file.text();
    $('eventTitle').value = file.name;
    $('eventContent').value = text;
    if(/\.(diff|patch)$/i.test(file.name)) eventType='artifact_diff';
    renderMain(); $('eventTitle').value = file.name; $('eventContent').value = text;
  };
}
$('newSession').onsubmit = async e => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.currentTarget).entries());
  const created = await api('/sessions', form);
  selected = created.id; localStorage.setItem('wsr:selected', selected);
  toast('旁听会话已创建');
  await load();
};
$('openData').onclick = () => toast('数据文件：runtime/work-shadow-recorder.json');
load().catch(err=>{$('main').innerHTML='<div class="empty">加载失败：'+esc(String(err))+'</div>'});
</script>
</body>
</html>"""


@dataclass
class ServerConfig:
    port: int = DEFAULT_PORT


class Handler(BaseHTTPRequestHandler):
    server_version = "WorkShadowRecorder/0.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[%s] %s\n" % (now(), fmt % args))

    def send_json(self, data: object, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text: str, content_type: str = "text/plain; charset=utf-8", status: int = 200) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            self.send_text(HTML, "text/html; charset=utf-8")
            return
        if path == "/api/sessions":
            data = load_store()
            data["sessions"].sort(key=lambda s: s.get("created_at", ""), reverse=True)
            self.send_json(data)
            return
        match = re.fullmatch(r"/api/sessions/([^/]+)/export\.md", path)
        if match:
            data = load_store()
            session = get_session(data, match.group(1))
            if not session:
                self.send_error(HTTPStatus.NOT_FOUND, "session not found")
                return
            self.send_text(markdown_export(session), "text/markdown; charset=utf-8")
            return
        if path == "/api/git-diff":
            query = parse_qs(parsed.query)
            target = Path(query.get("path", [str(ROOT)])[0]).expanduser().resolve()
            if ROOT not in [target, *target.parents]:
                self.send_error(HTTPStatus.FORBIDDEN, "path must be inside this project")
                return
            try:
                diff = subprocess.check_output(["git", "diff", "--", str(target)], cwd=ROOT, text=True, stderr=subprocess.STDOUT, timeout=10)
            except Exception as exc:
                diff = f"无法读取 git diff：{exc}"
            self.send_text(diff)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "invalid json")
            return

        if path == "/api/sessions":
            data = load_store()
            session = {
                "id": uid("WS"),
                "title": clean_text(body.get("title"), 120) or "未命名旁听任务",
                "goal": clean_text(body.get("goal"), 3000),
                "constraints": clean_text(body.get("constraints"), 3000),
                "contributor": clean_text(body.get("contributor"), 80) or "贡献者",
                "employee": clean_text(body.get("employee"), 80) or "数字员工",
                "created_at": now(),
                "events": [],
                "method_card": None,
            }
            if session["goal"]:
                session["events"].append({
                    "id": uid("EV"),
                    "type": "task_context",
                    "title": "任务目标与约束",
                    "content": f"目标：{session['goal']}\n约束：{session['constraints']}",
                    "signals": extract_signals("task_context", f"{session['goal']}\n{session['constraints']}"),
                    "created_at": now(),
                })
            data["sessions"].append(session)
            save_store(data)
            self.send_json(session, 201)
            return

        match = re.fullmatch(r"/api/sessions/([^/]+)/events", path)
        if match:
            data = load_store()
            session = get_session(data, match.group(1))
            if not session:
                self.send_error(HTTPStatus.NOT_FOUND, "session not found")
                return
            event_type = body.get("type") if body.get("type") in EVENT_LABELS else "operation"
            content = clean_text(body.get("content"))
            if not content:
                self.send_error(HTTPStatus.BAD_REQUEST, "empty content")
                return
            event = {
                "id": uid("EV"),
                "type": event_type,
                "title": clean_text(body.get("title"), 140) or EVENT_LABELS[event_type],
                "content": content,
                "signals": extract_signals(event_type, content),
                "created_at": now(),
            }
            session["events"].append(event)
            session["method_card"] = None
            save_store(data)
            self.send_json(event, 201)
            return

        match = re.fullmatch(r"/api/sessions/([^/]+)/method-card", path)
        if match:
            data = load_store()
            session = get_session(data, match.group(1))
            if not session:
                self.send_error(HTTPStatus.NOT_FOUND, "session not found")
                return
            card = build_method_card(session)
            session["method_card"] = card
            save_store(data)
            self.send_json(card)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "not found")


def create_demo() -> dict:
    data = load_store()
    existing = next((s for s in data["sessions"] if s.get("title") == "演示：从 UX 纠偏中沉淀数字员工方法卡"), None)
    if existing:
        return existing
    session = {
        "id": uid("WS"),
        "title": "演示：从 UX 纠偏中沉淀数字员工方法卡",
        "goal": "让客户一眼看懂 Agent Workforce Lab 的主线：真实员工经验迁移、数字员工学习考试、发布任务、动态组队交付。",
        "constraints": "不要录屏，不自动扫描电脑；只采集用户主动提交的对话、diff、验证和验收反馈。",
        "contributor": "李芳军",
        "employee": "晓禾",
        "created_at": now(),
        "events": [],
        "method_card": None,
    }
    examples = [
        ("task_context", "任务目标与约束", f"目标：{session['goal']}\n约束：{session['constraints']}"),
        ("ai_conversation", "专家纠正 AI 产品主线", "用户：你没有理解这个需求的主线。第一步是真实员工经验迁移到数字员工；第二步数字员工考试和试岗；第三步真实用户发布任务；第四步数字员工自评、接单、必要时拉人组队。\nAI：明白，首页不能只是地图或指标卡，必须让用户直接操作：工作旁听、发布任务、查看进度成果。\n用户：重点是客户能理解、好演示、故事好讲。"),
        ("operation", "操作记录", "打开原型首页，删除大面积口号；把入口改为三个动作：开始旁听一次工作、发布任务、查看组队交付；保留校园广场作为可观察空间。"),
        ("artifact_diff", "产物变化 diff", "diff --git a/frontend/src/main.tsx b/frontend/src/main.tsx\n+ 添加 Work Shadow Recorder 入口\n+ 首页三动作：旁听、发布、结果\n- 删除四张泛指标卡\n"),
        ("validation", "验证证据", "检查 1440×900：首屏能看到三个入口；检查 375×812：地图保留概览，核心操作进入全尺寸面板；用户 5 秒内能复述产品解决什么问题。"),
        ("acceptance", "验收反馈", "真人确认：这个方向可以演示。需要继续补充真实旁听采集器，让我本地安装试用。"),
    ]
    for event_type, title, content in examples:
        session["events"].append({
            "id": uid("EV"),
            "type": event_type,
            "title": title,
            "content": content,
            "signals": extract_signals(event_type, content),
            "created_at": now(),
        })
    session["method_card"] = build_method_card(session)
    data["sessions"].append(session)
    save_store(data)
    return session


def serve(port: int) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Work Shadow Recorder 已启动：http://127.0.0.1:{port}/")
    print(f"本地数据文件：{DATA_PATH}")
    print("停止：Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="本地工作旁听采集器")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--demo", action="store_true", help="创建一条演示旁听会话")
    parser.add_argument("--export", metavar="SESSION_ID", help="导出某个会话 Markdown 到 stdout")
    args = parser.parse_args(argv)

    if args.demo:
        session = create_demo()
        print(f"已创建演示会话：{session['id']} · {session['title']}")
        print(f"运行：python3 {Path(__file__).name} --port {args.port}")
        return 0
    if args.export:
        data = load_store()
        session = get_session(data, args.export)
        if not session:
            print("会话不存在", file=sys.stderr)
            return 2
        print(markdown_export(session))
        return 0
    serve(args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
