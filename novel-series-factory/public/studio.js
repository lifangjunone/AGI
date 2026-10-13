const $ = selector => document.querySelector(selector);
const formats = { anime: "动漫", drama: "电视剧", film: "电影", other: "其它" };
const statuses = {
  draft: "方案已保存", queued: "排队中", running: "生成中", paused: "已暂停",
  stopped: "已停止", failed: "需要处理", completed: "已完成",
};
const settingHints = {
  ARK_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
  ARK_API_KEY: "粘贴方舟 API Key；留空则不修改",
  REFERENCE_ENV_FILE: "可选：引用另一个项目的 .env",
  ARK_LLM_MODEL: "用于小说理解、分集和剧本",
  ARK_MULTIMODAL_MODEL: "用于画面/视频理解和一致性检查",
  ARK_IMAGE_MODEL: "例如 doubao-seedream-4-0-250828",
  ARK_VIDEO_MODEL: "推荐 doubao-seedance-2-5-260628",
  SEEDANCE_MULTIMODAL_REFERENCES: "true：把人物多视图与固定角色音频传给 Seedance",
  SEEDANCE_CROSS_EPISODE_VIDEO_REFERENCE: "true：第 2 集起参考上一集视频并使用 extend 续写",
  SEEDANCE_MAX_REFERENCE_IMAGES: "制片参考图上限，Seedance 2.5 最大 30，建议 30",
  ASR_API_URL: "SeedASR 或其它字幕识别服务地址",
  ASR_API_KEY: "留空则沿用已保存值",
  ASR_MODEL: "ASR 模型名",
  TTS_API_URL: "例如 http://10.37.107.64:7861",
  TTS_MODEL: "例如 Qwen3-TTS-12Hz-1.7B-CustomVoice",
  TTS_DEFAULT_SPEAKER: "例如 Uncle_Fu",
  FALLBACK_VIDEO_API_URL: "OpenAI 兼容兜底接口，可选",
  FALLBACK_VIDEO_API_KEY: "留空则沿用已保存值",
  FALLBACK_VIDEO_MODEL: "兜底视频模型名，可选",
  RERANK_API_URL: "剧情检索重排服务，可选",
  RERANK_API_KEY: "留空则沿用已保存值",
  RERANK_MODEL: "重排模型名，可选",
  TIMESTAMP_API_URL: "字幕时间戳辅助模型，可选",
  TIMESTAMP_API_KEY: "留空则沿用已保存值",
  TIMESTAMP_MODEL: "时间戳模型名，可选",
  HERMES_ENABLED: "true：启用 Hermes 运行时；false 或留空：使用内置兼容 Agent Loop",
  HERMES_MODE: "embedded 或 api；api 会调用 Hermes OpenAI 兼容服务",
  HERMES_API_URL: "Hermes API Server 地址，例如 http://127.0.0.1:8000/v1",
  HERMES_API_KEY: "Hermes API Key；留空则不修改",
  HERMES_MODEL: "Hermes 使用的模型名；留空则沿用语言模型",
  HERMES_MAX_ROUNDS: "单次自然语言修改最多允许的工具动作数，默认 8",
  ALLOW_BILLABLE_GENERATION: "开启后才允许调用真实视频模型",
  DAILY_BUDGET_CNY: "每日生产预算硬门禁；预计费用超限时禁止启动",
  VIDEO_COST_CNY_PER_SECOND: "仅用于生产前预算估算；留空时明确显示无法估价",
  MAX_MODEL_CONCURRENCY: "建议 1-5",
  MODEL_REQUEST_TIMEOUT_MS: "例如 120000",
};
let sourceType = "manual", format = "anime", selectedId = null, selectedEpisodeNumber = null,
  currentProject, pollTimer, toastTimer, selectedAssetTab = "characters",
  lightboxItems = [], lightboxIndex = 0, currentAgentSession = null, agentPollTimer = null,
  selectedPipelineStage = null, currentPipelineStage = null, pipelineMounted = false;
const sourceValues = { manual: "", ai: "", url: "" };
const MAX_NOVEL_CHARACTERS = 1_000_000;

function notify(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#notice").hidden = true, 6000);
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "服务暂时不可用");
  return result;
}
function view(name) {
  clearTimeout(pollTimer);
  $("#player").pause();
  if (name !== "detail") exitPlayerFullscreen();
  for (const key of ["create", "library", "detail", "settings"]) $(`#${key}-view`).hidden = key !== name;
  $("#nav-create").classList.toggle("active", name === "create");
  $("#nav-library").classList.toggle("active", name === "library" || name === "detail");
  $("#nav-settings").classList.toggle("active", name === "settings");
  if (name !== "detail") {
    selectedId = null; selectedEpisodeNumber = null; currentAgentSession = null;
    clearTimeout(agentPollTimer);
    closeAgentDrawer();
  }
}
function source(type) {
  sourceValues[sourceType] = $("#story-input").value;
  sourceType = type;
  $("#story-input").value = sourceValues[type];
  document.querySelectorAll("[data-source]").forEach(button => {
    button.classList.toggle("selected", button.dataset.source === type);
    button.setAttribute("aria-selected", String(button.dataset.source === type));
  });
  $("#rights-row").hidden = type === "ai";
  $("#rights").required = type !== "ai";
  $("#import-text").hidden = type !== "manual";
  $("#story-input").placeholder = {
    manual: "粘贴你的小说正文……\n\n故事会从这里开始。",
    url: "https://…\n\n粘贴你有权改编的小说地址",
    ai: "例如：在一座没有夜晚的城市，一位修钟师发现了最后一次日落的录音……",
  }[type];
  $("#source-hint").textContent = {
    manual: "支持长篇正文，最多 100 万字符；集数会按全文动态分析。",
    url: "会尝试读取公开文本页面；不会绕过付费、登录或反爬限制。",
    ai: "根据创意建立故事与动态分集方案；制作前可继续由导演 Agent 调整。",
  }[type];
  count();
}
function count() {
  const limit = sourceType === "url" ? 4_000 : MAX_NOVEL_CHARACTERS;
  $("#story-input").maxLength = limit;
  $("#char-count").textContent =
    `${$("#story-input").value.length.toLocaleString("zh-CN")} / ${limit.toLocaleString("zh-CN")}`;
}
$("#story-input").addEventListener("input", count);
document.querySelectorAll("[data-source]").forEach(button => button.addEventListener("click", () => source(button.dataset.source)));
document.querySelectorAll("[data-format]").forEach(button => button.addEventListener("click", () => {
  format = button.dataset.format;
  document.querySelectorAll("[data-format]").forEach(b => {
    b.classList.toggle("selected", b === button); b.setAttribute("aria-pressed", String(b === button));
  });
  $("#ratio").value = ["film", "drama"].includes(format) ? "16:9" : "9:16";
  updateDurationOptions();
}));
$("#nav-create").addEventListener("click", () => view("create"));
$("#nav-library").addEventListener("click", () => { view("library"); loadLibrary(); });
$("#nav-settings").addEventListener("click", () => { view("settings"); loadSettings(); loadModelStatus(); });
$("#back-library").addEventListener("click", () => { view("library"); loadLibrary(); });
$("#refresh").addEventListener("click", loadLibrary);
$("#refresh-models").addEventListener("click", () => loadModelStatus(true));
$("#episode-duration").addEventListener("change", updateCustomDuration);
$("#custom-duration-unit").addEventListener("change", updateCustomDurationLimits);

function updateCustomDuration() {
  const custom = $("#episode-duration").value === "custom";
  $("#custom-duration").hidden = !custom;
  $("#custom-duration-value").required = custom;
  if (custom) {
    updateCustomDurationLimits();
    $("#custom-duration-value").focus();
  }
}
function updateCustomDurationLimits() {
  const input = $("#custom-duration-value");
  const seconds = $("#custom-duration-unit").value === "seconds";
  input.min = seconds ? "5" : "0.1";
  input.max = seconds ? "10800" : "180";
  input.step = seconds ? "1" : "0.1";
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) {
    input.value = seconds ? "120" : "2";
  }
}
function selectedDurationSeconds() {
  const preset = $("#episode-duration").value;
  if (preset !== "custom") return Number(preset);
  const value = Number($("#custom-duration-value").value);
  const multiplier = $("#custom-duration-unit").value === "minutes" ? 60 : 1;
  const seconds = Math.round(value * multiplier);
  if (!Number.isFinite(value) || seconds < 5 || seconds > 10800) {
    throw new Error("自定义时长需在 5 秒到 180 分钟之间");
  }
  return seconds;
}

function imported(result) {
  if (!result) return;
  source("manual");
  $("#story-input").value = result.text;
  $("#project-title").value ||= result.name.replace(/\.txt$/i, "").slice(0, 80);
  count();
  notify(`已导入 ${result.name}`);
}
$("#import-text").addEventListener("click", async () => {
  try {
    if (window.desktop) imported(await window.desktop.importText());
    else $("#web-file").click();
  } catch (error) { notify(error.message); }
});
$("#web-file").addEventListener("change", async event => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10_000_000 || !file.name.endsWith(".txt")) throw new Error("请导入 10 MB 以内的 UTF-8 TXT");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if ([...text].length > MAX_NOVEL_CHARACTERS) throw new Error("小说正文最多支持 100 万字符，请按卷拆分");
    imported({ name: file.name, text });
  } catch (error) { notify(error.message); }
  finally { event.target.value = ""; }
});
$("#create-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("#save-plan").disabled = true;
  try {
    const text = $("#story-input").value.trim();
    const result = await api("/api/plans", {
      sourceType, content: sourceType === "manual" ? text : "", premise: sourceType === "ai" ? text : "",
      url: sourceType === "url" ? text : "", title: $("#project-title").value.trim(), format,
      episodeDurationSeconds: selectedDurationSeconds(), ratio: $("#ratio").value,
      audioStrategy: $("#audio-strategy").value,
      rightsConfirmed: $("#rights").checked,
    });
    await openProject(result.id);
    notify("制作方案已保存，未发起付费生成");
  } catch (error) { notify(error.message); }
  finally { $("#save-plan").disabled = false; }
});
async function loadLibrary() {
  try {
    const { projects } = await api("/api/projects");
    const library = $("#library");
    library.replaceChildren();
    if (!projects.length) library.textContent = "还没有作品。从一个故事开始吧。";
    projects.forEach(project => {
      const button = document.createElement("button"); button.className = "project";
      const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = statuses[project.status] || project.status;
      const title = document.createElement("h2"); title.textContent = project.title;
      const meta = document.createElement("p");
      meta.textContent = project.specification ?
        `${formats[project.specification.format]} · ${project.specification.episodeCount ? `建议 ${project.specification.episodeCount} 集` : "等待内容分析"}` :
        "历史样片任务";
      const date = document.createElement("small"); date.textContent = new Date(project.createdAt).toLocaleDateString();
      button.append(badge, title, meta, date);
      button.addEventListener("click", () => openProject(project.id).catch(error => notify(error.message)));
      library.append(button);
    });
  } catch (error) { notify(error.message); }
}
async function openProject(id) {
  view("detail");
  selectedId = id;
  selectedEpisodeNumber = null;
  selectedPipelineStage = null;
  currentPipelineStage = null;
  $("#process-details").open = false;
  renderVersionHistory(id).catch(error => notify(error.message));
  $("#player").hidden = true;
  $("#detail-title").textContent = "正在读取作品…";
  await refreshProject(id);
}

async function renderVersionHistory(id) {
  const { versions } = await api(`/api/projects/${id}/versions`);
  const list = $("#version-history-list");
  list.className = "version-history-list";
  list.replaceChildren();
  if (!versions.length) {
    list.textContent = "关键修改前会自动创建可恢复版本。";
    return;
  }
  for (const version of versions) {
    const row = document.createElement("article");
    row.className = "version-history-row";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = version.reason;
    const date = document.createElement("small");
    date.textContent = new Date(version.createdAt).toLocaleString();
    copy.append(title, date);
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "secondary";
    restore.textContent = "恢复此版本";
    restore.onclick = async () => {
      restore.disabled = true;
      try {
        await api(`/api/projects/${id}/versions/${version.id}/restore`, {});
        notify("版本已恢复；恢复前的当前状态也已自动备份");
        await refreshProject(id);
        await renderVersionHistory(id);
      } catch (error) {
        notify(error.message);
      } finally {
        restore.disabled = false;
      }
    };
    row.append(copy, restore);
    list.append(row);
  }
}
async function refreshProject(id) {
  clearTimeout(pollTimer);
  const project = await api(`/api/projects/${id}`);
  if (selectedId !== id) return;
  currentProject = project;
  updateAgentComposer();
  $("#detail-title").textContent = project.title;
  const spec = project.specification;
  const portrait = spec?.ratio === "9:16";
  $("#screen").classList.toggle("portrait", portrait);
  $("#screen").classList.toggle("landscape", !portrait);
  $("#detail-meta").textContent = spec ?
    `${formats[spec.format]} · ${spec.episodeCount ? `建议 ${spec.episodeCount} 集` : "集数待内容分析"} · ${formatDuration(spec.episodeDurationSeconds)} · ${spec.ratio}` :
    "历史样片任务";
  $("#status-badge").textContent = statuses[project.status] || project.status;
  $("#detail-stage").textContent = project.status === "draft" ? "先确认方向，再开始制作" : project.stage;
  $("#detail-description").textContent = project.status === "draft" ?
    "系统已根据内容和时长生成建议集数。你可以生成真实视频样片；如果只想检查旁白、字幕和封装链路，可生成流程自检片。" :
    project.status === "failed" ? "任务已暂停。展开制作详情查看失败位置，重试会复用有效旁白。" :
    project.status === "completed" ? resultDescription(project) : "正在处理，可以返回作品库。关闭应用会中断任务。";
  $("#progress").value = project.progress;
  $("#progress").hidden = project.status === "draft";
  const sourceReady = Boolean(project.input?.content || project.input?.resolvedContent || project.input?.premise);
  $("#prototype-actions").hidden = project.status !== "draft" || !sourceReady;
  $("#real-video").hidden = project.status !== "draft" || !sourceReady;
  $("#sample").hidden = project.status !== "draft" || !sourceReady;
  $("#episode-limit-row").hidden = project.status !== "draft" || !sourceReady;
  $("#export").hidden = !project.assets?.video;
  $("#retry").hidden = project.status !== "failed";
  $("#failure").hidden = project.status !== "failed";
  $("#failure").textContent = readableFailure(project);
  $("#technical-error-box").hidden = !(project.status === "failed" && project.technicalError);
  $("#technical-error").textContent = project.technicalError || "";
  $("#source-preview").textContent = JSON.stringify({ source: project.input, specification: spec }, null, 2);
  renderSeriesPlan(project);
  renderProductionControl(project);
  if (project.status === "failed") $("#process-details").open = true;
  const video = $("#player");
  const ready = !!project.assets?.video;
  video.hidden = !ready; $("#screen-empty").hidden = !!ready;
  $("#player-actions").hidden = !ready;
  if (ready && !$("#playing-label").dataset.manual) {
    $("#playing-label").textContent = "第 1 集";
  }
  if (ready && video.getAttribute("src") !== project.assets.video) video.src = project.assets.video;
  renderEpisodeBoard(project);
  renderEpisodeReader(project);
  renderProductionBible(project);
  renderPipeline(project);
  $("#steps").replaceChildren();
  for (const [key, label] of [["story", "内容整理 · 首集脚本"], ["speech", "旁白合成 · Qwen3-TTS"], ["render", project.generationMode === "real_video" ? "视频模型 / 合成 / 字幕" : "流程自检片 / 字幕 / 封装"]]) {
    const row = document.createElement("div"); row.className = "step";
    const name = document.createElement("span"); name.textContent = label;
    const state = document.createElement("small"); state.textContent = { completed: "已完成", running: "处理中", failed: "失败" }[project.steps?.[key]?.status] || "无步骤记录";
    row.append(name, state); $("#steps").append(row);
  }
  $("#asset-tools").replaceChildren();
  if (ready) for (const [label, filename] of [["旁白 WAV", "narration.wav"], ["字幕 SRT", "episode-01.srt"], ["结构 JSON", "story.json"]]) {
    const button = document.createElement("button"); button.className = "secondary"; button.textContent = `导出 ${label}`;
    button.onclick = () => exportAsset(filename);
    $("#asset-tools").append(button);
  }
  if (projectHasActiveWork(project)) {
    pollTimer = setTimeout(() => refreshProject(id).catch(error => notify(error.message)), 1200);
  }
}

function projectHasActiveWork(project) {
  return ["running", "queued"].includes(project.status) ||
    project.assetPreparation?.status === "running" ||
    project.productionBible?.status === "analyzing";
}

function mountPipeline() {
  if (pipelineMounted) return;
  const host = $("#pipeline-stage-panels");
  const panels = ["source", "analysis", "assets", "episodes", "delivery"].map(key => {
    const panel = document.createElement("section");
    panel.id = `pipeline-panel-${key}`;
    panel.className = "pipeline-stage-panel";
    panel.dataset.pipelinePanel = key;
    host.append(panel);
    return panel;
  });
  const sourceCard = document.createElement("article");
  sourceCard.id = "pipeline-source-card";
  sourceCard.className = "pipeline-source-card";
  panels[0].append(sourceCard);
  panels[1].append($("#series-plan"), $("#episode-reader"));
  panels[2].append($("#production-bible"));
  panels[3].append($("#production-control"), $("#episode-board"));
  panels[4].append($(".result-layout"), $("#process-details"));
  $("#pipeline-current-stage").onclick = () => {
    selectedPipelineStage = currentPipelineStage;
    renderPipeline(currentProject);
  };
  pipelineMounted = true;
}

function renderPipeline(project) {
  mountPipeline();
  const episodes = project.seriesPlan?.episodes || [];
  const completedEpisodes = new Set((project.assets?.episodes || []).map(item => item.number));
  const sourceReady = Boolean(project.input?.content || project.input?.resolvedContent || project.input?.premise);
  const analysisReady = episodes.length > 0;
  const assetsReady = Boolean(project.productionAssetReadiness?.ready);
  const episodesReady = analysisReady && completedEpisodes.size === episodes.length;
  const assembled = project.assembly?.status === "completed" &&
    project.assembly.episodeCount === episodes.length;
  const qualityPassed = project.productionRun?.qualityGate?.status === "passed";
  const deliveryReady = assembled && qualityPassed;
  const assetTotal = project.productionBible
    ? project.productionBible.characters.length + project.productionBible.scenes.length +
      project.productionBible.props.length + project.productionBible.voices.length
    : 0;
  const assetMissing = project.productionAssetReadiness?.missing?.length || 0;
  const assetProgress = assetsReady ? 100 : assetTotal
    ? Math.max(0, Math.round((assetTotal - assetMissing) / assetTotal * 100))
    : 0;
  const episodeProgress = episodes.length
    ? Math.round(completedEpisodes.size / episodes.length * 100)
    : 0;
  const deliveryProgress = deliveryReady ? 100 : assembled ? 70 :
    completedEpisodes.size > 0 ? 20 : 0;
  const failed = project.status === "failed";
  const busy = projectHasActiveWork(project);
  const definitions = [
    {
      key: "source", number: "01", label: "故事输入", icon: "文",
      complete: sourceReady, progress: sourceReady ? 100 : 0,
      detail: sourceReady ? sourceLabel(project) : "等待小说正文、地址或创作灵感",
      copy: sourceReady ? "故事来源已锁定，后续分集均可追溯到原始内容。" : "流水线需要先获得可解析的故事内容。",
    },
    {
      key: "analysis", number: "02", label: "AI 故事拆解", icon: "析",
      complete: analysisReady, progress: analysisReady ? 100 : 0,
      detail: analysisReady ? `${episodes.length} 集 · 每集 ${formatDuration(project.specification?.episodeDurationSeconds)}` : "依赖：故事输入",
      copy: analysisReady ? "分集数量、剧情覆盖和成片方向已经生成，可展开核对。" : "完成故事输入后，AI 会分析题材并动态拆分集数。",
    },
    {
      key: "assets", number: "03", label: "制片资产", icon: "资",
      complete: assetsReady, progress: assetProgress,
      detail: assetsReady ? "人物、场景、道具、固定音色已锁定" :
        analysisReady ? `待补齐 ${assetMissing || "若干"} 项资产` : "依赖：AI 故事拆解",
      copy: assetsReady ? "视频生成将强制引用这套资产，确保人物、服装、道具与声音连续。" :
        "先生成并确认人物多视图、场景、武器道具和角色固定音色，视频才能开拍。",
    },
    {
      key: "episodes", number: "04", label: "分集制作", icon: "拍",
      complete: episodesReady, progress: episodeProgress,
      detail: analysisReady ? `${completedEpisodes.size}/${episodes.length} 集完成${busy ? ` · ${project.stage}` : ""}` : "依赖：制片资产",
      copy: episodesReady ? "全部分集已经完成，可进入全集合成和最终验收。" :
        assetsReady ? "系统按顺序生成分集，并继承上一集的角色、服装、声音和画面尾帧。" :
          "制片资产未就绪，分集视频暂时锁定。",
    },
    {
      key: "delivery", number: "05", label: "质检与交付", icon: "片",
      complete: deliveryReady, progress: deliveryProgress,
      detail: deliveryReady ? "完整全集已验收，可播放与导出" :
        assembled ? "全集已合成，等待最终质量门禁" : "依赖：全部分集完成",
      copy: deliveryReady ? "成片、连续全集和商业交付包都在这里。" :
        "全部分集完成后，系统会合成全集并检查画面、音频、时长和连续性。",
    },
  ];
  let currentIndex = definitions.findIndex(stage => !stage.complete);
  if (currentIndex < 0) currentIndex = definitions.length - 1;
  if (failed) {
    const failedEpisode = project.productionRun?.failedEpisode;
    const failedStep = Object.entries(project.steps || {})
      .find(([, step]) => step?.status === "failed")?.[0];
    const legacyError = `${project.error || ""} ${project.technicalError || ""}`;
    currentIndex = failedEpisode || ["speech", "render"].includes(failedStep) ||
      /(ffmpeg|视频|合成|渲染|旁白|tts|字幕)/i.test(legacyError)
      ? 3
      : failedStep === "story" ? 1 : Math.max(0, currentIndex);
  }
  const previousCurrent = currentPipelineStage;
  currentPipelineStage = definitions[currentIndex].key;
  if (!selectedPipelineStage || selectedPipelineStage === previousCurrent) {
    selectedPipelineStage = currentPipelineStage;
  }
  const totalProgress = Math.round(definitions.reduce((sum, stage) => sum + stage.progress, 0) / definitions.length);
  const current = definitions[currentIndex];
  const completedStageCount = definitions.filter(stage => stage.complete).length;
  $("#pipeline-percent").textContent = `${completedStageCount}/5`;
  $(".pipeline-total span").textContent = "阶段完成";
  $("#pipeline-kicker").textContent = deliveryReady ? "制作完成" : failed ? "需要处理" :
    busy ? "正在制作" : "下一步";
  $("#pipeline-heading").textContent = deliveryReady ? "成片已完成，可以验收交付" :
    failed ? `${current.label}需要修复` :
      busy ? `${current.label}正在进行` :
        current.key === "assets" ? "完善制片资产，确认后开拍" :
          current.key === "episodes" ? `继续制作剩余 ${Math.max(0, episodes.length - completedEpisodes.size)} 集` :
            current.key === "delivery" ? "合成全集并完成最终验收" : current.label;
  $("#pipeline-now").textContent = deliveryReady
    ? "所有依赖已通过，完整视频和商业交付包已就绪。"
    : failed ? `${readableFailure(project)} 修复后会从当前步骤继续，不重复已完成工作。`
      : busy ? `${project.stage} · 进度会自动保存，可以随时离开此页面。`
        : current.copy;
  renderPipelineActivity(project, {
    current, deliveryReady, failed, busy, assetProgress,
  });
  const stageBox = $("#pipeline-stages");
  stageBox.replaceChildren();
  definitions.forEach((stage, index) => {
    const button = document.createElement("button");
    const isCurrent = stage.key === currentPipelineStage;
    const isSelected = stage.key === selectedPipelineStage;
    const locked = index > currentIndex && !stage.complete;
    button.type = "button";
    button.className = [
      "pipeline-stage", stage.complete ? "completed" : "",
      isCurrent ? failed ? "failed" : busy ? "running" : "current" : "",
      isSelected ? "selected" : "", locked ? "locked" : "",
    ].filter(Boolean).join(" ");
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(isSelected));
    button.innerHTML = `<span class="pipeline-stage-number">${stage.number}</span><i>${stage.complete ? "✓" : stage.icon}</i><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(stage.detail)}</small><em>${stage.complete ? "已完成" : isCurrent ? failed ? "需修复" : busy ? "进行中" : "当前步骤" : locked ? "等待依赖" : "可查看"}</em>`;
    button.onclick = () => {
      selectedPipelineStage = stage.key;
      renderPipeline(project);
    };
    stageBox.append(button);
  });
  const selected = definitions.find(stage => stage.key === selectedPipelineStage) || current;
  const reviewing = selected.key !== currentPipelineStage;
  $("#pipeline-workspace").classList.toggle("reviewing", reviewing);
  $("#pipeline-workspace-index").textContent = reviewing ? `正在回看 · STEP ${selected.number}` : `STEP ${selected.number}`;
  $("#pipeline-workspace-title").textContent = selected.label;
  $("#pipeline-workspace-copy").textContent = reviewing
    ? "这是已完成步骤的历史内容，不会改变当前制作进度。"
    : selected.copy;
  $("#pipeline-current-stage").hidden = !reviewing;
  document.querySelectorAll("[data-pipeline-panel]").forEach(panel => {
    panel.hidden = panel.dataset.pipelinePanel !== selected.key;
  });
  const processDetails = $("#process-details");
  if (failed) {
    $(`#pipeline-panel-${currentPipelineStage}`).append(processDetails);
    processDetails.open = true;
  } else {
    $("#pipeline-panel-delivery").append(processDetails);
  }
  renderPipelineSource(project, sourceReady);
}

function renderPipelineActivity(project, context) {
  const activity = $("#pipeline-activity");
  const title = $("#pipeline-activity-title");
  const detail = $("#pipeline-activity-detail");
  const progress = $("#pipeline-activity-progress");
  const time = $("#pipeline-activity-time");
  const assetTask = project.assetPreparation;
  const bibleAnalyzing = project.productionBible?.status === "analyzing";
  let state = "idle";
  let progressValue = context.current.progress || 0;
  let startedAt = null;
  if (assetTask?.status === "running") {
    state = "running";
    title.textContent = assetTask.stage || "正在准备制片资产";
    detail.textContent = `系统正在执行，已完成 ${assetTask.progress || 0}% · 页面会自动更新`;
    progressValue = assetTask.progress || 0;
    startedAt = assetTask.startedAt;
  } else if (bibleAnalyzing) {
    state = "running";
    title.textContent = "AI 正在分析小说中的制片要素";
    detail.textContent = "正在识别人物、场景、武器道具和角色音色";
    progressValue = 5;
  } else if (["running", "queued"].includes(project.status)) {
    state = "running";
    title.textContent = project.status === "queued" ? "任务已进入制作队列" : project.stage || "正在制作";
    detail.textContent = project.status === "queued"
      ? "等待当前任务开始，页面会自动更新"
      : `系统正在执行 · 项目进度 ${project.progress || 0}%`;
    progressValue = project.progress || 0;
    startedAt = project.productionRun?.startedAt;
  } else if (assetTask?.status === "failed") {
    state = "failed";
    title.textContent = "制片资产生成失败";
    detail.textContent = assetTask.error || "打开当前步骤查看并重试失败任务";
    progressValue = assetTask.progress || context.assetProgress || 0;
  } else if (project.status === "failed") {
    state = "failed";
    title.textContent = `${context.current.label}执行失败`;
    detail.textContent = readableFailure(project);
    progressValue = project.progress || 0;
  } else if (context.deliveryReady) {
    state = "completed";
    title.textContent = "整条制作流水线已完成";
    detail.textContent = "系统当前没有执行任务 · 成片可播放和交付";
    progressValue = 100;
  } else {
    title.textContent = `等待你开始“${context.current.label}”`;
    detail.textContent = "系统当前没有执行任务 · 点击下方主按钮后才会开始";
  }
  activity.className = `pipeline-activity ${state}`;
  progress.style.width = `${Math.max(0, Math.min(100, progressValue))}%`;
  time.textContent = state === "running"
    ? startedAt ? `已运行 ${formatElapsed(startedAt)}` : "执行中"
    : state === "failed" ? "已停止" : state === "completed" ? "已完成" : "等待操作";
}

function formatElapsed(startedAt) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000));
  if (!Number.isFinite(seconds)) return "片刻";
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}

function sourceLabel(project) {
  const labels = { manual: "小说正文", url: "小说地址", ai: "AI 原创灵感" };
  return labels[project.input?.sourceType] || labels[project.input?.type] || "故事内容";
}

function renderPipelineSource(project, ready) {
  const card = $("#pipeline-source-card");
  const content = project.input?.resolvedContent || project.input?.content || project.input?.premise || "";
  const source = project.input?.url || content;
  card.innerHTML = `<div><span class="badge">${ready ? "SOURCE LOCKED" : "SOURCE REQUIRED"}</span><h3>${escapeHtml(sourceLabel(project))}</h3><p>${escapeHtml(String(source).slice(0, 420) || "没有可用的故事内容")}${String(source).length > 420 ? "…" : ""}</p></div><dl><div><dt>内容状态</dt><dd>${ready ? "已解析" : "待修复"}</dd></div><div><dt>目标类型</dt><dd>${escapeHtml(formats[project.specification?.format] || "待确认")}</dd></div><div><dt>单集时长</dt><dd>${escapeHtml(formatDuration(project.specification?.episodeDurationSeconds))}</dd></div></dl>`;
}

async function action(button, endpoint, payload = {}) {
  button.disabled = true;
  const id = selectedId;
  try {
    await api(`/api/projects/${id}/${endpoint}`, payload);
    if (selectedId === id) await refreshProject(id);
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}

function renderProductionControl(project) {
  const section = $("#production-control");
  const episodes = project.seriesPlan?.episodes || [];
  section.hidden = !episodes.length;
  if (!episodes.length) return;
  const completed = new Set((project.assets?.episodes || []).map(item => item.number));
  const remaining = episodes.length - completed.size;
  const sourceReady = Boolean(project.input?.content || project.input?.resolvedContent || project.input?.premise);
  const assetsReady = Boolean(project.productionAssetReadiness?.ready);
  const busy = ["queued", "running"].includes(project.status);
  const assembled = project.assembly?.status === "completed" &&
    project.assembly.episodeCount === episodes.length;
  const run = project.productionRun;
  const percent = episodes.length ? Math.round(completed.size / episodes.length * 100) : 0;
  const stages = [
    ["故事来源", sourceReady, sourceReady ? "正文已解析，可追溯到分集原文" : "等待正文解析"],
    ["分集方案", episodes.length > 0, `${episodes.length} 集 · ${formatDuration(project.specification?.episodeDurationSeconds)}`],
    ["制片资产", assetsReady, assetsReady ? "人物、场景、道具与固定音色已就绪" :
      `缺少 ${(project.productionAssetReadiness?.missing || []).length} 项`],
    ["分集生产", remaining === 0, remaining ? `已完成 ${completed.size}/${episodes.length} 集` : "全部分集已完成"],
    ["全集合成", assembled, assembled ? `已合成 ${project.assembly.duration || 0} 秒全集` : "等待全部分集完成"],
    ["媒体验收", run?.qualityGate?.status === "passed",
      run?.qualityGate?.status === "passed" ? "视频、音频、时长与全集文件已验证" : "等待最终成片"],
  ];
  let title = "确认故事与分集";
  let copy = "系统会先补齐制片资产，再按集生成并完成全集验收。";
  let actionLabel = "生成制片资产包";
  let action = "assets";
  if (!sourceReady) {
    title = "等待小说正文";
    copy = "请先重新导入小说内容或修复小说地址。";
    actionLabel = "正文尚未就绪";
    action = "blocked";
  } else if (!assetsReady) {
    title = "下一步：生成制片资产";
    copy = "先确定人物四视图、场景、武器道具和角色固定音色，再允许视频开拍。";
  } else if (remaining > 0) {
    title = busy ? `全集生产中 · ${project.stage}` :
      run?.status === "failed" ? `生产在第 ${run.failedEpisode || "?"} 集暂停` : "下一步：开始全集生产";
    copy = busy ? "任务正在顺序执行。可以离开当前页面，进度会持续保存。" :
      `还需生成 ${remaining} 集。已完成分集会保留，失败后只继续未完成集。`;
    actionLabel = busy ? "全集生产进行中…" :
      run?.status === "failed" ? `继续剩余 ${remaining} 集` : `确认并生成剩余 ${remaining} 集`;
    action = "produce";
  } else if (!assembled) {
    title = "下一步：合成完整全集";
    copy = "全部分集均已完成，合成前会检查是否从第 1 集连续无缺失。";
    actionLabel = "合成并验收全集";
    action = "assemble";
  } else {
    title = "完整全集已交付";
    copy = "所有分集、连续全集和基础媒体验收均已完成。";
    actionLabel = "播放连续全集";
    action = "play";
  }
  $("#production-control-title").textContent = title;
  $("#production-control-copy").textContent = copy;
  $("#production-control-percent").textContent = `${percent}%`;
  $("#production-control-bar").value = percent;
  $("#production-control-count").textContent = `${completed.size} / ${episodes.length} 集完成`;
  const button = $("#production-control-action");
  button.textContent = actionLabel;
  button.disabled = action === "blocked";
  button.onclick = () => busy && run?.mode === "full_series"
    ? controlProduction(project, "pause")
    : runProductionAction(project, action, remaining);
  if (busy && run?.mode === "full_series") {
    button.textContent = run.control?.requested === "pause"
      ? "暂停请求已提交…"
      : "当前集完成后暂停";
  }
  const stop = $("#production-control-stop");
  stop.hidden = !(busy && run?.mode === "full_series");
  stop.disabled = Boolean(run?.control?.requested);
  stop.onclick = () => controlProduction(project, "stop");
  const blockers = $("#production-control-blockers");
  blockers.replaceChildren();
  for (const missing of project.productionAssetReadiness?.missing || []) {
    const tag = document.createElement("span");
    tag.textContent = missing;
    blockers.append(tag);
  }
  const list = $("#production-stage-list");
  list.replaceChildren();
  for (const [label, ready, detail] of stages) {
    const row = document.createElement("article");
    row.className = ready ? "completed" : busy && label === "分集生产" ? "running" : "";
    row.innerHTML = `<i>${ready ? "✓" : busy && label === "分集生产" ? "◌" : "·"}</i><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div>`;
    list.append(row);
  }
}

async function runProductionAction(project, action, remaining) {
  const button = $("#production-control-action");
  button.disabled = true;
  try {
    if (action === "assets") {
      notify("正在生成并验证人物、场景、道具和固定音色");
      await api(`/api/projects/${project.id}/production-assets/prepare`, {});
    } else if (action === "produce") {
      const confirmed = await confirmSeriesProduction(project, remaining);
      if (!confirmed) return;
      await api(`/api/projects/${project.id}/production/start`, {
        confirmBillable: true,
        confirmedEpisodeCount: remaining,
      });
      notify(`全集生产已开始，共 ${remaining} 集；失败后可从未完成集继续`);
    } else if (action === "assemble") {
      await api(`/api/projects/${project.id}/assemble`, {});
      notify("全集合成完成");
    } else if (action === "play") {
      $("#play-series").click();
      return;
    }
    await refreshProject(project.id);
  } catch (error) {
    notify(error.message);
    await refreshProject(project.id).catch(() => {});
  } finally {
    button.disabled = false;
  }
}

async function controlProduction(project, command) {
  try {
    await api(`/api/projects/${project.id}/production/${command}`, {});
    notify(command === "pause"
      ? "暂停请求已接受：当前分集完成并校验后暂停"
      : "停止请求已接受：当前分集完成并校验后结束本轮");
    await refreshProject(project.id);
  } catch (error) {
    notify(error.message);
  }
}

async function confirmSeriesProduction(project, remaining) {
  const result = await api(`/api/projects/${project.id}/production/preflight`);
  const preflight = result.preflight;
  return new Promise(resolve => {
    const dialog = $("#production-confirm");
    const check = $("#production-confirm-check");
    const submit = $("#production-confirm-submit");
    $("#production-confirm-copy").textContent =
      `本次将生成剩余 ${remaining} 集。系统会顺序调用真实视频模型，已完成分集不会重复生成。`;
    const estimate = preflight.costEstimate?.available
      ? `约 ¥${preflight.costEstimate.estimatedCost}（估算，非实际账单）`
      : "无法估价：请先在制片配置填写视频生成估算单价";
    $("#production-confirm-facts").innerHTML = [
      ["待生成", `${remaining} 集`],
      ["单集时长", formatDuration(project.specification?.episodeDurationSeconds)],
      ["预计费用", estimate],
      ["每日预算", preflight.dailyBudget ? `¥${preflight.dailyBudget}` : "未设置"],
      ["声音策略", project.specification?.audioStrategy === "tts" ? "固定角色 TTS" :
        project.specification?.audioStrategy === "native" ? "优先模型原声" : "智能保留原声 / TTS 回退"],
      ["失败恢复", "保留已完成集，仅继续剩余集"],
    ].map(([label, value]) =>
      `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    check.checked = false;
    check.disabled = !preflight.ready;
    submit.disabled = true;
    if (!preflight.ready) {
      $("#production-confirm-copy").textContent =
        `生产预检未通过：${preflight.blockers.join("；")}`;
    }
    dialog.hidden = false;
    document.body.classList.add("modal-open");
    const close = result => {
      dialog.hidden = true;
      document.body.classList.remove("modal-open");
      check.onchange = null;
      submit.onclick = null;
      $("#production-confirm-cancel").onclick = null;
      resolve(result);
    };
    check.onchange = () => { submit.disabled = !check.checked || !preflight.ready; };
    submit.onclick = () => close(true);
    $("#production-confirm-cancel").onclick = () => close(false);
  });
}
$("#sample").onclick = () => action($("#sample"), "sample");
$("#real-video").onclick = async () => {
  const button = $("#real-video");
  button.disabled = true;
  const id = selectedId;
  try {
    if (!currentProject?.productionAssetReadiness?.ready) {
      button.textContent = "先生成制片资产…";
      notify("正在自动生成并验收人物、场景、武器道具和固定音色；完成后会继续生成视频");
      await api(`/api/projects/${id}/production-assets/prepare`, {});
      await refreshProject(id);
    }
    button.textContent = "开始生成视频…";
    await api(`/api/projects/${id}/real-video`, {
      episodeLimit: Number($("#episode-limit").value),
    });
    await refreshProject(id);
  } catch (error) {
    notify(error.message);
    await refreshProject(id).catch(() => {});
  } finally {
    button.disabled = false;
    button.textContent = "生成真实视频样片";
  }
};
$("#retry").onclick = () => action($("#retry"), "retry");
async function exportAsset(filename) {
  try {
    if (window.desktop) {
      if (await window.desktop.exportAsset(selectedId, filename)) notify("已导出到所选位置");
    } else {
      const a = document.createElement("a");
      a.href = `/api/projects/${selectedId}/assets/${filename}`; a.download = filename; a.click();
    }
  } catch (error) { notify(error.message); }
}
$("#delivery-package").onclick = async () => {
  const button = $("#delivery-package");
  button.disabled = true;
  try {
    if (!currentProject?.delivery?.url) {
      notify("正在校验全集并生成商业交付包…");
      await api(`/api/projects/${selectedId}/delivery-package`, {});
      await refreshProject(selectedId);
    }
    await exportAsset("commercial-delivery.zip");
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
};
$("#export").onclick = () => exportAsset("episode-01.mp4");

document.querySelectorAll("[data-asset-tab]").forEach(button => button.onclick = () => {
  selectedAssetTab = button.dataset.assetTab;
  document.querySelectorAll("[data-asset-tab]").forEach(item =>
    item.classList.toggle("selected", item === button));
  if (currentProject) renderProductionBible(currentProject);
});

function renderProductionBible(project) {
  const section = $("#production-bible");
  const bible = project.productionBible;
  section.hidden = !bible;
  if (!bible) return;
  renderFormatRecommendation(project);
  const readiness = project.productionAssetReadiness || { ready: false, missing: [] };
  const total = bible.characters.length + bible.scenes.length + bible.props.length + bible.voices.length;
  const incomplete = readiness.missing?.length || 0;
  const ready = Math.max(0, total - incomplete);
  $("#bible-readiness").innerHTML =
    `<strong>${readiness.ready ? "已就绪" : `${ready}/${total}`}</strong><span>真实制片资产</span><small>${readiness.ready ? "允许生成分集视频" : `缺 ${incomplete} 项，禁止开拍`}</small>`;
  const preparing = project.assetPreparation?.status === "running";
  $("#prepare-assets").disabled = preparing || readiness.ready;
  $("#prepare-assets").textContent = preparing
    ? `${project.assetPreparation.stage} · ${project.assetPreparation.progress || 0}%`
    : readiness.ready ? "制片资产包已就绪" : "一键生成制片资产包";
  $("#analyze-bible").textContent = bible.status === "analyzing" ? "正在分析…" :
    bible.analyzedAt ? "重新分析制片资产" : "AI 分析制片资产";
  $("#analyze-bible").disabled = bible.status === "analyzing";
  const box = $("#asset-workspace");
  box.replaceChildren();
  if (selectedAssetTab === "characters") renderCharacters(box, bible);
  else if (selectedAssetTab === "scenes") renderSimpleAssets(box, bible.scenes, "场景");
  else if (selectedAssetTab === "props") renderSimpleAssets(box, bible.props, "武器 / 道具");
  else if (selectedAssetTab === "voices") renderVoices(box, bible);
  else renderContinuity(box, bible);
}

function renderFormatRecommendation(project) {
  const recommendation = project.productionBible?.recommendation;
  const card = $("#format-recommendation");
  card.hidden = !recommendation;
  if (!recommendation) return;
  const current = project.specification?.format;
  const same = current === recommendation.format;
  const confidence = Number.isFinite(recommendation.confidence)
    ? ` · 置信度 ${Math.round(recommendation.confidence * 100)}%`
    : "";
  $("#format-recommendation-title").textContent = same
    ? `${formats[recommendation.format]} · 与当前选择一致${confidence}`
    : `推荐 ${formats[recommendation.format]} · 当前为 ${formats[current]}${confidence}`;
  $("#format-recommendation-reason").textContent = recommendation.reason;
  $("#apply-format-recommendation").hidden = same;
  $("#apply-format-recommendation").disabled = ["queued", "running"].includes(project.status) ||
    Boolean(project.assets?.episodes?.length);
}

$("#apply-format-recommendation").onclick = async () => {
  const button = $("#apply-format-recommendation");
  button.disabled = true;
  try {
    await api(`/api/projects/${selectedId}/format-recommendation/apply`, {});
    await refreshProject(selectedId);
    notify("已采用 AI 推荐，并按原单集时长重新生成分集方案");
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};

function renderCharacters(box, bible) {
  if (!bible.characters.length) return void (box.textContent = "尚未从故事中识别到人物。");
  for (const character of bible.characters) {
    const article = document.createElement("article");
    article.className = "character-sheet";
    const header = document.createElement("div");
    header.innerHTML = `<span class="asset-state">${character.locked ? "已锁定" : "待定妆"}</span><h3>${escapeHtml(character.name)}</h3><p>${escapeHtml(character.role)} · ${escapeHtml(character.description)}</p>`;
    const views = document.createElement("div");
    views.className = "turnaround";
    const characterImages = [["front", "正面"], ["threeQuarter", "3/4 侧面"], ["side", "侧面"], ["back", "背面"]]
      .filter(([key]) => character.views?.[key])
      .map(([key, label]) => ({ src: character.views[key], title: character.name, label }));
    for (const [key, label] of [["front", "正面"], ["threeQuarter", "3/4 侧面"], ["side", "侧面"], ["back", "背面"]]) {
      const cell = document.createElement("div");
      cell.className = character.views?.[key] ? "ready" : "";
      cell.innerHTML = character.views?.[key] ?
        `<button type="button" class="view-image" aria-label="放大查看${escapeAttribute(character.name)}${label}"><img src="${character.views[key]}" alt="${escapeAttribute(character.name)}${label}"><i>↗</i></button><span>${label}</span>` :
        `<b>＋</b><span>${label}</span><small>待生成</small>`;
      if (character.views?.[key]) {
        const itemIndex = characterImages.findIndex(item => item.label === label);
        cell.querySelector(".view-image").onclick = () => openLightbox(characterImages, itemIndex);
      }
      views.append(cell);
    }
    const form = document.createElement("form");
    form.className = "asset-editor";
    form.innerHTML = `<label>固定外观描述<input name="visualAnchor" value="${escapeAttribute(character.visualAnchor)}"></label><label>默认服装<input name="defaultWardrobe" value="${escapeAttribute(character.defaultWardrobe || "首次定妆服装；剧情未明确要求时保持不变")}"></label><label class="asset-lock"><input name="locked" type="checkbox" ${character.locked ? "checked" : ""}> 锁定人物形象</label><button class="secondary" type="submit">保存角色设定</button><button class="ghost generate-asset" type="button">${character.status === "generating" ? "正在生成…" : character.sheet ? "重新生成四视图" : "生成四视图"}</button>`;
    form.onsubmit = event => saveBible(event, { characterId: character.id });
    form.querySelector(".generate-asset").disabled = character.status === "generating";
    form.querySelector(".generate-asset").onclick = () => generateBibleAsset("character", character.id);
    if (character.error) {
      const error = document.createElement("p"); error.className = "error"; error.textContent = character.error;
      article.append(error);
    }
    article.append(header, views, form);
    box.append(article);
  }
}

function renderSimpleAssets(box, assets, label) {
  if (!assets.length) {
    box.innerHTML = `<div class="asset-empty"><b>暂无${label}</b><p>故事分析未识别出明确资产，可在下一版手动新增。</p></div>`;
    return;
  }
  for (const asset of assets) {
    const article = document.createElement("article");
    article.className = "simple-asset";
    const type = label === "场景" ? "scene" : "prop";
    article.innerHTML = `<div class="asset-thumbnail">${asset.image ? `<button type="button" class="view-image" aria-label="放大查看${escapeAttribute(asset.name)}"><img src="${asset.image}" alt="${escapeAttribute(asset.name)}"><i>↗</i></button>` : `<span>${label === "场景" ? "▦" : "◆"}</span>`}</div><div><span class="asset-state">${asset.status === "ready" ? "已生成" : asset.status === "failed" ? "生成失败" : "待设计"}</span><h3>${escapeHtml(asset.name)}</h3><p>${escapeHtml(asset.category || label)} · ${escapeHtml(asset.description)}</p>${asset.error ? `<p class="error">${escapeHtml(asset.error)}</p>` : ""}</div><button class="ghost generate-simple-asset">${asset.status === "generating" ? "正在生成…" : asset.image ? "重新生成" : "生成概念图"}</button>`;
    if (asset.image) article.querySelector(".view-image").onclick = () =>
      openLightbox([{ src: asset.image, title: asset.name, label: asset.category || label }], 0);
    const generate = article.querySelector(".generate-simple-asset");
    generate.disabled = asset.status === "generating";
    generate.onclick = () => generateBibleAsset(type, asset.id);
    box.append(article);
  }
}

function renderVoices(box, bible) {
  const intro = document.createElement("div");
  intro.className = "voice-policy";
  intro.innerHTML = `<strong>角色音色永久绑定</strong><span>同一角色所有分集复用同一个 speaker 和表演方向。修改音色会创建新绑定版本；未经音色一致性验证的视频模型原声会自动替换为固定配音。</span>`;
  box.append(intro);
  for (const voice of bible.voices) {
    const form = document.createElement("form");
    form.className = "voice-card asset-editor";
    form.innerHTML = `<div><span class="asset-state">${voice.sample ? "样本已生成" : voice.locked ? "已锁定但缺样本" : "待确认"} · 绑定 v${voice.bindingVersion || 1}</span><h3>${escapeHtml(voice.characterName)}</h3>${voice.sample ? `<audio controls preload="none" src="${voice.sample}"></audio>` : ""}</div><label>固定音色<input name="speaker" value="${escapeAttribute(voice.speaker)}"></label><label>固定表演方向<input name="direction" value="${escapeAttribute(voice.direction)}"></label><label class="asset-lock"><input name="locked" type="checkbox" ${voice.locked ? "checked" : ""}> 锁定音色</label><button class="secondary" type="submit">保存音色</button>`;
    form.onsubmit = event => saveBible(event, { voiceId: voice.id });
    box.append(form);
  }
}

function renderContinuity(box, bible) {
  const continuity = bible.continuity;
  const article = document.createElement("article");
  article.className = "continuity-card";
  article.innerHTML = `<div class="continuity-flow"><div><b>上一集尾帧</b><span>人物位置 / 动作 / 光线</span></div><i>→</i><div><b>连续性检查</b><span>角色 / 服装 / 场景 / 道具 / 音色</span></div><i>→</i><div><b>下一集首镜</b><span>动作承接 / 声音预叠</span></div></div>
    <form class="continuity-options">
      ${[["characterIdentity","人物身份"],["wardrobe","服装造型"],["sceneLayout","场景布局"],["props","武器道具"],["colorScript","色彩与光线"],["voiceIdentity","角色音色"],["previousEpisodeContext","相邻集剧情"],["lastFrameBridge","首尾帧桥接"]].map(([key,label]) => `<label><input type="checkbox" name="${key}" ${continuity[key] ? "checked" : ""}>${label}</label>`).join("")}
      <label class="transition-input">衔接策略<input name="transitionStyle" value="${escapeAttribute(continuity.transitionStyle)}"></label>
      <button class="secondary" type="submit">保存连续性策略</button>
    </form>
    <p class="capability-note"><b>当前已生效：</b>每集都会保存人物身份、服装版本、角色音色绑定、场景状态以及武器道具持有人和损耗。未识别到明确剧情变化时，下一集强制继承上一集状态。<br><b>原声保护：</b>视频模型原声只有通过角色音色一致性验证才能保留，否则自动使用固定角色配音。</p>`;
  article.querySelector("form").onsubmit = event => saveContinuity(event);
  box.append(article);
  renderContinuityLedger(box, currentProject?.continuityLedger);
}

function renderContinuityLedger(box, ledger) {
  const section = document.createElement("section");
  section.className = "continuity-ledger";
  const snapshots = ledger?.snapshots || [];
  section.innerHTML = `<div class="continuity-ledger-heading"><div><span class="asset-state">EPISODE STATE LEDGER</span><h3>分集连续性账本</h3></div><small>${snapshots.length ? `已记录 ${snapshots.length} 集` : "生成分集后自动记录"}</small></div>`;
  if (!snapshots.length) {
    section.innerHTML += `<p>尚无分集状态。开始生成后，这里会显示服装、音色、武器道具和场景如何从上一集继承。</p>`;
  } else {
    const rows = document.createElement("div");
    rows.className = "continuity-ledger-rows";
    for (const snapshot of snapshots) {
      const changes = snapshot.changes?.length
        ? snapshot.changes.map(item => `${item.assetName}：${item.reason}`).join("；")
        : "无剧情授权变化，全部继承";
      const row = document.createElement("article");
      row.innerHTML = `<b>第 ${snapshot.episodeNumber} 集</b><span>${escapeHtml(changes)}</span><small>${snapshot.characters.length} 人物 · ${snapshot.voices.length} 音色绑定 · ${snapshot.props.length} 武器/道具</small>`;
      rows.append(row);
    }
    section.append(rows);
  }
  box.append(section);
}

async function saveBible(event, identity) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const body = { ...identity };
  for (const [key, value] of data) body[key] = value;
  body.locked = data.has("locked");
  await updateBible(form, body);
}
async function saveContinuity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const continuity = { transitionStyle: data.get("transitionStyle") };
  for (const key of ["characterIdentity","wardrobe","sceneLayout","props","colorScript","voiceIdentity","previousEpisodeContext","lastFrameBridge"]) continuity[key] = data.has(key);
  await updateBible(form, { continuity });
}
async function updateBible(form, body) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api(`/api/projects/${selectedId}/production-bible`, body);
    await refreshProject(selectedId);
    notify("制片资产已保存，后续分集将复用这套设定");
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}
$("#analyze-bible").onclick = async () => {
  const button = $("#analyze-bible");
  button.disabled = true;
  button.textContent = "AI 正在分析小说…";
  try {
    await api(`/api/projects/${selectedId}/production-bible/analyze`, {});
    await refreshProject(selectedId);
    notify("制片圣经分析完成，请确认人物、场景和道具");
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
$("#prepare-assets").onclick = async () => {
  const button = $("#prepare-assets");
  button.disabled = true;
  button.textContent = "正在准备制片资产…";
  notify("正在分析并生成所有人物、场景、武器道具与角色音色样本；全部验收后才允许开拍");
  const projectId = selectedId;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (selectedId === projectId) {
      refreshProject(projectId).catch(error => notify(error.message));
    }
  }, 350);
  try {
    await api(`/api/projects/${projectId}/production-assets/prepare`, {});
    if (selectedId === projectId) await refreshProject(projectId);
    notify("制片资产包已全部生成并通过验收，现在可以生成分集视频");
  } catch (error) {
    if (selectedId === projectId) await refreshProject(projectId).catch(() => {});
    notify(error.message);
  } finally {
    button.disabled = false;
  }
};
async function generateBibleAsset(type, id) {
  notify("图像模型正在生成资产，通常需要 20–60 秒");
  try {
    await api(`/api/projects/${selectedId}/production-bible/${type}/${id}/generate`, {});
    await refreshProject(selectedId);
    notify("资产生成成功并已保存到项目");
  } catch (error) {
    await refreshProject(selectedId).catch(() => {});
    notify(error.message);
  }
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}
function escapeAttribute(value) { return escapeHtml(value); }

function openLightbox(items, index = 0) {
  lightboxItems = items.filter(item => item?.src);
  if (!lightboxItems.length) return;
  lightboxIndex = Math.max(0, Math.min(index, lightboxItems.length - 1));
  renderLightbox();
  $("#image-lightbox").hidden = false;
  document.body.classList.add("lightbox-open");
  $("#lightbox-close").focus();
}
function renderLightbox() {
  const item = lightboxItems[lightboxIndex];
  $("#lightbox-image").src = item.src;
  $("#lightbox-image").alt = `${item.title} ${item.label}`;
  $("#lightbox-title").textContent = item.title;
  $("#lightbox-meta").textContent = `${item.label} · ${lightboxIndex + 1} / ${lightboxItems.length}`;
  $("#lightbox-prev").hidden = lightboxItems.length < 2;
  $("#lightbox-next").hidden = lightboxItems.length < 2;
}
function closeLightbox() {
  $("#image-lightbox").hidden = true;
  $("#lightbox-image").removeAttribute("src");
  document.body.classList.remove("lightbox-open");
}
function moveLightbox(step) {
  lightboxIndex = (lightboxIndex + step + lightboxItems.length) % lightboxItems.length;
  renderLightbox();
}
$("#lightbox-close").addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  closeLightbox();
});
$("#lightbox-prev").onclick = () => moveLightbox(-1);
$("#lightbox-next").onclick = () => moveLightbox(1);
$("#image-lightbox").onclick = event => { if (event.target === $("#image-lightbox")) closeLightbox(); };
document.addEventListener("keydown", event => {
  if ($("#image-lightbox").hidden) return;
  if (event.key === "Escape") closeLightbox();
  else if (event.key === "ArrowLeft") moveLightbox(-1);
  else if (event.key === "ArrowRight") moveLightbox(1);
});

const episodeStatusLabels = {
  not_started: "未生成", queued: "排队中", running: "生成中", completed: "已完成",
  failed: "需要处理", stale: "已过期",
};
function episodeStates(project) {
  const assets = new Map((project.assets?.episodes || []).map(item => [item.number, item]));
  const states = new Map((project.episodeStates || []).map(item => [item.number, item]));
  return (project.seriesPlan?.episodes || []).map(episode => {
    const asset = assets.get(episode.number);
    return {
      number: episode.number, title: episode.title, summary: episode.summary,
      status: asset ? "completed" : "not_started",
      stage: asset ? "已完成" : "未生成", progress: asset ? 100 : 0,
      error: null, duration: asset?.duration, assets: asset,
      ...states.get(episode.number),
    };
  });
}
function renderEpisodeBoard(project) {
  const board = $("#episode-board");
  const grid = $("#episode-grid");
  const states = episodeStates(project);
  $("#delivery-package").hidden = !(
    project.assembly?.status === "completed" &&
    (project.assets?.episodes || []).length === project.seriesPlan?.episodeCount
  );
  board.hidden = !states.length;
  grid.replaceChildren();
  if (!states.length) return;
  const completed = states.filter(item => item.status === "completed").length;
  const active = states.filter(item => ["queued", "running"].includes(item.status)).length;
  const failed = states.filter(item => item.status === "failed").length;
  $("#episode-board-stats").innerHTML =
    `<span><b>${completed}</b>完成</span><span><b>${active}</b>进行中</span><span><b>${failed}</b>需处理</span><span><b>${states.length}</b>总集数</span>`;
  const consecutive = states.findIndex(item => item.status !== "completed");
  const completedFromStart = consecutive === -1 ? states.length : consecutive;
  $("#assemble-series").disabled = completedFromStart < 2 || project.assembly?.status === "running";
  $("#assembly-status").textContent = project.assembly?.status === "completed" ?
    `已合并前 ${project.assembly.episodeCount} 集 · ${project.assembly.duration} 秒` :
    project.assembly?.status === "failed" ? project.assembly.error :
    completedFromStart >= 2 ? `可合并第 1–${completedFromStart} 集为连续预览` : "完成至少两集后，可以合并连续预览。";
  $("#play-series").hidden = project.assembly?.status !== "completed";
  for (const episode of states) {
    const card = document.createElement("article");
    card.className = `episode-card ${episode.status}`;
    card.classList.toggle("selected", episode.number === selectedEpisodeNumber);
    const detail = document.createElement("button");
    detail.type = "button";
    detail.className = "episode-card-main";
    detail.setAttribute("aria-label", `查看第 ${episode.number} 集详情`);
    const index = document.createElement("strong");
    index.textContent = `第 ${episode.number} 集`;
    const stage = document.createElement("small");
    stage.textContent = episode.stage || episodeStatusLabels[episode.status];
    const progress = document.createElement("i");
    progress.style.width = `${episode.progress || 0}%`;
    detail.append(index, stage);
    detail.onclick = () => openEpisodePanel(project, episode.number);
    card.append(detail);
    if (episode.status === "completed" && episode.assets?.video) {
      const play = document.createElement("button");
      play.type = "button";
      play.className = "episode-card-play";
      play.innerHTML = "<span>▶</span> 播放";
      play.setAttribute("aria-label", `播放第 ${episode.number} 集`);
      play.onclick = event => {
        event.stopPropagation();
        selectedEpisodeNumber = episode.number;
        playEpisode(episode);
        renderEpisodeBoard(project);
      };
      card.append(play);
    }
    card.append(progress);
    grid.append(card);
  }
  if (selectedEpisodeNumber) {
    const selected = states.find(item => item.number === selectedEpisodeNumber);
    if (selected) fillEpisodePanel(project, selected);
  }
}

function selectedReaderEpisode(project) {
  const episodes = project.seriesPlan?.episodes || [];
  if (!episodes.length) return null;
  return episodes.find(item => item.number === selectedEpisodeNumber) || episodes[0];
}

function renderEpisodeReader(project) {
  const reader = $("#episode-reader");
  const episodes = project.seriesPlan?.episodes || [];
  const hasSources = Boolean(project.seriesPlan?.sourceDocument?.text) &&
    episodes.some(episode => Number.isInteger(episode.source?.startOffset));
  reader.hidden = !hasSources;
  if (!hasSources) return;
  const selected = selectedReaderEpisode(project);
  if (!selectedEpisodeNumber) selectedEpisodeNumber = selected.number;
  const states = new Map(episodeStates(project).map(item => [item.number, item]));
  const nav = $("#episode-reader-nav");
  nav.replaceChildren();
  for (const episode of episodes) {
    const state = states.get(episode.number);
    const button = document.createElement("button");
    button.type = "button";
    button.className = episode.number === selectedEpisodeNumber ? "selected" : "";
    button.innerHTML = `<b>${String(episode.number).padStart(2, "0")}</b><span><strong>${escapeHtml(episode.title)}</strong><small>${escapeHtml(episode.source?.chapterStart || "正文")} · ${episode.source?.characterCount || 0} 字</small></span><i>${escapeHtml(episodeStatusLabels[state?.status] || "未生成")}</i>`;
    button.onclick = () => {
      selectedEpisodeNumber = episode.number;
      renderEpisodeReader(project);
      renderEpisodeBoard(project);
    };
    nav.append(button);
  }
  const source = selected.source || {};
  const state = states.get(selected.number) || {};
  const coverage = project.seriesPlan.sourceCoverage;
  $("#episode-source-coverage").textContent = coverage ?
    `原文覆盖 ${Math.round((coverage.ratio || 0) * 100)}% · 无遗漏 · 无重复` : "覆盖率待分析";
  $("#episode-source-index").textContent = `EP${String(selected.number).padStart(2, "0")}`;
  $("#episode-source-title").textContent = selected.title;
  $("#episode-source-range").textContent = [
    source.chapterStart && source.chapterEnd && source.chapterStart !== source.chapterEnd ?
      `${source.chapterStart} → ${source.chapterEnd}` : source.chapterStart,
    `${source.characterCount || 0} 字`,
    source.startParagraphId && source.endParagraphId ?
      `${source.startParagraphId} – ${source.endParagraphId}` : null,
  ].filter(Boolean).join(" · ");
  const text = $("#episode-source-text");
  text.replaceChildren();
  const sourceText = project.seriesPlan?.sourceDocument?.text || "";
  const episodeText = sourceText.slice(source.startOffset || 0, source.endOffset || 0) ||
    source.excerpt || source.preview || "本集尚未关联原文。";
  for (const paragraph of String(episodeText).split(/\n{2,}/)) {
    const copy = document.createElement("p");
    copy.textContent = paragraph;
    text.append(copy);
  }
  $("#episode-adaptation-title").textContent = selected.title;
  $("#episode-adaptation-summary").textContent = selected.summary || "等待生成改编摘要";
  const facts = $("#episode-adaptation-facts");
  facts.replaceChildren();
  for (const [label, value] of [
    ["预计时长", formatDuration(selected.estimatedDurationSeconds || project.specification?.episodeDurationSeconds)],
    ["制作状态", state.stage || episodeStatusLabels[state.status] || "未生成"],
    ["结尾悬念", selected.cliffhanger || selected.hook || "待补充"],
    ["原文占比", `${Math.round((source.coverageRatio || 0) * 100)}%`],
  ]) {
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.textContent = value;
    facts.append(term, detail);
  }
  const beats = $("#episode-story-beats");
  beats.replaceChildren();
  for (const beat of selected.storyBeats || []) {
    const item = document.createElement("span");
    item.textContent = typeof beat === "string" ? beat : beat.text;
    beats.append(item);
  }
  const index = episodes.findIndex(item => item.number === selected.number);
  $("#episode-reader-position").textContent = `第 ${index + 1} / ${episodes.length} 集`;
  $("#episode-reader-prev").disabled = index <= 0;
  $("#episode-reader-next").disabled = index >= episodes.length - 1;
  $("#episode-reader-prev").onclick = () => selectReaderEpisode(project, episodes[index - 1]?.number);
  $("#episode-reader-next").onclick = () => selectReaderEpisode(project, episodes[index + 1]?.number);
  $("#episode-reader-detail").onclick = () => openEpisodePanel(project, selected.number);
  applyEpisodeReaderMode();
}

function selectReaderEpisode(project, number) {
  if (!number) return;
  selectedEpisodeNumber = number;
  renderEpisodeReader(project);
  renderEpisodeBoard(project);
}

function applyEpisodeReaderMode() {
  const reader = $("#episode-reader");
  if (!reader) return;
  reader.dataset.mode = $("#episode-reader-mode").value;
}

$("#episode-reader-mode").onchange = applyEpisodeReaderMode;
document.addEventListener("keydown", event => {
  if (!currentProject || $("#episode-reader").hidden || !$("#image-lightbox").hidden ||
      !$("#agent-drawer").hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (event.key === "ArrowLeft") $("#episode-reader-prev").click();
  if (event.key === "ArrowRight") $("#episode-reader-next").click();
});

$("#assemble-series").onclick = async () => {
  const button = $("#assemble-series");
  button.disabled = true;
  try {
    await api(`/api/projects/${selectedId}/assemble`, {});
    await refreshProject(selectedId);
    notify("连续全集合成完成");
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
$("#play-series").onclick = () => {
  if (!currentProject?.assembly?.video) return;
  $("#player").src = currentProject.assembly.video;
  $("#player").hidden = false;
  $("#screen-empty").hidden = true;
  $("#player-actions").hidden = false;
  $("#playing-label").textContent = `连续全集 · 前 ${currentProject.assembly.episodeCount} 集`;
  $("#playing-label").dataset.manual = "true";
  $("#player").play().catch(() => {});
  $("#export").hidden = false;
  $("#export").onclick = () => exportAsset("series-complete.mp4");
};
function playEpisode(episode) {
  if (!episode.assets?.video) return;
  const player = $("#player");
  player.src = episode.assets.video;
  player.hidden = false;
  $("#screen-empty").hidden = true;
  $("#player-actions").hidden = false;
  $("#playing-label").textContent = `第 ${episode.number} 集 · ${episode.title}`;
  $("#playing-label").dataset.manual = "true";
  $("#export").hidden = false;
  $("#export").onclick = () => exportAsset(`episode-${String(episode.number).padStart(2, "0")}.mp4`);
  player.scrollIntoView({ behavior: "smooth", block: "center" });
  player.play().catch(() => {});
}

function enterAppFullscreen() {
  $("#screen").classList.add("app-fullscreen");
  $("#exit-fullscreen-player").hidden = false;
  document.body.classList.add("video-fullscreen-open");
}
function exitAppFullscreen() {
  $("#screen").classList.remove("app-fullscreen");
  $("#exit-fullscreen-player").hidden = true;
  document.body.classList.remove("video-fullscreen-open");
}
function enterPlayerFullscreen() {
  enterAppFullscreen();
}
async function exitPlayerFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen().catch(() => {});
  }
  exitAppFullscreen();
}
$("#fullscreen-player").onclick = enterPlayerFullscreen;
$("#exit-fullscreen-player").onclick = exitPlayerFullscreen;
$("#player").ondblclick = () => {
  if (document.fullscreenElement || $("#screen").classList.contains("app-fullscreen")) {
    exitPlayerFullscreen();
  } else {
    enterPlayerFullscreen();
  }
};
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  $("#exit-fullscreen-player").hidden = !active;
  document.body.classList.toggle("video-fullscreen-open", active);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("#screen").classList.contains("app-fullscreen")) {
    exitPlayerFullscreen();
  }
});
function openEpisodePanel(project, number) {
  selectedEpisodeNumber = number;
  renderEpisodeBoard(project);
  $("#episode-panel").hidden = false;
}
function fillEpisodePanel(project, episode) {
  const completed = episode.status === "completed" && episode.assets?.video;
  $("#episode-panel-index").textContent = `EP${String(episode.number).padStart(2, "0")}`;
  $("#episode-panel-title").textContent = episode.title;
  $("#episode-panel-summary").textContent = episode.summary;
  $("#episode-panel-status").textContent = episode.stage || episodeStatusLabels[episode.status];
  $("#episode-panel-duration").textContent = episode.duration ? `${episode.duration} 秒` :
    `目标 ${project.specification?.episodeDurationSeconds || "-"} 秒`;
  $("#episode-panel-progress").value = episode.progress || 0;
  $("#episode-panel-error").hidden = !episode.error;
  $("#episode-panel-error").textContent = episode.error || "";
  renderSeedanceInputs(episode.assets?.videoGeneration);
  renderEpisodeQuality(episode.assets?.qualityReport);
  renderEpisodeContinuityEditor(project, episode);
  $("#episode-play").hidden = !completed;
  $("#episode-revalidate").hidden = !completed;
  $("#episode-generate").hidden = ["queued", "running"].includes(episode.status);
  $("#episode-generate").textContent = episode.status === "completed" ? "重新生成本集" :
    episode.status === "failed" ? "修复并重试本集" : "生成本集";
  $("#episode-play").onclick = () => {
    playEpisode(episode);
  };
  $("#episode-revalidate").onclick = () => revalidateEpisode(episode.number);
  $("#episode-generate").onclick = () => generateEpisode(episode.number);
  const technical = episode.assets || episode.remoteTaskId;
  $("#episode-panel-technical").hidden = !technical;
  $("#episode-panel-data").textContent = JSON.stringify(episode.assets || {
    remoteTaskId: episode.remoteTaskId,
  }, null, 2);
}

async function revalidateEpisode(number) {
  const button = $("#episode-revalidate");
  button.disabled = true;
  button.textContent = "正在重新验收…";
  notify(`正在重新验收第 ${number} 集现有成片；不会重新生成视频或产生视频费用`);
  try {
    const result = await api(
      `/api/projects/${selectedId}/episodes/${number}/revalidate`, {},
    );
    await refreshProject(selectedId);
    notify(result.qualityReport?.status === "passed"
      ? `第 ${number} 集重新验收通过`
      : `第 ${number} 集未通过质量门禁，请查看报告并单集修复`);
  } catch (error) {
    notify(`重新验收失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "重新验收成片";
  }
}

function renderEpisodeQuality(report) {
  const section = $("#episode-quality");
  section.hidden = !report;
  if (!report) return;
  $("#episode-quality-status").textContent = report.status === "passed"
    ? "本集质量门禁通过" : "本集质量门禁未通过";
  const labels = {
    video_stream: "视频流", audio_stream: "音频流", positive_duration: "有效时长",
    resolution: "分辨率", target_duration: "目标时长", black_frames: "黑帧",
    frozen_frames: "冻结帧", integrated_loudness: "综合响度", true_peak: "真峰值",
    speech_content_consistency: "语音与字幕", visual_asset_consistency: "人物 / 服装 / 道具一致性",
  };
  const checks = $("#episode-quality-checks");
  checks.replaceChildren();
  for (const check of report.checks || []) {
    const row = document.createElement("div");
    row.className = check.passed ? "passed" : check.required ? "failed" : "warning";
    const value = check.value == null ? "未验证" :
      typeof check.value === "number" ? Number(check.value.toFixed(3)) : check.value;
    row.innerHTML = `<i>${check.passed ? "✓" : check.required ? "×" : "!"}</i><span><b>${escapeHtml(labels[check.id] || check.id)}</b><small>${escapeHtml(String(value))}${check.expected ? ` · 目标 ${escapeHtml(String(check.expected))}` : ""}</small></span>`;
    checks.append(row);
  }
}

function renderSeedanceInputs(generation) {
  const section = $("#episode-seedance-inputs");
  const audit = generation?.referenceInputs;
  section.hidden = !generation;
  if (!generation) return;
  const modes = { text: "纯文本生成", reference: "全模态参考生成", extend: "承接上一集续写" };
  $("#episode-seedance-mode").textContent = modes[generation.taskType] || "视频生成";
  const tags = $("#episode-seedance-tags");
  tags.replaceChildren();
  const values = [
    [`人物参考图 ${audit?.images?.length || 0} 张`, Boolean(audit?.images?.length)],
    [audit?.audio ? `固定音色 ${audit.audio.voiceBindings?.[0]?.speaker || "已传入"}` : "未传角色音频", Boolean(audit?.audio)],
    [audit?.video ? `承接第 ${audit.video.episodeNumber} 集视频` : "首集无前序视频", Boolean(audit?.video)],
    [generation.lastFrameUrl ? "已返回尾帧" : "未返回尾帧", Boolean(generation.lastFrameUrl)],
  ];
  for (const [text, ready] of values) {
    const tag = document.createElement("span");
    tag.className = ready ? "ready" : "muted";
    tag.textContent = text;
    tags.append(tag);
  }
}

function renderEpisodeContinuityEditor(project, episode) {
  const form = $("#episode-continuity-form");
  const fields = $("#episode-continuity-fields");
  const snapshot = project.continuityLedger?.snapshots?.find(item => item.episodeNumber === episode.number);
  fields.replaceChildren();
  $("#episode-continuity").hidden = !snapshot;
  if (!snapshot) return;
  const locked = episode.status === "completed" || ["queued", "running"].includes(project.status);
  const summary = document.createElement("div");
  summary.className = "continuity-episode-summary";
  summary.innerHTML = `<strong>${snapshot.changes.length ? `${snapshot.changes.length} 项状态变化` : "全部继承上一集"}</strong><span>角色音色固定绑定，不允许在单集内修改。</span>`;
  fields.append(summary);
  for (const character of snapshot.characters) {
    const row = document.createElement("fieldset");
    row.dataset.characterId = character.characterId;
    row.innerHTML = `<legend>${escapeHtml(character.name)} · 服装 v${character.wardrobeVersion}</legend>
      <label>本集服装<input name="wardrobe" value="${escapeAttribute(character.wardrobe)}" ${locked ? "disabled" : ""}></label>
      <label>变化原因<input name="wardrobeReason" placeholder="不变则留空；换装时填写剧情原因" ${locked ? "disabled" : ""}></label>`;
    fields.append(row);
  }
  for (const prop of snapshot.props) {
    const row = document.createElement("fieldset");
    row.dataset.propId = prop.propId;
    row.innerHTML = `<legend>${escapeHtml(prop.name)} · 状态 v${prop.stateVersion}</legend>
      <label>当前持有人<input name="holder" value="${escapeAttribute(prop.holder || "")}" ${locked ? "disabled" : ""}></label>
      <label>状态 / 损耗<input name="condition" value="${escapeAttribute(prop.condition)}" ${locked ? "disabled" : ""}></label>
      <label>变化原因<input name="propReason" placeholder="不变则留空；转移或损坏时填写" ${locked ? "disabled" : ""}></label>`;
    fields.append(row);
  }
  form.elements.note.value = snapshot.review?.note || "";
  form.elements.note.disabled = locked;
  form.querySelector("button").hidden = locked;
  form.onsubmit = event => saveEpisodeContinuity(event, episode.number);
}

async function saveEpisodeContinuity(event, episodeNumber) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const characters = [...form.querySelectorAll("[data-character-id]")].map(row => ({
    characterId: row.dataset.characterId,
    wardrobe: row.querySelector("[name=wardrobe]").value,
    reason: row.querySelector("[name=wardrobeReason]").value,
  })).filter(item => item.reason.trim());
  const props = [...form.querySelectorAll("[data-prop-id]")].map(row => ({
    propId: row.dataset.propId,
    holder: row.querySelector("[name=holder]").value,
    condition: row.querySelector("[name=condition]").value,
    reason: row.querySelector("[name=propReason]").value,
  })).filter(item => item.reason.trim());
  try {
    await api(`/api/projects/${selectedId}/episodes/${episodeNumber}/continuity`, {
      characters, props, note: form.elements.note.value,
    });
    await refreshProject(selectedId);
    notify(`第 ${episodeNumber} 集连续性状态已确认，后续分集会自动继承`);
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}
async function generateEpisode(number) {
  const button = $("#episode-generate");
  button.disabled = true;
  try {
    if (!currentProject?.productionAssetReadiness?.ready) {
      button.textContent = "先生成制片资产…";
      notify("本集开拍前正在自动补齐人物、场景、武器道具和固定音色");
      await api(`/api/projects/${selectedId}/production-assets/prepare`, {});
      await refreshProject(selectedId);
    }
    await api(`/api/projects/${selectedId}/episodes/${number}/generate`, {});
    notify(`第 ${number} 集已加入生成队列`);
    await refreshProject(selectedId);
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; button.textContent = "生成本集"; }
}
$("#episode-panel-close").onclick = () => {
  selectedEpisodeNumber = null;
  $("#episode-panel").hidden = true;
  if (currentProject) renderEpisodeBoard(currentProject);
};
source("manual");
if (location.hash === "#settings") {
  view("settings");
  loadSettings();
  loadModelStatus();
}

function renderSeriesPlan(project) {
  const plan = project.seriesPlan;
  $("#series-plan").hidden = !plan;
  if (!plan) return;
  $("#series-title").textContent = plan.summary || "等待正文分析";
  $("#series-basis").textContent = plan.basis || "读取正文后生成拆分依据";
  $("#series-count").textContent = plan.episodeCount ? `${plan.episodeCount}` : "待分析";
  $("#series-duration").textContent = plan.totalDurationText || "待分析";
  $("#series-per-episode").textContent = plan.episodeDurationText || formatDuration(plan.episodeDurationSeconds);
  const box = $("#episode-preview");
  box.replaceChildren();
  const episodes = plan.episodes?.slice(0, 3) || [];
  for (const episode of episodes) {
    const article = document.createElement("article");
    const index = document.createElement("b");
    index.textContent = `EP${String(episode.number).padStart(2, "0")}`;
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = episode.title;
    const summary = document.createElement("small");
    summary.textContent = episode.summary;
    body.append(title, summary);
    article.append(index, body);
    box.append(article);
  }
  if (plan.episodeCount && plan.episodeCount > 3) {
    const more = document.createElement("article");
    more.innerHTML = `<b>…</b><div><strong>后续 ${plan.episodeCount - 3} 集</strong><small>完整分集大纲将在 AI 编剧接入后展开。</small></div>`;
    box.append(more);
  }
}

function updateDurationOptions() {
  const select = $("#episode-duration");
  const values = format === "film"
    ? [[3600, "约 60 分钟"], [5400, "约 90 分钟"], [7200, "约 120 分钟"]]
    : format === "drama"
      ? [[300, "约 5 分钟"], [600, "约 10 分钟"], [1200, "约 20 分钟"], [2400, "约 40 分钟"]]
      : [[60, "约 1 分钟"], [90, "约 1.5 分钟"], [120, "约 2 分钟"], [180, "约 3 分钟"], [300, "约 5 分钟"], [600, "约 10 分钟"]];
  const options = values.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = label;
    if ((format === "film" && value === 5400) || (format === "drama" && value === 1200) ||
        (!["film", "drama"].includes(format) && value === 90)) option.selected = true;
    return option;
  });
  const custom = document.createElement("option");
  custom.value = "custom"; custom.textContent = "自定义…";
  select.replaceChildren(...options, custom);
  updateCustomDuration();
  $("#duration-label").childNodes[0].textContent = format === "film" ? "目标片长 " : "每集时长 ";
}
function formatDuration(seconds) {
  if (!seconds) return "时长待定";
  return seconds >= 3600 ? `目标片长 ${seconds / 60} 分钟` :
    `单集约 ${seconds >= 60 ? `${seconds / 60} 分钟` : `${seconds} 秒`}`;
}

function resultDescription(project) {
  const seconds = project.duration || 0;
  if (project.outputKind === "real_video_sample") return `已生成 ${seconds} 秒真实视频样片，可播放和导出。`;
  return `已生成 ${seconds} 秒流程自检片：它只验证旁白、字幕和 MP4 封装，不代表最终视频质量。`;
}

function readableFailure(project) {
  const message = project.error || "";
  if (/moov atom not found|Invalid data found when processing input|Error opening input file/.test(message)) {
    return "视频模型返回的文件不是可播放 MP4，无法合成旁白。请检查兜底视频模型是否真正返回 video/mp4。";
  }
  if (/ffmpeg 退出码/.test(message)) return "视频合成失败。展开“技术错误日志”查看底层 ffmpeg 输出。";
  return message;
}

function closeAgentDrawer() {
  const drawer = $("#agent-drawer");
  const launcher = $("#agent-launcher");
  if (!drawer || !launcher) return;
  drawer.hidden = true;
  launcher.setAttribute("aria-expanded", "false");
}

function openAgentDrawer() {
  if (!selectedId) return;
  $("#agent-drawer").hidden = false;
  $("#agent-launcher").setAttribute("aria-expanded", "true");
  updateAgentComposer();
  $("#agent-input").focus();
}

function updateAgentComposer(temporaryBusy = false) {
  const projectBusy = ["queued", "running"].includes(currentProject?.status);
  const agentBusy = currentAgentSession?.status === "running";
  const busy = temporaryBusy || projectBusy || agentBusy;
  const input = $("#agent-input");
  const button = $("#agent-send");
  const status = $("#agent-input-status");
  input.disabled = busy;
  button.disabled = busy;
  if (projectBusy || agentBusy) {
    status.hidden = false;
    status.textContent = agentBusy
      ? "导演 Agent 正在执行并验证当前修改，完成后可继续发送。"
      : "作品正在生成。完成后可通过导演 Agent 修改，避免任务互相覆盖。";
    button.textContent = agentBusy ? "修改执行中…" : "作品生成中…";
  } else {
    status.hidden = true;
    status.textContent = "";
    button.textContent = temporaryBusy ? "正在读取作品并制定计划…" : "制定修改计划 →";
  }
}

function appendAgentMessage(role, content) {
  const article = document.createElement("article");
  article.className = `agent-message ${role}`;
  const title = document.createElement("b");
  title.textContent = role === "user" ? "你" : "导演 Agent";
  const copy = document.createElement("p");
  copy.textContent = content;
  article.append(title, copy);
  $("#agent-messages").append(article);
  $("#agent-messages").scrollTop = $("#agent-messages").scrollHeight;
  return article;
}

function appendAgentStatus(content, steps = []) {
  const article = appendAgentMessage("assistant pending", content);
  if (steps.length) {
    const list = document.createElement("div");
    list.className = "agent-status-steps";
    for (const step of steps) {
      const item = document.createElement("span");
      item.textContent = step;
      list.append(item);
    }
    article.append(list);
  }
  return article;
}

function resolveAgentStatus(article, content, failed = false) {
  if (!article) return;
  article.classList.remove("pending");
  article.classList.toggle("failed", failed);
  const paragraph = article.querySelector("p");
  if (paragraph) paragraph.textContent = content;
}

const agentToolNames = {
  get_project_state: "检查作品状态",
  update_character: "修改人物设定",
  update_voice: "修改固定音色",
  update_continuity_policy: "修改连续性规则",
  update_episode: "修改分集剧情",
  update_episode_continuity: "修改本集服装/道具",
  prepare_production_assets: "生成制片资产",
  regenerate_episode: "重新生成分集",
  assemble_series: "重新合并全集",
  apply_format_recommendation: "采用成片类型推荐",
};

function renderAgentSession(session) {
  currentAgentSession = session;
  if (session.status !== "running") clearTimeout(agentPollTimer);
  let article = document.querySelector(`[data-agent-session="${session.id}"]`);
  if (article) article.replaceChildren();
  else {
    article = document.createElement("article");
    article.className = "agent-message assistant";
    article.dataset.agentSession = session.id;
    $("#agent-messages").append(article);
  }
  const messageTitle = document.createElement("b");
  messageTitle.textContent = "导演 Agent";
  const messageCopy = document.createElement("p");
  messageCopy.textContent = session.reply || "修改计划已生成。";
  article.append(messageTitle, messageCopy);
  const plan = document.createElement("div");
  plan.className = "agent-plan";
  for (const action of session.plan?.actions || []) {
    const approval = session.plan.approvals?.find(item => item.actionId === action.id) || {};
    const card = document.createElement("div");
    card.className = "agent-action";
    const title = document.createElement("strong");
    title.textContent = agentToolNames[action.tool] || action.tool;
    const reason = document.createElement("span");
    reason.textContent = action.reason || "按导演要求修改";
    card.append(title, reason);
    if (approval.required) {
      const risk = document.createElement("div");
      risk.className = "agent-risk";
      if (approval.billable) {
        const tag = document.createElement("i"); tag.textContent = "可能产生费用"; risk.append(tag);
      }
      if (approval.destructive) {
        const tag = document.createElement("i"); tag.textContent = "会使已有成片失效/覆盖"; risk.append(tag);
      }
      const detail = document.createElement("small");
      detail.textContent = approval.reason;
      card.append(risk, detail);
    }
    plan.append(card);
  }
  if (session.status === "needs_approval") {
    const actions = document.createElement("div");
    actions.className = "agent-plan-actions";
    const approve = document.createElement("button");
    approve.className = "primary";
    approve.textContent = "确认执行";
    approve.onclick = () => decideAgentPlan("approve", approve, session);
    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.textContent = "取消";
    cancel.onclick = () => decideAgentPlan("cancel", cancel, session);
    actions.append(approve, cancel);
    plan.append(actions);
  }
  if (session.toolCalls?.length) {
    const details = document.createElement("details");
    details.className = "agent-trace";
    const summary = document.createElement("summary");
    const completed = session.toolCalls.filter(item => item.status === "completed").length;
    const submitted = session.toolCalls.filter(item => item.status === "submitted").length;
    summary.textContent = `执行明细 · ${completed}/${session.toolCalls.length} 已完成` +
      (submitted ? ` · ${submitted} 项生成中` : "");
    const pre = document.createElement("pre");
    pre.textContent = session.toolCalls.map(item =>
      `${item.status === "completed" ? "✓" : item.status === "submitted" ? "◌" : "×"} ${agentToolNames[item.tool] || item.tool}` +
      `${item.status === "submitted" ? ` · ${item.verification?.episodeStage || "已提交"} ${item.verification?.episodeProgress || 0}%` : ""}` +
      `${item.error ? `\n  ${item.error}` : ""}`).join("\n");
    details.append(summary, pre);
    plan.append(details);
  }
  article.append(plan);
  $("#agent-messages").scrollTop = $("#agent-messages").scrollHeight;
  updateAgentComposer();
  if (session.status === "running") scheduleAgentPoll(session);
}

function scheduleAgentPoll(session) {
  clearTimeout(agentPollTimer);
  const projectId = selectedId;
  agentPollTimer = setTimeout(async () => {
    if (!projectId || selectedId !== projectId || currentAgentSession?.id !== session.id) return;
    try {
      const result = await api(`/api/projects/${projectId}/agent/sessions/${session.id}`);
      if (selectedId !== projectId) return;
      renderAgentSession(result.session);
      await refreshProject(projectId);
      if (result.session.status === "completed") notify("导演 Agent 修改和新成片均已完成");
      else if (result.session.status === "failed") notify(result.session.reply || "导演 Agent 执行失败");
    } catch (error) {
      appendAgentMessage("assistant", `进度读取失败：${error.message}`);
      if (selectedId === projectId && currentAgentSession?.id === session.id &&
          currentAgentSession.status === "running") {
        scheduleAgentPoll(session);
      }
    }
  }, 1800);
}

async function decideAgentPlan(decision, button, session) {
  const buttons = button.parentElement.querySelectorAll("button");
  buttons.forEach(item => { item.disabled = true; });
  const waiting = appendAgentStatus(decision === "approve"
    ? "已确认修改计划，正在执行并回读验证作品状态…"
    : "正在取消这次修改计划…",
  decision === "approve" ? ["执行受控工具", "刷新作品状态", "验证结果"] : ["取消计划"]);
  try {
    const payload = decision === "approve" ? { approvalToken: session.approvalToken } : {};
    const result = await api(
      `/api/projects/${selectedId}/agent/sessions/${session.id}/${decision}`, payload,
    );
    resolveAgentStatus(waiting, decision === "approve"
      ? result.session.status === "running"
        ? "修改已应用，视频任务正在生成；这里会持续更新真实进度。"
        : "执行返回，正在展示结果。"
      : "计划已取消。");
    renderAgentSession(result.session);
    if (decision === "approve") {
      await refreshProject(selectedId);
      notify(result.session.status === "completed"
        ? "导演 Agent 已执行并验证修改"
        : result.session.status === "running"
          ? "修改已应用，视频正在重新生成"
          : result.session.reply);
    } else {
      notify("修改计划已取消，作品未改变");
    }
  } catch (error) {
    resolveAgentStatus(waiting, `执行没有完成：${error.message}`, true);
    notify(error.message);
    buttons.forEach(item => { item.disabled = false; });
  }
}

$("#agent-launcher").onclick = openAgentDrawer;
$("#agent-close").onclick = closeAgentDrawer;
document.querySelectorAll(".agent-suggestions button").forEach(button => {
  button.onclick = () => {
    $("#agent-input").value = button.textContent.trim();
    $("#agent-input").focus();
  };
});
$("#agent-form").onsubmit = async event => {
  event.preventDefault();
  const message = $("#agent-input").value.trim();
  if (!message || !selectedId) return;
  const button = $("#agent-send");
  appendAgentMessage("user", message);
  const waiting = appendAgentStatus("已接收你的修改要求，正在读取作品并制定计划…", [
    "读取分集状态", "检查人物/音色/连续性", "判断是否需要确认",
  ]);
  $("#agent-input").value = "";
  updateAgentComposer(true);
  try {
    const result = await api(`/api/projects/${selectedId}/agent/messages`, { message });
    resolveAgentStatus(waiting, result.session.status === "needs_approval"
      ? "计划已生成，等待你确认后执行。"
      : "计划已执行，正在展示验证结果。");
    renderAgentSession(result.session);
    if (result.session.status === "completed") await refreshProject(selectedId);
  } catch (error) {
    resolveAgentStatus(waiting, `没有执行任何修改：${error.message}`, true);
    appendAgentMessage("assistant", `没有执行任何修改：${error.message}`);
  } finally {
    updateAgentComposer();
  }
};

async function loadSettings() {
  const box = $("#settings-fields");
  box.replaceChildren();
  if (!window.desktop?.getSettings) {
    box.textContent = "设置中心仅在桌面应用中可用。Web 调试模式请继续使用 .env.local。";
    return;
  }
  try {
    const settings = await window.desktop.getSettings();
    $("#settings-path").textContent = settings.configPath;
    const billable = settings.fields.find(field => field.key === "ALLOW_BILLABLE_GENERATION");
    if (billable) box.append(renderBillableToggle(billable));
    for (const field of settings.fields.filter(field => field.key !== "ALLOW_BILLABLE_GENERATION")) {
      box.append(renderSettingField(field));
    }
  } catch (error) {
    notify(error.message);
  }
}

function renderBillableToggle(field) {
  const label = document.createElement("label");
  label.className = "billable-toggle";
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = "真实视频生成";
  const detail = document.createElement("small");
  detail.textContent = "关闭时只能生成流程自检片；开启后“生成真实视频样片”会调用已配置的视频模型，可能产生费用。";
  copy.append(title, detail);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = field.key;
  input.value = "true";
  input.checked = String(field.value).toLowerCase() === "true";
  const knob = document.createElement("i");
  label.append(copy, input, knob);
  return label;
}

function renderSettingField(field) {
  const label = document.createElement("label");
  label.className = "setting-field";
  const title = document.createElement("span");
  title.textContent = field.label;
  const key = document.createElement("small");
  key.textContent = field.secret && field.hasValue ? `${field.key} · ${field.maskedValue}` : field.key;
  const input = document.createElement("input");
  input.name = field.key;
  input.value = field.value || "";
  input.placeholder = settingHints[field.key] || "";
  input.type = field.secret ? "password" : "text";
  label.append(title, key, input);
  return label;
}

$("#settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!window.desktop?.saveSettings) return notify("设置中心仅在桌面应用中可用");
  $("#save-settings").disabled = true;
  try {
    const payload = {};
    payload.ALLOW_BILLABLE_GENERATION = "false";
    new FormData(event.currentTarget).forEach((value, key) => { payload[key] = String(value); });
    await window.desktop.saveSettings(payload);
    notify("配置已保存，本地制作服务已重启");
  } catch (error) {
    notify(error.message);
  } finally {
    $("#save-settings").disabled = false;
  }
});

async function loadModelStatus(force = false) {
  const box = $("#model-status");
  box.textContent = force ? "正在重新执行模型运行检查…" : "正在读取模型状态…";
  try {
    const status = await api(`/api/models/status${force ? "?refresh=1" : ""}`);
    box.replaceChildren();
    const overview = document.createElement("article");
    overview.className = status.summary.ready ? "ready" : "warning";
    const overviewTitle = document.createElement("strong");
    overviewTitle.textContent = status.summary.ready
      ? "生产关键门禁已通过"
      : status.summary.configuredReady
        ? "核心模型已配置，生产关键门禁未通过"
        : "核心模型配置不完整";
    const overviewText = document.createElement("span");
    overviewText.textContent = `${status.summary.requiredConfigured}/${status.summary.required} 个必需模型已配置 · ${status.summary.runtimeGatesOperational}/${status.summary.runtimeGates} 个生产关键门禁已验证 · 付费生成：${status.billableGenerationEnabled ? "已开启" : "关闭"}`;
    overview.append(overviewTitle, overviewText);
    box.append(overview);
    for (const model of status.models) {
      const item = document.createElement("article");
      item.className = model.health?.operational === true
        ? "ready"
        : model.health?.operational === false && model.configured
          ? "failed"
          : model.configured
            ? "unchecked"
            : model.required ? "missing" : "optional";
      const configuration = model.configured
        ? `配置完整 · ${model.model || model.endpoint || "模型路由已设置"}`
        : `缺少：${model.missing.join("、")}`;
      const health = model.configured && model.healthCheckSupported
        ? `运行状态：${model.health?.label || "未检测"}${model.health?.message ? ` · ${model.health.message}` : ""}${model.health?.selectedModel ? ` · 生效模型 ${model.health.selectedModel}` : ""}${model.health?.httpStatus ? ` · HTTP ${model.health.httpStatus}` : ""}${model.health?.errorCode ? ` · ${model.health.errorCode}` : ""}`
        : model.configured
          ? "运行状态：按实际任务响应与产物验收"
        : "运行状态：不可检查";
      const title = document.createElement("strong");
      title.textContent = model.label;
      const text = document.createElement("span");
      text.textContent = `${model.required ? "必需" : "可选"} · ${configuration}\n${health}`;
      item.append(title, text);
      box.append(item);
    }
  } catch (error) {
    box.textContent = error.message;
  }
}
