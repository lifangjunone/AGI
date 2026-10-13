from __future__ import annotations

import hashlib
import math
import re
import time
from abc import ABC, abstractmethod
from typing import Any

import httpx


class ProviderError(RuntimeError):
    pass


class DecisionProvider(ABC):
    @abstractmethod
    async def health(self) -> dict[str, Any]: ...

    @abstractmethod
    async def models(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def decide(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    @abstractmethod
    async def rank(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class CLMProvider(DecisionProvider):
    def __init__(self, base_url: str, api_key: str | None = None, timeout: float = 120):
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.timeout = timeout

    async def _request(self, method: str, path: str, json: dict | None = None) -> httpx.Response:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method, f"{self.base_url}{path}", headers=self.headers, json=json
                )
            response.raise_for_status()
            return response
        except httpx.HTTPError as exc:
            raise ProviderError(f"CLM 服务调用失败: {exc}") from exc

    async def health(self) -> dict[str, Any]:
        return (await self._request("GET", "/health")).json()

    async def models(self) -> list[dict[str, Any]]:
        body = (await self._request("GET", "/v1/models")).json()
        return body.get("models", [])

    async def decide(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._request("POST", "/v1/systemone", payload)
        body = response.json()
        body["latency_ms"] = float(
            response.headers.get("X-CLM-Latency-Ms", body.get("latency_ms", 0))
        )
        return body

    async def rank(self, payload: dict[str, Any]) -> dict[str, Any]:
        return (await self._request("POST", "/v1/rank", payload)).json()


def _tokens(value: Any) -> set[str]:
    text = str(value).lower()
    words = re.findall(r"[\w\u4e00-\u9fff]+", text)
    chars = {text[i : i + 2] for i in range(max(0, len(text) - 1)) if not text[i].isspace()}
    return set(words) | chars


def _similarity(left: Any, right: Any) -> float:
    a, b = _tokens(left), _tokens(right)
    overlap = len(a & b) / math.sqrt(max(1, len(a) * len(b)))
    digest = hashlib.sha256(f"{left}\0{right}".encode()).digest()
    jitter = int.from_bytes(digest[:2], "big") / 65535 * 0.04
    return overlap + jitter


def _softmax(values: list[float], temperature: float) -> list[float]:
    scaled = [value / temperature * 8 for value in values]
    high = max(scaled)
    exps = [math.exp(value - high) for value in scaled]
    total = sum(exps)
    return [value / total for value in exps]


def _confidence(probabilities: list[float]) -> float:
    ordered = sorted(probabilities, reverse=True)
    return ordered[0] - sum(ordered[1:]) / len(ordered[1:])


class MockProvider(DecisionProvider):
    """Deterministic lexical provider for UI/tests; never presented as model quality."""

    async def health(self) -> dict[str, Any]:
        return {"ok": True, "embedder": True, "models": ["mock-lexical"], "mock": True}

    async def models(self) -> list[dict[str, Any]]:
        return [
            {
                "name": "mock-lexical",
                "description": "仅用于联调的确定性词法基线，不代表 CLM 效果",
                "release_date": "2026-09-30",
            }
        ]

    async def decide(self, payload: dict[str, Any]) -> dict[str, Any]:
        start = time.perf_counter()
        state = payload["state"]
        answers: dict[str, Any] = {}
        for question_id, question in payload["questions"].items():
            kind = question["type"]
            instructions = question["instructions"]
            criteria = question.get("criteria")
            if kind == "noul":
                keys = ["false", "true"]
                candidates = [
                    (criteria or {}).get("false", f"否：{instructions}"),
                    (criteria or {}).get("true", f"是：{instructions}"),
                ]
            elif kind == "choice":
                keys = list(criteria)
                candidates = [criteria[key] or key for key in keys]
            else:
                keys = [str(index) for index in range(len(criteria))]
                candidates = criteria
            probs = _softmax(
                [_similarity(f"{state} {instructions}", candidate) for candidate in candidates],
                payload.get("temperature", 1),
            )
            distribution = dict(zip(keys, probs, strict=True))
            if kind == "noul":
                answers[question_id] = {"type": kind, "noul": distribution["true"]}
            elif kind == "choice":
                winner = max(distribution, key=distribution.get)
                answers[question_id] = {
                    "type": kind,
                    "choice": winner,
                    "confidence": _confidence(probs),
                    "probabilities": distribution,
                }
            else:
                answers[question_id] = {
                    "type": kind,
                    "score": sum(index * p for index, p in enumerate(probs)),
                    "confidence": _confidence(probs),
                    "probabilities": distribution,
                    "legend": dict(zip(keys, criteria, strict=True)),
                }
        return {
            "model": "mock-lexical",
            "answers": answers,
            "usage": {"billing_units": len(answers), "input_tokens": 0, "output_tokens": 0},
            "latency_ms": round((time.perf_counter() - start) * 1000, 2),
            "mock": True,
        }

    async def rank(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = f"{payload['context']} {payload.get('question', '')}"
        probs = _softmax(
            [_similarity(query, answer) for answer in payload["answers"]],
            payload.get("temperature", 1),
        )
        rows = sorted(
            zip(payload["answers"], probs, strict=True),
            key=lambda row: row[1],
            reverse=True,
        )
        return {
            "model": "mock-lexical",
            "ranked": [
                {"rank": index, "candidate": candidate, "prob": probability}
                for index, (candidate, probability) in enumerate(rows, 1)
            ],
            "mock": True,
        }
