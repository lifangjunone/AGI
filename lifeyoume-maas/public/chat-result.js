export function chatAnswer(result) {
  const message = result?.choices?.[0]?.message;
  if (typeof message?.content === "string" && message.content.trim()) return message.content;
  if (Array.isArray(message?.content)) {
    const text = message.content.filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text).join("\n");
    if (text.trim()) return text;
  }
  if (typeof message?.refusal === "string" && message.refusal) return `模型拒绝回答：${message.refusal}`;
  if (message?.tool_calls?.length) return "模型返回工具调用，本工作台不会执行工具。请展开原始响应查看。";
  return "响应未包含可展示的文本回答，请展开原始响应查看。";
}
