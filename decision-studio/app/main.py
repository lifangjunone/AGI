from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import settings
from .providers import UpstreamError, compare, decide, health, rank
from .schemas import CompareRequest, DecisionRequest, RankRequest

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="Decision Studio API",
    version="0.1.0",
    root_path=settings.root_path,
)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=[item.strip() for item in settings.allowed_origins.split(",")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.middleware("http")
async def production_guards(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_bytes:
        return JSONResponse(
            status_code=413,
            content={"error": {"code": "payload_too_large", "message": "请求内容过大"}},
        )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": {"code": "rate_limited", "message": "请求太频繁，请稍后再试"}
        },
    )


@app.exception_handler(UpstreamError)
async def upstream_handler(_request: Request, exc: UpstreamError):
    return JSONResponse(
        status_code=502,
        content={"error": {"code": f"{exc.provider}_upstream_error", "message": exc.message}},
    )


@app.get("/api/health")
async def get_health():
    return await health()


@app.post("/api/decisions")
@limiter.limit(settings.rate_limit)
async def create_decision(request: Request, body: DecisionRequest):
    payload = body.model_dump(exclude={"provider", "jev_api_key"}, exclude_none=True)
    if body.provider == "jev" and not body.jev_api_key:
        raise HTTPException(status_code=422, detail="使用 Jev 时需要 API Key")
    return await decide(body.provider, payload, body.jev_api_key)


@app.post("/api/compare")
@limiter.limit("20/minute")
async def compare_models(request: Request, body: CompareRequest):
    return await compare(body.model_dump(exclude={"jev_api_key"}), body.jev_api_key)


@app.post("/api/rank")
@limiter.limit(settings.rate_limit)
async def rank_candidates(request: Request, body: RankRequest):
    if body.provider == "jev" and not body.jev_api_key:
        raise HTTPException(status_code=422, detail="使用 Jev 时需要 API Key")
    payload = body.model_dump(exclude={"provider", "jev_api_key"}, exclude_none=True)
    return await rank(body.provider, payload, body.jev_api_key)


frontend = Path(__file__).resolve().parent.parent / "dist"
if frontend.exists():
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
