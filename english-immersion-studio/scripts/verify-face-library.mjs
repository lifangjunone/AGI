import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const port = 43195;
const baseUrl = `http://127.0.0.1:${port}`;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const styles = [
  { tab: "K-STAGE", prefix: "Seoul" },
  { tab: "J-FASHION", prefix: "Tokyo" },
  { tab: "EXECUTIVE", prefix: "Atelier" }
];
const server = spawn(
  path.join(process.cwd(), "node_modules", ".bin", "vite"),
  ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: process.cwd(), env: process.env, stdio: "ignore" }
);

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not start in time.");
}

try {
  await waitForServer();
  await mkdir("test-results/faces", { recursive: true });
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("INFO: Created TensorFlow Lite XNNPACK delegate")
    ) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("requestfailed", (request) =>
    errors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`)
  );

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".immersive-stage.ready").waitFor({ timeout: 20000 });
  const timings = [];

  for (const style of styles) {
    await page.getByRole("tab", { name: style.tab }).click();
    await page.locator(".face-grid button.ready").first().waitFor({ timeout: 10000 });
    for (let index = 1; index <= 10; index += 1) {
      const number = String(index).padStart(2, "0");
      const label = `${style.prefix} ${number}`;
      const started = Date.now();
      await page.getByRole("button", {
        name: `Select ${label} fictional adult face reference`
      }).click();
      await page.waitForFunction(
        (expectedLabel) => {
          const card = document.querySelector(".avatar-identity-card");
          const ready = document.querySelector(".immersive-stage.ready");
          const status = document.querySelector(".avatar-status-dot.ready");
          return (
            card?.querySelector("strong")?.textContent === expectedLabel &&
            Boolean(ready && status)
          );
        },
        label,
        { timeout: 20000 }
      );
      const morphs =
        (await page
          .locator(".immersive-canvas")
          .getAttribute("data-face-morphs")) ?? "";
      if (!morphs.includes("eyeBlinkLeft") || !morphs.includes("jawOpen")) {
        throw new Error(`${label} lost its animated face rig.`);
      }
      timings.push({ label, milliseconds: Date.now() - started });
    }
    await page.waitForTimeout(700);
    await page.screenshot({
      path: path.join(
        "test-results",
        "faces",
        `${style.tab.toLowerCase()}-identity.png`
      )
    });
  }

  if (errors.length > 0) {
    throw new Error(`Browser errors detected: ${JSON.stringify(errors)}`);
  }
  await browser.close();
  process.stdout.write(
    `${JSON.stringify(
      {
        identities: timings.length,
        averageMilliseconds: Math.round(
          timings.reduce((sum, item) => sum + item.milliseconds, 0) /
            timings.length
        ),
        slowest: timings.sort((a, b) => b.milliseconds - a.milliseconds)[0],
        status: "passed"
      },
      null,
      2
    )}\n`
  );
} finally {
  server.kill("SIGTERM");
}
