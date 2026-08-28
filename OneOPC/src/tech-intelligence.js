const fs = require("node:fs/promises");
const path = require("node:path");

const DOMAIN_EXPANSIONS = [
  {
    pattern: /(设备|检修|维修|维护|工单|巡检|故障)/i,
    terms: [
      "work order",
      "maintenance",
      "cmms",
      "ticket",
      "workflow",
      "state machine",
      "工单",
      "工作流",
      "设备",
      "检修"
    ]
  },
  {
    pattern: /(审批|流程|状态|流转)/i,
    terms: ["workflow", "approval", "state machine", "process", "流程", "审批"]
  },
  {
    pattern: /(搜索|检索|筛选|查询)/i,
    terms: ["search", "filter", "query", "retrieval", "搜索", "筛选"]
  },
  {
    pattern: /(知识库|问答|文档|rag)/i,
    terms: ["rag", "retrieval", "knowledge base", "embedding", "vector"]
  },
  {
    pattern: /(智能体|agent|自动化)/i,
    terms: ["agent", "workflow", "automation", "tool use", "mcp"]
  },
  {
    pattern: /(语音|音频|转写)/i,
    terms: ["speech", "audio", "transcription", "voice"]
  },
  {
    pattern: /(图表|看板|统计|报表)/i,
    terms: ["dashboard", "chart", "analytics", "visualization", "看板"]
  }
];

const STOP_WORDS = new Set([
  "需求",
  "说明书",
  "管理",
  "系统",
  "功能",
  "项目",
  "应用",
  "平台",
  "the",
  "and",
  "for",
  "with"
]);

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = cleanText(text).toLowerCase();
  const english = normalized.match(/[a-z][a-z0-9.+#_-]{2,}/g) || [];
  const chineseChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  return [...new Set([...english, ...chineseChunks])].filter(
    (term) => !STOP_WORDS.has(term)
  );
}

function buildQueryProfile(run) {
  const sourceText = [run.title, run.input?.name, run.input?.preview]
    .filter(Boolean)
    .join(" ");
  const expanded = DOMAIN_EXPANSIONS.filter((entry) =>
    entry.pattern.test(sourceText)
  ).flatMap((entry) => entry.terms);
  const terms = [...new Set([...expanded, ...tokenize(sourceText)])].slice(0, 40);

  return {
    schema_version: "1.0",
    run_id: run.id,
    generated_at: new Date().toISOString(),
    source: {
      title: run.title,
      input_name: run.input?.name || ""
    },
    capabilities: terms,
    delivery_targets: ["local-application"],
    constraints: {
      external_data_upload: false,
      execution_of_candidate_code: false
    }
  };
}

async function readRecentReports(reportRoot, days = 7) {
  let entries;
  try {
    entries = await fs.readdir(reportRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const reports = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(reportRoot, entry.name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) continue;
      const report = JSON.parse(await fs.readFile(filePath, "utf8"));
      reports.push({ filePath, stat, report });
    } catch {
      // A corrupt daily report is isolated and does not block other reports.
    }
  }

  return reports.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

function collectItems(reports) {
  const collected = [];
  for (const { filePath, report } of reports) {
    const groups = [
      ...(Array.isArray(report.items) ? [report.items] : []),
      ...(Array.isArray(report.source_top10)
        ? report.source_top10.map((group) => group.items || [])
        : []),
      ...(Array.isArray(report.news_boards)
        ? report.news_boards.map((board) => board.items || [])
        : [])
    ];
    for (const items of groups) {
      for (const item of items) {
        if (!item || !item.title) continue;
        collected.push({
          ...item,
          report_file: filePath,
          report_generated_at: report.generated_at || null
        });
      }
    }
  }
  return collected;
}

function githubLinks(item) {
  const text = `${item.url || ""} ${item.summary || ""}`;
  return [
    ...new Set(
      (text.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g) ||
        []).map((url) => url.replace(/[),.;]+$/, ""))
    )
  ];
}

function normalizeCandidates(items) {
  const candidates = [];
  for (const item of items) {
    const links = githubLinks(item);
    if (links.length > 0) {
      for (const url of links) {
        candidates.push({
          ...item,
          url,
          canonical_id: url.replace("https://", ""),
          type: "repository",
          discovered_via: item.source
        });
      }
      continue;
    }

    if (
      item.source === "Hugging Face" ||
      /huggingface\.co\/[^/]+\/[^/]+/.test(item.url || "")
    ) {
      candidates.push({
        ...item,
        canonical_id: String(item.url || item.title),
        type: "model",
        discovered_via: item.source
      });
    }
  }
  return candidates;
}

function scoreCandidate(candidate, profile) {
  const searchable = cleanText(
    [
      candidate.title,
      candidate.summary,
      candidate.source,
      candidate.analysis?.positioning,
      candidate.analysis?.highlight,
      ...(candidate.analysis?.core_features || [])
    ]
      .filter(Boolean)
      .join(" ")
  ).toLowerCase();
  const matches = profile.capabilities.filter((term) =>
    searchable.includes(term.toLowerCase())
  );
  const strongMatches = matches.filter((term) => term.length >= 4);
  const directRepository = candidate.type === "repository";
  const reportScore = Number(candidate.score || 0);
  const totalStars = Number(candidate.total_stars || 0);
  const relevance = Math.min(60, matches.length * 5 + strongMatches.length * 4);
  const evidenceQuality =
    (directRepository ? 18 : 8) +
    (candidate.summary ? 4 : 0) +
    (candidate.evidence ? 3 : 0);
  const momentum = Math.min(
    10,
    reportScore / 20 + Math.log10(totalStars + 1) * 1.5
  );
  return {
    score: Math.round(Math.min(100, relevance + evidenceQuality + momentum)),
    matches
  };
}

function rankCandidates(items, profile, limit) {
  const unique = new Map();
  for (const candidate of normalizeCandidates(items)) {
    const { score, matches } = scoreCandidate(candidate, profile);
    if (matches.length === 0 || score < 24) continue;
    const row = {
      canonical_id: candidate.canonical_id,
      type: candidate.type,
      title: cleanText(candidate.title),
      url: candidate.url,
      summary: cleanText(candidate.summary).slice(0, 480),
      discovered_via: candidate.discovered_via,
      published_at: candidate.published_at || null,
      heat_evidence: cleanText(candidate.evidence).slice(0, 240),
      total_stars: candidate.total_stars || null,
      score,
      matched_capabilities: matches.slice(0, 8),
      decision: "reference",
      verification: {
        source: "cached-report",
        repository_metadata: "not_checked",
        license: "not_checked",
        build: "not_run",
        demo: "not_run"
      },
      risks: [
        "Phase A 仅完成缓存召回，采用前仍需验证许可证、维护状态与可运行性"
      ],
      report_file: candidate.report_file
    };
    const previous = unique.get(row.canonical_id);
    if (!previous || row.score > previous.score) {
      unique.set(row.canonical_id, row);
    }
  }
  return [...unique.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function analyzeTechnology(options) {
  const startedAt = new Date().toISOString();
  const profile = buildQueryProfile(options.run);
  const reports = await readRecentReports(
    options.reportRoot,
    options.lookbackDays || 7
  );
  const items = collectItems(reports);
  const candidates = rankCandidates(
    items,
    profile,
    options.maxCandidates || 5
  );
  const sourceStatuses = reports.flatMap(({ report }) =>
    Array.isArray(report.source_status) ? report.source_status : []
  );
  const sourceCoverage = new Map();
  for (const status of sourceStatuses) {
    const current = sourceCoverage.get(status.source);
    if (!current || current.status !== "ok") {
      sourceCoverage.set(status.source, status);
    }
  }

  return {
    schema_version: "1.0",
    query_id: `tiq_${options.run.id}_${Date.now()}`,
    run_id: options.run.id,
    mode: options.mode,
    status:
      reports.length === 0
        ? "unavailable"
        : candidates.length > 0
          ? "completed"
          : "no_match",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    profile,
    report_coverage: {
      reports: reports.length,
      newest_report: reports[0]?.filePath || null,
      raw_items: items.length,
      sources: [...sourceCoverage.values()]
    },
    funnel: {
      collected: items.length,
      repository_or_model_candidates: normalizeCandidates(items).length,
      matched: candidates.length,
      verified: 0
    },
    candidates,
    recommendation: {
      strategy:
        candidates.length > 0 ? "reference-before-build" : "build-from-baseline",
      summary:
        candidates.length > 0
          ? `发现 ${candidates.length} 个可供方案设计参考的开源候选；Phase A 不会自动采用或执行候选代码。`
          : "本地技术情报缓存未发现足够相关的开源候选，继续使用项目基线方案。"
    }
  };
}

module.exports = {
  analyzeTechnology,
  buildQueryProfile,
  rankCandidates,
  readRecentReports
};
