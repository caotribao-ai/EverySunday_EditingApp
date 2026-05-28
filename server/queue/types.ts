export type JobKind = "transcribe" | "export";

export interface QueuedTask {
  jobId: string;
  kind: JobKind;
  userId: string;
  payload: Record<string, unknown>;
}

export interface JobQueue {
  enqueue(task: QueuedTask): Promise<void>;
  dequeue(blockMs?: number): Promise<QueuedTask | null>;
  size(): Promise<number>;
  close(): Promise<void>;
}
