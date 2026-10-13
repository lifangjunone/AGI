import { useCallback, useEffect, useState } from "react";

export type JobType = "analysis" | "remix" | "fission" | "preroll" | "hooks";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export type Job = {
  id: string;
  projectId: string;
  assetId: string;
  assetName: string;
  type: JobType;
  title: string;
  status: JobStatus;
  progress: number;
  currentStage: string;
  stages: string[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  elapsedSeconds: number;
  etaSeconds: number;
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
};

type EnqueueInput = {
  type: JobType;
  title: string;
  metadata?: Record<string, unknown>;
};

export function useJobQueue(projectId: string, assetId: string, assetName: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connected, setConnected] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs?projectId=${encodeURIComponent(projectId)}`);
      if (!response.ok) throw new Error("Queue API unavailable");
      setJobs(await response.json() as Job[]);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const enqueue = useCallback(async (input: EnqueueInput) => {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, projectId, assetId, assetName }),
    });
    if (!response.ok) throw new Error("任务入队失败");
    const job = await response.json() as Job;
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    return job;
  }, [assetId, assetName, projectId]);

  const clearCompleted = useCallback(async () => {
    await fetch(`/api/jobs/completed?projectId=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    await refresh();
  }, [projectId, refresh]);

  return { jobs, connected, enqueue, refresh, clearCompleted };
}
