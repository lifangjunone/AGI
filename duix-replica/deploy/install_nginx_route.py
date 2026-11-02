import hashlib
import pathlib
import shutil
import sys
from datetime import datetime

config_path = pathlib.Path("/data/app/lifeyoume-platform/deploy/nginx-platform.conf")
snippet_path = pathlib.Path("/tmp/nginx-duix-location.conf")
expected_hash = sys.argv[1]

content = config_path.read_bytes()
actual_hash = hashlib.sha256(content).hexdigest()
if actual_hash != expected_hash:
    raise SystemExit("Shared Nginx config changed concurrently; refusing stale update.")

text = content.decode()
if "location /duix/" in text or "location = /duix" in text:
    raise SystemExit("A /duix route already exists; refusing duplicate update.")

marker = "    location = /story-studio {"
if text.count(marker) != 1:
    raise SystemExit("Expected insertion marker is not unique.")

snippet = snippet_path.read_text().rstrip() + "\n\n"
updated = text.replace(marker, snippet + marker, 1)
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = config_path.with_name(f"{config_path.name}.bak-duix-{timestamp}")
shutil.copy2(config_path, backup)

# Opening the existing file preserves the bind-mounted inode.
with config_path.open("w") as handle:
    handle.write(updated)

print(backup)
