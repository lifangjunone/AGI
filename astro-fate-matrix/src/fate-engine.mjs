const ZODIAC_SIGNS = [
  { key: "aries", name: "白羊座", start: [3, 21], element: "火象", mode: "开创", traits: ["直接", "行动快", "敢争取"] },
  { key: "taurus", name: "金牛座", start: [4, 20], element: "土象", mode: "固定", traits: ["稳定", "重质感", "慢热"] },
  { key: "gemini", name: "双子座", start: [5, 21], element: "风象", mode: "变动", traits: ["好奇", "会沟通", "节奏轻快"] },
  { key: "cancer", name: "巨蟹座", start: [6, 22], element: "水象", mode: "开创", traits: ["顾家", "共情强", "重安全感"] },
  { key: "leo", name: "狮子座", start: [7, 23], element: "火象", mode: "固定", traits: ["自信", "有舞台感", "保护欲强"] },
  { key: "virgo", name: "处女座", start: [8, 23], element: "土象", mode: "变动", traits: ["细致", "讲方法", "愿意服务"] },
  { key: "libra", name: "天秤座", start: [9, 23], element: "风象", mode: "开创", traits: ["审美好", "重关系", "会平衡"] },
  { key: "scorpio", name: "天蝎座", start: [10, 24], element: "水象", mode: "固定", traits: ["深情", "洞察强", "边界感强"] },
  { key: "sagittarius", name: "射手座", start: [11, 23], element: "火象", mode: "变动", traits: ["自由", "乐观", "爱探索"] },
  { key: "capricorn", name: "摩羯座", start: [12, 22], element: "土象", mode: "开创", traits: ["可靠", "有目标", "抗压"] },
  { key: "aquarius", name: "水瓶座", start: [1, 20], element: "风象", mode: "固定", traits: ["独立", "有未来感", "不爱套路"] },
  { key: "pisces", name: "双鱼座", start: [2, 19], element: "水象", mode: "变动", traits: ["浪漫", "直觉强", "包容"] }
];

const CHINESE_ZODIAC = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const STEM_ELEMENT = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水"
};
const BRANCH_ANIMAL = {
  子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龙", 巳: "蛇", 午: "马", 未: "羊", 申: "猴", 酉: "鸡", 戌: "狗", 亥: "猪"
};
const ELEMENT_COMPAT = {
  木: ["火", "水"],
  火: ["土", "木"],
  土: ["金", "火"],
  金: ["水", "土"],
  水: ["木", "金"]
};
const ELEMENT_TO_SIGNS = {
  木: ["双子座", "天秤座", "水瓶座"],
  火: ["白羊座", "狮子座", "射手座"],
  土: ["金牛座", "处女座", "摩羯座"],
  金: ["金牛座", "天秤座", "摩羯座"],
  水: ["巨蟹座", "天蝎座", "双鱼座"]
};
const ELEMENT_TO_ANIMALS = {
  木: ["虎", "兔"],
  火: ["蛇", "马"],
  土: ["牛", "龙", "羊", "狗"],
  金: ["猴", "鸡"],
  水: ["鼠", "猪"]
};
const BRANCH_ROMANCE = {
  申: "酉", 子: "酉", 辰: "酉",
  寅: "卯", 午: "卯", 戌: "卯",
  巳: "午", 酉: "午", 丑: "午",
  亥: "子", 卯: "子", 未: "子"
};
const BRANCH_DIRECTION = {
  子: { direction: "正北", provinces: ["北京", "天津", "河北", "内蒙古"] },
  丑: { direction: "东北偏北", provinces: ["辽宁", "吉林", "黑龙江"] },
  寅: { direction: "东北", provinces: ["辽宁", "吉林", "黑龙江"] },
  卯: { direction: "正东", provinces: ["上海", "江苏", "浙江", "山东"] },
  辰: { direction: "东南偏东", provinces: ["福建", "浙江", "台湾"] },
  巳: { direction: "东南", provinces: ["福建", "广东", "海南"] },
  午: { direction: "正南", provinces: ["广东", "广西", "海南"] },
  未: { direction: "西南偏南", provinces: ["云南", "贵州", "四川"] },
  申: { direction: "西南", provinces: ["四川", "重庆", "云南", "贵州"] },
  酉: { direction: "正西", provinces: ["陕西", "甘肃", "宁夏", "青海"] },
  戌: { direction: "西北偏西", provinces: ["新疆", "甘肃", "宁夏"] },
  亥: { direction: "西北", provinces: ["新疆", "青海", "内蒙古"] }
};
const SHICHEN = [
  { branch: "子", label: "子时", range: "23:00-00:59", time: "00:00", aliases: ["子", "子时", "夜半", "午夜"] },
  { branch: "丑", label: "丑时", range: "01:00-02:59", time: "01:00", aliases: ["丑", "丑时"] },
  { branch: "寅", label: "寅时", range: "03:00-04:59", time: "03:00", aliases: ["寅", "寅时"] },
  { branch: "卯", label: "卯时", range: "05:00-06:59", time: "05:00", aliases: ["卯", "卯时"] },
  { branch: "辰", label: "辰时", range: "07:00-08:59", time: "07:00", aliases: ["辰", "辰时"] },
  { branch: "巳", label: "巳时", range: "09:00-10:59", time: "09:00", aliases: ["巳", "巳时"] },
  { branch: "午", label: "午时", range: "11:00-12:59", time: "11:00", aliases: ["午", "午时", "中午"] },
  { branch: "未", label: "未时", range: "13:00-14:59", time: "13:00", aliases: ["未", "未时"] },
  { branch: "申", label: "申时", range: "15:00-16:59", time: "15:00", aliases: ["申", "申时"] },
  { branch: "酉", label: "酉时", range: "17:00-18:59", time: "17:00", aliases: ["酉", "酉时"] },
  { branch: "戌", label: "戌时", range: "19:00-20:59", time: "19:00", aliases: ["戌", "戌时"] },
  { branch: "亥", label: "亥时", range: "21:00-22:59", time: "21:00", aliases: ["亥", "亥时"] }
];

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function normalizeBirthDate(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/);
  if (!match) match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) throw new Error("invalid_birth_date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("invalid_birth_date");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeBirthTime(value) {
  const raw = String(value || "12:00").trim();
  const compact = raw.replace(/\s+/g, "");
  const shichen = SHICHEN.find((item) => item.aliases.includes(compact));
  if (shichen) {
    return {
      time: shichen.time,
      label: `${shichen.label}（${shichen.range}）`,
      precision: "shichen",
      branch: shichen.branch
    };
  }
  let match = compact.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) match = compact.match(/^(\d{1,2})[点时](?:(\d{1,2})分?)?$/);
  if (!match) throw new Error("invalid_birth_time");
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("invalid_birth_time");
  }
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { time, label: time, precision: "exact", branch: BRANCHES[positiveModulo(Math.floor((hour + 1) / 2), 12)] };
}

function parseBirthDate(input) {
  const birthDate = normalizeBirthDate(input.birthDate);
  const birthTime = normalizeBirthTime(input.birthTime);
  const date = new Date(`${birthDate}T${birthTime.time}:00`);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_birth_datetime");
  return date;
}

export function westernZodiac(month, day) {
  const ordered = [...ZODIAC_SIGNS].sort((a, b) => a.start[0] - b.start[0] || a.start[1] - b.start[1]);
  let sign = ordered[ordered.length - 1];
  for (const item of ordered) {
    const [m, d] = item.start;
    if (month > m || (month === m && day >= d)) sign = item;
  }
  return sign;
}

export function approximateAscendant(month, day, birthTime = "12:00", longitude = 116.4) {
  const sun = westernZodiac(month, day);
  const sunIndex = ZODIAC_SIGNS.findIndex((item) => item.key === sun.key);
  const [hoursRaw, minutesRaw] = String(birthTime || "12:00").split(":").map(Number);
  const hours = Number.isFinite(hoursRaw) ? hoursRaw : 12;
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 0;
  const localSolarOffsetHours = (Number(longitude || 116.4) - 120) / 15;
  const decimalHour = hours + minutes / 60 + localSolarOffsetHours;
  const ascIndex = positiveModulo(sunIndex + Math.floor((decimalHour + 6) / 2), 12);
  return {
    ...ZODIAC_SIGNS[ascIndex],
    note: "上升星座为基于出生时间和经度的轻量近似值，适合娱乐与产品原型；严肃占星需接入精确星历。"
  };
}

export function ganzhiYear(year) {
  const offset = year - 1984;
  return `${STEMS[positiveModulo(offset, 10)]}${BRANCHES[positiveModulo(offset, 12)]}`;
}

function ganzhiByIndex(index) {
  return `${STEMS[positiveModulo(index, 10)]}${BRANCHES[positiveModulo(index, 12)]}`;
}

export function approximateBazi(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const yearPillar = ganzhiYear(year);
  const monthPillar = ganzhiByIndex((year - 1984) * 12 + month + 1);
  const dayBase = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  const dayPillar = ganzhiByIndex(dayBase + 40);
  const hourBranchIndex = positiveModulo(Math.floor((hour + 1) / 2), 12);
  const dayStemIndex = STEMS.indexOf(dayPillar[0]);
  const hourStemIndex = positiveModulo(dayStemIndex * 2 + hourBranchIndex, 10);
  const hourPillar = `${STEMS[hourStemIndex]}${BRANCHES[hourBranchIndex]}`;
  const pillars = [yearPillar, monthPillar, dayPillar, hourPillar];
  const elements = pillars.map((pillar) => STEM_ELEMENT[pillar[0]]);
  const counts = Object.fromEntries(["木", "火", "土", "金", "水"].map((element) => [element, 0]));
  for (const element of elements) counts[element] += 1;
  const dominantElement = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const supportiveElements = ELEMENT_COMPAT[dominantElement];
  return {
    pillars: { year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar },
    elements: counts,
    dominantElement,
    supportiveElements,
    yearAnimal: BRANCH_ANIMAL[yearPillar[1]],
    note: "八字为按公历日期推导的轻量近似版，未做节气换年和真太阳时校正。"
  };
}

export function romanceBranchFromYearBranch(yearBranch) {
  return BRANCH_ROMANCE[yearBranch] || "酉";
}

export function nextYearsForBranch(targetBranch, startYear = new Date().getFullYear(), count = 3) {
  const years = [];
  for (let year = startYear; years.length < count && year < startYear + 80; year += 1) {
    if (ganzhiYear(year)[1] === targetBranch) years.push(year);
  }
  return years;
}

function scoreCompatibility(sign, ascendant, bazi) {
  const signs = new Set();
  for (const element of bazi.supportiveElements) {
    for (const signName of ELEMENT_TO_SIGNS[element] || []) signs.add(signName);
  }
  if (sign.element === ascendant.element) {
    for (const item of ZODIAC_SIGNS.filter((candidate) => candidate.element === sign.element)) signs.add(item.name);
  }
  return [...signs].slice(0, 5);
}

function compatibleAnimals(bazi) {
  const animals = new Set();
  for (const element of bazi.supportiveElements) {
    for (const animal of ELEMENT_TO_ANIMALS[element] || []) animals.add(animal);
  }
  const yearIndex = CHINESE_ZODIAC.indexOf(bazi.yearAnimal);
  for (const offset of [4, 8]) animals.add(CHINESE_ZODIAC[positiveModulo(yearIndex + offset, 12)]);
  return [...animals].slice(0, 6);
}

export function buildFortune(input, now = new Date()) {
  const date = parseBirthDate(input);
  const normalizedBirthDate = normalizeBirthDate(input.birthDate);
  const normalizedBirthTime = normalizeBirthTime(input.birthTime);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const sign = westernZodiac(month, day);
  const ascendant = approximateAscendant(month, day, normalizedBirthTime.time, input.longitude);
  const bazi = approximateBazi(date);
  const romanceBranch = romanceBranchFromYearBranch(bazi.pillars.year[1]);
  const romanceYears = nextYearsForBranch(romanceBranch, now.getFullYear(), 4);
  const direction = BRANCH_DIRECTION[romanceBranch];
  const bestSigns = scoreCompatibility(sign, ascendant, bazi);
  const bestAnimals = compatibleAnimals(bazi);
  const name = String(input.name || "你").trim().slice(0, 24) || "你";
  const relationshipGoal = String(input.relationshipGoal || "寻找长期、稳定且有心动感的关系").slice(0, 80);
  return {
    subject: {
      name,
      birthDate: normalizedBirthDate,
      birthTime: normalizedBirthTime.label,
      birthTimePrecision: normalizedBirthTime.precision,
      birthPlace: String(input.birthPlace || "未填写").slice(0, 60),
      latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : null,
      longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : null,
      gender: String(input.gender || "未填写").slice(0, 20),
      relationshipGoal
    },
    astrology: {
      sunSign: sign,
      ascendant,
      personalityBlend: `${sign.name}的核心动力叠加${ascendant.name}的外在气质：${sign.traits[0]}、${ascendant.traits[0]}，容易给人一种“${sign.element}内核、${ascendant.element}表达”的感觉。`
    },
    bazi,
    compatibility: {
      bestSigns,
      bestAnimals,
      logic: `以八字主气 ${bazi.dominantElement} 为基础，优先补 ${bazi.supportiveElements.join("、")}；再参考太阳/上升星座的元素互动。`
    },
    romance: {
      peachBlossomBranch: romanceBranch,
      peachBlossomAnimal: BRANCH_ANIMAL[romanceBranch],
      peachBlossomYears: romanceYears,
      direction: direction.direction,
      provinces: direction.provinces,
      reading: `${name}的桃花位落在${direction.direction}，更容易在${direction.provinces.join("、")}相关的人脉、旅行、工作协作或线上地域连接中出现缘分信号。`
    },
    disclaimer: "本报告用于娱乐和自我观察，不应替代现实沟通、专业咨询或重大人生决策。"
  };
}

export function buildModelPrompt(fortune, professional = null) {
  const professionalInstruction = professional?.available
    ? "如果传入 professional 专业引擎结果，请把紫微斗数、奇门遁甲作为“专业合参”单独成段，但不要夸大确定性。"
    : "如果 professional 专业引擎不可用，请如实说明当前是基础星座/八字规则报告。";
  return [
    {
      role: "system",
      content: [
        "你是一个中文多维度命理网站的报告撰写助手。",
        "你会基于传入的结构化计算结果写温柔、克制、有画面感的解读。",
        "不要声称绝对预测，不要制造恐惧，不要给医疗/法律/投资建议。",
        "输出 Markdown，包含：总览、星座画像、匹配对象、姻缘节奏、桃花方位、专业合参、行动建议。",
        professionalInstruction,
        "控制在 900 字以内。"
      ].join("")
    },
    {
      role: "user",
      content: `请根据这份结构化命理结果生成报告：\n${JSON.stringify({ fortune, professional }, null, 2)}`
    }
  ];
}
