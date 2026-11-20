import { readSession, writeSession } from "./session.mjs";
import { referenceFor, labelFor } from "./visuals.mjs";
const $ = (selector) => document.querySelector(selector);
let record;
let activeIndex = 0;
let busy = false;
const promptText = (job) => `${job.prompt}\n\nNegative prompt: ${job.negativePrompt}`;

function showState(title, copy, retry = false, loading = false) {
  $("[data-state]").hidden = false;
  $("[data-state]").setAttribute("aria-busy", String(loading));
  $("[data-state]").classList.toggle("is-loading", loading);
  $("[data-state-title]").textContent = title;
  $("[data-state-copy]").textContent = copy;
  $("[data-retry]").hidden = !retry;
  $("[data-results]").hidden = true;
}

function render() {
  const jobs = record.result.jobs;
  $("[data-state]").hidden = true;
  $("[data-results]").hidden = false;
  const completed = jobs.filter((job) => job.output?.imageUrl).length;
  $("[data-summary]").textContent = completed ? `${completed} 张图片已生成，共 ${jobs.length} 种风格` : `${jobs.length} 种风格 · 目前仅有提示词，尚未生成图片`;
  const list = $("[data-result-list]");
  list.replaceChildren();
  jobs.forEach((job, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "collection-tab";
    button.setAttribute("aria-pressed", String(index === activeIndex));
    const img = document.createElement("img");
    img.src = job.output?.imageUrl || referenceFor(job.templateId, "thumb");
    img.decoding = "async";
    img.alt = "";
    const text = document.createElement("span");
    text.textContent = labelFor(job.templateId) || job.shortTitle;
    button.append(img, text);
    button.addEventListener("click", () => {
      activeIndex = index;
      render();
      list.children[index].focus({ preventScroll: true });
    });
    list.append(button);
  });
  renderDetail(jobs[activeIndex]);
}

function renderDetail(job) {
  const node = $("#detail-template").content.cloneNode(true);
  const completed = Boolean(job.output?.imageUrl);
  const failed = ["provider-error", "provider-empty", "provider-not-configured"].includes(job.output?.status);
  node.querySelector(".result-art img").src = completed ? job.output.imageUrl : referenceFor(job.templateId);
  node.querySelector(".result-art img").alt = completed ? `${job.title}生成作品` : `${job.shortTitle}风格参考，非根据你的照片生成`;
  node.querySelector(".art-label").textContent = completed ? "你的生成作品" : "风格参考图，非你的生成作品";
  node.querySelector(".result-type").textContent = completed ? "图片已生成" : failed ? "图片未生成" : "提示词已准备好";
  node.querySelector("h2").textContent = labelFor(job.templateId) || job.shortTitle;
  node.querySelector(".result-note").textContent = completed
    ? "这是根据你上传的照片生成的作品。保存下来，收藏这一刻的自己。"
    : failed ? "图像服务未完成生成。你可以返回重试，或复制提示词到其他图像工具继续创作。"
    : "当前尚未配置图像服务，暂时不能直接出图。右侧已准备好专属提示词；左侧仅展示风格参考。";
  const download = node.querySelector("[data-download]");
  download.hidden = !completed;
  if (completed) {
    download.href = job.output.imageUrl;
    download.download = `状态照-${job.templateId}.png`;
    node.querySelector("[data-copy]").className = "secondary-button";
  }
  const textarea = node.querySelector("textarea");
  textarea.value = promptText(job);
  node.querySelector("[data-copy]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptText(job));
      $("[data-toast]").textContent = "提示词已复制。";
      $("[data-toast]").classList.add("show");
      setTimeout(() => $("[data-toast]").classList.remove("show"), 2400);
    } catch {
      textarea.closest("details").open = true;
      textarea.focus();
      textarea.select();
      $("[data-toast]").textContent = "浏览器未允许复制，已选中提示词，请手动复制。";
      $("[data-toast]").classList.add("show");
    }
  });
  $("[data-result-detail]").replaceChildren(node);
}

async function runGeneration() {
  if (busy) return;
  busy = true;
  showState("正在制作你的状态照", "请保留此页面。图像生成可能需要几分钟，完成后会自动展示。", false, true);
  try {
    record = { ...record, state: "processing" };
    await writeSession(record);
    const response = await fetch("/status-capsule/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record.request)
    });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.jobs?.length) throw new Error(result.error || "generation_failed");
    record = { ...record, state: "complete", result };
    await writeSession(record);
    render();
  } catch {
    record = { ...record, state: "failed" };
    await writeSession(record).catch(() => {});
    showState("这次没能完成生成", "网络或图像服务暂时不可用。照片和风格仍在临时草稿中，可以重试或返回修改。", true);
  } finally { busy = false; }
}
$("[data-retry]").addEventListener("click", runGeneration);
async function init() {
  try {
    record = await readSession();
    if (!record?.request?.photoDataUrl) return showState("还没有作品", "先上传自己的照片，选一种喜欢的风格。");
    if (record.state === "complete" && record.result?.jobs?.length) return render();
    if (record.state === "pending") return runGeneration();
    showState("上次生成未完成", "刷新或关闭页面可能中断生成。确认后重新尝试；重试可能再次调用图像服务。", true);
  } catch { showState("暂时无法读取作品", "请允许浏览器本地存储，或返回制作页重新上传照片。"); }
}
init();
