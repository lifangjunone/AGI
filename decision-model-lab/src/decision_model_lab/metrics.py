from __future__ import annotations

import math
from collections import defaultdict
from typing import Any


def probabilities(answer: dict[str, Any]) -> dict[str, float]:
    if answer["type"] == "noul":
        return {"false": 1 - float(answer["noul"]), "true": float(answer["noul"])}
    return {key: float(value) for key, value in answer["probabilities"].items()}


def calibration_metrics(
    rows: list[dict[str, Any]], bins: int = 10
) -> dict[str, Any]:
    """Multiclass top-label ECE plus proper scoring rules."""
    if not rows:
        raise ValueError("至少需要一条评测结果")

    correct = 0
    nll = 0.0
    brier = 0.0
    buckets: dict[int, list[tuple[float, int]]] = defaultdict(list)

    for row in rows:
        dist = row["probabilities"]
        label = row["label"]
        prediction = max(dist, key=dist.get)
        confidence = dist[prediction]
        hit = int(prediction == label)
        correct += hit
        nll -= math.log(max(dist.get(label, 0.0), 1e-12))
        brier += sum((prob - int(key == label)) ** 2 for key, prob in dist.items())
        bucket = min(bins - 1, int(confidence * bins))
        buckets[bucket].append((confidence, hit))

    calibration = []
    ece = 0.0
    total = len(rows)
    for index in range(bins):
        values = buckets[index]
        if values:
            avg_confidence = sum(value[0] for value in values) / len(values)
            accuracy = sum(value[1] for value in values) / len(values)
            gap = abs(avg_confidence - accuracy)
            ece += len(values) / total * gap
        else:
            avg_confidence = accuracy = gap = 0.0
        calibration.append(
            {
                "lower": index / bins,
                "upper": (index + 1) / bins,
                "count": len(values),
                "confidence": avg_confidence,
                "accuracy": accuracy,
                "gap": gap,
            }
        )

    return {
        "count": total,
        "accuracy": correct / total,
        "ece": ece,
        "nll": nll / total,
        "brier": brier / total,
        "bins": calibration,
    }
