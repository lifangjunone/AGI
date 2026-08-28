const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const PROVIDER_BASE = "http://127.0.0.1:43128";
const EXPLORATION_BUNDLE_ID = "com.local.technology-exploration";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function atomicWriteJson(targetPath, value) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.tmp`;
  await fs.writeFile(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporary, targetPath);
}

function requestJson(method, route, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const request = http.request(
      `${PROVIDER_BASE}${route}`,
      {
        method,
        timeout: timeoutMs,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": payload.length
            }
          : {}
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = text ? JSON.parse(text) : {};
          } catch {
            reject(new Error(`Provider returned invalid JSON: ${text}`));
            return;
          }
          if ((response.statusCode || 500) >= 400) {
            reject(
              new Error(
                `Provider HTTP ${response.statusCode}: ${
                  parsed.error || text || "unknown error"
                }`
              )
            );
            return;
          }
          resolve(parsed);
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Provider timeout")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function providerOnline() {
  try {
    const health = await requestJson("GET", "/v1/health", null, 1800);
    return health.status === "ok";
  } catch {
    return false;
  }
}

async function openExploration(background) {
  const args = [];
  if (background) args.push("-gj");
  args.push(
    "-b",
    EXPLORATION_BUNDLE_ID,
    "--args",
    "--show-latest",
    "--open-match"
  );
  await execFileAsync("/usr/bin/open", args, { timeout: 5000 });
}

async function ensureProvider() {
  if (await providerOnline()) return;
  await openExploration(true);
  for (let index = 0; index < 14; index += 1) {
    await delay(500);
    if (await providerOnline()) return;
  }
  throw new Error("Technology Exploration Provider 未启动");
}

function sidecarPath(options) {
  return options.isPackaged
    ? path.join(options.resourcesPath, "delivery-computer-use")
    : path.join(options.projectRoot, "resources", "delivery-computer-use");
}

function callSidecar(binary, method, params = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    const id = crypto.randomUUID();
    const output = [];
    const errors = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Computer Use ${method} timeout`));
    }, 8000);
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const lines = Buffer.concat(output)
        .toString("utf8")
        .split("\n")
        .filter(Boolean);
      const response = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .find((item) => item?.id === id);
      if (!response) {
        reject(
          new Error(
            `Computer Use returned no response: ${Buffer.concat(errors).toString(
              "utf8"
            )}`
          )
        );
        return;
      }
      if (!response.ok) {
        const error = new Error(response.error?.message || `${method} failed`);
        error.code = response.error?.code;
        reject(error);
        return;
      }
      resolve(response.result || {});
    });
    child.stdin.end(`${JSON.stringify({ id, method, params })}\n`);
  });
}

async function readJson(targetPath) {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function waitForJob(jobDirectory, timeoutMs, onProgress) {
  const startedAt = Date.now();
  let lastPhase;
  while (Date.now() - startedAt < timeoutMs) {
    const result = await readJson(path.join(jobDirectory, "result.json"));
    if (result?.state === "completed" || result?.state === "failed") {
      return result;
    }
    const progress = await readJson(path.join(jobDirectory, "progress.json"));
    if (progress?.phase && progress.phase !== lastPhase) {
      lastPhase = progress.phase;
      await onProgress?.(progress);
    }
    await delay(500);
  }
  const error = new Error("Technology Exploration 超过软时限");
  error.code = "SOFT_TIMEOUT";
  throw error;
}

async function startProvider(payload) {
  await ensureProvider();
  await requestJson("POST", "/v1/advisories", payload, 8000);
}

function requirementProjectPayload(payload) {
  const profile = payload.requirementProfile || {};
  const summary = String(profile.summary || "").trim();
  const capabilities = profile.capabilities || [];
  const projectSummary =
    summary.length >= 8
      ? summary
      : `${summary || capabilities.join("、")} 的技术与开源实现匹配`;
  return {
    name:
      summary.slice(0, 80) ||
      String(capabilities[0] || "OneOPC 需求匹配").slice(0, 80),
    businessDomain: profile.businessDomain || "通用业务",
    summary: projectSummary,
    capabilities,
    status: "active"
  };
}

async function upsertRequirementProject(payload) {
  await ensureProvider();
  const projectPayload = requirementProjectPayload(payload);
  const listing = await requestJson("GET", "/v1/projects", null, 5000);
  const existing = (listing.projects || []).find(
    (project) => project.name === projectPayload.name
  );
  if (existing?.id) {
    return requestJson(
      "PUT",
      `/v1/projects/${encodeURIComponent(existing.id)}`,
      projectPayload,
      8000
    );
  }
  return requestJson("POST", "/v1/projects", projectPayload, 8000);
}

async function waitForProjectWorkbench(binary, payload, evidence) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = await callSidecar(binary, "ui.snapshot", {
      bundleId: EXPLORATION_BUNDLE_ID
    });
    const ready = snapshot.nodes?.includes("立即匹配") || false;
    evidence.push({
      at: new Date().toISOString(),
      action: "ui.snapshot",
      attempt: attempt + 1,
      result: {
        nodeCount: snapshot.nodeCount,
        containsRequirement:
          snapshot.nodes?.includes(payload.requirementProfile.summary) || false,
        containsStart: ready
      }
    });
    if (ready) return snapshot;
    await delay(300);
  }
  throw new Error("Technology Exploration 项目中心的“立即匹配”控件不可访问");
}

async function mirrorProjectJob(
  projectId,
  payload,
  jobDirectory,
  timeoutMs,
  onProgress,
  evidence
) {
  const startedAt = Date.now();
  let lastPhase;
  while (Date.now() - startedAt < timeoutMs) {
    const response = await requestJson(
      "GET",
      `/v1/projects/${encodeURIComponent(projectId)}`,
      null,
      5000
    );
    const project = response.project || {};
    const phase = project.scanStatus || "queued";
    if (phase !== lastPhase) {
      lastPhase = phase;
      const progress = {
        jobId: payload.jobId,
        state: phase === "failed" ? "failed" : "running",
        phase,
        percent: phase === "running" ? 55 : phase === "completed" ? 100 : 10,
        message:
          project.scanPhase ||
          (phase === "completed" ? "需求项目匹配完成" : "等待需求项目扫描"),
        completed: phase === "completed",
        updatedAt: new Date().toISOString()
      };
      await atomicWriteJson(path.join(jobDirectory, "progress.json"), progress);
      await onProgress?.(progress);
    }
    if (phase === "completed" && response.result) {
      const result = {
        ...response.result,
        jobId: payload.jobId,
        projectId,
        state: "completed",
        completed: true
      };
      await atomicWriteJson(path.join(jobDirectory, "result.json"), result);
      evidence.push({
        at: new Date().toISOString(),
        action: "project.scan.completed",
        projectId,
        candidateCount: result.candidates?.length || 0
      });
      return result;
    }
    if (phase === "failed") {
      throw new Error(project.scanError || "Technology Exploration 项目扫描失败");
    }
    await delay(500);
  }
  const error = new Error("Technology Exploration 项目扫描超过软时限");
  error.code = "SOFT_TIMEOUT";
  throw error;
}

async function startComputerUse(payload, options, evidence) {
  const binary = sidecarPath(options);
  const project = await upsertRequirementProject(payload);
  evidence.push({
    at: new Date().toISOString(),
    action: "project.upsert",
    projectId: project.id,
    projectName: project.name
  });
  const permission = await callSidecar(binary, "permission.check");
  evidence.push({
    at: new Date().toISOString(),
    action: "permission.check",
    result: permission
  });
  if (permission.accessibility !== "granted") {
    const requested = await callSidecar(binary, "permission.request");
    evidence.push({
      at: new Date().toISOString(),
      action: "permission.request",
      result: requested
    });
    if (requested.accessibility !== "granted") {
      const error = new Error("Computer Use 缺少 macOS 辅助功能权限");
      error.code = "accessibility_missing";
      throw error;
    }
  }

  await openExploration(false);
  await delay(900);
  const focused = await callSidecar(binary, "app.focus", {
    bundleId: EXPLORATION_BUNDLE_ID
  });
  evidence.push({
    at: new Date().toISOString(),
    action: "app.focus",
    result: focused
  });
  const mode = await callSidecar(binary, "ui.press", {
    bundleId: EXPLORATION_BUNDLE_ID,
    label: "需求匹配"
  });
  evidence.push({
    at: new Date().toISOString(),
    action: "ui.press",
    target: "需求匹配",
    result: mode
  });
  await delay(400);
  await waitForProjectWorkbench(binary, payload, evidence);
  const start = await callSidecar(binary, "ui.press", {
    bundleId: EXPLORATION_BUNDLE_ID,
    label: "立即匹配"
  });
  evidence.push({
    at: new Date().toISOString(),
    action: "ui.press",
    target: "立即匹配",
    result: start
  });
  if (!String(start.method || "").startsWith("AX")) {
    throw new Error("Computer Use 未通过辅助功能控件触发任务");
  }
  return project.id;
}

function normalizeCandidate(candidate) {
  const fullName = candidate.fullName || candidate.full_name || "";
  const fitScore = candidate.fitScore ?? candidate.fit_score ?? 0;
  const matchedTerms =
    candidate.matchedTerms || candidate.matched_terms || [];
  const licenseBlocked = Boolean(
    candidate.licenseBlocked ?? candidate.license_blocked
  );
  return {
    canonical_id: `github.com/${fullName}`,
    type: "repository",
    title: fullName,
    url: candidate.url,
    clone_url: candidate.cloneUrl || candidate.clone_url,
    summary: candidate.description || "",
    discovered_via:
      candidate.sourceSignals?.[0]?.source || "Technology Exploration",
    published_at: candidate.updatedAt || null,
    heat_evidence: candidate.sourceSignals?.[0]?.evidence || "",
    total_stars: candidate.stars || 0,
    score: fitScore,
    discovery_fit_score: fitScore,
    matched_capabilities: matchedTerms,
    decision: licenseBlocked
      ? "reject"
      : candidate.verdict === "小范围试用"
        ? "trial"
        : "reference",
    license: candidate.license || "待核实",
    license_blocked: licenseBlocked,
    coverage_percent: candidate.coveragePercent ?? null,
    confidence_label: candidate.confidenceLabel || null,
    plain_description: candidate.plainDescription || null,
    plain_explanation: candidate.plainExplanation || null,
    adoption_advice: candidate.adoptionAdvice || null,
    implementation_plan: candidate.implementationPlan || [],
    risk_notes: candidate.riskNotes || [],
    source_signals: candidate.sourceSignals || [],
    verification: {
      source: "technology-exploration",
      repository_metadata: "checked",
      license:
        candidate.license && candidate.license !== "待核实"
          ? "checked"
          : "not_checked",
      build: "not_run",
      demo: "not_run"
    },
    breakdown: candidate.breakdown || {},
    risks: [
      ...(candidate.riskNotes || []),
      ...(licenseBlocked
        ? ["许可证策略阻断"]
        : ["尚未执行 CodeGraph 与沙箱运行验证"])
    ]
  };
}

function normalizeResult(result, context) {
  const candidates = (result.candidates || []).map(normalizeCandidate);
  return {
    schema_version: "1.0",
    query_id: result.jobId,
    run_id: context.runId,
    mode: context.mode,
    status: result.state === "completed" ? "completed" : "error",
    requested_transport: context.requestedTransport,
    actual_transport: context.actualTransport,
    fallback_used: context.fallbackUsed,
    fallback_reason: context.fallbackReason || null,
    started_at: context.startedAt,
    completed_at: result.generatedAt || new Date().toISOString(),
    profile: context.profile,
    report_coverage: {
      reports: 1,
      newest_report: "Technology Exploration Provider",
      raw_items: candidates.length,
      sources: result.sourceHealth || []
    },
    funnel: {
      collected: candidates.length,
      repository_or_model_candidates: candidates.length,
      matched: candidates.length,
      verified: 0
    },
    candidates,
    recommendation: {
      strategy: result.recommendation
        ? "reference-before-build"
        : "build-from-baseline",
      summary: result.summary || "Technology Exploration 分析完成"
    },
    provider_result: result
  };
}

async function executeAdvisory(options) {
  const jobId = `oneopc-${options.run.id}-${Date.now()}`;
  const jobDirectory = path.join(options.jobsRoot, jobId);
  const profile = options.profile;
  const payload = {
    schemaVersion: "1.0",
    jobId,
    requirementProfile: {
      businessDomain: "自动识别",
      summary: profile.source.title,
      capabilities: profile.capabilities,
      nonFunctionalRequirements: ["本地交付", "技术参考不阻塞主流程"],
      constraints: {
        forbiddenLicenses: ["AGPL-3.0"],
        externalDataUpload: false,
        demoTimeBudgetMinutes: 30
      }
    },
    depth: options.depth || "recommend",
    maxCandidates: options.maxCandidates || 5,
    requestedAt: new Date().toISOString()
  };
  await fs.mkdir(jobDirectory, { recursive: true });
  await atomicWriteJson(path.join(jobDirectory, "request.json"), payload);
  const transportEvidence = [];
  const requestedTransport = options.transport;
  const fallbackTransport = options.fallbackTransport;
  const startedAt = new Date().toISOString();
  let actualTransport = requestedTransport;
  let fallbackUsed = false;
  let fallbackReason = null;

  const runTransport = async (transport) => {
    if (transport === "computer_use") {
      const projectId = await startComputerUse(
        payload,
        options,
        transportEvidence
      );
      await mirrorProjectJob(
        projectId,
        payload,
        jobDirectory,
        options.softTimeoutMs,
        options.onProgress,
        transportEvidence
      );
      return;
    }
    await startProvider(payload);
  };

  try {
    await runTransport(requestedTransport);
  } catch (primaryError) {
    if (!fallbackTransport || fallbackTransport === requestedTransport) {
      throw primaryError;
    }
    fallbackUsed = true;
    fallbackReason = `${primaryError.code || "transport_error"}: ${
      primaryError.message
    }`;
    actualTransport = fallbackTransport;
    transportEvidence.push({
      at: new Date().toISOString(),
      action: "transport.fallback",
      from: requestedTransport,
      to: fallbackTransport,
      reason: fallbackReason
    });
    await runTransport(fallbackTransport);
  }

  const result = await waitForJob(
    jobDirectory,
    options.softTimeoutMs,
    options.onProgress
  );
  await atomicWriteJson(
    path.join(jobDirectory, "transport-evidence.json"),
    {
      jobId,
      requestedTransport,
      actualTransport,
      fallbackUsed,
      fallbackReason,
      events: transportEvidence
    }
  );
  if (result.jobId !== jobId) {
    throw new Error("Technology Exploration 返回了不匹配的 jobId");
  }
  if (result.state !== "completed") {
    throw new Error(result.message || "Technology Exploration 任务失败");
  }
  return {
    result: normalizeResult(result, {
      runId: options.run.id,
      mode: options.mode,
      profile,
      requestedTransport,
      actualTransport,
      fallbackUsed,
      fallbackReason,
      startedAt
    }),
    jobDirectory,
    transportEvidence
  };
}

module.exports = {
  callSidecar,
  executeAdvisory,
  normalizeResult,
  providerOnline,
  requirementProjectPayload,
  requestJson,
  sidecarPath
};
