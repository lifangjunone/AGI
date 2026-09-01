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
    }) => Promise<{
      audioBase64: string;
      mimeType: string;
      provider: string;
      cached: boolean;
    }>;
    getRendererConfig: () => Promise<{
      signalUrl: string;
    }>;
    updateRendererState: (state: {
      version: 1;
      type: "avatar.state";
      payload: {
        actorName: string;
        avatarId: string;
        hairId: string;
        outfitId: string;
        performance: string;
        sceneId: string;
        speaking: boolean;
        viewMode: "first" | "third";
      };
    }) => Promise<boolean>;
    platform: string;
  };
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
