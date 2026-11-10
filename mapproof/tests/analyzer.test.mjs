import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDiagram, parseDiagram } from "../src/analyzer.js";

test("parses nodes, edges and labels", () => {
  const graph = parseDiagram(`flowchart LR\n A[Start] -->|ok| B[Done]\n B --> C[Archive]`);
  assert.deepEqual(graph.nodes, ["A", "B", "C"]);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.edges[0].label, "ok");
});

test("flags unlabeled decision branches", () => {
  const result = analyzeDiagram(`flowchart TD\n A{Ready} --> B[Yes]\n A --> C[No]`);
  assert.ok(result.findings.some((finding) => finding.title === "分支条件未写清"));
  assert.equal(result.verdict, "暂缓发布");
});

test("identifies a critical path", () => {
  const result = analyzeDiagram(`flowchart LR\n A[One] --> B[Two]\n B --> C[Three]\n C --> D[Four]`);
  assert.deepEqual(result.critical, ["A", "B", "C", "D"]);
});

test("detects cycles without hanging", () => {
  const result = analyzeDiagram(`flowchart LR\n A[One] --> B[Two]\n B --> A`);
  assert.ok(result.findings.some((finding) => finding.title === "反馈环需要复核"));
  assert.equal(result.verdict, "需复核");
  assert.equal(result.score, 84);
  assert.deepEqual(result.cycles, [["A", "B", "A"]]);
});

test("keeps main path separate from feedback loop", () => {
  const result = analyzeDiagram(`flowchart LR
    User[公网用户] -->|HTTPS| Edge[阿里云入口]
    Edge -->|统一认证| Auth[LifeYouMe Auth]
    Edge -->|反向隧道| App[腾讯云 MapProof]
    App --> Review{验收结果}
    Review -->|通过| Report[发布报告]
    Review -->|需修订| Source[修改 Mermaid]
    Source -->|重新验图| App`);
  assert.equal(result.verdict, "需复核");
  assert.equal(result.score, 84);
  assert.deepEqual(result.critical, ["User", "Edge", "App", "Review", "Report"]);
});
