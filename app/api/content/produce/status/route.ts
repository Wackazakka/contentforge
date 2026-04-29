import { type NextRequest } from "next/server";
import { getJob, updateJob } from "@/lib/jobs";
import { updateHistoryEntry } from "@/lib/jobHistory";

export const dynamic = "force-dynamic";

const DROPLET_JOB_QUEUE_URL = "http://139.59.212.218:3002/jobs";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }

  // Primary source of truth: poll the droplet server (file-based, survives restarts)
  try {
    const res = await fetch(`${DROPLET_JOB_QUEUE_URL}/${jobId}`);
    if (res.ok) {
      const remote = (await res.json()) as { jobId: string; status: string };

      if (remote.status === "done") {
        const videoUrl = `http://139.59.212.218:3002/videos/${jobId}/output.mp4`;
        updateJob(jobId, { status: "done", progress: 100, videoUrl });
        updateHistoryEntry(jobId, {
          status: "done",
          downloadUrl: videoUrl,
          completedAt: new Date().toISOString(),
        });
        return Response.json({ status: "done", progress: 100, videoUrl });
      }

      if (remote.status === "processing" || remote.status === "queued") {
        const localJob = getJob(jobId);
        return Response.json({
          status: "processing",
          progress: localJob?.progress ?? 5,
          videoUrl: null,
        });
      }
    }
  } catch (err) {
    console.error("[status] Failed to poll droplet for job", jobId, err);
  }

  // Fallback: use local in-memory job state (valid when server is long-running)
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
