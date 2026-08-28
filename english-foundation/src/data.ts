export type Word = {
  id: string
  word: string
  phonetic: string
  part: string
  meaning: string
  example: string
  exampleZh: string
  family: string[]
  memory: string
}

export type Sentence = {
  id: string
  text: string
  translation: string
  pattern: string
  scene: string
  chunks: { text: string; role: string; tone: string }[]
  scramble: string[]
}

export type GrammarLesson = {
  id: string
  title: string
  subtitle: string
  level: string
  rule: string
  contrast: { wrong: string; right: string; note: string }
  question: string
  options: string[]
  answer: number
  explanation: string
}

export const words: Word[] = [
  {
    id: 'confident',
    word: 'confident',
    phonetic: '/ˈkɒn.fɪ.dənt/',
    part: 'adj.',
    meaning: '自信的；有把握的',
    example: 'I feel more confident when I speak slowly.',
    exampleZh: '当我慢慢说时，我会更自信。',
    family: ['confidence n.', 'confidently adv.'],
    memory: 'con（一起）+ fid（相信）→ 相信自己',
  },
  {
    id: 'improve',
    word: 'improve',
    phonetic: '/ɪmˈpruːv/',
    part: 'v.',
    meaning: '改善；提高',
    example: 'A little practice every day will improve your English.',
    exampleZh: '每天练习一点会提高你的英语。',
    family: ['improvement n.', 'improved adj.'],
    memory: '把现状向前推进，就是 improve',
  },
  {
    id: 'habit',
    word: 'habit',
    phonetic: '/ˈhæb.ɪt/',
    part: 'n.',
    meaning: '习惯',
    example: 'Reading aloud is a useful learning habit.',
    exampleZh: '大声朗读是一个有用的学习习惯。',
    family: ['habitual adj.', 'habitually adv.'],
    memory: '反复发生并稳定下来的行为',
  },
  {
    id: 'explain',
    word: 'explain',
    phonetic: '/ɪkˈspleɪn/',
    part: 'v.',
    meaning: '解释；说明',
    example: 'Could you explain this rule again?',
    exampleZh: '你能再解释一次这条规则吗？',
    family: ['explanation n.', 'explanatory adj.'],
    memory: 'ex（向外）+ plain（清楚）→ 讲清楚',
  },
  {
    id: 'instead',
    word: 'instead',
    phonetic: '/ɪnˈsted/',
    part: 'adv.',
    meaning: '代替；反而',
    example: 'Do not translate every word; understand the idea instead.',
    exampleZh: '不要逐字翻译，试着理解意思。',
    family: ['instead of prep.'],
    memory: 'in its stead = 处在它的位置上',
  },
]

export const sentences: Sentence[] = [
  {
    id: 'daily-progress',
    text: 'A little practice every day will improve your English.',
    translation: '每天练习一点会提高你的英语。',
    pattern: '主语 + will + 动词原形 + 宾语',
    scene: '表达持续行动带来的未来结果',
    chunks: [
      { text: 'A little practice', role: '主语', tone: 'subject' },
      { text: 'every day', role: '时间状语', tone: 'time' },
      { text: 'will improve', role: '谓语', tone: 'verb' },
      { text: 'your English', role: '宾语', tone: 'object' },
    ],
    scramble: ['your English.', 'will improve', 'A little practice', 'every day'],
  },
  {
    id: 'ask-again',
    text: 'Could you explain this rule again?',
    translation: '你能再解释一次这条规则吗？',
    pattern: 'Could you + 动词原形 + 宾语？',
    scene: '礼貌地请求对方重复解释',
    chunks: [
      { text: 'Could you', role: '礼貌请求', tone: 'subject' },
      { text: 'explain', role: '谓语', tone: 'verb' },
      { text: 'this rule', role: '宾语', tone: 'object' },
      { text: 'again', role: '频率状语', tone: 'time' },
    ],
    scramble: ['this rule', 'Could you', 'again?', 'explain'],
  },
  {
    id: 'slow-speaking',
    text: 'I feel more confident when I speak slowly.',
    translation: '当我慢慢说时，我会更自信。',
    pattern: '主句 + when + 时间状语从句',
    scene: '描述某个条件下的感受变化',
    chunks: [
      { text: 'I', role: '主语', tone: 'subject' },
      { text: 'feel more confident', role: '系表结构', tone: 'verb' },
      { text: 'when', role: '连接词', tone: 'time' },
      { text: 'I speak slowly', role: '时间从句', tone: 'object' },
    ],
    scramble: ['when', 'I feel more confident', 'I speak slowly.'],
  },
]

export const grammarLessons: GrammarLesson[] = [
  {
    id: 'present-simple',
    title: '一般现在时',
    subtitle: '说习惯、事实和长期状态',
    level: '基础 · 必会',
    rule: '主语是 he / she / it 时，肯定句中的实义动词通常加 -s 或 -es。',
    contrast: {
      wrong: 'She practice English every day.',
      right: 'She practices English every day.',
      note: '主语 She 是第三人称单数，practice 要变为 practices。',
    },
    question: 'My brother ___ English after dinner.',
    options: ['study', 'studies', 'is study'],
    answer: 1,
    explanation: 'My brother 是第三人称单数，study 变 y 为 i，再加 -es。',
  },
  {
    id: 'articles',
    title: 'a / an / the',
    subtitle: '让名词的指代更清楚',
    level: '基础 · 高频',
    rule: '第一次提到的单数可数名词常用 a/an，再次提到或特指时用 the。',
    contrast: {
      wrong: 'I bought book. Book is useful.',
      right: 'I bought a book. The book is useful.',
      note: '首次出现用 a，再次指向同一本书时用 the。',
    },
    question: 'I saw ___ interesting film. ___ film was in English.',
    options: ['a / A', 'an / The', 'the / An'],
    answer: 1,
    explanation: 'interesting 以元音音素开头，用 an；第二次提到这部电影，用 the。',
  },
  {
    id: 'past-simple',
    title: '一般过去时',
    subtitle: '讲已经完成的过去事件',
    level: '基础 · 必会',
    rule: '明确发生在过去并已经结束的动作使用过去式，规则动词通常加 -ed。',
    contrast: {
      wrong: 'Yesterday I watch an English video.',
      right: 'Yesterday I watched an English video.',
      note: 'Yesterday 明确指向过去，watch 要使用过去式 watched。',
    },
    question: 'We ___ the lesson last night.',
    options: ['review', 'reviewed', 'are reviewing'],
    answer: 1,
    explanation: 'last night 是明确的过去时间，使用 reviewed。',
  },
]
