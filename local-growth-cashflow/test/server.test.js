const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { handler } = require("../server");
const { extractJson, makeResilientFallback, normalizeResult, validateBrief } = require("../ai-service");

function request(server, pathname) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    http
      .get({ hostname: "127.0.0.1", port: address.port, path: pathname }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode, body, headers: response.headers }));
      })
      .on("error", reject);
  });
}

test("serves the application shell", async () => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await request(server, "/");
    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /text\/html/);
    assert.match(response.body, /邻店增长/);
    assert.match(response.body, /生成 ¥99 成交提案/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects traversal and returns 404 for missing assets", async () => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const traversal = await request(server, "/..%2Fpackage.json");
    assert.equal(traversal.status, 403);
    const missing = await request(server, "/missing.css");
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("exposes only redacted public model configuration", async () => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await request(server, "/api/config");
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.providers.ark.enabled, false);
    assert.equal(body.providers.ark.configured, false);
    assert.equal(body.providers.fallback.configured, true);
    assert.equal(JSON.stringify(body).includes("apiKey"), false);
    assert.equal(JSON.stringify(body).includes("ark-165"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("validates briefs and parses fenced model JSON", () => {
  assert.throws(() => validateBrief({}), /请填写/);
  const brief = validateBrief({
    shop: "测试门店",
    industry: "餐饮",
    ticket: 88,
    product: "午餐套餐",
    audience: "附近上班族",
    mode: "reasoning",
  });
  assert.equal(brief.mode, "reasoning");
  assert.deepEqual(extractJson("```json\n{\"summary\":\"可用\"}\n```"), { summary: "可用" });
  assert.throws(() => normalizeResult({ summary: "不完整结果" }), /不完整/);
  const complete = normalizeResult({
    summary: "结果",
    obstacles: ["A"],
    actions: [{}, {}, {}],
    scripts: [{}, {}, {}],
    reviews: { positive: ["1", "2", "3", "4", "5"], negative: ["1", "2", "3", "4", "5"] },
    calendar: [{}, {}, {}, {}, {}, {}, {}],
  });
  assert.equal(complete.summary, "结果");
});

test("builds a complete local fallback when model output is unavailable", () => {
  const result = makeResilientFallback({
    shop: "测试烘焙",
    industry: "餐饮",
    ticket: 68,
    product: "生日蛋糕",
    audience: "附近家庭",
    pain: "没有咨询",
    mode: "quality",
  });
  assert.equal(result.actions.length, 3);
  assert.equal(result.scripts.length, 3);
  assert.equal(result.reviews.positive.length, 5);
  assert.equal(result.reviews.negative.length, 5);
  assert.equal(result.calendar.length, 7);
});
