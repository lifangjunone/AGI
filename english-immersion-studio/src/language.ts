import { createReply, type Persona, type Scenario, type ScenarioId } from "./data";
import { supplementalIpa } from "./supplemental-ipa";
import { supplementalMeanings } from "./supplemental-lexicon";

export type Difficulty = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type SubtitleMode = "english" | "none" | "en-zh" | "zh-en" | "chinese";

export type LocalizedLine = {
  english: string;
  chinese: string;
};

export const difficultyProfiles: Array<{
  id: Difficulty;
  name: string;
  descriptor: string;
  target: string;
}> = [
  { id: "A1", name: "入门", descriptor: "短句与高频词", target: "用一个完整短句回答" },
  { id: "A2", name: "基础", descriptor: "日常任务表达", target: "补充时间、地点或数量" },
  { id: "B1", name: "进阶", descriptor: "连续说明观点", target: "用 because 说明原因" },
  { id: "B2", name: "流利", descriptor: "自然追问与细节", target: "给出观点、证据和结果" },
  { id: "C1", name: "专业", descriptor: "精确且有层次", target: "表达保留意见与细微差别" },
  { id: "C2", name: "精通", descriptor: "高压真实语境", target: "自然处理隐含含义与反问" }
];

export const subtitleModes: Array<{
  id: SubtitleMode;
  label: string;
  shortLabel: string;
}> = [
  { id: "english", label: "纯英文字幕", shortLabel: "EN" },
  { id: "none", label: "无字幕", shortLabel: "OFF" },
  { id: "en-zh", label: "英语在上 · 汉语在下", shortLabel: "EN / 中" },
  { id: "zh-en", label: "汉语在上 · 英语在下", shortLabel: "中 / EN" },
  { id: "chinese", label: "纯汉语字幕", shortLabel: "中" }
];

const simpleOpenings: Record<ScenarioId, LocalizedLine> = {
  interview: {
    english: "Good morning. Please tell me about yourself.",
    chinese: "早上好。请介绍一下你自己。"
  },
  restaurant: {
    english: "Good evening. Are you ready to order?",
    chinese: "晚上好。您准备好点餐了吗？"
  },
  hotel: {
    english: "Welcome. What name is your booking under?",
    chinese: "欢迎光临。您的预订使用什么姓名？"
  },
  "small-talk": {
    english: "Hi. Is this your first time here?",
    chinese: "你好。你是第一次来这里吗？"
  },
  clinic: {
    english: "Hello. Where does it hurt?",
    chinese: "你好。你哪里不舒服？"
  },
  airport: {
    english: "Good evening. Can I help you?",
    chinese: "晚上好。需要我帮忙吗？"
  }
};

const openingTranslations: Record<ScenarioId, string> = {
  interview: "早上好。我一直很期待见到你。我们从你最自豪的项目开始，好吗？",
  restaurant: "晚上好，欢迎光临。今晚由我为您服务。想听听主厨的推荐吗？",
  hotel: "欢迎来到 Meridian 酒店。请问您的预订姓名是什么？",
  "small-talk": "那看起来像是菜单上最好吃的。你也是第一次来这里吗？",
  clinic: "你好，我是 Claire Morgan 医生。慢慢说，告诉我哪里不舒服。",
  airport: "晚上好。我们很快就要起飞了。起飞前需要我帮您安顿好吗？"
};

const suggestionTranslations: Record<ScenarioId, string[]> = {
  interview: [
    "谢谢您给我这次机会。",
    "我最自豪的项目是……",
    "回答之前，我可以先确认一下目标吗？"
  ],
  restaurant: [
    "好的，您推荐什么？",
    "可以再给我几分钟吗？",
    "这道菜含有乳制品吗？"
  ],
  hotel: [
    "预订姓名是 Li。",
    "可以给我安排一间安静的房间吗？",
    "早餐几点供应？"
  ],
  "small-talk": [
    "确实是。你呢？",
    "我差点也点了同样的东西。",
    "你熟悉这个街区吗？"
  ],
  clinic: [
    "我从昨天开始头痛。",
    "晚上会更严重。",
    "您能解释一下接下来的步骤吗？"
  ],
  airport: [
    "可以给我一杯水吗？",
    "我的外套可以放在哪里？",
    "可以换座位吗？"
  ]
};

export function createOpening(
  scenario: Scenario,
  difficulty: Difficulty
): LocalizedLine {
  const translatedOpening =
    scenario.openingChinese ?? openingTranslations[scenario.id];
  if (difficulty === "A1") return simpleOpenings[scenario.id];
  if (difficulty === "A2") {
    return {
      english: scenario.opening.replace("I have been looking forward to meeting you. ", ""),
      chinese: translatedOpening
    };
  }
  if (difficulty === "B1") {
    return { english: scenario.opening, chinese: translatedOpening };
  }
  if (difficulty === "B2") {
    return {
      english: `I may ask you to explain your reasoning. ${scenario.opening}`,
      chinese: `我可能会请你解释理由。${translatedOpening}`
    };
  }
  if (difficulty === "C1") {
    return {
      english: `Let's make this realistic and precise, including the nuance behind your choices. ${scenario.opening}`,
      chinese: `让我们像真实交流一样准确，也说清选择背后的细微考量。${translatedOpening}`
    };
  }
  return {
    english: `I won't simplify the language, and I may challenge your assumptions as we speak. ${scenario.opening}`,
    chinese: `我不会简化语言，并会在对话中挑战你的隐含假设。${translatedOpening}`
  };
}

export function createSuggestions(
  scenario: Scenario,
  difficulty: Difficulty
): LocalizedLine[] {
  return scenario.suggestions.map((english, index) => {
    const chinese =
      scenario.suggestionChinese?.[index] ??
      suggestionTranslations[scenario.id][index];
    if (difficulty === "C1") {
      return {
        english: `To put that in context, ${english.charAt(0).toLowerCase()}${english.slice(1)}`,
        chinese: `结合具体情况来说，${chinese}`
      };
    }
    if (difficulty === "C2") {
      return {
        english: `If I may frame this more precisely, ${english.charAt(0).toLowerCase()}${english.slice(1)}`,
        chinese: `如果可以更准确地表述，${chinese}`
      };
    }
    return { english, chinese };
  });
}

function translateReply(input: string, scenario: Scenario, persona: Persona) {
  const text = input.toLowerCase();
  if (text.includes("recommend")) {
    return scenario.id === "restaurant"
      ? "海鲈鱼清淡鲜美，蘑菇烩饭则更加浓郁。今晚你更想要哪种感觉？"
      : "我建议你先说结果，再说明挑战和你的决策。你的工作具体带来了什么变化？";
  }
  if (text.includes("quiet room")) {
    return "当然。我找到了一间远离电梯的高楼层客房。你喜欢城市景观还是花园景观？";
  }
  if (text.includes("proud") || text.includes("project")) {
    return "这听起来很重要。请给我一个你亲自做出决策的具体例子，并说明你如何衡量它的影响。";
  }
  if (text.includes("water") || text.includes("jacket")) {
    return "当然，我马上为你处理。还有什么能让你的旅程更舒适吗？";
  }
  if (text.includes("headache") || text.includes("pain")) {
    return "我明白了。按一到十分计算，疼痛有多强？你是否注意到什么会让它减轻或加重？";
  }
  if (/thank|thanks/.test(text)) {
    return `不客气。你的表达很自然。继续之前，你想了解关于“${scenario.title}”的什么信息？`;
  }
  return `${persona.name.split(" ")[0]} 微笑着说：“开头很清楚。再告诉我一点，并补充一个具体细节，让我能想象当时的情景。”`;
}

export function createReplyLine(
  input: string,
  scenario: Scenario,
  persona: Persona,
  difficulty: Difficulty
): LocalizedLine {
  const baseEnglish = createReply(input, scenario, persona);
  const baseChinese = translateReply(input, scenario, persona);
  if (difficulty === "A1") {
    return {
      english: "Good. Please tell me one more detail.",
      chinese: "很好。请再告诉我一个细节。"
    };
  }
  if (difficulty === "A2" || difficulty === "B1") {
    return { english: baseEnglish, chinese: baseChinese };
  }
  if (difficulty === "B2") {
    return {
      english: `That's a solid answer. ${baseEnglish}`,
      chinese: `这是一个扎实的回答。${baseChinese}`
    };
  }
  if (difficulty === "C1") {
    return {
      english: `Your answer is clear, though I'd like greater precision. ${baseEnglish}`,
      chinese: `你的回答很清楚，不过我希望表达更加精确。${baseChinese}`
    };
  }
  return {
    english: `A credible response, but let's test its nuance and implicit assumptions. ${baseEnglish}`,
    chinese: `回答可信，但让我们进一步检验其中的细微差别和隐含假设。${baseChinese}`
  };
}

export function subtitleLines(line: LocalizedLine, mode: SubtitleMode) {
  if (mode === "none") return [];
  if (mode === "english") return [{ lang: "en", text: line.english }];
  if (mode === "chinese") return [{ lang: "zh", text: line.chinese }];
  if (mode === "en-zh") {
    return [
      { lang: "en", text: line.english },
      { lang: "zh", text: line.chinese }
    ];
  }
  return [
    { lang: "zh", text: line.chinese },
    { lang: "en", text: line.english }
  ];
}

export function splitSentences(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return (
    normalized.match(/[^.!?。！？]+(?:[.!?。！？]+["'”’]?)?|[^.!?。！？]+$/gu) ??
    [normalized]
  ).map((sentence) => sentence.trim());
}

export function splitLocalizedLine(line: LocalizedLine): LocalizedLine[] {
  const english = splitSentences(line.english);
  const chinese = splitSentences(line.chinese);
  return english.map((sentence, index) => ({
    english: sentence,
    chinese: chinese[index] ?? ""
  }));
}

type LexiconEntry = { ipa: string; meaning: string; part: string };
type WordFormation = {
  root: string;
  rootMeaning: string;
  formation: string;
};

type WordUsage = {
  phrase: string;
  exampleEnglish: string;
  exampleChinese: string;
};

const wordUsage: Record<string, WordUsage> = {
  opportunity: {
    phrase: "an opportunity to do something · 做某事的机会",
    exampleEnglish: "This is a good opportunity to learn.",
    exampleChinese: "这是一个很好的学习机会。"
  },
  slightly: {
    phrase: "slightly different · 略有不同",
    exampleEnglish: "I feel slightly better today.",
    exampleChinese: "我今天感觉稍微好一些。"
  },
  nauseous: {
    phrase: "feel nauseous · 感到恶心",
    exampleEnglish: "I felt nauseous this morning.",
    exampleChinese: "我今天早上感到恶心。"
  },
  vision: {
    phrase: "normal vision · 视力正常",
    exampleEnglish: "My vision is normal.",
    exampleChinese: "我的视力正常。"
  },
  available: {
    phrase: "be available · 可用；有空",
    exampleEnglish: "A quiet room is available.",
    exampleChinese: "现在有一间安静的房间。"
  },
  recommend: {
    phrase: "recommend something to someone · 向某人推荐某物",
    exampleEnglish: "What dish would you recommend?",
    exampleChinese: "您会推荐哪道菜？"
  },
  decision: {
    phrase: "make a decision · 做决定",
    exampleEnglish: "We need to make a decision today.",
    exampleChinese: "我们今天需要做出决定。"
  },
  experience: {
    phrase: "learn from experience · 从经验中学习",
    exampleEnglish: "I learned a lot from that experience.",
    exampleChinese: "我从那次经历中学到了很多。"
  },
  improve: {
    phrase: "improve quickly · 快速改善",
    exampleEnglish: "Your English will improve with practice.",
    exampleChinese: "通过练习，你的英语会有所提高。"
  },
  result: {
    phrase: "as a result · 因此；结果是",
    exampleEnglish: "The result was better than expected.",
    exampleChinese: "结果比预期更好。"
  }
};

const lexicon: Record<string, LexiconEntry> = {
  a: { ipa: "/ə/", meaning: "一个；一项", part: "冠词" },
  about: { ipa: "/əˈbaʊt/", meaning: "关于", part: "介词" },
  actually: { ipa: "/ˈæktʃuəli/", meaning: "实际上", part: "副词" },
  almost: { ipa: "/ˈɔːlmoʊst/", meaning: "差一点；几乎", part: "副词" },
  am: { ipa: "/æm/", meaning: "是（用于 I）", part: "动词" },
  any: { ipa: "/ˈeni/", meaning: "任何；一些", part: "限定词" },
  as: { ipa: "/æz/", meaning: "在……时；作为", part: "连词" },
  and: { ipa: "/ænd/", meaning: "并且", part: "连词" },
  answer: { ipa: "/ˈɑːnsər/", meaning: "回答", part: "名词/动词" },
  are: { ipa: "/ɑːr/", meaning: "是；处于", part: "动词" },
  ask: { ipa: "/æsk/", meaning: "询问", part: "动词" },
  assumptions: { ipa: "/əˈsʌmpʃənz/", meaning: "假设", part: "名词" },
  been: { ipa: "/bɪn/", meaning: "曾经；已经", part: "助动词" },
  be: { ipa: "/biː/", meaning: "是；处于", part: "动词" },
  before: { ipa: "/bɪˈfɔːr/", meaning: "在……之前", part: "介词" },
  behind: { ipa: "/bɪˈhaɪnd/", meaning: "在……背后", part: "介词" },
  best: { ipa: "/best/", meaning: "最好的", part: "形容词" },
  begin: { ipa: "/bɪˈɡɪn/", meaning: "开始", part: "动词" },
  booking: { ipa: "/ˈbʊkɪŋ/", meaning: "预订", part: "名词" },
  breakfast: { ipa: "/ˈbrekfəst/", meaning: "早餐", part: "名词" },
  but: { ipa: "/bʌt/", meaning: "但是", part: "连词" },
  can: { ipa: "/kæn/", meaning: "可以；能够", part: "情态动词" },
  care: { ipa: "/ker/", meaning: "照顾；服务", part: "动词" },
  change: { ipa: "/tʃeɪndʒ/", meaning: "更换；改变", part: "动词" },
  challenge: { ipa: "/ˈtʃælɪndʒ/", meaning: "质疑；挑战", part: "动词" },
  "chef's": { ipa: "/ʃefs/", meaning: "主厨的", part: "所有格" },
  claire: { ipa: "/kler/", meaning: "克莱尔（人名）", part: "专有名词" },
  clarify: { ipa: "/ˈklærəfaɪ/", meaning: "澄清；确认", part: "动词" },
  choices: { ipa: "/ˈtʃɔɪsɪz/", meaning: "选择", part: "名词" },
  clear: { ipa: "/klɪr/", meaning: "清楚的", part: "形容词" },
  contain: { ipa: "/kənˈteɪn/", meaning: "含有", part: "动词" },
  context: { ipa: "/ˈkɑːntekst/", meaning: "具体背景；语境", part: "名词" },
  could: { ipa: "/kʊd/", meaning: "可以（礼貌请求）", part: "情态动词" },
  dairy: { ipa: "/ˈderi/", meaning: "乳制品", part: "名词" },
  departing: { ipa: "/dɪˈpɑːrtɪŋ/", meaning: "即将起飞", part: "动词" },
  detail: { ipa: "/ˈdiːteɪl/", meaning: "细节", part: "名词" },
  dish: { ipa: "/dɪʃ/", meaning: "菜品", part: "名词" },
  do: { ipa: "/duː/", meaning: "做；用于疑问句", part: "动词" },
  does: { ipa: "/dʌz/", meaning: "用于第三人称疑问", part: "助动词" },
  dr: { ipa: "/ˈdɑːktər/", meaning: "医生（称谓）", part: "名词" },
  evening: { ipa: "/ˈiːvnɪŋ/", meaning: "晚上", part: "名词" },
  explain: { ipa: "/ɪkˈspleɪn/", meaning: "解释", part: "动词" },
  few: { ipa: "/fjuː/", meaning: "几个；少量", part: "限定词" },
  first: { ipa: "/fɜːrst/", meaning: "第一；首先", part: "形容词" },
  for: { ipa: "/fɔːr/", meaning: "为了；给", part: "介词" },
  forward: { ipa: "/ˈfɔːrwərd/", meaning: "向前；期待", part: "副词" },
  frame: { ipa: "/freɪm/", meaning: "组织；表述", part: "动词" },
  gets: { ipa: "/ɡets/", meaning: "变得", part: "动词" },
  glass: { ipa: "/ɡlæs/", meaning: "一杯", part: "名词" },
  good: { ipa: "/ɡʊd/", meaning: "好的", part: "形容词" },
  goal: { ipa: "/ɡoʊl/", meaning: "目标", part: "名词" },
  had: { ipa: "/hæd/", meaning: "已经；有过", part: "助动词" },
  has: { ipa: "/hæz/", meaning: "已经；有", part: "助动词" },
  have: { ipa: "/hæv/", meaning: "有；已经", part: "动词" },
  having: { ipa: "/ˈhævɪŋ/", meaning: "给予；安排", part: "动词" },
  headache: { ipa: "/ˈhedeɪk/", meaning: "头痛", part: "名词" },
  hear: { ipa: "/hɪr/", meaning: "听取；听见", part: "动词" },
  help: { ipa: "/help/", meaning: "帮助", part: "动词" },
  hello: { ipa: "/həˈloʊ/", meaning: "你好", part: "感叹词" },
  here: { ipa: "/hɪr/", meaning: "这里", part: "副词" },
  hi: { ipa: "/haɪ/", meaning: "你好", part: "感叹词" },
  how: { ipa: "/haʊ/", meaning: "怎样；如何", part: "疑问词" },
  hurt: { ipa: "/hɜːrt/", meaning: "疼痛", part: "动词" },
  i: { ipa: "/aɪ/", meaning: "我", part: "代词" },
  "i'd": { ipa: "/aɪd/", meaning: "我想要；我会", part: "缩写" },
  if: { ipa: "/ɪf/", meaning: "如果；是否", part: "连词" },
  in: { ipa: "/ɪn/", meaning: "在……里面", part: "介词" },
  including: { ipa: "/ɪnˈkluːdɪŋ/", meaning: "包括", part: "介词" },
  is: { ipa: "/ɪz/", meaning: "是", part: "动词" },
  it: { ipa: "/ɪt/", meaning: "它；这件事", part: "代词" },
  jacket: { ipa: "/ˈdʒækɪt/", meaning: "外套", part: "名词" },
  know: { ipa: "/noʊ/", meaning: "了解；知道", part: "动词" },
  language: { ipa: "/ˈlæŋɡwɪdʒ/", meaning: "语言", part: "名词" },
  "let's": { ipa: "/lets/", meaning: "让我们", part: "缩写" },
  li: { ipa: "/liː/", meaning: "李（姓名）", part: "专有名词" },
  like: { ipa: "/laɪk/", meaning: "喜欢；想要", part: "动词" },
  looking: { ipa: "/ˈlʊkɪŋ/", meaning: "期待；看", part: "动词" },
  looks: { ipa: "/lʊks/", meaning: "看起来", part: "动词" },
  make: { ipa: "/meɪk/", meaning: "使得；进行", part: "动词" },
  may: { ipa: "/meɪ/", meaning: "可能；可以", part: "情态动词" },
  me: { ipa: "/miː/", meaning: "我（宾格）", part: "代词" },
  menu: { ipa: "/ˈmenjuː/", meaning: "菜单", part: "名词" },
  meridian: { ipa: "/məˈrɪdiən/", meaning: "Meridian（酒店名）", part: "专有名词" },
  meeting: { ipa: "/ˈmiːtɪŋ/", meaning: "见面", part: "动词" },
  minutes: { ipa: "/ˈmɪnɪts/", meaning: "分钟", part: "名词" },
  more: { ipa: "/mɔːr/", meaning: "更多；再", part: "限定词" },
  morning: { ipa: "/ˈmɔːrnɪŋ/", meaning: "早晨", part: "名词" },
  morgan: { ipa: "/ˈmɔːrɡən/", meaning: "Morgan（姓氏）", part: "专有名词" },
  most: { ipa: "/moʊst/", meaning: "最", part: "副词" },
  my: { ipa: "/maɪ/", meaning: "我的", part: "限定词" },
  name: { ipa: "/neɪm/", meaning: "姓名", part: "名词" },
  neighborhood: { ipa: "/ˈneɪbərhʊd/", meaning: "街区", part: "名词" },
  next: { ipa: "/nekst/", meaning: "接下来的", part: "形容词" },
  nuance: { ipa: "/ˈnuːɑːns/", meaning: "细微差别", part: "名词" },
  of: { ipa: "/əv/", meaning: "……的", part: "介词" },
  on: { ipa: "/ɑːn/", meaning: "在……上；以……名义", part: "介词" },
  one: { ipa: "/wʌn/", meaning: "一个", part: "数词" },
  order: { ipa: "/ˈɔːrdər/", meaning: "点餐；订单", part: "动词/名词" },
  ordered: { ipa: "/ˈɔːrdərd/", meaning: "点了（餐）", part: "动词" },
  our: { ipa: "/aʊər/", meaning: "我们的", part: "限定词" },
  please: { ipa: "/pliːz/", meaning: "请", part: "副词" },
  possible: { ipa: "/ˈpɑːsəbəl/", meaning: "可能的；可行的", part: "形容词" },
  precise: { ipa: "/prɪˈsaɪs/", meaning: "精确的", part: "形容词" },
  precisely: { ipa: "/prɪˈsaɪsli/", meaning: "准确地", part: "副词" },
  project: { ipa: "/ˈprɑːdʒekt/", meaning: "项目", part: "名词" },
  proud: { ipa: "/praʊd/", meaning: "自豪的", part: "形容词" },
  put: { ipa: "/pʊt/", meaning: "放置；表述", part: "动词" },
  quiet: { ipa: "/ˈkwaɪət/", meaning: "安静的", part: "形容词" },
  ready: { ipa: "/ˈredi/", meaning: "准备好的", part: "形容词" },
  recommend: { ipa: "/ˌrekəˈmend/", meaning: "推荐", part: "动词" },
  recommendations: { ipa: "/ˌrekəmenˈdeɪʃənz/", meaning: "推荐菜品", part: "名词" },
  reasoning: { ipa: "/ˈriːzənɪŋ/", meaning: "推理；理由", part: "名词" },
  realistic: { ipa: "/ˌriːəˈlɪstɪk/", meaning: "真实的", part: "形容词" },
  reservation: { ipa: "/ˌrezərˈveɪʃən/", meaning: "预订", part: "名词" },
  request: { ipa: "/rɪˈkwest/", meaning: "请求", part: "动词/名词" },
  room: { ipa: "/ruːm/", meaning: "房间", part: "名词" },
  same: { ipa: "/seɪm/", meaning: "相同的", part: "形容词" },
  seats: { ipa: "/siːts/", meaning: "座位", part: "名词" },
  served: { ipa: "/sɜːrvd/", meaning: "供应", part: "动词" },
  settle: { ipa: "/ˈsetəl/", meaning: "安顿", part: "动词" },
  shall: { ipa: "/ʃæl/", meaning: "要不要；将", part: "情态动词" },
  shortly: { ipa: "/ˈʃɔːrtli/", meaning: "很快", part: "副词" },
  simplify: { ipa: "/ˈsɪmpləfaɪ/", meaning: "简化", part: "动词" },
  since: { ipa: "/sɪns/", meaning: "自从", part: "介词" },
  speak: { ipa: "/spiːk/", meaning: "说话；交谈", part: "动词" },
  steps: { ipa: "/steps/", meaning: "步骤", part: "名词" },
  take: { ipa: "/teɪk/", meaning: "花费；拿取", part: "动词" },
  takeoff: { ipa: "/ˈteɪkɔːf/", meaning: "起飞", part: "名词" },
  taking: { ipa: "/ˈteɪkɪŋ/", meaning: "负责；照顾", part: "动词" },
  tell: { ipa: "/tel/", meaning: "告诉", part: "动词" },
  thank: { ipa: "/θæŋk/", meaning: "感谢", part: "动词" },
  that: { ipa: "/ðæt/", meaning: "那；那个", part: "代词" },
  the: { ipa: "/ðə/", meaning: "这个；特指", part: "冠词" },
  thing: { ipa: "/θɪŋ/", meaning: "事物；东西", part: "名词" },
  this: { ipa: "/ðɪs/", meaning: "这个", part: "代词" },
  time: { ipa: "/taɪm/", meaning: "时间；次数", part: "名词" },
  to: { ipa: "/tə/", meaning: "向；去；用于不定式", part: "介词" },
  tonight: { ipa: "/təˈnaɪt/", meaning: "今晚", part: "副词" },
  too: { ipa: "/tuː/", meaning: "也", part: "副词" },
  troubling: { ipa: "/ˈtrʌbəlɪŋ/", meaning: "使人不适；困扰", part: "动词" },
  under: { ipa: "/ˈʌndər/", meaning: "以……名义", part: "介词" },
  water: { ipa: "/ˈwɔːtər/", meaning: "水", part: "名词" },
  we: { ipa: "/wiː/", meaning: "我们", part: "代词" },
  welcome: { ipa: "/ˈwelkəm/", meaning: "欢迎", part: "感叹词" },
  well: { ipa: "/wel/", meaning: "熟悉地；很好", part: "副词" },
  what: { ipa: "/wʌt/", meaning: "什么", part: "疑问词" },
  where: { ipa: "/wer/", meaning: "哪里", part: "疑问词" },
  will: { ipa: "/wɪl/", meaning: "将会", part: "情态动词" },
  with: { ipa: "/wɪð/", meaning: "和；带着", part: "介词" },
  "won't": { ipa: "/woʊnt/", meaning: "不会", part: "缩写" },
  worse: { ipa: "/wɜːrs/", meaning: "更严重的", part: "形容词" },
  would: { ipa: "/wʊd/", meaning: "愿意；会", part: "情态动词" },
  yes: { ipa: "/jes/", meaning: "是的", part: "副词" },
  yesterday: { ipa: "/ˈjestərdeɪ/", meaning: "昨天", part: "副词" },
  you: { ipa: "/juː/", meaning: "你；您", part: "代词" },
  your: { ipa: "/jʊr/", meaning: "你的；您的", part: "限定词" },
  yourself: { ipa: "/jərˈself/", meaning: "你自己", part: "代词" }
};

const contextualPhrases: Array<{
  tokens: string[];
  label: string;
  meanings: string[];
}> = [
  {
    tokens: ["looking", "forward", "to"],
    label: "look forward to · 期待",
    meanings: ["期待（固定搭配的一部分）", "期待（不表示“向前”）", "后接名词或动名词"]
  },
  {
    tokens: ["have", "been", "looking"],
    label: "现在完成进行时",
    meanings: ["构成完成时", "构成持续状态", "一直期待"]
  },
  {
    tokens: ["proud", "of"],
    label: "be proud of · 为……自豪",
    meanings: ["为……感到自豪", "引出自豪的对象"]
  },
  {
    tokens: ["may", "ask"],
    label: "may ask · 可能会要求",
    meanings: ["可能会，降低语气强度", "要求；请对方说明"]
  },
  {
    tokens: ["challenge", "your", "assumptions"],
    label: "challenge assumptions · 质疑假设",
    meanings: ["质疑，而不是普通“挑战”", "你的", "尚未明说的前提假设"]
  },
  {
    tokens: ["as", "we", "speak"],
    label: "as we speak · 在交谈过程中",
    meanings: ["当……时", "我们", "正在交谈"]
  },
  {
    tokens: ["booking", "under"],
    label: "booking under · 以某姓名预订",
    meanings: ["酒店预订", "以……姓名登记"]
  },
  {
    tokens: ["taking", "care", "of"],
    label: "take care of · 负责接待",
    meanings: ["正在负责", "照顾；服务", "连接服务对象"]
  },
  {
    tokens: ["ready", "to", "order"],
    label: "ready to order · 准备点餐",
    meanings: ["准备好的", "连接将要进行的动作", "点餐"]
  },
  {
    tokens: ["could", "i"],
    label: "Could I…? · 礼貌请求",
    meanings: ["可以吗（比 can 更礼貌）", "我"]
  },
  {
    tokens: ["would", "you", "like"],
    label: "Would you like…? · 礼貌询问意愿",
    meanings: ["是否愿意", "您", "想要"]
  },
  {
    tokens: ["in", "context"],
    label: "in context · 结合具体情况",
    meanings: ["在……之中", "具体背景"]
  },
  {
    tokens: ["if", "i", "may"],
    label: "If I may… · 委婉提出观点",
    meanings: ["如果", "我", "可以的话"]
  }
];

const wordFormations: Record<string, WordFormation> = {
  assumptions: {
    root: "assume",
    rootMeaning: "认为；假设",
    formation: "assume + -tion（名词）+ -s（复数）"
  },
  booking: {
    root: "book",
    rootMeaning: "预订",
    formation: "book + -ing（名词）"
  },
  choices: {
    root: "choose",
    rootMeaning: "选择",
    formation: "choose → choice + -s（复数）"
  },
  departing: {
    root: "depart",
    rootMeaning: "离开；出发",
    formation: "depart + -ing（进行）"
  },
  including: {
    root: "include",
    rootMeaning: "包括",
    formation: "include + -ing"
  },
  looking: {
    root: "look",
    rootMeaning: "看；寻找",
    formation: "look + -ing（进行）"
  },
  meeting: {
    root: "meet",
    rootMeaning: "见面",
    formation: "meet + -ing（动名词）"
  },
  neighborhood: {
    root: "neighbor",
    rootMeaning: "邻居；邻近",
    formation: "neighbor + -hood（区域/状态）"
  },
  ordered: {
    root: "order",
    rootMeaning: "点餐；订购",
    formation: "order + -ed（过去式）"
  },
  precisely: {
    root: "precise",
    rootMeaning: "精确的",
    formation: "precise + -ly（副词）"
  },
  reasoning: {
    root: "reason",
    rootMeaning: "理由；推理",
    formation: "reason + -ing（过程/能力）"
  },
  realistic: {
    root: "real",
    rootMeaning: "真实的",
    formation: "real + -istic（具有……特征）"
  },
  recommendations: {
    root: "recommend",
    rootMeaning: "推荐",
    formation: "recommend + -ation（名词）+ -s（复数）"
  },
  served: {
    root: "serve",
    rootMeaning: "服务；供应",
    formation: "serve + -ed（过去分词）"
  },
  simplify: {
    root: "simple",
    rootMeaning: "简单的",
    formation: "simple + -ify（使……化）"
  },
  taking: {
    root: "take",
    rootMeaning: "拿取；承担",
    formation: "take + -ing（进行）"
  },
  troubling: {
    root: "trouble",
    rootMeaning: "麻烦；困扰",
    formation: "trouble + -ing（进行）"
  }
};

function getWordFormation(
  normalized: string,
  entry: LexiconEntry
): WordFormation {
  if (normalized.endsWith("ly") && normalized.length > 4) {
    const root = normalized.slice(0, -2);
    const rootMeaning =
      lexicon[root]?.meaning ?? supplementalMeanings[root];
    if (rootMeaning) {
      return {
        root,
        rootMeaning,
        formation: `${root} + -ly（副词后缀：以……方式）`
      };
    }
  }
  return (
    wordFormations[normalized] ?? {
      root: normalized,
      rootMeaning: entry.meaning,
      formation: "基础词，无需拆分词缀"
    }
  );
}

function inferSupplementalPart(word: string) {
  if (word.endsWith("ly")) return "副词";
  if (/(tion|sion|ment|ness|ity|ance|ence|ship|ism)$/.test(word)) {
    return "名词";
  }
  if (/(ous|ful|less|able|ible|al|ive|ic)$/.test(word)) {
    return "形容词";
  }
  if (word.endsWith("ing") || word.endsWith("ed")) return "动词";
  return "常用词";
}

export function analyzeWords(sentence: string) {
  const words = (sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).map((raw) => {
    const key = raw.toLowerCase();
    const supplementalMeaning = supplementalMeanings[key];
    const entry =
      lexicon[key] ??
      (supplementalMeaning
        ? {
            ipa: supplementalIpa[key] || "点击扬声器听发音",
            meaning: supplementalMeaning,
            part: inferSupplementalPart(key)
          }
        : {
            ipa: "点击扬声器听发音",
            meaning: /^[A-Z]/.test(raw)
              ? `${raw}（名称）`
              : "该词词义尚未收录",
            part: /^[A-Z]/.test(raw) ? "专有名词" : "待补充"
          });
    return {
      word: raw,
      normalized: key,
      phrase: wordUsage[key]?.phrase ?? "",
      exampleEnglish: wordUsage[key]?.exampleEnglish ?? sentence,
      exampleChinese: wordUsage[key]?.exampleChinese ?? "",
      ...entry,
      ...getWordFormation(key, entry)
    };
  });

  contextualPhrases.forEach((phrase) => {
    for (let start = 0; start <= words.length - phrase.tokens.length; start += 1) {
      const candidate = words
        .slice(start, start + phrase.tokens.length)
        .map((word) => word.normalized);
      if (candidate.join(" ") !== phrase.tokens.join(" ")) continue;
      phrase.tokens.forEach((_token, offset) => {
        words[start + offset].meaning = phrase.meanings[offset];
        words[start + offset].phrase = phrase.label;
      });
    }
  });

  words.forEach((word, index) => {
    if (word.phrase) return;
    const start = Math.max(0, index - 1);
    const end = Math.min(words.length, index + 2);
    word.phrase = `${words
      .slice(start, end)
      .map((item) => item.word)
      .join(" ")} · 本句搭配`;
  });

  return words;
}

export function analyzeStructure(sentence: string) {
  const normalized = sentence.trim();
  const lower = normalized.toLowerCase();
  const sentenceUnits = splitSentences(normalized);
  const question = sentenceUnits.length === 1 && normalized.endsWith("?");
  const hasQuestion = sentenceUnits.some((unit) => unit.endsWith("?"));
  const hasModal = /\b(can|could|would|may|shall|should)\b/.test(lower);
  const hasPerfect = /\b(have|has|had)\b.+\b\w+(ed|en)\b/.test(lower);
  const hasConnector = /\b(because|although|however|but|and)\b/.test(lower);
  const clauses = sentenceUnits.flatMap((clause) => {
      const rawWords = clause.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
      const words = rawWords.flatMap((word) => {
        const contraction = word.toLowerCase();
        if (contraction === "that's") return ["That", "is"];
        if (contraction === "it's") return ["It", "is"];
        if (contraction === "i'm") return ["I", "am"];
        if (contraction === "you're") return ["You", "are"];
        if (contraction === "we're") return ["We", "are"];
        if (contraction === "i've") return ["I", "have"];
        if (contraction === "i'd") return ["I", "would"];
        return [word];
      });
      if (!words.length) return [];
      const clauseQuestion = clause.endsWith("?");
      const clauseHasModal = /\b(can|could|would|may|shall|should)\b/i.test(clause);
      const subjectIndex = words.findIndex((word) =>
        /^(i|you|we|they|he|she|it|this|that)$/i.test(word)
      );
      const segments: Array<{ text: string; role: string }> = [];
      if (subjectIndex < 0) {
        return [{ text: words.join(" "), role: "寒暄/话语标记" }];
      }
      if (subjectIndex > 0) {
        const lead = words.slice(0, subjectIndex);
        segments.push({
          text: lead.join(" "),
          role: lead.some((word) =>
            /^(can|could|would|may|shall|should|do|does|did|is|are|am|what|where|how)$/i.test(
              word
            )
          )
            ? "疑问/助动"
            : "引导/语境"
        });
      }
      segments.push({ text: words[subjectIndex], role: "主语" });

      const leadHasLinkingVerb = words
        .slice(0, subjectIndex)
        .some((word) => /^(am|is|are|was|were)$/i.test(word));
      const predicateStart = subjectIndex + 1;
      let predicateEnd = predicateStart;
      if (!leadHasLinkingVerb && predicateStart < words.length) {
        if (
          /^(have|has|had)$/i.test(words[predicateStart]) &&
          /^(been)$/i.test(words[predicateStart + 1] ?? "")
        ) {
          predicateEnd = Math.min(predicateStart + 3, words.length);
          if (
            /^(forward)$/i.test(words[predicateEnd] ?? "") &&
            /^(to)$/i.test(words[predicateEnd + 1] ?? "")
          ) {
            predicateEnd += 2;
          }
        } else if (
          /^(can|could|would|may|shall|should|will)$/i.test(
            words[predicateStart]
          )
        ) {
          predicateEnd = Math.min(predicateStart + 2, words.length);
        } else {
          predicateEnd = Math.min(predicateStart + 1, words.length);
        }
      }
      if (predicateEnd > predicateStart) {
        segments.push({
          text: words.slice(predicateStart, predicateEnd).join(" "),
          role: clauseQuestion && clauseHasModal ? "核心谓语" : "谓语"
        });
      }

      const complementStart = predicateEnd;
      if (complementStart < words.length) {
        const predicateText = words
          .slice(predicateStart, predicateEnd)
          .join(" ")
          .toLowerCase();
        const firstComplement = words[complementStart].toLowerCase();
        segments.push({
          text: words.slice(complementStart).join(" "),
          role:
            leadHasLinkingVerb ||
            /^(am|is|are|was|were|look|looks|seem|feel)$/.test(predicateText)
              ? "表语"
              : /^(in|on|at|for|with|about|from|under|as|because|when|where)$/.test(
                    firstComplement
                  )
                ? "状语/补充"
                : "宾语/补充"
        });
      }
      return segments;
    });
  const structuralRoles = clauses
    .map((segment) => segment.role)
    .filter((role) => !/引导|寒暄/.test(role));
  const subject = clauses.find((segment) => segment.role === "主语")?.text;
  const predicate = clauses.find((segment) => /谓语/.test(segment.role))?.text;
  const tail = clauses.find((segment) =>
    /宾语|表语|状语|补充/.test(segment.role)
  )?.text;

  return {
    sentenceType:
      sentenceUnits.length > 1
        ? `${sentenceUnits.length} 句对话语段`
        : question
          ? "疑问句"
          : "陈述句",
    tense:
      hasPerfect && hasQuestion
        ? "完成时 + 情态问句"
        : hasPerfect
          ? "完成时"
          : /\b(will|shall)\b/.test(lower)
            ? "将来表达"
            : "一般现在时",
    pattern: sentenceUnits.length > 1
      ? "背景说明 + 角色态度 + 互动追问"
      : question
      ? hasModal
        ? "情态动词 + 主语 + 动词 + 补充信息"
        : "疑问词/助动词 + 主语 + 谓语"
      : hasConnector
        ? "主句 + 连接词 + 扩展分句"
        : "主语 + 谓语 + 补充信息",
    note: hasConnector
      ? "连接词让观点之间的逻辑关系更清楚。"
      : "先找到主语和核心动词，再理解后面的补充信息。",
    segments: clauses,
    skeleton: structuralRoles.length
      ? structuralRoles.join(" + ")
      : "核心表达",
    imitation: `${subject ?? "[谁/什么]"} + ${
      predicate ?? "[做什么/是什么]"
    } + ${tail ? "[替换最后的具体信息]" : "[补充具体信息]"}`,
    memoryTip:
      subject && predicate
        ? `先记住核心“${subject} ${predicate}”，再替换后面的内容，就能快速造出同类句。`
        : "把这句当作一个完整语块记忆，先模仿语调，再替换其中的关键词。"
  };
}
