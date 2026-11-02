from __future__ import annotations

from pathlib import Path

import pytest

from release_frontend import FrontendRelease
from release_staffdeck import DEFAULT_PUBLIC_HEALTH, ReleaseError


class FakeRunner:
    def __init__(self):
        self.commands: list[tuple[str, ...]] = []

    def run(self, *command: str) -> None:
        self.commands.append(command)


def bundle(path: Path, marker: str, base: str = "/ai-team/") -> Path:
    assets = path / "assets"
    assets.mkdir(parents=True)
    (assets / f"index-{marker}.js").write_text(marker, encoding="utf-8")
    (assets / f"index-{marker}.css").write_text(marker, encoding="utf-8")
    (path / "favicon.ico").write_text("icon", encoding="utf-8")
    (path / "index.html").write_text(
        f'<script src="{base}assets/index-{marker}.js"></script>'
        f'<link href="{base}assets/index-{marker}.css">'
        f'<link href="{base}favicon.ico">',
        encoding="utf-8",
    )
    return path


def production_root(path: Path) -> Path:
    dist = path / "current/usr/lib/staffdeck/_internal/frontend-enterprise/dist"
    bundle(dist, "old")
    return path


def release(
    tmp_path: Path,
    probe,
    runner: FakeRunner | None = None,
    asset_probe=lambda *_: None,
) -> FrontendRelease:
    return FrontendRelease(
        source=bundle(tmp_path / "source", "new"),
        root=production_root(tmp_path / "production"),
        stamp="20260101T000000Z",
        regression_urls=("https://existing.example/",),
        runner=runner or FakeRunner(),
        probe=probe,
        asset_probe=asset_probe,
        public_origin="https://public.example",
        require_root=False,
    )


def test_rejects_root_relative_assets_before_mutating_production(tmp_path: Path):
    target = FrontendRelease(
        source=bundle(tmp_path / "source", "bad", base="/"),
        root=production_root(tmp_path / "production"),
        stamp="20260101T000000Z",
        regression_urls=(),
        runner=FakeRunner(),
        probe=lambda *_: None,
        asset_probe=lambda *_: None,
        public_origin="https://public.example",
        require_root=False,
    )

    with pytest.raises(ReleaseError, match="must use /ai-team/"):
        target.deploy()

    assert "old" in (target.paths.dist / "index.html").read_text()
    assert not target.paths.backup.exists()


def test_rejects_missing_referenced_asset(tmp_path: Path):
    target = release(tmp_path, lambda *_: None)
    (target.source / "assets/index-new.js").unlink()

    with pytest.raises(ReleaseError, match="missing files"):
        target.deploy()

    assert "old" in (target.paths.dist / "index.html").read_text()


def test_successful_release_appends_assets_and_switches_index_without_restart(tmp_path: Path):
    runner = FakeRunner()
    target = release(tmp_path, lambda *_: None, runner)

    result = target.deploy()

    assert result["status"] == "released"
    assert "new" in (target.paths.dist / "index.html").read_text()
    assert (target.paths.dist / "assets/index-new.js").read_text() == "new"
    assert (target.paths.dist / "assets/index-old.js").read_text() == "old"
    assert "old" in (target.paths.backup / "index.html").read_text()
    assert all("restart" not in command for command in runner.commands)
    assert all("nginx" not in command for command in runner.commands)


def test_existing_asset_hash_collision_aborts_before_switch(tmp_path: Path):
    target = release(tmp_path, lambda *_: None)
    collision = target.paths.dist / "assets/index-new.css"
    collision.write_text("different", encoding="utf-8")

    with pytest.raises(ReleaseError, match="differs from candidate"):
        target.deploy()

    assert "old" in (target.paths.dist / "index.html").read_text()
    assert not (target.paths.dist / "assets/index-new.js").exists()


def test_failed_public_probe_restores_previous_index(tmp_path: Path):
    target: FrontendRelease | None = None

    def probe(url: str, _timeout: float) -> None:
        assert target is not None
        if (
            url == DEFAULT_PUBLIC_HEALTH
            and "new" in (target.paths.dist / "index.html").read_text()
        ):
            raise OSError("injected failure")

    target = release(tmp_path, probe)
    with pytest.raises(ReleaseError, match="index.html was restored"):
        target.deploy()

    assert "old" in (target.paths.dist / "index.html").read_text()
    assert "old" in (target.paths.backup / "index.html").read_text()
    target.cleanup_incomplete_stage()
    assert target.paths.candidate.is_dir()
    assert target.paths.backup.is_dir()


def test_failed_baseline_probe_does_not_create_release_artifacts(tmp_path: Path):
    def probe(url: str, _timeout: float) -> None:
        if url == "https://existing.example/":
            raise OSError("baseline unavailable")

    target = release(tmp_path, probe)
    with pytest.raises(ReleaseError, match="baseline unavailable"):
        target.deploy()

    assert "old" in (target.paths.dist / "index.html").read_text()
    assert not target.paths.candidate.exists()
    assert not target.paths.backup.exists()


def test_public_resource_probes_include_assets_with_expected_mime(tmp_path: Path):
    probes: list[tuple[str, str | None]] = []

    def asset_probe(url: str, _timeout: float, expected_type: str | None) -> None:
        probes.append((url, expected_type))

    target = release(tmp_path, lambda *_: None, asset_probe=asset_probe)
    target.deploy()

    assert ("https://public.example/ai-team/assets/index-old.js", "javascript") in probes
    assert ("https://public.example/ai-team/assets/index-old.css", "css") in probes
    assert ("https://public.example/ai-team/assets/index-new.js", "javascript") in probes
    assert ("https://public.example/ai-team/assets/index-new.css", "css") in probes
    assert ("https://public.example/ai-team/favicon.ico", None) in probes


def test_failed_new_public_resource_probe_restores_and_rechecks_old_index(tmp_path: Path):
    target: FrontendRelease | None = None
    seen: list[str] = []

    def asset_probe(url: str, _timeout: float, _expected_type: str | None) -> None:
        assert target is not None
        seen.append(url)
        if url.endswith("/assets/index-new.js"):
            raise OSError("injected asset 404")

    target = release(tmp_path, lambda *_: None, asset_probe=asset_probe)
    with pytest.raises(ReleaseError, match="before index.html switch"):
        target.deploy()

    assert "old" in (target.paths.dist / "index.html").read_text()
    assert seen.count("https://public.example/ai-team/assets/index-old.js") >= 2
    assert "https://public.example/ai-team/assets/index-new.js" in seen
