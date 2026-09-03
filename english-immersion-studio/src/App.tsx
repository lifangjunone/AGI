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
  Languages,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  PersonStanding,
  Play,
  Send,
  ScanFace,
  Settings2,
  Shirt,
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
import {
  createRendererPerformanceCommand,
  createSpeechFaceCommand,
  createSpeechStopCommand
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

type PanelTab = "avatar" | "persona" | "wardrobe" | "voice" | "language";
type PortraitSet = "original" | "asia";
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

const studioAvatar = runtimeAvatarAssets[0];
const portraitStudioAvatar = portraitAvatarAssets[0];
const allPersonas = [...portraitPersonas, ...personas];

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
const verifiedPersonaIds = new Set(
  runtimeIdentities.map((identity) => identity.id)
);
const verifiedOutfitIds = new Set(["studio-basic"]);

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
  renderMode,
  viewMode,
  onRenderMode,
  onViewMode,
  onAvatarRenderState,
  onReplay
}: {
  scenario: Scenario;
  persona: Persona;
  outfit: Outfit;
  avatarAsset: AvatarAsset;
  performance: PerformanceState;
  speaking: boolean;
  currentLine: LocalizedLine;
  subtitleMode: SubtitleMode;
  renderMode: RenderMode;
  viewMode: ViewMode;
  onRenderMode: (mode: RenderMode) => void;
  onViewMode: (mode: ViewMode) => void;
  onAvatarRenderState: (state: AvatarRenderState) => void;
  onReplay: () => void;
}) {
  const direction = performances[performance];
  return (
    <section
      className={`character-stage render-${renderMode} view-${viewMode}`}
      style={{ "--scene-image": `url("${scenario.image}")` } as React.CSSProperties}
      aria-label={`${scenario.title} immersive scene`}
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

function AvatarPanel({
  asset,
  status,
  error,
  renderMode,
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
  portraitSet: PortraitSet;
  onPortraitSet: (set: PortraitSet) => void;
  onAvatar: (asset: AvatarAsset) => void;
  onModel: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  const portraitAssets =
    portraitSet === "asia" ? asiaPortraitAvatarAssets : portraitAvatarAssets;
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
  renderMode,
  portraitSet,
  lipSyncMode,
  lipSyncHealth,
  currentLine,
  subtitleMode,
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
  onShowStructure,
  onShowPhonetics,
  onAvatar,
  onAvatarModel,
  onAvatarReset,
  onPortraitSet
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
  renderMode: RenderMode;
  portraitSet: PortraitSet;
  lipSyncMode: LipSyncMode;
  lipSyncHealth: LipSyncHealth;
  currentLine: LocalizedLine;
  subtitleMode: SubtitleMode;
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
  onShowStructure: () => void;
  onShowPhonetics: () => void;
  onAvatar: (asset: AvatarAsset) => void;
  onAvatarModel: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarReset: () => void;
  onPortraitSet: (set: PortraitSet) => void;
}) {
  return (
    <aside className="control-panel">
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
  const [renderMode, setRenderMode] = useState<RenderMode>("2d");
  const [portraitSet, setPortraitSet] = useState<PortraitSet>("original");
  const [viewMode, setViewMode] = useState<ViewMode>("first");
  const [avatarAsset, setAvatarAsset] =
    useState<AvatarAsset>(portraitStudioAvatar);
  const [avatarStatus, setAvatarStatus] = useState<AvatarGenerationStatus>("generating");
  const [avatarError, setAvatarError] = useState("");
  const [learningProfile, setLearningProfile] =
    useState<LearningProfile>(initialLearningProfile);
  const [activeRecommendationId, setActiveRecommendationId] = useState<string | null>(null);
  const [utilityView, setUtilityView] = useState<"phrases" | "history" | null>(null);
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [persona, setPersona] = useState(portraitPersonas[0]);
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
  const [lipSyncMode, setLipSyncMode] = useState<LipSyncMode>("neural");
  const [lipSyncHealth, setLipSyncHealth] =
    useState<LipSyncHealth>("checking");
  const [reaction, setReaction] = useState<PerformanceState>("inviting");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState({ fluency: 82, accuracy: 88, expression: 76 });
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRequestRef = useRef(0);
  const activeUtteranceRef = useRef("");
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
      if (activeUtteranceRef.current) {
        void window.desktopWindow?.updateRendererState(
          createSpeechStopCommand(activeUtteranceRef.current)
        );
      }
    },
    []
  );

  const stopLipSync = () => {
    if (!activeUtteranceRef.current) return;
    void window.desktopWindow?.updateRendererState(
      createSpeechStopCommand(activeUtteranceRef.current)
    );
    activeUtteranceRef.current = "";
  };

  const speakWithSystemVoice = (text: string, selectedVoice = voiceIndex) => {
    stopLipSync();
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
    const selectedLipSyncMode = lipSyncMode;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    stopLipSync();

    if (!window.desktopWindow?.synthesizeSpeech) {
      speakWithSystemVoice(text, selectedVoice);
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
      audio.onplay = () => {
        activeUtteranceRef.current = utteranceId;
        setVoiceStatus("playing");
        if (faceAnimation) {
          void window.desktopWindow?.updateRendererState(
            createSpeechFaceCommand(faceAnimation)
          );
        }
      };
      audio.onended = () => {
        if (requestId !== speechRequestRef.current) return;
        stopLipSync();
        setSpeaking(false);
        setVoiceStatus("idle");
      };
      audio.onerror = () => {
        if (requestId !== speechRequestRef.current) return;
        stopLipSync();
        speakWithSystemVoice(text, selectedVoice);
      };
      await audio.play();
    } catch {
      if (renderMode === "3d") {
        void window.desktopWindow.updateRendererState(
          createRendererPerformanceCommand("interactive")
        );
      }
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
    stopLipSync();
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
    stopLipSync();
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
            renderMode={renderMode}
            viewMode={viewMode}
            onRenderMode={changeRenderMode}
            onViewMode={setViewMode}
            onAvatarRenderState={handleAvatarRenderState}
            onReplay={() => speak(latestPersonaLine.english)}
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
          renderMode={renderMode}
          portraitSet={portraitSet}
          lipSyncMode={lipSyncMode}
          lipSyncHealth={lipSyncHealth}
          currentLine={latestPersonaLine}
          subtitleMode={subtitleMode}
          showStructure={showStructure}
          showPhonetics={showPhonetics}
          onPersona={(nextPersona) => {
            setPersona(nextPersona);
            const matchingAvatar = (
              renderMode === "2d"
                ? portraitSet === "asia"
                  ? asiaPortraitAvatarAssets
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
                : portraitAvatarAssets;
            const nextPersonas =
              nextSet === "asia" ? asiaPortraitPersonas : portraitPersonas;
            const nextAsset = nextAssets[0];
            replaceAvatar(nextAsset);
            setPersona(nextPersonas[0]);
            setAvatarError("");
            setAvatarStatus("ready");
            setReaction("inviting");
          }}
        />
      </main>
    </div>
  );
}
