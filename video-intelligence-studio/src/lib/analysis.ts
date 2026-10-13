export type TimelineMoment = {
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

export type OntologyKind =
  | "Person"
  | "Organization"
  | "Location"
  | "Object"
  | "Concept"
  | "Event"
  | "Claim"
  | "Evidence"
  | "Community";

export type OntologyNode = {
  id: string;
  kind: OntologyKind;
  label: string;
  description: string;
  timecode: string;
  start: number;
  end: number;
  score: number;
  aliases: string[];
  evidenceIds: string[];
  communityId: string;
  status: string;
};

export type OntologyRelation = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  description: string;
  weight: number;
  evidenceIds: string[];
};

export type TextUnit = {
  id: string;
  kind: "asr" | "visual";
  start: number;
  end: number;
  text: string;
};

export type CommunityReport = {
  id: string;
  level: number;
  title: string;
  summary: string;
  memberIds: string[];
  evidenceIds: string[];
  rating: number;
};

export type AnalysisResult = {
  kind: "analysis";
  title: string;
  summary: string;
  tags: string[];
  duration: number;
  language: string;
  transcript: string;
  moments: TimelineMoment[];
  audioEvidence: AudioEvidence[];
  nodes: OntologyNode[];
  relations: OntologyRelation[];
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

export type UploadedAsset = {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

export async function uploadVideo(projectId: string, file: File) {
  const form = new FormData();
  form.append("projectId", projectId);
  form.append("video", file);
  const response = await fetch("/api/assets", { method: "POST", body: form });
  const payload = await response.json() as UploadedAsset & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "视频上传失败");
  return payload;
}

export async function getAnalysis(projectId: string) {
  const response = await fetch(`/api/analysis/${encodeURIComponent(projectId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("分析结果加载失败");
  return response.json() as Promise<AnalysisResult>;
}
