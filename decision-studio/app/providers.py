import asyncio
import time
from typing import Any

import httpx

from .config import settings


class UpstreamError(RuntimeError):
    def __init__(self, provider: str, status: int, message: str):
        super().__init__(message)
        self.provider, self.status, self.message = provider, status, message


def _message_from_response(provider: str, response: httpx.Response) -> str:
    message = "上游服务返回错误"
    try:
        body = response.json()
        detail = body.get("detail")
        title = body.get("title")
        if response.status_code == 401:
            message = "API Key 无效或无权限"
        elif response.status_code == 451 and isinstance(title, str):
            message = title
        elif isinstance(detail, str):
            message = detail
        elif isinstance(title, str):
            message = title
    except ValueError:
        pass
    if response.status_code == 451:
        return f"{provider.upper()} 当前地区不可用：{message}"
    return message


async def _post(provider: str, base_url: str, path: str, payload: dict, api_key: str | None):
    headers = {"authorization": f"Bearer {api_key}"} if api_key else {}
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.upstream_timeout_seconds) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}{path}", json=payload, headers=headers
            )
    except httpx.HTTPError as exc:
        raise UpstreamError(provider, 502, f"{provider.upper()} 暂时无法连接") from exc
    latency = round((time.perf_counter() - start) * 1000, 2)
    if response.status_code >= 400:
        raise UpstreamError(
            provider,
            response.status_code,
            _message_from_response(provider, response),
        )
    result = response.json()
    result["latency_ms"] = float(response.headers.get("X-CLM-Latency-Ms", latency))
    result["provider"] = provider
    return result


async def _post_jev(path: str, payload: dict, api_key: str | None):
    try:
        return await _post("jev", settings.jev_base_url, path, payload, api_key)
    except UpstreamError as exc:
        fallback = settings.jev_fallback_base_url
        should_fallback = exc.status in {451, 502, 503, 504}
        if not fallback or not should_fallback:
            raise
        result = await _post("jev", fallback, path, payload, api_key)
        result["route"] = "fallback"
        return result


async def decide(provider: str, payload: dict[str, Any], jev_api_key: str | None = None):
    if provider == "clm":
        payload["model"] = payload.get("model") or "clm-latest"
        return await _post(
            "clm",
            settings.clm_base_url,
            "/v1/systemone",
            payload,
            settings.clm_api_key,
        )
    payload["model"] = payload.get("model") or "jev-latest"
    return await _post_jev("/v1/systemone", payload, jev_api_key)


async def rank(provider: str, payload: dict[str, Any], jev_api_key: str | None = None):
    if provider == "clm":
        payload["model"] = payload.get("model") or "clm-latest"
        return await _post("clm", settings.clm_base_url, "/v1/rank", payload, settings.clm_api_key)
    answers = payload["answers"]
    keys = [f"candidate_{index + 1}" for index in range(len(answers))]
    response = await decide(
        "jev",
        {
            "state": payload["context"],
            "model": payload.get("model"),
            "temperature": payload["temperature"],
            "questions": {
                "ranking": {
                    "type": "choice",
                    "instructions": payload.get("question") or "选择最合适的候选项",
                    "criteria": dict(zip(keys, answers, strict=True)),
                }
            },
        },
        jev_api_key,
    )
    probabilities = response["answers"]["ranking"]["probabilities"]
    rows = sorted(
        zip(answers, (probabilities[key] for key in keys), strict=True),
        key=lambda item: item[1],
        reverse=True,
    )
    return {
        "model": response.get("model", "jev-latest"),
        "ranked": [
            {"rank": index, "candidate": candidate, "prob": probability}
            for index, (candidate, probability) in enumerate(rows, 1)
        ],
        "latency_ms": response.get("latency_ms"),
        "provider": "jev",
    }


async def compare(payload: dict[str, Any], jev_api_key: str):
    common = {key: payload[key] for key in ("state", "questions", "temperature")}
    results = await asyncio.gather(
        decide("clm", dict(common)),
        decide("jev", dict(common), jev_api_key),
        return_exceptions=True,
    )
    output = {}
    for name, result in zip(("clm", "jev"), results, strict=True):
        if isinstance(result, Exception):
            if isinstance(result, UpstreamError):
                output[name] = {"ok": False, "error": result.message, "status": result.status}
            else:
                output[name] = {"ok": False, "error": "未知错误", "status": 500}
        else:
            output[name] = {"ok": True, "data": result}
    return output


async def health():
    async def check(name, base_url, api_key=None):
        headers = {"authorization": f"Bearer {api_key}"} if api_key else {}
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{base_url.rstrip('/')}/health", headers=headers)
            return {"provider": name, "available": response.status_code < 500}
        except httpx.HTTPError:
            return {"provider": name, "available": False}

    clm = await check("clm", settings.clm_base_url, settings.clm_api_key)
    jev_fallback = None
    if settings.jev_fallback_base_url:
        jev_fallback = await check("jev_fallback", settings.jev_fallback_base_url)
    return {"ok": True, "clm": clm, "jev_fallback": jev_fallback}
