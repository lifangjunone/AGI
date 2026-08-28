import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const lesson = {
      category: "日常表达",
      difficulty: 2,
      roles: [
        { name: "伙伴", description: "发起对话" },
        { name: "学习者", description: "完成表达" }
      ],
      dialogues: [
        {
          speaker: "伙伴",
          target: "What do you like to eat?",
          translation: "你喜欢吃什么？"
        },
        {
          speaker: "学习者",
          target: "I like to eat fresh apples every morning.",
          translation: "我喜欢每天早上吃新鲜的苹果。"
        },
        {
          speaker: "伙伴",
          target: "Why do you like them?",
          translation: "你为什么喜欢？"
        }
      ],
      vocabulary: [],
      patterns: [],
      outputDrills: [
        {
          question: "Why do you choose apples?",
          questionTranslation: "你为什么选择苹果？",
          answer:
            "I choose fresh apples because they are easy to prepare every morning.",
          answerTranslation: "我选择新鲜苹果，因为每天早上准备起来很方便。",
          alternatives: ["I prefer fresh fruit in the morning."],
          commonMistake: "I choose apple because easy.",
          explanation: "补充 because 原因，让表达更完整。"
        }
      ],
      flashcards: []
    };
    const weeks = Array.from({ length: 24 }, (_, index) => ({
      week: index + 1,
      phase: "开口启动",
      theme: "早餐与习惯",
      outcome: "描述自己的早餐习惯",
      chunks: [
        "I like fresh apples.",
        "Every morning, I ...",
        "I work in ...",
        "For example, ..."
      ],
      lesson
    }));
    localStorage.setItem(
      "easysay-state-v1",
      JSON.stringify({
        profile: {
          name: "产品体验测试",
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
          focusAreas: ["持续表达"],
          scores: {
            intelligibility: 2,
            fluency: 2,
            expression: 2,
            interaction: 2
          }
        },
        plan: {
          title: "产品学习闭环",
          level: "A2",
          goal: "daily",
          summary: "测试产品化训练。",
          generatedBy: "local",
          weeks
        },
        progress: {
          completedTaskIds: [],
          userConfirmedTaskIds: [],
          records: [
            {
              id: "weakness-record",
              taskId: "week-1-free-speak",
              createdAt: new Date().toISOString(),
              durationSeconds: 42,
              transcript: "I like apples.",
              feedback: {
                summary: "表达清楚，但缺少原因和细节。",
                intelligibility: 4,
                fluency: 3,
                expression: 2,
                interaction: 3,
                priorityIssue: "句子过短，缺少原因展开",
                grammarFix: "补充 because 或具体例子。",
                naturalPhrases: [
                  "I like fresh apples because they are easy to prepare."
                ],
                retryPrompt: "补充一个原因，再完整说一次。",
                source: "local"
              }
            }
          ],
          streak: 2,
          weeklySpeakingSeconds: 0,
          totalPoints: 1200,
          bestCombo: 3,
          knownChunks: []
        }
      })
    );
  });
  await page.reload();
});

test("smart session, sentence map, combo and settlement form one loop", async ({
  page
}) => {
  await expect(page.getByText("1,200 XP")).toBeVisible();
  await page.getByRole("button", { name: "智能组练" }).click();
  await expect(page.getByRole("dialog", { name: "今日智能组练" })).toBeVisible();
  await page.getByRole("button", { name: "跟读" }).click();
  await page.getByRole("button", { name: "开口" }).click();
  await page.getByRole("button", { name: "开始这一局" }).click();

  await expect(page.getByText("COMBO × 0")).toBeVisible();
  await expect(page.getByText("I work in ...", { exact: true })).toBeVisible();
  await expect(
    page.getByText("I work in product design for a technology company.", {
      exact: true
    })
  ).toBeVisible();
  await expect(
    page.getByText("我在一家科技公司从事产品设计工作。", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("自我介绍时说明职业领域", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: /句型骨架 I work in/ })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/sentence-frame-mobile-audit.png"
  });
  await expect(page.getByText("句子透视")).toBeVisible();
  await expect(page.getByText("主语", { exact: true })).toBeVisible();
  await expect(page.getByText("谓语", { exact: true })).toBeVisible();
  await expect(page.getByText("宾语", { exact: true })).toBeVisible();
  await expect(page.getByText("状语", { exact: true })).toBeVisible();
  await expect(page.getByText("/aɪ/", { exact: true })).toBeVisible();
  await expect(page.getByText("/tə/", { exact: true })).toBeVisible();
  await expect(page.getByText("/ˈæpəlz/", { exact: true })).toBeVisible();
  await expect(page.getByText("代词", { exact: true })).toBeVisible();
  await expect(page.getByText("不定式标记", { exact: true })).toBeVisible();
  await expect(page.getByText("限定词", { exact: true })).toBeVisible();
  await expect(page.getByText("弱读", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("连读", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /播放 apples，\/ˈæpəlz\// })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "自然语速播放整句" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "慢速播放整句" })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "薄弱项强化推荐" })
  ).toBeVisible();
  await expect(
    page.getByText("最近练习暴露“句子过短，缺少原因展开”")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "换下一句" })).toBeVisible();

  const sentenceLabFitsViewport = await page
    .locator(".sentence-lab")
    .first()
    .evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth &&
        element.getBoundingClientRect().right <= window.innerWidth
    );
  expect(sentenceLabFitsViewport).toBe(true);
  const clippedWords = await page
    .locator(".sentence-lab")
    .first()
    .locator(".sentence-word > strong")
    .evaluateAll((words) =>
      words
        .filter((word) => word.scrollWidth > word.clientWidth)
        .map((word) => word.textContent)
    );
  expect(clippedWords).toEqual([]);
  await page.locator(".sentence-lab").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/sentence-recommendation-mobile-audit.png"
  });
  await page.getByRole("button", { name: "开始强化" }).click();
  await expect(
    page
      .locator(".sentence-overview")
      .getByText(
        "I choose fresh apples because they are easy to prepare every morning.",
        { exact: true }
      )
  ).toBeVisible();
  await expect(
    page.getByText("我选择新鲜苹果，因为每天早上准备起来很方便。", {
      exact: true
    })
  ).toBeVisible();
  const longSentenceLayout = await page
    .locator(".sentence-lab")
    .first()
    .evaluate((element) => ({
      fits:
        element.scrollWidth <= element.clientWidth &&
        element.getBoundingClientRect().right <= window.innerWidth,
      widestWord: Math.max(
        ...Array.from(element.querySelectorAll(".sentence-word")).map(
          (word) => word.getBoundingClientRect().width
        )
      ),
      overviewWraps:
        (element.querySelector(".sentence-overview p")?.scrollWidth ?? 0) <=
        (element.querySelector(".sentence-overview p")?.clientWidth ?? 0)
    }));
  expect(longSentenceLayout).toEqual({
    fits: true,
    widestWord: expect.any(Number),
    overviewWraps: true
  });
  expect(longSentenceLayout.widestWord).toBeLessThanOrEqual(132);
  await expect(page.locator(".sentence-lab").first()).not.toHaveClass(
    /is-changing/
  );
  await page.locator(".sentence-lab").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/sentence-lab-long-mobile-audit.png"
  });
  await page.getByRole("button", { name: "换下一句" }).click();
  await expect(
    page.locator(".sentence-overview small")
  ).toContainText(/\d+ \//);
  await page.getByRole("button", { name: "自然语速播放整句" }).click();
  await expect(page.locator(".sentence-lab").first()).toHaveClass(
    /is-playing/
  );
  await expect(page.locator(".sentence-word.playing").first()).toBeVisible();
  await page.locator(".sentence-lab").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/sentence-lab-mobile-audit.png"
  });

  await page
    .locator(".chunk-stack")
    .getByRole("button", { name: /I like fresh apples/ })
    .click();
  await expect(page.getByText("COMBO × 1")).toBeVisible();
  await expect(page.getByText("Perfect")).toBeVisible();

  await page.getByRole("button", { name: /已练 1 句，先继续/ }).click();
  await page.getByRole("button", { name: "确认通过" }).click();
  await expect(page.getByText("本关已通过")).toBeVisible();
  await expect(page.getByText("最高连击")).toBeVisible();
  await page.getByRole("button", { name: "领取积分并返回" }).click();

  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("easysay-state-v1") ?? "{}")
  );
  expect(state.progress.totalPoints).toBeGreaterThan(1200);
  expect(state.progress.bestCombo).toBe(3);
});

test("AI tutor is available in the sentence context", async ({ page }) => {
  await page.getByText("听懂今天的场景", { exact: true }).click();
  await page.getByRole("button", { name: "问 AI 老师" }).click();
  await expect(page.getByText("随练 AI 老师")).toBeVisible();
  const sentenceLab = page.locator(".sentence-lab").first();
  const tutor = sentenceLab.getByRole("region", {
    name: "当前句子的 AI 老师"
  });
  await expect(tutor).toBeVisible();
  await expect(
    sentenceLab.locator(".sentence-overview-translation")
  ).not.toBeEmpty();
  const questionInput = page.getByLabel("输入当前句子的问题");
  await expect(questionInput).toHaveCSS("font-size", "16px");
  await sentenceLab.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/sentence-tutor-mobile-audit.png"
  });
  await page
    .getByPlaceholder("这里为什么这样说？")
    .fill("为什么这里用 every morning？");
  await questionInput.focus();
  await questionInput.blur();
  await expect(page.locator(".practice-overlay")).toHaveCSS(
    "width",
    "390px"
  );
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText("先看这个表达在整句中的作用", { exact: false })
  ).toBeVisible();
});

test("long words remain complete on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "智能组练" }).click();
  await page.getByRole("button", { name: "开始这一局" }).click();

  const overview = page.locator(".sentence-overview p");
  for (let index = 0; index < 8; index += 1) {
    if ((await overview.textContent())?.includes("technology company")) break;
    await page.getByRole("button", { name: "换下一句" }).click();
  }
  await expect(overview).toContainText("technology company");

  const layout = await page.locator(".sentence-lab").first().evaluate((lab) => {
    const selectors = [
      ".word-ipa",
      ".sentence-word > strong",
      ".word-meaning",
      ".word-meta"
    ];
    const clipped = selectors.flatMap((selector) =>
      Array.from(lab.querySelectorAll<HTMLElement>(selector))
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1 ||
            getComputedStyle(element).textOverflow === "ellipsis"
        )
        .map((element) => element.textContent?.trim())
    );
    return {
      clipped,
      labOverflow: lab.scrollWidth > lab.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  expect(layout).toEqual({
    clipped: [],
    labOverflow: false,
    pageOverflow: false
  });
  const technologyWord = page.getByRole("button", {
    name: /播放 technology，\/tekˈnɑːlədʒi\//
  });
  await expect(technologyWord).toBeVisible();
  await expect(
    page.getByRole("button", { name: /播放 company，\/ˈkʌmpəni\// })
  ).toBeVisible();
  await technologyWord.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/sentence-lab-320px-audit.png"
  });
});
