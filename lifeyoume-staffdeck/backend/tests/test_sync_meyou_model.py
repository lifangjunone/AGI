from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT = Path(__file__).parents[2] / "scripts" / "sync_meyou_model.py"


def test_sync_imports_verifies_and_activates_without_printing_secrets() -> None:
    requests: list[dict[str, object]] = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *_args: object) -> None:
            return

        def _send(self, body: object, status: int = 200) -> None:
            encoded = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def _record(self) -> dict[str, object]:
            length = int(self.headers.get("content-length", "0"))
            raw = self.rfile.read(length) if length else b""
            body = json.loads(raw) if raw else None
            record = {
                "method": self.command,
                "path": self.path,
                "body": body,
                "sync_token": self.headers.get("x-lifeyoume-model-sync-token"),
                "authorization": self.headers.get("authorization"),
            }
            requests.append(record)
            return record

        def do_GET(self) -> None:
            self._record()
            if self.path == "/internal/model-config":
                self._send(
                    {
                        "provider": "ark",
                        "baseUrl": "https://model.example.test/v1",
                        "modelId": "example-model",
                        "apiKey": "super-secret-model-key",
                        "thinkingEnabled": True,
                        "timeoutMs": 120000,
                        "temperature": 0.35,
                    }
                )
                return
            if self.path.startswith("/api/enterprise/model-configs?"):
                self._send([])
                return
            self._send({"error": "not_found"}, 404)

        def do_POST(self) -> None:
            record = self._record()
            if self.path == "/api/auth/login":
                self._send({"token": "staffdeck-access-token", "user": {"role": "admin"}})
                return
            if self.path.startswith(
                "/api/enterprise/model-configs?verify_before_save=true"
            ):
                body = record["body"]
                assert isinstance(body, dict)
                self._send(
                    {
                        "id": "model_imported",
                        "name": body["name"],
                        "enabled": True,
                        "is_default": True,
                        "trust_status": "verified",
                    }
                )
                return
            self._send({"error": "not_found"}, 404)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    environment = {
        **os.environ,
        "MEYOU_URL": base_url,
        "STAFFDECK_URL": base_url,
        "MEYOU_MODEL_SYNC_TOKEN": "sync-token-not-a-model-secret",
        "STAFFDECK_ADMIN_USERNAME": "admin",
        "STAFFDECK_ADMIN_PASSWORD": "admin-password",
    }
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            env=environment,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    assert result.returncode == 0, result.stderr
    assert "已验证、已启用、已设为默认" in result.stdout
    assert "super-secret-model-key" not in result.stdout + result.stderr
    assert [request["path"].split("?")[0] for request in requests] == [
        "/internal/model-config",
        "/api/auth/login",
        "/api/enterprise/model-configs",
        "/api/enterprise/model-configs",
    ]
    assert requests[0]["sync_token"] == "sync-token-not-a-model-secret"
    assert requests[2]["authorization"] == "Bearer staffdeck-access-token"
    imported = requests[3]["body"]
    assert isinstance(imported, dict)
    assert imported["api_key"] == "super-secret-model-key"
    assert imported["model"] == "example-model"
    assert imported["enabled"] is True
    assert imported["is_default"] is True
