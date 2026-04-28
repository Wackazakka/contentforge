import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DROPLET_VIDEO_BASE = "http://139.59.212.218:3001/videos";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  // Sanitise: only allow UUID-shaped jobIds to prevent path traversal
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return new Response("Invalid jobId", { status: 400 });
  }

  return NextResponse.redirect(`${DROPLET_VIDEO_BASE}/${jobId}.mp4`);
}
