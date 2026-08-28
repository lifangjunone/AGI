import type {
  AppProgress,
  DailyTask,
  EvolutionResult,
  EvolutionState,
  LanguageCode,
  LearnerProfile,
  LearningPlan,
  WeekPlan
} from "../types";
import { addLocalDays, localDateKey, localWeekKey } from "../lib/date";
import { getLanguage } from "./languages";

export const REVIEW_GAPS_DAYS = [1, 3, 7, 14] as const;

export function getFirstReviewAt(now: Date): string {
  return addLocalDays(now, REVIEW_GAPS_DAYS[0]);
}

export function getNextReview(
  reviewStep: number,
  now: Date
): { reviewStep: number; nextReviewAt: string } {
  const nextStep = Math.min(reviewStep + 1, REVIEW_GAPS_DAYS.length - 1);
  return {
    reviewStep: nextStep,
    nextReviewAt: addLocalDays(now, REVIEW_GAPS_DAYS[nextStep])
  };
}

const themes = [
  ["认识你自己", "完成自然的自我介绍，并提出三个追问"],
  ["我的一天", "描述日常安排、频率和时间"],
  ["家人与朋友", "介绍关系并讲述一个共同经历"],
  ["兴趣与周末", "表达喜好并邀请对方参加活动"],
  ["咖啡店点单", "点单、修改需求并确认价格"],
  ["购物与退换", "比较商品、询价并处理退换"],
  ["问路与交通", "询问路线并复述关键方向"],
  ["酒店入住", "完成入住并处理房间问题"],
  ["旅行故事", "按时间顺序讲述一次旅行"],
  ["电影与音乐", "表达观点并给出具体理由"],
  ["健康与就医", "描述症状并确认医嘱"],
  ["社交寒暄", "开启、维持并礼貌结束对话"],
  ["工作职责", "清楚介绍岗位、职责和成果"],
  ["进度同步", "汇报进展、风险和下一步"],
  ["提出建议", "给出建议并说明取舍"],
  ["会议讨论", "同意、保留意见和礼貌打断"],
  ["问题说明", "解释故障、影响和解决方案"],
  ["三分钟汇报", "使用清晰结构完成工作汇报"],
  ["观点表达", "提出立场、理由和例子"],
  ["比较与选择", "比较方案并做出推荐"],
  ["新闻复述", "概括事实并表达个人看法"],
  ["模拟面试", "回答经历、优势和情景问题"],
  ["完整旅行任务", "完成从机场到酒店的连续任务"],
  ["最终挑战", "完成十五分钟综合对话与复盘"]
] as const;

const phaseForWeek = (week: number) => {
  if (week <= 4) return "开口启动";
  if (week <= 8) return "生存口语";
  if (week <= 12) return "社交表达";
  if (week <= 16) return "职场沟通";
  if (week <= 20) return "即兴表达";
  return "真实迁移";
};

const universalChunks: Record<LanguageCode, string[]> = {
  "zh-CN": ["请让我想一下。", "我的意思是……", "可以再说一遍吗？", "主要原因是……"],
  en: [
    "Let me think for a second.",
    "What I mean is ...",
    "Could you say that again?",
    "The main reason is ..."
  ],
  ja: ["少し考えさせてください。", "つまり……", "もう一度お願いします。", "主な理由は……"],
  ko: ["잠시 생각해 볼게요.", "제 말은……", "다시 말씀해 주시겠어요?", "가장 큰 이유는……"],
  es: ["Déjame pensarlo.", "Lo que quiero decir es...", "¿Puedes repetirlo?", "La razón principal es..."],
  fr: ["Laissez-moi réfléchir.", "Ce que je veux dire, c'est...", "Pouvez-vous répéter ?", "La raison principale est..."]
};

const chunksForTheme = (
  theme: string,
  targetLanguage: LanguageCode
): string[] => {
  const universal = universalChunks[targetLanguage];

  const mapped: Record<string, string[]> = {
    认识你自己: ["I work in ...", "Most of my time goes into ..."],
    咖啡店点单: ["Could I get ...?", "Can I have that without ...?"],
    酒店入住: ["I have a reservation under ...", "Could you help me with ...?"],
    进度同步: ["So far, we've ...", "The main blocker is ..."],
    会议讨论: ["I see your point, but ...", "Can I add something here?"],
    模拟面试: ["A good example would be ...", "What I learned from that was ..."]
  };

  const themed =
    targetLanguage === "en" ? mapped[theme] ?? universal.slice(0, 2) : [];
  return [...themed, ...universal].slice(0, 4);
};

function lessonFor(
  theme: string,
  outcome: string,
  chunks: string[],
  profile: LearnerProfile
): NonNullable<WeekPlan["lesson"]> {
  const target = getLanguage(profile.targetLanguage);
  const roleByGoal = {
    daily: ["交流伙伴", "学习者"],
    travel: ["当地服务人员", "旅行者"],
    work: ["同事或主管", "职场沟通者"],
    interview: ["招聘经理", "候选人"]
  };
  const [partner, learner] = roleByGoal[profile.goal];
  const difficultyByLevel = { A1: 1, A2: 2, B1: 3, B2: 4 };
  const isEnglishInterview =
    profile.targetLanguage === "en" && profile.goal === "interview";
  const dialogues = isEnglishInterview
    ? [
        {
          speaker: "Hiring manager",
          target: "Can you tell me about your professional background?",
          translation: "能请你介绍一下你的专业背景吗？"
        },
        {
          speaker: "Candidate",
          target:
            "Certainly. I have a degree in business administration and five years of experience in project management.",
          translation: "当然。我拥有工商管理学位和五年项目管理经验。"
        },
        {
          speaker: "Hiring manager",
          target: "What attracted you to our company?",
          translation: "是什么吸引你应聘我们公司？"
        },
        {
          speaker: "Candidate",
          target:
            "I am impressed by your innovation and commitment to sustainability.",
          translation: "贵公司的创新能力和对可持续发展的承诺给我留下了深刻印象。"
        }
      ]
    : [
        {
          speaker: partner,
          target: target.sample,
          translation: `${theme}场景的开场表达`
        },
        {
          speaker: learner,
          target: chunks[0],
          translation: outcome
        },
        {
          speaker: partner,
          target: chunks[2] ?? chunks[0],
          translation: "请求澄清并继续对话"
        }
      ];

  return {
    category: profile.goal === "interview" ? "求职 · 面试" : `${theme} · 场景口语`,
    difficulty: difficultyByLevel[profile.level],
    roles: [
      { name: partner, description: `在“${theme}”场景中发起问题并推动对话。` },
      { name: learner, description: `使用${target.label}完成任务：${outcome}` }
    ],
    dialogues,
    vocabulary: chunks.slice(0, 4).map((term, index) => ({
      term,
      pronunciation:
        profile.targetLanguage === "en"
          ? ["/ˈprɑːfɛʃənl/", "/dɪˈɡriː/", "/ˈprɑːdʒekt/", "/ˈriːzən/"][
              index
            ]
          : undefined,
      meaning: ["核心开场", "补充信息", "确认理解", "说明原因"][index] ?? "场景表达",
      example: dialogues[Math.min(index, dialogues.length - 1)]?.target ?? term
    })),
    patterns: chunks.slice(0, 3).map((pattern, index) => ({
      pattern,
      translation: ["用于自然开场", "用于补充或澄清", "用于保持对话继续"][index]
    })),
    outputDrills: dialogues
      .filter((_, index) => index % 2 === 0)
      .slice(0, 3)
      .map((line, index) => {
        const answer = dialogues[index * 2 + 1] ?? dialogues[1] ?? line;
        return {
          question: line.target,
          questionTranslation: line.translation,
          answer: answer.target,
          answerTranslation: answer.translation,
          alternatives: [
            chunks[index % chunks.length],
            chunks[(index + 1) % chunks.length]
          ],
          commonMistake:
            profile.targetLanguage === "en"
              ? "I did this for like many years."
              : `避免逐字翻译母语，优先使用完整表达块：${chunks[index % chunks.length]}`,
          explanation: "先给结论，再补充一条具体经历或理由，表达会更清楚。"
        };
      }),
    flashcards: chunks.slice(0, 4).map((term, index) => ({
      term,
      pronunciation:
        profile.targetLanguage === "en"
          ? ["/ˈprɑːfɛʃənl/", "/dɪˈɡriː/", "/ˈprɑːdʒekt/", "/ˈriːzən/"][
              index
            ]
          : undefined,
      meaning: ["核心开场", "补充信息", "确认理解", "说明原因"][index] ?? "场景表达",
      example: dialogues[Math.min(index, dialogues.length - 1)]?.target ?? term,
      recallPrompt: `看到“${["开场", "经历", "澄清", "理由"][index]}”，你能说出这个表达吗？`
    }))
  };
}

export function createFallbackPlan(profile: LearnerProfile): LearningPlan {
  const goalLabels = {
    daily: "日常交流",
    travel: "旅行沟通",
    work: "职场表达",
    interview: "英文面试"
  };

  const weeks: WeekPlan[] = themes.map(([theme, outcome], index) => {
    const chunks = chunksForTheme(theme, profile.targetLanguage);
    return {
      week: index + 1,
      phase: phaseForWeek(index + 1),
      theme,
      outcome,
      chunks,
      lesson: lessonFor(theme, outcome, chunks, profile)
    };
  });

  return {
    title: `${profile.name}的24周${getLanguage(profile.targetLanguage).label}${goalLabels[profile.goal]}路线`,
    level: profile.level,
    goal: profile.goal,
    summary: `从${profile.level}当前水平出发，每天${profile.minutesPerDay}分钟。训练优先级是可理解、及时回应和持续表达，而不是追求完美口音。`,
    generatedBy: "local",
    weeks
  };
}

export function enrichLearningPlan(
  profile: LearnerProfile,
  plan: LearningPlan
): LearningPlan {
  const fallback = createFallbackPlan(profile);
  return {
    ...plan,
    weeks: plan.weeks.map((week, index) => {
      const fallbackLesson = fallback.weeks[index].lesson!;
      return {
        ...week,
        lesson: {
          ...fallbackLesson,
          ...week.lesson,
          outputDrills:
            week.lesson?.outputDrills ?? fallbackLesson.outputDrills,
          flashcards: week.lesson?.flashcards ?? fallbackLesson.flashcards
        }
      };
    })
  };
}

export function applyEvolutionToPlan(
  profile: LearnerProfile,
  plan: LearningPlan,
  result: EvolutionResult
): LearningPlan {
  const currentWeek = getCurrentWeek(profile);
  const adjustments = new Map(
    result.weekAdjustments
      .filter((item) => item.week >= currentWeek && item.week <= 24)
      .map((item) => [item.week, item])
  );

  return {
    ...plan,
    generatedBy: "hermes",
    summary: result.insight.summary,
    weeks: plan.weeks.map((week) => {
      const adjustment = adjustments.get(week.week);
      if (!adjustment) return week;
      return {
        ...week,
        theme: adjustment.theme,
        outcome: adjustment.outcome,
        chunks: adjustment.chunks,
        lesson: lessonFor(
          adjustment.theme,
          adjustment.outcome,
          adjustment.chunks,
          profile
        )
      };
    })
  };
}

export function getCurrentWeek(profile: LearnerProfile): number {
  const start = new Date(profile.createdAt).getTime();
  const elapsed = Math.max(0, Date.now() - start);
  return Math.min(24, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

export function createDailyTasks(
  profile: LearnerProfile,
  plan: LearningPlan,
  progress: AppProgress
): DailyTask[] {
  const week = plan.weeks[getCurrentWeek(profile) - 1] ?? plan.weeks[0];
  const targetLabel = getLanguage(profile.targetLanguage).label;
  const dateKey = localDateKey();
  const dueChunks = progress.knownChunks.filter(
    (chunk) => localDateKey(new Date(chunk.nextReviewAt)) <= dateKey
  );
  const dueChunkTexts = dueChunks.map((chunk) => chunk.text);
  const chunkPracticeItems = [
    ...dueChunkTexts,
    ...week.chunks.filter((chunk) => !dueChunkTexts.includes(chunk))
  ];
  const inputMinutes = Math.max(5, Math.round(profile.minutesPerDay * 0.16));
  const shadowMinutes = Math.max(5, Math.round(profile.minutesPerDay * 0.18));
  const chunkMinutes = Math.max(5, Math.round(profile.minutesPerDay * 0.16));
  const freeSpeakMinutes = Math.max(8, Math.round(profile.minutesPerDay * 0.25));
  const roleplayMinutes = Math.max(
    8,
    profile.minutesPerDay -
      inputMinutes -
      shadowMinutes -
      chunkMinutes -
      freeSpeakMinutes
  );
  const definitions: Omit<DailyTask, "completed">[] = [
    {
      id: `${dateKey}-input`,
      type: "input",
      title: "听懂今天的场景",
      description: `先听懂“${week.theme}”中的核心意图，不逐词翻译。`,
      minutes: inputMinutes
    },
    {
      id: `${dateKey}-shadow`,
      type: "shadow",
      title: `跟住${targetLabel}节奏`,
      description: "模仿重音、停顿和弱读，录下你的版本。",
      minutes: shadowMinutes
    },
    {
      id: `${dateKey}-chunks`,
      type: "chunks",
      title: "拿走4个表达块",
      description: dueChunks.length
        ? `先复现 ${dueChunks.length} 个到期表达，再练本周表达`
        : week.chunks.join(" · "),
      minutes: chunkMinutes,
      practiceItems: chunkPracticeItems
    },
    {
      id: `${dateKey}-free-speak`,
      type: "free-speak",
      title: "脱稿说2分钟",
      description: week.outcome,
      minutes: freeSpeakMinutes
    },
    {
      id: `${dateKey}-roleplay`,
      type: "roleplay",
      title: "完成场景对话",
      description: `进入“${week.theme}”角色扮演，建议完成10轮，也可确认提前结束。`,
      minutes: roleplayMinutes
    }
  ];

  return definitions.map((task) => ({
    ...task,
    completed: progress.completedTaskIds.includes(task.id)
  }));
}

export const emptyProgress: AppProgress = {
  completedTaskIds: [],
  userConfirmedTaskIds: [],
  records: [],
  streak: 0,
  weeklySpeakingSeconds: 0,
  weeklySpeakingWeekKey: localWeekKey(),
  totalPoints: 0,
  bestCombo: 0,
  knownChunks: []
};

export const defaultEvolutionState: EvolutionState = {
  enabled: false,
  autoEvolve: true,
  recordsPerCycle: 3,
  lastAnalyzedRecordCount: 0
};
