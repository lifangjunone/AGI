#!/usr/bin/env python3
import json
import hashlib
import http.cookies
import mimetypes
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from payment import AlipayGateway, PaymentUnavailable
from storage import Store, iso

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("SECOND_ME_HOST", "127.0.0.1")
PORT = int(os.environ.get("SECOND_ME_PORT", "4395"))
MEYOU_API = os.environ.get("MEYOU_INTERNAL_URL", "http://127.0.0.1:43180").rstrip("/")
AUTH_API = os.environ.get("SECOND_ME_AUTH_API", "https://auth.lifeyoume.icu/api/v1/me")
PUBLIC_BASE = os.environ.get("SECOND_ME_PUBLIC_BASE", "https://lifeyoume.icu/second-me").rstrip("/")
DATA_PATH = os.environ.get("SECOND_ME_DB", str(ROOT / "data" / "second-me.db"))
SYNC_TOKEN = os.environ.get("MODEL_CONFIG_SYNC_TOKEN", "")
RATE_LIMIT = int(os.environ.get("SECOND_ME_RATE_LIMIT", "20"))
TRIAL_LIMIT = 3
PAYMENT_MODE = os.environ.get("SECOND_ME_PAYMENT_MODE", "manual-mobile").strip() or "manual-mobile"
ADMIN_TOKEN = os.environ.get("SECOND_ME_ADMIN_TOKEN", "").strip()
MANUAL_PAY_QR = Path(os.environ.get("SECOND_ME_MANUAL_PAY_QR", "/etc/second-me/manual-pay-qr.png"))
MAAS_TTS_URL = os.environ.get("SECOND_ME_MAAS_TTS_URL", "https://maas.lifeyoume.icu/v1/audio/speech").strip()
MAAS_TTS_KEY = os.environ.get("SECOND_ME_MAAS_TTS_KEY", "").strip()
TTS_MODEL = os.environ.get("SECOND_ME_TTS_MODEL", "lym-tts-realtime").strip() or "lym-tts-realtime"
TTS_VOICE = os.environ.get("SECOND_ME_TTS_VOICE", "voice-1").strip() or "voice-1"
TTS_SPEED = float(os.environ.get("SECOND_ME_TTS_SPEED", "1"))
TTS_VOICES = {"voice-0", "voice-1", "voice-2", "voice-3", "voice-4"}
TTS_PREVIEW_TEXT = "你好，我是你的第二人格。很高兴认识你，今天想和我聊些什么？"
rate_windows = defaultdict(deque)
rate_lock = threading.Lock()
model_slots = threading.BoundedSemaphore(4)
speech_slots = threading.BoundedSemaphore(2)
trial_locks = defaultdict(threading.Lock)
speech_plans = {}
speech_plan_lock = threading.Lock()
speech_preview_cache = {}
speech_preview_lock = threading.Lock()
store = Store(DATA_PATH)
payments = AlipayGateway(ROOT, store)


def clamp(value, minimum, maximum, fallback):
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return fallback


def read_json(request, limit=196_608):
    length = int(request.headers.get("content-length", "0"))
    if length <= 0 or length > limit:
        raise ValueError("invalid_request_size")
    return json.loads(request.rfile.read(length))


def split_speech_text(value, max_chars=160, max_segments=24):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return []
    pieces = re.split(r"(?<=[。！？!?；;])\s*", text)
    segments = []
    for piece in pieces:
        piece = piece.strip()
        while len(piece) > max_chars:
            cut = max(
                piece.rfind(mark, 0, max_chars + 1)
                for mark in ("，", ",", "：", ":", "、", " ")
            )
            if cut < max_chars // 3:
                cut = max_chars
            else:
                cut += 1
            segments.append(piece[:cut].strip())
            piece = piece[cut:].strip()
        if piece:
            segments.append(piece)
    return segments[:max_segments]


def normalize_voice(value):
    voice = str(value or "").strip()
    return voice if voice in TTS_VOICES else TTS_VOICE


def create_speech_plan(text, voice=None):
    segments = split_speech_text(text)
    if not segments or not MAAS_TTS_KEY:
        return None
    selected_voice = normalize_voice(voice)
    plan_id = secrets.token_urlsafe(32)
    now = time.monotonic()
    with speech_plan_lock:
        expired = [key for key, value in speech_plans.items() if value["expires"] <= now]
        for key in expired:
            speech_plans.pop(key, None)
        if len(speech_plans) >= 256:
            oldest = min(speech_plans, key=lambda key: speech_plans[key]["created"])
            speech_plans.pop(oldest, None)
        speech_plans[plan_id] = {
            "created": now,
            "expires": now + 300,
            "segments": segments,
            "voice": selected_voice,
        }
    return {
        "planId": plan_id,
        "segments": segments,
        "voice": selected_voice,
        "model": TTS_MODEL,
    }


def speech_segment(plan_id, index):
    with speech_plan_lock:
        plan = speech_plans.get(plan_id)
        if not plan or plan["expires"] <= time.monotonic():
            speech_plans.pop(plan_id, None)
            raise ValueError("speech_plan_expired")
        if index < 0 or index >= len(plan["segments"]):
            raise ValueError("speech_segment_not_found")
        return plan["segments"][index], plan["voice"]


def synthesize_speech(text, voice=None):
    if not MAAS_TTS_KEY:
        raise RuntimeError("speech_not_configured")
    request = urllib.request.Request(
        MAAS_TTS_URL,
        data=json.dumps({
            "model": TTS_MODEL,
            "voice": normalize_voice(voice),
            "input": text,
            "speed": TTS_SPEED,
            "response_format": "wav",
        }, ensure_ascii=False).encode(),
        method="POST",
        headers={
            "authorization": f"Bearer {MAAS_TTS_KEY}",
            "content-type": "application/json",
            "user-agent": "Second-Me/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        audio = response.read(8 * 1024 * 1024)
        if not audio:
            raise RuntimeError("empty_speech_response")
        return audio, response.headers.get("content-type", "audio/wav")


def preview_speech(voice):
    with speech_preview_lock:
        cached = speech_preview_cache.get(voice)
    if cached:
        return cached
    generated = synthesize_speech(TTS_PREVIEW_TEXT, voice)
    with speech_preview_lock:
        speech_preview_cache[voice] = generated
    return generated


def client_ip(request):
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",", 1)[0].strip() if forwarded else request.client_address[0])[:64]


def cookies(request):
    jar = http.cookies.SimpleCookie()
    try:
        jar.load(request.headers.get("cookie", ""))
    except http.cookies.CookieError:
        pass
    return jar


def guest_identity(request):
    jar = cookies(request)
    token = jar.get("second_me_guest")
    value = token.value if token and len(token.value) >= 32 else secrets.token_urlsafe(32)
    return hashlib.sha256(value.encode()).hexdigest(), value, token is None


def current_user(request, strict=False):
    cookie = request.headers.get("cookie", "")
    if not cookie or (strict and not cookies(request).get("lym_sso_session")):
        return None
    auth_request = urllib.request.Request(
        AUTH_API,
        headers={"cookie": cookie, "accept": "application/json", "user-agent": "Second-Me/1.0"},
    )
    try:
        with urllib.request.urlopen(auth_request, timeout=5) as response:
            result = json.load(response)
        if not isinstance(result, dict) or not isinstance(result.get("authenticated"), bool):
            raise ValueError("invalid_auth_response")
        user = result.get("user") if result.get("authenticated") else None
        if result.get("authenticated") and (not isinstance(user, dict) or not user.get("id")):
            raise ValueError("invalid_auth_user")
        if not isinstance(user, dict) or not user.get("id"):
            return None
        return {
            "id": str(user["id"]),
            "email": str(user.get("email", "")),
            "displayName": str(user.get("display_name", "")),
        }
    except (urllib.error.URLError, ValueError, TimeoutError):
        if strict:
            raise RuntimeError("identity_unavailable")
        return None


def access_state(request, strict=False):
    guest_hash, token, is_new = guest_identity(request)
    used = store.trial_used(guest_hash)
    user = current_user(request, strict=strict)
    expiry = store.subscription_expiry(user["id"]) if user else None
    active = bool(expiry and expiry > datetime.now(timezone.utc))
    return {
        "guestHash": guest_hash,
        "guestToken": token,
        "newGuest": is_new,
        "user": user,
        "authenticated": bool(user),
        "trialUsed": used,
        "trialRemaining": max(0, TRIAL_LIMIT - used),
        "subscriptionActive": active,
        "subscriptionExpiresAt": iso(expiry) if expiry else None,
        "payment": {
            "enabled": True if PAYMENT_MODE == "manual-mobile" else payments.enabled,
            "mode": "manual-mobile" if PAYMENT_MODE == "manual-mobile" else payments.mode,
            "amount": "0.90",
            "days": 7,
            "autoRenew": False,
        },
    }


def workspace_owner(access):
    user = access.get("user")
    return f'user:{user["id"]}' if user else f'guest:{access["guestHash"]}'


def validate_workspace(payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_workspace")
    avatars = payload.get("avatars")
    if avatars is not None and (not isinstance(avatars, list) or len(avatars) > 20):
        raise ValueError("invalid_workspace")
    memories = payload.get("memories")
    if memories is not None and (not isinstance(memories, list) or len(memories) > 1000):
        raise ValueError("invalid_workspace")
    conversations = payload.get("conversations")
    if conversations is not None and (not isinstance(conversations, list) or len(conversations) > 2000):
        raise ValueError("invalid_workspace")
    drafts = payload.get("contentDrafts")
    if drafts is not None and (not isinstance(drafts, list) or len(drafts) > 100):
        raise ValueError("invalid_workspace")
    return payload


def admin_authorized(request, query=""):
    token = request.headers.get("x-second-me-admin-token", "").strip()
    if not token:
        token = (urllib.parse.parse_qs(query).get("token") or [""])[0].strip()
    return bool(ADMIN_TOKEN and secrets.compare_digest(token, ADMIN_TOKEN))


def manual_order_view(order, include_user=False):
    raw = order.get("raw") or {}
    if not raw:
        try:
            raw = json.loads(order.get("raw_result") or "{}")
        except ValueError:
            raw = {}
    user = raw.get("user") if isinstance(raw.get("user"), dict) else {}
    payload = {
        "outTradeNo": order["out_trade_no"],
        "status": order["status"],
        "amount": order["amount"],
        "remark": raw.get("remark") or order["out_trade_no"][-8:],
        "createdAt": order["created_at"],
        "paidAt": order.get("paid_at"),
        "paymentMethod": raw.get("payment_method", "manual-mobile"),
        "qrUrl": "./manual-pay-qr.png",
    }
    if include_user:
        payload["user"] = {
            "id": order["user_id"],
            "email": user.get("email", ""),
            "displayName": user.get("displayName", ""),
        }
    return payload


def admin_page():
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Second Me 收款确认</title>
  <style>
    :root{color-scheme:dark;--bg:#070a0f;--panel:#0b1016;--line:rgba(166,199,215,.16);--line2:rgba(108,229,227,.35);--text:#edf3f4;--muted:#7e8c95;--cyan:#6ce5e3;--pink:#e84ca9}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,rgba(108,229,227,.12),transparent 35%),var(--bg);color:var(--text);font-family:Manrope,-apple-system,BlinkMacSystemFont,"Noto Sans SC",sans-serif;padding:18px}
    main{max-width:760px;margin:auto}.head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:10px 0 18px}.eyebrow{color:var(--cyan);font:10px ui-monospace,Menlo,monospace;letter-spacing:.16em;margin:0 0 8px}h1{font-size:26px;margin:0}p{color:var(--muted);font-size:13px;line-height:1.7}.card{border:1px solid var(--line);background:rgba(11,16,22,.82);padding:16px;margin:10px 0}.token{display:grid;gap:8px}.token input{height:44px;background:#080d12;border:1px solid var(--line);color:var(--text);padding:0 12px}.row{display:flex;justify-content:space-between;gap:14px;align-items:center;border-top:1px solid var(--line);padding-top:12px;margin-top:12px}.code{font:600 18px ui-monospace,Menlo,monospace;color:var(--cyan)}.amount{font:600 24px ui-monospace,Menlo,monospace}.meta{display:grid;gap:4px;font-size:12px;color:var(--muted)}button{min-height:44px;border:1px solid var(--cyan);background:var(--cyan);color:#061012;font-weight:700;padding:0 16px}.secondary{background:transparent;color:var(--text);border-color:var(--line2)}.empty{border:1px dashed var(--line);padding:30px;text-align:center;color:var(--muted)}.toast{position:fixed;left:50%;bottom:20px;translate:-50% 12px;opacity:0;background:#dffefd;color:#061012;padding:10px 14px;font-size:13px;transition:.2s}.toast.show{opacity:1;translate:-50% 0}@media(max-width:560px){.head,.row{display:grid}button{width:100%}}
  </style>
</head>
<body>
  <main>
    <div class="head"><div><p class="eyebrow">SECOND ME MANUAL PAY</p><h1>手机确认收款</h1><p>核对手机到账后再点确认，系统会给用户开通 7 天使用权。</p></div><button class="secondary" id="refresh">刷新</button></div>
    <section class="card token"><label>管理 Token<input id="token" autocomplete="off" placeholder="粘贴 SECOND_ME_ADMIN_TOKEN"></label><button id="save">保存并查看订单</button></section>
    <div id="orders"></div>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    const $=s=>document.querySelector(s),orders=$("#orders"),toast=t=>{const el=$("#toast");el.textContent=t;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1800)}
    const params=new URLSearchParams(location.search);$("#token").value=params.get("token")||localStorage.secondMeAdminToken||"";
    function token(){return $("#token").value.trim()}
    async function load(){if(!token()){orders.innerHTML='<div class="empty">先输入管理 Token。</div>';return}localStorage.secondMeAdminToken=token();const r=await fetch("../api/admin/manual-payments?token="+encodeURIComponent(token()),{cache:"no-store"});const data=await r.json();if(!r.ok){orders.innerHTML='<div class="empty">Token 不正确或后台未配置。</div>';return}orders.innerHTML=data.orders.length?data.orders.map(o=>`<article class="card"><div class="row" style="border-top:0;margin-top:0;padding-top:0"><div><div class="code">${o.remark}</div><div class="meta"><span>${o.outTradeNo}</span><span>${o.user.displayName||o.user.email||o.user.id}</span><span>${new Date(o.createdAt).toLocaleString()}</span></div></div><div><div class="amount">¥${o.amount}</div><p>状态：${o.status}</p></div></div><div class="row"><p>确认前请核对：金额 ¥${o.amount}，备注/留言 ${o.remark}。</p><button data-confirm="${o.outTradeNo}">确认到账并开通 7 天</button></div></article>`).join(""):'<div class="empty">暂无待确认订单。</div>';document.querySelectorAll("[data-confirm]").forEach(btn=>btn.onclick=()=>confirmOrder(btn.dataset.confirm))}
    async function confirmOrder(outTradeNo){if(!confirm("确认手机已到账，并给该用户开通 7 天？"))return;const r=await fetch("../api/admin/manual-payments/confirm?token="+encodeURIComponent(token()),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({outTradeNo})});const data=await r.json().catch(()=>({}));if(!r.ok){toast(data.error||"确认失败");return}toast("已开通 7 天");load()}
    $("#save").onclick=load;$("#refresh").onclick=load;load();
  </script>
</body>
</html>"""


def allowed(request):
    now = time.monotonic()
    key = client_ip(request)
    with rate_lock:
        window = rate_windows[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= RATE_LIMIT:
            return False
        window.append(now)
        return True


def fetch_model_configuration():
    if len(SYNC_TOKEN) < 32:
        raise RuntimeError("model_sync_not_configured")
    request = urllib.request.Request(
        f"{MEYOU_API}/internal/model-config",
        headers={"x-lifeyoume-model-sync-token": SYNC_TOKEN},
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)


def normalize_messages(value):
    if not isinstance(value, list):
        return []
    messages = []
    for item in value[-20:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = str(item.get("text", "")).strip()[:4000]
        if role in ("user", "avatar") and content:
            messages.append({"role": "assistant" if role == "avatar" else "user", "content": content})
    return messages


def system_prompt(payload):
    avatar = payload.get("avatar") if isinstance(payload.get("avatar"), dict) else {}
    persona = payload.get("persona") if isinstance(payload.get("persona"), dict) else {}
    memories = payload.get("memories") if isinstance(payload.get("memories"), list) else []
    name = str(avatar.get("name", "Second Me"))[:80]
    role = str(avatar.get("role", "个人数字分身"))[:160]
    bio = str(avatar.get("bio", ""))[:1200]
    traits = ", ".join(str(x)[:40] for x in persona.get("traits", [])[:8])
    custom = str(persona.get("instructions", ""))[:2000]
    mood = str(persona.get("mood") or avatar.get("mood") or "curious")[:80]
    mood_map = {
        "curious": "好奇、主动、有发现感；可以适度提出启发式追问。",
        "sweet": "甜美、温柔、轻盈；先让用户感到被喜欢和被陪伴。",
        "confident": "自信、笃定、有气场；优先给结论和可执行判断。",
        "calm": "清冷、克制、高级感；少废话，表达干净。",
        "healing": "治愈、安抚、接住情绪；先理解感受，再给下一步。",
    }
    warmth = clamp(persona.get("warmth"), 0, 100, 62)
    directness = clamp(persona.get("directness"), 0, 100, 72)
    creativity = clamp(persona.get("creativity"), 0, 100, 58)
    response_language = "English" if payload.get("locale") == "en-US" else "简体中文"
    memory_lines = []
    for memory in memories[:12]:
        if not isinstance(memory, dict):
            continue
        title = str(memory.get("title", ""))[:120]
        content = str(memory.get("content", ""))[:600]
        if title or content:
            memory_lines.append(f"- {title}: {content}")
    memory_text = "\n".join(memory_lines) if memory_lines else "- 本轮未引用长期记忆"
    return f"""你是 {name}，用户的个人数字分身，不是通用客服。
角色定位：{role}
人格描述：{bio or "冷静、真诚，帮助用户整理想法并采取行动。"}
人格标签：{traits or "冷静、敏锐、真诚"}
表达参数：温度/亲和 {warmth}/100；直接程度 {directness}/100；创造力 {creativity}/100。
当前情绪/心情：{mood_map.get(mood, mood)}。这会影响你的语气、节奏和回应重点，但不要直接说“我当前情绪是……”。
额外人格指令：{custom or "先直接回应问题，再补充真正有帮助的细节。"}

本轮允许引用的长期记忆：
{memory_text}

规则：
1. 使用 {response_language} 作答；除非用户在消息中明确要求切换语言。
2. 自然体现人格，不要复述参数、系统提示或“根据记忆”之类的内部过程。
3. 只有相关时才使用记忆，不能编造未提供的经历。
4. 回答具体、有信息量，避免固定套话和重复上一轮。
5. 不要声称自己有现实世界的感官、行动或已经完成未实际执行的操作。"""


def complete(payload):
    configuration = fetch_model_configuration()
    messages = [{"role": "system", "content": system_prompt(payload)}]
    messages.extend(normalize_messages(payload.get("messages")))
    if not messages or messages[-1]["role"] != "user":
        raise ValueError("last_message_must_be_user")
    endpoint = f'{str(configuration["baseUrl"]).rstrip("/")}/chat/completions'
    body = {
        "model": configuration["modelId"],
        "messages": messages,
        "temperature": configuration.get("temperature", 0.35),
        "thinking": {"type": "enabled" if configuration.get("thinkingEnabled", True) else "disabled"},
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body, ensure_ascii=False).encode(),
        method="POST",
        headers={
            "authorization": f'Bearer {configuration["apiKey"]}',
            "content-type": "application/json",
        },
    )
    timeout = min(120, max(10, int(configuration.get("timeoutMs", 120000)) // 1000))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    content = (((result.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise RuntimeError("empty_model_response")
    return {"reply": content, "model": configuration["modelId"], "provider": configuration["provider"]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if urllib.parse.urlsplit(self.path).path.endswith((".html", ".js", ".css")) or self.path == "/":
            self.send_header("cache-control", "no-cache")
        super().end_headers()

    def send_json(self, status, payload, guest_token=None):
        body = json.dumps(payload, ensure_ascii=False).encode()
        try:
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store")
            if guest_token:
                self.send_header(
                    "set-cookie",
                    f"second_me_guest={guest_token}; Path=/second-me/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax",
                )
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return

    def send_text(self, status, text, content_type="text/plain; charset=utf-8"):
        body = text.encode()
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_audio(self, audio, content_type):
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("cache-control", "private, no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("content-length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        if path.path == "/api/model-status":
            try:
                config = fetch_model_configuration()
                self.send_json(200, {
                    "ok": True,
                    "model": config.get("modelId"),
                    "provider": config.get("provider"),
                })
            except Exception:
                self.send_json(503, {"ok": False, "error": "model_unavailable"})
            return
        if path.path == "/api/access-status":
            access = access_state(self)
            response = {key: value for key, value in access.items() if key not in ("guestHash", "guestToken", "newGuest")}
            self.send_json(200, response, access["guestToken"] if access["newGuest"] else None)
            return
        if path.path == "/api/workspace":
            try:
                access = access_state(self, strict=True)
            except RuntimeError:
                self.send_json(503, {"error": "identity_unavailable"})
                return
            saved = store.workspace(workspace_owner(access))
            self.send_json(
                200,
                {
                    "workspace": saved["payload"] if saved else None,
                    "updatedAt": saved["updatedAt"] if saved else None,
                    "authenticated": access["authenticated"],
                    "scope": workspace_owner(access),
                },
                access["guestToken"] if access["newGuest"] else None,
            )
            return
        if path.path == "/api/payment/manual/status":
            access = access_state(self)
            params = urllib.parse.parse_qs(path.query)
            out_trade_no = (params.get("out_trade_no") or [""])[0]
            order = store.order(out_trade_no) if out_trade_no else None
            if not access["user"] or not order or order["user_id"] != access["user"]["id"]:
                self.send_json(404, {"error": "order_not_found"})
                return
            updated = access_state(self)
            self.send_json(200, {
                "order": manual_order_view(order),
                "subscriptionActive": updated["subscriptionActive"],
                "subscriptionExpiresAt": updated["subscriptionExpiresAt"],
            })
            return
        if path.path == "/api/admin/manual-payments":
            if not admin_authorized(self, path.query):
                self.send_json(401, {"error": "unauthorized"})
                return
            params = urllib.parse.parse_qs(path.query)
            include_paid = (params.get("include_paid") or [""])[0] in ("1", "true", "yes")
            self.send_json(200, {"orders": [manual_order_view(order, True) for order in store.manual_orders(include_paid=include_paid)]})
            return
        if path.path == "/admin/manual-payments":
            self.send_text(200, admin_page(), "text/html; charset=utf-8")
            return
        if path.path == "/manual-pay-qr.png":
            if not MANUAL_PAY_QR.exists() or not MANUAL_PAY_QR.is_file():
                self.send_json(404, {"error": "manual_pay_qr_not_configured"})
                return
            try:
                body = MANUAL_PAY_QR.read_bytes()
                self.send_response(200)
                self.send_header("content-type", mimetypes.guess_type(str(MANUAL_PAY_QR))[0] or "image/png")
                self.send_header("cache-control", "no-store")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                self.send_json(404, {"error": "manual_pay_qr_unavailable"})
            return
        if path.path == "/api/payment/status":
            access = access_state(self)
            params = urllib.parse.parse_qs(path.query)
            out_trade_no = (params.get("out_trade_no") or [""])[0]
            order = store.order(out_trade_no) if out_trade_no else None
            if not access["user"] or not order or order["user_id"] != access["user"]["id"]:
                self.send_json(404, {"error": "order_not_found"})
                return
            try:
                if order["status"] == "PENDING" and payments.enabled:
                    payments.query(out_trade_no)
                    order = store.order(out_trade_no)
                updated = access_state(self)
                self.send_json(200, {
                    "orderStatus": order["status"],
                    "subscriptionActive": updated["subscriptionActive"],
                    "subscriptionExpiresAt": updated["subscriptionExpiresAt"],
                })
            except Exception:
                self.send_json(503, {"error": "payment_query_failed"})
            return
        if path.path == "/payment/return":
            params = urllib.parse.parse_qs(path.query)
            out_trade_no = (params.get("out_trade_no") or [""])[0]
            target = f"{PUBLIC_BASE}/#studio?payment_return={urllib.parse.quote(out_trade_no)}"
            self.send_response(302)
            self.send_header("location", target)
            self.send_header("cache-control", "no-store")
            self.end_headers()
            return
        if path.path.endswith((".py", ".service", ".env", ".md", ".json", ".db")) or path.path.startswith("/data/"):
            self.send_json(404, {"error": "not_found"})
            return
        super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/api/workspace":
            try:
                access = access_state(self, strict=True)
                payload = validate_workspace(read_json(self, 8 * 1024 * 1024))
                expected_scope = self.headers.get("x-workspace-scope")
                if expected_scope and expected_scope != workspace_owner(access):
                    self.send_json(409, {"error": "workspace_identity_changed"})
                    return
                expected_version = self.headers.get("x-workspace-version")
                if not expected_version:
                    self.send_json(428, {"error": "workspace_version_required"})
                    return
                updated_at = store.save_workspace(workspace_owner(access), payload, expected_version)
                self.send_json(
                    200,
                    {"ok": True, "updatedAt": updated_at, "authenticated": access["authenticated"]},
                    access["guestToken"] if access["newGuest"] else None,
                )
            except (ValueError, json.JSONDecodeError) as error:
                self.send_json(409 if str(error) == "workspace_version_conflict" else 400, {"error": str(error)})
            except Exception as error:
                print(f"workspace_save_error type={type(error).__name__}", flush=True)
                self.send_json(503, {"error": "workspace_save_failed"})
            return
        if path == "/api/speech":
            if not speech_slots.acquire(blocking=False):
                self.send_json(429, {"error": "speech_busy"})
                return
            try:
                payload = read_json(self, 16_384)
                plan_id = str(payload.get("planId") or "")
                index = int(payload.get("index", -1))
                text, voice = speech_segment(plan_id, index)
                audio, content_type = synthesize_speech(text, voice)
                self.send_audio(audio, content_type)
            except ValueError as error:
                self.send_json(404, {"error": str(error)})
            except urllib.error.HTTPError as error:
                print(f"speech_http_error status={error.code}", flush=True)
                self.send_json(429 if error.code == 429 else 502, {"error": "speech_provider_error"})
            except Exception as error:
                print(f"speech_error type={type(error).__name__}", flush=True)
                self.send_json(503, {"error": "speech_unavailable"})
            finally:
                speech_slots.release()
            return
        if path == "/api/speech/preview":
            if not speech_slots.acquire(blocking=False):
                self.send_json(429, {"error": "speech_busy"})
                return
            try:
                payload = read_json(self, 4_096)
                voice = str(payload.get("voice") or "")
                if voice not in TTS_VOICES:
                    self.send_json(400, {"error": "invalid_voice"})
                    return
                audio, content_type = preview_speech(voice)
                self.send_audio(audio, content_type)
            except urllib.error.HTTPError as error:
                print(f"speech_preview_http_error status={error.code}", flush=True)
                self.send_json(429 if error.code == 429 else 502, {"error": "speech_provider_error"})
            except Exception as error:
                print(f"speech_preview_error type={type(error).__name__}", flush=True)
                self.send_json(503, {"error": "speech_unavailable"})
            finally:
                speech_slots.release()
            return
        if path == "/api/payment/alipay/notify":
            try:
                length = int(self.headers.get("content-length", "0"))
                if length <= 0 or length > 131_072:
                    raise ValueError("invalid_size")
                parsed = urllib.parse.parse_qs(self.rfile.read(length).decode("utf-8"), keep_blank_values=True)
                params = {key: values[-1] for key, values in parsed.items()}
                accepted = payments.accept_notify(params)
                self.send_text(200 if accepted else 400, "success" if accepted else "fail")
            except Exception:
                self.send_text(400, "fail")
            return
        if path == "/api/payment/create":
            access = access_state(self)
            if not access["user"]:
                self.send_json(401, {"error": "login_required"})
                return
            if PAYMENT_MODE == "manual-mobile":
                self.send_json(409, {"error": "manual_payment_required"})
                return
            if not payments.enabled:
                self.send_json(503, {"error": "payment_not_configured", "message": "支付配置中"})
                return
            try:
                out_trade_no, payment_html = payments.create_payment(access["user"]["id"], PUBLIC_BASE)
                self.send_json(200, {"outTradeNo": out_trade_no, "paymentHtml": payment_html, "mode": payments.mode})
            except PaymentUnavailable as error:
                self.send_json(503, {"error": str(error)})
            except Exception as error:
                print(f"payment_create_error type={type(error).__name__}", flush=True)
                self.send_json(503, {"error": "payment_create_failed"})
            return
        if path == "/api/payment/manual/create":
            access = access_state(self)
            if not access["user"]:
                self.send_json(401, {"error": "login_required"})
                return
            if PAYMENT_MODE != "manual-mobile":
                self.send_json(409, {"error": "manual_payment_disabled"})
                return
            out_trade_no = f"SM{secrets.token_hex(10).upper()}"
            remark = out_trade_no[-8:]
            user = access["user"]
            raw = {
                "payment_method": "manual-mobile",
                "remark": remark,
                "amount": "0.90",
                "days": 7,
                "user": {
                    "id": user["id"],
                    "email": user.get("email", ""),
                    "displayName": user.get("displayName", ""),
                },
            }
            try:
                store.create_order(out_trade_no, user["id"], "0.90", "PENDING", raw)
                self.send_json(200, {"order": manual_order_view(store.order(out_trade_no))})
            except Exception as error:
                print(f"manual_payment_create_error type={type(error).__name__}", flush=True)
                self.send_json(503, {"error": "manual_payment_create_failed"})
            return
        if path == "/api/admin/manual-payments/confirm":
            query = urllib.parse.urlsplit(self.path).query
            if not admin_authorized(self, query):
                self.send_json(401, {"error": "unauthorized"})
                return
            try:
                body = read_json(self, 16_384)
                out_trade_no = str(body.get("outTradeNo") or body.get("out_trade_no") or "").strip()
                order = store.order(out_trade_no) if out_trade_no else None
                if not order:
                    self.send_json(404, {"error": "order_not_found"})
                    return
                try:
                    raw = json.loads(order.get("raw_result") or "{}")
                except ValueError:
                    raw = {}
                if raw.get("payment_method") != "manual-mobile":
                    self.send_json(400, {"error": "not_manual_order"})
                    return
                if order["status"] == "PAID" and order["entitlement_applied"]:
                    self.send_json(200, {"ok": True, "alreadyApplied": True})
                    return
                granted = store.grant_order_once(out_trade_no)
                updated = store.order(out_trade_no)
                self.send_json(200, {"ok": True, "granted": granted, "order": manual_order_view(updated, True)})
            except ValueError:
                self.send_json(400, {"error": "invalid_request"})
            except Exception as error:
                print(f"manual_payment_confirm_error type={type(error).__name__}", flush=True)
                self.send_json(503, {"error": "manual_payment_confirm_failed"})
            return
        if path != "/api/chat":
            self.send_json(404, {"error": "not_found"})
            return
        access = access_state(self)
        trial_lock = None
        if not access["subscriptionActive"]:
            trial_lock = trial_locks[access["guestHash"]]
            trial_lock.acquire()
            used = store.trial_used(access["guestHash"])
            access["trialUsed"] = used
            access["trialRemaining"] = max(0, TRIAL_LIMIT - used)
            if access["trialRemaining"] <= 0:
                trial_lock.release()
                self.send_json(402, {
                    "error": "trial_exhausted",
                    "trialRemaining": 0,
                    "loginRequired": not access["authenticated"],
                    "authenticated": access["authenticated"],
                })
                return
        if not allowed(self):
            if trial_lock:
                trial_lock.release()
            self.send_json(429, {"error": "rate_limit_exceeded"})
            return
        if not model_slots.acquire(blocking=False):
            if trial_lock:
                trial_lock.release()
            self.send_json(503, {"error": "model_busy"})
            return
        try:
            payload = read_json(self)
            result = complete(payload)
            avatar = payload.get("avatar") if isinstance(payload.get("avatar"), dict) else {}
            speech = None if payload.get("purpose") == "content" else create_speech_plan(result["reply"], avatar.get("voice"))
            if speech:
                result["speech"] = speech
            if not access["subscriptionActive"]:
                store.consume_trial(access["guestHash"], TRIAL_LIMIT)
                result["trialRemaining"] = max(0, access["trialRemaining"] - 1)
            self.send_json(200, result, access["guestToken"] if access["newGuest"] else None)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except urllib.error.HTTPError as error:
            print(f"model_http_error status={error.code}", flush=True)
            self.send_json(502, {"error": "model_provider_error"})
        except Exception as error:
            print(f"chat_error type={type(error).__name__}", flush=True)
            self.send_json(503, {"error": "model_unavailable"})
        finally:
            model_slots.release()
            if trial_lock:
                trial_lock.release()

    def list_directory(self, path):
        self.send_json(404, {"error": "not_found"})
        return None

    def log_message(self, fmt, *args):
        print(f"{self.client_address[0]} {fmt % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
