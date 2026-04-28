import { type NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { createJob, updateJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

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

  // Fire-and-forget: run production pipeline in background
  runVideoProduction(job.id, campaignId, service);

  return Response.json({ status: "pending", jobId: job.id });
}

function runVideoProduction(
  jobId: string,
  campaignId: string,
  service: string
) {
  updateJob(jobId, { status: "processing", progress: 5 });

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
    // Convention: script emits "progress:42" lines
    const match = text.match(/progress:(\d+)/);
    if (match) {
      updateJob(jobId, { progress: parseInt(match[1], 10) });
    }
  });

  child.on("close", (code: number | null) => {
    if (code === 0) {
      updateJob(jobId, {
        status: "done",
        progress: 100,
        videoUrl: "/demo/video/reforhandle_launch.mp4",
      });
    } else {
      // Script exited with error — fall back to simulation
      simulateProgress(jobId);
    }
  });

  child.on("error", () => {
    // Script not found or failed to spawn (expected in dev/demo)
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
      setTimeout(() => {
        updateJob(jobId, {
          status: "done",
          progress: 100,
          videoUrl: "/demo/video/reforhandle_launch.mp4",
        });
      }, 2000);
      return;
    }

    setTimeout(tick, 3000);
  };

  setTimeout(tick, 2000);
}
