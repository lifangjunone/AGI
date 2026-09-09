import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_DURATIONS = Object.freeze([5, 10, 20, 30, 60]);
export const ALLOWED_RATIOS = Object.freeze(["9:16", "16:9", "1:1"]);
const OUTPUT_SIZES = Object.freeze({
  "9:16": [720, 1280],
  "16:9": [1280, 720],
  "1:1": [720, 720]
});

export function validateGenerationInput(input) {
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  const duration = Number(input?.duration);
  const ratio = String(input?.ratio || "9:16");

  if (prompt.length < 8) {
    throw new Error("请至少输入 8 个字符的画面描述");
  }
  if (prompt.length > 6000) {
    throw new Error("画面描述不能超过 6000 个字符");
  }
  if (!ALLOWED_DURATIONS.includes(duration)) {
    throw new Error("不支持该视频时长");
  }
  if (!ALLOWED_RATIOS.includes(ratio)) {
    throw new Error("不支持该画面比例");
  }

  return { prompt, duration, ratio };
}

export function buildModelPrompt({ prompt, duration, ratio }) {
  const pacing =
    duration <= 10
      ? "Use one coherent shot with a clear opening, movement, and finish."
      : "Use a coherent multi-shot sequence with natural transitions and consistent subjects.";

  return [
    prompt,
    "",
    `Delivery requirements: create a ${duration}-second video in ${ratio} aspect ratio.`,
    pacing,
    "Keep motion stable and physically plausible. Preserve identity, anatomy, lighting, and spatial continuity.",
    "Return only the generated MP4 video payload."
  ].join("\n");
}

export function extractVideoBuffer(payload) {
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("模型没有返回可用的视频内容");
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:text|base64)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^data:video\/mp4;base64,/i, "")
    .replace(/\s+/g, "");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw new Error("模型返回的内容不是有效的 MP4 Base64");
  }

  const buffer = Buffer.from(cleaned, "base64");
  if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("模型返回的数据不是有效的 MP4 文件");
  }
  return buffer;
}

async function extractArkVideoBuffer(payload, signal) {
  const videoUrl = payload?.content?.video_url;
  if (typeof videoUrl !== "string" || !videoUrl.startsWith("http")) {
    return extractVideoBuffer(payload);
  }
  const response = await fetch(videoUrl, { signal });
  if (!response.ok) {
    throw new Error(`模型视频下载失败 ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("模型返回的数据不是有效的 MP4 文件");
  }
  return buffer;
}

function sleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("模型任务已取消"));
    }, { once: true });
  });
}

async function requestArkVideo({ apiUrl, apiKey, modelId, prompt, duration, ratio, signal }) {
  const taskPath = "/contents/generations/tasks";
  const createUrl = apiUrl.includes(taskPath)
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, "")}${taskPath}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      content: [{ type: "text", text: prompt }],
      generate_audio: true,
      ratio,
      duration,
      watermark: false
    }),
    signal
  });
  if (!createResponse.ok) {
    const detail = (await createResponse.text()).slice(0, 800);
    throw new Error(`Seedance 任务创建失败 ${createResponse.status}: ${detail || createResponse.statusText}`);
  }
  const created = await createResponse.json();
  if (!created.id) throw new Error("Seedance 没有返回任务 ID");

  const statusUrl = `${createUrl.replace(/\/+$/, "")}/${encodeURIComponent(created.id)}`;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const statusResponse = await fetch(statusUrl, { headers, signal });
    if (!statusResponse.ok) {
      const detail = (await statusResponse.text()).slice(0, 800);
      throw new Error(`Seedance 任务查询失败 ${statusResponse.status}: ${detail || statusResponse.statusText}`);
    }
    const task = await statusResponse.json();
    if (task.status === "succeeded") return task;
    if (["failed", "expired", "cancelled"].includes(task.status)) {
      throw new Error(task.error?.message || `Seedance 任务${task.status}`);
    }
    await sleep(5000, signal);
  }
  throw new Error("Seedance 任务超过等待时间");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} 执行失败: ${stderr.trim().slice(-1000)}`));
      }
    });
  });
}

export async function probeDuration(filePath, ffprobe = "ffprobe") {
  const value = await run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("无法读取模型视频时长");
  }
  return duration;
}

export async function normalizeDuration({
  inputPath,
  outputPath,
  targetDuration,
  sourceDuration,
  ratio = "9:16",
  ffmpeg = "ffmpeg"
}) {
  const [width, height] = OUTPUT_SIZES[ratio] || OUTPUT_SIZES["9:16"];
  await run(ffmpeg, [
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-t",
    String(targetDuration),
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath
  ]);

  if (Math.abs(sourceDuration - targetDuration) <= 0.08) return "validated";
  return sourceDuration < targetDuration ? "looped" : "trimmed";
}

async function requestVideo({ apiUrl, apiKey, modelId, prompt, duration, ratio, signal }) {
  if (apiUrl.includes("/contents/generations/tasks")) {
    return requestArkVideo({ apiUrl, apiKey, modelId, prompt, duration, ratio, signal });
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }]
    }),
    signal
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`模型服务返回 ${response.status}: ${detail || response.statusText}`);
  }
  return response.json();
}

export async function generateVideo({
  input,
  jobId,
  config,
  dataDirectory,
  ffmpeg = "ffmpeg",
  ffprobe = "ffprobe",
  signal
}) {
  const validated = validateGenerationInput(input);
  const id = jobId || randomUUID();
  const jobsDirectory = path.join(dataDirectory, "jobs");
  const videosDirectory = path.join(dataDirectory, "videos");
  const sourcePath = path.join(videosDirectory, `${id}.source.mp4`);
  const outputPath = path.join(videosDirectory, `${id}.mp4`);
  const metadataPath = path.join(jobsDirectory, `${id}.json`);
  await Promise.all([
    mkdir(jobsDirectory, { recursive: true }),
    mkdir(videosDirectory, { recursive: true })
  ]);

  const startedAt = new Date().toISOString();
  const modelPrompt = buildModelPrompt(validated);

  try {
    const payload = await requestVideo({
      ...config,
      prompt: modelPrompt,
      duration: validated.duration,
      ratio: validated.ratio,
      signal
    });
    const sourceBuffer = await extractArkVideoBuffer(payload, signal);
    await writeFile(sourcePath, sourceBuffer);
    const sourceDuration = await probeDuration(sourcePath, ffprobe);
    const normalization = await normalizeDuration({
      inputPath: sourcePath,
      outputPath,
      targetDuration: validated.duration,
      sourceDuration,
      ratio: validated.ratio,
      ffmpeg
    });
    const deliveredDuration = await probeDuration(outputPath, ffprobe);
    const metadata = {
      id,
      prompt: validated.prompt,
      duration: validated.duration,
      ratio: validated.ratio,
      sourceDuration: Number(sourceDuration.toFixed(2)),
      deliveredDuration: Number(deliveredDuration.toFixed(2)),
      normalization,
      model: config.modelId,
      createdAt: startedAt,
      url: `/videos/${id}.mp4`
    };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return metadata;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    await rm(sourcePath, { force: true });
  }
}

export async function listVideos(dataDirectory) {
  const jobsDirectory = path.join(dataDirectory, "jobs");
  await mkdir(jobsDirectory, { recursive: true });
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(jobsDirectory)).filter((name) => name.endsWith(".json"));
  const videos = await Promise.all(
    names.map(async (name) => JSON.parse(await readFile(path.join(jobsDirectory, name), "utf8")))
  );
  return videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
