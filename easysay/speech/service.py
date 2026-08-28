from __future__ import annotations

import asyncio
import io
import json
import os
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any

import av
import mlx.core as mx
import numpy as np
import soundfile as sf
from av.audio.resampler import AudioResampler
from fastapi import FastAPI, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config" / "speech-models.json"
LOCAL_CONFIG_PATH = PROJECT_ROOT / ".local" / "speech-models.json"
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class ServiceConfig(BaseModel):
    baseUrl: str
    host: str = "127.0.0.1"
    port: int = Field(default=8790, ge=1024, le=65535)
    requestTimeoutMs: int = Field(default=180_000, ge=10_000, le=600_000)


class RuntimeConfig(BaseModel):
    engine: str = "mlx"
    lazyLoad: bool = True
    maxConcurrentRequests: int = Field(default=1, ge=1, le=2)


class AsrConfig(BaseModel):
    enabled: bool = True
    modelId: str
    modelPath: str
    language: str = "English"
    maxTokens: int = Field(default=1024, ge=64, le=8192)


class TtsConfig(BaseModel):
    enabled: bool = True
    modelId: str
    modelPath: str
    language: str = "english"
    americanVoice: str = "Aiden"
    britishVoice: str = "Ryan"
    speed: float = Field(default=1.0, ge=0.7, le=1.3)
    temperature: float = Field(default=0.8, ge=0.1, le=1.5)
    styleInstruction: str = Field(default="", max_length=500)


class SpeechConfig(BaseModel):
    version: int = 1
    service: ServiceConfig
    runtime: RuntimeConfig
    asr: AsrConfig
    tts: TtsConfig


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000)
    accent: str = Field(default="american", pattern="^(american|british)$")
    voice: str | None = Field(default=None, max_length=80)
    language: str | None = Field(default=None, max_length=40)
    styleInstruction: str | None = Field(default=None, max_length=500)


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def read_config() -> SpeechConfig:
    default_data = json.loads(DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"))
    if LOCAL_CONFIG_PATH.exists():
        local_data = json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
        default_data = deep_merge(default_data, local_data)
    return SpeechConfig.model_validate(default_data)


def resolve_project_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()


def load_fixed_tokenizer(model_path: Path, trust_remote_code: bool = False) -> Any:
    from transformers import AutoTokenizer, logging

    previous_verbosity = logging.get_verbosity()
    logging.set_verbosity_error()
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            str(model_path),
            trust_remote_code=trust_remote_code,
        )
        return type(tokenizer)._patch_mistral_regex(
            tokenizer,
            str(model_path),
            is_local=True,
            fix_mistral_regex=True,
        )
    finally:
        logging.set_verbosity(previous_verbosity)


def decode_audio(data: bytes) -> np.ndarray:
    chunks: list[np.ndarray] = []
    try:
        with av.open(io.BytesIO(data), mode="r") as container:
            stream = next(
                (candidate for candidate in container.streams if candidate.type == "audio"),
                None,
            )
            if stream is None:
                raise ValueError("No audio stream found")

            resampler = AudioResampler(format="flt", layout="mono", rate=16_000)
            for frame in container.decode(stream):
                converted = resampler.resample(frame)
                frames = converted if isinstance(converted, list) else [converted]
                for output in frames:
                    if output is None:
                        continue
                    samples = output.to_ndarray()
                    chunks.append(samples.reshape(-1).astype(np.float32))

            flushed = resampler.resample(None)
            frames = flushed if isinstance(flushed, list) else [flushed]
            for output in frames:
                if output is not None:
                    chunks.append(output.to_ndarray().reshape(-1).astype(np.float32))
    except (av.error.FFmpegError, StopIteration, ValueError) as error:
        raise ValueError("Unsupported or damaged audio") from error

    if not chunks:
        raise ValueError("Audio contains no samples")
    return np.concatenate(chunks)


class ModelManager:
    def __init__(self) -> None:
        self.config = read_config()
        self.asr_model: Any | None = None
        self.tts_model: Any | None = None
        self.inference_lock = asyncio.Lock()
        self.started_at = time.monotonic()
        self.requests = {"asr": 0, "tts": 0, "errors": 0}
        self.last_latency_ms = {"asr": None, "tts": None}

    def model_path(self, kind: str) -> Path:
        model = self.config.asr if kind == "asr" else self.config.tts
        return resolve_project_path(model.modelPath)

    def model_present(self, kind: str) -> bool:
        path = self.model_path(kind)
        return (
            path.is_dir()
            and (path / "config.json").exists()
            and any(path.glob("*.safetensors"))
        )

    def require_model(self, kind: str) -> Path:
        config = self.config.asr if kind == "asr" else self.config.tts
        if not config.enabled:
            raise RuntimeError(f"{kind.upper()} is disabled")
        path = self.model_path(kind)
        if not self.model_present(kind):
            raise RuntimeError(
                f"{kind.upper()} model is missing at {path}. Run npm run speech:setup."
            )
        return path

    def _load_asr(self) -> Any:
        from mlx_audio.stt.utils import load_model

        model_path = self.require_model("asr")
        model = load_model(model_path, lazy=False)
        model._model._tokenizer = load_fixed_tokenizer(
            model_path, trust_remote_code=True
        )
        return model

    def _load_tts(self) -> Any:
        from mlx_audio.tts.utils import load_model
        from transformers import logging

        model_path = self.require_model("tts")
        previous_verbosity = logging.get_verbosity()
        logging.set_verbosity_error()
        try:
            model = load_model(model_path, lazy=False)
            model.tokenizer = load_fixed_tokenizer(model_path)
            return model
        finally:
            logging.set_verbosity(previous_verbosity)

    async def get_asr(self) -> Any:
        if self.asr_model is None:
            self.asr_model = await asyncio.to_thread(self._load_asr)
        return self.asr_model

    async def get_tts(self) -> Any:
        if self.tts_model is None:
            self.tts_model = await asyncio.to_thread(self._load_tts)
        return self.tts_model

    async def reload(self) -> None:
        async with self.inference_lock:
            self.asr_model = None
            self.tts_model = None
            mx.clear_cache()
            self.config = read_config()
            if not self.config.runtime.lazyLoad:
                if self.config.asr.enabled:
                    await self.get_asr()
                if self.config.tts.enabled:
                    await self.get_tts()

    def status(self) -> dict[str, Any]:
        return {
            "ok": True,
            "engine": self.config.runtime.engine,
            "uptimeSeconds": round(time.monotonic() - self.started_at, 1),
            "models": {
                "asr": {
                    "id": self.config.asr.modelId,
                    "path": str(self.model_path("asr")),
                    "present": self.model_present("asr"),
                    "loaded": self.asr_model is not None,
                    "enabled": self.config.asr.enabled,
                },
                "tts": {
                    "id": self.config.tts.modelId,
                    "path": str(self.model_path("tts")),
                    "present": self.model_present("tts"),
                    "loaded": self.tts_model is not None,
                    "enabled": self.config.tts.enabled,
                },
            },
            "metrics": {
                "requests": self.requests,
                "lastLatencyMs": self.last_latency_ms,
            },
        }


manager = ModelManager()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not manager.config.runtime.lazyLoad:
        try:
            async with manager.inference_lock:
                if manager.config.asr.enabled:
                    await manager.get_asr()
                if manager.config.tts.enabled:
                    await manager.get_tts()
        except Exception:
            manager.requests["errors"] += 1
    yield


app = FastAPI(
    title="EasySay Local Speech",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return manager.status()


@app.post("/v1/reload")
async def reload_models() -> dict[str, Any]:
    try:
        await manager.reload()
        return manager.status()
    except Exception as error:
        manager.requests["errors"] += 1
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/v1/models/load")
async def load_models() -> dict[str, Any]:
    try:
        async with manager.inference_lock:
            if manager.config.asr.enabled:
                await manager.get_asr()
            if manager.config.tts.enabled:
                await manager.get_tts()
        return manager.status()
    except Exception as error:
        manager.requests["errors"] += 1
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/v1/asr")
async def transcribe(
    request: Request,
    language: str | None = Query(default=None, max_length=40),
) -> dict[str, Any]:
    data = await request.body()
    # #region debug-point A:C:python-request
    with suppress(Exception):
        import urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:7777/event",data=json.dumps({"sessionId":"iphone-asr-transcription","runId":"post-fix","hypothesisId":"A,C","location":"speech/service.py:transcribe","msg":"[DEBUG] Python ASR received audio","data":{"bytes":len(data),"contentType":request.headers.get("content-type"),"language":language},"ts":int(time.time()*1000)}).encode(),headers={"Content-Type":"application/json"}),timeout=1).read()
    # #endregion
    if not data:
        raise HTTPException(status_code=400, detail="Audio body is empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio exceeds 25 MB")

    started = time.perf_counter()
    try:
        audio = await asyncio.to_thread(decode_audio, data)
        # #region debug-point A:E:decoded-audio
        with suppress(Exception):
            import urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:7777/event",data=json.dumps({"sessionId":"iphone-asr-transcription","runId":"post-fix","hypothesisId":"A,E","location":"speech/service.py:transcribe","msg":"[DEBUG] Audio decoded","data":{"samples":len(audio),"durationSeconds":round(len(audio)/16000,3),"rms":round(float(np.sqrt(np.mean(np.square(audio)))),7)},"ts":int(time.time()*1000)}).encode(),headers={"Content-Type":"application/json"}),timeout=1).read()
        # #endregion
        if len(audio) < 1_600:
            raise ValueError("Audio is too short to transcribe")
        if len(audio) > 16_000 * 180:
            raise ValueError("Audio exceeds the 3 minute limit")
        if float(np.sqrt(np.mean(np.square(audio)))) < 0.0001:
            raise ValueError("Audio is silent")
        async with manager.inference_lock:
            model = await manager.get_asr()
            result = await asyncio.to_thread(
                model.generate,
                audio,
                language=language or manager.config.asr.language,
                max_tokens=manager.config.asr.maxTokens,
                temperature=0.0,
                min_chunk_duration=0.1,
                verbose=False,
            )
        text = str(getattr(result, "text", "")).strip()
        # #region debug-point D:model-result
        with suppress(Exception):
            import urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:7777/event",data=json.dumps({"sessionId":"iphone-asr-transcription","runId":"post-fix","hypothesisId":"D","location":"speech/service.py:transcribe","msg":"[DEBUG] ASR model returned","data":{"textLength":len(text),"latencyMs":round((time.perf_counter()-started)*1000)},"ts":int(time.time()*1000)}).encode(),headers={"Content-Type":"application/json"}),timeout=1).read()
        # #endregion
        if not text:
            raise RuntimeError("ASR returned an empty transcript")
        manager.requests["asr"] += 1
        manager.last_latency_ms["asr"] = round(
            (time.perf_counter() - started) * 1000
        )
        return {
            "text": text,
            "language": getattr(result, "language", None) or language or "English",
            "model": manager.config.asr.modelId,
            "latencyMs": manager.last_latency_ms["asr"],
        }
    except ValueError as error:
        manager.requests["errors"] += 1
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        manager.requests["errors"] += 1
        raise HTTPException(status_code=503, detail=str(error)) from error


def synthesize_wav(model: Any, payload: TtsRequest, config: TtsConfig) -> bytes:
    voice = payload.voice or (
        config.britishVoice if payload.accent == "british" else config.americanVoice
    )
    chunks: list[np.ndarray] = []
    sample_rate = 24_000
    for result in model.generate(
        text=payload.text,
        voice=voice,
        instruct=payload.styleInstruction or config.styleInstruction or None,
        temperature=config.temperature,
        speed=config.speed,
        lang_code=payload.language or config.language,
        max_tokens=1_200,
        verbose=False,
    ):
        chunks.append(np.asarray(result.audio, dtype=np.float32))
        sample_rate = int(result.sample_rate)

    if not chunks:
        raise RuntimeError("TTS returned no audio")

    if len(chunks) > 1:
        silence = np.zeros(int(sample_rate * 0.12), dtype=np.float32)
        joined: list[np.ndarray] = []
        for index, chunk in enumerate(chunks):
            if index:
                joined.append(silence)
            joined.append(chunk)
        audio = np.concatenate(joined)
    else:
        audio = chunks[0]

    if audio.size == 0 or not np.isfinite(audio).all():
        raise RuntimeError("TTS returned invalid audio samples")

    output = io.BytesIO()
    sf.write(output, audio, sample_rate, format="WAV", subtype="PCM_16")
    return output.getvalue()


@app.post("/v1/tts")
async def synthesize(payload: TtsRequest) -> Response:
    started = time.perf_counter()
    try:
        async with manager.inference_lock:
            model = await manager.get_tts()
            audio = await asyncio.to_thread(
                synthesize_wav, model, payload, manager.config.tts
            )
        manager.requests["tts"] += 1
        manager.last_latency_ms["tts"] = round(
            (time.perf_counter() - started) * 1000
        )
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-Speech-Model": manager.config.tts.modelId,
                "X-Latency-Ms": str(manager.last_latency_ms["tts"]),
            },
        )
    except Exception as error:
        manager.requests["errors"] += 1
        raise HTTPException(status_code=503, detail=str(error)) from error


if __name__ == "__main__":
    import uvicorn

    config = manager.config.service
    uvicorn.run(app, host=config.host, port=config.port, log_level="info")
