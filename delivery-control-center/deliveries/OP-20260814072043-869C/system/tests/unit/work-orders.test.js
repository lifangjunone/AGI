const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateStats,
  createOrder,
  filterOrders,
  nextOrderNumber,
  transitionOrder,
  validateOrder
} = require("../../lib/work-orders");

const now = new Date("2026-08-14T10:00:00.000Z");
const validInput = {
  title: "空压机温度异常",
  deviceName: "空压机 A",
  deviceCode: "AIR-A-001",
  site: "动力站",
  priority: "高",
  description: "出口温度持续高于告警值",
  dueAt: "2026-08-14T18:00"
};

test("必填字段缺失时返回明确字段", () => {
  const result = validateOrder({ ...validInput, title: "", site: "" });
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ["title", "site"]);
});

test("同一日期编号按四位序号递增", () => {
  const orders = [{ id: "WO-20260814-0002" }, { id: "WO-20260813-0008" }];
  assert.equal(nextOrderNumber(orders, now), "WO-20260814-0003");
});

test("新建工单默认待接单且未分配", () => {
  const order = createOrder(validInput, [], now);
  assert.equal(order.id, "WO-20260814-0001");
  assert.equal(order.status, "待接单");
  assert.equal(order.assignee, "");
});

test("关键词、状态和优先级执行 AND 组合筛选", () => {
  const orders = [
    {
      id: "WO-1",
      title: "冷却泵异常",
      deviceName: "冷却泵 A",
      deviceCode: "P-1",
      status: "处理中",
      priority: "紧急"
    },
    {
      id: "WO-2",
      title: "冷却泵保养",
      deviceName: "冷却泵 B",
      deviceCode: "P-2",
      status: "已完成",
      priority: "紧急"
    }
  ];
  const result = filterOrders(orders, {
    query: "冷却泵",
    status: "处理中",
    priority: "紧急"
  });
  assert.deepEqual(result.map((order) => order.id), ["WO-1"]);
});

test("已关闭不计入已完成统计", () => {
  const stats = calculateStats([
    { status: "待接单" },
    { status: "处理中" },
    { status: "已完成" },
    { status: "已关闭" }
  ]);
  assert.deepEqual(stats, { all: 4, pending: 1, active: 1, completed: 1 });
});

test("接单必须填写负责人并进入处理中", () => {
  const order = { ...createOrder(validInput, [], now) };
  assert.throws(() => transitionOrder(order, {}, now), /必须填写负责人/);
  const updated = transitionOrder(order, { assignee: "陈工" }, now);
  assert.equal(updated.status, "处理中");
  assert.equal(updated.assignee, "陈工");
});

test("合法状态依次进入已完成和已关闭", () => {
  const active = { ...createOrder(validInput, [], now), status: "处理中", assignee: "陈工" };
  const completed = transitionOrder(active, {}, now);
  const closed = transitionOrder(completed, {}, now);
  assert.equal(completed.status, "已完成");
  assert.equal(closed.status, "已关闭");
  assert.throws(() => transitionOrder(closed, {}, now), /不能继续流转/);
});
