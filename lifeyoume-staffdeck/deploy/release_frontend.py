#!/usr/bin/env python3
"""Safely release only the StaffDeck frontend static bundle.

The release is append-only for hashed assets and switches ``index.html``
atomically. It never edits Nginx and never restarts StaffDeck services.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Callable, Sequence
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

from release_staffdeck import (
    DEFAULT_PUBLIC_HEALTH,
    DEFAULT_REGRESSION_URLS,
    SERVICES,
    CommandRunner,
    ReleaseError,
)


DEFAULT_ROOT = Path("/data/app/lifeyoume-staffdeck")
DIST_RELATIVE = Path("current/usr/lib/staffdeck/_internal/frontend-enterprise/dist")
PUBLIC_BASE = "/ai-team/"
LOCAL_URL_PATTERN = re.compile(r'\b(?:src|href)="(/[^\"]+)"')


def utc_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def http_probe(url: str, timeout: float) -> None:
    request = Request(url, headers={"User-Agent": "StaffDeck-frontend-release/1.0"})
    with urlopen(request, timeout=timeout) as response:
        if not 200 <= response.status < 400:
            raise ReleaseError(f"HTTP {response.status} from {url}")
        response.read(64 * 1024)


def public_asset_probe(url: str, timeout: float, expected_type: str | None) -> None:
    request = Request(url, headers={"User-Agent": "StaffDeck-frontend-release/1.0"})
    with urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise ReleaseError(f"HTTP {response.status} from frontend resource {url}")
        content_type = response.headers.get_content_type()
        if expected_type == "javascript" and content_type not in {
            "application/javascript",
            "text/javascript",
        }:
            raise ReleaseError(
                f"Expected JavaScript MIME from {url}, got {content_type}"
            )
        if expected_type == "css" and content_type != "text/css":
            raise ReleaseError(f"Expected CSS MIME from {url}, got {content_type}")
        response.read(1)


def expected_resource_type(url: str) -> str | None:
    path = urlsplit(url).path.lower()
    if path.endswith((".js", ".mjs")):
        return "javascript"
    if path.endswith(".css"):
        return "css"
    return None


@dataclass(frozen=True)
class FrontendPaths:
    dist: Path
    releases: Path
    backups: Path
    candidate: Path
    backup: Path


class FrontendRelease:
    def __init__(
        self,
        *,
        source: Path,
        root: Path = DEFAULT_ROOT,
        stamp: str | None = None,
        public_health: str = DEFAULT_PUBLIC_HEALTH,
        regression_urls: Sequence[str] = DEFAULT_REGRESSION_URLS,
        timeout: float = 20,
        runner: CommandRunner | None = None,
        probe: Callable[[str, float], None] = http_probe,
        asset_probe: Callable[[str, float, str | None], None] = public_asset_probe,
        public_origin: str | None = None,
        require_root: bool = True,
    ):
        self.source = source.resolve()
        self.root = root.resolve()
        self.stamp = stamp or utc_stamp()
        self.public_health = public_health
        self.regression_urls = tuple(dict.fromkeys(regression_urls))
        self.timeout = timeout
        self.runner = runner or CommandRunner()
        self.probe = probe
        self.asset_probe = asset_probe
        parsed_health = urlsplit(public_health)
        self.public_origin = (
            public_origin.rstrip("/")
            if public_origin
            else f"{parsed_health.scheme}://{parsed_health.netloc}"
        )
        self.require_root = require_root
        releases = self.root / "releases"
        backups = self.root / "backups"
        self.paths = FrontendPaths(
            dist=self.root / DIST_RELATIVE,
            releases=releases,
            backups=backups,
            candidate=releases / f"frontend-{self.stamp}",
            backup=backups / f"frontend-index-{self.stamp}",
        )
        self.switched = False

    @property
    def source_index(self) -> Path:
        return self.source / "index.html"

    @property
    def source_assets(self) -> Path:
        return self.source / "assets"

    def validate_bundle(self, root: Path) -> list[str]:
        index = root / "index.html"
        if not index.is_file():
            raise ReleaseError(f"Frontend index is missing: {index}")
        if not (root / "assets").is_dir():
            raise ReleaseError(f"Frontend assets directory is missing: {root / 'assets'}")
        text = index.read_text(encoding="utf-8")
        local_urls = LOCAL_URL_PATTERN.findall(text)
        if not local_urls:
            raise ReleaseError("Frontend index does not reference any local resources")
        invalid = [url for url in local_urls if not url.startswith(PUBLIC_BASE)]
        if invalid:
            raise ReleaseError(
                "Frontend local URLs must use /ai-team/: " + ", ".join(invalid)
            )
        missing = []
        for url in local_urls:
            relative = url.removeprefix(PUBLIC_BASE).split("?", 1)[0].split("#", 1)[0]
            if not (root / relative).is_file():
                missing.append(url)
        if missing:
            raise ReleaseError(
                "Frontend index references missing files: " + ", ".join(missing)
            )
        if not any(url.startswith("/ai-team/assets/") for url in local_urls):
            raise ReleaseError("Frontend index does not reference /ai-team/assets/")
        return local_urls

    def preflight(self) -> None:
        if self.require_root and os.geteuid() != 0:
            raise ReleaseError("Run this tool as root (for example: sudo ...)")
        if self.root == Path("/") or len(self.root.parts) < 4:
            raise ReleaseError(f"Refusing unsafe deployment root: {self.root}")
        self.validate_bundle(self.source)
        if not self.paths.dist.is_dir() or self.paths.dist.is_symlink():
            raise ReleaseError("Production frontend dist must be a real directory")
        if not (self.paths.dist / "index.html").is_file():
            raise ReleaseError("Production frontend index is missing")
        for path in (self.paths.candidate, self.paths.backup):
            if path.exists():
                raise ReleaseError(f"Release target already exists: {path}")
        self.runner.run("systemctl", "is-active", *SERVICES)
        self._probe_all()
        self._probe_public_resources(self.paths.dist)

    def stage(self) -> dict[str, str]:
        self.paths.releases.mkdir(parents=True, exist_ok=True)
        self.paths.backups.mkdir(parents=True, exist_ok=True)
        shutil.copytree(self.source, self.paths.candidate)
        local_urls = self.validate_bundle(self.paths.candidate)
        self.paths.backup.mkdir(mode=0o750)
        shutil.copy2(self.paths.dist / "index.html", self.paths.backup / "index.html")
        manifest = {
            "created_at": datetime.now(UTC).isoformat(),
            "source": str(self.source),
            "index_sha256": sha256_file(self.paths.candidate / "index.html"),
            "local_urls": local_urls,
            "rollback_index": str(self.paths.backup / "index.html"),
        }
        (self.paths.candidate / "FRONTEND_RELEASE.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return manifest

    def append_assets(self) -> None:
        production_assets = self.paths.dist / "assets"
        sources = sorted(
            (self.paths.candidate / "assets").iterdir(),
            key=lambda path: path.name,
        )
        for source in sources:
            target = production_assets / source.name
            if target.exists():
                if not target.is_file() or sha256_file(target) != sha256_file(source):
                    raise ReleaseError(
                        f"Existing production asset differs from candidate: {target}"
                    )
        for source in sources:
            target = production_assets / source.name
            if target.exists():
                continue
            shutil.copy2(source, target)

    def switch(self) -> None:
        candidate_index = self.paths.candidate / "index.html"
        temporary_index = self.paths.dist / f".index.{self.stamp}.tmp"
        shutil.copy2(candidate_index, temporary_index)
        os.replace(temporary_index, self.paths.dist / "index.html")
        self.switched = True

    def verify(self) -> None:
        expected = sha256_file(self.paths.candidate / "index.html")
        actual = sha256_file(self.paths.dist / "index.html")
        if expected != actual:
            raise ReleaseError("Production index hash differs from candidate")
        self.runner.run("systemctl", "is-active", *SERVICES)
        self._probe_all()
        self._probe_public_resources(self.paths.candidate)

    def rollback(self) -> None:
        rollback_index = self.paths.backup / "index.html"
        temporary_index = self.paths.dist / f".index.{self.stamp}.rollback"
        shutil.copy2(rollback_index, temporary_index)
        os.replace(temporary_index, self.paths.dist / "index.html")
        self.switched = False

    def deploy(self) -> dict[str, str]:
        self.preflight()
        manifest = self.stage()
        self.append_assets()
        try:
            # Hashed assets are append-only and safe to expose before the
            # entrypoint references them. Verify every candidate resource
            # through the real public edge before switching index.html.
            self._probe_public_resources(self.paths.candidate)
            self.switch()
            self.verify()
        except BaseException as release_error:
            entrypoint_switched = self.switched
            try:
                if entrypoint_switched:
                    self.rollback()
                self.runner.run("systemctl", "is-active", *SERVICES)
                self._probe_all()
                self._probe_public_resources(self.paths.dist)
            except BaseException as rollback_error:
                raise ReleaseError(
                    f"Frontend release failed ({release_error}); rollback also failed "
                    f"({rollback_error}). Manual recovery is required."
                ) from rollback_error
            raise ReleaseError(
                (
                    f"Frontend release failed and index.html was restored: {release_error}"
                    if entrypoint_switched
                    else f"Frontend release failed before index.html switch: {release_error}"
                )
            ) from release_error
        return {
            "status": "released",
            "index_sha256": manifest["index_sha256"],
            "current": str(self.paths.dist),
            "candidate": str(self.paths.candidate),
            "rollback_index": str(self.paths.backup / "index.html"),
        }

    def cleanup_incomplete_stage(self) -> None:
        # A backup means staging completed. Preserve both the complete candidate
        # and rollback evidence after any later failure.
        if (
            not self.switched
            and not self.paths.backup.exists()
            and self.paths.candidate.is_dir()
        ):
            shutil.rmtree(self.paths.candidate)
        for suffix in ("tmp", "rollback"):
            temporary = self.paths.dist / f".index.{self.stamp}.{suffix}"
            temporary.unlink(missing_ok=True)

    def _probe_all(self) -> None:
        self._probe(self.public_health)
        for url in self.regression_urls:
            self._probe(url)

    def _probe(self, url: str) -> None:
        try:
            self.probe(url, self.timeout)
        except Exception as error:
            raise ReleaseError(f"Health probe failed for {url}: {error}") from error

    def _probe_public_resources(self, root: Path) -> None:
        local_urls = self.validate_bundle(root)
        for local_url in local_urls:
            public_url = urljoin(f"{self.public_origin}/", local_url.lstrip("/"))
            try:
                self.asset_probe(
                    public_url,
                    self.timeout,
                    expected_resource_type(local_url),
                )
            except Exception as error:
                raise ReleaseError(
                    f"Public frontend resource probe failed for {public_url}: {error}"
                ) from error


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--source-dist", required=True, type=Path)
    result.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    result.add_argument("--stamp")
    result.add_argument("--public-health", default=DEFAULT_PUBLIC_HEALTH)
    result.add_argument(
        "--public-origin",
        help="Public scheme and host for frontend resource probes; defaults to public health origin.",
    )
    result.add_argument(
        "--regression-url",
        action="append",
        dest="regression_urls",
        help="Override the default regression URL set; repeatable.",
    )
    result.add_argument("--timeout", type=float, default=20)
    result.add_argument("--check-only", action="store_true")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.timeout <= 0:
        parser().error("--timeout must be positive")
    release = FrontendRelease(
        source=args.source_dist,
        root=args.root,
        stamp=args.stamp,
        public_health=args.public_health,
        regression_urls=(
            args.regression_urls
            if args.regression_urls is not None
            else DEFAULT_REGRESSION_URLS
        ),
        timeout=args.timeout,
        public_origin=args.public_origin,
    )
    try:
        if args.check_only:
            release.preflight()
            result = {"status": "ready", "source": str(release.source)}
        else:
            result = release.deploy()
    except (ReleaseError, OSError, subprocess.CalledProcessError) as error:
        release.cleanup_incomplete_stage()
        print(f"frontend release failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
