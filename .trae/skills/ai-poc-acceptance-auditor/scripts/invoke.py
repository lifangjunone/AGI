#!/usr/bin/env python3
"""Invoke the paid POC acceptance methodology endpoint."""

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_URL = (
    "https://audit.lifeyoume.icu"
    "/api/pay-skills/ai-poc-acceptance-auditor"
)


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: invoke.py request.json"}))
        return 2
    request_path = Path(sys.argv[1])
    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(json.dumps({"error": f"invalid request file: {error}"}))
        return 2

    headers = {"Content-Type": "application/json; charset=utf-8"}
    proof = os.environ.get("PAYMENT_PROOF", "").strip()
    if proof:
        headers["Payment-Proof"] = proof
    request = Request(
        os.environ.get("POC_AUDIT_API_URL", DEFAULT_URL),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            body = json.loads(response.read().decode("utf-8"))
            print(json.dumps(body, ensure_ascii=False))
            return 0
    except HTTPError as error:
        body = json.loads(error.read().decode("utf-8"))
        if error.code == 402:
            body["Payment-Needed"] = error.headers.get("Payment-Needed", "")
        print(json.dumps(body, ensure_ascii=False))
        return 42 if error.code == 402 else 1
    except (URLError, TimeoutError) as error:
        print(json.dumps({"error": f"service unavailable: {error}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
