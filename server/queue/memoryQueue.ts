import type { JobQueue, QueuedTask } from "./types.js";

export function createMemoryQueue(): JobQueue {
  const tasks: QueuedTask[] = [];

  return {
    async enqueue(task) {
      tasks.push(task);
    },
    async dequeue(blockMs = 0) {
      if (blockMs > 0 && tasks.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(blockMs, 500)));
        return tasks.shift() ?? null;
      }
      return tasks.shift() ?? null;
    },
    async size() {
      return tasks.length;
    },
    async close() {
      tasks.length = 0;
    },
  };
}
