function requireValue(value, label) {
  if (!value) throw new Error(`${label} 尚未配置`);
  return value;
}

function stripJsonFence(value) {
  return String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export class ArkClient {
  constructor(config) {
    this.config = config;
  }

  async request(path, options = {}) {
    const apiKey = requireValue(this.config.apiKey, "ARK_API_KEY");
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1200);
      throw new Error(`方舟 API ${response.status}: ${detail || response.statusText}`);
    }
    return response.json();
  }

  async generateJson(system, user) {
    const payload = await this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: requireValue(this.config.textModel, "ARK_TEXT_MODEL"),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
    return JSON.parse(stripJsonFence(payload.choices?.[0]?.message?.content));
  }

  async generateImage(prompt) {
    const payload = await this.request("/images/generations", {
      method: "POST",
      body: JSON.stringify({
        model: requireValue(this.config.imageModel, "ARK_IMAGE_MODEL"),
        prompt,
        size: "1K",
        response_format: "url",
        watermark: true
      })
    });
    const image = payload.data?.find((item) => item.url);
    if (!image) throw new Error("图片模型没有返回可用 URL");
    return image.url;
  }

  async createVideo({ prompt, duration = 30, ratio = "16:9" }) {
    return this.request("/contents/generations/tasks", {
      method: "POST",
      body: JSON.stringify({
        model: requireValue(this.config.videoModel, "ARK_VIDEO_MODEL"),
        content: [{ type: "text", text: prompt }],
        duration,
        ratio,
        resolution: "720p",
        generate_audio: true,
        return_last_frame: true
      })
    });
  }

  async getVideoTask(id) {
    return this.request(`/contents/generations/tasks/${encodeURIComponent(id)}`);
  }
}
