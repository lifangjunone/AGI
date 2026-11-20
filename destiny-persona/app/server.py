from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import tempfile
import time
import uuid
import threading
from datetime import date, datetime
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

try:
    from app.payment import (
        PaymentError,
        apply_paid_order,
        business_fields_match,
        create_order,
        create_payment_form,
        is_paid_event,
        load_config,
        normalize_amount,
        public_config,
        query_trade,
        return_url,
        safe_order,
        verify_notification,
    )
except ModuleNotFoundError:
    from payment import (
        PaymentError,
        apply_paid_order,
        business_fields_match,
        create_order,
        create_payment_form,
        is_paid_event,
        load_config,
        normalize_amount,
        public_config,
        query_trade,
        return_url,
        safe_order,
        verify_notification,
    )

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "45560"))
BASE_PATH = os.environ.get("BASE_PATH", "/destiny-persona").rstrip("/")
FREE_LIMIT = int(os.environ.get("FREE_LIMIT", "3"))
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA_PATH = Path(os.environ.get("DATA_PATH", ROOT / "data" / "analytics.json"))
VERSION = "0.5.1"
STATE_LOCK = threading.RLock()

ARCHETYPES = [
    ("青龙启明", "木", "开创", "像春雷一样先看见机会，再把人拉到同一条路上。"),
    ("朱雀传信", "火", "表达", "把模糊感受翻译成别人听得懂、愿意行动的话。"),
    ("玄武守界", "水", "沉潜", "在混乱里保护边界，慢慢等出真正的答案。"),
    ("白虎机断", "金", "裁决", "看清取舍，敢在关键处落刀。"),
    ("黄麟筑土", "土", "承载", "把人、资源和节奏稳稳接住，让事物长成。"),
    ("星槎旅人", "木", "探索", "不断迁徙视角，替团队找到新大陆。"),
    ("焰心舞者", "火", "感召", "用热情点亮空气，让场域重新流动。"),
    ("镜湖观者", "水", "洞察", "静下来照见真相，不急着被表象带走。"),
    ("霜刃策士", "金", "策略", "拆解局面，找到最短、最硬的一步。"),
    ("山海盟主", "土", "整合", "把分散的人和事合成一个可靠共同体。"),
    ("风铃译者", "木", "连接", "听见细微信号，也帮不同世界互相理解。"),
    ("日冕领航", "火", "领导", "在低气压里抬高亮度，带大家穿过犹豫。"),
    ("雨师疗愈", "水", "修复", "用柔软的方法修补关系和能量。"),
    ("铁卷记录官", "金", "秩序", "把经验沉淀成规则，让下次不必重来。"),
    ("谷仓经营者", "土", "积累", "相信复利，擅长把小收获养成大底盘。"),
    ("竹影生长者", "木", "生长", "懂得灵活调整，也愿意继续向前。"),
]

TONES = [
    ("少阳", "先动起来，答案会在路上显形。"),
    ("太阳", "你需要更大胆地站到光下。"),
    ("少阴", "别急着证明，先把感受听完整。"),
    ("太阴", "真正的力量来自蓄水，而不是硬撑。"),
    ("中宫", "今天最重要的是把节奏调回自己手里。"),
]

ORBITS = ["事业宫", "关系宫", "财富宫", "灵感宫", "修行宫", "迁移宫", "表达宫", "根基宫", "选择宫", "贵人宫"]

STRENGTHS = [
    "能把混乱局面整理成可执行的下一步。",
    "对人的情绪温度很敏感，适合做连接者。",
    "有强烈的审美直觉，知道什么东西“不对味”。",
    "抗压时会进入冷静模式，越关键越能稳住。",
    "擅长发现别人忽略的机会和暗线。",
    "天然适合把复杂概念讲成简单故事。",
    "愿意长期投入，能把微小进展滚成复利。",
    "边界感强，知道哪些事不该继续消耗。",
]

SHADOWS = [
    "容易在还没验证前，就先替结果背负压力。",
    "太在意场域和谐时，会延迟说出真正判断。",
    "灵感太多时，容易同时打开过多战线。",
    "对低质量重复非常敏感，可能显得不耐烦。",
    "习惯自己扛住，反而错过别人能帮忙的入口。",
    "越想做得完整，越容易拖延第一次发布。",
    "有时把直觉当结论，需要补一个证据环。",
    "能看见风险，也要记得给希望留位置。",
]

ACTIONS = [
    "把今天最重要的一件事写成 15 分钟版本，先完成一轮。",
    "找一个值得信任的人复盘，不要只在脑内循环。",
    "删掉一个不必要承诺，把能量还给真正要紧的事。",
    "做一次小公开：发一段想法、一个 demo 或一个明确请求。",
    "把直觉判断补上证据：列三条事实，再决定要不要推进。",
    "今天适合收口，不适合无限扩张。",
    "给身体一个信号：散步、喝水、早睡，先稳住底盘。",
    "把“应该”换成“我选择”，你的行动会轻很多。",
]

STEMS = [
    {"name": "甲", "element": "木", "polarity": "阳", "color": "#62a889"},
    {"name": "乙", "element": "木", "polarity": "阴", "color": "#79b89a"},
    {"name": "丙", "element": "火", "polarity": "阳", "color": "#d88262"},
    {"name": "丁", "element": "火", "polarity": "阴", "color": "#c97162"},
    {"name": "戊", "element": "土", "polarity": "阳", "color": "#b89a64"},
    {"name": "己", "element": "土", "polarity": "阴", "color": "#aa8b62"},
    {"name": "庚", "element": "金", "polarity": "阳", "color": "#c7b98f"},
    {"name": "辛", "element": "金", "polarity": "阴", "color": "#b8b7ad"},
    {"name": "壬", "element": "水", "polarity": "阳", "color": "#648ca7"},
    {"name": "癸", "element": "水", "polarity": "阴", "color": "#718eaa"},
]

BRANCHES = [
    {"name": "子", "zodiac": "鼠", "hours": "23—01时", "direction": "北"},
    {"name": "丑", "zodiac": "牛", "hours": "01—03时", "direction": "东北"},
    {"name": "寅", "zodiac": "虎", "hours": "03—05时", "direction": "东北"},
    {"name": "卯", "zodiac": "兔", "hours": "05—07时", "direction": "东"},
    {"name": "辰", "zodiac": "龙", "hours": "07—09时", "direction": "东南"},
    {"name": "巳", "zodiac": "蛇", "hours": "09—11时", "direction": "东南"},
    {"name": "午", "zodiac": "马", "hours": "11—13时", "direction": "南"},
    {"name": "未", "zodiac": "羊", "hours": "13—15时", "direction": "西南"},
    {"name": "申", "zodiac": "猴", "hours": "15—17时", "direction": "西南"},
    {"name": "酉", "zodiac": "鸡", "hours": "17—19时", "direction": "西"},
    {"name": "戌", "zodiac": "狗", "hours": "19—21时", "direction": "西北"},
    {"name": "亥", "zodiac": "猪", "hours": "21—23时", "direction": "西北"},
]

FORTUNE_CARDS = [
    {
        "key": "overall", "label": "整体", "title": "顺势而行",
        "lead": "先看清今天的节奏，再决定把力气放在哪里。",
        "advice": ["把最重要的一件事向前推进一小步。", "为今天留一点空白，不必把时间排满。"],
        "avoid": ["同时打开太多战线。", "因为一时迟疑就推翻原来的安排。"],
    },
    {
        "key": "career", "label": "事业", "title": "先定后动",
        "lead": "工作上的清晰，来自做完眼前这一步。",
        "advice": ["先完成可交付的版本，再继续打磨。", "把模糊任务改写成一个明确动作。"],
        "avoid": ["在没有证据时反复猜测。", "为了显得忙碌而增加无效动作。"],
    },
    {
        "key": "relation", "label": "关系", "title": "留有回声",
        "lead": "说清自己的感受，也给对方留下回应的空间。",
        "advice": ["主动联系一个想起的人。", "用具体表达代替让人猜测。"],
        "avoid": ["把沉默直接理解成拒绝。", "替别人预设还没有说出口的答案。"],
    },
    {
        "key": "wealth", "label": "财运", "title": "守住尺度",
        "lead": "今天更适合整理和判断，不适合被情绪催促。",
        "advice": ["复核一笔容易忽略的小支出。", "先确认长期价值，再决定是否投入。"],
        "avoid": ["因为稀缺感仓促决定。", "把一次偶然当成稳定趋势。"],
    },
    {
        "key": "action", "label": "行动", "title": "落下一子",
        "lead": "不必等状态完美，先留下一个看得见的进展。",
        "advice": ["用十五分钟启动最难的那件事。", "给下一步设一个明确的完成标准。"],
        "avoid": ["只做准备却迟迟不开始。", "用临时加码代替稳定推进。"],
    },
    {
        "key": "emotion", "label": "心绪", "title": "安顿内心",
        "lead": "情绪是今天的天气，不是对你的最终定义。",
        "advice": ["把当下感受写成一句不带评价的话。", "先照顾身体，再处理复杂判断。"],
        "avoid": ["在疲惫时逼自己给出答案。", "因为短暂低落否定已有积累。"],
    },
]

ELEMENT_WORDS = {
    "木": {"omen": "生长", "verse": "风入新枝，循序可成。", "lucky": "松石青"},
    "火": {"omen": "明朗", "verse": "灯火在前，守心而行。", "lucky": "朱砂红"},
    "土": {"omen": "安定", "verse": "厚土承物，缓行不迟。", "lucky": "秋穗金"},
    "金": {"omen": "澄明", "verse": "去繁留真，自见锋芒。", "lucky": "月白"},
    "水": {"omen": "流转", "verse": "水到渠成，静候回响。", "lucky": "玄青"},
}

PROVINCES = [
    "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江", "安徽", "福建",
    "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", "云南", "西藏",
    "陕西", "甘肃", "青海", "宁夏", "新疆", "香港", "澳门", "台湾",
]

def json_bytes(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()


def read_state():
    if not DATA_PATH.exists():
        return {"visitors": {}, "records": [], "orders": {}, "notifyEvents": {}}
    try:
        value = json.loads(DATA_PATH.read_text())
        if isinstance(value, dict):
            value.setdefault("visitors", {})
            value.setdefault("records", [])
            value.setdefault("orders", {})
            value.setdefault("notifyEvents", {})
            return value
    except Exception:
        pass
    return {"visitors": {}, "records": [], "orders": {}, "notifyEvents": {}}


def write_state(state):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(DATA_PATH.parent), delete=False) as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
        temp_name = handle.name
    Path(temp_name).replace(DATA_PATH)


def pick(items, seed: bytes, offset: int = 0):
    index = seed[offset % len(seed)] % len(items)
    return items[index]


def mask_name(name: str):
    clean = "".join(ch for ch in name.strip()[:16] if ch.isalnum() or "\u4e00" <= ch <= "\u9fff")
    if not clean:
        return "匿名旅人"
    if len(clean) == 1:
        return clean + "＊"
    return clean[0] + "＊" + clean[-1]


def province_from_city(city: str):
    clean = str(city or "").strip()
    for province in PROVINCES:
        if province in clean:
            return province
    return "线上"


def visitor_hash(visitor_id: str):
    return hashlib.sha256(visitor_id.encode()).hexdigest()[:12]


def quota_for(state, visitor_id: str):
    visitor = state["visitors"].get(visitor_id, {"used": 0})
    used = int(visitor.get("used", 0) or 0)
    free_remaining = max(0, FREE_LIMIT - used)
    paid_remaining = max(0, int(visitor.get("credits", 0) or 0))
    return {
        "used": used,
        "limit": FREE_LIMIT,
        "freeRemaining": free_remaining,
        "paidRemaining": paid_remaining,
        "remaining": free_remaining + paid_remaining,
    }


def sexagenary_day(day: date):
    # 2000-01-07 is a documented 甲子日 reference; differences repeat every 60 days.
    anchor = date(2000, 1, 7)
    index = (day - anchor).days % 60
    stem = STEMS[index % 10]
    branch = BRANCHES[index % 12]
    words = ELEMENT_WORDS[stem["element"]]
    return {
        "index": index + 1,
        "id": f"JZ-{index + 1:02d}",
        "name": stem["name"] + branch["name"],
        "stem": stem,
        "branch": branch,
        "omen": words["omen"],
        "verse": words["verse"],
        "luckyColor": words["lucky"],
    }


def build_fortune(payload: dict, today: date | None = None):
    day = today or datetime.now(ZoneInfo("Asia/Shanghai")).date()
    name = str(payload.get("name", "")).strip()[:40] or "未命名旅人"
    birth = str(payload.get("birth", "")).strip()[:20]
    focus = str(payload.get("focus", "")).strip()[:80]
    instinct = str(payload.get("instinct", "")).strip()[:80]
    day_pillar = sexagenary_day(day)
    digest = hashlib.sha256(
        f"{name}|{birth}|{focus}|{instinct}|{day.isoformat()}|fortune-v1".encode("utf-8")
    ).digest()
    order = sorted(range(len(FORTUNE_CARDS)), key=lambda i: hashlib.sha256(digest + bytes([i])).digest())
    cards = []
    for position, card_index in enumerate(order):
        template = FORTUNE_CARDS[card_index]
        variant = digest[(position + 8) % len(digest)] % 2
        cards.append({
            "id": f"{day_pillar['id']}-{template['key'].upper()}",
            "key": template["key"],
            "label": template["label"],
            "title": template["title"],
            "lead": template["lead"],
            "advice": template["advice"][variant],
            "avoid": template["avoid"][variant],
        })
    return {
        "ok": True,
        "version": VERSION,
        "kind": "daily_fortune",
        "date": day.isoformat(),
        "dateLabel": f"{day.year}年{day.month}月{day.day}日",
        "maskedName": mask_name(name),
        "dayPillar": day_pillar,
        "cards": cards,
        "source": "local_calendar_rules",
        "paidAvailable": False,
        "disclaimer": "六十甲子按北京时间日期换日；卡片用于娱乐与自我观察，不构成专业命理或现实决策建议。",
    }


def build_persona(payload: dict):
    name = str(payload.get("name", "")).strip()[:40] or "未命名旅人"
    birth = str(payload.get("birth", "")).strip()[:20]
    instinct = str(payload.get("instinct", "")).strip()[:80]
    focus = str(payload.get("focus", "")).strip()[:80]
    city = str(payload.get("city", "")).strip()[:40]
    salt = f"{name}|{birth}|{instinct}|{focus}|{city}|destiny-persona-v2"
    digest = hashlib.sha256(salt.encode("utf-8")).digest()

    # One stable ID maps to one of 16 archetypes × 5 tones × 2 rhythms.
    number = int.from_bytes(digest[:4], "big") % 160 + 1
    archetype = ARCHETYPES[(number - 1) // 10]
    tone = TONES[((number - 1) % 10) // 2]
    orbit = pick(ORBITS, digest, 6)
    strength = pick(STRENGTHS, digest, 15)
    shadow = pick(SHADOWS, digest, 18)
    action = pick(ACTIONS, digest, 21)

    rhythm = "舒展" if number % 2 else "沉静"
    title = f"{archetype[0]} · {tone[0]}{rhythm}型"
    share = f"我的人格卡是「{title}」#{number:03d}。{archetype[3]}"
    return {
        "ok": True,
        "version": VERSION,
        "id": f"DP-{number:03d}",
        "name": title,
        "element": archetype[1],
        "axis": archetype[2],
        "orbit": orbit,
        "mantra": archetype[3],
        "tone": tone[1],
        "strength": strength,
        "shadow": shadow,
        "action": action,
        "share": share,
        "province": province_from_city(city),
        "maskedName": mask_name(name),
        "source": "local_rules",
        "paidAvailable": False,
        "disclaimer": "娱乐与自我观察用途，不构成心理、医学、投资或真实命理建议。",
    }


def record_persona(state, visitor_id: str, persona: dict):
    created_at = int(time.time())
    visitor = state["visitors"].get(visitor_id) or {"used": 0, "firstSeenAt": created_at}
    if int(visitor.get("used", 0) or 0) < FREE_LIMIT:
        visitor["used"] = int(visitor.get("used", 0) or 0) + 1
    else:
        visitor["credits"] = max(0, int(visitor.get("credits", 0) or 0) - 1)
    visitor["lastSeenAt"] = created_at
    state["visitors"][visitor_id] = visitor
    state["records"].append(
        {
            "createdAt": created_at,
            "visitorHash": visitor_hash(visitor_id),
            "name": persona["maskedName"],
            "province": persona["province"],
            "persona": persona.get("name") or persona.get("dayPillar", {}).get("name", "今日时运"),
            "element": persona.get("element") or persona.get("dayPillar", {}).get("stem", {}).get("element", ""),
            "orbit": persona.get("orbit") or "今日时运",
        }
    )
    state["records"] = state["records"][-500:]
    write_state(state)
    return quota_for(state, visitor_id)


def pulse_payload():
    state = read_state()
    records = list(state.get("records", []))
    province_scores = {}
    archetypes = {}
    for record in records:
        province = record.get("province") or "线上"
        province_scores[province] = province_scores.get(province, 0) + 1
        persona = record.get("persona") or "未知分身"
        archetypes[persona] = archetypes.get(persona, 0) + 1
    top_provinces = sorted(province_scores.items(), key=lambda item: item[1], reverse=True)[:8]
    top_personas = sorted(archetypes.items(), key=lambda item: item[1], reverse=True)[:5]
    recent = [
        {
            "name": item.get("name", "匿名旅人"),
            "province": item.get("province", "线上"),
            "persona": item.get("persona", "命运分身"),
        }
        for item in records[-8:][::-1]
    ]
    return {
        "ok": True,
        "heatIndex": len(records),
        "visitorCount": len(state.get("visitors", {})),
        "readingCount": len(records),
        "scope": "retained_records",
        "topProvinces": [{"province": name, "score": score} for name, score in top_provinces],
        "topPersonas": [{"persona": name, "count": count} for name, count in top_personas],
        "recent": recent,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if os.environ.get("ACCESS_LOG") == "1":
            super().log_message(fmt, *args)

    def send_json(self, status, data, extra_headers=None):
        raw = json_bytes(data)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def send_file(self, file: Path):
        if not file.is_file():
            self.send_error(404)
            return
        raw = file.read_bytes()
        content_type = mimetypes.guess_type(str(file))[0] or "application/octet-stream"
        if file.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"
        if file.suffix in {".html", ".css"} and "charset" not in content_type:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, must-revalidate" if file.suffix in {".html", ".css", ".js"} else "public, max-age=86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def send_text(self, status: int, text: str, content_type="text/plain; charset=utf-8"):
        raw = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def public_origin(self):
        configured = os.environ.get("PUBLIC_ORIGIN", "").strip().rstrip("/")
        if configured:
            return configured
        proto = self.headers.get("X-Forwarded-Proto", "http").split(",")[0].strip()
        host = self.headers.get("X-Forwarded-Host", self.headers.get("Host", "")).split(",")[0].strip()
        return f"{proto}://{host}".rstrip("/")

    def read_json_body(self, limit=16_000):
        length = int(self.headers.get("content-length", "0") or "0")
        if length > limit:
            raise PaymentError("request_too_large")
        return json.loads(self.rfile.read(length).decode("utf-8") if length else "{}")

    def find_owned_order(self, state, visitor_id: str, order_no: str):
        order = state.get("orders", {}).get(order_no)
        if not order or order.get("visitorId") != visitor_id:
            return None
        return order

    def confirm_order(self, state, order, config):
        result = query_trade(order, config)
        trade_status = result.get("trade_status")
        if (
            trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"}
            and result.get("out_trade_no") == order["outTradeNo"]
            and normalize_amount(result.get("total_amount")) == normalize_amount(order["amount"])
        ):
            apply_paid_order(state, order, str(result.get("trade_no") or ""), {"type": "query", "at": int(time.time())})
            write_state(state)
        elif trade_status == "TRADE_CLOSED":
            order["status"] = "CLOSED"
            order["updatedAt"] = int(time.time())
            write_state(state)
        return safe_order(order)

    def visitor_id(self):
        jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        morsel = jar.get("dp_vid")
        if morsel and morsel.value:
            return morsel.value, {}
        value = str(uuid.uuid4())
        return value, {"Set-Cookie": f"dp_vid={value}; Max-Age=31536000; Path={BASE_PATH}/; SameSite=Lax; HttpOnly"}

    def route_static(self, path: str):
        if path == BASE_PATH:
            self.send_response(308)
            self.send_header("Location", BASE_PATH + "/")
            self.end_headers()
            return True
        if not path.startswith(BASE_PATH + "/"):
            return False
        rel = path[len(BASE_PATH) + 1 :] or "index.html"
        if rel == "health":
            self.send_json(200, {"status": "ok", "service": "destiny-persona", "version": VERSION})
            return True
        if rel == "api/pulse":
            self.send_json(200, pulse_payload())
            return True
        if rel.startswith("api/"):
            return False
        target = (PUBLIC / rel).resolve()
        base = PUBLIC.resolve()
        if not target.is_relative_to(base):
            self.send_error(400)
            return True
        self.send_file(target if target.is_file() else base / "index.html")
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            return self.send_json(200, {"status": "ok", "service": "destiny-persona", "version": VERSION})
        if path == BASE_PATH + "/api/billing/config":
            visitor_id, headers = self.visitor_id()
            with STATE_LOCK:
                quota = quota_for(read_state(), visitor_id)
            return self.send_json(200, {"ok": True, **public_config(), "quota": quota}, headers)
        if path == BASE_PATH + "/api/billing/order":
            visitor_id, headers = self.visitor_id()
            order_no = str(parse_qs(parsed.query).get("order", [""])[0])[:80]
            with STATE_LOCK:
                state = read_state()
                order = self.find_owned_order(state, visitor_id, order_no)
                if not order:
                    return self.send_json(404, {"ok": False, "error": "order_not_found"}, headers)
                try:
                    if order["status"] == "PENDING_PAYMENT":
                        self.confirm_order(state, order, load_config(ROOT))
                except Exception:
                    pass
                return self.send_json(
                    200, {"ok": True, "order": safe_order(order), "quota": quota_for(state, visitor_id)}, headers
                )
        if path == BASE_PATH + "/payment/return":
            order_no = str(parse_qs(parsed.query).get("order", [""])[0])[:80]
            safe_order_no = "".join(ch for ch in order_no if ch.isalnum())[:80]
            self.send_response(303)
            self.send_header("Location", f"{BASE_PATH}/#purchase?order={safe_order_no}")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.route_static(path):
            return
        self.send_error(404)

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == BASE_PATH + "/api/billing/checkout":
                visitor_id, headers = self.visitor_id()
                payload = self.read_json_body()
                with STATE_LOCK:
                    state = read_state()
                    order = create_order(state, visitor_id, str(payload.get("planId", "")))
                    config = load_config(ROOT)
                    origin = self.public_origin()
                    notify_url = (
                        os.environ.get("ALIPAY_NOTIFY_URL", "").strip()
                        or f"{origin}{BASE_PATH}/api/billing/notify"
                    )
                    html = create_payment_form(order, config, return_url(origin, order["outTradeNo"]), notify_url)
                    write_state(state)
                return self.send_json(201, {"ok": True, "paymentHtml": html, "order": safe_order(order)}, headers)
            if path == BASE_PATH + "/api/billing/confirm":
                visitor_id, headers = self.visitor_id()
                payload = self.read_json_body()
                with STATE_LOCK:
                    state = read_state()
                    order = self.find_owned_order(state, visitor_id, str(payload.get("order", ""))[:80])
                    if not order:
                        return self.send_json(404, {"ok": False, "error": "order_not_found"}, headers)
                    confirmed = self.confirm_order(state, order, load_config(ROOT))
                    return self.send_json(
                        200, {"ok": True, "order": confirmed, "quota": quota_for(state, visitor_id)}, headers
                    )
            if path == BASE_PATH + "/api/billing/notify":
                length = int(self.headers.get("content-length", "0") or "0")
                if length > 64_000:
                    return self.send_text(400, "fail")
                params = {key: values[-1] for key, values in parse_qs(
                    self.rfile.read(length).decode("utf-8"), keep_blank_values=True
                ).items()}
                try:
                    config = load_config(ROOT)
                    if not verify_notification(params, config):
                        return self.send_text(400, "fail")
                    with STATE_LOCK:
                        state = read_state()
                        order = state.get("orders", {}).get(str(params.get("out_trade_no", "")))
                        if not order or not business_fields_match(order, params, config):
                            return self.send_text(400, "fail")
                        event_id = str(params.get("notify_id") or "").strip()
                        if not event_id:
                            event_id = hashlib.sha256(
                                "|".join(
                                    [
                                        str(params.get("out_trade_no") or ""),
                                        str(params.get("trade_no") or ""),
                                        str(params.get("trade_status") or ""),
                                        str(params.get("gmt_payment") or ""),
                                        str(params.get("gmt_refund") or ""),
                                    ]
                                ).encode("utf-8")
                            ).hexdigest()
                        if event_id not in state["notifyEvents"]:
                            state["notifyEvents"][event_id] = {
                                "outTradeNo": order["outTradeNo"],
                                "tradeNo": str(params.get("trade_no") or ""),
                                "tradeStatus": str(params.get("trade_status") or ""),
                                "createdAt": int(time.time()),
                            }
                            if is_paid_event(params):
                                apply_paid_order(state, order, str(params.get("trade_no") or ""), {"type": "notify"})
                            write_state(state)
                    return self.send_text(200, "success")
                except Exception:
                    return self.send_text(400, "fail")
            if path != BASE_PATH + "/api/read":
                self.send_error(404)
                return
            visitor_id, headers = self.visitor_id()
            payload = self.read_json_body()
            if not isinstance(payload, dict) or not str(payload.get("name", "")).strip():
                return self.send_json(400, {"ok": False, "message": "请填写昵称后重试。"}, headers)
            try:
                birth = date.fromisoformat(str(payload.get("birth", "")))
                if birth > date.today():
                    raise ValueError("future_birth")
            except ValueError:
                return self.send_json(400, {"ok": False, "message": "请填写有效的出生日期，不能晚于今天。"}, headers)
            with STATE_LOCK:
                state = read_state()
                quota = quota_for(state, visitor_id)
                if quota["remaining"] <= 0:
                    return self.send_json(402, {
                        "ok": False, "error": "quota_exhausted", "quota": quota,
                        "paidAvailable": public_config()["checkoutEnabled"],
                        "billing": public_config(),
                        "message": "免费体验已用完，可以购买次数包继续生成。",
                    }, headers)
                persona = build_fortune(payload)
                persona["province"] = province_from_city(str(payload.get("city", "")))
                persona["quota"] = record_persona(state, visitor_id, persona)
            return self.send_json(200, persona, headers)
        except Exception as error:
            return self.send_json(400, {"ok": False, "error": str(error)})


def main():
    print(f"destiny-persona listening on http://{HOST}:{PORT}{BASE_PATH}/", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
