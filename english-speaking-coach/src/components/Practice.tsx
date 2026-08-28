import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Check,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trophy,
  Volume2
} from "lucide-react";
import { useSpeechRecorder } from "../hooks/useSpeechRecorder";
import {
  getSentenceFrame,
  isSentenceFrame
} from "../data/sentenceFrames";
import { askPracticeTutor, getPracticeFeedback } from "../lib/api";
import { speakText } from "../lib/speech";
import { saveAudio } from "../lib/storage";
import SentenceLab, { type SentenceCandidate } from "./SentenceLab";
import type {
  AppProgress,
  CoachFeedback,
  DailyTask,
  LearnerProfile,
  PracticeRecord,
  WeekPlan
} from "../types";

interface Props {
  task: DailyTask;
  profile: LearnerProfile;
  week: WeekPlan;
  progress: AppProgress;
  onClose: () => void;
  onComplete: (
    task: DailyTask,
    record?: PracticeRecord,
    options?: {
      userConfirmed?: boolean;
      practicedItems?: string[];
      score?: number;
      bestCombo?: number;
    }
  ) => void;
}

function ConfirmPass({
  message,
  onCancel,
  onConfirm
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="confirm-pass">
      <AlertCircle size={21} />
      <div>
        <strong>确认先继续？</strong>
        <p>{message}</p>
      </div>
      <div className="button-row">
        <button className="ghost-button" onClick={onCancel}>
          继续练习
        </button>
        <button className="primary-button" onClick={onConfirm}>
          确认通过
        </button>
      </div>
    </section>
  );
}

export default function Practice({
  task,
  profile,
  week,
  progress,
  onClose,
  onComplete
}: Props) {
  const recorder = useSpeechRecorder(profile.targetLanguage);
  const [feedback, setFeedback] = useState<CoachFeedback>();
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [manualMode, setManualMode] = useState(false);
  const [practicedChunks, setPracticedChunks] = useState<string[]>([]);
  const [confirmPass, setConfirmPass] = useState<
    "chunks" | "feedback" | "unrecognized"
  >();
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [showTutor, setShowTutor] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState("");
  const [tutorAnswer, setTutorAnswer] = useState("");
  const [tutorLoading, setTutorLoading] = useState(false);
  const [activeTutorSentence, setActiveTutorSentence] =
    useState<SentenceCandidate>();
  const [pendingCompletion, setPendingCompletion] = useState<{
    record?: PracticeRecord;
    userConfirmed: boolean;
  }>();

  const isPassive = task.type === "input" || task.type === "chunks";
  const chunkItems = task.practiceItems ?? week.chunks;
  const remainingChunks = chunkItems.length - practicedChunks.length;
  const practiceText =
    task.type === "shadow"
      ? week.lesson?.dialogues
          .slice(0, 2)
          .map((line) => line.target)
          .join(" ") ?? week.chunks.join(" ")
      : week.outcome;
  const modelSentence =
    week.lesson?.dialogues.find(
      (line, index) =>
        index % 2 === 1 && line.target.split(/\s+/).length >= 4
    ) ??
    week.lesson?.dialogues.find((line) => line.target.split(/\s+/).length >= 4) ??
    week.lesson?.dialogues[0];
  const sentenceCandidates = useMemo<SentenceCandidate[]>(() => {
    const dialogueCandidates =
      week.lesson?.dialogues.map((line) => ({
        text: line.target,
        translation: line.translation
      })) ?? [];
    const outputCandidates =
      week.lesson?.outputDrills.map((drill) => ({
        text: drill.answer,
        translation: drill.answerTranslation
      })) ?? [];
    const patternCandidates =
      week.lesson?.patterns.map((pattern) => {
        const frame = getSentenceFrame(pattern.pattern);
        return frame
          ? {
              text: frame.example,
              translation: frame.translation,
              reason: `来自句型骨架“${frame.frame}”的完整示例。`
            }
          : {
              text: pattern.pattern,
              translation: pattern.translation
            };
      }) ?? [];
    const frameCandidates = chunkItems.flatMap((chunk) => {
      const frame = getSentenceFrame(chunk);
      return frame
        ? [
            {
              text: frame.example,
              translation: frame.translation,
              reason: `用于练习“${frame.frame}”的真实使用方式。`
            }
          ]
        : [];
    });
    const bilingualSources = [
      ...dialogueCandidates,
      ...outputCandidates,
      ...patternCandidates
    ];
    const translationBySentence = new Map(
      bilingualSources.map((candidate) => [
        candidate.text.trim().toLocaleLowerCase(),
        candidate.translation
      ])
    );
    const reviewCandidates = progress.knownChunks
      .filter((chunk) => new Date(chunk.nextReviewAt).getTime() <= Date.now())
      .flatMap((chunk): SentenceCandidate[] => {
        const matchedTranslation = translationBySentence.get(
          chunk.text.trim().toLocaleLowerCase()
        );
        return matchedTranslation
          ? [{
              text: chunk.text,
              translation: matchedTranslation,
              reason: "这条表达已进入最佳复习窗口。"
            }]
          : [];
      });

    return [
      ...reviewCandidates,
      ...frameCandidates,
      ...dialogueCandidates,
      ...outputCandidates,
      ...patternCandidates
    ];
  }, [chunkItems, progress.knownChunks, week.lesson]);
  const sentenceRecommendation = useMemo<SentenceCandidate | undefined>(() => {
    const latestFeedback = [...progress.records]
      .reverse()
      .find((record) => record.feedback)?.feedback;
    const dueSentence = sentenceCandidates.find(
      (candidate) =>
        candidate.reason && candidate.text.trim().split(/\s+/).length >= 3
    );
    if (latestFeedback) {
      const targetedDrill = week.lesson?.outputDrills.find(
        (drill) => drill.answer.trim().split(/\s+/).length >= 4
      );
      const targetedSentence =
        targetedDrill?.answer ??
        modelSentence?.target;
      if (targetedSentence) {
        return {
          text: targetedSentence,
          translation:
            targetedDrill?.answerTranslation ??
            (modelSentence?.target === targetedSentence
              ? modelSentence.translation
              : undefined),
          reason: `最近练习暴露“${latestFeedback.priorityIssue}”，这句会针对性强化。`
        };
      }
    }
    if (dueSentence) return dueSentence;
    if (progress.userConfirmedTaskIds.length > 0 && modelSentence) {
      return {
        text: modelSentence.target,
        translation: modelSentence.translation,
        reason: "此前有内容由你确认先通过，本次重新安排，避免形成长期薄弱点。"
      };
    }
    return undefined;
  }, [
    modelSentence,
    progress.records,
    progress.userConfirmedTaskIds.length,
    sentenceCandidates,
    week.lesson?.outputDrills
  ]);
  const handleSentenceChange = useCallback(
    (sentence: SentenceCandidate) => setActiveTutorSentence(sentence),
    []
  );

  const finishRecording = async () => {
    setLoading(true);
    try {
      const result = await getPracticeFeedback({
        profile,
        prompt: practiceText,
        transcript: recorder.transcript
      });
      setFeedback(result);
    } finally {
      setLoading(false);
    }
  };

  const complete = async (userConfirmed = false) => {
    setCompleting(true);
    let audioId: string | undefined;
    if (recorder.audioBlob) {
      const nextAudioId = `practice-${task.id}-${Date.now()}`;
      try {
        await saveAudio(nextAudioId, recorder.audioBlob);
        audioId = nextAudioId;
      } catch {
        // Keep the transcript and feedback even if audio storage is unavailable.
      }
    }

    const record: PracticeRecord | undefined =
      recorder.transcript.trim() || recorder.audioBlob
      ? {
          id: `record-${Date.now()}`,
          taskId: task.id,
          createdAt: new Date().toISOString(),
          durationSeconds: recorder.seconds,
          transcript: recorder.transcript,
          audioId,
          feedback,
          completionMode: userConfirmed ? "user-confirmed" : "recommended",
          score:
            score ||
            (feedback
              ? Math.round(
                  (feedback.intelligibility +
                    feedback.fluency +
                    feedback.expression +
                    feedback.interaction) *
                    250
                )
              : 1000),
          bestCombo: combo
        }
      : undefined;
    setCompleting(false);
    setPendingCompletion({ record, userConfirmed });
  };

  const finalizeCompletion = () => {
    if (!pendingCompletion) return;
    onComplete(task, pendingCompletion.record, {
      userConfirmed: pendingCompletion.userConfirmed,
      practicedItems: task.type === "chunks" ? practicedChunks : undefined,
      score:
        pendingCompletion.record?.score ??
        Math.max(800, score || practicedChunks.length * 1000),
      bestCombo: Math.max(combo, pendingCompletion.record?.bestCombo ?? 0)
    });
  };

  const askTutor = async () => {
    if (!tutorQuestion.trim()) return;
    setTutorLoading(true);
    try {
      const result = await askPracticeTutor({
        profile,
        sentence:
          activeTutorSentence?.text ?? modelSentence?.target ?? practiceText,
        question: tutorQuestion
      });
      setTutorAnswer(result.answer);
    } finally {
      setTutorLoading(false);
    }
  };
  const tutorPanel = (
    <section className="practice-tutor" aria-label="当前句子的 AI 老师">
      <header>
        <div>
          <span className="tutor-live-dot" />
          <strong>随练 AI 老师</strong>
        </div>
        <small>只回答当前句子</small>
      </header>
      {tutorAnswer && <p>{tutorAnswer.replace(/\*\*/g, "")}</p>}
      <div>
        <input
          value={tutorQuestion}
          onChange={(event) => setTutorQuestion(event.target.value)}
          onBlur={() => {
            window.setTimeout(() => {
              document
                .querySelector(".sentence-lab")
                ?.scrollIntoView({ block: "nearest" });
            }, 120);
          }}
          placeholder="这里为什么这样说？"
          aria-label="输入当前句子的问题"
        />
        <button
          onClick={() => void askTutor()}
          disabled={tutorLoading || !tutorQuestion.trim()}
          aria-label="发送问题"
        >
          {tutorLoading ? <span className="mini-loader" /> : <Send size={16} />}
        </button>
      </div>
    </section>
  );

  const retry = () => {
    setFeedback(undefined);
    setAttempt((value) => value + 1);
    setManualMode(false);
    recorder.reset();
  };

  if (pendingCompletion) {
    const resultScore =
      pendingCompletion.record?.score ??
      Math.max(800, score || practicedChunks.length * 1000);
    return (
      <div className="practice-overlay result-mode">
        <main className="practice-settlement">
          <div className="settlement-seal">
            <Trophy size={30} />
          </div>
          <span className="eyebrow">ROUND COMPLETE</span>
          <h1>
            {pendingCompletion.userConfirmed ? "本关已通过" : "漂亮，这一局完成了"}
          </h1>
          <p>
            {pendingCompletion.userConfirmed
              ? "未掌握内容已保留在待补强队列，不会被假装学会。"
              : "本次表现已进入学习画像，下一组练习会据此调整。"}
          </p>
          <div className="settlement-grade">
            <strong>{resultScore >= 4000 ? "SS" : resultScore >= 2500 ? "S" : "A"}</strong>
            <span>{resultScore.toLocaleString()}</span>
          </div>
          <div className="settlement-stats">
            <div>
              <strong>{Math.max(1, combo)}</strong>
              <span>最高连击</span>
            </div>
            <div>
              <strong>{practicedChunks.length || attempt}</strong>
              <span>有效练习</span>
            </div>
            <div>
              <strong>{pendingCompletion.userConfirmed ? 1 : 0}</strong>
              <span>待补强</span>
            </div>
          </div>
          <button className="primary-button full" onClick={finalizeCompletion}>
            领取积分并返回
          </button>
          <button
            className="ghost-button full"
            onClick={() => {
              setPendingCompletion(undefined);
              retry();
            }}
          >
            <RotateCcw size={17} /> 再来一局
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="practice-overlay">
      <header className="practice-header">
        <button className="icon-button" onClick={onClose} aria-label="返回">
          <ArrowLeft size={22} />
        </button>
        <div>
          <span className="eyebrow">第 {attempt} 遍</span>
          <strong>{task.title}</strong>
        </div>
      </header>

      <main className="practice-content">
        {task.type === "input" && (
          <>
            <span className="eyebrow">先理解意图，不逐词翻译</span>
            <h1>{week.theme}</h1>
            <p className="practice-lead">{week.outcome}</p>
            <SentenceLab
              text={modelSentence?.target ?? practiceText}
              translation={modelSentence?.translation}
              profile={profile}
              candidates={sentenceCandidates}
              recommendation={sentenceRecommendation}
              tutorOpen={showTutor}
              onToggleTutor={() => setShowTutor((value) => !value)}
              onSentenceChange={handleSentenceChange}
              tutor={tutorPanel}
            />
            <button
              className="primary-button full bottom-action"
              onClick={() => void complete()}
            >
              <Check size={19} /> 我已听懂这个场景
            </button>
          </>
        )}

        {task.type === "chunks" && (
          <>
            <span className="eyebrow">逐句开口，完成到期复习</span>
            <div className="arcade-scorebar">
              <span>COMBO × {combo}</span>
              <strong>{score.toLocaleString()}</strong>
            </div>
            <h1>点亮今天的表达</h1>
            <div className="chunk-stack">
              {chunkItems.map((chunk, index) => {
                const frame = getSentenceFrame(chunk);
                const spokenText = frame?.example ?? chunk;
                return (
                  <button
                  key={`${chunk}-${index}`}
                  className={
                    practicedChunks.includes(chunk) ? "practiced" : undefined
                  }
                  onClick={() => {
                    if (!practicedChunks.includes(chunk)) {
                      const nextCombo = combo + 1;
                      setCombo(nextCombo);
                      setScore((value) => value + 800 + nextCombo * 200);
                      setPracticedChunks((current) => [...current, chunk]);
                    }
                    void speakText(
                      spokenText,
                      profile.accent,
                      profile.targetLanguage
                    );
                  }}
                  aria-label={
                    frame
                      ? `${index + 1} 句型骨架 ${frame.frame}，完整例句 ${frame.example}`
                      : `${index + 1} ${chunk}`
                  }
                >
                  <span>0{index + 1}</span>
                  <span className="chunk-copy">
                    {frame && <small>句型骨架 · 替换 {frame.slot}</small>}
                    <strong>{chunk}</strong>
                    {frame && (
                      <>
                        <em>{frame.example}</em>
                        <i>{frame.translation}</i>
                        <b>{frame.usage}</b>
                      </>
                    )}
                    {!frame && isSentenceFrame(chunk) && (
                      <small>开放句型 · 请替换省略部分后再开口</small>
                    )}
                  </span>
                  {practicedChunks.includes(chunk) ? (
                    <span className="perfect-mark">Perfect</span>
                  ) : (
                    <Volume2 size={18} />
                  )}
                </button>
                );
              })}
            </div>
            {modelSentence && (
              <SentenceLab
                compact
                text={modelSentence.target}
                translation={modelSentence.translation}
                profile={profile}
                candidates={sentenceCandidates}
                recommendation={sentenceRecommendation}
                tutorOpen={showTutor}
                onToggleTutor={() => setShowTutor((value) => !value)}
                onSentenceChange={handleSentenceChange}
                tutor={tutorPanel}
              />
            )}
            <div className="quick-drill">
              <span>快速替换</span>
              <p>{chunkItems[week.week % chunkItems.length]}</p>
            </div>
            <button
              className="primary-button full bottom-action"
              onClick={() =>
                remainingChunks > 0
                  ? setConfirmPass("chunks")
                  : void complete()
              }
            >
              <Check size={19} />{" "}
              {remainingChunks > 0
                ? `已练 ${practicedChunks.length} 句，先继续`
                : "完成并安排下次复习"}
            </button>
            {confirmPass === "chunks" && (
              <ConfirmPass
                message={`还有 ${remainingChunks} 句未练，它们不会标记为掌握，之后会继续安排复习。`}
                onCancel={() => setConfirmPass(undefined)}
                onConfirm={() => void complete(true)}
              />
            )}
          </>
        )}

        {!isPassive && !feedback && (
          <>
            <span className="eyebrow">
              {task.type === "shadow" ? "模仿节奏，不要只读单词" : "不写稿，直接完成"}
            </span>
            <h1>{task.type === "shadow" ? "跟住这段示范" : week.outcome}</h1>
            {task.type === "shadow" && (
              <div className="shadow-script">
                <p>{practiceText}</p>
                <button
                  onClick={() =>
                    void speakText(
                      practiceText,
                      profile.accent,
                      profile.targetLanguage
                    )
                  }
                >
                  <Volume2 size={18} /> 播放示范
                </button>
              </div>
            )}

            <div className={`record-panel ${recorder.isRecording ? "active" : ""}`}>
              <div className="wave-bars" aria-hidden="true">
                {Array.from({ length: 17 }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
              <strong>
                {recorder.isRecording
                  ? `${recorder.seconds} 秒`
                  : recorder.audioBlob
                    ? "录音完成"
                    : "准备好后开始"}
              </strong>
              <small>先完成表达，错误留到说完再改</small>
            </div>

            {!recorder.audioBlob && !recorder.isRecording && !manualMode && (
              <>
                <button className="primary-button full" onClick={recorder.start}>
                  <Mic size={20} /> 开始录音
                </button>
                <button
                  className="text-fallback"
                  onClick={() => setManualMode(true)}
                >
                  无法录音？使用文字模拟这次表达
                </button>
              </>
            )}
            {recorder.isRecording && (
              <button className="stop-button full" onClick={recorder.stop}>
                <Square size={18} fill="currentColor" /> 结束录音
              </button>
            )}
            {(recorder.audioBlob || manualMode) && (
              <>
                <label className="transcript-field">
                  <span>
                    {manualMode
                      ? "写下你会说的目标语言"
                      : recorder.isTranscribing
                        ? "本地模型正在转写..."
                        : recorder.transcriptionSource === "local"
                          ? "本地模型转写"
                          : "你的表达"}
                  </span>
                  <textarea
                    value={recorder.transcript}
                    onChange={(event) => recorder.setTranscript(event.target.value)}
                    placeholder="自动转写不可用时，可补充你刚才说的内容"
                  />
                </label>
                {manualMode && (
                  <button
                    className="text-fallback"
                    onClick={() => {
                      setManualMode(false);
                      recorder.reset();
                    }}
                  >
                    返回录音
                  </button>
                )}
                <button
                  className="primary-button full"
                  onClick={finishRecording}
                  disabled={
                    loading ||
                    recorder.isTranscribing ||
                    !recorder.transcript.trim()
                  }
                >
                  <Sparkles size={19} />
                  {recorder.isTranscribing
                    ? "转写中..."
                    : loading
                      ? "教练正在复盘..."
                      : "获得反馈"}
                </button>
                {!manualMode &&
                  recorder.audioBlob &&
                  !recorder.isTranscribing &&
                  !recorder.transcript.trim() && (
                    <button
                      className="ghost-button full"
                      onClick={() => setConfirmPass("unrecognized")}
                    >
                      识别不到，保留录音并继续
                    </button>
                  )}
                {confirmPass === "unrecognized" && (
                  <ConfirmPass
                    message="本次录音会保留并标记为待补强，不会因为识别失败阻塞今天的学习。"
                    onCancel={() => setConfirmPass(undefined)}
                    onConfirm={() => void complete(true)}
                  />
                )}
              </>
            )}
            {recorder.error && <p className="inline-error">{recorder.error}</p>}
          </>
        )}

        {feedback && (
          <section className="feedback-view">
            <span className="eyebrow">
              {feedback.source === "ark" ? "ARK COACH" : "LOCAL COACH"}
            </span>
            <h1>这一遍，先只改一件事</h1>
            <p className="feedback-summary">{feedback.summary}</p>

            <div className="score-grid">
              {[
                ["听懂", feedback.intelligibility],
                ["流利", feedback.fluency],
                ["表达", feedback.expression],
                ["互动", feedback.interaction]
              ].map(([label, score]) => (
                <div key={label}>
                  <strong>{score}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <article className="priority-fix">
              <span>01 · 最优先</span>
              <p>{feedback.priorityIssue}</p>
            </article>
            <article className="feedback-item">
              <span>语法收紧</span>
              <p>{feedback.grammarFix}</p>
            </article>
            <article className="feedback-item">
              <span>换成更自然的说法</span>
              <div className="phrase-list">
                {feedback.naturalPhrases.map((phrase) => (
                  <button
                    key={phrase}
                    onClick={() =>
                      void speakText(
                        phrase,
                        profile.accent,
                        profile.targetLanguage
                      )
                    }
                  >
                    {phrase} <Volume2 size={15} />
                  </button>
                ))}
              </div>
            </article>
            <div className="retry-callout">{feedback.retryPrompt}</div>

            {attempt === 1 ? (
              <div className="feedback-actions sticky-actions">
                <button className="primary-button full" onClick={retry}>
                  <RotateCcw size={18} /> 按建议立即重说
                </button>
                <button
                  className="ghost-button full"
                  onClick={() => setConfirmPass("feedback")}
                >
                  保留本次结果并继续
                </button>
                {confirmPass === "feedback" && (
                  <ConfirmPass
                    message="系统仍建议重说一次。确认后本关会通过，并在记录中标记为用户确认。"
                    onCancel={() => setConfirmPass(undefined)}
                    onConfirm={() => void complete(true)}
                  />
                )}
              </div>
            ) : (
              <div className="button-row sticky-actions">
                <button className="ghost-button" onClick={retry}>
                  再说一遍
                </button>
                <button
                  className="primary-button"
                  onClick={() => void complete()}
                  disabled={completing}
                >
                  <Check size={18} /> {completing ? "保存中..." : "完成训练"}
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
