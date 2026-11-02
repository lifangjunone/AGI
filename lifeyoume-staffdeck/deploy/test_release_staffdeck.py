from __future__ import annotations

from pathlib import Path
import sqlite3

import pytest

from release_staffdeck import (
    DEFAULT_LOCAL_HEALTH,
    DEFAULT_PUBLIC_HEALTH,
    MAIN_SERVICE,
    ReleaseError,
    StaffDeckRelease,
    sqlite_online_backup,
)


class FakeRunner:
    def __init__(self):
        self.commands: list[tuple[str, ...]] = []

    def run(self, *command: str) -> None:
        self.commands.append(command)


def appdir(path: Path, marker: str) -> Path:
    binary = path / "usr/lib/staffdeck/staffdeck"
    index = path / "usr/lib/staffdeck/_internal/frontend-enterprise/dist/index.html"
    binary.parent.mkdir(parents=True)
    index.parent.mkdir(parents=True)
    binary.write_text(f"#!/bin/sh\n# {marker}\n", encoding="utf-8")
    binary.chmod(0o755)
    index.write_text('<script src="/ai-team/assets/index.js"></script>', encoding="utf-8")
    (path / "MARKER").write_text(marker, encoding="utf-8")
    return path


def production_root(path: Path) -> Path:
    appdir(path / "current", "old")
    (path / "data").mkdir()
    with sqlite3.connect(path / "data/skill_agent_loop.db") as db:
        db.execute("CREATE TABLE value (content TEXT)")
        db.execute("INSERT INTO value VALUES ('preserved')")
    return path


def release(tmp_path: Path, probe, runner: FakeRunner | None = None) -> StaffDeckRelease:
    return StaffDeckRelease(
        source=appdir(tmp_path / "source", "new"),
        root=production_root(tmp_path / "production"),
        stamp="20260101T000000Z",
        regression_urls=("https://existing.example/",),
        attempts=1,
        runner=runner or FakeRunner(),
        probe=probe,
        require_root=False,
    )


def test_sqlite_online_backup_is_consistent(tmp_path: Path):
    source = tmp_path / "source.db"
    backup = tmp_path / "backup.db"
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE item (value TEXT)")
        db.execute("INSERT INTO item VALUES ('ok')")
    sqlite_online_backup(source, backup)
    with sqlite3.connect(backup) as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT value FROM item").fetchone()[0] == "ok"
    assert backup.stat().st_mode & 0o777 == 0o600


def test_successful_release_preserves_rollback_and_backup(tmp_path: Path):
    runner = FakeRunner()
    target = release(tmp_path, lambda *_: None, runner)

    result = target.deploy()

    assert result["status"] == "released"
    assert (target.paths.current / "MARKER").read_text() == "new"
    assert (target.paths.rollback / "MARKER").read_text() == "old"
    assert target.paths.database_backup.is_file()
    assert ("systemctl", "restart", MAIN_SERVICE) in runner.commands
    assert any(command[:2] == ("systemctl", "start") for command in runner.commands)


def test_failed_public_gate_restores_previous_appdir(tmp_path: Path):
    target: StaffDeckRelease | None = None

    def probe(url: str, _timeout: float) -> None:
        assert target is not None
        current_marker = (target.paths.current / "MARKER").read_text()
        if url == DEFAULT_PUBLIC_HEALTH and current_marker == "new":
            raise OSError("injected public failure")

    target = release(tmp_path, probe)
    with pytest.raises(ReleaseError, match="previous AppDir was restored"):
        target.deploy()

    assert (target.paths.current / "MARKER").read_text() == "old"
    assert (target.paths.failed / "MARKER").read_text() == "new"
    assert target.paths.database_backup.is_file()


def test_failed_baseline_probe_does_not_mutate_production(tmp_path: Path):
    def probe(url: str, _timeout: float) -> None:
        if url == "https://existing.example/":
            raise OSError("existing product unavailable")

    target = release(tmp_path, probe)
    with pytest.raises(ReleaseError, match="existing product unavailable"):
        target.deploy()

    assert (target.paths.current / "MARKER").read_text() == "old"
    assert not target.paths.rollback.exists()
    assert not target.paths.database_backup.exists()


def test_local_gate_is_checked_before_public_gate(tmp_path: Path):
    probes: list[str] = []
    target = release(tmp_path, lambda url, _: probes.append(url))

    target.deploy()

    # Baseline ends with existing-product probes; activation starts locally.
    activation_start = probes.index(DEFAULT_LOCAL_HEALTH, 1)
    assert probes[activation_start] == DEFAULT_LOCAL_HEALTH
    assert DEFAULT_PUBLIC_HEALTH in probes[activation_start + 1 :]


def test_cleanup_removes_only_unactivated_candidate(tmp_path: Path):
    target = release(tmp_path, lambda *_: None)
    target.preflight()
    target.paths.candidate.mkdir()
    (target.paths.candidate / "partial").write_text("incomplete")

    target.cleanup_incomplete_stage()

    assert not target.paths.candidate.exists()
    assert (target.paths.current / "MARKER").read_text() == "old"
