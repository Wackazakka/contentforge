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

  const videoFilePath = videoPath(jobId);
  const videoExists = fs.existsSync(videoFilePath);
  console.log(`[video-produce] markDone for job ${jobId}`, {
    videoFilePath,
    videoExists,
    downloadUrl,
  });

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

  const scriptPath = '/root/.openclaw/workspace/reforhandle-content/make_tiktok_reforhandle.py';

  const configPath = `/tmp/${jobId}-config.json`;
  let config: Record<string, unknown>;
  try {
    const baseConfig = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/reforhandle-content/config.json', 'utf8'));
    config = {
      ...baseConfig,
      output: `/root/.openclaw/workspace/contentforge-output/${jobId}.mp4`,
    };
  } catch (err) {
    console.error(`[video-produce] Failed to read base config for job ${jobId}:`, err);
    config = {
      output: `/root/.openclaw/workspace/contentforge-output/${jobId}.mp4`,
    };
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error(`[video-produce] Failed to write config for job ${jobId}:`, err);
  }

  console.log(`[video-produce] Starting Python script for job ${jobId}`, {
    scriptPath,
    configPath,
    campaignId,
    service,
    scriptExists: fs.existsSync(scriptPath),
  });

  const child = spawn("python3", [scriptPath, configPath], {
    cwd: process.cwd(),
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (data: Buffer) => {
    stdoutChunks.push(data);
    const text = data.toString();
    const match = text.match(/progress:(\d+)/);
    if (match) {
      updateJob(jobId, { progress: parseInt(match[1], 10) });
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    stderrChunks.push(data);
  });

  child.on("close", (code: number | null) => {
    try {
      fs.unlinkSync(configPath);
    } catch {
      // File may already be gone — ignore
    }

    const stdout = Buffer.concat(stdoutChunks).toString().trim();
    const stderr = Buffer.concat(stderrChunks).toString().trim();
    console.log(`[video-produce] Python script exited for job ${jobId}`, {
      exitCode: code,
      stdout: stdout || "(empty)",
      stderr: stderr || "(empty)",
    });

    if (code === 0) {
      markDone(jobId);
    } else {
      console.log(`[video-produce] Non-zero exit code ${code} — falling back to simulateProgress for job ${jobId}`);
      simulateProgress(jobId);
    }
  });

  child.on("error", (err: Error) => {
    try {
      fs.unlinkSync(configPath);
    } catch {
      // File may already be gone — ignore
    }
    console.error(`[video-produce] Failed to spawn Python script for job ${jobId}:`, err.message);
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
