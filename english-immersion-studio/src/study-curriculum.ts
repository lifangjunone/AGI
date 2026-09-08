import {
  analyzeStructure,
  analyzeWords,
  splitLocalizedLine,
  type LocalizedLine
} from "./language";
import type { ListeningLine } from "./listening-dialogues";

export type StudyModule =
  | "words"
  | "structures"
  | "grammar"
  | "phrases"
  | "collocations";

export type StudyWord = ReturnType<typeof analyzeWords>[number] & {
  id: string;
  context: LocalizedLine;
};

export type StudyStructure = {
  id: string;
  line: LocalizedLine;
  analysis: ReturnType<typeof analyzeStructure>;
};

export type StudyGrammar = {
  id: string;
  title: string;
  formula: string;
  explanation: string;
  line: LocalizedLine;
};

export type StudyPhrase = {
  id: string;
  text: string;
  category: string;
  explanation: string;
  line: LocalizedLine;
};

export type StudyCurriculum = {
  words: StudyWord[];
  structures: StudyStructure[];
  grammar: StudyGrammar[];
  phrases: StudyPhrase[];
  collocations: StudyPhrase[];
};

const wordStopList = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at",
  "for", "with", "is", "am", "are", "was", "were", "be", "been", "being",
  "i", "you", "we", "they", "he", "she", "it", "this", "that", "my",
  "your", "our", "their", "me", "us", "them", "do", "does", "did", "have",
  "has", "had", "will", "would", "can", "could", "may", "might", "shall",
  "should", "what", "where", "when", "why", "how", "who", "which"
]);

const grammarPatterns: Array<{
  id: string;
  title: string;
  formula: string;
  explanation: string;
  pattern: RegExp;
}> = [
  {
    id: "polite-question",
    title: "情态动词礼貌问句",
    formula: "Could / Would / May + 主语 + 动词原形 ...?",
    explanation: "用情态动词降低语气强度，使请求或提问更礼貌、更适合真实服务和职场场景。",
    pattern: /^(could|would|may)\b.+\?$/i
  },
  {
    id: "by-gerund",
    title: "by + 动名词表示方式",
    formula: "by + V-ing",
    explanation: "by 后接动名词，说明完成动作所采用的方式、步骤或手段。",
    pattern: /\bby\s+[a-z]+ing\b/i
  },
  {
    id: "present-perfect",
    title: "完成时连接过去与现在",
    formula: "have / has + 过去分词",
    explanation: "强调过去发生的经历、动作或状态与现在仍有联系。",
    pattern: /\b(have|has)\s+(been\s+)?(had|taken|learned|noticed|found|reached|worked|lived|[a-z]+ed)\b/i
  },
  {
    id: "relative-clause",
    title: "关系从句补充信息",
    formula: "名词 + that / who / which + 从句",
    explanation: "关系词连接名词和补充说明，使表达更紧凑，避免拆成多个短句。",
    pattern: /\b(that|who|which)\b/i
  },
  {
    id: "conditional",
    title: "if 条件表达",
    formula: "if + 条件，主句",
    explanation: "if 引出条件，主句说明该条件成立时的结果、建议或行动。",
    pattern: /\bif\b/i
  },
  {
    id: "passive",
    title: "被动语态突出结果",
    formula: "be + 过去分词",
    explanation: "不强调执行者，而把注意力放在接受动作的人或事物以及最终结果上。",
    pattern: /\b(am|is|are|was|were|be|been)\s+(needed|served|measured|released|seated|related|expected|prepared|located|included)\b/i
  },
  {
    id: "infinitive",
    title: "不定式说明目的或后续动作",
    formula: "to + 动词原形",
    explanation: "不定式常用于补充目的、计划、意愿或前一个动词之后的动作。",
    pattern: /\bto\s+(work|learn|make|solve|meet|order|share|help|explain|join|change|stretch|listen|do|go|take|prepare|test)\b/i
  },
  {
    id: "connector",
    title: "连接词组织逻辑",
    formula: "主句 + because / but / so / although + 分句",
    explanation: "连接词明确原因、转折或结果，让较长回答更有逻辑。",
    pattern: /\b(because|although|however|but|so)\b/i
  }
];

const phrasePrepositions: Record<string, string> = {
  about: "引出谈论的主题",
  after: "表示时间先后",
  at: "表示具体位置、时间点或目标",
  before: "表示某动作之前",
  by: "表示方式、位置或变化幅度",
  during: "表示某段时间之内",
  for: "表示对象、目的或持续时间",
  from: "表示来源、起点或范围",
  in: "表示范围、状态或位置",
  on: "表示位置、时间或依托对象",
  under: "表示登记名称或所属关系",
  with: "表示伴随、工具或附带信息",
  without: "表示缺少某人或某物"
};

const fixedCollocationPatterns: Array<{
  pattern: RegExp;
  text: string;
  explanation: string;
}> = [
  {
    pattern: /\b(getting|get|got)\s+used\s+to\b/i,
    text: "get used to · 习惯于",
    explanation: "to 在这里是介词，后接名词或动名词，表示逐渐适应某事。"
  },
  {
    pattern: /\bas\s+long\s+as\b/i,
    text: "as long as · 只要",
    explanation: "引出必要条件，说明满足该条件时主句结果成立。"
  },
  {
    pattern: /\bunder\s+the\s+name\b/i,
    text: "under the name · 以……姓名登记",
    explanation: "常用于酒店、餐厅和票务场景，说明预订所使用的姓名。"
  },
  {
    pattern: /\b(related)\s+to\b/i,
    text: "be related to · 与……有关",
    explanation: "related 与介词 to 固定搭配，用于说明关联原因或对象。"
  },
  {
    pattern: /\bon\s+a\s+scale\s+from\b/i,
    text: "on a scale from ... to ... · 按……到……的等级",
    explanation: "用于询问或描述可量化程度，常见于医疗和评价场景。"
  },
  {
    pattern: /\bplenty\s+of\b/i,
    text: "plenty of · 大量；充足的",
    explanation: "后接可数名词复数或不可数名词，表示数量充足。"
  },
  {
    pattern: /\bas\s+soon\s+as\b/i,
    text: "as soon as · 一……就……",
    explanation: "连接两个动作，强调前一个条件出现后立即发生后一个动作。"
  },
  {
    pattern: /\b(take|taking)\s+off\b|\btakeoff\b/i,
    text: "take off · 起飞；脱下",
    explanation: "在航班场景中表示飞机起飞，需要结合语境判断词义。"
  },
  {
    pattern: /\baway\s+from\b/i,
    text: "away from · 远离",
    explanation: "表示与某地点、物体或状态保持距离。"
  },
  {
    pattern: /\bhelp\s+\w+\s+with\b/i,
    text: "help someone with something · 帮某人处理某事",
    explanation: "help 后接人，with 再引出需要帮助的具体事情。"
  }
];

function flattenLines(lines: ListeningLine[]) {
  return lines.flatMap((line) =>
    splitLocalizedLine(line).map((sentence) => ({
      english: sentence.english,
      chinese: sentence.chinese
    }))
  );
}

function extractPhrases(line: LocalizedLine, lineIndex: number) {
  const tokens = line.english.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  const phrases: StudyPhrase[] = [];
  tokens.forEach((token, index) => {
    const key = token.toLowerCase();
    const explanation = phrasePrepositions[key];
    if (!explanation || index === tokens.length - 1) return;
    let end = Math.min(tokens.length, index + 5);
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      if (/^(and|but|so|because)$/i.test(tokens[cursor])) {
        end = cursor;
        break;
      }
    }
    const text = tokens.slice(index, end).join(" ");
    if (text.split(" ").length < 2) return;
    phrases.push({
      id: `phrase-${lineIndex}-${index}-${key}`,
      text,
      category: `${key} 介词语块`,
      explanation,
      line
    });
  });

  const modalMatch = line.english.match(
    /^(Could you|Would you|May I|Can I|Do you|How (?:do|did|would|will)|What (?:do|did|was|would)|Where (?:do|did|is))\b/i
  );
  if (modalMatch) {
    const text = tokens.slice(0, Math.min(tokens.length, 5)).join(" ");
    phrases.unshift({
      id: `phrase-${lineIndex}-opener`,
      text,
      category: "高频句首语块",
      explanation: "可整体记忆并替换后半句，用于快速发起提问或请求。",
      line
    });
  }
  return phrases;
}

export function buildStudyCurriculum(lines: ListeningLine[]): StudyCurriculum {
  const sentenceLines = flattenLines(lines);
  const wordMap = new Map<string, StudyWord>();
  const collocationMap = new Map<string, StudyPhrase>();
  const phraseMap = new Map<string, StudyPhrase>();
  const grammar: StudyGrammar[] = [];

  sentenceLines.forEach((line, lineIndex) => {
    const words = analyzeWords(line.english);
    words.forEach((word) => {
      if (
        wordStopList.has(word.normalized) ||
        word.normalized.length < 3 ||
        word.part === "专有名词"
      ) {
        return;
      }
      if (!wordMap.has(word.normalized)) {
        wordMap.set(word.normalized, {
          ...word,
          id: `word-${word.normalized}`,
          context: line
        });
      }
      if (word.phrase && !word.phrase.includes("本句搭配")) {
        const phraseKey = word.phrase.toLowerCase();
        if (!collocationMap.has(phraseKey)) {
          collocationMap.set(phraseKey, {
            id: `collocation-${word.normalized}-${lineIndex}`,
            text: word.phrase,
            category: "固定搭配",
            explanation: "作为完整语块记忆，使用时替换其中的人、事物或具体信息。",
            line
          });
        }
      }
    });

    fixedCollocationPatterns.forEach((collocation, patternIndex) => {
      if (!collocation.pattern.test(line.english)) return;
      const phraseKey = collocation.text.toLowerCase();
      if (collocationMap.has(phraseKey)) return;
      collocationMap.set(phraseKey, {
        id: `collocation-pattern-${patternIndex}-${lineIndex}`,
        text: collocation.text,
        category: "固定搭配",
        explanation: collocation.explanation,
        line
      });
    });

    extractPhrases(line, lineIndex).forEach((phrase) => {
      const key = phrase.text.toLowerCase();
      if (!phraseMap.has(key)) phraseMap.set(key, phrase);
    });

    grammarPatterns.forEach((rule) => {
      if (!rule.pattern.test(line.english)) return;
      grammar.push({
        id: `grammar-${rule.id}-${lineIndex}`,
        title: rule.title,
        formula: rule.formula,
        explanation: rule.explanation,
        line
      });
    });
  });

  return {
    words: [...wordMap.values()],
    structures: sentenceLines.map((line, index) => ({
      id: `structure-${index}`,
      line,
      analysis: analyzeStructure(line.english)
    })),
    grammar,
    phrases: [...phraseMap.values()],
    collocations: [...collocationMap.values()]
  };
}
