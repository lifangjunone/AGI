import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Mic,
  Square,
  Volume2
} from "lucide-react";
import { useSpeechRecorder } from "../hooks/useSpeechRecorder";
import {
  getLanguage,
  languageOptions,
  targetLanguageOptions
} from "../data/languages";
import { saveAudio } from "../lib/storage";
import type {
  AccentPreference,
  BaselineResult,
  CefrLevel,
  LanguageCode,
  LearnerProfile,
  LearningGoal
} from "../types";

interface Props {
  onComplete: (profile: LearnerProfile, baseline: BaselineResult) => Promise<void>;
}

const prompts = [
  {
    eyebrow: "基线任务 1/2",
    title: "不用准备，介绍一下你自己",
    body: "说说你是谁、做什么、平时喜欢什么。目标是持续说满60秒，不查词、不写稿。",
    sample:
      "Hi, I'm Alex. I work in product design, and most of my time goes into..."
  },
  {
    eyebrow: "基线任务 2/2",
    title: "讲讲昨天发生的一件事",
    body: "按发生顺序说清楚：发生了什么、你做了什么、最后结果如何。",
    sample:
      "Yesterday, I had an unexpected problem at work. First, I noticed that..."
  }
];

function BaselineRecorder({
  promptIndex,
  targetLanguage,
  onDone
}: {
  promptIndex: number;
  targetLanguage: LanguageCode;
  onDone: (transcript: string, audioId?: string) => Promise<void>;
}) {
  const recorder = useSpeechRecorder(targetLanguage);
  const prompt = prompts[promptIndex];
  const target = getLanguage(targetLanguage);
  const [saving, setSaving] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);

  useEffect(() => {
    setManualMode(false);
    setManualText("");
    recorder.reset();
  }, [promptIndex, recorder.reset]);

  const finish = async () => {
    if (!recorder.transcript.trim()) return;
    setSaving(true);
    let audioId: string | undefined;
    try {
      if (recorder.audioBlob) {
        const nextAudioId = `baseline-${promptIndex}-${Date.now()}`;
        try {
          await saveAudio(nextAudioId, recorder.audioBlob);
          audioId = nextAudioId;
        } catch {
          // The transcript still keeps onboarding usable if IndexedDB is unavailable.
        }
      }
      await onDone(recorder.transcript, audioId);
    } finally {
      setSaving(false);
    }
  };

  const finishManual = async () => {
    setSaving(true);
    try {
      await onDone(manualText);
    } finally {
      setSaving(false);
    }
  };

  const keepRecordingAndContinue = async () => {
    setSaving(true);
    let audioId: string | undefined;
    try {
      if (recorder.audioBlob) {
        const nextAudioId = `baseline-${promptIndex}-${Date.now()}`;
        try {
          await saveAudio(nextAudioId, recorder.audioBlob);
          audioId = nextAudioId;
        } catch {
          // Keep onboarding available even if audio persistence fails.
        }
      }
      await onDone("", audioId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="onboarding-card baseline-card">
      <span className="eyebrow">{prompt.eyebrow}</span>
      <h1>{prompt.title}</h1>
      <p className="lead">{prompt.body}</p>

      <div className="prompt-example">
        <Volume2 size={18} />
        <span>{targetLanguage === "en" ? prompt.sample : target.sample}</span>
      </div>

      <div className={`recorder-orb ${recorder.isRecording ? "is-recording" : ""}`}>
        <span>{recorder.isRecording ? recorder.seconds : "准备好"}</span>
        <small>{recorder.isRecording ? "秒" : "点击开始录音"}</small>
      </div>

      {!recorder.isRecording && !recorder.audioBlob && !manualMode && (
        <>
          <button className="primary-button record-button" onClick={recorder.start}>
            <Mic size={20} />
            开始录音
          </button>
          <button className="text-fallback" onClick={() => setManualMode(true)}>
            麦克风不可用？手动填写转写
          </button>
        </>
      )}

      {recorder.isRecording && (
        <button className="stop-button" onClick={recorder.stop}>
          <Square size={18} fill="currentColor" />
          结束录音
        </button>
      )}

      {recorder.audioBlob && (
        <>
          <label className="transcript-field">
            <span>
              {recorder.isTranscribing
                ? "本地模型正在转写..."
                : recorder.transcriptionSource === "local"
                  ? "本地模型转写"
                  : "识别文本"}
            </span>
            <textarea
              value={recorder.transcript}
              onChange={(event) => recorder.setTranscript(event.target.value)}
              placeholder="浏览器未识别时，可在这里补充你刚才说的内容"
            />
          </label>
          <div className="button-row">
            <button className="ghost-button" onClick={recorder.reset}>
              重新录制
            </button>
            <button
              className="primary-button"
              onClick={finish}
              disabled={
                saving ||
                recorder.isTranscribing ||
                !recorder.transcript.trim()
              }
            >
              {recorder.isTranscribing
                ? "转写中..."
                : saving
                  ? "保存中..."
                  : "完成这项"}
              <ArrowRight size={18} />
            </button>
          </div>
          {!recorder.isTranscribing && !recorder.transcript.trim() && (
            <button
              className="ghost-button full"
              onClick={() => setConfirmSkip(true)}
            >
              识别不到，保留录音并继续
            </button>
          )}
          {confirmSkip && (
            <section className="confirm-pass">
              <AlertCircle size={21} />
              <div>
                <strong>确认继续建档？</strong>
                <p>这段录音会作为待提升起点保留，不会阻塞后续课程。</p>
              </div>
              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => setConfirmSkip(false)}
                >
                  重新尝试
                </button>
                <button
                  className="primary-button"
                  onClick={() => void keepRecordingAndContinue()}
                  disabled={saving}
                >
                  确认继续
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {manualMode && (
        <div className="manual-baseline">
          <label className="transcript-field">
            <span>写下你原本会说的{target.label}</span>
            <textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder={`例如：${target.sample}`}
            />
          </label>
          <div className="button-row">
            <button className="ghost-button" onClick={() => setManualMode(false)}>
              返回录音
            </button>
            <button
              className="primary-button"
              onClick={finishManual}
              disabled={saving || !manualText.trim()}
            >
              {saving ? "保存中..." : "使用这段转写"}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {recorder.error && <p className="inline-error">{recorder.error}</p>}
      {!recorder.speechRecognitionSupported && (
        <p className="support-note">
          浏览器实时识别不可用，录音结束后将使用本地模型转写。
        </p>
      )}
    </section>
  );
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [goal, setGoal] = useState<LearningGoal>("daily");
  const [minutesPerDay, setMinutesPerDay] = useState<30 | 45 | 60>(45);
  const [accent, setAccent] = useState<AccentPreference>("american");
  const [nativeLanguage, setNativeLanguage] =
    useState<LanguageCode>("zh-CN");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("en");
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [audioIds, setAudioIds] = useState<Array<string | undefined>>([]);
  const [creating, setCreating] = useState(false);

  const profile: LearnerProfile = {
    name: name.trim() || "学习者",
    level,
    goal,
    minutesPerDay,
    accent,
    nativeLanguage,
    targetLanguage,
    createdAt: new Date().toISOString()
  };

  const completeRecording = async (transcript: string, audioId?: string) => {
    const next = [...transcripts, transcript];
    const nextAudioIds = [...audioIds, audioId];
    setTranscripts(next);
    setAudioIds(nextAudioIds);
    if (step === 1) {
      setStep(2);
      return;
    }

    setCreating(true);
    const totalWords = next.join(" ").trim().split(/\s+/).filter(Boolean).length;
    const baseline: BaselineResult = {
      completedAt: new Date().toISOString(),
      selfIntroTranscript: next[0] ?? "",
      storyTranscript: next[1] ?? "",
      selfIntroAudioId: nextAudioIds[0],
      storyAudioId: nextAudioIds[1],
      focusAreas: ["保持连续表达", "使用完整表达块", "补充原因和例子"],
      scores: {
        intelligibility: totalWords > 40 ? 3 : 2,
        fluency: totalWords > 70 ? 3 : 2,
        expression: totalWords > 55 ? 3 : 2,
        interaction: 2
      }
    };
    await onComplete(profile, baseline);
  };

  if (step > 0) {
    return (
      <main className="onboarding-shell">
        <div className="mini-brand">
          <span className="brand-mark">E</span>
          <span>EasySay</span>
        </div>
        <div className="step-track">
          {[0, 1, 2].map((value) => (
            <span key={value} className={step >= value ? "active" : ""}>
              {step > value ? <Check size={12} /> : value + 1}
            </span>
          ))}
        </div>
        {creating ? (
          <section className="onboarding-card loading-card">
            <div className="thinking-ring" />
            <span className="eyebrow">正在制定路线</span>
            <h1>把目标变成每天能完成的任务</h1>
            <p>正在组合你的水平、目标和时间预算...</p>
          </section>
        ) : (
          <BaselineRecorder
            promptIndex={step - 1}
            targetLanguage={targetLanguage}
            onDone={completeRecording}
          />
        )}
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <div className="hero-brand">
        <span className="brand-mark">E</span>
        <span>EasySay</span>
      </div>

      <section className="onboarding-card">
        <span className="eyebrow">你的私人语言口语训练场</span>
        <h1>少学一点，今天就说出来。</h1>
        <p className="lead">
          EasySay 不让你堆课程。每天只完成一次输入、输出、反馈和重说。
        </p>

        <label className="form-field">
          <span>怎么称呼你？</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="输入名字或昵称"
          />
        </label>

        <div className="language-pair">
          <label className="form-field">
            <span>我的母语</span>
            <select
              value={nativeLanguage}
              onChange={(event) => {
                const next = event.target.value as LanguageCode;
                setNativeLanguage(next);
                if (next === targetLanguage) {
                  setTargetLanguage(next === "en" ? "zh-CN" : "en");
                }
              }}
            >
              {languageOptions.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label} · {language.nativeLabel}
                </option>
              ))}
            </select>
          </label>
          <span className="language-arrow" aria-hidden="true">
            <ArrowRight size={18} />
          </span>
          <label className="form-field">
            <span>想学习</span>
            <select
              value={targetLanguage}
              onChange={(event) =>
                setTargetLanguage(event.target.value as LanguageCode)
              }
            >
              {targetLanguageOptions(nativeLanguage).map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label} · {language.nativeLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>你现在大概在哪个水平？</legend>
          <div className="option-grid four">
            {(["A1", "A2", "B1", "B2"] as CefrLevel[]).map((value) => (
              <button
                type="button"
                key={value}
                className={level === value ? "selected" : ""}
                onClick={() => setLevel(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>最想解决哪个场景？</legend>
          <div className="option-grid two">
            {[
              ["daily", "日常交流"],
              ["travel", "旅行沟通"],
              ["work", "职场表达"],
              ["interview", "英文面试"]
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={goal === value ? "selected" : ""}
                onClick={() => setGoal(value as LearningGoal)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="split-fields">
          <fieldset>
            <legend>每天多久？</legend>
            <div className="option-grid three compact">
              {([30, 45, 60] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={minutesPerDay === value ? "selected" : ""}
                  onClick={() => setMinutesPerDay(value)}
                >
                  {value}分
                </button>
              ))}
            </div>
          </fieldset>
          {targetLanguage === "en" && <fieldset>
            <legend>偏好口音</legend>
            <div className="option-grid two compact">
              <button
                type="button"
                className={accent === "american" ? "selected" : ""}
                onClick={() => setAccent("american")}
              >
                美音
              </button>
              <button
                type="button"
                className={accent === "british" ? "selected" : ""}
                onClick={() => setAccent("british")}
              >
                英音
              </button>
            </div>
          </fieldset>}
        </div>

        <button className="primary-button full" onClick={() => setStep(1)}>
          开始两项口语基线
          <ArrowRight size={19} />
        </button>
        <p className="privacy-note">
          录音只保存在本机；启用 Ark 时，文字档案会用于生成计划与反馈。
        </p>
      </section>
    </main>
  );
}
