import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6383", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export const discoveryQueue = new Queue("discovery", { connection });
export const plazaQueue = new Queue("plaza-conversation", { connection });

export interface DiscoveryJob {
  missionId: string;
  ownerId: string;
  idempotencyKey: string;
}
export interface PlazaConversationJob {
  circleId: string;
  initiatorId: string;
  sourceEventId: string;
  idempotencyKey: string;
}

export async function scheduleMission(job: DiscoveryJob, options: JobsOptions = {}) {
  return discoveryQueue.add("scan", job, {
    jobId: job.idempotencyKey,
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    ...options
  });
}

if (process.env.NODE_ENV !== "test") {
  const workerToken = process.env.WORKER_INTERNAL_TOKEN;
  const baseUrl = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:43180").replace(/\/$/, "");
  const worker = new Worker<DiscoveryJob>("discovery", async (job) => {
    console.info(JSON.stringify({
      level: "info",
      event: "discovery.scan",
      missionId: job.data.missionId,
      ownerId: job.data.ownerId,
      idempotencyKey: job.data.idempotencyKey
    }));
    if (!workerToken) throw new Error("worker_internal_token_missing");
    const response = await fetch(`${baseUrl}/internal/jobs/discovery`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-meyou-worker-token": workerToken
      },
      body: JSON.stringify(job.data),
      signal: AbortSignal.timeout(Number(process.env.MODEL_TIMEOUT_MS ?? 1_800_000) + 60_000)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`discovery_api_failed:${response.status}:${body.slice(0, 200)}`);
    }
    const result = await response.json() as { scanned: number; matches: number };
    return { ...result, completedAt: new Date().toISOString() };
  }, { connection, concurrency: 4 });
  worker.on("failed", (job, error) => {
    console.error(JSON.stringify({ level: "error", event: "discovery.failed", jobId: job?.id, message: error.message }));
  });
  const plazaWorker = new Worker<PlazaConversationJob>("plaza-conversation", async (job) => {
    if (!workerToken) throw new Error("worker_internal_token_missing");
    const response = await fetch(`${baseUrl}/internal/jobs/plaza`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-meyou-worker-token": workerToken
      },
      body: JSON.stringify(job.data),
      signal: AbortSignal.timeout(Number(process.env.MODEL_TIMEOUT_MS ?? 1_800_000) + 60_000)
    });
    if (!response.ok) throw new Error(`plaza_api_failed:${response.status}:${(await response.text()).slice(0, 200)}`);
    return response.json();
  }, { connection, concurrency: 2 });
  plazaWorker.on("failed", (job, error) => {
    console.error(JSON.stringify({ level: "error", event: "plaza.failed", jobId: job?.id, message: error.message }));
  });
  const continuousTickMs = Math.max(60_000, Number(process.env.PLAZA_CONTINUOUS_TICK_MS ?? 300_000));
  let continuousTickRunning = false;
  async function runContinuousTick() {
    if (!workerToken || continuousTickRunning) return;
    continuousTickRunning = true;
    try {
      const response = await fetch(`${baseUrl}/internal/jobs/plaza-continuous`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-meyou-worker-token": workerToken
        },
        body: JSON.stringify({ limit: 2 }),
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`plaza_continuous_failed:${response.status}`);
      const result = await response.json() as { processed: number };
      if (result.processed > 0) {
        console.info(JSON.stringify({ level: "info", event: "plaza.continuous", processed: result.processed }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "plaza.continuous_failed",
        message: error instanceof Error ? error.message : "unknown"
      }));
    } finally {
      continuousTickRunning = false;
    }
  }
  const continuousTimer = setInterval(() => void runContinuousTick(), continuousTickMs);
  continuousTimer.unref();
  setTimeout(() => void runContinuousTick(), 15_000).unref();
}
