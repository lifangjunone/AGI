const state = {
  orders: [],
  stats: { all: 0, pending: 0, active: 0, completed: 0 },
  filters: { query: "", status: "全部", priority: "全部" },
  selectedOrder: null
};

const elements = {
  tableBody: document.querySelector("#orderTableBody"),
  emptyResults: document.querySelector("#emptyResults"),
  resultCount: document.querySelector("#resultCount"),
  query: document.querySelector("#queryInput"),
  status: document.querySelector("#statusFilter"),
  priority: document.querySelector("#priorityFilter"),
  formOverlay: document.querySelector("#formOverlay"),
  detailOverlay: document.querySelector("#detailOverlay"),
  orderForm: document.querySelector("#orderForm"),
  formError: document.querySelector("#formError"),
  urgentNote: document.querySelector("#urgentNote"),
  detailContent: document.querySelector("#detailContent"),
  toast: document.querySelector("#toast")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function notify(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 1800);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || "请求失败");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function queryString() {
  const params = new URLSearchParams();
  if (state.filters.query) params.set("query", state.filters.query);
  if (state.filters.status !== "全部") params.set("status", state.filters.status);
  if (state.filters.priority !== "全部") {
    params.set("priority", state.filters.priority);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

async function loadOrders() {
  const payload = await request(`/api/work-orders${queryString()}`);
  state.orders = payload.items;
  state.stats = payload.stats;
  render();
}

function renderStats() {
  document.querySelector("#statAll").textContent = state.stats.all;
  document.querySelector("#statPending").textContent = state.stats.pending;
  document.querySelector("#statActive").textContent = state.stats.active;
  document.querySelector("#statCompleted").textContent = state.stats.completed;
  document.querySelectorAll("[data-stat-status]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.statStatus === state.filters.status
    );
  });
}

function renderTable() {
  elements.resultCount.textContent = `${state.orders.length} 条工单`;
  elements.emptyResults.hidden = state.orders.length !== 0;
  elements.tableBody.innerHTML = state.orders
    .map(
      (order) => `
        <tr data-order-id="${escapeHtml(order.id)}">
          <td class="order-primary">
            <b>${escapeHtml(order.title)}</b>
            <code>${escapeHtml(order.id)}</code>
          </td>
          <td class="device-cell">
            ${escapeHtml(order.deviceName)}
            <code>${escapeHtml(order.deviceCode)}</code>
          </td>
          <td>${escapeHtml(order.site)}</td>
          <td><span class="priority priority-${escapeHtml(order.priority)}">${escapeHtml(order.priority)}</span></td>
          <td><span class="status status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
          <td class="${order.assignee ? "" : "unassigned"}">${escapeHtml(order.assignee || "未分配")}</td>
          <td>${formatDate(order.dueAt)}</td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll("[data-order-id]").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.orderId));
  });
}

function render() {
  renderStats();
  renderTable();
}

function closeOverlay(name) {
  document.querySelector(`#${name}Overlay`).hidden = true;
}

function openForm() {
  elements.orderForm.reset();
  elements.formError.textContent = "";
  elements.urgentNote.hidden = true;
  elements.formOverlay.hidden = false;
  elements.orderForm.elements.title.focus();
}

function transitionCopy(status) {
  if (status === "待接单") return "接单并开始处理";
  if (status === "处理中") return "标记为已完成";
  if (status === "已完成") return "关闭工单";
  return "";
}

function renderDetail(order) {
  const canTransition = order.status !== "已关闭";
  const needsAssignee = order.status === "待接单";
  document.querySelector("#detailTitle").textContent = order.id;
  elements.detailContent.innerHTML = `
    <section class="detail-summary">
      <span class="status status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
      <h3>${escapeHtml(order.title)}</h3>
      <div>${escapeHtml(order.deviceName)} · ${escapeHtml(order.deviceCode)}</div>
    </section>
    <section class="detail-grid">
      <div class="detail-field"><span>站点</span><b>${escapeHtml(order.site)}</b></div>
      <div class="detail-field"><span>优先级</span><b>${escapeHtml(order.priority)}</b></div>
      <div class="detail-field"><span>负责人</span><b>${escapeHtml(order.assignee || "未分配")}</b></div>
      <div class="detail-field"><span>截止时间</span><b>${formatDate(order.dueAt)}</b></div>
      <div class="detail-field"><span>创建时间</span><b>${formatDate(order.createdAt)}</b></div>
      <div class="detail-field"><span>更新时间</span><b>${formatDate(order.updatedAt)}</b></div>
    </section>
    <section class="description-block">
      <span>故障描述</span>
      <p>${escapeHtml(order.description)}</p>
    </section>
    ${
      canTransition
        ? `
          <section class="transition-panel">
            <h3>处理工单</h3>
            <div class="transition-actions">
              ${
                needsAssignee
                  ? `<label><span>负责人 *</span><input id="assigneeInput" placeholder="请输入负责人" /></label>`
                  : ""
              }
              <button class="primary-button" id="transitionButton">${transitionCopy(order.status)}</button>
            </div>
            <div class="form-error" id="transitionError"></div>
          </section>
        `
        : ""
    }
  `;

  document.querySelector("#transitionButton")?.addEventListener("click", () => {
    transitionSelectedOrder();
  });
}

async function openDetail(id) {
  try {
    const payload = await request(`/api/work-orders/${encodeURIComponent(id)}`);
    state.selectedOrder = payload.item;
    renderDetail(state.selectedOrder);
    elements.detailOverlay.hidden = false;
  } catch (error) {
    notify(error.message);
  }
}

async function transitionSelectedOrder() {
  const errorElement = document.querySelector("#transitionError");
  const assignee = document.querySelector("#assigneeInput")?.value || "";
  try {
    const payload = await request(
      `/api/work-orders/${encodeURIComponent(state.selectedOrder.id)}/transition`,
      {
        method: "POST",
        body: JSON.stringify({ assignee })
      }
    );
    state.selectedOrder = payload.item;
    renderDetail(state.selectedOrder);
    await loadOrders();
    notify(`工单已更新为${payload.item.status}`);
  } catch (error) {
    errorElement.textContent = error.message;
  }
}

async function submitOrder(event) {
  event.preventDefault();
  elements.formError.textContent = "";
  const data = Object.fromEntries(new FormData(elements.orderForm));
  try {
    const payload = await request("/api/work-orders", {
      method: "POST",
      body: JSON.stringify(data)
    });
    closeOverlay("form");
    await loadOrders();
    notify(`工单 ${payload.item.id} 已创建`);
  } catch (error) {
    elements.formError.textContent = error.message;
  }
}

let searchTimer;
elements.query.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.filters.query = elements.query.value.trim();
    loadOrders();
  }, 180);
});

elements.status.addEventListener("change", () => {
  state.filters.status = elements.status.value;
  loadOrders();
});
elements.priority.addEventListener("change", () => {
  state.filters.priority = elements.priority.value;
  loadOrders();
});
document.querySelector("#resetFiltersButton").addEventListener("click", () => {
  state.filters = { query: "", status: "全部", priority: "全部" };
  elements.query.value = "";
  elements.status.value = "全部";
  elements.priority.value = "全部";
  loadOrders();
});
document.querySelectorAll("[data-stat-status]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filters.status = button.dataset.statStatus;
    elements.status.value = state.filters.status;
    loadOrders();
  });
});
document.querySelector("#newOrderButton").addEventListener("click", openForm);
elements.orderForm.addEventListener("submit", submitOrder);
elements.orderForm.elements.priority.addEventListener("change", () => {
  elements.urgentNote.hidden =
    elements.orderForm.elements.priority.value !== "紧急";
});
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => closeOverlay(button.dataset.close));
});
document.querySelectorAll(".overlay").forEach((overlay) => {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.hidden = true;
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    elements.formOverlay.hidden = true;
    elements.detailOverlay.hidden = true;
  }
});

loadOrders().catch((error) => notify(error.message));
