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
  "rights-review": "版权复核",
  "budget-gate": "预算门禁",
  rendering: "渲染中"
};
const ASSET_TYPES = { character: "角色", weapon: "武器", location: "场景" };
const VALID_VIEWS = new Set(["overview", "tasks", "sources", "assets", "episodes"]);
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
let activeView = "overview";
let taskQuery = "";
let taskDisplayLimit = 50;

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
  $("#metricHours").textContent = status.production.dailyHours;
  $("#metricMinutes").textContent = status.production.episodeMinutes;
  $("#metricConcurrency").textContent = status.production.maxVideoConcurrency;
  $("#metricBudget").textContent = `¥${status.production.dailyBudgetCny}`;
  $("#metricActiveProjects").textContent = status.queue?.activeCount || 0;
  $("#metricProjectSlots").textContent = `/ ${status.queue?.maxConcurrency || status.production.maxProjectConcurrency} 槽`;
  $("#metricQueuedProjects").textContent = status.queue?.queuedCount || 0;
}

function renderStages(project) {
  const activeIndex = STAGES.findIndex(([id]) => id === project.stage);
  $("#stageTrack").innerHTML = STAGES.map(([id, label], index) => {
    const state = index < activeIndex || project.status === "completed"
      ? "done"
      : index === activeIndex ? "active" : "";
    return `<span class="stage ${state}" role="listitem" data-stage="${id}">${String(index + 1).padStart(2, "0")} ${label}</span>`;
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
  $("#sourceResultCount").textContent = `${sources.length} 个来源`;
  $("#sourceTable").innerHTML = sources.length ? sources.map((source) => {
    const approved = ["public-domain", "public-domain-candidate"].includes(source.rights);
    const rightsText = source.rights === "public-domain"
      ? "公版"
      : source.rights === "public-domain-candidate" ? "公版候选" : source.rights === "metadata-only" ? "仅元数据" : "待授权";
    const link = source.sourceUrl
      ? `<a class="source-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer" title="打开原始来源" aria-label="打开 ${escapeHtml(source.title)} 原始来源"><i data-lucide="external-link"></i></a>`
      : "<span></span>";
    return `<article class="source-row">
      <div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.authors)}</small></div>
      <span>${escapeHtml(source.source)}</span>
      <span class="rights-badge ${approved ? "approved" : ""}">${rightsText}</span>
      <span>匹配 ${Number(source.score || 0)}%</span>
      ${link}
    </article>`;
  }).join("") : `<div class="view-empty"><i data-lucide="library-big"></i><p>启动生产后，这里会列出所有检索来源及版权状态。</p></div>`;
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

function showView(name) {
  if (!VALID_VIEWS.has(name)) name = "overview";
  activeView = name;
  document.querySelectorAll("[data-page-view]").forEach((view) => view.classList.toggle("hidden", view.dataset.pageView !== name));
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (name === "tasks") renderTaskCenter();
  if (name === "sources") renderSourceLibrary(activeProject);
  if (name === "assets") renderAssetGallery(activeProject);
  if (name === "episodes") renderEpisodeQueue(activeProject);
  const url = new URL(window.location.href);
  if (name === "overview") url.searchParams.delete("view");
  else url.searchParams.set("view", name);
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
  const novelInput = $("#novelName");
  if (document.activeElement !== novelInput && novelInput.dataset.syncedProject !== project.id) {
    novelInput.value = project.novelName;
    novelInput.dataset.syncedProject = project.id;
  }
  $("#emptyState").classList.add("hidden");
  $("#projectView").classList.remove("hidden");
  $("#projectTitle").textContent = project.novelName;
  const badge = $("#projectStatus");
  badge.textContent = STATUS_LABELS[project.status] || project.status;
  badge.className = `state-badge ${project.status}`;
  renderStages(project);
  const coverSource = coverUrl(project.novelName);
  $("#projectCover").src = coverSource;
  $("#projectCover").dataset.generatedSrc = coverSource;
  $("#coverProgress").textContent = `${project.progress}%`;
  $("#sourceTitle").textContent = project.source?.title || "正在检索";
  $("#sourceMeta").textContent = project.source
    ? `${project.source.authors} · ${project.source.source}`
    : "正在校验来源与版权状态";
  const rights = project.source?.rights || "checking";
  $("#rightsText").textContent = rights === "public-domain"
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
  const errorVisible = ["failed", "rights-review", "budget-gate"].includes(project.status);
  $("#formHint").textContent = errorVisible && project.error
    ? project.error
    : project.status === "queued"
      ? `排队第 ${project.queuePosition || "-"}/${queueState?.queuedCount || "-"} 位，预计等待 ${project.estimatedWaitMinutes || queueState?.averageDurationMinutes || 15} 分钟`
      : `当前阶段：${STAGES.find(([id]) => id === project.stage)?.[1] || project.stage}`;
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
    if (allProjects[0]) {
      const selected = allProjects.find((project) => project.id === activeProjectId) || allProjects[0];
      const { project } = await api(`/api/projects/${selected.id}`);
      renderProject(project);
    } else {
      activeProject = null;
      activeProjectId = null;
      renderStages({ stage: "", status: "idle" });
      renderSourceLibrary(null);
      renderAssetGallery(null);
      renderEpisodeQueue(null);
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
    renderProject(project);
    await refreshAll();
    showToast("生产任务已进入队列");
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
  showView("overview");
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
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
  button.addEventListener("click", () => showView(button.dataset.view));
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
$("#loadMoreTasks").addEventListener("click", () => {
  taskDisplayLimit += 50;
  renderTaskCenter();
});
$("#taskList").addEventListener("click", async (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;
  try {
    const { project } = await api(`/api/projects/${row.dataset.projectId}`);
    renderProject(project);
    showView("overview");
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
icons();
showView(new URLSearchParams(window.location.search).get("view") || "overview");
refreshAll();
