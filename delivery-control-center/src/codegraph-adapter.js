const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const ALLOWED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0"
]);

function safeName(value) {
  return String(value)
    .replace(/[^A-Za-z0-9_.-]/g, "-")
    .slice(0, 120);
}

function graphId(prefix, value) {
  return `${prefix}:${crypto
    .createHash("sha1")
    .update(String(value))
    .digest("hex")
    .slice(0, 12)}`;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findCodeGraph(home) {
  const candidates = [
    path.join(home, ".local", "bin", "codegraph"),
    "/opt/homebrew/bin/codegraph",
    "/usr/local/bin/codegraph"
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("未安装 CodeGraph");
}

async function run(binary, args, options = {}) {
  const result = await execFileAsync(binary, args, {
    cwd: options.cwd,
    timeout: options.timeout || 180000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      NO_COLOR: "1",
      GIT_TERMINAL_PROMPT: "0"
    }
  });
  return result.stdout.trim();
}

async function runJson(binary, args, options) {
  const output = await run(binary, args, options);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`CodeGraph 返回无效 JSON: ${output.slice(0, 300)}`);
  }
}

function queryRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["results", "nodes", "matches", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function symbolFromRow(row) {
  const symbol = row.node || row.symbol || row;
  const name =
    symbol.qualifiedName ||
    symbol.qualified_name ||
    symbol.name ||
    row.name ||
    "未命名符号";
  const file =
    symbol.filePath ||
    symbol.file_path ||
    symbol.path ||
    row.filePath ||
    row.path ||
    "";
  const line =
    symbol.startLine ||
    symbol.start_line ||
    symbol.line ||
    row.startLine ||
    row.line ||
    0;
  return {
    rawId: symbol.id || `${file}:${line}:${name}`,
    name,
    file,
    line: Number(line) || 0,
    kind: symbol.kind || symbol.type || "Symbol",
    score: Number(row.score || symbol.score || 0)
  };
}

function selectCandidate(candidates) {
  return candidates.find(
    (candidate) =>
      candidate.type === "repository" &&
      candidate.url?.startsWith("https://github.com/") &&
      candidate.clone_url?.startsWith("https://github.com/") &&
      !candidate.license_blocked &&
      ALLOWED_LICENSES.has(candidate.license) &&
      Number(candidate.score) >= 65
  );
}

async function generateCodeGraph(options) {
  const candidate = selectCandidate(options.candidates || []);
  if (!candidate) {
    return {
      status: "skipped",
      reason: "没有通过许可证和最低匹配分门禁的 GitHub 候选"
    };
  }

  const binary = await findCodeGraph(options.home);
  const version = await run(binary, ["--version"], { timeout: 5000 });
  const sandbox = path.join(
    options.runDirectory,
    "tech-intelligence",
    "codegraph",
    safeName(candidate.title)
  );
  const repository = path.join(sandbox, "repository");
  const queriesDirectory = path.join(sandbox, "queries");
  await fs.mkdir(queriesDirectory, { recursive: true });
  await options.onProgress?.("cloning", 15, `隔离浅克隆 ${candidate.title}`);

  if (!(await exists(path.join(repository, ".git")))) {
    await fs.mkdir(path.dirname(repository), { recursive: true });
    await run(
      "/usr/bin/git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        candidate.clone_url,
        repository
      ],
      { timeout: 180000 }
    );
  }
  const commit = await run(
    "/usr/bin/git",
    ["-C", repository, "rev-parse", "HEAD"],
    { timeout: 10000 }
  );

  await options.onProgress?.(
    "indexing",
    40,
    "CodeGraph 正在解析文件、符号与调用关系"
  );
  await run(
    binary,
    [(await exists(path.join(repository, ".codegraph"))) ? "index" : "init", repository],
    { timeout: 300000 }
  );
  const status = await runJson(
    binary,
    ["status", repository, "--json"],
    { timeout: 30000 }
  );
  const files = await runJson(
    binary,
    [
      "files",
      "-p",
      repository,
      "--format",
      "flat",
      "--max-depth",
      "5",
      "--json"
    ],
    { timeout: 30000 }
  );
  await fs.writeFile(
    path.join(queriesDirectory, "status.json"),
    `${JSON.stringify(status, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(queriesDirectory, "files.json"),
    `${JSON.stringify(files, null, 2)}\n`
  );

  await options.onProgress?.(
    "querying",
    65,
    "正在将需求能力映射到代码符号"
  );
  const terms = [...new Set(candidate.matched_capabilities || [])]
    .filter((term) => String(term).trim().length >= 2)
    .slice(0, 6);
  const nodes = [];
  const edges = [];
  const repositoryId = graphId("repository", candidate.title);
  nodes.push({
    data: {
      id: repositoryId,
      label: candidate.title,
      kind: "Repository",
      layer: 2,
      detail: `${candidate.license} · ${commit.slice(0, 10)}`,
      score: candidate.score
    }
  });

  let coveredCapabilities = 0;
  const seenSymbols = new Set();
  const queryEvidence = [];
  for (const [termIndex, term] of terms.entries()) {
    const capabilityId = graphId("capability", term);
    nodes.push({
      data: {
        id: capabilityId,
        label: term,
        kind: "Capability",
        layer: 1,
        detail: "需求与候选匹配能力"
      }
    });
    edges.push({
      data: {
        id: graphId("edge", `${capabilityId}:${repositoryId}`),
        source: capabilityId,
        target: repositoryId,
        type: "SATISFIED_BY",
        confidence: candidate.score / 100
      }
    });

    let payload;
    try {
      payload = await runJson(
        binary,
        ["query", term, "-p", repository, "-l", "10", "--json"],
        { timeout: 30000 }
      );
    } catch (error) {
      payload = { error: error.message, results: [] };
    }
    await fs.writeFile(
      path.join(queriesDirectory, `capability-${termIndex}.json`),
      `${JSON.stringify(payload, null, 2)}\n`
    );
    const rows = queryRows(payload);
    if (rows.length > 0) coveredCapabilities += 1;
    queryEvidence.push({ term, count: rows.length });

    for (const row of rows.slice(0, 4)) {
      const symbol = symbolFromRow(row);
      const symbolId = graphId("symbol", symbol.rawId);
      if (!seenSymbols.has(symbolId)) {
        seenSymbols.add(symbolId);
        nodes.push({
          data: {
            id: symbolId,
            label: symbol.name,
            kind: "Symbol",
            layer: 3,
            detail: `${symbol.file}:${symbol.line}`,
            file: symbol.file,
            line: symbol.line,
            symbolKind: symbol.kind
          }
        });
      }
      edges.push({
        data: {
          id: graphId("edge", `${capabilityId}:${symbolId}`),
          source: capabilityId,
          target: symbolId,
          type: "IMPLEMENTED_IN",
          confidence: symbol.score > 0 ? Math.min(1, symbol.score / 12) : 0.65,
          evidence: {
            command: `codegraph query "${term}" --json`,
            commit,
            file: symbol.file,
            line: symbol.line
          }
        }
      });
    }
  }

  const coverageRatio =
    terms.length > 0 ? coveredCapabilities / terms.length : 0;
  const verifiedFitScore = Math.min(
    95,
    Math.round(candidate.score * 0.8 + coverageRatio * 20)
  );
  const evidence = {
    schemaVersion: "1.0",
    status: "completed",
    engine: { name: "CodeGraph", version },
    repository: {
      fullName: candidate.title,
      url: candidate.url,
      commit,
      license: candidate.license,
      sandbox: repository
    },
    discoveryFitScore: candidate.score,
    verifiedFitScore,
    scoreDelta: verifiedFitScore - candidate.score,
    coverage: {
      matchedCapabilities: coveredCapabilities,
      totalCapabilities: terms.length,
      ratio: coverageRatio
    },
    metrics: status,
    fileInventory: files,
    nodes,
    edges,
    queries: queryEvidence,
    generatedAt: new Date().toISOString(),
    safety: {
      repositoryCodeExecuted: false,
      installScriptsExecuted: false,
      indexLocalOnly: true
    }
  };
  const evidencePath = path.join(
    options.runDirectory,
    "tech-intelligence",
    "graph-evidence.json"
  );
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await options.onProgress?.(
    "completed",
    100,
    `代码图谱完成：${nodes.length} 个节点，${edges.length} 条关系`
  );
  return { status: "completed", evidence, evidencePath };
}

module.exports = {
  ALLOWED_LICENSES,
  generateCodeGraph,
  queryRows,
  selectCandidate,
  symbolFromRow
};
