import { createHash } from "node:crypto";
import { templates, getTemplate } from "./templates.mjs";

const MAX_DATA_URL_LENGTH = 7_500_000;

function normalizePhoto(photoDataUrl) {
  const value = String(photoDataUrl || "").trim();
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) {
    throw Object.assign(new Error("photo_must_be_data_url"), { status: 400 });
  }
  if (value.length > MAX_DATA_URL_LENGTH) {
    throw Object.assign(new Error("photo_too_large"), { status: 413 });
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.length < 1024) {
    throw Object.assign(new Error("photo_too_small"), { status: 400 });
  }
  if (bytes.length > 5 * 1024 * 1024) {
    throw Object.assign(new Error("photo_too_large"), { status: 413 });
  }
  return {
    mime: match[1].toLowerCase().replace("image/jpg", "image/jpeg"),
    bytes,
    hash: createHash("sha256").update(bytes).digest("hex")
  };
}

function localDescription({ vibe, genderPresentation, outfitHint }) {
  const mood = String(vibe || "自然、自信、轻松").trim().slice(0, 80);
  const gender = String(genderPresentation || "保持参考照片的性别表达").trim().slice(0, 60);
  const outfit = String(outfitHint || "黑色上衣、白色阔腿裤、白色鞋").trim().slice(0, 80);
  return [
    `人物气质：${mood}`,
    `性别表达：${gender}`,
    `服装偏好：${outfit}`,
    "必须保留上传照片中的脸型、发型、五官相似度、肤色与整体亲和力。",
    "不要生成真实名人、不要添加水印、不要暴露上传照片的文件信息。"
  ].join(" ");
}

function sizeForAspect(aspect) {
  if (aspect === "9:16" || aspect === "3:4") return "1024x1536";
  if (aspect === "16:10" || aspect === "4:3") return "1536x1024";
  return "1024x1024";
}

async function maybeGenerateImage({ photo, job }) {
  if (process.env.IMAGE_PROVIDER !== "openai") return job;
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) {
    return {
      ...job,
      output: {
        ...job.output,
        status: "provider-not-configured",
        error: "OPENAI_API_KEY_missing"
      }
    };
  }

  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("prompt", job.prompt);
  form.append("size", sizeForAspect(job.aspect));
  form.append("n", "1");
  form.append("image", new Blob([photo.bytes], { type: photo.mime }), `reference.${photo.mime.split("/")[1]}`);

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ...job,
      output: {
        ...job.output,
        status: "provider-error",
        error: payload.error?.message || `openai_${response.status}`
      }
    };
  }
  const b64 = payload.data?.[0]?.b64_json;
  return {
    ...job,
    output: {
      ...job.output,
      status: b64 ? "completed" : "provider-empty",
      imageUrl: b64 ? `data:image/png;base64,${b64}` : null
    }
  };
}

export async function buildGeneration(payload = {}) {
  const photo = normalizePhoto(payload.photoDataUrl);
  const selectedIds = Array.isArray(payload.templateIds) && payload.templateIds.length
    ? payload.templateIds
    : [String(payload.templateId || templates[0].id)];
  const uniqueIds = [...new Set(selectedIds.map((id) => String(id)))].slice(0, 6);
  const userDescription = localDescription(payload);
  const jobs = uniqueIds.map((id, index) => {
    const template = getTemplate(id);
    return {
      id: `${template.id}-${photo.hash.slice(0, 10)}-${index + 1}`,
      templateId: template.id,
      title: template.title,
      shortTitle: template.shortTitle,
      aspect: template.aspect,
      prompt: `${template.prompt}\n\nReference-photo adaptation notes: ${userDescription}`,
      negativePrompt: [
        "low quality",
        "blurry",
        "extra fingers",
        "deformed hands",
        "distorted face",
        "unreadable logo",
        "watermark",
        "real celebrity",
        "photorealistic adult body if the template requests chibi"
      ].join(", "),
      output: {
        mode: process.env.IMAGE_PROVIDER ? "provider-ready" : "prompt-preview",
        provider: process.env.IMAGE_PROVIDER || "none",
        status: process.env.IMAGE_PROVIDER ? "queued" : "ready-for-copy",
        imageUrl: null
      }
    };
  });
  const resolvedJobs = [];
  for (const job of jobs) {
    resolvedJobs.push(await maybeGenerateImage({ photo, job }));
  }
  return {
    ok: true,
    source: "local-template-engine",
    photo: {
      mime: photo.mime,
      bytes: photo.bytes.length,
      fingerprint: photo.hash.slice(0, 16),
      retained: false
    },
    jobs: resolvedJobs
  };
}

export function publicTemplates() {
  return templates.map(({ prompt, ...template }) => template);
}
