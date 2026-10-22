import { create } from "zustand";
import type { Locale } from "./i18n";

interface AppState {
  locale: Locale;
  agentPaused: boolean;
  setLocale: (locale: Locale) => void;
  setAgentPaused: (paused: boolean) => void;
  toggleAgent: () => void;
}

const storage = typeof window !== "undefined" ? window.localStorage : undefined;
const browserLanguage = typeof navigator !== "undefined" ? navigator.language : "zh-CN";

export const useAppStore = create<AppState>((set) => ({
  locale: (storage?.getItem("meyou-locale") as Locale | null) || (browserLanguage.startsWith("zh") ? "zh-CN" : "en"),
  agentPaused: false,
  setLocale: (locale) => {
    storage?.setItem("meyou-locale", locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
    set({ locale });
  },
  setAgentPaused: (agentPaused) => set({ agentPaused }),
  toggleAgent: () => set((state) => ({ agentPaused: !state.agentPaused }))
}));
