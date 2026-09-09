const prefix = location.pathname.startsWith("/video/") ? "/video" : "";
const api = (path) => `${prefix}${path}`;
const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const priceForm = document.querySelector("#price-form");
const saveState = document.querySelector("#save-state");
const ordersBody = document.querySelector("#orders-body");
const toast = document.querySelector("#toast");

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function request(path, options = {}) {
  const response = await fetch(api(path), {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

function renderOrders(orders) {
  if (!orders.length) {
    ordersBody.innerHTML = '<tr><td colspan="4">暂无订单</td></tr>';
    return;
  }
  ordersBody.innerHTML = orders.map((order) => {
    const statusClass = order.status === "TRADE_SUCCESS" || order.status === "TRADE_FINISHED" ? "status-paid" : "status-pending";
    return `<tr><td>${order.orderId}</td><td>¥${order.amount}</td><td class="${statusClass}">${order.status}</td><td>${new Date(order.createdAt).toLocaleString("zh-CN")}</td></tr>`;
  }).join("");
}

async function loadDashboard() {
  const [settings, orders] = await Promise.all([
    request("/api/admin/settings"),
    request("/api/admin/orders")
  ]);
  Object.entries(settings.prices).forEach(([key, value]) => {
    const input = priceForm.elements.namedItem(key);
    if (input) input.value = value;
  });
  renderOrders(orders.orders);
  loginPanel.hidden = true;
  dashboard.hidden = false;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const data = Object.fromEntries(new FormData(loginForm).entries());
  try {
    await request("/api/admin/login", { method: "POST", body: JSON.stringify(data) });
    await loadDashboard();
  } catch (error) {
    loginError.textContent = error.message || "登录失败";
  }
});

priceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveState.textContent = "保存中…";
  saveState.className = "save-state";
  const prices = Object.fromEntries(new FormData(priceForm).entries());
  try {
    const result = await request("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ prices }) });
    Object.entries(result.prices).forEach(([key, value]) => {
      const input = priceForm.elements.namedItem(key);
      if (input) input.value = value;
    });
    saveState.textContent = "已保存";
    saveState.className = "save-state is-ok";
    showToast("价格配置已更新");
  } catch (error) {
    saveState.textContent = error.message || "保存失败";
    saveState.className = "save-state is-error";
  }
});

document.querySelector("#refresh-orders").addEventListener("click", async () => {
  try {
    const result = await request("/api/admin/orders");
    renderOrders(result.orders);
    showToast("订单已刷新");
  } catch (error) {
    showToast(error.message || "刷新失败", true);
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST" }).catch(() => {});
  dashboard.hidden = true;
  loginPanel.hidden = false;
  loginForm.reset();
});

loadDashboard().catch(() => {});
