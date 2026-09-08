const elements = {
  form: document.querySelector("#generate-form"),
  prompt: document.querySelector("#prompt"),
  promptCount: document.querySelector("#prompt-count"),
  clearPrompt: document.querySelector("#clear-prompt"),
  generateButton: document.querySelector("#generate-button"),
  generateSummary: document.querySelector("#generate-summary"),
  serviceState: document.querySelector("#service-state"),
  emptyState: document.querySelector("#empty-state"),
  videoPlayer: document.querySelector("#video-player"),
  renderState: document.querySelector("#render-state"),
  renderTitle: document.querySelector("#render-title"),
  renderTimer: document.querySelector("#render-timer"),
  renderProgress: document.querySelector("#render-progress"),
  renderDetail: document.querySelector("#render-detail"),
  stageTitle: document.querySelector("#stage-title"),
  durationStamp: document.querySelector("#duration-stamp"),
  timelineDuration: document.querySelector("#timeline-duration"),
  timelineEnd: document.querySelector("#timeline-end"),
  copyPrompt: document.querySelector("#copy-prompt"),
  downloadVideo: document.querySelector("#download-video"),
  createView: document.querySelector("#create-view"),
  libraryView: document.querySelector("#library-view"),
  libraryGrid: document.querySelector("#library-grid"),
  libraryEmpty: document.querySelector("#library-empty"),
  libraryCount: document.querySelector("#library-count"),
  refreshLibrary: document.querySelector("#refresh-library"),
  toast: document.querySelector("#toast")
};

const presets = {
  product:
    "一瓶高端透明香水置于黑色镜面展台，暖金色轮廓光扫过玻璃瓶身，细小水珠清晰可见。镜头从超近景缓慢环绕到产品正面，最后定格品牌级英雄镜头，写实商业摄影，运动稳定。",
  city:
    "雨后的现代城市夜晚，一位穿长风衣的年轻创作者穿过霓虹街口。镜头低机位跟拍，车辆灯光映在湿润路面，随后缓慢升高展现城市纵深，电影感，真实光影，人物始终清晰。",
  food:
    "刚出炉的可颂面包置于深色石板上，表面酥皮层次清晰。镜头微距推进，厨师轻轻掰开面包，热气和黄油光泽自然呈现，暖色餐厅光线，高速摄影质感。"
};

let activeVideo = null;
let timerHandle = null;
let toastHandle = null;

function iconRefresh() {
  window.lucide?.createIcons();
}

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function updateControls() {
  const duration = Number(selectedValue("duration"));
  const ratio = selectedValue("ratio");
  elements.promptCount.textContent = elements.prompt.value.length;
  elements.generateSummary.textContent = `${duration} 秒 · ${ratio}`;
  elements.durationStamp.textContent = `${duration} SEC`;
  elements.timelineDuration.textContent = formatClock(duration);
  elements.timelineEnd.textContent = formatClock(duration);
  localStorage.setItem("frame60:draft", elements.prompt.value);
}

function showToast(message, error = false) {
  clearTimeout(toastHandle);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", error);
  elements.toast.classList.add("is-visible");
  toastHandle = setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    elements.serviceState.className = `service-state ${status.ready ? "is-ready" : "is-error"}`;
    elements.serviceState.lastElementChild.textContent = status.ready ? "模型就绪" : "配置异常";
    if (!status.ready) {
      const missing = [
        !status.modelConfigured && "模型配置",
        !status.ffmpegReady && "FFmpeg"
      ].filter(Boolean);
      elements.serviceState.title = `缺少：${missing.join("、")}`;
    }
  } catch {
    elements.serviceState.className = "service-state is-error";
    elements.serviceState.lastElementChild.textContent = "服务离线";
  }
}

function startRenderTimer() {
  const started = Date.now();
  const details = [
    "正在向模型提交创意...",
    "模型正在构建主体与场景...",
    "正在计算动作与镜头运动...",
    "正在渲染视频帧...",
    "正在校验并对齐成片时长..."
  ];
  timerHandle = setInterval(() => {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    elements.renderTimer.textContent = formatClock(elapsed);
    elements.renderProgress.style.width = `${Math.min(92, 7 + Math.log2(elapsed + 1) * 13)}%`;
    elements.renderDetail.textContent = details[Math.min(details.length - 1, Math.floor(elapsed / 18))];
  }, 1000);
}

function stopRenderTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}

function setRendering(rendering) {
  elements.generateButton.disabled = rendering;
  elements.renderState.hidden = !rendering;
  if (rendering) {
    elements.renderTimer.textContent = "00:00";
    elements.renderProgress.style.width = "7%";
    startRenderTimer();
  } else {
    stopRenderTimer();
  }
}

function showVideo(video, autoplay = true) {
  activeVideo = video;
  elements.videoPlayer.src = `${video.url}?v=${encodeURIComponent(video.createdAt)}`;
  elements.videoPlayer.classList.add("is-visible");
  elements.emptyState.hidden = true;
  elements.stageTitle.textContent = video.prompt;
  elements.durationStamp.textContent = `${video.duration} SEC`;
  elements.timelineDuration.textContent = formatClock(video.duration);
  elements.timelineEnd.textContent = formatClock(video.duration);
  elements.copyPrompt.disabled = false;
  elements.downloadVideo.href = video.url;
  elements.downloadVideo.download = `frame60-${video.id}.mp4`;
  elements.downloadVideo.classList.remove("is-disabled");
  if (autoplay) elements.videoPlayer.play().catch(() => {});
}

async function generate(event) {
  event.preventDefault();
  const payload = {
    prompt: elements.prompt.value.trim(),
    duration: Number(selectedValue("duration")),
    ratio: selectedValue("ratio")
  };

  if (payload.prompt.length < 8) {
    showToast("请补充更完整的画面描述", true);
    elements.prompt.focus();
    return;
  }

  setRendering(true);
  elements.renderTitle.textContent = `正在生成 ${payload.duration} 秒成片`;
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败");
    elements.renderProgress.style.width = "100%";
    showVideo(result.video);
    showToast(`视频已生成，成片时长 ${result.video.deliveredDuration.toFixed(2)} 秒`);
    await loadLibrary();
  } catch (error) {
    showToast(error.message || "视频生成失败", true);
  } finally {
    setRendering(false);
  }
}

function createLibraryCard(video) {
  const card = document.createElement("article");
  card.className = "library-card";
  card.tabIndex = 0;

  const preview = document.createElement("video");
  preview.src = video.url;
  preview.preload = "metadata";
  preview.muted = true;

  const body = document.createElement("div");
  body.className = "library-card-body";
  const prompt = document.createElement("p");
  prompt.textContent = video.prompt;
  const meta = document.createElement("div");
  meta.className = "library-meta";
  const format = document.createElement("span");
  format.textContent = `${video.duration}s · ${video.ratio}`;
  const date = document.createElement("time");
  date.dateTime = video.createdAt;
  date.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(video.createdAt));
  meta.append(format, date);
  body.append(prompt, meta);
  card.append(preview, body);

  const open = () => {
    showVideo(video, false);
    switchView("create");
  };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") open();
  });
  card.addEventListener("mouseenter", () => preview.play().catch(() => {}));
  card.addEventListener("mouseleave", () => {
    preview.pause();
    preview.currentTime = 0;
  });
  return card;
}

async function loadLibrary() {
  try {
    const response = await fetch("/api/videos");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    elements.libraryGrid.replaceChildren(...result.videos.map(createLibraryCard));
    elements.libraryCount.textContent = result.videos.length;
    elements.libraryEmpty.hidden = result.videos.length > 0;
  } catch (error) {
    showToast(error.message || "无法读取作品库", true);
  }
}

function switchView(view) {
  const create = view === "create";
  elements.createView.hidden = !create;
  elements.libraryView.hidden = create;
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  });
  if (!create) loadLibrary();
}

elements.form.addEventListener("submit", generate);
elements.prompt.addEventListener("input", updateControls);
elements.clearPrompt.addEventListener("click", () => {
  elements.prompt.value = "";
  updateControls();
  elements.prompt.focus();
});
document.querySelectorAll('input[name="duration"], input[name="ratio"]').forEach((input) => {
  input.addEventListener("change", updateControls);
});
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.prompt.value = presets[button.dataset.preset];
    updateControls();
    elements.prompt.focus();
  });
});
document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});
elements.refreshLibrary.addEventListener("click", loadLibrary);
elements.copyPrompt.addEventListener("click", async () => {
  if (!activeVideo) return;
  await navigator.clipboard.writeText(activeVideo.prompt);
  showToast("提示词已复制");
});

elements.prompt.value = localStorage.getItem("frame60:draft") || "";
updateControls();
iconRefresh();
checkStatus();
loadLibrary();
