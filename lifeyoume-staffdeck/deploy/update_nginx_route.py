#!/usr/bin/env python3
"""Update only the existing AI Team route block in the shared Nginx config."""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
import shutil
import sys
import time


CONFIG = Path("/data/app/lifeyoume-platform/deploy/nginx-platform.conf")
FRAGMENT = Path("/tmp/nginx-ai-team.conf")
BACKUP_DIR = Path("/data/app/backups")
START = "    location = /ai-team {\n"
END = "    location /api/pay-skills/ {\n"


def routes(text: str) -> list[str]:
    return [
        line.strip()
        for line in text.splitlines()
        if re.search(r"\b(server_name|location)\b", line)
        and not line.lstrip().startswith("#")
    ]


def main() -> int:
    before = CONFIG.read_bytes()
    before_sha = hashlib.sha256(before).hexdigest()
    before_inode = CONFIG.stat().st_ino
    text = before.decode()
    start = text.find(START)
    end = text.find(END, start)
    if start < 0 or end < 0:
        print("AI Team route boundaries were not found", file=sys.stderr)
        return 2

    fragment = FRAGMENT.read_text()
    required = (
        "location = /ai-team",
        "location = /ai-team/api/auth/sso/exchange",
        "location /ai-team/",
    )
    if any(value not in fragment for value in required):
        print("AI Team fragment is incomplete", file=sys.stderr)
        return 3

    before_routes = routes(text)
    updated = text[:start] + fragment.rstrip() + "\n\n" + text[end:]
    after_routes = routes(updated)
    unrelated_before = [
        line
        for line in before_routes
        if "/ai-team" not in line and "_lifeyoume_ai_team_" not in line
    ]
    unrelated_after = [
        line
        for line in after_routes
        if "/ai-team" not in line and "_lifeyoume_ai_team_" not in line
    ]
    if unrelated_before != unrelated_after:
        print("An unrelated route would change; refusing update", file=sys.stderr)
        return 4

    if (
        hashlib.sha256(CONFIG.read_bytes()).hexdigest() != before_sha
        or CONFIG.stat().st_ino != before_inode
    ):
        print("Shared config changed concurrently", file=sys.stderr)
        return 5

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d%H%M%S")
    backup = BACKUP_DIR / f"nginx-platform.before-ai-team-sso-{stamp}.conf"
    shutil.copy2(CONFIG, backup)

    with CONFIG.open("r+", encoding="utf-8") as handle:
        handle.seek(0)
        handle.write(updated)
        handle.truncate()
        handle.flush()

    if CONFIG.stat().st_ino != before_inode:
        shutil.copyfile(backup, CONFIG)
        print("Config inode changed; restored backup", file=sys.stderr)
        return 6
    print(
        f"backup={backup} inode={before_inode} "
        f"before_sha={before_sha} after_sha={hashlib.sha256(CONFIG.read_bytes()).hexdigest()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
