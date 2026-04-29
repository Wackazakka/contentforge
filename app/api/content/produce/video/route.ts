import { type NextRequest } from "next/server";
import { createJob, getJob, updateJob } from "@/lib/jobs";
import { addHistoryEntry, updateHistoryEntry } from "@/lib/jobHistory";

export const dynamic = "force-dynamic";

const DROPLET_JOB_QUEUE_URL = "http://139.59.212.218:3002/jobs";

interface Segment {
  text: string;
  imagePrompt: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { campaignId, service, headline, bodyCopy, voiceId, cta, segments } =
    body as {
      campaignId?: string;
      service?: string;
      headline?: string;
      bodyCopy?: string;
      voiceId?: string;
      cta?: string;
      segments?: Segment[];
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
      body: JSON.stringify({
        jobId: job.id,
        campaignId,
        service,
        headline,
        bodyCopy,
        voiceId,
        cta,
        ...(segments && segments.length > 0 ? { segments } : {}),
      }),
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

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  try {
    const res = await fetch(`${DROPLET_JOB_QUEUE_URL}/${jobId}`);
    if (!res.ok) {
      throw new Error(`Queue server responded ${res.status}`);
    }
    const remote = (await res.json()) as { jobId: string; status: string };

    if (remote.status === "done") {
      const videoUrl = `http://139.59.212.218:3002/videos/${jobId}.mp4`;
      updateJob(jobId, { status: "done", progress: 100, videoUrl });
      updateHistoryEntry(jobId, {
        status: "done",
        downloadUrl: videoUrl,
        completedAt: new Date().toISOString(),
      });
      return Response.json({ status: "done", progress: 100, videoUrl });
    }

    if (remote.status === "failed") {
      updateJob(jobId, { status: "failed" });
      updateHistoryEntry(jobId, {
        status: "failed",
        completedAt: new Date().toISOString(),
      });
      return Response.json({ status: "failed", progress: 0, videoUrl: null });
    }

    const localJob = getJob(jobId);
    return Response.json({
      status: "processing",
      progress: localJob?.progress ?? 5,
      videoUrl: null,
    });
  } catch (err) {
    console.error("[video-produce] Failed to poll droplet for job", jobId, err);
  }

  // Fallback: local in-memory state
  const job = getJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json({
    status: job.status,
    progress: job.progress,
    videoUrl: job.videoUrl ?? null,
  });
}
