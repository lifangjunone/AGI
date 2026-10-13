function parseContent(content) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (typeof parsed?.text === "string") return parsed.text;
    return JSON.stringify(parsed);
  } catch {
    return String(content || "");
  }
}

export function verifyFeishuEvent(payload, verificationToken) {
  if (!verificationToken) {
    return { ok: false, reason: "飞书验证令牌未配置" };
  }
  const receivedToken = payload?.token || payload?.header?.token;
  if (receivedToken !== verificationToken) {
    return { ok: false, reason: "飞书验证令牌不匹配" };
  }
  return { ok: true };
}

export function normalizeFeishuEvent(payload, currentUserOpenId = "") {
  const event = payload?.event;
  const message = event?.message;
  if (!message || payload?.header?.event_type !== "im.message.receive_v1") {
    return null;
  }

  const mentions = Array.isArray(message.mentions) ? message.mentions : [];
  const content = parseContent(message.content);
  const senderId =
    event.sender?.sender_id?.open_id ||
    event.sender?.sender_id?.user_id ||
    event.sender?.sender_id?.union_id ||
    "未知用户";

  return {
    id: `feishu-${message.message_id}`,
    externalId: message.message_id,
    platform: "飞书",
    sender: event.sender?.sender_name || senderId,
    senderId,
    group: message.chat_type === "group" ? message.chat_name || message.chat_id : undefined,
    groupId: message.chat_type === "group" ? message.chat_id : undefined,
    content,
    mentionedMe: currentUserOpenId
      ? mentions.some((mention) => mention?.id?.open_id === currentUserOpenId)
      : false,
    timestamp: new Date(Number(message.create_time || Date.now())).toISOString(),
    unread: true,
    sourceUrl: message.message_id
      ? `https://applink.feishu.cn/client/chat/open?messageId=${encodeURIComponent(message.message_id)}`
      : undefined,
  };
}
