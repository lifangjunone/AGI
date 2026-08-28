import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AudioLines,
  Gauge,
  HelpCircle,
  SkipForward,
  Sparkles,
  Volume2,
  X
} from "lucide-react";
import {
  analyzeEnglishSentence,
  type SentenceAnalysis,
  type SentenceRole
} from "../data/sentenceAnalysis";
import { speakText } from "../lib/speech";
import type { LearnerProfile } from "../types";

export interface SentenceCandidate {
  text: string;
  translation?: string;
  reason?: string;
}

const roleLabels: Record<SentenceRole, string> = {
  subject: "主语",
  predicate: "谓语",
  object: "宾语",
  adverbial: "状语"
};

const roleHints: Record<SentenceRole, string> = {
  subject: "谁 / 什么",
  predicate: "做什么 / 是什么",
  object: "动作指向",
  adverbial: "时间 · 地点 · 程度"
};

function analyzeOtherLanguage(text: string): SentenceAnalysis {
  return {
    segments: text
      .replace(/[.!?。！？]+$/, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => ({
        role: (index === 0
          ? "subject"
          : index === 1
            ? "predicate"
            : "object") as SentenceRole,
        words: [
          {
            text: word,
            normalized: word.toLocaleLowerCase(),
            ipa: "点按听音",
            meaning: "结合语境理解",
            partOfSpeech: "词语"
          }
        ]
      })),
    pronunciationFeatures: []
  };
}

export default function SentenceLab({
  text,
  translation,
  profile,
  compact = false,
  candidates = [],
  recommendation,
  tutorOpen = false,
  onToggleTutor,
  onSentenceChange,
  tutor
}: {
  text: string;
  translation?: string;
  profile: LearnerProfile;
  compact?: boolean;
  candidates?: SentenceCandidate[];
  recommendation?: SentenceCandidate;
  tutorOpen?: boolean;
  onToggleTutor?: () => void;
  onSentenceChange?: (sentence: SentenceCandidate) => void;
  tutor?: ReactNode;
}) {
  const [activeWord, setActiveWord] = useState<string>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRecommendation, setShowRecommendation] = useState(
    Boolean(recommendation)
  );
  const [changing, setChanging] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<
    "natural" | "slow" | "word"
  >();
  const timers = useRef<number[]>([]);
  const sentenceQueue = useMemo(() => {
    const unique = new Map<string, SentenceCandidate>();
    [{ text, translation }, recommendation, ...candidates].forEach((item) => {
      if (!item?.text.trim() || !item.translation?.trim()) return;
      const key = item.text.trim().toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, item);
    });
    if (unique.size === 0 && text.trim()) {
      unique.set(text.trim().toLocaleLowerCase(), {
        text,
        translation: translation?.trim() || "该句翻译资料正在补充"
      });
    }
    return Array.from(unique.values());
  }, [candidates, recommendation, text, translation]);
  const currentSentence = sentenceQueue[currentIndex] ?? {
    text,
    translation
  };
  const analysis = useMemo(
    () =>
      profile.targetLanguage === "en"
        ? analyzeEnglishSentence(currentSentence.text)
        : analyzeOtherLanguage(currentSentence.text),
    [currentSentence.text, profile.targetLanguage]
  );
  const indexedWords = useMemo(
    () =>
      analysis.segments.flatMap((segment, segmentIndex) =>
        segment.words.map((word, wordIndex) => ({
          word,
          key: `${segmentIndex}-${wordIndex}`
        }))
      ),
    [analysis]
  );

  const clearVisualPlayback = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  useEffect(() => clearVisualPlayback, []);

  useEffect(() => {
    setCurrentIndex(0);
  }, [text]);

  useEffect(() => {
    setShowRecommendation(Boolean(recommendation));
  }, [recommendation?.text]);

  useEffect(() => {
    onSentenceChange?.(currentSentence);
  }, [currentSentence, onSentenceChange]);

  const finishVisualPlayback = (delay: number) => {
    timers.current.push(
      window.setTimeout(() => {
        setActiveWord(undefined);
        setPlaybackMode(undefined);
      }, delay)
    );
  };

  const playWord = (word: string, key: string) => {
    clearVisualPlayback();
    setPlaybackMode("word");
    setActiveWord(key);
    finishVisualPlayback(950);
    void speakText(word, profile.accent, profile.targetLanguage, { rate: 0.78 });
  };

  const playSentence = (mode: "natural" | "slow") => {
    clearVisualPlayback();
    setPlaybackMode(mode);
    const step = mode === "slow" ? 680 : 460;
    indexedWords.forEach(({ key }, index) => {
      timers.current.push(
        window.setTimeout(() => setActiveWord(key), index * step)
      );
    });
    finishVisualPlayback(indexedWords.length * step + 250);
    void speakText(
      currentSentence.text,
      profile.accent,
      profile.targetLanguage,
      {
      rate: mode === "slow" ? 0.72 : 0.92
      }
    );
  };

  const selectSentence = (index: number) => {
    clearVisualPlayback();
    setPlaybackMode(undefined);
    setActiveWord(undefined);
    setChanging(true);
    setCurrentIndex(index);
    timers.current.push(
      window.setTimeout(() => setChanging(false), 360)
    );
  };

  const showNextSentence = () => {
    selectSentence((currentIndex + 1) % sentenceQueue.length);
  };

  const recommendationIndex = recommendation
    ? sentenceQueue.findIndex(
        (item) =>
          item.text.trim().toLocaleLowerCase() ===
          recommendation.text.trim().toLocaleLowerCase()
      )
    : -1;

  return (
    <section
      className={`sentence-lab ${compact ? "compact " : ""}${
        playbackMode ? "is-playing" : ""
      }${changing ? " is-changing" : ""}`}
      aria-label="句子结构与发音分析"
    >
      <div className="sentence-ambient" aria-hidden="true" />
      <div className="sentence-lab-head">
        <div>
          <span className="sentence-kicker">
            <Sparkles size={11} /> 句子透视
          </span>
          <strong>结构、发音、词法，一次看懂</strong>
          <small>
            {indexedWords.length} 个词 · {analysis.segments.length} 个语块
          </small>
        </div>
        <div className="sentence-audio-actions" aria-label="句子播放速度">
          <button
            type="button"
            className={playbackMode === "natural" ? "active" : ""}
            aria-label="自然语速播放整句"
            title="自然语速"
            onClick={() => playSentence("natural")}
          >
            <Volume2 size={16} />
            <span>自然</span>
          </button>
          <button
            type="button"
            className={playbackMode === "slow" ? "active" : ""}
            aria-label="慢速播放整句"
            title="0.75 倍慢速"
            onClick={() => playSentence("slow")}
          >
            <Gauge size={16} />
            <span>慢速</span>
          </button>
          {sentenceQueue.length > 1 && (
            <button
              type="button"
              className="sentence-next-button"
              aria-label="换下一句"
              title="换下一句"
              onClick={showNextSentence}
            >
              <SkipForward size={16} />
              <span>下一句</span>
            </button>
          )}
          {onToggleTutor && (
            <button
              type="button"
              className={`sentence-tutor-button ${tutorOpen ? "active" : ""}`}
              aria-label="问 AI 老师"
              title="问当前句子"
              onClick={onToggleTutor}
            >
              <HelpCircle size={16} />
              <span>问老师</span>
            </button>
          )}
        </div>
      </div>

      <div className="sentence-now-playing" aria-hidden="true">
        <div className="sentence-wave">
          {Array.from({ length: 13 }, (_, index) => (
            <i key={index} style={{ animationDelay: `${index * 55}ms` }} />
          ))}
        </div>
        <span>
          {playbackMode
            ? playbackMode === "slow"
              ? "0.75× 慢速拆音"
              : playbackMode === "word"
                ? "单词精听"
                : "自然语流"
            : "点按任意单词精听"}
        </span>
      </div>

      <div className="sentence-overview">
        <p>{currentSentence.text}</p>
        <span className="sentence-overview-translation">
          {currentSentence.translation}
        </span>
        {sentenceQueue.length > 1 && (
          <small>
            {currentIndex + 1} / {sentenceQueue.length}
          </small>
        )}
      </div>

      {tutorOpen && tutor}

      {showRecommendation && recommendation && (
        <aside className="sentence-recommendation" aria-label="薄弱项强化推荐">
          <Sparkles size={16} />
          <div>
            <span>为你发现一条强化句</span>
            <strong>{recommendation.text}</strong>
            {recommendation.reason && <p>{recommendation.reason}</p>}
          </div>
          <button
            type="button"
            className="sentence-recommendation-start"
            onClick={() => {
              if (recommendationIndex >= 0) {
                selectSentence(recommendationIndex);
              }
              setShowRecommendation(false);
            }}
          >
            开始强化
          </button>
          <button
            type="button"
            className="sentence-recommendation-close"
            aria-label="关闭强化推荐"
            onClick={() => setShowRecommendation(false)}
          >
            <X size={14} />
          </button>
        </aside>
      )}

      <div className="sentence-track">
        {analysis.segments.map((segment, segmentIndex) => (
          <article
            key={`${segment.role}-${segmentIndex}`}
            className={`sentence-segment ${segment.role}`}
            style={{ animationDelay: `${segmentIndex * 70}ms` }}
          >
            <div className="segment-label">
              <strong>{roleLabels[segment.role]}</strong>
              <span>{roleHints[segment.role]}</span>
            </div>
            <div className="sentence-word-row">
              {segment.words.map((word, wordIndex) => {
                const key = `${segmentIndex}-${wordIndex}`;
                const characterCount = Array.from(word.text).length;
                const wordWidth = Math.min(
                  132,
                  characterCount <= 2
                    ? 50
                    : characterCount <= 4
                      ? 58
                      : characterCount <= 6
                        ? 72
                        : 76 + characterCount * 3
                );
                const wordFontSize =
                  characterCount >= 11
                    ? 12
                    : characterCount >= 9
                      ? 13
                      : characterCount >= 7
                        ? 14
                        : characterCount >= 5
                          ? 16
                          : 18;
                return (
                  <button
                    type="button"
                    key={`${word.text}-${key}`}
                    className={`sentence-word ${
                      word.text.length >= 6 ? "long-word " : ""
                    }${
                      activeWord === key ? "playing" : ""
                    }`}
                    style={
                      {
                        animationDelay: `${wordIndex * 45}ms`,
                        "--word-width": `${wordWidth}px`,
                        "--word-font-size": `${wordFontSize}px`
                      } as CSSProperties
                    }
                    aria-label={`播放 ${word.text}，${word.ipa}，${word.meaning}，${word.partOfSpeech}`}
                    title={`点按听 ${word.text} 的发音`}
                    onClick={() => playWord(word.text, key)}
                  >
                    <span className="word-ipa">{word.ipa}</span>
                    <strong>{word.text}</strong>
                    <i aria-hidden="true" />
                    <span className="word-meaning">{word.meaning}</span>
                    <span className="word-meta">
                      <b>{word.partOfSpeech}</b>
                      {word.stress && <em>{word.stress}</em>}
                    </span>
                    <AudioLines
                      className="word-audio-indicator"
                      size={13}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {analysis.pronunciationFeatures.length > 0 && (
        <div className="pronunciation-strip" aria-label="自然发音提示">
          <span>自然语流</span>
          <div>
            {analysis.pronunciationFeatures.map((feature, index) => (
              <button
                type="button"
                key={`${feature.label}-${feature.detail}`}
                title="点按播放相关词组"
                onClick={() => {
                  const words = analysis.segments.flatMap(
                    (segment) => segment.words
                  );
                  const phrase = feature.wordIndexes
                    .map((wordIndex) => words[wordIndex]?.text)
                    .filter(Boolean)
                    .join(" ");
                  void speakText(
                    phrase,
                    profile.accent,
                    profile.targetLanguage,
                    { rate: 0.76 }
                  );
                }}
              >
                <strong>{feature.label}</strong>
                <span>{feature.detail}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {activeWord
          ? `正在播放 ${indexedWords.find((item) => item.key === activeWord)?.word.text}`
          : ""}
      </span>
    </section>
  );
}
