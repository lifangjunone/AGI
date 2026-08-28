import { expect, test } from "@playwright/test";

test("optional Hermes evolution rewrites the future route with evidence", async ({
  page
}) => {
  let savedInference: Record<string, unknown> | undefined;
  await page.route("**/api/evolution/status", async (route) => {
    await route.fulfill({
      json: {
        available: true,
        installed: true,
        configured: true,
        runtime: "/Users/test/.local/bin/hermes",
        model: "doubao-seed-evolving",
        inference: {
          provider: "custom",
          mode: "cloud",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          model: "doubao-seed-evolving",
          apiKeyConfigured: true,
          source: "current-model-default"
        },
        localModel: {
          modelId: "mlx-community/Qwen3.5-9B-MLX-8bit",
          modelPath: "/Users/test/.models/Qwen3.5-9B-MLX-8bit",
          baseUrl: "http://127.0.0.1:8800/v1",
          downloaded: true,
          online: true
        },
        privacy: "只发送转写、评分与课程结构，不发送录音文件"
      }
    });
  });
  await page.route("**/api/evolution/analyze", async (route) => {
    await route.fulfill({
      json: {
        insight: {
          id: "hermes-e2e",
          generatedAt: "2026-08-17T12:00:00.000Z",
          source: "hermes-agent",
          summary: "回答意思清楚，但需要用具体例子延长话轮。",
          strengths: ["核心信息明确"],
          focusAreas: [
            {
              area: "持续表达",
              evidence: "最近回答只有一个结论，没有理由和例子。",
              priority: "high"
            }
          ],
          nextActions: ["使用结论、理由、例子三步结构"],
          routeChanges: [
            {
              week: 1,
              previousTheme: "认识你自己",
              newTheme: "连续表达强化",
              reason: "定向解决回答过短"
            }
          ],
          analyzedRecordCount: 1
        },
        weekAdjustments: [
          {
            week: 1,
            theme: "连续表达强化",
            outcome: "围绕一个话题连续表达两分钟并给出例子",
            chunks: [
              "The main point is ...",
              "The reason is ...",
              "For example, ...",
              "What I learned was ..."
            ],
            reason: "定向解决回答过短"
          }
        ]
      }
    });
  });
  await page.route("**/api/evolution/inference", async (route) => {
    savedInference = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ok: true,
        inference: {
          provider: "custom",
          mode: savedInference?.mode === "local" ? "local" : "cloud",
          baseUrl:
            savedInference?.mode === "local"
              ? "http://127.0.0.1:8800/v1"
              : "https://ark.cn-beijing.volces.com/api/v3",
          model:
            savedInference?.mode === "local"
              ? "mlx-community/Qwen3.5-9B-MLX-8bit"
              : "doubao-seed-evolving",
          apiKeyConfigured: true,
          source: "easysay-local"
        }
      }
    });
  });
  await page.route("**/api/speech/config", async (route) => {
    await route.fulfill({ status: 503, json: { message: "offline" } });
  });

  await page.goto("/");
  await page.evaluate(() => {
    const weeks = Array.from({ length: 24 }, (_, index) => ({
      week: index + 1,
      phase: index < 4 ? "开口启动" : "真实迁移",
      theme: index === 0 ? "认识你自己" : `场景 ${index + 1}`,
      outcome: "完成自然的场景对话",
      chunks: [
        "Let me think for a second.",
        "The main reason is ...",
        "Could you say that again?",
        "A good example would be ..."
      ]
    }));
    localStorage.setItem(
      "easysay-state-v1",
      JSON.stringify({
        profile: {
          name: "进化测试",
          level: "A2",
          goal: "work",
          minutesPerDay: 45,
          accent: "american",
          nativeLanguage: "zh-CN",
          targetLanguage: "en",
          createdAt: new Date().toISOString()
        },
        baseline: {
          completedAt: new Date().toISOString(),
          selfIntroTranscript: "I work in product.",
          storyTranscript: "I finished a project.",
          focusAreas: ["持续表达"],
          scores: {
            intelligibility: 3,
            fluency: 2,
            expression: 2,
            interaction: 2
          }
        },
        plan: {
          title: "测试路线",
          level: "A2",
          goal: "work",
          summary: "初始路线",
          generatedBy: "local",
          weeks
        },
        progress: {
          completedTaskIds: [],
          userConfirmedTaskIds: [],
          records: [
            {
              id: "record-1",
              taskId: "free-speak",
              createdAt: new Date().toISOString(),
              durationSeconds: 18,
              transcript: "I like my work.",
              completionMode: "user-confirmed"
            }
          ],
          streak: 1,
          weeklySpeakingSeconds: 18,
          knownChunks: []
        },
        evolution: {
          enabled: false,
          autoEvolve: false,
          recordsPerCycle: 3,
          lastAnalyzedRecordCount: 0
        }
      })
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "设置" }).click();

  await expect(page.getByText("赫尔墨斯认知进化引擎")).toBeVisible();
  await page.getByRole("checkbox", { name: "启用学习自进化" }).check();
  await expect(page.getByText("Hermes Agent 已就绪")).toBeVisible();
  await page.locator(".evolution-model-config > summary").click();
  await expect(
    page.locator(
      'input[value="https://ark.cn-beijing.volces.com/api/v3"]'
    )
  ).toBeVisible();
  await expect(
    page.locator('input[value="doubao-seed-evolving"]')
  ).toBeVisible();
  await page.getByPlaceholder("••••••••••••").fill("test-secret-key");
  await page.getByRole("button", { name: "保存并验证模型" }).click();
  await expect(
    page.getByText("连接验证成功，Hermes 已使用该模型")
  ).toBeVisible();
  expect(savedInference?.apiKey).toBe("test-secret-key");

  await page.getByRole("button", { name: "本地 MLX" }).click();
  await expect(page.getByText("本地模型正在运行")).toBeVisible();
  await expect(
    page.locator('input[value="http://127.0.0.1:8800/v1"]')
  ).toBeVisible();
  await page.getByRole("button", { name: "保存并验证模型" }).click();
  await expect(
    page.getByText("连接验证成功，Hermes 已使用该模型")
  ).toBeVisible();
  expect(savedInference?.mode).toBe("local");

  await page.getByRole("button", { name: /立即进化/ }).click();

  await expect(page.getByText("最新认知跃迁报告")).toBeVisible();
  await expect(page.getByText("持续表达", { exact: true })).toBeVisible();
  await expect(page.getByText("第 1 周：连续表达强化")).toBeVisible();

  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("easysay-state-v1") ?? "{}")
  );
  expect(state.plan.generatedBy).toBe("hermes");
  expect(state.plan.weeks[0].theme).toBe("连续表达强化");
  expect(state.evolution.lastAnalyzedRecordCount).toBe(1);
});
