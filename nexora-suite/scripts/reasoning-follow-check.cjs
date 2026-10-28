const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const res = await page.request.post("http://10.37.221.24:8080/api/v1/auth/login", {
      data: { Email: "admin@nexora.local", Password: process.env.NEXORA_TEST_PASSWORD },
    });
    if (!res.ok()) throw new Error("Login failed");
    const { access_token } = await res.json();
    await page.addInitScript(token => localStorage.setItem("nexora_token", token), access_token);
    // Deterministic UI fixture, not a model-quality or real upstream test.
    const reasoning = Array.from({ length: 100 }, (_, i) => `Reasoning line ${i}: inspect evidence and continue.\n\n`).join("");
    await page.route("**/chat/stream", route => route.fulfill({
      contentType: "text/event-stream",
      body: `event: reasoning\ndata: ${JSON.stringify({ content: reasoning })}\n\nevent: delta\ndata: {"content":"Answer started"}\n\n`,
    }));
    await page.goto("http://10.37.221.24:3001/?locale=en-US");
    await page.getByRole("button", { name: "Chat with 验收-敏态AgentLoop-20261023", exact: true }).click();
    await page.getByRole("textbox", { name: "Enter a question or task" }).fill("UI reasoning visibility check");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.locator(".reasoning-stream").waitFor();
    const result = await page.locator(".reasoning-stream").evaluate(panel => {
      const body = panel.querySelector(":scope > div");
      return { open: panel.open, bottomGap: body.scrollHeight - body.scrollTop - body.clientHeight, scrollable: body.scrollHeight > body.clientHeight };
    });
    if (result.bottomGap > 3) throw new Error(JSON.stringify(result));
    console.log(JSON.stringify({ fixture: true, ...result }));
    await page.screenshot({ path: "/tmp/nexora-reasoning-follow.png", fullPage: true });
  } finally { await browser.close(); }
})();
