from pathlib import Path
import copy
import json
import subprocess
import sys
import xml.etree.ElementTree as E

r = Path(__file__).parent
path = r / "function-name-plan.json"
doc = "Qp0pdj6oIoxl5qxw6Joc6wDZnfg"

names = {
    "P20／P21／P23 承接矩阵": "场景意图、数字员工编排与总控治理承接矩阵",
    "来源与能力": "具体功能",
    "事项与来源": "具体功能",
    "P20 场景与细分意图": "业务场景与细分意图配置",
    "P20 命中后 SOP": "意图命中后的业务流程执行（SOP）",
    "P20 Skill 与 SubAgent 混编": "业务技能与子智能体混合编排（Skill／SubAgent）",
    "P21 方式1：单数字员工路由": "将请求路由到单个数字员工",
    "P21 方式2：自然语言多数字员工编排": "用自然语言编排多个数字员工",
    "P21 方式3：Workflow 执行链": "用工作流配置多个数字员工的执行步骤",
    "P23 术语库与 Query 改写": "业务术语识别与用户问题改写",
    "P23 FAQ 快路径与兜底": "常见问答快速回复与未命中兜底（FAQ）",
    "P23 单／多意图与 ReAct": "单意图执行、多意图任务规划与 ReAct 循环",
    "P23 短期／长期记忆": "短期对话历史与长期记忆",
    "P23 知识召回": "按用户权限检索业务知识",
    "P23 SubAgent／Skill Hub": "跨平台子智能体与业务技能统一接入",
    "P23 输入与输出安全": "用户输入与回复内容的安全拦截",
    "P23 总控及运营管控": "总控运行、统一门户与运营治理",
    "P23 P99<1s": "响应时延指标（P99小于1秒）",
    "真实业务办理／P20 SOP": "真实业务办理与业务流程执行",
    "单个独立数字员工与 Skill 混编／P20、P21方式1及3":
        "独立数字员工调用、技能混编与工作流执行链",
    "自然语言多数字员工规划／P21方式2": "用自然语言规划多个数字员工的任务",
    "多意图自动执行及 ReAct／P23": "多意图任务自动执行与 ReAct 循环",
    "统一 SubAgent／Skill Hub 与原资产迁移／P20、P23":
        "跨平台子智能体与技能统一接入、原有资产迁移",
    "FAQ、术语改写与知识权限／P23": "常见问答、术语改写与知识访问权限",
    "短期／长期记忆等价承接／P23": "短期对话历史与长期记忆的等价承接",
    "输入／输出安全及统一管控／P23": "输入与输出安全、统一管控",
    "P99<1s与生产稳定性／P23": "响应时延达标与生产稳定性",
}

if sys.argv[1] == "prepare":
    d = json.loads((r / "function-names-before.json").read_text())["data"]["document"]
    root = E.fromstring("<root>" + d["content"] + "</root>")
    found = set()
    plan = []
    for orig in root.iter():
        if orig.tag not in {"p", "h1", "h2"}:
            continue
        before = "".join(orig.itertext())
        e = copy.deepcopy(orig)
        block_id = e.attrib.pop("id")
        e.attrib.pop("seq-marker", None)
        if before in names:
            e.text = names[before]
            found.add(before)
        elif "本方案使用 PDF 实际页码 P20/P21/P23" in before:
            old = "本方案使用 PDF 实际页码 P20/P21/P23，避免与网页预览定位页混淆。"
            new = ("来源页码仅用于追溯：PDF第20页为场景意图与命中策略，"
                   "第21页为单数字员工路由、自然语言编排及工作流执行链，"
                   "第23页为总控链路与治理能力。正文按具体功能名称组织，读者无需查看原PDF即可理解。")
            for x in e.iter():
                if x.text:
                    x.text = x.text.replace(old, new)
                if x.tail:
                    x.tail = x.tail.replace(old, new)
        elif "将 P21 方式1 从" in before:
            e.text = before.replace("将 P21 方式1 从", "将“单数字员工路由”从")
        if "".join(e.itertext()) != before:
            plan.append({"block_id": block_id, "before": before,
                         "after": "".join(e.itertext()),
                         "content": E.tostring(e, encoding="unicode"), "done": False})
    assert found == set(names), set(names) - found
    path.write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    print("Prepared", len(plan), "functional labels and source explanations")
else:
    plan = json.loads(path.read_text())
    n = 0
    for item in plan:
        if item["done"]:
            continue
        if n >= int(sys.argv[2]):
            break
        args = ["lark-cli", "docs", "+update", "--as", "user", "--doc", doc,
                "--command", "block_replace", "--block-id", item["block_id"],
                "--doc-format", "xml", "--content", item["content"], "--format", "json"]
        out = subprocess.run(args, capture_output=True, text=True, check=True)
        j = json.loads(out.stdout)
        assert j["ok"] and j["data"]["result"] == "success" and not j["data"].get("warnings"), j
        item["done"] = True
        path.write_text(json.dumps(plan, ensure_ascii=False, indent=2))
        n += 1
        print("Updated", item["after"][:65], flush=True)
    print("Completed", sum(x["done"] for x in plan), "/", len(plan))
