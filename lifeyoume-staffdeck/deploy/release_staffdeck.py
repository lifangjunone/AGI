#!/usr/bin/env python3
"""Safely release a StaffDeck AppDir on the Tencent application host.

This tool never edits or reloads the shared Aliyun Nginx configuration.  It
stages a complete AppDir, creates an online SQLite backup, switches the
``current`` directory, explicitly restores the reverse tunnel, and rolls the
application directory back if any local or public release gate fails.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
from typing import Callable, Sequence
from urllib.request import Request, urlopen


DEFAULT_ROOT = Path("/data/app/lifeyoume-staffdeck")
MAIN_SERVICE = "lifeyoume-staffdeck.service"
SSO_SERVICE = "lifeyoume-staffdeck-sso.service"
TUNNEL_SERVICE = "lifeyoume-staffdeck-aliyun-tunnel.service"
SERVICES = (MAIN_SERVICE, SSO_SERVICE, TUNNEL_SERVICE)
DEFAULT_LOCAL_HEALTH = "http://127.0.0.1:45173/api/health"
DEFAULT_PUBLIC_HEALTH = "https://lifeyoume.icu/ai-team/api/health"
DEFAULT_REGRESSION_URLS = (
    "https://lifeyoume.icu/ai-team/",
    "https://lifeyoume.icu/ai-team/auth/login",
    "https://lifeyoume.icu/ai-team/auth/register",
    "https://lifeyoume.icu/flowframe/",
    "https://lifeyoume.icu/image/",
    "https://lifeyoume.icu/resume/",
    "https://lifeyoume.icu/vault/",
    "https://lifeyoume.icu/trends/",
    "https://meyou.lifeyoume.icu/",
    "https://audit.lifeyoume.icu/",
)


class ReleaseError(RuntimeError):
    """A release invariant or health gate failed."""


def utc_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sqlite_online_backup(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as source_db, sqlite3.connect(target) as target_db:
        source_db.backup(target_db)
    with sqlite3.connect(target) as backup_db:
        result = backup_db.execute("PRAGMA integrity_check").fetchone()
    if result is None or result[0] != "ok":
        target.unlink(missing_ok=True)
        raise ReleaseError(f"SQLite backup integrity check failed: {result!r}")
    os.chmod(target, 0o600)


def http_probe(url: str, timeout: float) -> None:
    request = Request(url, headers={"User-Agent": "StaffDeck-release/1.0"})
    with urlopen(request, timeout=timeout) as response:
        if not 200 <= response.status < 400:
            raise ReleaseError(f"HTTP {response.status} from {url}")
        response.read(64 * 1024)


class CommandRunner:
    def run(self, *command: str) -> None:
        subprocess.run(command, check=True)


@dataclass(frozen=True)
class ReleasePaths:
    root: Path
    current: Path
    releases: Path
    backups: Path
    database: Path
    staging: Path
    candidate: Path
    rollback: Path
    failed: Path
    database_backup: Path


class StaffDeckRelease:
    def __init__(
        self,
        *,
        source: Path,
        root: Path = DEFAULT_ROOT,
        stamp: str | None = None,
        local_health: str = DEFAULT_LOCAL_HEALTH,
        public_health: str = DEFAULT_PUBLIC_HEALTH,
        regression_urls: Sequence[str] = DEFAULT_REGRESSION_URLS,
        timeout: float = 20,
        attempts: int = 30,
        runner: CommandRunner | None = None,
        probe: Callable[[str, float], None] = http_probe,
        require_root: bool = True,
    ):
        self.source = source.resolve()
        self.root = root.resolve()
        self.stamp = stamp or utc_stamp()
        self.local_health = local_health
        self.public_health = public_health
        self.regression_urls = tuple(dict.fromkeys(regression_urls))
        self.timeout = timeout
        self.attempts = attempts
        self.runner = runner or CommandRunner()
        self.probe = probe
        self.require_root = require_root
        releases = self.root / "releases"
        backups = self.root / "backups"
        name = f"staffdeck-release-{self.stamp}"
        self.paths = ReleasePaths(
            root=self.root,
            current=self.root / "current",
            releases=releases,
            backups=backups,
            database=self.root / "data" / "skill_agent_loop.db",
            staging=releases / f".{name}.staging",
            candidate=releases / name,
            rollback=releases / f"staffdeck-before-{self.stamp}",
            failed=releases / f"staffdeck-failed-{self.stamp}",
            database_backup=backups / f"skill_agent_loop-{self.stamp}.db",
        )
        self.switched = False

    @property
    def source_binary(self) -> Path:
        return self.source / "usr/lib/staffdeck/staffdeck"

    @property
    def source_index(self) -> Path:
        return (
            self.source
            / "usr/lib/staffdeck/_internal/frontend-enterprise/dist/index.html"
        )

    def preflight(self) -> None:
        if self.require_root and os.geteuid() != 0:
            raise ReleaseError("Run this tool as root (for example: sudo ...)")
        if self.root == Path("/") or len(self.root.parts) < 4:
            raise ReleaseError(f"Refusing unsafe deployment root: {self.root}")
        if not self.source.is_dir() or not self.source_binary.is_file():
            raise ReleaseError(f"Source is not a complete StaffDeck AppDir: {self.source}")
        if not os.access(self.source_binary, os.X_OK):
            raise ReleaseError(f"Source binary is not executable: {self.source_binary}")
        if not self.source_index.is_file():
            raise ReleaseError(f"Source frontend index is missing: {self.source_index}")
        index = self.source_index.read_text(encoding="utf-8")
        if "/ai-team/" not in index:
            raise ReleaseError("Source frontend does not contain the /ai-team/ public base")
        if not self.paths.current.is_dir() or self.paths.current.is_symlink():
            raise ReleaseError("Production current path must be a real directory")
        if not self.paths.database.is_file():
            raise ReleaseError(f"Production database is missing: {self.paths.database}")
        for path in (
            self.paths.staging,
            self.paths.candidate,
            self.paths.rollback,
            self.paths.failed,
            self.paths.database_backup,
        ):
            if path.exists():
                raise ReleaseError(f"Release target already exists: {path}")
        self.paths.releases.mkdir(parents=True, exist_ok=True)
        self.paths.backups.mkdir(parents=True, exist_ok=True)
        self._services_active()
        self._probe_once(self.local_health)
        self._probe_once(self.public_health)
        for url in self.regression_urls:
            self._probe_once(url)

    def stage(self) -> str:
        shutil.copytree(self.source, self.paths.staging, symlinks=True)
        staged_binary = self.paths.staging / "usr/lib/staffdeck/staffdeck"
        source_hash = sha256_file(self.source_binary)
        staged_hash = sha256_file(staged_binary)
        if staged_hash != source_hash:
            raise ReleaseError("Staged binary hash does not match the source AppDir")
        self.paths.staging.rename(self.paths.candidate)
        sqlite_online_backup(self.paths.database, self.paths.database_backup)
        manifest = {
            "created_at": datetime.now(UTC).isoformat(),
            "source": str(self.source),
            "binary_sha256": source_hash,
            "database_backup": str(self.paths.database_backup),
            "rollback": str(self.paths.rollback),
        }
        (self.paths.candidate / "STAFFDECK_RELEASE.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return source_hash

    def switch(self) -> None:
        self.paths.current.rename(self.paths.rollback)
        try:
            self.paths.candidate.rename(self.paths.current)
        except BaseException:
            self.paths.rollback.rename(self.paths.current)
            raise
        self.switched = True

    def activate_and_verify(self) -> None:
        self.runner.run("systemctl", "restart", MAIN_SERVICE)
        # A prior stop/start release can leave the dependent tunnel inactive.
        self.runner.run("systemctl", "start", SSO_SERVICE, TUNNEL_SERVICE)
        self._probe_eventually(self.local_health)
        self._services_active()
        self._probe_eventually(self.public_health)
        for url in self.regression_urls:
            self._probe_once(url)

    def rollback(self) -> None:
        self.runner.run("systemctl", "stop", MAIN_SERVICE)
        if self.paths.failed.exists():
            raise ReleaseError(f"Rollback destination already exists: {self.paths.failed}")
        self.paths.current.rename(self.paths.failed)
        self.paths.rollback.rename(self.paths.current)
        self.runner.run("systemctl", "start", MAIN_SERVICE, SSO_SERVICE, TUNNEL_SERVICE)
        self._probe_eventually(self.local_health)
        self._services_active()
        self._probe_eventually(self.public_health)
        self.switched = False

    def deploy(self) -> dict[str, str]:
        self.preflight()
        binary_hash = self.stage()
        self.switch()
        try:
            self.activate_and_verify()
        except BaseException as release_error:
            try:
                self.rollback()
            except BaseException as rollback_error:
                raise ReleaseError(
                    f"Release failed ({release_error}); rollback also failed "
                    f"({rollback_error}). Manual recovery is required."
                ) from rollback_error
            raise ReleaseError(
                f"Release failed and the previous AppDir was restored: {release_error}"
            ) from release_error
        return {
            "status": "released",
            "binary_sha256": binary_hash,
            "database_backup": str(self.paths.database_backup),
            "rollback": str(self.paths.rollback),
            "current": str(self.paths.current),
        }

    def cleanup_incomplete_stage(self) -> None:
        if self.paths.staging.is_dir():
            shutil.rmtree(self.paths.staging)
        if not self.switched and self.paths.candidate.is_dir():
            shutil.rmtree(self.paths.candidate)

    def _services_active(self) -> None:
        self.runner.run("systemctl", "is-active", *SERVICES)

    def _probe_once(self, url: str) -> None:
        try:
            self.probe(url, self.timeout)
        except Exception as error:
            raise ReleaseError(f"Health probe failed for {url}: {error}") from error

    def _probe_eventually(self, url: str) -> None:
        last_error: Exception | None = None
        for attempt in range(self.attempts):
            try:
                self.probe(url, self.timeout)
                return
            except Exception as error:
                last_error = error
                if attempt + 1 < self.attempts:
                    time.sleep(1)
        raise ReleaseError(
            f"Health probe did not recover after {self.attempts} attempts: "
            f"{url}: {last_error}"
        )


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--source-appdir", required=True, type=Path)
    result.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    result.add_argument("--stamp")
    result.add_argument("--local-health", default=DEFAULT_LOCAL_HEALTH)
    result.add_argument("--public-health", default=DEFAULT_PUBLIC_HEALTH)
    result.add_argument(
        "--regression-url",
        action="append",
        dest="regression_urls",
        help="Override the default unrelated-product regression URL set; repeatable.",
    )
    result.add_argument("--timeout", type=float, default=20)
    result.add_argument("--attempts", type=int, default=30)
    result.add_argument(
        "--check-only",
        action="store_true",
        help="Run read-only preflight and health gates without staging or switching.",
    )
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.timeout <= 0 or args.attempts < 1:
        parser().error("--timeout and --attempts must be positive")
    release = StaffDeckRelease(
        source=args.source_appdir,
        root=args.root,
        stamp=args.stamp,
        local_health=args.local_health,
        public_health=args.public_health,
        regression_urls=(
            args.regression_urls
            if args.regression_urls is not None
            else DEFAULT_REGRESSION_URLS
        ),
        timeout=args.timeout,
        attempts=args.attempts,
    )
    try:
        if args.check_only:
            release.preflight()
            result = {
                "status": "ready",
                "source": str(release.source),
                "current": str(release.paths.current),
            }
        else:
            result = release.deploy()
    except (ReleaseError, OSError, subprocess.CalledProcessError) as error:
        release.cleanup_incomplete_stage()
        print(f"release failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
