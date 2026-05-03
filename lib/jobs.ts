export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface Job {
  id: string;
  campaignId: string;
  productId?: string;
  service: string;
  status: JobStatus;
  progress: number;
  videoUrl?: string;
  error?: string;
  createdAt: number;
}

// Module-level singleton — shared for the lifetime of the Node.js process.
// Works in `next dev` / `next start`; not durable in serverless cold-starts.
const jobs = new Map<string, Job>();

export function createJob(campaignId: string, service: string, productId?: string): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    campaignId,
    productId,
    service,
    status: "pending",
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if ("videoUrl" in updates) {
    console.log(`[jobs] updateJob ${id}: setting videoUrl =`, updates.videoUrl ?? null);
  }
  const updated = { ...job, ...updates };
  jobs.set(id, updated);
  return updated;
}
