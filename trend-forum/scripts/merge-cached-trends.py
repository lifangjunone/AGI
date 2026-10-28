#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: merge-cached-trends.py PREVIOUS CURRENT")

    previous_path = Path(sys.argv[1])
    current_path = Path(sys.argv[2])
    previous = read_json(previous_path, {})
    current = read_json(current_path, {})

    previous_boards = {
        board.get("label") or board.get("key"): board
        for board in previous.get("boards", [])
        if (board.get("label") or board.get("key")) and board.get("items")
    }
    current_boards = {
        board.get("label") or board.get("key"): board
        for board in current.get("boards", [])
        if (board.get("label") or board.get("key")) and board.get("items")
    }

    ordered_keys = []
    for payload in (current, previous):
        for board in payload.get("boards", []):
            key = board.get("label") or board.get("key")
            if key and key not in ordered_keys:
                ordered_keys.append(key)

    cached_keys = [key for key in ordered_keys if key not in current_boards and key in previous_boards]
    current["boards"] = [
        current_boards.get(key) or previous_boards[key]
        for key in ordered_keys
        if key in current_boards or key in previous_boards
    ]

    previous_status = {
        row.get("source"): row
        for row in previous.get("sourceStatus", [])
        if row.get("source")
    }
    merged_status = []
    for row in current.get("sourceStatus", []):
        source = row.get("source")
        old = previous_status.get(source, {})
        if row.get("status") == "error" and old.get("status") in {"ok", "cached"}:
            row = {
                **row,
                "status": "cached",
                "detail": "本轮采集失败，暂用上一轮有效数据",
            }
        merged_status.append(row)
    current["sourceStatus"] = merged_status

    current["cacheFallback"] = {
        "used": bool(cached_keys),
        "boardCount": len(cached_keys),
        "boardLabels": cached_keys,
    }

    with current_path.open("w", encoding="utf-8") as handle:
        json.dump(current, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(json.dumps({
        "freshBoards": len(current_boards),
        "cachedBoards": len(cached_keys),
        "publishedBoards": len(current["boards"]),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
