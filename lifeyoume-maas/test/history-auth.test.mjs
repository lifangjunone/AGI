import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("production history endpoints require admin authentication", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "maas-history-auth-"));
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "production", MAAS_PORT: "0",
      MAAS_ADMIN_TOKEN: "local-test-admin", MAAS_MASTER_KEY: "test-master-key-longer-than-32-characters",
      MAAS_DATA_PATH: join(directory, "state.json") },
    stdio: ["ignore", "pipe", "ignore"]
  });
  context.after(() => child.kill("SIGTERM"));
  const base = await new Promise((resolve, reject) => {
    child.stdout.on("data", chunk => {
      const match = chunk.toString().match(/listening on (http:\/\/\S+)/);
      if (match) resolve(match[1].trim());
    });
    child.once("exit", () => reject(new Error("test server exited")));
  });
  for (const kind of ["usage", "audit"]) {
    const denied = await fetch(`${base}/api/admin/${kind}`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${base}/api/admin/${kind}?size=10`, {
      headers: { authorization: "Bearer local-test-admin" }
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("cache-control"), "no-store");
    const value = await allowed.json();
    assert.ok(value.items.length <= 10);
    assert.equal(JSON.stringify(value).includes("local-test-admin"), false);
  }
});
