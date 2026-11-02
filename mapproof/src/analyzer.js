const SHAPE = String.raw`(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|>[^]]*\])?`;
const EDGE_PATTERN = new RegExp(
  String.raw`^\s*([A-Za-z0-9_]+)${SHAPE}\s*(-->|---|-.->|==>|--x|--o)(?:\|([^|]+)\|)?\s*([A-Za-z0-9_]+)${SHAPE}`
);
const NODE_PATTERN = /^\s*([A-Za-z0-9_]+)\s*(?:\[|\(|\{|\>)/;

export function parseDiagram(source) {
  const nodes = new Map();
  const edges = [];
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const edge = line.match(EDGE_PATTERN);
    if (edge) {
      const [, from, arrow, label = "", to] = edge;
      nodes.set(from, nodes.get(from) || from);
      nodes.set(to, nodes.get(to) || to);
      edges.push({ from, to, arrow, label: label.trim(), line: index + 1 });
      continue;
    }
    const node = line.match(NODE_PATTERN);
    if (node) nodes.set(node[1], node[1]);
  }
  return { nodes: [...nodes.keys()], edges, lines };
}

function hasCycle(graph) {
  const adjacency = new Map(graph.nodes.map((node) => [node, []]));
  graph.edges.forEach(({ from, to }) => adjacency.get(from)?.push(to));
  const visiting = new Set();
  const visited = new Set();
  function walk(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) || []) if (walk(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return graph.nodes.some(walk);
}

function longestPath(graph) {
  const adjacency = new Map(graph.nodes.map((node) => [node, []]));
  const incoming = new Map(graph.nodes.map((node) => [node, 0]));
  graph.edges.forEach(({ from, to }) => {
    adjacency.get(from)?.push(to);
    incoming.set(to, (incoming.get(to) || 0) + 1);
  });
  const queue = graph.nodes.filter((node) => incoming.get(node) === 0).map((node) => [node]);
  let best = [];
  const seen = new Set();
  while (queue.length) {
    const path = queue.shift();
    const node = path.at(-1);
    const signature = `${node}:${path.length}`;
    if (seen.has(signature) || path.length > graph.nodes.length + 1) continue;
    seen.add(signature);
    if (path.length > best.length) best = path;
    for (const next of adjacency.get(node) || []) queue.push([...path, next]);
  }
  return best;
}

export function analyzeDiagram(source) {
  const graph = parseDiagram(source);
  const findings = [];
  const nodeSet = new Set(graph.nodes);
  const degree = new Map(graph.nodes.map((node) => [node, 0]));
  graph.edges.forEach(({ from, to }) => {
    degree.set(from, (degree.get(from) || 0) + 1);
    degree.set(to, (degree.get(to) || 0) + 1);
  });

  if (!/^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)/m.test(source)) {
    findings.push({ level: "error", title: "缺少明确布局方向", detail: "请在首行声明 flowchart LR 或 flowchart TD，避免不同渲染器产生意外布局。" });
  }
  const unlabeledBranches = graph.nodes.filter((node) => graph.edges.filter((edge) => edge.from === node).length > 1 &&
    graph.edges.filter((edge) => edge.from === node).some((edge) => !edge.label));
  if (unlabeledBranches.length) {
    findings.push({ level: "error", title: "分支条件未写清", detail: `${unlabeledBranches.join("、")} 存在多条出边但缺少条件标签，读者无法判断该走哪条路径。` });
  }
  const hubs = [...degree].filter(([, count]) => count >= 6);
  if (hubs.length) {
    findings.push({ level: "warn", title: "枢纽节点连线过密", detail: `${hubs.map(([node, count]) => `${node}（${count} 条）`).join("、")}。建议拆成分区或增加汇聚节点。` });
  }
  const isolated = graph.nodes.filter((node) => !graph.edges.some((edge) => edge.from === node || edge.to === node));
  if (isolated.length) {
    findings.push({ level: "warn", title: "发现孤立节点", detail: `${isolated.join("、")} 没有任何连接，可能是遗漏连线或无效信息。` });
  }
  if (hasCycle(graph)) {
    findings.push({ level: "info", title: "图中包含循环", detail: "循环可能是重试或反馈机制。发布前请确认它不是误连，并为退出条件加标签。" });
  }
  if (graph.nodes.length > 16) {
    findings.push({ level: "warn", title: "单图认知负荷偏高", detail: `当前 ${graph.nodes.length} 个节点。建议主图保留关键链路，把实现细节拆成子图。` });
  }
  if (!graph.edges.length) {
    findings.push({ level: "error", title: "没有识别到连接关系", detail: "请粘贴 Mermaid flowchart 源码，或检查箭头语法是否完整。" });
  }

  const critical = longestPath(graph);
  const errors = findings.filter((item) => item.level === "error").length;
  const warnings = findings.filter((item) => item.level === "warn").length;
  const score = Math.max(0, 100 - errors * 22 - warnings * 9 - Math.max(0, graph.nodes.length - 12) * 2);
  const duplicateEdges = graph.edges.length - new Set(graph.edges.map((edge) => `${edge.from}:${edge.to}:${edge.label}`)).size;
  if (duplicateEdges) findings.push({ level: "warn", title: "存在重复连线", detail: `${duplicateEdges} 条连接重复，可能导致视觉重叠或语义重复。` });

  return {
    score,
    verdict: score >= 85 ? "可发布" : score >= 65 ? "需复核" : "暂缓发布",
    metrics: {
      nodes: nodeSet.size,
      edges: graph.edges.length,
      labeled: graph.edges.filter((edge) => edge.label).length,
      criticalLength: critical.length
    },
    critical,
    findings
  };
}
