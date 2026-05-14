import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  DEMO_CAMPAIGNS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/campaigns";
import AssetApprovalPanel, {
  type ImageAsset,
  type AudioAsset,
  type MusicTrack,
} from "./AssetApprovalPanel";
import JobProgressPanel from "./JobProgressPanel";

// Matches crypto.randomUUID() output
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_BY_FORMAT: Record<string, string> = {
  "16:9": "/demo/images/banner_social.png",
  "9:16": "/demo/images/bg_process.png",
  "1:1": "/demo/images/profile_pic_square.png",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
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
  const t = await getTranslations('campaignDetail');
  const campaign = DEMO_CAMPAIGNS.find((c) => c.id === id);

  if (!campaign) {
    // If the ID looks like a job UUID, show the job progress view
    if (!UUID_RE.test(id)) notFound();

    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-900 text-sm transition-colors"
          >
            {t('back')}
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">{t('jobTitle')}</h1>
        </div>
        <JobProgressPanel jobId={id} />
      </div>
    );
  }

  const isCompleted = campaign.status === "completed";

  // Build asset lists for the approval panel
  const images: ImageAsset[] = campaign.formats.map((format, i) => ({
    id: `img-${format}-${i}`,
    format,
    label: t('imageVariant', { index: i + 1 }),
    src: IMAGE_BY_FORMAT[format] ?? "/demo/images/banner_social.png",
  }));

  const voiceovers: AudioAsset[] = campaign.voiceover
    ? [
        { id: "vo-1", label: "Voiceover variant A", src: "/demo/vo/s1.mp3" },
        { id: "vo-2", label: "Voiceover variant B", src: "/demo/vo/s2.mp3" },
        { id: "vo-3", label: "Voiceover variant C", src: "/demo/vo/s3.mp3" },
      ]
    : [];

  const musicTracks: MusicTrack[] = campaign.music
    ? [
        {
          label: `${campaign.musicStyle.charAt(0).toUpperCase() + campaign.musicStyle.slice(1)} — Background music`,
          src: "/demo/music/background_music.mp3",
        },
      ]
    : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors"
        >
          {t('back')}
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
          <MetaRow label={t('metaProduct')} value={campaign.productName} />
          <MetaRow label={t('metaService')} value={campaign.service} />
          <MetaRow label={t('metaHeadline')} value={campaign.headline} />
          <MetaRow label={t('metaCta')} value={campaign.cta} />
          <MetaRow label={t('metaTone')} value={campaign.tone} />
          <MetaRow label={t('metaFormats')} value={campaign.formats.join(", ")} />
          <MetaRow
            label={t('metaVoiceover')}
            value={campaign.voiceover ? t('metaVoiceoverYes') : t('metaVoiceoverNo')}
          />
          <MetaRow
            label={t('metaMusic')}
            value={campaign.music ? campaign.musicStyle : t('metaMusicNo')}
          />
          <MetaRow label={t('metaCreated')} value={formatDate(campaign.createdAt)} />
        </div>
        <div className="mt-4 p-3 rounded-lg bg-gray-100 text-sm text-gray-700 italic">
          &ldquo;{campaign.bodyCopy}&rdquo;
        </div>
      </div>

      {/* Assets + approval */}
      <h2 className="font-semibold text-gray-900 mb-4">{t('assetsTitle')}</h2>

      {!isCompleted ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 flex flex-col items-center text-center bg-white">
          <div className="text-4xl mb-4">
            {campaign.status === "processing" ? "⚙️" : "⏳"}
          </div>
          <p className="text-gray-500 text-sm">
            {campaign.status === "processing"
              ? t('processingMsg')
              : t('pendingMsg')}
          </p>
        </div>
      ) : (
        <AssetApprovalPanel
          campaignId={campaign.id}
          service={campaign.service}
          images={images}
          voiceovers={voiceovers}
          musicTracks={musicTracks}
          videoSrc={null}
        />
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
