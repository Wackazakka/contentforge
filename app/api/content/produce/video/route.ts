import { type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
  const { campaignId, service, productId, headline, bodyCopy, voiceId, cta, segments, formats, tone, musicFile } =
    body as {
      campaignId?: string;
      service?: string;
      productId?: string;
      headline?: string;
      bodyCopy?: string;
      voiceId?: string;
      cta?: string;
      segments?: Segment[];
      formats?: string[];
      tone?: string;
      musicFile?: string;
    };

  if (!campaignId || !service) {
    return Response.json(
      { error: "Missing campaignId or service" },
      { status: 400 }
    );
  }

  const job = createJob(campaignId, service, productId);

  addHistoryEntry({
    jobId: job.id,
    campaignId,
    service,
    status: "pending",
    downloadUrl: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });

  // Insert job into production_jobs table
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );

    const campaignName = headline || bodyCopy?.substring(0, 50) || campaignId;
    
    await supabase
      .from("production_jobs")
      .insert({
        id: job.id,
        product_id: productId || null,
        campaign_id: campaignId,
        title: campaignName,
        status: "queued",
        content_type: "video",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    console.log(`[video-produce] Job ${job.id} inserted into production_jobs with product_id: ${productId}`);
  } catch (dbErr) {
    console.error(`[video-produce] Failed to insert job into production_jobs:`, dbErr);
    // Don't fail the whole request if DB insert fails - continue with droplet queue
  }

  try {
    const res = await fetch(DROPLET_JOB_QUEUE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        campaignId,
        productId,
        service,
        headline,
        bodyCopy,
        voiceId,
        cta,
        tone: tone || 'professional',
        video_format: formats ? formats.join(',') : '9:16', // Default to 9:16 if not specified
        musicFile,
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
