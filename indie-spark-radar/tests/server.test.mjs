import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";

async function withServer(fn) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("health endpoint reports service", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/indie-spark/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.service, "indie-spark-radar");
  });
});

test("projects API returns seeded projects", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/indie-spark/api/projects?q=地图`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.ok(body.projects.some((project) => project.id === "feihua-map"));
  });
});

test("insight API returns local fallback when model key is absent", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/indie-spark/api/insight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "emoji-motion", userAngle: "做成 npm 包" })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.insight.source, "local");
  });
});
