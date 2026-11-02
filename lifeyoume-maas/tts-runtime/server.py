#!/usr/bin/env python3
import hashlib
import io
import json
import os
import queue
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import sherpa_onnx
import soundfile as sf

HOST = os.getenv("TTS_HOST", "0.0.0.0")
PORT = int(os.getenv("TTS_PORT", "43281"))
MODEL_DIR = Path(os.getenv("TTS_MODEL_DIR", "/models"))
MODEL_REVISION = os.getenv("TTS_MODEL_REVISION", "sherpa-vits-zh-ll-2024-04-25")
INTERNAL_TOKEN = os.environ["TTS_INTERNAL_TOKEN"]
DEFAULT_VOICE = int(os.getenv("TTS_DEFAULT_VOICE", "1"))
MAX_QUEUE = int(os.getenv("TTS_MAX_QUEUE", "8"))
MAX_INPUT_CHARS = int(os.getenv("TTS_MAX_INPUT_CHARS", "500"))
CACHE_DIR = Path(os.getenv("TTS_CACHE_DIR", "/cache"))

slots = threading.BoundedSemaphore(MAX_QUEUE + 1)
generation_lock = threading.Lock()
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def create_tts():
    rule_files = [MODEL_DIR / "phone.fst", MODEL_DIR / "date.fst", MODEL_DIR / "number.fst"]
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(MODEL_DIR / "model.onnx"),
                lexicon=str(MODEL_DIR / "lexicon.txt"),
                tokens=str(MODEL_DIR / "tokens.txt"),
            ),
            provider="cpu",
            num_threads=int(os.getenv("TTS_NUM_THREADS", "2")),
            debug=False,
        ),
        rule_fsts=",".join(str(path) for path in rule_files if path.exists()),
        max_num_sentences=1,
    )
    if not config.validate():
        raise RuntimeError("invalid_tts_config")
    return sherpa_onnx.OfflineTts(config)


tts = create_tts()


def normalize(text):
    return " ".join(str(text).strip().split())


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeYouMeTTS/0.1"

    def log_message(self, pattern, *args):
        print(json.dumps({"level": "info", "message": pattern % args}, ensure_ascii=False))

    def send_json(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health/live":
            return self.send_json(200, {"ok": True, "service": "lifeyoume-tts-runtime"})
        if self.path == "/health/ready":
            return self.send_json(200, {"ok": True, "model": MODEL_REVISION, "voice": DEFAULT_VOICE})
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/v1/audio/speech":
            return self.send_json(404, {"error": "not_found"})
        if self.headers.get("Authorization", "") != f"Bearer {INTERNAL_TOKEN}":
            return self.send_json(401, {"error": "invalid_internal_token"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 65536:
                return self.send_json(413, {"error": "invalid_request_size"})
            payload = json.loads(self.rfile.read(length))
            text = normalize(payload.get("input", ""))
            if not text or len(text) > MAX_INPUT_CHARS:
                return self.send_json(400, {"error": "input must contain 1-500 characters"})
            response_format = str(payload.get("response_format", "wav")).lower()
            if response_format != "wav":
                return self.send_json(400, {"error": "only wav is currently supported"})
            speed = float(payload.get("speed", 1))
            if speed < 0.5 or speed > 2:
                return self.send_json(400, {"error": "speed must be between 0.5 and 2"})
            voice_value = str(payload.get("voice", DEFAULT_VOICE)).removeprefix("voice-")
            voice = int(voice_value)
            if voice not in range(5):
                return self.send_json(400, {"error": "voice must be voice-0 through voice-4"})
            cache_namespace = normalize(payload.get("cache_namespace", ""))
            cache_enabled = bool(payload.get("cache")) and bool(cache_namespace)
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.send_json(400, {"error": "invalid_json_payload"})

        if not slots.acquire(blocking=False):
            return self.send_json(429, {"error": "tts_queue_full"})
        request_id = str(uuid.uuid4())
        started = time.perf_counter()
        cache_key = hashlib.sha256(
            json.dumps(
                [cache_namespace, text, MODEL_REVISION, voice, speed, response_format, 16000],
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
        cache_path = CACHE_DIR / f"{cache_key}.wav"
        cache_hit = cache_enabled and cache_path.exists()
        try:
            if cache_hit:
                audio_bytes = cache_path.read_bytes()
            else:
                with generation_lock:
                    config = sherpa_onnx.GenerationConfig()
                    config.sid = voice
                    config.speed = speed
                    config.silence_scale = 0.2
                    audio = tts.generate(text, config)
                    output = io.BytesIO()
                    sf.write(output, audio.samples, audio.sample_rate, format="WAV", subtype="PCM_16")
                    audio_bytes = output.getvalue()
                    if cache_enabled:
                        temporary = cache_path.with_suffix(f".{os.getpid()}.tmp")
                        temporary.write_bytes(audio_bytes)
                        temporary.replace(cache_path)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio_bytes)))
            self.send_header("X-TTS-Request-Id", request_id)
            self.send_header("X-TTS-Model", MODEL_REVISION)
            self.send_header("X-TTS-Voice", f"voice-{voice}")
            self.send_header("X-TTS-Cache", "hit" if cache_hit else ("miss" if cache_enabled else "bypass"))
            self.send_header("X-TTS-Latency-Ms", str(round((time.perf_counter() - started) * 1000)))
            self.end_headers()
            self.wfile.write(audio_bytes)
        except Exception as error:
            print(json.dumps({"level": "error", "requestId": request_id, "error": str(error)}))
            self.send_json(500, {"error": "synthesis_failed", "requestId": request_id})
        finally:
            slots.release()


ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
