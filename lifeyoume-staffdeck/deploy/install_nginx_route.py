#!/usr/bin/env python3
"""Insert only the LifeYouMe AI Team locations into the latest shared config."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import shutil
import sys
import time


CONFIG = Path("/data/app/lifeyoume-platform/deploy/nginx-platform.conf")
FRAGMENT = Path("/tmp/nginx-ai-team.conf")
BACKUP_DIR = Path("/data/app/backups")
ROUTES_BEFORE = Path("/tmp/nginx-ai-team.routes.before")


def route_inventory(text: str) -> list[str]:
    return [
        line.strip()
        for line in text.splitlines()
        if re.search(r"\b(server_name|location)\b", line)
        and not line.lstrip().startswith("#")
    ]


def main() -> int:
    raw = CONFIG.read_bytes()
    initial_sha = hashlib.sha256(raw).hexdigest()
    inode = CONFIG.stat().st_ino
    text = raw.decode()
    routes = route_inventory(text)
    ROUTES_BEFORE.write_text("\n".join(routes) + "\n")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d%H%M%S")
    backup = BACKUP_DIR / f"nginx-platform.before-ai-team-{stamp}.conf"
    shutil.copy2(CONFIG, backup)

    fragment = FRAGMENT.read_text()
    if "location /ai-team/" in text:
        print("The /ai-team route already exists; refusing an ambiguous duplicate.", file=sys.stderr)
        return 2

    anchor = "    location /api/pay-skills/ {"
    position = text.find(anchor)
    if position < 0:
        print("The main HTTPS insertion anchor was not found.", file=sys.stderr)
        return 3

    if hashlib.sha256(CONFIG.read_bytes()).hexdigest() != initial_sha or CONFIG.stat().st_ino != inode:
        print("The shared config changed concurrently before editing.", file=sys.stderr)
        return 4

    updated = text[:position] + fragment + "\n" + text[position:]
    after_routes = route_inventory(updated)
    missing = [line for line in routes if line not in after_routes]
    if missing:
        print(f"Pre-existing routes would disappear: {missing!r}", file=sys.stderr)
        return 5

    # Preserve the bind-mounted file inode; never replace it with a renamed temp file.
    with CONFIG.open("r+", encoding="utf-8") as handle:
        handle.seek(0)
        handle.write(updated)
        handle.truncate()
        handle.flush()
        os.fsync(handle.fileno())

    if CONFIG.stat().st_ino != inode:
        shutil.copyfile(backup, CONFIG)
        print("The shared config inode changed unexpectedly; restored the backup.", file=sys.stderr)
        return 6

    final_sha = hashlib.sha256(CONFIG.read_bytes()).hexdigest()
    print(
        f"backup={backup} before_sha={initial_sha} after_sha={final_sha} "
        f"inode={inode} routes={len(routes)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
