const test = require("node:test");
const assert = require("node:assert/strict");
const {
  queryRows,
  selectCandidate,
  symbolFromRow
} = require("../src/codegraph-adapter");

test("只选择许可证允许且达到门槛的 GitHub 候选", () => {
  const selected = selectCandidate([
    {
      type: "repository",
      title: "blocked/repo",
      url: "https://github.com/blocked/repo",
      clone_url: "https://github.com/blocked/repo.git",
      license: "AGPL-3.0",
      license_blocked: true,
      score: 90
    },
    {
      type: "repository",
      title: "allowed/repo",
      url: "https://github.com/allowed/repo",
      clone_url: "https://github.com/allowed/repo.git",
      license: "MIT",
      license_blocked: false,
      score: 78
    }
  ]);
  assert.equal(selected.title, "allowed/repo");
});

test("兼容 CodeGraph 数组和 results JSON 输出", () => {
  assert.equal(queryRows([{ name: "a" }]).length, 1);
  assert.equal(queryRows({ results: [{ name: "b" }] }).length, 1);
  assert.equal(queryRows({ nodes: [{ name: "c" }] }).length, 1);
});

test("统一提取符号位置", () => {
  const symbol = symbolFromRow({
    score: 8,
    node: {
      id: "symbol-1",
      qualifiedName: "WorkOrderService.create",
      filePath: "src/work-order.ts",
      startLine: 42,
      kind: "method"
    }
  });
  assert.equal(symbol.name, "WorkOrderService.create");
  assert.equal(symbol.file, "src/work-order.ts");
  assert.equal(symbol.line, 42);
});
