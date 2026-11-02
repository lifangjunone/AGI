#!/usr/bin/env python3
"""Bridge Technology Exploration reports into a pinned Horizon pipeline."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo


SHANGHAI = ZoneInfo("Asia/Shanghai")
HORIZON_COMMIT = "cdd95f8e881673057e3e201717836da4b8e2e0e7"
CANDIDATE_LIMIT = 60
SELECTED_LIMIT = 12
MIN_SELECTED = 4
EDITION_LIMIT = 28
EDITION_DAYS = 7
SOURCE_LIMIT = 10
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "mc_cid", "mc_eid", "ref"}


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.new")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temporary, path)


def parse_datetime(value: Any, fallback: datetime | None = None) -> datetime:
    if value:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    return fallback or datetime.now(timezone.utc)


def normalize_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text.startswith(("http://", "https://")):
        return ""
    try:
        parts = urlsplit(text)
        query = [
            (key, item)
            for key, item in parse_qsl(parts.query, keep_blank_values=True)
            if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS
        ]
        return urlunsplit(
            (
                parts.scheme.lower(),
                parts.netloc.lower(),
                parts.path.rstrip("/") or "/",
                urlencode(query),
                "",
            )
        )
    except ValueError:
        return ""


def normalize_title(value: Any) -> str:
    return re.sub(r"[^a-z0-9\u3400-\u9fff]+", "", str(value or "").casefold())


def stable_id(*parts: Any) -> str:
    digest = hashlib.sha256("\x1f".join(str(part) for part in parts).encode()).hexdigest()
    return digest[:20]


def edition_id(moment: datetime | None = None) -> str:
    local = (moment or datetime.now(timezone.utc)).astimezone(SHANGHAI)
    slot = (local.hour // 6) * 6
    return f"{local:%Y-%m-%d}T{slot:02d}"


def infer_profile(item: dict[str, Any]) -> str:
    source = str(item.get("source") or "")
    title = str(item.get("title") or "")
    text = f"{source} {title}".casefold()
    blog_markers = ("blog", "博客", "教程", "复盘", "实践", "deep dive", "guide")
    return "tech-blog" if any(marker in text for marker in blog_markers) else "tech-news"


def external_item_dict(
    item: dict[str, Any],
    *,
    board: str,
    priority: str,
    fallback_time: datetime,
) -> dict[str, Any] | None:
    url = normalize_url(item.get("url"))
    title = str(item.get("title") or "").strip()
    if not url or not title:
        return None
    source = str(item.get("source") or board or "Technology Exploration").strip()
    return {
        "id": f"technology:{stable_id(source, title, url)}",
        "source_type": "rss",
        "title": title[:300],
        "url": url,
        "content": str(item.get("summary") or item.get("evidence") or "")[:12000],
        "author": source,
        "published_at": parse_datetime(
            item.get("published_at") or item.get("publishedAt"), fallback_time
        ).isoformat(),
        "profile": infer_profile(item),
        "metadata": {
            "origin": "technology-exploration",
            "platform": source,
            "board": board,
            "priority": priority,
            "engagement": float(item.get("engagement") or 0),
            "platform_score": float(item.get("score") or 0),
            "evidence": str(item.get("evidence") or "")[:500],
            "topic_ids": item.get("topic_ids") or item.get("topics") or [],
        },
    }


def technology_candidates(report: dict[str, Any]) -> list[dict[str, Any]]:
    fallback_time = parse_datetime(report.get("generated_at"))
    buckets: list[tuple[str, list[dict[str, Any]], str]] = []
    board_top = [
        {**board["items"][0], "_board": board.get("label") or board.get("key") or "榜单"}
        for board in report.get("news_boards", [])
        if board.get("items")
    ]
    signal_evidence = [
        {**item, "_board": "关键信号"}
        for signal in report.get("signals", [])
        for item in (signal.get("evidence") or [])[:1]
    ]
    buckets.append(("board-top", board_top, "board-top"))
    buckets.append(("signals", signal_evidence, "signal"))
    buckets.append(("highlights", report.get("items", []), "highlight"))
    buckets.extend(
        (
            str(board.get("label") or "来源榜单"),
            board.get("items", [])[1:],
            "board-extra",
        )
        for board in report.get("news_boards", [])
    )

    results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    source_counts: Counter[str] = Counter()
    for board, rows, priority in buckets:
        for row in rows:
            candidate = external_item_dict(
                row,
                board=str(row.get("_board") or board),
                priority=priority,
                fallback_time=fallback_time,
            )
            if not candidate:
                continue
            url_key = normalize_url(candidate["url"])
            title_key = normalize_title(candidate["title"])
            source = candidate["metadata"]["platform"]
            if url_key in seen_urls or title_key in seen_titles:
                continue
            if priority not in {"board-top", "signal"} and source_counts[source] >= SOURCE_LIMIT:
                continue
            seen_urls.add(url_key)
            seen_titles.add(title_key)
            source_counts[source] += 1
            results.append(candidate)
            if len(results) >= CANDIDATE_LIMIT:
                return results
    return results


def merge_candidates(
    technology: list[dict[str, Any]],
    horizon_items: list[Any],
) -> list[Any]:
    """Add Horizon-native items without allowing one source to dominate."""
    from src.models import ContentItem

    merged = [ContentItem.model_validate(item) for item in technology]
    seen_urls = {normalize_url(item.url) for item in merged}
    seen_titles = {normalize_title(item.title) for item in merged}
    source_counts: Counter[str] = Counter()
    for item in horizon_items:
        platform = (
            item.metadata.get("feed_name")
            or item.metadata.get("domain")
            or item.source_type.value
        )
        if source_counts[platform] >= SOURCE_LIMIT:
            continue
        url_key = normalize_url(item.url)
        title_key = normalize_title(item.title)
        if not url_key or url_key in seen_urls or title_key in seen_titles:
            continue
        item.metadata["origin"] = "horizon-source"
        item.metadata["platform"] = platform
        item.metadata["board"] = item.metadata.get("category") or "扩展来源"
        item.metadata["priority"] = "extended"
        merged.append(item)
        seen_urls.add(url_key)
        seen_titles.add(title_key)
        source_counts[platform] += 1
        if len(merged) >= CANDIDATE_LIMIT:
            break
    return merged[:CANDIDATE_LIMIT]


def public_item(item: Any) -> dict[str, Any]:
    processing = item.processing
    analysis = processing.analysis if processing else None
    artifact = (processing.artifacts or {}).get("zh") if processing else None
    blocks = []
    citations: dict[str, dict[str, str]] = {}
    if artifact:
        blocks = [
            {
                "id": block.id,
                "title": block.title,
                "content": block.content,
                "primary": block.primary,
                "sourceRefs": block.source_refs,
            }
            for block in artifact.blocks
        ]
        citations = {
            source.id: {"id": source.id, "title": source.title, "url": str(source.url)}
            for source in artifact.sources
        }
    metadata = dict(item.metadata)
    platform = metadata.get("platform") or metadata.get("feed_name") or item.source_type.value
    item_id = stable_id(item.id, item.url)
    return {
        "id": item_id,
        "title": artifact.title if artifact else item.title,
        "originalTitle": item.title,
        "url": str(item.url),
        "platform": platform,
        "profile": processing.classification.profile if processing else item.profile,
        "score": analysis.score if analysis else None,
        "reason": analysis.reason if analysis else "",
        "tags": analysis.tags if analysis else [],
        "summary": analysis.summary if analysis else (item.content or "")[:500],
        "blocks": blocks,
        "citations": list(citations.values()),
        "publishedAt": item.published_at.isoformat(),
        "metadata": {
            "origin": metadata.get("origin"),
            "board": metadata.get("board"),
            "engagement": metadata.get("engagement", 0),
            "platformScore": metadata.get("platform_score", 0),
            "evidence": metadata.get("evidence", ""),
        },
    }


def merge_editions(
    previous: dict[str, Any],
    current_id: str,
    generated_at: str,
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    current = {
        "id": current_id,
        "generatedAt": generated_at,
        "itemIds": [item["id"] for item in items],
    }
    editions = [current] + [
        edition for edition in previous.get("editions", []) if edition.get("id") != current_id
    ]
    cutoff = datetime.now(timezone.utc) - timedelta(days=EDITION_DAYS)
    return [
        edition
        for edition in editions
        if parse_datetime(edition.get("generatedAt"), cutoff) >= cutoff
    ][:EDITION_LIMIT]


def merge_items(
    previous: dict[str, Any],
    editions: list[dict[str, Any]],
    current_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Keep details referenced by retained editions, preferring the newest copy."""
    retained_ids = {
        item_id
        for edition in editions
        for item_id in edition.get("itemIds", [])
        if item_id
    }
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in current_items + list(previous.get("items", [])):
        item_id = item.get("id")
        if not item_id or item_id in seen or item_id not in retained_ids:
            continue
        merged.append(item)
        seen.add(item_id)
    return merged


def mark_stale(path: Path, reason: str) -> int:
    payload = read_json(path, {})
    if not payload:
        payload = {
            "currentEditionId": None,
            "generatedAt": None,
            "status": "stale",
            "run": {},
            "editions": [],
            "items": [],
        }
    payload["status"] = "stale"
    payload["staleReason"] = reason[:300]
    payload["checkedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(path, payload)
    return 0


async def run_pipeline(args: argparse.Namespace) -> int:
    horizon_path = Path(args.horizon_path).resolve()
    sys.path.insert(0, str(horizon_path))

    from src.ai.summarizer import DailySummarizer
    from src.models import Config
    from src.orchestrator import HorizonOrchestrator
    from src.processing import ProfileRegistry
    from src.storage.manager import StorageManager

    report = read_json(Path(args.report), {})
    if not report.get("news_boards"):
        raise RuntimeError("Technology Exploration report has no news_boards")

    config_payload = read_json(Path(args.config), {})
    config_payload["processing"]["profiles_dir"] = str(horizon_path / "profiles")
    config_payload["digest"]["max_items"] = SELECTED_LIMIT
    config = Config.model_validate(config_payload)
    profiles = ProfileRegistry.load(
        Path(config.processing.profiles_dir), config.processing.default_profile
    )
    storage = StorageManager(data_dir=args.state_dir, config_path=args.config)
    orchestrator = HorizonOrchestrator(config, storage, profiles=profiles)
    ai_client = orchestrator.ai_client
    if hasattr(ai_client, "client") and hasattr(ai_client.client, "with_options"):
        ai_client.client = ai_client.client.with_options(timeout=60.0, max_retries=2)
    try:
        await ai_client.complete(
            "Return valid JSON only.",
            'Health check. Return exactly {"ok": true}.',
            max_tokens=32,
        )
    except Exception as exc:
        raise RuntimeError(f"MaaS preflight failed: {type(exc).__name__}: {exc}") from exc

    since = datetime.now(timezone.utc) - timedelta(hours=12)
    native_items = await orchestrator.fetch_all_sources(since)
    fetch_report = orchestrator.last_fetch_report
    candidates = merge_candidates(technology_candidates(report), native_items)
    if not candidates:
        raise RuntimeError("No valid candidates available")

    analyzed = await orchestrator.analyze_items(candidates)
    filtered = await orchestrator.select_digest_items(analyzed)
    selected = filtered.items[:SELECTED_LIMIT]
    if len(selected) < MIN_SELECTED:
        raise RuntimeError(
            f"Only {len(selected)} items passed Horizon selection; minimum is {MIN_SELECTED}"
        )

    enrichment = await orchestrator.enrich_items(selected)
    if enrichment.status == "failure":
        raise RuntimeError("Horizon enrichment failed for every selected item")
    successful_ids = {
        item.id
        for item in selected
        if item.processing and item.processing.artifacts.get("zh")
    }
    selected = [item for item in selected if item.id in successful_ids]
    if len(selected) < MIN_SELECTED:
        raise RuntimeError(
            f"Only {len(selected)} enriched items are publishable; minimum is {MIN_SELECTED}"
        )

    now = datetime.now(timezone.utc)
    current_id = edition_id(now)
    output_path = Path(args.output)
    previous = read_json(output_path, {})
    current_items = [public_item(item) for item in selected]
    editions = merge_editions(previous, current_id, now.isoformat(), current_items)
    items = merge_items(previous, editions, current_items)
    source_status = fetch_report.to_dict() if fetch_report else {"status": "not_attempted"}
    payload = {
        "currentEditionId": current_id,
        "currentItemIds": [item["id"] for item in current_items],
        "generatedAt": now.isoformat(),
        "status": "fresh",
        "checkedAt": now.isoformat(),
        "run": {
            "horizonCommit": HORIZON_COMMIT,
            "model": config.ai.model,
            "windowHours": 12,
            "candidateCount": len(candidates),
            "selectedCount": len(current_items),
            "sourceStatus": source_status,
            "enrichmentStatus": enrichment.status,
        },
        "editions": editions,
        "items": items,
    }
    atomic_write_json(output_path, payload)

    summarizer = DailySummarizer(
        profile_names=profiles.names,
        profile_order=config.digest.profile_order,
    )
    summary = await summarizer.generate_summary(
        selected,
        now.astimezone(SHANGHAI).strftime("%Y-%m-%d"),
        len(candidates),
        language="zh",
    )
    archive = Path(args.state_dir) / "summaries" / f"horizon-{current_id}-zh.md"
    archive.parent.mkdir(parents=True, exist_ok=True)
    archive.write_text(summary, encoding="utf-8")
    print(
        json.dumps(
            {
                "edition": current_id,
                "candidates": len(candidates),
                "selected": len(current_items),
                "sourceStatus": source_status.get("status"),
                "output": str(output_path),
            },
            ensure_ascii=False,
        )
    )
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--report")
    result.add_argument("--output", required=True)
    result.add_argument("--config")
    result.add_argument("--horizon-path")
    result.add_argument("--state-dir")
    result.add_argument("--mark-stale", action="store_true")
    result.add_argument("--reason", default="Horizon pipeline failed")
    return result


def main() -> int:
    args = parser().parse_args()
    if args.mark_stale:
        return mark_stale(Path(args.output), args.reason)
    required = ("report", "config", "horizon_path", "state_dir")
    missing = [name for name in required if not getattr(args, name)]
    if missing:
        raise SystemExit(f"missing required arguments: {', '.join(missing)}")
    try:
        return asyncio.run(run_pipeline(args))
    except Exception as exc:
        print(f"Horizon bridge failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
