import { expect, test } from "@playwright/test";

test("route output, flashcards and listening subtitles", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const weeks = Array.from({ length: 24 }, (_, index) => ({
      week: index + 1,
      phase: index < 4 ? "开口启动" : "真实迁移",
      theme: index === 0 ? "模拟面试" : `场景 ${index + 1}`,
      outcome: "完成一轮真实场景对话",
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
          name: "视觉验收",
          level: "A2",
          goal: "interview",
          minutesPerDay: 45,
          accent: "american",
          nativeLanguage: "zh-CN",
          targetLanguage: "en",
          createdAt: new Date().toISOString()
        },
        baseline: {
          completedAt: new Date().toISOString(),
          selfIntroTranscript: "Hello",
          storyTranscript: "Yesterday",
          focusAreas: [],
          scores: {
            intelligibility: 2,
            fluency: 2,
            expression: 2,
            interaction: 2
          }
        },
        plan: {
          title: "职场英语提升计划",
          level: "A2",
          goal: "interview",
          summary: "从真实面试场景开始练习。",
          generatedBy: "local",
          weeks
        },
        progress: {
          completedTaskIds: [],
          records: [],
          streak: 0,
          weeklySpeakingSeconds: 0,
          knownChunks: []
        }
      })
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "路线" }).click();

  await page.getByText("输出训练", { exact: true }).click();
  await page
    .locator(".output-drill-list details")
    .first()
    .locator("summary")
    .click();
  await expect(page.getByText("参考回答").first()).toBeVisible();
  await expect(page.getByText("还可以这样表达").first()).toBeVisible();
  await expect(page.getByText("避免这样说").first()).toBeVisible();

  await page.getByText("记忆卡片", { exact: true }).click();
  const memoryCard = page.locator(".memory-card");
  await memoryCard.click();
  await expect(memoryCard).toHaveClass(/revealed/);
  await expect(memoryCard.locator("em")).toBeVisible();

  await page.getByText("视频盲听 · 验证", { exact: true }).scrollIntoViewIfNeeded();
  const modes = page.locator(".subtitle-mode-control button");
  await expect(modes).toHaveCount(5);

  await page.getByRole("button", { name: "中 / 英" }).click();
  let captions = page.locator(".video-subtitles > p");
  await expect(captions).toHaveCount(2);
  await expect(captions.nth(0)).toHaveClass(/native-caption/);
  await expect(captions.nth(1)).toHaveClass(/target-caption/);

  await page.getByRole("button", { name: "英 / 中" }).click();
  captions = page.locator(".video-subtitles > p");
  await expect(captions.nth(0)).toHaveClass(/target-caption/);
  await expect(captions.nth(1)).toHaveClass(/native-caption/);

  await page.getByRole("button", { name: "仅英语" }).click();
  await expect(page.locator(".video-subtitles > p")).toHaveCount(1);
  await expect(page.locator(".video-subtitles > p")).toHaveClass(/target-caption/);

  await page.getByRole("button", { name: "仅中文" }).click();
  await expect(page.locator(".video-subtitles > p")).toHaveCount(1);
  await expect(page.locator(".video-subtitles > p")).toHaveClass(/native-caption/);

  await page.getByRole("button", { name: "盲听", exact: true }).click();
  await expect(page.locator(".video-subtitles")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const screen = document.querySelector(".screen")!;
    const nav = document.querySelector(".bottom-nav")!;
    return {
      screenWidth: screen.clientWidth,
      screenScrollWidth: screen.scrollWidth,
      navBottom: nav.getBoundingClientRect().bottom,
      controlsFit: Array.from(
        document.querySelectorAll(".subtitle-mode-control button")
      ).every(
        (button) =>
          button.scrollWidth <= button.getBoundingClientRect().width + 1
      )
    };
  });
  expect(layout.screenScrollWidth).toBe(layout.screenWidth);
  expect(layout.navBottom).toBeLessThanOrEqual(844);
  expect(layout.controlsFit).toBe(true);
});
