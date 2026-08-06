"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type AssetStatus = "pending" | "approved" | "rejected";

export type ImageAsset = {
  id: string;
  format: string;
  label: string;
  src: string;
};

export type AudioAsset = {
  id: string;
  label: string;
  src: string;
};

export type MusicTrack = {
  label: string;
  src: string;
};

interface Props {
  campaignId: string;
  service: string;
  images: ImageAsset[];
  voiceovers: AudioAsset[];
  musicTracks: MusicTrack[];
  videoSrc: string | null;
}

const STATUS_CLASSES: Record<AssetStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

export default function AssetApprovalPanel({
  campaignId,
  service,
  images,
  voiceovers,
  musicTracks,
}: Props) {
  const router = useRouter();
  const t = useTranslations('assetApproval');

  const [imageStatuses, setImageStatuses] = useState<Record<string, AssetStatus>>(
    Object.fromEntries(images.map((img) => [img.id, "pending" as AssetStatus]))
  );
  const [voiceoverStatuses, setVoiceoverStatuses] = useState<Record<string, AssetStatus>>(
    Object.fromEntries(voiceovers.map((vo) => [vo.id, "pending" as AssetStatus]))
  );
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [produceError, setProduceError] = useState<string | null>(null);

  const approvedImages = images.filter((img) => imageStatuses[img.id] === "approved").length;
  const approvedVoiceovers = voiceovers.filter((vo) => voiceoverStatuses[vo.id] === "approved").length;
  const approvedCount = approvedImages + approvedVoiceovers;
  const totalCount = images.length + voiceovers.length;
  const allImagesApproved = images.length > 0 && images.every((img) => imageStatuses[img.id] === "approved");
  const allVoiceoversApproved = voiceovers.length === 0 || voiceovers.every((vo) => voiceoverStatuses[vo.id] === "approved");
  const canProduce = allImagesApproved && allVoiceoversApproved && !isSubmitting;

  async function handleProduksjon() {
    setProduceError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/content/produce/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, service }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Unknown error");
      }
      const data = await res.json() as { jobId: string };
      router.push(`/dashboard/${data.jobId}`);
    } catch (e) {
      setProduceError((e as Error).message);
      setIsSubmitting(false);
    }
  }

  async function handleRegenerate(id: string, type: "image" | "voiceover") {
    setRegenerating((r) => ({ ...r, [id]: true }));
    await new Promise((resolve) => setTimeout(resolve, 1800));
    setRegenerating((r) => ({ ...r, [id]: false }));
    if (type === "image") {
      setImageStatuses((s) => ({ ...s, [id]: "pending" }));
    } else {
      setVoiceoverStatuses((s) => ({ ...s, [id]: "pending" }));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Approval progress bar */}
      <div className="rounded-xl border border-gray-200 bg-[var(--paper-raised)] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">{t('approvalStatus')}</span>
          <span className="text-sm text-gray-500">
            {t('approvedOf', { count: approvedCount, total: totalCount })}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-2 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${totalCount > 0 ? (approvedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Images */}
      {images.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            {t('imagesSection')}
            <SectionBadge
              allApproved={allImagesApproved}
              count={approvedImages}
              total={images.length}
              labelAllApproved={t('allApproved')}
            />
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img) => (
              <ImageCard
                key={img.id}
                asset={img}
                status={imageStatuses[img.id]}
                regenerating={!!regenerating[img.id]}
                onApprove={() =>
                  setImageStatuses((s) => ({ ...s, [img.id]: "approved" }))
                }
                onReject={() =>
                  setImageStatuses((s) => ({ ...s, [img.id]: "rejected" }))
                }
                onRegenerate={() => handleRegenerate(img.id, "image")}
                labels={{
                  approve: t('approve'),
                  reject: t('reject'),
                  regenerate: t('regenerate'),
                  regenerating: t('regenerating'),
                  preview: t('preview'),
                  download: t('download'),
                  statusApproved: t('statusApproved'),
                  statusRejected: t('statusRejected'),
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Voiceover */}
      {voiceovers.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            {t('voiceoverSection')}
            <SectionBadge
              allApproved={allVoiceoversApproved}
              count={approvedVoiceovers}
              total={voiceovers.length}
              labelAllApproved={t('allApproved')}
            />
          </h3>
          <div className="flex flex-col gap-3">
            {voiceovers.map((vo) => (
              <VoiceoverCard
                key={vo.id}
                asset={vo}
                status={voiceoverStatuses[vo.id]}
                regenerating={!!regenerating[vo.id]}
                onApprove={() =>
                  setVoiceoverStatuses((s) => ({ ...s, [vo.id]: "approved" }))
                }
                onReject={() =>
                  setVoiceoverStatuses((s) => ({ ...s, [vo.id]: "rejected" }))
                }
                onRegenerate={() => handleRegenerate(vo.id, "voiceover")}
                labels={{
                  approve: t('approve'),
                  reject: t('reject'),
                  regenerate: t('regenerate'),
                  regeneratingVoiceover: t('regeneratingVoiceover'),
                  statusApproved: t('statusApproved'),
                  statusRejected: t('statusRejected'),
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Musikk */}
      {musicTracks.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-4">{t('musicSection')}</h3>
          <div className="rounded-xl border border-gray-200 bg-[var(--paper-raised)] p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 text-purple-500"
                >
                  <path d="M18 3a1 1 0 0 0-1.196-.98l-10 2A1 1 0 0 0 6 5v6.499c-.313-.076-.637-.118-.969-.13A3.531 3.531 0 0 0 2 14.969 3.533 3.533 0 0 0 5.031 18 3.533 3.533 0 0 0 8 14.969V7.82l8-1.6v5.28c-.313-.076-.637-.118-.969-.13A3.531 3.531 0 0 0 12 14.969 3.533 3.533 0 0 0 15.031 18 3.533 3.533 0 0 0 18 14.969V3Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {musicTracks[activeTrackIndex].label}
                </p>
                <p className="text-xs text-gray-500">
                  {t('trackOf', { current: activeTrackIndex + 1, total: musicTracks.length })}
                </p>
              </div>
            </div>
            <audio
              key={musicTracks[activeTrackIndex].src}
              controls
              className="w-full h-10 mb-3"
              src={musicTracks[activeTrackIndex].src}
            />
            <div className="flex gap-2 flex-wrap">
              {musicTracks.length > 1
                ? musicTracks.map((track, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveTrackIndex(i)}
                      className={`text-xs rounded-full px-3 py-1.5 font-medium border transition-colors ${
                        i === activeTrackIndex
                          ? "bg-green-600 border-green-600 text-white"
                          : "border-gray-300 text-gray-600 hover:border-gray-400 bg-[var(--paper-raised)]"
                      }`}
                    >
                      {track.label}
                    </button>
                  ))
                : null}
              <button
                type="button"
                className="text-xs rounded-full px-3 py-1.5 font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 bg-[var(--paper-raised)] transition-colors"
              >
                {t('changeMusic')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Bottom actions */}
      <div className="rounded-xl border border-gray-200 bg-[var(--paper-raised)] p-5 shadow-sm">
        {produceError && (
          <p className="text-sm text-red-600 mb-3">{produceError}</p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canProduce}
            onClick={handleProduksjon}
            title={
              !canProduce && !isSubmitting
                ? t('titleTooltip', { count: approvedCount, total: totalCount })
                : undefined
            }
            className={`rounded-full px-8 py-2.5 text-sm font-semibold transition-colors ${
              canProduce
                ? "bg-green-600 hover:bg-green-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
            }`}
          >
            {isSubmitting
              ? t('starting')
              : canProduce
                ? t('startProduction')
                : t('startProductionWithCount', { count: approvedCount, total: totalCount })}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionBadge({
  allApproved,
  count,
  total,
  labelAllApproved,
}: {
  allApproved: boolean;
  count: number;
  total: number;
  labelAllApproved: string;
}) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        allApproved
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {allApproved ? labelAllApproved : `${count}/${total}`}
    </span>
  );
}

const ASPECT_MAP: Record<string, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
};

function ImageCard({
  asset,
  status,
  regenerating,
  onApprove,
  onReject,
  onRegenerate,
  labels,
}: {
  asset: ImageAsset;
  status: AssetStatus;
  regenerating: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  labels: { approve: string; reject: string; regenerate: string; regenerating: string; preview: string; download: string; statusApproved: string; statusRejected: string };
}) {
  const statusLabel = status === "approved" ? labels.statusApproved : labels.statusRejected;
  return (
    <div
      className={`rounded-xl border-2 bg-[var(--paper-raised)] overflow-hidden shadow-sm transition-colors ${
        status === "approved"
          ? "border-green-400"
          : status === "rejected"
            ? "border-red-300"
            : "border-gray-200"
      }`}
    >
      {/* Thumbnail */}
      <div
        className={`${ASPECT_MAP[asset.format] ?? "aspect-video"} relative overflow-hidden bg-gray-100`}
      >
        {regenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-50">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-500">{labels.regenerating}</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.src}
            alt={asset.label}
            className="w-full h-full object-cover"
          />
        )}
        {status !== "pending" && !regenerating && (
          <div
            className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[status]}`}
          >
            {statusLabel}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-900">{asset.label}</p>
          <span className="text-xs text-gray-400">{asset.format}</span>
        </div>

        <div className="flex gap-1.5 mb-1.5">
          <button
            type="button"
            disabled={regenerating || status === "approved"}
            onClick={onApprove}
            className={`flex-1 text-xs rounded-full py-1.5 font-medium border transition-colors disabled:opacity-50 ${
              status === "approved"
                ? "bg-green-100 border-green-300 text-green-700"
                : "border-green-300 text-green-700 hover:bg-green-50 bg-[var(--paper-raised)]"
            }`}
          >
            {labels.approve}
          </button>
          <button
            type="button"
            disabled={regenerating}
            onClick={onReject}
            className={`flex-1 text-xs rounded-full py-1.5 font-medium border transition-colors disabled:opacity-50 ${
              status === "rejected"
                ? "bg-red-100 border-red-300 text-red-600"
                : "border-red-200 text-red-600 hover:bg-red-50 bg-[var(--paper-raised)]"
            }`}
          >
            {labels.reject}
          </button>
          <button
            type="button"
            disabled={regenerating}
            onClick={onRegenerate}
            className="flex-1 text-xs rounded-full py-1.5 font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 bg-[var(--paper-raised)] transition-colors disabled:opacity-50"
          >
            {regenerating ? "..." : labels.regenerate}
          </button>
        </div>

        <div className="flex gap-1.5">
          <a
            href={asset.src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs rounded-full py-1.5 font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 bg-[var(--paper-raised)] transition-colors"
          >
            {labels.preview}
          </a>
          <a
            href={asset.src}
            download
            className="flex-1 text-center text-xs rounded-full py-1.5 font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 bg-[var(--paper-raised)] transition-colors"
          >
            {labels.download}
          </a>
        </div>
      </div>
    </div>
  );
}

function VoiceoverCard({
  asset,
  status,
  regenerating,
  onApprove,
  onReject,
  onRegenerate,
  labels,
}: {
  asset: AudioAsset;
  status: AssetStatus;
  regenerating: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  labels: { approve: string; reject: string; regenerate: string; regeneratingVoiceover: string; statusApproved: string; statusRejected: string };
}) {
  const statusLabel = status === "approved" ? labels.statusApproved : labels.statusRejected;
  return (
    <div
      className={`rounded-xl border-2 bg-[var(--paper-raised)] p-4 shadow-sm transition-colors ${
        status === "approved"
          ? "border-green-400"
          : status === "rejected"
            ? "border-red-300"
            : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 text-blue-500"
          >
            <path d="M7 4a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V4Z" />
            <path d="M5.5 9.643a.75.75 0 0 0-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.546A6.001 6.001 0 0 0 16 10v-.357a.75.75 0 0 0-1.5 0V10a4.5 4.5 0 0 1-9 0v-.357Z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{asset.label}</p>
        </div>
        {status !== "pending" && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CLASSES[status]}`}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {regenerating ? (
        <div className="flex items-center gap-2 py-3 mb-3">
          <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-gray-500">{labels.regeneratingVoiceover}</p>
        </div>
      ) : (
        <audio
          controls
          className="w-full h-10 mb-3"
          src={asset.src}
        />
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={regenerating || status === "approved"}
          onClick={onApprove}
          className={`flex-1 text-xs rounded-full py-1.5 font-medium border transition-colors disabled:opacity-50 ${
            status === "approved"
              ? "bg-green-100 border-green-300 text-green-700"
              : "border-green-300 text-green-700 hover:bg-green-50 bg-[var(--paper-raised)]"
          }`}
        >
          {labels.approve}
        </button>
        <button
          type="button"
          disabled={regenerating}
          onClick={onReject}
          className={`flex-1 text-xs rounded-full py-1.5 font-medium border transition-colors disabled:opacity-50 ${
            status === "rejected"
              ? "bg-red-100 border-red-300 text-red-600"
              : "border-red-200 text-red-600 hover:bg-red-50 bg-[var(--paper-raised)]"
          }`}
        >
          {labels.reject}
        </button>
        <button
          type="button"
          disabled={regenerating}
          onClick={onRegenerate}
          className="flex-1 text-xs rounded-full py-1.5 font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 bg-[var(--paper-raised)] transition-colors disabled:opacity-50"
        >
          {regenerating ? "..." : labels.regenerate}
        </button>
      </div>
    </div>
  );
}
