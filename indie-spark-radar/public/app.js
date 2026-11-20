const state = {
  projects: [],
  categories: [],
  selectedId: null
};

const els = {
  count: document.querySelector("#project-count"),
  grid: document.querySelector("#projects"),
  category: document.querySelector("#category"),
  query: document.querySelector("#query"),
  angle: document.querySelector("#angle"),
  random: document.querySelector("#random-button"),
  insightTitle: document.querySelector("#insight-title"),
  insightEmpty: document.querySelector("#insight-empty"),
  insightResult: document.querySelector("#insight-result")
};

const basePath = window.location.pathname.split("/").slice(0, 2).join("/") || "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function projectTemplate(project) {
  const signals = project.signals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("");
  const stack = project.stack.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  return `
    <article class="project-card" data-id="${escapeHtml(project.id)}">
      <div class="card-top">
        <span class="badge">${escapeHtml(project.category)}</span>
        <span class="source">${escapeHtml(project.source)} · 难度 ${escapeHtml(project.difficulty)}</span>
      </div>
      <div>
        <h2>${escapeHtml(project.name)}</h2>
        <p>${escapeHtml(project.tagline)}</p>
      </div>
      <p>${escapeHtml(project.why)}</p>
      <div class="signal-row" aria-label="项目信号">${signals}</div>
      <div class="stack-row" aria-label="可能技术栈">${stack}</div>
      <div class="card-actions">
        <button class="button primary" type="button" data-action="insight" data-id="${escapeHtml(project.id)}">拆解灵感</button>
        <a class="button ghost" href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer">打开项目</a>
      </div>
    </article>
  `;
}

function renderProjects(projects) {
  els.count.textContent = String(projects.length);
  els.grid.innerHTML = projects.length
    ? projects.map(projectTemplate).join("")
    : `<p class="project-card">没有匹配项目，换个关键词试试。</p>`;
}

function renderCategories(categories) {
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.category.append(option);
  }
}

async function loadProjects() {
  const params = new URLSearchParams();
  if (els.query.value.trim()) params.set("q", els.query.value.trim());
  if (els.category.value) params.set("category", els.category.value);
  const response = await fetch(`${basePath}/api/projects?${params}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "load_failed");
  state.projects = payload.projects;
  state.categories = payload.categories;
  if (els.category.options.length === 1) renderCategories(payload.categories);
  renderProjects(payload.projects);
}

function insightTemplate(payload) {
  const { insight, project } = payload;
  const plan = insight.buildPlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const risks = insight.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `
    <span class="insight-source">${escapeHtml(insight.source)}</span>
    <h3>${escapeHtml(insight.title)}</h3>
    <p>${escapeHtml(insight.verdict)}</p>
    <h4>三天薄切片</h4>
    <ol>${plan}</ol>
    <h4>容易踩的坑</h4>
    <ul>${risks}</ul>
    <h4>变现/沉淀</h4>
    <p>${escapeHtml(insight.monetization)}</p>
    ${insight.error ? `<p class="error-note">模型调用失败，已使用本地降级：${escapeHtml(insight.error)}</p>` : ""}
    <p><a class="text-link" href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer">查看原项目</a></p>
  `;
}

async function requestInsight(id) {
  state.selectedId = id;
  const project = state.projects.find((item) => item.id === id);
  els.insightTitle.textContent = project ? `正在拆：${project.name}` : "正在拆解";
  els.insightEmpty.hidden = true;
  els.insightResult.hidden = false;
  els.insightResult.innerHTML = "<p>正在请 MaaS 生成点评……</p>";
  try {
    const response = await fetch(`${basePath}/api/insight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, userAngle: els.angle.value.trim() })
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "insight_failed");
    els.insightTitle.textContent = payload.project.name;
    els.insightResult.innerHTML = insightTemplate(payload);
  } catch (error) {
    els.insightResult.innerHTML = `<p class="error-note">拆解失败：${escapeHtml(error.message)}</p>`;
  }
}

function debounce(fn, delay = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

els.grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='insight']");
  if (!button) return;
  requestInsight(button.dataset.id);
});

els.random.addEventListener("click", () => {
  if (!state.projects.length) return;
  const project = state.projects[Math.floor(Math.random() * state.projects.length)];
  document.querySelector(`[data-id="${CSS.escape(project.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  requestInsight(project.id);
});

els.query.addEventListener("input", debounce(loadProjects));
els.category.addEventListener("change", loadProjects);
els.angle.addEventListener("change", () => {
  if (state.selectedId) requestInsight(state.selectedId);
});

loadProjects().catch((error) => {
  els.grid.innerHTML = `<p class="project-card error-note">加载失败：${escapeHtml(error.message)}</p>`;
});
