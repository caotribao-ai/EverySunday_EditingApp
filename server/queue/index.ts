import { createMemoryQueue } from "./memoryQueue.js";
import { createRedisQueue } from "./redisQueue.js";
import type { JobQueue } from "./types.js";

export type { JobQueue, JobKind, QueuedTask } from "./types.js";

export function createJobQueue(): JobQueue {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    console.log("[queue] Using Redis job queue");
    return createRedisQueue(redisUrl);
  }
  console.log("[queue] Using in-memory job queue (set REDIS_URL for production workers)");
  return createMemoryQueue();
}

export function shouldRunInlineWorkers() {
  if (process.env.RUN_AS_WORKER === "true") return true;
  if (process.env.REDIS_URL?.trim()) return false;
  return true;
}

export function isWorkerProcess() {
  return process.env.RUN_AS_WORKER === "true";
}
