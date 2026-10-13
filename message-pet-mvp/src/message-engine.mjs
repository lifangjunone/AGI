const PRIORITY_SCORE = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export function classifyMessage(message, preferences) {
  const importantPerson = preferences.importantPeople.includes(message.sender);
  const importantGroup = Boolean(
    message.group && preferences.importantGroups.includes(message.group),
  );
  const mentionedMe = Boolean(message.mentionedMe);
  const hasUrgentLanguage =
    /(紧急|立即|马上|尽快|截止|今天|阻塞|线上问题|事故|urgent|asap)/i.test(
      message.content,
    );

  let priority = "normal";
  const reasons = [];

  if (mentionedMe) reasons.push("@我");
  if (importantPerson) reasons.push("重要联系人");
  if (importantGroup) reasons.push("重要群");
  if (hasUrgentLanguage) reasons.push("含紧急事项");

  if (mentionedMe && (importantGroup || hasUrgentLanguage)) {
    priority = "critical";
  } else if (mentionedMe || importantPerson || hasUrgentLanguage) {
    priority = "high";
  } else if (importantGroup) {
    priority = "high";
  }

  return {
    ...message,
    priority,
    reasons,
    channelType: message.group ? "group" : "direct",
    importantPerson,
    importantGroup,
  };
}

export function extractTodo(message) {
  const actionablePriority = ["critical", "high"].includes(message.priority);
  const taskLike =
    message.mentionedMe ||
    /(请|需要|麻烦|记得|跟进|处理|完成|确认|回复|提交|修复|排查)/.test(
      message.content,
    );
  const completionNotice =
    /(已完成|已经完成|部署完成|构建成功|处理完毕|无需处理)/.test(message.content) &&
    !message.mentionedMe;
  if (!actionablePriority || !taskLike || completionNotice) return null;

  const timeMatch = message.content.match(
    /(今天|今晚|明天|本周|下班前|午饭前|上午|下午|\\d{1,2}[点:：]\\d{0,2})/,
  );

  return {
    id: `todo-${message.id}`,
    sourceMessageId: message.id,
    title: message.content.replace(/^@\\S+\\s*/, "").slice(0, 42),
    due: timeMatch?.[0] ?? "待确认",
    priority: message.priority === "critical" ? "critical" : "high",
    completed: false,
    source: `${message.platform} · ${message.group ?? message.sender}`,
  };
}

export function buildDashboard(rawMessages, preferences) {
  const messages = rawMessages
    .map((message) => classifyMessage(message, preferences))
    .sort(
      (a, b) =>
        PRIORITY_SCORE[b.priority] - PRIORITY_SCORE[a.priority] ||
        new Date(b.timestamp) - new Date(a.timestamp),
    );

  const todos = messages
    .map(extractTodo)
    .filter(Boolean)
    .filter(
      (todo, index, all) =>
        all.findIndex((candidate) => candidate.title === todo.title) === index,
    );

  const mentions = messages.filter((message) => message.mentionedMe);
  const important = messages.filter((message) =>
    ["critical", "high"].includes(message.priority),
  );
  const platforms = [...new Set(messages.map((message) => message.platform))];

  return {
    messages,
    mentions,
    important,
    todos,
    summary: {
      total: messages.length,
      important: important.length,
      mentions: mentions.length,
      todoCount: todos.length,
      platforms,
      headline:
        mentions.length > 0
          ? `今天有 ${mentions.length} 条 @你 的消息，${todos.length} 项待跟进`
          : `今天有 ${important.length} 条重要消息，${todos.length} 项待跟进`,
    },
  };
}
