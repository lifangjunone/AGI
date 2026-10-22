import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export interface DiscoveryJob {
  missionId: string;
  ownerId: string;
  idempotencyKey: string;
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6383", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export const discoveryQueue = new Queue<DiscoveryJob>("discovery", { connection });
export interface PlazaConversationJob {
  circleId: string;
  initiatorId: string;
  sourceEventId: string;
  idempotencyKey: string;
}
export const plazaQueue = new Queue<PlazaConversationJob>("plaza-conversation", { connection });

export async function scheduleMission(job: DiscoveryJob, options: JobsOptions = {}) {
  return discoveryQueue.add("scan", job, {
    jobId: job.idempotencyKey,
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    ...options
  });
}

export async function schedulePlazaConversation(job: PlazaConversationJob) {
  return plazaQueue.add("respond", job, {
    jobId: job.idempotencyKey,
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 2,
    backoff: { type: "exponential", delay: 2_000 }
  });
}
