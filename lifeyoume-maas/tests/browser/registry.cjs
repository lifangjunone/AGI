// Run with the Playwright skill executor; starts an isolated, local gateway.
const { chromium } = require("playwright");
const { expect } = require("playwright/test");
const { mkdtemp, rm, mkdir } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createServer } = require("node:http");

(async () => {
  const root = resolve(process.env.MAAS_PROJECT_ROOT || "/Users/bytedance/Desktop/agi/lifeyoume-maas");
  const directory = await mkdtemp(join(tmpdir(), "maas-registry-browser-"));
  const artifactDir = process.env.PW_ARTIFACT_DIR || directory;
  await mkdir(artifactDir, { recursive: true });
  let child, browser;
  let upstreamRequests = 0;
  const upstream = createServer(async (request, response) => {
    upstreamRequests++;
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/chat/completions") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw);
      if (!payload.messages[0].content.some(part => part.type === "image_url")) {
        response.writeHead(400); response.end("{}"); return;
      }
      response.end(JSON.stringify({ choices: [{ message: { content: "图片理解测试回答" } }] }));
      return;
    }
    if (request.url === "/v1/images/generations") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw);
      const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIZkAAAAASUVORK5CYII=";
      response.end(JSON.stringify({ data: [payload.response_format === "url"
        ? { url: "https://image-fixture.example.test/generated.png" } : { b64_json: png }] }));
      return;
    }
    if (request.url === "/v1/audio/speech") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw);
      if (payload.voice !== "supplier-voice" || request.headers.authorization !== "Bearer isolated-speech-key") {
        response.writeHead(400); response.end("{}"); return;
      }
      const wav = Buffer.alloc(364);
      wav.write("RIFF"); wav.writeUInt32LE(356, 4); wav.write("WAVE", 8);
      wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
      wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write("data", 36); wav.writeUInt32LE(320, 40);
      response.setHeader("content-type", "audio/wav");
      response.end(wav); return;
    }
    if (request.url === "/v1/embeddings") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const payload = JSON.parse(raw);
      if (payload.model !== "upstream-1" || request.headers.authorization !== "Bearer isolated-fixture-key") {
        response.writeHead(400); response.end("{}"); return;
      }
      response.end(JSON.stringify({
        data: payload.input.map((_, index) => ({ index, embedding: [0.1, 0.2, 0.3] })),
        usage: { prompt_tokens: 8 }
      }));
      return;
    }
    response.end(JSON.stringify({ object: "list", data: [{ id: "test-upstream" }] }));
  });
  try {
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const masterKey = "isolated-browser-test-master-key-over-32-characters";
    const { StateStore } = await import(pathToFileURL(join(root, "src/store.mjs")));
    const store = new StateStore(join(directory, "state.json"), masterKey);
    await store.load();
    await store.bootstrap({});
    for (let i = 0; i < 100; i++) {
      await store.saveModel({
        logicalModelId: `fixture-${String(i).padStart(3, "0")}`,
        name: `模型 ${String(i).padStart(3, "0")}`,
        capability: i % 2 ? "embeddings" : "chat",
        providerName: `Fixture Provider ${i % 4}`,
        baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
        upstreamModel: `upstream-${i}`, apiKey: "isolated-fixture-key"
      }, "browser-fixture");
    }
    child = spawn(process.execPath, [join(root, "src/server.mjs")], {
      env: { NODE_ENV: "development", MAAS_HOST: "127.0.0.1", MAAS_PORT: "0",
        MAAS_MASTER_KEY: masterKey, MAAS_DATA_PATH: join(directory, "state.json") },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const targetUrl = await new Promise((resolveUrl, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway_start_timeout")), 10000);
      child.stdout.on("data", chunk => {
        const match = chunk.toString().match(/listening on (http:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolveUrl(match[1]); }
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("gateway_exited")); });
    });
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${targetUrl}/#view=models`);
    const rows = page.locator(".registry-table tbody tr");
    await expect(rows).toHaveCount(10);
    await expect(page.getByRole("button", { name: "关闭导航", exact: true })).not.toBeVisible();
    await page.locator("#model-sort").focus();
    await page.locator("#model-sort").selectOption("name");
    await expect(page.locator("#model-sort")).toBeFocused();
    await page.locator("#model-next").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".registry-pagination")).toContainText("第 2 / 11 页");
    await expect(page.locator("#model-next")).toBeFocused();
    await page.locator("#model-page-size").focus();
    await page.locator("#model-page-size").selectOption("50");
    await expect(rows).toHaveCount(50);
    await expect(page.locator("#model-page-size")).toBeFocused();
    await page.getByLabel("搜索模型", { exact: true }).fill("模型 099");
    await expect(rows).toHaveCount(1);
    await expect(page.getByLabel("搜索模型", { exact: true })).toBeFocused();
    await page.reload();
    await expect(rows).toHaveCount(1);
    await expect(page.getByLabel("搜索模型", { exact: true })).toHaveValue("模型 099");
    await page.getByRole("button", { name: "清空筛选", exact: true }).click();
    await page.locator("#capability-filter").focus();
    await page.locator("#capability-filter").selectOption("chat");
    await expect(page.locator("#capability-filter")).toBeFocused();
    await page.locator("#provider-filter").selectOption("Fixture Provider 0");
    await expect(rows).toHaveCount(25);
    await page.getByRole("button", { name: "清空筛选", exact: true }).click();
    await page.locator("#model-page-size").selectOption("20");
    await expect(rows).toHaveCount(20);
    await page.locator("#status-filter").selectOption("disabled");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("lym-chat-quality");
    await page.locator("#status-filter").selectOption("enabled");
    await expect(rows).toHaveCount(20);
    await expect(page.locator(".registry-pagination")).toContainText("共 101 个模型");
    await page.locator("#status-filter").selectOption("failed");
    await expect(rows).toHaveCount(0);
    await page.locator("#status-filter").selectOption("untested");
    await expect(rows).toHaveCount(20);
    await expect(page.locator(".registry-pagination")).toContainText("共 101 个模型");
    const restoredUrl = page.url();
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await expect(page.locator("#model-search")).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(restoredUrl);
    await expect(page.locator("#status-filter")).toHaveValue("untested");
    await expect(page.locator("#model-page-size")).toHaveValue("20");
    await page.goForward();
    await expect(page.locator("#model-search")).toHaveCount(0);
    await page.goBack();
    await expect(rows).toHaveCount(20);
    await page.getByRole("button", { name: "清空筛选", exact: true }).click();
    await page.locator("#model-page-size").selectOption("10");

    // Create/edit/reveal/hide/test/toggle/delete via the actual admin HTTP API.
    await page.getByRole("button", { name: "接入新模型", exact: true }).click();
    await expect(page.locator("#model-capability-help")).toContainText("非流式");
    for (const capability of ["multimodal"]) {
      await page.locator("#model-capability").selectOption(capability);
      await expect(page.locator("#model-capability-help")).toContainText("图片理解");
      await expect(page.getByRole("button", { name: "接入模型", exact: true })).toBeVisible();
    }
    await page.locator("#model-capability").selectOption("embeddings");
    await expect(page.locator("#model-capability-help")).toContainText("float 向量");
    await expect(page.getByRole("button", { name: "接入模型", exact: true })).toBeVisible();
    await page.locator("#model-capability").selectOption("chat");
    await expect(page.getByRole("button", { name: "接入模型", exact: true })).toBeVisible();
    await page.getByLabel("模型名称", { exact: true }).fill("浏览器回归模型");
    await page.getByLabel("逻辑模型 ID", { exact: true }).fill("browser-created");
    await page.getByLabel("Provider 名称", { exact: true }).fill("Browser Provider");
    await page.locator("#model-base-url").fill(`http://127.0.0.1:${upstream.address().port}/v1`);
    await page.getByLabel("上游 Model ID", { exact: true }).fill("test-upstream");
    await page.getByLabel("API Key", { exact: true }).fill("isolated-browser-secret");
    await page.getByRole("button", { name: "接入模型", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByLabel("搜索模型", { exact: true }).fill("browser-created");
    await expect(rows).toHaveCount(1);
    await page.locator('[data-reveal-model="browser-created"]').click();
    await expect(page.locator("#detail-credential")).toHaveText("isolated-browser-secret");
    await page.locator("#hide-model-credential").click();
    await expect(page.locator("#detail-credential")).not.toHaveText("isolated-browser-secret");
    await page.keyboard.press("Escape");
    await rows.locator('[data-test-model="browser-created"]').click();
    await expect(rows).toContainText("目录核验通过");
    await expect(rows).toContainText("尚未验证实际推理");
    if (upstreamRequests !== 1) throw new Error("Connection test did not reach mock provider exactly once");
    await rows.locator('[data-edit-model="browser-created"]').click();
    await page.getByLabel("模型名称", { exact: true }).fill("修改后的回归模型");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(rows).toContainText("修改后的回归模型");
    await page.locator('[data-toggle-model="browser-created"]').click();
    await expect(rows).toContainText("已停用");
    page.once("dialog", dialog => dialog.accept());
    await page.locator('[data-delete-model="browser-created"]').click();
    await expect(rows).toHaveCount(0);
    await page.getByRole("button", { name: "清空筛选", exact: true }).first().click();
    await page.getByRole("button", { name: "接入新模型", exact: true }).click();
    await page.locator("#model-capability").selectOption("multimodal");
    await page.getByLabel("模型名称", { exact: true }).fill("多模态登记回归");
    await page.getByLabel("逻辑模型 ID", { exact: true }).fill("browser-registry-only");
    await page.getByLabel("Provider 名称", { exact: true }).fill("Browser Provider");
    await page.locator("#model-base-url").fill(`http://127.0.0.1:${upstream.address().port}/v1`);
    await page.getByLabel("上游 Model ID", { exact: true }).fill("test-upstream");
    await page.getByLabel("API Key", { exact: true }).fill("isolated-browser-secret");
    await page.screenshot({ path: join(artifactDir, "capability-form-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator("#model-capability-help")).toContainText("不支持音频/视频");
    await page.locator("#model-capability-help").scrollIntoViewIfNeeded();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      throw new Error("Capability form overflows on mobile");
    }
    await page.screenshot({ path: join(artifactDir, "capability-form-mobile.png"), fullPage: false });
    await page.getByRole("button", { name: "接入模型", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("#notice")).toContainText("新模型已接入");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel("搜索模型", { exact: true }).fill("browser-registry-only");
    await expect(rows).toHaveCount(1);
    page.once("dialog", dialog => dialog.accept());
    await rows.getByRole("button", { name: "删除", exact: true }).click();
    await expect(rows).toHaveCount(0);
    await page.getByRole("button", { name: "清空筛选", exact: true }).first().click();
    await page.getByLabel("搜索模型", { exact: true }).fill("fixture-001");
    await expect(rows).toHaveCount(1);
    await rows.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(page.locator("#model-capability-help")).toContainText("float 向量");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "清空筛选", exact: true }).first().click();

    // Use a synthetic application key through the real browser -> gateway -> mock route.
    const created = await (await page.request.post(`${targetUrl}/api/admin/applications/staffdeck/keys`, {
      data: { name: "browser vector regression" }
    })).json();
    await page.getByRole("button", { name: "Playground", exact: true }).click();
    await page.locator("#play-mode").selectOption("embeddings");
    await page.locator("#play-model").selectOption("fixture-001");
    await page.locator("#play-message").fill("第一条文本\n第二条文本");
    await page.locator("#play-key").fill(created.token);
    await page.getByRole("button", { name: "发送请求", exact: true }).click();
    await expect(page.locator("#play-result")).toContainText("HTTP 403");
    await expect(page.locator("#play-key")).toHaveValue("");
    const granted = await page.request.put(`${targetUrl}/api/admin/applications/staffdeck/models`, {
      data: { allowedModels: ["fixture-001"], expectedAllowedModels: [] }
    });
    if (!granted.ok()) throw new Error("Fixture grant failed");
    await page.locator("#play-key").fill(created.token);
    await page.getByRole("button", { name: "发送请求", exact: true }).click();
    await expect(page.locator("#play-result")).toContainText("向量数量：2");
    await expect(page.locator("#play-result")).toContainText("向量维度：3");
    await expect(page.locator("#play-result")).toContainText("输入 Token：8");
    await expect(page.locator("#play-raw-response")).not.toHaveAttribute("open");
    await page.getByText("查看原始响应 JSON", { exact: true }).click();
    await expect(page.locator("#play-json")).toContainText('"embedding"');
    await page.locator("#play-raw-response").evaluate(node => node.open = false);
    await page.screenshot({ path: join(artifactDir, "embeddings-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Embeddings mobile overflow");
    await page.screenshot({ path: join(artifactDir, "embeddings-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "清空结果", exact: true }).click();
    await expect(page.locator("#play-result")).toHaveText("等待请求…");
    await expect(page.locator("#play-json")).toHaveText("");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "模型与路由", exact: true }).click();

    await page.getByLabel("选择当前页", { exact: true }).focus();
    await page.getByLabel("选择当前页", { exact: true }).check();
    await expect(page.getByLabel("选择当前页", { exact: true })).toBeFocused();
    await page.locator("#model-next").click();
    await page.getByLabel("选择当前页", { exact: true }).check();
    await expect(page.locator("#selection-count")).toContainText("已选 20");
    let statusRequests = 0;
    await page.route("**/api/admin/models/*/status", async route => {
      statusRequests++;
      if (statusRequests === 1) return route.fulfill({ status: 503, json: { error: "temporary_failure" } });
      await route.continue();
    });
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "批量停用", exact: true }).click();
    if (statusRequests) throw new Error("Cancelled bulk operation sent requests");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "批量停用", exact: true }).click();
    await expect(page.locator("#bulk-message")).toContainText("成功 19 个，失败 1 个");
    await expect(page.locator("#notice")).toHaveAttribute("data-tone", "error");
    await expect(page.locator("#selection-count")).toContainText("已选 1");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "批量停用", exact: true }).click();
    await expect(page.locator("#bulk-message")).toContainText("成功 1 个，失败 0 个");
    await page.getByLabel("选择当前页", { exact: true }).check();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "批量启用", exact: true }).click();
    await expect(page.locator("#bulk-message")).toContainText("成功 10 个，失败 0 个");
    await page.locator("[data-select-model]:not(:disabled)").first().check();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "批量删除", exact: true }).click();
    await expect(page.locator("#bulk-message")).toContainText("删除完成：成功 1 个");
    await expect(page.locator("#notice")).toHaveAttribute("data-tone", "success");
    await page.screenshot({ path: join(artifactDir, "registry-desktop.png"), fullPage: true });
    for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
        throw new Error(`Registry overflows at ${viewport.width}px`);
      }
      await page.screenshot({ path: join(artifactDir, `registry-${viewport.width}.png`), fullPage: true });
    }
    await page.getByLabel("搜索模型", { exact: true }).fill("lym-tts-realtime");
    await expect(rows).toHaveCount(1);
    await expect(rows.locator("input[type=checkbox]")).toBeDisabled();
    await expect(rows.getByRole("button", { name: "删除", exact: true })).toHaveCount(0);
    const newSpeech = await page.request.post(`${targetUrl}/api/admin/models`, {
      data: {
        logicalModelId: "browser-cloud-tts", name: "外部语音回归", capability: "audio.speech",
        providerName: "Speech fixture", baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
        upstreamModel: "supplier-speech", apiKey: "isolated-speech-key"
      }
    });
    if (!newSpeech.ok()) throw new Error("Speech fixture creation failed");
    const speechKey = await (await page.request.post(`${targetUrl}/api/admin/applications/second-me/keys`, {
      data: { name: "external speech browser regression" }
    })).json();
    const secondMe = await (await page.request.get(`${targetUrl}/api/admin/state`)).json();
    const previousGrant = secondMe.applications.find(app => app.id === "second-me").allowedModels;
    const speechGrant = await page.request.put(`${targetUrl}/api/admin/applications/second-me/models`, {
      data: { allowedModels: ["browser-cloud-tts"], expectedAllowedModels: previousGrant }
    });
    if (!speechGrant.ok()) throw new Error("Speech fixture grant failed");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${targetUrl}/#view=playground`);
    await page.reload();
    await page.locator("#play-mode").selectOption("speech");
    await page.locator("#play-model").selectOption("lym-tts-realtime");
    await expect(page.locator("#play-voice")).toHaveValue("voice-1");
    const visionCreated = await page.request.post(`${targetUrl}/api/admin/models`, {
      data: { logicalModelId: "browser-vision", name: "图片理解回归", capability: "multimodal",
        providerName: "Vision fixture", baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
        upstreamModel: "supplier-vlm", apiKey: "isolated-vision-key" }
    });
    if (!visionCreated.ok()) throw new Error("Vision fixture failed");
    await page.request.put(`${targetUrl}/api/admin/applications/staffdeck/models`, {
      data: { allowedModels: ["browser-vision"], expectedAllowedModels: ["fixture-001"] }
    });
    await page.reload();
    await page.locator("#play-mode").selectOption("vision");
    await page.locator("#play-vision-urls").fill("http://unsafe.test/image.png");
    await page.locator("#play-key").fill(created.token);
    await page.getByRole("button", { name: "发送请求", exact: true }).click();
    await expect(page.locator("#play-result")).toContainText("HTTPS");
    await expect(page.locator("#play-vision-urls")).toBeFocused();
    await page.locator("#play-vision-urls").fill("https://assets.example.test/input.png");
    await page.getByRole("button", { name: "发送请求", exact: true }).click();
    await expect(page.locator("#play-result")).toHaveText("图片理解测试回答");
    await expect(page.locator("#play-key")).toHaveValue("");
    await page.setViewportSize({ width: 375, height: 812 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Vision mobile overflow");
    await page.screenshot({ path: join(artifactDir, "vision-mobile.png"), fullPage: true });
    await page.locator("#play-mode").selectOption("speech");
    await page.request.post(`${targetUrl}/api/admin/models`, {
      data: { logicalModelId: "browser-image", name: "图像回归", capability: "image.generation",
        providerName: "Image fixture", baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
        upstreamModel: "supplier-image", apiKey: "isolated-image-key" }
    });
    await page.request.put(`${targetUrl}/api/admin/applications/staffdeck/models`, {
      data: { allowedModels: ["browser-image"], expectedAllowedModels: ["browser-vision"] }
    });
    await page.reload();
    await page.locator("#play-mode").selectOption("image");
    await page.locator("#play-key").fill(created.token);
    await page.getByRole("button", { name: "发送请求", exact: true }).click();
    await expect(page.locator("#play-result")).toContainText("返回 1 张图片");
    await expect(page.locator("#play-images img")).toBeVisible();
    await expect.poll(() => page.locator("#play-images img").evaluate(img => img.naturalWidth)).toBe(1);
    await expect(page.getByRole("link", { name: "下载图片 1" })).toHaveAttribute("href", /^blob:/);
    await expect(page.locator("#play-key")).toHaveValue("");
    await page.setViewportSize({ width: 375, height: 812 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Images mobile overflow");
    await page.screenshot({ path: join(artifactDir, "images-mobile.png"), fullPage: true });
    let remoteCalls = 0;
    await page.route("https://image-fixture.example.test/**", route => {
      remoteCalls++;
      return route.fulfill({ status: 404 });
    });
    await page.locator("#play-image-format").selectOption("url");
    await page.locator("#play-key").fill(created.token);
    await page.getByRole("button", { name: "发送请求", exact: true }).click();
    await expect(page.getByRole("button", { name: "加载图片 1" })).toBeVisible();
    if (remoteCalls) throw new Error("Remote image fetched before consent");
    await page.getByRole("button", { name: "加载图片 1" }).click();
    await expect(page.locator("#play-images")).toContainText("图片加载失败");
    if (remoteCalls !== 1) throw new Error("Remote image consent did not send exactly one request");
    await page.getByRole("button", { name: "重试图片 1" }).click();
    await expect(page.getByRole("button", { name: "重试图片 1" })).toBeEnabled();
    if (remoteCalls !== 2) throw new Error("Image retry did not send a second request");
    await page.getByRole("button", { name: "清空结果" }).click();
    await expect(page.locator("#play-images")).toBeEmpty();
    await page.locator("#play-mode").selectOption("speech");
    await page.locator("#play-key").fill("test-key-to-clear");
    await page.locator("#play-model").selectOption("browser-cloud-tts");
    await expect(page.locator("#play-key")).toHaveValue("");
    await expect(page.getByLabel("供应商音色 ID")).toBeVisible();
    await page.getByLabel("供应商音色 ID").fill("supplier-voice");
    await page.locator("#play-key").fill(speechKey.token);
    await page.getByRole("button", { name: "生成语音", exact: true }).click();
    await expect(page.locator("#play-result")).toContainText("WAV 364 字节");
    await expect(page.locator("#play-audio")).toBeVisible();
    await expect(page.locator("#play-download")).toHaveAttribute("href", /^blob:/);
    await expect(page.locator("#play-key")).toHaveValue("");
    await page.setViewportSize({ width: 375, height: 812 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Speech mobile overflow");
    await page.screenshot({ path: join(artifactDir, "external-speech-mobile.png"), fullPage: true });
    await page.locator("#play-model").selectOption("lym-tts-realtime");
    await expect(page.locator("#play-result")).toHaveText("等待请求…");
    await expect(page.locator("#play-audio")).not.toHaveAttribute("src");
    await expect(page.locator("#play-download")).not.toHaveAttribute("href");
    await expect(page.locator("#play-voice")).toHaveValue("voice-1");
    // Display-only isolated fixture: exercise every status without changing production/provider keys.
    const statusFixture = await (await page.request.get(`${targetUrl}/api/admin/state`)).json();
    const fixtureModels = statusFixture.logicalModels.filter(model => model.id.startsWith("fixture-")).slice(0, 7);
    const statusCodes = ["untested", "healthy", "failed", "model_not_listed", "directory_unavailable", "unconfigured", "disabled"];
    statusFixture.logicalModels = fixtureModels;
    fixtureModels.forEach((model, index) => {
      const deployment = statusFixture.deployments.find(item => item.id === model.routes[0].deploymentId);
      const provider = statusFixture.providers.find(item => item.id === deployment.providerId);
      model.enabled = true;
      deployment.enabled = index !== 6;
      deployment.health = "unknown";
      delete deployment.lastTestStatus;
      delete deployment.lastTestCode;
      if (index === 1) deployment.lastTestStatus = "healthy";
      if (index === 2) deployment.lastTestStatus = "failed";
      if ([3, 4].includes(index)) deployment.lastTestCode = statusCodes[index];
      if (index === 5) provider.hasCredential = false;
    });
    await page.route("**/api/admin/state", route => route.fulfill({ json: statusFixture }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${targetUrl}/#view=models`);
    await page.reload();
    for (let index = 0; index < statusCodes.length; index++) {
      await page.locator("#status-filter").focus();
      await page.locator("#status-filter").selectOption(statusCodes[index]);
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(fixtureModels[index].id);
      await expect(page.locator("#status-filter")).toBeFocused();
      await page.reload();
      await expect(page.locator("#status-filter")).toHaveValue(statusCodes[index]);
      await expect(rows).toHaveCount(1);
    }
    await page.locator("#status-filter").selectOption("needs_verification");
    await expect(rows).toHaveCount(3);
    await page.getByLabel("搜索模型", { exact: true }).fill(fixtureModels[3].id);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("目录未找到");
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await page.goBack();
    await expect(page.locator("#status-filter")).toHaveValue("needs_verification");
    await expect(page.getByLabel("搜索模型", { exact: true })).toHaveValue(fixtureModels[3].id);
    await page.getByRole("button", { name: "清空筛选", exact: true }).click();
    await expect(rows).toHaveCount(7);
    await page.screenshot({ path: join(artifactDir, "status-filters-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator("#status-filter").selectOption("directory_unavailable");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("无法核验");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Status mobile overflow");
    await page.screenshot({ path: join(artifactDir, "status-filters-mobile.png"), fullPage: true });
    if (errors.length) throw new Error(errors.join("; "));
    console.log("PASS: 100-model pagination 10/20/50, all status filters, Back/Forward, capability disclosure/create/edit, keyboard focus, row CRUD/key/test, bulk cancel/retry/delete, managed protection, mobile/landscape");
    console.log(`Screenshots: ${artifactDir}`);
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise(resolveClose => upstream.close(resolveClose));
    // Only this test's mkdtemp directory is removed; screenshots can be kept separately.
    if (artifactDir !== directory) await rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
