/// <reference types="vite/client" />

interface Window {
  desktopWindow?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    loadSpeechModel: () => Promise<Uint8Array>;
    synthesizeSpeech: (request: {
      text: string;
      voiceId: string;
      speed: number;
      includeFaceAnimation?: boolean;
      purpose?: "default" | "teaching";
      teachingCue?: "meaning" | "usage" | "example" | "repeat";
    }) => Promise<{
      audioBase64: string;
      mimeType: string;
      provider: string;
      timeline: Array<{
        text: string;
        startMs: number;
        endMs: number;
      }>;
      faceAnimation:
        | import("./metahuman-protocol").FaceAnimationPayload
        | null;
      cached: boolean;
    }>;
    askGrammar: (request: {
      sentence: string;
      translation: string;
      question: string;
      level: string;
    }) => Promise<{
      source: "ai" | "local";
      model: string;
      summary: string;
      grammarRole: string;
      explanation: string;
      contrast: string;
      examples: Array<{ english: string; chinese: string }>;
      tip: string;
    }>;
    explainStudy: (request: {
      level: import("./language").Difficulty;
      type: string;
      title: string;
      meaning: string;
      focus: string;
      context: string;
      translation: string;
    }) => Promise<{
      source: "ai" | "local";
      model: string;
      level: import("./language").Difficulty;
      title: string;
      scriptSentences: string[];
      chineseSummary: string;
      keyPoints: Array<{ english: string; chinese: string }>;
      checkQuestion: string;
      checkAnswer: string;
    }>;
    getLipSyncHealth: () => Promise<{
      ready: boolean;
      device?: string;
      modelParams?: number;
    }>;
    getRendererConfig: () => Promise<{
      signalUrl: string;
    }>;
    updateRendererState: (
      state: import("./metahuman-protocol").MetaHumanCommand
    ) => Promise<boolean>;
    platform: string;
  };
}
