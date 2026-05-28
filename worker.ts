/**
 * Standalone FFmpeg / AI job worker.
 * Usage: REDIS_URL=redis://localhost:6379 RUN_AS_WORKER=true tsx worker.ts
 */
process.env.RUN_AS_WORKER = "true";
await import("./server.ts");
