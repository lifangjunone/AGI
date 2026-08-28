import type { LanguageCode } from "../types";

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  asrLanguage: string;
  speechTag: string;
  sample: string;
}

export const languageOptions: LanguageOption[] = [
  {
    code: "zh-CN",
    label: "中文",
    nativeLabel: "中文",
    asrLanguage: "Chinese",
    speechTag: "zh-CN",
    sample: "你好，很高兴认识你。"
  },
  {
    code: "en",
    label: "英语",
    nativeLabel: "English",
    asrLanguage: "English",
    speechTag: "en-US",
    sample: "Hi, it's great to meet you."
  },
  {
    code: "ja",
    label: "日语",
    nativeLabel: "日本語",
    asrLanguage: "Japanese",
    speechTag: "ja-JP",
    sample: "こんにちは、はじめまして。"
  },
  {
    code: "ko",
    label: "韩语",
    nativeLabel: "한국어",
    asrLanguage: "Korean",
    speechTag: "ko-KR",
    sample: "안녕하세요, 만나서 반갑습니다."
  },
  {
    code: "es",
    label: "西班牙语",
    nativeLabel: "Español",
    asrLanguage: "Spanish",
    speechTag: "es-ES",
    sample: "Hola, mucho gusto."
  },
  {
    code: "fr",
    label: "法语",
    nativeLabel: "Français",
    asrLanguage: "French",
    speechTag: "fr-FR",
    sample: "Bonjour, enchanté de vous rencontrer."
  }
];

export function getLanguage(code: LanguageCode): LanguageOption {
  return (
    languageOptions.find((language) => language.code === code) ??
    languageOptions[1]
  );
}

export function targetLanguageOptions(nativeLanguage: LanguageCode) {
  return languageOptions.filter((language) => language.code !== nativeLanguage);
}
