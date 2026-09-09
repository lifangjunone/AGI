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
let activeProjectId = null;
let pollTimer = null;
let toastTimer = null;

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
  $("#modeLabel").textContent = status.mode === "live"
    ? `方舟生产模式 · ${status.billableGenerationEnabled ? "计费已开启" : "预算门禁开启"}`
    : "演示生产模式 · 不产生模型费用";
  $("#dailyTarget").textContent = `${status.production.dailyHours}h`;
  $("#dailyEpisodes").textContent = `${status.production.episodesPerDay} 集 / 日`;
  $("#metricHours").textContent = status.production.dailyHours;
  $("#metricMinutes").textContent = status.production.episodeMinutes;
  $("#metricShots").textContent = status.production.videoTasksPerDay.toLocaleString("zh-CN");
  $("#metricConcurrency").textContent = status.production.maxVideoConcurrency;
  $("#metricBudget").textContent = `¥${status.production.dailyBudgetCny}`;
}

function renderStages(project) {
  const activeIndex = STAGES.findIndex(([id]) => id === project.stage);
  $("#stageTrack").innerHTML = STAGES.map(([id, label], index) => {
    const state = index < activeIndex || project.status === "completed"
      ? "done"
      : index === activeIndex ? "active" : "";
    return `<span class="stage ${state}" data-stage="${id}">${String(index + 1).padStart(2, "0")} ${label}</span>`;
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
    return `<span class="shot ${shot.status}" style="--height:${height}px;--progress:${shot.progress || 0}%" title="${shot.id} · ${shot.status}"></span>`;
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
    <article class="asset-card">
      <img src="${asset.imageUrl}" alt="${asset.name}" loading="lazy">
      <div><strong>${asset.name}</strong><small>${ASSET_TYPES[asset.type] || asset.type} · ${asset.id}</small></div>
      <span title="连续性资产已锁定"><i data-lucide="badge-check"></i></span>
    </article>
  `).join("") : `<p class="micro-label">等待视觉资产生成</p>`;
}

function renderActivity(activity = []) {
  $("#activityList").innerHTML = activity.map((item) => {
    const time = new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return `<li><time>${time}</time>${item.message}</li>`;
  }).join("");
}

function renderProject(project) {
  activeProjectId = project.id;
  $("#emptyState").classList.add("hidden");
  $("#projectView").classList.remove("hidden");
  $("#projectTitle").textContent = project.novelName;
  const badge = $("#projectStatus");
  badge.textContent = STATUS_LABELS[project.status] || project.status;
  badge.className = `state-badge ${project.status}`;
  renderStages(project);
  $("#projectCover").src = coverUrl(project.novelName);
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
  $("#formHint").textContent = project.error || `当前阶段：${STAGES.find(([id]) => id === project.stage)?.[1] || project.stage}`;
  icons();
}

async function refreshProject() {
  if (!activeProjectId) return;
  try {
    const { project } = await api(`/api/projects/${activeProjectId}`);
    renderProject(project);
    if (["completed", "failed", "rights-review", "budget-gate"].includes(project.status)) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function load() {
  try {
    const [status, projectsPayload] = await Promise.all([api("/api/status"), api("/api/projects")]);
    renderStatus(status);
    if (projectsPayload.projects[0]) {
      renderProject(projectsPayload.projects[0]);
      if (!["completed", "failed", "rights-review", "budget-gate"].includes(projectsPayload.projects[0].status)) {
        pollTimer = setInterval(refreshProject, 1800);
      }
    } else {
      renderStages({ stage: "", status: "idle" });
    }
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
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshProject, 1800);
    showToast("生产任务已进入队列");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#refreshButton").addEventListener("click", refreshProject);
$("#themeButton").addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
  localStorage.setItem("novel-studio-theme", document.documentElement.classList.contains("light") ? "light" : "dark");
});

document.querySelectorAll(".inspector-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".inspector-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    $("#assetsPanel").classList.toggle("hidden", button.dataset.tab !== "assets");
    $("#activityPanel").classList.toggle("hidden", button.dataset.tab !== "activity");
  });
});

if (localStorage.getItem("novel-studio-theme") === "light") document.documentElement.classList.add("light");
icons();
load();
