import { expect, Page, test } from "@playwright/test";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("desktop flow matches a job, builds evidence, reviews, and exports", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1120, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "高级产品经理" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "统一账号" })).toBeVisible();
  await page.getByRole("tab", { name: "02 岗位" }).click();
  await expect(page.getByText("关键词覆盖").last()).toBeVisible();
  await expect(page.getByText("产品规划").first()).toBeVisible();

  await page.getByRole("tab", { name: "03 经历" }).click();
  await page.getByPlaceholder("做了什么").fill("客户交付流程");
  await page.getByPlaceholder("覆盖 6 个部门").fill("覆盖 8 个区域");
  await page.getByPlaceholder("交付周期缩短 40%").fill("交付周期缩短 25%");
  await page.getByRole("button", { name: "生成并加入" }).click();
  await expect(page.getByText("成果要点已加入当前经历")).toBeVisible();
  await expect(page.getByText(/覆盖 8 个区域/).first()).toBeVisible();

  await page.getByRole("tab", { name: "04 诊断" }).click();
  await expect(page.getByText("投递准备度")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出简历" }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("高级产品经理-简历.html");

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(errors).toEqual([]);

  await page.screenshot({ path: "test-results/resume-desktop.png", fullPage: true });
});

test("FDE entry opens the job targeting step", async ({ page }) => {
  await page.goto("/?source=fde-playbook");
  await expect(page.getByText("已从 FDE 手册进入，请粘贴目标岗位 JD")).toBeVisible();
  await expect(page.getByRole("heading", { name: "对准目标岗位" })).toBeVisible();
});

test("mobile switches between edit, preview, and review without overflow", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator(".editor")).toBeVisible();
  await expect(page.locator(".preview")).toBeHidden();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".resume-paper")).toBeVisible();
  await page.screenshot({ path: "test-results/resume-mobile-preview.png", fullPage: true });

  await page.getByRole("button", { name: "诊断", exact: true }).click();
  await expect(page.getByText("投递准备度")).toBeVisible();

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(errors).toEqual([]);

  await page.screenshot({ path: "test-results/resume-mobile-review.png", fullPage: true });
});
