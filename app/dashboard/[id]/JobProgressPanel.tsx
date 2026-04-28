"use client";

import { useState, useEffect, useRef } from "react";

type JobStatus = "pending" | "processing" | "done" | "failed";

interface Props {
  jobId: string;
}

const POLL_INTERVAL_MS = 5000;

const STATUS_MESSAGES: Record<JobStatus, string> = {
  pending: "Starter opp pipeline...",
  processing: "AI-pipeline kjører...",
  done: "Video er klar!",
  failed: "Produksjon feilet",
};

export default function JobProgressPanel({ jobId }: Props) {
  const [status, setStatus] = useState<JobStatus>("pending");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/content/produce/status?jobId=${jobId}`);
        if (!res.ok) return;
        const data = await res.json() as {
          status: JobStatus;
          progress: number;
          videoUrl: string | null;
        };
        setProgress(data.progress);
        setStatus(data.status);
        if (data.status === "done") {
          console.log('Video produksjon ferdig. VideoUrl:', data.videoUrl);
          setVideoUrl(data.videoUrl);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // network hiccup — keep polling
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  const isDone = status === "done";
  const isFailed = status === "failed";
  const isActive = status === "pending" || status === "processing";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Videoproduksjon</h2>
        {isDone && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            Fullført
          </span>
        )}
        {isFailed && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-600">
            Feilet
          </span>
        )}
        {isActive && (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
            <span className="w-2.5 h-2.5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            Produserer
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-gray-600">{STATUS_MESSAGES[status]}</span>
          <span className="text-sm font-medium text-gray-700">{progress}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${isFailed ? "bg-red-400" : "bg-green-500"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {isActive && (
        <p className="text-xs text-gray-400 mb-6">
          Sjekker status hvert 5. sekund...
        </p>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 mt-4">
          <p className="text-sm font-medium text-red-700">Videoproduksjon feilet.</p>
          <p className="text-sm text-red-600 mt-1">
            Gå tilbake til kampanjesiden og prøv å starte produksjon på nytt.
          </p>
        </div>
      )}

      {/* Done state + download */}
      {isDone && videoUrl && (
        <div className="flex gap-3 mt-4">
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-sm rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2.5 font-medium transition-colors"
          >
            Forhåndsvis
          </a>
          <a
            href={videoUrl}
            download
            className="flex-1 text-center text-sm rounded-full border border-green-300 bg-green-50 hover:bg-green-100 text-green-700 py-2.5 font-semibold transition-colors"
          >
            Last ned video
          </a>
        </div>
      )}
    </div>
  );
}
