const state = {
  tasks: [],
  settings: {},
  filter: "active",
  editingTaskId: null,
  collapsed: false
};

const elements = {
  activeCount: document.querySelector("#activeCount"),
  alwaysOnTopToggle: document.querySelector("#alwaysOnTopToggle"),
  clearCompleted: document.querySelector("#clearCompleted"),
  collapseButton: document.querySelector("#collapseButton"),
  collapsedSummary: document.querySelector("#collapsedSummary"),
  completedCount: document.querySelector("#completedCount"),
  dateTitle: document.querySelector("#dateTitle"),
  hideButton: document.querySelector("#hideButton"),
  launchAtLoginToggle: document.querySelector("#launchAtLoginToggle"),
  progressBar: document.querySelector("#progressBar"),
  progressPercent: document.querySelector("#progressPercent"),
  progressText: document.querySelector("#progressText"),
  quickAddForm: document.querySelector("#quickAddForm"),
  quickAddInput: document.querySelector("#quickAddInput"),
  quitButton: document.querySelector("#quitButton"),
  reminderSummary: document.querySelector("#reminderSummary"),
  remindersToggle: document.querySelector("#remindersToggle"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  taskDialog: document.querySelector("#taskDialog"),
  taskForm: document.querySelector("#taskForm"),
  taskList: document.querySelector("#taskList"),
  taskPriorityInput: document.querySelector("#taskPriorityInput"),
  taskTimeInput: document.querySelector("#taskTimeInput"),
  taskTitleInput: document.querySelector("#taskTitleInput"),
  titleToggle: document.querySelector("#titleToggle"),
  weekday: document.querySelector("#weekday")
};

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uid() {
  return crypto.randomUUID();
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function todayTasks() {
  return state.tasks.filter((task) => task.date === dateKey());
}

function saveTasks() {
  return window.dailyFocus.saveTasks(state.tasks);
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return b.createdAt - a.createdAt;
  });
}

function renderTask(task) {
  const meta = [
    task.time
      ? `<span class="time-badge"><i data-lucide="clock-3"></i>${escapeHtml(task.time)}</span>`
      : "",
    task.priority === "high"
      ? `<span class="priority-badge"><i data-lucide="pin"></i>置顶</span>`
      : ""
  ].join("");

  return `
    <article class="task-item ${task.completed ? "completed" : ""}" data-id="${task.id}">
      <button class="check-button" type="button" data-action="toggle" aria-label="${task.completed ? "标记为未完成" : "完成待办"}">
        <i data-lucide="check"></i>
      </button>
      <div class="task-copy" data-action="edit" tabindex="0" role="button" aria-label="编辑 ${escapeHtml(task.title)}">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="task-meta">${meta}</span>
      </div>
      <div class="task-actions">
        <button class="icon-button" type="button" data-action="edit" aria-label="编辑" title="编辑"><i data-lucide="pencil"></i></button>
        <button class="icon-button" type="button" data-action="delete" aria-label="删除" title="删除"><i data-lucide="trash-2"></i></button>
      </div>
    </article>`;
}

function render() {
  const tasks = todayTasks();
  const active = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  const visible = state.filter === "active" ? active : completed;
  const percent = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  elements.activeCount.textContent = active.length;
  elements.completedCount.textContent = completed.length;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressBar.value = percent;
  elements.collapsedSummary.textContent = active.length
    ? `${active.length} 项待完成`
    : tasks.length ? "今日已完成" : "今天还没有待办";
  elements.progressText.textContent = tasks.length
    ? completed.length === tasks.length
      ? "今天的事情都完成了"
      : `已完成 ${completed.length} 项，还剩 ${active.length} 项`
    : "今天还没有待办";
  elements.clearCompleted.classList.toggle("hidden", state.filter !== "completed" || !completed.length);
  elements.reminderSummary.querySelector("span").textContent = state.settings.remindersEnabled
    ? "智能提醒已开启"
    : "智能提醒已关闭";

  if (!visible.length) {
    const completedView = state.filter === "completed";
    elements.taskList.innerHTML = `
      <div class="empty-state">
        <span class="empty-mark"><i data-lucide="${completedView ? "archive" : "sun"}"></i></span>
        <strong>${completedView ? "还没有完成记录" : tasks.length ? "今天的事情都完成了" : "写下今天的第一件事"}</strong>
        <p>${completedView ? "完成的待办会留在这里" : "保持简单，一次专注一件"}</p>
      </div>`;
  } else {
    elements.taskList.innerHTML = sortTasks(visible).map(renderTask).join("");
  }

  lucide.createIcons();
}

function applyPaperColor(paperColor = "sage") {
  const allowedColors = ["sage", "sun", "rose", "sky", "snow"];
  const color = allowedColors.includes(paperColor) ? paperColor : "sage";
  document.documentElement.dataset.paper = color;
  document.querySelectorAll(".paper-swatch").forEach((swatch) => {
    const selected = swatch.dataset.paper === color;
    swatch.classList.toggle("selected", selected);
    swatch.setAttribute("aria-checked", String(selected));
  });
}

function applyDockPosition(dockPosition = "right") {
  const position = dockPosition === "left" ? "left" : "right";
  document.querySelectorAll(".corner-option").forEach((option) => {
    const selected = option.dataset.dock === position;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
}

function setCollapsedState(collapsed) {
  state.collapsed = collapsed;
  document.body.classList.toggle("is-collapsed", collapsed);
  elements.collapseButton.setAttribute("aria-label", collapsed ? "展开便笺" : "折叠便笺");
  elements.collapseButton.title = collapsed ? "展开便笺" : "折叠便笺";
  elements.collapseButton.innerHTML = `<i data-lucide="${collapsed ? "chevrons-up-down" : "chevrons-down-up"}"></i>`;
  lucide.createIcons();
}

async function toggleCollapse() {
  const collapsed = await window.dailyFocus.toggleCollapse();
  setCollapsedState(collapsed);
}

function setDateHeader() {
  const now = new Date();
  elements.weekday.textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
  elements.dateTitle.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric"
  }).format(now);
}

async function addTask(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;
  state.tasks.push({
    id: uid(),
    title: cleanTitle,
    date: dateKey(),
    time: "",
    priority: "normal",
    completed: false,
    createdAt: Date.now(),
    completedAt: null
  });
  elements.quickAddInput.value = "";
  state.filter = "active";
  updateFilterButtons();
  render();
  await saveTasks();
}

function openTaskDialog(task) {
  state.editingTaskId = task.id;
  elements.taskTitleInput.value = task.title;
  elements.taskTimeInput.value = task.time || "";
  elements.taskPriorityInput.checked = task.priority === "high";
  elements.taskDialog.showModal();
  elements.taskTitleInput.focus();
  elements.taskTitleInput.select();
}

function updateFilterButtons() {
  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });
}

async function updateSettings(changes) {
  state.settings = { ...state.settings, ...changes };
  render();
  await window.dailyFocus.updateSettings(changes);
}

elements.quickAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask(elements.quickAddInput.value);
});

elements.taskList.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-action]");
  const taskItem = event.target.closest(".task-item");
  if (!actionTarget || !taskItem) return;

  const task = state.tasks.find((candidate) => candidate.id === taskItem.dataset.id);
  if (!task) return;

  if (actionTarget.dataset.action === "toggle") {
    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;
    render();
    await saveTasks();
  } else if (actionTarget.dataset.action === "edit") {
    openTaskDialog(task);
  } else if (actionTarget.dataset.action === "delete") {
    state.tasks = state.tasks.filter((candidate) => candidate.id !== task.id);
    render();
    await saveTasks();
  }
});

elements.taskList.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".task-copy")) {
    event.preventDefault();
    event.target.click();
  }
});

elements.taskForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const task = state.tasks.find((candidate) => candidate.id === state.editingTaskId);
  const title = elements.taskTitleInput.value.trim();
  if (!task || !title) return;
  task.title = title;
  task.time = elements.taskTimeInput.value;
  task.priority = elements.taskPriorityInput.checked ? "high" : "normal";
  elements.taskDialog.close();
  render();
  await saveTasks();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    updateFilterButtons();
    render();
  });
});

elements.clearCompleted.addEventListener("click", async () => {
  state.tasks = state.tasks.filter((task) => task.date !== dateKey() || !task.completed);
  render();
  await saveTasks();
});

elements.hideButton.addEventListener("click", () => window.dailyFocus.hide());
elements.collapseButton.addEventListener("click", toggleCollapse);
elements.titleToggle.addEventListener("click", () => {
  if (state.collapsed) toggleCollapse();
});
elements.titleToggle.addEventListener("dblclick", () => {
  if (!state.collapsed) toggleCollapse();
});
elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());
elements.reminderSummary.addEventListener("click", () => elements.settingsDialog.showModal());
elements.quitButton.addEventListener("click", () => window.dailyFocus.quit());
elements.remindersToggle.addEventListener("change", () => updateSettings({ remindersEnabled: elements.remindersToggle.checked }));
elements.alwaysOnTopToggle.addEventListener("change", () => updateSettings({ alwaysOnTop: elements.alwaysOnTopToggle.checked }));
elements.launchAtLoginToggle.addEventListener("change", () => updateSettings({ launchAtLogin: elements.launchAtLoginToggle.checked }));
document.querySelectorAll(".paper-swatch").forEach((swatch) => {
  swatch.addEventListener("click", async () => {
    const paperColor = swatch.dataset.paper;
    applyPaperColor(paperColor);
    await updateSettings({ paperColor });
  });
});
document.querySelectorAll(".corner-option").forEach((option) => {
  option.addEventListener("click", async () => {
    const dockPosition = option.dataset.dock;
    applyDockPosition(dockPosition);
    await updateSettings({ dockPosition });
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("dialog[open]")) window.dailyFocus.hide();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    elements.quickAddInput.focus();
  }
});

async function init() {
  const initial = await window.dailyFocus.getState();
  state.tasks = initial.tasks;
  state.settings = initial.settings;
  elements.remindersToggle.checked = state.settings.remindersEnabled;
  elements.alwaysOnTopToggle.checked = state.settings.alwaysOnTop;
  elements.launchAtLoginToggle.checked = state.settings.launchAtLogin;
  applyPaperColor(state.settings.paperColor);
  applyDockPosition(state.settings.dockPosition);
  setDateHeader();
  render();
  elements.quickAddInput.focus();
  window.dailyFocus.onFocusQuickAdd(() => elements.quickAddInput.focus());
  window.dailyFocus.onCollapsedChange(setCollapsedState);
}

init();
