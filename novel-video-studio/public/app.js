const $ = (selector) => document.querySelector(selector);
const STAGES = [
  ["discover", "全网检索"],
  ["ingest", "内容核验"],
  ["adapt", "剧本改编"],
  ["design", "视觉设定"],
  ["render", "镜头渲染"],
  ["assemble", "成片装配"]
];
const STATUS_LABELS = {
  queued: "排队中",
  running: "生产中",
  completed: "已完成",
  failed: "失败",
  "source-review": "待确认来源",
  "rights-review": "版权复核",
  "budget-gate": "预算门禁",
  rendering: "渲染中"
};
const ASSET_TYPES = { character: "角色", weapon: "武器", location: "场景" };
const NODE_STATUS_LABELS = { pending: "未开始", running: "处理中", completed: "已完成", failed: "失败", paused: "已暂停" };
const VALID_VIEWS = new Set(["projects", "overview", "tasks", "sources", "assets", "episodes"]);
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
  queueState = status.queue;
  const queueSuffix = status.queue
    ? ` · ${status.queue.activeCount}/${status.queue.maxConcurrency} 项目槽 · ${status.queue.queuedCount} 排队`
    : "";
  $("#modeLabel").textContent = status.mode === "live"
    ? `${PLATFORM_LABELS[platform]} · 方舟生产模式 · ${status.billableGenerationEnabled ? "计费已开启" : "预算门禁开启"}${queueSuffix}`
    : `${PLATFORM_LABELS[platform]} · 演示生产模式 · 不产生模型费用${queueSuffix}`;
  $("#dailyTarget").textContent = `${status.production.dailyHours}h`;
  $("#dailyEpisodes").textContent = `${status.production.episodesPerDay} 集 / 日`;
  $("#metricMinutes").textContent = status.production.episodeMinutes;
  $("#metricBudget").textContent = `¥${status.production.dailyBudgetCny}`;
  $("#metricActiveProjects").textContent = status.queue?.activeCount || 0;
  $("#metricProjectSlots").textContent = `/ ${status.queue?.maxConcurrency || status.production.maxProjectConcurrency} 槽`;
  $("#metricQueuedProjects").textContent = status.queue?.queuedCount || 0;
}

function renderStages(project) {
  const activeIndex = STAGES.findIndex(([id]) => id === project.stage);
  $("#stageTrack").innerHTML = STAGES.map(([id, label], index) => {
    const fallbackState = index < activeIndex || project.status === "completed"
      ? "done"
      : index === activeIndex ? "active" : "";
    const nodeStatus = project.nodes?.[id]?.status
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

function renderShots(episode) {
  const shots = episode?.shots || [];
  $("#shotGrid").innerHTML = shots.map((shot) => {
    const height = 14 + ((shot.order * 11) % 25);
    return `<span class="shot ${escapeHtml(shot.status)}" style="--height:${height}px;--progress:${shot.progress || 0}%" title="${escapeHtml(shot.id)} · ${escapeHtml(shot.status)}"></span>`;
  }).join("");
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
      <div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.domains.join("、"))}</small></div>
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

function renderEpisodeQueue(project) {
  const episodes = project?.episodes || [];
  $("#episodeTable").innerHTML = episodes.length ? episodes.map((episode) => {
    const shots = episode.shots || [];
    const done = shots.filter((shot) => shot.status === "succeeded").length;
    const percent = shots.length ? Math.round((done / shots.length) * 100) : 0;
    return `<article class="episode-row">
      <span class="episode-number">E${String(episode.number || 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(episode.title || "未命名分集")}</strong><small>${escapeHtml(episode.logline || "等待剧本")}</small></div>
      <div><strong>${episode.durationMinutes || 15}:00</strong><small>目标时长</small></div>
      <div><strong>${done}/${shots.length}</strong><small>${escapeHtml(episode.status || project.status)}</small></div>
      <div><div class="mini-progress"><span style="width:${percent}%"></span></div><small>${percent}% 镜头完成</small></div>
    </article>`;
  }).join("") : `<div class="view-empty"><i data-lucide="film"></i><p>暂无分集任务。</p></div>`;
  $("#exportButton").disabled = !project;
  $("#retryButton").classList.toggle("hidden", !["failed", "rights-review", "budget-gate"].includes(project?.status));
}

function taskMatches(project, filter) {
  if (filter === "all") return true;
  if (filter === "active") return ["running", "rendering"].includes(project.status);
  if (filter === "review") return project.status === "source-review";
  if (filter === "failed") return ["failed", "rights-review", "budget-gate"].includes(project.status);
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
  if (filter === "review") return ["source-review", "rights-review", "budget-gate", "failed"].includes(project.status);
  return project.status === filter;
}

function renderProjectCatalog() {
  $("#metricProjectCount").textContent = allProjects.length;
  $("#metricReviewProjects").textContent = allProjects.filter((project) =>
    ["source-review", "rights-review", "budget-gate", "failed"].includes(project.status)
  ).length;
  const projects = allProjects.filter((project) => {
    const queryMatch = !projectQuery || `${project.novelName} ${project.sourceTitle || ""} ${project.id}`.toLowerCase().includes(projectQuery);
    return projectMatches(project, projectFilter) && queryMatch;
  });
  $("#projectCatalogCount").textContent = `${projects.length} 个项目`;
  $("#projectGrid").innerHTML = projects.length ? projects.map((project) => {
    const stageIndex = Math.max(0, STAGES.findIndex(([id]) => id === project.stage));
    const stageLabel = STAGES[stageIndex]?.[1] || "等待调度";
    const needsAction = ["source-review", "rights-review", "budget-gate", "failed"].includes(project.status);
    const statusDetail = project.status === "queued"
      ? `队列第 ${project.queuePosition || "-"} 位`
      : needsAction ? "需要处理" : stageLabel;
    return `<button class="project-card" data-project-id="${escapeHtml(project.id)}">
      <span class="project-cover">
        <img src="${escapeHtml(coverUrl(project.novelName))}" alt="${escapeHtml(project.novelName)} 项目封面" loading="lazy">
        <span class="task-state ${escapeHtml(project.status)}">${escapeHtml(STATUS_LABELS[project.status] || project.status)}</span>
      </span>
      <span class="project-card-body">
        <span class="project-card-title"><strong>${escapeHtml(project.novelName)}</strong><small>${escapeHtml(project.sourceTitle || "等待确认内容来源")}</small></span>
        <span class="project-card-progress"><span><b style="width:${Number(project.progress || 0)}%"></b></span><strong>${Number(project.progress || 0)}%</strong></span>
        <span class="project-stage-rail" aria-label="六节点进度">${STAGES.map((_, index) =>
          `<i class="${index < stageIndex || project.status === "completed" ? "done" : index === stageIndex ? "current" : ""}"></i>`
        ).join("")}</span>
        <span class="project-card-meta"><small>${escapeHtml(statusDetail)}</small><small>${project.episodeCount || 0} 集 · ${project.completedShots || 0}/${project.shotCount || 0} 镜头</small></span>
        <span class="project-card-footer"><time>${formatTaskTime(project.updatedAt || project.createdAt)}</time><span>进入项目 <i data-lucide="arrow-right"></i></span></span>
      </span>
    </button>`;
  }).join("") : `<div class="view-empty"><i data-lucide="folders"></i><p>${allProjects.length ? "当前筛选下没有项目。" : "还没有项目，创建第一个小说制片项目。"}</p></div>`;
  icons();
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
    const stage = STAGES.find(([id]) => id === project.stage)?.[1] || project.stage || "等待调度";
    const statusDetail = queued
      ? `第 ${project.queuePosition || "-"}/${queue.queuedCount} 位 · 预计 ${project.estimatedWaitMinutes || queue.averageDurationMinutes} 分钟`
      : `${stage} · ${project.completedShots || 0}/${project.shotCount || 0} 镜头`;
    const timeDetail = project.completedAt
      ? `完成 ${formatTaskTime(project.completedAt)}`
      : project.startedAt
        ? `启动 ${formatTaskTime(project.startedAt)}`
        : queued ? "等待生产槽" : `更新 ${formatTaskTime(project.updatedAt)}`;
    return `<button class="task-row ${project.id === activeProjectId ? "active-project" : ""}" data-project-id="${escapeHtml(project.id)}">
      <span class="task-title"><strong>${escapeHtml(project.novelName)}</strong><small>${escapeHtml(project.sourceTitle || project.id.slice(0, 8))}</small></span>
      <span class="task-state ${escapeHtml(project.status)}">${escapeHtml(STATUS_LABELS[project.status] || project.status)}</span>
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
  contextBadge.textContent = STATUS_LABELS[project.status] || project.status;
  contextBadge.className = `state-badge ${project.status}`;
  const badge = $("#projectStatus");
  badge.textContent = STATUS_LABELS[project.status] || project.status;
  badge.className = `state-badge ${project.status}`;
  renderStages(project);
  const coverSource = coverUrl(project.novelName);
  $("#projectCover").src = coverSource;
  $("#projectCover").dataset.generatedSrc = coverSource;
  $("#coverProgress").textContent = `${project.progress}%`;
  const displayedSource = project.source
    || project.sources?.find((source) => source.id === project.suggestedSourceId);
  $("#sourceTitle").textContent = displayedSource?.title || "正在检索";
  $("#sourceMeta").textContent = displayedSource
    ? `${displayedSource.authors} · ${displayedSource.source}`
    : "正在校验来源与版权状态";
  const rights = displayedSource?.rights || "checking";
  $("#rightsText").textContent = project.status === "source-review"
    ? "候选来源待你确认"
    : rights === "public-domain"
    ? "公版来源，可自动处理"
    : rights === "public-domain-candidate" ? "公版候选，已进入核验" : "等待授权或来源核验";
  const episode = project.episodes?.[0];
  $("#episodeTitle").textContent = episode?.title || "脚本生成中";
  renderShots(episode);
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
    const [status, projectsPayload] = await Promise.all([api("/api/status"), api("/api/projects")]);
    renderStatus(status);
    allProjects = projectsPayload.projects;
    renderProjectCatalog();
    if (activeProjectId && allProjects.some((project) => project.id === activeProjectId)) {
      const { project } = await api(`/api/projects/${activeProjectId}`);
      renderProject(project);
      if (["source-review", "rights-review"].includes(project.status) && activeView === "overview") showView("sources");
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
      body: JSON.stringify({ novelName: $("#novelName").value })
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
  $("#formHint").textContent = "创建后先检索候选来源，确认作品、作者和版本后继续。";
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

$("#retryButton").addEventListener("click", async () => {
  if (!activeProjectId) return;
  try {
    await api(`/api/projects/${activeProjectId}/retry`, { method: "POST", body: "{}" });
    showView("overview");
    showToast("任务已重新进入生产队列");
    await refreshAll();
  } catch (error) {
    showToast(error.message);
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
