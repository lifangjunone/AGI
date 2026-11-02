import { tr } from "./i18n";

export function deliveryFeedback(locale: "zh-CN" | "en", agent?: { status: string; reason?: string }) {
  if (agent?.status === "unavailable") {
    if (agent.reason === "model_disabled") return tr(locale,
      "消息已送达。模型未启用，对方仍可亲自回复，请勿重复发送。",
      "Message delivered. The model is disabled; the other person can reply. Do not resend.");
    return tr(locale, "消息已送达，Agent 暂未回复。对方仍可亲自回复，请勿重复发送。",
      "Message delivered; the Agent could not reply. The other person can reply. Do not resend.");
  }
  if (agent?.status === "pending") return tr(locale, "消息已送达，对方 Agent 的回复等待本人确认。",
    "Message delivered. The other Agent's reply awaits its owner's approval.");
  if (agent?.status === "waiting_human" || agent?.status === "paused") return tr(locale,
    "消息已送达，等待对方本人回复。", "Message delivered. Waiting for the other person to reply.");
  return tr(locale, "消息已送达。", "Message delivered.");
}
