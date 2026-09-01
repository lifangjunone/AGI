import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const port = 43192;
const baseUrl = `http://127.0.0.1:${port}`;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const server = spawn(
  path.join(process.cwd(), "node_modules", ".bin", "vite"),
  ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
  cwd: process.cwd(),
  env: process.env,
  stdio: "ignore"
  }
);

const waitForServer = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not start in time.");
};

try {
  await waitForServer();
  await mkdir("test-results", { recursive: true });
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const failedRequests = [];
  const httpErrors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("INFO: Created TensorFlow Lite XNNPACK delegate")
    ) {
      consoleErrors.push(`${message.text()} ${JSON.stringify(message.location())}`);
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".immersive-stage.ready").waitFor({ timeout: 20000 });
  await page.getByText("3D · LIVE RIG").waitFor();

  const canvasSignal = await page.locator("canvas").evaluate((canvas) => {
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl");
    if (!context) return { width: canvas.width, height: canvas.height, uniquePixels: 0 };
    const colors = new Set();
    for (let row = 1; row < 8; row += 1) {
      for (let column = 1; column < 8; column += 1) {
        const pixel = new Uint8Array(4);
        context.readPixels(
          Math.floor((canvas.width * column) / 8),
          Math.floor((canvas.height * row) / 8),
          1,
          1,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixel
        );
        colors.add(pixel.join(","));
      }
    }
    return { width: canvas.width, height: canvas.height, uniquePixels: colors.size };
  });
  if (canvasSignal.width < 500 || canvasSignal.height < 300 || canvasSignal.uniquePixels < 4) {
    throw new Error(`WebGL canvas is blank or undersized: ${JSON.stringify(canvasSignal)}`);
  }

  await page.getByRole("button", { name: "3RD" }).click();
  if ((await page.getByRole("button", { name: "3RD" }).getAttribute("aria-pressed")) !== "true") {
    throw new Error("Third-person camera did not activate.");
  }
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join("test-results", "avatar-third-person.png")
  });
  await page.getByRole("button", { name: "1ST" }).click();

  await page.getByRole("button", { name: "Looks" }).click();
  const doctorPreset = page.getByRole("button", { name: /Doctor Clinical allure/ });
  await doctorPreset.click();
  if (!(await doctorPreset.getAttribute("class"))?.includes("selected")) {
    throw new Error("Doctor 3D wardrobe preset did not activate.");
  }
  await page.locator(".immersive-stage.ready").waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join("test-results", "avatar-doctor-preset.png") });

  await page.getByRole("button", { name: "Avatar" }).click();
  if ((await page.locator(".face-grid button").count()) !== 10) {
    throw new Error("The active AI face style does not expose ten presets.");
  }
  await page.locator(".face-grid button.ready").first().waitFor({ timeout: 20000 });
  const faceImageSignal = await page.locator(".face-grid img").evaluateAll((images) =>
    images.map((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
      src: image.getAttribute("src")
    }))
  );
  if (
    faceImageSignal.length !== 10 ||
    faceImageSignal.some((image) => image.width < 512 || image.height < 512)
  ) {
    throw new Error(`Local face assets are missing or undersized: ${JSON.stringify(faceImageSignal)}`);
  }
  await page.getByRole("tab", { name: "J-FASHION" }).click();
  await page.locator(".face-grid button.ready").first().waitFor({ timeout: 20000 });
  const syntheticFace = page.getByRole("button", {
    name: "Select Tokyo 01 fictional adult face reference"
  });
  await syntheticFace.click();
  await page.getByText("AI 3D IDENTITY").waitFor();
  await page.waitForTimeout(500);
  await page.locator(".immersive-stage.ready").waitFor({ timeout: 20000 });
  if (!(await syntheticFace.getAttribute("class"))?.includes("selected")) {
    throw new Error("Synthetic face preset did not activate.");
  }
  const expectedMorphs = [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "jawOpen",
    "mouthSmileLeft",
    "mouthSmileRight",
    "mouthFunnel"
  ];
  const availableMorphs = (
    (await page.locator(".immersive-canvas").getAttribute("data-face-morphs")) ??
    ""
  ).split(",");
  if (expectedMorphs.some((name) => !availableMorphs.includes(name))) {
    throw new Error(
      `The personalized avatar is missing live face morphs: ${availableMorphs.join(",")}`
    );
  }
  await page.getByRole("button", { name: "Replay" }).click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(".immersive-canvas")?.getAttribute(
          "data-mouth-weight"
        )
      ) > 0.05,
    undefined,
    { timeout: 10000 }
  );
  await page.screenshot({
    path: path.join("test-results", "avatar-tokyo-speaking.png")
  });
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(".immersive-canvas")?.getAttribute(
          "data-blink-weight"
        )
      ) > 0.1,
    undefined,
    { timeout: 7000 }
  );
  await page.screenshot({
    path: path.join("test-results", "avatar-tokyo-blink.png")
  });

  const photoInput = page.locator('.avatar-primary-action input[type="file"]');
  await photoInput.setInputFiles(
    path.join(process.cwd(), "public", "faces", "j-fashion-02.jpg")
  );
  await page.getByText("PHOTO 3D IDENTITY").waitFor();
  await page.waitForTimeout(500);
  await page.locator(".immersive-stage.ready").waitFor({ timeout: 20000 });

  await page.setViewportSize({ width: 1120, height: 720 });
  await page.screenshot({ path: path.join("test-results", "avatar-studio-compact.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join("test-results", "avatar-studio-desktop.png") });

  await page
    .locator('.avatar-secondary-action input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "public", "models", "real-casual.glb"));
  await page.getByText("CUSTOM MODEL").waitFor();
  await page.getByText("3D · LIVE RIG").waitFor();

  if (consoleErrors.length > 0 || failedRequests.length > 0 || httpErrors.length > 0) {
    throw new Error(
      `Browser errors detected: ${JSON.stringify({ consoleErrors, failedRequests, httpErrors })}`
    );
  }

  await browser.close();
  process.stdout.write(`${JSON.stringify({ canvasSignal, status: "passed" }, null, 2)}\n`);
} finally {
  server.kill("SIGTERM");
}
