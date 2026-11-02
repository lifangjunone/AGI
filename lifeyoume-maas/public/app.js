import { modelHealth, modelStatusOptions, matchesModelStatus } from "./model-status.js";
import { readNavigation, navigationHash } from "./navigation.js";
import { setupMobileNavigation } from "./mobile-navigation.js";
import { integrationGuide } from "./integration-guide.js";
import { chatAnswer } from "./chat-result.js";
import { captureListFocus, restoreListFocus } from "./list-focus.js";
import { renderImageResults } from "./image-results.js";
import { visionRequest } from "./vision-request.js";

const content = document.querySelector("#content");
const title = document.querySelector("#view-title");
const eyebrow = document.querySelector("#view-eyebrow");
const notice = document.querySelector("#notice");
const dialog = document.querySelector("#key-dialog");
const modelDialog = document.querySelector("#model-dialog");
const mobileNavigation = setupMobileNavigation({
  sidebar: document.querySelector(".sidebar"), workspace: document.querySelector(".workspace"),
  toggle: document.querySelector("#menu-button"), close: document.querySelector("#close-navigation"),
  backdrop: document.querySelector("#navigation-backdrop")
});
let state;
let currentView = "overview";
let revealTimer;
let previewUrl;
let playgroundMode = "chat";
let playgroundAudioUrl = "";
let playgroundController;
let cleanupImages;

function clearPlayground() {
  cleanupImages?.();
  cleanupImages = null;
  playgroundController?.abort();
  playgroundController = null;
  document.querySelector("#play-audio")?.pause();
  if (playgroundAudioUrl) URL.revokeObjectURL(playgroundAudioUrl);
  playgroundAudioUrl = "";
}
let modelPage = 1;
let modelPageSize = 10;
let modelSort = "updated";
let registrySearchTimer;
let revealedCredential = "";
let modelQuery = "";
let modelCapability = "all";
let modelProvider = "all";
let modelStatus = "all";
const selectedModels = new Set();
let pageSelectableIds = [];
let bulkBusy = false;
let bulkMessage = "";
let noticeTimer;
let loadingState = false;
let dialogGeneration = 0;
let createdKeySaved = false;
const logViews = {
  usage: { query: "", application: "", status: "", page: 1, pageSize: 20 },
  audit: { query: "", action: "", page: 1, pageSize: 20 }
};
const logResults = { usage: {}, audit: {} };

function logSignature(kind) {
  const config = logViews[kind];
  return new URLSearchParams({
    q: config.query, application: config.application || "", action: config.action || "",
    status: config.status || "", page: config.page, size: config.pageSize
  }).toString();
}

function fetchLogPage(kind, force = false) {
  const cache = logResults[kind];
  const signature = logSignature(kind);
  if (!force && cache.signature === signature) return;
  clearTimeout(cache.timer);
  cache.signature = signature;
  cache.loading = true;
  cache.error = "";
  const requestId = (cache.requestId || 0) + 1;
  cache.requestId = requestId;
  cache.timer = setTimeout(async () => {
    try {
      const result = await api(`/api/admin/${kind}?${signature}`);
      if (cache.requestId !== requestId) return;
      cache.result = result;
      logViews[kind].page = result.page;
      cache.signature = logSignature(kind);
    } catch (error) {
      if (cache.requestId !== requestId) return;
      cache.error = error.message;
    } finally {
      if (cache.requestId === requestId) {
        cache.loading = false;
        if (currentView === kind) {
          const focusedId = document.activeElement?.id;
          render();
          if (focusedId?.startsWith("log-")) document.getElementById(focusedId)?.focus();
        }
      }
    }
  }, 180);
}

function currentLogResult(kind) {
  const cache = logResults[kind];
  if (cache.signature !== logSignature(kind)) fetchLogPage(kind);
  return cache.result || { items: [], total: 0, retainedTotal: 0, filterValues: [],
    retentionLimit: kind === "usage" ? 5000 : 500, page: 1, pages: 1, pageSize: logViews[kind].pageSize };
}

function logFeedback(kind) {
  const cache = logResults[kind];
  if (cache.loading) return `<p class="log-scope" role="status">正在查询服务器记录…</p>`;
  if (cache.error) return `<div class="form-error" role="alert">查询失败：${esc(cache.error)}。<button class="secondary-button" id="log-retry">重新查询</button></div>`;
  return "";
}

function beginDialog() {
  dialogGeneration += 1;
  clearInterval(revealTimer);
  revealedCredential = "";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  return dialogGeneration;
}

function restoreNavigation() {
  const value = readNavigation(location.hash);
  currentView = value.view;
  modelQuery = value.query;
  modelCapability = value.capability;
  modelProvider = value.provider;
  modelStatus = value.status;
  modelPage = value.page;
  modelPageSize = value.pageSize;
  modelSort = value.sort;
}

function syncNavigation(push = false) {
  const hash = navigationHash({
    view: currentView, query: modelQuery, capability: modelCapability, provider: modelProvider,
    status: modelStatus, page: modelPage, pageSize: modelPageSize, sort: modelSort
  });
  if (location.hash !== hash) history[push ? "pushState" : "replaceState"](null, "", hash);
}

restoreNavigation();

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const statusTag = (enabled, label = enabled ? "运行中" : "未启用") => `<span class="tag ${enabled ? "good" : "warn"}">${esc(label)}</span>`;
const usageFor = (appId) => state.usage.filter((item) => item.applicationId === appId);
const formatTime = (value) => value ? new Date(value).toLocaleString("zh-CN") : "尚未记录";
const healthTag = (model, deployment, provider) => {
  const health = modelHealth(model, deployment, provider);
  return `<span class="tag ${health.tone}">${esc(health.label)}</span>`;
};

async function api(path, options) {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options?.headers || {}) } });
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("登录状态可能已过期，请重新登录管理员控制台后重试。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || result.error || "请求失败");
  return result;
}

async function load(showNotice = false) {
  if (loadingState) return;
  loadingState = true;
  const refresh = document.querySelector("#refresh");
  refresh.disabled = true;
  refresh.setAttribute("aria-busy", "true");
  content.setAttribute("aria-busy", "true");
  try {
    state = await api("/api/admin/state");
    if (currentView === "usage" || currentView === "audit") fetchLogPage(currentView, true);
    document.querySelector("#actor").textContent = state.actor;
    document.querySelector("#system-state").textContent = "控制面在线";
    document.querySelector(".pulse").classList.add("online");
    render();
    if (showNotice) flash("控制台数据已刷新。");
  } catch (error) {
    document.querySelector("#system-state").textContent = "连接异常";
    document.querySelector(".pulse").classList.remove("online");
    if (state) {
      flash(`刷新失败：${error.message} 当前保留上次数据，请点击刷新重试。`, "error");
    } else {
      content.innerHTML = `<div class="empty-panel"><div><strong>无法连接 MaaS 控制面</strong><p>${esc(error.message)}</p><button class="secondary-button" id="retry-load">重新连接</button></div></div>`;
      document.querySelector("#retry-load").addEventListener("click", () => load());
    }
  } finally {
    loadingState = false;
    refresh.disabled = false;
    refresh.setAttribute("aria-busy", "false");
    content.setAttribute("aria-busy", "false");
  }
}

function flash(message, tone = /失败|异常|无法|错误/.test(message) ? "error" : "success") {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.dataset.tone = tone;
  notice.classList.add("show");
  noticeTimer = setTimeout(() => {
    notice.classList.remove("show");
    notice.textContent = "";
  }, tone === "error" ? 8000 : 4000);
}

function overview() {
  const requests = state.usage.length;
  const success = state.usage.filter((item) => item.status >= 200 && item.status < 400).length;
  const latencyValues = state.usage.map((item) => item.latencyMs).sort((a, b) => a - b);
  const p95 = latencyValues.length ? latencyValues[Math.min(latencyValues.length - 1, Math.floor(latencyValues.length * .95))] : 0;
  const activeDeployments = state.deployments.filter((item) => item.enabled).length;
  return `
    <section class="metrics" aria-label="MaaS 关键指标">
      <div class="metric"><span>当前窗口请求</span><strong>${requests}</strong><small>最近返回的最多 200 条调用记录</small></div>
      <div class="metric"><span>窗口调用成功率</span><strong>${requests ? ((success / requests) * 100).toFixed(1) : "—"}${requests ? "%" : ""}</strong><small>仅统计当前记录窗口，非全量流量</small></div>
      <div class="metric"><span>窗口 P95 延迟</span><strong>${p95 ? `${p95}ms` : "—"}</strong><small>仅统计当前记录窗口</small></div>
      <div class="metric"><span>活跃 Deployment</span><strong>${activeDeployments}</strong><small>${state.deployments.length} 个已注册</small></div>
    </section>
    <div class="section-head"><div><h2>实时路由拓扑</h2><p>应用通过逻辑模型与供应商解耦，实际密钥不会离开网关。</p></div><div class="status-key"><span>已启用</span><span>待配置</span></div></div>
    <section class="traffic-grid" aria-label="应用到模型再到部署的路由">
      <div class="traffic-column"><header><span>APPLICATIONS</span><b>${state.applications.length}</b></header><div class="traffic-list">
        ${state.applications.slice(0, 6).map((app) => `<article class="node ${app.enabled ? "" : "off"}"><i></i><p><strong>${esc(app.name)}</strong><small>${esc(app.id)}</small></p><em>${usageFor(app.id).length} REQ</em></article>`).join("")}
      </div></div>
      <div class="traffic-column"><header><span>LOGICAL MODELS</span><b>${state.logicalModels.length}</b></header><div class="traffic-list">
        ${state.logicalModels.slice(0, 6).map((model) => `<article class="node ${model.enabled && model.routes.length ? "" : "warn"}"><i></i><p><strong>${esc(model.id)}</strong><small>${esc(model.capability)} · ${model.routes.length} ROUTE</small></p><em>${model.enabled && model.routes.length ? "READY" : "PLANNED"}</em></article>`).join("")}
      </div></div>
      <div class="traffic-column"><header><span>DEPLOYMENTS</span><b>${state.deployments.length}</b></header><div class="traffic-list">
        ${state.deployments.slice(0, 6).map((deployment) => `<article class="node ${deployment.enabled ? "" : "warn"}"><i></i><p><strong>${esc(deployment.name)}</strong><small>${esc(deployment.upstreamModel)}</small></p><em>${deployment.enabled ? "ACTIVE" : "SETUP"}</em></article>`).join("")}
      </div></div>
    </section>
    <p class="overview-scope">每列最多展示 6 项。<a href="#view=models">查看全部 ${state.logicalModels.length} 个模型与部署</a></p>
    <div class="section-head"><div><h2>最近调用</h2><p>每次调用都归属到应用、逻辑模型和实际 Deployment。</p></div></div>
    ${usageTable(state.usage.slice(0, 8))}
  `;
}

function usageTable(items) {
  if (!items.length) return `<div class="empty-panel"><div><strong>还没有模型调用</strong><p>为应用创建服务 Key 后，即可通过统一网关发起请求。</p></div></div>`;
  return `<div class="table-wrap log-table-wrap"><table class="log-table"><thead><tr><th>时间</th><th>应用</th><th>逻辑模型</th><th>Deployment</th><th>记录状态</th><th>延迟</th><th>操作</th></tr></thead><tbody>${items.map((item) => `<tr><td data-label="时间">${formatTime(item.at)}</td><td data-label="应用">${esc(item.applicationId)}</td><td data-label="逻辑模型">${esc(item.logicalModel)}</td><td data-label="Deployment">${esc(item.deploymentId)}</td><td data-label="记录状态">${statusTag(item.status >= 200 && item.status < 400, String(item.status))}</td><td data-label="延迟">${item.latencyMs}ms</td><td data-label="操作"><button class="secondary-button" data-usage-detail="${esc(item.id)}" aria-label="查看调用 ${esc(item.requestId || item.id)}">详情</button></td></tr>`).join("")}</tbody></table></div>`;
}

function openUsageDetail(recordId) {
  const item = [...(logResults.usage.result?.items || []), ...state.usage].find(record => record.id === recordId);
  if (!item) return flash("记录已更新，请刷新列表后重试。", "error");
  const generation = beginDialog();
  modelDialog.oncancel = null;
  modelDialog.setAttribute("aria-label", "调用详情");
  const key = state.keys.find(record => record.id === item.keyId);
  const model = state.logicalModels.find(record => record.id === item.logicalModel);
  const fields = [
    ["请求 ID", item.requestId || "历史记录未提供"],
    ["记录 ID", item.id], ["时间", formatTime(item.at)],
    ["应用", item.applicationId], ["逻辑模型", item.logicalModel],
    ["Deployment", item.deploymentId || "未记录"],
    ["能力", item.capability || "未记录"], ["记录状态", item.status],
    ["延迟", `${item.latencyMs ?? "—"} ms`],
    ["服务 Key 用途", key?.name || "当前凭证列表中未找到"],
    ["输入单位", item.inputUnits ?? "未记录"], ["输出单位", item.outputUnits ?? "未记录"]
  ];
  document.querySelector("#model-dialog-content").innerHTML = `
    <header><div><span class="eyebrow">REQUEST DETAILS</span><h2>调用详情</h2></div><button id="close-model-dialog" class="icon-button" aria-label="关闭"><svg aria-hidden="true"><use href="#icon-close"/></svg></button></header>
    <p>状态为调用记录值，可能来自上游或转发失败默认值，不一定等同于客户端收到的 HTTP 状态。历史记录不包含消息、供应商错误正文或密钥明文。</p>
    <dl class="model-details">${fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
    <p>输入/输出单位由调用接口定义，不能据此直接推算费用。排查失败调用时，可核对模型配置、最近连接测试和服务端日志；仅凭这条记录无法确定根因。</p>
    <div class="form-actions">${item.requestId ? `<button class="secondary-button" id="copy-request-id">复制请求 ID</button>` : ""}${model ? `<button class="primary-button" id="open-request-model">查看关联模型</button>` : `<span class="log-scope">关联模型已不在当前注册表中。</span>`}</div>
    <p id="request-copy-feedback" role="status" aria-live="polite"></p>`;
  document.querySelector("#close-model-dialog").onclick = () => modelDialog.close();
  document.querySelector("#copy-request-id")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(item.requestId);
      if (generation === dialogGeneration && modelDialog.open) document.querySelector("#request-copy-feedback").textContent = "请求 ID 已复制。";
    } catch {
      if (generation === dialogGeneration && modelDialog.open) document.querySelector("#request-copy-feedback").textContent = "复制未获允许，请选中上方请求 ID 手动复制。";
    }
  });
  document.querySelector("#open-request-model")?.addEventListener("click", () => {
    modelDialog.close();
    openModelDetails(model.id);
  });
  modelDialog.showModal();
}

function models() {
  const records = state.logicalModels.map((model) => {
    const deployment = state.deployments.find((item) => item.id === model.routes?.[0]?.deploymentId) || {};
    const provider = state.providers.find((item) => item.id === deployment.providerId) || {};
    return { model, deployment, provider };
  });
  const providers = [...new Set(records.map((item) => item.provider.name).filter(Boolean))].sort();
  const capabilities = [...new Set(records.map((item) => item.model.capability).filter(Boolean))].sort();
  const filtered = records.filter(({ model, deployment, provider }) => {
    const haystack = [model.id, model.name, deployment.upstreamModel, provider.name].join(" ").toLowerCase();
    return (!modelQuery || haystack.includes(modelQuery.toLowerCase()))
      && (modelCapability === "all" || model.capability === modelCapability)
      && (modelProvider === "all" || provider.name === modelProvider)
      && matchesModelStatus(modelStatus, model, deployment, provider);
  });
  filtered.sort((a, b) => modelSort === "name"
    ? a.model.name.localeCompare(b.model.name, "zh-CN")
    : String(b.model.updatedAt || b.deployment.updatedAt || b.model.createdAt || "")
      .localeCompare(String(a.model.updatedAt || a.deployment.updatedAt || a.model.createdAt || "")));
  const pages = Math.max(1, Math.ceil(filtered.length / modelPageSize));
  modelPage = Math.min(modelPage, pages);
  const pageItems = filtered.slice((modelPage - 1) * modelPageSize, modelPage * modelPageSize);
  const existingIds = new Set(records.filter(x => !x.model.managed).map(x => x.model.id));
  for (const id of selectedModels) if (!existingIds.has(id)) selectedModels.delete(id);
  pageSelectableIds = pageItems.filter(x => !x.model.managed).map(x => x.model.id);
  return `
    <section class="registry-head">
      <div><span class="eyebrow">MODEL REGISTRY</span><h2>模型列表</h2><p>统一管理逻辑模型、真实 Deployment、Provider 和访问凭据。</p></div>
      <button class="primary-button" id="create-model" type="button">接入新模型</button>
    </section>
    <section class="registry-metrics" aria-label="模型统计">
      <div><strong>${records.length}</strong><span>全部模型</span></div>
      <div><strong>${records.filter((x) => x.model.enabled && x.deployment.enabled).length}</strong><span>已启用</span></div>
      <div><strong>${providers.length}</strong><span>Provider</span></div>
      <div><strong>${capabilities.length}</strong><span>能力类型</span></div>
    </section>
    <section class="registry-toolbar" aria-label="模型筛选">
      <label class="search-field"><span>搜索模型</span><input id="model-search" type="search" value="${esc(modelQuery)}" placeholder="模型名称、ID、Provider 或上游模型"></label>
      <label><span>能力</span><select id="capability-filter"><option value="all">全部能力</option>${capabilities.map((x) => `<option value="${esc(x)}" ${modelCapability === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label><span>Provider</span><select id="provider-filter"><option value="all">全部 Provider</option>${providers.map((x) => `<option value="${esc(x)}" ${modelProvider === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label><span>状态</span><select id="status-filter" aria-describedby="model-status-help">${modelStatusOptions.map(([value, label]) => `<option value="${value}" ${modelStatus === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <p class="filter-summary" id="model-status-help">已启用不等于可调用；目录核验不执行推理。“全部待核验”包含未验证、目录未找到和无法核验。</p>
      ${modelQuery || modelCapability !== "all" || modelProvider !== "all" || modelStatus !== "all" ? `<div class="filter-summary"><span>筛选结果：${filtered.length} / ${records.length} 个模型</span><button class="secondary-button" id="reset-model-filters">清空筛选</button></div>` : ""}
    </section>
    <section class="model-registry">
      <div class="bulk-toolbar" aria-label="批量模型管理" aria-busy="${bulkBusy}">
        <label class="selection-control"><input id="select-page" type="checkbox" ${bulkBusy || !pageSelectableIds.length ? "disabled" : ""}>选择当前页</label>
        <span id="selection-count" role="status">已选 ${selectedModels.size} 个模型（跨页保留）</span>
        <div>
          <button class="secondary-button" data-bulk-action="enable" ${bulkBusy || !selectedModels.size ? "disabled" : ""}>批量启用</button>
          <button class="secondary-button" data-bulk-action="disable" ${bulkBusy || !selectedModels.size ? "disabled" : ""}>批量停用</button>
          <button class="secondary-button danger-action" data-bulk-action="delete" ${bulkBusy || !selectedModels.size ? "disabled" : ""}>批量删除</button>
          <button class="secondary-button" id="clear-selection" ${bulkBusy || !selectedModels.size ? "disabled" : ""}>清空选择</button>
        </div>
        <p id="bulk-message" role="status">${esc(bulkMessage || "仅操作已勾选模型；托管模型不参与批量变更。")}</p>
      </div>
      <div class="registry-table-wrap">
        <table class="registry-table">
          <thead><tr><th>模型</th><th>Provider / Endpoint</th><th>能力</th><th>API Key</th><th>健康状态</th><th>更新时间</th><th class="actions-column">操作</th></tr></thead>
          <tbody>${pageItems.map(({ model, deployment, provider }) => `
            <tr class="${selectedModels.has(model.id) ? "selected-row" : ""}">
              <td><label class="row-selection"><input type="checkbox" data-select-model="${esc(model.id)}" aria-label="选择 ${esc(model.name)}" ${selectedModels.has(model.id) ? "checked" : ""} ${model.managed || bulkBusy ? "disabled" : ""}></label><button class="model-link" data-view-model="${esc(model.id)}">${esc(model.name)}</button><small>${esc(model.id)}</small><small>上游：${esc(deployment.upstreamModel || "—")}</small></td>
              <td><strong>${esc(provider.name || "—")}</strong><small>${esc(provider.baseUrl || "—")}</small></td>
              <td><span class="tag">${esc(model.capability)}</span>${model.managed ? `<span class="tag managed">托管</span>` : ""}${!integrationGuide(model, location.origin).supported ? `<small>仅注册 · 暂无推理接口</small>` : ""}</td>
              <td><code>${esc(provider.credentialMasked || (provider.kind === "internal" ? "内部凭据" : "未配置"))}</code></td>
              <td>${healthTag(model, deployment, provider)}<small>${esc(deployment.lastTestMessage || "尚未核验当前模型")}</small><small>${deployment.lastTestAt ? `${formatTime(deployment.lastTestAt)} · ${deployment.lastTestLatencyMs ?? "—"} ms` : ""}</small></td>
              <td>${formatTime(model.updatedAt || deployment.updatedAt || model.createdAt)}</td>
              <td><div class="row-actions">
                <button data-view-model="${esc(model.id)}">查看</button>
                ${provider.kind !== "internal" ? `<button data-test-model="${esc(model.id)}">测试</button><button data-reveal-model="${esc(model.id)}" ${provider.hasCredential ? "" : "disabled"}>API Key</button>` : `<button data-tts-model="${esc(model.id)}">试听</button>`}
                ${model.managed ? "" : `<button data-edit-model="${esc(model.id)}">编辑</button><button data-toggle-model="${esc(model.id)}" data-enabled="${model.enabled ? "true" : "false"}">${model.enabled ? "停用" : "启用"}</button><button class="danger-action" data-delete-model="${esc(model.id)}">删除</button>`}
              </div></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      ${!pageItems.length ? `<div class="registry-empty"><strong>没有匹配的模型</strong><p>调整搜索词或筛选条件，也可以直接接入新模型。</p><button class="secondary-button" id="clear-model-filters">清空筛选</button></div>` : ""}
      <footer class="registry-pagination"><span role="status">共 ${filtered.length} 个模型，第 ${modelPage} / ${pages} 页</span><div>
        <label>排序<select id="model-sort"><option value="updated" ${modelSort === "updated" ? "selected" : ""}>最近更新</option><option value="name" ${modelSort === "name" ? "selected" : ""}>模型名称</option></select></label>
        <label>每页<select id="model-page-size">${[10, 20, 50].map((size) => `<option value="${size}" ${size === modelPageSize ? "selected" : ""}>${size} 条</option>`).join("")}</select></label>
        <button class="secondary-button" id="model-prev" ${modelPage <= 1 ? "disabled" : ""}>上一页</button><button class="secondary-button" id="model-next" ${modelPage >= pages ? "disabled" : ""}>下一页</button></div></footer>
    </section>`;
}

function apps() {
  return `<div class="section-head"><div><h2>调用应用</h2><p>每个产品拥有独立的模型权限与服务凭证。RPM 和预算目前仅为预设值，尚未执行限流或预算拦截。</p></div></div><section class="card-grid">
    ${state.applications.map((app) => {
      const keys = state.keys.filter((key) => key.applicationId === app.id && !key.revokedAt);
      return `<article class="app-card"><header><div><small>APPLICATION</small><h3>${esc(app.name)}</h3></div>${statusTag(app.enabled)}</header><p>${app.allowedModels.length ? `允许调用 ${app.allowedModels.length} 个逻辑模型。` : "尚未分配模型权限。"}</p><dl><div><dt>每分钟请求</dt><dd>${app.rpm} RPM</dd></div><div><dt>月预算</dt><dd>¥${app.monthlyBudgetCny}</dd></div><div><dt>最近调用</dt><dd>${usageFor(app.id).length}</dd></div><div><dt>服务 Key</dt><dd>${keys.length}</dd></div></dl>${keys.map((key) => `<div class="key-row"><div><strong>${esc(key.name)}</strong><code>${esc(key.prefix)}…</code><small>创建：${formatTime(key.createdAt)}</small><small>最近使用：${key.lastUsedAt ? formatTime(key.lastUsedAt) : "尚未使用"}</small></div><button data-revoke-key="${esc(key.id)}" aria-label="撤销 ${esc(key.name)}">撤销</button></div>`).join("")}${!keys.length ? `<p class="key-empty">暂无服务 Key。先分配模型权限，再创建凭证供服务端调用。</p>` : ""}<div class="application-actions"><button class="secondary-button" data-edit-application="${esc(app.id)}">管理模型权限</button><button class="secondary-button" data-create-key="${esc(app.id)}">创建服务 Key</button></div></article>`;
    }).join("")}
  </section>`;
}

function openKeyCreator(applicationId) {
  const app = state.applications.find((item) => item.id === applicationId);
  if (!app) return;
  const generation = beginDialog();
  modelDialog.setAttribute("aria-label", `${app.name} · 创建服务 Key`);
  modelDialog.oncancel = null;
  document.querySelector("#model-dialog-content").innerHTML = `
    <header><div><span class="eyebrow">CREATE SERVICE KEY</span><h2>创建服务 Key</h2></div><button class="icon-button" id="close-model-dialog" aria-label="关闭"><svg aria-hidden="true"><use href="#icon-close"/></svg></button></header>
    <p>应用：${esc(app.name)}。新 Key 继承该应用的 ${app.allowedModels.length} 个模型权限。${!app.allowedModels.length ? "尚未授权模型，创建后需先分配权限才能调用。" : "请只保存到服务端 Secret，不要放入前端代码。"}</p>
    <form id="create-key-form" class="model-form">
      <label>用途名称<input id="key-name" required maxlength="80" autocomplete="off" placeholder="例如：生产 API、测试环境、语音服务"></label>
      <p>名称用于区分不同服务和环境；密钥明文仅在创建后显示一次。</p>
      <div id="create-key-error" class="form-error" role="alert"></div>
      <div class="form-actions"><button type="button" class="secondary-button" id="cancel-key-create">取消</button><button type="submit" class="primary-button">创建并显示密钥</button></div>
    </form>`;
  const form = document.querySelector("#create-key-form");
  let busy = false;
  const close = () => { if (!busy) modelDialog.close(); };
  document.querySelector("#close-model-dialog").onclick = close;
  document.querySelector("#cancel-key-create").onclick = close;
  modelDialog.oncancel = (event) => { event.preventDefault(); close(); };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const nameInput = form.querySelector("#key-name");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.setCustomValidity("请填写用途名称。");
      nameInput.reportValidity();
      return;
    }
    busy = true;
    form.setAttribute("aria-busy", "true");
    form.querySelectorAll("input, button").forEach(control => { control.disabled = true; });
    const submit = form.querySelector("[type=submit]");
    submit.textContent = "正在创建…";
    document.querySelector("#close-model-dialog").disabled = true;
    try {
      const result = await api(`/api/admin/applications/${encodeURIComponent(app.id)}/keys`, {
        method: "POST", body: JSON.stringify({ name })
      });
      if (generation !== dialogGeneration || !form.isConnected) return;
      modelDialog.close();
      createdKeySaved = false;
      document.querySelector("#key-saved").checked = false;
      document.querySelector("#key-context").textContent = `${app.name} · ${result.key.name}`;
      document.querySelector("#key-copy-status").textContent = "";
      document.querySelector("#created-key").textContent = result.token;
      dialog.showModal();
      await load();
    } catch (error) {
      if (generation === dialogGeneration && form.isConnected) {
        form.querySelector("#create-key-error").textContent = `创建失败：${error.message}。请检查后重试。`;
      }
    } finally {
      busy = false;
      if (generation === dialogGeneration && form.isConnected) {
        form.setAttribute("aria-busy", "false");
        form.querySelectorAll("input, button").forEach(control => { control.disabled = false; });
        submit.textContent = "创建并显示密钥";
        document.querySelector("#close-model-dialog").disabled = false;
      }
    }
  };
  form.querySelector("#key-name").oninput = (event) => event.target.setCustomValidity("");
  modelDialog.showModal();
}

function openApplicationPermissions(applicationId) {
  const app = state.applications.find((item) => item.id === applicationId);
  if (!app) return;
  const generation = beginDialog();
  const initial = [...app.allowedModels];
  const selected = new Set(initial);
  let page = 1;
  let busy = false;
  modelDialog.setAttribute("aria-label", `${app.name} · 模型权限`);
  document.querySelector("#model-dialog-content").innerHTML = `
    <header><div><span class="eyebrow">MODEL PERMISSIONS</span><h2>${esc(app.name)} · 模型权限</h2></div><button class="icon-button" id="close-model-dialog" aria-label="关闭"><svg aria-hidden="true"><use href="#icon-close"/></svg></button></header>
    <p>仅勾选该应用需要的模型。保存后对所有现有服务 Key 生效；停用模型可保留授权，但不能调用。这里只管理权限，不代表所有能力的推理接口均已实现。</p>
    <form id="application-permissions-form" class="model-form">
      <label>搜索模型<input id="permission-search" type="search" placeholder="名称、模型 ID 或能力"></label>
      <label class="permission-selected-filter"><input id="permission-selected-only" type="checkbox">只看已授权</label>
      <p id="permission-count" role="status" aria-live="polite"></p>
      <div id="permission-list" class="permission-list" role="group" aria-label="可授权模型"></div>
      <div class="permission-pagination"><button type="button" class="secondary-button" id="permission-prev">上一页</button><span id="permission-page"></span><button type="button" class="secondary-button" id="permission-next">下一页</button></div>
      <div id="permission-error" class="form-error" role="alert" tabindex="-1"></div>
      <div class="form-actions"><button type="button" class="secondary-button" id="permission-cancel">取消</button><button type="submit" class="primary-button">保存权限</button></div>
    </form>`;
  const form = document.querySelector("#application-permissions-form");
  const search = form.querySelector("#permission-search");
  const selectedOnly = form.querySelector("#permission-selected-only");
  const list = form.querySelector("#permission-list");
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = state.logicalModels.filter((model) =>
      (!selectedOnly.checked || selected.has(model.id))
      && `${model.name} ${model.id} ${model.capability}`.toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    page = Math.min(page, pages);
    list.innerHTML = filtered.slice((page - 1) * 20, page * 20).map((model) => `
      <label class="permission-option"><input type="checkbox" data-permission-model="${esc(model.id)}" ${selected.has(model.id) ? "checked" : ""}>
        <span><strong>${esc(model.name)}</strong><small>${esc(model.id)} · ${esc(model.capability)} · ${model.enabled ? "已启用" : "已停用"}</small></span></label>`).join("")
      || "<p>没有匹配的模型，请调整搜索或筛选。</p>";
    form.querySelector("#permission-count").textContent = `已授权 ${selected.size} 个模型 · 匹配 ${filtered.length} / ${state.logicalModels.length} 个（跨页保留选择）`;
    form.querySelector("#permission-page").textContent = `${page} / ${pages}`;
    form.querySelector("#permission-prev").disabled = page === 1;
    form.querySelector("#permission-next").disabled = page === pages;
  };
  list.addEventListener("change", (event) => {
    const id = event.target.dataset.permissionModel;
    if (!id) return;
    if (event.target.checked) selected.add(id);
    else selected.delete(id);
    draw();
    // Restore checkbox focus after rendering the current page.
    [...list.querySelectorAll("input")].find((input) => input.dataset.permissionModel === id)?.focus();
  });
  search.addEventListener("input", () => { page = 1; draw(); });
  selectedOnly.addEventListener("change", () => { page = 1; draw(); });
  form.querySelector("#permission-prev").onclick = () => { page -= 1; draw(); };
  form.querySelector("#permission-next").onclick = () => { page += 1; draw(); };
  const close = () => {
    if (busy) return;
    const changed = selected.size !== initial.length || initial.some((id) => !selected.has(id));
    if (!changed || confirm("权限尚未保存，确定放弃修改吗？")) modelDialog.close();
  };
  form.querySelector("#permission-cancel").onclick = close;
  document.querySelector("#close-model-dialog").onclick = close;
  modelDialog.oncancel = (event) => { event.preventDefault(); close(); };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const removed = initial.filter((id) => !selected.has(id));
    if (removed.length && !confirm(`将撤销 ${removed.length} 个模型权限。此应用的所有服务 Key 后续调用这些模型都会被拒绝，确认保存？`)) return;
    busy = true;
    form.setAttribute("aria-busy", "true");
    const submit = form.querySelector("[type=submit]");
    submit.textContent = "正在保存…";
    form.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
    document.querySelector("#close-model-dialog").disabled = true;
    try {
      await api(`/api/admin/applications/${encodeURIComponent(app.id)}/models`, {
        method: "PUT", body: JSON.stringify({ allowedModels: [...selected], expectedAllowedModels: initial })
      });
      if (generation === dialogGeneration) modelDialog.close();
      await load();
      flash("模型权限已更新，现有服务 Key 的后续请求立即生效。");
    } catch (error) {
      if (generation !== dialogGeneration || !form.isConnected) return;
      const output = form.querySelector("#permission-error");
      output.textContent = `保存失败：${error.message}`;
      output.focus();
    } finally {
      busy = false;
      if (generation === dialogGeneration && form.isConnected) {
        form.setAttribute("aria-busy", "false");
        form.querySelectorAll("input, button").forEach((control) => { control.disabled = false; });
        document.querySelector("#close-model-dialog").disabled = false;
        submit.textContent = "保存权限";
        draw();
      }
    }
  });
  draw();
  modelDialog.showModal();
}

function playground() {
  const speech = playgroundMode === "speech";
  const vector = playgroundMode === "embeddings";
  const image = playgroundMode === "image";
  const vision = playgroundMode === "vision";
  const models = state.logicalModels.filter(m => m.enabled && (speech
    ? m.capability === "audio.speech" : m.capability === (vector ? "embeddings" : image ? "image.generation" : vision ? "multimodal" : "chat")));
  return `<div class="section-head"><div><h2>模型调用工作台</h2><p>使用应用服务 Key 验证 Chat / TTS / Embeddings / Images 网关、模型授权与路由。不是管理员免授权试听；调用可能产生供应商费用。</p></div></div><section class="playground">
    <form class="panel" id="playground-form">
      <label>调用能力<select id="play-mode"><option value="chat" ${playgroundMode === "chat" ? "selected" : ""}>Chat · 非流式对话</option><option value="speech" ${speech ? "selected" : ""}>TTS · 语音合成</option><option value="embeddings" ${vector ? "selected" : ""}>Embeddings · 文本向量</option><option value="image" ${image ? "selected" : ""}>Images · 图像生成</option></select></label>
      <label>逻辑模型<select id="play-model" required ${models.length ? "" : "disabled"}>${models.map(m => `<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.id)}</option>`).join("")}</select></label>
      ${!models.length ? `<p class="form-error">没有已启用的可调用模型，请先接入或启用模型。</p>` : ""}
      <label>服务 Key<input id="play-key" type="password" autocomplete="off" placeholder="lym_srv_…" required></label>
      <p>使用应用服务 Key，不是供应商 Key。发送后清空输入，不保存到浏览器。</p>
      ${speech ? `<div class="form-grid"><div id="play-voice-field"></div><label>语速<input id="play-speed" type="number" min="0.5" max="2" step="0.1" value="1" required></label></div><p id="play-speech-help" role="status"></p>` : ""}
      ${vector ? `<label>向量维度（可选）<input id="play-dimensions" type="number" min="1" max="65536" step="1" placeholder="留空使用模型默认维度"></label><p>每行一条文本，最多 128 条、合计 100000 字符；空行忽略。网关不保存输入或向量。</p>` : ""}
      ${vision ? `<label>图片地址（每行一个，最多 4 个）<textarea id="play-vision-urls" required maxlength="33000" aria-describedby="play-vision-help" placeholder="https://…"></textarea></label><label>图片细节<select id="play-vision-detail"><option value="auto">auto · 供应商自动</option><option value="low">low · 低细节</option><option value="high">high · 高细节</option></select></label><p id="play-vision-help">仅支持 HTTPS 图片。供应商会读取这些地址，可能产生图片 Token 费用；请勿提交无权分享的图片。网关不抓取或保存图片，浏览器也不自动预览。此模式不支持音频、视频。</p>` : ""}
      ${image ? `<div class="form-grid"><label>图片数量<input id="play-image-count" type="number" min="1" max="4" step="1" value="1" required></label><label>尺寸<select id="play-image-size"><option value="">供应商默认</option>${["256x256","512x512","1024x1024","1024x1792","1792x1024","auto"].map(size => `<option>${size}</option>`).join("")}</select></label><label>返回格式<select id="play-image-format"><option value="b64_json">base64 · 本地预览</option><option value="url">URL · 点击加载</option></select></label></div><p>供应商需支持所选参数。最多 4 张；远程 URL 仅在点击后加载，可能过期。网关不保存提示词或图片。</p>` : ""}
      <label>${speech ? "合成文本（最多 500 字符）" : vector ? "待向量化文本" : image ? "图像提示词（最多 4000 字符）" : "消息"}<textarea id="play-message" ${speech ? 'maxlength="500"' : vector ? 'maxlength="100000"' : image ? 'maxlength="4000"' : ""} required>${speech ? "你好，这是 LifeYouMe MaaS 语音接入测试。" : vector ? "用于语义检索的示例文本" : image ? "白色背景上的蓝色几何图形" : "请用一句话介绍 LifeYouMe MaaS。"}</textarea></label>
      <button class="primary-button" type="submit" ${models.length ? "" : "disabled"}>${speech ? "生成语音" : "发送请求"}</button>
    </form>
    <aside class="panel playground-response"><span class="eyebrow">GATEWAY RESPONSE</span><h3>调用结果</h3><pre id="play-result" role="status" aria-live="polite">等待请求…</pre><p id="play-metadata" hidden></p><audio id="play-audio" controls hidden></audio><a id="play-download" download="maas-speech.wav" hidden>下载 WAV</a><details id="play-raw-response" hidden><summary>查看原始响应 JSON</summary><pre id="play-json"></pre></details><div class="play-result-actions"><button class="secondary-button" id="copy-play-answer" type="button" disabled>${vector ? "复制摘要" : "复制回答"}</button><button class="secondary-button" id="clear-play-result" type="button">清空结果</button></div><p id="play-copy-feedback" role="status" aria-live="polite"></p></aside>
  </section>`;
}

function logControls(kind, result) {
  const config = logViews[kind];
  const values = result.filterValues;
  return `<section class="log-toolbar" aria-label="${kind === "usage" ? "调用记录筛选" : "审计筛选"}">
    <label>搜索记录<input id="log-search" type="search" value="${esc(config.query)}" placeholder="${kind === "usage" ? "请求 ID、模型或 Deployment" : "操作者、动作或事件 ID"}"></label>
    <label>${kind === "usage" ? "应用" : "动作"}<select id="log-primary-filter"><option value="">全部</option>${values.map(value => `<option value="${esc(value)}" ${(kind === "usage" ? config.application : config.action) === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label>
    ${kind === "usage" ? `<label>调用状态<select id="log-status-filter"><option value="">全部状态</option><option value="success" ${config.status === "success" ? "selected" : ""}>成功</option><option value="failed" ${config.status === "failed" ? "selected" : ""}>失败</option></select></label>` : ""}
    <button class="secondary-button" id="log-reset" type="button">清空筛选</button>
  </section>
  <p class="log-scope" role="status">匹配 ${result.total} / ${result.retainedTotal} 条 · 查询服务器全部保留记录（最多 ${result.retentionLimit} 条），超出保留上限的旧记录不在查询范围内。</p>`;
}

function logPagination(result) {
  return `<footer class="registry-pagination"><span role="status">第 ${result.page} / ${result.pages} 页 · 共 ${result.total} 条</span><div><label>每页<select id="log-page-size">${[10, 20, 50].map(size => `<option value="${size}" ${size === result.pageSize ? "selected" : ""}>${size} 条</option>`).join("")}</select></label><button class="secondary-button" id="log-prev" ${result.page <= 1 ? "disabled" : ""}>上一页</button><button class="secondary-button" id="log-next" ${result.page >= result.pages ? "disabled" : ""}>下一页</button></div></footer>`;
}

function usage() {
  const config = logViews.usage;
  const result = currentLogResult("usage");
  return `<div class="section-head"><div><h2>调用记录</h2><p>展示最近保留的请求状态和延迟。当前尚未接入供应商价格与账单，不能将调用记录视为实际费用。授权拒绝等转发前错误目前不在该调用窗口中。</p></div></div>
    ${logControls("usage", result)}
    ${logFeedback("usage")}
    ${!logResults.usage.loading && !logResults.usage.error ? (result.items.length ? usageTable(result.items) : `<div class="empty-panel"><div><strong>没有匹配的调用记录</strong><p>调整筛选，或通过 Playground 发起一次已授权模型调用。</p></div></div>`) : ""}
    ${logPagination(result)}`;
}

function audit() {
  const config = logViews.audit;
  const result = currentLogResult("audit");
  return `<div class="section-head"><div><h2>安全审计</h2><p>控制面变更只记录操作者和动作，不记录供应商或应用密钥明文。</p></div></div>
    ${logControls("audit", result)}
    ${logFeedback("audit")}
    ${!logResults.audit.loading && !logResults.audit.error ? (result.items.length ? `<div class="table-wrap log-table-wrap"><table class="log-table"><thead><tr><th>时间</th><th>动作</th><th>操作者</th><th>事件 ID</th></tr></thead><tbody>${result.items.map((item) => `<tr><td data-label="时间">${formatTime(item.at)}</td><td data-label="动作">${esc(item.action)}</td><td data-label="操作者">${esc(item.actor)}</td><td data-label="事件 ID">${esc(item.id)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-panel"><div><strong>没有匹配的审计记录</strong><p>调整搜索词或动作筛选。</p></div></div>`) : ""}
    ${logPagination(result)}`;
}

const views = {
  overview: ["MODEL TRAFFIC CONTROL", "模型交通控制塔", overview],
  models: ["MODEL REGISTRY & ROUTING", "模型与路由", models],
  apps: ["APPLICATION GOVERNANCE", "应用与凭证", apps],
  playground: ["UNIFIED API WORKBENCH", "Playground", playground],
  usage: ["REQUEST METERING", "用量与成本", usage],
  audit: ["SECURITY & CHANGES", "安全审计", audit]
};

function render() {
  const listFocus = currentView === "models" ? captureListFocus(content) : null;
  clearPlayground();
  const view = views[currentView];
  eyebrow.textContent = view[0];
  title.textContent = view[1];
  content.innerHTML = view[2]();
  document.querySelectorAll(".nav-item").forEach(button => {
    const active = button.dataset.view === currentView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.title = `${view[1]} · LifeYouMe MaaS`;
  syncNavigation();
  bindContent();
  restoreListFocus(content, listFocus);
}

function modelRecord(modelId) {
  const model = state.logicalModels.find((item) => item.id === modelId);
  const deployment = model?.routes?.[0]
    ? state.deployments.find((item) => item.id === model.routes[0].deploymentId)
    : null;
  const provider = deployment
    ? state.providers.find((item) => item.id === deployment.providerId)
    : null;
  return { model, deployment, provider };
}

function openModelEditor(modelId = "") {
  modelDialog.setAttribute("aria-label", modelId ? "编辑模型" : "接入新模型");
  const generation = beginDialog();
  const { model, deployment, provider } = modelId ? modelRecord(modelId) : {};
  document.querySelector("#model-dialog-content").innerHTML = `
    <header><div><span class="eyebrow">${model ? "EDIT MODEL" : "CONNECT MODEL"}</span><h2>${model ? "编辑模型" : "接入新模型"}</h2></div><button class="icon-button" id="close-model-dialog" aria-label="关闭"><svg aria-hidden="true"><use href="#icon-close"/></svg></button></header>
    <p>配置模型别名、上游地址和供应商凭据。${model ? "留空 API Key 可保留原密钥。" : "首次接入需填写 API Key。"}保存配置不代表模型已通过推理验证。</p>
    <form id="model-form" class="model-form">
      <div class="form-grid">
        <label>模型名称<input id="model-name" value="${esc(model?.name || "")}" required placeholder="例如 DeepSeek Chat"></label>
        <label>逻辑模型 ID<input id="logical-model-id" value="${esc(model?.id || "")}" ${model ? "disabled" : ""} required placeholder="例如 lym-chat-deepseek"></label>
        <label>能力<select id="model-capability" aria-describedby="model-capability-help">${[
          ["chat", "Chat"],
          ["multimodal", "多模态"],
          ["embeddings", "Embeddings"],
          ["image.generation", "图像生成"],
          ["audio.speech", "语音合成"]
        ].map(([value, label]) => `<option value="${value}" ${model?.capability === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <div class="capability-help span-2" id="model-capability-help" role="status"></div>
        <label>Provider 名称<input id="model-provider-name" value="${esc(provider?.name || "")}" required placeholder="例如 DeepSeek"></label>
        <label class="span-2">Endpoint<input id="model-base-url" type="url" value="${esc(provider?.baseUrl || "")}" required placeholder="https://api.example.com/v1"><small class="field-help">填写协议根路径，不要包含具体模型接口。</small></label>
        <label>上游 Model ID<input id="model-upstream-id" value="${esc(deployment?.upstreamModel || "")}" required></label>
        <label>请求超时（毫秒）<input id="model-timeout" type="number" min="3000" max="120000" step="1000" value="${esc(deployment?.timeoutMs || 120000)}"></label>
        <label>Temperature<input id="model-temperature" type="number" min="0" max="2" step="0.1" value="${esc(deployment?.temperature ?? 0.7)}"></label>
        <label>API Key<input id="model-api-key" type="password" autocomplete="new-password" ${provider?.hasCredential ? `placeholder="已保存 ${esc(provider.credentialMasked)}；留空保持不变"` : "required"}></label>
      </div>
      <div class="form-error" id="model-form-error" role="alert"></div>
      <div class="form-actions"><button class="secondary-button" id="cancel-model" type="button">取消</button><button class="primary-button" type="submit">${model ? "保存修改" : "接入模型"}</button></div>
    </form>`;
  modelDialog.showModal();
  const form = document.querySelector("#model-form");
  const capabilityInput = form.querySelector("#model-capability");
  const capabilityHelp = form.querySelector("#model-capability-help");
  const saveButton = form.querySelector("[type=submit]");
  const currentGuide = () => integrationGuide({
    id: model?.id || form.querySelector("#logical-model-id").value,
    capability: capabilityInput.value
  }, location.origin);
  const updateCapabilityHelp = () => {
    const guide = currentGuide();
    capabilityHelp.textContent = guide.supported
      ? `${guide.note} 保存后还需在应用页授权模型、创建服务 Key，并测试实际调用。`
      : "当前选择仅支持注册和配置管理，尚未接入对应 MaaS 推理接口或工作台；保存后不能据此向业务提供调用。连接测试仅验证供应商认证，不验证此模型的推理能力。";
    capabilityHelp.dataset.supported = String(guide.supported);
    saveButton.textContent = model ? "保存修改" : guide.supported ? "接入模型" : "登记模型配置";
  };
  capabilityInput.addEventListener("change", updateCapabilityHelp);
  updateCapabilityHelp();
  const initialValues = [...form.elements].map(field => field.value).join("\u0000");
  const closeEditor = () => {
    const changed = [...form.elements].map(field => field.value).join("\u0000") !== initialValues;
    if (!changed || confirm("配置尚未保存，确定放弃修改吗？")) modelDialog.close();
  };
  document.querySelector("#close-model-dialog").addEventListener("click", closeEditor);
  document.querySelector("#cancel-model").addEventListener("click", closeEditor);
  modelDialog.oncancel = (event) => { event.preventDefault(); closeEditor(); };
  const idInput = document.querySelector("#logical-model-id");
  idInput.pattern = "[a-z0-9][a-z0-9._\\-]*";
  idInput.title = "使用小写字母、数字、点、下划线或连字符，且以字母或数字开头。";
  form.querySelectorAll("input").forEach(input => {
    const error = document.createElement("small");
    error.id = `${input.id}-error`;
    error.className = "field-error";
    input.parentElement.append(error);
    input.setAttribute("aria-describedby", error.id);
    const validate = () => {
      error.textContent = input.validity.valid ? "" : input.validationMessage;
      input.setAttribute("aria-invalid", String(!input.validity.valid));
    };
    input.addEventListener("blur", validate);
    input.addEventListener("invalid", validate);
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      if (input.getAttribute("aria-invalid") === "true") validate();
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.querySelector("#model-name").value,
      logicalModelId: document.querySelector("#logical-model-id").value,
      capability: document.querySelector("#model-capability").value,
      providerName: document.querySelector("#model-provider-name").value,
      baseUrl: document.querySelector("#model-base-url").value,
      upstreamModel: document.querySelector("#model-upstream-id").value,
      timeoutMs: Number(document.querySelector("#model-timeout").value),
      temperature: Number(document.querySelector("#model-temperature").value),
      apiKey: document.querySelector("#model-api-key").value
    };
    payload.enabled = model ? model.enabled : true;
    const inferenceSupported = currentGuide().supported;
    const button = event.currentTarget.querySelector("[type=submit]");
    button.disabled = true;
    button.textContent = "正在保存…";
    try {
      await api(model ? `/api/admin/models/${encodeURIComponent(model.id)}` : "/api/admin/models", {
        method: model ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      if (generation === dialogGeneration) modelDialog.close();
      await load();
      flash(inferenceSupported
        ? model ? "模型配置已更新。" : "新模型已接入。"
        : "模型配置已登记；该能力暂无 MaaS 推理接口，尚不能用于业务调用。", "success");
    } catch (error) {
      if (generation !== dialogGeneration || !form.isConnected) return;
      const messages = {
        model_id_already_exists: "此逻辑模型 ID 已存在，请换一个唯一 ID。",
        provider_credential_required: "首次接入需要 API Key，请填写供应商凭据。",
        invalid_provider_base_url: "Endpoint 必须是完整的 HTTP(S) 地址。",
        upstream_model_required: "请填写供应商的上游 Model ID。"
      };
      document.querySelector("#model-form-error").textContent = messages[error.message] || `保存失败：${error.message}。请检查配置后重试。`;
      button.disabled = false;
      updateCapabilityHelp();
    }
  });
}

function openModelDetails(modelId) {
  const generation = beginDialog();
  modelDialog.oncancel = null;
  const { model, deployment, provider } = modelRecord(modelId);
  if (!model) return;
  const guide = integrationGuide(model, location.origin);
  modelDialog.setAttribute("aria-label", `${model.name} · 模型详情`);
  document.querySelector("#model-dialog-content").innerHTML = `
    <header><div><span class="eyebrow">MODEL DETAILS</span><h2 id="model-detail-title">${esc(model.name)}</h2></div><button class="icon-button" id="close-model-dialog" aria-label="关闭"><svg aria-hidden="true"><use href="#icon-close"/></svg></button></header>
    <dl class="model-details">
      <div><dt>逻辑模型 ID</dt><dd>${esc(model.id)}</dd></div><div><dt>能力</dt><dd>${esc(model.capability)}</dd></div>
      <div><dt>Provider</dt><dd>${esc(provider?.name || "—")}</dd></div><div><dt>Endpoint</dt><dd>${esc(provider?.baseUrl || "—")}</dd></div>
      <div><dt>上游模型</dt><dd>${esc(deployment?.upstreamModel || "—")}</dd></div><div><dt>API Key</dt><dd id="detail-credential">${esc(provider?.credentialMasked || "内部凭据")}</dd></div>
      <div><dt>状态</dt><dd id="detail-health">${healthTag(model, deployment, provider)}</dd></div><div><dt>最近测试</dt><dd id="detail-test">${formatTime(deployment?.lastTestAt)}<br>${esc(deployment?.lastTestMessage || "尚未核验当前模型")}</dd></div>
    </dl>
    <p id="credential-feedback" role="status">供应商密钥默认脱敏，仅用于网关配置；业务调用请使用应用服务 Key。</p>
    <div class="form-actions">
      ${provider?.kind !== "internal" ? `<button class="secondary-button" data-test-model="${esc(model.id)}">测试连接</button><button class="secondary-button" data-reveal-model="${esc(model.id)}" ${provider?.hasCredential ? "" : "disabled"}>查看 API Key</button><button class="secondary-button" id="copy-model-credential" disabled>复制密钥</button><button class="secondary-button" id="hide-model-credential" hidden>隐藏密钥</button>` : `<button class="primary-button" data-tts-model="${esc(model.id)}">语音试听</button>`}
      ${model.managed ? "" : `<button class="primary-button" data-edit-model="${esc(model.id)}">编辑模型</button>`}
    </div>
    <section class="integration-guide" aria-label="业务接入说明">
      <h3>业务接入</h3>
      <p>${esc(guide.note)}</p>
      ${guide.supported ? `
        <ol><li>到“应用与凭证”给调用应用授权此逻辑模型。</li><li>创建应用服务 Key，保存到服务端 Secret，并设置环境变量 MAAS_SERVICE_KEY。</li><li>调用下方 MaaS 接口，使用逻辑模型 ID，不使用供应商 Endpoint 或上游 Key。</li></ol>
        <p><strong>POST ${esc(guide.path)}</strong>${model.enabled ? "" : " · 当前模型已停用，请先启用。"}</p>
        <details><summary>查看 cURL 调用示例</summary><pre id="integration-example">${esc(guide.curl)}</pre><button class="secondary-button" id="copy-integration-example">复制调用示例</button></details>
        <p id="integration-copy-feedback" role="status" aria-live="polite"></p>` : ""}
      <button class="secondary-button" id="open-integration-apps">前往应用与凭证</button>
    </section>`;
  modelDialog.showModal();
  document.querySelector("#close-model-dialog").addEventListener("click", () => modelDialog.close());
  document.querySelector("#hide-model-credential")?.addEventListener("click", () => hideCredential(modelId));
  document.querySelector("#copy-integration-example")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(guide.curl);
      if (generation === dialogGeneration && modelDialog.open) document.querySelector("#integration-copy-feedback").textContent = "示例已复制，请在服务端设置 MAAS_SERVICE_KEY 后执行。";
    } catch {
      if (generation === dialogGeneration && modelDialog.open) document.querySelector("#integration-copy-feedback").textContent = "复制未获允许，请选中示例手动复制。";
    }
  });
  document.querySelector("#open-integration-apps").onclick = () => {
    modelDialog.close();
    currentView = "apps";
    syncNavigation(true);
    render();
    document.querySelector("#main").focus();
  };
  document.querySelector("#copy-model-credential")?.addEventListener("click", async () => {
    if (!revealedCredential) return;
    const generation = dialogGeneration;
    try {
      await navigator.clipboard.writeText(revealedCredential);
      if (generation !== dialogGeneration) return;
      document.querySelector("#credential-feedback").textContent = "密钥已复制，请仅用于服务端配置。";
    } catch {
      if (generation !== dialogGeneration) return;
      document.querySelector("#credential-feedback").textContent = "浏览器未允许复制，请选择明文手动复制。";
    }
  });
  bindModelActions(modelDialog);
}

function hideCredential(modelId) {
  clearInterval(revealTimer);
  revealedCredential = "";
  const detail = document.querySelector("#detail-credential");
  if (detail) detail.textContent = modelRecord(modelId).provider?.credentialMasked || "已隐藏";
  const copy = document.querySelector("#copy-model-credential");
  if (copy) copy.disabled = true;
  const hide = document.querySelector("#hide-model-credential");
  if (hide) hide.hidden = true;
  const reveal = modelDialog.querySelector("[data-reveal-model]");
  if (reveal) reveal.disabled = false;
  const feedback = document.querySelector("#credential-feedback");
  if (feedback) feedback.textContent = "密钥已隐藏。";
}

modelDialog.addEventListener("close", () => {
  if (modelDialog.open) return;
  dialogGeneration += 1;
  clearInterval(revealTimer);
  revealedCredential = "";
  document.querySelector("#model-dialog-content").replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
});

function openTtsPreview() {
  modelDialog.setAttribute("aria-label", "中文语音试听");
  beginDialog();
  modelDialog.oncancel = null;
  document.querySelector("#model-dialog-content").innerHTML = `
    <header><div><span class="eyebrow">TTS PLAYGROUND</span><h2>中文语音试听</h2></div><button class="icon-button" id="close-model-dialog" aria-label="关闭"><svg aria-hidden="true"><use href="#icon-close"/></svg></button></header>
    <div class="tts-console"><div class="tts-fields">
      <label>音色<select id="tts-voice">${[0,1,2,3,4].map((voice) => `<option value="voice-${voice}" ${voice === 1 ? "selected" : ""}>voice-${voice}</option>`).join("")}</select></label>
      <label>语速<input id="tts-speed" type="number" min="0.5" max="2" step="0.1" value="1"></label>
      <label class="tts-text">测试文本<textarea id="tts-text" maxlength="500">你好，我是 LifeYouMe MaaS 的中文语音模型。</textarea></label>
    </div><div class="tts-actions"><button class="primary-button" id="tts-preview" type="button">生成并试听</button><span id="tts-status" role="status">请选择音色并输入测试文本。</span></div><audio id="tts-audio" controls hidden></audio></div>`;
  modelDialog.showModal();
  document.querySelector("#close-model-dialog").addEventListener("click", () => modelDialog.close());
  bindTtsPreview();
}

function bindTtsPreview() {
  document.querySelector("#tts-preview")?.addEventListener("click", async (event) => {
    const text = document.querySelector("#tts-text").value.trim();
    if (!text) return flash("请输入试听文本。");
    const button = event.currentTarget;
    const status = document.querySelector("#tts-status");
    const generation = dialogGeneration;
    button.disabled = true;
    button.textContent = "正在生成…";
    try {
      const response = await fetch("/api/admin/tts/preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text, voice: document.querySelector("#tts-voice").value, speed: Number(document.querySelector("#tts-speed").value) })
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error?.message || "语音生成失败");
      const audioBlob = await response.blob();
      if (generation !== dialogGeneration || !button.isConnected || !modelDialog.open) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(audioBlob);
      const audio = document.querySelector("#tts-audio");
      audio.src = previewUrl;
      audio.hidden = false;
      status.textContent = "语音已生成，可以播放。";
    } catch (error) {
      status.textContent = `生成失败：${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = "生成并试听";
    }
  });
}

function bindModelActions(root = document) {
  root.querySelectorAll("[data-view-model]").forEach((button) => button.addEventListener("click", () => openModelDetails(button.dataset.viewModel)));
  root.querySelectorAll("[data-edit-model]").forEach((button) => button.addEventListener("click", () => {
    if (modelDialog.open) modelDialog.close();
    openModelEditor(button.dataset.editModel);
  }));
  root.querySelectorAll("[data-test-model]").forEach((button) => button.addEventListener("click", async () => {
    const generation = dialogGeneration;
    button.disabled = true;
    const idle = button.textContent;
    button.textContent = "测试中…";
    try {
      const result = await api(`/api/admin/models/${encodeURIComponent(button.dataset.testModel)}/test`, { method: "POST", body: "{}" });
      await load();
      if (modelDialog.open && generation === dialogGeneration && modelDialog.contains(button)) {
        const { model, deployment, provider } = modelRecord(button.dataset.testModel);
        document.querySelector("#detail-health").innerHTML = healthTag(model, deployment, provider);
        document.querySelector("#detail-test").textContent = `${formatTime(deployment.lastTestAt)} · ${deployment.lastTestMessage}`;
      }
      flash(`核验结果（${result.latencyMs} ms）：${result.message}`);
    } catch (error) {
      flash(error.message);
    } finally {
      button.disabled = false;
      button.textContent = idle;
    }
  }));
  root.querySelectorAll("[data-reveal-model]").forEach((button) => button.addEventListener("click", async () => {
    if (!document.querySelector("#detail-credential")) {
      openModelDetails(button.dataset.revealModel);
      document.querySelector("#model-dialog [data-reveal-model]")?.click();
      return;
    }
    button.disabled = true;
    const generation = dialogGeneration;
    const detail = document.querySelector("#detail-credential");
    try {
      const result = await api(`/api/admin/models/${encodeURIComponent(button.dataset.revealModel)}/credential/reveal`, { method: "POST", body: "{}" });
      if (generation !== dialogGeneration || !detail?.isConnected || !modelDialog.open) return;
      detail.textContent = result.credential;
      revealedCredential = result.credential;
      document.querySelector("#copy-model-credential").disabled = false;
      document.querySelector("#hide-model-credential").hidden = false;
      let remaining = 30;
      const feedback = document.querySelector("#credential-feedback");
      feedback.textContent = `${remaining} 秒后自动隐藏密钥。`;
      clearInterval(revealTimer);
      revealTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) hideCredential(button.dataset.revealModel);
        else feedback.textContent = `${remaining} 秒后自动隐藏密钥。`;
      }, 1000);
    } catch (error) {
      flash(error.message);
      button.disabled = false;
    }
  }));
  root.querySelectorAll("[data-toggle-model]").forEach((button) => button.addEventListener("click", async () => {
    const enabled = button.dataset.enabled === "true";
    button.disabled = true;
    try {
      await api(`/api/admin/models/${encodeURIComponent(button.dataset.toggleModel)}/status`, {
        method: "PATCH", body: JSON.stringify({ enabled: !enabled })
      });
      await load();
      flash(enabled ? "模型已停用。" : "模型已启用。");
    } catch (error) {
      flash(`操作失败：${error.message}，请重试。`);
      button.disabled = false;
    }
  }));
  root.querySelectorAll("[data-delete-model]").forEach((button) => button.addEventListener("click", async () => {
    const record = modelRecord(button.dataset.deleteModel);
    if (!confirm(`确定删除“${record.model?.name}”吗？对应 Deployment 和独占 Provider 也会删除。`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/models/${encodeURIComponent(button.dataset.deleteModel)}`, { method: "DELETE" });
      await load();
      flash("模型已删除。");
    } catch (error) {
      flash(`删除失败：${error.message}，请重试。`);
      button.disabled = false;
    }
  }));
  root.querySelectorAll("[data-tts-model]").forEach((button) => button.addEventListener("click", () => {
    if (modelDialog.open) modelDialog.close();
    openTtsPreview();
  }));
}

function bindContent() {
  // Anonymous grid text items cannot receive min-width:0; wrap cell contents
  // so long IDs wrap inside the mobile card's value column.
  content.querySelectorAll(".log-table td").forEach(cell => {
    const value = document.createElement("span");
    value.className = "log-cell-value";
    value.append(...cell.childNodes);
    cell.append(value);
  });
  content.querySelectorAll("[data-usage-detail]").forEach(button =>
    button.addEventListener("click", () => openUsageDetail(button.dataset.usageDetail)));
  if (currentView === "usage" || currentView === "audit") {
    document.querySelector("#log-retry")?.addEventListener("click", () => { fetchLogPage(currentView, true); render(); });
    const config = logViews[currentView];
    document.querySelector("#log-search").oninput = (event) => {
      config.query = event.target.value;
      config.page = 1;
      render();
      const input = document.querySelector("#log-search");
      input.focus();
    };
    document.querySelector("#log-primary-filter").onchange = (event) => {
      config[currentView === "usage" ? "application" : "action"] = event.target.value;
      config.page = 1; render();
      document.querySelector("#log-primary-filter").focus();
    };
    const status = document.querySelector("#log-status-filter");
    if (status) status.onchange = (event) => {
      config.status = event.target.value; config.page = 1; render();
      document.querySelector("#log-status-filter").focus();
    };
    document.querySelector("#log-page-size").onchange = (event) => {
      config.pageSize = Number(event.target.value); config.page = 1; render();
      document.querySelector("#log-page-size").focus();
    };
    document.querySelector("#log-prev").onclick = () => { config.page -= 1; render(); };
    document.querySelector("#log-next").onclick = () => { config.page += 1; render(); };
    document.querySelector("#log-reset").onclick = () => {
      Object.assign(config, { query: "", application: "", action: "", status: "", page: 1 });
      render(); document.querySelector("#log-search").focus();
    };
  }
  document.querySelector("#create-model")?.addEventListener("click", () => openModelEditor());
  bindModelActions(content);
  if (bulkBusy) {
    content.querySelectorAll("#create-model, .row-actions button, .model-link").forEach(button => {
      button.disabled = true;
    });
  }
  const selectPage = document.querySelector("#select-page");
  if (selectPage) {
    const count = pageSelectableIds.filter(id => selectedModels.has(id)).length;
    selectPage.checked = count > 0 && count === pageSelectableIds.length;
    selectPage.indeterminate = count > 0 && count < pageSelectableIds.length;
    selectPage.addEventListener("change", event => {
      for (const id of pageSelectableIds) {
        if (event.currentTarget.checked) selectedModels.add(id);
        else selectedModels.delete(id);
      }
      render();
    });
  }
  content.querySelectorAll("[data-select-model]").forEach(input => input.addEventListener("change", () => {
    if (input.checked) selectedModels.add(input.dataset.selectModel);
    else selectedModels.delete(input.dataset.selectModel);
    render();
  }));
  document.querySelector("#clear-selection")?.addEventListener("click", () => {
    selectedModels.clear(); bulkMessage = ""; render();
  });
  content.querySelectorAll("[data-bulk-action]").forEach(button => button.addEventListener("click", async () => {
    if (bulkBusy || !selectedModels.size) return;
    const action = button.dataset.bulkAction;
    const label = { enable: "启用", disable: "停用", delete: "删除" }[action];
    const ids = [...selectedModels];
    const impact = action === "delete"
      ? "将删除对应部署、独占 Provider 和应用授权，删除后不能在界面撤销。"
      : action === "disable" ? "这些模型将停止接受新的业务调用。" : "这些模型将恢复接受已授权应用的调用。";
    if (!confirm(`确认${label}已选的 ${ids.length} 个模型？\n${impact}\n选择可能包含其他页或被筛选隐藏的模型。`)) return;
    bulkBusy = true;
    let succeeded = 0;
    const failed = [];
    bulkMessage = `正在${label} ${ids.length} 个模型…`;
    render();
    try {
      for (const id of ids) {
        try {
          await api(`/api/admin/models/${encodeURIComponent(id)}${action === "delete" ? "" : "/status"}`, {
            method: action === "delete" ? "DELETE" : "PATCH",
            ...(action === "delete" ? {} : { body: JSON.stringify({ enabled: action === "enable" }) })
          });
          succeeded += 1;
          selectedModels.delete(id);
        } catch (error) {
          failed.push(`${modelRecord(id).model?.name || id}：${error.message}`);
        }
        const message = document.querySelector("#bulk-message");
        if (message) message.textContent = `已处理 ${succeeded + failed.length} / ${ids.length}，成功 ${succeeded} 个。`;
      }
    } finally {
      bulkBusy = false;
      bulkMessage = `${label}完成：成功 ${succeeded} 个，失败 ${failed.length} 个。${failed.length ? `失败项已保留选择，可重试。${failed.join("；")}` : ""}`;
      await load();
      flash(`${label}完成：成功 ${succeeded} 个，失败 ${failed.length} 个。`, failed.length ? "error" : "success");
    }
  }));
  document.querySelector("#model-search")?.addEventListener("input", (event) => {
    modelQuery = event.currentTarget.value;
    modelPage = 1;
    clearTimeout(registrySearchTimer);
    registrySearchTimer = setTimeout(() => {
      if (currentView !== "models") return;
      const focused = document.activeElement?.id === "model-search";
      render();
      if (focused) document.querySelector("#model-search")?.focus();
    }, 180);
  });
  for (const [id, setter] of [
    ["capability-filter", (value) => { modelCapability = value; }],
    ["provider-filter", (value) => { modelProvider = value; }],
    ["status-filter", (value) => { modelStatus = value; }]
  ]) {
    document.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      setter(event.currentTarget.value);
      modelPage = 1;
      render();
    });
  }
  document.querySelector("#model-prev")?.addEventListener("click", () => { modelPage -= 1; render(); });
  document.querySelector("#model-next")?.addEventListener("click", () => { modelPage += 1; render(); });
  document.querySelector("#model-page-size")?.addEventListener("change", (event) => {
    modelPageSize = Number(event.currentTarget.value); modelPage = 1; render();
  });
  document.querySelector("#model-sort")?.addEventListener("change", (event) => {
    modelSort = event.currentTarget.value; modelPage = 1; render();
  });
  document.querySelector("#clear-model-filters")?.addEventListener("click", () => {
    modelQuery = ""; modelCapability = "all"; modelProvider = "all"; modelStatus = "all"; modelPage = 1; render();
  });
  document.querySelector("#reset-model-filters")?.addEventListener("click", () => {
    clearTimeout(registrySearchTimer);
    modelQuery = ""; modelCapability = "all"; modelProvider = "all"; modelStatus = "all"; modelPage = 1;
    render();
    document.querySelector("#model-search")?.focus();
  });
  const providerPayload = () => ({
    providerName: document.querySelector("#provider-name")?.value,
    baseUrl: document.querySelector("#provider-url")?.value,
    upstreamModel: document.querySelector("#upstream-model")?.value,
    apiKey: document.querySelector("#provider-key")?.value,
    timeoutMs: Number(document.querySelector("#provider-timeout")?.value),
    temperature: Number(document.querySelector("#provider-temperature")?.value)
  });
  const setButtonBusy = (button, busy, busyText, idleText) => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? busyText : idleText;
  };
  const validateProvider = () => {
    const payload = providerPayload();
    let valid = true;
    const showError = (id, message) => {
      const node = document.querySelector(`#${id}`);
      if (node) node.textContent = message;
      if (message) valid = false;
    };
    showError("provider-url-error", /^https?:\/\/[^/]+/i.test(payload.baseUrl || "") ? "" : "请输入完整的 HTTP(S) Endpoint。");
    showError("upstream-model-error", String(payload.upstreamModel || "").trim() ? "" : "请输入上游 Model ID。");
    const provider = state.providers.find((item) => item.id === "provider-ark");
    showError("provider-key-error", payload.apiKey || provider?.hasCredential ? "" : "首次配置必须填写 API Key。");
    return valid;
  };
  document.querySelector("#provider-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateProvider()) {
      event.currentTarget.querySelector(".field-error:not(:empty)")?.previousElementSibling?.focus();
      return;
    }
    const button = event.currentTarget.querySelector("button[type=submit]");
    setButtonBusy(button, true, "正在加密保存…", "保存并生效");
    try {
      await api("/api/admin/deployments/primary", {
        method: "PUT",
        body: JSON.stringify(providerPayload())
      });
      await load();
      flash("主 Deployment 已更新，新调用会立即使用当前配置。");
    } catch (error) {
      flash(error.message);
      setButtonBusy(button, false, "", "保存并生效");
    }
  });
  document.querySelector("#test-provider")?.addEventListener("click", async (event) => {
    if (!validateProvider()) return;
    const button = event.currentTarget;
    setButtonBusy(button, true, "正在测试…", "测试连接");
    const health = document.querySelector("#provider-health");
    health?.setAttribute("aria-busy", "true");
    try {
      const result = await api("/api/admin/providers/provider-ark/test", {
        method: "POST",
        body: JSON.stringify(providerPayload())
      });
      await load();
      flash(result.ok ? `连接成功，响应 ${result.latencyMs} ms。` : `连接失败：${result.message}`);
    } catch (error) {
      flash(`连接测试失败：${error.message}`);
      setButtonBusy(button, false, "", "测试连接");
      health?.setAttribute("aria-busy", "false");
    }
  });
  document.querySelector("#toggle-key-input")?.addEventListener("click", (event) => {
    const input = document.querySelector("#provider-key");
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.textContent = input.type === "password" ? "显示" : "隐藏";
    event.currentTarget.setAttribute("aria-label", `${input.type === "password" ? "显示" : "隐藏"}正在输入的 API Key`);
  });
  document.querySelector("#reveal-credential")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonBusy(button, true, "验证并读取…", "查看已保存密钥");
    try {
      const result = await api("/api/admin/providers/provider-ark/credential/reveal", { method: "POST", body: "{}" });
      const value = document.querySelector("#credential-value");
      const countdown = document.querySelector("#credential-countdown");
      const copy = document.querySelector("#copy-credential");
      value.textContent = result.credential;
      value.dataset.revealed = result.credential;
      copy.disabled = false;
      let seconds = 30;
      countdown.textContent = `${seconds} 秒后自动隐藏`;
      clearInterval(revealTimer);
      revealTimer = setInterval(() => {
        seconds -= 1;
        countdown.textContent = seconds > 0 ? `${seconds} 秒后自动隐藏` : "已自动隐藏";
        if (seconds <= 0) {
          clearInterval(revealTimer);
          value.textContent = state.providers.find((item) => item.id === "provider-ark")?.credentialMasked || "已保存";
          delete value.dataset.revealed;
          copy.disabled = true;
          setButtonBusy(button, false, "", "查看已保存密钥");
        }
      }, 1000);
    } catch (error) {
      flash(error.message);
      setButtonBusy(button, false, "", "查看已保存密钥");
    }
  });
  document.querySelector("#copy-credential")?.addEventListener("click", async () => {
    const credential = document.querySelector("#credential-value")?.dataset.revealed;
    if (!credential) return;
    await navigator.clipboard.writeText(credential);
    flash("已复制 Provider API Key；请勿粘贴到聊天或前端代码。");
  });
  document.querySelector("#tts-text")?.addEventListener("input", (event) => {
    document.querySelector("#tts-count").textContent = event.currentTarget.value.length;
  });
  document.querySelector("#tts-preview")?.addEventListener("click", async (event) => {
    const text = document.querySelector("#tts-text").value.trim();
    if (!text) return flash("请输入试听文本。");
    const button = event.currentTarget;
    const status = document.querySelector("#tts-status");
    setButtonBusy(button, true, "正在生成…", "生成并试听");
    status.textContent = "正在调用正式 TTS Runtime…";
    try {
      const response = await fetch("/api/admin/tts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: text,
          voice: document.querySelector("#tts-voice").value,
          speed: Number(document.querySelector("#tts-speed").value)
        })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error?.message || failure.error || "语音生成失败");
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(await response.blob());
      const audio = document.querySelector("#tts-audio");
      audio.src = previewUrl;
      audio.hidden = false;
      await audio.play().catch(() => {});
      status.textContent = `已生成 ${response.headers.get("x-lifeyoume-voice") || "语音"}，可在下方播放。`;
    } catch (error) {
      status.textContent = `生成失败：${error.message}`;
    } finally {
      setButtonBusy(button, false, "", "生成并试听");
    }
  });
  document.querySelectorAll("[data-edit-application]").forEach((button) =>
    button.addEventListener("click", () => openApplicationPermissions(button.dataset.editApplication)));
  document.querySelectorAll("[data-create-key]").forEach((button) =>
    button.addEventListener("click", () => openKeyCreator(button.dataset.createKey)));
  document.querySelectorAll("[data-revoke-key]").forEach((button) => button.addEventListener("click", async () => {
    const key = state.keys.find(item => item.id === button.dataset.revokeKey);
    if (!confirm(`确认撤销“${key?.name || "此服务 Key"}”？使用它的服务将无法继续调用，请先完成密钥替换。`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/keys/${encodeURIComponent(button.dataset.revokeKey)}`, { method: "DELETE" });
      await load();
      flash("服务 Key 已撤销，后续调用会立即被拒绝。");
    } catch (error) {
      flash(error.message);
      button.disabled = false;
    }
  }));
  document.querySelector("#play-mode")?.addEventListener("change", event => {
    playgroundMode = event.target.value;
    render();
    document.querySelector("#play-mode").focus();
  });
  if (currentView === "playground") {
    const visionOption = document.createElement("option");
    visionOption.value = "vision";
    visionOption.textContent = "Vision · 图片理解";
    visionOption.selected = playgroundMode === "vision";
    document.querySelector("#play-mode").append(visionOption);
    if (playgroundMode === "vision") {
      document.querySelector("#play-message").value = "请描述图片中的内容。";
      document.querySelector("#play-message").maxLength = 100000;
    }
    const images = document.createElement("div");
    images.id = "play-images";
    images.className = "play-images";
    document.querySelector("#play-result").after(images);
    if (playgroundMode === "image") document.querySelector("#copy-play-answer").textContent = "复制摘要";
  }
  const resetPlayResult = () => {
    clearPlayground();
    document.querySelector("#play-result").textContent = "等待请求…";
    document.querySelector("#play-json").textContent = "";
    document.querySelector("#play-metadata").textContent = "";
    document.querySelector("#play-metadata").hidden = true;
    document.querySelector("#play-copy-feedback").textContent = "";
    const raw = document.querySelector("#play-raw-response");
    raw.hidden = true;
    raw.open = false;
    document.querySelector("#copy-play-answer").disabled = true;
    const audio = document.querySelector("#play-audio");
    audio.hidden = true;
    audio.removeAttribute("src");
    const download = document.querySelector("#play-download");
    download.hidden = true;
    download.removeAttribute("href");
    const submit = document.querySelector("#playground-form [type=submit]");
    submit.disabled = document.querySelector("#play-model").disabled;
    submit.setAttribute("aria-busy", "false");
    submit.textContent = playgroundMode === "speech" ? "生成语音" : "发送请求";
  };
  document.querySelector("#clear-play-result")?.addEventListener("click", resetPlayResult);
  const updateSpeechVoice = () => {
    if (playgroundMode !== "speech") return;
    const { provider } = modelRecord(document.querySelector("#play-model").value);
    const internal = provider?.kind === "internal";
    document.querySelector("#play-voice-field").innerHTML = internal
      ? `<label>音色<select id="play-voice">${[0,1,2,3,4].map(v => `<option value="voice-${v}" ${v === 1 ? "selected" : ""}>voice-${v}</option>`).join("")}</select></label>`
      : `<label>供应商音色 ID<input id="play-voice" required maxlength="100" autocomplete="off" aria-describedby="play-speech-help" placeholder="填写供应商文档中的 voice ID"></label>`;
    document.querySelector("#play-speech-help").textContent = internal
      ? "托管中文 TTS：5 个音色，返回 WAV；排队满时请稍后重试。"
      : "外部 TTS：填写供应商真实音色 ID；需支持 OpenAI audio/speech 与 WAV。已登记模型不代表推理可用，请使用应用 Key 实测。";
  };
  if (currentView === "playground") updateSpeechVoice();
  document.querySelector("#play-model")?.addEventListener("change", () => {
    resetPlayResult();
    document.querySelector("#play-key").value = "";
    if (document.querySelector("#play-vision-urls")) document.querySelector("#play-vision-urls").value = "";
    updateSpeechVoice();
  });
  document.querySelector("#copy-play-answer")?.addEventListener("click", async () => {
    const output = document.querySelector("#play-result");
    const answer = output.textContent;
    const label = ["embeddings", "image"].includes(playgroundMode) ? "摘要" : "回答";
    try {
      await navigator.clipboard.writeText(answer);
      if (output.isConnected && output.textContent === answer) document.querySelector("#play-copy-feedback").textContent = `${label}已复制。`;
    } catch {
      if (output.isConnected && output.textContent === answer) document.querySelector("#play-copy-feedback").textContent = `复制未获允许，请选中${label}手动复制。`;
    }
  });
  document.querySelector("#playground-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = document.querySelector("#play-result");
    const button = event.currentTarget.querySelector("[type=submit]");
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "正在调用…";
    output.textContent = "正在调用…";
    const speech = playgroundMode === "speech";
    const vector = playgroundMode === "embeddings";
    const image = playgroundMode === "image";
    const vision = playgroundMode === "vision";
    document.querySelector("#copy-play-answer").disabled = true;
    document.querySelector("#play-json").textContent = "";
    document.querySelector("#play-raw-response").hidden = true;
    document.querySelector("#play-raw-response").open = false;
    document.querySelector("#play-metadata").hidden = true;
    document.querySelector("#play-copy-feedback").textContent = "";
    const text = document.querySelector("#play-message").value.trim();
    if (!text) {
      output.textContent = "请输入非空文本。";
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.textContent = speech ? "生成语音" : "发送请求";
      return;
    }
    clearPlayground();
    const controller = new AbortController();
    playgroundController = controller;
    const audio = document.querySelector("#play-audio");
    const download = document.querySelector("#play-download");
    audio.hidden = true;
    audio.removeAttribute("src");
    download.hidden = true;
    download.removeAttribute("href");
    const vectorInputs = vector ? text.split(/\r?\n/).map(value => value.trim()).filter(Boolean) : [];
    if (vector && (!vectorInputs.length || vectorInputs.length > 128)) {
      output.textContent = "请输入 1–128 条非空文本，每行一条。";
      playgroundController = null;
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.textContent = "发送请求";
      return;
    }
    const dimensions = vector ? document.querySelector("#play-dimensions").value : "";
    let visionPayload;
    if (vision) {
      try {
        visionPayload = visionRequest(document.querySelector("#play-model").value, text,
          document.querySelector("#play-vision-urls").value, document.querySelector("#play-vision-detail").value);
      } catch (error) {
        output.textContent = error.message;
        document.querySelector("#play-vision-urls").focus();
        playgroundController = null;
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
        button.textContent = "发送请求";
        return;
      }
    }
    const payload = speech ? {
      model: document.querySelector("#play-model").value,
      input: text, voice: document.querySelector("#play-voice").value,
      speed: Number(document.querySelector("#play-speed").value), response_format: "wav"
    } : image ? {
      model: document.querySelector("#play-model").value, prompt: text,
      n: Number(document.querySelector("#play-image-count").value),
      response_format: document.querySelector("#play-image-format").value,
      ...(document.querySelector("#play-image-size").value ? { size: document.querySelector("#play-image-size").value } : {})
    } : vector ? {
      model: document.querySelector("#play-model").value, input: vectorInputs, encoding_format: "float",
      ...(dimensions ? { dimensions: Number(dimensions) } : {})
    } : vision ? visionPayload : {
      model: document.querySelector("#play-model").value,
      messages: [{ role: "user", content: text }], stream: false
    };
    const key = document.querySelector("#play-key").value;
    document.querySelector("#play-key").value = "";
    try {
      const response = await fetch(speech ? "/v1/audio/speech" : vector ? "/v1/embeddings" : image ? "/v1/images/generations" : "/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status} · ${failure.error?.message || failure.error || "调用失败"}`);
      }
      if (speech) {
        if (!response.headers.get("content-type")?.includes("audio/")) throw new Error("网关未返回音频，请检查登录状态和路由。");
        const blob = await response.blob();
        if (controller !== playgroundController || !output.isConnected) return;
        playgroundAudioUrl = URL.createObjectURL(blob);
        audio.src = playgroundAudioUrl;
        audio.hidden = false;
        download.href = playgroundAudioUrl;
        download.hidden = false;
        output.textContent = `HTTP 200 · WAV ${blob.size} 字节\n音色：${response.headers.get("x-lifeyoume-voice") || payload.voice}\n请求 ID：${response.headers.get("x-lifeyoume-request-id") || "未返回"}\n语音已生成，请点击播放或下载。`;
      } else {
        const result = await response.json();
        if (controller !== playgroundController || !output.isConnected) return;
        if (image) cleanupImages = renderImageResults(document.querySelector("#play-images"), result);
        output.textContent = image ? `生成完成 · 返回 ${result.data?.length ?? 0} 张图片。\n请检查图片内容与质量；生成成功不代表内容适合发布。` : vector
          ? `向量化完成\n向量数量：${result.data?.length ?? 0}\n向量维度：${result.data?.[0]?.embedding?.length ?? 0}\n输入 Token：${result.usage?.prompt_tokens ?? "未返回"}\n展开原始响应查看完整向量。向量长度不代表检索质量。`
          : chatAnswer(result);
        document.querySelector("#copy-play-answer").disabled = false;
        document.querySelector("#play-json").textContent = JSON.stringify(result, null, 2);
        document.querySelector("#play-raw-response").hidden = false;
        const metadata = document.querySelector("#play-metadata");
        metadata.textContent = `HTTP ${response.status} · 模型：${result.model || payload.model} · 延迟：${result.maas?.latencyMs ?? "未返回"} ms · 请求 ID：${result.maas?.requestId || response.headers.get("x-lifeyoume-request-id") || "未返回"}`;
        metadata.hidden = false;
      }
    } catch (error) {
      if (controller === playgroundController && output.isConnected) output.textContent = `调用失败：${error.message}\n401：检查服务 Key；403：检查应用模型授权；429：稍后重试。`;
    } finally {
      if (controller === playgroundController && button.isConnected) {
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
        button.textContent = speech ? "生成语音" : "发送请求";
      }
    }
  });
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  if (!state) return;
  if (button.dataset.view === currentView) {
    mobileNavigation.close(true);
    return;
  }
  clearTimeout(registrySearchTimer);
  currentView = button.dataset.view;
  syncNavigation(true);
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
  mobileNavigation.close();
  render();
  document.querySelector("#main").focus();
}));
function restoreHistory() {
  if (location.hash === "#main") return;
  clearTimeout(registrySearchTimer);
  if (modelDialog.open) modelDialog.close();
  restoreNavigation();
  if (state) render();
  mobileNavigation.close(true);
}
window.addEventListener("popstate", restoreHistory);
window.addEventListener("hashchange", restoreHistory);
document.querySelector("#refresh").addEventListener("click", () => load(true));
document.querySelector("#copy-key").addEventListener("click", async () => {
  const value = document.querySelector("#created-key").textContent;
  if (!value || !dialog.open) return;
  try {
    await navigator.clipboard.writeText(value);
    if (dialog.open && document.querySelector("#created-key").textContent === value) {
      document.querySelector("#key-copy-status").textContent = "已复制。请保存到服务端 Secret，再勾选下方确认。";
    }
  } catch {
    if (dialog.open && document.querySelector("#created-key").textContent === value) {
      document.querySelector("#key-copy-status").textContent = "浏览器未允许复制，请选中密钥手动复制，然后确认已保存。";
    }
  }
});
document.querySelector("#key-saved").onchange = (event) => { createdKeySaved = event.target.checked; };
const closeCreatedKey = () => {
  if (createdKeySaved || confirm("尚未确认保存。关闭后无法再次查看此密钥；若丢失，需要撤销后重新创建。确认关闭？")) dialog.close();
};
document.querySelector("#close-created-key").onclick = closeCreatedKey;
document.querySelector("#finish-key").onclick = closeCreatedKey;
dialog.oncancel = (event) => { event.preventDefault(); closeCreatedKey(); };
dialog.addEventListener("close", () => {
  document.querySelector("#created-key").textContent = "";
  document.querySelector("#key-context").textContent = "";
  document.querySelector("#key-copy-status").textContent = "";
  createdKeySaved = false;
});
load();
