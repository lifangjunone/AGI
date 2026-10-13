#!/usr/bin/env python3
import http.server
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request


UPSTREAM = os.environ.get("JEV_UPSTREAM", "https://api.typesafe.ai").rstrip("/")
HOST = os.environ.get("JEV_PROXY_HOST", "127.0.0.1")
PORT = int(os.environ.get("JEV_PROXY_PORT", "8701"))
TIMEOUT = float(os.environ.get("JEV_PROXY_TIMEOUT", "120"))


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "JevTunnelProxy/0.1"

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self._json(200, {"ok": True, "upstream": UPSTREAM})
            return
        self._json(404, {"detail": "not_found"})

    def do_POST(self):
        length = int(self.headers.get("content-length") or "0")
        if length > 1_000_000:
            self._json(413, {"detail": "payload_too_large"})
            return
        body = self.rfile.read(length)
        target = f"{UPSTREAM}{self.path}"
        request = urllib.request.Request(
            target,
            data=body,
            method="POST",
            headers={
                "content-type": self.headers.get("content-type", "application/json"),
                "accept": "application/json",
            },
        )
        authorization = self.headers.get("authorization")
        if authorization:
            request.add_header("authorization", authorization)
        start = time.perf_counter()
        try:
            with urllib.request.urlopen(
                request, timeout=TIMEOUT, context=ssl.create_default_context()
            ) as response:
                payload = response.read()
                self.send_response(response.status)
                self.send_header("content-type", response.headers.get("content-type", "application/json"))
                self.send_header("x-jev-proxy-latency-ms", str(round((time.perf_counter() - start) * 1000, 2)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            self.send_response(exc.code)
            self.send_header("content-type", exc.headers.get("content-type", "application/json"))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            self._json(502, {"detail": f"local_jev_proxy_failed: {type(exc).__name__}"})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Jev tunnel proxy listening on http://{HOST}:{PORT}, upstream={UPSTREAM}", flush=True)
    server.serve_forever()
