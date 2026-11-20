from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


class MaasError(Exception):
    pass


def maas_configured(env: dict[str, str] | None = None) -> bool:
    source = env if env is not None else os.environ
    return bool(source.get("MAAS_SERVICE_KEY", "").strip())


def call_maas(messages: list[dict[str, str]], *, env: dict[str, str] | None = None) -> str:
    source = env if env is not None else os.environ
    api_key = source.get("MAAS_SERVICE_KEY", "").strip()
    if not api_key:
        raise MaasError("maas_not_configured")
    base_url = source.get("MAAS_BASE_URL", "https://maas.lifeyoume.icu/v1").rstrip("/")
    model_id = source.get("MAAS_MODEL_ID", "lym-chat-quality").strip()
    timeout = float(source.get("MODEL_TIMEOUT_MS", "45000")) / 1000
    body = json.dumps(
        {
            "model": model_id,
            "messages": messages,
            "temperature": 0.38,
            "response_format": {"type": "json_object"},
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(1_000_000)
    except urllib.error.HTTPError as error:
        error.read()
        raise MaasError(f"maas_http_{error.code}")
    except Exception as error:  # noqa: BLE001 - error message is surfaced as degraded source only
        raise MaasError(f"maas_failed:{error}")
    try:
        payload = json.loads(raw.decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
    except Exception as error:  # noqa: BLE001
        raise MaasError(f"maas_invalid_response:{error}")
    if not isinstance(content, str) or not content.strip():
        raise MaasError("maas_empty_response")
    return content.strip()


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        value = json.loads(text[start : end + 1])
        if isinstance(value, dict):
            return value
    raise MaasError("maas_json_parse_failed")


def model_diagnosis(report: dict[str, Any], compact: dict[str, Any]) -> dict[str, Any]:
    fallback = {
        "source": "local",
        "summary": f"{report['rating']['grade']} · {report['rating']['label']}。当前分数 {report['rating']['score']}，主要问题："
        + ("；".join(report["rating"].get("penalties") or ["基础项可继续优化"])),
        "priorities": report["recommendations"][:4],
        "llmsTxtDraft": f"# {report['page'].get('title') or report['target']}\n\n> 面向 AI 助手和搜索摘要的站点说明。\n\n- 官网：{report['target']}\n- 主要内容：请根据页面标题、描述和核心正文摘要填写。\n- 抓取边界：请遵守 robots.txt；不要提交表单或访问用户私有数据。\n- 联系方式：填写站点维护者邮箱或支持入口。\n",
        "nextExperiment": "修复最高优先级问题后，重新检测同一 URL，并用隐身窗口确认匿名访问可读文本是否增加。",
    }
    try:
        content = call_maas(
            [
                {
                    "role": "system",
                    "content": (
                        "你是中文 AI 搜索可见性顾问。根据网站检测报告输出 JSON。"
                        "字段：summary 字符串；priorities 字符串数组；llmsTxtDraft 字符串；nextExperiment 字符串。"
                        "建议要具体、克制、可执行，不要承诺一定被 AI 引用。"
                    ),
                },
                {"role": "user", "content": json.dumps(compact, ensure_ascii=False)},
            ]
        )
        parsed = parse_json_object(content)
        return {
            "source": "maas",
            "summary": str(parsed.get("summary") or fallback["summary"])[:700],
            "priorities": [str(item)[:260] for item in parsed.get("priorities", [])[:6]] or fallback["priorities"],
            "llmsTxtDraft": str(parsed.get("llmsTxtDraft") or fallback["llmsTxtDraft"])[:2500],
            "nextExperiment": str(parsed.get("nextExperiment") or fallback["nextExperiment"])[:360],
        }
    except MaasError as error:
        return {**fallback, "source": "fallback", "error": str(error)}
