const $ = (selector) => document.querySelector(selector);
const STAGES = [
  ["discover", "全网检索"],
  ["ingest", "内容核验"],
  ["adapt", "全书拆集"],
  ["design", "本季设定"],
  ["render", "分集渲染"],
  ["assemble", "逐集装配"]
];
const STATUS_LABELS = {
  queued: "排队中",
  running: "生产中",
  completed: "已完成",
  failed: "失败",
  "source-review": "待确认来源",
  "season-review": "待选择本季",
  "rights-review": "版权复核",
  "budget-gate": "预算门禁",
  "configuration-gate": "生产配置待完成",
  "planning-ready": "待真实生成",
  "demo-preview": "待真实生成",
  rendering: "渲染中"
};
const ASSET_TYPES = { character: "角色", weapon: "武器", location: "场景" };
const NODE_STATUS_LABELS = { pending: "未开始", running: "处理中", completed: "已完成", failed: "失败", paused: "已暂停" };
const VALID_VIEWS = new Set(["projects", "recommendations", "overview", "tasks", "sources", "assets", "episodes"]);
const PROJECT_VIEWS = new Set(["overview", "sources", "assets", "episodes"]);
const pathname = window.location.pathname;
const platform = pathname.startsWith("/mobile")
  ? "mobile"
  : pathname.startsWith("/desktop") ? "desktop" : "web";
const PLATFORM_LABELS = { web: "Web", mobile: "手机 App", desktop: "桌面 App" };
let activeProjectId = null;
let pollTimer = null;
let toastTimer = null;
let installPrompt = null;
let activeProject = null;
let activeAssetFilter = "all";
let allProjects = [];
let queueState = null;
let taskFilter = "all";
let activeView = "projects";
let taskQuery = "";
let taskDisplayLimit = 50;
let selectedSourceId = null;
let projectFilter = "all";
let projectQuery = "";
let sourceRegistry = [];
let authorizedTextDraft = "";
let authorizedFileName = "";
let recommendations = [];
let recommendationLanguage = "all";
let recommendationQuery = "";
let recommendationCoverRefreshTimers = [];
let runtimeStatus = null;

document.documentElement.dataset.platform = platform;

function icons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.7 } });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function isDemoPreview(project) {
  return ["demo", "planning"].includes(project?.mode)
    && (
      ["demo-preview", "planning-ready"].includes(project.status)
      || (
        project.status === "completed"
        && (
          project.episodes?.some((episode) => (episode.shots || []).length > 0)
          || project.episodeCount > 0
        )
        && project.hasVideo !== true
        && !project.episodes?.some((episode) => episode.videoUrl)
      )
    );
}

function projectStatusLabel(project) {
  return isDemoPreview(project)
    ? "待真实生成"
    : STATUS_LABELS[project?.status] || project?.status || "未知";
}

function projectDurationSeconds(project) {
  return Number(project?.episodeDurationSeconds)
    || Number(project?.targetDurationSeconds)
    || Number(project?.episodes?.[0]?.durationSeconds)
    || Number(project?.episodes?.[0]?.durationMinutes) * 60
    || Number(runtimeStatus?.production?.episodeDurationSeconds)
    || 300;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `请求失败 ${response.status}`);
  return payload;
}

function renderStatus(status) {
  runtimeStatus = status;
  queueState = status.queue;
  const queueSuffix = status.queue
    ? ` · ${status.queue.activeCount}/${status.queue.maxConcurrency} 项目槽 · ${status.queue.queuedCount} 排队`
    : "";
  $("#modeLabel").textContent = status.mode === "live"
    ? `${PLATFORM_LABELS[platform]} · 正式生产 · ${!status.arkConfigured ? "生产配置待完成" : status.billableGenerationEnabled ? "计费已开启" : "预算确认待完成"}${queueSuffix}`
    : `${PLATFORM_LABELS[platform]} · 规划模式 · 未调用生成模型${queueSuffix}`;
  $("#dailyTarget").textContent = `${status.production.dailyHours}h`;
  $("#dailyEpisodes").textContent = `${status.production.episodesPerDay.toLocaleString("zh-CN")} 集 / 日`;
  $("#metricMinutes").textContent = "05:00";
  $("#metricBudget").textContent = `¥${status.production.dailyBudgetCny}`;
  $("#metricActiveProjects").textContent = status.queue?.activeCount || 0;
  $("#metricProjectSlots").textContent = `/ ${status.queue?.maxConcurrency || status.production.maxProjectConcurrency} 槽`;
  $("#metricQueuedProjects").textContent = status.queue?.queuedCount || 0;
}

function renderStages(project) {
  const activeIndex = STAGES.findIndex(([id]) => id === project.stage);
  const demoPreview = isDemoPreview(project);
  $("#stageTrack").innerHTML = STAGES.map(([id, label], index) => {
    const fallbackState = index < activeIndex || (project.status === "completed" && !demoPreview)
      ? "done"
      : index === activeIndex ? "active" : "";
    const persistedStatus = project.nodes?.[id]?.status;
    const nodeStatus = demoPreview && id === "render"
      ? "paused"
      : demoPreview && id === "assemble"
        ? "pending"
        : persistedStatus
      || (fallbackState === "done" ? "completed" : fallbackState === "active" ? "running" : "pending");
    const state = nodeStatus === "completed" ? "done" : ["running", "paused", "failed"].includes(nodeStatus) ? "active" : "";
    return `<span class="stage-item ${state}" role="listitem">
      <button class="stage" data-node-id="${id}" title="查看${label}节点详情">
        <span>${String(index + 1).padStart(2, "0")} ${label}</span>
        <small>${NODE_STATUS_LABELS[nodeStatus] || nodeStatus}</small>
      </button>
    </span>`;
  }).join("");
}

function coverUrl(title) {
  const prompt = `Epic cinematic key art for the classic novel ${title}, wide atmospheric landscape, realistic film still, dramatic natural lighting, no typography, no text`;
  return `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=portrait_4_3`;
}

function recommendationCoverUrl(item) {
  const prompt = `Pure cinematic scene inspired by ${item.title}, ${item.genre}, realistic film still, atmospheric environment, dramatic natural lighting, not a book cover, no people holding signs, no letters, no symbols, no typography, no text`;
  return `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=portrait_4_3`;
}

function renderShots(episode, project) {
  const shots = episode?.shots || [];
  const demoPreview = isDemoPreview(project);
  $("#shotGrid").innerHTML = shots.map((shot) => {
    const height = 14 + ((shot.order * 11) % 25);
    const status = demoPreview ? "simulated" : shot.status;
    const progress = demoPreview ? 0 : shot.progress || 0;
    return `<span class="shot ${escapeHtml(status)}" style="--height:${height}px;--progress:${progress}%" title="${escapeHtml(shot.id)} · ${demoPreview ? "仅规划，未生成视频" : escapeHtml(shot.status)}"></span>`;
  }).join("");
  if (demoPreview && shots.length) {
    $("#episodeProgressBar").style.width = "0%";
    $("#episodePercent").textContent = "0%";
    $("#episodeMeta").textContent = `${shots.length} 个镜头已规划 · 0 个视频已生成`;
    return;
  }
  const totalProgress = shots.length
    ? Math.round(shots.reduce((sum, shot) => sum + (shot.progress || 0), 0) / shots.length)
    : 0;
  $("#episodeProgressBar").style.width = `${totalProgress}%`;
  $("#episodePercent").textContent = `${totalProgress}%`;
  $("#episodeMeta").textContent = shots.length
    ? `${shots.filter((shot) => shot.status === "succeeded").length} 完成 · ${shots.filter((shot) => shot.status === "running").length} 渲染 · ${shots.filter((shot) => shot.status === "queued").length} 排队`
    : "等待镜头拆解";
}

function renderAssets(assets = []) {
  for (const type of ["character", "weapon", "location"]) {
    $(`#${type}Count`).textContent = assets.filter((asset) => asset.type === type).length;
  }
  $("#assetList").innerHTML = assets.length ? assets.map((asset) => `
    <article class="asset-card" role="button" tabindex="0" data-asset-id="${escapeHtml(asset.id)}">
      <img src="${escapeHtml(asset.imageUrl)}" data-generated-src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(asset.name)}" loading="lazy">
      <div><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(ASSET_TYPES[asset.type] || asset.type)} · ${escapeHtml(asset.id)}</small></div>
      <span title="连续性资产已锁定"><i data-lucide="badge-check"></i></span>
    </article>
  `).join("") : `<p class="micro-label">等待视觉资产生成</p>`;
}

function renderActivity(activity = []) {
  $("#activityList").innerHTML = activity.map((item) => {
    const time = new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return `<li><time>${time}</time>${escapeHtml(item.message)}</li>`;
  }).join("");
}

function renderSourceLibrary(project) {
  const sources = project?.sources || [];
  renderSearchTrace(project);
  const requiresConfirmation = ["source-review", "rights-review"].includes(project?.status);
  if (project?.id !== $("#sourceTable").dataset.projectId || !sources.some((source) => source.id === selectedSourceId)) {
    selectedSourceId = project?.source?.id || project?.suggestedSourceId || sources[0]?.id || null;
    $("#sourceTable").dataset.projectId = project?.id || "";
  }
  $("#sourceResultCount").textContent = `${sources.length} 个来源`;
  $("#sourceReviewNotice").classList.toggle("hidden", !requiresConfirmation);
  $("#rescanSourcesButton").classList.toggle("hidden", !requiresConfirmation);
  $("#confirmSourceButton").classList.toggle("hidden", !requiresConfirmation);
  $("#confirmSourceButton").disabled = !selectedSourceId;
  $("#sourceTable").innerHTML = sources.length ? sources.map((source) => {
    const approved = ["public-domain", "public-domain-candidate", "user-provided"].includes(source.rights);
    const rightsText = source.rights === "public-domain"
      ? "公版"
      : source.rights === "public-domain-candidate"
        ? "公版候选"
        : source.rights === "user-provided" ? "已授权正文" : source.rights === "metadata-only" ? "作品信息" : "待授权";
    const link = source.sourceUrl
      ? `<a class="source-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer" title="打开原始来源" aria-label="打开 ${escapeHtml(source.title)} 原始来源"><i data-lucide="external-link"></i></a>`
      : "<span></span>";
    const selected = selectedSourceId === source.id;
    const metadata = [
      source.authors,
      source.year ? `${source.year} 年` : "",
      Array.isArray(source.languages) ? source.languages.join("/") : "",
      source.contentUrl ? "可读取全文" : source.description ? "内容梗概" : "元数据"
    ].filter(Boolean).join(" · ");
    return `<article class="source-row ${selected ? "selected" : ""}" data-source-id="${escapeHtml(source.id)}">
      <label class="source-choice" title="选择此来源"><input type="radio" name="sourceCandidate" value="${escapeHtml(source.id)}" ${selected ? "checked" : ""} ${requiresConfirmation ? "" : "disabled"}><span class="sr-only">选择 ${escapeHtml(source.title)}</span></label>
      <div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(metadata)}</small>${source.description ? `<p>${escapeHtml(source.description.slice(0, 140))}</p>` : ""}</div>
      <span>${escapeHtml(source.source)}</span>
      <span class="rights-badge ${approved ? "approved" : ""}">${rightsText}</span>
      <span>匹配 ${Number(source.score || 0)}%</span>
      ${link}
    </article>`;
  }).join("") : `<div class="view-empty"><i data-lucide="library-big"></i><p>启动生产后，这里会列出所有检索来源及版权状态。</p></div>`;
  renderContentImport(project, sources.find((source) => source.id === selectedSourceId));
}

function updateContentImportButton() {
  $("#importContentButton").disabled = authorizedTextDraft.length < 500 || !$("#authorizedRightsConfirmed").checked;
}

function renderContentImport(project, source) {
  const imported = project?.authorizedContent && project?.source?.id === source?.id;
  const needsImport = source && !["public-domain", "public-domain-candidate", "user-provided"].includes(source.rights);
  $("#contentImportPanel").classList.toggle("hidden", !imported && !needsImport);
  if (!source || (!imported && !needsImport)) return;
  const key = `${project.id}:${source.id}`;
  if ($("#contentImportPanel").dataset.sourceKey !== key) {
    $("#contentImportPanel").dataset.sourceKey = key;
    authorizedTextDraft = "";
    authorizedFileName = "";
    $("#authorizedTextFile").value = "";
    $("#authorizedRightsConfirmed").checked = false;
  }
  $("#contentImportSource").textContent = `${source.title} · ${source.authors} · ${source.source}`;
  if (imported) {
    $("#authorizedFileName").textContent = project.authorizedContent.fileName;
    $("#authorizedFileStats").textContent = `${project.authorizedContent.characterCount.toLocaleString()} 字符 · SHA-256 ${project.authorizedContent.sha256.slice(0, 12)}…`;
    $("#authorizedTextPreview").value = project.authorizedContent.preview;
    $("#authorizedTextFile").disabled = true;
    $("#authorizedRightsConfirmed").checked = true;
    $("#authorizedRightsConfirmed").disabled = true;
    $("#importContentButton").disabled = true;
    $("#importContentButton span").textContent = "正文已安全导入";
  } else {
    $("#authorizedFileName").textContent = authorizedFileName || "未选择文件";
    $("#authorizedFileStats").textContent = authorizedTextDraft
      ? `${authorizedTextDraft.length.toLocaleString()} 字符 · 预览前 2,000 字`
      : "支持 UTF-8，最大 12 MB";
    $("#authorizedTextPreview").value = authorizedTextDraft.slice(0, 2000);
    $("#authorizedTextFile").disabled = false;
    $("#authorizedRightsConfirmed").disabled = false;
    $("#importContentButton span").textContent = "导入并继续流水线";
    updateContentImportButton();
  }
}

function renderSearchTrace(project) {
  const runs = project?.searchRuns || project?.nodes?.discover?.output?.searches || [];
  const completed = runs.filter((run) => run.status === "completed").length;
  const hits = runs.reduce((sum, run) => sum + Number(run.candidateCount || 0), 0);
  $("#searchTraceSummary").textContent = runs.length
    ? `${runs.length} 个检索源 · ${completed} 个完成 · ${hits} 次命中`
    : "尚未执行检索";
  $("#searchTraceList").innerHTML = runs.length ? runs.map((run) => {
    const statusLabel = run.status === "completed"
      ? "已完成"
      : run.status === "degraded" ? "降级命中" : run.status === "skipped" ? "未配置" : "失败";
    const details = run.error
      ? escapeHtml(run.error)
      : `${Number(run.candidateCount || 0)} 个命中 · ${Number(run.durationMs || 0)} ms`;
    const link = run.queryUrl
      ? `<a href="${escapeHtml(run.queryUrl)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${escapeHtml(run.provider)} 检索地址"><i data-lucide="external-link"></i></a>`
      : "";
    return `<article class="search-trace-row">
      <span class="trace-state ${escapeHtml(run.status)}"><i></i>${statusLabel}</span>
      <div><strong>${escapeHtml(run.provider)}</strong><code>${escapeHtml(run.queryUrl || "本地目录")}</code></div>
      <small>${details}</small>
      ${link}
    </article>`;
  }).join("") : `<div class="view-empty"><i data-lucide="radar"></i><p>进入项目后查看每个检索源的执行地址与结果。</p></div>`;
  icons();
}

function renderSourceRegistry() {
  $("#sourceConfigList").innerHTML = sourceRegistry.map((source, index) => `
    <article class="source-config-row" data-source-index="${index}">
      <label class="source-switch"><input type="checkbox" aria-label="${escapeHtml(source.name)}检索源" ${source.enabled ? "checked" : ""}><span></span></label>
      <div>
        <strong>${escapeHtml(source.name)}</strong>
        <small title="${escapeHtml(source.domains.join("、"))}">${escapeHtml(source.category || "其他")} · ${escapeHtml(source.freeMode || "免费模式待核验")}</small>
      </div>
      <span>${source.rights === "metadata-only" ? "作品信息（需正文）" : source.rights === "public-domain-candidate" ? "公版候选" : "需授权核验"}</span>
      <button class="icon-button" data-remove-source="${index}" aria-label="删除 ${escapeHtml(source.name)}"><i data-lucide="trash-2"></i></button>
    </article>
  `).join("");
  icons();
}

async function persistSourceRegistry(message) {
  const payload = await api("/api/search-sources", {
    method: "PUT",
    body: JSON.stringify({ sources: sourceRegistry })
  });
  sourceRegistry = payload.sources;
  renderSourceRegistry();
  showToast(message);
}

function renderAssetGallery(project) {
  const assets = (project?.assets || []).filter((asset) => activeAssetFilter === "all" || asset.type === activeAssetFilter);
  $("#assetGallery").innerHTML = assets.length ? assets.map((asset) => `
    <button class="gallery-item" data-asset-id="${escapeHtml(asset.id)}">
      <img src="${escapeHtml(asset.imageUrl)}" data-generated-src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(asset.name)}" loading="lazy">
      <strong>${escapeHtml(asset.name)}</strong>
      <small>${escapeHtml(ASSET_TYPES[asset.type] || asset.type)} · ${escapeHtml(asset.id)}</small>
    </button>
  `).join("") : `<div class="view-empty"><i data-lucide="users"></i><p>当前筛选下暂无连续性资产。</p></div>`;
}

function updateSeasonSelectionSummary() {
  const plan = activeProject?.adaptationPlan;
  if (!plan?.episodes?.length) return;
  const start = Number($("#seasonStartEpisode").value) || 1;
  const remaining = plan.episodes.length - start + 1;
  const maxCount = Math.min(
    Number(runtimeStatus?.production?.maxSeasonEpisodes) || 24,
    remaining
  );
  const countInput = $("#seasonEpisodeCount");
  countInput.max = String(maxCount);
  const count = Math.max(1, Math.min(Number(countInput.value) || 1, maxCount));
  countInput.value = String(count);
  const end = start + count - 1;
  const cost = count
    * projectDurationSeconds(activeProject)
    * Number(runtimeStatus?.production?.videoCostPerSecondCny || 0);
  $("#seasonSelectionSummary").textContent =
    `全书第 ${start}-${end} 集 · ${count} 集 · 约 ¥${cost.toFixed(2)}`;
}

function renderEpisodeQueue(project) {
  const episodes = project?.episodes || [];
  const plan = project?.adaptationPlan;
  const selectingSeason = project?.status === "season-review"
    && plan?.episodes?.length;
  $("#seasonPlanningPanel").classList.toggle("hidden", !selectingSeason);
  if (selectingSeason) {
    const planEpisodes = plan.episodes;
    const suggestedCount = Math.min(
      Number(plan.suggestedSeasonSize) || 6,
      Number(runtimeStatus?.production?.maxSeasonEpisodes) || 24,
      planEpisodes.length
    );
    $("#seasonPlanningBasis").textContent =
      `${Number(plan.detectedChapterCount || 0)} 个明确章节 · `
      + `${Number(plan.sourceCharacterCount || 0).toLocaleString("zh-CN")} 字 · `
      + "按章节边界、内容长度和叙事密度规划";
    $("#plannedEpisodeCount").textContent = `${planEpisodes.length} 集`;
    if ($("#seasonPlanningPanel").dataset.projectId !== project.id) {
      $("#seasonPlanningPanel").dataset.projectId = project.id;
      $("#seasonNumber").value = "1";
      $("#seasonStartEpisode").innerHTML = planEpisodes.map((episode) =>
        `<option value="${episode.number}">第 ${episode.number} 集 · ${escapeHtml(episode.title)}</option>`
      ).join("");
      $("#seasonEpisodeCount").value = String(suggestedCount);
    }
    updateSeasonSelectionSummary();
    $("#episodeSeasonSummary").innerHTML = `
      <span><small>全书规划</small><strong>${planEpisodes.length} 集</strong></span>
      <span><small>章节依据</small><strong>${plan.detectedChapterCount || "内容"} 个单元</strong></span>
      <span><small>单集规格</small><strong>05:00 · 10 段</strong></span>
      <span><small>下一步</small><strong>选择本季范围</strong></span>`;
    $("#episodeTable").innerHTML = planEpisodes.map((episode) => `
      <article class="episode-row planning-row">
        <span class="episode-number">E${String(episode.number).padStart(2, "0")}</span>
        <div><strong>${escapeHtml(episode.title)}</strong><small>${escapeHtml(episode.logline)}</small></div>
        <div><strong>${escapeHtml(episode.sourceRange)}</strong><small>正文覆盖范围</small></div>
        <div><strong>${Number(episode.estimatedSourceCharacters || 0).toLocaleString("zh-CN")} 字</strong><small>内容容量依据</small></div>
        <div><small>尚未选择本季，不生成详细剧本或视频</small></div>
      </article>`
    ).join("");
    $("#exportButton").disabled = false;
    $("#retryButton").classList.add("hidden");
    icons();
    return;
  }
  const contentReady = episodes.filter((episode) => episode.contentStatus === "ready").length;
  const completedEpisodes = episodes.filter((episode) => episode.status === "completed").length;
  const totalSegments = episodes.reduce((sum, episode) => sum + (episode.shots?.length || 0), 0);
  const completedSegments = episodes.reduce(
    (sum, episode) => sum + (episode.shots || []).filter((shot) => shot.status === "succeeded").length,
    0
  );
  $("#episodeSeasonSummary").innerHTML = `
    <span><small>全季内容</small><strong>${contentReady}/${episodes.length || project?.seasonEpisodeCount || 0} 集已就绪</strong></span>
    <span><small>视频交付</small><strong>${completedEpisodes}/${episodes.length || project?.seasonEpisodeCount || 0} 集已完成</strong></span>
    <span><small>连续片段</small><strong>${completedSegments}/${totalSegments || (project?.seasonEpisodeCount || 0) * 10} 段</strong></span>
    <span><small>生产策略</small><strong>逐集 · 尾帧接续</strong></span>`;
  $("#episodeTable").innerHTML = episodes.length ? episodes.map((episode) => {
    const shots = episode.shots || [];
    const demoPreview = isDemoPreview(project);
    const done = demoPreview ? 0 : shots.filter((shot) => shot.status === "succeeded").length;
    const percent = shots.length ? Math.round((done / shots.length) * 100) : 0;
    const episodeState = episode.status === "completed"
      ? "成片已完成"
      : episode.status === "rendering"
      ? "正在顺序渲染"
      : episode.status === "assembling"
      ? "正在装配"
      : episode.contentStatus === "ready" ? "剧本已锁定" : "等待编剧";
    return `<article class="episode-row">
      <span class="episode-number">E${String(episode.number || 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(episode.title || "未命名分集")}</strong><small>${escapeHtml(episode.logline || "等待剧本")}</small></div>
      <div><strong>${formatDuration(episode.durationSeconds || 300)}</strong><small>${episode.contentStatus === "ready" ? "内容已就绪" : "内容规划中"}</small></div>
      <div><strong>${done}/${shots.length}</strong><small>${escapeHtml(episodeState)} · 尾帧接续</small></div>
      <div><div class="mini-progress"><span style="width:${percent}%"></span></div><small>${percent}% 视频已生成</small></div>
    </article>`;
  }).join("") : `<div class="view-empty"><i data-lucide="film"></i><p>暂无分集任务。</p></div>`;
  $("#exportButton").disabled = !project;
  const canRetry = ["failed", "rights-review", "budget-gate", "configuration-gate"].includes(project?.status)
    || isDemoPreview(project);
  $("#retryButton").classList.toggle("hidden", !canRetry);
  $("#retryButton span").textContent = project?.status === "budget-gate"
    && project?.stage === "render"
    ? "确认预算并开始"
    : isDemoPreview(project) ? "开始真实生成" : "重试任务";
}

function taskMatches(project, filter) {
  if (filter === "all") return true;
  if (filter === "active") return ["running", "rendering"].includes(project.status);
  if (filter === "review") return ["source-review", "season-review"].includes(project.status) || isDemoPreview(project);
  if (filter === "completed") return project.status === "completed" && !isDemoPreview(project);
  if (filter === "failed") return ["failed", "rights-review", "budget-gate", "configuration-gate"].includes(project.status);
  return project.status === filter;
}

function formatTaskTime(value) {
  if (!value) return "尚未开始";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function projectMatches(project, filter) {
  if (filter === "all") return true;
  if (filter === "active") return ["queued", "running", "rendering"].includes(project.status);
  if (filter === "review") {
    return isDemoPreview(project)
      || ["source-review", "season-review", "rights-review", "budget-gate", "configuration-gate", "failed"].includes(project.status);
  }
  if (filter === "completed") return project.status === "completed" && !isDemoPreview(project);
  return project.status === filter;
}

function renderProjectCatalog() {
  $("#metricProjectCount").textContent = allProjects.length;
  $("#metricReviewProjects").textContent = allProjects.filter((project) =>
    isDemoPreview(project)
      || ["source-review", "season-review", "rights-review", "budget-gate", "configuration-gate", "failed"].includes(project.status)
  ).length;
  const projects = allProjects.filter((project) => {
    const queryMatch = !projectQuery || `${project.novelName} ${project.sourceTitle || ""} ${project.id}`.toLowerCase().includes(projectQuery);
    return projectMatches(project, projectFilter) && queryMatch;
  });
  $("#projectCatalogCount").textContent = `${projects.length} 个项目`;
  $("#projectGrid").innerHTML = projects.length ? projects.map((project) => {
    const demoPreview = isDemoPreview(project);
    const stageIndex = demoPreview
      ? STAGES.findIndex(([id]) => id === "render")
      : Math.max(0, STAGES.findIndex(([id]) => id === project.stage));
    const stageLabel = STAGES[stageIndex]?.[1] || "等待调度";
    const needsAction = demoPreview || ["source-review", "season-review", "rights-review", "budget-gate", "configuration-gate", "failed"].includes(project.status);
    const statusDetail = demoPreview
      ? "尚未调用 Seedance"
      : project.status === "queued"
      ? `队列第 ${project.queuePosition || "-"} 位`
      : needsAction ? "需要处理" : stageLabel;
    return `<button class="project-card" data-project-id="${escapeHtml(project.id)}">
      <span class="project-cover">
        <img src="${escapeHtml(coverUrl(project.novelName))}" alt="${escapeHtml(project.novelName)} 项目封面" loading="lazy">
        <span class="task-state ${escapeHtml(isDemoPreview(project) ? "planning-ready" : project.status)}">${escapeHtml(projectStatusLabel(project))}</span>
      </span>
      <span class="project-card-body">
        <span class="project-card-title"><strong>${escapeHtml(project.novelName)}</strong><small>${escapeHtml(project.sourceTitle || "等待确认内容来源")}</small></span>
        <span class="project-card-progress"><span><b style="width:${Number(project.progress || 0)}%"></b></span><strong>${Number(project.progress || 0)}%</strong></span>
        <span class="project-stage-rail" aria-label="六节点进度">${STAGES.map((_, index) =>
          `<i class="${index < stageIndex || (project.status === "completed" && !demoPreview) ? "done" : index === stageIndex ? "current" : ""}"></i>`
        ).join("")}</span>
        <span class="project-card-meta"><small>${escapeHtml(statusDetail)}</small><small>${project.status === "season-review"
          ? `${project.plannedEpisodeCount || 0} 集全书规划 · 待选本季`
          : !project.episodeCount && !project.seasonEpisodeCount
          ? `待分析全书集数 · 每集 ${formatDuration(projectDurationSeconds(project))}`
          : `${project.completedEpisodes || 0}/${project.episodeCount || project.seasonEpisodeCount} 集 · 每集 ${formatDuration(projectDurationSeconds(project))}`
        }</small></span>
        <span class="project-card-footer"><time>${formatTaskTime(project.updatedAt || project.createdAt)}</time><span>进入项目 <i data-lucide="arrow-right"></i></span></span>
      </span>
    </button>`;
  }).join("") : `<div class="view-empty"><i data-lucide="folders"></i><p>${allProjects.length ? "当前筛选下没有项目。" : "还没有项目，创建第一个小说制片项目。"}</p></div>`;
  icons();
}

function renderRecommendations() {
  const query = recommendationQuery.toLocaleLowerCase();
  const items = recommendations.filter((item) => {
    const languageMatch = recommendationLanguage === "all" || item.language === recommendationLanguage;
    const text = `${item.title} ${item.author} ${item.genre} ${(item.tags || []).join(" ")}`.toLocaleLowerCase();
    return languageMatch && (!query || text.includes(query));
  });
  $("#recommendationCount").textContent = recommendations.length;
  $("#recommendationVisibleCount").textContent = items.length;
  $("#recommendationGrid").innerHTML = items.length ? items.map((item) => `
    <article class="recommendation-card">
      <div class="recommendation-cover">
        <div class="recommendation-cover-fallback" aria-hidden="true">
          <span>${escapeHtml(item.title.slice(0, 1).toLocaleUpperCase())}</span>
          <small>PUBLIC DOMAIN</small>
          <strong>${escapeHtml(item.title)}</strong>
        </div>
        <img
          src="${escapeHtml(recommendationCoverUrl(item))}"
          data-generated-src="${escapeHtml(recommendationCoverUrl(item))}"
          data-generated-cover
          alt="${escapeHtml(item.title)} 概念场景"
          loading="lazy"
        >
        <span class="recommendation-rank">NO.${String(item.rank).padStart(2, "0")}</span>
        <span class="recommendation-language">${escapeHtml(item.language)}</span>
      </div>
      <div class="recommendation-body">
        <div class="recommendation-kicker"><span>${escapeHtml(item.genre)} · ${escapeHtml(item.year)}</span><strong>改编指数 ${item.popularityScore}</strong></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="recommendation-author">${escapeHtml(item.author)} · ${escapeHtml(item.source)}</p>
        <p class="recommendation-summary">${escapeHtml(item.summary)}</p>
        <div class="recommendation-tags">${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <p class="recommendation-reason"><i data-lucide="sparkles"></i><span>${escapeHtml(item.popularReason)}</span></p>
        <footer>
          <span class="rights-badge approved"><i data-lucide="badge-check"></i>公版可用</span>
          <div>
            <a class="icon-button" href="${escapeHtml(item.rightsEvidenceUrl)}" target="_blank" rel="noopener noreferrer" title="查看版权依据" aria-label="查看 ${escapeHtml(item.title)} 版权依据"><i data-lucide="shield-check"></i></a>
            <a class="icon-button" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="打开原文来源" aria-label="打开 ${escapeHtml(item.title)} 原文来源"><i data-lucide="external-link"></i></a>
            <button class="primary-command" data-start-recommendation="${escapeHtml(item.id)}"><i data-lucide="clapperboard"></i><span>创建制片项目</span></button>
          </div>
        </footer>
      </div>
    </article>
  `).join("") : `<div class="view-empty"><i data-lucide="search-x"></i><p>当前筛选下没有推荐作品。</p></div>`;
  icons();
  scheduleRecommendationCoverRefresh();
}

function derivedNode(project, id) {
  if (project.nodes?.[id]) return project.nodes[id];
  const activeIndex = STAGES.findIndex(([stageId]) => stageId === project.stage);
  const index = STAGES.findIndex(([stageId]) => stageId === id);
  const status = project.status === "completed" || index < activeIndex
    ? "completed"
    : index === activeIndex ? (project.status === "failed" ? "failed" : "running") : "pending";
  const outputs = {
    discover: { candidates: project.sources || [], selectedSource: project.source || null },
    ingest: { source: project.source || null },
    adapt: project.bible ? {
      tone: project.bible.tone,
      synopsis: project.bible.synopsis,
      characters: project.bible.characters,
      weapons: project.bible.weapons,
      locations: project.bible.locations
    } : null,
    design: { assets: project.assets || [] },
    render: {
      episodes: (project.episodes || []).map((episode) => ({
        number: episode.number,
        title: episode.title,
        status: episode.status,
        shots: (episode.shots || []).map(({ id: shotId, status: shotStatus, progress, videoUrl }) => ({
          id: shotId, status: shotStatus, progress, videoUrl
        }))
      }))
    },
    assemble: {
      episodes: (project.episodes || []).map(({ number, title, status: episodeStatus, renderedSeconds, videoUrl }) => ({
        number, title, status: episodeStatus, renderedSeconds, videoUrl
      }))
    }
  };
  return {
    id,
    order: index + 1,
    label: STAGES[index]?.[1] || id,
    status,
    startedAt: project.startedAt || project.createdAt,
    completedAt: status === "completed" ? project.completedAt || project.updatedAt : null,
    input: id === "discover" ? { novelName: project.novelName } : null,
    output: outputs[id],
    error: index === activeIndex ? project.error : null
  };
}

function openNode(nodeId) {
  if (!activeProject) return;
  const node = derivedNode(activeProject, nodeId);
  const startedAt = node.startedAt ? new Date(node.startedAt) : null;
  const completedAt = node.completedAt ? new Date(node.completedAt) : null;
  const duration = startedAt && completedAt
    ? ` · ${(Math.max(0, completedAt - startedAt) / 1000).toFixed(1)} 秒`
    : "";
  $("#nodeDialogOrder").textContent = `NODE ${String(node.order).padStart(2, "0")} · ${activeProject.novelName}`;
  $("#nodeDialogTitle").textContent = node.label;
  $("#nodeDialogStatus").textContent = NODE_STATUS_LABELS[node.status] || node.status;
  $("#nodeDialogStatus").className = `state-badge ${node.status}`;
  $("#nodeDialogTiming").textContent = startedAt
    ? `${formatTaskTime(node.startedAt)}${duration}`
    : "尚未开始";
  $("#nodeDialogInput").textContent = node.input ? JSON.stringify(node.input, null, 2) : "尚无输入";
  $("#nodeDialogOutput").textContent = node.output ? JSON.stringify(node.output, null, 2) : "尚无产物";
  $("#nodeDialogError").textContent = node.error || "";
  $("#nodeDialogError").classList.toggle("hidden", !node.error);
  $("#nodeDialog").showModal();
}

function renderTaskCenter() {
  const queue = queueState || { activeCount: 0, queuedCount: 0, availableSlots: 0, averageDurationMinutes: 15 };
  $("#taskActiveCount").textContent = queue.activeCount;
  $("#taskQueuedCount").textContent = queue.queuedCount;
  $("#taskAvailableSlots").textContent = queue.availableSlots;
  $("#averageTaskDuration").textContent = `近期待完成均值约 ${queue.averageDurationMinutes} 分钟`;
  const counts = {
    all: allProjects.length,
    active: allProjects.filter((project) => taskMatches(project, "active")).length,
    queued: allProjects.filter((project) => taskMatches(project, "queued")).length,
    review: allProjects.filter((project) => taskMatches(project, "review")).length,
    completed: allProjects.filter((project) => taskMatches(project, "completed")).length,
    failed: allProjects.filter((project) => taskMatches(project, "failed")).length
  };
  for (const [key, value] of Object.entries(counts)) {
    $(`#filter${key[0].toUpperCase()}${key.slice(1)}Count`).textContent = value;
  }
  const matchingProjects = allProjects.filter((project) => {
    const queryMatch = !taskQuery || `${project.novelName} ${project.sourceTitle || ""} ${project.id}`.toLowerCase().includes(taskQuery);
    return taskMatches(project, taskFilter) && queryMatch;
  });
  const projects = matchingProjects.slice(0, taskDisplayLimit);
  $("#taskList").innerHTML = projects.length ? projects.map((project) => {
    const queued = project.status === "queued";
    const demoPreview = isDemoPreview(project);
    const stage = demoPreview
      ? "镜头规划"
      : STAGES.find(([id]) => id === project.stage)?.[1] || project.stage || "等待调度";
    const statusDetail = demoPreview
      ? `${stage} · 0/${project.shotCount || 0} 视频`
      : queued
      ? `第 ${project.queuePosition || "-"}/${queue.queuedCount} 位 · 预计 ${project.estimatedWaitMinutes || queue.averageDurationMinutes} 分钟`
      : `${stage} · ${project.completedShots || 0}/${project.shotCount || 0} 镜头`;
    const timeDetail = demoPreview
      ? `预览 ${formatTaskTime(project.completedAt || project.updatedAt)}`
      : project.completedAt
      ? `完成 ${formatTaskTime(project.completedAt)}`
      : project.startedAt
        ? `启动 ${formatTaskTime(project.startedAt)}`
        : queued ? "等待生产槽" : `更新 ${formatTaskTime(project.updatedAt)}`;
    return `<button class="task-row ${project.id === activeProjectId ? "active-project" : ""}" data-project-id="${escapeHtml(project.id)}">
      <span class="task-title"><strong>${escapeHtml(project.novelName)}</strong><small>${escapeHtml(project.sourceTitle || project.id.slice(0, 8))}</small></span>
      <span class="task-state ${escapeHtml(isDemoPreview(project) ? "planning-ready" : project.status)}">${escapeHtml(projectStatusLabel(project))}</span>
      <span class="task-stage"><strong>${escapeHtml(statusDetail)}</strong><span class="task-progress"><span style="width:${Number(project.progress || 0)}%"></span></span><small>${Number(project.progress || 0)}% 完成</small></span>
      <span class="task-time"><time>${formatTaskTime(project.createdAt)}</time><small>${timeDetail}</small></span>
      <i data-lucide="chevron-right"></i>
    </button>`;
  }).join("") : `<div class="view-empty"><i data-lucide="list-filter"></i><p>当前筛选下没有任务。</p></div>`;
  const loadMore = $("#loadMoreTasks");
  loadMore.classList.toggle("hidden", matchingProjects.length <= taskDisplayLimit);
  loadMore.querySelector("span").textContent = `加载更多任务（${taskDisplayLimit}/${matchingProjects.length}）`;
  icons();
}

function setProjectNavigation(enabled) {
  document.querySelectorAll(".project-nav").forEach((button) => {
    button.disabled = !enabled;
  });
  $(".project-nav-label")?.classList.toggle("muted", !enabled);
}

function closeProject() {
  activeProject = null;
  activeProjectId = null;
  selectedSourceId = null;
  setProjectNavigation(false);
  $("#projectContext").classList.add("hidden");
  showView("projects");
}

async function openProject(projectId, preferredView) {
  const { project } = await api(`/api/projects/${projectId}`);
  renderProject(project);
  const target = preferredView
    || (["source-review", "rights-review"].includes(project.status) ? "sources" : "overview");
  showView(target);
}

function showView(name) {
  if (!VALID_VIEWS.has(name)) name = "projects";
  if (PROJECT_VIEWS.has(name) && !activeProject) {
    name = "projects";
  }
  activeView = name;
  document.querySelectorAll("[data-page-view]").forEach((view) => view.classList.toggle("hidden", view.dataset.pageView !== name));
  $("#projectContext").classList.toggle("hidden", !PROJECT_VIEWS.has(name) || !activeProject);
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (name === "projects") renderProjectCatalog();
  if (name === "recommendations") renderRecommendations();
  if (name === "tasks") renderTaskCenter();
  if (name === "sources") renderSourceLibrary(activeProject);
  if (name === "assets") renderAssetGallery(activeProject);
  if (name === "episodes") renderEpisodeQueue(activeProject);
  const url = new URL(window.location.href);
  if (name === "projects") url.searchParams.delete("view");
  else url.searchParams.set("view", name);
  if (activeProjectId && PROJECT_VIEWS.has(name)) url.searchParams.set("project", activeProjectId);
  else url.searchParams.delete("project");
  window.history.replaceState(null, "", url);
  window.scrollTo({ top: 0, behavior: "smooth" });
  icons();
}

async function refreshGeneratedImages({ quiet = false } = {}) {
  const images = [...document.querySelectorAll("img[data-generated-src]")]
    .filter((image) => image.dataset.generatedSrc.startsWith("https://copilot-cn.bytedance.net/"));
  if (!images.length) {
    if (!quiet) showToast("当前没有可刷新的视觉资产");
    return;
  }
  if (!quiet) showToast("正在刷新视觉资产");
  const results = await Promise.allSettled(images.map(async (image) => {
    const source = image.dataset.generatedSrc;
    const response = await fetch(`/api/generated-image?source=${encodeURIComponent(source)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const previous = image.dataset.objectUrl;
    const objectUrl = URL.createObjectURL(await response.blob());
    image.src = objectUrl;
    image.dataset.objectUrl = objectUrl;
    if (previous) URL.revokeObjectURL(previous);
  }));
  const refreshed = results.filter((result) => result.status === "fulfilled").length;
  if (!quiet) showToast(`已重新获取 ${refreshed} 张视觉资产，生成中图片可稍后再试`);
}

async function refreshRecommendationCovers() {
  const images = [...document.querySelectorAll("img[data-generated-cover]:not(.is-ready)")];
  await Promise.allSettled(images.map(async (image) => {
    const source = image.dataset.generatedSrc;
    const response = await fetch(`/api/generated-image?source=${encodeURIComponent(source)}`, {
      cache: "no-store"
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const aspectRatio = bitmap.width / bitmap.height;
    bitmap.close();
    if (aspectRatio > 0.94 && aspectRatio < 1.06) return;
    const previous = image.dataset.objectUrl;
    const objectUrl = URL.createObjectURL(blob);
    image.src = objectUrl;
    image.dataset.objectUrl = objectUrl;
    image.classList.add("is-ready");
    if (previous) URL.revokeObjectURL(previous);
  }));
}

function scheduleRecommendationCoverRefresh() {
  recommendationCoverRefreshTimers.forEach(clearTimeout);
  recommendationCoverRefreshTimers = [2500, 12000, 30000, 60000].map((delay) =>
    setTimeout(refreshRecommendationCovers, delay)
  );
}

function openAsset(assetId) {
  const asset = activeProject?.assets?.find((item) => item.id === assetId);
  if (!asset) return;
  $("#assetDialogImage").src = asset.imageUrl;
  $("#assetDialogImage").alt = asset.name;
  $("#assetDialogType").textContent = `${ASSET_TYPES[asset.type] || asset.type} · ${asset.id}`;
  $("#assetDialogTitle").textContent = asset.name;
  $("#assetDialogPrompt").textContent = asset.prompt || "无提示词记录";
  $("#assetDialog").showModal();
}

function renderProject(project) {
  activeProject = project;
  activeProjectId = project.id;
  setProjectNavigation(true);
  $("#emptyState").classList.add("hidden");
  $("#projectView").classList.remove("hidden");
  $("#productionProjectTitle").textContent = project.novelName;
  $("#contextProjectTitle").textContent = project.novelName;
  $("#contextProjectId").textContent = `ID ${project.id.slice(0, 8)} · 更新 ${formatTaskTime(project.updatedAt)}`;
  const contextBadge = $("#contextProjectStatus");
  const displayedStatus = isDemoPreview(project) ? "planning-ready" : project.status;
  contextBadge.textContent = projectStatusLabel(project);
  contextBadge.className = `state-badge ${displayedStatus}`;
  const badge = $("#projectStatus");
  badge.textContent = projectStatusLabel(project);
  badge.className = `state-badge ${displayedStatus}`;
  const notice = $("#productionNotice");
  const targetDurationSeconds = projectDurationSeconds(project);
  const episodeCount = Number(project.seasonEpisodeCount || project.episodeCount || project.episodes?.length || 0);
  const estimatedEpisodeCost = Number((
    targetDurationSeconds * Number(runtimeStatus?.production?.videoCostPerSecondCny || 0)
  ).toFixed(2));
  const estimatedSeasonCost = Number((estimatedEpisodeCost * episodeCount).toFixed(2));
  if (project.status === "season-review") {
    const plannedCount = project.adaptationPlan?.episodes?.length || 0;
    notice.innerHTML = `
      <span>已根据正文与章节生成 ${plannedCount} 集全书规划。请先核对每集对应的章节和梗概，再选择本季连续范围。</span>
      <button class="command-button" data-select-season>
        <i data-lucide="list-checks"></i>
        <span>查看规划并选择本季</span>
      </button>`;
    notice.classList.remove("hidden");
  } else if (isDemoPreview(project)) {
    const liveReady = runtimeStatus?.mode === "live"
      && runtimeStatus?.arkConfigured
      && runtimeStatus?.billableGenerationEnabled;
    notice.innerHTML = `
      <span>全季 ${episodeCount} 集内容与剧本已完成，等待启动逐集 Seedance 生成。每集 ${formatDuration(targetDurationSeconds)}、${project.episodes?.[0]?.shots?.length || 10} 个连续片段，全季参考费用约 ¥${estimatedSeasonCost.toFixed(2)}。</span>
      <button class="command-button" data-start-live ${liveReady ? "" : "disabled"}>
        <i data-lucide="play"></i>
        <span>${liveReady ? "开始真实生成" : "真实模式未就绪"}</span>
      </button>`;
    notice.classList.remove("hidden");
  } else if (project.status === "budget-gate" && project.stage === "render") {
    notice.innerHTML = `
      <span>全季 ${episodeCount} 集剧本已全部完成。每集 ${formatDuration(targetDurationSeconds)} 参考费用约 ¥${estimatedEpisodeCost.toFixed(2)}，全季约 ¥${estimatedSeasonCost.toFixed(2)}；确认后将按集、按 30 秒片段顺序生成。</span>
      <button class="command-button" data-approve-budget>
        <i data-lucide="badge-dollar-sign"></i>
        <span>确认预算并开始</span>
      </button>`;
    notice.classList.remove("hidden");
  } else if (project.status === "budget-gate") {
    notice.innerHTML = `
      <span>全书分集规划尚未生成。请先开启内容规划模型的计费授权，配置完成后重试；此阶段不会提交 Seedance 视频任务。</span>
      <button class="command-button" data-retry-planning>
        <i data-lucide="rotate-ccw"></i>
        <span>配置后重试规划</span>
      </button>`;
    notice.classList.remove("hidden");
  } else {
    notice.classList.add("hidden");
    notice.textContent = "";
  }
  renderStages(project);
  const coverSource = coverUrl(project.novelName);
  $("#projectCover").src = coverSource;
  $("#projectCover").dataset.generatedSrc = coverSource;
  $("#coverProgress").textContent = isDemoPreview(project) ? "仅预览" : `${project.progress}%`;
  const displayedSource = project.source
    || project.sources?.find((source) => source.id === project.suggestedSourceId);
  $("#sourceTitle").textContent = displayedSource?.title || "正在检索";
  $("#sourceMeta").textContent = displayedSource
    ? `${displayedSource.authors} · ${displayedSource.source}`
    : "正在校验来源与版权状态";
  const rights = displayedSource?.rights || "checking";
  $("#rightsText").textContent = project.status === "source-review"
    ? "候选来源待你确认"
    : project.status === "season-review"
    ? "正文已分析，等待选择本季"
    : rights === "public-domain"
    ? "公版来源，可自动处理"
    : rights === "public-domain-candidate" ? "公版候选，已进入核验" : "等待授权或来源核验";
  const episode = project.episodes?.find((item) => ["rendering", "assembling"].includes(item.status))
    || project.episodes?.find((item) => item.status !== "completed")
    || project.episodes?.at(-1);
  $("#episodeTitle").textContent = episode?.title
    || (project.status === "season-review" ? "等待选择本季" : "脚本生成中");
  $("#episodeDuration").textContent = formatDuration(targetDurationSeconds);
  const episodeOutput = $("#episodeOutput");
  const episodeVideo = $("#episodeVideo");
  const episodeDownload = $("#episodeDownload");
  if (episode?.videoUrl) {
    episodeVideo.src = episode.videoUrl;
    episodeDownload.href = episode.videoUrl;
    episodeOutput.classList.remove("hidden");
  } else {
    episodeVideo.removeAttribute("src");
    episodeVideo.load();
    episodeDownload.removeAttribute("href");
    episodeOutput.classList.add("hidden");
  }
  renderShots(episode, project);
  renderAssets(project.assets);
  renderActivity(project.activity);
  renderSourceLibrary(project);
  renderAssetGallery(project);
  renderEpisodeQueue(project);
  icons();
}

function syncPolling() {
  const pending = allProjects.some((project) => ["queued", "running", "rendering"].includes(project.status));
  if (pending && !pollTimer) pollTimer = setInterval(() => refreshAll(), 1800);
  if (!pending && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function refreshAll({ notify = false } = {}) {
  try {
    const [status, projectsPayload, recommendationPayload] = await Promise.all([
      api("/api/status"),
      api("/api/projects"),
      api("/api/recommendations")
    ]);
    renderStatus(status);
    allProjects = projectsPayload.projects;
    recommendations = recommendationPayload.items;
    $("#recommendationVerifiedAt").textContent = `核验于 ${recommendationPayload.verifiedAt}`;
    renderRecommendations();
    renderProjectCatalog();
    if (activeProjectId && allProjects.some((project) => project.id === activeProjectId)) {
      const { project } = await api(`/api/projects/${activeProjectId}`);
      renderProject(project);
      if (["source-review", "rights-review"].includes(project.status) && activeView === "overview") {
        showView("sources");
      }
      if (project.status === "season-review" && activeView === "overview") {
        showView("episodes");
      }
    } else {
      activeProject = null;
      activeProjectId = null;
      setProjectNavigation(false);
      $("#projectContext").classList.add("hidden");
      renderStages({ stage: "", status: "idle" });
      renderSourceLibrary(null);
      renderAssetGallery(null);
      renderEpisodeQueue(null);
      if (PROJECT_VIEWS.has(activeView)) showView("projects");
    }
    renderTaskCenter();
    syncPolling();
    if (notify) showToast("生产状态已刷新");
  } catch (error) {
    showToast(error.message);
  }
}

$("#launchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { project } = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        novelName: $("#novelName").value
      })
    });
    $("#createProjectDialog").close();
    $("#launchForm").reset();
    renderProject(project);
    showView("overview");
    await refreshAll();
    showToast("项目已创建，来源检索任务已启动");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#refreshButton").addEventListener("click", () => refreshAll({ notify: true }));
$("#themeButton").addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
  localStorage.setItem("novel-studio-theme", document.documentElement.classList.contains("light") ? "light" : "dark");
});

document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  closeProject();
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (button.dataset.view === "projects") closeProject();
    else showView(button.dataset.view);
  });
});

document.querySelectorAll(".inspector-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".inspector-tabs button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    $("#assetsPanel").classList.toggle("hidden", button.dataset.tab !== "assets");
    $("#activityPanel").classList.toggle("hidden", button.dataset.tab !== "activity");
  });
});

document.querySelectorAll(".mobile-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (button.dataset.view === "projects") closeProject();
    else showView(button.dataset.view);
  });
});

$("#newProjectButton").addEventListener("click", () => {
  $("#launchForm").reset();
  $("#formHint").textContent = "确认来源后先分析章节与正文，生成全书分集规划，再选择本季范围。";
  $("#createProjectDialog").showModal();
  $("#novelName").focus();
});
$("#createProjectDialogClose").addEventListener("click", () => $("#createProjectDialog").close());
$("#cancelCreateProjectButton").addEventListener("click", () => $("#createProjectDialog").close());
$("#createProjectDialog").addEventListener("click", (event) => {
  if (event.target === $("#createProjectDialog")) $("#createProjectDialog").close();
});
$("#backToProjectsButton").addEventListener("click", closeProject);
$("#manageSourcesButton").addEventListener("click", async () => {
  try {
    const payload = await api("/api/search-sources");
    sourceRegistry = payload.sources;
    renderSourceRegistry();
    $("#sourceConfigDialog").showModal();
  } catch (error) {
    showToast(error.message);
  }
});
$("#sourceConfigDialogClose").addEventListener("click", () => $("#sourceConfigDialog").close());
$("#sourceConfigDialog").addEventListener("click", (event) => {
  if (event.target === $("#sourceConfigDialog")) $("#sourceConfigDialog").close();
});
$("#sourceConfigList").addEventListener("change", async (event) => {
  const row = event.target.closest("[data-source-index]");
  if (!row || event.target.type !== "checkbox") return;
  const source = sourceRegistry[Number(row.dataset.sourceIndex)];
  const previous = source.enabled;
  source.enabled = event.target.checked;
  try {
    await persistSourceRegistry("检索源状态已更新");
  } catch (error) {
    source.enabled = previous;
    renderSourceRegistry();
    showToast(error.message);
  }
});
$("#sourceConfigList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-source]");
  if (!button) return;
  const index = Number(button.dataset.removeSource);
  const [removed] = sourceRegistry.splice(index, 1);
  try {
    await persistSourceRegistry("检索源已删除");
  } catch (error) {
    sourceRegistry.splice(index, 0, removed);
    renderSourceRegistry();
    showToast(error.message);
  }
});
$("#sourceConfigForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#sourceConfigName").value.trim();
  const domain = $("#sourceConfigDomain").value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  sourceRegistry.push({
    id: `custom-${Date.now()}`,
    name,
    domains: [domain],
    rights: $("#sourceConfigRights").value,
    enabled: true,
    knownBooks: []
  });
  try {
    await persistSourceRegistry("检索源已添加");
    event.currentTarget.reset();
  } catch (error) {
    sourceRegistry.pop();
    showToast(error.message);
  }
});

$("#stageTrack").addEventListener("click", (event) => {
  const button = event.target.closest("[data-node-id]");
  if (button) openNode(button.dataset.nodeId);
});

$("#sourceTable").addEventListener("change", (event) => {
  if (!event.target.matches("input[name=sourceCandidate]")) return;
  selectedSourceId = event.target.value;
  renderSourceLibrary(activeProject);
});

$("#authorizedTextFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    event.target.value = "";
    showToast("正文文件不能超过 12 MB");
    return;
  }
  if (!/\.(txt|md)$/i.test(file.name) && !["text/plain", "text/markdown"].includes(file.type)) {
    event.target.value = "";
    showToast("仅支持 TXT 或 Markdown 文件");
    return;
  }
  authorizedTextDraft = (await file.text()).replace(/\0/g, "").trim();
  authorizedFileName = file.name;
  if (authorizedTextDraft.length < 500) {
    showToast("正文至少需要 500 个字符");
  }
  renderContentImport(activeProject, activeProject?.sources?.find((source) => source.id === selectedSourceId));
});
$("#authorizedRightsConfirmed").addEventListener("change", updateContentImportButton);
$("#importContentButton").addEventListener("click", async () => {
  if (!activeProjectId || !selectedSourceId || authorizedTextDraft.length < 500) return;
  const button = $("#importContentButton");
  button.disabled = true;
  try {
    const { project } = await api(`/api/projects/${activeProjectId}/content`, {
      method: "POST",
      body: JSON.stringify({
        sourceId: selectedSourceId,
        content: authorizedTextDraft,
        fileName: authorizedFileName,
        rightsConfirmed: $("#authorizedRightsConfirmed").checked
      })
    });
    authorizedTextDraft = "";
    authorizedFileName = "";
    renderProject(project);
    showView("overview");
    showToast("授权正文已导入，流水线继续执行");
    await refreshAll();
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
});

$("#confirmSourceButton").addEventListener("click", async () => {
  if (!activeProjectId || !selectedSourceId) return;
  const button = $("#confirmSourceButton");
  button.disabled = true;
  try {
    const { project } = await api(`/api/projects/${activeProjectId}/source`, {
      method: "POST",
      body: JSON.stringify({ sourceId: selectedSourceId })
    });
    renderProject(project);
    showView("overview");
    await refreshAll();
    showToast("来源已确认，流水线继续执行");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

$("#rescanSourcesButton").addEventListener("click", async () => {
  if (!activeProjectId) return;
  const button = $("#rescanSourcesButton");
  button.disabled = true;
  try {
    const { project } = await api(`/api/projects/${activeProjectId}/rescan`, {
      method: "POST",
      body: "{}"
    });
    renderProject(project);
    await refreshAll();
    showToast("已按最新来源策略重新检索");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#assetFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeAssetFilter = button.dataset.filter;
  document.querySelectorAll("#assetFilters button").forEach((item) => item.classList.toggle("active", item === button));
  renderAssetGallery(activeProject);
});
$("#taskFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-filter]");
  if (!button) return;
  taskFilter = button.dataset.taskFilter;
  taskDisplayLimit = 50;
  document.querySelectorAll("#taskFilters button").forEach((item) => item.classList.toggle("active", item === button));
  renderTaskCenter();
});
$("#taskSearch").addEventListener("input", (event) => {
  taskQuery = event.target.value.trim().toLowerCase();
  taskDisplayLimit = 50;
  renderTaskCenter();
});
$("#projectFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-filter]");
  if (!button) return;
  projectFilter = button.dataset.projectFilter;
  document.querySelectorAll("#projectFilters button").forEach((item) => item.classList.toggle("active", item === button));
  renderProjectCatalog();
});
$("#projectSearch").addEventListener("input", (event) => {
  projectQuery = event.target.value.trim().toLowerCase();
  renderProjectCatalog();
});
$("#recommendationLanguageFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-recommendation-language]");
  if (!button) return;
  recommendationLanguage = button.dataset.recommendationLanguage;
  document.querySelectorAll("#recommendationLanguageFilters button").forEach((item) => item.classList.toggle("active", item === button));
  renderRecommendations();
});
$("#recommendationSearch").addEventListener("input", (event) => {
  recommendationQuery = event.target.value.trim().toLocaleLowerCase();
  renderRecommendations();
});
$("#recommendationGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-start-recommendation]");
  if (!button) return;
  const recommendation = recommendations.find((item) => item.id === button.dataset.startRecommendation);
  if (!recommendation) return;
  $("#launchForm").reset();
  $("#novelName").value = recommendation.title;
  $("#formHint").textContent = `将先分析《${recommendation.title}》的正文与章节，再生成可选择的全书分集规划。`;
  $("#createProjectDialog").showModal();
});
$("#projectGrid").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-project-id]");
  if (!card) return;
  try {
    await openProject(card.dataset.projectId);
  } catch (error) {
    showToast(error.message);
  }
});
$("#loadMoreTasks").addEventListener("click", () => {
  taskDisplayLimit += 50;
  renderTaskCenter();
});
$("#taskList").addEventListener("click", async (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;
  try {
    await openProject(row.dataset.projectId);
  } catch (error) {
    showToast(error.message);
  }
});
$("#refreshAssetsButton").addEventListener("click", () => refreshGeneratedImages());

for (const selector of ["#assetList", "#assetGallery"]) {
  $(selector).addEventListener("click", (event) => openAsset(event.target.closest("[data-asset-id]")?.dataset.assetId));
  $(selector).addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openAsset(event.target.closest("[data-asset-id]")?.dataset.assetId);
  });
}

$("#assetDialogClose").addEventListener("click", () => $("#assetDialog").close());
$("#assetDialog").addEventListener("click", (event) => {
  if (event.target === $("#assetDialog")) $("#assetDialog").close();
});
$("#nodeDialogClose").addEventListener("click", () => $("#nodeDialog").close());
$("#nodeDialog").addEventListener("click", (event) => {
  if (event.target === $("#nodeDialog")) $("#nodeDialog").close();
});

$("#seasonStartEpisode").addEventListener("change", updateSeasonSelectionSummary);
$("#seasonEpisodeCount").addEventListener("input", updateSeasonSelectionSummary);
$("#seasonSelectionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeProjectId || activeProject?.status !== "season-review") return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const startEpisode = Number($("#seasonStartEpisode").value);
    const episodeCount = Number($("#seasonEpisodeCount").value);
    const seasonNumber = Number($("#seasonNumber").value);
    await api(`/api/projects/${activeProjectId}/season`, {
      method: "POST",
      body: JSON.stringify({ startEpisode, episodeCount, seasonNumber })
    });
    showToast(`第 ${seasonNumber} 季范围已锁定，正在生成 ${episodeCount} 集详细剧本`);
    showView("overview");
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function retryActiveProject({ approveBudget = false } = {}) {
  if (!activeProjectId) return;
  if (approveBudget) {
    const episodeCount = Number(activeProject?.seasonEpisodeCount || activeProject?.episodes?.length || 1);
    const cost = episodeCount
      * projectDurationSeconds(activeProject)
      * Number(runtimeStatus?.production?.videoCostPerSecondCny || 0);
    if (!window.confirm(`确认启动全季 ${episodeCount} 集视频生成？参考费用约 ¥${cost.toFixed(2)}。`)) return;
  }
  try {
    await api(`/api/projects/${activeProjectId}/retry`, {
      method: "POST",
      body: JSON.stringify({ approveBudget })
    });
    showView("overview");
    showToast(isDemoPreview(activeProject) ? "真实生成任务已启动" : "任务已重新进入生产队列");
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

$("#retryButton").addEventListener("click", () => {
  retryActiveProject({
    approveBudget: activeProject?.status === "budget-gate"
      && activeProject?.stage === "render"
  });
});
$("#productionNotice").addEventListener("click", (event) => {
  if (event.target.closest("[data-select-season]")) showView("episodes");
  if (event.target.closest("[data-start-live]")) retryActiveProject();
  if (event.target.closest("[data-retry-planning]")) retryActiveProject();
  if (event.target.closest("[data-approve-budget]")) {
    retryActiveProject({ approveBudget: true });
  }
});

$("#exportButton").addEventListener("click", async () => {
  if (!activeProjectId) return;
  try {
    const { downloadUrl } = await api(`/api/projects/${activeProjectId}/export`, { method: "POST", body: "{}" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `${activeProject.novelName}-production-manifest.json`;
    link.click();
    showToast("生产清单已导出");
  } catch (error) {
    showToast(error.message);
  }
});

if (platform === "mobile" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/mobile-sw.js"));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    $("#installButton").classList.remove("hidden");
  });
  $("#installButton").addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
    $("#installButton").classList.add("hidden");
  });
}

if (localStorage.getItem("novel-studio-theme") === "light") document.documentElement.classList.add("light");
const initialParams = new URLSearchParams(window.location.search);
const requestedView = initialParams.get("view") || "projects";
activeProjectId = initialParams.get("project");
icons();
showView(activeProjectId ? "projects" : requestedView);
await refreshAll();
if (activeProject && PROJECT_VIEWS.has(requestedView)) showView(requestedView);
