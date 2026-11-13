import copy
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as E

r = Path(__file__).parent
doc = "Qp0pdj6oIoxl5qxw6Joc6wDZnfg"
plan_path = r / "tone-edit-plan.json"
mode = sys.argv[1]

if mode == "prepare":
    baseline = json.loads((r / "tone-source-doc.json").read_text())["data"]["document"]
    current = json.loads((r / "tone-current-doc.json").read_text())["data"]["document"]
    assert baseline["content"] == current["content"], "Remote content changed; merge first."
    root = E.fromstring("<root>" + current["content"] + "</root>")
    keep = {
        "doxcnlU3cXZUcTrV3LmLO7tbXRb", # system links
        "doxcnjleennitfWppeUjJsSy4V0", # evidence definitions
        "doxcn3csrZydcbhaT1812VX0dVF", # actual intent description
        "doxcn7Pdo5UJPiyPTRM77kFZpef", # actual test evidence
        "doxcnAr3NDnzcKIKv64tyO2R9Ig",
        "doxcn2htnWHxnx7TqY0ydfDQwNf",
        "doxcn7C059cirAYTWMgaVhScowf",
        "doxcntYWHzzbjoeJcxJ5EMnuikx", # actual release description
        "doxcnYevxBfDtBSda9ybtcHAFYe", # same-level migration invariants
    }
    replacements = [
        ("真实业务执行、跨智能体协同、权限与记忆隔离、安全覆盖、统一门户及性能门槛需要后续验收。",
         "真实业务执行与跨智能体协同需要后续验收。权限与记忆隔离、安全覆盖仍需验证，统一门户及性能门槛也需验收。",
         "规则5／正文并列L7"),
        ("本例不使用企业密码、不访问业务数据库、不创建工单、不改账号。",
         "本例不使用企业密码，也不访问业务数据库。它不创建工单或修改账号。",
         "规则5／正文并列L91"),
        ("多轮续接、歧义输入、注入、节点异常和跨租户访问未在本轮通过。",
         "多轮续接和歧义输入未在本轮通过。注入、节点异常和跨租户访问也未在本轮通过。",
         "规则5／正文并列L186"),
        ("迁移需要来源、主体、有效期、删除及授权审计。",
         "迁移需要来源、主体及有效期，还需要删除和授权审计。",
         "规则5／正文并列L215"),
        ("区分模型失败、工具失败、授权失败、知识空召回及业务拒绝；高风险动作不自动重试。",
         "模型失败和工具失败应分别识别，授权失败也要单独区分。知识空召回与业务拒绝同样需要区分；高风险动作不自动重试。",
         "规则5／正文并列L217"),
        ("“尚未验证”不等于“HiAgent 不支持”：本轮没有证据把这些平台能力判为永久缺失。",
         "“尚未验证”不等于“HiAgent 不支持”。本轮没有证据把这些平台能力判为永久缺失。",
         "规则12／结论冒号L55"),
    ]
    hits = [0] * len(replacements)
    edits = []
    semicolons = 0
    for original in root.iter("p"):
        p = copy.deepcopy(original)
        block_id = p.attrib.pop("id")
        before = "".join(original.itertext())
        rules = []
        if block_id not in keep:
            n = before.count("；")
            if n:
                semicolons += n
                rules.append(f"规则F／{n}处分号改句号")
            for e in p.iter():
                for attr in ("text", "tail"):
                    text = getattr(e, attr)
                    if text is None:
                        continue
                    for i, (old, new, rule) in enumerate(replacements):
                        if old in text:
                            hits[i] += text.count(old)
                            text = text.replace(old, new)
                            rules.append(rule)
                    setattr(e, attr, text.replace("；", "。"))
        after = "".join(p.itertext())
        if before != after:
            edits.append(dict(block_id=block_id, before=before, after=after,
                              content=E.tostring(p, encoding="unicode"),
                              rules=rules, status="pending"))
    assert semicolons == 77, semicolons
    assert hits == [1] * 6, hits
    plan = dict(document=doc, base_revision=current["revision_id"],
                semicolons=semicolons, replacements=6, edits=edits)
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    print(json.dumps({"blocks": len(edits), "semicolons": semicolons,
                      "approved_wording_changes": hits}, ensure_ascii=False))

elif mode == "apply":
    plan = json.loads(plan_path.read_text())
    limit = int(sys.argv[2])
    count = 0
    for item in plan["edits"]:
        if item["status"] == "done":
            continue
        if count >= limit:
            break
        args = ["lark-cli", "docs", "+update", "--as", "user",
                "--doc", doc, "--command", "block_replace",
                "--block-id", item["block_id"], "--doc-format", "xml",
                "--content", item["content"], "--format", "json"]
        proc = subprocess.run(args, capture_output=True, text=True)
        try:
            result = json.loads(proc.stdout)
        except ValueError:
            raise RuntimeError(proc.stdout + proc.stderr)
        data = result.get("data", {})
        if not result.get("ok") or data.get("result") != "success" or data.get("warnings"):
            raise RuntimeError(result)
        item["status"] = "done"
        item["result"] = result
        plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2))
        count += 1
        print("Updated", item["block_id"], "revision",
              data.get("document", {}).get("revision_id"), flush=True)
    print("Done", sum(x["status"] == "done" for x in plan["edits"]), "/", len(plan["edits"]))

else:
    raise SystemExit("Use prepare or apply <count>")
