import { Redis } from "ioredis";
import type { JobQueue, QueuedTask } from "./types.js";

const QUEUE_KEY = "everysunday:jobs:pending";

export function createRedisQueue(redisUrl: string): JobQueue {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  return {
    async enqueue(task) {
      await client.lpush(QUEUE_KEY, JSON.stringify(task));
    },
    async dequeue(blockMs = 5000) {
      const result = await client.brpop(QUEUE_KEY, Math.max(1, Math.ceil(blockMs / 1000)));
      if (!result || !result[1]) return null;
      return JSON.parse(result[1]) as QueuedTask;
    },
    async size() {
      return client.llen(QUEUE_KEY);
    },
    async close() {
      await client.quit();
    },
  };
}
