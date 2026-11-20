const form = document.querySelector("#clinic-form");
const input = document.querySelector("#target-url");
const button = document.querySelector("#submit-button");
const errorSummary = document.querySelector("#error-summary");
const errorLink = document.querySelector("#error-link");
const fieldError = document.querySelector("#url-error");
const loading = document.querySelector("#loading");
const result = document.querySelector("#result");
const copyButton = document.querySelector("#copy-llms");
const copyFeedback = document.querySelector("#copy-feedback");

const basePath = window.location.pathname.split("/").slice(0, 2).join("/") || "";
let currentDraft = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(message) {
  input.setAttribute("aria-invalid", "true");
  fieldError.textContent = message;
  errorLink.textContent = message;
  errorSummary.hidden = false;
  errorSummary.focus();
}

function clearError() {
  input.removeAttribute("aria-invalid");
  fieldError.textContent = "";
  errorSummary.hidden = true;
}

function validateUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "请输入一个公开网址。";
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return "网址格式不正确。";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return "只支持 http 或 https。";
  if (!parsed.hostname || parsed.hostname === "localhost") return "不能检测 localhost 或内网地址。";
  return "";
}

function setBusy(isBusy) {
  button.disabled = isBusy;
  button.textContent = isBusy ? "体检中…" : "开始体检";
  loading.hidden = !isBusy;
}

function kv(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd>`;
}

function renderStatus(value) {
  const status = value?.status || "unknown";
  return `<span class="status ${escapeHtml(status)}">${escapeHtml(value?.label || "未知")}</span>`;
}

function renderReport(payload) {
  const { report, diagnosis } = payload;
  document.querySelector("#score").textContent = String(report.rating.score);
  document.querySelector("#grade").textContent = `${report.rating.grade} · ${report.rating.label}`;
  document.querySelector("#score-label").textContent = report.target;
  document.querySelector("#summary").textContent = diagnosis.summary;
  document.querySelector("#penalties").innerHTML = (report.rating.penalties.length ? report.rating.penalties : ["没有明显基础阻塞项"])
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");

  document.querySelector("#page-signals").innerHTML = [
    kv("HTTP 状态", `${report.page.status} · ${report.page.elapsedMs}ms`),
    kv("最终 URL", report.page.finalUrl),
    kv("标题", report.page.title),
    kv("描述", report.page.description),
    kv("Meta robots", report.page.metaRobots || "未设置"),
    kv("Canonical", report.page.canonical || "未设置"),
    kv("可读正文", `${report.page.textLength} 字符`),
    kv("链接数量", `${report.page.linkCount} 个`)
  ].join("");

  document.querySelector("#llms-status").innerHTML = report.llms.exists
    ? `<p><span class="status allowed">已发现</span></p><p>${escapeHtml(report.llms.url)}</p><p class="help">${escapeHtml(report.llms.preview || "文件存在，但没有可预览文本。")}</p>`
    : `<p><span class="status unknown">未发现</span></p><p class="help">建议添加 /llms.txt，给 AI 助手一份稳定的站点说明。</p>`;

  document.querySelector("#bot-grid").innerHTML = (report.robots.bots || []).map((bot) => `
    <div class="bot">
      <strong>${escapeHtml(bot.bot)}</strong>
      ${renderStatus(bot)}
      <p>${escapeHtml(bot.owner)} · ${escapeHtml(bot.detail)}</p>
    </div>
  `).join("") || `<p class="help">没有读取到 robots.txt 规则。</p>`;

  document.querySelector("#priorities").innerHTML = diagnosis.priorities
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  document.querySelector("#next-experiment").textContent = diagnosis.nextExperiment;
  currentDraft = diagnosis.llmsTxtDraft || "";
  document.querySelector("#llms-draft").textContent = currentDraft;
  copyFeedback.textContent = diagnosis.source === "maas" ? "建议由 MaaS 生成。" : "MaaS 未配置或调用失败，当前显示本地降级建议。";

  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const message = validateUrl(input.value);
  if (message) {
    showError(message);
    return;
  }
  result.hidden = true;
  setBusy(true);
  try {
    const response = await fetch(`${basePath}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: input.value.trim() })
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.message || payload.error || "检测失败");
    }
    renderReport(payload);
  } catch (error) {
    showError(error.message || "检测失败，请稍后重试。");
  } finally {
    setBusy(false);
  }
});

input.addEventListener("input", () => {
  if (fieldError.textContent) clearError();
});

copyButton.addEventListener("click", async () => {
  if (!currentDraft) return;
  try {
    await navigator.clipboard.writeText(currentDraft);
    copyFeedback.textContent = "已复制 llms.txt 草稿。";
  } catch {
    copyFeedback.textContent = "复制失败，可以手动选中草稿。";
  }
});
