export function integrationGuide(model, origin) {
  const base = new URL(origin).origin;
  const chat = model.capability === "chat";
  const vision = model.capability === "multimodal";
  const vector = model.capability === "embeddings";
  const image = model.capability === "image.generation";
  const speech = model.capability === "audio.speech";
  const managedSpeech = speech && model.id === "lym-tts-realtime";
  if (!chat && !vision && !speech && !vector && !image) return {
    supported: false,
    note: "该能力目前仅支持注册和配置管理，MaaS 推理接口尚未实现。请勿将连接认证通过理解为可调用。"
  };
  const path = chat || vision ? "/v1/chat/completions" : vector ? "/v1/embeddings" : image ? "/v1/images/generations" : "/v1/audio/speech";
  const payload = chat
    ? { model: model.id, messages: [{ role: "user", content: "你好" }], stream: false }
    : vision ? { model: model.id, stream: false, messages: [{ role: "user", content: [
      { type: "text", text: "描述图片中的内容" },
      { type: "image_url", image_url: { url: "https://REPLACE_WITH_YOUR_IMAGE_URL", detail: "auto" } }
    ] }] }
    : image ? { model: model.id, prompt: "白色背景上的蓝色几何图形", n: 1, response_format: "b64_json" }
    : vector ? { model: model.id, input: ["用于检索的示例文本"], encoding_format: "float" }
    : { model: model.id, input: "你好，这是语音接入测试。", voice: managedSpeech ? "voice-1" : "REPLACE_WITH_SUPPLIER_VOICE_ID", speed: 1, response_format: "wav" };
  const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
  const curl = [
    `curl --fail-with-body ${shellQuote(base + path)} \\`,
    '  -H "Authorization: Bearer ${MAAS_SERVICE_KEY}" \\',
    "  -H 'Content-Type: application/json' \\",
    `  -d ${shellQuote(JSON.stringify(payload, null, 2))}${speech ? " \\" : ""}`,
    ...(speech ? ["  --output speech.wav"] : [])
  ].join("\n");
  return {
    supported: true, path, payload, curl,
    note: vision ? "图片理解仅支持文字＋1–4 张图片，不支持音频/视频。替换图片地址为供应商可读取的 HTTPS URL；图片将交给供应商。需验证授权和真实 VLM 调用。"
      : image ? "图像生成支持 1–4 张、HTTPS URL 或 base64 栅格；参数支持取决于供应商。需验证授权和真实生成，远程链接可能过期。"
      : chat ? "Chat 目前支持非流式请求（stream=false）。实际可用性仍需授权、有效配置和模型调用验证。"
      : vector ? "Embeddings 支持文本或最多 128 条文本，返回 float 向量；可选 dimensions 取决于供应商支持。需验证授权与真实模型调用。"
      : managedSpeech ? "中文 TTS 返回 WAV，支持 voice-0 至 voice-4；队列满时返回 429，请稍后重试。"
      : "外部 TTS 需兼容 OpenAI audio/speech 协议并支持 WAV。请将 voice 替换为供应商真实音色 ID；最多 500 字符，语速 0.5–2。连接认证通过不代表语音推理已验证。"
  };
}
