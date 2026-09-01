import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  BookOpenText,
  Box,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Eye,
  Flame,
  Gauge,
  GraduationCap,
  History,
  ImagePlus,
  Languages,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  MoreHorizontal,
  Pause,
  PersonStanding,
  Play,
  Send,
  ScanFace,
  Settings2,
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
  createAvatarFromPhoto,
  createImportedAvatar,
  DEFAULT_AVATAR_URL,
  getBuiltInAvatarUrl,
  type AvatarAsset,
  type AvatarGenerationStatus
} from "./avatar";
import {
  faceStyles,
  facesForStyle,
  type FaceStyleId,
  type SyntheticFace
} from "./avatar-faces";
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
import AvatarRenderer from "./AvatarRenderer";
import {
  type AvatarRenderState,
  type ViewMode
} from "./ImmersiveStage";
import {
  analyzeStructure,
  analyzeWords,
  createOpening,
  createReplyLine,
  createSuggestions,
  difficultyProfiles,
  subtitleLines,
  subtitleModes,
  type Difficulty,
  type LocalizedLine,
  type SubtitleMode
} from "./language";
import {
  buildRecommendations,
  initialLearningProfile,
  updateLearningProfile,
  type AdaptiveRecommendation,
  type LearningProfile
} from "./recommendations";

type PanelTab = "avatar" | "persona" | "wardrobe" | "voice" | "language";
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

const studioAvatar: AvatarAsset = {
  id: "studio-vrm",
  label: "Studio Avatar",
  modelUrl: DEFAULT_AVATAR_URL,
  source: "bundled"
};

type BrowserRecognitionEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

const neuralVoices = voiceProfiles as VoiceProfile[];

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
  onSelect,
  onRecommended,
  onPhraseLibrary,
  onHistory
}: {
  activeScenario: Scenario;
  activeRecommendationId: string | null;
  recommendations: AdaptiveRecommendation[];
  onSelect: (scenario: Scenario) => void;
  onRecommended: (recommendation: AdaptiveRecommendation) => void;
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
        <div className="recommendation-heading">
          <span className="rail-label">FOR YOU</span>
          <span><Bot size={12} /> AI ADAPTIVE</span>
        </div>
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
  performance,
  speaking,
  currentLine,
  subtitleMode,
  viewMode,
  onViewMode,
  onAvatarRenderState,
  onReplay,
  onSceneOptions
}: {
  scenario: Scenario;
  persona: Persona;
  outfit: Outfit;
  avatarAsset: AvatarAsset;
  performance: PerformanceState;
  speaking: boolean;
  currentLine: LocalizedLine;
  subtitleMode: SubtitleMode;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onAvatarRenderState: (state: AvatarRenderState) => void;
  onReplay: () => void;
  onSceneOptions: () => void;
}) {
  const direction = performances[performance];
  return (
    <section
      className={`character-stage view-${viewMode}`}
      style={{ "--scene-image": `url("${scenario.image}")` } as React.CSSProperties}
      aria-label={`${scenario.title} immersive scene`}
    >
      <AvatarRenderer
        sceneImage={scenario.image}
        sceneId={scenario.id}
        actorName={persona.name}
        performance={performance}
        speaking={speaking}
        viewMode={viewMode}
        avatarAsset={avatarAsset}
        outfitId={outfit.id}
        onRenderState={onAvatarRenderState}
      />
      <div className="scene-vignette" />
      <div className="scene-header">
        <div>
          <span className="live-dot" />
          <span>LIVE ROLEPLAY</span>
          <span className="scene-separator" />
          <span>{scenario.location}</span>
        </div>
        <div className="scene-actions">
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
          <button
            className="glass-button"
            title="Scene options"
            aria-label="Scene options"
            onClick={onSceneOptions}
          >
            <MoreHorizontal size={18} />
          </button>
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

      <div className="persona-caption">
        <span className="mood">{scenario.mood}</span>
        <h1>{persona.name}</h1>
        <p>{persona.role} · {persona.accent} English</p>
        <button onClick={onReplay} className={speaking ? "playing" : ""}>
          {speaking ? <AudioLines size={15} /> : <Volume2 size={15} />}
          {speaking ? "Speaking" : "Replay"}
        </button>
      </div>

      <div className="pov-focus-ring" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      {subtitleMode !== "none" && (
        <div className="pov-subtitle" aria-live="polite">
          <span>{persona.name.split(" ")[0].toUpperCase()} · TO YOU</span>
          {subtitleLines(currentLine, subtitleMode).map((subtitle) => (
            <p key={subtitle.lang} lang={subtitle.lang} className={`subtitle-${subtitle.lang}`}>
              {subtitle.text}
            </p>
          ))}
        </div>
      )}

      <div className="viewer-presence" aria-hidden="true">
        <span>YOU</span>
      </div>
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

function LocalizedText({
  line,
  mode,
  learner = false
}: {
  line: LocalizedLine;
  mode: SubtitleMode;
  learner?: boolean;
}) {
  const visibleLines =
    learner && (mode === "chinese" || mode === "none")
      ? [{ lang: "en", text: line.english }]
      : subtitleLines(line, mode);
  return (
    <div className="localized-lines">
      {visibleLines.map((subtitle) => (
        <p key={subtitle.lang} lang={subtitle.lang} className={`subtitle-${subtitle.lang}`}>
          {subtitle.text}
        </p>
      ))}
    </div>
  );
}

function ConversationDock({
  persona,
  messages,
  suggestions,
  subtitleMode,
  coachCue,
  input,
  recording,
  thinking,
  autoSpeak,
  scores,
  onInput,
  onSubmit,
  onSuggestion,
  onToggleRecording,
  onToggleAutoSpeak
}: {
  persona: Persona;
  messages: ChatMessage[];
  suggestions: LocalizedLine[];
  subtitleMode: SubtitleMode;
  coachCue: string;
  input: string;
  recording: boolean;
  thinking: boolean;
  autoSpeak: boolean;
  scores: { fluency: number; accuracy: number; expression: number };
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSuggestion: (suggestion: LocalizedLine) => void;
  onToggleRecording: () => void;
  onToggleAutoSpeak: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const lastPersonaMessage = [...messages].reverse().find((item) => item.speaker === "persona");

  return (
    <section className="conversation-dock">
      <div className="transcript-area" ref={scrollRef}>
        <div className="conversation-heading">
          <div>
            <MessageSquareText size={15} />
            <span>YOUR POV · LIVE COACH</span>
          </div>
          <button onClick={onToggleAutoSpeak} title="Toggle automatic voice">
            {autoSpeak ? <Volume2 size={15} /> : <VolumeX size={15} />}
            Auto voice
          </button>
        </div>

        {messages.slice(-3).map((message) => (
          <div key={message.id} className={`message ${message.speaker}`}>
            <span className="message-speaker">
              {message.speaker === "persona" ? persona.name.split(" ")[0] : "You"}
            </span>
            <LocalizedText
              line={message.line}
              mode={subtitleMode}
              learner={message.speaker === "learner"}
            />
          </div>
        ))}
        {thinking && (
          <div className="message persona thinking">
            <span /><span /><span />
          </div>
        )}
      </div>

      <div className="practice-controls">
        <div className="coach-whisper">
          <span><Eye size={12} /> COACH IN YOUR EAR</span>
          <p>看着 {persona.name.split(" ")[0]}。{coachCue}</p>
        </div>
        <div className="suggestions" aria-label="Suggested replies">
          <span>YOUR NEXT LINE</span>
          {suggestions.slice(0, 2).map((suggestion) => (
            <button key={suggestion.english} onClick={() => onSuggestion(suggestion)}>
              {suggestion.english}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="composer">
          <button
            type="button"
            className={`mic-button ${recording ? "recording" : ""}`}
            onClick={onToggleRecording}
            aria-label={recording ? "Stop listening" : "Speak your answer"}
            title={recording ? "Stop listening" : "Speak your answer"}
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
        <div className="live-scores">
          <ScoreRing value={scores.fluency} label="Fluency" />
          <ScoreRing value={scores.accuracy} label="Accuracy" />
          <ScoreRing value={scores.expression} label="Expression" />
          <p>
            <Sparkles size={14} />
            {lastPersonaMessage ? "Live feedback updates after each reply." : "Start speaking to see feedback."}
          </p>
        </div>
      </div>
    </section>
  );
}

function GeneratedFaceButton({
  face,
  selected,
  onSelect
}: {
  face: SyntheticFace;
  selected: boolean;
  onSelect: (face: SyntheticFace) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      className={`${selected ? "selected" : ""} ${loaded ? "ready" : failed ? "failed" : "loading"}`}
      onClick={() => onSelect(face)}
      title={failed ? `${face.name} asset unavailable` : face.name}
      aria-label={`Select ${face.name} fictional adult face reference`}
      disabled={!loaded}
    >
      <img
        src={face.imageUrl}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded && !failed && <span className="face-loader" />}
      {failed && <X className="face-load-error" size={14} />}
      <span>{face.name.split(" ")[1]}</span>
      {selected && <Check size={11} />}
    </button>
  );
}

function AvatarPanel({
  asset,
  status,
  error,
  onFacePreset,
  onPhoto,
  onModel,
  onReset
}: {
  asset: AvatarAsset;
  status: AvatarGenerationStatus;
  error: string;
  onFacePreset: (face: SyntheticFace) => void;
  onPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onModel: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  const sourceLabel = {
    bundled: "REALISTIC 3D",
    synthetic: "AI 3D IDENTITY",
    imported: "CUSTOM MODEL",
    generated: "PHOTO 3D IDENTITY"
  }[asset.source];
  const [faceStyle, setFaceStyle] = useState<FaceStyleId>("k-stage");
  const [selectedFaceId, setSelectedFaceId] = useState("");
  const visibleFaces = facesForStyle(faceStyle);

  return (
    <div className="panel-content avatar-panel">
      <div className="panel-intro">
        <span>AVATAR STUDIO</span>
        <h2>Create a real presence</h2>
        <p>真人比例骨骼、表情、视线和口型在设备端实时驱动。</p>
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
              : status === "generating"
                ? "正在生成 3D 身份"
                : status === "error"
                  ? "生成失败"
                  : "骨骼与表情已就绪"}
          </span>
        </div>
      </div>

      <div className="avatar-capabilities" aria-label="Avatar capabilities">
        <span><i />SKELETON</span>
        <span><i />FACE</span>
        <span><i />LIP SYNC</span>
        <span><i />LOOK AT</span>
      </div>

      <div className="face-library">
        <div className="face-library-heading">
          <span>AI FACE COLLECTION</span>
          <strong>30 fictional adults</strong>
        </div>
        <div className="face-style-tabs" role="tablist" aria-label="AI face styles">
          {faceStyles.map((style) => (
            <button
              key={style.id}
              className={faceStyle === style.id ? "active" : ""}
              onClick={() => setFaceStyle(style.id)}
              role="tab"
              aria-selected={faceStyle === style.id}
            >
              {style.shortLabel}
            </button>
          ))}
        </div>
        <div className="face-grid">
          {visibleFaces.map((face) => (
            <GeneratedFaceButton
              key={face.id}
              face={face}
              selected={selectedFaceId === face.id}
              onSelect={(selectedFace) => {
                setSelectedFaceId(selectedFace.id);
                onFacePreset(selectedFace);
              }}
            />
          ))}
        </div>
        <p>AI 生成的虚构成年人物，不对应任何真实艺人。</p>
      </div>

      <div className="avatar-upload-actions">
        <label className="avatar-primary-action">
          <ImagePlus size={17} />
          <span><strong>从照片生成</strong><small>JPG / PNG / WebP · 20 MB</small></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
        </label>
        <label className="avatar-secondary-action">
          <Upload size={15} />
          <span><strong>导入 3D 模型</strong><small>VRM / GLB</small></span>
          <input type="file" accept=".vrm,.glb,model/gltf-binary" onChange={onModel} />
        </label>
      </div>

      {error && <p className="avatar-error" role="alert">{error}</p>}

      <div className="avatar-pipeline">
        <span>IDENTITY PIPELINE</span>
        <ol>
          <li className={asset.photoUrl ? "done" : ""}><span>01</span><p><strong>Portrait</strong><small>身份特征与色彩</small></p></li>
          <li className={status === "generating" ? "active" : status === "ready" ? "done" : ""}><span>02</span><p><strong>Reconstruct</strong><small>MediaPipe UV 3D 烘焙</small></p></li>
          <li className={status === "ready" ? "done" : ""}><span>03</span><p><strong>Rig</strong><small>113 个面部形变与骨骼</small></p></li>
        </ol>
      </div>

      {asset.source !== "bundled" && (
        <button className="avatar-reset" onClick={onReset}>
          <Box size={15} />
          Restore studio avatar
        </button>
      )}
      <p className="avatar-privacy">照片仅由本机 MediaPipe 与 WebGL 处理；不会上传到第三方。</p>
    </div>
  );
}

function PersonaPanel({
  selected,
  onSelect
}: {
  selected: Persona;
  onSelect: (persona: Persona) => void;
}) {
  return (
    <div className="panel-content persona-list">
      <div className="panel-intro">
        <span>DIGITAL EMPLOYEE</span>
        <h2>Choose your partner</h2>
        <p>Each personality responds with a distinct rhythm, warmth and conversational style.</p>
      </div>
      {personas.map((persona) => (
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
        {outfits.map((outfit) => (
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
  onSelect,
  onSpeed,
  onAutoSpeak,
  onPreview
}: {
  selected: number;
  speed: number;
  autoSpeak: boolean;
  status: VoiceStatus;
  onSelect: (index: number) => void;
  onSpeed: (speed: number) => void;
  onAutoSpeak: () => void;
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
  showStructure,
  showPhonetics,
  onSubtitleMode,
  onShowStructure,
  onShowPhonetics
}: {
  line: LocalizedLine;
  subtitleMode: SubtitleMode;
  showStructure: boolean;
  showPhonetics: boolean;
  onSubtitleMode: (mode: SubtitleMode) => void;
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
          <div className="structure-map">
            {structure.segments.map((segment, index) => (
              <span key={`${segment.role}-${index}`}>
                <small>{segment.role}</small>
                <b>{segment.text}</b>
              </span>
            ))}
          </div>
          <strong>{structure.pattern}</strong>
          <small>{structure.note}</small>
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
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
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
  avatarAsset,
  avatarStatus,
  avatarError,
  persona,
  outfit,
  voiceIndex,
  speed,
  autoSpeak,
  voiceStatus,
  currentLine,
  subtitleMode,
  showStructure,
  showPhonetics,
  onPersona,
  onOutfit,
  onVoice,
  onSpeed,
  onAutoSpeak,
  onPreview,
  onSubtitleMode,
  onShowStructure,
  onShowPhonetics,
  onAvatarFacePreset,
  onAvatarPhoto,
  onAvatarModel,
  onAvatarReset
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  avatarAsset: AvatarAsset;
  avatarStatus: AvatarGenerationStatus;
  avatarError: string;
  persona: Persona;
  outfit: Outfit;
  voiceIndex: number;
  speed: number;
  autoSpeak: boolean;
  voiceStatus: VoiceStatus;
  currentLine: LocalizedLine;
  subtitleMode: SubtitleMode;
  showStructure: boolean;
  showPhonetics: boolean;
  onPersona: (persona: Persona) => void;
  onOutfit: (outfit: Outfit) => void;
  onVoice: (index: number) => void;
  onSpeed: (speed: number) => void;
  onAutoSpeak: () => void;
  onPreview: () => void;
  onSubtitleMode: (mode: SubtitleMode) => void;
  onShowStructure: () => void;
  onShowPhonetics: () => void;
  onAvatarFacePreset: (face: SyntheticFace) => void;
  onAvatarPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarModel: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarReset: () => void;
}) {
  return (
    <aside className="control-panel">
      <div className="panel-tabs" role="tablist" aria-label="Character controls">
        <button className={tab === "avatar" ? "active" : ""} onClick={() => onTab("avatar")} title="Avatar studio">
          <ScanFace size={17} /><span>Avatar</span>
        </button>
        <button className={tab === "persona" ? "active" : ""} onClick={() => onTab("persona")} title="Persona">
          <CircleUserRound size={17} /><span>Persona</span>
        </button>
        <button className={tab === "wardrobe" ? "active" : ""} onClick={() => onTab("wardrobe")} title="Wardrobe">
          <Sparkles size={17} /><span>Looks</span>
        </button>
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
          onFacePreset={onAvatarFacePreset}
          onPhoto={onAvatarPhoto}
          onModel={onAvatarModel}
          onReset={onAvatarReset}
        />
      )}
      {tab === "persona" && <PersonaPanel selected={persona} onSelect={onPersona} />}
      {tab === "wardrobe" && <WardrobePanel selected={outfit} onSelect={onOutfit} />}
      {tab === "voice" && (
        <VoicePanel
          selected={voiceIndex}
          speed={speed}
          autoSpeak={autoSpeak}
          status={voiceStatus}
          onSelect={onVoice}
          onSpeed={onSpeed}
          onAutoSpeak={onAutoSpeak}
          onPreview={onPreview}
        />
      )}
      {tab === "language" && (
        <LanguagePanel
          line={currentLine}
          subtitleMode={subtitleMode}
          showStructure={showStructure}
          showPhonetics={showPhonetics}
          onSubtitleMode={onSubtitleMode}
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
  const [difficulty, setDifficulty] = useState<Difficulty>("B2");
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("en-zh");
  const [showStructure, setShowStructure] = useState(true);
  const [showPhonetics, setShowPhonetics] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("first");
  const [avatarAsset, setAvatarAsset] = useState<AvatarAsset>(studioAvatar);
  const [avatarStatus, setAvatarStatus] = useState<AvatarGenerationStatus>("generating");
  const [avatarError, setAvatarError] = useState("");
  const [learningProfile, setLearningProfile] =
    useState<LearningProfile>(initialLearningProfile);
  const [activeRecommendationId, setActiveRecommendationId] = useState<string | null>(null);
  const [utilityView, setUtilityView] = useState<"phrases" | "history" | null>(null);
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [persona, setPersona] = useState(personas[0]);
  const [outfit, setOutfit] = useState(outfits[0]);
  const [panelTab, setPanelTab] = useState<PanelTab>("avatar");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, speaker: "persona", line: createOpening(scenarios[0], "B2") }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [speed, setSpeed] = useState(0.9);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [reaction, setReaction] = useState<PerformanceState>("inviting");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState({ fluency: 82, accuracy: 88, expression: 76 });
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRequestRef = useRef(0);
  const suggestions = useMemo(
    () => createSuggestions(scenario, difficulty),
    [difficulty, scenario]
  );
  const difficultyProfile =
    difficultyProfiles.find((profile) => profile.id === difficulty) ??
    difficultyProfiles[3];
  const activeSubtitle =
    subtitleModes.find((mode) => mode.id === subtitleMode) ?? subtitleModes[2];
  const recommendations = useMemo(
    () => buildRecommendations(learningProfile, difficulty),
    [difficulty, learningProfile]
  );
  const activeAvatarAsset = useMemo(
    () =>
      avatarAsset.source === "bundled" ||
      avatarAsset.source === "synthetic" ||
      avatarAsset.source === "generated"
        ? { ...avatarAsset, modelUrl: getBuiltInAvatarUrl(outfit.id) }
        : avatarAsset,
    [avatarAsset, outfit.id]
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

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
    },
    []
  );

  const speakWithSystemVoice = (text: string, selectedVoice = voiceIndex) => {
    if (!("speechSynthesis" in window)) {
      setSpeaking(false);
      setVoiceStatus("idle");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
    utterance.voice = voices[selectedVoice % Math.max(voices.length, 1)] ?? null;
    utterance.rate = speed;
    utterance.pitch = selectedVoice < 2 ? 1.08 : 0.94;
    utterance.onstart = () => {
      setSpeaking(true);
      setVoiceStatus("fallback");
    };
    utterance.onend = () => {
      setSpeaking(false);
      setVoiceStatus("idle");
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setVoiceStatus("idle");
    };
    window.speechSynthesis.speak(utterance);
  };

  const speak = async (text: string, selectedVoice = voiceIndex) => {
    const requestId = ++speechRequestRef.current;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;

    if (!window.desktopWindow?.synthesizeSpeech) {
      speakWithSystemVoice(text, selectedVoice);
      return;
    }

    setSpeaking(true);
    setVoiceStatus("generating");
    try {
      const result = await window.desktopWindow.synthesizeSpeech({
        text,
        voiceId: neuralVoices[selectedVoice].id,
        speed
      });
      if (requestId !== speechRequestRef.current) return;

      const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
      audioRef.current = audio;
      audio.onplay = () => setVoiceStatus("playing");
      audio.onended = () => {
        if (requestId !== speechRequestRef.current) return;
        setSpeaking(false);
        setVoiceStatus("idle");
      };
      audio.onerror = () => {
        if (requestId !== speechRequestRef.current) return;
        speakWithSystemVoice(text, selectedVoice);
      };
      await audio.play();
    } catch {
      if (requestId === speechRequestRef.current) speakWithSystemVoice(text, selectedVoice);
    }
  };

  const changeScenario = (
    next: Scenario,
    nextDifficulty = difficulty,
    recommendationId: string | null = null
  ) => {
    speechRequestRef.current += 1;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
    setVoiceStatus("idle");
    setReaction("inviting");
    setActiveRecommendationId(recommendationId);
    setDifficulty(nextDifficulty);
    setScenario(next);
    const opening = createOpening(next, nextDifficulty);
    setMessages([{ id: Date.now(), speaker: "persona", line: opening }]);
    setInput("");
    setElapsed(0);
    setScores({ fluency: 82, accuracy: 88, expression: 76 });
    setScenarioMenuOpen(false);
    setUtilityView(null);
    window.setTimeout(() => autoSpeak && speak(opening.english), 300);
  };

  const changeDifficulty = (next: Difficulty) => {
    const opening = createOpening(scenario, next);
    speechRequestRef.current += 1;
    setDifficulty(next);
    setMessages([{ id: Date.now(), speaker: "persona", line: opening }]);
    setInput("");
    setReaction("inviting");
    setScores({ fluency: 82, accuracy: 88, expression: 76 });
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
    setVoiceStatus("idle");
  };

  const submitText = (text: string) => {
    const clean = text.trim();
    if (!clean || thinking) return;
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
    window.setTimeout(() => {
      const reply = createReplyLine(clean, scenario, persona, difficulty);
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, speaker: "persona", line: reply }
      ]);
      setThinking(false);
      setReaction(nextScores.expression >= 82 ? "encouraging" : "inviting");
      if (autoSpeak) speak(reply.english);
    }, 700);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitText(input);
  };

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const Recognition = (window.SpeechRecognition ??
      window.webkitSpeechRecognition) as unknown as BrowserRecognitionConstructor | undefined;
    if (!Recognition) {
      setRecording(true);
      window.setTimeout(() => {
        setInput(suggestions[0].english);
        setRecording(false);
      }, 1100);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    setRecording(true);
    recognition.start();
  };

  const replaceAvatar = (next: AvatarAsset) => {
    setAvatarAsset((current) => {
      if (current.modelUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.modelUrl);
      }
      return next;
    });
  };

  const handleAvatarPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    if (!file) return;

    setAvatarError("");
    setAvatarStatus("preparing");
    try {
      setAvatarStatus("generating");
      replaceAvatar(await createAvatarFromPhoto(file, outfit.id));
    } catch (error) {
      setAvatarStatus("error");
      setAvatarError(error instanceof Error ? error.message : "无法生成数字人。");
    } finally {
      inputElement.value = "";
    }
  };

  const handleAvatarFacePreset = async (face: SyntheticFace) => {
    setAvatarError("");
    setAvatarStatus("generating");
    try {
      const response = await fetch(face.imageUrl);
      if (!response.ok) throw new Error("无法读取本地人脸参考图。");
      await response.blob();
      replaceAvatar({
        id: face.id,
        label: face.name,
        modelUrl: getBuiltInAvatarUrl(outfit.id),
        photoUrl: face.imageUrl,
        identityImageUrl: face.imageUrl,
        source: "synthetic"
      });
    } catch (error) {
      setAvatarStatus("error");
      setAvatarError(
        error instanceof Error ? error.message : "本地 3D 身份生成失败。"
      );
    }
  };

  const handleAvatarModel = (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    if (!file) return;

    setAvatarError("");
    setAvatarStatus("generating");
    try {
      replaceAvatar(createImportedAvatar(file));
    } catch (error) {
      setAvatarStatus("error");
      setAvatarError(error instanceof Error ? error.message : "无法读取模型。");
    } finally {
      inputElement.value = "";
    }
  };

  const resetAvatar = () => {
    replaceAvatar(studioAvatar);
    setAvatarError("");
    setAvatarStatus("generating");
  };

  const handleAvatarRenderState = (state: AvatarRenderState) => {
    if (state === "ready") {
      setAvatarStatus("ready");
      return;
    }
    if (state === "error") {
      setAvatarStatus("error");
      setAvatarError("模型无法加载，请换用标准 VRM/GLB 文件。");
      return;
    }
    setAvatarStatus("generating");
  };

  const latestPersonaLine =
    [...messages].reverse().find((message) => message.speaker === "persona")?.line ??
    createOpening(scenario, difficulty);
  const performance: PerformanceState = recording
    ? "listening"
    : thinking
      ? "thinking"
      : speaking
        ? "explaining"
        : reaction;

  return (
    <div className="app">
      <TitleBar
        onSettings={() => {
          setUtilityView(null);
          setPanelTab("language");
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
          </div>
        )}
        <div className="session-stats">
          <span><Clock3 size={14} />{formattedTime}</span>
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
          <span><Star size={14} />+120 XP</span>
          <button
            className="subtitle-shortcut"
            onClick={() => {
              setUtilityView(null);
              setPanelTab("language");
            }}
            title="Subtitle and language settings"
          >
            <Captions size={14} />
            {activeSubtitle.shortLabel}
          </button>
          <button onClick={() => setPaused((value) => !value)} title={paused ? "Resume session" : "Pause session"}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>
      <main className="workspace">
        <SideRail
          activeScenario={scenario}
          activeRecommendationId={activeRecommendationId}
          recommendations={recommendations}
          onSelect={(item) => changeScenario(item, difficulty, null)}
          onRecommended={(recommendation) =>
            changeScenario(
              recommendation.scenario,
              recommendation.difficulty,
              recommendation.id
            )
          }
          onPhraseLibrary={() => setUtilityView("phrases")}
          onHistory={() => setUtilityView("history")}
        />
        <div className="experience">
          <CharacterStage
            scenario={scenario}
            persona={persona}
            outfit={outfit}
            avatarAsset={activeAvatarAsset}
            performance={performance}
            speaking={speaking}
            currentLine={latestPersonaLine}
            subtitleMode={subtitleMode}
            viewMode={viewMode}
            onViewMode={setViewMode}
            onAvatarRenderState={handleAvatarRenderState}
            onReplay={() => speak(latestPersonaLine.english)}
            onSceneOptions={() => {
              setUtilityView(null);
              setPanelTab("wardrobe");
            }}
          />
          <ConversationDock
            persona={persona}
            messages={messages}
            suggestions={suggestions}
            subtitleMode={subtitleMode}
            coachCue={difficultyProfile.target}
            input={input}
            recording={recording}
            thinking={thinking}
            autoSpeak={autoSpeak}
            scores={scores}
            onInput={setInput}
            onSubmit={onSubmit}
            onSuggestion={(suggestion) => submitText(suggestion.english)}
            onToggleRecording={toggleRecording}
            onToggleAutoSpeak={() => setAutoSpeak((value) => !value)}
          />
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
        </div>
        <ControlPanel
          tab={panelTab}
          onTab={setPanelTab}
          avatarAsset={activeAvatarAsset}
          avatarStatus={avatarStatus}
          avatarError={avatarError}
          persona={persona}
          outfit={outfit}
          voiceIndex={voiceIndex}
          speed={speed}
          autoSpeak={autoSpeak}
          voiceStatus={voiceStatus}
          currentLine={latestPersonaLine}
          subtitleMode={subtitleMode}
          showStructure={showStructure}
          showPhonetics={showPhonetics}
          onPersona={(nextPersona) => {
            setPersona(nextPersona);
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
          onPreview={() => speak("Welcome. Take a breath, and speak as naturally as you can.")}
          onSubtitleMode={setSubtitleMode}
          onShowStructure={() => setShowStructure((value) => !value)}
          onShowPhonetics={() => setShowPhonetics((value) => !value)}
          onAvatarFacePreset={handleAvatarFacePreset}
          onAvatarPhoto={handleAvatarPhoto}
          onAvatarModel={handleAvatarModel}
          onAvatarReset={resetAvatar}
        />
      </main>
    </div>
  );
}
