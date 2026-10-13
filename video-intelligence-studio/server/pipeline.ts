import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket from "ws";
import {
  buildOntology,
  CommunityReport,
  OntologyNode,
  OntologyRelation,
  TextUnit,
} from "./ontology.js";

const execFileAsync = promisify(execFile);

export type AnalysisMoment = {
  id: string;
  start: number;
  end: number;
  title: string;
  emotion: string;
  score: number;
  transcript: string;
  evidence: string;
};

export type AudioEvidence = {
  start: number;
  end: number;
  type: string;
  speaker: string;
  text: string;
  confidence: number;
};

export type StoryNode = OntologyNode;
export type StoryRelation = OntologyRelation;

export type AnalysisResult = {
  kind: "analysis";
  title: string;
  summary: string;
  tags: string[];
  duration: number;
  language: string;
  transcript: string;
  moments: AnalysisMoment[];
  audioEvidence: AudioEvidence[];
  nodes: StoryNode[];
  relations: StoryRelation[];
  textUnits: TextUnit[];
  communities: CommunityReport[];
  schemaVersion: "video-ontology-v2";
  metrics: Array<[string, string]>;
  sections: string[];
  provenance: {
    asrModel: string;
    multimodalModel: string;
    analyzedAt: string;
  };
};

type Progress = (progress: number, stage: string) => void;

type AsrUtterance = {
  start_time?: number;
  end_time?: number;
  text?: string;
  definite?: boolean;
  additions?: { speaker?: string; confidence?: number };
};

type AsrPayload = {
  result?: {
    text?: string;
    utterances?: AsrUtterance[];
    language?: string;
  };
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少服务端配置 ${name}`);
  return value;
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function protocolFrame(header: number[], payload: Buffer) {
  return Buffer.concat([Buffer.from(header), uint32(payload.length), payload]);
}

function parseAsrFrame(data: Buffer): AsrPayload {
  if (data.length < 8) throw new Error("ASR 返回了无效数据帧");
  const headerSize = (data[0] & 0x0f) * 4;
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  let offset = headerSize;

  if (messageType === 0x0f) {
    const code = data.readUInt32BE(offset);
    const size = data.readUInt32BE(offset + 4);
    const message = data.subarray(offset + 8, offset + 8 + size).toString();
    throw new Error(`ASR ${code}: ${message}`);
  }

  if (flags & 0x01) offset += 4;
  const size = data.readUInt32BE(offset);
  let payload = data.subarray(offset + 4, offset + 4 + size);
  if ((data[2] & 0x0f) === 0x01) payload = gunzipSync(payload);
  return JSON.parse(payload.toString()) as AsrPayload;
}

async function transcribeAudio(audioPath: string) {
  const apiUrl = required("ASR_API_URL");
  const apiKey = required("ASR_API_KEY");
  const resourceId = required("ASR_MODEL");
  const audio = await readFile(audioPath);
  const request = gzipSync(Buffer.from(JSON.stringify({
    user: { uid: "narrative-lens" },
    audio: {
      format: "pcm",
      codec: "raw",
      rate: 16000,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      show_utterances: true,
      enable_lid: true,
    },
  })));

  return new Promise<AsrPayload>((resolve, reject) => {
    const connectId = crypto.randomUUID();
    const socket = new WebSocket(apiUrl, {
      headers: {
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Connect-Id": connectId,
      },
      handshakeTimeout: 15_000,
    });
    let latest: AsrPayload = {};
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("ASR 识别超时"));
    }, 180_000);

    socket.once("open", () => {
      socket.send(protocolFrame([0x11, 0x10, 0x11, 0x00], request));
      const chunkSize = 16_000 * 2 * 2;
      for (let offset = 0; offset < audio.length; offset += chunkSize) {
        const chunk = audio.subarray(offset, offset + chunkSize);
        const last = offset + chunk.length >= audio.length;
        const compressed = gzipSync(chunk);
        socket.send(protocolFrame([0x11, last ? 0x22 : 0x20, 0x01, 0x00], compressed));
      }
      if (audio.length === 0) {
        socket.send(protocolFrame([0x11, 0x22, 0x01, 0x00], gzipSync(Buffer.alloc(0))));
      }
    });

    socket.on("message", (raw) => {
      try {
        latest = parseAsrFrame(Buffer.from(raw as Buffer));
        const utterances = latest.result?.utterances ?? [];
        const isFinal = utterances.some((item) => item.definite)
          || Boolean(latest.result?.text);
        if (isFinal) {
          clearTimeout(timeout);
          socket.close();
          resolve(latest);
        }
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`ASR 连接失败: ${error.message}`));
    });
    socket.once("close", () => {
      clearTimeout(timeout);
      if (!latest.result) reject(new Error("ASR 未返回识别结果"));
    });
  });
}

function arkBaseUrl() {
  const endpoint = required("MM_API_URL");
  return endpoint.replace(/\/responses\/?$/, "");
}

async function arkRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${required("MM_API_KEY")}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(300_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Ark ${response.status}: ${body.slice(0, 500)}`);
  }
  return body ? JSON.parse(body) as Record<string, unknown> : {};
}

async function uploadToArk(videoPath: string) {
  const form = new FormData();
  const video = await readFile(videoPath);
  form.append("purpose", "user_data");
  form.append("file", new Blob([video]), basename(videoPath));
  form.append("preprocess_configs[video][fps]", "0.5");
  const created = await arkRequest(`${arkBaseUrl()}/files`, {
    method: "POST",
    body: form,
  });
  const id = String(created.id ?? "");
  if (!id) throw new Error("Ark Files API 未返回 file_id");

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const file = await arkRequest(`${arkBaseUrl()}/files/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    const status = String(file.status ?? "");
    if (status === "active" || status === "processed" || status === "succeeded") return id;
    if (["error", "failed", "cancelled"].includes(status)) {
      throw new Error(`Ark 视频预处理失败: ${String(file.error ?? status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Ark 视频预处理超时");
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = Array.isArray((item as { content?: unknown[] }).content)
        ? (item as { content: unknown[] }).content
        : [];
      return content.map((part) => {
        if (!part || typeof part !== "object") return "";
        const value = part as { text?: unknown; output_text?: unknown };
        return typeof value.text === "string"
          ? value.text
          : typeof value.output_text === "string" ? value.output_text : "";
      });
    })
    .filter(Boolean)
    .join("\n");
}

function parseJsonOutput(text: string) {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("多模态模型未返回有效 JSON");
  }
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeAnalysis(
  raw: Record<string, unknown>,
  assetName: string,
  duration: number,
  transcript: string,
  asr: AsrPayload,
): AnalysisResult {
  const rawMoments = Array.isArray(raw.moments) ? raw.moments : [];
  const moments = rawMoments.slice(0, 12).map((item, index) => {
    const value = item as Record<string, unknown>;
    return {
      id: `moment-${index + 1}`,
      start: Math.max(0, finite(value.start)),
      end: Math.min(duration, Math.max(finite(value.start), finite(value.end))),
      title: text(value.title, `片段 ${index + 1}`),
      emotion: text(value.emotion, "中性"),
      score: Math.max(0, Math.min(100, finite(value.score, 50))),
      transcript: text(value.transcript),
      evidence: text(value.evidence),
    };
  });
  const asrUtterances = asr.result?.utterances ?? [];
  const audioEvidence = asrUtterances.map((utterance) => ({
    start: finite(utterance.start_time) / 1000,
    end: finite(utterance.end_time) / 1000,
    type: "对白",
    speaker: text(utterance.additions?.speaker, "说话人"),
    text: text(utterance.text),
    confidence: Math.round(finite(utterance.additions?.confidence, 0) * 100),
  })).filter((item) => item.text);
  const ontology = buildOntology(raw, moments, audioEvidence);
  const semanticNodeCount = ontology.nodes.filter(
    (node) => node.kind !== "Evidence" && node.kind !== "Community",
  ).length;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((item) => text(item)).filter(Boolean).slice(0, 6)
    : [];
  return {
    kind: "analysis",
    title: `${assetName} · 视频理解报告`,
    summary: text(raw.summary, "模型未生成故事摘要"),
    tags,
    duration,
    language: text(asr.result?.language, "自动识别"),
    transcript,
    moments,
    audioEvidence,
    nodes: ontology.nodes,
    relations: ontology.relations,
    textUnits: ontology.textUnits,
    communities: ontology.communities,
    schemaVersion: ontology.schemaVersion,
    metrics: [
      ["高光片段", String(moments.length)],
      ["图谱实体", String(semanticNodeCount)],
      ["音频片段", String(audioEvidence.length)],
      ["图谱社区", String(ontology.communities.length)],
    ],
    sections: ["故事摘要", "高光时刻", "人物与情节图谱", "ASR 音频证据"],
    provenance: {
      asrModel: required("ASR_MODEL"),
      multimodalModel: required("MM_MODEL_ID"),
      analyzedAt: new Date().toISOString(),
    },
  };
}

async function analyzeWithMultimodal(
  fileId: string,
  assetName: string,
  duration: number,
  transcript: string,
  asr: AsrPayload,
) {
  const asrCatalog = (asr.result?.utterances ?? [])
    .map((utterance, index) => {
      const start = finite(utterance.start_time) / 1000;
      const end = finite(utterance.end_time) / 1000;
      return `asr-${index + 1} [${start.toFixed(1)}-${end.toFixed(1)}s] ${text(utterance.text)}`;
    })
    .filter((item) => item.trim())
    .join("\n");
  const prompt = `你是专业视频叙事分析器。请严格依据输入视频与 ASR 文本，不得虚构视频中不存在的人物、对白、物体或事件。
视频文件名：${assetName}
视频时长：${duration.toFixed(2)} 秒
ASR 文本：
${transcript || "（未识别到清晰人声）"}
可引用的 ASR 证据：
${asrCatalog || "（无 ASR 证据）"}

仅输出一个合法 JSON 对象，不要 markdown。结构：
{
  "summary": "一句话准确概括视频",
  "tags": ["2-6个真实内容标签"],
  "moments": [{"start": 0, "end": 3.2, "title": "真实高光标题", "emotion": "情绪", "score": 0到100, "transcript": "该段真实对白，无对白则空字符串", "evidence": "画面/声音证据"}],
  "entities": [{"id": "ascii-kebab-id", "kind": "Person|Organization|Location|Object|Concept", "label": "规范名称", "aliases": ["别名"], "description": "仅基于证据的描述", "start": 0, "end": 3.2, "confidence": 0到100, "evidence_ids": ["asr-1","visual-1"]}],
  "events": [{"id": "ascii-kebab-id", "kind": "Event", "label": "事件", "description": "发生了什么", "start": 0, "end": 3.2, "confidence": 0到100, "evidence_ids": ["visual-1"]}],
  "claims": [{"statement": "可验证判断", "subject": "实体或事件id", "predicate": "关系或判断", "object": "实体或事件id，可为空", "status": "supported|uncertain|contradicted", "confidence": 0到100, "rationale": "判断依据", "evidence_ids": ["asr-1","visual-1"]}],
  "relations": [{"source": "实体或事件id", "target": "实体或事件id", "kind": "英文大写关系", "label": "中文关系", "description": "关系依据", "weight": 0.1到3, "evidence_ids": ["asr-1","visual-1"]}]
}
要求：
1. moments 的数组顺序对应视觉证据 visual-1、visual-2……，引用视觉证据时必须使用这些 ID。
2. 时间必须落在视频时长内；人物身份不确定时用“人物1”等可观察称谓。
3. 同一实体必须复用同一个 id；关系和 Claim 的 source/target/subject/object 必须引用已有 id。
4. 每个实体、事件、关系和 Claim 必须至少引用一个有效 evidence_ids；没有证据则不创建。
5. 区分观察事实与推断，推断的 Claim status 使用 uncertain。`;
  const response = await arkRequest(required("MM_API_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: required("MM_MODEL_ID"),
      input: [{
        role: "user",
        content: [
          { type: "input_video", file_id: fileId },
          { type: "input_text", text: prompt },
        ],
      }],
    }),
  });
  const output = responseText(response);
  if (!output) throw new Error("多模态模型未返回文本结果");
  return parseJsonOutput(output);
}

async function probeMedia(videoPath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    videoPath,
  ]);
  const probe = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取视频时长");
  return {
    duration,
    hasAudio: probe.streams?.some((stream) => stream.codec_type === "audio") ?? false,
  };
}

export async function analyzeVideo(
  videoPath: string,
  assetName: string,
  onProgress: Progress,
) {
  const audioPath = join(dirname(videoPath), `${basename(videoPath)}.pcm`);
  try {
    onProgress(8, "探测媒体信息");
    const { duration, hasAudio } = await probeMedia(videoPath);
    let asr: AsrPayload = {};
    if (hasAudio) {
      onProgress(15, "提取 16kHz 单声道音轨");
      await execFileAsync("ffmpeg", [
        "-y", "-i", videoPath,
        "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le",
        audioPath,
      ], { maxBuffer: 1024 * 1024 });
      onProgress(28, "SeedASR 识别对白");
      asr = await transcribeAudio(audioPath);
    } else {
      onProgress(28, "未检测到音轨，跳过 ASR");
    }
    const transcript = text(asr.result?.text);

    onProgress(48, "上传视频到 Ark");
    const fileId = await uploadToArk(videoPath);
    onProgress(68, "多模态模型理解画面与叙事");
    const raw = await analyzeWithMultimodal(fileId, assetName, duration, transcript, asr);
    onProgress(88, "实体归一、Claim 与社区检测");
    return normalizeAnalysis(raw, assetName, duration, transcript, asr);
  } finally {
    await rm(audioPath, { force: true }).catch(() => undefined);
  }
}
