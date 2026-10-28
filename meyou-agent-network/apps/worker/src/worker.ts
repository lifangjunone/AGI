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
  threadRootId?: string;
  round: number;
  maxRounds: number;
  idempotencyKey: string;
}

export function retryDelay(baseMs: number, failures: number, maxMs = 300_000) {
  if (failures <= 0) return baseMs;
  return Math.min(maxMs, baseMs * (2 ** Math.min(failures, 10)));
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
  const discoveryTickMs = Math.max(30_000, Number(process.env.DISCOVERY_TICK_MS ?? 60_000));
  let discoveryTickRunning = false;
  let discoveryFailures = 0;
  let discoveryTimer: NodeJS.Timeout | undefined;
  function scheduleDiscovery(delay: number) {
    discoveryTimer = setTimeout(() => void queueDueDiscovery(), delay);
    discoveryTimer.unref();
  }
  async function queueDueDiscovery() {
    if (!workerToken || discoveryTickRunning) {
      scheduleDiscovery(discoveryTickMs);
      return;
    }
    discoveryTickRunning = true;
    try {
      const response = await fetch(`${baseUrl}/internal/jobs/discovery-due`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-meyou-worker-token": workerToken
        },
        body: JSON.stringify({ limit: 10 }),
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`discovery_due_failed:${response.status}`);
      const result = await response.json() as { queued: number };
      if (result.queued > 0) {
        console.info(JSON.stringify({ level: "info", event: "discovery.due", queued: result.queued }));
      }
      if (discoveryFailures > 0) {
        console.info(JSON.stringify({ level: "info", event: "discovery.recovered", failures: discoveryFailures }));
      }
      discoveryFailures = 0;
    } catch (error) {
      discoveryFailures += 1;
      if (discoveryFailures === 1 || (discoveryFailures & (discoveryFailures - 1)) === 0) {
        console.error(JSON.stringify({
          level: "error",
          event: "discovery.due_failed",
          failures: discoveryFailures,
          retryInMs: retryDelay(discoveryTickMs, discoveryFailures),
          message: error instanceof Error ? error.message : "unknown"
        }));
      }
    } finally {
      discoveryTickRunning = false;
      scheduleDiscovery(retryDelay(discoveryTickMs, discoveryFailures));
    }
  }
  scheduleDiscovery(3_000);
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
  const continuousTickMs = Math.max(5_000, Number(process.env.PLAZA_CONTINUOUS_TICK_MS ?? 5_000));
  let continuousTickRunning = false;
  let continuousFailures = 0;
  let continuousTimer: NodeJS.Timeout | undefined;
  function scheduleContinuous(delay: number) {
    continuousTimer = setTimeout(() => void runContinuousTick(), delay);
    continuousTimer.unref();
  }
  async function runContinuousTick() {
    if (!workerToken || continuousTickRunning) {
      scheduleContinuous(continuousTickMs);
      return;
    }
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
      if (continuousFailures > 0) {
        console.info(JSON.stringify({ level: "info", event: "plaza.continuous_recovered", failures: continuousFailures }));
      }
      continuousFailures = 0;
    } catch (error) {
      continuousFailures += 1;
      if (continuousFailures === 1 || (continuousFailures & (continuousFailures - 1)) === 0) {
        console.error(JSON.stringify({
          level: "error",
          event: "plaza.continuous_failed",
          failures: continuousFailures,
          retryInMs: retryDelay(continuousTickMs, continuousFailures),
          message: error instanceof Error ? error.message : "unknown"
        }));
      }
    } finally {
      continuousTickRunning = false;
      scheduleContinuous(retryDelay(continuousTickMs, continuousFailures));
    }
  }
  scheduleContinuous(5_000);
}
