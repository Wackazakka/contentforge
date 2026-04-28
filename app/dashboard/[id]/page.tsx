import { notFound } from "next/navigation";
import Link from "next/link";
import {
  DEMO_CAMPAIGNS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/campaigns";

const ASSET_VARIANTS = [
  { key: "video_vo_music", label: "Video + Voiceover + Musikk", icon: "🎬" },
  { key: "video_music", label: "Video + Musikk", icon: "🎵" },
  { key: "image", label: "Stillbilde", icon: "🖼️" },
  { key: "captioned", label: "Video med teksting", icon: "📝" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = DEMO_CAMPAIGNS.find((c) => c.id === id);

  if (!campaign) notFound();

  const isCompleted = campaign.status === "completed";

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors"
        >
          ← Tilbake
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{campaign.name}</h1>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[campaign.status]}`}
        >
          {STATUS_LABELS[campaign.status]}
        </span>
      </div>

      {/* Meta */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <MetaRow label="Produkt" value={campaign.productName} />
          <MetaRow label="Tjeneste" value={campaign.service} />
          <MetaRow label="Headline" value={campaign.headline} />
          <MetaRow label="CTA" value={campaign.cta} />
          <MetaRow label="Tone" value={campaign.tone} />
          <MetaRow label="Formater" value={campaign.formats.join(", ")} />
          <MetaRow
            label="Voiceover"
            value={campaign.voiceover ? "Ja" : "Nei"}
          />
          <MetaRow label="Musikk" value={campaign.music ? campaign.musicStyle : "Nei"} />
          <MetaRow
            label="Opprettet"
            value={formatDate(campaign.createdAt)}
          />
        </div>
        <div className="mt-4 p-3 rounded-lg bg-gray-100 text-sm text-gray-700 italic">
          &ldquo;{campaign.bodyCopy}&rdquo;
        </div>
      </div>

      {/* Assets */}
      <h2 className="font-semibold text-gray-900 mb-4">Assets</h2>

      {!isCompleted ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 flex flex-col items-center text-center bg-white">
          <div className="text-4xl mb-4">
            {campaign.status === "processing" ? "⚙️" : "⏳"}
          </div>
          <p className="text-gray-500 text-sm">
            {campaign.status === "processing"
              ? "AI-pipeline kjører. Assets vil vises her når de er klare."
              : "Starter produksjon..."}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaign.formats.flatMap((format) =>
            ASSET_VARIANTS.map((variant) => (
              <AssetCard
                key={`${format}-${variant.key}`}
                format={format}
                variant={variant}
              />
            ))
          )}
        </div>
      )}

      {/* Approval workflow */}
      {isCompleted && (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Godkjenningsflyt</h2>
          <div className="flex flex-col gap-3">
            {[
              { step: "Generering", status: "done", note: "12 assets produsert" },
              {
                step: "Gjennomgang",
                status: "pending",
                note: "Venter på godkjenning",
              },
              {
                step: "Publisering",
                status: "locked",
                note: "Låst til godkjenning er fullført",
              },
            ].map((s) => (
              <div
                key={s.step}
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  s.status === "done"
                    ? "border-emerald-200 bg-emerald-50"
                    : s.status === "pending"
                      ? "border-yellow-200 bg-yellow-50"
                      : "border-gray-200 bg-gray-50 opacity-60"
                }`}
              >
                <span className="text-xl">
                  {s.status === "done"
                    ? "✅"
                    : s.status === "pending"
                      ? "⏳"
                      : "🔒"}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{s.step}</p>
                  <p className="text-xs text-gray-500">{s.note}</p>
                </div>
                {s.status === "pending" && (
                  <button className="ml-auto rounded-full bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-4 py-1.5 transition-colors">
                    Godkjenn
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 font-semibold">{label}: </span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function AssetCard({
  format,
  variant,
}: {
  format: string;
  variant: { key: string; label: string; icon: string };
}) {
  const aspectMap: Record<string, string> = {
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
    "1:1": "aspect-square",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div
        className={`${aspectMap[format] ?? "aspect-video"} bg-gray-100 flex items-center justify-center text-4xl`}
      >
        {variant.icon}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-gray-900">
          {format} — {variant.label}
        </p>
        <div className="mt-2 flex gap-2">
          <button className="flex-1 text-xs rounded-full border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 transition-colors">
            Last ned
          </button>
          <button className="flex-1 text-xs rounded-full border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 transition-colors">
            Forhåndsvis
          </button>
        </div>
      </div>
    </div>
  );
}
