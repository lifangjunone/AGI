const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    const base = "http://10.37.221.24";
    const login = await page.request.post(`${base}:8080/api/v1/auth/login`, {
      data: { Email: "admin@nexora.local", Password: process.env.NEXORA_TEST_PASSWORD },
    });
    if (!login.ok()) throw new Error(`Core login failed: ${login.status()}`);
    const { access_token } = await login.json();
    await page.addInitScript(token => localStorage.setItem("nexora_token", token), access_token);
    const results = [];
    for (const width of [1366, 1600, 2048, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}:3004/?locale=en-US`);
      await page.getByRole("button", { name: "Open environment", exact: true }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error(`Horizontal overflow at ${width}`);
      await page.getByRole("button", { name: "Open environment", exact: true }).click();
      await page.getByRole("heading", { name: "Engine versions", exact: true }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "Engine versions", exact: true }).waitFor();
      await page.screenshot({ path: "/tmp/nexora-runtime-detail-debug.png", fullPage: true });
      await page.getByRole("button", { name: /Back to list|返回列表/ }).click();
      await page.getByRole("button", { name: /Open environment|查看环境/ }).waitFor();
      console.log("Toolbar buttons:", await page.getByRole("button").allTextContents());
      await page.getByRole("button", { name: /Connect runtime|接入运行环境/ }).click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      results.push({ width, overflow, detailsSurviveReload: true, modalEscape: true });
      if (width === 1600) await page.screenshot({ path: "/tmp/nexora-runtime-usability.png", fullPage: true });
    }
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})();
