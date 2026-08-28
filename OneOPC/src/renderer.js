const RENDER_LIMITS = Object.freeze({
  historyGroups: 8,
  historyVersions: 12,
  employees: 12,
  tasks: 10,
  radar: 15
});

const RENDER_BUDGETS_MS = Object.freeze({
  home: 24,
  history: 50,
  tasks: 50,
  employees: 50,
  radar: 40,
  workspace: 60
});

const state = {
  run: null,
  runs: [],
  employees: [],
  page: "home",
  selectedStage: 0,
  view: "overview",
  tools: null,
  toolScanning: false,
  intelligenceSettings: null,
  intelligencePending: false,
  intelligenceSettingsOpen: false,
  candidatesExpanded: false,
  graphMode: "executive",
  graphInstance: null,
  taskActionPending: null,
  employeeActionPending: new Set(),
  trajectoryIndex: 0,
  trajectoryPlaying: true,
  trajectoryTimer: null,
  executiveEmployeeStage: null,
  historyQuery: "",
  historyStatus: "all",
  expandedHistoryProjects: new Set(),
  historyVisibleGroups: RENDER_LIMITS.historyGroups,
  historyVersionLimits: new Map(),
  employeeVisibleCount: RENDER_LIMITS.employees,
  taskVisibleCount: RENDER_LIMITS.tasks,
  radarVisibleCount: RENDER_LIMITS.radar,
  pageScrollPositions: new Map(),
  toolchainExpanded: false,
  toastTimer: null,
  toastAction: null,
  confirmationResolver: null,
  graphReturnFocus: null,
  lastRunRefreshError: null,
  runRefreshPending: false,
  dataSignature: null,
  inputDrafts: { requirement: null, employee: null },
  inputDraftBases: {
    requirement: { title: "", description: "" },
    employee: null
  },
  interfaceDensity: "standard",
  startupNotice: null,
  inputDraftRecoveryNotice: null,
  performance: {
    renders: {},
    longTasks: []
  },
  booting: true,
  modules: {
    tools: { label: "本机执行工具", status: "pending", error: null },
    settings: { label: "技术增强设置", status: "pending", error: null },
    employees: { label: "数字员工资产", status: "pending", error: null },
    supervisor: { label: "任务监管器", status: "pending", error: null },
    runs: { label: "项目与版本", status: "pending", error: null }
  }
};

const elements = {
  homePage: document.querySelector("#homePage"),
  historyPage: document.querySelector("#historyPage"),
  taskPage: document.querySelector("#taskPage"),
  employeePage: document.querySelector("#employeePage"),
  radarPage: document.querySelector("#radarPage"),
  emptyState: document.querySelector("#emptyState"),
  workspace: document.querySelector("#workspace"),
  runIdentity: document.querySelector("#runIdentity"),
  viewToggle: document.querySelector("#viewToggle"),
  overviewView: document.querySelector("#overviewView"),
  detailView: document.querySelector("#detailView"),
  coordinationPanel: null,
  stageTrack: document.querySelector("#stageTrack"),
  detailStageList: document.querySelector("#detailStageList"),
  eventStream: document.querySelector("#eventStream"),
  rawLog: document.querySelector("#rawLog"),
  stageInspector: document.querySelector("#stageInspector"),
  workToolOptions: document.querySelector("#workToolOptions"),
  codeToolOptions: document.querySelector("#codeToolOptions"),
  toast: document.querySelector("#toast"),
  bootScreen: document.querySelector("#bootScreen"),
  systemHealthBanner: document.querySelector("#systemHealthBanner")
};

const modalReturnFocus = new WeakMap();
const inputDraftTimers = new Map();
const inputDraftWrites = new Map();
const inputDraftsReady = window.oneopc
  .readInputDrafts()
  .then((drafts) => {
    state.inputDrafts = drafts;
    if (drafts.recovery === "backup-restored") {
      state.inputDraftRecoveryNotice = {
        message: "草稿主文件异常，已从本机恢复副本找回完整内容",
        type: "success"
      };
    } else if (drafts.recovery === "redundancy-repaired") {
      state.inputDraftRecoveryNotice = {
        message: "草稿恢复副本异常，已自动重建",
        type: "success"
      };
    } else if (drafts.recovery === "unrecoverable") {
      state.inputDraftRecoveryNotice = {
        message: "草稿文件损坏且无可用副本，异常文件已隔离",
        type: "error"
      };
    }
    if (state.inputDraftRecoveryNotice) {
      announceAfterBoot(
        state.inputDraftRecoveryNotice.message,
        state.inputDraftRecoveryNotice.type
      );
    }
    return drafts;
  })
  .catch(() => state.inputDrafts);
const uiPreferencesReady = window.oneopc
  .getUIPreferences()
  .then((preferences) => {
    applyInterfaceDensity(preferences?.density);
    return preferences;
  })
  .catch(() => {
    applyInterfaceDensity("standard");
    return { density: "standard" };
  });
window.__oneopcPerformance = state.performance;

function announceAfterBoot(message, type) {
  if (state.booting) {
    state.startupNotice = { message, type };
    return;
  }
  notify(message, type);
}

function consumeInputDraftRecoveryNotice() {
  if (!state.inputDraftRecoveryNotice) return;
  notify(
    state.inputDraftRecoveryNotice.message,
    state.inputDraftRecoveryNotice.type
  );
  state.inputDraftRecoveryNotice = null;
}

function applyInterfaceDensity(density, { announce = false } = {}) {
  const comfortable = density === "comfortable";
  state.interfaceDensity = comfortable ? "comfortable" : "standard";
  document.body.classList.toggle("comfortable-density", comfortable);
  document.documentElement.dataset.interfaceDensity = state.interfaceDensity;
  if (announce) {
    notify(
      comfortable
        ? "已切换为舒适密度，辅助文字更易阅读"
        : "已切换为标准密度，显示更多内容"
    );
  }
}

function measureRender(name, operation) {
  const startedAt = performance.now();
  let result;
  let failure;
  try {
    result = operation();
  } catch (error) {
    failure = error;
  }
  const duration = performance.now() - startedAt;
  const current = state.performance.renders[name] || {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    failures: 0
  };
  current.count += 1;
  current.totalMs += duration;
  current.maxMs = Math.max(current.maxMs, duration);
  current.lastMs = duration;
  current.averageMs = current.totalMs / current.count;
  current.budgetMs = RENDER_BUDGETS_MS[name] || 50;
  current.withinBudget = duration <= current.budgetMs;
  if (failure) current.failures += 1;
  state.performance.renders[name] = current;
  if (!current.withinBudget) {
    console.warn(
      `OneOPC render budget exceeded: ${name} ${duration.toFixed(1)}ms / ${current.budgetMs}ms`
    );
  }
  if (failure) throw failure;
  return result;
}

if (typeof PerformanceObserver !== "undefined") {
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.performance.longTasks.push({
          at: entry.startTime,
          duration: entry.duration
        });
      }
      state.performance.longTasks =
        state.performance.longTasks.slice(-50);
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {
    // Chromium builds without Long Tasks support still retain render timing.
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function focusableElements(container) {
  return [
    ...container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  ].filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      !element.hidden &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  });
}

function openModal(dialog, initialFocusSelector) {
  const origin = document.activeElement;
  if (origin instanceof HTMLElement) {
    modalReturnFocus.set(dialog, origin);
  }
  dialog.showModal();
  window.requestAnimationFrame(() => {
    const target =
      dialog.querySelector(initialFocusSelector) ||
      focusableElements(dialog)[0] ||
      dialog;
    target.focus();
  });
}

function restoreModalFocus(dialog) {
  const origin = modalReturnFocus.get(dialog);
  modalReturnFocus.delete(dialog);
  if (!(origin instanceof HTMLElement) || !origin.isConnected) return;
  window.requestAnimationFrame(() => origin.focus({ preventScroll: true }));
}

function trapActiveModalFocus(event) {
  if (event.key !== "Tab") return false;
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (!dialog) return false;
  const focusable = focusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return true;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function focusPageHeading(page) {
  const pageElement = {
    home: elements.homePage,
    history: elements.historyPage,
    tasks: elements.taskPage,
    employees: elements.employeePage,
    radar: elements.radarPage
  }[page];
  const heading = pageElement?.querySelector("h1");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

function moduleStatusIcon(status) {
  return {
    pending: "○",
    loading: "·",
    ready: "✓",
    failed: "!"
  }[status] || "○";
}

function renderBootState() {
  const modules = Object.entries(state.modules);
  const completed = modules.filter(([, module]) =>
    ["ready", "failed"].includes(module.status)
  ).length;
  const failed = modules.filter(([, module]) => module.status === "failed");
  const progress = Math.round((completed / modules.length) * 100);
  document.querySelector("#bootProgress").style.width = `${progress}%`;
  document
    .querySelector("#bootProgressTrack")
    .setAttribute("aria-valuenow", String(progress));
  document.querySelector("#bootModuleList").innerHTML = modules
    .map(
      ([id, module]) => `
        <span class="${module.status}" data-boot-module="${id}">
          <i>${moduleStatusIcon(module.status)}</i>
          ${escapeHtml(module.label)}
        </span>`
    )
    .join("");
  document.querySelector("#bootTitle").textContent =
    completed === modules.length
      ? failed.length
        ? "基础能力已恢复"
        : "交付现场已就绪"
      : "正在恢复交付现场";
  document.querySelector("#bootSummary").textContent =
    completed === modules.length
      ? failed.length
        ? `${failed.length} 项能力可稍后重试，其他功能可正常使用`
        : "历史、员工与监管状态已恢复"
      : `已完成 ${completed} / ${modules.length} 项检查`;
}

function moduleErrorMessage(id) {
  return {
    tools: "无法读取本机应用与命令行工具，请确认应用目录可访问",
    settings: "技术增强设置暂时不可读，主交付流程不受影响",
    employees: "数字员工资产暂时不可读，现有档案不会被修改",
    supervisor: "任务监管器本次健康检查未完成，检查点仍已保留",
    runs: "本地项目与版本索引暂时不可读，交付文件仍安全保留"
  }[id] || "该能力暂时不可用，请稍后重试";
}

function setModuleStatus(id, status, error = null) {
  const module = state.modules[id];
  if (!module) return;
  module.status = status;
  module.error = error ? moduleErrorMessage(id) : null;
  if (error) {
    console.error(`OneOPC module ${id} failed:`, error);
  }
  if (status === "ready") {
    module.lastReadyAt = new Date().toISOString();
  }
  renderBootState();
  renderSystemHealth();
}

function failedModules() {
  return Object.entries(state.modules).filter(
    ([, module]) => module.status === "failed"
  );
}

function renderSystemHealth() {
  const failed = failedModules();
  elements.systemHealthBanner.hidden = state.booting || failed.length === 0;
  if (failed.length === 0) return;
  document.querySelector("#systemHealthSummary").textContent = failed
    .map(([, module]) => `${module.label}：${module.error || "加载失败"}`)
    .join(" · ");
}

function moduleFailureMarkup(id, title, detail) {
  const module = state.modules[id];
  return `
    <section class="module-failure" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <b>${escapeHtml(title)}</b>
        <p>${escapeHtml(module?.error || detail)}</p>
      </div>
      <button type="button" data-retry-module="${id}">重新加载</button>
    </section>`;
}

function bindModuleRetryButtons() {
  document.querySelectorAll("[data-retry-module]").forEach((button) => {
    button.addEventListener("click", () =>
      retryModules([button.dataset.retryModule])
    );
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function statusText(status) {
  return {
    ready: "等待执行",
    queued: "排队中",
    running: "执行中",
    completed: "已交付",
    failed: "失败",
    cancelled: "已终止"
  }[status] || "状态待确认";
}

function versionRuns(runs) {
  const groups = new Map();
  for (const run of [...runs].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  )) {
    const key = run.title || run.input?.name || "未命名项目";
    const versions = groups.get(key) || [];
    versions.push(run);
    groups.set(key, versions);
  }

  return runs.map((run) => {
    const key = run.title || run.input?.name || "未命名项目";
    const versions = groups.get(key);
    return {
      ...run,
      projectKey: key,
      version: versions.findIndex((candidate) => candidate.id === run.id) + 1,
      versionCount: versions.length
    };
  });
}

function runsDataSignature(runs) {
  return runs
    .map((run) =>
      [
        run.id,
        run.updatedAt,
        run.status,
        run.progress,
        run.currentStage,
        run.events?.length || 0,
        run.supervision?.state || "",
        run.supervision?.monitor?.lastScanAt || ""
      ].join(":")
    )
    .join("|");
}

function taskNeedsAttention(run) {
  const supervision = run?.supervision;
  return Boolean(
    supervision &&
      (["stalled", "failed"].includes(supervision.state) ||
        supervision.cancellation?.status === "pending_confirmation" ||
        supervision.incidents?.some((incident) => !incident.resolvedAt))
  );
}

function renderNavigationCounts() {
  if (state.modules.runs.status === "failed") {
    document.querySelector("#historyCount").textContent = "—";
    document.querySelector("#taskAlertCount").textContent = "—";
    return;
  }
  document.querySelector("#historyCount").textContent = state.runs.length;
  document.querySelector("#taskAlertCount").textContent =
    state.runs.filter(taskNeedsAttention).length;
}

function renderCurrentPage() {
  if (state.page === "home") measureRender("home", renderHome);
  if (state.page === "history") measureRender("history", renderHistory);
  if (state.page === "tasks") measureRender("tasks", renderTasks);
  if (state.page === "employees") measureRender("employees", renderEmployees);
  if (state.page === "radar") measureRender("radar", renderRadar);
  if (state.page === "workspace" && state.run) {
    measureRender("workspace", renderRun);
  }
}

function pageScrollKey(page) {
  return page === "workspace"
    ? `workspace:${state.run?.id || "none"}`
    : page;
}

function setPage(page) {
  const main = document.querySelector("main");
  if (state.page) {
    state.pageScrollPositions.set(
      pageScrollKey(state.page),
      main.scrollTop
    );
  }
  if (state.page !== page && page !== "workspace") {
    state.toolchainExpanded = false;
  }
  state.page = page;
  updateToolchainDensity();
  document.body.classList.toggle(
    "executive-mode",
    page === "workspace" && state.view === "overview"
  );
  document.body.classList.toggle(
    "developer-mode",
    page === "workspace" && state.view === "detail"
  );
  elements.homePage.hidden = page !== "home";
  elements.historyPage.hidden = page !== "history";
  elements.taskPage.hidden = page !== "tasks";
  elements.employeePage.hidden = page !== "employees";
  elements.radarPage.hidden = page !== "radar";
  elements.workspace.hidden = page !== "workspace";
  elements.emptyState.hidden = true;

  const inWorkspace = page === "workspace" && Boolean(state.run);
  elements.runIdentity.hidden = !inWorkspace;
  elements.viewToggle.hidden = !inWorkspace;
  document.querySelector("#headerOutputButton").hidden =
    !inWorkspace || !state.run?.output?.url;

  document.querySelectorAll(".app-nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  renderNavigationCounts();
  renderCurrentPage();
  main.scrollTop = state.pageScrollPositions.get(pageScrollKey(page)) || 0;
}

function updateToolchainDensity() {
  const compact =
    state.page !== "workspace" && !state.toolchainExpanded;
  document.body.classList.toggle("compact-toolchain", compact);
  const button = document.querySelector("#toolchainExpandButton");
  if (!button) return;
  button.hidden = state.page === "workspace";
  button.setAttribute("aria-expanded", String(!compact));
  button.setAttribute(
    "aria-label",
    compact ? "展开本机执行环境" : "收起本机执行环境"
  );
  button.title = compact ? "展开本机执行环境" : "收起本机执行环境";
}

function openRun(runId) {
  const run = state.runs.find((candidate) => candidate.id === runId);
  if (!run) return;
  state.run = run;
  state.selectedStage = run.currentStage || 0;
  state.executiveEmployeeStage = null;
  state.candidatesExpanded = false;
  state.intelligenceSettingsOpen = false;
  setView("overview");
  setPage("workspace");
}

function renderHome() {
  const runsFailed = state.modules.runs.status === "failed";
  const homePulse = document.querySelector("#homePulse");
  if (runsFailed) {
    ["homeProjectCount", "homeVersionCount", "homeRunningCount", "homeCompletedCount"]
      .forEach((id) => {
        document.querySelector(`#${id}`).textContent = "—";
      });
    document.querySelector("#historyCount").textContent = "—";
    document.querySelector("#recentRuns").innerHTML = moduleFailureMarkup(
      "runs",
      "无法恢复最近交付",
      "本地项目索引暂时不可读，现有交付文件不会被修改。"
    );
    document.querySelector("#latestOutput").innerHTML = moduleFailureMarkup(
      "runs",
      "无法确认最新可用系统",
      "恢复项目索引后即可继续打开此前交付的系统。"
    );
    homePulse.hidden = true;
    bindModuleRetryButtons();
    return;
  }

  const projectCount = new Set(state.runs.map((run) => run.projectKey)).size;
  document.querySelector("#homeProjectCount").textContent = projectCount;
  document.querySelector("#homeVersionCount").textContent = state.runs.length;
  document.querySelector("#homeRunningCount").textContent = state.runs.filter(
    (run) => run.status === "running" || run.status === "ready"
  ).length;
  document.querySelector("#homeCompletedCount").textContent = state.runs.filter(
    (run) => run.status === "completed"
  ).length;
  document.querySelector("#historyCount").textContent = state.runs.length;

  const recent = state.runs.slice(0, 4);
  document.querySelector("#recentRuns").innerHTML =
    recent.length === 0
      ? `<div class="latest-output-empty">暂无交付记录<br>导入需求文档开始第一次自动交付</div>`
      : recent
          .map(
            (run) => `
              <button class="recent-run" data-open-run="${escapeHtml(run.id)}">
                <span class="run-symbol">OP</span>
                <span>
                  <b>${escapeHtml(run.title)}</b>
                  <small>${escapeHtml(run.id)} · ${formatDateTime(run.updatedAt)}</small>
                </span>
                <span class="version-badge">V${run.version}</span>
                <span class="run-state ${escapeHtml(run.status)}">${statusText(run.status)}</span>
              </button>
            `
          )
          .join("");

  const latestOutput = state.runs.find(
    (run) => run.status === "completed" && run.output?.url
  );
  const acceptanceEvent = [...(latestOutput?.events || [])]
    .reverse()
    .find((event) => event.type === "acceptance.passed");
  const qualityEvent = [...(latestOutput?.events || [])]
    .reverse()
    .find((event) => event.type === "quality.gates.passed");
  document.querySelector("#latestOutput").innerHTML = latestOutput
    ? `
      <div class="latest-output-card">
        <div class="delivery-receipt-status">
          <i aria-hidden="true"></i>
          <span>
            <small>交付状态</small>
            <b>本地系统可直接使用</b>
          </span>
          <em>${latestOutput.output.status === "healthy" ? "服务健康" : "已部署"}</em>
        </div>
        <h3>${escapeHtml(latestOutput.title)}</h3>
        <dl class="delivery-receipt-facts">
          <div>
            <dt>部署地址</dt>
            <dd title="${escapeHtml(latestOutput.output.url)}">${escapeHtml(
              latestOutput.output.url
            )}</dd>
          </div>
          <div>
            <dt>交付版本</dt>
            <dd>V${latestOutput.version} · ${formatDateTime(
              latestOutput.output.deployedAt || latestOutput.updatedAt
            )}</dd>
          </div>
          <div>
            <dt>验收依据</dt>
            <dd>${escapeHtml(
              acceptanceEvent?.summary ||
                qualityEvent?.summary ||
                "交付证据已归档"
            )}</dd>
          </div>
        </dl>
        <div class="latest-output-actions">
          <button data-open-run="${escapeHtml(latestOutput.id)}">查看交付</button>
          <button class="open-latest" data-open-url="${escapeHtml(latestOutput.output.url)}">打开系统</button>
        </div>
      </div>
    `
    : `<div class="latest-output-empty">暂无可用系统<br>完成交付后将在这里直接打开</div>`;

  const supervised = state.runs.filter((run) => run.supervision);
  const attention = supervised.filter(taskNeedsAttention);
  const running = supervised.filter(
    (run) => run.supervision.state === "running"
  );
  const queued = supervised.filter((run) =>
    ["queued", "recovering"].includes(run.supervision.state)
  );
  const attentionRun = attention[0];
  const attentionIncident = attentionRun?.supervision?.incidents?.find(
    (incident) => !incident.resolvedAt
  );
  const runningRun = running[0];
  const queuedRun = queued[0];
  const stageText = (run) =>
    run?.stages?.[run.currentStage] || run?.stages?.[0] || "等待执行";
  const pulseItem = ({ tone, label, count, title, detail, runId, outputRun }) => `
    <button
      class="home-pulse-item ${tone}"
      ${
        runId
          ? `data-focus-task="${escapeHtml(runId)}"`
          : outputRun
            ? `data-open-run="${escapeHtml(outputRun)}"`
            : `data-open-task-center`
      }
    >
      <span>${label}<b>${count}</b></span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
      <em aria-hidden="true">→</em>
    </button>
  `;
  homePulse.hidden = state.runs.length === 0;
  document.querySelector("#homePulseGrid").innerHTML = state.runs.length
    ? [
        pulseItem({
          tone: attention.length ? "attention" : "clear",
          label: "需关注",
          count: attention.length,
          title: attentionRun?.title || "当前无需人工介入",
          detail:
            attentionIncident?.summary ||
            (attentionRun
              ? supervisionStateText(attentionRun.supervision.state)
              : "后台监管器会持续检查异常"),
          runId: attentionRun?.id
        }),
        pulseItem({
          tone: "active",
          label: "正在执行",
          count: running.length,
          title: runningRun?.title || "暂无执行中的任务",
          detail: runningRun
            ? `${stageText(runningRun)} · ${supervisionStateText(
                runningRun.supervision.state
              )}`
            : "新需求进入后将在这里显示",
          runId: runningRun?.id
        }),
        pulseItem({
          tone: "queued",
          label: "等待接管",
          count: queued.length,
          title: queuedRun?.title || "没有待接管任务",
          detail: queuedRun
            ? `${stageText(queuedRun)} · ${supervisionStateText(
                queuedRun.supervision.state
              )}`
            : "任务队列已处理完毕",
          runId: queuedRun?.id
        }),
        pulseItem({
          tone: "delivered",
          label: "最近交付",
          count: latestOutput ? 1 : 0,
          title: latestOutput?.title || "尚无可用系统",
          detail: latestOutput
            ? `V${latestOutput.version} · ${formatDateTime(
                latestOutput.output.deployedAt || latestOutput.updatedAt
              )}`
            : "完成验收后可直接打开",
          outputRun: latestOutput?.id
        })
      ].join("")
    : "";

  bindRunLinks();
  bindHomePulseLinks();
}

function focusSupervisedTask(runId) {
  const supervised = state.runs.filter((run) => run.supervision);
  const taskIndex = supervised.findIndex((run) => run.id === runId);
  if (taskIndex >= 0) {
    state.taskVisibleCount = Math.max(state.taskVisibleCount, taskIndex + 1);
  }
  setPage("tasks");
  const task = [...document.querySelectorAll("[data-task-run-id]")].find(
    (candidate) => candidate.dataset.taskRunId === runId
  );
  task?.scrollIntoView({
    block: "start",
    behavior: "auto"
  });
  task?.querySelector(".task-title")?.focus({ preventScroll: true });
}

function bindHomePulseLinks() {
  document.querySelectorAll("[data-focus-task]").forEach((button) => {
    button.addEventListener("click", () =>
      focusSupervisedTask(button.dataset.focusTask)
    );
  });
  document.querySelectorAll("[data-open-task-center]").forEach((button) => {
    button.addEventListener("click", () => setPage("tasks"));
  });
}

function captureTaskFocus() {
  if (state.page !== "tasks" || !(document.activeElement instanceof HTMLElement)) {
    return null;
  }
  const active = document.activeElement;
  const task = active.closest("[data-task-run-id]");
  if (!task) return null;
  const control = active.classList.contains("task-title")
    ? "title"
    : active.dataset.taskAction
      ? `action:${active.dataset.taskAction}`
      : active.dataset.openRun
        ? "evidence"
        : null;
  return control
    ? {
        runId: task.dataset.taskRunId,
        control,
        viewportTop: task.getBoundingClientRect().top
      }
    : null;
}

function restoreTaskFocus(token) {
  if (!token || state.page !== "tasks") return;
  const task = [...document.querySelectorAll("[data-task-run-id]")].find(
    (candidate) => candidate.dataset.taskRunId === token.runId
  );
  if (!task) return;
  const main = document.querySelector("main");
  main.scrollTop += task.getBoundingClientRect().top - token.viewportTop;
  const target =
    token.control === "title"
      ? task.querySelector(".task-title")
      : token.control === "evidence"
        ? task.querySelector(".task-actions [data-open-run]")
        : task.querySelector(
            `[data-task-action="${token.control.slice("action:".length)}"]`
          );
  (target || task.querySelector(".task-title"))?.focus({
    preventScroll: true
  });
}

function renderHistory() {
  const runsFailed = state.modules.runs.status === "failed";
  document.querySelector("#historySearch").disabled = runsFailed;
  document.querySelectorAll("[data-history-status]").forEach((button) => {
    button.disabled = runsFailed;
  });
  if (runsFailed) {
    document.querySelector("#historyGroups").innerHTML = moduleFailureMarkup(
      "runs",
      "交付历史恢复失败",
      "项目与版本索引暂时不可读。原始需求、运行证据和交付产物仍保留在本机。"
    );
    bindModuleRetryButtons();
    return;
  }

  const query = state.historyQuery.toLowerCase();
  const filtered = state.runs.filter((run) => {
    const matchesQuery =
      !query ||
      [run.title, run.id, run.input?.name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    const matchesStatus =
      state.historyStatus === "all" ||
      (state.historyStatus === "running"
        ? run.status === "running" || run.status === "ready"
        : run.status === state.historyStatus);
    return matchesQuery && matchesStatus;
  });

  const groups = new Map();
  for (const run of filtered) {
    const versions = groups.get(run.projectKey) || [];
    versions.push(run);
    groups.set(run.projectKey, versions);
  }

  const groupEntries = [...groups.entries()];
  const visibleGroupEntries = groupEntries.slice(
    0,
    state.historyVisibleGroups
  );
  document.querySelector("#historyGroups").innerHTML =
    groups.size === 0
      ? `<div class="history-empty panel">没有符合条件的历史版本</div>`
      : visibleGroupEntries
          .map(
            ([project, versions], groupIndex) => {
              const latest = versions[0];
              const expanded =
                Boolean(query) || state.expandedHistoryProjects.has(project);
              const versionLimit =
                state.historyVersionLimits.get(project) ||
                RENDER_LIMITS.historyVersions;
              const visibleVersions = versions.slice(0, versionLimit);
              const remainingVersions =
                versions.length - visibleVersions.length;
              return `
              <section class="history-project ${expanded ? "expanded" : "collapsed"}">
                <button
                  class="history-project-header"
                  data-history-project-index="${groupIndex}"
                  aria-expanded="${expanded}"
                  aria-controls="historyVersions${groupIndex}"
                >
                  <span class="history-disclosure" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
                  </span>
                  <span class="history-project-copy">
                    <b>${escapeHtml(project)}</b>
                    <small>${latest.versionCount} 个版本 · 最新 V${latest.version}</small>
                  </span>
                  <span class="history-project-latest">
                    <small>最近更新</small>
                    <b>${formatDateTime(latest.updatedAt)}</b>
                  </span>
                  <span class="run-state ${escapeHtml(latest.status)}">${statusText(latest.status)}</span>
                </button>
                <div
                  class="history-version-list"
                  id="historyVersions${groupIndex}"
                  ${expanded ? "" : "hidden"}
                >
                  ${
                    expanded
                      ? visibleVersions
                          .map(
                            (run) => `
                              <button class="version-row" data-open-run="${escapeHtml(run.id)}">
                                <span class="version-badge">V${run.version}</span>
                                <span>
                                  <b>${escapeHtml(run.input?.name || run.title)}</b>
                                  <small>${escapeHtml(run.id)}</small>
                                </span>
                                <span>
                                  <b>${formatDateTime(run.createdAt)}</b>
                                  <small>${run.events.length} 条执行证据</small>
                                </span>
                                <span class="version-progress">
                                  <span class="version-progress-track"><span style="width:${run.progress}%"></span></span>
                                  <em>${run.progress}%</em>
                                </span>
                                <span class="run-state ${escapeHtml(run.status)}">${statusText(run.status)}</span>
                              </button>
                            `
                          )
                          .join("") +
                        (remainingVersions > 0
                          ? `<button
                              class="progressive-load-button"
                              data-load-history-versions="${groupIndex}"
                            >继续显示 ${Math.min(
                              RENDER_LIMITS.historyVersions,
                              remainingVersions
                            )} 个版本 · 尚余 ${remainingVersions} 个</button>`
                          : "")
                      : ""
                  }
                </div>
              </section>
            `;
            }
          )
          .join("") +
        (groupEntries.length > visibleGroupEntries.length
          ? `<button class="progressive-load-button" data-load-history-groups>
              继续显示 ${Math.min(
                RENDER_LIMITS.historyGroups,
                groupEntries.length - visibleGroupEntries.length
              )} 个项目 · 尚余 ${
                groupEntries.length - visibleGroupEntries.length
              } 个
            </button>`
          : "");
  document.querySelectorAll("[data-history-project-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const [project] =
        groupEntries[Number(button.dataset.historyProjectIndex)] || [];
      if (!project) return;
      if (state.expandedHistoryProjects.has(project)) {
        state.expandedHistoryProjects.delete(project);
      } else {
        state.expandedHistoryProjects.add(project);
      }
      measureRender("history", renderHistory);
    });
  });
  document
    .querySelector("[data-load-history-groups]")
    ?.addEventListener("click", () => {
      state.historyVisibleGroups += RENDER_LIMITS.historyGroups;
      measureRender("history", renderHistory);
    });
  document
    .querySelectorAll("[data-load-history-versions]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const [project] =
          visibleGroupEntries[
            Number(button.dataset.loadHistoryVersions)
          ] || [];
        if (!project) return;
        const current =
          state.historyVersionLimits.get(project) ||
          RENDER_LIMITS.historyVersions;
        state.historyVersionLimits.set(
          project,
          current + RENDER_LIMITS.historyVersions
        );
        measureRender("history", renderHistory);
      });
    });
  bindRunLinks();
}

function supervisionStateText(value) {
  return {
    queued: "等待接管",
    running: "监管中",
    recovering: "恢复处理中",
    stalled: "任务卡住",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已终止"
  }[value] || "状态待确认";
}

function taskStateText(value) {
  return {
    starting: "恢复指令已提交",
    running: "正在执行本任务",
    waiting: "等待工具响应",
    completed: "任务已完成",
    unverified: "进程在线，任务待确认",
    "different-task": "正在执行其他任务",
    "not-running": "进程未运行"
  }[value] || "任务状态待确认";
}

function processStateText(value) {
  return {
    online: "进程在线",
    offline: "进程未运行"
  }[value] || "进程状态待确认";
}

function capabilityText(value) {
  return {
    "task-aware": "任务级控制",
    "process-control": "进程级控制",
    "process-observe": "仅进程监测",
    unavailable: "不可用"
  }[value] || "控制能力待确认";
}

function coordinatorStateText(value) {
  return {
    active: "执行中",
    recovering: "恢复中",
    queued: "待接管",
    standby: "待命",
    completed: "已完成",
    blocked: "已阻塞",
    cancelled: "已终止"
  }[value] || "协作状态待确认";
}

function technologyStatusText(value) {
  return {
    idle: "等待检索",
    pending: "等待检索",
    running: "检索中",
    completed: "已完成",
    failed: "检索失败",
    unavailable: "暂不可用"
  }[value] || "检索状态待确认";
}

function stopEvidenceText(value) {
  return {
    AXPress: "辅助功能已确认",
    AXPressStressFixture: "辅助功能压力验证",
    accessibility_unconfirmed: "辅助功能待确认",
    user_undo: "用户已撤销终止",
    stress_user_undo: "压力验证已撤销"
  }[value] || "停止证据待确认";
}

function recoveryReasonText(value) {
  return {
    tool_process_offline: "执行工具进程离线",
    task_heartbeat_timeout: "当前任务心跳超时",
    task_adapter_unavailable: "任务恢复适配器不可用",
    manual_retry: "用户已从检查点重试",
    cancel_undone: "任务终止已撤销"
  }[value] || (value ? "恢复执行异常，请查看事件证据" : "未触发恢复");
}

function coordinatorRoleName(value) {
  return {
    conductor: "交付指挥官",
    researcher: "技术调研员",
    builder: "系统开发员",
    verifier: "质量验证员",
    work: "交付指挥官",
    code: "系统开发员"
  }[value] || "交付系统";
}

function employeePortraitMarkup(employee) {
  return `
    <span class="employee-portrait ${escapeHtml(employee.roleId)}" aria-label="${escapeHtml(
      `${employee.employeeName || employee.name}数字人形象`
    )}">
      <span class="avatar-energy-field" aria-hidden="true">
        <i class="avatar-orbit outer"></i>
        <i class="avatar-orbit inner"></i>
        <i class="avatar-particle particle-one"></i>
        <i class="avatar-particle particle-two"></i>
        <i class="avatar-scan-line"></i>
      </span>
      <span class="digital-human">
        <span class="human-hair"></span><span class="human-ear left"></span><span class="human-ear right"></span>
        <span class="human-head">
          <i class="human-brow left"></i><i class="human-brow right"></i>
          <i class="human-eye left"></i><i class="human-eye right"></i>
          <i class="human-nose"></i><i class="human-mouth"></i><i class="human-glasses"></i>
        </span>
        <span class="human-neck"></span>
        <span class="human-body"><i class="human-collar left"></i><i class="human-collar right"></i><i class="human-badge"></i></span>
        <span class="human-prop"></span>
      </span>
      <i class="portrait-status"></i>
    </span>`;
}

function trajectorySteps(mission) {
  const trajectory = mission?.coordination?.trajectory || [];
  return trajectory.length > 0
    ? trajectory.slice(-8)
    : (mission?.coordination?.team || []).map((employee, index) => ({
        id: `waiting-${index}`,
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        roleId: employee.roleId,
        stage: employee.stages?.[0] || 0,
        summary: index === 0 ? "等待需求进入" : "等待上游员工交接",
        status: "waiting"
      }));
}

function activeTrajectoryStep(mission) {
  const visible = trajectorySteps(mission);
  state.trajectoryIndex = Math.min(state.trajectoryIndex, visible.length - 1);
  return visible[Math.max(0, state.trajectoryIndex)] || null;
}

function renderCoordination(mission) {
  if (!document.querySelector("#deliveryTeam")) return;
  const decisions = mission?.coordination?.decisions || [];

  document.querySelector("#decisionInboxCount").textContent = decisions.length;
  const team = mission?.coordination?.team || [];
  const onDuty = team.filter((member) =>
    ["active", "recovering", "queued"].includes(member.state)
  ).length;
  document.querySelector("#digitalEmployeeSummary").textContent = mission
    ? `${team.length} 名数字员工 · ${onDuty} 名在岗`
    : "4 名数字员工";
  document.querySelector("#coordinationSummary").textContent = mission
    ? `${mission.title} · 当前由 ${
        mission.coordination?.team
          ?.filter((member) => ["active", "recovering", "queued"].includes(member.state))
          .map((member) => member.name)
          .join("、") || "交付系统"
      } 接管`
    : "等待受管任务进入交付队列";

  document.querySelector("#deliveryTeam").innerHTML = mission
    ? team
        .map(
          (member, index) => `
            <article class="digital-employee ${escapeHtml(member.state)}">
              <div class="employee-handoff" aria-hidden="true">
                <span>${index === 0 ? "需求进入" : "接棒"}</span><i></i>
              </div>
              <header class="employee-hero">
                ${employeePortraitMarkup(member)}
                <div class="employee-identity">
                  <small>${escapeHtml(member.employeeId)} · ${escapeHtml(member.department)}</small>
                  <h3>${escapeHtml(member.employeeName)}</h3>
                  <b>${escapeHtml(member.name)}</b>
                  <p>${escapeHtml(member.responsibility)}</p>
                </div>
                <em>${escapeHtml(coordinatorStateText(member.state))}</em>
              </header>
              <label class="project-employee-selector">
                <span>项目选聘</span>
                <select data-team-role="${escapeHtml(member.roleId)}">
                  ${state.employees
                    .filter(
                      (employee) =>
                        employee.roleId === member.roleId &&
                        employee.status === "active"
                    )
                    .map(
                      (employee) => `<option value="${escapeHtml(employee.id)}" ${
                        employee.id === member.employeeId ? "selected" : ""
                      }>${escapeHtml(employee.name)} · ${escapeHtml(employee.id)}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <div class="employee-assignment">
                <span>当前负责</span>
                <b>${escapeHtml(member.assignment)}</b>
              </div>
              <div class="employee-workstation">
                <span>数字工位</span>
                <code>${escapeHtml(member.toolName || "未绑定工具")}</code>
                <i class="${escapeHtml(member.processState)}"></i>
              </div>
              <footer class="employee-activity">
                <span>${member.evidenceCount || 0} 条履历</span>
                <small title="${escapeHtml(
                  member.latestActivity?.summary || "等待首次执行记录"
                )}">${
                  member.latestActivity
                    ? `${formatTime(member.latestActivity.at)} · ${escapeHtml(
                        member.latestActivity.summary
                      )}`
                    : "等待首次执行记录"
                }</small>
              </footer>
            </article>
          `
        )
        .join("")
    : `<div class="coordination-empty">导入需求后自动组建交付小队</div>`;

  document.querySelector("#decisionInbox").innerHTML =
    decisions.length === 0
      ? `<div class="inbox-clear"><b>无需人工介入</b><span>系统会自行处理重启、重试与阶段交接。</span></div>`
      : decisions
          .slice(0, 6)
          .map(
            (decision) => `
              <article class="decision-item ${escapeHtml(decision.severity)}">
                <div>
                  <span>${escapeHtml(decision.stage)} · ${escapeHtml(
                    decision.code
                  )}</span>
                  <b>${escapeHtml(decision.summary)}</b>
                  <small>${escapeHtml(decision.action)}</small>
                </div>
                <button data-open-run="${escapeHtml(decision.runId)}">处理</button>
              </article>
            `
          )
          .join("");

  const ledger = mission?.coordination?.ledger || [];
  document.querySelector("#executionLedger").innerHTML =
    ledger.length === 0
      ? `<div class="ledger-empty">首个执行尝试开始后，每次重试、恢复和失败都会独立保留。</div>`
      : ledger
          .slice(-6)
          .reverse()
          .map(
            (entry) => `
              <article class="ledger-entry ${escapeHtml(entry.status)}">
                <time>${entry.at ? formatTime(entry.at) : "--:--:--"}</time>
                <i></i>
                <span>
                  <b>${escapeHtml(entry.summary || entry.kind)}</b>
                  <small>${escapeHtml(coordinatorRoleName(entry.role))} · ${escapeHtml(
                    entry.checkpoint || "未建立检查点"
                  )}${
                    entry.reasonCode
                      ? ` · ${escapeHtml(entry.reasonCode)}`
                      : ""
                  }</small>
                </span>
                <code>${escapeHtml(entry.kind)}</code>
              </article>
            `
          )
          .join("");

  document.querySelectorAll("[data-team-role]").forEach((select) => {
    select.addEventListener("change", async () => {
      const selected = new Map(
        [...document.querySelectorAll("[data-team-role]")].map((candidate) => [
          candidate.dataset.teamRole,
          candidate.value
        ])
      );
      try {
        await window.oneopc.assignProjectTeam(
          mission.id,
          [...selected.values()]
        );
        await refreshRuns(true);
        notify("项目数字员工已重新编组并进入当前检查点");
      } catch (error) {
        notify(`项目选聘失败：${error.message}`);
      }
    });
  });
}

function renderEmployees() {
  const employeesFailed = state.modules.employees.status === "failed";
  const runsFailed = state.modules.runs.status === "failed";
  document.querySelector("#createEmployeeButton").disabled = employeesFailed;
  if (employeesFailed) {
    document.querySelector("#employeeMetrics").innerHTML = `
      <div><span>员工总数</span><strong>—</strong></div>
      <div><span>在岗员工</span><strong>—</strong></div>
      <div><span>项目任职</span><strong>—</strong></div>
      <div><span>客户创建</span><strong>—</strong></div>`;
    document.querySelector("#employeeRoster").innerHTML = moduleFailureMarkup(
      "employees",
      "数字员工资产暂不可用",
      "员工档案读取失败，恢复前不会创建、停用或覆盖任何员工数据。"
    );
    bindModuleRetryButtons();
    return;
  }

  const active = state.employees.filter((employee) => employee.status === "active");
  const custom = state.employees.filter((employee) => !employee.builtIn);
  const assigned = new Set(
    state.runs.flatMap((run) =>
      (run.coordination?.team || []).map((employee) => employee.employeeId)
    )
  );
  document.querySelector("#employeeMetrics").innerHTML = `
    <div><span>员工总数</span><strong>${state.employees.length}</strong></div>
    <div><span>在岗员工</span><strong>${active.length}</strong></div>
    <div><span>项目任职</span><strong>${runsFailed ? "—" : assigned.size}</strong></div>
    <div><span>客户创建</span><strong>${custom.length}</strong></div>`;
  const runsFailure = runsFailed
    ? moduleFailureMarkup(
        "runs",
        "项目任职信息暂不可确认",
        "员工档案已恢复，但项目索引不可读，当前任职数量可能过期。"
      )
    : "";
  const visibleEmployees = state.employees.slice(
    0,
    state.employeeVisibleCount
  );
  const remainingEmployees =
    state.employees.length - visibleEmployees.length;
  document.querySelector("#employeeRoster").innerHTML = runsFailure + visibleEmployees
    .map((employee) => {
      const pending = state.employeeActionPending.has(employee.id);
      return `
      <article class="roster-employee ${escapeHtml(employee.status)}">
        <div class="roster-portrait">${employeePortraitMarkup({
          ...employee,
          employeeName: employee.name
        })}</div>
        <div class="roster-profile">
          <header>
            <div>
              <small>${escapeHtml(employee.id)} · ${escapeHtml(employee.department)}</small>
              <h2>${escapeHtml(employee.name)}</h2>
              <b>${escapeHtml(employee.roleName)}</b>
            </div>
            <span>${employee.status === "active" ? "在岗" : "停用"}</span>
          </header>
          <p>${escapeHtml(employee.responsibility)}</p>
          <div class="employee-skill-list">${employee.skills
            .map((skill) => `<span>${escapeHtml(skill)}</span>`)
            .join("")}</div>
          <dl>
            <div><dt>数字工位</dt><dd>${escapeHtml(employee.toolBinding || "自动匹配")}</dd></div>
            <div><dt>当前项目</dt><dd>${
              runsFailed
                ? "待恢复"
                : `${state.runs.filter((run) =>
                    run.coordination?.team?.some(
                      (member) => member.employeeId === employee.id
                    )
                  ).length} 个`
            }</dd></div>
            <div><dt>员工来源</dt><dd>${employee.builtIn ? "开源模式内置" : "客户创建"}</dd></div>
          </dl>
          <footer>
            <button data-edit-employee="${escapeHtml(employee.id)}">编辑档案</button>
            <button class="${employee.status === "active" ? "danger-command" : "activate-command"}"
              data-employee-status="${employee.status === "active" ? "inactive" : "active"}"
              data-employee-id="${escapeHtml(employee.id)}"
              ${pending ? "disabled aria-busy=\"true\"" : ""}>
              ${pending ? "处理中…" : employee.status === "active" ? "停用" : "重新上岗"}
            </button>
          </footer>
        </div>
      </article>`;
    })
    .join("") +
    (remainingEmployees > 0
      ? `<button class="progressive-load-button employee-load-more" data-load-employees>
          继续显示 ${Math.min(
            RENDER_LIMITS.employees,
            remainingEmployees
          )} 名员工 · 尚余 ${remainingEmployees} 名
        </button>`
      : "");

  bindModuleRetryButtons();
  document
    .querySelector("[data-load-employees]")
    ?.addEventListener("click", () => {
      state.employeeVisibleCount += RENDER_LIMITS.employees;
      measureRender("employees", renderEmployees);
    });
  document.querySelectorAll("[data-edit-employee]").forEach((button) => {
    button.addEventListener("click", () =>
      openEmployeeDialog(
        state.employees.find((employee) => employee.id === button.dataset.editEmployee)
      )
    );
  });
  document.querySelectorAll("[data-employee-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const employee = state.employees.find(
        (candidate) => candidate.id === button.dataset.employeeId
      );
      const nextStatus = button.dataset.employeeStatus;
      if (!employee || state.employeeActionPending.has(employee.id)) return;
      if (
        nextStatus === "inactive" &&
        !(await requestConfirmation({
          eyebrow: "员工状态变更",
          title: `停用「${employee.name}」？`,
          summary: "该员工将退出企业可选员工池，后续新项目不会再自动选聘。",
          detail:
            "已参与的项目和历史协作记录不会删除，您可以随时重新上岗。",
          confirmLabel: "确认停用"
        }))
      ) {
        return;
      }

      state.employeeActionPending.add(employee.id);
      renderEmployees();
      try {
        await window.oneopc.setEmployeeStatus(employee.id, nextStatus);
        await refreshEmployees();
        if (nextStatus === "active") {
          notify(`${employee.name}已重新上岗`);
        } else {
          notify(`${employee.name}已停用`, "success", {
            label: "撤销",
            onClick: async () => {
              await window.oneopc.setEmployeeStatus(employee.id, "active");
              await refreshEmployees();
              notify(`${employee.name}已恢复上岗`);
            }
          });
        }
      } catch (error) {
        notify(`员工状态更新失败：${error.message}`);
      } finally {
        state.employeeActionPending.delete(employee.id);
        if (state.page === "employees") renderEmployees();
      }
    });
  });
}

function renderRadar() {
  const runsFailed = state.modules.runs.status === "failed";
  if (runsFailed) {
    document.querySelector("#radarMetrics").innerHTML = `
      <div><span>已扫描项目</span><strong>—</strong></div>
      <div><span>开源候选</span><strong>—</strong></div>
      <div><span>代码验证</span><strong>—</strong></div>
      <div><span>风险阻断</span><strong>—</strong></div>`;
    document.querySelector("#radarFeed").innerHTML = moduleFailureMarkup(
      "runs",
      "无法恢复项目技术信号",
      "项目索引暂时不可读，当前不能判断技术雷达是否存在历史信号。"
    );
    bindModuleRetryButtons();
    return;
  }

  const intelligenceRuns = state.runs.filter((run) => run.techIntelligence);
  const candidates = intelligenceRuns.flatMap(
    (run) => run.techIntelligence?.candidates || []
  );
  const verified = intelligenceRuns.filter(
    (run) => run.techIntelligence?.graph?.evidence
  );
  const blocked = candidates.filter((candidate) => candidate.license_blocked);
  document.querySelector("#radarMetrics").innerHTML = `
    <div><span>已扫描项目</span><strong>${intelligenceRuns.length}</strong></div>
    <div><span>开源候选</span><strong>${candidates.length}</strong></div>
    <div><span>代码验证</span><strong>${verified.length}</strong></div>
    <div><span>风险阻断</span><strong>${blocked.length}</strong></div>`;
  const settingsFailure =
    state.modules.settings.status === "failed"
      ? moduleFailureMarkup(
          "settings",
          "技术增强策略暂不可配置",
          "技术雷达历史仍可查看，恢复设置后才能修改自动检索方式。"
        )
      : "";
  const visibleIntelligenceRuns = intelligenceRuns.slice(
    0,
    state.radarVisibleCount
  );
  const remainingRadarRuns =
    intelligenceRuns.length - visibleIntelligenceRuns.length;
  document.querySelector("#radarFeed").innerHTML = settingsFailure + (intelligenceRuns.length
    ? `<div class="radar-columns" aria-hidden="true">
        <span></span>
        <span>项目与检索状态</span>
        <span>首选开源方案</span>
        <span>匹配分</span>
      </div>` +
      visibleIntelligenceRuns.map((run) => {
        const top = run.techIntelligence?.candidates?.[0];
        const score = top?.score;
        const scoreText =
          score === undefined || score === null ? "—" : String(score);
        return `<button class="radar-run" data-open-run="${escapeHtml(
          run.id
        )}" aria-label="${escapeHtml(
          `${run.title}，${technologyStatusText(
            run.techIntelligence.status
          )}，首选方案${top?.title || "暂无匹配"}，匹配分${scoreText}`
        )}">
          <span class="radar-signal"></span>
          <span><b>${escapeHtml(run.title)}</b><small>${escapeHtml(
            technologyStatusText(run.techIntelligence.status)
          )} · ${run.techIntelligence.candidates?.length || 0} 个候选</small></span>
          <span><b>${escapeHtml(top?.title || "暂无匹配")}</b><small>${
            top ? "首选技术参考" : "尚未形成推荐"
          }</small></span>
          <em><b>${escapeHtml(scoreText)}</b><small>${
            top ? "满分 100" : "暂无评分"
          }</small></em>
        </button>`;
      }).join("") +
      (remainingRadarRuns > 0
        ? `<button class="progressive-load-button" data-load-radar>
            继续显示 ${Math.min(
              RENDER_LIMITS.radar,
              remainingRadarRuns
            )} 个技术信号 · 尚余 ${remainingRadarRuns} 个
          </button>`
        : "")
    : `
      <section class="radar-empty-state">
        <div class="radar-empty-visual" aria-hidden="true">
          <i class="radar-empty-sweep"></i>
          <span class="radar-empty-core"></span>
          <em class="signal-one"></em>
          <em class="signal-two"></em>
        </div>
        <div>
          <span>RADAR STANDING BY</span>
          <h2>等待首个项目技术信号</h2>
          <p>项目进入方案设计后，系统将自动完成开源匹配、代码验证与风险门禁。</p>
          <small>需求能力 <i>→</i> 开源候选 <i>→</i> 代码证据 <i>→</i> 风险结论</small>
          <button id="radarImportButton">导入新需求</button>
        </div>
      </section>`);
  bindRunLinks();
  bindModuleRetryButtons();
  document
    .querySelector("[data-load-radar]")
    ?.addEventListener("click", () => {
      state.radarVisibleCount += RENDER_LIMITS.radar;
      measureRender("radar", renderRadar);
    });
  document
    .querySelector("#radarImportButton")
    ?.addEventListener("click", openRequirementDialog);
}

function inputDraftPayload(scope) {
  if (scope === "requirement") {
    return {
      title: document.querySelector("#requirementTitle").value,
      description: document.querySelector("#requirementDescription").value
    };
  }

  return {
    id: document.querySelector("#employeeId").value,
    name: document.querySelector("#employeeName").value,
    roleId: document.querySelector("#employeeRole").value,
    department: document.querySelector("#employeeDepartment").value,
    toolBinding: document.querySelector("#employeeToolBinding").value,
    responsibility: document.querySelector("#employeeResponsibility").value,
    skills: document.querySelector("#employeeSkills").value
  };
}

function inputDraftDiffersFromBase(scope, draft) {
  const base = state.inputDraftBases[scope] || {};
  return Object.keys(inputDraftPayload(scope)).some(
    (field) => String(draft?.[field] ?? "") !== String(base[field] ?? "")
  );
}

function updateInputDraftControl(scope) {
  const button = document.querySelector(
    scope === "requirement"
      ? "#discardRequirementDraftButton"
      : "#discardEmployeeDraftButton"
  );
  button.hidden = !inputDraftDiffersFromBase(scope, inputDraftPayload(scope));
}

function setInputDraftStatus(scope, message, type = "") {
  const status = document.querySelector(
    scope === "requirement" ? "#requirementDraftStatus" : "#employeeDraftStatus"
  );
  status.textContent = message;
  status.classList.toggle("saved", type === "saved");
  status.classList.toggle("failed", type === "failed");
  updateInputDraftControl(scope);
}

async function saveInputDraftNow(scope) {
  window.clearTimeout(inputDraftTimers.get(scope));
  inputDraftTimers.delete(scope);
  const draft = inputDraftPayload(scope);
  const operation = (async () => {
    try {
      state.inputDrafts[scope] = inputDraftDiffersFromBase(scope, draft)
        ? await window.oneopc.saveInputDraft(scope, draft)
        : await window.oneopc.clearInputDraft(scope);
      setInputDraftStatus(
        scope,
        state.inputDrafts[scope]
          ? "草稿已保存在本机"
          : "未提交内容将自动保存在本机",
        state.inputDrafts[scope] ? "saved" : ""
      );
      return true;
    } catch {
      setInputDraftStatus(scope, "草稿保存失败，请勿关闭窗口", "failed");
      return false;
    }
  })();
  inputDraftWrites.set(scope, operation);
  try {
    return await operation;
  } finally {
    if (inputDraftWrites.get(scope) === operation) {
      inputDraftWrites.delete(scope);
    }
  }
}

function scheduleInputDraftSave(scope) {
  setInputDraftStatus(scope, "正在保存草稿…");
  window.oneopc.stageInputDraft(scope, inputDraftPayload(scope));
  window.clearTimeout(inputDraftTimers.get(scope));
  inputDraftTimers.set(
    scope,
    window.setTimeout(() => saveInputDraftNow(scope), 350)
  );
}

async function flushPendingInputDrafts() {
  const scopes = [
    ...new Set([
      ...inputDraftTimers.keys(),
      ...inputDraftWrites.keys()
    ])
  ];
  const results = await Promise.all(
    scopes.map((scope) =>
      inputDraftTimers.has(scope)
        ? saveInputDraftNow(scope)
        : inputDraftWrites.get(scope)
    )
  );
  if (results.some((success) => success === false)) {
    throw new Error("草稿保存失败");
  }
}

function applyInputDraftPayload(scope, draft) {
  if (scope === "requirement") {
    document.querySelector("#requirementTitle").value = draft.title || "";
    document.querySelector("#requirementDescription").value =
      draft.description || "";
    document.querySelector("#requirementCharacterCount").textContent =
      String(draft.description || "").length.toLocaleString("zh-CN");
    return;
  }

  document.querySelector("#employeeId").value = draft.id || "";
  document.querySelector("#employeeName").value = draft.name || "";
  document.querySelector("#employeeRole").value = draft.roleId || "builder";
  document.querySelector("#employeeDepartment").value = draft.department || "";
  document.querySelector("#employeeToolBinding").value = draft.toolBinding || "";
  document.querySelector("#employeeResponsibility").value =
    draft.responsibility || "";
  document.querySelector("#employeeSkills").value = draft.skills || "";
}

async function clearInputDraft(scope) {
  window.clearTimeout(inputDraftTimers.get(scope));
  inputDraftTimers.delete(scope);
  try {
    await window.oneopc.clearInputDraft(scope);
    state.inputDrafts[scope] = null;
    setInputDraftStatus(scope, "未提交内容将自动保存在本机");
  } catch {
    setInputDraftStatus(scope, "草稿清理失败，可稍后手动覆盖", "failed");
  }
}

async function discardInputDraft(scope) {
  if (!inputDraftDiffersFromBase(scope, inputDraftPayload(scope))) return;
  const requirement = scope === "requirement";
  const confirmed = await requestConfirmation({
    eyebrow: "丢弃本地草稿",
    title: requirement ? "丢弃这份需求草稿？" : "丢弃员工档案的未提交更改？",
    summary: requirement
      ? "当前输入的项目名称和需求描述将从本机删除。"
      : "表单将恢复为员工库中最近保存的档案。",
    detail: requirement
      ? "不会创建交付任务，已归档的需求和历史项目不受影响。"
      : "仅删除未提交草稿，不会停用员工或改变已保存的岗位信息。",
    confirmLabel: "确认丢弃"
  });
  if (!confirmed) return;

  applyInputDraftPayload(scope, state.inputDraftBases[scope]);
  await clearInputDraft(scope);
  notify(requirement ? "需求草稿已丢弃" : "未提交的员工更改已丢弃");
  window.requestAnimationFrame(() => {
    document
      .querySelector(requirement ? "#requirementTitle" : "#employeeName")
      .focus();
  });
}

async function openEmployeeDialog(employee = null) {
  await inputDraftsReady;
  const base = {
    id: employee?.id || "",
    name: employee?.name || "",
    roleId: employee?.roleId || "builder",
    department: employee?.department || "",
    toolBinding: employee?.toolBinding || "",
    responsibility: employee?.responsibility || "",
    skills: employee?.skills?.join("，") || ""
  };
  state.inputDraftBases.employee = base;
  const saved = state.inputDrafts.employee;
  const draft =
    saved && saved.id === base.id && inputDraftDiffersFromBase("employee", saved)
      ? saved
      : base;
  document.querySelector("#employeeDialogTitle").textContent =
    employee ? "编辑数字员工" : "新建数字员工";
  applyInputDraftPayload("employee", draft);
  document.querySelector("#saveEmployeeButton").textContent =
    employee ? "保存员工档案" : "创建并上岗";
  setInputDraftStatus(
    "employee",
    draft === saved ? "已恢复上次未提交的员工草稿" : "未提交内容将自动保存在本机",
    draft === saved ? "saved" : ""
  );
  openModal(document.querySelector("#employeeDialog"), "#employeeName");
  consumeInputDraftRecoveryNotice();
}

async function refreshEmployees() {
  state.employees = await window.oneopc.listEmployees();
  if (state.page === "employees") renderEmployees();
  if (state.run) renderCoordination(state.run);
}

function renderTasks() {
  const runsFailed = state.modules.runs.status === "failed";
  const supervisorFailed = state.modules.supervisor.status === "failed";
  const monitorStrip = document.querySelector(".task-monitor-strip");
  const monitorTitle = monitorStrip.querySelector("b");

  if (runsFailed) {
    ["managedTaskCount", "healthyTaskCount", "recoveringTaskCount", "attentionTaskCount"]
      .forEach((id) => {
        document.querySelector(`#${id}`).textContent = "—";
      });
    document.querySelector("#taskAlertCount").textContent = "—";
    monitorStrip.classList.add("failed");
    monitorTitle.textContent = "任务状态暂不可确认";
    document.querySelector("#supervisorHeartbeat").textContent =
      "项目索引读取失败，监管器不会覆盖现有检查点";
    document.querySelector("#taskList").innerHTML = moduleFailureMarkup(
      "runs",
      "无法恢复受管任务",
      "本地项目索引暂时不可读，恢复前不会把未知状态误报为零任务。"
    );
    bindModuleRetryButtons();
    return;
  }

  monitorStrip.classList.toggle("failed", supervisorFailed);
  monitorTitle.textContent = supervisorFailed
    ? "后台监管器连接异常"
    : "后台监管器持续运行";
  const supervised = state.runs.filter((run) => run.supervision);
  const attention = supervised.filter(taskNeedsAttention);
  const recovering = supervised.filter((run) =>
    ["queued", "recovering"].includes(run.supervision.state)
  );
  const healthy = supervised.filter((run) => {
    const tools = Object.values(run.supervision.tools || {});
    return (
      run.supervision.state === "running" &&
      tools.length > 0 &&
      tools.every((tool) => tool.processState === "online")
    );
  });

  document.querySelector("#managedTaskCount").textContent = supervised.length;
  document.querySelector("#healthyTaskCount").textContent = healthy.length;
  document.querySelector("#recoveringTaskCount").textContent = recovering.length;
  document.querySelector("#attentionTaskCount").textContent = attention.length;
  document.querySelector("#taskAlertCount").textContent = attention.length;

  const latestScan = supervised
    .map((run) => run.supervision.monitor?.lastScanAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  document.querySelector("#supervisorHeartbeat").textContent = supervisorFailed
    ? `健康检查失败 · 当前展示${
        latestScan ? `${formatTime(latestScan)} 的最近快照` : "上次保存的任务状态"
      }`
    : latestScan
      ? `最近检查 ${formatTime(latestScan)} · 下次自动检查已排程`
      : "后台监管器已启动，等待首次健康检查";

  const supervisorFailure = supervisorFailed
    ? moduleFailureMarkup(
        "supervisor",
        "监管器健康状态可能过期",
        "任务检查未完成。下方保留最近一次本地快照，不代表当前实时状态。"
      )
    : "";
  const visibleSupervised = supervised.slice(0, state.taskVisibleCount);
  const remainingTasks = supervised.length - visibleSupervised.length;
  document.querySelector("#taskList").innerHTML =
    supervisorFailure +
    (supervised.length === 0
      ? `<div class="task-empty">暂无受管任务。导入需求后将自动创建监管契约和恢复检查点。</div>`
      : visibleSupervised
          .map((run) => {
            const supervision = run.supervision;
            const checkpoint = supervision.checkpoint || {};
            const incident = (supervision.incidents || []).find(
              (candidate) => !candidate.resolvedAt
            );
            const tools = Object.values(supervision.tools || {});
            const busy = state.taskActionPending?.runId === run.id;
            const pendingAction = busy
              ? state.taskActionPending.action
              : null;
            const canOperate = !["completed", "cancelled"].includes(
              supervision.state
            );
            const canCancel = ![
              "completed",
              "cancelled",
              "failed"
            ].includes(supervision.state);
            const cancellation = supervision.cancellation;
            return `
              <article
                class="task-row ${incident ? "has-incident" : ""}"
                data-task-run-id="${escapeHtml(run.id)}"
              >
                <div class="task-primary">
                  <button class="task-title" data-open-run="${escapeHtml(run.id)}">
                    <span class="run-symbol">OP</span>
                    <span>
                      <b>${escapeHtml(run.title)}</b>
                      <small>${escapeHtml(run.id)} · ${escapeHtml(
                        run.stages?.[checkpoint.stage] || "等待执行"
                      )}</small>
                    </span>
                  </button>
                  <span class="supervision-state ${escapeHtml(supervision.state)}">
                    ${escapeHtml(supervisionStateText(supervision.state))}
                  </span>
                </div>
                <div class="checkpoint-line">
                  <span>恢复检查点</span>
                  <b>${escapeHtml(checkpoint.stepId || "尚未建立")}</b>
                  <code>序号 ${checkpoint.sequence || 0}</code>
                  <small>恢复时继续当前步骤，不清空工作区</small>
                </div>
                <div class="managed-tools">
                  ${
                    tools.length === 0
                      ? `<span class="tool-health unknown">等待首次工具健康检查</span>`
                      : tools
                          .map(
                            (tool) => `
                              <div class="tool-health ${escapeHtml(
                                tool.processState
                              )}">
                                <i></i>
                                <span>
                                  <b>${escapeHtml(tool.name)}</b>
                                  <small>${escapeHtml(
                                    taskStateText(tool.taskState)
                                  )} · ${escapeHtml(
                                    capabilityText(tool.capability)
                                  )}</small>
                                </span>
                                <code>${tool.pid ? `PID ${tool.pid}` : escapeHtml(
                                  processStateText(tool.processState)
                                )}</code>
                              </div>
                            `
                          )
                          .join("")
                  }
                </div>
                <div class="recovery-facts">
                  <span>步骤重试 <b>${supervision.recovery?.retryCount || 0}/${supervision.policy?.maxRetries || 5}</b></span>
                  <span>应用重启 <b>${supervision.recovery?.restartCount || 0}/${supervision.policy?.maxRestarts || 3}</b></span>
                  <span>扫描 <b>${supervision.monitor?.scanCount || 0}</b></span>
                </div>
                ${
                  incident
                    ? `<div class="task-incident"><b>${escapeHtml(
                        incident.summary
                      )}</b><span>${escapeHtml(incident.action)}</span></div>`
                    : ""
                }
                ${
                  supervision.state === "cancelled" && cancellation
                    ? `<div class="task-cancellation ${escapeHtml(
                        cancellation.status
                      )}">
                        <span>
                          <b>${
                            cancellation.status === "confirmed"
                              ? "任务已终止，外部工具已确认停止"
                              : "监管已终止，外部工具停止待确认"
                          }</b>
                          <small>检查点 ${escapeHtml(
                            cancellation.checkpoint?.stepId ||
                              checkpoint.stepId ||
                              "最近可用检查点"
                          )} 已保留</small>
                        </span>
                        <code>${escapeHtml(
                          stopEvidenceText(cancellation.external?.method)
                        )}</code>
                      </div>`
                    : ""
                }
                <div class="task-actions">
                  ${
                    supervision.state === "cancelled" &&
                    cancellation?.undoAvailable
                      ? `<button class="restore" data-task-action="undo_cancel" data-run-id="${escapeHtml(run.id)}" ${
                          busy ? "disabled aria-busy=\"true\"" : ""
                        }>${pendingAction === "undo_cancel" ? "正在恢复…" : "撤销终止"}</button>`
                      : supervision.state === "paused"
                      ? `<button data-task-action="resume" data-run-id="${escapeHtml(run.id)}" ${
                          busy ? "disabled aria-busy=\"true\"" : ""
                        }>${pendingAction === "resume" ? "正在继续…" : "继续任务"}</button>`
                      : canOperate
                        ? `<button data-task-action="pause" data-run-id="${escapeHtml(run.id)}" ${
                            busy ? "disabled aria-busy=\"true\"" : ""
                          }>${pendingAction === "pause" ? "正在暂停…" : "暂停监管"}</button>`
                        : ""
                  }
                  ${
                    canOperate
                      ? `<button class="retry" data-task-action="retry" data-run-id="${escapeHtml(run.id)}" ${
                          busy ? "disabled aria-busy=\"true\"" : ""
                        }>${pendingAction === "retry" ? "正在提交…" : "从检查点重试"}</button>`
                      : ""
                  }
                  ${
                    canCancel
                      ? `<button class="cancel" data-task-action="cancel" data-run-id="${escapeHtml(run.id)}" ${
                          busy ? "disabled aria-busy=\"true\"" : ""
                        }>${pendingAction === "cancel" ? "正在终止…" : "终止任务"}</button>`
                      : ""
                  }
                  <button data-open-run="${escapeHtml(run.id)}">查看证据</button>
                </div>
              </article>
            `;
          })
          .join("") +
        (remainingTasks > 0
          ? `<button class="progressive-load-button" data-load-tasks>
              继续显示 ${Math.min(
                RENDER_LIMITS.tasks,
                remainingTasks
              )} 个任务 · 尚余 ${remainingTasks} 个
            </button>`
          : ""));

  bindRunLinks();
  bindModuleRetryButtons();
  document
    .querySelector("[data-load-tasks]")
    ?.addEventListener("click", () => {
      state.taskVisibleCount += RENDER_LIMITS.tasks;
      measureRender("tasks", renderTasks);
    });
  document.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const runId = button.dataset.runId;
      const action = button.dataset.taskAction;
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (!run || state.taskActionPending) return;
      const checkpoint = run.supervision?.checkpoint || {};

      if (
        action === "pause" &&
        !(await requestConfirmation({
          eyebrow: "任务监管控制",
          title: `暂停「${run.title}」的监管？`,
          summary: "后台监管器将停止推进当前任务，但不会强制退出外部研发工具。",
          detail: `当前检查点 ${checkpoint.stepId || "尚未建立"} 将被保留，之后可从原位置继续。`,
          confirmLabel: "确认暂停"
        }))
      ) {
        return;
      }
      if (
        action === "retry" &&
        !(await requestConfirmation({
          tone: "warning",
          eyebrow: "检查点恢复",
          title: `从检查点重新提交任务？`,
          summary: `系统将从「${checkpoint.stepId || "最近可用检查点"}」继续当前步骤。`,
          detail:
            "不会清空工作区或从头执行，但会增加一次重试记录并重新向外部工具提交指令。",
          confirmLabel: "确认重试"
        }))
      ) {
        return;
      }
      if (
        action === "cancel" &&
        !(await requestConfirmation({
          tone: "warning",
          eyebrow: "终止当前任务",
          title: `终止「${run.title}」？`,
          summary:
            "OneOPC 将停止监管推进，并请求外部研发工具停止当前 Run；工具应用本身不会退出。",
          detail: `检查点 ${checkpoint.stepId || "最近可用检查点"} 和全部执行证据会保留，可通过“撤销终止”从原位置恢复。`,
          confirmLabel: "确认终止"
        }))
      ) {
        return;
      }

      state.taskActionPending = { runId, action };
      renderTasks();
      try {
        await window.oneopc.controlTask(runId, action);
        await refreshRuns(true);
        if (action === "pause") {
          notify("任务监管已暂停，检查点已保留", "success", {
            label: "撤销",
            onClick: async () => {
              await window.oneopc.controlTask(runId, "resume");
              await refreshRuns(true);
              notify("任务监管已继续");
            }
          });
        } else if (action === "resume") {
          notify("任务监管已继续，将从保存的检查点推进");
        } else if (action === "cancel") {
          const updated = state.runs.find(
            (candidate) => candidate.id === runId
          );
          const confirmed =
            updated?.supervision?.cancellation?.status === "confirmed";
          notify(
            confirmed
              ? "任务已终止，外部工具已确认停止"
              : "监管已终止，外部工具停止待确认",
            confirmed ? "success" : "error",
            {
              label: "撤销终止",
              onClick: async () => {
                await window.oneopc.controlTask(runId, "undo_cancel");
                await refreshRuns(true);
                notify("任务终止已撤销，将从原检查点恢复");
              }
            }
          );
        } else if (action === "undo_cancel") {
          notify("任务终止已撤销，将从原检查点恢复");
        } else {
          notify("重试指令已提交，将从保存的检查点继续");
        }
      } catch (error) {
        notify(`任务控制失败：${error.message}`);
      } finally {
        state.taskActionPending = null;
        renderTasks();
      }
    });
  });
}

function bindRunLinks() {
  document.querySelectorAll("[data-open-run]").forEach((button) => {
    button.addEventListener("click", () => openRun(button.dataset.openRun));
  });
  document.querySelectorAll("[data-open-url]").forEach((button) => {
    button.addEventListener("click", () =>
      window.oneopc.openOutput(button.dataset.openUrl)
    );
  });
}

function notify(message, type = null, action = null) {
  const resolvedType =
    type ||
    (/失败|错误|异常/.test(message)
      ? "error"
      : /完成|成功|已/.test(message)
        ? "success"
        : "info");
  window.clearTimeout(state.toastTimer);
  document.querySelector("#toastMessage").textContent = message;
  const actionButton = document.querySelector("#toastActionButton");
  state.toastAction = action?.onClick || null;
  actionButton.hidden = !state.toastAction;
  actionButton.textContent = action?.label || "";
  actionButton.disabled = false;
  elements.toast.dataset.type = resolvedType;
  elements.toast.classList.add("visible");
  state.toastTimer = window.setTimeout(
    () => elements.toast.classList.remove("visible"),
    resolvedType === "error" ? 6000 : 3500
  );
}

function dismissToast() {
  window.clearTimeout(state.toastTimer);
  state.toastAction = null;
  document.querySelector("#toastActionButton").hidden = true;
  elements.toast.classList.remove("visible");
}

function requestConfirmation({
  tone = "danger",
  eyebrow = "操作确认",
  title,
  summary,
  detail,
  confirmLabel = "确认"
}) {
  const dialog = document.querySelector("#actionDialog");
  dialog.dataset.tone = tone;
  document.querySelector("#actionDialogEyebrow").textContent = eyebrow;
  document.querySelector("#actionDialogTitle").textContent = title;
  document.querySelector("#actionDialogSummary").textContent = summary;
  document.querySelector("#actionDialogDetail").textContent = detail;
  document.querySelector("#actionDialogConfirmButton").textContent =
    confirmLabel;
  dialog.returnValue = "cancel";
  openModal(dialog, "#actionDialogCancelButton");
  return new Promise((resolve) => {
    state.confirmationResolver = resolve;
  });
}

function resolveConfirmation(confirmed) {
  const resolve = state.confirmationResolver;
  state.confirmationResolver = null;
  resolve?.(confirmed);
}

function closeGraph() {
  document.querySelector("#graphPanel").hidden = true;
  const origin = state.graphReturnFocus;
  state.graphReturnFocus = null;
  if (origin instanceof HTMLElement && origin.isConnected) {
    window.requestAnimationFrame(() => origin.focus({ preventScroll: true }));
  }
  state.graphInstance?.destroy();
  state.graphInstance = null;
}

function stageState(index) {
  if (!state.run) return "pending";
  if (state.run.status === "completed") return "done";
  if (index < state.run.currentStage) return "done";
  if (index === state.run.currentStage) return "active";
  return "pending";
}

function setView(view) {
  state.view = view;
  document.body.classList.toggle(
    "executive-mode",
    state.page === "workspace" && view === "overview"
  );
  document.body.classList.toggle(
    "developer-mode",
    state.page === "workspace" && view === "detail"
  );
  elements.workspace.dataset.view = view;
  const coordinationSlot = document.querySelector(
    view === "overview"
      ? "#overviewCoordinationSlot"
      : "#detailCoordinationSlot"
  );
  if (elements.coordinationPanel && coordinationSlot) {
    coordinationSlot.append(elements.coordinationPanel);
  }
  elements.overviewView.classList.toggle("active", view === "overview");
  elements.detailView.classList.toggle("active", view === "detail");
  document.querySelectorAll(".view-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (state.run && elements.stageTrack) {
    renderStageNavigation();
  }
}

function installedTools(category) {
  return state.tools?.[category]?.filter((tool) => tool.installed) || [];
}

function selectedTool(category) {
  const id = state.tools?.selection?.[category];
  return state.tools?.[category]?.find((tool) => tool.id === id) || null;
}

function sourceLabel(source) {
  if (source === "application") return "APP";
  if (source === "cli") return "CLI";
  if (source === "gh-extension") return "GH";
  return "EXT";
}

function renderToolOptions(category, container) {
  const tools = installedTools(category);
  if (tools.length === 0) {
    container.innerHTML = `<span class="tool-empty">未发现可用工具</span>`;
    return;
  }

  const selectedId = state.tools.selection[category];
  const primary = tools.find((tool) => tool.id === selectedId) || tools[0];
  const alternatives = tools.filter((tool) => tool.id !== primary.id);
  container.innerHTML = `
    <button
      class="tool-option selected"
      data-tool-category="${category}"
      data-tool-id="${escapeHtml(primary.id)}"
      title="${escapeHtml(primary.path)}"
    >
      <span class="tool-mark">${category === "work" ? "W" : "&lt;/&gt;"}</span>
      <span class="tool-primary-copy">
        <small>当前主工具</small>
        <b>${escapeHtml(primary.name)}</b>
      </span>
      <span class="tool-live"><i></i>在线</span>
    </button>
    ${
      alternatives.length
        ? `<div class="tool-alternatives">
            <span>备选 ${alternatives.length}</span>
            ${alternatives
              .map(
                (tool) => `
                  <button
                    data-tool-category="${category}"
                    data-tool-id="${escapeHtml(tool.id)}"
                    title="切换为 ${escapeHtml(tool.name)} · ${escapeHtml(tool.path)}"
                  >
                    ${escapeHtml(tool.name)}
                    <small>${sourceLabel(tool.source)}</small>
                  </button>`
              )
              .join("")}
          </div>`
        : `<div class="tool-alternatives empty"><span>暂无备选工具</span></div>`
    }`;
}

function renderToolchain() {
  if (!state.tools) return;
  renderToolOptions("work", elements.workToolOptions);
  renderToolOptions("code", elements.codeToolOptions);

  const work = selectedTool("work");
  const code = selectedTool("code");
  const installedCount =
    installedTools("work").length + installedTools("code").length;
  document.querySelector("#toolCapabilityCount").textContent =
    `${installedCount} 项能力在线`;
  document
    .querySelector("#toolchainBar")
    .classList.toggle("scanning", state.toolScanning);
  document.querySelector("#toolScanSummary").textContent =
    installedCount === 0
      ? "未发现支持的工具；OneOPC 将在下次启动时再次自动扫描"
      : `发现 ${installedCount} 项能力 · 默认 ${work?.name || "无 Work 工具"} + ${
          code?.name || "无 Code 工具"
        }`;

  document.querySelector("#selectedToolchainTitle").textContent =
    `${work?.name || "无 Work 工具"} + ${code?.name || "无 Code 工具"}`;
  document.querySelector("#selectedToolchainState").textContent =
    work && code ? "已自动选择" : "能力不足";
  document.querySelector("#selectedToolchainDescription").textContent =
    work && code
      ? "程序启动时自动识别本机安装，不需要填写路径、Token 或应用配置。"
      : "未同时发现 Work 与 Code 工具；程序下次启动时会自动重新识别。";
  document.querySelector("#workToolTag").textContent =
    `work:${work?.id || "unavailable"}`;
  document.querySelector("#codeToolTag").textContent =
    `code:${code?.id || "unavailable"}`;

  document.querySelectorAll("[data-tool-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const category = button.dataset.toolCategory;
      const selection = {
        ...state.tools.selection,
        [category]: button.dataset.toolId
      };
      try {
        state.tools = await window.oneopc.selectTools(selection);
        renderToolchain();
        notify(
          `已选择 ${selectedTool("work")?.name || "无 Work 工具"} + ${
            selectedTool("code")?.name || "无 Code 工具"
          }`
        );
      } catch (error) {
        notify(`工具选择失败：${error.message}`);
      }
    });
  });
}

async function detectTools(showNotice = false) {
  state.toolScanning = true;
  const toolchain = document.querySelector("#toolchainBar");
  toolchain.classList.add("scanning");
  toolchain.classList.remove("failed");
  document.querySelector("#rescanToolsButton").disabled = true;
  try {
    document.querySelector("#toolScanSummary").textContent =
      "正在扫描 /Applications、用户应用和命令行工具";
    state.tools = await window.oneopc.detectTools();
    renderToolchain();
    toolchain.querySelector(".toolchain-status b").textContent =
      "本机执行环境已就绪";
    if (showNotice) notify("本机研发工具已重新识别");
    return true;
  } catch (error) {
    state.tools = null;
    toolchain.classList.add("failed");
    toolchain.querySelector(".toolchain-status b").textContent =
      "本机执行环境需要检查";
    document.querySelector("#toolScanSummary").textContent =
      `自动识别失败：${error.message}`;
    document.querySelector("#toolCapabilityCount").textContent = "扫描失败";
    elements.workToolOptions.innerHTML =
      `<span class="tool-empty">暂时无法读取本机工具</span>`;
    elements.codeToolOptions.innerHTML =
      `<span class="tool-empty">点击右侧刷新按钮重试</span>`;
    throw error;
  } finally {
    state.toolScanning = false;
    toolchain.classList.remove("scanning");
    document.querySelector("#rescanToolsButton").disabled = false;
  }
}

function intelligenceStatusText(status) {
  return {
    idle: "未运行",
    pending: "等待检索",
    running: "检索中",
    completed: "已完成",
    no_match: "无高相关候选",
    unavailable: "数据源不可用",
    skipped: "已跳过",
    timed_out: "已超时，主流程继续",
    error: "失败，主流程继续"
  }[status] || "检索状态待确认";
}

function transportText(transport) {
  return {
    computer_use: "可视化操作",
    provider_api: "Provider API",
    local_cache: "本地情报缓存"
  }[transport] || "执行方式待确认";
}

function capabilityDisplayName(value) {
  return {
    work: "工作流",
    order: "工单管理",
    maintenance: "设备检修",
    "work-order": "工单流转",
    asset: "设备资产",
    workflow: "业务流程",
    cmms: "设备维护"
  }[String(value).toLowerCase()] || value;
}

function renderIntelligence() {
  if (!state.run) return;
  const intelligence = state.run.techIntelligence || {
    status: "idle",
    candidates: []
  };
  const status = intelligence.status || "idle";
  const statusElement = document.querySelector("#intelligenceStatus");
  const runButton = document.querySelector("#runIntelligenceButton");
  const funnelElement = document.querySelector("#intelligenceFunnel");
  const candidates = intelligence.candidates || [];
  const graphEvidence = intelligence.graph?.evidence;
  const requestedTransport =
    intelligence.requestedTransport ||
    state.intelligenceSettings?.transport ||
    "computer_use";
  const actualTransport = intelligence.actualTransport;
  const visibleCandidates = state.candidatesExpanded
    ? candidates
    : candidates.slice(0, 1);
  document.querySelector("#intelligencePanel").classList.toggle(
    "loading",
    state.intelligencePending || status === "running"
  );

  statusElement.className = `intelligence-status ${status}`;
  statusElement.textContent = intelligenceStatusText(status);
  runButton.disabled = state.intelligencePending;
  runButton.textContent =
    state.intelligencePending
      ? "正在检索"
      : status === "idle" || status === "skipped"
        ? "检索技术参考"
        : "重新检索";
  document.querySelector("#focusExplorationButton").hidden =
    requestedTransport !== "computer_use" &&
    actualTransport !== "computer_use";
  document
    .querySelectorAll("[data-intelligence-transport]")
    .forEach((button) => {
      button.classList.toggle(
        "selected",
        button.dataset.intelligenceTransport ===
          state.intelligenceSettings?.transport
      );
    });
  document.querySelectorAll("[data-intelligence-depth]").forEach((button) => {
    button.classList.toggle(
      "selected",
      button.dataset.intelligenceDepth === state.intelligenceSettings?.depth
    );
  });
  document.querySelector("#transportTrace").innerHTML = `
    <span>通道轨迹</span>
    <b>请求 ${escapeHtml(transportText(requestedTransport))} → 实际 ${escapeHtml(
      transportText(actualTransport)
    )}</b>
    ${
      intelligence.fallbackUsed
        ? `<small>已显式降级：${escapeHtml(
            intelligence.fallbackReason || "主通道不可用"
          )}</small>`
        : `<small>${actualTransport ? "未发生通道降级" : "等待执行后记录实际通道"}</small>`
    }
  `;
  document.querySelector("#intelligenceConfig").hidden =
    !state.intelligenceSettingsOpen;
  document.querySelector("#intelligenceSettingsButton").classList.toggle(
    "active",
    state.intelligenceSettingsOpen
  );

  document.querySelector("#intelligenceSummary").textContent =
    intelligence.recommendation?.summary ||
    (status === "idle"
      ? "从 Technology Exploration 的本地情报中寻找可复用实现，不影响主交付流程。"
      : status === "skipped"
        ? "技术参考增强已关闭。本次跳过不会阻断需求到交付的主流程。"
        : status === "running"
          ? "正在读取最近 7 天本地情报并匹配开源实现。"
          : "本轮未采用任何外部实现，主交付流程保持独立。");

  const topCandidate = candidates[0];
  const graph = intelligence.graph?.evidence;
  document.querySelector("#intelligenceOverview").innerHTML = `
    <div>
      <span>最佳候选</span>
      <strong>${escapeHtml(topCandidate?.title || "等待检索")}</strong>
      <small>${
        topCandidate
          ? `${escapeHtml(topCandidate.license || "许可证待核实")} · ${
              topCandidate.total_stars
                ? `${Number(topCandidate.total_stars).toLocaleString()} Stars`
                : transportText(actualTransport)
            }`
          : "技术参考不会阻塞主交付"
      }</small>
    </div>
    <div>
      <span>发现匹配</span>
      <strong>${topCandidate?.score ?? "--"}<em>/100</em></strong>
      <small>${topCandidate ? "基于需求、仓库与趋势证据" : "尚未评分"}</small>
    </div>
    <div>
      <span>代码验证</span>
      <strong>${graph?.verifiedFitScore ?? "--"}<em>/100</em></strong>
      <small>${
        graph
          ? `${graph.coverage.matchedCapabilities}/${graph.coverage.totalCapabilities} 项能力有代码证据`
          : "选择代码图谱深度后生成"
      }</small>
    </div>
    <div>
      <span>实际通道</span>
      <strong class="overview-transport">${escapeHtml(
        transportText(actualTransport)
      )}</strong>
      <small>${
        intelligence.fallbackUsed ? "已发生显式降级" : "未发生通道降级"
      }</small>
    </div>
  `;

  if (intelligence.funnel) {
    funnelElement.hidden = false;
    funnelElement.innerHTML = `
      <span>情报 <b>${intelligence.funnel.collected}</b></span>
      <i>→</i>
      <span>开源实体 <b>${intelligence.funnel.repository_or_model_candidates}</b></span>
      <i>→</i>
      <span>需求匹配 <b>${intelligence.funnel.matched}</b></span>
      <i>→</i>
      <span>代码验证 <b>${
        graph?.coverage?.matchedCapabilities ??
        intelligence.funnel.verified
      }</b></span>
    `;
  } else {
    funnelElement.hidden = true;
    funnelElement.innerHTML = "";
  }

  document.querySelector("#candidateHeading").hidden = candidates.length === 0;
  document.querySelector("#candidateHeadingHint").textContent =
    candidates.length > 1
      ? `优先展示评分最高项目，另有 ${candidates.length - 1} 个备选`
      : "当前仅有一个满足最低证据要求的候选";
  const toggleCandidates = document.querySelector("#toggleCandidatesButton");
  toggleCandidates.hidden = candidates.length <= 1;
  toggleCandidates.textContent = state.candidatesExpanded
    ? "收起备选"
    : `查看全部 ${candidates.length}`;
  document.querySelector("#candidateList").innerHTML =
    candidates.length === 0
      ? status === "running"
        ? ""
        : `<div class="candidate-empty">暂无候选。该增强能力是可选支线，不影响当前交付结果。</div>`
      : visibleCandidates
          .map(
            (candidate, index) => `
              <article class="candidate-row ${index === 0 ? "recommended" : ""}">
                <span class="candidate-rank">${index === 0 ? "TOP" : `#${index + 1}`}</span>
                <span class="candidate-score">
                  <b>${candidate.score}</b>
                  <small>匹配</small>
                </span>
                <span class="candidate-title">
                  <b>${escapeHtml(candidate.title)}</b>
                  <small>${escapeHtml(
                    candidate.plain_description ||
                      `匹配 ${(candidate.matched_capabilities || [])
                        .slice(0, 4)
                        .map(capabilityDisplayName)
                        .join("、")} · ${
                        candidate.discovered_via || "Technology Exploration"
                      }`
                  )}</small>
                </span>
                <span class="candidate-meta">
                  <span>${escapeHtml(candidate.license || "许可待核实")}</span>
                  ${
                    candidate.coverage_percent !== null &&
                    candidate.coverage_percent !== undefined
                      ? `<span>覆盖 ${candidate.coverage_percent}%</span>`
                      : ""
                  }
                  ${
                    candidate.confidence_label
                      ? `<span>${escapeHtml(candidate.confidence_label)}</span>`
                      : ""
                  }
                  ${(candidate.matched_capabilities || [])
                    .slice(0, 2)
                    .map((term) => `<span>${escapeHtml(term)}</span>`)
                    .join("")}
                </span>
                <span class="candidate-actions">
                  <button class="candidate-decision">${escapeHtml(
                    candidate.decision === "trial"
                      ? "建议试用"
                      : candidate.decision === "reject"
                        ? "不建议"
                        : "仅供参考"
                  )}</button>
                  ${
                    graphEvidence?.repository?.fullName === candidate.title
                      ? `<button class="candidate-graph" data-open-graph>打开验证图谱</button>`
                      : ""
                  }
                  <button data-open-source="${escapeHtml(candidate.url)}">GitHub</button>
                </span>
                ${
                  candidate.plain_explanation || candidate.adoption_advice
                    ? `<div class="candidate-insight">
                        <span>
                          <b>为什么匹配</b>
                          <small>${escapeHtml(
                            candidate.plain_explanation ||
                              "已通过需求能力和项目证据完成匹配。"
                          )}</small>
                        </span>
                        <span>
                          <b>采用建议</b>
                          <small>${escapeHtml(
                            candidate.adoption_advice ||
                              "建议先完成最小原型验证。"
                          )}</small>
                        </span>
                        ${
                          (candidate.risk_notes || []).length
                            ? `<span class="candidate-risk">
                                <b>风险</b>
                                <small>${escapeHtml(
                                  candidate.risk_notes.slice(0, 2).join("；")
                                )}</small>
                              </span>`
                            : ""
                        }
                      </div>`
                    : ""
                }
              </article>
            `
          )
          .join("");

  document.querySelectorAll("[data-open-source]").forEach((button) => {
    button.addEventListener("click", () =>
      window.oneopc.openSource(button.dataset.openSource)
    );
  });
  document.querySelectorAll("[data-open-graph]").forEach((button) => {
    button.addEventListener("click", () => openGraph());
  });
  if (!graphEvidence) {
    document.querySelector("#graphPanel").hidden = true;
  } else if (!document.querySelector("#graphPanel").hidden) {
    renderGraph();
  }
}

function graphPositions(nodes, width = 900, height = 390) {
  const groups = new Map();
  for (const node of nodes) {
    const layer = Number(node.data.layer || 0);
    const group = groups.get(layer) || [];
    group.push(node);
    groups.set(layer, group);
  }
  const positions = {};
  const xByLayer = {
    0: width * 0.1,
    1: width * 0.12,
    2: width * 0.5,
    3: width * 0.78,
    4: width * 0.78
  };
  for (const [layer, group] of groups.entries()) {
    group.forEach((node, index) => {
      positions[node.data.id] = {
        x: xByLayer[layer] || width * 0.5,
        y: 38 + (index + 0.5) * ((height - 76) / Math.max(1, group.length))
      };
    });
  }
  return positions;
}

function renderGraphInspector(data, isEdge = false) {
  const inspector = document.querySelector("#graphInspector");
  inspector.innerHTML = isEdge
    ? `
      <span>RELATION EVIDENCE</span>
      <h4>${escapeHtml(data.type)}</h4>
      <p>置信度 ${Math.round(Number(data.confidence || 0) * 100)}%</p>
      ${
        data.evidence
          ? `<code>${escapeHtml(
              `${data.evidence.command || ""}\n${data.evidence.file || ""}:${
                data.evidence.line || 0
              }\ncommit ${data.evidence.commit || ""}`
            )}</code>`
          : `<p>该关系来自 Technology Exploration 的需求匹配证据。</p>`
      }
    `
    : `
      <span>${escapeHtml(data.kind || "NODE")}</span>
      <h4>${escapeHtml(data.label)}</h4>
      <p>${escapeHtml(data.detail || "暂无更多说明")}</p>
      ${
        data.file
          ? `<code>${escapeHtml(`${data.file}:${data.line || 0}`)}</code>`
          : ""
      }
    `;
}

function renderGraph() {
  const evidence = state.run?.techIntelligence?.graph?.evidence;
  if (!evidence || typeof cytoscape !== "function") return;
  state.graphInstance?.destroy();

  const allNodes = evidence.nodes || [];
  const representativeSymbolIds = new Set();
  if (state.graphMode === "executive") {
    for (const edge of evidence.edges || []) {
      if (
        edge.data.type === "IMPLEMENTED_IN" &&
        !representativeSymbolIds.has(edge.data.source)
      ) {
        representativeSymbolIds.add(edge.data.source);
        representativeSymbolIds.add(edge.data.target);
      }
    }
  }
  const visibleNodes = allNodes.filter(
    (node) =>
      state.graphMode === "developer" ||
      node.data.kind !== "Symbol" ||
      representativeSymbolIds.has(node.data.id)
  ).map((node) =>
    state.graphMode === "executive" && node.data.kind === "Capability"
      ? {
          ...node,
          data: {
            ...node.data,
            label: capabilityDisplayName(node.data.label),
            detail: `原始能力词：${node.data.label}`
          }
        }
      : node
  );
  const visibleIds = new Set(visibleNodes.map((node) => node.data.id));
  const visibleEdges = (evidence.edges || []).filter(
    (edge) =>
      visibleIds.has(edge.data.source) && visibleIds.has(edge.data.target)
  );
  const canvas = document.querySelector("#graphCanvas");
  const positions = graphPositions(
    visibleNodes,
    Math.max(780, canvas.clientWidth),
    Math.max(390, canvas.clientHeight)
  );

  document.querySelector("#discoveryFitScore").textContent =
    evidence.discoveryFitScore;
  document.querySelector("#verifiedFitScore").textContent =
    `${evidence.verifiedFitScore} (${
      evidence.scoreDelta >= 0 ? "+" : ""
    }${evidence.scoreDelta})`;
  document.querySelector("#graphConclusion").textContent =
    evidence.scoreDelta >= 0
      ? `代码证据支持该候选，验证后匹配度提升 ${evidence.scoreDelta} 分`
      : `代码验证发现覆盖缺口，匹配度下降 ${Math.abs(
          evidence.scoreDelta
        )} 分`;
  document.querySelector("#graphMetrics").innerHTML = `
    <span>需求能力 <b>${evidence.coverage.totalCapabilities}</b></span>
    <span>代码覆盖 <b>${evidence.coverage.matchedCapabilities}</b></span>
    <span>图谱节点 <b>${visibleNodes.length}</b></span>
    <span>证据关系 <b>${visibleEdges.length}</b></span>
    <span>固定版本 <b>${escapeHtml(
      evidence.repository.commit.slice(0, 10)
    )}</b></span>
    <span>本地静态分析 <b>YES</b></span>
  `;
  document.querySelector("#graphInspector").innerHTML = `
    <span>VERIFICATION SUMMARY</span>
    <h4>${escapeHtml(evidence.repository.fullName)}</h4>
    <p>${evidence.coverage.matchedCapabilities}/${evidence.coverage.totalCapabilities} 项需求能力找到代码证据，匹配度由 ${evidence.discoveryFitScore} 调整为 ${evidence.verifiedFitScore}。</p>
    <code>commit ${escapeHtml(evidence.repository.commit.slice(0, 12))}
${escapeHtml(evidence.repository.license)} · 仅本地静态分析
未执行仓库代码或安装脚本</code>
  `;

  state.graphInstance = cytoscape({
    container: document.querySelector("#graphCanvas"),
    elements: [...visibleNodes, ...visibleEdges],
    layout: {
      name: "preset",
      positions
    },
    minZoom: 0.45,
    maxZoom: 2.2,
    wheelSensitivity: 0.18,
    style: [
      {
        selector: "node",
        style: {
          width: 44,
          height: 44,
          "background-color": "#425c9f",
          "border-width": 1,
          "border-color": "#8193d2",
          label: "data(label)",
          color: "#cbd5f1",
          "font-size": state.graphMode === "executive" ? 10 : 8,
          "font-weight": 500,
          "text-wrap": "wrap",
          "text-max-width": state.graphMode === "executive" ? 130 : 110,
          "text-valign": "bottom",
          "text-margin-y": 10,
          "text-background-color": "#071321",
          "text-background-opacity": 0.82,
          "text-background-padding": 3,
          "text-background-shape": "roundrectangle"
        }
      },
      {
        selector: 'node[kind = "Capability"]',
        style: {
          shape: "round-rectangle",
          width: 72,
          height: 34,
          "background-color": "#1d6f69",
          "border-color": "#5bc7b5"
        }
      },
      {
        selector: 'node[kind = "Repository"]',
        style: {
          width: 86,
          height: 86,
          "background-color": "#4b45a5",
          "border-width": 3,
          "border-color": "#9b94ff",
          "font-size": 11
        }
      },
      {
        selector: 'node[kind = "Symbol"]',
        style: {
          width: 28,
          height: 28,
          "background-color": "#8b6735",
          "border-color": "#d3a961"
        }
      },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": "#485c82",
          "target-arrow-color": "#647ba8",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: 0.72
        }
      },
      {
        selector: 'edge[type = "IMPLEMENTED_IN"]',
        style: {
          "line-color": "#9b743d",
          "target-arrow-color": "#c49a58"
        }
      },
      {
        selector: ".faded",
        style: { opacity: 0.12 }
      },
      {
        selector: ".focused",
        style: {
          opacity: 1,
          "border-width": 3,
          "border-color": "#6ff0ce",
          "line-color": "#6ff0ce",
          "target-arrow-color": "#6ff0ce"
        }
      }
    ]
  });

  state.graphInstance.on("tap", "node", (event) => {
    const node = event.target;
    const neighborhood = node.closedNeighborhood();
    state.graphInstance.elements().addClass("faded");
    neighborhood.removeClass("faded").addClass("focused");
    renderGraphInspector(node.data());
  });
  state.graphInstance.on("tap", "edge", (event) => {
    const edge = event.target;
    state.graphInstance.elements().addClass("faded");
    edge.removeClass("faded").addClass("focused");
    edge.connectedNodes().removeClass("faded").addClass("focused");
    renderGraphInspector(edge.data(), true);
  });
  state.graphInstance.on("tap", (event) => {
    if (event.target === state.graphInstance) {
      state.graphInstance.elements().removeClass("faded focused");
    }
  });
  state.graphInstance.fit(undefined, 34);
}

function openGraph() {
  const panel = document.querySelector("#graphPanel");
  state.graphReturnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    renderGraph();
    document.querySelector("#closeGraphButton").focus({ preventScroll: true });
  }, 180);
}

async function loadIntelligenceSettings() {
  state.intelligenceSettings = await window.oneopc.getIntelligenceSettings();
  document.querySelector("#intelligenceMode").value =
    state.intelligenceSettings.mode;
  document.querySelector("#intelligenceTransport").value =
    state.intelligenceSettings.transport;
}

async function updateIntelligenceSettings(patch) {
  state.intelligenceSettings = await window.oneopc.setIntelligenceSettings({
    ...state.intelligenceSettings,
    ...patch
  });
  document.querySelector("#intelligenceMode").value =
    state.intelligenceSettings.mode;
  document.querySelector("#intelligenceTransport").value =
    state.intelligenceSettings.transport;
  renderIntelligence();
}

function selectStage(index, openDetail = false) {
  state.selectedStage = index;
  renderStageNavigation();
  renderStageDetail();
  if (openDetail) setView("detail");
}

function executiveEmployeeProfile(team, ownerRoleByStage) {
  const index = state.executiveEmployeeStage;
  if (state.view !== "overview" || !Number.isInteger(index)) return "";

  const employee =
    team.find((member) => member.roleId === ownerRoleByStage[index]) || team[0];
  if (!employee) return "";

  const stage = state.run.stages[index];
  const stageStatus = stageState(index);
  const upstream =
    index === 0
      ? {
          employeeName: "需求文档",
          name: "项目输入",
          stage: state.run.input?.name || "原始需求"
        }
      : {
          ...(team.find(
            (member) => member.roleId === ownerRoleByStage[index - 1]
          ) || {}),
          stage: state.run.stages[index - 1]
        };
  const downstream =
    index === state.run.stages.length - 1
      ? {
          employeeName: "可体验系统",
          name: "最终交付",
          stage: state.run.output?.url ? "已开放体验" : "等待验收完成"
        }
      : {
          ...(team.find(
            (member) => member.roleId === ownerRoleByStage[index + 1]
          ) || {}),
          stage: state.run.stages[index + 1]
        };
  const work =
    stageStatus === "done"
      ? `已完成「${stage}」，成果已交给下一环节。`
      : stageStatus === "active"
        ? `正在负责「${stage}」，系统持续记录真实进展。`
        : `将在「${stage}」阶段接棒，当前保持待命。`;
  const recent =
    employee.latestActivity?.summary ||
    (stageStatus === "pending" ? "等待上游完成后自动接棒" : work);

  return `
    <section class="executive-employee-profile" aria-live="polite">
      <div class="profile-employee-portrait ${escapeHtml(employee.roleId)}">
        ${employeePortraitMarkup(employee)}
        <span>${escapeHtml(coordinatorStateText(employee.state))}</span>
      </div>
      <div class="profile-employee-intro">
        <span>DIGITAL EMPLOYEE</span>
        <h3>${escapeHtml(employee.employeeName)}</h3>
        <b>${escapeHtml(employee.name || employee.roleName)}</b>
        <p>${escapeHtml(employee.responsibility)}</p>
        <div>${(employee.skills || [])
          .slice(0, 3)
          .map((skill) => `<em>${escapeHtml(skill)}</em>`)
          .join("")}</div>
      </div>
      <div class="profile-current-work">
        <span>本阶段工作</span>
        <h3>${escapeHtml(stage)}</h3>
        <p>${escapeHtml(work)}</p>
        <small>最近动作 · ${escapeHtml(recent)}</small>
      </div>
      <div class="profile-handoff">
        <span>协作关系</span>
        <div class="handoff-party upstream">
          <i>接</i>
          <p><small>上游 · ${escapeHtml(upstream.name || upstream.roleName)}</small><b>${escapeHtml(upstream.employeeName)}</b><em>${escapeHtml(upstream.stage)}</em></p>
        </div>
        <div class="handoff-flow" aria-hidden="true"><i></i></div>
        <div class="handoff-party downstream">
          <i>交</i>
          <p><small>下游 · ${escapeHtml(downstream.name || downstream.roleName)}</small><b>${escapeHtml(downstream.employeeName)}</b><em>${escapeHtml(downstream.stage)}</em></p>
        </div>
      </div>
      <button class="profile-close-button" id="closeExecutiveEmployeeProfile" title="关闭员工详情" aria-label="关闭员工详情">×</button>
    </section>
  `;
}

function renderStageNavigation() {
  if (!state.run) return;

  const team = state.run.coordination?.team || [];
  const ownerRoleByStage = [
    "conductor",
    "conductor",
    "researcher",
    "builder",
    "verifier",
    "builder",
    "builder",
    "conductor"
  ];
  const trace = activeTrajectoryStep(state.run);
  const traceStage = Number(trace?.stage ?? state.run.currentStage ?? 0);
  const traceOwner =
    team.find((employee) => employee.employeeId === trace?.employeeId) ||
    team.find((employee) => employee.roleId === trace?.roleId) ||
    team[0];
  elements.stageTrack.innerHTML = `
    <header class="project-track-header">
      <div>
        <span>PROJECT EXECUTION TRACK</span>
        <b>阶段与数字员工协作轨道</b>
      </div>
      <p>
        <span class="track-live-avatar ${escapeHtml(
          trace?.roleId || "conductor"
        )}">${employeePortraitMarkup(
          traceOwner || {
            roleId: trace?.roleId || "conductor",
            employeeName: trace?.employeeName || "交付系统"
          }
        )}</span>
        <span><b>${escapeHtml(trace?.employeeName || "交付系统")}</b>${escapeHtml(
          trace?.summary || "等待真实执行事件"
        )}</span>
        <time>${trace?.at ? formatTime(trace.at) : "--:--:--"}</time>
      </p>
      <button id="trajectoryToggleButton">${state.trajectoryPlaying ? "暂停" : "继续"}</button>
    </header>
    <div class="project-stage-grid">
      ${state.run.stages
        .map((stage, index) => {
          const stageClass = stageState(index);
          const marker = stageClass === "done" ? "✓" : index + 1;
          const owner =
            team.find(
              (employee) => employee.roleId === ownerRoleByStage[index]
            ) || team[0];
          return `
            <button class="stage-button ${stageClass} ${
              index === traceStage ? "trace-active" : ""
            } ${
              index === state.executiveEmployeeStage ? "employee-selected" : ""
            }" data-stage="${index}" aria-label="查看${escapeHtml(
              owner?.employeeName || "数字员工"
            )}在${escapeHtml(stage)}阶段的工作">
              <span class="stage-index">${marker}</span>
              <span class="stage-employee-avatar ${escapeHtml(
                owner?.roleId || "conductor"
              )}">
                ${employeePortraitMarkup(
                  owner || {
                    roleId: ownerRoleByStage[index],
                    employeeName: "待分配"
                  }
                )}
                <em></em>
              </span>
              <span class="stage-name">${escapeHtml(stage)}</span>
              <span class="stage-owner ${escapeHtml(owner?.roleId || "")}">
                <b>${escapeHtml(owner?.employeeName || "待分配")}</b>
                <small>${escapeHtml(owner?.name || owner?.roleName || "数字员工")}</small>
              </span>
              ${index === traceStage ? `<em class="stage-live-signal"></em>` : ""}
            </button>
          `;
        })
        .join("")}
    </div>
    ${executiveEmployeeProfile(team, ownerRoleByStage)}`;

  elements.detailStageList.innerHTML = state.run.stages
    .map((stage, index) => {
      const stageClass = stageState(index);
      return `
        <button
          class="detail-stage-button ${stageClass} ${
            index === state.selectedStage ? "active" : ""
          }"
          data-detail-stage="${index}"
        >
          <i></i>
          <span>${escapeHtml(stage)}</span>
          <small>${stageClass === "active" ? "当前" : stageClass === "done" ? "完成" : "等待"}</small>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.stage);
      if (state.view === "overview") {
        state.executiveEmployeeStage = index;
        renderStageNavigation();
        window.requestAnimationFrame(() => {
          document
            .querySelector(".executive-employee-profile")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      } else {
        selectStage(index);
      }
    });
  });
  document
    .querySelector("#closeExecutiveEmployeeProfile")
    ?.addEventListener("click", () => {
      state.executiveEmployeeStage = null;
      renderStageNavigation();
    });
  document
    .querySelector("#trajectoryToggleButton")
    ?.addEventListener("click", () => {
      state.trajectoryPlaying = !state.trajectoryPlaying;
      renderStageNavigation();
    });
  document.querySelectorAll("[data-detail-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      selectStage(Number(button.dataset.detailStage));
    });
  });
}

function renderStageDetail() {
  if (!state.run) return;

  const stageName = state.run.stages[state.selectedStage];
  const events = state.run.events.filter(
    (event) => event.stage === state.selectedStage
  );
  document.querySelector("#detailStageTitle").textContent = stageName;
  document.querySelector("#footerStage").textContent = stageName;

  if (events.length === 0) {
    elements.eventStream.innerHTML = `
      <div class="event-row">
        <time>--:--:--</time>
        <span class="event-node"></span>
        <div class="event-copy">
          <b>该阶段尚未开始</b>
          <code>等待上游阶段与执行器就绪</code>
        </div>
      </div>
    `;
  } else {
    elements.eventStream.innerHTML = events
      .map(
        (event) => `
          <div class="event-row">
            <time>${formatTime(event.at)}</time>
            <span class="event-node"></span>
            <div class="event-copy">
              <b>${escapeHtml(event.summary)}</b>
              <code>${escapeHtml(event.type)} · ${escapeHtml(event.detail)}</code>
            </div>
          </div>
        `
      )
      .join("");
  }

  elements.rawLog.textContent =
    events.length === 0
      ? "No events recorded for this stage."
      : events.map((event) => JSON.stringify(event)).join("\n");

  const stageStatus = stageState(state.selectedStage);
  const output = state.run.output;
  const intelligence = state.run.techIntelligence;
  const intelligenceEvidence =
    state.selectedStage === 2 && intelligence
      ? `
        <section class="inspector-intelligence">
          <span>TECH REFERENCE EVIDENCE</span>
          <strong>${escapeHtml(intelligenceStatusText(intelligence.status))}</strong>
          <p>${escapeHtml(
            intelligence.recommendation?.summary ||
              "该能力未改变主交付状态。"
          )}</p>
          <code>${intelligence.funnel?.collected || 0} 条情报 / ${
            intelligence.candidates?.length || 0
          } 个候选 / 0 个自动采用</code>
          ${
            intelligence.artifact
              ? `<button id="revealIntelligenceArtifact">定位证据文件</button>`
              : ""
          }
        </section>
      `
      : "";
  elements.stageInspector.innerHTML = `
    ${
      output?.url
        ? `
          <section class="inspector-output">
            <span class="inspector-output-label">DELIVERED SYSTEM</span>
            <strong>系统已部署并通过健康检查</strong>
            <code>${escapeHtml(output.url)}</code>
            <button id="detailOutputButton">立即打开体验</button>
          </section>
        `
        : ""
    }
    ${intelligenceEvidence}
    <div class="inspector-fact">
      <span>阶段</span>
      <b>${escapeHtml(stageName)}</b>
    </div>
    <div class="inspector-fact">
      <span>状态</span>
      <b>${stageStatus}</b>
    </div>
    <div class="inspector-fact">
      <span>事件数量</span>
      <b>${events.length}</b>
    </div>
    <div class="inspector-fact">
      <span>运行目录</span>
      <b>work/runs/${escapeHtml(state.run.id)}/run.json</b>
    </div>
    <div class="inspector-fact">
      <span>信任说明</span>
      <b>界面只呈现已落盘事件；未执行阶段不会显示模拟进度。</b>
    </div>
  `;
  document.querySelector("#detailOutputButton")?.addEventListener("click", () => {
    window.oneopc.openOutput(output.url);
  });
  document
    .querySelector("#revealIntelligenceArtifact")
    ?.addEventListener("click", () => {
      window.oneopc.revealPath(intelligence.artifact);
    });
}

function renderEventSummary() {
  const recent = state.run.events
    .filter(
      (event) =>
        !String(event.type || "").includes("codegraph") &&
        !String(event.type || "").startsWith("tech_intelligence.") &&
        !String(event.type || "").startsWith("intelligence.")
    )
    .slice(-3);
  document.querySelector("#eventSummary").innerHTML = recent
    .map(
      (event) => `
        <div class="summary-event">
          ${escapeHtml(event.summary)}
          <time>${formatTime(event.at)}</time>
        </div>
      `
    )
    .join("") || `
      <div class="summary-event">
        项目已进入自动交付队列
        <time>持续监管中</time>
      </div>
    `;
}

function developerTaskStateText(value) {
  return {
    waiting: "等待工具响应",
    running: "当前任务执行中",
    starting: "任务正在启动",
    completed: "当前任务已完成",
    unverified: "进程在线，任务待确认",
    "different-task": "正在执行其他任务",
    "not-running": "进程未运行",
    stale: "任务心跳超时",
    idle: "当前任务空闲"
  }[value] || "任务状态未知";
}

function developerToolDetail(tool) {
  const task = developerTaskStateText(tool.taskState);
  if (tool.pid) return `${task} · PID ${tool.pid}`;

  const process = processStateText(tool.processState);
  return task === process ? task : `${task} · ${process}`;
}

function renderExecutiveView(run) {
  const stage = Number(run.currentStage || 0);
  const roleByStage = [
    "conductor",
    "conductor",
    "researcher",
    "builder",
    "verifier",
    "builder",
    "builder",
    "conductor"
  ];
  const team = run.coordination?.team || [];
  const owner =
    team.find((member) => member.roleId === roleByStage[stage]) || team[0];
  const nextStage = run.stages?.[stage + 1];
  const decisions = run.coordination?.decisions || [];
  const supervision = run.supervision || {};
  const blocked =
    ["stalled", "failed"].includes(supervision.state) ||
    run.status === "failed";
  const risk = decisions[0];
  const intelligence = run.techIntelligence;
  const topCandidate = intelligence?.candidates?.[0];
  const verifiedScore = intelligence?.graph?.evidence?.verifiedFitScore;

  document.querySelector("#executiveProgress").style.setProperty(
    "--progress",
    `${Math.max(0, Math.min(100, Number(run.progress || 0)))}%`
  );
  document.querySelector("#executiveOwnerName").textContent =
    owner?.employeeName || "数字员工小队";
  document.querySelector("#executiveOwnerRole").textContent =
    owner?.name || owner?.roleName || "交付指挥官";
  document.querySelector("#executiveOwnerAvatar").innerHTML =
    employeePortraitMarkup(
      owner || {
        roleId: "conductor",
        employeeName: "数字员工"
      }
    );
  document.querySelector("#executiveOwnerTask").textContent =
    owner?.assignment ||
    (run.status === "completed"
      ? "本轮交付已完成"
      : `正在推进${run.stages?.[stage] || "当前阶段"}`);
  document.querySelector("#executiveOwnerNext").textContent =
    run.status === "completed"
      ? "系统已通过验收，可直接打开体验"
      : nextStage
        ? `下一步：${nextStage}`
        : "下一步：完成验收并开放体验";

  const riskCard = document.querySelector("#executiveRiskCard");
  riskCard.classList.toggle("attention", blocked || Boolean(risk));
  document.querySelector("#executiveRiskTitle").textContent =
    risk?.summary || (blocked ? "交付推进遇到阻塞" : "当前无阻断风险");
  document.querySelector("#executiveRiskLevel").textContent =
    blocked ? "需关注" : risk ? "待决策" : "正常";
  document.querySelector("#executiveRiskDetail").textContent =
    risk?.action ||
    (blocked
      ? "系统已保留当前进度，修复后将从最近位置继续。"
      : "后台监管持续检查执行状态，异常会自动恢复并从上次进度继续。");

  document.querySelector("#executiveTechTitle").textContent = topCandidate
    ? `已找到 ${topCandidate.title}`
    : intelligence?.status === "running"
      ? "正在寻找可复用方案"
      : "不影响主交付";
  document.querySelector("#executiveTechScore").textContent =
    verifiedScore !== undefined
      ? `${verifiedScore} 分`
      : topCandidate?.score !== undefined
        ? `${topCandidate.score} 分`
        : "可选";
  document.querySelector("#executiveTechSummary").textContent =
    topCandidate?.adoption_advice ||
    intelligence?.recommendation?.summary ||
    "技术雷达仅提供方案建议，最终交付不会依赖未经验证的外部项目。";

  document.querySelector("#executiveExperienceState").textContent =
    run.output?.url ? "现在可体验" : `还需 ${Math.max(1, 8 - stage)} 个阶段`;
  document.querySelector("#executiveExperienceHint").textContent =
    run.output?.url
      ? "系统已完成本地部署与健康检查"
      : "完成部署与验收后即可直接打开";
}

function renderDeveloperView(run) {
  const supervision = run.supervision || {};
  const checkpoint = supervision.checkpoint || {};
  const recovery = supervision.recovery || {};
  const tools = supervision.tools || {};
  const lastScanAt = supervision.monitor?.lastScanAt;

  document.querySelector("#developerRunId").textContent = run.id;
  document.querySelector("#developerCheckpoint").textContent =
    `${checkpoint.stepId || "尚未保存"} · 序号 ${checkpoint.sequence || 0}`;
  document.querySelector("#developerRecoveryCount").textContent =
    `${recovery.restartCount || 0} / ${recovery.retryCount || 0}`;
  document.querySelector("#developerMonitorTime").textContent = lastScanAt
    ? formatTime(lastScanAt)
    : "等待扫描";
  document.querySelector("#developerSupervisorState").textContent =
    supervisionStateText(supervision.state);
  document.querySelector("#developerRecoveryTitle").textContent =
    recoveryReasonText(recovery.lastReason);
  document.querySelector("#developerRecoveryDetail").textContent =
    supervision.state === "recovering"
      ? `将从 ${checkpoint.stepId || "最近检查点"} 继续执行`
      : `恢复预算 ${recovery.restartCount || 0}/${supervision.policy?.maxRestarts || 3}，重试预算 ${recovery.retryCount || 0}/${supervision.policy?.maxRetries || 5}`;

  for (const [role, prefix] of [
    ["work", "Work"],
    ["code", "Code"]
  ]) {
    const tool = tools[role];
    const online = tool?.processState === "online";
    const stateElement = document.querySelector(`#developer${prefix}State`);
    stateElement.textContent = online ? "在线" : tool ? "离线" : "未接管";
    stateElement.className = online ? "online" : "offline";
    document.querySelector(`#developer${prefix}Name`).textContent =
      tool?.name || selectedTool(role)?.name || "未发现受管工具";
    document.querySelector(`#developer${prefix}Detail`).textContent = tool
      ? developerToolDetail(tool)
      : "进程与当前任务状态尚未确认";
  }
}

function renderRun() {
  const run = state.run;
  if (!run) return;

  renderToolchain();

  const currentStatusText =
    run.status === "completed" ? "交付完成" : statusText(run.status);
  document.querySelector("#headerStatus").textContent = currentStatusText;
  document.querySelector("#headerRunId").textContent = run.id;
  document.querySelector("#workspaceProjectTitle").textContent = run.title;
  document.querySelector("#workspaceVersionLabel").textContent =
    `V${run.version} / ${run.versionCount}`;
  document.querySelector("#footerRun").textContent = run.id;
  document.querySelector("#inputFileName").textContent =
    run.input.type === "text"
      ? `文字描述 · ${run.input.name}`
      : run.input.name;
  document.querySelector("#eventCount").textContent = run.events.length;
  document.querySelector("#footerEvents").textContent = run.events.length;
  document.querySelector("#progressLabel").textContent = `${run.progress}%`;
  document.querySelector("#globalProgressBar").style.width = `${run.progress}%`;
  const statusPill = document.querySelector("#runStatusPill");
  statusPill.className = `status-pill ${
    run.status === "completed" ? "complete" : "waiting"
  }`;
  statusPill.innerHTML = `<span></span>${escapeHtml(currentStatusText)}`;

  document.querySelector("#currentStageTitle").textContent =
    run.status === "completed"
      ? "本地系统已交付"
      : run.progress === 0
        ? "需求输入已就绪"
        : `${run.stages[run.currentStage]}进行中`;
  document.querySelector("#focusSummary").textContent =
    run.status === "completed"
      ? "系统已完成部署和验收"
      : `${run.stages?.[run.currentStage] || "当前阶段"}正在自动推进`;
  document.querySelector("#focusDetail").textContent =
    run.status === "completed"
      ? "交付目标已完成，系统已通过本地健康检查。"
      : "数字员工小队正在自动推进，只有出现阻断风险时才需要您介入。";

  const outputButton = document.querySelector("#openOutputButton");
  if (run.output?.url) {
    outputButton.disabled = false;
    outputButton.textContent = "打开已交付系统";
  } else {
    outputButton.disabled = true;
    outputButton.textContent = "尚未就绪";
  }

  renderExecutiveView(run);
  renderDeveloperView(run);
  renderStageNavigation();
  renderStageDetail();
  renderEventSummary();
  renderIntelligence();
  renderCoordination(run);
}

function setRequirementInputMode(mode, { focusPanel = true } = {}) {
  const textMode = mode === "text";
  document.querySelector("#requirementTextPanel").hidden = !textMode;
  document.querySelector("#requirementTextForm").hidden = !textMode;
  document.querySelector("#requirementFilePanel").hidden = textMode;
  document.querySelectorAll("[data-requirement-mode]").forEach((button) => {
    const active = button.dataset.requirementMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (focusPanel) {
    window.requestAnimationFrame(() => {
      document
        .querySelector(textMode ? "#requirementTitle" : "#chooseRequirementFileButton")
        ?.focus();
    });
  }
}

async function openRequirementDialog() {
  await inputDraftsReady;
  const dialog = document.querySelector("#requirementDialog");
  document.querySelector("#requirementTextForm").reset();
  state.inputDraftBases.requirement = { title: "", description: "" };
  const saved = state.inputDrafts.requirement;
  const restored =
    saved && inputDraftDiffersFromBase("requirement", saved);
  applyInputDraftPayload(
    "requirement",
    restored ? saved : state.inputDraftBases.requirement
  );
  setInputDraftStatus(
    "requirement",
    restored
      ? "已恢复上次未提交的需求草稿"
      : "未提交内容将自动保存在本机",
    restored ? "saved" : ""
  );
  setRequirementInputMode("text", { focusPanel: false });
  openModal(dialog, "#requirementTitle");
  consumeInputDraftRecoveryNotice();
}

async function closeRequirementDialog() {
  await saveInputDraftNow("requirement");
  document.querySelector("#requirementDialog").close();
}

async function completeRequirementImport(run, successMessage) {
  if (!run) return;
  await clearInputDraft("requirement");
  document.querySelector("#requirementDialog").close();
  await refreshRuns(true);
  openRun(run.id);
  notify(successMessage || `已创建交付运行 ${run.id}`);
}

async function importRequirementFile() {
  const button = document.querySelector("#chooseRequirementFileButton");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "正在选择…";
  try {
    const run = await window.oneopc.importRequirement();
    await completeRequirementImport(run);
  } catch (error) {
    notify(`导入失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "选择需求文档";
  }
}

async function importTextRequirement() {
  const form = document.querySelector("#requirementTextForm");
  if (!form.reportValidity()) return;
  const button = document.querySelector("#submitTextRequirementButton");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "正在创建交付…";
  try {
    const run = await window.oneopc.importTextRequirement({
      title: document.querySelector("#requirementTitle").value,
      description: document.querySelector("#requirementDescription").value
    });
    await completeRequirementImport(run, "文字需求已归档，自动交付已启动");
  } catch (error) {
    notify(`创建交付失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "开始自动交付";
  }
}

async function refreshRuns(silent = false) {
  try {
    const taskFocus = captureTaskFocus();
    const nextRuns = versionRuns(await window.oneopc.listRuns());
    const nextSignature = runsDataSignature(nextRuns);
    const changed = nextSignature !== state.dataSignature;
    state.runs = nextRuns;
    state.dataSignature = nextSignature;
    state.lastRunRefreshError = null;
    const selectedId = state.run?.id;
    if (selectedId) {
      state.run =
        state.runs.find((candidate) => candidate.id === selectedId) || null;
    }
    renderNavigationCounts();
    if (!changed) return true;

    if (state.page === "workspace" && state.run) {
      if (state.view === "overview") {
        state.selectedStage = state.run.currentStage || 0;
      }
      measureRender("workspace", renderRun);
    } else if (state.page === "workspace" && !state.run) {
      setPage("home");
    } else {
      renderCurrentPage();
    }
    restoreTaskFocus(taskFocus);
    return true;
  } catch (error) {
    state.lastRunRefreshError = error;
    if (!silent) notify(`读取运行记录失败：${error.message}`);
    return false;
  }
}

document.querySelector("#importButton").addEventListener("click", openRequirementDialog);
document.querySelector("#homeImportButton").addEventListener("click", openRequirementDialog);
document.querySelector("#historyImportButton").addEventListener("click", openRequirementDialog);
document
  .querySelector("#closeRequirementDialogButton")
  .addEventListener("click", closeRequirementDialog);
document
  .querySelector("#discardRequirementDraftButton")
  .addEventListener("click", () => discardInputDraft("requirement"));
document
  .querySelector("#chooseRequirementFileButton")
  .addEventListener("click", importRequirementFile);
document
  .querySelector("#requirementTextForm")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    importTextRequirement();
  });
document
  .querySelector("#requirementTextForm")
  .addEventListener("input", () => scheduleInputDraftSave("requirement"));
document
  .querySelector("#requirementDescription")
  .addEventListener("input", (event) => {
    document.querySelector("#requirementCharacterCount").textContent =
      event.target.value.length.toLocaleString("zh-CN");
  });
document
  .querySelector("#requirementDescription")
  .addEventListener("keydown", (event) => {
    if (event.metaKey && event.key === "Enter") {
      event.preventDefault();
      importTextRequirement();
    }
  });
document.querySelectorAll("[data-requirement-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    setRequirementInputMode(button.dataset.requirementMode);
  });
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const tabs = [
      ...document.querySelectorAll("[data-requirement-mode]")
    ];
    const currentIndex = tabs.indexOf(button);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setRequirementInputMode(nextTab.dataset.requirementMode, {
      focusPanel: false
    });
    nextTab.focus();
  });
});
document.querySelector("#refreshButton").addEventListener("click", async () => {
  await executeModule("runs");
  renderModuleDependentViews();
});
document
  .querySelector("#rescanToolsButton")
  .addEventListener("click", async () => {
    const recovered = await executeModule("tools");
    if (recovered) notify("本机研发工具已重新识别");
  });
document
  .querySelector("#retryFailedModulesButton")
  .addEventListener("click", () => retryModules());
document
  .querySelector("#toolchainExpandButton")
  .addEventListener("click", () => {
    state.toolchainExpanded = !state.toolchainExpanded;
    updateToolchainDensity();
  });
document.querySelector("#dismissToastButton").addEventListener("click", () => {
  dismissToast();
});
document.querySelector("#toastActionButton").addEventListener("click", async () => {
  const action = state.toastAction;
  if (!action) return;
  const button = document.querySelector("#toastActionButton");
  button.disabled = true;
  button.textContent = "处理中…";
  try {
    await action();
  } catch (error) {
    notify(`撤销失败：${error.message}`, "error");
  }
});
document.querySelector("#actionDialog").addEventListener("close", (event) => {
  resolveConfirmation(event.currentTarget.returnValue === "confirm");
});
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("close", () => restoreModalFocus(dialog));
});
document.querySelector("#scanTasksButton").addEventListener("click", async () => {
  const button = document.querySelector("#scanTasksButton");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "正在检查";
  try {
    const scanned = await executeModule("supervisor");
    const refreshed = scanned ? await executeModule("runs") : false;
    renderModuleDependentViews();
    if (scanned && refreshed) {
      notify("健康检查完成，任务快照已更新");
    } else {
      notify("健康检查未完成，请查看页面中的故障说明");
    }
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "立即健康检查";
  }
});
document.querySelector("#createEmployeeButton").addEventListener("click", () => {
  openEmployeeDialog();
});
async function closeEmployeeDialog() {
  await saveInputDraftNow("employee");
  document.querySelector("#employeeDialog").close();
}
document
  .querySelector("#closeEmployeeDialogButton")
  .addEventListener("click", closeEmployeeDialog);
document
  .querySelector("#cancelEmployeeDialogButton")
  .addEventListener("click", closeEmployeeDialog);
document
  .querySelector("#discardEmployeeDraftButton")
  .addEventListener("click", () => discardInputDraft("employee"));
document
  .querySelector("#employeeForm")
  .addEventListener("input", () => scheduleInputDraftSave("employee"));
document
  .querySelector("#employeeForm")
  .addEventListener("change", () => scheduleInputDraftSave("employee"));
document.querySelector("#employeeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#saveEmployeeButton");
  const idleLabel = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "正在保存…";
  try {
    await window.oneopc.saveEmployee({
      id: document.querySelector("#employeeId").value || undefined,
      name: document.querySelector("#employeeName").value,
      roleId: document.querySelector("#employeeRole").value,
      department: document.querySelector("#employeeDepartment").value,
      toolBinding: document.querySelector("#employeeToolBinding").value,
      responsibility: document.querySelector("#employeeResponsibility").value,
      skills: document.querySelector("#employeeSkills").value
    });
    await clearInputDraft("employee");
    document.querySelector("#employeeDialog").close();
    await refreshEmployees();
    notify("数字员工档案已保存并上岗");
  } catch (error) {
    notify(`创建数字员工失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = idleLabel;
  }
});
document
  .querySelector("#openRadarSourceButton")
  .addEventListener("click", () => window.oneopc.focusTechnologyExploration());
document
  .querySelector("#intelligenceMode")
  .addEventListener("change", async (event) => {
    try {
      await updateIntelligenceSettings({
        mode: event.target.value
      });
      notify(
        `技术参考模式已设为 ${
          {
            smart: "智能启用",
            always: "始终启用",
            off: "关闭"
          }[state.intelligenceSettings.mode]
        }`
      );
    } catch (error) {
      notify(`保存技术参考模式失败：${error.message}`);
    }
  });
document
  .querySelector("#intelligenceTransport")
  .addEventListener("change", async (event) => {
    const transport = event.target.value;
    await updateIntelligenceSettings({
      transport,
      fallbackTransport:
        transport === "computer_use" ? "provider_api" : "computer_use"
    });
    notify(`技术参考默认使用方式：${transportText(transport)}`);
  });
document.querySelectorAll("[data-intelligence-transport]").forEach((button) => {
  button.addEventListener("click", async () => {
    const transport = button.dataset.intelligenceTransport;
    await updateIntelligenceSettings({
      transport,
      fallbackTransport:
        transport === "computer_use" ? "provider_api" : "computer_use"
    });
    notify(`技术参考默认使用方式：${transportText(transport)}`);
  });
});
document.querySelectorAll("[data-intelligence-depth]").forEach((button) => {
  button.addEventListener("click", async () => {
    await updateIntelligenceSettings({
      depth: button.dataset.intelligenceDepth
    });
    notify(`分析深度已更新`);
  });
});
document
  .querySelector("#focusExplorationButton")
  .addEventListener("click", async () => {
    await window.oneopc.focusTechnologyExploration();
  });
document
  .querySelector("#intelligenceSettingsButton")
  .addEventListener("click", () => {
    state.intelligenceSettingsOpen = !state.intelligenceSettingsOpen;
    renderIntelligence();
  });
document
  .querySelector("#toggleCandidatesButton")
  .addEventListener("click", () => {
    state.candidatesExpanded = !state.candidatesExpanded;
    renderIntelligence();
  });
document.querySelector("#closeGraphButton").addEventListener("click", () => {
  closeGraph();
});
document.querySelectorAll("[data-graph-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.graphMode = button.dataset.graphMode;
    document.querySelectorAll("[data-graph-mode]").forEach((candidate) => {
      candidate.classList.toggle("selected", candidate === button);
    });
    renderGraph();
  });
});
document
  .querySelector("#runIntelligenceButton")
  .addEventListener("click", async () => {
    if (!state.run) return;
    const button = document.querySelector("#runIntelligenceButton");
    state.intelligencePending = true;
    button.disabled = true;
    button.textContent = "正在检索";
    try {
      await window.oneopc.runIntelligence(state.run.id);
      await refreshRuns(true);
      notify("技术参考检索已完成");
    } catch (error) {
      notify(`技术参考检索失败：${error.message}`);
      await refreshRuns(true);
    } finally {
      state.intelligencePending = false;
      renderIntelligence();
    }
  });
document.querySelector("#showDetailButton").addEventListener("click", () => {
  selectStage(state.run.currentStage, true);
});
document.querySelector("#revealInputButton").addEventListener("click", async () => {
  if (!state.run) return;
  await window.oneopc.revealPath(state.run.input.archivedPath);
});
document.querySelector("#openOutputButton").addEventListener("click", async () => {
  if (!state.run?.output?.url) return;
  await window.oneopc.openOutput(state.run.output.url);
});
document
  .querySelector("#headerOutputButton")
  .addEventListener("click", async () => {
    if (!state.run?.output?.url) return;
    await window.oneopc.openOutput(state.run.output.url);
  });

document.querySelector("#brandHomeButton").addEventListener("click", () => {
  setPage("home");
});
document.querySelector("#backToHistoryButton").addEventListener("click", () => {
  setPage("history");
});
document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});
document.querySelector("#historySearch").addEventListener("input", (event) => {
  state.historyQuery = event.target.value.trim();
  state.historyVisibleGroups = RENDER_LIMITS.historyGroups;
  state.historyVersionLimits.clear();
  measureRender("history", renderHistory);
});
document.querySelectorAll("[data-history-status]").forEach((button) => {
  button.addEventListener("click", () => {
    state.historyStatus = button.dataset.historyStatus;
    state.historyVisibleGroups = RENDER_LIMITS.historyGroups;
    state.historyVersionLimits.clear();
    document.querySelectorAll("[data-history-status]").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    measureRender("history", renderHistory);
  });
});

document.querySelectorAll(".view-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll(".agent-card").forEach((button) => {
  button.addEventListener("click", () => {
    selectStage(Number(button.dataset.stageIndex), true);
  });
});

document.querySelectorAll(".log-tab").forEach((button) => {
  button.addEventListener("click", () => {
    const raw = button.dataset.tab === "raw";
    document.querySelectorAll(".log-tab").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    elements.eventStream.classList.toggle("hidden", raw);
    elements.rawLog.classList.toggle("active", raw);
  });
});

document.addEventListener("keydown", (event) => {
  if (trapActiveModalFocus(event)) return;

  if (event.key === "Escape") {
    if (document.querySelector("#actionDialog").open) {
      document.querySelector("#actionDialog").close("cancel");
      return;
    }
    if (document.querySelector("#requirementDialog").open) {
      closeRequirementDialog();
      return;
    }
    if (document.querySelector("#employeeDialog").open) {
      closeEmployeeDialog();
      return;
    }
    if (!document.querySelector("#graphPanel").hidden) {
      closeGraph();
      return;
    }
    if (state.executiveEmployeeStage !== null) {
      state.executiveEmployeeStage = null;
      renderStageNavigation();
      return;
    }
    dismissToast();
  }

  if (!event.metaKey || event.altKey || event.ctrlKey) return;
  const target = event.target;
  if (target.matches("input, textarea, select")) return;

  const pageByKey = {
    "1": "home",
    "2": "history",
    "3": "tasks",
    "4": "employees",
    "5": "radar"
  };
  if (pageByKey[event.key]) {
    event.preventDefault();
    setPage(pageByKey[event.key]);
    focusPageHeading(pageByKey[event.key]);
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    openRequirementDialog();
  }
});

window.oneopc.onAppCommand((command) => {
  if (command.startsWith("density:")) {
    applyInterfaceDensity(command.slice("density:".length), {
      announce: true
    });
    return;
  }
  if (command === "runtime-recovered") {
    notify("控制中心已从运行异常中自动恢复", "success");
    return;
  }
  if (command === "new-requirement") {
    openRequirementDialog();
    return;
  }
  if (command.startsWith("page:")) {
    const page = command.slice("page:".length);
    setPage(page);
    focusPageHeading(page);
    return;
  }
  const commandButton = {
    "scan-tasks": "#scanTasksButton",
    "rescan-tools": "#rescanToolsButton",
    "refresh-runs": "#refreshButton"
  }[command];
  document.querySelector(commandButton)?.click();
});
window.oneopc.onDraftFlushRequest(flushPendingInputDrafts);

async function executeModule(id) {
  const tasks = {
    tools: () => detectTools(false),
    settings: () => loadIntelligenceSettings(),
    employees: () => refreshEmployees(),
    supervisor: () => window.oneopc.scanTasks(),
    runs: async () => {
      const loaded = await refreshRuns(true);
      if (!loaded) {
        throw state.lastRunRefreshError || new Error("无法读取本地项目与版本");
      }
    }
  };
  const task = tasks[id];
  if (!task) return false;
  setModuleStatus(id, "loading");
  try {
    await task();
    if (id === "settings") {
      document.querySelector("#intelligenceMode").disabled = false;
      document.querySelector("#intelligenceTransport").disabled = false;
    }
    setModuleStatus(id, "ready");
    return true;
  } catch (error) {
    setModuleStatus(id, "failed", error);
    if (id === "settings") {
      state.intelligenceSettings = {
        mode: "smart",
        transport: "computer_use",
        depth: "recommend"
      };
      document.querySelector("#intelligenceMode").disabled = true;
      document.querySelector("#intelligenceTransport").disabled = true;
    }
    return false;
  }
}

function renderModuleDependentViews() {
  renderNavigationCounts();
  renderCurrentPage();
  bindModuleRetryButtons();
}

async function retryModules(ids = failedModules().map(([id]) => id)) {
  const uniqueIds = [...new Set(ids)].filter((id) => state.modules[id]);
  if (uniqueIds.length === 0) return;
  const retryButton = document.querySelector("#retryFailedModulesButton");
  const localButtons = [...document.querySelectorAll("[data-retry-module]")]
    .filter((button) => uniqueIds.includes(button.dataset.retryModule));
  retryButton.disabled = true;
  retryButton.textContent = "正在重试…";
  localButtons.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "正在加载…";
  });
  try {
    await Promise.all(uniqueIds.map((id) => executeModule(id)));
    renderModuleDependentViews();
  } finally {
    retryButton.disabled = false;
    retryButton.textContent = "重试失败项";
    document.querySelectorAll("[data-retry-module]").forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = "重新加载";
    });
  }
  if (failedModules().length === 0) {
    notify("所有本地能力已恢复");
  }
}

async function refreshRunsHealth() {
  if (state.runRefreshPending) return;
  state.runRefreshPending = true;
  try {
    const loaded = await refreshRuns(true);
    if (loaded) {
      if (state.modules.runs.status !== "ready") {
        setModuleStatus("runs", "ready");
        renderModuleDependentViews();
      }
      return;
    }

    const error =
      state.lastRunRefreshError || new Error("项目与版本自动刷新失败");
    if (
      state.modules.runs.status !== "failed" ||
      state.modules.runs.error !== String(error.message || error)
    ) {
      setModuleStatus("runs", "failed", error);
      renderModuleDependentViews();
    }
  } finally {
    state.runRefreshPending = false;
  }
}

function finishBoot() {
  state.booting = false;
  renderSystemHealth();
  elements.bootScreen.classList.add("finished");
  window.setTimeout(() => {
    elements.bootScreen.hidden = true;
    if (state.startupNotice) {
      notify(state.startupNotice.message, state.startupNotice.type);
      state.startupNotice = null;
    }
  }, 260);
}

async function initialize() {
  await uiPreferencesReady;
  const projectTemplate = document.querySelector("#projectCoordinationTemplate");
  const projectPanel = projectTemplate.content.cloneNode(true);
  document.querySelector("#overviewCoordinationSlot").append(projectPanel);
  elements.coordinationPanel = document.querySelector(
    ".project-coordination-panel"
  );
  elements.stageTrack = document.querySelector("#stageTrack");
  state.trajectoryTimer = window.setInterval(() => {
    if (!state.trajectoryPlaying || state.page !== "workspace" || !state.run) {
      return;
    }
    const count = state.run.coordination?.trajectory?.length ||
      state.run.coordination?.team?.length ||
      1;
    state.trajectoryIndex = (state.trajectoryIndex + 1) % count;
    renderStageNavigation();
  }, 1800);
  setPage("home");
  renderBootState();
  await Promise.all(
    ["tools", "settings", "employees", "supervisor", "runs"].map(executeModule)
  );
  renderModuleDependentViews();
  finishBoot();
  window.setInterval(refreshRunsHealth, 10000);
}

initialize().catch((error) => {
  setModuleStatus("runs", "failed", error);
  renderModuleDependentViews();
  finishBoot();
});
