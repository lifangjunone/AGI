export type SentenceRole = "subject" | "predicate" | "object" | "adverbial";

export interface WordAnalysis {
  text: string;
  normalized: string;
  ipa: string;
  meaning: string;
  partOfSpeech: string;
  stress?: string;
  pronunciationNote?: string;
}

export interface SentenceSegment {
  role: SentenceRole;
  words: WordAnalysis[];
}

export interface PronunciationFeature {
  label: string;
  detail: string;
  wordIndexes: number[];
}

export interface SentenceAnalysis {
  segments: SentenceSegment[];
  pronunciationFeatures: PronunciationFeature[];
}

const englishLexicon: Record<
  string,
  Omit<WordAnalysis, "text" | "normalized">
> = {
  i: {
    ipa: "/aɪ/",
    meaning: "我",
    partOfSpeech: "代词",
    stress: "重读"
  },
  like: {
    ipa: "/laɪk/",
    meaning: "喜欢",
    partOfSpeech: "动词",
    stress: "重读"
  },
  to: {
    ipa: "/tə/",
    meaning: "不定式标记",
    partOfSpeech: "助词",
    stress: "弱读",
    pronunciationNote: "自然语流中通常弱读为 /tə/"
  },
  eat: {
    ipa: "/iːt/",
    meaning: "吃",
    partOfSpeech: "动词",
    stress: "重读"
  },
  fresh: {
    ipa: "/freʃ/",
    meaning: "新鲜的",
    partOfSpeech: "形容词",
    stress: "重读"
  },
  apple: {
    ipa: "/ˈæpəl/",
    meaning: "苹果",
    partOfSpeech: "名词",
    stress: "首音节重读"
  },
  apples: {
    ipa: "/ˈæpəlz/",
    meaning: "苹果（复数）",
    partOfSpeech: "名词",
    stress: "首音节重读",
    pronunciationNote: "复数词尾发 /z/"
  },
  every: {
    ipa: "/ˈevri/",
    meaning: "每一个",
    partOfSpeech: "限定词",
    stress: "首音节重读"
  },
  morning: {
    ipa: "/ˈmɔːrnɪŋ/",
    meaning: "早上",
    partOfSpeech: "名词",
    stress: "首音节重读"
  },
  work: {
    ipa: "/wɜːrk/",
    meaning: "工作",
    partOfSpeech: "动词",
    stress: "重读"
  },
  product: {
    ipa: "/ˈprɑːdʌkt/",
    meaning: "产品",
    partOfSpeech: "名词",
    stress: "首音节重读"
  },
  design: {
    ipa: "/dɪˈzaɪn/",
    meaning: "设计",
    partOfSpeech: "名词",
    stress: "第二音节重读"
  },
  technology: {
    ipa: "/tekˈnɑːlədʒi/",
    meaning: "科技",
    partOfSpeech: "名词",
    stress: "第二音节重读"
  },
  company: {
    ipa: "/ˈkʌmpəni/",
    meaning: "公司",
    partOfSpeech: "名词",
    stress: "首音节重读"
  },
  choose: {
    ipa: "/tʃuːz/",
    meaning: "选择",
    partOfSpeech: "动词",
    stress: "重读"
  },
  because: {
    ipa: "/bɪˈkɔːz/",
    meaning: "因为",
    partOfSpeech: "连词",
    stress: "第二音节重读"
  },
  they: { ipa: "/ðeɪ/", meaning: "它们", partOfSpeech: "代词" },
  are: {
    ipa: "/ɑːr/",
    meaning: "是",
    partOfSpeech: "系动词",
    pronunciationNote: "自然语流中常弱读为 /ər/"
  },
  easy: {
    ipa: "/ˈiːzi/",
    meaning: "容易的",
    partOfSpeech: "形容词",
    stress: "首音节重读"
  },
  prepare: {
    ipa: "/prɪˈper/",
    meaning: "准备",
    partOfSpeech: "动词",
    stress: "第二音节重读"
  },
  in: {
    ipa: "/ɪn/",
    meaning: "在……领域",
    partOfSpeech: "介词",
    stress: "弱读"
  },
  most: { ipa: "/moʊst/", meaning: "大部分", partOfSpeech: "限定词" },
  of: {
    ipa: "/əv/",
    meaning: "……的",
    partOfSpeech: "介词",
    stress: "弱读"
  },
  my: { ipa: "/maɪ/", meaning: "我的", partOfSpeech: "限定词" },
  time: { ipa: "/taɪm/", meaning: "时间", partOfSpeech: "名词" },
  goes: { ipa: "/ɡoʊz/", meaning: "投入 / 用于", partOfSpeech: "动词" },
  into: {
    ipa: "/ˈɪntuː/",
    meaning: "进入 / 投入",
    partOfSpeech: "介词",
    stress: "首音节重读"
  },
  let: { ipa: "/let/", meaning: "让", partOfSpeech: "动词" },
  me: {
    ipa: "/miː/",
    meaning: "我",
    partOfSpeech: "代词",
    pronunciationNote: "非强调时可弱读为 /mi/"
  },
  think: { ipa: "/θɪŋk/", meaning: "思考", partOfSpeech: "动词" },
  a: {
    ipa: "/ə/",
    meaning: "一个",
    partOfSpeech: "冠词",
    stress: "弱读"
  },
  second: {
    ipa: "/ˈsekənd/",
    meaning: "片刻 / 秒",
    partOfSpeech: "名词",
    stress: "首音节重读"
  },
  mean: { ipa: "/miːn/", meaning: "意思是", partOfSpeech: "动词" },
  could: {
    ipa: "/kʊd/",
    meaning: "可以",
    partOfSpeech: "情态动词",
    pronunciationNote: "自然语流中常弱读为 /kəd/"
  },
  say: { ipa: "/seɪ/", meaning: "说", partOfSpeech: "动词" },
  that: { ipa: "/ðæt/", meaning: "那件事", partOfSpeech: "代词" },
  again: {
    ipa: "/əˈɡen/",
    meaning: "再一次",
    partOfSpeech: "副词",
    stress: "第二音节重读"
  },
  what: { ipa: "/wʌt/", meaning: "什么", partOfSpeech: "疑问代词" },
  do: {
    ipa: "/duː/",
    meaning: "助动词",
    partOfSpeech: "助动词",
    pronunciationNote: "非强调时可弱读为 /də/"
  },
  you: {
    ipa: "/juː/",
    meaning: "你",
    partOfSpeech: "代词",
    pronunciationNote: "自然语流中常弱读为 /jə/"
  },
  why: { ipa: "/waɪ/", meaning: "为什么", partOfSpeech: "疑问副词" },
  them: {
    ipa: "/ðem/",
    meaning: "它们",
    partOfSpeech: "代词",
    pronunciationNote: "自然语流中可弱读为 /ðəm/"
  },
  the: {
    ipa: "/ðə/",
    meaning: "这 / 该",
    partOfSpeech: "冠词",
    stress: "弱读"
  },
  main: { ipa: "/meɪn/", meaning: "主要的", partOfSpeech: "形容词" },
  reason: {
    ipa: "/ˈriːzən/",
    meaning: "原因",
    partOfSpeech: "名词",
    stress: "首音节重读"
  },
  is: {
    ipa: "/ɪz/",
    meaning: "是",
    partOfSpeech: "系动词",
    pronunciationNote: "非强调时可弱读为 /z/"
  },
  for: {
    ipa: "/fər/",
    meaning: "为了 / 对于",
    partOfSpeech: "介词",
    stress: "弱读"
  },
  example: {
    ipa: "/ɪɡˈzæmpəl/",
    meaning: "例子",
    partOfSpeech: "名词",
    stress: "第二音节重读"
  }
};

const verbs = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "can",
  "could",
  "will",
  "would",
  "should",
  "like",
  "choose",
  "want",
  "need",
  "work",
  "live",
  "go",
  "make",
  "think",
  "feel",
  "learn",
  "speak",
  "eat"
]);

const adverbialStarts = new Set([
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "every",
  "usually",
  "often",
  "because",
  "when"
]);

function cleanWords(text: string) {
  return text
    .replace(/[.!?]+$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function fallbackWord(text: string): WordAnalysis {
  const normalized = text.toLowerCase().replace(/[^a-z'-]/g, "");
  const base =
    englishLexicon[normalized] ??
    (normalized.endsWith("s")
      ? englishLexicon[normalized.slice(0, -1)]
      : undefined);

  if (base) {
    return { text, normalized, ...base };
  }

  return {
    text,
    normalized,
    ipa: "点按听音",
    meaning: "结合语境理解",
    partOfSpeech: "待分析"
  };
}

function splitRoles(words: WordAnalysis[]): SentenceSegment[] {
  if (words.length < 3) {
    return words.map((word, index) => ({
      role: index === 0 ? "subject" : "predicate",
      words: [word]
    }));
  }

  const verbIndex = Math.max(
    1,
    words.findIndex(
      (word, index) => index > 0 && verbs.has(word.normalized)
    )
  );
  const infinitiveIndex = words.findIndex(
    (word, index) => index > verbIndex && word.normalized === "to"
  );
  const predicateEnd =
    infinitiveIndex === verbIndex + 1 && words[infinitiveIndex + 1]
      ? infinitiveIndex + 2
      : verbIndex + 1;
  const adverbialIndex = words.findIndex(
    (word, index) =>
      index >= predicateEnd && adverbialStarts.has(word.normalized)
  );
  const slices: Array<[SentenceRole, WordAnalysis[]]> = [
    ["subject", words.slice(0, verbIndex)],
    ["predicate", words.slice(verbIndex, predicateEnd)],
    [
      "object",
      words.slice(
        predicateEnd,
        adverbialIndex >= predicateEnd ? adverbialIndex : undefined
      )
    ],
    [
      "adverbial",
      adverbialIndex >= predicateEnd ? words.slice(adverbialIndex) : []
    ]
  ];

  return slices
    .filter(([, segmentWords]) => segmentWords.length > 0)
    .map(([role, segmentWords]) => ({ role, words: segmentWords }));
}

function detectPronunciationFeatures(words: WordAnalysis[]) {
  const features: PronunciationFeature[] = [];
  words.forEach((word, index) => {
    if (word.pronunciationNote) {
      features.push({
        label: word.stress === "弱读" ? "弱读" : "发音",
        detail: `${word.text}: ${word.pronunciationNote}`,
        wordIndexes: [index]
      });
    }
  });

  for (let index = 0; index < words.length - 1; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    if (
      /[bcdfghjklmnpqrstvwxyz]$/i.test(current.normalized) &&
      /^[aeiou]/i.test(next.normalized)
    ) {
      features.push({
        label: "连读",
        detail: `${current.text}‿${next.text}，辅音自然连接后面的元音`,
        wordIndexes: [index, index + 1]
      });
    }
  }

  return features.slice(0, 4);
}

export function analyzeEnglishSentence(text: string): SentenceAnalysis {
  const words = cleanWords(text).map(fallbackWord);
  return {
    segments: splitRoles(words),
    pronunciationFeatures: detectPronunciationFeatures(words)
  };
}
