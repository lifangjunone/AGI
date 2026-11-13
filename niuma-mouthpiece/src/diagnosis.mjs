const categories = [
  {
    id: "deadline_ambush",
    name: "临下班投喂型",
    title: "需求火葬场守夜人",
    monster: "加急需求兽",
    keywords: ["下班", "今晚", "明早", "临时", "加急", "上线", "ddl", "deadline", "马上"],
    score: 91,
    game: "smash",
    comfort: "你不是效率低，是对方把时间当可再生资源。",
    roast: [
      "收到，我会尝试在物理时间之外开辟一条需求专线。",
      "这个需求确实很小，小到刚好压垮一个成年人的精神稳定。",
      "明早要可以，建议今晚先把地球自转调慢一点。"
    ],
    civilized: "我理解这个需求很急，但当前排期需要重新确认优先级和交付风险，否则容易影响质量。",
    share: "今天的我不是在加班，是在给时间管理学做尸检。"
  },
  {
    id: "requirement_drift",
    name: "需求漂移型",
    title: "混沌需求翻译官",
    monster: "五彩斑斓的黑洞",
    keywords: ["需求", "改", "感觉", "不对", "高级", "五彩斑斓", "方向", "再想想", "优化", "参考"],
    score: 86,
    game: "shred",
    comfort: "你不是没理解需求，是需求本人还没理解自己。",
    roast: [
      "好的，我会继续把抽象感觉翻译成人类可执行动作。",
      "这不是需求变更，这是需求在进行无规则布朗运动。",
      "如果方向还不对，可能需要先给方向本身办个身份证。"
    ],
    civilized: "为了避免反复返工，我建议先把目标、边界、验收标准写清楚后再进入实现。",
    share: "我今天不是在改方案，是在给混沌宇宙做产品经理。"
  },
  {
    id: "meeting_swallow",
    name: "会议吞噬型",
    title: "同步地狱巡逻员",
    monster: "对齐章鱼",
    keywords: ["会议", "开会", "同步", "对齐", "复盘", "拉通", "会", "沟通", "讨论"],
    score: 78,
    game: "pop",
    comfort: "你没有不工作，你只是被工作前的仪式消耗了。",
    roast: [
      "我们简单同步一下，然后复杂浪费一整天。",
      "好的，我会把今天的产出定义为：参加了产出讨论会。",
      "对齐得很好，除了事情本身还没开始。"
    ],
    civilized: "建议这次会议先明确决策项和负责人，能异步确认的内容就不用占用大家整块时间。",
    share: "今日产出：把椅子坐热，把灵魂开静音。"
  },
  {
    id: "weekly_report",
    name: "周报折磨型",
    title: "价值包装工程师",
    monster: "周报打印机",
    keywords: ["周报", "日报", "汇报", "总结", "价值", "亮点", "沉淀", "思考", "复盘"],
    score: 74,
    game: "shred",
    comfort: "写不出来不是你没产出，是人类语言承载不了你的疲惫。",
    roast: [
      "本周最大亮点：在持续崩溃边缘保持了基础礼貌。",
      "已完成闭环：从不想写周报，到真的写完周报。",
      "沉淀了一些经验，主要是下次别沉淀了。"
    ],
    civilized: "本周重点可以按目标、进展、风险、下周动作四块表达，避免为了包装而增加无效信息。",
    share: "本周最大产出：活着，并且没有在文档里写出真心话。"
  },
  {
    id: "blame_shift",
    name: "同事甩锅型",
    title: "锅具回收站站长",
    monster: "甩锅飞盘",
    keywords: ["甩锅", "背锅", "不是我", "你跟", "责任", "锅", "怪我", "之前", "交接"],
    score: 89,
    game: "smash",
    comfort: "锅从天上来，不代表你必须接得优雅。",
    roast: [
      "这个锅的飞行轨迹很优美，但落点不应是我。",
      "建议先查一下责任链路，不要靠空气动力学分配问题。",
      "我愿意协助解决问题，但不接受无证驾驶式甩锅。"
    ],
    civilized: "我可以一起推进修复，但需要先基于记录确认责任边界和下一步分工。",
    share: "今日技能升级：徒手接锅，但拒绝入味。"
  },
  {
    id: "pua_growth",
    name: "加班合理化型",
    title: "成长型损耗电池",
    monster: "画饼压路机",
    keywords: ["成长", "锻炼", "年轻人", "公司不会亏待", "格局", "奉献", "创业", "抗压", "机会"],
    score: 84,
    game: "pop",
    comfort: "成长可以需要努力，但不该以消耗为燃料。",
    roast: [
      "谢谢机会，建议机会也偶尔结一下加班费。",
      "格局已经打开了，钱包和睡眠还没跟上。",
      "年轻人确实要锻炼，但不是拿工位当健身房。"
    ],
    civilized: "我愿意承担有价值的挑战，同时也希望工作量、回报和恢复时间能被合理评估。",
    share: "今日成长：学会了在画饼里识别空气成分。"
  },
  {
    id: "silent_reply",
    name: "已读不回型",
    title: "消息瓶漂流员",
    monster: "已读幽灵",
    keywords: ["已读", "不回", "没人回", "在吗", "消息", "等回复", "群里", "确认", "催"],
    score: 76,
    game: "pop",
    comfort: "你不是焦虑，是关键路径被别人拿去冬眠了。",
    roast: [
      "收到我的消息了吗？如果收到了，麻烦也收一下责任。",
      "我这边流程已经推进到等待奇迹发生。",
      "已读是一种状态，不是一种交付。"
    ],
    civilized: "这个节点需要明确回复才能继续推进，麻烦今天内确认结论或给出新的负责人。",
    share: "今日我在等回复，像在互联网海边捞一枚针。"
  },
  {
    id: "default",
    name: "精神稳定伪装型",
    title: "情绪稳定临时演员",
    monster: "收到木偶",
    keywords: [],
    score: 69,
    game: "smash",
    comfort: "你今天不是情绪不稳定，你是在正常响应异常输入。",
    roast: [
      "好的收到，我的精神状态也已读不回。",
      "问题不大，只是人类形态暂时需要维护。",
      "我会保持专业，直到专业先离开我。"
    ],
    civilized: "我会先确认优先级和可交付范围，再给出具体时间。",
    share: "今天的我看起来正常，主要是因为公司没装心率弹幕。"
  }
];

const intensifiers = ["崩", "疯", "气", "烦", "累", "哭", "无语", "离谱", "服了", "想辞职", "破防", "爆炸"];
const privacyPatterns = [
  /1[3-9]\d{9}/g,
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
  /\b\d{15,18}[\dXx]?\b/g
];

export function sanitizeInput(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .slice(0, 220)
    .trim();
}

export function redactSensitiveText(input) {
  let text = sanitizeInput(input);
  for (const pattern of privacyPatterns) {
    text = text.replace(pattern, "[已打码]");
  }
  return text;
}

export function diagnose(rawInput, random = Math.random) {
  const text = redactSensitiveText(rawInput);
  const lower = text.toLowerCase();
  const ranked = categories.map((category) => {
    const hits = category.keywords.filter((keyword) => lower.includes(keyword.toLowerCase())).length;
    return { category, hits };
  }).sort((left, right) => right.hits - left.hits);

  const matched = ranked[0]?.hits > 0 ? ranked[0].category : categories.at(-1);
  const intensity = intensifiers.filter((word) => lower.includes(word)).length;
  const lengthBonus = Math.min(8, Math.floor(text.length / 24));
  const score = Math.max(30, Math.min(99, matched.score + intensity * 3 + lengthBonus - (matched.id === "default" ? 0 : 2)));
  const roast = matched.roast[Math.floor(random() * matched.roast.length)] || matched.roast[0];
  const survival = Math.max(3, Math.min(96, 112 - score + Math.floor(random() * 9)));

  return {
    input: text,
    categoryId: matched.id,
    angerType: matched.name,
    angerScore: score,
    title: matched.title,
    monster: matched.monster,
    comfort: matched.comfort,
    roast,
    civilized: matched.civilized,
    shareText: matched.share,
    game: matched.game,
    survival,
    disclaimer: "娱乐解压，不是医疗或法律建议；请勿输入真实姓名、公司机密或联系方式。"
  };
}

export { categories };
