export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  assetId: string;
  assetName: string;
  hasAnalysis: boolean;
  activeJobStatus: "" | "queued" | "running";
};

export async function getProjects() {
  const response = await fetch("/api/projects");
  if (!response.ok) throw new Error("项目列表加载失败");
  return response.json() as Promise<ProjectSummary[]>;
}

export async function saveProject(id: string, name: string) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name }),
  });
  const payload = await response.json() as ProjectSummary & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "项目保存失败");
  return payload;
}
