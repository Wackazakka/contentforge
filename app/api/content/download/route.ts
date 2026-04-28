import { type NextRequest } from "next/server";
import fs from "fs";
import { videoPath } from "@/lib/output";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  // Sanitise: only allow UUID-shaped jobIds to prevent path traversal
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return new Response("Invalid jobId", { status: 400 });
  }

  const filePath = videoPath(jobId);

  if (!fs.existsSync(filePath)) {
    return new Response("Video not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);

  return new Response(buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="video-${jobId}.mp4"`,
      "Content-Length": String(buffer.length),
    },
  });
}
