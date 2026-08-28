const { test, expect } = require("@playwright/test");

test.describe.serial("设备检修工单核心流程", () => {
  let createdOrderId;

  test("REQ-WO-001 BR-WO-001 TC-WO-001 E2E-WO-001 列表完整展示核心字段", async ({
    page
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "设备检修工单" })).toBeVisible();
    for (const heading of [
      "工单编号 / 标题",
      "设备",
      "站点",
      "优先级",
      "状态",
      "负责人",
      "截止时间"
    ]) {
      await expect(page.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    await expect(page.locator("[data-order-id]").first()).toBeVisible();
  });

  test("REQ-WO-002 BR-WO-002 TC-WO-002 E2E-WO-002 按设备关键词查询", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByPlaceholder("工单编号、标题或设备").fill("PUMP-CW-001");
    await expect(page.locator("[data-order-id]")).toHaveCount(1);
    await expect(page.getByText("冷却泵异常振动")).toBeVisible();
  });

  test("REQ-WO-003 BR-WO-003 TC-WO-003 E2E-WO-003 状态和优先级组合筛选", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByLabel("状态").selectOption("处理中");
    await page.locator("#priorityFilter").selectOption("高");
    await expect(page.locator("[data-order-id]")).toHaveCount(1);
    await expect(page.getByText("输送带跑偏检查")).toBeVisible();
    await expect(page.getByText("冷却泵异常振动")).toBeHidden();
  });

  test("REQ-WO-004 BR-WO-004 TC-WO-004 E2E-WO-004 已关闭不计入已完成统计", async ({
    page
  }) => {
    await page.goto("/");
    await expect(page.locator("#statCompleted")).toHaveText("1");
    await page.getByLabel("状态").selectOption("已关闭");
    await expect(page.locator("[data-order-id]")).toHaveCount(1);
    await expect(page.locator("#statCompleted")).toHaveText("1");
  });

  test("REQ-WO-005 BR-WO-005 TC-WO-005 E2E-WO-005 必填为空阻止提交", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建工单" }).click();
    await page.getByRole("button", { name: "提交工单" }).click();
    await expect(page.getByRole("alert")).toContainText("请完整填写所有必填信息");
  });

  test("REQ-WO-006 BR-WO-006 TC-WO-006 E2E-WO-006 创建后默认值正确", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建工单" }).click();
    await page.getByLabel("工单标题").fill("空压机出口温度异常");
    await page.getByLabel("设备名称").fill("空压机 A");
    await page.getByLabel("设备编码").fill("AIR-A-001");
    await page.getByLabel("站点").fill("动力站");
    await page.locator('#orderForm select[name="priority"]').selectOption("紧急");
    await page.getByLabel("故障描述").fill("出口温度持续高于告警值，需要停机检查。");
    await page.getByRole("button", { name: "提交工单" }).click();
    const row = page
      .locator("[data-order-id]")
      .filter({ hasText: "空压机出口温度异常" })
      .first();
    await expect(row).toBeVisible();
    createdOrderId = await row.getAttribute("data-order-id");
    expect(createdOrderId).toMatch(/^WO-\d{8}-\d{4}$/);
    await expect(row.getByText("待接单")).toBeVisible();
    await expect(row.getByText("未分配")).toBeVisible();
  });

  test("REQ-WO-007 BR-WO-007 TC-WO-007 E2E-WO-007 查看摘要描述和负责人", async ({
    page
  }) => {
    await page.goto("/");
    await page.locator(`[data-order-id="${createdOrderId}"]`).click();
    await expect(page.getByRole("heading", { name: createdOrderId })).toBeVisible();
    await expect(page.getByText("出口温度持续高于告警值，需要停机检查。")).toBeVisible();
    await expect(page.locator("#detailOverlay").getByText("未分配")).toBeVisible();
  });

  test("REQ-WO-008 BR-WO-008 TC-WO-008 E2E-WO-008 接单到关闭状态流转", async ({
    page
  }) => {
    await page.goto("/");
    await page.locator(`[data-order-id="${createdOrderId}"]`).click();
    await page.getByPlaceholder("请输入负责人").fill("测试工程师");
    await page.getByRole("button", { name: "接单并开始处理" }).click();
    await expect(page.locator("#detailOverlay").getByText("处理中")).toBeVisible();
    await page.getByRole("button", { name: "标记为已完成" }).click();
    await expect(page.locator("#detailOverlay").getByText("已完成")).toBeVisible();
    await page.getByRole("button", { name: "关闭工单" }).click();
    await expect(page.locator("#detailOverlay").getByText("已关闭")).toBeVisible();
    await expect(page.getByText("处理工单")).toBeHidden();
  });
});
