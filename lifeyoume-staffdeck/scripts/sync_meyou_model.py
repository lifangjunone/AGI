#!/usr/bin/env python3
"""Import MeYou's active model into LifeYouMe Digital Team without persisting plaintext secrets."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


MEYOU_URL = os.environ.get("MEYOU_URL", "https://meyou.lifeyoume.icu").rstrip("/")
STAFFDECK_URL = os.environ.get("STAFFDECK_URL", "http://127.0.0.1:5173").rstrip("/")
TENANT_ID = os.environ.get("STAFFDECK_TENANT_ID", "tenant_demo")
CONFIG_NAME = "LifeYouMe 共享模型（MeYou）"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"缺少环境变量 {name}")
    return value


def request_json(
    method: str,
    url: str,
    *,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 120,
) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if data is not None:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=data, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode(errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {"body": raw[:300]}
        raise RuntimeError(f"{method} {url} 返回 HTTP {exc.code}: {detail}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"无法连接 {url}: {exc.reason}") from None


def main() -> int:
    sync_token = required_env("MEYOU_MODEL_SYNC_TOKEN")
    username = required_env("STAFFDECK_ADMIN_USERNAME")
    password = required_env("STAFFDECK_ADMIN_PASSWORD")

    source = request_json(
        "GET",
        f"{MEYOU_URL}/internal/model-config",
        headers={"X-LifeYouMe-Model-Sync-Token": sync_token},
    )
    if not source.get("apiKey") or not source.get("modelId"):
        raise RuntimeError("MeYou 当前没有可同步的活动模型")

    login = request_json(
        "POST",
        f"{STAFFDECK_URL}/api/auth/login",
        body={"tenant_id": TENANT_ID, "username": username, "password": password},
    )
    access_token = login.get("token")
    if not access_token:
        raise RuntimeError("数字团队管理员登录未返回访问令牌")
    auth = {"Authorization": f"Bearer {access_token}"}
    query = urllib.parse.urlencode({"tenant_id": TENANT_ID})
    configs = request_json(
        "GET",
        f"{STAFFDECK_URL}/api/enterprise/model-configs?{query}",
        headers=auth,
    )

    extra_body: dict[str, Any] = {}
    if source.get("thinkingEnabled") is not None:
        extra_body["thinking"] = {
            "type": "enabled" if source["thinkingEnabled"] else "disabled"
        }
    payload = {
        "tenant_id": TENANT_ID,
        "name": CONFIG_NAME,
        "provider": "openai_compatible",
        "api_protocol": "openai_chat_completions",
        "base_url": source["baseUrl"],
        "api_key": source["apiKey"],
        "model": source["modelId"],
        "temperature": source.get("temperature", 0.2),
        "max_output_tokens": 8192,
        "extra_body": extra_body,
        "is_default": True,
        "enabled": True,
    }
    existing = next((item for item in configs if item.get("name") == CONFIG_NAME), None)
    if existing:
        target_url = (
            f"{STAFFDECK_URL}/api/enterprise/model-configs/{existing['id']}"
            f"?{query}&verify_before_save=true"
        )
        method = "PUT"
    else:
        target_url = (
            f"{STAFFDECK_URL}/api/enterprise/model-configs"
            f"?verify_before_save=true"
        )
        method = "POST"

    imported = request_json(
        method, target_url, body=payload, headers=auth, timeout=180
    )
    if not (
        imported.get("enabled")
        and imported.get("is_default")
        and imported.get("trust_status") == "verified"
    ):
        raise RuntimeError("模型已写入但未通过验证或未成为默认模型")

    print(
        "同步完成："
        f"{source['provider']}/{source['modelId']} → "
        f"{CONFIG_NAME}（已验证、已启用、已设为默认）"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"同步失败：{exc}", file=sys.stderr)
        raise SystemExit(1)
