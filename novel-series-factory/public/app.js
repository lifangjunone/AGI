const pages = [...document.querySelectorAll(".page")];
const navItems = [...document.querySelectorAll(".nav-item")];

function showPage(name) {
  pages.forEach((page) => page.classList.toggle("active", page.id === `${name}-page`));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navItems.forEach((item) => item.addEventListener("click", () => showPage(item.dataset.page)));
document.querySelectorAll("[data-goto]").forEach((item) => {
  item.addEventListener("click", () => showPage(item.dataset.goto));
});

const episodeRow = document.querySelector("#episode-row");
for (let index = 1; index <= 36; index += 1) {
  const button = document.createElement("button");
  button.className = "episode-chip";
  if (index <= 7) button.classList.add("done");
  else if (index === 9) button.classList.add("warn");
  else if (index <= 12) button.classList.add("doing");
  button.textContent = String(index).padStart(2, "0");
  button.title = `第 ${index} 集`;
  button.addEventListener("click", () => showPage(index <= 7 ? "quality" : "episodes"));
  episodeRow.append(button);
}

const episodeList = document.querySelector("#episode-list");
for (let index = 1; index <= 18; index += 1) {
  const button = document.createElement("button");
  button.className = `episode-item${index === 9 ? " active" : ""}`;
  const status = index <= 7 ? "已确认" : index <= 12 ? "分镜制作中" : "待总审";
  button.innerHTML = `<span>第 ${String(index).padStart(2, "0")} 集 · ${
    index === 9 ? "雨夜追凶" : ["迷雾初现", "无名尸骨", "西市疑云", "故人来信"][index % 4]
  }</span><small>${status}</small>`;
  button.addEventListener("click", () => {
    document.querySelectorAll(".episode-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    showToast(`已切换到第 ${index} 集`);
  });
  episodeList.append(button);
}

const previewModal = document.querySelector("#preview-modal");
document.querySelector("#preview-button").addEventListener("click", () => {
  previewModal.hidden = false;
});
document.querySelector("#close-modal").addEventListener("click", () => {
  previewModal.hidden = true;
});
previewModal.addEventListener("click", (event) => {
  if (event.target === previewModal) previewModal.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") previewModal.hidden = true;
});

document.querySelector("#continue-button").addEventListener("click", () => { showPage("library"); refreshLibrary(); });

let toastTimer;
function showToast(message = "该操作会在正式 MVP 中执行") {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

document.querySelectorAll(".toast-trigger").forEach((button) => {
  button.addEventListener("click", () => showToast());
});

document.querySelectorAll(".resolve-button").forEach((button) => {
  button.addEventListener("click", () => {
    const issue = button.closest("article");
    issue.style.opacity = ".35";
    issue.style.pointerEvents = "none";
    button.textContent = "已加入返工队列";
    showToast("问题已加入局部返工队列");
  });
});

document.querySelectorAll(".tabbar, .view-options, .queue-filter").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    group.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

const createModal = document.querySelector("#create-modal");
const wizardPanels = [...document.querySelectorAll("[data-wizard-step]")];
const stepIndicators = [...document.querySelectorAll("[data-step-indicator]")];
const wizardNext = document.querySelector("#wizard-next");
const sourceNames = {
  manual: ["输入或上传小说", "导入你拥有版权或已获得改编授权的作品。"],
  search: ["通过小说名查找", "联网检索作品信息、正版来源与可用的公版正文。"],
  url: ["粘贴小说链接", "解析页面信息，并在读取正文前确认版权和访问权限。"],
  ai: ["原创剧情描述", "使用你提供的剧情制作技术预览，暂不调用语言模型扩写。"],
};
let wizardStep = 1;
let selectedSource = "manual";

function setWizardStep(step) {
  wizardStep = Math.max(1, Math.min(4, step));
  wizardPanels.forEach((panel) => panel.classList.toggle("active", Number(panel.dataset.wizardStep) === wizardStep));
  stepIndicators.forEach((indicator) => {
    const number = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle("active", number === wizardStep);
    indicator.classList.toggle("done", number < wizardStep);
  });
  wizardNext.textContent = {
    1: "下一步：填写内容 →",
    2: "确认试制规格 →",
    3: "确认规划 →",
    4: "创建项目并开始试制",
  }[wizardStep];
}

function openCreateModal() {
  createModal.hidden = false;
  setWizardStep(1);
}

function closeCreateModal() {
  createModal.hidden = true;
}

document.querySelector("#create-project-button").addEventListener("click", openCreateModal);
document.querySelector("#close-create-modal").addEventListener("click", closeCreateModal);
document.querySelector("#wizard-cancel").addEventListener("click", closeCreateModal);
createModal.addEventListener("click", (event) => {
  if (event.target === createModal) closeCreateModal();
});

document.querySelectorAll(".source-option").forEach((option) => {
  option.addEventListener("click", () => {
    selectedSource = option.dataset.source;
    document.querySelectorAll(".source-option").forEach((item) => item.classList.toggle("selected", item === option));
    document.querySelector("#source-form-title").textContent = sourceNames[selectedSource][0];
    document.querySelector("#source-form-subtitle").textContent = sourceNames[selectedSource][1];
    document.querySelectorAll("[data-source-form]").forEach((form) => {
      form.classList.toggle("active", form.dataset.sourceForm === selectedSource);
    });
  });
});

document.querySelectorAll("[data-prev-step]").forEach((button) => {
  button.addEventListener("click", () => setWizardStep(wizardStep - 1));
});

function preparePlan() {
  const manualTitle = document.querySelector("#manual-title").value.trim();
  const searchTitle = document.querySelector("#search-title").value.trim();
  const aiPremise = document.querySelector("#ai-premise").value.trim();
  const genre = document.querySelector("#ai-genre").value;
  const titleBySource = {
    manual: manualTitle || "未命名小说项目",
    search: searchTitle || "聊斋志异",
    url: "链接导入的新故事",
    ai: aiPremise ? `原创·${genre}` : `原创·${genre}故事`,
  };
  const summaryBySource = {
    manual: document.querySelector("#manual-content").value.trim().slice(0, 260),
    search: `系统将核验《${titleBySource.search}》的作者、版本与版权来源，正文可用后再生成改编方案。`,
    url: "系统将从已授权页面解析故事内容，并保留原始来源与正文版本记录。",
    ai: aiPremise || `一部面向短视频观众的${genre}故事，系统将建立三幕结构、角色成长弧与连续剧钩子。`,
  };
  document.querySelector("#generated-title").textContent = titleBySource[selectedSource];
  document.querySelector("#generated-summary").textContent = summaryBySource[selectedSource];
  document.querySelector("#final-project-title").textContent = titleBySource[selectedSource];
  document.querySelector("#final-source-label").textContent = `来源：${sourceNames[selectedSource][0]}`;
}

function collectProjectInput() {
  const titleBySource = {
    manual: document.querySelector("#manual-title").value.trim(),
    search: document.querySelector("#search-title").value.trim(),
    url: "链接导入项目",
    ai: `原创·${document.querySelector("#ai-genre").value}`,
  };
  const contentBySource = {
    manual: document.querySelector("#manual-content").value.trim(),
    search: "",
    url: document.querySelector("#novel-url").value.trim(),
    ai: "",
  };
  return {
    sourceType: selectedSource,
    title: titleBySource[selectedSource],
    content: contentBySource[selectedSource],
    premise: selectedSource === "ai" ? document.querySelector("#ai-premise").value.trim() : "",
    genre: document.querySelector("#ai-genre").value,
    rightsConfirmed: document.querySelector("#manual-rights").checked,
  };
}

function validateProjectInput(input) {
  if ((input.content || input.premise || "").length > 12000) return "最多支持 12000 字，请截取一个章节";
  if (input.sourceType === "manual") {
    if (!input.content) return "请填写小说正文";
    if (!document.querySelector("#manual-rights").checked) return "请先确认拥有视频改编授权";
  }
  if (input.sourceType === "ai" && !input.premise) return "请填写原创剧情描述";
  if (input.sourceType === "search") return "小说名联网取正文尚未接入，请先使用手工正文或 AI 原创";
  if (input.sourceType === "url") return "链接正文抓取尚未接入，请先使用手工正文或 AI 原创";
  return null;
}

const mvpModal = document.querySelector("#mvp-progress-modal");
const mvpResult = document.querySelector("#mvp-result");
const mvpError = document.querySelector("#mvp-error");
let currentProjectId = null;
let pollTimer;
let creating = false;
const retryButton = document.querySelector("#retry-project");

function updateMvpProgress(project) {
  mvpError.hidden = true;
  retryButton.hidden = project.status !== "failed";
  const progress = Number(project.progress || 0);
  document.querySelector("#mvp-progress-value").textContent = `${progress}%`;
  document.querySelector("#mvp-progress-bar").style.width = `${progress}%`;
  document.querySelector("#mvp-progress-stage").textContent = project.stage || "处理中";

  if (project.status === "completed") {
    document.querySelector("#mvp-progress-title").textContent = `${project.title} · 首集样片完成`;
    const video = document.querySelector("#mvp-video");
    video.src = project.assets.video;
    document.querySelector("#mvp-video-link").href = project.assets.video;
    document.querySelector("#mvp-audio-link").href = project.assets.audio;
    document.querySelector("#mvp-subtitle-link").href = project.assets.subtitles;
    document.querySelector("#mvp-story-link").href = project.assets.story;
    mvpResult.hidden = false;
    document.querySelector(".project-switcher strong").textContent = project.title;
    showToast("真实首集样片已完成，可预览和下载");
  }

  if (project.status === "failed") {
    mvpError.textContent = project.error || "生成失败";
    mvpError.hidden = false;
  }
}

async function pollProject(projectId) {
  clearTimeout(pollTimer);
  const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取项目状态");
  const project = await response.json();
  if (currentProjectId !== projectId || mvpModal.hidden) return;
  updateMvpProgress(project);
  if (project.status === "queued" || project.status === "running") {
    pollTimer = setTimeout(() => pollProject(projectId).catch(showMvpError), 2000);
  }
  refreshLibrary();
}

function showMvpError(error) {
  mvpError.textContent = error.message || String(error);
  mvpError.hidden = false;
}

async function createRealMvp(input) {
  clearTimeout(pollTimer);
  currentProjectId = null;
  retryButton.hidden = true;
  mvpModal.hidden = false;
  mvpResult.hidden = true;
  mvpError.hidden = true;
  document.querySelector("#mvp-progress-title").textContent = "正在制作首集样片";
  document.querySelector("#mvp-progress-stage").textContent = "正在创建项目";
  document.querySelector("#mvp-progress-value").textContent = "0%";
  document.querySelector("#mvp-progress-bar").style.width = "0%";

  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "项目创建失败");
  currentProjectId = payload.id;
  await pollProject(currentProjectId);
}

document.querySelector("#close-mvp-progress").addEventListener("click", () => {
  mvpModal.hidden = true;
  currentProjectId = null;
  clearTimeout(pollTimer);
  document.querySelector("#mvp-video").pause();
  showPage("library");
  refreshLibrary();
});

wizardNext.addEventListener("click", async () => {
  if (creating) return;
  if (wizardStep === 1) {
    setWizardStep(2);
    return;
  }
  if (wizardStep === 2) {
    const validation = validateProjectInput(collectProjectInput());
    if (validation) {
      showToast(validation);
      return;
    }
    preparePlan();
    setWizardStep(3);
    return;
  }
  if (wizardStep === 3) {
    const count = document.querySelector("#episode-count").value;
    document.querySelector("#final-episode-label").textContent = `${count} 集 · 技术预览`;
    setWizardStep(4);
    return;
  }
  const input = collectProjectInput();
  const validation = validateProjectInput(input);
  if (validation) return showToast(validation);
  creating = true;
  wizardNext.disabled = true;
  closeCreateModal();
  try {
    await createRealMvp(input);
  } catch (error) {
    showMvpError(error);
  } finally {
    creating = false;
    wizardNext.disabled = false;
  }
});

document.querySelector("#search-novel-button").addEventListener("click", () => {
  showToast("联网搜索尚未接入，请导入已授权的 TXT 正文");
});
document.querySelectorAll(".search-result").forEach((result) => {
  result.addEventListener("click", () => {
    document.querySelectorAll(".search-result").forEach((item) => item.classList.toggle("selected", item === result));
  });
});
document.querySelector("#analyze-url-button").addEventListener("click", () => {
  showToast("链接抓取尚未接入，请粘贴已授权正文");
});
document.querySelectorAll(".creative-chips button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#ai-premise").value = `创作一部${button.textContent}题材的系列故事，要有强开场、连续反转和每集悬念。`;
  });
});

document.querySelector("#novel-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (!file.name.toLowerCase().endsWith(".txt") || file.size > 102400) throw new Error("请导入 100 KB 以内的 UTF-8 TXT");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (!text.trim() || text.length > 12000) throw new Error("正文为空或超过 12000 字");
    document.querySelector("#manual-content").value = text;
    if (!document.querySelector("#manual-title").value) document.querySelector("#manual-title").value = file.name.replace(/\.txt$/i, "").slice(0, 80);
    document.querySelector("#file-status").textContent = `${file.name} · 已导入 ${text.length} 字`;
  } catch (error) {
    document.querySelector("#file-status").textContent = error.message;
  } finally { event.target.value = ""; }
});

async function openProject(id) {
  clearTimeout(pollTimer);
  currentProjectId = id;
  mvpModal.hidden = false;
  mvpResult.hidden = true;
  mvpError.hidden = true;
  retryButton.hidden = true;
  document.querySelector("#mvp-progress-title").textContent = "项目详情";
  await pollProject(id);
}

retryButton.addEventListener("click", async () => {
  retryButton.disabled = true;
  const id = currentProjectId;
  try {
    const response = await fetch(`/api/projects/${id}/retry`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (currentProjectId === id) await pollProject(id);
  } catch (error) { showMvpError(error); }
  finally { retryButton.disabled = false; }
});

async function refreshLibrary() {
  const status = document.querySelector("#library-status");
  try {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) throw new Error("读取失败");
    const { projects } = await response.json();
    status.textContent = projects.length ? `${projects.length} 个本地项目 · 点击卡片查看进度或下载` : "还没有项目，点击左侧「创建新项目」开始试制。";
    const list = document.querySelector("#project-library");
    list.replaceChildren();
    const labels = { completed: "已完成", failed: "失败 / 可重试", running: "执行中", queued: "排队中" };
    for (const project of projects) {
      const card = document.createElement("button");
      card.className = "panel project-card";
      const title = document.createElement("h2");
      title.textContent = project.title;
      const state = document.createElement("p");
      state.textContent = `${labels[project.status] || project.status} · ${project.progress}%`;
      const detail = document.createElement("small");
      detail.textContent = `${new Date(project.createdAt).toLocaleString()} · ${project.duration ? project.duration + " 秒" : project.stage}`;
      card.append(title, state, detail);
      card.addEventListener("click", () => openProject(project.id).catch(showMvpError));
      list.append(card);
    }
  } catch { status.textContent = "无法读取项目，请确认服务在线后点击刷新。"; }
}
document.querySelector("#refresh-projects").addEventListener("click", refreshLibrary);
document.querySelector('[data-page="library"]').addEventListener("click", refreshLibrary);
document.querySelectorAll(".page:not(#library-page)").forEach(page => {
  const notice = document.createElement("p");
  notice.className = "demo-notice";
  notice.textContent = "方案演示：本页人物、进度、金额和质检分数均为示例，不关联真实项目。真实任务请查看「我的项目」。";
  page.prepend(notice);
});
refreshLibrary();
