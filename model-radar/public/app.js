const state = {
  snapshot: null,
  type: "全部",
  provider: "全部",
  query: "",
  limit: 20
};

const basePath = window.location.pathname.startsWith("/models") ? "/models" : "";

const elements = {
  hero: document.querySelector("#heroModel"),
  topRail: document.querySelector("#topRail"),
  list: document.querySelector("#modelList"),
  empty: document.querySelector("#emptyState"),
  typeFilters: document.querySelector("#typeFilters"),
  providerSelect: document.querySelector("#providerSelect"),
  search: document.querySelector("#searchInput"),
  refresh: document.querySelector("#refreshButton"),
  toast: document.querySelector("#toast"),
  comparison: document.querySelector("#topComparison"),
  resultCount: document.querySelector("#resultCount"),
  clearFilters: document.querySelector("#clearFilters"),
  showMore: document.querySelector("#showMoreButton")
};

function setText(target, value) {
  const node = typeof target === "string" ? document.querySelector(target) : target;
  if (node) node.textContent = value;
}

function setRefreshState(isLoading) {
  if (!elements.refresh) return;
  elements.refresh.disabled = isLoading;
  elements.refresh.toggleAttribute("aria-busy", isLoading);
  setText(elements.refresh.querySelector("span"), isLoading ? "更新中" : "更新数据");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function relativeTime(iso) {
  const delta = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(delta / 3_600_000));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function heatBar(heat) {
  return `<span class="heat-bar" style="--heat:${heat}%"><i></i></span>`;
}

function movementLabel(model, { compact = false } = {}) {
  const movement = model.movement;
  if (!movement) return "等待下一次小时快照";
  if (movement.isNew) return "新上榜";
  if (movement.rankDelta > 0) return `${compact ? "↑" : "上升 "}${movement.rankDelta} 名`;
  if (movement.rankDelta < 0) return `${compact ? "↓" : "下降 "}${Math.abs(movement.rankDelta)} 名`;
  return "排名不变";
}

function heatDeltaLabel(model) {
  if (!model.movement || model.movement.heatDelta == null) return "";
  const delta = model.movement.heatDelta;
  return delta === 0 ? "热度持平" : `热度 ${delta > 0 ? "+" : ""}${delta}`;
}

function renderHero(snapshot) {
  const models = snapshot.models;
  const first = models[0];
  if (!first || !elements.hero || !elements.topRail) return;
  const breakdown = first.scoreBreakdown || { momentum: 0, freshness: 0, adoption: 0 };
  const leaderLabel = snapshot.hasComparison
    ? `连续领跑 ${snapshot.leaderHours || 1} 小时`
    : "下一次更新后显示变化";
  const movement = first.movement ? movementLabel(first) : "首次建立基线";
  elements.hero.innerHTML = `
    <div>
      <div class="hero-meta">
        <span class="tag hot">热度 ${first.heat}</span>
        <span class="tag">${escapeHtml(first.type)}</span>
        <span class="tag">${escapeHtml(first.source)}</span>
      </div>
      <h2>${escapeHtml(first.name)}</h2>
      <p class="provider">${escapeHtml(first.provider)} · ${escapeHtml(first.summary)}</p>
      <div class="leader-movement">
        <strong>${escapeHtml(movement)}</strong>
        <span>${escapeHtml(heatDeltaLabel(first) || leaderLabel)}</span>
      </div>
    </div>
    <div>
      <div class="score-breakdown" aria-label="热度指数构成">
        <div><span>趋势动量</span>${heatBar(breakdown.momentum)}<strong>${breakdown.momentum}</strong></div>
        <div><span>发布新鲜度</span>${heatBar(breakdown.freshness)}<strong>${breakdown.freshness}</strong></div>
        <div><span>社区采用</span>${heatBar(breakdown.adoption)}<strong>${breakdown.adoption}</strong></div>
      </div>
      <div class="heat-row"><span>热度指数 · 非能力评分</span>${heatBar(first.heat)}<strong>${first.heat}/100</strong></div>
      <a class="open-model" href="${escapeHtml(first.url)}" target="_blank" rel="noreferrer" aria-label="查看 ${escapeHtml(first.name)} 模型，将在新窗口打开">查看模型 ↗</a>
    </div>`;

  elements.topRail.innerHTML = models.slice(1, 3).map((model) => `
    <a class="runner" href="${escapeHtml(model.url)}" target="_blank" rel="noreferrer" aria-label="第 ${model.rank} 名 ${escapeHtml(model.name)}，将在新窗口打开">
      <span class="rank">${String(model.rank).padStart(2, "0")}</span>
      <div>
        <h3>${escapeHtml(model.name)}</h3>
        <p>${escapeHtml(model.provider)} · ${escapeHtml(model.type)}</p>
        <div class="runner-signals"><span>热度 ${model.heat}</span><span>${escapeHtml(movementLabel(model, { compact: true }))}</span></div>
      </div>
    </a>`).join("");
}

function renderTypeFilters(target, models) {
  if (!target) return;
  const values = [...new Set(models.map((item) => item.type))];
  target.innerHTML = ["全部", ...values].map((value) => {
    const count = value === "全部" ? models.length : models.filter((model) => model.type === value).length;
    return `
    <button type="button" data-filter="${escapeHtml(value)}" aria-pressed="${state.type === value}">${escapeHtml(value)} <small>${count}</small></button>`;
  }).join("");
  target.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.filter;
      state.limit = 20;
      renderBoard();
      renderFilterStates();
      syncUrl();
    });
  });
}

function renderFilterStates() {
  elements.typeFilters?.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.type));
  });
  if (elements.providerSelect) elements.providerSelect.value = state.provider;
}

function visibleModels() {
  if (!state.snapshot) return [];
  const query = state.query.trim().toLowerCase();
  return state.snapshot.models.filter((model) => {
    const typeMatch = state.type === "全部" || model.type === state.type;
    const providerMatch = state.provider === "全部" || model.provider === state.provider;
    const queryMatch = !query || `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(query);
    return typeMatch && providerMatch && queryMatch;
  });
}

function renderBoard() {
  const models = visibleModels();
  const displayed = models.slice(0, state.limit);
  if (!elements.list) return;
  elements.list.classList.remove("is-updating");
  elements.list.innerHTML = displayed.map((model, visibleIndex) => `
    <a class="model-row${visibleIndex >= 10 ? " compact" : ""}" href="${escapeHtml(model.url)}" target="_blank" rel="noreferrer" aria-label="第 ${model.rank} 名 ${escapeHtml(model.name)}，热度 ${model.heat}，${escapeHtml(movementLabel(model))}，将在新窗口打开">
      <div class="model-identity">
        <span class="model-rank">${String(model.rank).padStart(2, "0")}</span>
        <div>
          <h3 title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</h3>
          <p class="desktop-source">${escapeHtml(model.source)} · ${escapeHtml(movementLabel(model, { compact: true }))}</p>
          <p class="mobile-meta">${escapeHtml(model.provider)} · ${escapeHtml(model.type)}</p>
        </div>
      </div>
      <div><span>${escapeHtml(model.provider)}</span><p class="cell-sub">${escapeHtml(model.id.split("/")[0])}</p></div>
      <span>${escapeHtml(model.type)}</span>
      <div class="heat-cell"><strong>${model.heat}</strong>${heatBar(model.heat)}</div>
      <time datetime="${model.createdAt}">${relativeTime(model.createdAt)}</time>
    </a>`).join("");
  if (elements.empty) {
    elements.empty.hidden = models.length > 0;
    elements.empty.classList.remove("is-error");
    setText(elements.empty.querySelector("strong"), "没有匹配的模型");
    setText(elements.empty.querySelector("p"), "换一个类型、厂商或搜索词再试。");
  }
  setText(elements.resultCount, `找到 ${models.length} 个模型${models.length > displayed.length ? ` · 当前显示前 ${displayed.length} 名` : ""}`);
  if (elements.clearFilters) elements.clearFilters.hidden = state.type === "全部" && state.provider === "全部" && !state.query;
  if (elements.showMore) {
    const remaining = models.length - displayed.length;
    elements.showMore.hidden = remaining <= 0;
    setText(elements.showMore, remaining > 0 ? `继续查看后 ${Math.min(20, remaining)} 名` : "");
  }
  requestAnimationFrame(() => elements.list.classList.add("is-updating"));
}

function renderComparison(models) {
  if (!elements.comparison) return;
  elements.comparison.innerHTML = models.slice(0, 10).map((model) => `
    <a href="${escapeHtml(model.url)}" target="_blank" rel="noreferrer" aria-label="第 ${model.rank} 名 ${escapeHtml(model.name)}，热度 ${model.heat}，将在新窗口打开">
      <span class="comparison-rank">${String(model.rank).padStart(2, "0")}</span>
      <strong title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</strong>
      ${heatBar(model.heat)}
      <b>${model.heat}</b>
      <small>${escapeHtml(movementLabel(model, { compact: true }))}</small>
    </a>`).join("");
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.type !== "全部") params.set("type", state.type);
  if (state.provider !== "全部") params.set("provider", state.provider);
  if (state.query) params.set("q", state.query);
  const query = params.toString();
  history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function restoreUrlState(models) {
  const params = new URLSearchParams(window.location.search);
  const types = new Set(models.map((model) => model.type));
  const providers = new Set(models.map((model) => model.provider));
  const type = params.get("type");
  const provider = params.get("provider");
  state.type = type && types.has(type) ? type : "全部";
  state.provider = provider && providers.has(provider) ? provider : "全部";
  state.query = params.get("q") || "";
  if (elements.search) elements.search.value = state.query;
}

function updateCountdown() {
  if (!state.snapshot) return;
  const remaining = Math.max(0, new Date(state.snapshot.nextUpdateAt).getTime() - Date.now());
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  setText("#countdown", `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function render(snapshot) {
  state.snapshot = snapshot;
  restoreUrlState(snapshot.models);
  setText("#updatedAt", `更新于 ${formatTime(snapshot.updatedAt)}${snapshot.stale ? " · 缓存数据" : ""}`);
  setText("#modelCount", snapshot.stats.models);
  setText("#providerCount", snapshot.stats.providers);
  setText("#typeCount", snapshot.stats.types);
  setText(".signal-center span", snapshot.stats.models);
  renderHero(snapshot);
  renderComparison(snapshot.models);
  renderTypeFilters(elements.typeFilters, snapshot.models);
  const providers = [...new Set(snapshot.models.map((item) => item.provider))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (elements.providerSelect) {
    elements.providerSelect.innerHTML = `<option value="全部">全部厂商（${providers.length}）</option>${providers.map((provider) => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`).join("")}`;
  }
  renderFilterStates();
  renderBoard();
  updateCountdown();
  if (snapshot.warnings?.length) showToast(`部分数据源暂不可用：${snapshot.warnings.join("；")}`);
}

async function load({ force = false } = {}) {
  setRefreshState(true);
  try {
    const response = await fetch(force ? `${basePath}/api/refresh` : `${basePath}/api/models`, { method: force ? "POST" : "GET" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "数据获取失败");
    render(payload);
    if (force) {
      setText("#updatedAt", `刚刚重印 · ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(payload.updatedAt))}`);
      showToast(`榜单已更新：${formatTime(payload.updatedAt)}`);
    }
  } catch (error) {
    console.error("模型榜单加载失败：", error);
    if (elements.list) elements.list.innerHTML = "";
    if (elements.empty) {
      elements.empty.hidden = false;
      elements.empty.classList.add("is-error");
      setText(elements.empty.querySelector("strong"), "模型信号暂时中断");
      setText(elements.empty.querySelector("p"), "数据暂时没有成功送达，请重新加载榜单。");
    }
    showToast("数据加载失败，请稍后重试");
  } finally {
    setRefreshState(false);
  }
}

elements.search?.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.limit = 20;
  renderBoard();
  syncUrl();
});
elements.providerSelect?.addEventListener("change", (event) => {
  state.provider = event.target.value;
  state.limit = 20;
  renderBoard();
  syncUrl();
});
elements.clearFilters?.addEventListener("click", () => {
  state.type = "全部";
  state.provider = "全部";
  state.query = "";
  state.limit = 20;
  if (elements.search) elements.search.value = "";
  renderFilterStates();
  renderBoard();
  syncUrl();
});
elements.showMore?.addEventListener("click", () => {
  state.limit += 20;
  renderBoard();
});
elements.refresh?.addEventListener("click", () => load({ force: true }));
elements.empty?.querySelector("[data-retry]")?.addEventListener("click", () => load());
window.setInterval(updateCountdown, 1000);
load();
