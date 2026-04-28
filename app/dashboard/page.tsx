import Link from "next/link";
import { DEMO_CAMPAIGNS, STATUS_LABELS, STATUS_COLORS } from "@/lib/campaigns";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const campaigns = DEMO_CAMPAIGNS;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Kampanjer</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {campaigns.length} kampanje{campaigns.length !== 1 ? "r" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-5 py-2 transition-colors"
        >
          + Ny kampanje
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-20 flex flex-col items-center text-center">
          <div className="text-4xl mb-4">🎬</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            Ingen kampanjer ennå
          </h2>
          <p className="text-zinc-500 text-sm mb-6">
            Opprett din første kampanje for å starte innholdsproduksjonen.
          </p>
          <Link
            href="/dashboard/new"
            className="rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-6 py-2.5 transition-colors"
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
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 p-5 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-lg">
                  🎬
                </div>
                <div>
                  <p className="font-semibold text-white group-hover:text-violet-300 transition-colors">
                    {c.name}
                  </p>
                  <p className="text-sm text-zinc-500">
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
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
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
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"
          >
            <p className="text-3xl font-bold text-white">{s.value}</p>
            <p className="text-sm text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
