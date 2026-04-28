import fs from "fs";
import { HISTORY_PATH, OUTPUT_DIR } from "./output";

export type HistoryStatus = "pending" | "processing" | "done" | "failed";

export interface HistoryEntry {
  jobId: string;
  campaignId: string;
  service: string;
  status: HistoryStatus;
  /** Absolute download URL (e.g. /api/content/download?jobId=…) or null while in-flight */
  downloadUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

function ensureDir(): void {
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch {
    // ignore — dir already exists or we're in a read-only environment
  }
}

export function readHistory(): HistoryEntry[] {
  try {
    ensureDir();
    const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  try {
    ensureDir();
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(entries, null, 2), "utf-8");
  } catch {
    // In read-only / serverless environments writes are a no-op
  }
}

/** Insert a new entry at the top (newest first). */
export function addHistoryEntry(entry: HistoryEntry): void {
  const entries = readHistory();
  entries.unshift(entry);
  writeHistory(entries);
}

/** Update fields on an existing entry by jobId. */
export function updateHistoryEntry(
  jobId: string,
  updates: Partial<HistoryEntry>
): void {
  const entries = readHistory();
  const idx = entries.findIndex((e) => e.jobId === jobId);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates };
    writeHistory(entries);
  }
}
