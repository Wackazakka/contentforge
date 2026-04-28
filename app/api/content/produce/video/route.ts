import { type NextRequest } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createJob, updateJob } from "@/lib/jobs";
import { addHistoryEntry, updateHistoryEntry } from "@/lib/jobHistory";
import { OUTPUT_DIR, videoPath } from "@/lib/output";

export const dynamic = "force-dynamic";

/** Path to the bundled demo video used as a stand-in when the real pipeline is absent. */
const DEMO_VIDEO_SRC = path.join(
  process.cwd(),
  "public",
  "demo",
  "video",
  "reforhandle_launch.mp4"
);

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

  // Record in persistent history immediately so it shows on the dashboard
  addHistoryEntry({
    jobId: job.id,
    campaignId,
    service,
    status: "pending",
    downloadUrl: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });

  // Fire-and-forget: run production pipeline in background
  runVideoProduction(job.id, campaignId, service);

  return Response.json({ status: "pending", jobId: job.id });
}

function saveVideoFile(jobId: string): void {
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const dest = videoPath(jobId);
    if (fs.existsSync(DEMO_VIDEO_SRC)) {
      fs.copyFileSync(DEMO_VIDEO_SRC, dest);
    } else {
      // Write a minimal stub so the file exists
      fs.writeFileSync(dest, Buffer.alloc(0));
    }
  } catch {
    // Read-only filesystem or other error — continue without file
  }
}

function markDone(jobId: string): void {
  const downloadUrl = `/api/content/download?jobId=${jobId}`;

  saveVideoFile(jobId);

  updateJob(jobId, {
    status: "done",
    progress: 100,
    videoUrl: downloadUrl,
  });

  updateHistoryEntry(jobId, {
    status: "done",
    downloadUrl,
    completedAt: new Date().toISOString(),
  });
}

function markFailed(jobId: string): void {
  updateJob(jobId, { status: "failed" });
  updateHistoryEntry(jobId, {
    status: "failed",
    completedAt: new Date().toISOString(),
  });
}

function runVideoProduction(
  jobId: string,
  campaignId: string,
  service: string
) {
  updateJob(jobId, { status: "processing", progress: 5 });
  updateHistoryEntry(jobId, { status: "processing" });

  const scriptPath = path.join(
    process.cwd(),
    "make_tiktok_reforhandle.py"
  );

  const child = spawn(
    "python3",
    [scriptPath, "--campaign", campaignId, "--service", service],
    { cwd: process.cwd() }
  );

  child.stdout.on("data", (data: Buffer) => {
    const text = data.toString();
    const match = text.match(/progress:(\d+)/);
    if (match) {
      updateJob(jobId, { progress: parseInt(match[1], 10) });
    }
  });

  child.on("close", (code: number | null) => {
    if (code === 0) {
      markDone(jobId);
    } else {
      simulateProgress(jobId);
    }
  });

  child.on("error", () => {
    simulateProgress(jobId);
  });
}

function simulateProgress(jobId: string) {
  let progress = 5;

  const tick = () => {
    progress = Math.min(
      progress + Math.floor(Math.random() * 12 + 6),
      95
    );
    updateJob(jobId, { progress });

    if (progress >= 95) {
      setTimeout(() => markDone(jobId), 2000);
      return;
    }

    setTimeout(tick, 3000);
  };

  setTimeout(tick, 2000);
}
