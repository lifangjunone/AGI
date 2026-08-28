import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarRange,
  ChartNoAxesCombined,
  House,
  LockKeyhole,
  MessagesSquare,
  SlidersHorizontal
} from "lucide-react";
import Coach from "./components/Coach";
import Dashboard from "./components/Dashboard";
import Onboarding from "./components/Onboarding";
import PlanView from "./components/PlanView";
import Practice from "./components/Practice";
import ProgressView from "./components/ProgressView";
import SpeechSettings from "./components/SpeechSettings";
import {
  applyEvolutionToPlan,
  createDailyTasks,
  getFirstReviewAt,
  getNextReview,
  getCurrentWeek
} from "./data/curriculum";
import { evolveLearningPlan, generatePlan } from "./lib/api";
import {
  localDateKey,
  localWeekKey,
  shiftLocalDateKey
} from "./lib/date";
import { clearAllData, loadState, saveState } from "./lib/storage";
import type {
  BaselineResult,
  CoachFeedback,
  DailyTask,
  LearnerProfile,
  PersistedState,
  PracticeRecord,
  TabId
} from "./types";

const navItems: Array<{
  id: TabId;
  label: string;
  icon: typeof House;
}> = [
  { id: "today", label: "今天", icon: House },
  { id: "plan", label: "路线", icon: CalendarRange },
  { id: "coach", label: "对话", icon: MessagesSquare },
  { id: "progress", label: "进步", icon: ChartNoAxesCombined },
  { id: "models", label: "设置", icon: SlidersHorizontal }
];

function BottomNav({
  tab,
  onChange
}: {
  tab: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            title={item.label}
          >
            <Icon size={21} strokeWidth={tab === item.id ? 2.5 : 2} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const setupCopy: Record<
  Exclude<TabId, "today" | "models">,
  { eyebrow: string; title: string; description: string }
> = {
  plan: {
    eyebrow: "PERSONAL ROUTE",
    title: "先建立你的学习路线",
    description: "完成两段口语基线后，EasySay 会生成 24 周场景路线。"
  },
  coach: {
    eyebrow: "AI ROLEPLAY",
    title: "对话教练正在等你",
    description: "先确定水平和目标，教练才能选择合适难度与真实场景。"
  },
  progress: {
    eyebrow: "YOUR PROGRESS",
    title: "先留下进步起点",
    description: "完成首次基线后，这里会持续对比流利度、表达力和开口时长。"
  }
};

function SetupRequired({
  tab,
  onStart
}: {
  tab: Exclude<TabId, "today" | "models">;
  onStart: () => void;
}) {
  const copy = setupCopy[tab];
  return (
    <div className="page setup-required-page">
      <span className="setup-required-icon">
        <LockKeyhole size={26} />
      </span>
      <span className="eyebrow">{copy.eyebrow}</span>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
      <button className="primary-button full" onClick={onStart}>
        完成首次建档
        <ArrowRight size={18} />
      </button>
    </div>
  );
}

function nextStreak(
  current: PersistedState["progress"],
  dateKey: string
): Pick<PersistedState["progress"], "streak" | "lastStudyDate"> {
  if (current.lastStudyDate === dateKey) {
    return { streak: current.streak, lastStudyDate: current.lastStudyDate };
  }

  const yesterdayKey = shiftLocalDateKey(dateKey, -1);
  return {
    streak: current.lastStudyDate === yesterdayKey ? current.streak + 1 : 1,
    lastStudyDate: dateKey
  };
}

export default function App() {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [tab, setTab] = useState<TabId>("today");
  const [activeTask, setActiveTask] = useState<DailyTask>();
  const [evolutionRunning, setEvolutionRunning] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const currentWeek = useMemo(() => {
    if (!state.profile || !state.plan) return undefined;
    return state.plan.weeks[getCurrentWeek(state.profile) - 1] ?? state.plan.weeks[0];
  }, [state.plan, state.profile]);

  const tasks = useMemo(() => {
    if (!state.profile || !state.plan) return [];
    return createDailyTasks(state.profile, state.plan, state.progress);
  }, [state.plan, state.profile, state.progress]);

  const completeOnboarding = async (
    profile: LearnerProfile,
    baseline: BaselineResult
  ) => {
    const plan = await generatePlan(profile);
    setState((current) => ({
      ...current,
      profile,
      baseline,
      plan
    }));
    setTab("today");
  };

  const updateProfile = async (profile: LearnerProfile) => {
    const targetChanged =
      state.profile?.targetLanguage !== profile.targetLanguage;
    const plan = targetChanged ? await generatePlan(profile) : state.plan;
    setState((current) => ({
      ...current,
      profile,
      plan,
      progress: targetChanged
        ? { ...current.progress, knownChunks: [] }
        : current.progress,
      evolution: targetChanged
        ? {
            ...current.evolution,
            lastAnalyzedRecordCount: 0,
            lastInsight: undefined,
            error: undefined
          }
        : current.evolution
    }));
  };

  const updateEvolution = (patch: Partial<PersistedState["evolution"]>) => {
    setState((current) => ({
      ...current,
      evolution: {
        ...current.evolution,
        ...patch,
        error: patch.enabled === false ? undefined : current.evolution.error
      }
    }));
  };

  const runEvolution = useCallback(async () => {
    if (
      evolutionRunning ||
      !state.profile ||
      !state.plan ||
      state.progress.records.length === 0
    ) {
      return;
    }

    setEvolutionRunning(true);
    setState((current) => ({
      ...current,
      evolution: { ...current.evolution, error: undefined }
    }));
    try {
      const result = await evolveLearningPlan({
        profile: state.profile,
        baseline: state.baseline,
        plan: state.plan,
        progress: state.progress,
        currentWeek: getCurrentWeek(state.profile),
        previousInsight: state.evolution.lastInsight
      });
      setState((current) => ({
        ...current,
        plan:
          current.profile && current.plan
            ? applyEvolutionToPlan(current.profile, current.plan, result)
            : current.plan,
        evolution: {
          ...current.evolution,
          lastAnalyzedRecordCount: result.insight.analyzedRecordCount,
          lastInsight: result.insight,
          error: undefined
        }
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        evolution: {
          ...current.evolution,
          error:
            error instanceof Error
              ? error.message
              : "自进化分析暂时不可用"
        }
      }));
    } finally {
      setEvolutionRunning(false);
    }
  }, [evolutionRunning, state]);

  useEffect(() => {
    const newRecords =
      state.progress.records.length -
      state.evolution.lastAnalyzedRecordCount;
    if (
      state.evolution.enabled &&
      state.evolution.autoEvolve &&
      !state.evolution.error &&
      newRecords >= state.evolution.recordsPerCycle &&
      !evolutionRunning
    ) {
      void runEvolution();
    }
  }, [
    evolutionRunning,
    runEvolution,
    state.evolution.autoEvolve,
    state.evolution.enabled,
    state.evolution.error,
    state.evolution.lastAnalyzedRecordCount,
    state.evolution.recordsPerCycle,
    state.progress.records.length
  ]);

  const markTaskComplete = (
    task: DailyTask,
    record?: PracticeRecord,
    options?: {
      userConfirmed?: boolean;
      practicedItems?: string[];
      score?: number;
      bestCombo?: number;
    }
  ) => {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const dateKey = localDateKey(nowDate);
    const weekKey = localWeekKey(nowDate);
    setState((current) => {
      const alreadyDone = current.progress.completedTaskIds.includes(task.id);
      const streak = nextStreak(current.progress, dateKey);
      const currentWeekChunks =
        task.type === "chunks" && current.plan && current.profile
          ? options?.userConfirmed
            ? options.practicedItems ?? []
            : current.plan.weeks[getCurrentWeek(current.profile) - 1]?.chunks ??
              []
          : [];
      const reviewedChunks =
        task.type === "chunks" && !alreadyDone
          ? current.progress.knownChunks.map((chunk) => {
              if (localDateKey(new Date(chunk.nextReviewAt)) > dateKey) {
                return chunk;
              }
              if (
                options?.userConfirmed &&
                !options.practicedItems?.includes(chunk.text)
              ) {
                return chunk;
              }
              return {
                ...chunk,
                ...getNextReview(chunk.reviewStep, nowDate)
              };
            })
          : current.progress.knownChunks;
      const newChunks = currentWeekChunks
        .filter(
          (text) => !reviewedChunks.some((known) => known.text === text)
        )
        .map((text) => ({
          text,
          learnedAt: now,
          reviewStep: 0,
          nextReviewAt: getFirstReviewAt(nowDate)
        }));
      const weeklySpeakingSeconds =
        current.progress.weeklySpeakingWeekKey === weekKey
          ? current.progress.weeklySpeakingSeconds
          : 0;

      return {
        ...current,
        progress: {
          ...current.progress,
          ...streak,
          completedTaskIds: alreadyDone
            ? current.progress.completedTaskIds
            : [...current.progress.completedTaskIds, task.id],
          userConfirmedTaskIds:
            options?.userConfirmed && !alreadyDone
              ? [...current.progress.userConfirmedTaskIds, task.id]
              : current.progress.userConfirmedTaskIds,
          records: record && !alreadyDone
            ? [...current.progress.records, record]
            : current.progress.records,
          weeklySpeakingSeconds:
            weeklySpeakingSeconds +
            (alreadyDone ? 0 : record?.durationSeconds ?? 0),
          weeklySpeakingWeekKey: weekKey,
          totalPoints:
            current.progress.totalPoints +
            (alreadyDone ? 0 : options?.score ?? record?.score ?? 0),
          bestCombo: Math.max(
            current.progress.bestCombo,
            options?.bestCombo ?? record?.bestCombo ?? 0
          ),
          knownChunks:
            task.type === "chunks"
              ? [...reviewedChunks, ...newChunks]
              : current.progress.knownChunks
        }
      };
    });
    setActiveTask(undefined);
  };

  const handleOpenTask = (task: DailyTask) => {
    if (task.type === "roleplay") {
      setTab("coach");
      return;
    }
    setActiveTask(task);
  };

  const handleCoachComplete = (
    feedback: CoachFeedback,
    speakingSeconds: number,
    transcript: string,
    userConfirmed = false
  ) => {
    const roleplayTask = tasks.find((task) => task.type === "roleplay");
    if (!roleplayTask) return;
    const record: PracticeRecord = {
      id: `roleplay-${Date.now()}`,
      taskId: roleplayTask.id,
      createdAt: new Date().toISOString(),
      durationSeconds: speakingSeconds,
      transcript,
      feedback,
      completionMode: userConfirmed ? "user-confirmed" : "recommended"
    };
    markTaskComplete(roleplayTask, record, { userConfirmed });
  };

  const reset = async () => {
    await clearAllData();
    window.location.reload();
  };

  const ready = Boolean(
    state.profile && state.baseline && state.plan && currentWeek
  );

  if (!ready) {
    return (
      <div className="app-shell onboarding-mode">
        <main className="screen">
          {tab === "today" && <Onboarding onComplete={completeOnboarding} />}
          {tab === "models" && <SpeechSettings />}
          {tab !== "today" && tab !== "models" && (
            <SetupRequired tab={tab} onStart={() => setTab("today")} />
          )}
        </main>
        <BottomNav tab={tab} onChange={setTab} />
      </div>
    );
  }

  const profile = state.profile!;
  const baseline = state.baseline!;
  const plan = state.plan!;
  const week = currentWeek!;

  return (
    <div className="app-shell">
      <main className="screen">
        {tab === "today" && (
          <Dashboard
            profile={profile}
            week={week}
            tasks={tasks}
            progress={state.progress}
            onOpenTask={handleOpenTask}
          />
        )}
        {tab === "plan" && <PlanView profile={profile} plan={plan} />}
        {tab === "coach" && (
          <Coach
            profile={profile}
            week={week}
            onComplete={handleCoachComplete}
          />
        )}
        {tab === "progress" && (
          <ProgressView
            profile={profile}
            baseline={baseline}
            progress={state.progress}
            onReset={reset}
          />
        )}
        {tab === "models" && (
          <SpeechSettings
            profile={profile}
            onUpdateProfile={updateProfile}
            evolution={state.evolution}
            evolutionRunning={evolutionRunning}
            onUpdateEvolution={updateEvolution}
            onRunEvolution={runEvolution}
            recordCount={state.progress.records.length}
          />
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} />

      {activeTask && (
        <Practice
          task={activeTask}
          profile={profile}
          week={week}
          progress={state.progress}
          onClose={() => setActiveTask(undefined)}
          onComplete={markTaskComplete}
        />
      )}
    </div>
  );
}
