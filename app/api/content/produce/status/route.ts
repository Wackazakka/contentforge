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
    console.log("[status] Fetching from droplet:", `${DROPLET_JOB_QUEUE_URL}/${jobId}`);
    const res = await fetch(`${DROPLET_JOB_QUEUE_URL}/${jobId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    console.log("[status] Droplet response status:", res.status);

    if (res.ok) {
      const remote = (await res.json()) as { jobId: string; status: string };
      console.log("[status] Droplet job data:", remote);

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
          status: remote.status,
          progress: localJob?.progress ?? 5,
          videoUrl: null,
          jobId: remote.jobId,
        });
      }

      if (remote.status === "failed") {
        return Response.json({
          status: "failed",
          progress: 0,
          videoUrl: null,
          error: (remote as any).error,
        });
      }

      // Return whatever status the droplet reported
      return Response.json(remote);
    } else {
      console.error("[status] Droplet fetch failed with status:", res.status);
      const text = await res.text();
      console.error("[status] Response body:", text);
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
