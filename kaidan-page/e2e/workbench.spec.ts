import { expect, test } from "@playwright/test";

test("desktop creator flow is complete and exportable", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "大厂产品经理简历诊断" }).first()).toBeVisible();
  await expect(page.getByText("可以开卖")).toBeVisible();
  await expect(page.getByText("¥1,930")).toBeVisible();

  await page.getByRole("button", { name: "2 报价方案" }).click();
  await page.getByLabel("价格").nth(1).fill("299");
  await page.getByRole("button", { name: "3 收入测算" }).click();
  await expect(page.locator(".money-grid .net-card strong")).toContainText("¥2,900");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出售卖页" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("售卖页.html");

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);

  await page.screenshot({
    path: "test-results/kaidan-desktop.png",
    fullPage: true,
  });
});

test("mobile layout and local draft persistence work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByText("免费计划")).toBeVisible();
  await page.getByRole("button", { name: "关闭导航" }).click();

  await page.getByRole("button", { name: "1 服务定位" }).click();
  const serviceName = page.getByPlaceholder("一句话说清你卖什么");
  await serviceName.fill("播客剪辑加速包");
  await page.reload();
  await expect(serviceName).toHaveValue("播客剪辑加速包");

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);

  await page.screenshot({
    path: "test-results/kaidan-mobile.png",
    fullPage: true,
  });
});
