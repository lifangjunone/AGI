import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  UserRound,
  Volume2
} from "lucide-react";
import { getLanguage } from "../data/languages";
import { synthesizeSpeech } from "../lib/api";
import { speakText } from "../lib/speech";
import type { LearnerProfile, WeekPlan } from "../types";

type Lesson = NonNullable<WeekPlan["lesson"]>;
type SubtitleMode =
  | "blind"
  | "native-target"
  | "target-native"
  | "target-only"
  | "native-only";

function playBrowserSpeech(
  text: string,
  lang: string,
  cancelled: () => boolean
): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.92;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    if (cancelled()) {
      resolve();
      return;
    }
    window.speechSynthesis.speak(utterance);
  });
}

function ListeningVideo({
  profile,
  theme,
  lesson
}: {
  profile: LearnerProfile;
  theme: string;
  lesson: Lesson;
}) {
  const [mode, setMode] = useState<SubtitleMode>("blind");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [imageReady, setImageReady] = useState(false);
  const runRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const target = getLanguage(profile.targetLanguage);
  const native = getLanguage(profile.nativeLanguage);
  const subtitleModes: Array<{ id: SubtitleMode; label: string }> = [
    { id: "blind", label: "盲听" },
    {
      id: "native-target",
      label: `${native.label[0]} / ${target.label[0]}`
    },
    {
      id: "target-native",
      label: `${target.label[0]} / ${native.label[0]}`
    },
    { id: "target-only", label: `仅${target.label}` },
    { id: "native-only", label: `仅${native.label}` }
  ];
  const currentLine = lesson.dialogues[lineIndex] ?? lesson.dialogues[0];
  const progress = ((lineIndex + (playing ? 1 : 0)) / lesson.dialogues.length) * 100;
  const imageUrl = useMemo(() => {
    const prompt = encodeURIComponent(
      `Realistic cinematic language learning scene for ${theme}, two adults having a natural conversation, clear faces and gestures, modern real-world setting, bright readable composition, no text, no logos`
    );
    return `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${prompt}&image_size=landscape_16_9`;
  }, [theme]);

  const stop = () => {
    runRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = undefined;
    window.speechSynthesis.cancel();
    setPlaying(false);
    setLoading(false);
  };

  useEffect(() => stop, []);

  const playLine = async (text: string, runId: number) => {
    try {
      const blob = await synthesizeSpeech({
        text,
        accent: profile.accent,
        language: target.asrLanguage.toLowerCase()
      });
      if (runId !== runRef.current) return;
      await new Promise<void>((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        void audio.play();
      });
    } catch {
      await playBrowserSpeech(
        text,
        target.speechTag,
        () => runId !== runRef.current
      );
    }
  };

  const play = async () => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    setPlaying(true);
    setLoading(true);
    for (let index = 0; index < lesson.dialogues.length; index += 1) {
      if (runId !== runRef.current) return;
      setLineIndex(index);
      await playLine(lesson.dialogues[index].target, runId);
      setLoading(false);
    }
    if (runId === runRef.current) {
      setPlaying(false);
      setLineIndex(0);
    }
  };

  return (
    <section className="listening-video">
      <div
        className={`listening-stage ${playing ? "is-playing" : ""}`}
      >
        <img
          className={imageReady ? "listening-scene-image ready" : "listening-scene-image"}
          src={imageUrl}
          alt=""
          onLoad={(event) => {
            const image = event.currentTarget;
            setImageReady(image.naturalWidth / image.naturalHeight > 1.5);
          }}
          onError={() => setImageReady(false)}
        />
        <div className="listening-scene-fallback" aria-hidden="true">
          <div className="scene-window">
            <span />
            <span />
            <span />
          </div>
          <div
            className={`scene-person interviewer ${
              playing && lineIndex % 2 === 0 ? "active" : ""
            }`}
          >
            <span><BriefcaseBusiness size={24} /></span>
            <small>{lesson.roles[0]?.name}</small>
          </div>
          <div className="scene-table" />
          <div
            className={`scene-person learner ${
              playing && lineIndex % 2 === 1 ? "active" : ""
            }`}
          >
            <span><UserRound size={25} /></span>
            <small>{lesson.roles[1]?.name}</small>
          </div>
        </div>
        <div className="listening-stage-shade" />
        <span className="video-kicker">VIDEO LISTENING · {lineIndex + 1}/{lesson.dialogues.length}</span>
        <button
          className="video-play-button"
          onClick={playing ? stop : () => void play()}
          aria-label={playing ? "停止播放" : "播放视频盲听"}
        >
          {loading ? (
            <span className="video-loader" />
          ) : playing ? (
            <Pause size={26} fill="currentColor" />
          ) : (
            <Play size={28} fill="currentColor" />
          )}
        </button>
        {mode !== "blind" && currentLine && (
          <div className={`video-subtitles ${mode}`}>
            {(mode === "native-target" ||
              mode === "native-only") && (
              <p className="native-caption">{currentLine.translation}</p>
            )}
            {(mode === "target-native" ||
              mode === "target-only" ||
              mode === "native-target") && (
              <p className="target-caption">{currentLine.target}</p>
            )}
            {mode === "target-native" && (
              <p className="native-caption">{currentLine.translation}</p>
            )}
          </div>
        )}
        <div className="video-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="subtitle-mode-control" aria-label="字幕模式">
        {subtitleModes.map((item) => (
          <button
            key={item.id}
            className={mode === item.id ? "active" : ""}
            onClick={() => setMode(item.id)}
          >
            {item.id === "blind" && mode === "blind" ? (
              <EyeOff size={13} />
            ) : item.id === "blind" ? (
              <Eye size={13} />
            ) : null}
            {item.label}
          </button>
        ))}
      </div>
      <p className="listening-tip">
        第一次先盲听抓住场景和人物关系，再按需要切换字幕核对。
      </p>
    </section>
  );
}

function OutputTraining({ lesson }: { lesson: Lesson }) {
  return (
    <div className="output-drill-list">
      {lesson.outputDrills.map((drill, index) => (
        <details key={drill.question}>
          <summary>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{drill.question}</strong>
              <small>{drill.questionTranslation}</small>
            </div>
          </summary>
          <div className="output-answer">
            <span>参考回答</span>
            <p>{drill.answer}</p>
            <small>{drill.answerTranslation}</small>
            <span>还可以这样表达</span>
            <ul>
              {drill.alternatives.map((alternative) => (
                <li key={alternative}>{alternative}</li>
              ))}
            </ul>
            <div className="common-mistake">
              <strong>避免这样说</strong>
              <p>{drill.commonMistake}</p>
              <small>{drill.explanation}</small>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function Flashcards({
  profile,
  lesson
}: {
  profile: LearnerProfile;
  lesson: Lesson;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const card = lesson.flashcards[index];
  if (!card) return null;

  const move = (direction: number) => {
    setIndex(
      (current) =>
        (current + direction + lesson.flashcards.length) %
        lesson.flashcards.length
    );
    setRevealed(false);
  };

  return (
    <div className="flashcard-deck">
      <button
        className={`memory-card ${revealed ? "revealed" : ""}`}
        onClick={() => setRevealed((value) => !value)}
      >
        {!revealed ? (
          <>
            <span>回忆提示</span>
            <strong>{card.recallPrompt}</strong>
            <small>点击翻面</small>
          </>
        ) : (
          <>
            <span>答案</span>
            <strong>{card.term}</strong>
            {card.pronunciation && <em>{card.pronunciation}</em>}
            <p>{card.meaning}</p>
            <small>{card.example}</small>
          </>
        )}
      </button>
      <div className="flashcard-actions">
        <button onClick={() => move(-1)} aria-label="上一张">
          <ChevronLeft size={18} />
        </button>
        <span>{index + 1} / {lesson.flashcards.length}</span>
        <button
          onClick={() =>
            void speakText(
              card.term,
              profile.accent,
              profile.targetLanguage
            )
          }
          aria-label="播放词卡"
        >
          <Volume2 size={17} />
        </button>
        <button onClick={() => move(1)} aria-label="下一张">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export default function LessonPracticeModules({
  profile,
  theme,
  lesson
}: {
  profile: LearnerProfile;
  theme: string;
  lesson: Lesson;
}) {
  return (
    <>
      <details>
        <summary>
          <Check size={17} />
          输出训练
        </summary>
        <OutputTraining lesson={lesson} />
      </details>
      <details>
        <summary>
          <RotateCcw size={17} />
          记忆卡片
        </summary>
        <Flashcards profile={profile} lesson={lesson} />
      </details>
      <details open>
        <summary>
          <Play size={17} />
          视频盲听 · 验证
        </summary>
        <ListeningVideo profile={profile} theme={theme} lesson={lesson} />
      </details>
    </>
  );
}
