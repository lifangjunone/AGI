import {
  BookOpen,
  Check,
  ChevronRight,
  Gem,
  Lock,
  MessageCircle,
  Sparkles,
  Users,
  Volume2
} from "lucide-react";
import { getCurrentWeek } from "../data/curriculum";
import { speakText } from "../lib/speech";
import type { LearnerProfile, LearningPlan } from "../types";
import LessonPracticeModules from "./LessonPracticeModules";

interface Props {
  profile: LearnerProfile;
  plan: LearningPlan;
}

export default function PlanView({ profile, plan }: Props) {
  const currentWeek = getCurrentWeek(profile);

  return (
    <div className="page plan-page">
      <header className="top-header">
        <div>
          <span className="eyebrow">
            {plan.generatedBy === "hermes"
              ? "HERMES EVOLVED ROUTE"
              : plan.generatedBy === "ark"
                ? "ARK PERSONAL PLAN"
                : "LOCAL SMART PLAN"}
          </span>
          <h1>你的24周路线</h1>
        </div>
        <span className="plan-level">{plan.level}</span>
      </header>

      <section className="plan-intro">
        <Sparkles size={20} />
        <div>
          <strong>{plan.title}</strong>
          <p>{plan.summary}</p>
        </div>
      </section>

      <div className="phase-timeline">
        {Array.from(new Set(plan.weeks.map((week) => week.phase))).map(
          (phase, phaseIndex) => {
            const phaseWeeks = plan.weeks.filter((week) => week.phase === phase);
            return (
              <section className="phase-section" key={phase}>
                <div className="phase-heading">
                  <span>{String(phaseIndex + 1).padStart(2, "0")}</span>
                  <div>
                    <small>
                      第 {phaseWeeks[0].week}-{phaseWeeks.at(-1)?.week} 周
                    </small>
                    <h2>{phase}</h2>
                  </div>
                </div>
                <div className="week-list">
                  {phaseWeeks.map((week) => {
                    const isCurrent = week.week === currentWeek;
                    const isPast = week.week < currentWeek;
                    return (
                      <div className="week-unit" key={week.week}>
                        <article
                          className={`week-card ${isCurrent ? "current" : ""}`}
                        >
                        <span className="week-status">
                          {isPast ? (
                            <Check size={16} />
                          ) : isCurrent ? (
                            week.week
                          ) : (
                            <Lock size={14} />
                          )}
                        </span>
                        <div>
                          <small>WEEK {week.week}</small>
                          <strong>{week.theme}</strong>
                          {isCurrent && <p>{week.outcome}</p>}
                        </div>
                        <ChevronRight size={18} />
                        </article>
                        {isCurrent && week.lesson && (
                          <section className="lesson-material">
                            <div className="lesson-facts">
                              <span>{week.lesson.category}</span>
                              <span>
                                难度 {"★".repeat(week.lesson.difficulty)}
                                {"☆".repeat(5 - week.lesson.difficulty)}
                              </span>
                            </div>

                            <details open>
                              <summary>
                                <Users size={17} />
                                本期角色
                              </summary>
                              <div className="lesson-roles">
                                {week.lesson.roles.map((role) => (
                                  <p key={role.name}>
                                    <strong>{role.name}</strong>
                                    <span>{role.description}</span>
                                  </p>
                                ))}
                              </div>
                            </details>

                            <details open>
                              <summary>
                                <MessageCircle size={17} />
                                双语情景对话
                              </summary>
                              <div className="lesson-dialogue">
                                {week.lesson.dialogues.map((line, index) => (
                                  <article key={`${line.speaker}-${index}`}>
                                    <div>
                                      <strong>{line.speaker}</strong>
                                      <button
                                        onClick={() =>
                                          void speakText(
                                            line.target,
                                            profile.accent,
                                            profile.targetLanguage
                                          )
                                        }
                                        aria-label="播放这句"
                                      >
                                        <Volume2 size={15} />
                                      </button>
                                    </div>
                                    <p>{line.target}</p>
                                    <small>{line.translation}</small>
                                  </article>
                                ))}
                              </div>
                            </details>

                            <details>
                              <summary>
                                <Gem size={17} />
                                词汇积累
                              </summary>
                              <div className="lesson-vocabulary">
                                {week.lesson.vocabulary.map((item) => (
                                  <article key={item.term}>
                                    <strong>{item.term}</strong>
                                    <span>{item.meaning}</span>
                                    <small>{item.example}</small>
                                  </article>
                                ))}
                              </div>
                            </details>

                            <details>
                              <summary>
                                <BookOpen size={17} />
                                万能句型
                              </summary>
                              <div className="lesson-patterns">
                                {week.lesson.patterns.map((item) => (
                                  <p key={item.pattern}>
                                    <strong>{item.pattern}</strong>
                                    <span>{item.translation}</span>
                                  </p>
                                ))}
                              </div>
                            </details>
                            <LessonPracticeModules
                              profile={profile}
                              theme={week.theme}
                              lesson={week.lesson}
                            />
                          </section>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }
        )}
      </div>
    </div>
  );
}
