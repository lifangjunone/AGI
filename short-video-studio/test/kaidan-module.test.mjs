import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const { startServer } = await import("../server.mjs");

test("connects Zhizhu, Kaidan, and the promotion prefill flow", { timeout: 30_000 }, async (t) => {
  const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => instance.server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1120, height: 720 } });
  await page.goto(`http://127.0.0.1:${instance.port}/zhizhu/`);
  await page.getByRole("link", { name: /开单页/ }).click();
  await page.waitForURL(`http://127.0.0.1:${instance.port}/kaidan/`);
  await page.getByRole("button", { name: "生成推广内容" }).click();
  await page.waitForURL(/\/zhizhu\/\?tool=social&source=kaidan/);

  assert.equal(await page.locator('[name="scene"]').inputValue(), "大厂产品经理简历诊断首发");
  assert.match(await page.locator('[name="offer"]').inputValue(), /主推方案 ¥199/);
  assert.equal(
    await page.locator('[name="voice"]').inputValue(),
    "自然、真诚、有行动引导"
  );
});
