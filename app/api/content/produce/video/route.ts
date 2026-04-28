import { type NextRequest } from "next/server";
import { createJob, updateJob } from "@/lib/jobs";
import { addHistoryEntry, updateHistoryEntry } from "@/lib/jobHistory";

export const dynamic = "force-dynamic";

const DROPLET_JOB_QUEUE_URL = "http://139.59.212.218:3002/jobs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { campaignId, service } = body as {
    campaignId?: string;
    service?: string;
  };

  if (!campaignId || !service) {
    return Response.json(
      { error: "Missing campaignId or service" },
      { status: 400 }
    );
  }

  const job = createJob(campaignId, service);

  addHistoryEntry({
    jobId: job.id,
    campaignId,
    service,
    status: "pending",
    downloadUrl: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });

  try {
    const res = await fetch(DROPLET_JOB_QUEUE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, campaignId, service }),
    });

    if (!res.ok) {
      throw new Error(`Queue server responded ${res.status}`);
    }

    updateJob(job.id, { status: "processing", progress: 5 });
    updateHistoryEntry(job.id, { status: "processing" });
  } catch (err) {
    console.error("[video-produce] Failed to enqueue job on droplet:", err);
    updateJob(job.id, { status: "failed" });
    updateHistoryEntry(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
    });
    return Response.json({ error: "Failed to enqueue job" }, { status: 502 });
  }

  return Response.json({ status: "pending", jobId: job.id });
}
