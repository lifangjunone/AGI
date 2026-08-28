import { expect, test } from "@playwright/test";

test("learner can confirm progress without being trapped", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const weeks = Array.from({ length: 24 }, (_, index) => ({
      week: index + 1,
      phase: "开口启动",
      theme: index === 0 ? "认识你自己" : `场景 ${index + 1}`,
      outcome: "完成自然的自我介绍",
      chunks: [
        "I work in ...",
        "Most of my time goes into ...",
        "Could you say that again?",
        "The main reason is ..."
      ]
    }));
    localStorage.setItem(
      "easysay-state-v1",
      JSON.stringify({
        profile: {
          name: "确认通过测试",
          level: "A2",
          goal: "daily",
          minutesPerDay: 45,
          accent: "american",
          nativeLanguage: "zh-CN",
          targetLanguage: "en",
          createdAt: new Date().toISOString()
        },
        baseline: {
          completedAt: new Date().toISOString(),
          selfIntroTranscript: "",
          storyTranscript: "",
          focusAreas: [],
          scores: {
            intelligibility: 1,
            fluency: 1,
            expression: 1,
            interaction: 1
          }
        },
        plan: {
          title: "测试路线",
          level: "A2",
          goal: "daily",
          summary: "测试用户确认通过。",
          generatedBy: "local",
          weeks
        },
        progress: {
          completedTaskIds: [],
          userConfirmedTaskIds: [],
          records: [],
          streak: 0,
          weeklySpeakingSeconds: 0,
          knownChunks: []
        }
      })
    );
  });
  await page.reload();

  await page.getByText("拿走4个表达块", { exact: true }).click();
  await page.getByRole("button", { name: /已练 0 句，先继续/ }).click();
  await expect(page.getByText("确认先继续？")).toBeVisible();
  await page.getByRole("button", { name: "确认通过" }).click();
  await expect(page.getByText("本关已通过")).toBeVisible();
  await page.getByRole("button", { name: "领取积分并返回" }).click();
  await expect(page.getByText("拿走4个表达块", { exact: true })).toBeVisible();

  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("easysay-state-v1") ?? "{}")
  );
  expect(state.progress.userConfirmedTaskIds).toHaveLength(1);
  expect(state.progress.knownChunks).toHaveLength(0);
});
