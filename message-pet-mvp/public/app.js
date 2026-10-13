const state = {
  data: null,
  filter: "all",
  view: "inbox",
  knownMessageIds: new Set(),
  refreshTimer: null,
  completedTodos: new Set(JSON.parse(localStorage.getItem("message-pet-done") || "[]")),
  handledMessages: new Set(JSON.parse(localStorage.getItem("message-pet-handled") || "[]")),
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function lines(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectView(view) {
  const target = document.querySelector(`[data-view="${view}"]`);
  target?.click();
}

function applyDesktopMode(mode) {
  document.body.classList.add("desktop-runtime");
  document.body.classList.toggle("pet-mode", mode === "pet");
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function saveState() {
  localStorage.setItem("message-pet-done", JSON.stringify([...state.completedTodos]));
  localStorage.setItem("message-pet-handled", JSON.stringify([...state.handledMessages]));
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2200);
}

function visibleMessages() {
  let messages =
    state.view === "mentions"
      ? state.data.mentions
      : state.view === "inbox"
        ? state.data.important
        : state.data.messages;

  if (state.filter === "critical") {
    messages = messages.filter((message) => message.priority === "critical");
  } else if (["direct", "group"].includes(state.filter)) {
    messages = messages.filter((message) => message.channelType === state.filter);
  }
  return messages;
}

function renderMessages() {
  const list = $("#message-list");
  const messages = visibleMessages();
  list.innerHTML = messages.length
    ? messages
        .map((message) => {
          const handled = state.handledMessages.has(message.id);
          const badges = [
            `<span class="channel-badge">${message.channelType === "group" ? `群聊 · ${escapeHtml(message.group)}` : "个人私聊"}</span>`,
            ...message.reasons
              .slice(0, 2)
              .map((reason) => `<span class="reason-badge">${escapeHtml(reason)}</span>`),
          ].join("");
          return `
            <article class="message-item ${escapeHtml(message.priority)} ${handled ? "handled" : ""}">
              <div class="platform-icon ${escapeHtml(message.platform)}">${escapeHtml(message.platform.slice(0, 1))}</div>
              <div>
                <div class="message-meta"><strong>${escapeHtml(message.sender)}</strong>${badges}</div>
                <p class="message-content">${escapeHtml(message.content)}</p>
                <div class="message-actions">
                  <button data-action="open" data-id="${escapeHtml(message.id)}">进入会话</button>
                  <button data-action="todo" data-id="${escapeHtml(message.id)}">加入待办</button>
                  <button data-action="handled" data-id="${escapeHtml(message.id)}">${handled ? "已处理" : "标记已处理"}</button>
                </div>
              </div>
              <time class="message-time">${formatTime(message.timestamp)}</time>
            </article>`;
        })
        .join("")
    : `<div class="empty">这个分类里暂时没有消息</div>`;
}

function renderTodos() {
  const todos = state.data.todos;
  $("#todo-total").textContent = `${todos.length} 项`;
  $("#todo-list").innerHTML = todos.length
    ? todos
        .map((todo) => {
          const done = state.completedTodos.has(todo.id);
          return `
            <article class="todo-item ${done ? "done" : ""}">
              <button class="todo-check" data-todo="${escapeHtml(todo.id)}">${done ? "✓" : ""}</button>
              <div>
                <p class="todo-title">${escapeHtml(todo.title)}</p>
                <div class="todo-meta">
                  <span class="${todo.priority === "critical" ? "due-critical" : ""}">${escapeHtml(todo.due)}</span>
                  <span>·</span><span>${escapeHtml(todo.source)}</span>
                </div>
              </div>
            </article>`;
        })
        .join("")
    : `<div class="empty">今天没有待办</div>`;
}

function render() {
  const { summary } = state.data;
  $("#nav-count").textContent = summary.important;
  $("#metric-important").textContent = summary.important;
  $("#metric-mentions").textContent = summary.mentions;
  $("#metric-todos").textContent = summary.todoCount;
  $("#pet-headline").textContent =
    summary.mentions > 0 ? `有 ${summary.mentions} 条 @你 的消息需要优先看` : "目前没有紧急 @你";
  $("#pet-copy").textContent =
    summary.todoCount > 0
      ? `我已经整理出 ${summary.todoCount} 项待办，最紧急的排在前面。`
      : "今天的重要事项都处理完了。";
  $("#brief-note").textContent = `${summary.headline}。消息来自 ${summary.platforms.join("、")}，建议先处理红色标记事项。`;
  $("#mini-badge").textContent = summary.mentions || summary.important;
  const topMessage = state.data.important[0];
  if (topMessage) {
    $("#pet-alert-title").textContent = `${topMessage.sender} ${topMessage.mentionedMe ? "@了你" : "发来重要消息"}`;
    $("#pet-alert-detail").textContent = topMessage.content;
  }

  const titles = {
    inbox: "需要你关注",
    mentions: "群聊中提到我",
    todos: "待办关联消息",
    summary: "今天的全部消息",
  };
  $("#section-title").textContent = titles[state.view];
  $("#filters").style.visibility = state.view === "todos" ? "hidden" : "visible";
  renderMessages();
  renderTodos();
}

function renderSettings() {
  const preferences = state.data.preferences;
  $("#important-people").value = preferences.importantPeople.join("\n");
  $("#important-groups").value = preferences.importantGroups.join("\n");
  const feishu = state.data.integrations?.feishu;
  if (!feishu) return;
  $("#feishu-token-status").textContent = feishu.configured ? "已配置" : "未配置";
  $("#feishu-user-status").textContent = feishu.currentUserConfigured ? "已配置" : "未配置";
  $("#feishu-callback").textContent = feishu.callbackPath;
  $("#feishu-status").textContent = feishu.configured
    ? "事件验证已启用。飞书发送的新消息会进入统一消息引擎。"
    : "尚未配置飞书验证令牌，事件入口会拒绝外部请求。";
  $("#browser-pairing-code").textContent =
    state.data.integrations?.browserBridge?.pairingCode || "未生成";
}

async function saveSettings() {
  const response = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userName: state.data.preferences.userName,
      importantPeople: lines($("#important-people").value),
      importantGroups: lines($("#important-groups").value),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "保存失败");
  await refreshDashboard({ notify: false });
  renderSettings();
  toast("重要联系人和重要群规则已保存");
}

async function refreshDashboard({ notify = true } = {}) {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  if (!response.ok) throw new Error("无法加载消息数据");
  const nextData = await response.json();
  const newImportant = nextData.important.filter(
    (message) => !state.knownMessageIds.has(message.id),
  );
  state.data = nextData;
  nextData.messages.forEach((message) => state.knownMessageIds.add(message.id));
  render();
  if (state.view === "settings") renderSettings();

  if (notify && newImportant.length) {
    const message = newImportant[0];
    window.messagePetDesktop?.notify({
      title: `${message.group || message.sender} · ${message.mentionedMe ? "@了你" : "重要消息"}`,
      body: message.content,
      view: message.mentionedMe ? "mentions" : "inbox",
    });
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      state.filter = filter.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button === filter));
      renderMessages();
      return;
    }

    const nav = event.target.closest("[data-view]");
    if (nav) {
      state.view = nav.dataset.view;
      document.body.classList.toggle("settings-view", state.view === "settings");
      document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button === nav));
      render();
      if (state.view === "settings") renderSettings();
      return;
    }

    const jump = event.target.closest("[data-jump]");
    if (jump) {
      const target = document.querySelector(`[data-view="${jump.dataset.jump}"]`);
      target?.click();
      $(".messages-panel").scrollIntoView({ behavior: "smooth" });
      return;
    }

    const action = event.target.closest("[data-action]");
    if (action) {
      const message = state.data.messages.find((item) => item.id === action.dataset.id);
      if (action.dataset.action === "open") toast(`真实接入后将打开 ${message.platform} 对应会话`);
      if (action.dataset.action === "todo") toast("已加入今日待办");
      if (action.dataset.action === "handled") {
        state.handledMessages.add(message.id);
        saveState();
        renderMessages();
        toast("消息已标记为处理");
      }
      return;
    }

    const todo = event.target.closest("[data-todo]");
    if (todo) {
      state.completedTodos.has(todo.dataset.todo)
        ? state.completedTodos.delete(todo.dataset.todo)
        : state.completedTodos.add(todo.dataset.todo);
      saveState();
      renderTodos();
    }
  });

  $("#simulate-button").addEventListener("click", () => {
    $("#alert-bubble").textContent = "1";
    toast("模拟收到：飞书「核心项目群」有人 @你");
    window.messagePetDesktop?.notify({
      title: "核心项目群 · 张总 @了你",
      body: "线上支付异常，请今天 16:00 前确认影响范围并回复。",
      view: "mentions",
    });
  });
  $("#add-todo").addEventListener("click", () => toast("MVP 下一版将支持手动添加和自然语言录入"));
  $("#mini-pet").addEventListener("dblclick", () => window.messagePetDesktop?.expand("inbox"));
  $("#pet-alert-card").addEventListener("click", () => window.messagePetDesktop?.expand("mentions"));
  $("#pet-hide").addEventListener("click", () => window.messagePetDesktop?.hide());
  $("#collapse-button").addEventListener("click", () => window.messagePetDesktop?.collapse());
  $("#save-settings").addEventListener("click", () => {
    saveSettings().catch((error) => toast(error.message));
  });
  $("#copy-pairing-code").addEventListener("click", async () => {
    const pairingCode = state.data.integrations?.browserBridge?.pairingCode;
    if (!pairingCode) return toast("配对码尚未生成");
    await navigator.clipboard.writeText(pairingCode);
    toast("浏览器伴侣配对码已复制");
  });
}

async function init() {
  await refreshDashboard({ notify: false });
  const now = new Date();
  $("#date-label").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  if (window.messagePetDesktop) {
    applyDesktopMode("pet");
    window.messagePetDesktop.onModeChange(applyDesktopMode);
    window.messagePetDesktop.onNavigate(selectView);
  }
  bindEvents();
  render();
  state.refreshTimer = window.setInterval(
    () => refreshDashboard().catch(() => {}),
    10_000,
  );
}

init().catch((error) => {
  $("#message-list").innerHTML = `<div class="empty">${error.message}</div>`;
});
