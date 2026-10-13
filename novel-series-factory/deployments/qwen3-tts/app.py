import base64
import io
import os
import threading
import time
import uuid
from pathlib import Path

import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from qwen_tts import Qwen3TTSModel


DATA_DIR = Path(os.getenv("TTS_DATA_DIR", "./data")).resolve()
OUTPUT_DIR = DATA_DIR / "outputs"
UPLOAD_DIR = DATA_DIR / "uploads"
CUSTOM_MODEL = os.getenv(
    "TTS_CUSTOM_MODEL",
    "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
)
CLONE_MODEL = os.getenv(
    "TTS_CLONE_MODEL",
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
)
DEFAULT_SPEAKER = os.getenv("TTS_DEFAULT_SPEAKER", "Vivian")
DEFAULT_LANGUAGE = os.getenv("TTS_DEFAULT_LANGUAGE", "Chinese")
MAX_TEXT_LENGTH = int(os.getenv("TTS_MAX_TEXT_LENGTH", "2000"))

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Novel Series Factory TTS",
    version="1.0.0",
    description="Qwen3-TTS 1.7B service for character voice and zero-shot cloning.",
)

_active_model = None
_active_model_kind = None
_model_lock = threading.Lock()
_inference_lock = threading.Lock()


def load_model(kind: str):
    global _active_model, _active_model_kind
    if _active_model is not None and _active_model_kind == kind:
        return _active_model

    with _model_lock:
        if _active_model is not None and _active_model_kind == kind:
            return _active_model

        if _active_model is not None:
            del _active_model
            _active_model = None
            _active_model_kind = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        model_name = CUSTOM_MODEL if kind == "custom" else CLONE_MODEL
        model = Qwen3TTSModel.from_pretrained(
            model_name,
            device_map="cuda:0",
            dtype=torch.float16,
            attn_implementation="eager",
        )
        _active_model = model
        _active_model_kind = kind
        return _active_model


def validate_text(text: str):
    value = text.strip()
    if not value:
        raise HTTPException(status_code=400, detail="text must not be empty")
    if len(value) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"text exceeds {MAX_TEXT_LENGTH} characters",
        )
    return value


def save_audio(wav, sample_rate: int):
    output_id = uuid.uuid4().hex
    output_path = OUTPUT_DIR / f"{output_id}.wav"
    sf.write(output_path, wav, sample_rate)
    return output_id, output_path


def audio_response(output_id: str, output_path: Path, started_at: float):
    return {
        "id": output_id,
        "audio_url": f"/v1/audio/{output_id}",
        "audio_base64": base64.b64encode(output_path.read_bytes()).decode("ascii"),
        "format": "wav",
        "elapsed_seconds": round(time.monotonic() - started_at, 3),
    }


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    language: str = DEFAULT_LANGUAGE
    speaker: str = DEFAULT_SPEAKER
    instruct: str = ""


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "cuda": torch.cuda.is_available(),
        "dtype": "float16",
        "loaded_model": _active_model_kind,
        "custom_model": CUSTOM_MODEL,
        "clone_model": CLONE_MODEL,
    }


@app.get("/v1/voices")
def voices():
    return {
        "voices": [
            {"id": "Vivian", "language": "Chinese", "description": "明亮、有张力的年轻女声"},
            {"id": "Serena", "language": "Chinese", "description": "温暖、柔和的年轻女声"},
            {"id": "Uncle_Fu", "language": "Chinese", "description": "低沉、成熟的男性声音"},
            {"id": "Dylan", "language": "Chinese", "description": "清晰自然的北京青年男声"},
            {"id": "Eric", "language": "Chinese", "description": "略带沙哑感的成都青年男声"},
            {"id": "Ryan", "language": "English", "description": "节奏鲜明的英语男声"},
            {"id": "Aiden", "language": "English", "description": "清朗的美式英语男声"},
            {"id": "Ono_Anna", "language": "Japanese", "description": "轻快灵动的日语女声"},
            {"id": "Sohee", "language": "Korean", "description": "温暖且富有情绪的韩语女声"},
        ]
    }


@app.post("/v1/audio/speech")
def create_speech(request: SpeechRequest):
    if not torch.cuda.is_available():
        raise HTTPException(status_code=503, detail="CUDA is not available")

    text = validate_text(request.text)
    started_at = time.monotonic()
    try:
        with _inference_lock:
            model = load_model("custom")
            wavs, sample_rate = model.generate_custom_voice(
                text=text,
                language=request.language,
                speaker=request.speaker,
                instruct=request.instruct,
            )
        output_id, output_path = save_audio(wavs[0], sample_rate)
        return audio_response(output_id, output_path, started_at)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {error}") from error


@app.post("/v1/audio/clone")
async def clone_speech(
    text: str = Form(...),
    language: str = Form(DEFAULT_LANGUAGE),
    ref_text: str = Form(""),
    x_vector_only_mode: bool = Form(False),
    reference_audio: UploadFile = File(...),
):
    if not torch.cuda.is_available():
        raise HTTPException(status_code=503, detail="CUDA is not available")

    text = validate_text(text)
    suffix = Path(reference_audio.filename or "reference.wav").suffix or ".wav"
    upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    upload_path.write_bytes(await reference_audio.read())
    started_at = time.monotonic()

    try:
        with _inference_lock:
            model = load_model("clone")
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                ref_audio=str(upload_path),
                ref_text=ref_text,
                x_vector_only_mode=x_vector_only_mode,
            )
        output_id, output_path = save_audio(wavs[0], sample_rate)
        return audio_response(output_id, output_path, started_at)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Voice clone failed: {error}") from error
    finally:
        upload_path.unlink(missing_ok=True)


@app.get("/v1/audio/{output_id}")
def get_audio(output_id: str):
    if not output_id.isalnum():
        raise HTTPException(status_code=400, detail="invalid output id")
    output_path = OUTPUT_DIR / f"{output_id}.wav"
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="audio not found")
    return FileResponse(output_path, media_type="audio/wav", filename=output_path.name)
