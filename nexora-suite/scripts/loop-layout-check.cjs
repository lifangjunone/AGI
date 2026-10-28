const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    const login = await page.request.post("http://10.37.221.24:8080/api/v1/auth/login", {
      data: { Email: "admin@nexora.local", Password: process.env.NEXORA_TEST_PASSWORD },
    });
    if (!login.ok()) throw new Error("Login failed");
    const { access_token } = await login.json();
    await page.addInitScript(token => localStorage.setItem("nexora_token", token), access_token);
    const results = [];
    for (const width of [1366, 2048]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://10.37.221.24:3001/?locale=en-US");
      const card = page.locator(".agent-project-card").filter({ hasText: "验收-敏态AgentLoop-20261023" });
      await card.getByRole("button", { name: "Build & configure" }).click();
      await page.locator(".loop-console-main").waitFor();
      await page.waitForFunction(() => {
        const area = document.querySelector(".loop-console-main");
        return area && area.getBoundingClientRect().height > 100;
      });
      await page.waitForFunction(() => {
        const area = document.querySelector(".loop-console-main");
        if (!area || area.getBoundingClientRect().height < 100) return false;
        area.scrollTop = area.scrollHeight;
        const last = [...area.querySelectorAll(".loop-config-card")].pop();
        return last && last.getBoundingClientRect().bottom <= area.getBoundingClientRect().bottom - 24;
      });
      const result = await page.evaluate(() => {
        const area = document.querySelector(".loop-console-main");
        area.scrollTop = area.scrollHeight;
        const bounds = area.getBoundingClientRect();
        const cards = area.querySelectorAll(".loop-config-card");
        const last = cards[cards.length - 1].getBoundingClientRect();
        return { viewport: innerHeight, bodyBottom: bounds.bottom, cardBottom: last.bottom, bottomPadding: bounds.bottom - last.bottom };
      });
      if (result.bodyBottom > 901 || result.cardBottom > result.bodyBottom - 24) {
        throw new Error(JSON.stringify(result));
      }
      results.push({ width, ...result });
      await page.screenshot({ path: `/tmp/nexora-loop-layout-${width}.png`, fullPage: true });
    }
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})();
