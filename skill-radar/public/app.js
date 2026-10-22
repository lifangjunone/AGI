const state = {
  data: null,
  category: "all",
  sort: "score",
  query: "",
  visible: 20,
};

const elements = {
  list: document.querySelector("#skill-list"),
  categories: document.querySelector("#categories"),
  search: document.querySelector("#search"),
  count: document.querySelector("#result-count"),
  empty: document.querySelector("#empty-state"),
  loadMore: document.querySelector("#load-more"),
  toast: document.querySelector("#toast"),
};

const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("zh-CN");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function categoryName(id) {
  return state.data.categories.find((category) => category.id === id)?.name || "通用与效率";
}

function currentSkills() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.data.skills.filter((skill) => {
    const categoryMatch = state.category === "all" || skill.category === state.category;
    const searchText = `${skill.name} ${skill.source} ${skill.description} ${categoryName(skill.category)}`.toLowerCase();
    return categoryMatch && (!query || searchText.includes(query));
  });
  return filtered.sort((a, b) => {
    if (state.sort === "growth") return b.trend - a.trend || b.weeklyLatest - a.weeklyLatest;
    if (state.sort === "official") return Number(b.official) - Number(a.official) || b.score - a.score;
    return b.score - a.score || b.installs - a.installs;
  });
}

function skillTemplate(skill, index) {
  const installWidth = Math.min(100, 18 + Math.log10(Math.max(skill.installs, 1)) * 14);
  const weeklyWidth = Math.min(100, 12 + Math.log10(Math.max(skill.weeklyLatest, 1)) * 17);
  const installBand = Math.max(1, Math.min(10, Math.round(installWidth / 10)));
  const weeklyBand = Math.max(1, Math.min(10, Math.round(weeklyWidth / 10)));
  const delayBand = Math.min(index, 8);
  const podiumClass = skill.rank <= 3 ? ` podium podium-${skill.rank}` : "";
  const podiumLabel = skill.rank <= 3 ? `<span class="podium-label">TOP ${skill.rank}</span>` : "";
  const trendLabel = skill.trend > 0 ? `↑ ${skill.trend}%` : skill.trend < 0 ? `↓ ${Math.abs(skill.trend)}%` : "— 持平";
  return `
    <li class="skill-row delay-${delayBand}${podiumClass}">
      <div class="skill-identity">
        <span class="rank" aria-label="第 ${skill.rank} 名">${String(skill.rank).padStart(2, "0")}</span>
        <div>
          <h3 class="skill-name">${escapeHtml(skill.name)}${podiumLabel}${skill.official ? '<span class="official-mark">官方</span>' : ""}</h3>
          <p class="skill-source">${escapeHtml(skill.source)} / ${escapeHtml(skill.slug)}</p>
        </div>
      </div>
      <div class="category-cell">${escapeHtml(categoryName(skill.category))}</div>
      <div class="evidence" aria-label="采用证据">
        <div class="evidence-line"><span>累计安装</span><span class="meter"><i class="width-${installBand}"></i></span><b>${compact.format(skill.installs)}</b></div>
        <div class="evidence-line"><span>本周安装</span><span class="meter"><i class="width-${weeklyBand}"></i></span><b>${compact.format(skill.weeklyLatest)}</b></div>
      </div>
      <div class="trend ${skill.trend > 15 ? "is-up" : ""}">${trendLabel}</div>
      <div class="actions">
        <button class="copy-button" type="button" data-command="${escapeHtml(skill.installCommand)}">复制安装</button>
        <a class="open-link" href="${escapeHtml(skill.url)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(skill.name)} 详情">↗</a>
      </div>
    </li>`;
}

function render() {
  const skills = currentSkills();
  const shown = skills.slice(0, state.visible);
  elements.list.innerHTML = shown.map(skillTemplate).join("");
  elements.list.setAttribute("aria-busy", "false");
  elements.count.textContent = `显示 ${number.format(shown.length)} / ${number.format(skills.length)} 个`;
  elements.empty.hidden = skills.length > 0;
  elements.loadMore.hidden = shown.length >= skills.length;
}

function renderCategories() {
  elements.categories.innerHTML = [
    { id: "all", name: "全部领域", count: state.data.skills.length },
    ...state.data.categories,
  ].map((category) => `
    <button class="category-button ${category.id === state.category ? "is-active" : ""}" type="button" data-category="${category.id}">
      <span>${escapeHtml(category.name)}</span><b>${String(category.count).padStart(2, "0")}</b>
    </button>`).join("");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

async function copyCommand(button) {
  try {
    await navigator.clipboard.writeText(button.dataset.command);
  } catch {
    const input = document.createElement("textarea");
    input.value = button.dataset.command;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  button.textContent = "已复制";
  button.classList.add("is-copied");
  showToast(`已复制：${button.dataset.command}`);
  setTimeout(() => {
    button.textContent = "复制安装";
    button.classList.remove("is-copied");
  }, 1800);
}

async function load() {
  try {
    const response = await fetch("/skills/data/skills.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    document.querySelector("#stat-skills").textContent = number.format(state.data.stats.skills);
    document.querySelector("#stat-sources").textContent = number.format(state.data.stats.sources);
    document.querySelector("#stat-official").textContent = number.format(state.data.stats.official);
    document.querySelector("#stat-categories").textContent = number.format(state.data.stats.categories);
    const leader = state.data.skills[0];
    document.querySelector("#top-skill-name").textContent = leader.name;
    document.querySelector("#top-skill-source").textContent =
      `${leader.source} · ${categoryName(leader.category)} · ${leader.official ? "官方发布" : "社区发布"}`;
    document.querySelector("#top-installs").textContent = compact.format(leader.installs);
    document.querySelector("#top-weekly").textContent = compact.format(leader.weeklyLatest);
    document.querySelector("#top-trend").textContent = `${leader.trend >= 0 ? "+" : ""}${leader.trend}%`;
    document.querySelector("#top-skill-link").href = leader.url;
    document.querySelector("#top-skill-link").target = "_blank";
    document.querySelector("#top-skill-link").rel = "noreferrer";
    document.querySelector("#method-summary").textContent = state.data.methodology.summary;
    document.querySelector("#edition").textContent =
      `DAILY INDEX · ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(state.data.collectedAt))}`;
    document.querySelector("#freshness").innerHTML =
      `<span class="status-dot"></span>${state.data.sourceStatus === "live" ? "今日已更新" : "使用最近快照"} · ${formatDate(state.data.collectedAt)}`;
    renderCategories();
    render();
  } catch (error) {
    elements.list.innerHTML = "";
    elements.empty.hidden = false;
    elements.empty.querySelector("h3").textContent = "数据暂时没有到达";
    elements.empty.querySelector("p").textContent = "页面本身可用，请稍后刷新查看最近一次公开数据快照。";
    elements.count.textContent = "加载失败";
    console.error(error);
  }
}

elements.categories.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  state.visible = 20;
  renderCategories();
  render();
});

document.querySelector(".sort-group").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort]");
  if (!button) return;
  state.sort = button.dataset.sort;
  state.visible = 20;
  document.querySelectorAll("[data-sort]").forEach((item) => item.classList.toggle("is-active", item === button));
  render();
});

elements.search.addEventListener("input", () => {
  state.query = elements.search.value;
  state.visible = 20;
  render();
});

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest(".copy-button");
  if (button) copyCommand(button);
});

elements.loadMore.addEventListener("click", () => {
  state.visible += 20;
  render();
});

document.querySelector("#clear-filters").addEventListener("click", () => {
  state.category = "all";
  state.query = "";
  state.visible = 20;
  elements.search.value = "";
  renderCategories();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.search) {
    event.preventDefault();
    elements.search.focus();
  }
});

load();
