export type Locale = "zh-CN" | "en";

const copy = {
  "zh-CN": {
    today: "今日", discover: "遇见", messages: "消息", communities: "社群", customers: "客户",
    agent: "我的 Agent", hello: "你好", intro: "先处理需要你决定的事项，再去遇见值得认识的人。",
    attention: "需要你决定", matches: "值得认识的人", seeAll: "查看全部", explain: "为什么推荐",
    accept: "愿意认识", later: "稍后", active: "正在替你工作", quota: "本月用量",
    plaza: "广场", searchContacts: "搜索联系人或目标", createSearch: "创建持续寻找",
    lifeYouMeUser: "LifeYouMe 用户", defaultAgent: "我的 Agent", paused: "已暂停",
    viewProfile: "查看我的公开资料", accountSettings: "账号与 Agent 设置", logout: "退出登录",
    startAgent: "启动 Agent", pauseAgent: "暂停 Agent", saving: "正在保存…",
    search: "搜索成员和目标", notifications: "查看待处理事项", brandHome: "遇见 MeYou 首页",
    loadingTitle: "正在读取真实数据…", loadingDetail: "MeYou 不会用虚构资料填充你的工作台。",
    loadError: "暂时无法读取数据", retry: "请稍后重试", close: "关闭",
    morningNote: "晨间简报", headlineBefore: "替你守住了", headlineAccent: "开始沟通", headlineAfter: "的时间。",
    agentReplies: "次 Agent 回复", realMatches: "个真实匹配", pendingItems: "件待处理",
    productPartner: "产品伙伴", heartCandidate: "心动候选", customer: "客户",
    noDecisions: "目前没有待决定事项", noDecisionsDetail: "创建持续寻找或分享公开主页后，新匹配与访客消息会出现在这里。",
    handoff: "需要接管", mutualInterest: "双向心动", agentSuggestion: "Agent 建议",
    handleIntro: "处理介绍", viewConversation: "查看对话",
    noMatches: "还没有真实匹配", noMatchesDetail: "MeYou 只会展示数据库中真实存在、且模型判断相关的用户。",
    createDiscovery: "创建寻找", comingUp: "接下来", todayShort: "今天",
    noSchedule: "还没有真实日程", noScheduleDetail: "连接日历或在匹配后提出会面时间，日程才会显示在这里。",
    calendarUnavailable: "日历连接器未配置", calendarUnavailableDetail: "当前可在匹配后手动协商时间；授权连接器后再开放同步。",
    workingNow: "正在工作", pausedUpper: "已暂停", agentPausedDetail: "自动行动已暂停。你仍可查看现有对话与记录。",
    agentWorkingDetail: "正在留意新的社群成员，并接待你的公开主页访客。",
    currentTask: "当前任务", noMission: "暂无持续寻找", waitingMission: "等待你创建任务",
    lastScan: "上次扫描", workLog: "查看工作记录", matchFit: "契合",
    anonymousCandidate: "匿名心动候选", partner: "合作伙伴",
    mutualApproved: "双方 Agent 均认为值得认识", waitingAgent: "正在等待对方 Agent 判断",
    matchExplanation: "推荐来自硬条件、共同目标与双方 Agent 的边界核对，不包含颜值评分或付费排名。",
    confirming: "正在确认…", accepted: "已经同意", collapse: "收起说明",
    consentPending: "已表达意愿，等待对方确认", actionFailed: "操作失败，请稍后重试"
  },
  en: {
    today: "Today", discover: "Discover", messages: "Messages", communities: "Communities", customers: "Customers",
    agent: "My Agent", hello: "Hello", intro: "Review the things that need your decision, then meet people worth knowing.",
    attention: "Needs your decision", matches: "People worth meeting", seeAll: "See all", explain: "Why this match",
    accept: "Meet them", later: "Later", active: "Working for you", quota: "Monthly usage",
    plaza: "Plaza", searchContacts: "Search people or goals", createSearch: "Create a recurring search",
    lifeYouMeUser: "LifeYouMe user", defaultAgent: "My Agent", paused: "Paused",
    viewProfile: "View my public profile", accountSettings: "Account & Agent settings", logout: "Log out",
    startAgent: "Start Agent", pauseAgent: "Pause Agent", saving: "Saving…",
    search: "Search people and goals", notifications: "View pending items", brandHome: "MeYou home",
    loadingTitle: "Loading live data…", loadingDetail: "MeYou never fills your workspace with fictional profiles.",
    loadError: "Unable to load data", retry: "Please try again shortly.", close: "Close",
    morningNote: "Morning note", headlineBefore: "has kept your time free for", headlineAccent: "meaningful conversations", headlineAfter: ".",
    agentReplies: "Agent replies", realMatches: "real matches", pendingItems: "pending",
    productPartner: "Product partner", heartCandidate: "Potential match", customer: "Customer",
    noDecisions: "Nothing needs your decision", noDecisionsDetail: "New matches and visitor messages will appear here after you create a recurring search or share your public profile.",
    handoff: "Handoff needed", mutualInterest: "Mutual interest", agentSuggestion: "Agent suggestion",
    handleIntro: "Review introduction", viewConversation: "View conversation",
    noMatches: "No real matches yet", noMatchesDetail: "MeYou only shows real registered users that the model finds relevant.",
    createDiscovery: "Create a search", comingUp: "Coming up", todayShort: "Today",
    noSchedule: "No real events yet", noScheduleDetail: "Events appear here after you connect a calendar or propose a meeting time.",
    calendarUnavailable: "Calendar connector not configured", calendarUnavailableDetail: "You can coordinate times in chat now. Sync becomes available after a connector is authorized.",
    workingNow: "Working now", pausedUpper: "Paused", agentPausedDetail: "Automatic actions are paused. You can still review existing conversations and records.",
    agentWorkingDetail: "Actions follow your permissions, schedule, and usage limits. Being enabled does not mean the Agent is currently replying.",
    currentTask: "Current task", noMission: "No recurring search", waitingMission: "Waiting for you to create a task",
    lastScan: "Last scan", workLog: "View activity log", matchFit: "fit",
    anonymousCandidate: "Anonymous match", partner: "Potential partner",
    mutualApproved: "Both Agents agree this introduction is worthwhile", waitingAgent: "Waiting for the other Agent",
    matchExplanation: "This recommendation uses hard requirements, shared goals, and both Agents’ boundaries—never appearance scores or paid ranking.",
    confirming: "Confirming…", accepted: "Accepted", collapse: "Hide details",
    consentPending: "Interest sent. Waiting for the other person.", actionFailed: "Action failed. Please try again."
  }
} as const;

export function t(locale: Locale, key: keyof typeof copy["zh-CN"]) {
  return copy[locale][key];
}

export function displayAgentName(locale: Locale, name: string) {
  if (locale !== "en") return name;
  if (name === "我的 Agent") return "My Agent";
  const defaultName = name.match(/^(.+)的 Agent$/);
  return defaultName ? `${defaultName[1]}'s Agent` : name;
}

export function displayAgentHeadline(locale: Locale, headline: string) {
  if (locale === "en" && headline === "替我接住联系，并寻找真正值得认识的人。") {
    return "Handle incoming connections for me and find people genuinely worth meeting.";
  }
  return headline;
}

export function tr(locale: Locale, zh: string, en: string) {
  return locale === "zh-CN" ? zh : en;
}

const knownEnglishContent: Record<string, string> = {
  "LifeYouMe 用户": "LifeYouMe user",
  "AI 共创营": "AI Co-creation Camp",
  "做产品": "Building products",
  "创业者圆桌": "Founder Roundtable",
  "聊业务": "Business",
  "城市漫游局": "City Explorers",
  "找搭子": "Find companions",
  "心动花园": "Heart Garden",
  "谈对象": "Dating",
  "慢咖啡角": "Slow Coffee Corner",
  "闲谈": "Casual chat"
};

export function displayKnownContent(locale: Locale, value: string) {
  return locale === "en" ? knownEnglishContent[value] ?? value : value;
}
