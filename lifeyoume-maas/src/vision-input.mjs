const invalid = message => Object.assign(new Error(message), {
  status: 400, code: "invalid_multimodal_input"
});

// Image understanding only, not audio/video or arbitrary provider extensions.
export function visionMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 64) {
    throw invalid("Provide 1-64 messages.");
  }
  let images = 0;
  let textSize = 0;
  let encodedSize = 0;
  const normalized = messages.map(message => {
    if (!message || !["system", "user", "assistant"].includes(message.role)) {
      throw invalid("Only system, user and assistant roles are supported.");
    }
    if (typeof message.content === "string" && message.content.trim()) {
      textSize += message.content.length;
      return { role: message.role, content: message.content };
    }
    if (!Array.isArray(message.content) || !message.content.length || message.content.length > 16) {
      throw invalid("Message content must be text or 1-16 text/image parts.");
    }
    const content = message.content.map(part => {
      if (part?.type === "text" && typeof part.text === "string" && part.text.trim()) {
        textSize += part.text.length;
        return { type: "text", text: part.text };
      }
      if (part?.type !== "image_url" || message.role !== "user" || typeof part.image_url?.url !== "string") {
        throw invalid("Only user image_url and text parts are supported; audio/video are not.");
      }
      images++;
      const url = part.image_url.url;
      const detail = part.image_url.detail ?? "auto";
      if (!["auto", "low", "high"].includes(detail)) throw invalid("Invalid image detail.");
      if (url.startsWith("data:")) {
        const match = url.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match || match[2].length % 4 !== 0) throw invalid("Use base64 PNG, JPEG or WebP.");
        encodedSize += match[2].length;
        if (encodedSize > 700000) throw invalid("Inline images exceed 700000 encoded characters.");
        const bytes = Buffer.from(match[2], "base64");
        const valid = match[1] === "png"
          ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : match[1] === "jpeg" ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
        if (!valid) throw invalid("Inline image signature does not match its MIME type.");
      } else {
        let parsed;
        try { parsed = new URL(url); } catch { throw invalid("Invalid image URL."); }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || url.length > 8192) {
          throw invalid("Image links must use HTTPS without embedded credentials.");
        }
      }
      return { type: "image_url", image_url: { url, detail } };
    });
    return { role: message.role, content };
  });
  if (images < 1 || images > 4) throw invalid("Image understanding requires 1-4 images total.");
  if (textSize > 100000) throw invalid("Text exceeds 100000 characters.");
  return normalized;
}
