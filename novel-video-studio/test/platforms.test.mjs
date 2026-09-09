import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "novel-platforms-"));
process.env.NOVEL_STUDIO_DATA_DIRECTORY = dataDirectory;
await writeFile(path.join(dataDirectory, "state.json"), JSON.stringify({
  projects: [{ id: "test-project", novelName: "西游记", status: "completed", createdAt: "2026-09-09T00:00:00.000Z" }],
  updatedAt: "2026-09-09T00:00:00.000Z"
}));
const { startServer } = await import("../server.mjs");
const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
const origin = `http://127.0.0.1:${instance.port}`;

test.after(async () => {
  await new Promise((resolve) => instance.server.close(resolve));
  await rm(dataDirectory, { recursive: true, force: true });
});

test("web, mobile and desktop entrypoints share the production UI", async () => {
  for (const entry of ["/web/", "/mobile/", "/desktop/"]) {
    const response = await fetch(`${origin}${entry}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /长卷制片厂/);
  }
});

test("mobile PWA assets are valid and served with correct types", async () => {
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.match(manifestResponse.headers.get("content-type"), /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.start_url, "/mobile/");
  assert.equal(manifest.display, "standalone");

  const workerResponse = await fetch(`${origin}/mobile-sw.js`);
  assert.equal(workerResponse.status, 200);
  assert.match(await workerResponse.text(), /novel-picture-works-v2/);
});

test("desktop runtime keeps node integration disabled", async () => {
  const source = await readFile(new URL("../apps/desktop/main.mjs", import.meta.url), "utf8");
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /NOVEL_STUDIO_DATA_DIRECTORY/);
});

test("production manifest can be exported and downloaded", async () => {
  const exportResponse = await fetch(`${origin}/api/projects/test-project/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(exportResponse.status, 200);
  const { downloadUrl } = await exportResponse.json();
  const downloadResponse = await fetch(`${origin}${downloadUrl}`);
  assert.match(downloadResponse.headers.get("content-disposition"), /attachment/);
  assert.equal((await downloadResponse.json()).novelName, "西游记");
});
