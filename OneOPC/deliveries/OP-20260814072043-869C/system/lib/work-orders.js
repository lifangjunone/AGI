const REQUIRED_FIELDS = [
  "title",
  "deviceName",
  "deviceCode",
  "site",
  "priority",
  "description"
];

const PRIORITIES = ["低", "中", "高", "紧急"];
const STATUS_FLOW = {
  待接单: "处理中",
  处理中: "已完成",
  已完成: "已关闭"
};

function normalize(value) {
  return String(value || "").trim();
}

function validateOrder(input) {
  const missing = REQUIRED_FIELDS.filter((field) => !normalize(input[field]));
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  if (!PRIORITIES.includes(input.priority)) {
    return { valid: false, missing: [], invalid: ["priority"] };
  }
  return { valid: true, missing: [], invalid: [] };
}

function nextOrderNumber(orders, now = new Date()) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("");
  const prefix = `WO-${date}-`;
  const max = orders
    .filter((order) => order.id.startsWith(prefix))
    .reduce((value, order) => {
      const sequence = Number(order.id.slice(prefix.length));
      return Number.isFinite(sequence) ? Math.max(value, sequence) : value;
    }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function createOrder(input, orders, now = new Date()) {
  const validation = validateOrder(input);
  if (!validation.valid) {
    const error = new Error("请完整填写所有必填信息");
    error.code = "VALIDATION_ERROR";
    error.details = validation;
    throw error;
  }

  return {
    id: nextOrderNumber(orders, now),
    title: normalize(input.title),
    deviceName: normalize(input.deviceName),
    deviceCode: normalize(input.deviceCode),
    site: normalize(input.site),
    priority: input.priority,
    status: "待接单",
    assignee: "",
    description: normalize(input.description),
    dueAt: normalize(input.dueAt),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function filterOrders(orders, filters = {}) {
  const query = normalize(filters.query).toLowerCase();
  return orders.filter((order) => {
    const matchesQuery =
      !query ||
      [order.id, order.title, order.deviceName, order.deviceCode].some((value) =>
        String(value).toLowerCase().includes(query)
      );
    const matchesStatus =
      !filters.status || filters.status === "全部" || order.status === filters.status;
    const matchesPriority =
      !filters.priority ||
      filters.priority === "全部" ||
      order.priority === filters.priority;
    return matchesQuery && matchesStatus && matchesPriority;
  });
}

function calculateStats(orders) {
  return {
    all: orders.length,
    pending: orders.filter((order) => order.status === "待接单").length,
    active: orders.filter((order) => order.status === "处理中").length,
    completed: orders.filter((order) => order.status === "已完成").length
  };
}

function transitionOrder(order, input, now = new Date()) {
  const nextStatus = STATUS_FLOW[order.status];
  if (!nextStatus) {
    const error = new Error("当前工单已关闭，不能继续流转");
    error.code = "INVALID_TRANSITION";
    throw error;
  }

  if (order.status === "待接单" && !normalize(input.assignee)) {
    const error = new Error("接单时必须填写负责人");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  return {
    ...order,
    status: nextStatus,
    assignee:
      order.status === "待接单" ? normalize(input.assignee) : order.assignee,
    updatedAt: now.toISOString()
  };
}

module.exports = {
  PRIORITIES,
  STATUS_FLOW,
  calculateStats,
  createOrder,
  filterOrders,
  nextOrderNumber,
  transitionOrder,
  validateOrder
};
