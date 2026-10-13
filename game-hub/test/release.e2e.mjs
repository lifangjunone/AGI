import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium } from "playwright-core";

const PORT = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});
const URL = `http://127.0.0.1:${PORT}/games/`;
const server = spawn(
  process.execPath,
  ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT)],
  { stdio: "ignore" },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vite test server did not start");
}

function parseMathPrompt(prompt) {
  const match = prompt.match(/(\d+)\s*([+\u2212×])\s*(\d+)/);
  assert.ok(match, `Unexpected math prompt: ${prompt}`);
  const left = Number(match[1]);
  const right = Number(match[3]);
  if (match[2] === "+") return left + right;
  if (match[2] === "\u2212") return left - right;
  return left * right;
}

async function readMemorySequence(page, length) {
  const sequence = [];
  await page.clock.runFor(360);
  for (let index = 0; index < length; index += 1) {
    const label = await page.locator(".memory-grid .is-active").getAttribute("aria-label");
    sequence.push(Number(label.split(" ")[1]));
    if (index < length - 1) await page.clock.runFor(650);
  }
  await page.clock.runFor(1200);
  return sequence;
}

let browser;

try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const networkErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    networkErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.clock.install({ time: new Date("2026-10-13T12:00:00Z") });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  assert.equal(await page.locator(".seat.is-open").count(), 5);
  assert.equal(await page.locator(".game-card.is-ready").count(), 5);
  assert.equal(await page.locator(".game-card.is-locked").count(), 1);
  await page.screenshot({
    path: "dogfood-output/screenshots/lobby-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("button", { name: "开始节奏反应" }).click();
  await page.getByRole("button", { name: "开始挑战" }).click();
  for (let round = 0; round < 5; round += 1) {
    await page.clock.runFor(3300);
    await page.locator(".reaction-pad--ready").click();
    if (round < 4) await page.clock.runFor(700);
  }
  assert.ok(await page.locator(".reaction-pad--done").isVisible());
  await page.getByRole("button", { name: "返回游戏厅" }).click();

  await page.getByRole("button", { name: "开始闪记方格" }).click();
  await page.getByRole("button", { name: "开始记忆" }).click();
  const firstSequence = await readMemorySequence(page, 3);
  for (const cell of firstSequence) {
    await page.getByRole("button", { name: `方格 ${cell}` }).click();
  }
  assert.ok(await page.getByText("完全正确").isVisible());
  await page.clock.runFor(750);
  const secondSequence = await readMemorySequence(page, 4);
  const wrongCell = secondSequence[0] === 1 ? 2 : 1;
  await page.getByRole("button", { name: `方格 ${wrongCell}` }).click();
  assert.ok(await page.getByText("顺序错了").isVisible());
  await page.getByRole("button", { name: "返回游戏厅" }).click();

  await page.getByRole("button", { name: "开始盯住圆点" }).click();
  await page.getByRole("button", { name: "开始追踪" }).click();
  for (let hit = 0; hit < 5; hit += 1) {
    await page.getByRole("button", { name: "点击目标" }).click();
  }
  await page.clock.runFor(20_000);
  assert.ok(await page.getByText("5 次命中").isVisible());
  await page.getByRole("button", { name: "返回游戏厅" }).click();

  await page.getByRole("button", { name: "开始心算快跑" }).click();
  await page.getByRole("button", { name: "开始心算" }).click();
  for (let question = 0; question < 3; question += 1) {
    const answer = parseMathPrompt(await page.locator(".math-question").innerText());
    await page.getByRole("button", { name: `答案 ${answer}` }).click();
  }
  const currentAnswer = parseMathPrompt(await page.locator(".math-question").innerText());
  const wrongOption = await page.locator(".answer-grid button").evaluateAll(
    (buttons, answer) => buttons.map((button) => Number(button.textContent)).find((value) => value !== answer),
    currentAnswer,
  );
  await page.getByRole("button", { name: `答案 ${wrongOption}` }).click();
  await page.clock.runFor(30_000);
  assert.ok(await page.getByText("3 题正确").isVisible());
  await page.getByRole("button", { name: "返回游戏厅" }).click();

  await page.getByRole("button", { name: "开始十秒直觉" }).click();
  await page.getByRole("button", { name: "开始十秒挑战" }).click();
  await page.clock.runFor(10_000);
  await page.getByRole("button", { name: "停止计时" }).click();
  const timeScore = await page.locator(".time-dial > span").innerText();
  const deltaSeconds = Number(timeScore.match(/(\d+\.\d+)/)?.[1]);
  assert.ok(deltaSeconds <= 0.1, `Clock error was ${deltaSeconds}s`);
  await page.getByRole("button", { name: "返回游戏厅" }).click();

  await page.reload({ waitUntil: "networkidle" });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("game-hub-stats")));
  assert.deepEqual(
    Object.keys(stored).sort(),
    ["focus-dot", "memory-grid", "quick-math", "reaction", "time-guess"],
  );
  assert.equal(stored["focus-dot"].best, 5);
  assert.equal(stored["memory-grid"].best, 2);
  assert.equal(stored["quick-math"].best, 3);
  assert.ok(stored["time-guess"].best <= 100);
  assert.ok(await page.getByText("第 2 关").isVisible());
  assert.ok(await page.getByText("5 次").isVisible());
  assert.ok(await page.getByText("3 题").isVisible());

  await page.getByLabel("搜索游戏").fill("心算");
  assert.equal(await page.locator(".game-card").count(), 1);
  await page.getByLabel("搜索游戏").fill("不存在");
  assert.ok(await page.getByText("没有找到这个游戏").isVisible());
  await page.getByRole("button", { name: "清空筛选" }).click();

  await page.getByRole("button", { name: "开始盯住圆点" }).click();
  await page.keyboard.press("Escape");
  assert.ok(await page.getByRole("heading", { name: "全部游戏" }).isVisible());

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await page.screenshot({
    path: "dogfood-output/screenshots/lobby-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const minButtonHeight = await page.locator(".card-action button").evaluateAll(
    (buttons) => Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
  );
  assert.ok(minButtonHeight >= 34);
  assert.deepEqual(errors, []);
  assert.deepEqual(networkErrors, []);

  console.log(JSON.stringify({
    status: "passed",
    games: 5,
    persistedScores: Object.keys(stored).length,
    mobileOverflow: 0,
    consoleErrors: errors.length,
    networkErrors: networkErrors.length,
  }));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
