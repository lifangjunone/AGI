"""Append only this product block; retain shared bind-mount inode and all old bytes."""
import fcntl
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

config = Path("/data/app/lifeyoume-platform/deploy/nginx-platform.conf")
block = Path("/tmp/status-capsule-nginx-location.conf").read_bytes()
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
backup_dir = Path("/data/app/backups/status-capsule-photo") / stamp
backup_dir.mkdir(parents=True, exist_ok=False)
lock = open("/data/app/lifeyoume-platform/deploy/.nginx-product.lock", "a")
fcntl.flock(lock, fcntl.LOCK_EX)
old = config.read_bytes()
if b"/status-capsule" in old:
    raise RuntimeError("Product route exists; inspect before updating")
anchor = b"    # END destiny-persona"
if old.count(anchor) != 1:
    raise RuntimeError("Expected unique insertion anchor missing")
routes = re.findall(rb"^\s*location\s+([^\n{]+)", old, re.M)
(backup_dir / "nginx.conf").write_bytes(old)
(backup_dir / "routes.json").write_text(json.dumps([r.decode() for r in routes], indent=2))
offset = old.index(anchor) + len(anchor)
new = old[:offset] + b"\n" + block + old[offset:]
assert new[:offset] + new[offset + len(block) + 1:] == old
inode = config.stat().st_ino
if config.read_bytes() != old:
    raise RuntimeError("Concurrent config change; merge with latest")
with config.open("r+b") as output:
    output.write(new)
    output.truncate()
assert config.stat().st_ino == inode
try:
    assert config.read_bytes() == new
    assert all(route in re.findall(rb"^\s*location\s+([^\n{]+)", new, re.M) for route in routes)
    subprocess.run(["docker", "exec", "opportunity_factory_proxy", "nginx", "-t"], check=True)
    if config.read_bytes() != new:
        raise RuntimeError("Concurrent change before reload")
    subprocess.run(["docker", "exec", "opportunity_factory_proxy", "nginx", "-s", "reload"], check=True)
except Exception:
    if config.read_bytes() == new:
        with config.open("r+b") as output:
            output.write(old)
            output.truncate()
    raise
print(json.dumps({"backup": str(backup_dir), "inode": inode, "existing_routes": len(routes),
                  "before_sha256": hashlib.sha256(old).hexdigest(),
                  "after_sha256": hashlib.sha256(new).hexdigest()}))
