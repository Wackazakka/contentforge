import Link from "next/link";
import { DEMO_CAMPAIGNS, STATUS_LABELS, STATUS_COLORS } from "@/lib/campaigns";
import { readHistory, type HistoryEntry } from "@/lib/jobHistory";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HISTORY_STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  pending: "Venter",
  processing: "Produserer...",
  done: "Fullført",
  failed: "Feil",
};

const HISTORY_STATUS_COLOR: Record<HistoryEntry["status"], string> = {
  pending: "text-gray-600 bg-gray-100",
  processing: "text-yellow-700 bg-yellow-100",
  done: "text-green-700 bg-green-100",
  failed: "text-red-700 bg-red-100",
};

export default function DashboardPage() {
  const campaigns = DEMO_CAMPAIGNS;
  const history = readHistory();

  const completedHistory = history.filter((e) => e.status === "done").length;
  const processingHistory = history.filter(
    (e) => e.status === "processing" || e.status === "pending"
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kampanjer</h1>
          <p className="text-gray-500 text-sm mt-1">
            {campaigns.length} kampanje{campaigns.length !== 1 ? "r" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="rounded-full bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-5 py-2 transition-colors"
        >
          + Ny kampanje
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-20 flex flex-col items-center text-center bg-white">
          <div className="text-4xl mb-4">🎬</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Ingen kampanjer ennå
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Opprett din første kampanje for å starte innholdsproduksjonen.
          </p>
          <Link
            href="/dashboard/new"
            className="rounded-full bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-6 py-2.5 transition-colors"
          >
            Opprett kampanje
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/${c.id}`}
              className="rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 p-5 flex items-center justify-between transition-colors group shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center text-lg">
                  🎬
                </div>
                <div>
                  <p className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                    {c.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {c.productName} · {c.formats.join(", ")} ·{" "}
                    {formatDate(c.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[c.status]}`}
                >
                  {STATUS_LABELS[c.status]}
                </span>
                <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mt-10 grid sm:grid-cols-3 gap-4">
        {[
          { label: "Kampanjer totalt", value: campaigns.length },
          {
            label: "Fullført",
            value: campaigns.filter((c) => c.status === "completed").length,
          },
          {
            label: "Under produksjon",
            value: campaigns.filter((c) => c.status === "processing").length,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Production history */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Produksjonshistorikk
          </h2>
          <span className="text-sm text-gray-500">
            {history.length} jobb{history.length !== 1 ? "er" : ""}
            {completedHistory > 0 && ` · ${completedHistory} fullført`}
            {processingHistory > 0 && ` · ${processingHistory} pågår`}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-10 flex flex-col items-center text-center bg-white">
            <p className="text-gray-400 text-sm">
              Ingen produksjonsjobber ennå. Start produksjon fra en kampanje.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((entry) => (
              <div
                key={entry.jobId}
                className="rounded-2xl border border-gray-200 bg-white p-5 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg flex-shrink-0">
                    {entry.status === "done"
                      ? "✅"
                      : entry.status === "failed"
                        ? "❌"
                        : "⚙️"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {entry.campaignId} · {entry.service}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">
                      {entry.jobId}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Startet {formatDateTime(entry.createdAt)}
                      {entry.completedAt &&
                        ` · Fullført ${formatDateTime(entry.completedAt)}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${HISTORY_STATUS_COLOR[entry.status]}`}
                  >
                    {HISTORY_STATUS_LABEL[entry.status]}
                  </span>

                  {entry.status === "done" && entry.downloadUrl && (
                    <a
                      href={entry.downloadUrl}
                      download
                      className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-500 text-white transition-colors"
                    >
                      Last ned
                    </a>
                  )}

                  <Link
                    href={`/dashboard/${entry.jobId}`}
                    className="text-gray-400 hover:text-gray-700 transition-colors text-sm"
                  >
                    →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
