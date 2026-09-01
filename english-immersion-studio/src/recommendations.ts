import { scenarios, type Scenario } from "./data";
import type { Difficulty } from "./language";

export type LearningProfile = {
  turns: number;
  fluency: number;
  accuracy: number;
  expression: number;
  vocabulary: number;
  averageWords: number;
  connectorUses: number;
};

export type AdaptiveRecommendation = {
  id: string;
  scenario: Scenario;
  difficulty: Difficulty;
  focus: "fluency" | "accuracy" | "expression" | "vocabulary";
  focusLabel: string;
  reason: string;
};

export const initialLearningProfile: LearningProfile = {
  turns: 0,
  fluency: 82,
  accuracy: 88,
  expression: 76,
  vocabulary: 72,
  averageWords: 0,
  connectorUses: 0
};

export function updateLearningProfile(
  profile: LearningProfile,
  scores: { fluency: number; accuracy: number; expression: number },
  input: string
): LearningProfile {
  const words = input.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  const uniqueWords = new Set(words.map((word) => word.toLowerCase())).size;
  const connectorUses = (
    input.match(/\b(because|however|although|therefore|while|so|but|and)\b/gi) ?? []
  ).length;
  const vocabulary = Math.min(
    98,
    54 + uniqueWords * 3 + Math.min(connectorUses * 5, 15)
  );
  const nextTurns = profile.turns + 1;
  const average = (current: number, next: number) =>
    Math.round((current * profile.turns + next) / nextTurns);

  return {
    turns: nextTurns,
    fluency: average(profile.fluency, scores.fluency),
    accuracy: average(profile.accuracy, scores.accuracy),
    expression: average(profile.expression, scores.expression),
    vocabulary: average(profile.vocabulary, vocabulary),
    averageWords: Number(
      ((profile.averageWords * profile.turns + words.length) / nextTurns).toFixed(1)
    ),
    connectorUses: profile.connectorUses + connectorUses
  };
}

function sameOrNextLevel(difficulty: Difficulty, challenge: boolean): Difficulty {
  const levels: Difficulty[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const index = levels.indexOf(difficulty);
  return levels[Math.min(levels.length - 1, index + (challenge ? 1 : 0))];
}

function recommendedScenario(
  focus: AdaptiveRecommendation["focus"],
  profile: LearningProfile,
  difficulty: Difficulty
): AdaptiveRecommendation {
  if (focus === "accuracy") {
    const base = scenarios.find((scenario) => scenario.id === "hotel")!;
    return {
      id: "accuracy-booking-repair",
      focus,
      focusLabel: "准确度",
      difficulty: sameOrNextLevel(difficulty, profile.accuracy > 84),
      reason: `准确度 ${profile.accuracy} · 强化疑问句、时间与房型信息`,
      scenario: {
        ...base,
        title: "The Booking Mix-Up",
        subtitle: "AI · Accuracy repair",
        mood: "Precise",
        opening:
          "I can see two similar reservations under your name, but the dates and room types do not match. Please help me identify the correct booking.",
        openingChinese:
          "我看到你的姓名下有两个相似的预订，但日期和房型不一致。请帮我确认正确的预订。",
        goals: ["Confirm exact dates", "Correct one detail politely", "Restate the final booking"],
        suggestions: [
          "The correct arrival date should be...",
          "I believe the room type was...",
          "Could we confirm the final details once more?"
        ],
        suggestionChinese: [
          "正确的抵达日期应该是……",
          "我记得房型应该是……",
          "我们可以再确认一次最终信息吗？"
        ]
      }
    };
  }

  if (focus === "fluency") {
    const base = scenarios.find((scenario) => scenario.id === "restaurant")!;
    return {
      id: "fluency-lunch-rush",
      focus,
      focusLabel: "流利度",
      difficulty: sameOrNextLevel(difficulty, profile.fluency > 84),
      reason: `流利度 ${profile.fluency} · 练习快速回应和连续表达`,
      scenario: {
        ...base,
        title: "The Lunch Rush",
        subtitle: "AI · Fluency sprint",
        mood: "Energetic",
        opening:
          "We are about to close the lunch menu, so I will ask you three quick questions. What would you like to order first?",
        openingChinese:
          "午餐菜单马上结束，我会快速问你三个问题。你想先点什么？",
        goals: ["Answer without long pauses", "Link two ideas naturally", "Complete three quick turns"],
        suggestions: [
          "I'd like the sea bass, and could I also...",
          "First, I'll have...",
          "That sounds good, but may I change..."
        ],
        suggestionChinese: [
          "我想要海鲈鱼，另外可以……",
          "首先，我要……",
          "听起来不错，不过我可以换成……"
        ]
      }
    };
  }

  if (focus === "expression") {
    const base = scenarios.find((scenario) => scenario.id === "small-talk")!;
    return {
      id: "expression-story-detail",
      focus,
      focusLabel: "表达力",
      difficulty: sameOrNextLevel(difficulty, profile.expression > 84),
      reason: `表达力 ${profile.expression} · 增加情绪、细节和个人观点`,
      scenario: {
        ...base,
        title: "Tell Me What Happened",
        subtitle: "AI · Expression builder",
        mood: "Curious",
        opening:
          "You mentioned that something unexpected happened this week. Tell me the story as if I were there with you.",
        openingChinese:
          "你提到这周发生了一件意外的事。请把故事讲得像我当时就在你身边一样。",
        goals: ["Name the emotion", "Add one sensory detail", "Explain why it mattered"],
        suggestions: [
          "At first, I felt...",
          "What surprised me most was...",
          "It mattered to me because..."
        ],
        suggestionChinese: [
          "一开始，我感到……",
          "最让我意外的是……",
          "这件事对我重要，因为……"
        ]
      }
    };
  }

  const base = scenarios.find((scenario) => scenario.id === "clinic")!;
  return {
    id: "vocabulary-symptom-detective",
    focus,
    focusLabel: "词汇",
    difficulty: sameOrNextLevel(difficulty, profile.vocabulary > 84),
    reason: `词汇 ${profile.vocabulary} · 扩展描述状态、程度与变化的词汇`,
    scenario: {
      ...base,
      title: "The Symptom Detective",
      subtitle: "AI · Vocabulary expansion",
      mood: "Observant",
      opening:
        "I need a precise picture of how your symptoms changed during the day. Describe the location, intensity, and pattern in your own words.",
      openingChinese:
        "我需要准确了解你的症状在一天中如何变化。请用自己的话描述位置、强度和规律。",
      goals: ["Use three descriptive words", "Compare intensity", "Describe change over time"],
      suggestions: [
        "The discomfort feels...",
        "It gradually became more...",
        "Compared with this morning..."
      ],
      suggestionChinese: [
        "这种不适感觉像……",
        "它逐渐变得更……",
        "和今天早上相比……"
      ]
    }
  };
}

export function buildRecommendations(
  profile: LearningProfile,
  difficulty: Difficulty
): AdaptiveRecommendation[] {
  const ranked: Array<{
    focus: AdaptiveRecommendation["focus"];
    score: number;
  }> = [
    { focus: "fluency" as const, score: profile.fluency },
    { focus: "accuracy" as const, score: profile.accuracy },
    { focus: "expression" as const, score: profile.expression },
    { focus: "vocabulary" as const, score: profile.vocabulary }
  ].sort((left, right) => left.score - right.score);

  return ranked
    .slice(0, 3)
    .map(({ focus }) => recommendedScenario(focus, profile, difficulty));
}
