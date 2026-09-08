import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  BookOpenText,
  Box,
  CaseUpper,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Eye,
  Flame,
  Gauge,
  GitBranch,
  GraduationCap,
  Headphones,
  History,
  Languages,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  PersonStanding,
  Play,
  Repeat2,
  Send,
  ScanFace,
  ScrollText,
  Settings2,
  Shirt,
  SkipBack,
  SkipForward,
  Captions,
  Sparkles,
  Star,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X
} from "lucide-react";
import {
  createImportedAvatar,
  getBuiltInAvatarUrl,
  type AvatarAsset,
  type AvatarGenerationStatus
} from "./avatar";
import {
  outfits,
  performances,
  personas,
  scenarios,
  scoreUtterance,
  type Outfit,
  type PerformanceState,
  type Persona,
  type Scenario
} from "./data";
import voiceProfiles from "../electron/voice-profiles.json";
import AvatarRenderer, { type RenderMode } from "./AvatarRenderer";
import {
  type AvatarRenderState,
  type ViewMode
} from "./ImmersiveStage";
import {
  analyzeStructure,
  analyzeWords,
  createOpening,
  createSuggestions,
  difficultyProfiles,
  splitLocalizedLine,
  subtitleLines,
  subtitleModes,
  type Difficulty,
  type LocalizedLine,
  type SubtitleMode
} from "./language";
import {
  buildDailyPracticePlan,
  buildRecommendations,
  initialLearningProfile,
  updateLearningProfile,
  type AdaptiveRecommendation,
  type DailyPracticePlan,
  type LearningProfile,
  type PracticeDuration
} from "./recommendations";
import {
  createRendererPerformanceCommand,
  createSpeechFaceCommand,
  createSpeechStopCommand,
  type SpeechWordBoundary
} from "./metahuman-protocol";
import {
  createVisemeFaceAnimation,
  decodeAudioEnvelope,
  lipSyncModes,
  type LipSyncHealth,
  type LipSyncMode
} from "./lipsync";
import {
  formatIdentityHair,
  getRuntimeIdentity,
  identityManifest,
  runtimeAvatarAssets,
  runtimeIdentities
} from "./identity-manifest";
import {
  getPortraitIdentity,
  portraitAvatarAssets,
  portraitPersonas
} from "./portrait-catalog";
import {
  asiaPortraitAvatarAssets,
  asiaPortraitPersonas,
  getAsiaPortraitIdentity
} from "./portrait-catalog-asia";
import {
  asia3PortraitAvatarAssets,
  asia3PortraitPersonas,
  getAsia3PortraitIdentity
} from "./portrait-catalog-asia3";
import {
  createEstimatedTimeline,
  createSubtitleFocus,
  getActiveBoundaryIndex
} from "./subtitle-playback";
import {
  prepareLocalSpeechRecognition,
  startLocalSpeechRecognition,
  type LocalSpeechSession
} from "./local-speech-recognition";
import { createScenarioDialogueReply } from "./scenario-dialogue";
import {
  getListeningDialogue,
  getListeningProgress,
  listeningRounds,
  type ListeningLine,
  type ListeningSpeaker
} from "./listening-dialogues";
import {
  buildStudyCurriculum,
  type StudyCurriculum,
  type StudyGrammar,
  type StudyModule,
  type StudyPhrase,
  type StudyStructure,
  type StudyWord
} from "./study-curriculum";
import {
  buildStudyLoopSequence,
  nextStudyLoopOrdinal
} from "./study-auto-loop";
import {
  getSyntaxColorRole,
  getSyntaxRoleLabel
} from "./syntax-colors";

type PanelTab = "avatar" | "persona" | "wardrobe" | "voice" | "language";
type LearningMode = "dialogue" | "word" | "grammar";
type SessionMode = "roleplay" | "listening";
type LearningFontSize = "small" | "standard" | "large" | "xlarge";
type PortraitSet = "original" | "asia" | "asia3";
type PortraitFrame = "half" | "full";
type ChatMessage = {
  id: number;
  speaker: "learner" | "persona";
  line: LocalizedLine;
};

type VoiceProfile = {
  id: string;
  name: string;
  style: string;
  voice: string;
  language: string;
  hint: string;
  rateAdjust: number;
  pitch: string;
};

type VoiceStatus = "idle" | "generating" | "playing" | "fallback";
type SubtitlePlayback = {
  timeline: SpeechWordBoundary[];
  activeIndex: number;
  sourceText: string;
};
type AnalyzedWord = ReturnType<typeof analyzeWords>[number];
type StageWordSelection = {
  word: AnalyzedWord;
  sentence: string;
  left: number;
  top: number;
  pinned: boolean;
};
type LearningWordSelection = {
  word: AnalyzedWord;
  sentence: string;
};
type TranscriptLine = LocalizedLine & {
  speaker: ListeningSpeaker;
};
type GrammarAnswer = Awaited<
  ReturnType<NonNullable<Window["desktopWindow"]>["askGrammar"]>
>;
type StudyExplanation = Awaited<
  ReturnType<NonNullable<Window["desktopWindow"]>["explainStudy"]>
>;
type TeachingCue = "meaning" | "usage" | "example" | "repeat";
type RecognitionPhase =
  | "loading"
  | "idle"
  | "preparing"
  | "listening"
  | "transcribing";

const studioAvatar = runtimeAvatarAssets[0];
const portraitStudioAvatar = portraitAvatarAssets[0];
const allPersonas = [...portraitPersonas, ...personas];

const neuralVoices = voiceProfiles as VoiceProfile[];
const verifiedPersonaIds = new Set(
  runtimeIdentities.map((identity) => identity.id)
);
const verifiedOutfitIds = new Set(["studio-basic"]);
const learningProfileStorageKey = "english-immersion-learning-profile";
const sessionDurationStorageKey = "english-immersion-session-duration";
const learningFontSizeStorageKey = "english-immersion-learning-font-size";
const syntaxColorsStorageKey = "english-immersion-syntax-colors";
const learningFontSizes: Array<{
  id: LearningFontSize;
  label: string;
  sample: string;
}> = [
  { id: "small", label: "小", sample: "Aa" },
  { id: "standard", label: "标准", sample: "Aa" },
  { id: "large", label: "大", sample: "Aa" },
  { id: "xlarge", label: "特大", sample: "Aa" }
];
const explanationLevelNames: Record<Difficulty, string> = {
  A1: "入门短句",
  A2: "基础表达",
  B1: "中级解释",
  B2: "深入对比",
  C1: "高级语用",
  C2: "精细辨析"
};
const explanationNarrationRates: Record<Difficulty, number> = {
  A1: 0.7,
  A2: 0.76,
  B1: 0.84,
  B2: 0.92,
  C1: 1,
  C2: 1.06
};
const teachingStepMeta: Array<{
  cue: TeachingCue;
  label: string;
  prompt: string;
}> = [
  { cue: "meaning", label: "意思", prompt: "先听懂" },
  { cue: "usage", label: "用法", prompt: "再理解" },
  { cue: "example", label: "例句", prompt: "放进场景" },
  { cue: "repeat", label: "跟读", prompt: "开口模仿" }
];

function readStoredLearningProfile(): LearningProfile {
  try {
    const stored = window.localStorage.getItem(learningProfileStorageKey);
    if (!stored) return initialLearningProfile;
    const parsed = JSON.parse(stored) as Partial<LearningProfile>;
    if (
      typeof parsed.turns !== "number" ||
      typeof parsed.fluency !== "number" ||
      typeof parsed.accuracy !== "number" ||
      typeof parsed.expression !== "number" ||
      typeof parsed.vocabulary !== "number" ||
      typeof parsed.averageWords !== "number" ||
      typeof parsed.connectorUses !== "number"
    ) {
      return initialLearningProfile;
    }
    return {
      turns: parsed.turns,
      fluency: parsed.fluency,
      accuracy: parsed.accuracy,
      expression: parsed.expression,
      vocabulary: parsed.vocabulary,
      averageWords: parsed.averageWords,
      connectorUses: parsed.connectorUses
    };
  } catch {
    return initialLearningProfile;
  }
}

function readStoredSessionDuration(): PracticeDuration {
  try {
    const stored = Number(
      window.localStorage.getItem(sessionDurationStorageKey)
    );
    return ([5, 10, 20, 30, 60] as number[]).includes(stored)
      ? (stored as PracticeDuration)
      : 20;
  } catch {
    return 20;
  }
}

function readStoredLearningFontSize(): LearningFontSize {
  try {
    const stored = window.localStorage.getItem(learningFontSizeStorageKey);
    return learningFontSizes.some((option) => option.id === stored)
      ? (stored as LearningFontSize)
      : "standard";
  } catch {
    return "standard";
  }
}

function TitleBar({ onSettings }: { onSettings: () => void }) {
  const isMac = window.desktopWindow?.platform === "darwin";
  return (
    <header className="title-bar">
      <div className={`window-controls ${isMac ? "native-hidden" : ""}`}>
        <button aria-label="Close window" onClick={() => window.desktopWindow?.close()}>
          <X size={13} />
        </button>
        <button aria-label="Minimize window" onClick={() => window.desktopWindow?.minimize()}>
          <Minimize2 size={12} />
        </button>
        <button aria-label="Maximize window" onClick={() => window.desktopWindow?.maximize()}>
          <Maximize2 size={11} />
        </button>
      </div>
      <div className="title-drag-region">
        <div className="brand-lockup">
          <span className="brand-glyph">E</span>
          <span>English Immersion Studio</span>
          <span className="edition">PRIVATE BETA</span>
        </div>
      </div>
      <button
        className="title-icon-button"
        aria-label="Application settings"
        title="Settings"
        onClick={onSettings}
      >
        <Settings2 size={15} />
      </button>
    </header>
  );
}

function SideRail({
  activeScenario,
  activeRecommendationId,
  recommendations,
  dailyPlan,
  onSelect,
  onRecommended,
  onStartDailyPlan,
  onStudyCenter,
  onPhraseLibrary,
  onHistory
}: {
  activeScenario: Scenario;
  activeRecommendationId: string | null;
  recommendations: AdaptiveRecommendation[];
  dailyPlan: DailyPracticePlan;
  onSelect: (scenario: Scenario) => void;
  onRecommended: (recommendation: AdaptiveRecommendation) => void;
  onStartDailyPlan: () => void;
  onStudyCenter: () => void;
  onPhraseLibrary: () => void;
  onHistory: () => void;
}) {
  return (
    <aside className="side-rail">
      <div className="rail-profile">
        <div className="profile-orbit">
          <CircleUserRound size={22} />
        </div>
        <span>J</span>
      </div>

      <nav aria-label="Practice scenarios">
        <section className="daily-plan-card" aria-label="Today's adaptive practice plan">
          <div>
            <span>DAILY PLAN</span>
            <strong>{dailyPlan.duration} MIN</strong>
          </div>
          <p>{dailyPlan.summary}</p>
          <ol>
            {dailyPlan.steps.map((step) => (
              <li key={step.label}>
                <b>{step.minutes}m</b>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
          <button onClick={onStartDailyPlan}>
            <Sparkles size={12} />
            开始今日训练
          </button>
        </section>
        <span className="rail-label">SCENARIOS</span>
        {scenarios.map((scenario) => {
          const Icon = scenario.icon;
          const active = !activeRecommendationId && scenario.id === activeScenario.id;
          return (
            <button
              key={scenario.id}
              className={`scenario-button ${active ? "active" : ""}`}
              onClick={() => onSelect(scenario)}
              aria-current={active ? "page" : undefined}
            >
              <span className="scenario-icon"><Icon size={18} /></span>
              <span>
                <strong>{scenario.title}</strong>
                <small>{scenario.subtitle}</small>
              </span>
              {active && <span className="active-mark" />}
            </button>
          );
        })}
        {recommendations.length > 0 && (
          <div className="recommendation-heading">
            <span className="rail-label">FOR YOU</span>
            <span><Bot size={12} /> AI ADAPTIVE</span>
          </div>
        )}
        {recommendations.map((recommendation) => {
          const Icon = recommendation.scenario.icon;
          const active = recommendation.id === activeRecommendationId;
          return (
            <button
              key={recommendation.id}
              className={`recommendation-button ${active ? "active" : ""}`}
              onClick={() => onRecommended(recommendation)}
              aria-current={active ? "page" : undefined}
              title={recommendation.reason}
            >
              <span className="recommendation-icon"><Icon size={15} /></span>
              <span>
                <strong>{recommendation.scenario.title}</strong>
                <small>{recommendation.reason}</small>
              </span>
              <em>{recommendation.difficulty}</em>
            </button>
          );
        })}
      </nav>

      <div className="rail-footer">
        <button title="学习中心" onClick={onStudyCenter}>
          <GraduationCap size={18} /><span>学习中心</span>
        </button>
        <button title="Phrase library" onClick={onPhraseLibrary}>
          <BookOpenText size={18} /><span>Phrase library</span>
        </button>
        <button title="Session history" onClick={onHistory}>
          <History size={18} /><span>Session history</span>
        </button>
      </div>
    </aside>
  );
}

function CharacterStage({
  scenario,
  persona,
  outfit,
  avatarAsset,
  portraitFrame,
  performance,
  speaking,
  currentLine,
  subtitlePlayback,
  subtitleMode,
  sessionMode,
  listeningHost,
  listeningSpeaker,
  renderMode,
  viewMode,
  onRenderMode,
  onViewMode,
  onAvatarRenderState,
  onReplay,
  onOpenTranscript,
  onSessionMode,
  onStudyWord,
  onStudySentence,
  onSpeakStudyWord
}: {
  scenario: Scenario;
  persona: Persona;
  outfit: Outfit;
  avatarAsset: AvatarAsset;
  portraitFrame: PortraitFrame;
  performance: PerformanceState;
  speaking: boolean;
  currentLine: LocalizedLine;
  subtitlePlayback: SubtitlePlayback;
  subtitleMode: SubtitleMode;
  sessionMode: SessionMode;
  listeningHost: Persona;
  listeningSpeaker: ListeningSpeaker;
  renderMode: RenderMode;
  viewMode: ViewMode;
  onRenderMode: (mode: RenderMode) => void;
  onViewMode: (mode: ViewMode) => void;
  onAvatarRenderState: (state: AvatarRenderState) => void;
  onReplay: () => void;
  onOpenTranscript: () => void;
  onSessionMode: (mode: SessionMode) => void;
  onStudyWord: (word: AnalyzedWord, sentence: string) => void;
  onStudySentence: (sentence: LocalizedLine) => void;
  onSpeakStudyWord: (text: string) => void;
}) {
  const direction = performances[performance];
  const stageRef = useRef<HTMLElement>(null);
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const [stageWord, setStageWord] = useState<StageWordSelection | null>(null);
  const [inlineStructureOpen, setInlineStructureOpen] = useState(false);
  const playbackMatchesLine =
    subtitlePlayback.sourceText === currentLine.english;
  const subtitleFocus = createSubtitleFocus(
    playbackMatchesLine ? subtitlePlayback.timeline : [],
    playbackMatchesLine ? subtitlePlayback.activeIndex : -1
  );
  const sentenceLines = useMemo(
    () => splitLocalizedLine(currentLine),
    [currentLine]
  );
  const activeSentenceIndex =
    subtitleFocus.words.length
      ? Math.min(subtitleFocus.sentenceIndex, sentenceLines.length - 1)
      : 0;
  const visibleLine = sentenceLines[activeSentenceIndex] ?? currentLine;
  const visibleEnglish = visibleLine.english;
  const visibleWords = useMemo(
    () => analyzeWords(visibleEnglish),
    [visibleEnglish]
  );
  const activeWordIndex =
    speaking && subtitleFocus.activeIndex >= 0
      ? Math.min(subtitleFocus.activeIndex, visibleWords.length - 1)
      : -1;
  const inlineStructure = useMemo(
    () => analyzeStructure(visibleEnglish),
    [visibleEnglish]
  );
  const clearHoverTimer = () => {
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  };
  const closeStageWord = () => {
    clearHoverTimer();
    setStageWord(null);
  };
  const positionStageWord = (
    event:
      | React.MouseEvent<HTMLButtonElement>
      | React.FocusEvent<HTMLButtonElement>,
    word: AnalyzedWord,
    pinned: boolean
  ) => {
    clearHoverTimer();
    const stageBounds = stageRef.current?.getBoundingClientRect();
    const wordBounds = event.currentTarget.getBoundingClientRect();
    if (!stageBounds) return;
    const cardWidth = pinned ? 292 : 248;
    const cardHeight = pinned ? 270 : 140;
    const left = Math.max(
      14,
      Math.min(
        stageBounds.width - cardWidth - 14,
        wordBounds.left - stageBounds.left + wordBounds.width / 2 - cardWidth / 2
      )
    );
    const preferAbove = wordBounds.top - stageBounds.top > cardHeight + 18;
    const top = preferAbove
      ? Math.max(58, wordBounds.top - stageBounds.top - cardHeight - 12)
      : Math.min(
          stageBounds.height - cardHeight - 14,
          wordBounds.bottom - stageBounds.top + 12
        );
    setStageWord((current) => {
      // A click establishes the study selection; hover/focus must not downgrade it.
      if (current?.pinned && !pinned) return current;
      return {
        word,
        sentence: visibleEnglish,
        left,
        top,
        pinned
      };
    });
  };
  const scheduleHoverClose = () => {
    if (stageWord?.pinned) return;
    clearHoverTimer();
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setStageWord((current) => (current?.pinned ? current : null));
    }, 120);
  };
  useEffect(
    () => () => {
      clearHoverTimer();
    },
    []
  );

  return (
    <section
      ref={stageRef}
      className={`character-stage render-${renderMode} view-${viewMode} ${speaking ? "is-speaking" : ""}`}
      style={{ "--scene-image": `url("${scenario.image}")` } as React.CSSProperties}
      aria-label={
        renderMode === "2d"
          ? `${scenario.title} focused listening canvas`
          : `${scenario.title} immersive scene`
      }
      onPointerDown={(event) => {
        const target = event.target as Element | null;
        if (
          !target?.closest(
            ".stage-sentence-word, .stage-word-card, .stage-structure-trigger, .focus-inline-structure"
          )
        ) {
          closeStageWord();
        }
      }}
    >
      <AvatarRenderer
        sceneImage={scenario.image}
        sceneId={scenario.id}
        actorName={persona.name}
        renderMode={renderMode}
        performance={performance}
        speaking={speaking}
        viewMode={viewMode}
        avatarAsset={avatarAsset}
        portraitFrame={portraitFrame}
        outfitId={outfit.id}
        onRenderState={onAvatarRenderState}
      />
      <div className="scene-vignette" />
      <div className="scene-header">
        <div>
          <span className="live-dot" />
          <span>{sessionMode === "listening" ? "IMMERSIVE LISTENING" : "LIVE ROLEPLAY"}</span>
          <span className="scene-separator" />
          <span>{scenario.location}</span>
        </div>
        <div className="scene-actions">
          <button
            type="button"
            className="transcript-trigger"
            onClick={onOpenTranscript}
            title="查看完整对话与语言分析"
          >
            <ScrollText size={13} />
            <span>全文</span>
          </button>
          <div className="session-mode-switch" role="group" aria-label="Practice mode">
            <button
              className={sessionMode === "roleplay" ? "active" : ""}
              onClick={() => onSessionMode("roleplay")}
              aria-pressed={sessionMode === "roleplay"}
              title="Interactive roleplay"
            >
              <MessageSquareText size={13} /><span>对话</span>
            </button>
            <button
              className={sessionMode === "listening" ? "active" : ""}
              onClick={() => onSessionMode("listening")}
              aria-pressed={sessionMode === "listening"}
              title="Four-pass listening practice"
            >
              <Headphones size={13} /><span>磨耳朵</span>
            </button>
          </div>
          <div className="render-switch" role="group" aria-label="Character display mode">
            <button
              className={renderMode === "2d" ? "active" : ""}
              onClick={() => onRenderMode("2d")}
              title="2D portrait mode"
              aria-pressed={renderMode === "2d"}
            >
              <ScanFace size={13} /><span>2D</span>
            </button>
            <button
              className={renderMode === "3d" ? "active" : ""}
              onClick={() => onRenderMode("3d")}
              title="Live 3D mode"
              aria-pressed={renderMode === "3d"}
            >
              <Box size={13} /><span>3D</span>
            </button>
          </div>
          {renderMode === "3d" && (
            <div className="view-switch" role="group" aria-label="Camera perspective">
              <button
                className={viewMode === "first" ? "active" : ""}
                onClick={() => onViewMode("first")}
                title="First-person view"
                aria-pressed={viewMode === "first"}
              >
                <Eye size={13} /><span>1ST</span>
              </button>
              <button
                className={viewMode === "third" ? "active" : ""}
                onClick={() => onViewMode("third")}
                title="Third-person view"
                aria-pressed={viewMode === "third"}
              >
                <PersonStanding size={13} /><span>3RD</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="objective-panel">
        <div className="objective-topline">
          <span>SESSION OBJECTIVES</span>
          <span>1 / {scenario.goals.length}</span>
        </div>
        {scenario.goals.map((goal, index) => (
          <div className={`objective-row ${index === 0 ? "current" : ""}`} key={goal}>
            <span>{index === 0 ? <Check size={12} /> : index + 1}</span>
            <p>{goal}</p>
          </div>
        ))}
      </div>

      <div className="performance-state">
        <span className={`expression-signal ${speaking ? "active" : ""}`}>
          <ScanFace size={17} />
        </span>
        <span>
          <strong>{direction.label}</strong>
          <small>{direction.cue}</small>
        </span>
      </div>

      {sessionMode === "listening" ? (
        <div
          className="listening-speaker-pair"
          aria-label={`Current speaker: ${persona.name}`}
        >
          <div
            className={`listening-speaker-card speaker-left ${
              listeningSpeaker === "host" ? "active" : ""
            }`}
            aria-current={listeningSpeaker === "host" ? "true" : undefined}
          >
            <span>01 · SPEAKER A</span>
            <h1>{listeningHost.name}</h1>
            <p>{listeningHost.role} · {listeningHost.accent} English</p>
            <button
              onClick={onReplay}
              disabled={listeningSpeaker !== "host"}
              aria-label={
                listeningSpeaker === "host"
                  ? speaking
                    ? `${listeningHost.name} is speaking`
                    : `Replay ${listeningHost.name}`
                  : `${listeningHost.name} is listening`
              }
            >
              {listeningSpeaker === "host" && speaking ? (
                <AudioLines size={15} />
              ) : (
                <Volume2 size={15} />
              )}
            </button>
          </div>
          <div
            className={`listening-speaker-card speaker-right ${
              listeningSpeaker === "guest" ? "active" : ""
            }`}
            aria-current={listeningSpeaker === "guest" ? "true" : undefined}
          >
            <span>02 · SPEAKER B</span>
            <h1>Alex Chen</h1>
            <p>Conversation partner · International English</p>
            <button
              onClick={onReplay}
              disabled={listeningSpeaker !== "guest"}
              aria-label={
                listeningSpeaker === "guest"
                  ? speaking
                    ? "Alex Chen is speaking"
                    : "Replay Alex Chen"
                  : "Alex Chen is listening"
              }
            >
              {listeningSpeaker === "guest" && speaking ? (
                <AudioLines size={15} />
              ) : (
                <Volume2 size={15} />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="persona-caption">
          <span className="mood">{scenario.mood}</span>
          <h1>{persona.name}</h1>
          <p>{persona.role} · {persona.accent} English</p>
          <button
            onClick={onReplay}
            className={speaking ? "playing" : ""}
            aria-label={speaking ? "Speech playing" : "Replay speech"}
            title={speaking ? "Speech playing" : "Replay speech"}
          >
            {speaking ? <AudioLines size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      )}

      {subtitleMode !== "none" && (
        <div className="pov-subtitle" aria-live="polite">
          <span>{persona.name.split(" ")[0].toUpperCase()} · TO YOU</span>
          {subtitleLines(
            renderMode === "2d" ? visibleLine : currentLine,
            subtitleMode
          ).map((subtitle) => (
            <p
              key={`${subtitle.lang}-${renderMode === "2d" ? activeSentenceIndex : 0}`}
              lang={subtitle.lang}
              className={`subtitle-${subtitle.lang} ${
                subtitle.lang === "en" && speaking && subtitleFocus.words.length
                  ? "synced"
                  : ""
              }`}
            >
              {subtitle.lang === "en" && renderMode === "2d" ? (
                <StageInteractiveSentence
                  sentence={visibleEnglish}
                  words={visibleWords}
                  activeWordIndex={activeWordIndex}
                  onHover={positionStageWord}
                  onLeave={scheduleHoverClose}
                  onClick={(event, word) => {
                    event.stopPropagation();
                    positionStageWord(event, word, true);
                    onStudyWord(word, visibleEnglish);
                    onSpeakStudyWord(word.word);
                  }}
                />
              ) : subtitle.lang === "en" && speaking && subtitleFocus.words.length ? (
                <>
                  {subtitleFocus.hasLeadingWords && <span className="subtitle-ellipsis">…</span>}
                  {subtitleFocus.words.map((word, index) => (
                    <span
                      className={`subtitle-word ${index === subtitleFocus.activeIndex ? "active" : ""}`}
                      key={`${word.startMs}-${word.text}`}
                    >
                      {word.text}
                    </span>
                  ))}
                  {subtitleFocus.hasTrailingWords && <span className="subtitle-ellipsis">…</span>}
                </>
              ) : (
                subtitle.text
              )}
            </p>
          ))}
          {renderMode === "2d" && (
            <>
              <button
                type="button"
                className={`stage-structure-trigger ${inlineStructureOpen ? "active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setInlineStructureOpen((open) => !open);
                  onStudySentence({
                    english: visibleEnglish,
                    chinese: visibleLine.chinese
                  });
                }}
                title="在当前句下方查看结构"
                aria-expanded={inlineStructureOpen}
              >
                <GitBranch size={13} />
                <span>{inlineStructureOpen ? "收起拆句" : "拆句"}</span>
              </button>
              {inlineStructureOpen && (
                <div className="focus-inline-structure">
                  <div className="focus-inline-structure-head">
                    <span>句子骨架</span>
                    <strong>{inlineStructure.skeleton}</strong>
                  </div>
                  <div className="focus-inline-segments">
                    {inlineStructure.segments.map((segment, index) => (
                      <span key={`${segment.role}-${index}`}>
                        <b>{segment.role}</b>
                        {segment.text}
                      </span>
                    ))}
                  </div>
                  <p>
                    <b>模仿：</b>
                    {inlineStructure.imitation}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {renderMode === "2d" && stageWord && (
        <StageWordCard
          selection={stageWord}
          onClose={closeStageWord}
          onSpeak={() => onSpeakStudyWord(stageWord.word.word)}
          onPointerEnter={clearHoverTimer}
          onPointerLeave={scheduleHoverClose}
        />
      )}
      {renderMode === "2d" && (
        <div
          className={`focus-listening-meter ${speaking ? "playing" : ""}`}
          aria-label={speaking ? "Speech playback in progress" : "Ready to listen"}
        >
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}

function ScoreRing({ value, label }: { value: number; label: string }) {
  return (
    <div className="score-block">
      <div
        className="score-ring"
        style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}
      >
        <span>{value}</span>
      </div>
      <small>{label}</small>
    </div>
  );
}

function compactStageSubtitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.split(/(?<=[.!?。！？])\s*/u)[0] ?? normalized;
}

function StageInteractiveSentence({
  sentence,
  words,
  activeWordIndex,
  onHover,
  onLeave,
  onClick
}: {
  sentence: string;
  words: AnalyzedWord[];
  activeWordIndex: number;
  onHover: (
    event:
      | React.MouseEvent<HTMLButtonElement>
      | React.FocusEvent<HTMLButtonElement>,
    word: AnalyzedWord,
    pinned: boolean
  ) => void;
  onLeave: () => void;
  onClick: (
    event: React.MouseEvent<HTMLButtonElement>,
    word: AnalyzedWord
  ) => void;
}) {
  let wordIndex = 0;
  return (
    <>
      {sentence
        .split(/([A-Za-z]+(?:'[A-Za-z]+)?)/g)
        .filter(Boolean)
        .map((part, index) => {
          if (!/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(part)) {
            return <span key={`stage-punctuation-${index}`}>{part}</span>;
          }
          const word = words[wordIndex];
          const currentIndex = wordIndex++;
          if (!word) return <span key={`stage-word-${index}`}>{part}</span>;
          return (
            <button
              type="button"
              className={`stage-sentence-word ${
                currentIndex === activeWordIndex ? "active" : ""
              }`}
              key={`stage-${part}-${index}`}
              onMouseEnter={(event) => onHover(event, word, false)}
              onFocus={(event) => onHover(event, word, false)}
              onMouseLeave={onLeave}
              onBlur={onLeave}
              onClick={(event) => onClick(event, word)}
              title={`${word.part} · ${word.meaning}`}
            >
              {part}
            </button>
          );
        })}
    </>
  );
}

function StageWordCard({
  selection,
  onClose,
  onSpeak,
  onPointerEnter,
  onPointerLeave
}: {
  selection: StageWordSelection;
  onClose: () => void;
  onSpeak: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const { word } = selection;
  return (
    <aside
      className={`stage-word-card ${selection.pinned ? "pinned" : "preview"}`}
      style={{ left: selection.left, top: selection.top }}
      role={selection.pinned ? "dialog" : "status"}
      aria-label={`${word.word} word details`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <header>
        <div>
          <span>{word.part}</span>
          <strong>{word.word}</strong>
          <em>{word.ipa}</em>
        </div>
        {selection.pinned && (
          <button onClick={onClose} aria-label="Close word details" title="Close">
            <X size={13} />
          </button>
        )}
      </header>
      <p className="stage-word-meaning">{word.meaning}</p>
      {selection.pinned ? (
        <>
          <dl>
            <div><dt>词根</dt><dd>{word.root} · {word.rootMeaning}</dd></div>
            <div><dt>构词</dt><dd>{word.formation}</dd></div>
            <div><dt>搭配</dt><dd>{word.phrase}</dd></div>
            <div className="stage-word-example">
              <dt>例句</dt>
              <dd>
                <strong>{word.exampleEnglish}</strong>
                {word.exampleChinese && <span>{word.exampleChinese}</span>}
              </dd>
            </div>
          </dl>
          <button className="stage-word-listen" onClick={onSpeak}>
            <Volume2 size={13} />
            再听一次
          </button>
        </>
      ) : (
        <small>点击固定并听读</small>
      )}
    </aside>
  );
}

function InteractiveSentence({
  sentence,
  onWord
}: {
  sentence: string;
  onWord: (
    event: React.MouseEvent<HTMLButtonElement>,
    word: AnalyzedWord
  ) => void;
}) {
  const analyzedWords = analyzeWords(sentence);
  let wordIndex = 0;
  return (
    <>
      {sentence
        .split(/([A-Za-z]+(?:'[A-Za-z]+)?)/g)
        .filter(Boolean)
        .map((part, index) => {
          if (!/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(part)) {
            return <span key={`punctuation-${index}`}>{part}</span>;
          }
          const word = analyzedWords[wordIndex++];
          return (
            <button
              type="button"
              className="sentence-word"
              key={`${part}-${index}`}
              onClick={(event) => word && onWord(event, word)}
              title={`Study ${part}`}
            >
              {part}
            </button>
          );
        })}
    </>
  );
}

function LocalizedText({
  line,
  mode,
  learner = false,
  onWord,
  onAnalyze
}: {
  line: LocalizedLine;
  mode: SubtitleMode;
  learner?: boolean;
  onWord: (
    event: React.MouseEvent<HTMLButtonElement>,
    word: AnalyzedWord,
    sentence: string
  ) => void;
  onAnalyze: (sentence: LocalizedLine) => void;
}) {
  const sentenceUnits = splitLocalizedLine(line);
  return (
    <div className="localized-lines">
      {sentenceUnits.map((sentence, sentenceIndex) => {
        const visibleLines =
          learner && (mode === "chinese" || mode === "none")
            ? [{ lang: "en", text: sentence.english }]
            : subtitleLines(sentence, mode).filter((subtitle) =>
                subtitle.text.trim()
              );
        return (
          <div
            className="message-sentence"
            key={`${sentence.english}-${sentenceIndex}`}
          >
            <div className="sentence-copy">
              {visibleLines.map((subtitle) => (
                <p
                  key={subtitle.lang}
                  lang={subtitle.lang}
                  className={`subtitle-${subtitle.lang}`}
                >
                  {subtitle.lang === "en" ? (
                    <InteractiveSentence
                      sentence={subtitle.text}
                      onWord={(event, word) =>
                        onWord(event, word, sentence.english)
                      }
                    />
                  ) : (
                    subtitle.text
                  )}
                </p>
              ))}
            </div>
            <button
              type="button"
              className="sentence-analysis-trigger"
              onClick={() => onAnalyze(sentence)}
              title="分析句子结构"
              aria-label={`分析句子结构：${sentence.english}`}
            >
              <GitBranch size={12} />
              <span>拆句</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConversationDock({
  persona,
  suggestions,
  coachCue,
  input,
  recording,
  thinking,
  autoSpeak,
  onInput,
  onSubmit,
  onSuggestion,
  onStartRecording,
  onStopRecording,
  recognitionError,
  recognitionPhase,
  onToggleAutoSpeak
}: {
  persona: Persona;
  suggestions: LocalizedLine[];
  coachCue: string;
  input: string;
  recording: boolean;
  thinking: boolean;
  autoSpeak: boolean;
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSuggestion: (suggestion: LocalizedLine) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recognitionError: string;
  recognitionPhase: RecognitionPhase;
  onToggleAutoSpeak: () => void;
}) {
  return (
    <section className="conversation-dock">
      <div className="dock-guidance">
        <div className="coach-whisper">
          <span><Eye size={12} /> LIVE COACH</span>
          <p>看着 {persona.name.split(" ")[0]}。{coachCue}</p>
        </div>
        <div className="suggestions" aria-label="Suggested replies">
          <span>QUICK REPLIES</span>
          {suggestions.slice(0, 2).map((suggestion) => (
            <button key={suggestion.english} onClick={() => onSuggestion(suggestion)}>
              {suggestion.english}
            </button>
          ))}
        </div>
      </div>

      <div className="dock-response">
        <div className="dock-response-heading">
          <span>{thinking ? `${persona.name.split(" ")[0]} is thinking…` : "YOUR TURN"}</span>
          <button onClick={onToggleAutoSpeak} title="Toggle automatic voice">
            {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>Auto voice</span>
          </button>
        </div>
        <form onSubmit={onSubmit} className="composer">
          <button
            type="button"
            className={`mic-button ${recording ? "recording" : ""}`}
            disabled={recognitionPhase === "loading"}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              onStartRecording();
            }}
            onPointerUp={onStopRecording}
            onPointerCancel={onStopRecording}
            onLostPointerCapture={() => recording && onStopRecording()}
            onKeyDown={(event) => {
              if (
                !event.repeat &&
                (event.key === " " || event.key === "Enter")
              ) {
                event.preventDefault();
                onStartRecording();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onStopRecording();
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={recording ? "Release to stop listening" : "Hold to speak"}
            title={recording ? "Release to stop listening" : "Hold to speak"}
          >
            {recording ? <MicOff size={21} /> : <Mic size={21} />}
            <span className="mic-ripple" />
          </button>
          <label>
            <span className="sr-only">Your response</span>
            <input
              value={input}
              onChange={(event) => onInput(event.target.value)}
              placeholder={recording ? "She is listening…" : "Answer her directly…"}
              autoComplete="off"
            />
          </label>
          <button className="send-button" aria-label="Send response" title="Send response" disabled={!input.trim()}>
            <Send size={17} />
          </button>
        </form>
        <div
          className={`voice-input-status ${recording ? "listening" : recognitionError ? "error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {recognitionError ||
            (recognitionPhase === "loading"
              ? "Preparing offline voice input…"
              : recognitionPhase === "preparing"
                ? "Starting local recognition…"
                : recognitionPhase === "listening"
                  ? "Listening locally · release to finish"
                  : recognitionPhase === "transcribing"
                    ? "Finishing transcription…"
                    : "Hold the microphone while you speak")}
        </div>
      </div>
    </section>
  );
}

function ListeningDock({
  roundIndex,
  lineIndex,
  lineCount,
  playing,
  complete,
  speaker,
  onToggle,
  onPrevious,
  onNext,
  onRound
}: {
  roundIndex: number;
  lineIndex: number;
  lineCount: number;
  playing: boolean;
  complete: boolean;
  speaker: string;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRound: (roundIndex: number) => void;
}) {
  const progress = complete
    ? 100
    : getListeningProgress(roundIndex, lineIndex, lineCount);
  return (
    <section className="listening-dock" aria-label="Four-pass listening practice">
      <div className="listening-rounds" role="tablist" aria-label="Listening passes">
        {listeningRounds.map((round, index) => (
          <button
            key={round.label}
            className={index === roundIndex ? "active" : ""}
            onClick={() => onRound(index)}
            role="tab"
            aria-selected={index === roundIndex}
          >
            <span>0{index + 1}</span>
            <strong>{round.shortLabel}</strong>
          </button>
        ))}
      </div>
      <div className="listening-transport">
        <button onClick={onPrevious} aria-label="Previous listening line" title="上一句">
          <SkipBack size={17} />
        </button>
        <button
          className="listening-play"
          onClick={onToggle}
          aria-label={playing ? "Pause listening practice" : "Play listening practice"}
          title={playing ? "暂停" : "播放"}
        >
          {playing ? <Pause size={19} /> : <Play size={19} />}
        </button>
        <button onClick={onNext} aria-label="Next listening line" title="下一句">
          <SkipForward size={17} />
        </button>
      </div>
      <div className="listening-progress-panel">
        <div>
          <span>{complete ? "训练完成" : listeningRounds[roundIndex].label}</span>
          <strong>{speaker} · {Math.min(lineIndex + 1, lineCount)} / {lineCount}</strong>
        </div>
        <div className="listening-progress-track" aria-label={`${progress}% complete`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>约 30 分钟 · 同一段对话四遍递进输入</p>
      </div>
    </section>
  );
}

function ListeningGuide({
  roundIndex,
  lineCount
}: {
  roundIndex: number;
  lineCount: number;
}) {
  return (
    <aside className="listening-guide">
      <header>
        <Headphones size={16} />
        <span>SCENE IMMERSION</span>
      </header>
      <div className="listening-guide-intro">
        <span>四遍递进输入</span>
        <h2>Listen before you study</h2>
        <p>先建立声音印象，再逐步加入文字线索，最后回到纯听力复测。</p>
      </div>
      <div className="listening-guide-rounds">
        {listeningRounds.map((round, index) => (
          <div className={index === roundIndex ? "active" : ""} key={round.label}>
            <span>0{index + 1}</span>
            <div>
              <strong>{round.label}</strong>
              <small>
                {index === 0
                  ? "不看文字，只抓人物关系与大意"
                  : index === 1
                    ? "用英文确认连读、弱读与关键词"
                    : index === 2
                      ? "核对完整含义与场景表达"
                      : "关闭字幕，检验真实听懂程度"}
              </small>
            </div>
          </div>
        ))}
      </div>
      <footer>
        <strong>{lineCount}</strong>
        <span>句双人对话 · 自动连续播放</span>
      </footer>
    </aside>
  );
}

function AvatarPanel({
  asset,
  status,
  error,
  renderMode,
  portraitFrame,
  onPortraitFrame,
  portraitSet,
  onPortraitSet,
  onAvatar,
  onModel,
  onReset
}: {
  asset: AvatarAsset;
  status: AvatarGenerationStatus;
  error: string;
  renderMode: RenderMode;
  portraitFrame: PortraitFrame;
  onPortraitFrame: (frame: PortraitFrame) => void;
  portraitSet: PortraitSet;
  onPortraitSet: (set: PortraitSet) => void;
  onAvatar: (asset: AvatarAsset) => void;
  onModel: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  const portraitAssets =
    portraitSet === "asia"
      ? asiaPortraitAvatarAssets
      : portraitSet === "asia3"
        ? asia3PortraitAvatarAssets
        : portraitAvatarAssets;
  const availableAvatars =
    renderMode === "2d" ? portraitAssets : runtimeAvatarAssets;
  const sourceLabel = renderMode === "2d" ? "2D PORTRAIT" : {
    bundled: "REALISTIC 3D",
    synthetic: "PORTRAIT REFERENCE",
    imported: "CUSTOM MODEL",
    generated: "PHOTO 3D IDENTITY"
  }[asset.source];
  return (
    <div className="panel-content avatar-panel">
      <div className="panel-intro">
        <span>AVATAR STUDIO</span>
        <h2>{renderMode === "2d" ? "Choose your partner" : "Create a real presence"}</h2>
        <p>
          {renderMode === "2d"
            ? "选择对话角色，立即开始沉浸式英语练习。"
            : "真人比例骨骼、表情、视线和口型在设备端实时驱动。"}
        </p>
      </div>

      <div className="avatar-identity-card">
        <div className="avatar-preview">
          {asset.photoUrl ? (
            <img src={asset.photoUrl} alt={`${asset.label} source portrait`} />
          ) : (
            <ScanFace size={31} />
          )}
          <span className={`avatar-status-dot ${status}`} />
        </div>
        <div>
          <small>{sourceLabel}</small>
          <strong>{asset.label}</strong>
          <span>
            {status === "preparing"
              ? "正在检查照片"
              : renderMode === "2d"
                ? "肖像、语音与课程已就绪"
                : asset.source === "synthetic"
                ? "肖像已选；3D 资产待接入"
                : status === "generating"
                ? "正在生成 3D 身份"
                : status === "error"
                  ? "生成失败"
                  : "骨骼与表情已就绪"}
          </span>
        </div>
      </div>
      {renderMode === "2d" && (
        <div className="focus-canvas-mode-note" role="status">
          <strong>Focus canvas</strong>
          <span>人物肖像仅用于角色选择</span>
        </div>
      )}
      {renderMode === "2d" && (
        <div className="portrait-set-switch" role="tablist" aria-label="Portrait collection">
          <button
            type="button"
            className={portraitSet === "original" ? "active" : ""}
            aria-selected={portraitSet === "original"}
            onClick={() => onPortraitSet("original")}
          >
            Original set
          </button>
          <button
            type="button"
            className={portraitSet === "asia" ? "active" : ""}
            aria-selected={portraitSet === "asia"}
            onClick={() => onPortraitSet("asia")}
          >
            Asian beauty set
          </button>
          <button
            type="button"
            className={portraitSet === "asia3" ? "active" : ""}
            aria-selected={portraitSet === "asia3"}
            onClick={() => onPortraitSet("asia3")}
          >
            Asian beauty set 3
          </button>
        </div>
      )}

      <div className="avatar-capabilities" aria-label="Avatar capabilities">
        {renderMode === "2d" ? (
          <>
            <span><i />PORTRAIT</span>
            <span><i />NEURAL VOICE</span>
            <span><i />SUBTITLES</span>
            <span><i />STUDY TOOLS</span>
          </>
        ) : asset.source === "synthetic" ? (
          <>
            <span><i className="pending" />PORTRAIT</span>
            <span><i className="pending" />3D PENDING</span>
            <span><i className="pending" />RIG PENDING</span>
            <span><i className="pending" />LIP SYNC PENDING</span>
          </>
        ) : (
          <>
            <span><i />SKELETON</span>
            <span><i />FACIAL RIG</span>
            <span><i />TTS CUES</span>
            <span><i />BODY IDLE</span>
          </>
        )}
      </div>

      <div className={`face-library ${renderMode === "2d" ? "portrait-catalog" : ""}`}>
        <div className="face-library-heading">
          <span>{renderMode === "2d" ? "AVAILABLE IDENTITIES" : "LIVE 3D IDENTITIES"}</span>
          <strong>
            {renderMode === "2d"
              ? `${portraitAssets.length} PORTRAITS`
              : `${runtimeIdentities.length} / ${identityManifest.identities.length} RUNTIME READY`}
          </strong>
        </div>
        {availableAvatars.map((avatar) => {
          const identity = getRuntimeIdentity(avatar.id);
          const portraitIdentity =
            portraitSet === "asia"
              ? getAsiaPortraitIdentity(avatar.id)
              : portraitSet === "asia3"
                ? getAsia3PortraitIdentity(avatar.id)
                : getPortraitIdentity(avatar.id);
          return (
            <button
              type="button"
              className={`verified-identity ${asset.id === avatar.id ? "active" : ""}`}
              aria-label={`Switch to ${avatar.label}`}
              aria-pressed={asset.id === avatar.id}
              data-identity-id={avatar.id}
              key={avatar.id}
              onClick={() => onAvatar(avatar)}
            >
              <span className="verified-identity-portrait">
                {avatar.photoUrl ? (
                  <img src={avatar.photoUrl} alt="" />
                ) : (
                  <Check size={13} />
                )}
              </span>
              <div>
                <strong>{avatar.label}</strong>
                <small>
                  {identity && renderMode === "3d"
                    ? `${identity.unrealCharacter} · ${formatIdentityHair(identity.hairId)} Groom`
                    : `${portraitIdentity?.role ?? "Portrait"} · ${portraitIdentity?.adultAge ?? "21"}+`}
                </small>
              </div>
            </button>
          );
        })}
        <p>
          {renderMode === "2d"
            ? "全部角色均为 21 岁以上虚构成年人。"
            : "仅显示已经生成完整 MetaHuman 运行时资产的身份。"}
        </p>
      </div>

      {renderMode === "3d" && <div className="avatar-upload-actions">
        <label className="avatar-secondary-action">
          <Upload size={15} />
          <span><strong>导入本地 3D 模型</strong><small>VRM / GLB · 本地预览</small></span>
          <input type="file" accept=".vrm,.glb,model/gltf-binary" onChange={onModel} />
        </label>
      </div>}

      {error && <p className="avatar-error" role="alert">{error}</p>}

      {renderMode === "3d" && asset.source !== "bundled" && (
        <button className="avatar-reset" onClick={onReset}>
          <Box size={15} />
          Restore studio avatar
        </button>
      )}
      {renderMode === "3d" && (
        <p className="avatar-privacy">照片身份入口将在 MetaHuman Identity 流水线通过验收后开放。</p>
      )}
    </div>
  );
}

function PersonaPanel({
  selected,
  renderMode,
  portraitSet,
  onSelect
}: {
  selected: Persona;
  renderMode: RenderMode;
  portraitSet: PortraitSet;
  onSelect: (persona: Persona) => void;
}) {
  const availablePersonas =
    renderMode === "2d"
      ? portraitSet === "asia"
        ? asiaPortraitPersonas
        : portraitSet === "asia3"
          ? asia3PortraitPersonas
          : portraitPersonas
      : personas.filter((persona) => verifiedPersonaIds.has(persona.id));
  return (
    <div className="panel-content persona-list">
      <div className="panel-intro">
        <span>DIGITAL EMPLOYEE</span>
        <h2>Choose your partner</h2>
        <p>Each personality responds with a distinct rhythm, warmth and conversational style.</p>
      </div>
      {availablePersonas.map((persona) => (
        <button
          className={`persona-option ${persona.id === selected.id ? "selected" : ""}`}
          key={persona.id}
          onClick={() => onSelect(persona)}
        >
          <span className="persona-swatch" style={{ background: persona.color }}>
            {persona.name.charAt(0)}
          </span>
          <span>
            <strong>{persona.name}</strong>
            <small>{persona.trait}</small>
          </span>
          {persona.id === selected.id && <Check size={16} />}
        </button>
      ))}
    </div>
  );
}

function WardrobePanel({
  selected,
  onSelect
}: {
  selected: Outfit;
  onSelect: (outfit: Outfit) => void;
}) {
  return (
    <div className="panel-content">
      <div className="panel-intro">
        <span>WARDROBE</span>
        <h2>Dress the scene</h2>
        <p>Match the character styling to the roleplay, or create a more imaginative atmosphere.</p>
      </div>
      <div className="outfit-grid">
        {outfits.filter((outfit) => verifiedOutfitIds.has(outfit.id)).map((outfit) => (
          <button
            key={outfit.id}
            className={`outfit-option ${outfit.id === selected.id ? "selected" : ""}`}
            onClick={() => onSelect(outfit)}
          >
            <span className={`outfit-art outfit-${outfit.id}`}>
              <WandSparkles size={18} />
            </span>
            <strong>{outfit.name}</strong>
            <small>{outfit.note}</small>
            {outfit.id === selected.id && <span className="outfit-check"><Check size={11} /></span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function VoicePanel({
  selected,
  speed,
  autoSpeak,
  status,
  renderMode,
  lipSyncMode,
  lipSyncHealth,
  onSelect,
  onSpeed,
  onAutoSpeak,
  onLipSyncMode,
  onPreview
}: {
  selected: number;
  speed: number;
  autoSpeak: boolean;
  status: VoiceStatus;
  renderMode: RenderMode;
  lipSyncMode: LipSyncMode;
  lipSyncHealth: LipSyncHealth;
  onSelect: (index: number) => void;
  onSpeed: (speed: number) => void;
  onAutoSpeak: () => void;
  onLipSyncMode: (mode: LipSyncMode) => void;
  onPreview: () => void;
}) {
  return (
    <div className="panel-content">
      <div className="panel-intro">
        <div className="voice-heading-line">
          <span>NEURAL VOICE LAB</span>
          <span className={`voice-status ${status}`}>
            <span />
            {status === "generating"
              ? "生成中"
              : status === "playing"
                ? "播放中"
                : status === "fallback"
                  ? "离线回退"
                  : "Neural HD"}
          </span>
        </div>
        <h2>Choose her presence</h2>
        <p>神经网络音色会根据角色气质调整音高与节奏，减少机械感。</p>
      </div>
      <div className="voice-list">
        {neuralVoices.map((voice, index) => (
          <button
            key={voice.id}
            className={selected === index ? "selected" : ""}
            onClick={() => onSelect(index)}
          >
            <span className="voice-play"><Play size={12} fill="currentColor" /></span>
            <span>
              <strong>{voice.name}<em>{voice.style}</em></strong>
              <small>{voice.language} · {voice.hint}</small>
            </span>
            {selected === index && <Check size={15} />}
          </button>
        ))}
      </div>
      {renderMode === "3d" && <div className="lipsync-comparison">
        <div className="lipsync-heading">
          <span>LIP-SYNC BENCH</span>
          <strong>Same audio · same rig</strong>
        </div>
        <div className="lipsync-modes" role="radiogroup" aria-label="Lip-sync method">
          {lipSyncModes.map((mode) => {
            const unavailable =
              mode.id === "neural" && lipSyncHealth === "unavailable";
            return (
              <button
                type="button"
                role="radio"
                aria-checked={lipSyncMode === mode.id}
                className={lipSyncMode === mode.id ? "selected" : ""}
                data-lipsync-mode={mode.id}
                disabled={unavailable}
                key={mode.id}
                onClick={() => onLipSyncMode(mode.id)}
                title={unavailable ? "Local model service is offline" : mode.detail}
              >
                <span>{mode.label}</span>
                <small>
                  {mode.id === "neural" && lipSyncHealth === "checking"
                    ? "Checking local model"
                    : unavailable
                      ? "Model offline"
                      : mode.detail}
                </small>
              </button>
            );
          })}
        </div>
      </div>}
      <div className="voice-control">
        <div><span>Speaking pace</span><strong>{speed.toFixed(1)}×</strong></div>
        <input
          type="range"
          min="0.7"
          max="1.3"
          step="0.1"
          value={speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
          aria-label="Speaking pace"
        />
      </div>
      <button className="setting-toggle" onClick={onAutoSpeak}>
        <span><strong>Automatic responses</strong><small>Play every character reply aloud</small></span>
        <span className={`toggle ${autoSpeak ? "on" : ""}`}><span /></span>
      </button>
      <button className="preview-voice-button" onClick={onPreview} disabled={status === "generating"}>
        {status === "generating" ? <AudioLines size={16} /> : <Volume2 size={16} />}
        {status === "generating" ? "Generating neural voice…" : "试听当前音色"}
      </button>
    </div>
  );
}

function LanguagePanel({
  line,
  subtitleMode,
  learningFontSize,
  showStructure,
  showPhonetics,
  onSubtitleMode,
  onLearningFontSize,
  onShowStructure,
  onShowPhonetics
}: {
  line: LocalizedLine;
  subtitleMode: SubtitleMode;
  learningFontSize: LearningFontSize;
  showStructure: boolean;
  showPhonetics: boolean;
  onSubtitleMode: (mode: SubtitleMode) => void;
  onLearningFontSize: (size: LearningFontSize) => void;
  onShowStructure: () => void;
  onShowPhonetics: () => void;
}) {
  const structure = useMemo(() => analyzeStructure(line.english), [line.english]);
  const words = useMemo(() => analyzeWords(line.english), [line.english]);
  const phrases = useMemo(
    () => [...new Set(words.map((word) => word.phrase).filter(Boolean))],
    [words]
  );

  return (
    <div className="panel-content language-panel">
      <div className="panel-intro">
        <span>LANGUAGE LENS</span>
        <h2>See how it works</h2>
        <p>当前角色台词会同步拆解，含义均对应本句语境。</p>
      </div>

      <section className="language-section">
        <div className="language-section-title">
          <span>字幕模式</span>
          <Captions size={14} />
        </div>
        <div className="subtitle-mode-grid">
          {subtitleModes.map((mode) => (
            <button
              key={mode.id}
              className={subtitleMode === mode.id ? "selected" : ""}
              onClick={() => onSubtitleMode(mode.id)}
            >
              <strong>{mode.shortLabel}</strong>
              <small>{mode.label}</small>
              {subtitleMode === mode.id && <Check size={12} />}
            </button>
          ))}
        </div>
      </section>

      <section className="language-section">
        <div className="language-section-title">
          <span>学习文字大小</span>
          <CaseUpper size={14} />
        </div>
        <div
          className="learning-font-size-grid"
          role="radiogroup"
          aria-label="学习文字大小"
        >
          {learningFontSizes.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={learningFontSize === option.id}
              className={learningFontSize === option.id ? "selected" : ""}
              key={option.id}
              onClick={() => onLearningFontSize(option.id)}
            >
              <strong>{option.sample}</strong>
              <small>{option.label}</small>
              {learningFontSize === option.id && <Check size={11} />}
            </button>
          ))}
        </div>
      </section>

      <section className="language-section language-switches">
        <button className="setting-toggle" onClick={onShowStructure}>
          <span><strong>句子结构分析</strong><small>句型、时态与逻辑关系</small></span>
          <span className={`toggle ${showStructure ? "on" : ""}`}><span /></span>
        </button>
        <button className="setting-toggle" onClick={onShowPhonetics}>
          <span><strong>单词音标</strong><small>显示 IPA 与词性</small></span>
          <span className={`toggle ${showPhonetics ? "on" : ""}`}><span /></span>
        </button>
      </section>

      {showStructure && (
        <section className="sentence-analysis">
          <span>STRUCTURE</span>
          <p>{line.english}</p>
          <div className="structure-tags">
            <span>{structure.sentenceType}</span>
            <span>{structure.tense}</span>
          </div>
          <div className="sentence-skeleton">
            <span>句子骨架</span>
            <strong>{structure.skeleton}</strong>
          </div>
          <div className="structure-map">
            {structure.segments.map((segment, index) => (
              <span key={`${segment.role}-${index}`}>
                <small>{segment.role}</small>
                <b>{segment.text}</b>
              </span>
            ))}
          </div>
          <div className="imitation-guide">
            <span>模仿公式</span>
            <strong>{structure.imitation}</strong>
            <p>{structure.memoryTip}</p>
          </div>
          <small>{structure.pattern} · {structure.note}</small>
        </section>
      )}

      <section className="word-analysis">
        <div className="language-section-title">
          <span>逐词释义</span>
          <small>{words.length} WORDS</small>
        </div>
        {phrases.length > 0 && (
          <div className="phrase-radar">
            <span>固定搭配</span>
            {phrases.map((phrase) => <strong key={phrase}>{phrase}</strong>)}
          </div>
        )}
        <div className="word-list">
          {words.map((word, index) => (
            <div
              className={`word-row ${word.phrase ? "in-phrase" : ""}`}
              key={`${word.word}-${index}`}
              title={word.phrase || undefined}
            >
              <span>
                <strong>{word.word}</strong>
                {showPhonetics && <em>{word.ipa}</em>}
              </span>
              <span>
                <small>{word.part}</small>
                <b>{word.meaning}</b>
                <em className="word-root">
                  {word.root} · {word.formation}
                </em>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LearningSidebar({
  mode,
  line,
  messages,
  persona,
  subtitleMode,
  selectedWord,
  scores,
  onMode,
  onSelectWord,
  onAnalyze,
  onSpeak
}: {
  mode: LearningMode;
  line: LocalizedLine;
  messages: ChatMessage[];
  persona: Persona;
  subtitleMode: SubtitleMode;
  selectedWord: LearningWordSelection | null;
  scores: { fluency: number; accuracy: number; expression: number };
  onMode: (mode: LearningMode) => void;
  onSelectWord: (word: AnalyzedWord, sentence: string) => void;
  onAnalyze: (sentence: LocalizedLine) => void;
  onSpeak: (text: string) => void;
}) {
  const fallbackWord = useMemo(() => analyzeWords(line.english)[0], [line.english]);
  const activeWord = selectedWord?.word ?? fallbackWord;
  const activeWordSentence = selectedWord?.sentence ?? line.english;
  const structure = useMemo(() => analyzeStructure(line.english), [line.english]);

  return (
    <aside className="learning-sidebar">
      <div className="learning-tabbar" role="tablist" aria-label="Learning tools">
        <button
          className={mode === "dialogue" ? "active" : ""}
          onClick={() => onMode("dialogue")}
          role="tab"
          aria-selected={mode === "dialogue"}
        >
          <MessageSquareText size={14} />
          <span>对话</span>
        </button>
        <button
          className={mode === "word" ? "active" : ""}
          onClick={() => onMode("word")}
          role="tab"
          aria-selected={mode === "word"}
        >
          <BookOpenText size={14} />
          <span>词汇</span>
        </button>
        <button
          className={mode === "grammar" ? "active" : ""}
          onClick={() => onMode("grammar")}
          role="tab"
          aria-selected={mode === "grammar"}
        >
          <GitBranch size={14} />
          <span>拆句</span>
        </button>
      </div>

      <div className="learning-sidebar-content">
        {mode === "dialogue" && (
          <div className="dialogue-focus-panel">
            <div className="learning-panel-intro">
              <span>LIVE DIALOGUE</span>
              <h2>Stay in the moment</h2>
              <p>一次处理一句。点击单词学习，点击“拆句”查看骨架。</p>
            </div>
            <div className="dialogue-stream">
              {messages.slice(-2).map((message) => (
                <div key={message.id} className={`message ${message.speaker}`}>
                  <span className="message-speaker">
                    {message.speaker === "persona"
                      ? persona.name.split(" ")[0]
                      : "You"}
                  </span>
                  <LocalizedText
                    line={message.line}
                    mode={subtitleMode}
                    learner={message.speaker === "learner"}
                    onWord={(_event, word, sentence) =>
                      onSelectWord(word, sentence)
                    }
                    onAnalyze={onAnalyze}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "word" && activeWord && (
          <div className="focused-word-panel">
            <div className="learning-panel-intro">
              <span>WORD FOCUS · {activeWord.part}</span>
              <h2>{activeWord.word}</h2>
              <strong>{activeWord.ipa}</strong>
            </div>
            <div className="focused-word-details">
              <div><span>本句词义</span><p>{activeWord.meaning}</p></div>
              <div><span>词根</span><p><b>{activeWord.root}</b> · {activeWord.rootMeaning}</p></div>
              <div><span>构词</span><p>{activeWord.formation}</p></div>
              <div><span>固定搭配</span><p>{activeWord.phrase}</p></div>
              <div className="focused-word-example">
                <span>简单例句</span>
                <p>
                  {activeWord.exampleEnglish}
                  {activeWord.exampleChinese && <small>{activeWord.exampleChinese}</small>}
                </p>
              </div>
            </div>
            <p className="focused-word-context">{activeWordSentence}</p>
            <button
              className="focused-word-speak"
              onClick={() => onSpeak(activeWord.word)}
            >
              <Volume2 size={15} />
              听发音并跟读
            </button>
          </div>
        )}

        {mode === "grammar" && (
          <div className="focused-grammar-panel">
            <div className="learning-panel-intro">
              <span>SENTENCE ANATOMY</span>
              <h2>See the skeleton</h2>
              <p>{line.english}</p>
            </div>
            <div className="grammar-meta">
              <span>{structure.sentenceType}</span>
              <span>{structure.tense}</span>
            </div>
            <div className="focused-skeleton">
              <span>句子骨架</span>
              <strong>{structure.skeleton}</strong>
            </div>
            <div className="focused-structure-map">
              {structure.segments.map((segment, index) => (
                <div key={`${segment.role}-${index}`}>
                  <span>{segment.role}</span>
                  <strong>{segment.text}</strong>
                </div>
              ))}
            </div>
            <div className="focused-imitation">
              <span>模仿公式</span>
              <strong>{structure.imitation}</strong>
              <p>{structure.memoryTip}</p>
            </div>
          </div>
        )}
      </div>

      <div className="learning-score-strip">
        <ScoreRing value={scores.fluency} label="Fluency" />
        <ScoreRing value={scores.accuracy} label="Accuracy" />
        <ScoreRing value={scores.expression} label="Expression" />
      </div>
    </aside>
  );
}

const transcriptStopWords = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at",
  "for", "with", "is", "am", "are", "was", "were", "be", "been", "it",
  "i", "you", "we", "they", "he", "she", "this", "that", "my", "your",
  "what", "where", "when", "why", "how", "who", "which", "from", "about",
  "as", "by", "if", "than", "then", "so", "very", "more", "most", "some",
  "can", "could", "would", "should", "may", "shall", "will", "do", "does",
  "did", "have", "has", "had"
]);

function DialogueTranscript({
  lines,
  hostName,
  guestName,
  level,
  onClose,
  onSpeakWord,
  onSpeakSentence
}: {
  lines: TranscriptLine[];
  hostName: string;
  guestName: string;
  level: Difficulty;
  onClose: () => void;
  onSpeakWord: (word: string) => void;
  onSpeakSentence: (text: string, speaker: ListeningSpeaker) => void;
}) {
  const sentences = useMemo(
    () =>
      lines.flatMap((line) =>
        splitLocalizedLine(line).map((sentence) => ({
          ...sentence,
          speaker: line.speaker
        }))
      ),
    [lines]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<AnalyzedWord | null>(null);
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState<GrammarAnswer | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState("");
  const qaRequestRef = useRef(0);
  const transcriptLineRefs = useRef<Array<HTMLElement | null>>([]);
  const transcriptInspectorRef = useRef<HTMLElement>(null);
  const selectedLine = sentences[selectedIndex] ?? sentences[0];
  const words = useMemo(
    () => analyzeWords(selectedLine?.english ?? ""),
    [selectedLine?.english]
  );
  const structure = useMemo(
    () => analyzeStructure(selectedLine?.english ?? ""),
    [selectedLine?.english]
  );
  const coreWords = useMemo(
    () =>
      words
        .filter(
          (word, index, all) =>
            word.normalized.length > 2 &&
            !transcriptStopWords.has(word.normalized) &&
            all.findIndex((item) => item.normalized === word.normalized) === index
        )
        .slice(0, 8),
    [words]
  );
  const phrases = useMemo(
    () => [...new Set(words.map((word) => word.phrase).filter(Boolean))].slice(0, 6),
    [words]
  );

  useEffect(() => {
    setSelectedIndex(0);
    setSelectedWord(null);
    setQaQuestion("");
    setQaAnswer(null);
    setQaError("");
  }, [lines]);

  useEffect(() => {
    qaRequestRef.current += 1;
    setQaAnswer(null);
    setQaError("");
    setQaLoading(false);
  }, [selectedIndex, selectedWord?.normalized]);

  const selectSentence = (index: number) => {
    setSelectedIndex(index);
    setSelectedWord(null);
  };

  const moveSentence = (offset: -1 | 1) => {
    const nextIndex = Math.max(
      0,
      Math.min(sentences.length - 1, selectedIndex + offset)
    );
    if (nextIndex === selectedIndex) return;
    selectSentence(nextIndex);
    window.requestAnimationFrame(() => {
      transcriptLineRefs.current[nextIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      transcriptInspectorRef.current?.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  };

  const selectWord = (word: AnalyzedWord, index: number) => {
    setSelectedIndex(index);
    setSelectedWord(word);
  };

  const askGrammar = async (question = qaQuestion) => {
    const normalized = question.trim();
    if (!normalized || !selectedLine || qaLoading) return;
    const requestId = ++qaRequestRef.current;
    setQaQuestion(normalized);
    setQaLoading(true);
    setQaError("");
    try {
      if (!window.desktopWindow?.askGrammar) {
        throw new Error("Grammar assistant is unavailable.");
      }
      const answer = await window.desktopWindow.askGrammar({
        sentence: selectedLine.english,
        translation: selectedLine.chinese,
        question: normalized,
        level
      });
      if (requestId === qaRequestRef.current) setQaAnswer(answer);
    } catch {
      if (requestId === qaRequestRef.current) {
        setQaError("智能分析暂时不可用，请稍后重试。");
      }
    } finally {
      if (requestId === qaRequestRef.current) setQaLoading(false);
    }
  };

  const suggestedQuestions = selectedWord
    ? [
        `为什么这里用 ${selectedWord.word}？`,
        `${selectedWord.word} 可以替换成什么？`
      ]
    : ["这句为什么这样表达？", "这句可以换一种说法吗？"];

  return (
    <section className="transcript-workspace" aria-label="完整对话学习">
      <header className="transcript-header">
        <div>
          <span><ScrollText size={15} /> FULL DIALOGUE</span>
          <h2>完整对话学习</h2>
        </div>
        <div className="transcript-participants">
          <span><i />{hostName}</span>
          <span><i />{guestName}</span>
          <strong>{sentences.length} 句</strong>
        </div>
        <button onClick={onClose} aria-label="关闭完整对话" title="关闭">
          <X size={17} />
        </button>
      </header>

      <div className="transcript-body">
        <div className="transcript-stream">
          {sentences.map((line, index) => {
            const lineWords = analyzeWords(line.english);
            const wordMatches = [
              ...line.english.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)
            ];
            const active = index === selectedIndex;
            return (
              <article
                className={`transcript-line ${line.speaker} ${active ? "active" : ""}`}
                key={`${line.speaker}-${index}-${line.english}`}
                ref={(element) => {
                  transcriptLineRefs.current[index] = element;
                }}
              >
                <div className="transcript-line-meta">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{line.speaker === "host" ? hostName : guestName}</strong>
                </div>
                <div className="transcript-line-copy">
                  <p lang="en">
                    {wordMatches.map((match, wordIndex) => {
                        const word = lineWords[wordIndex];
                        const start = match.index ?? 0;
                        const end = start + match[0].length;
                        const nextStart =
                          wordMatches[wordIndex + 1]?.index ?? line.english.length;
                        const prefix =
                          wordIndex === 0 ? line.english.slice(0, start) : "";
                        const punctuation = line.english
                          .slice(end, nextStart)
                          .trim();
                        return (
                          <span key={`${match[0]}-${wordIndex}`}>
                            {wordIndex > 0 && " "}
                            <span className="transcript-word-token">
                              {prefix}
                              <button
                                onClick={() => word && selectWord(word, index)}
                                title={word ? `${word.part} · ${word.meaning}` : undefined}
                              >
                                {match[0]}
                              </button>
                              {punctuation}
                            </span>
                          </span>
                        );
                      })}
                  </p>
                  <p lang="zh">{line.chinese}</p>
                </div>
                <div className="transcript-line-actions">
                  <button
                    onClick={() => onSpeakSentence(line.english, line.speaker)}
                    aria-label={`朗读第 ${index + 1} 句`}
                    title="朗读整句"
                  >
                    <Volume2 size={14} />
                  </button>
                  <button
                    className={active && !selectedWord ? "active" : ""}
                    onClick={() => selectSentence(index)}
                    aria-label={`分析第 ${index + 1} 句`}
                    title="分析句子"
                  >
                    <GitBranch size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="transcript-inspector" ref={transcriptInspectorRef}>
          <nav className="transcript-sentence-nav" aria-label="切换分析句子">
            <button
              type="button"
              onClick={() => moveSentence(-1)}
              disabled={selectedIndex === 0}
              aria-label="前一句"
              title="前一句"
            >
              <SkipBack size={13} />
              <span>前一句</span>
            </button>
            <output aria-live="polite">
              {String(selectedIndex + 1).padStart(2, "0")}
              <small>/ {String(sentences.length).padStart(2, "0")}</small>
            </output>
            <button
              type="button"
              onClick={() => moveSentence(1)}
              disabled={selectedIndex === sentences.length - 1}
              aria-label="后一句"
              title="后一句"
            >
              <span>后一句</span>
              <SkipForward size={13} />
            </button>
          </nav>
          {selectedWord ? (
            <>
              <div className="transcript-inspector-title word">
                <span>{selectedWord.part}</span>
                <h2>{selectedWord.word}</h2>
                <strong>{selectedWord.ipa}</strong>
                <button
                  onClick={() => onSpeakWord(selectedWord.word)}
                  aria-label={`朗读 ${selectedWord.word}`}
                  title="朗读单词"
                >
                  <Volume2 size={15} />
                </button>
              </div>
              <div className="transcript-word-meaning">
                <span>核心词义</span>
                <strong>{selectedWord.meaning}</strong>
              </div>
              <dl className="transcript-word-details">
                <div><dt>词根</dt><dd>{selectedWord.root} · {selectedWord.rootMeaning}</dd></div>
                <div><dt>构词</dt><dd>{selectedWord.formation}</dd></div>
                <div><dt>词组</dt><dd>{selectedWord.phrase}</dd></div>
                <div>
                  <dt>例句</dt>
                  <dd>
                    <b>{selectedWord.exampleEnglish}</b>
                    {selectedWord.exampleChinese && <small>{selectedWord.exampleChinese}</small>}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <div className="transcript-inspector-title">
                <span>SENTENCE {String(selectedIndex + 1).padStart(2, "0")}</span>
                <h2>整句结构</h2>
                <div>
                  <strong>{structure.sentenceType}</strong>
                  <strong>{structure.tense}</strong>
                </div>
              </div>
              <div className="transcript-selected-sentence">
                <p>{selectedLine?.english}</p>
                <small>{selectedLine?.chinese}</small>
              </div>
              <section className="transcript-structure">
                <span>句子骨架</span>
                <strong>{structure.skeleton}</strong>
                <div>
                  {structure.segments.map((segment, index) => (
                    <p key={`${segment.role}-${index}`}>
                      <small>{segment.role}</small>
                      <b>{segment.text}</b>
                    </p>
                  ))}
                </div>
              </section>
              <section className="transcript-core-words">
                <span>核心单词</span>
                <div>
                  {coreWords.map((word) => (
                    <button key={word.normalized} onClick={() => setSelectedWord(word)}>
                      <strong>{word.word}</strong>
                      <small>{word.meaning}</small>
                    </button>
                  ))}
                </div>
              </section>
              <section className="transcript-phrases">
                <span>词组分析</span>
                {phrases.map((phrase) => <p key={phrase}>{phrase}</p>)}
              </section>
              <section className="transcript-imitation">
                <span>模仿公式</span>
                <strong>{structure.imitation}</strong>
                <p>{structure.memoryTip}</p>
              </section>
            </>
          )}
          <section className="grammar-qa">
            <div className="grammar-qa-heading">
              <span><Sparkles size={12} /> 智能问答</span>
              <small>ASK ABOUT THIS SENTENCE</small>
            </div>
            <div className="grammar-qa-suggestions">
              {suggestedQuestions.map((question) => (
                <button key={question} onClick={() => void askGrammar(question)}>
                  {question}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void askGrammar();
              }}
            >
              <input
                value={qaQuestion}
                onChange={(event) => setQaQuestion(event.target.value)}
                placeholder="例如：为什么这里需要 by？"
                aria-label="向模型询问当前句子"
              />
              <button
                type="submit"
                disabled={!qaQuestion.trim() || qaLoading}
                aria-label="发送语法问题"
                title="发送"
              >
                {qaLoading ? <AudioLines size={14} /> : <Send size={14} />}
              </button>
            </form>
            {qaError && <p className="grammar-qa-error" role="alert">{qaError}</p>}
            {qaAnswer && (
              <div className="grammar-qa-answer" aria-live="polite">
                <header>
                  <span>{qaAnswer.source === "ai" ? "AI 分析" : "本地解析"}</span>
                  {qaAnswer.model && <small>{qaAnswer.model}</small>}
                </header>
                <strong>{qaAnswer.summary}</strong>
                <dl>
                  <div><dt>语法作用</dt><dd>{qaAnswer.grammarRole}</dd></div>
                  <div><dt>为什么</dt><dd>{qaAnswer.explanation}</dd></div>
                  <div><dt>替换对比</dt><dd>{qaAnswer.contrast}</dd></div>
                </dl>
                {qaAnswer.examples.length > 0 && (
                  <div className="grammar-qa-examples">
                    <span>例句</span>
                    {qaAnswer.examples.map((example, index) => (
                      <p key={`${example.english}-${index}`}>
                        <b>{example.english}</b>
                        <small>{example.chinese}</small>
                      </p>
                    ))}
                  </div>
                )}
                {qaAnswer.tip && <p className="grammar-qa-tip">{qaAnswer.tip}</p>}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

const studyModuleOptions: Array<{
  id: StudyModule;
  label: string;
  eyebrow: string;
  icon: typeof BookOpenText;
}> = [
  { id: "words", label: "学习单词", eyebrow: "WORDS", icon: BookOpenText },
  { id: "structures", label: "句子结构", eyebrow: "STRUCTURE", icon: GitBranch },
  { id: "grammar", label: "学习语法", eyebrow: "GRAMMAR", icon: GraduationCap },
  { id: "phrases", label: "学习词组", eyebrow: "PHRASES", icon: Languages },
  { id: "collocations", label: "固定搭配", eyebrow: "COLLOCATIONS", icon: Star }
];

function readStudyMastery(scenarioId: string) {
  try {
    const value = window.localStorage.getItem(
      `english-immersion-study-mastery:${scenarioId}`
    );
    return new Set<string>(
      Array.isArray(JSON.parse(value ?? "[]")) ? JSON.parse(value ?? "[]") : []
    );
  } catch {
    return new Set<string>();
  }
}

function StudyWordLesson({
  item,
  onSpeak
}: {
  item: StudyWord;
  onSpeak: (text: string) => void;
}) {
  return (
    <div className="study-lesson study-word-lesson">
      <div className="study-word-heading">
        <div>
          <span>{item.part}</span>
          <h2>{item.word}</h2>
          <strong>{item.ipa}</strong>
        </div>
        <button onClick={() => onSpeak(item.word)} title="朗读单词" aria-label={`朗读 ${item.word}`}>
          <Volume2 size={18} />
        </button>
      </div>
      <div className="study-primary-meaning">
        <span>核心词义</span>
        <strong>{item.meaning}</strong>
      </div>
      <dl className="study-detail-list">
        <div><dt>词根</dt><dd>{item.root} · {item.rootMeaning}</dd></div>
        <div><dt>构词</dt><dd>{item.formation}</dd></div>
        <div><dt>搭配</dt><dd>{item.phrase}</dd></div>
      </dl>
      <section className="study-example">
        <span>简单例句</span>
        <p>{item.exampleEnglish}</p>
        {item.exampleChinese && <small>{item.exampleChinese}</small>}
      </section>
      <section className="study-context">
        <span>场景原句</span>
        <p>{item.context.english}</p>
        <small>{item.context.chinese}</small>
        <button onClick={() => onSpeak(item.context.english)} title="朗读原句">
          <Volume2 size={14} />朗读原句
        </button>
      </section>
    </div>
  );
}

function StudyStructureLesson({
  item,
  onSpeak
}: {
  item: StudyStructure;
  onSpeak: (text: string) => void;
}) {
  return (
    <div className="study-lesson study-structure-lesson">
      <div className="study-lesson-heading">
        <span>{item.analysis.sentenceType} · {item.analysis.tense}</span>
        <h2>{item.line.english}</h2>
        <p>{item.line.chinese}</p>
        <button onClick={() => onSpeak(item.line.english)} title="朗读句子">
          <Volume2 size={15} />朗读
        </button>
      </div>
      <section className="study-skeleton">
        <span>句子骨架</span>
        <strong>{item.analysis.skeleton}</strong>
      </section>
      <section className="study-segment-map">
        {item.analysis.segments.map((segment, index) => (
          <div key={`${segment.role}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <small>{segment.role}</small>
            <strong>{segment.text}</strong>
          </div>
        ))}
      </section>
      <section className="study-pattern">
        <div><span>句型</span><strong>{item.analysis.pattern}</strong></div>
        <div><span>模仿公式</span><strong>{item.analysis.imitation}</strong></div>
        <p>{item.analysis.memoryTip}</p>
      </section>
    </div>
  );
}

function StudyGrammarLesson({
  item,
  onSpeak
}: {
  item: StudyGrammar;
  onSpeak: (text: string) => void;
}) {
  return (
    <div className="study-lesson study-grammar-lesson">
      <div className="study-lesson-heading">
        <span>GRAMMAR POINT</span>
        <h2>{item.title}</h2>
      </div>
      <section className="study-grammar-formula">
        <span>结构公式</span>
        <strong>{item.formula}</strong>
      </section>
      <section className="study-grammar-explanation">
        <span>为什么这样用</span>
        <p>{item.explanation}</p>
      </section>
      <section className="study-context">
        <span>场景例句</span>
        <p>{item.line.english}</p>
        <small>{item.line.chinese}</small>
        <button onClick={() => onSpeak(item.line.english)} title="朗读例句">
          <Volume2 size={14} />朗读例句
        </button>
      </section>
    </div>
  );
}

function StudyPhraseLesson({
  item,
  fixed,
  onSpeak
}: {
  item: StudyPhrase;
  fixed: boolean;
  onSpeak: (text: string) => void;
}) {
  const [english, meaning = ""] = item.text.split(/\s+·\s+/, 2);
  return (
    <div className="study-lesson study-phrase-lesson">
      <div className="study-lesson-heading">
        <span>{fixed ? "FIXED COLLOCATION" : item.category}</span>
        <h2>{english}</h2>
        {meaning && <p>{meaning}</p>}
        <button onClick={() => onSpeak(english)} title="朗读词组">
          <Volume2 size={15} />朗读
        </button>
      </div>
      <section className="study-phrase-analysis">
        <span>{fixed ? "搭配规律" : "语块作用"}</span>
        <p>{item.explanation}</p>
        <div>
          {english.split(/\s+/).map((token, index) => (
            <span key={`${token}-${index}`}>{token}</span>
          ))}
        </div>
      </section>
      <section className="study-context">
        <span>场景原句</span>
        <p>{item.line.english}</p>
        <small>{item.line.chinese}</small>
        <button onClick={() => onSpeak(item.line.english)} title="朗读原句">
          <Volume2 size={14} />朗读原句
        </button>
      </section>
    </div>
  );
}

function SyntaxHighlightedSentence({ sentence }: { sentence: string }) {
  const structure = useMemo(() => analyzeStructure(sentence), [sentence]);
  const ending = sentence.match(/[.!?]+$/)?.[0] ?? "";

  return (
    <div className="study-syntax-sentence" aria-label={sentence}>
      {structure.segments.map((segment, index) => (
        <span
          className={`syntax-role syntax-role-${getSyntaxColorRole(segment.role)}`}
          key={`${segment.role}-${segment.text}-${index}`}
        >
          <small>{getSyntaxRoleLabel(segment.role)}</small>
          <strong>
            {segment.text}
            {index === structure.segments.length - 1 ? ending : ""}
          </strong>
        </span>
      ))}
    </div>
  );
}

function StudyCenter({
  curriculum,
  scenarioId,
  scenarioTitle,
  level,
  onClose,
  onSpeak,
  onNarrate,
  onPrepareNarration,
  onStopNarration
}: {
  curriculum: StudyCurriculum;
  scenarioId: string;
  scenarioTitle: string;
  level: Difficulty;
  onClose: () => void;
  onSpeak: (text: string) => void;
  onNarrate: (
    text: string,
    level: Difficulty,
    cue: TeachingCue
  ) => Promise<boolean>;
  onPrepareNarration: (
    steps: Array<{ text: string; cue: TeachingCue }>,
    level: Difficulty
  ) => void;
  onStopNarration: () => void;
}) {
  const [activeModule, setActiveModule] = useState<StudyModule>("words");
  const [indices, setIndices] = useState<Record<StudyModule, number>>({
    words: 0,
    structures: 0,
    grammar: 0,
    phrases: 0,
    collocations: 0
  });
  const [mastered, setMastered] = useState<Set<string>>(() =>
    readStudyMastery(scenarioId)
  );
  const [explanation, setExplanation] = useState<StudyExplanation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState("");
  const [activeExplanationStep, setActiveExplanationStep] = useState(0);
  const [explanationPlaying, setExplanationPlaying] = useState(false);
  const [autoLoopEnabled, setAutoLoopEnabled] = useState(false);
  const [autoLoopOrdinal, setAutoLoopOrdinal] = useState(0);
  const [autoLoopRound, setAutoLoopRound] = useState(1);
  const [showSyntaxColors, setShowSyntaxColors] = useState(
    () => window.localStorage.getItem(syntaxColorsStorageKey) === "true"
  );
  const [showCheckAnswer, setShowCheckAnswer] = useState(false);
  const explanationRequestRef = useRef(0);
  const explanationBusyRef = useRef(false);
  const narrationRunRef = useRef(0);
  const narrationTimerRef = useRef<number | null>(null);
  const autoLoopRunRef = useRef(0);
  const autoLoopTimerRef = useRef<number | null>(null);
  const previousExplanationLevelRef = useRef(level);
  const explanationCacheRef = useRef(new Map<string, StudyExplanation>());
  const explanationPendingRef = useRef(
    new Map<string, Promise<StudyExplanation>>()
  );

  const counts: Record<StudyModule, number> = {
    words: curriculum.words.length,
    structures: curriculum.structures.length,
    grammar: curriculum.grammar.length,
    phrases: curriculum.phrases.length,
    collocations: curriculum.collocations.length
  };
  const activeIndex = Math.min(indices[activeModule], Math.max(0, counts[activeModule] - 1));

  const itemMeta = (module: StudyModule, index: number) => {
    if (module === "words") {
      const item = curriculum.words[index];
      return item && { id: item.id, title: item.word, subtitle: `${item.part} · ${item.meaning}` };
    }
    if (module === "structures") {
      const item = curriculum.structures[index];
      return item && { id: item.id, title: item.line.english, subtitle: item.analysis.skeleton };
    }
    if (module === "grammar") {
      const item = curriculum.grammar[index];
      return item && { id: item.id, title: item.title, subtitle: item.formula };
    }
    if (module === "phrases") {
      const item = curriculum.phrases[index];
      return item && { id: item.id, title: item.text, subtitle: item.category };
    }
    const item = curriculum.collocations[index];
    return item && { id: item.id, title: item.text, subtitle: "固定搭配" };
  };

  const items = Array.from({ length: counts[activeModule] }, (_, index) =>
    itemMeta(activeModule, index)
  ).filter(Boolean) as Array<{ id: string; title: string; subtitle: string }>;
  const activeItem = itemMeta(activeModule, activeIndex);
  const autoLoopSequence = buildStudyLoopSequence(counts);
  const allIds = studyModuleOptions.flatMap((module) =>
    Array.from({ length: counts[module.id] }, (_, index) =>
      itemMeta(module.id, index)?.id
    ).filter(Boolean) as string[]
  );
  const masteredCount = allIds.filter((id) => mastered.has(id)).length;
  const completion = Math.round((masteredCount / Math.max(1, allIds.length)) * 100);

  useEffect(() => {
    window.localStorage.setItem(
      `english-immersion-study-mastery:${scenarioId}`,
      JSON.stringify([...mastered])
    );
  }, [mastered, scenarioId]);

  useEffect(() => {
    window.localStorage.setItem(
      syntaxColorsStorageKey,
      String(showSyntaxColors)
    );
  }, [showSyntaxColors]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelector(".study-item-index > div > button.active")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [activeIndex, activeModule]);

  useEffect(
    () => () => {
      explanationRequestRef.current += 1;
      narrationRunRef.current += 1;
      if (narrationTimerRef.current !== null) {
        window.clearTimeout(narrationTimerRef.current);
      }
      autoLoopRunRef.current += 1;
      if (autoLoopTimerRef.current !== null) {
        window.clearTimeout(autoLoopTimerRef.current);
      }
      onStopNarration();
    },
    []
  );

  const cancelAutoLoop = () => {
    autoLoopRunRef.current += 1;
    if (autoLoopTimerRef.current !== null) {
      window.clearTimeout(autoLoopTimerRef.current);
      autoLoopTimerRef.current = null;
    }
    setAutoLoopEnabled(false);
    setAutoLoopOrdinal(0);
    setAutoLoopRound(1);
  };

  const resetExplanation = (keepAutoLoop = false) => {
    if (!keepAutoLoop) cancelAutoLoop();
    explanationRequestRef.current += 1;
    narrationRunRef.current += 1;
    if (narrationTimerRef.current !== null) {
      window.clearTimeout(narrationTimerRef.current);
      narrationTimerRef.current = null;
    }
    explanationBusyRef.current = false;
    setExplanation(null);
    setExplanationLoading(false);
    setExplanationError("");
    setActiveExplanationStep(0);
    setExplanationPlaying(false);
    setShowCheckAnswer(false);
    onStopNarration();
  };

  useEffect(() => {
    if (previousExplanationLevelRef.current === level) return;
    previousExplanationLevelRef.current = level;
    resetExplanation();
  }, [level]);

  const setModule = (module: StudyModule) => {
    if (module === activeModule) return;
    resetExplanation();
    setActiveModule(module);
  };

  const move = (offset: -1 | 1) => {
    resetExplanation();
    setIndices((current) => ({
      ...current,
      [activeModule]: Math.max(
        0,
        Math.min(counts[activeModule] - 1, activeIndex + offset)
      )
    }));
  };

  const selectItem = (index: number) => {
    if (index === activeIndex) return;
    resetExplanation();
    setIndices((current) => ({ ...current, [activeModule]: index }));
  };

  const explanationPayload = (
    module: StudyModule = activeModule,
    index: number = activeIndex
  ) => {
    if (module === "words") {
      const item = curriculum.words[index];
      return item && {
        type: "word",
        title: item.word,
        meaning: `${item.part}；${item.meaning}`,
        focus: `${item.ipa}；${item.phrase}`,
        context: item.context.english,
        translation: item.context.chinese
      };
    }
    if (module === "structures") {
      const item = curriculum.structures[index];
      return item && {
        type: "sentence structure",
        title: item.line.english,
        meaning: item.analysis.note,
        focus: `${item.analysis.pattern}；${item.analysis.skeleton}`,
        context: item.line.english,
        translation: item.line.chinese
      };
    }
    if (module === "grammar") {
      const item = curriculum.grammar[index];
      return item && {
        type: "grammar",
        title: item.title,
        meaning: item.explanation,
        focus: item.formula,
        context: item.line.english,
        translation: item.line.chinese
      };
    }
    if (module === "phrases") {
      const item = curriculum.phrases[index];
      return item && {
        type: "phrase",
        title: item.text,
        meaning: item.explanation,
        focus: item.category,
        context: item.line.english,
        translation: item.line.chinese
      };
    }
    const item = curriculum.collocations[index];
    return item && {
      type: "fixed collocation",
      title: item.text,
      meaning: item.explanation,
      focus: "Explain the fixed word partnership and how to reuse it.",
      context: item.line.english,
      translation: item.line.chinese
    };
  };

  const stopExplanationPlayback = () => {
    narrationRunRef.current += 1;
    if (narrationTimerRef.current !== null) {
      window.clearTimeout(narrationTimerRef.current);
      narrationTimerRef.current = null;
    }
    setExplanationPlaying(false);
    onStopNarration();
  };

  const loadStudyExplanation = (
    module: StudyModule,
    index: number
  ): Promise<StudyExplanation> => {
    const item = itemMeta(module, index);
    const payload = explanationPayload(module, index);
    if (!item || !payload || !window.desktopWindow?.explainStudy) {
      return Promise.reject(new Error("Study explainer is unavailable."));
    }

    const cacheKey = `${module}:${item.id}:${level}`;
    const cached = explanationCacheRef.current.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    const pending = explanationPendingRef.current.get(cacheKey);
    if (pending) return pending;

    const request = window.desktopWindow
      .explainStudy({ ...payload, level })
      .then((result) => {
        explanationCacheRef.current.set(cacheKey, result);
        explanationPendingRef.current.delete(cacheKey);
        return result;
      })
      .catch((error) => {
        explanationPendingRef.current.delete(cacheKey);
        throw error;
      });
    explanationPendingRef.current.set(cacheKey, request);
    return request;
  };

  const prepareExplanationAudio = (result: StudyExplanation) => {
    onPrepareNarration(
      result.scriptSentences.map((text, index) => ({
        text,
        cue: teachingStepMeta[index]?.cue ?? "meaning"
      })),
      level
    );
  };

  const playExplanation = async (
    result: StudyExplanation,
    startIndex: number,
    playRemaining = true
  ): Promise<boolean> => {
    stopExplanationPlayback();
    const runId = ++narrationRunRef.current;
    const lastIndex = playRemaining
      ? result.scriptSentences.length - 1
      : startIndex;
    onPrepareNarration(
      result.scriptSentences.slice(startIndex, lastIndex + 1).map((text, offset) => ({
        text,
        cue: teachingStepMeta[startIndex + offset]?.cue ?? "meaning"
      })),
      level
    );
    setExplanationPlaying(true);

    for (let index = startIndex; index <= lastIndex; index += 1) {
      if (runId !== narrationRunRef.current) return false;
      setActiveExplanationStep(index);
      const completed = await onNarrate(
        result.scriptSentences[index],
        level,
        teachingStepMeta[index]?.cue ?? "meaning"
      );
      if (!completed || runId !== narrationRunRef.current) {
        if (runId === narrationRunRef.current) {
          setExplanationPlaying(false);
        }
        return false;
      }
      if (index < lastIndex) {
        await new Promise<void>((resolve) => {
          narrationTimerRef.current = window.setTimeout(resolve, 480);
        });
      }
    }

    if (runId === narrationRunRef.current) {
      narrationTimerRef.current = null;
      setExplanationPlaying(false);
      return true;
    }
    return false;
  };

  const explainAndNarrate = async () => {
    const payload = explanationPayload();
    if (!payload || explanationBusyRef.current) return;
    cancelAutoLoop();
    stopExplanationPlayback();
    const requestId = ++explanationRequestRef.current;
    explanationBusyRef.current = true;
    setExplanationLoading(true);
    setExplanationError("");
    setShowCheckAnswer(false);
    try {
      const result = await loadStudyExplanation(activeModule, activeIndex);
      if (requestId !== explanationRequestRef.current) return;
      setExplanation(result);
      setActiveExplanationStep(0);
      void playExplanation(result, 0);
    } catch {
      if (requestId === explanationRequestRef.current) {
        setExplanationError("分级讲解暂时不可用，请稍后重试。");
      }
    } finally {
      if (requestId === explanationRequestRef.current) {
        explanationBusyRef.current = false;
        setExplanationLoading(false);
      }
    }
  };

  const runAutoLoop = async (runId: number, startOrdinal: number) => {
    let ordinal = startOrdinal;
    let round = 1;
    while (
      runId === autoLoopRunRef.current &&
      autoLoopSequence.length > 0
    ) {
      const position = autoLoopSequence[ordinal];
      const item = itemMeta(position.module, position.index);
      const payload = explanationPayload(position.module, position.index);
      if (!item || !payload) {
        ordinal = nextStudyLoopOrdinal(autoLoopSequence.length, ordinal);
        continue;
      }

      explanationRequestRef.current += 1;
      const requestId = explanationRequestRef.current;
      explanationBusyRef.current = true;
      stopExplanationPlayback();
      setActiveModule(position.module);
      setIndices((current) => ({
        ...current,
        [position.module]: position.index
      }));
      setExplanation(null);
      setExplanationLoading(true);
      setExplanationError("");
      setShowCheckAnswer(false);
      setActiveExplanationStep(0);
      setAutoLoopOrdinal(ordinal + 1);

      try {
        const result = await loadStudyExplanation(
          position.module,
          position.index
        );
        if (
          runId !== autoLoopRunRef.current ||
          requestId !== explanationRequestRef.current
        ) {
          return;
        }
        setExplanation(result);
        setExplanationLoading(false);
        explanationBusyRef.current = false;

        const nextOrdinal = nextStudyLoopOrdinal(
          autoLoopSequence.length,
          ordinal
        );
        const nextPosition = autoLoopSequence[nextOrdinal];
        if (nextPosition) {
          void loadStudyExplanation(
            nextPosition.module,
            nextPosition.index
          )
            .then((nextResult) => {
              if (runId === autoLoopRunRef.current) {
                prepareExplanationAudio(nextResult);
              }
            })
            .catch(() => undefined);
        }

        await playExplanation(result, 0);
      } catch {
        if (runId !== autoLoopRunRef.current) return;
        setExplanationError("当前项目讲解失败，正在继续下一项。");
      } finally {
        if (runId === autoLoopRunRef.current) {
          explanationBusyRef.current = false;
          setExplanationLoading(false);
        }
      }

      if (runId !== autoLoopRunRef.current) return;
      const nextOrdinal = nextStudyLoopOrdinal(
        autoLoopSequence.length,
        ordinal
      );
      if (nextOrdinal === 0) {
        round += 1;
        setAutoLoopRound(round);
      }
      ordinal = nextOrdinal;
      await new Promise<void>((resolve) => {
        autoLoopTimerRef.current = window.setTimeout(resolve, 900);
      });
      autoLoopTimerRef.current = null;
    }
  };

  const startAutoLoop = () => {
    if (!autoLoopSequence.length) return;
    stopExplanationPlayback();
    const runId = ++autoLoopRunRef.current;
    setAutoLoopEnabled(true);
    setAutoLoopRound(1);
    setAutoLoopOrdinal(1);
    void runAutoLoop(runId, 0);
  };

  const stopAutoLoop = () => {
    cancelAutoLoop();
    explanationRequestRef.current += 1;
    explanationBusyRef.current = false;
    setExplanationLoading(false);
    stopExplanationPlayback();
  };

  const toggleMastered = () => {
    if (!activeItem) return;
    setMastered((current) => {
      const next = new Set(current);
      if (next.has(activeItem.id)) next.delete(activeItem.id);
      else next.add(activeItem.id);
      return next;
    });
  };

  return (
    <section className="study-center" aria-label="英语学习中心">
      <header className="study-center-header">
        <div>
          <span><GraduationCap size={15} /> SCENE STUDY CENTER</span>
          <h1>{scenarioTitle}</h1>
        </div>
        <div className="study-center-summary">
          <strong>{completion}%</strong>
          <span>{masteredCount} / {allIds.length} 已掌握</span>
        </div>
        <button
          onClick={() => {
            onStopNarration();
            onClose();
          }}
          aria-label="关闭学习中心"
          title="关闭"
        >
          <X size={18} />
        </button>
      </header>

      <nav className="study-module-tabs" aria-label="学习模块">
        {studyModuleOptions.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              className={activeModule === module.id ? "active" : ""}
              onClick={() => setModule(module.id)}
              aria-current={activeModule === module.id ? "page" : undefined}
            >
              <Icon size={15} />
              <span><small>{module.eyebrow}</small><strong>{module.label}</strong></span>
              <em>{counts[module.id]}</em>
            </button>
          );
        })}
      </nav>

      <div className="study-center-body">
        <aside className="study-item-index">
          <header>
            <span>{studyModuleOptions.find((item) => item.id === activeModule)?.label}</span>
            <strong>{String(activeIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</strong>
          </header>
          <div>
            {items.map((item, index) => (
              <button
                key={item.id}
                className={index === activeIndex ? "active" : ""}
                onClick={() => selectItem(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                {mastered.has(item.id) && <Check size={12} />}
              </button>
            ))}
          </div>
        </aside>

        <main className="study-lesson-stage">
          {activeItem && (
            <section className={`study-auto-explainer ${explanation ? "expanded" : ""}`}>
              <header>
                <div>
                  <span><AudioLines size={13} /> {level} HANDS-FREE LESSON</span>
                  <strong>{explanationLevelNames[level]}讲解</strong>
                  <small>
                    全部单词 → 句子结构 → 语法 → 词组 → 固定搭配
                  </small>
                </div>
                <div className="study-explainer-actions">
                  <button
                    type="button"
                    className={autoLoopEnabled ? "active" : ""}
                    onClick={autoLoopEnabled ? stopAutoLoop : startAutoLoop}
                    title={autoLoopEnabled ? "停止全部连续讲解" : "从第一个单词开始持续讲解全部内容"}
                  >
                    {autoLoopEnabled ? <Pause size={15} /> : <Repeat2 size={15} />}
                    {autoLoopEnabled ? "停止连播" : "全部连播"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void explainAndNarrate()}
                    disabled={explanationLoading || autoLoopEnabled}
                  >
                    {explanationLoading ? <AudioLines size={15} /> : <Play size={15} />}
                    {explanationLoading
                      ? "正在生成"
                      : explanation
                        ? "重新讲解"
                        : "自动讲解"}
                  </button>
                </div>
              </header>
              {explanationError && (
                <p className="study-explanation-error" role="alert">
                  {explanationError}
                </p>
              )}
              {explanation && (
                <div className="study-explanation-content" aria-live="polite">
                  <div className="study-explanation-source">
                    <span>
                      {autoLoopEnabled
                        ? `第 ${autoLoopRound} 轮 · ${autoLoopOrdinal} / ${autoLoopSequence.length}`
                        : explanation.source === "ai"
                          ? "AI 分级讲解"
                          : "本地分级讲解"}
                    </span>
                    <div>
                      <small>{explanation.level} · {explanation.model || "OFFLINE"}</small>
                      <button
                        type="button"
                        className={showSyntaxColors ? "active" : ""}
                        onClick={() => setShowSyntaxColors((value) => !value)}
                        aria-pressed={showSyntaxColors}
                        title="开启或关闭句子成分配色"
                      >
                        <GitBranch size={13} />
                        <span>句子成分</span>
                        <i><b /></i>
                      </button>
                    </div>
                  </div>
                  <div className="study-explanation-steps" aria-label="讲解步骤">
                    {teachingStepMeta.map((step, index) => (
                      <button
                        type="button"
                        key={step.cue}
                        className={index === activeExplanationStep ? "active" : ""}
                        onClick={() => {
                          if (autoLoopEnabled) stopAutoLoop();
                          else stopExplanationPlayback();
                          setActiveExplanationStep(index);
                        }}
                        aria-current={index === activeExplanationStep ? "step" : undefined}
                      >
                        <span>{index + 1}</span>
                        <strong>{step.label}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="study-explanation-focus">
                    <span>
                      {teachingStepMeta[activeExplanationStep]?.prompt}
                    </span>
                    {showSyntaxColors ? (
                      <SyntaxHighlightedSentence
                        sentence={explanation.scriptSentences[activeExplanationStep]}
                      />
                    ) : (
                      <p>{explanation.scriptSentences[activeExplanationStep]}</p>
                    )}
                  </div>
                  <div className="study-explanation-controls">
                    <button
                      type="button"
                      disabled={activeExplanationStep === 0}
                      onClick={() => {
                        if (autoLoopEnabled) stopAutoLoop();
                        else stopExplanationPlayback();
                        setActiveExplanationStep((index) => Math.max(0, index - 1));
                      }}
                      title="上一步"
                      aria-label="上一步"
                    >
                      <SkipBack size={16} />
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        if (autoLoopEnabled) {
                          stopAutoLoop();
                        } else if (explanationPlaying) {
                          stopExplanationPlayback();
                        } else {
                          void playExplanation(explanation, activeExplanationStep);
                        }
                      }}
                      title={
                        autoLoopEnabled
                          ? "停止全部连播"
                          : explanationPlaying
                            ? "停止讲解"
                            : "从当前步骤播放"
                      }
                    >
                      {explanationPlaying || autoLoopEnabled
                        ? <Pause size={17} />
                        : <Play size={17} />}
                      {autoLoopEnabled
                        ? "停止连播"
                        : explanationPlaying
                          ? "停止"
                          : "播放讲解"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        activeExplanationStep ===
                        explanation.scriptSentences.length - 1
                      }
                      onClick={() => {
                        if (autoLoopEnabled) stopAutoLoop();
                        else stopExplanationPlayback();
                        setActiveExplanationStep((index) =>
                          Math.min(explanation.scriptSentences.length - 1, index + 1)
                        );
                      }}
                      title="下一步"
                      aria-label="下一步"
                    >
                      <SkipForward size={16} />
                    </button>
                  </div>
                  <details className="study-explanation-notes">
                    <summary>查看中文要点与自测</summary>
                    <p className="study-explanation-chinese">
                      {explanation.chineseSummary}
                    </p>
                    {explanation.keyPoints.length > 0 && (
                      <div className="study-explanation-points">
                        {explanation.keyPoints.map((point, index) => (
                          <span key={`${point.english}-${index}`}>
                            <strong>{point.english}</strong>
                            <small>{point.chinese}</small>
                          </span>
                        ))}
                      </div>
                    )}
                    {explanation.checkQuestion && (
                      <div className="study-explanation-check">
                        <span>快速自测</span>
                        <p>{explanation.checkQuestion}</p>
                        <button
                          type="button"
                          onClick={() => setShowCheckAnswer((value) => !value)}
                        >
                          {showCheckAnswer ? "隐藏答案" : "查看答案"}
                        </button>
                        {showCheckAnswer && <strong>{explanation.checkAnswer}</strong>}
                      </div>
                    )}
                  </details>
                </div>
              )}
            </section>
          )}
          {activeModule === "words" && curriculum.words[activeIndex] && (
            <StudyWordLesson item={curriculum.words[activeIndex]} onSpeak={onSpeak} />
          )}
          {activeModule === "structures" && curriculum.structures[activeIndex] && (
            <StudyStructureLesson item={curriculum.structures[activeIndex]} onSpeak={onSpeak} />
          )}
          {activeModule === "grammar" && curriculum.grammar[activeIndex] && (
            <StudyGrammarLesson item={curriculum.grammar[activeIndex]} onSpeak={onSpeak} />
          )}
          {activeModule === "phrases" && curriculum.phrases[activeIndex] && (
            <StudyPhraseLesson item={curriculum.phrases[activeIndex]} fixed={false} onSpeak={onSpeak} />
          )}
          {activeModule === "collocations" && curriculum.collocations[activeIndex] && (
            <StudyPhraseLesson item={curriculum.collocations[activeIndex]} fixed onSpeak={onSpeak} />
          )}
          {!activeItem && (
            <div className="study-empty">
              <BookOpenText size={22} />
              <strong>当前场景暂无该类学习内容</strong>
            </div>
          )}
          {activeItem && (
            <footer className="study-lesson-controls">
              <button onClick={() => move(-1)} disabled={activeIndex === 0} title="上一项">
                <SkipBack size={14} /><span>上一项</span>
              </button>
              <button
                className={mastered.has(activeItem.id) ? "mastered" : ""}
                onClick={toggleMastered}
              >
                <Check size={14} />
                {mastered.has(activeItem.id) ? "已掌握" : "标记掌握"}
              </button>
              <button
                onClick={() => move(1)}
                disabled={activeIndex === counts[activeModule] - 1}
                title="下一项"
              >
                <span>下一项</span><SkipForward size={14} />
              </button>
            </footer>
          )}
        </main>

        <aside className="study-progress">
          <span>SCENE PROGRESS</span>
          <strong>{completion}<small>%</small></strong>
          <div className="study-progress-track"><i style={{ width: `${completion}%` }} /></div>
          <p>{scenarioTitle} 的五类内容均来自本场景完整对话。</p>
          <div>
            {studyModuleOptions.map((module) => {
              const ids = Array.from({ length: counts[module.id] }, (_, index) =>
                itemMeta(module.id, index)?.id
              ).filter(Boolean) as string[];
              const completed = ids.filter((id) => mastered.has(id)).length;
              return (
                <section key={module.id}>
                  <span>{module.label}</span>
                  <strong>{completed} / {ids.length}</strong>
                  <i><b style={{ width: `${Math.round((completed / Math.max(1, ids.length)) * 100)}%` }} /></i>
                </section>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

function UtilityDrawer({
  mode,
  suggestions,
  currentLine,
  profile,
  recommendations,
  onClose,
  onUsePhrase
}: {
  mode: "phrases" | "history";
  suggestions: LocalizedLine[];
  currentLine: LocalizedLine;
  profile: LearningProfile;
  recommendations: AdaptiveRecommendation[];
  onClose: () => void;
  onUsePhrase: (phrase: string) => void;
}) {
  const phraseGroups = [
    ...new Set(
      analyzeWords(currentLine.english)
        .map((word) => word.phrase)
        .filter(Boolean)
    )
  ];
  const metrics = [
    ["Fluency", profile.fluency],
    ["Accuracy", profile.accuracy],
    ["Expression", profile.expression],
    ["Vocabulary", profile.vocabulary]
  ] as const;

  return (
    <aside className="utility-drawer" aria-label={mode === "phrases" ? "Phrase library" : "Session history"}>
      <header>
        <span>{mode === "phrases" ? <BookOpenText size={16} /> : <History size={16} />}</span>
        <div>
          <small>{mode === "phrases" ? "SCENE LANGUAGE" : "LEARNING PROFILE"}</small>
          <h2>{mode === "phrases" ? "Phrase library" : "Session intelligence"}</h2>
        </div>
        <button onClick={onClose} aria-label="Close panel" title="Close">
          <X size={16} />
        </button>
      </header>

      {mode === "phrases" ? (
        <div className="utility-content">
          <section>
            <span className="utility-label">READY TO USE</span>
            {suggestions.map((suggestion) => (
              <button
                className="library-phrase"
                key={suggestion.english}
                onClick={() => onUsePhrase(suggestion.english)}
              >
                <strong>{suggestion.english}</strong>
                <small>{suggestion.chinese}</small>
              </button>
            ))}
          </section>
          <section>
            <span className="utility-label">FROM THE CURRENT LINE</span>
            {phraseGroups.length ? (
              <div className="utility-phrase-tags">
                {phraseGroups.map((phrase) => <span key={phrase}>{phrase}</span>)}
              </div>
            ) : (
              <p className="utility-empty">当前句子没有需要单独记忆的固定搭配。</p>
            )}
          </section>
        </div>
      ) : (
        <div className="utility-content">
          <div className="profile-metrics">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <span><small>{label}</small><strong>{value}</strong></span>
                <span className="profile-meter"><i style={{ width: `${value}%` }} /></span>
              </div>
            ))}
          </div>
          <p className="profile-summary">
            {profile.turns
              ? `已分析 ${profile.turns} 轮回答，平均 ${profile.averageWords} 个单词，使用 ${profile.connectorUses} 次连接词。`
              : "完成第一轮回答后，推荐场景会根据真实表现自动重排。"}
          </p>
          <section>
            <span className="utility-label">NEXT BEST SCENES</span>
            {recommendations.map((recommendation) => (
              <div className="history-recommendation" key={recommendation.id}>
                <span>{recommendation.focusLabel}</span>
                <strong>{recommendation.scenario.title}</strong>
                <small>{recommendation.reason}</small>
              </div>
            ))}
          </section>
        </div>
      )}
    </aside>
  );
}

function ControlPanel({
  tab,
  onTab,
  onClose,
  avatarAsset,
  avatarStatus,
  avatarError,
  persona,
  outfit,
  voiceIndex,
  speed,
  autoSpeak,
  voiceStatus,
  renderMode,
  portraitFrame,
  portraitSet,
  lipSyncMode,
  lipSyncHealth,
  currentLine,
  subtitleMode,
  learningFontSize,
  showStructure,
  showPhonetics,
  onPersona,
  onOutfit,
  onVoice,
  onSpeed,
  onAutoSpeak,
  onLipSyncMode,
  onPreview,
  onSubtitleMode,
  onLearningFontSize,
  onShowStructure,
  onShowPhonetics,
  onAvatar,
  onAvatarModel,
  onAvatarReset,
  onPortraitSet,
  onPortraitFrame
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  avatarAsset: AvatarAsset;
  avatarStatus: AvatarGenerationStatus;
  avatarError: string;
  persona: Persona;
  outfit: Outfit;
  voiceIndex: number;
  speed: number;
  autoSpeak: boolean;
  voiceStatus: VoiceStatus;
  renderMode: RenderMode;
  portraitFrame: PortraitFrame;
  portraitSet: PortraitSet;
  lipSyncMode: LipSyncMode;
  lipSyncHealth: LipSyncHealth;
  currentLine: LocalizedLine;
  subtitleMode: SubtitleMode;
  learningFontSize: LearningFontSize;
  showStructure: boolean;
  showPhonetics: boolean;
  onPersona: (persona: Persona) => void;
  onOutfit: (outfit: Outfit) => void;
  onVoice: (index: number) => void;
  onSpeed: (speed: number) => void;
  onAutoSpeak: () => void;
  onLipSyncMode: (mode: LipSyncMode) => void;
  onPreview: () => void;
  onSubtitleMode: (mode: SubtitleMode) => void;
  onLearningFontSize: (size: LearningFontSize) => void;
  onShowStructure: () => void;
  onShowPhonetics: () => void;
  onAvatar: (asset: AvatarAsset) => void;
  onAvatarModel: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarReset: () => void;
  onPortraitSet: (set: PortraitSet) => void;
  onPortraitFrame: (frame: PortraitFrame) => void;
}) {
  return (
    <aside className="control-panel settings-control-panel">
      <div className="settings-drawer-header">
        <div>
          <span>STUDIO SETTINGS</span>
          <strong>Character and learning setup</strong>
        </div>
        <button onClick={onClose} aria-label="Close settings" title="Close settings">
          <X size={16} />
        </button>
      </div>
      <div className={`panel-tabs ${renderMode === "2d" ? "compact" : ""}`} role="tablist" aria-label="Character controls">
        <button className={tab === "avatar" ? "active" : ""} onClick={() => onTab("avatar")} title="Avatar studio">
          <ScanFace size={17} /><span>Avatar</span>
        </button>
        <button className={tab === "persona" ? "active" : ""} onClick={() => onTab("persona")} title="Persona">
          <CircleUserRound size={17} /><span>Persona</span>
        </button>
        {renderMode === "3d" && (
          <button className={tab === "wardrobe" ? "active" : ""} onClick={() => onTab("wardrobe")} title="Wardrobe">
            <Shirt size={17} /><span>Outfit</span>
          </button>
        )}
        <button className={tab === "voice" ? "active" : ""} onClick={() => onTab("voice")} title="Voice">
          <AudioLines size={17} /><span>Voice</span>
        </button>
        <button className={tab === "language" ? "active" : ""} onClick={() => onTab("language")} title="Language analysis">
          <GraduationCap size={17} /><span>Study</span>
        </button>
      </div>
      {tab === "avatar" && (
        <AvatarPanel
          asset={avatarAsset}
          status={avatarStatus}
          error={avatarError}
          renderMode={renderMode}
          portraitFrame={portraitFrame}
          onPortraitFrame={onPortraitFrame}
          portraitSet={portraitSet}
          onPortraitSet={onPortraitSet}
          onAvatar={onAvatar}
          onModel={onAvatarModel}
          onReset={onAvatarReset}
        />
      )}
      {tab === "persona" && (
        <PersonaPanel
          selected={persona}
          renderMode={renderMode}
          portraitSet={portraitSet}
          onSelect={onPersona}
        />
      )}
      {renderMode === "3d" && tab === "wardrobe" && (
        <WardrobePanel selected={outfit} onSelect={onOutfit} />
      )}
      {tab === "voice" && (
        <VoicePanel
          selected={voiceIndex}
          speed={speed}
          autoSpeak={autoSpeak}
          status={voiceStatus}
          renderMode={renderMode}
          lipSyncMode={lipSyncMode}
          lipSyncHealth={lipSyncHealth}
          onSelect={onVoice}
          onSpeed={onSpeed}
          onAutoSpeak={onAutoSpeak}
          onLipSyncMode={onLipSyncMode}
          onPreview={onPreview}
        />
      )}
      {tab === "language" && (
        <LanguagePanel
          line={currentLine}
          subtitleMode={subtitleMode}
          learningFontSize={learningFontSize}
          showStructure={showStructure}
          showPhonetics={showPhonetics}
          onSubtitleMode={onSubtitleMode}
          onLearningFontSize={onLearningFontSize}
          onShowStructure={onShowStructure}
          onShowPhonetics={onShowPhonetics}
        />
      )}
      <div className="panel-session-card">
        <div><Flame size={16} /><span>7 day streak</span><strong>2,480 XP</strong></div>
        <div className="xp-track"><span /></div>
        <small>520 XP until level 12</small>
      </div>
    </aside>
  );
}

export default function App() {
  const [scenario, setScenario] = useState(scenarios[0]);
  const [sessionMode, setSessionMode] = useState<SessionMode>("roleplay");
  const [difficulty, setDifficulty] = useState<Difficulty>("B2");
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("en-zh");
  const [learningFontSize, setLearningFontSize] =
    useState<LearningFontSize>(readStoredLearningFontSize);
  const [showStructure, setShowStructure] = useState(true);
  const [showPhonetics, setShowPhonetics] = useState(true);
  const [renderMode, setRenderMode] = useState<RenderMode>("2d");
  const [portraitSet, setPortraitSet] = useState<PortraitSet>("original");
  const [portraitFrame, setPortraitFrame] = useState<PortraitFrame>("half");
  const [viewMode, setViewMode] = useState<ViewMode>("first");
  const [avatarAsset, setAvatarAsset] =
    useState<AvatarAsset>(portraitStudioAvatar);
  const [avatarStatus, setAvatarStatus] = useState<AvatarGenerationStatus>("generating");
  const [avatarError, setAvatarError] = useState("");
  const [learningProfile, setLearningProfile] =
    useState<LearningProfile>(readStoredLearningProfile);
  const [sessionDuration, setSessionDuration] =
    useState<PracticeDuration>(readStoredSessionDuration);
  const [listeningRoundIndex, setListeningRoundIndex] = useState(0);
  const [listeningLineIndex, setListeningLineIndex] = useState(0);
  const [listeningPlaying, setListeningPlaying] = useState(false);
  const [listeningComplete, setListeningComplete] = useState(false);
  const [activeRecommendationId, setActiveRecommendationId] = useState<string | null>(null);
  const [utilityView, setUtilityView] = useState<"phrases" | "history" | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [studyCenterOpen, setStudyCenterOpen] = useState(false);
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [persona, setPersona] = useState(portraitPersonas[0]);
  const [outfit, setOutfit] = useState(outfits[0]);
  const [panelTab, setPanelTab] = useState<PanelTab>("avatar");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [learningMode, setLearningMode] =
    useState<LearningMode>("dialogue");
  const [selectedWord, setSelectedWord] =
    useState<LearningWordSelection | null>(null);
  const [focusedStudyLine, setFocusedStudyLine] =
    useState<LocalizedLine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, speaker: "persona", line: createOpening(scenarios[0], "B2") }
  ]);
  const [dialogueSuggestions, setDialogueSuggestions] = useState<LocalizedLine[]>(
    () => createSuggestions(scenarios[0], "B2")
  );
  const [dialogueCoachCue, setDialogueCoachCue] =
    useState(difficultyProfiles.find((profile) => profile.id === "B2")!.target);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recognitionError, setRecognitionError] = useState("");
  const [recognitionPhase, setRecognitionPhase] =
    useState<RecognitionPhase>("loading");
  const [speaking, setSpeaking] = useState(false);
  const [subtitlePlayback, setSubtitlePlayback] =
    useState<SubtitlePlayback>({
      timeline: [],
      activeIndex: -1,
      sourceText: ""
    });
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [speed, setSpeed] = useState(0.9);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [lipSyncMode, setLipSyncMode] = useState<LipSyncMode>("neural");
  const [lipSyncHealth, setLipSyncHealth] =
    useState<LipSyncHealth>("checking");
  const [reaction, setReaction] = useState<PerformanceState>("inviting");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState({ fluency: 82, accuracy: 88, expression: 76 });
  const recognitionRef = useRef<LocalSpeechSession | null>(null);
  const recordingRequestedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const studyAudioRef = useRef<HTMLAudioElement | null>(null);
  const studyAudioFinishRef = useRef<((completed: boolean) => void) | null>(null);
  const studySpeechCacheRef = useRef(
    new Map<
      string,
      Promise<
        Awaited<
          ReturnType<NonNullable<Window["desktopWindow"]>["synthesizeSpeech"]>
        >
      >
    >()
  );
  const subtitleFrameRef = useRef<number | null>(null);
  const speechRequestRef = useRef(0);
  const dialogueRequestRef = useRef(0);
  const listeningRunRef = useRef(0);
  const listeningAdvanceTimerRef = useRef<number | null>(null);
  const activeUtteranceRef = useRef("");
  const suggestions = dialogueSuggestions;
  const difficultyProfile =
    difficultyProfiles.find((profile) => profile.id === difficulty) ??
    difficultyProfiles[3];
  const activeSubtitle =
    subtitleModes.find((mode) => mode.id === subtitleMode) ?? subtitleModes[2];
  const recommendations = useMemo(
    () => buildRecommendations(learningProfile, difficulty),
    [difficulty, learningProfile]
  );
  const dailyPlan = useMemo(
    () => buildDailyPracticePlan(learningProfile, difficulty, sessionDuration),
    [difficulty, learningProfile, sessionDuration]
  );
  const listeningScript = useMemo(
    () => getListeningDialogue(scenario.id),
    [scenario.id]
  );
  const studyCurriculum = useMemo(
    () => buildStudyCurriculum(listeningScript),
    [listeningScript]
  );
  const listeningLine =
    listeningScript[listeningLineIndex] ?? listeningScript[0];
  const transcriptLines = useMemo<TranscriptLine[]>(
    () =>
      sessionMode === "listening"
        ? listeningScript
        : messages.map((message) => ({
            ...message.line,
            speaker: message.speaker === "persona" ? "host" : "guest"
          })),
    [listeningScript, messages, sessionMode]
  );
  const activeAvatarAsset = useMemo(
    () => {
      const framedAsset =
        portraitFrame === "full"
          ? {
              ...avatarAsset,
              photoUrl: avatarAsset.fullPhotoUrl ?? avatarAsset.photoUrl,
              stageImageUrl:
                avatarAsset.fullStageImageUrl ??
                avatarAsset.stageImageUrl ??
                avatarAsset.photoUrl
            }
          : avatarAsset;
      return framedAsset.source === "bundled" ||
      avatarAsset.source === "synthetic" ||
      avatarAsset.source === "generated"
        ? { ...framedAsset, modelUrl: getBuiltInAvatarUrl(outfit.id) }
        : framedAsset;
    },
    [avatarAsset, outfit.id, portraitFrame]
  );

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const seconds = (elapsed % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsed]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (elapsed >= sessionDuration * 60) setPaused(true);
  }, [elapsed, sessionDuration]);

  useEffect(() => {
    window.localStorage.setItem(
      learningProfileStorageKey,
      JSON.stringify(learningProfile)
    );
  }, [learningProfile]);

  useEffect(() => {
    window.localStorage.setItem(
      sessionDurationStorageKey,
      String(sessionDuration)
    );
  }, [sessionDuration]);

  useEffect(() => {
    window.localStorage.setItem(
      learningFontSizeStorageKey,
      learningFontSize
    );
  }, [learningFontSize]);

  useEffect(() => {
    let active = true;
    void prepareLocalSpeechRecognition()
      .then(() => {
        if (active) setRecognitionPhase("idle");
      })
      .catch(() => {
        if (!active) return;
        setRecognitionPhase("idle");
        setRecognitionError(
          "Offline voice model could not load · hold to retry"
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (renderMode !== "3d") return;
    let active = true;
    const check = async () => {
      const health = await window.desktopWindow?.getLipSyncHealth?.();
      if (!active) return;
      const nextHealth: LipSyncHealth = health?.ready
        ? "ready"
        : "unavailable";
      setLipSyncHealth(nextHealth);
      if (nextHealth === "unavailable") {
        setLipSyncMode((current) =>
          current === "neural" ? "viseme" : current
        );
      }
    };
    void check();
    const timer = window.setInterval(check, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [renderMode]);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      studyAudioRef.current?.pause();
      studyAudioFinishRef.current?.(false);
      studyAudioFinishRef.current = null;
      recordingRequestedRef.current = false;
      void recognitionRef.current?.stop();
      if (subtitleFrameRef.current !== null) {
        window.cancelAnimationFrame(subtitleFrameRef.current);
      }
      if (listeningAdvanceTimerRef.current !== null) {
        window.clearTimeout(listeningAdvanceTimerRef.current);
      }
      if (activeUtteranceRef.current) {
        void window.desktopWindow?.updateRendererState(
          createSpeechStopCommand(activeUtteranceRef.current)
        );
      }
    },
    []
  );

  const clearSubtitlePlayback = () => {
    if (subtitleFrameRef.current !== null) {
      window.cancelAnimationFrame(subtitleFrameRef.current);
      subtitleFrameRef.current = null;
    }
    setSubtitlePlayback({ timeline: [], activeIndex: -1, sourceText: "" });
  };

  const stopSubtitleTracking = () => {
    if (subtitleFrameRef.current !== null) {
      window.cancelAnimationFrame(subtitleFrameRef.current);
      subtitleFrameRef.current = null;
    }
  };

  const finishSubtitlePlayback = (
    timeline: SpeechWordBoundary[],
    sourceText: string
  ) => {
    stopSubtitleTracking();
    setSubtitlePlayback({
      timeline,
      activeIndex: timeline.length - 1,
      sourceText
    });
  };

  const stopLipSync = () => {
    if (!activeUtteranceRef.current) return;
    void window.desktopWindow?.updateRendererState(
      createSpeechStopCommand(activeUtteranceRef.current)
    );
    activeUtteranceRef.current = "";
  };

  const speakWithSystemVoice = (
    text: string,
    selectedVoice = voiceIndex,
    onComplete?: () => void
  ) => {
    stopLipSync();
    clearSubtitlePlayback();
    if (!("speechSynthesis" in window)) {
      setSpeaking(false);
      setVoiceStatus("idle");
      onComplete?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const estimatedTimeline = createEstimatedTimeline(text, 150 * speed);
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
    utterance.voice = voices[selectedVoice % Math.max(voices.length, 1)] ?? null;
    utterance.rate = speed;
    utterance.pitch = selectedVoice < 2 ? 1.08 : 0.94;
    utterance.onstart = () => {
      setSpeaking(true);
      setVoiceStatus("fallback");
      setSubtitlePlayback({
        timeline: estimatedTimeline,
        activeIndex: estimatedTimeline.length ? 0 : -1,
        sourceText: text
      });
    };
    utterance.onboundary = (event) => {
      const spokenWords = text.slice(0, event.charIndex).match(/\S+/g)?.length ?? 0;
      setSubtitlePlayback({
        timeline: estimatedTimeline,
        activeIndex: Math.min(spokenWords, estimatedTimeline.length - 1),
        sourceText: text
      });
    };
    utterance.onend = () => {
      finishSubtitlePlayback(estimatedTimeline, text);
      setSpeaking(false);
      setVoiceStatus("idle");
      onComplete?.();
    };
    utterance.onerror = () => {
      clearSubtitlePlayback();
      setSpeaking(false);
      setVoiceStatus("idle");
    };
    window.speechSynthesis.speak(utterance);
  };

  const speak = async (
    text: string,
    selectedVoice = voiceIndex,
    onComplete?: () => void
  ) => {
    const requestId = ++speechRequestRef.current;
    const selectedLipSyncMode = lipSyncMode;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    studyAudioRef.current?.pause();
    studyAudioRef.current = null;
    audioRef.current = null;
    clearSubtitlePlayback();
    stopLipSync();

    if (!window.desktopWindow?.synthesizeSpeech) {
      speakWithSystemVoice(text, selectedVoice, onComplete);
      return;
    }

    setSpeaking(true);
    setVoiceStatus("generating");
    try {
      if (renderMode === "3d") {
        await window.desktopWindow.updateRendererState(
          createRendererPerformanceCommand("inference")
        );
      }
      const result = await window.desktopWindow.synthesizeSpeech({
        text,
        voiceId: neuralVoices[selectedVoice].id,
        speed,
        includeFaceAnimation:
          renderMode === "3d" && selectedLipSyncMode === "neural"
      });
      if (renderMode === "3d") {
        await window.desktopWindow.updateRendererState(
          createRendererPerformanceCommand("interactive")
        );
      }
      if (requestId !== speechRequestRef.current) return;

      const faceAnimation =
        renderMode !== "3d"
          ? null
          : selectedLipSyncMode === "neural"
          ? result.faceAnimation
          : selectedLipSyncMode === "viseme"
            ? createVisemeFaceAnimation(result.timeline)
            : await decodeAudioEnvelope(
                result.audioBase64,
                result.mimeType
              );
      if (requestId !== speechRequestRef.current) return;
      if (renderMode === "3d" && selectedLipSyncMode === "neural") {
        setLipSyncHealth(faceAnimation ? "ready" : "unavailable");
      }

      const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
      const utteranceId = `speech-${Date.now()}-${requestId}`;
      audioRef.current = audio;
      setSubtitlePlayback({
        timeline: result.timeline,
        activeIndex: -1,
        sourceText: text
      });
      audio.onplay = () => {
        activeUtteranceRef.current = utteranceId;
        setVoiceStatus("playing");
        if (faceAnimation) {
          void window.desktopWindow?.updateRendererState(
            createSpeechFaceCommand(faceAnimation)
          );
        }
        const updateSubtitle = () => {
          if (
            requestId !== speechRequestRef.current ||
            audio.paused ||
            audio.ended
          ) {
            subtitleFrameRef.current = null;
            return;
          }
          const activeIndex = getActiveBoundaryIndex(
            result.timeline,
            audio.currentTime * 1000
          );
          setSubtitlePlayback((current) =>
            current.timeline === result.timeline &&
            current.activeIndex === activeIndex
              ? current
              : {
                  timeline: result.timeline,
                  activeIndex,
                  sourceText: text
                }
          );
          subtitleFrameRef.current =
            window.requestAnimationFrame(updateSubtitle);
        };
        updateSubtitle();
      };
      audio.onended = () => {
        if (requestId !== speechRequestRef.current) return;
        stopLipSync();
        finishSubtitlePlayback(result.timeline, text);
        setSpeaking(false);
        setVoiceStatus("idle");
        onComplete?.();
      };
      audio.onerror = () => {
        if (requestId !== speechRequestRef.current) return;
        stopLipSync();
        clearSubtitlePlayback();
        speakWithSystemVoice(text, selectedVoice, onComplete);
      };
      await audio.play();
    } catch {
      if (renderMode === "3d") {
        void window.desktopWindow.updateRendererState(
          createRendererPerformanceCommand("interactive")
        );
      }
      if (requestId === speechRequestRef.current) {
        speakWithSystemVoice(text, selectedVoice, onComplete);
      }
    }
  };

  const speakStudyWord = async (
    text: string,
    selectedVoice = voiceIndex,
    speedOverride?: number,
    teachingCue?: TeachingCue
  ): Promise<boolean> => {
    const studySpeed = Math.max(
      0.6,
      Math.min(1.15, speedOverride ?? Math.min(speed, 0.82))
    );
    const requestId = ++speechRequestRef.current;
    studyAudioFinishRef.current?.(false);
    studyAudioFinishRef.current = null;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    studyAudioRef.current?.pause();
    studyAudioRef.current = null;
    stopSubtitleTracking();
    stopLipSync();
    setSpeaking(false);
    setVoiceStatus("idle");

    if (!window.desktopWindow?.synthesizeSpeech) {
      if (requestId !== speechRequestRef.current) return false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = studySpeed;
      utterance.pitch = teachingCue === "repeat" ? 0.96 : 1.02;
      window.speechSynthesis?.speak(utterance);
      return new Promise<boolean>((resolve) => {
        studyAudioFinishRef.current = resolve;
        utterance.onend = () => {
          if (requestId !== speechRequestRef.current) return resolve(false);
          studyAudioFinishRef.current = null;
          resolve(true);
        };
        utterance.onerror = () => {
          studyAudioFinishRef.current = null;
          resolve(false);
        };
      });
    }

    try {
      const result = await getStudySpeech(
        text,
        selectedVoice,
        studySpeed,
        teachingCue
      );
      if (requestId !== speechRequestRef.current) return false;
      const audio = new Audio(
        `data:${result.mimeType};base64,${result.audioBase64}`
      );
      studyAudioRef.current = audio;
      return await new Promise<boolean>((resolve) => {
        studyAudioFinishRef.current = resolve;
        audio.onended = () => {
          const completed =
            requestId === speechRequestRef.current &&
            studyAudioRef.current === audio;
          if (completed) {
          studyAudioRef.current = null;
            studyAudioFinishRef.current = null;
        }
          resolve(completed);
        };
        audio.onerror = () => {
          if (studyAudioRef.current === audio) studyAudioRef.current = null;
          studyAudioFinishRef.current = null;
          resolve(false);
        };
        audio.play().catch(() => {
          studyAudioFinishRef.current = null;
          resolve(false);
        });
      });
    } catch {
      if (requestId !== speechRequestRef.current) return false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = studySpeed;
      utterance.pitch = teachingCue === "repeat" ? 0.96 : 1.02;
      return await new Promise<boolean>((resolve) => {
        studyAudioFinishRef.current = resolve;
        utterance.onend = () => {
          if (requestId !== speechRequestRef.current) return resolve(false);
          studyAudioFinishRef.current = null;
          resolve(true);
        };
        utterance.onerror = () => {
          studyAudioFinishRef.current = null;
          resolve(false);
        };
        window.speechSynthesis?.speak(utterance);
      });
    }
  };

  const getStudySpeech = (
    text: string,
    selectedVoice: number,
    studySpeed: number,
    teachingCue?: TeachingCue
  ) => {
    if (!window.desktopWindow?.synthesizeSpeech) {
      return Promise.reject(new Error("Neural speech is unavailable."));
    }
    const key = [
      neuralVoices[selectedVoice].id,
      studySpeed,
      teachingCue ?? "default",
      text
    ].join(":");
    const cached = studySpeechCacheRef.current.get(key);
    if (cached) return cached;
    if (studySpeechCacheRef.current.size >= 32) {
      studySpeechCacheRef.current.clear();
    }
    const request = window.desktopWindow
      .synthesizeSpeech({
        text,
        voiceId: neuralVoices[selectedVoice].id,
        speed: studySpeed,
        includeFaceAnimation: false,
        purpose: teachingCue ? "teaching" : "default",
        teachingCue
      })
      .catch((error) => {
        studySpeechCacheRef.current.delete(key);
        throw error;
      });
    studySpeechCacheRef.current.set(key, request);
    return request;
  };

  const prepareStudyNarration = (
    steps: Array<{ text: string; cue: TeachingCue }>,
    level: Difficulty
  ) => {
    const narrationSpeed = explanationNarrationRates[level];
    for (const step of steps) {
      void getStudySpeech(
        step.text,
        voiceIndex,
        narrationSpeed,
        step.cue
      ).catch(() => undefined);
    }
  };

  const stopStudyNarration = () => {
    speechRequestRef.current += 1;
    studyAudioFinishRef.current?.(false);
    studyAudioFinishRef.current = null;
    window.speechSynthesis?.cancel();
    studyAudioRef.current?.pause();
    studyAudioRef.current = null;
  };

  const stopListeningAudio = () => {
    listeningRunRef.current += 1;
    if (listeningAdvanceTimerRef.current !== null) {
      window.clearTimeout(listeningAdvanceTimerRef.current);
      listeningAdvanceTimerRef.current = null;
    }
    speechRequestRef.current += 1;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    stopSubtitleTracking();
    stopLipSync();
    setSpeaking(false);
    setVoiceStatus("idle");
  };

  const pauseListening = () => {
    stopListeningAudio();
    setListeningPlaying(false);
    setPaused(true);
  };

  const resetListeningSession = () => {
    stopListeningAudio();
    setListeningRoundIndex(0);
    setListeningLineIndex(0);
    setListeningPlaying(false);
    setListeningComplete(false);
    setPaused(false);
    clearSubtitlePlayback();
  };

  const changeSessionMode = (mode: SessionMode) => {
    if (mode === sessionMode) return;
    stopListeningAudio();
    setSessionMode(mode);
    setUtilityView(null);
    setTranscriptOpen(false);
    setPaused(false);
    if (mode === "listening") {
      setListeningRoundIndex(0);
      setListeningLineIndex(0);
      setListeningComplete(false);
      setSessionDuration(30);
      setElapsed(0);
      setPaused(false);
      clearSubtitlePlayback();
    }
  };

  const moveListeningLine = (direction: -1 | 1) => {
    pauseListening();
    setListeningComplete(false);
    if (direction < 0) {
      if (listeningLineIndex > 0) {
        setListeningLineIndex((current) => current - 1);
      } else if (listeningRoundIndex > 0) {
        setListeningRoundIndex((current) => current - 1);
        setListeningLineIndex(listeningScript.length - 1);
      }
      return;
    }
    if (listeningLineIndex < listeningScript.length - 1) {
      setListeningLineIndex((current) => current + 1);
    } else if (listeningRoundIndex < listeningRounds.length - 1) {
      setListeningRoundIndex((current) => current + 1);
      setListeningLineIndex(0);
    } else {
      setListeningComplete(true);
    }
  };

  useEffect(() => {
    if (
      sessionMode !== "listening" ||
      !listeningPlaying ||
      listeningComplete ||
      !listeningLine
    ) {
      return;
    }
    const runId = ++listeningRunRef.current;
    const selectedVoice =
      listeningLine.speaker === "host"
        ? voiceIndex
        : (voiceIndex + 2) % neuralVoices.length;
    void speak(listeningLine.english, selectedVoice, () => {
      if (runId !== listeningRunRef.current) return;
      listeningAdvanceTimerRef.current = window.setTimeout(() => {
        if (runId !== listeningRunRef.current) return;
        if (listeningLineIndex < listeningScript.length - 1) {
          setListeningLineIndex((current) => current + 1);
          return;
        }
        if (listeningRoundIndex < listeningRounds.length - 1) {
          setListeningRoundIndex((current) => current + 1);
          setListeningLineIndex(0);
          return;
        }
        setListeningPlaying(false);
        setListeningComplete(true);
        setPaused(true);
      }, 1400);
    });
    return () => {
      listeningRunRef.current += 1;
      if (listeningAdvanceTimerRef.current !== null) {
        window.clearTimeout(listeningAdvanceTimerRef.current);
        listeningAdvanceTimerRef.current = null;
      }
    };
  }, [
    listeningComplete,
    listeningLineIndex,
    listeningPlaying,
    listeningRoundIndex,
    scenario.id,
    sessionMode
  ]);

  useEffect(() => {
    if (
      sessionMode === "listening" &&
      listeningPlaying &&
      elapsed >= sessionDuration * 60
    ) {
      pauseListening();
    }
  }, [elapsed, listeningPlaying, sessionDuration, sessionMode]);

  const changeScenario = (
    next: Scenario,
    nextDifficulty = difficulty,
    recommendationId: string | null = null
  ) => {
    setTranscriptOpen(false);
    if (sessionMode === "listening") resetListeningSession();
    dialogueRequestRef.current += 1;
    speechRequestRef.current += 1;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    clearSubtitlePlayback();
    stopLipSync();
    setSpeaking(false);
    setVoiceStatus("idle");
    setReaction("inviting");
    setActiveRecommendationId(recommendationId);
    setDifficulty(nextDifficulty);
    setScenario(next);
    setFocusedStudyLine(null);
    setSelectedWord(null);
    setLearningMode("dialogue");
    const opening = createOpening(next, nextDifficulty);
    setMessages([{ id: Date.now(), speaker: "persona", line: opening }]);
    setDialogueSuggestions(createSuggestions(next, nextDifficulty));
    setDialogueCoachCue(
      difficultyProfiles.find((profile) => profile.id === nextDifficulty)?.target ??
        difficultyProfiles[3].target
    );
    setInput("");
    setElapsed(0);
    setPaused(false);
    setScores({ fluency: 82, accuracy: 88, expression: 76 });
    setScenarioMenuOpen(false);
    setUtilityView(null);
    window.setTimeout(() => autoSpeak && speak(opening.english), 300);
  };

  const changeDifficulty = (next: Difficulty) => {
    const opening = createOpening(scenario, next);
    dialogueRequestRef.current += 1;
    speechRequestRef.current += 1;
    setDifficulty(next);
    setFocusedStudyLine(null);
    setSelectedWord(null);
    setLearningMode("dialogue");
    setMessages([{ id: Date.now(), speaker: "persona", line: opening }]);
    setDialogueSuggestions(createSuggestions(scenario, next));
    setDialogueCoachCue(
      difficultyProfiles.find((profile) => profile.id === next)?.target ??
        difficultyProfiles[3].target
    );
    setInput("");
    setReaction("inviting");
    setScores({ fluency: 82, accuracy: 88, expression: 76 });
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    clearSubtitlePlayback();
    stopLipSync();
    setSpeaking(false);
    setVoiceStatus("idle");
  };

  const changeSessionDuration = (nextDuration: PracticeDuration) => {
    setSessionDuration(nextDuration);
    setElapsed(0);
    setPaused(false);
  };

  const submitText = (text: string) => {
    const clean = text.trim();
    if (!clean || thinking) return;
    setFocusedStudyLine(null);
    setSelectedWord(null);
    setLearningMode("dialogue");
    const nextScores = scoreUtterance(clean);
    setLearningProfile((current) => updateLearningProfile(current, nextScores, clean));
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        speaker: "learner",
        line: { english: clean, chinese: `你的英文回答：${clean}` }
      }
    ]);
    setScores(nextScores);
    setInput("");
    setReaction("listening");
    setThinking(true);
    const dialogueRequest = ++dialogueRequestRef.current;
    const dialogueReply = createScenarioDialogueReply(
      clean,
      scenario,
      persona,
      difficulty
    );
    window.setTimeout(() => {
      if (dialogueRequest !== dialogueRequestRef.current) return;
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          speaker: "persona",
          line: {
            english: dialogueReply.english,
            chinese: dialogueReply.chinese
          }
        }
      ]);
      setDialogueSuggestions(dialogueReply.suggestions);
      setDialogueCoachCue(dialogueReply.coachCue);
      setThinking(false);
      setReaction(nextScores.expression >= 82 ? "encouraging" : "inviting");
      if (autoSpeak) speak(dialogueReply.english);
    }, 700);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitText(input);
  };

  const finishRecording = async (session: LocalSpeechSession) => {
    setRecognitionPhase("transcribing");
    try {
      const transcript = await session.stop();
      if (!transcript.trim()) {
        setRecognitionError("No speech detected · hold and try again");
      }
    } catch {
      setRecognitionError("Local transcription failed · hold and try again");
    } finally {
      setRecognitionPhase("idle");
    }
  };

  const stopRecording = () => {
    recordingRequestedRef.current = false;
    setRecording(false);
    const session = recognitionRef.current;
    recognitionRef.current = null;
    if (session) void finishRecording(session);
  };

  const startRecording = async () => {
    if (
      recordingRequestedRef.current ||
      recording ||
      recognitionPhase === "loading"
    ) {
      return;
    }
    recordingRequestedRef.current = true;
    setRecognitionError("");
    setRecording(true);
    setRecognitionPhase("preparing");
    try {
      const session = await startLocalSpeechRecognition({
        onTranscript: setInput
      });
      if (!recordingRequestedRef.current) {
        await finishRecording(session);
        return;
      }
      recognitionRef.current = session;
      setRecognitionPhase("listening");
    } catch (error) {
      recordingRequestedRef.current = false;
      setRecording(false);
      setRecognitionPhase("idle");
      setRecognitionError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied"
          : "Offline voice input could not start · hold to retry"
      );
    }
  };

  const replaceAvatar = (next: AvatarAsset) => {
    setAvatarAsset((current) => {
      if (current.modelUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.modelUrl);
      }
      return next;
    });
  };

  const selectAvatar = (nextAvatar: AvatarAsset) => {
    replaceAvatar(nextAvatar);
    const matchingPersona = allPersonas.find(
      (candidate) => candidate.id === nextAvatar.id
    );
    if (matchingPersona) {
      setPersona(matchingPersona);
    }
    setReaction("inviting");
    setAvatarError("");
    setAvatarStatus("ready");
  };

  const handleAvatarModel = (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    if (!file) return;

    setAvatarError("");
    setAvatarStatus("generating");
    try {
      replaceAvatar(createImportedAvatar(file));
      setAvatarStatus("ready");
    } catch (error) {
      setAvatarStatus("error");
      setAvatarError(error instanceof Error ? error.message : "无法读取模型。");
    } finally {
      inputElement.value = "";
    }
  };

  const resetAvatar = () => {
    selectAvatar(renderMode === "2d" ? portraitStudioAvatar : studioAvatar);
  };

  const changeRenderMode = (mode: RenderMode) => {
    if (mode === renderMode) return;
    stopLipSync();
    setRenderMode(mode);
    setAvatarStatus("generating");
    setAvatarError("");
    if (mode === "2d") {
      selectAvatar(portraitStudioAvatar);
    } else {
      selectAvatar(studioAvatar);
    }
    if (mode === "2d" && panelTab === "wardrobe") {
      setPanelTab("avatar");
    }
  };

  const handleAvatarRenderState = (state: AvatarRenderState) => {
    if (state === "ready") {
      setAvatarStatus("ready");
      setAvatarError("");
      return;
    }
    if (state === "error") {
      setAvatarStatus("error");
      setAvatarError(
        renderMode === "2d"
          ? "角色肖像无法加载，请重新选择角色。"
          : activeAvatarAsset.source === "imported"
          ? "模型无法加载，请换用标准 VRM/GLB 文件。"
          : "实时渲染器暂时离线，场景控制仍可使用并正在自动重连。"
      );
      return;
    }
    setAvatarStatus("generating");
  };

  const latestPersonaLine =
    [...messages].reverse().find((message) => message.speaker === "persona")?.line ??
    createOpening(scenario, difficulty);
  const listeningPersona: Persona =
    listeningLine.speaker === "host"
      ? persona
      : {
          ...persona,
          id: `${persona.id}-listening-guest`,
          name: "Alex Chen",
          role: "Conversation partner",
          accent: "International"
        };
  const stagePersona =
    sessionMode === "listening" ? listeningPersona : persona;
  const stageLine =
    sessionMode === "listening" ? listeningLine : latestPersonaLine;
  const stageSubtitleMode =
    sessionMode === "listening"
      ? listeningRounds[listeningRoundIndex].subtitleMode
      : subtitleMode;
  const defaultStudyLine =
    splitLocalizedLine(latestPersonaLine)[0] ?? latestPersonaLine;
  const performance: PerformanceState = sessionMode === "listening"
    ? speaking
      ? "explaining"
      : "inviting"
    : recording
    ? "listening"
    : thinking
      ? "thinking"
      : speaking
        ? "explaining"
        : reaction;

  return (
    <div className="app" data-learning-font-size={learningFontSize}>
      <TitleBar
        onSettings={() => {
          setUtilityView(null);
          setStudyCenterOpen(false);
          setPanelTab("avatar");
          setSettingsOpen(true);
        }}
      />
      <div className="session-bar">
        <button
          className="session-name"
          onClick={() => setScenarioMenuOpen((value) => !value)}
          aria-expanded={scenarioMenuOpen}
          aria-haspopup="menu"
        >
          <span className="session-symbol"><Languages size={16} /></span>
          <span><small>ACTIVE SESSION</small><strong>{scenario.title}</strong></span>
          <ChevronDown className={scenarioMenuOpen ? "rotated" : ""} size={14} />
        </button>
        {scenarioMenuOpen && (
          <div className="scenario-quick-menu" role="menu">
            <div>
              <span>FIXED SCENES</span>
              {scenarios.map((item) => (
                <button
                  key={item.id}
                  onClick={() => changeScenario(item, difficulty, null)}
                  role="menuitem"
                >
                  <item.icon size={15} />
                  <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                </button>
              ))}
            </div>
            {recommendations.length > 0 && (
              <div>
              <span>AI FOR YOU</span>
              {recommendations.map((recommendation) => (
                <button
                  key={recommendation.id}
                  onClick={() =>
                    changeScenario(
                      recommendation.scenario,
                      recommendation.difficulty,
                      recommendation.id
                    )
                  }
                  role="menuitem"
                >
                  <Bot size={15} />
                  <span>
                    <strong>{recommendation.scenario.title}</strong>
                    <small>{recommendation.reason}</small>
                  </span>
                </button>
              ))}
              </div>
            )}
          </div>
        )}
        <div className="session-stats">
          <span title="Session progress">
            <Clock3 size={14} />
            {formattedTime} / {sessionDuration}m
          </span>
          <label className="session-duration-select">
            <span className="sr-only">Practice duration</span>
            <select
              value={sessionDuration}
              disabled={sessionMode === "listening"}
              onChange={(event) =>
                changeSessionDuration(
                  Number(event.target.value) as PracticeDuration
                )
              }
              aria-label="Practice duration"
            >
              {([5, 10, 20, 30, 60] as PracticeDuration[]).map((duration) => (
                <option key={duration} value={duration}>{duration} min</option>
              ))}
            </select>
          </label>
          <label className="difficulty-select">
            <Gauge size={14} />
            <span className="sr-only">Conversation difficulty</span>
            <select
              value={difficulty}
              onChange={(event) => changeDifficulty(event.target.value as Difficulty)}
              aria-label="Conversation difficulty"
            >
              {difficultyProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.id} · {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label className="session-speed-select">
            <AudioLines size={14} />
            <span className="sr-only">Listening speed</span>
            <select
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              aria-label="Listening speed"
            >
              {[0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3].map((value) => (
                <option key={value} value={value}>{value.toFixed(1)}x</option>
              ))}
            </select>
          </label>
          <span><Star size={14} />+120 XP</span>
          <button
            className="subtitle-shortcut"
            onClick={() => {
              if (sessionMode === "listening") return;
              setUtilityView(null);
              setPanelTab("language");
              setSettingsOpen(true);
            }}
            disabled={sessionMode === "listening"}
            title={
              sessionMode === "listening"
                ? "Subtitle mode follows the current listening pass"
                : "Subtitle and language settings"
            }
          >
            <Captions size={14} />
            {sessionMode === "listening"
              ? listeningRounds[listeningRoundIndex].shortLabel
              : activeSubtitle.shortLabel}
          </button>
          <button
            onClick={() => {
              if (sessionMode === "listening") {
                if (listeningPlaying) pauseListening();
                else {
                  setPaused(false);
                  setListeningPlaying(true);
                }
                return;
              }
              setPaused((value) => !value);
            }}
            title={
              sessionMode === "listening"
                ? listeningPlaying
                  ? "Pause listening"
                  : "Resume listening"
                : paused
                  ? "Resume session"
                  : "Pause session"
            }
          >
            {sessionMode === "listening" ? (
              listeningPlaying ? <Pause size={14} /> : <Play size={14} />
            ) : paused ? (
              <Play size={14} />
            ) : (
              <Pause size={14} />
            )}
            {sessionMode === "listening"
              ? listeningPlaying
                ? "Pause"
                : "Play"
              : paused
                ? "Resume"
                : "Pause"}
          </button>
        </div>
      </div>
      <main className="workspace">
        <SideRail
          activeScenario={scenario}
          activeRecommendationId={activeRecommendationId}
          recommendations={recommendations}
          dailyPlan={dailyPlan}
          onSelect={(item) => changeScenario(item, difficulty, null)}
          onRecommended={(recommendation) =>
            changeScenario(
              recommendation.scenario,
              recommendation.difficulty,
              recommendation.id
            )
          }
          onStartDailyPlan={() =>
            changeScenario(
              dailyPlan.recommendation.scenario,
              dailyPlan.recommendation.difficulty,
              dailyPlan.recommendation.id
            )
          }
          onStudyCenter={() => {
            if (sessionMode === "listening") pauseListening();
            else setPaused(true);
            setUtilityView(null);
            setTranscriptOpen(false);
            setSettingsOpen(false);
            setStudyCenterOpen(true);
          }}
          onPhraseLibrary={() => {
            setStudyCenterOpen(false);
            setUtilityView("phrases");
          }}
          onHistory={() => {
            setStudyCenterOpen(false);
            setUtilityView("history");
          }}
        />
        <div className="experience">
          <CharacterStage
            scenario={scenario}
            persona={stagePersona}
            outfit={outfit}
            avatarAsset={activeAvatarAsset}
            portraitFrame={portraitFrame}
            performance={performance}
            speaking={speaking}
            currentLine={stageLine}
            subtitlePlayback={subtitlePlayback}
            subtitleMode={stageSubtitleMode}
            sessionMode={sessionMode}
            listeningHost={persona}
            listeningSpeaker={listeningLine.speaker}
            renderMode={renderMode}
            viewMode={viewMode}
            onRenderMode={changeRenderMode}
            onViewMode={setViewMode}
            onAvatarRenderState={handleAvatarRenderState}
            onReplay={() =>
              speak(
                stageLine.english,
                sessionMode === "listening" && listeningLine.speaker === "guest"
                  ? (voiceIndex + 2) % neuralVoices.length
                  : voiceIndex
              )
            }
            onOpenTranscript={() => {
              if (sessionMode === "listening") pauseListening();
              setUtilityView(null);
              setStudyCenterOpen(false);
              setTranscriptOpen(true);
            }}
            onSessionMode={changeSessionMode}
            onStudyWord={(word, sentence) => {
              setSelectedWord({ word, sentence });
              setLearningMode("word");
            }}
            onStudySentence={(sentence) => {
              setFocusedStudyLine(sentence);
              setLearningMode("grammar");
            }}
            onSpeakStudyWord={(text) => void speakStudyWord(text)}
          />
          {sessionMode === "roleplay" ? (
            <ConversationDock
              persona={persona}
              suggestions={suggestions}
              coachCue={dialogueCoachCue || difficultyProfile.target}
              input={input}
              recording={recording}
              recognitionError={recognitionError}
              recognitionPhase={recognitionPhase}
              thinking={thinking}
              autoSpeak={autoSpeak}
              onInput={setInput}
              onSubmit={onSubmit}
              onSuggestion={(suggestion) => submitText(suggestion.english)}
              onStartRecording={() => void startRecording()}
              onStopRecording={stopRecording}
              onToggleAutoSpeak={() => setAutoSpeak((value) => !value)}
            />
          ) : (
            <ListeningDock
              roundIndex={listeningRoundIndex}
              lineIndex={listeningLineIndex}
              lineCount={listeningScript.length}
              playing={listeningPlaying}
              complete={listeningComplete}
              speaker={stagePersona.name}
              onToggle={() => {
                if (listeningPlaying) {
                  pauseListening();
                  return;
                }
                if (listeningComplete) {
                  setListeningRoundIndex(0);
                  setListeningLineIndex(0);
                  setListeningComplete(false);
                }
                setPaused(false);
                setListeningPlaying(true);
              }}
              onPrevious={() => moveListeningLine(-1)}
              onNext={() => moveListeningLine(1)}
              onRound={(roundIndex) => {
                pauseListening();
                setListeningRoundIndex(roundIndex);
                setListeningLineIndex(0);
                setListeningComplete(false);
                clearSubtitlePlayback();
              }}
            />
          )}
          {utilityView && (
            <UtilityDrawer
              mode={utilityView}
              suggestions={suggestions}
              currentLine={latestPersonaLine}
              profile={learningProfile}
              recommendations={recommendations}
              onClose={() => setUtilityView(null)}
              onUsePhrase={(phrase) => {
                setInput(phrase);
                setUtilityView(null);
              }}
            />
          )}
          {transcriptOpen && (
            <DialogueTranscript
              lines={transcriptLines}
              hostName={persona.name}
              guestName={sessionMode === "listening" ? "Alex Chen" : "You"}
              level={difficulty}
              onClose={() => setTranscriptOpen(false)}
              onSpeakWord={(word) => void speakStudyWord(word)}
              onSpeakSentence={(text, speaker) =>
                void speakStudyWord(
                  text,
                  speaker === "guest"
                    ? (voiceIndex + 2) % neuralVoices.length
                    : voiceIndex
                )
              }
            />
          )}
        </div>
        {sessionMode === "roleplay" ? <LearningSidebar
          mode={learningMode}
          line={focusedStudyLine ?? defaultStudyLine}
          messages={messages}
          persona={persona}
          subtitleMode={subtitleMode}
          selectedWord={selectedWord}
          scores={scores}
          onMode={setLearningMode}
          onSelectWord={(word, sentence) => {
            setSelectedWord({ word, sentence });
            setLearningMode("word");
            void speakStudyWord(word.word);
          }}
          onAnalyze={(sentence) => {
            setFocusedStudyLine(sentence);
            setLearningMode("grammar");
          }}
          onSpeak={(text) => void speakStudyWord(text)}
        /> : (
          <ListeningGuide
            roundIndex={listeningRoundIndex}
            lineCount={listeningScript.length}
          />
        )}
        {settingsOpen && (
          <div
            className="settings-drawer-shell"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSettingsOpen(false);
            }}
          >
            <ControlPanel
              tab={panelTab}
              onTab={setPanelTab}
              onClose={() => setSettingsOpen(false)}
              avatarAsset={activeAvatarAsset}
              avatarStatus={avatarStatus}
              avatarError={avatarError}
              persona={persona}
              outfit={outfit}
              voiceIndex={voiceIndex}
              speed={speed}
              autoSpeak={autoSpeak}
              voiceStatus={voiceStatus}
              renderMode={renderMode}
              portraitFrame={portraitFrame}
              onPortraitFrame={setPortraitFrame}
              portraitSet={portraitSet}
              lipSyncMode={lipSyncMode}
              lipSyncHealth={lipSyncHealth}
              currentLine={focusedStudyLine ?? defaultStudyLine}
              subtitleMode={subtitleMode}
              learningFontSize={learningFontSize}
              showStructure={showStructure}
              showPhonetics={showPhonetics}
              onPersona={(nextPersona) => {
                setPersona(nextPersona);
                const matchingAvatar = (
                  renderMode === "2d"
                    ? portraitSet === "asia"
                      ? asiaPortraitAvatarAssets
                      : portraitSet === "asia3"
                        ? asia3PortraitAvatarAssets
                        : portraitAvatarAssets
                    : runtimeAvatarAssets
                ).find(
                  (candidate) => candidate.id === nextPersona.id
                );
                if (matchingAvatar) {
                  replaceAvatar(matchingAvatar);
                  setAvatarError("");
                  setAvatarStatus("ready");
                }
                setReaction("inviting");
              }}
              onOutfit={(nextOutfit) => {
                setOutfit(nextOutfit);
                setReaction("inviting");
              }}
              onVoice={(index) => {
                setVoiceIndex(index);
                speak("Hello. This is how I will sound in our next conversation.", index);
              }}
              onSpeed={setSpeed}
              onAutoSpeak={() => setAutoSpeak((value) => !value)}
              onLipSyncMode={setLipSyncMode}
              onPreview={() => speak("Welcome. Take a breath, and speak as naturally as you can.")}
              onSubtitleMode={setSubtitleMode}
              onLearningFontSize={setLearningFontSize}
              onShowStructure={() => setShowStructure((value) => !value)}
              onShowPhonetics={() => setShowPhonetics((value) => !value)}
              onAvatar={selectAvatar}
              onAvatarModel={handleAvatarModel}
              onAvatarReset={resetAvatar}
              onPortraitSet={(nextSet) => {
                setPortraitSet(nextSet);
                if (renderMode !== "2d") return;
                const nextAssets =
                  nextSet === "asia"
                    ? asiaPortraitAvatarAssets
                    : nextSet === "asia3"
                      ? asia3PortraitAvatarAssets
                      : portraitAvatarAssets;
                const nextPersonas =
                  nextSet === "asia"
                    ? asiaPortraitPersonas
                    : nextSet === "asia3"
                      ? asia3PortraitPersonas
                      : portraitPersonas;
                const nextAsset = nextAssets[0];
                replaceAvatar(nextAsset);
                setPersona(nextPersonas[0]);
                setAvatarError("");
                setAvatarStatus("ready");
                setReaction("inviting");
              }}
            />
          </div>
        )}
        {studyCenterOpen && (
          <StudyCenter
            key={scenario.id}
            curriculum={studyCurriculum}
            scenarioId={scenario.id}
            scenarioTitle={scenario.title}
            level={difficulty}
            onClose={() => setStudyCenterOpen(false)}
            onSpeak={(text) => void speakStudyWord(text)}
            onNarrate={(text, level, cue) =>
              speakStudyWord(
                text,
                voiceIndex,
                explanationNarrationRates[level],
                cue
              )
            }
            onPrepareNarration={prepareStudyNarration}
            onStopNarration={stopStudyNarration}
          />
        )}
      </main>
    </div>
  );
}
