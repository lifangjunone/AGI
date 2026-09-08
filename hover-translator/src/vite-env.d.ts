/// <reference types="vite/client" />

type NativeStatus = "starting" | "ready" | "permission-required" | "input-monitoring-required" | "unsupported" | "stopped" | "error";

interface AppState {
  enabled: boolean;
  autoHideOnHoverLeave: boolean;
  nativeStatus: NativeStatus;
  petVisible: boolean;
  mainVisible: boolean;
}

interface TranslationResult {
  query: string;
  translation?: string;
  isWord?: boolean;
  phonetic?: string;
  partOfSpeech?: string;
  definition?: string;
  example?: string;
  exampleTranslation?: string;
  root?: string;
  source?: "online" | "offline";
  trigger?: "hover" | "selection" | "doubleClick" | "manual";
  error?: string;
}

interface Window {
  translator: {
    translate(text: string): Promise<TranslationResult>;
    speak(text: string): Promise<boolean>;
    stopSpeaking(): void;
    getState(): Promise<AppState>;
    setEnabled(enabled: boolean): Promise<AppState>;
    setAutoHideOnHoverLeave(enabled: boolean): Promise<AppState>;
    toggleMainWindow(): void;
    showPetMenu(): void;
    startPetDrag(): void;
    movePet(deltaX: number, deltaY: number): void;
    endPetDrag(): void;
    hideWindow(): void;
    minimizeWindow(): void;
    openPermissions(permission: NativeStatus): void;
    onTranslation(listener: (result: TranslationResult) => void): () => void;
    onState(listener: (state: AppState) => void): () => void;
  };
}
