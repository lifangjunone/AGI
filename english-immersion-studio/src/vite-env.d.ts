/// <reference types="vite/client" />

interface Window {
  desktopWindow?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    synthesizeSpeech: (request: {
      text: string;
      voiceId: string;
      speed: number;
      includeFaceAnimation?: boolean;
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
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
