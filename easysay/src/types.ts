export type CefrLevel = "A1" | "A2" | "B1" | "B2";
export type LearningGoal = "daily" | "travel" | "work" | "interview";
export type AccentPreference = "american" | "british";
export type LanguageCode = "zh-CN" | "en" | "ja" | "ko" | "es" | "fr";
export type TabId = "today" | "plan" | "coach" | "progress" | "models";

export interface LearnerProfile {
  name: string;
  level: CefrLevel;
  goal: LearningGoal;
  minutesPerDay: 30 | 45 | 60;
  accent: AccentPreference;
  nativeLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  createdAt: string;
}

export interface BaselineResult {
  completedAt: string;
  selfIntroTranscript: string;
  storyTranscript: string;
  selfIntroAudioId?: string;
  storyAudioId?: string;
  focusAreas: string[];
  scores: {
    intelligibility: number;
    fluency: number;
    expression: number;
    interaction: number;
  };
}

export interface WeekPlan {
  week: number;
  phase: string;
  theme: string;
  outcome: string;
  chunks: string[];
  lesson?: {
    category: string;
    difficulty: number;
    roles: Array<{ name: string; description: string }>;
    dialogues: Array<{
      speaker: string;
      target: string;
      translation: string;
    }>;
    vocabulary: Array<{
      term: string;
      pronunciation?: string;
      meaning: string;
      example: string;
    }>;
    patterns: Array<{ pattern: string; translation: string }>;
    outputDrills: Array<{
      question: string;
      questionTranslation: string;
      answer: string;
      answerTranslation: string;
      alternatives: string[];
      commonMistake: string;
      explanation: string;
    }>;
    flashcards: Array<{
      term: string;
      pronunciation?: string;
      meaning: string;
      example: string;
      recallPrompt: string;
    }>;
  };
}

export interface LearningPlan {
  title: string;
  level: CefrLevel;
  goal: LearningGoal;
  summary: string;
  generatedBy: "ark" | "local" | "hermes";
  weeks: WeekPlan[];
}

export interface EvolutionFocus {
  area: string;
  evidence: string;
  priority: "high" | "medium" | "low";
}

export interface EvolutionRouteChange {
  week: number;
  previousTheme: string;
  newTheme: string;
  reason: string;
}

export interface EvolutionInsight {
  id: string;
  generatedAt: string;
  source: "hermes-agent";
  summary: string;
  strengths: string[];
  focusAreas: EvolutionFocus[];
  nextActions: string[];
  routeChanges: EvolutionRouteChange[];
  analyzedRecordCount: number;
}

export interface EvolutionState {
  enabled: boolean;
  autoEvolve: boolean;
  recordsPerCycle: number;
  lastAnalyzedRecordCount: number;
  lastInsight?: EvolutionInsight;
  error?: string;
}

export interface EvolutionResult {
  insight: EvolutionInsight;
  weekAdjustments: Array<{
    week: number;
    theme: string;
    outcome: string;
    chunks: string[];
    reason: string;
  }>;
}

export type TaskType =
  | "input"
  | "shadow"
  | "chunks"
  | "free-speak"
  | "roleplay"
  | "review";

export interface DailyTask {
  id: string;
  type: TaskType;
  title: string;
  description: string;
  minutes: number;
  completed: boolean;
  practiceItems?: string[];
}

export interface CoachFeedback {
  summary: string;
  intelligibility: number;
  fluency: number;
  expression: number;
  interaction: number;
  priorityIssue: string;
  grammarFix: string;
  naturalPhrases: string[];
  retryPrompt: string;
  source: "ark" | "local";
}

export interface CoachMessage {
  id: string;
  role: "coach" | "learner";
  content: string;
}

export interface PracticeRecord {
  id: string;
  taskId: string;
  createdAt: string;
  durationSeconds: number;
  transcript: string;
  audioId?: string;
  feedback?: CoachFeedback;
  completionMode?: "recommended" | "user-confirmed";
  score?: number;
  bestCombo?: number;
}

export interface AppProgress {
  completedTaskIds: string[];
  userConfirmedTaskIds: string[];
  records: PracticeRecord[];
  streak: number;
  lastStudyDate?: string;
  weeklySpeakingSeconds: number;
  weeklySpeakingWeekKey?: string;
  totalPoints: number;
  bestCombo: number;
  knownChunks: Array<{
    text: string;
    learnedAt: string;
    reviewStep: number;
    nextReviewAt: string;
  }>;
}

export interface PersistedState {
  profile?: LearnerProfile;
  baseline?: BaselineResult;
  plan?: LearningPlan;
  progress: AppProgress;
  evolution: EvolutionState;
}

export interface SpeechConfig {
  version: 1;
  service: {
    baseUrl: string;
    host: "127.0.0.1" | "localhost" | "::1";
    port: number;
    requestTimeoutMs: number;
  };
  runtime: {
    engine: "mlx";
    lazyLoad: boolean;
    maxConcurrentRequests: number;
  };
  asr: {
    enabled: boolean;
    modelId: string;
    modelPath: string;
    language: string;
    maxTokens: number;
  };
  tts: {
    enabled: boolean;
    modelId: string;
    modelPath: string;
    language: string;
    americanVoice: string;
    britishVoice: string;
    speed: number;
    temperature: number;
    styleInstruction: string;
  };
}

export interface SpeechModelStatus {
  id: string;
  path: string;
  present: boolean;
  loaded: boolean;
  enabled: boolean;
}

export interface SpeechServiceStatus {
  ok: boolean;
  engine?: string;
  uptimeSeconds?: number;
  models?: {
    asr: SpeechModelStatus;
    tts: SpeechModelStatus;
  };
  metrics?: {
    requests: { asr: number; tts: number; errors: number };
    lastLatencyMs: {
      asr: number | null;
      tts: number | null;
    };
  };
  error?: string;
}
