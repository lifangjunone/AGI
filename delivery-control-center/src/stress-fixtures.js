const ROLE_IDS = ["conductor", "researcher", "builder", "verifier"];
const ROLE_NAMES = ["交付指挥官", "技术调研员", "系统开发员", "质量验证员"];
const PROJECT_NAMES = [
  "跨区域设备预测性维护与智能排班协同控制平台",
  "集团级供应链风险感知与应急调度系统",
  "多园区能源优化和碳排放决策中枢",
  "客户服务质量洞察与自动改进平台",
  "研发交付效能与软件资产治理中心",
  "现场安全事件闭环与合规证据平台"
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function fallbackRun() {
  const at = new Date("2026-08-18T00:00:00.000Z").toISOString();
  return {
    id: "STRESS-SEED",
    title: PROJECT_NAMES[0],
    status: "running",
    progress: 45,
    currentStage: 3,
    createdAt: at,
    updatedAt: at,
    input: { name: "压力验证需求.md", type: "text" },
    output: null,
    stages: ["需求理解", "业务确认", "方案设计", "开发", "测试", "交付", "部署", "验收"],
    events: [],
    coordination: { team: [], trajectory: [], ledger: [], decisions: [] },
    supervision: {
      state: "running",
      policy: { maxRetries: 5, maxRestarts: 3 },
      monitor: { scanCount: 120, lastScanAt: at },
      checkpoint: { stage: 3, stepId: "stage-3-build", sequence: 18 },
      recovery: { retryCount: 1, restartCount: 0 },
      tools: {},
      incidents: []
    }
  };
}

function stressEvents(runIndex, count) {
  const base = Date.parse("2026-08-18T00:00:00.000Z") - runIndex * 60000;
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(base + index * 1000).toISOString(),
    stage: index % 8,
    type: `stress.execution.${index % 12}`,
    summary: `第 ${index + 1} 条可追溯执行证据`,
    detail: `压力档案 ${runIndex + 1} 的确定性事件，用于验证密集日志和阶段筛选。`
  }));
}

function buildStressRuns(baseRuns = [], count = 72) {
  const seed = clone(baseRuns[0] || fallbackRun());
  return Array.from({ length: count }, (_, index) => {
    const projectIndex = index % 3;
    const versionIndex = Math.floor(index / 3) + 1;
    const createdAt = new Date(
      Date.parse("2026-08-18T08:00:00.000Z") - index * 3600000
    ).toISOString();
    const run = clone(seed);
    run.id = `STRESS-${String(index + 1).padStart(3, "0")}`;
    run.title = PROJECT_NAMES[projectIndex];
    run.status = index % 9 === 0 ? "failed" : index % 4 === 0 ? "completed" : "running";
    run.progress = run.status === "completed" ? 100 : (index * 13) % 96;
    run.currentStage = Math.min(7, Math.floor(run.progress / 13));
    run.createdAt = createdAt;
    run.updatedAt = createdAt;
    run.input = {
      ...(run.input || {}),
      name: `${PROJECT_NAMES[projectIndex]}-V${versionIndex}.md`,
      preview: "确定性压力测试需求，不写入真实项目目录。"
    };
    run.tools = {
      selection: { work: "trae-work", code: "trae-code" },
      work: [
        {
          id: "trae-work",
          name: "Trae Work",
          source: "application",
          path: "/Applications/Trae CN.app"
        }
      ],
      code: [
        {
          id: "trae-code",
          name: "Trae Code",
          source: "application",
          path: "/Applications/Trae CN.app"
        }
      ]
    };
    run.events = stressEvents(index, index === 0 ? 320 : 16);
    run.output =
      run.status === "completed"
        ? { url: `http://127.0.0.1:${4600 + index}` }
        : null;
    run.stressFixture = true;
    run.techIntelligence = {
      status: "completed",
      candidates: Array.from({ length: 6 }, (_, candidateIndex) => ({
        title: `开源候选 ${candidateIndex + 1} · ${PROJECT_NAMES[projectIndex]}`,
        score: 96 - candidateIndex * 4,
        url: `https://github.com/oneopc/stress-candidate-${candidateIndex + 1}`,
        license: candidateIndex === 5 ? "AGPL-3.0" : "MIT",
        matched_capabilities: ["项目协同", "异常恢复", "证据治理"],
        decision: candidateIndex === 0 ? "trial" : "reference",
        license_blocked: candidateIndex === 5
      })),
      recommendation: {
        summary: "压力档案技术参考已完成，不影响真实交付数据。"
      },
      funnel: {
        collected: 120,
        repository_or_model_candidates: 36,
        matched: 6,
        verified: 3
      },
      requestedTransport: "provider_api",
      actualTransport: "provider_api",
      graph:
        index % 2 === 0
          ? {
              evidence: {
                verifiedFitScore: 88,
                coverage: {
                  matchedCapabilities: 5,
                  totalCapabilities: 6,
                  ratio: 0.83
                },
                repository: {
                  fullName: "oneopc/stress-verified-graph",
                  commit: "0123456789abcdef",
                  license: "MIT"
                },
                nodes: [],
                edges: []
              }
            }
          : null
    };
    if (run.supervision) {
      run.supervision.state =
        run.status === "failed" ? "failed" : run.status === "completed" ? "completed" : "running";
      run.supervision.monitor = {
        ...(run.supervision.monitor || {}),
        scanCount: 200 + index,
        lastScanAt: createdAt
      };
      run.supervision.tools = {
        work: {
          name: "Trae Work",
          processState: "online",
          taskState: "running",
          capability: "task-aware",
          pid: 12000 + index
        },
        code: {
          name: "Trae Code",
          processState: index % 7 === 0 ? "offline" : "online",
          taskState: index % 7 === 0 ? "not-running" : "running",
          capability: "task-aware",
          pid: index % 7 === 0 ? null : 13000 + index
        }
      };
      run.supervision.incidents =
        index % 9 === 0
          ? [
              {
                summary: "执行工具心跳异常",
                action: "系统正在从最近检查点恢复",
                resolvedAt: null
              }
            ]
          : [];
    }
    return run;
  });
}

function buildStressEmployees(baseEmployees = [], count = 52) {
  return Array.from({ length: count }, (_, index) => {
    const roleIndex = index % ROLE_IDS.length;
    const seed =
      clone(baseEmployees.find((employee) => employee.roleId === ROLE_IDS[roleIndex])) ||
      {};
    return {
      ...seed,
      id: `STRESS-EMP-${String(index + 1).padStart(3, "0")}`,
      name: `${["领航", "探知", "构建", "守验"][roleIndex]}${index + 1}`,
      roleId: ROLE_IDS[roleIndex],
      roleName: ROLE_NAMES[roleIndex],
      department: `数字交付中心 ${Math.floor(index / 8) + 1} 组`,
      responsibility:
        "负责复杂项目的阶段执行、证据沉淀、异常恢复与上下游协同。",
      skills: ["项目协同", "异常恢复", "证据治理", `专业能力 ${index + 1}`],
      toolBinding: roleIndex < 2 ? "Trae Work" : "Trae Code",
      status: index % 11 === 0 ? "inactive" : "active",
      builtIn: false,
      stressFixture: true
    };
  });
}

module.exports = {
  buildStressEmployees,
  buildStressRuns
};
