from pathlib import Path
import json
import subprocess
import sys
import xml.etree.ElementTree as ET

BASE = Path("/Users/bytedance/Desktop/agi/doc-fetch-resources")
TASK = BASE / "financial-overview-patches"
DOC = "HiJQdK3VXoEtvMxL7vfcC0zWnrb"
manifest = json.loads((TASK / "manifest.json").read_text())
state_file = TASK / "state.json"
state = json.loads(state_file.read_text()) if state_file.exists() else {
    "done": [], "last_fetch": str(BASE / "financial-overview-latest.json")
}

def run(args):
    proc = subprocess.run(["lark-cli", *args], capture_output=True, text=True, timeout=60)
    if proc.returncode:
        raise RuntimeError("CLI failed; no additional patches applied: " + proc.stderr[:300])
    data = json.loads(proc.stdout)
    if not data.get("ok"):
        raise RuntimeError("CLI returned unsuccessful result; inspect stored response")
    return data

def document(data):
    return data["data"]["document"]

def canonical(content):
    return ET.tostring(ET.fromstring("<root>" + content + "</root>"))

limit = int(sys.argv[1]) if len(sys.argv) > 1 else 3
count = 0
for i, patch in enumerate(manifest):
    if i in state["done"]:
        continue
    if count >= limit:
        break
    expected = document(json.loads(Path(state["last_fetch"]).read_text()))
    latest = run(["docs", "+fetch", "--doc", DOC, "--detail", "full", "--as", "user"])
    current = document(latest)
    if canonical(current["content"]) != canonical(expected["content"]):
        (TASK / "concurrent-current.json").write_text(json.dumps(latest, ensure_ascii=False))
        raise RuntimeError("Concurrent edit detected; merge latest before continuing")
    result = run([
        "docs", "+update", "--doc", DOC, "--command", "block_replace",
        "--start-block-id", patch["start_id"], "--end-block-id", patch["end_id"],
        "--content", "@" + patch["file"], "--revision-id", str(current["revision_id"]), "--as", "user"
    ])
    (TASK / f"result-{i+1:02d}.json").write_text(json.dumps(result, ensure_ascii=False))
    data = result.get("data", {})
    if data.get("warnings") or data.get("result", "success") != "success":
        raise RuntimeError("Update has warnings or incomplete result; inspect response")
    after = run(["docs", "+fetch", "--doc", DOC, "--detail", "full", "--as", "user"])
    actual = ET.fromstring("<root>" + document(after)["content"] + "</root>")
    replacement = ET.fromstring("<root>" + Path(patch["file"]).read_text() + "</root>")
    text = "".join(replacement.itertext())
    # Platform inserts generated IDs and image tokens; validate substantive text separately.
    actual_text = "".join(actual.itertext())
    needle = "".join(list(replacement)[0].itertext())
    if needle not in actual_text:
        raise RuntimeError("Replacement first block not found after update")
    if i == len(manifest) - 1:
        if len(list(actual.iter("img"))) != 16 or len(list(actual.iter("h4"))) != 16:
            raise RuntimeError("Tutorial image or step count differs after update")
        if not all(img.get("src") for img in actual.iter("img")):
            raise RuntimeError("Tutorial has image without uploaded token")
    dest = TASK / f"after-{i+1:02d}.json"
    dest.write_text(json.dumps(after, ensure_ascii=False))
    state["done"].append(i)
    state["last_fetch"] = str(dest)
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    count += 1
    print(f"{len(state['done'])}/8 完成：{patch['label']}；revision {document(after)['revision_id']}", flush=True)
print(f"本批完成 {count} 组；剩余 {len(manifest)-len(state['done'])} 组", flush=True)
