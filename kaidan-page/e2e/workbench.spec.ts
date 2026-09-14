import { expect, Page, test } from "@playwright/test";
import { encodeOffer, templates } from "../src/domain";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("desktop creator flow is complete and exportable", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 1120, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "大厂产品经理简历诊断" }).first()).toBeVisible();
  await expect(page.getByText("可以开卖")).toBeVisible();
  await expect(page.getByText("¥1,930")).toBeVisible();

  await page.getByRole("button", { name: "添加交付内容" }).click();
  await expect(page.getByRole("textbox", { name: "交付内容 4" })).toBeVisible();
  await page.getByRole("button", { name: "删除交付内容 4" }).click();
  await expect(page.getByRole("textbox", { name: "交付内容 4" })).toHaveCount(0);
  await page.getByRole("tab", { name: "3 成交增强" }).click();
  await expect(page.getByText("成交说服力")).toBeVisible();

  await page.getByRole("tab", { name: "2 报价方案" }).click();
  await page.getByLabel("价格").nth(1).fill("299");
  await page.getByRole("tab", { name: "4 收入测算" }).click();
  await expect(page.locator(".money-grid .net-card strong")).toContainText("¥2,900");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出售卖页" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("售卖页.html");

  await page.getByRole("button", { name: "创建新服务" }).click();
  await expect(page.getByRole("dialog", { name: "创建新服务？" })).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("dialog", { name: "创建新服务？" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "大厂产品经理简历诊断" }).first()).toBeVisible();

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(runtimeErrors).toEqual([]);

  await page.screenshot({
    path: "test-results/kaidan-desktop.png",
    fullPage: true,
  });
});

test("mobile layout and local draft persistence work", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator(".editor-panel")).toBeVisible();
  await expect(page.locator(".preview-panel")).toBeHidden();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".preview-panel")).toBeVisible();
  await page.getByRole("button", { name: "快速诊断" }).click();
  await expect(page.locator(".package-strip")).toContainText("¥39");
  await expect(page.locator(".contact-line")).toContainText("linxiao-career");
  await page.screenshot({
    path: "test-results/kaidan-mobile-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByText("免费计划")).toBeVisible();
  await page.getByRole("button", { name: "关闭导航" }).click();

  await page.getByRole("tab", { name: "1 服务定位" }).click();
  const serviceName = page.getByPlaceholder("一句话说清你卖什么");
  await serviceName.fill("播客剪辑加速包");
  await page.reload();
  await expect(serviceName).toHaveValue("播客剪辑加速包");
  await expect(page.locator(".mobile-save-state")).toContainText("已保存");

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(runtimeErrors).toEqual([]);

  await page.screenshot({
    path: "test-results/kaidan-mobile.png",
    fullPage: true,
  });
});

test("buyer share view presents conversion content and package choice", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#offer=${encodeOffer(templates.career)}`);

  await expect(
    page.getByRole("heading", { name: "大厂产品经理简历诊断" }),
  ).toBeVisible();
  await expect(page.getByText("真实结果")).toBeVisible();
  await expect(page.getByText("服务保障")).toBeVisible();
  await page.getByRole("button", { name: /快速诊断/ }).click();
  await expect(page.locator(".buyer-cta")).toContainText("¥39");
  await expect(page.getByText("需要准备什么？")).toBeVisible();

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(runtimeErrors).toEqual([]);

  await page.screenshot({
    path: "test-results/kaidan-buyer-mobile.png",
    fullPage: true,
  });
});
