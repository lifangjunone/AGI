from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .metrics import calibration_metrics, probabilities
from .provider import CLMProvider, DecisionProvider, MockProvider, ProviderError
from .schemas import DecideRequest, EvaluationRequest, RankRequest

PACKAGE_DIR = Path(__file__).parent
STATIC_DIR = PACKAGE_DIR / "static"


def create_provider() -> DecisionProvider:
    provider = os.getenv("DECISION_LAB_PROVIDER", "mock").lower()
    if provider == "clm":
        return CLMProvider(
            os.getenv("CLM_BASE_URL", "http://127.0.0.1:8700"),
            os.getenv("CLM_API_KEY"),
            float(os.getenv("CLM_TIMEOUT", "120")),
        )
    if provider == "mock":
        return MockProvider()
    raise RuntimeError("DECISION_LAB_PROVIDER 只能是 clm 或 mock")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.provider = create_provider()
    yield


app = FastAPI(
    title="Decision Model Lab",
    version="0.1.0",
    description="CLM-compatible decision, ranking, calibration and evaluation workbench.",
    lifespan=lifespan,
)


def provider() -> DecisionProvider:
    return app.state.provider


async def require_api_key(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = os.getenv("DECISION_LAB_API_KEY")
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="API key 无效")


async def call(awaitable):
    try:
        return await awaitable
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/health")
async def health(engine: Annotated[DecisionProvider, Depends(provider)]):
    result = await call(engine.health())
    result["lab"] = True
    return result


@app.get("/api/models", dependencies=[Depends(require_api_key)])
async def models(engine: Annotated[DecisionProvider, Depends(provider)]):
    return {"models": await call(engine.models())}


@app.post("/api/decide", dependencies=[Depends(require_api_key)])
async def decide(request: DecideRequest, engine: Annotated[DecisionProvider, Depends(provider)]):
    return await call(engine.decide(request.model_dump(exclude_none=True)))


@app.post("/api/rank", dependencies=[Depends(require_api_key)])
async def rank(request: RankRequest, engine: Annotated[DecisionProvider, Depends(provider)]):
    return await call(engine.rank(request.model_dump(exclude_none=True)))


@app.post("/api/evaluate", dependencies=[Depends(require_api_key)])
async def evaluate(
    request: EvaluationRequest, engine: Annotated[DecisionProvider, Depends(provider)]
):
    rows = []
    for example in request.examples:
        response = await call(
            engine.decide(
                {
                    "state": example.state,
                    "questions": {"target": example.question.model_dump(exclude_none=True)},
                    "model": request.model,
                    "temperature": request.temperature,
                }
            )
        )
        answer = response["answers"]["target"]
        dist = probabilities(answer)
        rows.append(
            {
                "id": example.id,
                "label": example.label,
                "prediction": max(dist, key=dist.get),
                "confidence": max(dist.values()),
                "probabilities": dist,
                "latency_ms": response.get("latency_ms"),
            }
        )
    metrics = calibration_metrics(rows, request.bins)
    latencies = [row["latency_ms"] for row in rows if row["latency_ms"] is not None]
    metrics["latency_ms_mean"] = sum(latencies) / len(latencies) if latencies else None
    return {"model": request.model, "metrics": metrics, "results": rows}


app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


def run() -> None:
    import uvicorn

    uvicorn.run(
        "decision_model_lab.server:app",
        host=os.getenv("DECISION_LAB_HOST", "127.0.0.1"),
        port=int(os.getenv("DECISION_LAB_PORT", "8800")),
        reload=False,
    )
