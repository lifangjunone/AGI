import {
  ArrowRight,
  BookOpen,
  Check,
  Flame,
  Headphones,
  MessageCircle,
  Mic2,
  Minus,
  Play,
  Plus,
  Sparkles,
  Timer,
  Volume2
} from "lucide-react";
import { useState } from "react";
import type {
  AppProgress,
  DailyTask,
  LearnerProfile,
  WeekPlan
} from "../types";

interface Props {
  profile: LearnerProfile;
  week: WeekPlan;
  tasks: DailyTask[];
  progress: AppProgress;
  onOpenTask: (task: DailyTask) => void;
}

const taskIcons = {
  input: Volume2,
  shadow: Mic2,
  chunks: BookOpen,
  "free-speak": Sparkles,
  roleplay: MessageCircle,
  review: BookOpen
};

export default function Dashboard({
  profile,
  week,
  tasks,
  progress,
  onOpenTask
}: Props) {
  const done = tasks.filter((task) => task.completed).length;
  const percentage = Math.round((done / tasks.length) * 100);
  const remaining = tasks
    .filter((task) => !task.completed)
    .reduce((sum, task) => sum + task.minutes, 0);
  const nextTask = tasks.find((task) => !task.completed);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [practiceCount, setPracticeCount] = useState(8);
  const [practiceMode, setPracticeMode] = useState<
    "listening" | "shadow" | "speaking"
  >("speaking");
  const recommendedTask =
    tasks.find((task) =>
      practiceMode === "listening"
        ? task.type === "input"
        : practiceMode === "shadow"
          ? task.type === "shadow"
          : task.type === "chunks" || task.type === "free-speak"
    ) ?? nextTask;
  const dueReviewCount = progress.knownChunks.filter(
    (chunk) => new Date(chunk.nextReviewAt).getTime() <= Date.now()
  ).length;
  const latestIssue = [...progress.records]
    .reverse()
    .find((record) => record.feedback)?.feedback?.priorityIssue;
  const recommendationReason = dueReviewCount
    ? `有 ${dueReviewCount} 个表达进入最佳复习窗口，先把它们重新激活。`
    : latestIssue
      ? `最近最影响表达的问题是“${latestIssue}”，本局会优先针对它。`
      : `根据本周“${week.theme}”目标，先建立可直接开口的核心表达。`;
  const speakingBank = Array.from(
    new Set([
      ...progress.knownChunks
        .filter((chunk) => new Date(chunk.nextReviewAt).getTime() <= Date.now())
        .map((chunk) => chunk.text),
      ...week.chunks,
      ...(week.lesson?.patterns.map((item) => item.pattern) ?? []),
      ...(week.lesson?.vocabulary.map((item) => item.term) ?? []),
      ...(week.lesson?.dialogues.map((item) => item.target) ?? []),
      ...(week.lesson?.outputDrills.map((item) => item.answer) ?? [])
    ])
  );

  return (
    <div className="page dashboard-page">
      <header className="top-header">
        <div>
          <span className="eyebrow">
            第 {week.week} 周 · {week.phase}
          </span>
          <h1>
            {greeting}，{profile.name}
          </h1>
        </div>
        <div className="streak-pill">
          <Flame size={17} fill="currentColor" />
          {progress.streak} 天
        </div>
      </header>

      <section className="player-strip">
        <div>
          <span>LEVEL {week.week}</span>
          <strong>{progress.totalPoints.toLocaleString()} XP</strong>
        </div>
        <div>
          <span>BEST COMBO</span>
          <strong>× {progress.bestCombo}</strong>
        </div>
        <button onClick={() => setShowRecommendation(true)}>
          <Sparkles size={16} />
          智能组练
        </button>
      </section>

      <section className="focus-card">
        <div className="focus-card-top">
          <div>
            <span>本周真实场景</span>
            <h2>{week.theme}</h2>
          </div>
          <div
            className="progress-ring"
            style={{ "--progress": `${percentage * 3.6}deg` } as React.CSSProperties}
          >
            <span>{percentage}%</span>
          </div>
        </div>
        <p>{week.outcome}</p>
        <div className="focus-meta">
          <span>
            <Timer size={15} /> 今天还需 {remaining} 分钟
          </span>
          <span>
            <Mic2 size={15} /> 本周开口{" "}
            {Math.round(progress.weeklySpeakingSeconds / 60)} 分钟
          </span>
        </div>
        {nextTask ? (
          <button className="inverse-button" onClick={() => onOpenTask(nextTask)}>
            <Play size={18} fill="currentColor" />
            继续：{nextTask.title}
            <ArrowRight size={18} />
          </button>
        ) : (
          <div className="daily-complete">
            <Check size={18} /> 今天的闭环已完成
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-title">
          <div>
            <span className="eyebrow">TODAY'S LOOP</span>
            <h2>今天只做这五步</h2>
          </div>
          <span className="task-count">
            {done}/{tasks.length}
          </span>
        </div>

        <div className="task-list">
          {tasks.map((task, index) => {
            const Icon = taskIcons[task.type];
            return (
              <button
                className={`task-card ${task.completed ? "completed" : ""}`}
                key={task.id}
                onClick={() => onOpenTask(task)}
              >
                <span className="task-index">
                  {task.completed ? <Check size={17} /> : index + 1}
                </span>
                <span className="task-icon">
                  <Icon size={20} />
                </span>
                <span className="task-copy">
                  <strong>{task.title}</strong>
                  <small>{task.description}</small>
                </span>
                <span className="task-minutes">{task.minutes}分</span>
              </button>
            );
          })}
        </div>
      </section>

      {showRecommendation && (
        <div
          className="recommendation-backdrop"
          role="presentation"
          onClick={() => setShowRecommendation(false)}
        >
          <section
            className="recommendation-sheet"
            role="dialog"
            aria-label="今日智能组练"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">SMART SESSION</span>
                <h2>今日智能组练</h2>
              </div>
              <button
                aria-label="关闭智能组练"
                onClick={() => setShowRecommendation(false)}
              >
                ×
              </button>
            </header>
            <div className="practice-mode-grid">
              {[
                ["listening", Headphones, "听辨"],
                ["shadow", Volume2, "跟读"],
                ["speaking", Mic2, "开口"]
              ].map(([id, Icon, label]) => (
                <button
                  key={String(id)}
                  className={practiceMode === id ? "active" : ""}
                  onClick={() =>
                    setPracticeMode(
                      id as "listening" | "shadow" | "speaking"
                    )
                  }
                >
                  <Icon size={19} />
                  <strong>{String(label)}</strong>
                </button>
              ))}
            </div>
            <article className="recommendation-reason">
              <Sparkles size={18} />
              <div>
                <strong>系统推荐：{recommendedTask?.title}</strong>
                <p>
                  {recommendationReason}
                </p>
              </div>
            </article>
            <div className="practice-count-stepper">
              <span>练习数量</span>
              <button
                aria-label="减少练习数量"
                onClick={() => setPracticeCount((value) => Math.max(3, value - 1))}
              >
                <Minus size={17} />
              </button>
              <strong>{practiceCount}</strong>
              <button
                aria-label="增加练习数量"
                onClick={() => setPracticeCount((value) => Math.min(15, value + 1))}
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              className="primary-button full"
              disabled={!recommendedTask}
              onClick={() => {
                setShowRecommendation(false);
                if (!recommendedTask) return;
                onOpenTask(
                  practiceMode === "speaking"
                    ? {
                        ...recommendedTask,
                        type: "chunks",
                        title: "智能表达挑战",
                        description: recommendationReason,
                        practiceItems: speakingBank.slice(0, practiceCount)
                      }
                    : recommendedTask
                );
              }}
            >
              <Play size={18} fill="currentColor" /> 开始这一局
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
