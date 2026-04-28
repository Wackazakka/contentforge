import path from "path";

/**
 * Root directory for all ContentForge output artefacts.
 * Override via CF_OUTPUT_DIR env var in production.
 * Default matches the spec: /root/.openclaw/workspace/contentforge-output
 */
export const OUTPUT_DIR =
  process.env.CF_OUTPUT_DIR ??
  "/root/.openclaw/workspace/contentforge-output";

/** Absolute path for a completed job's MP4 file. */
export function videoPath(jobId: string): string {
  return path.join(OUTPUT_DIR, `${jobId}.mp4`);
}

/** Absolute path for the persistent campaign-history JSON file. */
export const HISTORY_PATH = path.join(OUTPUT_DIR, "campaigns.json");
